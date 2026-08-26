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

#[allow(unused_imports)]
use crate::actions::{ActionEnvelope, StateAction};
#[allow(unused_imports)]
use crate::state::{
    AgentSelection, AutomationDefinition, AutomationSchedule, AutomationSessionTemplate,
    AutomationTrigger, AutomationTriggerDefinition, ContentRef, Message, MessageAttachment,
    ModelSelection, SessionActiveClient, SessionConfigSchema, SessionSummary, SideChatSelection,
    Snapshot, SnapshotState, TelemetryCapabilities, TerminalClaim, TextRange, Turn,
};

// ─── Enums ────────────────────────────────────────────────────────────

/// Discriminant for reconnect result types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ReconnectResultType {
    #[serde(rename = "replay")]
    Replay,
    #[serde(rename = "snapshot")]
    Snapshot,
}

/// How a new chat uses its source chat and turn.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ChatSourceKind {
    /// Copy source history through the referenced turn into the new chat.
    Fork,
    /// Supply source context without copying it into the new chat's visible history.
    SideChat,
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    Unknown(String),
}

impl serde::Serialize for ChatSourceKind {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::Fork => serializer.serialize_str("fork"),
            Self::SideChat => serializer.serialize_str("sideChat"),
            Self::Unknown(value) => serializer.serialize_str(value),
        }
    }
}

impl<'de> serde::Deserialize<'de> for ChatSourceKind {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = <String as serde::Deserialize>::deserialize(deserializer)?;
        Ok(match raw.as_str() {
            "fork" => Self::Fork,
            "sideChat" => Self::SideChat,
            _ => Self::Unknown(raw),
        })
    }
}

/// Encoding of fetched content data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ContentEncoding {
    #[serde(rename = "base64")]
    Base64,
    #[serde(rename = "utf-8")]
    Utf8,
}

/// The kind of completion items being requested.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum CompletionItemKind {
    /// Completions for the text of a {@link Message} the user is composing.
    /// Each returned item carries an attachment that gets associated with the
    /// message when accepted.
    UserMessage,
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    Unknown(String),
}

impl serde::Serialize for CompletionItemKind {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::UserMessage => serializer.serialize_str("userMessage"),
            Self::Unknown(value) => serializer.serialize_str(value),
        }
    }
}

impl<'de> serde::Deserialize<'de> for CompletionItemKind {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = <String as serde::Deserialize>::deserialize(deserializer)?;
        Ok(match raw.as_str() {
            "userMessage" => Self::UserMessage,
            _ => Self::Unknown(raw),
        })
    }
}

/// Discriminant for {@link ResourceResolveResult.type}.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ResourceType {
    File,
    Directory,
    Symlink,
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    Unknown(String),
}

impl serde::Serialize for ResourceType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Self::File => serializer.serialize_str("file"),
            Self::Directory => serializer.serialize_str("directory"),
            Self::Symlink => serializer.serialize_str("symlink"),
            Self::Unknown(value) => serializer.serialize_str(value),
        }
    }
}

impl<'de> serde::Deserialize<'de> for ResourceType {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = <String as serde::Deserialize>::deserialize(deserializer)?;
        Ok(match raw.as_str() {
            "file" => Self::File,
            "directory" => Self::Directory,
            "symlink" => Self::Symlink,
            _ => Self::Unknown(raw),
        })
    }
}

/// How {@link ResourceWriteParams.data} is placed within the target file.
///
/// Each mode interprets {@link ResourceWriteParams.position} differently:
///
/// - `truncate` (default): rooted at the **start** of the file. The file is
///   truncated at `position` (0 by default) and `data` is written from that
///   offset, so the resulting file is `existing[0..position] + data`. With
///   `position` omitted this is a full overwrite.
/// - `append`: rooted at the **end** of the file. `position` counts bytes
///   backwards from EOF, so `position: 0` (the default) writes at EOF —
///   POSIX append — and `position: 5` inserts `data` 5 bytes before the
///   current EOF, shifting those trailing 5 bytes after the inserted region.
///   The server MUST evaluate the effective EOF and write atomically with
///   respect to other appenders so concurrent `append` writes do not
///   clobber each other.
/// - `insert`: rooted at the **start** of the file. `position` (0 by default)
///   is the byte offset at which `data` is spliced in; bytes at or after
///   `position` are shifted right by `data.length`. `insert` always grows
///   the file — use `truncate` to overwrite bytes in place.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ResourceWriteMode {
    #[serde(rename = "truncate")]
    Truncate,
    #[serde(rename = "append")]
    Append,
    #[serde(rename = "insert")]
    Insert,
}

// ─── Command Payloads ─────────────────────────────────────────────────

/// Establishes a new connection and negotiates the protocol version.
/// This MUST be the first message sent by the client.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Protocol versions the client is willing to speak, ordered from most
    /// preferred to least preferred. Each entry is a [SemVer](https://semver.org)
    /// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
    ///
    /// The server selects one entry and returns it as `InitializeResult.protocolVersion`.
    /// If the server cannot speak any of the offered versions, it MUST return
    /// error code `-32005` (`UnsupportedProtocolVersion`) with required
    /// `UnsupportedProtocolVersionErrorData` containing `supportedVersions`.
    pub protocol_versions: Vec<String>,
    /// Unique client identifier
    pub client_id: String,
    /// Optional identity of the client implementation (name and version).
    /// Informational only — see {@link Implementation} for how it may and may not
    /// be used. Distinct from {@link InitializeParams.clientId | `clientId`},
    /// which is an opaque per-connection identifier used for reconnection, not a
    /// human-readable implementation name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_info: Option<Implementation>,
    /// URIs to subscribe to during handshake
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_subscriptions: Option<Vec<Uri>>,
    /// IETF BCP 47 language tag indicating the client's preferred locale
    /// (e.g. `"en-US"`, `"ja"`). The server SHOULD use this to localise
    /// user-facing strings such as confirmation option labels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    /// Optional client capability declarations.
    ///
    /// Servers SHOULD only advertise features whose corresponding client
    /// capability is set here. Absent means "not declared" — the server
    /// MUST assume the client does not support the feature.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<ClientCapabilities>,
}

