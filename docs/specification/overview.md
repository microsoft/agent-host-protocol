# Specification Overview

This section contains the formal specification of the Agent Host Protocol (AHP). It defines the normative requirements for compliant implementations.

## Status

::: warning DRAFT
This specification is a working draft and is under active development. Breaking changes to wire types, actions, and state shapes are expected. Do not rely on backward compatibility until the protocol reaches production status.
:::

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this specification are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Protocol Version

Protocol versions are [SemVer](https://semver.org) `MAJOR.MINOR.PATCH` strings; see the [GitHub Releases](https://github.com/microsoft/agent-host-protocol/releases) page for the current published version. Peers negotiate a shared version at initialization: the client offers `InitializeParams.protocolVersions` (an array, most-preferred first) and the server selects one and returns it as `InitializeResult.protocolVersion`.

See [Versioning](/specification/versioning) for the full version strategy.

## Base Protocol

AHP uses [JSON-RPC 2.0](https://www.jsonrpc.org/specification) as its message framing. The protocol is transport-agnostic — any reliable, ordered, bidirectional message stream can carry AHP messages. See [Transport](/specification/transport).

### Channels are the routing key

Every push-style interaction in AHP is scoped to a **channel** — a URI-identified subscribable resource (the root catalogue, a session, a terminal, a changeset, …). The wire protocol surfaces this consistently:

- **Every command's `params` carries a top-level `channel: URI`**, declared on the `BaseParams` interface that every command params type extends. Channel-scoped commands (`createSession`, `disposeSession`, `fetchTurns`, `completions`, …) pass the target URI; connection-level commands (`initialize`, `ping`, `listSessions`, the `resource*` commands, `authenticate`) narrow `channel` to the literal `'ahp-root://'`.
- **Every notification's `params` carries a top-level `channel: URI`**, including the `action` envelope, `dispatchAction`, `unsubscribe`, and every protocol notification (`root/sessionAdded`, `auth/required`, …).

Implementations can therefore dispatch any incoming message by inspecting `(method, params.channel)` without per-method deserialisation. This invariant is verified at compile time in `types/version/message-checks.ts`. See [Channels & Subscriptions](/specification/subscriptions) for the URI scheme, the subscription mechanism, and the per-method table.

### Message Categories

| Direction | Type | Examples |
|---|---|---|
| Client → Server (notification) | Fire-and-forget | `unsubscribe`, `dispatchAction` |
| Client → Server (request) | Expects a response | `initialize`, `reconnect`, `subscribe`, `createSession`, `disposeSession`, `listSessions`, `fetchTurns`, `resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`, `resourceDelete`, `resourceMove`, `resourceResolve`, `resourceMkdir`, `createResourceWatch` |
| Server → Client (request) | Symmetrical reverse direction; expects a response | Any `resource*` request (`resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`, `resourceDelete`, `resourceMove`, `resourceResolve`, `resourceMkdir`, `resourceRequest`) plus `createResourceWatch` |
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
- **[Channels & Subscriptions](/specification/subscriptions)** — The channel model, the universal `channel: URI` routing key, and the subscription mechanism shared by every channel type.
- **[Authentication](/specification/authentication)** — RFC 9728 / RFC 6750 authentication flow.
- **[Root Channel](/specification/root-channel)** — `ahp-root://` — agents, terminals catalogue, host config, session catalogue events.
- **[Session Channel](/specification/session-channel)** — `ahp-session:/<uuid>` — per-session state: the `chats` catalog, default chat, active clients, customizations, changesets, and aggregated status.
- **[Chat Channel](/specification/chat-channel)** — `ahp-chat:/<cid>` — per-chat conversation state: turns, streaming, tool calls, pending messages, and input requests.
- **[Terminal Channel](/specification/terminal-channel)** — per-terminal pty state, data flow, claims, command detection.
- **[Telemetry Channel](/specification/telemetry-channel)** — `ahp-otlp:` — OpenTelemetry logs, traces, and metrics emitted by the agent host.
- **[Versioning](/specification/versioning)** — Protocol version negotiation and compatibility.
- **[Common Types](/reference/common)** — Cross-cutting types, base command/notification shapes, and JSON-RPC wire types.
- **[Root Channel Reference](/reference/root)** — `RootState`, root actions, root commands, and root notifications.
- **[Session Channel Reference](/reference/session)** — `SessionState`, session actions, and session commands.
- **[Chat Channel Reference](/reference/chat)** — `ChatState`, chat actions, and chat commands.
- **[Terminal Channel Reference](/reference/terminal)** — `TerminalState`, terminal actions, and terminal commands.
- **[Changeset Channel Reference](/reference/changeset)** — `ChangesetState`, changeset actions, and changeset commands.
- **[Messages](/reference/messages)** — Index of every JSON-RPC method with links to the channel page that documents it.
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
