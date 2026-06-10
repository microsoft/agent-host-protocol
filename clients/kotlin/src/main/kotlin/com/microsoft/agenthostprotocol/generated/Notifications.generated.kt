// Generated from types/*.ts — do not edit

package com.microsoft.agenthostprotocol.generated

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull

// ─── Notification Enums ─────────────────────────────────────────────────────

/**
 * Reason why authentication is required.
 */
@Serializable
enum class AuthRequiredReason {
    /**
     * The client has not yet authenticated for the resource
     */
    @SerialName("required")
    REQUIRED,
    /**
     * A previously valid token has expired or been revoked
     */
    @SerialName("expired")
    EXPIRED
}

// ─── Notification Types ─────────────────────────────────────────────────────

@Serializable
data class SessionAddedParams(
    /**
     * Channel URI this notification belongs to (the root channel)
     */
    val channel: String,
    /**
     * Summary of the new session
     */
    val summary: SessionSummary
)

@Serializable
data class SessionRemovedParams(
    /**
     * Channel URI this notification belongs to (the root channel)
     */
    val channel: String,
    /**
     * URI of the removed session
     */
    val session: String
)

@Serializable
data class SessionSummaryChangedParams(
    /**
     * Channel URI this notification belongs to (the root channel)
     */
    val channel: String,
    /**
     * URI of the session whose summary changed
     */
    val session: String,
    /**
     * Mutable summary fields that changed; omitted fields are unchanged.
     *
     * Identity fields (`resource`, `provider`, `createdAt`) never change and
     * MUST be omitted by senders; receivers SHOULD ignore them if present.
     */
    val changes: PartialSessionSummary
)

@Serializable
data class AuthRequiredParams(
    /**
     * Channel URI this notification belongs to
     */
    val channel: String,
    /**
     * The protected resource identifier that requires authentication
     */
    val resource: String,
    /**
     * Why authentication is required
     */
    val reason: AuthRequiredReason? = null
)

@Serializable
data class OtlpExportLogsParams(
    /**
     * Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.logs`).
     */
    val channel: String,
    /**
     * OTLP/JSON `ExportLogsServiceRequest` value. The top-level field is
     * `resourceLogs: ResourceLogs[]`; nested shapes are defined by
     * opentelemetry-proto and are not redeclared here.
     */
    val payload: Map<String, JsonElement>
)

@Serializable
data class OtlpExportTracesParams(
    /**
     * Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.traces`).
     */
    val channel: String,
    /**
     * OTLP/JSON `ExportTraceServiceRequest` value. The top-level field is
     * `resourceSpans: ResourceSpans[]`; nested shapes are defined by
     * opentelemetry-proto and are not redeclared here.
     */
    val payload: Map<String, JsonElement>
)

@Serializable
data class OtlpExportMetricsParams(
    /**
     * Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.metrics`).
     */
    val channel: String,
    /**
     * OTLP/JSON `ExportMetricsServiceRequest` value. The top-level field is
     * `resourceMetrics: ResourceMetrics[]`; nested shapes are defined by
     * opentelemetry-proto and are not redeclared here.
     */
    val payload: Map<String, JsonElement>
)

// ─── Partial Summary Types ──────────────────────────────────────────────────

@Serializable
data class PartialSessionSummary(
    /**
     * Session URI
     */
    val resource: String? = null,
    /**
     * Agent provider ID
     */
    val provider: String? = null,
    /**
     * Session title
     */
    val title: String? = null,
    /**
     * Current session status
     */
    val status: SessionStatus? = null,
    /**
     * Human-readable description of what the session is currently doing
     */
    val activity: String? = null,
    /**
     * Creation timestamp
     */
    val createdAt: Long? = null,
    /**
     * Last modification timestamp
     */
    val modifiedAt: Long? = null,
    /**
     * Server-owned project for this session
     */
    val project: ProjectInfo? = null,
    /**
     * Currently selected model
     */
    val model: ModelSelection? = null,
    /**
     * Currently selected custom agent.
     *
     * Absent (`undefined`) means no custom agent is selected for this session
     * — the session uses the provider's default behavior.
     */
    val agent: AgentSelection? = null,
    /**
     * The default working directory URI for this session. Individual chats
     * MAY override via {@link ChatSummary.workingDirectory | their own
     * `workingDirectory`}; this field acts as the fallback for any chat that
     * does not.
     */
    val workingDirectory: String? = null,
    /**
     * Aggregate summary of file changes associated with this session. Servers
     * may populate this to give clients a quick at-a-glance view of the
     * session's footprint (e.g., for list rendering) without requiring the
     * client to subscribe to a changeset.
     */
    val changes: ChangesSummary? = null,
    /**
     * Lightweight summary of this session's inline annotations channel
     * (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
     * annotation / entry counts without subscribing. Absent when the session
     * does not expose an annotations channel.
     */
    val annotations: AnnotationsSummary? = null
)
