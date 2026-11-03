// Generated from types/*.ts — do not edit

import Foundation

// MARK: - Standard JSON-RPC Error Codes

public enum JsonRpcErrorCodes {
    /// Invalid JSON
    public static let parseError = -32700
    /// Not a valid JSON-RPC request
    public static let invalidRequest = -32600
    /// Unknown method name
    public static let methodNotFound = -32601
    /// Invalid method parameters
    public static let invalidParams = -32602
    /// Unspecified server error
    public static let internalError = -32603
}

// MARK: - AHP Application Error Codes

public enum AhpErrorCodes {
    /// The referenced session URI does not exist
    public static let sessionNotFound = -32001
    /// The requested agent provider is not registered
    public static let providerNotFound = -32002
    /// A session with the given URI already exists
    public static let sessionAlreadyExists = -32003
    /// The operation requires no active turn, but one is in progress
    public static let turnInProgress = -32004
    /// The server cannot speak any of the protocol versions offered by the client in `InitializeParams.protocolVersions`
    public static let unsupportedProtocolVersion = -32005
    // -32006 is intentionally reserved and unassigned.
    /// Authentication required for a protected resource
    public static let authRequired = -32007
    /// The requested file, folder, or URI does not exist
    public static let notFound = -32008
    /// The client is not permitted to access the requested resource
    public static let permissionDenied = -32009
    /// The target resource already exists and the operation does not allow overwriting
    public static let alreadyExists = -32010
    /// A negotiated resource read failed; data is ResourceReadFailedErrorData
    public static let resourceReadFailed = -32013
}

// MARK: - Error Detail Payloads

/// Failure kinds for the negotiated Resource Reads contract.
///
/// Unknown future kinds MUST be treated as a failed read, not as success or
/// permission to retry automatically.
///
/// Stability: 1.0 - Early development.
public enum ResourceReadFailureKind: Codable, Sendable, Equatable {
    /// The receiver does not serve this URI scheme at all. Omission from the
    /// negotiated scheme list is not sufficient: unlisted legacy reads remain valid.
    case unsupportedScheme
    /// The body or encoded response exceeds the receiver's size limit.
    case tooLarge
    /// The read exceeded its deadline.
    case timeout
    /// The receiver cannot admit the read within its bounded capacity.
    case busy
    /// The backing source failed, including an unusable redirect or response.
    case upstream
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "unsupportedScheme": self = .unsupportedScheme
        case "tooLarge": self = .tooLarge
        case "timeout": self = .timeout
        case "busy": self = .busy
        case "upstream": self = .upstream
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .unsupportedScheme: try container.encode("unsupportedScheme")
        case .tooLarge: try container.encode("tooLarge")
        case .timeout: try container.encode("timeout")
        case .busy: try container.encode("busy")
        case .upstream: try container.encode("upstream")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Required `data` for a `ResourceReadFailed` (-32013) error.
///
/// The payload MUST NOT contain backing URLs, credentials, response headers,
/// or raw upstream diagnostics. Existing `AuthRequired`, `PermissionDenied`,
/// `NotFound`, and `InvalidParams` errors retain their meanings.
///
/// Stability: 1.0 - Early development.
public struct ResourceReadFailedErrorData: Codable, Sendable {
    /// Machine-readable reason the read failed.
    public var kind: ResourceReadFailureKind

    public init(
        kind: ResourceReadFailureKind
    ) {
        self.kind = kind
    }
}

public struct AuthRequiredErrorData: Codable, Sendable {
    /// Protected resources that require authentication.
    public var resources: [ProtectedResourceMetadata]

    public init(
        resources: [ProtectedResourceMetadata]
    ) {
        self.resources = resources
    }
}

public struct PermissionDeniedErrorData: Codable, Sendable {
    /// The resource access that, if granted via `resourceRequest`, would unlock
    /// the operation. Omitted when no specific access grant would resolve the
    /// denial (for example, when the resource is fundamentally inaccessible).
    public var request: ResourceRequestParams?

    public init(
        request: ResourceRequestParams? = nil
    ) {
        self.request = request
    }
}

public struct UnsupportedProtocolVersionErrorData: Codable, Sendable {
    /// Protocol versions the server is willing to speak.
    ///
    /// Each entry is either a [SemVer](https://semver.org) `MAJOR.MINOR.PATCH`
    /// string (e.g. `"0.1.0"`) or a [SemVer range](https://semver.org/#spec-item-11)
    /// constraint (e.g. `">=0.1.0 <0.3.0"` or `"^0.2.0"`).
    public var supportedVersions: [String]

    public init(
        supportedVersions: [String]
    ) {
        self.supportedVersions = supportedVersions
    }
}
