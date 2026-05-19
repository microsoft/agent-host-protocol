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

// ─── Enums ────────────────────────────────────────────────────────────

/// Policy configuration state for a model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PolicyState {
    #[serde(rename = "enabled")]
    Enabled,
    #[serde(rename = "disabled")]
    Disabled,
    #[serde(rename = "unconfigured")]
    Unconfigured,
}

/// Discriminant for pending message kinds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PendingMessageKind {
    /// Injected into the current turn at a convenient point
    #[serde(rename = "steering")]
    Steering,
    /// Sent automatically as a new turn after the current turn finishes
    #[serde(rename = "queued")]
    Queued,
}

/// Session initialization state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SessionLifecycle {
    #[serde(rename = "creating")]
    Creating,
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "creationFailed")]
    CreationFailed,
}

/// Bitset of summary-level session status flags.
///
/// Use bitwise checks instead of equality for non-terminal activity. For example,
/// `status & SessionStatus.InProgress` matches both ordinary in-progress turns
/// and turns that are paused waiting for input.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize_repr, Deserialize_repr)]
#[repr(u32)]
pub enum SessionStatus {
    /// Session is idle — no turn is active.
    Idle = 1,
    /// Session ended with an error.
    Error = 2,
    /// A turn is actively streaming.
    InProgress = 8,
    /// A turn is in progress but blocked waiting for user input or tool confirmation.
    InputNeeded = 24,
    /// The client has viewed this session since its last modification.
    IsRead = 32,
    /// The session has been archived by the client.
    IsArchived = 64,
}

/// Answer lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SessionInputAnswerState {
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "submitted")]
    Submitted,
    #[serde(rename = "skipped")]
    Skipped,
}

/// Answer value kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SessionInputAnswerValueKind {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "number")]
    Number,
    #[serde(rename = "boolean")]
    Boolean,
    #[serde(rename = "selected")]
    Selected,
    #[serde(rename = "selected-many")]
    SelectedMany,
}

/// Question/input control kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SessionInputQuestionKind {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "number")]
    Number,
    #[serde(rename = "integer")]
    Integer,
    #[serde(rename = "boolean")]
    Boolean,
    #[serde(rename = "single-select")]
    SingleSelect,
    #[serde(rename = "multi-select")]
    MultiSelect,
}

/// How a client completed an input request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SessionInputResponseKind {
    #[serde(rename = "accept")]
    Accept,
    #[serde(rename = "decline")]
    Decline,
    #[serde(rename = "cancel")]
    Cancel,
}

/// How a turn ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TurnState {
    #[serde(rename = "complete")]
    Complete,
    #[serde(rename = "cancelled")]
    Cancelled,
    #[serde(rename = "error")]
    Error,
}

/// Discriminant for {@link MessageAttachment} variants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MessageAttachmentKind {
    /// A simple, opaque attachment whose representation is described by the producer.
    #[serde(rename = "simple")]
    Simple,
    /// An attachment whose data is embedded inline as a base64 string.
    #[serde(rename = "embeddedResource")]
    EmbeddedResource,
    /// An attachment that references a resource by URI.
    #[serde(rename = "resource")]
    Resource,
}

/// Discriminant for response part types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ResponsePartKind {
    #[serde(rename = "markdown")]
    Markdown,
    #[serde(rename = "contentRef")]
    ContentRef,
    #[serde(rename = "toolCall")]
    ToolCall,
    #[serde(rename = "reasoning")]
    Reasoning,
    #[serde(rename = "systemNotification")]
    SystemNotification,
}

/// Status of a tool call in the lifecycle state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolCallStatus {
    #[serde(rename = "streaming")]
    Streaming,
    #[serde(rename = "pending-confirmation")]
    PendingConfirmation,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "pending-result-confirmation")]
    PendingResultConfirmation,
    #[serde(rename = "completed")]
    Completed,
    #[serde(rename = "cancelled")]
    Cancelled,
}

/// How a tool call was confirmed for execution.
///
/// - `NotNeeded` — No confirmation required (auto-approved)
/// - `UserAction` — User explicitly approved
/// - `Setting` — Approved by a persistent user setting
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolCallConfirmationReason {
    #[serde(rename = "not-needed")]
    NotNeeded,
    #[serde(rename = "user-action")]
    UserAction,
    #[serde(rename = "setting")]
    Setting,
}

/// Why a tool call was cancelled.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolCallCancellationReason {
    #[serde(rename = "denied")]
    Denied,
    #[serde(rename = "skipped")]
    Skipped,
    #[serde(rename = "result-denied")]
    ResultDenied,
}

/// Whether a confirmation option represents an approval or denial action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ConfirmationOptionKind {
    #[serde(rename = "approve")]
    Approve,
    #[serde(rename = "deny")]
    Deny,
}

/// Discriminant for tool result content types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolResultContentType {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "embeddedResource")]
    EmbeddedResource,
    #[serde(rename = "resource")]
    Resource,
    #[serde(rename = "fileEdit")]
    FileEdit,
    #[serde(rename = "terminal")]
    Terminal,
    #[serde(rename = "subagent")]
    Subagent,
}

/// Loading status for a server-managed customization.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CustomizationStatus {
    /// Plugin is being loaded
    #[serde(rename = "loading")]
    Loading,
    /// Plugin is fully operational
    #[serde(rename = "loaded")]
    Loaded,
    /// Plugin partially loaded but has warnings
    #[serde(rename = "degraded")]
    Degraded,
    /// Plugin was unable to load
    #[serde(rename = "error")]
    Error,
}

/// Discriminant for terminal claim kinds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TerminalClaimKind {
    #[serde(rename = "client")]
    Client,
    #[serde(rename = "session")]
    Session,
}

/// Computation lifecycle of a {@link ChangesetState}.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChangesetStatus {
    /// The server is still computing the contents of this changeset.
    #[serde(rename = "computing")]
    Computing,
    /// The changeset has been fully computed and is up-to-date.
    #[serde(rename = "ready")]
    Ready,
    /// Computation failed. The cause is described by
    /// {@link ChangesetState.error}.
    #[serde(rename = "error")]
    Error,
}

/// Where a {@link ChangesetOperation} can be invoked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChangesetOperationScope {
    /// Applies to the whole changeset.
    #[serde(rename = "changeset")]
    Changeset,
    /// Applies to a single file within the changeset.
    #[serde(rename = "resource")]
    Resource,
    /// Applies to a line range within a single file.
    #[serde(rename = "range")]
    Range,
}

// ─── Structs ──────────────────────────────────────────────────────────

