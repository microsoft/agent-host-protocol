# Lifecycle

The lifecycle defines how AHP connections are established, sessions are created and managed, and shutdown occurs.

## Connection Handshake

The client initiates the connection with an `initialize` **request**. The server responds with the protocol version and initial state snapshots:

```
1. Client → Server:  initialize(protocolVersion, clientId, initialSubscriptions?, locale?)
2. Server → Client:  { protocolVersion, serverSeq, snapshots[], defaultDirectory? }
```

### Initialize (Client → Server)

`initialize` is a JSON-RPC **request** — the server MUST respond with a result or error.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientId": "client-abc",
    "initialSubscriptions": ["agenthost:/root"],
    "locale": "en-US"
  }
}
```

`initialSubscriptions` allows the client to subscribe to root state (and any previously-open sessions) in the same round-trip as the handshake.

`locale` is an optional IETF BCP 47 language tag (e.g. `"en-US"`, `"ja"`) indicating the client's preferred language. The server SHOULD use this to localise user-facing strings such as confirmation option labels.

### Initialize Response (Server → Client)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "serverSeq": 42,
    "defaultDirectory": "file:///home/testuser",
    "snapshots": [
      {
        "resource": "agenthost:/root",
        "state": { "agents": [...] },
        "fromSeq": 42
      }
    ]
  }
}
```

The `protocolVersion` in the response tells the client what version the server speaks. The client derives `ProtocolCapabilities` from this and gates feature usage accordingly.

If present, `defaultDirectory` provides a server-local starting location for remote filesystem browsing.

If the server cannot accept the connection (e.g. unsupported protocol version), it MUST return a JSON-RPC error. See [Error Codes](/reference/error-codes) for defined codes.

## Authentication

Agents MAY declare `protectedResources` in their [`AgentInfo`](/reference/state-types#agentinfo). Before interacting with a session backed by such an agent, the client SHOULD authenticate by obtaining a Bearer token from the declared authorization server(s) and pushing it via the [`authenticate`](/reference/commands#authenticate) command.

If a client attempts to create or use a session with an agent that requires authentication and has not yet provided a token, the server SHOULD return error code `-32007` (`AuthRequired`) with the required resource metadata in the error's `data` field.

See [Authentication](/specification/authentication) for the full specification.

## Session Creation

```
1. Client picks a session URI (e.g. copilot:/<new-uuid>)
2. Client sends createSession(uri, config) command
3. Client sends subscribe(uri) — can be batched with the command
4. Server creates session with lifecycle: 'creating', sends snapshot
5. Server asynchronously initializes the agent backend
6. On success: server dispatches session/ready action
7. On failure: server dispatches session/creationFailed action
8. Server broadcasts notify/sessionAdded to all clients
```

The session URI scheme is the provider name and the path is the session ID: `copilot:/<uuid>`.

## Active Session

Once a session reaches `lifecycle: 'ready'`, the session is active:

- The client MAY dispatch `session/turnStarted` to begin a turn.
- The server streams back `session/delta`, `session/toolStart`, `session/permissionRequest`, and other actions.
- The client MAY dispatch `session/permissionResolved` or `session/turnCancelled`.
- The server dispatches `session/turnComplete` or `session/error` when the turn ends.
- The server MAY dispatch `session/inputRequested` while a turn is active. Clients sync answer drafts with `session/inputAnswerChanged` and finish the request with `session/inputCompleted`.

All actions MUST be scoped to the session URI and reference a valid turn ID when applicable.

## Server Validation of Client Actions

When the server receives a client-dispatched action, it MUST validate it before applying. Invalid actions MUST be echoed back with a `rejectionReason`. The following validation rules apply:

| Action | Condition | Server Behavior |
|---|---|---|
| Any action referencing a non-existent session | Session URI not found | Server MUST silently ignore the action (no echo) |
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

## Session Disposal

```jsonc
// Client → Server (request)
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "disposeSession",
  "params": { "session": "copilot:/<uuid>" }
}
```

The server disposes the session and broadcasts a `notify/sessionRemoved` notification to all clients.

## Session Summary Updates

While a session is alive, its [summary](/guide/state-model#session-summary) may change in response to agent activity or client actions (for example, the title is auto-generated, the status transitions from `Idle` to `InProgress`, `modifiedAt` advances, or `diffs` accumulate). The server SHOULD broadcast a `notify/sessionSummaryChanged` notification to all connected clients whenever any mutable field of `SessionSummary` changes, carrying only the changed fields:

```json
{
  "jsonrpc": "2.0",
  "method": "notification",
  "params": {
    "notification": {
      "type": "notify/sessionSummaryChanged",
      "session": "copilot:/<uuid>",
      "changes": {
        "title": "Refactor auth middleware",
        "status": 8,
        "modifiedAt": 1710000123456
      }
    }
  }
}
```

This lets clients that maintain a cached session list (for example, from a previous `listSessions()` call) patch their entries in place without subscribing to every session URI. Identity fields (`resource`, `provider`, `createdAt`) never change and are not carried.

Servers MAY coalesce or debounce this notification for noisy fields — for example, rapid `modifiedAt` bumps while a turn is streaming, or frequent `diffs` updates during an edit burst — at their discretion. Like all protocol notifications, `notify/sessionSummaryChanged` is ephemeral and is **not** replayed on reconnect; clients should re-fetch via `listSessions()` when they reconnect.

## Reconnection

If the transport connection drops, the client reconnects and sends a `reconnect` **request**:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "reconnect",
  "params": {
    "clientId": "client-abc",
    "lastSeenServerSeq": 42,
    "subscriptions": ["agenthost:/root", "copilot:/<uuid>"]
  }
}
```

The server MUST include all replayed data in the response before returning. If the server can replay from the requested sequence, it returns the missed action envelopes:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "type": "replay",
    "actions": [
      { "action": { "type": "session/delta", ... }, "serverSeq": 43 },
      { "action": { "type": "session/delta", ... }, "serverSeq": 44 }
    ],
    "missing": ["copilot:/<disposed-uuid>"]
  }
}
```

The `missing` array lists subscriptions from the request that the server cannot resume — for example, sessions or terminals that have been disposed, or resources the client is no longer permitted to observe. Clients SHOULD drop these from their local subscription set.

If the gap exceeds the replay buffer, the server sends fresh snapshots instead:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "type": "snapshot",
    "snapshots": [
      { "resource": "agenthost:/root", "state": { ... }, "fromSeq": 50 },
      { "resource": "copilot:/<uuid>", "state": { ... }, "fromSeq": 50 }
    ]
  }
}
```

Protocol notifications are **not** replayed — the client SHOULD re-fetch the session list via `listSessions()`.

## Unexpected Disconnection

If the server process terminates unexpectedly:

- The host environment SHOULD treat the server as terminated.
- The host MAY attempt to restart the server (e.g. crash recovery with automatic restart).
- In-progress turns SHOULD be considered failed.
- On restart, clients reconnect using the reconnection flow above.
