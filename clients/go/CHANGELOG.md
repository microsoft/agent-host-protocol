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

- Optional `Nonce` field on `ContentRef`.
- `SubscribeParams.Delivery.MaxLatencyMs` and `Client.SubscribeWithDelivery`
  for clients to request a maximum subscription delivery latency, including
  `0` for no intentional coalescing.
- Optional `capabilities` field on `AgentInfo` (`AgentCapabilities` with a
  nested `multipleChats` capability carrying `fork`) so clients gate multi-chat
  and fork via advertised capabilities instead of provider-id switches.
- Cursor-based pagination for `listSessions`, via new shared `PaginatedParams`
  (`Limit` + `Cursor`) and `PaginatedResult` (`NextCursor`) types:
  `ListSessionsParams` and `ListSessionsResult` now carry these fields, letting
  clients page through a large session catalogue. Fully additive — omitting the
  fields preserves prior behaviour.
- `SessionState.InputNeeded` — a session-level aggregate of outstanding input
  requests across all chats (`SessionInputRequest` union with
  `SessionChatInputRequest`, `SessionToolConfirmationRequest`, and
  `SessionToolClientExecutionRequest`), plus the `SessionInputNeededSetAction`
  (wire `session/inputNeededSet`) and `SessionInputNeededRemovedAction` (wire
  `session/inputNeededRemoved`) actions and the `ToolCallConfirmationState`
  union. The session reducer maintains the `SessionStatusInputNeeded` activity
  bit from the queue, clearing it (falling back to `SessionStatusInProgress`)
  when the last entry is removed.
- Optional `Intention` field on `ChatToolCallStartAction` and every tool-call
  lifecycle state.
- Optional `Model` and `Tools` fields on `AgentCustomization` for a custom
  agent's pinned model and tool allowlist.

### Removed

- `Filter` field from `ListSessionsParams`. It was an untyped placeholder with
  no defined semantics; it will return with a concrete shape once session
  filtering/sorting is specified.

### Fixed

- `SnapshotState.UnmarshalJSON` now decodes the `Chat` variant. Variant
  disambiguation previously probed for the removed `summary` field (a leftover
  from before `SessionState` was flattened), so chat and session snapshots both
  fell through to the `Root` catch-all. Sessions are now matched on `lifecycle`
  and chats on `turns`.

## [0.5.0] — 2026-06-26

Implements AHP 0.5.0.

### Added

- `ChatDraftChangedAction` (wire `chat/draftChanged`) and `ChatState.Draft`
  (`*Message`) for syncing a chat's in-progress input draft; `ApplyActionToChat`
  sets or clears `state.Draft` without stamping `ModifiedAt`.
- `Message.Model` and `Message.Agent` optional fields recording the model /
  agent selection a message was composed with.
- `ChatActivityChangedAction` (wire `chat/activityChanged`) for updating a chat's
  current activity description independently of the session summary.
- `ProgressParams` struct (wire `root/progress`) — a generic progress notification
  correlated by a `ProgressToken` (added on `CreateSessionParams`).
  Used today for the lazy first-use download of an agent's native SDK.
- `SessionModelInfo.MaxOutputTokens` and `SessionModelInfo.MaxPromptTokens`
  optional fields for communicating model token limits.
- `SessionSummary.Meta` (wire `_meta`) optional provider metadata field for
  lightweight session-list presentation hints.
- `SessionActiveClientRemovedAction` (wire `session/activeClientRemoved`) to
  release a single active client by `ClientId`.

### Changed

- `SessionState` no longer embeds a `Summary` sub-struct; its metadata fields
  (`Provider`, `Title`, `Status`, `Activity`, `Project`, `WorkingDirectory`,
  `Annotations`) are now inlined directly on `SessionState`, which no longer
  carries `Model`, `Agent`, `CreatedAt`, or `ModifiedAt`. `ApplyActionToSession`
  reads and writes these flat fields and no longer stamps a session
  `ModifiedAt`.
- `SessionSummary` is now a root-only catalog struct; its `CreatedAt` /
  `ModifiedAt` are ISO-8601 strings (previously numeric) and it no longer
  carries `Model` / `Agent`.
- `ChatState` and `ChatSummary` no longer carry `Model` / `Agent`.
- `SessionState.ActiveClients` (`[]SessionActiveClient`, required) replaces the
  single pointer `SessionState.ActiveClient`; `ApplyActionToSession` upserts and
  removes entries keyed by `ClientId`.
- `SessionActiveClientChangedAction` is renamed to `SessionActiveClientSetAction`
  (wire `session/activeClientSet`) with upsert-by-`ClientId` semantics; it no
  longer unsets the active client (dispatch `session/activeClientRemoved`
  instead).
- `ConfigPropertySchema.Enum` field is now `[]json.RawMessage` instead of `[]string`,
  allowing numeric, boolean, and null enum values.
- `ModelSelection.Config` values are now `json.RawMessage` instead of `string`,
  allowing numeric, boolean, and null configuration values.

### Removed

- `SessionModelChangedAction` (wire `session/modelChanged`) and
  `SessionAgentChangedAction` (wire `session/agentChanged`); session model /
  agent are no longer part of the protocol surface.
- `SessionActiveClientToolsChangedAction`. An active client now updates its
  published tools by re-dispatching `SessionActiveClientSetAction` with its
  full, updated entry.