/// Result of the `initialize` command.
///
/// `protocolVersion` is the version the server has selected from the client's
/// `protocolVersions` list. The client and server MUST use this version for
/// the rest of the connection. If the server cannot speak any of the offered
/// versions it MUST return error code `-32005` (`UnsupportedProtocolVersion`)
/// with required `UnsupportedProtocolVersionErrorData` containing
/// `supportedVersions`, instead of a result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    /// Protocol version selected by the server. MUST be one of the entries in
    /// `InitializeParams.protocolVersions`. Formatted as a [SemVer](https://semver.org)
    /// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
    pub protocol_version: String,
    /// Current server sequence number
    pub server_seq: i64,
    /// Optional identity of the server implementation (name and version).
    /// Informational only — see {@link Implementation} for how it may and may not
    /// be used. Whereas {@link InitializeResult.protocolVersion | `protocolVersion`}
    /// identifies the negotiated protocol, `serverInfo` identifies the host
    /// software behind it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_info: Option<Implementation>,
    /// Optional implementation-specific extension metadata advertised by the host.
    ///
    /// Hosts and clients MAY agree on namespaced keys for capabilities that are not
    /// part of the standardized protocol. Clients MUST ignore keys they do not
    /// understand. Capabilities needed for interoperable behavior SHOULD use typed
    /// fields on {@link InitializeResult} instead.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Snapshots for each `initialSubscriptions` URI
    pub snapshots: Vec<Snapshot>,
    /// Suggested default directory for remote filesystem browsing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_directory: Option<Uri>,
    /// Characters that, when typed in a {@link Message} input, SHOULD cause
    /// the client to issue a `completions` request with
    /// {@link CompletionItemKind.UserMessage}. Typically includes characters like
    /// `'@'` or `'/'`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_trigger_characters: Option<Vec<String>>,
    /// Prefix that the host recognizes at the start of a user {@link Message.text}
    /// as a shorthand for executing the remainder as a terminal command. Currently
    /// the standardized convention is `"!"`; absence means the host does not
    /// support command prefixes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_command_prefix: Option<String>,
    /// OTLP telemetry channels the host emits, if any. Each populated field is
    /// either a literal `ahp-otlp:` channel URI or an RFC 6570 URI template a
    /// client expands before subscribing (currently only the `logs` channel
    /// defines a template variable, `{level}`, for subscriber-side severity
    /// filtering). Clients MAY ignore signals they cannot process.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub telemetry: Option<TelemetryCapabilities>,
    /// Host-owned automation support. Presence means clients may subscribe to
    /// `ahp-automations://` for {@link AutomationCatalogState}; absence means the
    /// host does not expose an automation catalogue or automation commands.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub automations: Option<AutomationCapabilities>,
}

/// Optional capabilities a client declares during `initialize`.
///
/// Each field is a presence flag: an empty object `{}` means "supported",
/// absence means "not supported". Sub-fields on individual capabilities
/// are reserved for future per-capability options.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClientCapabilities {
    /// Client can render
    /// [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) — i.e.
    /// it can host the View sandbox, run the `ui/*` protocol against it,
    /// and forward `mcp://`-channel traffic on the App's behalf.
    ///
    /// Hosts SHOULD only populate
    /// {@link McpServerCustomization.mcpApp | `McpServerCustomization.mcpApp`}
    /// (and expose the corresponding
    /// {@link McpServerCustomization.channel | `mcp://` channel}) when this
    /// capability is declared. Clients that omit it MUST treat
    /// App-bearing tool calls as ordinary MCP tool calls.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_apps: Option<JsonObject>,
}

/// Automation features supported by this host authority.
///
/// The presence of this object advertises the baseline `ahp-automations://`
/// catalogue. Optional fields describe additional host features and
/// restrictions.
///
/// Capabilities describe implementation support.
/// {@link AutomationState.operations} remains authoritative for which
/// definition mutations are currently allowed on a particular automation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutomationCapabilities {
    /// Present when clients may dispatch {@link AutomationCreateRequestedAction}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create: Option<AutomationCreateCapability>,
    /// Present when definitions may contain {@link AutomationScheduleTrigger | schedule triggers}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schedules: Option<AutomationScheduleCapabilities>,
    /// Present when clients may request cancellation of `pending` or `running`
    /// automation runs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_cancellation: Option<AutomationRunCancellationCapability>,
    /// Maximum terminal entries retained in {@link AutomationState.runs}. Active
    /// runs are not counted toward the limit. Absence means the retention limit is
    /// implementation-defined.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_history_limit: Option<i64>,
}

/// Presence capability for {@link AutomationCreateRequestedAction |
/// `automation/createRequested`}.
///
/// The empty object means "supported"; fields are reserved for future
/// create-specific options.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationCreateCapability {}

/// Host restrictions on portable {@link AutomationSchedule} triggers.
///
/// The cron grammar itself is fixed by AHP. Hosts MUST accept every expression
/// in that grammar unless it violates an advertised interval restriction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AutomationScheduleCapabilities {
    /// Smallest permitted interval between consecutive occurrences produced by
    /// {@link AutomationSchedule.expression}. Omission means no restriction beyond
    /// the cron format's one-minute resolution.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_interval_minutes: Option<i64>,
}

/// Presence capability for {@link AutomationRunCancelRequestedAction |
/// `automationRun/cancelRequested`}.
///
/// The empty object means "supported." Clients may dispatch the action for
/// `pending` or `running` runs; terminal runs cannot be cancelled.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRunCancellationCapability {}

