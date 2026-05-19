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
    ContentRef, MessageAttachment, ModelSelection, SessionActiveClient, SessionConfigSchema,
    SessionSummary, Snapshot, SnapshotState, TerminalClaim, Turn,
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

/// Encoding of fetched content data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ContentEncoding {
    #[serde(rename = "base64")]
    Base64,
    #[serde(rename = "utf-8")]
    Utf8,
}

/// The kind of completion items being requested.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CompletionItemKind {
    /// Completions for the text of a {@link UserMessage} the user is composing.
    /// Each returned item carries an attachment that gets associated with the
    /// message when accepted.
    #[serde(rename = "userMessage")]
    UserMessage,
}

// ─── Command Payloads ─────────────────────────────────────────────────

/// Establishes a new connection and negotiates the protocol version.
/// This MUST be the first message sent by the client.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Protocol versions the client is willing to speak, ordered from most
    /// preferred to least preferred. Each entry is a [SemVer](https://semver.org)
    /// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
    ///
    /// The server selects one entry and returns it as `InitializeResult.protocolVersion`.
    /// If the server cannot speak any of the offered versions, it MUST return
    /// error code `-32005` (`UnsupportedProtocolVersion`).
    pub protocol_versions: Vec<String>,
    /// Unique client identifier
    pub client_id: String,
    /// URIs to subscribe to during handshake
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_subscriptions: Option<Vec<Uri>>,
    /// IETF BCP 47 language tag indicating the client's preferred locale
    /// (e.g. `"en-US"`, `"ja"`). The server SHOULD use this to localise
    /// user-facing strings such as confirmation option labels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

/// Result of the `initialize` command.
///
/// `protocolVersion` is the version the server has selected from the client's
/// `protocolVersions` list. The client and server MUST use this version for
/// the rest of the connection. If the server cannot speak any of the offered
/// versions it MUST return error code `-32005` (`UnsupportedProtocolVersion`)
/// instead of a result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    /// Protocol version selected by the server. MUST be one of the entries in
    /// `InitializeParams.protocolVersions`. Formatted as a [SemVer](https://semver.org)
    /// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
    pub protocol_version: String,
    /// Current server sequence number
    pub server_seq: i64,
    /// Snapshots for each `initialSubscriptions` URI
    pub snapshots: Vec<Snapshot>,
    /// Suggested default directory for remote filesystem browsing
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_directory: Option<Uri>,
    /// Characters that, when typed in a {@link UserMessage} input, SHOULD cause
    /// the client to issue a `completions` request with
    /// {@link CompletionItemKind.UserMessage}. Typically includes characters like
    /// `'@'` or `'/'`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_trigger_characters: Option<Vec<String>>,
}

/// Re-establishes a dropped connection. The server replays missed actions or
/// provides fresh snapshots.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectParams {
    /// Channel URI this command targets.
    pub channel: Uri,
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
pub struct SessionForkSource {
    /// URI of the existing session to fork from
    pub session: Uri,
    /// Turn ID in the source session; content up to and including this turn's response is copied
    pub turn_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Agent provider ID
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Model selection (ID and optional model-specific configuration)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelSelection>,
    /// Working directory for the session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<Uri>,
    /// Fork from an existing session. The new session is populated with content
    /// from the source session up to and including the specified turn's response.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fork: Option<SessionForkSource>,
    /// Agent-specific configuration values collected via `resolveSessionConfig`.
    /// Keys and values correspond to the schema returned by the server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<JsonObject>,
    /// Eagerly claim the active client role for the new session.
    ///
    /// When provided, the server initializes the session with this client as the
    /// active client, equivalent to dispatching a `session/activeClientChanged`
    /// action immediately after creation. The `clientId` MUST match the
    /// `clientId` the creating client supplied in `initialize`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_client: Option<SessionActiveClient>,
}

/// Disposes a session and cleans up server-side resources.
///
/// The server broadcasts a `root/sessionRemoved` notification to all clients.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisposeSessionParams {
    /// Channel URI this command targets.
    pub channel: Uri,
}

/// Returns a list of session summaries. Used to populate session lists and sidebars.
///
/// The session list is **not** part of the state tree because it can be arbitrarily
/// large. Clients fetch it imperatively and maintain a local cache updated by
/// `root/sessionAdded` and `root/sessionRemoved` notifications.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Optional filter criteria
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<AnyValue>,
}

/// Result of the `listSessions` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsResult {
    /// The list of session summaries.
    pub items: Vec<SessionSummary>,
}

/// Reads the content of a resource by URI.
///
/// Content references keep the state tree small by storing large data (images,
/// long tool outputs) by reference rather than inline.
///
/// Binary content (images, etc.) MUST use `base64` encoding. Text content MAY
/// use `utf-8` encoding.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceReadParams {
    /// Channel URI this command targets.
    pub channel: Uri,
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
/// If the file does not exist, it is created. If the file already exists, it is
/// overwritten unless `createOnly` is set.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceWriteParams {
    /// Channel URI this command targets.
    pub channel: Uri,
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceListParams {
    /// Channel URI this command targets.
    pub channel: Uri,
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCopyParams {
    /// Channel URI this command targets.
    pub channel: Uri,
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDeleteParams {
    /// Channel URI this command targets.
    pub channel: Uri,
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceMoveParams {
    /// Channel URI this command targets.
    pub channel: Uri,
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

/// Fetches historical turns for a session. Used for lazy loading of conversation
/// history.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchTurnsParams {
    /// Channel URI this command targets.
    pub channel: Uri,
    /// Turn ID to fetch before (exclusive). Omit to fetch from the most recent turn.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    /// Maximum number of turns to return. Server MAY impose its own upper bound.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
}

/// Result of the `fetchTurns` command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchTurnsResult {
    /// The requested turns, ordered oldest-first
    pub turns: Vec<Turn>,
    /// Whether more turns exist before the returned range
    pub has_more: bool,
}

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
/// match a `ProtectedResourceMetadata.resource` value declared by an agent
/// in `AgentInfo.protectedResources`.
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
    /// The protected resource identifier. MUST match a `resource` value from
    /// `ProtectedResourceMetadata` declared in `AgentInfo.protectedResources`.
    pub resource: String,
    /// Bearer token obtained from the resource's authorization server
    pub token: String,
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
/// 2. Associate the item's `attachment` with the resulting {@link UserMessage}.
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
    /// positions in the final {@link UserMessage.text} after the item is
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
        range: ChangesetOperationTargetRange,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChangesetOperationTargetRange {
    pub start: i64,
    pub end: i64,
}
