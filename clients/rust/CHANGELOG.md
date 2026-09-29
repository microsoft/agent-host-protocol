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

## [0.9.0] — 2026-08-28

Implements AHP 0.9.0.

### Added

- Automation catalogue and automation-run channels, including self-contained host-defined event triggers and automation-origin messages, for shared trigger-based agent session workflows.
- Turn errors are durable response parts, and resumable errors can reopen the same turn through `chat/turnResume`.
- `InitializeResult._meta` for hosts to advertise implementation-specific extension capabilities in initialize responses.

### Changed

- Annotations now carry an `origin` with a required session URI and optional chat URI and turn ID.
- Rust reducers now return `ReduceOutcome::Invalid(ReduceError)` for malformed action data instead of panicking.
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
- `Client::completions()` and `Client::session_config_completions()` typed wrappers for the `completions` / `sessionConfigCompletions` commands, matching the existing `resource_*` convenience methods. (#340)
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
- `Client::ping()` for protocol-level connection liveness, mirroring the TypeScript client's `AhpClient.ping()`.

### Changed

- Renamed the changeset review action `changeset/filesReviewedChanged` to `changeset/filesReviewChanged` (field `fileIds` → `files`) and made it client-dispatchable, so a reviewer can toggle a file's `reviewed` flag directly through the write-ahead reducer. (#328)
- Input requests now live in turn `responseParts`, with an optional `response` until `chat/inputCompleted` submits the result. (#327)

## [0.5.2] — 2026-07-09

Implements AHP 0.5.2.

### Added

- Typed `resource*` convenience methods on `ahp::Client`: send wrappers (`resource_read`, `resource_write`, `resource_list`, `resource_copy`, `resource_delete`, `resource_move`, `resource_resolve`, `resource_mkdir`, `resource_request`, `create_resource_watch`) and inbound server-request handling via `set_server_request_handler` / `set_resource_request_handlers` (new `ServerRequestHandler`, `ServerRequestFuture`, and `ResourceRequestHandlers` types). Inbound server-initiated requests are now answered (previously dropped) — via the installed handler, or `MethodNotFound` when none is set.
- `ToolResultTerminalCompleteContent` for terminal-style completion metadata in tool
  results.
- Optional `enabled` field on the child customization types
  (`AgentCustomization`, `SkillCustomization`, `PromptCustomization`,
  `RuleCustomization`, `HookCustomization`).
- `disable_user_invocation` on `SkillCustomization`, plus
  `disable_model_invocation` and `disable_user_invocation` on
  `AgentCustomization`.
- Optional `reviewed` field on `ChangesetFile`. Omitting it (or setting it to
  `None`) signals that the server does not support the file "review"
  functionality.
- `changeset/filesReviewedChanged` action for servers to update the `reviewed`
  flag of one or more changeset files.
- Optional `meta` (wire `_meta`) provider-metadata field on every customization
  type, moved from `AgentCustomization` up to the shared customization base so
  `PluginCustomization`, `ClientPluginCustomization`, `DirectoryCustomization`,
  `SkillCustomization`, `PromptCustomization`, `RuleCustomization`,
  `HookCustomization`, and `McpServerCustomization` all carry it.
- Optional `server_info` on `InitializeResult` and `client_info` on
  `InitializeParams`, each an `Implementation` struct (`name`, optional
  `version`, optional `title`), identifying the implementation and build behind
  either side of the handshake. Informational only — MUST NOT be used for
  feature detection.
- Optional `terminal_command_prefix` on `InitializeResult` for hosts that
  support interpreting `!`-prefixed user messages as terminal commands.
- Optional `version` field on `PluginCustomization` (inherited by
  `ClientPluginCustomization`), carrying the plugin's semver sourced from the
  Open Plugins manifest. Provenance / display only.
- `session/mcpServerStartRequested` and `session/mcpServerStopRequested`
  actions for clients to ask the host to start or stop MCP servers; stopping
  moves an `authRequired` server to `stopped` so it no longer waits on
  authentication.
- `InputRequestResponsePart` and the `ResponsePart::InputRequest` variant. The
  reducer now records a resolved input request in the active turn's
  `response_parts` on `chat/inputCompleted` — embedding the resolved
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
- `SubscribeParams.delivery.max_latency_ms` and
  `Client::subscribe_with_delivery` for clients to request a maximum
  subscription delivery latency, including `0` for no intentional coalescing.
- Optional `capabilities` field on `AgentInfo` (`AgentCapabilities` with a
  nested `multipleChats` capability carrying `fork`) so clients gate multi-chat
  and fork via advertised capabilities instead of provider-id switches.
- Cursor-based pagination for `listSessions`, via new shared `PaginatedParams`
  (`limit` + `cursor`) and `PaginatedResult` (`next_cursor`) types:
  `ListSessionsParams` and `ListSessionsResult` now carry these fields, letting
  clients page through a large session catalogue. Fully additive — omitting the
  fields preserves prior behaviour.
- `SubscribeParams.view.turns`, `Client::subscribe_with_options`,
  `ChatState.turns_next_cursor`, and the `chat/turnsLoaded` action so clients
  can subscribe to a bounded tail of chat history and page older turns into the
  reduced chat state on demand.
- `SessionState.input_needed` — a session-level aggregate of outstanding input
  requests across all chats (`SessionInputRequest` enum with
  `SessionChatInputRequest`, `SessionToolConfirmationRequest`, and
  `SessionToolClientExecutionRequest` variants), plus the
  `StateAction::SessionInputNeededSet` / `StateAction::SessionInputNeededRemoved`
  actions and the `ToolCallConfirmationState` union. The session reducer
  maintains the `SessionStatus::InputNeeded` activity bit from the queue,
  clearing it (falling back to `InProgress`) when the last entry is removed.
- Optional `intention` field on `ChatToolCallStartAction` and every tool-call
  lifecycle state.
- Optional `model` and `tools` fields on `AgentCustomization` for a custom
  agent's pinned model and tool allowlist.

### Changed

- `fetchTurns` now accepts `cursor` from `ChatState.turns_next_cursor` and
  returns an empty result after the host has loaded older turns into chat state,
  instead of returning a detached `{ turns, hasMore }` page.
- Generated clients now advertise only protocol `0.5.1`, since the `fetchTurns`
  contract is not wire-compatible with `0.5.0`.

- Direct Rust struct literals for `SubscribeParams` must now include
  `delivery: None` and `view: None`; use `SubscribeParams::new(channel)` or
  `Client::subscribe` to keep the default delivery behavior.

### Removed

- `filter` field from `ListSessionsParams`. It was an untyped placeholder with
  no defined semantics; it will return with a concrete shape once session
  filtering/sorting is specified.

## [0.5.0] — 2026-06-26

Implements AHP 0.5.0.

### Added

- `StateAction::ChatActivityChanged` (`ChatActivityChangedAction`, wire
  `chat/activityChanged`) for updating a chat's current activity description
  independently of the session summary.
- `ProgressParams` struct (wire `root/progress`) — a generic progress notification
  correlated by a `progressToken` (added on `CreateSessionParams`).
  Used today for the lazy first-use download of an agent's native SDK.
- `SessionModelInfo.maxOutputTokens` and `SessionModelInfo.maxPromptTokens`
  optional fields for communicating model token limits.
- `SessionSummary.meta` (`_meta` on the wire) optional provider metadata field
  for lightweight session-list presentation hints.
- `StateAction::SessionActiveClientRemoved` (`SessionActiveClientRemovedAction`)
  to release a single active client by `client_id`.
- `StateAction::ChatDraftChanged` (`ChatDraftChangedAction`) and the chat-reducer
  arm that sets or clears `ChatState.draft`.
- `ChatState.draft` (`Option<Message>`) holding an in-progress, unsent message.
- `Message.model` and `Message.agent` optional fields recording the model and
  agent selected for a message.
- `ahp-ws` TLS backend is now selectable via Cargo features: `native-tls`,
  `rustls-tls-native-roots` (default), and `rustls-tls-webpki-roots`. The crate
  no longer forces `tokio-tungstenite/native-tls` onto the dependency graph, so
  downstream binaries are free to choose their own WebSocket TLS stack.

### Changed

- `SessionState` no longer embeds a `summary` sub-struct; its metadata fields
  (`provider`, `title`, `status`, `activity`, `project`, `working_directory`,
  `annotations`) are now inlined directly on `SessionState`, which no longer
  carries `model`, `agent`, `created_at`, or `modified_at`. The session reducer
  reads and writes these flat fields and no longer stamps `modified_at`.
- `SessionSummary.created_at` and `SessionSummary.modified_at` are now ISO-8601
  `String`s (previously numeric); `SessionSummary` no longer has `model` or
  `agent`.
- `ChatState` and `ChatSummary` no longer carry `model` or `agent`.
- `ahp-ws` now defaults to rustls (`rustls-tls-native-roots`, `ring` provider)
  instead of `native-tls`, dropping the OpenSSL link on Linux while still
  validating against the OS trust store. To keep the previous behaviour, depend
  on `ahp-ws` with `default-features = false, features = ["native-tls"]`.
- `ConfigPropertySchema.enum` field is now `Option<Vec<AnyValue>>` instead of
  `Option<Vec<String>>`, allowing numeric, boolean, and null enum values.
- `ModelSelection.config` values are now `AnyValue` instead of `String`,
  allowing numeric, boolean, and null configuration values.
- `SessionState.active_clients` (`Vec<SessionActiveClient>`, required) replaces
  the single optional `SessionState.active_client`; the session reducer upserts
  and removes entries keyed by `client_id`.
- `StateAction::SessionActiveClientChanged` is renamed to
  `StateAction::SessionActiveClientSet` with upsert-by-`client_id` semantics; it
  no longer unsets the active client (dispatch `SessionActiveClientRemoved`
  instead).

### Removed

- `StateAction::SessionModelChanged` (`SessionModelChangedAction`) and
  `StateAction::SessionAgentChanged` (`SessionAgentChangedAction`), along with
  their session-reducer arms.
- `SessionActiveClientToolsChangedAction`. An active client now updates its
  published tools by re-dispatching `SessionActiveClientSet` with its full,
  updated entry.

### Fixed

- `apply_action_to_chat` now updates the matching turn in `turns` when a
  `StateAction::ChatUsage` targets a completed (non-active) turn, rather than
  ignoring the action.

## [0.4.0] — 2026-06-19

Implements AHP 0.4.0.

### Added

- `MessageOrigin` struct and `MessageKind` enum now type `Message.origin`
  (previously an untyped `serde_json::Value`); `MessageKind` covers `User`,
  `Agent`, `Tool`, and `SystemNotification`, adding faithful agent- and
  tool-initiated origins.
- `ConfigPropertySchema.additional_properties` — optional field describing the
  schema for object-typed config properties beyond those in `properties`.
- `ChangesetContentChangedAction` for full-replacement changeset file
  snapshots with optional operations and error details.
- `ahp_error_codes::CONFLICT` constant (`-32011`) added to `ahp-types`; covers ETag-conflict failures from `ResourceWriteParams.if_match` checks.
- `apply_action_to_changeset`, `apply_action_to_annotations`, and `apply_action_to_resource_watch` reducers in `ahp`; all previously-skipped conformance fixtures for the `changeset`, `annotations`, and `resourceWatch` reducer families now pass.
- `ChangesetOperationStatus::Disabled` — new variant for changeset operations
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
  chat's `ChatOrigin::Tool` record (matching `tool_call_id`), which remains the
  canonical representation of the spawn relationship.
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
- `AnnotationsUpdatedAction` (`annotations/updated`) — partially updates an
  existing annotation's `turn_id` / `resource` / `range` / `resolved` without
  resending its entries. Handled by the annotations reducer (no-op on unknown
  id).

- `ahp-chat:` channel for per-chat conversation state; `SessionState.chats[]` catalog; `SessionState.defaultChat?` input-routing hint; `ChatOrigin` provenance union; `createChat` / `disposeChat` commands.
- `ChatSummary.working_directory` — optional per-chat working directory. Falls back to the session's `working_directory` when absent.
- `ChatInteractivity` enum (`Full` / `ReadOnly` / `Hidden`) and the optional `ChatSummary.interactivity` / `ChatState.interactivity` field describing how the user can interact with a chat. Absent defaults to `Full`.
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
