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
    private(set) var previousClient: AHPClient?
    private(set) var tcpConnections: [String: TcpConnection] = [:]
    private var tcpCreations: [UUID: Task<TcpConnection, Error>] = [:]

    func openTcpConnection(generation: UInt64, session: String, create: TcpConnectionSubscription) async throws -> TcpConnection {
        guard let client = internalState.currentClient else { throw HostError.hostShutDown(internalState.id) }
        guard generation == internalState.generation else {
            throw HostError.hostReconnected(host: internalState.id, handleGeneration: generation, currentGeneration: internalState.generation)
        }
        let id = UUID()
        let task = Task { try await self.createTcpConnection(client: client, session: session, create: create) }
        tcpCreations[id] = task
        defer { tcpCreations.removeValue(forKey: id) }
        return try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            task.cancel()
        }
    }

    private func createTcpConnection(client: AHPClient, session: String, create: TcpConnectionSubscription) async throws -> TcpConnection {
        let connection = try await client.openTcpConnection(session: session, create: create)
        guard internalState.currentClient === client, !Task.isCancelled else {
            try await connection.dispose()
            throw CancellationError()
        }
        tcpConnections[connection.resource] = connection
        let resource = connection.resource
        await connection.whenReleased { [weak self] in await self?.removeTcpConnection(resource) }
        return connection
    }

    private func removeTcpConnection(_ resource: String) { tcpConnections.removeValue(forKey: resource) }

    func detachClient() async -> AHPClient? {
        let client = internalState.currentClient
        internalState.currentClient = nil
        if let client { previousClient = client }
        let creations = Array(tcpCreations.values)
        for creation in creations { creation.cancel() }
        // The initiating caller receives setup errors; wait for its cleanup before closing transport.
        for creation in creations { _ = await creation.result }
        return client
    }

    func tcpDidReconnect() { previousClient = nil }

    func closeTcpConnections() async -> [String] {
        let connections = Array(tcpConnections.values)
        var errors: [String] = []
        for connection in connections {
            do { try await connection.dispose() }
            catch { errors.append(String(describing: error)) }
        }
        return errors
    }

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
