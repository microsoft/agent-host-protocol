# Connection Lifecycle

The connection lifecycle defines how an AHP client and server establish, resume, and tear down a transport connection. Per-channel lifecycles (session creation, terminal creation, etc.) live in the respective channel pages — see [Root Channel](/specification/root-channel), [Session Channel](/specification/session-channel), and [Terminal Channel](/specification/terminal-channel).

## Connection Handshake

The client initiates the connection with an `initialize` **request**. The client offers a list of protocol versions it can speak; the server picks one and responds with the negotiated version and initial state snapshots:

```
1. Client → Server:  initialize(protocolVersions[], clientId, initialSubscriptions?, locale?)
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
    "channel": "ahp-root://",
    "protocolVersions": ["0.2.0"],
    "clientId": "client-abc",
    "initialSubscriptions": ["ahp-root://"],
    "locale": "en-US"
  }
}
```

`protocolVersions` is ordered from most preferred to least preferred. The server picks one entry and returns it as `InitializeResult.protocolVersion`. If the server cannot speak any of the offered versions it MUST return [`UnsupportedProtocolVersion`](/reference/error-codes) (`-32005`) instead of a result. See [Versioning](/specification/versioning) for the negotiation rules.

`initialSubscriptions` allows the client to subscribe to channels in the same round-trip as the handshake — typically `ahp-root://` plus any previously-open session URIs.

`locale` is an optional IETF BCP 47 language tag (e.g. `"en-US"`, `"ja"`) indicating the client's preferred language. The server SHOULD use this to localise user-facing strings such as confirmation option labels.

### Initialize Response (Server → Client)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "0.2.0",
    "serverSeq": 42,
    "defaultDirectory": "file:///home/testuser",
    "snapshots": [
      {
        "resource": "ahp-root://",
        "state": { "agents": [...] },
        "fromSeq": 42
      }
    ]
  }
}
```

`protocolVersion` is the version the server selected from the client's `protocolVersions` list. Both peers MUST use this version for the rest of the connection.

If present, `defaultDirectory` provides a server-local starting location for remote filesystem browsing.

If the server cannot accept the connection for any other reason, it MUST return a JSON-RPC error. See [Error Codes](/reference/error-codes) for defined codes.

## Authentication

Agents MAY declare `protectedResources` in their [`AgentInfo`](/reference/state-types#agentinfo). Before interacting with a session backed by such an agent, the client SHOULD authenticate by obtaining a Bearer token from the declared authorization server(s) and pushing it via the [`authenticate`](/reference/commands#authenticate) command.

If a client attempts to create or use a session with an agent that requires authentication and has not yet provided a token, the server SHOULD return error code `-32007` (`AuthRequired`) with the required resource metadata in the error's `data` field.

See [Authentication](/specification/authentication) for the full specification.

## Reconnection

If the transport connection drops, the client reconnects and sends a `reconnect` **request**:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "reconnect",
  "params": {
    "channel": "ahp-root://",
    "clientId": "client-abc",
    "lastSeenServerSeq": 42,
    "subscriptions": ["ahp-root://", "ahp-session:/<uuid>"]
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
      { "channel": "ahp-session:/<uuid>", "action": { "type": "session/delta", ... }, "serverSeq": 43 },
      { "channel": "ahp-session:/<uuid>", "action": { "type": "session/delta", ... }, "serverSeq": 44 }
    ],
    "missing": ["ahp-session:/<disposed-uuid>"]
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
      { "resource": "ahp-root://", "state": { ... }, "fromSeq": 50 },
      { "resource": "ahp-session:/<uuid>", "state": { ... }, "fromSeq": 50 }
    ]
  }
}
```

Protocol notifications are **not** replayed — the client SHOULD re-fetch the session list via [`listSessions`](/reference/commands#listsessions). Stateless channels are simply re-subscribed; missed messages are dropped.

## Unexpected Disconnection

If the server process terminates unexpectedly:

- The host environment SHOULD treat the server as terminated.
- The host MAY attempt to restart the server (e.g. crash recovery with automatic restart).
- In-progress turns SHOULD be considered failed.
- On restart, clients reconnect using the reconnection flow above.
