# Connection Lifecycle

The connection lifecycle defines how an AHP client and server establish, resume, and tear down a transport connection. Per-channel lifecycles (session creation, terminal creation, etc.) live in the respective channel pages — see [Root Channel](/specification/root-channel), [Session Channel](/specification/session-channel), and [Terminal Channel](/specification/terminal-channel).

## Connection Handshake

The client initiates the connection with an `initialize` **request**. The client offers a list of protocol versions it can speak; the server picks one and responds with the negotiated version and initial state snapshots:

```
1. Client → Server:  initialize(protocolVersions[], clientId, clientInfo?, initialSubscriptions?, locale?)
2. Server → Client:  { protocolVersion, serverSeq, serverInfo?, _meta?, snapshots[], defaultDirectory? }
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
    "protocolVersions": ["0.3.0"],
    "clientId": "client-abc",
    "clientInfo": { "name": "acme-ide", "version": "2.5.0" },
    "initialSubscriptions": ["ahp-root://"],
    "locale": "en-US"
  }
}
```

`protocolVersions` is ordered from most preferred to least preferred. The server selects the highest offered SemVer within its supported caret-compatible ranges and returns that exact entry as `InitializeResult.protocolVersion`. If the server cannot speak any of the offered versions it MUST return [`UnsupportedProtocolVersion`](/reference/error-codes) (`-32005`) with required `data.supportedVersions` instead of a result. See [Versioning](/specification/versioning) for the negotiation rules.

`initialSubscriptions` allows the client to subscribe to channels in the same round-trip as the handshake — typically `ahp-root://` plus any previously-open session URIs.

`locale` is an optional IETF BCP 47 language tag (e.g. `"en-US"`, `"ja"`) indicating the client's preferred language. The server SHOULD use this to localise user-facing strings such as confirmation option labels.

