// Code generated from types/*.ts — DO NOT EDIT.

package ahp

import "encoding/json"

// ── JSON-RPC Base Types ──────────────────────────────────────────────────────

// JSONRPCRequest is a JSON-RPC 2.0 request with typed params.
type JSONRPCRequest[T any] struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  T      `json:"params"`
}

// NewJSONRPCRequest creates a new JSON-RPC 2.0 request.
func NewJSONRPCRequest[T any](id int, method string, params T) JSONRPCRequest[T] {
	return JSONRPCRequest[T]{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}
}

// JSONRPCError is a JSON-RPC 2.0 error object.
type JSONRPCError struct {
	Code    int              `json:"code"`
	Message string           `json:"message"`
	Data    *json.RawMessage `json:"data,omitempty"`
}

// JSONRPCSuccessResponse is a JSON-RPC 2.0 success response with typed result.
type JSONRPCSuccessResponse[T any] struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Result  T      `json:"result"`
}

// JSONRPCErrorResponse is a JSON-RPC 2.0 error response.
type JSONRPCErrorResponse struct {
	JSONRPC string       `json:"jsonrpc"`
	ID      int          `json:"id"`
	Error   JSONRPCError `json:"error"`
}

// JSONRPCNotification is a JSON-RPC 2.0 notification (no id) with typed params.
type JSONRPCNotification[T any] struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  T      `json:"params"`
}

// NewJSONRPCNotification creates a new JSON-RPC 2.0 notification.
func NewJSONRPCNotification[T any](method string, params T) JSONRPCNotification[T] {
	return JSONRPCNotification[T]{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}
}

// ── Server → Client Notification Params ──────────────────────────────────────

// ActionNotificationParams is the params for the server → client action notification.
type ActionNotificationParams = ActionEnvelope

// NotificationMethodParams is the params for the server → client notification method.
type NotificationMethodParams struct {
	Notification ProtocolNotification `json:"notification"`
}

// ── AHP Command Helpers ──────────────────────────────────────────────────────

// NewInitializeRequest creates an initialize JSON-RPC request.
func NewInitializeRequest(id int, params InitializeParams) JSONRPCRequest[InitializeParams] {
	return NewJSONRPCRequest(id, "initialize", params)
}

// NewReconnectRequest creates a reconnect JSON-RPC request.
func NewReconnectRequest(id int, params ReconnectParams) JSONRPCRequest[ReconnectParams] {
	return NewJSONRPCRequest(id, "reconnect", params)
}

// NewSubscribeRequest creates a subscribe JSON-RPC request.
func NewSubscribeRequest(id int, params SubscribeParams) JSONRPCRequest[SubscribeParams] {
	return NewJSONRPCRequest(id, "subscribe", params)
}

// NewCreateSessionRequest creates a createSession JSON-RPC request.
func NewCreateSessionRequest(id int, params CreateSessionParams) JSONRPCRequest[CreateSessionParams] {
	return NewJSONRPCRequest(id, "createSession", params)
}

// NewDisposeSessionRequest creates a disposeSession JSON-RPC request.
func NewDisposeSessionRequest(id int, params DisposeSessionParams) JSONRPCRequest[DisposeSessionParams] {
	return NewJSONRPCRequest(id, "disposeSession", params)
}

// NewListSessionsRequest creates a listSessions JSON-RPC request.
func NewListSessionsRequest(id int, params ListSessionsParams) JSONRPCRequest[ListSessionsParams] {
	return NewJSONRPCRequest(id, "listSessions", params)
}

// NewResourceReadRequest creates a resourceRead JSON-RPC request.
func NewResourceReadRequest(id int, params ResourceReadParams) JSONRPCRequest[ResourceReadParams] {
	return NewJSONRPCRequest(id, "resourceRead", params)
}

// NewResourceWriteRequest creates a resourceWrite JSON-RPC request.
func NewResourceWriteRequest(id int, params ResourceWriteParams) JSONRPCRequest[ResourceWriteParams] {
	return NewJSONRPCRequest(id, "resourceWrite", params)
}

// NewResourceListRequest creates a resourceList JSON-RPC request.
func NewResourceListRequest(id int, params ResourceListParams) JSONRPCRequest[ResourceListParams] {
	return NewJSONRPCRequest(id, "resourceList", params)
}

// NewResourceCopyRequest creates a resourceCopy JSON-RPC request.
func NewResourceCopyRequest(id int, params ResourceCopyParams) JSONRPCRequest[ResourceCopyParams] {
	return NewJSONRPCRequest(id, "resourceCopy", params)
}

// NewResourceDeleteRequest creates a resourceDelete JSON-RPC request.
func NewResourceDeleteRequest(id int, params ResourceDeleteParams) JSONRPCRequest[ResourceDeleteParams] {
	return NewJSONRPCRequest(id, "resourceDelete", params)
}

// NewResourceMoveRequest creates a resourceMove JSON-RPC request.
func NewResourceMoveRequest(id int, params ResourceMoveParams) JSONRPCRequest[ResourceMoveParams] {
	return NewJSONRPCRequest(id, "resourceMove", params)
}

// NewFetchTurnsRequest creates a fetchTurns JSON-RPC request.
func NewFetchTurnsRequest(id int, params FetchTurnsParams) JSONRPCRequest[FetchTurnsParams] {
	return NewJSONRPCRequest(id, "fetchTurns", params)
}

// NewAuthenticateRequest creates an authenticate JSON-RPC request.
func NewAuthenticateRequest(id int, params AuthenticateParams) JSONRPCRequest[AuthenticateParams] {
	return NewJSONRPCRequest(id, "authenticate", params)
}

// ── AHP Client Notification Helpers ──────────────────────────────────────────

// NewUnsubscribeNotification creates an unsubscribe JSON-RPC notification.
func NewUnsubscribeNotification(params UnsubscribeParams) JSONRPCNotification[UnsubscribeParams] {
	return NewJSONRPCNotification("unsubscribe", params)
}

// NewDispatchActionNotification creates a dispatchAction JSON-RPC notification.
func NewDispatchActionNotification(params DispatchActionParams) JSONRPCNotification[DispatchActionParams] {
	return NewJSONRPCNotification("dispatchAction", params)
}
