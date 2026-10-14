// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:rust

#![allow(missing_docs)]

#[allow(unused_imports)]
use crate::common::{AnyValue, JsonObject, StringOrMarkdown, Uri};
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use serde_repr::{Deserialize_repr, Serialize_repr};

#[allow(unused_imports)]
use crate::state::{
    AgentSelection, AnnotationsSummary, ChangesSummary, Changeset, FileEdit, ModelSelection,
    ProjectInfo, ProtectedResourceMetadata, SessionChatSummary, SessionOrigin, SessionStatus,
    SessionSummary, Snapshot,
};

// ─── Enums ────────────────────────────────────────────────────────────

/// Reason why authentication is required.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum AuthRequiredReason {
    /// The client has not yet authenticated for the resource
    Required,
    /// A previously valid token has expired or been revoked. The client must
    /// acquire or renew the credential rather than replaying the challenged token.
    Expired,
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    Unknown(String),
}

impl serde::Serialize for AuthRequiredReason {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::Required => serializer.serialize_str("required"),
            Self::Expired => serializer.serialize_str("expired"),
            Self::Unknown(value) => serializer.serialize_str(value),
        }
    }
}

impl<'de> serde::Deserialize<'de> for AuthRequiredReason {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = <String as serde::Deserialize>::deserialize(deserializer)?;
        Ok(match raw.as_str() {
            "required" => Self::Required,
            "expired" => Self::Expired,
            _ => Self::Unknown(raw),
        })
    }
}

// ─── Notification Payloads ────────────────────────────────────────────

/// Bytes in the sender's direction: from the client to the destination, or from
/// the destination to the client.
///
/// The receiver writes the decoded bytes in the order received. The boundaries
/// between `tcp/data` notifications have no meaning. Data is not sent again
/// after the AHP connection is lost.
///
/// Stability: 1.0 - Early development.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpDataParams {
    /// The URI of the TCP channel.
    pub channel: Uri,
    /// The bytes, as padded RFC 4648 base64 without whitespace.
    pub data: String,
}

/// Ends the sender's direction after the data that it has already sent, like a
/// TCP FIN. The other direction can continue. The sender MUST NOT send more
/// `tcp/data` after `tcp/eof`.
///
/// This notification counts against the window, so the sender may have to wait
/// for credit before sending it. A receiver MUST release `tcp/data` as it writes
/// the bytes, without waiting for `tcp/eof`.
///
/// Stability: 1.0 - Early development.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpEofParams {
    /// The URI of the TCP channel.
    pub channel: Uri,
}

/// Aborts the connection in both directions, like a TCP RST.
///
/// The sender discards data that it has not yet sent. The receiver discards data
/// that it has not yet written, and closes its own side of the connection. The
/// host sends `tcp/reset` when the destination connection fails or is reset, or
/// when the client sends invalid data. The client sends it to abort the
/// connection without waiting for buffered data to be written. After `tcp/reset`,
/// neither peer sends more data on the channel.
///
/// Unlike `tcp/data` and `tcp/eof`, this notification does not count against the
/// window, so it can be sent when the window is full.
///
/// Stability: 1.0 - Early development.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpResetParams {
    /// The URI of the TCP channel.
    pub channel: Uri,
}

/// One fragment of a data message on a windowed subscription.
///
/// A sender uses fragments when a data message is larger than
/// `maximumFrameBytes`, and to let subscriptions take turns so that one busy
/// subscription does not hold up the whole connection. It serializes the message
/// to JSON text, divides the text into pieces, and sends each piece in order. The
/// receiver joins the `data` strings and parses the result only after it receives
/// the fragment with `final: true`.
///
/// Fragments MUST NOT be empty and MUST NOT divide a UTF-16 surrogate pair. The
/// channel inside the joined message MUST match `channel`. For each subscription
/// and direction, only one fragmented message can be in progress. Control
/// messages, requests, and responses MUST NOT be sent in fragments.
///
/// Each fragment counts against the window when it is sent, by the size of the
/// complete `channel/frame` message, including its envelope and escape
/// characters. If the window becomes full partway through a message, the sender
/// waits for credit before it sends the next fragment.
///
/// Stability: 1.0 - Early development.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelFrameParams {
    /// The URI of the windowed subscription.
    pub channel: Uri,
    /// The next piece of the serialized JSON-RPC message.
    pub data: String,
    /// `true` on the last fragment of the message. Absent or `false` on other fragments.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#final: Option<bool>,
}

