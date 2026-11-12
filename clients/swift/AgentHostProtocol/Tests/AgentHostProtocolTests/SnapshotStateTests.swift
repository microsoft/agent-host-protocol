import XCTest
import Foundation
import AgentHostProtocol

final class SnapshotStateTests: XCTestCase {
    func testMalformedKnownChannelStateFailsToDecode() {
        let json = #"{"resource":"ahp-session:/s1","state":{"lifecycle":"ready"},"fromSeq":1}"#
        XCTAssertThrowsError(try JSONDecoder().decode(Snapshot.self, from: Data(json.utf8)))
    }

    func testUnknownAndStandaloneStatesRoundTrip() throws {
        for state in [
            #"{"content":[],"lifecycle":"ready","entries":null}"#,
            "{}", "null", "[]", "42", #""state""#,
        ] {
            let json = #"{"resource":"x-ext:/a","state":\#(state),"fromSeq":1}"#
            let data = Data(json.utf8)
            let snapshot = try JSONDecoder().decode(Snapshot.self, from: data)
            guard case .unknown = snapshot.state else {
                return XCTFail("Expected unknown snapshot state")
            }
            XCTAssertEqual(
                try JSONDecoder().decode(AnyCodable.self, from: JSONEncoder().encode(snapshot)),
                try JSONDecoder().decode(AnyCodable.self, from: data)
            )

            let standalone = try JSONDecoder().decode(SnapshotState.self, from: Data(state.utf8))
            guard case .unknown = standalone else {
                return XCTFail("Standalone decoding must preserve raw JSON")
            }
            XCTAssertEqual(
                try JSONDecoder().decode(AnyCodable.self, from: JSONEncoder().encode(standalone)),
                try JSONDecoder().decode(AnyCodable.self, from: Data(state.utf8))
            )
        }
    }

    func testTerminalChannelDecodesAsTerminal() throws {
        let json = """
        {"resource":"ahp-terminal:/t1","fromSeq":1,"state":{
            "title":"Shell","content":[],"lifecycle":{"status":"running"},
            "claim":{"kind":"client","clientId":"c1"}
        }}
        """
        let snapshot = try JSONDecoder().decode(Snapshot.self, from: Data(json.utf8))
        guard case .terminal = snapshot.state else {
            return XCTFail("Expected terminal snapshot state")
        }
    }

    func testAnnotationsChannelDecodesAsAnnotations() throws {
        let json = #"{"resource":"ahp-annotations:/s1","state":{"annotations":[]},"fromSeq":1}"#
        let snapshot = try JSONDecoder().decode(Snapshot.self, from: Data(json.utf8))
        guard case .annotations = snapshot.state else {
            return XCTFail("Expected annotations snapshot state")
        }
    }
}
