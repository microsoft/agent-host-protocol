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
    AgentInfo, AgentSelection, Annotation, AnnotationEntry, Changeset, ChangesetFile,
    ChangesetOperation, ChangesetOperationStatus, ChangesetStatus, ChatInputAnswer,
    ChatInputRequest, ChatInputResponseKind, ChatInteractivity, ChatOrigin, ChatSummary,
    ConfirmationOption, Customization, ErrorInfo, McpServerState, Message, ModelSelection,
    PendingMessageKind, ResponsePart, SessionActiveClient, TerminalClaim, TerminalInfo, TextRange,
    ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributor, ToolCallResult,
    ToolDefinition, ToolResultContent, UsageInfo,
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
    #[serde(rename = "session/chatAdded")]
    SessionChatAdded,
    #[serde(rename = "session/chatRemoved")]
    SessionChatRemoved,
    #[serde(rename = "session/chatUpdated")]
    SessionChatUpdated,
    #[serde(rename = "session/defaultChatChanged")]
    SessionDefaultChatChanged,
    #[serde(rename = "chat/turnStarted")]
    ChatTurnStarted,
    #[serde(rename = "chat/delta")]
    ChatDelta,
    #[serde(rename = "chat/responsePart")]
    ChatResponsePart,
    #[serde(rename = "chat/toolCallStart")]
    ChatToolCallStart,
    #[serde(rename = "chat/toolCallDelta")]
    ChatToolCallDelta,
    #[serde(rename = "chat/toolCallReady")]
    ChatToolCallReady,
    #[serde(rename = "chat/toolCallConfirmed")]
    ChatToolCallConfirmed,
    #[serde(rename = "chat/toolCallComplete")]
    ChatToolCallComplete,
    #[serde(rename = "chat/toolCallResultConfirmed")]
    ChatToolCallResultConfirmed,
    #[serde(rename = "chat/toolCallContentChanged")]
    ChatToolCallContentChanged,
    #[serde(rename = "chat/turnComplete")]
    ChatTurnComplete,
    #[serde(rename = "chat/turnCancelled")]
    ChatTurnCancelled,
    #[serde(rename = "chat/error")]
    ChatError,
    #[serde(rename = "session/titleChanged")]
    SessionTitleChanged,
    #[serde(rename = "chat/usage")]
    ChatUsage,
    #[serde(rename = "chat/reasoning")]
    ChatReasoning,
    #[serde(rename = "session/modelChanged")]
    SessionModelChanged,
    #[serde(rename = "session/agentChanged")]
    SessionAgentChanged,
    #[serde(rename = "session/serverToolsChanged")]
    SessionServerToolsChanged,
    #[serde(rename = "session/activeClientChanged")]
    SessionActiveClientChanged,
    #[serde(rename = "session/activeClientToolsChanged")]
    SessionActiveClientToolsChanged,
    #[serde(rename = "chat/pendingMessageSet")]
    ChatPendingMessageSet,
    #[serde(rename = "chat/pendingMessageRemoved")]
    ChatPendingMessageRemoved,
    #[serde(rename = "chat/queuedMessagesReordered")]
    ChatQueuedMessagesReordered,
    #[serde(rename = "chat/inputRequested")]
    ChatInputRequested,
    #[serde(rename = "chat/inputAnswerChanged")]
    ChatInputAnswerChanged,
    #[serde(rename = "chat/inputCompleted")]
    ChatInputCompleted,
    #[serde(rename = "session/customizationsChanged")]
    SessionCustomizationsChanged,
    #[serde(rename = "session/customizationToggled")]
    SessionCustomizationToggled,
    #[serde(rename = "session/customizationUpdated")]
    SessionCustomizationUpdated,
    #[serde(rename = "session/customizationRemoved")]
    SessionCustomizationRemoved,
    #[serde(rename = "session/mcpServerStateChanged")]
    SessionMcpServerStateChanged,
    #[serde(rename = "chat/truncated")]
    ChatTruncated,
    #[serde(rename = "session/isReadChanged")]
    SessionIsReadChanged,
    #[serde(rename = "session/isArchivedChanged")]
    SessionIsArchivedChanged,
    #[serde(rename = "session/activityChanged")]
    SessionActivityChanged,
    #[serde(rename = "session/changesetsChanged")]
    SessionChangesetsChanged,
    #[serde(rename = "session/configChanged")]
    SessionConfigChanged,
    #[serde(rename = "session/metaChanged")]
    SessionMetaChanged,
    #[serde(rename = "changeset/statusChanged")]
    ChangesetStatusChanged,
    #[serde(rename = "changeset/fileSet")]
    ChangesetFileSet,
    #[serde(rename = "changeset/fileRemoved")]
    ChangesetFileRemoved,
    #[serde(rename = "changeset/operationsChanged")]
    ChangesetOperationsChanged,
    #[serde(rename = "changeset/operationStatusChanged")]
    ChangesetOperationStatusChanged,
    #[serde(rename = "changeset/cleared")]
    ChangesetCleared,
    #[serde(rename = "annotations/set")]
    AnnotationsSet,
    #[serde(rename = "annotations/updated")]
    AnnotationsUpdated,
    #[serde(rename = "annotations/removed")]
    AnnotationsRemoved,
    #[serde(rename = "annotations/entrySet")]
    AnnotationsEntrySet,
    #[serde(rename = "annotations/entryRemoved")]
    AnnotationsEntryRemoved,
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
    #[serde(rename = "resourceWatch/changed")]
    ResourceWatchChanged,
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
///
/// The envelope identifies the channel the action belongs to (e.g.
/// `ahp-root://` for root actions, the session URI for session actions, the
/// terminal URI for terminal actions). Individual action payloads carry only
/// fields that are intrinsic to the action; the channel comes from the
/// envelope so that any subscribable resource can route its actions uniformly.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionEnvelope {
    /// Channel URI this action belongs to.
    pub channel: Uri,
    pub action: StateAction,
    pub server_seq: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
