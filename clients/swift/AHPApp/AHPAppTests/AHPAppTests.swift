//
//  AHPAppTests.swift
//  AHPAppTests
//
//  Created by Peng Lyu on 3/27/26.
//

import Testing
import AgentHostProtocol
import DevTunnelsClient
import Foundation
@testable import AHPApp

// MARK: - Reconnect State Tests
//
// These tests exercise the state-application logic in AppStore without requiring a live server.
// They verify the critical invariant for reconnect correctness: after applying a ReconnectResult
// (whether replay or snapshot), the in-memory state exactly matches what the server reports.

@MainActor
struct ReconnectResultTests {

    // A minimal AgentInfo for use in test fixtures.
    static func makeAgent(provider: String) -> AgentInfo {
        AgentInfo(provider: provider, displayName: provider, description: "", models: [])
    }

    // MARK: - applySnapshot

    @Test func applySnapshotUpdatesRootState() {
        let store = AppStore()
        let snapshot = Snapshot(
            resource: "ahp-root://",
            state: .root(RootState(agents: [Self.makeAgent(provider: "agent1")])),
            fromSeq: 10
        )
        store.applySnapshot(snapshot)
        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "agent1")
    }

    // MARK: - applyReconnectResult: replay path

    @Test func replayAppliesActionsInServerSeqOrder() {
        let store = AppStore()

        // Seed root state with one agent.
        store.applySnapshot(Snapshot(
            resource: "ahp-root://",
            state: .root(RootState(agents: [Self.makeAgent(provider: "old")])),
            fromSeq: 40
        ))

        // Replay two consecutive root actions that update the agent list.
        let action1 = ActionEnvelope(
            channel: "ahp-root://",
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [Self.makeAgent(provider: "mid")]
            )),
            serverSeq: 41
        )
        let action2 = ActionEnvelope(
            channel: "ahp-root://",
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [Self.makeAgent(provider: "new")]
            )),
            serverSeq: 42
        )
        let result = ReconnectResult.replay(ReconnectReplayResult(
            type: .replay,
            actions: [action1, action2],
            missing: []
        ))

        store.applyReconnectResult(result)

        // The final state should reflect action2 (the last in serverSeq order).
        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "new")
    }

    @Test func replayWithNoActionsLeavesStateUnchanged() {
        let store = AppStore()
        store.applySnapshot(Snapshot(
            resource: "ahp-root://",
            state: .root(RootState(agents: [Self.makeAgent(provider: "stable")])),
            fromSeq: 50
        ))

        let result = ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [], missing: []))
        store.applyReconnectResult(result)

        #expect(store.rootState.agents[0].provider == "stable")
    }

    // MARK: - applyReconnectResult: snapshot path

    @Test func snapshotReplacesRootState() {
        let store = AppStore()

        // Populate stale state.
        store.applySnapshot(Snapshot(
            resource: "ahp-root://",
            state: .root(RootState(agents: [Self.makeAgent(provider: "stale")])),
            fromSeq: 5
        ))
        #expect(store.rootState.agents[0].provider == "stale")

        // Snapshot result carries fresh state from the server.
        let result = ReconnectResult.snapshot(ReconnectSnapshotResult(
            type: .snapshot,
            snapshots: [Snapshot(
                resource: "ahp-root://",
                state: .root(RootState(agents: [Self.makeAgent(provider: "fresh")])),
                fromSeq: 60
            )]
        ))

        store.applyReconnectResult(result)

        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "fresh")
    }

    @Test func snapshotRestoresMultipleResources() {
        let store = AppStore()

        // Simulate having a session already subscribed.
        let sessionURI = "ahp-session:/test-session-id"
        let initialSessionState = SessionState(
            provider: "copilot",
            title: "",
            status: .idle,
            lifecycle: .ready,
            activeClients: [],
            chats: []
        )
        store.sessions[sessionURI] = initialSessionState

        // A snapshot reconnect carries fresh root + session snapshots.
        let freshRoot = RootState(agents: [Self.makeAgent(provider: "copilot")])
        let freshSession = SessionState(
            provider: "copilot",
            title: "Restored session",
            status: .idle,
            lifecycle: .ready,
            activeClients: [],
            chats: []
        )
        let result = ReconnectResult.snapshot(ReconnectSnapshotResult(
            type: .snapshot,
            snapshots: [
                Snapshot(resource: "ahp-root://", state: .root(freshRoot), fromSeq: 70),
                Snapshot(resource: sessionURI, state: .session(freshSession), fromSeq: 70),
            ]
        ))

        store.applyReconnectResult(result)

        #expect(store.rootState.agents[0].provider == "copilot")
        #expect(store.sessions[sessionURI]?.title == "Restored session")
    }

    // MARK: - serverSeq tracking

    @Test func handleActionAdvancesServerSeqForReplayVerification() {
        let store = AppStore()

        // Apply a root snapshot at seq 10 so root state is initialized.
        store.applySnapshot(Snapshot(
            resource: "ahp-root://",
            state: .root(RootState(agents: [])),
            fromSeq: 10
        ))

        // Simulate two incoming live action envelopes.
        let envelope = ActionEnvelope(
            channel: "ahp-root://",
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [Self.makeAgent(provider: "live")]
            )),
            serverSeq: 11
        )
        store.handleAction(envelope)

        // State should reflect the live action.
        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "live")
    }
}

