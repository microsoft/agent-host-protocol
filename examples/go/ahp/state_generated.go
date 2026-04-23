// Code generated from types/*.ts — DO NOT EDIT.

package ahp

import (
	"encoding/json"
	"fmt"
)

// ── Type Aliases ──────────────────────────────────────────────────────────────

// URI is a string alias for URI values (e.g. "agenthost:/root").
type URI = string

// ── StringOrMarkdown ──────────────────────────────────────────────────────────

// StringOrMarkdown represents a value that is either a plain string or
// a markdown-formatted string.
type StringOrMarkdown struct {
	Text     *string // non-nil when the value is a plain string
	Markdown *string // non-nil when the value is markdown
}

func (s *StringOrMarkdown) UnmarshalJSON(data []byte) error {
	// Try plain string first
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		s.Text = &str
		return nil
	}
	// Try markdown object
	var obj struct {
		Markdown string `json:"markdown"`
	}
	if err := json.Unmarshal(data, &obj); err == nil {
		s.Markdown = &obj.Markdown
		return nil
	}
	return fmt.Errorf("StringOrMarkdown: cannot decode %s", string(data))
}

func (s StringOrMarkdown) MarshalJSON() ([]byte, error) {
	if s.Markdown != nil {
		return json.Marshal(struct {
			Markdown string `json:"markdown"`
		}{Markdown: *s.Markdown})
	}
	if s.Text != nil {
		return json.Marshal(*s.Text)
	}
	return json.Marshal(nil)
}

// ── Enums ────────────────────────────────────────────────────────────────────

// Policy configuration state for a model.
type PolicyState string

const (
	PolicyStateEnabled PolicyState = "enabled"
	PolicyStateDisabled PolicyState = "disabled"
	PolicyStateUnconfigured PolicyState = "unconfigured"
)

// Discriminant for pending message kinds.
type PendingMessageKind string

const (
	// Injected into the current turn at a convenient point
	PendingMessageKindSteering PendingMessageKind = "steering"
	// Sent automatically as a new turn after the current turn finishes
	PendingMessageKindQueued PendingMessageKind = "queued"
)

// Session initialization state.
type SessionLifecycle string

const (
	SessionLifecycleCreating SessionLifecycle = "creating"
	SessionLifecycleReady SessionLifecycle = "ready"
	SessionLifecycleCreationFailed SessionLifecycle = "creationFailed"
)

// Bitset of summary-level session status flags.
// 
// Use bitwise checks instead of equality for non-terminal activity. For example,
// `status & SessionStatus.InProgress` matches both ordinary in-progress turns
// and turns that are paused waiting for input.
type SessionStatus int

const (
	SessionStatusIdle SessionStatus = 1
	SessionStatusError SessionStatus = 2
	SessionStatusInProgress SessionStatus = 8
	SessionStatusInputNeeded SessionStatus = 24
)

// Answer lifecycle state.
type SessionInputAnswerState string

const (
	SessionInputAnswerStateDraft SessionInputAnswerState = "draft"
	SessionInputAnswerStateSubmitted SessionInputAnswerState = "submitted"
	SessionInputAnswerStateSkipped SessionInputAnswerState = "skipped"
)

// Answer value kind.
type SessionInputAnswerValueKind string

const (
	SessionInputAnswerValueKindText SessionInputAnswerValueKind = "text"
	SessionInputAnswerValueKindNumber SessionInputAnswerValueKind = "number"
	SessionInputAnswerValueKindBoolean SessionInputAnswerValueKind = "boolean"
	SessionInputAnswerValueKindSelected SessionInputAnswerValueKind = "selected"
	SessionInputAnswerValueKindSelectedMany SessionInputAnswerValueKind = "selected-many"
)

// Question/input control kind.
type SessionInputQuestionKind string

const (
	SessionInputQuestionKindText SessionInputQuestionKind = "text"
	SessionInputQuestionKindNumber SessionInputQuestionKind = "number"
	SessionInputQuestionKindInteger SessionInputQuestionKind = "integer"
	SessionInputQuestionKindBoolean SessionInputQuestionKind = "boolean"
	SessionInputQuestionKindSingleSelect SessionInputQuestionKind = "single-select"
	SessionInputQuestionKindMultiSelect SessionInputQuestionKind = "multi-select"
)

// How a client completed an input request.
type SessionInputResponseKind string

const (
	SessionInputResponseKindAccept SessionInputResponseKind = "accept"
	SessionInputResponseKindDecline SessionInputResponseKind = "decline"
	SessionInputResponseKindCancel SessionInputResponseKind = "cancel"
)

// How a turn ended.
type TurnState string

const (
	TurnStateComplete TurnState = "complete"
	TurnStateCancelled TurnState = "cancelled"
	TurnStateError TurnState = "error"
)

// Type of a message attachment.
type AttachmentType string

const (
	AttachmentTypeFile AttachmentType = "file"
	AttachmentTypeDirectory AttachmentType = "directory"
	AttachmentTypeSelection AttachmentType = "selection"
)

// Discriminant for response part types.
type ResponsePartKind string

const (
	ResponsePartKindMarkdown ResponsePartKind = "markdown"
	ResponsePartKindContentRef ResponsePartKind = "contentRef"
	ResponsePartKindToolCall ResponsePartKind = "toolCall"
	ResponsePartKindReasoning ResponsePartKind = "reasoning"
)

// Status of a tool call in the lifecycle state machine.
type ToolCallStatus string

const (
	ToolCallStatusStreaming ToolCallStatus = "streaming"
	ToolCallStatusPendingConfirmation ToolCallStatus = "pending-confirmation"
	ToolCallStatusRunning ToolCallStatus = "running"
	ToolCallStatusPendingResultConfirmation ToolCallStatus = "pending-result-confirmation"
	ToolCallStatusCompleted ToolCallStatus = "completed"
	ToolCallStatusCancelled ToolCallStatus = "cancelled"
)

// How a tool call was confirmed for execution.
// 
// - `NotNeeded` — No confirmation required (auto-approved)
// - `UserAction` — User explicitly approved
// - `Setting` — Approved by a persistent user setting
type ToolCallConfirmationReason string

const (
	ToolCallConfirmationReasonNotNeeded ToolCallConfirmationReason = "not-needed"
	ToolCallConfirmationReasonUserAction ToolCallConfirmationReason = "user-action"
	ToolCallConfirmationReasonSetting ToolCallConfirmationReason = "setting"
)

// Why a tool call was cancelled.
type ToolCallCancellationReason string

const (
	ToolCallCancellationReasonDenied ToolCallCancellationReason = "denied"
	ToolCallCancellationReasonSkipped ToolCallCancellationReason = "skipped"
	ToolCallCancellationReasonResultDenied ToolCallCancellationReason = "result-denied"
)

// Whether a confirmation option represents an approval or denial action.
type ConfirmationOptionKind string

const (
	ConfirmationOptionKindApprove ConfirmationOptionKind = "approve"
	ConfirmationOptionKindDeny ConfirmationOptionKind = "deny"
)

// Discriminant for tool result content types.
type ToolResultContentType string

const (
	ToolResultContentTypeText ToolResultContentType = "text"
	ToolResultContentTypeEmbeddedResource ToolResultContentType = "embeddedResource"
	ToolResultContentTypeResource ToolResultContentType = "resource"
	ToolResultContentTypeFileEdit ToolResultContentType = "fileEdit"
	ToolResultContentTypeTerminal ToolResultContentType = "terminal"
	ToolResultContentTypeSubagent ToolResultContentType = "subagent"
)

