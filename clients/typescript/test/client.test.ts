/**
 * Roundtrip tests for {@link AhpClient} driven by {@link InMemoryTransport}.
 *
 * These mirror the spirit of the Rust `crates/ahp/tests/client_roundtrip.rs`
 * integration test: assemble a typed request from the client side, parse it
 * on the test side, send back a typed response, and assert the client
 * resolves with the right value.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AhpClient,
  ClientClosedError,
  InMemoryTransport,
  RpcError,
  RpcTimeoutError,
  type AhpTransport,
  type SubscriptionEvent,
} from '../src/client/index.js';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
} from '../src/types/common/messages.js';
import type {
  ActionEnvelope,
  StateAction,
} from '../src/types/common/actions.js';
import { ActionType } from '../src/types/common/actions.js';
import type {
  DispatchActionParams,
  InitializeParams,
  InitializeResult,
  SubscribeParams,
  SubscribeResult,
  UnsubscribeParams,
} from '../src/types/common/commands.js';
import { JsonRpcErrorCodes } from '../src/types/common/errors.js';

const ROOT = 'ahp-root://' as const;

async function readRequest(server: AhpTransport): Promise<JsonRpcRequest> {
  const frame = await server.recv();
  assert.ok(frame, 'expected a frame');
  assert.equal(frame.kind, 'text');
  if (frame.kind !== 'text') throw new Error('unreachable');
  const msg = JSON.parse(frame.text) as JsonRpcRequest;
  return msg;
}

async function readNotification(server: AhpTransport): Promise<JsonRpcNotification> {
  const frame = await server.recv();
  assert.ok(frame, 'expected a frame');
  assert.equal(frame.kind, 'text');
  if (frame.kind !== 'text') throw new Error('unreachable');
  return JSON.parse(frame.text) as JsonRpcNotification;
}

function reply(server: AhpTransport, id: number, result: unknown): void {
  server.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
}

function replyError(server: AhpTransport, id: number, code: number, message: string, data?: unknown): void {
  const error = data !== undefined ? { code, message, data } : { code, message };
  server.send(JSON.stringify({ jsonrpc: '2.0', id, error }));
}

function pushNotification(server: AhpTransport, method: string, params: unknown): void {
  server.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
}

test('initialize round-trip', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  const initPromise = client.initialize({
    clientId: 'demo',
    protocolVersions: ['0.2.0'],
    initialSubscriptions: [ROOT],
  });

  const req = await readRequest(s);
  assert.equal(req.method, 'initialize');
  const params = req.params as InitializeParams;
  assert.equal(params.channel, ROOT);
  assert.equal(params.clientId, 'demo');
  assert.deepEqual(params.protocolVersions, ['0.2.0']);
  assert.deepEqual(params.initialSubscriptions, [ROOT]);

  const result: InitializeResult = {
    channel: ROOT,
    protocolVersion: '0.2.0',
    snapshots: [],
  };
  reply(s, req.id, result);

  const got = await initPromise;
  assert.equal(got.protocolVersion, '0.2.0');

  await client.shutdown();
});

test('subscribe attaches before sending the request and fans out an action', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  const subPromise = client.subscribe('ahp-session:/s1', { delivery: { maxLatencyMs: 100 } });
  const req = await readRequest(s);
  assert.equal(req.method, 'subscribe');
  assert.equal((req.params as SubscribeParams).channel, 'ahp-session:/s1');
  assert.deepEqual((req.params as SubscribeParams).delivery, { maxLatencyMs: 100 });

  const result: SubscribeResult = {
    channel: 'ahp-session:/s1',
    snapshot: {
      resource: 'ahp-session:/s1',
      state: {} as unknown as SubscribeResult['snapshot']['state'],
      fromSeq: 0,
    },
  };
  reply(s, req.id, result);

  const { subscription } = await subPromise;

  // Push an action notification and verify the subscription sees it.
  const env: ActionEnvelope = {
    channel: 'ahp-session:/s1',
    serverSeq: 7,
    action: { type: ActionType.SessionTitleChanged, title: 'hello' } as unknown as StateAction,
    origin: null,
  };
  pushNotification(s, 'action', env);

  const next = await subscription.next();
  assert.equal(next.done, false);
  assert.ok(next.value);
  const event = next.value as SubscriptionEvent;
  assert.equal(event.type, 'action');
  if (event.type !== 'action') throw new Error('unreachable');
  assert.equal(event.params.serverSeq, 7);

  await client.shutdown();
});

test('attachSubscription delivers events without a subscribe round-trip', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  const sub = client.attachSubscription('ahp-session:/s2');

  const env: ActionEnvelope = {
    channel: 'ahp-session:/s2',
    serverSeq: 1,
    action: { type: ActionType.SessionTitleChanged, title: 'x' } as unknown as StateAction,
    origin: null,
  };
  pushNotification(s, 'action', env);

  const next = await sub.next();
  assert.equal(next.done, false);

  await client.shutdown();
});

test('multiple subscriptions on the same URI each see every event', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  const subA = client.attachSubscription('ahp-session:/s3');
  const subB = client.attachSubscription('ahp-session:/s3');

  for (let i = 1; i <= 3; i++) {
    const env: ActionEnvelope = {
      channel: 'ahp-session:/s3',
      serverSeq: i,
      action: { type: ActionType.SessionTitleChanged, title: `t${i}` } as unknown as StateAction,
      origin: null,
    };
    pushNotification(s, 'action', env);
  }

  for (let i = 1; i <= 3; i++) {
    const a = await subA.next();
    const b = await subB.next();
    if (a.done || b.done) throw new Error('unexpected done');
    const ea = a.value;
    const eb = b.value;
    if (ea.type !== 'action' || eb.type !== 'action') throw new Error('unexpected event type');
    assert.equal(ea.params.serverSeq, i);
    assert.equal(eb.params.serverSeq, i);
  }

  await client.shutdown();
});

test('unsubscribe sends notification and terminates subscriptions', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  const sub = client.attachSubscription('ahp-session:/s4');
  await client.unsubscribe('ahp-session:/s4');

  const note = await readNotification(s);
  assert.equal(note.method, 'unsubscribe');
  assert.equal((note.params as UnsubscribeParams).channel, 'ahp-session:/s4');

  const next = await sub.next();
  assert.equal(next.done, true);

  await client.shutdown();
});

test('dispatch produces a dispatchAction notification and increments clientSeq', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  const action: StateAction = {
    type: ActionType.SessionTitleChanged,
    title: 'hi',
  } as unknown as StateAction;

  const h1 = client.dispatch('ahp-session:/s5', action);
  const h2 = client.dispatch('ahp-session:/s5', action);

  const note1 = await readNotification(s);
  const note2 = await readNotification(s);
  assert.equal(note1.method, 'dispatchAction');
  assert.equal(note2.method, 'dispatchAction');
  assert.equal((note1.params as DispatchActionParams).clientSeq, h1.clientSeq);
  assert.equal((note2.params as DispatchActionParams).clientSeq, h2.clientSeq);
  assert.equal(h2.clientSeq, h1.clientSeq + 1);

  // Explicit clientSeq advances the internal counter past it.
  const h3 = client.dispatch('ahp-session:/s5', action, 100);
  await readNotification(s);
  const h4 = client.dispatch('ahp-session:/s5', action);
  assert.equal(h3.clientSeq, 100);
  assert.equal(h4.clientSeq, 101);

  await client.shutdown();
});

test('JSON-RPC error responses surface as RpcError', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  const promise = client.initialize({
    clientId: 'demo',
    protocolVersions: ['0.2.0'],
  });

  const req = await readRequest(s);
  replyError(s, req.id, JsonRpcErrorCodes.InvalidParams, 'bad', { reason: 'missing' });

  await assert.rejects(promise, (err: unknown) => {
    if (!(err instanceof RpcError)) return false;
    assert.equal(err.code, JsonRpcErrorCodes.InvalidParams);
    assert.equal(err.message, `RPC error ${JsonRpcErrorCodes.InvalidParams}: bad`);
    assert.deepEqual(err.data, { reason: 'missing' });
    return true;
  });

  await client.shutdown();
});

test('request timeout produces RpcTimeoutError, not RpcError', async () => {
  const [c] = InMemoryTransport.pair();
  const client = new AhpClient(c, { requestTimeoutMs: 25 });
  client.connect();

  const promise = client.initialize({
    clientId: 'demo',
    protocolVersions: ['0.2.0'],
  });

  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof RpcTimeoutError);
    assert.equal((err as RpcTimeoutError).method, 'initialize');
    assert.equal((err as RpcTimeoutError).timeoutMs, 25);
    assert.ok(!(err instanceof RpcError));
    return true;
  });

  await client.shutdown();
});

test('shutdown rejects pending requests with ClientClosedError', async () => {
  const [c] = InMemoryTransport.pair();
  const client = new AhpClient(c, { requestTimeoutMs: 0 });
  client.connect();

  const promise = client.initialize({
    clientId: 'demo',
    protocolVersions: ['0.2.0'],
  });

  await client.shutdown();
  await assert.rejects(promise, (err: unknown) => err instanceof ClientClosedError);
});

test('inbound binary frame is decoded by the client', async () => {
  // Use a small mock transport so we can deliver a binary frame directly,
  // which the in-memory pair always converts to text.
  class BinaryFramePushTransport implements AhpTransport {
    private waiters: Array<(f: { kind: 'binary'; data: Uint8Array } | null) => void> = [];
    private queued: Array<{ kind: 'binary'; data: Uint8Array } | null> = [];
    private closed = false;
    send(): void {}
    recv(): Promise<{ kind: 'binary'; data: Uint8Array } | null> {
      if (this.queued.length > 0) return Promise.resolve(this.queued.shift()!);
      if (this.closed) return Promise.resolve(null);
      return new Promise(resolve => {
        this.waiters.push(resolve);
      });
    }
    close(): void {
      if (this.closed) return;
      this.closed = true;
      // Wake any parked recv() so the client's receive loop can exit.
      this.end();
    }
    push(data: Uint8Array): void {
      const frame = { kind: 'binary' as const, data };
      if (this.waiters.length > 0) this.waiters.shift()!(frame);
      else this.queued.push(frame);
    }
    end(): void {
      if (this.waiters.length > 0) this.waiters.shift()!(null);
      else this.queued.push(null);
    }
  }

  const transport = new BinaryFramePushTransport();
  const client = new AhpClient(transport);
  client.connect();
  const sub = client.attachSubscription('ahp-session:/sBin');

  const env: ActionEnvelope = {
    channel: 'ahp-session:/sBin',
    serverSeq: 42,
    action: { type: ActionType.SessionTitleChanged, title: 'binary' } as unknown as StateAction,
    origin: null,
  };
  const wire = JSON.stringify({ jsonrpc: '2.0', method: 'action', params: env });
  transport.push(new TextEncoder().encode(wire));

  const next = await sub.next();
  assert.equal(next.done, false);
  if (next.value.type !== 'action') throw new Error('unexpected event');
  assert.equal(next.value.params.serverSeq, 42);

  await client.shutdown();
});

test('server-initiated request without a handler is answered with MethodNotFound', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.connect();

  // Server sends a request to the client.
  s.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 9001,
    method: 'resourceRequest',
    params: { channel: ROOT, resources: [] },
  }));

  const frame = await s.recv();
  assert.ok(frame);
  if (frame.kind !== 'text') throw new Error('expected text frame');
  const reply = JSON.parse(frame.text);
  assert.equal(reply.id, 9001);
  assert.equal(reply.error.code, JsonRpcErrorCodes.MethodNotFound);

  await client.shutdown();
});

test('server-initiated request with a handler returns the handler result', async () => {
  const [c, s] = InMemoryTransport.pair();
  const client = new AhpClient(c);
  client.setServerRequestHandler(async (method, _params) => {
    if (method === 'resourceRequest') {
      return { granted: true } as unknown as Awaited<ReturnType<typeof client.request>>;
    }
    throw new Error('unexpected method');
  });
  client.connect();

  s.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 9002,
    method: 'resourceRequest',
    params: { channel: ROOT, resources: [] },
  }));

  const frame = await s.recv();
  assert.ok(frame);
  if (frame.kind !== 'text') throw new Error('expected text frame');
  const reply = JSON.parse(frame.text);
  assert.equal(reply.id, 9002);
  assert.deepEqual(reply.result, { granted: true });

  await client.shutdown();
});

test('post-shutdown operations throw ClientClosedError', async () => {
  const [c] = InMemoryTransport.pair();
  const client = new AhpClient(c, { requestTimeoutMs: 0 });
  client.connect();
  await client.shutdown();

  assert.throws(() => client.attachSubscription('ahp-session:/x'), (e: unknown) => e instanceof ClientClosedError);
  assert.throws(() => client.dispatch('ahp-session:/x', { type: ActionType.SessionTitleChanged, title: 'x' } as unknown as StateAction), (e: unknown) => e instanceof ClientClosedError);
  assert.throws(() => client.notify('dispatchAction', {
    channel: 'ahp-session:/x',
    clientSeq: 0,
    action: { type: ActionType.SessionTitleChanged, title: 'x' } as unknown as StateAction,
  }), (e: unknown) => e instanceof ClientClosedError);

  // unsubscribe is intentionally a no-op post-shutdown (no throw).
  await client.unsubscribe('ahp-session:/x');
});

test('connectionState transitions are observable via stateChanges()', async () => {
  const [c] = InMemoryTransport.pair();
  const client = new AhpClient(c, { requestTimeoutMs: 0 });
  const transitions: string[] = [];
  const changes = client.stateChanges();
  const drain = (async () => {
    for await (const s of changes) {
      transitions.push(s.status);
      if (s.status === 'closed') break;
    }
  })();

  client.connect();
  await client.shutdown();
  await drain;
  assert.deepEqual(transitions, ['connected', 'closing', 'closed']);
});
