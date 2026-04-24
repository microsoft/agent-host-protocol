//! Agent Host Protocol SDK — transport-agnostic client, reducers, and
//! JSON-RPC plumbing.
//!
//! This crate builds on [`ahp_types`] and adds:
//!
//! - [`reducers`] — pure state reducers ported from `types/reducers.ts`
//! - [`transport`] — pluggable [`transport::Transport`] trait for any
//!   framed byte stream (WebSocket, TCP, stdio, …)
//! - [`client`] — async JSON-RPC client with action subscription,
//!   write-ahead dispatch, and reconnect/replay
//! - [`error`] — error types returned by the client and reducers

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod client;
pub mod error;
pub mod reducers;
pub mod transport;

pub use ahp_types;

pub use client::{Client, ClientConfig, DispatchHandle, SessionSubscription, SubscriptionEvent};
pub use error::{ClientError, TransportError};
pub use reducers::{
    apply_action_to_root, apply_action_to_session, apply_action_to_terminal, ReduceOutcome,
};
pub use transport::{Transport, TransportMessage};
