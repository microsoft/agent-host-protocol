// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:rust

#![allow(missing_docs)]

#[allow(unused_imports)]
use crate::common::{AnyValue, JsonObject, StringOrMarkdown, Uri};
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
#[allow(unused_imports)]
use serde_repr::{Deserialize_repr, Serialize_repr};

use crate::state::{
    AgentInfo, ConfirmationOption, CustomizationRef, CustomizationStatus, ErrorInfo, FileEdit,
    ModelSelection, PendingMessageKind, ResponsePart, SessionActiveClient, SessionCustomization,
    SessionInputAnswer, SessionInputRequest, SessionInputResponseKind, TerminalClaim, TerminalInfo,
    ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallResult, ToolDefinition,
    ToolResultContent, UsageInfo, UserMessage,
};

// ─── ActionType ──────────────────────────────────────────────────────

/// Discriminant values for all state actions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ActionType {
    #[serde(rename = "root/agentsChanged")]
    RootAgentsChanged,
    #[serde(rename = "root/activeSessionsChanged")]
    RootActiveSessionsChanged,
    #[serde(rename = "session/ready")]
    SessionReady,
    #[serde(rename = "session/creationFailed")]
    SessionCreationFailed,
    #[serde(rename = "session/turnStarted")]
    SessionTurnStarted,
    #[serde(rename = "session/delta")]
    SessionDelta,
    #[serde(rename = "session/responsePart")]
    SessionResponsePart,
    #[serde(rename = "session/toolCallStart")]
    SessionToolCallStart,
    #[serde(rename = "session/toolCallDelta")]
    SessionToolCallDelta,
    #[serde(rename = "session/toolCallReady")]
    SessionToolCallReady,
    #[serde(rename = "session/toolCallConfirmed")]
    SessionToolCallConfirmed,
    #[serde(rename = "session/toolCallComplete")]
    SessionToolCallComplete,
    #[serde(rename = "session/toolCallResultConfirmed")]
    SessionToolCallResultConfirmed,
    #[serde(rename = "session/toolCallContentChanged")]
    SessionToolCallContentChanged,
    #[serde(rename = "session/turnComplete")]
    SessionTurnComplete,
    #[serde(rename = "session/turnCancelled")]
    SessionTurnCancelled,
    #[serde(rename = "session/error")]
    SessionError,
    #[serde(rename = "session/titleChanged")]
    SessionTitleChanged,
    #[serde(rename = "session/usage")]
    SessionUsage,
    #[serde(rename = "session/reasoning")]
    SessionReasoning,
    #[serde(rename = "session/modelChanged")]
    SessionModelChanged,
    #[serde(rename = "session/serverToolsChanged")]
    SessionServerToolsChanged,
    #[serde(rename = "session/activeClientChanged")]
    SessionActiveClientChanged,
    #[serde(rename = "session/activeClientToolsChanged")]
    SessionActiveClientToolsChanged,
    #[serde(rename = "session/pendingMessageSet")]
    SessionPendingMessageSet,
    #[serde(rename = "session/pendingMessageRemoved")]
    SessionPendingMessageRemoved,
    #[serde(rename = "session/queuedMessagesReordered")]
    SessionQueuedMessagesReordered,
    #[serde(rename = "session/inputRequested")]
    SessionInputRequested,
    #[serde(rename = "session/inputAnswerChanged")]
    SessionInputAnswerChanged,
    #[serde(rename = "session/inputCompleted")]
    SessionInputCompleted,
    #[serde(rename = "session/customizationsChanged")]
    SessionCustomizationsChanged,
    #[serde(rename = "session/customizationToggled")]
    SessionCustomizationToggled,
    #[serde(rename = "session/customizationUpdated")]
    SessionCustomizationUpdated,
    #[serde(rename = "session/truncated")]
    SessionTruncated,
    #[serde(rename = "session/isReadChanged")]
    SessionIsReadChanged,
    #[serde(rename = "session/isArchivedChanged")]
    SessionIsArchivedChanged,
    #[serde(rename = "session/activityChanged")]
    SessionActivityChanged,
    #[serde(rename = "session/diffsChanged")]
    SessionDiffsChanged,
    #[serde(rename = "session/configChanged")]
    SessionConfigChanged,
    #[serde(rename = "session/metaChanged")]
    SessionMetaChanged,
    #[serde(rename = "root/terminalsChanged")]
    RootTerminalsChanged,
    #[serde(rename = "root/configChanged")]
    RootConfigChanged,
    #[serde(rename = "terminal/data")]
    TerminalData,
    #[serde(rename = "terminal/input")]
    TerminalInput,
    #[serde(rename = "terminal/resized")]
    TerminalResized,
    #[serde(rename = "terminal/claimed")]
    TerminalClaimed,
    #[serde(rename = "terminal/titleChanged")]
    TerminalTitleChanged,
    #[serde(rename = "terminal/cwdChanged")]
    TerminalCwdChanged,
    #[serde(rename = "terminal/exited")]
    TerminalExited,
    #[serde(rename = "terminal/cleared")]
    TerminalCleared,
    #[serde(rename = "terminal/commandDetectionAvailable")]
    TerminalCommandDetectionAvailable,
    #[serde(rename = "terminal/commandExecuted")]
    TerminalCommandExecuted,
    #[serde(rename = "terminal/commandFinished")]
    TerminalCommandFinished,
}

