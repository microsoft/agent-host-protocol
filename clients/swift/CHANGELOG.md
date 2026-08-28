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

## [0.9.0] — 2026-08-28

Implements AHP 0.9.0.

### Added

- Automation catalogue and automation-run channels, including self-contained host-defined event triggers and automation-origin messages, for shared trigger-based agent session workflows.
- Turn errors are durable response parts, and resumable errors can reopen the same turn through `chat/turnResume`.
- `InitializeResult._meta` for hosts to advertise implementation-specific extension capabilities in initialize responses.

### Changed

- Annotations now carry an `origin` with a required session URI and optional chat URI and turn ID.
- Renamed the failed session lifecycle value from `creationFailed` to `failed`.
- `TerminalSessionClaim` now requires the chat URI that owns the terminal.
- Terminal state now uses an explicit `running`/`exited` lifecycle that preserves exits without an exit code.
- Generated clients now preserve unknown values for nonexhaustive protocol enums and their discriminated unions.
- `SessionToolClientExecutionRequest.toolCall` is narrowed to a running tool-call state.
- Automation catalogue snapshots now use `AutomationState.entries`, whose items are named `AutomationEntry`.

### Removed

- Removed `error` from `changeset/contentChanged`; changeset failures are represented by `changeset/statusChanged`.
- Removed session-level forking from `createSession`; use chat forking instead.
- `ContentNotFound` is no longer an exported AHP error code; `-32006` remains reserved and unassigned.

### Fixed

- Chat reducers now derive `modifiedAt` from turn action data instead of local wall clocks.

## [0.8.0] — 2026-08-17

Implements AHP 0.8.0.

### Added

