// AHPClientTests — request/response, subscription fan-out, events tap,
// unsubscribe, and shutdown behaviour for `AHPClient`.

import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class AHPClientTests: XCTestCase {

    private func tcpCreation() -> TcpConnectionSubscription {
        TcpConnectionSubscription(type: "tcpConnection", host: "localhost", port: 3000, encoding: .base64, receiveWindowBytes: 4, maximumChunkSize: 2)
    }

    private func tcpSnapshot(_ resource: String = "ahp-tcp:/created") -> Snapshot {
        let direction = FlowControlledByteDirectionState(windowBytes: 4, maximumChunkSize: 2, receivedBytes: 0, consumedBytes: 0)
        return Snapshot(resource: resource, state: .tcp(TcpConnectionState(
            session: "ahp-session:/s1", target: TcpTarget(host: "localhost", port: 3000), encoding: .base64,
            input: direction, output: direction, clientClosed: false, hostClosed: false
        )), fromSeq: 0)
    }

    private func openTcpHost() async throws -> (MultiHostClient, AsyncStream<InMemoryTransport>, InMemoryTransport, TcpConnection) {
        let servers = AsyncStream<InMemoryTransport>.makeStream()
        let multi = MultiHostClient()
        let config = HostConfig(id: "tcp", label: "TCP", transportFactory: { _ in
            let (side, server) = InMemoryTransport.pair()
            servers.continuation.yield(server)
            return side
        }).withClientId("owner").withReconnectPolicy(.immediateForever).withSessionSummaryRefreshOnConnect(false)
        _ = try await multi.add(config)
        var iterator = servers.stream.makeAsyncIterator()
        let initialServer = try await nextWithTimeout(&iterator)
        let initial = try XCTUnwrap(initialServer)
        let request = try await readRequest(from: initial, expectedMethod: "initialize")
        try await respond(to: request.id, with: InitializeResult(
            protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0], serverSeq: 0, snapshots: [],
            tcpConnections: TcpConnectionsCapability(encodings: [.base64])
        ), on: initial)
        await waitUntil { await multi.host("tcp")?.state.isConnected == true }
        let current = await multi.client(for: "tcp")
        let handle = try XCTUnwrap(current)
        let open = Task { try await handle.openTcpConnection(session: "ahp-session:/s1", create: tcpCreation()) }
        let create = try await readRequest(from: initial, expectedMethod: "subscribe")
        try await respond(to: create.id, with: SubscribeResult(snapshot: tcpSnapshot()), on: initial)
        return (multi, servers.stream, initial, try await open.value)
    }

    func testTcpHostReconnectRetainsStreamCreditPayloadAndGlobalSequence() async throws {
        for spontaneous in [false, true] {
        let (multi, servers, oldServer, connection) = try await openTcpHost()
        defer { Task { await multi.shutdown() } }
        let current = await multi.client(for: "tcp")
        let handle = try XCTUnwrap(current)
        let write = Task { try await connection.write(Data([1, 2, 3, 4, 5, 6])) }
        let first = try await readDispatchNotification(from: oldServer)
        let second = try await readDispatchNotification(from: oldServer)
        try await tcpPush(oldServer, 1, .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")))
        try await tcpPush(oldServer, 2, first.action, origin: ActionOrigin(clientId: "owner", clientSeq: first.clientSeq))
        _ = try await handle.dispatch(.sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "ordinary")),
                                      channel: "ahp-session:/s1", clientSeq: 1000)
        let ordinary = try await readDispatchNotification(from: oldServer)
        XCTAssertEqual(ordinary.clientSeq, 1000)
        await waitUntil { await connection.appliedCheckpoint == 2 }
        try await pushNotification(method: "action", params: ActionEnvelope(channel: RootResourceURI,
            action: .rootActiveSessionsChanged(RootActiveSessionsChangedAction(type: .rootActiveSessionsChanged, activeSessions: 1)), serverSeq: 50), on: oldServer)
        await waitUntil { await multi.host("tcp")?.serverSeq == 50 }
        if spontaneous { try await oldServer.close() }
        else { try await multi.reconnect("tcp") }
        var iterator = servers.makeAsyncIterator()
        let nextServer = try await nextWithTimeout(&iterator)
        let server = try XCTUnwrap(nextServer)
        let request = try await readRequest(from: server, expectedMethod: "reconnect")
        let params = try JSONDecoder().decode(ReconnectParams.self, from: JSONEncoder().encode(request.params))
        XCTAssertEqual(params.clientId, "owner")
        XCTAssertEqual(params.lastSeenServerSeq, 2)
        XCTAssertTrue(params.subscriptions.contains(connection.resource))
        try await respond(to: request.id, with: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [
            ActionEnvelope(channel: connection.resource, action: .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: 2)), serverSeq: 3),
            ActionEnvelope(channel: connection.resource, action: .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")), serverSeq: 4),
            ActionEnvelope(channel: RootResourceURI, action: .rootActiveSessionsChanged(RootActiveSessionsChangedAction(type: .rootActiveSessionsChanged, activeSessions: 999)), serverSeq: 5),
        ], missing: [])), on: server)
        let resent = try await readDispatchNotification(from: server)
        XCTAssertEqual(resent.clientSeq, second.clientSeq)
        XCTAssertTrue(TcpProtocol.matchesEcho(resent.action, second.action))
        let tail = try await readDispatchNotification(from: server)
        guard case .tcpInput(let input) = tail.action else { return XCTFail("missing resumed write") }
        XCTAssertEqual(input.offset, 4)
        XCTAssertGreaterThan(tail.clientSeq, 1000)
        try await write.value
        await waitUntil { await multi.host("tcp")?.generation != handle.generation }
        let host = await multi.host("tcp")
        XCTAssertEqual(host?.activeSessions, 1)
        do { try await handle.checkAlive(); XCTFail("old handle remained valid") } catch is HostError { }
        let bytes = try await connection.read()
        XCTAssertEqual(bytes, Data([7, 8]))
        let credit = try await readDispatchNotification(from: server)
        guard case .tcpDataConsumed = credit.action else { return XCTFail("missing receive credit") }
        let freshHandle = await multi.client(for: "tcp")
        let fresh = try XCTUnwrap(freshHandle)
        let open = Task { try await fresh.openTcpConnection(session: "ahp-session:/s1", create: tcpCreation()) }
        let create = try await readRequest(from: server, expectedMethod: "subscribe")
        try await respond(to: create.id, with: SubscribeResult(snapshot: tcpSnapshot("ahp-tcp:/second")), on: server)
        let additional = try await open.value
        try await additional.dispose()
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        let read = Task { try await connection.read() }
        let remove = Task { try await multi.remove("tcp") }
        let unsubscribe = try await readNotification(from: server, expectedMethod: "unsubscribe")
        let channel = try JSONDecoder().decode(UnsubscribeParams.self, from: JSONEncoder().encode(unsubscribe)).channel
        XCTAssertEqual(channel, connection.resource)
        try await remove.value
        do { _ = try await read.value; XCTFail("removed stream remained readable or duplicate data was enqueued") } catch { }
        await multi.shutdown()
        }
    }

    func testTcpHostReconnectFallbackFailsStreamsClosed() async throws {
        for mode in ["snapshot", "missing", "initialize"] {
            let (multi, servers, _, connection) = try await openTcpHost()
            let generation = await multi.host("tcp")!.generation
            let read = Task { try await connection.read() }
            try await multi.reconnect("tcp")
            var iterator = servers.makeAsyncIterator()
            let nextServer = try await nextWithTimeout(&iterator)
            let server = try XCTUnwrap(nextServer)
            let request = try await readRequest(from: server, expectedMethod: "reconnect")
            if mode == "initialize" {
                try await server.send(.text("""
                {"jsonrpc":"2.0","id":\(request.id),"error":{"code":-32601,"message":"reconnect unavailable"}}
                """))
            } else {
                let result: ReconnectResult = mode == "snapshot"
                    ? .snapshot(ReconnectSnapshotResult(type: .snapshot, snapshots: [tcpSnapshot()]))
                    : .replay(ReconnectReplayResult(type: .replay, actions: [], missing: [connection.resource]))
                try await respond(to: request.id, with: result, on: server)
            }
            _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
            if mode == "initialize" {
                let initialize = try await readRequest(from: server, expectedMethod: "initialize")
                let params = try JSONDecoder().decode(InitializeParams.self, from: JSONEncoder().encode(initialize.params))
                XCTAssertFalse(try XCTUnwrap(params.initialSubscriptions).contains(connection.resource))
                try await respond(to: initialize.id, with: InitializeResult(protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0], serverSeq: 0, snapshots: []), on: server)
            }
            await waitUntil { await multi.host("tcp")?.generation != generation }
            do { _ = try await read.value; XCTFail("fallback restored a TCP stream") } catch { }
            try await connection.dispose()
            await multi.shutdown()
        }
    }

    func testTcpHostShutdownTerminatesBlockedOperationsAndPendingCreation() async throws {
        let (multi, _, server, connection) = try await openTcpHost()
        let write = Task { try await connection.write(Data(repeating: 0, count: 6)) }
        _ = try await readDispatchNotification(from: server)
        _ = try await readDispatchNotification(from: server)
        let read = Task { try await connection.read() }
        let drain = Task { try await connection.drain() }
        let handle = await multi.client(for: "tcp")
        let creation = Task { try await XCTUnwrap(handle).openTcpConnection(session: "ahp-session:/s1", create: tcpCreation()) }
        _ = try await readRequest(from: server, expectedMethod: "subscribe")
        let shutdown = Task { await multi.shutdown() }
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        await shutdown.value
        do { _ = try await creation.value; XCTFail("shutdown left creation active") } catch is CancellationError { }
        do { _ = try await read.value; XCTFail("shutdown left read active") } catch { }
        do { try await write.value; XCTFail("shutdown left write active") } catch { }
        do { try await drain.value; XCTFail("shutdown left drain active") } catch { }
    }

    func testTcpHostShutdownDuringReconnectTerminatesRetainedStream() async throws {
        let (multi, servers, oldServer, connection) = try await openTcpHost()
        let read = Task { try await connection.read() }
        try await oldServer.close()
        var iterator = servers.makeAsyncIterator()
        let nextServer = try await nextWithTimeout(&iterator)
        let server = try XCTUnwrap(nextServer)
        _ = try await readRequest(from: server, expectedMethod: "reconnect")
        let finished = expectation(description: "shutdown cancels outstanding reconnect")
        let shutdown = Task {
            await multi.shutdown()
            finished.fulfill()
        }
        await fulfillment(of: [finished], timeout: 2)
        await shutdown.value
        do { _ = try await read.value; XCTFail("shutdown left retained read active") } catch { }
    }

    private func openTcp(_ client: AHPClient, _ server: InMemoryTransport, firstAction: Bool = false, invalidSnapshot: Bool = false, maximumChunkSize: Int = 2) async throws -> TcpConnection {
        try await client.connect()
        let initialize = Task { try await client.initialize(clientId: "owner", protocolVersions: ["test"]) }
        let initialization = try await readRequest(from: server, expectedMethod: "initialize")
        try await respond(to: initialization.id, with: InitializeResult(
            protocolVersion: "test", serverSeq: 0, snapshots: [],
            tcpConnections: TcpConnectionsCapability(encodings: [.base64])
        ), on: server)
        _ = try await initialize.value
        let open = Task { try await client.openTcpConnection(session: "ahp-session:/s1", create: TcpConnectionSubscription(
            type: "tcpConnection", host: "localhost", port: 3000, encoding: .base64, receiveWindowBytes: max(4, maximumChunkSize), maximumChunkSize: maximumChunkSize
        )) }
        let request = try await readRequest(from: server, expectedMethod: "subscribe")
        let direction = FlowControlledByteDirectionState(windowBytes: max(4, maximumChunkSize), maximumChunkSize: maximumChunkSize, receivedBytes: invalidSnapshot ? 1 : 0, consumedBytes: 0)
        try await respond(to: request.id, with: SubscribeResult(snapshot: Snapshot(
            resource: "ahp-tcp:/created", state: .tcp(TcpConnectionState(
                session: "ahp-session:/s1", target: TcpTarget(host: "localhost", port: 3000), encoding: .base64,
                input: direction, output: direction, clientClosed: false, hostClosed: false
            )), fromSeq: 0
        )), on: server)
        if firstAction { try await tcpPush(server, 1, .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg="))) }
        return try await open.value
    }

    private func tcpPush(_ server: InMemoryTransport, _ sequence: Int, _ action: StateAction, origin: ActionOrigin? = nil, rejectionReason: String? = nil, channel: String = "ahp-tcp:/created") async throws {
        try await pushNotification(method: "action", params: ActionEnvelope(channel: channel, action: action, serverSeq: sequence, origin: origin, rejectionReason: rejectionReason), on: server)
    }

    private func tcpUnrelatedBurst(_ client: AHPClient, _ server: InMemoryTransport, _ firstSequence: Int) async throws {
        let barrier = await client.attachSubscription("ahp-session:/barrier")
        var iterator = barrier.makeAsyncIterator()
        for i in 0..<16 {
            try await tcpPush(server, firstSequence + i * 2, .sessionTitleChanged(SessionTitleChangedAction(
                type: .sessionTitleChanged, title: "busy"
            )), channel: "ahp-session:/other")
            try await tcpPush(server, firstSequence + i * 2 + 1, .tcpData(TcpDataAction(
                type: .tcpData, offset: i, data: "AA=="
            )), channel: "ahp-tcp:/other")
        }
        try await tcpPush(server, firstSequence + 32, .sessionTitleChanged(SessionTitleChangedAction(
            type: .sessionTitleChanged, title: "barrier"
        )), channel: "ahp-session:/barrier")
        _ = try await nextWithTimeout(&iterator)
    }

    func testTcpScopedCreationAndActiveTraffic() async throws {
        let (side, server) = InMemoryTransport.pair()
        let client = AHPClient(transport: side, config: AHPClientConfig(subscriptionBufferSize: 2))
        try await client.connect()
        let initialize = Task { try await client.initialize(clientId: "owner", protocolVersions: ["test"]) }
        let initialization = try await readRequest(from: server, expectedMethod: "initialize")
        try await respond(to: initialization.id, with: InitializeResult(
            protocolVersion: "test", serverSeq: 0, snapshots: [],
            tcpConnections: TcpConnectionsCapability(encodings: [.base64])
        ), on: server)
        _ = try await initialize.value
        let opening = Task { try await client.openTcpConnection(session: "ahp-session:/s1", create: tcpCreation()) }
        let request = try await readRequest(from: server, expectedMethod: "subscribe")
        try await tcpUnrelatedBurst(client, server, 1)
        var initial = tcpSnapshot()
        initial.fromSeq = 33
        try await respond(to: request.id, with: SubscribeResult(snapshot: initial), on: server)
        try await tcpPush(server, 34, .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bw==")))
        let connection = try await opening.value
        try await tcpUnrelatedBurst(client, server, 35)
        let first = try await connection.read()
        XCTAssertEqual(first, Data([7]))
        _ = try await readDispatchNotification(from: server)
        try await tcpPush(server, 68, .tcpData(TcpDataAction(type: .tcpData, offset: 1, data: "CA==")))
        let second = try await connection.read()
        XCTAssertEqual(second, Data([8]))
        _ = try await readDispatchNotification(from: server)
        try await closeTcp(connection, server)
        let count = await client._strictEventListenerCount()
        XCTAssertEqual(count, 0)
        await client.shutdown()
    }

    func testTcpScopedReconnectIsolatesTrafficAndReportsOwnedOverflow() async throws {
        for overflow in [false, true] {
            let (oldSide, oldServer) = InMemoryTransport.pair()
            let old = AHPClient(transport: oldSide)
            let connection = try await openTcp(old, oldServer)
            await old.shutdown(preservingTcpConnections: true)
            let (side, server) = InMemoryTransport.pair()
            let fresh = AHPClient(transport: side, config: AHPClientConfig(subscriptionBufferSize: 2))
            try await fresh.connect()
            let reconnect = Task { try await fresh.reconnectTcpConnections(params: ReconnectParams(
                channel: RootResourceURI, clientId: "owner", lastSeenServerSeq: 0, subscriptions: []
            ), connections: [connection]) }
            let request = try await readRequest(from: server, expectedMethod: "reconnect")
            try await tcpUnrelatedBurst(fresh, server, 2)
            if overflow {
                for i in 0..<3 {
                    try await tcpPush(server, 35 + i, .tcpData(TcpDataAction(type: .tcpData, offset: i, data: "AA==")))
                }
                try await tcpUnrelatedBurst(fresh, server, 38)
            }
            let actions = overflow ? [] : [
                ActionEnvelope(channel: connection.resource, action: .tcpData(TcpDataAction(
                    type: .tcpData, offset: 0, data: "Bw=="
                )), serverSeq: 1),
            ]
            try await respond(to: request.id, with: ReconnectResult.replay(ReconnectReplayResult(
                type: .replay, actions: actions, missing: []
            )), on: server)
            if !overflow {
                try await tcpPush(server, 35, .tcpData(TcpDataAction(type: .tcpData, offset: 1, data: "CA==")))
            }
            _ = try await reconnect.value
            if overflow {
                let reset = try await readDispatchNotification(from: server)
                guard case .tcpClientReset = reset.action else { return XCTFail("missing overflow reset") }
                _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
                do { _ = try await connection.read(); XCTFail("owned overflow was ignored") }
                catch { XCTAssertTrue(error is SubscriptionLagError) }
            } else {
                try await tcpUnrelatedBurst(fresh, server, 36)
                let first = try await connection.read()
                let second = try await connection.read()
                XCTAssertEqual(first, Data([7]))
                XCTAssertEqual(second, Data([8]))
                _ = try await readDispatchNotification(from: server)
                _ = try await readDispatchNotification(from: server)
                try await closeTcp(connection, server)
            }
            let count = await fresh._strictEventListenerCount()
            XCTAssertEqual(count, 0)
            await fresh.shutdown()
        }
    }

    private func closeTcp(_ connection: TcpConnection, _ server: InMemoryTransport) async throws {
        let close = Task { try await connection.close() }
        let dispatch = try await readDispatchNotification(from: server)
        guard case .tcpClientClose = dispatch.action else { return XCTFail("missing client close") }
        try await close.value
        try await connection.dispose()
        let unsubscribe = try await readNotification(from: server, expectedMethod: "unsubscribe")
        let params = try JSONDecoder().decode(UnsubscribeParams.self, from: JSONEncoder().encode(unsubscribe))
        XCTAssertEqual(params.channel, connection.resource)
    }

    func testTcpAdapterRejectsStaleCreationAndDetachesCancelledSetup() async throws {
        let (side, server) = InMemoryTransport.pair()
        let client = AHPClient(transport: side)
        do { _ = try await openTcp(client, server, invalidSnapshot: true); XCTFail("stale TCP snapshot accepted") } catch { }
        let unsubscribed = try await readNotification(from: server, expectedMethod: "unsubscribe")
        let params = try JSONDecoder().decode(UnsubscribeParams.self, from: JSONEncoder().encode(unsubscribed))
        XCTAssertEqual(params.channel, "ahp-tcp:/created")
        let count = await client._strictEventListenerCount()
        XCTAssertEqual(count, 0)
        let open = Task { try await client.openTcpConnection(session: "ahp-session:/s1", create: TcpConnectionSubscription(
            type: "tcpConnection", host: "localhost", port: 3000, encoding: .base64, receiveWindowBytes: 4, maximumChunkSize: 2
        )) }
        _ = try await readRequest(from: server, expectedMethod: "subscribe")
        open.cancel()
        do { _ = try await open.value; XCTFail("cancelled TCP setup succeeded") } catch { }
        let afterCancellation = await client._strictEventListenerCount()
        XCTAssertEqual(afterCancellation, 0)
        await client.shutdown()
    }

    func testTcpCreationRequiresCanonicalDiscriminator() throws {
        let create = TcpConnectionSubscription(type: "tcpConnection", host: "localhost", port: 3000,
            encoding: .base64, receiveWindowBytes: 4, maximumChunkSize: 2)
        let capability = TcpConnectionsCapability(encodings: [.base64])
        try TcpProtocol.validate("ahp-session:/s1", create, capability)
        let wire = try JSONSerialization.jsonObject(with: JSONEncoder().encode(
            SubscribeParams(channel: "ahp-session:/s1", create: create))) as? [String: Any]
        XCTAssertEqual((wire?["create"] as? [String: Any])?["type"] as? String, "tcpConnection")
        let invalid = TcpConnectionSubscription(type: "tcp", host: "localhost", port: 3000,
            encoding: .base64, receiveWindowBytes: 4, maximumChunkSize: 2)
        XCTAssertThrowsError(try TcpProtocol.validate("ahp-session:/s1", invalid, capability))
    }

    func testTcpLocalCloseRetainsCrossingTrafficUntilBothDirectionsDrain() async throws {
        let (side, server) = InMemoryTransport.pair()
        let client = AHPClient(transport: side)
        let connection = try await openTcp(client, server)
        try await connection.write(Data([1, 2]))
        let input = try await readDispatchNotification(from: server)
        let drain = Task { try await connection.drain() }
        try await connection.close()
        let close = try await readDispatchNotification(from: server)
        guard case .tcpClientClose = close.action else { return XCTFail("missing close") }
        let closed = await connection.isClosed
        let listeners = await client._strictEventListenerCount()
        XCTAssertFalse(closed)
        XCTAssertEqual(listeners, 1)
        if closed { await client.shutdown(); return }
        let read = Task { try await connection.read() }
        try await tcpPush(server, 1, input.action, origin: ActionOrigin(clientId: "owner", clientSeq: input.clientSeq))
        try await tcpPush(server, 2, close.action, origin: ActionOrigin(clientId: "owner", clientSeq: close.clientSeq))
        try await tcpPush(server, 3, .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")))
        let bytes = try await read.value
        XCTAssertEqual(bytes, Data([7, 8]))
        let credit = try await readDispatchNotification(from: server)
        guard case .tcpDataConsumed(let consumed) = credit.action else { return XCTFail("missing output credit") }
        XCTAssertEqual(consumed.consumedBytes, 2)
        try await connection.accept(ActionEnvelope(channel: connection.resource,
            action: .tcpHostClose(TcpHostCloseAction(type: .tcpHostClose)), serverSeq: 4))
        let beforeCredit = await connection.isClosed
        XCTAssertFalse(beforeCredit)
        try await connection.accept(ActionEnvelope(channel: connection.resource, action: credit.action, serverSeq: 5,
            origin: ActionOrigin(clientId: "owner", clientSeq: credit.clientSeq)))
        let beforeDrain = await connection.isClosed
        XCTAssertFalse(beforeDrain)
        try await tcpPush(server, 6, .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: 2)))
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        try await drain.value
        let eof = try await connection.read()
        XCTAssertNil(eof)
        let remaining = await client._strictEventListenerCount()
        XCTAssertEqual(remaining, 0)
        try await connection.close()
        try await connection.dispose()
        await client.shutdown()
    }

    func testTcpCreationAndSnapshotLimitsUseUInt32Range() throws {
        let capability = TcpConnectionsCapability(encodings: [.base64])
        for limit in [1, 4294967295, 0, -1, 4294967296, 9007199254740991] {
            let valid = (1...4294967295).contains(limit)
            for chunk in [false, true] {
                var create = tcpCreation()
                create.receiveWindowBytes = limit
                create.maximumChunkSize = chunk ? limit : 1
                if valid { try TcpProtocol.validate("ahp-session:/s1", create, capability) }
                else { XCTAssertThrowsError(try TcpProtocol.validate("ahp-session:/s1", create, capability), "creation \(limit)") }
                var request = tcpCreation()
                request.receiveWindowBytes = 4294967295
                request.maximumChunkSize = 4294967295
                for input in [false, true] {
                    var snapshot = tcpSnapshot()
                    guard case .tcp(var state) = snapshot.state else { return XCTFail("missing TCP state") }
                    let direction = FlowControlledByteDirectionState(windowBytes: limit, maximumChunkSize: chunk ? limit : 1, receivedBytes: 0, consumedBytes: 0)
                    if input { state.input = direction } else { state.output = direction }
                    snapshot.state = .tcp(state)
                    if valid { _ = try TcpProtocol.validate("ahp-session:/s1", request, snapshot) }
                    else { XCTAssertThrowsError(try TcpProtocol.validate("ahp-session:/s1", request, snapshot), "snapshot \(limit), input \(input)") }
                }
            }
        }
    }

    func testTcpSingleClientReconnectFiltersReturnedReplayAtCallerCheckpoint() async throws {
        let (oldSide, oldServer) = InMemoryTransport.pair()
        let old = AHPClient(transport: oldSide)
        let connection = try await openTcp(old, oldServer)
        try await connection.accept(ActionEnvelope(channel: connection.resource,
            action: .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: 0)), serverSeq: 10))
        await old.shutdown(preservingTcpConnections: true)
        let (side, server) = InMemoryTransport.pair()
        let fresh = AHPClient(transport: side)
        try await fresh.connect()
        let parameters = ReconnectParams(channel: RootResourceURI, clientId: "owner",
            lastSeenServerSeq: 100, subscriptions: ["ahp-session:/s1"])
        let reconnect = Task { try await fresh.reconnectTcpConnections(params: parameters, connections: [connection]) }
        let request = try await readRequest(from: server, expectedMethod: "reconnect")
        let wire = try JSONDecoder().decode(ReconnectParams.self, from: JSONEncoder().encode(request.params))
        XCTAssertEqual(wire.lastSeenServerSeq, 10)
        var actions = (11...101).map { sequence in
            ActionEnvelope(channel: sequence == 50 ? connection.resource : "ahp-session:/s1",
                action: sequence == 50
                    ? .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg="))
                    : .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "title-\(sequence)")),
                serverSeq: sequence)
        }
        actions.append(ActionEnvelope(channel: connection.resource,
            action: .tcpDataEof(TcpDataEofAction(type: .tcpDataEof, finalOffset: 2)), serverSeq: 102))
        try await respond(to: request.id, with: ReconnectResult.replay(ReconnectReplayResult(
            type: .replay, actions: actions, missing: ["ahp-session:/missing"])), on: server)
        guard case .replay(let returned) = try await reconnect.value else { return XCTFail("missing replay") }
        let checkpoint = await connection.appliedCheckpoint
        let state = await connection.state
        XCTAssertEqual(checkpoint, 102)
        XCTAssertEqual(state.output.receivedBytes, 2)
        XCTAssertEqual(state.output.eofAtBytes, 2)
        let bytes = try await connection.read()
        XCTAssertEqual(bytes, Data([7, 8]))
        let credit = try await readDispatchNotification(from: server)
        guard case .tcpDataConsumed = credit.action else { return XCTFail("missing credit") }
        XCTAssertEqual(returned.actions.map(\.serverSeq), [101, 102])
        XCTAssertEqual(returned.missing, ["ahp-session:/missing"])
        XCTAssertEqual(parameters.lastSeenServerSeq, 100)
        try await connection.dispose()
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        await fresh.shutdown()
        await old.shutdown()
    }

    func testTcpPeerCloseRespondsWithoutWaitingForCreditOrUnreadOutput() async throws {
        let (side, server) = InMemoryTransport.pair()
        let client = AHPClient(transport: side)
        let connection = try await openTcp(client, server)
        let write = Task { try await connection.write(Data(repeating: 0, count: 5)) }
        let first = try await readDispatchNotification(from: server)
        let second = try await readDispatchNotification(from: server)
        let drain = Task { try await connection.drain() }
        try await tcpPush(server, 1, first.action, origin: ActionOrigin(clientId: "owner", clientSeq: first.clientSeq))
        try await tcpPush(server, 2, second.action, origin: ActionOrigin(clientId: "owner", clientSeq: second.clientSeq))
        try await tcpPush(server, 3, .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")))
        try await tcpPush(server, 4, .tcpHostClose(TcpHostCloseAction(type: .tcpHostClose)))
        let close = try await readDispatchNotification(from: server)
        guard case .tcpClientClose = close.action else { return XCTFail("missing close response") }
        let beforeDrain = await connection.state
        let listeners = await client._strictEventListenerCount()
        XCTAssertEqual(beforeDrain.input.consumedBytes, 0)
        XCTAssertEqual(beforeDrain.output.consumedBytes, 0)
        XCTAssertEqual(listeners, 1)
        do { try await write.value; XCTFail("writer survived close") } catch { }
        try await tcpPush(server, 5, close.action, origin: ActionOrigin(clientId: "owner", clientSeq: close.clientSeq))
        try await tcpPush(server, 6, .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: 4)))
        try await drain.value
        let bytes = try await connection.read()
        XCTAssertEqual(bytes, Data([7, 8]))
        let credit = try await readDispatchNotification(from: server)
        guard case .tcpDataConsumed = credit.action else { return XCTFail("missing credit") }
        try await tcpPush(server, 7, credit.action, origin: ActionOrigin(clientId: "owner", clientSeq: credit.clientSeq))
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        let eof = try await connection.read()
        XCTAssertNil(eof)
        await client.shutdown()
    }

    func testTcpAdapterReleasesLateCreationWithoutUnsubscribingParent() async throws {
        for (cancel, resource) in [(false, "ahp-tcp:/late"), (true, "ahp-tcp:/late"), (true, "ahp-session:/s1")] {
            let (side, server) = InMemoryTransport.pair()
            var config = AHPClientConfig()
            config.requestTimeout = .seconds(1)
            let client = AHPClient(transport: side, config: config)
            let initial = try await openTcp(client, server)
            try await closeTcp(initial, server)
            let open = Task { try await client.openTcpConnection(session: "ahp-session:/s1", create: TcpConnectionSubscription(
                type: "tcpConnection", host: "localhost", port: 3000, encoding: .base64, receiveWindowBytes: 4, maximumChunkSize: 2
            )) }
            let request = try await readRequest(from: server, expectedMethod: "subscribe")
            if cancel { open.cancel() }
            do { _ = try await open.value; XCTFail("abandoned creation succeeded") }
            catch {
                if cancel { XCTAssertTrue(error is CancellationError) }
                else {
                    guard case AHPClientError.requestTimeout = error else { return XCTFail("expected request timeout, got \(error)") }
                }
            }
            let count = await client._strictEventListenerCount()
            let pending = await client._pendingCount()
            XCTAssertEqual(count, 0)
            XCTAssertEqual(pending, 0)
            try await respond(to: request.id, with: ["snapshot": ["resource": resource]], on: server)
            if resource.hasPrefix("ahp-tcp:") {
                let params = try await readNotification(from: server, expectedMethod: "unsubscribe")
                let unsubscribe = try JSONDecoder().decode(UnsubscribeParams.self, from: JSONEncoder().encode(params))
                XCTAssertEqual(unsubscribe.channel, resource)
            }
            let barrier = await client.attachSubscription("ahp-session:/barrier")
            var iterator = barrier.makeAsyncIterator()
            try await respond(to: request.id, with: ["snapshot": ["resource": resource]], on: server)
            try await pushNotification(method: "action", params: ActionEnvelope(
                channel: "ahp-session:/barrier", action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "barrier")), serverSeq: 99
            ), on: server)
            _ = try await nextWithTimeout(&iterator)
            let probe = Task {
                let result: [String: Bool] = try await client.request(method: "probe", params: ["probe": "ok"])
                return result
            }
            let probeRequest = try await readRequest(from: server, expectedMethod: "probe")
            try await respond(to: probeRequest.id, with: ["ok": true], on: server)
            _ = try await probe.value
            let state = await client.connectionState
            XCTAssertEqual(state, .connected)
            await client.shutdown()
        }
    }

    func testTcpResetOrDisposeTerminatesClosingStream() async throws {
        for reset in [false, true] {
            let (side, server) = InMemoryTransport.pair()
            let client = AHPClient(transport: side)
            let connection = try await openTcp(client, server)
            let write = Task { try await connection.write(Data(repeating: 0, count: 5)) }
            _ = try await readDispatchNotification(from: server)
            _ = try await readDispatchNotification(from: server)
            let drain = Task { try await connection.drain() }
            try await connection.close()
            _ = try await readDispatchNotification(from: server)
            do { try await write.value; XCTFail("writer continued after close") } catch { }
            if reset {
                try await connection.accept(ActionEnvelope(channel: connection.resource,
                    action: .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")), serverSeq: 1))
                try await tcpPush(server, 2, .tcpHostReset(TcpHostResetAction(type: .tcpHostReset, reason: .protocolError)))
                _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
                do { _ = try await connection.read(); XCTFail("reset retained buffered bytes") } catch { }
            } else {
                let read = Task { try await connection.read() }
                try await connection.dispose()
                _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
                do { _ = try await read.value; XCTFail("dispose returned EOF") } catch { }
            }
            do { try await drain.value; XCTFail("drain survived terminal failure") } catch { }
            let listeners = await client._strictEventListenerCount()
            XCTAssertEqual(listeners, 0)
            try await connection.dispose()
            try await connection.close()
            await client.shutdown()
        }
    }

    func testTcpCloseWhileSuspendedReplaysAndDrainsBeforeRelease() async throws {
        let (oldSide, oldServer) = InMemoryTransport.pair()
        let old = AHPClient(transport: oldSide)
        let connection = try await openTcp(old, oldServer)
        await old.shutdown(preservingTcpConnections: true)
        try await connection.close()
        let closed = await connection.isClosed
        XCTAssertFalse(closed)
        let read = Task { try await connection.read() }
        let (side, server) = InMemoryTransport.pair()
        let fresh = AHPClient(transport: side)
        try await fresh.connect()
        let reconnect = Task { try await fresh.reconnectTcpConnections(params: ReconnectParams(
            channel: RootResourceURI, clientId: "owner", lastSeenServerSeq: 0, subscriptions: []),
            connections: [connection]) }
        let request = try await readRequest(from: server, expectedMethod: "reconnect")
        let parameters = try JSONDecoder().decode(ReconnectParams.self, from: JSONEncoder().encode(request.params))
        XCTAssertTrue(parameters.subscriptions.contains(connection.resource))
        try await respond(to: request.id, with: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [
            ActionEnvelope(channel: connection.resource, action: .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")), serverSeq: 1),
            ActionEnvelope(channel: connection.resource, action: .tcpHostClose(TcpHostCloseAction(type: .tcpHostClose)), serverSeq: 2),
        ], missing: [])), on: server)
        _ = try await reconnect.value
        let close = try await readDispatchNotification(from: server)
        guard case .tcpClientClose = close.action else { return XCTFail("missing retained close") }
        let bytes = try await read.value
        XCTAssertEqual(bytes, Data([7, 8]))
        let credit = try await readDispatchNotification(from: server)
        guard case .tcpDataConsumed = credit.action else { return XCTFail("missing output credit") }
        let listeners = await fresh._strictEventListenerCount()
        XCTAssertEqual(listeners, 1)
        try await tcpPush(server, 3, close.action, origin: ActionOrigin(clientId: "owner", clientSeq: close.clientSeq))
        try await tcpPush(server, 4, credit.action, origin: ActionOrigin(clientId: "owner", clientSeq: credit.clientSeq))
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        let eof = try await connection.read()
        XCTAssertNil(eof)
        let remaining = await fresh._strictEventListenerCount()
        XCTAssertEqual(remaining, 0)
        await fresh.shutdown()
        await old.shutdown()
    }

    func testTcpAdapterResetCloseAndDisposeWakeAllBlockedOperations() async throws {
        for terminal in [0, 1, 2] {
            let (side, server) = InMemoryTransport.pair()
            let client = AHPClient(transport: side)
            let connection = try await openTcp(client, server)
            let read = Task { try await connection.read() }
            let write = Task { try await connection.write(Data(repeating: 0, count: 5)) }
            _ = try await readDispatchNotification(from: server)
            _ = try await readDispatchNotification(from: server)
            let drain = Task { try await connection.drain() }
            if terminal == 1 { try await tcpPush(server, 1, .tcpHostReset(TcpHostResetAction(type: .tcpHostReset, reason: .protocolError))) }
            else if terminal == 2 { try await closeTcp(connection, server) }
            else { try await connection.dispose() }
            if terminal != 2 { _ = try await readNotification(from: server, expectedMethod: "unsubscribe") }
            do { _ = try await read.value; XCTFail("read survived terminal failure") } catch { }
            do { try await write.value; XCTFail("write survived terminal close") } catch { }
            do { try await drain.value; XCTFail("drain survived terminal close") } catch { }
            try await connection.dispose()
            let count = await client._strictEventListenerCount()
            XCTAssertEqual(count, 0)
            await client.shutdown()
        }
    }

    func testTcpAdapterReconnectContinuesBlockedWriterAfterReplayCredit() async throws {
        let (oldSide, oldServer) = InMemoryTransport.pair()
        let old = AHPClient(transport: oldSide)
        let connection = try await openTcp(old, oldServer)
        let write = Task { try await connection.write(Data(repeating: 0, count: 6)) }
        let first = try await readDispatchNotification(from: oldServer)
        let second = try await readDispatchNotification(from: oldServer)
        try await tcpPush(oldServer, 1, first.action, origin: ActionOrigin(clientId: "owner", clientSeq: first.clientSeq))
        try await tcpPush(oldServer, 2, second.action, origin: ActionOrigin(clientId: "owner", clientSeq: second.clientSeq))
        try await tcpPush(oldServer, 3, .tcpDataEof(TcpDataEofAction(type: .tcpDataEof, finalOffset: 0)))
        let eof = try await connection.read()
        XCTAssertNil(eof)
        _ = try await old.dispatch(.sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "ordinary action")),
                                  channel: "ahp-session:/s1", clientSeq: 100)
        let unrelated = try await readDispatchNotification(from: oldServer)
        XCTAssertEqual(unrelated.clientSeq, 100)
        await old.shutdown(preservingTcpConnections: true)
        let (side, server) = InMemoryTransport.pair()
        let fresh = AHPClient(transport: side)
        try await fresh.connect()
        let reconnect = Task { try await fresh.reconnectTcpConnections(params: ReconnectParams(
            channel: RootResourceURI, clientId: "owner", lastSeenServerSeq: 20, subscriptions: []
        ), connections: [connection]) }
        let request = try await readRequest(from: server, expectedMethod: "reconnect")
        let params = try JSONDecoder().decode(ReconnectParams.self, from: JSONEncoder().encode(request.params))
        XCTAssertEqual(params.lastSeenServerSeq, 3)
        let actions = [
            ActionEnvelope(channel: connection.resource, action: .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: 2)), serverSeq: 4),
        ]
        try await respond(to: request.id, with: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: actions, missing: [])), on: server)
        _ = try await reconnect.value
        let tail = try await readDispatchNotification(from: server)
        guard case .tcpInput(let input) = tail.action else { return XCTFail("missing resumed write") }
        XCTAssertEqual(input.offset, 4)
        XCTAssertGreaterThan(tail.clientSeq, 100)
        try await write.value
        try await closeTcp(connection, server)
        await fresh.shutdown()
    }

    func testTcpAdapterReservesCreditChunksReadsDuplicatesAndHalfCloses() async throws {
        let (side, server) = InMemoryTransport.pair()
        let client = AHPClient(transport: side)
        let connection = try await openTcp(client, server)
        let completed = expectation(description: "write resumed after credit")
        let write = Task {
            try await connection.write(Data([0, 1, 2, 3, 4, 5])[1...])
            completed.fulfill()
        }
        let first = try await readDispatchNotification(from: server)
        let second = try await readDispatchNotification(from: server)
        guard case .tcpInput(let input) = second.action else { return XCTFail("missing input") }
        XCTAssertEqual(input.offset, 2)
        XCTAssertEqual(Data(base64Encoded: input.data)?.count, 2)
        do { try await connection.write(Data([9])); XCTFail("concurrent writer accepted") }
        catch { }
        try await tcpPush(server, 1, first.action, origin: ActionOrigin(clientId: "owner", clientSeq: first.clientSeq))
        try await tcpPush(server, 2, second.action, origin: ActionOrigin(clientId: "owner", clientSeq: second.clientSeq))
        try await tcpPush(server, 3, .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: 2)))
        let third = try await readDispatchNotification(from: server)
        try await write.value
        await fulfillment(of: [completed], timeout: 2)
        guard case .tcpInput(let tail) = third.action else { return XCTFail("missing tail") }
        XCTAssertEqual(tail.offset, 4)
        let drain = Task { try await connection.drain() }
        try await tcpPush(server, 4, third.action, origin: ActionOrigin(clientId: "owner", clientSeq: third.clientSeq))
        try await tcpPush(server, 5, .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: 5)))
        try await drain.value
        let data = StateAction.tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg="))
        try await tcpPush(server, 6, data)
        try await tcpPush(server, 7, data)
        try await tcpPush(server, 8, .tcpDataEof(TcpDataEofAction(type: .tcpDataEof, finalOffset: 2)))
        let bytes = try await connection.read()
        XCTAssertEqual(bytes, Data([7, 8]))
        let credit = try await readDispatchNotification(from: server)
        guard case .tcpDataConsumed(let consumed) = credit.action else { return XCTFail("missing output credit") }
        XCTAssertEqual(consumed.consumedBytes, 2)
        let eof = try await connection.read()
        XCTAssertNil(eof)
        try await connection.end()
        let end = try await readDispatchNotification(from: server)
        guard case .tcpInputEof(let final) = end.action else { return XCTFail("missing input EOF") }
        XCTAssertEqual(final.finalOffset, 5)
        try await closeTcp(connection, server)
        let count = await client._strictEventListenerCount()
        XCTAssertEqual(count, 0)
        await client.shutdown()
    }

    func testTcpAdapterFirstActionAndStrictLossWakeWaiters() async throws {
        let (side, server) = InMemoryTransport.pair()
        let client = AHPClient(transport: side)
        let connection = try await openTcp(client, server, firstAction: true)
        let bytes = try await connection.read()
        XCTAssertEqual(bytes, Data([7, 8]))
        _ = try await readDispatchNotification(from: server)
        let read = Task { try await connection.read() }
        let write = Task { try await connection.write(Data(repeating: 0, count: 5)) }
        _ = try await readDispatchNotification(from: server)
        _ = try await readDispatchNotification(from: server)
        let drain = Task { try await connection.drain() }
        try await server.send(.text("{"))
        do { _ = try await read.value; XCTFail("read survived decode loss") } catch { }
        do { try await write.value; XCTFail("write survived decode loss") } catch { }
        do { try await drain.value; XCTFail("drain survived decode loss") } catch { }
        let reset = try await readDispatchNotification(from: server)
        guard case .tcpClientReset = reset.action else { return XCTFail("missing reset") }
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        try await connection.dispose()
        let count = await client._strictEventListenerCount()
        XCTAssertEqual(count, 0)
        await client.shutdown()
    }

    func testTcpAdapterRejectsMalformedClientEchoWithoutAdvancingState() async throws {
        for malformed in ["missing", "owner", "negative", "unsafe", "unassigned", "wrong-pending", "reused", "payload", "eof", "credit", "close", "reset", "rejected-empty"] {
            let (side, server) = InMemoryTransport.pair()
            let client = AHPClient(transport: side)
            let connection = try await openTcp(client, server)
            let read = Task { try await connection.read() }
            let write = Task { try await connection.write(Data([1, 2, 3, 4, 5])) }
            let first = try await readDispatchNotification(from: server)
            let second = try await readDispatchNotification(from: server)
            let drain = Task { try await connection.drain() }
            var action = first.action
            var origin: ActionOrigin? = ActionOrigin(clientId: "owner", clientSeq: first.clientSeq)
            switch malformed {
            case "missing": origin = nil
            case "owner": origin = ActionOrigin(clientId: "other", clientSeq: first.clientSeq)
            case "negative": origin = ActionOrigin(clientId: "owner", clientSeq: -1)
            case "unsafe": origin = ActionOrigin(clientId: "owner", clientSeq: 9007199254740992)
            case "unassigned": origin = ActionOrigin(clientId: "owner", clientSeq: second.clientSeq + 1)
            case "wrong-pending": origin = ActionOrigin(clientId: "owner", clientSeq: second.clientSeq)
            case "reused":
                try await tcpPush(server, 1, first.action, origin: origin)
                action = second.action
            case "payload": action = .tcpInput(TcpInputAction(type: .tcpInput, offset: 0, data: "AgE="))
            case "eof": origin = nil; action = .tcpInputEof(TcpInputEofAction(type: .tcpInputEof, finalOffset: 0))
            case "credit": origin = nil; action = .tcpDataConsumed(TcpDataConsumedAction(type: .tcpDataConsumed, consumedBytes: 0))
            case "close": origin = nil; action = .tcpClientClose(TcpClientCloseAction(type: .tcpClientClose))
            case "reset": origin = nil; action = .tcpClientReset(TcpClientResetAction(type: .tcpClientReset, reason: .protocolError))
            case "rejected-empty": break
            default: XCTFail("unknown test case")
            }
            try await tcpPush(server, 2, action, origin: origin, rejectionReason: malformed == "rejected-empty" ? "" : nil)
            do { _ = try await read.value; XCTFail("read survived \(malformed) echo") } catch { XCTAssertTrue(error is TransportError) }
            do { try await write.value; XCTFail("write survived \(malformed) echo") } catch { XCTAssertTrue(error is TransportError) }
            do { try await drain.value; XCTFail("drain survived \(malformed) echo") } catch { XCTAssertTrue(error is TransportError) }
            let state = await connection.state
            XCTAssertEqual(state.input.receivedBytes, malformed == "reused" ? 2 : 0)
            XCTAssertEqual(state.input.consumedBytes, 0)
            let reset = try await readDispatchNotification(from: server)
            guard case .tcpClientReset = reset.action else { return XCTFail("missing reset") }
            _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
            let count = await client._strictEventListenerCount()
            XCTAssertEqual(count, 0)
            try await connection.dispose()
            await client.shutdown()
        }
    }

    func testTcpAdapterReconnectRetainsReadersAndOnlyResendsUnacknowledgedActions() async throws {
        for acknowledged in [false, true] {
            let (oldSide, oldServer) = InMemoryTransport.pair()
            let old = AHPClient(transport: oldSide)
            let connection = try await openTcp(old, oldServer)
            try await connection.write(Data([1, 2]))
            let original = try await readDispatchNotification(from: oldServer)
            let read = Task { try await connection.read() }
            await old.shutdown(preservingTcpConnections: true)
            let (side, server) = InMemoryTransport.pair()
            let fresh = AHPClient(transport: side)
            try await fresh.connect()
            do {
                _ = try await fresh.reconnectTcpConnections(params: ReconnectParams(
                    channel: RootResourceURI, clientId: "other", lastSeenServerSeq: 20, subscriptions: []
                ), connections: [connection])
                XCTFail("wrong identity accepted")
            } catch { }
            let reconnect = Task { try await fresh.reconnectTcpConnections(params: ReconnectParams(
                channel: RootResourceURI, clientId: "owner", lastSeenServerSeq: 20, subscriptions: ["ahp-session:/s1"]
            ), connections: [connection]) }
            let request = try await readRequest(from: server, expectedMethod: "reconnect")
            let params = try JSONDecoder().decode(ReconnectParams.self, from: JSONEncoder().encode(request.params))
            XCTAssertEqual(params.lastSeenServerSeq, 0)
            XCTAssertTrue(params.subscriptions.contains(connection.resource))
            var actions = [
                ActionEnvelope(channel: connection.resource, action: .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")), serverSeq: 1,
                    origin: ActionOrigin(clientId: "owner", clientSeq: original.clientSeq)),
            ]
            if acknowledged {
                actions.append(ActionEnvelope(channel: connection.resource, action: original.action, serverSeq: 2,
                    origin: ActionOrigin(clientId: "owner", clientSeq: original.clientSeq)))
            }
            try await respond(to: request.id, with: ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: actions, missing: [])), on: server)
            try await tcpPush(server, 3, original.action, origin: ActionOrigin(clientId: "owner", clientSeq: original.clientSeq))
            try await tcpPush(server, 4, .tcpDataEof(TcpDataEofAction(type: .tcpDataEof, finalOffset: 2)))
            _ = try await reconnect.value
            let bytes = try await read.value
            XCTAssertEqual(bytes, Data([7, 8]))
            if !acknowledged {
                let resent = try await readDispatchNotification(from: server)
                XCTAssertEqual(resent.clientSeq, original.clientSeq)
                guard case .tcpInput(let input) = resent.action, case .tcpInput(let previous) = original.action else {
                    return XCTFail("input resend changed action type")
                }
                XCTAssertEqual(input.offset, previous.offset)
                XCTAssertEqual(input.data, previous.data)
            }
            let credit = try await readDispatchNotification(from: server)
            guard case .tcpDataConsumed = credit.action else { return XCTFail("acknowledged input was resent") }
            XCTAssertGreaterThan(credit.clientSeq, original.clientSeq)
            let eof = try await connection.read()
            XCTAssertNil(eof)
            try await closeTcp(connection, server)
            await fresh.shutdown()
        }
    }

    func testTcpAdapterReconnectSnapshotAndMissingFailClosed() async throws {
        for snapshot in [false, true] {
            let (oldSide, oldServer) = InMemoryTransport.pair()
            let old = AHPClient(transport: oldSide)
            let connection = try await openTcp(old, oldServer)
            let read = Task { try await connection.read() }
            await old.shutdown(preservingTcpConnections: true)
            let (side, server) = InMemoryTransport.pair()
            let fresh = AHPClient(transport: side)
            try await fresh.connect()
            let reconnect = Task { try await fresh.reconnectTcpConnections(params: ReconnectParams(
                channel: RootResourceURI, clientId: "owner", lastSeenServerSeq: 0, subscriptions: []
            ), connections: [connection]) }
            let request = try await readRequest(from: server, expectedMethod: "reconnect")
            let result: ReconnectResult = snapshot
                ? .snapshot(ReconnectSnapshotResult(type: .snapshot, snapshots: []))
                : .replay(ReconnectReplayResult(type: .replay, actions: [], missing: [connection.resource]))
            try await respond(to: request.id, with: result, on: server)
            _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
            _ = try await reconnect.value
            do { _ = try await read.value; XCTFail("read survived snapshot/missing fallback") } catch { }
            let count = await fresh._strictEventListenerCount()
            XCTAssertEqual(count, 0)
            try await connection.dispose()
            let open = Task { try await fresh.openTcpConnection(session: "ahp-session:/s1", create: tcpCreation()) }
            let create = try await readRequest(from: server, expectedMethod: "subscribe")
            try await respond(to: create.id, with: SubscribeResult(snapshot: tcpSnapshot("ahp-tcp:/replacement")), on: server)
            let replacement = try await open.value
            try await replacement.dispose()
            _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
            await fresh.shutdown()
        }
    }

    func testTcpClientDefaultShutdownDisposesEvenAfterPreservedTransportShutdown() async throws {
        for preserved in [false, true] {
            let (side, server) = InMemoryTransport.pair()
            let client = AHPClient(transport: side)
            let connection = try await openTcp(client, server)
            let read = Task { try await connection.read() }
            let write = Task { try await connection.write(Data(repeating: 0, count: 6)) }
            _ = try await readDispatchNotification(from: server)
            _ = try await readDispatchNotification(from: server)
            let drain = Task { try await connection.drain() }
            if preserved {
                await client.shutdown(preservingTcpConnections: true)
                let closed = await connection.isClosed
                XCTAssertFalse(closed)
            }
            let shutdown = Task { await client.shutdown() }
            if !preserved { _ = try await readNotification(from: server, expectedMethod: "unsubscribe") }
            await shutdown.value
            do { _ = try await read.value; XCTFail("shutdown left read active") } catch { }
            do { try await write.value; XCTFail("shutdown left write active") } catch { }
            do { try await drain.value; XCTFail("shutdown left drain active") } catch { }
            let count = await client._strictEventListenerCount()
            XCTAssertEqual(count, 0)
        }
    }

    func testTcpAdapterLargeEncodingAndFinalClosePreserveCompletedDrainAndBufferedReads() async throws {
        let (side, server) = InMemoryTransport.pair()
        let client = AHPClient(transport: side)
        var bytes = Data(repeating: 0, count: 4 * 1024 * 1024)
        bytes[0] = 1
        bytes[bytes.count - 1] = 255
        let connection = try await openTcp(client, server, maximumChunkSize: bytes.count)
        try await connection.write(bytes)
        let sent = try await readDispatchNotification(from: server)
        guard case .tcpInput(let input) = sent.action else { return XCTFail("missing input") }
        XCTAssertEqual(input.offset, 0)
        XCTAssertEqual(Data(base64Encoded: input.data), bytes)
        let drain = Task { try await connection.drain() }
        try await tcpPush(server, 1, sent.action, origin: ActionOrigin(clientId: "owner", clientSeq: sent.clientSeq))
        try await tcpPush(server, 2, .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: bytes.count)))
        try await tcpPush(server, 3, .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "Bwg=")))
        try await tcpPush(server, 4, .tcpHostClose(TcpHostCloseAction(type: .tcpHostClose)))
        let close = try await readDispatchNotification(from: server)
        guard case .tcpClientClose = close.action else { return XCTFail("missing close acknowledgement") }
        let listeners = await client._strictEventListenerCount()
        XCTAssertEqual(listeners, 1)
        try await tcpPush(server, 5, close.action, origin: ActionOrigin(clientId: "owner", clientSeq: close.clientSeq))
        try await drain.value
        try await connection.drain()
        let data = try await connection.read()
        XCTAssertEqual(data, Data([7, 8]))
        let credit = try await readDispatchNotification(from: server)
        guard case .tcpDataConsumed = credit.action else { return XCTFail("missing output credit") }
        try await tcpPush(server, 6, credit.action, origin: ActionOrigin(clientId: "owner", clientSeq: credit.clientSeq))
        _ = try await readNotification(from: server, expectedMethod: "unsubscribe")
        let eof = try await connection.read()
        XCTAssertNil(eof)
        try await connection.dispose()
        await client.shutdown()
    }

    func testStrictEventsFailOnMalformedFramesAndNotificationPayloads() async throws {
        let malformed: [(String, Bool)] = [
            ("{", false),
            ("{", true),
            (#"{"jsonrpc":"2.0","id":1}"#, false),
            (#"{"jsonrpc":"2.0","method":"action"}"#, false),
            (#"{"jsonrpc":"2.0","method":"action","params":null}"#, false),
            (#"{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/child","serverSeq":2,"action":{"type":"tcp/dataEof","finalOffset":0.5}}}"#, false),
            (#"{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/child","serverSeq":2,"action":{"type":"tcp/inputConsumed","consumedBytes":0.5}}}"#, false),
            (#"{"jsonrpc":"2.0","method":"root/sessionAdded","params":[]}"#, false),
            (#"{"jsonrpc":"2.0","method":"root/sessionAdded"}"#, false),
        ]
        for (wire, binary) in malformed {
            let (clientSide, serverSide) = InMemoryTransport.pair()
            let client = AHPClient(transport: clientSide)
            let strict = await client.strictEvents()
            let ordinary = await client.events
            let barrier = await client.attachSubscription("ahp-session:/barrier")
            var barrierIter = barrier.makeAsyncIterator()
            try await client.connect()
            try await pushNotification(method: "action", params: ActionEnvelope(
                channel: "ahp-session:/s1",
                action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "prefix")), serverSeq: 1
            ), on: serverSide)
            try await serverSide.send(binary ? .binary(Data(wire.utf8)) : .text(wire))
            for seq in [2, 99] {
                try await pushNotification(method: "action", params: ActionEnvelope(
                    channel: seq == 99 ? "ahp-session:/barrier" : "ahp-session:/s1",
                    action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "later")), serverSeq: seq
                ), on: serverSide)
            }

            _ = try await nextWithTimeout(&barrierIter)
            let registered = await client._strictEventListenerCount()
            XCTAssertEqual(registered, 0, "failed receivers must detach before the consumer drains the error")
            var strictIter = strict.makeAsyncIterator()
            let prefix = try await nextWithTimeout(&strictIter)
            guard case .action(let envelope) = prefix?.event else { return XCTFail("missing prefix for \(wire)") }
            XCTAssertEqual(envelope.serverSeq, 1)
            do {
                _ = try await nextWithTimeout(&strictIter)
                XCTFail("expected terminal protocol error for \(wire)")
            } catch let error as TransportError {
                guard case .protocol = error else { return XCTFail("expected protocol error, got \(error)") }
            }
            let terminated = try await nextWithTimeout(&strictIter)
            XCTAssertNil(terminated, "a decode-failed receiver must never resume")
            var ordinaryIter = ordinary.makeAsyncIterator()
            for expected in [1, 2, 99] {
                let event = try await nextWithTimeout(&ordinaryIter)
                guard case .action(let envelope) = event?.event else { return XCTFail("ordinary receiver stopped") }
                XCTAssertEqual(envelope.serverSeq, expected)
            }
            await client.shutdown()
        }
    }

    func testStrictEventsAllowUnknownNotificationsAndActions() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        let events = await client.strictEvents()
        try await client.connect()
        try await serverSide.send(.text(#"{"jsonrpc":"2.0","method":"future/notification"}"#))
        try await serverSide.send(.text(#"{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/child","serverSeq":1,"action":{"type":"tcp/future"}}}"#))
        var iterator = events.makeAsyncIterator()
        let event = try await nextWithTimeout(&iterator)
        guard case .action(let envelope) = event?.event else { return XCTFail("unknown actions must remain forward-compatible") }
        XCTAssertEqual(envelope.serverSeq, 1)
        XCTAssertEqual(envelope.channel, "ahp-tcp:/child")
        await client.shutdown()
    }

    func testStrictDecodeFailureWakesBlockedNextAndUnregisters() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        let strict = await client.strictEvents()
        let ordinary = await client.events
        try await client.connect()
        let started = expectation(description: "strict next started")
        let finished = expectation(description: "strict next woke with protocol error")
        let reader = Task {
            var iterator = strict.makeAsyncIterator()
            started.fulfill()
            do {
                _ = try await iterator.next()
                XCTFail("expected protocol failure")
            } catch let error as TransportError {
                switch error {
                case .protocol: break
                default: XCTFail("expected protocol error, got \(error)")
                }
            } catch {
                XCTFail("unexpected error: \(error)")
            }
            finished.fulfill()
        }
        defer { reader.cancel() }
        await fulfillment(of: [started], timeout: 2)
        try await serverSide.send(.text("{"))
        await fulfillment(of: [finished], timeout: 2)
        let registered = await client._strictEventListenerCount()
        XCTAssertEqual(registered, 0)
        try await pushNotification(method: "action", params: ActionEnvelope(
            channel: "ahp-session:/s1",
            action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "still connected")), serverSeq: 1
        ), on: serverSide)
        var ordinaryIter = ordinary.makeAsyncIterator()
        let event = try await nextWithTimeout(&ordinaryIter)
        guard case .action(let envelope) = event?.event else { return XCTFail("ordinary receiver stopped") }
        XCTAssertEqual(envelope.serverSeq, 1)
        await client.shutdown()
    }

    func testStrictEventsPreserveFirstTcpActionBeforeCreateReturns() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        let events = await client.strictEvents()
        let barrier = await client.attachSubscription("ahp-session:/barrier")
        var barrierIter = barrier.makeAsyncIterator()
        try await client.connect()

        let server = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "subscribe")
            let params = try JSONDecoder().decode(SubscribeParams.self, from: JSONEncoder().encode(request.params))
            XCTAssertEqual(params.channel, "ahp-session:/s1")
            XCTAssertEqual(params.create?.host, "localhost")
            let direction = FlowControlledByteDirectionState(windowBytes: 8, maximumChunkSize: 8, receivedBytes: 0, consumedBytes: 0)
            let result = SubscribeResult(snapshot: Snapshot(
                resource: "ahp-tcp:/created",
                state: .tcp(TcpConnectionState(
                    session: params.channel, target: TcpTarget(host: "localhost", port: 3000), encoding: .base64,
                    input: direction, output: direction, clientClosed: false, hostClosed: false
                )),
                fromSeq: 0
            ))
            try await respond(to: request.id, with: result, on: serverSide)
            try await pushNotification(method: "action", params: ActionEnvelope(
                channel: "ahp-tcp:/created",
                action: .tcpData(TcpDataAction(type: .tcpData, offset: 0, data: "AA==")), serverSeq: 1
            ), on: serverSide)
            try await pushNotification(method: "action", params: ActionEnvelope(
                channel: "ahp-session:/barrier",
                action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "barrier")), serverSeq: 2
            ), on: serverSide)
        }
        let result: SubscribeResult = try await client.request(method: "subscribe", params: SubscribeParams(
            channel: "ahp-session:/s1",
            create: TcpConnectionSubscription(type: "tcpConnection", host: "localhost", port: 3000,
                                              encoding: .base64, receiveWindowBytes: 8, maximumChunkSize: 8)
        ))
        try await server.value
        _ = try await nextWithTimeout(&barrierIter)
        let snapshot = try XCTUnwrap(result.snapshot)
        var iterator = events.makeAsyncIterator()
        let event = try await nextWithTimeout(&iterator)
        XCTAssertEqual(event?.resource, snapshot.resource)
        guard case .action(let envelope) = event?.event, case .tcp(let initial) = snapshot.state else {
            return XCTFail("expected TCP snapshot and first raw action")
        }
        XCTAssertEqual(try tcpReducer(state: initial, action: envelope.action).output.receivedBytes, 1)
        await client.shutdown()
    }

    func testStrictEventsOverflowIsTerminalAndOrdinaryEventsStillDropOldest() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide, config: AHPClientConfig(subscriptionBufferSize: 2))
        let strict = await client.strictEvents()
        let ordinary = await client.events
        let barrier = await client.attachSubscription("ahp-session:/barrier")
        var barrierIter = barrier.makeAsyncIterator()
        try await client.connect()
        for seq in 1...3 {
            try await pushNotification(method: "action", params: ActionEnvelope(
                channel: "ahp-session:/s1",
                action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "\(seq)")),
                serverSeq: seq
            ), on: serverSide)
        }
        try await pushNotification(method: "action", params: ActionEnvelope(
            channel: "ahp-session:/barrier",
            action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "barrier")), serverSeq: 99
        ), on: serverSide)
        _ = try await nextWithTimeout(&barrierIter)
        let registered = await client._strictEventListenerCount()
        XCTAssertEqual(registered, 0, "overflowed receivers must detach before their error is drained")
        var strictIter = strict.makeAsyncIterator()
        for expected in 1...2 {
            let event = try await nextWithTimeout(&strictIter)
            guard case .action(let envelope) = event?.event else { return XCTFail("missing contiguous prefix") }
            XCTAssertEqual(envelope.serverSeq, expected)
        }
        do {
            _ = try await nextWithTimeout(&strictIter)
            XCTFail("expected terminal lag error")
        } catch let error as SubscriptionLagError {
            XCTAssertEqual(error.capacity, 2)
        }
        var ordinaryIter = ordinary.makeAsyncIterator()
        for expected in [3, 99] {
            let event = try await nextWithTimeout(&ordinaryIter)
            guard case .action(let envelope) = event?.event else { return XCTFail("missing ordinary event") }
            XCTAssertEqual(envelope.serverSeq, expected)
        }
        let healthy = await client.strictEvents()
        try await pushNotification(method: "action", params: ActionEnvelope(
            channel: "ahp-session:/barrier",
            action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, title: "later")), serverSeq: 100
        ), on: serverSide)
        _ = try await nextWithTimeout(&barrierIter)
        let terminated = try await nextWithTimeout(&strictIter)
        XCTAssertNil(terminated, "an overflowed receiver must never resume")
        var healthyIter = healthy.makeAsyncIterator()
        let later = try await nextWithTimeout(&healthyIter)
        guard case .action(let envelope) = later?.event else { return XCTFail("other receivers must remain usable") }
        XCTAssertEqual(envelope.serverSeq, 100)
        await client.shutdown()
        let finished = try await nextWithTimeout(&healthyIter)
        XCTAssertNil(finished)
    }

    // MARK: - request_response_round_trip

    func testInitializeHandshakeRoundTrip() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        // Server task: respond to `initialize`.
        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "initialize")
            let result = InitializeResult(
                protocolVersion: "0.2.0",
                serverSeq: 0,
                snapshots: []
            )
            try await respond(to: request.id, with: result, on: serverSide)
        }

        let init1 = try await client.initialize(
            clientId: "test-client",
            protocolVersions: ["0.2.0"],
            initialSubscriptions: []
        )
        XCTAssertEqual(init1.protocolVersion, "0.2.0")
        XCTAssertEqual(init1.serverSeq, 0)

        try await serverTask.value
        await client.shutdown()
    }

    // MARK: - ping

    func testPingTargetsRootChannelAndResolvesOnNullResult() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        // Server task: answer a single `ping` with a null result.
        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "ping")
            // `ping` is a connection-level command scoped to the root channel.
            let params = try XCTUnwrap(request.params)
            let paramsData = try JSONEncoder().encode(params)
            let obj = try JSONSerialization.jsonObject(with: paramsData) as? [String: Any]
            XCTAssertEqual(obj?["channel"] as? String, RootResourceURI)

            // The response itself is the signal; `ping` carries a null result.
            let dict: [String: Any] = ["jsonrpc": "2.0", "id": request.id, "result": NSNull()]
            let wireBytes = try JSONSerialization.data(withJSONObject: dict)
            try await serverSide.send(.text(String(data: wireBytes, encoding: .utf8)!))
        }

        try await client.ping()

        try await serverTask.value
        await client.shutdown()
    }

    // MARK: - subscribe_streams_actions

    func testSubscribeStreamsActions() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let serverTask = Task {
            // Respond to subscribe with a session snapshot.
            let request = try await readRequest(from: serverSide, expectedMethod: "subscribe")
            let snap = SubscribeResult(snapshot: Snapshot(
                resource: "ahp-session:/s1",
                state: .session(SessionState(
                    provider: "test",
                    title: "T",
                    status: .idle,
                    lifecycle: .ready,
                    activeClients: [],
                    chats: []
                )),
                fromSeq: 0
            ))
            try await respond(to: request.id, with: snap, on: serverSide)

            // Push an action notification scoped to the subscribed URI.
            let envelope = ActionEnvelope(
                channel: "ahp-session:/s1",
                action: .sessionTitleChanged(SessionTitleChangedAction(
                    type: .sessionTitleChanged,
                    title: "Hello"
                )),
                serverSeq: 1
            )
            try await pushNotification(
                method: "action",
                params: envelope,
                on: serverSide
            )
        }

        let (_, stream) = try await client.subscribe("ahp-session:/s1")
        var iter = stream.makeAsyncIterator()
        let event = try await nextWithTimeout(&iter)
        guard case .action(let envelope) = event else {
            XCTFail("expected an action event, got \(String(describing: event))")
            return
        }
        XCTAssertEqual(envelope.serverSeq, 1)
        XCTAssertEqual(envelope.channel, "ahp-session:/s1")
        guard case .sessionTitleChanged(let action) = envelope.action else {
            XCTFail("unexpected action variant")
            return
        }
        XCTAssertEqual(action.title, "Hello")

        try await serverTask.value
        await client.shutdown()
    }

    // MARK: - events_tap_captures_handshake_notifications

    func testEventsTapCapturesHandshakeNotifications() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)

        // Attach the events tap BEFORE connect so the receive loop has a
        // continuation to deliver into. This is the contract that guards
        // against the bug PR 1 caught (handshake notifications dropped when
        // the events stream isn't attached early).
        let events = await client.events
        var eventIter = events.makeAsyncIterator()

        try await client.connect()

        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "initialize")
            let result = InitializeResult(
                protocolVersion: "0.2.0",
                serverSeq: 0,
                snapshots: []
            )
            try await respond(to: request.id, with: result, on: serverSide)

            // Push a protocol notification *during* the handshake window.
            let params = SessionAddedParams(
                channel: RootResourceURI,
                summary: SessionSummary(
                    provider: "test",
                    title: "T",
                    status: .idle,
                    resource: "ahp-session:/s1",
                    createdAt: "1970-01-01T00:00:00.001Z",
                    modifiedAt: "1970-01-01T00:00:00.001Z"
                )
            )
            try await pushNotification(
                method: "root/sessionAdded",
                params: params,
                on: serverSide
            )
        }

        _ = try await client.initialize(
            clientId: "test-client",
            protocolVersions: ["0.2.0"],
            initialSubscriptions: []
        )

        let event = try await nextWithTimeout(&eventIter)
        guard let event else {
            XCTFail("events stream finished before delivering the notification")
            return
        }
        XCTAssertEqual(event.resource, RootResourceURI, "session-added notifications carry the root channel")
        guard case .sessionAdded = event.event else {
            XCTFail("expected sessionAdded notification, got \(event.event)")
            return
        }

        try await serverTask.value
        await client.shutdown()
    }

    func testAutomationCatalogueActionsDispatchToSubscriptionsAndEvents() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        let events = await client.events
        let subscription = await client.attachSubscription("ahp-automations://")
        try await client.connect()

        let resource = "ahp-automation:/a1"

        let serverTask = Task {
            try await pushNotification(
                method: "action",
                params: ActionEnvelope(
                    channel: "ahp-automations://",
                    action: .automationRemoved(AutomationRemovedAction(
                        type: .automationRemoved,
                        resource: resource
                    )),
                    serverSeq: 1
                ),
                on: serverSide
            )
        }

        var subscriptionIter = subscription.makeAsyncIterator()
        let event = try await nextWithTimeout(&subscriptionIter)
        guard case .action(let envelope) = event,
              case .automationRemoved(let removed) = envelope.action else {
            XCTFail("expected automation/removed action, got \(String(describing: event))")
            return
        }
        XCTAssertEqual(removed.resource, resource)

        var eventIter = events.makeAsyncIterator()
        let nextEvent = try await nextWithTimeout(&eventIter)
        let clientEvent = try XCTUnwrap(nextEvent)
        XCTAssertEqual(clientEvent.resource, "ahp-automations://")
        guard case .action(let envelope) = clientEvent.event,
              case .automationRemoved(let removed) = envelope.action else {
            XCTFail("expected automation/removed client event")
            return
        }
        XCTAssertEqual(removed.resource, resource)

        try await serverTask.value
        await client.shutdown()
    }

    // MARK: - unexpected_close_fails_pending_requests

    func testUnexpectedCloseFailsPendingRequests() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        // Server side closes before responding.
        let serverTask = Task {
            // Wait for the request to arrive but don't reply.
            _ = try await readRequest(from: serverSide, expectedMethod: "initialize")
            try await serverSide.close()
        }

        do {
            _ = try await client.initialize(
                clientId: "test-client",
                protocolVersions: ["0.2.0"],
                initialSubscriptions: []
            )
            XCTFail("expected an error from initialize")
        } catch let error as AHPClientError {
            switch error {
            case .shutdown, .transport:
                break
            default:
                XCTFail("expected .shutdown or .transport, got \(error)")
            }
        }

        try await serverTask.value
        await client.shutdown()
    }

    // MARK: - unsubscribe_drops_per_uri_stream

    func testUnsubscribeFinishesPerUriStream() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let stream = await client.attachSubscription("ahp-session:/s1")

        // Server task: drain the unsubscribe notification so the writer
        // doesn't park forever when the test ends.
        let serverTask = Task {
            _ = try await readNotification(from: serverSide, expectedMethod: "unsubscribe")
        }

        try await client.unsubscribe("ahp-session:/s1")

        // Drain the stream: it should finish cleanly.
        var collected: [SubscriptionEvent] = []
        for await event in stream {
            collected.append(event)
        }
        XCTAssertTrue(collected.isEmpty, "expected stream to finish without delivering events")

        try await serverTask.value
        await client.shutdown()
    }

    func testUnsubscribeFinishesAllStreamsForUri() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let firstStream = await client.attachSubscription("ahp-session:/s1")
        let secondStream = await client.attachSubscription("ahp-session:/s1")

        let serverTask = Task {
            _ = try await readNotification(from: serverSide, expectedMethod: "unsubscribe")
        }

        try await client.unsubscribe("ahp-session:/s1")

        var firstIter = firstStream.makeAsyncIterator()
        let firstEvent = try await nextWithTimeout(&firstIter)
        XCTAssertNil(firstEvent)

        var secondIter = secondStream.makeAsyncIterator()
        let secondEvent = try await nextWithTimeout(&secondIter)
        XCTAssertNil(secondEvent)

        try await serverTask.value
        await client.shutdown()
    }

    // MARK: - shutdown finishes streams

    func testShutdownTerminatesAllStreams() async throws {
        let (clientSide, _) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let events = await client.events
        let stateChanges = await client.stateChanges
        let subStream = await client.attachSubscription("ahp-session:/s1")

        await client.shutdown()

        var subCollected = 0
        for await _ in subStream { subCollected += 1 }
        XCTAssertEqual(subCollected, 0)

        var eventsCollected = 0
        for await _ in events { eventsCollected += 1 }
        XCTAssertEqual(eventsCollected, 0)

        // stateChanges receives a final `.disconnected` then finishes.
        var lastState: ConnectionState?
        for await state in stateChanges {
            lastState = state
        }
        XCTAssertEqual(lastState, .disconnected)
    }

    // MARK: - subscribe failure cleans up the listener

    func testSubscribeFailureCleansUpListener() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        // Server task: respond to `subscribe` with a JSON-RPC error.
        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "subscribe")
            let dict: [String: Any] = [
                "jsonrpc": "2.0",
                "id": request.id,
                "error": [
                    "code": -32602,
                    "message": "no such resource",
                ] as [String: Any],
            ]
            let bytes = try JSONSerialization.data(withJSONObject: dict)
            try await serverSide.send(.text(String(data: bytes, encoding: .utf8)!))
        }

        do {
            _ = try await client.subscribe("ahp-session:/missing")
            XCTFail("expected an RPC error")
        } catch let error as AHPClientError {
            guard case .rpc(let code, _, _) = error else {
                XCTFail("expected .rpc, got \(error)")
                return
            }
            XCTAssertEqual(code, -32602)
        }

        try await serverTask.value

        // The listener attached optimistically by `subscribe` must have been
        // removed when the request failed. Otherwise it would accumulate
        // unread events forever (the consumer never received the stream).
        let count = await client._listenerCount(forUri: "ahp-session:/missing")
        XCTAssertEqual(count, 0, "subscribe failure should clean up its listener")

        // The pending continuation should also have been cleared.
        let pendingCount = await client._pendingCount()
        XCTAssertEqual(pendingCount, 0, "errored request must clear its pending entry")

        await client.shutdown()
    }

    // MARK: - dispatch supports caller-owned clientSeq

    func testDispatchCanUseExplicitClientSeq() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let action = StateAction.sessionTitleChanged(SessionTitleChangedAction(
            type: .sessionTitleChanged,
            title: "From app outbox"
        ))

        let serverTask = Task {
            let first = try await readDispatchNotification(from: serverSide)
            XCTAssertEqual(first.clientSeq, 42)
            XCTAssertEqual(first.channel, "ahp-session:/s1")

            let second = try await readDispatchNotification(from: serverSide)
            XCTAssertEqual(second.clientSeq, 43)
            XCTAssertEqual(second.channel, "ahp-session:/s1")
        }

        let explicit = try await client.dispatch(action, channel: "ahp-session:/s1", clientSeq: 42)
        XCTAssertEqual(explicit.clientSeq, 42)

        let automatic = try await client.dispatch(action, channel: "ahp-session:/s1")
        XCTAssertEqual(automatic.clientSeq, 43)

        try await serverTask.value
        await client.shutdown()
    }

    // MARK: - keepalive

    func testKeepAlivePingsCapableTransport() async throws {
        let transport = PingCountingTransport()
        let client = AHPClient(
            transport: transport,
            config: AHPClientConfig(keepAlive: .enabled(
                interval: .milliseconds(10),
                timeout: .milliseconds(10)
            ))
        )

        try await client.connect()
        await waitUntil { await transport.pingCount() >= 2 }

        await client.shutdown()
    }

    func testKeepAliveDisabledDoesNotPing() async throws {
        let transport = PingCountingTransport()
        let client = AHPClient(transport: transport, config: AHPClientConfig(keepAlive: .disabled))

        try await client.connect()
        try? await Task.sleep(for: .milliseconds(50))

        let pingCount = await transport.pingCount()
        XCTAssertEqual(pingCount, 0)

        await client.shutdown()
    }

    func testKeepAliveFailureDisconnectsClient() async throws {
        let transport = PingCountingTransport(failPing: true)
        let client = AHPClient(
            transport: transport,
            config: AHPClientConfig(keepAlive: .enabled(
                interval: .milliseconds(10),
                timeout: .milliseconds(10)
            ))
        )

        try await client.connect()
        await waitUntil { await client.connectionState == .disconnected }

        let closeCount = await transport.closeCount()
        XCTAssertEqual(closeCount, 1)
    }


    // MARK: - request_throws_cancellation_when_task_is_cancelled

    /// When the surrounding `Task` is cancelled while a
    /// `request` is in flight (server hasn't responded yet), the call
    /// throws `CancellationError()` and the pending entry is removed.
    func testRequestThrowsCancellationWhenTaskIsCancelled() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        // Server: drain the request frame but never respond.
        let serverDrain = Task {
            _ = try? await serverSide.recv()
        }

        // Start a child Task issuing the request, then cancel it.
        let requestTask = Task {
            do {
                let _: InitializeResult = try await client.request(
                    method: "initialize",
                    params: InitializeParams(
                        channel: RootResourceURI,
                        protocolVersions: ["0.1.0"],
                        clientId: "test"
                    )
                )
                return Result<Void, Error>.success(())
            } catch {
                return Result<Void, Error>.failure(error)
            }
        }

        // Give the request a moment to register the pending entry and
        // push the wire bytes.
        try await Task.sleep(for: .milliseconds(50))
        let pendingBefore = await client._pendingCount()
        XCTAssertEqual(pendingBefore, 1, "request should be in flight before cancel")

        requestTask.cancel()
        let outcome = await requestTask.value
        switch outcome {
        case .success:
            XCTFail("expected cancellation to surface, got success")
        case .failure(let error):
            XCTAssertTrue(error is CancellationError,
                          "expected CancellationError, got \(type(of: error)): \(error)")
        }
        let pendingAfter = await client._pendingCount()
        XCTAssertEqual(pendingAfter, 0,
                       "cancellation should clean up the pending entry")

        await client.shutdown()
        _ = await serverDrain.value
    }

    // MARK: - request_fast_fails_when_task_already_cancelled

    /// If the surrounding `Task` is already cancelled before
    /// `request` is awaited, the method fast-fails with
    /// `CancellationError()` without minting a request id or pushing
    /// wire bytes.
    func testRequestFastFailsWhenTaskAlreadyCancelled() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        // Drain anything on the server side just in case.
        let serverDrain = Task {
            while let _ = try? await serverSide.recv() {}
        }

        let outerTask = Task {
            // Sleep so we have time to externally cancel the task before
            // the request call is reached.
            try? await Task.sleep(for: .milliseconds(100))
            do {
                let _: InitializeResult = try await client.request(
                    method: "initialize",
                    params: InitializeParams(
                        channel: RootResourceURI,
                        protocolVersions: ["0.1.0"],
                        clientId: "test"
                    )
                )
                return Result<Void, Error>.success(())
            } catch {
                return Result<Void, Error>.failure(error)
            }
        }

        // Cancel the task BEFORE its sleep completes.
        try await Task.sleep(for: .milliseconds(20))
        outerTask.cancel()

        let outcome = await outerTask.value
        switch outcome {
        case .success:
            XCTFail("expected cancellation to surface, got success")
        case .failure(let error):
            XCTAssertTrue(error is CancellationError,
                          "expected CancellationError, got \(type(of: error)): \(error)")
        }
        let pendingCount = await client._pendingCount()
        XCTAssertEqual(pendingCount, 0,
                       "fast-fail path should not register a pending entry")

        await client.shutdown()
        serverDrain.cancel()
        _ = await serverDrain.value
    }

    // MARK: - request_completes_normally_when_not_cancelled

    /// Regression: cancellation support must not break the happy-path
    /// where the server responds before any cancellation.
    func testRequestCompletesNormallyWhenNotCancelled() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "initialize")
            let result = InitializeResult(
                protocolVersion: "0.1.0",
                serverSeq: 0,
                snapshots: []
            )
            try await respond(to: request.id, with: result, on: serverSide)
        }

        let result: InitializeResult = try await client.request(
            method: "initialize",
            params: InitializeParams(
                channel: RootResourceURI,
                protocolVersions: ["0.1.0"],
                clientId: "test"
            )
        )
        XCTAssertEqual(result.serverSeq, 0)
        try await serverTask.value
        let pendingCount = await client._pendingCount()
        XCTAssertEqual(pendingCount, 0)

        await client.shutdown()
    }

    // MARK: - request_raw_round_trips_json

    /// `requestRaw` accepts and returns raw JSON `Data`, useful
    /// as an escape hatch for extension RPCs whose params types can't
    /// satisfy `Sendable` (e.g. Swift 6 default-isolation interaction).
    func testRequestRawRoundTripsJSON() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "extensions/echo")
            // Echo a static JSON blob back as the result.
            let resultJSON: [String: Any] = ["echoed": true, "n": 7]
            let respDict: [String: Any] = [
                "jsonrpc": "2.0",
                "id": request.id,
                "result": resultJSON,
            ]
            let bytes = try JSONSerialization.data(withJSONObject: respDict)
            try await serverSide.send(.text(String(data: bytes, encoding: .utf8)!))
        }

        let paramsBytes = try JSONSerialization.data(
            withJSONObject: ["greeting": "hi"] as [String: Any]
        )
        let resultBytes = try await client.requestRaw(
            method: "extensions/echo",
            paramsData: paramsBytes
        )
        let resultObj = try JSONSerialization.jsonObject(with: resultBytes) as? [String: Any]
        XCTAssertEqual(resultObj?["echoed"] as? Bool, true)
        XCTAssertEqual(resultObj?["n"] as? Int, 7)

        try await serverTask.value
        await client.shutdown()
    }


    func testResourceReadSendWrapperTargetsRootChannel() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "resourceRead")
            let paramsCodable = try XCTUnwrap(request.params)
            let paramsData = try JSONEncoder().encode(paramsCodable)
            let params = try JSONDecoder().decode(ResourceReadParams.self, from: paramsData)
            // The wrapper must force the root channel regardless of caller input.
            XCTAssertEqual(params.channel, RootResourceURI)
            XCTAssertEqual(params.uri, "ahp-resource:/notes.txt")
            try await respond(
                to: request.id,
                with: ResourceReadResult(data: "hi", encoding: .utf8),
                on: serverSide
            )
        }

        let result = try await client.resourceRead(
            ResourceReadParams(channel: "", uri: "ahp-resource:/notes.txt")
        )
        XCTAssertEqual(result.data, "hi")
        XCTAssertEqual(result.encoding, .utf8)

        try await serverTask.value
        await client.shutdown()
    }

    func testCompletionsSendWrapperPreservesChannel() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "completions")
            let paramsCodable = try XCTUnwrap(request.params)
            let paramsData = try JSONEncoder().encode(paramsCodable)
            let params = try JSONDecoder().decode(CompletionsParams.self, from: paramsData)
            // The wrapper must preserve the caller-supplied chat channel.
            XCTAssertEqual(params.channel, "ahp-chat:/abc")
            XCTAssertEqual(params.kind, .userMessage)
            XCTAssertEqual(params.text, "look at @foo")
            XCTAssertEqual(params.offset, 12)
            try await respond(
                to: request.id,
                with: CompletionsResult(items: []),
                on: serverSide
            )
        }

        let result = try await client.completions(
            CompletionsParams(channel: "ahp-chat:/abc", kind: .userMessage, text: "look at @foo", offset: 12)
        )
        XCTAssertEqual(result.items.count, 0)

        try await serverTask.value
        await client.shutdown()
    }

    func testSessionConfigCompletionsSendWrapperTargetsRootChannel() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        let serverTask = Task {
            let request = try await readRequest(from: serverSide, expectedMethod: "sessionConfigCompletions")
            let paramsCodable = try XCTUnwrap(request.params)
            let paramsData = try JSONEncoder().encode(paramsCodable)
            let params = try JSONDecoder().decode(SessionConfigCompletionsParams.self, from: paramsData)
            // The wrapper must force the root channel regardless of caller input.
            XCTAssertEqual(params.channel, RootResourceURI)
            XCTAssertEqual(params.property, "baseBranch")
            XCTAssertEqual(params.query, "ma")
            try await respond(
                to: request.id,
                with: SessionConfigCompletionsResult(items: [
                    SessionConfigValueItem(value: "main", label: "main", description: nil),
                ]),
                on: serverSide
            )
        }

        let result = try await client.sessionConfigCompletions(
            SessionConfigCompletionsParams(channel: "", property: "baseBranch", query: "ma")
        )
        XCTAssertEqual(result.items.first?.value, "main")

        try await serverTask.value
        await client.shutdown()
    }

    func testInboundResourceRequestRoutesToTypedHandler() async throws {
        let (clientSide, serverSide) = InMemoryTransport.pair()
        let client = AHPClient(transport: clientSide)
        try await client.connect()

        await client.setResourceRequestHandlers(ResourceRequestHandlers(
            onResourceRead: { params in
                XCTAssertEqual(params.uri, "ahp-resource:/from-server.txt")
                return ResourceReadResult(data: "server-data", encoding: .utf8)
            }
        ))

        // A registered method is answered by the typed handler.
        let readReq = JsonRpcMessage.request(
            id: 100,
            method: "resourceRead",
            params: AnyCodable([
                "channel": "ahp-root://",
                "uri": "ahp-resource:/from-server.txt",
            ])
        )
        try await serverSide.send(TransportMessage.encoded(readReq))

        let readReply = try await readParsed(from: serverSide)
        guard case .successResponse(let id, let result) = readReply else {
            return XCTFail("expected successResponse, got \(readReply)")
        }
        XCTAssertEqual(id, 100)
        let resultData = try JSONEncoder().encode(result)
        let decoded = try JSONDecoder().decode(ResourceReadResult.self, from: resultData)
        XCTAssertEqual(decoded.data, "server-data")

        // An unregistered method falls through to MethodNotFound.
        let writeReq = JsonRpcMessage.request(
            id: 101,
            method: "resourceWrite",
            params: AnyCodable([
                "channel": "ahp-root://",
                "uri": "ahp-resource:/x.txt",
                "data": "y",
                "encoding": "utf-8",
            ])
        )
        try await serverSide.send(TransportMessage.encoded(writeReq))

        let writeReply = try await readParsed(from: serverSide)
        guard case .errorResponse(let errId, let error) = writeReply else {
            return XCTFail("expected errorResponse, got \(writeReply)")
        }
        XCTAssertEqual(errId, 101)
        XCTAssertEqual(error.code, -32601)

        await client.shutdown()
    }

    private func readParsed(from transport: InMemoryTransport) async throws -> JsonRpcMessage {
        guard let raw = try await transport.recv() else {
            throw TestError.unexpectedClose
        }
        return try raw.intoParsed()
    }

    private struct ParsedRequest { let id: Int; let method: String; let params: AnyCodable? }

    private func readRequest(
        from transport: InMemoryTransport,
        expectedMethod: String
    ) async throws -> ParsedRequest {
        guard let raw = try await transport.recv() else {
            throw TestError.unexpectedClose
        }
        let parsed = try raw.intoParsed()
        guard case .request(let id, let method, let params) = parsed else {
            throw TestError.unexpectedMessage("expected request, got \(parsed)")
        }
        XCTAssertEqual(method, expectedMethod)
        if method == "subscribe",
           let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(params)) as? [String: Any],
           let create = object["create"] as? [String: Any] {
            XCTAssertEqual(create["type"] as? String, "tcpConnection")
        }
        return ParsedRequest(id: id, method: method, params: params)
    }

    private func readNotification(
        from transport: InMemoryTransport,
        expectedMethod: String
    ) async throws -> AnyCodable? {
        guard let raw = try await transport.recv() else {
            throw TestError.unexpectedClose
        }
        let parsed = try raw.intoParsed()
        guard case .notification(let method, let params) = parsed else {
            throw TestError.unexpectedMessage("expected notification, got \(parsed)")
        }
        XCTAssertEqual(method, expectedMethod)
        return params
    }

    private func readDispatchNotification(from transport: InMemoryTransport) async throws -> DispatchActionParams {
        guard let params = try await readNotification(from: transport, expectedMethod: "dispatchAction") else {
            throw TestError.unexpectedMessage("dispatchAction notification missing params")
        }
        let data = try JSONEncoder().encode(params)
        return try JSONDecoder().decode(DispatchActionParams.self, from: data)
    }

    private func respond<R: Encodable>(
        to id: Int,
        with result: R,
        on transport: InMemoryTransport
    ) async throws {
        let wire = try makeResponseWire(id: id, result: result)
        try await transport.send(wire)
    }

    private func pushNotification<P: Encodable>(
        method: String,
        params: P,
        on transport: InMemoryTransport
    ) async throws {
        let wire = try makeNotificationWire(method: method, params: params)
        try await transport.send(wire)
    }
}

private enum TestError: Error {
    case unexpectedClose
    case unexpectedMessage(String)
}

private actor PingCountingTransport: AHPKeepAliveTransport {
    private let failPing: Bool
    private var closed = false
    private var pings = 0
    private var closes = 0
    private var recvContinuation: CheckedContinuation<TransportMessage?, Error>?

    init(failPing: Bool = false) {
        self.failPing = failPing
    }

    func send(_ message: TransportMessage) async throws {
        if closed { throw TransportError.closed }
    }

    func recv() async throws -> TransportMessage? {
        if closed { return nil }
        return try await withCheckedThrowingContinuation { continuation in
            recvContinuation = continuation
        }
    }

    func close() async throws {
        guard !closed else { return }
        closed = true
        closes += 1
        recvContinuation?.resume(returning: nil)
        recvContinuation = nil
    }

    func sendPing(timeout: Duration) async throws {
        if closed { throw TransportError.closed }
        pings += 1
        if failPing {
            throw TransportError.io("ping failed")
        }
    }

    func pingCount() -> Int { pings }
    func closeCount() -> Int { closes }
}
