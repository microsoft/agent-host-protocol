// Generated from types/*.ts — do not edit

import Foundation

// MARK: - Type Aliases

public typealias URI = String

// MARK: - StringOrMarkdown

/// A value that is either a plain string or a markdown-formatted string.
public enum StringOrMarkdown: Codable, Sendable, Equatable {
    case string(String)
    case markdown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            self = .string(str)
            return
        }
        let obj = try MarkdownWrapper(from: decoder)
        self = .markdown(obj.markdown)
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .string(let value):
            var container = encoder.singleValueContainer()
            try container.encode(value)
        case .markdown(let value):
            try MarkdownWrapper(markdown: value).encode(to: encoder)
        }
    }

    private struct MarkdownWrapper: Codable {
        let markdown: String
    }
}

// MARK: - Enums

/// Policy configuration state for a model.
public enum PolicyState: String, Codable, Sendable {
    case enabled = "enabled"
    case disabled = "disabled"
    case unconfigured = "unconfigured"
}

/// Discriminant for pending message kinds.
public enum PendingMessageKind: String, Codable, Sendable {
    /// Injected into the current turn at a convenient point
    case steering = "steering"
    /// Sent automatically as a new turn after the current turn finishes
    case queued = "queued"
}

/// Session initialization state.
public enum SessionLifecycle: String, Codable, Sendable {
    case creating = "creating"
    case ready = "ready"
    case creationFailed = "creationFailed"
}

/// Bitset of summary-level session status flags.
///
/// Use bitwise checks instead of equality for non-terminal activity. For example,
/// `status & SessionStatus.InProgress` matches both ordinary in-progress turns
/// and turns that are paused waiting for input.
public struct SessionStatus: OptionSet, Codable, Sendable, Hashable {
    public let rawValue: UInt32
    public init(rawValue: UInt32) { self.rawValue = rawValue }

    /// Session is idle — no turn is active.
    public static let idle = SessionStatus(rawValue: 1)
    /// Session ended with an error.
    public static let error = SessionStatus(rawValue: 2)
    /// A turn is actively streaming.
    public static let inProgress = SessionStatus(rawValue: 8)
    /// A turn is in progress but blocked waiting for user input or tool confirmation.
    public static let inputNeeded = SessionStatus(rawValue: 24)
    /// The client has viewed this session since its last modification.
    public static let isRead = SessionStatus(rawValue: 32)
    /// The session has been archived by the client.
    public static let isArchived = SessionStatus(rawValue: 64)
}

public enum ChatOriginKind: String, Codable, Sendable {
    case user = "user"
    case fork = "fork"
    case tool = "tool"
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
public enum ChatInteractivity: String, Codable, Sendable {
    /// User can send messages and watch (default when absent)
    case full = "full"
    /// User can watch but not send messages
    case readOnly = "read-only"
    /// Internal worker not shown in UI at all
    case hidden = "hidden"
}

/// Answer lifecycle state.
public enum ChatInputAnswerState: String, Codable, Sendable {
    case draft = "draft"
    case submitted = "submitted"
    case skipped = "skipped"
}

/// Answer value kind.
public enum ChatInputAnswerValueKind: String, Codable, Sendable {
    case text = "text"
    case number = "number"
    case boolean = "boolean"
    case selected = "selected"
    case selectedMany = "selected-many"
}

/// Question/input control kind.
public enum ChatInputQuestionKind: String, Codable, Sendable {
    case text = "text"
    case number = "number"
    case integer = "integer"
    case boolean = "boolean"
    case singleSelect = "single-select"
    case multiSelect = "multi-select"
}

/// How a client completed an input request.
public enum ChatInputResponseKind: String, Codable, Sendable {
    case accept = "accept"
    case decline = "decline"
    case cancel = "cancel"
}

/// How a turn ended.
public enum TurnState: String, Codable, Sendable {
    case complete = "complete"
    case cancelled = "cancelled"
    case error = "error"
}

/// Discriminant for {@link MessageAttachment} variants.
public enum MessageAttachmentKind: String, Codable, Sendable {
    /// A simple, opaque attachment whose representation is described by the producer.
    case simple = "simple"
    /// An attachment whose data is embedded inline as a base64 string.
    case embeddedResource = "embeddedResource"
    /// An attachment that references a resource by URI.
    case resource = "resource"
    /// An attachment that references annotations on an annotations channel.
    case annotations = "annotations"
}

/// Discriminant for response part types.
public enum ResponsePartKind: String, Codable, Sendable {
    case markdown = "markdown"
    case contentRef = "contentRef"
    case toolCall = "toolCall"
    case reasoning = "reasoning"
    case systemNotification = "systemNotification"
}

/// Status of a tool call in the lifecycle state machine.
public enum ToolCallStatus: String, Codable, Sendable {
    case streaming = "streaming"
    case pendingConfirmation = "pending-confirmation"
    case running = "running"
    case pendingResultConfirmation = "pending-result-confirmation"
    case completed = "completed"
    case cancelled = "cancelled"
}

/// How a tool call was confirmed for execution.
///
/// - `NotNeeded` — No confirmation required (auto-approved)
/// - `UserAction` — User explicitly approved
/// - `Setting` — Approved by a persistent user setting
public enum ToolCallConfirmationReason: String, Codable, Sendable {
    case notNeeded = "not-needed"
    case userAction = "user-action"
    case setting = "setting"
}

/// Why a tool call was cancelled.
public enum ToolCallCancellationReason: String, Codable, Sendable {
    case denied = "denied"
    case skipped = "skipped"
    case resultDenied = "result-denied"
}

/// Whether a confirmation option represents an approval or denial action.
public enum ConfirmationOptionKind: String, Codable, Sendable {
    case approve = "approve"
    case deny = "deny"
}

public enum ToolCallContributorKind: String, Codable, Sendable {
    case client = "client"
    case mCP = "mcp"
}

/// Discriminant for tool result content types.
public enum ToolResultContentType: String, Codable, Sendable {
    case text = "text"
    case embeddedResource = "embeddedResource"
    case resource = "resource"
    case fileEdit = "fileEdit"
    case terminal = "terminal"
    case subagent = "subagent"
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
public enum CustomizationType: String, Codable, Sendable {
    case plugin = "plugin"
    case directory = "directory"
    case agent = "agent"
    case skill = "skill"
    case prompt = "prompt"
    case rule = "rule"
    case hook = "hook"
    case mcpServer = "mcpServer"
}

/// Discriminant values for {@link CustomizationLoadState}.
public enum CustomizationLoadStatus: String, Codable, Sendable {
    case loading = "loading"
    case loaded = "loaded"
    case degraded = "degraded"
    case error = "error"
}

/// Discriminant for terminal claim kinds.
public enum TerminalClaimKind: String, Codable, Sendable {
    case client = "client"
    case session = "session"
}

/// Discriminant for the {@link McpServerState} union.
public enum McpServerStatus: String, Codable, Sendable {
    /// Server has been registered but is not yet running.
    case starting = "starting"
    /// Server is running and serving requests.
    case ready = "ready"
    /// Server is reachable but requires additional authentication before it
    /// can start, or before it can serve a particular request. Carries the
    /// RFC 9728 Protected Resource Metadata the client needs to obtain a
    /// token; the client then pushes the token via the existing
    /// `authenticate` command.
    case authRequired = "authRequired"
    /// Server failed to start, crashed, or otherwise transitioned to a fatal error.
    case error = "error"
    /// Server has been shut down.
    case stopped = "stopped"
}

/// Why an MCP server is currently in the {@link McpServerStatus.AuthRequired}
/// state. Mirrors the three failure modes defined by the
/// [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.md).
public enum McpAuthRequiredReason: String, Codable, Sendable {
    /// No token has been provided yet (HTTP 401, no prior token).
    case required = "required"
    /// A previously valid token expired or was revoked (HTTP 401).
    case expired = "expired"
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
    case insufficientScope = "insufficientScope"
}

/// Computation lifecycle of a {@link ChangesetState}.
public enum ChangesetStatus: String, Codable, Sendable {
    /// The server is still computing the contents of this changeset.
    case computing = "computing"
    /// The changeset has been fully computed and is up-to-date.
    case ready = "ready"
    /// Computation failed. The cause is described by
    /// {@link ChangesetState.error}.
    case error = "error"
}

/// Execution lifecycle of a {@link ChangesetOperation}.
///
/// An operation is invoked imperatively via `invokeChangesetOperation`, but
/// its progress and outcome are reflected back into changeset state so that
/// every subscriber observes a consistent view (e.g. a spinner on a "Create
/// Pull Request" button, or an inline error after a failed "revert").
public enum ChangesetOperationStatus: String, Codable, Sendable {
    /// The operation is ready to be invoked. This is the default when
    /// {@link ChangesetOperation.status} is omitted.
    case idle = "idle"
    /// An invocation of this operation is currently in flight.
    case running = "running"
    /// The most recent invocation failed. The cause is described by
    /// {@link ChangesetOperation.error}.
    case error = "error"
    /// The operation is currently disabled and cannot be invoked.
    case disabled = "disabled"
}

/// Where a {@link ChangesetOperation} can be invoked.
public enum ChangesetOperationScope: String, Codable, Sendable {
    /// Applies to the whole changeset.
    case changeset = "changeset"
    /// Applies to a single file within the changeset.
    case resource = "resource"
    /// Applies to a line range within a single file.
    case range = "range"
}

/// Discriminant for {@link ResourceChange.type}.
public enum ResourceChangeType: String, Codable, Sendable {
    case added = "added"
    case updated = "updated"
    case deleted = "deleted"
}

// MARK: - State Types

public struct Icon: Codable, Sendable {
    /// A standard URI pointing to an icon resource. May be an HTTP/HTTPS URL or a
    /// `data:` URI with Base64-encoded image data.
    ///
    /// Consumers SHOULD take steps to ensure URLs serving icons are from the
    /// same domain as the client/server or a trusted domain.
    ///
    /// Consumers SHOULD take appropriate precautions when consuming SVGs as they can contain
    /// executable JavaScript.
    public var src: String
    /// Optional MIME type override if the source MIME type is missing or generic.
    /// For example: `"image/png"`, `"image/jpeg"`, or `"image/svg+xml"`.
    public var contentType: String?
    /// Optional array of strings that specify sizes at which the icon can be used.
    /// Each string should be in WxH format (e.g., `"48x48"`, `"96x96"`) or `"any"` for scalable formats like SVG.
    ///
    /// If not provided, the client should assume that the icon can be used at any size.
    public var sizes: [String]?
    /// Optional specifier for the theme this icon is designed for. `"light"` indicates
    /// the icon is designed to be used with a light background, and `"dark"` indicates
    /// the icon is designed to be used with a dark background.
    ///
    /// If not provided, the client should assume the icon can be used with any theme.
    public var theme: String?

    public init(
        src: String,
        contentType: String? = nil,
        sizes: [String]? = nil,
        theme: String? = nil
    ) {
        self.src = src
        self.contentType = contentType
        self.sizes = sizes
        self.theme = theme
    }
}

public struct ProtectedResourceMetadata: Codable, Sendable {
    /// REQUIRED. The protected resource's resource identifier, a URL using the
    /// `https` scheme with no fragment component (e.g. `"https://api.github.com"`).
    public var resource: String
    /// OPTIONAL. Human-readable name of the protected resource.
    public var resourceName: String?
    /// OPTIONAL. JSON array of OAuth authorization server identifier URLs.
    public var authorizationServers: [String]?
    /// OPTIONAL. URL of the protected resource's JWK Set document.
    public var jwksUri: String?
    /// RECOMMENDED. JSON array of OAuth 2.0 scope values used in authorization requests.
    public var scopesSupported: [String]?
    /// OPTIONAL. JSON array of Bearer Token presentation methods supported.
    public var bearerMethodsSupported: [String]?
    /// OPTIONAL. JSON array of JWS signing algorithms supported.
    public var resourceSigningAlgValuesSupported: [String]?
    /// OPTIONAL. JSON array of JWE encryption algorithms (alg) supported.
    public var resourceEncryptionAlgValuesSupported: [String]?
    /// OPTIONAL. JSON array of JWE encryption algorithms (enc) supported.
    public var resourceEncryptionEncValuesSupported: [String]?
    /// OPTIONAL. URL of human-readable documentation for the resource.
    public var resourceDocumentation: String?
    /// OPTIONAL. URL of the resource's data-usage policy.
    public var resourcePolicyUri: String?
    /// OPTIONAL. URL of the resource's terms of service.
    public var resourceTosUri: String?
    /// AHP extension. Whether authentication is required for this resource.
    ///
    /// - `true` (default) — the agent cannot be used without a valid token.
    /// The server SHOULD return `AuthRequired` (`-32007`) if the client
    /// attempts to use the agent without authenticating.
    /// - `false` — the agent works without authentication but MAY offer
    /// enhanced capabilities when a token is provided.
    ///
    /// Clients SHOULD treat an absent field the same as `true`.
    public var required: Bool?

    enum CodingKeys: String, CodingKey {
        case resource
        case resourceName = "resource_name"
        case authorizationServers = "authorization_servers"
        case jwksUri = "jwks_uri"
        case scopesSupported = "scopes_supported"
        case bearerMethodsSupported = "bearer_methods_supported"
        case resourceSigningAlgValuesSupported = "resource_signing_alg_values_supported"
        case resourceEncryptionAlgValuesSupported = "resource_encryption_alg_values_supported"
        case resourceEncryptionEncValuesSupported = "resource_encryption_enc_values_supported"
        case resourceDocumentation = "resource_documentation"
        case resourcePolicyUri = "resource_policy_uri"
        case resourceTosUri = "resource_tos_uri"
        case required
    }