// ─── Action Envelope ─────────────────────────────────────────────────

/// Identifies the client that originally dispatched an action.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOrigin {
    pub client_id: String,
    pub client_seq: i64,
}

/// Every action is wrapped in an `ActionEnvelope`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionEnvelope {
    pub action: StateAction,
    pub server_seq: u64,
    pub origin: Option<ActionOrigin>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rejection_reason: Option<String>,
}

// ─── Action Payloads ─────────────────────────────────────────────────

/// Fired when available agent backends or their models change.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootAgentsChangedAction {
    /// Updated agent list
    pub agents: Vec<AgentInfo>,
}

/// Fired when the number of active sessions changes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootActiveSessionsChangedAction {
    /// Current count of active sessions
    pub active_sessions: i64,
}

/// Fired when agent-host configuration values change.
///
/// By default, the reducer merges the new values into `state.config.values`.
/// Set `replace` to `true` to replace all values instead of merging.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootConfigChangedAction {
    /// Updated config values
    pub config: JsonObject,
    /// When `true`, replaces all config values instead of merging
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replace: Option<bool>,
}

/// Session backend initialized successfully.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReadyAction {
    /// Session URI
    pub session: Uri,
}

/// Session backend failed to initialize.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCreationFailedAction {
    /// Session URI
    pub session: Uri,
    /// Error details
    pub error: ErrorInfo,
}

/// User sent a message; server starts agent processing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTurnStartedAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// User's message
    pub user_message: UserMessage,
    /// If this turn was auto-started from a queued message, the ID of that message
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queued_message_id: Option<String>,
}

/// Streaming text chunk from the assistant, appended to a specific response part.
///
/// The server MUST first emit a `session/responsePart` to create the target
/// part (markdown or reasoning), then use this action to append text to it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDeltaAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Identifier of the response part to append to
    pub part_id: String,
    /// Text chunk
    pub content: String,
}

/// Structured content appended to the response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResponsePartAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Response part (markdown or content ref)
    pub part: ResponsePart,
}

/// A tool call begins — parameters are streaming from the LM.
///
/// For client-provided tools, the server sets `toolClientId` to identify the
/// owning client. That client is responsible for executing the tool once it
/// reaches the `running` state and dispatching `session/toolCallComplete`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallStartAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Tool call identifier
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Internal tool name (for debugging/logging)
    pub tool_name: String,
    /// Human-readable tool name
    pub display_name: String,
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_client_id: Option<String>,
}

