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
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

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

/// Answer lifecycle state.
public enum SessionInputAnswerState: String, Codable, Sendable {
    case draft = "draft"
    case submitted = "submitted"
    case skipped = "skipped"
}

/// Answer value kind.
public enum SessionInputAnswerValueKind: String, Codable, Sendable {
    case text = "text"
    case number = "number"
    case boolean = "boolean"
    case selected = "selected"
    case selectedMany = "selected-many"
}

/// Question/input control kind.
public enum SessionInputQuestionKind: String, Codable, Sendable {
    case text = "text"
    case number = "number"
    case integer = "integer"
    case boolean = "boolean"
    case singleSelect = "single-select"
    case multiSelect = "multi-select"
}

/// How a client completed an input request.
public enum SessionInputResponseKind: String, Codable, Sendable {
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

/// Discriminant for tool result content types.
public enum ToolResultContentType: String, Codable, Sendable {
    case text = "text"
    case embeddedResource = "embeddedResource"
    case resource = "resource"
    case fileEdit = "fileEdit"
    case terminal = "terminal"
    case subagent = "subagent"
}

/// Loading status for a server-managed customization.
public enum CustomizationStatus: String, Codable, Sendable {
    /// Plugin is being loaded
    case loading = "loading"
    /// Plugin is fully operational
    case loaded = "loaded"
    /// Plugin partially loaded but has warnings
    case degraded = "degraded"
    /// Plugin was unable to load
    case error = "error"
}

/// Discriminant for terminal claim kinds.
public enum TerminalClaimKind: String, Codable, Sendable {
    case client = "client"
    case session = "session"
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

