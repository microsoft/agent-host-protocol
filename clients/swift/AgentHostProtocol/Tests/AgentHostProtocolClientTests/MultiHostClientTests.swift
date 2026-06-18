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

    // MARK: - events_host_uri_delivers_live_envelopes

    /// `events(host:uri:)` should deliver live notifications scoped to
    /// the listener's channel without dropping. Smoke test: server
    /// pushes a `root/sessionAdded` notification after `initialize`;
    /// a listener on the root channel (where session notifications are
    /// scoped) sees it.
    func testEventsHostUriDeliversLiveSessionNotification() async throws {
        let initial = makeSummary("ahp-session:/sess", "init", modifiedAt: 100)
        let added = makeSummary("ahp-session:/added", "post", modifiedAt: 200)
        let factory = makeFakeHostFactory(
            state: FakeHostState(sessions: [initial]),
            injectAfterInit: added
        )
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "h", label: "Host", transportFactory: factory))

        // Attach immediately, before waiting for the connect to land —
        // the FakeHost injects the notification ~20ms after answering
        // `initialize`, and we don't want to race that. The injected
        // notification is `root/sessionAdded`, scoped to the root
        // channel, so the listener must be attached to RootResourceURI
        // to receive it.
        let stream = await multi.events(host: "h", uri: RootResourceURI)
        XCTAssertNotNil(stream)

        await waitForHostState(multi, id: "h") { $0.isConnected }

        // Wait for the injected sessionAdded notification.
        var iter = stream!.makeAsyncIterator()
        var sawNotification = false
        let deadline = ContinuousClock.now + .seconds(2)
        while !sawNotification && ContinuousClock.now < deadline {
            let next: SubscriptionEvent?
            do {
                next = try await Self.nextWithTimeout(&iter, timeout: .milliseconds(300))
            } catch {
                break
            }
            guard let event = next else { continue }
            if case .sessionAdded(let params) = event {
                XCTAssertEqual(params.summary.resource, "ahp-session:/added")
                sawNotification = true
            }
        }
        XCTAssertTrue(sawNotification,
                      "expected the injected sessionAdded notification on the per-channel stream")

        await multi.shutdown()
    }

    // MARK: - events_host_uri_survives_reconnect_and_replays

    /// Per-channel streams from `events(host:uri:)` are runtime-owned
    /// (not per-`AHPClient`), so they must survive reconnect. After a
    /// reconnect that returns replay actions, the listener attached
    /// before the reconnect should observe the replayed envelopes.
    func testEventsHostUriSurvivesReconnectAndSeesReplay() async throws {
        let mode = ReconnectResponseModeSwitch()
        let multi = MultiHostClient()
        let config = HostConfig(
            id: "h",
            label: "Host",
            transportFactory: makeReconnectResultFactory(mode: mode)
        )
        _ = try await multi.add(config)
        await waitForHostState(multi, id: "h") { $0.isConnected }
        let initialGenValue = await multi.host("h")
        let initialGen = try XCTUnwrap(initialGenValue).generation

        // Attach the per-channel listener AFTER the first connect, but
        // BEFORE we trigger the reconnect — so the listener is in place
        // when `applyReconnectResult` fans out the replayed envelope.
        let stream = await multi.events(host: "h", uri: RootResourceURI)
        XCTAssertNotNil(stream)
        var iter = stream!.makeAsyncIterator()

        await mode.set(.replayWithMissingAndLiveAction)
        try await multi.reconnect("h")
        await waitUntil(timeout: .seconds(2)) {
            guard let snap = await multi.host("h") else { return false }
            return snap.generation > initialGen && snap.state.isConnected
        }

        // Look for the replayed envelope on the per-channel stream.
        // The `.replayWithMissingAndLiveAction` mode replays a single
        // rootActiveSessionsChanged action at serverSeq=42 with
        // activeSessions=7.
        var sawReplay = false
        let deadline = ContinuousClock.now + .seconds(1)
        while !sawReplay && ContinuousClock.now < deadline {
            let next: SubscriptionEvent?
            do {
                next = try await Self.nextWithTimeout(&iter, timeout: .milliseconds(200))
            } catch {
                break
            }
            guard let event = next else { continue }
            guard case .action(let envelope) = event else { continue }
            guard case .rootActiveSessionsChanged(let inner) = envelope.action else { continue }
            if inner.activeSessions == 7 && envelope.serverSeq == 42 {
                sawReplay = true
            }
        }
        XCTAssertTrue(sawReplay,
                      "per-channel stream should see replayed envelopes after reconnect")

        await multi.shutdown()
    }

    // MARK: - events_host_uri_returns_nil_for_unknown_host

    func testEventsHostUriReturnsNilForUnknownHost() async throws {
        let multi = MultiHostClient()
        let stream = await multi.events(host: "missing", uri: "copilot:/anything")
        XCTAssertNil(stream)
        await multi.shutdown()
    }

    // MARK: - events_host_uri_finishes_on_host_removal

    /// Per-URI streams should finish when their host is removed so
    /// consumers' `for await` loops exit cleanly instead of hanging.
    func testEventsHostUriFinishesOnHostRemoval() async throws {
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(
            id: "tmp",
            label: "Temp",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))
        await waitForHostState(multi, id: "tmp") { $0.isConnected }

        let stream = await multi.events(host: "tmp", uri: "copilot:/x")
        XCTAssertNotNil(stream)

        try await multi.remove("tmp")

        // Drain — should exit promptly because the stream was finished.
        var count = 0
        for await _ in stream! {
            count += 1
            if count > 10 { break } // safety
        }
        // We don't assert the exact count, only that the for-await loop exits.

        await multi.shutdown()
    }

    // MARK: - host_snapshots_yields_initial_then_on_connect

    /// `hostSnapshots(host:)` yields the current snapshot
    /// immediately on subscription, then yields a fresh snapshot on
    /// state changes (e.g., when the host transitions to `.connected`).
    func testHostSnapshotsYieldsInitialThenOnConnect() async throws {
        let factory = makeFakeHostFactory(state: FakeHostState())
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "h", label: "H", transportFactory: factory))

        let stream = await multi.hostSnapshots(host: "h")
        XCTAssertNotNil(stream)

        var iter = stream!.makeAsyncIterator()
        // First yield is the initial snapshot (whatever state we caught).
        let initial = try await Self.nextWithTimeout(&iter, timeout: .seconds(1))
        XCTAssertNotNil(initial)
        XCTAssertEqual(initial?.id, "h")

        // Pump until we see `.connected` (skipping transient states).
        var connectedSnap: HostHandle?
        let deadline = ContinuousClock.now + .seconds(2)
        while ContinuousClock.now < deadline {
            let next: HostHandle?
            do {
                next = try await Self.nextWithTimeout(&iter, timeout: .milliseconds(300))
            } catch {
                break
            }
            guard let snap = next else { continue }
            if snap.state.isConnected {
                connectedSnap = snap
                break
            }
        }
        XCTAssertNotNil(connectedSnap, "expected a `.connected` snapshot to be emitted")
        XCTAssertEqual(connectedSnap?.id, "h")

        await multi.shutdown()
    }

    // MARK: - host_snapshots_returns_nil_for_unknown_host

    func testHostSnapshotsReturnsNilForUnknownHost() async throws {
        let multi = MultiHostClient()
        let stream = await multi.hostSnapshots(host: "missing")
        XCTAssertNil(stream)
        await multi.shutdown()
    }

    // MARK: - host_snapshots_finishes_on_host_removal

    func testHostSnapshotsFinishesOnHostRemoval() async throws {
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(
            id: "h", label: "H",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))
        await waitForHostState(multi, id: "h") { $0.isConnected }

        let stream = await multi.hostSnapshots(host: "h")
        XCTAssertNotNil(stream)

        try await multi.remove("h")

        // Drain — should exit promptly.
        var seen = 0
        for await _ in stream! {
            seen += 1
            if seen > 50 { break }
        }
        // Just assert the loop terminated.
        _ = seen

        await multi.shutdown()
    }

    // MARK: - session_summaries_yields_initial_then_on_notification

    /// `sessionSummaries(host:)` yields the current cached
    /// summaries immediately on subscription, then yields a fresh
    /// sorted list on `sessionAdded` / `sessionRemoved` /
    /// `sessionSummaryChanged` notifications.
    func testSessionSummariesYieldsInitialThenOnNotification() async throws {
        let initial = makeSummary("copilot:/s1", "Initial", modifiedAt: 100)
        let added = makeSummary("copilot:/s2", "Added", modifiedAt: 200)
        let factory = makeFakeHostFactory(
            state: FakeHostState(sessions: [initial]),
            injectAfterInit: added
        )
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "h", label: "H", transportFactory: factory))

        // Attach immediately so the stream is in place when the injected
        // notification arrives.
        let stream = await multi.sessionSummaries(host: "h")
        XCTAssertNotNil(stream)

        var iter = stream!.makeAsyncIterator()
        // The initial yield (right at subscription time) reflects whatever
        // is cached at that instant — may be empty because the supervisor
        // is still in its handshake. The connect signal will emit a
        // post-listSessions value, and the injected notification will
        // emit another. We poll until we see both `initial` (post
        // listSessions) and `added` (post notification).
        var sawInitial = false
        var sawAdded = false
        let deadline = ContinuousClock.now + .seconds(3)
        while !(sawInitial && sawAdded) && ContinuousClock.now < deadline {
            let next: [SessionSummary]?
            do {
                next = try await Self.nextWithTimeout(&iter, timeout: .milliseconds(400))
            } catch {
                break
            }
            guard let summaries = next else { continue }
            let uris = Set(summaries.map(\.resource))
            if uris.contains("copilot:/s1") { sawInitial = true }
            if uris.contains("copilot:/s2") { sawAdded = true }
        }
        XCTAssertTrue(sawInitial, "expected listSessions-seeded summary on the stream")
        XCTAssertTrue(sawAdded, "expected injected sessionAdded notification to update the stream")

        await multi.shutdown()
    }

    // MARK: - session_summaries_returns_nil_for_unknown_host

    func testSessionSummariesReturnsNilForUnknownHost() async throws {
        let multi = MultiHostClient()
        let stream = await multi.sessionSummaries(host: "missing")
        XCTAssertNil(stream)
        await multi.shutdown()
    }

    // MARK: - reconnect_all_unavailable_skips_connected_and_wakes_others

    /// `reconnectAllUnavailable()` should walk every host and
    /// trigger a manual reconnect on those NOT in `.connected` or
    /// `.connecting`. Connected hosts are not perturbed.
    func testReconnectAllUnavailableSkipsConnectedAndWakesOthers() async throws {
        // Host A: connects normally (will stay `.connected`).
        let counterA = CallCounter()
        let factoryA: HostTransportFactory = { _ in
            await counterA.bump()
            let (clientSide, serverSide) = InMemoryTransport.pair()
            _ = FakeHost.start(transport: serverSide, state: FakeHostState())
            return clientSide
        }

        // Host B: first attempt fails (driving it to `.failed` because
        // policy is `.disabled`), second attempt (via manual reconnect)
        // succeeds.
        let didFirstFail = ActorBool()
        let counterB = CallCounter()
        let factoryB: HostTransportFactory = { _ in
            await counterB.bump()
            if !(await didFirstFail.value) {
                await didFirstFail.set(true)
                throw TransportError.io("intentional first-attempt failure")
            }
            let (clientSide, serverSide) = InMemoryTransport.pair()
            _ = FakeHost.start(transport: serverSide, state: FakeHostState())
            return clientSide
        }

        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "a", label: "A", transportFactory: factoryA))
        _ = try await multi.add(HostConfig(id: "b", label: "B", transportFactory: factoryB)
            .withReconnectPolicy(.disabled))

        await waitForHostState(multi, id: "a") { $0.isConnected }
        await waitForHostState(multi, id: "b") { $0.isFailed }

        let aCountBefore = await counterA.value()
        XCTAssertEqual(aCountBefore, 1)

        // Wake all unavailable. A should be skipped; B should be
        // reconnected.
        let errors = await multi.reconnectAllUnavailable()
        XCTAssertTrue(errors.isEmpty, "expected reconnects to ack without error, got \(errors)")

        await waitForHostState(multi, id: "b") { $0.isConnected }
        let aCountAfter = await counterA.value()
        let bCountAfter = await counterB.value()
        XCTAssertEqual(aCountAfter, 1, "host A should not have been re-connected")
        XCTAssertEqual(bCountAfter, 2, "host B should have re-attempted exactly once")

        await multi.shutdown()
    }

    // MARK: - reconnect_all_unavailable_returns_empty_when_all_connected

    func testReconnectAllUnavailableReturnsEmptyWhenAllConnected() async throws {
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(
            id: "x", label: "X",
            transportFactory: makeFakeHostFactory(state: FakeHostState())
        ))
        await waitForHostState(multi, id: "x") { $0.isConnected }

        let errors = await multi.reconnectAllUnavailable()
        XCTAssertTrue(errors.isEmpty)

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

    // MARK: - host_runtime_advertises_supported_protocol_versions

    /// Asserts that `HostRuntime` passes `SUPPORTED_PROTOCOL_VERSIONS` (from
    /// the generated `AgentHostProtocol` module) as the `protocolVersions`
    /// list in every `initialize` call, and never sends the old hard-coded
    /// "0.2.0" string.
    func testHostRuntimeAdvertisesSupportedProtocolVersionsOnInitialize() async throws {
        let capture = InitVersionCapture()
        let factory: HostTransportFactory = { _ in
            let (clientSide, serverSide) = InMemoryTransport.pair()
            _ = Task {
                await driveCapturingFakeHost(transport: serverSide, capture: capture)
            }
            return clientSide
        }

        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "local", label: "Local", transportFactory: factory))
        await waitForHostState(multi, id: "local") { $0.isConnected }

        let versions = try await withThrowingTaskGroup(of: [String].self) { group in
            group.addTask { await capture.wait() }
            group.addTask {
                try await Task.sleep(for: .seconds(2))
                throw TestTimeoutError()
            }
            defer { group.cancelAll() }
            return try await group.next()!
        }
        XCTAssertEqual(versions, SUPPORTED_PROTOCOL_VERSIONS,
            "HostRuntime must advertise SUPPORTED_PROTOCOL_VERSIONS on initialize")
        XCTAssertFalse(versions.contains("0.2.0"),
            "HostRuntime must not send the stale hard-coded '0.2.0'")

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

