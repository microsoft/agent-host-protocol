// AHPClientTests — request/response, subscription fan-out, events tap,
// unsubscribe, and shutdown behaviour for `AHPClient`.

import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class AHPClientTests: XCTestCase {

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
                    summary: SessionSummary(
                        resource: "ahp-session:/s1",
                        provider: "test",
                        title: "T",
                        status: .idle,
                        createdAt: 1, modifiedAt: 1
                    ),
                    lifecycle: .ready,
                    turns: []
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
                    resource: "ahp-session:/s1",
                    provider: "test",
                    title: "T",
                    status: .idle,
                    createdAt: 1, modifiedAt: 1
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
