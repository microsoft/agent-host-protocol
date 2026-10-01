import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  AhpClient, AhpStateMirror, InMemoryTransport, TcpConnection, TcpConnectionError, reconcileTcpConnections,
  type AhpTransport,
} from '../src/client/index.js';
import { ActionType, type ActionEnvelope, type StateAction } from '../src/types/common/actions.js';
import { TcpDataEncoding, TcpResetReason, type TcpConnectionState } from '../src/types/channels-tcp/state.js';
import type { TcpConnectionSubscription } from '../src/types/channels-tcp/commands.js';
import type { DispatchActionParams } from '../src/types/common/commands.js';
import type { JsonRpcRequest, JsonRpcNotification } from '../src/types/common/messages.js';
import { MultiHostClient, immediateForeverPolicy } from '../src/client/hosts/index.js';
import { validateTcpRequest } from '../src/client/tcp-connection.js';
import { TerminalClaimKind, TerminalLifecycleStatus } from '../src/types/channels-terminal/state.js';

function terminalMirror() {
  const mirror = new AhpStateMirror();
  mirror.applySnapshot({
    resource: 'ahp-terminal:/test', fromSeq: 0,
    state: {
      title: 'Test', content: [], lifecycle: { status: TerminalLifecycleStatus.Running },
      claim: { kind: TerminalClaimKind.Client, clientId: 'owner' },
    },
  });
  return mirror;
}

const session = 'ahp-session:/s1';
const resource = 'ahp-tcp:/t1';
const create: TcpConnectionSubscription = {
  type: 'tcpConnection', host: 'localhost', port: 3000,
  encoding: TcpDataEncoding.Base64, receiveWindowBytes: 4, maximumChunkSize: 2,
};

function initial(): TcpConnectionState {
  return {
    session, target: { host: create.host, port: create.port }, encoding: TcpDataEncoding.Base64,
    input: { windowBytes: 4, maximumChunkSize: 2, receivedBytes: 0, consumedBytes: 0 },
    output: { windowBytes: 4, maximumChunkSize: 2, receivedBytes: 0, consumedBytes: 0 },
    clientClosed: false, hostClosed: false,
  };
}

async function message(server: AhpTransport): Promise<JsonRpcRequest | JsonRpcNotification> {
  const frame = await server.recv();
  assert.ok(frame && frame.kind === 'text');
  return JSON.parse(frame.text);
}

async function request(server: AhpTransport): Promise<JsonRpcRequest> {
  const msg = await message(server);
  assert.ok('id' in msg);
  return msg;
}

async function dispatch(server: AhpTransport): Promise<DispatchActionParams> {
  const msg = await message(server);
  assert.equal(msg.method, 'dispatchAction');
  return msg.params as DispatchActionParams;
}

function reply(server: AhpTransport, req: JsonRpcRequest, result: unknown): void {
  server.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
}

function push(server: AhpTransport, envelope: ActionEnvelope): void {
  server.send(JSON.stringify({ jsonrpc: '2.0', method: 'action', params: envelope }));
}

async function fence(client: AhpClient, server: AhpTransport): Promise<void> {
  const pending = client.ping();
  const req = await request(server);
  assert.equal(req.method, 'ping');
  reply(server, req, {});
  await pending;
}

async function setup(t: TestContext, first?: StateAction, state = initial()) {
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  const initialization = client.initialize({ clientId: 'owner', protocolVersions: ['0.9.0'] });
  reply(server, await request(server), {
    channel: 'ahp-root://', protocolVersion: '0.9.0', serverSeq: 0, snapshots: [],
    tcpConnections: { encodings: ['base64'] },
  });
  await initialization;
  const opening = client.openTcpConnection(session, create);
  const req = await request(server);
  assert.deepEqual(req.params, { channel: session, create });
  reply(server, req, { channel: session, snapshot: { resource, fromSeq: 0, state } });
  let serverSeq = 0;
  const send = (action: StateAction, origin?: ActionEnvelope['origin']) => {
    const envelope: ActionEnvelope = { channel: resource, serverSeq: ++serverSeq, action, ...(origin ? { origin } : {}) };
    push(server, envelope);
    return envelope;
  };
  if (first) send(first);
  const connection = await opening;
  const echo = (params: DispatchActionParams) => send(params.action, { clientId: 'owner', clientSeq: params.clientSeq });
  return { client, transport, server, connection, send, echo };
}

