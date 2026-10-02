# AgentHostProtocol Swift Package

This package contains the Swift libraries for the Agent Host Protocol (AHP). The package manifest lives at the repository root because Swift Package Manager resolves remote packages from the root `Package.swift`, while the Swift sources live under `clients/swift/AgentHostProtocol/`.

## Products

- `AgentHostProtocol` provides generated protocol types, commands, notifications, actions, and reducers. Use this product when you only need to decode protocol data or apply state reducers yourself.
- `AgentHostProtocolClient` provides reusable client helpers on top of `AgentHostProtocol`:
  - The single-host `AHPClient` for JSON-RPC request correlation, subscription fan-out, transport integration, and typed helpers for `initialize`, `reconnect`, `subscribe`, `unsubscribe`, `dispatch`, and arbitrary requests.
  - `MultiHostClient` for apps that need supervised connections to more than one host. Provides per-host supervisor tasks with backoff, generation-checked client handles, a per-host session-summary cache, aggregated views, and runtime-owned per-resource event streams that survive reconnects.
  - State mirror helpers: `AHPStateMirror` (single-host) and `MultiHostStateMirror` (multi-host, keyed by `(hostId, uri)`).
  - `ClientIdStore` implementations: `InMemoryClientIdStore` (default) and `FileClientIdStore` (filesystem-backed, atomic writes).

The client product is intentionally a protocol/client layer, not a full app store. App-specific policy such as server selection, authentication, reconnect UX, durable session caches, and optimistic outbound action replay should live in the app. `MultiHostClient` owns per-host supervisor policy, backoff, fan-in, and aggregated host views; it does not replace an app's product state model.

## Installation

Add this repository as a SwiftPM dependency:

```swift
.package(url: "https://github.com/microsoft/agent-host-protocol.git", from: "0.1.0")
```

Then depend on one or both products:

```swift
.target(
    name: "MyApp",
    dependencies: [
        .product(name: "AgentHostProtocol", package: "agent-host-protocol"),
        .product(name: "AgentHostProtocolClient", package: "agent-host-protocol"),
    ]
)
```

## Minimal Single-Host Client

This example opens one WebSocket connection, subscribes to the root channel during `initialize`, applies the returned snapshots, and then applies subsequent action events.

```swift
import AgentHostProtocol
import AgentHostProtocolClient
import Foundation

let transport = URLSessionWebSocketTransport(url: URL(string: "wss://example.com/ahp")!)
let client = AHPClient(transport: transport)
let mirror = AHPStateMirror()

// Attach event streams before connecting so notifications delivered during the
// initialize window are not missed.
let events = await client.events

Task {
    for await event in events {
        switch event.event {
        case .action(let envelope):
            await mirror.apply(envelope)
        case .sessionAdded, .sessionRemoved, .sessionSummaryChanged, .authRequired:
            // Protocol notifications are ephemeral and are not replayed on
            // reconnect. Apps commonly refresh listSessions() after reconnect.
            print("notification: \(event.event)")
        }
    }
}

try await client.connect()

let initialized = try await client.initialize(
    clientId: "my-client-id",
    protocolVersions: ["0.2.0"],
    initialSubscriptions: [RootResourceURI]
)

for snapshot in initialized.snapshots {
    await mirror.applySnapshot(snapshot)
}
```

`AHPStateMirror` is a convenience for simple consumers. Larger apps can keep their own state store and route snapshots/actions through the generated reducers directly.

## Owned TCP Streams

After `initialize` negotiates `tcpConnections`, open an integrated stream:

```swift
let tcp = try await client.openTcpConnection(
    session: sessionURI,
    create: TcpConnectionSubscription(
        type: "tcpConnection", host: "localhost", port: 3000, encoding: .base64,
        receiveWindowBytes: 65536, maximumChunkSize: 16384
    )
)
try await tcp.write(requestBytes)
try await tcp.end() // input EOF; output remains readable
while let bytes = try await tcp.read() {
    try await consume(bytes)
}
try await tcp.dispose()
```

