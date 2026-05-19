// MultiHostClientTests — integration tests for the multi-host SDK.
//
// Each test spins up one or more `FakeHost`s over `InMemoryTransport.pair()`
// (mirroring `clients/rust/crates/ahp/tests/hosts.rs`) and exercises the
// `MultiHostClient` facade end to end.

import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class MultiHostClientTests: XCTestCase {

    // MARK: - single_constructor_yields_connected_handle

    func testSingleConstructorYieldsConnectedHandle() async throws {
        let agent = makeAgent()
        let state = FakeHostState(agents: [agent])
        let factory = makeFakeHostFactory(state: state)
        let config = HostConfig(id: "local", label: "Local", transportFactory: factory)

        let (multi, _) = try await MultiHostClient.single(config)
        defer { Task { await multi.shutdown() } }

        await waitForHostState(multi, id: "local") { $0.isConnected }

        let snap = await multi.host("local")
        XCTAssertNotNil(snap)
        XCTAssertEqual(snap?.label, "Local")
        XCTAssertEqual(snap?.protocolVersion, "0.2.0")
        XCTAssertEqual(snap?.agents.count, 1)
        XCTAssertEqual(snap?.agents.first?.provider, "copilot")
        XCTAssertNotNil(snap?.lastConnectedAt)
        XCTAssertTrue(snap?.state.isConnected ?? false)

        await multi.shutdown()
    }

    // MARK: - two_hosts_register_and_connect_independently

    func testTwoHostsRegisterAndConnectIndependently() async throws {
        let multi = MultiHostClient()

        _ = try await multi.add(HostConfig(
            id: "a",
            label: "A",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))
        _ = try await multi.add(HostConfig(
            id: "b",
            label: "B",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))

        await waitForHostState(multi, id: "a") { $0.isConnected }
        await waitForHostState(multi, id: "b") { $0.isConnected }

        let hosts = await multi.hosts()
        XCTAssertEqual(hosts.count, 2)
        XCTAssertTrue(hosts.allSatisfy { $0.state.isConnected })
        let labels = Set(hosts.map(\.label))
        XCTAssertEqual(labels, ["A", "B"])

        await multi.shutdown()
    }

    // MARK: - aggregated_sessions_track_listsessions_then_notification

    func testAggregatedSessionsTrackListSessionsThenNotification() async throws {
        let initial = makeSummary("ahp-session:/s1", "Initial title", modifiedAt: 1_000)
        let added = makeSummary("ahp-session:/s2", "Added later", modifiedAt: 2_000)

        let factory = makeFakeHostFactory(
            state: FakeHostState(sessions: [initial]),
            injectAfterInit: added
        )

        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "local", label: "Local", transportFactory: factory))
        await waitForHostState(multi, id: "local") { $0.isConnected }

        await waitUntil { await multi.aggregatedSessions().count == 2 }
        let aggregated = await multi.aggregatedSessions()
        let titles = aggregated.map(\.summary.title)
        XCTAssertEqual(titles, ["Added later", "Initial title"])
        XCTAssertTrue(aggregated.allSatisfy { $0.hostId == "local" })
        XCTAssertTrue(aggregated.allSatisfy { $0.hostLabel == "Local" })

        await multi.shutdown()
    }

    // MARK: - host_client_handle_invalidates_after_reconnect

    func testHostClientHandleInvalidatesAfterReconnect() async throws {
        let factory = makeFakeHostFactory(state: FakeHostState())

        let multi = MultiHostClient()
        let config = HostConfig(id: "local", label: "Local", transportFactory: factory)
            .withReconnectPolicy(.immediateForever)
        _ = try await multi.add(config)

        await waitForHostState(multi, id: "local") { $0.isConnected }

        let handleOpt = await multi.client(for: "local")
        let handle = try XCTUnwrap(handleOpt)
        let initialGeneration = handle.generation
        try await handle.checkAlive()

        try await multi.reconnect("local")
        await waitUntil {
            guard let snap = await multi.host("local") else { return false }
            return snap.generation > initialGeneration && snap.state.isConnected
        }

        do {
            try await handle.checkAlive()
            XCTFail("expected HostError.hostReconnected")
        } catch let error as HostError {
            switch error {
            case .hostReconnected(_, let handleGen, let currentGen):
                XCTAssertEqual(handleGen, initialGeneration)
                XCTAssertGreaterThan(currentGen, initialGeneration)
            default:
                XCTFail("unexpected error: \(error)")
            }
        }

        let freshOpt = await multi.client(for: "local")
        let fresh = try XCTUnwrap(freshOpt)
        XCTAssertGreaterThan(fresh.generation, initialGeneration)
        try await fresh.checkAlive()

        await multi.shutdown()
    }

    // MARK: - dispatch_can_use_explicit_client_seq

    func testDispatchCanUseExplicitClientSeqThroughMultiHostSurfaces() async throws {
        let recorder = DispatchRecorder()
        let factory: HostTransportFactory = { _ in
            let (clientSide, serverSide) = InMemoryTransport.pair()
            _ = startDispatchRecordingHost(transport: serverSide, recorder: recorder)
            return clientSide
        }

        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "local", label: "Local", transportFactory: factory))
        await waitForHostState(multi, id: "local") { $0.isConnected }

        let action = StateAction.sessionTitleChanged(SessionTitleChangedAction(
            type: .sessionTitleChanged,
            title: "From app outbox"
        ))

        let first = try await multi.dispatch(host: "local", action: action, channel: "copilot:/s1", clientSeq: 42)
        XCTAssertEqual(first.clientSeq, 42)

        let handleValue = await multi.client(for: "local")
        let handle = try XCTUnwrap(handleValue)
        let second = try await handle.dispatch(action, channel: "copilot:/s1", clientSeq: 77)
        XCTAssertEqual(second.clientSeq, 77)

        await waitUntil { await recorder.clientSeqs() == [42, 77] }

        await multi.shutdown()
    }

    // MARK: - remove_host_terminates_supervisor_and_emits_event

    func testRemoveHostTerminatesSupervisorAndEmitsEvent() async throws {
        let factory = makeFakeHostFactory(state: FakeHostState())

        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "temp", label: "Temporary", transportFactory: factory))
        await waitForHostState(multi, id: "temp") { $0.isConnected }

        let events = await multi.hostEvents()

        try await multi.remove("temp")

        var sawRemoved = false
        let deadline = ContinuousClock.now + .milliseconds(2_000)
        var iter = events.makeAsyncIterator()
        while ContinuousClock.now < deadline {
            guard let event = try await Self.nextWithTimeout(&iter, timeout: .milliseconds(200))
            else { break }
            if case .removed(let id) = event, id == "temp" {
                sawRemoved = true
                break
            }
        }
        XCTAssertTrue(sawRemoved, "expected HostEvent.removed for temp")

        let snap = await multi.host("temp")
        XCTAssertNil(snap)

        await multi.shutdown()
    }

    // MARK: - fan_in_events_carry_host_id_and_resource

    func testFanInEventsCarryHostIdAndResource() async throws {
        let initialA = makeSummary("ahp-session:/a-1", "first-a", modifiedAt: 100)
        let injectA = makeSummary("ahp-session:/added-a", "a-side", modifiedAt: 200)
        let initialB = makeSummary("ahp-session:/b-1", "first-b", modifiedAt: 100)
        let injectB = makeSummary("ahp-session:/added-b", "b-side", modifiedAt: 300)

        let multi = MultiHostClient()
        let events = await multi.events()

        _ = try await multi.add(HostConfig(
            id: "a",
            label: "Host A",
            transportFactory: makeFakeHostFactory(
                state: FakeHostState(sessions: [initialA]),
                injectAfterInit: injectA
            )
        ))
        _ = try await multi.add(HostConfig(
            id: "b",
            label: "Host B",
            transportFactory: makeFakeHostFactory(
                state: FakeHostState(sessions: [initialB]),
                injectAfterInit: injectB
            )
        ))

        var hostsSeen: Set<HostId> = []
        let deadline = ContinuousClock.now + .milliseconds(3_000)
        var iter = events.makeAsyncIterator()
        while hostsSeen.count < 2 && ContinuousClock.now < deadline {
            guard let event = try await Self.nextWithTimeout(&iter, timeout: .milliseconds(500))
            else { break }
            hostsSeen.insert(event.hostId)
            // Notifications carry the channel they were delivered on. For
            // `root/sessionAdded`, that's the root channel.
            XCTAssertEqual(event.resource, RootResourceURI)
        }
        XCTAssertTrue(hostsSeen.contains("a"), "missing event from host A; saw \(hostsSeen)")
        XCTAssertTrue(hostsSeen.contains("b"), "missing event from host B; saw \(hostsSeen)")

        await multi.shutdown()
    }

    // MARK: - transport_factory_is_called_for_each_reconnect

    func testTransportFactoryIsCalledForEachReconnect() async throws {
        let counter = CallCounter()
        let factory: HostTransportFactory = { _ in
            await counter.bump()
            let (clientSide, serverSide) = InMemoryTransport.pair()
            _ = FakeHost.start(transport: serverSide, state: FakeHostState())
            return clientSide
        }

        let multi = MultiHostClient()
        let config = HostConfig(id: "local", label: "Local", transportFactory: factory)
            .withReconnectPolicy(.immediateForever)
        _ = try await multi.add(config)

        await waitForHostState(multi, id: "local") { $0.isConnected }
        let count1 = await counter.value()
        XCTAssertEqual(count1, 1)

        try await multi.reconnect("local")
        await waitUntil {
            let snap = await multi.host("local")
            return await counter.value() >= 2 && (snap?.state.isConnected ?? false)
        }
        let count2 = await counter.value()
        XCTAssertEqual(count2, 2)

        await multi.shutdown()
    }

    // MARK: - duplicate_host_id_is_rejected

    func testDuplicateHostIdIsRejected() async throws {
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(
            id: "dup",
            label: "first",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))

        do {
            _ = try await multi.add(HostConfig(
                id: "dup",
                label: "second",
                transportFactory: makeFakeHostFactory(state: FakeHostState())
            ))
            XCTFail("expected duplicate-id rejection")
        } catch let error as HostError {
            if case .duplicateHost(let id) = error {
                XCTAssertEqual(id, "dup")
            } else {
                XCTFail("expected .duplicateHost, got \(error)")
            }
        }

        await multi.shutdown()
    }

    // MARK: - subscribe_while_failed_remembers_uri_for_replay

    /// While a host is in `.failed` state, `subscribe(host:uri:)` should still
    /// remember the URI so the next successful reconnect picks it up.
    /// Unsubscribe in the same window should drop the URI from the replay set.
    func testSubscribeWhileFailedRemembersForReplay() async throws {
        // Build a transport factory that fails the first attempt and then
        // succeeds on subsequent attempts. Combine with `.disabled` so the
        // first failure parks the host in `.failed`.
        let didFirstFail = ActorBool()
        let factory: HostTransportFactory = { _ in
            if !(await didFirstFail.value) {
                await didFirstFail.set(true)
                throw TransportError.io("intentional first-attempt failure")
            }
            let (clientSide, serverSide) = InMemoryTransport.pair()
            _ = FakeHost.start(transport: serverSide, state: FakeHostState())
            return clientSide
        }
        let config = HostConfig(id: "tt", label: "T", transportFactory: factory)
            .withReconnectPolicy(.disabled)

        let multi = MultiHostClient()
        _ = try await multi.add(config)

        await waitForHostState(multi, id: "tt") { $0.isFailed }

        // Subscribe while disconnected. The runtime returns `hostShutDown`
        // but appends the URI to the replay set.
        do {
            _ = try await multi.subscribe(host: "tt", uri: "ahp-session:/queued")
            XCTFail("expected subscribe to reject while failed")
        } catch let error as HostError {
            if case .hostShutDown = error {} else {
                XCTFail("expected .hostShutDown while failed, got \(error)")
            }
        }

        // Unsubscribe an unrelated URI while disconnected — should succeed
        // and not throw, even though no live client exists.
        try await multi.unsubscribe(host: "tt", uri: "ahp-session:/never-subscribed")

        var snap = await multi.host("tt")
        XCTAssertEqual(snap?.subscriptions.contains("ahp-session:/queued"), true,
                       "queued subscribe URI should be recorded for replay")

        // Manually reconnect — second attempt succeeds.
        try await multi.reconnect("tt")
        await waitForHostState(multi, id: "tt") { $0.isConnected }

        snap = await multi.host("tt")
        XCTAssertEqual(snap?.subscriptions.contains("ahp-session:/queued"), true,
                       "subscription should survive into the new connection")

        await multi.shutdown()
    }

    // MARK: - reconnect_replay_actions_are_fanned_out_with_advanced_seq

    func testReconnectReplayActionsAreFannedOutWithAdvancedSeq() async throws {
        let mode = ReconnectResponseModeSwitch()
        let multi = MultiHostClient()
        let events = await multi.events()
        let config = HostConfig(
            id: "h",
            label: "Host",
            transportFactory: makeReconnectResultFactory(mode: mode)
        ).withInitialSubscriptions([RootResourceURI, "copilot:/missing"])

        _ = try await multi.add(config)
        await waitForHostState(multi, id: "h") { $0.isConnected }
        let initialSnapshotValue = await multi.host("h")
        let initialSnapshot = try XCTUnwrap(initialSnapshotValue)
        let initialGeneration = initialSnapshot.generation

        await mode.set(.replayWithMissingAndLiveAction)
        try await multi.reconnect("h")
        await waitUntil {
            guard let snap = await multi.host("h") else { return false }
            return snap.generation > initialGeneration && snap.state.isConnected
        }

        var iter = events.makeAsyncIterator()
        let replayed = try await Self.nextWithTimeout(&iter, timeout: .seconds(2))
        let replayEnvelope = try XCTUnwrap(actionEnvelope(from: replayed))
        XCTAssertEqual(replayed?.hostId, "h")
        XCTAssertEqual(replayed?.resource, RootResourceURI)
        XCTAssertEqual(replayEnvelope.serverSeq, 42)
        guard case .rootActiveSessionsChanged(let replayAction) = replayEnvelope.action else {
            XCTFail("expected rootActiveSessionsChanged replay action")
            return
        }
        XCTAssertEqual(replayAction.activeSessions, 7)

        let live = try await Self.nextWithTimeout(&iter, timeout: .seconds(2))
        let liveEnvelope = try XCTUnwrap(actionEnvelope(from: live))
        XCTAssertEqual(live?.hostId, "h")
        XCTAssertEqual(live?.resource, RootResourceURI)
        XCTAssertEqual(liveEnvelope.serverSeq, 43)
        guard case .rootActiveSessionsChanged(let liveAction) = liveEnvelope.action else {
            XCTFail("expected rootActiveSessionsChanged live action")
            return
        }
        XCTAssertEqual(liveAction.activeSessions, 8)

        let snapValue = await multi.host("h")
        let snap = try XCTUnwrap(snapValue)
        XCTAssertEqual(snap.serverSeq, 43)
        XCTAssertEqual(snap.activeSessions, 8)
        XCTAssertFalse(snap.subscriptions.contains("copilot:/missing"))

        await multi.shutdown()
    }

    // MARK: - reconnect_snapshot_applies_state_and_prunes_missing_subscriptions

    func testReconnectSnapshotAppliesStateAndPrunesMissingSubscriptions() async throws {
        let mode = ReconnectResponseModeSwitch()
        let multi = MultiHostClient()
        let config = HostConfig(
            id: "h",
            label: "Host",
            transportFactory: makeReconnectResultFactory(mode: mode)
        ).withInitialSubscriptions([RootResourceURI, "copilot:/missing"])

        _ = try await multi.add(config)
        await waitForHostState(multi, id: "h") { $0.isConnected }
        let initialSnapshotValue = await multi.host("h")
        let initialSnapshot = try XCTUnwrap(initialSnapshotValue)
        let initialGeneration = initialSnapshot.generation

        await mode.set(.snapshotRootOnly)
        try await multi.reconnect("h")
        await waitUntil {
            guard let snap = await multi.host("h") else { return false }
            return snap.generation > initialGeneration && snap.state.isConnected
        }

        let snapValue = await multi.host("h")
        let snap = try XCTUnwrap(snapValue)
        XCTAssertEqual(snap.serverSeq, 77)
        XCTAssertEqual(snap.activeSessions, 9)
        XCTAssertTrue(snap.subscriptions.contains(RootResourceURI))
        XCTAssertFalse(snap.subscriptions.contains("copilot:/missing"))

        await multi.shutdown()
    }

    // MARK: - shutdown_tears_down_all_hosts_and_streams

    func testShutdownTearsDownAllHostsAndStreams() async throws {
        let multi = MultiHostClient()

        _ = try await multi.add(HostConfig(
            id: "alpha",
            label: "Alpha",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))
        _ = try await multi.add(HostConfig(
            id: "beta",
            label: "Beta",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))
        await waitForHostState(multi, id: "alpha") { $0.isConnected }
        await waitForHostState(multi, id: "beta") { $0.isConnected }

        let events = await multi.events()
        let hostEvents = await multi.hostEvents()

        await multi.shutdown()

        // After shutdown, both streams should finish so `for await` exits.
        var subEvents = 0
        for await _ in events { subEvents += 1 }
        var hostEventCount = 0
        for await _ in hostEvents { hostEventCount += 1 }
        // We don't assert specific counts — just that the loops end.
        _ = subEvents
        _ = hostEventCount

        // No host snapshots should be retrievable.
        let alphaSnap = await multi.host("alpha")
        let betaSnap = await multi.host("beta")
        XCTAssertNil(alphaSnap)
        XCTAssertNil(betaSnap)

        // Subsequent `add` should reject with `hostShutDown`.
        do {
            _ = try await multi.add(HostConfig(
                id: "gamma",
                label: "Gamma",
                transportFactory: makeFakeHostFactory(state: FakeHostState())
            ))
            XCTFail("expected add to reject after shutdown")
        } catch let error as HostError {
            if case .hostShutDown(let id) = error {
                XCTAssertEqual(id, "gamma")
            } else {
                XCTFail("expected .hostShutDown, got \(error)")
            }
        }

        // Idempotent.
        await multi.shutdown()
    }

    // MARK: - state_during_backoff_after_drop_is_reconnecting

    /// Regression: while the supervisor is sleeping in backoff after a
    /// successful connection dropped, snapshots must report
    /// `.reconnecting(...)` rather than `.connected`. The previous
    /// implementation only transitioned at the *top* of the next iteration
    /// so consumers observed `.connected` for the entire backoff window.
    func testStateDuringBackoffAfterDropIsReconnecting() async throws {
        // Build a transport factory whose first server side answers the
        // handshake + listSessions and then waits for a "drop now" signal
        // before closing — that way we can deterministically wait for
        // `.connected`, then trigger the drop, then assert the state
        // transitioned to `.reconnecting` during the backoff sleep.
        // Subsequent connect attempts park (never reply) so the runtime
        // stays in the post-drop backoff/reconnecting window.
        let dropSignal = DropSignal()
        let didFirstConnect = ActorBool()
        let factory: HostTransportFactory = { _ in
            let (clientSide, serverSide) = InMemoryTransport.pair()
            if !(await didFirstConnect.value) {
                await didFirstConnect.set(true)
                Task {
                    // Answer requests until the drop signal is set.
                    while !dropSignal.isReady {
                        let frame: TransportMessage?
                        do { frame = try await serverSide.recv() } catch { return }
                        guard let frame, case .text(let text) = frame,
                              let data = text.data(using: .utf8),
                              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                              let id = object["id"] as? Int,
                              let method = object["method"] as? String
                        else { continue }
                        let result: Any
                        switch method {
                        case "initialize":
                            let snap: [String: Any] = [
                                "resource": RootResourceURI,
                                "state": ["agents": [], "activeSessions": 0] as [String: Any],
                                "fromSeq": 0,
                            ]
                            result = [
                                "protocolVersion": "0.2.0",
                                "serverSeq": 0,
                                "snapshots": [snap],
                            ] as [String: Any]
                        case "listSessions":
                            result = ["items": []] as [String: Any]
                        default:
                            result = [:] as [String: Any]
                        }
                        let resp: [String: Any] = [
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": result,
                        ]
                        if let bytes = try? JSONSerialization.data(withJSONObject: resp),
                           let body = String(data: bytes, encoding: .utf8) {
                            try? await serverSide.send(.text(body))
                        }
                    }
                    try? await serverSide.close()
                }
                // Sample the drop signal periodically so we close even if
                // no further request arrives. This keeps the test
                // deterministic when there's no in-flight request to
                // unblock the recv() loop.
                Task {
                    while !dropSignal.isReady {
                        try? await Task.sleep(for: .milliseconds(20))
                    }
                    try? await serverSide.close()
                }
            } else {
                // Subsequent attempts: park (never reply) so the runtime
                // stays in `.reconnecting` while we observe.
                Task { _ = try? await serverSide.recv() }
            }
            return clientSide
        }
        // Long initial backoff so we have a generous window to observe
        // `.reconnecting` during sleep.
        let policy = ReconnectPolicy(
            backoff: .constant(.seconds(5)),
            jitter: 0.0,
            maxAttempts: nil,
            resetOnSuccess: true
        )
        let config = HostConfig(id: "drop", label: "Drop", transportFactory: factory)
            .withReconnectPolicy(policy)

        let multi = MultiHostClient()
        _ = try await multi.add(config)

        // Wait for the first connect to land.
        await waitForHostState(multi, id: "drop") { $0.isConnected }

        // Trigger the drop, then wait for the runtime to surface
        // `.reconnecting`. Without the fix, this poll would spin until
        // timeout because state stayed `.connected` through the entire
        // backoff sleep.
        dropSignal.trigger()
        await waitForHostState(multi, id: "drop", timeout: .seconds(2)) { state in
            if case .reconnecting = state { return true }
            return false
        }

        await multi.shutdown()
    }

    // MARK: - failed_handshake_shuts_down_underlying_client

    /// Regression: if `initialize`/`reconnect` throws after `client.connect()`
    /// has already started the writer/receive tasks, the supervisor must
    /// shut the `AHPClient` down before propagating — otherwise the
    /// orphaned client's tasks keep holding the transport indefinitely
    /// while the supervisor opens a fresh one for the next attempt.
    /// We assert this indirectly by observing that the wrapped transport's
    /// `close()` is invoked.
    func testFailedHandshakeShutsDownUnderlyingClient() async throws {
        let observer = ClosedObserver()
        let factory: HostTransportFactory = { _ in
            let (clientSide, serverSide) = InMemoryTransport.pair()
            // Server returns an RPC error response to `initialize`.
            _ = startFailingInitFakeHost(transport: serverSide)
            return TrackingTransport(clientSide, observer: observer)
        }
        // `disabled` so the host bails into `.failed` after one failed
        // handshake instead of looping forever.
        let config = HostConfig(id: "fail", label: "Fail", transportFactory: factory)
            .withReconnectPolicy(.disabled)

        let multi = MultiHostClient()
        _ = try await multi.add(config)

        // Wait for the host to hit `.failed`.
        await waitForHostState(multi, id: "fail", timeout: .seconds(2)) { $0.isFailed }

        // The supervisor should have shut down the AHPClient on the
        // handshake failure, which closes the wrapped transport.
        let closed = await observer.isClosed
        XCTAssertTrue(closed, "AHPClient.shutdown() should have closed the transport on a failed handshake")

        await multi.shutdown()
    }

    // MARK: - Helpers

    /// Like `nextWithTimeout` from `AHPClientTestHelpers` but typed for any
    /// `AsyncStream` element.
    private static func nextWithTimeout<E>(
        _ iterator: inout AsyncStream<E>.AsyncIterator,
        timeout: Duration
    ) async throws -> E? where E: Sendable {
        try await withThrowingTaskGroup(of: E?.self) { group in
            group.addTask { [iterator = iterator] in
                var iter = iterator
                return await iter.next()
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw TestTimeoutError()
            }
            defer { group.cancelAll() }
            return try await group.next()!
        }
    }
}