// Loading status for a server-managed customization.
type CustomizationStatus string

const (
	// Plugin is being loaded
	CustomizationStatusLoading CustomizationStatus = "loading"
	// Plugin is fully operational
	CustomizationStatusLoaded CustomizationStatus = "loaded"
	// Plugin partially loaded but has warnings
	CustomizationStatusDegraded CustomizationStatus = "degraded"
	// Plugin was unable to load
	CustomizationStatusError CustomizationStatus = "error"
)

// Discriminant for terminal claim kinds.
type TerminalClaimKind string

const (
	TerminalClaimKindClient TerminalClaimKind = "client"
	TerminalClaimKindSession TerminalClaimKind = "session"
)

// ── State Types ──────────────────────────────────────────────────────────────

// Icon An optionally-sized icon that can be displayed in a user interface.
type Icon struct {
	// A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a
	// `data:` URI with Base64-encoded image data.
	// 
	// Consumers SHOULD take steps to ensure URLs serving icons are from the
	// same domain as the client/server or a trusted domain.
	// 
	// Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain
	// executable JavaScript.
	Src string `json:"src"`
	// Optional MIME type override if the source MIME type is missing or generic.
	// For example: `"image/png"`, `"image/jpeg"`, or `"image/svg+xml"`.
	ContentType *string `json:"contentType,omitempty"`
	// Optional array of strings that specify sizes at which the icon can be used.
	// Each string should be in WxH format (e.g., `"48x48"`, `"96x96"`) or `"any"` for scalable formats like SVG.
	// 
	// If not provided, the client should assume that the icon can be used at any size.
	Sizes []string `json:"sizes,omitempty"`
	// Optional specifier for the theme this icon is designed for. `"light"` indicates
	// the icon is designed to be used with a light background, and `"dark"` indicates
	// the icon is designed to be used with a dark background.
	// 
	// If not provided, the client should assume the icon can be used with any theme.
	Theme *string `json:"theme,omitempty"`
}

// ProtectedResourceMetadata Describes a protected resource's authentication requirements using
type ProtectedResourceMetadata struct {
	// REQUIRED. The protected resource's resource identifier, a URL using the
	// `https` scheme with no fragment component (e.g. `"https://api.github.com"`).
	Resource string `json:"resource"`
	// OPTIONAL. Human-readable name of the protected resource.
	ResourceName *string `json:"resource_name,omitempty"`
	// OPTIONAL. JSON array of OAuth authorization server identifier URLs.
	AuthorizationServers []string `json:"authorization_servers,omitempty"`
	// OPTIONAL. URL of the protected resource's JWK Set document.
	JwksURI *string `json:"jwks_uri,omitempty"`
	// RECOMMENDED. JSON array of OAuth 2.0 scope values used in authorization requests.
	ScopesSupported []string `json:"scopes_supported,omitempty"`
	// OPTIONAL. JSON array of Bearer Token presentation methods supported.
	BearerMethodsSupported []string `json:"bearer_methods_supported,omitempty"`
	// OPTIONAL. JSON array of JWS signing algorithms supported.
	ResourceSigningAlgValuesSupported []string `json:"resource_signing_alg_values_supported,omitempty"`
	// OPTIONAL. JSON array of JWE encryption algorithms (alg) supported.
	ResourceEncryptionAlgValuesSupported []string `json:"resource_encryption_alg_values_supported,omitempty"`
	// OPTIONAL. JSON array of JWE encryption algorithms (enc) supported.
	ResourceEncryptionEncValuesSupported []string `json:"resource_encryption_enc_values_supported,omitempty"`
	// OPTIONAL. URL of human-readable documentation for the resource.
	ResourceDocumentation *string `json:"resource_documentation,omitempty"`
	// OPTIONAL. URL of the resource's data-usage policy.
	ResourcePolicyURI *string `json:"resource_policy_uri,omitempty"`
	// OPTIONAL. URL of the resource's terms of service.
	ResourceTosURI *string `json:"resource_tos_uri,omitempty"`
	// AHP extension. Whether authentication is required for this resource.
	// 
	// - `true` (default) — the agent cannot be used without a valid token.
	// The server SHOULD return `AuthRequired` (`-32007`) if the client
	// attempts to use the agent without authenticating.
	// - `false` — the agent works without authentication but MAY offer
	// enhanced capabilities when a token is provided.
	// 
	// Clients SHOULD treat an absent field the same as `true`.
	Required *bool `json:"required,omitempty"`
}

// RootState Global state shared with every client subscribed to `agenthost:/root`.
type RootState struct {
	// Available agent backends and their models
	Agents []AgentInfo `json:"agents"`
	// Number of active (non-disposed) sessions on the server
	ActiveSessions *int `json:"activeSessions,omitempty"`
	// Known terminals on the server. Subscribe to individual terminal URIs for full state.
	Terminals []TerminalInfo `json:"terminals,omitempty"`
	// Agent host configuration schema and current values
	Config *RootConfigState `json:"config,omitempty"`
}

// RootConfigState Live agent-host configuration metadata.
type RootConfigState struct {
	// JSON Schema describing available configuration properties
	Schema ConfigSchema `json:"schema"`
	// Current configuration values
	Values map[string]json.RawMessage `json:"values"`
}

type AgentInfo struct {
	// Agent provider ID (e.g. `'copilot'`)
	Provider string `json:"provider"`
	// Human-readable name
	DisplayName string `json:"displayName"`
	// Description string
	Description string `json:"description"`
	// Available models for this agent
	Models []SessionModelInfo `json:"models"`
	// Protected resources this agent requires authentication for.
	// 
	// Each entry describes an OAuth 2.0 protected resource using
	// [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) semantics.
	// Clients should obtain tokens from the declared `authorization_servers`
	// and push them via the `authenticate` command before creating sessions
	// with this agent.
	ProtectedResources []ProtectedResourceMetadata `json:"protectedResources,omitempty"`
	// Customizations (Open Plugins) associated with this agent.
	// 
	// Each entry is a reference to an [Open Plugins](https://open-plugins.com/)
	// plugin that the agent host can activate for sessions using this agent.
	Customizations []CustomizationRef `json:"customizations,omitempty"`
}

type SessionModelInfo struct {
	// Model identifier
	ID string `json:"id"`
	// Provider this model belongs to
	Provider string `json:"provider"`
	// Human-readable model name
	Name string `json:"name"`
	// Maximum context window size
	MaxContextWindow *int `json:"maxContextWindow,omitempty"`
	// Whether the model supports vision
	SupportsVision *bool `json:"supportsVision,omitempty"`
	// Policy configuration state
	PolicyState *PolicyState `json:"policyState,omitempty"`
	// Configuration schema describing model-specific options (e.g. thinking
	// level). Clients present this as a form and pass the resolved values in
	// {@link IModelSelection.config} when creating or changing sessions.
	ConfigSchema *ConfigSchema `json:"configSchema,omitempty"`
}

// ModelSelection A model selection: the chosen model ID together with any model-specific
type ModelSelection struct {
	// Model identifier
	ID string `json:"id"`
	// Model-specific configuration values
	Config map[string]string `json:"config,omitempty"`
}

