// Generated from types/*.ts — do not edit

package com.microsoft.agenthostprotocol.generated

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull

// ─── Command Enums ──────────────────────────────────────────────────────────

/**
 * Discriminant for reconnect result types.
 */
@Serializable
enum class ReconnectResultType {
    @SerialName("replay")
    REPLAY,
    @SerialName("snapshot")
    SNAPSHOT
}

/**
 * Encoding of fetched content data.
 */
@Serializable
enum class ContentEncoding {
    @SerialName("base64")
    BASE64,
    @SerialName("utf-8")
    UTF8
}

/**
 * The kind of completion items being requested.
 */
@Serializable
enum class CompletionItemKind {
    /**
     * Completions for the text of a {@link Message} the user is composing.
     * Each returned item carries an attachment that gets associated with the
     * message when accepted.
     */
    @SerialName("userMessage")
    USER_MESSAGE
}

/**
 * Discriminant for {@link ResourceResolveResult.type}.
 */
@Serializable
enum class ResourceType {
    @SerialName("file")
    FILE,
    @SerialName("directory")
    DIRECTORY,
    @SerialName("symlink")
    SYMLINK
}

/**
 * How {@link ResourceWriteParams.data} is placed within the target file.
 *
 * Each mode interprets {@link ResourceWriteParams.position} differently:
 *
 * - `truncate` (default): rooted at the **start** of the file. The file is
 * truncated at `position` (0 by default) and `data` is written from that
 * offset, so the resulting file is `existing[0..position] + data`. With
 * `position` omitted this is a full overwrite.
 * - `append`: rooted at the **end** of the file. `position` counts bytes
 * backwards from EOF, so `position: 0` (the default) writes at EOF —
 * POSIX append — and `position: 5` inserts `data` 5 bytes before the
 * current EOF, shifting those trailing 5 bytes after the inserted region.
 * The server MUST evaluate the effective EOF and write atomically with
 * respect to other appenders so concurrent `append` writes do not
 * clobber each other.
 * - `insert`: rooted at the **start** of the file. `position` (0 by default)
 * is the byte offset at which `data` is spliced in; bytes at or after
 * `position` are shifted right by `data.length`. `insert` always grows
 * the file — use `truncate` to overwrite bytes in place.
 */
@Serializable
enum class ResourceWriteMode {
    @SerialName("truncate")
    TRUNCATE,
    @SerialName("append")
    APPEND,
    @SerialName("insert")
    INSERT
}

// ─── Command Types ──────────────────────────────────────────────────────────

@Serializable
data class InitializeParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Protocol versions the client is willing to speak, ordered from most
     * preferred to least preferred. Each entry is a [SemVer](https://semver.org)
     * `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
     *
     * The server selects one entry and returns it as `InitializeResult.protocolVersion`.
     * If the server cannot speak any of the offered versions, it MUST return
     * error code `-32005` (`UnsupportedProtocolVersion`).
     */
    val protocolVersions: List<String>,
    /**
     * Unique client identifier
     */
    val clientId: String,
    /**
     * URIs to subscribe to during handshake
     */
    val initialSubscriptions: List<String>? = null,
    /**
     * IETF BCP 47 language tag indicating the client's preferred locale
     * (e.g. `"en-US"`, `"ja"`). The server SHOULD use this to localise
     * user-facing strings such as confirmation option labels.
     */
    val locale: String? = null,
    /**
     * Optional client capability declarations.
     *
     * Servers SHOULD only advertise features whose corresponding client
     * capability is set here. Absent means "not declared" — the server
     * MUST assume the client does not support the feature.
     */
    val capabilities: ClientCapabilities? = null
)

@Serializable
data class InitializeResult(
    /**
     * Protocol version selected by the server. MUST be one of the entries in
     * `InitializeParams.protocolVersions`. Formatted as a [SemVer](https://semver.org)
     * `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
     */
    val protocolVersion: String,
    /**
     * Current server sequence number
     */
    val serverSeq: Long,
    /**
     * Snapshots for each `initialSubscriptions` URI
     */
    val snapshots: List<Snapshot>,
    /**
     * Suggested default directory for remote filesystem browsing
     */
    val defaultDirectory: String? = null,
    /**
     * Characters that, when typed in a {@link Message} input, SHOULD cause
     * the client to issue a `completions` request with
     * {@link CompletionItemKind.UserMessage}. Typically includes characters like
     * `'@'` or `'/'`.
     */
    val completionTriggerCharacters: List<String>? = null,
    /**
     * OTLP telemetry channels the host emits, if any. Each populated field is
     * either a literal `ahp-otlp:` channel URI or an RFC 6570 URI template a
     * client expands before subscribing (currently only the `logs` channel
     * defines a template variable, `{level}`, for subscriber-side severity
     * filtering). Clients MAY ignore signals they cannot process.
     */
    val telemetry: TelemetryCapabilities? = null
)

