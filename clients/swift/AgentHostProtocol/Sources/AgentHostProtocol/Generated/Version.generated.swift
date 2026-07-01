// Generated from types/*.ts — do not edit

import Foundation

/// Current protocol version (SemVer `MAJOR.MINOR.PATCH`).
public let PROTOCOL_VERSION: String = "0.5.1"

/// Every protocol version this package is willing to negotiate,
/// ordered most-preferred-first. The first entry equals
/// ``PROTOCOL_VERSION``.
///
/// Pass this list (or a derived `[String]`) as `protocolVersions` on
/// `InitializeParams` so the same client binary can fall back to older
/// protocol versions if the host doesn't accept the newest one.
public let SUPPORTED_PROTOCOL_VERSIONS: [String] = [
    "0.5.1",
    "0.5.0",
]