/// Streaming partial parameters for a tool call.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallDeltaAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Tool call identifier
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Partial parameter content to append
    pub content: String,
    /// Updated progress message
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invocation_message: Option<StringOrMarkdown>,
}

/// Tool call parameters are complete, or a running tool requires re-confirmation.
///
/// When dispatched for a `streaming` tool call, transitions to `pending-confirmation`
/// or directly to `running` if `confirmed` is set.
///
/// When dispatched for a `running` tool call (e.g. mid-execution permission needed),
/// transitions back to `pending-confirmation`. The `invocationMessage` and `_meta`
/// SHOULD be updated to describe the specific confirmation needed. Clients use the
/// standard `session/toolCallConfirmed` flow to approve or deny.
///
/// For client-provided tools, the server typically sets `confirmed` to
/// `'not-needed'` so the tool transitions directly to `running`, where the
/// owning client can begin execution immediately.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallReadyAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Tool call identifier
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Message describing what the tool will do or what confirmation is needed
    pub invocation_message: StringOrMarkdown,
    /// Raw tool input
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation_title: Option<StringOrMarkdown>,
    /// File edits that this tool call will perform, for preview before confirmation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edits: Option<AnyValue>,
    /// Whether the agent host allows the client to edit the tool's input parameters before confirming
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editable: Option<bool>,
    /// If set, the tool was auto-confirmed and transitions directly to `running`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<ToolCallConfirmationReason>,
    /// Options the server offers for this confirmation. When present, the client
    /// SHOULD render these instead of a plain approve/deny UI. Each option
    /// belongs to a {@link ConfirmationOptionGroup} so the client can still
    /// categorise the choices.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<ConfirmationOption>>,
}

/// Client approves or denies a pending tool call (merged approved + denied variants).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallConfirmedAction {
    pub session: Uri,
    pub turn_id: String,
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Whether the tool call was approved.
    pub approved: bool,
    /// How the tool was confirmed (present when approved).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<ToolCallConfirmationReason>,
    /// Why the tool was cancelled (present when denied).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<ToolCallCancellationReason>,
    /// Edited tool input parameters, if the client modified them before confirming.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edited_tool_input: Option<String>,
    /// What the user suggested doing instead (present when denied).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_suggestion: Option<UserMessage>,
    /// Explanation for the denial.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason_message: Option<StringOrMarkdown>,
    /// ID of the selected confirmation option, if the server provided options.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_option_id: Option<String>,
}

/// Tool execution finished. Transitions to `completed` or `pending-result-confirmation`
/// if `requiresResultConfirmation` is `true`.
///
/// For client-provided tools (where `toolClientId` is set on the tool call state),
/// the owning client dispatches this action with the execution result. The server
/// SHOULD reject this action if the dispatching client does not match `toolClientId`.
///
/// Servers waiting on a client tool call MAY time out after a reasonable duration
/// if the implementing client disconnects or becomes unresponsive, and dispatch
/// this action with `result.success = false` and an appropriate error.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallCompleteAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Tool call identifier
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Execution result
    pub result: ToolCallResult,
    /// If true, the result requires client approval before finalizing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub requires_result_confirmation: Option<bool>,
}

/// Client approves or denies a tool's result.
///
/// If `approved` is `false`, the tool transitions to `cancelled` with reason `result-denied`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallResultConfirmedAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Tool call identifier
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Whether the result was approved
    pub approved: bool,
}

/// Turn finished — the assistant is idle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTurnCompleteAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
}

/// Turn was aborted; server stops processing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTurnCancelledAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
}

/// Error during turn processing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionErrorAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Error details
    pub error: ErrorInfo,
}

/// Session title updated. Fired by the server when the title is auto-generated
/// from conversation, or dispatched by a client to rename a session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTitleChangedAction {
    /// Session URI
    pub session: Uri,
    /// New title
    pub title: String,
}

/// Token usage report for a turn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Token usage data
    pub usage: UsageInfo,
}

