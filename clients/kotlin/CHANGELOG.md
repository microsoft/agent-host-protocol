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

- Optional `nonce` field on `ContentRef`.
- `SubscribeParams.delivery.maxLatencyMs` for clients to request a maximum
  subscription delivery latency, including `0` for no intentional coalescing.
- Optional `capabilities` field on `AgentInfo` (`AgentCapabilities` with a
  nested `multipleChats` capability carrying `fork`) so clients gate multi-chat
  and fork via advertised capabilities instead of provider-id switches.
- Cursor-based pagination for `listSessions`, via new shared `PaginatedParams`
  (`limit` + `cursor`) and `PaginatedResult` (`nextCursor`) types:
  `ListSessionsParams` and `ListSessionsResult` now carry these fields, letting
  clients page through a large session catalogue. Fully additive — omitting the
  fields preserves prior behaviour.
- `SessionState.inputNeeded` — a session-level aggregate of outstanding input
  requests across all chats (`SessionInputRequest` sealed interface with
  `SessionChatInputRequest`, `SessionToolConfirmationRequest`, and
  `SessionToolClientExecutionRequest`), plus the `SessionInputNeededSetAction` /
  `SessionInputNeededRemovedAction` actions and the `ToolCallConfirmationState`
  union. The session reducer maintains the `SessionStatus.INPUT_NEEDED` activity
  bit from the queue, clearing it (falling back to `IN_PROGRESS`) when the last
  entry is removed.
- Optional `intention` field on `ChatToolCallStartAction` and every tool-call
  lifecycle state.
- Optional `model` and `tools` fields on `AgentCustomization` for a custom
  agent's pinned model and tool allowlist.

### Removed

- `filter` field from `ListSessionsParams`. It was an untyped placeholder with
  no defined semantics; it will return with a concrete shape once session
  filtering/sorting is specified.

### Fixed

- `SnapshotState` now decodes the `Chat` variant. Its serializer previously never
  matched `ChatState`, so chat snapshots decoded as the `Root` catch-all. Variant
  disambiguation also no longer relies on the removed `summary` field (a leftover
  from before `SessionState` was flattened); sessions are now matched on
  `lifecycle`.

## [0.5.0] — 2026-06-26

Implements AHP 0.5.0.

### Added

- `ChatDraftChangedAction` (`StateActionChatDraftChanged`, wire
  `chat/draftChanged`) and `ChatState.draft` (`Message?`) for syncing a chat's
  in-progress input draft; `chatReducer` sets or clears `draft` without stamping
  `modifiedAt`.
- `Message.model` and `Message.agent` optional fields recording the model /
  agent selection a message was composed with.
- `ChatActivityChangedAction` (`StateActionChatActivityChanged`, wire
  `chat/activityChanged`) for updating a chat's current activity description
  independently of the session summary.
- `ProgressParams` data class (wire `root/progress`) — a generic progress
  notification correlated by a `progressToken` (added on `CreateSessionParams`).
  Used today for the lazy first-use download of an agent's native SDK.
- `SessionModelInfo.maxOutputTokens` and `SessionModelInfo.maxPromptTokens`
  optional fields for communicating model token limits.
- `SessionSummary.meta` (`_meta` on the wire) optional provider metadata field
  for lightweight session-list presentation hints.
- `SessionActiveClientRemovedAction` (`StateActionSessionActiveClientRemoved`,
  wire `session/activeClientRemoved`) to release a single active client by
  `clientId`.

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
- `SessionState.activeClients` (`List<SessionActiveClient>`, required) replaces
  the single nullable `SessionState.activeClient`; `sessionReducer` upserts and
  removes entries keyed by `clientId`.
- `StateActionSessionActiveClientChanged` is renamed to
  `StateActionSessionActiveClientSet` (wire `session/activeClientSet`) with
  upsert-by-`clientId` semantics; it no longer unsets the active client
  (dispatch `session/activeClientRemoved` instead).
- `ConfigPropertySchema.enum` field is now `List<JsonElement>?` instead of
  `List<String>?`, allowing numeric, boolean, and null enum values.
- `ModelSelection.config` values are now `JsonElement` instead of `String`,
  allowing numeric, boolean, and null configuration values.

### Removed