/// Identifies a protocol implementation — the software (and build) on one end
/// of the connection, as distinct from the {@link AgentInfo | agent persona} it
/// hosts. Carried as {@link InitializeParams.clientInfo | `clientInfo`} on the
/// client side and {@link InitializeResult.serverInfo | `serverInfo`} on the
/// server side, mirroring LSP's `clientInfo`/`serverInfo` and MCP's
/// `Implementation`.
///
/// This is **informational only**: it exists for logging, telemetry, an
/// about/status affordance, and — as a last resort — a known-issue workaround
/// for a specific buggy build. It is **not** a feature-detection mechanism.
/// Feature availability stays with the capability model
/// ({@link ClientCapabilities} and the various `*.capabilities` declarations);
/// implementations SHOULD NOT gate protocol behaviour on parsing
/// {@link Implementation.version | `version`}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Implementation {
    /// Implementation name, e.g. a product or package identifier.
    pub name: String,
    /// Implementation version. A [SemVer](https://semver.org) string is
    /// recommended but not required.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Optional human-readable display name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Re-establishes a dropped connection. The server replays missed actions or
/// provides fresh snapshots.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Client identifier from the original connection
    pub client_id: String,
    /// Last `serverSeq` the client received
    pub last_seen_server_seq: i64,
    /// URIs the client was subscribed to
    pub subscriptions: Vec<Uri>,
}

/// Reconnect result when the server can replay from the requested sequence.
///
/// The server MUST include all replayed data in the response.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectReplayResult {
    /// Missed action envelopes since `lastSeenServerSeq`
    pub actions: Vec<ActionEnvelope>,
    /// URIs from `ReconnectParams.subscriptions` that the server cannot resume.
    /// This includes resources that no longer exist (e.g. disposed sessions or
    /// terminals) as well as resources the client is no longer permitted to
    /// observe. Clients SHOULD drop these from their local subscription set.
    pub missing: Vec<Uri>,
}

/// Reconnect result when the gap exceeds the replay buffer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectSnapshotResult {
    /// Fresh snapshots for each subscription
    pub snapshots: Vec<Snapshot>,
}

/// Subscribe to a URI-identified channel.
///
/// A channel MAY have state associated with it (e.g. root, sessions,
/// terminals) or be stateless (pure pub/sub for streaming data). For
/// state-bearing channels the result includes a snapshot; for stateless
/// channels `snapshot` is omitted.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Optional delivery preferences for this subscription.
    ///
    /// Servers MAY use these preferences to buffer and coalesce high-frequency
    /// updates while preserving the same reduced state. Omit this field for the
    /// server's default delivery behavior.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery: Option<SubscriptionDeliveryOptions>,
    /// Optional client-requested shape for the returned snapshot.
    ///
    /// Servers that do not understand a requested view ignore it and return their
    /// default snapshot. Clients MUST tolerate receiving more state than requested.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub view: Option<SubscribeView>,
}

impl SubscribeParams {
    /// Create subscribe params with default delivery behavior.
    pub fn new(channel: impl Into<Uri>) -> Self {
        Self {
            channel: channel.into(),
            meta: None,
            delivery: None,
            view: None,
        }
    }

    /// Create subscribe params with advisory delivery preferences.
    pub fn with_delivery(channel: impl Into<Uri>, delivery: SubscriptionDeliveryOptions) -> Self {
        Self {
            channel: channel.into(),
            meta: None,
            delivery: Some(delivery),
            view: None,
        }
    }

    /// Create subscribe params with snapshot-shaping preferences.
    pub fn with_view(channel: impl Into<Uri>, view: SubscribeView) -> Self {
        Self {
            channel: channel.into(),
            meta: None,
            delivery: None,
            view: Some(view),
        }
    }
}

/// Optional client-requested shape for a subscription snapshot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeView {
    /// Advisory number of most-recent completed turns to expose in a chat
    /// snapshot.
    ///
    /// Servers MAY return more or fewer turns than requested. When omitted, the
    /// host MUST return all retained turns. When older turns remain available, the
    /// returned {@link ChatState} carries `turnsNextCursor`; clients pass that
    /// cursor to `fetchTurns` to ask the host to page more turns into the chat
    /// state.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turns: Option<i64>,
}

/// Advisory delivery preferences for a single subscription.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionDeliveryOptions {
    /// Maximum time, in milliseconds, that the server may intentionally delay
    /// delivery while buffering/coalescing updates for this subscription.
    ///
    /// A value of `0` requests immediate delivery with no intentional coalescing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_latency_ms: Option<i64>,
}

/// Result of the `subscribe` command.
///
/// `snapshot` is present when the subscribed channel has associated state, and
/// absent for stateless channels.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeResult {
    /// Snapshot of the subscribed channel's state (omitted for stateless channels)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<Snapshot>,
}

/// Creates a new session with the specified agent provider.
///
/// If the session URI already exists, the server MUST return an error with code
/// `-32003` (`SessionAlreadyExists`).
///
/// After creation, the client should subscribe to the session URI to receive state
/// updates. The server also broadcasts a `root/sessionAdded` notification to all
/// clients.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Agent provider ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// The working directories the session's agent is granted tool access to.
    /// A session may span multiple directories; they are equal peers except when
    /// the agent advertises a protected-primary capability. An
    /// {@link MultipleWorkingDirectoriesCapability.immutablePrimary | immutable
    /// primary} is fixed, while a
    /// {@link MultipleWorkingDirectoriesCapability.primaryReplacement | replaceable
    /// primary} is changed only with `session/workingDirectoryReplaced`.
    ///
    /// A client MUST NOT supply more than one entry unless the agent advertises
    /// {@link AgentCapabilities.multipleWorkingDirectories}; a server without that
    /// capability treats only the first entry as the session's working directory
    /// and ignores the rest. Dispatch working-directory actions to change the set
    /// after the session has started.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directories: Option<Vec<Uri>>,
    /// Agent-specific configuration values collected via `resolveSessionConfig`.
    /// Keys and values correspond to the schema returned by the server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<JsonObject>,
    /// Eagerly claim an active client role for the new session.
    ///
    /// When provided, the server initializes the session with this client as an
    /// active client, equivalent to dispatching a `session/activeClientSet`
    /// action immediately after creation. The `clientId` MUST match the
    /// `clientId` the creating client supplied in `initialize`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_client: Option<SessionActiveClient>,
    /// Opt-in progress token. When set, the client is offering to receive
    /// `progress` notifications (see `ProgressParams`) for any long-running work
    /// the server does to bring this session up — most notably the lazy,
    /// first-use download of the provider's native SDK. The server echoes this
    /// exact token on every `progress` frame so the client can correlate it to
    /// this `createSession` call (and the UI awaiting it).
    ///
    /// The token MUST be unique across the client's active requests. The server
    /// MAY ignore it (e.g. when nothing long-running is needed), in which case no
    /// `progress` notifications are emitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_token: Option<String>,
}