// ConfigPropertySchema A JSON Schema-compatible property descriptor with display extensions.
type ConfigPropertySchema struct {
	// JSON Schema: property type
	Type string `json:"type"`
	// JSON Schema: human-readable label for the property
	Title string `json:"title"`
	// JSON Schema: description / tooltip
	Description *string `json:"description,omitempty"`
	// JSON Schema: default value
	Default json.RawMessage `json:"default,omitempty"`
	// JSON Schema: allowed values (typically used with `string` type)
	Enum []string `json:"enum,omitempty"`
	// Display extension: human-readable label per enum value (parallel array)
	EnumLabels []string `json:"enumLabels,omitempty"`
	// Display extension: description per enum value (parallel array)
	EnumDescriptions []string `json:"enumDescriptions,omitempty"`
	// JSON Schema: when `true`, the property is displayed but cannot be modified by the user
	ReadOnly *bool `json:"readOnly,omitempty"`
	// JSON Schema: schema for array items (used when `type` is `'array'`)
	Items *ConfigPropertySchema `json:"items,omitempty"`
	// JSON Schema: property descriptors for object properties (used when `type` is `'object'`)
	Properties map[string]ConfigPropertySchema `json:"properties,omitempty"`
	// JSON Schema: list of required property ids (used when `type` is `'object'`)
	Required []string `json:"required,omitempty"`
}

// ConfigSchema A JSON Schema object describing available configuration properties.
type ConfigSchema struct {
	// JSON Schema: always `'object'`
	Type string `json:"type"`
	// JSON Schema: property descriptors keyed by property id
	Properties map[string]ConfigPropertySchema `json:"properties"`
	// JSON Schema: list of required property ids
	Required []string `json:"required,omitempty"`
}

// PendingMessage A message queued for future delivery to the agent.
type PendingMessage struct {
	// Unique identifier for this pending message
	ID string `json:"id"`
	// The message content
	UserMessage UserMessage `json:"userMessage"`
}

// SessionState Full state for a single session, loaded when a client subscribes to the session's URI.
type SessionState struct {
	// Lightweight session metadata
	Summary SessionSummary `json:"summary"`
	// Session initialization state
	Lifecycle SessionLifecycle `json:"lifecycle"`
	// Error details if creation failed
	CreationError *ErrorInfo `json:"creationError,omitempty"`
	// Tools provided by the server (agent host) for this session
	ServerTools []ToolDefinition `json:"serverTools,omitempty"`
	// The client currently providing tools and interactive capabilities to this session
	ActiveClient *SessionActiveClient `json:"activeClient,omitempty"`
	// Completed turns
	Turns []Turn `json:"turns"`
	// Currently in-progress turn
	ActiveTurn *ActiveTurn `json:"activeTurn,omitempty"`
	// Message to inject into the current turn at a convenient point
	SteeringMessage *PendingMessage `json:"steeringMessage,omitempty"`
	// Messages to send automatically as new turns after the current turn finishes
	QueuedMessages []PendingMessage `json:"queuedMessages,omitempty"`
	// Requests for user input that are currently blocking or informing session progress
	InputRequests []SessionInputRequest `json:"inputRequests,omitempty"`
	// Session configuration schema and current values
	Config *SessionConfigState `json:"config,omitempty"`
	// Server-provided customizations active in this session.
	// 
	// Client-provided customizations are available on
	// {@link ISessionActiveClient.customizations | activeClient.customizations}.
	Customizations []SessionCustomization `json:"customizations,omitempty"`
}

// SessionActiveClient The client currently providing tools and interactive capabilities to a session.
type SessionActiveClient struct {
	// Client identifier (matches `clientId` from `initialize`)
	ClientID string `json:"clientId"`
	// Human-readable client name (e.g. `"VS Code"`)
	DisplayName *string `json:"displayName,omitempty"`
	// Tools this client provides to the session
	Tools []ToolDefinition `json:"tools"`
	// Customizations this client contributes to the session
	Customizations []CustomizationRef `json:"customizations,omitempty"`
}

type SessionSummary struct {
	// Session URI
	Resource string `json:"resource"`
	// Agent provider ID
	Provider string `json:"provider"`
	// Session title
	Title string `json:"title"`
	// Current session status
	Status SessionStatus `json:"status"`
	// Creation timestamp
	CreatedAt int `json:"createdAt"`
	// Last modification timestamp
	ModifiedAt int `json:"modifiedAt"`
	// Server-owned project for this session
	Project *ProjectInfo `json:"project,omitempty"`
	// Currently selected model
	Model *ModelSelection `json:"model,omitempty"`
	// The working directory URI for this session
	WorkingDirectory *string `json:"workingDirectory,omitempty"`
	// Whether the client has viewed this session since its last modification
	IsRead *bool `json:"isRead,omitempty"`
	// Whether the session has been marked as done by the client
	IsDone *bool `json:"isDone,omitempty"`
	// Files changed during this session with diff statistics
	Diffs []FileEdit `json:"diffs,omitempty"`
}

// ProjectInfo Server-owned project metadata for a session.
type ProjectInfo struct {
	// Project URI
	URI string `json:"uri"`
	// Human-readable project name
	DisplayName string `json:"displayName"`
}

// SessionConfigState Live session configuration metadata.
type SessionConfigState struct {
	// JSON Schema describing available configuration properties
	Schema SessionConfigSchema `json:"schema"`
	// Current configuration values
	Values map[string]json.RawMessage `json:"values"`
}

// Turn A completed request/response cycle.
type Turn struct {
	// Turn identifier
	ID string `json:"id"`
	// The user's input
	UserMessage UserMessage `json:"userMessage"`
	// All response content in stream order: text, tool calls, reasoning, and content refs.
	// 
	// Consumers should derive display text by concatenating markdown parts,
	// and find tool calls by filtering for `ToolCall` parts.
	ResponseParts []ResponsePart `json:"responseParts"`
	// Token usage info
	Usage *UsageInfo `json:"usage,omitempty"`
	// How the turn ended
	State TurnState `json:"state"`
	// Error details if state is `'error'`
	Error *ErrorInfo `json:"error,omitempty"`
}

// ActiveTurn An in-progress turn — the assistant is actively streaming.
type ActiveTurn struct {
	// Turn identifier
	ID string `json:"id"`
	// The user's input
	UserMessage UserMessage `json:"userMessage"`
	// All response content in stream order: text, tool calls, reasoning, and content refs.
	// 
	// Tool call parts include `pendingPermissions` when permissions are awaiting user approval.
	ResponseParts []ResponsePart `json:"responseParts"`
	// Token usage info
	Usage *UsageInfo `json:"usage,omitempty"`
}

type UserMessage struct {
	// Message text
	Text string `json:"text"`
	// File/selection attachments
	Attachments []MessageAttachment `json:"attachments,omitempty"`
}

// SessionInputOption A choice in a select-style question.
type SessionInputOption struct {
	// Stable option identifier; for MCP enum values this is the enum string
	ID string `json:"id"`
	// Display label
	Label string `json:"label"`
	// Optional secondary text
	Description *string `json:"description,omitempty"`
	// Whether this option is the recommended/default choice
	Recommended *bool `json:"recommended,omitempty"`
}

// SessionInputTextAnswerValue Value captured for one answer.
type SessionInputTextAnswerValue struct {
	Kind SessionInputAnswerValueKind `json:"kind"`
	Value string `json:"value"`
}

type SessionInputNumberAnswerValue struct {
	Kind SessionInputAnswerValueKind `json:"kind"`
	Value float64 `json:"value"`
}

