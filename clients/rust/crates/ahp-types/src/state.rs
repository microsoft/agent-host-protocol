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
///
/// Wire form: a bare `u32` bitset. Unknown/forward-compat bits are
/// preserved across a decode→encode round-trip.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(transparent)]
pub struct SessionStatus(pub u32);

#[allow(non_upper_case_globals)]
impl SessionStatus {
    /// Session is idle — no turn is active.
    pub const Idle: SessionStatus = SessionStatus(1);
    /// Session ended with an error.
    pub const Error: SessionStatus = SessionStatus(2);
    /// A turn is actively streaming.
    pub const InProgress: SessionStatus = SessionStatus(8);
    /// A turn is in progress but blocked waiting for user input or tool confirmation.
    pub const InputNeeded: SessionStatus = SessionStatus(24);
    /// The client has viewed this session since its last modification.
    pub const IsRead: SessionStatus = SessionStatus(32);
    /// The session has been archived by the client.
    pub const IsArchived: SessionStatus = SessionStatus(64);

    /// The raw `u32` bitset value (every set bit, known or not).
    #[inline]
    pub const fn bits(self) -> u32 {
        self.0
    }

    /// Wrap a raw `u32` bitset value, preserving every bit verbatim.
    #[inline]
    pub const fn from_bits(bits: u32) -> Self {
        SessionStatus(bits)
    }

    /// True when every bit set in `other` is also set in `self`.
    #[inline]
    pub const fn contains(self, other: SessionStatus) -> bool {
        (self.0 & other.0) == other.0
    }
}

impl From<u32> for SessionStatus {
    #[inline]
    fn from(value: u32) -> Self {
        SessionStatus(value)
    }
}

impl From<SessionStatus> for u32 {
    #[inline]
    fn from(value: SessionStatus) -> Self {
        value.0
    }
}

impl std::ops::BitOr for SessionStatus {
    type Output = SessionStatus;
    #[inline]
    fn bitor(self, rhs: SessionStatus) -> SessionStatus {
        SessionStatus(self.0 | rhs.0)
    }
}

impl std::ops::BitOrAssign for SessionStatus {
    #[inline]
    fn bitor_assign(&mut self, rhs: SessionStatus) {
        self.0 |= rhs.0;
    }
}

impl std::ops::BitAnd for SessionStatus {
    type Output = SessionStatus;
    #[inline]
    fn bitand(self, rhs: SessionStatus) -> SessionStatus {
        SessionStatus(self.0 & rhs.0)
    }
}

impl std::ops::Not for SessionStatus {
    type Output = SessionStatus;
    #[inline]
    fn not(self) -> SessionStatus {
        SessionStatus(!self.0)
    }
}

/// Discriminant for {@link ChatOrigin} — how a chat came into existence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChatOriginKind {
    /// User created the chat explicitly (e.g. via the host UI).
    #[serde(rename = "user")]
    User,
    /// Forked from an existing chat at a specific turn.
    #[serde(rename = "fork")]
    Fork,
    /// Spawned by a tool call running in another chat (e.g. a sub-agent delegation).
    #[serde(rename = "tool")]
    Tool,
}

/// How a user can interact with a chat.
///
/// - `Full` — user can send messages and watch (default when absent)
/// - `ReadOnly` — user can watch but not send messages (e.g. agent team workers)
/// - `Hidden` — internal worker not shown in UI at all
///
/// Supports the agent-team pattern where a lead chat is fully interactive and
/// worker chats are read-only (visible for observability) or hidden (internal
/// implementation detail). The harness sets this based on the chat's role;
/// the UI uses it to show appropriate controls.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChatInteractivity {
    /// User can send messages and watch (default when absent)
    #[serde(rename = "full")]
    Full,
    /// User can watch but not send messages
    #[serde(rename = "read-only")]
    ReadOnly,
    /// Internal worker not shown in UI at all
    #[serde(rename = "hidden")]
    Hidden,
}

/// Answer lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChatInputAnswerState {
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "submitted")]
    Submitted,
    #[serde(rename = "skipped")]
    Skipped,
}

/// Answer value kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChatInputAnswerValueKind {
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
pub enum ChatInputQuestionKind {
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
pub enum ChatInputResponseKind {
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

/// Discriminant for {@link MessageOrigin} — identifies who produced a message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MessageKind {
    /// Sent directly by the user.
    #[serde(rename = "user")]
    User,
    /// Produced by the agent itself rather than the user — for example, an agent
    /// that seeds the first message of a chat it spawned.
    #[serde(rename = "agent")]
    Agent,
    /// Produced by a tool rather than the user — for example, a tool that spawns a
    /// worker chat whose first message carries a seed prompt.
    #[serde(rename = "tool")]
    Tool,
    /// A system-generated notification rather than a direct user message.
    #[serde(rename = "systemNotification")]
    SystemNotification,
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
    /// An attachment that references annotations on an annotations channel.
    #[serde(rename = "annotations")]
    Annotations,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ToolCallContributorKind {
    #[serde(rename = "client")]
    Client,
    #[serde(rename = "mcp")]
    MCP,
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

/// Discriminant for the kind of customization.
///
/// Top-level entries in {@link SessionState.customizations} and
/// {@link AgentInfo.customizations} are either container customizations
/// ({@link CustomizationType.Plugin | `Plugin`} or
/// {@link CustomizationType.Directory | `Directory`}) or
/// {@link CustomizationType.McpServer | `McpServer`} entries surfaced
/// directly by the host. The remaining types appear only as children of
/// a container.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CustomizationType {
    #[serde(rename = "plugin")]
    Plugin,
    #[serde(rename = "directory")]
    Directory,
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "skill")]
    Skill,
    #[serde(rename = "prompt")]
    Prompt,
    #[serde(rename = "rule")]
    Rule,
    #[serde(rename = "hook")]
    Hook,
    #[serde(rename = "mcpServer")]
    McpServer,
}

/// Discriminant values for {@link CustomizationLoadState}.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CustomizationLoadStatus {
    #[serde(rename = "loading")]
    Loading,
    #[serde(rename = "loaded")]
    Loaded,
    #[serde(rename = "degraded")]
    Degraded,
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

/// Discriminant for the {@link McpServerState} union.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum McpServerStatus {
    /// Server has been registered but is not yet running.
    #[serde(rename = "starting")]
    Starting,
    /// Server is running and serving requests.
    #[serde(rename = "ready")]
    Ready,
    /// Server is reachable but requires additional authentication before it
    /// can start, or before it can serve a particular request. Carries the
    /// RFC 9728 Protected Resource Metadata the client needs to obtain a
    /// token; the client then pushes the token via the existing
    /// `authenticate` command.
    #[serde(rename = "authRequired")]
    AuthRequired,
    /// Server failed to start, crashed, or otherwise transitioned to a fatal error.
    #[serde(rename = "error")]
    Error,
    /// Server has been shut down.
    #[serde(rename = "stopped")]
    Stopped,
}

