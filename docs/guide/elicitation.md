# Elicitation

The agent can request structured input from the user by inserting an `InputRequestResponsePart` into the active turn on the [chat channel](/specification/chat-channel). These requests are useful for MCP elicitation, URL-based review flows, and agent clarification questions.

Input requests are live response parts, not one-shot RPC prompts: every subscriber to the chat sees open requests and synchronized answer drafts in their original response-stream position.

## State Shape

```typescript
InputRequestResponsePart {
  kind: 'inputRequest'
  request: {
    id: string
    message?: string
    url?: URI
    questions?: ChatInputQuestion[]
    answers?: Record<string, ChatInputAnswer>
  }
  response?: 'accept' | 'decline' | 'cancel'
}
```

The part lives in `ChatState.activeTurn.responseParts` while the turn is active, then moves unchanged into the completed turn. Each request has a stable `id`. Each question has a stable `id` used as the key in `answers`. An absent `response` means the request is still awaiting submission.

## Request Lifecycle

The server SHOULD use this sequence when it needs user input to continue a turn:

1. Keep the turn active.
2. Dispatch `chat/inputRequested` with a stable request `id` and stable question IDs. The reducer inserts an unresolved input-request part at the current end of the response stream.
3. Observe zero or more client-dispatched `chat/inputAnswerChanged` actions. Each action updates one question's draft, submitted, or skipped answer.
4. Observe `chat/inputCompleted` with `response: 'accept'`, `'decline'`, or `'cancel'`. The reducer sets `response` and any final answers on that same part.
5. Resume the blocked operation, such as completing an MCP `elicitation/create` request or returning a result for an ask-questions tool call.

Because drafts live in the response part, a user can answer one question on client A and another on client B; every subscriber to the chat observes the merged `answers` map.

## Status And Cleanup

While the active turn has any input-request part without a `response`, that chat's `status` carries `SessionStatus.InputNeeded`, and the session's aggregated `status` is promoted to `InputNeeded` because a chat needs input. When the last request receives a response and the turn is still active, the chat's status returns to `SessionStatus.InProgress`.

If the active turn completes, is cancelled, or errors before input is submitted, the unresolved part remains in the completed transcript with `response` absent. Truncating the active turn removes it along with every other response part in that turn.

## Durable Record

`InputRequestResponsePart` is both the live interaction and its durable record. `chat/inputRequested` inserts it into the active turn, answer changes update it in place, and `chat/inputCompleted` sets its final `response` and answers without moving it. This mirrors how a tool-call confirmation remains on its `ToolCallResponsePart` throughout the lifecycle.

The part embeds the request's `id`, `message`, `url`, `questions`, and current `answers`. On completion, any `answers` supplied by `chat/inputCompleted` overlay synchronized drafts. All three submitted outcomes are recorded, while an unanswered prompt remains distinguishable by its absent `response`.

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
| `chat/inputAnswerChanged` | No unresolved input-request part has the matching `requestId` in the active turn. |
| `chat/inputAnswerChanged` | `answer.state` requires a value but `answer.value` is absent, or the value kind does not match the answer payload. |
| `chat/inputCompleted` | No unresolved input-request part has the matching `requestId` in the active turn. |
| `chat/inputCompleted` | `response` is `'accept'` but required questions do not have submitted answers. |

## Related Reference

- [Chat Channel Reference](/reference/chat) — `InputRequestResponsePart`, `ChatInputRequest`, question and answer value types, and the `chat/input*` action variants.
- [Chat Channel](/specification/chat-channel) — Per-chat turns, active turn, tool calls, and client-action validation.
