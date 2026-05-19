# Specification Overview

This section contains the formal specification of the Agent Host Protocol (AHP). It defines the normative requirements for compliant implementations.

## Status

::: warning DRAFT
This specification is a working draft and is under active development. Breaking changes to wire types, actions, and state shapes are expected. Do not rely on backward compatibility until the protocol reaches production status.
:::

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this specification are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Protocol Version

The current protocol version is **1**. The version is a single integer that increments when new features require capability negotiation or behavioral semantics change.

```
Version history:
  1 — Initial: core session lifecycle, streaming, tools, permissions
```

See [Versioning](/specification/versioning) for the full version strategy.

## Base Protocol

AHP uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification) as its message framing over the transport (WebSocket, MessagePort, etc.).

### Message Categories

| Direction | Type | Examples |
|---|---|---|
| Client → Server (notification) | Fire-and-forget | `unsubscribe`, `dispatchAction` |
| Client → Server (request) | Expects a response | `initialize`, `reconnect`, `subscribe`, `createSession`, `disposeSession`, `listSessions`, `fetchTurns`, `resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`, `resourceDelete`, `resourceMove` |
| Server → Client (notification) | Pushed | `action`, `root/sessionAdded`, `root/sessionRemoved`, `root/sessionSummaryChanged`, `auth/required` |
| Server → Client (response) | Correlated by `id` | Success result or JSON-RPC error |

### Requests

A JSON-RPC request has an `id` and a `method`. The server MUST respond with exactly one response carrying the same `id`.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": { "channel": "ahp-root://" } }
```

### Responses

A success response:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "snapshot": { "resource": "...", "state": { ... }, "fromSeq": 5 } } }
```

An error response:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": "No agent for provider" } }
```

### Notifications

A JSON-RPC notification has a `method` but no `id`. It MUST NOT receive a response.

```json
{ "jsonrpc": "2.0", "method": "action", "params": { "channel": "ahp-session:/<uuid>", "action": { ... }, "serverSeq": 6 } }
```

## Structure

The specification is organised around the **channels** that AHP exposes — each channel page describes its URI, state, lifecycle, actions, and notifications. Cross-cutting concerns (transport, authentication, versioning) have their own pages.

- **[Transport](/specification/transport)** — How messages are delivered between client and server.
- **[Lifecycle](/specification/lifecycle)** — Connection handshake, reconnection, and disconnection.
- **[Authentication](/specification/authentication)** — RFC 9728 / RFC 6750 authentication flow.
- **[Channels & Subscriptions](/specification/subscriptions)** — The channel model and the URI-based subscription mechanism shared by every channel type.
- **[Root Channel](/specification/root-channel)** — `ahp-root://` — agents, terminals catalogue, host config, session catalogue events.
- **[Session Channel](/specification/session-channel)** — `ahp-session:/<uuid>` — per-session state, turns, tool calls, pending messages.
- **[Terminal Channel](/specification/terminal-channel)** — per-terminal pty state, data flow, claims, command detection.
- **[Versioning](/specification/versioning)** — Protocol version negotiation and compatibility.
- **[State Types](/reference/state-types)** — Complete state type definitions.
- **[Actions](/reference/actions)** — Complete action type definitions.
- **[Commands](/reference/commands)** — Available RPC commands.
- **[Messages](/reference/messages)** — Complete list of JSON-RPC methods.
- **[Notifications](/reference/notifications)** — Ephemeral event broadcasts.
- **[Error Codes](/reference/error-codes)** — Application-specific error codes.

## JSON Schema

Machine-readable [JSON Schema (2020-12)](https://json-schema.org/draft/2020-12/schema) definitions are published for all protocol types:

| Schema | Description |
|---|---|
| [state.schema.json](/agent-host-protocol/schema/state.schema.json) | State types |
| [actions.schema.json](/agent-host-protocol/schema/actions.schema.json) | Action types |
| [commands.schema.json](/agent-host-protocol/schema/commands.schema.json) | Command parameters and results |
| [notifications.schema.json](/agent-host-protocol/schema/notifications.schema.json) | Notification types |
| [errors.schema.json](/agent-host-protocol/schema/errors.schema.json) | Error codes |

These schemas are generated from the TypeScript type definitions and can be used for validation, code generation, or editor support.
