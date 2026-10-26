import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { AhpClient, AhpStateMirror, BackpressureError, ClientClosedError,
  ManagedSubscriptionManager, type AhpTransport, type JsonRpcMessage, type TransportFrame,
  type WindowOptions, type AhpClientConfig, type ReceivedDelivery } from '../src/client/index.js';
import type { ChannelFlowControl } from '../src/types/common/state.js';
import { utf16Bytes } from '../src/client/flow-control.js';

const URI = 'ahp-terminal:/window';
const sleep = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function eventually(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1000; i++) { if (predicate()) return; await sleep(1); }
  assert.fail('condition did not become true');
}
const flow = (windowBytes = 4096, maximumFrameBytes = 1024): ChannelFlowControl => ({
  clientReceive: { windowBytes, maximumFrameBytes }, hostReceive: { windowBytes, maximumFrameBytes },
});
function snapshot(channel = URI, fromSeq = 5) {
  return { jsonrpc: '2.0', method: 'channel/snapshot',
    params: { channel, snapshot: { resource: channel, state: {}, fromSeq } } };
}
function action(data: string, serverSeq = 6, channel = URI) {
  return { jsonrpc: '2.0', method: 'action', params: { channel,
    action: { type: 'terminal/data', data }, serverSeq } };
}

class Peer implements AhpTransport {
  supportsWindowedDelivery = true;
  maximumFrameBytes = 1_048_576;
  closed = false;
  frames: TransportFrame[] = [];
  sent: { text: string; message: any }[] = [];
  waiter?: (value: TransportFrame | null) => void;
  accepted: ChannelFlowControl | undefined = flow();
  resultSnapshot = false;
  onSend?: (message: any) => void;
  send(message: JsonRpcMessage | string): void {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    const parsed = JSON.parse(text);
    this.sent.push({ text, message: parsed });
    if (parsed.method === 'subscribe') {
      this.push({ jsonrpc: '2.0', id: parsed.id, result: this.accepted
        ? { flowControl: this.accepted } : this.resultSnapshot ? { snapshot: snapshot(parsed.params.channel).params.snapshot } : {} });
      if (this.accepted) this.push(snapshot(parsed.params.channel));
    } else if (parsed.method === 'initialize') {
      this.push({ jsonrpc: '2.0', id: parsed.id,
        result: { protocolVersion: '0.9.0', snapshots: [], serverSeq: 0 } });
    }
    this.onSend?.(parsed);
  }
  recv(): Promise<TransportFrame | null> {
    if (this.frames.length) return Promise.resolve(this.frames.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise(resolve => { this.waiter = resolve; });
  }
  push(message: object | string): void {
    this.pushFrame({ kind: 'text', text: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  pushFrame(frame: TransportFrame): void {
    if (this.waiter) { const waiter = this.waiter; this.waiter = undefined; waiter(frame); }
    else this.frames.push(frame);
  }
  close(): void { this.closed = true; this.waiter?.(null); this.waiter = undefined; }
  credit(channel = URI): void {
    const consumedBytes = this.sent.filter(s => !('id' in s.message) && s.message.params.channel === channel
      && !['channel/credit', 'unsubscribe', 'tcp/reset'].includes(s.message.method))
      .reduce((total, s) => total + utf16Bytes(s.text), 0);
    this.push({ jsonrpc: '2.0', method: 'channel/credit', params: { channel, consumedBytes } });
  }
}

function setup(t: TestContext, config: AhpClientConfig = {}) {
  const peer = new Peer();
  const client = new AhpClient(peer, config);
  client.connect();
  t.after(() => client.shutdown());
  return { peer, client };
}
async function subscribe(client: AhpClient, options: WindowOptions = {}, channel = URI) {
  return (await client.subscribe(channel, { windowed: options })).subscription;
}
async function read(reader: AsyncIterableIterator<ReceivedDelivery>): Promise<ReceivedDelivery> {
  const result = await reader.next(); assert.ok(!result.done); return result.value;
}

test('offers on older negotiated versions without altering version offers', async t => {
  const { peer, client } = setup(t);
  await client.initialize({ clientId: 'test', protocolVersions: ['0.9.0'] });
  const sub = await subscribe(client);
  assert.equal(sub.flowControl.mode, 'windowed');
  assert.deepEqual(peer.sent[0].message.params.protocolVersions, ['0.9.0']);
  assert.ok(peer.sent[1].message.params.flowControl);
});

test('parsed-only transports fall back; TCP cannot fall back', async t => {
  const { peer, client } = setup(t);
  peer.supportsWindowedDelivery = false; peer.accepted = undefined; peer.resultSnapshot = true;
  const sub = await subscribe(client);
  assert.equal(sub.flowControl.fallbackReason, 'transport');
  assert.equal(peer.sent[0].message.params.flowControl, undefined);
  assert.equal((await sub.next()).value.type, 'snapshot');
  await assert.rejects(subscribe(client, {}, 'ahp-tcp:/unsupported'), /TCP requires/);
});

test('parsed frames retain exact raw text; missing raw text closes an accepted connection', async t => {
  const { peer, client } = setup(t);
  const sub = await subscribe(client, { receive: 'manual' });
  const reader = sub.deliveries(); (await read(reader)).release();
  const text = `  ${JSON.stringify(action('é😀'))} \n`;
  peer.pushFrame({ kind: 'parsed', message: JSON.parse(text), rawText: text });
  const value = await read(reader);
  assert.equal(value.bytes, utf16Bytes(text)); value.release();
  peer.pushFrame({ kind: 'parsed', message: JSON.parse(JSON.stringify(action('missing'))) });
  await eventually(() => client.connectionState.status === 'closed');
  assert.ok(peer.closed);
});

test('binary text is measured after UTF-8 decoding, not by transport length', async t => {
  const { peer, client } = setup(t);
  const sub = await subscribe(client, { receive: 'manual' });
  const reader = sub.deliveries(); (await read(reader)).release();
  const text = JSON.stringify(action('漢字😀'));
  peer.pushFrame({ kind: 'binary', data: new TextEncoder().encode(text) });
  assert.equal((await read(reader)).bytes, text.length * 2);
});

test('global events are observers and a tiny legacy buffer never drops owner deliveries', async t => {
  const { peer, client } = setup(t, { subscriptionBuffer: 1 });
  const observer = client.events();
  const sub = await subscribe(client, { coalescing: false });
  for (let i = 0; i < 20; i++) peer.push(action(String(i), 6 + i));
  await eventually(() => sub.flowControl.bufferedReceiveBytes > 1000);
  assert.equal(peer.sent.filter(s => s.message.method === 'channel/credit').length, 0);
  await observer.next();
  assert.equal(peer.sent.filter(s => s.message.method === 'channel/credit').length, 0);
  assert.equal((await sub.next()).value.type, 'snapshot');
  for (let i = 0; i < 20; i++) {
    const result = await sub.next(); assert.ok(!result.done && result.value.type === 'action');
    assert.equal((result.value.params.action as any).data, String(i));
  }
  await sub.return();
  assert.equal((await sub.next()).done, true);
});

test('ordinary fallback pins the initial snapshot while keeping ordinary lossy buffering', async t => {
  const { peer, client } = setup(t, { subscriptionBuffer: 1 });
  peer.accepted = undefined; peer.resultSnapshot = true;
  const sub = await subscribe(client);
  for (let i = 0; i < 10; i++) peer.push(action(String(i)));
  await sleep(10);
  assert.equal((await sub.next()).value.type, 'snapshot');
  assert.equal(sub.flowControl.mode, 'ordinary');
  assert.equal(sub.flowControl.fallbackReason, 'declined');
});

test('custom coalescers run first, preserve raw debit, and are disabled per subscription', async t => {
  const { peer, client } = setup(t, { windowing: { coalescers: [{
    method: 'action',
    merge(a, b, context) {
      assert.equal(context.direction, 'receive');
      return { ...b, params: { ...(b.params as any),
        action: { type: 'terminal/data', data: (a.params as any).action.data + '|' + (b.params as any).action.data } } };
    },
  }] } });
  const sub = await subscribe(client, { receive: 'manual' });
  const reader = sub.deliveries(); (await read(reader)).release();
  const a = JSON.stringify(action('a')), b = JSON.stringify(action('b', 7));
  peer.push(a); peer.push(b);
  await sleep(5);
  const value = await read(reader);
  assert.equal((value.notification.params as any).action.data, 'a|b');
  assert.equal(value.bytes, utf16Bytes(a) + utf16Bytes(b));
  value.release(); value.release();
  const updated = await subscribe(client, { receive: 'manual', coalescing: false });
  assert.equal(updated, sub);
  (await read(reader)).release();
  peer.push(action('c', 8)); peer.push(action('d', 9));
  assert.equal((await read(reader)).event.type, 'action');
  assert.equal((await read(reader)).event.type, 'action');
});

test('a custom coalescer cannot change method, channel or exempt classification', async t => {
  const { peer, client } = setup(t, { windowing: { coalescers: [{
    method: 'action', merge: () => ({ jsonrpc: '2.0', method: 'tcp/reset', params: { channel: URI } }),
  }] } });
  const sub = await subscribe(client);
  await sub.next();
  peer.push(action('a')); peer.push(action('b'));
  await eventually(() => client.connectionState.status === 'closed');
  assert.equal((client.connectionState as any).reason.error.kind, 'protocol');
});

test('bounded synchronous sends throw, async sends wait, status observers never unblock sends', async t => {
  const { peer, client } = setup(t, { windowing: { maxBufferedSendBytes: 900 } });
  peer.accepted = flow(1);
  const sub = await subscribe(client);
  const changes = sub.flowControlChanges(), events = client.flowControlEvents();
  await client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 1, action: { type: 'terminal/input', data: 'first' } });
  const params = { channel: URI, clientSeq: 2, action: { type: 'terminal/input' as const, data: 'x'.repeat(200) } };
  const pending = client.notifyAsync('dispatchAction', params); void pending.catch(() => undefined);
  const third = client.notifyAsync('dispatchAction', { ...params, clientSeq: 3 }); void third.catch(() => undefined);
  assert.throws(() => client.notify('dispatchAction', { ...params, clientSeq: 4 }), BackpressureError);
  assert.ok(!sub.flowControl.writable);
  await changes.next(); await events.next();
  const abort = new AbortController();
  const waiting = sub.waitWritable({ signal: abort.signal });
  abort.abort();
  await assert.rejects(waiting, /abort/i);
  peer.credit();
  await pending;
  peer.credit();
  await third;
  assert.equal(sub.flowControl.bufferedSendBytes, 0);
  peer.credit();
  await sub.waitWritable();
  assert.ok(sub.flowControl.writable);
});

test('queued sends snapshot caller params and independently canceled messages are not coalesced', async t => {
  const { peer, client } = setup(t);
  peer.accepted = flow(1);
  await subscribe(client);
  await client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 1,
    action: { type: 'terminal/input', data: 'block' } });
  const params = { channel: URI, clientSeq: 2, action: { type: 'terminal/input' as const, data: 'original' } };
  const sent = client.notifyAsync('dispatchAction', params);
  params.action.data = 'mutated';
  const abort = new AbortController();
  const canceled = client.notifyAsync('dispatchAction', { ...params, clientSeq: 3 }, { signal: abort.signal });
  abort.abort(); await assert.rejects(canceled, /abort/i);
  peer.credit(); await sent;
  assert.equal(peer.sent.at(-1)!.message.params.action.data, 'original');
});

