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
value class SessionStatus(val rawValue: UInt) {
    operator fun contains(other: SessionStatus): Boolean =
        (rawValue and other.rawValue) == other.rawValue

    infix fun or(other: SessionStatus): SessionStatus = SessionStatus(rawValue or other.rawValue)
    infix fun and(other: SessionStatus): SessionStatus = SessionStatus(rawValue and other.rawValue)

    companion object {
        /**
         * Session is idle — no turn is active.
         */
        val IDLE: SessionStatus = SessionStatus(1u)
        /**
         * Session ended with an error.
         */
        val ERROR: SessionStatus = SessionStatus(2u)
        /**
         * A turn is actively streaming.
         */
        val IN_PROGRESS: SessionStatus = SessionStatus(8u)
        /**
         * A turn is in progress but blocked waiting for user input or tool confirmation.
         */
        val INPUT_NEEDED: SessionStatus = SessionStatus(24u)
        /**
         * The client has viewed this session since its last modification.
         */
        val IS_READ: SessionStatus = SessionStatus(32u)
        /**
         * The session has been archived by the client.
         */
        val IS_ARCHIVED: SessionStatus = SessionStatus(64u)
    }
}

internal object SessionStatusSerializer : KSerializer<SessionStatus> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("SessionStatus", PrimitiveKind.LONG)
    override fun serialize(encoder: Encoder, value: SessionStatus) {
        encoder.encodeLong(value.rawValue.toLong())
    }
    override fun deserialize(decoder: Decoder): SessionStatus =
        SessionStatus(decoder.decodeLong().toUInt())
}

/**
 * Discriminant for {@link ChatOrigin} — how a chat came into existence.
 */
@Serializable
enum class ChatOriginKind {
    /**
     * User created the chat explicitly (e.g. via the host UI).
     */
    @SerialName("user")
    USER,
    /**
     * Forked from an existing chat at a specific turn.
     */
    @SerialName("fork")
    FORK,
    /**
     * Spawned by a tool call running in another chat (e.g. a sub-agent delegation).
     */
    @SerialName("tool")
    TOOL
}

/**
 * How a user can interact with a chat.
 *
 * - `Full` — user can send messages and watch (default when absent)
 * - `ReadOnly` — user can watch but not send messages (e.g. agent team workers)
 * - `Hidden` — internal worker not shown in UI at all
 *
 * Supports the agent-team pattern where a lead chat is fully interactive and
 * worker chats are read-only (visible for observability) or hidden (internal
 * implementation detail). The harness sets this based on the chat's role;
 * the UI uses it to show appropriate controls.
 */
@Serializable
enum class ChatInteractivity {
    /**
     * User can send messages and watch (default when absent)
     */
    @SerialName("full")
    FULL,
    /**
     * User can watch but not send messages
     */
    @SerialName("read-only")
    READ_ONLY,
    /**
     * Internal worker not shown in UI at all
     */
    @SerialName("hidden")
    HIDDEN
}

/**
 * Answer lifecycle state.
 */