    public init(
        resource: String,
        resourceName: String? = nil,
        authorizationServers: [String]? = nil,
        jwksUri: String? = nil,
        scopesSupported: [String]? = nil,
        bearerMethodsSupported: [String]? = nil,
        resourceSigningAlgValuesSupported: [String]? = nil,
        resourceEncryptionAlgValuesSupported: [String]? = nil,
        resourceEncryptionEncValuesSupported: [String]? = nil,
        resourceDocumentation: String? = nil,
        resourcePolicyUri: String? = nil,
        resourceTosUri: String? = nil,
        required: Bool? = nil
    ) {
        self.resource = resource
        self.resourceName = resourceName
        self.authorizationServers = authorizationServers
        self.jwksUri = jwksUri
        self.scopesSupported = scopesSupported
        self.bearerMethodsSupported = bearerMethodsSupported
        self.resourceSigningAlgValuesSupported = resourceSigningAlgValuesSupported
        self.resourceEncryptionAlgValuesSupported = resourceEncryptionAlgValuesSupported
        self.resourceEncryptionEncValuesSupported = resourceEncryptionEncValuesSupported
        self.resourceDocumentation = resourceDocumentation
        self.resourcePolicyUri = resourcePolicyUri
        self.resourceTosUri = resourceTosUri
        self.required = required
    }
}

public struct RootState: Codable, Sendable {
    /// Available agent backends and their models
    public var agents: [AgentInfo]
    /// Number of active (non-disposed) sessions on the server
    public var activeSessions: Int?
    /// Known terminals on the server. Subscribe to individual terminal URIs for full state.
    public var terminals: [TerminalInfo]?
    /// Agent host configuration schema and current values
    public var config: RootConfigState?
    /// Additional implementation-defined metadata about the agent host itself.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case agents
        case activeSessions
        case terminals
        case config
        case meta = "_meta"
    }

    public init(
        agents: [AgentInfo],
        activeSessions: Int? = nil,
        terminals: [TerminalInfo]? = nil,
        config: RootConfigState? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.agents = agents
        self.activeSessions = activeSessions
        self.terminals = terminals
        self.config = config
        self.meta = meta
    }
}

public struct RootConfigState: Codable, Sendable {
    /// JSON Schema describing available configuration properties
    public var schema: ConfigSchema
    /// Current configuration values
    public var values: [String: AnyCodable]

    public init(
        schema: ConfigSchema,
        values: [String: AnyCodable]
    ) {
        self.schema = schema
        self.values = values
    }
}

public struct AgentInfo: Codable, Sendable {
    /// Agent provider ID (e.g. `'copilot'`)
    public var provider: String
    /// Human-readable name
    public var displayName: String
    /// Description string
    public var description: String
    /// Available models for this agent
    public var models: [SessionModelInfo]
    /// Protected resources this agent requires authentication for.
    ///
    /// Each entry describes an OAuth 2.0 protected resource using
    /// [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) semantics.
    /// Clients should obtain tokens from the declared `authorization_servers`
    /// and push them via the `authenticate` command before creating sessions
    /// with this agent.
    public var protectedResources: [ProtectedResourceMetadata]?
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
    public var customizations: [Customization]?

    public init(
        provider: String,
        displayName: String,
        description: String,
        models: [SessionModelInfo],
        protectedResources: [ProtectedResourceMetadata]? = nil,
        customizations: [Customization]? = nil
    ) {
        self.provider = provider
        self.displayName = displayName
        self.description = description
        self.models = models
        self.protectedResources = protectedResources
        self.customizations = customizations
    }
}

public struct SessionModelInfo: Codable, Sendable {
    /// Model identifier
    public var id: String
    /// Provider this model belongs to
    public var provider: String
    /// Human-readable model name
    public var name: String
    /// Maximum context window size
    public var maxContextWindow: Int?
    /// Whether the model supports vision
    public var supportsVision: Bool?
    /// Policy configuration state
    public var policyState: PolicyState?
    /// Configuration schema describing model-specific options (e.g. thinking
    /// level). Clients present this as a form and pass the resolved values in
    /// {@link ModelSelection.config} when creating or changing sessions.
    public var configSchema: ConfigSchema?
    /// Additional provider-specific metadata for this model.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `pricing` key may carry model pricing metadata.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id
        case provider
        case name
        case maxContextWindow
        case supportsVision
        case policyState
        case configSchema
        case meta = "_meta"
    }

    public init(
        id: String,
        provider: String,
        name: String,
        maxContextWindow: Int? = nil,
        supportsVision: Bool? = nil,
        policyState: PolicyState? = nil,
        configSchema: ConfigSchema? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.provider = provider
        self.name = name
        self.maxContextWindow = maxContextWindow
        self.supportsVision = supportsVision
        self.policyState = policyState
        self.configSchema = configSchema
        self.meta = meta
    }
}

public struct ModelSelection: Codable, Sendable {
    /// Model identifier
    public var id: String
    /// Model-specific configuration values
    public var config: [String: String]?

    public init(
        id: String,
        config: [String: String]? = nil
    ) {
        self.id = id
        self.config = config
    }
}

public struct AgentSelection: Codable, Sendable {
    /// Stable agent URI (matches an {@link AgentCustomization.uri}).
    public var uri: String

    public init(
        uri: String
    ) {
        self.uri = uri
    }
}

public final class ConfigPropertySchema: Codable, @unchecked Sendable {
    /// JSON Schema: property type
    public var type: String
    /// JSON Schema: human-readable label for the property
    public var title: String
    /// JSON Schema: description / tooltip
    public var description: String?
    /// JSON Schema: default value
    public var `default`: AnyCodable?
    /// JSON Schema: allowed values (typically used with `string` type)
    public var `enum`: [String]?
    /// Display extension: human-readable label per enum value (parallel array)
    public var enumLabels: [String]?
    /// Display extension: description per enum value (parallel array)
    public var enumDescriptions: [String]?
    /// JSON Schema: when `true`, the property is displayed but cannot be modified by the user
    public var readOnly: Bool?
    /// JSON Schema: schema for array items (used when `type` is `'array'`)
    public var items: ConfigPropertySchema?
    /// JSON Schema: property descriptors for object properties (used when `type` is `'object'`)
    public var properties: [String: ConfigPropertySchema]?
    /// JSON Schema: list of required property ids (used when `type` is `'object'`)
    public var required: [String]?

    enum CodingKeys: String, CodingKey {
        case type
        case title
        case description
        case `default` = "default"
        case `enum` = "enum"
        case enumLabels
        case enumDescriptions
        case readOnly
        case items
        case properties
        case required
    }

    public init(
        type: String,
        title: String,
        description: String? = nil,
        `default`: AnyCodable? = nil,
        `enum`: [String]? = nil,
        enumLabels: [String]? = nil,
        enumDescriptions: [String]? = nil,
        readOnly: Bool? = nil,
        items: ConfigPropertySchema? = nil,
        properties: [String: ConfigPropertySchema]? = nil,
        required: [String]? = nil
    ) {
        self.type = type
        self.title = title
        self.description = description
        self.`default` = `default`
        self.`enum` = `enum`
        self.enumLabels = enumLabels
        self.enumDescriptions = enumDescriptions
        self.readOnly = readOnly
        self.items = items
        self.properties = properties
        self.required = required
    }
}

public struct ConfigSchema: Codable, Sendable {
    /// JSON Schema: always `'object'`
    public var type: String
    /// JSON Schema: property descriptors keyed by property id
    public var properties: [String: ConfigPropertySchema]
    /// JSON Schema: list of required property ids
    public var required: [String]?

    public init(
        type: String,
        properties: [String: ConfigPropertySchema],
        required: [String]? = nil
    ) {
        self.type = type
        self.properties = properties
        self.required = required
    }
}

public struct PendingMessage: Codable, Sendable {
    /// Unique identifier for this pending message
    public var id: String
    /// The message that will start the next turn
    public var message: Message

    public init(
        id: String,
        message: Message
    ) {
        self.id = id
        self.message = message
    }
}

public struct ChatState: Codable, Sendable {
    /// Chat URI
    public var resource: String
    /// Chat title
    public var title: String
    /// Current chat status (reuses SessionStatus shape)
    public var status: SessionStatus
    /// Human-readable description of what the chat is currently doing
    public var activity: String?
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    public var modifiedAt: String
    /// Optional per-chat model override (defaults to the session's model)
    public var model: ModelSelection?
    /// Optional per-chat agent override (defaults to the session's agent)
    public var agent: AgentSelection?
    /// How this chat came into existence
    public var origin: ChatOrigin?
    /// How the user can interact with this chat. See {@link ChatInteractivity}.
    ///
    /// Supports agent-team patterns where worker chats are read-only or hidden.
    /// Absence defaults to {@link ChatInteractivity.Full} for backward
    /// compatibility.
    public var interactivity: ChatInteractivity?
    /// Optional per-chat working directory.
    ///
    /// If absent, the chat inherits
    /// {@link SessionSummary.workingDirectory | the session's working directory}.
    /// Hosts MAY override this for individual chats — for example, to give a
    /// subordinate chat its own git worktree so multiple chats in a session can
    /// make independent edits that the orchestrator later merges back.
    public var workingDirectory: String?
    /// Completed turns
    public var turns: [Turn]
    /// Currently in-progress turn
    public var activeTurn: ActiveTurn?
    /// Message to inject into the current turn at a convenient point
    public var steeringMessage: PendingMessage?
    /// Messages to send automatically as new turns after the current turn finishes
    public var queuedMessages: [PendingMessage]?
    /// Requests for user input that are currently blocking or informing chat progress
    public var inputRequests: [ChatInputRequest]?
    /// Additional provider-specific metadata for this chat.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case resource
        case title
        case status
        case activity
        case modifiedAt
        case model
        case agent
        case origin
        case interactivity
        case workingDirectory
        case turns
        case activeTurn
        case steeringMessage
        case queuedMessages
        case inputRequests
        case meta = "_meta"
    }

    public init(
        resource: String,
        title: String,
        status: SessionStatus,
        activity: String? = nil,
        modifiedAt: String,
        model: ModelSelection? = nil,
        agent: AgentSelection? = nil,
        origin: ChatOrigin? = nil,
        interactivity: ChatInteractivity? = nil,
        workingDirectory: String? = nil,
        turns: [Turn],
        activeTurn: ActiveTurn? = nil,
        steeringMessage: PendingMessage? = nil,
        queuedMessages: [PendingMessage]? = nil,
        inputRequests: [ChatInputRequest]? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.resource = resource
        self.title = title
        self.status = status
        self.activity = activity
        self.modifiedAt = modifiedAt
        self.model = model
        self.agent = agent
        self.origin = origin
        self.interactivity = interactivity
        self.workingDirectory = workingDirectory
        self.turns = turns
        self.activeTurn = activeTurn
        self.steeringMessage = steeringMessage
        self.queuedMessages = queuedMessages
        self.inputRequests = inputRequests
        self.meta = meta
    }
}

public struct ChatSummary: Codable, Sendable {
    /// Chat URI
    public var resource: String
    /// Chat title
    public var title: String
    /// Current chat status (reuses SessionStatus shape)
    public var status: SessionStatus
    /// Human-readable description of what the chat is currently doing
    public var activity: String?
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    public var modifiedAt: String
    /// Optional per-chat model override (defaults to the session's model)
    public var model: ModelSelection?
    /// Optional per-chat agent override (defaults to the session's agent)
    public var agent: AgentSelection?
    /// How this chat came into existence
    public var origin: ChatOrigin?
    /// How the user can interact with this chat. See {@link ChatInteractivity}.
    ///
    /// Supports agent-team patterns where worker chats are read-only or hidden.
    /// Absence defaults to {@link ChatInteractivity.Full} for backward
    /// compatibility.
    public var interactivity: ChatInteractivity?
    /// Optional per-chat working directory.
    ///
    /// If absent, the chat inherits
    /// {@link SessionSummary.workingDirectory | the session's working directory}.
    /// See {@link ChatState.workingDirectory} for usage notes.
    public var workingDirectory: String?

    public init(
        resource: String,
        title: String,
        status: SessionStatus,
        activity: String? = nil,
        modifiedAt: String,
        model: ModelSelection? = nil,
        agent: AgentSelection? = nil,
        origin: ChatOrigin? = nil,
        interactivity: ChatInteractivity? = nil,
        workingDirectory: String? = nil
    ) {
        self.resource = resource
        self.title = title
        self.status = status
        self.activity = activity
        self.modifiedAt = modifiedAt
        self.model = model
        self.agent = agent
        self.origin = origin
        self.interactivity = interactivity
        self.workingDirectory = workingDirectory
    }
}