type SessionInputBooleanAnswerValue struct {
	Kind SessionInputAnswerValueKind `json:"kind"`
	Value bool `json:"value"`
}

type SessionInputSelectedAnswerValue struct {
	Kind SessionInputAnswerValueKind `json:"kind"`
	Value string `json:"value"`
	// Free-form text entered instead of selecting an option
	FreeformValues []string `json:"freeformValues,omitempty"`
}

type SessionInputSelectedManyAnswerValue struct {
	Kind SessionInputAnswerValueKind `json:"kind"`
	Value []string `json:"value"`
	// Free-form text entered in addition to selected options
	FreeformValues []string `json:"freeformValues,omitempty"`
}

type SessionInputAnswered struct {
	// Answer state
	State SessionInputAnswerState `json:"state"`
	// Answer value
	Value SessionInputAnswerValue `json:"value"`
}

type SessionInputSkipped struct {
	// Answer state
	State SessionInputAnswerState `json:"state"`
	// Free-form reason or value captured while skipping, if any
	FreeformValues []string `json:"freeformValues,omitempty"`
}

// SessionInputTextQuestion Text question within a session input request.
type SessionInputTextQuestion struct {
	// Stable question identifier used as the key in `answers`
	ID string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool `json:"required,omitempty"`
	Kind SessionInputQuestionKind `json:"kind"`
	// Format hint for text questions, such as `email`, `uri`, `date`, or `date-time`
	Format *string `json:"format,omitempty"`
	// Minimum string length
	Min *int `json:"min,omitempty"`
	// Maximum string length
	Max *int `json:"max,omitempty"`
	// Default text
	DefaultValue *string `json:"defaultValue,omitempty"`
}

// SessionInputNumberQuestion Numeric question within a session input request.
type SessionInputNumberQuestion struct {
	// Stable question identifier used as the key in `answers`
	ID string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool `json:"required,omitempty"`
	Kind SessionInputQuestionKind `json:"kind"`
	// Minimum value
	Min *float64 `json:"min,omitempty"`
	// Maximum value
	Max *float64 `json:"max,omitempty"`
	// Default numeric value
	DefaultValue *float64 `json:"defaultValue,omitempty"`
}

// SessionInputBooleanQuestion Boolean question within a session input request.
type SessionInputBooleanQuestion struct {
	// Stable question identifier used as the key in `answers`
	ID string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool `json:"required,omitempty"`
	Kind SessionInputQuestionKind `json:"kind"`
	// Default boolean value
	DefaultValue *bool `json:"defaultValue,omitempty"`
}

// SessionInputSingleSelectQuestion Single-select question within a session input request.
type SessionInputSingleSelectQuestion struct {
	// Stable question identifier used as the key in `answers`
	ID string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool `json:"required,omitempty"`
	Kind SessionInputQuestionKind `json:"kind"`
	// Options the user may select from
	Options []SessionInputOption `json:"options"`
	// Whether the user may enter text instead of selecting an option
	AllowFreeformInput *bool `json:"allowFreeformInput,omitempty"`
}

// SessionInputMultiSelectQuestion Multi-select question within a session input request.
type SessionInputMultiSelectQuestion struct {
	// Stable question identifier used as the key in `answers`
	ID string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool `json:"required,omitempty"`
	Kind SessionInputQuestionKind `json:"kind"`
	// Options the user may select from
	Options []SessionInputOption `json:"options"`
	// Whether the user may enter text in addition to selecting options
	AllowFreeformInput *bool `json:"allowFreeformInput,omitempty"`
	// Minimum selected item count
	Min *int `json:"min,omitempty"`
	// Maximum selected item count
	Max *int `json:"max,omitempty"`
}

// SessionInputRequest A live request for user input.
type SessionInputRequest struct {
	// Stable request identifier
	ID string `json:"id"`
	// Display message for the request as a whole
	Message string `json:"message"`
	// URL the user should review or open, for URL-style elicitations
	URL *string `json:"url,omitempty"`
	// Ordered questions to ask the user
	Questions []SessionInputQuestion `json:"questions,omitempty"`
	// Current draft or submitted answers, keyed by question ID
	Answers map[string]SessionInputAnswer `json:"answers,omitempty"`
}

type MessageAttachment struct {
	// Attachment type
	Type AttachmentType `json:"type"`
	// File/directory path
	Path string `json:"path"`
	// Display name
	DisplayName *string `json:"displayName,omitempty"`
}

type MarkdownResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// Part identifier, used by `session/delta` to target this part for content appends
	ID string `json:"id"`
	// Markdown content
	Content string `json:"content"`
}

// ContentRef A reference to large content stored outside the state tree.
type ContentRef struct {
	// Content URI
	URI string `json:"uri"`
	// Approximate size in bytes
	SizeHint *int `json:"sizeHint,omitempty"`
	// Content MIME type
	ContentType *string `json:"contentType,omitempty"`
}

// ResourceReponsePart A content part that's a reference to large content stored outside the state tree.
type ResourceReponsePart struct {
	// Content URI
	URI string `json:"uri"`
	// Approximate size in bytes
	SizeHint *int `json:"sizeHint,omitempty"`
	// Content MIME type
	ContentType *string `json:"contentType,omitempty"`
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
}

// ToolCallResponsePart A tool call represented as a response part.
type ToolCallResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// Full tool call lifecycle state
	ToolCall ToolCallState `json:"toolCall"`
}

// ReasoningResponsePart Reasoning/thinking content from the model.
type ReasoningResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// Part identifier, used by `session/reasoning` to target this part for content appends
	ID string `json:"id"`
	// Accumulated reasoning text
	Content string `json:"content"`
}

// ToolCallResult Tool execution result details, available after execution completes.
type ToolCallResult struct {
	// Whether the tool succeeded
	Success bool `json:"success"`
	// Past-tense description of what the tool did
	PastTenseMessage StringOrMarkdown `json:"pastTenseMessage"`
	// Unstructured result content blocks.
	// 
	// This mirrors the `content` field of MCP `CallToolResult`.
	Content []ToolResultContent `json:"content,omitempty"`
	// Optional structured result object.
	// 
	// This mirrors the `structuredContent` field of MCP `CallToolResult`.
	StructuredContent map[string]json.RawMessage `json:"structuredContent,omitempty"`
	// Error details if the tool failed
	Error json.RawMessage `json:"error,omitempty"`
}

// ToolCallStreamingState LM is streaming the tool call parameters.
type ToolCallStreamingState struct {
	// Unique tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	// 
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientID *string `json:"toolClientId,omitempty"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	Status ToolCallStatus `json:"status"`
	// Partial parameters accumulated so far
	PartialInput *string `json:"partialInput,omitempty"`
	// Progress message shown while parameters are streaming
	InvocationMessage *StringOrMarkdown `json:"invocationMessage,omitempty"`
}

// ToolCallPendingConfirmationState Parameters are complete, or a running tool requires re-confirmation
type ToolCallPendingConfirmationState struct {
	// Unique tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	// 
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientID *string `json:"toolClientId,omitempty"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Message describing what the tool will do
	InvocationMessage StringOrMarkdown `json:"invocationMessage"`
	// Raw tool input
	ToolInput *string `json:"toolInput,omitempty"`
	Status ToolCallStatus `json:"status"`
	// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
	ConfirmationTitle *StringOrMarkdown `json:"confirmationTitle,omitempty"`
	// File edits that this tool call will perform, for preview before confirmation
	Edits json.RawMessage `json:"edits,omitempty"`
	// Whether the agent host allows the client to edit the tool's input parameters before confirming
	Editable *bool `json:"editable,omitempty"`
	// Options the server offers for this confirmation. When present, the client
	// SHOULD render these instead of a plain approve/deny UI. Each option
	// belongs to a {@link ConfirmationOptionGroup} so the client can still
	// categorise the choices.
	Options []ConfirmationOption `json:"options,omitempty"`
}

