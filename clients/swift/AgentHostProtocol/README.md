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

## Windowed delivery and backpressure

Windowing is off by default. Connection configuration supplies defaults but
does not enable it. Existing `subscribe(uri, delivery:view:)` calls are unchanged.
On a connected client, opt in with a managed subscription:

```swift
let subscription = try await client.subscribe(
    "ahp-terminal:/t1",
    options: .windowed(windowBytes: 262_144)
)
let result = await subscription.result
for try await delivery in subscription.events {
    await mirror.apply(delivery: delivery)
    // Auto mode releases this delivery when the loop asks for the next one.
}
```

The first delivery is the snapshot: `channel/snapshot` after acceptance, or
the ordinary result's snapshot when the host declines (if that snapshot exists).
There is no protocol-version gate. A parsed-only custom transport falls back
to ordinary delivery with status `fallbackReason == "transport"`. A host
declining the offer reports `"declined"`. TCP requires acceptance and never
falls back. Ordinary receive queues retain their existing unbounded behavior.

For manual credit, use `.windowed(receive: .manual)` and `deliveries`:

```swift
let subscription = try await client.subscribe(
    "ahp-terminal:/t1", options: .windowed(receive: .manual)
)
for try await delivery in subscription.deliveries {
    await mirror.apply(delivery: delivery)
    await delivery.release() // idempotent; call after processing, not on receipt
}
```

For terminal or TCP byte sinks, release after bytes have been written or accepted
by a bounded application buffer, not merely handed to another unbounded queue.
Non-final protocol fragments are credited when stored so that messages larger
than the window can complete; the final fragment is held until consumer release.
There is no additional logical-message or reassembly cap. Stop with
`try await subscription.close()`; breaking an auto loop alone does not release
its last item. Re-subscribe or `subscription.update(options:)` changes the same
handle. Windowed-to-windowed counters continue; changing mode resets counters.

Send methods await transport completion, not server processing:

```swift
try await subscription.waitUntilWritable() // advisory, not a reservation
try await subscription.send(
    method: "dispatchAction",
    params: DispatchActionParams(
        channel: subscription.channel, clientSeq: 1,
        action: .terminalInput(.init(type: .terminalInput, data: "hello\n"))
    )
)
let status = await subscription.status()
print(status.outstandingSendBytes, status.bufferedSendBytes)
```

The per-subscription queue defaults to 1 MiB for data waiting behind another
message; exceeding that queued allowance throws `AHPWindowingError.backpressure`.
A single message is accepted when the queue is empty even if it is larger than
the allowance: fragmentation and credit pace its transmission. Controls,
scheduler frames, and RPCs are never rejected by this user send cap.
Cancellation before emission removes the
send. Once fragmentation starts, the message is completed. Sends/dispatches
through the original client API also respect accepted windows. Requests and
generated controls (`channel/credit`, `unsubscribe`, `tcp/reset`) bypass full
data windows. Observe `subscription.statusChanges` and
`await client.flowControlEvents` without granting credit.

Configure defaults through `AHPClientConfig(windowing:)` or
`HostConfig.withWindowing(_:)`. All protocol sizes count the **complete raw JSON
text** as `text.utf16.count * 2`, not its UTF-8 transport payload:

```swift
let configuration = AHPClientConfig(windowing: AHPWindowingConfig(
    windowBytes: 262_144, maximumFrameBytes: 16_384,
    maxBufferedSendBytes: 1_048_576
))
```

When no frame override is supplied, URLSession derives the default from the
actual task's `maximumMessageSize` as `2 * (limit / 3)`: **699,050** UTF-16
bytes for the usual 1-MiB payload limit. The native NWConnection transport has
no message cap (its 65,536-byte read chunk is not one), so it uses the
**1,048,576**-byte fallback. Custom transports retain source compatibility:
adopt `AHPWindowingTransport` and declare raw-text capabilities to opt in;
parsed frames need an original JSON text envelope, never reconstructed text.

Coalescing is enabled by default only on accepted windowed subscriptions.
Adjacent queued terminal output and same-part/same-metadata chat deltas merge
locally; queued outbound TCP data merges decoded bytes. No latency preference
is added. Origins, clientSeq sends, snapshots, EOF/reset and epochs are barriers.
Disable with `.windowed(coalescing: false)`. Custom coalescers are registered
per connection and run before the built-ins:

```swift
let terminalCoalescer = AHPCoalescer(method: "action") { earlier, later, context in
    guard context.direction == "inbound" else { return nil }
    var first = try earlier.decode(ActionEnvelope.self)
    let second = try later.decode(ActionEnvelope.self)
    guard case .terminalData(let a) = first.action,
          case .terminalData(let b) = second.action else { return nil }
    first.action = .terminalData(.init(type: .terminalData, data: a.data + b.data))
    first.serverSeq = second.serverSeq
    return try AHPNotificationMessage(method: "action", params: first)
}
let configuration = AHPClientConfig(
    windowing: .init(coalescers: [terminalCoalescer])
)
```

A custom merge must preserve channel-required events and state. The library
checks channel/method identity and control exemptions; received credit still
uses the sum of original wire sizes, not the merged serialization.

Multi-host consumers use the same shape:
`multi.subscribe(host: hostId, uri: uri, options: .windowed())`. Its owner queue
survives reconnect, with per-channel retained sequence checkpoints and fresh
counters. Old deliveries remain readable but never credit the new connection.
Snapshot/replay/live recovery is per channel; dropped handles throw
`subscriptionDropped`. TCP streams close on connection loss and are never
resumed. `multi.flowControlEvents()` tags advisory flow events with a host ID.
Cancellation and request timeouts end only the caller's wait; a late negotiation
response is still processed in order without disconnecting the host. Unaccepted
subscriptions created by an abandoned call are removed, and late acceptance is
unsubscribed. Closing a handle cancels its credit timer and removes its replay
registration. A failed re-subscribe during reconnect closes only that handle,
not the other subscriptions or the host connection.
State mirrors can consume `apply(delivery:)` / `apply(host:delivery:)`; these
helpers never release credit implicitly. The sample app is not changed.

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
