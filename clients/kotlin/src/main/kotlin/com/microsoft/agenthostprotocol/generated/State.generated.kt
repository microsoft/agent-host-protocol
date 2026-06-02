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

// ─── Type Aliases ───────────────────────────────────────────────────────────

typealias URI = String

// ─── StringOrMarkdown ───────────────────────────────────────────────────────

/**
 * A value that is either a plain string or a markdown-formatted string.
 */
@Serializable(with = StringOrMarkdownSerializer::class)
sealed interface StringOrMarkdown {
    @JvmInline value class Plain(val value: String) : StringOrMarkdown
    @JvmInline value class Markdown(val value: String) : StringOrMarkdown
}

internal object StringOrMarkdownSerializer : KSerializer<StringOrMarkdown> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("StringOrMarkdown")

    override fun deserialize(decoder: Decoder): StringOrMarkdown {
        val input = decoder as? JsonDecoder
            ?: error("StringOrMarkdown can only be deserialized from JSON")
        return when (val element = input.decodeJsonElement()) {
            is JsonPrimitive -> {
                val str = element.contentOrNull
                    ?: error("Expected string primitive for StringOrMarkdown")
                StringOrMarkdown.Plain(str)
            }
            is JsonObject -> {
                val markdown = (element["markdown"] as? JsonPrimitive)?.contentOrNull
                    ?: error("StringOrMarkdown object form requires \"markdown\" string")
                StringOrMarkdown.Markdown(markdown)
            }
            else -> error("StringOrMarkdown must be a string or { markdown: string } object")
        }
    }

    override fun serialize(encoder: Encoder, value: StringOrMarkdown) {
        val output = encoder as? JsonEncoder
            ?: error("StringOrMarkdown can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is StringOrMarkdown.Plain -> JsonPrimitive(value.value)
            is StringOrMarkdown.Markdown -> buildJsonObject {
                put("markdown", JsonPrimitive(value.value))
            }
        }
        output.encodeJsonElement(element)
    }
}

// ─── Enums ──────────────────────────────────────────────────────────────────

/**
 * Policy configuration state for a model.
 */
@Serializable
enum class PolicyState {
    @SerialName("enabled")
    ENABLED,
    @SerialName("disabled")
    DISABLED,
    @SerialName("unconfigured")
    UNCONFIGURED
}

/**
 * Discriminant for pending message kinds.
 */
@Serializable
enum class PendingMessageKind {
    /**
     * Injected into the current turn at a convenient point
     */
    @SerialName("steering")
    STEERING,
    /**
     * Sent automatically as a new turn after the current turn finishes
     */
    @SerialName("queued")
    QUEUED
}

/**
 * Session initialization state.
 */
@Serializable
enum class SessionLifecycle {
    @SerialName("creating")
    CREATING,
    @SerialName("ready")
    READY,
    @SerialName("creationFailed")
    CREATION_FAILED
}

/**
 * Bitset of summary-level session status flags.
 * 
 * Use bitwise checks instead of equality for non-terminal activity. For example,
 * `status & SessionStatus.InProgress` matches both ordinary in-progress turns
 * and turns that are paused waiting for input.
 */
@Serializable(with = SessionStatusSerializer::class)
@JvmInline
value class SessionStatus(val rawValue: Int) {
    operator fun contains(other: SessionStatus): Boolean =
        (rawValue and other.rawValue) == other.rawValue

    infix fun or(other: SessionStatus): SessionStatus = SessionStatus(rawValue or other.rawValue)
    infix fun and(other: SessionStatus): SessionStatus = SessionStatus(rawValue and other.rawValue)

    companion object {
        /**
         * Session is idle — no turn is active.
         */
        val IDLE: SessionStatus = SessionStatus(1)
        /**
         * Session ended with an error.
         */
        val ERROR: SessionStatus = SessionStatus(2)
        /**
         * A turn is actively streaming.
         */
        val IN_PROGRESS: SessionStatus = SessionStatus(8)
        /**
         * A turn is in progress but blocked waiting for user input or tool confirmation.
         */
        val INPUT_NEEDED: SessionStatus = SessionStatus(24)
        /**
         * The client has viewed this session since its last modification.
         */
        val IS_READ: SessionStatus = SessionStatus(32)
        /**
         * The session has been archived by the client.
         */
        val IS_ARCHIVED: SessionStatus = SessionStatus(64)
    }
}

internal object SessionStatusSerializer : KSerializer<SessionStatus> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("SessionStatus", PrimitiveKind.INT)
    override fun serialize(encoder: Encoder, value: SessionStatus) {
        encoder.encodeInt(value.rawValue)
    }
    override fun deserialize(decoder: Decoder): SessionStatus =
        SessionStatus(decoder.decodeInt())
}

/**
 * Answer lifecycle state.
 */
@Serializable
enum class SessionInputAnswerState {
    @SerialName("draft")
    DRAFT,
    @SerialName("submitted")
    SUBMITTED,
    @SerialName("skipped")
    SKIPPED
}

/**
 * Answer value kind.
 */
@Serializable
enum class SessionInputAnswerValueKind {
    @SerialName("text")
    TEXT,
    @SerialName("number")
    NUMBER,
    @SerialName("boolean")
    BOOLEAN,
    @SerialName("selected")
    SELECTED,
    @SerialName("selected-many")
    SELECTED_MANY
}

/**
 * Question/input control kind.
 */
@Serializable
enum class SessionInputQuestionKind {
    @SerialName("text")
    TEXT,
    @SerialName("number")
    NUMBER,
    @SerialName("integer")
    INTEGER,
    @SerialName("boolean")
    BOOLEAN,
    @SerialName("single-select")
    SINGLE_SELECT,
    @SerialName("multi-select")
    MULTI_SELECT
}

/**
 * How a client completed an input request.
 */
@Serializable
enum class SessionInputResponseKind {
    @SerialName("accept")
    ACCEPT,
    @SerialName("decline")
    DECLINE,
    @SerialName("cancel")
    CANCEL
}

/**
 * How a turn ended.
 */
@Serializable
enum class TurnState {
    @SerialName("complete")
    COMPLETE,
    @SerialName("cancelled")
    CANCELLED,
    @SerialName("error")
    ERROR
}

/**
 * Discriminant for Message types.
 */
@Serializable
enum class MessageKind {
    @SerialName("user")
    USER,
    @SerialName("systemNotification")
    SYSTEM_NOTIFICATION
}

/**
 * Discriminant for {@link MessageAttachment} variants.
 */
@Serializable
enum class MessageAttachmentKind {
    /**
     * A simple, opaque attachment whose representation is described by the producer.
     */
    @SerialName("simple")
    SIMPLE,
    /**
     * An attachment whose data is embedded inline as a base64 string.
     */
    @SerialName("embeddedResource")
    EMBEDDED_RESOURCE,
    /**
     * An attachment that references a resource by URI.
     */
    @SerialName("resource")
    RESOURCE
}

/**
 * Discriminant for response part types.
 */
@Serializable
enum class ResponsePartKind {
    @SerialName("markdown")
    MARKDOWN,
    @SerialName("contentRef")
    CONTENT_REF,
    @SerialName("toolCall")
    TOOL_CALL,
    @SerialName("reasoning")
    REASONING,
    @SerialName("systemNotification")
    SYSTEM_NOTIFICATION
}

/**
 * Status of a tool call in the lifecycle state machine.
 */
@Serializable
enum class ToolCallStatus {
    @SerialName("streaming")
    STREAMING,
    @SerialName("pending-confirmation")
    PENDING_CONFIRMATION,
    @SerialName("running")
    RUNNING,
    @SerialName("pending-result-confirmation")
    PENDING_RESULT_CONFIRMATION,
    @SerialName("completed")
    COMPLETED,
    @SerialName("cancelled")
    CANCELLED
}

/**
 * How a tool call was confirmed for execution.
 * 
 * - `NotNeeded` — No confirmation required (auto-approved)
 * - `UserAction` — User explicitly approved
 * - `Setting` — Approved by a persistent user setting
 */
@Serializable
enum class ToolCallConfirmationReason {
    @SerialName("not-needed")
    NOT_NEEDED,
    @SerialName("user-action")
    USER_ACTION,
    @SerialName("setting")
    SETTING
}

/**
 * Why a tool call was cancelled.
 */
@Serializable
enum class ToolCallCancellationReason {
    @SerialName("denied")
    DENIED,
    @SerialName("skipped")
    SKIPPED,
    @SerialName("result-denied")
    RESULT_DENIED
}

/**
 * Whether a confirmation option represents an approval or denial action.
 */
@Serializable
enum class ConfirmationOptionKind {
    @SerialName("approve")
    APPROVE,
    @SerialName("deny")
    DENY
}

/**
 * Discriminant for tool result content types.
 */
@Serializable
enum class ToolResultContentType {
    @SerialName("text")
    TEXT,
    @SerialName("embeddedResource")
    EMBEDDED_RESOURCE,
    @SerialName("resource")
    RESOURCE,
    @SerialName("fileEdit")
    FILE_EDIT,
    @SerialName("terminal")
    TERMINAL,
    @SerialName("subagent")
    SUBAGENT
}

/**
 * Discriminant for the kind of customization.
 * 
 * Top-level entries in {@link SessionState.customizations} and
 * {@link AgentInfo.customizations} are always
 * {@link CustomizationType.Plugin | `Plugin`} or
 * {@link CustomizationType.Directory | `Directory`}; the remaining
 * types appear only as children of those containers.
 */
@Serializable
enum class CustomizationType {
    @SerialName("plugin")
    PLUGIN,
    @SerialName("directory")
    DIRECTORY,
    @SerialName("agent")
    AGENT,
    @SerialName("skill")
    SKILL,
    @SerialName("prompt")
    PROMPT,
    @SerialName("rule")
    RULE,
    @SerialName("hook")
    HOOK,
    @SerialName("mcpServer")
    MCP_SERVER
}

/**
 * Discriminant values for {@link CustomizationLoadState}.
 */
@Serializable
enum class CustomizationLoadStatus {
    @SerialName("loading")
    LOADING,
    @SerialName("loaded")
    LOADED,
    @SerialName("degraded")
    DEGRADED,
    @SerialName("error")
    ERROR
}

/**
 * Discriminant for terminal claim kinds.
 */
@Serializable
enum class TerminalClaimKind {
    @SerialName("client")
    CLIENT,
    @SerialName("session")
    SESSION
}

/**
 * Computation lifecycle of a {@link ChangesetState}.
 */
@Serializable
enum class ChangesetStatus {
    /**
     * The server is still computing the contents of this changeset.
     */
    @SerialName("computing")
    COMPUTING,
    /**
     * The changeset has been fully computed and is up-to-date.
     */
    @SerialName("ready")
    READY,
    /**
     * Computation failed. The cause is described by
     * {@link ChangesetState.error}.
     */
    @SerialName("error")
    ERROR
}

/**
 * Execution lifecycle of a {@link ChangesetOperation}.
 * 
 * An operation is invoked imperatively via `invokeChangesetOperation`, but
 * its progress and outcome are reflected back into changeset state so that
 * every subscriber observes a consistent view (e.g. a spinner on a "Create
 * Pull Request" button, or an inline error after a failed "revert").
 */
@Serializable
enum class ChangesetOperationStatus {
    /**
     * The operation is ready to be invoked. This is the default when
     * {@link ChangesetOperation.status} is omitted.
     */
    @SerialName("idle")
    IDLE,
    /**
     * An invocation of this operation is currently in flight.
     */
    @SerialName("running")
    RUNNING,
    /**
     * The most recent invocation failed. The cause is described by
     * {@link ChangesetOperation.error}.
     */
    @SerialName("error")
    ERROR
}

/**
 * Where a {@link ChangesetOperation} can be invoked.
 */
@Serializable
enum class ChangesetOperationScope {
    /**
     * Applies to the whole changeset.
     */
    @SerialName("changeset")
    CHANGESET,
    /**
     * Applies to a single file within the changeset.
     */
    @SerialName("resource")
    RESOURCE,
    /**
     * Applies to a line range within a single file.
     */
    @SerialName("range")
    RANGE
}

