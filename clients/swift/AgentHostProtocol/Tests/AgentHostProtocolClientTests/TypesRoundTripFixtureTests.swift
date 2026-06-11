// TypesRoundTripFixtureTests — data-driven wire round-trip parity for Swift.
//
// Loads the SHARED, language-agnostic round-trip corpus under
// types/test-cases/round-trips/*.json and asserts each via REAL Swift Codable
// decode/encode of the corresponding generated wire type.
//
// Each fixture has the shape:
//   { "name": ..., "description": ..., "type": ...,
//     "input": <wire JSON value>,
//     "acceptableOutputs": [ <exactly one canonical re-encoded value> ],
//     "notApplicable": [ <optional list of client names to skip> ] }
//
// The harness decodes `input` with JSONDecoder + the real generated type named
// by `type`, re-encodes with JSONEncoder (.sortedKeys), and asserts the result
// structurally equals acceptableOutputs[0] (key-order-independent, value- and
// key-presence-sensitive). acceptableOutputs MUST have exactly one entry —
// the single intended wire form.
//
// If the fixture carries "notApplicable": ["swift"] (not expected — only the
// TypeScript structural limitation qualifies), the fixture is skipped with a note.
//
// Why this lives in AgentHostProtocolClientTests: JsonRpcMessage ships in the
// AgentHostProtocolClient module, so the four jsonrpc fixtures (008–011) need
// this test target which can import both AgentHostProtocol and
// AgentHostProtocolClient.
//
// Run: swift test (from clients/swift/AgentHostProtocol)
//
// Real-execution: no mocks. Every fixture decodes with JSONDecoder + the real
// generated types and re-encodes with JSONEncoder.

