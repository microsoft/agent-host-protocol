// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:go

package ahptypes

import (
	"encoding/json"
)

// Reference the encoding/json import to keep gofmt -d from
// stripping it when a generated file has no struct that mentions
// json.RawMessage directly (rare but possible). Compiled out.
var _ = json.RawMessage(nil)

// ─── ActionType ──────────────────────────────────────────────────────

// Discriminant values for all state actions.
type ActionType string

const (
	ActionTypeRootAgentsChanged                 ActionType = "root/agentsChanged"
	ActionTypeRootActiveSessionsChanged         ActionType = "root/activeSessionsChanged"
	ActionTypeSessionReady                      ActionType = "session/ready"
	ActionTypeSessionCreationFailed             ActionType = "session/creationFailed"
	ActionTypeSessionChatAdded                  ActionType = "session/chatAdded"
	ActionTypeSessionChatRemoved                ActionType = "session/chatRemoved"
	ActionTypeSessionChatUpdated                ActionType = "session/chatUpdated"
	ActionTypeSessionDefaultChatChanged         ActionType = "session/defaultChatChanged"
	ActionTypeChatTurnStarted                   ActionType = "chat/turnStarted"
	ActionTypeChatDelta                         ActionType = "chat/delta"
	ActionTypeChatResponsePart                  ActionType = "chat/responsePart"
	ActionTypeChatToolCallStart                 ActionType = "chat/toolCallStart"
	ActionTypeChatToolCallDelta                 ActionType = "chat/toolCallDelta"
	ActionTypeChatToolCallReady                 ActionType = "chat/toolCallReady"
	ActionTypeChatToolCallConfirmed             ActionType = "chat/toolCallConfirmed"
	ActionTypeChatToolCallComplete              ActionType = "chat/toolCallComplete"
	ActionTypeChatToolCallResultConfirmed       ActionType = "chat/toolCallResultConfirmed"
	ActionTypeChatToolCallContentChanged        ActionType = "chat/toolCallContentChanged"
	ActionTypeChatTurnComplete                  ActionType = "chat/turnComplete"
	ActionTypeChatTurnCancelled                 ActionType = "chat/turnCancelled"
	ActionTypeChatError                         ActionType = "chat/error"
	ActionTypeChatActivityChanged               ActionType = "chat/activityChanged"
	ActionTypeSessionTitleChanged               ActionType = "session/titleChanged"
	ActionTypeChatUsage                         ActionType = "chat/usage"
	ActionTypeChatReasoning                     ActionType = "chat/reasoning"
	ActionTypeSessionServerToolsChanged         ActionType = "session/serverToolsChanged"
	ActionTypeSessionActiveClientSet            ActionType = "session/activeClientSet"
	ActionTypeSessionActiveClientRemoved        ActionType = "session/activeClientRemoved"
	ActionTypeChatPendingMessageSet             ActionType = "chat/pendingMessageSet"
	ActionTypeChatPendingMessageRemoved         ActionType = "chat/pendingMessageRemoved"
	ActionTypeChatQueuedMessagesReordered       ActionType = "chat/queuedMessagesReordered"
	ActionTypeChatDraftChanged                  ActionType = "chat/draftChanged"
	ActionTypeChatInputRequested                ActionType = "chat/inputRequested"
	ActionTypeChatInputAnswerChanged            ActionType = "chat/inputAnswerChanged"
	ActionTypeChatInputCompleted                ActionType = "chat/inputCompleted"
	ActionTypeSessionCustomizationsChanged      ActionType = "session/customizationsChanged"
	ActionTypeSessionCustomizationToggled       ActionType = "session/customizationToggled"
	ActionTypeSessionCustomizationUpdated       ActionType = "session/customizationUpdated"
	ActionTypeSessionCustomizationRemoved       ActionType = "session/customizationRemoved"
	ActionTypeSessionMcpServerStateChanged      ActionType = "session/mcpServerStateChanged"
	ActionTypeChatTruncated                     ActionType = "chat/truncated"
	ActionTypeSessionIsReadChanged              ActionType = "session/isReadChanged"
	ActionTypeSessionIsArchivedChanged          ActionType = "session/isArchivedChanged"
	ActionTypeSessionActivityChanged            ActionType = "session/activityChanged"
	ActionTypeSessionChangesetsChanged          ActionType = "session/changesetsChanged"
	ActionTypeSessionConfigChanged              ActionType = "session/configChanged"
	ActionTypeSessionMetaChanged                ActionType = "session/metaChanged"
	ActionTypeChangesetStatusChanged            ActionType = "changeset/statusChanged"
	ActionTypeChangesetFileSet                  ActionType = "changeset/fileSet"
	ActionTypeChangesetFileRemoved              ActionType = "changeset/fileRemoved"
	ActionTypeChangesetContentChanged           ActionType = "changeset/contentChanged"
	ActionTypeChangesetOperationsChanged        ActionType = "changeset/operationsChanged"
	ActionTypeChangesetOperationStatusChanged   ActionType = "changeset/operationStatusChanged"
	ActionTypeChangesetCleared                  ActionType = "changeset/cleared"
	ActionTypeAnnotationsSet                    ActionType = "annotations/set"
	ActionTypeAnnotationsUpdated                ActionType = "annotations/updated"
	ActionTypeAnnotationsRemoved                ActionType = "annotations/removed"
	ActionTypeAnnotationsEntrySet               ActionType = "annotations/entrySet"
	ActionTypeAnnotationsEntryRemoved           ActionType = "annotations/entryRemoved"
	ActionTypeRootTerminalsChanged              ActionType = "root/terminalsChanged"
	ActionTypeRootConfigChanged                 ActionType = "root/configChanged"
	ActionTypeTerminalData                      ActionType = "terminal/data"
	ActionTypeTerminalInput                     ActionType = "terminal/input"
	ActionTypeTerminalResized                   ActionType = "terminal/resized"
	ActionTypeTerminalClaimed                   ActionType = "terminal/claimed"
	ActionTypeTerminalTitleChanged              ActionType = "terminal/titleChanged"
	ActionTypeTerminalCwdChanged                ActionType = "terminal/cwdChanged"
	ActionTypeTerminalExited                    ActionType = "terminal/exited"
	ActionTypeTerminalCleared                   ActionType = "terminal/cleared"
	ActionTypeTerminalCommandDetectionAvailable ActionType = "terminal/commandDetectionAvailable"
	ActionTypeTerminalCommandExecuted           ActionType = "terminal/commandExecuted"
	ActionTypeTerminalCommandFinished           ActionType = "terminal/commandFinished"
	ActionTypeResourceWatchChanged              ActionType = "resourceWatch/changed"
)