/// Why an MCP server is currently in the {@link McpServerStatus.AuthRequired}
/// state. Mirrors the three failure modes defined by the
/// [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum McpAuthRequiredReason {
    /// No token has been provided yet (HTTP 401, no prior token).
    #[serde(rename = "required")]
    Required,
    /// A previously valid token expired or was revoked (HTTP 401).
    #[serde(rename = "expired")]
    Expired,
    /// Step-up auth: a token is present but its scopes are insufficient for
    /// the requested operation (HTTP 403 with
    /// `WWW-Authenticate: Bearer error="insufficient_scope"`).
    ///
    /// Unlike {@link Required} and {@link Expired} — which typically surface
    /// before any tool work is in flight — `InsufficientScope` is almost
    /// always triggered by an MCP request issued mid-turn (a `tools/call`,
    /// `resources/read`, etc.). The host SHOULD pair the
    /// {@link McpServerAuthRequiredState} transition with
    /// {@link SessionStatus.InputNeeded} on
    /// {@link SessionSummary.status | the session} so the activity becomes
    /// visible at the session-summary level, and clients SHOULD watch for
    /// this kind on any
    /// {@link McpServerCustomization | MCP server} backing a running tool
    /// call so they can present an explicit "grant more access" affordance
    /// tied to the blocked tool call.
    #[serde(rename = "insufficientScope")]
    InsufficientScope,
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

/// Execution lifecycle of a {@link ChangesetOperation}.
///
/// An operation is invoked imperatively via `invokeChangesetOperation`, but
/// its progress and outcome are reflected back into changeset state so that
/// every subscriber observes a consistent view (e.g. a spinner on a "Create
/// Pull Request" button, or an inline error after a failed "revert").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ChangesetOperationStatus {
    /// The operation is ready to be invoked. This is the default when
    /// {@link ChangesetOperation.status} is omitted.
    #[serde(rename = "idle")]
    Idle,
    /// An invocation of this operation is currently in flight.
    #[serde(rename = "running")]
    Running,
    /// The most recent invocation failed. The cause is described by
    /// {@link ChangesetOperation.error}.
    #[serde(rename = "error")]
    Error,
    /// The operation is currently disabled and cannot be invoked.
    #[serde(rename = "disabled")]
    Disabled,
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

/// Discriminant for {@link ResourceChange.type}.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ResourceChangeType {
    #[serde(rename = "added")]
    Added,
    #[serde(rename = "updated")]
    Updated,
    #[serde(rename = "deleted")]
    Deleted,
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
    /// Additional implementation-defined metadata about the agent host itself.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
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
    /// Customizations associated with this agent.
    ///
    /// Either container customizations —
    /// {@link PluginCustomization | `PluginCustomization`} entries the agent
    /// bundles, plus {@link DirectoryCustomization | `DirectoryCustomization`}
    /// entries it watches in any workspace it's used with — or top-level
    /// {@link McpServerCustomization | `McpServerCustomization`} entries
    /// the agent host declares directly. When a session is created with
    /// this agent, these entries are augmented (e.g. directory URIs are
    /// resolved against the workspace, children are parsed) and propagated
    /// into the session's `customizations` list.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customizations: Option<Vec<Customization>>,
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
    /// Maximum number of output tokens the model can generate
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<i64>,
    /// Maximum number of prompt (input) tokens the model accepts
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_prompt_tokens: Option<i64>,
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
    /// Model-specific configuration values. Values are JSON primitives: most
    /// pickers produce strings, but some (e.g. a numeric context-size picker)
    /// produce numbers or booleans, which are carried through as-is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<std::collections::HashMap<String, AnyValue>>,
}

/// A selected custom agent for a session.
///
/// The `uri` identifies a specific custom agent (matching an
/// {@link AgentCustomization.uri | `AgentCustomization.uri`} exposed via
/// the session's effective customizations). Consumers resolve the agent's
/// display name by looking up `uri` in the session's customization tree.
///
/// A message with no `agent` selected uses the provider's default behavior.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSelection {
    /// Stable agent URI (matches an {@link AgentCustomization.uri}).
    pub uri: Uri,
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
    /// JSON Schema: allowed values. May be primitives of any JSON type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#enum: Option<Vec<AnyValue>>,
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
    /// JSON Schema: schema for additional properties not listed in `properties` (used when `type` is `'object'`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additional_properties: Option<Box<ConfigPropertySchema>>,
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
    /// The message that will start the next turn
    pub message: Message,
}

/// Full state for a single chat, loaded when a client subscribes to the chat's
/// URI.
///
/// The lightweight catalog representation of a chat is {@link ChatSummary},
/// carried in {@link SessionState.chats | `SessionState.chats`}. `ChatState`
/// **denormalizes** every {@link ChatSummary} field directly onto itself so
/// subscribers receive one flat object instead of having to merge a nested
/// `summary` sub-object. Producers MUST keep the two representations
/// consistent: any change to the inlined fields below SHOULD also be
/// announced on the parent session via the matching
/// {@link SessionChatUpdatedAction | `session/chatUpdated`} action.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatState {
    /// Chat URI
    pub resource: Uri,
    /// Chat title
    pub title: String,
    /// Current chat status (reuses SessionStatus shape)
    pub status: u32,
    /// Human-readable description of what the chat is currently doing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    pub modified_at: String,
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
    /// {@link SessionState.workingDirectory | the session's working directory}.
    /// Hosts MAY override this for individual chats — for example, to give a
    /// subordinate chat its own git worktree so multiple chats in a session can
    /// make independent edits that the orchestrator later merges back.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
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
    /// Requests for user input that are currently blocking or informing chat progress
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_requests: Option<Vec<ChatInputRequest>>,
    /// The user's in-progress draft input for this chat — the message they are
    /// composing but have not sent yet, including its
    /// {@link Message.model | model} / {@link Message.agent | agent} selection
    /// and attachments.
    ///
    /// Clients MAY periodically sync their local input state into this field so
    /// a draft survives reloads and is visible to other clients viewing the same
    /// chat. Eager syncing is **not** required — clients SHOULD debounce and MAY
    /// sync only at convenient points. When presenting input UI for an existing
    /// chat, clients SHOULD use any `draft` to initialize their input state.
    /// Cleared (set to `undefined`) once the message is sent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub draft: Option<Message>,
    /// Additional provider-specific metadata for this chat.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Lightweight catalog entry for a chat, carried in
