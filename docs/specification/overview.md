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
| Client → Server (request) | Expects a response | `initialize`, `reconnect`, `subscribe`, `createSession`, `disposeSession`, `listSessions`, `fetchTurns`, `fetchContent` |
| Server → Client (notification) | Pushed | `action`, `notification` |
| Server → Client (response) | Correlated by `id` | Success result or JSON-RPC error |

### Requests

A JSON-RPC request has an `id` and a `method`. The server MUST respond with exactly one response carrying the same `id`.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": { "resource": "agenthost:/root" } }
```

### Responses

A success response:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "resource": "...", "state": { ... }, "fromSeq": 5 } }
```

An error response:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": "No agent for provider" } }
```

### Notifications

A JSON-RPC notification has a `method` but no `id`. It MUST NOT receive a response.

```json
{ "jsonrpc": "2.0", "method": "action", "params": { "envelope": { ... } } }
```

## Structure

The specification is organized into the following sections:

- **[Transport](/specification/transport)** — How messages are delivered between client and server.
- **[Lifecycle](/specification/lifecycle)** — How connections are established and sessions are managed.
- **[Subscriptions](/specification/subscriptions)** — URI-based state subscription mechanism.
- **[Versioning](/specification/versioning)** — Protocol version negotiation and compatibility.
- **[State Types](/reference/state-types)** — Complete state type definitions.
- **[Actions](/reference/actions)** — Complete action type definitions.
- **[Commands](/reference/commands)** — Available RPC commands.
- **[Messages](/reference/messages)** — Complete list of JSON-RPC methods.
- **[Notifications](/reference/notifications)** — Ephemeral event broadcasts.
- **[Error Codes](/reference/error-codes)** — Application-specific error codes.