/// An optionally-sized icon that can be displayed in a user interface.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Icon {
    /// A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a
    /// `data:` URI with Base64-encoded image data.
    ///
    /// Consumers SHOULD take steps to ensure URLs serving icons are from the
    /// same domain as the client/server or a trusted domain.
    ///
    /// Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain
    /// executable JavaScript.
    pub src: Uri,
    /// Optional MIME type override if the source MIME type is missing or generic.
    /// For example: `"image/png"`, `"image/jpeg"`, or `"image/svg+xml"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    /// Optional array of strings that specify sizes at which the icon can be used.
    /// Each string should be in WxH format (e.g., `"48x48"`, `"96x96"`) or `"any"` for scalable formats like SVG.
    ///
    /// If not provided, the client should assume that the icon can be used at any size.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sizes: Option<Vec<String>>,
    /// Optional specifier for the theme this icon is designed for. `"light"` indicates
    /// the icon is designed to be used with a light background, and `"dark"` indicates
    /// the icon is designed to be used with a dark background.
    ///
    /// If not provided, the client should assume the icon can be used with any theme.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
}

/// Describes a protected resource's authentication requirements using
/// [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) (OAuth 2.0
/// Protected Resource Metadata) semantics.
///
/// Field names use snake_case to match the RFC 9728 JSON format.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedResourceMetadata {
    /// REQUIRED. The protected resource's resource identifier, a URL using the
    /// `https` scheme with no fragment component (e.g. `"https://api.github.com"`).
    pub resource: String,
    /// OPTIONAL. Human-readable name of the protected resource.
    #[serde(
        rename = "resource_name",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resource_name: Option<String>,
    /// OPTIONAL. JSON array of OAuth authorization server identifier URLs.
    #[serde(
        rename = "authorization_servers",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub authorization_servers: Option<Vec<String>>,
    /// OPTIONAL. URL of the protected resource's JWK Set document.
    #[serde(rename = "jwks_uri", default, skip_serializing_if = "Option::is_none")]
    pub jwks_uri: Option<String>,
    /// RECOMMENDED. JSON array of OAuth 2.0 scope values used in authorization requests.
    #[serde(
        rename = "scopes_supported",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub scopes_supported: Option<Vec<String>>,
    /// OPTIONAL. JSON array of Bearer Token presentation methods supported.
    #[serde(
        rename = "bearer_methods_supported",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub bearer_methods_supported: Option<Vec<String>>,
    /// OPTIONAL. JSON array of JWS signing algorithms supported.
    #[serde(
        rename = "resource_signing_alg_values_supported",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resource_signing_alg_values_supported: Option<Vec<String>>,
    /// OPTIONAL. JSON array of JWE encryption algorithms (alg) supported.
    #[serde(
        rename = "resource_encryption_alg_values_supported",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resource_encryption_alg_values_supported: Option<Vec<String>>,
    /// OPTIONAL. JSON array of JWE encryption algorithms (enc) supported.
    #[serde(
        rename = "resource_encryption_enc_values_supported",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resource_encryption_enc_values_supported: Option<Vec<String>>,
    /// OPTIONAL. URL of human-readable documentation for the resource.
    #[serde(
        rename = "resource_documentation",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resource_documentation: Option<String>,
    /// OPTIONAL. URL of the resource's data-usage policy.
    #[serde(
        rename = "resource_policy_uri",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resource_policy_uri: Option<String>,
    /// OPTIONAL. URL of the resource's terms of service.
    #[serde(
        rename = "resource_tos_uri",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resource_tos_uri: Option<String>,
    /// AHP extension. Whether authentication is required for this resource.
    ///
    /// - `true` (default) — the agent cannot be used without a valid token.
    ///   The server SHOULD return `AuthRequired` (`-32007`) if the client
    ///   attempts to use the agent without authenticating.
    /// - `false` — the agent works without authentication but MAY offer
    ///   enhanced capabilities when a token is provided.
    ///
    /// Clients SHOULD treat an absent field the same as `true`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
}

/// Global state shared with every client subscribed to `ahp-root://`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootState {
    /// Available agent backends and their models
    pub agents: Vec<AgentInfo>,
    /// Number of active (non-disposed) sessions on the server
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_sessions: Option<i64>,
    /// Known terminals on the server. Subscribe to individual terminal URIs for full state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminals: Option<Vec<TerminalInfo>>,
    /// Agent host configuration schema and current values
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<RootConfigState>,
}

/// Live agent-host configuration metadata.
///
/// The schema describes the available configuration properties and the values
/// contain the current value for each resolved property.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootConfigState {
    /// JSON Schema describing available configuration properties
    pub schema: ConfigSchema,
    /// Current configuration values
    pub values: JsonObject,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    /// Agent provider ID (e.g. `'copilot'`)
    pub provider: String,
    /// Human-readable name
    pub display_name: String,
    /// Description string
    pub description: String,
    /// Available models for this agent
    pub models: Vec<SessionModelInfo>,
    /// Protected resources this agent requires authentication for.
    ///
    /// Each entry describes an OAuth 2.0 protected resource using
    /// [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) semantics.
    /// Clients should obtain tokens from the declared `authorization_servers`
    /// and push them via the `authenticate` command before creating sessions
    /// with this agent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protected_resources: Option<Vec<ProtectedResourceMetadata>>,
    /// Customizations (Open Plugins) associated with this agent.
    ///
    /// Each entry is a reference to an [Open Plugins](https://open-plugins.com/)
    /// plugin that the agent host can activate for sessions using this agent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customizations: Option<Vec<CustomizationRef>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelInfo {
    /// Model identifier
    pub id: String,
    /// Provider this model belongs to
    pub provider: String,
    /// Human-readable model name
    pub name: String,
    /// Maximum context window size
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_context_window: Option<i64>,
    /// Whether the model supports vision
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_vision: Option<bool>,
    /// Policy configuration state
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub policy_state: Option<PolicyState>,
    /// Configuration schema describing model-specific options (e.g. thinking
    /// level). Clients present this as a form and pass the resolved values in
    /// {@link ModelSelection.config} when creating or changing sessions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config_schema: Option<ConfigSchema>,
    /// Additional provider-specific metadata for this model.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `pricing` key may carry model pricing metadata.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// A model selection: the chosen model ID together with any model-specific
/// configuration values whose keys correspond to the model's
/// {@link SessionModelInfo.configSchema}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSelection {
    /// Model identifier
    pub id: String,
    /// Model-specific configuration values
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<std::collections::HashMap<String, String>>,
}

