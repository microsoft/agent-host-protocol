# Elicitation

The agent can request structured input from the user by storing live input requests in per-chat state (`ChatState.inputRequests`) on the [chat channel](/specification/chat-channel). These requests are useful for MCP elicitation, URL-based review flows, and agent clarification questions.

Input requests are live state, not one-shot RPC prompts: every subscriber to the chat sees open requests and synchronized answer drafts.

## State Shape

```typescript
ChatState {
  // ...existing fields...
  inputRequests?: ChatInputRequest[]
}

ChatInputRequest {
  id: string
  message?: string
  url?: URI
  questions?: ChatInputQuestion[]
  answers?: Record<string, ChatInputAnswer>
}
```

Each request has a stable `id`. Each question has a stable `id` used as the key in `answers`.

## Request Lifecycle

The server SHOULD use this sequence when it needs user input to continue a turn:

1. Keep the turn active.
2. Dispatch `chat/inputRequested` with a stable request `id` and stable question IDs.
3. Observe zero or more client-dispatched `chat/inputAnswerChanged` actions. Each action updates one question's draft, submitted, or skipped answer.
4. Observe `chat/inputCompleted` with `response: 'accept'`, `'decline'`, or `'cancel'`.
5. Resume the blocked operation, such as completing an MCP `elicitation/create` request or returning a result for an ask-questions tool call.

Because drafts live in chat state, a user can answer one question on client A and another on client B; every subscriber to the chat observes the merged `answers` map.

## Status And Cleanup

While a chat has any open input request, that chat's `status` carries `SessionStatus.InputNeeded`, and the session's aggregated `status` is promoted to `InputNeeded` because a chat needs input. When the last request is completed and the turn is still active, the chat's status returns to `SessionStatus.InProgress`.

If the active turn completes, is cancelled, errors, or is truncated before input completes, the server SHOULD consider outstanding input requests abandoned. The reducer removes outstanding requests.

## Durable Record

When `chat/inputCompleted` resolves a request while a turn is active, the reducer removes the live request from `inputRequests` and appends an `InputRequestResponsePart` (`kind: 'inputRequest'`) to the active turn's `responseParts`. This mirrors how a resolved tool-call confirmation persists on its terminal `ToolCallState`: the decision becomes part of the durable, replayable transcript instead of vanishing with the ephemeral request.

The recorded part embeds the resolved `request` — carrying its `id`, `message`, `url`, `questions`, and the final `answers` (synced drafts overlaid by any `answers` supplied on `chat/inputCompleted`) — alongside the `response` (`accept`, `decline`, or `cancel`). All three outcomes are recorded, so a declined or cancelled prompt still leaves a trace a client can render after the fact.

Abandonment is the one case that records nothing: when a turn ends, is cancelled, errors, or is truncated, outstanding requests are dropped without a transcript part, because no user decision was reached.

## Questions And Answers

Each question is a discriminated union by `kind`:

| Question kind | Answer value shape |
|---|---|
| `text` | `{ kind: 'text', value: string }` |
| `number` / `integer` | `{ kind: 'number', value: number }` |
| `boolean` | `{ kind: 'boolean', value: boolean }` |
| `single-select` | `{ kind: 'selected', value: optionId, freeformValues?: string[] }` |
| `multi-select` | `{ kind: 'selected-many', value: optionIds[], freeformValues?: string[] }` |

`ChatInputAnswer.state` distinguishes draft/submitted answers (`ChatInputAnswered`) from skipped answers (`ChatInputSkipped`). Draft answers are for multi-client synchronization; submitted answers are ready for the server to consume when the request completes.

## URL Requests

An input request may include `url` instead of, or in addition to, structured questions. Clients can open the URL or present it for review, then complete the request with `chat/inputCompleted`.

## Validation

Servers SHOULD reject client-dispatched input actions when:

| Action | Condition |
|---|---|
| `chat/inputAnswerChanged` | No input request has the matching `requestId`. |
| `chat/inputAnswerChanged` | `answer.state` requires a value but `answer.value` is absent, or the value kind does not match the answer payload. |
| `chat/inputCompleted` | No input request has the matching `requestId`. |
| `chat/inputCompleted` | `response` is `'accept'` but required questions do not have submitted answers. |

## Related Reference

- [Chat Channel Reference](/reference/chat) — `ChatInputRequest`, `ChatInputQuestion`, answer value types, and the `chat/input*` action variants.
- [Chat Channel](/specification/chat-channel) — Per-chat turns, active turn, tool calls, and client-action validation.
