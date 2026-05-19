// HostHandle — observable snapshot of everything `MultiHostClient` knows
// about a single host.

import Foundation
import AgentHostProtocol

/// Snapshot of everything the multi-host SDK knows about a single host.
///
/// This is the value type UIs render: connection state, last error, protocol
/// version, agents pulled from root state, subscribed URIs, cached session
/// summaries, and so on.
///
/// Snapshots are immutable; refresh by calling
/// `MultiHostClient.host(_:)`/`MultiHostClient.hosts()` again or by listening
/// to `MultiHostClient.hostEvents()`.
public struct HostHandle: Sendable {
    /// Stable identifier.
    public let id: HostId
    /// Human-readable label from the original `HostConfig`.
    public let label: String
    /// `clientId` actually sent to the host on `initialize`/`reconnect`.
    public let clientId: String
    /// Current connection state.
    public let state: HostState
    /// Most recent error message, set when the supervisor enters
    /// `.reconnecting` or `.failed`. Cleared on a successful connect.
    public let lastError: String?
    /// Wall-clock time of the most recent successful `initialize` or
    /// `reconnect`. `nil` until the host first connects.
    public let lastConnectedAt: Date?
    /// Protocol version negotiated with the host on the most recent
    /// successful `initialize`.
    public let protocolVersion: String?
    /// Highest `serverSeq` observed on this host.
    public let serverSeq: Int
    /// Optional `defaultDirectory` from the host's `InitializeResult`.
    public let defaultDirectory: String?
    /// Agents currently advertised by the host (mirrored from root state).
    public let agents: [AgentInfo]
    /// Active session count from root state, when present.
    public let activeSessions: Int?
    /// Lightweight terminal listing from root state, when present.
    public let terminals: [TerminalInfo]?
    /// URIs the supervisor will (re-)subscribe to across reconnects.
    public let subscriptions: [String]
    /// Trigger characters from `InitializeResult.completionTriggerCharacters`.
    public let completionTriggerCharacters: [String]
    /// Cached session summaries, sorted by `modifiedAt` descending. Seeded by
    /// `listSessions` after each connect and kept fresh by
    /// `root/sessionAdded`/`root/sessionRemoved`/`root/sessionSummaryChanged`.
    public let sessionSummaries: [SessionSummary]
    /// Generation counter — bumped on every `connect` or `reconnect`.
    /// `HostClientHandle`s carry the generation they were issued at and
    /// refuse to dispatch through a stale connection.
    public let generation: UInt64

    public init(
        id: HostId,
        label: String,
        clientId: String,
        state: HostState,
        lastError: String?,
        lastConnectedAt: Date?,
        protocolVersion: String?,
        serverSeq: Int,
        defaultDirectory: String?,
        agents: [AgentInfo],
        activeSessions: Int?,
        terminals: [TerminalInfo]?,
        subscriptions: [String],
        completionTriggerCharacters: [String],
        sessionSummaries: [SessionSummary],
        generation: UInt64
    ) {
        self.id = id
        self.label = label
        self.clientId = clientId
        self.state = state
        self.lastError = lastError
        self.lastConnectedAt = lastConnectedAt
        self.protocolVersion = protocolVersion
        self.serverSeq = serverSeq
        self.defaultDirectory = defaultDirectory
        self.agents = agents
        self.activeSessions = activeSessions
        self.terminals = terminals
        self.subscriptions = subscriptions
        self.completionTriggerCharacters = completionTriggerCharacters
        self.sessionSummaries = sessionSummaries
        self.generation = generation
    }
}