/// A JSON Schema-compatible property descriptor with display extensions.
///
/// Standard JSON Schema fields (`type`, `title`, `description`, `default`,
/// `enum`) allow validators to process the schema. Display extensions
/// (`enumLabels`, `enumDescriptions`) are parallel arrays that provide UI
/// metadata for each `enum` value.
///
/// This is the generic base type. See {@link SessionConfigPropertySchema} for
/// session-specific extensions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPropertySchema {
    /// JSON Schema: property type
    pub r#type: String,
    /// JSON Schema: human-readable label for the property
    pub title: String,
    /// JSON Schema: description / tooltip
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// JSON Schema: default value
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<AnyValue>,
    /// JSON Schema: allowed values (typically used with `string` type)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#enum: Option<Vec<String>>,
    /// Display extension: human-readable label per enum value (parallel array)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enum_labels: Option<Vec<String>>,
    /// Display extension: description per enum value (parallel array)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enum_descriptions: Option<Vec<String>>,
    /// JSON Schema: when `true`, the property is displayed but cannot be modified by the user
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
    /// JSON Schema: schema for array items (used when `type` is `'array'`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<ConfigPropertySchema>>,
    /// JSON Schema: property descriptors for object properties (used when `type` is `'object'`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<std::collections::HashMap<String, Box<ConfigPropertySchema>>>,
    /// JSON Schema: list of required property ids (used when `type` is `'object'`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

/// A JSON Schema object describing available configuration properties.
///
/// This is the generic base type. See {@link SessionConfigSchema} for
/// session-specific usage.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSchema {
    /// JSON Schema: always `'object'`
    pub r#type: String,
    /// JSON Schema: property descriptors keyed by property id
    pub properties: std::collections::HashMap<String, ConfigPropertySchema>,
    /// JSON Schema: list of required property ids
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

/// A message queued for future delivery to the agent.
///
/// Steering messages are injected into the current turn mid-flight.
/// Queued messages are automatically started as new turns after the
/// current turn naturally finishes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMessage {
    /// Unique identifier for this pending message
    pub id: String,
    /// The message content
    pub user_message: UserMessage,
}

/// Full state for a single session, loaded when a client subscribes to the session's URI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    /// Lightweight session metadata
    pub summary: SessionSummary,
    /// Session initialization state
    pub lifecycle: SessionLifecycle,
    /// Error details if creation failed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creation_error: Option<ErrorInfo>,
    /// Tools provided by the server (agent host) for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_tools: Option<Vec<ToolDefinition>>,
    /// The client currently providing tools and interactive capabilities to this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_client: Option<SessionActiveClient>,
    /// Completed turns
    pub turns: Vec<Turn>,
    /// Currently in-progress turn
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_turn: Option<ActiveTurn>,
    /// Message to inject into the current turn at a convenient point
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steering_message: Option<PendingMessage>,
    /// Messages to send automatically as new turns after the current turn finishes
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queued_messages: Option<Vec<PendingMessage>>,
    /// Requests for user input that are currently blocking or informing session progress
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_requests: Option<Vec<SessionInputRequest>>,
    /// Session configuration schema and current values
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<SessionConfigState>,
    /// Server-provided customizations active in this session.
    ///
    /// Client-provided customizations are available on
    /// {@link SessionActiveClient.customizations | activeClient.customizations}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customizations: Option<Vec<SessionCustomization>>,
    /// Additional provider-specific metadata for this session.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `git` key may provide extra git metadata about the session's
    /// workingDirectory.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// The client currently providing tools and interactive capabilities to a session.
///
/// Only one client may be active per session at a time. The server SHOULD
/// automatically unset the active client if that client disconnects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionActiveClient {
    /// Client identifier (matches `clientId` from `initialize`)
    pub client_id: String,
    /// Human-readable client name (e.g. `"VS Code"`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Tools this client provides to the session
    pub tools: Vec<ToolDefinition>,
    /// Customizations this client contributes to the session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customizations: Option<Vec<CustomizationRef>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    /// Session URI
    pub resource: Uri,
    /// Agent provider ID
    pub provider: String,
    /// Session title
    pub title: String,
    /// Current session status
    pub status: u32,
    /// Human-readable description of what the session is currently doing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Creation timestamp
    pub created_at: i64,
    /// Last modification timestamp
    pub modified_at: i64,
    /// Server-owned project for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectInfo>,
    /// Currently selected model
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelSelection>,
    /// The working directory URI for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Catalogue of changesets the server can produce for this session. Each
    /// entry advertises a subscribable view of file changes (uncommitted,
    /// session-wide, per-turn, etc.) and the URI template the client expands
    /// before subscribing. See {@link ChangesetSummary} for the full shape and
    /// {@link /guide/changesets | Changesets} for an overview of the model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changesets: Option<Vec<ChangesetSummary>>,
}

/// Server-owned project metadata for a session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// Project URI
    pub uri: Uri,
    /// Human-readable project name
    pub display_name: String,
}

/// A session configuration property descriptor.
///
/// Extends the generic {@link ConfigPropertySchema} with session-specific
/// display extensions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigPropertySchema {
    /// JSON Schema: property type
    pub r#type: String,
    /// JSON Schema: human-readable label for the property
    pub title: String,
    /// JSON Schema: description / tooltip
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// JSON Schema: default value
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<AnyValue>,
    /// JSON Schema: allowed values (typically used with `string` type)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#enum: Option<Vec<String>>,
    /// Display extension: human-readable label per enum value (parallel array)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enum_labels: Option<Vec<String>>,
    /// Display extension: description per enum value (parallel array)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enum_descriptions: Option<Vec<String>>,
    /// JSON Schema: when `true`, the property is displayed but cannot be modified by the user
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
    /// JSON Schema: schema for array items (used when `type` is `'array'`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<ConfigPropertySchema>,
    /// JSON Schema: property descriptors for object properties (used when `type` is `'object'`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<std::collections::HashMap<String, ConfigPropertySchema>>,
    /// JSON Schema: list of required property ids (used when `type` is `'object'`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
    /// Display extension: when `true`, the full set of allowed values is too large
    /// to enumerate statically. The client SHOULD use `sessionConfigCompletions`
    /// to fetch matching values based on user input. Any values in `enum` are
    /// seed/recent values for initial display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enum_dynamic: Option<bool>,
    /// When `true`, the user may change this property after session creation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_mutable: Option<bool>,
}

/// A JSON Schema object describing available session configuration metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigSchema {
    /// JSON Schema: always `'object'`
    pub r#type: String,
    /// JSON Schema: property descriptors keyed by property id
    pub properties: std::collections::HashMap<String, SessionConfigPropertySchema>,
    /// JSON Schema: list of required property ids
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
}

/// Live session configuration metadata.
///
/// The schema describes the available configuration properties and the values
/// contain the current value for each resolved property.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigState {
    /// JSON Schema describing available configuration properties
    pub schema: SessionConfigSchema,
    /// Current configuration values
    pub values: JsonObject,
}

