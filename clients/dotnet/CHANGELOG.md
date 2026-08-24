# Changelog

All notable changes to the .NET client (`Microsoft.AgentHostProtocol*`
NuGet packages) are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This client tracks the Agent Host Protocol spec on its own version line; see
[`release-metadata.json`](release-metadata.json) for the protocol versions
this release negotiates.

## [Unreleased]

### Fixed

- Generated action, state and command records now initialize their literal
  discriminant (`Type`/`Kind`/`Status`/`State`) to its own constant. Previously
  the property was emitted with no initializer, so it fell back to
  `default(ActionType)` — and because these are ordinary enums whose zero value
  is a real member, an action constructed without explicitly setting `Type`
  serialized with a valid but wrong discriminant (the first enum member,
  `root/agentsChanged`). 94 records across `Actions`, `State` and `Commands`
  were affected. The generator already computed the correct value and discarded
  it.

### Added

- **Multiroot working directories** (upstream
  microsoft/agent-host-protocol#337): the session-level `WorkingDirectories` set
  (`SessionState`, `SessionSummary`) and each chat's subset of it (`ChatState`,
  `ChatSummary`), plus the `MultipleWorkingDirectoriesCapability`
  (`ImmutablePrimary`, which pins `WorkingDirectories[0]` as a fixed primary
  root) that gates the whole feature. Four new reducer paths implement
  membership semantics keyed by the
  directory URI: `session/workingDirectorySet` /
  `session/workingDirectoryRemoved` and `chat/workingDirectorySet` /
  `chat/workingDirectoryRemoved` each append when absent (creating the set) and
  no-op when already present — and, on removal, no-op when the set is absent or
  does not contain the directory. All four are idempotent, matching the canonical
  TypeScript reducer; an emptied set stays present as an empty list, and a chat
  removal never touches the owning session's set.