struct TunnelAuthenticationTests {
    @Test func tunnelServerEndpointUsesAdvertisedPortUriFormat() {
        let tunnel = Tunnel(
            clusterId: "usw2",
            tunnelId: "kind-river-j323ccs",
            name: "mac-pro-dev",
            accessTokens: [TunnelAccessScopes.connect: "connect-token"],
            endpoints: [TunnelEndpoint(portUriFormat: "https://jnm28zd6-{port}.usw2.devtunnels.ms/")]
        )

        let server = DevTunnelServerEndpoint.serverConfiguration(
            name: tunnel.displayName,
            tunnel: tunnel,
            accessToken: "github-token",
            connectToken: "connect-token"
        )

        #expect(server?.scheme == "wss")
        #expect(server?.host == "jnm28zd6-31546.usw2.devtunnels.ms")
        #expect(server?.endpointURLString == "wss://jnm28zd6-31546.usw2.devtunnels.ms")
    }

    @Test func tunnelAuthenticationFailureMatchesHTTPStatusCode() {
        let error = NSError(
            domain: "TunnelTests",
            code: 401,
            userInfo: [NSLocalizedDescriptionKey: "HTTP 401"]
        )

        #expect(isTunnelAuthenticationFailure(error))
    }

    @Test func tunnelAuthenticationFailureMatchesUnauthorizedDescription() {
        struct UnauthorizedError: LocalizedError {
            var errorDescription: String? {
                "Request failed with unauthorized access to the tunnel."
            }
        }

        #expect(isTunnelAuthenticationFailure(UnauthorizedError()))
    }

    @Test func tunnelReauthenticationMessageMatchesExpiredAuth() {
        #expect(isTunnelReauthenticationMessage(tunnelAuthenticationExpiredMessage))
    }

    @Test func tunnelReauthenticationMessageMatchesMissingConnectToken() {
        #expect(isTunnelReauthenticationMessage(tunnelConnectTokenUnavailableMessage))
    }

    @Test func tunnelReauthenticationMessageIgnoresUnrelatedErrors() {
        #expect(!isTunnelReauthenticationMessage("Socket timed out"))
    }

    @Test func tunnelDeviceCodeResponseRoundTripsThroughStorageEncoding() throws {
        let response = try makeDeviceCodeResponse()

        let encoded = encodeTunnelDeviceCodeResponse(response)
        #expect(encoded != nil)
        #expect(decodeTunnelDeviceCodeResponse(encoded!) == response)
    }

    @Test func tunnelDeviceCodeResponseExpiryUsesResponseLifetime() throws {
        let response = try makeDeviceCodeResponse()

        let startedAt = Date(timeIntervalSince1970: 1_000)
        #expect(!isTunnelDeviceCodeResponseExpired(
            response,
            startedAt: startedAt,
            now: Date(timeIntervalSince1970: 1_899)
        ))
        #expect(isTunnelDeviceCodeResponseExpired(
            response,
            startedAt: startedAt,
            now: Date(timeIntervalSince1970: 1_900)
        ))
    }
}

@Suite(.serialized)
@MainActor
struct InjectedTransportTests {

    @Test func appStoreConnectUsesInjectedConnection() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let summary = makeSessionSummary(
            resource: "copilot:/session-1",
            title: "Restored session",
            modifiedAt: 42
        )

        store.servers = [server]
        store.selectedServerId = server.id

        let connectTask = Task { await store.connect() }

        let initialize = await transport.nextSentMessage()
        #expect(initialize.method == "initialize")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )

