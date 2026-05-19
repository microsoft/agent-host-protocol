//! WebSocket transport adapter for the [Agent Host Protocol][spec] Rust
//! SDK.
//!
//! [spec]: https://microsoft.github.io/agent-host-protocol/
//!
//! This crate provides [`WebSocketTransport`], an implementation of
//! [`ahp::Transport`] backed by [`tokio-tungstenite`][tt]. It supports
//! both `ws://` and `wss://` URLs (TLS via `native-tls`).
//!
//! [tt]: https://crates.io/crates/tokio-tungstenite
//!
//! # Companion crates
//!
//! - [`ahp`](https://docs.rs/ahp) — the async client and reducers
//! - [`ahp-types`](https://docs.rs/ahp-types) — wire types only
//!
//! # Quickstart
//!
//! ```no_run
//! use ahp::{Client, ClientConfig, SubscriptionEvent};
//! use ahp_ws::WebSocketTransport;
//!
//! # async fn run() -> Result<(), Box<dyn std::error::Error>> {
//! let transport = WebSocketTransport::connect("ws://localhost:12345").await?;
//! let client = Client::connect(transport, ClientConfig::default()).await?;
//!
//! client.initialize("my-client".into(), vec!["0.1.0".into()], vec!["ahp-root://".into()]).await?;
//!
//! let mut sub = client.attach_subscription("ahp-root://").await;
//! while let Some(SubscriptionEvent::Action(env)) = sub.recv().await {
//!     println!("seq={} action={:?}", env.server_seq, env.action);
//! }
//!
//! client.shutdown().await;
//! # Ok(()) }
//! ```
//!
//! # Bring your own connection
//!
//! When you need custom TLS, headers, or a pre-existing socket, drive
//! `tokio-tungstenite` yourself and wrap the result with
//! [`WebSocketTransport::from_stream`]:
//!
//! ```no_run
//! use ahp_ws::WebSocketTransport;
//! use tokio_tungstenite::connect_async;
//!
//! # async fn run() -> Result<(), Box<dyn std::error::Error>> {
//! let (stream, _resp) = connect_async("wss://example.com/ahp").await?;
//! let transport = WebSocketTransport::from_stream(stream);
//! # Ok(()) }
//! ```
//!
//! # Errors
//!
//! Connection-time errors surface as [`WebSocketTransportError`] (URL
//! parse or handshake failure). Once the transport is handed to
//! [`ahp::Client`], runtime errors are reported as
//! [`ahp::TransportError`] on the client's request and subscription
//! futures.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![cfg_attr(docsrs, feature(doc_cfg))]

mod transport;

pub use transport::{WebSocketTransport, WebSocketTransportError};
