# Changelog — Agent Host Protocol (Spec)

All notable changes to the **protocol specification** are documented here. The
spec is versioned independently from the per-language client libraries; see
each `clients/<lang>/CHANGELOG.md` for client release history.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the spec follows [SemVer](https://semver.org). Until `1.0.0` is reached,
breaking changes may land in `MINOR` bumps (see
[`docs/specification/versioning.md`](docs/specification/versioning.md)).

Each released entry includes a `Spec version` line that exactly matches the
`PROTOCOL_VERSION` constant in [`types/version/registry.ts`](types/version/registry.ts)
at the time of release. The `publish-spec.yml` workflow refuses to publish a
`spec/vX.Y.Z` tag whose matching `## [X.Y.Z]` heading is missing from this
file.

## [Unreleased]

The next spec release will be cut from `main` once breaking or notable additive
changes accumulate. Track in-flight protocol changes via PRs touching
[`types/`](types/) and the per-symbol `ACTION_INTRODUCED_IN` /
`NOTIFICATION_INTRODUCED_IN` maps in
[`types/version/registry.ts`](types/version/registry.ts).

### Added

- Optional `intention` field on `chat/toolCallStart` and every `ToolCallState`
  variant, providing a human-readable description of what the invocation intends
  to do.
- Optional `model` and `tools` fields on `AgentCustomization`, giving a custom
  agent's pinned model and tool allowlist a first-class home instead of `_meta`.
- Optional `capabilities` field on `AgentInfo` (`AgentCapabilities` with
  `supportsMultipleChats` / `supportsFork`) so clients gate multi-chat and fork
  via advertised flags instead of provider-id switches.

## [0.5.1] — Unreleased

Spec version: `0.5.1`

### Added

- `SessionState.inputNeeded` — a session-level aggregate of outstanding input
  requests across all chats, so a client can discover and answer elicitations,
  tool confirmations, and client-tool execution requests from the session
  channel without subscribing to individual chats. Each entry
  (`SessionChatInputRequest`, `SessionToolConfirmationRequest`,
  `SessionToolClientExecutionRequest`, unioned as `SessionInputRequest`) carries
  the owning chat URI plus the identifiers needed to respond.
- `session/inputNeededSet` and `session/inputNeededRemoved` actions for the host
  to upsert and remove `SessionState.inputNeeded` entries. The session reducer
  sets `SessionStatus.InputNeeded` while the queue is non-empty and clears it
  (falling back to `InProgress`) once it empties, preserving orthogonal flags.
- `ToolCallConfirmationState` union (`ToolCallPendingConfirmationState |
  ToolCallPendingResultConfirmationState`) for the tool call carried by
  `SessionToolConfirmationRequest`.

## [0.5.0] — 2026-06-26

Spec version: `0.5.0`

### Added

- `chat/activityChanged` action for updating a chat's current activity
  description independently of the session summary.
- `root/progress` (`ProgressParams`) generic host→client progress notification,
  correlated by a `progressToken` the client supplies on the originating
  request (today `createSession.progressToken`) rather than a domain object. Lets
  the host report long-running work — e.g. the lazy first-use download of an
  agent's native SDK — so clients can show an indicator instead of a silent
  multi-second hang. Carries monotonic `progress` and optional `total`; complete
  when `progress === total`.
- `createSession.progressToken` optional opt-in token for receiving `root/progress`
  notifications about a session's bring-up.
- `SessionModelInfo.maxOutputTokens` and `SessionModelInfo.maxPromptTokens`
  optional fields for communicating model token limits.
- `SessionSummary._meta` optional provider metadata field for lightweight
  session-list presentation hints.
- `JsonPrimitive` type alias (`string | number | boolean | null`) in `types/common/state.ts`.
- `session/activeClientRemoved` action to release a single active client from a
  session by `clientId`.

### Changed

- `ConfigPropertySchema.enum` now accepts `JsonPrimitive[]` instead of `string[]`, allowing numeric, boolean, and null enum values.
- `ModelSelection.config` values are now `JsonPrimitive` (`string | number | boolean | null`) instead of `string`, allowing numeric, boolean, and null configuration values.
- `SessionState.activeClients` (a required array, keyed by `clientId`) replaces
  the single optional `SessionState.activeClient`. A session may now have
  multiple concurrent active clients.
- `session/activeClientChanged` is renamed to `session/activeClientSet` with
  upsert-by-`clientId` semantics. It no longer accepts `null` to unset the
  active client — dispatch `session/activeClientRemoved` instead.

### Removed

- `session/activeClientToolsChanged`. An active client now updates its published
  tools by re-dispatching `session/activeClientSet` with its full, updated entry.

### Fixed

- Corrected the `ACTION_INTRODUCED_IN` entries for `annotations/set`,
  `annotations/removed`, `annotations/entrySet`, and `annotations/entryRemoved`
  from `0.3.0` to `0.4.0`. The annotations channel first shipped in the
  `0.4.0` spec release (it is absent from `spec/v0.3.0`), so version
  negotiation must not advertise it to peers speaking `0.3.0`.

## [0.4.0] — 2026-06-19

Spec version: `0.4.0`

### Added

- `MessageOrigin` — `Message.origin` is now a named type (was an inline
  `{ kind }` object), and its `MessageKind` gains `Agent` and `Tool` kinds for
  turns initiated by the agent or a tool rather than the user (e.g. a tool
  seeding the first message of a worker chat it spawned), so a host no longer
  has to misrepresent such a message as `User` or `SystemNotification`.
- `ConfigPropertySchema.additionalProperties` — optional JSON Schema field
  (`ConfigPropertySchema`) describing the schema for object-typed config
  properties beyond those listed in `properties`.
- `changeset/contentChanged` — full-replacement changeset action for sending
  batched files, optional operations, and error details on initial snapshots or
  bulk refreshes.
- `ChangesetOperationStatus.Disabled` — signals that a changeset operation is
  currently unavailable and cannot be invoked, so clients can render the
  control as disabled rather than hiding it.
- `ChangesetOperation.group` — optional identifier for grouping related
  changeset operations together in the UI.
- `_meta` slot on the per-turn chat actions (`chat/turnStarted`, `chat/delta`,
  `chat/responsePart`, `chat/reasoning`, `chat/usage`, `chat/turnComplete`,
  `chat/turnCancelled`, `chat/error`) — optional provider-specific metadata so
  agent hosts can carry portable per-event context, such as attributing an
  event to a specific agent (e.g. a sub-agent acting within the turn). The
  tool-call actions already exposed `_meta`; this extends the same convention
  to the remaining turn-scoped actions.
- Added a new annotations channel exposed on `ahp-session:/<uuid>/annotations`.
  Annotations anchor to a `(turnId, resource)` pair with an optional `range`
  (omitted to anchor to the entire file), carry a `resolved` flag (newly
  created annotations start unresolved), and always carry at least one entry.
  Clients drive every mutation by dispatching the client-dispatchable
  `annotations/set`, `annotations/removed`, `annotations/entrySet`, and
  `annotations/entryRemoved` state actions directly — assigning the
  `Annotation.id` / `AnnotationEntry.id` themselves — rather than through RPC
  commands, so annotations inherit write-ahead replay and conflict resolution.
  `SessionSummary.annotations` advertises the per-session `AnnotationsSummary`
  (`{ resource, annotationCount, entryCount }`) for badge UI.
- Added an `annotations` `MessageAttachment` variant
  (`MessageAnnotationsAttachment`) that references annotations on a
  session's annotations channel by its `resource` URI, optionally narrowed to
  an `annotationIds` array (omitted to reference every annotation).
- `annotations/updated` (`AnnotationsUpdatedAction`) — a client-dispatchable
  action that partially updates an existing annotation's own properties
  (`turnId`, `resource`, `range`, `resolved`) without resending its entries.
  Resolving or re-anchoring an annotation no longer requires replacing the
  whole annotation via `annotations/set`. Omitted fields are left unchanged;
  the annotation's `entries`, `id`, and `_meta` are never touched.
- `ahp-chat:` channel for per-chat conversation state; `SessionState.chats[]` catalog; `SessionState.defaultChat?` input-routing hint; `ChatOrigin` provenance union; `createChat` / `disposeChat` commands.
- `ChatSummary.workingDirectory?` — optional per-chat working directory. When absent, chats inherit the session's `workingDirectory`. Enables agent-swarm patterns where multiple chats in one session operate on independent worktrees.
- `ChatInteractivity` enum (`"full"` / `"read-only"` / `"hidden"`) plus the optional `ChatSummary.interactivity` / `ChatState.interactivity` field describing how the user can interact with a chat, supporting agent-team patterns where worker chats are read-only or hidden. Absent defaults to `"full"`.
- Three discrete chat-catalog actions on the session channel — `session/chatAdded` (upsert by `summary.resource`), `session/chatRemoved`, and `session/chatUpdated` (partial-update with `Partial<ChatSummary>`) — mirroring the root-channel `root/sessionAdded` / `root/sessionRemoved` / `root/sessionSummaryChanged` pattern.
- `session/defaultChatChanged` action — updates `SessionState.defaultChat` to steer new input to the designated chat; absent value clears the hint.
- `ErrorInfo._meta?: Record<string, unknown>` — optional provider-specific metadata bag on error payloads, mirroring the existing `_meta` convention on `UsageInfo` and other protocol types. Clients MAY inspect well-known keys here for richer, localised error UI.
- `RootState` now carries an optional `_meta` property bag for
  implementation-defined metadata about the agent host itself, mirroring the
  MCP `_meta` convention. A well-known `hostBuild` key may carry build
  information (version, commit, date) about the program hosting the agent host.

### Changed

- `ToolResultSubagentContent.resource` is now specified as the spawned worker
  **chat** URI (`ahp-chat:/<cid>`), not a session URI — a tool-spawned
  sub-agent is a chat. Its doc now describes the correspondence with the worker
  chat's `ChatOrigin` record (`kind: 'tool'`, matching `toolCallId`), which
  remains the canonical representation of the spawn relationship.
- `Snapshot.state` now accepts `ResourceWatchState`, so `initialize` /
  `reconnect` / `subscribe` can seed an `ahp-resource-watch:` channel from a
  point-in-time snapshot. Existing variants (root, session, terminal,
  changeset, annotations) are unchanged.
- `fetchTurns` and `completions` now target an `ahp-chat:` channel; `PROTOCOL_VERSION` bumped to `0.4.0`.
- `ChatState` is now **flat** — the previous `summary: ChatSummary` sub-object has been replaced by inlined `resource` / `title` / `status` / `activity` / `modifiedAt` / `model` / `agent` / `origin` / `workingDirectory` fields. `ChatSummary` remains as the standalone catalog entry on `SessionState.chats`.
- `ChatSummary.modifiedAt` and `ChatState.modifiedAt` are now ISO 8601 strings instead of numeric milliseconds.
- `SessionSummary` now documents how its aggregate fields (`status`, `activity`, `modifiedAt`) are derived from the session's chats, including `InputNeeded` / `Error` promotion when any chat raises the flag.

### Fixed

- Session reducers now apply `_meta` updates from every tool-call-scoped
  action, not only `session/toolCallStart`.

### Removed

- `SessionState.turns`, `SessionState.activeTurn`, `SessionState.steeringMessage`, `SessionState.queuedMessages`, `SessionState.inputRequests` (moved to `ChatState`).
- `session/chatsChanged` full-replacement action (replaced by `session/chatAdded` / `session/chatRemoved` / `session/chatUpdated`).

## [0.3.0] — 2026-06-05

Spec version: `0.3.0`

### Added

- `McpServerCustomization` now models MCP servers as first-class session
  customizations: `enabled`, `state` (a discriminated
  `McpServerState` union covering `starting`, `ready`, `authRequired`,
  `error`, `stopped`), an optional `channel` URI for an `mcp://`
  side-channel into the upstream server, and an optional `mcpApp` block
  carrying `AhpMcpUiHostCapabilities` so clients can render
  [MCP Apps](https://github.com/modelcontextprotocol/ext-apps).
- `McpServerAuthRequiredState` carries `ProtectedResourceMetadata` plus
  `reason` / `requiredScopes` / `description`, letting clients drive the
  existing `authenticate` command for per-MCP-server auth challenges.
- `Customization` now includes `McpServerCustomization` at the top level
  (hosts MAY surface globally-configured MCP servers directly rather
  than only inside a plugin or directory). MCP servers remain valid as
  children of a container.
- New `session/mcpServerStateChanged` action — narrow upsert of
  `state` + `channel` on an existing `McpServerCustomization`
  by id, intended for the high-frequency
  `starting`/`ready`/`authRequired` transitions. Other customization
  fields stay in `session/customizationUpdated` territory.
- `InitializeParams.capabilities` — optional client-capability bag
  declared during the handshake. First entry is `mcpApps?: {}`; hosts
  SHOULD only populate `McpServerCustomization.mcpApp` / `channel` for
  clients that declared it.
- New guide page `docs/guide/mcp.md` (with an MCP Apps subsection) and
  new spec page `docs/specification/mcp-channel.md`.
- Added `changeKind` to `Changeset` (well-known values: `'session'`,
  `'branch'`, `'uncommitted'`, `'turn'`, `'compare-turns'`) so clients can
  group, sort, or pick an icon without parsing `uriTemplate`.
- Added `status` and `error` to `ChangesetOperation` and a new
  `changeset/operationStatusChanged` action so servers can reflect an
  operation's execution lifecycle (`idle → running → error`) back into
  changeset state.

### Changed

- Replaced `ToolCallBase.toolClientId?: string` with a discriminated
  `ToolCallBase.contributor?: ToolCallContributor` union
  (`ToolCallClientContributor` / `ToolCallMcpContributor`) so MCP-served
  tool calls can be attributed back to their originating
  `McpServerCustomization`. `session/toolCallStart` carries the new
  `contributor?` field in place of `toolClientId?`.

- Added optional `_meta` provider metadata to `AgentCustomization`.
- Added optional `changes` field of type `ChangesSummary` to `SessionSummary`,
  carrying optional `additions`, `deletions`, and `files` counts so servers
  can advertise an at-a-glance view of a session's file-change footprint.
- Removed the `additions`, `deletions`, and `files` fields from
  `ChangesetSummary`. Aggregate counts now live on `SessionSummary.changes`;
  per-changeset views derive their own totals from `ChangesetState.files`.
- Moved the `changesets` catalogue from `SessionSummary` to
  `SessionState`. The `session/changesetsChanged` action now updates
  `state.changesets` directly instead of `state.summary.changesets`.
- Renamed the `ChangesetSummary` interface to `Changeset`. The
  on-the-wire shape is unchanged.
- Renamed the `UserMessage` type to `Message` and surfaced it consistently
  across turn state (`Turn.message`, `ActiveTurn.message`, `PendingMessage.message`)
  and the actions that carry it (`session/turnStarted`,
  `session/pendingMessageSet`). The type now carries an `origin` field and an
  optional `_meta` object.

## [0.2.0] — 2026-05-28

Spec version: `0.2.0`

This is the first version released through the unified spec release pipeline
(`spec/v*` git tags → GitHub Release with attached schema artifacts). Changes
to the protocol shape that landed under this version are tracked in the
commits between `spec/v0.1.0` (not yet tagged) and `spec/v0.2.0`. Highlights:

- Channels reorganization — every command and notification carries a top-level
  `channel: URI`; per-channel state types and action unions live under
  `types/channels-*/` (see PR #97 and PR #152).
- New `otlp/*` notifications for telemetry export
  (`exportLogs` / `exportTraces` / `exportMetrics`).
- New `session/agentChanged`, `session/customizationRemoved`,
  `session/changesetsChanged`, and the `changeset/*` action family.
- Customizations redesigned as a typed two-level tree.
- New `resourceResolve` (stat + realpath; throws `NotFound` for the
  existence check) and `resourceMkdir` (`mkdir -p` semantics) requests.
- New `createResourceWatch` request plus the `ahp-resource-watch:/<id>`
  channel with the `resourceWatch/changed` action — long-lived file-change
  streams over the standard subscription mechanism.
- `resourceWrite` extended with `mode` (`truncate` | `append` | `insert`),
  `position`, and `ifMatch` for optimistic concurrency. New
  `Conflict` (`-32011`) error code for stale `ifMatch` writes.
- The entire content-bearing `resource*` family is now formally
  bidirectional — the methods appear in `ServerCommandMap` and may be
  initiated by either peer (matches VS Code's existing implementation).
- `UserMessage._meta` optional `Record<string, unknown>` field for
  provider-specific message metadata, mirroring the MCP `_meta` convention
  already used on `MessageAttachmentBase`, `ToolDefinition`, `ToolCallBase`,
  `UsageInfo`, and `SessionState`.

## [0.1.0] — Pre-tagging

Spec version: `0.1.0`

Initial public protocol surface. Not retroactively tagged; this entry exists
for completeness so that the `0.2.0` diff is unambiguous.
