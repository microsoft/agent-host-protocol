// Generated from types/*.ts — do not edit

import Foundation

// MARK: - ActionType

/// Discriminant values for all state actions.
public enum ActionType: String, Codable, Sendable {
    case rootAgentsChanged = "root/agentsChanged"
    case rootActiveSessionsChanged = "root/activeSessionsChanged"
    case sessionReady = "session/ready"
    case sessionCreationFailed = "session/creationFailed"
    case sessionChatAdded = "session/chatAdded"
    case sessionChatRemoved = "session/chatRemoved"
    case sessionChatUpdated = "session/chatUpdated"
    case sessionDefaultChatChanged = "session/defaultChatChanged"
    case chatTurnStarted = "chat/turnStarted"
    case chatDelta = "chat/delta"
    case chatResponsePart = "chat/responsePart"
    case chatToolCallStart = "chat/toolCallStart"
    case chatToolCallDelta = "chat/toolCallDelta"
    case chatToolCallReady = "chat/toolCallReady"
    case chatToolCallConfirmed = "chat/toolCallConfirmed"
    case chatToolCallComplete = "chat/toolCallComplete"
    case chatToolCallResultConfirmed = "chat/toolCallResultConfirmed"
    case chatToolCallContentChanged = "chat/toolCallContentChanged"
    case chatTurnComplete = "chat/turnComplete"
    case chatTurnCancelled = "chat/turnCancelled"
    case chatError = "chat/error"
    case sessionTitleChanged = "session/titleChanged"
    case chatUsage = "chat/usage"
    case chatReasoning = "chat/reasoning"
    case sessionModelChanged = "session/modelChanged"
    case sessionAgentChanged = "session/agentChanged"
    case sessionServerToolsChanged = "session/serverToolsChanged"
    case sessionActiveClientChanged = "session/activeClientChanged"
    case sessionActiveClientToolsChanged = "session/activeClientToolsChanged"
    case chatPendingMessageSet = "chat/pendingMessageSet"
    case chatPendingMessageRemoved = "chat/pendingMessageRemoved"
    case chatQueuedMessagesReordered = "chat/queuedMessagesReordered"
    case chatInputRequested = "chat/inputRequested"
    case chatInputAnswerChanged = "chat/inputAnswerChanged"
    case chatInputCompleted = "chat/inputCompleted"
    case sessionCustomizationsChanged = "session/customizationsChanged"
    case sessionCustomizationToggled = "session/customizationToggled"
    case sessionCustomizationUpdated = "session/customizationUpdated"
    case sessionCustomizationRemoved = "session/customizationRemoved"
    case sessionMcpServerStateChanged = "session/mcpServerStateChanged"
    case chatTruncated = "chat/truncated"
    case sessionIsReadChanged = "session/isReadChanged"
    case sessionIsArchivedChanged = "session/isArchivedChanged"
    case sessionActivityChanged = "session/activityChanged"
    case sessionChangesetsChanged = "session/changesetsChanged"
    case sessionConfigChanged = "session/configChanged"
    case sessionMetaChanged = "session/metaChanged"
    case changesetStatusChanged = "changeset/statusChanged"
    case changesetFileSet = "changeset/fileSet"
    case changesetFileRemoved = "changeset/fileRemoved"
    case changesetOperationsChanged = "changeset/operationsChanged"
    case changesetOperationStatusChanged = "changeset/operationStatusChanged"
    case changesetCleared = "changeset/cleared"
    case annotationsSet = "annotations/set"
    case annotationsUpdated = "annotations/updated"
    case annotationsRemoved = "annotations/removed"
    case annotationsEntrySet = "annotations/entrySet"
    case annotationsEntryRemoved = "annotations/entryRemoved"
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
    case resourceWatchChanged = "resourceWatch/changed"
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
    /// Channel URI this action belongs to.
    public var channel: String
    public var action: StateAction
    public var serverSeq: Int
    public var origin: ActionOrigin?
    public var rejectionReason: String?

    public init(
        channel: String,
        action: StateAction,
        serverSeq: Int,
        origin: ActionOrigin? = nil,
        rejectionReason: String? = nil
    ) {
        self.channel = channel
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

    public init(
        type: ActionType
    ) {
        self.type = type
    }
}

public struct SessionCreationFailedAction: Codable, Sendable {
    public var type: ActionType
    /// Error details
    public var error: ErrorInfo

    public init(
        type: ActionType,
        error: ErrorInfo
    ) {
        self.type = type
        self.error = error
    }
}

public struct SessionChatAddedAction: Codable, Sendable {
    public var type: ActionType
    /// The full summary of the newly added (or upserted) chat.
    public var summary: ChatSummary

    public init(
        type: ActionType,
        summary: ChatSummary
    ) {
        self.type = type
        self.summary = summary
    }
}

public struct SessionChatRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The URI of the chat to remove.
    public var chat: String

    public init(
        type: ActionType,
        chat: String
    ) {
        self.type = type
        self.chat = chat
    }
}

