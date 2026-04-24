import AgentHostProtocol
import Foundation
import Observation
import SwiftUI

// MARK: - AppStore

/// Central state container for the AHP client app.
///
/// Holds the root state (agents/models), per-session state, and the active connection.
/// All state mutations flow through the protocol's pure reducers, ensuring consistency
/// with the server.
@Observable
@MainActor
final class AppStore {

    // MARK: - Published State

    /// Root state: available agents and active session count.
    var rootState = RootState(agents: [])

    /// Per-session state keyed by session URI.
    var sessions: [String: SessionState] = [:]

    /// Currently selected session URI.
    var selectedSessionURI: String?

    /// Connection status.
    var connectionState: AHPConnection.ConnectionState = .disconnected

    /// `true` while a reconnect (or fallback connect) is in progress.
    var isReconnecting = false

    /// Default working directory reported by the server (from `InitializeResult.defaultDirectory`).
    var defaultDirectory: String?

    /// Last error message for display.
    var errorMessage: String?

    /// Saved server configurations.
    var servers: [ServerConfiguration] = []

    /// Currently selected server ID.
    var selectedServerId: UUID? {
        didSet {
            if let id = selectedServerId {
                UserDefaults.standard.set(id.uuidString, forKey: "selectedServerId")
            } else {
                UserDefaults.standard.removeObject(forKey: "selectedServerId")
            }
        }
    }

    /// The currently selected server configuration.
    var selectedServer: ServerConfiguration? {
        guard let id = selectedServerId else { return nil }
        return servers.first { $0.id == id }
    }

    // MARK: - Computed Properties

    /// The currently selected session state, if any.
    var currentSession: SessionState? {
        guard let uri = selectedSessionURI else { return nil }
        return sessions[uri]
    }

    /// All session summaries, sorted by most recent.
    var sessionSummaries: [SessionSummary] {
        sessions.values
            .map(\.summary)
            .sorted { $0.modifiedAt > $1.modifiedAt }
    }

    /// Available agents from root state.
    var agents: [AgentInfo] {
        rootState.agents
    }

    /// All models across all agents.
    var allModels: [SessionModelInfo] {
        agents.flatMap(\.models)
    }

    // MARK: - Private

    private let connection: AHPConnection
    private let serverStorage = ServerStorage.shared
    private var sessionReducer_ = AHPSessionReducer()

    // MARK: - Init

    init() {
        let conn = AHPConnection()
        self.connection = conn

        // Load saved servers
        servers = serverStorage.fetchServers()

        // Restore last selected server
        if let savedId = UserDefaults.standard.string(forKey: "selectedServerId"),
           let uuid = UUID(uuidString: savedId),
           servers.contains(where: { $0.id == uuid }) {
            selectedServerId = uuid
        }

        // Wire up callbacks — these are invoked on the MainActor because the
        // connection dispatches them there.
        Task {
            await conn.setOnAction { [weak self] envelope in
                self?.handleAction(envelope)
            }
            await conn.setOnNotification { [weak self] notification in
                self?.handleNotification(notification)
            }
            await conn.setOnStateChange { [weak self] state in
                self?.connectionState = state
            }
            await conn.setOnUnexpectedDisconnect { [weak self] in
                guard let self else { return }
                Task { await self.reconnect() }
            }
        }
    }

    // MARK: - Server Management

    /// Add a new server configuration and persist it.
    func addServer(_ server: ServerConfiguration) {
        servers.append(server)
        serverStorage.saveServer(server)
    }

    /// Update an existing server configuration and persist it.
    func updateServer(_ server: ServerConfiguration) {
        if let index = servers.firstIndex(where: { $0.id == server.id }) {
            let needsReconnect = selectedServerId == server.id &&
                (servers[index].scheme != server.scheme ||
                 servers[index].host != server.host ||
                 servers[index].token != server.token)

            servers[index] = server
            serverStorage.saveServer(server)

            if needsReconnect {
                Task {
                    await disconnect()
                    await connect()
                }
            }
        }
    }

    /// Delete a server configuration.
    func deleteServer(id: UUID) {
        servers.removeAll { $0.id == id }
        serverStorage.deleteServer(id: id)
        if selectedServerId == id {
            selectedServerId = nil
            Task { await disconnect() }
        }
    }

