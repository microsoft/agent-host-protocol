//! Hand-written primitives that the code generator relies on.
//!
//! The generator emits strongly typed Rust counterparts for all TypeScript
//! interfaces and enums into `state.rs`, `actions.rs`, `commands.rs`,
//! `notifications.rs`, and `messages.rs`. This file contains the small set of
//! bespoke shapes the generator cannot express as a plain struct.

use serde::{Deserialize, Serialize};

/// A URI string, e.g. `ahp-root://` or `ahp-session:/<uuid>`.
pub type Uri = String;

/// Well-known channel URI for the root channel.
///
/// Subscribe to this URI to receive [`crate::state::RootState`] snapshots
/// and root-level actions (agents changed, active sessions changed,
/// terminals changed, config changed). Always present on every host.
pub const ROOT_RESOURCE_URI: &str = "ahp-root://";

/// A string that may optionally be rendered as Markdown.
///
/// Serialized as either a plain JSON string or `{ "markdown": "..." }`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StringOrMarkdown {
    /// Plain text rendered verbatim.
    Plain(String),
    /// Markdown-rendered object `{ "markdown": "..." }`.
    Markdown {
        /// Markdown source.
        markdown: String,
    },
}

impl Default for StringOrMarkdown {
    fn default() -> Self {
        Self::Plain(String::new())
    }
}

impl StringOrMarkdown {
    /// Returns the raw text regardless of kind.
    pub fn as_text(&self) -> &str {
        match self {
            Self::Plain(s) => s,
            Self::Markdown { markdown } => markdown,
        }
    }

    /// Append plain text to the underlying content.
    pub fn push_str(&mut self, more: &str) {
        match self {
            Self::Plain(s) => s.push_str(more),
            Self::Markdown { markdown } => markdown.push_str(more),
        }
    }
}

impl From<String> for StringOrMarkdown {
    fn from(s: String) -> Self {
        Self::Plain(s)
    }
}

impl From<&str> for StringOrMarkdown {
    fn from(s: &str) -> Self {
        Self::Plain(s.to_owned())
    }
}

/// Type alias for a JSON object. Used for `_meta`, `structuredContent`, and
/// other `Record<string, unknown>` fields.
pub type JsonObject = serde_json::Map<String, serde_json::Value>;

/// Opaque JSON value (the Rust counterpart to the TypeScript `unknown` type).
pub type AnyValue = serde_json::Value;
