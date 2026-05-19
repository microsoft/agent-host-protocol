// AgentHostProtocolClient — JSON-RPC client helpers for the Agent Host Protocol.
//
// This module ships:
//   - `AHPTransport`: a pluggable async transport protocol (text/binary/parsed framing).
//   - `URLSessionWebSocketTransport`: default WebSocket implementation.
//   - `NWConnectionWebSocketTransport`: native Network.framework WebSocket implementation.
//   - `InMemoryTransport`: paired in-memory transport for tests.
//   - `AHPClient`: an actor that owns request/response correlation, subscription
//     fan-out, a top-level `events` tap, and connection-state changes.
//   - `AHPStateMirror`: a thin reducer façade for keeping an in-memory state copy.
//   - `MultiHostClient`: a higher-level facade for multiple host connections,
//     reconnect policy, generation-checked handles, and aggregated views.
//
// Observable UI facades remain application-specific and should wrap these
// primitives in the app's own state model.

import Foundation

/// Well-known channel URI for root-state subscriptions and snapshots.
///
/// The protocol-level value referenced throughout the spec, docs, and the
/// example app's initial subscriptions. Defined here as a constant so the
/// JSON-RPC client doesn't string-match the URI inline.
///
/// TODO(codegen): Source this from `AgentHostProtocol` once codegen exposes a
/// shared constant (TypeScript/Rust/Swift would all benefit).
public let RootResourceURI: String = "ahp-root://"