private actor CallCounter {
    private var n: Int = 0
    func bump() { n += 1 }
    func value() -> Int { n }
}

private actor ActorBool {
    private var flag: Bool = false
    var value: Bool { flag }
    func set(_ v: Bool) { flag = v }
}

private enum ReconnectResponseMode: Sendable {
    case emptyReplay
    case replayWithMissingAndLiveAction
    case snapshotRootOnly
}

private actor ReconnectResponseModeSwitch {
    private var mode: ReconnectResponseMode = .emptyReplay
    var value: ReconnectResponseMode { mode }
    func set(_ mode: ReconnectResponseMode) { self.mode = mode }
}

/// `Sendable` flag used by drop-driven tests. Using a `final class` with a
/// lock instead of an actor so the server-side `recv` loop can poll it
/// without `await`-ing into actor isolation between every frame.
private final class DropSignal: @unchecked Sendable {
    private let lock = NSLock()
    private var flag: Bool = false
    var isReady: Bool {
        lock.lock(); defer { lock.unlock() }
        return flag
    }
    func trigger() {
        lock.lock(); defer { lock.unlock() }
        flag = true
    }
}

private struct TestTimeoutError: Error {}

private func actionEnvelope(from event: HostSubscriptionEvent?) -> ActionEnvelope? {
    guard let event else { return nil }
    guard case .action(let envelope) = event.event else { return nil }
    return envelope
}

