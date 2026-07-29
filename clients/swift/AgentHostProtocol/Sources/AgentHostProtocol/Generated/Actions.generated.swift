// Generated from types/*.ts — do not edit

import Foundation

// MARK: - ActionType

/// Discriminant values for all state actions.
public enum ActionType: Codable, Sendable, Hashable, RawRepresentable {
    case rootAgentsChanged
    case rootActiveSessionsChanged
    case sessionReady
    case sessionCreationFailed
    case sessionChatAdded
    case sessionChatRemoved
    case sessionChatUpdated
    case sessionDefaultChatChanged
    case chatTurnStarted
    case chatDelta
    case chatResponsePart
    case chatToolCallStart
    case chatToolCallDelta
    case chatToolCallReady
    case chatToolCallConfirmed
    case chatToolCallComplete
    case chatToolCallResultConfirmed
    case chatToolCallContentChanged
    case chatToolCallAuthRequired
    case chatToolCallAuthResolved
    case chatTurnComplete
    case chatTurnCancelled
    case chatError
    case chatActivityChanged
    case chatWorkingDirectorySet
    case chatWorkingDirectoryRemoved
    case sessionTitleChanged
    case chatUsage
    case chatReasoning
    case sessionServerToolsChanged
    case sessionActiveClientSet
    case sessionActiveClientRemoved
    case sessionWorkingDirectorySet
    case sessionWorkingDirectoryRemoved
    case sessionInputNeededSet
    case sessionInputNeededRemoved
    case chatPendingMessageSet
    case chatPendingMessageRemoved
    case chatQueuedMessagesReordered
    case chatDraftChanged
    case chatInputRequested
    case chatInputAnswerChanged
    case chatInputCompleted
    case sessionCustomizationsChanged
    case sessionCustomizationToggled
    case sessionCustomizationUpdated
    case sessionCustomizationRemoved
    case sessionMcpServerStateChanged
    case sessionMcpServerStartRequested
    case sessionMcpServerStopRequested
    case chatTruncated
    case chatTurnsLoaded
    case sessionIsReadChanged
    case sessionIsArchivedChanged
    case sessionActivityChanged
    case sessionChangesetsChanged
    case sessionConfigChanged
    case sessionMetaChanged
    case changesetStatusChanged
    case changesetFileSet
    case changesetFileRemoved
    case changesetFilesReviewChanged
    case changesetContentChanged
    case changesetOperationsChanged
    case changesetOperationStatusChanged
    case changesetCleared
    case annotationsSet
    case annotationsUpdated
    case annotationsRemoved
    case annotationsEntrySet
    case annotationsEntryRemoved
    case rootTerminalsChanged
    case rootConfigChanged
    case terminalData
    case terminalInput
    case terminalResized
    case terminalClaimed
    case terminalTitleChanged
    case terminalCwdChanged
    case terminalExited
    case terminalCleared
    case terminalCommandDetectionAvailable
    case terminalCommandExecuted
    case terminalCommandFinished
    case resourceWatchChanged
    /// An unknown or future wire value, preserved verbatim.
    case unknown(String)

