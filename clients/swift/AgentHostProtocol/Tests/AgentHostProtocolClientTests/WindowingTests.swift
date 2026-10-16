import Foundation
import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class WindowingTests: XCTestCase {
    func testModeChangeWaitsForStartedFragments() async throws {
        let host = WindowHost()
        await host.setHostLimits(window: 512, frame: 1024)
        let client = AHPClient(transport: await host.open())
        try await client.connect()
        let sub = try await client.subscribe("ahp-terminal:/t1", options: .windowed())
        let send = Task { try await sub.send(method: "custom/data",
            params: WindowData(channel: sub.channel, data: String(repeating: "x", count: 2000))) }
        try await windowEventually { await sub.status().outstandingSendBytes >= 512 }
        let update = Task { try await sub.update(options: .init()) }
        try await Task.sleep(for: .milliseconds(10))
        let before = await host.subscribeCount()
        XCTAssertEqual(before, 1, "mode-changing RPC must not abandon an unfinished message")
        let credits = Task {
            while !Task.isCancelled {
                try? await host.creditAll(sub.channel)
                try? await Task.sleep(for: .milliseconds(2))
            }
        }
        _ = try await update.value
        try await send.value
        credits.cancel()
        let status = await sub.status()
        XCTAssertEqual(status.mode, "ordinary")
        XCTAssertEqual(status.outstandingSendBytes, 0)
        await client.shutdown()
    }

    func testCoalescingDoesNotEquateBooleanAndNumberMetadata() async throws {
        let host = WindowHost()
        let client = AHPClient(transport: await host.open())
        try await client.connect()
        let sub = try await client.subscribe("ahp-chat:/c1", options: .windowed(receive: .manual))
        _ = try await sub.next()
        for (seq, value) in [(2, "1"), (3, "true")] {
            try await host.sendRaw("{\"jsonrpc\":\"2.0\",\"method\":\"action\",\"params\":{\"channel\":\"ahp-chat:/c1\",\"serverSeq\":\(seq),\"action\":{\"type\":\"chat/delta\",\"turnId\":\"t1\",\"partId\":\"p1\",\"content\":\"a\",\"_meta\":{\"value\":\(value)}}}}")
        }
        try await windowEventually { await sub.lastAppliedServerSeq == 3 }
        let a = try await windowNext(sub)
        let b = try await windowNext(sub)
        XCTAssertEqual(try a.message.decode(ActionEnvelope.self).serverSeq, 2)
        XCTAssertEqual(try b.message.decode(ActionEnvelope.self).serverSeq, 3)
        await client.shutdown()
    }

    func testRawHandshakeAndParsedEnvelopeUseOriginalText() async throws {
        let host = WindowHost()
        let client = AHPClient(transport: ParsedEnvelopeTransport(await host.open()))
        try await client.connect()
        let params = SubscribeParams(channel: "ahp-terminal:/raw",
            flowControl: .init(receive: .init(windowBytes: 4096, maximumFrameBytes: 1024)))
        _ = try await client.requestRaw(method: "subscribe", paramsData: JSONEncoder().encode(params))
        let owner = await client.subscription(for: params.channel)
        let sub = try XCTUnwrap(owner)
        var iterator = sub.events.makeAsyncIterator()
        _ = try await iterator.next()
        let raw = "{ \n \"jsonrpc\" : \"2.0\", \"method\" : \"action\", \"params\" : {\"channel\":\"ahp-terminal:/raw\",\"serverSeq\":2,\"action\":{\"type\":\"terminal/data\",\"data\":\"漢é😀\"}} }"
        try await host.sendRaw(raw)
        let item = try await iterator.next()
        XCTAssertEqual(item?.receivedBytes, ahpUTF16Bytes(raw))
        if case .event(.action(let envelope)) = item?.payload {
            XCTAssertEqual(envelope.serverSeq, 2)
        } else { XCTFail("original text should bypass lossy parsed transport payload") }
        var another = sub.events.makeAsyncIterator()
        do { _ = try await another.next(); XCTFail("multiple credit owners") }
        catch AHPWindowingError.consumerAlreadyWaiting {}
        await client.shutdown()
    }

    func testConcurrentSubscribeOffersRemainRequestScoped() async throws {
        let host = WindowHost()
        let client = AHPClient(transport: await host.open())
        try await client.connect()
        let first = Task { try await client.subscribe("ahp-terminal:/t1", options: .windowed(windowBytes: 4096)) }
        let second = Task { try await client.subscribe("ahp-terminal:/t1", options: .windowed(windowBytes: 2048)) }
        let a = try await first.value
        let b = try await second.value
        XCTAssertTrue(a === b)
        let state = await client.connectionState
        XCTAssertEqual(state, .connected)
        await client.shutdown()
    }

    func testCancellingCoalescedTCPSendAndEOFBarrier() async throws {
        let host = WindowHost()
        await host.setHostLimits(window: 1, frame: 1024)
        let client = AHPClient(transport: await host.open())
        try await client.connect()
        let sub = try await client.subscribe("ahp-tcp:/t1", options: .windowed())
        try await sub.send(method: "tcp/data", params: TcpDataParams(channel: sub.channel, data: "YQ=="))
        let first = Task { try await sub.send(method: "tcp/data", params: TcpDataParams(channel: sub.channel, data: "Yg==")) }
        try await windowEventually { await sub.status().bufferedSendBytes > 0 }
        let second = Task { try await sub.send(method: "tcp/data", params: TcpDataParams(channel: sub.channel, data: "Yw==")) }
        try await Task.sleep(for: .milliseconds(5))
        second.cancel()
        do { try await second.value; XCTFail("cancelled merged send succeeded") } catch is CancellationError {}
        try await host.creditAll(sub.channel)
        try await first.value
        let sent = await host.messages().filter { $0.method == "tcp/data" }
        XCTAssertEqual(try sent.last?.decode(TcpDataParams.self).data, "Yg==")
        try await host.creditAll(sub.channel)
        try await sub.send(method: "tcp/eof", params: TcpEofParams(channel: sub.channel))
        do {
            try await sub.send(method: "tcp/data", params: TcpDataParams(channel: sub.channel, data: "ZA=="))
            XCTFail("data after EOF")
        } catch is TransportError {}
        await client.shutdown()
    }

    func testBlockedManagedDispatchDoesNotBlockReconnectSupervisor() async throws {
        let host = WindowHost()
        await host.setHostLimits(window: 1, frame: 1024)
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "host", label: "Host", transportFactory: { _ in await host.open() })
            .withSessionSummaryRefreshOnConnect(false).withReconnectPolicy(.immediateForever))
        try await windowEventually { await multi.host("host")?.state.isConnected == true }
        let sub = try await multi.subscribe(host: "host", uri: "ahp-terminal:/t1", options: .windowed())
        _ = try await multi.dispatch(host: "host", action: .terminalInput(.init(type: .terminalInput, data: "a")),
                                     channel: sub.channel)
        let pending = Task { try await multi.dispatch(host: "host",
            action: .terminalInput(.init(type: .terminalInput, data: "b")), channel: sub.channel) }
        try await windowEventually { await sub.status().bufferedSendBytes > 0 }
        let generation = await multi.host("host")!.generation
        try await multi.reconnect("host")
        try await windowEventually {
            guard let state = await multi.host("host") else { return false }
            return state.state.isConnected && state.generation > generation
        }
        do { _ = try await pending.value; XCTFail("unsent data replayed automatically") } catch {}
        await multi.shutdown()
    }

    func testActualTransportDefaultsAndLegacyTransportFallback() async throws {
        let url = URLSessionWebSocketTransport(url: URL(string: "ws://127.0.0.1:1")!)
        let capabilities = await url.windowingCapabilities
        XCTAssertEqual(capabilities.maximumFrameBytes,
                       2 * (try XCTUnwrap(capabilities.maximumReceiveMessageUTF8Bytes) / 3))
        try await url.close()
        let native = NWConnectionWebSocketTransport(url: URL(string: "ws://127.0.0.1:1")!)
        let nativeCapabilities = await native.windowingCapabilities
        XCTAssertEqual(nativeCapabilities.maximumFrameBytes, 1_048_576)
        try await native.close()

        let host = WindowHost()
        let transport = await host.open()
        let client = AHPClient(transport: LegacyWindowTransport(transport))
        try await client.connect()
        let sub = try await client.subscribe("ahp-terminal:/t1", options: .windowed())
        let status = await sub.status()
        XCTAssertEqual(status.mode, "ordinary")
        XCTAssertEqual(status.fallbackReason, "transport")
        let first = try await sub.next()
        XCTAssertEqual(first?.message.method, "channel/snapshot")
        XCTAssertEqual(first?.receivedBytes, 0)
        await client.shutdown()
    }

    func testCustomCoalescerManualIdempotentCreditAndModeChanges() async throws {
        let custom = AHPCoalescer(method: "action") { earlier, later, context in
            guard context.direction == "inbound" else { return nil }
            var a = try earlier.decode(ActionEnvelope.self)
            let b = try later.decode(ActionEnvelope.self)
            guard case .terminalData(let x) = a.action, case .terminalData(let y) = b.action else { return nil }
            a.action = .terminalData(.init(type: .terminalData, data: (x.data + y.data).uppercased()))
            a.serverSeq = b.serverSeq
            return try .init(method: "action", params: a)
        }
        let host = WindowHost()
        let client = AHPClient(transport: await host.open(), config: .init(windowing: .init(coalescers: [custom])))
        try await client.connect()
        let sub = try await client.subscribe("ahp-terminal:/t1", options: .windowed(receive: .manual))
        let snapshot = try await windowNext(sub)
        try await host.action(sub.channel, data: "a", seq: 2)
        try await host.action(sub.channel, data: "b", seq: 3)
        try await windowEventually { await sub.lastAppliedServerSeq == 3 }
        let merged = try await windowNext(sub)
        if case .event(.action(let envelope)) = merged.payload,
           case .terminalData(let action) = envelope.action {
            XCTAssertEqual(action.data, "AB")
            XCTAssertEqual(envelope.serverSeq, 3)
        } else { XCTFail("expected merged typed action") }
        await merged.release(); await merged.release(); await snapshot.release()
        try await windowEventually { await sub.status().bufferedReceiveBytes == 0 }
        _ = try await sub.update(options: .init())
        let ordinary = await sub.status()
        XCTAssertEqual(ordinary.mode, "ordinary")
        let ordinarySnapshot = try await windowNext(sub)
        XCTAssertEqual(ordinarySnapshot.receivedBytes, 0)
        _ = try await sub.update(options: .windowed(receive: .manual))
        let newSnapshot = try await windowNext(sub)
        await newSnapshot.release()
        let status = await sub.status()
        XCTAssertEqual(status.mode, "windowed")
        XCTAssertEqual(status.bufferedReceiveBytes, 0)
        await client.shutdown()
    }

    func testBlockedChannelFairnessCancellationAndBackpressure() async throws {
        let host = WindowHost()
        await host.setHostLimits(window: 1, frame: 1024)
        let client = AHPClient(transport: await host.open(), config: .init(windowing: .init(
            maxBufferedSendBytes: 20_000)))
        try await client.connect()
        let a = try await client.subscribe("ahp-terminal:/a", options: .windowed())
        let b = try await client.subscribe("ahp-terminal:/b", options: .windowed())
        let large = Task { try await a.send(method: "custom/data", params: WindowData(
            channel: a.channel, data: String(repeating: "漢😀", count: 500))) }
        try await windowEventually { await a.status().outstandingSendBytes > 0 }
        try await b.send(method: "custom/data", params: WindowData(channel: b.channel, data: "other"))
        let messages = await host.messages()
        XCTAssertTrue(messages.contains { $0.channel == b.channel && $0.method == "custom/data" })
        let waiting = Task { try await b.send(method: "custom/data", params: WindowData(channel: b.channel, data: "cancel")) }
        try await windowEventually { await b.status().bufferedSendBytes > 0 }
        waiting.cancel()
        do { try await waiting.value; XCTFail("cancelled send succeeded") } catch is CancellationError {}
        try await windowEventually { await b.status().bufferedSendBytes == 0 }
        let head = Task { try await b.send(method: "custom/data", params: WindowData(channel: b.channel, data: "head")) }
        try await windowEventually { await b.status().bufferedSendBytes > 0 }
        do {
            try await b.send(method: "custom/data", params: WindowData(channel: b.channel,
                data: String(repeating: "x", count: 30_000)))
            XCTFail("unbounded queue admission")
        } catch AHPWindowingError.backpressure {}
        head.cancel()
        _ = try? await head.value
        let writable = Task { try await b.waitUntilWritable() }
        try await host.creditAll(b.channel)
        try await writable.value
        await client.shutdown()
        _ = try? await large.value
    }

    func testManagedReconnectSnapshotReplayLiveAndDropped() async throws {
        for recovery in ["snapshot", "replay", "live", "dropped"] {
            let host = WindowHost()
            await host.setRecovery(recovery)
            let config = HostConfig(id: "host", label: "Host", transportFactory: { _ in await host.open() })
                .withSessionSummaryRefreshOnConnect(false).withReconnectPolicy(.immediateForever)
            let multi = MultiHostClient()
            _ = try await multi.add(config)
            try await windowEventually { await multi.host("host")?.state.isConnected == true }
            let sub = try await multi.subscribe(host: "host", uri: "ahp-terminal:/t1",
                                                options: .windowed(receive: .manual))
            let initial = try await windowNext(sub)
            try await host.action(sub.channel, data: "retained", seq: 5)
            try await windowEventually { await sub.lastAppliedServerSeq == 5 }
            let before = await multi.host("host")!.generation
            await host.disconnect()
            try await windowEventually {
                guard let handle = await multi.host("host") else { return false }
                return handle.generation > before && handle.state.isConnected
            }
            let requests = await host.reconnectRequests()
            XCTAssertEqual(requests.last?.windows?.items.first?.lastAppliedServerSeq, 5)
            let retained = try await windowNext(sub)
            await initial.release(); await retained.release()
            try await Task.sleep(for: .milliseconds(15))
            let credits = await host.currentCredits()
            XCTAssertEqual(credits, 0, "old epoch must not credit new connection")
            if recovery == "dropped" {
                do { _ = try await sub.next(); XCTFail("missing window stayed open") }
                catch AHPWindowingError.subscriptionDropped {}
                let handle = await multi.host("host")
                XCTAssertFalse(handle!.subscriptions.contains(sub.channel))
            } else if recovery == "snapshot" {
                let replacement = try await windowNext(sub)
                XCTAssertEqual(replacement.message.method, "channel/snapshot")
                await replacement.release()
                try await windowEventually { await host.currentCredits() > 0 }
            } else {
                try await host.action(sub.channel, data: "new", seq: 6)
                let item = try await windowNext(sub)
                XCTAssertEqual(item.message.method, "action")
                await item.release()
                try await windowEventually { await host.currentCredits() > 0 }
            }
            await multi.shutdown()
        }
    }

    func testTCPIsNotResumedAndClosingOwnerRemovesManagedSubscription() async throws {
        let host = WindowHost()
        let multi = MultiHostClient()
        _ = try await multi.add(HostConfig(id: "host", label: "Host", transportFactory: { _ in await host.open() })
            .withSessionSummaryRefreshOnConnect(false).withReconnectPolicy(.immediateForever))
        try await windowEventually { await multi.host("host")?.state.isConnected == true }
        let tcp = try await multi.subscribe(host: "host", uri: "ahp-tcp:/t1", options: .windowed(receive: .manual))
        _ = try await tcp.next()
        let terminal = try await multi.subscribe(host: "host", uri: "ahp-terminal:/t1", options: .windowed())
        try await terminal.close()
        let before = await multi.host("host")!.generation
        await host.disconnect()
        try await windowEventually {
            guard let value = await multi.host("host") else { return false }
            return value.generation > before && value.state.isConnected
        }
        let request = await host.reconnectRequests().last
        XCTAssertFalse(request?.subscriptions.contains(tcp.channel) ?? false)
        XCTAssertFalse(request?.subscriptions.contains(terminal.channel) ?? false)
        do { _ = try await tcp.next(); XCTFail("TCP survived disconnect") } catch {}
        await multi.shutdown()
    }
}

