# Changelog — `clients/go` (Go)

All notable changes to the Go client module are documented here. See
[`../../CHANGELOG.md`](../../CHANGELOG.md) for the protocol spec
changelog and [`release-metadata.json`](release-metadata.json) for the
machine-readable mapping between the current source tree and protocol
versions.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the module follows [SemVer](https://semver.org).

The `publish-go.yml` workflow refuses to publish a `clients/go/vX.Y.Z`
tag whose matching `## [X.Y.Z]` heading is missing from this file.

## [Unreleased]

### Added
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.

## [0.1.0] — 2026-05-28

Implements AHP `0.2.0`.

First published version of the Go module. Includes:

- `ahptypes` — generated wire types from `types/*.ts`, including the
  extended `resource*` family (`resourceResolve`, `resourceMkdir`,
  `createResourceWatch`, the new `ahp-resource-watch:/` channel with the
  `resourceWatch/changed` action), `ResourceWriteParams`'s `mode` /
  `position` / `ifMatch` fields, the new `Conflict` (`-32011`) error code,
  and the bidirectional content-bearing `resource*` surface exposed on
  both `CommandMap` and `ServerCommandMap`. Structs use Go
  JSON struct tags that preserve the canonical camelCase wire names;
  discriminated unions are concrete wrapper structs that round-trip via
  custom `MarshalJSON` / `UnmarshalJSON`; bitset enums are typed `uint32`
  with named flag constants and helpers.
- `UserMessage._meta` optional map field, generated as
  `Map[string]json.RawMessage`, exposing the new spec-level provider
  metadata channel on user messages.
- `ahp` — async `Client` driven by a pluggable `Transport`, pure
  `ApplyActionToRoot` / `ApplyActionToSession` / `ApplyActionToTerminal`
  / `ApplyActionToChangeset` reducers, `MultiHostClient` runtime under
  `ahp/hosts`, `MultiHostStateMirror` helper.
- `ahpws` — WebSocket transport built on `github.com/coder/websocket`,
  matching the Rust `ahp-ws` crate's API shape.
