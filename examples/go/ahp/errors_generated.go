// Code generated from types/*.ts — DO NOT EDIT.

package ahp

// ── Standard JSON-RPC Error Codes ─────────────────────────────────────────────

const (
	// JSONRPCParseError indicates invalid JSON.
	JSONRPCParseError = -32700
	// JSONRPCInvalidRequest indicates a malformed JSON-RPC request.
	JSONRPCInvalidRequest = -32600
	// JSONRPCMethodNotFound indicates an unknown method name.
	JSONRPCMethodNotFound = -32601
	// JSONRPCInvalidParams indicates invalid method parameters.
	JSONRPCInvalidParams = -32602
	// JSONRPCInternalError indicates an unspecified server error.
	JSONRPCInternalError = -32603
)

// ── AHP Application Error Codes ───────────────────────────────────────────────

const (
	// AHPSessionNotFound indicates the referenced session URI does not exist.
	AHPSessionNotFound = -32001
	// AHPProviderNotFound indicates the requested agent provider is not registered.
	AHPProviderNotFound = -32002
	// AHPSessionAlreadyExists indicates a session with the given URI already exists.
	AHPSessionAlreadyExists = -32003
	// AHPTurnInProgress indicates the operation requires no active turn, but one is in progress.
	AHPTurnInProgress = -32004
	// AHPUnsupportedProtocolVersion indicates the client's protocol version is not supported.
	AHPUnsupportedProtocolVersion = -32005
	// AHPContentNotFound indicates the requested content URI does not exist.
	AHPContentNotFound = -32006
	// AHPAuthRequired indicates authentication is required for a protected resource.
	AHPAuthRequired = -32007
	// AHPNotFound indicates the requested file, folder, or URI does not exist.
	AHPNotFound = -32008
	// AHPPermissionDenied indicates the client is not permitted to access the requested resource.
	AHPPermissionDenied = -32009
	// AHPAlreadyExists indicates the target resource already exists and overwriting is not allowed.
	AHPAlreadyExists = -32010
)