// MARK: - Protocol-version-capturing fake host

/// Captures the `protocolVersions` list sent in the first `initialize` request.
private actor InitVersionCapture {
    private var captured: [String]? = nil
    private var hasStored = false
    private var waiter: CheckedContinuation<[String], Never>? = nil

    func store(_ versions: [String]) {
        guard !hasStored else { return }
        hasStored = true
        if let w = waiter {
            waiter = nil
            w.resume(returning: versions)
        } else {
            captured = versions
        }
    }

    func wait() async -> [String] {
        if let v = captured { return v }
        return await withCheckedContinuation { c in
            waiter = c
        }
    }
}

/// Server-side driver that records the `protocolVersions` from `initialize`
/// and returns a minimal valid response so the runtime can reach `.connected`.
private func driveCapturingFakeHost(
    transport: InMemoryTransport,
    capture: InitVersionCapture
) async {
    while !Task.isCancelled {
        let frame: TransportMessage?
        do { frame = try await transport.recv() } catch { return }
        guard let frame else { return }
        guard case .text(let text) = frame,
              let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { continue }

        guard let id = obj["id"] as? Int,
              let method = obj["method"] as? String
        else { continue }

        let result: [String: Any]
        switch method {
        case "initialize":
            if let params = obj["params"] as? [String: Any],
               let versions = params["protocolVersions"] as? [String] {
                await capture.store(versions)
            }
            result = [
                "protocolVersion": PROTOCOL_VERSION,
                "serverSeq": 0,
                "snapshots": [] as [Any],
            ]
        case "listSessions":
            result = ["items": [] as [Any]]
        default:
            result = [:]
        }

        let resp: [String: Any] = ["jsonrpc": "2.0", "id": id, "result": result]
        guard let respData = try? JSONSerialization.data(withJSONObject: resp),
              let respText = String(data: respData, encoding: .utf8)
        else { continue }
        try? await transport.send(.text(respText))
    }
}