test('custom clients apply replay before live delivery and hold writes behind their send gate', async () => {
  const sent: DispatchActionParams[] = [];
  let nextSeq = 0;
  const binding = {
    nextSeq: () => ++nextSeq,
    sequenceFloor: () => nextSeq,
    send: (clientSeq: number, action: DispatchActionParams['action']) => { sent.push({ channel: resource, clientSeq, action }); },
    detach: () => {},
  };
  const connection = new TcpConnection(resource, initial(), 'owner', 0, binding);
  try {
    connection.suspend();
    connection.beginResume('owner', binding);
    assert.throws(() => connection.finishResume(), /replay is incomplete/);
    await connection.write(Uint8Array.of(1));
    reconcileTcpConnections([connection], {
      type: 'replay', missing: [],
      actions: [{ channel: resource, serverSeq: 1, action: { type: ActionType.TcpData, offset: 0, data: 'Ag==' } }],
    }, 0);
    connection.accept({ channel: resource, serverSeq: 2, action: { type: ActionType.TcpData, offset: 1, data: 'Aw==' } });
    assert.deepEqual(await connection.read(), Uint8Array.of(2));
    assert.deepEqual(await connection.read(), Uint8Array.of(3));
    assert.equal(sent.length, 0, 'neither input nor consumption escapes the send gate');
    connection.finishResume();
    assert.deepEqual(sent.map(item => item.clientSeq), [1, 2, 3]);
    assert.deepEqual(sent.map(item => item.action.type), [ActionType.TcpInput, ActionType.TcpDataConsumed, ActionType.TcpDataConsumed]);
  } finally {
    connection.dispose();
  }
});

test('TCP creation installs the stream before immediate data and reads release credit', async t => {
  const h = await setup(t, { type: ActionType.TcpData, offset: 0, data: 'AP8=' });
  await fence(h.client, h.server); // Receipt alone must not send consumed credit.
  assert.deepEqual(await h.connection.read(), Uint8Array.of(0, 255));
  const credit = await dispatch(h.server);
  assert.deepEqual(credit.action, { type: ActionType.TcpDataConsumed, consumedBytes: 2 });
  h.echo(credit);
  await fence(h.client, h.server);
  const copy = h.connection.state;
  copy.input.windowBytes = 999;
  assert.equal(h.connection.state.input.windowBytes, 4);
});

test('TCP writes reserve unacknowledged credit, chunk bytes, and drain destination consumption', async t => {
  const h = await setup(t);
  let finished = false;
  const writing = h.connection.write(Uint8Array.of(0, 255, 128, 1, 2, 3)).then(() => { finished = true; });
  const first = await dispatch(h.server);
  const second = await dispatch(h.server);
  assert.deepEqual(first.action, { type: ActionType.TcpInput, offset: 0, data: 'AP8=' });
  assert.deepEqual(second.action, { type: ActionType.TcpInput, offset: 2, data: 'gAE=' });
  assert.equal(finished, false);
  await assert.rejects(h.connection.write(Uint8Array.of(4)), /idle writer/);
  assert.throws(() => h.connection.end(), /idle writer/);
  h.echo(first);
  h.echo(second);
  await fence(h.client, h.server);
  assert.equal(finished, false); // Echo is not consumed credit.
  h.send({ type: ActionType.TcpInputConsumed, consumedBytes: 2 });
  const third = await dispatch(h.server);
  assert.deepEqual(third.action, { type: ActionType.TcpInput, offset: 4, data: 'AgM=' });
  await writing;
  h.echo(third);
  let drained = false;
  const draining = h.connection.drain().then(() => { drained = true; });
  await fence(h.client, h.server);
  assert.equal(drained, false);
  h.send({ type: ActionType.TcpInputConsumed, consumedBytes: 6 });
  await draining;
});

test('TCP EOF is idempotent, independent, and duplicate data is delivered once', async t => {
  const h = await setup(t);
  await h.connection.write(Uint8Array.of(7));
  h.echo(await dispatch(h.server));
  h.connection.end();
  h.connection.end();
  const eof = await dispatch(h.server);
  assert.deepEqual(eof.action, { type: ActionType.TcpInputEof, finalOffset: 1 });
  h.echo(eof);
  h.send({ type: ActionType.TcpData, offset: 0, data: 'CAk=' });
  h.send({ type: ActionType.TcpData, offset: 0, data: 'CAk=' });
  h.send({ type: ActionType.TcpDataEof, finalOffset: 2 });
  assert.deepEqual(await h.connection.read(), Uint8Array.of(8, 9));
  assert.equal((await dispatch(h.server)).action.type, ActionType.TcpDataConsumed);
  assert.equal(await h.connection.read(), undefined);
  await assert.rejects(h.connection.write(Uint8Array.of(1)), /idle writer/);
});