test('the fair scheduler interleaves channels, with surrogate-safe fragments and no premature cancellation', async t => {
  const { peer, client } = setup(t);
  peer.accepted = flow(100_000);
  await subscribe(client); await subscribe(client, {}, 'ahp-terminal:/second');
  const abort = new AbortController();
  peer.onSend = message => { if (message.method === 'channel/frame') abort.abort(); };
  const large = client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 1,
    action: { type: 'terminal/input', data: '😀"\\'.repeat(1000) } }, { signal: abort.signal });
  const small = client.notifyAsync('dispatchAction', { channel: 'ahp-terminal:/second', clientSeq: 2,
    action: { type: 'terminal/input', data: 'small' } });
  await Promise.all([large, small]);
  const data = peer.sent.filter(s => !('id' in s.message));
  assert.equal(data[0].message.method, 'channel/frame');
  assert.equal(data[1].message.params.channel, 'ahp-terminal:/second');
  const frames = data.filter(s => s.message.method === 'channel/frame');
  for (const frame of frames) {
    assert.ok(utf16Bytes(frame.text) <= 1024);
    assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(frame.message.params.data));
  }
  assert.equal(frames.at(-1)!.message.params.final, true);
  assert.equal(JSON.parse(frames.map(f => f.message.params.data).join('')).params.action.data, '😀"\\'.repeat(1000));
});

