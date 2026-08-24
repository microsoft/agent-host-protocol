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
import kotlinx.serialization.json.jsonObject
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
 * How a new chat uses its source chat and turn.
 */
@Serializable(with = ChatSourceKindSerializer::class)
@JvmInline
value class ChatSourceKind(val rawValue: String) {
    companion object {
        /**
         * Copy source history through the referenced turn into the new chat.
         */
        val FORK: ChatSourceKind = ChatSourceKind("fork")
        /**
         * Supply source context without copying it into the new chat's visible history.
         */
        val SIDE_CHAT: ChatSourceKind = ChatSourceKind("sideChat")
    }
}

internal object ChatSourceKindSerializer : KSerializer<ChatSourceKind> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ChatSourceKind", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: ChatSourceKind) {
        encoder.encodeString(value.rawValue)
    }
    override fun deserialize(decoder: Decoder): ChatSourceKind =
        ChatSourceKind(decoder.decodeString())
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
@Serializable(with = CompletionItemKindSerializer::class)
@JvmInline
value class CompletionItemKind(val rawValue: String) {
    companion object {
        /**
         * Completions for the text of a {@link Message} the user is composing.
         * Each returned item carries an attachment that gets associated with the
         * message when accepted.
         */
        val USER_MESSAGE: CompletionItemKind = CompletionItemKind("userMessage")
    }
}

internal object CompletionItemKindSerializer : KSerializer<CompletionItemKind> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("CompletionItemKind", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: CompletionItemKind) {
        encoder.encodeString(value.rawValue)
    }
    override fun deserialize(decoder: Decoder): CompletionItemKind =
        CompletionItemKind(decoder.decodeString())
}

/**
 * Discriminant for {@link ResourceResolveResult.type}.
 */
@Serializable(with = ResourceTypeSerializer::class)
@JvmInline
value class ResourceType(val rawValue: String) {
    companion object {
        val FILE: ResourceType = ResourceType("file")
        val DIRECTORY: ResourceType = ResourceType("directory")
        val SYMLINK: ResourceType = ResourceType("symlink")
    }
}

internal object ResourceTypeSerializer : KSerializer<ResourceType> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ResourceType", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: ResourceType) {
        encoder.encodeString(value.rawValue)
    }
    override fun deserialize(decoder: Decoder): ResourceType =
        ResourceType(decoder.decodeString())
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

/**
 * Copies source history through a completed turn into the new chat.
 */
@Serializable(with = ForkChatSourceSerializer::class)
data class ForkChatSource(
    /**
     * URI of the existing source chat.
     */
    val chat: URI,
    /**
     * Completed turn identifier in the source chat.
     *
     * Content through this turn is copied into the new chat's visible `turns`.
     */
    val turnId: String,

) {
    val kind: ChatSourceKind
        get() = ChatSourceKind.FORK
}

@Serializable
private data class ForkChatSourceWire(
    val kind: ChatSourceKind,
    val chat: URI,
    val turnId: String,
)

internal object ForkChatSourceSerializer : KSerializer<ForkChatSource> {
    override val descriptor: SerialDescriptor = ForkChatSourceWire.serializer().descriptor

    override fun deserialize(decoder: Decoder): ForkChatSource {
        val input = decoder as? JsonDecoder
            ?: error("ForkChatSource can only be deserialized from JSON")
        val wire = input.json.decodeFromJsonElement(ForkChatSourceWire.serializer(), input.decodeJsonElement())
        if (wire.kind != ChatSourceKind.FORK) {
            error("Expected ForkChatSource kind fork")
        }
        return ForkChatSource(chat = wire.chat, turnId = wire.turnId)
    }

    override fun serialize(encoder: Encoder, value: ForkChatSource) {
        val output = encoder as? JsonEncoder
            ?: error("ForkChatSource can only be serialized to JSON")
        val element = output.json.encodeToJsonElement(
            ForkChatSourceWire.serializer(),
            ForkChatSourceWire(kind = ChatSourceKind.FORK, chat = value.chat, turnId = value.turnId),
        )
        output.encodeJsonElement(element)
    }
}

/**
 * Supplies source context to a new side chat without copying it into the side
 * chat's visible history.
 */
@Serializable(with = SideChatSourceSerializer::class)
data class SideChatSource(
    /**
     * URI of the existing source chat.
     */
    val chat: URI,
    /**
     * Stable source-turn identifier in the source chat.
     *
     * Hosts resolve this id against the source chat's current `activeTurn` or its
     * retained `turns` when accepting `createChat`. If it names the current
     * active turn, the host snapshots the source chat's retained history plus
     * that turn's current user message and any partial assistant response already
     * available. Once that turn later becomes historical, it is still referenced
     * by this same identifier.
     */
    val turnId: String,
    /**
     * Optional immutable selected-text snapshot to carry into the created side
     * chat's origin.
     */
    val selection: SideChatSelection? = null,

) {
    val kind: ChatSourceKind
        get() = ChatSourceKind.SIDE_CHAT
}