test('TCP reset wakes blocked read, write, and drain, and releases ownership once', async t => {
  const h = await setup(t);
  const writing = assert.rejects(h.connection.write(new Uint8Array(6)), /connectionReset/);
  await dispatch(h.server);
  await dispatch(h.server);
  const reading = assert.rejects(h.connection.read(), /connectionReset/);
  await assert.rejects(h.connection.read(), /one reader/);
  const draining = assert.rejects(h.connection.drain(), /connectionReset/);
  h.send({ type: ActionType.TcpHostReset, reason: TcpResetReason.ConnectionReset });
  await Promise.all([writing, reading, draining]);
  assert.equal((await message(h.server)).method, 'unsubscribe');
  assert.equal(h.client.tcpConnections.length, 0);
  h.connection.dispose();
  await fence(h.client, h.server);
});

test('TCP rejects unowned echoes and rejected envelopes without exposing their payload', async t => {
  for (const rejection of [false, true]) {
    const h = await setup(t);
    const reading = assert.rejects(h.connection.read(), TcpConnectionError);
    push(h.server, {
      channel: resource, serverSeq: 1,
      action: rejection
        ? { type: ActionType.TcpData, offset: 0, data: 'AQ==' }
        : { type: ActionType.TcpInput, offset: 0, data: 'AQ==' },
      ...(rejection ? { rejectionReason: '' } : { origin: { clientId: 'other', clientSeq: 1 } }),
    });
    await reading;
    assert.equal((await dispatch(h.server)).action.type, ActionType.TcpClientReset);
    assert.equal((await message(h.server)).method, 'unsubscribe');
  }
});

test('TCP rejects unsolicited credit and mismatched input echoes', async t => {
  for (const kind of ['unsolicited-credit', 'changed-payload', 'changed-action-kind'] as const) {
    await t.test(kind, async t => {
      const h = await setup(t);
      if (kind === 'unsolicited-credit') {
        h.send({ type: ActionType.TcpData, offset: 0, data: 'AQI=' });
        h.send({ type: ActionType.TcpData, offset: 2, data: 'AwQ=' });
        h.send({ type: ActionType.TcpDataConsumed, consumedBytes: 4 }, { clientId: 'owner', clientSeq: 100 });
        h.send({ type: ActionType.TcpData, offset: 4, data: 'BQY=' });
        h.send({ type: ActionType.TcpData, offset: 6, data: 'Bwg=' });
      } else {
        await h.connection.write(Uint8Array.of(1));
        const pending = await dispatch(h.server);
        h.echo({ ...pending, action: kind === 'changed-payload'
          ? { type: ActionType.TcpInput, offset: 0, data: 'Ag==' }
          : { type: ActionType.TcpClientClose } });
      }
      await fence(h.client, h.server);
      assert.equal(h.connection.isClosed, true, kind);
      await assert.rejects(h.connection.read(), error =>
        error instanceof TcpConnectionError && error.reason === TcpResetReason.ProtocolError);
    });
  }
});

test('retired client echoes permit only state-neutral duplicates', async t => {
  const h = await setup(t);
  await h.connection.write(Uint8Array.of(1));
  const pending = await dispatch(h.server);
  h.echo(pending);
  h.echo({ ...pending, action: { data: 'AQ==', offset: 0, type: ActionType.TcpInput } });
  await fence(h.client, h.server);
  assert.equal(h.connection.isClosed, false);
  assert.equal(h.connection.state.input.receivedBytes, 1);
  h.send({ type: ActionType.TcpData, offset: 0, data: 'AgM=' });
  h.echo({ ...pending, action: { type: ActionType.TcpDataConsumed, consumedBytes: 2 } });
  await fence(h.client, h.server);
  assert.equal(h.connection.isClosed, true, 'a retired sequence must not grant fresh credit');
});

