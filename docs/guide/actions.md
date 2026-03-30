# Actions

Actions are the sole mutation mechanism for subscribable state. They form a discriminated union keyed by `type`. Every action is wrapped in an `ActionEnvelope` for sequencing and origin tracking.

## Action Envelope

```typescript
ActionEnvelope {
  action: Action
  serverSeq: number                                     // monotonic, assigned by server
  origin: { clientId: string, clientSeq: number } | undefined  // undefined = server-originated
  rejectionReason?: string                              // present when the server rejected the action
}
```

- `serverSeq` — Monotonically increasing sequence number assigned by the server, used for ordering and replay.
- `origin` — Identifies who produced this action. `undefined` means the server itself (e.g. from an agent backend). Otherwise identifies the client that dispatched it.
- `rejectionReason` — When present, indicates the server rejected the action. The client should revert its optimistic prediction. Contains a human-readable explanation (e.g. `"no active turn to cancel"`, `"unknown permission request ID"`).

## Root Actions

These mutate the root state. **All root actions are server-only** — clients observe them but cannot produce them.

| Type | Payload | When |
|---|---|---|
| `root/agentsChanged` | `AgentInfo[]` | Available agent backends or their models changed |

## Session Actions

All scoped to a session URI. Some are server-only (produced by the agent backend), others can be dispatched directly by clients.

When a client dispatches an action, the server applies it to the state and also reacts to it as a side effect (e.g. `session/turnStarted` triggers agent processing, `session/turnCancelled` aborts it). This avoids a separate command→action translation layer for the common interactive cases.

### Lifecycle

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/ready` | No | Session backend initialized successfully |
| `session/creationFailed` | No | Session backend failed to initialize |

### Turn Lifecycle

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/turnStarted` | **Yes** | User sent a message; server starts processing |
| `session/delta` | No | Streaming text chunk appended to a response part by `partId` |
| `session/responsePart` | No | New response part created (markdown, reasoning, content ref) |
| `session/turnComplete` | No | Turn finished (assistant idle) |
| `session/turnCancelled` | **Yes** | Turn was aborted; server stops processing |
| `session/error` | No | Error during turn processing |

### Tool Calls

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/toolStart` | No | Tool execution began |
| `session/toolComplete` | No | Tool execution finished |

::: tip FUTURE WORK
A `session/toolUpdate` action for streaming incremental tool output (e.g. terminal output during a shell command) is planned for a future protocol version.
:::\n\n### Metadata & Informational

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/titleChanged` | **Yes** | Session title updated (auto-generated or client rename) |
| `session/usage` | No | Token usage report |
| `session/reasoning` | No | Reasoning/thinking text appended to a reasoning part by `partId` |
| `session/modelChanged` | **Yes** | Model changed for this session |

### Pending Messages

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/pendingMessageSet` | **Yes** | A steering or queued message was set (upsert) |
| `session/pendingMessageRemoved` | **Yes** | A pending message was cancelled (by client) or consumed (by server) |
| `session/queuedMessagesReordered` | **Yes** | Queued messages were reordered |

The `pendingMessageSet` and `pendingMessageRemoved` actions carry a `kind` discriminant (`'steering'` or `'queued'`). See the [State Model — Pending Messages](/guide/state-model#pending-messages) for semantics.

### Customizations

| Type | Client-dispatchable? | When |
|---|---|---|
| `session/customizationsChanged` | No | Server updated the session's customization list (full replacement) |
| `session/customizationToggled` | **Yes** | Client toggled a customization on or off by URI |

See the [Customizations guide](/guide/customizations) for the full flow.

## Client-Dispatched Actions

Clients interact with the server by dispatching actions as fire-and-forget notifications:

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 1,
    "action": { "type": "session/turnStarted", "session": "copilot:/<uuid>", ... }
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

## Reducers

State is mutated by pure reducer functions:

```typescript
rootReducer(state: RootState, action: RootAction): RootState
sessionReducer(state: SessionState, action: SessionAction): SessionState
```

Reducers are **pure** — no side effects, no I/O. The same reducer code runs on both server and client, which is what makes write-ahead possible. Server-side effects (e.g. forwarding a message to the agent SDK) are handled by a separate dispatch layer, not in the reducer.

The reducer `switch` on action `type` is exhaustive — the compiler errors if a case is missing. This guarantees that every action type is handled.

## Next Steps

- [Write-Ahead Reconciliation](/guide/reconciliation) — How clients stay in sync.
- [Actions Reference](/reference/actions) — Complete action type definitions.
- [State Model](/guide/state-model) — The state tree these actions mutate.
