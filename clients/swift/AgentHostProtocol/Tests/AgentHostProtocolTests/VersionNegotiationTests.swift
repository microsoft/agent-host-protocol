import Foundation
import XCTest
import AgentHostProtocol

final class VersionNegotiationTests: XCTestCase {
    private struct Case: Decodable {
        let offered: [String]
        let expected: String?
        let invalid: Bool?
    }

    func testSharedCorpus() throws {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { root.deleteLastPathComponent() }
        let data = try Data(contentsOf: root.appendingPathComponent("types/test-cases/version-negotiation.json"))
        let cases = try JSONDecoder().decode([Case].self, from: data)
        XCTAssertFalse(cases.isEmpty)
        for fixture in cases {
            if fixture.invalid == true {
                XCTAssertThrowsError(try negotiateProtocolVersion(fixture.offered))
            } else {
                XCTAssertEqual(try negotiateProtocolVersion(fixture.offered), fixture.expected)
            }
        }
    }
}