public struct SessionChatUpdatedAction: Codable, Sendable {
    public var type: ActionType
    /// The URI of the chat whose summary changed.
    public var chat: String
    /// Mutable summary fields that changed; omitted fields are unchanged.
    ///
    /// Identity fields (`resource`) never change and MUST be omitted by
    /// senders; receivers SHOULD ignore them if present.
    public var changes: PartialChatSummary

    public init(
        type: ActionType,
        chat: String,
        changes: PartialChatSummary
    ) {
        self.type = type
        self.chat = chat
        self.changes = changes
    }
}

public struct SessionDefaultChatChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New default chat URI, or `undefined` to clear the hint.
    public var defaultChat: String?

    public init(
        type: ActionType,
        defaultChat: String? = nil
    ) {
        self.type = type
        self.defaultChat = defaultChat
    }
}

public struct ChatTurnStartedAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// The new message
    public var message: Message
    /// If this turn was auto-started from a queued message, the ID of that message
    public var queuedMessageId: String?

    public init(
        type: ActionType,
        turnId: String,
        message: Message,
        queuedMessageId: String? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.message = message
        self.queuedMessageId = queuedMessageId
    }
}

public struct ChatDeltaAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Identifier of the response part to append to
    public var partId: String
    /// Text chunk
    public var content: String

    public init(
        type: ActionType,
        turnId: String,
        partId: String,
        content: String
    ) {
        self.type = type
        self.turnId = turnId
        self.partId = partId
        self.content = content
    }
}

public struct ChatResponsePartAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Response part (markdown or content ref)
    public var part: ResponsePart

    public init(
        type: ActionType,
        turnId: String,
        part: ResponsePart
    ) {
        self.type = type
        self.turnId = turnId
        self.part = part
    }
}

public struct ChatToolCallStartAction: Codable, Sendable {
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
    /// Reference to the contributor of the tool being called. Absent for
    /// server-side tools that are not contributed by a client or MCP server.
    public var contributor: ToolCallContributor?

    enum CodingKeys: String, CodingKey {
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case toolName
        case displayName
        case contributor
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        toolName: String,
        displayName: String,
        contributor: ToolCallContributor? = nil
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.toolName = toolName
        self.displayName = displayName
        self.contributor = contributor
    }
}

public struct ChatToolCallDeltaAction: Codable, Sendable {
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
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case content
        case invocationMessage
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        content: String,
        invocationMessage: StringOrMarkdown? = nil
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.content = content
        self.invocationMessage = invocationMessage
    }
}

public struct ChatToolCallReadyAction: Codable, Sendable {
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
public struct ChatToolCallConfirmedAction: Codable, Sendable {
    /// Action type discriminant
    public var type: String
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
    public var userSuggestion: Message?
    /// Explanation for the denial
    public var reasonMessage: StringOrMarkdown?
    /// ID of the selected confirmation option, if the server provided options
    public var selectedOptionId: String?
    /// Additional provider-specific metadata
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type, turnId, toolCallId, approved, confirmed, editedToolInput, reason, userSuggestion, reasonMessage, selectedOptionId
        case meta = "_meta"
    }

    public init(
        type: String = "chat/toolCallConfirmed",
        turnId: String,
        toolCallId: String,
        approved: Bool,
        confirmed: ToolCallConfirmationReason? = nil,
        editedToolInput: String? = nil,
        reason: ToolCallCancellationReason? = nil,
        userSuggestion: Message? = nil,
        reasonMessage: StringOrMarkdown? = nil,
        selectedOptionId: String? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
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

public struct ChatToolCallCompleteAction: Codable, Sendable {
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
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case result
        case requiresResultConfirmation
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        result: ToolCallResult,
        requiresResultConfirmation: Bool? = nil
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.result = result
        self.requiresResultConfirmation = requiresResultConfirmation
    }
}

public struct ChatToolCallResultConfirmedAction: Codable, Sendable {
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
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case approved
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        approved: Bool
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.approved = approved
    }
}

public struct ChatToolCallContentChangedAction: Codable, Sendable {
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
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case content
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        content: [ToolResultContent]
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.content = content
    }
}

public struct ChatTurnCompleteAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String

    public init(
        type: ActionType,
        turnId: String
    ) {
        self.type = type
        self.turnId = turnId
    }
}

public struct ChatTurnCancelledAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String

    public init(
        type: ActionType,
        turnId: String
    ) {
        self.type = type
        self.turnId = turnId
    }
}

public struct ChatErrorAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Error details
    public var error: ErrorInfo

    public init(
        type: ActionType,
        turnId: String,
        error: ErrorInfo
    ) {
        self.type = type
        self.turnId = turnId
        self.error = error
    }
}

public struct SessionTitleChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New title
    public var title: String

    public init(
        type: ActionType,
        title: String
    ) {
        self.type = type
        self.title = title
    }
}

public struct ChatUsageAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Token usage data
    public var usage: UsageInfo

    public init(
        type: ActionType,
        turnId: String,
        usage: UsageInfo
    ) {
        self.type = type
        self.turnId = turnId
        self.usage = usage
    }
}

public struct ChatReasoningAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Identifier of the reasoning response part to append to
    public var partId: String
    /// Reasoning text chunk
    public var content: String

    public init(
        type: ActionType,
        turnId: String,
        partId: String,
        content: String
    ) {
        self.type = type
        self.turnId = turnId
        self.partId = partId
        self.content = content
    }
}

