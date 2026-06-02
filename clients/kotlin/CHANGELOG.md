# Changelog — `com.microsoft.agenthostprotocol:agent-host-protocol` (Kotlin)

All notable changes to the Kotlin/JVM client library are documented here. See
[`../../CHANGELOG.md`](../../CHANGELOG.md) for the protocol spec changelog and
[`release-metadata.json`](release-metadata.json) for the machine-readable
mapping between the current source tree and protocol versions.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the package follows [SemVer](https://semver.org).

The `clients/kotlin/pipeline.yml` ADO publish pipeline refuses to publish a `kotlin/vX.Y.Z` tag
whose matching `## [X.Y.Z]` heading is missing from this file. Snapshot
versions (`*-SNAPSHOT`) are explicitly rejected by the publish pipeline; bump
`VERSION_NAME` in `gradle.properties` to a non-SNAPSHOT value before tagging.

## [Unreleased]

### Added
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.

## [0.2.0] — 2026-05-28

Implements AHP `0.2.0`.

First Maven Central release of the Kotlin/JVM client (`com.microsoft.agenthostprotocol:agent-host-protocol`).
Includes:

- Wire types generated from the canonical TypeScript protocol definitions in
  `types/`, including the extended `resource*` family (`resourceResolve`,
  `resourceMkdir`, `createResourceWatch`, the new `ahp-resource-watch:/`
  channel with the `resourceWatch/changed` action), `ResourceWriteParams`'s
  `mode` / `position` / `ifMatch` fields, and the new `Conflict` (`-32011`)
  error code. The whole content-bearing `resource*` family is bidirectional
  (it appears in both `CommandMap` and `ServerCommandMap`).
- `com.microsoft.agenthostprotocol.Ahp.json` — pre-configured
  `kotlinx.serialization.json.Json` instance suitable for AHP encoding /
  decoding.
- Per-channel action types and discriminated-union sealed interfaces.
- Forward-compat `Unknown` variants on every generated discriminated-union
  sealed interface (including `StateActionUnknown`, which captures the full
  raw JSON envelope), so a client built against this version round-trips and
  reducer-processes wire payloads emitted by a server speaking a newer
  protocol version without throwing.
- `UserMessage.meta` optional `Map<String, JsonElement>?` field (serialized
  as `_meta`), exposing the new spec-level provider metadata channel on user
  messages.
- Generated `PROTOCOL_VERSION` and `SUPPORTED_PROTOCOL_VERSIONS` constants in
  `com.microsoft.agenthostprotocol.generated`.
