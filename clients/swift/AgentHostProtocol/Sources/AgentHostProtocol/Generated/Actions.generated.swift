// Generated from types/*.ts — do not edit

import Foundation

// MARK: - ActionType

/// Discriminant values for all state actions.
public enum ActionType: String, Codable, Sendable {
    case rootAgentsChanged = "root/agentsChanged"
    case rootActiveSessionsChanged = "root/activeSessionsChanged"
    case sessionReady = "session/ready"
    case sessionCreationFailed = "session/creationFailed"
    case sessionTurnStarted = "session/turnStarted"
    case sessionDelta = "session/delta"
    case sessionResponsePart = "session/responsePart"
    case sessionToolCallStart = "session/toolCallStart"
    case sessionToolCallDelta = "session/toolCallDelta"
    case sessionToolCallReady = "session/toolCallReady"
    case sessionToolCallConfirmed = "session/toolCallConfirmed"
    case sessionToolCallComplete = "session/toolCallComplete"
    case sessionToolCallResultConfirmed = "session/toolCallResultConfirmed"
    case sessionToolCallContentChanged = "session/toolCallContentChanged"
    case sessionTurnComplete = "session/turnComplete"
    case sessionTurnCancelled = "session/turnCancelled"
    case sessionError = "session/error"
    case sessionTitleChanged = "session/titleChanged"
    case sessionUsage = "session/usage"
    case sessionReasoning = "session/reasoning"
    case sessionModelChanged = "session/modelChanged"
    case sessionServerToolsChanged = "session/serverToolsChanged"
    case sessionActiveClientChanged = "session/activeClientChanged"
    case sessionActiveClientToolsChanged = "session/activeClientToolsChanged"
    case sessionPendingMessageSet = "session/pendingMessageSet"
    case sessionPendingMessageRemoved = "session/pendingMessageRemoved"
    case sessionQueuedMessagesReordered = "session/queuedMessagesReordered"
    case sessionInputRequested = "session/inputRequested"
    case sessionInputAnswerChanged = "session/inputAnswerChanged"
    case sessionInputCompleted = "session/inputCompleted"
    case sessionCustomizationsChanged = "session/customizationsChanged"
    case sessionCustomizationToggled = "session/customizationToggled"
    case sessionCustomizationUpdated = "session/customizationUpdated"
    case sessionTruncated = "session/truncated"
    case sessionIsReadChanged = "session/isReadChanged"
    case sessionIsArchivedChanged = "session/isArchivedChanged"
    case sessionActivityChanged = "session/activityChanged"
    case sessionDiffsChanged = "session/diffsChanged"
    case sessionConfigChanged = "session/configChanged"
    case sessionMetaChanged = "session/metaChanged"
    case rootTerminalsChanged = "root/terminalsChanged"
    case rootConfigChanged = "root/configChanged"
    case terminalData = "terminal/data"
    case terminalInput = "terminal/input"
    case terminalResized = "terminal/resized"
    case terminalClaimed = "terminal/claimed"
    case terminalTitleChanged = "terminal/titleChanged"
    case terminalCwdChanged = "terminal/cwdChanged"
    case terminalExited = "terminal/exited"
    case terminalCleared = "terminal/cleared"
    case terminalCommandDetectionAvailable = "terminal/commandDetectionAvailable"
    case terminalCommandExecuted = "terminal/commandExecuted"
    case terminalCommandFinished = "terminal/commandFinished"
}

// MARK: - Action Infrastructure

public struct ActionOrigin: Codable, Sendable {
    public var clientId: String
    public var clientSeq: Int

    public init(
        clientId: String,
        clientSeq: Int
    ) {
        self.clientId = clientId
        self.clientSeq = clientSeq
    }
}

public struct ActionEnvelope: Codable, Sendable {
    public var action: StateAction
    public var serverSeq: Int
    public var origin: ActionOrigin?
    public var rejectionReason: String?

    public init(
        action: StateAction,
        serverSeq: Int,
        origin: ActionOrigin? = nil,
        rejectionReason: String? = nil
    ) {
        self.action = action
        self.serverSeq = serverSeq
        self.origin = origin
        self.rejectionReason = rejectionReason
    }
}

// MARK: - Action Types

public struct RootAgentsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Updated agent list
    public var agents: [AgentInfo]

    public init(
        type: ActionType,
        agents: [AgentInfo]
    ) {
        self.type = type
        self.agents = agents
    }
}

public struct RootActiveSessionsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Current count of active sessions
    public var activeSessions: Int

    public init(
        type: ActionType,
        activeSessions: Int
    ) {
        self.type = type
        self.activeSessions = activeSessions
    }
}

public struct SessionReadyAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String

    public init(
        type: ActionType,
        session: String
    ) {
        self.type = type
        self.session = session
    }
}