// ─── Action Envelope ─────────────────────────────────────────────────

// Identifies the client that originally dispatched an action.
type ActionOrigin struct {
	ClientId  string `json:"clientId"`
	ClientSeq int64  `json:"clientSeq"`
}

// ActionEnvelope wraps every action with the channel URI it
// belongs to, the server-assigned monotonic sequence number, and an
// optional origin record.
type ActionEnvelope struct {
	Channel         URI           `json:"channel"`
	Action          StateAction   `json:"action"`
	ServerSeq       int64         `json:"serverSeq"`
	Origin          *ActionOrigin `json:"origin,omitempty"`
	RejectionReason *string       `json:"rejectionReason,omitempty"`
}

// ─── Action Payloads ─────────────────────────────────────────────────

// Fired when available agent backends or their models change.
type RootAgentsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated agent list
	Agents []AgentInfo `json:"agents"`
}

// Fired when the number of active sessions changes.
type RootActiveSessionsChangedAction struct {
	Type ActionType `json:"type"`
	// Current count of active sessions
	ActiveSessions int64 `json:"activeSessions"`
}

// Fired when agent-host configuration values change.
//
// By default, the reducer merges the new values into `state.config.values`.
// Set `replace` to `true` to replace all values instead of merging.
type RootConfigChangedAction struct {
	Type ActionType `json:"type"`
	// Updated config values
	Config map[string]json.RawMessage `json:"config"`
	// When `true`, replaces all config values instead of merging
	Replace *bool `json:"replace,omitempty"`
}

// Session backend initialized successfully.
type SessionReadyAction struct {
	Type ActionType `json:"type"`
}

// Session backend failed to initialize.
type SessionCreationFailedAction struct {
	Type ActionType `json:"type"`
	// Error details
	Error ErrorInfo `json:"error"`
}

// A chat was added to this session's catalog. Upsert semantics: if a chat
// with the same `summary.resource` already exists, the existing entry is
// replaced.
//
// Mirrors the root-channel `root/sessionAdded` notification.
type SessionChatAddedAction struct {
	Type ActionType `json:"type"`
	// The full summary of the newly added (or upserted) chat.
	Summary ChatSummary `json:"summary"`
}

// A chat was removed from this session's catalog. No-op when no entry matches.
//
// Mirrors the root-channel `root/sessionRemoved` notification.
type SessionChatRemovedAction struct {
	Type ActionType `json:"type"`
	// The URI of the chat to remove.
	Chat URI `json:"chat"`
}

// One existing chat's summary fields changed.
//
// Partial-update semantics: only fields present in `changes` are written;
// omitted fields are preserved. Identity fields (`resource`) MUST NOT be
// carried in `changes`. No-op when no entry with `chat` exists — clients
// SHOULD then wait for a {@link SessionChatAddedAction | `session/chatAdded`}.
//
// Mirrors the root-channel `root/sessionSummaryChanged` notification.
type SessionChatUpdatedAction struct {
	Type ActionType `json:"type"`
	// The URI of the chat whose summary changed.
	Chat URI `json:"chat"`
	// Mutable summary fields that changed; omitted fields are unchanged.
	//
	// Identity fields (`resource`) never change and MUST be omitted by
	// senders; receivers SHOULD ignore them if present.
	Changes PartialChatSummary `json:"changes"`
}

// The default chat input-routing hint for this session changed.
type SessionDefaultChatChangedAction struct {
	Type ActionType `json:"type"`
	// New default chat URI, or `undefined` to clear the hint.
	DefaultChat *URI `json:"defaultChat,omitempty"`
}

// A new message has been sent to the agent, and a new turn starts.
//
// A client is only allowed to send {@link MessageKind.User} messages.
type ChatTurnStartedAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// The new message
	Message Message `json:"message"`
	// If this turn was auto-started from a queued message, the ID of that message
	QueuedMessageId *string `json:"queuedMessageId,omitempty"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Streaming text chunk from the assistant, appended to a specific response part.
//
// The server MUST first emit a `chat/responsePart` to create the target
// part (markdown or reasoning), then use this action to append text to it.
type ChatDeltaAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Identifier of the response part to append to
	PartId string `json:"partId"`
	// Text chunk
	Content string `json:"content"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Structured content appended to the response.
type ChatResponsePartAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Response part (markdown or content ref)
	Part ResponsePart `json:"part"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// A tool call begins — parameters are streaming from the LM.
//
// The server sets {@link ToolCallContributor | `contributor`} to identify
// the origin of the tool. For client-provided tools, the named client is
// responsible for executing the tool once it reaches the `running` state
// and dispatching `chat/toolCallComplete`. For MCP-served tools, the
// server executes the call against the named `McpServerCustomization`.
type ChatToolCallStartAction struct {
	// Turn identifier
	TurnId string `json:"turnId"`
	// Tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType                 `json:"type"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// Reference to the contributor of the tool being called. Absent for
	// server-side tools that are not contributed by a client or MCP server.
	Contributor *ToolCallContributor `json:"contributor,omitempty"`
}

// Streaming partial parameters for a tool call.
type ChatToolCallDeltaAction struct {
	// Turn identifier
	TurnId string `json:"turnId"`
	// Tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType                 `json:"type"`
	// Partial parameter content to append
	Content string `json:"content"`
	// Updated progress message
	InvocationMessage *StringOrMarkdown `json:"invocationMessage,omitempty"`
}

// Tool call parameters are complete, or a running tool requires re-confirmation.
//
// When dispatched for a `streaming` tool call, transitions to `pending-confirmation`
// or directly to `running` if `confirmed` is set.
//
// When dispatched for a `running` tool call (e.g. mid-execution permission needed),
// transitions back to `pending-confirmation`. The `invocationMessage` and `_meta`
// SHOULD be updated to describe the specific confirmation needed. Clients use the
// standard `chat/toolCallConfirmed` flow to approve or deny.
//
// For client-provided tools, the server typically sets `confirmed` to
// `'not-needed'` so the tool transitions directly to `running`, where the
// owning client can begin execution immediately.
type ChatToolCallReadyAction struct {
	// Turn identifier
	TurnId string `json:"turnId"`
	// Tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType                 `json:"type"`
	// Message describing what the tool will do or what confirmation is needed
	InvocationMessage StringOrMarkdown `json:"invocationMessage"`
	// Raw tool input
	ToolInput *string `json:"toolInput,omitempty"`
	// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
	ConfirmationTitle *StringOrMarkdown `json:"confirmationTitle,omitempty"`
	// File edits that this tool call will perform, for preview before confirmation
	Edits *json.RawMessage `json:"edits,omitempty"`
	// Whether the agent host allows the client to edit the tool's input parameters before confirming
	Editable *bool `json:"editable,omitempty"`
	// If set, the tool was auto-confirmed and transitions directly to `running`
	Confirmed *ToolCallConfirmationReason `json:"confirmed,omitempty"`
	// Options the server offers for this confirmation. When present, the client
	// SHOULD render these instead of a plain approve/deny UI. Each option
	// belongs to a {@link ConfirmationOptionGroup} so the client can still
	// categorise the choices.
	Options []ConfirmationOption `json:"options,omitempty"`
}

