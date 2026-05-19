# Getting Started

This guide walks through a basic client-server interaction using the Agent Host Protocol.

## Connection Handshake

Every AHP session starts with a JSON-RPC handshake over the transport (WebSocket, MessagePort, etc.):

```
1. Client → Server:  initialize(protocolVersions[], clientId, initialSubscriptions?)
2. Server → Client:  { protocolVersion, serverSeq, snapshots[], defaultDirectory? }
```

The `initialSubscriptions` field allows the client to subscribe to root state and any previously-open sessions in the same round-trip as the handshake. The server returns snapshots for each in the response. The optional `defaultDirectory` field gives clients a sensible starting point for remote filesystem browsing.

## Subscribing to State

After connecting, clients subscribe to URI-identified channels. Root state is always available at `ahp-root://`:

```jsonc
// Client → Server (request)
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscribe",
  "params": { "channel": "ahp-root://" }
}

// Server → Client (response)
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "snapshot": {
      "resource": "ahp-root://",
      "state": {
        "agents": [
          {
            "provider": "copilot",
            "displayName": "Copilot",
            "description": "GitHub Copilot agent",
            "models": [
              { "id": "gpt-4o", "name": "GPT-4o", "provider": "copilot" }
            ]
          }
        ]
      },
      "fromSeq": 5
    }
  }
}
```

After subscribing, the client receives all subsequent actions scoped to that channel via server-pushed notifications.

## Creating a Session

Session creation uses an imperative RPC command:

```jsonc
// 1. Client picks a session URI
// 2. Client sends createSession command
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "createSession",
  "params": {
    "channel": "ahp-session:/<uuid>",
    "provider": "copilot",
    "model": "gpt-4o"
  }
}

// 3. Client subscribes to the session URI
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "subscribe",
  "params": { "channel": "ahp-session:/<uuid>" }
}
```

The initial snapshot has `lifecycle: 'creating'`. The server asynchronously initializes the agent backend, then dispatches either a `session/ready` or `session/creationFailed` action.

## Sending a Message

To start a turn, the client dispatches a `session/turnStarted` action. This is a **write-ahead** action — the client applies it optimistically to its local state:

```jsonc
// Client → Server (notification, fire-and-forget)
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-session:/<uuid>",
    "clientSeq": 1,
    "action": {
      "type": "session/turnStarted",
      "turnId": "turn-1",
      "userMessage": { "text": "Explain this code" }
    }
  }
}
```

The server begins agent processing and streams back actions:

```jsonc
// Server → Client: streaming text delta
{ "method": "action", "params": {
  "channel": "ahp-session:/<uuid>",
  "action": { "type": "session/delta", "turnId": "turn-1", "partId": "p1", "content": "This code " },
  "serverSeq": 6
}}

// Server → Client: more streaming text
{ "method": "action", "params": {
  "channel": "ahp-session:/<uuid>",
  "action": { "type": "session/delta", "turnId": "turn-1", "partId": "p1", "content": "defines a function..." },
  "serverSeq": 7
}}

// Server → Client: turn complete
{ "method": "action", "params": {
  "channel": "ahp-session:/<uuid>",
  "action": { "type": "session/turnComplete", "turnId": "turn-1" },
  "serverSeq": 8
}}
```

## Handling Tool Calls

When the agent invokes a tool, the server emits a sequence of actions modelling the tool call's lifecycle (see [State Model — Tool Call Lifecycle](/guide/state-model#tool-call-lifecycle) for the full state machine):

1. `session/toolCallStart` — a new tool call begins.
2. `session/toolCallDelta` — partial parameters stream in.
3. `session/toolCallReady` — parameters complete. If the tool requires user confirmation, the call transitions to `pending-confirmation`; otherwise it goes directly to `running`.
4. `session/toolCallComplete` — tool execution finished.

The client resolves a `pending-confirmation` tool call by dispatching `session/toolCallConfirmed`:

```jsonc
// Client → Server: approve the tool call
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-session:/<uuid>",
    "clientSeq": 2,
    "action": {
      "type": "session/toolCallConfirmed",
      "turnId": "turn-1",
      "toolCallId": "tc-1",
      "approved": true,
      "confirmed": "user"
    }
  }
}
```

To deny, dispatch the same action with `approved: false` and a `reason` (`"denied"` or `"skipped"`).

## Next Steps

- [Architecture](/guide/architecture) — Process model and communication layers.
- [State Model](/guide/state-model) — Full state tree structure.
- [Actions Reference](/reference/actions) — Complete list of action types.