pub struct SessionReadyAction {}

/// Session backend failed to initialize.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCreationFailedAction {
    /// Error details
    pub error: ErrorInfo,
}

/// A chat was added to this session's catalog. Upsert semantics: if a chat
/// with the same `summary.resource` already exists, the existing entry is
/// replaced.
///
/// Mirrors the root-channel `root/sessionAdded` notification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionChatAddedAction {
    /// The full summary of the newly added (or upserted) chat.
    pub summary: ChatSummary,
}

/// A chat was removed from this session's catalog. No-op when no entry matches.
///
/// Mirrors the root-channel `root/sessionRemoved` notification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionChatRemovedAction {
    /// The URI of the chat to remove.
    pub chat: Uri,
}

/// One existing chat's summary fields changed.
///
/// Partial-update semantics: only fields present in `changes` are written;
/// omitted fields are preserved. Identity fields (`resource`) MUST NOT be
/// carried in `changes`. No-op when no entry with `chat` exists — clients
/// SHOULD then wait for a {@link SessionChatAddedAction | `session/chatAdded`}.
///
/// Mirrors the root-channel `root/sessionSummaryChanged` notification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionChatUpdatedAction {
    /// The URI of the chat whose summary changed.
    pub chat: Uri,
    /// Mutable summary fields that changed; omitted fields are unchanged.
    ///
    /// Identity fields (`resource`) never change and MUST be omitted by
    /// senders; receivers SHOULD ignore them if present.
    pub changes: PartialChatSummary,
}

/// The default chat input-routing hint for this session changed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionDefaultChatChangedAction {
    /// New default chat URI, or `undefined` to clear the hint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_chat: Option<Uri>,
}

/// A new message has been sent to the agent, and a new turn starts.
///
/// A client is only allowed to send {@link MessageKind.User} messages.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurnStartedAction {
    /// Turn identifier
    pub turn_id: String,
    /// The new message
    pub message: Message,
    /// If this turn was auto-started from a queued message, the ID of that message
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queued_message_id: Option<String>,
}

/// Streaming text chunk from the assistant, appended to a specific response part.
///
/// The server MUST first emit a `chat/responsePart` to create the target
/// part (markdown or reasoning), then use this action to append text to it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatDeltaAction {
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
pub struct ChatResponsePartAction {
    /// Turn identifier
    pub turn_id: String,
    /// Response part (markdown or content ref)
    pub part: ResponsePart,
}