public struct SessionCreationFailedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Error details
    public var error: ErrorInfo

    public init(
        type: ActionType,
        session: String,
        error: ErrorInfo
    ) {
        self.type = type
        self.session = session
        self.error = error
    }
}

public struct SessionTurnStartedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// User's message
    public var userMessage: UserMessage
    /// If this turn was auto-started from a queued message, the ID of that message
    public var queuedMessageId: String?

    public init(
        type: ActionType,
        session: String,
        turnId: String,
        userMessage: UserMessage,
        queuedMessageId: String? = nil
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.userMessage = userMessage
        self.queuedMessageId = queuedMessageId
    }
}

public struct SessionDeltaAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Identifier of the response part to append to
    public var partId: String
    /// Text chunk
    public var content: String

    public init(
        type: ActionType,
        session: String,
        turnId: String,
        partId: String,
        content: String
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.partId = partId
        self.content = content
    }
}

public struct SessionResponsePartAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Response part (markdown or content ref)
    public var part: ResponsePart

    public init(
        type: ActionType,
        session: String,
        turnId: String,
        part: ResponsePart
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.part = part
    }
}

public struct SessionToolCallStartAction: Codable, Sendable {
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    public var meta: [String: AnyCodable]?
    public var type: ActionType
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// If this tool is provided by a client, the `clientId` of the owning client.
    /// Absent for server-side tools.
    public var toolClientId: String?

    enum CodingKeys: String, CodingKey {
        case session
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case toolName
        case displayName
        case toolClientId
    }

    public init(
        session: String,
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        toolName: String,
        displayName: String,
        toolClientId: String? = nil
    ) {
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.toolName = toolName
        self.displayName = displayName
        self.toolClientId = toolClientId
    }
}

public struct SessionToolCallDeltaAction: Codable, Sendable {
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    public var meta: [String: AnyCodable]?
    public var type: ActionType
    /// Partial parameter content to append
    public var content: String
    /// Updated progress message
    public var invocationMessage: StringOrMarkdown?

    enum CodingKeys: String, CodingKey {
        case session
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case content
        case invocationMessage
    }

    public init(
        session: String,
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        content: String,
        invocationMessage: StringOrMarkdown? = nil
    ) {
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.content = content
        self.invocationMessage = invocationMessage
    }
}

public struct SessionToolCallReadyAction: Codable, Sendable {
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    public var meta: [String: AnyCodable]?
    public var type: ActionType
    /// Message describing what the tool will do or what confirmation is needed
    public var invocationMessage: StringOrMarkdown
    /// Raw tool input
    public var toolInput: String?
    /// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
    public var confirmationTitle: StringOrMarkdown?
    /// File edits that this tool call will perform, for preview before confirmation
    public var edits: AnyCodable?
    /// Whether the agent host allows the client to edit the tool's input parameters before confirming
    public var editable: Bool?
    /// If set, the tool was auto-confirmed and transitions directly to `running`
    public var confirmed: ToolCallConfirmationReason?
    /// Options the server offers for this confirmation. When present, the client
    /// SHOULD render these instead of a plain approve/deny UI. Each option
    /// belongs to a {@link ConfirmationOptionGroup} so the client can still
    /// categorise the choices.
    public var options: [ConfirmationOption]?

    enum CodingKeys: String, CodingKey {
        case session
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case invocationMessage
        case toolInput
        case confirmationTitle
        case edits
        case editable
        case confirmed
        case options
    }

    public init(
        session: String,
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        confirmationTitle: StringOrMarkdown? = nil,
        edits: AnyCodable? = nil,
        editable: Bool? = nil,
        confirmed: ToolCallConfirmationReason? = nil,
        options: [ConfirmationOption]? = nil
    ) {
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.confirmationTitle = confirmationTitle
        self.edits = edits
        self.editable = editable
        self.confirmed = confirmed
        self.options = options
    }
}

/// Client approves or denies a pending tool call (merged approved + denied variants).
public struct SessionToolCallConfirmedAction: Codable, Sendable {
    /// Action type discriminant
    public var type: String
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Whether the tool call was approved
    public var approved: Bool
    /// How the tool was confirmed (present when approved)
    public var confirmed: ToolCallConfirmationReason?
    /// Edited tool input parameters, if the client modified them before confirming
    public var editedToolInput: String?
    /// Why the tool was cancelled (present when denied)
    public var reason: ToolCallCancellationReason?
    /// What the user suggested instead (present when denied)
    public var userSuggestion: UserMessage?
    /// Explanation for the denial
    public var reasonMessage: StringOrMarkdown?
    /// ID of the selected confirmation option, if the server provided options
    public var selectedOptionId: String?
    /// Additional provider-specific metadata
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type, session, turnId, toolCallId, approved, confirmed, editedToolInput, reason, userSuggestion, reasonMessage, selectedOptionId
        case meta = "_meta"
    }

    public init(
        type: String = "session/toolCallConfirmed",
        session: String,
        turnId: String,
        toolCallId: String,
        approved: Bool,
        confirmed: ToolCallConfirmationReason? = nil,
        editedToolInput: String? = nil,
        reason: ToolCallCancellationReason? = nil,
        userSuggestion: UserMessage? = nil,
        reasonMessage: StringOrMarkdown? = nil,
        selectedOptionId: String? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.approved = approved
        self.confirmed = confirmed
        self.editedToolInput = editedToolInput
        self.reason = reason
        self.userSuggestion = userSuggestion
        self.reasonMessage = reasonMessage
        self.selectedOptionId = selectedOptionId
        self.meta = meta
    }
}

