/**
 * Windowed delivery with backpressure and a custom coalescer.
 *
 * Part 1, receiving: the client renders slowly. While it is busy, the host
 * fills the window and the client queues what arrives. Adjacent queued
 * messages are combined before the renderer sees them:
 *
 * - The built-in coalescer joins adjacent `terminal/data` output.
 * - A custom coalescer keeps only the last of adjacent `terminal/resized`
 *   actions, because only the final size matters.
 *
 * Part 2, sending: the client pastes a large block of text into the terminal.
 * The host processes input slowly, so the client's send window fills. The
 * client waits until the subscription is writable before it sends each chunk,
 * instead of queueing the whole paste in memory.
 *
 * Run: npx tsx examples/windowing-backpressure.ts
 */

import {
  AhpClient,
  BackpressureError,
  type ChannelCoalescer,
  type FlowControlEvent,
} from '../src/client/index.js';
import {
  ActionType,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ActionEnvelope,
  type StateAction,
} from '../src/types/index.js';
import { DemoHost } from './windowing-demo-host.js';

const TERMINAL = 'ahp-terminal:/demo';
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const log = (message: string) => console.log(`  client | ${message}`);

// A custom coalescer runs on two adjacent messages that are still queued. It
// returns the combined message, or undefined to leave them separate. The
// client never passes it messages that the protocol requires to stay separate,
// such as actions with an origin.
const latestResize: ChannelCoalescer = {
  method: 'action',
  merge(earlier, later, { direction }) {
    if (direction !== 'receive') return undefined;
    const first = (earlier.params as ActionEnvelope).action;
    const second = (later.params as ActionEnvelope).action;
    if (first.type === ActionType.TerminalResized && second.type === ActionType.TerminalResized) {
      return later;
    }
    return undefined;
  },
};

const host = new DemoHost({ clientWindowBytes: 2048, hostWindowBytes: 1024, inputDelayMs: 15 });
const client = new AhpClient(host.clientTransport, {
  windowing: {
    coalescers: [latestResize],
    // Allow at most 2048 bytes of unsent data to wait behind the message being sent.
    maxBufferedSendBytes: 2048,
  },
});
client.connect();
await client.initialize({ clientId: 'windowing-example', protocolVersions: SUPPORTED_PROTOCOL_VERSIONS });

// Count what the client did. This stream is for monitoring only and can drop
// events; it never affects credit.
const counts = new Map<FlowControlEvent['type'], number>();
void (async () => {
  for await (const event of client.flowControlEvents()) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }
})();

const { subscription } = await client.subscribe(TERMINAL, { windowed: { windowBytes: 4096 } });
log(`subscribed: accepted window=${subscription.flowControl.limits?.clientReceive.windowBytes} bytes`);

// ─── Part 1: a slow renderer ────────────────────────────────────────────────

console.log('\nPart 1: slow renderer');
const hostActions: StateAction[] = [
  { type: ActionType.TerminalData, data: 'Building 120 modules\r\n' },
  // The user drags the corner of the terminal window.
  { type: ActionType.TerminalResized, cols: 100, rows: 30 },
  { type: ActionType.TerminalResized, cols: 110, rows: 32 },
  { type: ActionType.TerminalResized, cols: 120, rows: 36 },
  { type: ActionType.TerminalResized, cols: 132, rows: 40 },
  ...[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(percent => ({
    type: ActionType.TerminalData,
    data: `[${String(percent).padStart(3)}%] compiled ${(percent * 120) / 100} modules\r\n`,
  } satisfies StateAction)),
  { type: ActionType.TerminalData, data: 'Build finished\r\n' },
];
void (async () => {
  await host.whenSubscribed();
  for (const action of hostActions) await host.sendAction(action);
})();

const deliveries = subscription.deliveries();
let renders = 0;
for (;;) {
  const { value: delivery, done } = await deliveries.next();
  if (done) break;
  const { event } = delivery;
  renders++;
  if (event.type === 'snapshot') {
    log(`render snapshot (${delivery.bytes} bytes)`);
  } else if (event.type === 'action') {
    const action = event.params.action;
    if (action.type === ActionType.TerminalResized) {
      log(`render resize to ${action.cols}x${action.rows} (${delivery.bytes} bytes)`);
    } else if (action.type === ActionType.TerminalData) {
      const lines = action.data.split('\r\n').filter(Boolean);
      log(`render ${lines.length} line(s) of output (${delivery.bytes} bytes): ${JSON.stringify(lines.at(-1))}`);
      if (action.data.includes('Build finished')) break;
    }
  }
  await sleep(60); // The renderer is slow; the host fills the window meanwhile.
}
log(`rendered ${renders} deliveries for ${hostActions.length + 1} host messages`);

// ─── Part 2: pasting into a slow terminal ───────────────────────────────────

console.log('\nPart 2: pasting into a slow terminal');
const paste = Array.from({ length: 8 }, (_, i) => `echo "line ${i + 1} of the pasted script"\n`);
let waits = 0;
for (const chunk of paste) {
  // Wait for room in the host window and the local send queue, rather than
  // queueing the whole paste. With one producer, this keeps sends within the limit.
  if (!subscription.flowControl.writable) {
    const { outstandingSendBytes, bufferedSendBytes } = subscription.flowControl;
    log(`not writable (${outstandingSendBytes} bytes awaiting credit, ${bufferedSendBytes} bytes queued); waiting`);
    waits++;
    await subscription.waitWritable();
  }
  log(`send chunk ${paste.indexOf(chunk) + 1} of ${paste.length}`);
  try {
    // Resolves when the message is written to the transport.
    await client.dispatchAsync(TERMINAL, { type: ActionType.TerminalInput, data: chunk });
  } catch (error) {
    // If another producer filled the queue first, the send fails instead of
    // growing the queue. Wait, then send the chunk again.
    if (!(error instanceof BackpressureError)) throw error;
    await subscription.waitWritable();
    await client.dispatchAsync(TERMINAL, { type: ActionType.TerminalInput, data: chunk });
  }
}
// Wait until the host has processed, and credited, every chunk.
for await (const status of subscription.flowControlChanges()) {
  if (status.outstandingSendBytes === 0 && status.bufferedSendBytes === 0) break;
}
log(`sent ${paste.length} chunks, waiting ${waits} times; host received the paste intact: ${host.receivedInput === paste.join('')}`);

console.log('\nFlow-control events:');
for (const [type, count] of [...counts].sort()) console.log(`  ${type}: ${count}`);

await subscription.close();
host.close();
await client.shutdown();