    public init(rawValue: String) {
        switch rawValue {
        case "root/agentsChanged": self = .rootAgentsChanged
        case "root/activeSessionsChanged": self = .rootActiveSessionsChanged
        case "session/ready": self = .sessionReady
        case "session/creationFailed": self = .sessionCreationFailed
        case "session/chatAdded": self = .sessionChatAdded
        case "session/chatRemoved": self = .sessionChatRemoved
        case "session/chatUpdated": self = .sessionChatUpdated
        case "session/defaultChatChanged": self = .sessionDefaultChatChanged
        case "chat/turnStarted": self = .chatTurnStarted
        case "chat/delta": self = .chatDelta
        case "chat/responsePart": self = .chatResponsePart
        case "chat/toolCallStart": self = .chatToolCallStart
        case "chat/toolCallDelta": self = .chatToolCallDelta
        case "chat/toolCallReady": self = .chatToolCallReady
        case "chat/toolCallConfirmed": self = .chatToolCallConfirmed
        case "chat/toolCallComplete": self = .chatToolCallComplete
        case "chat/toolCallResultConfirmed": self = .chatToolCallResultConfirmed
        case "chat/toolCallContentChanged": self = .chatToolCallContentChanged
        case "chat/toolCallAuthRequired": self = .chatToolCallAuthRequired
        case "chat/toolCallAuthResolved": self = .chatToolCallAuthResolved
        case "chat/turnComplete": self = .chatTurnComplete
        case "chat/turnCancelled": self = .chatTurnCancelled
        case "chat/error": self = .chatError
        case "chat/activityChanged": self = .chatActivityChanged
        case "chat/workingDirectorySet": self = .chatWorkingDirectorySet
        case "chat/workingDirectoryRemoved": self = .chatWorkingDirectoryRemoved
        case "session/titleChanged": self = .sessionTitleChanged
        case "chat/usage": self = .chatUsage
        case "chat/reasoning": self = .chatReasoning
        case "session/serverToolsChanged": self = .sessionServerToolsChanged
        case "session/activeClientSet": self = .sessionActiveClientSet
        case "session/activeClientRemoved": self = .sessionActiveClientRemoved
        case "session/workingDirectorySet": self = .sessionWorkingDirectorySet
        case "session/workingDirectoryRemoved": self = .sessionWorkingDirectoryRemoved
        case "session/inputNeededSet": self = .sessionInputNeededSet
        case "session/inputNeededRemoved": self = .sessionInputNeededRemoved
        case "chat/pendingMessageSet": self = .chatPendingMessageSet
        case "chat/pendingMessageRemoved": self = .chatPendingMessageRemoved
        case "chat/queuedMessagesReordered": self = .chatQueuedMessagesReordered
        case "chat/draftChanged": self = .chatDraftChanged
        case "chat/inputRequested": self = .chatInputRequested
        case "chat/inputAnswerChanged": self = .chatInputAnswerChanged
        case "chat/inputCompleted": self = .chatInputCompleted
        case "session/customizationsChanged": self = .sessionCustomizationsChanged
        case "session/customizationToggled": self = .sessionCustomizationToggled
        case "session/customizationUpdated": self = .sessionCustomizationUpdated
        case "session/customizationRemoved": self = .sessionCustomizationRemoved
        case "session/mcpServerStateChanged": self = .sessionMcpServerStateChanged
        case "session/mcpServerStartRequested": self = .sessionMcpServerStartRequested
        case "session/mcpServerStopRequested": self = .sessionMcpServerStopRequested
        case "chat/truncated": self = .chatTruncated
        case "chat/turnsLoaded": self = .chatTurnsLoaded
        case "session/isReadChanged": self = .sessionIsReadChanged
        case "session/isArchivedChanged": self = .sessionIsArchivedChanged
        case "session/activityChanged": self = .sessionActivityChanged
        case "session/changesetsChanged": self = .sessionChangesetsChanged
        case "session/configChanged": self = .sessionConfigChanged
        case "session/metaChanged": self = .sessionMetaChanged
        case "changeset/statusChanged": self = .changesetStatusChanged
        case "changeset/fileSet": self = .changesetFileSet
        case "changeset/fileRemoved": self = .changesetFileRemoved
        case "changeset/filesReviewChanged": self = .changesetFilesReviewChanged
        case "changeset/contentChanged": self = .changesetContentChanged
        case "changeset/operationsChanged": self = .changesetOperationsChanged
        case "changeset/operationStatusChanged": self = .changesetOperationStatusChanged
        case "changeset/cleared": self = .changesetCleared
        case "annotations/set": self = .annotationsSet
        case "annotations/updated": self = .annotationsUpdated
        case "annotations/removed": self = .annotationsRemoved
        case "annotations/entrySet": self = .annotationsEntrySet
        case "annotations/entryRemoved": self = .annotationsEntryRemoved
        case "root/terminalsChanged": self = .rootTerminalsChanged
        case "root/configChanged": self = .rootConfigChanged
        case "terminal/data": self = .terminalData
        case "terminal/input": self = .terminalInput
        case "terminal/resized": self = .terminalResized
        case "terminal/claimed": self = .terminalClaimed
        case "terminal/titleChanged": self = .terminalTitleChanged
        case "terminal/cwdChanged": self = .terminalCwdChanged
        case "terminal/exited": self = .terminalExited
        case "terminal/cleared": self = .terminalCleared
        case "terminal/commandDetectionAvailable": self = .terminalCommandDetectionAvailable
        case "terminal/commandExecuted": self = .terminalCommandExecuted
        case "terminal/commandFinished": self = .terminalCommandFinished
        case "resourceWatch/changed": self = .resourceWatchChanged
        default: self = .unknown(rawValue)
        }
    }

