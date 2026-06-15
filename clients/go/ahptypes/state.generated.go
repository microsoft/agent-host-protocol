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

type ChatOriginKind string

const (
	ChatOriginKindUser ChatOriginKind = "user"
	ChatOriginKindFork ChatOriginKind = "fork"
	ChatOriginKindTool ChatOriginKind = "tool"
)

// How a user can interact with a chat.
//
// - `Full` — user can send messages and watch (default when absent)
// - `ReadOnly` — user can watch but not send messages (e.g. agent team workers)
// - `Hidden` — internal worker not shown in UI at all
//
// Supports the agent-team pattern where a lead chat is fully interactive and
// worker chats are read-only (visible for observability) or hidden (internal
// implementation detail). The harness sets this based on the chat's role;
// the UI uses it to show appropriate controls.
type ChatInteractivity string

const (
	// User can send messages and watch (default when absent)
	ChatInteractivityFull ChatInteractivity = "full"
	// User can watch but not send messages
	ChatInteractivityReadOnly ChatInteractivity = "read-only"
	// Internal worker not shown in UI at all
	ChatInteractivityHidden ChatInteractivity = "hidden"
)

// Discriminant for pending message kinds.
type PendingMessageKind string

const (
	// Injected into the current turn at a convenient point
	PendingMessageKindSteering PendingMessageKind = "steering"
	// Sent automatically as a new turn after the current turn finishes
	PendingMessageKindQueued PendingMessageKind = "queued"
)

// Answer lifecycle state.
type ChatInputAnswerState string

const (
	ChatInputAnswerStateDraft     ChatInputAnswerState = "draft"
	ChatInputAnswerStateSubmitted ChatInputAnswerState = "submitted"
	ChatInputAnswerStateSkipped   ChatInputAnswerState = "skipped"
)

// Answer value kind.
type ChatInputAnswerValueKind string

const (
	ChatInputAnswerValueKindText         ChatInputAnswerValueKind = "text"
	ChatInputAnswerValueKindNumber       ChatInputAnswerValueKind = "number"
	ChatInputAnswerValueKindBoolean      ChatInputAnswerValueKind = "boolean"
	ChatInputAnswerValueKindSelected     ChatInputAnswerValueKind = "selected"
	ChatInputAnswerValueKindSelectedMany ChatInputAnswerValueKind = "selected-many"
)

// Question/input control kind.
type ChatInputQuestionKind string

const (
	ChatInputQuestionKindText         ChatInputQuestionKind = "text"
	ChatInputQuestionKindNumber       ChatInputQuestionKind = "number"
	ChatInputQuestionKindInteger      ChatInputQuestionKind = "integer"
	ChatInputQuestionKindBoolean      ChatInputQuestionKind = "boolean"
	ChatInputQuestionKindSingleSelect ChatInputQuestionKind = "single-select"
	ChatInputQuestionKindMultiSelect  ChatInputQuestionKind = "multi-select"
)

// How a client completed an input request.
type ChatInputResponseKind string

