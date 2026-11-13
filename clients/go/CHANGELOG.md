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

## [1.1.0] — 2026-11-12

Implements AHP 1.1.0.

### Added

- Optional typed `InitializeResult.environment.pathStyle` metadata for authoritative host path semantics.
- Optional `CreateChatParams.title` for a client-selected initial display title.
- Optional `SessionModelInfo.vendor` for the model vendor as the provider reports it. (#503)
- Experimental subscription-negotiated flow-control types using UTF-16 byte accounting, framed delivery and consumption credit notifications, and independent `reconnect.windows` metadata. (#492)
- `EmptyState` variant of `Snapshot.state` for channels whose state has no fields, such as telemetry. Every experimental windowed subscription starts with `channel/snapshot`.
- Experimental TCP channel: `createTcpConnection` opens a TCP connection on the host's network and returns an empty `CreateTcpConnectionResult`. The client forwards it over a windowed subscription with `tcp/data`, `tcp/eof`, and `tcp/reset`. TCP channels do not survive the loss of the AHP connection. (#488)
- Each client exposes the notification methods that do not count against the window on a windowed subscription (`WINDOW_EXEMPT_METHODS` and `countsAgainstWindow` in TypeScript, with equivalents in the other clients), generated from the new `@windowExempt` annotation.
- `ChatState.config`, the `chat/configChanged` action, and `chatMutable` on session config properties give each chat its own config for selected settings, such as tool auto-approval, so changing them in one chat no longer changes every chat in the session. `ChatConfigState.values` holds the chat's `chatMutable` properties and does not inherit from the session; missing keys take the schema default. Optional `ChatConfigState.schema` replaces the session's schema for a chat whose agent differs from the session's.
- Optional per-chat agent provider: `CreateChatParams.provider` and `ChatSummary.provider` (mirrored on `ChatState` and `SessionChatSummary`), gated by the host-level `InitializeResult.multipleChatProviders` capability, let one session contain chats backed by different agent providers. Absent `provider` means the session's agent provider; forks and side chats keep their source chat's agent provider.
- Optional `ChangesetFile.status`, a bitset of `ChangesetFileStatus` flags (initially `Editing`), reports per-file activity through existing changeset snapshots and actions without requiring provider-specific metadata. (#538)
- Optional changeset file and operation-target nonces let hosts reject operations on superseded changes without requiring a capability or a nonce from every client. (#538)
- Adds `chat/moved`, dispatched on a chat's channel after a cross-session move with its new session, `provider` and `config.schema`.
- Optional producer-recorded `startedAt` and `duration` fields on reasoning response parts and `chat/reasoning` updates preserve each contiguous reasoning run's timing across state snapshots and history restoration.
- Optional `ToolCallResult.resultMetadata` carries MCP `CallToolResult._meta` separately from host/provider tool-call metadata and is preserved through result confirmation.
- Optional `ResourceReadParams.position` and `ResourceReadParams.length` request a byte range from `resourceRead`, and optional `ResourceReadResult.size` reports the total size of the resource when the receiver honored the range. A result without `size` is the whole resource, and a ranged `utf-8` result does not split a UTF-8 sequence. (#554)
- `resourceRead` guidance: a peer SHOULD serve reads of the URIs it publishes as content, including HTTP(S) URLs that the other peer might not be able to reach.
- Optional `McpServerCustomization.children` for MCP-served skills (SEP-2640), toggleable by id with `session/customizationToggled`.
- Optional `authenticate.accountId` carries an opaque client-local account-selection hint without changing token validation or legacy authentication.

### Changed

- Experimental windowed subscriptions count every data notification against the window, whether sent whole or in `channel/frame` notifications. Frames carry messages larger than `maxFrameBytes` and let subscriptions share the connection.
- `Snapshot.state` can be an `EmptyState` (`{}`) for channels whose state has no fields, such as telemetry. With ordinary delivery, a server may send such a snapshot or omit it, so clients must accept both. Clients must not fail on a snapshot state that they do not recognize.
- Experimental windowed delivery removes `maximumMessageBytes` and uses one size for everything: the UTF-16 size of each JSON-RPC data message as sent, including `channel/frame` envelopes. Each message and frame counts against `windowBytes`, which is a soft target; `maxFrameBytes` remains a hard limit on each message, and receivers can return credit for stored frames.
- Store steering and queued input in one `queuedMessages` list with optional `PendingMessage.kind` (absent means queued), using the existing per-ID pending actions. New IDs append, kind changes replace in place, and UIs group steering first without changing raw order. Mirror the latest steering update in the deprecated `steeringMessage` slot for older clients.
- Experimental windowed subscriptions no longer carry byte counters across `reconnect`. Their counters start at zero on the new connection, and each `reconnect.windows` item offers new limits in `flowControl`, which the result accepts as in `subscribe`. Removes `ChannelReceiveProgress` and the `clientReceive`/`hostReceive` counters from reconnect.
- Remove the User-only restriction on client-submitted messages in `chat/turnStarted` and `chat/pendingMessageSet`. (#542)
- Experimental `CanvasState.url` is renamed to `CanvasState.uri` and holds an absolute content URI, typically HTTP(S). A client that can't load it directly reads it, and the relative references in its content, with `resourceRead`.
- Preserve unknown members on automation patch objects and nested shared types (`extra` in Rust/Swift/Kotlin, `Extra` in Go/.NET). Rust struct literals must initialize `extra` and exhaustive patterns need `..`; Go map-bearing structs lose `==` comparability; .NET record equality compares `Extra` by reference; Swift/Kotlin consumers must recompile. (#592)
- Annotations channels use `ahp-annotations:/<uuid>` with the owning session's id; clients should use `AnnotationsSummary.resource` rather than derive the URI.

### Fixed

- `ReconnectResult` serialization preserves its `type` discriminator, including windowed subscription recovery results, and generated union serializers safely preserve nil variants.
- Decoding a snapshot whose state has an unrecognized form no longer fails. The state is kept as an `Unknown` variant with its raw JSON, and state mirrors ignore it. Go no longer decodes such a state as an empty `RootState`.

### Security

- Add an optional `authenticate.target` identifying an MCP server by session URI and customization ID, preventing tokens from reaching other consumers that share a protected resource and scopes.

## [1.0.0] — 2026-10-02

Implements AHP 1.0.0.

### Added

- `AuthenticateParams.expiresIn` carries an OAuth access token's remaining lifetime in seconds.
- `SessionSummary.chats`, `SessionChatSummary.interactivity`, and `SessionSummary.defaultChat` expose lightweight chat navigation data without requiring a session subscription.
- `chat/isArchivedChanged` action for archiving a chat independently of its session.
- `ChatState.changesets` and `chat/changesetsChanged` expose each chat's changeset catalogue through the subscribed chat channel.
- `AutomationDefinition.disableConditions` supports `afterRuns` (`max`) and `afterDate` (`date`) rules combined with logical OR, with at most one condition per kind. Host-owned `AutomationEntry.runCount` tracks the current scheduled-run allowance. Edit conditions through `automation/updateRequested`: omission leaves them unchanged, an array replaces them, and `[]` removes all conditions without re-enabling the automation.
- `ChangesetStatus.Recomputing` distinguishes refreshes of a completed result from initial changeset computation.
- `ConfigPropertySchema.minItems` and `ConfigPropertySchema.maxItems` express array cardinality for `type: "array"` config properties. (#432)
- `McpServerStartingState.blocking` flag indicating that message processing may be held on the server, and the client-dispatchable `session/mcpServerBackgroundRequested` action asking the host to background such a startup.
- `AutomationSessionTemplate.customizations` lets automations carry client plugins (skills, agents, prompts, rules) that the host captures when the definition is saved, with the host-owned copies reported in `AutomationEntry.customizations` and support advertised by `AutomationCapabilities.customizations`.
- Hosts can advertise chat-owned canvas channel references and synchronize live presentation metadata and source URLs on experimental per-canvas channels.
- Atomic stable-URI `moveChat` transfer and same-session ordering for host-authorized chats, with per-chat `movable` discovery and durable authoritative catalogs.
- Expose chat-owned background work (background shells and subagents) in chat state, with `chat/backgroundWorkSet` and `chat/backgroundWorkRemoved` actions independent of turn lifetime.
- `ChatSummary.changes` and `ChatState.changes` provide aggregate file-change counts without requiring a changeset subscription.
- `SessionChatSummary.status` exposes per-chat archived state via `SessionStatus.IsArchived` in the lightweight chat catalog without requiring a session subscription.
- `chat/isReadChanged` action and optional `SessionChatSummary.status` projection for independently tracking the status of any known chat, including the default chat; the status bitset replaces the unreleased `isRead` and `archived` catalog fields.
- `SessionChatSummary.changes` exposes per-chat change counts in the lightweight chat catalog without requiring a session subscription.

### Changed

- Historical `ToolResultTerminalContent.resource` subscriptions return lazily reconstructed exited terminal state with retained output.
- `FileEdit` and preview `edits` now use named models in generated SDKs. This breaks affected SDK APIs but keeps JSON shapes unchanged.
- Advertise only the 1.0.0 and 0.9.0 protocol compatibility baselines independently of the development version. Host-side negotiation helpers select the highest client-offered version within either caret-compatible range and report malformed offers explicitly.

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
