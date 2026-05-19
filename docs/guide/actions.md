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

## Session Actions

Session actions travel on the relevant [Session Channel](/specification/session-channel). Some are server-only (produced by the agent backend), others are client-dispatchable.

When a client dispatches an action, the server applies it to the state and also reacts to it as a side effect (e.g. `session/turnStarted` triggers agent processing, `session/turnCancelled` aborts it). This avoids a separate command→action translation layer for the common interactive cases.

### Lifecycle

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/ready` | No | Session backend initialised successfully |
| `session/creationFailed` | No | Session backend failed to initialise |

### Turn Lifecycle

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/turnStarted` | **Yes** | User sent a message; server starts processing |
| `session/delta` | No | Streaming text chunk appended to a response part by `partId` |
| `session/responsePart` | No | New response part created (markdown, reasoning, content ref, tool call) |
| `session/reasoning` | No | Reasoning/thinking text appended to a reasoning part by `partId` |
| `session/usage` | No | Token usage report for the active turn |
| `session/turnComplete` | No | Turn finished (assistant idle) |
| `session/turnCancelled` | **Yes** | Turn was aborted; server stops processing |
| `session/error` | No | Error during turn processing |
| `session/truncated` | **Yes** | Turn history truncated (with optional `turnId` cutoff) |

### Tool Calls

Tool calls follow a discriminated-union state machine — see [State Model — Tool Call Lifecycle](/guide/state-model#tool-call-lifecycle) for the full diagram.

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/toolCallStart` | No | Tool call created; LM begins streaming parameters |
| `session/toolCallDelta` | No | Streaming partial parameters appended |
| `session/toolCallReady` | No | Parameters complete (or running tool needs re-confirmation) |
| `session/toolCallConfirmed` | **Yes** | Client approves or denies a pending tool call |
| `session/toolCallComplete` | **Yes**¹ | Tool execution finished |
| `session/toolCallResultConfirmed` | **Yes** | Client approves or denies a pending result |
| `session/toolCallContentChanged` | **Yes**¹ | Streaming intermediate content while a tool is running |

¹ Client-dispatchable for **client-provided tools** only (where `toolClientId` matches the dispatching client). For server-side tools, only the server produces these actions.

### Activity & Metadata

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/titleChanged` | **Yes** | Session title updated (auto-generated or client rename) |
| `session/modelChanged` | **Yes** | Model changed for this session |
| `session/activityChanged` | No | Server updated the session's current activity description |
| `session/diffsChanged` | No | File diffs in the session summary changed (full replacement) |
| `session/isReadChanged` | **Yes** | Client marked session as read or unread |
| `session/isArchivedChanged` | **Yes** | Client archived or unarchived session |
| `session/configChanged` | **Yes** | Mutable session config values changed |
| `session/metaChanged` | No | The session's `_meta` side-channel was replaced |

### Server & Active-Client Tools

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/serverToolsChanged` | No | Server-provided tool list changed (full replacement) |
| `session/activeClientChanged` | **Yes** | A client claims (or releases) the active role, with its tools and customizations |
| `session/activeClientToolsChanged` | **Yes** | The active client's tool list changed (full replacement) |

See [Customizations & Client Tools](/guide/customizations) for the full flow.

### Pending Messages

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/pendingMessageSet` | **Yes** | A steering or queued message was set (upsert) |
| `session/pendingMessageRemoved` | **Yes** | A pending message was cancelled (by client) or consumed (by server) |
| `session/queuedMessagesReordered` | **Yes** | Queued messages were reordered |

The `pendingMessageSet` and `pendingMessageRemoved` actions carry a `kind` discriminant (`'steering'` or `'queued'`). See the [State Model — Pending Messages](/guide/state-model#pending-messages) for semantics.

### Input Requests

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/inputRequested` | No | Server requested structured input from the user (upsert) |
| `session/inputAnswerChanged` | **Yes** | Client updated a single draft / submitted / skipped answer |
| `session/inputCompleted` | **Yes** | Client accepted, declined, or cancelled an input request |

See [Elicitation](/guide/elicitation) for the request lifecycle.

### Customizations

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/customizationsChanged` | No | Server updated the session's customization list (full replacement) |
| `session/customizationToggled` | **Yes** | Client toggled a customization on or off by URI |

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

## Client-Dispatched Actions

Clients interact with the server by dispatching actions as fire-and-forget notifications:

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-session:/<uuid>",
    "clientSeq": 1,
    "action": { "type": "session/turnStarted", "turnId": "t1", ... }
  }
}
```

The client applies the action **optimistically** to its local state before sending. When the server echoes it back in an `ActionEnvelope`, the client reconciles (see [Write-Ahead Reconciliation](/guide/reconciliation)).

| Action | Server-side effect |
|---|---|
| `session/turnStarted` | Begins agent processing for the new turn |
| `session/toolCallConfirmed` | Approves or denies a pending tool call; unblocks or cancels tool execution |
| `session/turnCancelled` | Aborts the in-progress turn |
| `session/titleChanged` | Updates the session title (rename) |
| `session/modelChanged` | Changes the model for subsequent turns |
| `session/pendingMessageSet` | Stores a steering or queued message (upsert); if queued and idle, auto-starts a turn |
| `session/pendingMessageRemoved` | Cancels a pending message before it is consumed |
| `session/queuedMessagesReordered` | Reorders queued messages; unknown IDs ignored, unmentioned messages kept at end |
| `session/customizationToggled` | Toggles a customization on or off by URI |
| `session/isReadChanged` | Marks the session as read or unread |
| `session/isArchivedChanged` | Archives or unarchives the session |
| `session/activityChanged` | Updates the session's current activity description |

## Reducers

State is mutated by pure reducer functions — one per state-bearing channel type:

```typescript
rootReducer(state: RootState, action: RootAction): RootState
sessionReducer(state: SessionState, action: SessionAction): SessionState
terminalReducer(state: TerminalState, action: TerminalAction): TerminalState
```

The reducer for a given action envelope is selected by the URI scheme of `envelope.channel`. Reducers are **pure** — no side effects, no I/O. The same reducer code runs on both server and client, which is what makes write-ahead possible. Server-side effects (e.g. forwarding a message to the agent SDK) are handled by a separate dispatch layer, not in the reducer.

The reducer `switch` on action `type` is exhaustive — the compiler errors if a case is missing. This guarantees that every action type is handled.

## Next Steps

- [Channels & Subscriptions](/specification/subscriptions) — How channels and the action envelope route mutations.
- [Write-Ahead Reconciliation](/guide/reconciliation) — How clients stay in sync.
- [Actions Reference](/reference/actions) — Complete action type definitions.
- [State Model](/guide/state-model) — The state tree these actions mutate.
