# Actions Reference

Complete reference for all action types in the Agent Host Protocol. Actions are the sole mutation mechanism for subscribable state.

## Action Envelope

Every action is wrapped in an `ActionEnvelope`:

```typescript
interface IActionEnvelope {
  readonly action: IStateAction;
  readonly serverSeq: number;
  readonly origin: { clientId: string; clientSeq: number } | undefined;
  readonly rejectionReason?: string;
}
```

## Root Actions

Mutate `RootState`. All are server-only.

### `root/agentsChanged`

Fired when available agent backends or their models change.

| Field | Type | Description |
|---|---|---|
| `type` | `'root/agentsChanged'` | Discriminant |
| `agents` | `IAgentInfo[]` | Updated agent list |

## Session Actions

Mutate `SessionState`. Scoped to a session URI.

### `session/ready`

Session backend initialized successfully.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/ready'` | Discriminant |
| `session` | `URI` | Session URI |

### `session/creationFailed`

Session backend failed to initialize.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/creationFailed'` | Discriminant |
| `session` | `URI` | Session URI |
| `error` | `IErrorInfo` | Error details |

### `session/turnStarted`

**Client-dispatchable.** User sent a message; server starts agent processing.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/turnStarted'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `userMessage` | `IUserMessage` | User's message |

### `session/delta`

Streaming text chunk from the assistant.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/delta'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `content` | `string` | Text chunk |

### `session/responsePart`

Structured content appended to the response.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/responsePart'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `part` | `IResponsePart` | Response part (markdown or content ref) |

### `session/toolStart`

Tool execution began.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/toolStart'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `toolCall` | `IToolCallState` | Full tool call state |

### `session/toolComplete`

Tool execution finished.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/toolComplete'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `toolCallId` | `string` | Tool call to complete |
| `result` | `IToolCompleteResult` | Completion result |

#### `IToolCompleteResult`

| Field | Type | Required | Description |
|---|---|---|---|
| `success` | `boolean` | Yes | Whether the tool succeeded |
| `pastTenseMessage` | `string` | Yes | Past-tense description |
| `toolOutput` | `string` | No | Tool output text |
| `error` | `{ message: string; code?: string }` | No | Error details |

### `session/permissionRequest`

Permission needed from the user to proceed.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/permissionRequest'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `request` | `IPermissionRequest` | Permission request details |

### `session/permissionResolved`

**Client-dispatchable.** Permission granted or denied.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/permissionResolved'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `requestId` | `string` | Permission request ID |
| `approved` | `boolean` | Whether permission was granted |

### `session/turnComplete`

Turn finished — the assistant is idle.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/turnComplete'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |

### `session/turnCancelled`

**Client-dispatchable.** Turn was aborted; server stops processing.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/turnCancelled'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |

### `session/error`

Error during turn processing.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/error'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `error` | `IErrorInfo` | Error details |

### `session/titleChanged`

Session title updated (typically auto-generated from conversation).

| Field | Type | Description |
|---|---|---|
| `type` | `'session/titleChanged'` | Discriminant |
| `session` | `URI` | Session URI |
| `title` | `string` | New title |

### `session/usage`

Token usage report for a turn.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/usage'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `usage` | `IUsageInfo` | Token usage data |

### `session/reasoning`

Reasoning/thinking text from the model.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/reasoning'` | Discriminant |
| `session` | `URI` | Session URI |
| `turnId` | `string` | Turn identifier |
| `content` | `string` | Reasoning text chunk |

### `session/modelChanged`

**Client-dispatchable.** Model changed for this session.

| Field | Type | Description |
|---|---|---|
| `type` | `'session/modelChanged'` | Discriminant |
| `session` | `URI` | Session URI |
| `model` | `string` | New model ID |

## Version Introduction

All actions listed above were introduced in protocol version **1**.

| Action Type | Version |
|---|---|
| `root/agentsChanged` | 1 |
| `session/ready` | 1 |
| `session/creationFailed` | 1 |
| `session/turnStarted` | 1 |
| `session/delta` | 1 |
| `session/responsePart` | 1 |
| `session/toolStart` | 1 |
| `session/toolComplete` | 1 |
| `session/permissionRequest` | 1 |
| `session/permissionResolved` | 1 |
| `session/turnComplete` | 1 |
| `session/turnCancelled` | 1 |
| `session/error` | 1 |
| `session/titleChanged` | 1 |
| `session/usage` | 1 |
| `session/reasoning` | 1 |
| `session/modelChanged` | 1 |
