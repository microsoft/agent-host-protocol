import Foundation

private struct DynamicCodingKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }

    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

func decodeUnknownMembers(from decoder: Decoder, known: Set<String>) throws -> [String: AnyCodable] {
    let container = try decoder.container(keyedBy: DynamicCodingKey.self)
    var extra: [String: AnyCodable] = [:]
    for key in container.allKeys where !known.contains(key.stringValue) {
        extra[key.stringValue] = try container.decode(AnyCodable.self, forKey: key)
    }
    return extra
}

func encodeUnknownMembers(_ extra: [String: AnyCodable], to encoder: Encoder, known: Set<String>) throws {
    var container = encoder.container(keyedBy: DynamicCodingKey.self)
    for (key, value) in extra where !known.contains(key) {
        try container.encode(value, forKey: DynamicCodingKey(stringValue: key))
    }
}