The SDK owns buffering, flow control, and replay. One reader and one writer may
run concurrently. `read()` releases receive credit; `drain()` waits for destination
consumption. `close()` stops writes but retains crossing output, so keep reading
during graceful close. `dispose()` aborts without draining; call it on
error/cancellation too.

Transport loss suspends the same handles. Connect a fresh `AHPClient` and call
`reconnectTcpConnections(params:connections:)` with the original `clientId`;
apply its returned replay to ordinary subscriptions. For deliberate transport
replacement, use `shutdown(preservingTcpConnections: true)` instead of normal
shutdown, which terminates streams.

With `MultiHostClient`, use `HostClientHandle.openTcpConnection(session:create:)`
for automatic reconnect. Host removal/shutdown terminates retained streams.
Missing resources and snapshot fallback fail streams rather than creating new
sockets. TCP streams do not belong in ordinary state mirrors.

For lower-level accounting, `try tcpReducer(state:action:)` returns a new state;
`try AHPTcpReducer().reduce(into:action:)` updates in place after validation.
Invalid actions throw `TcpReducerError` without changing state.
Transport policy, connection limits, and native socket bridges remain
application-owned. See the [TCP channel contract](../../../docs/specification/tcp-channel.md).

## Lower-Level Strict Events

For custom loss-sensitive consumers, attach `await client.strictEvents()` before
sending requests and retain it for `for try await` consumption. Overflow throws
`SubscriptionLagError`; decode loss throws `TransportError.protocol`. Both
terminate the receiver rather than skipping events. Capacity uses
`AHPClientConfig.subscriptionBufferSize`; ordinary receivers are unchanged.
These raw receivers are global. The owned TCP adapter instead registers a strict
child-scoped receiver during creation reply processing and reattaches it per
child on reconnect. Unrelated traffic cannot exhaust a TCP stream's event buffer.

## Multi-Host Client

Use `MultiHostClient` when one app talks to more than one AHP host, or when you want the same supervisor model for a single host. It owns per-host transport creation, reconnect backoff, stable `clientId` lookup, event fan-in, session-summary caches, generation-checked client handles, and deterministic aggregated views.

```swift
import AgentHostProtocolClient
import Foundation

let local = HostConfig(id: "local", label: "Local") { _ in
    URLSessionWebSocketTransport(url: URL(string: "wss://local.example/ahp")!)
}

let remote = HostConfig(id: "remote", label: "Remote") { _ in
    URLSessionWebSocketTransport(url: URL(string: "wss://remote.example/ahp")!)
}

let multi = MultiHostClient()
try await multi.add(local)
try await multi.add(remote)

let events = await multi.events()
Task {
    for await event in events {
        print("[\(event.hostId)] \(String(describing: event.resource))")
    }
}

let sessions = await multi.aggregatedSessions()
for hosted in sessions {
    print("[\(hosted.hostLabel)] \(hosted.summary.title)")
}
```

Single-host consumers can use the same shape with `MultiHostClient.single(...)` and never manage a registry directly.

## Protocol version mapping

The `AgentHostProtocol` module exposes two protocol-version constants:

- `PROTOCOL_VERSION` — SemVer string for the version this package's
  source tree implements.
- `SUPPORTED_PROTOCOL_VERSIONS` — every version this package is willing
  to negotiate (most-preferred-first). Pass it as `protocolVersions` on
  `InitializeParams`.

The same information is mirrored, in machine-readable form, in
[`clients/swift/release-metadata.json`](../release-metadata.json) and,
in human-readable form, in [`clients/swift/CHANGELOG.md`](../CHANGELOG.md).
CI verifies all three sources agree on every PR.

## Reconnect Layering

`AHPClient.reconnect(...)` sends the typed AHP `reconnect` request on an already-open transport. It does not decide when to reconnect, how often to retry, whether to fall back to `initialize`, whether authentication errors are terminal, or how to update UI while reconnecting.

A typical app-level reconnect flow is:

1. Open a fresh transport and `AHPClient`.
2. Attach event streams before the handshake.
3. Call `connect()`.
4. Call `reconnect(clientId:lastSeenServerSeq:subscriptions:)`.
5. Apply the returned replay actions or snapshots to the app store.
6. Re-fetch `listSessions` or other ephemeral data because protocol notifications are not replayed.
7. Resume any app-owned pending outbound actions that were not acknowledged.