public struct SessionToolCallCompleteAction: Codable, Sendable {
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    public var meta: [String: AnyCodable]?
    public var type: ActionType
    /// Execution result
    public var result: ToolCallResult
    /// If true, the result requires client approval before finalizing
    public var requiresResultConfirmation: Bool?

    enum CodingKeys: String, CodingKey {
        case session
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case result
        case requiresResultConfirmation
    }

    public init(
        session: String,
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        result: ToolCallResult,
        requiresResultConfirmation: Bool? = nil
    ) {
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.result = result
        self.requiresResultConfirmation = requiresResultConfirmation
    }
}

public struct SessionToolCallResultConfirmedAction: Codable, Sendable {
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    public var meta: [String: AnyCodable]?
    public var type: ActionType
    /// Whether the result was approved
    public var approved: Bool

    enum CodingKeys: String, CodingKey {
        case session
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case approved
    }

    public init(
        session: String,
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        approved: Bool
    ) {
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.approved = approved
    }
}

public struct SessionTurnCompleteAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String

    public init(
        type: ActionType,
        session: String,
        turnId: String
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
    }
}

public struct SessionTurnCancelledAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String

    public init(
        type: ActionType,
        session: String,
        turnId: String
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
    }
}

public struct SessionErrorAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Error details
    public var error: ErrorInfo

    public init(
        type: ActionType,
        session: String,
        turnId: String,
        error: ErrorInfo
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.error = error
    }
}

public struct SessionTitleChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// New title
    public var title: String

    public init(
        type: ActionType,
        session: String,
        title: String
    ) {
        self.type = type
        self.session = session
        self.title = title
    }
}

public struct SessionUsageAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Token usage data
    public var usage: UsageInfo

    public init(
        type: ActionType,
        session: String,
        turnId: String,
        usage: UsageInfo
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.usage = usage
    }
}

public struct SessionReasoningAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Identifier of the reasoning response part to append to
    public var partId: String
    /// Reasoning text chunk
    public var content: String

    public init(
        type: ActionType,
        session: String,
        turnId: String,
        partId: String,
        content: String
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
        self.partId = partId
        self.content = content
    }
}

public struct SessionModelChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// New model selection
    public var model: ModelSelection

    public init(
        type: ActionType,
        session: String,
        model: ModelSelection
    ) {
        self.type = type
        self.session = session
        self.model = model
    }
}

public struct SessionIsReadChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Whether the session has been read
    public var isRead: Bool

    public init(
        type: ActionType,
        session: String,
        isRead: Bool
    ) {
        self.type = type
        self.session = session
        self.isRead = isRead
    }
}

public struct SessionIsArchivedChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Whether the session is archived
    public var isArchived: Bool

    public init(
        type: ActionType,
        session: String,
        isArchived: Bool
    ) {
        self.type = type
        self.session = session
        self.isArchived = isArchived
    }
}

public struct SessionActivityChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Human-readable description of current activity, or `undefined` to clear
    public var activity: String?

    public init(
        type: ActionType,
        session: String,
        activity: String? = nil
    ) {
        self.type = type
        self.session = session
        self.activity = activity
    }
}

public struct SessionServerToolsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Updated server tools list (full replacement)
    public var tools: [ToolDefinition]

    public init(
        type: ActionType,
        session: String,
        tools: [ToolDefinition]
    ) {
        self.type = type
        self.session = session
        self.tools = tools
    }
}

public struct SessionActiveClientChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// The new active client, or `null` to unset
    public var activeClient: SessionActiveClient?

    public init(
        type: ActionType,
        session: String,
        activeClient: SessionActiveClient? = nil
    ) {
        self.type = type
        self.session = session
        self.activeClient = activeClient
    }
}

public struct SessionActiveClientToolsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Updated client tools list (full replacement)
    public var tools: [ToolDefinition]

    public init(
        type: ActionType,
        session: String,
        tools: [ToolDefinition]
    ) {
        self.type = type
        self.session = session
        self.tools = tools
    }
}

