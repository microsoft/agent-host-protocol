# Changelog — `AgentHostProtocol` Swift Package

All notable changes to the Swift package (`AgentHostProtocol` +
`AgentHostProtocolClient` products) are documented here. See
[`../../CHANGELOG.md`](../../CHANGELOG.md) for the protocol spec changelog
and [`release-metadata.json`](release-metadata.json) for the machine-readable
mapping between the current source tree and protocol versions.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the package follows [SemVer](https://semver.org).

SwiftPM resolves packages by matching plain `vX.Y.Z` git tags at the repo
root, so Swift releases use the bare semver tag namespace (no `swift/`
prefix). The `publish-swift.yml` workflow refuses to publish a `vX.Y.Z` tag
whose matching `## [X.Y.Z]` heading is missing from this file, and verifies
the tag matches the version pinned in [`VERSION`](VERSION).

## [Unreleased]

### Added

- `SessionSummary.meta` (`_meta` on the wire) optional provider metadata field
  for lightweight session-list presentation hints.

## [0.4.0] — 2026-06-19

Implements AHP 0.4.0.

### Added

- `MessageOrigin` struct and `MessageKind` enum now type `Message.origin`
  (previously an untyped `AnyCodable`); `MessageKind` covers `user`, `agent`,
  `tool`, and `systemNotification`, adding faithful agent- and tool-initiated
  origins.
- `ConfigPropertySchema.additionalProperties` — optional field describing the
  schema for object-typed config properties beyond those in `properties`.
- `ChangesetContentChangedAction` for full-replacement changeset file
  snapshots with optional operations and error details.
- `ChangesetOperationStatus.disabled` — new case for changeset operations
  that are currently unavailable and cannot be invoked.
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
  chat's `ChatOrigin.tool` record (matching `toolCallId`), which remains the
  canonical representation of the spawn relationship.
- **BREAKING:** `SessionStatus` is now an `OptionSet` with a `UInt32` rawValue
  (was `Int`), an unsigned 32-bit bitset that preserves combined and unknown
  forward-compat bits. Combine flags with set-union (`∪` / `union`) and test
  membership with `contains(_:)`.
- **BREAKING:** `ChangesetOperationTarget`'s range target now carries a nested
  `TextRange` (`{start: {line, character}, end: {line, character}}`) instead of
  a flat `{start, end}` integer pair.

### Added

- `SnapshotState.resourceWatch` case and matching
  `MultiHostStateMirror.resourceWatches` slot, so `applySnapshot(host:snapshot:)`
  can seed an `ahp-resource-watch:` channel's descriptor (root URI, recursive
  flag, optional includes/excludes) alongside the existing root / session /
  terminal / changeset / annotations slots. `reset(host:)` / `reset()` clear
  the new slot.

### Fixed

- `AnyCodable.encode` no longer corrupts `NSNumber`-backed `Int`/`Double` values to `Bool`/`Int`. `NSNumber` is now special-cased before the generic Swift type arms, using `CFBooleanGetTypeID()` to distinguish boolean from numeric `NSNumber` instances.
- `AnyCodable.encode(to:)` now preserves unsigned integers above `Int64.max` (encoding `NSNumber` values whose `objCType` is unsigned via `uint64Value` instead of the signed `int64Value` fallback), and the `AnyCodable.swift` template in `scripts/generate-swift.ts` reproduces the full encode/equality logic so regenerating the scaffold no longer reintroduces the bug.
- `MultiHostClient`/host runtime now advertises the generated `SUPPORTED_PROTOCOL_VERSIONS` on `initialize` instead of a stale hard-coded `"0.2.0"`.
- Session reducers now apply `_meta` (`meta`) updates from every
  tool-call-scoped action, not only `session/toolCallStart`.

### Added

- `annotationsReducer` implemented; annotations conformance fixtures (210–219) now pass.

- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `turnId` / `resource` / `range` / `resolved` without
  resending its entries. Handled by the annotations reducer (no-op on unknown
  id).

