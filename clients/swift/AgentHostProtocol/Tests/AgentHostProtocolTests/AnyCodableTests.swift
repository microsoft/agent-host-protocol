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

    func testNestedAnyCodableEqualitySurvivesRoundTrip() throws {
        let value = AnyCodable([
            "k": AnyCodable(1),
            "items": AnyCodable([AnyCodable(true), AnyCodable("value")]),
        ])
        let decoded = try JSONDecoder().decode(AnyCodable.self, from: JSONEncoder().encode(value))

        XCTAssertEqual(value, value)
        XCTAssertEqual(AnyCodable(value), value)
        XCTAssertEqual(value, decoded)
        XCTAssertEqual(decoded, value)
    }

    func testNSNumberEqualityDistinguishesBooleansFromNumbers() {
        for (number, boolean) in [(NSNumber(value: 0), false), (NSNumber(value: 1), true)] {
            XCTAssertNotEqual(AnyCodable(number), AnyCodable(boolean))
            XCTAssertNotEqual(AnyCodable(boolean), AnyCodable(number))
            XCTAssertNotEqual(AnyCodable(number), AnyCodable(NSNumber(value: boolean)))
            XCTAssertNotEqual(AnyCodable(number.intValue), AnyCodable(NSNumber(value: boolean)))
            XCTAssertEqual(AnyCodable(number), AnyCodable(number.intValue))
            XCTAssertEqual(AnyCodable(NSNumber(value: boolean)), AnyCodable(boolean))
        }
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

    func testNSNumberUnsignedAboveInt64MaxStaysUnsigned() throws {
        // A JSON integer above Int64.max is boxed by JSONSerialization as an
        // unsigned NSNumber. The int64Value fallback would corrupt it; the
        // unsigned objCType arm encodes via uint64Value so it survives.
        struct Payload: Codable { let big: UInt64 }
        let json = try roundTripJSON(value: Payload(big: UInt64(Int64.max) + 1))
        XCTAssertTrue(
            json.contains("\"big\":9223372036854775808"),
            "Unsigned value above Int64.max must survive exactly, got: \(json)"
        )
    }
}