@Serializable
private data class SideChatSourceWire(
    val kind: ChatSourceKind,
    val chat: URI,
    val turnId: String,
    val selection: SideChatSelection? = null,
)

internal object SideChatSourceSerializer : KSerializer<SideChatSource> {
    override val descriptor: SerialDescriptor = SideChatSourceWire.serializer().descriptor

    override fun deserialize(decoder: Decoder): SideChatSource {
        val input = decoder as? JsonDecoder
            ?: error("SideChatSource can only be deserialized from JSON")
        val wire = input.json.decodeFromJsonElement(SideChatSourceWire.serializer(), input.decodeJsonElement())
        if (wire.kind != ChatSourceKind.SIDE_CHAT) {
            error("Expected SideChatSource kind sideChat")
        }
        return SideChatSource(chat = wire.chat, turnId = wire.turnId, selection = wire.selection)
    }

    override fun serialize(encoder: Encoder, value: SideChatSource) {
        val output = encoder as? JsonEncoder
            ?: error("SideChatSource can only be serialized to JSON")
        val element = output.json.encodeToJsonElement(
            SideChatSourceWire.serializer(),
            SideChatSourceWire(kind = ChatSourceKind.SIDE_CHAT, chat = value.chat, turnId = value.turnId, selection = value.selection),
        )
        output.encodeJsonElement(element)
    }
}

@Serializable
data class InitializeParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Protocol versions the client is willing to speak, ordered from most
     * preferred to least preferred. Each entry is a [SemVer](https://semver.org)
     * `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
     *
     * The server selects one entry and returns it as `InitializeResult.protocolVersion`.
     * If the server cannot speak any of the offered versions, it MUST return
     * error code `-32005` (`UnsupportedProtocolVersion`) with required
     * `UnsupportedProtocolVersionErrorData` containing `supportedVersions`.
     */
    val protocolVersions: List<String>,
    /**
     * Unique client identifier
     */
    val clientId: String,
    /**
     * Optional identity of the client implementation (name and version).
     * Informational only — see {@link Implementation} for how it may and may not
     * be used. Distinct from {@link InitializeParams.clientId | `clientId`},
     * which is an opaque per-connection identifier used for reconnection, not a
     * human-readable implementation name.
     */
    val clientInfo: Implementation? = null,
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
     * Optional identity of the server implementation (name and version).
     * Informational only — see {@link Implementation} for how it may and may not
     * be used. Whereas {@link InitializeResult.protocolVersion | `protocolVersion`}
     * identifies the negotiated protocol, `serverInfo` identifies the host
     * software behind it.
     */
    val serverInfo: Implementation? = null,
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
     * Prefix that the host recognizes at the start of a user {@link Message.text}
     * as a shorthand for executing the remainder as a terminal command. Currently
     * the standardized convention is `"!"`; absence means the host does not
     * support command prefixes.
     */
    val terminalCommandPrefix: String? = null,
    /**
     * OTLP telemetry channels the host emits, if any. Each populated field is
     * either a literal `ahp-otlp:` channel URI or an RFC 6570 URI template a
     * client expands before subscribing (currently only the `logs` channel
     * defines a template variable, `{level}`, for subscriber-side severity
     * filtering). Clients MAY ignore signals they cannot process.
     */
    val telemetry: TelemetryCapabilities? = null,
    /**
     * Host-owned automation support. Presence means clients may subscribe to
     * `ahp-automations://` for {@link AutomationCatalogState}; absence means the
     * host does not expose an automation catalogue or automation commands.
     */
    val automations: AutomationCapabilities? = null
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
data class AutomationCapabilities(
    /**
     * Present when clients may dispatch {@link AutomationCreateRequestedAction}.
     */
    val create: AutomationCreateCapability? = null,
    /**
     * Present when definitions may contain {@link AutomationScheduleTrigger | schedule triggers}.
     */
    val schedules: AutomationScheduleCapabilities? = null,
    /**
     * Present when clients may request cancellation of `pending` or `running`
     * automation runs.
     */
    val runCancellation: AutomationRunCancellationCapability? = null,
    /**
     * Maximum terminal entries retained in {@link AutomationState.runs}. Active
     * runs are not counted toward the limit. Absence means the retention limit is
     * implementation-defined.
     */
    val runHistoryLimit: Long? = null
)

@Serializable
class AutomationCreateCapability

@Serializable
data class AutomationScheduleCapabilities(
    /**
     * Smallest permitted interval between consecutive occurrences produced by
     * {@link AutomationSchedule.expression}. Omission means no restriction beyond
     * the cron format's one-minute resolution.
     */
    val minIntervalMinutes: Long? = null
)

@Serializable
class AutomationRunCancellationCapability

@Serializable
data class Implementation(
    /**
     * Implementation name, e.g. a product or package identifier.
     */
    val name: String,
    /**
     * Implementation version. A [SemVer](https://semver.org) string is
     * recommended but not required.
     */
    val version: String? = null,
    /**
     * Optional human-readable display name.
     */
    val title: String? = null
)

@Serializable
data class ReconnectParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Optional delivery preferences for this subscription.
     *
     * Servers MAY use these preferences to buffer and coalesce high-frequency
     * updates while preserving the same reduced state. Omit this field for the
     * server's default delivery behavior.
     */
    val delivery: SubscriptionDeliveryOptions? = null,
    /**
     * Optional client-requested shape for the returned snapshot.
     *
     * Servers that do not understand a requested view ignore it and return their
     * default snapshot. Clients MUST tolerate receiving more state than requested.
     */
    val view: SubscribeView? = null
)