    public var rawValue: String {
        switch self {
        case .rootAgentsChanged: return "root/agentsChanged"
        case .rootActiveSessionsChanged: return "root/activeSessionsChanged"
        case .sessionReady: return "session/ready"
        case .sessionCreationFailed: return "session/creationFailed"
        case .sessionChatAdded: return "session/chatAdded"
        case .sessionChatRemoved: return "session/chatRemoved"
        case .sessionChatUpdated: return "session/chatUpdated"
        case .sessionDefaultChatChanged: return "session/defaultChatChanged"
        case .chatTurnStarted: return "chat/turnStarted"
        case .chatDelta: return "chat/delta"
        case .chatResponsePart: return "chat/responsePart"
        case .chatToolCallStart: return "chat/toolCallStart"
        case .chatToolCallDelta: return "chat/toolCallDelta"
        case .chatToolCallReady: return "chat/toolCallReady"
        case .chatToolCallConfirmed: return "chat/toolCallConfirmed"
        case .chatToolCallComplete: return "chat/toolCallComplete"
        case .chatToolCallResultConfirmed: return "chat/toolCallResultConfirmed"
        case .chatToolCallContentChanged: return "chat/toolCallContentChanged"
        case .chatToolCallAuthRequired: return "chat/toolCallAuthRequired"
        case .chatToolCallAuthResolved: return "chat/toolCallAuthResolved"
        case .chatTurnComplete: return "chat/turnComplete"
        case .chatTurnCancelled: return "chat/turnCancelled"
        case .chatError: return "chat/error"
        case .chatActivityChanged: return "chat/activityChanged"
        case .chatWorkingDirectorySet: return "chat/workingDirectorySet"
        case .chatWorkingDirectoryRemoved: return "chat/workingDirectoryRemoved"
        case .sessionTitleChanged: return "session/titleChanged"
        case .chatUsage: return "chat/usage"
        case .chatReasoning: return "chat/reasoning"
        case .sessionServerToolsChanged: return "session/serverToolsChanged"
        case .sessionActiveClientSet: return "session/activeClientSet"
        case .sessionActiveClientRemoved: return "session/activeClientRemoved"
        case .sessionWorkingDirectorySet: return "session/workingDirectorySet"
        case .sessionWorkingDirectoryRemoved: return "session/workingDirectoryRemoved"
        case .sessionInputNeededSet: return "session/inputNeededSet"
        case .sessionInputNeededRemoved: return "session/inputNeededRemoved"
        case .chatPendingMessageSet: return "chat/pendingMessageSet"
        case .chatPendingMessageRemoved: return "chat/pendingMessageRemoved"
        case .chatQueuedMessagesReordered: return "chat/queuedMessagesReordered"
        case .chatDraftChanged: return "chat/draftChanged"
        case .chatInputRequested: return "chat/inputRequested"
        case .chatInputAnswerChanged: return "chat/inputAnswerChanged"
        case .chatInputCompleted: return "chat/inputCompleted"
        case .sessionCustomizationsChanged: return "session/customizationsChanged"
        case .sessionCustomizationToggled: return "session/customizationToggled"
        case .sessionCustomizationUpdated: return "session/customizationUpdated"
        case .sessionCustomizationRemoved: return "session/customizationRemoved"
        case .sessionMcpServerStateChanged: return "session/mcpServerStateChanged"
        case .sessionMcpServerStartRequested: return "session/mcpServerStartRequested"
        case .sessionMcpServerStopRequested: return "session/mcpServerStopRequested"
        case .chatTruncated: return "chat/truncated"
        case .chatTurnsLoaded: return "chat/turnsLoaded"
        case .sessionIsReadChanged: return "session/isReadChanged"
        case .sessionIsArchivedChanged: return "session/isArchivedChanged"
        case .sessionActivityChanged: return "session/activityChanged"
        case .sessionChangesetsChanged: return "session/changesetsChanged"
        case .sessionConfigChanged: return "session/configChanged"
        case .sessionMetaChanged: return "session/metaChanged"
        case .changesetStatusChanged: return "changeset/statusChanged"
        case .changesetFileSet: return "changeset/fileSet"
        case .changesetFileRemoved: return "changeset/fileRemoved"
        case .changesetFilesReviewChanged: return "changeset/filesReviewChanged"
        case .changesetContentChanged: return "changeset/contentChanged"
        case .changesetOperationsChanged: return "changeset/operationsChanged"
        case .changesetOperationStatusChanged: return "changeset/operationStatusChanged"
        case .changesetCleared: return "changeset/cleared"
        case .annotationsSet: return "annotations/set"
        case .annotationsUpdated: return "annotations/updated"
        case .annotationsRemoved: return "annotations/removed"
        case .annotationsEntrySet: return "annotations/entrySet"
        case .annotationsEntryRemoved: return "annotations/entryRemoved"
        case .rootTerminalsChanged: return "root/terminalsChanged"
        case .rootConfigChanged: return "root/configChanged"
        case .terminalData: return "terminal/data"
        case .terminalInput: return "terminal/input"
        case .terminalResized: return "terminal/resized"
        case .terminalClaimed: return "terminal/claimed"
        case .terminalTitleChanged: return "terminal/titleChanged"
        case .terminalCwdChanged: return "terminal/cwdChanged"
        case .terminalExited: return "terminal/exited"
        case .terminalCleared: return "terminal/cleared"
        case .terminalCommandDetectionAvailable: return "terminal/commandDetectionAvailable"
        case .terminalCommandExecuted: return "terminal/commandExecuted"
        case .terminalCommandFinished: return "terminal/commandFinished"
        case .resourceWatchChanged: return "resourceWatch/changed"
        case .unknown(let value): return value
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
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
    /// ISO 8601 timestamp when this turn started.
    public var startedAt: String
    /// The new message
    public var message: Message
    /// If this turn was auto-started from a queued message, the ID of that message
    public var queuedMessageId: String?
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case startedAt
        case message
        case queuedMessageId
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        startedAt: String,
        message: Message,
        queuedMessageId: String? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.startedAt = startedAt
        self.message = message
        self.queuedMessageId = queuedMessageId
        self.meta = meta
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
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case partId
        case content
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        partId: String,
        content: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.partId = partId
        self.content = content
        self.meta = meta
    }
}

public struct ChatResponsePartAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Response part (markdown or content ref)
    public var part: ResponsePart
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case part
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        part: ResponsePart,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.part = part
        self.meta = meta
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
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
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
        case intention
        case contributor
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        toolName: String,
        displayName: String,
        intention: String? = nil,
        contributor: ToolCallContributor? = nil
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
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
    /// Final contributor metadata. MUST NOT change execution ownership established
    /// at `chat/toolCallStart`; a client contributor must keep the same `clientId`.
    public var contributor: ToolCallContributor?
    /// Final human-readable description of what the tool invocation intends to do.
    /// When present, replaces the provisional intention from `chat/toolCallStart`.
    public var intention: String?
    /// Message describing what the tool will do or what confirmation is needed
    public var invocationMessage: StringOrMarkdown
    /// Raw tool input
    public var toolInput: String?
    /// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
    public var confirmationTitle: StringOrMarkdown?
    /// Risk assessment that informed the confirmation requirement.
    public var riskAssessment: ToolCallRiskAssessment?
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
        case contributor
        case intention
        case invocationMessage
        case toolInput
        case confirmationTitle
        case riskAssessment
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
        contributor: ToolCallContributor? = nil,
        intention: String? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: String? = nil,
        confirmationTitle: StringOrMarkdown? = nil,
        riskAssessment: ToolCallRiskAssessment? = nil,
        edits: AnyCodable? = nil,
        editable: Bool? = nil,
        confirmed: ToolCallConfirmationReason? = nil,
        options: [ConfirmationOption]? = nil
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.contributor = contributor
        self.intention = intention
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.confirmationTitle = confirmationTitle
        self.riskAssessment = riskAssessment
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

public struct ChatToolCallAuthRequiredAction: Codable, Sendable {
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
    /// The authentication challenge blocking this invocation.
    public var auth: McpAuthRequirement