const (
	ChatInputResponseKindAccept  ChatInputResponseKind = "accept"
	ChatInputResponseKindDecline ChatInputResponseKind = "decline"
	ChatInputResponseKindCancel  ChatInputResponseKind = "cancel"
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
	// An attachment that references annotations on an annotations channel.
	MessageAttachmentKindAnnotations MessageAttachmentKind = "annotations"
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

type ToolCallContributorKind string

const (
	ToolCallContributorKindClient ToolCallContributorKind = "client"
	ToolCallContributorKindMCP    ToolCallContributorKind = "mcp"
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
// {@link AgentInfo.customizations} are either container customizations
// ({@link CustomizationType.Plugin | `Plugin`} or
// {@link CustomizationType.Directory | `Directory`}) or
// {@link CustomizationType.McpServer | `McpServer`} entries surfaced
// directly by the host. The remaining types appear only as children of
// a container.
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

// Discriminant for the {@link McpServerState} union.
type McpServerStatus string

const (
	// Server has been registered but is not yet running.
	McpServerStatusStarting McpServerStatus = "starting"
	// Server is running and serving requests.
	McpServerStatusReady McpServerStatus = "ready"
	// Server is reachable but requires additional authentication before it
	// can start, or before it can serve a particular request. Carries the
	// RFC 9728 Protected Resource Metadata the client needs to obtain a
	// token; the client then pushes the token via the existing
	// `authenticate` command.
	McpServerStatusAuthRequired McpServerStatus = "authRequired"
	// Server failed to start, crashed, or otherwise transitioned to a fatal error.
	McpServerStatusError McpServerStatus = "error"
	// Server has been shut down.
	McpServerStatusStopped McpServerStatus = "stopped"
)

// Why an MCP server is currently in the {@link McpServerStatus.AuthRequired}
// state. Mirrors the three failure modes defined by the
// [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.md).
type McpAuthRequiredReason string

const (
	// No token has been provided yet (HTTP 401, no prior token).
	McpAuthRequiredReasonRequired McpAuthRequiredReason = "required"
	// A previously valid token expired or was revoked (HTTP 401).
	McpAuthRequiredReasonExpired McpAuthRequiredReason = "expired"
	// Step-up auth: a token is present but its scopes are insufficient for
	// the requested operation (HTTP 403 with
	// `WWW-Authenticate: Bearer error="insufficient_scope"`).
	//
	// Unlike {@link Required} and {@link Expired} — which typically surface
	// before any tool work is in flight — `InsufficientScope` is almost
	// always triggered by an MCP request issued mid-turn (a `tools/call`,
	// `resources/read`, etc.). The host SHOULD pair the
	// {@link McpServerAuthRequiredState} transition with
	// {@link SessionStatus.InputNeeded} on
	// {@link SessionSummary.status | the session} so the activity becomes
	// visible at the session-summary level, and clients SHOULD watch for
	// this kind on any
	// {@link McpServerCustomization | MCP server} backing a running tool
	// call so they can present an explicit "grant more access" affordance
	// tied to the blocked tool call.
	McpAuthRequiredReasonInsufficientScope McpAuthRequiredReason = "insufficientScope"
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
	// Additional implementation-defined metadata about the agent host itself.
	//
	// Clients MAY look for well-known keys here to provide enhanced UI.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
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
	// Either container customizations —
	// {@link PluginCustomization | `PluginCustomization`} entries the agent
	// bundles, plus {@link DirectoryCustomization | `DirectoryCustomization`}
	// entries it watches in any workspace it's used with — or top-level
	// {@link McpServerCustomization | `McpServerCustomization`} entries
	// the agent host declares directly. When a session is created with
	// this agent, these entries are augmented (e.g. directory URIs are
	// resolved against the workspace, children are parsed) and propagated
	// into the session's `customizations` list.
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
	// Catalog of chats in this session.
	Chats []ChatSummary `json:"chats"`
	// The chat that receives input when the user addresses the session without
	// selecting a specific chat. This is a UI routing hint, not a hierarchy
	// marker — chats remain equal peers at the protocol level. Hosts MAY change
	// this over the session's lifetime.
	DefaultChat *URI `json:"defaultChat,omitempty"`
	// Session configuration schema and current values
	Config *SessionConfigState `json:"config,omitempty"`
	// Top-level customizations active in this session.
	//
	// Always one of the {@link Customization} variants:
	//
	// - Container customizations ({@link PluginCustomization},
	//   {@link DirectoryCustomization}) whose children — agents, skills,
	//   prompts, rules, hooks, MCP servers — live in each container's
	//   {@link ContainerCustomizationBase.children | `children`} array.
	// - Top-level {@link McpServerCustomization} entries the host
	//   surfaces directly (for example a globally-configured MCP server
	//   that isn't bundled in a plugin or directory). MCP servers may
	//   also appear as children of a container.
	//
	// Client-published plugins arrive via
	// {@link SessionActiveClient.customizations | `activeClient.customizations`}
	// and the host propagates them into this list (typically with the
	// container's `clientId` set and `children` populated). Clients
	// publish in container shape only; bare MCP servers at the top level
	// are server-originated.
	Customizations []Customization `json:"customizations,omitempty"`
	// Catalogue of changesets the server can produce for this session. Each
	// entry advertises a subscribable view of file changes (uncommitted,
	// session-wide, per-turn, etc.) and the URI template the client expands
	// before subscribing. See {@link Changeset} for the full shape and
	// {@link /guide/changesets | Changesets} for an overview of the model.
	Changesets []Changeset `json:"changesets,omitempty"`
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

// Lightweight catalog entry summarizing one session. Surfaced via
// {@link RootChannelCommands.listSessions | `root/listSessions`} and
// `root/sessionAdded`/`root/sessionSummaryChanged` notifications.
//
// **Aggregation across chats.** Once a session contains more than one chat,
// several `SessionSummary` fields are derived from the underlying
// {@link SessionState.chats | chat catalog}. Producers SHOULD follow these
// rules so clients that only consume the session summary (e.g. a session
// list) still see meaningful state:
//
//   - `status`: take the activity bits (`Idle` / `InProgress` / `InputNeeded` /
//     `Error` — bits 0–4) from the
//     {@link SessionState.defaultChat | default chat} when present, else from
//     the most recently modified chat. **Promote** `InputNeeded` whenever any
//     chat in the session needs input, and **promote** `Error` whenever any
//     chat is in an error state — both override the default-chat bits. The
//     orthogonal flag bits (`IsRead`, `IsArchived`) remain session-scoped.
//   - `activity`: mirror the activity string of the default chat, or of the
//     chat currently driving the promoted status bits when a non-default chat
//     wins (e.g. the chat that raised `InputNeeded`).
//   - `modifiedAt`: the max of all chats' `modifiedAt`.
//   - `model` / `agent`: the session-level selection. Per-chat overrides are
//     surfaced on individual {@link ChatSummary} entries, not aggregated up.
//   - `workingDirectory`: the session-level **default**. Individual chats MAY
//     override via {@link ChatSummary.workingDirectory}; aggregating these up
//     is meaningless and SHOULD NOT be attempted.
//   - `changes`: optional roll-up across all chats. Producers MAY sum the
//     per-chat changeset stats or report the most expensive chat's stats —
//     whichever is cheaper for the host to compute.
//
// Sessions with a single chat trivially satisfy all of the above (the chat's
// values pass through unchanged). The rules only matter once a session
// carries multiple chats.
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
	// The default working directory URI for this session. Individual chats
	// MAY override via {@link ChatSummary.workingDirectory | their own
	// `workingDirectory`}; this field acts as the fallback for any chat that
	// does not.
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
	// Aggregate summary of file changes associated with this session. Servers
	// may populate this to give clients a quick at-a-glance view of the
	// session's footprint (e.g., for list rendering) without requiring the
	// client to subscribe to a changeset.
	Changes *ChangesSummary `json:"changes,omitempty"`
	// Lightweight summary of this session's inline annotations channel
	// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
	// annotation / entry counts without subscribing. Absent when the session
	// does not expose an annotations channel.
	Annotations *AnnotationsSummary `json:"annotations,omitempty"`
}

// Aggregate counts describing the file changes associated with a session.
//
// All fields are optional so servers can populate only the metrics they
// cheaply have available.
type ChangesSummary struct {
	// Total number of inserted lines across all changed files.
	Additions *int64 `json:"additions,omitempty"`
	// Total number of deleted lines across all changed files.
	Deletions *int64 `json:"deletions,omitempty"`
	// Number of files that have changes.
	Files *int64 `json:"files,omitempty"`
}

// Full state for a single chat, loaded when a client subscribes to the chat's
// URI.
//
// The lightweight catalog representation of a chat is {@link ChatSummary},
// carried in {@link SessionState.chats | `SessionState.chats`}. `ChatState`
// **denormalizes** every {@link ChatSummary} field directly onto itself so
// subscribers receive one flat object instead of having to merge a nested
// `summary` sub-object. Producers MUST keep the two representations
// consistent: any change to the inlined fields below SHOULD also be
// announced on the parent session via the matching
// {@link SessionChatUpdatedAction | `session/chatUpdated`} action.
type ChatState struct {
	// Chat URI
	Resource URI `json:"resource"`
	// Chat title
	Title string `json:"title"`
	// Current chat status (reuses SessionStatus shape)
	Status SessionStatus `json:"status"`
	// Human-readable description of what the chat is currently doing
	Activity *string `json:"activity,omitempty"`
	// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
	ModifiedAt string `json:"modifiedAt"`
	// Optional per-chat model override (defaults to the session's model)
	Model *ModelSelection `json:"model,omitempty"`
	// Optional per-chat agent override (defaults to the session's agent)
	Agent *AgentSelection `json:"agent,omitempty"`
	// How this chat came into existence
	Origin *ChatOrigin `json:"origin,omitempty"`
	// How the user can interact with this chat. See {@link ChatInteractivity}.
	//
	// Supports agent-team patterns where worker chats are read-only or hidden.
	// Absence defaults to {@link ChatInteractivity.Full} for backward
	// compatibility.
	Interactivity *ChatInteractivity `json:"interactivity,omitempty"`
	// Optional per-chat working directory.
	//
	// If absent, the chat inherits
	// {@link SessionSummary.workingDirectory | the session's working directory}.
	// Hosts MAY override this for individual chats — for example, to give a
	// subordinate chat its own git worktree so multiple chats in a session can
	// make independent edits that the orchestrator later merges back.
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
	// Completed turns
	Turns []Turn `json:"turns"`
	// Currently in-progress turn
	ActiveTurn *ActiveTurn `json:"activeTurn,omitempty"`
	// Message to inject into the current turn at a convenient point
	SteeringMessage *PendingMessage `json:"steeringMessage,omitempty"`
	// Messages to send automatically as new turns after the current turn finishes
	QueuedMessages []PendingMessage `json:"queuedMessages,omitempty"`
	// Requests for user input that are currently blocking or informing chat progress
	InputRequests []ChatInputRequest `json:"inputRequests,omitempty"`
	// Additional provider-specific metadata for this chat.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Lightweight catalog entry for a chat, carried in
// {@link SessionState.chats | `SessionState.chats`}. The full conversation
// lives in {@link ChatState}, which inlines (denormalizes) every field below.
type ChatSummary struct {
	// Chat URI
	Resource URI `json:"resource"`
	// Chat title
	Title string `json:"title"`
	// Current chat status (reuses SessionStatus shape)
	Status SessionStatus `json:"status"`
	// Human-readable description of what the chat is currently doing
	Activity *string `json:"activity,omitempty"`
	// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
	ModifiedAt string `json:"modifiedAt"`
	// Optional per-chat model override (defaults to the session's model)
	Model *ModelSelection `json:"model,omitempty"`
	// Optional per-chat agent override (defaults to the session's agent)
	Agent *AgentSelection `json:"agent,omitempty"`
	// How this chat came into existence
	Origin *ChatOrigin `json:"origin,omitempty"`
	// How the user can interact with this chat. See {@link ChatInteractivity}.
	//
	// Supports agent-team patterns where worker chats are read-only or hidden.
	// Absence defaults to {@link ChatInteractivity.Full} for backward
	// compatibility.
	Interactivity *ChatInteractivity `json:"interactivity,omitempty"`
	// Optional per-chat working directory.
	//
	// If absent, the chat inherits
	// {@link SessionSummary.workingDirectory | the session's working directory}.
	// See {@link ChatState.workingDirectory} for usage notes.
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
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
type ChatInputOption struct {
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
type ChatInputTextAnswerValue struct {
	Kind  ChatInputAnswerValueKind `json:"kind"`
	Value string                   `json:"value"`
}

type ChatInputNumberAnswerValue struct {
	Kind  ChatInputAnswerValueKind `json:"kind"`
	Value float64                  `json:"value"`
}

type ChatInputBooleanAnswerValue struct {
	Kind  ChatInputAnswerValueKind `json:"kind"`
	Value bool                     `json:"value"`
}

type ChatInputSelectedAnswerValue struct {
	Kind  ChatInputAnswerValueKind `json:"kind"`
	Value string                   `json:"value"`
	// Free-form text entered instead of selecting an option
	FreeformValues []string `json:"freeformValues,omitempty"`
}

type ChatInputSelectedManyAnswerValue struct {
	Kind  ChatInputAnswerValueKind `json:"kind"`
	Value []string                 `json:"value"`
	// Free-form text entered in addition to selected options
	FreeformValues []string `json:"freeformValues,omitempty"`
}

type ChatInputAnswered struct {
	// Answer state
	State ChatInputAnswerState `json:"state"`
	// Answer value
	Value ChatInputAnswerValue `json:"value"`
}

type ChatInputSkipped struct {
	// Answer state
	State ChatInputAnswerState `json:"state"`
	// Free-form reason or value captured while skipping, if any
	FreeformValues []string `json:"freeformValues,omitempty"`
}

// Text question within a chat input request.
type ChatInputTextQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                 `json:"required,omitempty"`
	Kind     ChatInputQuestionKind `json:"kind"`
	// Format hint for text questions, such as `email`, `uri`, `date`, or `date-time`
	Format *string `json:"format,omitempty"`
	// Minimum string length
	Min *int64 `json:"min,omitempty"`
	// Maximum string length
	Max *int64 `json:"max,omitempty"`
	// Default text
	DefaultValue *string `json:"defaultValue,omitempty"`
}

// Numeric question within a chat input request.
type ChatInputNumberQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                 `json:"required,omitempty"`
	Kind     ChatInputQuestionKind `json:"kind"`
	// Minimum value
	Min *float64 `json:"min,omitempty"`
	// Maximum value
	Max *float64 `json:"max,omitempty"`
	// Default numeric value
	DefaultValue *float64 `json:"defaultValue,omitempty"`
}

// Boolean question within a chat input request.
type ChatInputBooleanQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                 `json:"required,omitempty"`
	Kind     ChatInputQuestionKind `json:"kind"`
	// Default boolean value
	DefaultValue *bool `json:"defaultValue,omitempty"`
}

// Single-select question within a chat input request.
type ChatInputSingleSelectQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                 `json:"required,omitempty"`
	Kind     ChatInputQuestionKind `json:"kind"`
	// Options the user may select from
	Options []ChatInputOption `json:"options"`
	// Whether the user may enter text instead of selecting an option
	AllowFreeformInput *bool `json:"allowFreeformInput,omitempty"`
}

// Multi-select question within a chat input request.
type ChatInputMultiSelectQuestion struct {
	// Stable question identifier used as the key in `answers`
	Id string `json:"id"`
	// Short display title
	Title *string `json:"title,omitempty"`
	// Prompt shown to the user
	Message string `json:"message"`
	// Whether the user must answer this question to accept the request
	Required *bool                 `json:"required,omitempty"`
	Kind     ChatInputQuestionKind `json:"kind"`
	// Options the user may select from
	Options []ChatInputOption `json:"options"`
	// Whether the user may enter text in addition to selecting options
	AllowFreeformInput *bool `json:"allowFreeformInput,omitempty"`
	// Minimum selected item count
	Min *int64 `json:"min,omitempty"`
	// Maximum selected item count
	Max *int64 `json:"max,omitempty"`
}

// A live request for user input.
//
// The server creates or replaces requests with `chat/inputRequested`.
// Clients sync drafts with `chat/inputAnswerChanged` and complete requests
// with `chat/inputCompleted`.
type ChatInputRequest struct {
	// Stable request identifier
	Id string `json:"id"`
	// Display message for the request as a whole
	Message *string `json:"message,omitempty"`
	// URL the user should review or open, for URL-style elicitations
	Url *URI `json:"url,omitempty"`
	// Ordered questions to ask the user
	Questions []ChatInputQuestion `json:"questions,omitempty"`
	// Current draft or submitted answers, keyed by question ID
	Answers map[string]ChatInputAnswer `json:"answers,omitempty"`
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

// An attachment that references annotations on a session's annotations
// channel (see {@link AnnotationsState}).
//
// When {@link annotationIds} is omitted the attachment references every
// annotation on the channel; when present it references only the listed
// {@link Annotation.id | annotation ids}.
type MessageAnnotationsAttachment struct {
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
	// The annotations channel URI (typically `ahp-session:/<uuid>/annotations`).
	// Matches {@link AnnotationsSummary.resource}.
	Resource URI `json:"resource"`
	// Specific {@link Annotation.id | annotation ids} to reference. When
	// omitted, the attachment references all annotations on the channel.
	AnnotationIds []string `json:"annotationIds,omitempty"`
}

type MarkdownResponsePart struct {
	// Discriminant
	Kind ResponsePartKind `json:"kind"`
	// Part identifier, used by `chat/delta` to target this part for content appends
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
	// Part identifier, used by `chat/reasoning` to target this part for content appends
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
	// Reference to the contributor of the tool being called.
	Contributor *ToolCallContributor `json:"contributor,omitempty"`
	// Additional provider-specific metadata for this tool call.
	//
	// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
	// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
	// with the {@link contributor} to serve MCP Apps.
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
	// Reference to the contributor of the tool being called.
	Contributor *ToolCallContributor `json:"contributor,omitempty"`
	// Additional provider-specific metadata for this tool call.
	//
	// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
	// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
	// with the {@link contributor} to serve MCP Apps.
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
	// Reference to the contributor of the tool being called.
	Contributor *ToolCallContributor `json:"contributor,omitempty"`
	// Additional provider-specific metadata for this tool call.
	//
	// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
	// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
	// with the {@link contributor} to serve MCP Apps.
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
	// Reference to the contributor of the tool being called.
	Contributor *ToolCallContributor `json:"contributor,omitempty"`
	// Additional provider-specific metadata for this tool call.
	//
	// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
	// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
	// with the {@link contributor} to serve MCP Apps.
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
	// Reference to the contributor of the tool being called.
	Contributor *ToolCallContributor `json:"contributor,omitempty"`
	// Additional provider-specific metadata for this tool call.
	//
	// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
	// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
	// with the {@link contributor} to serve MCP Apps.
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
	// Reference to the contributor of the tool being called.
	Contributor *ToolCallContributor `json:"contributor,omitempty"`
	// Additional provider-specific metadata for this tool call.
	//
	// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
	// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
	// with the {@link contributor} to serve MCP Apps.
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
	// Additional provider-specific metadata for this custom agent.
	//
	// Mirrors the MCP `_meta` convention.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
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

// An MCP server contributed by a plugin or directory.
//
// When the server is declared inline in the containing plugin manifest,
// `uri` points at the manifest file and
// {@link CustomizationBase.range | `range`} narrows it to the
// declaration's span.
//
// The MCP server customization also reflects its current status.
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
	// Whether this MCP server is currently enabled.
	Enabled bool `json:"enabled"`
	// Current lifecycle state of the MCP server.
	State McpServerState `json:"state"`
	// An `mcp://`-protocol channel the client uses to side-channel traffic
	// into the upstream MCP server itself. The channel is NOT a fresh raw MCP
	// connection: it piggybacks on the AHP transport
	// and skips the MCP `initialize` sequence.
	//
	// The agent host MAY only serve a subset of MCP on this
	// channel; the served subset is described by domain-specific
	// capabilities such as those in
	// {@link McpServerCustomizationApps.capabilities}.
	//
	// The channel URI SHOULD be stable across the server's lifetime, but
	// the agent host MAY change it (for example across a restart) and
	// MAY only expose it while the server is in
	// {@link McpServerStatus.Ready | `Ready`}. Absence means no
	// side-channel is currently available.
	Channel *URI `json:"channel,omitempty"`
	// MCP App support. This property SHOULD be advertised for MCP servers
	// which support apps.
	McpApp *McpServerCustomizationApps `json:"mcpApp,omitempty"`
}

// Information from the agent host needed to render MCP Apps served
// by this MCP server.
type McpServerCustomizationApps struct {
	// The subset of MCP App
	// [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
	// the AHP host can satisfy for Views backed by this server. The
	// client feeds these straight through into the `hostCapabilities` of
	// the `ui/initialize` response delivered to the View.
	Capabilities AhpMcpUiHostCapabilities `json:"capabilities"`
}

// The subset of MCP App
// [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
// an AHP host can derive from the upstream MCP server (and from AHP's own
// forwarding plumbing). Advertised on
// {@link McpServerCustomizationApps.capabilities} so clients can pass it
// through into the `hostCapabilities` of the `ui/initialize` response
// delivered to an MCP App View.
//
// Field names mirror the MCP Apps spec exactly, so the AHP-side producer
// can pass them straight through into the `hostCapabilities` of the
// `ui/initialize` response delivered to the View.
//
// Capabilities outside this set (`openLinks`, `downloadFile`, `sandbox`,
// `experimental`) are decided locally by whichever AHP client renders the
// View and are NOT part of this AHP-level advertisement — only the
// server-derived subset is.
//
// An agent host MUST only advertise a capability when it actually accepts the
// corresponding methods/notifications on the `mcp://` channel:
//
//   - {@link serverTools}: host proxies `tools/list` and `tools/call` to
//     the MCP server. When `listChanged` is `true`, the host also forwards
//     `notifications/tools/list_changed`.
//   - {@link serverResources}: host proxies `resources/read`,
//     `resources/list`, and `resources/templates/list` to the MCP server.
//     When `listChanged` is `true`, the host also forwards
//     `notifications/resources/list_changed`.
//   - {@link logging}: host accepts `notifications/message` log entries
//     from the App and forwards them via `mcpNotification` (and forwards
//     `logging/setLevel` calls to the server).
//   - {@link sampling}: host serves `sampling/createMessage` via
//     `mcpMethodCall`. When `sampling.tools` is present, the host also
//     accepts SEP-1577 `tools` / `toolChoice` / `tool_use` content blocks
//     inside `CreateMessageRequest`.
type AhpMcpUiHostCapabilities struct {
	// Producer proxies the MCP `tools/*` methods to the upstream server.
	ServerTools *json.RawMessage `json:"serverTools,omitempty"`
	// Producer proxies the MCP `resources/*` methods to the upstream server.
	ServerResources *json.RawMessage `json:"serverResources,omitempty"`
	// Producer accepts `notifications/message` log entries from the App via `mcpNotification`.
	Logging map[string]json.RawMessage `json:"logging,omitempty"`
	// Producer serves `sampling/createMessage` via `mcpMethodCall`.
	Sampling *json.RawMessage `json:"sampling,omitempty"`
}

// Server is registered with the host but has not yet started.
type McpServerStartingState struct {
	Kind McpServerStatus `json:"kind"`
}

// Server is running and serving requests.
type McpServerReadyState struct {
	Kind McpServerStatus `json:"kind"`
}

// Server is reachable but cannot serve requests until the client
// authenticates. Mirrors the discovery flow defined by
// [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)
// (Protected Resource Metadata) and the OAuth 2.1 / RFC 6750 challenge
// semantics required by the MCP authorization spec.
//
// Clients react to this state by calling the existing `authenticate`
// command with the {@link ProtectedResourceMetadata.resource | resource}
// carried here. There is **no** `notify/authRequired` notification for
// MCP servers — the action stream is the single source of truth.
//
// When the transition is triggered by a request issued during a turn
// — most commonly
// {@link McpAuthRequiredReason.InsufficientScope | `InsufficientScope`}
// surfacing mid-tool-call — the host SHOULD also raise
// {@link SessionStatus.InputNeeded} on the session so the block is
// visible at the summary level. Clients SHOULD watch this status on
// any MCP server backing a running tool call and surface an explicit
// affordance (e.g. a "grant additional access" prompt) tied to that
// tool call, rather than relying on the user to notice the
// customization’s status badge.
type McpServerAuthRequiredState struct {
	Kind McpServerStatus `json:"kind"`
	// Why authentication is required.
	Reason McpAuthRequiredReason `json:"reason"`
	// RFC 9728 Protected Resource Metadata. The `resource` field is the
	// canonical MCP server URI per RFC 8707, used as the OAuth `resource`
	// indicator. `authorization_servers` is REQUIRED by the MCP
	// authorization spec.
	Resource ProtectedResourceMetadata `json:"resource"`
	// Scopes required for the current challenge, parsed from the
	// `WWW-Authenticate: Bearer scope="…"` header (or `scopes_supported`
	// fallback). Authoritative for the next authorization request — clients
	// MUST NOT assume any subset/superset relationship to
	// `resource.scopes_supported`.
	RequiredScopes []string `json:"requiredScopes,omitempty"`
	// Human-readable hint, typically from the OAuth `error_description`.
	Description *string `json:"description,omitempty"`
}

// Server failed to start, crashed, or otherwise transitioned to a
// non-recoverable error. Use {@link McpServerStatus.AuthRequired}
// for authentication failures.
type McpServerErrorState struct {
	Kind McpServerStatus `json:"kind"`
	// Error details.
	Error ErrorInfo `json:"error"`
}

// Server has been shut down. The host MAY remove the server from the
// session entirely shortly after this state.
type McpServerStoppedState struct {
	Kind McpServerStatus `json:"kind"`
}

type ToolCallClientContributor struct {
	Kind ToolCallContributorKind `json:"kind"`
	// If this tool is provided by a client, the `clientId` of the owning client.
	// Absent for server-side tools.
	//
	// When set, the identified client is responsible for executing the tool and
	// dispatching `chat/toolCallComplete` with the result.
	ClientId string `json:"clientId"`
}

type ToolCallMcpContributor struct {
	Kind ToolCallContributorKind `json:"kind"`
	// Customization ID of the corresponding MCP server in {@link SessionState.customizations}.
	CustomizationId string `json:"customizationId"`
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
	// Additional provider-specific metadata for this error.
	// Clients MAY look for well-known optional keys here to provide enhanced UI
	// (e.g. a structured chat fetch error for richer, localized messaging).
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// A point-in-time snapshot of a subscribed resource's state, returned by
// `initialize`, `reconnect`, and `subscribe`.
type Snapshot struct {
	// The subscribed channel URI (e.g. `ahp-root://`, `ahp-session:/<uuid>`, or `ahp-chat:/<uuid>`)
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
type Changeset struct {
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
	// Advisory hint describing what kind of changeset this is, so clients can
	// group, sort, or render an appropriate icon without parsing
	// {@link uriTemplate}. Recognized values include:
	//
	// - `'session'`: a static, session-wide changeset covering all changes the
	//   agent has produced in this session.
	// - `'branch'`: changes relative to a base branch (e.g. a feature branch
	//   diffed against `main`).
	// - `'uncommitted'`: the workspace's current uncommitted changes.
	// - `'turn'`: changes produced by a single turn. Typically paired with a
	//   `{turnId}` variable in {@link uriTemplate}.
	// - `'compare-turns'`: a diff between two turns. Typically paired with
	//   `{originalTurnId}` and `{modifiedTurnId}` variables in
	//   {@link uriTemplate}.
	//
	// Implementations MAY provide additional values; clients SHOULD fall back
	// to a reasonable default when an unknown value is encountered.
	ChangeKind string `json:"changeKind"`
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

// Lightweight per-session summary of the annotations channel, surfaced on
// {@link SessionSummary.annotations} so badge UI can render annotation /
// entry counts without subscribing to the channel itself.
type AnnotationsSummary struct {
	// The subscribable annotations channel URI for the owning session
	// (typically `ahp-session:/<uuid>/annotations`). Surfaced explicitly even
	// though it is derivable from the session URI so badge UI does not need
	// to know the derivation rule.
	Resource URI `json:"resource"`
	// Total number of {@link Annotation} entries in the channel.
	AnnotationCount int64 `json:"annotationCount"`
	// Total number of {@link AnnotationEntry} entries across every annotation.
	EntryCount int64 `json:"entryCount"`
}

// Full state for a session's annotations channel, returned when a client
// subscribes to an `ahp-session:/<uuid>/annotations` URI.
type AnnotationsState struct {
	// Annotations in this channel, keyed by {@link Annotation.id}.
	Annotations []Annotation `json:"annotations"`
}

// A conversation anchored to a specific file produced by a specific turn,
// optionally narrowed to a range within that file.
//
// {@link turnId} anchors the annotation to the file versions that turn
// produced, so a later turn that rewrites the same file does not silently
// invalidate the annotation's anchor — clients can resolve {@link resource}
// and {@link range} against the turn's changeset. When {@link range} is
// omitted the annotation is anchored to the entire file.
//
// Every annotation MUST contain at least one {@link AnnotationEntry}. An
// {@link AnnotationsSetAction} that creates an annotation therefore carries
// its mandatory first entry, and removing the last remaining entry collapses
// the annotation via {@link AnnotationsRemovedAction} rather than leaving an
// empty annotation behind.
type Annotation struct {
	// Stable identifier within the annotations channel. Assigned by the client
	// that dispatches the creating {@link AnnotationsSetAction}.
	Id string `json:"id"`
	// Turn that produced the file versions this annotation is anchored to.
	// Matches a {@link Turn.id} on the owning session.
	TurnId string `json:"turnId"`
	// The file the annotation is anchored to.
	Resource URI `json:"resource"`
	// Range within {@link resource} the annotation is anchored to. When
	// omitted the annotation is anchored to the entire file.
	Range *TextRange `json:"range,omitempty"`
	// Whether the annotation has been resolved. Newly created annotations are
	// always unresolved (`false`); a client marks an annotation resolved (or
	// re-opens it) by dispatching an {@link AnnotationsUpdatedAction} carrying
	// the updated flag (or an {@link AnnotationsSetAction} when replacing the
	// whole annotation).
	Resolved bool `json:"resolved"`
	// Entries in this annotation, in dispatch order (oldest first). MUST
	// contain at least one entry.
	Entries []AnnotationEntry `json:"entries"`
	// Producer-defined opaque metadata, surfaced to tooling but not
	// interpreted by the protocol.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// A single entry within an {@link Annotation}.
type AnnotationEntry struct {
	// Stable identifier within the enclosing annotation. Assigned by the client
	// that dispatches the {@link AnnotationsEntrySetAction} (or the enclosing
	// {@link AnnotationsSetAction}) introducing the entry.
	Id string `json:"id"`
	// Entry body. A bare `string` is rendered as plain text; pass
	// `{ markdown: "…" }` to opt into Markdown rendering. See
	// {@link StringOrMarkdown}.
	Text StringOrMarkdown `json:"text"`
	// Producer-defined opaque metadata, surfaced to tooling but not
	// interpreted by the protocol.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
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

// ChatInputQuestion is one question within a chat input request.
type ChatInputQuestion struct {
	Value isChatInputQuestion
}

// isChatInputQuestion is the marker interface implemented by every
// concrete variant of ChatInputQuestion.
type isChatInputQuestion interface{ isChatInputQuestion() }

func (*ChatInputTextQuestion) isChatInputQuestion()         {}
func (*ChatInputNumberQuestion) isChatInputQuestion()       {}
func (*ChatInputBooleanQuestion) isChatInputQuestion()      {}
func (*ChatInputSingleSelectQuestion) isChatInputQuestion() {}
func (*ChatInputMultiSelectQuestion) isChatInputQuestion()  {}

// ChatInputQuestionUnknown carries an unrecognized ChatInputQuestion variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ChatInputQuestionUnknown struct {
	Raw json.RawMessage
}

func (*ChatInputQuestionUnknown) isChatInputQuestion() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *ChatInputQuestion) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "text":
		var value ChatInputTextQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "number":
		var value ChatInputNumberQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "integer":
		var value ChatInputNumberQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "boolean":
		var value ChatInputBooleanQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "single-select":
		var value ChatInputSingleSelectQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "multi-select":
		var value ChatInputMultiSelectQuestion
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ChatInputQuestionUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ChatInputQuestion) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ChatInputQuestionUnknown); ok {
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

// ChatInputAnswerValue is the value captured for one answer.
type ChatInputAnswerValue struct {
	Value isChatInputAnswerValue
}

// isChatInputAnswerValue is the marker interface implemented by every
// concrete variant of ChatInputAnswerValue.
type isChatInputAnswerValue interface{ isChatInputAnswerValue() }

func (*ChatInputTextAnswerValue) isChatInputAnswerValue()         {}
func (*ChatInputNumberAnswerValue) isChatInputAnswerValue()       {}
func (*ChatInputBooleanAnswerValue) isChatInputAnswerValue()      {}
func (*ChatInputSelectedAnswerValue) isChatInputAnswerValue()     {}
func (*ChatInputSelectedManyAnswerValue) isChatInputAnswerValue() {}

// ChatInputAnswerValueUnknown carries an unrecognized ChatInputAnswerValue variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ChatInputAnswerValueUnknown struct {
	Raw json.RawMessage
}

func (*ChatInputAnswerValueUnknown) isChatInputAnswerValue() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *ChatInputAnswerValue) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "text":
		var value ChatInputTextAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "number":
		var value ChatInputNumberAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "boolean":
		var value ChatInputBooleanAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "selected":
		var value ChatInputSelectedAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "selected-many":
		var value ChatInputSelectedManyAnswerValue
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ChatInputAnswerValueUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ChatInputAnswerValue) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ChatInputAnswerValueUnknown); ok {
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

// ChatInputAnswer is a draft, submitted, or skipped answer for one question.
type ChatInputAnswer struct {
	Value isChatInputAnswer
}

// isChatInputAnswer is the marker interface implemented by every
// concrete variant of ChatInputAnswer.
type isChatInputAnswer interface{ isChatInputAnswer() }

func (*ChatInputAnswered) isChatInputAnswer() {}
func (*ChatInputSkipped) isChatInputAnswer()  {}

// ChatInputAnswerUnknown carries an unrecognized ChatInputAnswer variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ChatInputAnswerUnknown struct {
	Raw json.RawMessage
}

