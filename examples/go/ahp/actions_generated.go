// Code generated from types/*.ts — DO NOT EDIT.

package ahp

import (
	"encoding/json"
	"fmt"
)

// ── ActionType ────────────────────────────────────────────────────────────────

// Discriminant values for all state actions.
type ActionType string

const (
	ActionTypeRootAgentsChanged ActionType = "root/agentsChanged"
	ActionTypeRootActiveSessionsChanged ActionType = "root/activeSessionsChanged"
	ActionTypeSessionReady ActionType = "session/ready"
	ActionTypeSessionCreationFailed ActionType = "session/creationFailed"
	ActionTypeSessionTurnStarted ActionType = "session/turnStarted"
	ActionTypeSessionDelta ActionType = "session/delta"
	ActionTypeSessionResponsePart ActionType = "session/responsePart"
	ActionTypeSessionToolCallStart ActionType = "session/toolCallStart"
	ActionTypeSessionToolCallDelta ActionType = "session/toolCallDelta"
	ActionTypeSessionToolCallReady ActionType = "session/toolCallReady"
	ActionTypeSessionToolCallConfirmed ActionType = "session/toolCallConfirmed"
	ActionTypeSessionToolCallComplete ActionType = "session/toolCallComplete"
	ActionTypeSessionToolCallResultConfirmed ActionType = "session/toolCallResultConfirmed"
	ActionTypeSessionToolCallContentChanged ActionType = "session/toolCallContentChanged"
	ActionTypeSessionTurnComplete ActionType = "session/turnComplete"
	ActionTypeSessionTurnCancelled ActionType = "session/turnCancelled"
	ActionTypeSessionError ActionType = "session/error"
	ActionTypeSessionTitleChanged ActionType = "session/titleChanged"
	ActionTypeSessionUsage ActionType = "session/usage"
	ActionTypeSessionReasoning ActionType = "session/reasoning"
	ActionTypeSessionModelChanged ActionType = "session/modelChanged"
	ActionTypeSessionServerToolsChanged ActionType = "session/serverToolsChanged"
	ActionTypeSessionActiveClientChanged ActionType = "session/activeClientChanged"
	ActionTypeSessionActiveClientToolsChanged ActionType = "session/activeClientToolsChanged"
	ActionTypeSessionPendingMessageSet ActionType = "session/pendingMessageSet"
	ActionTypeSessionPendingMessageRemoved ActionType = "session/pendingMessageRemoved"
	ActionTypeSessionQueuedMessagesReordered ActionType = "session/queuedMessagesReordered"
	ActionTypeSessionInputRequested ActionType = "session/inputRequested"
	ActionTypeSessionInputAnswerChanged ActionType = "session/inputAnswerChanged"
	ActionTypeSessionInputCompleted ActionType = "session/inputCompleted"
	ActionTypeSessionCustomizationsChanged ActionType = "session/customizationsChanged"
	ActionTypeSessionCustomizationToggled ActionType = "session/customizationToggled"
	ActionTypeSessionTruncated ActionType = "session/truncated"
	ActionTypeSessionIsReadChanged ActionType = "session/isReadChanged"
	ActionTypeSessionIsDoneChanged ActionType = "session/isDoneChanged"
	ActionTypeSessionDiffsChanged ActionType = "session/diffsChanged"
	ActionTypeSessionConfigChanged ActionType = "session/configChanged"
	ActionTypeRootTerminalsChanged ActionType = "root/terminalsChanged"
	ActionTypeRootConfigChanged ActionType = "root/configChanged"
	ActionTypeTerminalData ActionType = "terminal/data"
	ActionTypeTerminalInput ActionType = "terminal/input"
	ActionTypeTerminalResized ActionType = "terminal/resized"
	ActionTypeTerminalClaimed ActionType = "terminal/claimed"
	ActionTypeTerminalTitleChanged ActionType = "terminal/titleChanged"
	ActionTypeTerminalCwdChanged ActionType = "terminal/cwdChanged"
	ActionTypeTerminalExited ActionType = "terminal/exited"
	ActionTypeTerminalCleared ActionType = "terminal/cleared"
	ActionTypeTerminalCommandDetectionAvailable ActionType = "terminal/commandDetectionAvailable"
	ActionTypeTerminalCommandExecuted ActionType = "terminal/commandExecuted"
	ActionTypeTerminalCommandFinished ActionType = "terminal/commandFinished"
)

