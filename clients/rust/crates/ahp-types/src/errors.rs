// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:rust

#![allow(missing_docs)]

// ─── Standard JSON-RPC Error Codes ─────────────────────────────────────────

/// Standard JSON-RPC 2.0 error codes.
pub mod json_rpc_error_codes {
    /// Invalid JSON.
    pub const PARSE_ERROR: i32 = -32700;
    /// Not a valid JSON-RPC request.
    pub const INVALID_REQUEST: i32 = -32600;
    /// Unknown method name.
    pub const METHOD_NOT_FOUND: i32 = -32601;
    /// Invalid method parameters.
    pub const INVALID_PARAMS: i32 = -32602;
    /// Unspecified server error.
    pub const INTERNAL_ERROR: i32 = -32603;
}

/// AHP application-specific error codes.
pub mod ahp_error_codes {
    /// The referenced session URI does not exist.
    pub const SESSION_NOT_FOUND: i32 = -32001;
    /// The requested agent provider is not registered.
    pub const PROVIDER_NOT_FOUND: i32 = -32002;
    /// A session with the given URI already exists.
    pub const SESSION_ALREADY_EXISTS: i32 = -32003;
    /// The operation requires no active turn, but one is in progress.
    pub const TURN_IN_PROGRESS: i32 = -32004;
    /// The client's protocol version is not supported by the server.
    pub const UNSUPPORTED_PROTOCOL_VERSION: i32 = -32005;
    /// The requested content URI does not exist.
    pub const CONTENT_NOT_FOUND: i32 = -32006;
    /// Authentication required for a protected resource.
    pub const AUTH_REQUIRED: i32 = -32007;
    /// The requested file, folder, or URI does not exist.
    pub const NOT_FOUND: i32 = -32008;
    /// The client is not permitted to access the requested resource.
    pub const PERMISSION_DENIED: i32 = -32009;
    /// The target resource already exists and the operation does not allow overwriting.
    pub const ALREADY_EXISTS: i32 = -32010;
}

/// Type alias: AHP application error code.
pub type AhpErrorCode = i32;
/// Type alias: JSON-RPC 2.0 error code.
pub type JsonRpcErrorCode = i32;