func (*ChatInputAnswerUnknown) isChatInputAnswer() {}

// UnmarshalJSON decodes the variant indicated by the "state" discriminator.
func (u *ChatInputAnswer) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "state")
	if err != nil {
		return err
	}
	switch disc {
	case "draft":
		var value ChatInputAnswered
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "submitted":
		var value ChatInputAnswered
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "skipped":
		var value ChatInputSkipped
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ChatInputAnswerUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ChatInputAnswer) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ChatInputAnswerUnknown); ok {
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
func (*MessageAnnotationsAttachment) isMessageAttachment()      {}

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
	case "annotations":
		var value MessageAnnotationsAttachment
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

// Customization is a top-level customization (plugin, directory, or bare MCP server).
type Customization struct {
	Value isCustomization
}

// isCustomization is the marker interface implemented by every
// concrete variant of Customization.
type isCustomization interface{ isCustomization() }

func (*PluginCustomization) isCustomization()    {}
func (*DirectoryCustomization) isCustomization() {}
func (*McpServerCustomization) isCustomization() {}

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
	case "mcpServer":
		var value McpServerCustomization
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

// McpServerState is the discriminated lifecycle status of an MCP server customization.
type McpServerState struct {
	Value isMcpServerState
}

// isMcpServerState is the marker interface implemented by every
// concrete variant of McpServerState.
type isMcpServerState interface{ isMcpServerState() }

func (*McpServerStartingState) isMcpServerState()     {}
func (*McpServerReadyState) isMcpServerState()        {}
func (*McpServerAuthRequiredState) isMcpServerState() {}
func (*McpServerErrorState) isMcpServerState()        {}
func (*McpServerStoppedState) isMcpServerState()      {}

// McpServerStateUnknown carries an unrecognized McpServerState variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type McpServerStateUnknown struct {
	Raw json.RawMessage
}

