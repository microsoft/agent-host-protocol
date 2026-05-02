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
    /// The client's protocol version is not supported by the server
    public static let unsupportedProtocolVersion = -32005
    /// The requested content URI does not exist
    public static let contentNotFound = -32006
    /// Authentication required for a protected resource
    public static let authRequired = -32007
    /// The requested file, folder, or URI does not exist
    public static let notFound = -32008
    /// The client is not permitted to access the requested resource
    public static let permissionDenied = -32009
    /// The target resource already exists and the operation does not allow overwriting
    public static let alreadyExists = -32010
}

// MARK: - Error Detail Payloads

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
