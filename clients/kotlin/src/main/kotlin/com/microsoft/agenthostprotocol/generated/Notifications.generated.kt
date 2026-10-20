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
 * Bytes in the sender's direction: from the client to the destination, or from
 * the destination to the client.
 *
 * The receiver writes the decoded bytes in the order received. The boundaries
 * between `tcp/data` notifications have no meaning. Data is not sent again
 * after the AHP connection is lost.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class TcpDataParams(
    /**
     * The URI of the TCP channel.
     */
    val channel: String,
    /**
     * The bytes, as padded RFC 4648 base64 without whitespace.
     */
    val data: String
)

/**
 * Ends the sender's direction after the data that it has already sent, like a
 * TCP FIN. The other direction can continue. The sender MUST NOT send more
 * `tcp/data` after `tcp/eof`.
 *
 * This notification counts against the window, so the sender may have to wait
 * for credit before sending it. A receiver MUST release `tcp/data` as it writes
 * the bytes, without waiting for `tcp/eof`.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class TcpEofParams(
    /**
     * The URI of the TCP channel.
     */
    val channel: String
)

/**
 * Aborts the connection in both directions, like a TCP RST.
 *
 * The sender discards data that it has not yet sent. The receiver discards data
 * that it has not yet written, and closes its own side of the connection. The
 * host sends `tcp/reset` when the destination connection fails or is reset, or
 * when the client sends invalid data. The client sends it to abort the
 * connection without waiting for buffered data to be written. After `tcp/reset`,
 * neither peer sends more data on the channel.
 *
 * Unlike `tcp/data` and `tcp/eof`, this notification does not count against the
 * window, so it can be sent when the window is full.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class TcpResetParams(
    /**
     * The URI of the TCP channel.
     */
    val channel: String
)

/**
 * One fragment of a data message on a windowed subscription.
 *
 * A sender uses fragments when a data message is larger than
 * `maximumFrameBytes`, and to let subscriptions take turns so that one busy
 * subscription does not hold up the whole connection. It serializes the message
 * to JSON text, divides the text into pieces, and sends each piece in order. The
 * receiver joins the `data` strings and parses the result only after it receives
 * the fragment with `final: true`.
 *
 * Fragments MUST NOT be empty and MUST NOT divide a UTF-16 surrogate pair. The
 * channel inside the joined message MUST match `channel`. For each subscription
 * and direction, only one fragmented message can be in progress. Control
 * messages, requests, and responses MUST NOT be sent in fragments.
 *
 * Each fragment counts against the window when it is sent, by the size of the
 * complete `channel/frame` message, including its envelope and escape
 * characters. If the window becomes full partway through a message, the sender
 * waits for credit before it sends the next fragment.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelFrameParams(
    /**
     * The URI of the windowed subscription.
     */
    val channel: String,
    /**
     * The next piece of the serialized JSON-RPC message.
     */
    val data: String,
    /**
     * `true` on the last fragment of the message. Absent or `false` on other fragments.
     */
    val final: Boolean? = null
)

/**
 * Reports how much data the receiver has released.
 *
 * `consumedBytes` is the total size, in UTF-16 bytes, of the data messages and
 * fragments that the receiver has released on this subscription. It is a total,
 * not an increment, and can be any value up to the amount of data sent; it does
 * not need to match the end of a message or fragment. The size of a message or
 * fragment is the size of its complete JSON-RPC text as received.
 *
 * The receiver decides when to send credit; for example, after it applies an
 * action, after stream data leaves its local buffer, or after it stores a
 * fragment for reassembly. When outstanding data reaches `windowBytes`, the
 * receiver MUST send credit as soon as it is ready to receive more data.
 *
 * A sender ignores a value that is not greater than the previous value. The
 * protocol does not define what happens when the value is greater than the data
 * sent; an implementation can log the error or close the connection.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelCreditParams(
    /**
     * The URI of the windowed subscription.
     */
    val channel: String,
    /**
     * Total UTF-16 bytes of data messages and fragments that the receiver has released.
     */
    val consumedBytes: Long
)

/**
 * Sends the state of a channel to a windowed subscription.
 *
 * On a windowed subscription, the `subscribe` result does not contain a
 * snapshot. The server sends this notification instead. It MUST be the first
 * data message that the server sends on every windowed subscription, and the
 * first after `snapshot` recovery. If it is sent in fragments, this applies to
 * the joined message. Data messages after it are changes to this state, or new
 * data for the channel. For a channel whose state has no fields,
 * `snapshot.state` is an {@link EmptyState} and `snapshot.fromSeq` is the
 * server's current `serverSeq`.
 *
 * This is a data message that counts against the window. The server can send it
 * in `channel/frame` fragments, and MUST do so if it is larger than
 * `maximumFrameBytes`. `snapshot.resource` MUST be the same as `channel`.
 *
 * The server does not send this notification on ordinary subscriptions.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ChannelSnapshotParams(
    /**
     * The URI of the windowed subscription.
     */
    val channel: String,
    /**
     * The channel's state.
     */
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

// ─── Windowed Delivery ────────────────────────────────────────────────

/**
 * Notification methods that do not count against the window on a windowed
 * subscription. Every other notification for a subscription counts.
 */
public val WINDOW_EXEMPT_METHODS: Set<String> = setOf(
    "channel/credit",
    "tcp/reset",
    "unsubscribe",
)

/**
 * Whether a notification with this method counts against the window on a
 * windowed subscription. Methods that are not recognized count.
 */
public fun countsAgainstWindow(method: String): Boolean = method !in WINDOW_EXEMPT_METHODS