func (*McpServerStateUnknown) isMcpServerState() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *McpServerState) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "starting":
		var value McpServerStartingState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "ready":
		var value McpServerReadyState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "authRequired":
		var value McpServerAuthRequiredState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "error":
		var value McpServerErrorState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "stopped":
		var value McpServerStoppedState
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &McpServerStateUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u McpServerState) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*McpServerStateUnknown); ok {
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

// ToolCallContributor identifies the contributor (client or MCP server) of a tool call.
type ToolCallContributor struct {
	Value isToolCallContributor
}

// isToolCallContributor is the marker interface implemented by every
// concrete variant of ToolCallContributor.
type isToolCallContributor interface{ isToolCallContributor() }

func (*ToolCallClientContributor) isToolCallContributor() {}
func (*ToolCallMcpContributor) isToolCallContributor()    {}

// ToolCallContributorUnknown carries an unrecognized ToolCallContributor variant — typically a discriminator value introduced by a newer protocol version. The original JSON object is preserved verbatim so that re-encoding round-trips faithfully.
type ToolCallContributorUnknown struct {
	Raw json.RawMessage
}

func (*ToolCallContributorUnknown) isToolCallContributor() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *ToolCallContributor) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "client":
		var value ToolCallClientContributor
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "mcp":
		var value ToolCallMcpContributor
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		u.Value = &ToolCallContributorUnknown{Raw: raw}
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ToolCallContributor) MarshalJSON() ([]byte, error) {
	if unk, ok := u.Value.(*ToolCallContributorUnknown); ok {
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

// ChatOrigin describes how a chat came into existence.
type ChatOrigin struct {
	Value isChatOrigin
}

// isChatOrigin is the marker interface for chat origin variants.
type isChatOrigin interface{ isChatOrigin() }

type ChatUserOrigin struct {
	Kind ChatOriginKind `json:"kind"`
}

func (*ChatUserOrigin) isChatOrigin() {}

type ChatForkOrigin struct {
	Kind   ChatOriginKind `json:"kind"`
	Chat   URI            `json:"chat"`
	TurnId string         `json:"turnId"`
}

func (*ChatForkOrigin) isChatOrigin() {}

type ChatToolOrigin struct {
	Kind       ChatOriginKind `json:"kind"`
	Chat       URI            `json:"chat"`
	ToolCallId string         `json:"toolCallId"`
}

func (*ChatToolOrigin) isChatOrigin() {}

type ChatOriginUnknown struct {
	Raw json.RawMessage
}

func (*ChatOriginUnknown) isChatOrigin() {}

func (o *ChatOrigin) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "user":
		var v ChatUserOrigin
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		o.Value = &v
	case "fork":
		var v ChatForkOrigin
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		o.Value = &v
	case "tool":
		var v ChatToolOrigin
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		o.Value = &v
	default:
		raw := make(json.RawMessage, len(data))
		copy(raw, data)
		o.Value = &ChatOriginUnknown{Raw: raw}
	}
	return nil
}

