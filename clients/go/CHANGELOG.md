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
- `Client.Completions()` and `Client.SessionConfigCompletions()` typed wrappers for the `completions` / `sessionConfigCompletions` commands, matching the existing `resource*` convenience methods. (#340)
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
- `Client.Ping()` for protocol-level connection liveness, mirroring the TypeScript client's `AhpClient.ping()`.
- `McpAuthRequirement.oauthClient` metadata for pre-registered public and confidential OAuth clients.

### Changed

- Renamed the changeset review action `changeset/filesReviewedChanged` to `changeset/filesReviewChanged` (field `fileIds` → `files`) and made it client-dispatchable, so a reviewer can toggle a file's `reviewed` flag directly through the write-ahead reducer. (#328)
- Input requests now live in turn `responseParts`, with an optional `response` until `chat/inputCompleted` submits the result. (#327)

## [0.5.2] — 2026-07-09

Implements AHP 0.5.2.

### Added

- Typed `resource*` convenience methods on `ahp.Client`: send wrappers (`ResourceRead`, `ResourceWrite`, `ResourceList`, `ResourceCopy`, `ResourceDelete`, `ResourceMove`, `ResourceResolve`, `ResourceMkdir`, `ResourceRequest`, `CreateResourceWatch`) and inbound server-request handling via `SetServerRequestHandler` / `SetResourceRequestHandlers` (new `ServerRequestHandler` and `ResourceRequestHandlers` types). Inbound server-initiated requests are now answered (previously dropped) — via the installed handler, or `MethodNotFound` when none is set.
- `ToolResultTerminalCompleteContent` for terminal-style completion metadata in tool
  results.
- Optional `Enabled` field on the child customization types
  (`AgentCustomization`, `SkillCustomization`, `PromptCustomization`,
  `RuleCustomization`, `HookCustomization`).
- `DisableUserInvocation` on `SkillCustomization`, plus `DisableModelInvocation`
  and `DisableUserInvocation` on `AgentCustomization`.
- Optional `Reviewed` field on `ChangesetFile`. Omitting it (or setting it to
  `nil`) signals that the server does not support the file "review"
  functionality.
- `changeset/filesReviewedChanged` action for servers to update the `Reviewed`
  flag of one or more changeset files.
- Optional `Meta` (wire `_meta`) provider-metadata field on every customization
  type, moved from `AgentCustomization` up to the shared customization base so
  `PluginCustomization`, `ClientPluginCustomization`, `DirectoryCustomization`,
  `SkillCustomization`, `PromptCustomization`, `RuleCustomization`,
  `HookCustomization`, and `McpServerCustomization` all carry it.
- Optional `ServerInfo` on `InitializeResult` and `ClientInfo` on
  `InitializeParams`, each an `Implementation` struct (`Name`, optional
  `Version`, optional `Title`), identifying the implementation and build behind
  either side of the handshake. Informational only — MUST NOT be used for
  feature detection.
- Optional `TerminalCommandPrefix` on `InitializeResult` for hosts that support
  interpreting `!`-prefixed user messages as terminal commands.
- Optional `Version` field on `PluginCustomization` (inherited by
  `ClientPluginCustomization`), carrying the plugin's semver sourced from the
  Open Plugins manifest. Provenance / display only.
- `session/mcpServerStartRequested` and `session/mcpServerStopRequested`
  actions for clients to ask the host to start or stop MCP servers; stopping
  moves an `authRequired` server to `stopped` so it no longer waits on
  authentication.
- `InputRequestResponsePart` and the `ResponsePartKindInputRequest` discriminant.
  The reducer now records a resolved input request in the active turn's
  `ResponseParts` on `ChatInputCompletedAction` — embedding the resolved
  `ChatInputRequest` (final `Answers`) and the `Response` (`accept`, `decline`,
  or `cancel`) — so the outcome persists after the live request is removed.
  Abandoned requests still record nothing (#324).

### Changed

- The `session/customizationToggled` reducer now toggles any top-level
  customization (`plugin`, `directory`, or top-level `mcpServer`) or an
  individual child by `id`, setting that entry's `Enabled`.

## [0.5.1] — 2026-07-02

Implements AHP 0.5.1.

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
- `SubscribeParams.View.Turns`, `ChatState.TurnsNextCursor`, and the
  `chat/turnsLoaded` action so clients can subscribe to a bounded tail of chat
  history and page older turns into the reduced chat state on demand.
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

### Changed

- `fetchTurns` now accepts `Cursor` from `ChatState.TurnsNextCursor` and returns
  an empty result after the host has loaded older turns into chat state, instead
  of returning a detached `{ turns, hasMore }` page.
- Generated clients now advertise only protocol `0.5.1`, since the `fetchTurns`
  contract is not wire-compatible with `0.5.0`.

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
