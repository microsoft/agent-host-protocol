# Go Client — Agent Guide

## Overview

This directory contains the **Go** module for the Agent Host Protocol
(AHP), published as
`github.com/microsoft/agent-host-protocol/clients/go`.

The module targets Go 1.22+ and is split into three packages that mirror
the Rust client's three-crate split:

- `ahptypes/` — generated wire types only, no I/O.
- `ahp/` — async `Client`, reducers, and pluggable `Transport`. Sub-
  package `ahp/hosts/` carries the multi-host runtime.
- `ahpws/` — WebSocket transport built on `github.com/coder/websocket`.

## Code Generation

The Go files under `ahptypes/` (except `common.go` and
`discriminated_unions.go`, and `unknown_members.go`) are **auto-generated** from the TypeScript
definitions in `types/`. Do not edit these files directly. Generated
files are committed to source control so the package is consumable via
the Go module proxy without a code-generation toolchain.

To regenerate after protocol changes:

```bash
npm run generate:go    # runs: tsx scripts/generate.ts --go
```

Generated files (all suffixed `.generated.go`): `version`, `state`,
`actions`, `commands`, `notifications`, `messages`, `errors`. The
generator runs `gofmt -w` on its output.

CI verifies the committed generated files match the output of
`npm run generate:go` and fails on drift.

## Type mapping (TS → Go)

| TypeScript                  | Go                                                                       |
| --------------------------- | ------------------------------------------------------------------------ |
| `string`                    | `string`                                                                 |
| `number`                    | `int64` (TS contract: 64-bit ints)                                       |
| `number` w/ `@format float` | `float64`                                                                |
| `boolean`                   | `bool`                                                                   |
| `unknown` / `object`        | `json.RawMessage`                                                        |
| `T \| null`                 | `*T`                                                                     |
| optional field              | `*T` + `json:"name,omitempty"`                                           |
| `T[]` / `Array<T>`          | `[]T`                                                                    |
| `Record<string, T>`         | `map[string]T`                                                           |
| `Partial<T>`                | `PartialT` struct, every field a pointer                                 |
| string enum                 | typed `string` + named constants                                         |
| Bitset enum (`@bitset`)     | typed `uint32` + flag constants + `Has`/`Or` helpers                     |
| Interface struct            | `struct` with JSON tags                                                  |
| Discriminated union         | wrapper struct + marker interface + custom `MarshalJSON`/`UnmarshalJSON` |
| `URI`                       | `type URI = string`                                                      |
| `StringOrMarkdown`          | struct w/ custom (un)marshal                                             |
| Recursive struct            | pointer field in the recursive position                                  |
| `_meta` field               | `Meta map[string]json.RawMessage` + `json:"_meta,omitempty"`             |
| `snake_case` wire field     | PascalCase Go field + `json:"snake_case"`                                |

### Discriminated unions

Each TS discriminated union is emitted as a concrete wrapper struct so
that it can be used directly as a Go field type — `[]ResponsePart`,
`StateAction`, etc. — without consumers having to call a custom
unmarshaler at every use site:

```go
type ResponsePart struct {
    Value isResponsePart  // marker interface, one impl per variant
}

func (r *ResponsePart) UnmarshalJSON(b []byte) error { /* dispatch on kind */ }
func (r ResponsePart) MarshalJSON() ([]byte, error)  { return json.Marshal(r.Value) }
```

Unknown variants surface as a `*VariantNameUnknown{ Raw json.RawMessage }`
so a future server can speak a not-yet-known kind without breaking
existing clients. Reducers treat them as no-ops.

### Bitset enums

`SessionStatus` is currently the only bitset enum. It's emitted as
`type SessionStatus uint32` with named flag constants plus
`(SessionStatus).Has(SessionStatus) bool` and
`(SessionStatus).Or(SessionStatus) SessionStatus` helpers. Unknown
future bits round-trip naturally.

### `omitempty` policy

Only **optional pointer fields** carry `,omitempty`. Required fields
(including required slices, maps, and scalars) MUST NOT carry
`omitempty` — Go's omitempty omits empty slices, zero ints, and `false`,
which would break wire parity (e.g. `serverSeq: 0` on an `ActionEnvelope`,
required empty `responseParts: []` arrays).

## Library structure

- `ahptypes/common.go` — hand-written primitives (`URI`, `StringOrMarkdown`,
  `JSONObject`, marker interfaces).
- `ahptypes/*.generated.go` — wire types from the protocol spec.
- `ahp/client.go` — async `Client`, request correlation, subscription
  fan-out, `dispatchAction` write-ahead.
- `ahp/transport.go` — `Transport` interface, `TransportMessage`
  variants, `BoxedTransport` for heterogeneous storage.
- `ahp/reducers.go` — pure `Apply*` reducers ported from
  `types/channels-*/reducer.ts`. Each accepts `state *State` and an
  action and returns a `ReduceOutcome`.
- `ahp/error.go` — `ClientError`, `TransportError` types implementing
  Go's `error` interface; use `errors.Is` / `errors.As` to discriminate.
- `ahp/hosts/` — `MultiHostClient`, `HostHandle`, `HostClientHandle`,
  `ReconnectPolicy`, `ClientIDStore`, etc.
- `ahpws/transport.go` — WebSocket transport that wraps a
  `github.com/coder/websocket` connection.

## Reducers

Reducers mutate `*State` in place to match the Rust client's
`apply_action_to_*` semantics. The same fixtures from
`types/test-cases/reducers/*.json` exercise the Go reducers via
`ahp/reducers_fixture_test.go` so cross-language parity is enforced.

## Tag namespace (release)

Go requires tags for sub-module releases to be prefixed with the
sub-module's directory inside the repo. So the publish tag is
**`clients/go/vX.Y.Z`** (not `go/vX.Y.Z` and not the bare `vX.Y.Z`
reserved for Swift). The Go module proxy will pick the tag up
automatically.

## Out of scope (intentional)

The current Go module ships **wire types, reducers, single- and multi-
host client runtime, and a WebSocket transport**. The following are
deferred:

- Example application beyond the small `examples/` snippets.
- Kotlin Multiplatform-style cross-target build.
