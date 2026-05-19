# Session Channel

A session channel carries the full state of a single agent conversation: turns, streaming responses, tool calls, pending messages, input requests, customizations, and per-session configuration. One session channel exists per session for as long as the session is alive.

## URI

```
ahp-session:/<uuid>
```

The path is a server-unique identifier (typically a UUID) chosen by the client at creation time. The session's provider (e.g. `"copilot"`) is **not** encoded in the URI scheme — it is carried on [`SessionSummary.provider`](/reference/state-types#sessionsummary). This decoupling lets the same scheme address sessions backed by any agent.

Multiple session channels may be active simultaneously. Clients subscribe to each one whose state they want to track.

## State

Subscribers receive a [`SessionState`](/reference/state-types#sessionstate) snapshot containing the session summary, lifecycle phase, history of completed turns, the active turn (if any), pending messages, outstanding input requests, model and active-client state, and other per-session fields. Refer to the [State Model guide](/guide/state-model) for a structural overview.

## Lifecycle

```
1. Client picks a session URI (e.g. ahp-session:/<new-uuid>)
2. Client sends createSession(uri, config) command
3. Client sends subscribe(uri) — MAY be batched with the command
4. Server creates session with lifecycle: 'creating', returns the snapshot
5. Server asynchronously initialises the agent backend
6. On success: server dispatches session/ready
7. On failure: server dispatches session/creationFailed
8. Server broadcasts root/sessionAdded to clients subscribed to ahp-root://
```

### Creation

[`createSession`](/reference/commands#createsession) is a JSON-RPC request. The client picks the URI; the server allocates session state and begins backend initialisation. If the URI is already in use the server returns `SessionAlreadyExists` (`-32003`).

### Active session

Once a session reaches `lifecycle: 'ready'`, it accepts turns:

- The client dispatches `session/turnStarted` to begin a turn.
- The server streams `session/delta`, `session/responsePart`, `session/toolCallStart`, `session/toolCallReady`, and related actions.
- The client dispatches `session/toolCallConfirmed` / `session/toolCallResultConfirmed` to approve or deny tool calls, or `session/turnCancelled` to abort.
- The server dispatches `session/turnComplete` or `session/error` when the turn ends.
- The server MAY dispatch `session/inputRequested` while a turn is active. Clients sync answer drafts with `session/inputAnswerChanged` and finish the request with `session/inputCompleted`.

All actions dispatched on this channel travel on `ActionEnvelope`s whose `channel` is the session URI. Action payloads do NOT carry their own session URI — the channel comes from the envelope.

### Disposal

```jsonc
// Client → Server (request)
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "disposeSession",
  "params": { "channel": "ahp-session:/<uuid>" }
}
```

The server tears down the session backend, drops associated subscriptions, and broadcasts `root/sessionRemoved` to clients subscribed to `ahp-root://`.

## Server Validation of Client Actions

When the server receives a client-dispatched action on this channel, it MUST validate it before applying. Invalid actions MUST be echoed back with a `rejectionReason` on the `ActionEnvelope`. The following validation rules apply:

| Action | Condition | Server Behavior |
|---|---|---|
| Any action referencing a non-existent session | Channel URI not found | Server MUST silently ignore the action (no echo) |
| `session/toolCallConfirmed` | Tool call not in `pending-confirmation` state | Server MUST reject the action |
| `session/turnCancelled` | No active turn | Server MUST reject the action |
| `session/modelChanged` | A turn is currently active | Server MUST defer the model change until the active turn completes, then apply it for the next turn |
| `session/inputAnswerChanged` | No input request with matching `requestId` | Server SHOULD reject the action |
| `session/inputAnswerChanged` | `answer.state` requires a value but `answer.value` is absent, or `answer.value.kind` is missing the matching payload field | Server SHOULD reject the action |
| `session/inputCompleted` | No input request with matching `requestId` | Server SHOULD reject the action |
| `session/inputCompleted` | `response` is `'accept'` but required questions do not have submitted answers | Server SHOULD reject the action |
| `session/pendingMessageRemoved` | No pending message with matching `id` and `kind` | Server SHOULD reject the action |

## Pending Message Consumption

The server consumes pending messages according to their kind:

### Queued Messages

When a turn completes and `queuedMessages` is non-empty, the server SHOULD:

1. Dispatch `session/pendingMessageRemoved` with `kind: 'queued'` for the first queued message.
2. Dispatch `session/turnStarted` with the queued message's `userMessage` and `queuedMessageId` set to the message's `id`.

When a queued message is added while the session is idle (no active turn), the server SHOULD immediately consume it using the same two-step sequence.

### Steering Messages

When a turn is active and `steeringMessages` is non-empty, the server MAY consume steering messages at its discretion. To consume a steering message, the server:

1. Dispatches `session/pendingMessageRemoved` with `kind: 'steering'`.
2. Injects the message content into the model context (the injection mechanism is opaque to the protocol).

Steering messages added while idle are silently stored and consumed when a turn becomes active.

## Commands

Session-scoped commands:

- [`createSession`](/reference/commands#createsession) — create a new session
- [`disposeSession`](/reference/commands#disposesession) — dispose an existing session
- [`listSessions`](/reference/commands#listsessions) — fetch summaries for all sessions
- [`fetchTurns`](/reference/commands#fetchturns) — lazy-load historical turns
- [`resolveSessionConfig`](/reference/commands#resolvesessionconfig) — iteratively resolve the session config schema before creation
- [`sessionConfigCompletions`](/reference/commands#sessionconfigcompletions), [`completions`](/reference/commands#completions) — value completions inside a session

## Actions

Refer to [Actions](/reference/actions) for the full per-action reference. All session-scoped action envelopes carry `channel: "ahp-session:/<uuid>"`.

## Catalogue Notifications

Session catalogue events (creation, disposal, summary mutations) are emitted on the [Root Channel](/specification/root-channel#protocol-notifications), not on the session channel itself. This lets clients track the session list without subscribing to every session.