/// Disposes a session and cleans up server-side resources.
///
/// The server broadcasts a `root/sessionRemoved` notification to all clients.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisposeSessionParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Copies source history through a completed turn into the new chat.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkChatSource {
    /// URI of the existing source chat.
    pub chat: Uri,
    /// Completed turn identifier in the source chat.
    ///
    /// Content through this turn is copied into the new chat's visible `turns`.
    pub turn_id: String,
}

/// Supplies source context to a new side chat without copying it into the side
/// chat's visible history.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SideChatSource {
    /// URI of the existing source chat.
    pub chat: Uri,
    /// Stable source-turn identifier in the source chat.
    ///
    /// Hosts resolve this id against the source chat's current `activeTurn` or its
    /// retained `turns` when accepting `createChat`. If it names the current
    /// active turn, the host snapshots the source chat's retained history plus
    /// that turn's current user message and any partial assistant response already
    /// available. Once that turn later becomes historical, it is still referenced
    /// by this same identifier.
    pub turn_id: String,
    /// Optional immutable selected-text snapshot to carry into the created side
    /// chat's origin.
    ///
    /// When present, the host MUST snapshot and preserve this exact selection when
    /// it accepts `createChat`; later source-turn deltas do not alter it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selection: Option<SideChatSelection>,
}

/// Creates a new chat within a session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`).
    pub chat: Uri,
    /// Optional initial message for the new chat.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_message: Option<Message>,
    /// Optional source chat and source turn.
    ///
    /// The source chat MUST belong to this session. Clients MUST only request
    /// `kind: "fork"` when the selected agent advertises
    /// `capabilities.multipleChats.fork`, and `kind: "sideChat"` when the
    /// selected agent advertises `capabilities.multipleChats.sideChat`. Both
    /// source forms carry a stable top-level `turnId`. Forks target completed
    /// turns. Side chats also carry a stable `turnId`, which the host resolves
    /// against the source chat's current active turn or retained history. If it
    /// resolves to the active turn, the host snapshots the currently available
    /// partial response when accepting `createChat`. When
    /// `source.kind === "sideChat"` and `source.selection` is present, the host
    /// also snapshots and preserves that exact selected text in the created chat's
    /// origin; any `responsePartId` there is provenance only, not a live range.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<ChatSource>,
    /// Initial working-directory subset for this chat. Every entry MUST be
    /// present in the owning session's `workingDirectories`; the server MUST
    /// reject any entry that is not. When absent, the chat inherits the full
    /// session set. Forked chats (those whose `source.kind` is `"fork"`) inherit
    /// the source chat's `workingDirectories`; this field is ignored for forks.
    ///
    /// A client MUST NOT supply this field unless the agent advertises
    /// {@link AgentCapabilities.multipleWorkingDirectories}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directories: Option<Vec<Uri>>,
}

/// Disposes a chat and cleans up server-side resources.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisposeChatParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Returns a list of session summaries. Used to populate session lists and sidebars.
///
/// The session list is **not** part of the state tree because it can be arbitrarily
/// large. Clients fetch it imperatively and maintain a local cache updated by
/// `root/sessionAdded` and `root/sessionRemoved` notifications.
///
/// A large catalogue can be fetched incrementally via the {@link PaginatedParams}
/// `limit`/`cursor` inputs (see that type for the full pagination contract). The
/// server SHOULD return most-recently-modified entries first, so the first page
/// is the immediately useful one. The `root/session*` notifications keep an
/// already-fetched page live; pagination governs only the initial and backfill
/// fetches.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Maximum number of entries to return in this page. The server SHOULD respect
    /// this bound but MAY return fewer entries and MAY impose its own upper cap.
    /// Omit to let the server choose the page size.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    /// Opaque pagination cursor from a previous {@link PaginatedResult.nextCursor}.
    /// Omit to fetch the first page. Cursors are server-defined and MUST be treated
    /// as opaque — do not parse, modify, or persist them across connections. An
    /// unrecognised cursor SHOULD be rejected with an `InvalidParams` error.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// Result of the `listSessions` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsResult {
    /// Opaque cursor for the next page. Present when more entries exist beyond the
    /// returned page; absent signals the end of the collection. Pass it back as
    /// {@link PaginatedParams.cursor} to fetch the following page.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    /// The list of session summaries. The server SHOULD order them
    /// most-recently-modified first.
    pub items: Vec<SessionSummary>,
}

/// Reads the content of a resource by URI.
///
/// Content references keep the state tree small by storing large data (images,
/// long tool outputs) by reference rather than inline.
///
/// Binary content (images, etc.) MUST use `base64` encoding. Text content MAY
/// use `utf-8` encoding.
///
/// Like all `resource*` methods, `resourceRead` is symmetrical and MAY be
/// sent in either direction. Hosts use it to fetch content from a
/// client-published URI (e.g. `virtual://my-client/...` plugins); clients
/// use it to read host-side files. The receiver enforces access via the
/// same permission/`resourceRequest` flow regardless of which peer initiated.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReadParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Content URI from a `ContentRef`
    pub uri: String,
    /// Preferred encoding for the returned data (default: server-chosen)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<ContentEncoding>,
}

