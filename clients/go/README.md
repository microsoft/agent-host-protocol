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

## Code generation

The contents of `ahptypes/*.go` (except `common.go`) are auto-generated
from the TypeScript definitions in `../../types/`. Re-run the generator
after protocol changes:

```bash
npm run generate:go        # from the repo root
```

CI verifies the committed generated files match the generator output and
fails on drift.

### Empty-object capability flags

Optional `Record<string, never>` capability flags use pointer-to-map fields:
`nil` omits the flag, while a non-nil pointer to an empty map encodes the
required `{}` opt-in. For example:

```go
supported := map[string]json.RawMessage{}
capabilities := ahptypes.ClientCapabilities{
    ModelProviderSelection: &supported,
}
```

This also corrects existing `McpApps`, `ChangesetCapabilities.Review`, and
`AhpMcpUiHostCapabilities.Logging` flags that previously lost empty objects
through `omitempty`. When upgrading, change map-valued initializers for these
fields to pointers and rebuild consumers. `AgentInfo.ModelProviders` similarly
uses a pointer to a slice to preserve an explicitly empty catalog.
These wire-preservation fixes do not automatically opt a client into features.
Ordinary optional maps and slices retain their existing omission behavior for
nil or empty values; required collections still serialize, including when empty.

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
