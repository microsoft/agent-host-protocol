//! WebSocket transport adapter for the Agent Host Protocol SDK.
//!
//! Provides [`WebSocketTransport`], an implementation of
//! [`ahp::Transport`] on top of `tokio-tungstenite`.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

mod transport;

pub use transport::{WebSocketTransport, WebSocketTransportError};