/// Result of the `resourceRead` command.
///
/// The server SHOULD honor the `encoding` requested in the params. If the
/// server cannot provide the requested encoding, it MUST fall back to either
/// `base64` or `utf-8`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReadResult {
    /// Content encoded as a string
    pub data: String,
    /// How `data` is encoded
    pub encoding: ContentEncoding,
    /// Content type (e.g. `"image/png"`, `"text/plain"`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

/// Writes content to a file on the server's filesystem.
///
/// Binary content (images, etc.) MUST use `base64` encoding. Text content MAY
/// use `utf-8` encoding.
///
/// If the file does not exist, it is created. If the file already exists, the
/// effect on existing bytes depends on {@link ResourceWriteParams.mode}:
/// `truncate` (default) overwrites from the chosen offset onward, `append`
/// preserves all existing bytes and adds `data` at a position rooted at EOF,
/// and `insert` preserves all existing bytes and splices `data` in at an
/// offset rooted at the start of the file.
///
/// Like all `resource*` methods, `resourceWrite` is symmetrical and MAY be
/// sent in either direction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceWriteParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Target file URI on the server filesystem
    pub uri: Uri,
    /// Content encoded as a string
    pub data: String,
    /// How `data` is encoded
    pub encoding: ContentEncoding,
    /// Content type (e.g. `"text/plain"`, `"image/png"`)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    /// If `true`, the server MUST fail if the file already exists instead of
    /// overwriting it. Useful for safe creation of new files.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create_only: Option<bool>,
    /// How `data` is placed within the target file. Defaults to `'truncate'`
    /// (full overwrite) when omitted. See {@link ResourceWriteMode} for the
    /// meaning of each mode and how it interprets {@link position}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<ResourceWriteMode>,
    /// Byte offset interpreted according to {@link mode}. Defaults to `0`.
    /// - `truncate`: offset from the start of the file at which to truncate
    ///   before writing.
    /// - `append`: bytes back from EOF at which to insert `data`.
    /// - `insert`: offset from the start of the file at which to splice in
    ///   `data`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<i64>,
    /// Optimistic-concurrency token previously returned by
    /// {@link ResourceResolveResult.etag}. When set, the server MUST fail with
    /// `Conflict` if the current `etag` does not match — preventing lost
    /// updates between a `resourceResolve` and a subsequent `resourceWrite`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub if_match: Option<String>,
}

/// Result of the `resourceWrite` command.
///
/// An empty object on success.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceWriteResult {}

/// Lists directory entries at a file URI on the server's filesystem.
///
/// This is intended for remote folder pickers and similar UI that needs to let
/// users navigate the server's local filesystem.
///
/// The server MUST return success only if the target exists and is a directory.
/// If the target does not exist, is not a directory, or cannot be accessed, the
/// server MUST return a JSON-RPC error.
///
/// Like all `resource*` methods, `resourceList` is symmetrical and MAY be
/// sent in either direction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceListParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Directory URI on the server filesystem
    pub uri: Uri,
}

/// Result of the `resourceList` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceListResult {
    /// Entries directly contained in the requested directory
    pub entries: Vec<DirectoryEntry>,
}

/// Directory entry returned by `resourceList`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    /// Base name of the entry
    pub name: String,
    /// Whether the entry is a file or directory
    pub r#type: String,
}

/// Copies a resource from one URI to another on the server's filesystem.
///
/// If the destination already exists, it is overwritten unless `failIfExists`
/// is set.
///
/// Like all `resource*` methods, `resourceCopy` is symmetrical and MAY be
/// sent in either direction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCopyParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Source URI to copy from
    pub source: Uri,
    /// Destination URI to copy to
    pub destination: Uri,
    /// If `true`, the server MUST fail if the destination already exists instead
    /// of overwriting it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fail_if_exists: Option<bool>,
}

/// Result of the `resourceCopy` command.
///
/// An empty object on success.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCopyResult {}

/// Deletes a resource at a URI on the server's filesystem.
///
/// Like all `resource*` methods, `resourceDelete` is symmetrical and MAY be
/// sent in either direction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDeleteParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// URI of the resource to delete
    pub uri: Uri,
    /// If `true` and the target is a directory, delete it and all its contents
    /// recursively. If `false` (default), deleting a non-empty directory MUST fail.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recursive: Option<bool>,
}

/// Result of the `resourceDelete` command.
///
/// An empty object on success.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDeleteResult {}

/// Moves (renames) a resource from one URI to another on the server's filesystem.
///
/// If the destination already exists, it is overwritten unless `failIfExists`
/// is set.
///
/// Like all `resource*` methods, `resourceMove` is symmetrical and MAY be
/// sent in either direction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMoveParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Source URI to move from
    pub source: Uri,
    /// Destination URI to move to
    pub destination: Uri,
    /// If `true`, the server MUST fail if the destination already exists instead
    /// of overwriting it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fail_if_exists: Option<bool>,
}

/// Result of the `resourceMove` command.
///
/// An empty object on success.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMoveResult {}

/// Resolves a resource — the combination of POSIX `stat` and `realpath`.
///
/// `resourceResolve` returns metadata about the resource together with its
/// canonical URI after symlink resolution. Use this in place of any
/// `resourceExists` shim: a missing resource MUST surface as a `NotFound`
/// JSON-RPC error rather than a success with a sentinel value. Callers that
/// truly need a boolean check should attempt `resourceResolve` and treat
/// `NotFound` as "does not exist".
///
/// Like all `resource*` methods, `resourceResolve` is symmetrical and MAY be
/// sent in either direction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceResolveParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// URI to resolve
    pub uri: Uri,
    /// When `true` (default), follow symlinks and report the metadata of the
    /// link target — and set `uri` in the result to the canonical (realpath)
    /// URI. When `false`, stat the link itself (lstat semantics) and report
    /// `type: 'symlink'`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub follow_symlinks: Option<bool>,
}

