import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AhpClient,
  ClientClosedError,
  InMemoryTransport,
  ManagedSubscriptionManager,
  RpcError,
  type AhpTransport,
  type SubscriptionEvent,
} from '../src/client/index.js';
import type { ActionEnvelope, StateAction } from '../src/types/common/actions.js';
import { ActionType } from '../src/types/common/actions.js';
import type { JsonRpcNotification, JsonRpcRequest } from '../src/types/common/messages.js';
import type { SubscribeResult } from '../src/types/common/commands.js';
import type { SessionState } from '../src/types/channels-session/state.js';

const URI = 'ahp-session:/managed';

async function readRequest(server: AhpTransport): Promise<JsonRpcRequest> {
  const frame = await server.recv();
  assert.ok(frame && frame.kind === 'text', 'expected a text request');
  return JSON.parse(frame.text) as JsonRpcRequest;
}

async function readNotification(server: AhpTransport): Promise<JsonRpcNotification> {
  const frame = await server.recv();
  assert.ok(frame && frame.kind === 'text', 'expected a text notification');
  return JSON.parse(frame.text) as JsonRpcNotification;
}

function result(uri = URI, fromSeq = 0): SubscribeResult {
  return {
    snapshot: {
      resource: uri,
      state: {} as NonNullable<SubscribeResult['snapshot']>['state'],
      fromSeq,
    },
  };
}

function reply(server: AhpTransport, id: number, value: unknown): void {
  server.send(JSON.stringify({ jsonrpc: '2.0', id, result: value }));
}

function replyError(server: AhpTransport, id: number, code: number, message: string): void {
  server.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
}

function pushAction(server: AhpTransport, serverSeq: number): void {
  const envelope: ActionEnvelope = {
    channel: URI,
    serverSeq,
    action: {
      type: ActionType.SessionTitleChanged,
      title: `title-${serverSeq}`,
    } as unknown as StateAction,
    origin: null,
  };
  server.send(JSON.stringify({ jsonrpc: '2.0', method: 'action', params: envelope }));
}

test('coalesces holders and unsubscribes only after the final disposal', async () => {
  const [clientTransport, server] = InMemoryTransport.pair();
  const client = new AhpClient(clientTransport);
  client.connect();
  const manager = new ManagedSubscriptionManager(client);

  const first = manager.acquire<SessionState, SubscriptionEvent>(URI, 'SessionView');
  const second = manager.acquire<SessionState, SubscriptionEvent>(URI, 'SessionView');
  assert.equal(first.subscription, second.subscription);
  assert.deepEqual(manager.activeSubscriptions(), [{
    uri: URI,
    status: 'pending',
    refCount: 2,
    holders: [{ owner: 'SessionView', count: 2 }],
  }]);

  const request = await readRequest(server);
  assert.equal(request.method, 'subscribe');
  reply(server, request.id, result());
  await first.subscription.ready;

  pushAction(server, 1);
  const [firstEvent, secondEvent] = await Promise.all([
    first.events.next(),
    second.events.next(),
  ]);
  assert.equal(firstEvent.value?.type, 'action');
  assert.equal(secondEvent.value?.type, 'action');

  first[Symbol.dispose]();
  assert.equal(manager.activeSubscriptions()[0]?.refCount, 1);
  second[Symbol.dispose]();

  const notification = await readNotification(server);
  assert.equal(notification.method, 'unsubscribe');
  assert.deepEqual(manager.activeSubscriptions(), []);
  await client.shutdown();
});

test('retains actions received during the initial snapshot round-trip', async () => {
  const [clientTransport, server] = InMemoryTransport.pair();
  const client = new AhpClient(clientTransport);
  client.connect();
  const manager = new ManagedSubscriptionManager(client);
  const lease = manager.acquire(URI, 'StateMirror');

  const request = await readRequest(server);
  pushAction(server, 7);
  reply(server, request.id, result(URI, 6));

  const initial = await lease.subscription.ready;
  assert.equal(initial.snapshot?.fromSeq, 6);
  const next = await lease.events.next();
  assert.equal(next.done, false);
  assert.equal(next.value?.type, 'action');
  if (next.value?.type === 'action') {
    assert.equal(next.value.params.serverSeq, 7);
  }

  lease[Symbol.dispose]();
  await readNotification(server);
  await client.shutdown();
});

