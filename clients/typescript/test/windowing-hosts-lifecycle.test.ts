import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransport, type AhpTransport } from '../src/client/index.js';
import { MultiHostClient, immediateForeverPolicy } from '../src/client/hosts/index.js';

const BAD = 'ahp-terminal:/bad';
const GOOD = 'ahp-terminal:/good';
const flowControl = { clientReceive: { windowBytes: 4096, maximumFrameBytes: 1024 },
  hostReceive: { windowBytes: 4096, maximumFrameBytes: 1024 } };
const sleep = (ms = 1) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function wait(predicate: () => boolean) {
  for (let i = 0; i < 1000; i++) { if (predicate()) return; await sleep(); }
  assert.fail('host lifecycle expectation timed out');
}

async function setup(t: TestContext, behavior: 'error' | 'timeout' | 'hang' | 'normal') {
  const multi = new MultiHostClient();
  const servers: AhpTransport[] = [];
  const sent: Array<{ connection: number; message: any }> = [];
  t.after(async () => { for (const server of servers) await server.close(); await multi.shutdown(); });
  await multi.addHost({
    id: 'lifecycle', label: 'Lifecycle', reconnectPolicy: immediateForeverPolicy(),
    clientConfig: { requestTimeoutMs: behavior === 'timeout' ? 40 : 0 },
    transportFactory: async () => {
      const [client, server] = InMemoryTransport.pair();
      const connection = servers.length; servers.push(server);
      void (async () => {
        while (true) {
          const frame = await server.recv(); if (!frame) return;
          if (frame.kind !== 'text') continue;
          const message = JSON.parse(frame.text);
          sent.push({ connection, message });
          if (!('id' in message)) continue;
          if (message.method === 'reconnect' && behavior !== 'normal') {
            await server.send({ jsonrpc: '2.0', id: message.id, error: { code: -32001, message: 'initialize again' } });
            continue;
          }
          if (connection > 0 && message.method === 'subscribe' && message.params.channel === BAD) {
            if (behavior === 'error') {
              await server.send({ jsonrpc: '2.0', id: message.id, error: { code: -32003, message: 'channel denied' } });
              continue;
            }
            if (behavior === 'timeout' || behavior === 'hang') continue;
          }
          const result = message.method === 'initialize'
            ? { protocolVersion: '1.1.0', serverSeq: 1, snapshots: [] }
            : message.method === 'subscribe' ? { flowControl }
              : message.method === 'reconnect' ? { type: 'replay', actions: [], missing: [] }
                : message.method === 'listSessions' ? { items: [] } : {};
          await server.send({ jsonrpc: '2.0', id: message.id, result });
          if (message.method === 'subscribe') await server.send({
            jsonrpc: '2.0', method: 'channel/snapshot', params: { channel: message.params.channel,
              snapshot: { resource: message.params.channel, state: {}, fromSeq: connection + 2 } },
          });
        }
      })();
      return client;
    },
  });
  await wait(() => multi.host('lifecycle')?.state.status === 'connected');
  return { multi, servers, sent };
}

for (const behavior of ['error', 'timeout'] as const) {
  test(`${behavior} on one re-subscribe drops only that URI and the host connects`, async t => {
    const { multi, servers, sent } = await setup(t, behavior);
    const bad = (await multi.subscribe('lifecycle', BAD, { windowed: true })).subscription;
    const good = (await multi.subscribe('lifecycle', GOOD, { windowed: true })).subscription;
    await bad.next(); await good.next();
    await servers[0].close();
    await wait(() => multi.host('lifecycle')!.generation >= 2 && multi.host('lifecycle')!.state.status === 'connected');
    assert.ok(!multi.host('lifecycle')!.subscriptions.includes(BAD));
    assert.ok(multi.host('lifecycle')!.subscriptions.includes(GOOD));
    await assert.rejects(bad.next(), behavior === 'error' ? /denied/ : /timed out/);
    assert.equal((await good.next()).value.type, 'snapshot');
    await sleep(10);
    assert.equal(servers.length, 2);
    assert.equal(sent.filter(s => s.connection === 1 && s.message.method === 'subscribe'
      && s.message.params.channel === BAD).length, 1);
  });
}

test('shutdown interrupts a re-subscribe with no request timeout', async t => {
  const { multi, servers, sent } = await setup(t, 'hang');
  await multi.subscribe('lifecycle', BAD, { windowed: true });
  await servers[0].close();
  await wait(() => sent.some(s => s.connection === 1 && s.message.method === 'subscribe'));
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([multi.shutdown(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('shutdown hung behind re-subscribe')), 500);
    })]);
  } finally { clearTimeout(timer!); }
});

test('closing the managed owner removes its URI and future reconnect never re-subscribes it', async t => {
  const { multi, servers, sent } = await setup(t, 'normal');
  const owner = (await multi.subscribe('lifecycle', BAD, { windowed: true })).subscription;
  await owner.close();
  assert.ok(!multi.host('lifecycle')!.subscriptions.includes(BAD));
  await servers[0].close();
  await wait(() => multi.host('lifecycle')!.generation >= 2);
  const requests = sent.filter(s => s.connection === 1).map(s => s.message);
  assert.ok(requests.some(m => m.method === 'reconnect'));
  for (const request of requests) {
    assert.ok(!request.params?.subscriptions?.includes(BAD));
    assert.ok(!request.params?.windows?.items.some((item: any) => item.channel === BAD));
    assert.ok(!(request.method === 'subscribe' && request.params.channel === BAD));
  }
});
