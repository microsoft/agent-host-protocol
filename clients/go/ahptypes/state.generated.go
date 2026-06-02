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

// ─── Enums ────────────────────────────────────────────────────────────

// Policy configuration state for a model.
type PolicyState string

const (
	PolicyStateEnabled      PolicyState = "enabled"
	PolicyStateDisabled     PolicyState = "disabled"
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
	SessionLifecycleCreating       SessionLifecycle = "creating"
	SessionLifecycleReady          SessionLifecycle = "ready"
	SessionLifecycleCreationFailed SessionLifecycle = "creationFailed"
)

// Bitset of summary-level session status flags.
//
// Use bitwise checks instead of equality for non-terminal activity. For example,
// `status & SessionStatus.InProgress` matches both ordinary in-progress turns
// and turns that are paused waiting for input.
type SessionStatus uint32

const (
	// Session is idle — no turn is active.
	SessionStatusIdle SessionStatus = 1
	// Session ended with an error.
	SessionStatusError SessionStatus = 2
	// A turn is actively streaming.
	SessionStatusInProgress SessionStatus = 8
	// A turn is in progress but blocked waiting for user input or tool confirmation.
	SessionStatusInputNeeded SessionStatus = 24
	// The client has viewed this session since its last modification.
	SessionStatusIsRead SessionStatus = 32
	// The session has been archived by the client.
	SessionStatusIsArchived SessionStatus = 64
)

// Has reports whether every flag in other is also set in s.
func (s SessionStatus) Has(other SessionStatus) bool { return s&other == other }

// Or returns s combined with the flags in other.
func (s SessionStatus) Or(other SessionStatus) SessionStatus { return s | other }

// Answer lifecycle state.
type SessionInputAnswerState string

const (
	SessionInputAnswerStateDraft     SessionInputAnswerState = "draft"
	SessionInputAnswerStateSubmitted SessionInputAnswerState = "submitted"
	SessionInputAnswerStateSkipped   SessionInputAnswerState = "skipped"
)

// Answer value kind.
type SessionInputAnswerValueKind string

const (
	SessionInputAnswerValueKindText         SessionInputAnswerValueKind = "text"
	SessionInputAnswerValueKindNumber       SessionInputAnswerValueKind = "number"
	SessionInputAnswerValueKindBoolean      SessionInputAnswerValueKind = "boolean"
	SessionInputAnswerValueKindSelected     SessionInputAnswerValueKind = "selected"
	SessionInputAnswerValueKindSelectedMany SessionInputAnswerValueKind = "selected-many"
)

// Question/input control kind.
type SessionInputQuestionKind string

const (
	SessionInputQuestionKindText         SessionInputQuestionKind = "text"
	SessionInputQuestionKindNumber       SessionInputQuestionKind = "number"
	SessionInputQuestionKindInteger      SessionInputQuestionKind = "integer"
	SessionInputQuestionKindBoolean      SessionInputQuestionKind = "boolean"
	SessionInputQuestionKindSingleSelect SessionInputQuestionKind = "single-select"
	SessionInputQuestionKindMultiSelect  SessionInputQuestionKind = "multi-select"
)

// How a client completed an input request.
type SessionInputResponseKind string

const (
	SessionInputResponseKindAccept  SessionInputResponseKind = "accept"
	SessionInputResponseKindDecline SessionInputResponseKind = "decline"
	SessionInputResponseKindCancel  SessionInputResponseKind = "cancel"
)

// How a turn ended.
type TurnState string

const (
	TurnStateComplete  TurnState = "complete"
	TurnStateCancelled TurnState = "cancelled"
	TurnStateError     TurnState = "error"
)

// Discriminant for {@link MessageAttachment} variants.
type MessageAttachmentKind string

const (
	// A simple, opaque attachment whose representation is described by the producer.
	MessageAttachmentKindSimple MessageAttachmentKind = "simple"
	// An attachment whose data is embedded inline as a base64 string.
	MessageAttachmentKindEmbeddedResource MessageAttachmentKind = "embeddedResource"
	// An attachment that references a resource by URI.
	MessageAttachmentKindResource MessageAttachmentKind = "resource"
)

// Discriminant for response part types.
type ResponsePartKind string

const (
	ResponsePartKindMarkdown           ResponsePartKind = "markdown"
	ResponsePartKindContentRef         ResponsePartKind = "contentRef"
	ResponsePartKindToolCall           ResponsePartKind = "toolCall"
	ResponsePartKindReasoning          ResponsePartKind = "reasoning"
	ResponsePartKindSystemNotification ResponsePartKind = "systemNotification"
)

// Status of a tool call in the lifecycle state machine.
type ToolCallStatus string

const (
	ToolCallStatusStreaming                 ToolCallStatus = "streaming"
	ToolCallStatusPendingConfirmation       ToolCallStatus = "pending-confirmation"
	ToolCallStatusRunning                   ToolCallStatus = "running"
	ToolCallStatusPendingResultConfirmation ToolCallStatus = "pending-result-confirmation"
	ToolCallStatusCompleted                 ToolCallStatus = "completed"
	ToolCallStatusCancelled                 ToolCallStatus = "cancelled"
)

// How a tool call was confirmed for execution.
//
// - `NotNeeded` — No confirmation required (auto-approved)
// - `UserAction` — User explicitly approved
// - `Setting` — Approved by a persistent user setting
type ToolCallConfirmationReason string

const (
	ToolCallConfirmationReasonNotNeeded  ToolCallConfirmationReason = "not-needed"
	ToolCallConfirmationReasonUserAction ToolCallConfirmationReason = "user-action"
	ToolCallConfirmationReasonSetting    ToolCallConfirmationReason = "setting"
)

// Why a tool call was cancelled.
type ToolCallCancellationReason string

const (
	ToolCallCancellationReasonDenied       ToolCallCancellationReason = "denied"
	ToolCallCancellationReasonSkipped      ToolCallCancellationReason = "skipped"
	ToolCallCancellationReasonResultDenied ToolCallCancellationReason = "result-denied"
)

// Whether a confirmation option represents an approval or denial action.
type ConfirmationOptionKind string

const (
	ConfirmationOptionKindApprove ConfirmationOptionKind = "approve"
	ConfirmationOptionKindDeny    ConfirmationOptionKind = "deny"
)

// Discriminant for tool result content types.
type ToolResultContentType string

const (
	ToolResultContentTypeText             ToolResultContentType = "text"
	ToolResultContentTypeEmbeddedResource ToolResultContentType = "embeddedResource"
	ToolResultContentTypeResource         ToolResultContentType = "resource"
	ToolResultContentTypeFileEdit         ToolResultContentType = "fileEdit"
	ToolResultContentTypeTerminal         ToolResultContentType = "terminal"
	ToolResultContentTypeSubagent         ToolResultContentType = "subagent"
)

// Discriminant for the kind of customization.
//
// Top-level entries in {@link SessionState.customizations} and
// {@link AgentInfo.customizations} are always
// {@link CustomizationType.Plugin | `Plugin`} or
// {@link CustomizationType.Directory | `Directory`}; the remaining
// types appear only as children of those containers.
type CustomizationType string

const (
	CustomizationTypePlugin    CustomizationType = "plugin"
	CustomizationTypeDirectory CustomizationType = "directory"
	CustomizationTypeAgent     CustomizationType = "agent"
	CustomizationTypeSkill     CustomizationType = "skill"
	CustomizationTypePrompt    CustomizationType = "prompt"
	CustomizationTypeRule      CustomizationType = "rule"
	CustomizationTypeHook      CustomizationType = "hook"
	CustomizationTypeMcpServer CustomizationType = "mcpServer"
)

// Discriminant values for {@link CustomizationLoadState}.
type CustomizationLoadStatus string

const (
	CustomizationLoadStatusLoading  CustomizationLoadStatus = "loading"
	CustomizationLoadStatusLoaded   CustomizationLoadStatus = "loaded"
	CustomizationLoadStatusDegraded CustomizationLoadStatus = "degraded"
	CustomizationLoadStatusError    CustomizationLoadStatus = "error"
)

// Discriminant for terminal claim kinds.
type TerminalClaimKind string

const (
	TerminalClaimKindClient  TerminalClaimKind = "client"
	TerminalClaimKindSession TerminalClaimKind = "session"
)

// Computation lifecycle of a {@link ChangesetState}.
type ChangesetStatus string

const (
	// The server is still computing the contents of this changeset.
	ChangesetStatusComputing ChangesetStatus = "computing"
	// The changeset has been fully computed and is up-to-date.
	ChangesetStatusReady ChangesetStatus = "ready"
	// Computation failed. The cause is described by
	// {@link ChangesetState.error}.
	ChangesetStatusError ChangesetStatus = "error"
)

// Execution lifecycle of a {@link ChangesetOperation}.
//
// An operation is invoked imperatively via `invokeChangesetOperation`, but
// its progress and outcome are reflected back into changeset state so that
// every subscriber observes a consistent view (e.g. a spinner on a "Create
// Pull Request" button, or an inline error after a failed "revert").
type ChangesetOperationStatus string

const (
	// The operation is ready to be invoked. This is the default when
	// {@link ChangesetOperation.status} is omitted.
	ChangesetOperationStatusIdle ChangesetOperationStatus = "idle"
	// An invocation of this operation is currently in flight.
	ChangesetOperationStatusRunning ChangesetOperationStatus = "running"
	// The most recent invocation failed. The cause is described by
	// {@link ChangesetOperation.error}.
	ChangesetOperationStatusError ChangesetOperationStatus = "error"
)

// Where a {@link ChangesetOperation} can be invoked.
type ChangesetOperationScope string

const (
	// Applies to the whole changeset.
	ChangesetOperationScopeChangeset ChangesetOperationScope = "changeset"
	// Applies to a single file within the changeset.
	ChangesetOperationScopeResource ChangesetOperationScope = "resource"
	// Applies to a line range within a single file.
	ChangesetOperationScopeRange ChangesetOperationScope = "range"
)

