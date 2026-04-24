//! Wire protocol types for the Agent Host Protocol (AHP).
//!
//! This crate provides Rust counterparts for the TypeScript source-of-truth
//! types in `types/`. All types are `Serialize` + `Deserialize` and use the
//! same JSON field names as the protocol.
//!
//! # Modules
//!
//! - [`state`] — `RootState`, `SessionState`, tool call lifecycle, terminal state
//! - [`actions`] — `StateAction` discriminated union and `ActionEnvelope`
//! - [`commands`] — command params and results
//! - [`notifications`] — protocol notifications
//! - [`messages`] — JSON-RPC wire envelopes
//! - [`errors`] — AHP and JSON-RPC error codes
//! - [`version`] — protocol version constants
//!
//! # Example
//!
//! ```
//! use ahp_types::actions::{ActionEnvelope, StateAction};
//! use ahp_types::state::SessionStatus;
//!
//! let json = r#"{
//!   "action": { "type": "session/titleChanged", "session": "copilot:/s1", "title": "Hi" },
//!   "serverSeq": 7,
//!   "origin": null
//! }"#;
//! let env: ActionEnvelope = serde_json::from_str(json).unwrap();
//! assert_eq!(env.server_seq, 7);
//! match env.action {
//!     StateAction::SessionTitleChanged(a) => assert_eq!(a.title, "Hi"),
//!     _ => panic!("unexpected variant"),
//! }
//! ```

#![forbid(unsafe_code)]
#![warn(missing_docs)]

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
