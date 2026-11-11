// Generated from types/*.ts — do not edit

import Foundation

/// Current protocol version (SemVer `MAJOR.MINOR.PATCH`).
public let PROTOCOL_VERSION: String = "1.1.0"

/// Every protocol version this package is willing to negotiate,
/// ordered most-preferred-first, independently of the development
/// ``PROTOCOL_VERSION``.
///
/// Pass this list (or a derived `[String]`) as `protocolVersions` on
/// `InitializeParams` so the same client binary can fall back to older
/// protocol versions if the host doesn't accept the newest one.
public let SUPPORTED_PROTOCOL_VERSIONS: [String] = [
    "1.0.0",
    "0.9.0",
]

/// Select the highest offered version in a supported caret range.
/// Nil means the host must send UnsupportedProtocolVersion and close.
/// Malformed versions throw.
public func negotiateProtocolVersion(_ offered: [String]) throws -> String? {
    func parse(_ version: String) throws -> [UInt64] {
        let parts = version.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else {
            throw NSError(domain: "AgentHostProtocol.InvalidProtocolVersion", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid protocol version: \(version)"])
        }
        return try parts.map { part in
            guard !part.isEmpty, !(part.count > 1 && part.first == "0"),
                part.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }),
                let value = UInt64(part) else {
                throw NSError(domain: "AgentHostProtocol.InvalidProtocolVersion", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid protocol version: \(version)"])
            }
            return value
        }
    }
    let baselines = try SUPPORTED_PROTOCOL_VERSIONS.map(parse)
    var selected: String?
    var previous: [UInt64]?
    for version in offered {
        let parts = try parse(version)
        if baselines.contains(where: { base in
            parts[0] == base[0] && (parts[0] > 0 || parts[1] == base[1]) &&
                (parts[0] > 0 || parts[1] > 0 || parts[2] == base[2]) &&
                !parts.lexicographicallyPrecedes(base)
        }) && (previous.map { $0.lexicographicallyPrecedes(parts) } ?? true) {
            selected = version
            previous = parts
        }
    }
    return selected
}