@Serializable
data class ClientCapabilities(
    /**
     * Client can render
     * [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) — i.e.
     * it can host the View sandbox, run the `ui/​*` protocol against it,
     * and forward `mcp://`-channel traffic on the App's behalf.
     *
     * Hosts SHOULD only populate
     * {@link McpServerCustomization.mcpApp | `McpServerCustomization.mcpApp`}
     * (and expose the corresponding
     * {@link McpServerCustomization.channel | `mcp://` channel}) when this
     * capability is declared. Clients that omit it MUST treat
     * App-bearing tool calls as ordinary MCP tool calls.
     */
    val mcpApps: Map<String, JsonElement>? = null
)

@Serializable
data class ReconnectParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Client identifier from the original connection
     */
    val clientId: String,
    /**
     * Last `serverSeq` the client received
     */
    val lastSeenServerSeq: Long,
    /**
     * URIs the client was subscribed to
     */
    val subscriptions: List<String>
)

@Serializable
data class ReconnectReplayResult(
    /**
     * Discriminant
     */
    val type: ReconnectResultType,
    /**
     * Missed action envelopes since `lastSeenServerSeq`
     */
    val actions: List<ActionEnvelope>,
    /**
     * URIs from `ReconnectParams.subscriptions` that the server cannot resume.
     * This includes resources that no longer exist (e.g. disposed sessions or
     * terminals) as well as resources the client is no longer permitted to
     * observe. Clients SHOULD drop these from their local subscription set.
     */
    val missing: List<String>
)

@Serializable
data class ReconnectSnapshotResult(
    /**
     * Discriminant
     */
    val type: ReconnectResultType,
    /**
     * Fresh snapshots for each subscription
     */
    val snapshots: List<Snapshot>
)

@Serializable
data class SubscribeParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Optional delivery preferences for this subscription.
     *
     * Servers MAY use these preferences to buffer and coalesce high-frequency
     * updates while preserving the same reduced state. Omit this field for the
     * server's default delivery behavior.
     */
    val delivery: SubscriptionDeliveryOptions? = null
)

@Serializable
data class SubscriptionDeliveryOptions(
    /**
     * Maximum time, in milliseconds, that the server may intentionally delay
     * delivery while buffering/coalescing updates for this subscription.
     *
     * A value of `0` requests immediate delivery with no intentional coalescing.
     */
    val maxLatencyMs: Long? = null
)

@Serializable
data class SubscribeResult(
    /**
     * Snapshot of the subscribed channel's state (omitted for stateless channels)
     */
    val snapshot: Snapshot? = null
)

@Serializable
data class SessionForkSource(
    /**
     * URI of the existing session to fork from
     */
    val session: String,
    /**
     * Turn ID in the source session; content up to and including this turn's response is copied
     */
    val turnId: String
)

