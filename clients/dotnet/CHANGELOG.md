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

- Add optional `InitializeResult.environment.pathStyle` (`posix` or `windows`) so clients can parse and format host paths using the host's native path grammar instead of guessing locally.
- Add optional `CreateChatParams.title` so clients can choose an initial display title when creating a chat.
- Add optional `SessionModelInfo.vendor` so clients can display the model vendor reported by the provider separately from the owning agent provider. ([#503](https://github.com/microsoft/agent-host-protocol/issues/503))
- Add experimental windowed delivery for subscriptions so fast producers do not overwhelm slow clients: peers negotiate soft `windowBytes` and hard `maxFrameBytes` limits using UTF-16 JSON-RPC message sizes, split large messages with `channel/frame`, return cumulative credit with `channel/credit`, renegotiate fresh zero-based windows in `reconnect.windows`, and expose generated `@windowExempt` helpers (`WindowedDelivery.ExemptMethods` and `WindowedDelivery.CountsAgainstWindow` in .NET) for control notifications that do not count against the window. ([#492](https://github.com/microsoft/agent-host-protocol/issues/492))
  ```ts
  // Offer windowed delivery on subscribe
  await client.request('subscribe', {
    channel: 'ahp-terminal:/t1',
    flowControl: { receive: { windowBytes: 262144, maxFrameBytes: 16384 } },
  });
  // Return cumulative UTF-16 byte credit after processing incoming data
  client.notify('channel/credit', { channel: 'ahp-terminal:/t1', consumedBytes });
  ```
  Read more in [Windowed Delivery](https://microsoft.github.io/agent-host-protocol/specification/windowed-delivery).
- Add `EmptyState` (`{}`) to `Snapshot.state` for channels with no state fields, such as telemetry and TCP channels. Windowed subscriptions always start with `channel/snapshot`, whereas ordinary subscriptions may send or omit an `EmptyState` snapshot; clients must accept both and ignore unrecognized snapshot shapes.
  Read more in [Channels and Subscriptions](https://microsoft.github.io/agent-host-protocol/specification/subscriptions).
- Add an experimental TCP channel (`createTcpConnection`, `tcp/data`, `tcp/eof`, and `tcp/reset`, gated by `InitializeResult.tcpConnections`) so clients can forward TCP connections opened on the host's network over a windowed subscription; connections close if the AHP transport drops. ([#488](https://github.com/microsoft/agent-host-protocol/issues/488))
  ```ts
  const channel = 'ahp-tcp:/t1';
  await client.request('createTcpConnection', { channel, host: 'localhost', port: 3000 });
  await client.request('subscribe', {
    channel,
    flowControl: { receive: { windowBytes: 262144, maxFrameBytes: 16384 } },
  });
  client.notify('tcp/data', { channel, data: base64Bytes });
  ```
  Read more in [TCP Channel](https://microsoft.github.io/agent-host-protocol/specification/tcp-channel).
- Add per-chat configuration (`ChatState.config`, `chat/configChanged`, and `SessionConfigPropertySchema.chatMutable`) so settings like tool auto-approval can be changed for one chat without affecting sibling chats; `ChatConfigState.values` does not inherit from the session (missing keys use the schema default), and optional `ChatConfigState.schema` overrides the session schema when a chat uses a different agent provider.
  ```ts
  client.notify('dispatchAction', {
    channel: chatUri,
    clientSeq: 1,
    action: { type: 'chat/configChanged', config: { autoApprove: true } },
  });
  ```
  Read more in [Chat Channel — Per-chat configuration](https://microsoft.github.io/agent-host-protocol/specification/chat-channel#per-chat-configuration).
- Add per-chat agent providers (`CreateChatParams.provider` and `provider` on `ChatSummary`, `ChatState`, and `SessionChatSummary`, gated by `InitializeResult.multipleChatProviders`) so a single session can mix chats backed by different agent providers; omitting `provider` uses the session's provider, and forks and side chats keep their source chat's provider.
  ```ts
  await client.request('createChat', {
    channel: sessionUri,
    chat: 'ahp-chat:/<uuid>',
    provider: 'claude',
  });
  ```
  Read more in [Chat Channel — Chat providers](https://microsoft.github.io/agent-host-protocol/specification/chat-channel#chat-providers).
- Add optional `ChangesetFile.status` (a bitset of `ChangesetFileStatus` flags, starting with `Editing`) so hosts can report ongoing per-file edits in changeset snapshots and actions without provider-specific metadata. ([#538](https://github.com/microsoft/agent-host-protocol/issues/538))
  Read more in [Changesets — Per-file Editing Activity](https://microsoft.github.io/agent-host-protocol/guide/changesets#per-file-editing-activity).
- Add optional optimistic-concurrency nonces (`ChangesetFile.nonce` and `ChangesetOperationTarget.nonce`) so hosts can reject `invokeChangesetOperation` calls targeting superseded file edits with `Conflict` without requiring a capability or breaking clients that omit nonces. ([#538](https://github.com/microsoft/agent-host-protocol/issues/538))
- Add the `chat/moved` action, dispatched on a chat's channel after a cross-session `moveChat` to notify subscribers of its new `session` URI and updated relative `provider` and `config.schema`.
  Read more in [Chat Channel — Moving chats](https://microsoft.github.io/agent-host-protocol/specification/chat-channel#moving-chats).
- Add optional producer-recorded `startedAt` and `duration` fields to `ReasoningResponsePart` and `chat/reasoning` actions so each contiguous reasoning run's timing is preserved across snapshots, reconnects, and history restoration.
  Read more in [Chat Channel — Reasoning timing](https://microsoft.github.io/agent-host-protocol/specification/chat-channel#reasoning-timing).
- Add optional `ToolCallResult.resultMetadata` to carry MCP `CallToolResult._meta` separately from host/provider tool-call metadata and preserve it through result confirmation.
- Add optional byte-range parameters (`position` and `length`) to `resourceRead` and a total-size indicator (`ResourceReadResult.size`) so callers can read slices of large resources without splitting UTF-8 sequences; a response without `size` contains the whole resource. ([#554](https://github.com/microsoft/agent-host-protocol/issues/554))
  ```ts
  const slice = await client.request('resourceRead', {
    channel: 'ahp-root://',
    uri: 'file:///workspace/logo.png',
    position: 0,
    length: 16,
  });
  // slice.size is present iff the receiver honored the byte range
  ```
- Document that peers should serve `resourceRead` requests for URIs they publish as content, including HTTP(S) URLs that the other peer cannot reach directly (such as a loopback dev server).
- Add optional `McpServerCustomization.children` to surface MCP-served skills (SEP-2640) inside MCP server customizations, toggleable by ID via `session/customizationToggled`.
  Read more in [Customizations](https://microsoft.github.io/agent-host-protocol/guide/customizations).
- Add optional `AuthenticateParams.accountId` to carry an opaque client-local account hint alongside tokens so hosts can detect account switches without changing token validation.
  Read more in [Authentication — Account selection hints](https://microsoft.github.io/agent-host-protocol/specification/authentication#account-selection-hints).

### Changed

- Unify steering and queued input in `ChatState.queuedMessages` with an optional `PendingMessage.kind` (`steering` or `queued`, defaulting to `queued`) using existing per-ID pending actions; new IDs append, kind changes replace in place, UIs group steering first without mutating raw order, and the latest steering entry is mirrored to the deprecated `steeringMessage` slot for older clients.
  ```ts
  client.notify('dispatchAction', {
    channel: chatUri,
    clientSeq: 1,
    action: { type: 'chat/pendingMessageSet', kind: 'steering', id: 'p1', message },
  });
  ```
- Allow non-`user` message origins (such as `automation` or `systemNotification`) in client-submitted `chat/turnStarted` and `chat/pendingMessageSet` actions. ([#542](https://github.com/microsoft/agent-host-protocol/issues/542))
- Rename experimental `CanvasState.url` to `CanvasState.uri` to hold an absolute content URI (typically HTTP(S)); clients that cannot load the URI directly can fetch it and its relative references via `resourceRead`.
- Preserve unknown JSON members on automation patch objects and nested shared types via an `Extra` property so newer fields survive round-trips; .NET record equality compares `Extra` by reference. ([#592](https://github.com/microsoft/agent-host-protocol/issues/592))
- Standardize annotations channel URIs on `ahp-annotations:/<uuid>` using the owning session's ID; clients should read `AnnotationsSummary.resource` rather than constructing the URI manually.

### Fixed

- Fix snapshot decoding so unrecognized channel states no longer fail; unknown states are preserved as an `Unknown` variant with their raw JSON and ignored by state mirrors.
- Fix state mirrors to leave confirmed state unchanged when an incoming action envelope carries a `rejectionReason`. ([#586](https://github.com/microsoft/agent-host-protocol/issues/586))

### Security

- Add optional `AuthenticateParams.target` to bind a pushed OAuth token to a specific MCP server by session URI and customization ID, preventing credentials from leaking to other consumers that share a protected resource and scopes.
  ```ts
  await client.request('authenticate', {
    channel: 'ahp-root://',
    resource: 'https://mcp.example.com',
    token: accessToken,
    target: {
      kind: 'mcpServer',
      session: sessionUri,
      customizationId: 'mcp-server-1',
    },
  });
  ```
  Read more in [Authentication — Token Delivery](https://microsoft.github.io/agent-host-protocol/specification/authentication#token-delivery).

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
- `ConfigPropertySchema.minItems` and `ConfigPropertySchema.maxItems` express array cardinality for `type: "array"` config properties. ([#432](https://github.com/microsoft/agent-host-protocol/issues/432))
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

- Generated action and union-variant records now pin their own literal discriminator as the property initializer, so constructing one without setting the discriminator serializes the correct wire value. Previously the property fell back to the type's zero value — the *first* enum member, which silently emitted the wrong discriminator on every record but the first. ([#366](https://github.com/microsoft/agent-host-protocol/issues/366))
- Open (`@nonexhaustive`) protocol enums no longer fail decoding when a newer peer sends a wire value this build does not recognize. They are now generated as readonly structs wrapping the raw wire string (with the known values as static members) instead of closed C# enums, so an added enum value round-trips verbatim as `versioning.md` requires. Each open enum gets a generated converter, so the path no longer relies on reflection. ([#366](https://github.com/microsoft/agent-host-protocol/issues/366))
- Discriminated unions now derive whether an unrecognized discriminator is preserved from the discriminator enum's `@exhaustive` / `@nonexhaustive` annotation, matching the other generators. `SessionOrigin` and `CustomizationEnablement` previously rejected a discriminator added by a newer peer even though their discriminants are open; `ChangesetOperationTarget` is likewise derived now. ([#366](https://github.com/microsoft/agent-host-protocol/issues/366))
- Preserve unknown future chat move destinations when decoding and re-encoding with the .NET client.

## [0.9.0] — 2026-08-28

Implements AHP 0.9.0.

### Added

- Automation catalogue and automation-run channels, including self-contained host-defined event triggers and automation-origin messages, for shared trigger-based agent session workflows.
- Turn errors are durable response parts, and resumable errors can reopen the same turn through `chat/turnResume`.
- First-party .NET client with generated AHP 0.9.0 wire types, reducers, JSON-RPC and multi-host clients, and an integrated WebSocket transport targeting `netstandard2.0` and `net8.0`. ([#206](https://github.com/microsoft/agent-host-protocol/issues/206), [#214](https://github.com/microsoft/agent-host-protocol/issues/214))
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
