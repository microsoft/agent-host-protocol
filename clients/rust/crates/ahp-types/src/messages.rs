// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:rust

#![allow(missing_docs)]

#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use serde_repr::{Deserialize_repr, Serialize_repr};
#[allow(unused_imports)]
use crate::common::{AnyValue, JsonObject, StringOrMarkdown, Uri};

use crate::actions::ActionEnvelope;
use crate::notifications::ProtocolNotification;

// ─── JSON-RPC Envelope ────────────────────────────────────────────────────

/// A JSON-RPC 2.0 request (method + id).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: JsonRpcVersion,
    pub id: u64,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<AnyValue>,
}

/// A JSON-RPC 2.0 success response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcSuccessResponse {
    pub jsonrpc: JsonRpcVersion,
    pub id: u64,
    pub result: AnyValue,
}

/// A JSON-RPC 2.0 error response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcErrorResponse {
    pub jsonrpc: JsonRpcVersion,
    pub id: u64,
    pub error: JsonRpcError,
}

/// JSON-RPC 2.0 error object (`code`, `message`, optional `data`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<AnyValue>,
}

/// A JSON-RPC 2.0 notification (method, no id).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: JsonRpcVersion,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<AnyValue>,
}

/// The sole allowed value of the `jsonrpc` field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum JsonRpcVersion {
    #[default]
    #[serde(rename = "2.0")]
    V2,
}

/// A discriminated union over the four JSON-RPC message shapes.
///
/// Useful for a transport that demuxes an inbound byte stream into typed
/// messages before routing them to the correlation and subscription
/// machinery.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JsonRpcMessage {
    Request(JsonRpcRequest),
    SuccessResponse(JsonRpcSuccessResponse),
    ErrorResponse(JsonRpcErrorResponse),
    Notification(JsonRpcNotification),
}

/// Params for the server → client `notification` method.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NotificationMethodParams {
    pub notification: ProtocolNotification,
}

/// Params for the server → client `action` method.
pub type ActionNotificationParams = ActionEnvelope;
