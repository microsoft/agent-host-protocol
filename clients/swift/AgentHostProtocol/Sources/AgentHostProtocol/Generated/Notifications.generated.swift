// Generated from types/*.ts — do not edit

import Foundation

// MARK: - Notification Enums

/// Reason why authentication is required.
public enum AuthRequiredReason: String, Codable, Sendable {
    /// The client has not yet authenticated for the resource
    case required = "required"
    /// A previously valid token has expired or been revoked
    case expired = "expired"
}

// MARK: - Notification Types

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

public struct AuthRequiredParams: Codable, Sendable {
    /// Channel URI this notification belongs to
    public var channel: String
    /// The protected resource identifier that requires authentication
    public var resource: String
    /// Why authentication is required
    public var reason: AuthRequiredReason?

    public init(
        channel: String,
        resource: String,
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
    /// Session URI
    public var resource: String?
    /// Agent provider ID
    public var provider: String?
    /// Session title
    public var title: String?
    /// Current session status
    public var status: SessionStatus?
    /// Human-readable description of what the session is currently doing
    public var activity: String?
    /// Creation timestamp
    public var createdAt: Int?
    /// Last modification timestamp
    public var modifiedAt: Int?
    /// Server-owned project for this session
    public var project: ProjectInfo?
    /// Currently selected model
    public var model: ModelSelection?
    /// Currently selected custom agent.
    ///
    /// Absent (`undefined`) means no custom agent is selected for this session
    /// — the session uses the provider's default behavior.
    public var agent: AgentSelection?
    /// The default working directory URI for this session. Individual chats
    /// MAY override via {@link ChatSummary.workingDirectory | their own
    /// `workingDirectory`}; this field acts as the fallback for any chat that
    /// does not.
    public var workingDirectory: String?
    /// Aggregate summary of file changes associated with this session. Servers
    /// may populate this to give clients a quick at-a-glance view of the
    /// session's footprint (e.g., for list rendering) without requiring the
    /// client to subscribe to a changeset.
    public var changes: ChangesSummary?
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    public var annotations: AnnotationsSummary?

    public init(
        resource: String? = nil,
        provider: String? = nil,
        title: String? = nil,
        status: SessionStatus? = nil,
        activity: String? = nil,
        createdAt: Int? = nil,
        modifiedAt: Int? = nil,
        project: ProjectInfo? = nil,
        model: ModelSelection? = nil,
        agent: AgentSelection? = nil,
        workingDirectory: String? = nil,
        changes: ChangesSummary? = nil,
        annotations: AnnotationsSummary? = nil
    ) {
        self.resource = resource
        self.provider = provider
        self.title = title
        self.status = status
        self.activity = activity
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.project = project
        self.model = model
        self.agent = agent
        self.workingDirectory = workingDirectory
        self.changes = changes
        self.annotations = annotations
    }
}