public struct SessionPendingMessageSetAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Whether this is a steering or queued message
    public var kind: PendingMessageKind
    /// Unique identifier for this pending message
    public var id: String
    /// The message content
    public var userMessage: UserMessage

    public init(
        type: ActionType,
        session: String,
        kind: PendingMessageKind,
        id: String,
        userMessage: UserMessage
    ) {
        self.type = type
        self.session = session
        self.kind = kind
        self.id = id
        self.userMessage = userMessage
    }
}

public struct SessionPendingMessageRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Whether this is a steering or queued message
    public var kind: PendingMessageKind
    /// Identifier of the pending message to remove
    public var id: String

    public init(
        type: ActionType,
        session: String,
        kind: PendingMessageKind,
        id: String
    ) {
        self.type = type
        self.session = session
        self.kind = kind
        self.id = id
    }
}

public struct SessionQueuedMessagesReorderedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Queued message IDs in the desired order
    public var order: [String]

    public init(
        type: ActionType,
        session: String,
        order: [String]
    ) {
        self.type = type
        self.session = session
        self.order = order
    }
}

public struct SessionInputRequestedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Input request to create or replace
    public var request: SessionInputRequest

    public init(
        type: ActionType,
        session: String,
        request: SessionInputRequest
    ) {
        self.type = type
        self.session = session
        self.request = request
    }
}

public struct SessionInputAnswerChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Input request identifier
    public var requestId: String
    /// Question identifier within the input request
    public var questionId: String
    /// Updated answer, or `undefined` to clear an answer draft
    public var answer: SessionInputAnswer?

    public init(
        type: ActionType,
        session: String,
        requestId: String,
        questionId: String,
        answer: SessionInputAnswer? = nil
    ) {
        self.type = type
        self.session = session
        self.requestId = requestId
        self.questionId = questionId
        self.answer = answer
    }
}

public struct SessionInputCompletedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Input request identifier
    public var requestId: String
    /// Completion outcome
    public var response: SessionInputResponseKind
    /// Optional final answer replacement, keyed by question ID
    public var answers: [String: SessionInputAnswer]?

    public init(
        type: ActionType,
        session: String,
        requestId: String,
        response: SessionInputResponseKind,
        answers: [String: SessionInputAnswer]? = nil
    ) {
        self.type = type
        self.session = session
        self.requestId = requestId
        self.response = response
        self.answers = answers
    }
}

public struct SessionCustomizationsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Updated customization list (full replacement)
    public var customizations: [SessionCustomization]

    public init(
        type: ActionType,
        session: String,
        customizations: [SessionCustomization]
    ) {
        self.type = type
        self.session = session
        self.customizations = customizations
    }
}

public struct SessionCustomizationToggledAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// The URI of the customization to toggle
    public var uri: String
    /// Whether to enable or disable the customization
    public var enabled: Bool

    public init(
        type: ActionType,
        session: String,
        uri: String,
        enabled: Bool
    ) {
        self.type = type
        self.session = session
        self.uri = uri
        self.enabled = enabled
    }
}

public struct SessionCustomizationUpdatedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// The customization to update or insert (matched by `customization.uri`)
    public var customization: CustomizationRef
    /// New enabled state (defaults to `false` on insert)
    public var enabled: Bool?
    /// New loading status
    public var status: CustomizationStatus?
    /// New human-readable status detail
    public var statusMessage: String?

    public init(
        type: ActionType,
        session: String,
        customization: CustomizationRef,
        enabled: Bool? = nil,
        status: CustomizationStatus? = nil,
        statusMessage: String? = nil
    ) {
        self.type = type
        self.session = session
        self.customization = customization
        self.enabled = enabled
        self.status = status
        self.statusMessage = statusMessage
    }
}

public struct SessionTruncatedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Keep turns up to and including this turn. Omit to clear all turns.
    public var turnId: String?

    public init(
        type: ActionType,
        session: String,
        turnId: String? = nil
    ) {
        self.type = type
        self.session = session
        self.turnId = turnId
    }
}

public struct SessionDiffsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Updated file diffs for the session
    public var diffs: [FileEdit]

    public init(
        type: ActionType,
        session: String,
        diffs: [FileEdit]
    ) {
        self.type = type
        self.session = session
        self.diffs = diffs
    }
}

public struct SessionConfigChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// Updated config values
    public var config: [String: AnyCodable]
    /// When `true`, replaces all config values instead of merging
    public var replace: Bool?

    public init(
        type: ActionType,
        session: String,
        config: [String: AnyCodable],
        replace: Bool? = nil
    ) {
        self.type = type
        self.session = session
        self.config = config
        self.replace = replace
    }
}

public struct SessionMetaChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Session URI
    public var session: String
    /// New `_meta` payload, or `undefined` to clear it
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case session
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        session: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.session = session
        self.meta = meta
    }
}