/**
 * Discriminant for {@link ResourceChange.type}.
 */
@Serializable
enum class ResourceChangeType {
    @SerialName("added")
    ADDED,
    @SerialName("updated")
    UPDATED,
    @SerialName("deleted")
    DELETED
}

// ─── State Types ────────────────────────────────────────────────────────────

@Serializable
data class Icon(
    /**
     * A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a
     * `data:` URI with Base64-encoded image data.
     * 
     * Consumers SHOULD take steps to ensure URLs serving icons are from the
     * same domain as the client/server or a trusted domain.
     * 
     * Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain
     * executable JavaScript.
     */
    val src: String,
    /**
     * Optional MIME type override if the source MIME type is missing or generic.
     * For example: `"image/png"`, `"image/jpeg"`, or `"image/svg+xml"`.
     */
    val contentType: String? = null,
    /**
     * Optional array of strings that specify sizes at which the icon can be used.
     * Each string should be in WxH format (e.g., `"48x48"`, `"96x96"`) or `"any"` for scalable formats like SVG.
     * 
     * If not provided, the client should assume that the icon can be used at any size.
     */
    val sizes: List<String>? = null,
    /**
     * Optional specifier for the theme this icon is designed for. `"light"` indicates
     * the icon is designed to be used with a light background, and `"dark"` indicates
     * the icon is designed to be used with a dark background.
     * 
     * If not provided, the client should assume the icon can be used with any theme.
     */
    val theme: String? = null
)

@Serializable
data class ProtectedResourceMetadata(
    /**
     * REQUIRED. The protected resource's resource identifier, a URL using the
     * `https` scheme with no fragment component (e.g. `"https://api.github.com"`).
     */
    val resource: String,
    /**
     * OPTIONAL. Human-readable name of the protected resource.
     */
    @SerialName("resource_name")
    val resourceName: String? = null,
    /**
     * OPTIONAL. JSON array of OAuth authorization server identifier URLs.
     */
    @SerialName("authorization_servers")
    val authorizationServers: List<String>? = null,
    /**
     * OPTIONAL. URL of the protected resource's JWK Set document.
     */
    @SerialName("jwks_uri")
    val jwksUri: String? = null,
    /**
     * RECOMMENDED. JSON array of OAuth 2.0 scope values used in authorization requests.
     */
    @SerialName("scopes_supported")
    val scopesSupported: List<String>? = null,
    /**
     * OPTIONAL. JSON array of Bearer Token presentation methods supported.
     */
    @SerialName("bearer_methods_supported")
    val bearerMethodsSupported: List<String>? = null,
    /**
     * OPTIONAL. JSON array of JWS signing algorithms supported.
     */
    @SerialName("resource_signing_alg_values_supported")
    val resourceSigningAlgValuesSupported: List<String>? = null,
    /**
     * OPTIONAL. JSON array of JWE encryption algorithms (alg) supported.
     */
    @SerialName("resource_encryption_alg_values_supported")
    val resourceEncryptionAlgValuesSupported: List<String>? = null,
    /**
     * OPTIONAL. JSON array of JWE encryption algorithms (enc) supported.
     */
    @SerialName("resource_encryption_enc_values_supported")
    val resourceEncryptionEncValuesSupported: List<String>? = null,
    /**
     * OPTIONAL. URL of human-readable documentation for the resource.
     */
    @SerialName("resource_documentation")
    val resourceDocumentation: String? = null,
    /**
     * OPTIONAL. URL of the resource's data-usage policy.
     */
    @SerialName("resource_policy_uri")
    val resourcePolicyUri: String? = null,
    /**
     * OPTIONAL. URL of the resource's terms of service.
     */
    @SerialName("resource_tos_uri")
    val resourceTosUri: String? = null,
    /**
     * AHP extension. Whether authentication is required for this resource.
     * 
     * - `true` (default) — the agent cannot be used without a valid token.
     * The server SHOULD return `AuthRequired` (`-32007`) if the client
     * attempts to use the agent without authenticating.
     * - `false` — the agent works without authentication but MAY offer
     * enhanced capabilities when a token is provided.
     * 
     * Clients SHOULD treat an absent field the same as `true`.
     */
    val required: Boolean? = null
)

@Serializable
data class RootState(
    /**
     * Available agent backends and their models
     */
    val agents: List<AgentInfo>,
    /**
     * Number of active (non-disposed) sessions on the server
     */
    val activeSessions: Long? = null,
    /**
     * Known terminals on the server. Subscribe to individual terminal URIs for full state.
     */
    val terminals: List<TerminalInfo>? = null,
    /**
     * Agent host configuration schema and current values
     */
    val config: RootConfigState? = null
)

@Serializable
data class RootConfigState(
    /**
     * JSON Schema describing available configuration properties
     */
    val schema: ConfigSchema,
    /**
     * Current configuration values
     */
    val values: Map<String, JsonElement>
)

@Serializable
data class AgentInfo(
    /**
     * Agent provider ID (e.g. `'copilot'`)
     */
    val provider: String,
    /**
     * Human-readable name
     */
    val displayName: String,
    /**
     * Description string
     */
    val description: String,
    /**
     * Available models for this agent
     */
    val models: List<SessionModelInfo>,
    /**
     * Protected resources this agent requires authentication for.
     * 
     * Each entry describes an OAuth 2.0 protected resource using
     * [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) semantics.
     * Clients should obtain tokens from the declared `authorization_servers`
     * and push them via the `authenticate` command before creating sessions
     * with this agent.
     */
    val protectedResources: List<ProtectedResourceMetadata>? = null,
    /**
     * Customizations associated with this agent.
     * 
     * Always container customizations —
     * {@link PluginCustomization | `PluginCustomization`} entries the agent
     * bundles, plus {@link DirectoryCustomization | `DirectoryCustomization`}
     * entries it watches in any workspace it's used with. When a session is
     * created with this agent, these entries are augmented (e.g. directory
     * URIs are resolved against the workspace, children are parsed) and
     * propagated into the session's `customizations` list.
     */
    val customizations: List<Customization>? = null
)

@Serializable
data class SessionModelInfo(
    /**
     * Model identifier
     */
    val id: String,
    /**
     * Provider this model belongs to
     */
    val provider: String,
    /**
     * Human-readable model name
     */
    val name: String,
    /**
     * Maximum context window size
     */
    val maxContextWindow: Long? = null,
    /**
     * Whether the model supports vision
     */
    val supportsVision: Boolean? = null,
    /**
     * Policy configuration state
     */
    val policyState: PolicyState? = null,
    /**
     * Configuration schema describing model-specific options (e.g. thinking
     * level). Clients present this as a form and pass the resolved values in
     * {@link ModelSelection.config} when creating or changing sessions.
     */
    val configSchema: ConfigSchema? = null,
    /**
     * Additional provider-specific metadata for this model.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `pricing` key may carry model pricing metadata.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ModelSelection(
    /**
     * Model identifier
     */
    val id: String,
    /**
     * Model-specific configuration values
     */
    val config: Map<String, String>? = null
)

@Serializable
data class AgentSelection(
    /**
     * Stable agent URI (matches an {@link AgentCustomization.uri}).
     */
    val uri: String
)

@Serializable
data class ConfigPropertySchema(
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
     * JSON Schema: allowed values (typically used with `string` type)
     */
    val enum: List<String>? = null,
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
    val required: List<String>? = null
)

@Serializable
data class ConfigSchema(
    /**
     * JSON Schema: always `'object'`
     */
    val type: String,
    /**
     * JSON Schema: property descriptors keyed by property id
     */
    val properties: Map<String, ConfigPropertySchema>,
    /**
     * JSON Schema: list of required property ids
     */
    val required: List<String>? = null
)

@Serializable
data class PendingMessage(
    /**
     * Unique identifier for this pending message
     */
    val id: String,
    /**
     * The message that will start the next turn
     */
    val message: Message
)

@Serializable
data class SessionState(
    /**
     * Lightweight session metadata
     */
    val summary: SessionSummary,
    /**
     * Session initialization state
     */
    val lifecycle: SessionLifecycle,
    /**
     * Error details if creation failed
     */
    val creationError: ErrorInfo? = null,
    /**
     * Tools provided by the server (agent host) for this session
     */
    val serverTools: List<ToolDefinition>? = null,
    /**
     * The client currently providing tools and interactive capabilities to this session
     */
    val activeClient: SessionActiveClient? = null,
    /**
     * Completed turns
     */
    val turns: List<Turn>,
    /**
     * Currently in-progress turn
     */
    val activeTurn: ActiveTurn? = null,
    /**
     * Message to inject into the current turn at a convenient point
     */
    val steeringMessage: PendingMessage? = null,
    /**
     * Messages to send automatically as new turns after the current turn finishes
     */
    val queuedMessages: List<PendingMessage>? = null,
    /**
     * Requests for user input that are currently blocking or informing session progress
     */
    val inputRequests: List<SessionInputRequest>? = null,
    /**
     * Session configuration schema and current values
     */
    val config: SessionConfigState? = null,
    /**
     * Top-level customizations active in this session.
     * 
     * Always container customizations — {@link PluginCustomization} or
     * {@link DirectoryCustomization}. Children (agents, skills, prompts,
     * rules, hooks, MCP servers) live in each container's
     * {@link ContainerCustomizationBase.children | `children`} array.
     * 
     * Client-published plugins arrive via
     * {@link SessionActiveClient.customizations | `activeClient.customizations`}
     * and the host propagates them into this list (typically with the
     * container's `clientId` set and `children` populated).
     */
    val customizations: List<Customization>? = null,
    /**
     * Additional provider-specific metadata for this session.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `git` key may provide extra git metadata about the session's
     * workingDirectory.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class SessionActiveClient(
    /**
     * Client identifier (matches `clientId` from `initialize`)
     */
    val clientId: String,
    /**
     * Human-readable client name (e.g. `"VS Code"`)
     */
    val displayName: String? = null,
    /**
     * Tools this client provides to the session
     */
    val tools: List<ToolDefinition>,
    /**
     * Plugin customizations this client contributes to the session.
     * 
     * Clients publish in [Open Plugins](https://open-plugins.com/) format
     * — i.e. always container-shaped plugins. They MAY synthesize virtual
     * plugins in memory and rely on the host to expand them into concrete
     * children inside {@link SessionState.customizations}.
     */
    val customizations: List<ClientPluginCustomization>? = null
)

@Serializable
data class SessionSummary(
    /**
     * Session URI
     */
    val resource: String,
    /**
     * Agent provider ID
     */
    val provider: String,
    /**
     * Session title
     */
    val title: String,
    /**
     * Current session status
     */
    val status: SessionStatus,
    /**
     * Human-readable description of what the session is currently doing
     */
    val activity: String? = null,
    /**
     * Creation timestamp
     */
    val createdAt: Long,
    /**
     * Last modification timestamp
     */
    val modifiedAt: Long,
    /**
     * Server-owned project for this session
     */
    val project: ProjectInfo? = null,
    /**
     * Currently selected model
     */
    val model: ModelSelection? = null,
    /**
     * Currently selected custom agent.
     * 
     * Absent (`undefined`) means no custom agent is selected for this session
     * — the session uses the provider's default behavior.
     */
    val agent: AgentSelection? = null,
    /**
     * The working directory URI for this session
     */
    val workingDirectory: String? = null,
    /**
     * Catalogue of changesets the server can produce for this session. Each
     * entry advertises a subscribable view of file changes (uncommitted,
     * session-wide, per-turn, etc.) and the URI template the client expands
     * before subscribing. See {@link ChangesetSummary} for the full shape and
     * {@link /guide/changesets | Changesets} for an overview of the model.
     */
    val changesets: List<ChangesetSummary>? = null
)

@Serializable
data class ProjectInfo(
    /**
     * Project URI
     */
    val uri: String,
    /**
     * Human-readable project name
     */
    val displayName: String
)