test('host actions carrying an origin cannot acknowledge pending client input', async t => {
  const h = await setup(t);
  await h.connection.write(Uint8Array.of(1));
  const pending = await dispatch(h.server);
  h.send({ type: ActionType.TcpData, offset: 0, data: 'Ag==' }, { clientId: 'owner', clientSeq: pending.clientSeq });
  await fence(h.client, h.server);
  await h.client.shutdown({ preserveTcpConnections: true });
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  const resuming = client.reconnectTcpConnections({
    clientId: 'owner', lastSeenServerSeq: 1, subscriptions: [],
  }, [h.connection]);
  reply(server, await request(server), { type: 'replay', actions: [], missing: [] });
  await resuming;
  const ping = client.ping();
  const first = await message(server);
  reply(server, 'id' in first ? first : await request(server), {});
  await ping;
  assert.equal(first.method, 'dispatchAction');
  assert.deepEqual(first.params, pending);
});

test('host close gets a response without new credit while final disposal waits for input drain', async t => {
  const h = await setup(t);
  await h.connection.write(Uint8Array.of(1, 2, 3, 4));
  h.echo(await dispatch(h.server));
  h.echo(await dispatch(h.server));
  h.send({ type: ActionType.TcpHostClose });
  const close = await dispatch(h.server);
  assert.deepEqual(close.action, { type: ActionType.TcpClientClose });
  h.echo(close);
  await fence(h.client, h.server);
  assert.equal(h.connection.isClosed, false, 'responding is not final disposal');
  assert.equal(h.client.tcpConnections.length, 1);
  assert.equal(h.connection.state.input.consumedBytes, 0);
  const drained = h.connection.drain();
  h.send({ type: ActionType.TcpInputConsumed, consumedBytes: 4 });
  await drained;
  assert.equal(h.connection.isClosed, true);
  assert.equal((await message(h.server)).method, 'unsubscribe');
});

test('TCP resumes the same consumer and resends only unacknowledged bytes with original sequences', async t => {
  const h = await setup(t);
  await h.connection.write(Uint8Array.of(1, 2, 3, 4));
  const acknowledged = await dispatch(h.server);
  const pending = await dispatch(h.server);
  h.echo(acknowledged);
  h.send({ type: ActionType.TcpData, offset: 0, data: 'BQY=' });
  await fence(h.client, h.server);
  h.client.dispatch(session, { type: ActionType.SessionTitleChanged, title: 'Other traffic' }, 100);
  await dispatch(h.server);
  const changes = h.client.stateChanges();
  await h.server.close();
  assert.equal((await changes.next()).value.status, 'closed');
  assert.equal(h.connection.isSuspended, true);
  const offlineWrite = h.connection.write(Uint8Array.of(9));
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  await assert.rejects(client.reconnectTcpConnections({
    clientId: 'another-owner', lastSeenServerSeq: 999, subscriptions: [],
  }, [h.connection]), /owned by this client/);
  const resumed = client.reconnectTcpConnections({
    clientId: 'owner', lastSeenServerSeq: 999, subscriptions: [session],
  }, [h.connection]);
  const req = await request(server);
  assert.deepEqual(req.params, {
    channel: 'ahp-root://', clientId: 'owner', lastSeenServerSeq: 2,
    subscriptions: [session, resource],
  });
  reply(server, req, { type: 'replay', actions: [], missing: [] });
  push(server, { channel: resource, serverSeq: 3, action: { type: ActionType.TcpData, offset: 2, data: 'Bwg=' } });
  await resumed;
  assert.deepEqual(await dispatch(server), pending);
  assert.equal(h.client.tcpConnections.length, 0);
  assert.equal(client.tcpConnections[0], h.connection);
  assert.deepEqual(await h.connection.read(), Uint8Array.of(5, 6));
  assert.equal((await dispatch(server)).clientSeq, 101);
  assert.deepEqual(await h.connection.read(), Uint8Array.of(7, 8));
  assert.equal((await dispatch(server)).clientSeq, 102);
  push(server, {
    channel: resource, serverSeq: 4, action: pending.action,
    origin: { clientId: 'owner', clientSeq: pending.clientSeq },
  });
  push(server, { channel: resource, serverSeq: 5, action: { type: ActionType.TcpInputConsumed, consumedBytes: 4 } });
  const afterResume = await dispatch(server);
  assert.equal(afterResume.clientSeq, 103);
  assert.deepEqual(afterResume.action, { type: ActionType.TcpInput, offset: 4, data: 'CQ==' });
  await offlineWrite;
});