/// Reports how much data the receiver has released.
///
/// `consumedBytes` is the total size, in UTF-16 bytes, of the data messages and
/// fragments that the receiver has released on this subscription. It is a total,
/// not an increment, and can be any value up to the amount of data sent; it does
/// not need to match the end of a message or fragment. The size of a message or
/// fragment is the size of its complete JSON-RPC text as received.
///
/// The receiver decides when to send credit; for example, after it applies an
/// action, after stream data leaves its local buffer, or after it stores a
/// fragment for reassembly. When outstanding data reaches `windowBytes`, the
/// receiver MUST send credit as soon as it is ready to receive more data.
///
/// A sender ignores a value that is not greater than the previous value. The
/// protocol does not define what happens when the value is greater than the data
/// sent; an implementation can log the error or close the connection.
///
/// Stability: 1.0 - Early development.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelCreditParams {
    /// The URI of the windowed subscription.
    pub channel: Uri,
    /// Total UTF-16 bytes of data messages and fragments that the receiver has released.
    pub consumed_bytes: i64,
}

/// Sends the state of a channel to a windowed subscription.
///
/// On a windowed subscription, the `subscribe` result does not contain a
/// snapshot. The server sends this notification instead. It MUST be the first
/// data message that the server sends on every windowed subscription, and the
/// first after `snapshot` recovery. If it is sent in fragments, this applies to
/// the joined message. Data messages after it are changes to this state, or new
/// data for the channel. For a channel whose state has no fields,
/// `snapshot.state` is an {@link EmptyState} and `snapshot.fromSeq` is the
/// server's current `serverSeq`.
///
/// This is a data message that counts against the window. The server can send it
/// in `channel/frame` fragments, and MUST do so if it is larger than
/// `maximumFrameBytes`. `snapshot.resource` MUST be the same as `channel`.
///
/// The server does not send this notification on ordinary subscriptions.
///
/// Stability: 1.0 - Early development.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelSnapshotParams {
    /// The URI of the windowed subscription.
    pub channel: Uri,
    /// The channel's state.
    pub snapshot: Snapshot,
}

/// Broadcast to all clients subscribed to the root channel when a new session
/// is created.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAddedParams {
    /// Channel URI this notification belongs to (the root channel)
    pub channel: Uri,
    /// Summary of the new session
    pub summary: SessionSummary,
}

/// Broadcast to all clients subscribed to the root channel when a session is
/// disposed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRemovedParams {
    /// Channel URI this notification belongs to (the root channel)
    pub channel: Uri,
    /// URI of the removed session
    pub session: Uri,
}

/// Broadcast to all clients subscribed to the root channel when an existing
/// session's summary changes (title, status, `modifiedAt`, model, working
/// directory, read/done state, or diff statistics).
///
/// This notification lets clients that maintain a cached session list — for
/// example, the result of a previous `listSessions()` call — stay in sync with
/// in-flight sessions without having to subscribe to every session URI
/// individually. It is complementary to, not a replacement for,
/// `root/sessionAdded` and `root/sessionRemoved`: those signal lifecycle
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
///   server has surfaced via `listSessions()` or `root/sessionAdded`.
///   Servers MAY coalesce or debounce updates for noisy fields (for example,
///   `modifiedAt` bumps while a turn is streaming) at their discretion.
/// - Clients that have no cached entry for `session` MAY ignore the
///   notification; it is not a substitute for `root/sessionAdded`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryChangedParams {
    /// Channel URI this notification belongs to (the root channel)
    pub channel: Uri,
    /// URI of the session whose summary changed
    pub session: Uri,
    /// Mutable summary fields that changed; omitted fields are unchanged.
    ///
    /// Identity fields (`resource`, `provider`, `createdAt`) never change and
    /// MUST be omitted by senders; receivers SHOULD ignore them if present.
    /// When `chats` is present, it replaces the complete compact chat catalog.
    pub changes: PartialSessionSummary,
}