@Serializable
data class SessionConfigState(
    /**
     * JSON Schema describing available configuration properties
     */
    val schema: SessionConfigSchema,
    /**
     * Current configuration values
     */
    val values: Map<String, JsonElement>
)

@Serializable
data class Turn(
    /**
     * Turn identifier
     */
    val id: String,
    /**
     * The message that initiated the turn
     */
    val message: Message,
    /**
     * All response content in stream order: text, tool calls, reasoning, and content refs.
     * 
     * Consumers should derive display text by concatenating markdown parts,
     * and find tool calls by filtering for `ToolCall` parts.
     */
    val responseParts: List<ResponsePart>,
    /**
     * Token usage info
     */
    val usage: UsageInfo? = null,
    /**
     * How the turn ended
     */
    val state: TurnState,
    /**
     * Error details if state is `'error'`
     */
    val error: ErrorInfo? = null
)

@Serializable
data class ActiveTurn(
    /**
     * Turn identifier
     */
    val id: String,
    /**
     * The message that initiated the turn
     */
    val message: Message,
    /**
     * All response content in stream order: text, tool calls, reasoning, and content refs.
     * 
     * Tool call parts include `pendingPermissions` when permissions are awaiting user approval.
     */
    val responseParts: List<ResponsePart>,
    /**
     * Token usage info
     */
    val usage: UsageInfo? = null
)

@Serializable
data class Message(
    /**
     * Message text
     */
    val text: String,
    /**
     * The origin of the message
     */
    val origin: JsonElement,
    /**
     * File/selection attachments
     */
    val attachments: List<MessageAttachment>? = null,
    /**
     * Additional provider-specific metadata for this message.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry context that does not fit any other
     * field. Mirrors the MCP `_meta` convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class SessionInputOption(
    /**
     * Stable option identifier; for MCP enum values this is the enum string
     */
    val id: String,
    /**
     * Display label
     */
    val label: String,
    /**
     * Optional secondary text
     */
    val description: String? = null,
    /**
     * Whether this option is the recommended/default choice
     */
    val recommended: Boolean? = null
)

@Serializable
data class SessionInputTextAnswerValue(
    val kind: SessionInputAnswerValueKind,
    val value: String
)

@Serializable
data class SessionInputNumberAnswerValue(
    val kind: SessionInputAnswerValueKind,
    val value: Double
)

@Serializable
data class SessionInputBooleanAnswerValue(
    val kind: SessionInputAnswerValueKind,
    val value: Boolean
)

@Serializable
data class SessionInputSelectedAnswerValue(
    val kind: SessionInputAnswerValueKind,
    val value: String,
    /**
     * Free-form text entered instead of selecting an option
     */
    val freeformValues: List<String>? = null
)

@Serializable
data class SessionInputSelectedManyAnswerValue(
    val kind: SessionInputAnswerValueKind,
    val value: List<String>,
    /**
     * Free-form text entered in addition to selected options
     */
    val freeformValues: List<String>? = null
)

@Serializable
data class SessionInputAnswered(
    /**
     * Answer state
     */
    val state: SessionInputAnswerState,
    /**
     * Answer value
     */
    val value: SessionInputAnswerValue
)

@Serializable
data class SessionInputSkipped(
    /**
     * Answer state
     */
    val state: SessionInputAnswerState,
    /**
     * Free-form reason or value captured while skipping, if any
     */
    val freeformValues: List<String>? = null
)

@Serializable
data class SessionInputTextQuestion(
    /**
     * Stable question identifier used as the key in `answers`
     */
    val id: String,
    /**
     * Short display title
     */
    val title: String? = null,
    /**
     * Prompt shown to the user
     */
    val message: String,
    /**
     * Whether the user must answer this question to accept the request
     */
    val required: Boolean? = null,
    val kind: SessionInputQuestionKind,
    /**
     * Format hint for text questions, such as `email`, `uri`, `date`, or `date-time`
     */
    val format: String? = null,
    /**
     * Minimum string length
     */
    val min: Long? = null,
    /**
     * Maximum string length
     */
    val max: Long? = null,
    /**
     * Default text
     */
    val defaultValue: String? = null
)

@Serializable
data class SessionInputNumberQuestion(
    /**
     * Stable question identifier used as the key in `answers`
     */
    val id: String,
    /**
     * Short display title
     */
    val title: String? = null,
    /**
     * Prompt shown to the user
     */
    val message: String,
    /**
     * Whether the user must answer this question to accept the request
     */
    val required: Boolean? = null,
    val kind: SessionInputQuestionKind,
    /**
     * Minimum value
     */
    val min: Double? = null,
    /**
     * Maximum value
     */
    val max: Double? = null,
    /**
     * Default numeric value
     */
    val defaultValue: Double? = null
)

@Serializable
data class SessionInputBooleanQuestion(
    /**
     * Stable question identifier used as the key in `answers`
     */
    val id: String,
    /**
     * Short display title
     */
    val title: String? = null,
    /**
     * Prompt shown to the user
     */
    val message: String,
    /**
     * Whether the user must answer this question to accept the request
     */
    val required: Boolean? = null,
    val kind: SessionInputQuestionKind,
    /**
     * Default boolean value
     */
    val defaultValue: Boolean? = null
)

@Serializable
data class SessionInputSingleSelectQuestion(
    /**
     * Stable question identifier used as the key in `answers`
     */
    val id: String,
    /**
     * Short display title
     */
    val title: String? = null,
    /**
     * Prompt shown to the user
     */
    val message: String,
    /**
     * Whether the user must answer this question to accept the request
     */
    val required: Boolean? = null,
    val kind: SessionInputQuestionKind,
    /**
     * Options the user may select from
     */
    val options: List<SessionInputOption>,
    /**
     * Whether the user may enter text instead of selecting an option
     */
    val allowFreeformInput: Boolean? = null
)

@Serializable
data class SessionInputMultiSelectQuestion(
    /**
     * Stable question identifier used as the key in `answers`
     */
    val id: String,
    /**
     * Short display title
     */
    val title: String? = null,
    /**
     * Prompt shown to the user
     */
    val message: String,
    /**
     * Whether the user must answer this question to accept the request
     */
    val required: Boolean? = null,
    val kind: SessionInputQuestionKind,
    /**
     * Options the user may select from
     */
    val options: List<SessionInputOption>,
    /**
     * Whether the user may enter text in addition to selecting options
     */
    val allowFreeformInput: Boolean? = null,
    /**
     * Minimum selected item count
     */
    val min: Long? = null,
    /**
     * Maximum selected item count
     */
    val max: Long? = null
)

@Serializable
data class SessionInputRequest(
    /**
     * Stable request identifier
     */
    val id: String,
    /**
     * Display message for the request as a whole
     */
    val message: String? = null,
    /**
     * URL the user should review or open, for URL-style elicitations
     */
    val url: String? = null,
    /**
     * Ordered questions to ask the user
     */
    val questions: List<SessionInputQuestion>? = null,
    /**
     * Current draft or submitted answers, keyed by question ID
     */
    val answers: Map<String, SessionInputAnswer>? = null
)

@Serializable
data class TextPosition(
    /**
     * Zero-based line number.
     */
    val line: Long,
    /**
     * Zero-based character offset within the line.
     */
    val character: Long
)

@Serializable
data class TextRange(
    /**
     * Start position of the range.
     */
    val start: TextPosition,
    /**
     * End position of the range.
     */
    val end: TextPosition
)

@Serializable
data class TextSelection(
    /**
     * The range covered by the selection.
     */
    val range: TextRange
)

@Serializable
data class SimpleMessageAttachment(
    /**
     * A human-readable label for the attachment (e.g. the filename of a file
     * attachment). Used for display in UI.
     */
    val label: String,
    /**
     * If defined, the range in {@link Message.text} that references this
     * attachment. This is a text range, not a byte range.
     */
    val range: TextRange? = null,
    /**
     * Advisory display hint for clients rendering this attachment. Recognized
     * values include:
     * 
     * - `'image'`: the attachment is an image
     * - `'document'`: the attachment is a textual document
     * - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
     * - `'directory'`: the attachment is a folder
     * - `'selection'`: the attachment is a selection within a document
     * 
     * Implementations MAY provide additional values; clients SHOULD fall back
     * to a reasonable default when an unknown value is encountered.
     */
    val displayKind: String? = null,
    /**
     * Additional implementation-defined metadata for the attachment.
     * 
     * If the attachment was produced by the `completions` command, the client
     * MUST preserve every property of `_meta` originally returned by the agent
     * host when sending the user message containing the accepted completion.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Discriminant
     */
    val type: MessageAttachmentKind,
    /**
     * Representation of the attachment as it should be shown to the model.
     * 
     * If the attachment was produced by the client, this property MUST be
     * defined so the agent host can correctly interpret the attachment. This
     * property MAY be omitted when the attachment originated from a
     * `completions` response.
     */
    val modelRepresentation: String? = null
)

@Serializable
data class MessageEmbeddedResourceAttachment(
    /**
     * A human-readable label for the attachment (e.g. the filename of a file
     * attachment). Used for display in UI.
     */
    val label: String,
    /**
     * If defined, the range in {@link Message.text} that references this
     * attachment. This is a text range, not a byte range.
     */
    val range: TextRange? = null,
    /**
     * Advisory display hint for clients rendering this attachment. Recognized
     * values include:
     * 
     * - `'image'`: the attachment is an image
     * - `'document'`: the attachment is a textual document
     * - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
     * - `'directory'`: the attachment is a folder
     * - `'selection'`: the attachment is a selection within a document
     * 
     * Implementations MAY provide additional values; clients SHOULD fall back
     * to a reasonable default when an unknown value is encountered.
     */
    val displayKind: String? = null,
    /**
     * Additional implementation-defined metadata for the attachment.
     * 
     * If the attachment was produced by the `completions` command, the client
     * MUST preserve every property of `_meta` originally returned by the agent
     * host when sending the user message containing the accepted completion.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Discriminant
     */
    val type: MessageAttachmentKind,
    /**
     * Base64-encoded binary data
     */
    val data: String,
    /**
     * Content MIME type (e.g. `"image/png"`, `"application/pdf"`)
     */
    val contentType: String,
    /**
     * Optional selection within the attached textual resource.
     * 
     * Only meaningful for textual resources.
     */
    val selection: TextSelection? = null
)

@Serializable
data class MessageResourceAttachment(
    /**
     * A human-readable label for the attachment (e.g. the filename of a file
     * attachment). Used for display in UI.
     */
    val label: String,
    /**
     * If defined, the range in {@link Message.text} that references this
     * attachment. This is a text range, not a byte range.
     */
    val range: TextRange? = null,
    /**
     * Advisory display hint for clients rendering this attachment. Recognized
     * values include:
     * 
     * - `'image'`: the attachment is an image
     * - `'document'`: the attachment is a textual document
     * - `'symbol'`: the attachment is a code symbol (e.g. a function or class)
     * - `'directory'`: the attachment is a folder
     * - `'selection'`: the attachment is a selection within a document
     * 
     * Implementations MAY provide additional values; clients SHOULD fall back
     * to a reasonable default when an unknown value is encountered.
     */
    val displayKind: String? = null,
    /**
     * Additional implementation-defined metadata for the attachment.
     * 
     * If the attachment was produced by the `completions` command, the client
     * MUST preserve every property of `_meta` originally returned by the agent
     * host when sending the user message containing the accepted completion.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Content URI
     */
    val uri: String,
    /**
     * Approximate size in bytes
     */
    val sizeHint: Long? = null,
    /**
     * Content MIME type
     */
    val contentType: String? = null,
    /**
     * Discriminant
     */
    val type: MessageAttachmentKind,
    /**
     * Optional selection within the referenced textual resource.
     * 
     * Only meaningful for textual resources.
     */
    val selection: TextSelection? = null
)