/// {@link SessionState.chats | `SessionState.chats`}. The full conversation
/// lives in {@link ChatState}, which inlines (denormalizes) every field below.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummary {
    /// Chat URI
    pub resource: Uri,
    /// Chat title
    pub title: String,
    /// Current chat status (reuses SessionStatus shape)
    pub status: u32,
    /// Human-readable description of what the chat is currently doing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    pub modified_at: String,
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

/// Full state for a single session, loaded when a client subscribes to the session's URI.
///
/// Inlines (denormalizes) every {@link SessionMetadata} field directly onto
/// itself so subscribers receive one flat object instead of a nested summary.
/// The lightweight catalog representation is {@link SessionSummary}, surfaced on
/// the root channel; the host keeps the two in sync via
/// `root/sessionSummaryChanged`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    /// Agent provider ID
    pub provider: String,
    /// Session title
    pub title: String,
    /// Current session status
    pub status: u32,
    /// Human-readable description of what the session is currently doing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Server-owned project for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectInfo>,
    /// The default working directory URI for this session. Individual chats
    /// MAY override via {@link ChatSummary.workingDirectory | their own
    /// `workingDirectory`}; this field acts as the fallback for any chat that
    /// does not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<AnnotationsSummary>,
    /// Session initialization state
    pub lifecycle: SessionLifecycle,
    /// Error details if creation failed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creation_error: Option<ErrorInfo>,
    /// Tools provided by the server (agent host) for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_tools: Option<Vec<ToolDefinition>>,
    /// The clients currently providing tools and interactive capabilities to this
    /// session. If multiple tools or customizations are provided by the same
    /// active client, an agent host MAY deduplicate them when exposed to a model,
    /// with a preference given to the client that started the turn.
    ///
    /// Membership is host-managed: clients add (or refresh) themselves with
    /// `session/activeClientSet`, and the host removes them with
    /// `session/activeClientRemoved` when they unsubscribe, disconnect without
    /// reconnecting in time, or reconnect without resubscribing to the session.
    pub active_clients: Vec<SessionActiveClient>,
    /// Catalog of chats in this session.
    pub chats: Vec<ChatSummary>,
    /// The chat that receives input when the user addresses the session without
    /// selecting a specific chat. This is a UI routing hint, not a hierarchy
    /// marker — chats remain equal peers at the protocol level. Hosts MAY change
    /// this over the session's lifetime.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_chat: Option<Uri>,
    /// Session configuration schema and current values
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<SessionConfigState>,
    /// Top-level customizations active in this session.
    ///
    /// Always one of the {@link Customization} variants:
    ///
    /// - Container customizations ({@link PluginCustomization},
    ///   {@link DirectoryCustomization}) whose children — agents, skills,
    ///   prompts, rules, hooks, MCP servers — live in each container's
    ///   {@link ContainerCustomizationBase.children | `children`} array.
    /// - Top-level {@link McpServerCustomization} entries the host
    ///   surfaces directly (for example a globally-configured MCP server
    ///   that isn't bundled in a plugin or directory). MCP servers may
    ///   also appear as children of a container.
    ///
    /// Client-published plugins arrive via
    /// {@link SessionActiveClient.customizations | `activeClients[].customizations`}
    /// and the host propagates them into this list (typically with the
    /// container's `clientId` set and `children` populated). Clients
    /// publish in container shape only; bare MCP servers at the top level
    /// are server-originated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customizations: Option<Vec<Customization>>,
    /// Catalogue of changesets the server can produce for this session. Each
    /// entry advertises a subscribable view of file changes (uncommitted,
    /// session-wide, per-turn, etc.) and the URI template the client expands
    /// before subscribing. See {@link Changeset} for the full shape and
    /// {@link /guide/changesets | Changesets} for an overview of the model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changesets: Option<Vec<Changeset>>,
    /// Additional provider-specific metadata for this session.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `git` key may provide extra git metadata about the session's
    /// workingDirectory.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// A client currently providing tools and interactive capabilities to a session.
///
/// A session MAY have several active clients at once; entries in
/// {@link SessionState.activeClients} are keyed by `clientId`. The server SHOULD
/// automatically remove an active client when that client disconnects.
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
    /// Plugin customizations this client contributes to the session.
    ///
    /// Clients publish in [Open Plugins](https://open-plugins.com/) format
    /// — i.e. always container-shaped plugins. They MAY synthesize virtual
    /// plugins in memory and rely on the host to expand them into concrete
    /// children inside {@link SessionState.customizations}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customizations: Option<Vec<ClientPluginCustomization>>,
}

/// Lightweight catalog entry summarizing one session. Surfaced via
/// {@link RootChannelCommands.listSessions | `root/listSessions`} and
/// `root/sessionAdded`/`root/sessionSummaryChanged` notifications.
///
/// **Aggregation across chats.** Once a session contains more than one chat,
/// several `SessionSummary` fields are derived from the underlying
/// {@link SessionState.chats | chat catalog}. Producers SHOULD follow these
/// rules so clients that only consume the session summary (e.g. a session
/// list) still see meaningful state:
///
/// - `status`: take the activity bits (`Idle` / `InProgress` / `InputNeeded` /
///   `Error` — bits 0–4) from the
///   {@link SessionState.defaultChat | default chat} when present, else from
///   the most recently modified chat. **Promote** `InputNeeded` whenever any
///   chat in the session needs input, and **promote** `Error` whenever any
///   chat is in an error state — both override the default-chat bits. The
///   orthogonal flag bits (`IsRead`, `IsArchived`) remain session-scoped.
/// - `activity`: mirror the activity string of the default chat, or of the
///   chat currently driving the promoted status bits when a non-default chat
///   wins (e.g. the chat that raised `InputNeeded`).
/// - `modifiedAt`: the max of all chats' `modifiedAt`.
/// - `workingDirectory`: the session-level **default**. Individual chats MAY
///   override via {@link ChatSummary.workingDirectory}; aggregating these up
///   is meaningless and SHOULD NOT be attempted.
/// - `changes`: optional roll-up across all chats. Producers MAY sum the
///   per-chat changeset stats or report the most expensive chat's stats —
///   whichever is cheaper for the host to compute.
///
/// Sessions with a single chat trivially satisfy all of the above (the chat's
/// values pass through unchanged). The rules only matter once a session
/// carries multiple chats.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    /// Agent provider ID
    pub provider: String,
    /// Session title
    pub title: String,
    /// Current session status
    pub status: u32,
    /// Human-readable description of what the session is currently doing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Server-owned project for this session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectInfo>,
    /// The default working directory URI for this session. Individual chats
    /// MAY override via {@link ChatSummary.workingDirectory | their own
    /// `workingDirectory`}; this field acts as the fallback for any chat that
    /// does not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<AnnotationsSummary>,
    /// Session URI
    pub resource: Uri,
    /// Creation timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    pub created_at: String,
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    pub modified_at: String,
    /// Aggregate summary of file changes associated with this session. Servers
    /// may populate this to give clients a quick at-a-glance view of the
    /// session's footprint (e.g., for list rendering) without requiring the
    /// client to subscribe to a changeset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changes: Option<ChangesSummary>,
    /// Lightweight server-defined metadata clients may use for the session
    /// presentation. The protocol does not interpret these values; producers
    /// SHOULD keep the payload small because summaries appear in session lists
    /// and session notifications.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Aggregate counts describing the file changes associated with a session.