/// A completed request/response cycle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    /// Turn identifier
    pub id: String,
    /// The user's input
    pub user_message: UserMessage,
    /// All response content in stream order: text, tool calls, reasoning, and content refs.
    ///
    /// Consumers should derive display text by concatenating markdown parts,
    /// and find tool calls by filtering for `ToolCall` parts.
    pub response_parts: Vec<ResponsePart>,
    /// Token usage info
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageInfo>,
    /// How the turn ended
    pub state: TurnState,
    /// Error details if state is `'error'`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
}

/// An in-progress turn — the assistant is actively streaming.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTurn {
    /// Turn identifier
    pub id: String,
    /// The user's input
    pub user_message: UserMessage,
    /// All response content in stream order: text, tool calls, reasoning, and content refs.
    ///
    /// Tool call parts include `pendingPermissions` when permissions are awaiting user approval.
    pub response_parts: Vec<ResponsePart>,
    /// Token usage info
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageInfo>,
}

/// A user message and its associated attachments.
///
/// Attachments MAY be referenced inside {@link UserMessage.text} via their
/// {@link MessageAttachmentBase.range} field. Attachments without a range are
/// still associated with the message but do not correspond to a specific span
/// in the text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMessage {
    /// Message text
    pub text: String,
    /// File/selection attachments
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<MessageAttachment>>,
}

/// A choice in a select-style question.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputOption {
    /// Stable option identifier; for MCP enum values this is the enum string
    pub id: String,
    /// Display label
    pub label: String,
    /// Optional secondary text
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Whether this option is the recommended/default choice
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended: Option<bool>,
}

/// Value captured for one answer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputTextAnswerValue {
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputNumberAnswerValue {
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputBooleanAnswerValue {
    pub value: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputSelectedAnswerValue {
    pub value: String,
    /// Free-form text entered instead of selecting an option
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freeform_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputSelectedManyAnswerValue {
    pub value: Vec<String>,
    /// Free-form text entered in addition to selected options
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freeform_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputAnswered {
    /// Answer value
    pub value: SessionInputAnswerValue,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputSkipped {
    /// Free-form reason or value captured while skipping, if any
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freeform_values: Option<Vec<String>>,
}

/// Text question within a session input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputTextQuestion {
    /// Stable question identifier used as the key in `answers`
    pub id: String,
    /// Short display title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Prompt shown to the user
    pub message: String,
    /// Whether the user must answer this question to accept the request
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    /// Format hint for text questions, such as `email`, `uri`, `date`, or `date-time`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    /// Minimum string length
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<i64>,
    /// Maximum string length
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<i64>,
    /// Default text
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
}

/// Numeric question within a session input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputNumberQuestion {
    /// Stable question identifier used as the key in `answers`
    pub id: String,
    /// Short display title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Prompt shown to the user
    pub message: String,
    /// Whether the user must answer this question to accept the request
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    /// Minimum value
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    /// Maximum value
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    /// Default numeric value
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<f64>,
}

/// Boolean question within a session input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputBooleanQuestion {
    /// Stable question identifier used as the key in `answers`
    pub id: String,
    /// Short display title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Prompt shown to the user
    pub message: String,
    /// Whether the user must answer this question to accept the request
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    /// Default boolean value
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<bool>,
}

/// Single-select question within a session input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputSingleSelectQuestion {
    /// Stable question identifier used as the key in `answers`
    pub id: String,
    /// Short display title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Prompt shown to the user
    pub message: String,
    /// Whether the user must answer this question to accept the request
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    /// Options the user may select from
    pub options: Vec<SessionInputOption>,
    /// Whether the user may enter text instead of selecting an option
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_freeform_input: Option<bool>,
}

/// Multi-select question within a session input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputMultiSelectQuestion {
    /// Stable question identifier used as the key in `answers`
    pub id: String,
    /// Short display title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Prompt shown to the user
    pub message: String,
    /// Whether the user must answer this question to accept the request
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    /// Options the user may select from
    pub options: Vec<SessionInputOption>,
    /// Whether the user may enter text in addition to selecting options
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_freeform_input: Option<bool>,
    /// Minimum selected item count
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<i64>,
    /// Maximum selected item count
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<i64>,
}

/// A live request for user input.
///
/// The server creates or replaces requests with `session/inputRequested`.
/// Clients sync drafts with `session/inputAnswerChanged` and complete requests
/// with `session/inputCompleted`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInputRequest {
    /// Stable request identifier
    pub id: String,
    /// Display message for the request as a whole
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// URL the user should review or open, for URL-style elicitations
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<Uri>,
    /// Ordered questions to ask the user
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub questions: Option<Vec<SessionInputQuestion>>,
    /// Current draft or submitted answers, keyed by question ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answers: Option<std::collections::HashMap<String, SessionInputAnswer>>,
}

/// A zero-based position within a textual document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPosition {
    /// Zero-based line number.
    pub line: i64,
    /// Zero-based character offset within the line.
    pub character: i64,
}

/// A range within a textual document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRange {
    /// Start position of the range.
    pub start: TextPosition,
    /// End position of the range.
    pub end: TextPosition,
}

/// A selection within a textual resource.
///
/// This is only meaningful for textual resources. Binary resources may still
/// use resource or embedded resource attachments, but they should not use this
/// text selection field.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSelection {
    /// The range covered by the selection.
    pub range: TextRange,
}

/// A simple, opaque attachment whose model representation is described by
/// the producer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleMessageAttachment {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    pub label: String,
    /// If defined, the range in {@link UserMessage.text} that references this
    /// attachment. This is a text range, not a byte range.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Advisory display hint for clients rendering this attachment. Recognized
    /// values include:
    ///
    /// - `'image'`: the attachment is an image
    /// - `'document'`: the attachment is a textual document
    /// - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
    /// - `'directory'`: the attachment is a folder
    /// - `'selection'`: the attachment is a selection within a document
    ///
    /// Implementations MAY provide additional values; clients SHOULD fall back
    /// to a reasonable default when an unknown value is encountered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_kind: Option<String>,
    /// Additional implementation-defined metadata for the attachment.
    ///
    /// If the attachment was produced by the `completions` command, the client
    /// MUST preserve every property of `_meta` originally returned by the agent
    /// host when sending the user message containing the accepted completion.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Representation of the attachment as it should be shown to the model.
    ///
    /// If the attachment was produced by the client, this property MUST be
    /// defined so the agent host can correctly interpret the attachment. This
    /// property MAY be omitted when the attachment originated from a
    /// `completions` response.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_representation: Option<String>,
}