@Serializable
data class MarkdownResponsePart(
    /**
     * Discriminant
     */
    val kind: ResponsePartKind,
    /**
     * Part identifier, used by `session/delta` to target this part for content appends
     */
    val id: String,
    /**
     * Markdown content
     */
    val content: String
)

@Serializable
data class ContentRef(
    /**
     * Content URI
     */
    val uri: String,
    /**
     * Approximate size in bytes
     */
    val sizeHint: Long? = null,
    /**
     * Content MIME type
     */
    val contentType: String? = null
)

@Serializable
data class ResourceReponsePart(
    /**
     * Content URI
     */
    val uri: String,
    /**
     * Approximate size in bytes
     */
    val sizeHint: Long? = null,
    /**
     * Content MIME type
     */
    val contentType: String? = null,
    /**
     * Discriminant
     */
    val kind: ResponsePartKind
)

@Serializable
data class ToolCallResponsePart(
    /**
     * Discriminant
     */
    val kind: ResponsePartKind,
    /**
     * Full tool call lifecycle state
     */
    val toolCall: ToolCallState
)

@Serializable
data class ReasoningResponsePart(
    /**
     * Discriminant
     */
    val kind: ResponsePartKind,
    /**
     * Part identifier, used by `session/reasoning` to target this part for content appends
     */
    val id: String,
    /**
     * Accumulated reasoning text
     */
    val content: String
)

@Serializable
data class SystemNotificationResponsePart(
    /**
     * Discriminant
     */
    val kind: ResponsePartKind,
    /**
     * The text of the system notification
     */
    val content: StringOrMarkdown
)

@Serializable
data class ToolCallResult(
    /**
     * Whether the tool succeeded
     */
    val success: Boolean,
    /**
     * Past-tense description of what the tool did
     */
    val pastTenseMessage: StringOrMarkdown,
    /**
     * Unstructured result content blocks.
     * 
     * This mirrors the `content` field of MCP `CallToolResult`.
     */
    val content: List<ToolResultContent>? = null,
    /**
     * Optional structured result object.
     * 
     * This mirrors the `structuredContent` field of MCP `CallToolResult`.
     */
    val structuredContent: Map<String, JsonElement>? = null,
    /**
     * Error details if the tool failed
     */
    val error: JsonElement? = null
)

@Serializable
data class ToolCallStreamingState(
    /**
     * Unique tool call identifier
     */
    val toolCallId: String,
    /**
     * Internal tool name (for debugging/logging)
     */
    val toolName: String,
    /**
     * Human-readable tool name
     */
    val displayName: String,
    /**
     * If this tool is provided by a client, the `clientId` of the owning client.
     * Absent for server-side tools.
     * 
     * When set, the identified client is responsible for executing the tool and
     * dispatching `session/toolCallComplete` with the result.
     */
    val toolClientId: String? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val status: ToolCallStatus,
    /**
     * Partial parameters accumulated so far
     */
    val partialInput: String? = null,
    /**
     * Progress message shown while parameters are streaming
     */
    val invocationMessage: StringOrMarkdown? = null
)

@Serializable
data class ToolCallPendingConfirmationState(
    /**
     * Unique tool call identifier
     */
    val toolCallId: String,
    /**
     * Internal tool name (for debugging/logging)
     */
    val toolName: String,
    /**
     * Human-readable tool name
     */
    val displayName: String,
    /**
     * If this tool is provided by a client, the `clientId` of the owning client.
     * Absent for server-side tools.
     * 
     * When set, the identified client is responsible for executing the tool and
     * dispatching `session/toolCallComplete` with the result.
     */
    val toolClientId: String? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Message describing what the tool will do
     */
    val invocationMessage: StringOrMarkdown,
    /**
     * Raw tool input
     */
    val toolInput: String? = null,
    val status: ToolCallStatus,
    /**
     * Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
     */
    val confirmationTitle: StringOrMarkdown? = null,
    /**
     * File edits that this tool call will perform, for preview before confirmation
     */
    val edits: JsonElement? = null,
    /**
     * Whether the agent host allows the client to edit the tool's input parameters before confirming
     */
    val editable: Boolean? = null,
    /**
     * Options the server offers for this confirmation. When present, the client
     * SHOULD render these instead of a plain approve/deny UI. Each option
     * belongs to a {@link ConfirmationOptionGroup} so the client can still
     * categorise the choices.
     */
    val options: List<ConfirmationOption>? = null
)

@Serializable
data class ToolCallRunningState(
    /**
     * Unique tool call identifier
     */
    val toolCallId: String,
    /**
     * Internal tool name (for debugging/logging)
     */
    val toolName: String,
    /**
     * Human-readable tool name
     */
    val displayName: String,
    /**
     * If this tool is provided by a client, the `clientId` of the owning client.
     * Absent for server-side tools.
     * 
     * When set, the identified client is responsible for executing the tool and
     * dispatching `session/toolCallComplete` with the result.
     */
    val toolClientId: String? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Message describing what the tool will do
     */
    val invocationMessage: StringOrMarkdown,
    /**
     * Raw tool input
     */
    val toolInput: String? = null,
    val status: ToolCallStatus,
    /**
     * How the tool was confirmed for execution
     */
    val confirmed: ToolCallConfirmationReason,
    /**
     * The confirmation option the user selected, if confirmation options were provided
     */
    val selectedOption: ConfirmationOption? = null,
    /**
     * Partial content produced while the tool is still executing.
     * 
     * For example, a terminal content block lets clients subscribe to live
     * output before the tool completes.
     */
    val content: List<ToolResultContent>? = null
)

@Serializable
data class ToolCallPendingResultConfirmationState(
    /**
     * Unique tool call identifier
     */
    val toolCallId: String,
    /**
     * Internal tool name (for debugging/logging)
     */
    val toolName: String,
    /**
     * Human-readable tool name
     */
    val displayName: String,
    /**
     * If this tool is provided by a client, the `clientId` of the owning client.
     * Absent for server-side tools.
     * 
     * When set, the identified client is responsible for executing the tool and
     * dispatching `session/toolCallComplete` with the result.
     */
    val toolClientId: String? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Message describing what the tool will do
     */
    val invocationMessage: StringOrMarkdown,
    /**
     * Raw tool input
     */
    val toolInput: String? = null,
    /**
     * Whether the tool succeeded
     */
    val success: Boolean,
    /**
     * Past-tense description of what the tool did
     */
    val pastTenseMessage: StringOrMarkdown,
    /**
     * Unstructured result content blocks.
     * 
     * This mirrors the `content` field of MCP `CallToolResult`.
     */
    val content: List<ToolResultContent>? = null,
    /**
     * Optional structured result object.
     * 
     * This mirrors the `structuredContent` field of MCP `CallToolResult`.
     */
    val structuredContent: Map<String, JsonElement>? = null,
    /**
     * Error details if the tool failed
     */
    val error: JsonElement? = null,
    val status: ToolCallStatus,
    /**
     * How the tool was confirmed for execution
     */
    val confirmed: ToolCallConfirmationReason,
    /**
     * The confirmation option the user selected, if confirmation options were provided
     */
    val selectedOption: ConfirmationOption? = null
)

@Serializable
data class ToolCallCompletedState(
    /**
     * Unique tool call identifier
     */
    val toolCallId: String,
    /**
     * Internal tool name (for debugging/logging)
     */
    val toolName: String,
    /**
     * Human-readable tool name
     */
    val displayName: String,
    /**
     * If this tool is provided by a client, the `clientId` of the owning client.
     * Absent for server-side tools.
     * 
     * When set, the identified client is responsible for executing the tool and
     * dispatching `session/toolCallComplete` with the result.
     */
    val toolClientId: String? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Message describing what the tool will do
     */
    val invocationMessage: StringOrMarkdown,
    /**
     * Raw tool input
     */
    val toolInput: String? = null,
    /**
     * Whether the tool succeeded
     */
    val success: Boolean,
    /**
     * Past-tense description of what the tool did
     */
    val pastTenseMessage: StringOrMarkdown,
    /**
     * Unstructured result content blocks.
     * 
     * This mirrors the `content` field of MCP `CallToolResult`.
     */
    val content: List<ToolResultContent>? = null,
    /**
     * Optional structured result object.
     * 
     * This mirrors the `structuredContent` field of MCP `CallToolResult`.
     */
    val structuredContent: Map<String, JsonElement>? = null,
    /**
     * Error details if the tool failed
     */
    val error: JsonElement? = null,
    val status: ToolCallStatus,
    /**
     * How the tool was confirmed for execution
     */
    val confirmed: ToolCallConfirmationReason,
    /**
     * The confirmation option the user selected, if confirmation options were provided
     */
    val selectedOption: ConfirmationOption? = null
)

@Serializable
data class ToolCallCancelledState(
    /**
     * Unique tool call identifier
     */
    val toolCallId: String,
    /**
     * Internal tool name (for debugging/logging)
     */
    val toolName: String,
    /**
     * Human-readable tool name
     */
    val displayName: String,
    /**
     * If this tool is provided by a client, the `clientId` of the owning client.
     * Absent for server-side tools.
     * 
     * When set, the identified client is responsible for executing the tool and
     * dispatching `session/toolCallComplete` with the result.
     */
    val toolClientId: String? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     * 
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Message describing what the tool will do
     */
    val invocationMessage: StringOrMarkdown,
    /**
     * Raw tool input
     */
    val toolInput: String? = null,
    val status: ToolCallStatus,
    /**
     * Why the tool was cancelled
     */
    val reason: ToolCallCancellationReason,
    /**
     * Optional message explaining the cancellation
     */
    val reasonMessage: StringOrMarkdown? = null,
    /**
     * What the user suggested doing instead
     */
    val userSuggestion: Message? = null,
    /**
     * The confirmation option the user selected, if confirmation options were provided
     */
    val selectedOption: ConfirmationOption? = null
)

@Serializable
data class ConfirmationOption(
    /**
     * Unique identifier for the option, returned in the confirmed action
     */
    val id: String,
    /**
     * Human-readable label displayed to the user
     */
    val label: String,
    /**
     * Whether this option represents an approval or denial
     */
    val kind: ConfirmationOptionKind,
    /**
     * Logical group number for visual categorisation.
     * 
     * Clients SHOULD display options in the order they are defined and MAY
     * use differing group numbers to insert dividers between logical clusters
     * of options.
     */
    val group: Long? = null
)

@Serializable
data class ToolDefinition(
    /**
     * Unique tool identifier
     */
    val name: String,
    /**
     * Human-readable display name
     */
    val title: String? = null,
    /**
     * Description of what the tool does
     */
    val description: String? = null,
    /**
     * JSON Schema defining the expected input parameters.
     * 
     * Optional because client-provided tools may not have formal schemas.
     * Mirrors MCP `Tool.inputSchema`.
     */
    val inputSchema: JsonElement? = null,
    /**
     * JSON Schema defining the structure of the tool's output.
     * 
     * Mirrors MCP `Tool.outputSchema`.
     */
    val outputSchema: JsonElement? = null,
    /**
     * Behavioral hints about the tool. All properties are advisory.
     */
    val annotations: ToolAnnotations? = null,
    /**
     * Additional provider-specific metadata.
     * 
     * Mirrors the MCP `_meta` convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ToolAnnotations(
    /**
     * Alternate human-readable title
     */
    val title: String? = null,
    /**
     * Tool does not modify its environment (default: false)
     */
    val readOnlyHint: Boolean? = null,
    /**
     * Tool may perform destructive updates (default: true)
     */
    val destructiveHint: Boolean? = null,
    /**
     * Repeated calls with the same arguments have no additional effect (default: false)
     */
    val idempotentHint: Boolean? = null,
    /**
     * Tool may interact with external entities (default: true)
     */
    val openWorldHint: Boolean? = null
)

@Serializable
data class ToolResultTextContent(
    val type: ToolResultContentType,
    /**
     * The text content
     */
    val text: String
)

@Serializable
data class ToolResultEmbeddedResourceContent(
    val type: ToolResultContentType,
    /**
     * Base64-encoded data
     */
    val data: String,
    /**
     * Content type (e.g. `"image/png"`, `"application/pdf"`)
     */
    val contentType: String
)