        let listSessions = await transport.nextSentMessage()
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [summary])
        )

        await connectTask.value

        #expect(store.sessionSummaries.count == 1)
        #expect(store.sessionSummaries.first?.resource == summary.resource)
        #expect(store.sessionSummaries.first?.title == summary.title)

        await connection.disconnect()
    }

    @Test func reconnectBannerWaitsForDebounceBeforeShowing() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(
            connection: connection,
            reconnectBannerDelayNanoseconds: 20_000_000
        )
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let summary = makeSessionSummary(
            resource: "copilot:/session-1",
            title: "Session",
            modifiedAt: 42
        )

        store.servers = [server]
        store.selectedServerId = server.id
        try await connectStore(store, over: transport, summaries: [summary])

        let reconnectTask = Task { await store.reconnect(debugTrigger: "manual reconnect") }
        let reconnect = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(reconnect.method == "reconnect")
        #expect(store.isReconnecting)
        #expect(!store.isReconnectBannerVisible)

        try? await Task.sleep(nanoseconds: 50_000_000)
        #expect(store.isReconnectBannerVisible)

        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [], missing: []))
        )

        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [summary])
        )

        await reconnectTask.value

        #expect(!store.isReconnecting)
        #expect(!store.isReconnectBannerVisible)

        await connection.disconnect()
    }

    @Test func sceneActiveReconnectsEvenWhileStateStillLooksConnected() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let sessionURI = "copilot:/session-1"
        let summary = makeSessionSummary(resource: sessionURI, title: "Session", modifiedAt: 42)
        let snapshot = makeSessionSnapshot(resource: sessionURI, title: "Session", fromSeq: 12)

        store.servers = [server]
        store.selectedServerId = server.id
        try await connectStore(store, over: transport, summaries: [summary])

        let selectTask = Task { await store.selectSession(uri: sessionURI) }
        let subscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(subscribe.method == "subscribe")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(subscribe),
            result: SubscribeResult(snapshot: snapshot)
        )
        await selectTask.value

        let sceneActiveTask = Task { await store.handleSceneActive() }
        let reconnect = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(reconnect.method == "reconnect")

        let reconnectParams = try decodeRequest(reconnect, as: ReconnectParams.self).params
        #expect(reconnectParams.subscriptions.contains("ahp-root://"))
        #expect(reconnectParams.subscriptions.contains(sessionURI))

        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [], missing: []))
        )

        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [summary])
        )

        await sceneActiveTask.value

        #expect(store.sessionDebugStatus.lastTrigger == "scene active reconnect")
        #expect(store.sessionDebugStatus.lastSuccessfulReconnectAt != nil)
        #expect(store.sessionDebugStatus.recentEvents.suffix(2).map(\.label) == ["scene active", "scene active reconnect"])

        await connection.disconnect()
    }

    @Test func triggerPathRetainsForegroundRecoveryAfterOpeningSession() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let sessionURI = "copilot:/session-1"
        let summary = makeSessionSummary(resource: sessionURI, title: "Session", modifiedAt: 42)
        let snapshot = makeSessionSnapshot(resource: sessionURI, title: "Session", fromSeq: 12)

        store.servers = [server]
        store.selectedServerId = server.id
        try await connectStore(store, over: transport, summaries: [summary])

        let initialSelectTask = Task { await store.selectSession(uri: sessionURI) }
        let initialSubscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialSubscribe),
            result: SubscribeResult(snapshot: snapshot)
        )
        await initialSelectTask.value

        let sceneActiveTask = Task { await store.handleSceneActive() }
        let reconnect = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [], missing: []))
        )
        let refreshedSummaries = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(refreshedSummaries),
            result: ListSessionsResult(items: [summary])
        )
        await sceneActiveTask.value

        await store.selectSession(uri: sessionURI)

        #expect(store.sessionDebugStatus.recentEvents.suffix(3).map(\.label) == [
            "scene active",
            "scene active reconnect",
            "open session",
        ])

        await connection.disconnect()
    }

    @Test func reconnectIfNeededRecordsWhySceneActiveDidNotReconnect() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let summary = makeSessionSummary(
            resource: "copilot:/session-1",
            title: "Session",
            modifiedAt: 42
        )

        store.servers = [server]
        store.selectedServerId = server.id
        try await connectStore(store, over: transport, summaries: [summary])

        await store.reconnectIfNeeded(debugTrigger: "scene active")

        #expect(store.sessionDebugStatus.lastTrigger == "scene active")
        #expect(store.sessionDebugStatus.lastTriggerDetail == "ignored: state connected")

        do {
            let unexpected = try await transport.nextSentMessage(timeoutNanoseconds: 50_000_000)
            Issue.record("Expected scene-active reconnect check to remain a no-op, got \(unexpected.method)")
        } catch TestHarnessError.sentMessageTimeout {}

        await connection.disconnect()
    }

    @Test func concurrentConnectCallsShareSingleInitializeSequence() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let summary = makeSessionSummary(
            resource: "copilot:/session-1",
            title: "Restored session",
            modifiedAt: 42
        )

        store.servers = [server]
        store.selectedServerId = server.id

        let firstConnect = Task { await store.connect() }
        let secondConnect = Task { await store.connect() }

        let initialize = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(initialize.method == "initialize")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )

        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [summary])
        )

        await firstConnect.value
        await secondConnect.value

        do {
            let unexpected = try await transport.nextSentMessage(timeoutNanoseconds: 50_000_000)
            Issue.record("Expected concurrent connect calls to coalesce, got extra \(unexpected.method)")
        } catch TestHarnessError.sentMessageTimeout {}

        await connection.disconnect()
    }

    @Test func reconnectIfNeededDoesNotRaceInitialConnect() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let summary = makeSessionSummary(
            resource: "copilot:/session-1",
            title: "Restored session",
            modifiedAt: 42
        )

        store.servers = [server]
        store.selectedServerId = server.id

        let connectTask = Task { await store.connect() }
        let reconnectTask = Task { await store.reconnectIfNeeded() }

        let initialize = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(initialize.method == "initialize")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )

        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [summary])
        )

        await connectTask.value
        await reconnectTask.value

        do {
            let unexpected = try await transport.nextSentMessage(timeoutNanoseconds: 50_000_000)
            Issue.record("Expected reconnectIfNeeded to no-op during first connect, got \(unexpected.method)")
        } catch TestHarnessError.sentMessageTimeout {}

        await connection.disconnect()
    }

    @Test func selectingSessionDuringStartupConnectWaitsForConnectBeforeSubscribing() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let sessionURI = "copilot:/session-1"
        let summary = makeSessionSummary(resource: sessionURI, title: "Session", modifiedAt: 42)
        let refreshedSnapshot = makeSessionSnapshot(resource: sessionURI, title: "Fresh session", fromSeq: 12)

        store.servers = [server]
        store.selectedServerId = server.id
        store.sessionSummariesCache[sessionURI] = summary

        let connectTask = Task { await store.connect() }
        let selectTask = Task { await store.selectSession(uri: sessionURI) }

        let initialize = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(initialize.method == "initialize")

        do {
            let unexpected = try await transport.nextSentMessage(timeoutNanoseconds: 50_000_000)
            Issue.record("Expected session selection to wait for startup connect, got \(unexpected.method)")
        } catch TestHarnessError.sentMessageTimeout {}

        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )

        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [summary])
        )

        let subscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(subscribe.method == "subscribe")
        let params = try decodeRequest(subscribe, as: SubscribeParams.self).params
        #expect(params.channel == sessionURI)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(subscribe),
            result: SubscribeResult(snapshot: refreshedSnapshot)
        )

        await connectTask.value
        await selectTask.value

        do {
            let unexpected = try await transport.nextSentMessage(timeoutNanoseconds: 50_000_000)
            Issue.record("Expected session selection to avoid reconnecting during startup, got \(unexpected.method)")
        } catch TestHarnessError.sentMessageTimeout {}

        #expect(store.selectedSessionURI == sessionURI)
        #expect(store.sessions[sessionURI]?.title == "Fresh session")

        await connection.disconnect()
    }

    @Test func refreshSessionSummariesRecoversViaReconnect() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(
            clientId: "test-client",
            requestTimeoutNanoseconds: 50_000_000,
            heartbeatIntervalNanoseconds: 60_000_000_000,
            heartbeatTimeoutNanoseconds: 50_000_000
        ) { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let initialSummary = makeSessionSummary(
            resource: "copilot:/session-1",
            title: "Initial summary",
            modifiedAt: 1
        )
        let refreshedSummary = makeSessionSummary(
            resource: initialSummary.resource,
            title: "Recovered summary",
            modifiedAt: 2
        )

        store.servers = [server]
        store.selectedServerId = server.id

        try await connectStore(store, over: transport, summaries: [initialSummary])

        let refreshTask = Task { await store.refreshSessionSummaries() }
        let stalledRefresh = await transport.nextSentMessage()
        #expect(stalledRefresh.method == "listSessions")

        let reconnect = await transport.nextSentMessage()
        #expect(reconnect.method == "reconnect")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [], missing: []))
        )

        let recoveredRefresh = await transport.nextSentMessage()
        #expect(recoveredRefresh.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(recoveredRefresh),
            result: ListSessionsResult(items: [refreshedSummary])
        )

        await refreshTask.value

        #expect(store.sessionSummaries.first?.title == refreshedSummary.title)
        #expect(store.errorMessage == nil)

        await connection.disconnect()
    }

    @Test func selectSessionRetriesAfterReconnect() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(
            clientId: "test-client",
            requestTimeoutNanoseconds: 50_000_000,
            heartbeatIntervalNanoseconds: 60_000_000_000,
            heartbeatTimeoutNanoseconds: 50_000_000
        ) { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let sessionURI = "copilot:/session-1"
        let summary = makeSessionSummary(resource: sessionURI, title: "Session", modifiedAt: 1)
        let snapshot = makeSessionSnapshot(resource: sessionURI, title: "Recovered session", fromSeq: 12)

        store.servers = [server]
        store.selectedServerId = server.id

        try await connectStore(store, over: transport, summaries: [summary])

        let selectTask = Task { await store.selectSession(uri: sessionURI) }
        let stalledSubscribe = await transport.nextSentMessage()
        #expect(stalledSubscribe.method == "subscribe")

        let reconnect = await transport.nextSentMessage()
        #expect(reconnect.method == "reconnect")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [], missing: []))
        )

        let retriedSubscribe = await transport.nextSentMessage()
        #expect(retriedSubscribe.method == "subscribe")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(retriedSubscribe),
            result: SubscribeResult(snapshot: snapshot)
        )

        await selectTask.value

        #expect(store.selectedSessionURI == sessionURI)
        #expect(store.sessions[sessionURI]?.title == "Recovered session")
        #expect(store.errorMessage == nil)

        await connection.disconnect()
    }

    @Test func connectRefreshesSelectedCachedSession() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let sessionURI = "copilot:/session-1"
        let summary = makeSessionSummary(resource: sessionURI, title: "Server summary", modifiedAt: 2)
        let refreshedSnapshot = makeSessionSnapshot(resource: sessionURI, title: "Fresh session", fromSeq: 12)

        store.servers = [server]
        store.selectedServerId = server.id
        store.sessions[sessionURI] = makeSessionState(resource: sessionURI, title: "Stale session", modifiedAt: 1)
        store.selectedSessionURI = sessionURI

        let connectTask = Task { await store.connect() }

        let initialize = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(initialize.method == "initialize")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )

        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [summary])
        )

        let subscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(subscribe.method == "subscribe")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(subscribe),
            result: SubscribeResult(snapshot: refreshedSnapshot)
        )

        await connectTask.value

        #expect(store.sessions[sessionURI]?.title == "Fresh session")
        #expect(store.selectedSessionURI == sessionURI)

        await connection.disconnect()
    }

    @Test func selectingCachedSessionAfterFullConnectResubscribesIfMarkedStale() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let store = AppStore(connection: connection)
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let sessionURI = "copilot:/session-1"
        let summary = makeSessionSummary(resource: sessionURI, title: "Server summary", modifiedAt: 2)
        let refreshedSnapshot = makeSessionSnapshot(resource: sessionURI, title: "Fresh session", fromSeq: 12)

        store.servers = [server]
        store.selectedServerId = server.id
        store.sessions[sessionURI] = makeSessionState(resource: sessionURI, title: "Stale session", modifiedAt: 1)

        try await connectStore(store, over: transport, summaries: [summary])

        let selectTask = Task { await store.selectSession(uri: sessionURI) }
        let subscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(subscribe.method == "subscribe")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(subscribe),
            result: SubscribeResult(snapshot: refreshedSnapshot)
        )

        await selectTask.value

        #expect(store.selectedSessionURI == sessionURI)
        #expect(store.sessions[sessionURI]?.title == "Fresh session")

        await connection.disconnect()
    }

    @Test func connectPrefetchesRecentActiveSessionsModifiedTodayUpToLimit() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let store = AppStore(connection: connection, currentDateProvider: { now })
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let startOfDay = timestampMilliseconds(Calendar.current.startOfDay(for: now))
        let expectedURIs = (1 ... 5).map { "copilot:/active-\($0)" }
        let summaries = [
            makeSessionSummary(resource: "copilot:/idle-today", title: "Idle today", status: .idle, modifiedAt: startOfDay + 10),
            makeSessionSummary(resource: "copilot:/old-active", title: "Old active", status: .inProgress, modifiedAt: startOfDay - 1),
            makeSessionSummary(resource: "copilot:/active-1", title: "Active 1", status: .inProgress, modifiedAt: startOfDay + 9),
            makeSessionSummary(resource: "copilot:/active-2", title: "Active 2", status: .inProgress, modifiedAt: startOfDay + 8),
            makeSessionSummary(resource: "copilot:/active-3", title: "Active 3", status: .inProgress, modifiedAt: startOfDay + 7),
            makeSessionSummary(resource: "copilot:/active-4", title: "Active 4", status: .inProgress, modifiedAt: startOfDay + 6),
            makeSessionSummary(resource: "copilot:/active-5", title: "Active 5", status: .inProgress, modifiedAt: startOfDay + 5),
            makeSessionSummary(resource: "copilot:/active-6", title: "Active 6", status: .inProgress, modifiedAt: startOfDay + 4)
        ]

        store.servers = [server]
        store.selectedServerId = server.id

        let connectTask = Task { await store.connect() }

        let initialize = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(initialize.method == "initialize")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )

        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(listSessions.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: summaries)
        )

        for expectedURI in expectedURIs {
            let subscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
            #expect(subscribe.method == "subscribe")
            let params = try decodeRequest(subscribe, as: SubscribeParams.self).params
            #expect(params.channel == expectedURI)
            try await transport.enqueueSuccessResponse(
                id: try requireRequestID(subscribe),
                result: SubscribeResult(snapshot: makeSessionSnapshot(resource: expectedURI, title: expectedURI, fromSeq: 20))
            )
        }

        do {
            _ = try await transport.nextSentMessage(timeoutNanoseconds: 50_000_000)
            Issue.record("Expected active-session prefetch to stop at the configured cap")
        } catch TestHarnessError.sentMessageTimeout {}

        await connectTask.value

        #expect(Set(store.sessions.keys) == Set(expectedURIs))

        await connection.disconnect()
    }

    @Test func refreshSessionSummariesUnsubscribesAutoPrefetchedSessionsThatFallOutOfScope() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let store = AppStore(connection: connection, currentDateProvider: { now })
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let startOfDay = timestampMilliseconds(Calendar.current.startOfDay(for: now))
        let sessionURI = "copilot:/active-1"
        let activeSummary = makeSessionSummary(
            resource: sessionURI,
            title: "Active session",
            status: .inProgress,
            modifiedAt: startOfDay + 1
        )
        let idleSummary = makeSessionSummary(
            resource: sessionURI,
            title: "Idle session",
            status: .idle,
            modifiedAt: startOfDay + 2
        )

        store.servers = [server]
        store.selectedServerId = server.id

        let connectTask = Task { await store.connect() }
        let initialize = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )
        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [activeSummary])
        )
        let subscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(subscribe),
            result: SubscribeResult(snapshot: makeSessionSnapshot(resource: sessionURI, title: "Prefetched", fromSeq: 11))
        )
        await connectTask.value

        let refreshTask = Task { await store.refreshSessionSummaries() }
        let refreshedList = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(refreshedList.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(refreshedList),
            result: ListSessionsResult(items: [idleSummary])
        )

        let unsubscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(unsubscribe.method == "unsubscribe")
        let params = try decodeNotification(unsubscribe, as: UnsubscribeParams.self).params
        #expect(params.channel == sessionURI)

        await refreshTask.value

        #expect(store.sessions[sessionURI] == nil)

        await connection.disconnect()
    }

    @Test func selectingAutoPrefetchedSessionPromotesItOutOfBackgroundUnsubscribe() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let store = AppStore(connection: connection, currentDateProvider: { now })
        let server = ServerConfiguration(name: "Test", host: "example.test")
        let startOfDay = timestampMilliseconds(Calendar.current.startOfDay(for: now))
        let sessionURI = "copilot:/active-1"
        let activeSummary = makeSessionSummary(
            resource: sessionURI,
            title: "Active session",
            status: .inProgress,
            modifiedAt: startOfDay + 1
        )
        let idleSummary = makeSessionSummary(
            resource: sessionURI,
            title: "Idle session",
            status: .idle,
            modifiedAt: startOfDay + 2
        )

        store.servers = [server]
        store.selectedServerId = server.id

        let connectTask = Task { await store.connect() }
        let initialize = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(initialize),
            result: makeInitializeResult(serverSeq: 10)
        )
        let listSessions = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(listSessions),
            result: ListSessionsResult(items: [activeSummary])
        )
        let subscribe = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(subscribe),
            result: SubscribeResult(snapshot: makeSessionSnapshot(resource: sessionURI, title: "Prefetched", fromSeq: 11))
        )
        await connectTask.value

        await store.selectSession(uri: sessionURI)

        let refreshTask = Task { await store.refreshSessionSummaries() }
        let refreshedList = try await transport.nextSentMessage(timeoutNanoseconds: 1_000_000_000)
        #expect(refreshedList.method == "listSessions")
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(refreshedList),
            result: ListSessionsResult(items: [idleSummary])
        )

        await refreshTask.value

        do {
            _ = try await transport.nextSentMessage(timeoutNanoseconds: 50_000_000)
            Issue.record("Expected selected auto-prefetched session to remain subscribed")
        } catch TestHarnessError.sentMessageTimeout {}

        #expect(store.selectedSessionURI == sessionURI)
        #expect(store.sessions[sessionURI] != nil)

        await connection.disconnect()
    }

    @Test func injectedTransportCanHoldARequestOpenWithoutResponse() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }

        try await connectConnection(connection, over: transport)

        let listTask = Task { try await connection.listSessions() }
        let listSessions = await transport.nextSentMessage()

        #expect(listSessions.method == "listSessions")

        await connection.disconnect()

        do {
            _ = try await listTask.value
            Issue.record("Expected pending request to fail after disconnecting the fake transport")
        } catch {}
    }

    @Test func requestTimeoutTriggersUnexpectedDisconnectRecovery() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(
            clientId: "test-client",
            requestTimeoutNanoseconds: 50_000_000,
            heartbeatIntervalNanoseconds: 60_000_000_000,
            heartbeatTimeoutNanoseconds: 50_000_000
        ) { _, _ in transport }
        let disconnectSignal = AsyncSignal()

        await connection.setOnUnexpectedDisconnect {
            Task { await disconnectSignal.fire() }
        }

        try await connectConnection(connection, over: transport)

        let listTask = Task { try await connection.listSessions() }
        let listSessions = await transport.nextSentMessage()
        #expect(listSessions.method == "listSessions")

        await disconnectSignal.wait()

        do {
            _ = try await listTask.value
            Issue.record("Expected half-open request to time out")
        } catch AHPConnection.ConnectionError.timeout {
        } catch {
            Issue.record("Expected timeout error, got \(error)")
        }

        let state = await connection.state
        #expect(state == .disconnected)
    }

    @Test func injectedTransportCanStopTheReceiveLoop() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let disconnectSignal = AsyncSignal()

        await connection.setOnUnexpectedDisconnect {
            Task { await disconnectSignal.fire() }
        }

        try await connectConnection(connection, over: transport)
        await transport.failNextReceive(TestWebSocketTransport.TransportError.receiveStopped)
        await disconnectSignal.wait()

        let state = await connection.state
        #expect(state == .disconnected)
    }

    @Test func heartbeatTimeoutTriggersUnexpectedDisconnectRecovery() async throws {
        let transport = TestWebSocketTransport()
        await transport.setPingBehavior(.timeout)
        let connection = AHPConnection(
            clientId: "test-client",
            requestTimeoutNanoseconds: 60_000_000_000,
            heartbeatIntervalNanoseconds: 50_000_000,
            heartbeatTimeoutNanoseconds: 50_000_000
        ) { _, _ in transport }
        let disconnectSignal = AsyncSignal()

        await connection.setOnUnexpectedDisconnect {
            Task { await disconnectSignal.fire() }
        }

        try await connectConnection(connection, over: transport)
        await disconnectSignal.wait()

        let state = await connection.state
        #expect(state == .disconnected)
    }

    @Test func injectedTransportCanReconnectWithSnapshot() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let sessionURI = "copilot:/snapshot-session"

        try await connectConnection(connection, over: transport, serverSeq: 10)

        let reconnectTask = Task { try await connection.reconnect(to: testServerURL) }
        let reconnect = await transport.nextSentMessage()

        #expect(reconnect.method == "reconnect")

        let reconnectParams = try decodeRequest(reconnect, as: ReconnectParams.self).params
        #expect(reconnectParams.lastSeenServerSeq == 10)
        #expect(reconnectParams.subscriptions == ["ahp-root://"])

        let snapshotResult = ReconnectResult.snapshot(ReconnectSnapshotResult(
            type: .snapshot,
            snapshots: [makeSessionSnapshot(resource: sessionURI, title: "From snapshot", fromSeq: 14)]
        ))
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: snapshotResult
        )

        let result = try await reconnectTask.value
        guard case .snapshot(let snapshot) = result else {
            Issue.record("Expected reconnect to return a snapshot result")
            return
        }

        #expect(snapshot.snapshots.count == 1)
        #expect(snapshot.snapshots[0].resource == sessionURI)

        let serverSeq = await connection.serverSeq
        #expect(serverSeq == 14)

        await connection.disconnect()
    }

    @Test func injectedTransportCanReconnectAfterAnUnacknowledgedOutboundAction() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let disconnectSignal = AsyncSignal()
        let sessionURI = "ahp-session:/queued-session"
        let replayedAction = makeTurnStartedAction(text: "Hello again")

        await connection.setOnUnexpectedDisconnect {
            Task { await disconnectSignal.fire() }
        }

        try await connectConnection(connection, over: transport, serverSeq: 20)

        try await connection.dispatchAction(replayedAction, channel: sessionURI)
        let dispatch = await transport.nextSentMessage()

        #expect(dispatch.method == "dispatchAction")

        let dispatchParams = try decodeNotification(dispatch, as: DispatchActionParams.self).params
        #expect(dispatchParams.clientSeq > 0)
        #expect(dispatchParams.channel == sessionURI)

        await transport.failNextReceive(TestWebSocketTransport.TransportError.receiveStopped)
        await disconnectSignal.wait()

        let reconnectTask = Task { try await connection.reconnect(to: testServerURL) }
        let reconnect = await transport.nextSentMessage()

        #expect(reconnect.method == "reconnect")

        let reconnectParams = try decodeRequest(reconnect, as: ReconnectParams.self).params
        #expect(reconnectParams.lastSeenServerSeq == 20)
        #expect(reconnectParams.subscriptions == ["ahp-root://"])

        let replayResult = ReconnectResult.replay(ReconnectReplayResult(
            type: .replay,
            actions: [],
            missing: []
        ))
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: replayResult
        )

        let replayedDispatch = await transport.nextSentMessage()
        #expect(replayedDispatch.method == "dispatchAction")

        let replayedDispatchParams = try decodeNotification(replayedDispatch, as: DispatchActionParams.self).params
        #expect(replayedDispatchParams.clientSeq == dispatchParams.clientSeq)
        #expect(replayedDispatchParams.channel == sessionURI)

        let result = try await reconnectTask.value
        guard case .replay(let replay) = result else {
            Issue.record("Expected reconnect to return a replay result")
            return
        }

        #expect(replay.actions.isEmpty)

        await connection.disconnect()
    }

    @Test func reconnectDoesNotReplayActionsAlreadyAcknowledgedByReplay() async throws {
        let transport = TestWebSocketTransport()
        let connection = AHPConnection(clientId: "test-client") { _, _ in transport }
        let disconnectSignal = AsyncSignal()
        let sessionURI = "ahp-session:/queued-session"
        let replayedAction = makeTurnStartedAction(text: "Hello again")

        await connection.setOnUnexpectedDisconnect {
            Task { await disconnectSignal.fire() }
        }

        try await connectConnection(connection, over: transport, serverSeq: 20)

        try await connection.dispatchAction(replayedAction, channel: sessionURI)
        let dispatch = await transport.nextSentMessage()
        let dispatchParams = try decodeNotification(dispatch, as: DispatchActionParams.self).params

        await transport.failNextReceive(TestWebSocketTransport.TransportError.receiveStopped)
        await disconnectSignal.wait()

        let reconnectTask = Task { try await connection.reconnect(to: testServerURL) }
        let reconnect = await transport.nextSentMessage()

        let replayResult = ReconnectResult.replay(ReconnectReplayResult(
            type: .replay,
            actions: [ActionEnvelope(
                channel: sessionURI,
                action: replayedAction,
                serverSeq: 21,
                origin: ActionOrigin(clientId: "test-client", clientSeq: dispatchParams.clientSeq)
            )],
            missing: []
        ))
        try await transport.enqueueSuccessResponse(
            id: try requireRequestID(reconnect),
            result: replayResult
        )

        let result = try await reconnectTask.value
        guard case .replay(let replay) = result else {
            Issue.record("Expected reconnect to return a replay result")
            return
        }

        #expect(replay.actions.count == 1)
        #expect(replay.actions[0].origin?.clientSeq == dispatchParams.clientSeq)
        let bufferedMessageCount = await transport.bufferedSentMessageCount()
        #expect(bufferedMessageCount == 0)

        await connection.disconnect()
    }
}

