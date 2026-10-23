import Foundation
import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class WindowingLifecycleTests: XCTestCase {
    func testRPCFailureRemovesUnacceptedChannelAndDoesNotBlockLaterSends() async throws {
        let h = try await ReviewHarness.open()
        let uri = "ahp-terminal:/denied"
        let task = Task { try await h.client.subscribe(uri, options: .windowed()) }
        let request = try await h.request("subscribe")
        try await h.peer.send(.encoded(.errorResponse(id: request["id"] as! Int,
            error: JsonRpcError(code: -32602, message: "denied"))))
        do { _ = try await task.value; XCTFail("expected RPC failure") } catch AHPClientError.rpc {}
        let missing = await h.client.subscription(for: uri)
        XCTAssertNil(missing)
        let count = await h.client._windowOrderCount()
        XCTAssertEqual(count, 0)
        try await h.client.send(method: "custom/data", params: ReviewData(channel: uri, data: "ordinary"))
        _ = try await h.recorder.take(["method": "custom/data"])
        let state = await h.client.connectionState
        XCTAssertEqual(state, .connected)
        await h.close()
    }

    func testDroppingChannelSuppressesAlreadyQueuedCredit() async throws {
        let h = try await ReviewHarness.open()
        let sub = try await h.subscribe("ahp-terminal:/credit", receive: .manual)
        let item = try await sub.next()
        await h.gate.block()
        let blocker = Task {
            try await h.client.send(method: "custom/data", params: ReviewData(channel: RootResourceURI, data: "block"))
        }
        try await reviewEventually { await h.client._callerWriteCount() == 1 }
        await item?.release()
        try await reviewEventually { await h.client._windowWriteCount() >= 2 }
        let close = Task { try await sub.close() }
        try await reviewEventually { await h.client.subscription(for: sub.channel) == nil }
        await h.gate.unblock()
        try await blocker.value
        try await close.value
        _ = try await h.recorder.take(["method": "custom/data"])
        _ = try await h.recorder.take(["method": "unsubscribe"])
        let methods = await h.recorder.allMethods()
        XCTAssertFalse(methods.contains("channel/credit"))
        await h.close()
    }

    func testCallerCapCannotRejectCreditsFramesUnsubscribeOrReset() async throws {
        let h = try await ReviewHarness.open()
        let data = try await h.subscribe("ahp-terminal:/data", receive: .manual)
        let closing = try await h.subscribe("ahp-terminal:/closing")
        let tcp = try await h.subscribe("ahp-tcp:/tcp")
        let snapshot = try await data.next()
        await h.gate.block()
        var callers: [Task<Void, Error>] = []
        for i in 0..<256 {
            callers.append(Task {
                try await h.client.send(method: "custom/data", params: ReviewData(channel: RootResourceURI, data: "\(i)"))
            })
        }
        try await reviewEventually { await h.client._callerWriteCount() == 256 }
        do {
            try await h.client.send(method: "custom/data", params: ReviewData(channel: RootResourceURI, data: "overflow"))
            XCTFail("caller admission should be bounded")
        } catch AHPWindowingError.backpressure {}
        await snapshot?.release()
        let frame = Task { try await data.send(method: "custom/window", params: ReviewData(channel: data.channel, data: "x")) }
        let unsubscribe = Task { try await closing.close() }
        let reset = Task { try await tcp.send(method: "tcp/reset", params: TcpResetParams(channel: tcp.channel)) }
        try await reviewEventually { await h.client._windowWriteCount() >= 260 }
        let state = await h.client.connectionState
        XCTAssertEqual(state, .connected)
        await h.gate.unblock()
        for caller in callers { try await caller.value }
        try await frame.value
        try await unsubscribe.value
        try await reset.value
        try await reviewEventually {
            let methods = await h.recorder.allMethods()
            return methods.contains("channel/credit") && methods.contains("custom/window") &&
                methods.contains("tcp/reset") && methods.filter { $0 == "unsubscribe" }.count >= 2
        }
        await h.close()
    }

    func testCancelledAndTimedOutSubscribeCleanUpLateAcceptanceWithoutDisconnect() async throws {
        for cancel in [true, false] {
            let h = try await ReviewHarness.open(timeout: cancel ? .seconds(30) : .milliseconds(20))
            let uri = "ahp-terminal:/abandoned"
            let task = Task { try await h.client.subscribe(uri, options: .windowed()) }
            let request = try await h.request("subscribe")
            if cancel { task.cancel() }
            do { _ = try await task.value; XCTFail("abandoned subscribe succeeded") } catch {}
            let owner = await h.client.subscription(for: uri)
            XCTAssertNil(owner)
            let retained = await h.client._requestContextCount()
            XCTAssertEqual(retained, 1, "late negotiation metadata must survive local abandonment")
            let state = await h.client.connectionState
            XCTAssertEqual(state, .connected)
            try await h.accept(request)
            _ = try await h.recorder.take(["method": "unsubscribe", "params": ["channel": uri]])
            try await reviewEventually { await h.client._requestContextCount() == 0 }
            let after = await h.client.connectionState
            XCTAssertEqual(after, .connected)
            await h.close()
        }
    }

    func testCancelledResubscribeStillInstallsItsResponse() async throws {
        let h = try await ReviewHarness.open()
        let sub = try await h.subscribe("ahp-terminal:/existing")
        let update = Task { try await sub.update(options: .init()) }
        let request = try await h.request("subscribe")
        update.cancel()
        do { _ = try await update.value; XCTFail("expected cancellation") } catch is CancellationError {}
        try await h.respond(request, result: SubscribeResult(snapshot: ReviewHarness.snapshot(sub.channel)))
        try await reviewEventually { await sub.status().mode == "ordinary" }
        let current = await h.client.subscription(for: sub.channel)
        XCTAssertTrue(current === sub)
        let state = await h.client.connectionState
        XCTAssertEqual(state, .connected)
        await h.close()
    }

    func testLateReconnectResponseAfterTimeoutIsInstalled() async throws {
        let h = try await ReviewHarness.open(timeout: .milliseconds(20))
        let uri = "ahp-terminal:/resume"
        let limits = ReviewHarness.limits
        let reconnect = Task {
            try await h.client.reconnect(clientId: "client", lastSeenServerSeq: 1, subscriptions: [uri],
                windows: .init(items: [.init(channel: uri, flowControl: .init(receive: limits.clientReceive),
                                           lastAppliedServerSeq: 1)]))
        }
        let request = try await h.request("reconnect")
        do { _ = try await reconnect.value; XCTFail("expected timeout") } catch AHPClientError.requestTimeout {}
        try await h.respond(request, result: ReconnectReplayResult(type: .replay, actions: [], missing: [],
            windows: .init(items: [.init(channel: uri, flowControl: limits, recovery: .snapshot)])))
        try await h.sendSnapshot(uri)
        try await reviewEventually { await h.client._requestContextCount() == 0 }
        let optional = await h.client.subscription(for: uri)
        let sub = try XCTUnwrap(optional)
        let delivery = try await sub.next()
        XCTAssertEqual(delivery?.message.method, "channel/snapshot")
        let state = await h.client.connectionState
        XCTAssertEqual(state, .connected)
        await h.close()
    }

    func testUnsubscribeRacingSubscribeDoesNotResurrectAndOrderStaysBounded() async throws {
        let h = try await ReviewHarness.open()
        do {
            let uri = "ahp-terminal:/race"
            let first = Task { try await h.client.subscribe(uri, options: .windowed()) }
            let request = try await h.request("subscribe")
            try await h.client.unsubscribe(uri)
            _ = try await h.recorder.take(["method": "unsubscribe"])
            try await h.accept(request)
            _ = try await first.value
            _ = try await h.recorder.take(["method": "unsubscribe"])
            let old = await h.client.subscription(for: uri)
            XCTAssertNil(old)
            for _ in 0..<25 {
                let sub = try await h.subscribe(uri)
                let snapshot = try await corpusTimeout(timeout: ReviewHarness.waitTimeout) { try await sub.next() }
                XCTAssertEqual(snapshot?.message.method, "channel/snapshot")
                let count = await h.client._windowOrderCount()
                XCTAssertEqual(count, 1)
                try await sub.close()
                _ = try await h.recorder.take(["method": "unsubscribe"])
                let empty = await h.client._windowOrderCount()
                XCTAssertEqual(empty, 0)
            }
            let state = await h.client.connectionState
            XCTAssertEqual(state, .connected)
        } catch {
            await h.close()
            throw error
        }
        await h.close()
    }

    func testPendingResubscribeIgnoresPreviousSubscriptionsSnapshot() async throws {
        let h = try await ReviewHarness.open()
        do {
            let uri = "ahp-terminal:/late-snapshot"
            let first = Task { try await h.client.subscribe(uri, options: .windowed()) }
            let firstRequest = try await h.request("subscribe")
            try await h.accept(firstRequest)
            let previous = try await first.value
            try await previous.close()
            _ = try await h.recorder.take(["method": "unsubscribe"])

            let next = Task { try await h.client.subscribe(uri, options: .windowed(receive: .manual)) }
            let nextRequest = try await h.request("subscribe")
            // The old snapshot is queued before the next result, regardless of
            // which task the client executor runs first.
            try await h.sendSnapshot(uri)
            try await h.accept(nextRequest)
            let fresh = Snapshot(resource: uri, state: .empty(EmptyState()), fromSeq: 2)
            try await h.peer.send(makeNotificationWire(method: "channel/snapshot",
                params: ChannelSnapshotParams(channel: uri, snapshot: fresh)))
            let subscription = try await next.value
            let delivery = try await corpusTimeout(timeout: ReviewHarness.waitTimeout) {
                try await subscription.next()
            }
            if case .snapshot(let snapshot) = delivery?.payload {
                XCTAssertEqual(snapshot.fromSeq, 2)
            } else {
                XCTFail("the new generation's snapshot must be delivered first")
            }
            let status = await subscription.status()
            XCTAssertEqual(status.bufferedReceiveBytes, delivery?.receivedBytes)
            let state = await h.client.connectionState
            XCTAssertEqual(state, .connected)
        } catch {
            await h.close()
            throw error
        }
        await h.close()
    }

    func testAlreadyCancelledManagedSubscribeLeavesNoReplayRegistration() async throws {
        let host = WindowHost()
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "host", label: "Host", transportFactory: { _ in await host.open() })
            .withSessionSummaryRefreshOnConnect(false))
        try await reviewEventually { await multi.host("host")?.state.isConnected == true }
        let subscribe = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await multi.subscribe(host: "host", uri: "ahp-terminal:/cancelled", options: .windowed())
        }
        do { _ = try await subscribe.value; XCTFail("expected cancellation") } catch is CancellationError {}
        let state = await multi.host("host")
        XCTAssertFalse(state!.subscriptions.contains("ahp-terminal:/cancelled"))
        XCTAssertTrue(state!.state.isConnected)
        await multi.shutdown()
    }

    func testFailedFallbackResubscribeOnlyDropsThatChannel() async throws {
        let host = WindowHost()
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "host", label: "Host", transportFactory: { _ in await host.open() })
            .withSessionSummaryRefreshOnConnect(false).withReconnectPolicy(.immediateForever))
        try await reviewEventually { await multi.host("host")?.state.isConnected == true }
        let bad = try await multi.subscribe(host: "host", uri: "ahp-terminal:/bad", options: .windowed())
        let good = try await multi.subscribe(host: "host", uri: "ahp-terminal:/good", options: .windowed())
        _ = try await bad.next(); _ = try await good.next()
        let generation = await multi.host("host")!.generation
        await host.setFallback(failing: bad.channel)
        await host.disconnect()
        try await reviewEventually {
            guard let state = await multi.host("host") else { return false }
            return state.generation > generation && state.state.isConnected
        }
        do { _ = try await bad.next(); XCTFail("failed resubscribe must close its owner") } catch {}
        let state = await multi.host("host")
        XCTAssertFalse(state!.subscriptions.contains(bad.channel))
        XCTAssertTrue(state!.subscriptions.contains(good.channel))
        let snapshot = try await good.next()
        XCTAssertEqual(snapshot?.message.method, "channel/snapshot")
        await multi.shutdown()
    }

    func testShutdownDoesNotWaitForFallbackResubscribeTimeout() async throws {
        let host = WindowHost()
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "host", label: "Host", transportFactory: { _ in await host.open() })
            .withSessionSummaryRefreshOnConnect(false).withReconnectPolicy(.immediateForever))
        try await reviewEventually { await multi.host("host")?.state.isConnected == true }
        _ = try await multi.subscribe(host: "host", uri: "ahp-terminal:/held", options: .windowed())
        await host.setFallback(hold: true)
        await host.disconnect()
        try await reviewEventually { await host.subscribeCount() >= 2 }
        let start = ContinuousClock.now
        await multi.shutdown()
        XCTAssertLessThan(start.duration(to: .now), .seconds(2))
    }

    func testOrdinaryFireAndForgetWritesDrainAndEventStreamsFinish() async throws {
        let h = try await ReviewHarness.open()
        let events = await h.client.events
        let states = await h.client.stateChanges
        try await h.client.notify(method: "custom/data", params: ReviewData(channel: RootResourceURI, data: "notify"))
        _ = try await h.client.dispatch(.terminalInput(.init(type: .terminalInput, data: "dispatch")),
                                        channel: "ahp-terminal:/ordinary")
        try await h.client.unsubscribe("ahp-terminal:/ordinary")
        await h.client.shutdown()
        await h.reader.value
        let methods = await h.recorder.allMethods()
        XCTAssertEqual(methods, ["custom/data", "dispatchAction", "unsubscribe"])
        for await _ in events {}
        for await _ in states {}
    }
}