public struct SessionModelChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New model selection
    public var model: ModelSelection

    public init(
        type: ActionType,
        model: ModelSelection
    ) {
        self.type = type
        self.model = model
    }
}

public struct SessionAgentChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New agent selection, or `undefined` to clear the selection and reset the
    /// session to no selected custom agent.
    public var agent: AgentSelection?

    public init(
        type: ActionType,
        agent: AgentSelection? = nil
    ) {
        self.type = type
        self.agent = agent
    }
}

public struct SessionIsReadChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Whether the session has been read
    public var isRead: Bool

    public init(
        type: ActionType,
        isRead: Bool
    ) {
        self.type = type
        self.isRead = isRead
    }
}

public struct SessionIsArchivedChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Whether the session is archived
    public var isArchived: Bool

    public init(
        type: ActionType,
        isArchived: Bool
    ) {
        self.type = type
        self.isArchived = isArchived
    }
}

public struct SessionActivityChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Human-readable description of current activity, or `undefined` to clear
    public var activity: String?

    public init(
        type: ActionType,
        activity: String? = nil
    ) {
        self.type = type
        self.activity = activity
    }
}

public struct SessionChangesetsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New catalogue, or `undefined` to clear it
    public var changesets: [Changeset]?

    public init(
        type: ActionType,
        changesets: [Changeset]? = nil
    ) {
        self.type = type
        self.changesets = changesets
    }
}

public struct SessionServerToolsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Updated server tools list (full replacement)
    public var tools: [ToolDefinition]

    public init(
        type: ActionType,
        tools: [ToolDefinition]
    ) {
        self.type = type
        self.tools = tools
    }
}

public struct SessionActiveClientChangedAction: Codable, Sendable {
    public var type: ActionType
    /// The new active client, or `null` to unset
    public var activeClient: SessionActiveClient?

    public init(
        type: ActionType,
        activeClient: SessionActiveClient? = nil
    ) {
        self.type = type
        self.activeClient = activeClient
    }
}

public struct SessionActiveClientToolsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Updated client tools list (full replacement)
    public var tools: [ToolDefinition]

    public init(
        type: ActionType,
        tools: [ToolDefinition]
    ) {
        self.type = type
        self.tools = tools
    }
}

public struct ChatPendingMessageSetAction: Codable, Sendable {
    public var type: ActionType
    /// Whether this is a steering or queued message
    public var kind: PendingMessageKind
    /// Unique identifier for this pending message
    public var id: String
    /// The message content
    public var message: Message

    public init(
        type: ActionType,
        kind: PendingMessageKind,
        id: String,
        message: Message
    ) {
        self.type = type
        self.kind = kind
        self.id = id
        self.message = message
    }
}

public struct ChatPendingMessageRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// Whether this is a steering or queued message
    public var kind: PendingMessageKind
    /// Identifier of the pending message to remove
    public var id: String

    public init(
        type: ActionType,
        kind: PendingMessageKind,
        id: String
    ) {
        self.type = type
        self.kind = kind
        self.id = id
    }
}

public struct ChatQueuedMessagesReorderedAction: Codable, Sendable {
    public var type: ActionType
    /// Queued message IDs in the desired order
    public var order: [String]

    public init(
        type: ActionType,
        order: [String]
    ) {
        self.type = type
        self.order = order
    }
}

public struct ChatInputRequestedAction: Codable, Sendable {
    public var type: ActionType
    /// Input request to create or replace
    public var request: ChatInputRequest

    public init(
        type: ActionType,
        request: ChatInputRequest
    ) {
        self.type = type
        self.request = request
    }
}

public struct ChatInputAnswerChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Input request identifier
    public var requestId: String
    /// Question identifier within the input request
    public var questionId: String
    /// Updated answer, or `undefined` to clear an answer draft
    public var answer: ChatInputAnswer?

    public init(
        type: ActionType,
        requestId: String,
        questionId: String,
        answer: ChatInputAnswer? = nil
    ) {
        self.type = type
        self.requestId = requestId
        self.questionId = questionId
        self.answer = answer
    }
}

public struct ChatInputCompletedAction: Codable, Sendable {
    public var type: ActionType
    /// Input request identifier
    public var requestId: String
    /// Completion outcome
    public var response: ChatInputResponseKind
    /// Optional final answer replacement, keyed by question ID
    public var answers: [String: ChatInputAnswer]?

    public init(
        type: ActionType,
        requestId: String,
        response: ChatInputResponseKind,
        answers: [String: ChatInputAnswer]? = nil
    ) {
        self.type = type
        self.requestId = requestId
        self.response = response
        self.answers = answers
    }
}

public struct SessionCustomizationsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Updated customization list (full replacement).
    public var customizations: [Customization]

    public init(
        type: ActionType,
        customizations: [Customization]
    ) {
        self.type = type
        self.customizations = customizations
    }
}

public struct SessionCustomizationToggledAction: Codable, Sendable {
    public var type: ActionType
    /// The id of the container to toggle.
    public var id: String
    /// Whether to enable or disable the container.
    public var enabled: Bool

