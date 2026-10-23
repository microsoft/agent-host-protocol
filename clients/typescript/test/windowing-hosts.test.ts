import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransport, ManagedSubscriptionManager, type AhpTransport, type FlowControlEvent, type ReceivedDelivery } from '../src/client/index.js';
import { MultiHostClient, MultiHostStateMirror, immediateForeverPolicy, HostReconnectedError } from '../src/client/hosts/index.js';

const CHANNEL = 'ahp-terminal:/persistent';
const sleep = (ms = 1) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function wait(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1000; i++) { if (predicate()) return; await sleep(); }
  assert.fail('host expectation timed out');
}
function snapshot(channel: string, fromSeq: number) {
  return { jsonrpc: '2.0', method: 'channel/snapshot', params: { channel, snapshot: {
    resource: channel,
    state: channel === 'ahp-root://' ? { agents: [], activeSessions: fromSeq } : { title: 'Shell', content: [], lifecycle: { status: 'running' } },
    fromSeq,
  } } };
}
function action(channel: string, serverSeq: number, data: string) {
  return { jsonrpc: '2.0', method: 'action', params: {
    channel, serverSeq, action: { type: 'terminal/data', data },
  } };
}
const accepted = {
  clientReceive: { windowBytes: 16384, maximumFrameBytes: 1024 },
  hostReceive: { windowBytes: 1, maximumFrameBytes: 1024 },
};

for (const recovery of ['snapshot', 'replay', 'live', 'dropped'] as const) {
  test(`multi-host reconnect ${recovery}: owner queue, sequence, epochs and windows survive`, async t => {
    const multi = new MultiHostClient();
    t.after(() => multi.shutdown());
    const telemetry = multi.flowControlEvents();
    const servers: AhpTransport[] = [];
    const received: { message: any; connection: number }[] = [];
    const newTexts: string[] = [];
    const loops: Promise<void>[] = [];
    await multi.addHost({
      id: 'host', label: 'Host', reconnectPolicy: immediateForeverPolicy(),
      clientConfig: { windowing: { maximumFrameBytes: 1024 } },
      transportFactory: async () => {
        const [client, server] = InMemoryTransport.pair();
        const connection = servers.length;
        servers.push(server);
        loops.push((async () => {
          while (true) {
            const frame = await server.recv();
            if (!frame) return;
            if (frame.kind !== 'text') continue;
            const message = JSON.parse(frame.text);
            received.push({ message, connection });
            if (!('id' in message)) continue;
            if (message.method === 'initialize') {
              await server.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {
                protocolVersion: '1.1.0', serverSeq: 1,
                snapshots: [snapshot('ahp-root://', 1).params.snapshot], tcpConnections: {},
              } }));
            } else if (message.method === 'subscribe') {
              await server.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { flowControl: accepted } }));
              await server.send(JSON.stringify(snapshot(message.params.channel, 7)));
            } else if (message.method === 'listSessions') {
              await server.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { items: [] } }));
            } else if (message.method === 'reconnect') {
              const items = recovery === 'dropped' ? [] : message.params.windows.items.map((item: any) => ({
                channel: item.channel, flowControl: accepted, recovery,
              }));
              await server.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {
                type: 'snapshot', snapshots: [snapshot('ahp-root://', 20).params.snapshot], windows: { items },
              } }));
              if (recovery !== 'dropped') {
                const text = JSON.stringify(recovery === 'snapshot'
                  ? snapshot(CHANNEL, 21) : action(CHANNEL, 9, recovery));
                newTexts.push(text);
                await server.send(text);
              }
            }
          }
        })());
        return client;
      },
    });
    await wait(() => multi.host('host')?.state.status === 'connected');
    const oldClient = multi.client('host')!;
    const { subscription } = await multi.subscribe('host', CHANNEL, { windowed: { receive: 'manual' } });
    const reader = subscription.deliveries();
    const initial = await reader.next(); assert.ok(!initial.done);
    await servers[0].send(JSON.stringify(action(CHANNEL, 8, 'retained')));
    await wait(() => subscription.windowChannel!.lastAppliedServerSeq === 8);
    // The owner may have an unsent write when the transport disappears. It is never replayed.
    await multi.notifyAsync('host', 'dispatchAction', { channel: CHANNEL, clientSeq: 1,
      action: { type: 'terminal/input', data: 'sent once' } });
    const pending = multi.notifyAsync('host', 'dispatchAction', { channel: CHANNEL, clientSeq: 2,
      action: { type: 'terminal/input', data: 'not sent' } });
    void pending.catch(() => undefined);
    await servers[0].close();
    await assert.rejects(pending);
    await wait(() => multi.host('host')!.generation >= 2 && multi.host('host')!.state.status === 'connected');
    assert.throws(() => oldClient.dispatch(CHANNEL, { type: 'terminal/input', data: 'stale' }), HostReconnectedError);
    const reconnect = received.find(r => r.connection === 1 && r.message.method === 'reconnect')!.message;
    assert.deepEqual(reconnect.params.windows.items, [{
      channel: CHANNEL, flowControl: { receive: { windowBytes: 262144, maximumFrameBytes: 1024 } },
      lastAppliedServerSeq: 8,
    }]);
    assert.ok(!received.some(r => r.connection === 1 && r.message.method === 'dispatchAction'));
    initial.value.release();
    await sleep(10);
    assert.ok(!received.some(r => r.connection === 1 && r.message.method === 'channel/credit'));
    const retained = await reader.next(); assert.ok(!retained.done && retained.value.event.type === 'action');
    assert.equal((retained.value.event.params.action as any).data, 'retained');
    retained.value.release();
    if (recovery === 'dropped') {
      await assert.rejects(reader.next(), /dropped on reconnect/);
      assert.ok(!multi.host('host')!.subscriptions.includes(CHANNEL));
    } else {
      assert.equal(multi.client('host')!.rawClient().windowedSubscription(CHANNEL), subscription);
      assert.ok(multi.host('host')!.subscriptions.includes(CHANNEL));
      const resumed = await reader.next(); assert.ok(!resumed.done);
      assert.equal(resumed.value.event.type, recovery === 'snapshot' ? 'snapshot' : 'action');
      resumed.value.release();
      await wait(() => received.some(r => r.connection === 1 && r.message.method === 'channel/credit'));
      const credits = received.filter(r => r.connection === 1 && r.message.method === 'channel/credit');
      assert.equal(credits.at(-1)!.message.params.consumedBytes, newTexts[0].length * 2);
    }
    assert.equal(multi.host('host')!.activeSessions, 20);
    const observed: Array<FlowControlEvent & { hostId: string }> = [];
    while (!observed.some(e => e.type === (recovery === 'dropped' ? 'dropped' : 'resumed'))) {
      const next = await telemetry.next(); assert.ok(!next.done); observed.push(next.value);
    }
    assert.ok(observed.every(e => e.hostId === 'host'));
    await multi.shutdown();
    await Promise.all(loops);
  });
}