private struct ReviewData: Codable, Sendable { let channel: String; let data: String }

private struct ReviewHarness: Sendable {
    static let waitTimeout: Duration = .seconds(30)
    let client: AHPClient
    let peer: InMemoryTransport
    let gate: ReviewGate
    let recorder: CorpusRecorder
    let reader: Task<Void, Never>
    static let limits = ChannelFlowControl(
        clientReceive: .init(windowBytes: 65_536, maximumFrameBytes: 1024),
        hostReceive: .init(windowBytes: 65_536, maximumFrameBytes: 1024))

    static func open(timeout: Duration = .seconds(30)) async throws -> Self {
        let (transport, peer) = InMemoryTransport.pair()
        let gate = ReviewGate()
        let client = AHPClient(transport: ReviewTransport(base: transport, gate: gate),
                               config: .init(requestTimeout: timeout))
        let recorder = CorpusRecorder(timeout: waitTimeout)
        let reader = Task {
            while let message = try? await peer.recv() {
                if case .text(let text) = message { await recorder.append(text) }
            }
            await recorder.finish()
        }
        try await client.connect()
        return .init(client: client, peer: peer, gate: gate, recorder: recorder, reader: reader)
    }
    static func snapshot(_ channel: String) -> Snapshot {
        .init(resource: channel, state: .empty(EmptyState()), fromSeq: 1)
    }
    func request(_ method: String) async throws -> [String: Any] {
        let request = try await recorder.take(["method": method]).1
        _ = try await recorder.requestId(method)
        return request
    }
    func respond<R: Encodable>(_ request: [String: Any], result: R) async throws {
        try await peer.send(makeResponseWire(id: request["id"] as! Int, result: result))
    }
    func accept(_ request: [String: Any]) async throws {
        try await respond(request, result: SubscribeResult(flowControl: Self.limits))
    }
    func sendSnapshot(_ uri: String) async throws {
        try await peer.send(makeNotificationWire(method: "channel/snapshot",
            params: ChannelSnapshotParams(channel: uri, snapshot: Self.snapshot(uri))))
    }
    func subscribe(_ uri: String, receive: AHPReceiveMode = .auto) async throws -> AHPSubscription {
        let task = Task { try await client.subscribe(uri, options: .windowed(receive: receive)) }
        let request = try await request("subscribe")
        try await accept(request)
        try await sendSnapshot(uri)
        return try await task.value
    }
    func close() async {
        await gate.unblock()
        await client.shutdown()
        await reader.value
    }
}

private actor ReviewGate {
    var blocked = false
    var waiters: [CheckedContinuation<Void, Never>] = []
    func block() { blocked = true }
    func wait() async {
        if blocked { await withCheckedContinuation { waiters.append($0) } }
    }
    func unblock() {
        blocked = false
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume() }
    }
}

private final class ReviewTransport: AHPWindowingTransport, Sendable {
    let base: InMemoryTransport
    let gate: ReviewGate
    init(base: InMemoryTransport, gate: ReviewGate) { self.base = base; self.gate = gate }
    var windowingCapabilities: AHPTransportCapabilities {
        get async { .init(preservesOriginalJSONText: true) }
    }
    func recv() async throws -> TransportMessage? { try await base.recv() }
    func send(_ message: TransportMessage) async throws {
        await gate.wait()
        try await base.send(message)
    }
    func close() async throws { await gate.unblock(); try await base.close() }
}

private func reviewEventually(_ predicate: @escaping @Sendable () async -> Bool) async throws {
    let deadline = ContinuousClock.now + .seconds(2)
    while ContinuousClock.now < deadline {
        if await predicate() { return }
        try await Task.sleep(for: .milliseconds(2))
    }
    throw TransportError.protocol("review regression timed out")
}
