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
    ProjectInfo, SessionStatus, SessionSummary,
};

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

// ─── Notification Payloads ────────────────────────────────────────────

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
/// to; the `resource` field carries the OAuth-protected resource identifier
/// (per RFC 9728).
///
/// Clients should obtain a fresh token and push it via the `authenticate`
/// command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRequiredParams {
    /// Channel URI this notification belongs to
    pub channel: Uri,
    /// The protected resource identifier that requires authentication
    pub resource: String,
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
/// Like all stateless-channel notifications, this is ephemeral: it is not
/// replayed on reconnect. Subscribers receive only batches emitted after
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
    /// Currently selected custom agent.
    ///
    /// Absent (`undefined`) means no custom agent is selected for this session
    /// — the session uses the provider's default behavior.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentSelection>,
    /// The default working directory URI for this session. Individual chats
    /// MAY override via {@link ChatSummary.workingDirectory | their own
    /// `workingDirectory`}; this field acts as the fallback for any chat that
    /// does not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Aggregate summary of file changes associated with this session. Servers
    /// may populate this to give clients a quick at-a-glance view of the
    /// session's footprint (e.g., for list rendering) without requiring the
    /// client to subscribe to a changeset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changes: Option<ChangesSummary>,
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<AnnotationsSummary>,
    /// Lightweight server-defined metadata clients may use for the session
    /// presentation. The protocol does not interpret these values; producers
    /// SHOULD keep the payload small because summaries appear in session lists
    /// and session notifications.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}