@Serializable
data class SubscribeView(
    /**
     * Advisory number of most-recent completed turns to expose in a chat
     * snapshot.
     *
     * Servers MAY return more or fewer turns than requested. When omitted, the
     * host MUST return all retained turns. When older turns remain available, the
     * returned {@link ChatState} carries `turnsNextCursor`; clients pass that
     * cursor to `fetchTurns` to ask the host to page more turns into the chat
     * state.
     */
    val turns: Long? = null
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
data class CreateSessionParams(
    /**
     * Session URI (client-chosen, e.g. `ahp-session:/<uuid>`)
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Agent provider ID
     */
    val provider: String? = null,
    /**
     * The working directories the session's agent is granted tool access to.
     * A session may span multiple directories; they are equal peers except when
     * the agent advertises a protected-primary capability. An
     * {@link MultipleWorkingDirectoriesCapability.immutablePrimary | immutable
     * primary} is fixed, while a
     * {@link MultipleWorkingDirectoriesCapability.primaryReplacement | replaceable
     * primary} is changed only with `session/workingDirectoryReplaced`.
     *
     * A client MUST NOT supply more than one entry unless the agent advertises
     * {@link AgentCapabilities.multipleWorkingDirectories}; a server without that
     * capability treats only the first entry as the session's working directory
     * and ignores the rest. Dispatch working-directory actions to change the set
     * after the session has started.
     */
    val workingDirectories: List<String>? = null,
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
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class CreateChatParams(
    /**
     * Session URI containing the new chat.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`).
     */
    val chat: String,
    /**
     * Optional initial message for the new chat.
     */
    val initialMessage: Message? = null,
    /**
     * Optional source chat and source turn.
     *
     * The source chat MUST belong to this session. Clients MUST only request
     * `kind: "fork"` when the selected agent advertises
     * `capabilities.multipleChats.fork`, and `kind: "sideChat"` when the
     * selected agent advertises `capabilities.multipleChats.sideChat`. Both
     * source forms carry a stable top-level `turnId`. Forks target completed
     * turns. Side chats also carry a stable `turnId`, which the host resolves
     * against the source chat's current active turn or retained history. If it
     * resolves to the active turn, the host snapshots the currently available
     * partial response when accepting `createChat`. When
     * `source.kind === "sideChat"` and `source.selection` is present, the host
     * also snapshots and preserves that exact selected text in the created chat's
     * origin; any `responsePartId` there is provenance only, not a live range.
     */
    val source: ChatSource? = null,
    /**
     * Initial working-directory subset for this chat. Every entry MUST be
     * present in the owning session's `workingDirectories`; the server MUST
     * reject any entry that is not. When absent, the chat inherits the full
     * session set. Forked chats (those whose `source.kind` is `"fork"`) inherit
     * the source chat's `workingDirectories`; this field is ignored for forks.
     *
     * A client MUST NOT supply this field unless the agent advertises
     * {@link AgentCapabilities.multipleWorkingDirectories}.
     */
    val workingDirectories: List<String>? = null
)

@Serializable
data class DisposeChatParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ListSessionsParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Maximum number of entries to return in this page. The server SHOULD respect
     * this bound but MAY return fewer entries and MAY impose its own upper cap.
     * Omit to let the server choose the page size.
     */
    val limit: Long? = null,
    /**
     * Opaque pagination cursor from a previous {@link PaginatedResult.nextCursor}.
     * Omit to fetch the first page. Cursors are server-defined and MUST be treated
     * as opaque — do not parse, modify, or persist them across connections. An
     * unrecognised cursor SHOULD be rejected with an `InvalidParams` error.
     */
    val cursor: String? = null
)

@Serializable
data class ListSessionsResult(
    /**
     * Opaque cursor for the next page. Present when more entries exist beyond the
     * returned page; absent signals the end of the collection. Pass it back as
     * {@link PaginatedParams.cursor} to fetch the following page.
     */
    val nextCursor: String? = null,
    /**
     * The list of session summaries. The server SHOULD order them
     * most-recently-modified first.
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Chat URI
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Opaque cursor from `ChatState.turnsNextCursor`.
     *
     * The host MUST reject unrecognised cursors with `InvalidParams`. Omit only
     * when asking the host to opportunistically load its next older page for the
     * chat, if any.
     */
    val cursor: String? = null
)

@Serializable
class FetchTurnsResult

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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * The protected resource identifier. MUST match a `resource` value the
     * server has advertised — via `ProtectedResourceMetadata` in
     * `AgentInfo.protectedResources`, or via a live
     * `McpServerAuthRequiredState.resource` / `ToolCallAuthRequiredState.auth.resource`.
     */
    val resource: String,
    /**
     * Bearer token obtained from the resource's authorization server
     */
    val token: String,
    /**
     * OAuth scopes the token grants, when known. Lets the server determine
     * whether a specific challenge — e.g. the `requiredScopes` on a live
     * `McpServerAuthRequiredState` or `ToolCallAuthRequiredState.auth` — is
     * satisfied without decoding the (opaque, server-specific) token itself.
     * Omit when the client doesn't track granted scopes separately from the
     * token.
     */
    val scopes: List<String>? = null
)