public struct SessionState: Codable, Sendable {
    /// Lightweight session metadata
    public var summary: SessionSummary
    /// Session initialization state
    public var lifecycle: SessionLifecycle
    /// Error details if creation failed
    public var creationError: ErrorInfo?
    /// Tools provided by the server (agent host) for this session
    public var serverTools: [ToolDefinition]?
    /// The client currently providing tools and interactive capabilities to this session
    public var activeClient: SessionActiveClient?
    /// Catalog of chats in this session.
    public var chats: [ChatSummary]
    /// The chat that receives input when the user addresses the session without
    /// selecting a specific chat. This is a UI routing hint, not a hierarchy
    /// marker — chats remain equal peers at the protocol level. Hosts MAY change
    /// this over the session's lifetime.
    public var defaultChat: String?
    /// Session configuration schema and current values
    public var config: SessionConfigState?
    /// Top-level customizations active in this session.
    ///
    /// Always one of the {@link Customization} variants:
    ///
    /// - Container customizations ({@link PluginCustomization},
    /// {@link DirectoryCustomization}) whose children — agents, skills,
    /// prompts, rules, hooks, MCP servers — live in each container's
    /// {@link ContainerCustomizationBase.children | `children`} array.
    /// - Top-level {@link McpServerCustomization} entries the host
    /// surfaces directly (for example a globally-configured MCP server
    /// that isn't bundled in a plugin or directory). MCP servers may
    /// also appear as children of a container.
    ///
    /// Client-published plugins arrive via
    /// {@link SessionActiveClient.customizations | `activeClient.customizations`}
    /// and the host propagates them into this list (typically with the
    /// container's `clientId` set and `children` populated). Clients
    /// publish in container shape only; bare MCP servers at the top level
    /// are server-originated.
    public var customizations: [Customization]?
    /// Catalogue of changesets the server can produce for this session. Each
    /// entry advertises a subscribable view of file changes (uncommitted,
    /// session-wide, per-turn, etc.) and the URI template the client expands
    /// before subscribing. See {@link Changeset} for the full shape and
    /// {@link /guide/changesets | Changesets} for an overview of the model.
    public var changesets: [Changeset]?
    /// Additional provider-specific metadata for this session.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `git` key may provide extra git metadata about the session's
    /// workingDirectory.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case summary
        case lifecycle
        case creationError
        case serverTools
        case activeClient
        case chats
        case defaultChat
        case config
        case customizations
        case changesets
        case meta = "_meta"
    }

    public init(
        summary: SessionSummary,
        lifecycle: SessionLifecycle,
        creationError: ErrorInfo? = nil,
        serverTools: [ToolDefinition]? = nil,
        activeClient: SessionActiveClient? = nil,
        chats: [ChatSummary],
        defaultChat: String? = nil,
        config: SessionConfigState? = nil,
        customizations: [Customization]? = nil,
        changesets: [Changeset]? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.summary = summary
        self.lifecycle = lifecycle
        self.creationError = creationError
        self.serverTools = serverTools
        self.activeClient = activeClient
        self.chats = chats
        self.defaultChat = defaultChat
        self.config = config
        self.customizations = customizations
        self.changesets = changesets
        self.meta = meta
    }
}

public struct SessionActiveClient: Codable, Sendable {
    /// Client identifier (matches `clientId` from `initialize`)
    public var clientId: String
    /// Human-readable client name (e.g. `"VS Code"`)
    public var displayName: String?
    /// Tools this client provides to the session
    public var tools: [ToolDefinition]
    /// Plugin customizations this client contributes to the session.
    ///
    /// Clients publish in [Open Plugins](https://open-plugins.com/) format
    /// — i.e. always container-shaped plugins. They MAY synthesize virtual
    /// plugins in memory and rely on the host to expand them into concrete
    /// children inside {@link SessionState.customizations}.
    public var customizations: [ClientPluginCustomization]?

    public init(
        clientId: String,
        displayName: String? = nil,
        tools: [ToolDefinition],
        customizations: [ClientPluginCustomization]? = nil
    ) {
        self.clientId = clientId
        self.displayName = displayName
        self.tools = tools
        self.customizations = customizations
    }
}

public struct SessionSummary: Codable, Sendable {
    /// Session URI
    public var resource: String
    /// Agent provider ID
    public var provider: String
    /// Session title
    public var title: String
    /// Current session status
    public var status: SessionStatus
    /// Human-readable description of what the session is currently doing
    public var activity: String?
    /// Creation timestamp
    public var createdAt: Int
    /// Last modification timestamp
    public var modifiedAt: Int
    /// Server-owned project for this session
    public var project: ProjectInfo?
    /// Currently selected model
    public var model: ModelSelection?
    /// Currently selected custom agent.
    ///
    /// Absent (`undefined`) means no custom agent is selected for this session
    /// — the session uses the provider's default behavior.
    public var agent: AgentSelection?
    /// The default working directory URI for this session. Individual chats
    /// MAY override via {@link ChatSummary.workingDirectory | their own
    /// `workingDirectory`}; this field acts as the fallback for any chat that
    /// does not.
    public var workingDirectory: String?
    /// Aggregate summary of file changes associated with this session. Servers
    /// may populate this to give clients a quick at-a-glance view of the
    /// session's footprint (e.g., for list rendering) without requiring the
    /// client to subscribe to a changeset.
    public var changes: ChangesSummary?
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    public var annotations: AnnotationsSummary?

    public init(
        resource: String,
        provider: String,
        title: String,
        status: SessionStatus,
        activity: String? = nil,
        createdAt: Int,
        modifiedAt: Int,
        project: ProjectInfo? = nil,
        model: ModelSelection? = nil,
        agent: AgentSelection? = nil,
        workingDirectory: String? = nil,
        changes: ChangesSummary? = nil,
        annotations: AnnotationsSummary? = nil
    ) {
        self.resource = resource
        self.provider = provider
        self.title = title
        self.status = status
        self.activity = activity
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.project = project
        self.model = model
        self.agent = agent
        self.workingDirectory = workingDirectory
        self.changes = changes
        self.annotations = annotations
    }
}

public struct ChangesSummary: Codable, Sendable {
    /// Total number of inserted lines across all changed files.
    public var additions: Int?
    /// Total number of deleted lines across all changed files.
    public var deletions: Int?
    /// Number of files that have changes.
    public var files: Int?

    public init(
        additions: Int? = nil,
        deletions: Int? = nil,
        files: Int? = nil
    ) {
        self.additions = additions
        self.deletions = deletions
        self.files = files
    }
}

public struct ProjectInfo: Codable, Sendable {
    /// Project URI
    public var uri: String
    /// Human-readable project name
    public var displayName: String

    public init(
        uri: String,
        displayName: String
    ) {
        self.uri = uri
        self.displayName = displayName
    }
}

public struct SessionConfigState: Codable, Sendable {
    /// JSON Schema describing available configuration properties
    public var schema: SessionConfigSchema
    /// Current configuration values
    public var values: [String: AnyCodable]

    public init(
        schema: SessionConfigSchema,
        values: [String: AnyCodable]
    ) {
        self.schema = schema
        self.values = values
    }
}

public struct Turn: Codable, Sendable {
    /// Turn identifier
    public var id: String
    /// The message that initiated the turn
    public var message: Message
    /// All response content in stream order: text, tool calls, reasoning, and content refs.
    ///
    /// Consumers should derive display text by concatenating markdown parts,
    /// and find tool calls by filtering for `ToolCall` parts.
    public var responseParts: [ResponsePart]
    /// Token usage info
    public var usage: UsageInfo?
    /// How the turn ended
    public var state: TurnState
    /// Error details if state is `'error'`
    public var error: ErrorInfo?

    public init(
        id: String,
        message: Message,
        responseParts: [ResponsePart],
        usage: UsageInfo? = nil,
        state: TurnState,
        error: ErrorInfo? = nil
    ) {
        self.id = id
        self.message = message
        self.responseParts = responseParts
        self.usage = usage
        self.state = state
        self.error = error
    }
}

public struct ActiveTurn: Codable, Sendable {
    /// Turn identifier
    public var id: String
    /// The message that initiated the turn
    public var message: Message
    /// All response content in stream order: text, tool calls, reasoning, and content refs.
    ///
    /// Tool call parts include `pendingPermissions` when permissions are awaiting user approval.
    public var responseParts: [ResponsePart]
    /// Token usage info
    public var usage: UsageInfo?

    public init(
        id: String,
        message: Message,
        responseParts: [ResponsePart],
        usage: UsageInfo? = nil
    ) {
        self.id = id
        self.message = message
        self.responseParts = responseParts
        self.usage = usage
    }
}

public struct Message: Codable, Sendable {
    /// Message text
    public var text: String
    /// The origin of the message
    public var origin: AnyCodable
    /// File/selection attachments
    public var attachments: [MessageAttachment]?
    /// Additional provider-specific metadata for this message.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry context that does not fit any other
    /// field. Mirrors the MCP `_meta` convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case text
        case origin
        case attachments
        case meta = "_meta"
    }

    public init(
        text: String,
        origin: AnyCodable,
        attachments: [MessageAttachment]? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.text = text
        self.origin = origin
        self.attachments = attachments
        self.meta = meta
    }
}

public struct ChatInputOption: Codable, Sendable {
    /// Stable option identifier; for MCP enum values this is the enum string
    public var id: String
    /// Display label
    public var label: String
    /// Optional secondary text
    public var description: String?
    /// Whether this option is the recommended/default choice
    public var recommended: Bool?

    public init(
        id: String,
        label: String,
        description: String? = nil,
        recommended: Bool? = nil
    ) {
        self.id = id
        self.label = label
        self.description = description
        self.recommended = recommended
    }
}

public struct ChatInputTextAnswerValue: Codable, Sendable {
    public var kind: ChatInputAnswerValueKind
    public var value: String

    public init(
        kind: ChatInputAnswerValueKind,
        value: String
    ) {
        self.kind = kind
        self.value = value
    }
}

public struct ChatInputNumberAnswerValue: Codable, Sendable {
    public var kind: ChatInputAnswerValueKind
    public var value: Double

    public init(
        kind: ChatInputAnswerValueKind,
        value: Double
    ) {
        self.kind = kind
        self.value = value
    }
}

public struct ChatInputBooleanAnswerValue: Codable, Sendable {
    public var kind: ChatInputAnswerValueKind
    public var value: Bool

    public init(
        kind: ChatInputAnswerValueKind,
        value: Bool
    ) {
        self.kind = kind
        self.value = value
    }
}

public struct ChatInputSelectedAnswerValue: Codable, Sendable {
    public var kind: ChatInputAnswerValueKind
    public var value: String
    /// Free-form text entered instead of selecting an option
    public var freeformValues: [String]?

    public init(
        kind: ChatInputAnswerValueKind,
        value: String,
        freeformValues: [String]? = nil
    ) {
        self.kind = kind
        self.value = value
        self.freeformValues = freeformValues
    }
}

public struct ChatInputSelectedManyAnswerValue: Codable, Sendable {
    public var kind: ChatInputAnswerValueKind
    public var value: [String]
    /// Free-form text entered in addition to selected options
    public var freeformValues: [String]?

    public init(
        kind: ChatInputAnswerValueKind,
        value: [String],
        freeformValues: [String]? = nil
    ) {
        self.kind = kind
        self.value = value
        self.freeformValues = freeformValues
    }
}

public struct ChatInputAnswered: Codable, Sendable {
    /// Answer state
    public var state: ChatInputAnswerState
    /// Answer value
    public var value: ChatInputAnswerValue

    public init(
        state: ChatInputAnswerState,
        value: ChatInputAnswerValue
    ) {
        self.state = state
        self.value = value
    }
}

public struct ChatInputSkipped: Codable, Sendable {
    /// Answer state
    public var state: ChatInputAnswerState
    /// Free-form reason or value captured while skipping, if any
    public var freeformValues: [String]?

    public init(
        state: ChatInputAnswerState,
        freeformValues: [String]? = nil
    ) {
        self.state = state
        self.freeformValues = freeformValues
    }
}

public struct ChatInputTextQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: ChatInputQuestionKind
    /// Format hint for text questions, such as `email`, `uri`, `date`, or `date-time`
    public var format: String?
    /// Minimum string length
    public var min: Int?
    /// Maximum string length
    public var max: Int?
    /// Default text
    public var defaultValue: String?

    public init(
        id: String,
        title: String? = nil,
        message: String,
        required: Bool? = nil,
        kind: ChatInputQuestionKind,
        format: String? = nil,
        min: Int? = nil,
        max: Int? = nil,
        defaultValue: String? = nil
    ) {
        self.id = id
        self.title = title
        self.message = message
        self.required = required
        self.kind = kind
        self.format = format
        self.min = min
        self.max = max
        self.defaultValue = defaultValue
    }
}

public struct ChatInputNumberQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: ChatInputQuestionKind
    /// Minimum value
    public var min: Double?
    /// Maximum value
    public var max: Double?
    /// Default numeric value
    public var defaultValue: Double?

    public init(
        id: String,
        title: String? = nil,
        message: String,
        required: Bool? = nil,
        kind: ChatInputQuestionKind,
        min: Double? = nil,
        max: Double? = nil,
        defaultValue: Double? = nil
    ) {
        self.id = id
        self.title = title
        self.message = message
        self.required = required
        self.kind = kind
        self.min = min
        self.max = max
        self.defaultValue = defaultValue
    }
}

public struct ChatInputBooleanQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: ChatInputQuestionKind
    /// Default boolean value
    public var defaultValue: Bool?

    public init(
        id: String,
        title: String? = nil,
        message: String,
        required: Bool? = nil,
        kind: ChatInputQuestionKind,
        defaultValue: Bool? = nil
    ) {
        self.id = id
        self.title = title
        self.message = message
        self.required = required
        self.kind = kind
        self.defaultValue = defaultValue
    }
}