/// Reasoning/thinking text from the model, appended to a specific reasoning response part.
///
/// The server MUST first emit a `session/responsePart` to create the target
/// reasoning part, then use this action to append text to it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReasoningAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Identifier of the reasoning response part to append to
    pub part_id: String,
    /// Reasoning text chunk
    pub content: String,
}

/// Model changed for this session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelChangedAction {
    /// Session URI
    pub session: Uri,
    /// New model selection
    pub model: ModelSelection,
}

/// The read state of the session changed.
///
/// Dispatched by a client to mark a session as read (e.g. after viewing it)
/// or unread (e.g. after new activity since the client last looked at it).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIsReadChangedAction {
    /// Session URI
    pub session: Uri,
    /// Whether the session has been read
    pub is_read: bool,
}

/// The archived state of the session changed.
///
/// Dispatched by a client to archive a session (e.g. the task is
/// complete) or to unarchive it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIsArchivedChangedAction {
    /// Session URI
    pub session: Uri,
    /// Whether the session is archived
    pub is_archived: bool,
}

/// The activity description of the session changed.
///
/// Dispatched by the server to indicate what the session is currently doing
/// (e.g. running a tool, thinking). Clear activity by setting it to `undefined`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionActivityChangedAction {
    /// Session URI
    pub session: Uri,
    /// Human-readable description of current activity, or `undefined` to clear
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
}

/// Server tools for this session have changed.
///
/// Full-replacement semantics: the `tools` array replaces the previous `serverTools` entirely.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionServerToolsChangedAction {
    /// Session URI
    pub session: Uri,
    /// Updated server tools list (full replacement)
    pub tools: Vec<ToolDefinition>,
}

/// The active client for this session has changed.
///
/// A client dispatches this action with its own `SessionActiveClient` to claim
/// the active role, or with `null` to release it. The server SHOULD reject if
/// another client is already active. The server SHOULD automatically dispatch
/// this action with `activeClient: null` when the active client disconnects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionActiveClientChangedAction {
    /// Session URI
    pub session: Uri,
    /// The new active client, or `null` to unset
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_client: Option<SessionActiveClient>,
}

/// The active client's tool list has changed.
///
/// Full-replacement semantics: the `tools` array replaces the active client's
/// previous tools entirely. The server SHOULD reject if the dispatching client
/// is not the current active client.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionActiveClientToolsChangedAction {
    /// Session URI
    pub session: Uri,
    /// Updated client tools list (full replacement)
    pub tools: Vec<ToolDefinition>,
}

/// A pending message was set (upsert semantics: creates or replaces).
///
/// For steering messages, this always replaces the single steering message.
/// For queued messages, if a message with the given `id` already exists it is
/// updated in place; otherwise it is appended to the queue. If the session is
/// idle when a queued message is set, the server SHOULD immediately consume it
/// and start a new turn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPendingMessageSetAction {
    /// Session URI
    pub session: Uri,
    /// Whether this is a steering or queued message
    pub kind: PendingMessageKind,
    /// Unique identifier for this pending message
    pub id: String,
    /// The message content
    pub user_message: UserMessage,
}

/// A pending message was removed (steering or queued).
///
/// Dispatched by clients to cancel a pending message, or by the server when
/// it consumes a message (e.g. starting a turn from a queued message or
/// injecting a steering message into the current turn).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPendingMessageRemovedAction {
    /// Session URI
    pub session: Uri,
    /// Whether this is a steering or queued message
    pub kind: PendingMessageKind,
    /// Identifier of the pending message to remove
    pub id: String,
}

/// Reorder the queued messages.
///
/// The `order` array contains the IDs of queued messages in their new
/// desired order. IDs not present in the current queue are ignored.
/// Queued messages whose IDs are absent from `order` are appended at
/// the end in their original relative order (so a client with a stale
/// view of the queue never silently drops messages).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionQueuedMessagesReorderedAction {
    /// Session URI
    pub session: Uri,
    /// Queued message IDs in the desired order
    pub order: Vec<String>,
}