// ChatToolCallConfirmedAction is the client approves or denies a
// pending tool call (merged approved + denied variants on the wire).
type ChatToolCallConfirmedAction struct {
	Type             ActionType                  `json:"type"`
	TurnId           string                      `json:"turnId"`
	ToolCallId       string                      `json:"toolCallId"`
	Meta             map[string]json.RawMessage  `json:"_meta,omitempty"`
	Approved         bool                        `json:"approved"`
	Confirmed        *ToolCallConfirmationReason `json:"confirmed,omitempty"`
	Reason           *ToolCallCancellationReason `json:"reason,omitempty"`
	EditedToolInput  *string                     `json:"editedToolInput,omitempty"`
	UserSuggestion   *Message                    `json:"userSuggestion,omitempty"`
	ReasonMessage    *StringOrMarkdown           `json:"reasonMessage,omitempty"`
	SelectedOptionId *string                     `json:"selectedOptionId,omitempty"`
}

// Tool execution finished. Transitions to `completed` or `pending-result-confirmation`
// if `requiresResultConfirmation` is `true`.
//
// For client-provided tools (whose tool call state carries a client
// `ToolCallContributor` with a `clientId`), the owning client dispatches this
// action with the execution result. The server SHOULD reject this action if the
// dispatching client does not match the contributor's `clientId`.
//
// Servers waiting on a client tool call MAY time out after a reasonable duration
// if the implementing client disconnects or becomes unresponsive, and dispatch
// this action with `result.success = false` and an appropriate error.
type ChatToolCallCompleteAction struct {
	// Turn identifier
	TurnId string `json:"turnId"`
	// Tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType                 `json:"type"`
	// Execution result
	Result ToolCallResult `json:"result"`
	// If true, the result requires client approval before finalizing
	RequiresResultConfirmation *bool `json:"requiresResultConfirmation,omitempty"`
}

// Client approves or denies a tool's result.
//
// If `approved` is `false`, the tool transitions to `cancelled` with reason `result-denied`.
type ChatToolCallResultConfirmedAction struct {
	// Turn identifier
	TurnId string `json:"turnId"`
	// Tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType                 `json:"type"`
	// Whether the result was approved
	Approved bool `json:"approved"`
}

// Partial content produced while a tool is still executing.
//
// Replaces the `content` array on the running tool call state. Clients can
// use this to display live feedback (e.g. a terminal reference) before the
// tool completes.
//
// For client-provided tools (whose tool call state carries a client
// `ToolCallContributor` with a `clientId`), the owning client dispatches this
// action to stream intermediate content while executing. The server SHOULD
// reject this action if the dispatching client does not match the contributor's
// `clientId`.
type ChatToolCallContentChangedAction struct {
	// Turn identifier
	TurnId string `json:"turnId"`
	// Tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType                 `json:"type"`
	// The current partial content for the running tool call
	Content []ToolResultContent `json:"content"`
}

// Turn finished — the assistant is idle.
type ChatTurnCompleteAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Turn was aborted; server stops processing.
type ChatTurnCancelledAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Error during turn processing.
type ChatErrorAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Error details
	Error ErrorInfo `json:"error"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// The activity description of this chat changed.
//
// Dispatched by the server to indicate what the chat is currently doing
// (e.g. running a tool, thinking). Clear activity by omitting it or setting it
// to `undefined`.
// Producers SHOULD also update the parent session's chat catalog with
// `session/chatUpdated` so `ChatSummary.activity` stays in sync.
type ChatActivityChangedAction struct {
	Type ActionType `json:"type"`
	// Human-readable description of current activity; omit or set `undefined` to clear
	Activity *string `json:"activity,omitempty"`
}

// Session title updated. Fired by the server when the title is auto-generated
// from conversation, or dispatched by a client to rename a session.
type SessionTitleChangedAction struct {
	Type ActionType `json:"type"`
	// New title
	Title string `json:"title"`
}

// Token usage report for a turn.
type ChatUsageAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Token usage data
	Usage UsageInfo `json:"usage"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Reasoning/thinking text from the model, appended to a specific reasoning response part.
//
// The server MUST first emit a `chat/responsePart` to create the target
// reasoning part, then use this action to append text to it.
type ChatReasoningAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Identifier of the reasoning response part to append to
	PartId string `json:"partId"`
	// Reasoning text chunk
	Content string `json:"content"`
	// Additional provider-specific metadata for this action.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry per-event context that does not fit any
	// other field — for example, attributing the event to a specific agent
	// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
	// convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// A pending message was set (upsert semantics: creates or replaces).
//
// For steering messages, this always replaces the single steering message.
// For queued messages, if a message with the given `id` already exists it is
// updated in place; otherwise it is appended to the queue. If the chat is
// idle when a queued message is set, the server SHOULD immediately consume it
// and start a new turn.
//
// A client is only allowed to send {@link MessageKind.User} messages.
type ChatPendingMessageSetAction struct {
	Type ActionType `json:"type"`
	// Whether this is a steering or queued message
	Kind PendingMessageKind `json:"kind"`
	// Unique identifier for this pending message
	Id string `json:"id"`
	// The message content
	Message Message `json:"message"`
}

// A pending message was removed (steering or queued).
//
// Dispatched by clients to cancel a pending message, or by the server when
// it consumes a message (e.g. starting a turn from a queued message or
// injecting a steering message into the current turn).
type ChatPendingMessageRemovedAction struct {
	Type ActionType `json:"type"`
	// Whether this is a steering or queued message
	Kind PendingMessageKind `json:"kind"`
	// Identifier of the pending message to remove
	Id string `json:"id"`
}

// Reorder the queued messages.
//
// The `order` array contains the IDs of queued messages in their new
// desired order. IDs not present in the current queue are ignored.
// Queued messages whose IDs are absent from `order` are appended at
// the end in their original relative order (so a client with a stale
// view of the queue never silently drops messages).
type ChatQueuedMessagesReorderedAction struct {
	Type ActionType `json:"type"`
	// Queued message IDs in the desired order
	Order []string `json:"order"`
}

