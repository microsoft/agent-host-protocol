// Generated from types/*.ts — do not edit

import Foundation

// MARK: - Notification Enums

/// Reason why authentication is required.
public enum AuthRequiredReason: Codable, Sendable, Equatable {
    /// The client has not yet authenticated for the resource
    case required
    /// A previously valid token has expired or been revoked. The client must
    /// acquire or renew the credential rather than replaying the challenged token.
    case expired
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "required": self = .required
        case "expired": self = .expired
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .required: try container.encode("required")
        case .expired: try container.encode("expired")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

// MARK: - Notification Types

/// Bytes in the sender's direction: from the client to the destination, or from
/// the destination to the client.
///
/// The receiver writes the decoded bytes in the order received. The boundaries
/// between `tcp/data` notifications have no meaning. Data is not sent again
/// after the AHP connection is lost.
///
/// Stability: 1.0 - Early development.
public struct TcpDataParams: Codable, Sendable {
    /// The URI of the TCP channel.
    public var channel: String
    /// The bytes, as padded RFC 4648 base64 without whitespace.
    public var data: String

    public init(
        channel: String,
        data: String
    ) {
        self.channel = channel
        self.data = data
    }
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
public struct TcpEofParams: Codable, Sendable {
    /// The URI of the TCP channel.
    public var channel: String

    public init(
        channel: String
    ) {
        self.channel = channel
    }
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
public struct TcpResetParams: Codable, Sendable {
    /// The URI of the TCP channel.
    public var channel: String

    public init(
        channel: String
    ) {
        self.channel = channel
    }
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
public struct ChannelFrameParams: Codable, Sendable {
    /// The URI of the windowed subscription.
    public var channel: String
    /// The next piece of the serialized JSON-RPC message.
    public var data: String
    /// `true` on the last fragment of the message. Absent or `false` on other fragments.
    public var final: Bool?

    public init(
        channel: String,
        data: String,
        final: Bool? = nil
    ) {
        self.channel = channel
        self.data = data
        self.final = final
    }
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
public struct ChannelCreditParams: Codable, Sendable {
    /// The URI of the windowed subscription.
    public var channel: String
    /// Total UTF-16 bytes of data messages and fragments that the receiver has released.
    public var consumedBytes: Int

    public init(
        channel: String,
        consumedBytes: Int
    ) {
        self.channel = channel
        self.consumedBytes = consumedBytes
    }
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
public struct ChannelSnapshotParams: Codable, Sendable {
    /// The URI of the windowed subscription.
    public var channel: String
    /// The channel's state.
    public var snapshot: Snapshot

    public init(
        channel: String,
        snapshot: Snapshot
    ) {
        self.channel = channel
        self.snapshot = snapshot
    }
}

public struct SessionAddedParams: Codable, Sendable {
    /// Channel URI this notification belongs to (the root channel)
    public var channel: String
    /// Summary of the new session
    public var summary: SessionSummary

    public init(
        channel: String,
        summary: SessionSummary
    ) {
        self.channel = channel
        self.summary = summary
    }
}

public struct SessionRemovedParams: Codable, Sendable {
    /// Channel URI this notification belongs to (the root channel)
    public var channel: String
    /// URI of the removed session
    public var session: String

    public init(
        channel: String,
        session: String
    ) {
        self.channel = channel
        self.session = session
    }
}

public struct SessionSummaryChangedParams: Codable, Sendable {
    /// Channel URI this notification belongs to (the root channel)
    public var channel: String
    /// URI of the session whose summary changed
    public var session: String
    /// Mutable summary fields that changed; omitted fields are unchanged.
    ///
    /// Identity fields (`resource`, `provider`, `createdAt`) never change and
    /// MUST be omitted by senders; receivers SHOULD ignore them if present.
    /// When `chats` is present, it replaces the complete compact chat catalog.
    public var changes: PartialSessionSummary

    public init(
        channel: String,
        session: String,
        changes: PartialSessionSummary
    ) {
        self.channel = channel
        self.session = session
        self.changes = changes
    }
}

public struct ProgressParams: Codable, Sendable {
    /// Channel URI this notification belongs to (the root channel).
    public var channel: String
    /// Echoes the `progressToken` the client supplied on the originating request
    /// (e.g. the `progressToken` field of `createSession`), correlating this frame
    /// to that call. Unique across the client's active requests.
    public var progressToken: String
    /// Progress so far, in operation-defined units (e.g. bytes received).
    /// Monotonically non-decreasing for a given `progressToken`.
    public var progress: Int
    /// Total when known up front (e.g. from a `Content-Length`); omitted ⇒
    /// indeterminate. The operation is complete once `progress === total`.
    public var total: Int?
    /// Optional human-readable progress message. The client owns its own
    /// (localized) presentation derived from the originating request; generic
    /// clients that don't track the token MAY display this instead.
    public var message: String?

    public init(
        channel: String,
        progressToken: String,
        progress: Int,
        total: Int? = nil,
        message: String? = nil
    ) {
        self.channel = channel
        self.progressToken = progressToken
        self.progress = progress
        self.total = total
        self.message = message
    }
}

public struct AuthRequiredParams: Codable, Sendable {
    /// Channel URI this notification belongs to
    public var channel: String
    /// Complete RFC 9728 metadata for the protected resource that requires authentication
    public var resource: ProtectedResourceMetadata
    /// Why authentication is required
    public var reason: AuthRequiredReason?

