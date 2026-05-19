# Channels & Subscriptions

AHP organises all push-based communication into **channels**. A channel is a URI-identified resource that a client subscribes to in order to receive updates. Channels MAY have state (root, sessions, terminals, changesets) or be stateless (future: logging, MCP relay, LSP relay). The subscription mechanism — `subscribe`, `unsubscribe`, and per-channel notifications — is uniform across channel types.

## Every message carries `channel`

The channel concept is woven into every wire message. **Every command and every notification has a top-level `channel: URI` field on its params.** This invariant lets servers, clients, and intermediate proxies dispatch any incoming message by inspecting `(method, params.channel)` without per-method knowledge of the rest of the payload.

| Direction | Methods | `channel` value |
|---|---|---|
| Client → Server commands (channel-scoped) | `subscribe`, `unsubscribe`, `createSession`, `disposeSession`, `createTerminal`, `disposeTerminal`, `fetchTurns`, `completions`, `invokeChangesetOperation` | The target channel's URI (e.g. `ahp-session:/<uuid>`). |
| Client → Server commands (connection-level) | `initialize`, `ping`, `reconnect`, `listSessions`, `authenticate`, `resolveSessionConfig`, `sessionConfigCompletions`, `resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`, `resourceDelete`, `resourceMove`, `resourceRequest` | Literal `'ahp-root://'`. |
| Client → Server `dispatchAction` | The channel the action targets. |
| Server → Client `action` | The channel that owns the action envelope. |
| Server → Client protocol notifications | `root/sessionAdded`, `root/sessionRemoved`, `root/sessionSummaryChanged`, `auth/required` | The channel the notification scopes to (the root channel for `root/*`; the channel the auth requirement targets for `auth/required`). |

The constraint is encoded in the TypeScript types: every entry in `CommandMap` and the notification maps has params assignable to `BaseParams` (or, for notifications, structurally `{ channel: URI }`). The compile-time check in `types/version/message-checks.ts` fails if any new method omits the field.

The rest of this page details the URI scheme and the lifecycle of a subscription. The mechanics of action delivery and protocol notifications are described under each channel page ([Root](/specification/root-channel), [Session](/specification/session-channel), [Terminal](/specification/terminal-channel)).

## URI Scheme

| URI | State type | Description |
|---|---|---|
| `ahp-root://` | `RootState` | Global state (agents, terminals, host config). Always present. |
| `ahp-session:/<uuid>` | `SessionState` | Per-session state. The session's provider is carried on `SessionSummary.provider`, not in the URI scheme. |
| `ahp-terminal:/<id>` | `TerminalState` | Per-terminal state. Server-defined id. |
| `ahp-changeset:/<id>` | `ChangesetState` | Per-changeset state. URI is obtained by expanding a `ChangesetSummary.uriTemplate` advertised on a session; the id is server-defined. |

Future channel types (stateless logging, LSP, MCP relay, …) introduce their own URI schemes. Clients MUST NOT subscribe to a scheme they do not understand.

## Subscribe (Request)

`subscribe` is a JSON-RPC **request**. The result includes a snapshot for state-bearing channels and omits it for stateless ones.

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscribe",
  "params": { "channel": "ahp-session:/<uuid>" }
}

// Server → Client (state-bearing channel)
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "snapshot": {
      "resource": "ahp-session:/<uuid>",
      "state": {
        "summary": { "resource": "ahp-session:/<uuid>", "title": "New Session", ... },
        "lifecycle": "creating",
        "turns": [],
        "activeTurn": null
      },
      "fromSeq": 5
    }
  }
}

// Server → Client (stateless channel)
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {}
}
```

After subscribing, the client receives all messages scoped to that channel — both action envelopes (for state channels) and any channel-specific notifications.

## Unsubscribe (Notification)

`unsubscribe` is a fire-and-forget client → server notification. Like every wire message, its params carry the channel URI being released.

```json
{
  "jsonrpc": "2.0",
  "method": "unsubscribe",
  "params": { "channel": "ahp-session:/<uuid>" }
}
```

After unsubscribing, the client stops receiving messages for that channel.

## Action Delivery (`action`)

State channels deliver mutations via the `action` server notification. The params are an `ActionEnvelope` — flat, with `channel` identifying the channel and a single `action` payload:

```json
{
  "jsonrpc": "2.0",
  "method": "action",
  "params": {
    "channel": "ahp-session:/<uuid>",
    "action": { "type": "session/delta", "turnId": "t1", "partId": "p1", "content": "Hello" },
    "serverSeq": 6,
    "origin": { "clientId": "client-1", "clientSeq": 1 }
  }
}
```

- Root actions go to all clients subscribed to `ahp-root://`.
- Session actions go to all clients subscribed to that session's URI.
- Terminal actions go to all clients subscribed to that terminal's URI.

Action payloads (the inner `action` object) carry only fields intrinsic to the action — the channel comes from the envelope. Individual actions do NOT carry a `session: URI` or `terminal: URI` field of their own.

The client → server dispatch path uses a different method, `dispatchAction`, with params `{ channel, clientSeq, action }`:

```json
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-session:/<uuid>",
    "clientSeq": 1,
    "action": { "type": "session/turnStarted", "turnId": "t1", "userMessage": { "text": "Hi" } }
  }
}
```

See [Actions](/guide/actions) for the full list of client-dispatchable actions.

## Initial Subscriptions

During the handshake, clients MAY include `initialSubscriptions` in `initialize` to subscribe to channels in the same round-trip:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "channel": "ahp-root://",
    "protocolVersions": ["0.2.0"],
    "clientId": "client-abc",
    "initialSubscriptions": ["ahp-root://", "ahp-session:/<prev-session>"]
  }
}
```

The server includes a snapshot for each state-bearing channel in the `initialize` response.

## Protocol Notifications

Beyond `action`, the server pushes per-channel **protocol notifications** for ephemeral events. Each one is its own top-level JSON-RPC method (e.g. `root/sessionAdded`, `auth/required`) — there is no `notification` wrapper.

```json
{
  "jsonrpc": "2.0",
  "method": "root/sessionAdded",
  "params": {
    "channel": "ahp-root://",
    "summary": { "resource": "ahp-session:/<uuid>", "title": "New Session", ... }
  }
}
```

For partial updates to an existing session's summary, the server broadcasts `root/sessionSummaryChanged`:

```json
{
  "jsonrpc": "2.0",
  "method": "root/sessionSummaryChanged",
  "params": {
    "channel": "ahp-root://",
    "session": "ahp-session:/<uuid>",
    "changes": { "title": "Refactor auth middleware", "status": 8 }
  }
}
```

Protocol notifications go only to clients subscribed to the channel they target. They are not stored in state and are not replayed on reconnection.

## Stateless Channels

A channel MAY be stateless — i.e. carry no `Snapshot`. Subscribing returns an empty result `{}`, and subsequent traffic flows via channel-specific methods rather than `action` envelopes. The subscription/unsubscription mechanism is identical to state channels. Stateless channels are not replayed across reconnection — clients re-subscribe and resume from the live edge.