/// A tool call begins — parameters are streaming from the LM.
///
/// The server sets {@link ToolCallContributor | `contributor`} to identify
/// the origin of the tool. For client-provided tools, the named client is
/// responsible for executing the tool once it reaches the `running` state
/// and dispatching `chat/toolCallComplete`. For MCP-served tools, the
/// server executes the call against the named `McpServerCustomization`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatToolCallStartAction {
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
    /// Reference to the contributor of the tool being called. Absent for
    /// server-side tools that are not contributed by a client or MCP server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contributor: Option<ToolCallContributor>,
}

/// Streaming partial parameters for a tool call.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatToolCallDeltaAction {
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
/// standard `chat/toolCallConfirmed` flow to approve or deny.
///
/// For client-provided tools, the server typically sets `confirmed` to
/// `'not-needed'` so the tool transitions directly to `running`, where the
/// owning client can begin execution immediately.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatToolCallReadyAction {
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
pub struct ChatToolCallConfirmedAction {
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
    pub user_suggestion: Option<Message>,
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
pub struct ChatToolCallCompleteAction {
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
pub struct ChatToolCallResultConfirmedAction {
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
pub struct ChatToolCallContentChangedAction {
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

/// Turn finished — the assistant is idle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurnCompleteAction {
    /// Turn identifier
    pub turn_id: String,
}

/// Turn was aborted; server stops processing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurnCancelledAction {
    /// Turn identifier
    pub turn_id: String,
}

/// Error during turn processing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatErrorAction {
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
    /// New title
    pub title: String,
}

/// Token usage report for a turn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUsageAction {
    /// Turn identifier
    pub turn_id: String,
    /// Token usage data
    pub usage: UsageInfo,
}

/// Reasoning/thinking text from the model, appended to a specific reasoning response part.
///
/// The server MUST first emit a `chat/responsePart` to create the target
/// reasoning part, then use this action to append text to it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReasoningAction {
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
    /// New model selection
    pub model: ModelSelection,
}

/// Custom agent selection changed for this session.
///
/// Omitting `agent` (or setting it to `undefined`) clears the selection and
/// resets the session to no selected custom agent (provider default behavior).
///
/// When a turn is currently active, the server MUST defer the change until
/// the active turn completes, then apply it for the next turn (same rule as
/// {@link SessionModelChangedAction | `session/modelChanged`}).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionAgentChangedAction {
    /// New agent selection, or `undefined` to clear the selection and reset the
    /// session to no selected custom agent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentSelection>,
}

/// The read state of the session changed.
///
/// Dispatched by a client to mark a session as read (e.g. after viewing it)
/// or unread (e.g. after new activity since the client last looked at it).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIsReadChangedAction {
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
    /// Whether the session is archived
    pub is_archived: bool,
}

/// The activity description of the session changed.
///
/// Dispatched by the server to indicate what the session is currently doing
/// (e.g. running a tool, thinking). Clear activity by setting it to `undefined`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionActivityChangedAction {
    /// Human-readable description of current activity, or `undefined` to clear
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
}

/// The {@link Changeset | catalogue of changesets} the agent host
/// advertises for this session changed. Replaces
/// {@link SessionState.changesets | `state.changesets`} entirely
/// (full-replacement semantics) — set to `undefined` to clear the
/// catalogue.
///
/// Producers dispatch this whenever entries are added or removed. The
/// fan-out happens through this action so observers see catalogue
/// mutations in the same {@link ChangesetAction | per-changeset} action
/// stream they already follow for file-level updates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionChangesetsChangedAction {
    /// New catalogue, or `undefined` to clear it
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changesets: Option<Vec<Changeset>>,
}

/// Server tools for this session have changed.
///
/// Full-replacement semantics: the `tools` array replaces the previous `serverTools` entirely.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionServerToolsChangedAction {
    /// Updated server tools list (full replacement)
    pub tools: Vec<ToolDefinition>,
}

/// The active client for this session has changed.
///
/// A client dispatches this action with its own `SessionActiveClient` to claim
/// the active role, or with `null` to release it. The server SHOULD reject if
/// another client is already active. The server SHOULD automatically dispatch
/// this action with `activeClient: null` when the active client disconnects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionActiveClientChangedAction {
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
    /// Updated client tools list (full replacement)
    pub tools: Vec<ToolDefinition>,
}

