# Commands

Commands are JSON-RPC requests from the client to the server. They return a result or a JSON-RPC error.

## `initialize`

Establishes a new connection and negotiates the protocol version. This MUST be the first message sent by the client.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `protocolVersion` | `number` | Yes | Protocol version the client speaks |
| `clientId` | `string` | Yes | Unique client identifier |
| `initialSubscriptions` | `URI[]` | No | URIs to subscribe to during handshake |

**Result:**

| Field | Type | Description |
|---|---|---|
| `protocolVersion` | `number` | Protocol version the server speaks |
| `serverSeq` | `number` | Current server sequence number |
| `snapshots` | `ISnapshot[]` | Snapshots for each `initialSubscriptions` URI |

If the server does not support the client's protocol version, it MUST return error code `-32005` (`UnsupportedProtocolVersion`).

See [Lifecycle](/specification/lifecycle) for the full handshake flow.

---

## `reconnect`

Re-establishes a dropped connection. The server replays missed actions or provides fresh snapshots.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `clientId` | `string` | Yes | Client identifier from the original connection |
| `lastSeenServerSeq` | `number` | Yes | Last `serverSeq` the client received |
| `subscriptions` | `URI[]` | Yes | URIs the client was subscribed to |

**Result (replay):** When the server can replay from the requested sequence:

| Field | Type | Description |
|---|---|---|
| `type` | `'replay'` | Discriminant |
| `actions` | `IActionEnvelope[]` | Missed action envelopes since `lastSeenServerSeq` |

**Result (snapshot):** When the gap exceeds the replay buffer:

| Field | Type | Description |
|---|---|---|
| `type` | `'snapshot'` | Discriminant |
| `snapshots` | `ISnapshot[]` | Fresh snapshots for each subscription |

The server MUST include all replayed data in the response. See [Lifecycle](/specification/lifecycle) for details.

---

## `createSession`

Creates a new session with the specified agent provider.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `session` | `URI` | Yes | Session URI (client-chosen, e.g. `copilot:/<uuid>`) |
| `provider` | `string` | No | Agent provider ID |
| `model` | `string` | No | Model ID to use |

**Result:** `null` on success.

If the session URI already exists, the server MUST return an error with code `-32003` (`SessionAlreadyExists`). See [Error Codes](/reference/error-codes).

**Example:**

```jsonc
// Client → Server
{ "jsonrpc": "2.0", "id": 2, "method": "createSession",
  "params": { "session": "copilot:/<uuid>", "provider": "copilot", "model": "gpt-4o" } }

// Server → Client (success)
{ "jsonrpc": "2.0", "id": 2, "result": null }

// Server → Client (failure — provider not found)
{ "jsonrpc": "2.0", "id": 2, "error": { "code": -32002, "message": "No agent for provider" } }

// Server → Client (failure — session already exists)
{ "jsonrpc": "2.0", "id": 2, "error": { "code": -32003, "message": "Session already exists" } }
```

After creation, the client should subscribe to the session URI to receive state updates. The server also broadcasts a `notify/sessionAdded` notification to all clients.

---

## `disposeSession`

Disposes a session and cleans up server-side resources.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `session` | `URI` | Yes | Session URI to dispose |

**Result:** `null` on success.

The server broadcasts a `notify/sessionRemoved` notification to all clients.

---

## `listSessions`

Returns a list of session summaries. Used to populate session lists and sidebars.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `filter` | `object` | No | Optional filter criteria |

**Result:** `ISessionSummary[]`

The session list is **not** part of the state tree because it can be arbitrarily large. Clients fetch it imperatively and maintain a local cache updated by `notify/sessionAdded` and `notify/sessionRemoved` notifications.

---

## `fetchContent`

Fetches large content referenced by a `ContentRef` in the state tree.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `uri` | `string` | Yes | Content URI from a `ContentRef` |

**Result:**

| Field | Type | Description |
|---|---|---|
| `data` | `string` | Content encoded as a string |
| `encoding` | `'base64' \| 'utf-8'` | How `data` is encoded |
| `mimeType` | `string?` | MIME type of the content |

Binary content (images, etc.) MUST use `base64` encoding. Text content MAY use `utf-8` encoding.

**Example:**

```jsonc
// Client → Server
{ "jsonrpc": "2.0", "id": 10, "method": "fetchContent",
  "params": { "uri": "copilot:/<uuid>/content/img-1" } }

// Server → Client
{ "jsonrpc": "2.0", "id": 10, "result": {
  "data": "iVBORw0KGgo...",
  "encoding": "base64",
  "mimeType": "image/png"
}}
```

Content references keep the state tree small by storing large data (images, long tool outputs) by reference rather than inline.

---

## `fetchTurns`

Fetches historical turns for a session. Used for lazy loading of conversation history.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `session` | `URI` | Yes | Session URI |
| `before` | `string` | No | Turn ID to fetch before (exclusive). Omit to fetch from the most recent turn. |
| `limit` | `number` | No | Maximum number of turns to return. Server MAY impose its own upper bound. |

**Result:**

| Field | Type | Description |
|---|---|---|
| `turns` | `ITurn[]` | The requested turns, ordered oldest-first |
| `hasMore` | `boolean` | Whether more turns exist before the returned range |

**Example:**

```jsonc
// Client → Server (fetch the 20 most recent turns)
{ "jsonrpc": "2.0", "id": 8, "method": "fetchTurns",
  "params": { "session": "copilot:/<uuid>", "limit": 20 } }

// Server → Client
{ "jsonrpc": "2.0", "id": 8, "result": {
  "turns": [ { "id": "t1", ... }, { "id": "t2", ... } ],
  "hasMore": true
}}

// Client → Server (fetch 20 turns before t1)
{ "jsonrpc": "2.0", "id": 9, "method": "fetchTurns",
  "params": { "session": "copilot:/<uuid>", "before": "t1", "limit": 20 } }
```

---

## Client-Dispatched Actions

In addition to commands, clients interact with the server by **dispatching actions** as fire-and-forget notifications:

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 1,
    "action": { "type": "session/turnStarted", "session": "copilot:/<uuid>", ... }
  }
}
```

These are **write-ahead**: the client applies them optimistically to local state. See [Actions](/guide/actions) for the full list of client-dispatchable actions.

| Action | Server-side effect |
|---|---|
| `session/turnStarted` | Begins agent processing for the new turn |
| `session/permissionResolved` | Unblocks the pending tool execution |
| `session/turnCancelled` | Aborts the in-progress turn |
| `session/modelChanged` | Changes the model for subsequent turns |
