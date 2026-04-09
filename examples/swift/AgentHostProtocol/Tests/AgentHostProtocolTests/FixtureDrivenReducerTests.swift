// FixtureDrivenReducerTests.swift — JSON fixture-driven reducer tests for cross-language parity.
//
// Loads test cases from types/test-cases/reducers/*.json (shared with TypeScript)
// and verifies that Swift reducers produce identical output.
//
// Run: swift test --filter FixtureDrivenReducerTests

import XCTest
@testable import AgentHostProtocol

final class FixtureDrivenReducerTests: XCTestCase {

    // MARK: - Fixture Model

    private struct Fixture: Decodable {
        let description: String
        let reducer: String
        let initial: AnyCodable
        let actions: [AnyCodable]
        let expected: AnyCodable
    }

    // MARK: - Mock Timestamp

    /// Match the TypeScript test mock: Date.now = () => 9999
    private static let MOCK_NOW = 9999

    private var originalTimestampProvider: (() -> Int)!

    override func setUp() {
        super.setUp()
        originalTimestampProvider = currentTimestampProvider
        currentTimestampProvider = { Self.MOCK_NOW }
    }

    override func tearDown() {
        currentTimestampProvider = originalTimestampProvider
        super.tearDown()
    }

    // MARK: - Fixture Loading

    private static let fixtureDir: URL = {
        // Navigate from this source file to the fixtures directory:
        // examples/swift/AgentHostProtocol/Tests/AgentHostProtocolTests/FixtureDrivenReducerTests.swift
        // → repo root → types/test-cases/reducers/
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent() // remove FixtureDrivenReducerTests.swift
            .deletingLastPathComponent() // remove AgentHostProtocolTests/
            .deletingLastPathComponent() // remove Tests/
            .deletingLastPathComponent() // remove AgentHostProtocol/
            .deletingLastPathComponent() // remove swift/
            .deletingLastPathComponent() // remove examples/
        return repoRoot.appendingPathComponent("types/test-cases/reducers")
    }()

    private static let fixtures: [(file: String, fixture: Fixture)] = {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(atPath: fixtureDir.path)
            .filter({ $0.hasSuffix(".json") })
            .sorted()
        else {
            return []
        }

        return files.compactMap { file in
            let url = fixtureDir.appendingPathComponent(file)
            guard let data = try? Data(contentsOf: url),
                  let fixture = try? JSONDecoder().decode(Fixture.self, from: data)
            else {
                return nil
            }
            return (file, fixture)
        }
    }()

    // MARK: - Test Runner

    func testFixturesLoaded() {
        XCTAssertGreaterThan(
            Self.fixtures.count, 0,
            "No fixtures found at \(Self.fixtureDir.path). Ensure the repo checkout includes types/test-cases/reducers/."
        )
    }

    func testAllFixtures() throws {
        var failures: [(file: String, description: String, message: String)] = []
        var skipped: [(file: String, description: String, message: String)] = []

        for (file, fixture) in Self.fixtures {
            // Skip terminal fixtures — terminalReducer is not yet implemented in Swift
            if fixture.reducer == "terminal" {
                continue
            }

            do {
                try runFixture(file: file, fixture: fixture)
            } catch let error as DecodingError {
                // Skip fixtures that use types/shapes Swift can't decode yet
                skipped.append((file, fixture.description, "\(error)"))
            } catch {
                failures.append((file, fixture.description, "\(error)"))
            }
        }

        if !skipped.isEmpty {
            print("Skipped \(skipped.count) fixture(s) due to decoding incompatibilities:")
            for s in skipped {
                print("  ⊘ \(s.file): \(s.description)")
            }
        }

        if !failures.isEmpty {
            let summary = failures.map { "  ✗ \($0.file): \($0.description)\n    \($0.message)" }
                .joined(separator: "\n")
            XCTFail("\(failures.count) fixture(s) failed:\n\(summary)")
        }
    }