/// A pending message was set (upsert semantics: creates or replaces).
///
/// For steering messages, this always replaces the single steering message.
/// For queued messages, if a message with the given `id` already exists it is
/// updated in place; otherwise it is appended to the queue. If the chat is
/// idle when a queued message is set, the server SHOULD immediately consume it
/// and start a new turn.
///
/// A client is only allowed to send {@link MessageKind.User} messages.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPendingMessageSetAction {
    /// Whether this is a steering or queued message
    pub kind: PendingMessageKind,
    /// Unique identifier for this pending message
    pub id: String,
    /// The message content
    pub message: Message,
}

/// A pending message was removed (steering or queued).
///
/// Dispatched by clients to cancel a pending message, or by the server when
/// it consumes a message (e.g. starting a turn from a queued message or
/// injecting a steering message into the current turn).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPendingMessageRemovedAction {
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
pub struct ChatQueuedMessagesReorderedAction {
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
pub struct ChatInputRequestedAction {
    /// Input request to create or replace
    pub request: ChatInputRequest,
}

/// A client updated, submitted, skipped, or removed a single in-progress answer.
///
/// Dispatching with `answer: undefined` removes that question's answer draft.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputAnswerChangedAction {
    /// Input request identifier
    pub request_id: String,
    /// Question identifier within the input request
    pub question_id: String,
    /// Updated answer, or `undefined` to clear an answer draft
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<ChatInputAnswer>,
}

/// A client accepted, declined, or cancelled a session input request.
///
/// If accepted, the server uses `answers` (when provided) plus the request's
/// synced answer state to resume the blocked operation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputCompletedAction {
    /// Input request identifier
    pub request_id: String,
    /// Completion outcome
    pub response: ChatInputResponseKind,
    /// Optional final answer replacement, keyed by question ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answers: Option<std::collections::HashMap<String, ChatInputAnswer>>,
}

/// The session's customizations have changed.
///
/// Full-replacement semantics: the `customizations` array replaces the
/// previous `customizations` entirely.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomizationsChangedAction {
    /// Updated customization list (full replacement).
    pub customizations: Vec<Customization>,
}

/// A client toggled a container customization on or off.
///
/// Targets a top-level container (plugin or directory) by `id`. Only
/// containers have an `enabled` flag; children are always active when
/// their container is enabled. Is a no-op when no matching container is
/// found.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomizationToggledAction {
    /// The id of the container to toggle.
    pub id: String,
    /// Whether to enable or disable the container.
    pub enabled: bool,
}

/// Upserts a top-level customization (plugin or directory).
///
/// The reducer locates the existing entry by `customization.id`:
///
/// - If found, the entry is replaced entirely with `customization`,
///   including its `children` array. To preserve existing children, the
///   host must include them on the payload.
/// - If not found, the entry is appended.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomizationUpdatedAction {
    /// The customization to upsert (matched by `customization.id`).
    pub customization: Customization,
}

/// Removes a customization by id.
///
/// Searches every container and its children for the entry. If the entry
/// is a container, its children are removed with it. Is a no-op when no
/// matching id is found.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomizationRemovedAction {
    /// The id of the customization to remove.
    pub id: String,
}

/// Updates the runtime fields of an existing
/// {@link McpServerCustomization} — narrow alternative to
/// {@link SessionCustomizationUpdatedAction} for the high-frequency
/// `starting` ↔ `ready` ↔ `authRequired` transitions.
///
/// Locates the target entry by `id`, searching both the top-level
/// customization list and the `children` array of every container.
/// Replaces the entry's {@link McpServerCustomization.state | `state`}
/// and {@link McpServerCustomization.channel | `channel`}
/// (full-replacement semantics: omit `channel` to clear an existing
/// channel URI). Other fields of the customization are preserved.
///
/// Is a no-op when no matching `McpServerCustomization` is found. To
/// update any other field (name, icons, `mcpApp` capabilities, etc.) use
/// {@link SessionCustomizationUpdatedAction} instead.
///
/// When the transition is to {@link McpServerStatus.AuthRequired}
/// because of a request issued mid-turn, the host SHOULD also raise
/// {@link SessionStatus.InputNeeded} on the session — see
/// {@link McpServerAuthRequiredState} for the rationale.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMcpServerStateChangedAction {
    /// The id of the {@link McpServerCustomization} to update.
    pub id: String,
    /// The new lifecycle state.
    pub state: McpServerState,
    /// Updated `mcp://` side-channel URI. Full-replacement: omit to clear
    /// an existing channel (typical when leaving
    /// {@link McpServerStatus.Ready | `Ready`}).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<Uri>,
}