public struct SessionToolCallContentChangedAction: Codable, Sendable {
    /// Session URI
    public var session: String
    /// Turn identifier
    public var turnId: String
    /// Tool call identifier
    public var toolCallId: String
    /// Additional provider-specific metadata for this tool call.
    /// 
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `ptyTerminal` key with `{ input: string; output: string }`
    /// indicates the tool operated on a terminal (both `input` and `output` may
    /// contain escape sequences).
    public var meta: [String: AnyCodable]?
    public var type: ActionType
    /// The current partial content for the running tool call
    public var content: [ToolResultContent]

    enum CodingKeys: String, CodingKey {
        case session
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case content
    }

    public init(
        session: String,
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        content: [ToolResultContent]
    ) {
        self.session = session
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.content = content
    }
}

public struct RootTerminalsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Updated terminal list (full replacement)
    public var terminals: [TerminalInfo]

    public init(
        type: ActionType,
        terminals: [TerminalInfo]
    ) {
        self.type = type
        self.terminals = terminals
    }
}

public struct RootConfigChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Updated config values
    public var config: [String: AnyCodable]
    /// When `true`, replaces all config values instead of merging
    public var replace: Bool?

    public init(
        type: ActionType,
        config: [String: AnyCodable],
        replace: Bool? = nil
    ) {
        self.type = type
        self.config = config
        self.replace = replace
    }
}

public struct TerminalDataAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// Output data (may contain ANSI escape sequences)
    public var data: String

    public init(
        type: ActionType,
        terminal: String,
        data: String
    ) {
        self.type = type
        self.terminal = terminal
        self.data = data
    }
}

public struct TerminalInputAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// Input data to send to the pty
    public var data: String

    public init(
        type: ActionType,
        terminal: String,
        data: String
    ) {
        self.type = type
        self.terminal = terminal
        self.data = data
    }
}

public struct TerminalResizedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// Terminal width in columns
    public var cols: Int
    /// Terminal height in rows
    public var rows: Int

    public init(
        type: ActionType,
        terminal: String,
        cols: Int,
        rows: Int
    ) {
        self.type = type
        self.terminal = terminal
        self.cols = cols
        self.rows = rows
    }
}

public struct TerminalClaimedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// The new claim
    public var claim: TerminalClaim

    public init(
        type: ActionType,
        terminal: String,
        claim: TerminalClaim
    ) {
        self.type = type
        self.terminal = terminal
        self.claim = claim
    }
}

public struct TerminalTitleChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// New terminal title
    public var title: String

    public init(
        type: ActionType,
        terminal: String,
        title: String
    ) {
        self.type = type
        self.terminal = terminal
        self.title = title
    }
}

public struct TerminalCwdChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// New working directory
    public var cwd: String

    public init(
        type: ActionType,
        terminal: String,
        cwd: String
    ) {
        self.type = type
        self.terminal = terminal
        self.cwd = cwd
    }
}

public struct TerminalExitedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// Process exit code. `undefined` if the process was killed without an exit code.
    public var exitCode: Int?

    public init(
        type: ActionType,
        terminal: String,
        exitCode: Int? = nil
    ) {
        self.type = type
        self.terminal = terminal
        self.exitCode = exitCode
    }
}

public struct TerminalClearedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String

    public init(
        type: ActionType,
        terminal: String
    ) {
        self.type = type
        self.terminal = terminal
    }
}

public struct TerminalCommandDetectionAvailableAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String

    public init(
        type: ActionType,
        terminal: String
    ) {
        self.type = type
        self.terminal = terminal
    }
}

public struct TerminalCommandExecutedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// Stable identifier for this command, scoped to the terminal URI.
    /// Allows correlating `commandExecuted` → `commandFinished` pairs.
    public var commandId: String
    /// The command line text that was submitted
    public var commandLine: String
    /// Unix timestamp (ms) of when the command started executing, as measured
    /// on the server.
    public var timestamp: Int

    public init(
        type: ActionType,
        terminal: String,
        commandId: String,
        commandLine: String,
        timestamp: Int
    ) {
        self.type = type
        self.terminal = terminal
        self.commandId = commandId
        self.commandLine = commandLine
        self.timestamp = timestamp
    }
}

public struct TerminalCommandFinishedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal URI
    public var terminal: String
    /// Matches the `commandId` from the corresponding `commandExecuted`
    public var commandId: String
    /// Shell exit code. `undefined` if the shell did not report one.
    public var exitCode: Int?
    /// Wall-clock duration of the command in milliseconds, as measured by the
    /// shell integration script on the server side.
    public var durationMs: Int?

    public init(
        type: ActionType,
        terminal: String,
        commandId: String,
        exitCode: Int? = nil,
        durationMs: Int? = nil
    ) {
        self.type = type
        self.terminal = terminal
        self.commandId = commandId
        self.exitCode = exitCode
        self.durationMs = durationMs
    }
}