- Optional `_meta` request metadata on all command parameters.
- `ClientPluginCustomization` can publish child enablement decisions.
- Reserve the `x-` prefix for implementation-defined channel URI schemes, commands, notifications, and actions. (#367)
- `session/workingDirectoryReplaced` atomically replaces a working-directory entry, including a replaceable primary. (#392)

### Changed

- Renamed `ResourceReponsePart` to `ResourceResponsePart`, correcting a misspelling. The Rust and Go clients already exposed the corrected name via generator-level renames; the TypeScript, Kotlin and Swift clients previously carried the typo, so the type now has one consistent name across all five clients.
- `SessionState.inputNeeded` entries of kind `toolClientExecution` no longer raise `SessionStatus.InputNeeded`. Such an entry is work delegated to a client, not a user prompt, so a session stays `InProgress` while a client tool runs.
- `Customization` enablement now carries scoped host-published provenance, and `session/customizationToggled` replaces its complete decision set.
- `auth/required` now carries complete `ProtectedResourceMetadata` in its required `resource` field.

### Fixed

- `session/workingDirectoryReplaced` retains an earlier duplicate replacement so a later replacement cannot move a protected primary, and `primaryReplacement` may accompany `immutablePrimary` for safe legacy-client compatibility.

## [0.7.0] — 2026-07-31

Implements AHP 0.7.0.

### Added

- Capability-gated side chats can start from a chat turn and return bounded chat transcripts as message attachments.
- Multiroot session support: `AgentCapabilities.multipleWorkingDirectories` capability (with `immutablePrimary`, which pins `workingDirectories[0]` as a fixed primary root that clients MUST NOT remove or reorder), `CreateSessionParams.workingDirectories` and `SessionMetadata.workingDirectories` (equal-peer set, mirrored onto `SessionState`/`SessionSummary`), `CreateChatParams.workingDirectories` and `ChatState`/`ChatSummary.workingDirectories` (a subset of the session's set), and the client-dispatchable `session/workingDirectorySet` / `session/workingDirectoryRemoved` and `chat/workingDirectorySet` / `chat/workingDirectoryRemoved` actions for mutating those sets. (#337)
- `AHPClient.completions()` and `AHPClient.sessionConfigCompletions()` convenience methods, plus `AHPCommands.completions(id:)` / `AHPCommands.sessionConfigCompletions(id:)` request factories, giving the generated `Completions*` / `SessionConfigCompletions*` types a typed entry point. (#340)
- `result` on `ToolResultTerminalContent` (`exitCode`, `preview`, `truncated`), present once the command exits. (#323)
- Optional `isPty` metadata on `ToolResultTerminalContent` and `TerminalState` indicating whether a terminal resource is PTY-backed. (#322)
- Side-chat sources and origins can now carry an immutable selected-text snapshot with optional response-part provenance.

### Changed

- Side-chat sources and origins now carry stable `turnId` references instead of nested active/completed turn snapshots.
- `MessageChatAttachment.endTurn` is optional; hosts pin the latest completed turn when it is omitted, and chat attachments may reference chats in other sessions.
- `chat/toolCallReady` may finalize a tool call's provisional contributor and intention without changing client execution ownership.
- Final tool input may be inline or a lazy `ContentRef`, and streaming deltas may include partial parameters.

### Removed

- `ToolResultTerminalCompleteContent`; command completion data now lives on `ToolResultTerminalContent`. (#322, #323)
- Non-standard `resource_encryption_alg_values_supported` and `resource_encryption_enc_values_supported` fields from `ProtectedResourceMetadata`. (#368)

### Fixed

- `createChat.source` is once again a fully discriminated union: fork and side-chat sources both require a `kind`, and missing or unknown kinds are rejected.
- Restored authentication documentation in the `authenticate` command and `McpAuthRequirement` that a secret-scanner had redacted, including a corrupted `WWW-Authenticate: Bearer scope="…"` header example.

## [0.6.0] — 2026-07-20

Implements AHP 0.6.0.

### Added

- `Changeset.capabilities` with a `review` presence flag (`ChangesetCapabilities`) so a changeset can advertise support for the per-file review workflow up-front on the session's changeset list. (#328)
- Optional `_meta` slot on `SystemNotificationResponsePart`, following the MCP `_meta` convention. A host MAY attach a machine-readable descriptor of what triggered the notification so clients can categorize, icon, group, filter, or localize it without parsing `content`. (#308)
- `chat/turnStarted` carries a `startedAt` timestamp, `chat/turnComplete`/`chat/turnCancelled`/`chat/error` carry an elapsed `duration` (milliseconds, producer's own clock), and completed turns expose their start time and duration.
- Asynchronous tool-call risk assessments with a model-provided explanation and normalized safety score.
- `ToolCallStatus.AuthRequired` tool call state and `chat/toolCallAuthRequired` / `chat/toolCallAuthResolved` actions so a running MCP-contributed tool call can pause mid-execution on an OAuth challenge (`McpAuthRequirement`) and resume once the client authenticates; surfaced at the session level via a new `toolAuthentication` `SessionInputRequest` variant, and `AuthenticateParams` gained an optional `scopes` field and now accepts resources discovered from a live `McpServerAuthRequiredState` or `ToolCallAuthRequiredState` in addition to `AgentInfo.protectedResources`. `chat/toolCallComplete` now also accepts a failed result while a tool call is `auth-required`, letting a client cancel that invocation without completing the authentication challenge.
- `McpAuthRequirement.oauthClient` metadata for pre-registered public and confidential OAuth clients.
- `AHPClient.ping()` for protocol-level connection liveness and an `AHPCommands.ping(id:)` request factory, mirroring the TypeScript client's `AhpClient.ping()`.
- `AHPCommands.createTerminal(id:params:)` and `AHPCommands.disposeTerminal(id:params:)` request factories, so the generated `CreateTerminalParams` / `DisposeTerminalParams` are reachable through the typed command surface for parity with `createSession` / `disposeSession`. (#341)

### Changed

- Renamed the changeset review action `changeset/filesReviewedChanged` to `changeset/filesReviewChanged` (field `fileIds` → `files`) and made it client-dispatchable, so a reviewer can toggle a file's `reviewed` flag directly through the write-ahead reducer. (#328)
- Input requests now live in turn `responseParts`, with an optional `response` until `chat/inputCompleted` submits the result. (#327)

## [0.5.2] — 2026-07-09

Implements AHP 0.5.2.

### Added

- Typed `resource*` convenience methods on `AHPClient`: send wrappers (`resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`, `resourceDelete`, `resourceMove`, `resourceResolve`, `resourceMkdir`, `resourceRequest`, `createResourceWatch`) and inbound server-request handling via `setServerRequestHandler(_:)` / `setResourceRequestHandlers(_:)` (new `ServerRequestHandler` typealias and `ResourceRequestHandlers` type). Inbound server-initiated requests are answered by the installed handler (still `MethodNotFound` when none is set).
- `ToolResultTerminalCompleteContent` for terminal-style completion metadata in tool
  results.
- Optional `enabled` field on the child customization types
  (`AgentCustomization`, `SkillCustomization`, `PromptCustomization`,
  `RuleCustomization`, `HookCustomization`).
- `disableUserInvocation` on `SkillCustomization`, plus `disableModelInvocation`
  and `disableUserInvocation` on `AgentCustomization`.
- Optional `reviewed` field on `ChangesetFile`. Omitting it (or setting it to
  `nil`) signals that the server does not support the file "review"
  functionality.
- `changeset/filesReviewedChanged` action for servers to update the `reviewed`
  flag of one or more changeset files.
- Optional `meta` (wire `_meta`) provider-metadata field on every customization
  type, moved from `AgentCustomization` up to the shared customization base so
  `PluginCustomization`, `ClientPluginCustomization`, `DirectoryCustomization`,
  `SkillCustomization`, `PromptCustomization`, `RuleCustomization`,
  `HookCustomization`, and `McpServerCustomization` all carry it.
- Optional `serverInfo` on `InitializeResult` and `clientInfo` on
  `InitializeParams`, each an `Implementation` (`name`, optional `version`,
  optional `title`), identifying the implementation and build behind either side
  of the handshake. Informational only — MUST NOT be used for feature detection.
- Optional `terminalCommandPrefix` on `InitializeResult` for hosts that support
  interpreting `!`-prefixed user messages as terminal commands.
- Optional `version` field on `PluginCustomization` (inherited by
  `ClientPluginCustomization`), carrying the plugin's semver sourced from the
  Open Plugins manifest. Provenance / display only.
- `session/mcpServerStartRequested` and `session/mcpServerStopRequested`
  actions for clients to ask the host to start or stop MCP servers; stopping
  moves an `authRequired` server to `stopped` so it no longer waits on
  authentication.
- `InputRequestResponsePart` and the `ResponsePart.inputRequest` case. The
  reducer now records a resolved input request in the active turn's
  `responseParts` on `chatInputCompleted` — embedding the resolved
  `ChatInputRequest` (final `answers`) and the `response` (`accept`, `decline`,
  or `cancel`) — so the outcome persists after the live request is removed.
  Abandoned requests still record nothing (#324).

### Changed

- The `session/customizationToggled` reducer now toggles any top-level
  customization (`plugin`, `directory`, or top-level `mcpServer`) or an
  individual child by `id`, setting that entry's `enabled`.

## [0.5.1] — 2026-07-02

Implements AHP 0.5.1.

### Added

- Optional `nonce` field on `ContentRef`.
- `SubscribeParams.delivery.maxLatencyMs` and
  `AHPClient.subscribe(_:delivery:)` for clients to request a maximum
  subscription delivery latency, including `0` for no intentional coalescing.
- Optional `capabilities` field on `AgentInfo` (`AgentCapabilities` with a
  nested `multipleChats` capability carrying `fork`) so clients gate multi-chat
  and fork via advertised capabilities instead of provider-id switches.
- Cursor-based pagination for `listSessions`, via new shared `PaginatedParams`
  (`limit` + `cursor`) and `PaginatedResult` (`nextCursor`) types:
  `ListSessionsParams` and `ListSessionsResult` now carry these fields, letting
  clients page through a large session catalogue. Fully additive — omitting the
  fields preserves prior behaviour.
- `SubscribeParams.view.turns`, `ChatState.turnsNextCursor`, and the
  `chat/turnsLoaded` action so clients can subscribe to a bounded tail of chat
  history and page older turns into the reduced chat state on demand.
- `SessionState.inputNeeded` — a session-level aggregate of outstanding input
  requests across all chats (`SessionInputRequest` enum with
  `SessionChatInputRequest`, `SessionToolConfirmationRequest`, and
  `SessionToolClientExecutionRequest` cases), plus the
  `StateAction.sessionInputNeededSet` / `StateAction.sessionInputNeededRemoved`
  actions and the `ToolCallConfirmationState` union. The session reducer
  maintains the `SessionStatus.inputNeeded` activity bit from the queue,
  clearing it (falling back to `.inProgress`) when the last entry is removed.
- Optional `intention` field on `ChatToolCallStartAction` and every tool-call
  lifecycle state.
- Optional `model` and `tools` fields on `AgentCustomization` for a custom
  agent's pinned model and tool allowlist.

### Changed

- `fetchTurns` now accepts `cursor` from `ChatState.turnsNextCursor` and returns
  an empty result after the host has loaded older turns into chat state, instead
  of returning a detached `{ turns, hasMore }` page.
- Generated clients now advertise only protocol `0.5.1`, since the `fetchTurns`
  contract is not wire-compatible with `0.5.0`.

### Removed

- `filter` field from `ListSessionsParams`. It was an untyped placeholder with
  no defined semantics; it will return with a concrete shape once session
  filtering/sorting is specified.

### Fixed

- `SnapshotState` now decodes the `chat` variant. Its decoder previously never
  attempted `ChatState`, so chat snapshots failed to decode. Variant
  disambiguation also no longer relies on the removed `summary` field (a leftover
  from before `SessionState` was flattened).

## [0.5.0] — 2026-06-26

Implements AHP 0.5.0.

### Added

- `ChatActivityChangedAction` (`StateAction.chatActivityChanged`, wire
  `chat/activityChanged`) for updating a chat's current activity description
  independently of the session summary.
- `ProgressParams` struct (wire `root/progress`) — a generic progress notification
  correlated by a `progressToken` (added on `CreateSessionParams`).
  Used today for the lazy first-use download of an agent's native SDK.
- `SessionModelInfo.maxOutputTokens` and `SessionModelInfo.maxPromptTokens`
  optional fields for communicating model token limits.
- `SessionSummary.meta` (`_meta` on the wire) optional provider metadata field
  for lightweight session-list presentation hints.
- `SessionActiveClientRemovedAction` (`StateAction.sessionActiveClientRemoved`,
  wire `session/activeClientRemoved`) to release a single active client by
  `clientId`.
- `ChatDraftChangedAction` (`StateAction.chatDraftChanged`, wire
  `chat/draftChanged`) and `ChatState.draft` (`Message?`) to set or clear the
  user's in-progress draft input for a chat. The chat reducer applies it
  without stamping `modifiedAt`.
- `Message.model` and `Message.agent` optional fields carrying the selection a
  message was composed with.

### Changed

- `SessionState.activeClients` (`[SessionActiveClient]`, required) replaces the
  single optional `SessionState.activeClient`; the session reducer upserts and
  removes entries keyed by `clientId`.
- `StateAction.sessionActiveClientChanged` is renamed to
  `StateAction.sessionActiveClientSet` (wire `session/activeClientSet`) with
  upsert-by-`clientId` semantics; it no longer unsets the active client
  (dispatch `session/activeClientRemoved` instead).
- `ConfigPropertySchema.enum` field is now `[AnyCodable]?` instead of
  `[String]?`, allowing numeric, boolean, and null enum values.
- `ModelSelection.config` values are now `AnyCodable` instead of `String`,
  allowing numeric, boolean, and null configuration values.
- `SessionState` now inlines the session metadata fields (`provider`, `title`,
  `status`, `activity`, `project`, `workingDirectory`, `annotations`) directly
  instead of embedding a `summary: SessionSummary`. The session reducer mutates
  these fields directly and no longer stamps a `modifiedAt`. `SessionSummary`
  remains a root-only catalog struct whose `createdAt`/`modifiedAt` are now
  ISO-8601 `String`s and which no longer carries `model`/`agent`.
- `ChatState` and `ChatSummary` no longer carry `model`/`agent`.

### Removed

- `SessionActiveClientToolsChangedAction`. An active client now updates its
  published tools by re-dispatching `StateAction.sessionActiveClientSet` with its
  full, updated entry.
- `SessionModelChangedAction` (`StateAction.sessionModelChanged`,
  `session/modelChanged`) and `SessionAgentChangedAction`
  (`StateAction.sessionAgentChanged`, `session/agentChanged`), along with their
  session-reducer handling.

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

- New annotations channel wire types (`ahp-session:/<uuid>/annotations`):
  `AnnotationsState`, `Annotation`, `AnnotationEntry`,
  `AnnotationsSummary`; and the client-dispatchable
  `annotations/set` / `annotations/removed` / `annotations/entrySet`
  / `annotations/entryRemoved` cases on `StateAction` — clients drive every
  annotation mutation by dispatching these directly, assigning the
  `Annotation.id` / `AnnotationEntry.id` themselves; and
  `SnapshotState.annotations`.
- `MessageAnnotationsAttachment` (`annotations` `MessageAttachment` variant)
  referencing annotations on a session's annotations channel by `resource`
  URI, optionally narrowed to an `annotationIds` array.
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