/// An attachment whose data is embedded inline as a base64 string.
///
/// Use this for small binary payloads (e.g. a pasted image) that should be
/// delivered with the user message itself rather than fetched separately.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageEmbeddedResourceAttachment {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    pub label: String,
    /// If defined, the range in {@link UserMessage.text} that references this
    /// attachment. This is a text range, not a byte range.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Advisory display hint for clients rendering this attachment. Recognized
    /// values include:
    ///
    /// - `'image'`: the attachment is an image
    /// - `'document'`: the attachment is a textual document
    /// - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
    /// - `'directory'`: the attachment is a folder
    /// - `'selection'`: the attachment is a selection within a document
    ///
    /// Implementations MAY provide additional values; clients SHOULD fall back
    /// to a reasonable default when an unknown value is encountered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_kind: Option<String>,
    /// Additional implementation-defined metadata for the attachment.
    ///
    /// If the attachment was produced by the `completions` command, the client
    /// MUST preserve every property of `_meta` originally returned by the agent
    /// host when sending the user message containing the accepted completion.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Base64-encoded binary data
    pub data: String,
    /// Content MIME type (e.g. `"image/png"`, `"application/pdf"`)
    pub content_type: String,
    /// Optional selection within the attached textual resource.
    ///
    /// Only meaningful for textual resources.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selection: Option<TextSelection>,
}

/// An attachment that references a resource by URI. The content is not
/// delivered inline; consumers can fetch it via `resourceRead` when needed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageResourceAttachment {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    pub label: String,
    /// If defined, the range in {@link UserMessage.text} that references this
    /// attachment. This is a text range, not a byte range.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Advisory display hint for clients rendering this attachment. Recognized
    /// values include:
    ///
    /// - `'image'`: the attachment is an image
    /// - `'document'`: the attachment is a textual document
    /// - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
    /// - `'directory'`: the attachment is a folder
    /// - `'selection'`: the attachment is a selection within a document
    ///
    /// Implementations MAY provide additional values; clients SHOULD fall back
    /// to a reasonable default when an unknown value is encountered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_kind: Option<String>,
    /// Additional implementation-defined metadata for the attachment.
    ///
    /// If the attachment was produced by the `completions` command, the client
    /// MUST preserve every property of `_meta` originally returned by the agent
    /// host when sending the user message containing the accepted completion.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Content URI
    pub uri: Uri,
    /// Approximate size in bytes
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_hint: Option<i64>,
    /// Content MIME type
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    /// Optional selection within the referenced textual resource.
    ///
    /// Only meaningful for textual resources.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selection: Option<TextSelection>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownResponsePart {
    /// Part identifier, used by `session/delta` to target this part for content appends
    pub id: String,
    /// Markdown content
    pub content: String,
}

/// A reference to large content stored outside the state tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRef {
    /// Content URI
    pub uri: Uri,
    /// Approximate size in bytes
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_hint: Option<i64>,
    /// Content MIME type
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

/// A content part that's a reference to large content stored outside the state tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceResponsePart {
    /// Content URI
    pub uri: Uri,
    /// Approximate size in bytes
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_hint: Option<i64>,
    /// Content MIME type
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

/// A tool call represented as a response part.
///
/// Tool calls are part of the response stream, interleaved with text and
/// reasoning. The `toolCall.toolCallId` serves as the part identifier for
/// actions that target this part.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallResponsePart {
    /// Full tool call lifecycle state
    pub tool_call: ToolCallState,
}

/// Reasoning/thinking content from the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningResponsePart {
    /// Part identifier, used by `session/reasoning` to target this part for content appends
    pub id: String,
    /// Accumulated reasoning text
    pub content: String,
}

/// A system notification surfaced as part of the response stream.
///
/// System notifications are messages authored by the agent harness
/// that need to be visible to both the agent (for situational awareness) and
/// the user (for transcript continuity). Examples include "background subagent
/// X completed" or "task Y was cancelled".
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemNotificationResponsePart {
    /// The text of the system notification
    pub content: StringOrMarkdown,
}

/// Tool execution result details, available after execution completes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallResult {
    /// Whether the tool succeeded
    pub success: bool,
    /// Past-tense description of what the tool did
    pub past_tense_message: StringOrMarkdown,
    /// Unstructured result content blocks.
    ///
    /// This mirrors the `content` field of MCP `CallToolResult`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<ToolResultContent>>,
    /// Optional structured result object.
    ///
    /// This mirrors the `structuredContent` field of MCP `CallToolResult`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_content: Option<JsonObject>,
    /// Error details if the tool failed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<AnyValue>,
}

/// A confirmation option that the server offers for a tool call awaiting
/// approval. Allows richer choices beyond simple approve/deny — for example,
/// "Approve in this Session" or "Deny with reason."
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmationOption {
    /// Unique identifier for the option, returned in the confirmed action
    pub id: String,
    /// Human-readable label displayed to the user
    pub label: String,
    /// Whether this option represents an approval or denial
    pub kind: ConfirmationOptionKind,
    /// Logical group number for visual categorisation.
    ///
    /// Clients SHOULD display options in the order they are defined and MAY
    /// use differing group numbers to insert dividers between logical clusters
    /// of options.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<i64>,
}

/// LM is streaming the tool call parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallStreamingState {
    /// Unique tool call identifier
    pub tool_call_id: String,
    /// Internal tool name (for debugging/logging)
    pub tool_name: String,
    /// Human-readable tool name
    pub display_name: String,
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_client_id: Option<String>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Partial parameters accumulated so far
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partial_input: Option<String>,
    /// Progress message shown while parameters are streaming
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invocation_message: Option<StringOrMarkdown>,
}

/// Parameters are complete, or a running tool requires re-confirmation
/// (e.g. a mid-execution permission check).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallPendingConfirmationState {
    /// Unique tool call identifier
    pub tool_call_id: String,
    /// Internal tool name (for debugging/logging)
    pub tool_name: String,
    /// Human-readable tool name
    pub display_name: String,
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_client_id: Option<String>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Message describing what the tool will do
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
    /// Options the server offers for this confirmation. When present, the client
    /// SHOULD render these instead of a plain approve/deny UI. Each option
    /// belongs to a {@link ConfirmationOptionGroup} so the client can still
    /// categorise the choices.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<ConfirmationOption>>,
}

/// Tool is actively executing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRunningState {
    /// Unique tool call identifier
    pub tool_call_id: String,
    /// Internal tool name (for debugging/logging)
    pub tool_name: String,
    /// Human-readable tool name
    pub display_name: String,
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_client_id: Option<String>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Message describing what the tool will do
    pub invocation_message: StringOrMarkdown,
    /// Raw tool input
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// How the tool was confirmed for execution
    pub confirmed: ToolCallConfirmationReason,
    /// The confirmation option the user selected, if confirmation options were provided
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_option: Option<ConfirmationOption>,
    /// Partial content produced while the tool is still executing.
    ///
    /// For example, a terminal content block lets clients subscribe to live
    /// output before the tool completes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<ToolResultContent>>,
}