// ── Action Infrastructure ─────────────────────────────────────────────────────

// ActionOrigin Identifies the client that originally dispatched an action.
type ActionOrigin struct {
	ClientID string `json:"clientId"`
	ClientSeq int `json:"clientSeq"`
}

// ActionEnvelope Every action is wrapped in an `ActionEnvelope`.
type ActionEnvelope struct {
	Action StateAction `json:"action"`
	ServerSeq int `json:"serverSeq"`
	Origin *ActionOrigin `json:"origin,omitempty"`
	RejectionReason *string `json:"rejectionReason,omitempty"`
}

// ── Action Types ─────────────────────────────────────────────────────────────

// RootAgentsChangedAction Fired when available agent backends or their models change.
type RootAgentsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated agent list
	Agents []AgentInfo `json:"agents"`
}

// RootActiveSessionsChangedAction Fired when the number of active sessions changes.
type RootActiveSessionsChangedAction struct {
	Type ActionType `json:"type"`
	// Current count of active sessions
	ActiveSessions int `json:"activeSessions"`
}

// SessionReadyAction Session backend initialized successfully.
type SessionReadyAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
}

// SessionCreationFailedAction Session backend failed to initialize.
type SessionCreationFailedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Error details
	Error ErrorInfo `json:"error"`
}

// SessionTurnStartedAction User sent a message; server starts agent processing.
type SessionTurnStartedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// User's message
	UserMessage UserMessage `json:"userMessage"`
	// If this turn was auto-started from a queued message, the ID of that message
	QueuedMessageID *string `json:"queuedMessageId,omitempty"`
}

// SessionDeltaAction Streaming text chunk from the assistant, appended to a specific response part.
type SessionDeltaAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Identifier of the response part to append to
	PartID string `json:"partId"`
	// Text chunk
	Content string `json:"content"`
}

// SessionResponsePartAction Structured content appended to the response.
type SessionResponsePartAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Response part (markdown or content ref)
	Part ResponsePart `json:"part"`
}

