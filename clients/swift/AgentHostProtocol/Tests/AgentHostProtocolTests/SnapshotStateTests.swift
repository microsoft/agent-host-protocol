import XCTest
import Foundation
import AgentHostProtocol

final class SnapshotStateTests: XCTestCase {
    func testMalformedKnownStatesFailToDecode() {
        for json in [
            #"{"lifecycle":"ready","agents":[]}"#,
            #"{"turns":[]}"#,
            #"{"content":[]}"#,
            #"{"automation":"ahp-automation:/a1","origin":{"kind":"manual"},"sessions":[]}"#,
            #"{"entries":null}"#,
            #"{"agents":null}"#,
            #"{"annotations":null}"#,
            #"{"instanceId":"i1","extensionId":"provider","canvasId":42}"#,
            #"{"status":null,"files":[]}"#,
            #"{"root":"file:///workspace","recursive":null}"#,
        ] {
            XCTAssertThrowsError(
                try JSONDecoder().decode(SnapshotState.self, from: Data(json.utf8)),
                "Malformed known state must not fall back to another variant: \(json)"
            )
        }
    }

    func testUnknownStateRoundTrips() throws {
        let json = #"{"futureField":{"items":[1,true,"value"]}}"#
        let state = try JSONDecoder().decode(SnapshotState.self, from: Data(json.utf8))
        guard case .unknown = state else {
            return XCTFail("Expected unknown snapshot state")
        }
        XCTAssertEqual(String(decoding: try JSONEncoder().encode(state), as: UTF8.self), json)
    }

    func testEmptyObjectDecodesAsEmpty() throws {
        let state = try JSONDecoder().decode(SnapshotState.self, from: Data("{}".utf8))
        guard case .empty = state else {
            return XCTFail("Expected empty snapshot state")
        }
        XCTAssertEqual(String(decoding: try JSONEncoder().encode(state), as: UTF8.self), "{}")
    }

    func testNonObjectStatesFailToDecode() {
        for json in ["null", "[]", "42", #""state""#] {
            XCTAssertThrowsError(
                try JSONDecoder().decode(SnapshotState.self, from: Data(json.utf8)),
                "Snapshot state must be an object: \(json)"
            )
        }
    }
}