// The chat's draft input changed.
//
// Clients MAY periodically sync their local input state — the message the user
// is composing, including its {@link Message.model | model} /
// {@link Message.agent | agent} selection and attachments — into the chat's
// {@link ChatState.draft | `draft`} so it survives reloads and is visible to
// other clients viewing the same chat. Eager syncing is **not** required;
// clients SHOULD debounce and MAY sync only at convenient points. Set `draft`
// to `undefined` to clear it (e.g. once the message is sent).
//
// A client is only allowed to draft {@link MessageKind.User} messages.
type ChatDraftChangedAction struct {
	Type ActionType `json:"type"`
	// New draft message, or `undefined` to clear it
	Draft *Message `json:"draft,omitempty"`
}

// A session requested input from the user.
//
// Full-request upsert semantics: the `request` replaces any existing request
// with the same `id`, or is appended if it is new. Answer drafts are preserved
// unless `request.answers` is provided.
type ChatInputRequestedAction struct {
	Type ActionType `json:"type"`
	// Input request to create or replace
	Request ChatInputRequest `json:"request"`
}

// A client updated, submitted, skipped, or removed a single in-progress answer.
//
// Dispatching with `answer: undefined` removes that question's answer draft.
type ChatInputAnswerChangedAction struct {
	Type ActionType `json:"type"`
	// Input request identifier
	RequestId string `json:"requestId"`
	// Question identifier within the input request
	QuestionId string `json:"questionId"`
	// Updated answer, or `undefined` to clear an answer draft
	Answer *ChatInputAnswer `json:"answer,omitempty"`
}

// A client accepted, declined, or cancelled a session input request.
//
// If accepted, the server uses `answers` (when provided) plus the request's
// synced answer state to resume the blocked operation.
type ChatInputCompletedAction struct {
	Type ActionType `json:"type"`
	// Input request identifier
	RequestId string `json:"requestId"`
	// Completion outcome
	Response ChatInputResponseKind `json:"response"`
	// Optional final answer replacement, keyed by question ID
	Answers map[string]ChatInputAnswer `json:"answers,omitempty"`
}

// Truncates a session's history. If `turnId` is provided, all turns after that
// turn are removed and the specified turn is kept. If `turnId` is omitted, all
// turns are removed.
//
// If there is an active turn it is silently dropped and the chat status
// returns to `idle`.
//
// Common use-case: truncate old data then dispatch a new
// `chat/turnStarted` with an edited message.
type ChatTruncatedAction struct {
	Type ActionType `json:"type"`
	// Keep turns up to and including this turn. Omit to clear all turns.
	TurnId *string `json:"turnId,omitempty"`
}

// The read state of the session changed.
//
// Dispatched by a client to mark a session as read (e.g. after viewing it)
// or unread (e.g. after new activity since the client last looked at it).
type SessionIsReadChangedAction struct {
	Type ActionType `json:"type"`
	// Whether the session has been read
	IsRead bool `json:"isRead"`
}

// The archived state of the session changed.
//
// Dispatched by a client to archive a session (e.g. the task is
// complete) or to unarchive it.
type SessionIsArchivedChangedAction struct {
	Type ActionType `json:"type"`
	// Whether the session is archived
	IsArchived bool `json:"isArchived"`
}

// The activity description of the session changed.
//
// Dispatched by the server to indicate what the session is currently doing
// (e.g. running a tool, thinking). Clear activity by setting it to `undefined`.
type SessionActivityChangedAction struct {
	Type ActionType `json:"type"`
	// Human-readable description of current activity, or `undefined` to clear
	Activity *string `json:"activity,omitempty"`
}

// The {@link Changeset | catalogue of changesets} the agent host
// advertises for this session changed. Replaces
// {@link SessionState.changesets | `state.changesets`} entirely
// (full-replacement semantics) — set to `undefined` to clear the
// catalogue.
//
// Producers dispatch this whenever entries are added or removed. The
// fan-out happens through this action so observers see catalogue
// mutations in the same {@link ChangesetAction | per-changeset} action
// stream they already follow for file-level updates.
type SessionChangesetsChangedAction struct {
	Type ActionType `json:"type"`
	// New catalogue, or `undefined` to clear it
	Changesets []Changeset `json:"changesets,omitempty"`
}

// Server tools for this session have changed.
//
// Full-replacement semantics: the `tools` array replaces the previous `serverTools` entirely.
type SessionServerToolsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated server tools list (full replacement)
	Tools []ToolDefinition `json:"tools"`
}

// An active client for this session was added or updated.
//
// Upsert semantics keyed by {@link SessionActiveClient.clientId | `clientId`}:
// a client dispatches this action with its own `SessionActiveClient` to join
// the session's active clients or refresh its entry, replacing any existing
// entry that has the same `clientId`. Multiple clients may be active at once.
// This is also how a client updates its published tools or customizations —
// re-dispatch with the full, updated entry. Use
// {@link SessionActiveClientRemovedAction | `session/activeClientRemoved`} to
// leave. The server SHOULD automatically dispatch that removal when an active
// client disconnects.
type SessionActiveClientSetAction struct {
	Type ActionType `json:"type"`
	// The active client to add or update, matched by `clientId`.
	ActiveClient SessionActiveClient `json:"activeClient"`
}

// An active client was removed from this session.
//
// Removes the entry for the client identified by `clientId` from
// {@link SessionState.activeClients}; a no-op when no entry matches.
//
// The host SHOULD dispatch this automatically when a client stops participating
// in the session — for example when it unsubscribes from the session channel,
// when it disconnects and does not reconnect within a host-defined grace
// period, or when a `reconnect` command's `subscriptions` omit a session the
// client was still active in. When removing a client, the host SHOULD also
// cancel that client's in-flight tool calls — those whose tool call state
// carries a client `ToolCallContributor` with the matching `clientId` — by
// dispatching `chat/toolCallComplete` with `result.success = false`. (There is
// no per-tool-call server cancel; a failed completion is the cancellation
// mechanism, and the call ends in `completed` status with a failed result.)
type SessionActiveClientRemovedAction struct {
	Type ActionType `json:"type"`
	// The `clientId` of the active client to remove.
	ClientId string `json:"clientId"`
}

// The session's customizations have changed.
//
// Full-replacement semantics: the `customizations` array replaces the
// previous `customizations` entirely.
type SessionCustomizationsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated customization list (full replacement).
	Customizations []Customization `json:"customizations"`
}