@Serializable
class AuthenticateResult

@Serializable
data class CreateTerminalParams(
    /**
     * Terminal URI (client-chosen).
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ResolveSessionConfigParams(
    /**
     * Channel URI this command targets.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * The chat URI the completion is being requested for.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * The expanded changeset URI.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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

@Serializable
data class ListAutomationTriggerDefinitionsParams(
    /**
     * Trigger definitions are discovered from the root channel.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Prospective provider id matching {@link AgentInfo.provider}, or omitted for the host default.
     */
    val provider: String? = null,
    /**
     * Prospective {@link AutomationSessionTemplate.workingDirectories}.
     */
    val workingDirectories: List<String>? = null,
    /**
     * Prospective resolved {@link AutomationSessionTemplate.config}.
     */
    val sessionConfig: Map<String, JsonElement>? = null
)

@Serializable
data class ListAutomationTriggerDefinitionsResult(
    /**
     * Available event trigger definitions.
     */
    val items: List<AutomationTriggerDefinition>
)

@Serializable
data class RunAutomationParams(
    /**
     * Manual runs are scoped to the catalogue channel.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Target {@link AutomationState.resource}.
     */
    val automation: String,
    /**
     * Durable client-generated idempotency key. Retrying with the same key and
     * automation MUST return the original run URI rather than create another
     * run.
     */
    val requestId: String
)

@Serializable
data class RunAutomationResult(
    /**
     * Subscribable `ahp-automation-run:` URI matching {@link AutomationRunState.resource}.
     */
    val resource: String
)

@Serializable
data class FetchAutomationRunsParams(
    /**
     * Run-history loading is scoped to the catalogue channel.
     */
    val channel: String,
    /**
     * Optional JSON-serializable metadata associated with this request.
     * Receivers MUST ignore keys they do not understand.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Target {@link AutomationState.resource}.
     */
    val automation: String,
    /**
     * Cursor previously received as {@link AutomationState.runsNextCursor}.
     * Omit to request the first page not already included by the snapshot.
     */
    val cursor: String? = null
)

@Serializable
class FetchAutomationRunsResult

// ─── ChatSource Union ───────────────────────────────────────────────────────

@Serializable(with = ChatSourceSerializer::class)
sealed interface ChatSource

@JvmInline
value class ChatSourceFork(val value: ForkChatSource) : ChatSource
@JvmInline
value class ChatSourceSideChat(val value: SideChatSource) : ChatSource
/**
 * Forward-compat catch-all for unknown ChatSource discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ChatSourceUnknown(val raw: JsonObject) : ChatSource

internal object ChatSourceSerializer : KSerializer<ChatSource> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ChatSource")

    override fun deserialize(decoder: Decoder): ChatSource {
        val input = decoder as? JsonDecoder
            ?: error("ChatSource can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ChatSource")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return ChatSourceUnknown(obj)
        return when (discriminant) {
            "fork" -> ChatSourceFork(input.json.decodeFromJsonElement(ForkChatSource.serializer(), element))
            "sideChat" -> ChatSourceSideChat(input.json.decodeFromJsonElement(SideChatSource.serializer(), element))
            else -> ChatSourceUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ChatSource) {
        val output = encoder as? JsonEncoder
            ?: error("ChatSource can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChatSourceFork -> output.json.encodeToJsonElement(ForkChatSource.serializer(), value.value)
            is ChatSourceSideChat -> output.json.encodeToJsonElement(SideChatSource.serializer(), value.value)
            is ChatSourceUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

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