/// Tool finished executing, waiting for client to approve the result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallPendingResultConfirmationState {
    /// Unique tool call identifier
    pub tool_call_id: String,
    /// Internal tool name (for debugging/logging)
    pub tool_name: String,
    /// Human-readable tool name
    pub display_name: String,
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_client_id: Option<String>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Message describing what the tool will do
    pub invocation_message: StringOrMarkdown,
    /// Raw tool input
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// Whether the tool succeeded
    pub success: bool,
    /// Past-tense description of what the tool did
    pub past_tense_message: StringOrMarkdown,
    /// Unstructured result content blocks.
    ///
    /// This mirrors the `content` field of MCP `CallToolResult`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<ToolResultContent>>,
    /// Optional structured result object.
    ///
    /// This mirrors the `structuredContent` field of MCP `CallToolResult`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_content: Option<JsonObject>,
    /// Error details if the tool failed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<AnyValue>,
    /// How the tool was confirmed for execution
    pub confirmed: ToolCallConfirmationReason,
    /// The confirmation option the user selected, if confirmation options were provided
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_option: Option<ConfirmationOption>,
}

/// Tool completed successfully or with an error.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallCompletedState {
    /// Unique tool call identifier
    pub tool_call_id: String,
    /// Internal tool name (for debugging/logging)
    pub tool_name: String,
    /// Human-readable tool name
    pub display_name: String,
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_client_id: Option<String>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Message describing what the tool will do
    pub invocation_message: StringOrMarkdown,
    /// Raw tool input
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// Whether the tool succeeded
    pub success: bool,
    /// Past-tense description of what the tool did
    pub past_tense_message: StringOrMarkdown,
    /// Unstructured result content blocks.
    ///
    /// This mirrors the `content` field of MCP `CallToolResult`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<ToolResultContent>>,
    /// Optional structured result object.
    ///
    /// This mirrors the `structuredContent` field of MCP `CallToolResult`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_content: Option<JsonObject>,
    /// Error details if the tool failed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<AnyValue>,
    /// How the tool was confirmed for execution
    pub confirmed: ToolCallConfirmationReason,
    /// The confirmation option the user selected, if confirmation options were provided
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_option: Option<ConfirmationOption>,
}

/// Tool call was cancelled before execution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallCancelledState {
    /// Unique tool call identifier
    pub tool_call_id: String,
    /// Internal tool name (for debugging/logging)
    pub tool_name: String,
    /// Human-readable tool name
    pub display_name: String,
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_client_id: Option<String>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Message describing what the tool will do
    pub invocation_message: StringOrMarkdown,
    /// Raw tool input
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// Why the tool was cancelled
    pub reason: ToolCallCancellationReason,
    /// Optional message explaining the cancellation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason_message: Option<StringOrMarkdown>,
    /// What the user suggested doing instead
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_suggestion: Option<UserMessage>,
    /// The confirmation option the user selected, if confirmation options were provided
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_option: Option<ConfirmationOption>,
}

/// Describes a tool available in a session, provided by either the server or the active client.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDefinition {
    /// Unique tool identifier
    pub name: String,
    /// Human-readable display name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Description of what the tool does
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// JSON Schema defining the expected input parameters.
    ///
    /// Optional because client-provided tools may not have formal schemas.
    /// Mirrors MCP `Tool.inputSchema`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_schema: Option<AnyValue>,
    /// JSON Schema defining the structure of the tool's output.
    ///
    /// Mirrors MCP `Tool.outputSchema`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<AnyValue>,
    /// Behavioral hints about the tool. All properties are advisory.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<ToolAnnotations>,
    /// Additional provider-specific metadata.
    ///
    /// Mirrors the MCP `_meta` convention.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Behavioral hints about a tool. All properties are advisory and not
/// guaranteed to faithfully describe tool behavior.
///
/// Mirrors MCP `ToolAnnotations` from the Model Context Protocol specification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolAnnotations {
    /// Alternate human-readable title
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Tool does not modify its environment (default: false)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only_hint: Option<bool>,
    /// Tool may perform destructive updates (default: true)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub destructive_hint: Option<bool>,
    /// Repeated calls with the same arguments have no additional effect (default: false)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idempotent_hint: Option<bool>,
    /// Tool may interact with external entities (default: true)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open_world_hint: Option<bool>,
}

/// Text content in a tool result.
///
/// Mirrors MCP `TextContent`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultTextContent {
    /// The text content
    pub text: String,
}

/// Base64-encoded binary content embedded in a tool result.
///
/// Mirrors MCP `EmbeddedResource` for inline binary data.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultEmbeddedResourceContent {
    /// Base64-encoded data
    pub data: String,
    /// Content type (e.g. `"image/png"`, `"application/pdf"`)
    pub content_type: String,
}

/// A reference to a resource stored outside the tool result.
///
/// Wraps {@link ContentRef} for lazy-loading large results.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultResourceContent {
    /// Content URI
    pub uri: Uri,
    /// Approximate size in bytes
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_hint: Option<i64>,
    /// Content MIME type
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

/// Describes a file modification performed by a tool.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultFileEditContent {
    /// The file state before the edit. Absent for file creations or for in-place file edits.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<AnyValue>,
    /// The file state after the edit. Absent for file deletions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<AnyValue>,
    /// Optional diff display metadata
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<AnyValue>,
}

/// A reference to a terminal whose output is relevant to this tool result.
///
/// Clients can subscribe to the terminal's URI to stream its output in real
/// time, providing live feedback while a tool is executing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultTerminalContent {
    /// Terminal URI (subscribable for full terminal state)
    pub resource: Uri,
    /// Display title for the terminal content
    pub title: String,
}

/// A reference to a subagent session spawned by a tool.
///
/// Clients can subscribe to the subagent's session URI to stream its
/// progress in real time, including inner tool calls and responses.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultSubagentContent {
    /// Subagent session URI (subscribable for full session state)
    pub resource: Uri,
    /// Display title for the subagent
    pub title: String,
    /// Internal agent name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_name: Option<String>,
    /// Human-readable description of the subagent's task
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// A reference to an [Open Plugins](https://open-plugins.com/) plugin.
///
/// This is intentionally thin — AHP specifies plugin identity and metadata
/// but not implementation details, which are defined by the Open Plugins spec.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationRef {
    /// Plugin URI (e.g. an HTTPS URL or marketplace identifier)
    pub uri: Uri,
    /// Human-readable name
    pub display_name: String,
    /// Description of what the plugin provides
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Icons for the plugin
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Opaque version token for this customization.
    ///
    /// Clients SHOULD include a nonce with every customization they provide.
    /// Consumers can compare nonces to detect whether a customization has
    /// changed since it was last seen, avoiding redundant reloads or copies.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
}

