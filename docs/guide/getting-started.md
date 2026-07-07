# Getting Started

This guide walks through a basic client-server interaction using the Agent Host Protocol.

## The shape of every message

Before walking through the handshake, note the one structural rule that runs through every example below: **every command's and every notification's params carries a top-level `channel: URI`**. Channel-scoped messages set it to the target channel (e.g. `ahp-session:/<uuid>`); connection-level commands set it to `'ahp-root://'`. Servers, clients, and intermediate proxies dispatch every message by `(method, params.channel)`. See [Channels & Subscriptions](/specification/subscriptions) for the full model.

## Connection Handshake

Every AHP session starts with a JSON-RPC handshake over the transport (WebSocket, MessagePort, etc.):

```
1. Client → Server:  initialize(channel: 'ahp-root://', protocolVersions[], clientId, initialSubscriptions?)
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

The initial snapshot has `lifecycle: 'creating'`. The server asynchronously initializes the agent backend, then dispatches either a `session/ready` or `session/creationFailed` action. A ready session starts with a default chat: its `ahp-chat:/<cid>` URI is carried in `SessionState.defaultChat` and listed in the session's `chats` catalog. Per-conversation state — turns, streaming responses, and tool calls — lives on that chat's own channel, not the session channel. See the [Chat Channel specification](/specification/chat-channel) for the full per-chat model.

## Sending a Message

Turns happen on a **chat channel**. Subscribe to the session's default chat the same way you subscribed to the session:

```jsonc
// Client → Server (request): subscribe to the session's default chat
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "subscribe",
  "params": { "channel": "ahp-chat:/<cid>" }
}
```

To start a turn, dispatch a `chat/turnStarted` action on the chat channel. This is a **write-ahead** action — the client applies it optimistically to its local chat state:

```jsonc
// Client → Server (notification, fire-and-forget)
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-chat:/<cid>",
    "clientSeq": 1,
    "action": {
      "type": "chat/turnStarted",
      "turnId": "turn-1",
      "message": { "text": "Explain this code", "origin": { "kind": "user" } }
    }
  }
}
```

The server begins agent processing and streams back actions on the same chat channel:

```jsonc
// Server → Client: streaming text delta
{ "method": "action", "params": {
  "channel": "ahp-chat:/<cid>",
  "action": { "type": "chat/delta", "turnId": "turn-1", "partId": "p1", "content": "This code " },
  "serverSeq": 6
}}

// Server → Client: more streaming text
{ "method": "action", "params": {
  "channel": "ahp-chat:/<cid>",
  "action": { "type": "chat/delta", "turnId": "turn-1", "partId": "p1", "content": "defines a function..." },
  "serverSeq": 7
}}

// Server → Client: turn complete
{ "method": "action", "params": {
  "channel": "ahp-chat:/<cid>",
  "action": { "type": "chat/turnComplete", "turnId": "turn-1" },
  "serverSeq": 8
}}
```

## Handling Tool Calls

When the agent invokes a tool, the server emits a sequence of actions on the chat channel modelling the tool call's lifecycle (see [State Model — Tool Call Lifecycle](/guide/state-model#tool-call-lifecycle) for the full state machine):

1. `chat/toolCallStart` — a new tool call begins.
2. `chat/toolCallDelta` — partial parameters stream in.
3. `chat/toolCallReady` — parameters complete. If the tool requires user confirmation, the call transitions to `pending-confirmation`; otherwise it goes directly to `running`.
4. `chat/toolCallComplete` — tool execution finished.

The client resolves a `pending-confirmation` tool call by dispatching `chat/toolCallConfirmed`:

```jsonc
// Client → Server: approve the tool call
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-chat:/<cid>",
    "clientSeq": 2,
    "action": {
      "type": "chat/toolCallConfirmed",
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

- [State Model](/guide/state-model) — Full state tree structure.
- [Messages Reference](/reference/messages) — Index of every JSON-RPC method, linked to the channel that documents it.