/// Result of the `resourceResolve` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceResolveResult {
    /// Canonical URI after symlink resolution. Equal to the requested URI when
    /// `followSymlinks` is `false` or the URI does not traverse a symlink.
    pub uri: Uri,
    /// Resource kind.
    pub r#type: ResourceType,
    /// Size in bytes. Omitted for directories when the provider cannot
    /// cheaply compute it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
    /// Last-modified time in ISO 8601 format, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mtime: Option<String>,
    /// Creation time in ISO 8601 format, when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctime: Option<String>,
    /// Sniffed MIME type, when known (e.g. `"text/plain"`, `"image/png"`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    /// Opaque per-provider version token. When present, pass it as
    /// {@link ResourceWriteParams.ifMatch} on a subsequent `resourceWrite` to
    /// detect concurrent modifications.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
}

/// Creates a directory on the server's filesystem with `mkdir -p` semantics.
///
/// The server MUST create any missing parent directories. Creating a
/// directory that already exists is a no-op success. If `uri` already
/// exists but is **not** a directory, the server MUST fail with
/// `AlreadyExists`.
///
/// Like all `resource*` methods, `resourceMkdir` is symmetrical and MAY be
/// sent in either direction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMkdirParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Directory URI to create (parents created as needed).
    pub uri: Uri,
}

/// Result of the `resourceMkdir` command.
///
/// An empty object on success.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMkdirResult {}

/// Requests permission to access a resource on the receiver's filesystem.
///
/// `resourceRequest` is symmetrical and MAY be sent in either direction: a
/// client asks the server to grant access to a server-side resource, or a
/// server asks the client to grant access to a client-side resource. The
/// receiver decides whether to allow, deny, or prompt the user for the
/// requested access.
///
/// If the receiver denies access, it MUST respond with `PermissionDenied`
/// (-32009). The error data MAY include a `ResourceRequestParams` value
/// describing the access the caller would need to be granted for the
/// operation to succeed; see `PermissionDeniedErrorData` in
/// `types/errors.ts`.
///
/// After a successful `resourceRequest`, the caller MAY use the corresponding
/// `resource*` commands (e.g. `resourceRead`, `resourceWrite`) to perform the
/// operation. Receivers MAY rescind access at any time by returning
/// `PermissionDenied` on subsequent operations.
///
/// Either `read`, `write`, or both SHOULD be set to `true`. A request with
/// neither flag set is treated as `read: true` by receivers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRequestParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Resource URI being requested. Typically a `file:` URI on the receiver's
    /// filesystem, but any URI scheme that the receiver mediates access to is
    /// allowed.
    pub uri: Uri,
    /// Whether the caller needs read access to the resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read: Option<bool>,
    /// Whether the caller needs write access to the resource.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub write: Option<bool>,
}

/// Result of the `resourceRequest` command.
///
/// An empty object on success.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRequestResult {}

/// Creates a resource watcher on the receiver's filesystem.
///
/// The receiver allocates an `ahp-resource-watch:/<id>` channel URI and
/// returns it on {@link CreateResourceWatchResult.channel}. The caller then
/// [`subscribe`](/specification/subscriptions#subscribe-request)s to that channel to receive
/// `resourceWatch/changed` actions over the standard action envelope.
///
/// The watch lifecycle is tied to subscription: when every subscriber has
/// unsubscribed (or the underlying connection drops), the receiver MUST
/// release the watcher. There is no explicit dispose command — `unsubscribe`
/// is the only handle the caller needs.
///
/// Like the rest of the `resource*` family, `createResourceWatch` is
/// symmetrical and MAY be sent in either direction. Access is gated through
/// the same permission flow as `resourceRead`/`resourceWrite`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResourceWatchParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// URI to watch.
    pub uri: Uri,
    /// If `true`, the receiver MUST report changes for descendants of `uri`.
    /// If `false` (default), only changes to `uri` itself — and, when `uri`
    /// is a directory, its direct children — are reported.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recursive: Option<bool>,
    /// Glob patterns or paths relative to `uri` to exclude from reporting.
    /// Wrapped in `{ items }` for forward compatibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excludes: Option<AnyValue>,
    /// Glob patterns or paths relative to `uri` to restrict reporting to.
    /// Omit to report every change under `uri` subject to `excludes`.
    /// Wrapped in `{ items }` for forward compatibility.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub includes: Option<AnyValue>,
}

/// Result of the `createResourceWatch` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResourceWatchResult {
    /// Receiver-assigned watch channel URI (`ahp-resource-watch:/<id>`). The
    /// caller subscribes to this URI to start receiving change events and
    /// unsubscribes to release the watcher.
    pub channel: Uri,
}

/// Requests that the host load older historical turns into a chat state.
///
/// The command result does not carry turns. Instead, before responding, the host
/// MUST dispatch `chat/turnsLoaded` to insert any loaded turns into the chat
/// channel's `turns` state, ahead of the already-loaded window, and update or
/// clear `turnsNextCursor`.
///
/// Before applying any operation that references a turn outside the currently
/// loaded window, the host MUST eagerly load enough older turns into state for
/// that operation to reduce against valid state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchTurnsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Opaque cursor from `ChatState.turnsNextCursor`.
    ///
    /// The host MUST reject unrecognised cursors with `InvalidParams`. Omit only
    /// when asking the host to opportunistically load its next older page for the
    /// chat, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// Result of the `fetchTurns` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchTurnsResult {}

/// Stop receiving updates for a channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsubscribeParams {
    /// Channel URI to unsubscribe from
    pub channel: Uri,
}