// ToolCallRunningState Tool is actively executing.
type ToolCallRunningState struct {
	// Unique tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	// 
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientID *string `json:"toolClientId,omitempty"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Message describing what the tool will do
	InvocationMessage StringOrMarkdown `json:"invocationMessage"`
	// Raw tool input
	ToolInput *string `json:"toolInput,omitempty"`
	Status ToolCallStatus `json:"status"`
	// How the tool was confirmed for execution
	Confirmed ToolCallConfirmationReason `json:"confirmed"`
	// The confirmation option the user selected, if confirmation options were provided
	SelectedOption *ConfirmationOption `json:"selectedOption,omitempty"`
	// Partial content produced while the tool is still executing.
	// 
	// For example, a terminal content block lets clients subscribe to live
	// output before the tool completes.
	Content []ToolResultContent `json:"content,omitempty"`
}

// ToolCallPendingResultConfirmationState Tool finished executing, waiting for client to approve the result.
type ToolCallPendingResultConfirmationState struct {
	// Unique tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	// 
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientID *string `json:"toolClientId,omitempty"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Message describing what the tool will do
	InvocationMessage StringOrMarkdown `json:"invocationMessage"`
	// Raw tool input
	ToolInput *string `json:"toolInput,omitempty"`
	// Whether the tool succeeded
	Success bool `json:"success"`
	// Past-tense description of what the tool did
	PastTenseMessage StringOrMarkdown `json:"pastTenseMessage"`
	// Unstructured result content blocks.
	// 
	// This mirrors the `content` field of MCP `CallToolResult`.
	Content []ToolResultContent `json:"content,omitempty"`
	// Optional structured result object.
	// 
	// This mirrors the `structuredContent` field of MCP `CallToolResult`.
	StructuredContent map[string]json.RawMessage `json:"structuredContent,omitempty"`
	// Error details if the tool failed
	Error json.RawMessage `json:"error,omitempty"`
	Status ToolCallStatus `json:"status"`
	// How the tool was confirmed for execution
	Confirmed ToolCallConfirmationReason `json:"confirmed"`
	// The confirmation option the user selected, if confirmation options were provided
	SelectedOption *ConfirmationOption `json:"selectedOption,omitempty"`
}