// Discriminant for {@link ResourceChange.type}.
type ResourceChangeType string

const (
	ResourceChangeTypeAdded   ResourceChangeType = "added"
	ResourceChangeTypeUpdated ResourceChangeType = "updated"
	ResourceChangeTypeDeleted ResourceChangeType = "deleted"
)

// ─── Structs ──────────────────────────────────────────────────────────

// An optionally-sized icon that can be displayed in a user interface.
type Icon struct {
	// A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a
	// `data:` URI with Base64-encoded image data.
	//
	// Consumers SHOULD take steps to ensure URLs serving icons are from the
	// same domain as the client/server or a trusted domain.
	//
	// Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain
	// executable JavaScript.
	Src URI `json:"src"`
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

// Describes a protected resource's authentication requirements using
// [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) (OAuth 2.0
// Protected Resource Metadata) semantics.
//
// Field names use snake_case to match the RFC 9728 JSON format.
type ProtectedResourceMetadata struct {
	// REQUIRED. The protected resource's resource identifier, a URL using the
	// `https` scheme with no fragment component (e.g. `"https://api.github.com"`).
	Resource string `json:"resource"`
	// OPTIONAL. Human-readable name of the protected resource.
	ResourceName *string `json:"resource_name,omitempty"`
	// OPTIONAL. JSON array of OAuth authorization server identifier URLs.
	AuthorizationServers []string `json:"authorization_servers,omitempty"`
	// OPTIONAL. URL of the protected resource's JWK Set document.
	JwksUri *string `json:"jwks_uri,omitempty"`
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
	ResourcePolicyUri *string `json:"resource_policy_uri,omitempty"`
	// OPTIONAL. URL of the resource's terms of service.
	ResourceTosUri *string `json:"resource_tos_uri,omitempty"`
	// AHP extension. Whether authentication is required for this resource.
	//
	// - `true` (default) — the agent cannot be used without a valid token.
	//   The server SHOULD return `AuthRequired` (`-32007`) if the client
	//   attempts to use the agent without authenticating.
	// - `false` — the agent works without authentication but MAY offer
	//   enhanced capabilities when a token is provided.
	//
	// Clients SHOULD treat an absent field the same as `true`.
	Required *bool `json:"required,omitempty"`
}

// Global state shared with every client subscribed to `ahp-root://`.
type RootState struct {
	// Available agent backends and their models
	Agents []AgentInfo `json:"agents"`
	// Number of active (non-disposed) sessions on the server
	ActiveSessions *int64 `json:"activeSessions,omitempty"`
	// Known terminals on the server. Subscribe to individual terminal URIs for full state.
	Terminals []TerminalInfo `json:"terminals,omitempty"`
	// Agent host configuration schema and current values
	Config *RootConfigState `json:"config,omitempty"`
}

// Live agent-host configuration metadata.
//
// The schema describes the available configuration properties and the values
// contain the current value for each resolved property.
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
	// Customizations associated with this agent.
	//
	// Always container customizations —
	// {@link PluginCustomization | `PluginCustomization`} entries the agent
	// bundles, plus {@link DirectoryCustomization | `DirectoryCustomization`}
	// entries it watches in any workspace it's used with. When a session is
	// created with this agent, these entries are augmented (e.g. directory
	// URIs are resolved against the workspace, children are parsed) and
	// propagated into the session's `customizations` list.
	Customizations []Customization `json:"customizations,omitempty"`
}

type SessionModelInfo struct {
	// Model identifier
	Id string `json:"id"`
	// Provider this model belongs to
	Provider string `json:"provider"`
	// Human-readable model name
	Name string `json:"name"`
	// Maximum context window size
	MaxContextWindow *int64 `json:"maxContextWindow,omitempty"`
	// Whether the model supports vision
	SupportsVision *bool `json:"supportsVision,omitempty"`
	// Policy configuration state
	PolicyState *PolicyState `json:"policyState,omitempty"`
	// Configuration schema describing model-specific options (e.g. thinking
	// level). Clients present this as a form and pass the resolved values in
	// {@link ModelSelection.config} when creating or changing sessions.
	ConfigSchema *ConfigSchema `json:"configSchema,omitempty"`
	// Additional provider-specific metadata for this model.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `pricing` key may carry model pricing metadata.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// A model selection: the chosen model ID together with any model-specific
// configuration values whose keys correspond to the model's
// {@link SessionModelInfo.configSchema}.
type ModelSelection struct {
	// Model identifier
	Id string `json:"id"`
	// Model-specific configuration values
	Config map[string]string `json:"config,omitempty"`
}

// A selected custom agent for a session.
//
// The `uri` identifies a specific custom agent (matching an
// {@link AgentCustomization.uri | `AgentCustomization.uri`} exposed via
// the session's effective customizations). Consumers resolve the agent's
// display name by looking up `uri` in the session's customization tree.
//
// A session with no `agent` selected uses the provider's default behavior.
type AgentSelection struct {
	// Stable agent URI (matches an {@link AgentCustomization.uri}).
	Uri URI `json:"uri"`
}

// A JSON Schema-compatible property descriptor with display extensions.
//
// Standard JSON Schema fields (`type`, `title`, `description`, `default`,
// `enum`) allow validators to process the schema. Display extensions
// (`enumLabels`, `enumDescriptions`) are parallel arrays that provide UI
// metadata for each `enum` value.
//
// This is the generic base type. See {@link SessionConfigPropertySchema} for
// session-specific extensions.
type ConfigPropertySchema struct {
	// JSON Schema: property type
	Type string `json:"type"`
	// JSON Schema: human-readable label for the property
	Title string `json:"title"`
	// JSON Schema: description / tooltip
	Description *string `json:"description,omitempty"`
	// JSON Schema: default value
	Default *json.RawMessage `json:"default,omitempty"`
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

// A JSON Schema object describing available configuration properties.
//
// This is the generic base type. See {@link SessionConfigSchema} for
// session-specific usage.
type ConfigSchema struct {
	// JSON Schema: always `'object'`
	Type string `json:"type"`
	// JSON Schema: property descriptors keyed by property id
	Properties map[string]ConfigPropertySchema `json:"properties"`
	// JSON Schema: list of required property ids
	Required []string `json:"required,omitempty"`
}

// A message queued for future delivery to the agent.
//
// Steering messages are injected into the current turn mid-flight.
// Queued messages are automatically started as new turns after the
// current turn naturally finishes.
type PendingMessage struct {
	// Unique identifier for this pending message
	Id string `json:"id"`
	// The message that will start the next turn
	Message Message `json:"message"`
}

// Full state for a single session, loaded when a client subscribes to the session's URI.
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
	// Top-level customizations active in this session.
	//
	// Always container customizations — {@link PluginCustomization} or
	// {@link DirectoryCustomization}. Children (agents, skills, prompts,
	// rules, hooks, MCP servers) live in each container's
	// {@link ContainerCustomizationBase.children | `children`} array.
	//
	// Client-published plugins arrive via
	// {@link SessionActiveClient.customizations | `activeClient.customizations`}
	// and the host propagates them into this list (typically with the
	// container's `clientId` set and `children` populated).
	Customizations []Customization `json:"customizations,omitempty"`
	// Additional provider-specific metadata for this session.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `git` key may provide extra git metadata about the session's
	// workingDirectory.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// The client currently providing tools and interactive capabilities to a session.
//
// Only one client may be active per session at a time. The server SHOULD
// automatically unset the active client if that client disconnects.
type SessionActiveClient struct {
	// Client identifier (matches `clientId` from `initialize`)
	ClientId string `json:"clientId"`
	// Human-readable client name (e.g. `"VS Code"`)
	DisplayName *string `json:"displayName,omitempty"`
	// Tools this client provides to the session
	Tools []ToolDefinition `json:"tools"`
	// Plugin customizations this client contributes to the session.
	//
	// Clients publish in [Open Plugins](https://open-plugins.com/) format
	// — i.e. always container-shaped plugins. They MAY synthesize virtual
	// plugins in memory and rely on the host to expand them into concrete
	// children inside {@link SessionState.customizations}.
	Customizations []ClientPluginCustomization `json:"customizations,omitempty"`
}

type SessionSummary struct {
	// Session URI
	Resource URI `json:"resource"`
	// Agent provider ID
	Provider string `json:"provider"`
	// Session title
	Title string `json:"title"`
	// Current session status
	Status SessionStatus `json:"status"`
	// Human-readable description of what the session is currently doing
	Activity *string `json:"activity,omitempty"`
	// Creation timestamp
	CreatedAt int64 `json:"createdAt"`
	// Last modification timestamp
	ModifiedAt int64 `json:"modifiedAt"`
	// Server-owned project for this session
	Project *ProjectInfo `json:"project,omitempty"`
	// Currently selected model
	Model *ModelSelection `json:"model,omitempty"`
	// Currently selected custom agent.
	//
	// Absent (`undefined`) means no custom agent is selected for this session
	// — the session uses the provider's default behavior.
	Agent *AgentSelection `json:"agent,omitempty"`
	// The working directory URI for this session
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
	// Catalogue of changesets the server can produce for this session. Each
	// entry advertises a subscribable view of file changes (uncommitted,
	// session-wide, per-turn, etc.) and the URI template the client expands
	// before subscribing. See {@link ChangesetSummary} for the full shape and
	// {@link /guide/changesets | Changesets} for an overview of the model.
	Changesets []ChangesetSummary `json:"changesets,omitempty"`
}

// Server-owned project metadata for a session.
type ProjectInfo struct {
	// Project URI
	Uri URI `json:"uri"`
	// Human-readable project name
	DisplayName string `json:"displayName"`
}

// A session configuration property descriptor.
//
// Extends the generic {@link ConfigPropertySchema} with session-specific
// display extensions.
type SessionConfigPropertySchema struct {
	// JSON Schema: property type
	Type string `json:"type"`
	// JSON Schema: human-readable label for the property
	Title string `json:"title"`
	// JSON Schema: description / tooltip
	Description *string `json:"description,omitempty"`
	// JSON Schema: default value
	Default *json.RawMessage `json:"default,omitempty"`
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
	// Display extension: when `true`, the full set of allowed values is too large
	// to enumerate statically. The client SHOULD use `sessionConfigCompletions`
	// to fetch matching values based on user input. Any values in `enum` are
	// seed/recent values for initial display.
	EnumDynamic *bool `json:"enumDynamic,omitempty"`
	// When `true`, the user may change this property after session creation
	SessionMutable *bool `json:"sessionMutable,omitempty"`
}

// A JSON Schema object describing available session configuration metadata.
type SessionConfigSchema struct {
	// JSON Schema: always `'object'`
	Type string `json:"type"`
	// JSON Schema: property descriptors keyed by property id
	Properties map[string]SessionConfigPropertySchema `json:"properties"`
	// JSON Schema: list of required property ids
	Required []string `json:"required,omitempty"`
}

// Live session configuration metadata.
//
// The schema describes the available configuration properties and the values
// contain the current value for each resolved property.
type SessionConfigState struct {
	// JSON Schema describing available configuration properties
	Schema SessionConfigSchema `json:"schema"`
	// Current configuration values
	Values map[string]json.RawMessage `json:"values"`
}

// A completed request/response cycle.
type Turn struct {
	// Turn identifier
	Id string `json:"id"`
	// The message that initiated the turn
	Message Message `json:"message"`
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

// An in-progress turn — the assistant is actively streaming.
type ActiveTurn struct {
	// Turn identifier
	Id string `json:"id"`
	// The message that initiated the turn
	Message Message `json:"message"`
	// All response content in stream order: text, tool calls, reasoning, and content refs.
	//
	// Tool call parts include `pendingPermissions` when permissions are awaiting user approval.
	ResponseParts []ResponsePart `json:"responseParts"`
	// Token usage info
	Usage *UsageInfo `json:"usage,omitempty"`
}

// A message that initiates or steers a turn. Messages can originate from the
// user or be system-generated (see {@link MessageKind}).
//
// Attachments MAY be referenced inside {@link Message.text} via their
// {@link MessageAttachmentBase.range} field. Attachments without a range are
// still associated with the message but do not correspond to a specific span
// in the text.
type Message struct {
	// Message text
	Text string `json:"text"`
	// The origin of the message
	Origin json.RawMessage `json:"origin"`
	// File/selection attachments
	Attachments []MessageAttachment `json:"attachments,omitempty"`
	// Additional provider-specific metadata for this message.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI, and
	// agent hosts MAY use it to carry context that does not fit any other
	// field. Mirrors the MCP `_meta` convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// A choice in a select-style question.
type SessionInputOption struct {
	// Stable option identifier; for MCP enum values this is the enum string
	Id string `json:"id"`
	// Display label
	Label string `json:"label"`
	// Optional secondary text
	Description *string `json:"description,omitempty"`
	// Whether this option is the recommended/default choice
	Recommended *bool `json:"recommended,omitempty"`
}

// Value captured for one answer.
type SessionInputTextAnswerValue struct {
	Kind  SessionInputAnswerValueKind `json:"kind"`
	Value string                      `json:"value"`
}

type SessionInputNumberAnswerValue struct {
	Kind  SessionInputAnswerValueKind `json:"kind"`
	Value float64                     `json:"value"`
}

type SessionInputBooleanAnswerValue struct {
	Kind  SessionInputAnswerValueKind `json:"kind"`
	Value bool                        `json:"value"`
}

type SessionInputSelectedAnswerValue struct {
	Kind  SessionInputAnswerValueKind `json:"kind"`
	Value string                      `json:"value"`
	// Free-form text entered instead of selecting an option
	FreeformValues []string `json:"freeformValues,omitempty"`
}

type SessionInputSelectedManyAnswerValue struct {
	Kind  SessionInputAnswerValueKind `json:"kind"`
	Value []string                    `json:"value"`
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

// Text question within a session input request.
type SessionInputTextQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                    `json:"required,omitempty"`
	Kind     SessionInputQuestionKind `json:"kind"`
	// Format hint for text questions, such as `email`, `uri`, `date`, or `date-time`
	Format *string `json:"format,omitempty"`
	// Minimum string length
	Min *int64 `json:"min,omitempty"`
	// Maximum string length
	Max *int64 `json:"max,omitempty"`
	// Default text
	DefaultValue *string `json:"defaultValue,omitempty"`
}

// Numeric question within a session input request.
type SessionInputNumberQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                    `json:"required,omitempty"`
	Kind     SessionInputQuestionKind `json:"kind"`
	// Minimum value
	Min *float64 `json:"min,omitempty"`
	// Maximum value
	Max *float64 `json:"max,omitempty"`
	// Default numeric value
	DefaultValue *float64 `json:"defaultValue,omitempty"`
}

// Boolean question within a session input request.
type SessionInputBooleanQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                    `json:"required,omitempty"`
	Kind     SessionInputQuestionKind `json:"kind"`
	// Default boolean value
	DefaultValue *bool `json:"defaultValue,omitempty"`
}

// Single-select question within a session input request.
type SessionInputSingleSelectQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                    `json:"required,omitempty"`
	Kind     SessionInputQuestionKind `json:"kind"`
	// Options the user may select from
	Options []SessionInputOption `json:"options"`
	// Whether the user may enter text instead of selecting an option
	AllowFreeformInput *bool `json:"allowFreeformInput,omitempty"`
}

// Multi-select question within a session input request.
type SessionInputMultiSelectQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                    `json:"required,omitempty"`
	Kind     SessionInputQuestionKind `json:"kind"`
	// Options the user may select from
	Options []SessionInputOption `json:"options"`
	// Whether the user may enter text in addition to selecting options
	AllowFreeformInput *bool `json:"allowFreeformInput,omitempty"`
	// Minimum selected item count
	Min *int64 `json:"min,omitempty"`
	// Maximum selected item count
	Max *int64 `json:"max,omitempty"`
}