test('TCP owner closes on connection loss and is never initialized or reconnected', async t => {
  const multi = new MultiHostClient();
  t.after(() => multi.shutdown());
  const servers: AhpTransport[] = [];
  const messages: any[] = [];
  await multi.addHost({
    id: 'tcp', label: 'TCP', reconnectPolicy: immediateForeverPolicy(),
    transportFactory: async () => {
      const [client, server] = InMemoryTransport.pair();
      servers.push(server);
      void (async () => {
        while (true) {
          const frame = await server.recv(); if (!frame) return;
          if (frame.kind !== 'text') continue;
          const message = JSON.parse(frame.text); messages.push(message);
          if (!('id' in message)) continue;
          let result: any = {};
          if (message.method === 'initialize') result = { protocolVersion: '1.1.0', serverSeq: 1, snapshots: [], tcpConnections: {} };
          else if (message.method === 'listSessions') result = { items: [] };
          else if (message.method === 'subscribe') result = { flowControl: accepted };
          else if (message.method === 'reconnect') result = { type: 'replay', actions: [], missing: [] };
          await server.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
          if (message.method === 'subscribe') await server.send(JSON.stringify(snapshot(message.params.channel, 5)));
        }
      })();
      return client;
    },
  });
  await wait(() => multi.host('tcp')?.state.status === 'connected');
  const { subscription } = await multi.subscribe('tcp', 'ahp-tcp:/closed', { windowed: true });
  await subscription.next();
  const next = subscription.next(); void next.catch(() => undefined);
  await servers[0].close();
  await assert.rejects(next);
  await wait(() => multi.host('tcp')!.generation >= 2);
  assert.ok(!multi.host('tcp')!.subscriptions.includes('ahp-tcp:/closed'));
  for (const message of messages.filter(m => ['initialize', 'reconnect'].includes(m.method))) {
    assert.ok(!(message.params.subscriptions ?? message.params.initialSubscriptions ?? []).includes('ahp-tcp:/closed'));
    assert.ok(!message.params.windows?.items.some((i: any) => i.channel.startsWith('ahp-tcp:')));
  }
});

