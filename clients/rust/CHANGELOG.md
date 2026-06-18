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

- `ahp_error_codes::CONFLICT` constant (`-32011`) added to `ahp-types`; covers ETag-conflict failures from `ResourceWriteParams.if_match` checks.
- `apply_action_to_changeset`, `apply_action_to_annotations`, and `apply_action_to_resource_watch` reducers in `ahp`; all previously-skipped conformance fixtures for the `changeset`, `annotations`, and `resourceWatch` reducer families now pass.
- `ChangesetOperationStatus::Disabled` — new variant for changeset operations
  that are currently unavailable and cannot be invoked.
- `ChangesetOperation.group` — optional identifier for grouping related
  changeset operations together in the UI.

### Changed

- **BREAKING:** `SessionStatus` is now a `u32` bitset newtype
  (`struct SessionStatus(pub u32)` with named flag constants) instead of a
  `#[repr(u32)]` enum. The wire form is a numeric bitset, so the enum could not
  represent combined flags (e.g. `InProgress | IsArchived`) or preserve unknown
  forward-compat bits. Combine flags with `|` and test with `contains(..)`.
- **BREAKING:** `ChangesetOperationTarget`'s range target now carries a nested
  `TextRange` (`{start: {line, character}, end: {line, character}}`) instead of
  a flat `{start, end}` integer pair.

### Fixed

- `SessionStatus` encode/decode fidelity: combined and unknown bitset bits now
  round-trip exactly instead of being dropped or rejected.
- `ActionEnvelope.origin` is now omitted from serialized output when absent
  (`#[serde(skip_serializing_if = "Option::is_none")]`) instead of serializing
  as `null`.
- Session reducers now apply `_meta` (`meta`) updates from every
  tool-call-scoped action, not only `session/toolCallStart`.

### Added

- `SnapshotState::ResourceWatch` variant and matching
  `MultiHostStateMirror::resource_watches()` slot, so `apply_snapshot` can
  seed an `ahp-resource-watch:` channel's descriptor (root URI, recursive
  flag, optional includes/excludes) alongside the existing root / session /
  terminal / changeset / annotations slots. `reset_host` / `reset` clear the
  new slot.

### Added

- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `turn_id` / `resource` / `range` / `resolved` without
  resending its entries. Handled by the annotations reducer (no-op on unknown
  id).

- `ahp-chat:` channel for per-chat conversation state; `SessionState.chats[]` catalog; `SessionState.defaultChat?` input-routing hint; `ChatOrigin` provenance union; `createChat` / `disposeChat` commands.
- `ChatSummary.working_directory` — optional per-chat working directory. Falls back to the session's `working_directory` when absent.
- Three discrete chat-catalog actions on the session channel — `SessionChatAdded` (upsert by `summary.resource`), `SessionChatRemoved`, and `SessionChatUpdated` (partial-update payload).
- `SessionDefaultChatChanged` (`session/defaultChatChanged`) — updates `SessionState.default_chat` to steer new input to the designated chat; absent value clears the hint.
- `ErrorInfo.meta: Option<JsonObject>` — optional provider-specific metadata bag on error payloads (serialized as `_meta`), mirroring the existing `meta` field on `UsageInfo` and other protocol types.
- `RootState` now exposes an optional `_meta` property bag (`meta:
  Option<JsonObject>`) for implementation-defined agent-host metadata, such as
  a well-known `hostBuild` key carrying the host's build version/commit/date.

### Changed

- `ChatState` is now flat — the previous embedded `summary` has been replaced with inlined `resource` / `title` / `status` / `activity` / `modified_at` / `model` / `agent` / `origin` / `working_directory` fields. `ChatSummary` remains as the standalone catalog entry on `SessionState.chats`.
- `ChatSummary.modified_at` and `ChatState.modified_at` are now ISO 8601 `String` values instead of `u64` milliseconds.

### Removed

- `SessionChatsChanged` variant on `StateAction` (replaced by the three discrete chat-catalog variants above).

## [0.3.0] — 2026-06-05

Implements AHP 0.3.0.

### Added

- `McpServerCustomization` now exposes the full MCP lifecycle: `enabled`,
  the discriminated `McpServerState` enum
  (`Starting`/`Ready`/`AuthRequired`/`Error`/`Stopped`), optional
  `channel` URI for the `mcp://` side-channel, and optional `mcp_app`
  block carrying `AhpMcpUiHostCapabilities` for MCP Apps.
- `McpServerAuthRequiredState` variant carries `ProtectedResourceMetadata`
  plus `reason` / `required_scopes` / `description` so the existing
  `authenticate` command can drive per-server auth.
- `Customization::McpServer` top-level variant — hosts MAY now surface
  bare MCP servers directly rather than only inside a plugin or
  directory.
- `SessionMcpServerStateChanged` action and matching reducer arm —
  narrow upsert of `state` + `channel` on an existing MCP
  server customization by id.
- `ClientCapabilities` struct on `InitializeParams.capabilities` with
  first entry `mcp_apps`.
- `changeKind` field on `Changeset` (well-known values: `'session'`,
  `'branch'`, `'uncommitted'`, `'turn'`, `'compare-turns'`).
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.
- `AgentCustomization._meta` provider metadata field.
- Optional `changes` field on `SessionSummary` (`ChangesSummary` with optional `additions`, `deletions`, and `files` counts) summarising a session's file-change footprint.
- New annotations channel wire types (`ahp-session:/<uuid>/annotations`):
  `AnnotationsState`, `Annotation`, `AnnotationEntry`,
  `AnnotationsSummary`; the client-dispatchable
  `annotations/set` / `annotations/removed` / `annotations/entrySet`
  / `annotations/entryRemoved` action variants — clients drive every annotation
  mutation by dispatching these directly, assigning the `Annotation.id` /
  `AnnotationEntry.id` themselves;
  `MultiHostStateMirror.annotations()` and `SnapshotState::Annotations`.
  Reducer logic is deferred (matches the changeset stub).
- `MessageAnnotationsAttachment` (`annotations` `MessageAttachment` variant)
  referencing annotations on a session's annotations channel by `resource`
  URI, optionally narrowed to an `annotationIds` array.


### Changed

- `fetchTurns` and `completions` now target an `ahp-chat:` channel; `PROTOCOL_VERSION` bumped to `0.4.0`.
- Reducers split into per-chat and session-aggregate handlers to match the multi-chat protocol shape. `SessionInput*` types renamed to `ChatInput*` (they now live on the chat channel).
- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- `SessionState.turns`, `SessionState.activeTurn`, `SessionState.steeringMessage`, `SessionState.queuedMessages`, `SessionState.inputRequests` (moved to `ChatState`).
- Removed the `additions`, `deletions`, and `files` fields from `ChangesetSummary`. Aggregate counts now live on `SessionSummary.changes`; per-changeset views derive their own totals from `ChangesetState.files`.

### Changed

- `ToolCallBase.tool_client_id: Option<String>` replaced by
  `ToolCallBase.contributor: Option<ToolCallContributor>` (enum with
  `Client { client_id }` and `Mcp { customization_id }` variants).
  `SessionToolCallStartAction` carries the new `contributor` field as
  well. The reducer follows the rename.

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