///
/// All fields are optional so servers can populate only the metrics they
/// cheaply have available.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChangesSummary {
    /// Total number of inserted lines across all changed files.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additions: Option<i64>,
    /// Total number of deleted lines across all changed files.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i64>,
    /// Number of files that have changes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files: Option<i64>,
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
    /// JSON Schema: allowed values. May be primitives of any JSON type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r#enum: Option<Vec<AnyValue>>,
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
    /// JSON Schema: schema for additional properties not listed in `properties` (used when `type` is `'object'`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additional_properties: Option<ConfigPropertySchema>,
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
    /// The message that initiated the turn
    pub message: Message,
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
    /// The message that initiated the turn
    pub message: Message,
    /// All response content in stream order: text, tool calls, reasoning, and content refs.
    ///
    /// Tool call parts include `pendingPermissions` when permissions are awaiting user approval.
    pub response_parts: Vec<ResponsePart>,
    /// Token usage info
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageInfo>,
}

/// A message that initiates or steers a turn. Messages can originate from the
/// user, the agent, a tool, or be system-generated (see {@link MessageOrigin}).
///
/// Attachments MAY be referenced inside {@link Message.text} via their
/// {@link MessageAttachmentBase.range} field. Attachments without a range are
/// still associated with the message but do not correspond to a specific span
/// in the text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    /// Message text
    pub text: String,
    /// The origin of the message
    pub origin: MessageOrigin,
    /// File/selection attachments
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<MessageAttachment>>,
    /// The model this message was, or will be, sent with.
    ///
    /// For historic user/agent messages this records the model actually used, so
    /// a client editing or resending the message can retain that selection. For a
    /// {@link ChatState.draft | draft} it carries the model the user picked for
    /// the message they are composing. Absent means the agent host's default
    /// model applies.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelSelection>,
    /// The custom agent this message was, or will be, sent with.
    ///
    /// For historic messages this records the agent actually used; for a
    /// {@link ChatState.draft | draft} it carries the agent the user picked.
    /// Absent means no custom agent — the provider's default behavior applies.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentSelection>,
    /// Additional provider-specific metadata for this message.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry context that does not fit any other
    /// field. Mirrors the MCP `_meta` convention.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Identifies the origin of a {@link Message} — who produced it. For the message
/// that initiates a turn ({@link Turn.message}), this is also the origin of the
/// turn; for steering or queued messages it is just the origin of that message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageOrigin {
    /// The kind of actor that produced the message.
    pub kind: MessageKind,
}

