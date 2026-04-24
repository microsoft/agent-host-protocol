// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:rust

#![allow(missing_docs)]

#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use serde_repr::{Deserialize_repr, Serialize_repr};
#[allow(unused_imports)]
use crate::common::{AnyValue, JsonObject, StringOrMarkdown, Uri};

#[allow(unused_imports)]
use crate::state::{FileEdit, ModelSelection, ProjectInfo, SessionStatus, SessionSummary};

// ─── Enums ────────────────────────────────────────────────────────────

/// Reason why authentication is required.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AuthRequiredReason {
    /// The client has not yet authenticated for the resource
    #[serde(rename = "required")]
    Required,
    /// A previously valid token has expired or been revoked
    #[serde(rename = "expired")]
    Expired,
}

/// Discriminant values for all protocol notifications.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum NotificationType {
    #[serde(rename = "notify/sessionAdded")]
    SessionAdded,
    #[serde(rename = "notify/sessionRemoved")]
    SessionRemoved,
    #[serde(rename = "notify/sessionSummaryChanged")]
    SessionSummaryChanged,
    #[serde(rename = "notify/authRequired")]
    AuthRequired,
}

// ─── Notification Payloads ────────────────────────────────────────────

/// Broadcast to all connected clients when a new session is created.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAddedNotification {
    /// Summary of the new session
    pub summary: SessionSummary,
}

/// Broadcast to all connected clients when a session is disposed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRemovedNotification {
    /// URI of the removed session
    pub session: Uri,
}

/// Broadcast to all connected clients when an existing session's summary
/// changes (title, status, `modifiedAt`, model, working directory, read/done
/// state, or diff statistics).
/// 
/// This notification lets clients that maintain a cached session list — for
/// example, the result of a previous `listSessions()` call — stay in sync with
/// in-flight sessions without having to subscribe to every session URI
/// individually. It is complementary to, not a replacement for,
/// `notify/sessionAdded` and `notify/sessionRemoved`: those signal lifecycle
/// (creation/disposal), while this signals summary-level mutations on an
/// already-known session.
/// 
/// Semantics:
/// 
/// - Only fields present in `changes` have new values; omitted fields are
///   unchanged on the client's cached summary.
/// - Identity fields (`resource`, `provider`, `createdAt`) never change and
///   are not carried.
/// - Like all protocol notifications, this is ephemeral: it is **not**
///   replayed on reconnect. On reconnect, clients should re-fetch the full
///   catalog via `listSessions()` as usual.
/// - The server SHOULD emit this notification whenever any mutable field on
///   {@link SessionSummary | `SessionSummary`} changes for a session the
///   server has surfaced via `listSessions()` or `notify/sessionAdded`.
///   Servers MAY coalesce or debounce updates for noisy fields (for example,
///   `modifiedAt` bumps while a turn is streaming, or rapidly changing
///   `diffs`) at their discretion.
/// - Clients that have no cached entry for `session` MAY ignore the
///   notification; it is not a substitute for `notify/sessionAdded`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryChangedNotification {
    /// URI of the session whose summary changed
    pub session: Uri,
    /// Mutable summary fields that changed; omitted fields are unchanged.
    /// 
    /// Identity fields (`resource`, `provider`, `createdAt`) never change and
    /// MUST be omitted by senders; receivers SHOULD ignore them if present.
    pub changes: PartialSessionSummary,
}

/// Sent by the server when a protected resource requires (re-)authentication.
/// 
/// This notification is sent when a previously valid token expires or is
/// revoked, or when the server discovers a new authentication requirement.
/// Clients should obtain a fresh token and push it via the `authenticate`
/// command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRequiredNotification {
    /// The protected resource identifier that requires authentication
    pub resource: String,
    /// Why authentication is required
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<AuthRequiredReason>,
}

// ─── Partial Summaries ────────────────────────────────────────────────

/// Partial equivalent of SessionSummary — every field is optional for delta updates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PartialSessionSummary {
    /// Session URI
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource: Option<Uri>,
    /// Agent provider ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Session title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Current session status
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<u32>,
    /// Human-readable description of what the session is currently doing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Creation timestamp
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
    /// Last modification timestamp
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<i64>,
    /// Server-owned project for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectInfo>,
    /// Currently selected model
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelSelection>,
    /// The working directory URI for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Files changed during this session with diff statistics
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diffs: Option<Vec<FileEdit>>,
}

// ─── ProtocolNotification Union ───────────────────────────────────────

/// Discriminated union of all protocol notifications.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ProtocolNotification {
    #[serde(rename = "notify/sessionAdded")]
    SessionAdded(SessionAddedNotification),
    #[serde(rename = "notify/sessionRemoved")]
    SessionRemoved(SessionRemovedNotification),
    #[serde(rename = "notify/sessionSummaryChanged")]
    SessionSummaryChanged(SessionSummaryChangedNotification),
    #[serde(rename = "notify/authRequired")]
    AuthRequired(AuthRequiredNotification),
}
