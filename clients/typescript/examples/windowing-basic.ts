/**
 * Basic windowed delivery.
 *
 * The client offers windowed delivery on a terminal subscription. The host
 * accepts a smaller window, then sends a snapshot and terminal output. When
 * the window is full, the host waits; each time the client takes the next
 * delivery, it releases the previous one and returns credit, so the host can
 * continue.
 *
 * Run: npx tsx examples/windowing-basic.ts
 */

import { AhpClient } from '../src/client/index.js';
import { ActionType, SUPPORTED_PROTOCOL_VERSIONS } from '../src/types/index.js';
import { DemoHost } from './windowing-demo-host.js';

const TERMINAL = 'ahp-terminal:/demo';
const OUTPUT = [
  '$ npm test',
  '> demo@1.0.0 test',
  '> node --test',
  'ok 1 - parses the configuration file',
  'ok 2 - rejects an unknown option',
  'ok 3 - reads input from stdin',
  'ok 4 - writes the report',
  '# pass 4, fail 0',
];

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const log = (message: string) => console.log(`  client | ${message}`);

// The host accepts at most a 1024-byte window, so it fills after a few messages.
const host = new DemoHost({ clientWindowBytes: 1024, hostWindowBytes: 4096 });
const client = new AhpClient(host.clientTransport);
client.connect();
await client.initialize({ clientId: 'windowing-example', protocolVersions: SUPPORTED_PROTOCOL_VERSIONS });

// Windowing is off by default. Opt in for this subscription and offer a
// 4096-byte window. Coalescing is turned off so that every host message is a
// separate delivery; see windowing-backpressure.ts for coalescing.
const { subscription } = await client.subscribe(TERMINAL, {
  windowed: { windowBytes: 4096, coalescing: false },
});
const { mode, limits } = subscription.flowControl;
log(`subscribed: mode=${mode}, accepted window=${limits?.clientReceive.windowBytes} bytes`);

// The host writes terminal output as fast as the window allows.
void (async () => {
  await host.whenSubscribed();
  for (const line of OUTPUT) {
    await host.sendAction({ type: ActionType.TerminalData, data: `${line}\r\n` });
  }
})();

// With automatic release (the default), taking the next delivery releases the
// previous one. The client then returns credit for it.
let lines = 0;
for await (const delivery of subscription.deliveries()) {
  const { event } = delivery;
  const buffered = subscription.flowControl.bufferedReceiveBytes;
  if (event.type === 'snapshot') {
    log(`snapshot (${delivery.bytes} bytes; ${buffered} bytes not yet released)`);
  } else if (event.type === 'action' && event.params.action.type === ActionType.TerminalData) {
    const text = event.params.action.data.trimEnd();
    log(`output ${JSON.stringify(text)} (${delivery.bytes} bytes; ${buffered} bytes not yet released)`);
    lines++;
  }
  await sleep(20); // Simulate rendering the delivery.
  if (lines === OUTPUT.length) break; // Leaving the loop unsubscribes.
}

log(`received all ${lines} lines`);
host.close();
await client.shutdown();
