//! Transport abstraction.
//!
//! The SDK is deliberately transport-agnostic. Any framed byte stream —
//! WebSocket, raw TCP, Unix socket, stdio, an in-memory pair for tests —
//! can back a [`Transport`] implementation. The client consumes typed
//! [`TransportMessage`]s; framing and TLS are the transport's concern.

use crate::error::TransportError;
use ahp_types::messages::JsonRpcMessage;
use async_trait::async_trait;

/// A single message flowing in or out over a [`Transport`].
///
/// This is a thin wrapper around [`JsonRpcMessage`] so transports can
/// avoid re-serializing when they already have a decoded value, while
/// remaining free to hand us raw bytes if that's more natural.
#[derive(Debug, Clone, PartialEq)]
pub enum TransportMessage {
    /// A pre-decoded JSON-RPC message.
    Parsed(JsonRpcMessage),
    /// A text frame whose payload is a JSON-RPC message encoded as
    /// UTF-8. The client will parse it.
    Text(String),
    /// A binary frame carrying a JSON-RPC message encoded as UTF-8.
    Binary(Vec<u8>),
}

impl TransportMessage {
    /// Decode this message into a typed [`JsonRpcMessage`].
    pub fn into_parsed(self) -> Result<JsonRpcMessage, TransportError> {
        match self {
            TransportMessage::Parsed(m) => Ok(m),
            TransportMessage::Text(s) => serde_json::from_str(&s)
                .map_err(|e| TransportError::Protocol(e.to_string())),
            TransportMessage::Binary(b) => serde_json::from_slice(&b)
                .map_err(|e| TransportError::Protocol(e.to_string())),
        }
    }

    /// Build a [`TransportMessage`] carrying a JSON-encoded payload.
    pub fn encode(msg: &JsonRpcMessage) -> Result<Self, TransportError> {
        let s = serde_json::to_string(msg).map_err(|e| TransportError::Protocol(e.to_string()))?;
        Ok(TransportMessage::Text(s))
    }
}

/// Pluggable transport trait. Implementations are driven by the
/// [`crate::Client`]; they must deliver inbound messages in order and
/// accept outbound sends serially.
///
/// Transports are expected to be full-duplex and half-closable — the
/// client sends indefinitely until the underlying connection closes,
/// and `recv` signals closure by returning `None`.
#[async_trait]
pub trait Transport: Send + 'static {
    /// Send a single message.
    ///
    /// Errors returned here are typically fatal for the transport
    /// (the connection is broken). The client will surface them to
    /// the pending in-flight request(s) and shut down.
    async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError>;

    /// Receive the next inbound message.
    ///
    /// Returns `Ok(None)` when the remote half of the connection has
    /// cleanly closed. Errors are treated as abnormal closure.
    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError>;

    /// Close the transport and release any underlying resources.
    ///
    /// Default implementation is a no-op — implementations that hold
    /// owned resources (sockets, tasks) should override.
    async fn close(&mut self) -> Result<(), TransportError> {
        Ok(())
    }
}