// MARK: - Reconnect-result fake host

private func makeReconnectResultFactory(mode: ReconnectResponseModeSwitch) -> HostTransportFactory {
    { _ in
        let (clientSide, serverSide) = InMemoryTransport.pair()
        Task { await driveReconnectResultHost(transport: serverSide, mode: mode) }
        return clientSide
    }
}

private func driveReconnectResultHost(
    transport: InMemoryTransport,
    mode: ReconnectResponseModeSwitch
) async {
    while !Task.isCancelled {
        let frame: TransportMessage?
        do {
            frame = try await transport.recv()
        } catch {
            return
        }
        guard let frame else { return }
        guard case .text(let text) = frame,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = object["id"] as? Int,
              let method = object["method"] as? String
        else { continue }

        let currentMode = await mode.value
        let result: Any
        switch method {
        case "initialize":
            result = initializeResult(serverSeq: 40, activeSessions: 1)
        case "reconnect":
            result = reconnectResult(for: currentMode)
        case "listSessions":
            result = ["items": []] as [String: Any]
        default:
            result = [:] as [String: Any]
        }

        guard await sendResponse(to: id, result: result, on: transport) else { return }

        if method == "reconnect" && currentMode == .replayWithMissingAndLiveAction {
            guard await sendActionNotification(
                serverSeq: 43,
                activeSessions: 8,
                on: transport
            ) else { return }
        }
    }
}