- `StateActionSessionModelChanged` (`session/modelChanged`) and
  `StateActionSessionAgentChanged` (`session/agentChanged`). There is no longer
  a session-level model/agent selection — selection lives on each `Message` (and
  a chat's `draft`). The `model` / `agent` params were also removed from the
  `createSession` and `createChat` commands; pass them on the (initial) message
  instead.
- `SessionActiveClientToolsChangedAction`. An active client now updates its
  published tools by re-dispatching `StateActionSessionActiveClientSet` with its
  full, updated entry.

## [0.4.0] — 2026-06-19

Implements AHP 0.4.0.

### Added

- `MessageOrigin` data class now types `Message.origin` (previously an untyped
  `JsonElement`), and `MessageKind` gains `AGENT` and `TOOL` values for turns
  initiated by the agent or a tool rather than the user (e.g. a tool seeding the
  first message of a worker chat it spawned).
- `ConfigPropertySchema.additionalProperties` — optional field describing the
  schema for object-typed config properties beyond those in `properties`.
- `ChangesetContentChangedAction` for full-replacement changeset file
  snapshots with optional operations and error details.
- `ChangesetOperationStatus.Disabled` — new enum value for changeset
  operations that are currently unavailable and cannot be invoked.
- `ChangesetOperation.group` — optional identifier for grouping related
  changeset operations together in the UI.
- `_meta` (`meta`) field on the per-turn chat actions (`chat/turnStarted`,
  `chat/delta`, `chat/responsePart`, `chat/reasoning`, `chat/usage`,
  `chat/turnComplete`, `chat/turnCancelled`, `chat/error`) — optional
  provider-specific metadata so hosts can carry portable per-event context,
  such as attributing an event to a specific agent (e.g. a sub-agent acting
  within the turn).

### Changed

- `ToolResultSubagentContent.resource` is now specified as the spawned worker
  **chat** URI (`ahp-chat:/<cid>`), not a session URI — a tool-spawned
  sub-agent is a chat. Its doc now describes the correspondence with the worker
  chat's `ChatOrigin.Tool` record (matching `toolCallId`), which remains the
  canonical representation of the spawn relationship.
- **BREAKING:** `SessionStatus.rawValue` is now a `UInt` (was `Int`), and the
  named flag constants are `UInt` literals. `SessionStatus` is an unsigned
  32-bit bitset on the wire; a signed `Int` could not hold a forward-compat bit
  at or above `2^31` (`UInt` holds the full 32-bit range).
- **BREAKING:** `ChangesetOperationTarget`'s range target now carries a nested
  `TextRange` (`{start: {line, character}, end: {line, character}}`) instead of
  a flat `{start, end}` integer pair.

### Fixed

- `SessionStatus` decode fidelity: an unknown forward-compat bit at or above
  `2^31` (e.g. `2147483720`) now round-trips as a plain JSON integer instead of
  throwing `JsonDecodingException` and dropping the bit.
- `sessionReducer` now applies `_meta` (`meta`) updates from every
  tool-call-scoped action, not only `session/toolCallStart`.

### Added

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
- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `turnId` / `resource` / `range` / `resolved` without
  resending its entries. Handled by the annotations reducer (no-op on unknown
  id).

- `ahp-chat:` channel for per-chat conversation state; `SessionState.chats[]` catalog; `SessionState.defaultChat?` input-routing hint; `ChatOrigin` provenance union; `createChat` / `disposeChat` commands.
- `ChatSummary.workingDirectory` — optional per-chat working directory. Falls back to the session's `workingDirectory` when absent.
- `ChatInteractivity` enum (`Full` / `ReadOnly` / `Hidden`) and the optional `ChatSummary.interactivity` / `ChatState.interactivity` property describing how the user can interact with a chat. Absent defaults to `Full`.
- Three discrete chat-catalog actions on the session channel — `SessionChatAddedAction` (upsert by `summary.resource`), `SessionChatRemovedAction`, and `SessionChatUpdatedAction` (partial-update payload).
- `SessionDefaultChatChangedAction` (`session/defaultChatChanged`) — updates `SessionState.defaultChat` to steer new input to the designated chat; absent value clears the hint.
- `ErrorInfo.meta: Map<String, JsonElement>?` — optional provider-specific metadata bag on error payloads (serialized as `_meta`), mirroring the existing `meta` field on `UsageInfo` and other protocol types. Clients MAY inspect well-known keys here for richer, localised error UI.
- `RootState` now exposes an optional `_meta` property bag (`meta: Map<String,
  JsonElement>?`) for implementation-defined agent-host metadata, such as a
  well-known `hostBuild` key carrying the host's build version/commit/date.

### Changed

- `ChatState` is now flat — the previous embedded `summary` has been replaced with inlined `resource` / `title` / `status` / `activity` / `modifiedAt` / `model` / `agent` / `origin` / `workingDirectory` properties. `ChatSummary` remains as the standalone catalog entry on `SessionState.chats`.
- `ChatSummary.modifiedAt` and `ChatState.modifiedAt` are now ISO 8601 `String` values instead of `Long` milliseconds.

### Removed

- `SessionChatsChangedAction` (replaced by the three discrete chat-catalog actions above).

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


### Changed

- `fetchTurns` and `completions` now target an `ahp-chat:` channel; `PROTOCOL_VERSION` bumped to `0.4.0`.
- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- `SessionState.turns`, `SessionState.activeTurn`, `SessionState.steeringMessage`, `SessionState.queuedMessages`, `SessionState.inputRequests` (moved to `ChatState`).
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
