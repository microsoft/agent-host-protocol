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

- The package entry point now re-exports every public protocol declaration. 60 were unreachable from it — including the whole customization subsystem (`Customization`, `CustomizationType` and every variant), the whole MCP-server state machine (`McpServerState`, `McpServerStatus`, `McpAuthRequiredReason` and the state variants), 13 action types, and `Icon`, `ChatInteractivity`, `InputRequestResponsePart`, `ToolCallContributor` and `SessionMetadata`.
- `session/workingDirectoryReplaced` retains an earlier duplicate replacement so a later replacement cannot move a protected primary, and `primaryReplacement` may accompany `immutablePrimary` for safe legacy-client compatibility.

## [0.7.0] — 2026-07-31

Implements AHP 0.7.0.

### Added

- Capability-gated side chats can start from a chat turn and return bounded chat transcripts as message attachments.
- Multiroot session support: `AgentCapabilities.multipleWorkingDirectories` capability (with `immutablePrimary`, which pins `workingDirectories[0]` as a fixed primary root that clients MUST NOT remove or reorder), `CreateSessionParams.workingDirectories` and `SessionMetadata.workingDirectories` (equal-peer set, mirrored onto `SessionState`/`SessionSummary`), `CreateChatParams.workingDirectories` and `ChatState`/`ChatSummary.workingDirectories` (a subset of the session's set), and the client-dispatchable `session/workingDirectorySet` / `session/workingDirectoryRemoved` and `chat/workingDirectorySet` / `chat/workingDirectoryRemoved` actions for mutating those sets. (#337)
- `AhpClient.completions()` and `AhpClient.sessionConfigCompletions()` typed wrappers for the `completions` / `sessionConfigCompletions` commands, matching the existing `resource*` convenience methods. (#340)
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

### Changed

- Renamed the changeset review action `changeset/filesReviewedChanged` to `changeset/filesReviewChanged` (field `fileIds` → `files`) and made it client-dispatchable, so a reviewer can toggle a file's `reviewed` flag directly through the write-ahead reducer. (#328)
- Input requests now live in turn `responseParts`, with an optional `response` until `chat/inputCompleted` submits the result. (#327)

## [0.5.2] — 2026-07-09

Implements AHP 0.5.2.

### Added

- Typed `resource*` convenience methods on `AhpClient`: send wrappers (`resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`, `resourceDelete`, `resourceMove`, `resourceResolve`, `resourceMkdir`, `resourceRequest`, `createResourceWatch`) and typed inbound handling via `setResourceRequestHandlers` (new `ResourceRequestHandlers` type and `createResourceRequestHandler` helper).
- `ToolResultTerminalCompleteContent` for terminal-style completion metadata in tool
  results.
- Optional `enabled` field on the child customization types
  (`AgentCustomization`, `SkillCustomization`, `PromptCustomization`,
  `RuleCustomization`, `HookCustomization`).
- `disableUserInvocation` on `SkillCustomization`, plus `disableModelInvocation`
  and `disableUserInvocation` on `AgentCustomization`.
- Optional `reviewed` field on `ChangesetFile`. Omitting it (or setting it to
  `undefined`) signals that the server does not support the file "review"
  functionality.
- `changeset/filesReviewedChanged` action for servers to update the `reviewed`
  flag of one or more changeset files.
- Optional `_meta` provider-metadata field on every customization type, moved
  from `AgentCustomization` up to the shared customization base so
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
- `InputRequestResponsePart` (`kind: 'inputRequest'`) response-part variant. The
  reducer now records a resolved input request in the active turn's
  `responseParts` on `chat/inputCompleted` — embedding the resolved
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
- `SubscribeParams.delivery.maxLatencyMs` and `AhpClient.subscribe` delivery
  options for clients to request a maximum subscription delivery latency,
  including `0` for no intentional coalescing.
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

### Changed

- `fetchTurns` now accepts `cursor` from `ChatState.turnsNextCursor` and returns
  an empty result after the host has loaded older turns into chat state, instead
  of returning a detached `{ turns, hasMore }` page.
- Generated clients now advertise only protocol `0.5.1`, since the `fetchTurns`
  contract is not wire-compatible with `0.5.0`.
- `SessionState.inputNeeded` — a session-level aggregate of outstanding input
  requests across all chats (`SessionInputRequest` union with
  `SessionChatInputRequest`, `SessionToolConfirmationRequest`, and
  `SessionToolClientExecutionRequest`), plus the `SessionInputNeededSetAction`
  (`session/inputNeededSet`) and `SessionInputNeededRemovedAction`
  (`session/inputNeededRemoved`) actions and the `ToolCallConfirmationState`
  union. The session reducer maintains the `SessionStatus.InputNeeded` activity
  bit from the queue, clearing it (falling back to `InProgress`) when the last
  entry is removed.
- Optional `intention` field on `ChatToolCallStartAction` and every tool-call
  lifecycle state.
- Optional `model` and `tools` fields on `AgentCustomization` for a custom
  agent's pinned model and tool allowlist.

### Removed

- `filter` field from `ListSessionsParams`. It was an untyped placeholder with
  no defined semantics; it will return with a concrete shape once session
  filtering/sorting is specified.

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