/// Truncates a session's history. If `turnId` is provided, all turns after that
/// turn are removed and the specified turn is kept. If `turnId` is omitted, all
/// turns are removed.
///
/// If there is an active turn it is silently dropped and the chat status
/// returns to `idle`.
///
/// Common use-case: truncate old data then dispatch a new
/// `chat/turnStarted` with an edited message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatTruncatedAction {
    /// Keep turns up to and including this turn. Omit to clear all turns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

/// Client changed a mutable config value mid-session.
///
/// Only properties with `sessionMutable: true` in the config schema may be
/// changed. The server validates and broadcasts the action; the reducer merges
/// the new values into `state.config.values`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigChangedAction {
    /// Updated config values
    pub config: JsonObject,
    /// When `true`, replaces all config values instead of merging
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replace: Option<bool>,
}

/// The session's `_meta` side-channel changed. Replaces `state._meta`
/// entirely (full-replacement semantics). Producers SHOULD merge any
/// keys they wish to preserve into the new value before dispatching.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetaChangedAction {
    /// New `_meta` payload, or `undefined` to clear it
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// The {@link ChangesetState.status} for this changeset transitioned (e.g.
/// `computing → ready`). The error payload is set together with `status`
/// whenever it transitions to {@link ChangesetStatus.Error | Error}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetStatusChangedAction {
    /// New computation lifecycle status.
    pub status: ChangesetStatus,
    /// Cause when `status === ChangesetStatus.Error`; otherwise omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
}

/// Upsert a {@link ChangesetFile} in the changeset — adds a new entry, or
/// replaces an existing one identified by {@link ChangesetFile.id}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetFileSetAction {
    /// The new or replacement file entry.
    pub file: ChangesetFile,
}

/// Remove a {@link ChangesetFile} from the changeset by its id.
///
/// Typically dispatched when a file is reverted, staged out, or otherwise
/// no longer in scope (e.g. a renamed file is replaced by a new entry).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetFileRemovedAction {
    /// The {@link ChangesetFile.id} of the file to remove.
    pub file_id: String,
}

/// The set of operations available on this changeset changed. Full
/// replacement semantics: `operations` replaces the previous list (or
/// removes it entirely when `operations` is `undefined`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetOperationsChangedAction {
    /// Updated operation list. Pass `undefined` to clear all operations.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub operations: Option<Vec<ChangesetOperation>>,
}

/// The {@link ChangesetOperation.status} for a single operation transitioned
/// (e.g. `idle → running → idle`, or `running → error`). The error payload
/// is set together with `status` whenever it transitions to
/// {@link ChangesetOperationStatus.Error | Error}, and cleared on any other
/// transition.
///
/// Targets one operation by its {@link ChangesetOperation.id}. If no
/// operation with that id is currently present in the changeset, the action
/// is a no-op. Use {@link ChangesetOperationsChangedAction} to add, remove,
/// or otherwise replace the operation list itself.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetOperationStatusChangedAction {
    /// The {@link ChangesetOperation.id} whose status changed.
    pub operation_id: String,
    /// New execution status.
    pub status: ChangesetOperationStatus,
    /// Cause when `status === ChangesetOperationStatus.Error`; otherwise omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
}

/// Drop every file from the changeset.
///
/// Two cases use this:
/// 1. The underlying source moved (branch switched, fork point invalidated,
///    …) and the server is recomputing from scratch — subsequent
///    {@link ChangesetFileSetAction} entries will repopulate it.
/// 2. The owning session has ended and the URI is becoming
///    un-subscribable — the server will unsubscribe all clients shortly
///    after dispatching this action.
///
/// Clients SHOULD release any references on receipt and SHOULD NOT
/// distinguish the two cases from the action alone — instead, react to
/// the corresponding session-level lifecycle signal (e.g.
/// `root/sessionRemoved`) for the "going away" case.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetClearedAction {}

