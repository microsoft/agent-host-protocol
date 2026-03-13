# State Model

All state in AHP is identified by URIs. Clients subscribe to a URI to receive its current state snapshot and subsequent action updates. This is the single universal mechanism for state synchronization.

## Root State

Subscribable at `agenthost:/root`. Contains global, lightweight data that all clients need. **Does not contain the session list** — that is fetched imperatively via RPC (see [Commands](/reference/commands)).

```typescript
RootState {
  agents: AgentInfo[]
}
```

Each `AgentInfo` includes the models available for that agent:

```typescript
AgentInfo {
  provider: string         // e.g. 'copilot'
  displayName: string
  description: string
  models: ModelInfo[]
}

ModelInfo {
  id: string
  provider: string
  name: string
  maxContextWindow?: number
  supportsVision?: boolean
  policyState?: 'enabled' | 'disabled' | 'unconfigured'
}
```

Root state is mutated only by server-originated actions (e.g. `root/agentsChanged`).

## Session State

Subscribable at the session's URI (e.g. `copilot:/<uuid>`). Contains the full state for a single session.

```typescript
SessionState {
  summary: SessionSummary
  lifecycle: 'creating' | 'ready' | 'creationFailed'
  creationError?: ErrorInfo
  turns: Turn[]
  activeTurn: ActiveTurn | undefined
}
```

### Lifecycle

The `lifecycle` field tracks the asynchronous creation process. When a client creates a session, it picks a URI, sends the command, and subscribes immediately. The initial snapshot has `lifecycle: 'creating'`. The server asynchronously initializes the backend and dispatches `session/ready` or `session/creationFailed`.

### Session Summary

Lightweight metadata used in the session list and embedded within session state:

```typescript
SessionSummary {
  resource: URI
  provider: string
  title: string
  status: 'idle' | 'in-progress' | 'error'
  createdAt: number
  modifiedAt: number
  model?: string
}
```

## Turns

A turn represents one request/response cycle between user and agent.

### Completed Turn

```typescript
Turn {
  id: string
  userMessage: UserMessage
  responseText: string              // captured from streamingText on completion
  responseParts: ResponsePart[]
  toolCalls: CompletedToolCall[]
  usage: UsageInfo | undefined
  state: 'complete' | 'cancelled' | 'error'
  error?: ErrorInfo
}
```

### Active Turn

An in-progress turn where the assistant is actively streaming:

```typescript
ActiveTurn {
  id: string
  userMessage: UserMessage
  streamingText: string
  responseParts: ResponsePart[]
  toolCalls: Record<toolCallId, ToolCallState>
  pendingPermissions: Record<requestId, PermissionRequest>
  reasoning: string
  usage: UsageInfo | undefined
}
```

### User Messages

```typescript
UserMessage {
  text: string
  attachments?: MessageAttachment[]
}

MessageAttachment {
  type: 'file' | 'directory' | 'selection'
  path: string
  displayName?: string
}
```

## Response Parts

Response content comes in two forms:

```typescript
// Inline markdown content
MarkdownResponsePart {
  kind: 'markdown'
  content: string
}

// Reference to large content stored outside the state tree
ContentRef {
  kind: 'contentRef'
  uri: string              // scheme://sessionId/contentId
  sizeHint?: number
  mimeType?: string
}
```

Clients fetch `ContentRef` content separately via the `fetchContent(uri)` command. This keeps the state tree small and serializable.

## Tool Calls

Tool calls track the full lifecycle of a tool invocation:

```typescript
ToolCallState {
  toolCallId: string
  toolName: string
  displayName: string
  invocationMessage: string
  toolInput?: string
  toolKind?: 'terminal'
  language?: string
  toolArguments?: string
  status: 'running' | 'pending-permission' | 'completed' | 'failed' | 'cancelled'
  parameters?: unknown
  confirmed?: 'not-needed' | 'user-action' | 'setting' | 'denied' | 'skipped'
  pastTenseMessage?: string
  toolOutput?: string
  error?: { message: string; code?: string }
  cancellationReason?: 'denied' | 'skipped'
}
```

When a turn completes, active `ToolCallState` entries are converted to `CompletedToolCall` records in the finalized turn.

## Permission Requests

Tools that require user approval generate permission requests:

```typescript
PermissionRequest {
  requestId: string
  permissionKind: 'shell' | 'write' | 'mcp' | 'read' | 'url'
  toolCallId?: string
  path?: string
  fullCommandText?: string
  intention?: string
  serverName?: string
  toolName?: string
  rawRequest?: string
}
```

## Usage Info

Token usage reported per turn:

```typescript
UsageInfo {
  inputTokens?: number
  outputTokens?: number
  model?: string
  cacheReadTokens?: number
}
```

## Session List

The session list can be arbitrarily large and is **not** part of the state tree. Instead:

- Clients fetch the list imperatively via `listSessions()` RPC.
- The server sends lightweight **notifications** (`sessionAdded`, `sessionRemoved`) so connected clients can update a local cache without re-fetching.

Notifications are ephemeral — not processed by reducers, not stored in state, not replayed on reconnect. On reconnect, clients re-fetch the list.

## Next Steps

- [Actions](/guide/actions) — How state is mutated.
- [Write-Ahead Reconciliation](/guide/reconciliation) — How clients stay in sync.
- [State Types Reference](/reference/state-types) — Complete type definitions.