@Serializable
data class CreateSessionParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Agent provider ID
     */
    val provider: String? = null,
    /**
     * Working directory for the session
     */
    val workingDirectory: String? = null,
    /**
     * Fork from an existing session. The new session is populated with content
     * from the source session up to and including the specified turn's response.
     */
    val fork: SessionForkSource? = null,
    /**
     * Agent-specific configuration values collected via `resolveSessionConfig`.
     * Keys and values correspond to the schema returned by the server.
     */
    val config: Map<String, JsonElement>? = null,
    /**
     * Eagerly claim an active client role for the new session.
     *
     * When provided, the server initializes the session with this client as an
     * active client, equivalent to dispatching a `session/activeClientSet`
     * action immediately after creation. The `clientId` MUST match the
     * `clientId` the creating client supplied in `initialize`.
     */
    val activeClient: SessionActiveClient? = null,
    /**
     * Opt-in progress token. When set, the client is offering to receive
     * `progress` notifications (see `ProgressParams`) for any long-running work
     * the server does to bring this session up — most notably the lazy,
     * first-use download of the provider's native SDK. The server echoes this
     * exact token on every `progress` frame so the client can correlate it to
     * this `createSession` call (and the UI awaiting it).
     *
     * The token MUST be unique across the client's active requests. The server
     * MAY ignore it (e.g. when nothing long-running is needed), in which case no
     * `progress` notifications are emitted.
     */
    val progressToken: String? = null
)

@Serializable
data class DisposeSessionParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String
)

@Serializable
data class ChatForkSource(
    /**
     * URI of the existing chat to fork from
     */
    val chat: String,
    /**
     * Turn ID in the source chat; content up to and including this turn's response is copied
     */
    val turnId: String
)