/// Upsert an {@link Annotation} in the annotations channel — adds a new
/// annotation, or replaces an existing one identified by
/// {@link Annotation.id}.
///
/// Dispatched by a client to create an annotation (together with its
/// mandatory first entry) or to re-anchor / resolve an existing one; the
/// dispatching client assigns the {@link Annotation.id} and the id of any
/// new entry. When replacing, the full annotation payload (including its
/// {@link Annotation.entries | entries} list) is substituted; producers
/// SHOULD prefer {@link AnnotationsEntrySetAction} for per-entry edits, and
/// {@link AnnotationsUpdatedAction} to resolve / re-anchor an existing
/// annotation, to keep wire updates small.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationsSetAction {
    /// The new or replacement annotation. MUST contain at least one entry.
    pub annotation: Annotation,
}

/// Partially update an existing {@link Annotation}'s own properties — a narrow
/// alternative to {@link AnnotationsSetAction} for the common case of resolving
/// / re-opening or re-anchoring an annotation without resending its
/// {@link Annotation.entries | entries}.
///
/// Targets one annotation by its {@link annotationId}. Only the fields present
/// on the action are written; omitted fields leave the corresponding
/// {@link Annotation} property unchanged. The annotation's
/// {@link Annotation.entries | entries}, {@link Annotation.id | id}, and
/// {@link Annotation._meta | _meta} are never touched — dispatch
/// {@link AnnotationsSetAction} to replace those, to clear {@link range}
/// (re-anchor to the whole file), or {@link AnnotationsEntrySetAction} /
/// {@link AnnotationsEntryRemovedAction} to edit individual entries.
///
/// If {@link annotationId} does not match any current annotation the action is
/// a no-op.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationsUpdatedAction {
    /// The {@link Annotation.id} of the annotation to update.
    pub annotation_id: String,
    /// Re-anchors the annotation to the file versions this turn produced.
    /// Matches a {@link Turn.id} on the owning session. Omit to leave the
    /// current {@link Annotation.turnId} unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    /// Re-anchors the annotation to this file. Omit to leave the current
    /// {@link Annotation.resource} unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource: Option<Uri>,
    /// Narrows the annotation to this range within {@link resource}. Omit to
    /// leave the current {@link Annotation.range} unchanged; this action cannot
    /// clear an existing range — dispatch {@link AnnotationsSetAction} to
    /// re-anchor to the whole file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Marks the annotation resolved (`true`) or re-opens it (`false`). Omit to
    /// leave the current {@link Annotation.resolved} state unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved: Option<bool>,
}

/// Remove an {@link Annotation} from the channel by its id.
///
/// Dispatched to delete an entire annotation and every entry it contains.
/// Because the protocol forbids empty annotations, a client that wants to
/// remove the last remaining entry dispatches this action — collapsing the
/// annotation — rather than {@link AnnotationsEntryRemovedAction}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationsRemovedAction {
    /// The {@link Annotation.id} of the annotation to remove.
    pub annotation_id: String,
}

/// Upsert an {@link AnnotationEntry} within an existing annotation — adds a
/// new entry, or replaces one identified by {@link AnnotationEntry.id}. The
/// dispatching client assigns the {@link AnnotationEntry.id} of a new entry.
/// If {@link annotationId} does not match any current annotation the action
/// is a no-op.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationsEntrySetAction {
    /// The {@link Annotation.id} the entry belongs to.
    pub annotation_id: String,
    /// The new or replacement entry.
    pub entry: AnnotationEntry,
}

/// Remove a single {@link AnnotationEntry} from an annotation without
/// collapsing the annotation itself. Used when more than one entry remains —
/// to remove the last entry a client dispatches {@link AnnotationsRemovedAction}
/// instead, since the protocol forbids empty annotations.
///
/// If either {@link annotationId} or {@link entryId} does not match the
/// current state the action is a no-op.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationsEntryRemovedAction {
    /// The {@link Annotation.id} the entry belongs to.
    pub annotation_id: String,
    /// The {@link AnnotationEntry.id} to remove.
    pub entry_id: String,
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
    /// New terminal title
    pub title: String,
}

/// Terminal working directory changed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCwdChangedAction {
    /// New working directory
    pub cwd: Uri,
}

/// Terminal process exited.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitedAction {
    /// Process exit code. `undefined` if the process was killed without an exit code.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
}

/// Terminal scrollback buffer cleared.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalClearedAction {}