/// Fire-and-forget action dispatch (write-ahead). The client applies actions
/// optimistically to local state and the server echoes them back as an
/// {@link ActionEnvelope} once accepted.
///
/// The client → server method is named `dispatchAction`; the server's reply
/// arrives on the server → client `action` notification (params:
/// {@link ActionEnvelope}).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchActionParams {
    /// Channel URI this action targets
    pub channel: Uri,
    /// Client sequence number
    pub client_seq: i64,
    /// The action to dispatch
    pub action: StateAction,
}

/// Pushes a Bearer token for a protected resource. The `resource` field MUST
/// match a protected-resource identifier the client has discovered from the
/// server — whether declared statically in `AgentInfo.protectedResources`,
/// or discovered dynamically from a live `McpServerAuthRequiredState.resource`
/// or `ToolCallAuthRequiredState.auth.resource` (both surfaced only once the
/// corresponding MCP server or tool call actually challenges for auth).
/// Servers MUST accept any `resource` value they have themselves advertised
/// through one of these three mechanisms.
///
/// Tokens are delivered using [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750)
/// (Bearer Token Usage) semantics. The client obtains the token from the
/// authorization server(s) listed in the resource's metadata and pushes it
/// to the server via this command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticateParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// The protected resource identifier. MUST match a `resource` value the
    /// server has advertised — via `ProtectedResourceMetadata` in
    /// `AgentInfo.protectedResources`, or via a live
    /// `McpServerAuthRequiredState.resource` / `ToolCallAuthRequiredState.auth.resource`.
    pub resource: String,
    /// Bearer token obtained from the resource's authorization server
    pub token: String,
    /// OAuth scopes the token grants, when known. Lets the server determine
    /// whether a specific challenge — e.g. the `requiredScopes` on a live
    /// `McpServerAuthRequiredState` or `ToolCallAuthRequiredState.auth` — is
    /// satisfied without decoding the (opaque, server-specific) token itself.
    /// Omit when the client doesn't track granted scopes separately from the
    /// token.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scopes: Option<Vec<String>>,
}

/// Result of the `authenticate` command.
///
/// An empty object on success. If the token is invalid or the resource is
/// unrecognized, the server MUST return a JSON-RPC error (e.g. `AuthRequired`
/// `-32007` or `InvalidParams` `-32602`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticateResult {}

/// Creates a new terminal on the server.
///
/// After creation, the client should subscribe to the terminal URI to receive
/// state updates. The server dispatches `root/terminalsChanged` to update the
/// root terminal list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Initial owner of the terminal
    pub claim: TerminalClaim,
    /// Human-readable terminal name
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Initial working directory URI
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<Uri>,
    /// Initial terminal width in columns
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cols: Option<i64>,
    /// Initial terminal height in rows
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rows: Option<i64>,
}

/// Disposes a terminal and kills its process if still running.
///
/// The server dispatches `root/terminalsChanged` to remove the terminal from
/// the root terminal list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisposeTerminalParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
}

/// Iteratively resolves the session configuration schema. The client sends the
/// current partial session config and any user-filled metadata values. The server
/// returns a property schema describing what additional metadata is needed,
/// contextual to the current selections.
///
/// The client calls this command whenever the user changes a significant input
/// (e.g. picks a working directory, toggles a property). Each response returns
/// the full current property set (not a delta). The returned `values` contain
/// server-resolved defaults to pass to `createSession`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSessionConfigParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Agent provider ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Working directory for the session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Current user-filled configuration values
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<JsonObject>,
}

/// Result of the `resolveSessionConfig` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSessionConfigResult {
    /// JSON Schema describing available configuration properties given the current context
    pub schema: SessionConfigSchema,
    /// Current configuration values (echoed back with server-resolved defaults applied)
    pub values: JsonObject,
}

/// Queries the server for allowed values of a dynamic session config property.
///
/// Used when a property in the schema returned by `resolveSessionConfig` has
/// `enumDynamic: true`. The client sends a search query and receives matching
/// values with display metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigCompletionsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Agent provider ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Working directory for the session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Current user-filled configuration values (provides context for the query)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<JsonObject>,
    /// Property id from the schema to query values for
    pub property: String,
    /// Search filter text (empty or omitted returns default/recent values)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
}

/// Result of the `sessionConfigCompletions` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigCompletionsResult {
    /// Matching value items
    pub items: Vec<SessionConfigValueItem>,
}

/// A single value item returned by `sessionConfigCompletions`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfigValueItem {
    /// The value to store in config
    pub value: String,
    /// Human-readable display label
    pub label: String,
    /// Optional secondary description
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Requests completion items for a partially-typed input (e.g. a user message
/// the user is currently composing). Used to power `@`-mention pickers,
/// file/symbol references, and similar inline-completion experiences.
///
/// Servers SHOULD treat this command as best-effort and return promptly. The
/// client SHOULD debounce calls to avoid flooding the server with requests on
/// every keystroke.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// What kind of completion is being requested.
    pub kind: CompletionItemKind,
    /// The complete text of the input being completed (e.g. the full user
    /// message text typed so far).
    pub text: String,
    /// The character offset within `text` at which the completion is requested,
    /// measured in UTF-16 code units. MUST satisfy `0 <= offset <= text.length`.
    pub offset: i64,
}

/// A single completion item returned by the `completions` command.
///
/// When the user accepts an item, the client SHOULD:
/// 1. Replace the range `[rangeStart, rangeEnd)` in the input with `insertText`
///    (or insert `insertText` at the cursor when the range is omitted).
/// 2. Associate the item's `attachment` with the resulting {@link Message}.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionItem {
    /// The text inserted into the input when this item is accepted.
    pub insert_text: String,
    /// If defined, the start of the range in the input's `text` that is replaced
    /// by `insertText`. The range is the half-open interval
    /// `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
    /// units.
    ///
    /// When omitted, the client SHOULD insert `insertText` at the cursor.
    ///
    /// Note: this range refers to positions in the *current* input. The
    /// attachment's own `rangeStart`/`rangeEnd` (when present) refer to
    /// positions in the final {@link Message.text} after the item is
    /// accepted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range_start: Option<i64>,
    /// The end of the range in the input's `text` that is replaced by
    /// `insertText`. See {@link rangeStart}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range_end: Option<i64>,
    /// The attachment associated with this completion item.
    pub attachment: MessageAttachment,
}