/// A session requested input from the user.
///
/// Full-request upsert semantics: the `request` replaces any existing request
/// with the same `id`, or is appended if it is new. Answer drafts are preserved
/// unless `request.answers` is provided.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputRequestedAction {
    /// Session URI
    pub session: Uri,
    /// Input request to create or replace
    pub request: SessionInputRequest,
}

/// A client updated, submitted, skipped, or removed a single in-progress answer.
///
/// Dispatching with `answer: undefined` removes that question's answer draft.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputAnswerChangedAction {
    /// Session URI
    pub session: Uri,
    /// Input request identifier
    pub request_id: String,
    /// Question identifier within the input request
    pub question_id: String,
    /// Updated answer, or `undefined` to clear an answer draft
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<SessionInputAnswer>,
}

/// A client accepted, declined, or cancelled a session input request.
///
/// If accepted, the server uses `answers` (when provided) plus the request's
/// synced answer state to resume the blocked operation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputCompletedAction {
    /// Session URI
    pub session: Uri,
    /// Input request identifier
    pub request_id: String,
    /// Completion outcome
    pub response: SessionInputResponseKind,
    /// Optional final answer replacement, keyed by question ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answers: Option<std::collections::HashMap<String, SessionInputAnswer>>,
}

/// The session's customizations have changed.
///
/// Full-replacement semantics: the `customizations` array replaces the
/// previous `customizations` entirely.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomizationsChangedAction {
    /// Session URI
    pub session: Uri,
    /// Updated customization list (full replacement)
    pub customizations: Vec<SessionCustomization>,
}

/// A client toggled a customization on or off.
///
/// The server locates the customization by `uri` in the session's
/// customization list and sets its `enabled` flag.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomizationToggledAction {
    /// Session URI
    pub session: Uri,
    /// The URI of the customization to toggle
    pub uri: Uri,
    /// Whether to enable or disable the customization
    pub enabled: bool,
}

/// Upserts mutable fields on a single customization.
///
/// Dispatched by the server to update one or more fields on a customization,
/// or to add a new customization to the session, without republishing the
/// entire `customizations` list. The reducer locates the existing entry by
/// `customization.uri`:
///
/// - If an entry exists, each provided field is assigned; absent (or
///   `undefined`) fields are left unchanged. The stored `customization`
///   ref is replaced with the one in the action.
/// - If no entry exists, a new {@link SessionCustomization} is appended
///   using the provided fields; `enabled` defaults to `false` when absent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomizationUpdatedAction {
    /// Session URI
    pub session: Uri,
    /// The customization to update or insert (matched by `customization.uri`)
    pub customization: CustomizationRef,
    /// New enabled state (defaults to `false` on insert)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// New loading status
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<CustomizationStatus>,
    /// New human-readable status detail
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status_message: Option<String>,
}

/// Truncates a session's history. If `turnId` is provided, all turns after that
/// turn are removed and the specified turn is kept. If `turnId` is omitted, all
/// turns are removed.
///
/// If there is an active turn it is silently dropped and the session status
/// returns to `idle`.
///
/// Common use-case: truncate old data then dispatch a new
/// `session/turnStarted` with an edited message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTruncatedAction {
    /// Session URI
    pub session: Uri,
    /// Keep turns up to and including this turn. Omit to clear all turns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

/// The file diffs for the session changed.
///
/// Full-replacement semantics: the `diffs` array replaces the previous
/// `summary.diffs` entirely.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDiffsChangedAction {
    /// Session URI
    pub session: Uri,
    /// Updated file diffs for the session
    pub diffs: Vec<FileEdit>,
}

