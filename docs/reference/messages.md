# Messages Reference

Complete reference of all JSON-RPC methods in the Agent Host Protocol, organized by direction and type.

## Client → Server Requests

These methods have an `id` and expect a response.

| Method | Description | Reference |
|---|---|---|
| `initialize` | Handshake — establishes the connection and protocol version | [Lifecycle](/specification/lifecycle) |
| `reconnect` | Re-establishes a dropped connection with replay or snapshot | [Lifecycle](/specification/lifecycle) |
| `subscribe` | Subscribe to a URI-identified state resource | [Subscriptions](/specification/subscriptions) |
| `createSession` | Create a new agent session | [Commands](/reference/commands) |
| `disposeSession` | Dispose a session and clean up resources | [Commands](/reference/commands) |
| `listSessions` | Fetch session summaries | [Commands](/reference/commands) |
| `fetchTurns` | Fetch historical turns for a session | [Commands](/reference/commands) |
| `fetchContent` | Fetch large content by reference | [Commands](/reference/commands) |

## Client → Server Notifications

These methods have no `id` and expect no response.

| Method | Description | Reference |
|---|---|---|
| `unsubscribe` | Stop receiving updates for a URI | [Subscriptions](/specification/subscriptions) |
| `dispatchAction` | Fire-and-forget action dispatch (write-ahead) | [Actions](/guide/actions) |

## Server → Client Notifications

These are pushed by the server without a preceding request.

| Method | Description | Reference |
|---|---|---|
| `action` | Delivers an `ActionEnvelope` to subscribed clients | [Actions](/reference/actions) |
| `notification` | Ephemeral protocol notification (e.g. session added/removed) | [Notifications](/reference/notifications) |

## Version Introduction

All messages listed above were introduced in protocol version **1**.