- `ahp-chat:` channel for per-chat conversation state; `SessionState.chats[]` catalog; `SessionState.defaultChat?` input-routing hint; `ChatOrigin` provenance union; `createChat` / `disposeChat` commands.
- `SessionChatAddedAction`, `SessionChatRemovedAction`, and `SessionChatUpdatedAction` handling for incremental chat catalog updates.
- `ChatSummary.workingDirectory` — optional per-chat working directory. Falls back to the session's `workingDirectory` when absent.
- `SessionDefaultChatChangedAction` (`session/defaultChatChanged`) — updates `SessionState.defaultChat` to steer new input to the designated chat; absent value clears the hint.
- `ErrorInfo.meta: [String: AnyCodable]?` — optional provider-specific metadata bag on error payloads (serialized as `_meta`), mirroring the existing `meta` field on `UsageInfo` and other protocol types. Clients MAY inspect well-known keys here for richer, localised error UI.
- `RootState` now exposes an optional `_meta` property bag (`meta: [String:
  AnyCodable]?`) for implementation-defined agent-host metadata, such as a
  well-known `hostBuild` key carrying the host's build version/commit/date.
- `changesetReducer` and `resourceWatchReducer` — the two state reducers
  that were missing from the Swift client are now implemented, mirroring the
  canonical TypeScript reducers (and the Kotlin/.NET clients). `changesetReducer`
  folds `changeset/*` actions into `ChangesetState`; `resourceWatchReducer`
  treats `resourceWatch/changed` as a documented event pass-through. The
  fixture-driven reducer test no longer silently skips the terminal, changeset,
  and resourceWatch fixture families — they now decode and assert, with the
  remaining gaps (unknown-discriminant response part; the not-yet-implemented
  annotations channel) pinned by an explicit drift tripwire.

### Changed

- `ChatState` is now flat — the previous embedded `summary` has been replaced with inlined `resource` / `title` / `status` / `activity` / `modifiedAt` / `model` / `agent` / `origin` / `workingDirectory` properties. `ChatSummary` remains as the standalone catalog entry on `SessionState.chats`.
- `ChatSummary.modifiedAt` and `ChatState.modifiedAt` are now ISO 8601 `String` values instead of `Int64`/`UInt64` milliseconds.

### Added

- `ChatSummary.interactivity` / `ChatState.interactivity` (`"full" | "read-only" | "hidden"`) indicating how the user can interact with a chat. Absent defaults to `"full"`.

### Removed

- `SessionChatsChangedAction` (replaced by the three discrete chat-catalog actions above).

### Fixed

- Encode-fidelity: an unknown `StateAction` variant no longer re-encodes to
  `{}` (dropping its `type` discriminant and extra fields); the raw payload is
  preserved on decode and re-emitted verbatim.
- Forward-compatibility: unknown discriminants on wire-decoded discriminated
  unions (`ResponsePart`, `ToolCallState`, `TerminalClaim`,
  `TerminalContentPart`, `Customization`, and other evolvable unions) now decode
  to a raw passthrough and re-encode verbatim instead of throwing
  `DecodingError`, so a snapshot carrying an unknown variant still decodes and
  subsequent actions fold correctly.
- `ChangesetOperationResourceTarget` / `…RangeTarget` now encode their `kind`
  discriminant (previously a computed property excluded from `CodingKeys`, so it
  was dropped on encode).

## [0.3.0] — 2026-06-05

Implements AHP 0.3.0.

### Added

- `McpServerCustomization` now exposes the full MCP lifecycle: `enabled`,
  the discriminated `McpServerState` enum
  (`.starting`/`.ready`/`.authRequired`/`.error`/`.stopped`), optional
  `channel` URI for the `mcp://` side-channel, and optional `mcpApp`
  block carrying `AhpMcpUiHostCapabilities` for MCP Apps.
- `McpServerAuthRequiredState` carries `ProtectedResourceMetadata`
  plus `reason` / `requiredScopes` / `description` so the existing
  `authenticate` command can drive per-server auth.
- `Customization.mcpServer` top-level case — hosts MAY surface bare
  MCP servers directly rather than only inside a plugin or directory.