/// Result of the `completions` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionsResult {
    /// The completion items, in the order the server suggests displaying them.
    pub items: Vec<CompletionItem>,
}

/// Invokes a server-defined {@link ChangesetOperation} against a changeset,
/// a single file, or a line range.
///
/// The server validates that `operationId` exists in the changeset's
/// current `operations` list and that the requested `target.kind` is
/// contained in the operation's `scopes`. Invalid combinations result in a
/// JSON-RPC error.
///
/// State changes resulting from invocation flow back through the normal
/// `changeset/*` action stream on the relevant changeset URIs. Clients
/// SHOULD NOT synthesise local optimistic changes for invocations unless
/// the server explicitly opts in via a future capability.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvokeChangesetOperationParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Matches {@link ChangesetOperation.id} from the changeset's `operations` list.
    pub operation_id: String,
    /// Target of the operation. Required iff the chosen scope is
    /// `'resource'` or `'range'`. Omit for changeset-scoped operations.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<ChangesetOperationTarget>,
}

/// Result of the {@link InvokeChangesetOperationParams | `invokeChangesetOperation`}
/// command.
///
/// Success is implicit: the server returns this result when it accepted
/// the operation. Failure is signalled by rejecting the JSON-RPC request
/// with an appropriate error code, not by any field on this result. The
/// operation MAY still produce subsequent failure feedback through the
/// {@link ChangesetStatusChangedAction | `changeset/statusChanged`} stream.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InvokeChangesetOperationResult {
    /// Optional human-readable message describing the result.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<StringOrMarkdown>,
    /// Optional follow-up: a URI to open (e.g. a PR), a content ref, etc.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub follow_up: Option<ChangesetOperationFollowUp>,
}

/// Optional follow-up surfaced by the server after an operation completes —
/// a {@link ContentRef} the client can fetch and display.
///
/// Set `external` to `true` to open the content in the user's preferred
/// external handler (e.g. browser); otherwise the client is expected to
/// surface it inline.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesetOperationFollowUp {
    pub content: ContentRef,
    /// When `true`, open in an external handler rather than inline.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external: Option<bool>,
}

/// Discover event-trigger types available for a prospective session template.
///
/// Hosts may vary definitions by provider, workspace, and session
/// configuration. Schedule triggers are protocol-defined and therefore do not
/// appear in this result. The result describes current authoring and validation
/// choices. Saved {@link AutomationEventTrigger} values retain their selected
/// event descriptors for display but do not establish current availability.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAutomationTriggerDefinitionsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Prospective provider id matching {@link AgentInfo.provider}, or omitted for the host default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Prospective {@link AutomationSessionTemplate.workingDirectories}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directories: Option<Vec<Uri>>,
    /// Prospective resolved {@link AutomationSessionTemplate.config}.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_config: Option<JsonObject>,
}

/// Host-defined event trigger types available for the supplied context.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAutomationTriggerDefinitionsResult {
    /// Available event trigger definitions.
    pub items: Vec<AutomationTriggerDefinition>,
}

/// Start a manual run of an automation.
///
/// Manual execution is independent of {@link AutomationDefinition.enabled}.
/// The host persists the run before beginning session side effects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAutomationParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Target {@link AutomationState.resource}.
    pub automation: Uri,
    /// Durable client-generated idempotency key. Retrying with the same key and
    /// automation MUST return the original run URI rather than create another
    /// run.
    pub request_id: String,
}

/// Result identifying the existing or newly created run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAutomationResult {
    /// Subscribable `ahp-automation-run:` URI matching {@link AutomationRunState.resource}.
    pub resource: Uri,
}

/// Load one older page into a catalogued automation's run-history state.
///
/// The response only acknowledges the request. The updated full state arrives
/// through {@link AutomationSetAction | `automation/set`} on the
/// `ahp-automations://` channel, keeping all catalogue subscribers synchronized
/// through the normal action stream.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchAutomationRunsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<JsonObject>,
    /// Target {@link AutomationState.resource}.
    pub automation: Uri,
    /// Cursor previously received as {@link AutomationState.runsNextCursor}.
    /// Omit to request the first page not already included by the snapshot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// Empty acknowledgement; the updated automation state is delivered by action.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchAutomationRunsResult {}

// ─── ChatSource Union ─────────────────────────────────────────────────

/// How a new chat uses a source chat.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ChatSource {
    #[serde(rename = "fork")]
    Fork(ForkChatSource),
    #[serde(rename = "sideChat")]
    SideChat(SideChatSource),
    /// Unknown or future variant — preserved as raw JSON for round-trip fidelity.
    /// Reducers treat this as a no-op.
    #[serde(untagged)]
    Unknown(serde_json::Value),
}

// ─── ReconnectResult Union ────────────────────────────────────────────

/// Result of the `reconnect` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ReconnectResult {
    #[serde(rename = "replay")]
    Replay(ReconnectReplayResult),
    #[serde(rename = "snapshot")]
    Snapshot(ReconnectSnapshotResult),
}

// ─── Changeset Operation Unions ───────────────────────────────────────

/// Identifies the file or range a `ChangesetOperation` should act on.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ChangesetOperationTarget {
    #[serde(rename = "resource")]
    Resource {
        resource: Uri,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        side: Option<String>,
    },
    #[serde(rename = "range")]
    Range {
        resource: Uri,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        side: Option<String>,
        range: TextRange,
    },
    #[serde(untagged)]
    Unknown(serde_json::Value),
}
