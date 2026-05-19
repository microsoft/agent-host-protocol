// InMemoryTransportTests — basic round-trip and close behaviour for the
// paired in-memory transport.

import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class InMemoryTransportTests: XCTestCase {

    func testPairDeliversMessagesBothDirections() async throws {
        let (a, b) = InMemoryTransport.pair()

        let aToB = TransportMessage.text("a→b")
        try await a.send(aToB)
        let received1 = try await b.recv()
        XCTAssertEqual(stringPayload(of: received1), "a→b")

        let bToA = TransportMessage.text("b→a")
        try await b.send(bToA)
        let received2 = try await a.recv()
        XCTAssertEqual(stringPayload(of: received2), "b→a")
    }

    func testCloseEndsBothPeersRecv() async throws {
        let (a, b) = InMemoryTransport.pair()
        try await a.close()
        let aRecv = try await a.recv()
        let bRecv = try await b.recv()
        XCTAssertNil(aRecv, "a should observe its own close as nil recv")
        XCTAssertNil(bRecv, "b should observe peer close as nil recv")
    }

    func testSendAfterCloseThrows() async throws {
        let (a, _) = InMemoryTransport.pair()
        try await a.close()
        do {
            try await a.send(.text("doomed"))
            XCTFail("expected closed error")
        } catch let error as TransportError {
            XCTAssertEqual(error, .closed)
        }
    }

    func testTransportMessageRoundTripEncodingPreservesNotification() throws {
        let original = JsonRpcMessage.notification(
            method: "ping",
            params: AnyCodable(["k": "v"])
        )
        let encoded = try TransportMessage.encode(original)
        let parsed = try encoded.intoParsed()
        guard case .notification(let method, let params) = parsed else {
            XCTFail("expected notification, got \(parsed)")
            return
        }
        XCTAssertEqual(method, "ping")
        XCTAssertEqual(params, AnyCodable(["k": "v"]))
    }

    func testTransportMessageRoundTripPreservesSuccessResponse() throws {
        let original = JsonRpcMessage.successResponse(
            id: 42,
            result: AnyCodable(["ok": true])
        )
        let encoded = try TransportMessage.encode(original)
        let parsed = try encoded.intoParsed()
        guard case .successResponse(let id, let result) = parsed else {
            XCTFail("expected successResponse, got \(parsed)")
            return
        }
        XCTAssertEqual(id, 42)
        XCTAssertEqual(result, AnyCodable(["ok": true]))
    }

    func testTransportMessageRoundTripPreservesErrorResponse() throws {
        let original = JsonRpcMessage.errorResponse(
            id: 7,
            error: JsonRpcError(code: -32000, message: "boom", data: nil)
        )
        let encoded = try TransportMessage.encode(original)
        let parsed = try encoded.intoParsed()
        guard case .errorResponse(let id, let error) = parsed else {
            XCTFail("expected errorResponse, got \(parsed)")
            return
        }
        XCTAssertEqual(id, 7)
        XCTAssertEqual(error.code, -32000)
        XCTAssertEqual(error.message, "boom")
    }

    func testTransportMessageRoundTripPreservesRequest() throws {
        let original = JsonRpcMessage.request(
            id: 1,
            method: "subscribe",
            params: AnyCodable(["channel": "ahp-root://"])
        )
        let encoded = try TransportMessage.encode(original)
        let parsed = try encoded.intoParsed()
        guard case .request(let id, let method, let params) = parsed else {
            XCTFail("expected request, got \(parsed)")
            return
        }
        XCTAssertEqual(id, 1)
        XCTAssertEqual(method, "subscribe")
        XCTAssertEqual(params, AnyCodable(["channel": "ahp-root://"]))
    }

    private func stringPayload(of message: TransportMessage?) -> String? {
        guard let message else { return nil }
        switch message {
        case .text(let s): return s
        case .binary(let d): return String(data: d, encoding: .utf8)
        case .parsed: return nil
        }
    }
}

final class AHPClientConfigTests: XCTestCase {

    func testSubscriptionBufferSizeClampsToOne() {
        let config = AHPClientConfig(subscriptionBufferSize: 0)
        XCTAssertEqual(config.subscriptionBufferSize, 1)
    }

    func testSubscriptionBufferSizeClampsNegativeToOne() {
        let config = AHPClientConfig(subscriptionBufferSize: -42)
        XCTAssertEqual(config.subscriptionBufferSize, 1)
    }

    func testSubscriptionBufferSizePreservesPositive() {
        let config = AHPClientConfig(subscriptionBufferSize: 64)
        XCTAssertEqual(config.subscriptionBufferSize, 64)
    }

    func testDefaultsAreReasonable() {
        let config = AHPClientConfig.default
        XCTAssertEqual(config.subscriptionBufferSize, 256)
        XCTAssertEqual(config.requestTimeout, .seconds(30))
        XCTAssertEqual(config.keepAlive, .disabled)
    }
}
