# Actions

Actions are the sole mutation mechanism for subscribable state. They form a discriminated union keyed by `type`. Every action is wrapped in an `ActionEnvelope` for sequencing and origin tracking.

## Action Envelope

```typescript
ActionEnvelope {
  channel: URI                                          // channel the action targets
  action: Action
  serverSeq: number                                     // monotonic, assigned by server
  origin: { clientId: string, clientSeq: number } | undefined  // undefined = server-originated
  rejectionReason?: string                              // present when the server rejected the action
}
```

- `channel` — the channel URI this action targets. Routing is by envelope, not by fields on the inner action. See [Channels & Subscriptions](/specification/subscriptions).
- `serverSeq` — Monotonically increasing sequence number assigned by the server, used for ordering and replay.
- `origin` — Identifies who produced this action. `undefined` means the server itself (e.g. from an agent backend). Otherwise identifies the client that dispatched it.
- `rejectionReason` — When present, indicates the server rejected the action. The client should revert its optimistic prediction. Contains a human-readable explanation (e.g. `"no active turn to cancel"`, `"tool call not pending confirmation"`).

Individual action payloads do **not** carry their own `session: URI` or `terminal: URI` field — the target channel comes from the envelope.

## Root Actions

These mutate root state and travel on the [Root Channel](/specification/root-channel). One root action — `root/configChanged` — is client-dispatchable; the rest are server-originated.

| Type | Client-dispatchable? | When |
|---|---|---|
| `root/agentsChanged` | No | Available agent backends or their models changed |
| `root/activeSessionsChanged` | No | Count of active sessions changed |
| `root/terminalsChanged` | No | Lightweight terminal catalogue changed (full replacement) |
| `root/configChanged` | **Yes** | Host-level configuration values changed |

## Session & Chat Actions

Actions travel on the channel named by their prefix: `session/*` actions on the [Session Channel](/specification/session-channel) (`ahp-session:/<uuid>`), and `chat/*` actions on a [Chat Channel](/specification/chat-channel) (`ahp-chat:/<cid>`). A session is a catalog of chats; its per-conversation activity — turns, streaming, tool calls, pending messages, and input requests — lives on the chat channels, while lifecycle, metadata, tool-registry, and customization actions live on the session channel. Some actions are server-only (produced by the agent backend), others are client-dispatchable.

When a client dispatches an action, the server applies it to the state and also reacts to it as a side effect (e.g. `chat/turnStarted` triggers agent processing, `chat/turnCancelled` aborts it). This avoids a separate command→action translation layer for the common interactive cases.

### Lifecycle (session channel)

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/ready` | No | Session backend initialised successfully |
| `session/creationFailed` | No | Session backend failed to initialise |

### Turn Lifecycle (chat channel)

| Type | Client-dispatchable? | When |
|---|---|---|
| `chat/turnStarted` | **Yes** | User sent a message; server starts processing |
| `chat/delta` | No | Streaming text chunk appended to a response part by `partId` |
| `chat/responsePart` | No | New response part created (markdown, reasoning, content ref, tool call) |
| `chat/reasoning` | No | Reasoning/thinking text appended to a reasoning part by `partId` |
| `chat/usage` | No | Token usage report for the active turn |
| `chat/turnComplete` | No | Turn finished (assistant idle) |
| `chat/turnCancelled` | **Yes** | Turn was aborted; server stops processing |
| `chat/error` | No | Error during turn processing |
| `chat/truncated` | **Yes** | Turn history truncated (with optional `turnId` cutoff) |

### Tool Calls (chat channel)

Tool calls follow a discriminated-union state machine — see [State Model — Tool Call Lifecycle](/guide/state-model#tool-call-lifecycle) for the full diagram.

| Type | Client-dispatchable? | When |
|---|---|---|
| `chat/toolCallStart` | No | Tool call created; LM begins streaming parameters |
| `chat/toolCallDelta` | No | Streaming partial parameters appended |
| `chat/toolCallReady` | No | Parameters complete (or running tool needs re-confirmation) |
| `chat/toolCallConfirmed` | **Yes** | Client approves or denies a pending tool call |
| `chat/toolCallComplete` | **Yes**¹ | Tool execution finished |
| `chat/toolCallResultConfirmed` | **Yes** | Client approves or denies a pending result |
| `chat/toolCallContentChanged` | **Yes**¹ | Streaming intermediate content while a tool is running |

¹ Client-dispatchable for **client-provided tools** only (where the tool call's `contributor.clientId` matches the dispatching client). For server-side tools, only the server produces these actions.

### Activity & Metadata

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/titleChanged` | **Yes** | Session title updated (auto-generated or client rename) |
| `session/activityChanged` | No | Server updated the session's current activity description |
| `chat/activityChanged` | No | Server updated a chat's current activity description |
| `session/diffsChanged` | No | File diffs in the session summary changed (full replacement) |
| `session/isReadChanged` | **Yes** | Client marked session as read or unread |
| `session/isArchivedChanged` | **Yes** | Client archived or unarchived session |
| `session/configChanged` | **Yes** | Mutable session config values changed |
| `session/metaChanged` | No | The session's `_meta` side-channel was replaced |

