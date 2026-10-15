# @microsoft/agent-host-protocol

TypeScript client for the [Agent Host Protocol (AHP)](https://microsoft.github.io/agent-host-protocol/).

[![npm](https://img.shields.io/npm/v/@microsoft/agent-host-protocol.svg)](https://www.npmjs.com/package/@microsoft/agent-host-protocol)

Browser-friendly client built on the global `WebSocket` API. Works in
modern browsers and Node 21+ without additional runtime dependencies.

## Entry points

The package exposes four subpath exports:

| Import path | What it gives you |
|---|---|
| `@microsoft/agent-host-protocol`        | Wire types, actions, commands, reducers, version constants. No I/O. |
| `@microsoft/agent-host-protocol/client` | `AhpClient`, `Subscription`, `ManagedSubscriptionManager`, `AhpStateMirror`, the `AhpTransport` interface, `InMemoryTransport`, and the error taxonomy. |
| `@microsoft/agent-host-protocol/hosts`  | `MultiHostClient`, `HostClientHandle`, `ReconnectPolicy`, `ClientIdStore` (with `InMemoryClientIdStore`), `MultiHostStateMirror`, and the `Host*Error` family. Builds on `/client` to manage one or more host connections with reconnect, generation-checked handles, and fan-in events. |
| `@microsoft/agent-host-protocol/ws`     | `WebSocketTransport` — an `AhpTransport` implementation backed by the global `WebSocket`. |

The split mirrors the Rust SDK (`ahp-types`, `ahp`, `ahp::hosts`,
`ahp-ws`) — wire types and reducers are decoupled from the client,
which is in turn decoupled from a specific transport and from the
multi-host orchestration layer.

## Quickstart

```ts
import { ActionType, type ActionEnvelope } from '@microsoft/agent-host-protocol';
import { AhpClient, AhpStateMirror } from '@microsoft/agent-host-protocol/client';
import { WebSocketTransport } from '@microsoft/agent-host-protocol/ws';

const transport = await WebSocketTransport.connect('ws://localhost:12345');
const client = new AhpClient(transport);
const mirror = new AhpStateMirror();

client.connect();

const init = await client.initialize({
  clientId: 'my-client',
  protocolVersions: ['0.3.0'],
  initialSubscriptions: ['ahp-root://'],
});

for (const snapshot of init.snapshots) {
  mirror.applySnapshot(snapshot);
}

const root = client.attachSubscription('ahp-root://');
(async () => {
  for await (const event of root) {
    if (event.type === 'action') mirror.apply(event.params);
  }
})();

const sessionUri = `ahp-session:/${crypto.randomUUID()}`;
client.dispatch(sessionUri, {
  type: ActionType.SessionTurnStarted,
  // … remaining action fields
} as unknown as ActionEnvelope['action']);
```

## Pluggable transports

`AhpClient` is transport-agnostic. Any framed message stream — a
WebSocket, a Unix socket, stdio, or an in-memory pair for tests — can
back an `AhpTransport`:

```ts
import type { AhpTransport, TransportFrame, JsonRpcMessage } from '@microsoft/agent-host-protocol/client';

class MyTransport implements AhpTransport {
  send(message: JsonRpcMessage | string): void { /* … */ }
  async recv(): Promise<TransportFrame | null> { /* … */ }
  close(): void { /* … */ }
}
```

`InMemoryTransport.pair()` returns two connected halves that exchange
text frames — handy for unit tests that don't need a real socket.

## Shared subscription ownership

`ManagedSubscriptionManager` coalesces concurrent consumers of the same URI
onto one wire-level subscription. Each named lease receives an independent
event iterator. Disposing the last lease sends `unsubscribe`; failed subscriptions are
cleaned up so the next acquire makes a fresh request.

```ts
import type { SessionState } from '@microsoft/agent-host-protocol';
import {
  ManagedSubscriptionManager,
  type SubscriptionEvent,
} from '@microsoft/agent-host-protocol/client';

const subscriptions = new ManagedSubscriptionManager(client);
let consume: Promise<void>;
{
  using lease = subscriptions.acquire<SessionState, SubscriptionEvent>(
    sessionUri,
    'SessionEditor',
  );

  const { snapshot } = await lease.subscription.ready;
  if (snapshot) mirror.applySnapshot(snapshot);
  consume = (async () => {
    for await (const event of lease.events) {
      if (event.type === 'action') mirror.apply(event.params);
    }
  })();

  // Use the subscription. Leaving this block disposes the lease.
}
await consume;
```

Acquire the lease before awaiting `ready`: its event iterator is attached
before the `subscribe` request is sent, so actions delivered during the
snapshot round-trip remain ordered behind that snapshot instead of being lost.

## Windowed delivery and backpressure

Windowing is **off by default**. Opt in on each subscription:

```ts
const { subscription } = await client.subscribe(terminalUri, { windowed: true });
for await (const event of subscription) {
  if (event.type === 'snapshot') {
    mirror.applySnapshot(event.params.snapshot);
  } else if (event.type === 'action') {
    await renderTerminal(event.params);
  }
}
```

The first event is the snapshot, whether the host accepts windowing or declines
and returns an ordinary snapshot. With automatic release (the default), asking
for the next event releases the previous one. Await work inside the loop to
slow down the host. Closing a windowed owner (including an iterator's `return()`)
unsubscribes it and stops credit, including pending timers and old receipts.
Ordinary local observer iterators retain their existing close behavior.

The extended `DeliveryEvent` type includes snapshots, TCP data/EOF/reset, and
unknown notifications, without extending the legacy `SubscriptionEvent` union.
`subscribe(uri, { windowed: true })` returns `Subscription<DeliveryEvent>`;
existing ordinary calls keep their existing type and buffering behavior.
An ordinary empty-state result without a snapshot has no synthetic snapshot.

### Examples

Two runnable examples use an in-memory demo host that follows the window rules,
so they need no server:

- [`examples/windowing-basic.ts`](examples/windowing-basic.ts) opts a terminal
  subscription into windowed delivery and shows the host pausing when the
  window is full and resuming as the client returns credit.
- [`examples/windowing-backpressure.ts`](examples/windowing-backpressure.ts)
  adds a slow renderer, a custom coalescer that keeps only the latest terminal
  resize, and a paste that waits for `waitWritable()` instead of queueing.

```sh
npx tsx examples/windowing-basic.ts
npx tsx examples/windowing-backpressure.ts
npm run typecheck:examples
```

The examples import from `../src`; applications import from
`@microsoft/agent-host-protocol/client` instead.

### Defaults and transport support

```ts
const transport = await WebSocketTransport.connect(url, {
  maximumFrameBytes: 1_048_576, // UTF-16 bytes, including the JSON envelope
});
const client = new AhpClient(transport, {
  windowing: {
    windowBytes: 262_144,
    // maximumFrameBytes: override the transport-derived default if needed
    maxBufferedSendBytes: 1_048_576,
    coalescers: [],
  },
});
const { subscription } = await client.subscribe(terminalUri, {
  windowed: { windowBytes: 65_536, maximumFrameBytes: 16_384 },
  // Existing delivery and view preferences remain independent.
});
```

Connection configuration supplies defaults; it does not enable windowing.
Global WebSocket exposes no native maximum message size, so this adapter's
default `maximumFrameBytes` is **1,048,576**. `fromSocket(socket, options)`
accepts the same override. There are no new runtime dependencies.
When windowing is active, the scheduler also uses the adapter's cancelable
`waitWritable()` to keep the physical WebSocket send buffer near its internal
1 MiB high-water / 256 KiB low-water marks. `bufferedAmount` remains available
in transport bytes, separately from the subscription's UTF-16 accounting.

Custom transports opt in by exposing `supportsWindowedDelivery = true`. They
must return exact text frames, UTF-8 binary frames, or parsed frames with
`rawText` containing the original JSON, and must send pre-serialized strings
verbatim. A parsed-only transport can keep its existing implementation; the
subscription reports `fallbackReason: 'transport'` and does not offer windowing.
Host rejection reports `'declined'`. There is no protocol-version gating.
TCP requires accepted windowing and never falls back.
Before using the low-level `createTcpConnection` request, check that the host
advertised `InitializeResult.tcpConnections`; raw request APIs otherwise remain
capability-agnostic.

### Manual receive release

```ts
const { subscription } = await client.subscribe(tcpUri, {
  windowed: { receive: 'manual' },
});
for await (const delivery of subscription.deliveries()) {
  if (delivery.event.type === 'tcpData') {
    const bytes = Uint8Array.from(atob(delivery.event.params.data), c => c.charCodeAt(0));
    await sink.write(bytes);
  }
  delivery.release(); // idempotent; releases only this delivery's remaining credit
}
```

Use one owner to consume the reliable queue; do not mix `next()` and
`deliveries()` on that handle. `deliveries()` also works in auto mode and
automatically releases the previous receipt on advance. `delivery.bytes` is the
sum of the **original raw wire sizes**, not a re-serialization of its payload.

Fragments are special: non-final fragments are credited when stored so that a
message larger than the window can finish. The final fragment is credited on
consumer release. The receipt includes every original fragment's size, but
`release()` never credits a non-final fragment twice. Windowing is not a limit
on complete-message size or total retained memory; a consumer must still avoid
retaining unbounded application data.

### Send-side backpressure and diagnostics

```ts
for await (const chunk of boundedSource) {
  await subscription.waitWritable();
  const binary = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
  await client.notifyAsync('tcp/data', { channel: tcpUri, data: btoa(binary) });
}
await client.notifyAsync('tcp/eof', { channel: tcpUri });
```

Use bounded source chunks and await each send instead of constructing an
unbounded set of promises. `notifyAsync(method, params, { signal? })` and
`dispatchAsync(channel, action, { clientSeq?, signal? })` complete when written
to the transport, not when echoed, processed, or flushed by a WebSocket.
The window, fragmentation, and a fair per-channel scheduler apply to both
async sends and the existing synchronous `notify`/`dispatch`.
The first logical send is accepted even if it exceeds `maxBufferedSendBytes`;
the window and fragmentation pace it. The cap bounds data queued behind that
head message, and coalescing does not bypass it. Queue overflow throws/rejects
with `BackpressureError` without disconnecting the client; awaited sends also
fail on overflow rather than retaining unbounded admission waiters. `waitWritable`
is advisory, not a reservation when multiple producers share a subscription.

Cancellation removes a queued message before transmission begins; a fragmented
message that has started is completed to preserve framing. Unsent messages fail
on connection loss and are never automatically replayed. TCP EOF is ordered and
counts against the window; TCP reset bypasses the window and discards pending data.

`subscription.flowControl` (or `client.flowControl(uri)`) reports mode, negotiated
limits, outstanding sends, queued sends, unreleased receive bytes, and writability.
`flowControlChanges()` observes changes without releasing credit.
`client.waitWritable(uri, { signal? })` is the connection-level convenience API.
`client.flowControlEvents()` provides a lossy observer stream for blocked/unblocked,
credit, fragments, coalescing, resumed, and dropped events.
Credit batching and exempt-message queue/size/rate bounds are internal policies,
not additional public configuration.
Malformed frames on accepted windowed connections and protocol violations close
the connection with a `TransportError` of kind `protocol`.

### Coalescing and custom behavior

Coalescing defaults to on for accepted windowing and can be disabled with
`windowed: { coalescing: false }`. It merges only adjacent queued items, adds no
delay, and never changes an item already handed to its consumer.
Built-ins concatenate received terminal output, concatenate chat deltas for the
same turn/part/metadata, and concatenate **decoded** outgoing TCP bytes.
Origins/rejections, distinct dispatch sequence numbers, snapshots, EOF/reset,
unknown methods, and different connection epochs are not merged by the built-ins.
Receive coalescing is local and independent of `delivery.maxLatencyMs`.

Register pure custom coalescers per connection, before the built-ins:

```ts
import type { ActionEnvelope } from '@microsoft/agent-host-protocol';
import type { ChannelCoalescer } from '@microsoft/agent-host-protocol/client';

const terminalCoalescer: ChannelCoalescer = {
  method: 'action',
  merge(earlier, later, { direction }) {
    if (direction !== 'receive') return;
    const a = earlier.params as ActionEnvelope;
    const b = later.params as ActionEnvelope;
    if (a.action.type !== 'terminal/data' || b.action.type !== 'terminal/data') return;
    return {
      ...later,
      params: { ...b, action: { ...b.action, data: a.action.data + b.action.data } },
    };
  },
};
const client = new AhpClient(transport, { windowing: { coalescers: [terminalCoalescer] } });
```

A custom merge must preserve channel semantics and required events. The client
enforces channel/method identity and excludes controls, snapshots, dispatches,
origins, and cross-epoch merges. Returning `undefined` delegates to the next
custom coalescer or built-in.

### Shared ownership and reconnect

`ManagedSubscriptionManager.acquire(uri, owner, { windowed: ... })` exposes a
single reliable owner through `lease.deliveries()` (also
`lease.subscription.deliveries()`). Choose one lease to consume that stream;
the existing independent `lease.events` iterators remain lossy observers.
They never release the owner queue's credit. Managed status also exposes
`flowControl`, `flowControlChanges()` and `waitWritable()`.
Active windowed leases on a multi-host client's raw connection automatically
rebind their owner queue and observer fan-out before the next handshake; a dropped
subscription closes the managed entry with an observable error.
A failed per-channel re-subscribe drops only that channel, not the host.
Closing the owner removes it from future reconnect requests.

`subscribe(uri, { windowed: true, signal })` supports local cancellation.
Canceled/timed-out requests clean up their provisional state, and late server
acceptances are accounted for or unsubscribed rather than closing the connection.

`MultiHostClient.subscribe(hostId, uri, { windowed: true })` returns
`{ result, subscription }`; its existing two-argument call still returns the
ordinary `SubscribeResult`. `HostConfig.clientConfig.windowing` supplies defaults.
Host-aware async sends, `flowControl`, `waitWritable`, and `flowControlEvents`
are available; telemetry carries `hostId`. `HostClientHandle` checks generation
before and after awaited sends.

The multi-host supervisor keeps the owner handle, queued deliveries and options
across reconnect. It sends `reconnect.windows` using each queue's retained
sequence, resets wire counters, and appends snapshot/replay/live recovery data
after retained items. Releasing an old-connection receipt sends no credit on the
new connection. Dropped channels end with a visible error. TCP never resumes.
Low-level `client.reconnect` also accepts the generated `windows` parameter.
Global `events()` and `deliveryEvents()` are observe-only; use owner deliveries
with `AhpStateMirror.applyDelivery` or
`MultiHostStateMirror.applyDelivery(hostId, delivery)` for reliable state feeding.

## Reducers and state mirror

The reducer functions (`rootReducer`, `sessionReducer`,
`terminalReducer`, `changesetReducer`) are pure: replaying actions in
`serverSeq` order on any prior snapshot yields identical state. This
is the same property the Rust and Swift clients rely on for
reconnection.

`AhpStateMirror` is a convenience that holds one `RootState`, a
`Map<URI, SessionState>`, a `Map<URI, TerminalState>`, and a
`Map<URI, ChangesetState>`. Apply `Snapshot`s and `ActionEnvelope`s and
it keeps those maps up to date. Larger apps usually keep their own
state and call the reducers directly.

## Errors

| Class | When it's thrown |
|---|---|
| `RpcError`           | JSON-RPC error response from the server. Carries `code`, `message`, `data`. |
| `RpcTimeoutError`    | Client-side timeout fired before the server responded. Carries `method`, `timeoutMs`. Distinct from `RpcError`. |
| `TransportError`     | Failure of the underlying transport. `kind: 'closed' \| 'io' \| 'protocol'`. |
| `ClientClosedError`  | Request was in flight when the client was shut down. |
| `AhpClientError`     | Base class for every error this SDK throws — use `instanceof` to catch them all. |

Malformed inbound frames don't throw — they're logged via `console.warn` and the channel stays alive (matching the Rust client's `tracing::warn!` behavior). Pending requests still time out via `RpcTimeoutError` if the dropped frame would have been their reply.

## Server-initiated requests

Some AHP methods (currently `resourceRequest`) can be initiated by the
server. By default, the client responds with JSON-RPC `MethodNotFound`
so the server does not leak a pending request. Install a typed handler
to take over:

```ts
client.setServerRequestHandler(async (method, params) => {
  if (method === 'resourceRequest') {
    return { /* … */ };
  }
  throw new RpcError(JsonRpcErrorCodes.MethodNotFound, 'unhandled');
});
```

## Reconnection

`AhpClient.reconnect(...)` sends the typed AHP `reconnect` request on
an already-open transport. It does not decide when to reconnect, how
often to retry, whether authentication errors are terminal, or how to
update UI while reconnecting — those policies live in the app.

A typical app-level reconnect flow is:

1. Open a fresh transport and `AhpClient`.
2. Attach event streams before the handshake.
3. Call `connect()` and `reconnect({ clientId, lastSeenServerSeq, subscriptions })`.
4. Apply the returned replay actions or snapshots to your app store.
5. Re-fetch `listSessions` or other ephemeral data — protocol
   notifications are not replayed.

If you'd rather not write that loop yourself, see
[`@microsoft/agent-host-protocol/hosts`](#multi-host-orchestration) —
it ships a `MultiHostClient` that owns the reconnect supervisor,
re-subscribes across reconnects, mirrors root state, and exposes
generation-checked client handles. Single-host consumers use
`MultiHostClient.single(...)`.

## Multi-host orchestration

For apps that talk to **one or more** AHP hosts at once (a local
sessions server plus a tunnel-attached remote, multiple project hosts
in a sidebar, …), the `@microsoft/agent-host-protocol/hosts` entry
point ships `MultiHostClient`:

```ts
import { ActionType } from '@microsoft/agent-host-protocol';
import { WebSocketTransport } from '@microsoft/agent-host-protocol/ws';
import {
  MultiHostClient,
  type HostTransportFactory,
} from '@microsoft/agent-host-protocol/hosts';

const openLocal: HostTransportFactory = async (_hostId, _signal) =>
  WebSocketTransport.connect('ws://localhost:12345');

// Single-host: same API, never see "registry" concepts.
const { multi, host } = await MultiHostClient.single({
  id: 'local',
  label: 'Local sessions server',
  transportFactory: openLocal,
});
console.log(`connected to ${host.label}: ${host.state.status}`);

// Multi-host: add as many as you need.
await multi.addHost({
  id: 'tunnel',
  label: 'Tunnel',
  transportFactory: async (_id, _signal) =>
    WebSocketTransport.connect('wss://my-tunnel.example/sessions'),
});

// Fan-in of every inbound event, tagged with host of origin.
for await (const event of multi.events()) {
  console.log(`[${event.hostId}] ${event.channel}`, event.event.type);
}
```

Each host runs its own reconnect supervisor with the configured
`ReconnectPolicy` (defaults to exponential backoff from 250 ms to 30 s
with 25 % jitter), re-subscribes to known URIs after reconnects, and
mirrors root state plus a session-summary cache so `MultiHostClient
.aggregatedSessions()` and `aggregatedAgents()` are snapshot reads,
not fan-out subscriptions. Every successful (re)connect bumps a per-
host `generation` counter; `HostClientHandle`s minted at an earlier
generation throw `HostReconnectedError` instead of silently writing to
the new connection.

Persistent `clientId`s are pluggable via the `ClientIdStore`
interface. The default `InMemoryClientIdStore` is session-stable;
production apps that need cross-launch identity wrap their platform's
secure storage (`localStorage`, IndexedDB, Node `fs`,
`safeStorage`, …) in a custom `ClientIdStore`.

For multi-host state, `MultiHostStateMirror` keys per-resource state
by `(hostId, uri)` so URIs that legitimately collide across hosts
(the normal case for session URIs) don't clobber each other.

## Wire types

The wire types under `src/types/` are generated from `types/*.ts` at the
repository root and are **not committed** to the repo — avoiding a
byte-for-byte duplication of the canonical TypeScript sources. Regenerate
them whenever you pull or change the protocol:

```bash
npm run generate:typescript    # from the repo root
```

Generated files carry a banner; do not edit them by hand. The
`generate:typescript` script is also part of `npm run generate`, which
regenerates every language's client output.

## Protocol version mapping

This package exports two protocol-version constants from its default
entry point:

```ts
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '@microsoft/agent-host-protocol';
```

- `PROTOCOL_VERSION` — SemVer string for the version this package's
  source tree implements.
- `SUPPORTED_PROTOCOL_VERSIONS` — every version this package is willing
  to negotiate (most-preferred-first). Pass it as `protocolVersions` on
  `InitializeParams`:

  ```ts
  await client.initialize({
    clientId: 'my-client',
    protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    initialSubscriptions: ['ahp-root://'],
  });
  ```

The same information is mirrored, in machine-readable form, in
[`release-metadata.json`](release-metadata.json) and, in human-readable
form, in [`CHANGELOG.md`](CHANGELOG.md). CI verifies all three sources
agree on every PR.

## Development

From a fresh checkout:

```bash
# 1. Install the root tooling and generate the TS client's wire types.
npm install
npm run generate:typescript

# 2. Work in the client package.
cd clients/typescript
npm install
npm run typecheck
npm test
npm run build
```

CI runs the generate step automatically before the install/typecheck/test/build
sequence, so contributors only need to remember step 1 locally after pulling
protocol changes.

## License

MIT