test('a released pending acquire cannot overwrite a replacement', async () => {
  const [clientTransport, server] = InMemoryTransport.pair();
  const client = new AhpClient(clientTransport);
  client.connect();
  const manager = new ManagedSubscriptionManager(client);

  const abandoned = manager.acquire(URI, 'Preview');
  const firstRequest = await readRequest(server);
  abandoned[Symbol.dispose]();
  await assert.rejects(abandoned.subscription.ready, ClientClosedError);
  assert.equal((await readNotification(server)).method, 'unsubscribe');

  const replacement = manager.acquire(URI, 'Editor');
  const secondRequest = await readRequest(server);
  reply(server, firstRequest.id, result(URI, 1));
  reply(server, secondRequest.id, result(URI, 2));

  const replacementResult = await replacement.subscription.ready;
  assert.equal(replacementResult.snapshot?.fromSeq, 2);
  assert.equal(manager.get(URI), replacement.subscription);

  replacement[Symbol.dispose]();
  await readNotification(server);
  await client.shutdown();
});

test('cleans up a failed request so the next acquire retries', async () => {
  const [clientTransport, server] = InMemoryTransport.pair();
  const client = new AhpClient(clientTransport);
  client.connect();
  const manager = new ManagedSubscriptionManager(client);

  const failed = manager.acquire(URI, 'SessionView');
  const firstRequest = await readRequest(server);
  replyError(server, firstRequest.id, -32_001, 'not ready');
  await assert.rejects(failed.subscription.ready, RpcError);
  assert.equal(failed.subscription.status, 'failed');
  assert.equal((await readNotification(server)).method, 'unsubscribe');
  assert.equal(manager.get(URI), undefined);

  const retry = manager.acquire(URI, 'SessionView');
  const secondRequest = await readRequest(server);
  reply(server, secondRequest.id, result(URI, 3));
  assert.equal((await retry.subscription.ready).snapshot?.fromSeq, 3);
  assert.equal(retry.subscription.status, 'active');

  failed[Symbol.dispose]();
  assert.equal(manager.get(URI), retry.subscription);
  retry[Symbol.dispose]();
  await readNotification(server);
  await client.shutdown();
});

test('rejects conflicting options for an already managed URI', async () => {
  const [clientTransport, server] = InMemoryTransport.pair();
  const client = new AhpClient(clientTransport);
  client.connect();
  const manager = new ManagedSubscriptionManager(client);
  const lease = manager.acquire(URI, 'Immediate', { delivery: { maxLatencyMs: 0 } });

  assert.throws(
    () => manager.acquire(URI, 'Buffered', { delivery: { maxLatencyMs: 100 } }),
    (error: unknown) => error instanceof TypeError
      && /differ from the active subscription/.test(error.message),
  );

  const request = await readRequest(server);
  reply(server, request.id, result());
  await lease.subscription.ready;
  lease[Symbol.dispose]();
  await readNotification(server);
  await client.shutdown();
});

test('close releases all channels and rejects future acquires', async () => {
  const [clientTransport, server] = InMemoryTransport.pair();
  const client = new AhpClient(clientTransport);
  client.connect();
  const manager = new ManagedSubscriptionManager(client);
  const lease = manager.acquire(URI, 'Window');

  const request = await readRequest(server);
  reply(server, request.id, result());
  await lease.subscription.ready;

  const closing = manager.close();
  assert.equal((await readNotification(server)).method, 'unsubscribe');
  await closing;
  assert.equal(lease.subscription.status, 'closed');
  assert.throws(() => manager.acquire(URI, 'Window'), ClientClosedError);
  lease[Symbol.dispose]();
  await client.shutdown();
});