`clientInfo` optionally identifies the client *implementation* — its `name` and, optionally, `version` and display `title`. It is distinct from `clientId`, which is an opaque per-connection identifier used for reconnection. See [Implementation identity](#implementation-identity) below.

### Initialize Response (Server → Client)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "0.3.0",
    "serverSeq": 42,
    "serverInfo": { "name": "acme-agent-host", "version": "1.4.2" },
    "_meta": {
      "com.example.chatTargetStateFile": true
    },
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

`_meta` is an optional, opaque map for implementation-specific extension capabilities advertised by the host. Hosts and clients MAY agree on namespaced keys; clients MUST ignore keys they do not understand. Capabilities needed for interoperable behavior should be added as typed `InitializeResult` fields instead.

If present, `defaultDirectory` provides a server-local starting location for remote filesystem browsing.

If the server cannot accept the connection for any other reason, it MUST return a JSON-RPC error. See [Error Codes](/reference/error-codes) for defined codes.

### Implementation identity

Both sides of the handshake MAY advertise the *implementation* behind them: the client via `InitializeParams.clientInfo` and the server via `InitializeResult.serverInfo`. Each is an `Implementation` (see the [`initialize`](/reference/common#initialize) reference) carrying a required `name` plus optional `version` and display `title`. This mirrors LSP's `clientInfo`/`serverInfo` and MCP's `Implementation`.

Implementation identity is **informational only** — for logging, telemetry, an about/status affordance, and, as a last resort, a known-issue workaround for a specific buggy build. It answers "what software, and which build, is on the other end," which is distinct from both the negotiated `protocolVersion` and the [`AgentInfo`](/reference/root#agentinfo) that names the agent persona.

It is **not** a feature-detection mechanism. Feature availability stays with the capability model (`ClientCapabilities` and the various `*.capabilities` declarations); clients and servers SHOULD NOT gate protocol behaviour on parsing `version`. Both fields are optional and purely additive: a peer that omits its own info, or ignores the other side's, stays fully interoperable.

## Authentication

Agents MAY declare `protectedResources` in their [`AgentInfo`](/reference/root#agentinfo). Before interacting with a session backed by such an agent, the client SHOULD authenticate by obtaining a Bearer token from the declared authorization server(s) and pushing it via the [`authenticate`](/reference/common#authenticate) command.

If a client attempts to create or use a session with an agent that requires authentication and has not yet provided a token, the server SHOULD return error code `-32007` (`AuthRequired`) with the required resource metadata in the error's `data` field.

See [Authentication](/specification/authentication) for the full specification.

## Reconnection

If the transport connection drops, the client reconnects and sends a `reconnect` **request** carrying one replay checkpoint per subscribed channel, instead of a single connection-wide watermark:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "reconnect",
  "params": {
    "channel": "ahp-root://",
    "clientId": "client-abc",
    "subscriptions": [
      { "channel": "ahp-root://", "lastSeenServerSeq": 42 },
      { "channel": "ahp-session:/<uuid>", "lastSeenServerSeq": 40 }
    ]
  }
}
```

Each `ChannelReplayCursor.lastSeenServerSeq` is the `serverSeq` the client last fully applied (or the `fromSeq` of the snapshot it last used to initialize that channel) — **never** a connection-wide value. A single shared watermark lets a fast-moving channel's `serverSeq` silently race ahead of a slower channel's: if channel A has an undelivered action at `serverSeq=100` and channel B goes on to deliver `serverSeq=101`, a connection-wide `lastSeenServerSeq=101` would skip A's action entirely on replay. Tracking one checkpoint per channel prevents that cross-channel skip without claiming any ordering *between* channels. A channel with no baseline yet (e.g. it subscribed but never received its initial snapshot before the connection dropped) sends `0`.

The server MUST include all replayed and snapshotted data in the response before returning, and MUST include exactly one recovery outcome per requested subscription — some channels may replay, others may receive a fresh snapshot, and others may be reported missing, all in the same response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "channels": [
      {
        "kind": "replay",
        "channel": "ahp-chat:/<cid>",
        "actions": [
          { "channel": "ahp-chat:/<cid>", "action": { "type": "chat/delta", ... }, "serverSeq": 43 },
          { "channel": "ahp-chat:/<cid>", "action": { "type": "chat/delta", ... }, "serverSeq": 44 }
        ]
      },
      {
        "kind": "snapshot",
        "channel": "ahp-session:/<uuid>",
        "snapshot": { "resource": "ahp-session:/<uuid>", "state": { ... }, "fromSeq": 50 }
      },
      { "kind": "missing", "channel": "ahp-session:/<disposed-uuid>" }
    ]
  }
}
```

- `kind: "replay"` means the server included every action the channel missed since the requested `lastSeenServerSeq`, in ascending `serverSeq` order. Stateless channels with nothing to snapshot always use this outcome, with an empty `actions` list when there is nothing to replay.
- `kind: "snapshot"` means the gap for that channel exceeded its replay buffer; the client MUST discard its prior state for that channel and re-initialize from the included snapshot, whose `fromSeq` becomes the channel's new baseline.
- `kind: "missing"` means the server can no longer resume that channel — for example, a session or terminal that has been disposed, or a resource the client is no longer permitted to observe. Clients SHOULD drop these channels from their local subscription set.

Because each channel's outcome is independent, one reconnect response may mix all three kinds, and the client MUST apply each channel's recovery using only that channel's own cursor — never another channel's progress, and never the connection's global `serverSeq` identity (see `InitializeResult.serverSeq` in the [`initialize`](/reference/common#initialize) reference).

Protocol notifications are **not** replayed — the client SHOULD re-fetch the session list via [`listSessions`](/reference/root#listsessions).

## Unexpected Disconnection

If the server process terminates unexpectedly:

- The host environment SHOULD treat the server as terminated.
- The host MAY attempt to restart the server (e.g. crash recovery with automatic restart).
- In-progress turns SHOULD be considered failed.
- On restart, clients reconnect using the reconnection flow above.
