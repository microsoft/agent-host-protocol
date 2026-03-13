# Transport

The transport layer is responsible for delivering JSON-RPC messages between the client and server. AHP is transport-agnostic — any mechanism that provides a reliable, ordered, bidirectional message stream can be used.

The transport is determined **before** the AHP protocol begins — it is not negotiated within the protocol itself. The server is responsible for accepting connections on the chosen transport.

## Requirements

A compliant transport MUST:

1. Deliver messages **in order**.
2. Deliver messages **reliably** (no silent drops).
3. Support **bidirectional** communication.
4. Deliver **complete** messages (no partial delivery).

## Standard Transports

### WebSocket

The primary transport for remote clients and standalone server mode. A standard WebSocket connection is established and each WebSocket message contains exactly one JSON-RPC message.

- The server acts as the WebSocket server.
- Messages MUST be sent as WebSocket **text** frames.
- Each text frame contains exactly one complete JSON-RPC message.

The standalone server is started with:

```bash
node agentHostServerMain.js [--port <port>] [--enable-mock-agent]
```

### MessagePort (Electron)

For desktop (Electron) deployments, the renderer connects directly to the agent host utility process via [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort). This provides zero-serialization IPC within the same Electron application.

- Each renderer window gets its own MessagePort via `acquirePort()`.
- Messages are structured-cloned, not JSON-serialized.
- URI objects are revived on the receiving end.

## Custom Transports

Implementations MAY define custom transports as long as they meet the requirements above. Any mechanism that delivers complete, ordered, bidirectional messages is acceptable.

## Keep-Alive

AHP does not define a protocol-level heartbeat. For WebSocket transports, implementations SHOULD use WebSocket protocol-level ping/pong frames to detect dead connections. The ping interval and timeout are implementation-specific.

## Authentication

Authentication is a transport-layer concern and is outside the scope of the AHP wire protocol. For WebSocket transports, implementations SHOULD authenticate during the WebSocket handshake (e.g. via query parameters, headers, or the HTTP upgrade request) before the AHP `initialize` request is sent.