/// A choice in a select-style question.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputOption {
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
pub struct ChatInputTextAnswerValue {
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputNumberAnswerValue {
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputBooleanAnswerValue {
    pub value: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputSelectedAnswerValue {
    pub value: String,
    /// Free-form text entered instead of selecting an option
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freeform_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputSelectedManyAnswerValue {
    pub value: Vec<String>,
    /// Free-form text entered in addition to selected options
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freeform_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputAnswered {
    /// Answer value
    pub value: ChatInputAnswerValue,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputSkipped {
    /// Free-form reason or value captured while skipping, if any
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freeform_values: Option<Vec<String>>,
}

/// Text question within a chat input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputTextQuestion {
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

/// Numeric question within a chat input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputNumberQuestion {
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

/// Boolean question within a chat input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputBooleanQuestion {
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

/// Single-select question within a chat input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputSingleSelectQuestion {
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
    pub options: Vec<ChatInputOption>,
    /// Whether the user may enter text instead of selecting an option
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allow_freeform_input: Option<bool>,
}

/// Multi-select question within a chat input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputMultiSelectQuestion {
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
    pub options: Vec<ChatInputOption>,
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
/// The server creates or replaces requests with `chat/inputRequested`.
/// Clients sync drafts with `chat/inputAnswerChanged` and complete requests
/// with `chat/inputCompleted`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputRequest {
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
    pub questions: Option<Vec<ChatInputQuestion>>,
    /// Current draft or submitted answers, keyed by question ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answers: Option<std::collections::HashMap<String, ChatInputAnswer>>,
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
    /// If defined, the range in {@link Message.text} that references this
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
    /// If defined, the range in {@link Message.text} that references this
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
    /// If defined, the range in {@link Message.text} that references this
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

/// An attachment that references annotations on a session's annotations
/// channel (see {@link AnnotationsState}).
///
/// When {@link annotationIds} is omitted the attachment references every
/// annotation on the channel; when present it references only the listed
/// {@link Annotation.id | annotation ids}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageAnnotationsAttachment {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    pub label: String,
    /// If defined, the range in {@link Message.text} that references this
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
    /// The annotations channel URI (typically `ahp-session:/<uuid>/annotations`).
    /// Matches {@link AnnotationsSummary.resource}.
    pub resource: Uri,
    /// Specific {@link Annotation.id | annotation ids} to reference. When
    /// omitted, the attachment references all annotations on the channel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotation_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownResponsePart {
    /// Part identifier, used by `chat/delta` to target this part for content appends
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
    /// Part identifier, used by `chat/reasoning` to target this part for content appends
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
    /// Human-readable description of what the tool invocation intends to do
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intention: Option<String>,
    /// Reference to the contributor of the tool being called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contributor: Option<ToolCallContributor>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
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
    /// Human-readable description of what the tool invocation intends to do
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intention: Option<String>,
    /// Reference to the contributor of the tool being called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contributor: Option<ToolCallContributor>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
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
    /// Human-readable description of what the tool invocation intends to do
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intention: Option<String>,
    /// Reference to the contributor of the tool being called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contributor: Option<ToolCallContributor>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
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
    /// Human-readable description of what the tool invocation intends to do
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intention: Option<String>,
    /// Reference to the contributor of the tool being called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contributor: Option<ToolCallContributor>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
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
    /// Human-readable description of what the tool invocation intends to do
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intention: Option<String>,
    /// Reference to the contributor of the tool being called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contributor: Option<ToolCallContributor>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
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
    /// Human-readable description of what the tool invocation intends to do
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intention: Option<String>,
    /// Reference to the contributor of the tool being called.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contributor: Option<ToolCallContributor>,
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
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
    pub user_suggestion: Option<Message>,
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

/// A reference, embedded in a tool result, to a worker chat spawned by the tool
/// call (a sub-agent delegation), referenced by a chat URI (`ahp-chat:/...`).
///
/// This is the spawning tool call's forward view of the worker. The worker chat
/// records the same edge in reverse via its {@link ChatOrigin} (`kind: 'tool'`),
/// whose `toolCallId` identifies the tool call that emitted this content.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultSubagentContent {
    /// Worker chat URI (subscribable for full chat state)
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

/// Container is being loaded by the host.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationLoadingState {}

/// Container loaded successfully.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationLoadedState {}

/// Container partially loaded but has warnings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationDegradedState {
    /// Human-readable description of the warning.
    pub message: String,
}

/// Container failed to load.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationErrorState {
    /// Human-readable error message.
    pub message: String,
}

/// An [Open Plugins](https://open-plugins.com/) plugin.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Whether this container is currently enabled.
    pub enabled: bool,
    /// `clientId` of the client that contributed this container. Absent for
    /// server-originated entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Host-reported load state. Absent means the host has not yet reported
    /// a load state for this container.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub load: Option<CustomizationLoadState>,
    /// Children discovered inside this container.
    ///
    /// Absent means the host has not parsed this container yet. An empty
    /// array means the host parsed the container and it contributes
    /// nothing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ChildCustomization>>,
}

/// A {@link PluginCustomization} as published by a client. Extends the
/// server-facing shape with an opaque `nonce` so the host can detect when
/// the client's view of a plugin has changed and re-parse only as needed.
///
/// Clients SHOULD include a `nonce`. Server-side fields like
/// {@link ContainerCustomizationBase.children | `children`} and
/// {@link ContainerCustomizationBase.load | `load`} are typically left
/// absent on publication and populated by the host when the resolved
/// plugin appears in {@link SessionState.customizations}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientPluginCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Whether this container is currently enabled.
    pub enabled: bool,
    /// `clientId` of the client that contributed this container. Absent for
    /// server-originated entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Host-reported load state. Absent means the host has not yet reported
    /// a load state for this container.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub load: Option<CustomizationLoadState>,
    /// Children discovered inside this container.
    ///
    /// Absent means the host has not parsed this container yet. An empty
    /// array means the host parsed the container and it contributes
    /// nothing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ChildCustomization>>,
    /// Opaque version token used by the host to detect changes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nonce: Option<String>,
}

/// A directory the host watches for this session.
///
/// Presence in the customization list signals that the host may discover
/// customizations from this directory. When `writable` is `true`, clients
/// MAY persist new customizations into the directory using
/// [`resourceWrite`](/reference/common#resourcewrite); the host will
/// then surface the resulting child via the customization actions.
///
/// The directory may not yet exist on disk.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Whether this container is currently enabled.
    pub enabled: bool,
    /// `clientId` of the client that contributed this container. Absent for
    /// server-originated entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Host-reported load state. Absent means the host has not yet reported
    /// a load state for this container.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub load: Option<CustomizationLoadState>,
    /// Children discovered inside this container.
    ///
    /// Absent means the host has not parsed this container yet. An empty
    /// array means the host parsed the container and it contributes
    /// nothing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ChildCustomization>>,
    /// Which child customization type this directory holds.
    pub contents: CustomizationType,
    /// Whether clients may write into this directory.
    pub writable: bool,
}

/// A custom agent contributed by a plugin or directory.
///
/// Mirrors the [Open Plugins agent](https://open-plugins.com/agent-builders/components/agents)
/// format: a markdown file with YAML frontmatter, where the body is the
/// agent's system prompt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Short description of what the agent specializes in and when to
    /// invoke it. Sourced from the agent file's frontmatter `description`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Additional provider-specific metadata for this custom agent.
    ///
    /// Mirrors the MCP `_meta` convention.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// A skill contributed by a plugin or directory.
///
/// Covers both [Open Plugins skill formats](https://open-plugins.com/agent-builders/components/skills)
/// — the `skills/` directory layout (one subdirectory per skill, each with
/// a `SKILL.md`) and the flatter `commands/` directory of slash-command
/// skills.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Short description used for help text and auto-invocation matching.
    /// Sourced from the skill's frontmatter `description`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// When `true`, only the user can invoke this skill — the agent will not
    /// auto-invoke it. Sourced from the command skill's frontmatter
    /// `disable-model-invocation` flag.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disable_model_invocation: Option<bool>,
}

/// A prompt contributed by a plugin or directory.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Short description of what the prompt does.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// A rule contributed by a plugin or directory.
///
/// Mirrors the [Open Plugins rule](https://open-plugins.com/agent-builders/components/rules)
/// format: a markdown file (e.g. `.mdc`) whose body is injected into
/// context while the rule is active. This type also covers tool-specific
/// "instruction" formats (e.g. VS Code Copilot's
/// `.github/instructions/*.md`), which differ only in naming — they
/// share the same semantics of `description`, optional always-on
/// activation, and optional glob scoping.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Description of what the rule enforces.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// When `true`, the rule is always active (subject to `globs` if any).
    /// When `false` or absent, the agent or user decides whether to apply
    /// the rule.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub always_apply: Option<bool>,
    /// Glob patterns the rule applies to. When present, the rule is only
    /// active for matching files.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub globs: Option<Vec<String>>,
}

/// A hook manifest contributed by a plugin or directory.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
}

/// An MCP server contributed by a plugin or directory.
///
/// When the server is declared inline in the containing plugin manifest,
/// `uri` points at the manifest file and
/// {@link CustomizationBase.range | `range`} narrows it to the
/// declaration's span.
///
/// The MCP server customization also reflects its current status.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerCustomization {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    pub id: String,
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    pub uri: Uri,
    /// Human-readable name.
    pub name: String,
    /// Icons for UI display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icons: Option<Vec<Icon>>,
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Whether this MCP server is currently enabled.
    pub enabled: bool,
    /// Current lifecycle state of the MCP server.
    pub state: McpServerState,
    /// An `mcp://`-protocol channel the client uses to side-channel traffic
    /// into the upstream MCP server itself. The channel is NOT a fresh raw MCP
    /// connection: it piggybacks on the AHP transport
    /// and skips the MCP `initialize` sequence.
    ///
    /// The agent host MAY only serve a subset of MCP on this
    /// channel; the served subset is described by domain-specific
    /// capabilities such as those in
    /// {@link McpServerCustomizationApps.capabilities}.
    ///
    /// The channel URI SHOULD be stable across the server's lifetime, but
    /// the agent host MAY change it (for example across a restart) and
    /// MAY only expose it while the server is in
    /// {@link McpServerStatus.Ready | `Ready`}. Absence means no
    /// side-channel is currently available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<Uri>,
    /// MCP App support. This property SHOULD be advertised for MCP servers
    /// which support apps.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_app: Option<McpServerCustomizationApps>,
}