/// Shell integration has loaded and the terminal now supports command
/// detection. The server dispatches this when shell integration becomes
/// available (which may happen asynchronously after the terminal is created).
///
/// Clients MUST NOT assume command detection is available until this action
/// (or `terminal/commandExecuted`) has been received.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandDetectionAvailableAction {}

/// A command has been submitted to the shell and is now executing.
/// All subsequent `terminal/data` actions (until the matching
/// `terminal/commandFinished`) constitute this command's output.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandExecutedAction {
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

/// A batch of resource changes observed by the watcher.
///
/// Watch events are coalesced into batches by the server to keep the
/// action stream tractable; an empty `changes.items` list MUST NOT be
/// dispatched. The reducer does not retain change history — these
/// actions exist purely to deliver events to subscribers, who consume
/// them directly off the action stream and apply their own logic.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceWatchChangedAction {
    /// The set of changes in this batch, wrapped for forward compatibility.
    pub changes: AnyValue,
}

// ─── Partial Summaries ────────────────────────────────────────────────

/// Partial equivalent of ChatSummary — every field is optional for delta updates.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PartialChatSummary {
    /// Chat URI
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource: Option<Uri>,
    /// Chat title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Current chat status (reuses SessionStatus shape)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<u32>,
    /// Human-readable description of what the chat is currently doing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    /// Optional per-chat model override (defaults to the session's model)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelSelection>,
    /// Optional per-chat agent override (defaults to the session's agent)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentSelection>,
    /// How this chat came into existence
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<ChatOrigin>,
    /// How the user can interact with this chat. See {@link ChatInteractivity}.
    ///
    /// Supports agent-team patterns where worker chats are read-only or hidden.
    /// Absence defaults to {@link ChatInteractivity.Full} for backward
    /// compatibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interactivity: Option<ChatInteractivity>,
    /// Optional per-chat working directory.
    ///
    /// If absent, the chat inherits
    /// {@link SessionSummary.workingDirectory | the session's working directory}.
    /// See {@link ChatState.workingDirectory} for usage notes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
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
    #[serde(rename = "session/chatAdded")]
    SessionChatAdded(SessionChatAddedAction),
    #[serde(rename = "session/chatRemoved")]
    SessionChatRemoved(SessionChatRemovedAction),
    #[serde(rename = "session/chatUpdated")]
    SessionChatUpdated(SessionChatUpdatedAction),
    #[serde(rename = "session/defaultChatChanged")]
    SessionDefaultChatChanged(SessionDefaultChatChangedAction),
    #[serde(rename = "chat/turnStarted")]
    ChatTurnStarted(ChatTurnStartedAction),
    #[serde(rename = "chat/delta")]
    ChatDelta(ChatDeltaAction),
    #[serde(rename = "chat/responsePart")]
    ChatResponsePart(ChatResponsePartAction),
    #[serde(rename = "chat/toolCallStart")]
    ChatToolCallStart(ChatToolCallStartAction),
    #[serde(rename = "chat/toolCallDelta")]
    ChatToolCallDelta(ChatToolCallDeltaAction),
    #[serde(rename = "chat/toolCallReady")]
    ChatToolCallReady(ChatToolCallReadyAction),
    #[serde(rename = "chat/toolCallConfirmed")]
    ChatToolCallConfirmed(ChatToolCallConfirmedAction),
    #[serde(rename = "chat/toolCallComplete")]
    ChatToolCallComplete(ChatToolCallCompleteAction),
    #[serde(rename = "chat/toolCallResultConfirmed")]
    ChatToolCallResultConfirmed(ChatToolCallResultConfirmedAction),
    #[serde(rename = "chat/toolCallContentChanged")]
    ChatToolCallContentChanged(ChatToolCallContentChangedAction),
    #[serde(rename = "chat/turnComplete")]
    ChatTurnComplete(ChatTurnCompleteAction),
    #[serde(rename = "chat/turnCancelled")]
    ChatTurnCancelled(ChatTurnCancelledAction),
    #[serde(rename = "chat/error")]
    ChatError(ChatErrorAction),
    #[serde(rename = "session/titleChanged")]
    SessionTitleChanged(SessionTitleChangedAction),
    #[serde(rename = "chat/usage")]
    ChatUsage(ChatUsageAction),
    #[serde(rename = "chat/reasoning")]
    ChatReasoning(ChatReasoningAction),
    #[serde(rename = "session/modelChanged")]
    SessionModelChanged(SessionModelChangedAction),
    #[serde(rename = "session/agentChanged")]
    SessionAgentChanged(SessionAgentChangedAction),
    #[serde(rename = "session/isReadChanged")]
    SessionIsReadChanged(SessionIsReadChangedAction),
    #[serde(rename = "session/isArchivedChanged")]
    SessionIsArchivedChanged(SessionIsArchivedChangedAction),
    #[serde(rename = "session/activityChanged")]
    SessionActivityChanged(SessionActivityChangedAction),
    #[serde(rename = "session/changesetsChanged")]
    SessionChangesetsChanged(SessionChangesetsChangedAction),
    #[serde(rename = "session/serverToolsChanged")]
    SessionServerToolsChanged(SessionServerToolsChangedAction),
    #[serde(rename = "session/activeClientChanged")]
    SessionActiveClientChanged(SessionActiveClientChangedAction),
    #[serde(rename = "session/activeClientToolsChanged")]
    SessionActiveClientToolsChanged(SessionActiveClientToolsChangedAction),
    #[serde(rename = "chat/pendingMessageSet")]
    ChatPendingMessageSet(ChatPendingMessageSetAction),
    #[serde(rename = "chat/pendingMessageRemoved")]
    ChatPendingMessageRemoved(ChatPendingMessageRemovedAction),
    #[serde(rename = "chat/queuedMessagesReordered")]
    ChatQueuedMessagesReordered(ChatQueuedMessagesReorderedAction),
    #[serde(rename = "chat/inputRequested")]
    ChatInputRequested(ChatInputRequestedAction),
    #[serde(rename = "chat/inputAnswerChanged")]
    ChatInputAnswerChanged(ChatInputAnswerChangedAction),
    #[serde(rename = "chat/inputCompleted")]
    ChatInputCompleted(ChatInputCompletedAction),
    #[serde(rename = "session/customizationsChanged")]
    SessionCustomizationsChanged(SessionCustomizationsChangedAction),
    #[serde(rename = "session/customizationToggled")]
    SessionCustomizationToggled(SessionCustomizationToggledAction),
    #[serde(rename = "session/customizationUpdated")]
    SessionCustomizationUpdated(Box<SessionCustomizationUpdatedAction>),
    #[serde(rename = "session/customizationRemoved")]
    SessionCustomizationRemoved(SessionCustomizationRemovedAction),
    #[serde(rename = "session/mcpServerStateChanged")]
    SessionMcpServerStateChanged(Box<SessionMcpServerStateChangedAction>),
    #[serde(rename = "chat/truncated")]
    ChatTruncated(ChatTruncatedAction),
    #[serde(rename = "session/configChanged")]
    SessionConfigChanged(SessionConfigChangedAction),
    #[serde(rename = "session/metaChanged")]
    SessionMetaChanged(SessionMetaChangedAction),
    #[serde(rename = "changeset/statusChanged")]
    ChangesetStatusChanged(ChangesetStatusChangedAction),
    #[serde(rename = "changeset/fileSet")]
    ChangesetFileSet(ChangesetFileSetAction),
    #[serde(rename = "changeset/fileRemoved")]
    ChangesetFileRemoved(ChangesetFileRemovedAction),
    #[serde(rename = "changeset/operationsChanged")]
    ChangesetOperationsChanged(ChangesetOperationsChangedAction),
    #[serde(rename = "changeset/operationStatusChanged")]
    ChangesetOperationStatusChanged(ChangesetOperationStatusChangedAction),
    #[serde(rename = "changeset/cleared")]
    ChangesetCleared(ChangesetClearedAction),
    #[serde(rename = "annotations/set")]
    AnnotationsSet(AnnotationsSetAction),
    #[serde(rename = "annotations/updated")]
    AnnotationsUpdated(AnnotationsUpdatedAction),
    #[serde(rename = "annotations/removed")]
    AnnotationsRemoved(AnnotationsRemovedAction),
    #[serde(rename = "annotations/entrySet")]
    AnnotationsEntrySet(AnnotationsEntrySetAction),
    #[serde(rename = "annotations/entryRemoved")]
    AnnotationsEntryRemoved(AnnotationsEntryRemovedAction),
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
    #[serde(rename = "resourceWatch/changed")]
    ResourceWatchChanged(ResourceWatchChangedAction),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}