// A client toggled a container customization on or off.
//
// Targets a top-level container (plugin or directory) by `id`. Only
// containers have an `enabled` flag; children are always active when
// their container is enabled. Is a no-op when no matching container is
// found.
type SessionCustomizationToggledAction struct {
	Type ActionType `json:"type"`
	// The id of the container to toggle.
	Id string `json:"id"`
	// Whether to enable or disable the container.
	Enabled bool `json:"enabled"`
}

// Upserts a top-level customization (plugin or directory).
//
// The reducer locates the existing entry by `customization.id`:
//
//   - If found, the entry is replaced entirely with `customization`,
//     including its `children` array. To preserve existing children, the
//     host must include them on the payload.
//   - If not found, the entry is appended.
type SessionCustomizationUpdatedAction struct {
	Type ActionType `json:"type"`
	// The customization to upsert (matched by `customization.id`).
	Customization Customization `json:"customization"`
}

// Removes a customization by id.
//
// Searches every container and its children for the entry. If the entry
// is a container, its children are removed with it. Is a no-op when no
// matching id is found.
type SessionCustomizationRemovedAction struct {
	Type ActionType `json:"type"`
	// The id of the customization to remove.
	Id string `json:"id"`
}

// Updates the runtime fields of an existing
// {@link McpServerCustomization} — narrow alternative to
// {@link SessionCustomizationUpdatedAction} for the high-frequency
// `starting` ↔ `ready` ↔ `authRequired` transitions.
//
// Locates the target entry by `id`, searching both the top-level
// customization list and the `children` array of every container.
// Replaces the entry's {@link McpServerCustomization.state | `state`}
// and {@link McpServerCustomization.channel | `channel`}
// (full-replacement semantics: omit `channel` to clear an existing
// channel URI). Other fields of the customization are preserved.
//
// Is a no-op when no matching `McpServerCustomization` is found. To
// update any other field (name, icons, `mcpApp` capabilities, etc.) use
// {@link SessionCustomizationUpdatedAction} instead.
//
// When the transition is to {@link McpServerStatus.AuthRequired}
// because of a request issued mid-turn, the host SHOULD also raise
// {@link SessionStatus.InputNeeded} on the session — see
// {@link McpServerAuthRequiredState} for the rationale.
type SessionMcpServerStateChangedAction struct {
	Type ActionType `json:"type"`
	// The id of the {@link McpServerCustomization} to update.
	Id string `json:"id"`
	// The new lifecycle state.
	State McpServerState `json:"state"`
	// Updated `mcp://` side-channel URI. Full-replacement: omit to clear
	// an existing channel (typical when leaving
	// {@link McpServerStatus.Ready | `Ready`}).
	Channel *URI `json:"channel,omitempty"`
}

// Client changed a mutable config value mid-session.
//
// Only properties with `sessionMutable: true` in the config schema may be
// changed. The server validates and broadcasts the action; the reducer merges
// the new values into `state.config.values`.
type SessionConfigChangedAction struct {
	Type ActionType `json:"type"`
	// Updated config values
	Config map[string]json.RawMessage `json:"config"`
	// When `true`, replaces all config values instead of merging
	Replace *bool `json:"replace,omitempty"`
}

// The session's `_meta` side-channel changed. Replaces `state._meta`
// entirely (full-replacement semantics). Producers SHOULD merge any
// keys they wish to preserve into the new value before dispatching.
type SessionMetaChangedAction struct {
	Type ActionType `json:"type"`
	// New `_meta` payload, or `undefined` to clear it
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// The {@link ChangesetState.status} for this changeset transitioned (e.g.
// `computing → ready`). The error payload is set together with `status`
// whenever it transitions to {@link ChangesetStatus.Error | Error}.
type ChangesetStatusChangedAction struct {
	Type ActionType `json:"type"`
	// New computation lifecycle status.
	Status ChangesetStatus `json:"status"`
	// Cause when `status === ChangesetStatus.Error`; otherwise omitted.
	Error *ErrorInfo `json:"error,omitempty"`
}

// Upsert a {@link ChangesetFile} in the changeset — adds a new entry, or
// replaces an existing one identified by {@link ChangesetFile.id}.
type ChangesetFileSetAction struct {
	Type ActionType `json:"type"`
	// The new or replacement file entry.
	File ChangesetFile `json:"file"`
}

// Remove a {@link ChangesetFile} from the changeset by its id.
//
// Typically dispatched when a file is reverted, staged out, or otherwise
// no longer in scope (e.g. a renamed file is replaced by a new entry).
type ChangesetFileRemovedAction struct {
	Type ActionType `json:"type"`
	// The {@link ChangesetFile.id} of the file to remove.
	FileId string `json:"fileId"`
}

// The changeset's full content changed. Full replacement semantics: `files`
// replaces the previous file list, and `operations`, when present, replaces
// the previous operation list.
//
// Producers SHOULD use this action for initial snapshots and bulk refreshes;
// use {@link ChangesetFileSetAction}, {@link ChangesetFileRemovedAction}, and
// {@link ChangesetOperationsChangedAction} for incremental updates.
type ChangesetContentChangedAction struct {
	Type ActionType `json:"type"`
	// Full replacement file list.
	Files []ChangesetFile `json:"files"`
	// Full replacement operation list. Omit when operations are unchanged.
	Operations []ChangesetOperation `json:"operations,omitempty"`
	// Error information, if the changeset content change failed.
	Error *ErrorInfo `json:"error,omitempty"`
}

// The set of operations available on this changeset changed. Full
// replacement semantics: `operations` replaces the previous list (or
// removes it entirely when `operations` is `undefined`).
type ChangesetOperationsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated operation list. Pass `undefined` to clear all operations.
	Operations []ChangesetOperation `json:"operations,omitempty"`
}

// The {@link ChangesetOperation.status} for a single operation transitioned
// (e.g. `idle → running → idle`, or `running → error`). The error payload
// is set together with `status` whenever it transitions to
// {@link ChangesetOperationStatus.Error | Error}, and cleared on any other
// transition.
//
// Targets one operation by its {@link ChangesetOperation.id}. If no
// operation with that id is currently present in the changeset, the action
// is a no-op. Use {@link ChangesetOperationsChangedAction} to add, remove,
// or otherwise replace the operation list itself.
type ChangesetOperationStatusChangedAction struct {
	Type ActionType `json:"type"`
	// The {@link ChangesetOperation.id} whose status changed.
	OperationId string `json:"operationId"`
	// New execution status.
	Status ChangesetOperationStatus `json:"status"`
	// Cause when `status === ChangesetOperationStatus.Error`; otherwise omitted.
	Error *ErrorInfo `json:"error,omitempty"`
}