    public init(
        type: ActionType,
        id: String,
        enabled: Bool
    ) {
        self.type = type
        self.id = id
        self.enabled = enabled
    }
}

public struct SessionCustomizationUpdatedAction: Codable, Sendable {
    public var type: ActionType
    /// The customization to upsert (matched by `customization.id`).
    public var customization: Customization

    public init(
        type: ActionType,
        customization: Customization
    ) {
        self.type = type
        self.customization = customization
    }
}

public struct SessionCustomizationRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The id of the customization to remove.
    public var id: String

    public init(
        type: ActionType,
        id: String
    ) {
        self.type = type
        self.id = id
    }
}

public struct SessionMcpServerStateChangedAction: Codable, Sendable {
    public var type: ActionType
    /// The id of the {@link McpServerCustomization} to update.
    public var id: String
    /// The new lifecycle state.
    public var state: McpServerState
    /// Updated `mcp://` side-channel URI. Full-replacement: omit to clear
    /// an existing channel (typical when leaving
    /// {@link McpServerStatus.Ready | `Ready`}).
    public var channel: String?

    public init(
        type: ActionType,
        id: String,
        state: McpServerState,
        channel: String? = nil
    ) {
        self.type = type
        self.id = id
        self.state = state
        self.channel = channel
    }
}

public struct ChatTruncatedAction: Codable, Sendable {
    public var type: ActionType
    /// Keep turns up to and including this turn. Omit to clear all turns.
    public var turnId: String?

    public init(
        type: ActionType,
        turnId: String? = nil
    ) {
        self.type = type
        self.turnId = turnId
    }
}

public struct SessionConfigChangedAction: Codable, Sendable {
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

public struct SessionMetaChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New `_meta` payload, or `undefined` to clear it
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.meta = meta
    }
}

public struct ChangesetStatusChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New computation lifecycle status.
    public var status: ChangesetStatus
    /// Cause when `status === ChangesetStatus.Error`; otherwise omitted.
    public var error: ErrorInfo?

    public init(
        type: ActionType,
        status: ChangesetStatus,
        error: ErrorInfo? = nil
    ) {
        self.type = type
        self.status = status
        self.error = error
    }
}

public struct ChangesetFileSetAction: Codable, Sendable {
    public var type: ActionType
    /// The new or replacement file entry.
    public var file: ChangesetFile

    public init(
        type: ActionType,
        file: ChangesetFile
    ) {
        self.type = type
        self.file = file
    }
}

public struct ChangesetFileRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The {@link ChangesetFile.id} of the file to remove.
    public var fileId: String

    public init(
        type: ActionType,
        fileId: String
    ) {
        self.type = type
        self.fileId = fileId
    }
}

public struct ChangesetOperationsChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Updated operation list. Pass `undefined` to clear all operations.
    public var operations: [ChangesetOperation]?

    public init(
        type: ActionType,
        operations: [ChangesetOperation]? = nil
    ) {
        self.type = type
        self.operations = operations
    }
}

public struct ChangesetOperationStatusChangedAction: Codable, Sendable {
    public var type: ActionType
    /// The {@link ChangesetOperation.id} whose status changed.
    public var operationId: String
    /// New execution status.
    public var status: ChangesetOperationStatus
    /// Cause when `status === ChangesetOperationStatus.Error`; otherwise omitted.
    public var error: ErrorInfo?

    public init(
        type: ActionType,
        operationId: String,
        status: ChangesetOperationStatus,
        error: ErrorInfo? = nil
    ) {
        self.type = type
        self.operationId = operationId
        self.status = status
        self.error = error
    }
}

public struct ChangesetClearedAction: Codable, Sendable {
    public var type: ActionType

    public init(
        type: ActionType
    ) {
        self.type = type
    }
}

public struct AnnotationsSetAction: Codable, Sendable {
    public var type: ActionType
    /// The new or replacement annotation. MUST contain at least one entry.
    public var annotation: Annotation

    public init(
        type: ActionType,
        annotation: Annotation
    ) {
        self.type = type
        self.annotation = annotation
    }
}

public struct AnnotationsUpdatedAction: Codable, Sendable {
    public var type: ActionType
    /// The {@link Annotation.id} of the annotation to update.
    public var annotationId: String
    /// Re-anchors the annotation to the file versions this turn produced.
    /// Matches a {@link Turn.id} on the owning session. Omit to leave the
    /// current {@link Annotation.turnId} unchanged.
    public var turnId: String?
    /// Re-anchors the annotation to this file. Omit to leave the current
    /// {@link Annotation.resource} unchanged.
    public var resource: String?
    /// Narrows the annotation to this range within {@link resource}. Omit to
    /// leave the current {@link Annotation.range} unchanged; this action cannot
    /// clear an existing range — dispatch {@link AnnotationsSetAction} to
    /// re-anchor to the whole file.
    public var range: TextRange?
    /// Marks the annotation resolved (`true`) or re-opens it (`false`). Omit to
    /// leave the current {@link Annotation.resolved} state unchanged.
    public var resolved: Bool?

