//! Agent Host Protocol SDK — async client, reducers, and pluggable
//! transports.
//!
//! AHP is a JSON-RPC protocol that lets a host (an editor, IDE, shell,
//! or test harness) talk to an agent backend through a small set of
//! subscribe / dispatch / reduce primitives. This crate is the Rust
//! implementation of the **client** side.
//!
//! For a tour of the protocol itself, see the
//! [protocol documentation](https://microsoft.github.io/agent-host-protocol/).
//!
//! # Crate layout
//!
//! | Item | Use it for |
//! |---|---|
//! | [`Client`] | Connect to a server, subscribe to resources, dispatch actions |
//! | [`reducers`] | Apply [`StateAction`](ahp_types::actions::StateAction) to local state in a fully deterministic way |
//! | [`Transport`] | Pluggable trait for any framed message stream |
//! | [`ClientError`] / [`TransportError`] | Error taxonomy |
//!
//! # Companion crates
//!
//! - [`ahp_types`] — wire types only, no I/O
//! - [`ahp-ws`](https://docs.rs/ahp-ws) — WebSocket transport built on `tokio-tungstenite`
//!
//! # Quickstart (WebSocket)
//!
//! Connect over WebSocket, initialize, and stream events from a
//! session. The example below uses the [`ahp-ws`](https://docs.rs/ahp-ws)
//! crate; replace the transport line with any other [`Transport`]
//! implementation if you have one.
//!
//! ```no_run
//! use ahp::{Client, ClientConfig, SubscriptionEvent};
//! use ahp_ws::WebSocketTransport;
//!
//! # async fn run() -> Result<(), Box<dyn std::error::Error>> {
//! let transport = WebSocketTransport::connect("ws://localhost:12345").await?;
//! let client = Client::connect(transport, ClientConfig::default()).await?;
//!
//! client.initialize("my-client".into(), vec!["0.1.0".into()], vec![]).await?;
//! let (_snap, mut sub) = client.subscribe("ahp-session:/s1".into()).await?;
//!
//! while let Some(SubscriptionEvent::Action(env)) = sub.recv().await {
//!     println!("seq={} action={:?}", env.server_seq, env.action);
//! }
//!
//! client.shutdown().await;
//! # Ok(()) }
//! ```
//!
//! # Quickstart (any transport)
//!
//! The same flow works against any [`Transport`] implementation:
//!
//! ```no_run
//! # async fn run<T: ahp::Transport>(transport: T) -> Result<(), ahp::ClientError> {
//! use ahp::{Client, ClientConfig, SubscriptionEvent};
//!
//! let client = Client::connect(transport, ClientConfig::default()).await?;
//! client.initialize("my-client".into(), vec!["0.1.0".into()], vec!["ahp-root://".into()]).await?;
//!
//! let mut sub = client.attach_subscription("ahp-root://").await;
//! while let Some(ev) = sub.recv().await {
//!     match ev {
//!         SubscriptionEvent::Action(a) => println!("seq={}", a.server_seq),
//!         _ => {}
//!     }
//! }
//!
//! client.shutdown().await;
//! # Ok(()) }
//! ```
//!
//! # Subscriptions
//!
//! Subscribe to a URI to receive its [`SubscriptionEvent`] stream:
//!
//! - `ahp-root://` — global agent host state (agents, session index)
//! - `ahp-session:/<id>` — a single chat session
//! - `terminal:/<id>` — a terminal
//!
//! [`Client::subscribe`] sends a `subscribe` request and returns the
//! initial snapshot together with a [`SessionSubscription`] handle.
//! [`Client::attach_subscription`] creates a local handle without an
//! extra round-trip — useful when the URI was already passed to
//! `initialize` via `initialSubscriptions`.
//!
//! Multiple [`SessionSubscription`]s can fan out from a single URI;
//! each handle has its own broadcast cursor. Drop the handle to stop
//! receiving events; call [`Client::unsubscribe`] to release the
//! server-side subscription.
//!
//! # Dispatching actions
//!
//! Local UI mutations are dispatched through [`Client::dispatch`]. The
//! client assigns a monotonically increasing `clientSeq` and sends a
//! `dispatchAction` notification. The server eventually echoes the
//! action back as a normal envelope; reducers can be applied identically
//! to both sources, so write-ahead state is naturally reconciled.
//!
//! # Reducers
//!
//! Reducers are pure functions that translate a [`StateAction`](ahp_types::actions::StateAction)
//! into mutations on [`RootState`](ahp_types::state::RootState),
//! [`SessionState`](ahp_types::state::SessionState), or
//! [`TerminalState`](ahp_types::state::TerminalState).
//!
//! ```
//! use ahp::reducers::{apply_action_to_root, ReduceOutcome};
//! use ahp::ahp_types::actions::{RootActiveSessionsChangedAction, StateAction};
//! use ahp::ahp_types::state::RootState;
//!
//! let mut root = RootState {
//!     agents: vec![],
//!     active_sessions: None,
//!     terminals: None,
//!     config: None,
//!     meta: None,
//! };
//!
//! let action = StateAction::RootActiveSessionsChanged(
//!     RootActiveSessionsChangedAction { active_sessions: 3 },
//! );
//!
//! assert_eq!(apply_action_to_root(&mut root, &action), ReduceOutcome::Applied);
//! assert_eq!(root.active_sessions, Some(3));
//! ```
//!
//! Each reducer returns a [`ReduceOutcome`] that distinguishes mutations
//! ([`ReduceOutcome::Applied`]), recognized but inert events
//! ([`ReduceOutcome::NoOp`]), and out-of-scope routing
//! ([`ReduceOutcome::OutOfScope`]). A client holding all three state
//! trees can blindly fan every action out to every reducer without
//! special-casing.
//!
//! # Cancellation and shutdown
//!
//! All async client APIs are cancel-safe at await points. The background
//! driver is owned by the [`Client`] and aborted when the last clone is
//! dropped, or when [`Client::shutdown`] is called. In-flight requests
//! resolve with [`ClientError::Shutdown`] in either case.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![cfg_attr(docsrs, feature(doc_cfg))]

pub mod client;
pub mod error;
pub mod hosts;
pub mod multi_host_state_mirror;
pub mod reducers;
pub mod transport;

pub use ahp_types;

pub use client::{
    Client, ClientConfig, ClientEvent, ClientEventStream, DispatchHandle, ResourceRequestHandlers,
    ServerRequestFuture, ServerRequestHandler, SessionSubscription, SubscriptionEvent,
};
pub use error::{ClientError, TransportError};
pub use multi_host_state_mirror::{HostedResourceKey, MultiHostStateMirror};
pub use reducers::{
    apply_action_to_root, apply_action_to_session, apply_action_to_terminal, ReduceOutcome,
};
pub use transport::{BoxedTransport, DynTransport, Transport, TransportMessage};
