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
	ActionTypeSessionTurnStarted                ActionType = "session/turnStarted"
	ActionTypeSessionDelta                      ActionType = "session/delta"
	ActionTypeSessionResponsePart               ActionType = "session/responsePart"
	ActionTypeSessionToolCallStart              ActionType = "session/toolCallStart"
	ActionTypeSessionToolCallDelta              ActionType = "session/toolCallDelta"
	ActionTypeSessionToolCallReady              ActionType = "session/toolCallReady"
	ActionTypeSessionToolCallConfirmed          ActionType = "session/toolCallConfirmed"
	ActionTypeSessionToolCallComplete           ActionType = "session/toolCallComplete"
	ActionTypeSessionToolCallResultConfirmed    ActionType = "session/toolCallResultConfirmed"
	ActionTypeSessionToolCallContentChanged     ActionType = "session/toolCallContentChanged"
	ActionTypeSessionTurnComplete               ActionType = "session/turnComplete"
	ActionTypeSessionTurnCancelled              ActionType = "session/turnCancelled"
	ActionTypeSessionError                      ActionType = "session/error"
	ActionTypeSessionTitleChanged               ActionType = "session/titleChanged"
	ActionTypeSessionUsage                      ActionType = "session/usage"
	ActionTypeSessionReasoning                  ActionType = "session/reasoning"
	ActionTypeSessionModelChanged               ActionType = "session/modelChanged"
	ActionTypeSessionAgentChanged               ActionType = "session/agentChanged"
	ActionTypeSessionServerToolsChanged         ActionType = "session/serverToolsChanged"
	ActionTypeSessionActiveClientChanged        ActionType = "session/activeClientChanged"
	ActionTypeSessionActiveClientToolsChanged   ActionType = "session/activeClientToolsChanged"
	ActionTypeSessionPendingMessageSet          ActionType = "session/pendingMessageSet"
	ActionTypeSessionPendingMessageRemoved      ActionType = "session/pendingMessageRemoved"
	ActionTypeSessionQueuedMessagesReordered    ActionType = "session/queuedMessagesReordered"
	ActionTypeSessionInputRequested             ActionType = "session/inputRequested"
	ActionTypeSessionInputAnswerChanged         ActionType = "session/inputAnswerChanged"
	ActionTypeSessionInputCompleted             ActionType = "session/inputCompleted"
	ActionTypeSessionCustomizationsChanged      ActionType = "session/customizationsChanged"
	ActionTypeSessionCustomizationToggled       ActionType = "session/customizationToggled"
	ActionTypeSessionCustomizationUpdated       ActionType = "session/customizationUpdated"
	ActionTypeSessionCustomizationRemoved       ActionType = "session/customizationRemoved"
	ActionTypeSessionTruncated                  ActionType = "session/truncated"
	ActionTypeSessionIsReadChanged              ActionType = "session/isReadChanged"
	ActionTypeSessionIsArchivedChanged          ActionType = "session/isArchivedChanged"
	ActionTypeSessionActivityChanged            ActionType = "session/activityChanged"
	ActionTypeSessionChangesetsChanged          ActionType = "session/changesetsChanged"
	ActionTypeSessionConfigChanged              ActionType = "session/configChanged"
	ActionTypeSessionMetaChanged                ActionType = "session/metaChanged"
	ActionTypeChangesetStatusChanged            ActionType = "changeset/statusChanged"
	ActionTypeChangesetFileSet                  ActionType = "changeset/fileSet"
	ActionTypeChangesetFileRemoved              ActionType = "changeset/fileRemoved"
	ActionTypeChangesetOperationsChanged        ActionType = "changeset/operationsChanged"
	ActionTypeChangesetOperationStatusChanged   ActionType = "changeset/operationStatusChanged"
	ActionTypeChangesetCleared                  ActionType = "changeset/cleared"
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
	Origin          *ActionOrigin `json:"origin"`
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

// A new message has been sent to the agent, and a new turn starts.
//
// A client is only allowed to send {@link MessageKind.User} messages.
type SessionTurnStartedAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// The new message
	Message Message `json:"message"`
	// If this turn was auto-started from a queued message, the ID of that message
	QueuedMessageId *string `json:"queuedMessageId,omitempty"`
}