/// A customization active in a session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCustomization {
    /// The plugin this customization refers to
    pub customization: CustomizationRef,
    /// Whether this customization is currently enabled
    pub enabled: bool,
    /// The `clientId` of the client that contributed this customization.
    /// Absent for server-provided customizations.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Server-reported loading status
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<CustomizationStatus>,
    /// Human-readable status detail (e.g. error message or degradation warning).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status_message: Option<String>,
}

/// Describes a file modification with before/after state and diff metadata.
///
/// Supports creates (only `after`), deletes (only `before`), renames/moves
/// (different `uri` in `before` and `after`), and edits (same `uri`, different content).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit {
    /// The file state before the edit. Absent for file creations or for in-place file edits.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<AnyValue>,
    /// The file state after the edit. Absent for file deletions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<AnyValue>,
    /// Optional diff display metadata
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<AnyValue>,
}

/// Lightweight terminal metadata exposed on the root state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    /// Terminal URI (subscribable for full terminal state)
    pub resource: Uri,
    /// Human-readable terminal title
    pub title: String,
    /// Who currently holds this terminal
    pub claim: TerminalClaim,
    /// Process exit code, if the terminal process has exited
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
}

/// A terminal claimed by a connected client.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalClientClaim {
    /// The `clientId` of the claiming client
    pub client_id: String,
}

/// A terminal claimed by a session, optionally scoped to a specific turn or tool call.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionClaim {
    /// Session URI that claimed the terminal
    pub session: Uri,
    /// Optional turn identifier within the session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    /// Optional tool call identifier within the turn
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// Full state for a single terminal, loaded when a client subscribes to the terminal's URI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalState {
    /// Human-readable terminal title
    pub title: String,
    /// Current working directory of the terminal process
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<Uri>,
    /// Terminal width in columns
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cols: Option<i64>,
    /// Terminal height in rows
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rows: Option<i64>,
    /// Typed content parts, replacing the flat `content: string`.
    ///
    /// Naive consumers that only need the raw VT stream can reconstruct it with:
    ///   `content.map(p => p.type === 'command' ? p.output : p.value).join('')`
    ///
    /// Consumers that need command boundaries can filter by part type.
    pub content: Vec<TerminalContentPart>,
    /// Process exit code, set when the terminal process exits
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
    /// Who currently holds this terminal
    pub claim: TerminalClaim,
    /// Whether this terminal emits `terminal/commandExecuted` and
    /// `terminal/commandFinished` actions and populates `command`-typed parts.
    ///
    /// Clients MUST check this flag before relying on command detection.
    /// Do NOT use the presence of a `command` part as a feature flag — parts
    /// are absent in the normal idle state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_command_detection: Option<bool>,
}

/// Unstructured terminal output — content before, between, or after commands,
/// or from terminals that do not support command detection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalUnclassifiedPart {
    /// Accumulated VT output. Appended to by `terminal/data` when no command is executing.
    pub value: String,
}

/// A single command: its command line and the output it produced.
///
/// While `isComplete` is false the command is still executing; `output` grows
/// as `terminal/data` actions arrive. At `terminal/commandFinished` the part
/// is mutated in-place with `isComplete: true` and the completion metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandPart {
    /// Stable id matching the `commandId` on the corresponding
    /// `terminal/commandExecuted` and `terminal/commandFinished` actions.
    pub command_id: String,
    /// The command line submitted to the shell.
    pub command_line: String,
    /// Accumulated VT output. Appended to by `terminal/data` while `isComplete`
    /// is false. Shell integration escape sequences are stripped by the server.
    pub output: String,
    /// Unix timestamp (ms) when execution started, as reported by the server.
    pub timestamp: i64,
    /// Whether the command has finished.
    pub is_complete: bool,
    /// Shell exit code. Set at completion. `undefined` if unknown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i64>,
    /// Wall-clock duration in milliseconds. Set at completion.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    /// Input tokens consumed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<i64>,
    /// Output tokens generated
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<i64>,
    /// Model used
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Tokens read from cache
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_read_tokens: Option<i64>,
    /// Additional provider-specific metadata for this usage report.
    /// Clients MAY look for well-known optional keys here to provide enhanced UI.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInfo {
    /// Error type identifier
    pub error_type: String,
    /// Human-readable error message
    pub message: String,
    /// Stack trace
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,
}

/// A point-in-time snapshot of a subscribed resource's state, returned by
/// `initialize`, `reconnect`, and `subscribe`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// The subscribed channel URI (e.g. `ahp-root://` or `ahp-session:/<uuid>`)
    pub resource: Uri,
    /// The current state of the resource
    pub state: SnapshotState,
    /// The `serverSeq` at which this snapshot was taken. Subsequent actions will have `serverSeq > fromSeq`.
    pub from_seq: i64,
}

/// Catalogue entry describing one changeset the server can produce for a
/// session.
///
/// Catalogue entries are intentionally lightweight — just enough to render a
/// chip or list row without subscribing. Full per-changeset detail
/// ({@link ChangesetState}) lives on the subscribable URI obtained by
/// expanding {@link uriTemplate}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetSummary {
    /// Human-readable label, e.g. `"Uncommitted Changes"`.
    pub label: String,
    /// RFC 6570 URI template. Clients parse the variables directly out of the
    /// template using the standard `{name}` syntax — they are not redeclared
    /// here.
    ///
    /// Only the following template shapes are defined by this protocol; any
    /// other variable name MUST be ignored by clients (there is no
    /// protocol-defined way to obtain values for unknown variables):
    ///
    /// | Variables in template                       | Meaning                                                                              |
    /// | ------------------------------------------- | ------------------------------------------------------------------------------------ |
    /// | _(none)_                                    | A static, session-wide changeset. The template is itself a subscribable URI.         |
    /// | `{turnId}`                                  | Per-turn slice. Expand with a `Turn.id` from the session.                            |
    /// | `{originalTurnId}` and `{modifiedTurnId}`   | Diff between two turns. Both variables MUST be present.                              |
    ///
    /// Future protocol versions MAY add new well-known variables.
    pub uri_template: String,
    /// Optional longer description.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Aggregate line additions across the changeset, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additions: Option<i64>,
    /// Aggregate line deletions across the changeset, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i64>,
    /// Number of files in the changeset, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files: Option<i64>,
}

