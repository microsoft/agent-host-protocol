import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  AhpClient,
  AhpStateMirror,
  InMemoryTransport,
  RpcError,
  TransportError,
  UnsupportedCapabilityError,
  type AhpTransport,
} from '../src/client/index.js';
import { MultiHostStateMirror } from '../src/client/hosts/index.js';
import {
  AuthFlowKind,
  BrokeredAuthenticationBindingKind,
  type AuthBeginParams,
  type AuthenticationCapability,
} from '../src/types/channels-accounts/commands.js';
import {
  AccountConsumerKind,
  AuthAttemptStatus,
  type AgentAccountConsumer,
  type AccountsState,
  type AuthAttemptState,
  type HostAccount,
} from '../src/types/channels-accounts/state.js';
import { accountsReducer } from '../src/types/channels-accounts/reducer.js';
import { ActionType, type ActionEnvelope } from '../src/types/common/actions.js';
import type { AccountsAction } from '../src/types/action-origin.generated.js';
import type { AuthenticateParams } from '../src/types/common/commands.js';
import type { JsonRpcRequest } from '../src/types/common/messages.js';

const ACCOUNTS = 'ahp-accounts://' as const;
const ROOT = 'ahp-root://' as const;
const consumer: AgentAccountConsumer = {
  kind: AccountConsumerKind.Agent,
  provider: 'copilot',
  resource: 'https://api.example.test',
};
const account: HostAccount = {
  id: 'account-1', label: 'Example', removable: true, consumers: [consumer],
};
const pending: AuthAttemptState = {
  id: 'attempt-1', status: AuthAttemptStatus.Pending, consumer, resource: consumer.resource,
};
const capability: AuthenticationCapability = {
  flows: [{ kind: AuthFlowKind.ClientBrokered }],
};
const beginParams: Omit<AuthBeginParams, 'channel'> = {
  target: { consumer }, flows: capability.flows, accountId: account.id,
};

async function readRequest(server: AhpTransport): Promise<JsonRpcRequest> {
  const frame = await server.recv();
  assert.ok(frame && frame.kind === 'text');
  return JSON.parse(frame.text) as JsonRpcRequest;
}

async function reply(server: AhpTransport, id: number, result: unknown): Promise<void> {
  await server.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
}

async function initialize(
  client: AhpClient,
  server: AhpTransport,
  authentication: AuthenticationCapability | undefined,
): Promise<void> {
  const result = client.initialize({ clientId: 'client-1', protocolVersions: ['0.9.0'] });
  const request = await readRequest(server);
  assert.equal(request.method, 'initialize');
  await reply(server, request.id, { protocolVersion: '0.9.0', serverSeq: 0, snapshots: [], authentication });
  await result;
}

test('accounts reducer runs the shared accounts fixtures through the generated client mirror', () => {
  const dir = new URL('../../../types/test-cases/reducers/', import.meta.url);
  const fixtures = readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as {
      description: string; reducer: string; initial: AccountsState; actions: AccountsAction[]; expected: AccountsState;
    })
    .filter(fixture => fixture.reducer === 'accounts');
  assert.ok(fixtures.length > 0, 'expected shared accounts reducer fixtures');
  for (const fixture of fixtures) {
    const actual = fixture.actions.reduce(accountsReducer, fixture.initial);
    assert.deepEqual(actual, fixture.expected, fixture.description);
  }
});

test('accounts snapshots and attempts are isolated from root and across hosts', () => {
  const mirror = new AhpStateMirror();
  const hosted = new MultiHostStateMirror();
  const state: AccountsState = { accounts: [account], attempts: [pending] };
  const snapshot = { resource: ACCOUNTS, state, fromSeq: 0 };
  assert.deepEqual(mirror.accounts, { accounts: [], attempts: [] });
  mirror.applySnapshot(snapshot);
  hosted.applySnapshot('host-a', snapshot);
  hosted.applySnapshot('host-b', snapshot);

  const completed: AuthAttemptState = {
    ...pending, status: AuthAttemptStatus.Completed, accountId: account.id,
  };
  const complete: ActionEnvelope = {
    channel: ACCOUNTS, serverSeq: 1, origin: undefined,
    action: { type: ActionType.AuthAttemptSet, attempt: completed },
  };
  mirror.apply(complete);
  hosted.applyEnvelope('host-a', complete);
  assert.deepEqual(mirror.accounts.attempts, [completed]);
  assert.deepEqual(hosted.getAccounts('host-a')?.attempts, [completed]);
  assert.deepEqual(hosted.getAccounts('host-b')?.attempts, [pending]);
  assert.deepEqual(mirror.root, { agents: [] });

  const update: ActionEnvelope = {
    channel: ACCOUNTS, serverSeq: 2, origin: undefined,
    action: { type: ActionType.AccountSet, account: { ...account, label: 'Updated', consumers: [] } },
  };
  mirror.apply(update);
  assert.deepEqual(mirror.accounts.accounts, [{ ...account, label: 'Updated', consumers: [] }]);
  assert.deepEqual(mirror.accounts.attempts, [completed]);

  mirror.apply({ ...update, channel: 'ahp-accounts://not-the-singleton' });
  assert.equal(mirror.accounts.accounts.length, 1);
  hosted.resetHost('host-a');
  assert.equal(hosted.getAccounts('host-a'), undefined);
  assert.equal(hosted.accountsStates.size, 1);
  hosted.reset();
  assert.equal(hosted.accountsStates.size, 0);
});