@Serializable
data class ToolResultResourceContent(
    /**
     * Content URI
     */
    val uri: String,
    /**
     * Approximate size in bytes
     */
    val sizeHint: Long? = null,
    /**
     * Content MIME type
     */
    val contentType: String? = null,
    val type: ToolResultContentType
)

@Serializable
data class ToolResultFileEditContent(
    /**
     * The file state before the edit. Absent for file creations or for in-place file edits.
     */
    val before: JsonElement? = null,
    /**
     * The file state after the edit. Absent for file deletions.
     */
    val after: JsonElement? = null,
    /**
     * Optional diff display metadata
     */
    val diff: JsonElement? = null,
    val type: ToolResultContentType
)

@Serializable
data class ToolResultTerminalContent(
    val type: ToolResultContentType,
    /**
     * Terminal URI (subscribable for full terminal state)
     */
    val resource: String,
    /**
     * Display title for the terminal content
     */
    val title: String
)

@Serializable
data class ToolResultSubagentContent(
    val type: ToolResultContentType,
    /**
     * Subagent session URI (subscribable for full session state)
     */
    val resource: String,
    /**
     * Display title for the subagent
     */
    val title: String,
    /**
     * Internal agent name
     */
    val agentName: String? = null,
    /**
     * Human-readable description of the subagent's task
     */
    val description: String? = null
)

@Serializable
data class CustomizationLoadingState(
    val kind: CustomizationLoadStatus
)

@Serializable
data class CustomizationLoadedState(
    val kind: CustomizationLoadStatus
)

@Serializable
data class CustomizationDegradedState(
    val kind: CustomizationLoadStatus,
    /**
     * Human-readable description of the warning.
     */
    val message: String
)

@Serializable
data class CustomizationErrorState(
    val kind: CustomizationLoadStatus,
    /**
     * Human-readable error message.
     */
    val message: String
)

@Serializable
data class PluginCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    /**
     * Whether this container is currently enabled.
     */
    val enabled: Boolean,
    /**
     * `clientId` of the client that contributed this container. Absent for
     * server-originated entries.
     */
    val clientId: String? = null,
    /**
     * Host-reported load state. Absent means the host has not yet reported
     * a load state for this container.
     */
    val load: CustomizationLoadState? = null,
    /**
     * Children discovered inside this container.
     * 
     * Absent means the host has not parsed this container yet. An empty
     * array means the host parsed the container and it contributes
     * nothing.
     */
    val children: List<ChildCustomization>? = null,
    val type: CustomizationType
)

@Serializable
data class ClientPluginCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    /**
     * Whether this container is currently enabled.
     */
    val enabled: Boolean,
    /**
     * `clientId` of the client that contributed this container. Absent for
     * server-originated entries.
     */
    val clientId: String? = null,
    /**
     * Host-reported load state. Absent means the host has not yet reported
     * a load state for this container.
     */
    val load: CustomizationLoadState? = null,
    /**
     * Children discovered inside this container.
     * 
     * Absent means the host has not parsed this container yet. An empty
     * array means the host parsed the container and it contributes
     * nothing.
     */
    val children: List<ChildCustomization>? = null,
    val type: CustomizationType,
    /**
     * Opaque version token used by the host to detect changes.
     */
    val nonce: String? = null
)

@Serializable
data class DirectoryCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    /**
     * Whether this container is currently enabled.
     */
    val enabled: Boolean,
    /**
     * `clientId` of the client that contributed this container. Absent for
     * server-originated entries.
     */
    val clientId: String? = null,
    /**
     * Host-reported load state. Absent means the host has not yet reported
     * a load state for this container.
     */
    val load: CustomizationLoadState? = null,
    /**
     * Children discovered inside this container.
     * 
     * Absent means the host has not parsed this container yet. An empty
     * array means the host parsed the container and it contributes
     * nothing.
     */
    val children: List<ChildCustomization>? = null,
    val type: CustomizationType,
    /**
     * Which child customization type this directory holds.
     */
    val contents: CustomizationType,
    /**
     * Whether clients may write into this directory.
     */
    val writable: Boolean
)

@Serializable
data class AgentCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    val type: CustomizationType,
    /**
     * Short description of what the agent specializes in and when to
     * invoke it. Sourced from the agent file's frontmatter `description`.
     */
    val description: String? = null
)

@Serializable
data class SkillCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    val type: CustomizationType,
    /**
     * Short description used for help text and auto-invocation matching.
     * Sourced from the skill's frontmatter `description`.
     */
    val description: String? = null,
    /**
     * When `true`, only the user can invoke this skill — the agent will not
     * auto-invoke it. Sourced from the command skill's frontmatter
     * `disable-model-invocation` flag.
     */
    val disableModelInvocation: Boolean? = null
)

@Serializable
data class PromptCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    val type: CustomizationType,
    /**
     * Short description of what the prompt does.
     */
    val description: String? = null
)

@Serializable
data class RuleCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    val type: CustomizationType,
    /**
     * Description of what the rule enforces.
     */
    val description: String? = null,
    /**
     * When `true`, the rule is always active (subject to `globs` if any).
     * When `false` or absent, the agent or user decides whether to apply
     * the rule.
     */
    val alwaysApply: Boolean? = null,
    /**
     * Glob patterns the rule applies to. When present, the rule is only
     * active for matching files.
     */
    val globs: List<String>? = null
)

@Serializable
data class HookCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    val type: CustomizationType
)

@Serializable
data class McpServerCustomization(
    /**
     * Session-unique opaque identifier. Used by every action that targets a
     * specific customization. Minted by whoever publishes the customization
     * (typically the agent host).
     */
    val id: String,
    /**
     * Source URI for this customization. A plugin URL, a file URI, or a
     * directory URI.
     * 
     * For declarations that live inside a larger file — e.g. an MCP
     * server declared inline in a `plugins.json` manifest — `uri` points
     * to the containing file and {@link CustomizationBase.range | `range`}
     * narrows it to the declaration's span.
     */
    val uri: String,
    /**
     * Human-readable name.
     */
    val name: String,
    /**
     * Icons for UI display.
     */
    val icons: List<Icon>? = null,
    /**
     * Optional span within {@link CustomizationBase.uri | `uri`} when this
     * customization is a subset of a larger file (for example, one entry
     * in an inline `mcpServers` block of a `plugins.json` manifest).
     * Absent when the customization covers the whole resource.
     */
    val range: TextRange? = null,
    val type: CustomizationType
)

@Serializable
data class FileEdit(
    /**
     * The file state before the edit. Absent for file creations or for in-place file edits.
     */
    val before: JsonElement? = null,
    /**
     * The file state after the edit. Absent for file deletions.
     */
    val after: JsonElement? = null,
    /**
     * Optional diff display metadata
     */
    val diff: JsonElement? = null
)

@Serializable
data class TerminalInfo(
    /**
     * Terminal URI (subscribable for full terminal state)
     */
    val resource: String,
    /**
     * Human-readable terminal title
     */
    val title: String,
    /**
     * Who currently holds this terminal
     */
    val claim: TerminalClaim,
    /**
     * Process exit code, if the terminal process has exited
     */
    val exitCode: Long? = null
)

@Serializable
data class TerminalClientClaim(
    /**
     * Discriminant
     */
    val kind: TerminalClaimKind,
    /**
     * The `clientId` of the claiming client
     */
    val clientId: String
)

@Serializable
data class TerminalSessionClaim(
    /**
     * Discriminant
     */
    val kind: TerminalClaimKind,
    /**
     * Session URI that claimed the terminal
     */
    val session: String,
    /**
     * Optional turn identifier within the session
     */
    val turnId: String? = null,
    /**
     * Optional tool call identifier within the turn
     */
    val toolCallId: String? = null
)

@Serializable
data class TerminalState(
    /**
     * Human-readable terminal title
     */
    val title: String,
    /**
     * Current working directory of the terminal process
     */
    val cwd: String? = null,
    /**
     * Terminal width in columns
     */
    val cols: Long? = null,
    /**
     * Terminal height in rows
     */
    val rows: Long? = null,
    /**
     * Typed content parts, replacing the flat `content: string`.
     * 
     * Naive consumers that only need the raw VT stream can reconstruct it with:
     * `content.map(p => p.type === 'command' ? p.output : p.value).join('')`
     * 
     * Consumers that need command boundaries can filter by part type.
     */
    val content: List<TerminalContentPart>,
    /**
     * Process exit code, set when the terminal process exits
     */
    val exitCode: Long? = null,
    /**
     * Who currently holds this terminal
     */
    val claim: TerminalClaim,
    /**
     * Whether this terminal emits `terminal/commandExecuted` and
     * `terminal/commandFinished` actions and populates `command`-typed parts.
     * 
     * Clients MUST check this flag before relying on command detection.
     * Do NOT use the presence of a `command` part as a feature flag — parts
     * are absent in the normal idle state.
     */
    val supportsCommandDetection: Boolean? = null
)

@Serializable
data class TerminalUnclassifiedPart(
    val type: String,
    /**
     * Accumulated VT output. Appended to by `terminal/data` when no command is executing.
     */
    val value: String
)

@Serializable
data class TerminalCommandPart(
    val type: String,
    /**
     * Stable id matching the `commandId` on the corresponding
     * `terminal/commandExecuted` and `terminal/commandFinished` actions.
     */
    val commandId: String,
    /**
     * The command line submitted to the shell.
     */
    val commandLine: String,
    /**
     * Accumulated VT output. Appended to by `terminal/data` while `isComplete`
     * is false. Shell integration escape sequences are stripped by the server.
     */
    val output: String,
    /**
     * Unix timestamp (ms) when execution started, as reported by the server.
     */
    val timestamp: Long,
    /**
     * Whether the command has finished.
     */
    val isComplete: Boolean,
    /**
     * Shell exit code. Set at completion. `undefined` if unknown.
     */
    val exitCode: Long? = null,
    /**
     * Wall-clock duration in milliseconds. Set at completion.
     */
    val durationMs: Long? = null
)

@Serializable
data class UsageInfo(
    /**
     * Input tokens consumed
     */
    val inputTokens: Long? = null,
    /**
     * Output tokens generated
     */
    val outputTokens: Long? = null,
    /**
     * Model used
     */
    val model: String? = null,
    /**
     * Tokens read from cache
     */
    val cacheReadTokens: Long? = null,
    /**
     * Additional provider-specific metadata for this usage report.
     * Clients MAY look for well-known optional keys here to provide enhanced UI.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ErrorInfo(
    /**
     * Error type identifier
     */
    val errorType: String,
    /**
     * Human-readable error message
     */
    val message: String,
    /**
     * Stack trace
     */
    val stack: String? = null
)

@Serializable
data class Snapshot(
    /**
     * The subscribed channel URI (e.g. `ahp-root://` or `ahp-session:/<uuid>`)
     */
    val resource: String,
    /**
     * The current state of the resource
     */
    val state: SnapshotState,
    /**
     * The `serverSeq` at which this snapshot was taken. Subsequent actions will have `serverSeq > fromSeq`.
     */
    val fromSeq: Long
)

@Serializable
data class ChangesetSummary(
    /**
     * Human-readable label, e.g. `"Uncommitted Changes"`.
     */
    val label: String,
    /**
     * RFC 6570 URI template. Clients parse the variables directly out of the
     * template using the standard `{name}` syntax — they are not redeclared
     * here.
     * 
     * Only the following template shapes are defined by this protocol; any
     * other variable name MUST be ignored by clients (there is no
     * protocol-defined way to obtain values for unknown variables):
     * 
     * | Variables in template                       | Meaning                                                                              |
     * | ------------------------------------------- | ------------------------------------------------------------------------------------ |
     * | _(none)_                                    | A static, session-wide changeset. The template is itself a subscribable URI.         |
     * | `{turnId}`                                  | Per-turn slice. Expand with a `Turn.id` from the session.                            |
     * | `{originalTurnId}` and `{modifiedTurnId}`   | Diff between two turns. Both variables MUST be present.                              |
     * 
     * Future protocol versions MAY add new well-known variables.
     */
    val uriTemplate: String,
    /**
     * Optional longer description.
     */
    val description: String? = null,
    /**
     * Aggregate line additions across the changeset, when known.
     */
    val additions: Long? = null,
    /**
     * Aggregate line deletions across the changeset, when known.
     */
    val deletions: Long? = null,
    /**
     * Number of files in the changeset, when known.
     */
    val files: Long? = null
)