// MARK: - StateAction Union

/// Discriminated union of all state actions.
public enum StateAction: Codable, Sendable {
    case rootAgentsChanged(RootAgentsChangedAction)
    case rootActiveSessionsChanged(RootActiveSessionsChangedAction)
    case sessionReady(SessionReadyAction)
    case sessionCreationFailed(SessionCreationFailedAction)
    case sessionTurnStarted(SessionTurnStartedAction)
    case sessionDelta(SessionDeltaAction)
    case sessionResponsePart(SessionResponsePartAction)
    case sessionToolCallStart(SessionToolCallStartAction)
    case sessionToolCallDelta(SessionToolCallDeltaAction)
    case sessionToolCallReady(SessionToolCallReadyAction)
    case sessionToolCallConfirmed(SessionToolCallConfirmedAction)
    case sessionToolCallComplete(SessionToolCallCompleteAction)
    case sessionToolCallResultConfirmed(SessionToolCallResultConfirmedAction)
    case sessionTurnComplete(SessionTurnCompleteAction)
    case sessionTurnCancelled(SessionTurnCancelledAction)
    case sessionError(SessionErrorAction)
    case sessionTitleChanged(SessionTitleChangedAction)
    case sessionUsage(SessionUsageAction)
    case sessionReasoning(SessionReasoningAction)
    case sessionModelChanged(SessionModelChangedAction)
    case sessionIsReadChanged(SessionIsReadChangedAction)
    case sessionIsArchivedChanged(SessionIsArchivedChangedAction)
    case sessionActivityChanged(SessionActivityChangedAction)
    case sessionServerToolsChanged(SessionServerToolsChangedAction)
    case sessionActiveClientChanged(SessionActiveClientChangedAction)
    case sessionActiveClientToolsChanged(SessionActiveClientToolsChangedAction)
    case sessionPendingMessageSet(SessionPendingMessageSetAction)
    case sessionPendingMessageRemoved(SessionPendingMessageRemovedAction)
    case sessionQueuedMessagesReordered(SessionQueuedMessagesReorderedAction)
    case sessionInputRequested(SessionInputRequestedAction)
    case sessionInputAnswerChanged(SessionInputAnswerChangedAction)
    case sessionInputCompleted(SessionInputCompletedAction)
    case sessionCustomizationsChanged(SessionCustomizationsChangedAction)
    case sessionCustomizationToggled(SessionCustomizationToggledAction)
    case sessionCustomizationUpdated(SessionCustomizationUpdatedAction)
    case sessionTruncated(SessionTruncatedAction)
    case sessionDiffsChanged(SessionDiffsChangedAction)
    case sessionConfigChanged(SessionConfigChangedAction)
    case sessionMetaChanged(SessionMetaChangedAction)
    case sessionToolCallContentChanged(SessionToolCallContentChangedAction)
    case rootTerminalsChanged(RootTerminalsChangedAction)
    case rootConfigChanged(RootConfigChangedAction)
    case terminalData(TerminalDataAction)
    case terminalInput(TerminalInputAction)
    case terminalResized(TerminalResizedAction)
    case terminalClaimed(TerminalClaimedAction)
    case terminalTitleChanged(TerminalTitleChangedAction)
    case terminalCwdChanged(TerminalCwdChangedAction)
    case terminalExited(TerminalExitedAction)
    case terminalCleared(TerminalClearedAction)
    case terminalCommandDetectionAvailable(TerminalCommandDetectionAvailableAction)
    case terminalCommandExecuted(TerminalCommandExecutedAction)
    case terminalCommandFinished(TerminalCommandFinishedAction)
    /// Unknown or future action type; reducers treat this as a no-op.
    case unknown(type: String)