// SessionToolCallStartAction A tool call begins — parameters are streaming from the LM.
type SessionToolCallStartAction struct {
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType `json:"type"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	ToolClientID *string `json:"toolClientId,omitempty"`
}

// SessionToolCallDeltaAction Streaming partial parameters for a tool call.
type SessionToolCallDeltaAction struct {
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType `json:"type"`
	// Partial parameter content to append
	Content string `json:"content"`
	// Updated progress message
	InvocationMessage *StringOrMarkdown `json:"invocationMessage,omitempty"`
}

// SessionToolCallReadyAction Tool call parameters are complete, or a running tool requires re-confirmation.
type SessionToolCallReadyAction struct {
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType `json:"type"`
	// Message describing what the tool will do or what confirmation is needed
	InvocationMessage StringOrMarkdown `json:"invocationMessage"`
	// Raw tool input
	ToolInput *string `json:"toolInput,omitempty"`
	// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
	ConfirmationTitle *StringOrMarkdown `json:"confirmationTitle,omitempty"`
	// File edits that this tool call will perform, for preview before confirmation
	Edits json.RawMessage `json:"edits,omitempty"`
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

// SessionToolCallConfirmedAction represents a client approving or denying a pending tool call.
type SessionToolCallConfirmedAction struct {
	Type           string                      `json:"type"`
	Session        string                      `json:"session"`
	TurnID         string                      `json:"turnId"`
	ToolCallID     string                      `json:"toolCallId"`
	Approved       bool                        `json:"approved"`
	Confirmed      *ToolCallConfirmationReason  `json:"confirmed,omitempty"`
	Reason         *ToolCallCancellationReason  `json:"reason,omitempty"`
	UserSuggestion *UserMessage                `json:"userSuggestion,omitempty"`
	ReasonMessage  *StringOrMarkdown           `json:"reasonMessage,omitempty"`
	Meta           map[string]json.RawMessage  `json:"_meta,omitempty"`
}

// SessionToolCallCompleteAction Tool execution finished. Transitions to `completed` or `pending-result-confirmation`
type SessionToolCallCompleteAction struct {
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType `json:"type"`
	// Execution result
	Result ToolCallResult `json:"result"`
	// If true, the result requires client approval before finalizing
	RequiresResultConfirmation *bool `json:"requiresResultConfirmation,omitempty"`
}

// SessionToolCallResultConfirmedAction Client approves or denies a tool's result.
type SessionToolCallResultConfirmedAction struct {
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType `json:"type"`
	// Whether the result was approved
	Approved bool `json:"approved"`
}

// SessionTurnCompleteAction Turn finished — the assistant is idle.
type SessionTurnCompleteAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
}

// SessionTurnCancelledAction Turn was aborted; server stops processing.
type SessionTurnCancelledAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
}

// SessionErrorAction Error during turn processing.
type SessionErrorAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Error details
	Error ErrorInfo `json:"error"`
}

// SessionTitleChangedAction Session title updated. Fired by the server when the title is auto-generated
type SessionTitleChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// New title
	Title string `json:"title"`
}

// SessionUsageAction Token usage report for a turn.
type SessionUsageAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Token usage data
	Usage UsageInfo `json:"usage"`
}

// SessionReasoningAction Reasoning/thinking text from the model, appended to a specific reasoning response part.
type SessionReasoningAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Identifier of the reasoning response part to append to
	PartID string `json:"partId"`
	// Reasoning text chunk
	Content string `json:"content"`
}

// SessionModelChangedAction Model changed for this session.
type SessionModelChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// New model selection
	Model ModelSelection `json:"model"`
}

// SessionIsReadChangedAction The read state of the session changed.
type SessionIsReadChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Whether the session has been read
	IsRead bool `json:"isRead"`
}

// SessionIsDoneChangedAction The done state of the session changed.
type SessionIsDoneChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Whether the session is done
	IsDone bool `json:"isDone"`
}

// SessionServerToolsChangedAction Server tools for this session have changed.
type SessionServerToolsChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Updated server tools list (full replacement)
	Tools []ToolDefinition `json:"tools"`
}

// SessionActiveClientChangedAction The active client for this session has changed.
type SessionActiveClientChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// The new active client, or `null` to unset
	ActiveClient *SessionActiveClient `json:"activeClient"`
}

// SessionActiveClientToolsChangedAction The active client's tool list has changed.
type SessionActiveClientToolsChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Updated client tools list (full replacement)
	Tools []ToolDefinition `json:"tools"`
}

// SessionPendingMessageSetAction A pending message was set (upsert semantics: creates or replaces).
type SessionPendingMessageSetAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Whether this is a steering or queued message
	Kind PendingMessageKind `json:"kind"`
	// Unique identifier for this pending message
	ID string `json:"id"`
	// The message content
	UserMessage UserMessage `json:"userMessage"`
}

// SessionPendingMessageRemovedAction A pending message was removed (steering or queued).
type SessionPendingMessageRemovedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Whether this is a steering or queued message
	Kind PendingMessageKind `json:"kind"`
	// Identifier of the pending message to remove
	ID string `json:"id"`
}

// SessionQueuedMessagesReorderedAction Reorder the queued messages.
type SessionQueuedMessagesReorderedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Queued message IDs in the desired order
	Order []string `json:"order"`
}

// SessionInputRequestedAction A session requested input from the user.
type SessionInputRequestedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Input request to create or replace
	Request SessionInputRequest `json:"request"`
}

// SessionInputAnswerChangedAction A client updated, submitted, skipped, or removed a single in-progress answer.
type SessionInputAnswerChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Input request identifier
	RequestID string `json:"requestId"`
	// Question identifier within the input request
	QuestionID string `json:"questionId"`
	// Updated answer, or `undefined` to clear an answer draft
	Answer *SessionInputAnswer `json:"answer,omitempty"`
}

// SessionInputCompletedAction A client accepted, declined, or cancelled a session input request.
type SessionInputCompletedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Input request identifier
	RequestID string `json:"requestId"`
	// Completion outcome
	Response SessionInputResponseKind `json:"response"`
	// Optional final answer replacement, keyed by question ID
	Answers map[string]SessionInputAnswer `json:"answers,omitempty"`
}

// SessionCustomizationsChangedAction The session's customizations have changed.
type SessionCustomizationsChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Updated customization list (full replacement)
	Customizations []SessionCustomization `json:"customizations"`
}

// SessionCustomizationToggledAction A client toggled a customization on or off.
type SessionCustomizationToggledAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// The URI of the customization to toggle
	URI string `json:"uri"`
	// Whether to enable or disable the customization
	Enabled bool `json:"enabled"`
}

// SessionTruncatedAction Truncates a session's history. If `turnId` is provided, all turns after that
type SessionTruncatedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Keep turns up to and including this turn. Omit to clear all turns.
	TurnID *string `json:"turnId,omitempty"`
}

// SessionDiffsChangedAction The file diffs for the session changed.
type SessionDiffsChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Updated file diffs for the session
	Diffs []FileEdit `json:"diffs"`
}

// SessionConfigChangedAction Client changed a mutable config value mid-session.
type SessionConfigChangedAction struct {
	Type ActionType `json:"type"`
	// Session URI
	Session string `json:"session"`
	// Updated config values
	Config map[string]json.RawMessage `json:"config"`
	// When `true`, replaces all config values instead of merging
	Replace *bool `json:"replace,omitempty"`
}

// SessionToolCallContentChangedAction Partial content produced while a tool is still executing.
type SessionToolCallContentChangedAction struct {
	// Session URI
	Session string `json:"session"`
	// Turn identifier
	TurnID string `json:"turnId"`
	// Tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Type ActionType `json:"type"`
	// The current partial content for the running tool call
	Content []ToolResultContent `json:"content"`
}

// RootTerminalsChangedAction Fired when the list of known terminals changes.
type RootTerminalsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated terminal list (full replacement)
	Terminals []TerminalInfo `json:"terminals"`
}

// RootConfigChangedAction Fired when agent-host configuration values change.
type RootConfigChangedAction struct {
	Type ActionType `json:"type"`
	// Updated config values
	Config map[string]json.RawMessage `json:"config"`
	// When `true`, replaces all config values instead of merging
	Replace *bool `json:"replace,omitempty"`
}

// TerminalDataAction Terminal output data (pty → client direction).
type TerminalDataAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// Output data (may contain ANSI escape sequences)
	Data string `json:"data"`
}

// TerminalInputAction Keyboard input sent to the terminal process (client → pty direction).
type TerminalInputAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// Input data to send to the pty
	Data string `json:"data"`
}

// TerminalResizedAction Terminal dimensions changed.
type TerminalResizedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// Terminal width in columns
	Cols int `json:"cols"`
	// Terminal height in rows
	Rows int `json:"rows"`
}

// TerminalClaimedAction Terminal claim changed. A client or session transfers ownership of the terminal.
type TerminalClaimedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// The new claim
	Claim TerminalClaim `json:"claim"`
}

// TerminalTitleChangedAction Terminal title changed.
type TerminalTitleChangedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// New terminal title
	Title string `json:"title"`
}

// TerminalCwdChangedAction Terminal working directory changed.
type TerminalCwdChangedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// New working directory
	Cwd string `json:"cwd"`
}

// TerminalExitedAction Terminal process exited.
type TerminalExitedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// Process exit code. `undefined` if the process was killed without an exit code.
	ExitCode *int `json:"exitCode,omitempty"`
}

// TerminalClearedAction Terminal scrollback buffer cleared.
type TerminalClearedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
}

// TerminalCommandDetectionAvailableAction Shell integration has loaded and the terminal now supports command
type TerminalCommandDetectionAvailableAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
}

// TerminalCommandExecutedAction A command has been submitted to the shell and is now executing.
type TerminalCommandExecutedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// Stable identifier for this command, scoped to the terminal URI.
	// Allows correlating `commandExecuted` → `commandFinished` pairs.
	CommandID string `json:"commandId"`
	// The command line text that was submitted
	CommandLine string `json:"commandLine"`
	// Unix timestamp (ms) of when the command started executing, as measured
	// on the server.
	Timestamp int `json:"timestamp"`
}

// TerminalCommandFinishedAction A command has finished executing.
type TerminalCommandFinishedAction struct {
	Type ActionType `json:"type"`
	// Terminal URI
	Terminal string `json:"terminal"`
	// Matches the `commandId` from the corresponding `commandExecuted`
	CommandID string `json:"commandId"`
	// Shell exit code. `undefined` if the shell did not report one.
	ExitCode *int `json:"exitCode,omitempty"`
	// Wall-clock duration of the command in milliseconds, as measured by the
	// shell integration script on the server side.
	DurationMs *int `json:"durationMs,omitempty"`
}

// ── StateAction Union ─────────────────────────────────────────────────────────

// StateAction is a discriminated union of all state actions.
type StateAction struct {
	RootAgentsChanged *RootAgentsChangedAction
	RootActiveSessionsChanged *RootActiveSessionsChangedAction
	SessionReady *SessionReadyAction
	SessionCreationFailed *SessionCreationFailedAction
	SessionTurnStarted *SessionTurnStartedAction
	SessionDelta *SessionDeltaAction
	SessionResponsePart *SessionResponsePartAction
	SessionToolCallStart *SessionToolCallStartAction
	SessionToolCallDelta *SessionToolCallDeltaAction
	SessionToolCallReady *SessionToolCallReadyAction
	SessionToolCallConfirmed *SessionToolCallConfirmedAction
	SessionToolCallComplete *SessionToolCallCompleteAction
	SessionToolCallResultConfirmed *SessionToolCallResultConfirmedAction
	SessionTurnComplete *SessionTurnCompleteAction
	SessionTurnCancelled *SessionTurnCancelledAction
	SessionError *SessionErrorAction
	SessionTitleChanged *SessionTitleChangedAction
	SessionUsage *SessionUsageAction
	SessionReasoning *SessionReasoningAction
	SessionModelChanged *SessionModelChangedAction
	SessionIsReadChanged *SessionIsReadChangedAction
	SessionIsDoneChanged *SessionIsDoneChangedAction
	SessionServerToolsChanged *SessionServerToolsChangedAction
	SessionActiveClientChanged *SessionActiveClientChangedAction
	SessionActiveClientToolsChanged *SessionActiveClientToolsChangedAction
	SessionPendingMessageSet *SessionPendingMessageSetAction
	SessionPendingMessageRemoved *SessionPendingMessageRemovedAction
	SessionQueuedMessagesReordered *SessionQueuedMessagesReorderedAction
	SessionInputRequested *SessionInputRequestedAction
	SessionInputAnswerChanged *SessionInputAnswerChangedAction
	SessionInputCompleted *SessionInputCompletedAction
	SessionCustomizationsChanged *SessionCustomizationsChangedAction
	SessionCustomizationToggled *SessionCustomizationToggledAction
	SessionTruncated *SessionTruncatedAction
	SessionDiffsChanged *SessionDiffsChangedAction
	SessionConfigChanged *SessionConfigChangedAction
	SessionToolCallContentChanged *SessionToolCallContentChangedAction
	RootTerminalsChanged *RootTerminalsChangedAction
	RootConfigChanged *RootConfigChangedAction
	TerminalData *TerminalDataAction
	TerminalInput *TerminalInputAction
	TerminalResized *TerminalResizedAction
	TerminalClaimed *TerminalClaimedAction
	TerminalTitleChanged *TerminalTitleChangedAction
	TerminalCwdChanged *TerminalCwdChangedAction
	TerminalExited *TerminalExitedAction
	TerminalCleared *TerminalClearedAction
	TerminalCommandDetectionAvailable *TerminalCommandDetectionAvailableAction
	TerminalCommandExecuted *TerminalCommandExecutedAction
	TerminalCommandFinished *TerminalCommandFinishedAction
	UnknownType string
	UnknownRaw  json.RawMessage
}

func (u *StateAction) UnmarshalJSON(data []byte) error {
	var disc struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.Type {
	case "root/agentsChanged":
		u.RootAgentsChanged = new(RootAgentsChangedAction)
		return json.Unmarshal(data, u.RootAgentsChanged)
	case "root/activeSessionsChanged":
		u.RootActiveSessionsChanged = new(RootActiveSessionsChangedAction)
		return json.Unmarshal(data, u.RootActiveSessionsChanged)
	case "session/ready":
		u.SessionReady = new(SessionReadyAction)
		return json.Unmarshal(data, u.SessionReady)
	case "session/creationFailed":
		u.SessionCreationFailed = new(SessionCreationFailedAction)
		return json.Unmarshal(data, u.SessionCreationFailed)
	case "session/turnStarted":
		u.SessionTurnStarted = new(SessionTurnStartedAction)
		return json.Unmarshal(data, u.SessionTurnStarted)
	case "session/delta":
		u.SessionDelta = new(SessionDeltaAction)
		return json.Unmarshal(data, u.SessionDelta)
	case "session/responsePart":
		u.SessionResponsePart = new(SessionResponsePartAction)
		return json.Unmarshal(data, u.SessionResponsePart)
	case "session/toolCallStart":
		u.SessionToolCallStart = new(SessionToolCallStartAction)
		return json.Unmarshal(data, u.SessionToolCallStart)
	case "session/toolCallDelta":
		u.SessionToolCallDelta = new(SessionToolCallDeltaAction)
		return json.Unmarshal(data, u.SessionToolCallDelta)
	case "session/toolCallReady":
		u.SessionToolCallReady = new(SessionToolCallReadyAction)
		return json.Unmarshal(data, u.SessionToolCallReady)
	case "session/toolCallConfirmed":
		u.SessionToolCallConfirmed = new(SessionToolCallConfirmedAction)
		return json.Unmarshal(data, u.SessionToolCallConfirmed)
	case "session/toolCallComplete":
		u.SessionToolCallComplete = new(SessionToolCallCompleteAction)
		return json.Unmarshal(data, u.SessionToolCallComplete)
	case "session/toolCallResultConfirmed":
		u.SessionToolCallResultConfirmed = new(SessionToolCallResultConfirmedAction)
		return json.Unmarshal(data, u.SessionToolCallResultConfirmed)
	case "session/turnComplete":
		u.SessionTurnComplete = new(SessionTurnCompleteAction)
		return json.Unmarshal(data, u.SessionTurnComplete)
	case "session/turnCancelled":
		u.SessionTurnCancelled = new(SessionTurnCancelledAction)
		return json.Unmarshal(data, u.SessionTurnCancelled)
	case "session/error":
		u.SessionError = new(SessionErrorAction)
		return json.Unmarshal(data, u.SessionError)
	case "session/titleChanged":
		u.SessionTitleChanged = new(SessionTitleChangedAction)
		return json.Unmarshal(data, u.SessionTitleChanged)
	case "session/usage":
		u.SessionUsage = new(SessionUsageAction)
		return json.Unmarshal(data, u.SessionUsage)
	case "session/reasoning":
		u.SessionReasoning = new(SessionReasoningAction)
		return json.Unmarshal(data, u.SessionReasoning)
	case "session/modelChanged":
		u.SessionModelChanged = new(SessionModelChangedAction)
		return json.Unmarshal(data, u.SessionModelChanged)
	case "session/isReadChanged":
		u.SessionIsReadChanged = new(SessionIsReadChangedAction)
		return json.Unmarshal(data, u.SessionIsReadChanged)
	case "session/isDoneChanged":
		u.SessionIsDoneChanged = new(SessionIsDoneChangedAction)
		return json.Unmarshal(data, u.SessionIsDoneChanged)
	case "session/serverToolsChanged":
		u.SessionServerToolsChanged = new(SessionServerToolsChangedAction)
		return json.Unmarshal(data, u.SessionServerToolsChanged)
	case "session/activeClientChanged":
		u.SessionActiveClientChanged = new(SessionActiveClientChangedAction)
		return json.Unmarshal(data, u.SessionActiveClientChanged)
	case "session/activeClientToolsChanged":
		u.SessionActiveClientToolsChanged = new(SessionActiveClientToolsChangedAction)
		return json.Unmarshal(data, u.SessionActiveClientToolsChanged)
	case "session/pendingMessageSet":
		u.SessionPendingMessageSet = new(SessionPendingMessageSetAction)
		return json.Unmarshal(data, u.SessionPendingMessageSet)
	case "session/pendingMessageRemoved":
		u.SessionPendingMessageRemoved = new(SessionPendingMessageRemovedAction)
		return json.Unmarshal(data, u.SessionPendingMessageRemoved)
	case "session/queuedMessagesReordered":
		u.SessionQueuedMessagesReordered = new(SessionQueuedMessagesReorderedAction)
		return json.Unmarshal(data, u.SessionQueuedMessagesReordered)
	case "session/inputRequested":
		u.SessionInputRequested = new(SessionInputRequestedAction)
		return json.Unmarshal(data, u.SessionInputRequested)
	case "session/inputAnswerChanged":
		u.SessionInputAnswerChanged = new(SessionInputAnswerChangedAction)
		return json.Unmarshal(data, u.SessionInputAnswerChanged)
	case "session/inputCompleted":
		u.SessionInputCompleted = new(SessionInputCompletedAction)
		return json.Unmarshal(data, u.SessionInputCompleted)
	case "session/customizationsChanged":
		u.SessionCustomizationsChanged = new(SessionCustomizationsChangedAction)
		return json.Unmarshal(data, u.SessionCustomizationsChanged)
	case "session/customizationToggled":
		u.SessionCustomizationToggled = new(SessionCustomizationToggledAction)
		return json.Unmarshal(data, u.SessionCustomizationToggled)
	case "session/truncated":
		u.SessionTruncated = new(SessionTruncatedAction)
		return json.Unmarshal(data, u.SessionTruncated)
	case "session/diffsChanged":
		u.SessionDiffsChanged = new(SessionDiffsChangedAction)
		return json.Unmarshal(data, u.SessionDiffsChanged)
	case "session/configChanged":
		u.SessionConfigChanged = new(SessionConfigChangedAction)
		return json.Unmarshal(data, u.SessionConfigChanged)
	case "session/toolCallContentChanged":
		u.SessionToolCallContentChanged = new(SessionToolCallContentChangedAction)
		return json.Unmarshal(data, u.SessionToolCallContentChanged)
	case "root/terminalsChanged":
		u.RootTerminalsChanged = new(RootTerminalsChangedAction)
		return json.Unmarshal(data, u.RootTerminalsChanged)
	case "root/configChanged":
		u.RootConfigChanged = new(RootConfigChangedAction)
		return json.Unmarshal(data, u.RootConfigChanged)
	case "terminal/data":
		u.TerminalData = new(TerminalDataAction)
		return json.Unmarshal(data, u.TerminalData)
	case "terminal/input":
		u.TerminalInput = new(TerminalInputAction)
		return json.Unmarshal(data, u.TerminalInput)
	case "terminal/resized":
		u.TerminalResized = new(TerminalResizedAction)
		return json.Unmarshal(data, u.TerminalResized)
	case "terminal/claimed":
		u.TerminalClaimed = new(TerminalClaimedAction)
		return json.Unmarshal(data, u.TerminalClaimed)
	case "terminal/titleChanged":
		u.TerminalTitleChanged = new(TerminalTitleChangedAction)
		return json.Unmarshal(data, u.TerminalTitleChanged)
	case "terminal/cwdChanged":
		u.TerminalCwdChanged = new(TerminalCwdChangedAction)
		return json.Unmarshal(data, u.TerminalCwdChanged)
	case "terminal/exited":
		u.TerminalExited = new(TerminalExitedAction)
		return json.Unmarshal(data, u.TerminalExited)
	case "terminal/cleared":
		u.TerminalCleared = new(TerminalClearedAction)
		return json.Unmarshal(data, u.TerminalCleared)
	case "terminal/commandDetectionAvailable":
		u.TerminalCommandDetectionAvailable = new(TerminalCommandDetectionAvailableAction)
		return json.Unmarshal(data, u.TerminalCommandDetectionAvailable)
	case "terminal/commandExecuted":
		u.TerminalCommandExecuted = new(TerminalCommandExecutedAction)
		return json.Unmarshal(data, u.TerminalCommandExecuted)
	case "terminal/commandFinished":
		u.TerminalCommandFinished = new(TerminalCommandFinishedAction)
		return json.Unmarshal(data, u.TerminalCommandFinished)
	default:
		u.UnknownType = disc.Type
		u.UnknownRaw = make(json.RawMessage, len(data))
		copy(u.UnknownRaw, data)
		return nil
	}
}

func (u StateAction) MarshalJSON() ([]byte, error) {
	if u.RootAgentsChanged != nil {
		return json.Marshal(u.RootAgentsChanged)
	}
	if u.RootActiveSessionsChanged != nil {
		return json.Marshal(u.RootActiveSessionsChanged)
	}
	if u.SessionReady != nil {
		return json.Marshal(u.SessionReady)
	}
	if u.SessionCreationFailed != nil {
		return json.Marshal(u.SessionCreationFailed)
	}
	if u.SessionTurnStarted != nil {
		return json.Marshal(u.SessionTurnStarted)
	}
	if u.SessionDelta != nil {
		return json.Marshal(u.SessionDelta)
	}
	if u.SessionResponsePart != nil {
		return json.Marshal(u.SessionResponsePart)
	}
	if u.SessionToolCallStart != nil {
		return json.Marshal(u.SessionToolCallStart)
	}
	if u.SessionToolCallDelta != nil {
		return json.Marshal(u.SessionToolCallDelta)
	}
	if u.SessionToolCallReady != nil {
		return json.Marshal(u.SessionToolCallReady)
	}
	if u.SessionToolCallConfirmed != nil {
		return json.Marshal(u.SessionToolCallConfirmed)
	}
	if u.SessionToolCallComplete != nil {
		return json.Marshal(u.SessionToolCallComplete)
	}
	if u.SessionToolCallResultConfirmed != nil {
		return json.Marshal(u.SessionToolCallResultConfirmed)
	}
	if u.SessionTurnComplete != nil {
		return json.Marshal(u.SessionTurnComplete)
	}
	if u.SessionTurnCancelled != nil {
		return json.Marshal(u.SessionTurnCancelled)
	}
	if u.SessionError != nil {
		return json.Marshal(u.SessionError)
	}
	if u.SessionTitleChanged != nil {
		return json.Marshal(u.SessionTitleChanged)
	}
	if u.SessionUsage != nil {
		return json.Marshal(u.SessionUsage)
	}
	if u.SessionReasoning != nil {
		return json.Marshal(u.SessionReasoning)
	}
	if u.SessionModelChanged != nil {
		return json.Marshal(u.SessionModelChanged)
	}
	if u.SessionIsReadChanged != nil {
		return json.Marshal(u.SessionIsReadChanged)
	}
	if u.SessionIsDoneChanged != nil {
		return json.Marshal(u.SessionIsDoneChanged)
	}
	if u.SessionServerToolsChanged != nil {
		return json.Marshal(u.SessionServerToolsChanged)
	}
	if u.SessionActiveClientChanged != nil {
		return json.Marshal(u.SessionActiveClientChanged)
	}
	if u.SessionActiveClientToolsChanged != nil {
		return json.Marshal(u.SessionActiveClientToolsChanged)
	}
	if u.SessionPendingMessageSet != nil {
		return json.Marshal(u.SessionPendingMessageSet)
	}
	if u.SessionPendingMessageRemoved != nil {
		return json.Marshal(u.SessionPendingMessageRemoved)
	}
	if u.SessionQueuedMessagesReordered != nil {
		return json.Marshal(u.SessionQueuedMessagesReordered)
	}
	if u.SessionInputRequested != nil {
		return json.Marshal(u.SessionInputRequested)
	}
	if u.SessionInputAnswerChanged != nil {
		return json.Marshal(u.SessionInputAnswerChanged)
	}
	if u.SessionInputCompleted != nil {
		return json.Marshal(u.SessionInputCompleted)
	}
	if u.SessionCustomizationsChanged != nil {
		return json.Marshal(u.SessionCustomizationsChanged)
	}
	if u.SessionCustomizationToggled != nil {
		return json.Marshal(u.SessionCustomizationToggled)
	}
	if u.SessionTruncated != nil {
		return json.Marshal(u.SessionTruncated)
	}
	if u.SessionDiffsChanged != nil {
		return json.Marshal(u.SessionDiffsChanged)
	}
	if u.SessionConfigChanged != nil {
		return json.Marshal(u.SessionConfigChanged)
	}
	if u.SessionToolCallContentChanged != nil {
		return json.Marshal(u.SessionToolCallContentChanged)
	}
	if u.RootTerminalsChanged != nil {
		return json.Marshal(u.RootTerminalsChanged)
	}
	if u.RootConfigChanged != nil {
		return json.Marshal(u.RootConfigChanged)
	}
	if u.TerminalData != nil {
		return json.Marshal(u.TerminalData)
	}
	if u.TerminalInput != nil {
		return json.Marshal(u.TerminalInput)
	}
	if u.TerminalResized != nil {
		return json.Marshal(u.TerminalResized)
	}
	if u.TerminalClaimed != nil {
		return json.Marshal(u.TerminalClaimed)
	}
	if u.TerminalTitleChanged != nil {
		return json.Marshal(u.TerminalTitleChanged)
	}
	if u.TerminalCwdChanged != nil {
		return json.Marshal(u.TerminalCwdChanged)
	}
	if u.TerminalExited != nil {
		return json.Marshal(u.TerminalExited)
	}
	if u.TerminalCleared != nil {
		return json.Marshal(u.TerminalCleared)
	}
	if u.TerminalCommandDetectionAvailable != nil {
		return json.Marshal(u.TerminalCommandDetectionAvailable)
	}
	if u.TerminalCommandExecuted != nil {
		return json.Marshal(u.TerminalCommandExecuted)
	}
	if u.TerminalCommandFinished != nil {
		return json.Marshal(u.TerminalCommandFinished)
	}
	if u.UnknownRaw != nil {
		return u.UnknownRaw, nil
	}
	return nil, fmt.Errorf("empty StateAction: no variant set")
}