@Serializable
data class ChangesetState(
    /**
     * Computation lifecycle.
     */
    val status: ChangesetStatus,
    /**
     * Present iff `status === ChangesetStatus.Error`.
     */
    val error: ErrorInfo? = null,
    /**
     * Files in this changeset, keyed by {@link ChangesetFile.id}.
     */
    val files: List<ChangesetFile>,
    /**
     * Operations the client may invoke against this changeset. Omit when no
     * operations are available.
     */
    val operations: List<ChangesetOperation>? = null
)

@Serializable
data class ChangesetFile(
    /**
     * Stable identifier within the changeset. Typically `after.uri`
     * (or `before.uri` for deletions).
     */
    val id: String,
    /**
     * Reuses the existing {@link FileEdit} shape. Clients derive line
     * additions, deletions, and rename/create/delete semantics from this.
     */
    val edit: FileEdit,
    /**
     * Server-defined opaque metadata, surfaced to operations and tooling
     * but not interpreted by the protocol.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChangesetOperation(
    /**
     * Stable identifier, unique within this changeset.
     */
    val id: String,
    /**
     * Human-readable button/menu label.
     */
    val label: String,
    /**
     * Optional longer description shown on hover or in tooltips.
     */
    val description: String? = null,
    /**
     * Where this operation can be invoked.
     */
    val scopes: List<ChangesetOperationScope>,
    /**
     * Optional confirmation prompt to show before invoking. When present,
     * the client MUST display this message to the user (typically in a
     * confirmation dialog) and only invoke the operation after the user
     * accepts. The presence of this field also signals that the operation
     * is destructive — clients SHOULD style the affirmative button
     * accordingly (e.g. with a warning colour).
     */
    val confirmation: StringOrMarkdown? = null,
    /**
     * Optional generic icon hint, e.g. `"check"`, `"trash"`.
     */
    val icon: String? = null,
    /**
     * Current execution status. The server sets
     * {@link ChangesetOperationStatus.Running | Running} while an invocation
     * is in flight, {@link ChangesetOperationStatus.Error | Error} when the
     * most recent invocation failed, and
     * {@link ChangesetOperationStatus.Idle | Idle} otherwise.
     * 
     * Clients SHOULD reflect this state in the UI — e.g. disabling the
     * control or showing a spinner while `Running`, and surfacing
     * {@link error} while `Error`.
     */
    val status: ChangesetOperationStatus,
    /**
     * Cause of failure. Present iff
     * `status === ChangesetOperationStatus.Error`; otherwise omitted.
     */
    val error: ErrorInfo? = null
)

@Serializable
data class TelemetryCapabilities(
    /**
     * Channel URI (or RFC 6570 URI template) for OTLP log records
     * (`otlp/exportLogs` notifications).
     * 
     * The following template variables are defined by this protocol; any
     * other variable name MUST be ignored by clients (there is no
     * protocol-defined way to obtain values for unknown variables):
     * 
     * | Variables in template | Meaning                                                                                                 |
     * | --------------------- | ------------------------------------------------------------------------------------------------------- |
     * | _(none)_              | The host does not support subscriber-side severity filtering. The template is itself a subscribable URI. |
     * | `{level}`             | Minimum OTLP severity to deliver. Expand to one of the [OTLP `SeverityNumber`](https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber) short names (case-insensitive): `trace`, `debug`, `info`, `warn`, `error`, `fatal`. The server delivers log records whose `severityNumber` falls in the corresponding band or above. |
     * 
     * Hosts SHOULD honour the expanded `{level}`; clients MUST still filter
     * defensively in case a host ignores the parameter. Hosts that do not
     * advertise `{level}` deliver all severities.
     * 
     * Future protocol versions MAY add new well-known variables (e.g. scope
     * or attribute filters).
     */
    val logs: String? = null,
    /**
     * Channel URI for OTLP spans (`otlp/exportTraces` notifications). No
     * template variables are defined by this protocol version.
     */
    val traces: String? = null,
    /**
     * Channel URI for OTLP metric data points (`otlp/exportMetrics`
     * notifications). No template variables are defined by this protocol
     * version.
     */
    val metrics: String? = null
)

@Serializable
data class ResourceWatchState(
    /**
     * The URI being watched. For recursive watches this is the root of the
     * subtree; for non-recursive watches this is the single file or
     * directory.
     */
    val root: String,
    /**
     * `true` if the watcher reports changes for descendants of `root`;
     * `false` if it only reports changes to `root` itself (and, when
     * `root` is a directory, its direct children).
     */
    val recursive: Boolean,
    /**
     * Optional glob patterns or paths relative to `root` to exclude from
     * change reporting.
     */
    val excludes: JsonElement? = null,
    /**
     * Optional glob patterns or paths relative to `root` to restrict
     * change reporting to. Omit to report every change under `root`
     * subject to `excludes`.
     */
    val includes: JsonElement? = null
)

@Serializable
data class ResourceChange(
    /**
     * The URI of the resource that changed.
     */
    val uri: String,
    /**
     * The kind of change observed.
     */
    val type: ResourceChangeType
)

// ─── Discriminated Unions ───────────────────────────────────────────────────

@Serializable(with = ResponsePartSerializer::class)
sealed interface ResponsePart