test('TCP reconnect does not replay ordinary actions already applied by its consumer', async t => {
  const h = await setup(t);
  const mirror = terminalMirror();
  const events = h.client.events();
  const ordinary: ActionEnvelope = {
    channel: 'ahp-terminal:/test', serverSeq: 1,
    action: { type: ActionType.TerminalData, data: 'hello' },
  };
  push(h.server, ordinary);
  const first = await events.next();
  assert.equal(first.value.event.type, 'action');
  if (first.value.event.type === 'action') mirror.apply(first.value.event.params);
  await h.client.shutdown({ preserveTcpConnections: true });
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport);
  client.connect();
  t.after(() => client.shutdown());
  const resuming = client.reconnectTcpConnections({
    clientId: 'owner', lastSeenServerSeq: 1, subscriptions: [ordinary.channel],
  }, [h.connection]);
  const req = await request(server);
  assert.equal((req.params as { lastSeenServerSeq: number }).lastSeenServerSeq, 0);
  reply(server, req, { type: 'replay', missing: [], actions: [
    ordinary,
    { channel: resource, serverSeq: 2, action: { type: ActionType.TcpData, offset: 0, data: 'AQ==' } },
    { ...ordinary, serverSeq: 3, action: { type: ActionType.TerminalData, data: '!' } },
  ] });
  const result = await resuming;
  assert.equal(result.type, 'replay');
  if (result.type !== 'replay') assert.fail('expected replay');
  for (const envelope of result.actions) mirror.apply(envelope);
  assert.deepEqual(mirror.getTerminal(ordinary.channel)?.content, [{ type: 'unclassified', value: 'hello!' }]);
  assert.deepEqual(await h.connection.read(), Uint8Array.of(1));
});

test('TCP replay reconciles echoes before resend, and missing or snapshot recovery fails closed', async t => {
  for (const recovery of ['echo', 'missing', 'snapshot'] as const) {
    const h = await setup(t);
    await h.connection.write(Uint8Array.of(1));
    const pending = await dispatch(h.server);
    const changes = h.client.stateChanges();
    await h.server.close();
    await changes.next();
    const [transport, server] = InMemoryTransport.pair();
    const client = new AhpClient(transport);
    client.connect();
    t.after(() => client.shutdown());
    const reconnecting = client.reconnectTcpConnections({
      clientId: 'owner', lastSeenServerSeq: 100, subscriptions: [],
    }, [h.connection]);
    const req = await request(server);
    reply(server, req, recovery === 'snapshot' ? { type: 'snapshot', snapshots: [] } : {
      type: 'replay', missing: recovery === 'missing' ? [resource] : [],
      actions: recovery === 'echo' ? [{
        channel: resource, serverSeq: 1, action: pending.action,
        origin: { clientId: 'owner', clientSeq: pending.clientSeq },
      }] : [],
    });
    await reconnecting;
    if (recovery === 'echo') {
      await fence(client, server); // No resend may precede this ping.
      assert.equal(h.connection.state.input.receivedBytes, 1);
    } else {
      assert.equal(h.connection.isClosed, true);
      await assert.rejects(h.connection.read(), /replay unavailable/);
      assert.equal((await message(server)).method, 'unsubscribe');
    }
  }
});

test('TCP final close drains crossing output and accepted input before releasing ownership', async t => {
  const h = await setup(t);
  await h.connection.write(Uint8Array.of(1));
  h.echo(await dispatch(h.server));
  h.connection.close();
  const closing = await dispatch(h.server);
  assert.equal(closing.action.type, ActionType.TcpClientClose);
  h.echo(closing);
  h.send({ type: ActionType.TcpData, offset: 0, data: 'Ag==' });
  h.send({ type: ActionType.TcpHostClose });
  assert.deepEqual(await h.connection.read(), Uint8Array.of(2));
  h.echo(await dispatch(h.server));
  const draining = h.connection.drain();
  h.send({ type: ActionType.TcpInputConsumed, consumedBytes: 1 });
  await draining;
  assert.equal(h.connection.isClosed, true);
  assert.equal((await message(h.server)).method, 'unsubscribe');
  assert.equal(await h.connection.read(), undefined);
  await fence(h.client, h.server);
});

test('explicit client shutdown disposes suspended TCP and cancels blocked operations', async t => {
  const h = await setup(t);
  const changes = h.client.stateChanges();
  await h.server.close();
  await changes.next();
  const reading = assert.rejects(h.connection.read(), /disposed/);
  await h.client.shutdown();
  await reading;
  assert.equal(h.connection.isClosed, true);
  assert.equal(h.client.tcpConnections.length, 0);
});