// A live request for user input.
//
// The server creates or replaces requests with `session/inputRequested`.
// Clients sync drafts with `session/inputAnswerChanged` and complete requests
// with `session/inputCompleted`.
type SessionInputRequest struct {
	// Stable request identifier
	Id string `json:"id"`
	// Display message for the request as a whole
	Message *string `json:"message,omitempty"`
	// URL the user should review or open, for URL-style elicitations
	Url *URI `json:"url,omitempty"`
	// Ordered questions to ask the user
	Questions []SessionInputQuestion `json:"questions,omitempty"`
	// Current draft or submitted answers, keyed by question ID
	Answers map[string]SessionInputAnswer `json:"answers,omitempty"`
}

// A zero-based position within a textual document.
type TextPosition struct {
	// Zero-based line number.
	Line int64 `json:"line"`
	// Zero-based character offset within the line.
	Character int64 `json:"character"`
}

// A range within a textual document.
type TextRange struct {
	// Start position of the range.
	Start TextPosition `json:"start"`
	// End position of the range.
	End TextPosition `json:"end"`
}

// A selection within a textual resource.
//
// This is only meaningful for textual resources. Binary resources may still
// use resource or embedded resource attachments, but they should not use this
// text selection field.
type TextSelection struct {
	// The range covered by the selection.
	Range TextRange `json:"range"`
}

// A simple, opaque attachment whose model representation is described by
// the producer.
type SimpleMessageAttachment struct {
	// A human-readable label for the attachment (e.g. the filename of a file
	// attachment). Used for display in UI.
	Label string `json:"label"`
	// If defined, the range in {@link Message.text} that references this
	// attachment. This is a text range, not a byte range.
	Range *TextRange `json:"range,omitempty"`
	// Advisory display hint for clients rendering this attachment. Recognized
	// values include:
	//
	// - `'image'`: the attachment is an image
	// - `'document'`: the attachment is a textual document
	// - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
	// - `'directory'`: the attachment is a folder
	// - `'selection'`: the attachment is a selection within a document
	//
	// Implementations MAY provide additional values; clients SHOULD fall back
	// to a reasonable default when an unknown value is encountered.
	DisplayKind *string `json:"displayKind,omitempty"`
	// Additional implementation-defined metadata for the attachment.
	//
	// If the attachment was produced by the `completions` command, the client
	// MUST preserve every property of `_meta` originally returned by the agent
	// host when sending the user message containing the accepted completion.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Discriminant
	Type MessageAttachmentKind `json:"type"`
	// Representation of the attachment as it should be shown to the model.
	//
	// If the attachment was produced by the client, this property MUST be
	// defined so the agent host can correctly interpret the attachment. This
	// property MAY be omitted when the attachment originated from a
	// `completions` response.
	ModelRepresentation *string `json:"modelRepresentation,omitempty"`
}

// An attachment whose data is embedded inline as a base64 string.
//
// Use this for small binary payloads (e.g. a pasted image) that should be
// delivered with the user message itself rather than fetched separately.
type MessageEmbeddedResourceAttachment struct {
	// A human-readable label for the attachment (e.g. the filename of a file
	// attachment). Used for display in UI.
	Label string `json:"label"`
	// If defined, the range in {@link Message.text} that references this
	// attachment. This is a text range, not a byte range.
	Range *TextRange `json:"range,omitempty"`
	// Advisory display hint for clients rendering this attachment. Recognized
	// values include:
	//
	// - `'image'`: the attachment is an image
	// - `'document'`: the attachment is a textual document
	// - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
	// - `'directory'`: the attachment is a folder
	// - `'selection'`: the attachment is a selection within a document
	//
	// Implementations MAY provide additional values; clients SHOULD fall back
	// to a reasonable default when an unknown value is encountered.
	DisplayKind *string `json:"displayKind,omitempty"`
	// Additional implementation-defined metadata for the attachment.
	//
	// If the attachment was produced by the `completions` command, the client
	// MUST preserve every property of `_meta` originally returned by the agent
	// host when sending the user message containing the accepted completion.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Discriminant
	Type MessageAttachmentKind `json:"type"`
	// Base64-encoded binary data
	Data string `json:"data"`
	// Content MIME type (e.g. `"image/png"`, `"application/pdf"`)
	ContentType string `json:"contentType"`
	// Optional selection within the attached textual resource.
	//
	// Only meaningful for textual resources.
	Selection *TextSelection `json:"selection,omitempty"`
}