`MultiHostClient` owns this supervisor policy per host. The lower-level `AHPClient` keeps reconnect orchestration explicit for callers that want full control.

## Dispatch And App-Owned Outboxes

`dispatchAction` is a fire-and-forget notification. The server acknowledgement comes later when a live or replayed `ActionEnvelope` includes the same `origin.clientId` and `origin.clientSeq`.

`AHPClient.dispatch(_:channel:)` is a convenience for simple clients; it assigns `clientSeq` internally and returns a `DispatchHandle` with the sequence that was sent. `AHPClient.dispatch(_:channel:clientSeq:)`, `MultiHostClient.dispatch(host:action:channel:clientSeq:)`, and `HostClientHandle.dispatch(_:channel:clientSeq:)` let higher layers supply stable sequence numbers directly.

Apps that need to replay unacknowledged local actions after reconnect should own their outbound queue and send explicit `clientSeq` values:

```swift
struct PendingOutboundAction {
    let clientSeq: Int
    let channel: String
    let action: StateAction
}

var nextClientSeq = 1
var pendingOutboundActions: [PendingOutboundAction] = []

func dispatchFromApp(_ action: StateAction, channel: String, multi: MultiHostClient) async throws {
    let seq = nextClientSeq
    nextClientSeq += 1
    pendingOutboundActions.append(PendingOutboundAction(clientSeq: seq, channel: channel, action: action))

    try await multi.dispatch(host: "local", action: action, channel: channel, clientSeq: seq)
}

func acknowledge(_ envelope: ActionEnvelope, clientId: String) {
    guard let origin = envelope.origin,
          origin.clientId == clientId,
          pendingOutboundActions.first?.clientSeq == origin.clientSeq else { return }
    pendingOutboundActions.removeFirst()
}
```

This stays outside the low-level client because replay policy is app-specific. A chat message, terminal resize, terminal input, and transient UI toggle may all have different replay/coalescing behavior.

## Subscription Ownership

`subscribe(uri)` returns the server snapshot plus a stream of subsequent events for that resource URI.

`unsubscribe(uri)` is resource-wide: it sends `unsubscribe` to the server and finishes all local streams for that URI. It is not a per-view cancellation handle and it does not maintain listener reference counts.

Apps should normally centralize protocol subscriptions in one owner, such as an app store or host supervisor, and let views observe state from that owner. A future higher-level API can add refcounted subscription handles if multiple independent components need to subscribe to the same URI directly.

## Transport Choice

`AHPTransport` is the transport abstraction. The default `URLSessionWebSocketTransport` is suitable for many `wss://` deployments and simple clients.

For iOS/macOS local development, LAN, and Tailscale-style `ws://` targets, `NWConnectionWebSocketTransport` uses Network.framework directly. It avoids `URLSession` ATS behavior for local `ws://` development, performs the WebSocket upgrade explicitly, and exposes WebSocket ping support through `AHPKeepAliveTransport`.

```swift
let transport = NWConnectionWebSocketTransport(
    url: URL(string: "ws://192.168.1.42:8080/ahp")!,
    headers: ["Authorization": "Bearer \(token)"]
)
```

Keepalive is opt-in on `AHPClientConfig`. When enabled and the transport conforms to `AHPKeepAliveTransport`, ping failure is treated as a transport failure so the app or `MultiHostClient` reconnect policy can recover:

```swift
let config = AHPClientConfig(
    keepAlive: .enabled(interval: .seconds(30), timeout: .seconds(5))
)
```

Prefer inbound `.text` or `.binary` frames from transports. Inbound `.parsed` frames may bypass the client's raw JSON parsing path that preserves Apple `NSNumber` Bool/Int distinctions.

## Next Steps For This Client

- Add protocol transcript fixtures, similar in spirit to the reducer fixture tests, to validate client/server flows across languages.
- Migrate the example iOS app through an adapter around `MultiHostClient`/`AHPClient` while keeping app policy in `AppStore`.