## [0.4.0] — 2026-06-19

Implements AHP 0.4.0.

### Added

- `MessageOrigin` struct and `MessageKind` type now model `Message.Origin`
  (previously an untyped `json.RawMessage`); `MessageKind` covers `user`,
  `agent`, `tool`, and `systemNotification`, adding faithful agent- and
  tool-initiated origins.
- `ConfigPropertySchema.AdditionalProperties` — optional field describing the
  schema for object-typed config properties beyond those in `Properties`.
- `ChangesetContentChangedAction` for full-replacement changeset file
  snapshots with optional operations and error details.
- `ChangesetOperationStatusDisabled` — new `ChangesetOperationStatus` value for
  operations that are currently unavailable and cannot be invoked.
- `ChangesetOperation.Group` — optional identifier for grouping related
  changeset operations together in the UI.
- `Meta` (wire `_meta`) field on the per-turn chat actions (`chat/turnStarted`,
  `chat/delta`, `chat/responsePart`, `chat/reasoning`, `chat/usage`,
  `chat/turnComplete`, `chat/turnCancelled`, `chat/error`) — optional
  provider-specific metadata so hosts can carry portable per-event context,
  such as attributing an event to a specific agent (e.g. a sub-agent acting
  within the turn).

### Changed

- `ToolResultSubagentContent.Resource` is now specified as the spawned worker
  **chat** URI (`ahp-chat:/<cid>`), not a session URI — a tool-spawned
  sub-agent is a chat. Its doc now describes the correspondence with the worker
  chat's `ChatToolOrigin` record (matching `ToolCallId`), which remains the
  canonical representation of the spawn relationship.
- **BREAKING:** `ChangesetOperationTargetRange` is now a nested `TextRange`
  (`{start: {line, character}, end: {line, character}}`) instead of flat
  `{start, end}` `int64` fields.

### Fixed

- `ActionEnvelope.Origin` is now omitted from JSON output when absent
  (`json:"origin,omitempty"`) instead of serializing as `null`.

### Added

- `ApplyActionToChangeset`, `ApplyActionToAnnotations`, and `ApplyActionToResourceWatch` — full reducer implementations replacing the previous stubs; all shared conformance fixtures in `types/test-cases/reducers/` for these three families now pass.
- `SnapshotState.ResourceWatch` pointer field — the `Snapshot.state` union
  now accepts `ResourceWatchState`, decoded by probing for the required
  `root` + `recursive` keys (ordered between the existing changeset and
  annotations probes).

### Fixed

- Reducer parity fixtures now require `_meta` updates from every
  tool-call-scoped action, not only `session/toolCallStart`.

### Added

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
- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `TurnID` / `Resource` / `Range` / `Resolved` without
  resending its entries. Handled by the annotations reducer (no-op on unknown
  id).

- `ahp-chat:` channel for per-chat conversation state; `SessionState.chats[]` catalog; `SessionState.defaultChat?` input-routing hint; `ChatOrigin` provenance union; `createChat` / `disposeChat` commands.
- `ChatSummary.WorkingDirectory` — optional per-chat working directory. Falls back to the session's `WorkingDirectory` when absent.
- `ChatInteractivity` string enum (`ChatInteractivityFull` / `ChatInteractivityReadOnly` / `ChatInteractivityHidden`) and the optional `ChatSummary.Interactivity` / `ChatState.Interactivity` field describing how the user can interact with a chat. Absent defaults to `"full"`.
- Three discrete chat-catalog actions on the session channel — `SessionChatAddedAction` (upsert by `Summary.Resource`), `SessionChatRemovedAction`, and `SessionChatUpdatedAction` (partial-update payload).
- `SessionDefaultChatChangedAction` (`session/defaultChatChanged`) — updates `SessionState.DefaultChat` to steer new input to the designated chat; absent value clears the hint.
- `ErrorInfo.Meta map[string]json.RawMessage` — optional provider-specific metadata bag on error payloads (`_meta` on the wire), mirroring the existing `Meta` field on `UsageInfo` and other protocol types.
- `RootState` now exposes an optional `_meta` property bag (`Meta
  map[string]json.RawMessage`) for implementation-defined agent-host metadata,
  such as a well-known `hostBuild` key carrying the host's build
  version/commit/date.

### Changed

- `ChatState` is now flat — the previous embedded `Summary` has been replaced with inlined `Resource` / `Title` / `Status` / `Activity` / `ModifiedAt` / `Model` / `Agent` / `Origin` / `WorkingDirectory` fields. `ChatSummary` remains as the standalone catalog entry on `SessionState.Chats`.
- `ChatSummary.ModifiedAt` and `ChatState.ModifiedAt` are now ISO 8601 `string` values instead of integer milliseconds.

### Removed

- `SessionChatsChangedAction` (replaced by the three discrete chat-catalog actions above).

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


### Changed

- Reducers split into per-chat and session-aggregate handlers to match the multi-chat protocol shape.
- `fetchTurns` and `completions` now target an `ahp-chat:` channel; `PROTOCOL_VERSION` bumped to `0.4.0`.
- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- `SessionState.turns`, `SessionState.activeTurn`, `SessionState.steeringMessage`, `SessionState.queuedMessages`, `SessionState.inputRequests` (moved to `ChatState`).
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
