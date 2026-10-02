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

## Owned TCP byte streams

After `Initialize` advertises `tcpConnections` with `base64` support, create a
stream atomically through its parent session:

```go
connection, err := client.OpenTCPConnection(ctx, sessionURI, ahptypes.TcpConnectionSubscription{
    Type: "tcpConnection", Host: "localhost", Port: 3000,
    Encoding: ahptypes.TcpDataEncodingBase64,
    ReceiveWindowBytes: 256 * 1024, MaximumChunkSize: 64 * 1024,
})
if err != nil {
    return err
}
defer connection.Dispose(context.Background())

if _, err := connection.Write(ctx, requestBytes); err != nil {
    return err
}
if err := connection.End(ctx); err != nil { // Input EOF; output remains readable.
    return err
}
chunk, err := connection.Read(ctx) // io.EOF only after buffered output is drained.
```

The SDK owns buffering, flow control, and replay. `Read` releases receive credit;
`Drain` waits for destination consumption. Only one writer may run at a time;
`Write` returns the accepted prefix on cancellation. Finish the writer before
calling `Close`, and keep reading until EOF while the close handshake drains.
Cancellation stops waiting, not the handshake. `Dispose` aborts without draining.

Transport loss suspends the same handles. For deliberate transport replacement,
use `ShutdownPreservingTCP(ctx)`; normal shutdown disposes streams. Create a fresh
`Client` and resume instead of initializing again:

```go
result, err := freshClient.ReconnectTCPConnections(ctx, ahptypes.ReconnectParams{
    ClientId: "my-client", // Same ID used by the original Initialize.
    LastSeenServerSeq: lastSeenServerSeq,
    Subscriptions: []string{sessionURI},
}, []*ahp.TCPConnection{connection})
```

Continue using `connection`; apply the returned result only to non-TCP
subscriptions. Snapshot fallback or missing resources fail streams rather than
creating new sockets.

For a managed host, call `hostClientHandle.OpenTCPConnection(ctx, sessionURI, create)`
instead of opening through its borrowed `Client()`. The manager automatically
resumes streams across reconnects and disposes them on host removal or shutdown.
Transport/retry policy, connection limits, and native socket bridges remain
application-owned. See the [TCP channel contract](../../docs/specification/tcp-channel.md).

## Loss-sensitive raw events (advanced)

Ordinary `client.Events()` drops events when its bounded buffer is full.
For loss-sensitive consumers, attach `client.EventsStrict()` before sending
requests. Drain `events.Events()`, check `events.Err()` when it closes, and call
`events.Close()` when done. Overflow reports `*ahp.SubscriptionLagError`; decode
loss reports `*ahp.TransportError` (`Kind == "protocol"`). Both terminate the
receiver rather than skipping events. Capacity uses `Config.SubscriptionBuffer`;
ordinary receivers are unchanged. These raw receivers are global. The owned TCP
adapter instead registers a strict child-scoped receiver during creation reply
processing and reattaches it per child on reconnect. Unrelated traffic cannot
exhaust a TCP stream's event buffer.

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