public struct ChatInputSingleSelectQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: ChatInputQuestionKind
    /// Options the user may select from
    public var options: [ChatInputOption]
    /// Whether the user may enter text instead of selecting an option
    public var allowFreeformInput: Bool?

    public init(
        id: String,
        title: String? = nil,
        message: String,
        required: Bool? = nil,
        kind: ChatInputQuestionKind,
        options: [ChatInputOption],
        allowFreeformInput: Bool? = nil
    ) {
        self.id = id
        self.title = title
        self.message = message
        self.required = required
        self.kind = kind
        self.options = options
        self.allowFreeformInput = allowFreeformInput
    }
}

public struct ChatInputMultiSelectQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: ChatInputQuestionKind
    /// Options the user may select from
    public var options: [ChatInputOption]
    /// Whether the user may enter text in addition to selecting options
    public var allowFreeformInput: Bool?
    /// Minimum selected item count
    public var min: Int?
    /// Maximum selected item count
    public var max: Int?

    public init(
        id: String,
        title: String? = nil,
        message: String,
        required: Bool? = nil,
        kind: ChatInputQuestionKind,
        options: [ChatInputOption],
        allowFreeformInput: Bool? = nil,
        min: Int? = nil,
        max: Int? = nil
    ) {
        self.id = id
        self.title = title
        self.message = message
        self.required = required
        self.kind = kind
        self.options = options
        self.allowFreeformInput = allowFreeformInput
        self.min = min
        self.max = max
    }
}

public struct ChatInputRequest: Codable, Sendable {
    /// Stable request identifier
    public var id: String
    /// Display message for the request as a whole
    public var message: String?
    /// URL the user should review or open, for URL-style elicitations
    public var url: String?
    /// Ordered questions to ask the user
    public var questions: [ChatInputQuestion]?
    /// Current draft or submitted answers, keyed by question ID
    public var answers: [String: ChatInputAnswer]?

    public init(
        id: String,
        message: String? = nil,
        url: String? = nil,
        questions: [ChatInputQuestion]? = nil,
        answers: [String: ChatInputAnswer]? = nil
    ) {
        self.id = id
        self.message = message
        self.url = url
        self.questions = questions
        self.answers = answers
    }
}

public struct TextPosition: Codable, Sendable {
    /// Zero-based line number.
    public var line: Int
    /// Zero-based character offset within the line.
    public var character: Int

    public init(
        line: Int,
        character: Int
    ) {
        self.line = line
        self.character = character
    }
}

public struct TextRange: Codable, Sendable {
    /// Start position of the range.
    public var start: TextPosition
    /// End position of the range.
    public var end: TextPosition

    public init(
        start: TextPosition,
        end: TextPosition
    ) {
        self.start = start
        self.end = end
    }
}

public struct TextSelection: Codable, Sendable {
    /// The range covered by the selection.
    public var range: TextRange

    public init(
        range: TextRange
    ) {
        self.range = range
    }
}

public struct SimpleMessageAttachment: Codable, Sendable {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    public var label: String
    /// If defined, the range in {@link Message.text} that references this
    /// attachment. This is a text range, not a byte range.
    public var range: TextRange?
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
    public var displayKind: String?
    /// Additional implementation-defined metadata for the attachment.
    ///
    /// If the attachment was produced by the `completions` command, the client
    /// MUST preserve every property of `_meta` originally returned by the agent
    /// host when sending the user message containing the accepted completion.
    public var meta: [String: AnyCodable]?
    /// Discriminant
    public var type: MessageAttachmentKind
    /// Representation of the attachment as it should be shown to the model.
    ///
    /// If the attachment was produced by the client, this property MUST be
    /// defined so the agent host can correctly interpret the attachment. This
    /// property MAY be omitted when the attachment originated from a
    /// `completions` response.
    public var modelRepresentation: String?

    enum CodingKeys: String, CodingKey {
        case label
        case range
        case displayKind
        case meta = "_meta"
        case type
        case modelRepresentation
    }

    public init(
        label: String,
        range: TextRange? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        type: MessageAttachmentKind,
        modelRepresentation: String? = nil
    ) {
        self.label = label
        self.range = range
        self.displayKind = displayKind
        self.meta = meta
        self.type = type
        self.modelRepresentation = modelRepresentation
    }
}

public struct MessageEmbeddedResourceAttachment: Codable, Sendable {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    public var label: String
    /// If defined, the range in {@link Message.text} that references this
    /// attachment. This is a text range, not a byte range.
    public var range: TextRange?
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
    public var displayKind: String?
    /// Additional implementation-defined metadata for the attachment.
    ///
    /// If the attachment was produced by the `completions` command, the client
    /// MUST preserve every property of `_meta` originally returned by the agent
    /// host when sending the user message containing the accepted completion.
    public var meta: [String: AnyCodable]?
    /// Discriminant
    public var type: MessageAttachmentKind
    /// Base64-encoded binary data
    public var data: String
    /// Content MIME type (e.g. `"image/png"`, `"application/pdf"`)
    public var contentType: String
    /// Optional selection within the attached textual resource.
    ///
    /// Only meaningful for textual resources.
    public var selection: TextSelection?

    enum CodingKeys: String, CodingKey {
        case label
        case range
        case displayKind
        case meta = "_meta"
        case type
        case data
        case contentType
        case selection
    }

    public init(
        label: String,
        range: TextRange? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        type: MessageAttachmentKind,
        data: String,
        contentType: String,
        selection: TextSelection? = nil
    ) {
        self.label = label
        self.range = range
        self.displayKind = displayKind
        self.meta = meta
        self.type = type
        self.data = data
        self.contentType = contentType
        self.selection = selection
    }
}

public struct MessageResourceAttachment: Codable, Sendable {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    public var label: String
    /// If defined, the range in {@link Message.text} that references this
    /// attachment. This is a text range, not a byte range.
    public var range: TextRange?
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
    public var displayKind: String?
    /// Additional implementation-defined metadata for the attachment.
    ///
    /// If the attachment was produced by the `completions` command, the client
    /// MUST preserve every property of `_meta` originally returned by the agent
    /// host when sending the user message containing the accepted completion.
    public var meta: [String: AnyCodable]?
    /// Content URI
    public var uri: String
    /// Approximate size in bytes
    public var sizeHint: Int?
    /// Content MIME type
    public var contentType: String?
    /// Discriminant
    public var type: MessageAttachmentKind
    /// Optional selection within the referenced textual resource.
    ///
    /// Only meaningful for textual resources.
    public var selection: TextSelection?

    enum CodingKeys: String, CodingKey {
        case label
        case range
        case displayKind
        case meta = "_meta"
        case uri
        case sizeHint
        case contentType
        case type
        case selection
    }

    public init(
        label: String,
        range: TextRange? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil,
        type: MessageAttachmentKind,
        selection: TextSelection? = nil
    ) {
        self.label = label
        self.range = range
        self.displayKind = displayKind
        self.meta = meta
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
        self.type = type
        self.selection = selection
    }
}

public struct MessageAnnotationsAttachment: Codable, Sendable {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    public var label: String
    /// If defined, the range in {@link Message.text} that references this
    /// attachment. This is a text range, not a byte range.
    public var range: TextRange?
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
    public var displayKind: String?
    /// Additional implementation-defined metadata for the attachment.
    ///
    /// If the attachment was produced by the `completions` command, the client
    /// MUST preserve every property of `_meta` originally returned by the agent
    /// host when sending the user message containing the accepted completion.
    public var meta: [String: AnyCodable]?
    /// Discriminant
    public var type: MessageAttachmentKind
    /// The annotations channel URI (typically `ahp-session:/<uuid>/annotations`).
    /// Matches {@link AnnotationsSummary.resource}.
    public var resource: String
    /// Specific {@link Annotation.id | annotation ids} to reference. When
    /// omitted, the attachment references all annotations on the channel.
    public var annotationIds: [String]?

    enum CodingKeys: String, CodingKey {
        case label
        case range
        case displayKind
        case meta = "_meta"
        case type
        case resource
        case annotationIds
    }

    public init(
        label: String,
        range: TextRange? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        type: MessageAttachmentKind,
        resource: String,
        annotationIds: [String]? = nil
    ) {
        self.label = label
        self.range = range
        self.displayKind = displayKind
        self.meta = meta
        self.type = type
        self.resource = resource
        self.annotationIds = annotationIds
    }
}

public struct MarkdownResponsePart: Codable, Sendable {
    /// Discriminant
    public var kind: ResponsePartKind
    /// Part identifier, used by `chat/delta` to target this part for content appends
    public var id: String
    /// Markdown content
    public var content: String

    public init(
        kind: ResponsePartKind,
        id: String,
        content: String
    ) {
        self.kind = kind
        self.id = id
        self.content = content
    }
}

public struct ContentRef: Codable, Sendable {
    /// Content URI
    public var uri: String
    /// Approximate size in bytes
    public var sizeHint: Int?
    /// Content MIME type
    public var contentType: String?

    public init(
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil
    ) {
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
    }
}

public struct ResourceReponsePart: Codable, Sendable {
    /// Content URI
    public var uri: String
    /// Approximate size in bytes
    public var sizeHint: Int?
    /// Content MIME type
    public var contentType: String?
    /// Discriminant
    public var kind: ResponsePartKind

    public init(
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil,
        kind: ResponsePartKind
    ) {
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
        self.kind = kind
    }
}

public struct ToolCallResponsePart: Codable, Sendable {
    /// Discriminant
    public var kind: ResponsePartKind
    /// Full tool call lifecycle state
    public var toolCall: ToolCallState

    public init(
        kind: ResponsePartKind,
        toolCall: ToolCallState
    ) {
        self.kind = kind
        self.toolCall = toolCall
    }
}

public struct ReasoningResponsePart: Codable, Sendable {
    /// Discriminant
    public var kind: ResponsePartKind
    /// Part identifier, used by `chat/reasoning` to target this part for content appends
    public var id: String
    /// Accumulated reasoning text
    public var content: String

    public init(
        kind: ResponsePartKind,
        id: String,
        content: String
    ) {
        self.kind = kind
        self.id = id
        self.content = content
    }
}

public struct SystemNotificationResponsePart: Codable, Sendable {
    /// Discriminant
    public var kind: ResponsePartKind
    /// The text of the system notification
    public var content: StringOrMarkdown

    public init(
        kind: ResponsePartKind,
        content: StringOrMarkdown
    ) {
        self.kind = kind
        self.content = content
    }
}

public struct ToolCallResult: Codable, Sendable {
    /// Whether the tool succeeded
    public var success: Bool
    /// Past-tense description of what the tool did
    public var pastTenseMessage: StringOrMarkdown
    /// Unstructured result content blocks.
    ///
    /// This mirrors the `content` field of MCP `CallToolResult`.
    public var content: [ToolResultContent]?
    /// Optional structured result object.
    ///
    /// This mirrors the `structuredContent` field of MCP `CallToolResult`.
    public var structuredContent: [String: AnyCodable]?
    /// Error details if the tool failed
    public var error: AnyCodable?

    public init(
        success: Bool,
        pastTenseMessage: StringOrMarkdown,
        content: [ToolResultContent]? = nil,
        structuredContent: [String: AnyCodable]? = nil,
        error: AnyCodable? = nil
    ) {
        self.success = success
        self.pastTenseMessage = pastTenseMessage
        self.content = content
        self.structuredContent = structuredContent
        self.error = error
    }
}

public struct ToolCallStreamingState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Reference to the contributor of the tool being called.
    public var contributor: ToolCallContributor?
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
    public var meta: [String: AnyCodable]?
    public var status: ToolCallStatus
    /// Partial parameters accumulated so far
    public var partialInput: String?
    /// Progress message shown while parameters are streaming
    public var invocationMessage: StringOrMarkdown?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case contributor
        case meta = "_meta"
        case status
        case partialInput
        case invocationMessage
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        status: ToolCallStatus,
        partialInput: String? = nil,
        invocationMessage: StringOrMarkdown? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.contributor = contributor
        self.meta = meta
        self.status = status
        self.partialInput = partialInput
        self.invocationMessage = invocationMessage
    }
}

public struct ToolCallPendingConfirmationState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Reference to the contributor of the tool being called.
    public var contributor: ToolCallContributor?
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
    public var meta: [String: AnyCodable]?
    /// Message describing what the tool will do
    public var invocationMessage: StringOrMarkdown
    /// Raw tool input
    public var toolInput: String?
    public var status: ToolCallStatus
    /// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
    public var confirmationTitle: StringOrMarkdown?
    /// File edits that this tool call will perform, for preview before confirmation
    public var edits: AnyCodable?
    /// Whether the agent host allows the client to edit the tool's input parameters before confirming
    public var editable: Bool?
    /// Options the server offers for this confirmation. When present, the client
    /// SHOULD render these instead of a plain approve/deny UI. Each option
    /// belongs to a {@link ConfirmationOptionGroup} so the client can still
    /// categorise the choices.
    public var options: [ConfirmationOption]?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case status
        case confirmationTitle
        case edits
        case editable
        case options
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        status: ToolCallStatus,
        confirmationTitle: StringOrMarkdown? = nil,
        edits: AnyCodable? = nil,
        editable: Bool? = nil,
        options: [ConfirmationOption]? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.status = status
        self.confirmationTitle = confirmationTitle
        self.edits = edits
        self.editable = editable
        self.options = options
    }
}