private func initializeResult(serverSeq: Int, activeSessions: Int) -> [String: Any] {
    [
        "protocolVersion": "0.1.0",
        "serverSeq": serverSeq,
        "snapshots": [rootSnapshot(fromSeq: serverSeq, activeSessions: activeSessions)],
    ] as [String: Any]
}

private func reconnectResult(for mode: ReconnectResponseMode) -> [String: Any] {
    switch mode {
    case .emptyReplay:
        return [
            "type": "replay",
            "actions": [],
            "missing": [],
        ] as [String: Any]
    case .replayWithMissingAndLiveAction:
        return [
            "type": "replay",
            "actions": [
                actionEnvelopeJSON(serverSeq: 42, activeSessions: 7)
            ],
            "missing": ["copilot:/missing"],
        ] as [String: Any]
    case .snapshotRootOnly:
        return [
            "type": "snapshot",
            "snapshots": [rootSnapshot(fromSeq: 77, activeSessions: 9)],
        ] as [String: Any]
    }
}

private func rootSnapshot(fromSeq: Int, activeSessions: Int) -> [String: Any] {
    [
        "resource": RootResourceURI,
        "state": [
            "agents": [],
            "activeSessions": activeSessions,
        ] as [String: Any],
        "fromSeq": fromSeq,
    ]
}

