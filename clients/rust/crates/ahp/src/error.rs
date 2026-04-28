//! Error types used across the SDK.
//!
//! Two error families are exposed:
//!
//! - [`TransportError`] — failures of an underlying [`crate::Transport`]
//!   implementation (closed connection, framing/IO errors).
//! - [`ClientError`] — failures of the higher-level [`crate::Client`]
//!   API: transport errors, JSON-RPC error responses, deserialization
//!   problems, shutdown, cancellation, missing subscriptions, and
//!   sequence gaps that require resubscribing.
//!
//! `ClientError` implements `From<TransportError>` and
//! `From<serde_json::Error>` so client code can use `?` freely.

use ahp_types::messages::JsonRpcError;
use thiserror::Error;

/// Errors raised by a [`crate::Transport`] implementation.
#[derive(Debug, Error)]
pub enum TransportError {
    /// The connection was closed by the remote peer or the transport
    /// reached end-of-stream.
    #[error("connection closed")]
    Closed,

    /// An I/O error occurred on the underlying transport.
    #[error("io error: {0}")]
    Io(String),

    /// The transport received bytes that could not be decoded as a
    /// JSON-RPC message.
    #[error("protocol error: {0}")]
    Protocol(String),
}

/// Errors produced by the SDK client.
#[derive(Debug, Error)]
pub enum ClientError {
    /// A transport-level error prevented the request from completing.
    #[error("transport error: {0}")]
    Transport(#[from] TransportError),

    /// The server returned a JSON-RPC error response.
    #[error("rpc error {}: {}", .0.code, .0.message)]
    Rpc(JsonRpcError),

    /// The response payload could not be decoded into the expected type.
    #[error("failed to deserialize response: {0}")]
    Deserialization(#[from] serde_json::Error),

    /// The client was shut down while the request was in flight.
    #[error("client shut down")]
    Shutdown,

    /// The request was cancelled locally, e.g. because the drop-guard
    /// associated with its handle was dropped.
    #[error("request cancelled")]
    Cancelled,

    /// The requested session or terminal subscription is not tracked by
    /// this client.
    #[error("no such subscription: {0}")]
    UnknownSubscription(String),

    /// An action envelope arrived out of sequence and recovery was
    /// required, but no snapshot was available.
    #[error("sequence gap detected; resubscribe required")]
    SequenceGap,
}