test('re-subscribe reduced frame limits apply to the remainder of an in-progress message', async t => {
  const { peer, client } = setup(t);
  peer.accepted = flow(1, 2048);
  await subscribe(client);
  const pending = client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 1,
    action: { type: 'terminal/input', data: 'x'.repeat(3000) } });
  await eventually(() => peer.sent.some(s => s.message.method === 'channel/frame'));
  peer.accepted = flow(100_000, 1024);
  await subscribe(client);
  peer.credit();
  await pending;
  const frames = peer.sent.filter(s => s.message.method === 'channel/frame');
  const joined = JSON.parse(frames.map(s => s.message.params.data).join(''));
  assert.equal(joined.params.action.data, 'x'.repeat(3000));
  assert.ok(frames.slice(1).every(s => utf16Bytes(s.text) <= 1024));
});

test('TCP EOF is counted and ordered; reset bypasses a full window and cancels queued data', async t => {
  const { peer, client } = setup(t);
  peer.accepted = flow(1);
  const channel = 'ahp-tcp:/test';
  await subscribe(client, { receive: 'manual' }, channel);
  await client.notifyAsync('tcp/data', { channel, data: 'YQ==' });
  const eof = client.notifyAsync('tcp/eof', { channel }); void eof.catch(() => undefined);
  assert.ok(!peer.sent.some(s => s.message.method === 'tcp/eof'));
  client.notify('tcp/reset', { channel });
  await assert.rejects(eof, ClientClosedError);
  await eventually(() => peer.sent.some(s => s.message.method === 'tcp/reset'));
  assert.throws(() => client.notify('tcp/data', { channel, data: 'Yg==' }), ClientClosedError);
});

