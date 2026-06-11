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
        // clients/swift/AgentHostProtocol/Tests/AgentHostProtocolTests/FixtureDrivenReducerTests.swift
        // → repo root → types/test-cases/reducers/
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent() // remove FixtureDrivenReducerTests.swift
            .deletingLastPathComponent() // remove AgentHostProtocolTests/
            .deletingLastPathComponent() // remove Tests/
            .deletingLastPathComponent() // remove AgentHostProtocol/
            .deletingLastPathComponent() // remove swift/
            .deletingLastPathComponent() // remove clients/
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

    // MARK: - Known reducer gaps (documented, not silent)
    //
    // Uses an explicit known-gap set + exact-match drift tripwire: a fixture may
    // only be skipped if its stem is listed here, and the gap set must be EXACTLY
    // the set of fixtures that actually fail to run. If a gap closes, the hit set
    // shrinks → mismatch → this test fails loudly, forcing the list to be updated.
    // An UNLISTED fixture that fails to run lands in `failures` → loud. There is
    // no bare `continue` skip.
    //
    // Five of the six reducer arms are implemented (root / session / terminal /
    // changeset / resourceWatch). One kind of gap remains:
    //
    // Unimplemented-channel gap — the `annotations` channel (fixtures 210–219)
    //    has no Swift reducer yet; `runFixture` hits the `default` arm and throws
    //    `unsupportedReducer("annotations")`. (The canonical fixture-driven test
    //    on the base before this rewrite simply skipped the `annotations` reducer
    //    family with a bare `continue`; here that skip is made explicit and
    //    tripwired instead.) When `annotationsReducer` lands, these stems decode
    //    + assert and the drift tripwire forces them out of this set.
    //
    // The former representational gap (fixture 103 — a delta carrying a part with
    // an unknown `kind`) is now CLOSED: the generated types gained a forward-compat
    // `unknown` fallback (the round-trip-corpus fidelity work), so 103 decodes +
    // asserts for real and has been removed from the set below — exactly the
    // outcome the tripwire above was written to force.
    private static let knownReducerGaps: Set<String> = [
        "210-annotations-set-appends-new-annotation",
        "211-annotations-set-replaces-existing-annotation",
        "212-annotations-removed-drops-matching-annotation",
        "213-annotations-entryset-appends-and-replaces",
        "214-annotations-entryset-unknown-annotation-is-no-op",
        "215-annotations-entryremoved-drops-matching-entry",
        "216-annotations-updated-resolves-and-preserves-entries",
        "217-annotations-unknown-action-type-is-no-op",
        "218-annotations-updated-reanchors-turn-and-range",
        "219-annotations-updated-unknown-annotation-is-no-op",
    ]

    func testAllFixtures() throws {
        var failures: [(file: String, description: String, message: String)] = []
        var gapHits: Set<String> = []
        var ranRealAssertions = 0

        for (file, fixture) in Self.fixtures {
            let stem = (file as NSString).deletingPathExtension
            do {
                try runFixture(file: file, fixture: fixture)
                ranRealAssertions += 1
            } catch {
                if Self.knownReducerGaps.contains(stem) {
                    gapHits.insert(stem)
                    print("⊘ \(file): known Swift reducer gap — \(error)")
                } else {
                    failures.append((file, fixture.description, "\(error)"))
                }
            }
        }

        // Every fixture NOT in the gap set must have run a real assertion.
        let expectedReal = Self.fixtures.count - Self.knownReducerGaps.count
        XCTAssertEqual(
            ranRealAssertions, expectedReal,
            "Expected \(expectedReal) fixtures to decode+assert for real; only \(ranRealAssertions) did."
        )

        // The gap set must be exactly the fixtures that failed to run. If a gap
        // closes, gapHits shrinks → mismatch → update the list. If a new fixture
        // can't run, it lands in `failures` → loud.
        XCTAssertEqual(
            gapHits, Self.knownReducerGaps,
            "Known-gap set drifted. Hit gaps: \(gapHits.sorted()); declared: \(Self.knownReducerGaps.sorted()). A gap that no longer reproduces must be removed from knownReducerGaps (and ideally promoted to a real assertion)."
        )

        if !failures.isEmpty {
            let summary = failures.map { "  ✗ \($0.file): \($0.description)\n    \($0.message)" }
                .joined(separator: "\n")
            XCTFail("\(failures.count) fixture(s) failed:\n\(summary)")
        }
    }

    /// Asserts that the previously-skipped reducer families now actually run.
    /// This is a falsification guard: if a future change re-introduces a blanket
    /// skip (e.g. by removing a reducer arm), the per-family count drops and this
    /// test fails — the bug that left ~32 fixtures unverified cannot silently
    /// return.
    func testPreviouslySkippedReducersNowRun() throws {
        // The three reducer families that were skipped via a bare `continue`
        // before changeset/resourceWatch were ported and terminal was un-skipped.
        // At least this many fixtures must run for each — pins the coverage jump
        // so the skip cannot silently return. Asserted as a lower bound so the
        // corpus can grow without churning this test.
        let minFamilyCounts = ["terminal": 19, "changeset": 11, "resourceWatch": 2]
        var totalRan = 0
        for (family, minCount) in minFamilyCounts {
            let familyFixtures = Self.fixtures.filter { $0.fixture.reducer == family }
            XCTAssertGreaterThanOrEqual(
                familyFixtures.count, minCount,
                "Expected at least \(minCount) \(family) fixtures; found \(familyFixtures.count) at \(Self.fixtureDir.path)."
            )
            for (file, fixture) in familyFixtures {
                XCTAssertNoThrow(
                    try runFixture(file: file, fixture: fixture),
                    "\(family) fixture \(file) (\(fixture.description)) must decode + assert; it was previously skipped."
                )
            }
            totalRan += familyFixtures.count
        }
        print("Previously-skipped reducer fixtures now running: \(totalRan) (terminal/changeset/resourceWatch).")
        XCTAssertGreaterThanOrEqual(totalRan, 32)
    }

    private func runFixture(file: String, fixture: Fixture) throws {
        let actions = try {
            let actionsData = try JSONEncoder().encode(fixture.actions)
            return try JSONDecoder().decode([StateAction].self, from: actionsData)
        }()

        switch fixture.reducer {
        case "root":
            try compareFixture(file: file, fixture: fixture, stateType: RootState.self) { state in
                actions.reduce(state) { rootReducer(state: $0, action: $1) }
            }
        case "session":
            try compareFixture(file: file, fixture: fixture, stateType: SessionState.self) { state in
                actions.reduce(state) { sessionReducer(state: $0, action: $1) }
            }
        case "terminal":
            try compareFixture(file: file, fixture: fixture, stateType: TerminalState.self) { state in
                actions.reduce(state) { terminalReducer(state: $0, action: $1) }
            }
        case "changeset":
            try compareFixture(file: file, fixture: fixture, stateType: ChangesetState.self) { state in
                actions.reduce(state) { changesetReducer(state: $0, action: $1) }
            }
        case "resourceWatch":
            try compareFixture(file: file, fixture: fixture, stateType: ResourceWatchState.self) { state in
                actions.reduce(state) { resourceWatchReducer(state: $0, action: $1) }
            }
        case "chat":
            try compareFixture(file: file, fixture: fixture, stateType: ChatState.self) { state in
                actions.reduce(state) { chatReducer(state: $0, action: $1) }
            }
        default:
            throw FixtureError.unsupportedReducer(fixture.reducer)
        }
    }

    // MARK: - Generic Fixture Runner

    /// Decodes the fixture's `initial` through `S`, folds all actions via
    /// `reduce`, decodes `expected` through the same type (normalising the shape
    /// — drops fields Swift doesn't model), then compares both as sorted-key JSON.
    ///
    /// Mirrors the Kotlin `FixtureDrivenReducerTest.compareFixture` pattern so the
    /// per-variant arms in `runFixture` are one-liners.
    private func compareFixture<S: Codable>(
        file: String,
        fixture: Fixture,
        stateType: S.Type,
        reduce: (S) -> S
    ) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let decoder = JSONDecoder()

        let initialData = try JSONEncoder().encode(fixture.initial)
        let initialState = try decoder.decode(S.self, from: initialData)
        let finalState = reduce(initialState)

        // Normalize expected through the same Swift type to drop unknown properties
        let expectedData = try JSONEncoder().encode(fixture.expected)
        let expectedState = try decoder.decode(S.self, from: expectedData)

        try assertEqualJSON(
            actual: finalState, expected: expectedState,
            encoder: encoder,
            context: "\(file): \(fixture.description)"
        )
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