private let testServerURL = URL(string: "ws://example.test")!

private actor AsyncSignal {
    private var isFired = false
    private var waiter: CheckedContinuation<Void, Never>?

    func wait() async {
        guard !isFired else { return }
        await withCheckedContinuation { continuation in
            waiter = continuation
        }
    }

    func fire() {
        guard !isFired else { return }
        isFired = true
        waiter?.resume()
        waiter = nil
    }
}

private actor TestWebSocketTransport: AHPWebSocketTransport {
    enum TransportError: Error {
        case closed
        case receiveStopped
        case pingTimedOut
    }

    enum PingBehavior {
        case succeed
        case timeout
    }

    struct SentMessage: Sendable {
        let data: Data
        let id: Int?
        let method: String

        init(data: Data) throws {
            let probe = try JSONDecoder().decode(MessageProbe.self, from: data)
            self.data = data
            self.id = probe.id
            self.method = probe.method
        }
    }

    private struct MessageProbe: Decodable {
        let id: Int?
        let method: String
    }

    private var sentMessages: [SentMessage] = []
    private var sentWaiters: [CheckedContinuation<SentMessage, Never>] = []
    private var timedSentWaiters: [UUID: CheckedContinuation<SentMessage, Error>] = [:]
    private var receiveQueue: [Result<Data, Error>] = []
    private var receiveWaiters: [CheckedContinuation<Data, Error>] = []
    private var pingBehavior: PingBehavior = .succeed

    func connect() async throws {}

    func send(_ data: Data) async throws {
        let message = try SentMessage(data: data)
        if let waiter = sentWaiters.first {
            sentWaiters.removeFirst()
            waiter.resume(returning: message)
        } else if let waiterId = timedSentWaiters.keys.first,
                  let waiter = timedSentWaiters.removeValue(forKey: waiterId) {
            waiter.resume(returning: message)
        } else {
            sentMessages.append(message)
        }
    }

    func receiveMessage() async throws -> Data {
        if let next = receiveQueue.first {
            receiveQueue.removeFirst()
            return try next.get()
        }

        return try await withCheckedThrowingContinuation { continuation in
            receiveWaiters.append(continuation)
        }
    }

    func sendPing(timeoutNanoseconds: UInt64) async throws {
        switch pingBehavior {
        case .succeed:
            return
        case .timeout:
            try? await Task.sleep(nanoseconds: timeoutNanoseconds)
            throw TransportError.pingTimedOut
        }
    }

    func close() async {
        let waiters = receiveWaiters
        receiveWaiters.removeAll()
        for waiter in waiters {
            waiter.resume(throwing: TransportError.closed)
        }
    }

    func nextSentMessage() async -> SentMessage {
        if let next = sentMessages.first {
            sentMessages.removeFirst()
            return next
        }

        return await withCheckedContinuation { continuation in
            sentWaiters.append(continuation)
        }
    }

    func nextSentMessage(timeoutNanoseconds: UInt64) async throws -> SentMessage {
        if let next = sentMessages.first {
            sentMessages.removeFirst()
            return next
        }

        let waiterId = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                timedSentWaiters[waiterId] = continuation
                Task { [weak self] in
                    try? await Task.sleep(nanoseconds: timeoutNanoseconds)
                    await self?.timeoutTimedSentWaiter(id: waiterId)
                }
            }
        } onCancel: {
            Task { await self.cancelTimedSentWaiter(id: waiterId) }
        }
    }

    func enqueueIncoming(_ data: Data) {
        if let waiter = receiveWaiters.first {
            receiveWaiters.removeFirst()
            waiter.resume(returning: data)
        } else {
            receiveQueue.append(.success(data))
        }
    }

    func failNextReceive(_ error: Error) {
        if let waiter = receiveWaiters.first {
            receiveWaiters.removeFirst()
            waiter.resume(throwing: error)
        } else {
            receiveQueue.append(.failure(error))
        }
    }

    func setPingBehavior(_ behavior: PingBehavior) {
        pingBehavior = behavior
    }

    func enqueueSuccessResponse<Result: Codable & Sendable>(id: Int, result: Result) throws {
        let data = try JSONEncoder().encode(TestSuccessResponse(id: id, result: result))
        enqueueIncoming(data)
    }

    func enqueueActionNotification(_ envelope: ActionEnvelope) throws {
        let data = try JSONEncoder().encode(JsonRpcNotification(method: "action", params: envelope))
        enqueueIncoming(data)
    }

    func bufferedSentMessageCount() -> Int {
        sentMessages.count
    }

    private func timeoutTimedSentWaiter(id: UUID) {
        timedSentWaiters.removeValue(forKey: id)?.resume(throwing: TestHarnessError.sentMessageTimeout)
    }

    private func cancelTimedSentWaiter(id: UUID) {
        timedSentWaiters.removeValue(forKey: id)?.resume(throwing: CancellationError())
    }
}

