/**
 * Tests for {@link WebSocketTransport} close semantics.
 *
 * Uses a minimal in-process WebSocket mock so the test never touches a
 * real network. The mock implements the subset of the browser
 * `WebSocket` interface that `WebSocketTransport` consumes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { TransportError } from '../src/client/index.js';

type Listener = (ev: unknown) => void;

class MockWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;

  readyState: number = MockWebSocket.OPEN;
  binaryType: 'arraybuffer' | 'blob' = 'blob';
  bufferedAmount = 0;

  readonly OPEN = MockWebSocket.OPEN;
  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;

  private listeners = new Map<string, Listener[]>();

  send(_data: string | ArrayBufferLike): void { void _data; }
  close(): void { this.readyState = MockWebSocket.CLOSED; }

  addEventListener(event: string, listener: Listener): void {
    const arr = this.listeners.get(event) ?? [];
    arr.push(listener);
    this.listeners.set(event, arr);
  }
  removeEventListener(event: string, listener: Listener): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /** @internal helper for tests to fire events at the mock. */
  fire(event: string, payload: unknown): void {
    for (const l of this.listeners.get(event) ?? []) l(payload);
  }
}

async function makeTransport(): Promise<{ ws: MockWebSocket; transport: import('../src/ws/index.js').WebSocketTransport }> {
  const ws = new MockWebSocket();
  // Stash the mock as the global WebSocket constructor briefly so
  // fromSocket() accepts it via the OPEN check. We then reset to avoid
  // leaking the override.
  const { WebSocketTransport } = await import('../src/ws/index.js');
  return { ws, transport: WebSocketTransport.fromSocket(ws as unknown as WebSocket) };
}

test('clean close drains every pending recv() waiter with null', async () => {
  const { ws, transport } = await makeTransport();

  // Park multiple concurrent recv() calls.
  const a = transport.recv();
  const b = transport.recv();
  const c = transport.recv();

  // Clean close.
  ws.fire('close', { code: 1000, reason: '', wasClean: true });

  const results = await Promise.all([a, b, c]);
  for (const r of results) assert.equal(r, null);
});

test('abnormal close rejects every pending recv() with TransportError', async () => {
  const { ws, transport } = await makeTransport();

  const a = transport.recv();
  const b = transport.recv();

  // Abnormal close (wasClean=false).
  ws.fire('close', { code: 1006, reason: 'abnormal', wasClean: false });

  await assert.rejects(a, (err: unknown) => err instanceof TransportError && (err as TransportError).kind === 'closed');
  await assert.rejects(b, (err: unknown) => err instanceof TransportError && (err as TransportError).kind === 'closed');

  // Subsequent recv() also rejects with the same error class (sticky).
  await assert.rejects(transport.recv(), (err: unknown) => err instanceof TransportError);
});

test('lastClose reflects the wasClean flag from the close event', async () => {
  const { ws, transport } = await makeTransport();
  ws.fire('close', { code: 1006, reason: 'gone', wasClean: false });
  const info = transport.lastClose;
  assert.ok(info);
  assert.equal(info.code, 1006);
  assert.equal(info.wasClean, false);
  assert.equal(info.reason, 'gone');
});

test('WebSocket windowing advertises the 1 MiB fallback and a configurable override', async () => {
  const { WebSocketTransport } = await import('../src/ws/index.js');
  const { transport } = await makeTransport();
  assert.equal(transport.supportsWindowedDelivery, true);
  assert.equal(transport.maximumFrameBytes, 1_048_576);
  const overridden = WebSocketTransport.fromSocket(new MockWebSocket() as unknown as WebSocket, {
    maximumFrameBytes: 16384,
  });
  assert.equal(overridden.maximumFrameBytes, 16384);
  assert.throws(() => WebSocketTransport.fromSocket(new MockWebSocket() as unknown as WebSocket, {
    maximumFrameBytes: 512,
  }), TypeError);
  await assert.rejects(WebSocketTransport.connect('ws://unused.invalid', { maximumFrameBytes: 0 }), TypeError);
});

test('WebSocket physical writability waits for drain and honors cancellation and close', async () => {
  const { ws, transport } = await makeTransport();
  ws.bufferedAmount = 2_097_152;
  let writable = false;
  const pending = transport.waitWritable().then(() => { writable = true; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(writable, false);
  ws.bufferedAmount = 262_144;
  await pending;
  ws.bufferedAmount = 2_097_152;
  const controller = new AbortController();
  const canceled = transport.waitWritable({ signal: controller.signal });
  controller.abort();
  await assert.rejects(canceled, /abort/i);
  const closed = transport.waitWritable();
  ws.close();
  await assert.rejects(closed, TransportError);
});