    public init(
        agents: [AgentInfo],
        activeSessions: Int? = nil,
        terminals: [TerminalInfo]? = nil,
        config: RootConfigState? = nil
    ) {
        self.agents = agents
        self.activeSessions = activeSessions
        self.terminals = terminals
        self.config = config
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
    /// Customizations (Open Plugins) associated with this agent.
    /// 
    /// Each entry is a reference to an [Open Plugins](https://open-plugins.com/)
    /// plugin that the agent host can activate for sessions using this agent.
    public var customizations: [CustomizationRef]?

    public init(
        provider: String,
        displayName: String,
        description: String,
        models: [SessionModelInfo],
        protectedResources: [ProtectedResourceMetadata]? = nil,
        customizations: [CustomizationRef]? = nil
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
    /// The message content
    public var userMessage: UserMessage

    public init(
        id: String,
        userMessage: UserMessage
    ) {
        self.id = id
        self.userMessage = userMessage
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
    /// Completed turns
    public var turns: [Turn]
    /// Currently in-progress turn
    public var activeTurn: ActiveTurn?
    /// Message to inject into the current turn at a convenient point
    public var steeringMessage: PendingMessage?
    /// Messages to send automatically as new turns after the current turn finishes
    public var queuedMessages: [PendingMessage]?
    /// Requests for user input that are currently blocking or informing session progress
    public var inputRequests: [SessionInputRequest]?
    /// Session configuration schema and current values
    public var config: SessionConfigState?
    /// Server-provided customizations active in this session.
    /// 
    /// Client-provided customizations are available on
    /// {@link SessionActiveClient.customizations | activeClient.customizations}.
    public var customizations: [SessionCustomization]?
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
        case turns
        case activeTurn
        case steeringMessage
        case queuedMessages
        case inputRequests
        case config
        case customizations
        case meta = "_meta"
    }

    public init(
        summary: SessionSummary,
        lifecycle: SessionLifecycle,
        creationError: ErrorInfo? = nil,
        serverTools: [ToolDefinition]? = nil,
        activeClient: SessionActiveClient? = nil,
        turns: [Turn],
        activeTurn: ActiveTurn? = nil,
        steeringMessage: PendingMessage? = nil,
        queuedMessages: [PendingMessage]? = nil,
        inputRequests: [SessionInputRequest]? = nil,
        config: SessionConfigState? = nil,
        customizations: [SessionCustomization]? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.summary = summary
        self.lifecycle = lifecycle
        self.creationError = creationError
        self.serverTools = serverTools
        self.activeClient = activeClient
        self.turns = turns
        self.activeTurn = activeTurn
        self.steeringMessage = steeringMessage
        self.queuedMessages = queuedMessages
        self.inputRequests = inputRequests
        self.config = config
        self.customizations = customizations
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
    /// Customizations this client contributes to the session
    public var customizations: [CustomizationRef]?

    public init(
        clientId: String,
        displayName: String? = nil,
        tools: [ToolDefinition],
        customizations: [CustomizationRef]? = nil
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
    /// The working directory URI for this session
    public var workingDirectory: String?
    /// Files changed during this session with diff statistics
    public var diffs: [FileEdit]?

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
        workingDirectory: String? = nil,
        diffs: [FileEdit]? = nil
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
        self.workingDirectory = workingDirectory
        self.diffs = diffs
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
    /// The user's input
    public var userMessage: UserMessage
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
        userMessage: UserMessage,
        responseParts: [ResponsePart],
        usage: UsageInfo? = nil,
        state: TurnState,
        error: ErrorInfo? = nil
    ) {
        self.id = id
        self.userMessage = userMessage
        self.responseParts = responseParts
        self.usage = usage
        self.state = state
        self.error = error
    }
}

public struct ActiveTurn: Codable, Sendable {
    /// Turn identifier
    public var id: String
    /// The user's input
    public var userMessage: UserMessage
    /// All response content in stream order: text, tool calls, reasoning, and content refs.
    /// 
    /// Tool call parts include `pendingPermissions` when permissions are awaiting user approval.
    public var responseParts: [ResponsePart]
    /// Token usage info
    public var usage: UsageInfo?

    public init(
        id: String,
        userMessage: UserMessage,
        responseParts: [ResponsePart],
        usage: UsageInfo? = nil
    ) {
        self.id = id
        self.userMessage = userMessage
        self.responseParts = responseParts
        self.usage = usage
    }
}

public struct UserMessage: Codable, Sendable {
    /// Message text
    public var text: String
    /// File/selection attachments
    public var attachments: [MessageAttachment]?

    public init(
        text: String,
        attachments: [MessageAttachment]? = nil
    ) {
        self.text = text
        self.attachments = attachments
    }
}

public struct SessionInputOption: Codable, Sendable {
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

public struct SessionInputTextAnswerValue: Codable, Sendable {
    public var kind: SessionInputAnswerValueKind
    public var value: String

    public init(
        kind: SessionInputAnswerValueKind,
        value: String
    ) {
        self.kind = kind
        self.value = value
    }
}

public struct SessionInputNumberAnswerValue: Codable, Sendable {
    public var kind: SessionInputAnswerValueKind
    public var value: Double

    public init(
        kind: SessionInputAnswerValueKind,
        value: Double
    ) {
        self.kind = kind
        self.value = value
    }
}

public struct SessionInputBooleanAnswerValue: Codable, Sendable {
    public var kind: SessionInputAnswerValueKind
    public var value: Bool

    public init(
        kind: SessionInputAnswerValueKind,
        value: Bool
    ) {
        self.kind = kind
        self.value = value
    }
}

public struct SessionInputSelectedAnswerValue: Codable, Sendable {
    public var kind: SessionInputAnswerValueKind
    public var value: String
    /// Free-form text entered instead of selecting an option
    public var freeformValues: [String]?

    public init(
        kind: SessionInputAnswerValueKind,
        value: String,
        freeformValues: [String]? = nil
    ) {
        self.kind = kind
        self.value = value
        self.freeformValues = freeformValues
    }
}

public struct SessionInputSelectedManyAnswerValue: Codable, Sendable {
    public var kind: SessionInputAnswerValueKind
    public var value: [String]
    /// Free-form text entered in addition to selected options
    public var freeformValues: [String]?

    public init(
        kind: SessionInputAnswerValueKind,
        value: [String],
        freeformValues: [String]? = nil
    ) {
        self.kind = kind
        self.value = value
        self.freeformValues = freeformValues
    }
}

public struct SessionInputAnswered: Codable, Sendable {
    /// Answer state
    public var state: SessionInputAnswerState
    /// Answer value
    public var value: SessionInputAnswerValue

    public init(
        state: SessionInputAnswerState,
        value: SessionInputAnswerValue
    ) {
        self.state = state
        self.value = value
    }
}

public struct SessionInputSkipped: Codable, Sendable {
    /// Answer state
    public var state: SessionInputAnswerState
    /// Free-form reason or value captured while skipping, if any
    public var freeformValues: [String]?

    public init(
        state: SessionInputAnswerState,
        freeformValues: [String]? = nil
    ) {
        self.state = state
        self.freeformValues = freeformValues
    }
}

public struct SessionInputTextQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: SessionInputQuestionKind
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
        kind: SessionInputQuestionKind,
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

public struct SessionInputNumberQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: SessionInputQuestionKind
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
        kind: SessionInputQuestionKind,
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

public struct SessionInputBooleanQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: SessionInputQuestionKind
    /// Default boolean value
    public var defaultValue: Bool?

    public init(
        id: String,
        title: String? = nil,
        message: String,
        required: Bool? = nil,
        kind: SessionInputQuestionKind,
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

public struct SessionInputSingleSelectQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: SessionInputQuestionKind
    /// Options the user may select from
    public var options: [SessionInputOption]
    /// Whether the user may enter text instead of selecting an option
    public var allowFreeformInput: Bool?

    public init(
        id: String,
        title: String? = nil,
        message: String,
        required: Bool? = nil,
        kind: SessionInputQuestionKind,
        options: [SessionInputOption],
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

public struct SessionInputMultiSelectQuestion: Codable, Sendable {
    /// Stable question identifier used as the key in `answers`
    public var id: String
    /// Short display title
    public var title: String?
    /// Prompt shown to the user
    public var message: String
    /// Whether the user must answer this question to accept the request
    public var required: Bool?
    public var kind: SessionInputQuestionKind
    /// Options the user may select from
    public var options: [SessionInputOption]
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
        kind: SessionInputQuestionKind,
        options: [SessionInputOption],
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

public struct SessionInputRequest: Codable, Sendable {
    /// Stable request identifier
    public var id: String
    /// Display message for the request as a whole
    public var message: String?
    /// URL the user should review or open, for URL-style elicitations
    public var url: String?
    /// Ordered questions to ask the user
    public var questions: [SessionInputQuestion]?
    /// Current draft or submitted answers, keyed by question ID
    public var answers: [String: SessionInputAnswer]?

    public init(
        id: String,
        message: String? = nil,
        url: String? = nil,
        questions: [SessionInputQuestion]? = nil,
        answers: [String: SessionInputAnswer]? = nil
    ) {
        self.id = id
        self.message = message
        self.url = url
        self.questions = questions
        self.answers = answers
    }
}

public struct SimpleMessageAttachment: Codable, Sendable {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    public var label: String
    /// If defined, the start of the range in {@link UserMessage.text} that
    /// references this attachment. The range is the half-open interval
    /// `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
    /// units.
    /// 
    /// When present, `rangeEnd` MUST also be present and MUST be greater than or
    /// equal to `rangeStart`.
    public var rangeStart: Int?
    /// The end of the range in {@link UserMessage.text} that references this
    /// attachment. See {@link rangeStart}.
    public var rangeEnd: Int?
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
        case rangeStart
        case rangeEnd
        case displayKind
        case meta = "_meta"
        case type
        case modelRepresentation
    }

    public init(
        label: String,
        rangeStart: Int? = nil,
        rangeEnd: Int? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        type: MessageAttachmentKind,
        modelRepresentation: String? = nil
    ) {
        self.label = label
        self.rangeStart = rangeStart
        self.rangeEnd = rangeEnd
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
    /// If defined, the start of the range in {@link UserMessage.text} that
    /// references this attachment. The range is the half-open interval
    /// `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
    /// units.
    /// 
    /// When present, `rangeEnd` MUST also be present and MUST be greater than or
    /// equal to `rangeStart`.
    public var rangeStart: Int?
    /// The end of the range in {@link UserMessage.text} that references this
    /// attachment. See {@link rangeStart}.
    public var rangeEnd: Int?
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

    enum CodingKeys: String, CodingKey {
        case label
        case rangeStart
        case rangeEnd
        case displayKind
        case meta = "_meta"
        case type
        case data
        case contentType
    }

    public init(
        label: String,
        rangeStart: Int? = nil,
        rangeEnd: Int? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        type: MessageAttachmentKind,
        data: String,
        contentType: String
    ) {
        self.label = label
        self.rangeStart = rangeStart
        self.rangeEnd = rangeEnd
        self.displayKind = displayKind
        self.meta = meta
        self.type = type
        self.data = data
        self.contentType = contentType
    }
}

public struct MessageResourceAttachment: Codable, Sendable {
    /// A human-readable label for the attachment (e.g. the filename of a file
    /// attachment). Used for display in UI.
    public var label: String
    /// If defined, the start of the range in {@link UserMessage.text} that
    /// references this attachment. The range is the half-open interval
    /// `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
    /// units.
    /// 
    /// When present, `rangeEnd` MUST also be present and MUST be greater than or
    /// equal to `rangeStart`.
    public var rangeStart: Int?
    /// The end of the range in {@link UserMessage.text} that references this
    /// attachment. See {@link rangeStart}.
    public var rangeEnd: Int?
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

    enum CodingKeys: String, CodingKey {
        case label
        case rangeStart
        case rangeEnd
        case displayKind
        case meta = "_meta"
        case uri
        case sizeHint
        case contentType
        case type
    }

    public init(
        label: String,
        rangeStart: Int? = nil,
        rangeEnd: Int? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil,
        type: MessageAttachmentKind
    ) {
        self.label = label
        self.rangeStart = rangeStart
        self.rangeEnd = rangeEnd
        self.displayKind = displayKind
        self.meta = meta
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
        self.type = type
    }
}

public struct MarkdownResponsePart: Codable, Sendable {
    /// Discriminant
    public var kind: ResponsePartKind
    /// Part identifier, used by `session/delta` to target this part for content appends
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
    /// Part identifier, used by `session/reasoning` to target this part for content appends
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
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    /// 
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    public var toolClientId: String?
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
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
        case toolClientId
        case meta = "_meta"
        case status
        case partialInput
        case invocationMessage
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        toolClientId: String? = nil,
        meta: [String: AnyCodable]? = nil,
        status: ToolCallStatus,
        partialInput: String? = nil,
        invocationMessage: StringOrMarkdown? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.toolClientId = toolClientId
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
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    /// 
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    public var toolClientId: String?
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
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
        case toolClientId
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
        toolClientId: String? = nil,
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
        self.toolClientId = toolClientId
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
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    /// 
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    public var toolClientId: String?
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
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
        case toolClientId
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
        toolClientId: String? = nil,
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
        self.toolClientId = toolClientId
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
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    /// 
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    public var toolClientId: String?
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
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
        case toolClientId
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
        toolClientId: String? = nil,
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
        self.toolClientId = toolClientId
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
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    /// 
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    public var toolClientId: String?
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
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
        case toolClientId
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
        toolClientId: String? = nil,
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
        self.toolClientId = toolClientId
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
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    /// 
    /// When set, the identified client is responsible for executing the tool and
    /// dispatching `session/toolCallComplete` with the result.
    public var toolClientId: String?
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
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
    public var userSuggestion: UserMessage?
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case toolClientId
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
        toolClientId: String? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        status: ToolCallStatus,
        reason: ToolCallCancellationReason,
        reasonMessage: StringOrMarkdown? = nil,
        userSuggestion: UserMessage? = nil,
        selectedOption: ConfirmationOption? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.toolClientId = toolClientId
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

public struct CustomizationRef: Codable, Sendable {
    /// Plugin URI (e.g. an HTTPS URL or marketplace identifier)
    public var uri: String
    /// Human-readable name
    public var displayName: String
    /// Description of what the plugin provides
    public var description: String?
    /// Icons for the plugin
    public var icons: [Icon]?
    /// Opaque version token for this customization.
    /// 
    /// Clients SHOULD include a nonce with every customization they provide.
    /// Consumers can compare nonces to detect whether a customization has
    /// changed since it was last seen, avoiding redundant reloads or copies.
    public var nonce: String?

    public init(
        uri: String,
        displayName: String,
        description: String? = nil,
        icons: [Icon]? = nil,
        nonce: String? = nil
    ) {
        self.uri = uri
        self.displayName = displayName
        self.description = description
        self.icons = icons
        self.nonce = nonce
    }
}

public struct SessionCustomization: Codable, Sendable {
    /// The plugin this customization refers to
    public var customization: CustomizationRef
    /// Whether this customization is currently enabled
    public var enabled: Bool
    /// The `clientId` of the client that contributed this customization.
    /// Absent for server-provided customizations.
    public var clientId: String?
    /// Server-reported loading status
    public var status: CustomizationStatus?
    /// Human-readable status detail (e.g. error message or degradation warning).
    public var statusMessage: String?

    public init(
        customization: CustomizationRef,
        enabled: Bool,
        clientId: String? = nil,
        status: CustomizationStatus? = nil,
        statusMessage: String? = nil
    ) {
        self.customization = customization
        self.enabled = enabled
        self.clientId = clientId
        self.status = status
        self.statusMessage = statusMessage
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

    public init(
        inputTokens: Int? = nil,
        outputTokens: Int? = nil,
        model: String? = nil,
        cacheReadTokens: Int? = nil
    ) {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.model = model
        self.cacheReadTokens = cacheReadTokens
    }
}

public struct ErrorInfo: Codable, Sendable {
    /// Error type identifier
    public var errorType: String
    /// Human-readable error message
    public var message: String
    /// Stack trace
    public var stack: String?

    public init(
        errorType: String,
        message: String,
        stack: String? = nil
    ) {
        self.errorType = errorType
        self.message = message
        self.stack = stack
    }
}

public struct Snapshot: Codable, Sendable {
    /// The subscribed resource URI (e.g. `agenthost:/root` or `copilot:/<uuid>`)
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

// MARK: - Discriminated Unions

public enum ResponsePart: Codable, Sendable {
    case markdown(MarkdownResponsePart)
    case contentRef(ResourceReponsePart)
    case toolCall(ToolCallResponsePart)
    case reasoning(ReasoningResponsePart)
    case systemNotification(SystemNotificationResponsePart)

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
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ResponsePart discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .markdown(let value): try value.encode(to: encoder)
        case .contentRef(let value): try value.encode(to: encoder)
        case .toolCall(let value): try value.encode(to: encoder)
        case .reasoning(let value): try value.encode(to: encoder)
        case .systemNotification(let value): try value.encode(to: encoder)
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
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ToolCallState discriminant: \(discriminant)")
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
        }
    }
}

public enum TerminalClaim: Codable, Sendable {
    case client(TerminalClientClaim)
    case session(TerminalSessionClaim)

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
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown TerminalClaim discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .client(let value): try value.encode(to: encoder)
        case .session(let value): try value.encode(to: encoder)
        }
    }
}

public enum TerminalContentPart: Codable, Sendable {
    case unclassified(TerminalUnclassifiedPart)
    case command(TerminalCommandPart)

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
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown TerminalContentPart discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .unclassified(let value): try value.encode(to: encoder)
        case .command(let value): try value.encode(to: encoder)
        }
    }
}

public enum SessionInputQuestion: Codable, Sendable {
    case text(SessionInputTextQuestion)
    case number(SessionInputNumberQuestion)
    case integer(SessionInputNumberQuestion)
    case boolean(SessionInputBooleanQuestion)
    case singleSelect(SessionInputSingleSelectQuestion)
    case multiSelect(SessionInputMultiSelectQuestion)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "text":
            self = .text(try SessionInputTextQuestion(from: decoder))
        case "number":
            self = .number(try SessionInputNumberQuestion(from: decoder))
        case "integer":
            self = .integer(try SessionInputNumberQuestion(from: decoder))
        case "boolean":
            self = .boolean(try SessionInputBooleanQuestion(from: decoder))
        case "single-select":
            self = .singleSelect(try SessionInputSingleSelectQuestion(from: decoder))
        case "multi-select":
            self = .multiSelect(try SessionInputMultiSelectQuestion(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown SessionInputQuestion discriminant: \(discriminant)")
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
        }
    }
}

public enum SessionInputAnswerValue: Codable, Sendable {
    case text(SessionInputTextAnswerValue)
    case number(SessionInputNumberAnswerValue)
    case boolean(SessionInputBooleanAnswerValue)
    case selected(SessionInputSelectedAnswerValue)
    case selectedMany(SessionInputSelectedManyAnswerValue)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "text":
            self = .text(try SessionInputTextAnswerValue(from: decoder))
        case "number":
            self = .number(try SessionInputNumberAnswerValue(from: decoder))
        case "boolean":
            self = .boolean(try SessionInputBooleanAnswerValue(from: decoder))
        case "selected":
            self = .selected(try SessionInputSelectedAnswerValue(from: decoder))
        case "selected-many":
            self = .selectedMany(try SessionInputSelectedManyAnswerValue(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown SessionInputAnswerValue discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .text(let value): try value.encode(to: encoder)
        case .number(let value): try value.encode(to: encoder)
        case .boolean(let value): try value.encode(to: encoder)
        case .selected(let value): try value.encode(to: encoder)
        case .selectedMany(let value): try value.encode(to: encoder)
        }
    }
}

public enum SessionInputAnswer: Codable, Sendable {
    case draft(SessionInputAnswered)
    case submitted(SessionInputAnswered)
    case skipped(SessionInputSkipped)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "state"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "draft":
            self = .draft(try SessionInputAnswered(from: decoder))
        case "submitted":
            self = .submitted(try SessionInputAnswered(from: decoder))
        case "skipped":
            self = .skipped(try SessionInputSkipped(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown SessionInputAnswer discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .draft(let value): try value.encode(to: encoder)
        case .submitted(let value): try value.encode(to: encoder)
        case .skipped(let value): try value.encode(to: encoder)
        }
    }
}

public enum MessageAttachment: Codable, Sendable {
    case simple(SimpleMessageAttachment)
    case embeddedResource(MessageEmbeddedResourceAttachment)
    case resource(MessageResourceAttachment)

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
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown MessageAttachment discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .simple(let value): try value.encode(to: encoder)
        case .embeddedResource(let value): try value.encode(to: encoder)
        case .resource(let value): try value.encode(to: encoder)
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
                throw DecodingError.dataCorruptedError(
                    forKey: .type, in: container,
                    debugDescription: "Unknown ToolResultContent type: \(type)"
                )
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
        }
    }
}

/// The state payload of a snapshot — root state, session state, or terminal state.
public enum SnapshotState: Codable, Sendable {
    case root(RootState)
    case session(SessionState)
    case terminal(TerminalState)

    public init(from decoder: Decoder) throws {
        // SessionState has required `summary` field, try it first
        if let session = try? SessionState(from: decoder) {
            self = .session(session)
        } else if let terminal = try? TerminalState(from: decoder) {
            self = .terminal(terminal)
        } else {
            self = .root(try RootState(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .root(let state): try state.encode(to: encoder)
        case .session(let state): try state.encode(to: encoder)
        case .terminal(let state): try state.encode(to: encoder)
        }
    }
}