    public init(
        type: ActionType,
        annotationId: String,
        turnId: String? = nil,
        resource: String? = nil,
        range: TextRange? = nil,
        resolved: Bool? = nil
    ) {
        self.type = type
        self.annotationId = annotationId
        self.turnId = turnId
        self.resource = resource
        self.range = range
        self.resolved = resolved
    }
}

public struct AnnotationsRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The {@link Annotation.id} of the annotation to remove.
    public var annotationId: String

    public init(
        type: ActionType,
        annotationId: String
    ) {
        self.type = type
        self.annotationId = annotationId
    }
}

public struct AnnotationsEntrySetAction: Codable, Sendable {
    public var type: ActionType
    /// The {@link Annotation.id} the entry belongs to.
    public var annotationId: String
    /// The new or replacement entry.
    public var entry: AnnotationEntry

    public init(
        type: ActionType,
        annotationId: String,
        entry: AnnotationEntry
    ) {
        self.type = type
        self.annotationId = annotationId
        self.entry = entry
    }
}

public struct AnnotationsEntryRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The {@link Annotation.id} the entry belongs to.
    public var annotationId: String
    /// The {@link AnnotationEntry.id} to remove.
    public var entryId: String

    public init(
        type: ActionType,
        annotationId: String,
        entryId: String
    ) {
        self.type = type
        self.annotationId = annotationId
        self.entryId = entryId
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
    /// Output data (may contain ANSI escape sequences)
    public var data: String

    public init(
        type: ActionType,
        data: String
    ) {
        self.type = type
        self.data = data
    }
}

public struct TerminalInputAction: Codable, Sendable {
    public var type: ActionType
    /// Input data to send to the pty
    public var data: String

    public init(
        type: ActionType,
        data: String
    ) {
        self.type = type
        self.data = data
    }
}

public struct TerminalResizedAction: Codable, Sendable {
    public var type: ActionType
    /// Terminal width in columns
    public var cols: Int
    /// Terminal height in rows
    public var rows: Int

    public init(
        type: ActionType,
        cols: Int,
        rows: Int
    ) {
        self.type = type
        self.cols = cols
        self.rows = rows
    }
}

public struct TerminalClaimedAction: Codable, Sendable {
    public var type: ActionType
    /// The new claim
    public var claim: TerminalClaim

    public init(
        type: ActionType,
        claim: TerminalClaim
    ) {
        self.type = type
        self.claim = claim
    }
}

public struct TerminalTitleChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New terminal title
    public var title: String

    public init(
        type: ActionType,
        title: String
    ) {
        self.type = type
        self.title = title
    }
}

public struct TerminalCwdChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New working directory
    public var cwd: String

    public init(
        type: ActionType,
        cwd: String
    ) {
        self.type = type
        self.cwd = cwd
    }
}

public struct TerminalExitedAction: Codable, Sendable {
    public var type: ActionType
    /// Process exit code. `undefined` if the process was killed without an exit code.
    public var exitCode: Int?

    public init(
        type: ActionType,
        exitCode: Int? = nil
    ) {
        self.type = type
        self.exitCode = exitCode
    }
}

public struct TerminalClearedAction: Codable, Sendable {
    public var type: ActionType

    public init(
        type: ActionType
    ) {
        self.type = type
    }
}

public struct TerminalCommandDetectionAvailableAction: Codable, Sendable {
    public var type: ActionType

    public init(
        type: ActionType
    ) {
        self.type = type
    }
}

public struct TerminalCommandExecutedAction: Codable, Sendable {
    public var type: ActionType
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
        commandId: String,
        commandLine: String,
        timestamp: Int
    ) {
        self.type = type
        self.commandId = commandId
        self.commandLine = commandLine
        self.timestamp = timestamp
    }
}

public struct TerminalCommandFinishedAction: Codable, Sendable {
    public var type: ActionType
    /// Matches the `commandId` from the corresponding `commandExecuted`
    public var commandId: String
    /// Shell exit code. `undefined` if the shell did not report one.
    public var exitCode: Int?
    /// Wall-clock duration of the command in milliseconds, as measured by the
    /// shell integration script on the server side.
    public var durationMs: Int?

    public init(
        type: ActionType,
        commandId: String,
        exitCode: Int? = nil,
        durationMs: Int? = nil
    ) {
        self.type = type
        self.commandId = commandId
        self.exitCode = exitCode
        self.durationMs = durationMs
    }
}

public struct ResourceWatchChangedAction: Codable, Sendable {
    public var type: ActionType
    /// The set of changes in this batch, wrapped for forward compatibility.
    public var changes: AnyCodable

    public init(
        type: ActionType,
        changes: AnyCodable
    ) {
        self.type = type
        self.changes = changes
    }
}

// MARK: - Partial Summary Types

