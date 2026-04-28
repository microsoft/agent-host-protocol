//! Wire protocol types for the [Agent Host Protocol (AHP)][spec].
//!
//! `ahp-types` is the data-only crate of the AHP family. Every command,
//! action, notification, and state object defined by the protocol has a
//! Rust counterpart here — `Serialize` + `Deserialize`, using the exact
//! same JSON field names as the wire format. There is no I/O, no async
//! runtime, and no transport code; if you only need to parse or
//! construct AHP messages, this is the only crate you need.
//!
//! These types are generated from the TypeScript source of truth in
//! `types/*.ts`, so any change to the protocol surfaces here first.
//!
//! [spec]: https://microsoft.github.io/agent-host-protocol/
//!
//! # Companion crates
//!
//! | Crate | What it adds |
//! |---|---|
//! | [`ahp`](https://docs.rs/ahp) | Async client, reducers, and pluggable [`Transport`](https://docs.rs/ahp/latest/ahp/transport/trait.Transport.html) trait |
//! | [`ahp-ws`](https://docs.rs/ahp-ws) | WebSocket transport built on `tokio-tungstenite` |
//!
//! # Module map
//!
//! | Module | Contents |
//! |---|---|
//! | [`state`]         | [`RootState`], [`SessionState`], [`TerminalState`], tool-call lifecycle |
//! | [`actions`]       | [`StateAction`] discriminated union and [`ActionEnvelope`] |
//! | [`commands`]      | Request/response parameter and result types (`initialize`, `subscribe`, …) |
//! | [`notifications`] | Server-pushed [`ProtocolNotification`]s |
//! | [`messages`]      | JSON-RPC wire envelopes ([`JsonRpcMessage`] and friends) |
//! | [`errors`]        | AHP and JSON-RPC [error codes][errors::AhpErrorCode] |
//! | [`version`]       | Negotiation constants ([`PROTOCOL_VERSION`]) |
//! | [`common`]        | Hand-written primitives ([`Uri`], [`StringOrMarkdown`], …) |
//!
//! # Examples
//!
//! ## Parse an action envelope
//!
//! ```
//! use ahp_types::actions::{ActionEnvelope, StateAction};
//!
//! let json = r#"{
//!   "action": { "type": "session/titleChanged", "session": "copilot:/s1", "title": "Hi" },
//!   "serverSeq": 7,
//!   "origin": null
//! }"#;
//! let env: ActionEnvelope = serde_json::from_str(json)?;
//! assert_eq!(env.server_seq, 7);
//! match env.action {
//!     StateAction::SessionTitleChanged(a) => assert_eq!(a.title, "Hi"),
//!     _ => panic!("unexpected variant"),
//! }
//! # Ok::<_, serde_json::Error>(())
//! ```
//!
//! ## Build an `initialize` request
//!
//! ```
//! use ahp_types::commands::InitializeParams;
//! use ahp_types::messages::{JsonRpcMessage, JsonRpcRequest, JsonRpcVersion};
//! use ahp_types::common::AnyValue;
//!
//! let params = InitializeParams {
//!     protocol_version: ahp_types::PROTOCOL_VERSION as i64,
//!     client_id: "my-host/1.0".into(),
//!     initial_subscriptions: Some(vec!["agenthost:/root".into()]),
//!     locale: Some("en".into()),
//! };
//!
//! let req = JsonRpcMessage::Request(JsonRpcRequest {
//!     jsonrpc: JsonRpcVersion::V2,
//!     id: 1,
//!     method: "initialize".into(),
//!     params: Some(AnyValue::from(serde_json::to_value(&params)?)),
//! });
//!
//! let wire = serde_json::to_string(&req)?;
//! assert!(wire.contains("\"method\":\"initialize\""));
//! # Ok::<_, serde_json::Error>(())
//! ```
//!
//! ## Inspect a session status bitset
//!
//! [`SessionStatus`](state::SessionStatus) packs activity and metadata
//! flags into a single value — use bitwise checks rather than equality:
//!
//! ```
//! use ahp_types::state::SessionStatus;
//!
//! let status = SessionStatus::InProgress as u32 | SessionStatus::IsArchived as u32;
//! assert_ne!(status & SessionStatus::InProgress as u32, 0);
//! assert_ne!(status & SessionStatus::IsArchived as u32, 0);
//! ```
//!
//! # Compatibility
//!
//! - JSON field names match the protocol exactly (`camelCase`); use the
//!   provided `Serialize`/`Deserialize` derives rather than manually
//!   building JSON.
//! - Unknown enum variants surface as a generic `Unknown` arm where the
//!   protocol allows forward-compatible extension (see e.g.
//!   [`state::ToolCallState`]).
//! - The protocol version this crate speaks is exposed as
//!   [`PROTOCOL_VERSION`].

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![cfg_attr(docsrs, feature(doc_cfg))]

pub mod actions;
pub mod commands;
pub mod common;
pub mod errors;
pub mod messages;
pub mod notifications;
pub mod state;
pub mod version;

pub use actions::{ActionEnvelope, ActionOrigin, ActionType, StateAction};
pub use common::{StringOrMarkdown, Uri};
pub use errors::{AhpErrorCode, JsonRpcErrorCode};
pub use messages::{JsonRpcError, JsonRpcErrorResponse, JsonRpcMessage};
pub use notifications::{NotificationType, ProtocolNotification};
pub use state::{Icon, ProtectedResourceMetadata, RootState, SessionState, TerminalState};
pub use version::PROTOCOL_VERSION;
