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

- Optional `intention` field on `ChatToolCallStartAction` and every tool-call
  lifecycle state.

## [0.5.0] — 2026-06-26

Implements AHP 0.5.0.

### Added

- `ChatDraftChangedAction` (`chat/draftChanged`) and `ChatState.draft`
  (`Message`) for syncing a chat's in-progress input draft; `chatReducer` sets
  or clears `draft` without stamping `modifiedAt`.
- `Message.model` and `Message.agent` optional fields recording the model /
  agent selection a message was composed with.
- `ChatActivityChangedAction` (`chat/activityChanged`) for updating a chat's
  current activity description independently of the session summary.
- `ProgressParams` (wire `root/progress`) generic progress notification correlated by
  a `progressToken`, plus `createSession.progressToken` to opt in. Used today for
  the lazy first-use download of an agent's native SDK, so clients can show an
  indicator instead of a silent multi-second hang.
- `SessionModelInfo.maxOutputTokens` and `SessionModelInfo.maxPromptTokens`
  optional fields for communicating model token limits.
- `SessionSummary._meta` optional provider metadata field for lightweight
  session-list presentation hints.
- Exported `JsonPrimitive` type alias (`string | number | boolean | null`).
- `SessionActiveClientRemovedAction` (`session/activeClientRemoved`) to release
  a single active client by `clientId`.

### Changed

- `SessionState` no longer embeds a `summary` sub-object; its metadata fields
  (`provider`, `title`, `status`, `activity`, `project`, `workingDirectory`,
  `annotations`) are inlined directly on `SessionState`, which no longer carries
  `model`, `agent`, `createdAt`, or `modifiedAt`. `sessionReducer` reads and
  writes these flat fields and no longer stamps a session `modifiedAt`.
- `SessionSummary` is now a root-only catalog type (introduced via a shared
  `SessionMetadata` base); its `createdAt` / `modifiedAt` are ISO-8601 strings
  (previously numeric) and it no longer carries `model` / `agent`.
- `ChatState` and `ChatSummary` no longer carry `model` / `agent`.
- `ConfigPropertySchema.enum` field is now `JsonPrimitive[]` instead of
  `string[]`, allowing numeric, boolean, and null enum values.
- `ModelSelection.config` values are now `JsonPrimitive` instead of `string`,
  allowing numeric, boolean, and null configuration values.
- `SessionState.activeClients` (a required array) replaces the single optional
  `SessionState.activeClient`; `sessionReducer` upserts and removes entries
  keyed by `clientId`.
- `SessionActiveClientChangedAction` is renamed to `SessionActiveClientSetAction`
  (`session/activeClientSet`) with upsert-by-`clientId` semantics; it no longer
  accepts `null` to unset (dispatch `session/activeClientRemoved` instead).

### Removed