test('unsubscribing an owned TCP resource also terminates its local stream', async t => {
  const h = await setup(t);
  const reading = assert.rejects(h.connection.read(), /disposed/);
  await h.client.unsubscribe(resource);
  await reading;
  assert.equal((await message(h.server)).method, 'unsubscribe');
  assert.equal(h.client.tcpConnections.length, 0);
  h.connection.dispose();
  await fence(h.client, h.server);
});

test('invalid TCP data aborts the stream instead of leaving a blocked reader', async t => {
  const h = await setup(t);
  const reading = assert.rejects(h.connection.read(), error =>
    error instanceof TcpConnectionError && error.reason === TcpResetReason.ProtocolError);
  h.send({ type: ActionType.TcpData, offset: 1, data: 'AQ==' });
  await reading;
  assert.deepEqual((await dispatch(h.server)).action, { type: ActionType.TcpClientReset, reason: TcpResetReason.ProtocolError });
  assert.equal((await message(h.server)).method, 'unsubscribe');
});

test('TCP adapter encodes a negotiated 4 MiB input chunk without stack overflow', async t => {
  const state = initial();
  state.input.windowBytes = state.input.maximumChunkSize = 4 * 1024 * 1024;
  const h = await setup(t, undefined, state);
  await h.connection.write(new Uint8Array(state.input.windowBytes).fill(255));
  const sent = await dispatch(h.server);
  assert.equal(sent.action.type, ActionType.TcpInput);
  if (sent.action.type !== ActionType.TcpInput) assert.fail('expected input');
  assert.equal(sent.action.offset, 0);
  assert.equal(Buffer.from(sent.action.data, 'base64').length, state.input.windowBytes);
  h.echo(sent);
  h.send({ type: ActionType.TcpInputConsumed, consumedBytes: state.input.windowBytes });
  await h.connection.drain();
});

test('host runtime automatically resumes TCP handles without recreating or snapshotting streams', async t => {
  const pairs = [InMemoryTransport.pair(), InMemoryTransport.pair()];
  const multi = new MultiHostClient();
  t.after(() => multi.shutdown());
  const events = multi.hostEvents();
  let attempt = 0;
  await multi.addHost({
    id: 'host', label: 'Host', clientId: 'owner', reconnectPolicy: immediateForeverPolicy(),
    transportFactory: async () => {
      assert.ok(attempt < pairs.length, 'unexpected replacement transport');
      return pairs[attempt++][0];
    },
  });
  const first = pairs[0][1];
  const init = await request(first);
  assert.equal(init.method, 'initialize');
  reply(first, init, {
    protocolVersion: '0.9.0', serverSeq: 0, snapshots: [],
    tcpConnections: { encodings: ['base64'] },
  });
  const listing = await request(first);
  assert.equal(listing.method, 'listSessions');
  reply(first, listing, { items: [] });
  while ((await events.next()).value.type !== 'connected') { /* wait for committed handshake */ }
  const handle = multi.client('host');
  assert.ok(handle);
  const opening = handle.openTcpConnection(session, create);
  reply(first, await request(first), { snapshot: { resource, fromSeq: 0, state: initial() } });
  const connection = await opening;
  const mirror = terminalMirror();
  const fanOut = multi.events();
  const ordinary: ActionEnvelope = {
    channel: 'ahp-terminal:/test', serverSeq: 1,
    action: { type: ActionType.TerminalData, data: 'hello' },
  };
  push(first, ordinary);
  const received = await fanOut.next();
  assert.equal(received.value.event.type, 'action');
  if (received.value.event.type === 'action') mirror.apply(received.value.event.params);
  await connection.write(Uint8Array.of(1));
  const sent = await dispatch(first);
  await first.close();
  const second = pairs[1][1];
  const reconnect = await request(second);
  assert.equal(reconnect.method, 'reconnect');
  assert.ok((reconnect.params as { subscriptions: string[] }).subscriptions.includes(resource));
  assert.equal((reconnect.params as { lastSeenServerSeq: number }).lastSeenServerSeq, 0);
  reply(second, reconnect, { type: 'replay', missing: [], actions: [ordinary, {
    channel: resource, serverSeq: 2, action: sent.action,
    origin: { clientId: 'owner', clientSeq: sent.clientSeq },
  }, {
    channel: resource, serverSeq: 3, action: { type: ActionType.TcpData, offset: 0, data: 'BQ==' },
  }, { ...ordinary, serverSeq: 4, action: { type: ActionType.TerminalData, data: '!' } }] });
  push(second, { channel: resource, serverSeq: 5, action: { type: ActionType.TcpData, offset: 1, data: 'Bg==' } });
  const refresh = await request(second);
  assert.equal(refresh.method, 'listSessions'); // The echoed input must not be resent.
  reply(second, refresh, { items: [] });
  while ((await events.next()).value.type !== 'connected') { /* wait for reconnect */ }
  while (true) {
    const next = await fanOut.next();
    if (next.value.event.type === 'action') {
      mirror.apply(next.value.event.params);
      if (next.value.event.params.serverSeq === 5) break;
    }
  }
  assert.deepEqual(mirror.getTerminal(ordinary.channel)?.content, [{ type: 'unclassified', value: 'hello!' }]);
  assert.equal(multi.client('host')?.rawClient().tcpConnections[0], connection);
  assert.equal(connection.state.input.receivedBytes, 1);
  assert.deepEqual(await connection.read(), Uint8Array.of(5));
  await dispatch(second);
  assert.deepEqual(await connection.read(), Uint8Array.of(6));
  await dispatch(second);
  const blocked = assert.rejects(connection.read(), /disposed/);
  await multi.shutdown();
  await blocked;
  assert.equal(connection.isClosed, true);
});

