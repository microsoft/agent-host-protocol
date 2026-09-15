import Foundation
import XCTest
import AgentHostProtocol

final class FileEditTypesTests: XCTestCase {
    func testTypedFileEditsRoundTrip() throws {
        let side = FileEditSide(
            uri: "file:///workspace/file.txt",
            content: ContentRef(
                uri: "ahp-content:/file",
                sizeHint: 32,
                contentType: "text/plain",
                nonce: "v1"
            )
        )
        let edit = FileEdit(
            before: side,
            after: side,
            diff: FileEditDiffStats(added: 2_147_483_648, removed: 0)
        )
        let original = FileEditCollection(items: [edit])
        let encoded = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(FileEditCollection.self, from: encoded)
        XCTAssertEqual(decoded.items.count, 1)
        let before: FileEditSide = try XCTUnwrap(decoded.items[0].before)
        let after: FileEditSide = try XCTUnwrap(decoded.items[0].after)
        let stats: FileEditDiffStats = try XCTUnwrap(decoded.items[0].diff)
        let added: Int? = stats.added
        XCTAssertEqual(before.uri, side.uri)
        XCTAssertEqual(after.content.uri, "ahp-content:/file")
        XCTAssertEqual(after.content.sizeHint, 32)
        XCTAssertEqual(after.content.contentType, "text/plain")
        XCTAssertEqual(after.content.nonce, "v1")
        XCTAssertEqual(added, 2_147_483_648)
        XCTAssertEqual(stats.removed, 0)
    }

    func testEmptyCollectionPreservesItems() throws {
        let encoded = try JSONEncoder().encode(FileEditCollection(items: []))
        let object = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        )
        XCTAssertEqual(Set(object.keys), Set(["items"]))
        let items = try XCTUnwrap(object["items"] as? [Any])
        XCTAssertTrue(items.isEmpty)
    }
}