@Serializable
data class CreateChatParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`).
     */
    val chat: String,
    /**
     * Optional initial message for the new chat.
     */
    val initialMessage: Message? = null,
    /**
     * Optional source chat and turn to fork from.
     */
    val source: ChatForkSource? = null
)

@Serializable
data class DisposeChatParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String
)

@Serializable
data class ListSessionsParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Optional filter criteria
     */
    val filter: JsonElement? = null
)

@Serializable
data class ListSessionsResult(
    /**
     * The list of session summaries.
     */
    val items: List<SessionSummary>
)

@Serializable
data class ResourceReadParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Content URI from a `ContentRef`
     */
    val uri: String,
    /**
     * Preferred encoding for the returned data (default: server-chosen)
     */
    val encoding: ContentEncoding? = null
)

@Serializable
data class ResourceReadResult(
    /**
     * Content encoded as a string
     */
    val data: String,
    /**
     * How `data` is encoded
     */
    val encoding: ContentEncoding,
    /**
     * Content type (e.g. `"image/png"`, `"text/plain"`)
     */
    val contentType: String? = null
)

@Serializable
data class ResourceWriteParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Target file URI on the server filesystem
     */
    val uri: String,
    /**
     * Content encoded as a string
     */
    val data: String,
    /**
     * How `data` is encoded
     */
    val encoding: ContentEncoding,
    /**
     * Content type (e.g. `"text/plain"`, `"image/png"`)
     */
    val contentType: String? = null,
    /**
     * If `true`, the server MUST fail if the file already exists instead of
     * overwriting it. Useful for safe creation of new files.
     */
    val createOnly: Boolean? = null,
    /**
     * How `data` is placed within the target file. Defaults to `'truncate'`
     * (full overwrite) when omitted. See {@link ResourceWriteMode} for the
     * meaning of each mode and how it interprets {@link position}.
     */
    val mode: ResourceWriteMode? = null,
    /**
     * Byte offset interpreted according to {@link mode}. Defaults to `0`.
     * - `truncate`: offset from the start of the file at which to truncate
     * before writing.
     * - `append`: bytes back from EOF at which to insert `data`.
     * - `insert`: offset from the start of the file at which to splice in
     * `data`.
     */
    val position: Long? = null,
    /**
     * Optimistic-concurrency token previously returned by
     * {@link ResourceResolveResult.etag}. When set, the server MUST fail with
     * `Conflict` if the current `etag` does not match — preventing lost
     * updates between a `resourceResolve` and a subsequent `resourceWrite`.
     */
    val ifMatch: String? = null
)

@Serializable
class ResourceWriteResult

@Serializable
data class ResourceListParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Directory URI on the server filesystem
     */
    val uri: String
)

@Serializable
data class ResourceListResult(
    /**
     * Entries directly contained in the requested directory
     */
    val entries: List<DirectoryEntry>
)

@Serializable
data class DirectoryEntry(
    /**
     * Base name of the entry
     */
    val name: String,
    /**
     * Whether the entry is a file or directory
     */
    val type: String
)

@Serializable
data class ResourceCopyParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Source URI to copy from
     */
    val source: String,
    /**
     * Destination URI to copy to
     */
    val destination: String,
    /**
     * If `true`, the server MUST fail if the destination already exists instead
     * of overwriting it.
     */
    val failIfExists: Boolean? = null
)

@Serializable
class ResourceCopyResult

@Serializable
data class ResourceDeleteParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * URI of the resource to delete
     */
    val uri: String,
    /**
     * If `true` and the target is a directory, delete it and all its contents
     * recursively. If `false` (default), deleting a non-empty directory MUST fail.
     */
    val recursive: Boolean? = null
)

@Serializable
class ResourceDeleteResult

@Serializable
data class ResourceMoveParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Source URI to move from
     */
    val source: String,
    /**
     * Destination URI to move to
     */
    val destination: String,
    /**
     * If `true`, the server MUST fail if the destination already exists instead
     * of overwriting it.
     */
    val failIfExists: Boolean? = null
)

@Serializable
class ResourceMoveResult

@Serializable
data class ResourceResolveParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * URI to resolve
     */
    val uri: String,
    /**
     * When `true` (default), follow symlinks and report the metadata of the
     * link target — and set `uri` in the result to the canonical (realpath)
     * URI. When `false`, stat the link itself (lstat semantics) and report
     * `type: 'symlink'`.
     */
    val followSymlinks: Boolean? = null
)

@Serializable
data class ResourceResolveResult(
    /**
     * Canonical URI after symlink resolution. Equal to the requested URI when
     * `followSymlinks` is `false` or the URI does not traverse a symlink.
     */
    val uri: String,
    /**
     * Resource kind.
     */
    val type: ResourceType,
    /**
     * Size in bytes. Omitted for directories when the provider cannot
     * cheaply compute it.
     */
    val size: Long? = null,
    /**
     * Last-modified time in ISO 8601 format, when known.
     */
    val mtime: String? = null,
    /**
     * Creation time in ISO 8601 format, when known.
     */
    val ctime: String? = null,
    /**
     * Sniffed MIME type, when known (e.g. `"text/plain"`, `"image/png"`).
     */
    val contentType: String? = null,
    /**
     * Opaque per-provider version token. When present, pass it as
     * {@link ResourceWriteParams.ifMatch} on a subsequent `resourceWrite` to
     * detect concurrent modifications.
     */
    val etag: String? = null
)

@Serializable
data class ResourceMkdirParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Directory URI to create (parents created as needed).
     */
    val uri: String
)

@Serializable
class ResourceMkdirResult

@Serializable
data class ResourceRequestParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Resource URI being requested. Typically a `file:` URI on the receiver's
     * filesystem, but any URI scheme that the receiver mediates access to is
     * allowed.
     */
    val uri: String,
    /**
     * Whether the caller needs read access to the resource.
     */
    val read: Boolean? = null,
    /**
     * Whether the caller needs write access to the resource.
     */
    val write: Boolean? = null
)

@Serializable
class ResourceRequestResult

@Serializable
data class CreateResourceWatchParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * URI to watch.
     */
    val uri: String,
    /**
     * If `true`, the receiver MUST report changes for descendants of `uri`.
     * If `false` (default), only changes to `uri` itself — and, when `uri`
     * is a directory, its direct children — are reported.
     */
    val recursive: Boolean? = null,
    /**
     * Glob patterns or paths relative to `uri` to exclude from reporting.
     * Wrapped in `{ items }` for forward compatibility.
     */
    val excludes: JsonElement? = null,
    /**
     * Glob patterns or paths relative to `uri` to restrict reporting to.
     * Omit to report every change under `uri` subject to `excludes`.
     * Wrapped in `{ items }` for forward compatibility.
     */
    val includes: JsonElement? = null
)

@Serializable
data class CreateResourceWatchResult(
    /**
     * Receiver-assigned watch channel URI (`ahp-resource-watch:/<id>`). The
     * caller subscribes to this URI to start receiving change events and
     * unsubscribes to release the watcher.
     */
    val channel: String
)

@Serializable
data class FetchTurnsParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Turn ID to fetch before (exclusive). Omit to fetch from the most recent turn.
     */
    val before: String? = null,
    /**
     * Maximum number of turns to return. Server MAY impose its own upper bound.
     */
    val limit: Long? = null
)

@Serializable
data class FetchTurnsResult(
    /**
     * The requested turns, ordered oldest-first
     */
    val turns: List<Turn>,
    /**
     * Whether more turns exist before the returned range
     */
    val hasMore: Boolean
)

@Serializable
data class UnsubscribeParams(
    /**
     * Channel URI to unsubscribe from
     */
    val channel: String
)

@Serializable
data class DispatchActionParams(
    /**
     * Channel URI this action targets
     */
    val channel: String,
    /**
     * Client sequence number
     */
    val clientSeq: Long,
    /**
     * The action to dispatch
     */
    val action: StateAction
)

@Serializable
data class AuthenticateParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * The protected resource identifier. MUST match a `resource` value from
     * `ProtectedResourceMetadata` declared in `AgentInfo.protectedResources`.
     */
    val resource: String,
    /**
     * Bearer token obtained from the resource's authorization server
     */
    val token: String
)

@Serializable
class AuthenticateResult

@Serializable
data class CreateTerminalParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Initial owner of the terminal
     */
    val claim: TerminalClaim,
    /**
     * Human-readable terminal name
     */
    val name: String? = null,
    /**
     * Initial working directory URI
     */
    val cwd: String? = null,
    /**
     * Initial terminal width in columns
     */
    val cols: Long? = null,
    /**
     * Initial terminal height in rows
     */
    val rows: Long? = null
)

@Serializable
data class DisposeTerminalParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String
)

@Serializable
data class ResolveSessionConfigParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Agent provider ID
     */
    val provider: String? = null,
    /**
     * Working directory for the session
     */
    val workingDirectory: String? = null,
    /**
     * Current user-filled configuration values
     */
    val config: Map<String, JsonElement>? = null
)

@Serializable
data class ResolveSessionConfigResult(
    /**
     * JSON Schema describing available configuration properties given the current context
     */
    val schema: SessionConfigSchema,
    /**
     * Current configuration values (echoed back with server-resolved defaults applied)
     */
    val values: Map<String, JsonElement>
)

@Serializable
data class SessionConfigPropertySchema(
    /**
     * JSON Schema: property type
     */
    val type: String,
    /**
     * JSON Schema: human-readable label for the property
     */
    val title: String,
    /**
     * JSON Schema: description / tooltip
     */
    val description: String? = null,
    /**
     * JSON Schema: default value
     */
    val default: JsonElement? = null,
    /**
     * JSON Schema: allowed values. May be primitives of any JSON type.
     */
    val enum: List<JsonElement>? = null,
    /**
     * Display extension: human-readable label per enum value (parallel array)
     */
    val enumLabels: List<String>? = null,
    /**
     * Display extension: description per enum value (parallel array)
     */
    val enumDescriptions: List<String>? = null,
    /**
     * JSON Schema: when `true`, the property is displayed but cannot be modified by the user
     */
    val readOnly: Boolean? = null,
    /**
     * JSON Schema: schema for array items (used when `type` is `'array'`)
     */
    val items: ConfigPropertySchema? = null,
    /**
     * JSON Schema: property descriptors for object properties (used when `type` is `'object'`)
     */
    val properties: Map<String, ConfigPropertySchema>? = null,
    /**
     * JSON Schema: list of required property ids (used when `type` is `'object'`)
     */
    val required: List<String>? = null,
    /**
     * JSON Schema: schema for additional properties not listed in `properties` (used when `type` is `'object'`).
     */
    val additionalProperties: ConfigPropertySchema? = null,
    /**
     * Display extension: when `true`, the full set of allowed values is too large
     * to enumerate statically. The client SHOULD use `sessionConfigCompletions`
     * to fetch matching values based on user input. Any values in `enum` are
     * seed/recent values for initial display.
     */
    val enumDynamic: Boolean? = null,
    /**
     * When `true`, the user may change this property after session creation
     */
    val sessionMutable: Boolean? = null
)

@Serializable
data class SessionConfigSchema(
    /**
     * JSON Schema: always `'object'`
     */
    val type: String,
    /**
     * JSON Schema: property descriptors keyed by property id
     */
    val properties: Map<String, SessionConfigPropertySchema>,
    /**
     * JSON Schema: list of required property ids
     */
    val required: List<String>? = null
)

@Serializable
data class SessionConfigCompletionsParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Agent provider ID
     */
    val provider: String? = null,
    /**
     * Working directory for the session
     */
    val workingDirectory: String? = null,
    /**
     * Current user-filled configuration values (provides context for the query)
     */
    val config: Map<String, JsonElement>? = null,
    /**
     * Property id from the schema to query values for
     */
    val property: String,
    /**
     * Search filter text (empty or omitted returns default/recent values)
     */
    val query: String? = null
)

@Serializable
data class SessionConfigCompletionsResult(
    /**
     * Matching value items
     */
    val items: List<SessionConfigValueItem>
)

@Serializable
data class SessionConfigValueItem(
    /**
     * The value to store in config
     */
    val value: String,
    /**
     * Human-readable display label
     */
    val label: String,
    /**
     * Optional secondary description
     */
    val description: String? = null
)

@Serializable
data class CompletionsParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * What kind of completion is being requested.
     */
    val kind: CompletionItemKind,
    /**
     * The complete text of the input being completed (e.g. the full user
     * message text typed so far).
     */
    val text: String,
    /**
     * The character offset within `text` at which the completion is requested,
     * measured in UTF-16 code units. MUST satisfy `0 <= offset <= text.length`.
     */
    val offset: Long
)

@Serializable
data class CompletionItem(
    /**
     * The text inserted into the input when this item is accepted.
     */
    val insertText: String,
    /**
     * If defined, the start of the range in the input's `text` that is replaced
     * by `insertText`. The range is the half-open interval
     * `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
     * units.
     *
     * When omitted, the client SHOULD insert `insertText` at the cursor.
     *
     * Note: this range refers to positions in the *current* input. The
     * attachment's own `rangeStart`/`rangeEnd` (when present) refer to
     * positions in the final {@link Message.text} after the item is
     * accepted.
     */
    val rangeStart: Long? = null,
    /**
     * The end of the range in the input's `text` that is replaced by
     * `insertText`. See {@link rangeStart}.
     */
    val rangeEnd: Long? = null,
    /**
     * The attachment associated with this completion item.
     */
    val attachment: MessageAttachment
)

