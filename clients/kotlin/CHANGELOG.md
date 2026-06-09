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

- `SnapshotState.ResourceWatch` value class — the `Snapshot.state` union now
  accepts `ResourceWatchState`, so a snapshot of an `ahp-resource-watch:`
  channel decodes via the existing `SnapshotStateSerializer` shape probe
  (required `root` + `recursive` keys).

### Added

- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `turnId` / `resource` / `range` / `resolved` without
  resending its entries. Handled by the annotations reducer (no-op on unknown
  id).

### Added

- `RootState` now exposes an optional `_meta` property bag (`meta: Map<String,
  JsonElement>?`) for implementation-defined agent-host metadata, such as a
  well-known `hostBuild` key carrying the host's build version/commit/date.

## [0.3.0] — 2026-06-05

Implements AHP 0.3.0.

### Added

- `McpServerCustomization` now exposes the full MCP lifecycle: `enabled`,
  the discriminated `McpServerState` sealed interface
  (`Starting`/`Ready`/`AuthRequired`/`Error`/`Stopped`), optional
  `channel` URI for the `mcp://` side-channel, and optional `mcpApp`
  block carrying `AhpMcpUiHostCapabilities` for MCP Apps.
- `McpServerAuthRequiredState` variant carries `ProtectedResourceMetadata`
  plus `reason` / `requiredScopes` / `description` so the existing
  `authenticate` command can drive per-server auth.
- `Customization.McpServer` top-level variant — hosts MAY surface bare
  MCP servers directly rather than only inside a plugin or directory.
- `SessionMcpServerStateChangedAction` — narrow upsert of
  `state` + `channel` on an existing MCP server customization
  by id.
- `ClientCapabilities` data class on `InitializeParams.capabilities`
  with first entry `mcpApps`.
- `changeKind` field on `Changeset` (well-known values: `'session'`,
  `'branch'`, `'uncommitted'`, `'turn'`, `'compare-turns'`).
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.
- `AgentCustomization._meta` provider metadata field.
- Optional `changes` field on `SessionSummary` (`ChangesSummary` with optional `additions`, `deletions`, and `files` counts) summarising a session's file-change footprint.
- New annotations channel (`ahp-session:/<uuid>/annotations`): `AnnotationsState`,
  `Annotation`, `AnnotationEntry`,
  `AnnotationsSummary`; the `annotationsReducer` top-level function and
  `AnnotationsReducer` object; and the client-dispatchable `annotations/set`,
  `annotations/removed`, `annotations/entrySet`, and `annotations/entryRemoved`
  action variants — clients drive every annotation mutation by dispatching
  these directly (assigning the `Annotation.id` / `AnnotationEntry.id`
  themselves); and `SnapshotState.Annotations`.
  `SessionSummary.annotations` surfaces the per-session `AnnotationsSummary`.
- `MessageAnnotationsAttachment` (`annotations` `MessageAttachment` variant)
  referencing annotations on a session's annotations channel by `resource`
  URI, optionally narrowed to an `annotationIds` array.


### Changed

- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- Removed the `additions`, `deletions`, and `files` fields from `ChangesetSummary`. Aggregate counts now live on `SessionSummary.changes`; per-changeset views derive their own totals from `ChangesetState.files`.

### Changed

- `ToolCallBase.toolClientId: String?` replaced by
  `ToolCallBase.contributor: ToolCallContributor?` (sealed interface
  with `Client(clientId)` and `Mcp(customizationId)` variants).
  `SessionToolCallStartAction` carries the new `contributor` field as
  well.
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
