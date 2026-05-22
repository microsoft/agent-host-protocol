import AgentHostProtocol
import AgentHostProtocolClient
import DevTunnelsClient
import Foundation
import Observation
import SwiftUI

// MARK: - AppStore

struct SessionDebugEvent {
    var label: String
    var detail: String?
    var timestamp: Date
}

struct SessionDebugStatus {
    var lastTrigger: String?
    var lastTriggerDetail: String?
    var lastTriggerAt: Date?
    var lastConnectionStateChangeAt: Date?
    var lastSuccessfulConnectAt: Date?
    var lastSuccessfulReconnectAt: Date?
    var lastSessionSummariesFetchAt: Date?
    var lastSessionRefreshAt: Date?
    var lastSessionRefreshURI: String?
    var lastAutoAuthError: String?
    var recentEvents: [SessionDebugEvent] = []
}

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

    /// Per-session state keyed by session URI. Populated lazily — only sessions
    /// the user has actually opened (or just created) have full state here.
    var sessions: [String: SessionState] = [:]

    /// Lightweight summary cache for every session the server knows about,
    /// keyed by session URI. Populated on connect via `listSessions`, and kept
    /// fresh by `root/sessionAdded`, `root/sessionRemoved`, and
    /// `root/sessionSummaryChanged`. The sidebar renders from this cache so
    /// hundreds of sessions don't require hundreds of `subscribe` round-trips.
    var sessionSummariesCache: [String: SessionSummary] = [:]

    /// Per-terminal state keyed by terminal URI. Populated lazily when a tool
    /// result references a terminal resource.
    var terminals: [String: TerminalState] = [:]

    /// Terminal URIs we have in-flight subscriptions for, to avoid duplicate subscribes.
    private var subscribingTerminals: Set<String> = []

    /// Currently selected session URI.
    var selectedSessionURI: String?

    /// Session URIs whose cached full state must be revalidated with a fresh
    /// `subscribe` before we can trust them after a full reconnect/connect.
    private var staleSessionURIs: Set<String> = []

    /// Session URIs currently being refreshed from the server.
    private var syncingSessionURIs: Set<String> = []

    /// Sessions the user explicitly opened or created. These should remain
    /// available even if they no longer match the background prefetch heuristic.
    private var retainedSessionURIs: Set<String> = []

    /// Sessions subscribed in the background because they are currently active.
    private var autoPrefetchedSessionURIs: Set<String> = []

    /// Sessions (or root) whose agent rejected our last request with
    /// `AuthRequired` (-32007). Surfaced inline in the chat view rather than as
    /// a global error modal, so the user can sign in to the agent without
    /// losing context. The empty string `""` represents a connection-level
    /// auth requirement (e.g. from `notify/authRequired` with no session).
    var sessionsRequiringAuth: Set<String> = []

    /// Protected resources advertised by the server alongside the last
    /// `AuthRequired` error, keyed by session URI (or `""` for connection-level).
    /// Drives the inline sign-in panel; empty array means the server didn't
    /// include a structured payload and we can only offer a retry.
    var authRequiredResources: [String: [ProtectedResourceMetadata]] = [:]

    /// In-flight authenticate attempt per session, used to disable the panel
    /// while we push the token.
    var authenticatingSessions: Set<String> = []

    /// Connection status.
    var connectionState: AHPConnection.ConnectionState = .disconnected

    /// `true` while a reconnect (or fallback connect) is in progress.
    var isReconnecting = false

    /// Debounced reconnect banner state for the chat view.
    var isReconnectBannerVisible = false

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

    /// Debug-only connection/session troubleshooting data.
    var sessionDebugStatus = SessionDebugStatus()

    // MARK: - Computed Properties

    /// The currently selected session state, if any.
    var currentSession: SessionState? {
        guard let uri = selectedSessionURI else { return nil }
        return sessions[uri]
    }

    var isCurrentSessionStale: Bool {
        guard let uri = selectedSessionURI else { return false }
        return staleSessionURIs.contains(uri)
    }

    var isCurrentSessionSyncing: Bool {
        guard let uri = selectedSessionURI else { return false }
        return syncingSessionURIs.contains(uri)
    }

    /// All session summaries, sorted by most recent.
    ///
    /// Merges the lightweight `sessionSummariesCache` (every session the server
    /// knows about) with the live `summary` field of any sessions we have
    /// subscribed to — the live one wins, so optimistic in-flight updates are
    /// reflected immediately for the open chat.
    var sessionSummaries: [SessionSummary] {
        var merged = sessionSummariesCache
        for (uri, state) in sessions {
            merged[uri] = state.summary
        }
        return merged.values.sorted { $0.modifiedAt > $1.modifiedAt }
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
    private let currentDateProvider: () -> Date
    private let reconnectBannerDelayNanoseconds: UInt64
    private var connectionSetupTask: Task<Void, Never>?
    private let serverStorage = ServerStorage.shared
    private var sessionReducer_ = AHPSessionReducer()
    private var activeConnectTask: Task<Void, Never>?
    private var activeReconnectTask: Task<Void, Never>?
    private var reconnectBannerTask: Task<Void, Never>?
    private let activeSessionPrefetchLimit = 5

    // MARK: - Init

    init(
        connection: AHPConnection = AHPConnection(),
        currentDateProvider: @escaping () -> Date = Date.init,
        reconnectBannerDelayNanoseconds: UInt64 = 700_000_000
    ) {
        let conn = connection
        self.connection = conn
        self.currentDateProvider = currentDateProvider
        self.reconnectBannerDelayNanoseconds = reconnectBannerDelayNanoseconds

        // Load saved servers
        servers = serverStorage.fetchServers()

        // Restore last selected server
        if let savedId = UserDefaults.standard.string(forKey: "selectedServerId"),
           let uuid = UUID(uuidString: savedId),
           servers.contains(where: { $0.id == uuid }) {
            selectedServerId = uuid
        }

        connectionSetupTask = Task { [weak self] in
            await conn.setOnAction { [weak self] envelope in
                self?.handleAction(envelope)
            }
            await conn.setOnNotification { [weak self] notification in
                self?.handleNotification(notification)
            }
            await conn.setOnStateChange { [weak self] state in
                self?.connectionState = state
                self?.recordConnectionStateChange()
            }
            await conn.setOnUnexpectedDisconnect { [weak self] in
                guard let self else { return }
                Task { await self.reconnect(debugTrigger: "unexpected disconnect") }
            }
        }

    }

    private func now() -> Date {
        currentDateProvider()
    }

    private func connectionStatusLabel(_ state: AHPConnection.ConnectionState) -> String {
        switch state {
        case .connected: "connected"
        case .connecting: "connecting"
        case .reconnecting: "reconnecting"
        case .disconnected: "disconnected"
        }
    }

    private func recordConnectionTrigger(_ trigger: String, detail: String? = nil) {
        appendDebugEvent(label: trigger, detail: detail)
        sessionDebugStatus.lastTrigger = trigger
        sessionDebugStatus.lastTriggerDetail = detail
        sessionDebugStatus.lastTriggerAt = now()
    }

    private func appendDebugEvent(label: String, detail: String? = nil) {
        let event = SessionDebugEvent(label: label, detail: detail, timestamp: now())
        if let last = sessionDebugStatus.recentEvents.last,
           last.label == event.label,
           last.detail == event.detail {
            sessionDebugStatus.recentEvents[sessionDebugStatus.recentEvents.count - 1] = event
        } else {
            sessionDebugStatus.recentEvents.append(event)
            if sessionDebugStatus.recentEvents.count > 6 {
                sessionDebugStatus.recentEvents.removeFirst(sessionDebugStatus.recentEvents.count - 6)
            }
        }
    }

    private func recordConnectionStateChange() {
        sessionDebugStatus.lastConnectionStateChangeAt = now()
    }

    private func recordSuccessfulConnect() {
        sessionDebugStatus.lastSuccessfulConnectAt = now()
    }

    private func recordSuccessfulReconnect() {
        sessionDebugStatus.lastSuccessfulReconnectAt = now()
    }

    private func setReconnectInFlight(_ active: Bool) {
        isReconnecting = active
        reconnectBannerTask?.cancel()
        reconnectBannerTask = nil

        guard active else {
            isReconnectBannerVisible = false
            return
        }

        let delay = reconnectBannerDelayNanoseconds
        reconnectBannerTask = Task { @MainActor [weak self] in
            guard let self else { return }
            if delay > 0 {
                try? await Task.sleep(nanoseconds: delay)
            }
            guard self.isReconnecting else { return }
            self.isReconnectBannerVisible = true
        }
    }

    private func updateStoredServer(_ server: ServerConfiguration) {
        guard let index = servers.firstIndex(where: { $0.id == server.id }) else { return }
        servers[index] = server
        serverStorage.saveServer(server)
    }

    private func clearTunnelAuthentication(for server: ServerConfiguration) {
        TunnelTokenStore.delete()
        var cleared = server
        cleared.token = ""
        cleared.connectAccessToken = nil
        updateStoredServer(cleared)
    }

    private func prepareTunnelServerForConnection(_ server: ServerConfiguration) async -> ServerConfiguration? {
        guard server.isTunnel,
              let tunnelId = server.tunnelId,
              let clusterId = server.clusterId else {
            return server
        }

        guard let cachedToken = TunnelTokenStore.load(), !cachedToken.isEmpty else {
            clearTunnelAuthentication(for: server)
            errorMessage = tunnelAuthenticationExpiredMessage
            return nil
        }

        var updatedServer = server
        if updatedServer.token != cachedToken {
            updatedServer.token = cachedToken
            updateStoredServer(updatedServer)
        }

        do {
            let client = TunnelManagementClient(accessToken: cachedToken)
            let tunnel = try await client.getTunnel(
                clusterId: clusterId,
                tunnelId: tunnelId,
                options: TunnelRequestOptions(
                    includePorts: true,
                    tokenScopes: [TunnelAccessScopes.connect]
                )
            )
            guard let connectToken = TunnelConnection.connectToken(from: tunnel),
                  !connectToken.isEmpty else {
                errorMessage = tunnelConnectTokenUnavailableMessage
                return nil
            }
            guard DevTunnelServerEndpoint.updateEndpoint(for: &updatedServer, from: tunnel) else {
                errorMessage = tunnelEndpointUnavailableMessage
                return nil
            }

            updatedServer.connectAccessToken = connectToken
            if let index = servers.firstIndex(where: { $0.id == updatedServer.id }) {
                servers[index].token = updatedServer.token
                servers[index].scheme = updatedServer.scheme
                servers[index].host = updatedServer.host
                servers[index].connectAccessToken = connectToken
                serverStorage.saveServer(servers[index])
            }
            return updatedServer
        } catch {
            if isTunnelAuthenticationFailure(error) {
                clearTunnelAuthentication(for: updatedServer)
                errorMessage = tunnelAuthenticationExpiredMessage
                return nil
            }

            if let connectToken = updatedServer.connectAccessToken, !connectToken.isEmpty {
                return updatedServer
            }

            errorMessage = "Couldn't refresh the Dev Tunnel access token: \(error.localizedDescription)"
            return nil
        }
    }

    func handleSceneActive() async {
        recordConnectionTrigger("scene active")

        guard selectedServer != nil else {
            recordConnectionTrigger("scene active", detail: "ignored: no server")
            return
        }

        if let activeConnectTask {
            recordConnectionTrigger("scene active", detail: "waiting for active connect")
            await activeConnectTask.value
            return
        }

        if let activeReconnectTask {
            recordConnectionTrigger("scene active", detail: "waiting for active reconnect")
            await activeReconnectTask.value
            return
        }

        switch connectionState {
        case .connected:
            let canReconnect = await connection.canReconnect
            if canReconnect {
                await reconnect(debugTrigger: "scene active reconnect")
            } else {
                await connect(debugTrigger: "scene active connect")
            }
        case .disconnected:
            let canReconnect = await connection.canReconnect
            if canReconnect {
                await reconnect(debugTrigger: "scene active reconnect")
            } else {
                await connect(debugTrigger: "scene active connect")
            }
        case .connecting, .reconnecting:
            recordConnectionTrigger("scene active", detail: "ignored: state \(connectionStatusLabel(connectionState))")
        }
    }

    // MARK: - Server Management

    /// Add a new server configuration and persist it.
    /// For tunnel servers, if a server with the same tunnel identity already exists, updates it instead.
    func addServer(_ server: ServerConfiguration) {
        if server.isTunnel,
           let existingIndex = servers.firstIndex(where: {
               $0.tunnelId == server.tunnelId && $0.clusterId == server.clusterId
           }) {
            var updated = server
            updated = ServerConfiguration(
                id: servers[existingIndex].id,
                name: server.name,
                scheme: server.scheme,
                host: server.host,
                token: server.token,
                tunnelId: server.tunnelId,
                clusterId: server.clusterId,
                connectAccessToken: server.connectAccessToken
            )
            servers[existingIndex] = updated
            serverStorage.saveServer(updated)
            return
        }
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

    /// Select a server and (re)connect to it.
    ///
    /// Always handles connection lifecycle internally — callers MUST NOT call
    /// `connect()` afterwards. If the same server is already selected and
    /// connected, this is a no-op. If a different server is currently active
    /// it is disconnected first so per-server state (sessions, subscriptions,
    /// the live WebSocket) can't leak between servers.
    func selectServer(_ id: UUID) {
        guard servers.contains(where: { $0.id == id }) else { return }
        if selectedServerId == id && connectionState == .connected { return }
        let needsDisconnect = selectedServerId != nil && connectionState != .disconnected
        Task {
            if needsDisconnect {
                await disconnect()
            }
            selectedServerId = id
            await connect()
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
    func connect(debugTrigger: String? = nil) async {
        await connectionSetupTask?.value

        let trigger = debugTrigger ?? "manual connect"

        guard selectedServer != nil else {
            recordConnectionTrigger(trigger, detail: "ignored: no server")
            errorMessage = "No server selected"
            return
        }

        if let activeConnectTask {
            recordConnectionTrigger(trigger, detail: "waiting for existing connect")
            await activeConnectTask.value
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performConnect(debugTrigger: trigger)
        }
        activeConnectTask = task
        await task.value
    }

    private func performConnect(debugTrigger: String) async {
        defer { activeConnectTask = nil }
        recordConnectionTrigger(debugTrigger)

        guard var server = selectedServer else { return }

        if let preparedServer = await prepareTunnelServerForConnection(server) {
            server = preparedServer
        } else if server.isTunnel {
            return
        }

        guard let url = URL(string: server.endpointURLString) else {
            errorMessage = "Invalid server URL"
            return
        }

        // For tunnel servers, send the connect access token so the
        // devtunnels.ms relay authenticates the WebSocket upgrade.
        var headers: [String: String] = [:]
        if server.isTunnel, let connectToken = server.connectAccessToken, !connectToken.isEmpty {
            headers["X-Tunnel-Authorization"] = "tunnel \(connectToken)"
        }

        errorMessage = nil

        // Retry the WebSocket handshake with backoff. Slow / flaky networks
        // routinely fail the first attempt; one transient hiccup shouldn't
        // strand the user on a "Disconnected" home screen requiring a
        // manual tap. Auth-style failures (401/403) are not retried since
        // a fresh attempt would just fail the same way.
        let backoffsNs: [UInt64] = [0, 1_000_000_000, 2_000_000_000, 4_000_000_000]
        var lastError: Error?
        for (attempt, delay) in backoffsNs.enumerated() {
            if delay > 0 { try? await Task.sleep(nanoseconds: delay) }
            print("[AHP] connect attempt \(attempt + 1)/\(backoffsNs.count) → \(url.absoluteString)")
            do {
                let result = try await connection.connect(to: url, headers: headers)
                defaultDirectory = result.defaultDirectory

                // Apply initial snapshots — these overwrite matching resources
                // in place rather than requiring a full clear first.
                for snapshot in result.snapshots {
                    applySnapshot(snapshot)
                }

                // Preemptively forward the user's GitHub token to every
                // agent-declared protected resource, mirroring what
                // vscode-dev does after `initialize`. This avoids the
                // inline "Sign-in required" panel for agents (e.g. Copilot)
                // that accept the same GitHub token already used for the tunnel.
                await pushTokenToProtectedResources()

                // Fetch the lightweight list of session summaries. Full state
                // remains lazy by default; we only prefetch a small bounded set
                // of sessions that are currently active today.
                let serverURIs = await fetchSessionSummaries()

                // Prune sessions the server no longer knows about (e.g. after a
                // server restart) — but only if we got a valid list. We do this
                // AFTER populating new data so the UI never flashes empty.
                if !serverURIs.isEmpty {
                    let staleURIs = sessions.keys.filter { !serverURIs.contains($0) }
                    for uri in staleURIs {
                        sessions.removeValue(forKey: uri)
                        staleSessionURIs.remove(uri)
                        syncingSessionURIs.remove(uri)
                        retainedSessionURIs.remove(uri)
                        autoPrefetchedSessionURIs.remove(uri)
                    }
                }

                // A full initialize only refreshes root + summaries. Any cached
                // full session state from a prior connection must be revalidated
                // with a fresh subscribe before we treat it as current again.
                staleSessionURIs.formUnion(sessions.keys)

                // If the selected session was pruned, fall back gracefully.
                if let selected = selectedSessionURI, sessions[selected] == nil {
                    selectedSessionURI = sessionSummaries.first?.resource
                }

                if let selected = selectedSessionURI,
                   sessions[selected] != nil {
                    await refreshSessionIfNeeded(
                        uri: selected,
                        allowReconnect: false,
                        waitForActiveConnect: false
                    )
                }
                recordSuccessfulConnect()
                await reconcileActiveSessionPrefetch()
                return
            } catch {
                lastError = error
                print("[AHP] connect attempt \(attempt + 1) failed: \(error)")
                if !shouldRetryConnect(error: error) || attempt == backoffsNs.count - 1 {
                    break
                }
            }
        }
        if let lastError {
            print("[AHP] connect giving up: \(lastError)")
            errorMessage = lastError.localizedDescription
        }
    }

    /// Returns `false` for errors where retrying would obviously fail the same
    /// way (bad URL, auth rejection, protocol-version mismatch). All other
    /// transport-level errors are considered transient and worth retrying.
    private func shouldRetryConnect(error: Error) -> Bool {
        if let connErr = error as? AHPConnection.ConnectionError {
            switch connErr {
            case .requestFailed(let code, _):
                return !(code == 401 || code == 403)
            case .unsupportedProtocolVersion, .authRequired, .serverRejected:
                return false
            default:
                return true
            }
        }
        return true
    }

    /// Reconnect after an unexpected disconnect, preserving the `serverSeq` delta so the server
    /// can replay only the actions missed during the outage. Falls back to a full `connect()` if
    /// no prior connection state is available or if the reconnect handshake itself fails.
    func reconnect(refreshSummaries: Bool = true, debugTrigger: String? = nil) async {
        let trigger = debugTrigger ?? "manual reconnect"

        if let activeConnectTask {
            recordConnectionTrigger(trigger, detail: "waiting for active connect")
            await activeConnectTask.value
            return
        }

        if let activeReconnectTask {
            recordConnectionTrigger(trigger, detail: "waiting for existing reconnect")
            await activeReconnectTask.value
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performReconnect(refreshSummaries: refreshSummaries, debugTrigger: trigger)
        }
        activeReconnectTask = task
        await task.value
    }

    private func performReconnect(refreshSummaries: Bool, debugTrigger: String) async {
        await connectionSetupTask?.value

        recordConnectionTrigger(debugTrigger, detail: "starting reconnect")

        guard var server = selectedServer,
              var url = URL(string: server.endpointURLString) else {
            activeReconnectTask = nil
            return
        }

        setReconnectInFlight(true)
        defer {
            setReconnectInFlight(false)
            activeReconnectTask = nil
        }

        if let preparedServer = await prepareTunnelServerForConnection(server) {
            server = preparedServer
            guard let updatedURL = URL(string: server.endpointURLString) else {
                errorMessage = "Invalid server URL"
                return
            }
            url = updatedURL
        } else if server.isTunnel {
            return
        }

        // Build tunnel auth headers if needed
        var headers: [String: String] = [:]
        if server.isTunnel, let connectToken = server.connectAccessToken, !connectToken.isEmpty {
            headers["X-Tunnel-Authorization"] = "tunnel \(connectToken)"
        }

        let canReconnect = await connection.canReconnect
        if canReconnect {
            do {
                errorMessage = nil
                let result = try await connection.reconnect(to: url, headers: headers)
                applyReconnectResult(result)
                recordSuccessfulReconnect()
                // Re-push the token after reconnect in case the server lost
                // session-bound auth state across the outage.
                await pushTokenToProtectedResources()
                if refreshSummaries {
                    // Refresh the summary cache for any sessions that appeared
                    // while we were offline. The replay/snapshot pipeline keeps
                    // already-subscribed sessions live; this catches the rest.
                    do {
                        _ = try await fetchSessionSummariesOnce()
                        await reconcileActiveSessionPrefetch()
                    } catch {
                        errorMessage = error.localizedDescription
                    }
                }
                return
            } catch {
                // Reconnect handshake failed (server restarted, etc.) — fall through to a
                // full initialize so the user isn't left in a broken state.
            }
        }

        await connect(debugTrigger: "\(debugTrigger) fallback connect")
    }

    /// Reconnect only when the connection is currently down (e.g. after the app returns to the
    /// foreground). Safe to call at any time; it's a no-op when already connected.
    func reconnectIfNeeded(debugTrigger: String? = nil) async {
        let trigger = debugTrigger ?? "reconnect if needed"

        guard selectedServer != nil else {
            recordConnectionTrigger(trigger, detail: "ignored: no server")
            return
        }
        guard connectionState == .disconnected else {
            recordConnectionTrigger(trigger, detail: "ignored: state \(connectionStatusLabel(connectionState))")
            return
        }
        let canReconnect = await connection.canReconnect
        guard canReconnect else {
            recordConnectionTrigger(trigger, detail: "ignored: no reconnect state")
            return
        }
        await reconnect(debugTrigger: trigger)
    }

    /// Apply a `ReconnectResult` to the current app state.
    ///
    /// - For `.replay`: each missed `ActionEnvelope` is applied in `serverSeq` order, giving the
    ///   same outcome as if the actions had arrived in real time.
    /// - For `.snapshot`: each snapshot replaces the corresponding resource's state wholesale.
    func applyReconnectResult(_ result: ReconnectResult) {
        staleSessionURIs.removeAll()
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

    /// Fetch the list of session summaries from the server.
    ///
    /// This populates `sessionSummariesCache` so the sidebar can render
    /// hundreds of sessions without paying for per-session `subscribe`
    /// round-trips. Full session state is still lazy by default; only the
    /// selected session and a small bounded set of active-today sessions are
    /// subscribed in the background.
    ///
    /// Returns the set of session URIs known to the server, so the caller can
    /// prune any local state for sessions that have disappeared.
    @discardableResult
    func fetchSessionSummaries() async -> Set<String> {
        do {
            return try await fetchSessionSummariesOnce()
        } catch {
            // Non-fatal: sessions may not be available yet
            print("[AHP] Failed to fetch sessions: \(error)")
            return []
        }
    }

    func refreshSessionSummaries(debugTrigger: String? = nil) async {
        recordConnectionTrigger(debugTrigger ?? "refresh summaries")
        do {
            _ = try await fetchSessionSummariesOnce()
            await reconcileActiveSessionPrefetch()
            errorMessage = nil
        } catch {
            guard shouldRecoverFromTransportError(error) else {
                errorMessage = error.localizedDescription
                return
            }

            await reconnect(debugTrigger: "refresh summaries recovery")
            if connectionState != .connected && errorMessage == nil {
                errorMessage = error.localizedDescription
            }
        }
    }

    /// Disconnect from the server.
    func disconnect() async {
        await connection.disconnect()
        sessions.removeAll()
        staleSessionURIs.removeAll()
        syncingSessionURIs.removeAll()
        retainedSessionURIs.removeAll()
        autoPrefetchedSessionURIs.removeAll()
        sessionSummariesCache.removeAll()
        sessionsRequiringAuth.removeAll()
        authRequiredResources.removeAll()
        authenticatingSessions.removeAll()
        selectedSessionURI = nil
        rootState = RootState(agents: [])
        setReconnectInFlight(false)
    }

    // MARK: - Session Management

    /// Create a new session with the given agent provider, model, and optional working directory.
    func createSession(provider: String, model: String? = nil, workingDirectory: String? = nil) async {
        let sessionId = UUID().uuidString
        let uri = "\(provider):/\(sessionId)"
        do {
            try await connection.createSession(params: CreateSessionParams(
                channel: uri,
                provider: provider,
                model: model.map { ModelSelection(id: $0) },
                workingDirectory: workingDirectory
            ))

            // Subscribe to the new session
            if let snapshot = try await connection.subscribe(resource: uri) {
                applySnapshot(snapshot)
            }
            retainedSessionURIs.insert(uri)
            autoPrefetchedSessionURIs.remove(uri)
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
            staleSessionURIs.remove(uri)
            syncingSessionURIs.remove(uri)
            retainedSessionURIs.remove(uri)
            autoPrefetchedSessionURIs.remove(uri)
            sessionSummariesCache.removeValue(forKey: uri)
            sessionsRequiringAuth.remove(uri)
            authRequiredResources.removeValue(forKey: uri)
            authenticatingSessions.remove(uri)
            if selectedSessionURI == uri {
                selectedSessionURI = sessionSummaries.first?.resource
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Select a session by its URI.
    func selectSession(uri: String, debugTrigger: String? = nil) async {
        recordConnectionTrigger(debugTrigger ?? "open session")
        retainedSessionURIs.insert(uri)
        autoPrefetchedSessionURIs.remove(uri)

        if sessions[uri] != nil {
            selectedSessionURI = uri
        }

        if needsSessionRefresh(uri: uri) {
            let refreshed = await refreshSessionIfNeeded(uri: uri, allowReconnect: true)
            guard refreshed else { return }
        }
        selectedSessionURI = uri
    }

    // MARK: - Conversation

    /// Send a user message to the current session.
    ///
    /// The dispatch shape depends on whether a turn is already running:
    ///
    /// - **Idle session** (no `activeTurn`) — dispatch `session/turnStarted`
    ///   directly with a fresh `turnId`. This is the canonical "user sent a
    ///   message; server starts processing" path per the actions guide. It also
    ///   means the optimistic UI shows the message as the active turn
    ///   immediately, instead of briefly flashing as "queued" while waiting for
    ///   the server to consume a pending entry — important on slow or flaky
    ///   networks where that round-trip can be noticeable (or stuck).
    /// - **Turn in progress** — dispatch `session/pendingMessageSet` with
    ///   ``PendingMessageKind/queued``. The message stays in the queue and the
    ///   server auto-starts it after the current turn completes, emitting a
    ///   `session/turnStarted` with `queuedMessageId` linking back to the entry.
    func sendMessage(_ text: String, attachments: [MessageAttachment]? = nil) async {
        guard let uri = selectedSessionURI else { return }
        let userMessage = UserMessage(text: text, attachments: attachments)
        let hasActiveTurn = sessions[uri]?.activeTurn != nil

        let action: StateAction
        if hasActiveTurn {
            action = .sessionPendingMessageSet(SessionPendingMessageSetAction(
                type: .sessionPendingMessageSet,
                kind: .queued,
                id: UUID().uuidString,
                userMessage: userMessage
            ))
        } else {
            action = .sessionTurnStarted(SessionTurnStartedAction(
                type: .sessionTurnStarted,
                turnId: UUID().uuidString,
                userMessage: userMessage
            ))
        }

        // Optimistically apply the action locally so the message appears
        // immediately — either as the active turn (idle case) or as a queued
        // entry (turn-in-progress case). The server will echo the action back
        // and, for the queued case, follow up with `pendingMessageRemoved` +
        // `turnStarted` once it consumes the queue.
        applySessionAction(action, sessionURI: uri)

        // Dispatch to server
        do {
            try await connection.dispatchAction(action, channel: uri)
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
            turnId: turn.id
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Update a mutable session config value for the current session.
    func setSessionConfigValue(property: String, value: AnyCodable) async {
        guard let uri = selectedSessionURI,
              let config = sessions[uri]?.config,
              let schema = config.schema.properties[property],
              schema.sessionMutable == true,
              schema.readOnly != true else { return }

        if config.values[property] == value {
            return
        }

        let action = StateAction.sessionConfigChanged(SessionConfigChangedAction(
            type: .sessionConfigChanged,
            config: [property: value]
        ))

        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Approve a tool call.
    func approveToolCall(
        toolCallId: String,
        turnId: String,
        editedToolInput: String? = nil,
        selectedOptionId: String? = nil
    ) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallConfirmed(SessionToolCallConfirmedAction(
            turnId: turnId,
            toolCallId: toolCallId,
            approved: true,
            confirmed: .userAction,
            editedToolInput: editedToolInput,
            selectedOptionId: selectedOptionId
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Deny a tool call.
    func denyToolCall(
        toolCallId: String,
        turnId: String,
        reason: String? = nil,
        selectedOptionId: String? = nil
    ) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallConfirmed(SessionToolCallConfirmedAction(
            turnId: turnId,
            toolCallId: toolCallId,
            approved: false,
            reason: .denied,
            reasonMessage: reason.map { .string($0) },
            selectedOptionId: selectedOptionId
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Approve a tool call result.
    func approveToolCallResult(toolCallId: String, turnId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallResultConfirmed(SessionToolCallResultConfirmedAction(
            turnId: turnId,
            toolCallId: toolCallId,
            type: .sessionToolCallResultConfirmed,
            approved: true
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Input Requests

    /// Update a draft or submitted answer for a question on an input request.
    func setInputAnswer(requestId: String, questionId: String, answer: SessionInputAnswer?) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionInputAnswerChanged(SessionInputAnswerChangedAction(
            type: .sessionInputAnswerChanged,
            requestId: requestId,
            questionId: questionId,
            answer: answer
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Complete an input request with the given response.
    func completeInputRequest(
        requestId: String,
        response: SessionInputResponseKind,
        answers: [String: SessionInputAnswer]? = nil
    ) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionInputCompleted(SessionInputCompletedAction(
            type: .sessionInputCompleted,
            requestId: requestId,
            response: response,
            answers: answers
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Change the model for the current session.
    func changeModel(_ modelId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionModelChanged(SessionModelChangedAction(
            type: .sessionModelChanged,
            model: ModelSelection(id: modelId)
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action, channel: uri)
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
            staleSessionURIs.remove(snapshot.resource)
            syncingSessionURIs.remove(snapshot.resource)
        case .terminal(let state):
            terminals[snapshot.resource] = state
        case .changeset:
            break
        }
    }

    func handleAction(_ envelope: ActionEnvelope) {
        let action = envelope.action
        let channel = envelope.channel
        print("[AHP] Received action: \(action), serverSeq: \(envelope.serverSeq), channel: \(channel)")

        if channel == "ahp-root://" {
            rootState = rootReducer(state: rootState, action: action)
            return
        }
        if channel.hasPrefix("terminal:/") {
            if let state = terminals[channel] {
                terminals[channel] = terminalReducer(state: state, action: action)
            }
            return
        }
        // Anything else is a session channel.
        staleSessionURIs.remove(channel)
        syncingSessionURIs.remove(channel)
        applySessionAction(action, sessionURI: channel)
    }

    private func applySessionAction(_ action: StateAction, sessionURI: String) {
        guard var state = sessions[sessionURI] else {
            print("[AHP] WARNING: No session found for URI \(sessionURI), dropping action: \(action)")
            return
        }
        sessionReducer_.reduce(into: &state, action: action)
        sessions[sessionURI] = state
    }

    private func handleNotification(_ notification: AHPNotification) {
        switch notification {
        case .sessionAdded(let note):
            // Track the new session in the summary cache so it appears in the
            // sidebar immediately. A later bounded reconciliation pass decides
            // whether it also deserves a background subscription.
            sessionSummariesCache[note.summary.resource] = note.summary
            Task { @MainActor [weak self] in
                await self?.reconcileActiveSessionPrefetch()
            }
        case .sessionRemoved(let note):
            sessions.removeValue(forKey: note.session)
            staleSessionURIs.remove(note.session)
            syncingSessionURIs.remove(note.session)
            retainedSessionURIs.remove(note.session)
            autoPrefetchedSessionURIs.remove(note.session)
            sessionSummariesCache.removeValue(forKey: note.session)
            if selectedSessionURI == note.session {
                selectedSessionURI = sessionSummaries.first?.resource
            }
            Task { @MainActor [weak self] in
                await self?.reconcileActiveSessionPrefetch()
            }
        case .sessionSummaryChanged(let note):
            // Keep the cache fresh for sessions we haven't subscribed to.
            // For subscribed sessions, the live `summary` is already updated
            // by the per-action reducers (titleChanged, turnStarted, etc.) and
            // wins in the merged `sessionSummaries`, so we still update the
            // cache here as a fallback in case the user later unsubscribes.
            applySummaryChange(uri: note.session, changes: note.changes)
            Task { @MainActor [weak self] in
                await self?.reconcileActiveSessionPrefetch()
            }
        case .authRequired(let note):
            // `resource` is the protected resource identifier (an agent
            // provider URI). Map it onto any sessions that use that agent so
            // the chat view can show an inline sign-in panel instead of the
            // notification surfacing as a blocking error modal.
            let affected = sessionSummariesCache.values
                .filter { $0.provider == note.resource }
                .map { $0.resource }
            if affected.isEmpty {
                // Connection-level requirement with no specific session bound.
                sessionsRequiringAuth.insert(note.resource)
            } else {
                sessionsRequiringAuth.formUnion(affected)
            }
        }
    }

    /// Apply a `PartialSessionSummary` patch to the cached summary for `uri`.
    /// Identity fields (`resource`, `provider`, `createdAt`) are intentionally
    /// not mutable — receivers must ignore them per the protocol spec.
    private func applySummaryChange(uri: String, changes: PartialSessionSummary) {
        guard var summary = sessionSummariesCache[uri] else { return }
        if let v = changes.title { summary.title = v }
        if let v = changes.status { summary.status = v }
        if let v = changes.modifiedAt { summary.modifiedAt = v }
        // Optional fields: presence in the patch always means "set to this
        // value" (including nil to clear). We only get a non-nil here when the
        // sender included the field, but since the generated type collapses
        // "absent" and "explicit null" both to `nil`, treat any nil here as
        // "no change" — clearing these fields is rare and the next full
        // listSessions() would correct it anyway.
        if let v = changes.activity { summary.activity = v }
        if let v = changes.project { summary.project = v }
        if let v = changes.model { summary.model = v }
        if let v = changes.workingDirectory { summary.workingDirectory = v }
        if let v = changes.changesets { summary.changesets = v }
        sessionSummariesCache[uri] = summary
    }

    private func fetchSessionSummariesOnce() async throws -> Set<String> {
        let summaries = try await connection.listSessions()
        sessionDebugStatus.lastSessionSummariesFetchAt = now()
        let serverURIs = Set(summaries.map(\.resource))

        // Replace the cache wholesale — the server's list is authoritative.
        // Subscribed sessions retain their live state in `sessions`; the
        // merged `sessionSummaries` computed property layers them on top.
        var cache: [String: SessionSummary] = [:]
        cache.reserveCapacity(summaries.count)
        for summary in summaries {
            cache[summary.resource] = summary
        }
        sessionSummariesCache = cache

        return serverURIs
    }

    private func needsSessionRefresh(uri: String) -> Bool {
        sessions[uri] == nil || staleSessionURIs.contains(uri)
    }

    private func startOfCurrentDayTimestamp() -> Int {
        let startOfDay = Calendar.current.startOfDay(for: currentDateProvider())
        return Int(startOfDay.timeIntervalSince1970 * 1000)
    }

    private func autoPrefetchCandidateSessionURIs() -> [String] {
        let startOfDay = startOfCurrentDayTimestamp()
        return sessionSummaries
            .filter { summary in
                summary.status == .inProgress &&
                    summary.modifiedAt >= startOfDay &&
                    summary.resource != selectedSessionURI &&
                    !retainedSessionURIs.contains(summary.resource)
            }
            .prefix(activeSessionPrefetchLimit)
            .map(\.resource)
    }

    private func reconcileActiveSessionPrefetch() async {
        let targetURIs = Set(autoPrefetchCandidateSessionURIs())

        for uri in autoPrefetchedSessionURIs.subtracting(targetURIs) {
            do {
                try await connection.unsubscribe(resource: uri)
            } catch {
                errorMessage = error.localizedDescription
            }
            autoPrefetchedSessionURIs.remove(uri)
            staleSessionURIs.remove(uri)
            syncingSessionURIs.remove(uri)
            sessions.removeValue(forKey: uri)
        }

        for uri in autoPrefetchCandidateSessionURIs() {
            let refreshed = await refreshSessionIfNeeded(
                uri: uri,
                allowReconnect: false,
                waitForActiveConnect: false
            )
            if refreshed {
                autoPrefetchedSessionURIs.insert(uri)
            }
        }
    }

    @discardableResult
    private func refreshSessionIfNeeded(
        uri: String,
        allowReconnect: Bool,
        waitForActiveConnect: Bool = true
    ) async -> Bool {
        if waitForActiveConnect, let activeConnectTask {
            await activeConnectTask.value
        }

        guard needsSessionRefresh(uri: uri) else { return true }

        syncingSessionURIs.insert(uri)
        defer { syncingSessionURIs.remove(uri) }

        do {
            if let snapshot = try await connection.subscribe(resource: uri) {
                applySnapshot(snapshot)
            }
            sessionDebugStatus.lastSessionRefreshAt = now()
            sessionDebugStatus.lastSessionRefreshURI = uri
            sessionsRequiringAuth.remove(uri)
            authRequiredResources.removeValue(forKey: uri)
            errorMessage = nil
            return true
        } catch {
            if isAuthRequiredError(error) {
                markAuthRequired(uri: uri, error: error)
                return false
            }
            guard allowReconnect, shouldRecoverFromTransportError(error) else {
                errorMessage = error.localizedDescription
                return false
            }

            await reconnect(refreshSummaries: false, debugTrigger: "session refresh recovery")

            do {
                if let snapshot = try await connection.subscribe(resource: uri) {
                    applySnapshot(snapshot)
                }
                sessionDebugStatus.lastSessionRefreshAt = now()
                sessionDebugStatus.lastSessionRefreshURI = uri
                sessionsRequiringAuth.remove(uri)
                authRequiredResources.removeValue(forKey: uri)
                errorMessage = nil
                return true
            } catch {
                if isAuthRequiredError(error) {
                    markAuthRequired(uri: uri, error: error)
                    return false
                }
                errorMessage = error.localizedDescription
                return false
            }
        }
    }

    private func shouldRecoverFromTransportError(_ error: Error) -> Bool {
        if let connectionError = error as? AHPConnection.ConnectionError {
            switch connectionError {
            case .requestFailed:
                return false
            default:
                return true
            }
        }
        return true
    }

    /// True when `error` is a JSON-RPC `AuthRequired` (-32007) response — i.e.
    /// the agent itself is rejecting the request because the user hasn't
    /// authenticated, not because the connection is broken.
    func isAuthRequiredError(_ error: Error) -> Bool {
        guard let connectionError = error as? AHPConnection.ConnectionError else { return false }
        switch connectionError {
        case .authRequired:
            return true
        case .requestFailed(let code, _) where code == AhpErrorCodes.authRequired:
            return true
        default:
            return false
        }
    }

    /// Extract resources from an `AuthRequired` `ConnectionError`, if any.
    private func authResources(from error: Error) -> [ProtectedResourceMetadata] {
        if case .authRequired(_, let resources) = error as? AHPConnection.ConnectionError {
            return resources
        }
        return []
    }

    /// Record an auth-required failure for `uri`, capturing any resources the
    /// server provided so the inline panel can drive the OAuth flow.
    private func markAuthRequired(uri: String, error: Error) {
        sessionsRequiringAuth.insert(uri)
        let resources = authResources(from: error)
        if !resources.isEmpty {
            authRequiredResources[uri] = resources
        }
    }

    /// Resources advertised for the currently selected session's auth requirement.
    var currentAuthRequiredResources: [ProtectedResourceMetadata] {
        guard let uri = selectedSessionURI else { return [] }
        return authRequiredResources[uri] ?? []
    }

    /// Push a bearer token for every resource the agent declared as protected,
    /// then re-subscribe to the affected session. Returns `true` on success.
    @discardableResult
    func authenticateCurrentSession(token: String) async -> Bool {
        guard let uri = selectedSessionURI else { return false }
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Token cannot be empty."
            return false
        }
        let resources = authRequiredResources[uri] ?? []
        guard !resources.isEmpty else {
            errorMessage = "No authentication target advertised by the server."
            return false
        }
        authenticatingSessions.insert(uri)
        defer { authenticatingSessions.remove(uri) }
        do {
            for resource in resources {
                try await connection.authenticate(channel: uri, resource: resource.resource, token: trimmed)
            }
        } catch {
            errorMessage = "Sign in failed: \(error.localizedDescription)"
            return false
        }
        sessionsRequiringAuth.remove(uri)
        authRequiredResources.removeValue(forKey: uri)
        await selectSession(uri: uri, debugTrigger: "retry after authenticate")
        return true
    }

    /// Forward the user's saved GitHub token to every protected resource the
    /// currently-known agents advertised. Mirrors vscode-dev's behaviour of
    /// pushing the same token used for the tunnel/Dev Tunnels API to the AHP
    /// host via the `authenticate` command right after `initialize`, so
    /// `AuthRequired` (-32007) never fires in normal use.
    ///
    /// Best-effort: per-resource failures are recorded in
    /// `sessionDebugStatus.lastAutoAuthError` but do not surface as a modal —
    /// if a token is wrong the agent will reject a later request with
    /// `AuthRequired`, at which point the inline panel takes over.
    private func pushTokenToProtectedResources() async {
        guard let token = TunnelTokenStore.load(), !token.isEmpty else { return }

        var unique = Set<String>()
        var resources: [String] = []
        for agent in rootState.agents {
            for meta in agent.protectedResources ?? [] {
                if unique.insert(meta.resource).inserted {
                    resources.append(meta.resource)
                }
            }
        }
        guard !resources.isEmpty else { return }

        for resource in resources {
            do {
                try await connection.authenticate(channel: RootResourceURI, resource: resource, token: token)
            } catch {
                sessionDebugStatus.lastAutoAuthError =
                    "authenticate(\(resource)) failed: \(error.localizedDescription)"
            }
        }
    }

    /// True if the currently selected session is blocked on agent authentication.
    var currentSessionRequiresAuth: Bool {
        guard let uri = selectedSessionURI else { return false }
        return sessionsRequiringAuth.contains(uri)
    }

    /// Ensure we are subscribed to a terminal URI (no-op if already subscribed or
    /// a subscribe is in flight). Safe to call repeatedly from view `.task` handlers.
    func ensureTerminalSubscribed(uri: String) async {
        if terminals[uri] != nil { return }
        if subscribingTerminals.contains(uri) { return }
        subscribingTerminals.insert(uri)
        defer { subscribingTerminals.remove(uri) }
        do {
            if let snapshot = try await connection.subscribe(resource: uri) {
                applySnapshot(snapshot)
            }
        } catch {
            print("[AHP] Terminal subscribe failed for \(uri): \(error)")
        }
    }

    /// Create a new interactive terminal, subscribe to it, and return its URI.
    @discardableResult
    func createTerminal(name: String = "Terminal", cols: Int = 80, rows: Int = 24) async -> String? {
        let terminalId = UUID().uuidString
        let uri = "terminal:/\(terminalId)"
        do {
            try await connection.createTerminal(params: CreateTerminalParams(
                channel: uri,
                claim: .client(TerminalClientClaim(kind: .client, clientId: connection.clientId)),
                name: name,
                cols: cols,
                rows: rows
            ))
            await ensureTerminalSubscribed(uri: uri)
            return uri
        } catch {
            errorMessage = "Failed to create terminal: \(error.localizedDescription)"
            return nil
        }
    }

    /// Dispose a terminal and remove local state.
    func disposeTerminal(uri: String) async {
        do {
            try await connection.disposeTerminal(terminal: uri)
        } catch {
            print("[AHP] Terminal dispose failed: \(error)")
        }
        terminals.removeValue(forKey: uri)
    }

    // MARK: - Terminal Actions

    /// Dispatch user input to a terminal (side-effect-only — reducer is a no-op).
    func dispatchTerminalInput(terminal: String, data: String) async {
        let action = StateAction.terminalInput(TerminalInputAction(
            type: .terminalInput,
            data: data
        ))
        do {
            try await connection.dispatchAction(action, channel: terminal)
        } catch {
            print("[AHP] Terminal input dispatch failed: \(error)")
        }
    }

    /// Dispatch a terminal resize event.
    func dispatchTerminalResize(terminal: String, cols: Int, rows: Int) async {
        let action = StateAction.terminalResized(TerminalResizedAction(
            type: .terminalResized,
            cols: cols,
            rows: rows
        ))
        // Apply locally
        if let state = terminals[terminal] {
            terminals[terminal] = terminalReducer(state: state, action: action)
        }
        do {
            try await connection.dispatchAction(action, channel: terminal)
        } catch {
            print("[AHP] Terminal resize dispatch failed: \(error)")
        }
    }
}