private struct TestSuccessResponse<Result: Codable & Sendable>: Codable, Sendable {
    let jsonrpc = "2.0"
    let id: Int
    let result: Result
}

private enum TestHarnessError: Error {
    case missingRequestID(String)
    case sentMessageTimeout
}

private func connectConnection(
    _ connection: AHPConnection,
    over transport: TestWebSocketTransport,
    serverSeq: Int = 10
) async throws {
    let connectTask = Task { try await connection.connect(to: testServerURL) }
    let initialize = await transport.nextSentMessage()
    try await transport.enqueueSuccessResponse(
        id: try requireRequestID(initialize),
        result: makeInitializeResult(serverSeq: serverSeq)
    )
    _ = try await connectTask.value
}

private func connectStore(
    _ store: AppStore,
    over transport: TestWebSocketTransport,
    summaries: [SessionSummary],
    serverSeq: Int = 10
) async throws {
    let connectTask = Task { await store.connect() }
    let initialize = await transport.nextSentMessage()
    try await transport.enqueueSuccessResponse(
        id: try requireRequestID(initialize),
        result: makeInitializeResult(serverSeq: serverSeq)
    )
    let listSessions = await transport.nextSentMessage()
    try await transport.enqueueSuccessResponse(
        id: try requireRequestID(listSessions),
        result: ListSessionsResult(items: summaries)
    )
    await connectTask.value
}