// ToolCallCompletedState Tool completed successfully or with an error.
type ToolCallCompletedState struct {
	// Unique tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	// 
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientID *string `json:"toolClientId,omitempty"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Message describing what the tool will do
	InvocationMessage StringOrMarkdown `json:"invocationMessage"`
	// Raw tool input
	ToolInput *string `json:"toolInput,omitempty"`
	// Whether the tool succeeded
	Success bool `json:"success"`
	// Past-tense description of what the tool did
	PastTenseMessage StringOrMarkdown `json:"pastTenseMessage"`
	// Unstructured result content blocks.
	// 
	// This mirrors the `content` field of MCP `CallToolResult`.
	Content []ToolResultContent `json:"content,omitempty"`
	// Optional structured result object.
	// 
	// This mirrors the `structuredContent` field of MCP `CallToolResult`.
	StructuredContent map[string]json.RawMessage `json:"structuredContent,omitempty"`
	// Error details if the tool failed
	Error json.RawMessage `json:"error,omitempty"`
	Status ToolCallStatus `json:"status"`
	// How the tool was confirmed for execution
	Confirmed ToolCallConfirmationReason `json:"confirmed"`
	// The confirmation option the user selected, if confirmation options were provided
	SelectedOption *ConfirmationOption `json:"selectedOption,omitempty"`
}

// ToolCallCancelledState Tool call was cancelled before execution.
type ToolCallCancelledState struct {
	// Unique tool call identifier
	ToolCallID string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	// 
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientID *string `json:"toolClientId,omitempty"`
	// Additional provider-specific metadata for this tool call.
	// 
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Message describing what the tool will do
	InvocationMessage StringOrMarkdown `json:"invocationMessage"`
	// Raw tool input
	ToolInput *string `json:"toolInput,omitempty"`
	Status ToolCallStatus `json:"status"`
	// Why the tool was cancelled
	Reason ToolCallCancellationReason `json:"reason"`
	// Optional message explaining the cancellation
	ReasonMessage *StringOrMarkdown `json:"reasonMessage,omitempty"`
	// What the user suggested doing instead
	UserSuggestion *UserMessage `json:"userSuggestion,omitempty"`
	// The confirmation option the user selected, if confirmation options were provided
	SelectedOption *ConfirmationOption `json:"selectedOption,omitempty"`
}

// ConfirmationOption A confirmation option that the server offers for a tool call awaiting
type ConfirmationOption struct {
	// Unique identifier for the option, returned in the confirmed action
	ID string `json:"id"`
	// Human-readable label displayed to the user
	Label string `json:"label"`
	// Whether this option represents an approval or denial
	Kind ConfirmationOptionKind `json:"kind"`
	// Logical group number for visual categorisation.
	// 
	// Clients SHOULD display options in the order they are defined and MAY
	// use differing group numbers to insert dividers between logical clusters
	// of options.
	Group *int `json:"group,omitempty"`
}

// ToolDefinition Describes a tool available in a session, provided by either the server or the active client.
type ToolDefinition struct {
	// Unique tool identifier
	Name string `json:"name"`
	// Human-readable display name
	Title *string `json:"title,omitempty"`
	// Description of what the tool does
	Description *string `json:"description,omitempty"`
	// JSON Schema defining the expected input parameters.
	// 
	// Optional because client-provided tools may not have formal schemas.
	// Mirrors MCP `Tool.inputSchema`.
	InputSchema json.RawMessage `json:"inputSchema,omitempty"`
	// JSON Schema defining the structure of the tool's output.
	// 
	// Mirrors MCP `Tool.outputSchema`.
	OutputSchema json.RawMessage `json:"outputSchema,omitempty"`
	// Behavioral hints about the tool. All properties are advisory.
	Annotations *ToolAnnotations `json:"annotations,omitempty"`
	// Additional provider-specific metadata.
	// 
	// Mirrors the MCP `_meta` convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// ToolAnnotations Behavioral hints about a tool. All properties are advisory and not
type ToolAnnotations struct {
	// Alternate human-readable title
	Title *string `json:"title,omitempty"`
	// Tool does not modify its environment (default: false)
	ReadOnlyHint *bool `json:"readOnlyHint,omitempty"`
	// Tool may perform destructive updates (default: true)
	DestructiveHint *bool `json:"destructiveHint,omitempty"`
	// Repeated calls with the same arguments have no additional effect (default: false)
	IdempotentHint *bool `json:"idempotentHint,omitempty"`
	// Tool may interact with external entities (default: true)
	OpenWorldHint *bool `json:"openWorldHint,omitempty"`
}

// ToolResultTextContent Text content in a tool result.
type ToolResultTextContent struct {
	Type ToolResultContentType `json:"type"`
	// The text content
	Text string `json:"text"`
}

// ToolResultEmbeddedResourceContent Base64-encoded binary content embedded in a tool result.
type ToolResultEmbeddedResourceContent struct {
	Type ToolResultContentType `json:"type"`
	// Base64-encoded data
	Data string `json:"data"`
	// Content type (e.g. `"image/png"`, `"application/pdf"`)
	ContentType string `json:"contentType"`
}

// ToolResultResourceContent A reference to a resource stored outside the tool result.
type ToolResultResourceContent struct {
	// Content URI
	URI string `json:"uri"`
	// Approximate size in bytes
	SizeHint *int `json:"sizeHint,omitempty"`
	// Content MIME type
	ContentType *string `json:"contentType,omitempty"`
	Type ToolResultContentType `json:"type"`
}

// ToolResultFileEditContent Describes a file modification performed by a tool.
type ToolResultFileEditContent struct {
	// The file state before the edit. Absent for file creations or for in-place file edits.
	Before json.RawMessage `json:"before,omitempty"`
	// The file state after the edit. Absent for file deletions.
	After json.RawMessage `json:"after,omitempty"`
	// Optional diff display metadata
	Diff json.RawMessage `json:"diff,omitempty"`
	Type ToolResultContentType `json:"type"`
}

// ToolResultTerminalContent A reference to a terminal whose output is relevant to this tool result.
type ToolResultTerminalContent struct {
	Type ToolResultContentType `json:"type"`
	// Terminal URI (subscribable for full terminal state)
	Resource string `json:"resource"`
	// Display title for the terminal content
	Title string `json:"title"`
}

// ToolResultSubagentContent A reference to a subagent session spawned by a tool.
type ToolResultSubagentContent struct {
	Type ToolResultContentType `json:"type"`
	// Subagent session URI (subscribable for full session state)
	Resource string `json:"resource"`
	// Display title for the subagent
	Title string `json:"title"`
	// Internal agent name
	AgentName *string `json:"agentName,omitempty"`
	// Human-readable description of the subagent's task
	Description *string `json:"description,omitempty"`
}

// CustomizationRef A reference to an [Open Plugins](https://open-plugins.com/) plugin.
type CustomizationRef struct {
	// Plugin URI (e.g. an HTTPS URL or marketplace identifier)
	URI string `json:"uri"`
	// Human-readable name
	DisplayName string `json:"displayName"`
	// Description of what the plugin provides
	Description *string `json:"description,omitempty"`
	// Icons for the plugin
	Icons []Icon `json:"icons,omitempty"`
	// Opaque version token for this customization.
	// 
	// Clients SHOULD include a nonce with every customization they provide.
	// Consumers can compare nonces to detect whether a customization has
	// changed since it was last seen, avoiding redundant reloads or copies.
	Nonce *string `json:"nonce,omitempty"`
}

// SessionCustomization A customization active in a session.
type SessionCustomization struct {
	// The plugin this customization refers to
	Customization CustomizationRef `json:"customization"`
	// Whether this customization is currently enabled
	Enabled bool `json:"enabled"`
	// Server-reported loading status
	Status *CustomizationStatus `json:"status,omitempty"`
	// Human-readable status detail (e.g. error message or degradation warning).
	StatusMessage *string `json:"statusMessage,omitempty"`
}

// FileEdit Describes a file modification with before/after state and diff metadata.
type FileEdit struct {
	// The file state before the edit. Absent for file creations or for in-place file edits.
	Before json.RawMessage `json:"before,omitempty"`
	// The file state after the edit. Absent for file deletions.
	After json.RawMessage `json:"after,omitempty"`
	// Optional diff display metadata
	Diff json.RawMessage `json:"diff,omitempty"`
}

// TerminalInfo Lightweight terminal metadata exposed on the root state.
type TerminalInfo struct {
	// Terminal URI (subscribable for full terminal state)
	Resource string `json:"resource"`
	// Human-readable terminal title
	Title string `json:"title"`
	// Who currently holds this terminal
	Claim TerminalClaim `json:"claim"`
	// Process exit code, if the terminal process has exited
	ExitCode *int `json:"exitCode,omitempty"`
}

// TerminalClientClaim A terminal claimed by a connected client.
type TerminalClientClaim struct {
	// Discriminant
	Kind TerminalClaimKind `json:"kind"`
	// The `clientId` of the claiming client
	ClientID string `json:"clientId"`
}

// TerminalSessionClaim A terminal claimed by a session, optionally scoped to a specific turn or tool call.
type TerminalSessionClaim struct {
	// Discriminant
	Kind TerminalClaimKind `json:"kind"`
	// Session URI that claimed the terminal
	Session string `json:"session"`
	// Optional turn identifier within the session
	TurnID *string `json:"turnId,omitempty"`
	// Optional tool call identifier within the turn
	ToolCallID *string `json:"toolCallId,omitempty"`
}

// TerminalState Full state for a single terminal, loaded when a client subscribes to the terminal's URI.
type TerminalState struct {
	// Human-readable terminal title
	Title string `json:"title"`
	// Current working directory of the terminal process
	Cwd *string `json:"cwd,omitempty"`
	// Terminal width in columns
	Cols *int `json:"cols,omitempty"`
	// Terminal height in rows
	Rows *int `json:"rows,omitempty"`
	// Typed content parts, replacing the flat `content: string`.
	// 
	// Naive consumers that only need the raw VT stream can reconstruct it with:
	// `content.map(p => p.type === 'command' ? p.output : p.value).join('')`
	// 
	// Consumers that need command boundaries can filter by part type.
	Content []TerminalContentPart `json:"content"`
	// Process exit code, set when the terminal process exits
	ExitCode *int `json:"exitCode,omitempty"`
	// Who currently holds this terminal
	Claim TerminalClaim `json:"claim"`
	// Whether this terminal emits `terminal/commandExecuted` and
	// `terminal/commandFinished` actions and populates `command`-typed parts.
	// 
	// Clients MUST check this flag before relying on command detection.
	// Do NOT use the presence of a `command` part as a feature flag — parts
	// are absent in the normal idle state.
	SupportsCommandDetection *bool `json:"supportsCommandDetection,omitempty"`
}

// TerminalUnclassifiedPart Unstructured terminal output — content before, between, or after commands,
type TerminalUnclassifiedPart struct {
	Type string `json:"type"`
	// Accumulated VT output. Appended to by `terminal/data` when no command is executing.
	Value string `json:"value"`
}

// TerminalCommandPart A single command: its command line and the output it produced.
type TerminalCommandPart struct {
	Type string `json:"type"`
	// Stable id matching the `commandId` on the corresponding
	// `terminal/commandExecuted` and `terminal/commandFinished` actions.
	CommandID string `json:"commandId"`
	// The command line submitted to the shell.
	CommandLine string `json:"commandLine"`
	// Accumulated VT output. Appended to by `terminal/data` while `isComplete`
	// is false. Shell integration escape sequences are stripped by the server.
	Output string `json:"output"`
	// Unix timestamp (ms) when execution started, as reported by the server.
	Timestamp int `json:"timestamp"`
	// Whether the command has finished.
	IsComplete bool `json:"isComplete"`
	// Shell exit code. Set at completion. `undefined` if unknown.
	ExitCode *int `json:"exitCode,omitempty"`
	// Wall-clock duration in milliseconds. Set at completion.
	DurationMs *int `json:"durationMs,omitempty"`
}

type UsageInfo struct {
	// Input tokens consumed
	InputTokens *int `json:"inputTokens,omitempty"`
	// Output tokens generated
	OutputTokens *int `json:"outputTokens,omitempty"`
	// Model used
	Model *string `json:"model,omitempty"`
	// Tokens read from cache
	CacheReadTokens *int `json:"cacheReadTokens,omitempty"`
}

type ErrorInfo struct {
	// Error type identifier
	ErrorType string `json:"errorType"`
	// Human-readable error message
	Message string `json:"message"`
	// Stack trace
	Stack *string `json:"stack,omitempty"`
}

// Snapshot A point-in-time snapshot of a subscribed resource's state, returned by
type Snapshot struct {
	// The subscribed resource URI (e.g. `agenthost:/root` or `copilot:/<uuid>`)
	Resource string `json:"resource"`
	// The current state of the resource
	State SnapshotState `json:"state"`
	// The `serverSeq` at which this snapshot was taken. Subsequent actions will have `serverSeq > fromSeq`.
	FromSeq int `json:"fromSeq"`
}

// ── Discriminated Unions ──────────────────────────────────────────────────────

// ResponsePart is a discriminated union keyed on "kind".
type ResponsePart struct {
	Markdown *MarkdownResponsePart
	ContentRef *ResourceReponsePart
	ToolCall *ToolCallResponsePart
	Reasoning *ReasoningResponsePart
}

func (u *ResponsePart) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"kind"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "markdown":
		u.Markdown = new(MarkdownResponsePart)
		return json.Unmarshal(data, u.Markdown)
	case "contentRef":
		u.ContentRef = new(ResourceReponsePart)
		return json.Unmarshal(data, u.ContentRef)
	case "toolCall":
		u.ToolCall = new(ToolCallResponsePart)
		return json.Unmarshal(data, u.ToolCall)
	case "reasoning":
		u.Reasoning = new(ReasoningResponsePart)
		return json.Unmarshal(data, u.Reasoning)
	default:
		return fmt.Errorf("unknown ResponsePart kind: %q", disc.D)
	}
}

func (u ResponsePart) MarshalJSON() ([]byte, error) {
	if u.Markdown != nil {
		return json.Marshal(u.Markdown)
	}
	if u.ContentRef != nil {
		return json.Marshal(u.ContentRef)
	}
	if u.ToolCall != nil {
		return json.Marshal(u.ToolCall)
	}
	if u.Reasoning != nil {
		return json.Marshal(u.Reasoning)
	}
	return nil, fmt.Errorf("empty ResponsePart: no variant set")
}

// ToolCallState is a discriminated union keyed on "status".
type ToolCallState struct {
	Streaming *ToolCallStreamingState
	PendingConfirmation *ToolCallPendingConfirmationState
	Running *ToolCallRunningState
	PendingResultConfirmation *ToolCallPendingResultConfirmationState
	Completed *ToolCallCompletedState
	Cancelled *ToolCallCancelledState
}

func (u *ToolCallState) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"status"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "streaming":
		u.Streaming = new(ToolCallStreamingState)
		return json.Unmarshal(data, u.Streaming)
	case "pending-confirmation":
		u.PendingConfirmation = new(ToolCallPendingConfirmationState)
		return json.Unmarshal(data, u.PendingConfirmation)
	case "running":
		u.Running = new(ToolCallRunningState)
		return json.Unmarshal(data, u.Running)
	case "pending-result-confirmation":
		u.PendingResultConfirmation = new(ToolCallPendingResultConfirmationState)
		return json.Unmarshal(data, u.PendingResultConfirmation)
	case "completed":
		u.Completed = new(ToolCallCompletedState)
		return json.Unmarshal(data, u.Completed)
	case "cancelled":
		u.Cancelled = new(ToolCallCancelledState)
		return json.Unmarshal(data, u.Cancelled)
	default:
		return fmt.Errorf("unknown ToolCallState status: %q", disc.D)
	}
}

func (u ToolCallState) MarshalJSON() ([]byte, error) {
	if u.Streaming != nil {
		return json.Marshal(u.Streaming)
	}
	if u.PendingConfirmation != nil {
		return json.Marshal(u.PendingConfirmation)
	}
	if u.Running != nil {
		return json.Marshal(u.Running)
	}
	if u.PendingResultConfirmation != nil {
		return json.Marshal(u.PendingResultConfirmation)
	}
	if u.Completed != nil {
		return json.Marshal(u.Completed)
	}
	if u.Cancelled != nil {
		return json.Marshal(u.Cancelled)
	}
	return nil, fmt.Errorf("empty ToolCallState: no variant set")
}

// TerminalClaim is a discriminated union keyed on "kind".
type TerminalClaim struct {
	Client *TerminalClientClaim
	Session *TerminalSessionClaim
}

func (u *TerminalClaim) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"kind"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "client":
		u.Client = new(TerminalClientClaim)
		return json.Unmarshal(data, u.Client)
	case "session":
		u.Session = new(TerminalSessionClaim)
		return json.Unmarshal(data, u.Session)
	default:
		return fmt.Errorf("unknown TerminalClaim kind: %q", disc.D)
	}
}

func (u TerminalClaim) MarshalJSON() ([]byte, error) {
	if u.Client != nil {
		return json.Marshal(u.Client)
	}
	if u.Session != nil {
		return json.Marshal(u.Session)
	}
	return nil, fmt.Errorf("empty TerminalClaim: no variant set")
}

// TerminalContentPart is a discriminated union keyed on "type".
type TerminalContentPart struct {
	Unclassified *TerminalUnclassifiedPart
	Command *TerminalCommandPart
}

func (u *TerminalContentPart) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"type"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "unclassified":
		u.Unclassified = new(TerminalUnclassifiedPart)
		return json.Unmarshal(data, u.Unclassified)
	case "command":
		u.Command = new(TerminalCommandPart)
		return json.Unmarshal(data, u.Command)
	default:
		return fmt.Errorf("unknown TerminalContentPart type: %q", disc.D)
	}
}

func (u TerminalContentPart) MarshalJSON() ([]byte, error) {
	if u.Unclassified != nil {
		return json.Marshal(u.Unclassified)
	}
	if u.Command != nil {
		return json.Marshal(u.Command)
	}
	return nil, fmt.Errorf("empty TerminalContentPart: no variant set")
}

// SessionInputQuestion is a discriminated union keyed on "kind".
type SessionInputQuestion struct {
	Text *SessionInputTextQuestion
	Number *SessionInputNumberQuestion
	Integer *SessionInputNumberQuestion
	Boolean *SessionInputBooleanQuestion
	SingleSelect *SessionInputSingleSelectQuestion
	MultiSelect *SessionInputMultiSelectQuestion
}

func (u *SessionInputQuestion) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"kind"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "text":
		u.Text = new(SessionInputTextQuestion)
		return json.Unmarshal(data, u.Text)
	case "number":
		u.Number = new(SessionInputNumberQuestion)
		return json.Unmarshal(data, u.Number)
	case "integer":
		u.Integer = new(SessionInputNumberQuestion)
		return json.Unmarshal(data, u.Integer)
	case "boolean":
		u.Boolean = new(SessionInputBooleanQuestion)
		return json.Unmarshal(data, u.Boolean)
	case "single-select":
		u.SingleSelect = new(SessionInputSingleSelectQuestion)
		return json.Unmarshal(data, u.SingleSelect)
	case "multi-select":
		u.MultiSelect = new(SessionInputMultiSelectQuestion)
		return json.Unmarshal(data, u.MultiSelect)
	default:
		return fmt.Errorf("unknown SessionInputQuestion kind: %q", disc.D)
	}
}

func (u SessionInputQuestion) MarshalJSON() ([]byte, error) {
	if u.Text != nil {
		return json.Marshal(u.Text)
	}
	if u.Number != nil {
		return json.Marshal(u.Number)
	}
	if u.Integer != nil {
		return json.Marshal(u.Integer)
	}
	if u.Boolean != nil {
		return json.Marshal(u.Boolean)
	}
	if u.SingleSelect != nil {
		return json.Marshal(u.SingleSelect)
	}
	if u.MultiSelect != nil {
		return json.Marshal(u.MultiSelect)
	}
	return nil, fmt.Errorf("empty SessionInputQuestion: no variant set")
}

// SessionInputAnswerValue is a discriminated union keyed on "kind".
type SessionInputAnswerValue struct {
	Text *SessionInputTextAnswerValue
	Number *SessionInputNumberAnswerValue
	Boolean *SessionInputBooleanAnswerValue
	Selected *SessionInputSelectedAnswerValue
	SelectedMany *SessionInputSelectedManyAnswerValue
}

func (u *SessionInputAnswerValue) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"kind"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "text":
		u.Text = new(SessionInputTextAnswerValue)
		return json.Unmarshal(data, u.Text)
	case "number":
		u.Number = new(SessionInputNumberAnswerValue)
		return json.Unmarshal(data, u.Number)
	case "boolean":
		u.Boolean = new(SessionInputBooleanAnswerValue)
		return json.Unmarshal(data, u.Boolean)
	case "selected":
		u.Selected = new(SessionInputSelectedAnswerValue)
		return json.Unmarshal(data, u.Selected)
	case "selected-many":
		u.SelectedMany = new(SessionInputSelectedManyAnswerValue)
		return json.Unmarshal(data, u.SelectedMany)
	default:
		return fmt.Errorf("unknown SessionInputAnswerValue kind: %q", disc.D)
	}
}

func (u SessionInputAnswerValue) MarshalJSON() ([]byte, error) {
	if u.Text != nil {
		return json.Marshal(u.Text)
	}
	if u.Number != nil {
		return json.Marshal(u.Number)
	}
	if u.Boolean != nil {
		return json.Marshal(u.Boolean)
	}
	if u.Selected != nil {
		return json.Marshal(u.Selected)
	}
	if u.SelectedMany != nil {
		return json.Marshal(u.SelectedMany)
	}
	return nil, fmt.Errorf("empty SessionInputAnswerValue: no variant set")
}

// SessionInputAnswer is a discriminated union keyed on "state".
type SessionInputAnswer struct {
	Draft *SessionInputAnswered
	Submitted *SessionInputAnswered
	Skipped *SessionInputSkipped
}

func (u *SessionInputAnswer) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"state"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "draft":
		u.Draft = new(SessionInputAnswered)
		return json.Unmarshal(data, u.Draft)
	case "submitted":
		u.Submitted = new(SessionInputAnswered)
		return json.Unmarshal(data, u.Submitted)
	case "skipped":
		u.Skipped = new(SessionInputSkipped)
		return json.Unmarshal(data, u.Skipped)
	default:
		return fmt.Errorf("unknown SessionInputAnswer state: %q", disc.D)
	}
}

func (u SessionInputAnswer) MarshalJSON() ([]byte, error) {
	if u.Draft != nil {
		return json.Marshal(u.Draft)
	}
	if u.Submitted != nil {
		return json.Marshal(u.Submitted)
	}
	if u.Skipped != nil {
		return json.Marshal(u.Skipped)
	}
	return nil, fmt.Errorf("empty SessionInputAnswer: no variant set")
}

// ToolResultContent is a discriminated union keyed on "type".
type ToolResultContent struct {
	Text             *ToolResultTextContent
	EmbeddedResource *ToolResultEmbeddedResourceContent
	Resource         *ToolResultResourceContent
	FileEdit         *ToolResultFileEditContent
	Terminal         *ToolResultTerminalContent
	Subagent         *ToolResultSubagentContent
}

func (u *ToolResultContent) UnmarshalJSON(data []byte) error {
	var disc struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.Type {
	case "text":
		u.Text = new(ToolResultTextContent)
		return json.Unmarshal(data, u.Text)
	case "embeddedResource":
		u.EmbeddedResource = new(ToolResultEmbeddedResourceContent)
		return json.Unmarshal(data, u.EmbeddedResource)
	case "resource":
		u.Resource = new(ToolResultResourceContent)
		return json.Unmarshal(data, u.Resource)
	case "fileEdit":
		u.FileEdit = new(ToolResultFileEditContent)
		return json.Unmarshal(data, u.FileEdit)
	case "terminal":
		u.Terminal = new(ToolResultTerminalContent)
		return json.Unmarshal(data, u.Terminal)
	case "subagent":
		u.Subagent = new(ToolResultSubagentContent)
		return json.Unmarshal(data, u.Subagent)
	default:
		return fmt.Errorf("unknown ToolResultContent type: %q", disc.Type)
	}
}

func (u ToolResultContent) MarshalJSON() ([]byte, error) {
	if u.Text != nil {
		return json.Marshal(u.Text)
	}
	if u.EmbeddedResource != nil {
		return json.Marshal(u.EmbeddedResource)
	}
	if u.Resource != nil {
		return json.Marshal(u.Resource)
	}
	if u.FileEdit != nil {
		return json.Marshal(u.FileEdit)
	}
	if u.Terminal != nil {
		return json.Marshal(u.Terminal)
	}
	if u.Subagent != nil {
		return json.Marshal(u.Subagent)
	}
	return nil, fmt.Errorf("empty ToolResultContent: no variant set")
}

// SnapshotState is the state payload of a snapshot — root, session, or terminal state.
type SnapshotState struct {
	Root     *RootState
	Session  *SessionState
	Terminal *TerminalState
}

func (s *SnapshotState) UnmarshalJSON(data []byte) error {
	// Peek at top-level fields to determine variant type
	var peek map[string]json.RawMessage
	if err := json.Unmarshal(data, &peek); err != nil {
		return err
	}
	// SessionState has a required "summary" field
	if _, ok := peek["summary"]; ok {
		s.Session = new(SessionState)
		return json.Unmarshal(data, s.Session)
	}
	// TerminalState has "content" but not "agents"
	if _, hasContent := peek["content"]; hasContent {
		if _, hasAgents := peek["agents"]; !hasAgents {
			s.Terminal = new(TerminalState)
			return json.Unmarshal(data, s.Terminal)
		}
	}
	// Fall back to RootState
	s.Root = new(RootState)
	return json.Unmarshal(data, s.Root)
}

func (s SnapshotState) MarshalJSON() ([]byte, error) {
	if s.Session != nil {
		return json.Marshal(s.Session)
	}
	if s.Terminal != nil {
		return json.Marshal(s.Terminal)
	}
	if s.Root != nil {
		return json.Marshal(s.Root)
	}
	return nil, fmt.Errorf("empty SnapshotState: no variant set")
}