    enum CodingKeys: String, CodingKey {
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
        case auth
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType,
        auth: McpAuthRequirement
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
        self.auth = auth
    }
}

public struct ChatToolCallAuthResolvedAction: Codable, Sendable {
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

    enum CodingKeys: String, CodingKey {
        case turnId
        case toolCallId
        case meta = "_meta"
        case type
    }

    public init(
        turnId: String,
        toolCallId: String,
        meta: [String: AnyCodable]? = nil,
        type: ActionType
    ) {
        self.turnId = turnId
        self.toolCallId = toolCallId
        self.meta = meta
        self.type = type
    }
}

public struct ChatTurnCompleteAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Elapsed turn duration in milliseconds, measured by the producer's own
    /// clock. Clients MUST NOT derive this by subtracting timestamps — cross-
    /// client clocks may differ — and MUST treat it as opaque, producer-supplied
    /// data.
    public var duration: Int
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case duration
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        duration: Int,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.duration = duration
        self.meta = meta
    }
}

public struct ChatTurnCancelledAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Elapsed turn duration in milliseconds, measured by the producer's own
    /// clock. Clients MUST NOT derive this by subtracting timestamps — cross-
    /// client clocks may differ — and MUST treat it as opaque, producer-supplied
    /// data.
    public var duration: Int
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case duration
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        duration: Int,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.duration = duration
        self.meta = meta
    }
}