private func requireRequestID(_ message: TestWebSocketTransport.SentMessage) throws -> Int {
    guard let id = message.id else {
        throw TestHarnessError.missingRequestID(message.method)
    }
    return id
}

private func decodeRequest<Params: Codable & Sendable>(
    _ message: TestWebSocketTransport.SentMessage,
    as type: Params.Type
) throws -> JsonRpcRequest<Params> {
    try JSONDecoder().decode(JsonRpcRequest<Params>.self, from: message.data)
}

private func decodeNotification<Params: Codable & Sendable>(
    _ message: TestWebSocketTransport.SentMessage,
    as type: Params.Type
) throws -> JsonRpcNotification<Params> {
    try JSONDecoder().decode(JsonRpcNotification<Params>.self, from: message.data)
}

private func makeDeviceCodeResponse() throws -> DeviceCodeResponse {
    let json = """
    {
      "device_code": "device",
      "user_code": "ABCD-EFGH",
      "verification_uri": "https://github.com/login/device",
      "expires_in": 900,
      "interval": 5
    }
    """
    return try JSONDecoder().decode(DeviceCodeResponse.self, from: Data(json.utf8))
}

private func makeInitializeResult(serverSeq: Int) -> InitializeResult {
    InitializeResult(
        protocolVersion: "0.3.0",
        serverSeq: serverSeq,
        snapshots: [Snapshot(
            resource: "ahp-root://",
            state: .root(RootState(agents: [])),
            fromSeq: serverSeq
        )]
    )
}