- `SessionMcpServerStateChangedAction` and matching reducer arm —
  narrow upsert of `state` + `channel` on an existing MCP
  server customization by id. Wired through both `Reducers.swift` and
  the protocol-based `NativeReducer.swift`.
- `ClientCapabilities` struct on `InitializeParams.capabilities` with
  first entry `mcpApps`.
- `changeKind` field on `Changeset` (well-known values: `'session'`,
  `'branch'`, `'uncommitted'`, `'turn'`, `'compare-turns'`).
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.
- `AgentCustomization._meta` provider metadata field.
- Optional `changes` field on `SessionSummary` (`ChangesSummary` with optional `additions`, `deletions`, and `files` counts) summarising a session's file-change footprint.
- New annotations channel wire types (`ahp-session:/<uuid>/annotations`):
  `AnnotationsState`, `Annotation`, `AnnotationEntry`,
  `AnnotationsSummary`; and the client-dispatchable
  `annotations/set` / `annotations/removed` / `annotations/entrySet`
  / `annotations/entryRemoved` cases on `StateAction` — clients drive every
  annotation mutation by dispatching these directly, assigning the
  `Annotation.id` / `AnnotationEntry.id` themselves; and
  `SnapshotState.annotations`.
  Reducer logic is deferred (matches the changeset/resource-watch parity).
- `MessageAnnotationsAttachment` (`annotations` `MessageAttachment` variant)
  referencing annotations on a session's annotations channel by `resource`
  URI, optionally narrowed to an `annotationIds` array.


### Changed

- `fetchTurns` and `completions` now target an `ahp-chat:` channel; `PROTOCOL_VERSION` bumped to `0.4.0`.
- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- `SessionState.turns`, `SessionState.activeTurn`, `SessionState.steeringMessage`, `SessionState.queuedMessages`, `SessionState.inputRequests` (moved to `ChatState`).
- Removed the `additions`, `deletions`, and `files` fields from `ChangesetSummary`. Aggregate counts now live on `SessionSummary.changes`; per-changeset views derive their own totals from `ChangesetState.files`.

### Changed

- `ToolCallBase.toolClientId: String?` replaced by
  `ToolCallBase.contributor: ToolCallContributor?` (enum with
  `.client(ToolCallClientContributor)` and `.mcp(ToolCallMcpContributor)`
  cases). `SessionToolCallStartAction` carries the new `contributor`
  field as well. `Reducers.swift`, `NativeReducer.swift`, and
  `ToolCallStateExtensions.swift` follow the rename.

## [0.2.0] — 2026-05-28

Implements AHP `0.2.0`.

First versioned Swift Package Manager release. Includes:

- `AgentHostProtocol` product — generated wire types, actions, commands,
  notifications, errors, reducers (`AHPRootReducer`, `AHPSessionReducer`,
  `AHPTerminalReducer`, `AHPChangesetReducer`, `NativeReducer`). Includes
  the extended `resource*` family (`resourceResolve`, `resourceMkdir`,
  `createResourceWatch`, the new `ahp-resource-watch:/` channel with the
  `resourceWatch/changed` action), `ResourceWriteParams`'s `mode` /
  `position` / `ifMatch` fields, the new `Conflict` (`-32011`) error code,
  and the bidirectional content-bearing `resource*` surface exposed on
  both `CommandMap` and `ServerCommandMap`.
- `UserMessage.meta` optional `[String: AnyCodable]?` field (serialized as
  `_meta`), exposing the new spec-level provider metadata channel on user
  messages. The generated `init` gains a trailing `meta:` parameter that
  defaults to `nil`.
- `AgentHostProtocolClient` product — single-host `AHPClient`, multi-host
  `MultiHostClient`, `AHPStateMirror` / `MultiHostStateMirror`, transports
  (`URLSessionWebSocketTransport`, `NWConnectionWebSocketTransport`,
  `InMemoryTransport`), and persistent client-ID stores.
- Generated `PROTOCOL_VERSION` and `SUPPORTED_PROTOCOL_VERSIONS` constants
  on the `AgentHostProtocol` module.