private func actionEnvelopeJSON(serverSeq: Int, activeSessions: Int) -> [String: Any] {
    [
        "channel": RootResourceURI,
        "action": [
            "type": "root/activeSessionsChanged",
            "activeSessions": activeSessions,
        ] as [String: Any],
        "serverSeq": serverSeq,
    ]
}

private func sendResponse(
    to id: Int,
    result: Any,
    on transport: InMemoryTransport
) async -> Bool {
    let response: [String: Any] = [
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    ]
    return await sendJSONObject(response, on: transport)
}

private func sendActionNotification(
    serverSeq: Int,
    activeSessions: Int,
    on transport: InMemoryTransport
) async -> Bool {
    let notification: [String: Any] = [
        "jsonrpc": "2.0",
        "method": "action",
        "params": actionEnvelopeJSON(serverSeq: serverSeq, activeSessions: activeSessions),
    ]
    return await sendJSONObject(notification, on: transport)
}

private func sendJSONObject(_ object: [String: Any], on transport: InMemoryTransport) async -> Bool {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let text = String(data: data, encoding: .utf8)
    else { return false }
    do {
        try await transport.send(.text(text))
        return true
    } catch {
        return false
    }
}

// MARK: - Dispatch-recording fake host

private func startDispatchRecordingHost(
    transport: InMemoryTransport,
    recorder: DispatchRecorder
) -> Task<Void, Never> {
    Task {
        while !Task.isCancelled {
            let frame: TransportMessage?
            do {
                frame = try await transport.recv()
            } catch {
                return
            }
            guard let frame else { return }
            guard case .text(let text) = frame,
                  let data = text.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let method = object["method"] as? String
            else { continue }

            if let id = object["id"] as? Int {
                switch method {
                case "initialize":
                    _ = await sendResponse(
                        to: id,
                        result: initializeResult(serverSeq: 0, activeSessions: 0),
                        on: transport
                    )
                case "reconnect":
                    _ = await sendResponse(
                        to: id,
                        result: ["type": "replay", "actions": [], "missing": []] as [String: Any],
                        on: transport
                    )
                case "listSessions":
                    _ = await sendResponse(to: id, result: ["items": []] as [String: Any], on: transport)
                default:
                    _ = await sendResponse(to: id, result: [:] as [String: Any], on: transport)
                }
            } else if method == "dispatchAction",
                      let params = object["params"] as? [String: Any],
                      let clientSeq = params["clientSeq"] as? Int {
                await recorder.append(clientSeq)
            }
        }
    }
}