/// Full state for a single changeset, returned when a client subscribes to
/// an expanded changeset URI.
///
/// The client already knows the URI it subscribed to, so this state does
/// not redundantly carry it (or the catalogue's `id`, `label`, etc.).
/// Aggregate counts (`additions`, `deletions`, `files`) are likewise
/// omitted: clients trivially compute them from `files[].edit.diff`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetState {
    /// Computation lifecycle.
    pub status: ChangesetStatus,
    /// Present iff `status === ChangesetStatus.Error`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
    /// Files in this changeset, keyed by {@link ChangesetFile.id}.
    pub files: Vec<ChangesetFile>,
    /// Operations the client may invoke against this changeset. Omit when no
    /// operations are available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub operations: Option<Vec<ChangesetOperation>>,
}

/// One file entry within a {@link ChangesetState}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetFile {
    /// Stable identifier within the changeset. Typically `after.uri`
    /// (or `before.uri` for deletions).
    pub id: String,
    /// Reuses the existing {@link FileEdit} shape. Clients derive line
    /// additions, deletions, and rename/create/delete semantics from this.
    pub edit: FileEdit,
    /// Server-defined opaque metadata, surfaced to operations and tooling
    /// but not interpreted by the protocol.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// A server-declared invokable verb the client can run against a
/// changeset, a file, or a range — `"stage"`, `"revert"`, `"create-pr"`,
/// and so on.
///
/// The term "operation" is used deliberately to avoid colliding with the
/// protocol-level [Actions](/guide/actions) that mutate state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetOperation {
    /// Stable identifier, unique within this changeset.
    pub id: String,
    /// Human-readable button/menu label.
    pub label: String,
    /// Optional longer description shown on hover or in tooltips.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Where this operation can be invoked.
    pub scopes: Vec<ChangesetOperationScope>,
    /// Optional confirmation prompt to show before invoking. When present,
    /// the client MUST display this message to the user (typically in a
    /// confirmation dialog) and only invoke the operation after the user
    /// accepts. The presence of this field also signals that the operation
    /// is destructive — clients SHOULD style the affirmative button
    /// accordingly (e.g. with a warning colour).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation: Option<StringOrMarkdown>,
    /// Optional generic icon hint, e.g. `"check"`, `"trash"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

// ─── Discriminated Unions ─────────────────────────────────────────────

/// A single part of a response stream (text, tool call, reasoning, content reference).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ResponsePart {
    #[serde(rename = "markdown")]
    Markdown(MarkdownResponsePart),
    #[serde(rename = "contentRef")]
    ContentRef(ResourceResponsePart),
    #[serde(rename = "toolCall")]
    ToolCall(Box<ToolCallResponsePart>),
    #[serde(rename = "reasoning")]
    Reasoning(ReasoningResponsePart),
    #[serde(rename = "systemNotification")]
    SystemNotification(SystemNotificationResponsePart),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Full tool call lifecycle state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum ToolCallState {
    #[serde(rename = "streaming")]
    Streaming(ToolCallStreamingState),
    #[serde(rename = "pending-confirmation")]
    PendingConfirmation(ToolCallPendingConfirmationState),
    #[serde(rename = "running")]
    Running(ToolCallRunningState),
    #[serde(rename = "pending-result-confirmation")]
    PendingResultConfirmation(ToolCallPendingResultConfirmationState),
    #[serde(rename = "completed")]
    Completed(ToolCallCompletedState),
    #[serde(rename = "cancelled")]
    Cancelled(ToolCallCancelledState),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Who currently holds a terminal.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum TerminalClaim {
    #[serde(rename = "client")]
    Client(TerminalClientClaim),
    #[serde(rename = "session")]
    Session(TerminalSessionClaim),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// A content part within terminal output.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TerminalContentPart {
    #[serde(rename = "unclassified")]
    Unclassified(TerminalUnclassifiedPart),
    #[serde(rename = "command")]
    Command(TerminalCommandPart),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// One question within a session input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum SessionInputQuestion {
    #[serde(rename = "text")]
    Text(SessionInputTextQuestion),
    #[serde(rename = "number")]
    Number(SessionInputNumberQuestion),
    #[serde(rename = "integer")]
    Integer(SessionInputNumberQuestion),
    #[serde(rename = "boolean")]
    Boolean(SessionInputBooleanQuestion),
    #[serde(rename = "single-select")]
    SingleSelect(SessionInputSingleSelectQuestion),
    #[serde(rename = "multi-select")]
    MultiSelect(SessionInputMultiSelectQuestion),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Value captured for one answer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum SessionInputAnswerValue {
    #[serde(rename = "text")]
    Text(SessionInputTextAnswerValue),
    #[serde(rename = "number")]
    Number(SessionInputNumberAnswerValue),
    #[serde(rename = "boolean")]
    Boolean(SessionInputBooleanAnswerValue),
    #[serde(rename = "selected")]
    Selected(SessionInputSelectedAnswerValue),
    #[serde(rename = "selected-many")]
    SelectedMany(SessionInputSelectedManyAnswerValue),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Draft, submitted, or skipped answer for one question.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state")]
pub enum SessionInputAnswer {
    #[serde(rename = "draft")]
    Draft(SessionInputAnswered),
    #[serde(rename = "submitted")]
    Submitted(SessionInputAnswered),
    #[serde(rename = "skipped")]
    Skipped(SessionInputSkipped),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Content block in a tool result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ToolResultContent {
    #[serde(rename = "text")]
    Text(ToolResultTextContent),
    #[serde(rename = "embeddedResource")]
    EmbeddedResource(ToolResultEmbeddedResourceContent),
    #[serde(rename = "resource")]
    Resource(ToolResultResourceContent),
    #[serde(rename = "fileEdit")]
    FileEdit(ToolResultFileEditContent),
    #[serde(rename = "terminal")]
    Terminal(ToolResultTerminalContent),
    #[serde(rename = "subagent")]
    Subagent(ToolResultSubagentContent),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// An attachment associated with a `UserMessage`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MessageAttachment {
    #[serde(rename = "simple")]
    Simple(SimpleMessageAttachment),
    #[serde(rename = "embeddedResource")]
    EmbeddedResource(MessageEmbeddedResourceAttachment),
    #[serde(rename = "resource")]
    Resource(MessageResourceAttachment),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// The state payload of a snapshot — root, session, terminal, or
/// changeset state.
///
/// Deserialized by trying session first (has required `summary`), then
/// terminal (has required `content`), then changeset (has required
/// `status` and `files`), then root.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SnapshotState {
    Session(Box<SessionState>),
    Terminal(Box<TerminalState>),
    Changeset(Box<ChangesetState>),
    Root(Box<RootState>),
}