/// Information from the agent host needed to render MCP Apps served
/// by this MCP server.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerCustomizationApps {
    /// The subset of MCP App
    /// [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
    /// the AHP host can satisfy for Views backed by this server. The
    /// client feeds these straight through into the `hostCapabilities` of
    /// the `ui/initialize` response delivered to the View.
    pub capabilities: AhpMcpUiHostCapabilities,
}

/// The subset of MCP App
/// [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
/// an AHP host can derive from the upstream MCP server (and from AHP's own
/// forwarding plumbing). Advertised on
/// {@link McpServerCustomizationApps.capabilities} so clients can pass it
/// through into the `hostCapabilities` of the `ui/initialize` response
/// delivered to an MCP App View.
///
/// Field names mirror the MCP Apps spec exactly, so the AHP-side producer
/// can pass them straight through into the `hostCapabilities` of the
/// `ui/initialize` response delivered to the View.
///
/// Capabilities outside this set (`openLinks`, `downloadFile`, `sandbox`,
/// `experimental`) are decided locally by whichever AHP client renders the
/// View and are NOT part of this AHP-level advertisement — only the
/// server-derived subset is.
///
/// An agent host MUST only advertise a capability when it actually accepts the
/// corresponding methods/notifications on the `mcp://` channel:
///
/// - {@link serverTools}: host proxies `tools/list` and `tools/call` to
///   the MCP server. When `listChanged` is `true`, the host also forwards
///   `notifications/tools/list_changed`.
/// - {@link serverResources}: host proxies `resources/read`,
///   `resources/list`, and `resources/templates/list` to the MCP server.
///   When `listChanged` is `true`, the host also forwards
///   `notifications/resources/list_changed`.
/// - {@link logging}: host accepts `notifications/message` log entries
///   from the App and forwards them via `mcpNotification` (and forwards
///   `logging/setLevel` calls to the server).
/// - {@link sampling}: host serves `sampling/createMessage` via
///   `mcpMethodCall`. When `sampling.tools` is present, the host also
///   accepts SEP-1577 `tools` / `toolChoice` / `tool_use` content blocks
///   inside `CreateMessageRequest`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AhpMcpUiHostCapabilities {
    /// Producer proxies the MCP `tools/*` methods to the upstream server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_tools: Option<AnyValue>,
    /// Producer proxies the MCP `resources/*` methods to the upstream server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_resources: Option<AnyValue>,
    /// Producer accepts `notifications/message` log entries from the App via `mcpNotification`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logging: Option<JsonObject>,
    /// Producer serves `sampling/createMessage` via `mcpMethodCall`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sampling: Option<AnyValue>,
}

/// Server is registered with the host but has not yet started.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStartingState {}

/// Server is running and serving requests.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerReadyState {}

/// Server is reachable but cannot serve requests until the client
/// authenticates. Mirrors the discovery flow defined by
/// [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)
/// (Protected Resource Metadata) and the OAuth 2.1 / RFC 6750 challenge
/// semantics required by the MCP authorization spec.
///
/// Clients react to this state by calling the existing `authenticate`
/// command with the {@link ProtectedResourceMetadata.resource | resource}
/// carried here. There is **no** `notify/authRequired` notification for
/// MCP servers — the action stream is the single source of truth.
///
/// When the transition is triggered by a request issued during a turn
/// — most commonly
/// {@link McpAuthRequiredReason.InsufficientScope | `InsufficientScope`}
/// surfacing mid-tool-call — the host SHOULD also raise
/// {@link SessionStatus.InputNeeded} on the session so the block is
/// visible at the summary level. Clients SHOULD watch this status on
/// any MCP server backing a running tool call and surface an explicit
/// affordance (e.g. a "grant additional access" prompt) tied to that
/// tool call, rather than relying on the user to notice the
/// customization’s status badge.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerAuthRequiredState {
    /// Why authentication is required.
    pub reason: McpAuthRequiredReason,
    /// RFC 9728 Protected Resource Metadata. The `resource` field is the
    /// canonical MCP server URI per RFC 8707, used as the OAuth `resource`
    /// indicator. `authorization_servers` is REQUIRED by the MCP
    /// authorization spec.
    pub resource: ProtectedResourceMetadata,
    /// Scopes required for the current challenge, parsed from the
    /// `WWW-Authenticate: Bearer scope="…"` header (or `scopes_supported`
    /// fallback). Authoritative for the next authorization request — clients
    /// MUST NOT assume any subset/superset relationship to
    /// `resource.scopes_supported`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required_scopes: Option<Vec<String>>,
    /// Human-readable hint, typically from the OAuth `error_description`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Server failed to start, crashed, or otherwise transitioned to a
/// non-recoverable error. Use {@link McpServerStatus.AuthRequired}
/// for authentication failures.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerErrorState {
    /// Error details.
    pub error: ErrorInfo,
}