/// Client changed a mutable config value mid-session.
///
/// Only properties with `sessionMutable: true` in the config schema may be
/// changed. The server validates and broadcasts the action; the reducer merges
/// the new values into `state.config.values`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigChangedAction {
    /// Session URI
    pub session: Uri,
    /// Updated config values
    pub config: JsonObject,
    /// When `true`, replaces all config values instead of merging
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replace: Option<bool>,
}

/// The session's `_meta` side-channel changed. Replaces `state._meta`
/// entirely (full-replacement semantics). Producers SHOULD merge any
/// keys they wish to preserve into the new value before dispatching.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetaChangedAction {
    /// Session URI
    pub session: Uri,
    /// New `_meta` payload, or `undefined` to clear it
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Partial content produced while a tool is still executing.
///
/// Replaces the `content` array on the running tool call state. Clients can
/// use this to display live feedback (e.g. a terminal reference) before the
/// tool completes.
///
/// For client-provided tools (where `toolClientId` is set on the tool call state),
/// the owning client dispatches this action to stream intermediate content while
/// executing. The server SHOULD reject this action if the dispatching client does
/// not match `toolClientId`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionToolCallContentChangedAction {
    /// Session URI
    pub session: Uri,
    /// Turn identifier
    pub turn_id: String,
    /// Tool call identifier
    pub tool_call_id: String,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// The current partial content for the running tool call
    pub content: Vec<ToolResultContent>,
}

/// Fired when the list of known terminals changes.
///
/// Full-replacement semantics: the `terminals` array replaces the previous
/// `terminals` entirely.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootTerminalsChangedAction {
    /// Updated terminal list (full replacement)
    pub terminals: Vec<TerminalInfo>,
}

/// Terminal output data (pty → client direction).
///
/// Appends `data` to the terminal's `content` in the reducer.
///
/// `terminal/data` and `terminal/input` are intentionally separate actions
/// because standard write-ahead reconciliation is not safe for terminal I/O.
/// A pty is a stateful, mutable process — optimistically applying input or
/// predicting output would produce incorrect state. Instead, `terminal/input`
/// is a side-effect-only action (client → server → pty), and `terminal/data`
/// is server-authoritative output (pty → server → client).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDataAction {
    /// Terminal URI
    pub terminal: Uri,
    /// Output data (may contain ANSI escape sequences)
    pub data: String,
}

/// Keyboard input sent to the terminal process (client → pty direction).
///
/// This is a side-effect-only action: the server forwards the data to the
/// terminal's pty. The reducer treats this as a no-op since `terminal/data`
/// actions will reflect any resulting output.
///
/// See `terminal/data` for why these two actions are kept separate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInputAction {
    /// Terminal URI
    pub terminal: Uri,
    /// Input data to send to the pty
    pub data: String,
}

/// Terminal dimensions changed.
///
/// Dispatchable by clients to request a resize, or by the server to inform
/// clients of the actual terminal dimensions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizedAction {
    /// Terminal URI
    pub terminal: Uri,
    /// Terminal width in columns
    pub cols: i64,
    /// Terminal height in rows
    pub rows: i64,
}

/// Terminal claim changed. A client or session transfers ownership of the terminal.
///
/// The server SHOULD reject if the dispatching client does not currently hold
/// the claim.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalClaimedAction {
    /// Terminal URI
    pub terminal: Uri,
    /// The new claim
    pub claim: TerminalClaim,
}

/// Terminal title changed.
///
/// Fired by the server when the terminal process updates its title (e.g. via
/// escape sequences), or dispatched by a client to rename a terminal.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalTitleChangedAction {
    /// Terminal URI
    pub terminal: Uri,
    /// New terminal title
    pub title: String,
}

/// Terminal working directory changed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCwdChangedAction {
    /// Terminal URI
    pub terminal: Uri,
    /// New working directory
    pub cwd: Uri,
}

/// Terminal process exited.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitedAction {
    /// Terminal URI
    pub terminal: Uri,
    /// Process exit code. `undefined` if the process was killed without an exit code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
}

/// Terminal scrollback buffer cleared.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalClearedAction {
    /// Terminal URI
    pub terminal: Uri,
}