test('managed lease fan-out is observer-only; the shared reliable owner controls credit', async t => {
  const { peer, client } = setup(t);
  const manager = new ManagedSubscriptionManager(client);
  const lease = manager.acquire(URI, 'owner', { windowed: { receive: 'manual' } });
  const observer = manager.acquire(URI, 'observer', { windowed: { receive: 'manual' } });
  await lease.subscription.ready;
  peer.push(action('payload'));
  await observer.events.next();
  await sleep(10);
  assert.ok(!peer.sent.some(s => s.message.method === 'channel/credit'));
  const reader = lease.deliveries();
  (await read(reader)).release();
  (await read(reader)).release();
  await eventually(() => peer.sent.some(s => s.message.method === 'channel/credit'));
  assert.throws(() => manager.acquire(URI, 'conflict', { windowed: { receive: 'auto' } }), /differ/);
  lease[Symbol.dispose](); observer[Symbol.dispose]();
  await manager.close();
});

test('mirrors consume snapshots/actions before release and safely ignore unfamiliar state', async t => {
  const { peer, client } = setup(t);
  const sub = await subscribe(client, { receive: 'manual' });
  const reader = sub.deliveries(), mirror = new AhpStateMirror();
  const unknown = await read(reader);
  mirror.applyDelivery(unknown);
  peer.push({ ...snapshot(), params: { channel: URI,
    snapshot: { resource: URI, state: { title: 'Known', content: [], lifecycle: { status: 'running' } }, fromSeq: 6 } } });
  mirror.applyDelivery(await read(reader));
  peer.push(action('hello', 7)); mirror.applyDelivery(await read(reader));
  assert.equal((mirror.getTerminal(URI)!.content[0] as any).value, 'hello');
  await eventually(() => sub.flowControl.bufferedReceiveBytes === 0);
});

test('late windowed frames after unsubscribe are ignored, not treated as new subscription violations', async t => {
  const { peer, client } = setup(t);
  await subscribe(client);
  await client.unsubscribe(URI);
  peer.push({ jsonrpc: '2.0', method: 'channel/frame', params: { channel: URI, data: 'old', final: true } });
  await sleep(10);
  assert.equal(client.connectionState.status, 'connected');
});

