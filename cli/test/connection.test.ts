import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { openTransport } from '../src/connection.js';

test('owned transports reuse SDK binary decoding and force a stalled close into local EOF within one second', async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  t.after(async () => {
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  server.on('connection', socket => {
    socket.send(Buffer.from('binary'));
    socket.pause();
  });
  const transport = await openTransport(`ws://127.0.0.1:${address.port}`, 1000, new AbortController().signal);
  t.after(() => transport.close());
  const frame = await transport.recv();
  assert.ok(frame?.kind === 'binary');
  assert.equal(new TextDecoder().decode(frame.data), 'binary');
  const reads = [transport.recv(), transport.recv()];
  const started = Date.now();
  await Promise.all([transport.close(), transport.close()]);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 900 && elapsed < 3000, `Expected a one-second local close deadline, got ${elapsed}ms`);
  assert.deepEqual(await Promise.all(reads), [null, null]);
  assert.equal(await transport.recv(), null);
});
