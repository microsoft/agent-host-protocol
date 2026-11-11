import XCTest
@testable import AgentHostProtocol

final class GeneratedEquatableTests: XCTestCase {
    func testRecursiveSchemaEqualityComparesValuesRatherThanIdentity() {
        func makeSchema() -> ConfigPropertySchema {
            ConfigPropertySchema(
                type: "array", title: "Setting",
                items: ConfigPropertySchema(type: "string", title: "Item"),
                properties: ["nested": ConfigPropertySchema(type: "number", title: "Nested")],
                additionalProperties: ConfigPropertySchema(type: "boolean", title: "Additional")
            )
        }
        let first = makeSchema()
        let second = makeSchema()
        XCTAssertFalse(first === second)
        XCTAssertEqual(first, second)
        XCTAssertEqual(
            ConfigSchema(type: "object", properties: ["setting": first]),
            ConfigSchema(type: "object", properties: ["setting": second])
        )
        second.items?.title = "Changed"
        XCTAssertNotEqual(first, second)
    }
}