private struct WindowData: Codable, Sendable { let channel: String; let data: String }
private final class LegacyWindowTransport: AHPTransport, Sendable {
    let base: InMemoryTransport
    init(_ base: InMemoryTransport) { self.base = base }
    func send(_ message: TransportMessage) async throws { try await base.send(message) }
    func recv() async throws -> TransportMessage? { try await base.recv() }
    func close() async throws { try await base.close() }
}

private final class ParsedEnvelopeTransport: AHPWindowingTransport, Sendable {
    let base: InMemoryTransport
    init(_ base: InMemoryTransport) { self.base = base }
    var windowingCapabilities: AHPTransportCapabilities {
        get async { .init(preservesOriginalJSONText: true) }
    }
    func send(_ message: TransportMessage) async throws { try await base.send(message) }
    func recv() async throws -> TransportMessage? { try await base.recv() }
    func close() async throws { try await base.close() }
    func recvWireMessage() async throws -> AHPWireMessage? {
        guard let message = try await base.recv(), case .text(let text) = message else { return nil }
        return .init(message: .parsed(try message.intoParsed()), originalJSONText: text)
    }
}

actor WindowHost {
    private var current: InMemoryTransport?
    private var connection = 0
    private var records: [(Int, AHPNotificationMessage, Int)] = []
    private var reconnects: [ReconnectParams] = []
    private var recovery = "replay"
    private var hostLimits = ChannelReceiveLimits(windowBytes: 65_536, maximumFrameBytes: 1024)
    private var subscriptions = 0
    private var failReconnect = false
    private var failedResubscribe: String?
    private var holdResubscribe = false

    func setRecovery(_ value: String) { recovery = value }
    func setFallback(failing channel: String? = nil, hold: Bool = false) {
        failReconnect = true
        failedResubscribe = channel
        holdResubscribe = hold
    }
    func setHostLimits(window: Int, frame: Int) { hostLimits = .init(windowBytes: window, maximumFrameBytes: frame) }
    func open() -> InMemoryTransport {
        let (client, host) = InMemoryTransport.pair()
        connection += 1
        let number = connection
        current = host
        Task { await self.drive(host, number: number) }
        return client
    }
    func disconnect() async { try? await current?.close() }
    func sendRaw(_ text: String) async throws { try await current!.send(.text(text)) }
    func messages() -> [AHPNotificationMessage] { records.map { $0.1 } }
    func reconnectRequests() -> [ReconnectParams] { reconnects }
    func subscribeCount() -> Int { subscriptions }
    func currentCredits() -> Int {
        records.filter { $0.0 == connection && $0.1.method == "channel/credit" }.count
    }
    func action(_ channel: String, data: String, seq: Int) async throws {
        let params = ActionEnvelope(channel: channel, action: .terminalData(.init(type: .terminalData, data: data)),
                                    serverSeq: seq)
        try await current!.send(makeNotificationWire(method: "action", params: params))
    }
    func creditAll(_ channel: String) async throws {
        let size = records.filter { $0.0 == connection && $0.1.channel == channel &&
            countsAgainstWindow($0.1.method) }.reduce(0) { $0 + $1.2 }
        try await current!.send(makeNotificationWire(method: "channel/credit",
            params: ChannelCreditParams(channel: channel, consumedBytes: size)))
    }
    private func snapshot(_ channel: String, transport: InMemoryTransport) async throws {
        let snapshot = Snapshot(resource: channel, state: .empty(EmptyState()), fromSeq: 1)
        try await transport.send(makeNotificationWire(method: "channel/snapshot",
            params: ChannelSnapshotParams(channel: channel, snapshot: snapshot)))
    }
    private func drive(_ transport: InMemoryTransport, number: Int) async {
        while let frame = try? await transport.recv() {
            guard case .text(let text) = frame,
                  let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                  let method = object["method"] as? String,
                  let params = object["params"] as? [String: Any],
                  let bytes = try? JSONSerialization.data(withJSONObject: params) else { continue }
            if let id = object["id"] as? Int {
                do {
                    switch method {
                    case "initialize":
                        let result = InitializeResult(protocolVersion: "1.0.0", serverSeq: 1, snapshots: [
                            Snapshot(resource: RootResourceURI, state: .root(RootState(agents: [])), fromSeq: 1)])
                        try await transport.send(makeResponseWire(id: id, result: result))
                    case "subscribe":
                        subscriptions += 1
                        let request = try JSONDecoder().decode(SubscribeParams.self, from: bytes)
                        if number > 1, holdResubscribe { continue }
                        if number > 1, request.channel == failedResubscribe {
                            try await transport.send(.encoded(.errorResponse(id: id,
                                error: JsonRpcError(code: -32000, message: "subscription unavailable"))))
                            continue
                        }
                        if let offer = request.flowControl?.receive {
                            let limits = ChannelFlowControl(clientReceive: offer, hostReceive: hostLimits)
                            try await transport.send(makeResponseWire(id: id, result: SubscribeResult(flowControl: limits)))
                            try await snapshot(request.channel, transport: transport)
                        } else {
                            try await transport.send(makeResponseWire(id: id, result: SubscribeResult(
                                snapshot: Snapshot(resource: request.channel, state: .empty(EmptyState()), fromSeq: 1))))
                        }
                    case "reconnect":
                        let request = try JSONDecoder().decode(ReconnectParams.self, from: bytes)
                        reconnects.append(request)
                        if failReconnect {
                            try await transport.send(.encoded(.errorResponse(id: id,
                                error: JsonRpcError(code: -32601, message: "reconnect unsupported"))))
                            continue
                        }
                        let items = recovery == "dropped" ? [] : (request.windows?.items ?? []).map {
                            ResumedChannelSubscription(channel: $0.channel,
                                flowControl: .init(clientReceive: $0.flowControl.receive, hostReceive: hostLimits),
                                recovery: recovery == "snapshot" ? .snapshot : recovery == "live" ? .live : .replay)
                        }
                        // A top-level snapshot response must not prune kept windowed channels.
                        try await transport.send(makeResponseWire(id: id, result: ReconnectSnapshotResult(
                            type: .snapshot, snapshots: [
                                Snapshot(resource: RootResourceURI, state: .root(RootState(agents: [])), fromSeq: 1)],
                            windows: request.windows == nil ? nil : .init(items: items))))
                        if recovery == "snapshot" {
                            for item in items { try await snapshot(item.channel, transport: transport) }
                        }
                    default: break
                    }
                } catch { return }
            } else if let notification = try? AHPNotificationMessage(method: method, paramsJSON: bytes) {
                records.append((number, notification, ahpUTF16Bytes(text)))
            }
        }
    }
}

private func windowEventually(_ predicate: @escaping @Sendable () async -> Bool) async throws {
    let deadline = ContinuousClock.now + .seconds(2)
    while ContinuousClock.now < deadline {
        if await predicate() { return }
        try await Task.sleep(for: .milliseconds(2))
    }

    throw TransportError.protocol("test condition timed out")
}

private func windowNext(_ subscription: AHPSubscription) async throws -> AHPDelivery {
    let value = try await subscription.next()
    return try XCTUnwrap(value)
}