@Serializable
data class CompletionsResult(
    /**
     * The completion items, in the order the server suggests displaying them.
     */
    val items: List<CompletionItem>
)

@Serializable
data class InvokeChangesetOperationParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Matches {@link ChangesetOperation.id} from the changeset's `operations` list.
     */
    val operationId: String,
    /**
     * Target of the operation. Required iff the chosen scope is
     * `'resource'` or `'range'`. Omit for changeset-scoped operations.
     */
    val target: ChangesetOperationTarget? = null
)

@Serializable
data class InvokeChangesetOperationResult(
    /**
     * Optional human-readable message describing the result.
     */
    val message: StringOrMarkdown? = null,
    /**
     * Optional follow-up: a URI to open (e.g. a PR), a content ref, etc.
     */
    val followUp: ChangesetOperationFollowUp? = null
)

@Serializable
data class ChangesetOperationFollowUp(
    val content: ContentRef,
    /**
     * When `true`, open in an external handler rather than inline.
     */
    val external: Boolean? = null
)

// ─── ReconnectResult Union ──────────────────────────────────────────────────

@Serializable(with = ReconnectResultSerializer::class)
sealed interface ReconnectResult

@JvmInline
value class ReconnectResultReplay(val value: ReconnectReplayResult) : ReconnectResult
@JvmInline
value class ReconnectResultSnapshot(val value: ReconnectSnapshotResult) : ReconnectResult