func (o ChatOrigin) MarshalJSON() ([]byte, error) {
	if unk, ok := o.Value.(*ChatOriginUnknown); ok {
		if len(unk.Raw) == 0 {
			return []byte("null"), nil
		}
		return unk.Raw, nil
	}
	if o.Value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(o.Value)
}

// SnapshotState is the state payload of a snapshot — root, session,
// chat, terminal, changeset, resource-watch, or annotations state. The active
// variant is chosen by which pointer field is non-nil; UnmarshalJSON probes
// for required fields in the canonical order
// (session → chat → terminal → changeset → resourceWatch → annotations → root).
type SnapshotState struct {
	Root          *RootState          `json:"-"`
	Session       *SessionState       `json:"-"`
	Chat          *ChatState          `json:"-"`
	Terminal      *TerminalState      `json:"-"`
	Changeset     *ChangesetState     `json:"-"`
	ResourceWatch *ResourceWatchState `json:"-"`
	Annotations   *AnnotationsState   `json:"-"`
}

// MarshalJSON encodes whichever variant is currently populated.
func (s SnapshotState) MarshalJSON() ([]byte, error) {
	switch {
	case s.Session != nil:
		return json.Marshal(s.Session)
	case s.Chat != nil:
		return json.Marshal(s.Chat)
	case s.Terminal != nil:
		return json.Marshal(s.Terminal)
	case s.Changeset != nil:
		return json.Marshal(s.Changeset)
	case s.ResourceWatch != nil:
		return json.Marshal(s.ResourceWatch)
	case s.Annotations != nil:
		return json.Marshal(s.Annotations)
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
	case containsAll(probe, "summary", "turns"):
		var v ChatState
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		s.Chat = &v
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
	case containsAll(probe, "root", "recursive"):
		var v ResourceWatchState
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		s.ResourceWatch = &v
	case containsAll(probe, "annotations"):
		var v AnnotationsState
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		s.Annotations = &v
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
