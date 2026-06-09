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

- `SnapshotState.ResourceWatch` pointer field — the `Snapshot.state` union
  now accepts `ResourceWatchState`, decoded by probing for the required
  `root` + `recursive` keys (ordered between the existing changeset and
  annotations probes).

### Fixed

- Reducer parity fixtures now require `_meta` updates from every
  tool-call-scoped action, not only `session/toolCallStart`.

### Added

- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `TurnID` / `Resource` / `Range` / `Resolved` without
  resending its entries. Handled by the annotations reducer (no-op on unknown
  id).

### Added

- `RootState` now exposes an optional `_meta` property bag (`Meta
  map[string]json.RawMessage`) for implementation-defined agent-host metadata,
  such as a well-known `hostBuild` key carrying the host's build
  version/commit/date.

## [0.3.0] — 2026-06-05

Implements AHP 0.3.0.

### Added

- `McpServerCustomization` now exposes the full MCP lifecycle: `Enabled`,
  the discriminated `McpServerState` union
  (`Starting`/`Ready`/`AuthRequired`/`Error`/`Stopped`), optional
  `Channel` URI for the `mcp://` side-channel, and optional `McpApp`
  block carrying `AhpMcpUiHostCapabilities` for MCP Apps.
- `McpServerAuthRequiredState` variant carries `ProtectedResourceMetadata`
  plus `Reason` / `RequiredScopes` / `Description` so the existing
  `authenticate` command can drive per-server auth.
- `Customization` top-level union now includes `McpServer` — hosts MAY
  surface bare MCP servers directly rather than only inside a plugin or
  directory.
- `SessionMcpServerStateChangedAction` and matching reducer case —
  narrow upsert of `State` + `Channel` on an existing MCP
  server customization by id.
- `ClientCapabilities` struct on `InitializeParams.Capabilities` with
  first entry `McpApps`.
- `changeKind` field on `Changeset` (well-known values: `'session'`,
  `'branch'`, `'uncommitted'`, `'turn'`, `'compare-turns'`).
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.
- `AgentCustomization._meta` provider metadata field.
- Optional `changes` field on `SessionSummary` (`ChangesSummary` with optional `additions`, `deletions`, and `files` counts) summarising a session's file-change footprint.
- New annotations channel wire types (`ahp-session:/<uuid>/annotations`):
  `AnnotationsState`, `Annotation`, `AnnotationEntry`,
  `AnnotationsSummary`; the client-dispatchable `AnnotationsSetAction`,
  `AnnotationsRemovedAction`, `AnnotationsEntrySetAction`,
  `AnnotationsEntryRemovedAction` variants — clients drive every annotation
  mutation by dispatching these directly, assigning the `Annotation.Id` /
  `AnnotationEntry.Id` themselves;
  `ApplyActionToAnnotations` (stub mirroring `ApplyActionToChangeset`); and
  `SnapshotState.Annotations`.
- `MessageAnnotationsAttachment` (`annotations` `MessageAttachment` variant)
  referencing annotations on a session's annotations channel by `Resource`
  URI, optionally narrowed to an `AnnotationIds` array.


### Changed

- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- Removed the `additions`, `deletions`, and `files` fields from `ChangesetSummary`. Aggregate counts now live on `SessionSummary.changes`; per-changeset views derive their own totals from `ChangesetState.files`.

### Changed

- `ToolCallBase.ToolClientId *string` replaced by
  `ToolCallBase.Contributor *ToolCallContributor` (union with
  `Client { ClientId }` and `Mcp { CustomizationId }` variants).
  `SessionToolCallStartAction` carries the new `Contributor` field as
  well. The reducer follows the rename.
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