    /// Select a server and connect to it.
    func selectServer(_ id: UUID) {
        guard servers.contains(where: { $0.id == id }) else { return }
        let wasConnected = selectedServerId != nil && connectionState == .connected
        if wasConnected {
            Task {
                await disconnect()
                selectedServerId = id
                await connect()
            }
        } else {
            selectedServerId = id
        }
    }

    // MARK: - Connection

    /// Errors from server validation.
    enum ValidationError: LocalizedError {
        case invalidURL
        case localNetworkPermissionNeeded
        case connectionFailed(String)

        var errorDescription: String? {
            switch self {
            case .invalidURL: "Invalid server URL"
            case .localNetworkPermissionNeeded: "Local network access required"
            case .connectionFailed(let msg): msg
            }
        }
    }

    /// Validate a server configuration by attempting a test connection.
    /// Returns successfully if the connection + initialize handshake succeeds.
    /// Throws `ValidationError.localNetworkPermissionNeeded` if iOS permission is required.
    func validateServer(_ server: ServerConfiguration) async throws {
        guard let url = URL(string: server.endpointURLString) else {
            throw ValidationError.invalidURL
        }

        // Use a temporary connection so we don't clobber the main one.
        let testConnection = AHPConnection()
        do {
            try await testConnection.connect(to: url)
            await testConnection.disconnect()
        } catch {
            // When local network access is denied, iOS returns URL errors in
            // the -1001…-1200 range. Rather than guessing whether the host is
            // local, let the OS tell us: if we get a network-layer error, try
            // the Bonjour permission check and surface the prompt.
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain
                && (-1200 ... -1001).contains(nsError.code)
            {
                throw ValidationError.localNetworkPermissionNeeded
            }
            throw ValidationError.connectionFailed(error.localizedDescription)
        }
    }