public struct ChatErrorAction: Codable, Sendable {
    public var type: ActionType
    /// Turn identifier
    public var turnId: String
    /// Elapsed turn duration in milliseconds, measured by the producer's own
    /// clock. Clients MUST NOT derive this by subtracting timestamps — cross-
    /// client clocks may differ — and MUST treat it as opaque, producer-supplied
    /// data.
    public var duration: Int
    /// Error details
    public var error: ErrorInfo
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case duration
        case error
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        duration: Int,
        error: ErrorInfo,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.duration = duration
        self.error = error
        self.meta = meta
    }
}

public struct ChatActivityChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Human-readable description of current activity; omit or set `undefined` to clear
    public var activity: String?

    public init(
        type: ActionType,
        activity: String? = nil
    ) {
        self.type = type
        self.activity = activity
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
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case usage
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        usage: UsageInfo,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.usage = usage
        self.meta = meta
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
    /// Additional provider-specific metadata for this action.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI, and
    /// agent hosts MAY use it to carry per-event context that does not fit any
    /// other field — for example, attributing the event to a specific agent
    /// (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
    /// convention.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case type
        case turnId
        case partId
        case content
        case meta = "_meta"
    }

    public init(
        type: ActionType,
        turnId: String,
        partId: String,
        content: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.type = type
        self.turnId = turnId
        self.partId = partId
        self.content = content
        self.meta = meta
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

public struct SessionActiveClientSetAction: Codable, Sendable {
    public var type: ActionType
    /// The active client to add or update, matched by `clientId`.
    public var activeClient: SessionActiveClient

    public init(
        type: ActionType,
        activeClient: SessionActiveClient
    ) {
        self.type = type
        self.activeClient = activeClient
    }
}

public struct SessionActiveClientRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The `clientId` of the active client to remove.
    public var clientId: String

    public init(
        type: ActionType,
        clientId: String
    ) {
        self.type = type
        self.clientId = clientId
    }
}

public struct SessionWorkingDirectorySetAction: Codable, Sendable {
    public var type: ActionType
    /// The working directory to grant the session's agent tool access to.
    public var directory: String

    public init(
        type: ActionType,
        directory: String
    ) {
        self.type = type
        self.directory = directory
    }
}

public struct SessionWorkingDirectoryRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The working directory to revoke the session's agent tool access to.
    public var directory: String

    public init(
        type: ActionType,
        directory: String
    ) {
        self.type = type
        self.directory = directory
    }
}

public struct ChatWorkingDirectorySetAction: Codable, Sendable {
    public var type: ActionType
    /// The working directory to add to this chat's subset.
    public var directory: String

    public init(
        type: ActionType,
        directory: String
    ) {
        self.type = type
        self.directory = directory
    }
}

public struct ChatWorkingDirectoryRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The working directory to remove from this chat's subset.
    public var directory: String

    public init(
        type: ActionType,
        directory: String
    ) {
        self.type = type
        self.directory = directory
    }
}

public struct SessionInputNeededSetAction: Codable, Sendable {
    public var type: ActionType
    /// The input request to add or update, matched by `id`.
    public var request: SessionInputRequest

    public init(
        type: ActionType,
        request: SessionInputRequest
    ) {
        self.type = type
        self.request = request
    }
}

public struct SessionInputNeededRemovedAction: Codable, Sendable {
    public var type: ActionType
    /// The `id` of the input request to remove.
    public var id: String