/// Generic progress notification for a long-running operation.
///
/// A client opts in to progress for a request by including a `progressToken` in
/// that request (today: the `progressToken` field on `createSession`). If the
/// server does long-running work to service the request — e.g. lazily
/// downloading an agent's native SDK the first time a session of that provider
/// is materialized — it emits `progress` notifications carrying the same token.
///
/// The notification is operation-agnostic: it says nothing about *what* is
/// progressing. The client correlates `progressToken` back to the request it
/// originated from (and thus the UI surface awaiting it) and renders its own
/// localized indicator. The same channel serves any future long-running
/// operation without a new method.
///
/// Semantics:
///
/// - `progress` is monotonically non-decreasing for a given `progressToken`.
/// - `total` is present only when the server knows the magnitude up front
///   (e.g. a `Content-Length`); when absent the client SHOULD show an
///   indeterminate indicator.
/// - The operation is complete when `progress === total`. The server MUST emit a
///   final frame satisfying `progress === total`; when the total was never
///   known, it sets `total` to the final `progress` on that frame. No further
///   frames reference the token afterwards.
/// - The server MAY emit no progress at all (e.g. the work was already done);
///   the client then never shows an indicator.
/// - Like all notifications this is ephemeral and is **not** replayed on
///   reconnect. A client that never receives the terminal frame SHOULD expire
///   the indicator after an idle timeout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressParams {
    /// Channel URI this notification belongs to (the root channel).
    pub channel: Uri,
    /// Echoes the `progressToken` the client supplied on the originating request
    /// (e.g. the `progressToken` field of `createSession`), correlating this frame
    /// to that call. Unique across the client's active requests.
    pub progress_token: String,
    /// Progress so far, in operation-defined units (e.g. bytes received).
    /// Monotonically non-decreasing for a given `progressToken`.
    pub progress: i64,
    /// Total when known up front (e.g. from a `Content-Length`); omitted ⇒
    /// indeterminate. The operation is complete once `progress === total`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
    /// Optional human-readable progress message. The client owns its own
    /// (localized) presentation derived from the originating request; generic
    /// clients that don't track the token MAY display this instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Sent by the server when a protected resource requires (re-)authentication.
///
/// This notification MAY be associated with any channel — for example, an
/// agent advertised on the root channel, or a per-session resource. The
/// `channel` field identifies the subscription the auth requirement belongs
/// to; the `resource` field carries the complete OAuth protected resource
/// metadata (per RFC 9728).
///
/// Clients should obtain or renew the credential and push the resulting token
/// via the `authenticate` command. When `reason` is `expired`, clients MUST NOT
/// blindly replay the challenged token.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRequiredParams {
    /// Channel URI this notification belongs to
    pub channel: Uri,
    /// Complete RFC 9728 metadata for the protected resource that requires authentication
    pub resource: ProtectedResourceMetadata,
    /// Why authentication is required
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<AuthRequiredReason>,
}

/// Delivers a batch of OTLP log records to a client subscribed to the host's
/// logs channel (advertised on `TelemetryCapabilities.logs`).
///
/// The `payload` field is an OTLP/JSON `ExportLogsServiceRequest` value
/// verbatim — i.e. an object of shape `{ resourceLogs: ResourceLogs[] }` as
/// defined by [opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/collector/logs/v1/logs_service.proto).
/// AHP does not redeclare the OTLP type system; clients SHOULD use an
/// OpenTelemetry SDK or schema to parse it.
///
/// Like other protocol notifications, this is not stored in the channel's
/// state and is not replayed on reconnect. Subscribers receive only batches emitted after
/// their `subscribe` succeeds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtlpExportLogsParams {
    /// Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.logs`).
    pub channel: Uri,
    /// OTLP/JSON `ExportLogsServiceRequest` value. The top-level field is
    /// `resourceLogs: ResourceLogs[]`; nested shapes are defined by
    /// opentelemetry-proto and are not redeclared here.
    pub payload: JsonObject,
}

