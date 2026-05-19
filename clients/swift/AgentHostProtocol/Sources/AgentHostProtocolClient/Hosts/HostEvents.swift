// HostEvents — fan-in event types and aggregated view types for `MultiHostClient`.

import Foundation
import AgentHostProtocol

/// Inbound subscription event tagged with the host that produced it.
///
/// Delivered by `MultiHostClient.events()`. `resource` carries the URI of
/// the channel the event was delivered on — for actions, this is
/// `envelope.channel`; for protocol notifications, this is the
/// `channel` field on the notification's params (typically the root channel
/// for session-catalogue events).
public struct HostSubscriptionEvent: Sendable {
    public let hostId: HostId
    public let resource: String?
    public let event: SubscriptionEvent

    public init(hostId: HostId, resource: String?, event: SubscriptionEvent) {
        self.hostId = hostId
        self.resource = resource
        self.event = event
    }
}

/// Connection-level event for UX, delivered by `MultiHostClient.hostEvents()`.
public enum HostEvent: Sendable {
    /// A new host was registered with `MultiHostClient.add(_:)`.
    case added(HostId)
    /// The host's `HostState` changed.
    case stateChanged(HostId, HostState, lastError: String?)
    /// The host received and applied a successful `reconnect` result.
    case reconnectResult(HostId, ReconnectResult)
    /// The host successfully (re)connected; `generation` is the new value.
    case connected(HostId, generation: UInt64)
    /// A host was removed from `MultiHostClient`.
    case removed(HostId)
}

/// Aggregated session summary tagged with host of origin.
///
/// Returned by `MultiHostClient.aggregatedSessions()`. URIs are per-host
/// scoped, so two hosts can legitimately advertise the same `summary.resource`;
/// consumers should treat `(hostId, summary.resource)` as the compound key.
public struct HostedSessionSummary: Sendable {
    public let hostId: HostId
    public let hostLabel: String
    public let summary: SessionSummary

    public init(hostId: HostId, hostLabel: String, summary: SessionSummary) {
        self.hostId = hostId
        self.hostLabel = hostLabel
        self.summary = summary
    }
}

/// Aggregated agent descriptor tagged with host of origin.
///
/// Returned by `MultiHostClient.aggregatedAgents()`.
public struct HostedAgent: Sendable {
    public let hostId: HostId
    public let hostLabel: String
    public let agent: AgentInfo

    public init(hostId: HostId, hostLabel: String, agent: AgentInfo) {
        self.hostId = hostId
        self.hostLabel = hostLabel
        self.agent = agent
    }
}