public struct PartialChatSummary: Codable, Sendable {
    /// Chat URI
    public var resource: String?
    /// Chat title
    public var title: String?
    /// Current chat status (reuses SessionStatus shape)
    public var status: SessionStatus?
    /// Human-readable description of what the chat is currently doing
    public var activity: String?
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    public var modifiedAt: String?
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
        resource: String? = nil,
        title: String? = nil,
        status: SessionStatus? = nil,
        activity: String? = nil,
        modifiedAt: String? = nil,
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

// MARK: - StateAction Union

/// Discriminated union of all state actions.
public enum StateAction: Codable, Sendable {
    case rootAgentsChanged(RootAgentsChangedAction)
    case rootActiveSessionsChanged(RootActiveSessionsChangedAction)
    case sessionReady(SessionReadyAction)
    case sessionCreationFailed(SessionCreationFailedAction)
    case sessionChatAdded(SessionChatAddedAction)
    case sessionChatRemoved(SessionChatRemovedAction)
    case sessionChatUpdated(SessionChatUpdatedAction)
    case sessionDefaultChatChanged(SessionDefaultChatChangedAction)
    case chatTurnStarted(ChatTurnStartedAction)
    case chatDelta(ChatDeltaAction)
    case chatResponsePart(ChatResponsePartAction)
    case chatToolCallStart(ChatToolCallStartAction)
    case chatToolCallDelta(ChatToolCallDeltaAction)
    case chatToolCallReady(ChatToolCallReadyAction)
    case chatToolCallConfirmed(ChatToolCallConfirmedAction)
    case chatToolCallComplete(ChatToolCallCompleteAction)
    case chatToolCallResultConfirmed(ChatToolCallResultConfirmedAction)
    case chatToolCallContentChanged(ChatToolCallContentChangedAction)
    case chatTurnComplete(ChatTurnCompleteAction)
    case chatTurnCancelled(ChatTurnCancelledAction)
    case chatError(ChatErrorAction)
    case sessionTitleChanged(SessionTitleChangedAction)
    case chatUsage(ChatUsageAction)
    case chatReasoning(ChatReasoningAction)
    case sessionModelChanged(SessionModelChangedAction)
    case sessionAgentChanged(SessionAgentChangedAction)
    case sessionIsReadChanged(SessionIsReadChangedAction)
    case sessionIsArchivedChanged(SessionIsArchivedChangedAction)
    case sessionActivityChanged(SessionActivityChangedAction)
    case sessionChangesetsChanged(SessionChangesetsChangedAction)
    case sessionServerToolsChanged(SessionServerToolsChangedAction)
    case sessionActiveClientChanged(SessionActiveClientChangedAction)
    case sessionActiveClientToolsChanged(SessionActiveClientToolsChangedAction)
    case chatPendingMessageSet(ChatPendingMessageSetAction)
    case chatPendingMessageRemoved(ChatPendingMessageRemovedAction)
    case chatQueuedMessagesReordered(ChatQueuedMessagesReorderedAction)
    case chatInputRequested(ChatInputRequestedAction)
    case chatInputAnswerChanged(ChatInputAnswerChangedAction)
    case chatInputCompleted(ChatInputCompletedAction)
    case sessionCustomizationsChanged(SessionCustomizationsChangedAction)
    case sessionCustomizationToggled(SessionCustomizationToggledAction)
    case sessionCustomizationUpdated(SessionCustomizationUpdatedAction)
    case sessionCustomizationRemoved(SessionCustomizationRemovedAction)
    case sessionMcpServerStateChanged(SessionMcpServerStateChangedAction)
    case chatTruncated(ChatTruncatedAction)
    case sessionConfigChanged(SessionConfigChangedAction)
    case sessionMetaChanged(SessionMetaChangedAction)
    case changesetStatusChanged(ChangesetStatusChangedAction)
    case changesetFileSet(ChangesetFileSetAction)
    case changesetFileRemoved(ChangesetFileRemovedAction)
    case changesetOperationsChanged(ChangesetOperationsChangedAction)
    case changesetOperationStatusChanged(ChangesetOperationStatusChangedAction)
    case changesetCleared(ChangesetClearedAction)
    case annotationsSet(AnnotationsSetAction)
    case annotationsUpdated(AnnotationsUpdatedAction)
    case annotationsRemoved(AnnotationsRemovedAction)
    case annotationsEntrySet(AnnotationsEntrySetAction)
    case annotationsEntryRemoved(AnnotationsEntryRemovedAction)
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
    case resourceWatchChanged(ResourceWatchChangedAction)
    /// Unknown or future action type; reducers treat this as a no-op.
    /// The raw payload (including its `type` discriminant) is preserved
    /// as an `AnyCodable` so a decode→encode round-trip re-emits it
    /// verbatim for forward-compatibility (mirrors .NET allowUnknown).
    case unknown(AnyCodable)

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
        case "session/chatAdded":
            self = .sessionChatAdded(try SessionChatAddedAction(from: decoder))
        case "session/chatRemoved":
            self = .sessionChatRemoved(try SessionChatRemovedAction(from: decoder))
        case "session/chatUpdated":
            self = .sessionChatUpdated(try SessionChatUpdatedAction(from: decoder))
        case "session/defaultChatChanged":
            self = .sessionDefaultChatChanged(try SessionDefaultChatChangedAction(from: decoder))
        case "chat/turnStarted":
            self = .chatTurnStarted(try ChatTurnStartedAction(from: decoder))
        case "chat/delta":
            self = .chatDelta(try ChatDeltaAction(from: decoder))
        case "chat/responsePart":
            self = .chatResponsePart(try ChatResponsePartAction(from: decoder))
        case "chat/toolCallStart":
            self = .chatToolCallStart(try ChatToolCallStartAction(from: decoder))
        case "chat/toolCallDelta":
            self = .chatToolCallDelta(try ChatToolCallDeltaAction(from: decoder))
        case "chat/toolCallReady":
            self = .chatToolCallReady(try ChatToolCallReadyAction(from: decoder))
        case "chat/toolCallConfirmed":
            self = .chatToolCallConfirmed(try ChatToolCallConfirmedAction(from: decoder))
        case "chat/toolCallComplete":
            self = .chatToolCallComplete(try ChatToolCallCompleteAction(from: decoder))
        case "chat/toolCallResultConfirmed":
            self = .chatToolCallResultConfirmed(try ChatToolCallResultConfirmedAction(from: decoder))
        case "chat/toolCallContentChanged":
            self = .chatToolCallContentChanged(try ChatToolCallContentChangedAction(from: decoder))
        case "chat/turnComplete":
            self = .chatTurnComplete(try ChatTurnCompleteAction(from: decoder))
        case "chat/turnCancelled":
            self = .chatTurnCancelled(try ChatTurnCancelledAction(from: decoder))
        case "chat/error":
            self = .chatError(try ChatErrorAction(from: decoder))
        case "session/titleChanged":
            self = .sessionTitleChanged(try SessionTitleChangedAction(from: decoder))
        case "chat/usage":
            self = .chatUsage(try ChatUsageAction(from: decoder))
        case "chat/reasoning":
            self = .chatReasoning(try ChatReasoningAction(from: decoder))
        case "session/modelChanged":
            self = .sessionModelChanged(try SessionModelChangedAction(from: decoder))
        case "session/agentChanged":
            self = .sessionAgentChanged(try SessionAgentChangedAction(from: decoder))
        case "session/isReadChanged":
            self = .sessionIsReadChanged(try SessionIsReadChangedAction(from: decoder))
        case "session/isArchivedChanged":
            self = .sessionIsArchivedChanged(try SessionIsArchivedChangedAction(from: decoder))
        case "session/activityChanged":
            self = .sessionActivityChanged(try SessionActivityChangedAction(from: decoder))
        case "session/changesetsChanged":
            self = .sessionChangesetsChanged(try SessionChangesetsChangedAction(from: decoder))
        case "session/serverToolsChanged":
            self = .sessionServerToolsChanged(try SessionServerToolsChangedAction(from: decoder))
        case "session/activeClientChanged":
            self = .sessionActiveClientChanged(try SessionActiveClientChangedAction(from: decoder))
        case "session/activeClientToolsChanged":
            self = .sessionActiveClientToolsChanged(try SessionActiveClientToolsChangedAction(from: decoder))
        case "chat/pendingMessageSet":
            self = .chatPendingMessageSet(try ChatPendingMessageSetAction(from: decoder))
        case "chat/pendingMessageRemoved":
            self = .chatPendingMessageRemoved(try ChatPendingMessageRemovedAction(from: decoder))
        case "chat/queuedMessagesReordered":
            self = .chatQueuedMessagesReordered(try ChatQueuedMessagesReorderedAction(from: decoder))
        case "chat/inputRequested":
            self = .chatInputRequested(try ChatInputRequestedAction(from: decoder))
        case "chat/inputAnswerChanged":
            self = .chatInputAnswerChanged(try ChatInputAnswerChangedAction(from: decoder))
        case "chat/inputCompleted":
            self = .chatInputCompleted(try ChatInputCompletedAction(from: decoder))
        case "session/customizationsChanged":
            self = .sessionCustomizationsChanged(try SessionCustomizationsChangedAction(from: decoder))
        case "session/customizationToggled":
            self = .sessionCustomizationToggled(try SessionCustomizationToggledAction(from: decoder))
        case "session/customizationUpdated":
            self = .sessionCustomizationUpdated(try SessionCustomizationUpdatedAction(from: decoder))
        case "session/customizationRemoved":
            self = .sessionCustomizationRemoved(try SessionCustomizationRemovedAction(from: decoder))
        case "session/mcpServerStateChanged":
            self = .sessionMcpServerStateChanged(try SessionMcpServerStateChangedAction(from: decoder))
        case "chat/truncated":
            self = .chatTruncated(try ChatTruncatedAction(from: decoder))
        case "session/configChanged":
            self = .sessionConfigChanged(try SessionConfigChangedAction(from: decoder))
        case "session/metaChanged":
            self = .sessionMetaChanged(try SessionMetaChangedAction(from: decoder))
        case "changeset/statusChanged":
            self = .changesetStatusChanged(try ChangesetStatusChangedAction(from: decoder))
        case "changeset/fileSet":
            self = .changesetFileSet(try ChangesetFileSetAction(from: decoder))
        case "changeset/fileRemoved":
            self = .changesetFileRemoved(try ChangesetFileRemovedAction(from: decoder))
        case "changeset/operationsChanged":
            self = .changesetOperationsChanged(try ChangesetOperationsChangedAction(from: decoder))
        case "changeset/operationStatusChanged":
            self = .changesetOperationStatusChanged(try ChangesetOperationStatusChangedAction(from: decoder))
        case "changeset/cleared":
            self = .changesetCleared(try ChangesetClearedAction(from: decoder))
        case "annotations/set":
            self = .annotationsSet(try AnnotationsSetAction(from: decoder))
        case "annotations/updated":
            self = .annotationsUpdated(try AnnotationsUpdatedAction(from: decoder))
        case "annotations/removed":
            self = .annotationsRemoved(try AnnotationsRemovedAction(from: decoder))
        case "annotations/entrySet":
            self = .annotationsEntrySet(try AnnotationsEntrySetAction(from: decoder))
        case "annotations/entryRemoved":
            self = .annotationsEntryRemoved(try AnnotationsEntryRemovedAction(from: decoder))
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
        case "resourceWatch/changed":
            self = .resourceWatchChanged(try ResourceWatchChangedAction(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .rootAgentsChanged(let v): try v.encode(to: encoder)
        case .rootActiveSessionsChanged(let v): try v.encode(to: encoder)
        case .sessionReady(let v): try v.encode(to: encoder)
        case .sessionCreationFailed(let v): try v.encode(to: encoder)
        case .sessionChatAdded(let v): try v.encode(to: encoder)
        case .sessionChatRemoved(let v): try v.encode(to: encoder)
        case .sessionChatUpdated(let v): try v.encode(to: encoder)
        case .sessionDefaultChatChanged(let v): try v.encode(to: encoder)
        case .chatTurnStarted(let v): try v.encode(to: encoder)
        case .chatDelta(let v): try v.encode(to: encoder)
        case .chatResponsePart(let v): try v.encode(to: encoder)
        case .chatToolCallStart(let v): try v.encode(to: encoder)
        case .chatToolCallDelta(let v): try v.encode(to: encoder)
        case .chatToolCallReady(let v): try v.encode(to: encoder)
        case .chatToolCallConfirmed(let v): try v.encode(to: encoder)
        case .chatToolCallComplete(let v): try v.encode(to: encoder)
        case .chatToolCallResultConfirmed(let v): try v.encode(to: encoder)
        case .chatToolCallContentChanged(let v): try v.encode(to: encoder)
        case .chatTurnComplete(let v): try v.encode(to: encoder)
        case .chatTurnCancelled(let v): try v.encode(to: encoder)
        case .chatError(let v): try v.encode(to: encoder)
        case .sessionTitleChanged(let v): try v.encode(to: encoder)
        case .chatUsage(let v): try v.encode(to: encoder)
        case .chatReasoning(let v): try v.encode(to: encoder)
        case .sessionModelChanged(let v): try v.encode(to: encoder)
        case .sessionAgentChanged(let v): try v.encode(to: encoder)
        case .sessionIsReadChanged(let v): try v.encode(to: encoder)
        case .sessionIsArchivedChanged(let v): try v.encode(to: encoder)
        case .sessionActivityChanged(let v): try v.encode(to: encoder)
        case .sessionChangesetsChanged(let v): try v.encode(to: encoder)
        case .sessionServerToolsChanged(let v): try v.encode(to: encoder)
        case .sessionActiveClientChanged(let v): try v.encode(to: encoder)
        case .sessionActiveClientToolsChanged(let v): try v.encode(to: encoder)
        case .chatPendingMessageSet(let v): try v.encode(to: encoder)
        case .chatPendingMessageRemoved(let v): try v.encode(to: encoder)
        case .chatQueuedMessagesReordered(let v): try v.encode(to: encoder)
        case .chatInputRequested(let v): try v.encode(to: encoder)
        case .chatInputAnswerChanged(let v): try v.encode(to: encoder)
        case .chatInputCompleted(let v): try v.encode(to: encoder)
        case .sessionCustomizationsChanged(let v): try v.encode(to: encoder)
        case .sessionCustomizationToggled(let v): try v.encode(to: encoder)
        case .sessionCustomizationUpdated(let v): try v.encode(to: encoder)
        case .sessionCustomizationRemoved(let v): try v.encode(to: encoder)
        case .sessionMcpServerStateChanged(let v): try v.encode(to: encoder)
        case .chatTruncated(let v): try v.encode(to: encoder)
        case .sessionConfigChanged(let v): try v.encode(to: encoder)
        case .sessionMetaChanged(let v): try v.encode(to: encoder)
        case .changesetStatusChanged(let v): try v.encode(to: encoder)
        case .changesetFileSet(let v): try v.encode(to: encoder)
        case .changesetFileRemoved(let v): try v.encode(to: encoder)
        case .changesetOperationsChanged(let v): try v.encode(to: encoder)
        case .changesetOperationStatusChanged(let v): try v.encode(to: encoder)
        case .changesetCleared(let v): try v.encode(to: encoder)
        case .annotationsSet(let v): try v.encode(to: encoder)
        case .annotationsUpdated(let v): try v.encode(to: encoder)
        case .annotationsRemoved(let v): try v.encode(to: encoder)
        case .annotationsEntrySet(let v): try v.encode(to: encoder)
        case .annotationsEntryRemoved(let v): try v.encode(to: encoder)
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
        case .resourceWatchChanged(let v): try v.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}