- **Side chats** (upstream microsoft/agent-host-protocol#334): the
  `ChatSource` union (`ForkChatSource` / `SideChatSource`, discriminated on
  `Kind` via the new `ChatSourceKind` enum) carried by `CreateChatParams.Source`,
  the `sideChat` `ChatOrigin` variant (`ChatOriginSideChat`, with a stable
  top-level `TurnId` and an optional immutable `SideChatSelection` snapshot), and
  the `chat` message attachment (`MessageChatAttachment`, referencing a bounded
  transcript from another chat by `Resource` + `EndTurn`). Replaces the former
  `ChatForkSource`, which upstream renamed to `ForkChatSource`.
- **Pre-registered OAuth client on MCP auth requirements** (upstream
  microsoft/agent-host-protocol#346): the optional `OauthClient` field on the
  shared `McpAuthRequirement` (and thus `McpServerAuthRequiredState` and, via its
  `Auth` challenge, `ToolCallAuthRequiredState`), carrying the new `McpOAuthClient`
  type (`ClientId`, optional `ClientSecret`). When present, a client uses these
  credentials instead of dynamic client registration; an absent `ClientSecret`
  marks a public client that uses a secretless flow such as authorization code
  with PKCE. Additive and wire-compatible.
- **Protocol-level `ping`** (upstream microsoft/agent-host-protocol#344):
  `IAhpClient.PingAsync` sends the connection-level `ping` command — scoped to the
  root channel, carrying no payload in either direction — and completes when the
  server responds, verifying the connection is alive and keeping idle-timeout
  intermediaries from closing it. Distinct from the transport-level WebSocket
  keep-alive frames exposed via `IKeepAliveTransport`.
- **MCP tool call authentication** (upstream microsoft/agent-host-protocol#336):
  the new `auth-required` tool call status and its `ToolCallAuthRequiredState`,
  reached when the MCP server backing an in-flight call challenges for auth
  mid-execution (typically `insufficientScope` step-up). `chat/toolCallAuthRequired`
  moves a `running` call to `auth-required` carrying the `McpAuthRequirement`
  challenge, and `chat/toolCallAuthResolved` returns it to `running` once the
  client has pushed a token via `authenticate` — preserving the confirmation
  context and any partial content across the pause. The challenge only applies to
  MCP-contributed calls, so `ToolCallAuthRequiredState.Contributor` is narrowed to
  `ToolCallMcpContributor` and the reducer ignores the action for any other
  contributor. A client MAY cancel instead of authenticating by completing with a
  **failed** result, which always finishes terminally (`requiresResultConfirmation`
  is ignored on that path); a **successful** result from `auth-required` is invalid
  and is ignored. A blocked call reports `InputNeeded` at the session level, and
  `session/inputNeededSet` surfaces it as the new `toolAuthentication` request kind
  (`SessionToolAuthenticationRequest`). `McpAuthRequirement` is now shared with
  `McpServerAuthRequiredState`, and `AuthenticateParams` gains an optional
  `Scopes` so a server can tell whether a challenge is satisfied without decoding
  the token.
- **Model-judge risk assessment on tool calls** (upstream
  microsoft/agent-host-protocol#333): `ToolCallRiskAssessment` (a `loading` /
  `complete` union carrying the judge's `Reason` and normalized `Safety` score) on
  `ChatToolCallReadyAction` and `ToolCallPendingConfirmationState`. Because the
  judge resolves asynchronously, `chat/toolCallReady` is now also accepted for a
  tool call already in `pending-confirmation`: the follow-up updates the fields it
  carries and leaves the rest of the confirmation context intact rather than
  clearing it.
- **Input requests are live response parts** (upstream
  microsoft/agent-host-protocol#324 and #338): the new `InputRequestResponsePart`
  and the `inputRequest` `ResponsePart` variant. `chat/inputRequested` inserts the
  part *unresolved* (`Response` absent) into the active turn's `ResponseParts`;
  `chat/inputAnswerChanged` syncs answer drafts onto it; and `chat/inputCompleted`
  resolves that same part **in place**, setting `Response` (`accept`, `decline`, or
  `cancel`) and the final merged `Answers`. Because the part is never moved, the
  request's position in the response stream is the position it was asked at, and the
  whole "asked X → answered Y" interaction is durable and backfillable via
  `fetchTurns`. If a turn ends with a request still unresolved, the part remains in
  the completed turn's transcript with `Response` absent.
- **Resource convenience methods** (upstream microsoft/agent-host-protocol#321):
  ten typed wrappers over the symmetrical `resource*` command family —
  `ResourceReadAsync`, `ResourceWriteAsync`, `ResourceListAsync`,
  `ResourceCopyAsync`, `ResourceDeleteAsync`, `ResourceMoveAsync`,
  `ResourceResolveAsync`, `ResourceMkdirAsync`, `ResourceRequestAsync`, and
  `CreateResourceWatchAsync` — each forcing the channel to the root resource URI
  so callers omit it. For the reverse (server-initiated) direction, the typed
  `ResourceRequestHandlers` registry plus `SetResourceRequestHandlers` layers a
  per-method handler set over the existing generic server-request handler; an
  unset method is reported to the peer as `MethodNotFound`. Client-only
  ergonomics — no protocol change.
- **Terminal-command prefix marker** (upstream microsoft/agent-host-protocol#313):
  `InitializeResult.TerminalCommandPrefix` (optional `string?`) lets a host
  advertise the prefix (conventionally `"!"`) that marks a user message as a
  shorthand terminal command.
- **Uniform provider metadata on customizations** (upstream microsoft/agent-host-protocol#318):
  the optional `_meta` provider-metadata slot is hoisted onto every customization
  type (`PluginCustomization`, `ClientPluginCustomization`,
  `DirectoryCustomization`, `SkillCustomization`, `PromptCustomization`,
  `RuleCustomization`, `HookCustomization`, `McpServerCustomization`), not only
  `AgentCustomization`. Additive and wire-compatible.
- **MCP server start/stop requests** (upstream microsoft/agent-host-protocol#319):
  the client-dispatchable `session/mcpServerStartRequested` and
  `session/mcpServerStopRequested` actions (`SessionMcpServerStartRequestedAction`
  / `SessionMcpServerStopRequestedAction`, each carrying the target `Id`) let a
  client request that the host start/restart or stop an existing
  `McpServerCustomization`. The reducer locates the entry by id — searching the
  top-level customization list and every container's `children` — and
  optimistically moves it to `starting` / `stopped`, clearing any previous
  `channel`; the host stays authoritative. Both are no-ops when no matching MCP
  server is found. The `session/mcpServerStateChanged` reducer now shares the same
  `UpdateMcpServerCustomization` traversal helper.
- **Terminal-command completion metadata** (upstream microsoft/agent-host-protocol#314):
  `ToolResultTerminalCompleteContent` (wire `type: "terminalComplete"`) records a
  terminal-style tool command's exit — optional `Resource` (the `ahp-terminal:`
  channel that carried live output), `ExitCode`, `Cwd`, `Preview`, and
  `Truncated` — as a new variant of the `ToolResultContent` union.
- **Plugin version provenance** (upstream microsoft/agent-host-protocol#317):
  `PluginCustomization.Version` (optional `string?`) carries the semver from the
  Open Plugins manifest's optional `version` field, for display/provenance only.
- **System-notification metadata slot** (upstream microsoft/agent-host-protocol#308):
  `SystemNotificationResponsePart.Meta` (optional `Dictionary<string, JsonElement>?`,
  wire `_meta`) lets a host attach a machine-readable descriptor of what triggered
  a harness notification so clients can categorize, icon, group, filter, or
  localize it without string-matching `Content`. Additive and optional; clients
  render coherently from `Content` alone when it is absent.
- **Changeset review as a first-class capability** (upstream microsoft/agent-host-protocol#328):
  a changeset advertises review support up-front via `Changeset.Capabilities`
  (`ChangesetCapabilities`, whose presence-flag `Review` mirrors the MCP-capability
  convention). `ChangesetFile.Reviewed` (optional `bool?`) is the GitHub-style
  "Viewed" flag; absent is equivalent to not-yet-reviewed. It is toggled by the
  `changeset/filesReviewChanged` action (`ChangesetFilesReviewChangedAction`,
  carrying `Files` and `Reviewed`) — which supersedes the earlier server-only
  `changeset/filesReviewedChanged` (field renamed `fileIds` → `files`) and is now
  the first and only **client-dispatchable** `changeset/*` action, so a reviewer
  can toggle review state optimistically through the write-ahead reducer. The
  reducer flips `Reviewed` on each matching file and is a no-op when no listed file
  needs changing (already in the target state, or an id that matches no current
  file).
- **Agent-advertised capabilities** (upstream microsoft/agent-host-protocol#292):
  `AgentInfo.Capabilities` (an optional `AgentCapabilities`) lets an agent
  advertise static capabilities so clients gate features by capability instead of
  by provider id. The first capability is `MultipleChats` (a
  `MultipleChatsCapability`): its presence advertises concurrent chats per
  session, and its optional `Fork` flag additionally allows forking a chat from a
  turn. Presence semantics follow MCP capabilities — an empty object advertises
  support, absence means the feature is unsupported.
- **Advisory subscription delivery preferences** (upstream microsoft/agent-host-protocol#293):
  `SubscribeAsync` gains an optional `SubscriptionDeliveryOptions delivery`
  argument threaded onto `SubscribeParams.Delivery`. Its `MaxLatencyMs` bounds how
  long a server may intentionally delay delivery while buffering/coalescing
  high-frequency updates (`0` requests immediate, un-coalesced delivery). Omit it
  for the server's default behavior.
- **Cursor-based `listSessions` pagination** (upstream microsoft/agent-host-protocol#295):
  `ListSessionsParams` gains opaque `Limit`/`Cursor` inputs and `ListSessionsResult`
  gains a `NextCursor` output so a large session catalogue can be fetched
  incrementally, most-recently-modified first. Pagination is fully additive —
  omitting `Limit`/`Cursor` and ignoring `NextCursor` preserves the single-page
  behavior. The previously-unused `ListSessionsParams.Filter` field is removed.
- **Session-level `inputNeeded` aggregate** (upstream microsoft/agent-host-protocol#265):
  `SessionState.InputNeeded` surfaces every outstanding input request a session
  is blocked on, aggregated across all chats so a client can discover and answer
  it from the session channel alone. Each entry is a `SessionInputRequest`
  discriminated union — `SessionChatInputRequest` (a mirrored chat elicitation),
  `SessionToolConfirmationRequest` (a tool call awaiting confirmation), or
  `SessionToolClientExecutionRequest` (a running tool delegated to a client) —
  carrying the owning chat URI plus every id needed to respond. The host upserts
  entries with the new `session/inputNeededSet` action (`SessionInputNeededSetAction`)
  and removes them with `session/inputNeededRemoved` (`SessionInputNeededRemovedAction`);
  the session reducer keys both by the entry `id` and reflects a non-empty queue
  as `SessionStatus.InputNeeded`.
- **First-class `model` and `tools` on custom agents** (upstream microsoft/agent-host-protocol#289):
  `AgentCustomization` gains optional `Model` (the model the agent is pinned to)
  and `Tools` (an allowlist of tool names the agent is scoped to), sourced from
  the agent file's frontmatter.
- **Optional tool invocation intention** (upstream microsoft/agent-host-protocol#283):
  `ToolCallBase` (every `ToolCall*State`) and `ChatToolCallStartAction` gain an
  optional `Intention` (`intention?`) — a human-readable description of what the
  tool invocation intends to do. The chat reducer sets it on tool-call-start and
  carries it through every tool-call state transition.
- **Chat draft + activity actions** (upstream AHP 0.5.0, microsoft/agent-host-protocol#264):
  `ChatDraftChangedAction` (`chat/draftChanged`, client-dispatchable) syncs the
  user's in-progress `ChatState.Draft` (a `Message`, carrying its model/agent
  selection and attachments) so it survives reloads and is visible to other
  clients; `ChatActivityChangedAction` (`chat/activityChanged`) updates
  `ChatState.Activity`.
- **`root/progress` notification** (upstream #263): a generic `ProgressParams`
  progress notification for long-running operations (e.g. the first-use SDK
  download), correlated back to the request via the new
  `CreateSessionParams.ProgressToken`.
- **OpenTelemetry-native self-instrumentation**: the client originates traces +
  metrics from a single `System.Diagnostics.ActivitySource` and `Meter`
  (`AhpTelemetry.Name == "Microsoft.AgentHostProtocol"`), near zero-cost when
  nothing is listening. One `ahp.request {method}` span per JSON-RPC request
  (`rpc.system` / `rpc.method` / `ahp.outcome` tags) and the `ahp.client.*`
  metric family (messages sent/received, request duration, requests in-flight,
  active subscriptions, reconnects, dropped events, malformed frames). The
  span / metric / attribute NAMES are codegen'd into `AhpTelemetryNames` from a
  client-private registry (`clients/dotnet/codegen/telemetry/registry.ts`) so
  they live in one place; the registry is structured for promotion to a shared
  cross-client contract if AHP ever specs one. See `TELEMETRY.md`.
- `IMultiHostClient` — an interface extracted from `MultiHostClient` so consumers
  can depend on (and mock) the multi-host runtime rather than the concrete sealed
  facade. `AddAgentHostProtocol()` now also registers `IMultiHostClient`,
  forwarding to the same singleton.
- `AhpServiceCollectionExtensions.TelemetrySourceName` — the instrumentation-scope
  name constant to pass to OpenTelemetry's `AddSource(...)` / `AddMeter(...)`, with
  the wiring snippet in its XML docs (the library takes no OpenTelemetry
  dependency itself).
- `AhpTelemetryNames.StreamHost{Event,Subscription,Resource,Snapshot,Summaries}`
  constants for the multi-host per-stream `ahp.stream` drop-tag values, and a
  generated `AhpTelemetryNames.*Description` constant per metric (the single
  source for each instrument's runtime description).
- A new **`examples/OtelExport`** sample (Shape C): wires the AHP instrumentation
  scope into an OpenTelemetry pipeline with a console exporter and drives one
  client operation so the request span + metrics print.
- `ChangesetOperationStatus.Disabled` — new value for changeset operations
  that are currently unavailable and cannot be invoked (upstream #233).
- `ChangesetOperation.Group` — optional identifier for grouping related
  changeset operations together in the UI (upstream #233).
- Full support for the **`ahp-chat:` channel** (upstream #213, multi-chat
  sessions): `ChatState` (turns, active turn, steering message, queued
  messages, input requests), the `SessionState.Chats` catalog (`ChatSummary`)
  + `SessionState.DefaultChat` input-routing hint, the full `Chat*Action`
  family (`ChatTurnStarted`, `ChatDelta`, `ChatResponsePart`, and the chat
  tool-call / input / messaging actions), the `ChatInputQuestion` /
  `ChatInputAnswer` / `ChatInputRequest` types, `ChatOrigin` provenance, and
  the `CreateChat` / `DisposeChat` commands; reduced by the new
  `Reducers.ApplyToChat`, a faithful port of the canonical TypeScript chat
  reducer exercised by all 90 shared `reducer: "chat"` fixtures. Brings the
  .NET client to cross-language conformance parity on the chat channel.
- `SessionChatAddedAction`, `SessionChatRemovedAction`,
  `SessionChatUpdatedAction`, and `DefaultChatChangedAction` handling for
  incremental chat-catalog updates on `SessionState`.
- The per-turn chat actions (`ChatTurnStarted`, `ChatDelta`,
  `ChatResponsePart`, `ChatReasoning`, `ChatUsage`, `ChatTurnComplete`,
  `ChatTurnCancelled`, `ChatError`) now carry an optional `_meta` property bag
  (`Dictionary<string, JsonElement>? Meta`) so agent hosts can stamp portable
  per-event metadata on the action stream, mirroring the MCP `_meta`
  convention (upstream #240).
- `SessionSummary` and `PartialSessionSummary` now carry an optional `_meta`
  property bag (`Dictionary<string, JsonElement>? Meta`) for lightweight
  server-defined session-list presentation hints; the protocol does not
  interpret the values (upstream #254).
- Error metadata fields from upstream #216.
- `RootState` now exposes an optional `_meta` property bag
  (`Dictionary<string, JsonElement>? Meta`) for implementation-defined
  agent-host metadata, such as a well-known `hostBuild` key carrying the
  host's build version/commit/date.
- Full support for the per-session **annotations channel**
  (`ahp-session:/<uuid>/annotations`): the `AnnotationsState`, `Annotation`,
  `AnnotationEntry`, and `AnnotationsSummary` wire types; the four
  `annotations/{set,removed,entrySet,entryRemoved}` actions; and
  `Reducers.ApplyToAnnotations`, a faithful port of the canonical reducer
  (append-or-replace an annotation by id, drop a matching annotation,
  append-or-replace an entry within an annotation, drop a matching entry;
  unknown target ids are no-ops). Brings the .NET client to full
  cross-language conformance parity on the annotations channel.
- `SessionSummary.Annotations` (and `PartialSessionSummary.Annotations`),
  an optional `AnnotationsSummary` carrying annotation / entry counts for
  badge UI without subscribing to the channel.
- `MessageAnnotationsAttachment` — the `annotations` variant of the
  `MessageAttachment` union, referencing annotations on a session's
  annotations channel.
- `IAhpSerializer.SerializeToElement<T>(T)` — serializes a value directly to a
  `JsonElement` without the intermediate string + `JsonDocument.Parse`. Custom
  `IAhpSerializer` implementations must implement this member.
- `IAhpSerializer.Deserialize<T>(JsonElement)`: deserializes directly from an
  already-parsed `JsonElement`, avoiding the `GetRawText()` string + re-parse on
  the inbound hot path. Custom `IAhpSerializer` implementations must implement
  this member.
- `HostReconnectFailedException` (a `HostException` subclass), surfaced on
  `HostState.Error` when a host's reconnection cannot proceed: the transport
  dropped while the reconnect policy was disabled, or the attempt budget was
  exhausted.
- Trim / AOT support: the three shipping packages declare `IsTrimmable` /
  `IsAotCompatible` and annotate the reflection-based serialization entry points
  with `[RequiresUnreferencedCode]` / `[RequiresDynamicCode]`, so trimmed or
  Native-AOT consumers receive accurate analyzer warnings.
- Tracks protocol 0.5.0. New `ChangesetContentChangedAction`
  (`changeset/contentChanged`) with its reducer: full-replacement semantics
  where `files` always replaces the file list, `operations` replaces the
  operation list only when present, and `error` is set when present and cleared
  otherwise (parity with the canonical reducer; upstream #159 fixtures). New
  `MessageOrigin` type and `MessageKind.Agent` / `MessageKind.Tool` members for
  non-user-initiated turns (`Message.Origin` is now the typed `MessageOrigin`
  rather than an opaque `JsonElement`; upstream #247). `ConfigPropertySchema`
  and `SessionConfigPropertySchema` gain `AdditionalProperties` (upstream #245).
- `SessionModelInfo.MaxOutputTokens` and `SessionModelInfo.MaxPromptTokens`
  optional fields for communicating model token limits (upstream).
- Tracks protocol 0.8.0. A tool call's final input is now the `ToolInput` union
  — inline text or a lazy `ContentRef` — instead of a bare string (upstream
  #374). `chat/toolCallReady` carries it forward from the existing state when
  the action omits it (except out of `streaming`, where nothing had settled
  yet), and `chat/toolCallConfirmed`'s `EditedToolInput` overrides only an
  *inline* input, leaving a content reference for the host to replace. A
  `chat/toolCallDelta` with no `content` no longer materializes an empty
  `PartialInput`.
- `chat/toolCallReady` may finalize a tool call's provisional `Intention` and
  MCP/server `Contributor` without changing client-execution ownership, which
  stays fixed at `chat/toolCallStart`: a client-owned call keeps its owner
  unless the refinement names the same client, and a call that was not
  client-owned can never become client-owned late (upstream #364).
- A `toolClientExecution` entry in the session input queue no longer raises
  `SessionStatus.InputNeeded`. That work is delegated to a client, not a prompt
  — the call has already cleared its confirmation gate — so counting it made a
  session report "input needed" for the whole duration of every client tool
  call (upstream #380).
- `ResourceResponsePart` is generated from the correctly-spelled upstream type
  name (upstream #375 fixed the `ResourceReponsePart` typo).

### Changed

- **Tracks protocol 0.7.0** (the AHP 0.6.0 release plus the 0.7.0 multiroot
  line): negotiated protocol versions are now `[0.7.0, 0.6.0, 0.5.2, 0.5.1]`.
- **BREAKING — terminal completion folded into the terminal content block**
  (upstream microsoft/agent-host-protocol#352): the standalone
  `terminalComplete` tool-result variant is **removed** (see Removed) and its
  outcome now hangs off `ToolResultTerminalContent.Result` as the new
  `TerminalCommandResult` (`ExitCode`, `Preview`, `Truncated`), present once the
  command has exited. `ToolResultTerminalContent` also gains `IsPty` — `false`
  means output is plain text and needs no VT-sequence parsing — as does
  `TerminalState`. Note `Cwd` did not survive the fold: code that read
  `ToolResultTerminalCompleteContent.Cwd` has no replacement on this block.
- **Tracks protocol 0.5.1** (the AHP 0.5.0 release line, upstream
  microsoft/agent-host-protocol#264/#278/#263): negotiated protocol versions are
  now `[0.5.1, 0.5.0]`.
- **BREAKING — input requests live in the turn, not beside it** (upstream
  microsoft/agent-host-protocol#338): `InputRequestResponsePart.Response` is now
  **optional** (`ChatInputResponseKind?`) — it is absent while the request is
  open — so any code that read it as a non-nullable value must now handle `null`.
  An *open* request is no longer a separate collection but an
  `InputRequestResponsePart` in the active turn whose `Response` is `null`, and
  the chat's `InputNeeded` status is derived from that rather than from a stored
  field. Three behavior changes follow:
  `chat/inputRequested` **no-ops without an active turn** (the part is turn-scoped,
  so there is nowhere to record it); `chat/inputCompleted` updates the existing
  part instead of removing the request and appending a new part; and an
  outstanding request is **no longer discarded when its turn ends** — it stays in
  the completed turn's transcript unresolved, where previously it vanished
  without a trace. Answer drafts are still preserved across a re-request that
  omits `Answers`, and a request id is matched only against *unresolved* parts, so
  a resolved request can never be reopened.
- **Flat `SessionState`** (upstream #264): `SessionState` no longer nests a
  `Summary`. The fields shared with the catalog representation
  (`Provider`/`Title`/`Status`/`Activity`/`Project`/`WorkingDirectory`/
  `Annotations` — the new `SessionMetadata` interface) are denormalized directly
  onto `SessionState`, so a subscriber receives one flat object. The session
  reducers act on the flat fields, and — because `SessionState` no longer carries
  a `modifiedAt` clock — the session reducers are now pure (no host-authoritative
  `modifiedAt` overlay is needed for convergence). `SessionSummary.CreatedAt` and
  `SessionSummary.ModifiedAt` are now ISO 8601 `string`s (were epoch-ms numbers).
- **Per-message model/agent selection** (upstream #264): `session/modelChanged`
  and `session/agentChanged` actions are removed, and `Model`/`Agent` no longer
  live on `SessionState`, `SessionSummary`, `ChatState`, `ChatSummary`,
  `CreateSessionParams`, or `CreateChatParams`. The selection now travels on the
  individual `Message` (new `Message.Model` / `Message.Agent`), recording the
  model/agent a message was — or, for a `draft`, will be — sent with.
- **Multiple active clients per session** (upstream
  microsoft/agent-host-protocol#261): `SessionState.ActiveClient`
  (`SessionActiveClient?`) becomes `SessionState.ActiveClients`
  (`List<SessionActiveClient>`, required), so several clients can provide tools
  and customizations to one session at once. The two session actions are
  replaced accordingly: `SessionActiveClientChangedAction`
  (`session/activeClientChanged`) → `SessionActiveClientSetAction`
  (`session/activeClientSet`, upsert keyed by `clientId`, no longer nullable),
  and `SessionActiveClientToolsChangedAction`
  (`session/activeClientToolsChanged`) → `SessionActiveClientRemovedAction`
  (`session/activeClientRemoved`, carrying the `clientId` to remove). The
  reducer upserts on `activeClientSet` and removes-by-`clientId` (no-op on miss)
  on `activeClientRemoved`.
- `ConfigPropertySchema.Enum` and `SessionConfigPropertySchema.Enum` are now
  `List<JsonElement>?` instead of `List<string>?`, allowing numeric, boolean,
  and null enum values (the `JsonPrimitive` widening in `types/common/state.ts`).
- `ModelSelection.Config` values are now `Dictionary<string, JsonElement>?`
  instead of `Dictionary<string, string>?`, allowing numeric, boolean, and null
  configuration values carried through as-is.

- The `MultiHostClient` reconnect supervisor now emits the `ahp.client.reconnects`
  counter — tagged `ahp.outcome=ok` on a successful reconnect and `ahp.outcome=error`
  on each failed attempt and on attempt-budget exhaustion — so multi-host reconnects
  are observable, matching the single-host client's instrumentation.
- The multi-host per-stream drop tags and the metric instrument descriptions now
  reference the generated `AhpTelemetryNames` constants instead of hand-copied
  literals, so they cannot drift from the generated contract. The drop tags are
  also cached (one allocation per stream kind, not per evicted event).
- Per-turn / tool-call / input / messaging reducer logic moved from
  `SessionState` to `ChatState`, matching upstream #213's split of the session
  turn surface into the per-chat channel.
- `NowIso()` now emits ISO 8601 UTC with a `Z` suffix (was the C# round-trip
  format ending `+00:00`), matching the cross-client wire timestamp format.
- Generated write-once wire payloads (every `*Action` / `*Command` /
  `*Notification` and value object) are now `sealed record` types with
  `init`-only properties; the state types the reducers mutate in place
  (`SessionState`, `RootState`, `TerminalState`, `SessionSummary`, … ) remain
  mutable `sealed class`. Named-initializer construction is unchanged.
- Required non-nullable wire fields now use the C# `required` modifier instead
  of fabricated `""` / `null!` defaults. A payload that omits a required field
  is rejected on deserialize (matching the schema's `required` array) rather
  than silently materializing an empty value.
- The tool-call lifecycle reducers (`delta`, `ready`, `confirmed`, `complete`,
  `resultConfirmed`, `contentChanged`) now propagate the action's `_meta` onto
  the resulting tool-call state, so provider metadata stays synchronized as a
  tool call advances beyond its initial `start` event (parity with the
  canonical reducer; upstream #211).
- `AhpClient.RequestAsync<TParams, TResult>` now returns `Task<TResult?>` (was
  `Task<TResult>`), making the empty-result case explicit for callers. The typed
  protocol methods (`InitializeAsync`, `ReconnectAsync`, the subscribe helpers)
  throw `AhpRpcException` when the server returns no result rather than handing
  back a null.
- Failures surfaced on `AhpClient.Error` and `HostState.Error` are now typed
  (`AhpTransportException`, `HostReconnectFailedException`) instead of a bare
  `System.Exception`, so callers can pattern-match them.
- `HostConfig.Id` and `HostHandle.Id` now use the C# `required` modifier.
- Reduced per-message allocations on the hottest paths: inbound notifications and
  request results deserialize straight from the parsed `JsonElement` (no string
  round-trip), the notification fan-out skips its snapshot allocations when there
  are no subscribers, and the WebSocket receive loop decodes single-frame
  messages without a `MemoryStream`.

### Removed

- **BREAKING — `ToolResultTerminalCompleteContent` and
  `ToolResultContentType.TerminalComplete`** (upstream
  microsoft/agent-host-protocol#352): the standalone completion variant is gone.
  Read the outcome from `ToolResultTerminalContent.Result` instead (see Changed).
- **BREAKING — `ChatForkSource`** (upstream
  microsoft/agent-host-protocol#334): renamed to `ForkChatSource` and folded into
  the new `ChatSource` union alongside `SideChatSource` (see Added).
- **BREAKING — `ChatState.InputRequests`** (upstream
  microsoft/agent-host-protocol#338): the live `List<ChatInputRequest>?` surface
  is gone. The open input requests are now derived from the active turn's
  `ResponseParts` — the `InputRequestResponsePart`s whose `Response` is `null`
  (see Changed). `ChatInputRequest` itself remains, as the request payload the
  part carries.
- **Stale session-level input-elicitation surface** (upstream removed it in the
  multi-chat sessions change, microsoft/agent-host-protocol#213): the
  `session/inputRequested` / `session/inputAnswerChanged` / `session/inputCompleted`
  actions and their supporting types (the old `SessionInputRequest`,
  `SessionInputQuestion`, `SessionInputAnswer`, and the `SessionInput*` question/
  answer/enum families) were carried by the .NET client after upstream had already
  dropped them, with no sibling-client analog. They are removed; the canonical
  `SessionInputRequest` name is now the session `inputNeeded` union (see Added).

### Fixed

- **`SnapshotState` no longer mis-routes a session snapshot to the root
  fallback** (parity with upstream microsoft/agent-host-protocol#265's SnapshotState
  decoder cleanup): the shape-probe discriminated `SessionState` on a `summary`
  field that was removed when the session state was flattened, so a session
  snapshot fell through to `RootState`. It now discriminates on the required
  `lifecycle` field, matching the sibling clients.

- `ChangesetOperationRangeTarget.Range` now serializes as the canonical
  `TextRange` (nested `{ line, character }` start/end positions) instead of a
  flat `{ Start, End }` integer index pair. The flat shape was a
  code-generation drift from the schema (`ChangesetOperationTarget.range` is a
  `TextRange`) and could not represent a real source range; the .NET wire form
  now matches the other language clients.
- `ActionEnvelope.Origin` is omitted from the wire when absent
  (server-originated) instead of being serialized as `"origin": null`, matching
  the `ActionOrigin | undefined` schema (`undefined` ⇒ omit).
- Client teardown could deadlock when a keep-alive ping failure triggered
  shutdown from within the keep-alive loop itself (the loop awaited its own
  task). Teardown now skips that self-await.
- A fragmented WebSocket text message whose frames exactly filled the 64 KiB
  receive buffer dropped a frame; the receive loop now grows the buffer after
  copying the previous frame rather than before.

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