import XCTest
import Foundation
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class TypesRoundTripFixtureTests: XCTestCase {

    // MARK: - Fixture directory

    private static let fixtureDir: URL = {
        // This file: clients/swift/AgentHostProtocol/Tests/AgentHostProtocolClientTests/TypesRoundTripFixtureTests.swift
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent() // TypesRoundTripFixtureTests.swift
            .deletingLastPathComponent() // AgentHostProtocolClientTests/
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // AgentHostProtocol/
            .deletingLastPathComponent() // swift/
            .deletingLastPathComponent() // clients/
        return repoRoot.appendingPathComponent("types/test-cases/round-trips")
    }()

    private static func fixtureFiles() -> [String] {
        let fm = FileManager.default
        let files = (try? fm.contentsOfDirectory(atPath: fixtureDir.path)) ?? []
        return files.filter { $0.hasSuffix(".json") }.sorted()
    }

    // MARK: - Loaded-something guard

    func testCorpusIsPresent() {
        XCTAssertGreaterThan(
            Self.fixtureFiles().count, 0,
            "No round-trip fixtures found at \(Self.fixtureDir.path). Ensure the checkout includes types/test-cases/round-trips/."
        )
    }

    // MARK: - Whole-corpus runner

    func testRoundTripCorpus() throws {
        var failures: [String] = []
        var ranRealAssertions = 0

        for file in Self.fixtureFiles() {
            let url = Self.fixtureDir.appendingPathComponent(file)
            let data = try Data(contentsOf: url)

            do {
                if try runFixture(file: file, data: data) {
                    ranRealAssertions += 1
                }
            } catch {
                failures.append("✗ \(file): \(error)")
            }
        }

        // ranRealAssertions counts ONLY fixtures that ran a real assertion. A
        // notApplicable-skipped fixture returns false and is not counted, so a
        // corpus that is entirely skipped trips this guard instead of passing.
        XCTAssertGreaterThan(ranRealAssertions, 0, "No fixtures ran real assertions.")

        if !failures.isEmpty {
            XCTFail("\(failures.count) round-trip fixture(s) failed:\n" + failures.joined(separator: "\n"))
        }
    }

    // MARK: - Per-fixture dispatch

    /// Returns `true` if the fixture ran a real assertion, `false` if it was
    /// skipped (legacy notApplicable). Throws on a real failure.
    private func runFixture(file: String, data: Data) throws -> Bool {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw FixtureError.message("\(file): fixture is not a JSON object")
        }
        guard let type = root["type"] as? String else {
            throw FixtureError.message("\(file): missing `type`")
        }
        guard root["input"] != nil else {
            throw FixtureError.message("\(file): missing `input`")
        }
        guard let acceptableOutputs = root["acceptableOutputs"] as? [Any], !acceptableOutputs.isEmpty else {
            throw FixtureError.message("\(file): fixture made no assertions — `acceptableOutputs` is empty or missing")
        }

        // Enforce single canonical form: acceptableOutputs MUST have exactly one entry.
        // Multi-form acceptance sets encode observed-but-wrong divergence as acceptable.
        guard acceptableOutputs.count == 1 else {
            throw FixtureError.message(
                "\(file): acceptableOutputs must have exactly 1 entry (the single canonical re-encoded form); " +
                "got \(acceptableOutputs.count). Multiple entries cement divergence instead of fixing it.")
        }

        // Honor notApplicable: skip this client if listed.
        // Legacy field — new fixtures use group:"B" + preservedOutput instead.
        if let notApplicable = root["notApplicable"] as? [String], notApplicable.contains("swift") {
            print("⊘ \(file): not applicable to swift (legacy notApplicable) — \(root["description"] as? String ?? "")")
            return false // SKIP — not counted as a real assertion
        }

        // Group B: Swift is a runtime-decoder — it drops unknown keys → asserts acceptableOutputs[0].
        // (Group A also asserts acceptableOutputs[0]; the group field only affects the TypeScript harness.)

        // Serialize `input` back to JSON bytes so we can pass them to JSONDecoder.
        let inputAny = root["input"]!
        let inputData = try JSONSerialization.data(withJSONObject: inputAny, options: [.fragmentsAllowed])

        let reencoded = try decodeAndReencode(type: type, inputData: inputData)

        // Assert re-encoded structurally equals the single canonical output.
        let reObj = try JSONSerialization.jsonObject(with: reencoded.data(using: .utf8)!, options: [.fragmentsAllowed])
        if jsonStructurallyEqual(reObj, acceptableOutputs[0]) {
            return true // PASS
        }

        throw FixtureError.message(
            "\(file): re-encoded output does not match the canonical acceptableOutput.\n" +
            "  got:      \(reencoded)\n" +
            "  expected: \(acceptableOutputs[0])")
    }

    // MARK: - Real decode dispatch

    private func decodeAndReencode(type: String, inputData: Data) throws -> String {
        let dec = JSONDecoder()

        func reencode<T: Encodable>(_ value: T) throws -> String {
            let enc = JSONEncoder()
            enc.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
            let out = try enc.encode(value)
            return String(data: out, encoding: .utf8)!
        }

        switch type {
        case "ActionEnvelope":
            return try reencode(dec.decode(ActionEnvelope.self, from: inputData))
        case "StateAction":
            return try reencode(dec.decode(StateAction.self, from: inputData))
        case "Customization":
            return try reencode(dec.decode(Customization.self, from: inputData))
        case "SessionStatus":
            return try reencode(dec.decode(SessionStatus.self, from: inputData))
        case "StringOrMarkdown":
            return try reencode(dec.decode(StringOrMarkdown.self, from: inputData))
        case "JsonRpcMessage":
            return try reencode(dec.decode(JsonRpcMessage.self, from: inputData))
        case "ChangesetOperationTarget":
            return try reencode(dec.decode(ChangesetOperationTarget.self, from: inputData))
        case "ChatInputQuestion":
            return try reencode(dec.decode(ChatInputQuestion.self, from: inputData))
        case "SessionSummary":
            return try reencode(dec.decode(SessionSummary.self, from: inputData))
        case "SessionAddedParams":
            return try reencode(dec.decode(SessionAddedParams.self, from: inputData))
        case "PartialSessionSummary":
            return try reencode(dec.decode(PartialSessionSummary.self, from: inputData))
        default:
            throw FixtureError.message(
                "round-trip fixture: unknown wire type \"\(type)\". Add a decode entry to decodeAndReencode.")
        }
    }

    // MARK: - Structural JSON equality

    /// Compares two JSON values structurally (key-order independent, value- and
    /// key-presence sensitive). Uses JSONSerialization's sortedKeys serialization
    /// to normalize key order before comparing bytes.
    private func jsonStructurallyEqual(_ a: Any, _ b: Any) -> Bool {
        guard
            let ad = try? JSONSerialization.data(withJSONObject: a, options: [.sortedKeys, .fragmentsAllowed]),
            let bd = try? JSONSerialization.data(withJSONObject: b, options: [.sortedKeys, .fragmentsAllowed])
        else { return false }
        return ad == bd
    }

    // MARK: - ProtocolVersion constant tests
    //
    // These checks were previously exercised via corpus fixtures 021–023 (now
    // deleted from the round-trip corpus; moved here as direct assertions).

    func testProtocolVersionConstants() {
        XCTAssertFalse(
            PROTOCOL_VERSION.trimmingCharacters(in: .whitespaces).isEmpty,
            "PROTOCOL_VERSION must be non-empty"
        )
        XCTAssertFalse(
            SUPPORTED_PROTOCOL_VERSIONS.isEmpty,
            "SUPPORTED_PROTOCOL_VERSIONS must be non-empty"
        )
        XCTAssertEqual(
            SUPPORTED_PROTOCOL_VERSIONS.first,
            PROTOCOL_VERSION,
            "first SUPPORTED_PROTOCOL_VERSIONS entry must equal PROTOCOL_VERSION"
        )
    }

    // MARK: - Errors

    private enum FixtureError: Error, CustomStringConvertible {
        case message(String)
        var description: String {
            switch self {
            case .message(let m): return m
            }
        }
    }
}