/// Delivers a batch of OTLP spans to a client subscribed to the host's
/// traces channel (advertised on `TelemetryCapabilities.traces`).
///
/// The `payload` field is an OTLP/JSON `ExportTraceServiceRequest` value
/// verbatim — i.e. an object of shape `{ resourceSpans: ResourceSpans[] }`
/// as defined by [opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/collector/trace/v1/trace_service.proto).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtlpExportTracesParams {
    /// Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.traces`).
    pub channel: Uri,
    /// OTLP/JSON `ExportTraceServiceRequest` value. The top-level field is
    /// `resourceSpans: ResourceSpans[]`; nested shapes are defined by
    /// opentelemetry-proto and are not redeclared here.
    pub payload: JsonObject,
}

/// Delivers a batch of OTLP metric data points to a client subscribed to
/// the host's metrics channel (advertised on `TelemetryCapabilities.metrics`).
///
/// The `payload` field is an OTLP/JSON `ExportMetricsServiceRequest` value
/// verbatim — i.e. an object of shape `{ resourceMetrics: ResourceMetrics[] }`
/// as defined by [opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/collector/metrics/v1/metrics_service.proto).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtlpExportMetricsParams {
    /// Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.metrics`).
    pub channel: Uri,
    /// OTLP/JSON `ExportMetricsServiceRequest` value. The top-level field is
    /// `resourceMetrics: ResourceMetrics[]`; nested shapes are defined by
    /// opentelemetry-proto and are not redeclared here.
    pub payload: JsonObject,
}

// ─── Partial Summaries ────────────────────────────────────────────────

/// Partial equivalent of SessionSummary — every field is optional for delta updates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PartialSessionSummary {
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
    /// Durable {@link AutomationSessionOrigin}, when an automation run created this session.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<SessionOrigin>,
    /// Server-owned project for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectInfo>,
    /// The working directories the session's agent has tool access to, as
    /// maintained by working-directory actions. Directories are equal peers except
    /// when the agent advertises
    /// {@link MultipleWorkingDirectoriesCapability.immutablePrimary} without
    /// {@link MultipleWorkingDirectoriesCapability.primaryReplacement} (the first
    /// entry is then a fixed process root), or advertises `primaryReplacement`
    /// (the first entry is a protected, replaceable primary slot). Individual chats
    /// MAY restrict to a subset via
    /// {@link ChatSummary.workingDirectories | their own `workingDirectories`}; a
    /// chat that sets none operates against this full set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directories: Option<Vec<Uri>>,
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<AnnotationsSummary>,
    /// Session URI
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource: Option<Uri>,
    /// Creation timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    /// Aggregate summary of file changes associated with this session. Servers
    /// may populate this to give clients a quick at-a-glance view of the
    /// session's footprint (e.g., for list rendering) without requiring the
    /// client to subscribe to a changeset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changes: Option<ChangesSummary>,
    /// Lightweight server-defined metadata clients may use for the session
    /// presentation. The protocol does not interpret these values; producers
    /// SHOULD keep the payload small because summaries appear in session lists
    /// and session notifications.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Lightweight host-authoritative ordered chat catalog.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chats: Option<Vec<SessionChatSummary>>,
    /// Chat that receives input when none is selected, independent of catalog position.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_chat: Option<Uri>,
}

// ─── Windowed Delivery ────────────────────────────────────────────────

/// Notification methods that do not count against the window on a windowed
/// subscription. Every other notification for a subscription counts.
pub const WINDOW_EXEMPT_METHODS: &[&str] = &["channel/credit", "tcp/reset", "unsubscribe"];

/// Whether a notification with this method counts against the window on a
/// windowed subscription. Methods that are not recognized count.
pub fn counts_against_window(method: &str) -> bool {
    !WINDOW_EXEMPT_METHODS.contains(&method)
}