@JvmInline
value class ResponsePartMarkdown(val value: MarkdownResponsePart) : ResponsePart
@JvmInline
value class ResponsePartContentRef(val value: ResourceReponsePart) : ResponsePart
@JvmInline
value class ResponsePartToolCall(val value: ToolCallResponsePart) : ResponsePart
@JvmInline
value class ResponsePartReasoning(val value: ReasoningResponsePart) : ResponsePart
@JvmInline
value class ResponsePartSystemNotification(val value: SystemNotificationResponsePart) : ResponsePart
/**
 * Forward-compat catch-all for unknown ResponsePart discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ResponsePartUnknown(val raw: JsonObject) : ResponsePart

internal object ResponsePartSerializer : KSerializer<ResponsePart> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ResponsePart")

    override fun deserialize(decoder: Decoder): ResponsePart {
        val input = decoder as? JsonDecoder
            ?: error("ResponsePart can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ResponsePart")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return ResponsePartUnknown(obj)
        return when (discriminant) {
            "markdown" -> ResponsePartMarkdown(input.json.decodeFromJsonElement(MarkdownResponsePart.serializer(), element))
            "contentRef" -> ResponsePartContentRef(input.json.decodeFromJsonElement(ResourceReponsePart.serializer(), element))
            "toolCall" -> ResponsePartToolCall(input.json.decodeFromJsonElement(ToolCallResponsePart.serializer(), element))
            "reasoning" -> ResponsePartReasoning(input.json.decodeFromJsonElement(ReasoningResponsePart.serializer(), element))
            "systemNotification" -> ResponsePartSystemNotification(input.json.decodeFromJsonElement(SystemNotificationResponsePart.serializer(), element))
            else -> ResponsePartUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ResponsePart) {
        val output = encoder as? JsonEncoder
            ?: error("ResponsePart can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ResponsePartMarkdown -> output.json.encodeToJsonElement(MarkdownResponsePart.serializer(), value.value)
            is ResponsePartContentRef -> output.json.encodeToJsonElement(ResourceReponsePart.serializer(), value.value)
            is ResponsePartToolCall -> output.json.encodeToJsonElement(ToolCallResponsePart.serializer(), value.value)
            is ResponsePartReasoning -> output.json.encodeToJsonElement(ReasoningResponsePart.serializer(), value.value)
            is ResponsePartSystemNotification -> output.json.encodeToJsonElement(SystemNotificationResponsePart.serializer(), value.value)
            is ResponsePartUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = ToolCallStateSerializer::class)
sealed interface ToolCallState

@JvmInline
value class ToolCallStateStreaming(val value: ToolCallStreamingState) : ToolCallState
@JvmInline
value class ToolCallStatePendingConfirmation(val value: ToolCallPendingConfirmationState) : ToolCallState
@JvmInline
value class ToolCallStateRunning(val value: ToolCallRunningState) : ToolCallState
@JvmInline
value class ToolCallStatePendingResultConfirmation(val value: ToolCallPendingResultConfirmationState) : ToolCallState
@JvmInline
value class ToolCallStateCompleted(val value: ToolCallCompletedState) : ToolCallState
@JvmInline
value class ToolCallStateCancelled(val value: ToolCallCancelledState) : ToolCallState
/**
 * Forward-compat catch-all for unknown ToolCallState discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ToolCallStateUnknown(val raw: JsonObject) : ToolCallState

internal object ToolCallStateSerializer : KSerializer<ToolCallState> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ToolCallState")

    override fun deserialize(decoder: Decoder): ToolCallState {
        val input = decoder as? JsonDecoder
            ?: error("ToolCallState can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ToolCallState")
        val discriminant = (obj["status"] as? JsonPrimitive)?.content
            ?: return ToolCallStateUnknown(obj)
        return when (discriminant) {
            "streaming" -> ToolCallStateStreaming(input.json.decodeFromJsonElement(ToolCallStreamingState.serializer(), element))
            "pending-confirmation" -> ToolCallStatePendingConfirmation(input.json.decodeFromJsonElement(ToolCallPendingConfirmationState.serializer(), element))
            "running" -> ToolCallStateRunning(input.json.decodeFromJsonElement(ToolCallRunningState.serializer(), element))
            "pending-result-confirmation" -> ToolCallStatePendingResultConfirmation(input.json.decodeFromJsonElement(ToolCallPendingResultConfirmationState.serializer(), element))
            "completed" -> ToolCallStateCompleted(input.json.decodeFromJsonElement(ToolCallCompletedState.serializer(), element))
            "cancelled" -> ToolCallStateCancelled(input.json.decodeFromJsonElement(ToolCallCancelledState.serializer(), element))
            else -> ToolCallStateUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ToolCallState) {
        val output = encoder as? JsonEncoder
            ?: error("ToolCallState can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ToolCallStateStreaming -> output.json.encodeToJsonElement(ToolCallStreamingState.serializer(), value.value)
            is ToolCallStatePendingConfirmation -> output.json.encodeToJsonElement(ToolCallPendingConfirmationState.serializer(), value.value)
            is ToolCallStateRunning -> output.json.encodeToJsonElement(ToolCallRunningState.serializer(), value.value)
            is ToolCallStatePendingResultConfirmation -> output.json.encodeToJsonElement(ToolCallPendingResultConfirmationState.serializer(), value.value)
            is ToolCallStateCompleted -> output.json.encodeToJsonElement(ToolCallCompletedState.serializer(), value.value)
            is ToolCallStateCancelled -> output.json.encodeToJsonElement(ToolCallCancelledState.serializer(), value.value)
            is ToolCallStateUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = TerminalClaimSerializer::class)
sealed interface TerminalClaim

@JvmInline
value class TerminalClaimClient(val value: TerminalClientClaim) : TerminalClaim
@JvmInline
value class TerminalClaimSession(val value: TerminalSessionClaim) : TerminalClaim
/**
 * Forward-compat catch-all for unknown TerminalClaim discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class TerminalClaimUnknown(val raw: JsonObject) : TerminalClaim

internal object TerminalClaimSerializer : KSerializer<TerminalClaim> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("TerminalClaim")

    override fun deserialize(decoder: Decoder): TerminalClaim {
        val input = decoder as? JsonDecoder
            ?: error("TerminalClaim can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for TerminalClaim")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return TerminalClaimUnknown(obj)
        return when (discriminant) {
            "client" -> TerminalClaimClient(input.json.decodeFromJsonElement(TerminalClientClaim.serializer(), element))
            "session" -> TerminalClaimSession(input.json.decodeFromJsonElement(TerminalSessionClaim.serializer(), element))
            else -> TerminalClaimUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: TerminalClaim) {
        val output = encoder as? JsonEncoder
            ?: error("TerminalClaim can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is TerminalClaimClient -> output.json.encodeToJsonElement(TerminalClientClaim.serializer(), value.value)
            is TerminalClaimSession -> output.json.encodeToJsonElement(TerminalSessionClaim.serializer(), value.value)
            is TerminalClaimUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = TerminalContentPartSerializer::class)
sealed interface TerminalContentPart

@JvmInline
value class TerminalContentPartUnclassified(val value: TerminalUnclassifiedPart) : TerminalContentPart
@JvmInline
value class TerminalContentPartCommand(val value: TerminalCommandPart) : TerminalContentPart
/**
 * Forward-compat catch-all for unknown TerminalContentPart discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class TerminalContentPartUnknown(val raw: JsonObject) : TerminalContentPart

internal object TerminalContentPartSerializer : KSerializer<TerminalContentPart> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("TerminalContentPart")

    override fun deserialize(decoder: Decoder): TerminalContentPart {
        val input = decoder as? JsonDecoder
            ?: error("TerminalContentPart can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for TerminalContentPart")
        val discriminant = (obj["type"] as? JsonPrimitive)?.content
            ?: return TerminalContentPartUnknown(obj)
        return when (discriminant) {
            "unclassified" -> TerminalContentPartUnclassified(input.json.decodeFromJsonElement(TerminalUnclassifiedPart.serializer(), element))
            "command" -> TerminalContentPartCommand(input.json.decodeFromJsonElement(TerminalCommandPart.serializer(), element))
            else -> TerminalContentPartUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: TerminalContentPart) {
        val output = encoder as? JsonEncoder
            ?: error("TerminalContentPart can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is TerminalContentPartUnclassified -> output.json.encodeToJsonElement(TerminalUnclassifiedPart.serializer(), value.value)
            is TerminalContentPartCommand -> output.json.encodeToJsonElement(TerminalCommandPart.serializer(), value.value)
            is TerminalContentPartUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = SessionInputQuestionSerializer::class)
sealed interface SessionInputQuestion

@JvmInline
value class SessionInputQuestionText(val value: SessionInputTextQuestion) : SessionInputQuestion
@JvmInline
value class SessionInputQuestionNumber(val value: SessionInputNumberQuestion) : SessionInputQuestion
@JvmInline
value class SessionInputQuestionBoolean(val value: SessionInputBooleanQuestion) : SessionInputQuestion
@JvmInline
value class SessionInputQuestionSingleSelect(val value: SessionInputSingleSelectQuestion) : SessionInputQuestion
@JvmInline
value class SessionInputQuestionMultiSelect(val value: SessionInputMultiSelectQuestion) : SessionInputQuestion
/**
 * Forward-compat catch-all for unknown SessionInputQuestion discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class SessionInputQuestionUnknown(val raw: JsonObject) : SessionInputQuestion

internal object SessionInputQuestionSerializer : KSerializer<SessionInputQuestion> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("SessionInputQuestion")

    override fun deserialize(decoder: Decoder): SessionInputQuestion {
        val input = decoder as? JsonDecoder
            ?: error("SessionInputQuestion can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for SessionInputQuestion")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return SessionInputQuestionUnknown(obj)
        return when (discriminant) {
            "text" -> SessionInputQuestionText(input.json.decodeFromJsonElement(SessionInputTextQuestion.serializer(), element))
            "number" -> SessionInputQuestionNumber(input.json.decodeFromJsonElement(SessionInputNumberQuestion.serializer(), element))
            "integer" -> SessionInputQuestionNumber(input.json.decodeFromJsonElement(SessionInputNumberQuestion.serializer(), element))
            "boolean" -> SessionInputQuestionBoolean(input.json.decodeFromJsonElement(SessionInputBooleanQuestion.serializer(), element))
            "single-select" -> SessionInputQuestionSingleSelect(input.json.decodeFromJsonElement(SessionInputSingleSelectQuestion.serializer(), element))
            "multi-select" -> SessionInputQuestionMultiSelect(input.json.decodeFromJsonElement(SessionInputMultiSelectQuestion.serializer(), element))
            else -> SessionInputQuestionUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: SessionInputQuestion) {
        val output = encoder as? JsonEncoder
            ?: error("SessionInputQuestion can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is SessionInputQuestionText -> output.json.encodeToJsonElement(SessionInputTextQuestion.serializer(), value.value)
            is SessionInputQuestionNumber -> output.json.encodeToJsonElement(SessionInputNumberQuestion.serializer(), value.value)
            is SessionInputQuestionBoolean -> output.json.encodeToJsonElement(SessionInputBooleanQuestion.serializer(), value.value)
            is SessionInputQuestionSingleSelect -> output.json.encodeToJsonElement(SessionInputSingleSelectQuestion.serializer(), value.value)
            is SessionInputQuestionMultiSelect -> output.json.encodeToJsonElement(SessionInputMultiSelectQuestion.serializer(), value.value)
            is SessionInputQuestionUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = SessionInputAnswerValueSerializer::class)
sealed interface SessionInputAnswerValue

@JvmInline
value class SessionInputAnswerValueText(val value: SessionInputTextAnswerValue) : SessionInputAnswerValue
@JvmInline
value class SessionInputAnswerValueNumber(val value: SessionInputNumberAnswerValue) : SessionInputAnswerValue
@JvmInline
value class SessionInputAnswerValueBoolean(val value: SessionInputBooleanAnswerValue) : SessionInputAnswerValue
@JvmInline
value class SessionInputAnswerValueSelected(val value: SessionInputSelectedAnswerValue) : SessionInputAnswerValue
@JvmInline
value class SessionInputAnswerValueSelectedMany(val value: SessionInputSelectedManyAnswerValue) : SessionInputAnswerValue
/**
 * Forward-compat catch-all for unknown SessionInputAnswerValue discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class SessionInputAnswerValueUnknown(val raw: JsonObject) : SessionInputAnswerValue

internal object SessionInputAnswerValueSerializer : KSerializer<SessionInputAnswerValue> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("SessionInputAnswerValue")

    override fun deserialize(decoder: Decoder): SessionInputAnswerValue {
        val input = decoder as? JsonDecoder
            ?: error("SessionInputAnswerValue can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for SessionInputAnswerValue")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return SessionInputAnswerValueUnknown(obj)
        return when (discriminant) {
            "text" -> SessionInputAnswerValueText(input.json.decodeFromJsonElement(SessionInputTextAnswerValue.serializer(), element))
            "number" -> SessionInputAnswerValueNumber(input.json.decodeFromJsonElement(SessionInputNumberAnswerValue.serializer(), element))
            "boolean" -> SessionInputAnswerValueBoolean(input.json.decodeFromJsonElement(SessionInputBooleanAnswerValue.serializer(), element))
            "selected" -> SessionInputAnswerValueSelected(input.json.decodeFromJsonElement(SessionInputSelectedAnswerValue.serializer(), element))
            "selected-many" -> SessionInputAnswerValueSelectedMany(input.json.decodeFromJsonElement(SessionInputSelectedManyAnswerValue.serializer(), element))
            else -> SessionInputAnswerValueUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: SessionInputAnswerValue) {
        val output = encoder as? JsonEncoder
            ?: error("SessionInputAnswerValue can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is SessionInputAnswerValueText -> output.json.encodeToJsonElement(SessionInputTextAnswerValue.serializer(), value.value)
            is SessionInputAnswerValueNumber -> output.json.encodeToJsonElement(SessionInputNumberAnswerValue.serializer(), value.value)
            is SessionInputAnswerValueBoolean -> output.json.encodeToJsonElement(SessionInputBooleanAnswerValue.serializer(), value.value)
            is SessionInputAnswerValueSelected -> output.json.encodeToJsonElement(SessionInputSelectedAnswerValue.serializer(), value.value)
            is SessionInputAnswerValueSelectedMany -> output.json.encodeToJsonElement(SessionInputSelectedManyAnswerValue.serializer(), value.value)
            is SessionInputAnswerValueUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = SessionInputAnswerSerializer::class)
sealed interface SessionInputAnswer

@JvmInline
value class SessionInputAnswerDraft(val value: SessionInputAnswered) : SessionInputAnswer
@JvmInline
value class SessionInputAnswerSkipped(val value: SessionInputSkipped) : SessionInputAnswer
/**
 * Forward-compat catch-all for unknown SessionInputAnswer discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class SessionInputAnswerUnknown(val raw: JsonObject) : SessionInputAnswer

internal object SessionInputAnswerSerializer : KSerializer<SessionInputAnswer> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("SessionInputAnswer")

    override fun deserialize(decoder: Decoder): SessionInputAnswer {
        val input = decoder as? JsonDecoder
            ?: error("SessionInputAnswer can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for SessionInputAnswer")
        val discriminant = (obj["state"] as? JsonPrimitive)?.content
            ?: return SessionInputAnswerUnknown(obj)
        return when (discriminant) {
            "draft" -> SessionInputAnswerDraft(input.json.decodeFromJsonElement(SessionInputAnswered.serializer(), element))
            "submitted" -> SessionInputAnswerDraft(input.json.decodeFromJsonElement(SessionInputAnswered.serializer(), element))
            "skipped" -> SessionInputAnswerSkipped(input.json.decodeFromJsonElement(SessionInputSkipped.serializer(), element))
            else -> SessionInputAnswerUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: SessionInputAnswer) {
        val output = encoder as? JsonEncoder
            ?: error("SessionInputAnswer can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is SessionInputAnswerDraft -> output.json.encodeToJsonElement(SessionInputAnswered.serializer(), value.value)
            is SessionInputAnswerSkipped -> output.json.encodeToJsonElement(SessionInputSkipped.serializer(), value.value)
            is SessionInputAnswerUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = MessageAttachmentSerializer::class)
sealed interface MessageAttachment

@JvmInline
value class MessageAttachmentSimple(val value: SimpleMessageAttachment) : MessageAttachment
@JvmInline
value class MessageAttachmentEmbeddedResource(val value: MessageEmbeddedResourceAttachment) : MessageAttachment
@JvmInline
value class MessageAttachmentResource(val value: MessageResourceAttachment) : MessageAttachment
/**
 * Forward-compat catch-all for unknown MessageAttachment discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class MessageAttachmentUnknown(val raw: JsonObject) : MessageAttachment

internal object MessageAttachmentSerializer : KSerializer<MessageAttachment> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("MessageAttachment")

    override fun deserialize(decoder: Decoder): MessageAttachment {
        val input = decoder as? JsonDecoder
            ?: error("MessageAttachment can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for MessageAttachment")
        val discriminant = (obj["type"] as? JsonPrimitive)?.content
            ?: return MessageAttachmentUnknown(obj)
        return when (discriminant) {
            "simple" -> MessageAttachmentSimple(input.json.decodeFromJsonElement(SimpleMessageAttachment.serializer(), element))
            "embeddedResource" -> MessageAttachmentEmbeddedResource(input.json.decodeFromJsonElement(MessageEmbeddedResourceAttachment.serializer(), element))
            "resource" -> MessageAttachmentResource(input.json.decodeFromJsonElement(MessageResourceAttachment.serializer(), element))
            else -> MessageAttachmentUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: MessageAttachment) {
        val output = encoder as? JsonEncoder
            ?: error("MessageAttachment can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is MessageAttachmentSimple -> output.json.encodeToJsonElement(SimpleMessageAttachment.serializer(), value.value)
            is MessageAttachmentEmbeddedResource -> output.json.encodeToJsonElement(MessageEmbeddedResourceAttachment.serializer(), value.value)
            is MessageAttachmentResource -> output.json.encodeToJsonElement(MessageResourceAttachment.serializer(), value.value)
            is MessageAttachmentUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = CustomizationSerializer::class)
sealed interface Customization

@JvmInline
value class CustomizationPlugin(val value: PluginCustomization) : Customization
@JvmInline
value class CustomizationDirectory(val value: DirectoryCustomization) : Customization
/**
 * Forward-compat catch-all for unknown Customization discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class CustomizationUnknown(val raw: JsonObject) : Customization

internal object CustomizationSerializer : KSerializer<Customization> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("Customization")

    override fun deserialize(decoder: Decoder): Customization {
        val input = decoder as? JsonDecoder
            ?: error("Customization can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for Customization")
        val discriminant = (obj["type"] as? JsonPrimitive)?.content
            ?: return CustomizationUnknown(obj)
        return when (discriminant) {
            "plugin" -> CustomizationPlugin(input.json.decodeFromJsonElement(PluginCustomization.serializer(), element))
            "directory" -> CustomizationDirectory(input.json.decodeFromJsonElement(DirectoryCustomization.serializer(), element))
            else -> CustomizationUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: Customization) {
        val output = encoder as? JsonEncoder
            ?: error("Customization can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is CustomizationPlugin -> output.json.encodeToJsonElement(PluginCustomization.serializer(), value.value)
            is CustomizationDirectory -> output.json.encodeToJsonElement(DirectoryCustomization.serializer(), value.value)
            is CustomizationUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = ChildCustomizationSerializer::class)
sealed interface ChildCustomization

@JvmInline
value class ChildCustomizationAgent(val value: AgentCustomization) : ChildCustomization
@JvmInline
value class ChildCustomizationSkill(val value: SkillCustomization) : ChildCustomization
@JvmInline
value class ChildCustomizationPrompt(val value: PromptCustomization) : ChildCustomization
@JvmInline
value class ChildCustomizationRule(val value: RuleCustomization) : ChildCustomization
@JvmInline
value class ChildCustomizationHook(val value: HookCustomization) : ChildCustomization
@JvmInline
value class ChildCustomizationMcpServer(val value: McpServerCustomization) : ChildCustomization
/**
 * Forward-compat catch-all for unknown ChildCustomization discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ChildCustomizationUnknown(val raw: JsonObject) : ChildCustomization

internal object ChildCustomizationSerializer : KSerializer<ChildCustomization> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ChildCustomization")

    override fun deserialize(decoder: Decoder): ChildCustomization {
        val input = decoder as? JsonDecoder
            ?: error("ChildCustomization can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ChildCustomization")
        val discriminant = (obj["type"] as? JsonPrimitive)?.content
            ?: return ChildCustomizationUnknown(obj)
        return when (discriminant) {
            "agent" -> ChildCustomizationAgent(input.json.decodeFromJsonElement(AgentCustomization.serializer(), element))
            "skill" -> ChildCustomizationSkill(input.json.decodeFromJsonElement(SkillCustomization.serializer(), element))
            "prompt" -> ChildCustomizationPrompt(input.json.decodeFromJsonElement(PromptCustomization.serializer(), element))
            "rule" -> ChildCustomizationRule(input.json.decodeFromJsonElement(RuleCustomization.serializer(), element))
            "hook" -> ChildCustomizationHook(input.json.decodeFromJsonElement(HookCustomization.serializer(), element))
            "mcpServer" -> ChildCustomizationMcpServer(input.json.decodeFromJsonElement(McpServerCustomization.serializer(), element))
            else -> ChildCustomizationUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ChildCustomization) {
        val output = encoder as? JsonEncoder
            ?: error("ChildCustomization can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChildCustomizationAgent -> output.json.encodeToJsonElement(AgentCustomization.serializer(), value.value)
            is ChildCustomizationSkill -> output.json.encodeToJsonElement(SkillCustomization.serializer(), value.value)
            is ChildCustomizationPrompt -> output.json.encodeToJsonElement(PromptCustomization.serializer(), value.value)
            is ChildCustomizationRule -> output.json.encodeToJsonElement(RuleCustomization.serializer(), value.value)
            is ChildCustomizationHook -> output.json.encodeToJsonElement(HookCustomization.serializer(), value.value)
            is ChildCustomizationMcpServer -> output.json.encodeToJsonElement(McpServerCustomization.serializer(), value.value)
            is ChildCustomizationUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = CustomizationLoadStateSerializer::class)
sealed interface CustomizationLoadState

@JvmInline
value class CustomizationLoadStateLoading(val value: CustomizationLoadingState) : CustomizationLoadState
@JvmInline
value class CustomizationLoadStateLoaded(val value: CustomizationLoadedState) : CustomizationLoadState
@JvmInline
value class CustomizationLoadStateDegraded(val value: CustomizationDegradedState) : CustomizationLoadState
@JvmInline
value class CustomizationLoadStateError(val value: CustomizationErrorState) : CustomizationLoadState
/**
 * Forward-compat catch-all for unknown CustomizationLoadState discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class CustomizationLoadStateUnknown(val raw: JsonObject) : CustomizationLoadState

internal object CustomizationLoadStateSerializer : KSerializer<CustomizationLoadState> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("CustomizationLoadState")

    override fun deserialize(decoder: Decoder): CustomizationLoadState {
        val input = decoder as? JsonDecoder
            ?: error("CustomizationLoadState can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for CustomizationLoadState")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return CustomizationLoadStateUnknown(obj)
        return when (discriminant) {
            "loading" -> CustomizationLoadStateLoading(input.json.decodeFromJsonElement(CustomizationLoadingState.serializer(), element))
            "loaded" -> CustomizationLoadStateLoaded(input.json.decodeFromJsonElement(CustomizationLoadedState.serializer(), element))
            "degraded" -> CustomizationLoadStateDegraded(input.json.decodeFromJsonElement(CustomizationDegradedState.serializer(), element))
            "error" -> CustomizationLoadStateError(input.json.decodeFromJsonElement(CustomizationErrorState.serializer(), element))
            else -> CustomizationLoadStateUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: CustomizationLoadState) {
        val output = encoder as? JsonEncoder
            ?: error("CustomizationLoadState can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is CustomizationLoadStateLoading -> output.json.encodeToJsonElement(CustomizationLoadingState.serializer(), value.value)
            is CustomizationLoadStateLoaded -> output.json.encodeToJsonElement(CustomizationLoadedState.serializer(), value.value)
            is CustomizationLoadStateDegraded -> output.json.encodeToJsonElement(CustomizationDegradedState.serializer(), value.value)
            is CustomizationLoadStateError -> output.json.encodeToJsonElement(CustomizationErrorState.serializer(), value.value)
            is CustomizationLoadStateUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = ToolResultContentSerializer::class)
sealed interface ToolResultContent {
    @JvmInline value class Text(val value: ToolResultTextContent) : ToolResultContent
    @JvmInline value class EmbeddedResource(val value: ToolResultEmbeddedResourceContent) : ToolResultContent
    @JvmInline value class Resource(val value: ToolResultResourceContent) : ToolResultContent
    @JvmInline value class FileEdit(val value: ToolResultFileEditContent) : ToolResultContent
    @JvmInline value class Terminal(val value: ToolResultTerminalContent) : ToolResultContent
    @JvmInline value class Subagent(val value: ToolResultSubagentContent) : ToolResultContent

    /**
     * Forward-compat catch-all for unknown ToolResultContent types.
     *
     * Older clients may receive newer wire variants they don't recognise; capturing
     * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
     */
    @JvmInline value class Unknown(val raw: JsonObject) : ToolResultContent
}