    public init(
        channel: String,
        resource: ProtectedResourceMetadata,
        reason: AuthRequiredReason? = nil
    ) {
        self.channel = channel
        self.resource = resource
        self.reason = reason
    }
}

public struct OtlpExportLogsParams: Codable, Sendable {
    /// Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.logs`).
    public var channel: String
    /// OTLP/JSON `ExportLogsServiceRequest` value. The top-level field is
    /// `resourceLogs: ResourceLogs[]`; nested shapes are defined by
    /// opentelemetry-proto and are not redeclared here.
    public var payload: [String: AnyCodable]

    public init(
        channel: String,
        payload: [String: AnyCodable]
    ) {
        self.channel = channel
        self.payload = payload
    }
}

public struct OtlpExportTracesParams: Codable, Sendable {
    /// Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.traces`).
    public var channel: String
    /// OTLP/JSON `ExportTraceServiceRequest` value. The top-level field is
    /// `resourceSpans: ResourceSpans[]`; nested shapes are defined by
    /// opentelemetry-proto and are not redeclared here.
    public var payload: [String: AnyCodable]

    public init(
        channel: String,
        payload: [String: AnyCodable]
    ) {
        self.channel = channel
        self.payload = payload
    }
}

public struct OtlpExportMetricsParams: Codable, Sendable {
    /// Channel URI this notification belongs to (an `ahp-otlp:` URI advertised on `TelemetryCapabilities.metrics`).
    public var channel: String
    /// OTLP/JSON `ExportMetricsServiceRequest` value. The top-level field is
    /// `resourceMetrics: ResourceMetrics[]`; nested shapes are defined by
    /// opentelemetry-proto and are not redeclared here.
    public var payload: [String: AnyCodable]

    public init(
        channel: String,
        payload: [String: AnyCodable]
    ) {
        self.channel = channel
        self.payload = payload
    }
}

// MARK: - Partial Summary Types

public struct PartialSessionSummary: Codable, Sendable {
    /// Agent provider ID
    public var provider: String?
    /// Session title
    public var title: String?
    /// Current session status
    public var status: SessionStatus?
    /// Human-readable description of what the session is currently doing
    public var activity: String?
    /// Durable {@link AutomationSessionOrigin}, when an automation run created this session.
    public var origin: SessionOrigin?
    /// Server-owned project for this session
    public var project: ProjectInfo?
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
    public var workingDirectories: [String]?
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    public var annotations: AnnotationsSummary?
    /// Session URI
    public var resource: String?
    /// Creation timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    public var createdAt: String?
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    public var modifiedAt: String?
    /// Aggregate summary of file changes associated with this session. Servers
    /// may populate this to give clients a quick at-a-glance view of the
    /// session's footprint (e.g., for list rendering) without requiring the
    /// client to subscribe to a changeset.
    public var changes: ChangesSummary?
    /// Lightweight server-defined metadata clients may use for the session
    /// presentation. The protocol does not interpret these values; producers
    /// SHOULD keep the payload small because summaries appear in session lists
    /// and session notifications.
    public var meta: [String: AnyCodable]?
    /// Lightweight host-authoritative ordered chat catalog.
    public var chats: [SessionChatSummary]?
    /// Chat that receives input when none is selected, independent of catalog position.
    public var defaultChat: String?

    enum CodingKeys: String, CodingKey {
        case provider
        case title
        case status
        case activity
        case origin
        case project
        case workingDirectories
        case annotations
        case resource
        case createdAt
        case modifiedAt
        case changes
        case meta = "_meta"
        case chats
        case defaultChat
    }

    public init(
        provider: String? = nil,
        title: String? = nil,
        status: SessionStatus? = nil,
        activity: String? = nil,
        origin: SessionOrigin? = nil,
        project: ProjectInfo? = nil,
        workingDirectories: [String]? = nil,
        annotations: AnnotationsSummary? = nil,
        resource: String? = nil,
        createdAt: String? = nil,
        modifiedAt: String? = nil,
        changes: ChangesSummary? = nil,
        meta: [String: AnyCodable]? = nil,
        chats: [SessionChatSummary]? = nil,
        defaultChat: String? = nil
    ) {
        self.provider = provider
        self.title = title
        self.status = status
        self.activity = activity
        self.origin = origin
        self.project = project
        self.workingDirectories = workingDirectories
        self.annotations = annotations
        self.resource = resource
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.changes = changes
        self.meta = meta
        self.chats = chats
        self.defaultChat = defaultChat
    }
}

// MARK: - Windowed Delivery

/// Notification methods that do not count against the window on a windowed
/// subscription. Every other notification for a subscription counts.
public let windowExemptMethods: Set<String> = [
    "channel/credit",
    "tcp/reset",
    "unsubscribe",
]

/// Whether a notification with this method counts against the window on a
/// windowed subscription. Methods that are not recognized count.
public func countsAgainstWindow(_ method: String) -> Bool {
    !windowExemptMethods.contains(method)
}