test('host-aware mirror applies reliable receipts without URI collisions', () => {
  const mirror = new MultiHostStateMirror();
  let releases = 0;
  for (const host of ['one', 'two']) {
    const n = snapshot(CHANNEL, 1);
    const delivery: ReceivedDelivery = { notification: n, bytes: 100,
      event: { type: 'snapshot', params: n.params as any }, release: () => { releases++; } };
    mirror.applyDelivery(host, delivery);
  }
  assert.equal(mirror.terminals.size, 2);
  assert.equal(releases, 2);
});

for (const dropped of [false, true]) {
  test(`managed subscriptions acquired through the host's raw client ${dropped ? 'report drops' : 'rebind leases and observers'}`, async t => {
    const multi = new MultiHostClient();
    t.after(() => multi.shutdown());
    const servers: AhpTransport[] = [];
    const requests: any[] = [];
    await multi.addHost({
      id: 'managed', label: 'Managed', reconnectPolicy: immediateForeverPolicy(),
      transportFactory: async () => {
        const [client, server] = InMemoryTransport.pair();
        servers.push(server);
        void (async () => {
          while (true) {
            const frame = await server.recv(); if (!frame) return;
            if (frame.kind !== 'text') continue;
            const request = JSON.parse(frame.text);
            if (!('id' in request)) continue;
            requests.push(request);
            let result: any = {};
            if (request.method === 'initialize') result = { protocolVersion: '1.1.0', serverSeq: 1, snapshots: [] };
            else if (request.method === 'subscribe') result = { flowControl: accepted };
            else if (request.method === 'listSessions') result = { items: [] };
            else if (request.method === 'reconnect') result = {
              type: 'replay', actions: [], missing: [], windows: { items: dropped ? [] : [{
                channel: CHANNEL, flowControl: accepted, recovery: 'replay',
              }] },
            };
            await server.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
            if (request.method === 'subscribe') await server.send(JSON.stringify(snapshot(request.params.channel, 7)));
            if (request.method === 'reconnect' && !dropped) await server.send(JSON.stringify(action(CHANNEL, 8, 'new')));
          }
        })();
        return client;
      },
    });
    await wait(() => multi.host('managed')?.state.status === 'connected');
    const manager = new ManagedSubscriptionManager(multi.client('managed')!.rawClient());
    t.after(() => manager.close());
    const lease = manager.acquire(CHANNEL, 'owner', { windowed: { receive: 'manual' } });
    await lease.subscription.ready;
    const owner = lease.deliveries();
    const initial = await owner.next(); assert.ok(!initial.done);
    initial.value.release();
    await servers[0].close();
    await wait(() => multi.host('managed')!.generation >= 2);
    assert.ok(requests.find(r => r.method === 'reconnect').params.windows.items.some((i: any) => i.channel === CHANNEL));
    if (dropped) {
      await assert.rejects(owner.next(), /dropped/);
      assert.equal(lease.subscription.status, 'closed');
      assert.ok(lease.subscription.error);
      assert.equal(manager.activeSubscriptions().length, 0);
    } else {
      const next = await owner.next(); assert.ok(!next.done && next.value.event.type === 'action');
      assert.equal((next.value.event.params.action as any).data, 'new');
      next.value.release();
      assert.equal(lease.subscription.status, 'active');
      assert.equal(manager.activeSubscriptions().length, 1);
      assert.equal((await lease.events.next()).value.type, 'action');
      const second = manager.acquire(CHANNEL, 'second', { windowed: { receive: 'manual' } });
      assert.equal(second.subscription, lease.subscription);
      second[Symbol.dispose]();
    }
    lease[Symbol.dispose]();
  });
}