private actor DispatchRecorder {
    private var seqs: [Int] = []

    func append(_ clientSeq: Int) {
        seqs.append(clientSeq)
    }

    func clientSeqs() -> [Int] {
        seqs
    }
}

// MARK: - Failing-handshake fake host

/// Fake-host driver that responds to `initialize` with a JSON-RPC error
/// instead of a result. Causes the client's `initialize` request to throw
/// `AHPClientError.rpc(...)`. Used to assert the supervisor tears the
/// `AHPClient` down on a failed handshake.
private func startFailingInitFakeHost(
    transport: InMemoryTransport,
    code: Int = -32000,
    message: String = "init refused for test"
) -> Task<Void, Never> {
    Task {
        while !Task.isCancelled {
            let frame: TransportMessage?
            do {
                frame = try await transport.recv()
            } catch {
                return
            }
            guard let frame else { return }
            guard case .text(let text) = frame,
                  let data = text.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = object["id"] as? Int,
                  let method = object["method"] as? String
            else { continue }
            if method == "initialize" || method == "reconnect" {
                let resp: [String: Any] = [
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": [
                        "code": code,
                        "message": message,
                    ] as [String: Any],
                ]
                if let respData = try? JSONSerialization.data(withJSONObject: resp),
                   let respText = String(data: respData, encoding: .utf8) {
                    try? await transport.send(.text(respText))
                }
            } else {
                let resp: [String: Any] = [
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": [:] as [String: Any],
                ]
                if let respData = try? JSONSerialization.data(withJSONObject: resp),
                   let respText = String(data: respData, encoding: .utf8) {
                    try? await transport.send(.text(respText))
                }
            }
        }
    }
}

// MARK: - Tracking transport wrapper

/// A `Sendable` thin wrapper around `InMemoryTransport` that flips an
/// observable `isClosed` flag when `close()` runs. Used to assert that the
/// supervisor calls `AHPClient.shutdown()` (which calls `transport.close()`)
/// on a failed handshake.
private final class TrackingTransport: AHPTransport, @unchecked Sendable {
    private let underlying: InMemoryTransport
    private let observer: ClosedObserver

    init(_ underlying: InMemoryTransport, observer: ClosedObserver) {
        self.underlying = underlying
        self.observer = observer
    }

    func send(_ message: TransportMessage) async throws {
        try await underlying.send(message)
    }

    func recv() async throws -> TransportMessage? {
        try await underlying.recv()
    }

    func close() async throws {
        await observer.markClosed()
        try await underlying.close()
    }
}

private actor ClosedObserver {
    private(set) var closeCount: Int = 0
    var isClosed: Bool { closeCount > 0 }
    func markClosed() { closeCount += 1 }
}