@Serializable
enum class ChatInputAnswerState {
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
enum class ChatInputAnswerValueKind {
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
enum class ChatInputQuestionKind {
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
enum class ChatInputResponseKind {
    @SerialName("accept")
    ACCEPT,
    @SerialName("decline")
    DECLINE,
    @SerialName("cancel")
    CANCEL
}

/**
 * Discriminant for the kinds of outstanding input a session can surface in
 * {@link SessionState.inputNeeded}.
 *
 * This is a general/typological union (not a lifecycle), so the discriminant is
 * a `*Kind`.
 */
@Serializable
enum class SessionInputRequestKind {
    /**
     * A user-facing elicitation mirrored from a chat's `inputRequests`.
     */
    @SerialName("chatInput")
    CHAT_INPUT,
    /**
     * A tool call awaiting parameter- or result-confirmation.
     */
    @SerialName("toolConfirmation")
    TOOL_CONFIRMATION,
    /**
     * A running tool the session wants an active client to execute.
     */
    @SerialName("toolClientExecution")
    TOOL_CLIENT_EXECUTION
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
 * Discriminant for {@link MessageOrigin} — identifies who produced a message.
 */
@Serializable
enum class MessageKind {
    /**
     * Sent directly by the user.
     */
    @SerialName("user")
    USER,
    /**
     * Produced by the agent itself rather than the user — for example, an agent
     * that seeds the first message of a chat it spawned.
     */
    @SerialName("agent")
    AGENT,
    /**
     * Produced by a tool rather than the user — for example, a tool that spawns a
     * worker chat whose first message carries a seed prompt.
     */
    @SerialName("tool")
    TOOL,
    /**
     * A system-generated notification rather than a direct user message.
     */
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
    RESOURCE,
    /**
     * An attachment that references annotations on an annotations channel.
     */
    @SerialName("annotations")
    ANNOTATIONS
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
    SYSTEM_NOTIFICATION,
    @SerialName("inputRequest")
    INPUT_REQUEST
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

@Serializable
enum class ToolCallContributorKind {
    @SerialName("client")
    CLIENT,
    @SerialName("mcp")
    MCP
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
    @SerialName("terminalComplete")
    TERMINAL_COMPLETE,
    @SerialName("subagent")
    SUBAGENT
}

/**
 * Discriminant for the kind of customization.
 *
 * Top-level entries in {@link SessionState.customizations} and
 * {@link AgentInfo.customizations} are either container customizations
 * ({@link CustomizationType.Plugin | `Plugin`} or
 * {@link CustomizationType.Directory | `Directory`}) or
 * {@link CustomizationType.McpServer | `McpServer`} entries surfaced
 * directly by the host. The remaining types appear only as children of
 * a container.
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
 * Discriminant for the {@link McpServerState} union.
 */
@Serializable
enum class McpServerStatus {
    /**
     * Server has been registered but is not yet running.
     */
    @SerialName("starting")
    STARTING,
    /**
     * Server is running and serving requests.
     */
    @SerialName("ready")
    READY,
    /**
     * Server is reachable but requires additional authentication before it
     * can start, or before it can serve a particular request. Carries the
     * RFC 9728 Protected Resource Metadata the client needs to obtain a
     * token; the client then pushes the token via the existing
     * `authenticate` command.
     */
    @SerialName("authRequired")
    AUTH_REQUIRED,
    /**
     * Server failed to start, crashed, or otherwise transitioned to a fatal error.
     */
    @SerialName("error")
    ERROR,
    /**
     * Server has been shut down.
     */
    @SerialName("stopped")
    STOPPED
}

/**
 * Why an MCP server is currently in the {@link McpServerStatus.AuthRequired}
 * state. Mirrors the three failure modes defined by the
 * [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.md).
 */
@Serializable
enum class McpAuthRequiredReason {
    /**
     * No token has been provided yet (HTTP 401, no prior token).
     */
    @SerialName("required")
    REQUIRED,
    /**
     * A previously valid token expired or was revoked (HTTP 401).
     */
    @SerialName("expired")
    EXPIRED,
    /**
     * Step-up auth: a token is present but its scopes are insufficient for
     * the requested operation (HTTP 403 with
     * `WWW-Authenticate: Bearer error="insufficient_scope"`).
     *
     * Unlike {@link Required} and {@link Expired} — which typically surface
     * before any tool work is in flight — `InsufficientScope` is almost
     * always triggered by an MCP request issued mid-turn (a `tools/call`,
     * `resources/read`, etc.). The host SHOULD pair the
     * {@link McpServerAuthRequiredState} transition with
     * {@link SessionStatus.InputNeeded} on
     * {@link SessionSummary.status | the session} so the activity becomes
     * visible at the session-summary level, and clients SHOULD watch for
     * this kind on any
     * {@link McpServerCustomization | MCP server} backing a running tool
     * call so they can present an explicit "grant more access" affordance
     * tied to the blocked tool call.
     */
    @SerialName("insufficientScope")
    INSUFFICIENT_SCOPE
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
    ERROR,
    /**
     * The operation is currently disabled and cannot be invoked.
     */
    @SerialName("disabled")
    DISABLED
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
    val config: RootConfigState? = null,
    /**
     * Additional implementation-defined metadata about the agent host itself.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
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
     * Either container customizations —
     * {@link PluginCustomization | `PluginCustomization`} entries the agent
     * bundles, plus {@link DirectoryCustomization | `DirectoryCustomization`}
     * entries it watches in any workspace it's used with — or top-level
     * {@link McpServerCustomization | `McpServerCustomization`} entries
     * the agent host declares directly. When a session is created with
     * this agent, these entries are augmented (e.g. directory URIs are
     * resolved against the workspace, children are parsed) and propagated
     * into the session's `customizations` list.
     */
    val customizations: List<Customization>? = null,
    /**
     * Static capabilities the agent advertises about itself. Clients use these
     * to gate features (multi-chat, fork) instead of switching on the provider
     * id.
     */
    val capabilities: AgentCapabilities? = null
)

@Serializable
data class AgentCapabilities(
    /**
     * The agent can host more than one concurrent chat per session. When absent,
     * clients MUST NOT call `createChat` to open chats beyond the default one the
     * session starts with. An empty object `{}` advertises multi-chat without
     * forking; set {@link MultipleChatsCapability.fork} to also allow forking.
     */
    val multipleChats: MultipleChatsCapability? = null
)

@Serializable
data class MultipleChatsCapability(
    /**
     * The agent can fork a chat from a specific turn. When absent or `false`,
     * clients MUST NOT pass a {@link ChatForkSource} (`source`) to `createChat`.
     * Forking always implies multi-chat support.
     */
    val fork: Boolean? = null
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
     * Maximum number of output tokens the model can generate
     */
    val maxOutputTokens: Long? = null,
    /**
     * Maximum number of prompt (input) tokens the model accepts
     */
    val maxPromptTokens: Long? = null,
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
     * Model-specific configuration values. Values are JSON primitives: most
     * pickers produce strings, but some (e.g. a numeric context-size picker)
     * produce numbers or booleans, which are carried through as-is.
     */
    val config: Map<String, JsonElement>? = null
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
    val additionalProperties: ConfigPropertySchema? = null
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
data class ChatState(
    /**
     * Chat URI
     */
    val resource: String,
    /**
     * Chat title
     */
    val title: String,
    /**
     * Current chat status (reuses SessionStatus shape)
     */
    val status: SessionStatus,
    /**
     * Human-readable description of what the chat is currently doing
     */
    val activity: String? = null,
    /**
     * Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
     */
    val modifiedAt: String,
    /**
     * How this chat came into existence
     */
    val origin: ChatOrigin? = null,
    /**
     * How the user can interact with this chat. See {@link ChatInteractivity}.
     *
     * Supports agent-team patterns where worker chats are read-only or hidden.
     * Absence defaults to {@link ChatInteractivity.Full} for backward
     * compatibility.
     */
    val interactivity: ChatInteractivity? = null,
    /**
     * Optional per-chat working directory.
     *
     * If absent, the chat inherits
     * {@link SessionState.workingDirectory | the session's working directory}.
     * Hosts MAY override this for individual chats — for example, to give a
     * subordinate chat its own git worktree so multiple chats in a session can
     * make independent edits that the orchestrator later merges back.
     */
    val workingDirectory: String? = null,
    /**
     * Completed turns
     */
    val turns: List<Turn>,
    /**
     * Cursor for loading older completed turns into this chat state.
     *
     * Presence means `turns` is a tail window and more historical turns are
     * available. Pass this opaque cursor to `fetchTurns`; the host MUST insert
     * the loaded turns into state and update or clear this cursor before
     * responding. Absence means the state contains all retained turns.
     */
    val turnsNextCursor: String? = null,
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
     * Requests for user input that are currently blocking or informing chat progress
     */
    val inputRequests: List<ChatInputRequest>? = null,
    /**
     * The user's in-progress draft input for this chat — the message they are
     * composing but have not sent yet, including its
     * {@link Message.model | model} / {@link Message.agent | agent} selection
     * and attachments.
     *
     * Clients MAY periodically sync their local input state into this field so
     * a draft survives reloads and is visible to other clients viewing the same
     * chat. Eager syncing is **not** required — clients SHOULD debounce and MAY
     * sync only at convenient points. When presenting input UI for an existing
     * chat, clients SHOULD use any `draft` to initialize their input state.
     * Cleared (set to `undefined`) once the message is sent.
     */
    val draft: Message? = null,
    /**
     * Additional provider-specific metadata for this chat.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatSummary(
    /**
     * Chat URI
     */
    val resource: String,
    /**
     * Chat title
     */
    val title: String,
    /**
     * Current chat status (reuses SessionStatus shape)
     */
    val status: SessionStatus,
    /**
     * Human-readable description of what the chat is currently doing
     */
    val activity: String? = null,
    /**
     * Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
     */
    val modifiedAt: String,
    /**
     * How this chat came into existence
     */
    val origin: ChatOrigin? = null,
    /**
     * How the user can interact with this chat. See {@link ChatInteractivity}.
     *
     * Supports agent-team patterns where worker chats are read-only or hidden.
     * Absence defaults to {@link ChatInteractivity.Full} for backward
     * compatibility.
     */
    val interactivity: ChatInteractivity? = null,
    /**
     * Optional per-chat working directory.
     *
     * If absent, the chat inherits
     * {@link SessionSummary.workingDirectory | the session's working directory}.
     * See {@link ChatState.workingDirectory} for usage notes.
     */
    val workingDirectory: String? = null
)

@Serializable
data class SessionState(
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
     * Server-owned project for this session
     */
    val project: ProjectInfo? = null,
    /**
     * The default working directory URI for this session. Individual chats
     * MAY override via {@link ChatSummary.workingDirectory | their own
     * `workingDirectory`}; this field acts as the fallback for any chat that
     * does not.
     */
    val workingDirectory: String? = null,
    /**
     * Lightweight summary of this session's inline annotations channel
     * (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
     * annotation / entry counts without subscribing. Absent when the session
     * does not expose an annotations channel.
     */
    val annotations: AnnotationsSummary? = null,
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
     * The clients currently providing tools and interactive capabilities to this
     * session. If multiple tools or customizations are provided by the same
     * active client, an agent host MAY deduplicate them when exposed to a model,
     * with a preference given to the client that started the turn.
     *
     * Membership is host-managed: clients add (or refresh) themselves with
     * `session/activeClientSet`, and the host removes them with
     * `session/activeClientRemoved` when they unsubscribe, disconnect without
     * reconnecting in time, or reconnect without resubscribing to the session.
     */
    val activeClients: List<SessionActiveClient>,
    /**
     * Catalog of chats in this session.
     */
    val chats: List<ChatSummary>,
    /**
     * The chat that receives input when the user addresses the session without
     * selecting a specific chat. This is a UI routing hint, not a hierarchy
     * marker — chats remain equal peers at the protocol level. Hosts MAY change
     * this over the session's lifetime.
     */
    val defaultChat: String? = null,
    /**
     * Session configuration schema and current values
     */
    val config: SessionConfigState? = null,
    /**
     * Top-level customizations active in this session.
     *
     * Always one of the {@link Customization} variants:
     *
     * - Container customizations ({@link PluginCustomization},
     * {@link DirectoryCustomization}) whose children — agents, skills,
     * prompts, rules, hooks, MCP servers — live in each container's
     * {@link ContainerCustomizationBase.children | `children`} array.
     * - Top-level {@link McpServerCustomization} entries the host
     * surfaces directly (for example a globally-configured MCP server
     * that isn't bundled in a plugin or directory). MCP servers may
     * also appear as children of a container.
     *
     * Client-published plugins arrive via
     * {@link SessionActiveClient.customizations | `activeClients[].customizations`}
     * and the host propagates them into this list (typically with the
     * container's `clientId` set and `children` populated). Clients
     * publish in container shape only; bare MCP servers at the top level
     * are server-originated.
     */
    val customizations: List<Customization>? = null,
    /**
     * Catalogue of changesets the server can produce for this session. Each
     * entry advertises a subscribable view of file changes (uncommitted,
     * session-wide, per-turn, etc.) and the URI template the client expands
     * before subscribing. See {@link Changeset} for the full shape and
     * {@link /guide/changesets | Changesets} for an overview of the model.
     */
    val changesets: List<Changeset>? = null,
    /**
     * Outstanding input the session is blocked on, aggregated across every chat
     * so a client can discover and answer it from the session channel alone,
     * without subscribing to individual chats.
     *
     * Each entry is self-sufficient: it carries the owning chat's URI plus every
     * identifier the client needs to respond. A client answers by dispatching the
     * ordinary `chat/​*` action to that chat's channel — see
     * {@link SessionInputRequest} for the per-variant response path. A present,
     * non-empty list implies {@link SessionStatus.InputNeeded} on
     * {@link SessionSummary.status}.
     *
     * Host-managed: the host upserts entries with `session/inputNeededSet` as
     * chats raise requests and removes them with `session/inputNeededRemoved`
     * once the underlying request resolves.
     */
    val inputNeeded: List<SessionInputRequest>? = null,
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
data class SessionChatInputRequest(
    /**
     * Stable key for this entry, unique within the session's
     * {@link SessionState.inputNeeded} list. The host derives it however it likes
     * (for example from the chat URI plus the underlying request or tool-call
     * id); consumers MUST treat it as opaque. It is the key for the
     * `session/inputNeededSet` / `session/inputNeededRemoved` upsert convention.
     */
    val id: String,
    /**
     * The chat the underlying request lives in. This is the channel a client
     * dispatches its response to — it does not need to have subscribed to that
     * chat first.
     */
    val chat: String,
    val kind: SessionInputRequestKind,
    /**
     * The mirrored chat input request.
     */
    val request: ChatInputRequest
)

@Serializable
data class SessionToolConfirmationRequest(
    /**
     * Stable key for this entry, unique within the session's
     * {@link SessionState.inputNeeded} list. The host derives it however it likes
     * (for example from the chat URI plus the underlying request or tool-call
     * id); consumers MUST treat it as opaque. It is the key for the
     * `session/inputNeededSet` / `session/inputNeededRemoved` upsert convention.
     */
    val id: String,
    /**
     * The chat the underlying request lives in. This is the channel a client
     * dispatches its response to — it does not need to have subscribed to that
     * chat first.
     */
    val chat: String,
    val kind: SessionInputRequestKind,
    /**
     * The turn the tool call belongs to.
     */
    val turnId: String,
    /**
     * The tool call awaiting confirmation.
     */
    val toolCall: ToolCallConfirmationState
)

@Serializable
data class SessionToolClientExecutionRequest(
    /**
     * Stable key for this entry, unique within the session's
     * {@link SessionState.inputNeeded} list. The host derives it however it likes
     * (for example from the chat URI plus the underlying request or tool-call
     * id); consumers MUST treat it as opaque. It is the key for the
     * `session/inputNeededSet` / `session/inputNeededRemoved` upsert convention.
     */
    val id: String,
    /**
     * The chat the underlying request lives in. This is the channel a client
     * dispatches its response to — it does not need to have subscribed to that
     * chat first.
     */
    val chat: String,
    val kind: SessionInputRequestKind,
    /**
     * The turn the tool call belongs to.
     */
    val turnId: String,
    /**
     * The `clientId` expected to execute the tool. Matches the `clientId` of the
     * tool call's client {@link ToolCallContributor}.
     */
    val clientId: String,
    /**
     * The running tool call the session wants the owning client to execute. The
     * host only ever populates this with a {@link ToolCallRunningState} (i.e. a
     * {@link ToolCallState} in `running` status).
     */
    val toolCall: ToolCallState
)

@Serializable
data class SessionSummary(
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
     * Server-owned project for this session
     */
    val project: ProjectInfo? = null,
    /**
     * The default working directory URI for this session. Individual chats
     * MAY override via {@link ChatSummary.workingDirectory | their own
     * `workingDirectory`}; this field acts as the fallback for any chat that
     * does not.
     */
    val workingDirectory: String? = null,
    /**
     * Lightweight summary of this session's inline annotations channel
     * (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
     * annotation / entry counts without subscribing. Absent when the session
     * does not expose an annotations channel.
     */
    val annotations: AnnotationsSummary? = null,
    /**
     * Session URI
     */
    val resource: String,
    /**
     * Creation timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
     */
    val createdAt: String,
    /**
     * Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
     */
    val modifiedAt: String,
    /**
     * Aggregate summary of file changes associated with this session. Servers
     * may populate this to give clients a quick at-a-glance view of the
     * session's footprint (e.g., for list rendering) without requiring the
     * client to subscribe to a changeset.
     */
    val changes: ChangesSummary? = null,
    /**
     * Lightweight server-defined metadata clients may use for the session
     * presentation. The protocol does not interpret these values; producers
     * SHOULD keep the payload small because summaries appear in session lists
     * and session notifications.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChangesSummary(
    /**
     * Total number of inserted lines across all changed files.
     */
    val additions: Long? = null,
    /**
     * Total number of deleted lines across all changed files.
     */
    val deletions: Long? = null,
    /**
     * Number of files that have changes.
     */
    val files: Long? = null
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
    val origin: MessageOrigin,
    /**
     * File/selection attachments
     */
    val attachments: List<MessageAttachment>? = null,
    /**
     * The model this message was, or will be, sent with.
     *
     * For historic user/agent messages this records the model actually used, so
     * a client editing or resending the message can retain that selection. For a
     * {@link ChatState.draft | draft} it carries the model the user picked for
     * the message they are composing. Absent means the agent host's default
     * model applies.
     */
    val model: ModelSelection? = null,
    /**
     * The custom agent this message was, or will be, sent with.
     *
     * For historic messages this records the agent actually used; for a
     * {@link ChatState.draft | draft} it carries the agent the user picked.
     * Absent means no custom agent — the provider's default behavior applies.
     */
    val agent: AgentSelection? = null,
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
data class MessageOrigin(
    /**
     * The kind of actor that produced the message.
     */
    val kind: MessageKind
)

@Serializable
data class ChatInputOption(
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
data class ChatInputTextAnswerValue(
    val kind: ChatInputAnswerValueKind,
    val value: String
)

@Serializable
data class ChatInputNumberAnswerValue(
    val kind: ChatInputAnswerValueKind,
    val value: Double
)

@Serializable
data class ChatInputBooleanAnswerValue(
    val kind: ChatInputAnswerValueKind,
    val value: Boolean
)

@Serializable
data class ChatInputSelectedAnswerValue(
    val kind: ChatInputAnswerValueKind,
    val value: String,
    /**
     * Free-form text entered instead of selecting an option
     */
    val freeformValues: List<String>? = null
)

@Serializable
data class ChatInputSelectedManyAnswerValue(
    val kind: ChatInputAnswerValueKind,
    val value: List<String>,
    /**
     * Free-form text entered in addition to selected options
     */
    val freeformValues: List<String>? = null
)

@Serializable
data class ChatInputAnswered(
    /**
     * Answer state
     */
    val state: ChatInputAnswerState,
    /**
     * Answer value
     */
    val value: ChatInputAnswerValue
)

@Serializable
data class ChatInputSkipped(
    /**
     * Answer state
     */
    val state: ChatInputAnswerState,
    /**
     * Free-form reason or value captured while skipping, if any
     */
    val freeformValues: List<String>? = null
)

@Serializable
data class ChatInputTextQuestion(
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
    val kind: ChatInputQuestionKind,
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
data class ChatInputNumberQuestion(
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
    val kind: ChatInputQuestionKind,
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
data class ChatInputBooleanQuestion(
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
    val kind: ChatInputQuestionKind,
    /**
     * Default boolean value
     */
    val defaultValue: Boolean? = null
)

@Serializable
data class ChatInputSingleSelectQuestion(
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
    val kind: ChatInputQuestionKind,
    /**
     * Options the user may select from
     */
    val options: List<ChatInputOption>,
    /**
     * Whether the user may enter text instead of selecting an option
     */
    val allowFreeformInput: Boolean? = null
)

@Serializable
data class ChatInputMultiSelectQuestion(
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
    val kind: ChatInputQuestionKind,
    /**
     * Options the user may select from
     */
    val options: List<ChatInputOption>,
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
data class ChatInputRequest(
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
    val questions: List<ChatInputQuestion>? = null,
    /**
     * Current draft or submitted answers, keyed by question ID
     */
    val answers: Map<String, ChatInputAnswer>? = null
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
     * Content nonce
     */
    val nonce: String? = null,
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
data class MessageAnnotationsAttachment(
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
     * The annotations channel URI (typically `ahp-session:/<uuid>/annotations`).
     * Matches {@link AnnotationsSummary.resource}.
     */
    val resource: String,
    /**
     * Specific {@link Annotation.id | annotation ids} to reference. When
     * omitted, the attachment references all annotations on the channel.
     */
    val annotationIds: List<String>? = null
)

@Serializable
data class MarkdownResponsePart(
    /**
     * Discriminant
     */
    val kind: ResponsePartKind,
    /**
     * Part identifier, used by `chat/delta` to target this part for content appends
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
    val contentType: String? = null,
    /**
     * Content nonce
     */
    val nonce: String? = null
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
     * Content nonce
     */
    val nonce: String? = null,
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
     * Part identifier, used by `chat/reasoning` to target this part for content appends
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
    val content: StringOrMarkdown,
    /**
     * Additional provider-specific metadata for this notification.
     *
     * A host MAY attach a machine-readable descriptor of what triggered the
     * notification so clients can categorize, icon, group, filter, or localize
     * it without parsing `content`. Clients MAY look for well-known keys here to
     * provide enhanced UI, and MUST render coherently from `content` alone when
     * `_meta` is absent or unrecognized.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class InputRequestResponsePart(
    /**
     * Discriminant
     */
    val kind: ResponsePartKind,
    /**
     * The resolved request, carrying its `id`, `message`, `url`, `questions`,
     * and the final `answers` synced/submitted at completion.
     */
    val request: ChatInputRequest,
    /**
     * How the request was resolved: `accept`, `decline`, or `cancel`.
     */
    val response: ChatInputResponseKind
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
     * Human-readable description of what the tool invocation intends to do
     */
    val intention: String? = null,
    /**
     * Reference to the contributor of the tool being called.
     */
    val contributor: ToolCallContributor? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
     * `McpUiToolMeta` found in MCP tool calls, which may be used in combination
     * with the {@link contributor} to serve MCP Apps.
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
     * Human-readable description of what the tool invocation intends to do
     */
    val intention: String? = null,
    /**
     * Reference to the contributor of the tool being called.
     */
    val contributor: ToolCallContributor? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
     * `McpUiToolMeta` found in MCP tool calls, which may be used in combination
     * with the {@link contributor} to serve MCP Apps.
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
     * Human-readable description of what the tool invocation intends to do
     */
    val intention: String? = null,
    /**
     * Reference to the contributor of the tool being called.
     */
    val contributor: ToolCallContributor? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
     * `McpUiToolMeta` found in MCP tool calls, which may be used in combination
     * with the {@link contributor} to serve MCP Apps.
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
     * Human-readable description of what the tool invocation intends to do
     */
    val intention: String? = null,
    /**
     * Reference to the contributor of the tool being called.
     */
    val contributor: ToolCallContributor? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
     * `McpUiToolMeta` found in MCP tool calls, which may be used in combination
     * with the {@link contributor} to serve MCP Apps.
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
     * Human-readable description of what the tool invocation intends to do
     */
    val intention: String? = null,
    /**
     * Reference to the contributor of the tool being called.
     */
    val contributor: ToolCallContributor? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
     * `McpUiToolMeta` found in MCP tool calls, which may be used in combination
     * with the {@link contributor} to serve MCP Apps.
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
     * Human-readable description of what the tool invocation intends to do
     */
    val intention: String? = null,
    /**
     * Reference to the contributor of the tool being called.
     */
    val contributor: ToolCallContributor? = null,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
     * `McpUiToolMeta` found in MCP tool calls, which may be used in combination
     * with the {@link contributor} to serve MCP Apps.
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
    /**
     * Content nonce
     */
    val nonce: String? = null,
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
data class ToolResultTerminalCompleteContent(
    val type: ToolResultContentType,
    /**
     * URI of the `ahp-terminal:` channel that carried live output for this
     * command, if one was exposed.
     */
    val resource: String? = null,
    /**
     * Exit code from the completed command, if reported by the runtime
     */
    val exitCode: Long? = null,
    /**
     * Working directory where the command was executed
     */
    val cwd: String? = null,
    /**
     * Preview of the command's output, if available
     */
    val preview: String? = null,
    /**
     * Whether `preview` is known to be incomplete or truncated
     */
    val truncated: Boolean? = null
)

@Serializable
data class ToolResultSubagentContent(
    val type: ToolResultContentType,
    /**
     * Worker chat URI (subscribable for full chat state)
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
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Version of the plugin, sourced from the
     * [Open Plugins](https://open-plugins.com/) manifest's optional
     * `version` field (semver, e.g. `"1.2.0"`). Absent when the manifest
     * declares no version — the field is optional there — or the source
     * has no version concept. Provenance / display only: the host neither
     * parses nor enforces it.
     */
    val version: String? = null
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
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
     * Version of the plugin, sourced from the
     * [Open Plugins](https://open-plugins.com/) manifest's optional
     * `version` field (semver, e.g. `"1.2.0"`). Absent when the manifest
     * declares no version — the field is optional there — or the source
     * has no version concept. Provenance / display only: the host neither
     * parses nor enforces it.
     */
    val version: String? = null,
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
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
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
    /**
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Whether this child is individually enabled. Absent means enabled, so a
     * producer only needs to set it to surface a child that exists but is
     * turned off on its own.
     *
     * This flag is independent of the parent container's: the **effective**
     * enabled state of a child is
     * `container.enabled && (child.enabled ?? true)`, so a disabled container
     * disables every child regardless of each child's own flag.
     *
     * A child is turned on or off by id with
     * {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
     */
    val enabled: Boolean? = null,
    val type: CustomizationType,
    /**
     * Short description of what the agent specializes in and when to
     * invoke it. Sourced from the agent file's frontmatter `description`.
     */
    val description: String? = null,
    /**
     * Model the agent is pinned to, sourced from the agent file's
     * frontmatter `model`. Absent means the agent inherits the session's
     * default model.
     */
    val model: String? = null,
    /**
     * Allowlist of tool names the agent is scoped to, sourced from the
     * agent file's frontmatter `tools`. A non-empty list restricts the
     * agent to exactly those tools. Absent — or an empty list — imposes no
     * restriction beyond the session default: the agent may use any
     * available tool. Producers express "no restriction" by omitting the
     * field rather than sending an empty array, so an empty list carries no
     * meaning distinct from absence.
     */
    val tools: List<String>? = null,
    /**
     * When `true`, the agent will not auto-delegate to this custom agent
     * as a sub-agent; it can only be selected by the user. Absent or
     * `false` means the agent may delegate to it.
     */
    val disableModelInvocation: Boolean? = null,
    /**
     * When `true`, the user cannot select this custom agent (for example,
     * in a picker); it remains available for the agent to auto-delegate
     * to. Absent or `false` means the user may select it.
     */
    val disableUserInvocation: Boolean? = null
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
    /**
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Whether this child is individually enabled. Absent means enabled, so a
     * producer only needs to set it to surface a child that exists but is
     * turned off on its own.
     *
     * This flag is independent of the parent container's: the **effective**
     * enabled state of a child is
     * `container.enabled && (child.enabled ?? true)`, so a disabled container
     * disables every child regardless of each child's own flag.
     *
     * A child is turned on or off by id with
     * {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
     */
    val enabled: Boolean? = null,
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
    val disableModelInvocation: Boolean? = null,
    /**
     * When `true`, the user cannot directly invoke this skill (for example,
     * as a slash command); it remains available for the agent to
     * auto-invoke. Absent or `false` means the user may invoke it.
     */
    val disableUserInvocation: Boolean? = null
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
    /**
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Whether this child is individually enabled. Absent means enabled, so a
     * producer only needs to set it to surface a child that exists but is
     * turned off on its own.
     *
     * This flag is independent of the parent container's: the **effective**
     * enabled state of a child is
     * `container.enabled && (child.enabled ?? true)`, so a disabled container
     * disables every child regardless of each child's own flag.
     *
     * A child is turned on or off by id with
     * {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
     */
    val enabled: Boolean? = null,
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
    /**
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Whether this child is individually enabled. Absent means enabled, so a
     * producer only needs to set it to surface a child that exists but is
     * turned off on its own.
     *
     * This flag is independent of the parent container's: the **effective**
     * enabled state of a child is
     * `container.enabled && (child.enabled ?? true)`, so a disabled container
     * disables every child regardless of each child's own flag.
     *
     * A child is turned on or off by id with
     * {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
     */
    val enabled: Boolean? = null,
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
    /**
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    /**
     * Whether this child is individually enabled. Absent means enabled, so a
     * producer only needs to set it to surface a child that exists but is
     * turned off on its own.
     *
     * This flag is independent of the parent container's: the **effective**
     * enabled state of a child is
     * `container.enabled && (child.enabled ?? true)`, so a disabled container
     * disables every child regardless of each child's own flag.
     *
     * A child is turned on or off by id with
     * {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
     */
    val enabled: Boolean? = null,
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
    /**
     * Additional provider-specific metadata for this customization.
     *
     * Mirrors the MCP `_meta` convention. Optional and opaque to the
     * protocol; producers and consumers agree on its contents
     * out-of-band.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val type: CustomizationType,
    /**
     * Whether this MCP server is currently enabled.
     */
    val enabled: Boolean,
    /**
     * Current lifecycle state of the MCP server.
     */
    val state: McpServerState,
    /**
     * An `mcp://`-protocol channel the client uses to side-channel traffic
     * into the upstream MCP server itself. The channel is NOT a fresh raw MCP
     * connection: it piggybacks on the AHP transport
     * and skips the MCP `initialize` sequence.
     *
     * The agent host MAY only serve a subset of MCP on this
     * channel; the served subset is described by domain-specific
     * capabilities such as those in
     * {@link McpServerCustomizationApps.capabilities}.
     *
     * The channel URI SHOULD be stable across the server's lifetime, but
     * the agent host MAY change it (for example across a restart) and
     * MAY only expose it while the server is in
     * {@link McpServerStatus.Ready | `Ready`}. Absence means no
     * side-channel is currently available.
     */
    val channel: String? = null,
    /**
     * MCP App support. This property SHOULD be advertised for MCP servers
     * which support apps.
     */
    val mcpApp: McpServerCustomizationApps? = null
)

@Serializable
data class McpServerCustomizationApps(
    /**
     * The subset of MCP App
     * [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
     * the AHP host can satisfy for Views backed by this server. The
     * client feeds these straight through into the `hostCapabilities` of
     * the `ui/initialize` response delivered to the View.
     */
    val capabilities: AhpMcpUiHostCapabilities
)

@Serializable
data class AhpMcpUiHostCapabilities(
    /**
     * Producer proxies the MCP `tools/​*` methods to the upstream server.
     */
    val serverTools: JsonElement? = null,
    /**
     * Producer proxies the MCP `resources/​*` methods to the upstream server.
     */
    val serverResources: JsonElement? = null,
    /**
     * Producer accepts `notifications/message` log entries from the App via `mcpNotification`.
     */
    val logging: Map<String, JsonElement>? = null,
    /**
     * Producer serves `sampling/createMessage` via `mcpMethodCall`.
     */
    val sampling: JsonElement? = null
)

@Serializable
data class McpServerStartingState(
    val kind: McpServerStatus
)

@Serializable
data class McpServerReadyState(
    val kind: McpServerStatus
)

@Serializable
data class McpServerAuthRequiredState(
    val kind: McpServerStatus,
    /**
     * Why authentication is required.
     */
    val reason: McpAuthRequiredReason,
    /**
     * RFC 9728 Protected Resource Metadata. The `resource` field is the
     * canonical MCP server URI per RFC 8707, used as the OAuth `resource`
     * indicator. `authorization_servers` is REQUIRED by the MCP
     * authorization spec.
     */
    val resource: ProtectedResourceMetadata,
    /**
     * Scopes required for the current challenge, parsed from the
     * `WWW-Authenticate: Bearer scope="…"` header (or `scopes_supported`
     * fallback). Authoritative for the next authorization request — clients
     * MUST NOT assume any subset/superset relationship to
     * `resource.scopes_supported`.
     */
    val requiredScopes: List<String>? = null,
    /**
     * Human-readable hint, typically from the OAuth `error_description`.
     */
    val description: String? = null
)

@Serializable
data class McpServerErrorState(
    val kind: McpServerStatus,
    /**
     * Error details.
     */
    val error: ErrorInfo
)

@Serializable
data class McpServerStoppedState(
    val kind: McpServerStatus
)

@Serializable
data class ToolCallClientContributor(
    val kind: ToolCallContributorKind,
    /**
     * If this tool is provided by a client, the `clientId` of the owning client.
     * Absent for server-side tools.
     *
     * When set, the identified client is responsible for executing the tool and
     * dispatching `chat/toolCallComplete` with the result.
     */
    val clientId: String
)

@Serializable
data class ToolCallMcpContributor(
    val kind: ToolCallContributorKind,
    /**
     * Customization ID of the corresponding MCP server in {@link SessionState.customizations}.
     */
    val customizationId: String
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
    val stack: String? = null,
    /**
     * Additional provider-specific metadata for this error.
     * Clients MAY look for well-known optional keys here to provide enhanced UI
     * (e.g. a structured chat fetch error for richer, localized messaging).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class Snapshot(
    /**
     * The subscribed channel URI (e.g. `ahp-root://`, `ahp-session:/<uuid>`, or `ahp-chat:/<uuid>`)
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
data class Changeset(
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
     * Advisory hint describing what kind of changeset this is, so clients can
     * group, sort, or render an appropriate icon without parsing
     * {@link uriTemplate}. Recognized values include:
     *
     * - `'session'`: a static, session-wide changeset covering all changes the
     * agent has produced in this session.
     * - `'branch'`: changes relative to a base branch (e.g. a feature branch
     * diffed against `main`).
     * - `'uncommitted'`: the workspace's current uncommitted changes.
     * - `'turn'`: changes produced by a single turn. Typically paired with a
     * `{turnId}` variable in {@link uriTemplate}.
     * - `'compare-turns'`: a diff between two turns. Typically paired with
     * `{originalTurnId}` and `{modifiedTurnId}` variables in
     * {@link uriTemplate}.
     *
     * Implementations MAY provide additional values; clients SHOULD fall back
     * to a reasonable default when an unknown value is encountered.
     */
    val changeKind: String
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
     * Whether the user has reviewed this file. Omit (or set to `undefined`)
     * to indicate that the server does not support the "review" functionality;
     * in that case clients should not surface any reviewed/unreviewed
     * affordance for this file.
     */
    val reviewed: Boolean? = null,
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
     * Optional group identifier, used to group related operations together.
     */
    val group: String? = null,
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
data class AnnotationsSummary(
    /**
     * The subscribable annotations channel URI for the owning session
     * (typically `ahp-session:/<uuid>/annotations`). Surfaced explicitly even
     * though it is derivable from the session URI so badge UI does not need
     * to know the derivation rule.
     */
    val resource: String,
    /**
     * Total number of {@link Annotation} entries in the channel.
     */
    val annotationCount: Long,
    /**
     * Total number of {@link AnnotationEntry} entries across every annotation.
     */
    val entryCount: Long
)

@Serializable
data class AnnotationsState(
    /**
     * Annotations in this channel, keyed by {@link Annotation.id}.
     */
    val annotations: List<Annotation>
)

@Serializable
data class Annotation(
    /**
     * Stable identifier within the annotations channel. Assigned by the client
     * that dispatches the creating {@link AnnotationsSetAction}.
     */
    val id: String,
    /**
     * Turn that produced the file versions this annotation is anchored to.
     * Matches a {@link Turn.id} on the owning session.
     */
    val turnId: String,
    /**
     * The file the annotation is anchored to.
     */
    val resource: String,
    /**
     * Range within {@link resource} the annotation is anchored to. When
     * omitted the annotation is anchored to the entire file.
     */
    val range: TextRange? = null,
    /**
     * Whether the annotation has been resolved. Newly created annotations are
     * always unresolved (`false`); a client marks an annotation resolved (or
     * re-opens it) by dispatching an {@link AnnotationsUpdatedAction} carrying
     * the updated flag (or an {@link AnnotationsSetAction} when replacing the
     * whole annotation).
     */
    val resolved: Boolean,
    /**
     * Entries in this annotation, in dispatch order (oldest first). MUST
     * contain at least one entry.
     */
    val entries: List<AnnotationEntry>,
    /**
     * Producer-defined opaque metadata, surfaced to tooling but not
     * interpreted by the protocol.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class AnnotationEntry(
    /**
     * Stable identifier within the enclosing annotation. Assigned by the client
     * that dispatches the {@link AnnotationsEntrySetAction} (or the enclosing
     * {@link AnnotationsSetAction}) introducing the entry.
     */
    val id: String,
    /**
     * Entry body. A bare `string` is rendered as plain text; pass
     * `{ markdown: "…" }` to opt into Markdown rendering. See
     * {@link StringOrMarkdown}.
     */
    val text: StringOrMarkdown,
    /**
     * Producer-defined opaque metadata, surfaced to tooling but not
     * interpreted by the protocol.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
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

@Serializable(with = ChatOriginSerializer::class)
sealed interface ChatOrigin {
    @JvmInline value class User(val value: ChatOriginUser) : ChatOrigin
    @JvmInline value class Fork(val value: ChatOriginFork) : ChatOrigin
    @JvmInline value class Tool(val value: ChatOriginTool) : ChatOrigin
    @JvmInline value class Unknown(val raw: JsonObject) : ChatOrigin
}

@Serializable
data class ChatOriginUser(
    val kind: ChatOriginKind = ChatOriginKind.USER,
)

@Serializable
data class ChatOriginFork(
    val kind: ChatOriginKind = ChatOriginKind.FORK,
    val chat: String,
    val turnId: String,
)

@Serializable
data class ChatOriginTool(
    val kind: ChatOriginKind = ChatOriginKind.TOOL,
    val chat: String,
    val toolCallId: String,
)

internal object ChatOriginSerializer : KSerializer<ChatOrigin> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ChatOrigin")

    override fun deserialize(decoder: Decoder): ChatOrigin {
        val input = decoder as? JsonDecoder ?: error("ChatOrigin can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject ?: error("Expected JsonObject for ChatOrigin")
        return when ((obj["kind"] as? JsonPrimitive)?.contentOrNull) {
            "user" -> ChatOrigin.User(input.json.decodeFromJsonElement(ChatOriginUser.serializer(), element))
            "fork" -> ChatOrigin.Fork(input.json.decodeFromJsonElement(ChatOriginFork.serializer(), element))
            "tool" -> ChatOrigin.Tool(input.json.decodeFromJsonElement(ChatOriginTool.serializer(), element))
            else -> ChatOrigin.Unknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ChatOrigin) {
        val output = encoder as? JsonEncoder ?: error("ChatOrigin can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChatOrigin.User -> output.json.encodeToJsonElement(ChatOriginUser.serializer(), value.value)
            is ChatOrigin.Fork -> output.json.encodeToJsonElement(ChatOriginFork.serializer(), value.value)
            is ChatOrigin.Tool -> output.json.encodeToJsonElement(ChatOriginTool.serializer(), value.value)
            is ChatOrigin.Unknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

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
@JvmInline
value class ResponsePartInputRequest(val value: InputRequestResponsePart) : ResponsePart
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
            "inputRequest" -> ResponsePartInputRequest(input.json.decodeFromJsonElement(InputRequestResponsePart.serializer(), element))
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
            is ResponsePartInputRequest -> output.json.encodeToJsonElement(InputRequestResponsePart.serializer(), value.value)
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

@Serializable(with = ToolCallConfirmationStateSerializer::class)
sealed interface ToolCallConfirmationState

@JvmInline
value class ToolCallConfirmationStatePendingConfirmation(val value: ToolCallPendingConfirmationState) : ToolCallConfirmationState
@JvmInline
value class ToolCallConfirmationStatePendingResultConfirmation(val value: ToolCallPendingResultConfirmationState) : ToolCallConfirmationState
/**
 * Forward-compat catch-all for unknown ToolCallConfirmationState discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ToolCallConfirmationStateUnknown(val raw: JsonObject) : ToolCallConfirmationState

internal object ToolCallConfirmationStateSerializer : KSerializer<ToolCallConfirmationState> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ToolCallConfirmationState")

    override fun deserialize(decoder: Decoder): ToolCallConfirmationState {
        val input = decoder as? JsonDecoder
            ?: error("ToolCallConfirmationState can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ToolCallConfirmationState")
        val discriminant = (obj["status"] as? JsonPrimitive)?.content
            ?: return ToolCallConfirmationStateUnknown(obj)
        return when (discriminant) {
            "pending-confirmation" -> ToolCallConfirmationStatePendingConfirmation(input.json.decodeFromJsonElement(ToolCallPendingConfirmationState.serializer(), element))
            "pending-result-confirmation" -> ToolCallConfirmationStatePendingResultConfirmation(input.json.decodeFromJsonElement(ToolCallPendingResultConfirmationState.serializer(), element))
            else -> ToolCallConfirmationStateUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ToolCallConfirmationState) {
        val output = encoder as? JsonEncoder
            ?: error("ToolCallConfirmationState can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ToolCallConfirmationStatePendingConfirmation -> output.json.encodeToJsonElement(ToolCallPendingConfirmationState.serializer(), value.value)
            is ToolCallConfirmationStatePendingResultConfirmation -> output.json.encodeToJsonElement(ToolCallPendingResultConfirmationState.serializer(), value.value)
            is ToolCallConfirmationStateUnknown -> value.raw
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

@Serializable(with = ChatInputQuestionSerializer::class)
sealed interface ChatInputQuestion

@JvmInline
value class ChatInputQuestionText(val value: ChatInputTextQuestion) : ChatInputQuestion
@JvmInline
value class ChatInputQuestionNumber(val value: ChatInputNumberQuestion) : ChatInputQuestion
@JvmInline
value class ChatInputQuestionBoolean(val value: ChatInputBooleanQuestion) : ChatInputQuestion
@JvmInline
value class ChatInputQuestionSingleSelect(val value: ChatInputSingleSelectQuestion) : ChatInputQuestion
@JvmInline
value class ChatInputQuestionMultiSelect(val value: ChatInputMultiSelectQuestion) : ChatInputQuestion
/**
 * Forward-compat catch-all for unknown ChatInputQuestion discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ChatInputQuestionUnknown(val raw: JsonObject) : ChatInputQuestion

internal object ChatInputQuestionSerializer : KSerializer<ChatInputQuestion> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ChatInputQuestion")

    override fun deserialize(decoder: Decoder): ChatInputQuestion {
        val input = decoder as? JsonDecoder
            ?: error("ChatInputQuestion can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ChatInputQuestion")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return ChatInputQuestionUnknown(obj)
        return when (discriminant) {
            "text" -> ChatInputQuestionText(input.json.decodeFromJsonElement(ChatInputTextQuestion.serializer(), element))
            "number" -> ChatInputQuestionNumber(input.json.decodeFromJsonElement(ChatInputNumberQuestion.serializer(), element))
            "integer" -> ChatInputQuestionNumber(input.json.decodeFromJsonElement(ChatInputNumberQuestion.serializer(), element))
            "boolean" -> ChatInputQuestionBoolean(input.json.decodeFromJsonElement(ChatInputBooleanQuestion.serializer(), element))
            "single-select" -> ChatInputQuestionSingleSelect(input.json.decodeFromJsonElement(ChatInputSingleSelectQuestion.serializer(), element))
            "multi-select" -> ChatInputQuestionMultiSelect(input.json.decodeFromJsonElement(ChatInputMultiSelectQuestion.serializer(), element))
            else -> ChatInputQuestionUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ChatInputQuestion) {
        val output = encoder as? JsonEncoder
            ?: error("ChatInputQuestion can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChatInputQuestionText -> output.json.encodeToJsonElement(ChatInputTextQuestion.serializer(), value.value)
            is ChatInputQuestionNumber -> output.json.encodeToJsonElement(ChatInputNumberQuestion.serializer(), value.value)
            is ChatInputQuestionBoolean -> output.json.encodeToJsonElement(ChatInputBooleanQuestion.serializer(), value.value)
            is ChatInputQuestionSingleSelect -> output.json.encodeToJsonElement(ChatInputSingleSelectQuestion.serializer(), value.value)
            is ChatInputQuestionMultiSelect -> output.json.encodeToJsonElement(ChatInputMultiSelectQuestion.serializer(), value.value)
            is ChatInputQuestionUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = ChatInputAnswerValueSerializer::class)
sealed interface ChatInputAnswerValue

@JvmInline
value class ChatInputAnswerValueText(val value: ChatInputTextAnswerValue) : ChatInputAnswerValue
@JvmInline
value class ChatInputAnswerValueNumber(val value: ChatInputNumberAnswerValue) : ChatInputAnswerValue
@JvmInline
value class ChatInputAnswerValueBoolean(val value: ChatInputBooleanAnswerValue) : ChatInputAnswerValue
@JvmInline
value class ChatInputAnswerValueSelected(val value: ChatInputSelectedAnswerValue) : ChatInputAnswerValue
@JvmInline
value class ChatInputAnswerValueSelectedMany(val value: ChatInputSelectedManyAnswerValue) : ChatInputAnswerValue
/**
 * Forward-compat catch-all for unknown ChatInputAnswerValue discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ChatInputAnswerValueUnknown(val raw: JsonObject) : ChatInputAnswerValue

internal object ChatInputAnswerValueSerializer : KSerializer<ChatInputAnswerValue> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ChatInputAnswerValue")

    override fun deserialize(decoder: Decoder): ChatInputAnswerValue {
        val input = decoder as? JsonDecoder
            ?: error("ChatInputAnswerValue can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ChatInputAnswerValue")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return ChatInputAnswerValueUnknown(obj)
        return when (discriminant) {
            "text" -> ChatInputAnswerValueText(input.json.decodeFromJsonElement(ChatInputTextAnswerValue.serializer(), element))
            "number" -> ChatInputAnswerValueNumber(input.json.decodeFromJsonElement(ChatInputNumberAnswerValue.serializer(), element))
            "boolean" -> ChatInputAnswerValueBoolean(input.json.decodeFromJsonElement(ChatInputBooleanAnswerValue.serializer(), element))
            "selected" -> ChatInputAnswerValueSelected(input.json.decodeFromJsonElement(ChatInputSelectedAnswerValue.serializer(), element))
            "selected-many" -> ChatInputAnswerValueSelectedMany(input.json.decodeFromJsonElement(ChatInputSelectedManyAnswerValue.serializer(), element))
            else -> ChatInputAnswerValueUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ChatInputAnswerValue) {
        val output = encoder as? JsonEncoder
            ?: error("ChatInputAnswerValue can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChatInputAnswerValueText -> output.json.encodeToJsonElement(ChatInputTextAnswerValue.serializer(), value.value)
            is ChatInputAnswerValueNumber -> output.json.encodeToJsonElement(ChatInputNumberAnswerValue.serializer(), value.value)
            is ChatInputAnswerValueBoolean -> output.json.encodeToJsonElement(ChatInputBooleanAnswerValue.serializer(), value.value)
            is ChatInputAnswerValueSelected -> output.json.encodeToJsonElement(ChatInputSelectedAnswerValue.serializer(), value.value)
            is ChatInputAnswerValueSelectedMany -> output.json.encodeToJsonElement(ChatInputSelectedManyAnswerValue.serializer(), value.value)
            is ChatInputAnswerValueUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = ChatInputAnswerSerializer::class)
sealed interface ChatInputAnswer

@JvmInline
value class ChatInputAnswerDraft(val value: ChatInputAnswered) : ChatInputAnswer
@JvmInline
value class ChatInputAnswerSkipped(val value: ChatInputSkipped) : ChatInputAnswer
/**
 * Forward-compat catch-all for unknown ChatInputAnswer discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ChatInputAnswerUnknown(val raw: JsonObject) : ChatInputAnswer

internal object ChatInputAnswerSerializer : KSerializer<ChatInputAnswer> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ChatInputAnswer")

    override fun deserialize(decoder: Decoder): ChatInputAnswer {
        val input = decoder as? JsonDecoder
            ?: error("ChatInputAnswer can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ChatInputAnswer")
        val discriminant = (obj["state"] as? JsonPrimitive)?.content
            ?: return ChatInputAnswerUnknown(obj)
        return when (discriminant) {
            "draft" -> ChatInputAnswerDraft(input.json.decodeFromJsonElement(ChatInputAnswered.serializer(), element))
            "submitted" -> ChatInputAnswerDraft(input.json.decodeFromJsonElement(ChatInputAnswered.serializer(), element))
            "skipped" -> ChatInputAnswerSkipped(input.json.decodeFromJsonElement(ChatInputSkipped.serializer(), element))
            else -> ChatInputAnswerUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ChatInputAnswer) {
        val output = encoder as? JsonEncoder
            ?: error("ChatInputAnswer can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ChatInputAnswerDraft -> output.json.encodeToJsonElement(ChatInputAnswered.serializer(), value.value)
            is ChatInputAnswerSkipped -> output.json.encodeToJsonElement(ChatInputSkipped.serializer(), value.value)
            is ChatInputAnswerUnknown -> value.raw
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
@JvmInline
value class MessageAttachmentAnnotations(val value: MessageAnnotationsAttachment) : MessageAttachment
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
            "annotations" -> MessageAttachmentAnnotations(input.json.decodeFromJsonElement(MessageAnnotationsAttachment.serializer(), element))
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
            is MessageAttachmentAnnotations -> output.json.encodeToJsonElement(MessageAnnotationsAttachment.serializer(), value.value)
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
@JvmInline
value class CustomizationMcpServer(val value: McpServerCustomization) : Customization
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
            "mcpServer" -> CustomizationMcpServer(input.json.decodeFromJsonElement(McpServerCustomization.serializer(), element))
            else -> CustomizationUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: Customization) {
        val output = encoder as? JsonEncoder
            ?: error("Customization can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is CustomizationPlugin -> output.json.encodeToJsonElement(PluginCustomization.serializer(), value.value)
            is CustomizationDirectory -> output.json.encodeToJsonElement(DirectoryCustomization.serializer(), value.value)
            is CustomizationMcpServer -> output.json.encodeToJsonElement(McpServerCustomization.serializer(), value.value)
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

@Serializable(with = McpServerStateSerializer::class)
sealed interface McpServerState

@JvmInline
value class McpServerStateStarting(val value: McpServerStartingState) : McpServerState
@JvmInline
value class McpServerStateReady(val value: McpServerReadyState) : McpServerState
@JvmInline
value class McpServerStateAuthRequired(val value: McpServerAuthRequiredState) : McpServerState
@JvmInline
value class McpServerStateError(val value: McpServerErrorState) : McpServerState
@JvmInline
value class McpServerStateStopped(val value: McpServerStoppedState) : McpServerState
/**
 * Forward-compat catch-all for unknown McpServerState discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class McpServerStateUnknown(val raw: JsonObject) : McpServerState

internal object McpServerStateSerializer : KSerializer<McpServerState> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("McpServerState")

    override fun deserialize(decoder: Decoder): McpServerState {
        val input = decoder as? JsonDecoder
            ?: error("McpServerState can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for McpServerState")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return McpServerStateUnknown(obj)
        return when (discriminant) {
            "starting" -> McpServerStateStarting(input.json.decodeFromJsonElement(McpServerStartingState.serializer(), element))
            "ready" -> McpServerStateReady(input.json.decodeFromJsonElement(McpServerReadyState.serializer(), element))
            "authRequired" -> McpServerStateAuthRequired(input.json.decodeFromJsonElement(McpServerAuthRequiredState.serializer(), element))
            "error" -> McpServerStateError(input.json.decodeFromJsonElement(McpServerErrorState.serializer(), element))
            "stopped" -> McpServerStateStopped(input.json.decodeFromJsonElement(McpServerStoppedState.serializer(), element))
            else -> McpServerStateUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: McpServerState) {
        val output = encoder as? JsonEncoder
            ?: error("McpServerState can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is McpServerStateStarting -> output.json.encodeToJsonElement(McpServerStartingState.serializer(), value.value)
            is McpServerStateReady -> output.json.encodeToJsonElement(McpServerReadyState.serializer(), value.value)
            is McpServerStateAuthRequired -> output.json.encodeToJsonElement(McpServerAuthRequiredState.serializer(), value.value)
            is McpServerStateError -> output.json.encodeToJsonElement(McpServerErrorState.serializer(), value.value)
            is McpServerStateStopped -> output.json.encodeToJsonElement(McpServerStoppedState.serializer(), value.value)
            is McpServerStateUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = ToolCallContributorSerializer::class)
sealed interface ToolCallContributor

@JvmInline
value class ToolCallContributorClient(val value: ToolCallClientContributor) : ToolCallContributor
@JvmInline
value class ToolCallContributorMcp(val value: ToolCallMcpContributor) : ToolCallContributor
/**
 * Forward-compat catch-all for unknown ToolCallContributor discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class ToolCallContributorUnknown(val raw: JsonObject) : ToolCallContributor

internal object ToolCallContributorSerializer : KSerializer<ToolCallContributor> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("ToolCallContributor")

    override fun deserialize(decoder: Decoder): ToolCallContributor {
        val input = decoder as? JsonDecoder
            ?: error("ToolCallContributor can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for ToolCallContributor")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return ToolCallContributorUnknown(obj)
        return when (discriminant) {
            "client" -> ToolCallContributorClient(input.json.decodeFromJsonElement(ToolCallClientContributor.serializer(), element))
            "mcp" -> ToolCallContributorMcp(input.json.decodeFromJsonElement(ToolCallMcpContributor.serializer(), element))
            else -> ToolCallContributorUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: ToolCallContributor) {
        val output = encoder as? JsonEncoder
            ?: error("ToolCallContributor can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is ToolCallContributorClient -> output.json.encodeToJsonElement(ToolCallClientContributor.serializer(), value.value)
            is ToolCallContributorMcp -> output.json.encodeToJsonElement(ToolCallMcpContributor.serializer(), value.value)
            is ToolCallContributorUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

@Serializable(with = SessionInputRequestSerializer::class)
sealed interface SessionInputRequest

@JvmInline
value class SessionInputRequestChatInput(val value: SessionChatInputRequest) : SessionInputRequest
@JvmInline
value class SessionInputRequestToolConfirmation(val value: SessionToolConfirmationRequest) : SessionInputRequest
@JvmInline
value class SessionInputRequestToolClientExecution(val value: SessionToolClientExecutionRequest) : SessionInputRequest
/**
 * Forward-compat catch-all for unknown SessionInputRequest discriminators.
 *
 * Older clients may receive newer wire variants they don't recognise; capturing
 * the raw `JsonObject` lets such payloads round-trip through the client unchanged.
 * Reducers handle this variant conservatively on a per-union basis (typically
 * as a no-op, but see `Reducers.kt` for the exact treatment).
 */
@JvmInline
value class SessionInputRequestUnknown(val raw: JsonObject) : SessionInputRequest

internal object SessionInputRequestSerializer : KSerializer<SessionInputRequest> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("SessionInputRequest")

    override fun deserialize(decoder: Decoder): SessionInputRequest {
        val input = decoder as? JsonDecoder
            ?: error("SessionInputRequest can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for SessionInputRequest")
        val discriminant = (obj["kind"] as? JsonPrimitive)?.content
            ?: return SessionInputRequestUnknown(obj)
        return when (discriminant) {
            "chatInput" -> SessionInputRequestChatInput(input.json.decodeFromJsonElement(SessionChatInputRequest.serializer(), element))
            "toolConfirmation" -> SessionInputRequestToolConfirmation(input.json.decodeFromJsonElement(SessionToolConfirmationRequest.serializer(), element))
            "toolClientExecution" -> SessionInputRequestToolClientExecution(input.json.decodeFromJsonElement(SessionToolClientExecutionRequest.serializer(), element))
            else -> SessionInputRequestUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: SessionInputRequest) {
        val output = encoder as? JsonEncoder
            ?: error("SessionInputRequest can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is SessionInputRequestChatInput -> output.json.encodeToJsonElement(SessionChatInputRequest.serializer(), value.value)
            is SessionInputRequestToolConfirmation -> output.json.encodeToJsonElement(SessionToolConfirmationRequest.serializer(), value.value)
            is SessionInputRequestToolClientExecution -> output.json.encodeToJsonElement(SessionToolClientExecutionRequest.serializer(), value.value)
            is SessionInputRequestUnknown -> value.raw
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
    @JvmInline value class TerminalComplete(val value: ToolResultTerminalCompleteContent) : ToolResultContent
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
            "terminalComplete" -> ToolResultContent.TerminalComplete(input.json.decodeFromJsonElement(ToolResultTerminalCompleteContent.serializer(), element))
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
            is ToolResultContent.TerminalComplete -> output.json.encodeToJsonElement(ToolResultTerminalCompleteContent.serializer(), value.value)
            is ToolResultContent.Subagent -> output.json.encodeToJsonElement(ToolResultSubagentContent.serializer(), value.value)
            is ToolResultContent.Unknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}

/**
 * The state payload of a snapshot — root, session, chat, terminal, changeset,
 * resource-watch, or annotations state.
 */
@Serializable(with = SnapshotStateSerializer::class)
sealed interface SnapshotState {
    @JvmInline value class Root(val value: RootState) : SnapshotState
    @JvmInline value class Session(val value: SessionState) : SnapshotState
    @JvmInline value class Chat(val value: ChatState) : SnapshotState
    @JvmInline value class Terminal(val value: TerminalState) : SnapshotState
    @JvmInline value class Changeset(val value: ChangesetState) : SnapshotState
    @JvmInline value class ResourceWatch(val value: ResourceWatchState) : SnapshotState
    @JvmInline value class Annotations(val value: AnnotationsState) : SnapshotState
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
        // `lifecycle`; ChatState has required `turns`; ChangesetState has
        // required `status` + `files`; ResourceWatchState has required
        // `root` + `recursive`; AnnotationsState has required `annotations`
        // (checked after session, whose optional annotations summary reuses the
        // key); TerminalState has required `content`; RootState is the
        // catch-all.
        return when {
            obj.containsKey("lifecycle") -> SnapshotState.Session(input.json.decodeFromJsonElement(SessionState.serializer(), element))
            obj.containsKey("turns") -> SnapshotState.Chat(input.json.decodeFromJsonElement(ChatState.serializer(), element))
            obj.containsKey("status") && obj.containsKey("files") ->
                SnapshotState.Changeset(input.json.decodeFromJsonElement(ChangesetState.serializer(), element))
            obj.containsKey("root") && obj.containsKey("recursive") ->
                SnapshotState.ResourceWatch(input.json.decodeFromJsonElement(ResourceWatchState.serializer(), element))
            obj.containsKey("annotations") ->
                SnapshotState.Annotations(input.json.decodeFromJsonElement(AnnotationsState.serializer(), element))
            obj.containsKey("content") ->
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
            is SnapshotState.Chat -> output.json.encodeToJsonElement(ChatState.serializer(), value.value)
            is SnapshotState.Terminal -> output.json.encodeToJsonElement(TerminalState.serializer(), value.value)
            is SnapshotState.Changeset -> output.json.encodeToJsonElement(ChangesetState.serializer(), value.value)
            is SnapshotState.ResourceWatch -> output.json.encodeToJsonElement(ResourceWatchState.serializer(), value.value)
            is SnapshotState.Annotations -> output.json.encodeToJsonElement(AnnotationsState.serializer(), value.value)
        }
        output.encodeJsonElement(element)
    }
}