public struct ToolCallRunningState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Reference to the contributor of the tool being called.
    public var contributor: ToolCallContributor?
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
    public var meta: [String: AnyCodable]?
    /// Message describing what the tool will do
    public var invocationMessage: StringOrMarkdown
    /// Raw tool input
    public var toolInput: String?
    public var status: ToolCallStatus
    /// How the tool was confirmed for execution
    public var confirmed: ToolCallConfirmationReason
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?
    /// Partial content produced while the tool is still executing.
    ///
    /// For example, a terminal content block lets clients subscribe to live
    /// output before the tool completes.
    public var content: [ToolResultContent]?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case status
        case confirmed
        case selectedOption
        case content
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        status: ToolCallStatus,
        confirmed: ToolCallConfirmationReason,
        selectedOption: ConfirmationOption? = nil,
        content: [ToolResultContent]? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.status = status
        self.confirmed = confirmed
        self.selectedOption = selectedOption
        self.content = content
    }
}

public struct ToolCallPendingResultConfirmationState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Reference to the contributor of the tool being called.
    public var contributor: ToolCallContributor?
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
    public var meta: [String: AnyCodable]?
    /// Message describing what the tool will do
    public var invocationMessage: StringOrMarkdown
    /// Raw tool input
    public var toolInput: String?
    /// Whether the tool succeeded
    public var success: Bool
    /// Past-tense description of what the tool did
    public var pastTenseMessage: StringOrMarkdown
    /// Unstructured result content blocks.
    ///
    /// This mirrors the `content` field of MCP `CallToolResult`.
    public var content: [ToolResultContent]?
    /// Optional structured result object.
    ///
    /// This mirrors the `structuredContent` field of MCP `CallToolResult`.
    public var structuredContent: [String: AnyCodable]?
    /// Error details if the tool failed
    public var error: AnyCodable?
    public var status: ToolCallStatus
    /// How the tool was confirmed for execution
    public var confirmed: ToolCallConfirmationReason
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case success
        case pastTenseMessage
        case content
        case structuredContent
        case error
        case status
        case confirmed
        case selectedOption
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        success: Bool,
        pastTenseMessage: StringOrMarkdown,
        content: [ToolResultContent]? = nil,
        structuredContent: [String: AnyCodable]? = nil,
        error: AnyCodable? = nil,
        status: ToolCallStatus,
        confirmed: ToolCallConfirmationReason,
        selectedOption: ConfirmationOption? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.success = success
        self.pastTenseMessage = pastTenseMessage
        self.content = content
        self.structuredContent = structuredContent
        self.error = error
        self.status = status
        self.confirmed = confirmed
        self.selectedOption = selectedOption
    }
}

public struct ToolCallCompletedState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Reference to the contributor of the tool being called.
    public var contributor: ToolCallContributor?
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
    public var meta: [String: AnyCodable]?
    /// Message describing what the tool will do
    public var invocationMessage: StringOrMarkdown
    /// Raw tool input
    public var toolInput: String?
    /// Whether the tool succeeded
    public var success: Bool
    /// Past-tense description of what the tool did
    public var pastTenseMessage: StringOrMarkdown
    /// Unstructured result content blocks.
    ///
    /// This mirrors the `content` field of MCP `CallToolResult`.
    public var content: [ToolResultContent]?
    /// Optional structured result object.
    ///
    /// This mirrors the `structuredContent` field of MCP `CallToolResult`.
    public var structuredContent: [String: AnyCodable]?
    /// Error details if the tool failed
    public var error: AnyCodable?
    public var status: ToolCallStatus
    /// How the tool was confirmed for execution
    public var confirmed: ToolCallConfirmationReason
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case success
        case pastTenseMessage
        case content
        case structuredContent
        case error
        case status
        case confirmed
        case selectedOption
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        success: Bool,
        pastTenseMessage: StringOrMarkdown,
        content: [ToolResultContent]? = nil,
        structuredContent: [String: AnyCodable]? = nil,
        error: AnyCodable? = nil,
        status: ToolCallStatus,
        confirmed: ToolCallConfirmationReason,
        selectedOption: ConfirmationOption? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.success = success
        self.pastTenseMessage = pastTenseMessage
        self.content = content
        self.structuredContent = structuredContent
        self.error = error
        self.status = status
        self.confirmed = confirmed
        self.selectedOption = selectedOption
    }
}

public struct ToolCallCancelledState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Reference to the contributor of the tool being called.
    public var contributor: ToolCallContributor?
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
    public var meta: [String: AnyCodable]?
    /// Message describing what the tool will do
    public var invocationMessage: StringOrMarkdown
    /// Raw tool input
    public var toolInput: String?
    public var status: ToolCallStatus
    /// Why the tool was cancelled
    public var reason: ToolCallCancellationReason
    /// Optional message explaining the cancellation
    public var reasonMessage: StringOrMarkdown?
    /// What the user suggested doing instead
    public var userSuggestion: Message?
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case status
        case reason
        case reasonMessage
        case userSuggestion
        case selectedOption
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        status: ToolCallStatus,
        reason: ToolCallCancellationReason,
        reasonMessage: StringOrMarkdown? = nil,
        userSuggestion: Message? = nil,
        selectedOption: ConfirmationOption? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.status = status
        self.reason = reason
        self.reasonMessage = reasonMessage
        self.userSuggestion = userSuggestion
        self.selectedOption = selectedOption
    }
}

public struct ConfirmationOption: Codable, Sendable {
    /// Unique identifier for the option, returned in the confirmed action
    public var id: String
    /// Human-readable label displayed to the user
    public var label: String
    /// Whether this option represents an approval or denial
    public var kind: ConfirmationOptionKind
    /// Logical group number for visual categorisation.
    ///
    /// Clients SHOULD display options in the order they are defined and MAY
    /// use differing group numbers to insert dividers between logical clusters
    /// of options.
    public var group: Int?

    public init(
        id: String,
        label: String,
        kind: ConfirmationOptionKind,
        group: Int? = nil
    ) {
        self.id = id
        self.label = label
        self.kind = kind
        self.group = group
    }
}

public struct ToolDefinition: Codable, Sendable {
    /// Unique tool identifier
    public var name: String
    /// Human-readable display name
    public var title: String?
    /// Description of what the tool does
    public var description: String?
    /// JSON Schema defining the expected input parameters.
    ///
    /// Optional because client-provided tools may not have formal schemas.
    /// Mirrors MCP `Tool.inputSchema`.
    public var inputSchema: AnyCodable?
    /// JSON Schema defining the structure of the tool's output.
    ///
    /// Mirrors MCP `Tool.outputSchema`.
    public var outputSchema: AnyCodable?
    /// Behavioral hints about the tool. All properties are advisory.
    public var annotations: ToolAnnotations?
    /// Additional provider-specific metadata.
    ///
    /// Mirrors the MCP `_meta` convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case name
        case title
        case description
        case inputSchema
        case outputSchema
        case annotations
        case meta = "_meta"
    }

    public init(
        name: String,
        title: String? = nil,
        description: String? = nil,
        inputSchema: AnyCodable? = nil,
        outputSchema: AnyCodable? = nil,
        annotations: ToolAnnotations? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.name = name
        self.title = title
        self.description = description
        self.inputSchema = inputSchema
        self.outputSchema = outputSchema
        self.annotations = annotations
        self.meta = meta
    }
}

public struct ToolAnnotations: Codable, Sendable {
    /// Alternate human-readable title
    public var title: String?
    /// Tool does not modify its environment (default: false)
    public var readOnlyHint: Bool?
    /// Tool may perform destructive updates (default: true)
    public var destructiveHint: Bool?
    /// Repeated calls with the same arguments have no additional effect (default: false)
    public var idempotentHint: Bool?
    /// Tool may interact with external entities (default: true)
    public var openWorldHint: Bool?

    public init(
        title: String? = nil,
        readOnlyHint: Bool? = nil,
        destructiveHint: Bool? = nil,
        idempotentHint: Bool? = nil,
        openWorldHint: Bool? = nil
    ) {
        self.title = title
        self.readOnlyHint = readOnlyHint
        self.destructiveHint = destructiveHint
        self.idempotentHint = idempotentHint
        self.openWorldHint = openWorldHint
    }
}

public struct ToolResultTextContent: Codable, Sendable {
    public var type: ToolResultContentType
    /// The text content
    public var text: String

    public init(
        type: ToolResultContentType,
        text: String
    ) {
        self.type = type
        self.text = text
    }
}

public struct ToolResultEmbeddedResourceContent: Codable, Sendable {
    public var type: ToolResultContentType
    /// Base64-encoded data
    public var data: String
    /// Content type (e.g. `"image/png"`, `"application/pdf"`)
    public var contentType: String

    public init(
        type: ToolResultContentType,
        data: String,
        contentType: String
    ) {
        self.type = type
        self.data = data
        self.contentType = contentType
    }
}

public struct ToolResultResourceContent: Codable, Sendable {
    /// Content URI
    public var uri: String
    /// Approximate size in bytes
    public var sizeHint: Int?
    /// Content MIME type
    public var contentType: String?
    public var type: ToolResultContentType

    public init(
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil,
        type: ToolResultContentType
    ) {
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
        self.type = type
    }
}

public struct ToolResultFileEditContent: Codable, Sendable {
    /// The file state before the edit. Absent for file creations or for in-place file edits.
    public var before: AnyCodable?
    /// The file state after the edit. Absent for file deletions.
    public var after: AnyCodable?
    /// Optional diff display metadata
    public var diff: AnyCodable?
    public var type: ToolResultContentType

    public init(
        before: AnyCodable? = nil,
        after: AnyCodable? = nil,
        diff: AnyCodable? = nil,
        type: ToolResultContentType
    ) {
        self.before = before
        self.after = after
        self.diff = diff
        self.type = type
    }
}

public struct ToolResultTerminalContent: Codable, Sendable {
    public var type: ToolResultContentType
    /// Terminal URI (subscribable for full terminal state)
    public var resource: String
    /// Display title for the terminal content
    public var title: String

    public init(
        type: ToolResultContentType,
        resource: String,
        title: String
    ) {
        self.type = type
        self.resource = resource
        self.title = title
    }
}

public struct ToolResultSubagentContent: Codable, Sendable {
    public var type: ToolResultContentType
    /// Subagent session URI (subscribable for full session state)
    public var resource: String
    /// Display title for the subagent
    public var title: String
    /// Internal agent name
    public var agentName: String?
    /// Human-readable description of the subagent's task
    public var description: String?

    public init(
        type: ToolResultContentType,
        resource: String,
        title: String,
        agentName: String? = nil,
        description: String? = nil
    ) {
        self.type = type
        self.resource = resource
        self.title = title
        self.agentName = agentName
        self.description = description
    }
}

public struct CustomizationLoadingState: Codable, Sendable {
    public var kind: CustomizationLoadStatus

    public init(
        kind: CustomizationLoadStatus
    ) {
        self.kind = kind
    }
}

public struct CustomizationLoadedState: Codable, Sendable {
    public var kind: CustomizationLoadStatus

    public init(
        kind: CustomizationLoadStatus
    ) {
        self.kind = kind
    }
}

public struct CustomizationDegradedState: Codable, Sendable {
    public var kind: CustomizationLoadStatus
    /// Human-readable description of the warning.
    public var message: String

    public init(
        kind: CustomizationLoadStatus,
        message: String
    ) {
        self.kind = kind
        self.message = message
    }
}

public struct CustomizationErrorState: Codable, Sendable {
    public var kind: CustomizationLoadStatus
    /// Human-readable error message.
    public var message: String

    public init(
        kind: CustomizationLoadStatus,
        message: String
    ) {
        self.kind = kind
        self.message = message
    }
}

public struct PluginCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    /// Whether this container is currently enabled.
    public var enabled: Bool
    /// `clientId` of the client that contributed this container. Absent for
    /// server-originated entries.
    public var clientId: String?
    /// Host-reported load state. Absent means the host has not yet reported
    /// a load state for this container.
    public var load: CustomizationLoadState?
    /// Children discovered inside this container.
    ///
    /// Absent means the host has not parsed this container yet. An empty
    /// array means the host parsed the container and it contributes
    /// nothing.
    public var children: [ChildCustomization]?
    public var type: CustomizationType

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        enabled: Bool,
        clientId: String? = nil,
        load: CustomizationLoadState? = nil,
        children: [ChildCustomization]? = nil,
        type: CustomizationType
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.enabled = enabled
        self.clientId = clientId
        self.load = load
        self.children = children
        self.type = type
    }
}

public struct ClientPluginCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    /// Whether this container is currently enabled.
    public var enabled: Bool
    /// `clientId` of the client that contributed this container. Absent for
    /// server-originated entries.
    public var clientId: String?
    /// Host-reported load state. Absent means the host has not yet reported
    /// a load state for this container.
    public var load: CustomizationLoadState?
    /// Children discovered inside this container.
    ///
    /// Absent means the host has not parsed this container yet. An empty
    /// array means the host parsed the container and it contributes
    /// nothing.
    public var children: [ChildCustomization]?
    public var type: CustomizationType
    /// Opaque version token used by the host to detect changes.
    public var nonce: String?

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        enabled: Bool,
        clientId: String? = nil,
        load: CustomizationLoadState? = nil,
        children: [ChildCustomization]? = nil,
        type: CustomizationType,
        nonce: String? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.enabled = enabled
        self.clientId = clientId
        self.load = load
        self.children = children
        self.type = type
        self.nonce = nonce
    }
}

