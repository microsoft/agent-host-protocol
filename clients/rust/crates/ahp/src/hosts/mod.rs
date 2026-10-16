//! Multi-host client SDK.
//!
//! A consumer that wants to talk to two or more AHP hosts at once would
//! otherwise have to hand-roll N independent [`crate::Client`]s, N
//! transports, N reconnect supervisors, a per-host metadata registry,
//! and a fan-in of inbound events tagged with host of origin. This
//! module ships that machinery as [`MultiHostClient`].
//!
//! Single-host consumers are not left out: [`MultiHostClient::single`]
//! is a one-line constructor that yields the same [`HostHandle`]
//! abstraction without the consumer ever touching registry concepts.
//!
//! # Anatomy
//!
//! - [`HostId`] — opaque, stable, consumer-supplied identifier per host.
//! - [`HostConfig`] — what the multi-host client needs to open a host:
//!   id, label, [`HostTransportFactory`], reconnect policy, `clientId`,
//!   initial subscriptions, [`crate::ClientConfig`].
//! - [`HostHandle`] — observable snapshot per host: connection state,
//!   protocol version, last error (a typed [`crate::ClientError`]),
//!   agents, session summaries, etc. This is the surface UIs render.
//! - [`HostClientHandle`] — generation-checked escape hatch. Wraps the
//!   underlying single-host [`crate::Client`] and refuses to dispatch
//!   through a connection that has since been replaced.
//! - [`HostSubscriptionEvent`] — fan-in event tagged with host id and
//!   resource URI.
//! - [`HostEvent`] — connection-level event for UX (state changes,
//!   reconnect attempts, etc.).
//! - [`MultiHostClient`] — the public API.
//!
//! # `clientId`
//!
//! Each host needs a stable `clientId` so the AHP `reconnect` flow
//! works. [`HostConfig::new`] generates a session-stable UUID by
//! default; for cross-launch identity persist the value yourself (e.g.
//! in your app's keychain) and pass it via
//! [`HostConfig::with_client_id`] on subsequent launches.
//!
//! # Quickstart (single-host)
//!
//! ```no_run
//! # use ahp::transport::BoxedTransport;
//! # use ahp::TransportError;
//! # use ahp::hosts::HostError;
//! # async fn open(_: ahp::hosts::HostId) -> Result<BoxedTransport, TransportError> {
//! #     unimplemented!()
//! # }
//! # async fn run() -> Result<(), HostError> {
//! use ahp::hosts::{HostConfig, MultiHostClient};
//!
//! let config = HostConfig::new("local", "Local sessions server", open);
//! let (client, handle) = MultiHostClient::single(config).await?;
//! println!("connected to {}: {:?}", handle.label, handle.state);
//! # let _ = client; Ok(()) }
//! ```
//!
//! # Quickstart (multi-host)
//!
//! ```no_run
//! # use ahp::transport::BoxedTransport;
//! # use ahp::TransportError;
//! # use ahp::hosts::HostError;
//! # async fn open_local(_: ahp::hosts::HostId) -> Result<BoxedTransport, TransportError> { unimplemented!() }
//! # async fn open_remote(_: ahp::hosts::HostId) -> Result<BoxedTransport, TransportError> { unimplemented!() }
//! # async fn run() -> Result<(), HostError> {
//! use ahp::hosts::{HostConfig, MultiHostClient};
//!
//! let multi = MultiHostClient::new();
//! multi.add_host(HostConfig::new("local", "Local", open_local)).await?;
//! multi.add_host(HostConfig::new("remote", "Tunnel", open_remote)).await?;
//!
//! let mut events = multi.events();
//! while let Some(event) = events.recv().await {
//!     println!("[{}] {:?}", event.host_id, event.event);
//! }
//! # Ok(()) }
//! ```
//!
//! # Reconnect, generation, and ownership
//!
//! Each host runs in its own internal task — the
//! [`HostRuntime`](runtime::HostRuntime) (private) — that owns the
//! current [`crate::Client`], retries the configured
//! [`ReconnectPolicy`], and re-subscribes to known URIs across
//! reconnects. Every reconnect bumps the host's `generation`. Any
//! [`HostClientHandle`] you obtained from a previous connection refuses
//! to dispatch on the new connection and returns
//! [`HostError::HostReconnected`] — you must request a fresh handle
//! via [`MultiHostClient::client`].

#![allow(clippy::module_inception)]

mod client_id_store;
mod factory;
mod multi;
mod policy;
mod runtime;
mod types;

pub use client_id_store::{ClientIdStore, FileClientIdStore, InMemoryClientIdStore};
pub use factory::HostTransportFactory;
pub use multi::MultiHostClient;
pub use policy::{Backoff, ReconnectPolicy};
pub use types::{
    HostClientHandle, HostConfig, HostError, HostEvent, HostEventStream, HostFlowControlEvent,
    HostHandle, HostId, HostState, HostSubscriptionEvent, HostSubscriptionStream, HostedAgent,
    HostedSessionSummary,
};
