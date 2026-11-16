# Changelog

All notable changes to the .NET client
(`Microsoft.VisualStudioCode.AgentHostProtocol*` NuGet packages) are documented
here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This client tracks the Agent Host Protocol spec on its own version line; see
[`release-metadata.json`](release-metadata.json) for the protocol versions
this release negotiates.

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

- Decoding a snapshot whose state has an unrecognized form no longer fails. The state is kept as an `Unknown` variant with its raw JSON, and state mirrors ignore it. Go no longer decodes such a state as an empty `RootState`.
- State mirrors leave confirmed state unchanged when an action envelope carries a rejection reason. (#586)

### Security

- Add an optional `authenticate.target` identifying an MCP server by session URI and customization ID, preventing tokens from reaching other consumers that share a protected resource and scopes.

## [1.0.0] — 2026-10-02

Implements AHP 1.0.0.

### Added

- A hermetic real-WebSocket conformance lane now verifies .NET session negotiation, initialize snapshot seeding, and streamed reducer convergence against a repository-local TypeScript host.
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
- The .NET assemblies are now strong-name signed with the Microsoft Shared Libraries key.
- Advertise only the 1.0.0 and 0.9.0 protocol compatibility baselines independently of the development version. Host-side negotiation helpers select the highest client-offered version within either caret-compatible range and report malformed offers explicitly.

### Fixed

- Generated action and union-variant records now pin their own literal discriminator as the property initializer, so constructing one without setting the discriminator serializes the correct wire value. Previously the property fell back to the type's zero value — the *first* enum member, which silently emitted the wrong discriminator on every record but the first. (#366)
- Open (`@nonexhaustive`) protocol enums no longer fail decoding when a newer peer sends a wire value this build does not recognize. They are now generated as readonly structs wrapping the raw wire string (with the known values as static members) instead of closed C# enums, so an added enum value round-trips verbatim as `versioning.md` requires. Each open enum gets a generated converter, so the path no longer relies on reflection. (#366)
- Discriminated unions now derive whether an unrecognized discriminator is preserved from the discriminator enum's `@exhaustive` / `@nonexhaustive` annotation, matching the other generators. `SessionOrigin` and `CustomizationEnablement` previously rejected a discriminator added by a newer peer even though their discriminants are open; `ChangesetOperationTarget` is likewise derived now. (#366)
- Preserve unknown future chat move destinations when decoding and re-encoding with the .NET client.

## [0.9.0] — 2026-08-28

Implements AHP 0.9.0.

### Added

- Automation catalogue and automation-run channels, including self-contained host-defined event triggers and automation-origin messages, for shared trigger-based agent session workflows.
- Turn errors are durable response parts, and resumable errors can reopen the same turn through `chat/turnResume`.
- First-party .NET client with generated AHP 0.9.0 wire types, reducers, JSON-RPC and multi-host clients, and an integrated WebSocket transport targeting `netstandard2.0` and `net8.0`. (#206, #214)
- `ClientConfig.TimeProvider` enables deterministic request timeout, keep-alive, reconnect scheduling, and host timestamps.
- `InitializeResult._meta` for hosts to advertise implementation-specific extension capabilities in initialize responses.

### Changed

- Annotations now carry an `origin` with a required session URI and optional chat URI and turn ID.
- Renamed the failed session lifecycle value from `creationFailed` to `failed`.
- `TerminalSessionClaim` now requires the chat URI that owns the terminal.
- Terminal state now uses an explicit `running`/`exited` lifecycle that preserves exits without an exit code.
- The .NET client now supports trimming and Native AOT through generated JSON metadata, snapshots caller-owned configuration, freezes serializer options, validates protocol negotiation, restores live reconnect state correctly, enforces valid `StringOrMarkdown` values, and consistently uses value-semantic `HostId` APIs.
- Generated clients now preserve unknown values for nonexhaustive protocol enums and their discriminated unions.
- `SessionToolClientExecutionRequest.toolCall` is narrowed to a running tool-call state.
- The .NET client now ships as the signed `Microsoft.VisualStudioCode.AgentHostProtocol` and `Microsoft.VisualStudioCode.AgentHostProtocol.Abstractions` NuGet packages.
- Automation catalogue snapshots now use `AutomationState.entries`, whose items are named `AutomationEntry`.

### Removed

- Removed `error` from `changeset/contentChanged`; changeset failures are represented by `changeset/statusChanged`.
- Removed session-level forking from `createSession`; use chat forking instead.
- `ContentNotFound` is no longer an exported AHP error code; `-32006` remains reserved and unassigned.

### Fixed

- Chat reducers now derive `modifiedAt` from turn action data instead of local wall clocks.
- The .NET client now preserves protocol wire settings with custom JSON metadata, serializes inbound request handler results without reflection, and validates packed packages through broader Native AOT flows.
- The .NET multi-host runtime now publishes reconnect snapshots, installs replacement clients before replay, commits replay cursors per applied action, and cannot be wedged by a non-cooperative transport factory.

### Security

- The .NET `FileClientIdStore` now establishes owner-only Unix permissions before writing client-ID bytes and fails closed when it cannot do so.

## [0.3.0]

Implements AHP 0.3.0.

### Added

- `McpServerCustomization` now exposes the full MCP lifecycle: `Enabled`,
  the discriminated `McpServerState` union
  (`Starting`/`Ready`/`AuthRequired`/`Error`/`Stopped`), optional
  `Channel` URI for the `mcp://` side-channel, and an optional `McpApp`
  block carrying `AhpMcpUiHostCapabilities` for MCP Apps.
- `McpServerAuthRequiredState` variant carries `ProtectedResourceMetadata`
  plus `Reason` / `RequiredScopes` / `Description` so the existing
  `authenticate` command can drive per-server auth.
- The top-level `Customization` union now includes `McpServerCustomization`
  — hosts MAY surface bare MCP servers directly rather than only inside a
  plugin or directory.
- `SessionMcpServerStateChangedAction` and the matching
  `Reducers.ApplyToSession` case — a narrow upsert of `State` + `Channel`
  on an existing MCP server customization (located by id at the top level
  or among a container's children; a no-op for an unknown id or a non-MCP
  customization type).
- `ClientCapabilities` on `InitializeParams.Capabilities`, with the
  `McpApps` capability.
- `ChangeKind` field on `Changeset` (well-known values: `session`,
  `branch`, `uncommitted`, `turn`, `compare-turns`; unrecognized values
  are preserved on the wire and fall back to a client default).
- `Status` and `Error` on `ChangesetOperation`, and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.
- `_meta` provider-metadata field on `AgentCustomization`.
- Optional `Changes` field on `SessionSummary` (`ChangesSummary` with
  optional `Additions`, `Deletions`, and `Files` counts) summarising a
  session's file-change footprint.

### Changed

- `ToolCallBase.ToolClientId` (a `string?`) is replaced by
  `ToolCallBase.Contributor`, a `ToolCallContributor` discriminated union
  with `ToolCallClientContributor { ClientId }` and
  `ToolCallMcpContributor { CustomizationId }` variants.
  `SessionToolCallStartAction` carries the new `Contributor` field, and the
  reducer threads it through each tool-call transition.
- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape
  is unchanged.
- The `changesets` catalogue moved from `SessionSummary` to `SessionState`;
  the `session/changesetsChanged` action now updates `state.Changesets`
  directly instead of `state.Summary.Changesets`.
- `Reducers.ApplyToChangeset` is now fully implemented (previously a no-op
  stub), so `changeset/*` actions fold into `ChangesetState`. Brings the
  .NET client to full cross-language conformance parity on the changeset
  channel.

### Removed

- Removed the `Additions`, `Deletions`, and `Files` fields from the former
  `ChangesetSummary`. Aggregate counts now live on `SessionSummary.Changes`;
  per-changeset views derive their own totals from `ChangesetState.Files`.

## [0.1.0]

Initial release of the .NET client.

### Added

- **`Microsoft.AgentHostProtocol.Abstractions`** — the wire types generated
  from the canonical TypeScript protocol definitions (state, actions,
  commands, notifications, JSON-RPC messages, errors, and version
  constants), the `StringOrMarkdown` helper, the `AhpUnion` discriminated-
  union support and `WireEnumConverter`, and the `ITransport` /
  `IAhpSerializer` interface seams.
- **`Microsoft.AgentHostProtocol`** — the async JSON-RPC `AhpClient`, the
  pure state reducers (`Reducers.ApplyToRoot` / `ApplyToSession` /
  `ApplyToTerminal` / `ApplyToChangeset`), the default
  `SystemTextJsonAhpSerializer`, the per-URI subscription fan-out, and the
  `MultiHostClient` runtime under `Microsoft.AgentHostProtocol.Hosts`.
- **`WebSocketTransport`** — a `ClientWebSocket`-based `ITransport`
  implementation included in `Microsoft.AgentHostProtocol`.