// Drop every file from the changeset.
//
// Two cases use this:
//  1. The underlying source moved (branch switched, fork point invalidated,
//     …) and the server is recomputing from scratch — subsequent
//     {@link ChangesetFileSetAction} entries will repopulate it.
//  2. The owning session has ended and the URI is becoming
//     un-subscribable — the server will unsubscribe all clients shortly
//     after dispatching this action.
//
// Clients SHOULD release any references on receipt and SHOULD NOT
// distinguish the two cases from the action alone — instead, react to
// the corresponding session-level lifecycle signal (e.g.
// `root/sessionRemoved`) for the "going away" case.
type ChangesetClearedAction struct {
	Type ActionType `json:"type"`
}

// Upsert an {@link Annotation} in the annotations channel — adds a new
// annotation, or replaces an existing one identified by
// {@link Annotation.id}.
//
// Dispatched by a client to create an annotation (together with its
// mandatory first entry) or to re-anchor / resolve an existing one; the
// dispatching client assigns the {@link Annotation.id} and the id of any
// new entry. When replacing, the full annotation payload (including its
// {@link Annotation.entries | entries} list) is substituted; producers
// SHOULD prefer {@link AnnotationsEntrySetAction} for per-entry edits, and
// {@link AnnotationsUpdatedAction} to resolve / re-anchor an existing
// annotation, to keep wire updates small.
type AnnotationsSetAction struct {
	Type ActionType `json:"type"`
	// The new or replacement annotation. MUST contain at least one entry.
	Annotation Annotation `json:"annotation"`
}

// Partially update an existing {@link Annotation}'s own properties — a narrow
// alternative to {@link AnnotationsSetAction} for the common case of resolving
// / re-opening or re-anchoring an annotation without resending its
// {@link Annotation.entries | entries}.
//
// Targets one annotation by its {@link annotationId}. Only the fields present
// on the action are written; omitted fields leave the corresponding
// {@link Annotation} property unchanged. The annotation's
// {@link Annotation.entries | entries}, {@link Annotation.id | id}, and
// {@link Annotation._meta | _meta} are never touched — dispatch
// {@link AnnotationsSetAction} to replace those, to clear {@link range}
// (re-anchor to the whole file), or {@link AnnotationsEntrySetAction} /
// {@link AnnotationsEntryRemovedAction} to edit individual entries.
//
// If {@link annotationId} does not match any current annotation the action is
// a no-op.
type AnnotationsUpdatedAction struct {
	Type ActionType `json:"type"`
	// The {@link Annotation.id} of the annotation to update.
	AnnotationId string `json:"annotationId"`
	// Re-anchors the annotation to the file versions this turn produced.
	// Matches a {@link Turn.id} on the owning session. Omit to leave the
	// current {@link Annotation.turnId} unchanged.
	TurnId *string `json:"turnId,omitempty"`
	// Re-anchors the annotation to this file. Omit to leave the current
	// {@link Annotation.resource} unchanged.
	Resource *URI `json:"resource,omitempty"`
	// Narrows the annotation to this range within {@link resource}. Omit to
	// leave the current {@link Annotation.range} unchanged; this action cannot
	// clear an existing range — dispatch {@link AnnotationsSetAction} to
	// re-anchor to the whole file.
	Range *TextRange `json:"range,omitempty"`
	// Marks the annotation resolved (`true`) or re-opens it (`false`). Omit to
	// leave the current {@link Annotation.resolved} state unchanged.
	Resolved *bool `json:"resolved,omitempty"`
}

// Remove an {@link Annotation} from the channel by its id.
//
// Dispatched to delete an entire annotation and every entry it contains.
// Because the protocol forbids empty annotations, a client that wants to
// remove the last remaining entry dispatches this action — collapsing the
// annotation — rather than {@link AnnotationsEntryRemovedAction}.
type AnnotationsRemovedAction struct {
	Type ActionType `json:"type"`
	// The {@link Annotation.id} of the annotation to remove.
	AnnotationId string `json:"annotationId"`
}

// Upsert an {@link AnnotationEntry} within an existing annotation — adds a
// new entry, or replaces one identified by {@link AnnotationEntry.id}. The
// dispatching client assigns the {@link AnnotationEntry.id} of a new entry.
// If {@link annotationId} does not match any current annotation the action
// is a no-op.
type AnnotationsEntrySetAction struct {
	Type ActionType `json:"type"`
	// The {@link Annotation.id} the entry belongs to.
	AnnotationId string `json:"annotationId"`
	// The new or replacement entry.
	Entry AnnotationEntry `json:"entry"`
}

// Remove a single {@link AnnotationEntry} from an annotation without
// collapsing the annotation itself. Used when more than one entry remains —
// to remove the last entry a client dispatches {@link AnnotationsRemovedAction}
// instead, since the protocol forbids empty annotations.
//
// If either {@link annotationId} or {@link entryId} does not match the
// current state the action is a no-op.
type AnnotationsEntryRemovedAction struct {
	Type ActionType `json:"type"`
	// The {@link Annotation.id} the entry belongs to.
	AnnotationId string `json:"annotationId"`
	// The {@link AnnotationEntry.id} to remove.
	EntryId string `json:"entryId"`
}

// Fired when the list of known terminals changes.
//
// Full-replacement semantics: the `terminals` array replaces the previous
// `terminals` entirely.
type RootTerminalsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated terminal list (full replacement)
	Terminals []TerminalInfo `json:"terminals"`
}

// Terminal output data (pty → client direction).
//
// Appends `data` to the terminal's `content` in the reducer.
//
// `terminal/data` and `terminal/input` are intentionally separate actions
// because standard write-ahead reconciliation is not safe for terminal I/O.
// A pty is a stateful, mutable process — optimistically applying input or
// predicting output would produce incorrect state. Instead, `terminal/input`
// is a side-effect-only action (client → server → pty), and `terminal/data`
// is server-authoritative output (pty → server → client).
type TerminalDataAction struct {
	Type ActionType `json:"type"`
	// Output data (may contain ANSI escape sequences)
	Data string `json:"data"`
}

// Keyboard input sent to the terminal process (client → pty direction).
//
// This is a side-effect-only action: the server forwards the data to the
// terminal's pty. The reducer treats this as a no-op since `terminal/data`
// actions will reflect any resulting output.
//
// See `terminal/data` for why these two actions are kept separate.
type TerminalInputAction struct {
	Type ActionType `json:"type"`
	// Input data to send to the pty
	Data string `json:"data"`
}