internal object ToolResultContentSerializer : KSerializer<ToolResultContent> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ToolResultContent")

    override fun deserialize(decoder: Decoder): ToolResultContent {
        val input = decoder as? JsonDecoder
            ?: error("ToolResultContent can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ToolResultContent")
        val type = (obj["type"] as? JsonPrimitive)?.contentOrNull
            ?: return ToolResultContent.Unknown(obj)
        return when (type) {
            "text" -> ToolResultContent.Text(input.json.decodeFromJsonElement(ToolResultTextContent.serializer(), element))
            "embeddedResource" -> ToolResultContent.EmbeddedResource(input.json.decodeFromJsonElement(ToolResultEmbeddedResourceContent.serializer(), element))
            "resource" -> ToolResultContent.Resource(input.json.decodeFromJsonElement(ToolResultResourceContent.serializer(), element))
            "fileEdit" -> ToolResultContent.FileEdit(input.json.decodeFromJsonElement(ToolResultFileEditContent.serializer(), element))
            "terminal" -> ToolResultContent.Terminal(input.json.decodeFromJsonElement(ToolResultTerminalContent.serializer(), element))
            "subagent" -> ToolResultContent.Subagent(input.json.decodeFromJsonElement(ToolResultSubagentContent.serializer(), element))
            else -> ToolResultContent.Unknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ToolResultContent) {
        val output = encoder as? JsonEncoder
            ?: error("ToolResultContent can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ToolResultContent.Text -> output.json.encodeToJsonElement(ToolResultTextContent.serializer(), value.value)
            is ToolResultContent.EmbeddedResource -> output.json.encodeToJsonElement(ToolResultEmbeddedResourceContent.serializer(), value.value)
            is ToolResultContent.Resource -> output.json.encodeToJsonElement(ToolResultResourceContent.serializer(), value.value)
            is ToolResultContent.FileEdit -> output.json.encodeToJsonElement(ToolResultFileEditContent.serializer(), value.value)
            is ToolResultContent.Terminal -> output.json.encodeToJsonElement(ToolResultTerminalContent.serializer(), value.value)
            is ToolResultContent.Subagent -> output.json.encodeToJsonElement(ToolResultSubagentContent.serializer(), value.value)
            is ToolResultContent.Unknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

/**
 * The state payload of a snapshot — root, session, terminal, or changeset state.
 */
@Serializable(with = SnapshotStateSerializer::class)
sealed interface SnapshotState {
    @JvmInline value class Root(val value: RootState) : SnapshotState
    @JvmInline value class Session(val value: SessionState) : SnapshotState
    @JvmInline value class Terminal(val value: TerminalState) : SnapshotState
    @JvmInline value class Changeset(val value: ChangesetState) : SnapshotState
}

internal object SnapshotStateSerializer : KSerializer<SnapshotState> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("SnapshotState")

    override fun deserialize(decoder: Decoder): SnapshotState {
        val input = decoder as? JsonDecoder
            ?: error("SnapshotState can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for SnapshotState")
        // Try the most distinctive shape first. SessionState has required
        // `summary`; ChangesetState has required `status` + `files`;
        // TerminalState has `uri` / `size` / `buffer`; RootState is the
        // catch-all.
        return when {
            obj.containsKey("summary") -> SnapshotState.Session(input.json.decodeFromJsonElement(SessionState.serializer(), element))
            obj.containsKey("status") && obj.containsKey("files") ->
                SnapshotState.Changeset(input.json.decodeFromJsonElement(ChangesetState.serializer(), element))
            obj.containsKey("size") || obj.containsKey("uri") || obj.containsKey("buffer") ->
                SnapshotState.Terminal(input.json.decodeFromJsonElement(TerminalState.serializer(), element))
            else -> SnapshotState.Root(input.json.decodeFromJsonElement(RootState.serializer(), element))
        }
    }

    override fun serialize(encoder: Encoder, value: SnapshotState) {
        val output = encoder as? JsonEncoder
            ?: error("SnapshotState can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is SnapshotState.Root -> output.json.encodeToJsonElement(RootState.serializer(), value.value)
            is SnapshotState.Session -> output.json.encodeToJsonElement(SessionState.serializer(), value.value)
            is SnapshotState.Terminal -> output.json.encodeToJsonElement(TerminalState.serializer(), value.value)
            is SnapshotState.Changeset -> output.json.encodeToJsonElement(ChangesetState.serializer(), value.value)
        }
        output.encodeJsonElement(element)
    }
}