/// Server has been shut down. The host MAY remove the server from the
/// session entirely shortly after this state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStoppedState {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallClientContributor {
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `chat/toolCallComplete` with the result.
    pub client_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallMcpContributor {
    /// Customization ID of the corresponding MCP server in {@link SessionState.customizations}.
    pub customization_id: String,
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
    /// Additional provider-specific metadata for this error.
    /// Clients MAY look for well-known optional keys here to provide enhanced UI
    /// (e.g. a structured chat fetch error for richer, localized messaging).
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// A point-in-time snapshot of a subscribed resource's state, returned by
/// `initialize`, `reconnect`, and `subscribe`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// The subscribed channel URI (e.g. `ahp-root://`, `ahp-session:/<uuid>`, or `ahp-chat:/<uuid>`)
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
pub struct Changeset {
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
    /// Advisory hint describing what kind of changeset this is, so clients can
    /// group, sort, or render an appropriate icon without parsing
    /// {@link uriTemplate}. Recognized values include:
    ///
    /// - `'session'`: a static, session-wide changeset covering all changes the
    ///   agent has produced in this session.
    /// - `'branch'`: changes relative to a base branch (e.g. a feature branch
    ///   diffed against `main`).
    /// - `'uncommitted'`: the workspace's current uncommitted changes.
    /// - `'turn'`: changes produced by a single turn. Typically paired with a
    ///   `{turnId}` variable in {@link uriTemplate}.
    /// - `'compare-turns'`: a diff between two turns. Typically paired with
    ///   `{originalTurnId}` and `{modifiedTurnId}` variables in
    ///   {@link uriTemplate}.
    ///
    /// Implementations MAY provide additional values; clients SHOULD fall back
    /// to a reasonable default when an unknown value is encountered.
    pub change_kind: String,
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
    /// Optional group identifier, used to group related operations together.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    /// Current execution status. The server sets
    /// {@link ChangesetOperationStatus.Running | Running} while an invocation
    /// is in flight, {@link ChangesetOperationStatus.Error | Error} when the
    /// most recent invocation failed, and
    /// {@link ChangesetOperationStatus.Idle | Idle} otherwise.
    ///
    /// Clients SHOULD reflect this state in the UI — e.g. disabling the
    /// control or showing a spinner while `Running`, and surfacing
    /// {@link error} while `Error`.
    pub status: ChangesetOperationStatus,
    /// Cause of failure. Present iff
    /// `status === ChangesetOperationStatus.Error`; otherwise omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorInfo>,
}

/// Lightweight per-session summary of the annotations channel, surfaced on
/// {@link SessionSummary.annotations} so badge UI can render annotation /
/// entry counts without subscribing to the channel itself.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationsSummary {
    /// The subscribable annotations channel URI for the owning session
    /// (typically `ahp-session:/<uuid>/annotations`). Surfaced explicitly even
    /// though it is derivable from the session URI so badge UI does not need
    /// to know the derivation rule.
    pub resource: Uri,
    /// Total number of {@link Annotation} entries in the channel.
    pub annotation_count: i64,
    /// Total number of {@link AnnotationEntry} entries across every annotation.
    pub entry_count: i64,
}

/// Full state for a session's annotations channel, returned when a client
/// subscribes to an `ahp-session:/<uuid>/annotations` URI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationsState {
    /// Annotations in this channel, keyed by {@link Annotation.id}.
    pub annotations: Vec<Annotation>,
}

/// A conversation anchored to a specific file produced by a specific turn,
/// optionally narrowed to a range within that file.
///
/// {@link turnId} anchors the annotation to the file versions that turn
/// produced, so a later turn that rewrites the same file does not silently
/// invalidate the annotation's anchor — clients can resolve {@link resource}
/// and {@link range} against the turn's changeset. When {@link range} is
/// omitted the annotation is anchored to the entire file.
///
/// Every annotation MUST contain at least one {@link AnnotationEntry}. An
/// {@link AnnotationsSetAction} that creates an annotation therefore carries
/// its mandatory first entry, and removing the last remaining entry collapses
/// the annotation via {@link AnnotationsRemovedAction} rather than leaving an
/// empty annotation behind.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    /// Stable identifier within the annotations channel. Assigned by the client
    /// that dispatches the creating {@link AnnotationsSetAction}.
    pub id: String,
    /// Turn that produced the file versions this annotation is anchored to.
    /// Matches a {@link Turn.id} on the owning session.
    pub turn_id: String,
    /// The file the annotation is anchored to.
    pub resource: Uri,
    /// Range within {@link resource} the annotation is anchored to. When
    /// omitted the annotation is anchored to the entire file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<TextRange>,
    /// Whether the annotation has been resolved. Newly created annotations are
    /// always unresolved (`false`); a client marks an annotation resolved (or
    /// re-opens it) by dispatching an {@link AnnotationsUpdatedAction} carrying
    /// the updated flag (or an {@link AnnotationsSetAction} when replacing the
    /// whole annotation).
    pub resolved: bool,
    /// Entries in this annotation, in dispatch order (oldest first). MUST
    /// contain at least one entry.
    pub entries: Vec<AnnotationEntry>,
    /// Producer-defined opaque metadata, surfaced to tooling but not
    /// interpreted by the protocol.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// A single entry within an {@link Annotation}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationEntry {
    /// Stable identifier within the enclosing annotation. Assigned by the client
    /// that dispatches the {@link AnnotationsEntrySetAction} (or the enclosing
    /// {@link AnnotationsSetAction}) introducing the entry.
    pub id: String,
    /// Entry body. A bare `string` is rendered as plain text; pass
    /// `{ markdown: "…" }` to opt into Markdown rendering. See
    /// {@link StringOrMarkdown}.
    pub text: StringOrMarkdown,
    /// Producer-defined opaque metadata, surfaced to tooling but not
    /// interpreted by the protocol.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// OTLP telemetry channels the agent host emits.
///
/// Each field, when present, is either a literal channel URI or an
/// [RFC 6570](https://datatracker.ietf.org/doc/html/rfc6570) URI template
/// a client expands and then subscribes to. Absent fields indicate the host
/// does not emit that signal.
///
/// Channel URIs use the `ahp-otlp:` scheme. The scheme identifies the
/// protocol (OpenTelemetry over AHP) so clients can recognise the channel
/// type by URI alone; the host is free to choose any authority/path that
/// makes sense for its implementation. Clients MUST treat the URI as
/// opaque (apart from expanding any well-known template variables defined
/// below) and subscribe with the resulting concrete URI.
///
/// Payloads delivered on these channels are OTLP/JSON values — see
/// [opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto)
/// for the wire shapes (`ExportLogsServiceRequest`,
/// `ExportTraceServiceRequest`, `ExportMetricsServiceRequest`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryCapabilities {
    /// Channel URI (or RFC 6570 URI template) for OTLP log records
    /// (`otlp/exportLogs` notifications).
    ///
    /// The following template variables are defined by this protocol; any
    /// other variable name MUST be ignored by clients (there is no
    /// protocol-defined way to obtain values for unknown variables):
    ///
    /// | Variables in template | Meaning                                                                                                 |
    /// | --------------------- | ------------------------------------------------------------------------------------------------------- |
    /// | _(none)_              | The host does not support subscriber-side severity filtering. The template is itself a subscribable URI. |
    /// | `{level}`             | Minimum OTLP severity to deliver. Expand to one of the [OTLP `SeverityNumber`](https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber) short names (case-insensitive): `trace`, `debug`, `info`, `warn`, `error`, `fatal`. The server delivers log records whose `severityNumber` falls in the corresponding band or above. |
    ///
    /// Hosts SHOULD honour the expanded `{level}`; clients MUST still filter
    /// defensively in case a host ignores the parameter. Hosts that do not
    /// advertise `{level}` deliver all severities.
    ///
    /// Future protocol versions MAY add new well-known variables (e.g. scope
    /// or attribute filters).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logs: Option<Uri>,
    /// Channel URI for OTLP spans (`otlp/exportTraces` notifications). No
    /// template variables are defined by this protocol version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traces: Option<Uri>,
    /// Channel URI for OTLP metric data points (`otlp/exportMetrics`
    /// notifications). No template variables are defined by this protocol
    /// version.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metrics: Option<Uri>,
}