private func makeSessionSnapshot(resource: String, title: String, fromSeq: Int) -> Snapshot {
    Snapshot(
        resource: resource,
        state: .session(makeSessionState(resource: resource, title: title, modifiedAt: fromSeq)),
        fromSeq: fromSeq
    )
}

private func makeSessionState(resource: String, title: String, modifiedAt: Int) -> SessionState {
    SessionState(
        provider: "copilot",
        title: title,
        status: .idle,
        lifecycle: .ready,
        activeClients: [],
        chats: []
    )
}

private func makeSessionSummary(
    resource: String,
    title: String,
    status: SessionStatus = .idle,
    modifiedAt: Int
) -> SessionSummary {
    SessionSummary(
        provider: "copilot",
        title: title,
        status: status,
        resource: resource,
        createdAt: isoTimestamp(millis: 0),
        modifiedAt: isoTimestamp(millis: modifiedAt)
    )
}

/// Formats a millisecond epoch value as an ISO-8601 timestamp with fixed
/// millisecond precision so lexicographic ordering matches chronological order.
private func isoTimestamp(millis: Int) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(identifier: "UTC")
    return formatter.string(from: Date(timeIntervalSince1970: Double(millis) / 1000))
}

private func timestampMilliseconds(_ date: Date) -> Int {
    Int(date.timeIntervalSince1970 * 1000)
}

private func makeTurnStartedAction(text: String) -> StateAction {
    .sessionTurnStarted(SessionTurnStartedAction(
        type: .sessionTurnStarted,
        turnId: UUID().uuidString,
        message: Message(text: text, origin: MessageOrigin(kind: .user))
    ))
}