// Terminal dimensions changed.
//
// Dispatchable by clients to request a resize, or by the server to inform
// clients of the actual terminal dimensions.
type TerminalResizedAction struct {
	Type ActionType `json:"type"`
	// Terminal width in columns
	Cols int64 `json:"cols"`
	// Terminal height in rows
	Rows int64 `json:"rows"`
}

// Terminal claim changed. A client or session transfers ownership of the terminal.
//
// The server SHOULD reject if the dispatching client does not currently hold
// the claim.
type TerminalClaimedAction struct {
	Type ActionType `json:"type"`
	// The new claim
	Claim TerminalClaim `json:"claim"`
}

// Terminal title changed.
//
// Fired by the server when the terminal process updates its title (e.g. via
// escape sequences), or dispatched by a client to rename a terminal.
type TerminalTitleChangedAction struct {
	Type ActionType `json:"type"`
	// New terminal title
	Title string `json:"title"`
}

// Terminal working directory changed.
type TerminalCwdChangedAction struct {
	Type ActionType `json:"type"`
	// New working directory
	Cwd URI `json:"cwd"`
}

// Terminal process exited.
type TerminalExitedAction struct {
	Type ActionType `json:"type"`
	// Process exit code. `undefined` if the process was killed without an exit code.
	ExitCode *int64 `json:"exitCode,omitempty"`
}

// Terminal scrollback buffer cleared.
type TerminalClearedAction struct {
	Type ActionType `json:"type"`
}

// Shell integration has loaded and the terminal now supports command
// detection. The server dispatches this when shell integration becomes
// available (which may happen asynchronously after the terminal is created).
//
// Clients MUST NOT assume command detection is available until this action
// (or `terminal/commandExecuted`) has been received.
type TerminalCommandDetectionAvailableAction struct {
	Type ActionType `json:"type"`
}

// A command has been submitted to the shell and is now executing.
// All subsequent `terminal/data` actions (until the matching
// `terminal/commandFinished`) constitute this command's output.
type TerminalCommandExecutedAction struct {
	Type ActionType `json:"type"`
	// Stable identifier for this command, scoped to the terminal URI.
	// Allows correlating `commandExecuted` → `commandFinished` pairs.
	CommandId string `json:"commandId"`
	// The command line text that was submitted
	CommandLine string `json:"commandLine"`
	// Unix timestamp (ms) of when the command started executing, as measured
	// on the server.
	Timestamp int64 `json:"timestamp"`
}

// A command has finished executing.
//
// The sequence of `terminal/data` actions between the preceding
// `terminal/commandExecuted` (same `commandId`) and this action constitutes
// the complete output of the command.
type TerminalCommandFinishedAction struct {
	Type ActionType `json:"type"`
	// Matches the `commandId` from the corresponding `commandExecuted`
	CommandId string `json:"commandId"`
	// Shell exit code. `undefined` if the shell did not report one.
	ExitCode *int64 `json:"exitCode,omitempty"`
	// Wall-clock duration of the command in milliseconds, as measured by the
	// shell integration script on the server side.
	DurationMs *int64 `json:"durationMs,omitempty"`
}

// A batch of resource changes observed by the watcher.
//
// Watch events are coalesced into batches by the server to keep the
// action stream tractable; an empty `changes.items` list MUST NOT be
// dispatched. The reducer does not retain change history — these
// actions exist purely to deliver events to subscribers, who consume
// them directly off the action stream and apply their own logic.
type ResourceWatchChangedAction struct {
	Type ActionType `json:"type"`
	// The set of changes in this batch, wrapped for forward compatibility.
	Changes json.RawMessage `json:"changes"`
}

// ─── StateAction Union ───────────────────────────────────────────────

// StateAction is the discriminated union of every state action.
type StateAction struct {
	Value isStateAction
}

// isStateAction is the marker interface implemented by every
// concrete variant of StateAction.
type isStateAction interface{ isStateAction() }

func (*RootAgentsChangedAction) isStateAction()                 {}
func (*RootActiveSessionsChangedAction) isStateAction()         {}
func (*RootConfigChangedAction) isStateAction()                 {}
func (*SessionReadyAction) isStateAction()                      {}
func (*SessionCreationFailedAction) isStateAction()             {}
func (*SessionChatAddedAction) isStateAction()                  {}
func (*SessionChatRemovedAction) isStateAction()                {}
func (*SessionChatUpdatedAction) isStateAction()                {}
func (*SessionDefaultChatChangedAction) isStateAction()         {}
func (*ChatTurnStartedAction) isStateAction()                   {}
func (*ChatDeltaAction) isStateAction()                         {}
func (*ChatResponsePartAction) isStateAction()                  {}
func (*ChatToolCallStartAction) isStateAction()                 {}
func (*ChatToolCallDeltaAction) isStateAction()                 {}
func (*ChatToolCallReadyAction) isStateAction()                 {}
func (*ChatToolCallConfirmedAction) isStateAction()             {}
func (*ChatToolCallCompleteAction) isStateAction()              {}
func (*ChatToolCallResultConfirmedAction) isStateAction()       {}
func (*ChatToolCallContentChangedAction) isStateAction()        {}
func (*ChatTurnCompleteAction) isStateAction()                  {}
func (*ChatTurnCancelledAction) isStateAction()                 {}
func (*ChatErrorAction) isStateAction()                         {}
func (*ChatActivityChangedAction) isStateAction()               {}
func (*SessionTitleChangedAction) isStateAction()               {}
func (*ChatUsageAction) isStateAction()                         {}
func (*ChatReasoningAction) isStateAction()                     {}
func (*ChatPendingMessageSetAction) isStateAction()             {}
func (*ChatPendingMessageRemovedAction) isStateAction()         {}
func (*ChatQueuedMessagesReorderedAction) isStateAction()       {}
func (*ChatDraftChangedAction) isStateAction()                  {}
func (*ChatInputRequestedAction) isStateAction()                {}
func (*ChatInputAnswerChangedAction) isStateAction()            {}
func (*ChatInputCompletedAction) isStateAction()                {}
func (*ChatTruncatedAction) isStateAction()                     {}
func (*SessionIsReadChangedAction) isStateAction()              {}
func (*SessionIsArchivedChangedAction) isStateAction()          {}
func (*SessionActivityChangedAction) isStateAction()            {}
func (*SessionChangesetsChangedAction) isStateAction()          {}
func (*SessionServerToolsChangedAction) isStateAction()         {}
func (*SessionActiveClientSetAction) isStateAction()            {}
func (*SessionActiveClientRemovedAction) isStateAction()        {}
func (*SessionCustomizationsChangedAction) isStateAction()      {}
func (*SessionCustomizationToggledAction) isStateAction()       {}
func (*SessionCustomizationUpdatedAction) isStateAction()       {}
func (*SessionCustomizationRemovedAction) isStateAction()       {}
func (*SessionMcpServerStateChangedAction) isStateAction()      {}
func (*SessionConfigChangedAction) isStateAction()              {}
func (*SessionMetaChangedAction) isStateAction()                {}
func (*ChangesetStatusChangedAction) isStateAction()            {}
func (*ChangesetFileSetAction) isStateAction()                  {}
func (*ChangesetFileRemovedAction) isStateAction()              {}
func (*ChangesetContentChangedAction) isStateAction()           {}
func (*ChangesetOperationsChangedAction) isStateAction()        {}
func (*ChangesetOperationStatusChangedAction) isStateAction()   {}
func (*ChangesetClearedAction) isStateAction()                  {}
func (*AnnotationsSetAction) isStateAction()                    {}
func (*AnnotationsUpdatedAction) isStateAction()                {}
func (*AnnotationsRemovedAction) isStateAction()                {}
func (*AnnotationsEntrySetAction) isStateAction()               {}
func (*AnnotationsEntryRemovedAction) isStateAction()           {}
func (*RootTerminalsChangedAction) isStateAction()              {}
func (*TerminalDataAction) isStateAction()                      {}
func (*TerminalInputAction) isStateAction()                     {}
func (*TerminalResizedAction) isStateAction()                   {}
func (*TerminalClaimedAction) isStateAction()                   {}
func (*TerminalTitleChangedAction) isStateAction()              {}
func (*TerminalCwdChangedAction) isStateAction()                {}
func (*TerminalExitedAction) isStateAction()                    {}
func (*TerminalClearedAction) isStateAction()                   {}
func (*TerminalCommandDetectionAvailableAction) isStateAction() {}
func (*TerminalCommandExecutedAction) isStateAction()           {}
func (*TerminalCommandFinishedAction) isStateAction()           {}
func (*ResourceWatchChangedAction) isStateAction()              {}