public struct DirectoryCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    /// Whether this container is currently enabled.
    public var enabled: Bool
    /// `clientId` of the client that contributed this container. Absent for
    /// server-originated entries.
    public var clientId: String?
    /// Host-reported load state. Absent means the host has not yet reported
    /// a load state for this container.
    public var load: CustomizationLoadState?
    /// Children discovered inside this container.
    ///
    /// Absent means the host has not parsed this container yet. An empty
    /// array means the host parsed the container and it contributes
    /// nothing.
    public var children: [ChildCustomization]?
    public var type: CustomizationType
    /// Which child customization type this directory holds.
    public var contents: CustomizationType
    /// Whether clients may write into this directory.
    public var writable: Bool

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        enabled: Bool,
        clientId: String? = nil,
        load: CustomizationLoadState? = nil,
        children: [ChildCustomization]? = nil,
        type: CustomizationType,
        contents: CustomizationType,
        writable: Bool
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.enabled = enabled
        self.clientId = clientId
        self.load = load
        self.children = children
        self.type = type
        self.contents = contents
        self.writable = writable
    }
}

public struct AgentCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    public var type: CustomizationType
    /// Short description of what the agent specializes in and when to
    /// invoke it. Sourced from the agent file's frontmatter `description`.
    public var description: String?
    /// Additional provider-specific metadata for this custom agent.
    ///
    /// Mirrors the MCP `_meta` convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case type
        case description
        case meta = "_meta"
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        type: CustomizationType,
        description: String? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.type = type
        self.description = description
        self.meta = meta
    }
}

public struct SkillCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    public var type: CustomizationType
    /// Short description used for help text and auto-invocation matching.
    /// Sourced from the skill's frontmatter `description`.
    public var description: String?
    /// When `true`, only the user can invoke this skill — the agent will not
    /// auto-invoke it. Sourced from the command skill's frontmatter
    /// `disable-model-invocation` flag.
    public var disableModelInvocation: Bool?

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        type: CustomizationType,
        description: String? = nil,
        disableModelInvocation: Bool? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.type = type
        self.description = description
        self.disableModelInvocation = disableModelInvocation
    }
}

public struct PromptCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    public var type: CustomizationType
    /// Short description of what the prompt does.
    public var description: String?

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        type: CustomizationType,
        description: String? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.type = type
        self.description = description
    }
}

public struct RuleCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    public var type: CustomizationType
    /// Description of what the rule enforces.
    public var description: String?
    /// When `true`, the rule is always active (subject to `globs` if any).
    /// When `false` or absent, the agent or user decides whether to apply
    /// the rule.
    public var alwaysApply: Bool?
    /// Glob patterns the rule applies to. When present, the rule is only
    /// active for matching files.
    public var globs: [String]?

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        type: CustomizationType,
        description: String? = nil,
        alwaysApply: Bool? = nil,
        globs: [String]? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.type = type
        self.description = description
        self.alwaysApply = alwaysApply
        self.globs = globs
    }
}

public struct HookCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    public var type: CustomizationType

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        type: CustomizationType
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.type = type
    }
}

public struct McpServerCustomization: Codable, Sendable {
    /// Session-unique opaque identifier. Used by every action that targets a
    /// specific customization. Minted by whoever publishes the customization
    /// (typically the agent host).
    public var id: String
    /// Source URI for this customization. A plugin URL, a file URI, or a
    /// directory URI.
    ///
    /// For declarations that live inside a larger file — e.g. an MCP
    /// server declared inline in a `plugins.json` manifest — `uri` points
    /// to the containing file and {@link CustomizationBase.range | `range`}
    /// narrows it to the declaration's span.
    public var uri: String
    /// Human-readable name.
    public var name: String
    /// Icons for UI display.
    public var icons: [Icon]?
    /// Optional span within {@link CustomizationBase.uri | `uri`} when this
    /// customization is a subset of a larger file (for example, one entry
    /// in an inline `mcpServers` block of a `plugins.json` manifest).
    /// Absent when the customization covers the whole resource.
    public var range: TextRange?
    public var type: CustomizationType
    /// Whether this MCP server is currently enabled.
    public var enabled: Bool
    /// Current lifecycle state of the MCP server.
    public var state: McpServerState
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
    public var channel: String?
    /// MCP App support. This property SHOULD be advertised for MCP servers
    /// which support apps.
    public var mcpApp: McpServerCustomizationApps?

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        type: CustomizationType,
        enabled: Bool,
        state: McpServerState,
        channel: String? = nil,
        mcpApp: McpServerCustomizationApps? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.type = type
        self.enabled = enabled
        self.state = state
        self.channel = channel
        self.mcpApp = mcpApp
    }
}

public struct McpServerCustomizationApps: Codable, Sendable {
    /// The subset of MCP App
    /// [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
    /// the AHP host can satisfy for Views backed by this server. The
    /// client feeds these straight through into the `hostCapabilities` of
    /// the `ui/initialize` response delivered to the View.
    public var capabilities: AhpMcpUiHostCapabilities

    public init(
        capabilities: AhpMcpUiHostCapabilities
    ) {
        self.capabilities = capabilities
    }
}

public struct AhpMcpUiHostCapabilities: Codable, Sendable {
    /// Producer proxies the MCP `tools/*` methods to the upstream server.
    public var serverTools: AnyCodable?
    /// Producer proxies the MCP `resources/*` methods to the upstream server.
    public var serverResources: AnyCodable?
    /// Producer accepts `notifications/message` log entries from the App via `mcpNotification`.
    public var logging: [String: AnyCodable]?
    /// Producer serves `sampling/createMessage` via `mcpMethodCall`.
    public var sampling: AnyCodable?

    public init(
        serverTools: AnyCodable? = nil,
        serverResources: AnyCodable? = nil,
        logging: [String: AnyCodable]? = nil,
        sampling: AnyCodable? = nil
    ) {
        self.serverTools = serverTools
        self.serverResources = serverResources
        self.logging = logging
        self.sampling = sampling
    }
}

public struct McpServerStartingState: Codable, Sendable {
    public var kind: McpServerStatus

    public init(
        kind: McpServerStatus
    ) {
        self.kind = kind
    }
}

public struct McpServerReadyState: Codable, Sendable {
    public var kind: McpServerStatus

    public init(
        kind: McpServerStatus
    ) {
        self.kind = kind
    }
}

public struct McpServerAuthRequiredState: Codable, Sendable {
    public var kind: McpServerStatus
    /// Why authentication is required.
    public var reason: McpAuthRequiredReason
    /// RFC 9728 Protected Resource Metadata. The `resource` field is the
    /// canonical MCP server URI per RFC 8707, used as the OAuth `resource`
    /// indicator. `authorization_servers` is REQUIRED by the MCP
    /// authorization spec.
    public var resource: ProtectedResourceMetadata
    /// Scopes required for the current challenge, parsed from the
    /// `WWW-Authenticate: Bearer scope="…"` header (or `scopes_supported`
    /// fallback). Authoritative for the next authorization request — clients
    /// MUST NOT assume any subset/superset relationship to
    /// `resource.scopes_supported`.
    public var requiredScopes: [String]?
    /// Human-readable hint, typically from the OAuth `error_description`.
    public var description: String?

    public init(
        kind: McpServerStatus,
        reason: McpAuthRequiredReason,
        resource: ProtectedResourceMetadata,
        requiredScopes: [String]? = nil,
        description: String? = nil
    ) {
        self.kind = kind
        self.reason = reason
        self.resource = resource
        self.requiredScopes = requiredScopes
        self.description = description
    }
}

public struct McpServerErrorState: Codable, Sendable {
    public var kind: McpServerStatus
    /// Error details.
    public var error: ErrorInfo

    public init(
        kind: McpServerStatus,
        error: ErrorInfo
    ) {
        self.kind = kind
        self.error = error
    }
}

public struct McpServerStoppedState: Codable, Sendable {
    public var kind: McpServerStatus

    public init(
        kind: McpServerStatus
    ) {
        self.kind = kind
    }
}

public struct ToolCallClientContributor: Codable, Sendable {
    public var kind: ToolCallContributorKind
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    ///
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `chat/toolCallComplete` with the result.
    public var clientId: String

    public init(
        kind: ToolCallContributorKind,
        clientId: String
    ) {
        self.kind = kind
        self.clientId = clientId
    }
}

public struct ToolCallMcpContributor: Codable, Sendable {
    public var kind: ToolCallContributorKind
    /// Customization ID of the corresponding MCP server in {@link SessionState.customizations}.
    public var customizationId: String

    public init(
        kind: ToolCallContributorKind,
        customizationId: String
    ) {
        self.kind = kind
        self.customizationId = customizationId
    }
}

public struct FileEdit: Codable, Sendable {
    /// The file state before the edit. Absent for file creations or for in-place file edits.
    public var before: AnyCodable?
    /// The file state after the edit. Absent for file deletions.
    public var after: AnyCodable?
    /// Optional diff display metadata
    public var diff: AnyCodable?

    public init(
        before: AnyCodable? = nil,
        after: AnyCodable? = nil,
        diff: AnyCodable? = nil
    ) {
        self.before = before
        self.after = after
        self.diff = diff
    }
}

public struct TerminalInfo: Codable, Sendable {
    /// Terminal URI (subscribable for full terminal state)
    public var resource: String
    /// Human-readable terminal title
    public var title: String
    /// Who currently holds this terminal
    public var claim: TerminalClaim
    /// Process exit code, if the terminal process has exited
    public var exitCode: Int?

    public init(
        resource: String,
        title: String,
        claim: TerminalClaim,
        exitCode: Int? = nil
    ) {
        self.resource = resource
        self.title = title
        self.claim = claim
        self.exitCode = exitCode
    }
}

public struct TerminalClientClaim: Codable, Sendable {
    /// Discriminant
    public var kind: TerminalClaimKind
    /// The `clientId` of the claiming client
    public var clientId: String

    public init(
        kind: TerminalClaimKind,
        clientId: String
    ) {
        self.kind = kind
        self.clientId = clientId
    }
}

public struct TerminalSessionClaim: Codable, Sendable {
    /// Discriminant
    public var kind: TerminalClaimKind
    /// Session URI that claimed the terminal
    public var session: String
    /// Optional turn identifier within the session
    public var turnId: String?
    /// Optional tool call identifier within the turn
    public var toolCallId: String?

    public init(
        kind: TerminalClaimKind,
        session: String,
        turnId: String? = nil,
        toolCallId: String? = nil
    ) {
        self.kind = kind
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
    }
}

public struct TerminalState: Codable, Sendable {
    /// Human-readable terminal title
    public var title: String
    /// Current working directory of the terminal process
    public var cwd: String?
    /// Terminal width in columns
    public var cols: Int?
    /// Terminal height in rows
    public var rows: Int?
    /// Typed content parts, replacing the flat `content: string`.
    ///
    /// Naive consumers that only need the raw VT stream can reconstruct it with:
    /// `content.map(p => p.type === 'command' ? p.output : p.value).join('')`
    ///
    /// Consumers that need command boundaries can filter by part type.
    public var content: [TerminalContentPart]
    /// Process exit code, set when the terminal process exits
    public var exitCode: Int?
    /// Who currently holds this terminal
    public var claim: TerminalClaim
    /// Whether this terminal emits `terminal/commandExecuted` and
    /// `terminal/commandFinished` actions and populates `command`-typed parts.
    ///
    /// Clients MUST check this flag before relying on command detection.
    /// Do NOT use the presence of a `command` part as a feature flag — parts
    /// are absent in the normal idle state.
    public var supportsCommandDetection: Bool?

    public init(
        title: String,
        cwd: String? = nil,
        cols: Int? = nil,
        rows: Int? = nil,
        content: [TerminalContentPart],
        exitCode: Int? = nil,
        claim: TerminalClaim,
        supportsCommandDetection: Bool? = nil
    ) {
        self.title = title
        self.cwd = cwd
        self.cols = cols
        self.rows = rows
        self.content = content
        self.exitCode = exitCode
        self.claim = claim
        self.supportsCommandDetection = supportsCommandDetection
    }
}

public struct TerminalUnclassifiedPart: Codable, Sendable {
    public var type: String
    /// Accumulated VT output. Appended to by `terminal/data` when no command is executing.
    public var value: String

    public init(
        type: String,
        value: String
    ) {
        self.type = type
        self.value = value
    }
}

public struct TerminalCommandPart: Codable, Sendable {
    public var type: String
    /// Stable id matching the `commandId` on the corresponding
    /// `terminal/commandExecuted` and `terminal/commandFinished` actions.
    public var commandId: String
    /// The command line submitted to the shell.
    public var commandLine: String
    /// Accumulated VT output. Appended to by `terminal/data` while `isComplete`
    /// is false. Shell integration escape sequences are stripped by the server.
    public var output: String
    /// Unix timestamp (ms) when execution started, as reported by the server.
    public var timestamp: Int
    /// Whether the command has finished.
    public var isComplete: Bool
    /// Shell exit code. Set at completion. `undefined` if unknown.
    public var exitCode: Int?
    /// Wall-clock duration in milliseconds. Set at completion.
    public var durationMs: Int?

