import test from 'node:test';
import assert from 'node:assert/strict';
import { AhpClient, InMemoryTransport, RpcTimeoutError } from '../src/client/index.js';

test('requestRaw shares the typed client correlation and timeout machinery', async () => {
  const [transport, server] = InMemoryTransport.pair();
  const client = new AhpClient(transport, { requestTimeoutMs: 20 });
  client.connect();
  try {
    const pending = client.requestRaw('extension/read', { channel: 'ahp-root://', extra: true });
    const frame = await server.recv();
    assert.ok(frame && frame.kind === 'text');
    const request = JSON.parse(frame.text);
    assert.equal(request.method, 'extension/read');
    assert.deepEqual(request.params, { channel: 'ahp-root://', extra: true });
    server.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { extension: 42 } }));
    assert.deepEqual(await pending, { extension: 42 });
    await assert.rejects(client.requestRaw('extension/timeout', {}), RpcTimeoutError);
  } finally {
    await client.shutdown();
  }
});
