// AnyCodableTests.swift — Tests for AnyCodable NSNumber round-trip encoding.
//
// Regression tests for https://github.com/microsoft/agent-host-protocol/issues/123:
// JSONSerialization produces NSNumber-backed values which previously mis-encoded
// as Bool due to NSNumber bridging to both Bool and Int.

import XCTest
import Foundation
@testable import AgentHostProtocol

final class AnyCodableTests: XCTestCase {

    /// Simulates the receive path: encode a Codable to JSON, deserialize with
    /// JSONSerialization (which produces NSNumber), wrap in AnyCodable, then
    /// re-encode and decode. Asserts the JSON string contains the expected token.
    private func roundTripJSON<T: Codable>(value: T) throws -> String {
        let wireBytes = try JSONEncoder().encode(value)
        let object = try JSONSerialization.jsonObject(with: wireBytes)
        let reEncoded = try JSONEncoder().encode(AnyCodable(object))
        return String(bytes: reEncoded, encoding: .utf8)!
    }

    func testNSNumberIntDoesNotEncodeAsBool() throws {
        struct Payload: Codable { let serverSeq: Int }
        let json = try roundTripJSON(value: Payload(serverSeq: 1))
        XCTAssertTrue(json.contains("\"serverSeq\":1"), "Expected integer 1, got: \(json)")
        XCTAssertFalse(json.contains("true"), "Int 1 must not encode as Bool true, got: \(json)")
    }

    func testNSNumberLargerIntStaysInt() throws {
        struct Payload: Codable { let count: Int }
        let json = try roundTripJSON(value: Payload(count: 42))
        XCTAssertTrue(json.contains("\"count\":42"), "Expected integer 42, got: \(json)")
    }

    func testNSNumberDoubleEncodesAsDouble() throws {
        struct Payload: Codable { let ratio: Double }
        let json = try roundTripJSON(value: Payload(ratio: 1.5))
        XCTAssertTrue(json.contains("\"ratio\":1.5"), "Expected 1.5, got: \(json)")
    }

    func testNSNumberBoolTrueStaysBool() throws {
        struct Payload: Codable { let flag: Bool }
        let json = try roundTripJSON(value: Payload(flag: true))
        XCTAssertTrue(json.contains("\"flag\":true"), "Expected bool true, got: \(json)")
    }

    func testNSNumberBoolFalseStaysBool() throws {
        struct Payload: Codable { let flag: Bool }
        let json = try roundTripJSON(value: Payload(flag: false))
        XCTAssertTrue(json.contains("\"flag\":false"), "Expected bool false, got: \(json)")
    }

    func testNativeSwiftBoolUnchanged() throws {
        let encoded = try JSONEncoder().encode(AnyCodable(true))
        let json = String(bytes: encoded, encoding: .utf8)!
        XCTAssertEqual(json, "true")
    }
}
