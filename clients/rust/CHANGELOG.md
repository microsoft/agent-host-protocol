# Changelog — `ahp-types`, `ahp`, `ahp-ws` (Rust)

All notable changes to the Rust client crates are documented here. The Rust
workspace ships its three crates (`ahp-types`, `ahp`, `ahp-ws`) at the same
version — bumping one bumps all three. See
[`../../CHANGELOG.md`](../../CHANGELOG.md) for the protocol spec changelog
and [`release-metadata.json`](release-metadata.json) for the machine-readable
mapping between the current source tree and protocol versions.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the package follows [SemVer](https://semver.org).

The `publish-rust.yml` workflow refuses to publish a `rust/vX.Y.Z` tag whose
matching `## [X.Y.Z]` heading is missing from this file.

## [Unreleased]

### Added
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.

## [0.2.0] — 2026-05-28

Implements AHP `0.2.0`. Bumps the `ahp-types`, `ahp`, and `ahp-ws` crates
together from `0.1.0` to align the workspace with the current spec.

- Wire types for the extended `resource*` family: `resourceResolve`,
  `resourceMkdir`, `createResourceWatch`, and the new `ahp-resource-watch:/`
  channel with the `resourceWatch/changed` action. `ResourceWriteParams`
  gains `mode` / `position` / `ifMatch`. New `Conflict` (`-32011`) error
  code. The whole content-bearing `resource*` family is now bidirectional
  (it appears in both `CommandMap` and `ServerCommandMap`).
- `UserMessage.meta` optional `JsonObject` field (serialized as `_meta`),
  exposing the new spec-level provider metadata channel on user messages.

## [0.1.0] — 2026-01-01

Implements AHP `0.1.0`.

First published version of the Rust client. Includes:

- `ahp-types` — generated wire types from `types/*.ts`.
- `ahp` — async client, pure reducers, pluggable `Transport` trait,
  `ahp::hosts` multi-host registry.
- `ahp-ws` — WebSocket transport adapter on `tokio-tungstenite`.
