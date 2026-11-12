// AnyCodable — type-erased Codable wrapper for unknown/Record<string, unknown> values.

import Foundation

/// A type-erased `Codable` value for handling `unknown` and `Record<string, unknown>` types.
///
/// Marked `@unchecked Sendable`: `value` is a `let`, so it cannot be mutated
/// after initialization, and the decoding path only ever stores immutable,
/// `Sendable`-safe types (Bool, Int, Double, String, NSNull, and recursive
/// `[Any]`/`[String: Any]` of those). The public `init(_:)` accepts arbitrary
/// `Any`, so Sendability is unchecked and relies on callers passing
/// `Sendable`-safe values.
public struct AnyCodable: Codable, @unchecked Sendable, Equatable {
    public let value: Any

    public init(_ value: Any) {
        self.value = (value as? AnyCodable)?.value ?? value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self.value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            self.value = bool
        } else if let int = try? container.decode(Int.self) {
            self.value = int
        } else if let double = try? container.decode(Double.self) {
            self.value = double
        } else if let string = try? container.decode(String.self) {
            self.value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            self.value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            self.value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "AnyCodable cannot decode value"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        // Native Swift types are matched first with an exact metatype guard so
        // these arms stay reachable even though Swift also bridges them to NSNumber.
        case let bool as Bool where type(of: value) == Bool.self:
            try container.encode(bool)
        case let int as Int where type(of: value) == Int.self:
            try container.encode(int)
        case let double as Double where type(of: value) == Double.self:
            try container.encode(double)
        case let n as NSNumber:
            // Reached only for NSNumber objects not already matched above (e.g.
            // values produced by JSONSerialization.jsonObject). Use CFTypeID to
            // distinguish booleans, then objCType for float/integral and signed/unsigned.
            if CFGetTypeID(n) == CFBooleanGetTypeID() {
                try container.encode(n.boolValue)
            } else {
                // objCType distinguishes float/double from integral, and signed
                // from unsigned. A JSON integer above Int64.max is boxed as an
                // unsigned NSNumber; int64Value would corrupt it (it does not
                // round-trip), so those encode via uint64Value.
                let objCType = String(cString: n.objCType)
                switch objCType {
                case "f", "d":
                    try container.encode(n.doubleValue)
                case "C", "I", "S", "L", "Q":
                    try container.encode(n.uint64Value)
                default:
                    try container.encode(n.int64Value)
                }
            }
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(codingPath: encoder.codingPath,
                    debugDescription: "AnyCodable cannot encode value of type \(type(of: value))")
            )
        }
    }

    private static func booleanValue(_ value: Any) -> Bool? {
        if type(of: value) == Bool.self { return value as? Bool }
        guard let number = value as? NSNumber,
              CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }

    public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        let lhsBool = booleanValue(lhs.value)
        let rhsBool = booleanValue(rhs.value)
        if lhsBool != nil || rhsBool != nil {
            return lhsBool == rhsBool
        }
        switch (lhs.value, rhs.value) {
        case is (NSNull, NSNull):
            return true
        case let (lhs as Int, rhs as Int):
            return lhs == rhs
        case let (lhs as Double, rhs as Double):
            return lhs == rhs
        case let (lhs as String, rhs as String):
            return lhs == rhs
        case let (lhs as [Any], rhs as [Any]):
            guard lhs.count == rhs.count else { return false }
            return zip(lhs, rhs).allSatisfy {
                ($0 as? AnyCodable ?? AnyCodable($0)) == ($1 as? AnyCodable ?? AnyCodable($1))
            }
        case let (lhs as [String: Any], rhs as [String: Any]):
            guard lhs.count == rhs.count else { return false }
            return lhs.allSatisfy { key, val in
                guard let other = rhs[key] else { return false }
                return (val as? AnyCodable ?? AnyCodable(val)) == (other as? AnyCodable ?? AnyCodable(other))
            }
        default:
            return false
        }
    }
}