internal object ReconnectResultSerializer : KSerializer<ReconnectResult> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ReconnectResult")

    override fun deserialize(decoder: Decoder): ReconnectResult {
        val input = decoder as? JsonDecoder
            ?: error("ReconnectResult can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ReconnectResult")
        val discriminant = (obj["type"] as? JsonPrimitive)?.content
            ?: error("Missing type discriminator on ReconnectResult")
        return when (discriminant) {
            "replay" -> ReconnectResultReplay(input.json.decodeFromJsonElement(ReconnectReplayResult.serializer(), element))
            "snapshot" -> ReconnectResultSnapshot(input.json.decodeFromJsonElement(ReconnectSnapshotResult.serializer(), element))
            else -> error("Unknown ReconnectResult discriminator: $discriminant")
        }
    }

    override fun serialize(encoder: Encoder, value: ReconnectResult) {
        val output = encoder as? JsonEncoder
            ?: error("ReconnectResult can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ReconnectResultReplay -> output.json.encodeToJsonElement(ReconnectReplayResult.serializer(), value.value)
            is ReconnectResultSnapshot -> output.json.encodeToJsonElement(ReconnectSnapshotResult.serializer(), value.value)
        }
        output.encodeJsonElement(element)
    }
}

// ─── Changeset Operation Unions ─────────────────────────────────────────────

