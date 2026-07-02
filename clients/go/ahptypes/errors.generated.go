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
	ErrorCodeContentNotFound            int32 = -32006
	ErrorCodeAuthRequired               int32 = -32007
	ErrorCodeNotFound                   int32 = -32008
	ErrorCodePermissionDenied           int32 = -32009
	ErrorCodeAlreadyExists              int32 = -32010
	ErrorCodeConflict                   int32 = -32011
	ErrorCodeCanvasProviderError        int32 = -32012
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

// CanvasProviderErrorData is the detail payload of a
// CanvasProviderError (-32012) error. The Code is a provider-defined
// string (opaque to AHP) identifying the failure.
type CanvasProviderErrorData struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
