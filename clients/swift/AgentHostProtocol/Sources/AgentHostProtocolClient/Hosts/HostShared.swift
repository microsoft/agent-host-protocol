// HostShared — internal mutable per-host state, shared between `HostRuntime`
// and `HostClientHandle`s.
//
// `HostShared` is a small actor wrapping `HostInternal`. The runtime mutates
// this state under actor isolation; `HostClientHandle` reads it to validate
// its generation and to fetch the underlying `AHPClient` reference.

import Foundation
import AgentHostProtocol

/// Internal mutable per-host state. Updated by the runtime task; read on the
/// snapshot path to build `HostHandle`s and by `HostClientHandle.checkAlive()`
/// to validate generation tokens.
internal struct HostInternal {
    var id: HostId
    var label: String
    var clientId: String
    var state: HostState
    var lastError: String?
    var lastConnectedAt: Date?
    var protocolVersion: String?
    var serverSeq: Int
    var defaultDirectory: String?
    var automations: AutomationCapabilities?
    var rootState: RootState
    var subscriptions: [String]
    var completionTriggerCharacters: [String]
    /// Session summaries keyed by URI. Sorted on snapshot.
    var sessionSummaries: [String: SessionSummary]
    var generation: UInt64
    /// The currently-installed `AHPClient`, when connected. `nil` between
    /// connections.
    var currentClient: AHPClient?

    func snapshot() -> HostHandle {
        let summaries = sessionSummaries.values
            .sorted { $0.modifiedAt > $1.modifiedAt }
        return HostHandle(
            id: id,
            label: label,
            clientId: clientId,
            state: state,
            lastError: lastError,
            lastConnectedAt: lastConnectedAt,
            protocolVersion: protocolVersion,
            serverSeq: serverSeq,
            defaultDirectory: defaultDirectory,
            automations: automations,
            agents: rootState.agents,
            activeSessions: rootState.activeSessions,
            terminals: rootState.terminals,
            subscriptions: subscriptions,
            completionTriggerCharacters: completionTriggerCharacters,
            sessionSummaries: summaries,
            generation: generation
        )
    }
}

/// Actor-protected wrapper around `HostInternal`. Designed to be cheap to
/// poke from outside the runtime (e.g. for `HostClientHandle.checkAlive()`)
/// without contending against the supervisor's I/O.
internal actor HostShared {
    private(set) var internalState: HostInternal

    init(_ initial: HostInternal) {
        self.internalState = initial
    }

    /// Take an immutable snapshot.
    func snapshot() -> HostHandle {
        internalState.snapshot()
    }

    /// Read just the generation, for `HostClientHandle.checkAlive()`.
    func generation() -> UInt64 {
        internalState.generation
    }

    /// Borrow the current `AHPClient`, when connected.
    func currentClient() -> AHPClient? {
        internalState.currentClient
    }

    /// Apply an arbitrary mutation under actor isolation.
    func update(_ body: (inout HostInternal) -> Void) {
        body(&internalState)
    }

    /// Convenience: append a subscription URI if not already present.
    func appendSubscription(_ uri: String) {
        if !internalState.subscriptions.contains(uri) {
            internalState.subscriptions.append(uri)
        }
    }

    /// Convenience: remove a subscription URI.
    func removeSubscription(_ uri: String) {
        internalState.subscriptions.removeAll { $0 == uri }
    }

    /// Convenience: read the last error string.
    func lastError() -> String? {
        internalState.lastError
    }

    /// Convenience: read the host id and label.
    func identity() -> (HostId, String) {
        (internalState.id, internalState.label)
    }
}
