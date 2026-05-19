# Elicitation

Sessions can request structured input from the user by storing live input requests in top-level session state. These requests are useful for MCP elicitation, URL-based review flows, and agent clarification questions.

Input requests are live state, not one-shot RPC prompts: every subscriber sees open requests and synchronized answer drafts.

## State Shape

```typescript
SessionState {
  // ...existing fields...
  inputRequests?: SessionInputRequest[]
}

SessionInputRequest {
  id: string
  message: string
  url?: URI
  questions?: SessionInputQuestion[]
  answers?: Record<string, SessionInputAnswer>
}
```

Each request has a stable `id`. Each question has a stable `id` used as the key in `answers`.

## Request Lifecycle

The server SHOULD use this sequence when it needs user input to continue a turn:

1. Keep the turn active.
2. Dispatch `session/inputRequested` with a stable request `id` and stable question IDs.
3. Observe zero or more client-dispatched `session/inputAnswerChanged` actions. Each action updates one question's draft, submitted, or skipped answer.
4. Observe `session/inputCompleted` with `response: 'accept'`, `'decline'`, or `'cancel'`.
5. Resume the blocked operation, such as completing an MCP `elicitation/create` request or returning a result for an ask-questions tool call.

Because drafts live in session state, a user can answer one question on client A and another on client B; every subscriber observes the merged `answers` map.

## Status And Cleanup

While any input request is open, `summary.status` is `SessionStatus.InputNeeded`. When the last request is completed and the turn is still active, status returns to `SessionStatus.InProgress`.

If the active turn completes, is cancelled, errors, or is truncated before input completes, the server SHOULD consider outstanding input requests abandoned. The reducer removes outstanding requests.

## Questions And Answers

Each question is a discriminated union by `kind`:

| Question kind | Answer value shape |
|---|---|
| `text` | `{ kind: 'text', value: string }` |
| `number` / `integer` | `{ kind: 'number', value: number }` |
| `boolean` | `{ kind: 'boolean', value: boolean }` |
| `single-select` | `{ kind: 'selected', value: optionId, freeformValues?: string[] }` |
| `multi-select` | `{ kind: 'selected-many', value: optionIds[], freeformValues?: string[] }` |

`SessionInputAnswer.state` distinguishes draft/submitted answers from skipped answers. Draft answers are for multi-client synchronization; submitted answers are ready for the server to consume when the request completes.

## URL Requests

An input request may include `url` instead of, or in addition to, structured questions. Clients can open the URL or present it for review, then complete the request with `session/inputCompleted`.

## Validation

Servers SHOULD reject client-dispatched input actions when:

| Action | Condition |
|---|---|
| `session/inputAnswerChanged` | No input request has the matching `requestId`. |
| `session/inputAnswerChanged` | `answer.state` requires a value but `answer.value` is absent, or the value kind does not match the answer payload. |
| `session/inputCompleted` | No input request has the matching `requestId`. |
| `session/inputCompleted` | `response` is `'accept'` but required questions do not have submitted answers. |

## Related Reference

- [State Types](/reference/state-types) — `SessionInputRequest`, `SessionInputQuestion`, and answer value types.
- [Actions Reference](/reference/actions) — `session/inputRequested`, `session/inputAnswerChanged`, and `session/inputCompleted`.
- [Session Channel](/specification/session-channel) — Session creation, active turns, and client-action validation.
