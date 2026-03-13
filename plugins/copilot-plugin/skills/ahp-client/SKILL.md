---
description: >-
  Interact with an Agent Host Protocol (AHP) server via WebSocket.
  Use when asked to connect to, message, or control an AHP server.
---

# Agent Host Protocol – Copilot Skill

You have access to an MCP server (`ahp-websocket`) that lets you connect to an
Agent Host Protocol server over WebSocket and exchange JSON-RPC 2.0 messages.

## Available MCP tools

| Tool                | Purpose |
|---------------------|---------|
| `connect`           | Open (or re-open) a WebSocket to an AHP server URL |
| `send`              | Send a JSON-RPC message and get the response + any pending notifications |
| `get_notifications` | Drain the notification inbox (optionally wait N seconds first) |
| `status`            | Check connection state, pending request count, inbox depth |
| `next_id`           | Get a unique incrementing integer for JSON-RPC request `id` fields |

## Quick-start workflow

```
1. connect(url: "ws://localhost:3000")
2. send initialize notification
3. wait for serverHello via get_notifications
4. subscribe to root state
5. create a session, subscribe, send turns
```

## Protocol overview

AHP is a **Redux-inspired state synchronisation protocol** built on JSON-RPC 2.0
over WebSocket. The server maintains an authoritative state tree; clients apply
actions optimistically and reconcile with the server's echoed actions.

Key concepts:
- **Root state** (`agenthost:/root`) – lists available agents/models.
- **Session state** (`<provider>:/<uuid>`) – per-conversation state with turns,
  deltas, tool calls, and permissions.
- **Actions** – the sole mutation mechanism, wrapped in `ActionEnvelope`s with a
  `serverSeq`.
- **Subscriptions** – clients subscribe to URI-identified state resources to
  receive action streams.
- **Notifications** – ephemeral broadcasts (session added/removed) that are NOT
  part of the state tree and NOT replayed on reconnect.

## Connection lifecycle

### 1. Initialize

Send an `initialize` **notification** (no `id` field):

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientId": "<unique-client-id>",
    "initialSubscriptions": ["agenthost:/root"]
  }
}
```

Then call `get_notifications(wait: 2)` to collect the `serverHello` response,
which includes snapshots for any initial subscriptions.

### 2. Subscribe to state

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscribe",
  "params": { "resource": "agenthost:/root" }
}
```

The response contains the current state snapshot.
After subscribing, subsequent mutations arrive as `action` notifications.

### 3. Create a session

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "createSession",
  "params": {
    "session": "<provider>:/<uuid>",
    "provider": "<provider>",
    "model": "<model-id>"
  }
}
```

Then subscribe to the session URI. Wait for a `session/ready` action.

### 4. Send a message (start a turn)

Dispatch a `session/turnStarted` action as a **notification** (fire-and-forget):

```json
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 1,
    "action": {
      "type": "session/turnStarted",
      "session": "<provider>:/<uuid>",
      "turnId": "<unique-turn-id>",
      "userMessage": { "text": "Hello, world!" }
    }
  }
}
```

Then poll `get_notifications(wait: 2)` to collect streaming `session/delta`
actions until you see `session/turnComplete`.

### 5. Handle tool calls and permissions

If the agent calls a tool, the server sends:
- `session/toolStart` – tool invocation started
- `session/permissionRequest` – user approval needed

Resolve permissions with:

```json
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 2,
    "action": {
      "type": "session/permissionResolved",
      "session": "<provider>:/<uuid>",
      "turnId": "<turn-id>",
      "requestId": "<perm-request-id>",
      "approved": true
    }
  }
}
```

### 6. Other commands

| Command             | Purpose |
|---------------------|---------|
| `listSessions`      | List all session summaries |
| `disposeSession`    | Tear down a session |
| `fetchContent`      | Fetch large content by URI reference |
| `fetchTurns`        | Fetch historical turns for a session |

### 7. Reconnection

If the connection drops, call `connect` again and send a `reconnect` message
instead of `initialize`:

```json
{
  "jsonrpc": "2.0",
  "method": "reconnect",
  "params": {
    "clientId": "<same-client-id>",
    "lastSeenServerSeq": 42,
    "subscriptions": ["agenthost:/root", "<provider>:/<uuid>"]
  }
}
```

## Action types reference

### Client-dispatchable actions
| Action                       | Effect |
|------------------------------|--------|
| `session/turnStarted`        | Begin a new turn with a user message |
| `session/permissionResolved` | Approve or deny a pending tool permission |
| `session/turnCancelled`      | Abort an in-progress turn |
| `session/modelChanged`       | Switch the model for future turns |

### Server-originated actions
| Action                       | Meaning |
|------------------------------|---------|
| `root/agentsChanged`         | Available agents or models changed |
| `session/ready`              | Session backend initialized |
| `session/creationFailed`     | Session failed to initialize |
| `session/delta`              | Streaming text content for a turn |
| `session/toolStart`          | Agent is calling a tool |
| `session/toolDelta`          | Streaming tool output |
| `session/toolComplete`       | Tool execution finished |
| `session/permissionRequest`  | User approval needed for a tool |
| `session/turnComplete`       | Turn finished |
| `session/error`              | Error during turn |

## Full documentation

For complete protocol details, refer to the docs in this repository:

- **Guide**: `docs/guide/` – conceptual overviews and walkthroughs
  - `getting-started.md` – end-to-end example
  - `state-model.md` – full state tree shape
  - `actions.md` – how actions work
  - `reconciliation.md` – write-ahead reconciliation algorithm
- **Specification**: `docs/specification/` – normative protocol spec
  - `transport.md` – transport requirements
  - `lifecycle.md` – connection, session, and reconnection lifecycle
  - `subscriptions.md` – subscription mechanics
  - `versioning.md` – version negotiation
- **Reference**: `docs/reference/` – complete type references
  - `messages.md` – all state types
  - `actions.md` – all action types with fields
  - `commands.md` – all JSON-RPC commands
  - `notifications.md` – all notification types
  - `error-codes.md` – error code reference

Read these files when you need exact field names, type shapes, or edge-case
behaviour.