    public init(
        type: String,
        commandId: String,
        commandLine: String,
        output: String,
        timestamp: Int,
        isComplete: Bool,
        exitCode: Int? = nil,
        durationMs: Int? = nil
    ) {
        self.type = type
        self.commandId = commandId
        self.commandLine = commandLine
        self.output = output
        self.timestamp = timestamp
        self.isComplete = isComplete
        self.exitCode = exitCode
        self.durationMs = durationMs
    }
}

public struct UsageInfo: Codable, Sendable {
    /// Input tokens consumed
    public var inputTokens: Int?
    /// Output tokens generated
    public var outputTokens: Int?
    /// Model used
    public var model: String?
    /// Tokens read from cache
    public var cacheReadTokens: Int?
    /// Additional provider-specific metadata for this usage report.
    /// Clients MAY look for well-known optional keys here to provide enhanced UI.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case inputTokens
        case outputTokens
        case model
        case cacheReadTokens
        case meta = "_meta"
    }

    public init(
        inputTokens: Int? = nil,
        outputTokens: Int? = nil,
        model: String? = nil,
        cacheReadTokens: Int? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.model = model
        self.cacheReadTokens = cacheReadTokens
        self.meta = meta
    }
}

public struct ErrorInfo: Codable, Sendable {
    /// Error type identifier
    public var errorType: String
    /// Human-readable error message
    public var message: String
    /// Stack trace
    public var stack: String?
    /// Additional provider-specific metadata for this error.
    /// Clients MAY look for well-known optional keys here to provide enhanced UI
    /// (e.g. a structured chat fetch error for richer, localized messaging).
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case errorType
        case message
        case stack
        case meta = "_meta"
    }

    public init(
        errorType: String,
        message: String,
        stack: String? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.errorType = errorType
        self.message = message
        self.stack = stack
        self.meta = meta
    }
}

public struct Snapshot: Codable, Sendable {
    /// The subscribed channel URI (e.g. `ahp-root://`, `ahp-session:/<uuid>`, or `ahp-chat:/<uuid>`)
    public var resource: String
    /// The current state of the resource
    public var state: SnapshotState
    /// The `serverSeq` at which this snapshot was taken. Subsequent actions will have `serverSeq > fromSeq`.
    public var fromSeq: Int

    public init(
        resource: String,
        state: SnapshotState,
        fromSeq: Int
    ) {
        self.resource = resource
        self.state = state
        self.fromSeq = fromSeq
    }
}

public struct Changeset: Codable, Sendable {
    /// Human-readable label, e.g. `"Uncommitted Changes"`.
    public var label: String
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
    public var uriTemplate: String
    /// Optional longer description.
    public var description: String?
    /// Advisory hint describing what kind of changeset this is, so clients can
    /// group, sort, or render an appropriate icon without parsing
    /// {@link uriTemplate}. Recognized values include:
    ///
    /// - `'session'`: a static, session-wide changeset covering all changes the
    /// agent has produced in this session.
    /// - `'branch'`: changes relative to a base branch (e.g. a feature branch
    /// diffed against `main`).
    /// - `'uncommitted'`: the workspace's current uncommitted changes.
    /// - `'turn'`: changes produced by a single turn. Typically paired with a
    /// `{turnId}` variable in {@link uriTemplate}.
    /// - `'compare-turns'`: a diff between two turns. Typically paired with
    /// `{originalTurnId}` and `{modifiedTurnId}` variables in
    /// {@link uriTemplate}.
    ///
    /// Implementations MAY provide additional values; clients SHOULD fall back
    /// to a reasonable default when an unknown value is encountered.
    public var changeKind: String

    public init(
        label: String,
        uriTemplate: String,
        description: String? = nil,
        changeKind: String
    ) {
        self.label = label
        self.uriTemplate = uriTemplate
        self.description = description
        self.changeKind = changeKind
    }
}

public struct ChangesetState: Codable, Sendable {
    /// Computation lifecycle.
    public var status: ChangesetStatus
    /// Present iff `status === ChangesetStatus.Error`.
    public var error: ErrorInfo?
    /// Files in this changeset, keyed by {@link ChangesetFile.id}.
    public var files: [ChangesetFile]
    /// Operations the client may invoke against this changeset. Omit when no
    /// operations are available.
    public var operations: [ChangesetOperation]?

    public init(
        status: ChangesetStatus,
        error: ErrorInfo? = nil,
        files: [ChangesetFile],
        operations: [ChangesetOperation]? = nil
    ) {
        self.status = status
        self.error = error
        self.files = files
        self.operations = operations
    }
}

public struct ChangesetFile: Codable, Sendable {
    /// Stable identifier within the changeset. Typically `after.uri`
    /// (or `before.uri` for deletions).
    public var id: String
    /// Reuses the existing {@link FileEdit} shape. Clients derive line
    /// additions, deletions, and rename/create/delete semantics from this.
    public var edit: FileEdit
    /// Server-defined opaque metadata, surfaced to operations and tooling
    /// but not interpreted by the protocol.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id
        case edit
        case meta = "_meta"
    }

    public init(
        id: String,
        edit: FileEdit,
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.edit = edit
        self.meta = meta
    }
}

public struct ChangesetOperation: Codable, Sendable {
    /// Stable identifier, unique within this changeset.
    public var id: String
    /// Human-readable button/menu label.
    public var label: String
    /// Optional longer description shown on hover or in tooltips.
    public var description: String?
    /// Where this operation can be invoked.
    public var scopes: [ChangesetOperationScope]
    /// Optional confirmation prompt to show before invoking. When present,
    /// the client MUST display this message to the user (typically in a
    /// confirmation dialog) and only invoke the operation after the user
    /// accepts. The presence of this field also signals that the operation
    /// is destructive — clients SHOULD style the affirmative button
    /// accordingly (e.g. with a warning colour).
    public var confirmation: StringOrMarkdown?
    /// Optional generic icon hint, e.g. `"check"`, `"trash"`.
    public var icon: String?
    /// Optional group identifier, used to group related operations together.
    public var group: String?
    /// Current execution status. The server sets
    /// {@link ChangesetOperationStatus.Running | Running} while an invocation
    /// is in flight, {@link ChangesetOperationStatus.Error | Error} when the
    /// most recent invocation failed, and
    /// {@link ChangesetOperationStatus.Idle | Idle} otherwise.
    ///
    /// Clients SHOULD reflect this state in the UI — e.g. disabling the
    /// control or showing a spinner while `Running`, and surfacing
    /// {@link error} while `Error`.
    public var status: ChangesetOperationStatus
    /// Cause of failure. Present iff
    /// `status === ChangesetOperationStatus.Error`; otherwise omitted.
    public var error: ErrorInfo?

    public init(
        id: String,
        label: String,
        description: String? = nil,
        scopes: [ChangesetOperationScope],
        confirmation: StringOrMarkdown? = nil,
        icon: String? = nil,
        group: String? = nil,
        status: ChangesetOperationStatus,
        error: ErrorInfo? = nil
    ) {
        self.id = id
        self.label = label
        self.description = description
        self.scopes = scopes
        self.confirmation = confirmation
        self.icon = icon
        self.group = group
        self.status = status
        self.error = error
    }
}

public struct AnnotationsSummary: Codable, Sendable {
    /// The subscribable annotations channel URI for the owning session
    /// (typically `ahp-session:/<uuid>/annotations`). Surfaced explicitly even
    /// though it is derivable from the session URI so badge UI does not need
    /// to know the derivation rule.
    public var resource: String
    /// Total number of {@link Annotation} entries in the channel.
    public var annotationCount: Int
    /// Total number of {@link AnnotationEntry} entries across every annotation.
    public var entryCount: Int

    public init(
        resource: String,
        annotationCount: Int,
        entryCount: Int
    ) {
        self.resource = resource
        self.annotationCount = annotationCount
        self.entryCount = entryCount
    }
}

public struct AnnotationsState: Codable, Sendable {
    /// Annotations in this channel, keyed by {@link Annotation.id}.
    public var annotations: [Annotation]

    public init(
        annotations: [Annotation]
    ) {
        self.annotations = annotations
    }
}

public struct Annotation: Codable, Sendable {
    /// Stable identifier within the annotations channel. Assigned by the client
    /// that dispatches the creating {@link AnnotationsSetAction}.
    public var id: String
    /// Turn that produced the file versions this annotation is anchored to.
    /// Matches a {@link Turn.id} on the owning session.
    public var turnId: String
    /// The file the annotation is anchored to.
    public var resource: String
    /// Range within {@link resource} the annotation is anchored to. When
    /// omitted the annotation is anchored to the entire file.
    public var range: TextRange?
    /// Whether the annotation has been resolved. Newly created annotations are
    /// always unresolved (`false`); a client marks an annotation resolved (or
    /// re-opens it) by dispatching an {@link AnnotationsUpdatedAction} carrying
    /// the updated flag (or an {@link AnnotationsSetAction} when replacing the
    /// whole annotation).
    public var resolved: Bool
    /// Entries in this annotation, in dispatch order (oldest first). MUST
    /// contain at least one entry.
    public var entries: [AnnotationEntry]
    /// Producer-defined opaque metadata, surfaced to tooling but not
    /// interpreted by the protocol.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id
        case turnId
        case resource
        case range
        case resolved
        case entries
        case meta = "_meta"
    }

    public init(
        id: String,
        turnId: String,
        resource: String,
        range: TextRange? = nil,
        resolved: Bool,
        entries: [AnnotationEntry],
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.turnId = turnId
        self.resource = resource
        self.range = range
        self.resolved = resolved
        self.entries = entries
        self.meta = meta
    }
}

public struct AnnotationEntry: Codable, Sendable {
    /// Stable identifier within the enclosing annotation. Assigned by the client
    /// that dispatches the {@link AnnotationsEntrySetAction} (or the enclosing
    /// {@link AnnotationsSetAction}) introducing the entry.
    public var id: String
    /// Entry body. A bare `string` is rendered as plain text; pass
    /// `{ markdown: "…" }` to opt into Markdown rendering. See
    /// {@link StringOrMarkdown}.
    public var text: StringOrMarkdown
    /// Producer-defined opaque metadata, surfaced to tooling but not
    /// interpreted by the protocol.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id
        case text
        case meta = "_meta"
    }

    public init(
        id: String,
        text: StringOrMarkdown,
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.text = text
        self.meta = meta
    }
}

public struct TelemetryCapabilities: Codable, Sendable {
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
    public var logs: String?
    /// Channel URI for OTLP spans (`otlp/exportTraces` notifications). No
    /// template variables are defined by this protocol version.
    public var traces: String?
    /// Channel URI for OTLP metric data points (`otlp/exportMetrics`
    /// notifications). No template variables are defined by this protocol
    /// version.
    public var metrics: String?

    public init(
        logs: String? = nil,
        traces: String? = nil,
        metrics: String? = nil
    ) {
        self.logs = logs
        self.traces = traces
        self.metrics = metrics
    }
}

public struct ResourceWatchState: Codable, Sendable {
    /// The URI being watched. For recursive watches this is the root of the
    /// subtree; for non-recursive watches this is the single file or
    /// directory.
    public var root: String
    /// `true` if the watcher reports changes for descendants of `root`;
    /// `false` if it only reports changes to `root` itself (and, when
    /// `root` is a directory, its direct children).
    public var recursive: Bool
    /// Optional glob patterns or paths relative to `root` to exclude from
    /// change reporting.
    public var excludes: AnyCodable?
    /// Optional glob patterns or paths relative to `root` to restrict
    /// change reporting to. Omit to report every change under `root`
    /// subject to `excludes`.
    public var includes: AnyCodable?

    public init(
        root: String,
        recursive: Bool,
        excludes: AnyCodable? = nil,
        includes: AnyCodable? = nil
    ) {
        self.root = root
        self.recursive = recursive
        self.excludes = excludes
        self.includes = includes
    }
}

public struct ResourceChange: Codable, Sendable {
    /// The URI of the resource that changed.
    public var uri: String
    /// The kind of change observed.
    public var type: ResourceChangeType

    public init(
        uri: String,
        type: ResourceChangeType
    ) {
        self.uri = uri
        self.type = type
    }
}

// MARK: - Discriminated Unions

public struct ChatOriginUser: Codable, Sendable {
    public var kind: ChatOriginKind

    public init(kind: ChatOriginKind = .user) {
        self.kind = kind
    }
}

public struct ChatOriginFork: Codable, Sendable {
    public var kind: ChatOriginKind
    public var chat: String
    public var turnId: String

    public init(kind: ChatOriginKind = .fork, chat: String, turnId: String) {
        self.kind = kind
        self.chat = chat
        self.turnId = turnId
    }
}

public struct ChatOriginTool: Codable, Sendable {
    public var kind: ChatOriginKind
    public var chat: String
    public var toolCallId: String

    public init(kind: ChatOriginKind = .tool, chat: String, toolCallId: String) {
        self.kind = kind
        self.chat = chat
        self.toolCallId = toolCallId
    }
}

public enum ChatOrigin: Codable, Sendable {
    case user(ChatOriginUser)
    case fork(ChatOriginFork)
    case tool(ChatOriginTool)

