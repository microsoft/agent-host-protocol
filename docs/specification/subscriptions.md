# Subscriptions

All state in AHP is identified by URIs. Clients subscribe to a URI to receive its current state snapshot and subsequent action updates. This is the single universal mechanism for state synchronization.

## URI Scheme

| URI | State | Description |
|---|---|---|
| `agenthost:/root` | `RootState` | Global state (agents and their models). Always present. |
| `copilot:/<uuid>` | `SessionState` | Per-session state. Scheme is the provider name. |

## Subscribe (Request)

`subscribe` is a JSON-RPC **request** — the client receives the snapshot as the response result:

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscribe",
  "params": { "resource": "copilot:/<uuid>" }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resource": "copilot:/<uuid>",
    "state": {
      "summary": { "resource": "copilot:/<uuid>", "title": "New Session", ... },
      "lifecycle": "creating",
      "turns": [],
      "activeTurn": null
    },
    "fromSeq": 5
  }
}
```

After subscribing, the client receives all actions scoped to that URI with `serverSeq > fromSeq`. Multiple concurrent subscriptions are supported.

## Unsubscribe (Notification)

`unsubscribe` is a notification (no response needed):

```json
{
  "jsonrpc": "2.0",
  "method": "unsubscribe",
  "params": { "resource": "copilot:/<uuid>" }
}
```

After unsubscribing, the client stops receiving actions for that URI. The server drops the client from the subscription list.

## Action Delivery

The server broadcasts action envelopes as JSON-RPC notifications to subscribed clients:

```json
{
  "jsonrpc": "2.0",
  "method": "action",
  "params": {
    "envelope": {
      "action": { "type": "session/delta", "session": "copilot:/<uuid>", "turnId": "t1", "content": "Hello" },
      "serverSeq": 6,
      "origin": { "clientId": "client-1", "clientSeq": 1 }
    }
  }
}
```

- **Root actions** go to all clients subscribed to `agenthost:/root`.
- **Session actions** go to all clients subscribed to that session's URI.

## Initial Subscriptions

During the connection handshake, clients MAY include `initialSubscriptions` in the `initialize` request to subscribe to URIs in the same round-trip:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientId": "client-abc",
    "initialSubscriptions": ["agenthost:/root", "copilot:/<prev-session>"]
  }
}
```

The server includes snapshots for each in the `initialize` response.

## Protocol Notifications

In addition to action envelopes, the server broadcasts **protocol notifications** for ephemeral events:

```json
{
  "jsonrpc": "2.0",
  "method": "notification",
  "params": {
    "notification": { "type": "notify/sessionAdded", "summary": { ... } }
  }
}
```

For partial updates to an existing session's summary (title, status, `modifiedAt`, etc.), the server broadcasts `notify/sessionSummaryChanged` with only the fields that changed:

```json
{
  "jsonrpc": "2.0",
  "method": "notification",
  "params": {
    "notification": {
      "type": "notify/sessionSummaryChanged",
      "session": "copilot:/<uuid>",
      "changes": { "title": "Refactor auth middleware", "status": 8 }
    }
  }
}
```

Protocol notifications go to all connected clients regardless of subscriptions. They are not stored in state and are not replayed on reconnection.