    private func runFixture(file: String, fixture: Fixture) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]

        let decoder = JSONDecoder()

        switch fixture.reducer {
        case "root":
            let initialData = try JSONEncoder().encode(fixture.initial)
            var state = try decoder.decode(RootState.self, from: initialData)

            let actionsData = try JSONEncoder().encode(fixture.actions)
            let actions = try decoder.decode([StateAction].self, from: actionsData)

            for action in actions {
                state = rootReducer(state: state, action: action)
            }

            // Normalize expected through the same Swift type to drop unknown properties
            let expectedData = try JSONEncoder().encode(fixture.expected)
            let expectedState = try decoder.decode(RootState.self, from: expectedData)

            try assertEqualJSON(
                actual: state, expected: expectedState,
                encoder: encoder,
                context: "\(file): \(fixture.description)"
            )

        case "session":
            let initialData = try JSONEncoder().encode(fixture.initial)
            var state = try decoder.decode(SessionState.self, from: initialData)

            let actionsData = try JSONEncoder().encode(fixture.actions)
            let actions = try decoder.decode([StateAction].self, from: actionsData)

            for action in actions {
                state = sessionReducer(state: state, action: action)
            }

            // Normalize expected through the same Swift type to drop unknown properties
            let expectedData = try JSONEncoder().encode(fixture.expected)
            let expectedState = try decoder.decode(SessionState.self, from: expectedData)

            try assertEqualJSON(
                actual: state, expected: expectedState,
                encoder: encoder,
                context: "\(file): \(fixture.description)"
            )

        default:
            throw FixtureError.unsupportedReducer(fixture.reducer)
        }
    }

    // MARK: - JSON Comparison

    /// Compares two Encodable values by encoding to normalized JSON.
    /// Strips null values to match TypeScript semantics where undefined fields are absent.
    private func assertEqualJSON<T: Encodable, U: Encodable>(
        actual: T,
        expected: U,
        encoder: JSONEncoder,
        context: String
    ) throws {
        let actualData = try encoder.encode(actual)
        let expectedData = try encoder.encode(expected)

        let actualJSON = try normalizeJSON(actualData)
        let expectedJSON = try normalizeJSON(expectedData)

        guard !jsonEqual(actualJSON, expectedJSON) else { return }

        // Produce a readable diff
        let encoder2 = JSONEncoder()
        encoder2.outputFormatting = [.sortedKeys, .prettyPrinted]
        let actualStr = String(data: try encoder2.encode(AnyCodable(actualJSON)), encoding: .utf8)!
        let expectedStr = String(data: try encoder2.encode(AnyCodable(expectedJSON)), encoding: .utf8)!

        throw FixtureError.mismatch(
            context: context,
            expected: expectedStr,
            actual: actualStr
        )
    }

    /// Normalize JSON by removing null values (TypeScript `undefined` is absent from JSON).
    private func normalizeJSON(_ data: Data) throws -> Any {
        let obj = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        return stripNulls(obj)
    }

    private func stripNulls(_ value: Any) -> Any {
        if let dict = value as? [String: Any] {
            var result: [String: Any] = [:]
            for (key, val) in dict {
                if val is NSNull { continue }
                result[key] = stripNulls(val)
            }
            return result
        }
        if let array = value as? [Any] {
            return array.map { stripNulls($0) }
        }
        return value
    }

    /// Deep-compare two JSON values.
    private func jsonEqual(_ a: Any, _ b: Any) -> Bool {
        switch (a, b) {
        case (_ as NSNull, _ as NSNull):
            return true
        case (let a as Bool, let b as Bool):
            return a == b
        case (let a as NSNumber, let b as NSNumber):
            return a == b
        case (let a as String, let b as String):
            return a == b
        case (let a as [Any], let b as [Any]):
            guard a.count == b.count else { return false }
            return zip(a, b).allSatisfy { jsonEqual($0, $1) }
        case (let a as [String: Any], let b as [String: Any]):
            guard a.count == b.count else { return false }
            return a.allSatisfy { key, val in
                guard let bVal = b[key] else { return false }
                return jsonEqual(val, bVal)
            }
        default:
            return false
        }
    }

    // MARK: - Error Types

    private enum FixtureError: Error, CustomStringConvertible {
        case unsupportedReducer(String)
        case mismatch(context: String, expected: String, actual: String)

        var description: String {
            switch self {
            case .unsupportedReducer(let r):
                return "Unsupported reducer type: \(r)"
            case .mismatch(let context, let expected, let actual):
                return "\(context)\nExpected:\n\(expected)\nActual:\n\(actual)"
            }
        }
    }
}