// StateActionUnknown carries an unrecognized StateAction variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type StateActionUnknown struct {
	Raw json.RawMessage
}

func (*StateActionUnknown) isStateAction() {}

// UnmarshalJSON decodes the variant indicated by the "type" discriminator.
func (u *StateAction) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "type")
	if err != nil {
		return err
	}
	switch disc {
	case "root/agentsChanged":
		var value RootAgentsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "root/activeSessionsChanged":
		var value RootActiveSessionsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "root/configChanged":
		var value RootConfigChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/ready":
		var value SessionReadyAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/creationFailed":
		var value SessionCreationFailedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/chatAdded":
		var value SessionChatAddedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/chatRemoved":
		var value SessionChatRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/chatUpdated":
		var value SessionChatUpdatedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/defaultChatChanged":
		var value SessionDefaultChatChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/turnStarted":
		var value ChatTurnStartedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/delta":
		var value ChatDeltaAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/responsePart":
		var value ChatResponsePartAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/toolCallStart":
		var value ChatToolCallStartAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/toolCallDelta":
		var value ChatToolCallDeltaAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/toolCallReady":
		var value ChatToolCallReadyAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/toolCallConfirmed":
		var value ChatToolCallConfirmedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/toolCallComplete":
		var value ChatToolCallCompleteAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/toolCallResultConfirmed":
		var value ChatToolCallResultConfirmedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/toolCallContentChanged":
		var value ChatToolCallContentChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/turnComplete":
		var value ChatTurnCompleteAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/turnCancelled":
		var value ChatTurnCancelledAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/error":
		var value ChatErrorAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/activityChanged":
		var value ChatActivityChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/titleChanged":
		var value SessionTitleChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/usage":
		var value ChatUsageAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/reasoning":
		var value ChatReasoningAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/pendingMessageSet":
		var value ChatPendingMessageSetAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/pendingMessageRemoved":
		var value ChatPendingMessageRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/queuedMessagesReordered":
		var value ChatQueuedMessagesReorderedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/draftChanged":
		var value ChatDraftChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/inputRequested":
		var value ChatInputRequestedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/inputAnswerChanged":
		var value ChatInputAnswerChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/inputCompleted":
		var value ChatInputCompletedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "chat/truncated":
		var value ChatTruncatedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/isReadChanged":
		var value SessionIsReadChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/isArchivedChanged":
		var value SessionIsArchivedChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/activityChanged":
		var value SessionActivityChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/changesetsChanged":
		var value SessionChangesetsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/serverToolsChanged":
		var value SessionServerToolsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/activeClientSet":
		var value SessionActiveClientSetAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/activeClientRemoved":
		var value SessionActiveClientRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/customizationsChanged":
		var value SessionCustomizationsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/customizationToggled":
		var value SessionCustomizationToggledAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/customizationUpdated":
		var value SessionCustomizationUpdatedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/customizationRemoved":
		var value SessionCustomizationRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/mcpServerStateChanged":
		var value SessionMcpServerStateChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/configChanged":
		var value SessionConfigChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/metaChanged":
		var value SessionMetaChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "changeset/statusChanged":
		var value ChangesetStatusChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "changeset/fileSet":
		var value ChangesetFileSetAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "changeset/fileRemoved":
		var value ChangesetFileRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "changeset/contentChanged":
		var value ChangesetContentChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "changeset/operationsChanged":
		var value ChangesetOperationsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "changeset/operationStatusChanged":
		var value ChangesetOperationStatusChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "changeset/cleared":
		var value ChangesetClearedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "annotations/set":
		var value AnnotationsSetAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "annotations/updated":
		var value AnnotationsUpdatedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "annotations/removed":
		var value AnnotationsRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "annotations/entrySet":
		var value AnnotationsEntrySetAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "annotations/entryRemoved":
		var value AnnotationsEntryRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "root/terminalsChanged":
		var value RootTerminalsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/data":
		var value TerminalDataAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/input":
		var value TerminalInputAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/resized":
		var value TerminalResizedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/claimed":
		var value TerminalClaimedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/titleChanged":
		var value TerminalTitleChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/cwdChanged":
		var value TerminalCwdChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/exited":
		var value TerminalExitedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/cleared":
		var value TerminalClearedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/commandDetectionAvailable":
		var value TerminalCommandDetectionAvailableAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/commandExecuted":
		var value TerminalCommandExecutedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal/commandFinished":
		var value TerminalCommandFinishedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "resourceWatch/changed":
		var value ResourceWatchChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &StateActionUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u StateAction) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*StateActionUnknown); ok {
		if len(unk.Raw) == 0 {
			return []byte("null"), nil
		}
		return unk.Raw, nil
	}
	if u.Value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(u.Value)
}
