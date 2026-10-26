# Agent Host Protocol — Go client

Go module for the [Agent Host Protocol](https://microsoft.github.io/agent-host-protocol/).

The module is split into three packages that mirror the Rust client's
three-crate split:

| Package | Use it for |
| ------- | ---------- |
| [`ahptypes`](./ahptypes) | Wire protocol types only — no I/O, no goroutines. Pull this in if you only need to parse or construct AHP JSON-RPC messages. |
| [`ahp`](./ahp) | Async `Client` over a pluggable `Transport`, pure reducers, and the multi-host runtime under [`ahp/hosts`](./ahp/hosts). |
| [`ahpws`](./ahpws) | WebSocket transport built on [`github.com/coder/websocket`](https://github.com/coder/websocket). |

## Install

```bash
go get github.com/microsoft/agent-host-protocol/clients/go@latest
```

Then import the package(s) you need:

```go
import (
    "github.com/microsoft/agent-host-protocol/clients/go/ahp"
    "github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
    "github.com/microsoft/agent-host-protocol/clients/go/ahpws"
)
```

## Quickstart (WebSocket)

```go
ctx := context.Background()

transport, err := ahpws.Connect(ctx, "ws://localhost:12345")
if err != nil {
    log.Fatal(err)
}

client, err := ahp.Connect(ctx, transport, ahp.DefaultConfig())
if err != nil {
    log.Fatal(err)
}
defer client.Shutdown(ctx)

if _, err := client.Initialize(ctx, "my-client", ahptypes.SupportedProtocolVersions(), nil); err != nil {
    log.Fatal(err)
}

snap, sub, err := client.Subscribe(ctx, "ahp-session:/s1")
if err != nil {
    log.Fatal(err)
}
_ = snap

for evt := range sub.Events() {
    if action, ok := evt.(ahp.SubscriptionEventAction); ok {
        fmt.Printf("seq=%d action=%T\n", action.Envelope.ServerSeq, action.Envelope.Action.Value)
    }
}
```

## Windowed delivery

Windowing is **off by default**. `Config.Windowing` supplies connection defaults;
`SubscribeWithOptions` opts one subscription in. Sizes are UTF-16 bytes of the
actual JSON text, including envelopes and escaping, not payload/UTF-8 sizes.

```go
cfg := ahp.DefaultConfig()
cfg.Windowing.WindowBytes = 256 << 10
cfg.Windowing.MaxBufferedSendBytes = 1 << 20 // per subscription
// Optional: override the transport-derived maximum based on your transport.
cfg.Windowing.MaximumFrameBytes = 16 << 10

client, err := ahp.Connect(ctx, transport, cfg)
if err != nil { return err }
defer client.Shutdown(ctx)

if _, err := client.Initialize(ctx, "client-id",
    ahptypes.SupportedProtocolVersions(), nil); err != nil { return err }

result, sub, err := client.SubscribeWithOptions(ctx, "ahp-terminal:/t1",
    ahp.SubscribeOptions{Window: &ahp.WindowOptions{}})
if err != nil { return err }
defer sub.Close()
_ = result
for {
    delivery, err := sub.Next(ctx)
    if err != nil { break }
    switch event := delivery.Event().(type) {
    case ahp.SubscriptionEventSnapshot:
        // Replace the local state using event.Params.Snapshot.
        _ = event
    case ahp.SubscriptionEventAction:
        // Apply/render event.Envelope, completing the work before Next.
        _ = event
    }
}
```

`ReceiveAuto` (default) releases the **previous** delivery when `Next` is called
again, even if that call begins waiting or its context is canceled. Thus work
performed between calls holds credit. Call `sub.Close()` if you leave the loop.
`Events()`, `Client.Events()` and host subscription event streams remain lossy
observers: reading them **does not release credit**. Use `Next` on an
options-based subscription for credit-owning consumption. Legacy subscription
APIs keep their existing buffered event-channel behavior.

For manual acknowledgement, request `ReceiveManual` and call `Release` only
when application processing, or writing to a bounded downstream sink, completes:

```go
_, sub, err := client.SubscribeWithOptions(ctx, uri, ahp.SubscribeOptions{
    Window: &ahp.WindowOptions{Receive: ahp.ReceiveManual},
})
if err != nil { return err }
defer sub.Close()
for {
    delivery, err := sub.Next(ctx)
    if err != nil { return err }
    if err := process(delivery.Event()); err != nil {
        delivery.Release() // Rejected/discarded events can also be released.
        return err
    }
    delivery.Release() // Idempotent; may be called from another goroutine.
}
```

The first delivery is the snapshot. When a host declines windowing, its result
snapshot is injected as an uncharged delivery; `Release` is then a no-op and
ordinary buffering applies. There is no protocol-version gate and no change to
version offers. Inspect `sub.FlowControl().Mode` and `.FallbackReason`
(`declined` or `transport`) to distinguish fallback. TCP subscriptions require
acceptance, cannot be initial subscriptions, and never resume automatically.
TCP socket bridging is application-owned.

Repeated `SubscribeWithOptions` for the same channel updates the **same owner**
handle; `sub.Update(ctx, options)` is equivalent. Counters continue for
windowed-to-windowed updates. Limits, snapshot views and delivery preferences
are independent; the SDK never adds `maxLatencyMs` automatically.

### Examples

Two runnable examples use an in-memory demo host that follows the window rules,
so they need no server:

- [`examples/windowing_basic`](examples/windowing_basic/main.go) opts a terminal
  subscription into windowed delivery and shows the host pausing when the
  window is full and resuming as the client returns credit.
- [`examples/windowing_backpressure`](examples/windowing_backpressure/main.go)
  adds a slow renderer, a custom coalescer that keeps only the latest terminal
  resize, and a paste that waits for `WaitWritable` instead of queueing.

```sh
go run ./examples/windowing_basic
go run ./examples/windowing_backpressure
```

The demo host and its in-memory transport live in
[`examples/internal/demohost`](examples/internal/demohost); they implement the
public `ahp.Transport` and `ahp.TransportCapabilitiesProvider` interfaces.

### Send-side backpressure and observability

`Notify` and `Dispatch` await the actual transport write, including credit and
fragment scheduling. `ErrBackpressure` means data queued behind another send
has reached `MaxBufferedSendBytes` (default 1 MiB). One head message is always
accepted when the queue is empty, even if larger than this budget; fragmentation
and the window pace it. The budget also bounds retained original inputs/receipts
while coalesced sends wait for credit. `WaitWritable` is advisory,
not a reservation. Once fragmentation starts, cancellation does not abandon
the message; its remaining fragments are completed. Unsent canceled work is
removed. Pending sends fail on connection loss and are never replayed.

```go
if err := sub.WaitWritable(ctx); err != nil { return err }
status := sub.FlowControl()
fmt.Println(status.OutstandingSendBytes, status.BufferedSendBytes)
if err := client.Notify(ctx, "tcp/data", ahptypes.TcpDataParams{
    Channel: sub.URI(),
    Data: base64.StdEncoding.EncodeToString(bytesToSend),
}); err != nil {
    if errors.Is(err, ahp.ErrBackpressure) {
        // Stop reading the source and retry after WaitWritable.
    }
    return err
}
```

`sub.FlowControlChanges()` is a conflated change stream. It closes when the
owner is explicitly closed or dropped; managed owners keep it across connection
replacement. `client.FlowControlEvents()` is a lossy connection-level stream
of negotiation, blocked/unblocked, credit, fragmentation and coalescing events.
Create it before subscribing if you want to observe negotiation.

### Coalescing

Adjacent unread `terminal/data` and compatible `chat/delta` actions merge by
default. Adjacent unsent `tcp/data` notifications merge by decoding the base64
and concatenating bytes. Origins/rejections, distinct `dispatchAction` sends,
snapshots, EOF/reset, different parts or metadata, and connection epochs are
never crossed. Receive merging is local and does not require delivery
preferences. Original received sizes are summed; merged send text is measured
as written. Coalescing never delays sendable data to collect a batch.

Disable merging per subscription with
`disabled := false; WindowOptions{Coalescing: &disabled}`. Register custom
coalescers in connection configuration, before `Connect`; rules run before
built-ins and must be nonblocking and must not call back into the client:

```go
cfg := ahp.DefaultConfig()
cfg.Windowing.Coalescers = []ahp.Coalescer{{
    Method: "my-app/chunk",
    Merge: func(a, b ahptypes.JsonRpcNotification, c ahp.CoalescingContext) (
        ahptypes.JsonRpcNotification, bool,
    ) {
        if c.Direction != ahp.CoalesceReceive { return a, false }
        var earlier, later struct {
            Channel string `json:"channel"`
            Text string `json:"text"`
        }
        if json.Unmarshal(a.Params, &earlier) != nil ||
            json.Unmarshal(b.Params, &later) != nil {
            return a, false
        }
        earlier.Text += later.Text
        a.Params, _ = json.Marshal(earlier)
        return a, true
    },
}}
```

Rules must preserve required events, ordering, method and channel. The SDK
checks channel/method identity and excludes control messages and reconciliation
barriers. Known AHP events retain typed models; custom/unknown notifications
are available through `SubscriptionEventNotification` and
`Delivery.Notification()`.

### Transports and managed hosts

Custom transports remain source-compatible: `Transport` has no new methods.
For windowing, optionally implement `TransportCapabilitiesProvider`, asserting
that text is retained on receive and sent without reserialization. Return text/
binary `TransportMessage`s, or `NewParsedMessageWithRawText(parsed, original)`;
`NewParsedMessage` alone cannot supply exact received sizes and uses ordinary
fallback. `RawJSONText()` never reserializes. Boxing forwards capabilities.

`ahpws.Connect` sets coder/websocket's read limit to 32 MiB by default (the
dependency's native default is only 32 KiB). Its default AHP maximum is
**22,369,620 UTF-16 bytes**, computed as `2 * floor(readLimit / 3)`.
Custom `DialOptions.ReadLimit` is converted the same way. `FromConn` cannot
inspect an externally configured read limit, so its default is **1 MiB**;
set `Config.Windowing.MaximumFrameBytes` when you know the actual limit.
`ahp.MaximumFrameBytesForReadLimit` provides that conversion for adapters.

For multiple hosts, configure `HostConfig.ClientConfig.Windowing` and call
`multi.SubscribeWithOptions(ctx, hostID, uri, options)`. The managed handle
provides `Next`, `Update`, `FlowControl`, `FlowControlChanges`, `WaitWritable`,
and `Close(ctx)`. Hosts retain unread items ahead of the replacement snapshot
and keep re-running `initialize`, then re-subscribe with fresh offers. Releases
of old deliveries never credit the new connection. Missing permissions or
closed TCP channels produce a visible dropped-subscription error.
This is a deliberate Go policy: managed hosts do **not** use protocol
`reconnect.windows` or replay/live recovery; they receive fresh snapshots.
A failed re-subscribe drops only that owner, not healthy sibling subscriptions
or the host connection. Closing/dropping an owner removes it from the managed
registry, so subsequent reconnects do not retry it.
`multi.FlowControlEvents()` tags observe-only telemetry with its host ID.
State mirrors remain passive: apply/store a delivery before releasing it.

Single-connection callers can use `ReconnectWithParams(ctx,
ahptypes.ReconnectParams{Windows: ...})` to exercise protocol window recovery;
the existing `Reconnect` convenience signature is unchanged. Obtain resumed
owners with `sub, ok := client.Subscription(uri)`, then consume them through
`Next` as usual. Raw `Request`
paths for subscribe/reconnect use the same negotiation hook, installed before
the next inbound data message. `ResumeSubscription` is the managed-host
initialize/re-subscribe helper, not a protocol `reconnect`.

Closing or unsubscribing an options-based owner stops its credit timers and
invalidates held deliveries; their later `Release` calls send no credit.
A new subscribe on that URI gets fresh counters. Canceled/timed-out
negotiations are retired and unsubscribed without closing the connection;
late responses cannot revive them. Failed RPC updates retain the accepted
owner and its previous limits.

Windowing intentionally adds no receive/reassembly memory cap or retention
timeout. Partial non-final frames are credited when stored, so messages larger
than the window can complete; the final frame stays charged until release.
Oversized data, invalid fragments/credits, or raised accepted limits close the
connection with `TransportError{Kind: "protocol"}`.

## Code generation

The contents of `ahptypes/*.go` (except `common.go`) are auto-generated
from the TypeScript definitions in `../../types/`. Re-run the generator
after protocol changes:

```bash
npm run generate:go        # from the repo root
```

CI verifies the committed generated files match the generator output and
fails on drift.

## Releasing

See [`../../RELEASING.md`](../../RELEASING.md) for the full release flow.
Summary, scoped to Go:

1. Bump the bare semver in `clients/go/VERSION`.
2. Run `npm run generate:metadata` and commit `clients/go/release-metadata.json`.
3. Rotate the `## [Unreleased]` section of `clients/go/CHANGELOG.md`.
4. Merge to `main`.
5. Tag the merge commit using the module-path prefix Go expects for
   sub-module releases: `git tag clients/go/v0.X.Y && git push origin clients/go/v0.X.Y`.

The Go module proxy automatically indexes the tagged version; no
registry-push step is required.

## License

MIT — see [`../../LICENSE`](../../LICENSE).