// An attachment that references a resource by URI. The content is not
// delivered inline; consumers can fetch it via `resourceRead` when needed.
type MessageResourceAttachment struct {
	// A human-readable label for the attachment (e.g. the filename of a file
	// attachment). Used for display in UI.
	Label string `json:"label"`
	// If defined, the range in {@link Message.text} that references this
	// attachment. This is a text range, not a byte range.
	Range *TextRange `json:"range,omitempty"`
	// Advisory display hint for clients rendering this attachment. Recognized
	// values include:
	//
	// - `'image'`: the attachment is an image
	// - `'document'`: the attachment is a textual document
	// - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
	// - `'directory'`: the attachment is a folder
	// - `'selection'`: the attachment is a selection within a document
	//
	// Implementations MAY provide additional values; clients SHOULD fall back
	// to a reasonable default when an unknown value is encountered.
	DisplayKind *string `json:"displayKind,omitempty"`
	// Additional implementation-defined metadata for the attachment.
	//
	// If the attachment was produced by the `completions` command, the client
	// MUST preserve every property of `_meta` originally returned by the agent
	// host when sending the user message containing the accepted completion.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Content URI
	Uri URI `json:"uri"`
	// Approximate size in bytes
	SizeHint *int64 `json:"sizeHint,omitempty"`
	// Content MIME type
	ContentType *string `json:"contentType,omitempty"`
	// Discriminant
	Type MessageAttachmentKind `json:"type"`
	// Optional selection within the referenced textual resource.
	//
	// Only meaningful for textual resources.
	Selection *TextSelection `json:"selection,omitempty"`
}

type MarkdownResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// Part identifier, used by `session/delta` to target this part for content appends
	Id string `json:"id"`
	// Markdown content
	Content string `json:"content"`
}

// A reference to large content stored outside the state tree.
type ContentRef struct {
	// Content URI
	Uri URI `json:"uri"`
	// Approximate size in bytes
	SizeHint *int64 `json:"sizeHint,omitempty"`
	// Content MIME type
	ContentType *string `json:"contentType,omitempty"`
}

// A content part that's a reference to large content stored outside the state tree.
type ResourceResponsePart struct {
	// Content URI
	Uri URI `json:"uri"`
	// Approximate size in bytes
	SizeHint *int64 `json:"sizeHint,omitempty"`
	// Content MIME type
	ContentType *string `json:"contentType,omitempty"`
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
}

// A tool call represented as a response part.
//
// Tool calls are part of the response stream, interleaved with text and
// reasoning. The `toolCall.toolCallId` serves as the part identifier for
// actions that target this part.
type ToolCallResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// Full tool call lifecycle state
	ToolCall ToolCallState `json:"toolCall"`
}

// Reasoning/thinking content from the model.
type ReasoningResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// Part identifier, used by `session/reasoning` to target this part for content appends
	Id string `json:"id"`
	// Accumulated reasoning text
	Content string `json:"content"`
}

// A system notification surfaced as part of the response stream.
//
// System notifications are messages authored by the agent harness
// that need to be visible to both the agent (for situational awareness) and
// the user (for transcript continuity). Examples include "background subagent
// X completed" or "task Y was cancelled".
type SystemNotificationResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// The text of the system notification
	Content StringOrMarkdown `json:"content"`
}

// Tool execution result details, available after execution completes.
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
	Error *json.RawMessage `json:"error,omitempty"`
}

// A confirmation option that the server offers for a tool call awaiting
// approval. Allows richer choices beyond simple approve/deny — for example,
// "Approve in this Session" or "Deny with reason."
type ConfirmationOption struct {
	// Unique identifier for the option, returned in the confirmed action
	Id string `json:"id"`
	// Human-readable label displayed to the user
	Label string `json:"label"`
	// Whether this option represents an approval or denial
	Kind ConfirmationOptionKind `json:"kind"`
	// Logical group number for visual categorisation.
	//
	// Clients SHOULD display options in the order they are defined and MAY
	// use differing group numbers to insert dividers between logical clusters
	// of options.
	Group *int64 `json:"group,omitempty"`
}

// LM is streaming the tool call parameters.
type ToolCallStreamingState struct {
	// Unique tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	//
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientId *string `json:"toolClientId,omitempty"`
	// Additional provider-specific metadata for this tool call.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	// For example, a `ptyTerminal` key with `{ input: string; output: string }`
	// indicates the tool operated on a terminal (both `input` and `output` may
	// contain escape sequences).
	Meta   map[string]json.RawMessage `json:"_meta,omitempty"`
	Status ToolCallStatus             `json:"status"`
	// Partial parameters accumulated so far
	PartialInput *string `json:"partialInput,omitempty"`
	// Progress message shown while parameters are streaming
	InvocationMessage *StringOrMarkdown `json:"invocationMessage,omitempty"`
}

// Parameters are complete, or a running tool requires re-confirmation
// (e.g. a mid-execution permission check).
type ToolCallPendingConfirmationState struct {
	// Unique tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	//
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientId *string `json:"toolClientId,omitempty"`
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
	ToolInput *string        `json:"toolInput,omitempty"`
	Status    ToolCallStatus `json:"status"`
	// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
	ConfirmationTitle *StringOrMarkdown `json:"confirmationTitle,omitempty"`
	// File edits that this tool call will perform, for preview before confirmation
	Edits *json.RawMessage `json:"edits,omitempty"`
	// Whether the agent host allows the client to edit the tool's input parameters before confirming
	Editable *bool `json:"editable,omitempty"`
	// Options the server offers for this confirmation. When present, the client
	// SHOULD render these instead of a plain approve/deny UI. Each option
	// belongs to a {@link ConfirmationOptionGroup} so the client can still
	// categorise the choices.
	Options []ConfirmationOption `json:"options,omitempty"`
}

