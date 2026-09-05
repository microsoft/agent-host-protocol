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