### Server & Active-Client Tools (session channel)

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/serverToolsChanged` | No | Server-provided tool list changed (full replacement) |
| `session/activeClientSet` | **Yes** | A client joins or refreshes as an active client (keyed by `clientId`), with its tools and customizations |
| `session/activeClientRemoved` | **Yes** | A client leaves the active set (by `clientId`) |

See [Customizations & Client Tools](/guide/customizations) for the full flow.

### Pending Messages (chat channel)

| Type | Client-dispatchable? | When |
|---|---|---|
| `chat/pendingMessageSet` | **Yes** | A steering or queued message was set (upsert) |
| `chat/pendingMessageRemoved` | **Yes** | A pending message was cancelled (by client) or consumed (by server) |
| `chat/queuedMessagesReordered` | **Yes** | Queued messages were reordered |

The `pendingMessageSet` and `pendingMessageRemoved` actions carry a `kind` discriminant (`'steering'` or `'queued'`). See the [State Model — Pending Messages](/guide/state-model#pending-messages) for semantics.

### Input Requests (chat channel)

| Type | Client-dispatchable? | When |
|---|---|---|
| `chat/inputRequested` | No | Server requested structured input from the user (upsert) |
| `chat/inputAnswerChanged` | **Yes** | Client updated a single draft / submitted / skipped answer |
| `chat/inputCompleted` | **Yes** | Client accepted, declined, or cancelled an input request |

See [Elicitation](/guide/elicitation) for the request lifecycle.

### Customizations

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/customizationsChanged` | No | Server replaced the session's top-level customization list (full replacement) |
| `session/customizationToggled` | **Yes** | Client toggled a container or child customization on or off by id |
| `session/customizationUpdated` | No | Server upserted a top-level container (plugin or directory) by id (full-entry replacement, including children) |
| `session/customizationRemoved` | No | Server removed a customization by id (containers cascade to children) |

See the [Customizations guide](/guide/customizations) for the full flow.

## Terminal Actions

Terminal actions travel on the relevant [Terminal Channel](/specification/terminal-channel).

| Type | Client-dispatchable? | When |
|---|---|---|
| `terminal/data` | No | pty output flowing to clients (appended to tail content part) |
| `terminal/input` | **Yes** | Keyboard input forwarded to the pty (side-effect-only) |
| `terminal/resized` | **Yes** | Terminal dimensions changed |
| `terminal/claimed` | **Yes** | Claim transferred (client ↔ session) |
| `terminal/titleChanged` | **Yes** | Title updated |
| `terminal/cwdChanged` | No | Working directory changed |
| `terminal/exited` | No | Process exited (exit code set) |
| `terminal/cleared` | **Yes** | Scrollback / content reset |
| `terminal/commandDetectionAvailable` | No | Shell integration loaded; command boundaries now reported |
| `terminal/commandExecuted` | No | A command has been submitted to the shell and is now executing |
| `terminal/commandFinished` | No | A command has finished executing (exit code, duration) |