/// Shell integration has loaded and the terminal now supports command
/// detection. The server dispatches this when shell integration becomes
/// available (which may happen asynchronously after the terminal is created).
///
/// Clients MUST NOT assume command detection is available until this action
/// (or `terminal/commandExecuted`) has been received.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandDetectionAvailableAction {
    /// Terminal URI
    pub terminal: Uri,
}

/// A command has been submitted to the shell and is now executing.
/// All subsequent `terminal/data` actions (until the matching
/// `terminal/commandFinished`) constitute this command's output.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandExecutedAction {
    /// Terminal URI
    pub terminal: Uri,
    /// Stable identifier for this command, scoped to the terminal URI.
    /// Allows correlating `commandExecuted` → `commandFinished` pairs.
    pub command_id: String,
    /// The command line text that was submitted
    pub command_line: String,
    /// Unix timestamp (ms) of when the command started executing, as measured
    /// on the server.
    pub timestamp: i64,
}

/// A command has finished executing.
///
/// The sequence of `terminal/data` actions between the preceding
/// `terminal/commandExecuted` (same `commandId`) and this action constitutes
/// the complete output of the command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandFinishedAction {
    /// Terminal URI
    pub terminal: Uri,
    /// Matches the `commandId` from the corresponding `commandExecuted`
    pub command_id: String,
    /// Shell exit code. `undefined` if the shell did not report one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
    /// Wall-clock duration of the command in milliseconds, as measured by the
    /// shell integration script on the server side.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
}

// ─── StateAction Union ───────────────────────────────────────────────