test('closing a windowed owner unsubscribes and re-subscribe starts fresh accounting', async t => {
  const { peer, client } = setup(t);
  const first = await subscribe(client);
  await first.next();
  await client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 1,
    action: { type: 'terminal/input', data: 'first' } });
  assert.ok(first.flowControl.outstandingSendBytes > 0);
  await first.close();
  peer.push(action('between consumers', 8));
  const second = await subscribe(client);
  assert.notEqual(first, second);
  assert.equal((await first.next()).done, true);
  assert.equal((await second.next()).value.type, 'snapshot');
  assert.equal(second.flowControl.outstandingSendBytes, 0);
  assert.ok(peer.sent.some(sent => sent.message.method === 'unsubscribe'));
  peer.push({ jsonrpc: '2.0', method: 'channel/credit', params: { channel: URI, consumedBytes: 0 } });
  await eventually(() => second.flowControl.outstandingSendBytes === 0);
});

test('an explicit ordinary re-subscribe drains queued unsent messages without resetting their order', async t => {
  const { peer, client } = setup(t);
  peer.accepted = flow(1);
  await subscribe(client);
  await client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 1,
    action: { type: 'terminal/input', data: 'first' } });
  const second = client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 2,
    action: { type: 'terminal/input', data: 'second' } });
  const third = client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 3,
    action: { type: 'terminal/input', data: 'third' } });
  peer.accepted = undefined; peer.resultSnapshot = true;
  await client.subscribe(URI, { windowed: false });
  await Promise.all([second, third]);
  assert.deepEqual(peer.sent.filter(s => s.message.method === 'dispatchAction').map(s => s.message.params.clientSeq), [1, 2, 3]);
});

test('TCP windowing, initial-subscription and reconnect restrictions also cover raw requests', async t => {
  const { client } = setup(t);
  await assert.rejects(client.request('subscribe', { channel: 'ahp-tcp:/new' }), /windowed/);
  await assert.rejects(client.reconnect({ clientId: 'test', lastSeenServerSeq: 0, subscriptions: ['ahp-tcp:/new'] }), /reconnect/);
  await assert.rejects(client.initialize({ clientId: 'test', protocolVersions: ['1.1.0'],
    initialSubscriptions: ['ahp-tcp:/new'] }), /initial subscription/);
});

test('a delayed old transport write cannot remove a new connection queued send', async t => {
  const { peer, client } = setup(t);
  peer.accepted = flow(1);
  const owner = await subscribe(client);
  const normalSend = peer.send.bind(peer);
  let finishOldWrite!: () => void;
  peer.send = message => {
    normalSend(message);
    const value = typeof message === 'string' ? JSON.parse(message) : message;
    if (value.method === 'dispatchAction') return new Promise<void>(resolve => { finishOldWrite = resolve; });
  };
  const oldWrite = client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 1,
    action: { type: 'terminal/input', data: 'old' } });
  void oldWrite.catch(() => undefined);
  await eventually(() => !!finishOldWrite);
  const retained = client.retainWindowedSubscriptions();
  await client.shutdown();
  await assert.rejects(oldWrite, ClientClosedError);
  const next = setup(t);
  next.peer.accepted = flow(1);
  next.client.restoreWindowedSubscriptions(retained);
  next.peer.onSend = request => {
    if (request.method === 'reconnect') next.peer.push({ jsonrpc: '2.0', id: request.id, result: {
      type: 'replay', actions: [], missing: [], windows: { items: [{
        channel: URI, flowControl: flow(1), recovery: 'replay',
      }] },
    } });
  };
  await next.client.reconnect({ clientId: 'test', lastSeenServerSeq: 5, subscriptions: [URI],
    windows: next.client.windowedResumeOptions() });
  await next.client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 2,
    action: { type: 'terminal/input', data: 'new' } });
  const queued = next.client.notifyAsync('dispatchAction', { channel: URI, clientSeq: 3,
    action: { type: 'terminal/input', data: 'queued' } });
  finishOldWrite();
  await sleep(10);
  assert.ok(owner.flowControl.bufferedSendBytes > 0);
  next.peer.credit();
  await queued;
  assert.deepEqual(next.peer.sent.filter(s => s.message.method === 'dispatchAction').map(s => s.message.params.clientSeq), [2, 3]);
});