/// Full state for a single resource watch, returned when a client subscribes
/// to an `ahp-resource-watch:` URI.
///
/// Watches are otherwise stateless: the watcher exists to deliver
/// {@link ResourceWatchChangedAction} events. The state carries only the
/// descriptor of what is being watched so a re-subscribing client can
/// recover the watch configuration after reconnecting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceWatchState {
    /// The URI being watched. For recursive watches this is the root of the
    /// subtree; for non-recursive watches this is the single file or
    /// directory.
    pub root: Uri,
    /// `true` if the watcher reports changes for descendants of `root`;
    /// `false` if it only reports changes to `root` itself (and, when
    /// `root` is a directory, its direct children).
    pub recursive: bool,
    /// Optional glob patterns or paths relative to `root` to exclude from
    /// change reporting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excludes: Option<AnyValue>,
    /// Optional glob patterns or paths relative to `root` to restrict
    /// change reporting to. Omit to report every change under `root`
    /// subject to `excludes`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub includes: Option<AnyValue>,
}

/// A single change observed by a resource watcher.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceChange {
    /// The URI of the resource that changed.
    pub uri: Uri,
    /// The kind of change observed.
    pub r#type: ResourceChangeType,
}

// ─── Discriminated Unions ─────────────────────────────────────────────

/// How a chat came into existence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ChatOrigin {
    /// Created directly by a user.
    #[serde(rename = "user")]
    User,
    /// Forked from a specific turn of another chat.
    #[serde(rename = "fork")]
    Fork {
        /// URI of the chat this one was forked from.
        chat: Uri,
        /// Turn the fork was taken from.
        #[serde(rename = "turnId")]
        turn_id: String,
    },
    /// Spawned by a tool call in another chat.
    #[serde(rename = "tool")]
    Tool {
        /// URI of the chat whose tool call spawned this one.
        chat: Uri,
        /// Tool call that spawned this chat.
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
    },
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

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

/// One question within a chat input request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ChatInputQuestion {
    #[serde(rename = "text")]
    Text(ChatInputTextQuestion),
    #[serde(rename = "number")]
    Number(ChatInputNumberQuestion),
    #[serde(rename = "integer")]
    Integer(ChatInputNumberQuestion),
    #[serde(rename = "boolean")]
    Boolean(ChatInputBooleanQuestion),
    #[serde(rename = "single-select")]
    SingleSelect(ChatInputSingleSelectQuestion),
    #[serde(rename = "multi-select")]
    MultiSelect(ChatInputMultiSelectQuestion),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Value captured for one answer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ChatInputAnswerValue {
    #[serde(rename = "text")]
    Text(ChatInputTextAnswerValue),
    #[serde(rename = "number")]
    Number(ChatInputNumberAnswerValue),
    #[serde(rename = "boolean")]
    Boolean(ChatInputBooleanAnswerValue),
    #[serde(rename = "selected")]
    Selected(ChatInputSelectedAnswerValue),
    #[serde(rename = "selected-many")]
    SelectedMany(ChatInputSelectedManyAnswerValue),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Draft, submitted, or skipped answer for one question.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state")]
pub enum ChatInputAnswer {
    #[serde(rename = "draft")]
    Draft(ChatInputAnswered),
    #[serde(rename = "submitted")]
    Submitted(ChatInputAnswered),
    #[serde(rename = "skipped")]
    Skipped(ChatInputSkipped),
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

/// An attachment associated with a `Message`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MessageAttachment {
    #[serde(rename = "simple")]
    Simple(SimpleMessageAttachment),
    #[serde(rename = "embeddedResource")]
    EmbeddedResource(MessageEmbeddedResourceAttachment),
    #[serde(rename = "resource")]
    Resource(MessageResourceAttachment),
    #[serde(rename = "annotations")]
    Annotations(MessageAnnotationsAttachment),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// A top-level customization (plugin, directory, or bare MCP server).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Customization {
    #[serde(rename = "plugin")]
    Plugin(PluginCustomization),
    #[serde(rename = "directory")]
    Directory(DirectoryCustomization),
    #[serde(rename = "mcpServer")]
    McpServer(Box<McpServerCustomization>),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// A child customization living inside a plugin or directory.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ChildCustomization {
    #[serde(rename = "agent")]
    Agent(AgentCustomization),
    #[serde(rename = "skill")]
    Skill(SkillCustomization),
    #[serde(rename = "prompt")]
    Prompt(PromptCustomization),
    #[serde(rename = "rule")]
    Rule(RuleCustomization),
    #[serde(rename = "hook")]
    Hook(HookCustomization),
    #[serde(rename = "mcpServer")]
    McpServer(Box<McpServerCustomization>),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Host-reported load state for a container customization.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum CustomizationLoadState {
    #[serde(rename = "loading")]
    Loading(CustomizationLoadingState),
    #[serde(rename = "loaded")]
    Loaded(CustomizationLoadedState),
    #[serde(rename = "degraded")]
    Degraded(CustomizationDegradedState),
    #[serde(rename = "error")]
    Error(CustomizationErrorState),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Discriminated lifecycle status of an MCP server customization.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum McpServerState {
    #[serde(rename = "starting")]
    Starting(McpServerStartingState),
    #[serde(rename = "ready")]
    Ready(McpServerReadyState),
    #[serde(rename = "authRequired")]
    AuthRequired(Box<McpServerAuthRequiredState>),
    #[serde(rename = "error")]
    Error(McpServerErrorState),
    #[serde(rename = "stopped")]
    Stopped(McpServerStoppedState),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// Reference to the contributor of the tool being called.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ToolCallContributor {
    #[serde(rename = "client")]
    Client(ToolCallClientContributor),
    #[serde(rename = "mcp")]
    Mcp(ToolCallMcpContributor),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

/// The state payload of a snapshot — root, session, chat, terminal,
/// changeset, resource-watch, or annotations state.
///
/// Deserialized by trying session first (has required `summary`), then
/// chat (has required `turns`), then terminal (has required `content`),
/// then changeset (has required `status` and `files`), then resource-watch
/// (has required `root` and `recursive`), then annotations (has required
/// `annotations`), then root.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SnapshotState {
    Session(Box<SessionState>),
    Chat(Box<ChatState>),
    Terminal(Box<TerminalState>),
    Changeset(Box<ChangesetState>),
    ResourceWatch(Box<ResourceWatchState>),
    Annotations(Box<AnnotationsState>),
    Root(Box<RootState>),
}