/**
 * Identifies the file or range a [ChangesetOperation] should act on.
 */
@Serializable(with = ChangesetOperationTargetSerializer::class)
sealed interface ChangesetOperationTarget {
    @JvmInline value class Resource(val value: ChangesetOperationResourceTarget) : ChangesetOperationTarget
    @JvmInline value class Range(val value: ChangesetOperationRangeTarget) : ChangesetOperationTarget
}

@Serializable
data class ChangesetOperationResourceTarget(
    val resource: String,
    val side: String? = null,
    /** Discriminator. Always "resource". */
    val kind: String = "resource",
)

@Serializable
data class ChangesetOperationRangeTarget(
    val resource: String,
    val side: String? = null,
    val range: TextRange,
    /** Discriminator. Always "range". */
    val kind: String = "range",
)

internal object ChangesetOperationTargetSerializer : KSerializer<ChangesetOperationTarget> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ChangesetOperationTarget")

    override fun deserialize(decoder: Decoder): ChangesetOperationTarget {
        val input = decoder as? JsonDecoder
            ?: error("ChangesetOperationTarget can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ChangesetOperationTarget")
        val kind = (obj["kind"] as? JsonPrimitive)?.contentOrNull
            ?: error("Missing kind discriminator on ChangesetOperationTarget")
        return when (kind) {
            "resource" -> ChangesetOperationTarget.Resource(
                input.json.decodeFromJsonElement(ChangesetOperationResourceTarget.serializer(), element),
            )
            "range" -> ChangesetOperationTarget.Range(
                input.json.decodeFromJsonElement(ChangesetOperationRangeTarget.serializer(), element),
            )
            else -> error("Unknown ChangesetOperationTarget kind: $kind")
        }
    }

    override fun serialize(encoder: Encoder, value: ChangesetOperationTarget) {
        val output = encoder as? JsonEncoder
            ?: error("ChangesetOperationTarget can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChangesetOperationTarget.Resource ->
                output.json.encodeToJsonElement(ChangesetOperationResourceTarget.serializer(), value.value)
            is ChangesetOperationTarget.Range ->
                output.json.encodeToJsonElement(ChangesetOperationRangeTarget.serializer(), value.value)
        }
        output.encodeJsonElement(element)
    }
}
