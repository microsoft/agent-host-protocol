# Changelog — `@microsoft/agent-host-protocol` (TypeScript)

All notable changes to the TypeScript client package are documented here. See
[`../../CHANGELOG.md`](../../CHANGELOG.md) for the protocol spec changelog
and [`release-metadata.json`](release-metadata.json) for the machine-readable
mapping between the current source tree and protocol versions.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the package follows [SemVer](https://semver.org).

The `clients/typescript/pipeline.yml` ADO publish pipeline refuses to publish a `typescript/vX.Y.Z`
tag whose matching `## [X.Y.Z]` heading is missing from this file. The
workflow validates the tag, runs `npm run verify:release-metadata` and
`npm run verify:changelog`, and only then triggers the Azure DevOps
pipeline at `pipeline.yml` (via the Pipelines REST API with
`publishPackage: true`) to perform the actual signed npm publish.

The ADO pipeline can also be triggered manually from the ADO UI as a
hotfix escape hatch.

## [Unreleased]

### Added

- `Snapshot.state` now accepts `ResourceWatchState`, so the existing
  `initialize` / `reconnect` / `subscribe` snapshot path can carry an
  `ahp-resource-watch:` channel's descriptor alongside the existing root /
  session / terminal / changeset / annotations variants.

### Fixed

- `sessionReducer` now applies `_meta` updates from every tool-call-scoped
  action, not only `session/toolCallStart`.

### Added

- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `turnId` / `resource` / `range` / `resolved` without
  resending its entries. Handled by `annotationsReducer` (no-op on unknown id).

### Added

- `RootState` now exposes an optional `_meta` property bag (`_meta?:
  Record<string, unknown>`) for implementation-defined agent-host metadata, such
  as a well-known `hostBuild` key carrying the host's build version/commit/date.

## [0.3.0] — 2026-06-05

Implements AHP 0.3.0.

### Added

- `McpServerCustomization` now exposes the full MCP lifecycle: `enabled`,
  the discriminated `McpServerState` union
  (`starting`/`ready`/`authRequired`/`error`/`stopped`), optional
  `channel` URI for the `mcp://` side-channel, and optional `mcpApp`
  block carrying `AhpMcpUiHostCapabilities` for MCP Apps.
- `McpServerAuthRequiredState` variant carries `ProtectedResourceMetadata`
  plus `reason` / `requiredScopes` / `description` so the existing
  `authenticate` command can drive per-server auth.
- `Customization` top-level union now includes `McpServerCustomization`
  — hosts MAY surface bare MCP servers directly rather than only inside
  a plugin or directory.
- `session/mcpServerStateChanged` action and matching reducer case —
  narrow upsert of `state` + `channel` on an existing MCP
  server customization by id.
- `ClientCapabilities` type on `InitializeParams.capabilities` with
  first entry `mcpApps`.
- `changeKind` field on `Changeset` (well-known values: `'session'`,
  `'branch'`, `'uncommitted'`, `'turn'`, `'compare-turns'`).
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.
- `AgentCustomization._meta` provider metadata field.
- Optional `changes` field on `SessionSummary` (`ChangesSummary` with optional `additions`, `deletions`, and `files` counts) summarising a session's file-change footprint.
- New annotations channel (`ahp-session:/<uuid>/annotations`): `AnnotationsState`,
  `Annotation`, `AnnotationEntry`, `AnnotationsSummary`,
  the `annotationsReducer`, and the client-dispatchable `annotations/set`,
  `annotations/removed`, `annotations/entrySet`, and `annotations/entryRemoved`
  actions — clients drive every annotation mutation by dispatching these
  directly, assigning the `Annotation.id` / `AnnotationEntry.id` themselves.
  `SessionSummary.annotations` surfaces the per-session `AnnotationsSummary`
  for badge UI.
- `MessageAnnotationsAttachment` (`annotations` `MessageAttachment` variant)
  referencing annotations on a session's annotations channel by `resource`
  URI, optionally narrowed to an `annotationIds` array.


### Changed

- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- Removed the `additions`, `deletions`, and `files` fields from `ChangesetSummary`. Aggregate counts now live on `SessionSummary.changes`; per-changeset views derive their own totals from `ChangesetState.files`.

### Changed

- `ToolCallBase.toolClientId?: string` replaced by
  `ToolCallBase.contributor?: ToolCallContributor` (discriminated union
  with `{ kind: 'client'; clientId }` and `{ kind: 'mcp'; customizationId }`
  variants). `session/toolCallStart` carries the new `contributor`
  field as well.
## [0.2.0] — 2026-05-28

Implements AHP `0.2.0`.

Initial npm publish of `@microsoft/agent-host-protocol`. Includes:

- Default entry — wire types, actions, commands, reducers, version
  constants (`PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`). Zero I/O.
  Includes the extended `resource*` family (`resourceResolve`,
  `resourceMkdir`, `createResourceWatch`, the new `ahp-resource-watch:/`
  channel with the `resourceWatch/changed` action), `ResourceWriteParams`'s
  `mode` / `position` / `ifMatch` fields, the new `Conflict` (`-32011`)
  error code, and the bidirectional content-bearing `resource*` surface
  exposed on both `CommandMap` and `ServerCommandMap`.
- `UserMessage._meta` optional `Record<string, unknown>` field, exposing
  the new spec-level provider metadata channel on user messages.
- `/client` subpath — `AhpClient`, `Subscription`, `AhpStateMirror`,
  `AhpTransport` interface, `InMemoryTransport`, error taxonomy.
- `/ws` subpath — `WebSocketTransport` built on the global `WebSocket`.