/// Discriminated union of every state action.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StateAction {
    #[serde(rename = "root/agentsChanged")]
    RootAgentsChanged(RootAgentsChangedAction),
    #[serde(rename = "root/activeSessionsChanged")]
    RootActiveSessionsChanged(RootActiveSessionsChangedAction),
    #[serde(rename = "root/configChanged")]
    RootConfigChanged(RootConfigChangedAction),
    #[serde(rename = "session/ready")]
    SessionReady(SessionReadyAction),
    #[serde(rename = "session/creationFailed")]
    SessionCreationFailed(SessionCreationFailedAction),
    #[serde(rename = "session/turnStarted")]
    SessionTurnStarted(SessionTurnStartedAction),
    #[serde(rename = "session/delta")]
    SessionDelta(SessionDeltaAction),
    #[serde(rename = "session/responsePart")]
    SessionResponsePart(SessionResponsePartAction),
    #[serde(rename = "session/toolCallStart")]
    SessionToolCallStart(SessionToolCallStartAction),
    #[serde(rename = "session/toolCallDelta")]
    SessionToolCallDelta(SessionToolCallDeltaAction),
    #[serde(rename = "session/toolCallReady")]
    SessionToolCallReady(SessionToolCallReadyAction),
    #[serde(rename = "session/toolCallConfirmed")]
    SessionToolCallConfirmed(SessionToolCallConfirmedAction),
    #[serde(rename = "session/toolCallComplete")]
    SessionToolCallComplete(SessionToolCallCompleteAction),
    #[serde(rename = "session/toolCallResultConfirmed")]
    SessionToolCallResultConfirmed(SessionToolCallResultConfirmedAction),
    #[serde(rename = "session/turnComplete")]
    SessionTurnComplete(SessionTurnCompleteAction),
    #[serde(rename = "session/turnCancelled")]
    SessionTurnCancelled(SessionTurnCancelledAction),
    #[serde(rename = "session/error")]
    SessionError(SessionErrorAction),
    #[serde(rename = "session/titleChanged")]
    SessionTitleChanged(SessionTitleChangedAction),
    #[serde(rename = "session/usage")]
    SessionUsage(SessionUsageAction),
    #[serde(rename = "session/reasoning")]
    SessionReasoning(SessionReasoningAction),
    #[serde(rename = "session/modelChanged")]
    SessionModelChanged(SessionModelChangedAction),
    #[serde(rename = "session/isReadChanged")]
    SessionIsReadChanged(SessionIsReadChangedAction),
    #[serde(rename = "session/isArchivedChanged")]
    SessionIsArchivedChanged(SessionIsArchivedChangedAction),
    #[serde(rename = "session/activityChanged")]
    SessionActivityChanged(SessionActivityChangedAction),
    #[serde(rename = "session/serverToolsChanged")]
    SessionServerToolsChanged(SessionServerToolsChangedAction),
    #[serde(rename = "session/activeClientChanged")]
    SessionActiveClientChanged(SessionActiveClientChangedAction),
    #[serde(rename = "session/activeClientToolsChanged")]
    SessionActiveClientToolsChanged(SessionActiveClientToolsChangedAction),
    #[serde(rename = "session/pendingMessageSet")]
    SessionPendingMessageSet(SessionPendingMessageSetAction),
    #[serde(rename = "session/pendingMessageRemoved")]
    SessionPendingMessageRemoved(SessionPendingMessageRemovedAction),
    #[serde(rename = "session/queuedMessagesReordered")]
    SessionQueuedMessagesReordered(SessionQueuedMessagesReorderedAction),
    #[serde(rename = "session/inputRequested")]
    SessionInputRequested(SessionInputRequestedAction),
    #[serde(rename = "session/inputAnswerChanged")]
    SessionInputAnswerChanged(SessionInputAnswerChangedAction),
    #[serde(rename = "session/inputCompleted")]
    SessionInputCompleted(SessionInputCompletedAction),
    #[serde(rename = "session/customizationsChanged")]
    SessionCustomizationsChanged(SessionCustomizationsChangedAction),
    #[serde(rename = "session/customizationToggled")]
    SessionCustomizationToggled(SessionCustomizationToggledAction),
    #[serde(rename = "session/customizationUpdated")]
    SessionCustomizationUpdated(SessionCustomizationUpdatedAction),
    #[serde(rename = "session/truncated")]
    SessionTruncated(SessionTruncatedAction),
    #[serde(rename = "session/diffsChanged")]
    SessionDiffsChanged(SessionDiffsChangedAction),
    #[serde(rename = "session/configChanged")]
    SessionConfigChanged(SessionConfigChangedAction),
    #[serde(rename = "session/metaChanged")]
    SessionMetaChanged(SessionMetaChangedAction),
    #[serde(rename = "session/toolCallContentChanged")]
    SessionToolCallContentChanged(SessionToolCallContentChangedAction),
    #[serde(rename = "root/terminalsChanged")]
    RootTerminalsChanged(RootTerminalsChangedAction),
    #[serde(rename = "terminal/data")]
    TerminalData(TerminalDataAction),
    #[serde(rename = "terminal/input")]
    TerminalInput(TerminalInputAction),
    #[serde(rename = "terminal/resized")]
    TerminalResized(TerminalResizedAction),
    #[serde(rename = "terminal/claimed")]
    TerminalClaimed(TerminalClaimedAction),
    #[serde(rename = "terminal/titleChanged")]
    TerminalTitleChanged(TerminalTitleChangedAction),
    #[serde(rename = "terminal/cwdChanged")]
    TerminalCwdChanged(TerminalCwdChangedAction),
    #[serde(rename = "terminal/exited")]
    TerminalExited(TerminalExitedAction),
    #[serde(rename = "terminal/cleared")]
    TerminalCleared(TerminalClearedAction),
    #[serde(rename = "terminal/commandDetectionAvailable")]
    TerminalCommandDetectionAvailable(TerminalCommandDetectionAvailableAction),
    #[serde(rename = "terminal/commandExecuted")]
    TerminalCommandExecuted(TerminalCommandExecutedAction),
    #[serde(rename = "terminal/commandFinished")]
    TerminalCommandFinished(TerminalCommandFinishedAction),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}
