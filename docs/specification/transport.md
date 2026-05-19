# Transport

Similarly to the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) and the [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/), AHP does not currently prescribe a specific transport. Any mechanism that provides a reliable, ordered, bidirectional message stream can carry AHP messages.

The transport is chosen **before** the AHP protocol begins; it is not negotiated within the protocol itself. Client and server agree on a transport out-of-band, and the server is responsible for accepting connections on that transport.

## Requirements

A compliant transport MUST:

1. Deliver messages **in order**.
2. Deliver messages **reliably** (no silent drops).
3. Support **bidirectional** communication.
4. Deliver **complete** messages (no partial delivery).

Any mechanism that meets these requirements is acceptable — WebSocket, TCP with a framing layer, an in-process message channel, or anything else.

## Common Transports

While AHP does not mandate a transport, **WebSocket** is the most common choice for remote and cross-process connections, and is what the VS Code implementation uses.

When WebSocket is used:

- The server acts as the WebSocket server.
- Messages are sent as WebSocket **text** frames.
- Each text frame contains exactly one complete JSON-RPC message.

## Keep-Alive

AHP defines a protocol-level [`ping`](/reference/common#ping) command that clients MAY use to verify the connection is alive and to keep it from being closed by idle-timeout intermediaries (proxies, load balancers, etc.). `ping` carries no payload in either direction; the response itself is the signal, and the server MUST respond regardless of whether the client has completed `initialize` or holds any subscriptions.

Implementations MAY additionally rely on transport-level liveness mechanisms where available (for example, WebSocket ping/pong frames). The ping interval and timeout are implementation-specific.

## Authentication

Access to the AHP endpoint itself is a transport-layer concern and is outside the scope of the AHP wire protocol. Implementations that need to gate the connection SHOULD do so during the transport handshake — for example, for WebSocket via query parameters, headers, or the HTTP upgrade request — before the AHP `initialize` request is sent.

Once the connection is established, AHP also provides a protocol-level [`authenticate`](/reference/common#authenticate) command. Implementors can use it to manage entitlements to individual agents and to other protected resources they expose (such as MCP servers or other backing services), independently of the transport. Agents advertise their requirements via the `protectedResources` field on [`AgentInfo`](/reference/root#agentinfo), and clients push Bearer tokens for each resource as needed. See [Authentication](/specification/authentication) for the full flow.