See the [Terminals guide](/guide/terminals) for usage flows.

## Annotations Actions

Annotations actions travel on a session's annotations channel (`ahp-session:/<uuid>/annotations`). Every annotations action is client-dispatchable — clients create, re-anchor, resolve, and delete annotations and their entries by dispatching these directly (assigning the `Annotation.id` / `AnnotationEntry.id` themselves and applying them optimistically), and the agent host MAY also originate them.

| Type | Client-dispatchable? | When |
|---|---|---|
| `annotations/set` | **Yes** | Upsert an annotation — create one with its mandatory first entry, or re-anchor / resolve an existing one |
| `annotations/updated` | **Yes** | Partially update an annotation's own properties (resolve / re-open, re-anchor) without resending its entries |
| `annotations/removed` | **Yes** | Remove an entire annotation (and every entry it contains) |
| `annotations/entrySet` | **Yes** | Upsert a single entry within an annotation (add or edit) |
| `annotations/entryRemoved` | **Yes** | Remove a single entry; dispatch `annotations/removed` instead to drop the last remaining entry |

See the [Annotations Channel reference](/reference/annotations) for the full state shape.

## Client-Dispatched Actions

Clients interact with the server by dispatching actions as fire-and-forget notifications:

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-chat:/<cid>",
    "clientSeq": 1,
    "action": { "type": "chat/turnStarted", "turnId": "t1", ... }
  }
}
```

The client applies the action **optimistically** to its local state before sending. When the server echoes it back in an `ActionEnvelope`, the client reconciles (see [Write-Ahead Reconciliation](/guide/reconciliation)).

| Action | Server-side effect |
|---|---|
| `chat/turnStarted` | Begins agent processing for the new turn |
| `chat/toolCallConfirmed` | Approves or denies a pending tool call; unblocks or cancels tool execution |
| `chat/turnCancelled` | Aborts the in-progress turn |
| `session/titleChanged` | Updates the session title (rename) |
| `chat/pendingMessageSet` | Stores a steering or queued message (upsert); if queued and idle, auto-starts a turn |
| `chat/pendingMessageRemoved` | Cancels a pending message before it is consumed |
| `chat/queuedMessagesReordered` | Reorders queued messages; unknown IDs ignored, unmentioned messages kept at end |
| `session/customizationToggled` | Toggles a container or child customization on or off by id |
| `session/isReadChanged` | Marks the session as read or unread |
| `session/isArchivedChanged` | Archives or unarchives the session |
| `session/activityChanged` | Updates the session's current activity description |

## Reducers

State is mutated by pure reducer functions — one per state-bearing channel type:

```typescript
rootReducer(state: RootState, action: RootAction): RootState
sessionReducer(state: SessionState, action: SessionAction): SessionState
chatReducer(state: ChatState, action: ChatAction): ChatState
terminalReducer(state: TerminalState, action: TerminalAction): TerminalState
```

The reducer for a given action envelope is selected by the URI scheme of `envelope.channel`. Reducers are **pure** — no side effects, no I/O. The same reducer code runs on both server and client, which is what makes write-ahead possible. Server-side effects (e.g. forwarding a message to the agent SDK) are handled by a separate dispatch layer, not in the reducer.

The reducer `switch` on action `type` is exhaustive — the compiler errors if a case is missing. This guarantees that every action type is handled.

## Next Steps

- [Channels & Subscriptions](/specification/subscriptions) — How channels and the action envelope route mutations.
- [Write-Ahead Reconciliation](/guide/reconciliation) — How clients stay in sync.
- [Messages Reference](/reference/messages) — Index of every JSON-RPC method, linked to the channel that documents it.
- [Common Reference](/reference/common#action-envelope) — `ActionEnvelope`, `ActionType`, and the `StateAction` union.
- [State Model](/guide/state-model) — The state tree these actions mutate.
