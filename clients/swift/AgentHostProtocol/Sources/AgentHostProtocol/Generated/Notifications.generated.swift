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

/// Discriminant values for all protocol notifications.
public enum NotificationType: String, Codable, Sendable {
    case sessionAdded = "notify/sessionAdded"
    case sessionRemoved = "notify/sessionRemoved"
    case sessionSummaryChanged = "notify/sessionSummaryChanged"
    case authRequired = "notify/authRequired"
}

// MARK: - Notification Types

public struct SessionAddedNotification: Codable, Sendable {
    public var type: NotificationType
    /// Summary of the new session
    public var summary: SessionSummary

    public init(
        type: NotificationType,
        summary: SessionSummary
    ) {
        self.type = type
        self.summary = summary
    }
}

public struct SessionRemovedNotification: Codable, Sendable {
    public var type: NotificationType
    /// URI of the removed session
    public var session: String

    public init(
        type: NotificationType,
        session: String
    ) {
        self.type = type
        self.session = session
    }
}

public struct SessionSummaryChangedNotification: Codable, Sendable {
    public var type: NotificationType
    /// URI of the session whose summary changed
    public var session: String
    /// Mutable summary fields that changed; omitted fields are unchanged.
    /// 
    /// Identity fields (`resource`, `provider`, `createdAt`) never change and
    /// MUST be omitted by senders; receivers SHOULD ignore them if present.
    public var changes: PartialSessionSummary

    public init(
        type: NotificationType,
        session: String,
        changes: PartialSessionSummary
    ) {
        self.type = type
        self.session = session
        self.changes = changes
    }
}

public struct AuthRequiredNotification: Codable, Sendable {
    public var type: NotificationType
    /// The protected resource identifier that requires authentication
    public var resource: String
    /// Why authentication is required
    public var reason: AuthRequiredReason?

    public init(
        type: NotificationType,
        resource: String,
        reason: AuthRequiredReason? = nil
    ) {
        self.type = type
        self.resource = resource
        self.reason = reason
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
    /// The working directory URI for this session
    public var workingDirectory: String?
    /// Files changed during this session with diff statistics
    public var diffs: [FileEdit]?

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
        workingDirectory: String? = nil,
        diffs: [FileEdit]? = nil
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
        self.workingDirectory = workingDirectory
        self.diffs = diffs
    }
}

// MARK: - ProtocolNotification Union

public enum ProtocolNotification: Codable, Sendable {
    case sessionAdded(SessionAddedNotification)
    case sessionRemoved(SessionRemovedNotification)
    case sessionSummaryChanged(SessionSummaryChangedNotification)
    case authRequired(AuthRequiredNotification)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "notify/sessionAdded":
            self = .sessionAdded(try SessionAddedNotification(from: decoder))
        case "notify/sessionRemoved":
            self = .sessionRemoved(try SessionRemovedNotification(from: decoder))
        case "notify/sessionSummaryChanged":
            self = .sessionSummaryChanged(try SessionSummaryChangedNotification(from: decoder))
        case "notify/authRequired":
            self = .authRequired(try AuthRequiredNotification(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ProtocolNotification discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .sessionAdded(let value): try value.encode(to: encoder)
        case .sessionRemoved(let value): try value.encode(to: encoder)
        case .sessionSummaryChanged(let value): try value.encode(to: encoder)
        case .authRequired(let value): try value.encode(to: encoder)
        }
    }
}