    private enum TypeKey: String, CodingKey { case type }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: TypeKey.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "root/agentsChanged":
            self = .rootAgentsChanged(try RootAgentsChangedAction(from: decoder))
        case "root/activeSessionsChanged":
            self = .rootActiveSessionsChanged(try RootActiveSessionsChangedAction(from: decoder))
        case "session/ready":
            self = .sessionReady(try SessionReadyAction(from: decoder))
        case "session/creationFailed":
            self = .sessionCreationFailed(try SessionCreationFailedAction(from: decoder))
        case "session/turnStarted":
            self = .sessionTurnStarted(try SessionTurnStartedAction(from: decoder))
        case "session/delta":
            self = .sessionDelta(try SessionDeltaAction(from: decoder))
        case "session/responsePart":
            self = .sessionResponsePart(try SessionResponsePartAction(from: decoder))
        case "session/toolCallStart":
            self = .sessionToolCallStart(try SessionToolCallStartAction(from: decoder))
        case "session/toolCallDelta":
            self = .sessionToolCallDelta(try SessionToolCallDeltaAction(from: decoder))
        case "session/toolCallReady":
            self = .sessionToolCallReady(try SessionToolCallReadyAction(from: decoder))
        case "session/toolCallConfirmed":
            self = .sessionToolCallConfirmed(try SessionToolCallConfirmedAction(from: decoder))
        case "session/toolCallComplete":
            self = .sessionToolCallComplete(try SessionToolCallCompleteAction(from: decoder))
        case "session/toolCallResultConfirmed":
            self = .sessionToolCallResultConfirmed(try SessionToolCallResultConfirmedAction(from: decoder))
        case "session/turnComplete":
            self = .sessionTurnComplete(try SessionTurnCompleteAction(from: decoder))
        case "session/turnCancelled":
            self = .sessionTurnCancelled(try SessionTurnCancelledAction(from: decoder))
        case "session/error":
            self = .sessionError(try SessionErrorAction(from: decoder))
        case "session/titleChanged":
            self = .sessionTitleChanged(try SessionTitleChangedAction(from: decoder))
        case "session/usage":
            self = .sessionUsage(try SessionUsageAction(from: decoder))
        case "session/reasoning":
            self = .sessionReasoning(try SessionReasoningAction(from: decoder))
        case "session/modelChanged":
            self = .sessionModelChanged(try SessionModelChangedAction(from: decoder))
        case "session/isReadChanged":
            self = .sessionIsReadChanged(try SessionIsReadChangedAction(from: decoder))
        case "session/isArchivedChanged":
            self = .sessionIsArchivedChanged(try SessionIsArchivedChangedAction(from: decoder))
        case "session/activityChanged":
            self = .sessionActivityChanged(try SessionActivityChangedAction(from: decoder))
        case "session/serverToolsChanged":
            self = .sessionServerToolsChanged(try SessionServerToolsChangedAction(from: decoder))
        case "session/activeClientChanged":
            self = .sessionActiveClientChanged(try SessionActiveClientChangedAction(from: decoder))
        case "session/activeClientToolsChanged":
            self = .sessionActiveClientToolsChanged(try SessionActiveClientToolsChangedAction(from: decoder))
        case "session/pendingMessageSet":
            self = .sessionPendingMessageSet(try SessionPendingMessageSetAction(from: decoder))
        case "session/pendingMessageRemoved":
            self = .sessionPendingMessageRemoved(try SessionPendingMessageRemovedAction(from: decoder))
        case "session/queuedMessagesReordered":
            self = .sessionQueuedMessagesReordered(try SessionQueuedMessagesReorderedAction(from: decoder))
        case "session/inputRequested":
            self = .sessionInputRequested(try SessionInputRequestedAction(from: decoder))
        case "session/inputAnswerChanged":
            self = .sessionInputAnswerChanged(try SessionInputAnswerChangedAction(from: decoder))
        case "session/inputCompleted":
            self = .sessionInputCompleted(try SessionInputCompletedAction(from: decoder))
        case "session/customizationsChanged":
            self = .sessionCustomizationsChanged(try SessionCustomizationsChangedAction(from: decoder))
        case "session/customizationToggled":
            self = .sessionCustomizationToggled(try SessionCustomizationToggledAction(from: decoder))
        case "session/customizationUpdated":
            self = .sessionCustomizationUpdated(try SessionCustomizationUpdatedAction(from: decoder))
        case "session/truncated":
            self = .sessionTruncated(try SessionTruncatedAction(from: decoder))
        case "session/diffsChanged":
            self = .sessionDiffsChanged(try SessionDiffsChangedAction(from: decoder))
        case "session/configChanged":
            self = .sessionConfigChanged(try SessionConfigChangedAction(from: decoder))
        case "session/metaChanged":
            self = .sessionMetaChanged(try SessionMetaChangedAction(from: decoder))
        case "session/toolCallContentChanged":
            self = .sessionToolCallContentChanged(try SessionToolCallContentChangedAction(from: decoder))
        case "root/terminalsChanged":
            self = .rootTerminalsChanged(try RootTerminalsChangedAction(from: decoder))
        case "root/configChanged":
            self = .rootConfigChanged(try RootConfigChangedAction(from: decoder))
        case "terminal/data":
            self = .terminalData(try TerminalDataAction(from: decoder))
        case "terminal/input":
            self = .terminalInput(try TerminalInputAction(from: decoder))
        case "terminal/resized":
            self = .terminalResized(try TerminalResizedAction(from: decoder))
        case "terminal/claimed":
            self = .terminalClaimed(try TerminalClaimedAction(from: decoder))
        case "terminal/titleChanged":
            self = .terminalTitleChanged(try TerminalTitleChangedAction(from: decoder))
        case "terminal/cwdChanged":
            self = .terminalCwdChanged(try TerminalCwdChangedAction(from: decoder))
        case "terminal/exited":
            self = .terminalExited(try TerminalExitedAction(from: decoder))
        case "terminal/cleared":
            self = .terminalCleared(try TerminalClearedAction(from: decoder))
        case "terminal/commandDetectionAvailable":
            self = .terminalCommandDetectionAvailable(try TerminalCommandDetectionAvailableAction(from: decoder))
        case "terminal/commandExecuted":
            self = .terminalCommandExecuted(try TerminalCommandExecutedAction(from: decoder))
        case "terminal/commandFinished":
            self = .terminalCommandFinished(try TerminalCommandFinishedAction(from: decoder))
        default:
            self = .unknown(type: type)
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .rootAgentsChanged(let v): try v.encode(to: encoder)
        case .rootActiveSessionsChanged(let v): try v.encode(to: encoder)
        case .sessionReady(let v): try v.encode(to: encoder)
        case .sessionCreationFailed(let v): try v.encode(to: encoder)
        case .sessionTurnStarted(let v): try v.encode(to: encoder)
        case .sessionDelta(let v): try v.encode(to: encoder)
        case .sessionResponsePart(let v): try v.encode(to: encoder)
        case .sessionToolCallStart(let v): try v.encode(to: encoder)
        case .sessionToolCallDelta(let v): try v.encode(to: encoder)
        case .sessionToolCallReady(let v): try v.encode(to: encoder)
        case .sessionToolCallConfirmed(let v): try v.encode(to: encoder)
        case .sessionToolCallComplete(let v): try v.encode(to: encoder)
        case .sessionToolCallResultConfirmed(let v): try v.encode(to: encoder)
        case .sessionTurnComplete(let v): try v.encode(to: encoder)
        case .sessionTurnCancelled(let v): try v.encode(to: encoder)
        case .sessionError(let v): try v.encode(to: encoder)
        case .sessionTitleChanged(let v): try v.encode(to: encoder)
        case .sessionUsage(let v): try v.encode(to: encoder)
        case .sessionReasoning(let v): try v.encode(to: encoder)
        case .sessionModelChanged(let v): try v.encode(to: encoder)
        case .sessionIsReadChanged(let v): try v.encode(to: encoder)
        case .sessionIsArchivedChanged(let v): try v.encode(to: encoder)
        case .sessionActivityChanged(let v): try v.encode(to: encoder)
        case .sessionServerToolsChanged(let v): try v.encode(to: encoder)
        case .sessionActiveClientChanged(let v): try v.encode(to: encoder)
        case .sessionActiveClientToolsChanged(let v): try v.encode(to: encoder)
        case .sessionPendingMessageSet(let v): try v.encode(to: encoder)
        case .sessionPendingMessageRemoved(let v): try v.encode(to: encoder)
        case .sessionQueuedMessagesReordered(let v): try v.encode(to: encoder)
        case .sessionInputRequested(let v): try v.encode(to: encoder)
        case .sessionInputAnswerChanged(let v): try v.encode(to: encoder)
        case .sessionInputCompleted(let v): try v.encode(to: encoder)
        case .sessionCustomizationsChanged(let v): try v.encode(to: encoder)
        case .sessionCustomizationToggled(let v): try v.encode(to: encoder)
        case .sessionCustomizationUpdated(let v): try v.encode(to: encoder)
        case .sessionTruncated(let v): try v.encode(to: encoder)
        case .sessionDiffsChanged(let v): try v.encode(to: encoder)
        case .sessionConfigChanged(let v): try v.encode(to: encoder)
        case .sessionMetaChanged(let v): try v.encode(to: encoder)
        case .sessionToolCallContentChanged(let v): try v.encode(to: encoder)
        case .rootTerminalsChanged(let v): try v.encode(to: encoder)
        case .rootConfigChanged(let v): try v.encode(to: encoder)
        case .terminalData(let v): try v.encode(to: encoder)
        case .terminalInput(let v): try v.encode(to: encoder)
        case .terminalResized(let v): try v.encode(to: encoder)
        case .terminalClaimed(let v): try v.encode(to: encoder)
        case .terminalTitleChanged(let v): try v.encode(to: encoder)
        case .terminalCwdChanged(let v): try v.encode(to: encoder)
        case .terminalExited(let v): try v.encode(to: encoder)
        case .terminalCleared(let v): try v.encode(to: encoder)
        case .terminalCommandDetectionAvailable(let v): try v.encode(to: encoder)
        case .terminalCommandExecuted(let v): try v.encode(to: encoder)
        case .terminalCommandFinished(let v): try v.encode(to: encoder)
        case .unknown: break
        }
    }
}
