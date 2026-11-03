// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:go

package ahptypes

// ─── Standard JSON-RPC Error Codes ─────────────────────────────────────────

// Standard JSON-RPC 2.0 error codes.
const (
	// ErrorCodeParseError indicates the request body was invalid JSON.
	ErrorCodeParseError int32 = -32700
	// ErrorCodeInvalidRequest indicates the payload was not a valid
	// JSON-RPC request.
	ErrorCodeInvalidRequest int32 = -32600
	// ErrorCodeMethodNotFound indicates the requested method does not
	// exist on the server.
	ErrorCodeMethodNotFound int32 = -32601
	// ErrorCodeInvalidParams indicates the method parameters did not
	// match the declared schema.
	ErrorCodeInvalidParams int32 = -32602
	// ErrorCodeInternalError indicates an unspecified server failure.
	ErrorCodeInternalError int32 = -32603
)

// AHP application-specific error codes (above the JSON-RPC reserved
// range).
const (
	ErrorCodeSessionNotFound            int32 = -32001
	ErrorCodeProviderNotFound           int32 = -32002
	ErrorCodeSessionAlreadyExists       int32 = -32003
	ErrorCodeTurnInProgress             int32 = -32004
	ErrorCodeUnsupportedProtocolVersion int32 = -32005
	// -32006 is intentionally reserved and unassigned.
	ErrorCodeAuthRequired     int32 = -32007
	ErrorCodeNotFound         int32 = -32008
	ErrorCodePermissionDenied int32 = -32009
	ErrorCodeAlreadyExists    int32 = -32010
	// ErrorCodeTcpConnectionOpenFailed indicates that the host could not open a TCP connection.
	ErrorCodeTcpConnectionOpenFailed int32 = -32012
	// ErrorCodeResourceReadFailed carries ResourceReadFailedErrorData.
	ErrorCodeResourceReadFailed int32 = -32013
)

// AhpErrorCode is the type alias used by AHP application error codes.
type AhpErrorCode = int32

// JsonRpcErrorCode is the type alias used by standard JSON-RPC codes.
type JsonRpcErrorCode = int32

// ─── Error Detail Payloads ────────────────────────────────────────────────

// AuthRequiredErrorData is the detail payload of an AuthRequired
// (-32007) error.
type AuthRequiredErrorData struct {
	Resources []ProtectedResourceMetadata `json:"resources"`
}

// PermissionDeniedErrorData is the detail payload of a
// PermissionDenied (-32009) error.
type PermissionDeniedErrorData struct {
	Request *ResourceRequestParams `json:"request,omitempty"`
}

// UnsupportedProtocolVersionErrorData is the detail payload of an
// UnsupportedProtocolVersion (-32005) error.
type UnsupportedProtocolVersionErrorData struct {
	SupportedVersions []string `json:"supportedVersions"`
}

// Failure kinds for the negotiated Resource Reads contract.
//
// Unknown future kinds MUST be treated as a failed read, not as success or
// permission to retry automatically.
//
// Stability: 1.0 - Early development.
type ResourceReadFailureKind string

const (
	// The receiver does not serve this URI scheme at all. Omission from the
	// negotiated scheme list is not sufficient: unlisted legacy reads remain valid.
	ResourceReadFailureKindUnsupportedScheme ResourceReadFailureKind = "unsupportedScheme"
	// The body or encoded response exceeds the receiver's size limit.
	ResourceReadFailureKindTooLarge ResourceReadFailureKind = "tooLarge"
	// The read exceeded its deadline.
	ResourceReadFailureKindTimeout ResourceReadFailureKind = "timeout"
	// The receiver cannot admit the read within its bounded capacity.
	ResourceReadFailureKindBusy ResourceReadFailureKind = "busy"
	// The backing source failed, including an unusable redirect or response.
	ResourceReadFailureKindUpstream ResourceReadFailureKind = "upstream"
)

// Required `data` for a `ResourceReadFailed` (-32013) error.
//
// The payload MUST NOT contain backing URLs, credentials, response headers,
// or raw upstream diagnostics. Existing `AuthRequired`, `PermissionDenied`,
// `NotFound`, and `InvalidParams` errors retain their meanings.
//
// Stability: 1.0 - Early development.
type ResourceReadFailedErrorData struct {
	// Machine-readable reason the read failed.
	Kind ResourceReadFailureKind `json:"kind"`
}