    private enum DiscriminatorCodingKeys: String, CodingKey { case kind }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)
        let discriminant = try container.decode(String.self, forKey: .kind)
        switch discriminant {
        case "user": self = .user(try ChatOriginUser(from: decoder))
        case "fork": self = .fork(try ChatOriginFork(from: decoder))
        case "tool": self = .tool(try ChatOriginTool(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unknown ChatOrigin kind: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .user(let value): try value.encode(to: encoder)
        case .fork(let value): try value.encode(to: encoder)
        case .tool(let value): try value.encode(to: encoder)
        }
    }
}

public enum ResponsePart: Codable, Sendable {
    case markdown(MarkdownResponsePart)
    case contentRef(ResourceReponsePart)
    case toolCall(ToolCallResponsePart)
    case reasoning(ReasoningResponsePart)
    case systemNotification(SystemNotificationResponsePart)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "markdown":
            self = .markdown(try MarkdownResponsePart(from: decoder))
        case "contentRef":
            self = .contentRef(try ResourceReponsePart(from: decoder))
        case "toolCall":
            self = .toolCall(try ToolCallResponsePart(from: decoder))
        case "reasoning":
            self = .reasoning(try ReasoningResponsePart(from: decoder))
        case "systemNotification":
            self = .systemNotification(try SystemNotificationResponsePart(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .markdown(let value): try value.encode(to: encoder)
        case .contentRef(let value): try value.encode(to: encoder)
        case .toolCall(let value): try value.encode(to: encoder)
        case .reasoning(let value): try value.encode(to: encoder)
        case .systemNotification(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ToolCallState: Codable, Sendable {
    case streaming(ToolCallStreamingState)
    case pendingConfirmation(ToolCallPendingConfirmationState)
    case running(ToolCallRunningState)
    case pendingResultConfirmation(ToolCallPendingResultConfirmationState)
    case completed(ToolCallCompletedState)
    case cancelled(ToolCallCancelledState)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "status"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "streaming":
            self = .streaming(try ToolCallStreamingState(from: decoder))
        case "pending-confirmation":
            self = .pendingConfirmation(try ToolCallPendingConfirmationState(from: decoder))
        case "running":
            self = .running(try ToolCallRunningState(from: decoder))
        case "pending-result-confirmation":
            self = .pendingResultConfirmation(try ToolCallPendingResultConfirmationState(from: decoder))
        case "completed":
            self = .completed(try ToolCallCompletedState(from: decoder))
        case "cancelled":
            self = .cancelled(try ToolCallCancelledState(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .streaming(let value): try value.encode(to: encoder)
        case .pendingConfirmation(let value): try value.encode(to: encoder)
        case .running(let value): try value.encode(to: encoder)
        case .pendingResultConfirmation(let value): try value.encode(to: encoder)
        case .completed(let value): try value.encode(to: encoder)
        case .cancelled(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum TerminalClaim: Codable, Sendable {
    case client(TerminalClientClaim)
    case session(TerminalSessionClaim)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "client":
            self = .client(try TerminalClientClaim(from: decoder))
        case "session":
            self = .session(try TerminalSessionClaim(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .client(let value): try value.encode(to: encoder)
        case .session(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum TerminalContentPart: Codable, Sendable {
    case unclassified(TerminalUnclassifiedPart)
    case command(TerminalCommandPart)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "unclassified":
            self = .unclassified(try TerminalUnclassifiedPart(from: decoder))
        case "command":
            self = .command(try TerminalCommandPart(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .unclassified(let value): try value.encode(to: encoder)
        case .command(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ChatInputQuestion: Codable, Sendable {
    case text(ChatInputTextQuestion)
    case number(ChatInputNumberQuestion)
    case integer(ChatInputNumberQuestion)
    case boolean(ChatInputBooleanQuestion)
    case singleSelect(ChatInputSingleSelectQuestion)
    case multiSelect(ChatInputMultiSelectQuestion)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "text":
            self = .text(try ChatInputTextQuestion(from: decoder))
        case "number":
            self = .number(try ChatInputNumberQuestion(from: decoder))
        case "integer":
            self = .integer(try ChatInputNumberQuestion(from: decoder))
        case "boolean":
            self = .boolean(try ChatInputBooleanQuestion(from: decoder))
        case "single-select":
            self = .singleSelect(try ChatInputSingleSelectQuestion(from: decoder))
        case "multi-select":
            self = .multiSelect(try ChatInputMultiSelectQuestion(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .text(let value): try value.encode(to: encoder)
        case .number(let value): try value.encode(to: encoder)
        case .integer(let value): try value.encode(to: encoder)
        case .boolean(let value): try value.encode(to: encoder)
        case .singleSelect(let value): try value.encode(to: encoder)
        case .multiSelect(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ChatInputAnswerValue: Codable, Sendable {
    case text(ChatInputTextAnswerValue)
    case number(ChatInputNumberAnswerValue)
    case boolean(ChatInputBooleanAnswerValue)
    case selected(ChatInputSelectedAnswerValue)
    case selectedMany(ChatInputSelectedManyAnswerValue)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "text":
            self = .text(try ChatInputTextAnswerValue(from: decoder))
        case "number":
            self = .number(try ChatInputNumberAnswerValue(from: decoder))
        case "boolean":
            self = .boolean(try ChatInputBooleanAnswerValue(from: decoder))
        case "selected":
            self = .selected(try ChatInputSelectedAnswerValue(from: decoder))
        case "selected-many":
            self = .selectedMany(try ChatInputSelectedManyAnswerValue(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .text(let value): try value.encode(to: encoder)
        case .number(let value): try value.encode(to: encoder)
        case .boolean(let value): try value.encode(to: encoder)
        case .selected(let value): try value.encode(to: encoder)
        case .selectedMany(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ChatInputAnswer: Codable, Sendable {
    case draft(ChatInputAnswered)
    case submitted(ChatInputAnswered)
    case skipped(ChatInputSkipped)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "state"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "draft":
            self = .draft(try ChatInputAnswered(from: decoder))
        case "submitted":
            self = .submitted(try ChatInputAnswered(from: decoder))
        case "skipped":
            self = .skipped(try ChatInputSkipped(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .draft(let value): try value.encode(to: encoder)
        case .submitted(let value): try value.encode(to: encoder)
        case .skipped(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum MessageAttachment: Codable, Sendable {
    case simple(SimpleMessageAttachment)
    case embeddedResource(MessageEmbeddedResourceAttachment)
    case resource(MessageResourceAttachment)
    case annotations(MessageAnnotationsAttachment)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "simple":
            self = .simple(try SimpleMessageAttachment(from: decoder))
        case "embeddedResource":
            self = .embeddedResource(try MessageEmbeddedResourceAttachment(from: decoder))
        case "resource":
            self = .resource(try MessageResourceAttachment(from: decoder))
        case "annotations":
            self = .annotations(try MessageAnnotationsAttachment(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .simple(let value): try value.encode(to: encoder)
        case .embeddedResource(let value): try value.encode(to: encoder)
        case .resource(let value): try value.encode(to: encoder)
        case .annotations(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum Customization: Codable, Sendable {
    case plugin(PluginCustomization)
    case directory(DirectoryCustomization)
    case mcpServer(McpServerCustomization)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "plugin":
            self = .plugin(try PluginCustomization(from: decoder))
        case "directory":
            self = .directory(try DirectoryCustomization(from: decoder))
        case "mcpServer":
            self = .mcpServer(try McpServerCustomization(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .plugin(let value): try value.encode(to: encoder)
        case .directory(let value): try value.encode(to: encoder)
        case .mcpServer(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ChildCustomization: Codable, Sendable {
    case agent(AgentCustomization)
    case skill(SkillCustomization)
    case prompt(PromptCustomization)
    case rule(RuleCustomization)
    case hook(HookCustomization)
    case mcpServer(McpServerCustomization)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "agent":
            self = .agent(try AgentCustomization(from: decoder))
        case "skill":
            self = .skill(try SkillCustomization(from: decoder))
        case "prompt":
            self = .prompt(try PromptCustomization(from: decoder))
        case "rule":
            self = .rule(try RuleCustomization(from: decoder))
        case "hook":
            self = .hook(try HookCustomization(from: decoder))
        case "mcpServer":
            self = .mcpServer(try McpServerCustomization(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .agent(let value): try value.encode(to: encoder)
        case .skill(let value): try value.encode(to: encoder)
        case .prompt(let value): try value.encode(to: encoder)
        case .rule(let value): try value.encode(to: encoder)
        case .hook(let value): try value.encode(to: encoder)
        case .mcpServer(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum CustomizationLoadState: Codable, Sendable {
    case loading(CustomizationLoadingState)
    case loaded(CustomizationLoadedState)
    case degraded(CustomizationDegradedState)
    case error(CustomizationErrorState)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "loading":
            self = .loading(try CustomizationLoadingState(from: decoder))
        case "loaded":
            self = .loaded(try CustomizationLoadedState(from: decoder))
        case "degraded":
            self = .degraded(try CustomizationDegradedState(from: decoder))
        case "error":
            self = .error(try CustomizationErrorState(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .loading(let value): try value.encode(to: encoder)
        case .loaded(let value): try value.encode(to: encoder)
        case .degraded(let value): try value.encode(to: encoder)
        case .error(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum McpServerState: Codable, Sendable {
    case starting(McpServerStartingState)
    case ready(McpServerReadyState)
    case authRequired(McpServerAuthRequiredState)
    case error(McpServerErrorState)
    case stopped(McpServerStoppedState)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "starting":
            self = .starting(try McpServerStartingState(from: decoder))
        case "ready":
            self = .ready(try McpServerReadyState(from: decoder))
        case "authRequired":
            self = .authRequired(try McpServerAuthRequiredState(from: decoder))
        case "error":
            self = .error(try McpServerErrorState(from: decoder))
        case "stopped":
            self = .stopped(try McpServerStoppedState(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown McpServerState discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .starting(let value): try value.encode(to: encoder)
        case .ready(let value): try value.encode(to: encoder)
        case .authRequired(let value): try value.encode(to: encoder)
        case .error(let value): try value.encode(to: encoder)
        case .stopped(let value): try value.encode(to: encoder)
        }
    }
}

public enum ToolCallContributor: Codable, Sendable {
    case client(ToolCallClientContributor)
    case mcp(ToolCallMcpContributor)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "client":
            self = .client(try ToolCallClientContributor(from: decoder))
        case "mcp":
            self = .mcp(try ToolCallMcpContributor(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ToolCallContributor discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .client(let value): try value.encode(to: encoder)
        case .mcp(let value): try value.encode(to: encoder)
        }
    }
}

public enum ToolResultContent: Codable, Sendable {
    case text(ToolResultTextContent)
    case embeddedResource(ToolResultEmbeddedResourceContent)
    case resource(ToolResultResourceContent)
    case fileEdit(ToolResultFileEditContent)
    case terminal(ToolResultTerminalContent)
    case subagent(ToolResultSubagentContent)
    /// Unknown or future tool result content type; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum Keys: String, CodingKey {
        case type
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: Keys.self)
        if let type = try container.decodeIfPresent(String.self, forKey: .type) {
            switch type {
            case "text":
                self = .text(try ToolResultTextContent(from: decoder))
            case "embeddedResource":
                self = .embeddedResource(try ToolResultEmbeddedResourceContent(from: decoder))
            case "resource":
                self = .resource(try ToolResultResourceContent(from: decoder))
            case "fileEdit":
                self = .fileEdit(try ToolResultFileEditContent(from: decoder))
            case "terminal":
                self = .terminal(try ToolResultTerminalContent(from: decoder))
            case "subagent":
                self = .subagent(try ToolResultSubagentContent(from: decoder))
            default:
                self = .unknown(try AnyCodable(from: decoder))
            }
        } else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: decoder.codingPath,
                    debugDescription: "ToolResultContent missing type")
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .text(let v): try v.encode(to: encoder)
        case .embeddedResource(let v): try v.encode(to: encoder)
        case .resource(let v): try v.encode(to: encoder)
        case .fileEdit(let v): try v.encode(to: encoder)
        case .terminal(let v): try v.encode(to: encoder)
        case .subagent(let v): try v.encode(to: encoder)
        case .unknown(let v): try v.encode(to: encoder)
        }
    }
}

/// The state payload of a snapshot — root, session, chat, terminal, changeset, resource-watch, or annotations state.
public enum SnapshotState: Codable, Sendable {
    case root(RootState)
    case session(SessionState)
    case chat(ChatState)
    case terminal(TerminalState)
    case changeset(ChangesetState)
    case resourceWatch(ResourceWatchState)
    case annotations(AnnotationsState)

    public init(from decoder: Decoder) throws {
        // SessionState has required `summary` field, try it first
        if let session = try? SessionState(from: decoder) {
            self = .session(session)
        } else if let terminal = try? TerminalState(from: decoder) {
            self = .terminal(terminal)
        } else if let changeset = try? ChangesetState(from: decoder) {
            self = .changeset(changeset)
        } else if let resourceWatch = try? ResourceWatchState(from: decoder) {
            self = .resourceWatch(resourceWatch)
        } else if let annotations = try? AnnotationsState(from: decoder) {
            self = .annotations(annotations)
        } else {
            self = .root(try RootState(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .root(let state): try state.encode(to: encoder)
        case .session(let state): try state.encode(to: encoder)
        case .chat(let state): try state.encode(to: encoder)
        case .terminal(let state): try state.encode(to: encoder)
        case .changeset(let state): try state.encode(to: encoder)
        case .resourceWatch(let state): try state.encode(to: encoder)
        case .annotations(let state): try state.encode(to: encoder)
        }
    }
}