// Streaming text chunk from the assistant, appended to a specific response part.
//
// The server MUST first emit a `session/responsePart` to create the target
// part (markdown or reasoning), then use this action to append text to it.
type SessionDeltaAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Identifier of the response part to append to
	PartId string `json:"partId"`
	// Text chunk
	Content string `json:"content"`
}

// Structured content appended to the response.
type SessionResponsePartAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Response part (markdown or content ref)
	Part ResponsePart `json:"part"`
}

// A tool call begins — parameters are streaming from the LM.
//
// For client-provided tools, the server sets `toolClientId` to identify the
// owning client. That client is responsible for executing the tool once it
// reaches the `running` state and dispatching `session/toolCallComplete`.
type SessionToolCallStartAction struct {
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
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	ToolClientId *string `json:"toolClientId,omitempty"`
}

// Streaming partial parameters for a tool call.
type SessionToolCallDeltaAction struct {
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
// standard `session/toolCallConfirmed` flow to approve or deny.
//
// For client-provided tools, the server typically sets `confirmed` to
// `'not-needed'` so the tool transitions directly to `running`, where the
// owning client can begin execution immediately.
type SessionToolCallReadyAction struct {
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

// SessionToolCallConfirmedAction is the client approves or denies a
// pending tool call (merged approved + denied variants on the wire).
type SessionToolCallConfirmedAction struct {
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
// For client-provided tools (where `toolClientId` is set on the tool call state),
// the owning client dispatches this action with the execution result. The server
// SHOULD reject this action if the dispatching client does not match `toolClientId`.
//
// Servers waiting on a client tool call MAY time out after a reasonable duration
// if the implementing client disconnects or becomes unresponsive, and dispatch
// this action with `result.success = false` and an appropriate error.
type SessionToolCallCompleteAction struct {
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
type SessionToolCallResultConfirmedAction struct {
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

// Turn finished — the assistant is idle.
type SessionTurnCompleteAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
}

// Turn was aborted; server stops processing.
type SessionTurnCancelledAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
}

// Error during turn processing.
type SessionErrorAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Error details
	Error ErrorInfo `json:"error"`
}

// Session title updated. Fired by the server when the title is auto-generated
// from conversation, or dispatched by a client to rename a session.
type SessionTitleChangedAction struct {
	Type ActionType `json:"type"`
	// New title
	Title string `json:"title"`
}

// Token usage report for a turn.
type SessionUsageAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Token usage data
	Usage UsageInfo `json:"usage"`
}

// Reasoning/thinking text from the model, appended to a specific reasoning response part.
//
// The server MUST first emit a `session/responsePart` to create the target
// reasoning part, then use this action to append text to it.
type SessionReasoningAction struct {
	Type ActionType `json:"type"`
	// Turn identifier
	TurnId string `json:"turnId"`
	// Identifier of the reasoning response part to append to
	PartId string `json:"partId"`
	// Reasoning text chunk
	Content string `json:"content"`
}

// Model changed for this session.
type SessionModelChangedAction struct {
	Type ActionType `json:"type"`
	// New model selection
	Model ModelSelection `json:"model"`
}

// Custom agent selection changed for this session.
//
// Omitting `agent` (or setting it to `undefined`) clears the selection and
// resets the session to no selected custom agent (provider default behavior).
//
// When a turn is currently active, the server MUST defer the change until
// the active turn completes, then apply it for the next turn (same rule as
// {@link SessionModelChangedAction | `session/modelChanged`}).
type SessionAgentChangedAction struct {
	Type ActionType `json:"type"`
	// New agent selection, or `undefined` to clear the selection and reset the
	// session to no selected custom agent.
	Agent *AgentSelection `json:"agent,omitempty"`
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

// The {@link ChangesetSummary | catalogue of changesets} the agent host
// advertises for this session changed. Replaces
// `state.summary.changesets` entirely (full-replacement semantics) — set
// to `undefined` to clear the catalogue.
//
// Producers dispatch this whenever entries are added, removed, or have
// their aggregate counts (`additions` / `deletions` / `files`) refreshed.
// The fan-out happens through this action so observers see catalogue
// mutations in the same {@link ChangesetAction | per-changeset} action
// stream they already follow for file-level updates.
type SessionChangesetsChangedAction struct {
	Type ActionType `json:"type"`
	// New catalogue, or `undefined` to clear it
	Changesets []ChangesetSummary `json:"changesets,omitempty"`
}

// Server tools for this session have changed.
//
// Full-replacement semantics: the `tools` array replaces the previous `serverTools` entirely.
type SessionServerToolsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated server tools list (full replacement)
	Tools []ToolDefinition `json:"tools"`
}

// The active client for this session has changed.
//
// A client dispatches this action with its own `SessionActiveClient` to claim
// the active role, or with `null` to release it. The server SHOULD reject if
// another client is already active. The server SHOULD automatically dispatch
// this action with `activeClient: null` when the active client disconnects.
type SessionActiveClientChangedAction struct {
	Type ActionType `json:"type"`
	// The new active client, or `null` to unset
	ActiveClient *SessionActiveClient `json:"activeClient,omitempty"`
}

// The active client's tool list has changed.
//
// Full-replacement semantics: the `tools` array replaces the active client's
// previous tools entirely. The server SHOULD reject if the dispatching client
// is not the current active client.
type SessionActiveClientToolsChangedAction struct {
	Type ActionType `json:"type"`
	// Updated client tools list (full replacement)
	Tools []ToolDefinition `json:"tools"`
}

// A pending message was set (upsert semantics: creates or replaces).
//
// For steering messages, this always replaces the single steering message.
// For queued messages, if a message with the given `id` already exists it is
// updated in place; otherwise it is appended to the queue. If the session is
// idle when a queued message is set, the server SHOULD immediately consume it
// and start a new turn.
//
// A client is only allowed to send {@link MessageKind.User} messages.
type SessionPendingMessageSetAction struct {
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
type SessionPendingMessageRemovedAction struct {
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
type SessionQueuedMessagesReorderedAction struct {
	Type ActionType `json:"type"`
	// Queued message IDs in the desired order
	Order []string `json:"order"`
}

// A session requested input from the user.
//
// Full-request upsert semantics: the `request` replaces any existing request
// with the same `id`, or is appended if it is new. Answer drafts are preserved
// unless `request.answers` is provided.
type SessionInputRequestedAction struct {
	Type ActionType `json:"type"`
	// Input request to create or replace
	Request SessionInputRequest `json:"request"`
}

// A client updated, submitted, skipped, or removed a single in-progress answer.
//
// Dispatching with `answer: undefined` removes that question's answer draft.
type SessionInputAnswerChangedAction struct {
	Type ActionType `json:"type"`
	// Input request identifier
	RequestId string `json:"requestId"`
	// Question identifier within the input request
	QuestionId string `json:"questionId"`
	// Updated answer, or `undefined` to clear an answer draft
	Answer *SessionInputAnswer `json:"answer,omitempty"`
}

// A client accepted, declined, or cancelled a session input request.
//
// If accepted, the server uses `answers` (when provided) plus the request's
// synced answer state to resume the blocked operation.
type SessionInputCompletedAction struct {
	Type ActionType `json:"type"`
	// Input request identifier
	RequestId string `json:"requestId"`
	// Completion outcome
	Response SessionInputResponseKind `json:"response"`
	// Optional final answer replacement, keyed by question ID
	Answers map[string]SessionInputAnswer `json:"answers,omitempty"`
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

// Truncates a session's history. If `turnId` is provided, all turns after that
// turn are removed and the specified turn is kept. If `turnId` is omitted, all
// turns are removed.
//
// If there is an active turn it is silently dropped and the session status
// returns to `idle`.
//
// Common use-case: truncate old data then dispatch a new
// `session/turnStarted` with an edited message.
type SessionTruncatedAction struct {
	Type ActionType `json:"type"`
	// Keep turns up to and including this turn. Omit to clear all turns.
	TurnId *string `json:"turnId,omitempty"`
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

// Partial content produced while a tool is still executing.
//
// Replaces the `content` array on the running tool call state. Clients can
// use this to display live feedback (e.g. a terminal reference) before the
// tool completes.
//
// For client-provided tools (where `toolClientId` is set on the tool call state),
// the owning client dispatches this action to stream intermediate content while
// executing. The server SHOULD reject this action if the dispatching client does
// not match `toolClientId`.
type SessionToolCallContentChangedAction struct {
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
func (*SessionTurnStartedAction) isStateAction()                {}
func (*SessionDeltaAction) isStateAction()                      {}
func (*SessionResponsePartAction) isStateAction()               {}
func (*SessionToolCallStartAction) isStateAction()              {}
func (*SessionToolCallDeltaAction) isStateAction()              {}
func (*SessionToolCallReadyAction) isStateAction()              {}
func (*SessionToolCallConfirmedAction) isStateAction()          {}
func (*SessionToolCallCompleteAction) isStateAction()           {}
func (*SessionToolCallResultConfirmedAction) isStateAction()    {}
func (*SessionTurnCompleteAction) isStateAction()               {}
func (*SessionTurnCancelledAction) isStateAction()              {}
func (*SessionErrorAction) isStateAction()                      {}
func (*SessionTitleChangedAction) isStateAction()               {}
func (*SessionUsageAction) isStateAction()                      {}
func (*SessionReasoningAction) isStateAction()                  {}
func (*SessionModelChangedAction) isStateAction()               {}
func (*SessionAgentChangedAction) isStateAction()               {}
func (*SessionIsReadChangedAction) isStateAction()              {}
func (*SessionIsArchivedChangedAction) isStateAction()          {}
func (*SessionActivityChangedAction) isStateAction()            {}
func (*SessionChangesetsChangedAction) isStateAction()          {}
func (*SessionServerToolsChangedAction) isStateAction()         {}
func (*SessionActiveClientChangedAction) isStateAction()        {}
func (*SessionActiveClientToolsChangedAction) isStateAction()   {}
func (*SessionPendingMessageSetAction) isStateAction()          {}
func (*SessionPendingMessageRemovedAction) isStateAction()      {}
func (*SessionQueuedMessagesReorderedAction) isStateAction()    {}
func (*SessionInputRequestedAction) isStateAction()             {}
func (*SessionInputAnswerChangedAction) isStateAction()         {}
func (*SessionInputCompletedAction) isStateAction()             {}
func (*SessionCustomizationsChangedAction) isStateAction()      {}
func (*SessionCustomizationToggledAction) isStateAction()       {}
func (*SessionCustomizationUpdatedAction) isStateAction()       {}
func (*SessionCustomizationRemovedAction) isStateAction()       {}
func (*SessionTruncatedAction) isStateAction()                  {}
func (*SessionConfigChangedAction) isStateAction()              {}
func (*SessionMetaChangedAction) isStateAction()                {}
func (*SessionToolCallContentChangedAction) isStateAction()     {}
func (*ChangesetStatusChangedAction) isStateAction()            {}
func (*ChangesetFileSetAction) isStateAction()                  {}
func (*ChangesetFileRemovedAction) isStateAction()              {}
func (*ChangesetOperationsChangedAction) isStateAction()        {}
func (*ChangesetOperationStatusChangedAction) isStateAction()   {}
func (*ChangesetClearedAction) isStateAction()                  {}
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
	case "session/turnStarted":
		var value SessionTurnStartedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/delta":
		var value SessionDeltaAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/responsePart":
		var value SessionResponsePartAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/toolCallStart":
		var value SessionToolCallStartAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/toolCallDelta":
		var value SessionToolCallDeltaAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/toolCallReady":
		var value SessionToolCallReadyAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/toolCallConfirmed":
		var value SessionToolCallConfirmedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/toolCallComplete":
		var value SessionToolCallCompleteAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/toolCallResultConfirmed":
		var value SessionToolCallResultConfirmedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/turnComplete":
		var value SessionTurnCompleteAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/turnCancelled":
		var value SessionTurnCancelledAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/error":
		var value SessionErrorAction
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
	case "session/usage":
		var value SessionUsageAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/reasoning":
		var value SessionReasoningAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/modelChanged":
		var value SessionModelChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/agentChanged":
		var value SessionAgentChangedAction
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
	case "session/activeClientChanged":
		var value SessionActiveClientChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/activeClientToolsChanged":
		var value SessionActiveClientToolsChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/pendingMessageSet":
		var value SessionPendingMessageSetAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/pendingMessageRemoved":
		var value SessionPendingMessageRemovedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/queuedMessagesReordered":
		var value SessionQueuedMessagesReorderedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/inputRequested":
		var value SessionInputRequestedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/inputAnswerChanged":
		var value SessionInputAnswerChangedAction
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session/inputCompleted":
		var value SessionInputCompletedAction
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
	case "session/truncated":
		var value SessionTruncatedAction
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
	case "session/toolCallContentChanged":
		var value SessionToolCallContentChangedAction
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