    /// Wait for local network permission to be granted via Bonjour polling.
    /// Returns `true` if permission was granted, `false` if denied.
    func waitForLocalNetworkPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            let checker = LocalNetworkPrivacy()
            self.activeNetworkCheck = checker
            checker.checkAccessState { granted in
                Task { @MainActor in
                    continuation.resume(returning: granted)
                }
            }
        }
    }

    private var activeNetworkCheck: LocalNetworkPrivacy?

    /// Connect to the selected AHP server.
    func connect() async {
        guard let server = selectedServer else {
            errorMessage = "No server selected"
            return
        }
        guard let url = URL(string: server.endpointURLString) else {
            errorMessage = "Invalid server URL"
            return
        }
        do {
            errorMessage = nil

            // Reset all session state before connecting so that stale session URIs
            // from a previous connection (e.g. after a server restart) cannot be
            // used to send messages that the new server knows nothing about.
            sessions.removeAll()
            selectedSessionURI = nil
            rootState = RootState(agents: [])

            let result = try await connection.connect(to: url)
            defaultDirectory = result.defaultDirectory

            // Process initial snapshots
            for snapshot in result.snapshots {
                applySnapshot(snapshot)
            }

            // Fetch existing sessions and subscribe to each
            await fetchAndSubscribeSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Reconnect after an unexpected disconnect, preserving the `serverSeq` delta so the server
    /// can replay only the actions missed during the outage. Falls back to a full `connect()` if
    /// no prior connection state is available or if the reconnect handshake itself fails.
    func reconnect() async {
        guard let server = selectedServer,
              let url = URL(string: server.endpointURLString) else { return }

        isReconnecting = true
        defer { isReconnecting = false }

        let canReconnect = await connection.canReconnect
        if canReconnect {
            do {
                errorMessage = nil
                let result = try await connection.reconnect(to: url)
                applyReconnectResult(result)
                // Subscribe to any sessions that appeared while we were offline.
                await fetchAndSubscribeSessions()
                return
            } catch {
                // Reconnect handshake failed (server restarted, etc.) — fall through to a
                // full initialize so the user isn't left in a broken state.
            }
        }

        await connect()
    }

    /// Reconnect only when the connection is currently down (e.g. after the app returns to the
    /// foreground). Safe to call at any time; it's a no-op when already connected.
    func reconnectIfNeeded() async {
        guard selectedServer != nil, connectionState == .disconnected else { return }
        await reconnect()
    }

    /// Apply a `ReconnectResult` to the current app state.
    ///
    /// - For `.replay`: each missed `ActionEnvelope` is applied in `serverSeq` order, giving the
    ///   same outcome as if the actions had arrived in real time.
    /// - For `.snapshot`: each snapshot replaces the corresponding resource's state wholesale.
    func applyReconnectResult(_ result: ReconnectResult) {
        switch result {
        case .replay(let r):
            for envelope in r.actions {
                handleAction(envelope)
            }
        case .snapshot(let r):
            for snapshot in r.snapshots {
                applySnapshot(snapshot)
            }
        }
    }

    /// Fetch all existing sessions from the server and subscribe to them.
    func fetchAndSubscribeSessions() async {
        do {
            let summaries = try await connection.listSessions()
            for summary in summaries {
                if sessions[summary.resource] == nil {
                    let snapshot = try await connection.subscribe(resource: summary.resource)
                    applySnapshot(snapshot)
                }
            }
        } catch {
            // Non-fatal: sessions may not be available yet
            print("[AHP] Failed to fetch sessions: \(error)")
        }
    }

    /// Disconnect from the server.
    func disconnect() async {
        await connection.disconnect()
        sessions.removeAll()
        selectedSessionURI = nil
        rootState = RootState(agents: [])
    }

    // MARK: - Session Management

    /// Create a new session with the given agent provider, model, and optional working directory.
    func createSession(provider: String, model: String? = nil, workingDirectory: String? = nil) async {
        let sessionId = UUID().uuidString
        let uri = "\(provider):/\(sessionId)"
        do {
            try await connection.createSession(params: CreateSessionParams(
                session: uri,
                provider: provider,
                model: model,
                workingDirectory: workingDirectory
            ))

            // Subscribe to the new session
            let snapshot = try await connection.subscribe(resource: uri)
            applySnapshot(snapshot)
            selectedSessionURI = uri
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Dispose the given session.
    func disposeSession(uri: String) async {
        do {
            try await connection.disposeSession(session: uri)
            try await connection.unsubscribe(resource: uri)
            sessions.removeValue(forKey: uri)
            if selectedSessionURI == uri {
                selectedSessionURI = sessionSummaries.first?.resource
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Select a session by its URI.
    func selectSession(uri: String) async {
        // If we don't have it, subscribe
        if sessions[uri] == nil {
            do {
                let snapshot = try await connection.subscribe(resource: uri)
                applySnapshot(snapshot)
            } catch {
                errorMessage = error.localizedDescription
                return
            }
        }
        selectedSessionURI = uri
    }

    // MARK: - Conversation

    /// Send a user message to the current session, starting a new turn.
    func sendMessage(_ text: String, attachments: [MessageAttachment]? = nil) async {
        guard let uri = selectedSessionURI else { return }
        let turnId = UUID().uuidString
        let action = StateAction.sessionTurnStarted(SessionTurnStartedAction(
            type: .sessionTurnStarted,
            session: uri,
            turnId: turnId,
            userMessage: UserMessage(text: text, attachments: attachments)
        ))

        // Optimistically apply the action locally
        applySessionAction(action, sessionURI: uri)

        // Dispatch to server
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Cancel the active turn in the current session.
    func cancelTurn() async {
        guard let uri = selectedSessionURI,
              let turn = sessions[uri]?.activeTurn else { return }
        let action = StateAction.sessionTurnCancelled(SessionTurnCancelledAction(
            type: .sessionTurnCancelled,
            session: uri,
            turnId: turn.id
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Approve a tool call.
    func approveToolCall(toolCallId: String, turnId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallConfirmed(SessionToolCallConfirmedAction(
            session: uri,
            turnId: turnId,
            toolCallId: toolCallId,
            approved: true,
            confirmed: .userAction
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Deny a tool call.
    func denyToolCall(toolCallId: String, turnId: String, reason: String? = nil) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallConfirmed(SessionToolCallConfirmedAction(
            session: uri,
            turnId: turnId,
            toolCallId: toolCallId,
            approved: false,
            reason: .denied,
            reasonMessage: reason.map { .string($0) }
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Approve a tool call result.
    func approveToolCallResult(toolCallId: String, turnId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallResultConfirmed(SessionToolCallResultConfirmedAction(
            session: uri,
            turnId: turnId,
            toolCallId: toolCallId,
            type: .sessionToolCallResultConfirmed,
            approved: true
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Change the model for the current session.
    func changeModel(_ modelId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionModelChanged(SessionModelChangedAction(
            type: .sessionModelChanged,
            session: uri,
            model: modelId
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Private: State Management

    func applySnapshot(_ snapshot: Snapshot) {
        switch snapshot.state {
        case .root(let state):
            rootState = state
        case .session(let state):
            sessions[snapshot.resource] = state
        }
    }

    func handleAction(_ envelope: ActionEnvelope) {
        let action = envelope.action
        print("[AHP] Received action: \(action), serverSeq: \(envelope.serverSeq)")

        // Apply to root state
        rootState = rootReducer(state: rootState, action: action)

        // Figure out which session this action targets
        let sessionURI = extractSessionURI(from: action)
        if let uri = sessionURI {
            applySessionAction(action, sessionURI: uri)
        }
    }

    private func applySessionAction(_ action: StateAction, sessionURI: String) {
        guard var state = sessions[sessionURI] else {
            print("[AHP] WARNING: No session found for URI \(sessionURI), dropping action: \(action)")
            return
        }
        sessionReducer_.reduce(into: &state, action: action)
        sessions[sessionURI] = state
    }

    private func handleNotification(_ notification: ProtocolNotification) {
        switch notification {
        case .sessionAdded(let note):
            // A new session was created (potentially by another client)
            let uri = note.summary.resource
            if sessions[uri] == nil {
                // Auto-subscribe to new sessions
                Task {
                    await selectSession(uri: uri)
                }
            }
        case .sessionRemoved(let note):
            sessions.removeValue(forKey: note.session)
            if selectedSessionURI == note.session {
                selectedSessionURI = sessionSummaries.first?.resource
            }
        case .authRequired:
            errorMessage = "Authentication required"
        }
    }

    /// Extract the session URI from an action, if applicable.
    private func extractSessionURI(from action: StateAction) -> String? {
        switch action {
        case .rootAgentsChanged, .rootActiveSessionsChanged:
            return nil
        case .sessionReady(let a): return a.session
        case .sessionCreationFailed(let a): return a.session
        case .sessionTurnStarted(let a): return a.session
        case .sessionDelta(let a): return a.session
        case .sessionResponsePart(let a): return a.session
        case .sessionToolCallStart(let a): return a.session
        case .sessionToolCallDelta(let a): return a.session
        case .sessionToolCallReady(let a): return a.session
        case .sessionToolCallConfirmed(let a): return a.session
        case .sessionToolCallComplete(let a): return a.session
        case .sessionToolCallResultConfirmed(let a): return a.session
        case .sessionTurnComplete(let a): return a.session
        case .sessionTurnCancelled(let a): return a.session
        case .sessionError(let a): return a.session
        case .sessionTitleChanged(let a): return a.session
        case .sessionUsage(let a): return a.session
        case .sessionReasoning(let a): return a.session
        case .sessionModelChanged(let a): return a.session
        case .sessionServerToolsChanged(let a): return a.session
        case .sessionActiveClientChanged(let a): return a.session
        case .sessionActiveClientToolsChanged(let a): return a.session
        case .sessionPendingMessageSet(let a): return a.session
        case .sessionPendingMessageRemoved(let a): return a.session
        case .sessionQueuedMessagesReordered(let a): return a.session
        case .sessionCustomizationsChanged(let a): return a.session
        case .sessionCustomizationToggled(let a): return a.session
        }
    }
}

// MARK: - AHPConnection callback setters (actor-isolated)

private extension AHPConnection {
    func setOnAction(_ callback: @escaping @MainActor (ActionEnvelope) -> Void) {
        onAction = callback
    }
    func setOnNotification(_ callback: @escaping @MainActor (ProtocolNotification) -> Void) {
        onNotification = callback
    }
    func setOnStateChange(_ callback: @escaping @MainActor (AHPConnection.ConnectionState) -> Void) {
        onStateChange = callback
    }
    func setOnUnexpectedDisconnect(_ callback: @escaping @MainActor () -> Void) {
        onUnexpectedDisconnect = callback
    }
}