- `SessionModelChangedAction` (`session/modelChanged`) and
  `SessionAgentChangedAction` (`session/agentChanged`). There is no longer a
  session-level model/agent selection — selection lives on each `Message` (and
  a chat's `draft`). The `model` / `agent` params were also removed from the
  `createSession` and `createChat` commands; pass them on the (initial) message
  instead.
- `SessionActiveClientToolsChangedAction`. An active client now updates its
  published tools by re-dispatching `SessionActiveClientSetAction` with its
  full, updated entry.

### Fixed

- Hosted session summary caches now apply `_meta` updates from
  `root/sessionSummaryChanged` notifications.
- Corrected the `ACTION_INTRODUCED_IN` entries for `annotations/set`,
  `annotations/removed`, `annotations/entrySet`, and `annotations/entryRemoved`
  from `0.3.0` to `0.4.0`, so `isActionKnownToVersion` no longer reports the
  annotations channel as available to peers negotiating `0.3.0` (it first
  shipped in `0.4.0`).

## [0.4.0] — 2026-06-19

Implements AHP 0.4.0.

### Added

- `MessageOrigin` interface now types `Message.origin`, and `MessageKind` gains
  `Agent` and `Tool` values for turns initiated by the agent or a tool rather
  than the user (e.g. a tool seeding the first message of a worker chat it
  spawned).
- `ConfigPropertySchema.additionalProperties` — optional JSON Schema field
  (`ConfigPropertySchema`) describing the schema for object-typed config
  properties beyond those listed in `properties`.
- `ChangesetContentChangedAction` for full-replacement changeset file
  snapshots with optional operations and error details.
- `ChangesetOperationStatus.Disabled` — new enum value for changeset
  operations that are currently unavailable and cannot be invoked.
- `ChangesetOperation.group` — optional identifier for grouping related
  changeset operations together in the UI.
- `_meta` field on the per-turn chat actions (`chat/turnStarted`, `chat/delta`,
  `chat/responsePart`, `chat/reasoning`, `chat/usage`, `chat/turnComplete`,
  `chat/turnCancelled`, `chat/error`) — optional provider-specific metadata so
  hosts can carry portable per-event context, such as attributing an event to a
  specific agent (e.g. a sub-agent acting within the turn).

### Changed

- `ToolResultSubagentContent.resource` is now specified as the spawned worker
  **chat** URI (`ahp-chat:/<cid>`), not a session URI — a tool-spawned
  sub-agent is a chat. Its doc now describes the correspondence with the worker
  chat's `ChatOrigin` record (`kind: 'tool'`, matching `toolCallId`), which
  remains the canonical representation of the spawn relationship.

### Added

- `Snapshot.state` now accepts `ResourceWatchState`, so the existing
  `initialize` / `reconnect` / `subscribe` snapshot path can carry an
  `ahp-resource-watch:` channel's descriptor alongside the existing root /
  session / terminal / changeset / annotations variants.

### Added

- Shared round-trip test corpus (`test/round-trips/*.json`) used by all
  language clients to assert encode/decode fidelity; the TypeScript test harness
  loads and verifies each fixture.

### Fixed

- `sessionReducer` now applies `_meta` updates from every tool-call-scoped
  action, not only `session/toolCallStart`.

### Added

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
- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `turnId` / `resource` / `range` / `resolved` without
  resending its entries. Handled by `annotationsReducer` (no-op on unknown id).

- `ahp-chat:` channel for per-chat conversation state; `SessionState.chats[]` catalog; `SessionState.defaultChat?` input-routing hint; `ChatOrigin` provenance union; `createChat` / `disposeChat` commands.
- `ChatSummary.workingDirectory?` — optional per-chat working directory. Falls back to the session's `workingDirectory` when absent.
- `ChatInteractivity` enum (`"full"` / `"read-only"` / `"hidden"`) and the optional `ChatSummary.interactivity` / `ChatState.interactivity` field describing how the user can interact with a chat. Absent defaults to `Full`.
- Three discrete chat-catalog actions on the session channel — `SessionChatAddedAction` (upsert by `summary.resource`), `SessionChatRemovedAction`, and `SessionChatUpdatedAction` (partial-update with `Partial<ChatSummary>`).
- `SessionDefaultChatChangedAction` (`session/defaultChatChanged`) — updates `SessionState.defaultChat` to steer new input to the designated chat; absent value clears the hint.
- `ErrorInfo._meta?: Record<string, unknown>` — optional provider-specific metadata bag on error payloads, mirroring the existing `_meta` convention on `UsageInfo` and other protocol types. Clients MAY inspect well-known keys here for richer, localised error UI.
- `RootState` now exposes an optional `_meta` property bag (`_meta?:
  Record<string, unknown>`) for implementation-defined agent-host metadata, such
  as a well-known `hostBuild` key carrying the host's build version/commit/date.

### Changed

- `ChatState` is now flat — the previous nested `summary: ChatSummary` has been replaced with inlined `resource` / `title` / `status` / `activity` / `modifiedAt` / `model` / `agent` / `origin` / `workingDirectory` fields. `ChatSummary` remains as the standalone catalog entry on `SessionState.chats`.
- `ChatSummary.modifiedAt` and `ChatState.modifiedAt` are now ISO 8601 `string` values instead of numeric milliseconds.

### Removed

- `SessionChatsChangedAction` (replaced by the three discrete chat-catalog actions above).

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


### Changed

- `fetchTurns` and `completions` now target an `ahp-chat:` channel; `PROTOCOL_VERSION` bumped to `0.4.0`.
- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- `SessionState.turns`, `SessionState.activeTurn`, `SessionState.steeringMessage`, `SessionState.queuedMessages`, `SessionState.inputRequests` (moved to `ChatState`).
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