test('a late reconnect response cannot resurrect a stream abandoned on timeout', async t => {
  const h = await setup(t);
  await h.client.shutdown({ preserveTcpConnections: true });
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport, { requestTimeoutMs: 25 });
  client.connect();
  t.after(() => client.shutdown());
  const resuming = assert.rejects(client.reconnectTcpConnections({
    clientId: 'owner', lastSeenServerSeq: 0, subscriptions: [],
  }, [h.connection]), /timed out/);
  const req = await request(server);
  await resuming;
  assert.equal((await message(server)).method, 'unsubscribe');
  reply(server, req, { type: 'replay', actions: [], missing: [] });
  assert.equal((await message(server)).method, 'unsubscribe');
  assert.equal(h.connection.isClosed, true);
  assert.equal(client.tcpConnections.length, 0);
});

test('TCP creation validates wire parameters before dispatch', async t => {
  const h = await setup(t);
  for (const parent of ['', 'copilotcli:/session', 'ahp-tcp:/connection']) {
    await assert.rejects(h.client.openTcpConnection(parent, create), {
      name: 'TcpConnectionError', reason: TcpResetReason.ProtocolError, message: 'TCP creation requires a parent session',
    });
  }
  for (const host of ['', ' ', 'bad host', 'localhost\n', 'local\0host', 'host/path', 'https://localhost']) {
    await assert.rejects(h.client.openTcpConnection(session, { ...create, host }), {
      name: 'TcpConnectionError', reason: TcpResetReason.ProtocolError, message: 'Invalid TCP host',
    });
  }
  for (const host of ['localhost', '127.0.0.1', '::1', '2001:db8::1']) {
    assert.doesNotThrow(() => validateTcpRequest(session, { ...create, host }));
  }
  await fence(h.client, h.server);
});

test('TCP creation validates capabilities and releases a malformed child or a late timeout response', async t => {
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport, { requestTimeoutMs: 25 });
  client.connect();
  t.after(() => client.shutdown());
  await assert.rejects(client.openTcpConnection(session, create), /TCP-capable/);
  const init = client.initialize({ clientId: 'owner', protocolVersions: ['0.9.0'] });
  reply(server, await request(server), { tcpConnections: { encodings: ['base64'] } });
  await init;
  const malformed = assert.rejects(client.openTcpConnection(session, create), /empty directions/);
  const req = await request(server);
  const state = initial();
  state.input.receivedBytes = 1;
  reply(server, req, { snapshot: { resource, fromSeq: 0, state } });
  await malformed;
  assert.equal((await message(server)).method, 'unsubscribe');
  const timedOut = assert.rejects(client.openTcpConnection(session, create), /timed out/);
  const late = await request(server);
  await timedOut;
  reply(server, late, { snapshot: { resource, fromSeq: 0, state: initial() } });
  assert.equal((await message(server)).method, 'unsubscribe');
  assert.equal(client.tcpConnections.length, 0);
});