test('accounts subscription forwards and reconciles rejected key-only removals', async t => {
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  await initialize(client, server, capability);

  const subscribe = client.subscribe(ACCOUNTS);
  const request = await readRequest(server);
  assert.deepEqual(request.params, { channel: ACCOUNTS });
  const snapshot = { resource: ACCOUNTS, state: { accounts: [account], attempts: [pending] }, fromSeq: 1 };
  await reply(server, request.id, { snapshot });
  const { result, subscription } = await subscribe;
  assert.ok(result.snapshot);
  const mirror = new AhpStateMirror();
  const hosted = new MultiHostStateMirror();
  mirror.applySnapshot(result.snapshot);
  hosted.applySnapshot('host', result.snapshot);
  const allEvents = client.events();

  for (const action of [
    { type: ActionType.AccountRemoved, id: account.id },
    { type: ActionType.AuthAttemptRemoved, id: pending.id },
  ] satisfies AccountsAction[]) {
    const handle = client.dispatch(ACCOUNTS, action);
    const dispatch = await readRequest(server);
    assert.equal(dispatch.method, 'dispatchAction');
    assert.deepEqual(dispatch.params, { channel: ACCOUNTS, action, clientSeq: handle.clientSeq });
    const rejected: ActionEnvelope = {
      channel: ACCOUNTS, action, serverSeq: handle.clientSeq + 1,
      origin: { clientId: 'client-1', clientSeq: handle.clientSeq },
      rejectionReason: 'Permission denied',
    };
    await server.send(JSON.stringify({ jsonrpc: '2.0', method: 'action', params: rejected }));
    const event = await subscription.next();
    assert.ok(!event.done && event.value.type === 'action');
    assert.deepEqual(event.value.params, rejected);
    const topLevel = await allEvents.next();
    assert.ok(!topLevel.done && topLevel.value.channel === ACCOUNTS);
    mirror.apply(event.value.params);
    hosted.applyEnvelope('host', event.value.params);
    assert.deepEqual(mirror.accounts, snapshot.state);
    assert.deepEqual(hosted.getAccounts('host'), snapshot.state);
  }

  const accepted: ActionEnvelope = {
    channel: ACCOUNTS, serverSeq: 4, origin: undefined,
    action: { type: ActionType.AccountRemoved, id: account.id },
  };
  mirror.apply(accepted);
  assert.deepEqual(mirror.accounts, { accounts: [], attempts: [pending] });
  mirror.apply({ ...accepted, action: { type: ActionType.AuthAttemptRemoved, id: pending.id } });
  assert.deepEqual(mirror.accounts, { accounts: [], attempts: [] });
});

test('client-brokered commands preserve consumers, flow offers, bindings and account ids', async t => {
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  await initialize(client, server, capability);
  assert.deepEqual(client.authentication, capability);

  const begin = client.authBegin(beginParams);
  const request = await readRequest(server);
  assert.equal(request.method, 'authBegin');
  assert.deepEqual(request.params, { ...beginParams, channel: ACCOUNTS });
  await reply(server, request.id, { flow: AuthFlowKind.ClientBrokered, attemptId: pending.id });
  assert.deepEqual(await begin, { flow: AuthFlowKind.ClientBrokered, attemptId: pending.id });

  for (const binding of [
    { kind: BrokeredAuthenticationBindingKind.Attempt, attemptId: pending.id },
    { kind: BrokeredAuthenticationBindingKind.Account, accountId: account.id },
  ] as const) {
    const params: AuthenticateParams = {
      channel: ROOT, resource: consumer.resource, token: 'example-test-credential',
      expiresIn: 120, scopes: ['read'], binding,
    };
    const authenticate = client.authenticate(params);
    const request = await readRequest(server);
    assert.equal(request.method, 'authenticate');
    assert.deepEqual(request.params, params);
    await reply(server, request.id, { accountId: account.id });
    assert.deepEqual(await authenticate, { accountId: account.id });
  }
});