    public init(
        type: ActionType,
        id: String
    ) {
        self.type = type
        self.id = id
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

public struct ChatDraftChangedAction: Codable, Sendable {
    public var type: ActionType
    /// New draft message, or `undefined` to clear it
    public var draft: Message?

    public init(
        type: ActionType,
        draft: Message? = nil
    ) {
        self.type = type
        self.draft = draft
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
    /// The id of the container or child to toggle.
    public var id: String
    /// Whether to enable or disable the targeted customization.
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

public struct SessionMcpServerStartRequestedAction: Codable, Sendable {
    public var type: ActionType
    /// The id of the {@link McpServerCustomization} to start.
    public var id: String

    public init(
        type: ActionType,
        id: String
    ) {
        self.type = type
        self.id = id
    }
}

public struct SessionMcpServerStopRequestedAction: Codable, Sendable {
    public var type: ActionType
    /// The id of the {@link McpServerCustomization} to stop.
    public var id: String

    public init(
        type: ActionType,
        id: String
    ) {
        self.type = type
        self.id = id
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

public struct ChatTurnsLoadedAction: Codable, Sendable {
    public var type: ActionType
    /// Older completed turns loaded into the state, ordered oldest-first.
    public var turns: [Turn]
    /// Opaque cursor for loading the next older page, if one remains.
    public var turnsNextCursor: String?

    public init(
        type: ActionType,
        turns: [Turn],
        turnsNextCursor: String? = nil
    ) {
        self.type = type
        self.turns = turns
        self.turnsNextCursor = turnsNextCursor
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

public struct ChangesetFilesReviewChangedAction: Codable, Sendable {
    public var type: ActionType
    /// The {@link ChangesetFile.id | ids} of the files whose review state changed.
    public var files: [String]
    /// New review state applied to every listed file: `true` once reviewed, `false` to clear it.
    public var reviewed: Bool

    public init(
        type: ActionType,
        files: [String],
        reviewed: Bool
    ) {
        self.type = type
        self.files = files
        self.reviewed = reviewed
    }
}

public struct ChangesetContentChangedAction: Codable, Sendable {
    public var type: ActionType
    /// Full replacement file list.
    public var files: [ChangesetFile]
    /// Full replacement operation list. Omit when operations are unchanged.
    public var operations: [ChangesetOperation]?
    /// Error information, if the changeset content change failed.
    public var error: ErrorInfo?

    public init(
        type: ActionType,
        files: [ChangesetFile],
        operations: [ChangesetOperation]? = nil,
        error: ErrorInfo? = nil
    ) {
        self.type = type
        self.files = files
        self.operations = operations
        self.error = error
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
    /// How this chat came into existence
    public var origin: ChatOrigin?
    /// How the user can interact with this chat. See {@link ChatInteractivity}.
    ///
    /// Supports agent-team patterns where worker chats are read-only or hidden.
    /// Absence defaults to {@link ChatInteractivity.Full} for backward
    /// compatibility.
    public var interactivity: ChatInteractivity?
    /// The subset of the session's working directories this chat uses.
    /// See {@link ChatState.workingDirectories} for the full semantics.
    public var workingDirectories: [String]?

    public init(
        resource: String? = nil,
        title: String? = nil,
        status: SessionStatus? = nil,
        activity: String? = nil,
        modifiedAt: String? = nil,
        origin: ChatOrigin? = nil,
        interactivity: ChatInteractivity? = nil,
        workingDirectories: [String]? = nil
    ) {
        self.resource = resource
        self.title = title
        self.status = status
        self.activity = activity
        self.modifiedAt = modifiedAt
        self.origin = origin
        self.interactivity = interactivity
        self.workingDirectories = workingDirectories
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
    case chatToolCallAuthRequired(ChatToolCallAuthRequiredAction)
    case chatToolCallAuthResolved(ChatToolCallAuthResolvedAction)
    case chatTurnComplete(ChatTurnCompleteAction)
    case chatTurnCancelled(ChatTurnCancelledAction)
    case chatError(ChatErrorAction)
    case chatActivityChanged(ChatActivityChangedAction)
    case sessionTitleChanged(SessionTitleChangedAction)
    case chatUsage(ChatUsageAction)
    case chatReasoning(ChatReasoningAction)
    case sessionIsReadChanged(SessionIsReadChangedAction)
    case sessionIsArchivedChanged(SessionIsArchivedChangedAction)
    case sessionActivityChanged(SessionActivityChangedAction)
    case sessionChangesetsChanged(SessionChangesetsChangedAction)
    case sessionServerToolsChanged(SessionServerToolsChangedAction)
    case sessionActiveClientSet(SessionActiveClientSetAction)
    case sessionActiveClientRemoved(SessionActiveClientRemovedAction)
    case sessionWorkingDirectorySet(SessionWorkingDirectorySetAction)
    case sessionWorkingDirectoryRemoved(SessionWorkingDirectoryRemovedAction)
    case chatWorkingDirectorySet(ChatWorkingDirectorySetAction)
    case chatWorkingDirectoryRemoved(ChatWorkingDirectoryRemovedAction)
    case sessionInputNeededSet(SessionInputNeededSetAction)
    case sessionInputNeededRemoved(SessionInputNeededRemovedAction)
    case chatPendingMessageSet(ChatPendingMessageSetAction)
    case chatPendingMessageRemoved(ChatPendingMessageRemovedAction)
    case chatQueuedMessagesReordered(ChatQueuedMessagesReorderedAction)
    case chatDraftChanged(ChatDraftChangedAction)
    case chatInputRequested(ChatInputRequestedAction)
    case chatInputAnswerChanged(ChatInputAnswerChangedAction)
    case chatInputCompleted(ChatInputCompletedAction)
    case sessionCustomizationsChanged(SessionCustomizationsChangedAction)
    case sessionCustomizationToggled(SessionCustomizationToggledAction)
    case sessionCustomizationUpdated(SessionCustomizationUpdatedAction)
    case sessionCustomizationRemoved(SessionCustomizationRemovedAction)
    case sessionMcpServerStateChanged(SessionMcpServerStateChangedAction)
    case sessionMcpServerStartRequested(SessionMcpServerStartRequestedAction)
    case sessionMcpServerStopRequested(SessionMcpServerStopRequestedAction)
    case chatTruncated(ChatTruncatedAction)
    case chatTurnsLoaded(ChatTurnsLoadedAction)
    case sessionConfigChanged(SessionConfigChangedAction)
    case sessionMetaChanged(SessionMetaChangedAction)
    case changesetStatusChanged(ChangesetStatusChangedAction)
    case changesetFileSet(ChangesetFileSetAction)
    case changesetFileRemoved(ChangesetFileRemovedAction)
    case changesetFilesReviewChanged(ChangesetFilesReviewChangedAction)
    case changesetContentChanged(ChangesetContentChangedAction)
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
        case "chat/toolCallAuthRequired":
            self = .chatToolCallAuthRequired(try ChatToolCallAuthRequiredAction(from: decoder))
        case "chat/toolCallAuthResolved":
            self = .chatToolCallAuthResolved(try ChatToolCallAuthResolvedAction(from: decoder))
        case "chat/turnComplete":
            self = .chatTurnComplete(try ChatTurnCompleteAction(from: decoder))
        case "chat/turnCancelled":
            self = .chatTurnCancelled(try ChatTurnCancelledAction(from: decoder))
        case "chat/error":
            self = .chatError(try ChatErrorAction(from: decoder))
        case "chat/activityChanged":
            self = .chatActivityChanged(try ChatActivityChangedAction(from: decoder))
        case "session/titleChanged":
            self = .sessionTitleChanged(try SessionTitleChangedAction(from: decoder))
        case "chat/usage":
            self = .chatUsage(try ChatUsageAction(from: decoder))
        case "chat/reasoning":
            self = .chatReasoning(try ChatReasoningAction(from: decoder))
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
        case "session/activeClientSet":
            self = .sessionActiveClientSet(try SessionActiveClientSetAction(from: decoder))
        case "session/activeClientRemoved":
            self = .sessionActiveClientRemoved(try SessionActiveClientRemovedAction(from: decoder))
        case "session/workingDirectorySet":
            self = .sessionWorkingDirectorySet(try SessionWorkingDirectorySetAction(from: decoder))
        case "session/workingDirectoryRemoved":
            self = .sessionWorkingDirectoryRemoved(try SessionWorkingDirectoryRemovedAction(from: decoder))
        case "chat/workingDirectorySet":
            self = .chatWorkingDirectorySet(try ChatWorkingDirectorySetAction(from: decoder))
        case "chat/workingDirectoryRemoved":
            self = .chatWorkingDirectoryRemoved(try ChatWorkingDirectoryRemovedAction(from: decoder))
        case "session/inputNeededSet":
            self = .sessionInputNeededSet(try SessionInputNeededSetAction(from: decoder))
        case "session/inputNeededRemoved":
            self = .sessionInputNeededRemoved(try SessionInputNeededRemovedAction(from: decoder))
        case "chat/pendingMessageSet":
            self = .chatPendingMessageSet(try ChatPendingMessageSetAction(from: decoder))
        case "chat/pendingMessageRemoved":
            self = .chatPendingMessageRemoved(try ChatPendingMessageRemovedAction(from: decoder))
        case "chat/queuedMessagesReordered":
            self = .chatQueuedMessagesReordered(try ChatQueuedMessagesReorderedAction(from: decoder))
        case "chat/draftChanged":
            self = .chatDraftChanged(try ChatDraftChangedAction(from: decoder))
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
        case "session/mcpServerStartRequested":
            self = .sessionMcpServerStartRequested(try SessionMcpServerStartRequestedAction(from: decoder))
        case "session/mcpServerStopRequested":
            self = .sessionMcpServerStopRequested(try SessionMcpServerStopRequestedAction(from: decoder))
        case "chat/truncated":
            self = .chatTruncated(try ChatTruncatedAction(from: decoder))
        case "chat/turnsLoaded":
            self = .chatTurnsLoaded(try ChatTurnsLoadedAction(from: decoder))
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
        case "changeset/filesReviewChanged":
            self = .changesetFilesReviewChanged(try ChangesetFilesReviewChangedAction(from: decoder))
        case "changeset/contentChanged":
            self = .changesetContentChanged(try ChangesetContentChangedAction(from: decoder))
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
        case .chatToolCallAuthRequired(let v): try v.encode(to: encoder)
        case .chatToolCallAuthResolved(let v): try v.encode(to: encoder)
        case .chatTurnComplete(let v): try v.encode(to: encoder)
        case .chatTurnCancelled(let v): try v.encode(to: encoder)
        case .chatError(let v): try v.encode(to: encoder)
        case .chatActivityChanged(let v): try v.encode(to: encoder)
        case .sessionTitleChanged(let v): try v.encode(to: encoder)
        case .chatUsage(let v): try v.encode(to: encoder)
        case .chatReasoning(let v): try v.encode(to: encoder)
        case .sessionIsReadChanged(let v): try v.encode(to: encoder)
        case .sessionIsArchivedChanged(let v): try v.encode(to: encoder)
        case .sessionActivityChanged(let v): try v.encode(to: encoder)
        case .sessionChangesetsChanged(let v): try v.encode(to: encoder)
        case .sessionServerToolsChanged(let v): try v.encode(to: encoder)
        case .sessionActiveClientSet(let v): try v.encode(to: encoder)
        case .sessionActiveClientRemoved(let v): try v.encode(to: encoder)
        case .sessionWorkingDirectorySet(let v): try v.encode(to: encoder)
        case .sessionWorkingDirectoryRemoved(let v): try v.encode(to: encoder)
        case .chatWorkingDirectorySet(let v): try v.encode(to: encoder)
        case .chatWorkingDirectoryRemoved(let v): try v.encode(to: encoder)
        case .sessionInputNeededSet(let v): try v.encode(to: encoder)
        case .sessionInputNeededRemoved(let v): try v.encode(to: encoder)
        case .chatPendingMessageSet(let v): try v.encode(to: encoder)
        case .chatPendingMessageRemoved(let v): try v.encode(to: encoder)
        case .chatQueuedMessagesReordered(let v): try v.encode(to: encoder)
        case .chatDraftChanged(let v): try v.encode(to: encoder)
        case .chatInputRequested(let v): try v.encode(to: encoder)
        case .chatInputAnswerChanged(let v): try v.encode(to: encoder)
        case .chatInputCompleted(let v): try v.encode(to: encoder)
        case .sessionCustomizationsChanged(let v): try v.encode(to: encoder)
        case .sessionCustomizationToggled(let v): try v.encode(to: encoder)
        case .sessionCustomizationUpdated(let v): try v.encode(to: encoder)
        case .sessionCustomizationRemoved(let v): try v.encode(to: encoder)
        case .sessionMcpServerStateChanged(let v): try v.encode(to: encoder)
        case .sessionMcpServerStartRequested(let v): try v.encode(to: encoder)
        case .sessionMcpServerStopRequested(let v): try v.encode(to: encoder)
        case .chatTruncated(let v): try v.encode(to: encoder)
        case .chatTurnsLoaded(let v): try v.encode(to: encoder)
        case .sessionConfigChanged(let v): try v.encode(to: encoder)
        case .sessionMetaChanged(let v): try v.encode(to: encoder)
        case .changesetStatusChanged(let v): try v.encode(to: encoder)
        case .changesetFileSet(let v): try v.encode(to: encoder)
        case .changesetFileRemoved(let v): try v.encode(to: encoder)
        case .changesetFilesReviewChanged(let v): try v.encode(to: encoder)
        case .changesetContentChanged(let v): try v.encode(to: encoder)
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
