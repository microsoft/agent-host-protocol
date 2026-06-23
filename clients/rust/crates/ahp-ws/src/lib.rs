//! WebSocket transport adapter for the [Agent Host Protocol][spec] Rust
//! SDK.
//!
//! [spec]: https://microsoft.github.io/agent-host-protocol/
//!
//! This crate provides [`WebSocketTransport`], an implementation of
//! [`ahp::Transport`] backed by [`tokio-tungstenite`][tt]. It supports
//! both `ws://` and `wss://` URLs.
//!
//! [tt]: https://crates.io/crates/tokio-tungstenite
//!
//! # TLS backends
//!
//! `wss://` support is selected by Cargo feature. The default,
//! `rustls-tls-native-roots`, uses [rustls] (a pure-Rust stack, so no
//! OpenSSL on Linux) with roots loaded from the OS trust store, which keeps
//! dials working through a TLS-intercepting egress proxy whose CA lives in
//! the platform store. Override it with `default-features = false` plus one
//! of:
//!
//! - `native-tls` — the platform TLS stack (SChannel / Secure Transport /
//!   OpenSSL).
//! - `rustls-tls-native-roots` — rustls with OS-trust-store roots (default).
//! - `rustls-tls-webpki-roots` — rustls with the bundled Mozilla root set;
//!   does not see enterprise/proxy CAs that live only in the OS store.
//!
//! With no TLS feature enabled, only `ws://` works and `wss://` fails at
//! connect time.
//!
//! If more than one backend ends up enabled — which Cargo feature
//! unification can do when several crates in the graph request different
//! ones — `native-tls` takes precedence over the rustls backends, because
//! `tokio-tungstenite`'s automatic connector prefers it. Because any crate
//! in the graph can pull in `native-tls`, your own feature selection alone
//! can't guarantee which backend [`WebSocketTransport::connect`] uses. When
//! you need a specific backend regardless of the final feature set, build a
//! `tokio-tungstenite` connector explicitly and wrap the result with
//! [`WebSocketTransport::from_stream`].
//!
//! [rustls]: https://crates.io/crates/rustls
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