test('unadvertised and unknown flows reject brokered work without sending legacy fallback traffic', async t => {
  for (const authentication of [
    undefined,
    { flows: [] },
    { flows: [{ kind: 'future-flow' as AuthFlowKind }] },
  ]) {
    const [transport, server] = InMemoryTransport.pair();
    const client = new AhpClient(transport);
    client.connect();
    t.after(() => client.shutdown());
    await initialize(client, server, authentication);
    await assert.rejects(client.authBegin(beginParams), UnsupportedCapabilityError);
    await assert.rejects(client.request('authenticate', {
      channel: ROOT, resource: consumer.resource, token: 'example-test-credential',
      binding: { kind: BrokeredAuthenticationBindingKind.Account, accountId: account.id },
    }), UnsupportedCapabilityError);
    await assert.rejects(client.subscribe(ACCOUNTS), UnsupportedCapabilityError);
    assert.throws(() => client.dispatch(ACCOUNTS, {
      type: ActionType.AccountRemoved, id: account.id,
    }), UnsupportedCapabilityError);

    const legacy = client.authenticate({ channel: ROOT, resource: consumer.resource, token: 'legacy-test-credential' });
    const request = await readRequest(server);
    assert.equal(request.method, 'authenticate');
    assert.equal((request.params as AuthenticateParams).token, 'legacy-test-credential');
    assert.equal((request.params as AuthenticateParams).binding, undefined);
    await reply(server, request.id, {});
    assert.deepEqual(await legacy, {});
  }
});

test('unconfirmed or refused brokered authentication fails without retrying unbound', async t => {
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  await initialize(client, server, capability);

  const begin = client.authBegin(beginParams);
  const unsupportedFlow = assert.rejects(begin, TransportError);
  const request = await readRequest(server);
  await reply(server, request.id, { flow: 'future-flow', attemptId: pending.id });
  await unsupportedFlow;

  const params: AuthenticateParams = {
    channel: ROOT, resource: consumer.resource, token: 'example-test-credential',
    binding: { kind: BrokeredAuthenticationBindingKind.Attempt, attemptId: pending.id },
  };
  const missingAccount = client.authenticate(params);
  const unconfirmed = assert.rejects(missingAccount, TransportError);
  await reply(server, (await readRequest(server)).id, {});
  await unconfirmed;

  const renewal = client.authenticate({
    ...params, binding: { kind: BrokeredAuthenticationBindingKind.Account, accountId: account.id },
  });
  const wrongLifetime = assert.rejects(renewal, TransportError);
  await reply(server, (await readRequest(server)).id, { accountId: 'another-account' });
  await wrongLifetime;

  const refused = client.authenticate(params);
  const rejected = assert.rejects(refused, RpcError);
  await server.send(JSON.stringify({
    jsonrpc: '2.0', id: (await readRequest(server)).id,
    error: { code: -32009, message: 'Permission denied' },
  }));
  await rejected;

  const ping = client.ping();
  const nextRequest = await readRequest(server);
  assert.equal(nextRequest.method, 'ping');
  await reply(server, nextRequest.id, {});
  await ping;
});

test('verified reconnect restores prior authentication support without sending it on the wire', async t => {
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  const reconnect = client.reconnect({
    clientId: 'client-1', lastSeenServerSeq: 2, subscriptions: [ACCOUNTS], authentication: capability,
  });
  const request = await readRequest(server);
  assert.deepEqual(request.params, {
    channel: ROOT, clientId: 'client-1', lastSeenServerSeq: 2, subscriptions: [ACCOUNTS],
  });
  assert.equal(client.authentication, undefined);
  await reply(server, request.id, { type: 'replay', actions: [], missing: [] });
  await reconnect;
  assert.deepEqual(client.authentication, capability);

  const begin = client.authBegin(beginParams);
  await reply(server, (await readRequest(server)).id, { flow: 'clientBrokered', attemptId: pending.id });
  assert.equal((await begin).attemptId, pending.id);
});
