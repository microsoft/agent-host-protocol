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

After connecting, clients subscribe to URI-identified state resources. Root state is always available at `agenthost:/root`:

```jsonc
// Client → Server (request)
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscribe",
  "params": { "resource": "agenthost:/root" }
}

// Server → Client (response)
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resource": "agenthost:/root",
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
```

After subscribing, the client receives all subsequent actions scoped to that URI via server-pushed notifications.

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
    "session": "copilot:/<uuid>",
    "provider": "copilot",
    "model": "gpt-4o"
  }
}

// 3. Client subscribes to the session URI
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "subscribe",
  "params": { "resource": "copilot:/<uuid>" }
}
```

The initial snapshot has `lifecycle: 'creating'`. The server asynchronously initializes the agent backend, then dispatches either a `session/ready` or `session/creationFailed` action.

## Sending a Message

To start a turn, the client calls the `startTurn` command. The command form
gives the server a chance to **reject** the turn — most importantly when the
session config is incomplete relative to the latest schema (e.g. a fresh
schema introduced a new required property the user has not yet filled in):

```jsonc
// Client → Server (request — server may reject)
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "startTurn",
  "params": {
    "session": "copilot:/<uuid>",
    "turnId": "turn-1",
    "userMessage": { "text": "Explain this code" }
  }
}

// Server → Client (success — empty-object result; a `session/turnStarted`
// action follows on the subscription)
{ "jsonrpc": "2.0", "id": 5, "result": {} }
```

The server begins agent processing and streams back actions:

```jsonc
// Server → Client: turn started (broadcast to every subscriber)
{ "method": "action", "params": { "envelope": {
  "action": { "type": "session/turnStarted", "session": "copilot:/<uuid>",
    "turnId": "turn-1", "userMessage": { "text": "Explain this code" } },
  "serverSeq": 5
}}}

// Server → Client: streaming text delta
{ "method": "action", "params": { "envelope": {
  "action": { "type": "session/delta", "session": "copilot:/<uuid>",
    "turnId": "turn-1", "content": "This code " },
  "serverSeq": 6
}}}

// Server → Client: more streaming text
{ "method": "action", "params": { "envelope": {
  "action": { "type": "session/delta", "session": "copilot:/<uuid>",
    "turnId": "turn-1", "content": "defines a function..." },
  "serverSeq": 7
}}}

// Server → Client: turn complete
{ "method": "action", "params": { "envelope": {
  "action": { "type": "session/turnComplete", "session": "copilot:/<uuid>",
    "turnId": "turn-1" },
  "serverSeq": 8
}}}
```

## Handling Tool Calls and Permissions

When the agent invokes a tool, the server sends `session/toolStart`. If permission is needed, a `session/permissionRequest` follows. The client resolves it by dispatching `session/permissionResolved`:

```jsonc
// Client → Server: approve the permission
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 2,
    "action": {
      "type": "session/permissionResolved",
      "session": "copilot:/<uuid>",
      "turnId": "turn-1",
      "requestId": "perm-1",
      "approved": true,
    },
  },
}
```

## Next Steps

- [Architecture](/guide/architecture) — Process model and communication layers.
- [State Model](/guide/state-model) — Full state tree structure.
- [Actions Reference](/reference/actions) — Complete list of action types.