// Tool is actively executing.
type ToolCallRunningState struct {
	// Unique tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	//
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientId *string `json:"toolClientId,omitempty"`
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
	ToolInput *string        `json:"toolInput,omitempty"`
	Status    ToolCallStatus `json:"status"`
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

// Tool finished executing, waiting for client to approve the result.
type ToolCallPendingResultConfirmationState struct {
	// Unique tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	//
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientId *string `json:"toolClientId,omitempty"`
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
	Error  *json.RawMessage `json:"error,omitempty"`
	Status ToolCallStatus   `json:"status"`
	// How the tool was confirmed for execution
	Confirmed ToolCallConfirmationReason `json:"confirmed"`
	// The confirmation option the user selected, if confirmation options were provided
	SelectedOption *ConfirmationOption `json:"selectedOption,omitempty"`
}

// Tool completed successfully or with an error.
type ToolCallCompletedState struct {
	// Unique tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	//
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientId *string `json:"toolClientId,omitempty"`
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
	Error  *json.RawMessage `json:"error,omitempty"`
	Status ToolCallStatus   `json:"status"`
	// How the tool was confirmed for execution
	Confirmed ToolCallConfirmationReason `json:"confirmed"`
	// The confirmation option the user selected, if confirmation options were provided
	SelectedOption *ConfirmationOption `json:"selectedOption,omitempty"`
}

// Tool call was cancelled before execution.
type ToolCallCancelledState struct {
	// Unique tool call identifier
	ToolCallId string `json:"toolCallId"`
	// Internal tool name (for debugging/logging)
	ToolName string `json:"toolName"`
	// Human-readable tool name
	DisplayName string `json:"displayName"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	//
	// When set, the identified client is responsible for executing the tool and
	// dispatching `session/toolCallComplete` with the result.
	ToolClientId *string `json:"toolClientId,omitempty"`
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
	ToolInput *string        `json:"toolInput,omitempty"`
	Status    ToolCallStatus `json:"status"`
	// Why the tool was cancelled
	Reason ToolCallCancellationReason `json:"reason"`
	// Optional message explaining the cancellation
	ReasonMessage *StringOrMarkdown `json:"reasonMessage,omitempty"`
	// What the user suggested doing instead
	UserSuggestion *Message `json:"userSuggestion,omitempty"`
	// The confirmation option the user selected, if confirmation options were provided
	SelectedOption *ConfirmationOption `json:"selectedOption,omitempty"`
}

// Describes a tool available in a session, provided by either the server or the active client.
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
	InputSchema *json.RawMessage `json:"inputSchema,omitempty"`
	// JSON Schema defining the structure of the tool's output.
	//
	// Mirrors MCP `Tool.outputSchema`.
	OutputSchema *json.RawMessage `json:"outputSchema,omitempty"`
	// Behavioral hints about the tool. All properties are advisory.
	Annotations *ToolAnnotations `json:"annotations,omitempty"`
	// Additional provider-specific metadata.
	//
	// Mirrors the MCP `_meta` convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Behavioral hints about a tool. All properties are advisory and not
// guaranteed to faithfully describe tool behavior.
//
// Mirrors MCP `ToolAnnotations` from the Model Context Protocol specification.
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

// Text content in a tool result.
//
// Mirrors MCP `TextContent`.
type ToolResultTextContent struct {
	Type ToolResultContentType `json:"type"`
	// The text content
	Text string `json:"text"`
}

// Base64-encoded binary content embedded in a tool result.
//
// Mirrors MCP `EmbeddedResource` for inline binary data.
type ToolResultEmbeddedResourceContent struct {
	Type ToolResultContentType `json:"type"`
	// Base64-encoded data
	Data string `json:"data"`
	// Content type (e.g. `"image/png"`, `"application/pdf"`)
	ContentType string `json:"contentType"`
}

// A reference to a resource stored outside the tool result.
//
// Wraps {@link ContentRef} for lazy-loading large results.
type ToolResultResourceContent struct {
	// Content URI
	Uri URI `json:"uri"`
	// Approximate size in bytes
	SizeHint *int64 `json:"sizeHint,omitempty"`
	// Content MIME type
	ContentType *string               `json:"contentType,omitempty"`
	Type        ToolResultContentType `json:"type"`
}

// Describes a file modification performed by a tool.
type ToolResultFileEditContent struct {
	// The file state before the edit. Absent for file creations or for in-place file edits.
	Before *json.RawMessage `json:"before,omitempty"`
	// The file state after the edit. Absent for file deletions.
	After *json.RawMessage `json:"after,omitempty"`
	// Optional diff display metadata
	Diff *json.RawMessage      `json:"diff,omitempty"`
	Type ToolResultContentType `json:"type"`
}

// A reference to a terminal whose output is relevant to this tool result.
//
// Clients can subscribe to the terminal's URI to stream its output in real
// time, providing live feedback while a tool is executing.
type ToolResultTerminalContent struct {
	Type ToolResultContentType `json:"type"`
	// Terminal URI (subscribable for full terminal state)
	Resource URI `json:"resource"`
	// Display title for the terminal content
	Title string `json:"title"`
}

// A reference to a subagent session spawned by a tool.
//
// Clients can subscribe to the subagent's session URI to stream its
// progress in real time, including inner tool calls and responses.
type ToolResultSubagentContent struct {
	Type ToolResultContentType `json:"type"`
	// Subagent session URI (subscribable for full session state)
	Resource URI `json:"resource"`
	// Display title for the subagent
	Title string `json:"title"`
	// Internal agent name
	AgentName *string `json:"agentName,omitempty"`
	// Human-readable description of the subagent's task
	Description *string `json:"description,omitempty"`
}

// Container is being loaded by the host.
type CustomizationLoadingState struct {
	Kind CustomizationLoadStatus `json:"kind"`
}

// Container loaded successfully.
type CustomizationLoadedState struct {
	Kind CustomizationLoadStatus `json:"kind"`
}

// Container partially loaded but has warnings.
type CustomizationDegradedState struct {
	Kind CustomizationLoadStatus `json:"kind"`
	// Human-readable description of the warning.
	Message string `json:"message"`
}

// Container failed to load.
type CustomizationErrorState struct {
	Kind CustomizationLoadStatus `json:"kind"`
	// Human-readable error message.
	Message string `json:"message"`
}

// An [Open Plugins](https://open-plugins.com/) plugin.
type PluginCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange `json:"range,omitempty"`
	// Whether this container is currently enabled.
	Enabled bool `json:"enabled"`
	// `clientId` of the client that contributed this container. Absent for
	// server-originated entries.
	ClientId *string `json:"clientId,omitempty"`
	// Host-reported load state. Absent means the host has not yet reported
	// a load state for this container.
	Load *CustomizationLoadState `json:"load,omitempty"`
	// Children discovered inside this container.
	//
	// Absent means the host has not parsed this container yet. An empty
	// array means the host parsed the container and it contributes
	// nothing.
	Children []ChildCustomization `json:"children,omitempty"`
	Type     CustomizationType    `json:"type"`
}

// A {@link PluginCustomization} as published by a client. Extends the
// server-facing shape with an opaque `nonce` so the host can detect when
// the client's view of a plugin has changed and re-parse only as needed.
//
// Clients SHOULD include a `nonce`. Server-side fields like
// {@link ContainerCustomizationBase.children | `children`} and
// {@link ContainerCustomizationBase.load | `load`} are typically left
// absent on publication and populated by the host when the resolved
// plugin appears in {@link SessionState.customizations}.
type ClientPluginCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange `json:"range,omitempty"`
	// Whether this container is currently enabled.
	Enabled bool `json:"enabled"`
	// `clientId` of the client that contributed this container. Absent for
	// server-originated entries.
	ClientId *string `json:"clientId,omitempty"`
	// Host-reported load state. Absent means the host has not yet reported
	// a load state for this container.
	Load *CustomizationLoadState `json:"load,omitempty"`
	// Children discovered inside this container.
	//
	// Absent means the host has not parsed this container yet. An empty
	// array means the host parsed the container and it contributes
	// nothing.
	Children []ChildCustomization `json:"children,omitempty"`
	Type     CustomizationType    `json:"type"`
	// Opaque version token used by the host to detect changes.
	Nonce *string `json:"nonce,omitempty"`
}

// A directory the host watches for this session.
//
// Presence in the customization list signals that the host may discover
// customizations from this directory. When `writable` is `true`, clients
// MAY persist new customizations into the directory using
// [`resourceWrite`](/reference/common#resourcewrite); the host will
// then surface the resulting child via the customization actions.
//
// The directory may not yet exist on disk.
type DirectoryCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange `json:"range,omitempty"`
	// Whether this container is currently enabled.
	Enabled bool `json:"enabled"`
	// `clientId` of the client that contributed this container. Absent for
	// server-originated entries.
	ClientId *string `json:"clientId,omitempty"`
	// Host-reported load state. Absent means the host has not yet reported
	// a load state for this container.
	Load *CustomizationLoadState `json:"load,omitempty"`
	// Children discovered inside this container.
	//
	// Absent means the host has not parsed this container yet. An empty
	// array means the host parsed the container and it contributes
	// nothing.
	Children []ChildCustomization `json:"children,omitempty"`
	Type     CustomizationType    `json:"type"`
	// Which child customization type this directory holds.
	Contents CustomizationType `json:"contents"`
	// Whether clients may write into this directory.
	Writable bool `json:"writable"`
}

// A custom agent contributed by a plugin or directory.
//
// Mirrors the [Open Plugins agent](https://open-plugins.com/agent-builders/components/agents)
// format: a markdown file with YAML frontmatter, where the body is the
// agent's system prompt.
type AgentCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange        `json:"range,omitempty"`
	Type  CustomizationType `json:"type"`
	// Short description of what the agent specializes in and when to
	// invoke it. Sourced from the agent file's frontmatter `description`.
	Description *string `json:"description,omitempty"`
}

// A skill contributed by a plugin or directory.
//
// Covers both [Open Plugins skill formats](https://open-plugins.com/agent-builders/components/skills)
// — the `skills/` directory layout (one subdirectory per skill, each with
// a `SKILL.md`) and the flatter `commands/` directory of slash-command
// skills.
type SkillCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange        `json:"range,omitempty"`
	Type  CustomizationType `json:"type"`
	// Short description used for help text and auto-invocation matching.
	// Sourced from the skill's frontmatter `description`.
	Description *string `json:"description,omitempty"`
	// When `true`, only the user can invoke this skill — the agent will not
	// auto-invoke it. Sourced from the command skill's frontmatter
	// `disable-model-invocation` flag.
	DisableModelInvocation *bool `json:"disableModelInvocation,omitempty"`
}

// A prompt contributed by a plugin or directory.
type PromptCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange        `json:"range,omitempty"`
	Type  CustomizationType `json:"type"`
	// Short description of what the prompt does.
	Description *string `json:"description,omitempty"`
}

// A rule contributed by a plugin or directory.
//
// Mirrors the [Open Plugins rule](https://open-plugins.com/agent-builders/components/rules)
// format: a markdown file (e.g. `.mdc`) whose body is injected into
// context while the rule is active. This type also covers tool-specific
// "instruction" formats (e.g. VS Code Copilot's
// `.github/instructions/*.md`), which differ only in naming — they
// share the same semantics of `description`, optional always-on
// activation, and optional glob scoping.
type RuleCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange        `json:"range,omitempty"`
	Type  CustomizationType `json:"type"`
	// Description of what the rule enforces.
	Description *string `json:"description,omitempty"`
	// When `true`, the rule is always active (subject to `globs` if any).
	// When `false` or absent, the agent or user decides whether to apply
	// the rule.
	AlwaysApply *bool `json:"alwaysApply,omitempty"`
	// Glob patterns the rule applies to. When present, the rule is only
	// active for matching files.
	Globs []string `json:"globs,omitempty"`
}

// A hook manifest contributed by a plugin or directory.
type HookCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange        `json:"range,omitempty"`
	Type  CustomizationType `json:"type"`
}

// An MCP manifest contributed by a plugin or directory.
//
// When the server is declared inline in the containing plugin manifest,
// `uri` points at the manifest file and
// {@link CustomizationBase.range | `range`} narrows it to the
// declaration's span.
type McpServerCustomization struct {
	// Session-unique opaque identifier. Used by every action that targets a
	// specific customization. Minted by whoever publishes the customization
	// (typically the agent host).
	Id string `json:"id"`
	// Source URI for this customization. A plugin URL, a file URI, or a
	// directory URI.
	//
	// For declarations that live inside a larger file — e.g. an MCP
	// server declared inline in a `plugins.json` manifest — `uri` points
	// to the containing file and {@link CustomizationBase.range | `range`}
	// narrows it to the declaration's span.
	Uri URI `json:"uri"`
	// Human-readable name.
	Name string `json:"name"`
	// Icons for UI display.
	Icons []Icon `json:"icons,omitempty"`
	// Optional span within {@link CustomizationBase.uri | `uri`} when this
	// customization is a subset of a larger file (for example, one entry
	// in an inline `mcpServers` block of a `plugins.json` manifest).
	// Absent when the customization covers the whole resource.
	Range *TextRange        `json:"range,omitempty"`
	Type  CustomizationType `json:"type"`
}

// Describes a file modification with before/after state and diff metadata.
//
// Supports creates (only `after`), deletes (only `before`), renames/moves
// (different `uri` in `before` and `after`), and edits (same `uri`, different content).
type FileEdit struct {
	// The file state before the edit. Absent for file creations or for in-place file edits.
	Before *json.RawMessage `json:"before,omitempty"`
	// The file state after the edit. Absent for file deletions.
	After *json.RawMessage `json:"after,omitempty"`
	// Optional diff display metadata
	Diff *json.RawMessage `json:"diff,omitempty"`
}

// Lightweight terminal metadata exposed on the root state.
type TerminalInfo struct {
	// Terminal URI (subscribable for full terminal state)
	Resource URI `json:"resource"`
	// Human-readable terminal title
	Title string `json:"title"`
	// Who currently holds this terminal
	Claim TerminalClaim `json:"claim"`
	// Process exit code, if the terminal process has exited
	ExitCode *int64 `json:"exitCode,omitempty"`
}

// A terminal claimed by a connected client.
type TerminalClientClaim struct {
	// Discriminant
	Kind TerminalClaimKind `json:"kind"`
	// The `clientId` of the claiming client
	ClientId string `json:"clientId"`
}

// A terminal claimed by a session, optionally scoped to a specific turn or tool call.
type TerminalSessionClaim struct {
	// Discriminant
	Kind TerminalClaimKind `json:"kind"`
	// Session URI that claimed the terminal
	Session URI `json:"session"`
	// Optional turn identifier within the session
	TurnId *string `json:"turnId,omitempty"`
	// Optional tool call identifier within the turn
	ToolCallId *string `json:"toolCallId,omitempty"`
}

// Full state for a single terminal, loaded when a client subscribes to the terminal's URI.
type TerminalState struct {
	// Human-readable terminal title
	Title string `json:"title"`
	// Current working directory of the terminal process
	Cwd *URI `json:"cwd,omitempty"`
	// Terminal width in columns
	Cols *int64 `json:"cols,omitempty"`
	// Terminal height in rows
	Rows *int64 `json:"rows,omitempty"`
	// Typed content parts, replacing the flat `content: string`.
	//
	// Naive consumers that only need the raw VT stream can reconstruct it with:
	//   `content.map(p => p.type === 'command' ? p.output : p.value).join('')`
	//
	// Consumers that need command boundaries can filter by part type.
	Content []TerminalContentPart `json:"content"`
	// Process exit code, set when the terminal process exits
	ExitCode *int64 `json:"exitCode,omitempty"`
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

// Unstructured terminal output — content before, between, or after commands,
// or from terminals that do not support command detection.
type TerminalUnclassifiedPart struct {
	Type string `json:"type"`
	// Accumulated VT output. Appended to by `terminal/data` when no command is executing.
	Value string `json:"value"`
}

// A single command: its command line and the output it produced.
//
// While `isComplete` is false the command is still executing; `output` grows
// as `terminal/data` actions arrive. At `terminal/commandFinished` the part
// is mutated in-place with `isComplete: true` and the completion metadata.
type TerminalCommandPart struct {
	Type string `json:"type"`
	// Stable id matching the `commandId` on the corresponding
	// `terminal/commandExecuted` and `terminal/commandFinished` actions.
	CommandId string `json:"commandId"`
	// The command line submitted to the shell.
	CommandLine string `json:"commandLine"`
	// Accumulated VT output. Appended to by `terminal/data` while `isComplete`
	// is false. Shell integration escape sequences are stripped by the server.
	Output string `json:"output"`
	// Unix timestamp (ms) when execution started, as reported by the server.
	Timestamp int64 `json:"timestamp"`
	// Whether the command has finished.
	IsComplete bool `json:"isComplete"`
	// Shell exit code. Set at completion. `undefined` if unknown.
	ExitCode *int64 `json:"exitCode,omitempty"`
	// Wall-clock duration in milliseconds. Set at completion.
	DurationMs *int64 `json:"durationMs,omitempty"`
}

type UsageInfo struct {
	// Input tokens consumed
	InputTokens *int64 `json:"inputTokens,omitempty"`
	// Output tokens generated
	OutputTokens *int64 `json:"outputTokens,omitempty"`
	// Model used
	Model *string `json:"model,omitempty"`
	// Tokens read from cache
	CacheReadTokens *int64 `json:"cacheReadTokens,omitempty"`
	// Additional provider-specific metadata for this usage report.
	// Clients MAY look for well-known optional keys here to provide enhanced UI.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

type ErrorInfo struct {
	// Error type identifier
	ErrorType string `json:"errorType"`
	// Human-readable error message
	Message string `json:"message"`
	// Stack trace
	Stack *string `json:"stack,omitempty"`
}

// A point-in-time snapshot of a subscribed resource's state, returned by
// `initialize`, `reconnect`, and `subscribe`.
type Snapshot struct {
	// The subscribed channel URI (e.g. `ahp-root://` or `ahp-session:/<uuid>`)
	Resource URI `json:"resource"`
	// The current state of the resource
	State SnapshotState `json:"state"`
	// The `serverSeq` at which this snapshot was taken. Subsequent actions will have `serverSeq > fromSeq`.
	FromSeq int64 `json:"fromSeq"`
}

// Catalogue entry describing one changeset the server can produce for a
// session.
//
// Catalogue entries are intentionally lightweight — just enough to render a
// chip or list row without subscribing. Full per-changeset detail
// ({@link ChangesetState}) lives on the subscribable URI obtained by
// expanding {@link uriTemplate}.
type ChangesetSummary struct {
	// Human-readable label, e.g. `"Uncommitted Changes"`.
	Label string `json:"label"`
	// RFC 6570 URI template. Clients parse the variables directly out of the
	// template using the standard `{name}` syntax — they are not redeclared
	// here.
	//
	// Only the following template shapes are defined by this protocol; any
	// other variable name MUST be ignored by clients (there is no
	// protocol-defined way to obtain values for unknown variables):
	//
	// | Variables in template                       | Meaning                                                                              |
	// | ------------------------------------------- | ------------------------------------------------------------------------------------ |
	// | _(none)_                                    | A static, session-wide changeset. The template is itself a subscribable URI.         |
	// | `{turnId}`                                  | Per-turn slice. Expand with a `Turn.id` from the session.                            |
	// | `{originalTurnId}` and `{modifiedTurnId}`   | Diff between two turns. Both variables MUST be present.                              |
	//
	// Future protocol versions MAY add new well-known variables.
	UriTemplate string `json:"uriTemplate"`
	// Optional longer description.
	Description *string `json:"description,omitempty"`
	// Aggregate line additions across the changeset, when known.
	Additions *int64 `json:"additions,omitempty"`
	// Aggregate line deletions across the changeset, when known.
	Deletions *int64 `json:"deletions,omitempty"`
	// Number of files in the changeset, when known.
	Files *int64 `json:"files,omitempty"`
}

// Full state for a single changeset, returned when a client subscribes to
// an expanded changeset URI.
//
// The client already knows the URI it subscribed to, so this state does
// not redundantly carry it (or the catalogue's `id`, `label`, etc.).
// Aggregate counts (`additions`, `deletions`, `files`) are likewise
// omitted: clients trivially compute them from `files[].edit.diff`.
type ChangesetState struct {
	// Computation lifecycle.
	Status ChangesetStatus `json:"status"`
	// Present iff `status === ChangesetStatus.Error`.
	Error *ErrorInfo `json:"error,omitempty"`
	// Files in this changeset, keyed by {@link ChangesetFile.id}.
	Files []ChangesetFile `json:"files"`
	// Operations the client may invoke against this changeset. Omit when no
	// operations are available.
	Operations []ChangesetOperation `json:"operations,omitempty"`
}

// One file entry within a {@link ChangesetState}.
type ChangesetFile struct {
	// Stable identifier within the changeset. Typically `after.uri`
	// (or `before.uri` for deletions).
	Id string `json:"id"`
	// Reuses the existing {@link FileEdit} shape. Clients derive line
	// additions, deletions, and rename/create/delete semantics from this.
	Edit FileEdit `json:"edit"`
	// Server-defined opaque metadata, surfaced to operations and tooling
	// but not interpreted by the protocol.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// A server-declared invokable verb the client can run against a
// changeset, a file, or a range — `"stage"`, `"revert"`, `"create-pr"`,
// and so on.
//
// The term "operation" is used deliberately to avoid colliding with the
// protocol-level [Actions](/guide/actions) that mutate state.
type ChangesetOperation struct {
	// Stable identifier, unique within this changeset.
	Id string `json:"id"`
	// Human-readable button/menu label.
	Label string `json:"label"`
	// Optional longer description shown on hover or in tooltips.
	Description *string `json:"description,omitempty"`
	// Where this operation can be invoked.
	Scopes []ChangesetOperationScope `json:"scopes"`
	// Optional confirmation prompt to show before invoking. When present,
	// the client MUST display this message to the user (typically in a
	// confirmation dialog) and only invoke the operation after the user
	// accepts. The presence of this field also signals that the operation
	// is destructive — clients SHOULD style the affirmative button
	// accordingly (e.g. with a warning colour).
	Confirmation *StringOrMarkdown `json:"confirmation,omitempty"`
	// Optional generic icon hint, e.g. `"check"`, `"trash"`.
	Icon *string `json:"icon,omitempty"`
	// Current execution status. The server sets
	// {@link ChangesetOperationStatus.Running | Running} while an invocation
	// is in flight, {@link ChangesetOperationStatus.Error | Error} when the
	// most recent invocation failed, and
	// {@link ChangesetOperationStatus.Idle | Idle} otherwise.
	//
	// Clients SHOULD reflect this state in the UI — e.g. disabling the
	// control or showing a spinner while `Running`, and surfacing
	// {@link error} while `Error`.
	Status ChangesetOperationStatus `json:"status"`
	// Cause of failure. Present iff
	// `status === ChangesetOperationStatus.Error`; otherwise omitted.
	Error *ErrorInfo `json:"error,omitempty"`
}

// OTLP telemetry channels the agent host emits.
//
// Each field, when present, is either a literal channel URI or an
// [RFC 6570](https://datatracker.ietf.org/doc/html/rfc6570) URI template
// a client expands and then subscribes to. Absent fields indicate the host
// does not emit that signal.
//
// Channel URIs use the `ahp-otlp:` scheme. The scheme identifies the
// protocol (OpenTelemetry over AHP) so clients can recognise the channel
// type by URI alone; the host is free to choose any authority/path that
// makes sense for its implementation. Clients MUST treat the URI as
// opaque (apart from expanding any well-known template variables defined
// below) and subscribe with the resulting concrete URI.
//
// Payloads delivered on these channels are OTLP/JSON values — see
// [opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto)
// for the wire shapes (`ExportLogsServiceRequest`,
// `ExportTraceServiceRequest`, `ExportMetricsServiceRequest`).
type TelemetryCapabilities struct {
	// Channel URI (or RFC 6570 URI template) for OTLP log records
	// (`otlp/exportLogs` notifications).
	//
	// The following template variables are defined by this protocol; any
	// other variable name MUST be ignored by clients (there is no
	// protocol-defined way to obtain values for unknown variables):
	//
	// | Variables in template | Meaning                                                                                                 |
	// | --------------------- | ------------------------------------------------------------------------------------------------------- |
	// | _(none)_              | The host does not support subscriber-side severity filtering. The template is itself a subscribable URI. |
	// | `{level}`             | Minimum OTLP severity to deliver. Expand to one of the [OTLP `SeverityNumber`](https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber) short names (case-insensitive): `trace`, `debug`, `info`, `warn`, `error`, `fatal`. The server delivers log records whose `severityNumber` falls in the corresponding band or above. |
	//
	// Hosts SHOULD honour the expanded `{level}`; clients MUST still filter
	// defensively in case a host ignores the parameter. Hosts that do not
	// advertise `{level}` deliver all severities.
	//
	// Future protocol versions MAY add new well-known variables (e.g. scope
	// or attribute filters).
	Logs *URI `json:"logs,omitempty"`
	// Channel URI for OTLP spans (`otlp/exportTraces` notifications). No
	// template variables are defined by this protocol version.
	Traces *URI `json:"traces,omitempty"`
	// Channel URI for OTLP metric data points (`otlp/exportMetrics`
	// notifications). No template variables are defined by this protocol
	// version.
	Metrics *URI `json:"metrics,omitempty"`
}

// Full state for a single resource watch, returned when a client subscribes
// to an `ahp-resource-watch:` URI.
//
// Watches are otherwise stateless: the watcher exists to deliver
// {@link ResourceWatchChangedAction} events. The state carries only the
// descriptor of what is being watched so a re-subscribing client can
// recover the watch configuration after reconnecting.
type ResourceWatchState struct {
	// The URI being watched. For recursive watches this is the root of the
	// subtree; for non-recursive watches this is the single file or
	// directory.
	Root URI `json:"root"`
	// `true` if the watcher reports changes for descendants of `root`;
	// `false` if it only reports changes to `root` itself (and, when
	// `root` is a directory, its direct children).
	Recursive bool `json:"recursive"`
	// Optional glob patterns or paths relative to `root` to exclude from
	// change reporting.
	Excludes *json.RawMessage `json:"excludes,omitempty"`
	// Optional glob patterns or paths relative to `root` to restrict
	// change reporting to. Omit to report every change under `root`
	// subject to `excludes`.
	Includes *json.RawMessage `json:"includes,omitempty"`
}

// A single change observed by a resource watcher.
type ResourceChange struct {
	// The URI of the resource that changed.
	Uri URI `json:"uri"`
	// The kind of change observed.
	Type ResourceChangeType `json:"type"`
}

// ─── Discriminated Unions ─────────────────────────────────────────────

// ResponsePart is a single part of a response stream (text, tool call, reasoning, content reference).
type ResponsePart struct {
	Value isResponsePart
}

// isResponsePart is the marker interface implemented by every
// concrete variant of ResponsePart.
type isResponsePart interface{ isResponsePart() }

func (*MarkdownResponsePart) isResponsePart()           {}
func (*ResourceResponsePart) isResponsePart()           {}
func (*ToolCallResponsePart) isResponsePart()           {}
func (*ReasoningResponsePart) isResponsePart()          {}
func (*SystemNotificationResponsePart) isResponsePart() {}

// ResponsePartUnknown carries an unrecognized ResponsePart variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ResponsePartUnknown struct {
	Raw json.RawMessage
}

func (*ResponsePartUnknown) isResponsePart() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *ResponsePart) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "markdown":
		var value MarkdownResponsePart
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "contentRef":
		var value ResourceResponsePart
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "toolCall":
		var value ToolCallResponsePart
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "reasoning":
		var value ReasoningResponsePart
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "systemNotification":
		var value SystemNotificationResponsePart
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ResponsePartUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ResponsePart) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ResponsePartUnknown); ok {
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

// ToolCallState is the full tool call lifecycle state.
type ToolCallState struct {
	Value isToolCallState
}

// isToolCallState is the marker interface implemented by every
// concrete variant of ToolCallState.
type isToolCallState interface{ isToolCallState() }

func (*ToolCallStreamingState) isToolCallState()                 {}
func (*ToolCallPendingConfirmationState) isToolCallState()       {}
func (*ToolCallRunningState) isToolCallState()                   {}
func (*ToolCallPendingResultConfirmationState) isToolCallState() {}
func (*ToolCallCompletedState) isToolCallState()                 {}
func (*ToolCallCancelledState) isToolCallState()                 {}

// ToolCallStateUnknown carries an unrecognized ToolCallState variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ToolCallStateUnknown struct {
	Raw json.RawMessage
}

func (*ToolCallStateUnknown) isToolCallState() {}

// UnmarshalJSON decodes the variant indicated by the "status" discriminator.
func (u *ToolCallState) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "status")
	if err != nil {
		return err
	}
	switch disc {
	case "streaming":
		var value ToolCallStreamingState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "pending-confirmation":
		var value ToolCallPendingConfirmationState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "running":
		var value ToolCallRunningState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "pending-result-confirmation":
		var value ToolCallPendingResultConfirmationState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "completed":
		var value ToolCallCompletedState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "cancelled":
		var value ToolCallCancelledState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ToolCallStateUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ToolCallState) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ToolCallStateUnknown); ok {
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

// TerminalClaim identifies who currently holds a terminal.
type TerminalClaim struct {
	Value isTerminalClaim
}

// isTerminalClaim is the marker interface implemented by every
// concrete variant of TerminalClaim.
type isTerminalClaim interface{ isTerminalClaim() }

func (*TerminalClientClaim) isTerminalClaim()  {}
func (*TerminalSessionClaim) isTerminalClaim() {}

// TerminalClaimUnknown carries an unrecognized TerminalClaim variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type TerminalClaimUnknown struct {
	Raw json.RawMessage
}

func (*TerminalClaimUnknown) isTerminalClaim() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *TerminalClaim) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "client":
		var value TerminalClientClaim
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "session":
		var value TerminalSessionClaim
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &TerminalClaimUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u TerminalClaim) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*TerminalClaimUnknown); ok {
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

// TerminalContentPart is a content part within terminal output.
type TerminalContentPart struct {
	Value isTerminalContentPart
}

// isTerminalContentPart is the marker interface implemented by every
// concrete variant of TerminalContentPart.
type isTerminalContentPart interface{ isTerminalContentPart() }

func (*TerminalUnclassifiedPart) isTerminalContentPart() {}
func (*TerminalCommandPart) isTerminalContentPart()      {}

// TerminalContentPartUnknown carries an unrecognized TerminalContentPart variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type TerminalContentPartUnknown struct {
	Raw json.RawMessage
}

func (*TerminalContentPartUnknown) isTerminalContentPart() {}

// UnmarshalJSON decodes the variant indicated by the "type" discriminator.
func (u *TerminalContentPart) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "type")
	if err != nil {
		return err
	}
	switch disc {
	case "unclassified":
		var value TerminalUnclassifiedPart
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "command":
		var value TerminalCommandPart
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &TerminalContentPartUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u TerminalContentPart) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*TerminalContentPartUnknown); ok {
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

// SessionInputQuestion is one question within a session input request.
type SessionInputQuestion struct {
	Value isSessionInputQuestion
}

// isSessionInputQuestion is the marker interface implemented by every
// concrete variant of SessionInputQuestion.
type isSessionInputQuestion interface{ isSessionInputQuestion() }

func (*SessionInputTextQuestion) isSessionInputQuestion()         {}
func (*SessionInputNumberQuestion) isSessionInputQuestion()       {}
func (*SessionInputBooleanQuestion) isSessionInputQuestion()      {}
func (*SessionInputSingleSelectQuestion) isSessionInputQuestion() {}
func (*SessionInputMultiSelectQuestion) isSessionInputQuestion()  {}

// SessionInputQuestionUnknown carries an unrecognized SessionInputQuestion variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type SessionInputQuestionUnknown struct {
	Raw json.RawMessage
}

func (*SessionInputQuestionUnknown) isSessionInputQuestion() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *SessionInputQuestion) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "text":
		var value SessionInputTextQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "number":
		var value SessionInputNumberQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "integer":
		var value SessionInputNumberQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "boolean":
		var value SessionInputBooleanQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "single-select":
		var value SessionInputSingleSelectQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "multi-select":
		var value SessionInputMultiSelectQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &SessionInputQuestionUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u SessionInputQuestion) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*SessionInputQuestionUnknown); ok {
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

// SessionInputAnswerValue is the value captured for one answer.
type SessionInputAnswerValue struct {
	Value isSessionInputAnswerValue
}

// isSessionInputAnswerValue is the marker interface implemented by every
// concrete variant of SessionInputAnswerValue.
type isSessionInputAnswerValue interface{ isSessionInputAnswerValue() }

func (*SessionInputTextAnswerValue) isSessionInputAnswerValue()         {}
func (*SessionInputNumberAnswerValue) isSessionInputAnswerValue()       {}
func (*SessionInputBooleanAnswerValue) isSessionInputAnswerValue()      {}
func (*SessionInputSelectedAnswerValue) isSessionInputAnswerValue()     {}
func (*SessionInputSelectedManyAnswerValue) isSessionInputAnswerValue() {}

// SessionInputAnswerValueUnknown carries an unrecognized SessionInputAnswerValue variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type SessionInputAnswerValueUnknown struct {
	Raw json.RawMessage
}

func (*SessionInputAnswerValueUnknown) isSessionInputAnswerValue() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *SessionInputAnswerValue) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "text":
		var value SessionInputTextAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "number":
		var value SessionInputNumberAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "boolean":
		var value SessionInputBooleanAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "selected":
		var value SessionInputSelectedAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "selected-many":
		var value SessionInputSelectedManyAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &SessionInputAnswerValueUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u SessionInputAnswerValue) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*SessionInputAnswerValueUnknown); ok {
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

// SessionInputAnswer is a draft, submitted, or skipped answer for one question.
type SessionInputAnswer struct {
	Value isSessionInputAnswer
}

// isSessionInputAnswer is the marker interface implemented by every
// concrete variant of SessionInputAnswer.
type isSessionInputAnswer interface{ isSessionInputAnswer() }

func (*SessionInputAnswered) isSessionInputAnswer() {}
func (*SessionInputSkipped) isSessionInputAnswer()  {}

// SessionInputAnswerUnknown carries an unrecognized SessionInputAnswer variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type SessionInputAnswerUnknown struct {
	Raw json.RawMessage
}

func (*SessionInputAnswerUnknown) isSessionInputAnswer() {}

// UnmarshalJSON decodes the variant indicated by the "state" discriminator.
func (u *SessionInputAnswer) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "state")
	if err != nil {
		return err
	}
	switch disc {
	case "draft":
		var value SessionInputAnswered
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "submitted":
		var value SessionInputAnswered
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "skipped":
		var value SessionInputSkipped
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &SessionInputAnswerUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u SessionInputAnswer) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*SessionInputAnswerUnknown); ok {
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

// ToolResultContent is a content block in a tool result.
type ToolResultContent struct {
	Value isToolResultContent
}

// isToolResultContent is the marker interface implemented by every
// concrete variant of ToolResultContent.
type isToolResultContent interface{ isToolResultContent() }

func (*ToolResultTextContent) isToolResultContent()             {}
func (*ToolResultEmbeddedResourceContent) isToolResultContent() {}
func (*ToolResultResourceContent) isToolResultContent()         {}
func (*ToolResultFileEditContent) isToolResultContent()         {}
func (*ToolResultTerminalContent) isToolResultContent()         {}
func (*ToolResultSubagentContent) isToolResultContent()         {}

// ToolResultContentUnknown carries an unrecognized ToolResultContent variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ToolResultContentUnknown struct {
	Raw json.RawMessage
}

func (*ToolResultContentUnknown) isToolResultContent() {}

// UnmarshalJSON decodes the variant indicated by the "type" discriminator.
func (u *ToolResultContent) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "type")
	if err != nil {
		return err
	}
	switch disc {
	case "text":
		var value ToolResultTextContent
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "embeddedResource":
		var value ToolResultEmbeddedResourceContent
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "resource":
		var value ToolResultResourceContent
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "fileEdit":
		var value ToolResultFileEditContent
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "terminal":
		var value ToolResultTerminalContent
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "subagent":
		var value ToolResultSubagentContent
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ToolResultContentUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ToolResultContent) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ToolResultContentUnknown); ok {
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

// MessageAttachment is an attachment associated with a Message.
type MessageAttachment struct {
	Value isMessageAttachment
}

// isMessageAttachment is the marker interface implemented by every
// concrete variant of MessageAttachment.
type isMessageAttachment interface{ isMessageAttachment() }

func (*SimpleMessageAttachment) isMessageAttachment()           {}
func (*MessageEmbeddedResourceAttachment) isMessageAttachment() {}
func (*MessageResourceAttachment) isMessageAttachment()         {}

// MessageAttachmentUnknown carries an unrecognized MessageAttachment variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type MessageAttachmentUnknown struct {
	Raw json.RawMessage
}

func (*MessageAttachmentUnknown) isMessageAttachment() {}

// UnmarshalJSON decodes the variant indicated by the "type" discriminator.
func (u *MessageAttachment) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "type")
	if err != nil {
		return err
	}
	switch disc {
	case "simple":
		var value SimpleMessageAttachment
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "embeddedResource":
		var value MessageEmbeddedResourceAttachment
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "resource":
		var value MessageResourceAttachment
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &MessageAttachmentUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u MessageAttachment) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*MessageAttachmentUnknown); ok {
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

// Customization is a top-level customization (plugin or directory).
type Customization struct {
	Value isCustomization
}

// isCustomization is the marker interface implemented by every
// concrete variant of Customization.
type isCustomization interface{ isCustomization() }

func (*PluginCustomization) isCustomization()    {}
func (*DirectoryCustomization) isCustomization() {}

// CustomizationUnknown carries an unrecognized Customization variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type CustomizationUnknown struct {
	Raw json.RawMessage
}

func (*CustomizationUnknown) isCustomization() {}

// UnmarshalJSON decodes the variant indicated by the "type" discriminator.
func (u *Customization) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "type")
	if err != nil {
		return err
	}
	switch disc {
	case "plugin":
		var value PluginCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "directory":
		var value DirectoryCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &CustomizationUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u Customization) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*CustomizationUnknown); ok {
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

// ChildCustomization is a child customization living inside a plugin or directory.
type ChildCustomization struct {
	Value isChildCustomization
}

// isChildCustomization is the marker interface implemented by every
// concrete variant of ChildCustomization.
type isChildCustomization interface{ isChildCustomization() }

func (*AgentCustomization) isChildCustomization()     {}
func (*SkillCustomization) isChildCustomization()     {}
func (*PromptCustomization) isChildCustomization()    {}
func (*RuleCustomization) isChildCustomization()      {}
func (*HookCustomization) isChildCustomization()      {}
func (*McpServerCustomization) isChildCustomization() {}

// ChildCustomizationUnknown carries an unrecognized ChildCustomization variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ChildCustomizationUnknown struct {
	Raw json.RawMessage
}

func (*ChildCustomizationUnknown) isChildCustomization() {}

// UnmarshalJSON decodes the variant indicated by the "type" discriminator.
func (u *ChildCustomization) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "type")
	if err != nil {
		return err
	}
	switch disc {
	case "agent":
		var value AgentCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "skill":
		var value SkillCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "prompt":
		var value PromptCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "rule":
		var value RuleCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "hook":
		var value HookCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "mcpServer":
		var value McpServerCustomization
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ChildCustomizationUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ChildCustomization) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ChildCustomizationUnknown); ok {
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

// CustomizationLoadState is the host-reported load state for a container customization.
type CustomizationLoadState struct {
	Value isCustomizationLoadState
}

// isCustomizationLoadState is the marker interface implemented by every
// concrete variant of CustomizationLoadState.
type isCustomizationLoadState interface{ isCustomizationLoadState() }

func (*CustomizationLoadingState) isCustomizationLoadState()  {}
func (*CustomizationLoadedState) isCustomizationLoadState()   {}
func (*CustomizationDegradedState) isCustomizationLoadState() {}
func (*CustomizationErrorState) isCustomizationLoadState()    {}

// CustomizationLoadStateUnknown carries an unrecognized CustomizationLoadState variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type CustomizationLoadStateUnknown struct {
	Raw json.RawMessage
}

func (*CustomizationLoadStateUnknown) isCustomizationLoadState() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *CustomizationLoadState) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "loading":
		var value CustomizationLoadingState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "loaded":
		var value CustomizationLoadedState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "degraded":
		var value CustomizationDegradedState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "error":
		var value CustomizationErrorState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &CustomizationLoadStateUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u CustomizationLoadState) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*CustomizationLoadStateUnknown); ok {
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

// SnapshotState is the state payload of a snapshot — root, session,
// terminal, or changeset state. The active variant is chosen by which
// pointer field is non-nil; UnmarshalJSON probes for required fields in
// the canonical order (session → terminal → changeset → root).
type SnapshotState struct {
	Root      *RootState      `json:"-"`
	Session   *SessionState   `json:"-"`
	Terminal  *TerminalState  `json:"-"`
	Changeset *ChangesetState `json:"-"`
}

// MarshalJSON encodes whichever variant is currently populated.
func (s SnapshotState) MarshalJSON() ([]byte, error) {
	switch {
	case s.Session != nil:
		return json.Marshal(s.Session)
	case s.Terminal != nil:
		return json.Marshal(s.Terminal)
	case s.Changeset != nil:
		return json.Marshal(s.Changeset)
	case s.Root != nil:
		return json.Marshal(s.Root)
	default:
		return []byte("null"), nil
	}
}

// UnmarshalJSON tries each concrete variant in turn and keeps the first
// one that decodes without losing any of its required fields.
func (s *SnapshotState) UnmarshalJSON(data []byte) error {
	*s = SnapshotState{}
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(data, &probe); err != nil {
		return err
	}
	switch {
	case containsAll(probe, "summary", "lifecycle"):
		var v SessionState
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		s.Session = &v
	case containsAll(probe, "content"):
		var v TerminalState
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		s.Terminal = &v
	case containsAll(probe, "status", "files"):
		var v ChangesetState
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		s.Changeset = &v
	default:
		var v RootState
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		s.Root = &v
	}
	return nil
}

func containsAll(m map[string]json.RawMessage, keys ...string) bool {
	for _, k := range keys {
		if _, ok := m[k]; !ok {
			return false
		}
	}
	return true
}
