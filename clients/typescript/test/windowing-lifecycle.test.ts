import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { AhpClient, BackpressureError, ClientClosedError, RpcError, RpcTimeoutError,
  type AhpTransport, type JsonRpcMessage, type TransportFrame } from '../src/client/index.js';

const URI = 'ahp-terminal:/lifecycle';
const limits = { clientReceive: { windowBytes: 4096, maximumFrameBytes: 1024 },
  hostReceive: { windowBytes: 1, maximumFrameBytes: 1024 } };
const sleep = (ms = 1) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function wait(predicate: () => boolean) {
  for (let i = 0; i < 1000; i++) { if (predicate()) return; await sleep(); }
  assert.fail('windowing lifecycle expectation timed out');
}
class Transport implements AhpTransport {
  readonly supportsWindowedDelivery = true;
  readonly sent: any[] = [];
  frames: TransportFrame[] = [];
  waiter?: (value: TransportFrame | null) => void;
  closed = false;
  send(message: JsonRpcMessage | string): void {
    this.sent.push(typeof message === 'string' ? JSON.parse(message) : message);
  }
  recv(): Promise<TransportFrame | null> {
    if (this.frames.length) return Promise.resolve(this.frames.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise(resolve => { this.waiter = resolve; });
  }
  push(message: object) {
    const frame: TransportFrame = { kind: 'text', text: JSON.stringify(message) };
    if (this.waiter) { const waiter = this.waiter; this.waiter = undefined; waiter(frame); }
    else this.frames.push(frame);
  }
  close() { this.closed = true; this.waiter?.(null); this.waiter = undefined; }
  accept(id: number, channel = URI) {
    this.push({ jsonrpc: '2.0', id, result: { flowControl: limits } });
    this.snapshot(channel);
  }
  snapshot(channel = URI) {
    this.push({ jsonrpc: '2.0', method: 'channel/snapshot', params: {
      channel, snapshot: { resource: channel, state: {}, fromSeq: 1 },
    } });
  }
}
function setup(t: TestContext, timeout = 0, cap = 1_048_576) {
  const transport = new Transport();
  const client = new AhpClient(transport, { requestTimeoutMs: timeout, windowing: { maxBufferedSendBytes: cap } });
  client.connect();
  t.after(() => client.shutdown());
  return { transport, client };
}
async function open(client: AhpClient, transport: Transport, uri = URI) {
  const subscription = client.subscribe(uri, { windowed: { receive: 'manual' } });
  await wait(() => transport.sent.some(m => m.method === 'subscribe' && m.params.channel === uri));
  transport.accept(transport.sent.findLast(m => m.method === 'subscribe' && m.params.channel === uri).id, uri);
  return (await subscription).subscription;
}

test('close clears pending credits and old receipts cannot credit a new URI lifetime', async t => {
  const { client, transport } = setup(t);
  const first = await open(client, transport);
  const firstReceipt = await first.deliveries().next(); assert.ok(!firstReceipt.done);
  firstReceipt.value.release(); // Schedules the internal 5ms timer.
  await client.unsubscribe(URI);
  const next = await open(client, transport);
  const held = await next.deliveries().next(); assert.ok(!held.done);
  await sleep(15);
  assert.ok(!transport.sent.some(m => m.method === 'channel/credit'));
  await next.close();
  const third = await open(client, transport);
  held.value.release();
  await sleep(10);
  assert.ok(!transport.sent.some(m => m.method === 'channel/credit'));
  assert.equal(third.flowControl.outstandingSendBytes, 0);
});

test('a large head is accepted; only followers are capped; controls bypass the cap', async t => {
  const { client, transport } = setup(t, 0, 16);
  const uri = 'ahp-tcp:/lifecycle';
  const sub = await open(client, transport, uri);
  const receipt = await sub.deliveries().next(); assert.ok(!receipt.done);
  await sub.waitWritable();
  const large = client.notifyAsync('tcp/data', { channel: uri, data: btoa('x'.repeat(4096)) });
  void large.catch(() => undefined);
  await wait(() => transport.sent.some(m => m.method === 'channel/frame'));
  assert.throws(() => client.notify('tcp/data', { channel: uri, data: 'YQ==' }), BackpressureError);
  assert.equal(client.connectionState.status, 'connected');
  receipt.value.release();
  await wait(() => transport.sent.some(m => m.method === 'channel/credit'));
  const ping = client.ping();
  await wait(() => transport.sent.some(m => m.method === 'ping'));
  transport.push({ jsonrpc: '2.0', id: transport.sent.find(m => m.method === 'ping').id, result: null });
  await ping;
  client.notify('tcp/reset', { channel: uri });
  await assert.rejects(large, ClientClosedError);
  await wait(() => transport.sent.some(m => m.method === 'tcp/reset'));
  await client.unsubscribe(uri);
  await wait(() => transport.sent.some(m => m.method === 'unsubscribe'));
  assert.equal(client.connectionState.status, 'connected');
});

for (const cause of ['cancel', 'timeout', 'unsubscribe'] as const) {
  test(`${cause} during subscribe tolerates late acceptance and data`, async t => {
    const { client, transport } = setup(t, cause === 'timeout' ? 20 : 0);
    const abort = new AbortController();
    const request = client.subscribe(URI, { windowed: true, signal: abort.signal });
    void request.catch(() => undefined);
    await wait(() => transport.sent.some(m => m.method === 'subscribe'));
    const id = transport.sent.find(m => m.method === 'subscribe').id;
    if (cause === 'cancel') abort.abort();
    if (cause === 'unsubscribe') await client.unsubscribe(URI);
    await assert.rejects(request, cause === 'timeout' ? RpcTimeoutError : cause === 'unsubscribe' ? ClientClosedError : /abort/i);
    transport.accept(id);
    await sleep(10);
    assert.equal(client.connectionState.status, 'connected');
    assert.equal(client.windowedSubscription(URI), undefined);
    assert.ok(transport.sent.some(m => m.method === 'unsubscribe'));
    client.dispatch(URI, { type: 'terminal/input', data: 'not held' });
    assert.ok(transport.sent.some(m => m.method === 'dispatchAction'));
  });
}

test('a timed out reconnect tolerates its late window result and subsequent snapshot', async t => {
  const { client, transport } = setup(t, 20);
  const reconnect = client.reconnect({ clientId: 'lifecycle', lastSeenServerSeq: 0, subscriptions: [URI],
    windows: { items: [{ channel: URI, flowControl: { receive: { windowBytes: 4096, maximumFrameBytes: 1024 } } }] } });
  await assert.rejects(reconnect, RpcTimeoutError);
  const id = transport.sent.find(m => m.method === 'reconnect').id;
  transport.push({ jsonrpc: '2.0', id, result: { type: 'replay', actions: [], missing: [], windows: {
    items: [{ channel: URI, flowControl: limits, recovery: 'snapshot' }],
  } } });
  transport.snapshot();
  await sleep(10);
  assert.equal(client.connectionState.status, 'connected');
  assert.equal(client.windowedSubscription(URI), undefined);
});

test('RPC subscribe errors remove only never-accepted state', async t => {
  const { client, transport } = setup(t);
  const pending = client.subscribe(URI, { windowed: true });
  await wait(() => transport.sent.some(m => m.method === 'subscribe'));
  transport.push({ jsonrpc: '2.0', id: transport.sent[0].id, error: { code: -32001, message: 'denied' } });
  await assert.rejects(pending, RpcError);
  assert.equal(client.windowedSubscription(URI), undefined);
  client.dispatch(URI, { type: 'terminal/input', data: 'ordinary' });
  assert.ok(transport.sent.some(m => m.method === 'dispatchAction'));
  assert.equal(client.connectionState.status, 'connected');
});

test('ordinary dispatch, notify and unsubscribe reach the wire before immediate shutdown', async t => {
  const { client, transport } = setup(t);
  const events = client.events();
  const states = client.stateChanges();
  const subscription = client.attachSubscription(URI);
  client.dispatch(URI, { type: 'terminal/input', data: 'dispatch' });
  client.notify('dispatchAction', { channel: URI, clientSeq: 2, action: { type: 'terminal/input', data: 'notify' } });
  const unsubscribe = client.unsubscribe(URI);
  await client.shutdown();
  await unsubscribe;
  assert.deepEqual(transport.sent.map(m => m.method), ['dispatchAction', 'dispatchAction', 'unsubscribe']);
  assert.equal((await events.next()).done, true);
  assert.equal((await subscription.next()).done, true);
  for await (const _state of states) { /* Drain closed state history. */ }
  assert.equal((await states.next()).done, true);
});

test('closing channels prunes scheduler/owner maps and bounds retired-channel bookkeeping', async t => {
  const { client, transport } = setup(t);
  for (let i = 0; i < 50; i++) {
    const uri = `ahp-terminal:/cycle-${i}`;
    const sub = await open(client, transport, uri);
    await sub.close();
    assert.equal(client.windowedSubscription(uri), undefined);
  }
  for (let i = 0; i < 4200; i++) client.notify('unsubscribe', { channel: `ahp-terminal:/retired-${i}` });
  assert.equal((client as any).windowEngine.channels.size, 0);
  assert.equal((client as any).windowOwners.size, 0);
  assert.ok((client as any).unsubscribedWindowed.size <= 4096);
});

test('a queued credit waiting for physical writability is discarded on unsubscribe', async t => {
  const { client, transport } = setup(t);
  const sub = await open(client, transport);
  const receipt = await sub.deliveries().next(); assert.ok(!receipt.done);
  let writable!: () => void;
  const gate = new Promise<void>(resolve => { writable = resolve; });
  (transport as AhpTransport).waitWritable = () => gate;
  receipt.value.release();
  await wait(() => !!(client as any).windowEngine.currentControl?.creditOwner);
  await client.unsubscribe(URI);
  const replacement = client.subscribe(URI, { windowed: true });
  writable();
  await wait(() => transport.sent.filter(m => m.method === 'subscribe').length === 2);
  transport.accept(transport.sent.findLast(m => m.method === 'subscribe').id);
  await replacement;
  assert.ok(!transport.sent.some(m => m.method === 'channel/credit'));
});

test('internal RPC queue overflow rejects the caller without disconnecting', async t => {
  const { client, transport } = setup(t);
  await open(client, transport);
  let writable!: () => void;
  (transport as AhpTransport).waitWritable = () => new Promise<void>(resolve => { writable = resolve; });
  const promises: Promise<unknown>[] = [];
  const first = client.ping(); void first.catch(() => undefined); promises.push(first);
  await wait(() => !!writable);
  for (let i = 0; i < 4096; i++) {
    const ping = client.ping(); void ping.catch(() => undefined); promises.push(ping);
  }
  await assert.rejects(client.ping(), BackpressureError);
  assert.equal(client.connectionState.status, 'connected');
  await client.shutdown();
  writable();
  await Promise.allSettled(promises);
});

test('transport-local backpressure rejects a send without closing the connection', async t => {
  const { client, transport } = setup(t);
  await open(client, transport);
  const send = transport.send.bind(transport);
  transport.send = message => {
    const notification = typeof message === 'string' ? JSON.parse(message) : message;
    if (notification.method === 'dispatchAction') throw new BackpressureError(URI, 16);
    send(message);
  };
  await assert.rejects(client.notifyAsync('dispatchAction', {
    channel: URI, clientSeq: 1, action: { type: 'terminal/input', data: 'local pressure' },
  }), BackpressureError);
  assert.equal(client.connectionState.status, 'connected');
  assert.equal(client.flowControl(URI).outstandingSendBytes, 0);
});
