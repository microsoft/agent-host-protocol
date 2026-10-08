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
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.contentOrNull

// ─── Notification Enums ─────────────────────────────────────────────────────

/**
 * Reason why authentication is required.
 */
@Serializable(with = AuthRequiredReasonSerializer::class)
@JvmInline
value class AuthRequiredReason(val rawValue: String) {
    companion object {
        /**
         * The client has not yet authenticated for the resource
         */
        val REQUIRED: AuthRequiredReason = AuthRequiredReason("required")
        /**
         * A previously valid token has expired or been revoked. The client must
         * acquire or renew the credential rather than replaying the challenged token.
         */
        val EXPIRED: AuthRequiredReason = AuthRequiredReason("expired")
    }
}

internal object AuthRequiredReasonSerializer : KSerializer<AuthRequiredReason> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("AuthRequiredReason", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: AuthRequiredReason) {
        encoder.encodeString(value.rawValue)
    }
    override fun deserialize(decoder: Decoder): AuthRequiredReason =
        AuthRequiredReason(decoder.decodeString())
}

// ─── Notification Types ─────────────────────────────────────────────────────

/**
 * Bytes in the sender's direction: client to destination, or destination to
 * client.
 * Transport failure terminates the stream; TCP messages are not replayed.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class TcpDataParams(
    val channel: String,
    /**
     * Nonempty canonical padded RFC 4648 base64, without whitespace.
     */
    val data: String
)

/**
 * Ends the sender's logical direction after its preceding data. The opposite
 * direction can continue.   Local bridges decide when queued bytes have drained
 * and how to end their sink. Sending more data after EOF is a protocol error
 * and resets the channel.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class TcpEofParams(
    val channel: String
)

/**
 * Fragment of a serialized typed channel notification. Reassemble before typed
 * decoding or reducer application; data is a string, not another base64 layer.
 * Do not split surrogate pairs. One active data message per direction/subscription;
 * fairly interleave bounded frames across subscriptions and reserve UTF-16 bytes
 * before enqueueing. The ordered transport supplies fragment ordering.
 *
 * On resumable subscriptions, discard incomplete frames and unapplied delivery
 * messages on disconnect. Replay whole actions after the last applied serverSeq
 * through new connection-local windows. Non-resumable subscriptions terminate.
 * Inner and outer channel URIs MUST match. Delivery controls MUST NOT be framed
 * recursively; payload-bearing action echoes MUST use the bounded data path.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelFrameParams(
    val channel: String,
    /**
     * Nonempty serialized-JSON fragment.
     */
    val data: String,
    /**
     * True completes this logical message; absence/false means more fragments follow.
     */
    val final: Boolean? = null
)

/**
 * Receiver's cumulative UTF-16 release boundary for the sender's outgoing direction
 * on this transport. Counters start at zero on subscription and reconnect.
 * Duplicate/older positions are harmless. A boundary beyond sent data, within
 * a message, or inconsistent with local sent-message boundaries MUST fail explicitly.
 *
 * Return credit after bounded consumption, not JSON parsing or action echo.
 * Forwarding endpoints release AHP message allocations through the same bounded
 * consumer contract and backpressure their underlying sockets independently.
 * Credit from old transports or subscription callbacks MUST NOT release capacity
 * in a new window; implementations fence it using local generations.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelCreditParams(
    val channel: String,
    val consumedBytes: Long
)

/**
 * Bootstrap boundary after snapshot/replay frames and before live delivery.
 * Consumers MUST run during bootstrap, not wait for this signal before reading.
 * Process this signal in subscription order, after preceding complete messages.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelReadyParams(
    val channel: String
)

/**
 * Abort incomplete delivery and terminate this subscription. Never skip a fragment
 * and continue. Credit, ready, reset, and liveness bypass data credit with
 * separate size/rate bounds. Stream channels MUST abort their retained stream
 * when delivery cannot continue safely.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelResetParams(
    val channel: String
)

/**
 * Typed snapshot payload carried inside windowed channel/frame delivery, never
 * as an unbounded bootstrap result. snapshot.resource MUST equal channel.
 * Not sent on ordinary subscriptions.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelSnapshotParams(
    val channel: String,
    val snapshot: Snapshot
)

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
     * When `chats` is present, it replaces the complete compact chat catalog.
     */
    val changes: PartialSessionSummary
)

@Serializable
data class ProgressParams(
    /**
     * Channel URI this notification belongs to (the root channel).
     */
    val channel: String,
    /**
     * Echoes the `progressToken` the client supplied on the originating request
     * (e.g. the `progressToken` field of `createSession`), correlating this frame
     * to that call. Unique across the client's active requests.
     */
    val progressToken: String,
    /**
     * Progress so far, in operation-defined units (e.g. bytes received).
     * Monotonically non-decreasing for a given `progressToken`.
     */
    val progress: Long,
    /**
     * Total when known up front (e.g. from a `Content-Length`); omitted ⇒
     * indeterminate. The operation is complete once `progress === total`.
     */
    val total: Long? = null,
    /**
     * Optional human-readable progress message. The client owns its own
     * (localized) presentation derived from the originating request; generic
     * clients that don't track the token MAY display this instead.
     */
    val message: String? = null
)

@Serializable
data class AuthRequiredParams(
    /**
     * Channel URI this notification belongs to
     */
    val channel: String,
    /**
     * Complete RFC 9728 metadata for the protected resource that requires authentication
     */
    val resource: ProtectedResourceMetadata,
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
     * Durable {@link AutomationSessionOrigin}, when an automation run created this session.
     */
    val origin: SessionOrigin? = null,
    /**
     * Server-owned project for this session
     */
    val project: ProjectInfo? = null,
    /**
     * The working directories the session's agent has tool access to, as
     * maintained by working-directory actions. Directories are equal peers except
     * when the agent advertises
     * {@link MultipleWorkingDirectoriesCapability.immutablePrimary} without
     * {@link MultipleWorkingDirectoriesCapability.primaryReplacement} (the first
     * entry is then a fixed process root), or advertises `primaryReplacement`
     * (the first entry is a protected, replaceable primary slot). Individual chats
     * MAY restrict to a subset via
     * {@link ChatSummary.workingDirectories | their own `workingDirectories`}; a
     * chat that sets none operates against this full set.
     */
    val workingDirectories: List<String>? = null,
    /**
     * Lightweight summary of this session's inline annotations channel
     * (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
     * annotation / entry counts without subscribing. Absent when the session
     * does not expose an annotations channel.
     */
    val annotations: AnnotationsSummary? = null,
    /**
     * Session URI
     */
    val resource: String? = null,
    /**
     * Creation timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
     */
    val createdAt: String? = null,
    /**
     * Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
     */
    val modifiedAt: String? = null,
    /**
     * Aggregate summary of file changes associated with this session. Servers
     * may populate this to give clients a quick at-a-glance view of the
     * session's footprint (e.g., for list rendering) without requiring the
     * client to subscribe to a changeset.
     */
    val changes: ChangesSummary? = null,
    /**
     * Lightweight server-defined metadata clients may use for the session
     * presentation. The protocol does not interpret these values; producers
     * SHOULD keep the payload small because summaries appear in session lists
     * and session notifications.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Lightweight host-authoritative ordered chat catalog.
     */
    val chats: List<SessionChatSummary>? = null,
    /**
     * Chat that receives input when none is selected, independent of catalog position.
     */
    val defaultChat: String? = null
)
