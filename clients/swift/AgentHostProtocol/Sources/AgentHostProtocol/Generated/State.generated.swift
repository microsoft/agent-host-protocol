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
public enum SessionLifecycle: Codable, Sendable, Equatable {
    case creating
    case ready
    case failed
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "creating": self = .creating
        case "ready": self = .ready
        case "failed": self = .failed
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .creating: try container.encode("creating")
        case .ready: try container.encode("ready")
        case .failed: try container.encode("failed")
        case .unknown(let raw): try container.encode(raw)
        }
    }
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

/// Discriminant for {@link ChatOrigin} — how a chat came into existence.
public enum ChatOriginKind: Codable, Sendable, Equatable {
    /// User created the chat explicitly (e.g. via the host UI).
    case user
    /// Forked from an existing chat at a specific turn.
    case fork
    /// Created as an independent side conversation from a specific turn.
    case sideChat
    /// Spawned by a tool call running in another chat (e.g. a sub-agent delegation).
    case tool
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "user": self = .user
        case "fork": self = .fork
        case "sideChat": self = .sideChat
        case "tool": self = .tool
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .user: try container.encode("user")
        case .fork: try container.encode("fork")
        case .sideChat: try container.encode("sideChat")
        case .tool: try container.encode("tool")
        case .unknown(let raw): try container.encode(raw)
        }
    }
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
public enum ChatInputAnswerValueKind: Codable, Sendable, Equatable {
    case text
    case number
    case boolean
    case selected
    case selectedMany
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "text": self = .text
        case "number": self = .number
        case "boolean": self = .boolean
        case "selected": self = .selected
        case "selected-many": self = .selectedMany
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text: try container.encode("text")
        case .number: try container.encode("number")
        case .boolean: try container.encode("boolean")
        case .selected: try container.encode("selected")
        case .selectedMany: try container.encode("selected-many")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Question/input control kind.
public enum ChatInputQuestionKind: Codable, Sendable, Equatable {
    case text
    case number
    case integer
    case boolean
    case singleSelect
    case multiSelect
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "text": self = .text
        case "number": self = .number
        case "integer": self = .integer
        case "boolean": self = .boolean
        case "single-select": self = .singleSelect
        case "multi-select": self = .multiSelect
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text: try container.encode("text")
        case .number: try container.encode("number")
        case .integer: try container.encode("integer")
        case .boolean: try container.encode("boolean")
        case .singleSelect: try container.encode("single-select")
        case .multiSelect: try container.encode("multi-select")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// How a client completed an input request.
public enum ChatInputResponseKind: String, Codable, Sendable {
    case accept = "accept"
    case decline = "decline"
    case cancel = "cancel"
}

/// Discriminant for the kinds of outstanding input a session can surface in
/// {@link SessionState.inputNeeded}.
///
/// This is a general/typological union (not a lifecycle), so the discriminant is
/// a `*Kind`.
public enum SessionInputRequestKind: Codable, Sendable, Equatable {
    /// A user-facing elicitation mirrored from an unresolved chat response part.
    case chatInput
    /// A tool call awaiting parameter- or result-confirmation.
    case toolConfirmation
    /// A running tool the session wants an active client to execute.
    case toolClientExecution
    /// A tool call blocked on MCP authentication mid-execution.
    case toolAuthentication
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "chatInput": self = .chatInput
        case "toolConfirmation": self = .toolConfirmation
        case "toolClientExecution": self = .toolClientExecution
        case "toolAuthentication": self = .toolAuthentication
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .chatInput: try container.encode("chatInput")
        case .toolConfirmation: try container.encode("toolConfirmation")
        case .toolClientExecution: try container.encode("toolClientExecution")
        case .toolAuthentication: try container.encode("toolAuthentication")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// How a turn ended.
public enum TurnState: String, Codable, Sendable {
    case complete = "complete"
    case cancelled = "cancelled"
    case error = "error"
}

/// Discriminant for {@link MessageOrigin} — identifies who produced a message.
public enum MessageKind: Codable, Sendable, Equatable {
    /// Sent directly by the user.
    case user
    /// Produced by the agent itself rather than the user — for example, an agent
    /// that seeds the first message of a chat it spawned.
    case agent
    /// Produced by a tool rather than the user — for example, a tool that spawns a
    /// worker chat whose first message carries a seed prompt.
    case tool
    /// Emitted automatically when an automation run starts a session.
    case automation
    /// A system-generated notification rather than a direct user message.
    case systemNotification
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "user": self = .user
        case "agent": self = .agent
        case "tool": self = .tool
        case "automation": self = .automation
        case "systemNotification": self = .systemNotification
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .user: try container.encode("user")
        case .agent: try container.encode("agent")
        case .tool: try container.encode("tool")
        case .automation: try container.encode("automation")
        case .systemNotification: try container.encode("systemNotification")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Discriminant for {@link MessageAttachment} variants.
public enum MessageAttachmentKind: Codable, Sendable, Equatable {
    /// A simple, opaque attachment whose representation is described by the producer.
    case simple
    /// An attachment whose data is embedded inline as a base64 string.
    case embeddedResource
    /// An attachment that references a resource by URI.
    case resource
    /// An attachment that references annotations on an annotations channel.
    case annotations
    /// An attachment that references a bounded transcript from another chat.
    case chat
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "simple": self = .simple
        case "embeddedResource": self = .embeddedResource
        case "resource": self = .resource
        case "annotations": self = .annotations
        case "chat": self = .chat
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .simple: try container.encode("simple")
        case .embeddedResource: try container.encode("embeddedResource")
        case .resource: try container.encode("resource")
        case .annotations: try container.encode("annotations")
        case .chat: try container.encode("chat")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Discriminant for response part types.
public enum ResponsePartKind: Codable, Sendable, Equatable {
    case markdown
    case contentRef
    case toolCall
    case reasoning
    case systemNotification
    case inputRequest
    case error
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "markdown": self = .markdown
        case "contentRef": self = .contentRef
        case "toolCall": self = .toolCall
        case "reasoning": self = .reasoning
        case "systemNotification": self = .systemNotification
        case "inputRequest": self = .inputRequest
        case "error": self = .error
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .markdown: try container.encode("markdown")
        case .contentRef: try container.encode("contentRef")
        case .toolCall: try container.encode("toolCall")
        case .reasoning: try container.encode("reasoning")
        case .systemNotification: try container.encode("systemNotification")
        case .inputRequest: try container.encode("inputRequest")
        case .error: try container.encode("error")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Status of a tool call in the lifecycle state machine.
public enum ToolCallStatus: Codable, Sendable, Equatable {
    case streaming
    case pendingConfirmation
    case running
    /// Running paused because the MCP server backing this call needs
    /// authentication (typically step-up auth for insufficient scope,
    /// surfacing mid-execution). See {@link ToolCallAuthRequiredState}.
    case authRequired
    case pendingResultConfirmation
    case completed
    case cancelled
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "streaming": self = .streaming
        case "pending-confirmation": self = .pendingConfirmation
        case "running": self = .running
        case "auth-required": self = .authRequired
        case "pending-result-confirmation": self = .pendingResultConfirmation
        case "completed": self = .completed
        case "cancelled": self = .cancelled
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .streaming: try container.encode("streaming")
        case .pendingConfirmation: try container.encode("pending-confirmation")
        case .running: try container.encode("running")
        case .authRequired: try container.encode("auth-required")
        case .pendingResultConfirmation: try container.encode("pending-result-confirmation")
        case .completed: try container.encode("completed")
        case .cancelled: try container.encode("cancelled")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// How a tool call was confirmed for execution.
///
/// - `NotNeeded` — No confirmation required (auto-approved)
/// - `UserAction` — User explicitly approved
/// - `Setting` — Approved by a persistent user setting
public enum ToolCallConfirmationReason: Codable, Sendable, Equatable {
    case notNeeded
    case userAction
    case setting
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "not-needed": self = .notNeeded
        case "user-action": self = .userAction
        case "setting": self = .setting
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .notNeeded: try container.encode("not-needed")
        case .userAction: try container.encode("user-action")
        case .setting: try container.encode("setting")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Identifies a model judge as the source of a confirmation requirement.
public enum ToolCallRiskAssessmentKind: Codable, Sendable, Equatable {
    case judge
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "judge": self = .judge
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .judge: try container.encode("judge")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Lifecycle status of an asynchronous model-judge confirmation decision.
public enum ToolCallRiskAssessmentStatus: Codable, Sendable, Equatable {
    case loading
    case complete
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "loading": self = .loading
        case "complete": self = .complete
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .loading: try container.encode("loading")
        case .complete: try container.encode("complete")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Why a tool call was cancelled.
public enum ToolCallCancellationReason: String, Codable, Sendable {
    case denied = "denied"
    case skipped = "skipped"
    case resultDenied = "result-denied"
}

/// Whether a confirmation option represents an approval or denial action.
public enum ConfirmationOptionKind: Codable, Sendable, Equatable {
    case approve
    case deny
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "approve": self = .approve
        case "deny": self = .deny
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .approve: try container.encode("approve")
        case .deny: try container.encode("deny")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Identifies the source of a tool call's implementation.
public enum ToolCallContributorKind: Codable, Sendable, Equatable {
    case client
    case mCP
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "client": self = .client
        case "mcp": self = .mCP
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .client: try container.encode("client")
        case .mCP: try container.encode("mcp")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Discriminant for tool result content types.
public enum ToolResultContentType: Codable, Sendable, Equatable {
    case text
    case embeddedResource
    case resource
    case fileEdit
    case terminal
    case subagent
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "text": self = .text
        case "embeddedResource": self = .embeddedResource
        case "resource": self = .resource
        case "fileEdit": self = .fileEdit
        case "terminal": self = .terminal
        case "subagent": self = .subagent
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text: try container.encode("text")
        case .embeddedResource: try container.encode("embeddedResource")
        case .resource: try container.encode("resource")
        case .fileEdit: try container.encode("fileEdit")
        case .terminal: try container.encode("terminal")
        case .subagent: try container.encode("subagent")
        case .unknown(let raw): try container.encode(raw)
        }
    }
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
public enum CustomizationType: Codable, Sendable, Equatable {
    case plugin
    case directory
    case agent
    case skill
    case prompt
    case rule
    case hook
    case mcpServer
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "plugin": self = .plugin
        case "directory": self = .directory
        case "agent": self = .agent
        case "skill": self = .skill
        case "prompt": self = .prompt
        case "rule": self = .rule
        case "hook": self = .hook
        case "mcpServer": self = .mcpServer
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .plugin: try container.encode("plugin")
        case .directory: try container.encode("directory")
        case .agent: try container.encode("agent")
        case .skill: try container.encode("skill")
        case .prompt: try container.encode("prompt")
        case .rule: try container.encode("rule")
        case .hook: try container.encode("hook")
        case .mcpServer: try container.encode("mcpServer")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Scope at which customization enablement is decided.
public enum CustomizationEnablementKind: Codable, Sendable, Equatable {
    case global
    case workspace
    case session
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "global": self = .global
        case "workspace": self = .workspace
        case "session": self = .session
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .global: try container.encode("global")
        case .workspace: try container.encode("workspace")
        case .session: try container.encode("session")
        case .unknown(let raw): try container.encode(raw)
        }
    }
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

/// Lifecycle status of a terminal process.
public enum TerminalLifecycleStatus: String, Codable, Sendable {
    case running = "running"
    case exited = "exited"
}

/// Discriminant for the {@link McpServerState} union.
public enum McpServerStatus: Codable, Sendable, Equatable {
    /// Server has been registered but is not yet running.
    case starting
    /// Server is running and serving requests.
    case ready
    /// Server is reachable but requires additional authentication before it
    /// can start, or before it can serve a particular request. Carries the
    /// RFC 9728 Protected Resource Metadata the client needs to obtain a
    /// token; the client then pushes the token via the existing
    /// `authenticate` command.
    case authRequired
    /// Server failed to start, crashed, or otherwise transitioned to a fatal error.
    case error
    /// Server has been shut down.
    case stopped
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "starting": self = .starting
        case "ready": self = .ready
        case "authRequired": self = .authRequired
        case "error": self = .error
        case "stopped": self = .stopped
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .starting: try container.encode("starting")
        case .ready: try container.encode("ready")
        case .authRequired: try container.encode("authRequired")
        case .error: try container.encode("error")
        case .stopped: try container.encode("stopped")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Why an MCP server is currently in the {@link McpServerStatus.AuthRequired}
/// state. Mirrors the three failure modes defined by the
/// [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.md).
public enum McpAuthRequiredReason: Codable, Sendable, Equatable {
    /// No token has been provided yet (HTTP 401, no prior token).
    case required
    /// A previously valid token expired or was revoked (HTTP 401).
    case expired
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
    case insufficientScope
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "required": self = .required
        case "expired": self = .expired
        case "insufficientScope": self = .insufficientScope
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .required: try container.encode("required")
        case .expired: try container.encode("expired")
        case .insufficientScope: try container.encode("insufficientScope")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Computation lifecycle of a {@link ChangesetState}.
public enum ChangesetStatus: Codable, Sendable, Equatable {
    /// The server is still computing the contents of this changeset.
    case computing
    /// The changeset has been fully computed and is up-to-date.
    case ready
    /// Computation failed. The cause is described by
    /// {@link ChangesetState.error}.
    case error
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "computing": self = .computing
        case "ready": self = .ready
        case "error": self = .error
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .computing: try container.encode("computing")
        case .ready: try container.encode("ready")
        case .error: try container.encode("error")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Execution lifecycle of a {@link ChangesetOperation}.
///
/// An operation is invoked imperatively via `invokeChangesetOperation`, but
/// its progress and outcome are reflected back into changeset state so that
/// every subscriber observes a consistent view (e.g. a spinner on a "Create
/// Pull Request" button, or an inline error after a failed "revert").
public enum ChangesetOperationStatus: Codable, Sendable, Equatable {
    /// The operation is ready to be invoked. This is the default when
    /// {@link ChangesetOperation.status} is omitted.
    case idle
    /// An invocation of this operation is currently in flight.
    case running
    /// The most recent invocation failed. The cause is described by
    /// {@link ChangesetOperation.error}.
    case error
    /// The operation is currently disabled and cannot be invoked.
    case disabled
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "idle": self = .idle
        case "running": self = .running
        case "error": self = .error
        case "disabled": self = .disabled
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .idle: try container.encode("idle")
        case .running: try container.encode("running")
        case .error: try container.encode("error")
        case .disabled: try container.encode("disabled")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Where a {@link ChangesetOperation} can be invoked.
public enum ChangesetOperationScope: Codable, Sendable, Equatable {
    /// Applies to the whole changeset.
    case changeset
    /// Applies to a single file within the changeset.
    case resource
    /// Applies to a line range within a single file.
    case range
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "changeset": self = .changeset
        case "resource": self = .resource
        case "range": self = .range
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .changeset: try container.encode("changeset")
        case .resource: try container.encode("resource")
        case .range: try container.encode("range")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Discriminant for {@link ResourceChange.type}.
public enum ResourceChangeType: String, Codable, Sendable {
    case added = "added"
    case updated = "updated"
    case deleted = "deleted"
}

/// Discriminant describing the durable provenance of a session.
public enum SessionOriginKind: Codable, Sendable, Equatable {
    /// The session was created as part of an automation run.
    case automation
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "automation": self = .automation
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .automation: try container.encode("automation")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Operations the host currently permits for an automation.
///
/// The list on {@link AutomationEntry.operations} is authoritative and may
/// change over time. Clients MUST NOT infer permission from capabilities alone:
/// capabilities describe what the host implementation can support, while
/// operations describe what is allowed for this particular automation now.
public enum AutomationOperation: Codable, Sendable, Equatable {
    /// Replace editable fields using {@link AutomationUpdateRequestedAction | `automation/updateRequested`}.
    case update
    /// Permanently remove the automation using {@link AutomationRemovedAction | `automation/removed`}.
    case remove
    /// Start a manual run using {@link RunAutomationParams | runAutomation}.
    case run
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "update": self = .update
        case "remove": self = .remove
        case "run": self = .run
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .update: try container.encode("update")
        case .remove: try container.encode("remove")
        case .run: try container.encode("run")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// How a host handles schedule occurrences missed while automatic execution was
/// unavailable.
public enum AutomationMisfirePolicy: Codable, Sendable, Equatable {
    /// Discard missed occurrences and wait for the next future occurrence.
    case skip
    /// Start at most one catch-up run when execution becomes available, regardless
    /// of how many occurrences were missed.
    case runOnce
    /// Unknown raw value from a newer protocol version, preserved verbatim.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw {
        case "skip": self = .skip
        case "runOnce": self = .runOnce
        default: self = .unknown(raw)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .skip: try container.encode("skip")
        case .runOnce: try container.encode("runOnce")
        case .unknown(let raw): try container.encode(raw)
        }
    }
}

/// Discriminant for automatic trigger definitions.
public enum AutomationTriggerKind: String, Codable, Sendable {
    /// A portable recurring {@link AutomationSchedule}.
    case schedule = "schedule"
    /// A host-defined external event discovered from trigger definitions.
    case event = "event"
}

/// Lifecycle status of one automation run.
///
/// `completed`, `failed`, and `cancelled` are terminal. A run remains `running`
/// while any linked session awaits input or client-side work; linked session
/// state is authoritative for those interactions.
public enum AutomationRunStatus: String, Codable, Sendable {
    /// The durable run record exists but execution has not started.
    case pending = "pending"
    /// One or more linked sessions are executing or awaiting interaction.
    case running = "running"
    /// Execution finished successfully.
    case completed = "completed"
    /// Execution ended with an error.
    case failed = "failed"
    /// Execution ended because cancellation was accepted.
    case cancelled = "cancelled"
}

/// Discriminant describing what created an automation run.
public enum AutomationRunOriginKind: String, Codable, Sendable {
    /// A client explicitly invoked {@link RunAutomationParams | runAutomation}.
    case manual = "manual"
    /// An automatic schedule or event trigger fired.
    case trigger = "trigger"
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
    /// Static capabilities the agent advertises about itself. Clients use these
    /// to gate features (multi-chat, fork) instead of switching on the provider
    /// id.
    public var capabilities: AgentCapabilities?

    public init(
        provider: String,
        displayName: String,
        description: String,
        models: [SessionModelInfo],
        protectedResources: [ProtectedResourceMetadata]? = nil,
        customizations: [Customization]? = nil,
        capabilities: AgentCapabilities? = nil
    ) {
        self.provider = provider
        self.displayName = displayName
        self.description = description
        self.models = models
        self.protectedResources = protectedResources
        self.customizations = customizations
        self.capabilities = capabilities
    }
}

public struct AgentCapabilities: Codable, Sendable {
    /// The agent can host more than one concurrent chat per session. When absent,
    /// clients MUST NOT call `createChat` to open chats beyond the default one the
    /// session starts with. An empty object `{}` advertises multi-chat without
    /// source-based creation; set {@link MultipleChatsCapability.fork} or
    /// {@link MultipleChatsCapability.sideChat} to allow the corresponding mode.
    public var multipleChats: MultipleChatsCapability?
    /// The session's agent can be granted tool access to more than one working
    /// directory. The directories are treated as equal peers except where the
    /// agent advertises a protected primary-slot option (some backends pin or
    /// replace their first directory as a process root).
    ///
    /// When absent, clients MUST NOT mutate a session's or chat's working-directory
    /// set and MUST NOT set more than one entry in
    /// {@link CreateSessionParams.workingDirectories}.
    public var multipleWorkingDirectories: MultipleWorkingDirectoriesCapability?

    public init(
        multipleChats: MultipleChatsCapability? = nil,
        multipleWorkingDirectories: MultipleWorkingDirectoriesCapability? = nil
    ) {
        self.multipleChats = multipleChats
        self.multipleWorkingDirectories = multipleWorkingDirectories
    }
}

public struct MultipleChatsCapability: Codable, Sendable {
    /// The agent can fork a chat from a specific turn. When absent or `false`,
    /// clients MUST NOT pass a {@link ChatSource} with `kind: "fork"` to
    /// `createChat`.
    /// Forking always implies multi-chat support.
    public var fork: Bool?
    /// The agent can create a side chat from a specific turn. When absent or
    /// `false`, clients MUST NOT pass a {@link ChatSource} with
    /// `kind: "sideChat"` to `createChat`.
    ///
    /// A side chat receives the source turn as context without copying the source
    /// transcript into its own visible history. The source is identified by a
    /// stable `turnId`, which the host resolves against the source chat's current
    /// `activeTurn` or retained history. When it names the current active turn,
    /// the host snapshots the available partial assistant response at creation
    /// time. Side-chat support always implies multi-chat support.
    public var sideChat: Bool?

    public init(
        fork: Bool? = nil,
        sideChat: Bool? = nil
    ) {
        self.fork = fork
        self.sideChat = sideChat
    }
}

public struct MultipleWorkingDirectoriesCapability: Codable, Sendable {
    /// The agent's **first** working directory (index `0` of
    /// {@link CreateSessionParams.workingDirectories}) is an immutable primary:
    /// its URI is fixed for the lifetime of the session — clients MUST NOT remove,
    /// reorder, or replace it. Additional directories after it remain equal peers
    /// that can be added and removed freely. When
    /// {@link primaryReplacement} is also `true`, clients that recognize that
    /// capability MUST instead treat the primary as protected and replaceable.
    ///
    /// Advertised by backends whose agent process is rooted at a single directory
    /// that cannot change once the session has started. A backend MAY also
    /// advertise this with {@link primaryReplacement} for compatibility with
    /// clients that do not recognize the newer capability: those clients retain
    /// the safe immutable-primary behavior, while newer clients allow only the
    /// targeted replacement action. When both are absent or `false`, all
    /// directories are equal peers.
    public var immutablePrimary: Bool?
    /// The agent's first working-directory slot (index `0`) is a protected primary
    /// whose URI can be atomically replaced with
    /// `session/workingDirectoryReplaced`. Clients MUST NOT remove that slot with
    /// generic membership actions; additional directories remain equal peers.
    ///
    /// Backends use this when their cwd-bearing directory can move during a
    /// session. It MAY be `true` together with {@link immutablePrimary}; this
    /// preserves the immutable-primary guarantee for older clients that do not
    /// recognize this capability. Clients that recognize this capability MUST
    /// allow a targeted replacement even when `immutablePrimary` is also `true`.
    public var primaryReplacement: Bool?

    public init(
        immutablePrimary: Bool? = nil,
        primaryReplacement: Bool? = nil
    ) {
        self.immutablePrimary = immutablePrimary
        self.primaryReplacement = primaryReplacement
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
    /// Maximum number of output tokens the model can generate
    public var maxOutputTokens: Int?
    /// Maximum number of prompt (input) tokens the model accepts
    public var maxPromptTokens: Int?
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
        case maxOutputTokens
        case maxPromptTokens
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
        maxOutputTokens: Int? = nil,
        maxPromptTokens: Int? = nil,
        supportsVision: Bool? = nil,
        policyState: PolicyState? = nil,
        configSchema: ConfigSchema? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.provider = provider
        self.name = name
        self.maxContextWindow = maxContextWindow
        self.maxOutputTokens = maxOutputTokens
        self.maxPromptTokens = maxPromptTokens
        self.supportsVision = supportsVision
        self.policyState = policyState
        self.configSchema = configSchema
        self.meta = meta
    }
}

public struct ModelSelection: Codable, Sendable {
    /// Model identifier
    public var id: String
    /// Model-specific configuration values. Values are JSON primitives: most
    /// pickers produce strings, but some (e.g. a numeric context-size picker)
    /// produce numbers or booleans, which are carried through as-is.
    public var config: [String: AnyCodable]?

    public init(
        id: String,
        config: [String: AnyCodable]? = nil
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
    /// JSON Schema: allowed values. May be primitives of any JSON type.
    public var `enum`: [AnyCodable]?
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
    /// JSON Schema: schema for additional properties not listed in `properties` (used when `type` is `'object'`).
    public var additionalProperties: ConfigPropertySchema?

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
        case additionalProperties
    }

    public init(
        type: String,
        title: String,
        description: String? = nil,
        `default`: AnyCodable? = nil,
        `enum`: [AnyCodable]? = nil,
        enumLabels: [String]? = nil,
        enumDescriptions: [String]? = nil,
        readOnly: Bool? = nil,
        items: ConfigPropertySchema? = nil,
        properties: [String: ConfigPropertySchema]? = nil,
        required: [String]? = nil,
        additionalProperties: ConfigPropertySchema? = nil
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
        self.additionalProperties = additionalProperties
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
    /// How this chat came into existence
    public var origin: ChatOrigin?
    /// How the user can interact with this chat. See {@link ChatInteractivity}.
    ///
    /// Supports agent-team patterns where worker chats are read-only or hidden.
    /// Absence defaults to {@link ChatInteractivity.Full} for backward
    /// compatibility.
    public var interactivity: ChatInteractivity?
    /// The subset of the session's
    /// {@link SessionState.workingDirectories | `workingDirectories`} that this
    /// chat's agent has tool access to. Every entry MUST be present in the owning
    /// session's `workingDirectories`; servers MUST reject a
    /// `chat/workingDirectorySet` action that violates this constraint.
    ///
    /// When absent, the chat inherits the full session set. When present but empty
    /// (not recommended), the chat has no working-directory tool access at all.
    ///
    /// Dispatch `chat/workingDirectorySet` / `chat/workingDirectoryRemoved` to
    /// update the subset on a running chat.
    public var workingDirectories: [String]?
    /// Completed turns
    public var turns: [Turn]
    /// Cursor for loading older completed turns into this chat state.
    ///
    /// Presence means `turns` is a tail window and more historical turns are
    /// available. Pass this opaque cursor to `fetchTurns`; the host MUST insert
    /// the loaded turns into state and update or clear this cursor before
    /// responding. Absence means the state contains all retained turns.
    public var turnsNextCursor: String?
    /// Currently in-progress turn
    public var activeTurn: ActiveTurn?
    /// Message to inject into the current turn at a convenient point
    public var steeringMessage: PendingMessage?
    /// Messages to send automatically as new turns after the current turn finishes
    public var queuedMessages: [PendingMessage]?
    /// The user's in-progress draft input for this chat — the message they are
    /// composing but have not sent yet, including its
    /// {@link Message.model | model} / {@link Message.agent | agent} selection
    /// and attachments.
    ///
    /// Clients MAY periodically sync their local input state into this field so
    /// a draft survives reloads and is visible to other clients viewing the same
    /// chat. Eager syncing is **not** required — clients SHOULD debounce and MAY
    /// sync only at convenient points. When presenting input UI for an existing
    /// chat, clients SHOULD use any `draft` to initialize their input state.
    /// Cleared (set to `undefined`) once the message is sent.
    public var draft: Message?
    /// Additional provider-specific metadata for this chat.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case resource
        case title
        case status
        case activity
        case modifiedAt
        case origin
        case interactivity
        case workingDirectories
        case turns
        case turnsNextCursor
        case activeTurn
        case steeringMessage
        case queuedMessages
        case draft
        case meta = "_meta"
    }

    public init(
        resource: String,
        title: String,
        status: SessionStatus,
        activity: String? = nil,
        modifiedAt: String,
        origin: ChatOrigin? = nil,
        interactivity: ChatInteractivity? = nil,
        workingDirectories: [String]? = nil,
        turns: [Turn],
        turnsNextCursor: String? = nil,
        activeTurn: ActiveTurn? = nil,
        steeringMessage: PendingMessage? = nil,
        queuedMessages: [PendingMessage]? = nil,
        draft: Message? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.resource = resource
        self.title = title
        self.status = status
        self.activity = activity
        self.modifiedAt = modifiedAt
        self.origin = origin
        self.interactivity = interactivity
        self.workingDirectories = workingDirectories
        self.turns = turns
        self.turnsNextCursor = turnsNextCursor
        self.activeTurn = activeTurn
        self.steeringMessage = steeringMessage
        self.queuedMessages = queuedMessages
        self.draft = draft
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
        resource: String,
        title: String,
        status: SessionStatus,
        activity: String? = nil,
        modifiedAt: String,
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

public struct SideChatSelection: Codable, Sendable {
    /// Exact selected-text snapshot captured at `createChat` acceptance.
    ///
    /// MUST be non-empty.
    public var text: String
    /// Optional provenance for the response part that contained {@link text} when
    /// the host took the snapshot.
    ///
    /// Advisory only: this is not a live range or offset and MUST NOT be used to
    /// recompute `text`.
    public var responsePartId: String?

    public init(
        text: String,
        responsePartId: String? = nil
    ) {
        self.text = text
        self.responsePartId = responsePartId
    }
}

public struct SessionState: Codable, Sendable {
    /// Agent provider ID
    public var provider: String
    /// Session title
    public var title: String
    /// Current session status
    public var status: SessionStatus
    /// Human-readable description of what the session is currently doing
    public var activity: String?
    /// Durable {@link AutomationSessionOrigin}, when an automation run created this session.
    public var origin: SessionOrigin?
    /// Server-owned project for this session
    public var project: ProjectInfo?
    /// The working directories the session's agent has tool access to, as
    /// maintained by working-directory actions. Directories are equal peers except
    /// when the agent advertises
    /// {@link MultipleWorkingDirectoriesCapability.immutablePrimary} without
    /// {@link MultipleWorkingDirectoriesCapability.primaryReplacement} (the first
    /// entry is then a fixed process root), or advertises `primaryReplacement`
    /// (the first entry is a protected, replaceable primary slot). Individual chats
    /// MAY restrict to a subset via
    /// {@link ChatSummary.workingDirectories | their own `workingDirectories`}; a
    /// chat that sets none operates against this full set.
    public var workingDirectories: [String]?
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    public var annotations: AnnotationsSummary?
    /// Session initialization state
    public var lifecycle: SessionLifecycle
    /// Error details if creation failed
    public var creationError: ErrorInfo?
    /// Tools provided by the server (agent host) for this session
    public var serverTools: [ToolDefinition]?
    /// The clients currently providing tools and interactive capabilities to this
    /// session. If multiple tools or customizations are provided by the same
    /// active client, an agent host MAY deduplicate them when exposed to a model,
    /// with a preference given to the client that started the turn.
    ///
    /// Membership is host-managed: clients add (or refresh) themselves with
    /// `session/activeClientSet`, and the host removes them with
    /// `session/activeClientRemoved` when they unsubscribe, disconnect without
    /// reconnecting in time, or reconnect without resubscribing to the session.
    public var activeClients: [SessionActiveClient]
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
    /// {@link SessionActiveClient.customizations | `activeClients[].customizations`}
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
    /// Outstanding input the session is blocked on, aggregated across every chat
    /// so a client can discover and answer it from the session channel alone,
    /// without subscribing to individual chats.
    ///
    /// Each entry is self-sufficient: it carries the owning chat's URI plus every
    /// identifier the client needs to respond. A client answers by dispatching the
    /// ordinary `chat/*` action to that chat's channel — see
    /// {@link SessionInputRequest} for the per-variant response path. A list
    /// holding any entry other than
    /// {@link SessionInputRequestKind.ToolClientExecution} implies
    /// {@link SessionStatus.InputNeeded} on {@link SessionSummary.status};
    /// client-execution entries are work delegated to a client rather than a
    /// prompt, so they leave the session's activity unchanged.
    ///
    /// Host-managed: the host upserts entries with `session/inputNeededSet` as
    /// chats raise requests and removes them with `session/inputNeededRemoved`
    /// once the underlying request resolves.
    public var inputNeeded: [SessionInputRequest]?
    /// Additional provider-specific metadata for this session.
    ///
    /// Clients MAY look for well-known keys here to provide enhanced UI.
    /// For example, a `git` key may provide extra git metadata about the session's
    /// working directories.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case provider
        case title
        case status
        case activity
        case origin
        case project
        case workingDirectories
        case annotations
        case lifecycle
        case creationError
        case serverTools
        case activeClients
        case chats
        case defaultChat
        case config
        case customizations
        case changesets
        case inputNeeded
        case meta = "_meta"
    }

    public init(
        provider: String,
        title: String,
        status: SessionStatus,
        activity: String? = nil,
        origin: SessionOrigin? = nil,
        project: ProjectInfo? = nil,
        workingDirectories: [String]? = nil,
        annotations: AnnotationsSummary? = nil,
        lifecycle: SessionLifecycle,
        creationError: ErrorInfo? = nil,
        serverTools: [ToolDefinition]? = nil,
        activeClients: [SessionActiveClient],
        chats: [ChatSummary],
        defaultChat: String? = nil,
        config: SessionConfigState? = nil,
        customizations: [Customization]? = nil,
        changesets: [Changeset]? = nil,
        inputNeeded: [SessionInputRequest]? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.provider = provider
        self.title = title
        self.status = status
        self.activity = activity
        self.origin = origin
        self.project = project
        self.workingDirectories = workingDirectories
        self.annotations = annotations
        self.lifecycle = lifecycle
        self.creationError = creationError
        self.serverTools = serverTools
        self.activeClients = activeClients
        self.chats = chats
        self.defaultChat = defaultChat
        self.config = config
        self.customizations = customizations
        self.changesets = changesets
        self.inputNeeded = inputNeeded
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
    /// Additional provider-specific metadata about this active client, such as
    /// the participant role a host assigns to a connection or whether the host
    /// treats it as read-only. Mirrors the MCP `_meta` convention.
    ///
    /// A host SHOULD stamp participant semantics here explicitly rather than
    /// leaving consumers to infer them: an empty
    /// {@link SessionActiveClient.tools | `tools`} or
    /// {@link SessionActiveClient.customizations | `customizations`} list means
    /// only that the client publishes nothing, never that it is read-only. See
    /// the customizations guide for the full `_meta` semantics.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case clientId
        case displayName
        case tools
        case customizations
        case meta = "_meta"
    }

    public init(
        clientId: String,
        displayName: String? = nil,
        tools: [ToolDefinition],
        customizations: [ClientPluginCustomization]? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.clientId = clientId
        self.displayName = displayName
        self.tools = tools
        self.customizations = customizations
        self.meta = meta
    }
}

public struct SessionChatInputRequest: Codable, Sendable {
    /// Stable key for this entry, unique within the session's
    /// {@link SessionState.inputNeeded} list. The host derives it however it likes
    /// (for example from the chat URI plus the underlying request or tool-call
    /// id); consumers MUST treat it as opaque. It is the key for the
    /// `session/inputNeededSet` / `session/inputNeededRemoved` upsert convention.
    public var id: String
    /// The chat the underlying request lives in. This is the channel a client
    /// dispatches its response to — it does not need to have subscribed to that
    /// chat first.
    public var chat: String
    public var kind: SessionInputRequestKind
    /// The mirrored chat input request.
    public var request: ChatInputRequest

    public init(
        id: String,
        chat: String,
        kind: SessionInputRequestKind,
        request: ChatInputRequest
    ) {
        self.id = id
        self.chat = chat
        self.kind = kind
        self.request = request
    }
}

public struct SessionToolConfirmationRequest: Codable, Sendable {
    /// Stable key for this entry, unique within the session's
    /// {@link SessionState.inputNeeded} list. The host derives it however it likes
    /// (for example from the chat URI plus the underlying request or tool-call
    /// id); consumers MUST treat it as opaque. It is the key for the
    /// `session/inputNeededSet` / `session/inputNeededRemoved` upsert convention.
    public var id: String
    /// The chat the underlying request lives in. This is the channel a client
    /// dispatches its response to — it does not need to have subscribed to that
    /// chat first.
    public var chat: String
    public var kind: SessionInputRequestKind
    /// The turn the tool call belongs to.
    public var turnId: String
    /// The tool call awaiting confirmation.
    public var toolCall: ToolCallConfirmationState

    public init(
        id: String,
        chat: String,
        kind: SessionInputRequestKind,
        turnId: String,
        toolCall: ToolCallConfirmationState
    ) {
        self.id = id
        self.chat = chat
        self.kind = kind
        self.turnId = turnId
        self.toolCall = toolCall
    }
}

public struct SessionToolClientExecutionRequest: Codable, Sendable {
    /// Stable key for this entry, unique within the session's
    /// {@link SessionState.inputNeeded} list. The host derives it however it likes
    /// (for example from the chat URI plus the underlying request or tool-call
    /// id); consumers MUST treat it as opaque. It is the key for the
    /// `session/inputNeededSet` / `session/inputNeededRemoved` upsert convention.
    public var id: String
    /// The chat the underlying request lives in. This is the channel a client
    /// dispatches its response to — it does not need to have subscribed to that
    /// chat first.
    public var chat: String
    public var kind: SessionInputRequestKind
    /// The turn the tool call belongs to.
    public var turnId: String
    /// The `clientId` expected to execute the tool. Matches the `clientId` of the
    /// tool call's client {@link ToolCallContributor}.
    public var clientId: String
    /// The running tool call the session wants the owning client to execute. The
    /// host only ever populates this with a {@link ToolCallRunningState}.
    public var toolCall: ToolCallRunningState

    public init(
        id: String,
        chat: String,
        kind: SessionInputRequestKind,
        turnId: String,
        clientId: String,
        toolCall: ToolCallRunningState
    ) {
        self.id = id
        self.chat = chat
        self.kind = kind
        self.turnId = turnId
        self.clientId = clientId
        self.toolCall = toolCall
    }
}

public struct SessionToolAuthenticationRequest: Codable, Sendable {
    /// Stable key for this entry, unique within the session's
    /// {@link SessionState.inputNeeded} list. The host derives it however it likes
    /// (for example from the chat URI plus the underlying request or tool-call
    /// id); consumers MUST treat it as opaque. It is the key for the
    /// `session/inputNeededSet` / `session/inputNeededRemoved` upsert convention.
    public var id: String
    /// The chat the underlying request lives in. This is the channel a client
    /// dispatches its response to — it does not need to have subscribed to that
    /// chat first.
    public var chat: String
    public var kind: SessionInputRequestKind
    /// The turn the tool call belongs to.
    public var turnId: String
    /// The tool call awaiting authentication.
    public var toolCall: ToolCallAuthRequiredState

    public init(
        id: String,
        chat: String,
        kind: SessionInputRequestKind,
        turnId: String,
        toolCall: ToolCallAuthRequiredState
    ) {
        self.id = id
        self.chat = chat
        self.kind = kind
        self.turnId = turnId
        self.toolCall = toolCall
    }
}

public struct SessionSummary: Codable, Sendable {
    /// Agent provider ID
    public var provider: String
    /// Session title
    public var title: String
    /// Current session status
    public var status: SessionStatus
    /// Human-readable description of what the session is currently doing
    public var activity: String?
    /// Durable {@link AutomationSessionOrigin}, when an automation run created this session.
    public var origin: SessionOrigin?
    /// Server-owned project for this session
    public var project: ProjectInfo?
    /// The working directories the session's agent has tool access to, as
    /// maintained by working-directory actions. Directories are equal peers except
    /// when the agent advertises
    /// {@link MultipleWorkingDirectoriesCapability.immutablePrimary} without
    /// {@link MultipleWorkingDirectoriesCapability.primaryReplacement} (the first
    /// entry is then a fixed process root), or advertises `primaryReplacement`
    /// (the first entry is a protected, replaceable primary slot). Individual chats
    /// MAY restrict to a subset via
    /// {@link ChatSummary.workingDirectories | their own `workingDirectories`}; a
    /// chat that sets none operates against this full set.
    public var workingDirectories: [String]?
    /// Lightweight summary of this session's inline annotations channel
    /// (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
    /// annotation / entry counts without subscribing. Absent when the session
    /// does not expose an annotations channel.
    public var annotations: AnnotationsSummary?
    /// Session URI
    public var resource: String
    /// Creation timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    public var createdAt: String
    /// Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
    public var modifiedAt: String
    /// Aggregate summary of file changes associated with this session. Servers
    /// may populate this to give clients a quick at-a-glance view of the
    /// session's footprint (e.g., for list rendering) without requiring the
    /// client to subscribe to a changeset.
    public var changes: ChangesSummary?
    /// Lightweight server-defined metadata clients may use for the session
    /// presentation. The protocol does not interpret these values; producers
    /// SHOULD keep the payload small because summaries appear in session lists
    /// and session notifications.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case provider
        case title
        case status
        case activity
        case origin
        case project
        case workingDirectories
        case annotations
        case resource
        case createdAt
        case modifiedAt
        case changes
        case meta = "_meta"
    }

    public init(
        provider: String,
        title: String,
        status: SessionStatus,
        activity: String? = nil,
        origin: SessionOrigin? = nil,
        project: ProjectInfo? = nil,
        workingDirectories: [String]? = nil,
        annotations: AnnotationsSummary? = nil,
        resource: String,
        createdAt: String,
        modifiedAt: String,
        changes: ChangesSummary? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.provider = provider
        self.title = title
        self.status = status
        self.activity = activity
        self.origin = origin
        self.project = project
        self.workingDirectories = workingDirectories
        self.annotations = annotations
        self.resource = resource
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.changes = changes
        self.meta = meta
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
    /// ISO 8601 timestamp when this turn started.
    public var startedAt: String?
    /// Turn duration in milliseconds.
    public var duration: Int?
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

    public init(
        id: String,
        startedAt: String? = nil,
        duration: Int? = nil,
        message: Message,
        responseParts: [ResponsePart],
        usage: UsageInfo? = nil,
        state: TurnState
    ) {
        self.id = id
        self.startedAt = startedAt
        self.duration = duration
        self.message = message
        self.responseParts = responseParts
        self.usage = usage
        self.state = state
    }
}

public struct ActiveTurn: Codable, Sendable {
    /// Turn identifier
    public var id: String
    /// ISO 8601 timestamp when this turn started.
    public var startedAt: String
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
        startedAt: String,
        message: Message,
        responseParts: [ResponsePart],
        usage: UsageInfo? = nil
    ) {
        self.id = id
        self.startedAt = startedAt
        self.message = message
        self.responseParts = responseParts
        self.usage = usage
    }
}

public struct Message: Codable, Sendable {
    /// Message text
    public var text: String
    /// The origin of the message
    public var origin: MessageOrigin
    /// File/selection attachments
    public var attachments: [MessageAttachment]?
    /// The model this message was, or will be, sent with.
    ///
    /// For historic user/agent messages this records the model actually used, so
    /// a client editing or resending the message can retain that selection. For a
    /// {@link ChatState.draft | draft} it carries the model the user picked for
    /// the message they are composing. Absent means the agent host's default
    /// model applies.
    public var model: ModelSelection?
    /// The custom agent this message was, or will be, sent with.
    ///
    /// For historic messages this records the agent actually used; for a
    /// {@link ChatState.draft | draft} it carries the agent the user picked.
    /// Absent means no custom agent — the provider's default behavior applies.
    public var agent: AgentSelection?
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
        case model
        case agent
        case meta = "_meta"
    }

    public init(
        text: String,
        origin: MessageOrigin,
        attachments: [MessageAttachment]? = nil,
        model: ModelSelection? = nil,
        agent: AgentSelection? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.text = text
        self.origin = origin
        self.attachments = attachments
        self.model = model
        self.agent = agent
        self.meta = meta
    }
}

public struct MessageOrigin: Codable, Sendable {
    /// The kind of actor that produced the message.
    public var kind: MessageKind

    public init(
        kind: MessageKind
    ) {
        self.kind = kind
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
    /// Content nonce
    public var nonce: String?
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
        case nonce
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
        nonce: String? = nil,
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
        self.nonce = nonce
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

public struct MessageChatAttachment: Codable, Sendable {
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
    /// URI of the referenced chat.
    public var resource: String
    /// Last completed turn included in the referenced transcript. When omitted,
    /// the host pins the latest completed turn when accepting the message.
    public var endTurn: String?

    enum CodingKeys: String, CodingKey {
        case label
        case range
        case displayKind
        case meta = "_meta"
        case type
        case resource
        case endTurn
    }

    public init(
        label: String,
        range: TextRange? = nil,
        displayKind: String? = nil,
        meta: [String: AnyCodable]? = nil,
        type: MessageAttachmentKind,
        resource: String,
        endTurn: String? = nil
    ) {
        self.label = label
        self.range = range
        self.displayKind = displayKind
        self.meta = meta
        self.type = type
        self.resource = resource
        self.endTurn = endTurn
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
    /// Content nonce
    public var nonce: String?

    public init(
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil,
        nonce: String? = nil
    ) {
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
        self.nonce = nonce
    }
}

public struct ResourceResponsePart: Codable, Sendable {
    /// Content URI
    public var uri: String
    /// Approximate size in bytes
    public var sizeHint: Int?
    /// Content MIME type
    public var contentType: String?
    /// Content nonce
    public var nonce: String?
    /// Discriminant
    public var kind: ResponsePartKind

    public init(
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil,
        nonce: String? = nil,
        kind: ResponsePartKind
    ) {
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
        self.nonce = nonce
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
    /// Additional provider-specific metadata for this notification.
    ///
    /// A host MAY attach a machine-readable descriptor of what triggered the
    /// notification so clients can categorize, icon, group, filter, or localize
    /// it without parsing `content`. Clients MAY look for well-known keys here to
    /// provide enhanced UI, and MUST render coherently from `content` alone when
    /// `_meta` is absent or unrecognized.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case kind
        case content
        case meta = "_meta"
    }

    public init(
        kind: ResponsePartKind,
        content: StringOrMarkdown,
        meta: [String: AnyCodable]? = nil
    ) {
        self.kind = kind
        self.content = content
        self.meta = meta
    }
}

public struct InputRequestResponsePart: Codable, Sendable {
    /// Discriminant
    public var kind: ResponsePartKind
    /// The request, carrying its `id`, `message`, `url`, `questions`, and current
    /// draft or submitted `answers`.
    public var request: ChatInputRequest
    /// How the request was resolved. Absent until a client submits `accept`,
    /// `decline`, or `cancel` with `chat/inputCompleted`.
    public var response: ChatInputResponseKind?

    public init(
        kind: ResponsePartKind,
        request: ChatInputRequest,
        response: ChatInputResponseKind? = nil
    ) {
        self.kind = kind
        self.request = request
        self.response = response
    }
}

public struct ErrorResponsePart: Codable, Sendable {
    /// Discriminant
    public var kind: ResponsePartKind
    /// Error details.
    public var error: ErrorInfo
    /// Whether the host can resume the turn from this error. Only `true` enables resume.
    public var resumable: Bool?

    public init(
        kind: ResponsePartKind,
        error: ErrorInfo,
        resumable: Bool? = nil
    ) {
        self.kind = kind
        self.error = error
        self.resumable = resumable
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
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
    /// Reference to the contributor of the tool being called.
    public var contributor: ToolCallContributor?
    /// Additional provider-specific metadata for this tool call.
    ///
    /// This MAY include a `ui` field corresponding to the MCP Apps (SEP-1865)
    /// `McpUiToolMeta` found in MCP tool calls, which may be used in combination
    /// with the {@link contributor} to serve MCP Apps.
    public var meta: [String: AnyCodable]?
    public var status: ToolCallStatus
    /// Partial parameters accumulated from tool-call deltas.
    public var partialInput: String?
    /// Progress message shown while parameters are streaming
    public var invocationMessage: StringOrMarkdown?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case intention
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
        intention: String? = nil,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        status: ToolCallStatus,
        partialInput: String? = nil,
        invocationMessage: StringOrMarkdown? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
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
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
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
    /// Final tool input.
    ///
    /// Referenced input is mutable until the tool call leaves
    /// `pending-confirmation`. When the client confirms with `editedToolInput`,
    /// the host MUST replace the resource contents before echoing the accepted
    /// confirmation action. Clients MUST NOT cache tool input across confirmation.
    public var toolInput: ToolInput?
    public var status: ToolCallStatus
    /// Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
    public var confirmationTitle: StringOrMarkdown?
    /// Risk assessment that informed the confirmation requirement.
    public var riskAssessment: ToolCallRiskAssessment?
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
        case intention
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case status
        case confirmationTitle
        case riskAssessment
        case edits
        case editable
        case options
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        intention: String? = nil,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: ToolInput? = nil,
        status: ToolCallStatus,
        confirmationTitle: StringOrMarkdown? = nil,
        riskAssessment: ToolCallRiskAssessment? = nil,
        edits: AnyCodable? = nil,
        editable: Bool? = nil,
        options: [ConfirmationOption]? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.status = status
        self.confirmationTitle = confirmationTitle
        self.riskAssessment = riskAssessment
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
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
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
    /// Final tool input.
    ///
    /// Referenced input is mutable until the tool call leaves
    /// `pending-confirmation`. When the client confirms with `editedToolInput`,
    /// the host MUST replace the resource contents before echoing the accepted
    /// confirmation action. Clients MUST NOT cache tool input across confirmation.
    public var toolInput: ToolInput?
    /// How the tool was confirmed for execution
    public var confirmed: ToolCallConfirmationReason
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?
    public var status: ToolCallStatus
    /// Partial content produced while the tool is still executing.
    ///
    /// For example, a terminal content block lets clients subscribe to live
    /// output before the tool completes.
    public var content: [ToolResultContent]?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case intention
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case confirmed
        case selectedOption
        case status
        case content
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        intention: String? = nil,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: ToolInput? = nil,
        confirmed: ToolCallConfirmationReason,
        selectedOption: ConfirmationOption? = nil,
        status: ToolCallStatus,
        content: [ToolResultContent]? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.confirmed = confirmed
        self.selectedOption = selectedOption
        self.status = status
        self.content = content
    }
}

public struct ToolCallAuthRequiredState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
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
    /// Final tool input.
    ///
    /// Referenced input is mutable until the tool call leaves
    /// `pending-confirmation`. When the client confirms with `editedToolInput`,
    /// the host MUST replace the resource contents before echoing the accepted
    /// confirmation action. Clients MUST NOT cache tool input across confirmation.
    public var toolInput: ToolInput?
    /// How the tool was confirmed for execution
    public var confirmed: ToolCallConfirmationReason
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?
    public var status: ToolCallStatus
    /// The authentication challenge blocking this invocation.
    public var auth: McpAuthRequirement
    /// Partial content produced before the call paused for authentication.
    public var content: [ToolResultContent]?

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case intention
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case confirmed
        case selectedOption
        case status
        case auth
        case content
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        intention: String? = nil,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: ToolInput? = nil,
        confirmed: ToolCallConfirmationReason,
        selectedOption: ConfirmationOption? = nil,
        status: ToolCallStatus,
        auth: McpAuthRequirement,
        content: [ToolResultContent]? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.confirmed = confirmed
        self.selectedOption = selectedOption
        self.status = status
        self.auth = auth
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
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
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
    /// Final tool input.
    ///
    /// Referenced input is mutable until the tool call leaves
    /// `pending-confirmation`. When the client confirms with `editedToolInput`,
    /// the host MUST replace the resource contents before echoing the accepted
    /// confirmation action. Clients MUST NOT cache tool input across confirmation.
    public var toolInput: ToolInput?
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
    /// How the tool was confirmed for execution
    public var confirmed: ToolCallConfirmationReason
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?
    public var status: ToolCallStatus

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case intention
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case success
        case pastTenseMessage
        case content
        case structuredContent
        case error
        case confirmed
        case selectedOption
        case status
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        intention: String? = nil,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: ToolInput? = nil,
        success: Bool,
        pastTenseMessage: StringOrMarkdown,
        content: [ToolResultContent]? = nil,
        structuredContent: [String: AnyCodable]? = nil,
        error: AnyCodable? = nil,
        confirmed: ToolCallConfirmationReason,
        selectedOption: ConfirmationOption? = nil,
        status: ToolCallStatus
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.success = success
        self.pastTenseMessage = pastTenseMessage
        self.content = content
        self.structuredContent = structuredContent
        self.error = error
        self.confirmed = confirmed
        self.selectedOption = selectedOption
        self.status = status
    }
}

public struct ToolCallCompletedState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
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
    /// Final tool input.
    ///
    /// Referenced input is mutable until the tool call leaves
    /// `pending-confirmation`. When the client confirms with `editedToolInput`,
    /// the host MUST replace the resource contents before echoing the accepted
    /// confirmation action. Clients MUST NOT cache tool input across confirmation.
    public var toolInput: ToolInput?
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
    /// How the tool was confirmed for execution
    public var confirmed: ToolCallConfirmationReason
    /// The confirmation option the user selected, if confirmation options were provided
    public var selectedOption: ConfirmationOption?
    public var status: ToolCallStatus

    enum CodingKeys: String, CodingKey {
        case toolCallId
        case toolName
        case displayName
        case intention
        case contributor
        case meta = "_meta"
        case invocationMessage
        case toolInput
        case success
        case pastTenseMessage
        case content
        case structuredContent
        case error
        case confirmed
        case selectedOption
        case status
    }

    public init(
        toolCallId: String,
        toolName: String,
        displayName: String,
        intention: String? = nil,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: ToolInput? = nil,
        success: Bool,
        pastTenseMessage: StringOrMarkdown,
        content: [ToolResultContent]? = nil,
        structuredContent: [String: AnyCodable]? = nil,
        error: AnyCodable? = nil,
        confirmed: ToolCallConfirmationReason,
        selectedOption: ConfirmationOption? = nil,
        status: ToolCallStatus
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
        self.contributor = contributor
        self.meta = meta
        self.invocationMessage = invocationMessage
        self.toolInput = toolInput
        self.success = success
        self.pastTenseMessage = pastTenseMessage
        self.content = content
        self.structuredContent = structuredContent
        self.error = error
        self.confirmed = confirmed
        self.selectedOption = selectedOption
        self.status = status
    }
}

public struct ToolCallCancelledState: Codable, Sendable {
    /// Unique tool call identifier
    public var toolCallId: String
    /// Internal tool name (for debugging/logging)
    public var toolName: String
    /// Human-readable tool name
    public var displayName: String
    /// Human-readable description of what the tool invocation intends to do
    public var intention: String?
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
    /// Final tool input.
    ///
    /// Referenced input is mutable until the tool call leaves
    /// `pending-confirmation`. When the client confirms with `editedToolInput`,
    /// the host MUST replace the resource contents before echoing the accepted
    /// confirmation action. Clients MUST NOT cache tool input across confirmation.
    public var toolInput: ToolInput?
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
        case intention
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
        intention: String? = nil,
        contributor: ToolCallContributor? = nil,
        meta: [String: AnyCodable]? = nil,
        invocationMessage: StringOrMarkdown,
        toolInput: ToolInput? = nil,
        status: ToolCallStatus,
        reason: ToolCallCancellationReason,
        reasonMessage: StringOrMarkdown? = nil,
        userSuggestion: Message? = nil,
        selectedOption: ConfirmationOption? = nil
    ) {
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.displayName = displayName
        self.intention = intention
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

public struct ToolCallRiskAssessmentLoadingState: Codable, Sendable {
    public var kind: ToolCallRiskAssessmentKind
    public var status: ToolCallRiskAssessmentStatus

    public init(
        kind: ToolCallRiskAssessmentKind,
        status: ToolCallRiskAssessmentStatus
    ) {
        self.kind = kind
        self.status = status
    }
}

public struct ToolCallRiskAssessmentCompleteState: Codable, Sendable {
    public var kind: ToolCallRiskAssessmentKind
    public var status: ToolCallRiskAssessmentStatus
    public var reason: StringOrMarkdown
    /// The judge's normalized safety score, where `0` is unsafe and `1` is safe.
    public var safety: Double

    public init(
        kind: ToolCallRiskAssessmentKind,
        status: ToolCallRiskAssessmentStatus,
        reason: StringOrMarkdown,
        safety: Double
    ) {
        self.kind = kind
        self.status = status
        self.reason = reason
        self.safety = safety
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
    /// Content nonce
    public var nonce: String?
    public var type: ToolResultContentType

    public init(
        uri: String,
        sizeHint: Int? = nil,
        contentType: String? = nil,
        nonce: String? = nil,
        type: ToolResultContentType
    ) {
        self.uri = uri
        self.sizeHint = sizeHint
        self.contentType = contentType
        self.nonce = nonce
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
    /// Whether this terminal-style resource is backed by a pseudoterminal.
    /// When `false`, output is plain text and clients do not need to parse
    /// VT sequences.
    public var isPty: Bool?
    /// Outcome of the command, present once it has exited.
    public var result: TerminalCommandResult?

    public init(
        type: ToolResultContentType,
        resource: String,
        title: String,
        isPty: Bool? = nil,
        result: TerminalCommandResult? = nil
    ) {
        self.type = type
        self.resource = resource
        self.title = title
        self.isPty = isPty
        self.result = result
    }
}

public struct ToolResultSubagentContent: Codable, Sendable {
    public var type: ToolResultContentType
    /// Worker chat URI (subscribable for full chat state)
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
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
    /// Explicit enablement decisions. See {@link McpServerCustomization.enablement}.
    public var enablement: [CustomizationEnablement]?
    /// Version of the plugin, sourced from the
    /// [Open Plugins](https://open-plugins.com/) manifest's optional
    /// `version` field (semver, e.g. `"1.2.0"`). Absent when the manifest
    /// declares no version — the field is optional there — or the source
    /// has no version concept. Provenance / display only: the host neither
    /// parses nor enforces it.
    public var version: String?

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case clientId
        case load
        case children
        case type
        case enablement
        case version
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        clientId: String? = nil,
        load: CustomizationLoadState? = nil,
        children: [ChildCustomization]? = nil,
        type: CustomizationType,
        enablement: [CustomizationEnablement]? = nil,
        version: String? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.clientId = clientId
        self.load = load
        self.children = children
        self.type = type
        self.enablement = enablement
        self.version = version
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
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
    /// Explicit enablement decisions. See {@link McpServerCustomization.enablement}.
    public var enablement: [CustomizationEnablement]?
    /// Version of the plugin, sourced from the
    /// [Open Plugins](https://open-plugins.com/) manifest's optional
    /// `version` field (semver, e.g. `"1.2.0"`). Absent when the manifest
    /// declares no version — the field is optional there — or the source
    /// has no version concept. Provenance / display only: the host neither
    /// parses nor enforces it.
    public var version: String?
    /// Opaque version token used by the host to detect changes.
    public var nonce: String?
    /// Explicit enablement decisions for children this plugin contributes,
    /// keyed by child name (for MCP servers, the server name as it appears in
    /// the bundled `.mcp.json`).
    ///
    /// Bundled children are discovered by the host rather than published by the
    /// client, so the client cannot attach `enablement` to them directly. This
    /// carries the client's global decision for each one; the host applies it
    /// under the child's durable key.
    public var childEnablement: [String: [CustomizationEnablement]]?

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case clientId
        case load
        case children
        case type
        case enablement
        case version
        case nonce
        case childEnablement
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        clientId: String? = nil,
        load: CustomizationLoadState? = nil,
        children: [ChildCustomization]? = nil,
        type: CustomizationType,
        enablement: [CustomizationEnablement]? = nil,
        version: String? = nil,
        nonce: String? = nil,
        childEnablement: [String: [CustomizationEnablement]]? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.clientId = clientId
        self.load = load
        self.children = children
        self.type = type
        self.enablement = enablement
        self.version = version
        self.nonce = nonce
        self.childEnablement = childEnablement
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
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
    /// Whether this container is currently enabled.
    public var enabled: Bool
    /// Which child customization type this directory holds.
    public var contents: CustomizationType
    /// Whether clients may write into this directory.
    public var writable: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case clientId
        case load
        case children
        case type
        case enabled
        case contents
        case writable
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        clientId: String? = nil,
        load: CustomizationLoadState? = nil,
        children: [ChildCustomization]? = nil,
        type: CustomizationType,
        enabled: Bool,
        contents: CustomizationType,
        writable: Bool
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.clientId = clientId
        self.load = load
        self.children = children
        self.type = type
        self.enabled = enabled
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
    /// Whether this child is individually enabled. Absent means enabled, so a
    /// producer only needs to set it to surface a child that exists but is
    /// turned off on its own.
    ///
    /// This flag is independent of the parent container's: the **effective**
    /// enabled state of a plugin child is the plugin's derived enabled value and
    /// `(child.enabled ?? true)`, so a disabled plugin disables every child
    /// regardless of each child's own flag. A directory child instead uses the
    /// directory's `enabled` value and its own flag.
    ///
    /// A child is turned on or off by id with
    /// {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
    public var enabled: Bool?
    public var type: CustomizationType
    /// Short description of what the agent specializes in and when to
    /// invoke it. Sourced from the agent file's frontmatter `description`.
    public var description: String?
    /// Model the agent is pinned to, sourced from the agent file's
    /// frontmatter `model`. Absent means the agent inherits the session's
    /// default model.
    public var model: String?
    /// Allowlist of tool names the agent is scoped to, sourced from the
    /// agent file's frontmatter `tools`. A non-empty list restricts the
    /// agent to exactly those tools. Absent — or an empty list — imposes no
    /// restriction beyond the session default: the agent may use any
    /// available tool. Producers express "no restriction" by omitting the
    /// field rather than sending an empty array, so an empty list carries no
    /// meaning distinct from absence.
    public var tools: [String]?
    /// When `true`, the agent will not auto-delegate to this custom agent
    /// as a sub-agent; it can only be selected by the user. Absent or
    /// `false` means the agent may delegate to it.
    public var disableModelInvocation: Bool?
    /// When `true`, the user cannot select this custom agent (for example,
    /// in a picker); it remains available for the agent to auto-delegate
    /// to. Absent or `false` means the user may select it.
    public var disableUserInvocation: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case enabled
        case type
        case description
        case model
        case tools
        case disableModelInvocation
        case disableUserInvocation
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        enabled: Bool? = nil,
        type: CustomizationType,
        description: String? = nil,
        model: String? = nil,
        tools: [String]? = nil,
        disableModelInvocation: Bool? = nil,
        disableUserInvocation: Bool? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.enabled = enabled
        self.type = type
        self.description = description
        self.model = model
        self.tools = tools
        self.disableModelInvocation = disableModelInvocation
        self.disableUserInvocation = disableUserInvocation
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
    /// Whether this child is individually enabled. Absent means enabled, so a
    /// producer only needs to set it to surface a child that exists but is
    /// turned off on its own.
    ///
    /// This flag is independent of the parent container's: the **effective**
    /// enabled state of a plugin child is the plugin's derived enabled value and
    /// `(child.enabled ?? true)`, so a disabled plugin disables every child
    /// regardless of each child's own flag. A directory child instead uses the
    /// directory's `enabled` value and its own flag.
    ///
    /// A child is turned on or off by id with
    /// {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
    public var enabled: Bool?
    public var type: CustomizationType
    /// Short description used for help text and auto-invocation matching.
    /// Sourced from the skill's frontmatter `description`.
    public var description: String?
    /// When `true`, only the user can invoke this skill — the agent will not
    /// auto-invoke it. Sourced from the command skill's frontmatter
    /// `disable-model-invocation` flag.
    public var disableModelInvocation: Bool?
    /// When `true`, the user cannot directly invoke this skill (for example,
    /// as a slash command); it remains available for the agent to
    /// auto-invoke. Absent or `false` means the user may invoke it.
    public var disableUserInvocation: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case enabled
        case type
        case description
        case disableModelInvocation
        case disableUserInvocation
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        enabled: Bool? = nil,
        type: CustomizationType,
        description: String? = nil,
        disableModelInvocation: Bool? = nil,
        disableUserInvocation: Bool? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.enabled = enabled
        self.type = type
        self.description = description
        self.disableModelInvocation = disableModelInvocation
        self.disableUserInvocation = disableUserInvocation
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
    /// Whether this child is individually enabled. Absent means enabled, so a
    /// producer only needs to set it to surface a child that exists but is
    /// turned off on its own.
    ///
    /// This flag is independent of the parent container's: the **effective**
    /// enabled state of a plugin child is the plugin's derived enabled value and
    /// `(child.enabled ?? true)`, so a disabled plugin disables every child
    /// regardless of each child's own flag. A directory child instead uses the
    /// directory's `enabled` value and its own flag.
    ///
    /// A child is turned on or off by id with
    /// {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
    public var enabled: Bool?
    public var type: CustomizationType
    /// Short description of what the prompt does.
    public var description: String?

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case enabled
        case type
        case description
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        enabled: Bool? = nil,
        type: CustomizationType,
        description: String? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.enabled = enabled
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
    /// Whether this child is individually enabled. Absent means enabled, so a
    /// producer only needs to set it to surface a child that exists but is
    /// turned off on its own.
    ///
    /// This flag is independent of the parent container's: the **effective**
    /// enabled state of a plugin child is the plugin's derived enabled value and
    /// `(child.enabled ?? true)`, so a disabled plugin disables every child
    /// regardless of each child's own flag. A directory child instead uses the
    /// directory's `enabled` value and its own flag.
    ///
    /// A child is turned on or off by id with
    /// {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
    public var enabled: Bool?
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

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case enabled
        case type
        case description
        case alwaysApply
        case globs
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        enabled: Bool? = nil,
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
        self.meta = meta
        self.enabled = enabled
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
    /// Whether this child is individually enabled. Absent means enabled, so a
    /// producer only needs to set it to surface a child that exists but is
    /// turned off on its own.
    ///
    /// This flag is independent of the parent container's: the **effective**
    /// enabled state of a plugin child is the plugin's derived enabled value and
    /// `(child.enabled ?? true)`, so a disabled plugin disables every child
    /// regardless of each child's own flag. A directory child instead uses the
    /// directory's `enabled` value and its own flag.
    ///
    /// A child is turned on or off by id with
    /// {@link SessionCustomizationToggledAction | `session/customizationToggled`}.
    public var enabled: Bool?
    public var type: CustomizationType

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case enabled
        case type
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        enabled: Bool? = nil,
        type: CustomizationType
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.enabled = enabled
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
    /// Additional provider-specific metadata for this customization.
    ///
    /// Mirrors the MCP `_meta` convention. Optional and opaque to the
    /// protocol; producers and consumers agree on its contents
    /// out-of-band.
    public var meta: [String: AnyCodable]?
    public var type: CustomizationType
    /// Explicit enablement decisions for this customization, one entry per scope
    /// that has one. This is a wire contract: producers MUST publish entries
    /// sorted by descending specificity (Session, Workspace, then Global).
    /// The agent host emits at most one Workspace entry, for the session's primary
    /// working directory. Consumers MAY treat
    /// `enablement[0]` as the decisive decision and
    /// `enablement?.[0]?.enabled ?? true` as the effective enabled value. An
    /// absent or empty array means no explicit decision exists, so the
    /// customization is enabled by default.
    ///
    /// Flows in both directions. A client publishes this alongside a customization
    /// to assert its global decision, which is authoritative for the Global scope;
    /// a client always includes its global entry, even when enabled. The host
    /// publishes the fully resolved set across all scopes, and consumers derive
    /// the effective enabled value from that set.
    public var enablement: [CustomizationEnablement]?
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

    enum CodingKeys: String, CodingKey {
        case id
        case uri
        case name
        case icons
        case range
        case meta = "_meta"
        case type
        case enablement
        case state
        case channel
        case mcpApp
    }

    public init(
        id: String,
        uri: String,
        name: String,
        icons: [Icon]? = nil,
        range: TextRange? = nil,
        meta: [String: AnyCodable]? = nil,
        type: CustomizationType,
        enablement: [CustomizationEnablement]? = nil,
        state: McpServerState,
        channel: String? = nil,
        mcpApp: McpServerCustomizationApps? = nil
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.icons = icons
        self.range = range
        self.meta = meta
        self.type = type
        self.enablement = enablement
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
    /// Why authentication is required.
    public var reason: McpAuthRequiredReason
    /// Pre-registered OAuth client to use for authorization. When present, clients
    /// MUST use these credentials instead of dynamic client registration.
    public var oauthClient: McpOAuthClient?
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
    public var kind: McpServerStatus

    public init(
        reason: McpAuthRequiredReason,
        oauthClient: McpOAuthClient? = nil,
        resource: ProtectedResourceMetadata,
        requiredScopes: [String]? = nil,
        description: String? = nil,
        kind: McpServerStatus
    ) {
        self.reason = reason
        self.oauthClient = oauthClient
        self.resource = resource
        self.requiredScopes = requiredScopes
        self.description = description
        self.kind = kind
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

public struct McpOAuthClient: Codable, Sendable {
    /// OAuth client identifier registered with the authorization server.
    public var clientId: String
    /// OAuth client secret for a confidential client. Absence means the client is
    /// public and uses a secretless flow such as authorization code with PKCE.
    public var clientSecret: String?

    public init(
        clientId: String,
        clientSecret: String? = nil
    ) {
        self.clientId = clientId
        self.clientSecret = clientSecret
    }
}

public struct McpAuthRequirement: Codable, Sendable {
    /// Why authentication is required.
    public var reason: McpAuthRequiredReason
    /// Pre-registered OAuth client to use for authorization. When present, clients
    /// MUST use these credentials instead of dynamic client registration.
    public var oauthClient: McpOAuthClient?
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
        reason: McpAuthRequiredReason,
        oauthClient: McpOAuthClient? = nil,
        resource: ProtectedResourceMetadata,
        requiredScopes: [String]? = nil,
        description: String? = nil
    ) {
        self.reason = reason
        self.oauthClient = oauthClient
        self.resource = resource
        self.requiredScopes = requiredScopes
        self.description = description
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

public struct TerminalCommandResult: Codable, Sendable {
    /// Exit code from the completed command, if reported by the runtime
    public var exitCode: Int?
    /// Preview of the command's output, for clients that are not subscribed
    /// to the terminal or that arrive after it is disposed. When `isPty` is
    /// `true` the preview may contain VT sequences; when `false` it is plain
    /// text.
    public var preview: String?
    /// Whether `preview` is known to be incomplete or truncated
    public var truncated: Bool?

    public init(
        exitCode: Int? = nil,
        preview: String? = nil,
        truncated: Bool? = nil
    ) {
        self.exitCode = exitCode
        self.preview = preview
        self.truncated = truncated
    }
}

public struct TerminalInfo: Codable, Sendable {
    /// Terminal URI (subscribable for full terminal state)
    public var resource: String
    /// Human-readable terminal title
    public var title: String
    /// Who currently holds this terminal
    public var claim: TerminalClaim
    /// Current terminal process lifecycle.
    public var lifecycle: TerminalLifecycleState

    public init(
        resource: String,
        title: String,
        claim: TerminalClaim,
        lifecycle: TerminalLifecycleState
    ) {
        self.resource = resource
        self.title = title
        self.claim = claim
        self.lifecycle = lifecycle
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
    /// Chat URI that claimed the terminal.
    public var chat: String
    /// Optional turn identifier within the chat.
    public var turnId: String?
    /// Optional tool call identifier within the turn
    public var toolCallId: String?

    public init(
        kind: TerminalClaimKind,
        session: String,
        chat: String,
        turnId: String? = nil,
        toolCallId: String? = nil
    ) {
        self.kind = kind
        self.session = session
        self.chat = chat
        self.turnId = turnId
        self.toolCallId = toolCallId
    }
}

public struct TerminalRunningLifecycleState: Codable, Sendable {
    public var status: TerminalLifecycleStatus

    public init(
        status: TerminalLifecycleStatus
    ) {
        self.status = status
    }
}

public struct TerminalExitedLifecycleState: Codable, Sendable {
    public var status: TerminalLifecycleStatus
    /// Process exit code, if the runtime reported one.
    public var exitCode: Int?

    public init(
        status: TerminalLifecycleStatus,
        exitCode: Int? = nil
    ) {
        self.status = status
        self.exitCode = exitCode
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
    /// Current terminal process lifecycle.
    public var lifecycle: TerminalLifecycleState
    /// Who currently holds this terminal
    public var claim: TerminalClaim
    /// Whether this terminal emits `terminal/commandExecuted` and
    /// `terminal/commandFinished` actions and populates `command`-typed parts.
    ///
    /// Clients MUST check this flag before relying on command detection.
    /// Do NOT use the presence of a `command` part as a feature flag — parts
    /// are absent in the normal idle state.
    public var supportsCommandDetection: Bool?
    /// Whether this terminal-style resource is backed by a pseudoterminal.
    /// When `false`, output is plain text and clients do not need to parse
    /// VT sequences.
    public var isPty: Bool?

    public init(
        title: String,
        cwd: String? = nil,
        cols: Int? = nil,
        rows: Int? = nil,
        content: [TerminalContentPart],
        lifecycle: TerminalLifecycleState,
        claim: TerminalClaim,
        supportsCommandDetection: Bool? = nil,
        isPty: Bool? = nil
    ) {
        self.title = title
        self.cwd = cwd
        self.cols = cols
        self.rows = rows
        self.content = content
        self.lifecycle = lifecycle
        self.claim = claim
        self.supportsCommandDetection = supportsCommandDetection
        self.isPty = isPty
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
    /// Optional capability declarations for this changeset. Absent (or an empty
    /// object) means the changeset advertises no optional capabilities.
    ///
    /// Because the catalogue entry is delivered up-front on
    /// {@link ChangesetState | the session's changeset list}, clients can decide
    /// whether to surface capability-gated UI (such as review checkboxes) without
    /// first subscribing to the changeset URI. Mirrors the presence-flag
    /// convention of `ClientCapabilities`.
    public var capabilities: ChangesetCapabilities?

    public init(
        label: String,
        uriTemplate: String,
        description: String? = nil,
        changeKind: String,
        capabilities: ChangesetCapabilities? = nil
    ) {
        self.label = label
        self.uriTemplate = uriTemplate
        self.description = description
        self.changeKind = changeKind
        self.capabilities = capabilities
    }
}

public struct ChangesetCapabilities: Codable, Sendable {
    /// The changeset supports the per-file **review** workflow. When declared,
    /// clients MAY surface a GitHub-style "Viewed" toggle per file and dispatch
    /// {@link ChangesetFilesReviewChangedAction | `changeset/filesReviewChanged`} to
    /// set each file's {@link ChangesetFile.reviewed} flag. Clients that omit
    /// handling MUST treat the changeset as non-reviewable.
    public var review: [String: AnyCodable]?

    public init(
        review: [String: AnyCodable]? = nil
    ) {
        self.review = review
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
    /// Whether a reviewer has marked this file as reviewed (the GitHub-style
    /// "Viewed" checkbox). Absent is equivalent to `false` — clients MUST treat
    /// a missing value as not-yet-reviewed.
    ///
    /// Requires the changeset to advertise {@link ChangesetCapabilities.review}.
    /// Clients toggle it by dispatching
    /// {@link ChangesetFilesReviewChangedAction | `changeset/filesReviewChanged`};
    /// the server MAY also originate it (e.g. an agent self-reviewing its own
    /// output).
    ///
    /// There is no content version in the protocol, so review is **not** reset
    /// automatically when a file's contents change under a stable id. The server,
    /// which is the authority on what changed, resets review explicitly — either
    /// by re-emitting the file (via {@link ChangesetFileSetAction} or
    /// {@link ChangesetContentChangedAction}) without `reviewed: true`, or by
    /// dispatching `changeset/filesReviewChanged` with `reviewed: false`.
    public var reviewed: Bool?
    /// Server-defined opaque metadata, surfaced to operations and tooling
    /// but not interpreted by the protocol.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case id
        case edit
        case reviewed
        case meta = "_meta"
    }

    public init(
        id: String,
        edit: FileEdit,
        reviewed: Bool? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.edit = edit
        self.reviewed = reviewed
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

public struct AnnotationOrigin: Codable, Sendable {
    /// Owning session URI.
    public var session: String
    /// Owning chat URI, when the annotation is scoped to a chat.
    public var chat: String?
    /// Turn identifier within {@link chat}, when the annotation is scoped to a turn.
    public var turnId: String?

    public init(
        session: String,
        chat: String? = nil,
        turnId: String? = nil
    ) {
        self.session = session
        self.chat = chat
        self.turnId = turnId
    }
}

public struct Annotation: Codable, Sendable {
    /// Stable identifier within the annotations channel. Assigned by the client
    /// that dispatches the creating {@link AnnotationsSetAction}.
    public var id: String
    /// Provenance of the content this annotation is anchored to.
    public var origin: AnnotationOrigin
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
        case origin
        case resource
        case range
        case resolved
        case entries
        case meta = "_meta"
    }

    public init(
        id: String,
        origin: AnnotationOrigin,
        resource: String,
        range: TextRange? = nil,
        resolved: Bool,
        entries: [AnnotationEntry],
        meta: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.origin = origin
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

public struct AutomationSessionOrigin: Codable, Sendable {
    public var kind: SessionOriginKind
    /// Owning {@link AutomationEntry.resource}.
    public var automation: String
    /// Owning {@link AutomationRunState.resource}.
    public var run: String

    public init(
        kind: SessionOriginKind,
        automation: String,
        run: String
    ) {
        self.kind = kind
        self.automation = automation
        self.run = run
    }
}

public struct AutomationSchedule: Codable, Sendable {
    /// Five-field AHP cron expression described by {@link AutomationSchedule}.
    public var expression: String
    /// IANA Time Zone Database identifier used to interpret the expression, for
    /// example `"UTC"` or `"Europe/Berlin"`.
    public var timeZone: String

    public init(
        expression: String,
        timeZone: String
    ) {
        self.expression = expression
        self.timeZone = timeZone
    }
}

public struct AutomationScheduleTrigger: Codable, Sendable {
    /// Identifier unique and stable within this automation definition. Recorded in
    /// {@link AutomationTriggeredRunOrigin.triggerId} when this trigger creates a
    /// run.
    public var id: String
    public var kind: AutomationTriggerKind
    /// Recurrence and time zone evaluated by the host.
    public var schedule: AutomationSchedule
    /// Policy for missed occurrences. Omission is equivalent to
    /// {@link AutomationMisfirePolicy.RunOnce}.
    public var misfirePolicy: AutomationMisfirePolicy?

    public init(
        id: String,
        kind: AutomationTriggerKind,
        schedule: AutomationSchedule,
        misfirePolicy: AutomationMisfirePolicy? = nil
    ) {
        self.id = id
        self.kind = kind
        self.schedule = schedule
        self.misfirePolicy = misfirePolicy
    }
}

public struct AutomationEventTrigger: Codable, Sendable {
    /// Identifier unique and stable within this automation definition. Recorded in
    /// {@link AutomationTriggeredRunOrigin.triggerId} when this trigger creates a
    /// run.
    public var id: String
    public var kind: AutomationTriggerKind
    /// Matches {@link AutomationTriggerDefinition.type}.
    public var type: String
    /// Host-normalized human-readable trigger type name.
    public var title: String
    /// Optional host-normalized explanation of the trigger source.
    public var description: String?
    /// Selected events for this trigger type.
    ///
    /// Event ids carry the trigger semantics. Titles and descriptions are
    /// last-known display metadata and do not indicate current availability.
    public var events: [AutomationTriggerEventDefinition]
    /// Values described by {@link AutomationTriggerDefinition.configSchema}.
    /// Clients MUST preserve unknown entries when editing other fields.
    public var config: [String: AnyCodable]?

    public init(
        id: String,
        kind: AutomationTriggerKind,
        type: String,
        title: String,
        description: String? = nil,
        events: [AutomationTriggerEventDefinition],
        config: [String: AnyCodable]? = nil
    ) {
        self.id = id
        self.kind = kind
        self.type = type
        self.title = title
        self.description = description
        self.events = events
        self.config = config
    }
}

public struct AutomationTriggerEventDefinition: Codable, Sendable {
    /// Stable event id.
    public var id: String
    /// Human-readable event name.
    public var title: String
    /// Optional longer explanation of when this event fires.
    public var description: String?

    public init(
        id: String,
        title: String,
        description: String? = nil
    ) {
        self.id = id
        self.title = title
        self.description = description
    }
}

public struct AutomationTriggerDefinition: Codable, Sendable {
    /// Stable type id stored in {@link AutomationEventTrigger.type}.
    public var type: String
    /// Human-readable trigger type name.
    public var title: String
    /// Optional longer explanation of the trigger source.
    public var description: String?
    /// Events available for selection. Saved triggers retain their selected event descriptors.
    public var events: [AutomationTriggerEventDefinition]
    /// Optional schema for {@link AutomationEventTrigger.config}.
    public var configSchema: ConfigSchema?

    public init(
        type: String,
        title: String,
        description: String? = nil,
        events: [AutomationTriggerEventDefinition],
        configSchema: ConfigSchema? = nil
    ) {
        self.type = type
        self.title = title
        self.description = description
        self.events = events
        self.configSchema = configSchema
    }
}

public struct AutomationSessionTemplate: Codable, Sendable {
    /// Provider id matching {@link AgentInfo.provider}. Omit to use the host's default provider.
    public var provider: String?
    /// Optional model selection resolved when a run starts. Its
    /// {@link ModelSelection.id} matches a {@link SessionModelInfo.id} advertised
    /// by the selected provider.
    public var model: ModelSelection?
    /// Optional custom agent selection identified by {@link AgentSelection.uri}.
    public var agent: AgentSelection?
    /// Ordered working-directory URIs for each created session, equivalent to
    /// {@link CreateSessionParams.workingDirectories}. Absence means a
    /// workspace-less session.
    public var workingDirectories: [String]?
    /// Session configuration values equivalent to
    /// {@link CreateSessionParams.config}, normally obtained from
    /// {@link ResolveSessionConfigResult.values}.
    public var config: [String: AnyCodable]?

    public init(
        provider: String? = nil,
        model: ModelSelection? = nil,
        agent: AgentSelection? = nil,
        workingDirectories: [String]? = nil,
        config: [String: AnyCodable]? = nil
    ) {
        self.provider = provider
        self.model = model
        self.agent = agent
        self.workingDirectories = workingDirectories
        self.config = config
    }
}

public struct AutomationDefinition: Codable, Sendable {
    /// Human-readable automation name.
    public var title: String
    /// Initial message sent to every newly created run session. Its
    /// {@link Message.origin} kind MUST be {@link MessageKind.Automation}.
    public var message: Message
    /// Template used to create fresh sessions for each run.
    public var session: AutomationSessionTemplate
    /// Whether automatic triggers may create runs. Manual runs remain available
    /// whenever {@link AutomationOperation.Run} is advertised.
    public var enabled: Bool
    /// Automatic triggers. An empty list means manual-only.
    public var triggers: [AutomationTrigger]
    /// Opaque implementation-defined metadata. Clients MUST preserve unknown
    /// entries when updating the definition.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case title
        case message
        case session
        case enabled
        case triggers
        case meta = "_meta"
    }

    public init(
        title: String,
        message: Message,
        session: AutomationSessionTemplate,
        enabled: Bool,
        triggers: [AutomationTrigger],
        meta: [String: AnyCodable]? = nil
    ) {
        self.title = title
        self.message = message
        self.session = session
        self.enabled = enabled
        self.triggers = triggers
        self.meta = meta
    }
}

public struct AutomationDefinitionPatch: Codable, Sendable {
    /// Replacement {@link AutomationDefinition.title}.
    public var title: String?
    /// Replacement {@link AutomationDefinition.message}.
    public var message: Message?
    /// Replacement {@link AutomationDefinition.session}. The host revalidates
    /// affected event triggers when their discovery context changes.
    public var session: AutomationSessionTemplate?
    /// Replacement {@link AutomationDefinition.enabled}.
    public var enabled: Bool?
    /// Complete replacement {@link AutomationDefinition.triggers}. The host
    /// validates event ids and normalizes event-trigger titles and descriptions.
    public var triggers: [AutomationTrigger]?
    /// Complete replacement {@link AutomationDefinition._meta}.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case title
        case message
        case session
        case enabled
        case triggers
        case meta = "_meta"
    }

    public init(
        title: String? = nil,
        message: Message? = nil,
        session: AutomationSessionTemplate? = nil,
        enabled: Bool? = nil,
        triggers: [AutomationTrigger]? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.title = title
        self.message = message
        self.session = session
        self.enabled = enabled
        self.triggers = triggers
        self.meta = meta
    }
}

public struct AutomationEntry: Codable, Sendable {
    /// Stable `ahp-automation:/<id>` resource identifier.
    public var resource: String
    /// Current durable definition.
    public var definition: AutomationDefinition
    /// Earliest schedule occurrence awaiting evaluation, as an ISO 8601 timestamp. It may be in the past while catch-up is pending.
    public var nextRunAt: String?
    /// Newest-first retained run summaries. This is a bounded window; use
    /// {@link FetchAutomationRunsParams | fetchAutomationRuns} when
    /// {@link AutomationEntry.runsNextCursor} is present.
    public var runs: [AutomationRunSummary]
    /// Opaque cursor passed as {@link FetchAutomationRunsParams.cursor} for the next older run-history page.
    public var runsNextCursor: String?
    /// Operations currently permitted for this automation.
    public var operations: [AutomationOperation]
    /// Creation timestamp in ISO 8601 format.
    public var createdAt: String
    /// Last definition modification timestamp in ISO 8601 format.
    public var modifiedAt: String
    /// Opaque host-defined state metadata.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case resource
        case definition
        case nextRunAt
        case runs
        case runsNextCursor
        case operations
        case createdAt
        case modifiedAt
        case meta = "_meta"
    }

    public init(
        resource: String,
        definition: AutomationDefinition,
        nextRunAt: String? = nil,
        runs: [AutomationRunSummary],
        runsNextCursor: String? = nil,
        operations: [AutomationOperation],
        createdAt: String,
        modifiedAt: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.resource = resource
        self.definition = definition
        self.nextRunAt = nextRunAt
        self.runs = runs
        self.runsNextCursor = runsNextCursor
        self.operations = operations
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.meta = meta
    }
}

public struct AutomationState: Codable, Sendable {
    /// Full automation entries keyed by {@link AutomationEntry.resource}.
    public var entries: [AutomationEntry]
    /// Opaque host-defined catalogue metadata.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case entries
        case meta = "_meta"
    }

    public init(
        entries: [AutomationEntry],
        meta: [String: AnyCodable]? = nil
    ) {
        self.entries = entries
        self.meta = meta
    }
}

public struct AutomationManualRunOrigin: Codable, Sendable {
    public var kind: AutomationRunOriginKind

    public init(
        kind: AutomationRunOriginKind
    ) {
        self.kind = kind
    }
}

public struct AutomationTriggeredRunOrigin: Codable, Sendable {
    public var kind: AutomationRunOriginKind
    /// Matches the stable {@link AutomationScheduleTrigger.id} or
    /// {@link AutomationEventTrigger.id} in the definition.
    public var triggerId: String
    /// Intended schedule occurrence as an ISO 8601 timestamp. Present for
    /// schedule triggers and normally absent for event triggers.
    public var scheduledFor: String?
    /// `true` when this is a catch-up run created by
    /// {@link AutomationMisfirePolicy.RunOnce}.
    public var catchUp: Bool?
    /// Host-defined, non-secret event provenance suitable for display or audit.
    /// This is descriptive context, not an input that clients replay.
    public var event: [String: AnyCodable]?

    public init(
        kind: AutomationRunOriginKind,
        triggerId: String,
        scheduledFor: String? = nil,
        catchUp: Bool? = nil,
        event: [String: AnyCodable]? = nil
    ) {
        self.kind = kind
        self.triggerId = triggerId
        self.scheduledFor = scheduledFor
        self.catchUp = catchUp
        self.event = event
    }
}

public struct AutomationPendingRunLifecycle: Codable, Sendable {
    public var status: AutomationRunStatus
    /// Run creation timestamp in ISO 8601 format.
    public var createdAt: String

    public init(
        status: AutomationRunStatus,
        createdAt: String
    ) {
        self.status = status
        self.createdAt = createdAt
    }
}

public struct AutomationRunningRunLifecycle: Codable, Sendable {
    public var status: AutomationRunStatus
    /// Run creation timestamp in ISO 8601 format.
    public var createdAt: String
    /// First execution start timestamp in ISO 8601 format.
    public var startedAt: String

    public init(
        status: AutomationRunStatus,
        createdAt: String,
        startedAt: String
    ) {
        self.status = status
        self.createdAt = createdAt
        self.startedAt = startedAt
    }
}

public struct AutomationCompletedRunLifecycle: Codable, Sendable {
    public var status: AutomationRunStatus
    /// Run creation timestamp in ISO 8601 format.
    public var createdAt: String
    /// First execution start timestamp in ISO 8601 format.
    public var startedAt: String
    /// Completion timestamp in ISO 8601 format.
    public var completedAt: String
    /// Optional aggregate model usage across all linked sessions.
    public var usage: UsageInfo?

    public init(
        status: AutomationRunStatus,
        createdAt: String,
        startedAt: String,
        completedAt: String,
        usage: UsageInfo? = nil
    ) {
        self.status = status
        self.createdAt = createdAt
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.usage = usage
    }
}

public struct AutomationFailedRunLifecycle: Codable, Sendable {
    public var status: AutomationRunStatus
    /// Run creation timestamp in ISO 8601 format.
    public var createdAt: String
    /// First execution start timestamp in ISO 8601 format, when execution began.
    public var startedAt: String?
    /// Failure timestamp in ISO 8601 format.
    public var completedAt: String
    /// Stable machine-readable and human-readable failure information.
    public var error: ErrorInfo

    public init(
        status: AutomationRunStatus,
        createdAt: String,
        startedAt: String? = nil,
        completedAt: String,
        error: ErrorInfo
    ) {
        self.status = status
        self.createdAt = createdAt
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.error = error
    }
}

public struct AutomationCancelledRunLifecycle: Codable, Sendable {
    public var status: AutomationRunStatus
    /// Run creation timestamp in ISO 8601 format.
    public var createdAt: String
    /// First execution start timestamp in ISO 8601 format, when execution began.
    public var startedAt: String?
    /// Cancellation completion timestamp in ISO 8601 format.
    public var completedAt: String

    public init(
        status: AutomationRunStatus,
        createdAt: String,
        startedAt: String? = nil,
        completedAt: String
    ) {
        self.status = status
        self.createdAt = createdAt
        self.startedAt = startedAt
        self.completedAt = completedAt
    }
}

public struct AutomationRunSummary: Codable, Sendable {
    /// Subscribable `ahp-automation-run:` URI matching {@link AutomationRunState.resource}.
    public var resource: String
    /// Owning `ahp-automation:` URI matching {@link AutomationRunState.automation}.
    public var automation: String
    /// Immutable provenance matching {@link AutomationRunState.origin}.
    public var origin: AutomationRunOrigin
    /// Current or terminal lifecycle snapshot matching {@link AutomationRunState.lifecycle}.
    public var lifecycle: AutomationRunLifecycle
    /// Session matching {@link AutomationRunState.primarySession}, when selected.
    public var primarySession: String?
    /// Number of entries in {@link AutomationRunState.sessions}.
    public var sessionCount: Int
    /// Opaque host-defined summary metadata.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case resource
        case automation
        case origin
        case lifecycle
        case primarySession
        case sessionCount
        case meta = "_meta"
    }

    public init(
        resource: String,
        automation: String,
        origin: AutomationRunOrigin,
        lifecycle: AutomationRunLifecycle,
        primarySession: String? = nil,
        sessionCount: Int,
        meta: [String: AnyCodable]? = nil
    ) {
        self.resource = resource
        self.automation = automation
        self.origin = origin
        self.lifecycle = lifecycle
        self.primarySession = primarySession
        self.sessionCount = sessionCount
        self.meta = meta
    }
}

public struct AutomationRunState: Codable, Sendable {
    /// URI of this automation-run channel.
    public var resource: String
    /// Owning `ahp-automation:` URI matching {@link AutomationEntry.resource}.
    public var automation: String
    /// Immutable provenance describing how this run was created.
    public var origin: AutomationRunOrigin
    /// Current or terminal lifecycle.
    public var lifecycle: AutomationRunLifecycle
    /// Ordered, unique session URIs belonging to this run, each matching
    /// {@link SessionState.resource}. Entries may represent retries, parallel
    /// workers, or delegated attempts.
    public var sessions: [String]
    /// Member of {@link AutomationRunState.sessions} that the host recommends opening first.
    public var primarySession: String?
    /// Opaque host-defined run metadata.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case resource
        case automation
        case origin
        case lifecycle
        case sessions
        case primarySession
        case meta = "_meta"
    }

    public init(
        resource: String,
        automation: String,
        origin: AutomationRunOrigin,
        lifecycle: AutomationRunLifecycle,
        sessions: [String],
        primarySession: String? = nil,
        meta: [String: AnyCodable]? = nil
    ) {
        self.resource = resource
        self.automation = automation
        self.origin = origin
        self.lifecycle = lifecycle
        self.sessions = sessions
        self.primarySession = primarySession
        self.meta = meta
    }
}

// MARK: - Customization Enablement Union

/// A single explicit customization enablement decision.
public enum CustomizationEnablement: Codable, Sendable {
    case global(CustomizationEnablementGlobal)
    case workspace(CustomizationEnablementWorkspace)
    case session(CustomizationEnablementSession)

    private enum DiscriminantKey: String, CodingKey {
        case kind
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "global":
            self = .global(try CustomizationEnablementGlobal(from: decoder))
        case "workspace":
            self = .workspace(try CustomizationEnablementWorkspace(from: decoder))
        case "session":
            self = .session(try CustomizationEnablementSession(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unknown CustomizationEnablement kind")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .global(let value): try value.encode(to: encoder)
        case .workspace(let value): try value.encode(to: encoder)
        case .session(let value): try value.encode(to: encoder)
        }
    }
}

public struct CustomizationEnablementGlobal: Codable, Sendable {
    public var kind: String = "global"
    public var enabled: Bool

    public init(enabled: Bool) {
        self.enabled = enabled
    }
}

public struct CustomizationEnablementWorkspace: Codable, Sendable {
    public var kind: String = "workspace"
    public var uri: URI
    public var enabled: Bool

    public init(uri: URI, enabled: Bool) {
        self.uri = uri
        self.enabled = enabled
    }
}

public struct CustomizationEnablementSession: Codable, Sendable {
    public var kind: String = "session"
    public var enabled: Bool

    public init(enabled: Bool) {
        self.enabled = enabled
    }
}

// MARK: - Tool Input

/// Raw tool input represented inline or by content reference.
public enum ToolInput: Codable, Sendable {
    case inline(String)
    case contentRef(ContentRef)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .inline(value)
        } else {
            self = .contentRef(try container.decode(ContentRef.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .inline(let value): try container.encode(value)
        case .contentRef(let value): try container.encode(value)
        }
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

public struct ChatOriginSideChat: Codable, Sendable {
    public var kind: ChatOriginKind
    public var chat: String
    public var turnId: String
    public var selection: SideChatSelection?

    public init(kind: ChatOriginKind = .sideChat, chat: String, turnId: String, selection: SideChatSelection? = nil) {
        self.kind = kind
        self.chat = chat
        self.turnId = turnId
        self.selection = selection
    }
}

public enum ChatOrigin: Codable, Sendable {
    case user(ChatOriginUser)
    case fork(ChatOriginFork)
    case sideChat(ChatOriginSideChat)
    case tool(ChatOriginTool)

    private enum DiscriminatorCodingKeys: String, CodingKey { case kind }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminatorCodingKeys.self)
        let discriminant = try container.decode(String.self, forKey: .kind)
        switch discriminant {
        case "user": self = .user(try ChatOriginUser(from: decoder))
        case "fork": self = .fork(try ChatOriginFork(from: decoder))
        case "sideChat": self = .sideChat(try ChatOriginSideChat(from: decoder))
        case "tool": self = .tool(try ChatOriginTool(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unknown ChatOrigin kind: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .user(let value): try value.encode(to: encoder)
        case .fork(let value): try value.encode(to: encoder)
        case .sideChat(let value): try value.encode(to: encoder)
        case .tool(let value): try value.encode(to: encoder)
        }
    }
}

public enum ResponsePart: Codable, Sendable {
    case markdown(MarkdownResponsePart)
    case contentRef(ResourceResponsePart)
    case toolCall(ToolCallResponsePart)
    case reasoning(ReasoningResponsePart)
    case systemNotification(SystemNotificationResponsePart)
    case inputRequest(InputRequestResponsePart)
    case error(ErrorResponsePart)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "markdown":
            self = .markdown(try MarkdownResponsePart(from: decoder))
        case "contentRef":
            self = .contentRef(try ResourceResponsePart(from: decoder))
        case "toolCall":
            self = .toolCall(try ToolCallResponsePart(from: decoder))
        case "reasoning":
            self = .reasoning(try ReasoningResponsePart(from: decoder))
        case "systemNotification":
            self = .systemNotification(try SystemNotificationResponsePart(from: decoder))
        case "inputRequest":
            self = .inputRequest(try InputRequestResponsePart(from: decoder))
        case "error":
            self = .error(try ErrorResponsePart(from: decoder))
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
        case .inputRequest(let value): try value.encode(to: encoder)
        case .error(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ToolCallState: Codable, Sendable {
    case streaming(ToolCallStreamingState)
    case pendingConfirmation(ToolCallPendingConfirmationState)
    case running(ToolCallRunningState)
    case authRequired(ToolCallAuthRequiredState)
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
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "streaming":
            self = .streaming(try ToolCallStreamingState(from: decoder))
        case "pending-confirmation":
            self = .pendingConfirmation(try ToolCallPendingConfirmationState(from: decoder))
        case "running":
            self = .running(try ToolCallRunningState(from: decoder))
        case "auth-required":
            self = .authRequired(try ToolCallAuthRequiredState(from: decoder))
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
        case .authRequired(let value): try value.encode(to: encoder)
        case .pendingResultConfirmation(let value): try value.encode(to: encoder)
        case .completed(let value): try value.encode(to: encoder)
        case .cancelled(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ToolCallConfirmationState: Codable, Sendable {
    case pendingConfirmation(ToolCallPendingConfirmationState)
    case pendingResultConfirmation(ToolCallPendingResultConfirmationState)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "status"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "pending-confirmation":
            self = .pendingConfirmation(try ToolCallPendingConfirmationState(from: decoder))
        case "pending-result-confirmation":
            self = .pendingResultConfirmation(try ToolCallPendingResultConfirmationState(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .pendingConfirmation(let value): try value.encode(to: encoder)
        case .pendingResultConfirmation(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
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
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
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
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
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
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
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
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ChatInputAnswer discriminant: \(discriminant)")
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
    case annotations(MessageAnnotationsAttachment)
    case chat(MessageChatAttachment)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "simple":
            self = .simple(try SimpleMessageAttachment(from: decoder))
        case "embeddedResource":
            self = .embeddedResource(try MessageEmbeddedResourceAttachment(from: decoder))
        case "resource":
            self = .resource(try MessageResourceAttachment(from: decoder))
        case "annotations":
            self = .annotations(try MessageAnnotationsAttachment(from: decoder))
        case "chat":
            self = .chat(try MessageChatAttachment(from: decoder))
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
        case .chat(let value): try value.encode(to: encoder)
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
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
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
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
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
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown CustomizationLoadState discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .loading(let value): try value.encode(to: encoder)
        case .loaded(let value): try value.encode(to: encoder)
        case .degraded(let value): try value.encode(to: encoder)
        case .error(let value): try value.encode(to: encoder)
        }
    }
}

public enum McpServerState: Codable, Sendable {
    case starting(McpServerStartingState)
    case ready(McpServerReadyState)
    case authRequired(McpServerAuthRequiredState)
    case error(McpServerErrorState)
    case stopped(McpServerStoppedState)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
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
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .starting(let value): try value.encode(to: encoder)
        case .ready(let value): try value.encode(to: encoder)
        case .authRequired(let value): try value.encode(to: encoder)
        case .error(let value): try value.encode(to: encoder)
        case .stopped(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ToolCallContributor: Codable, Sendable {
    case client(ToolCallClientContributor)
    case mcp(ToolCallMcpContributor)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "client":
            self = .client(try ToolCallClientContributor(from: decoder))
        case "mcp":
            self = .mcp(try ToolCallMcpContributor(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .client(let value): try value.encode(to: encoder)
        case .mcp(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum ToolCallRiskAssessment: Codable, Sendable {
    case loading(ToolCallRiskAssessmentLoadingState)
    case complete(ToolCallRiskAssessmentCompleteState)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "status"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "loading":
            self = .loading(try ToolCallRiskAssessmentLoadingState(from: decoder))
        case "complete":
            self = .complete(try ToolCallRiskAssessmentCompleteState(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .loading(let value): try value.encode(to: encoder)
        case .complete(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum TerminalLifecycleState: Codable, Sendable {
    case running(TerminalRunningLifecycleState)
    case exited(TerminalExitedLifecycleState)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "status"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "running":
            self = .running(try TerminalRunningLifecycleState(from: decoder))
        case "exited":
            self = .exited(try TerminalExitedLifecycleState(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown TerminalLifecycleState discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .running(let value): try value.encode(to: encoder)
        case .exited(let value): try value.encode(to: encoder)
        }
    }
}

public enum SessionInputRequest: Codable, Sendable {
    case chatInput(SessionChatInputRequest)
    case toolConfirmation(SessionToolConfirmationRequest)
    case toolClientExecution(SessionToolClientExecutionRequest)
    case toolAuthentication(SessionToolAuthenticationRequest)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "chatInput":
            self = .chatInput(try SessionChatInputRequest(from: decoder))
        case "toolConfirmation":
            self = .toolConfirmation(try SessionToolConfirmationRequest(from: decoder))
        case "toolClientExecution":
            self = .toolClientExecution(try SessionToolClientExecutionRequest(from: decoder))
        case "toolAuthentication":
            self = .toolAuthentication(try SessionToolAuthenticationRequest(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .chatInput(let value): try value.encode(to: encoder)
        case .toolConfirmation(let value): try value.encode(to: encoder)
        case .toolClientExecution(let value): try value.encode(to: encoder)
        case .toolAuthentication(let value): try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum SessionOrigin: Codable, Sendable {
    case automation(AutomationSessionOrigin)
    /// Unknown or future discriminant; the raw payload is preserved
    /// and re-encoded verbatim for forward-compatibility.
    case unknown(AnyCodable)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        guard let discriminant = try container.decodeIfPresent(String.self, forKey: .discriminant) else {
            self = .unknown(try AnyCodable(from: decoder))
            return
        }
        switch discriminant {
        case "automation":
            self = .automation(try AutomationSessionOrigin(from: decoder))
        default:
            self = .unknown(try AnyCodable(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .automation(var value):
            value.kind = .automation
            try value.encode(to: encoder)
        case .unknown(let value): try value.encode(to: encoder)
        }
    }
}

public enum AutomationTrigger: Codable, Sendable {
    case schedule(AutomationScheduleTrigger)
    case event(AutomationEventTrigger)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "schedule":
            self = .schedule(try AutomationScheduleTrigger(from: decoder))
        case "event":
            self = .event(try AutomationEventTrigger(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown AutomationTrigger discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .schedule(var value):
            value.kind = .schedule
            try value.encode(to: encoder)
        case .event(var value):
            value.kind = .event
            try value.encode(to: encoder)
        }
    }
}

public enum AutomationRunOrigin: Codable, Sendable {
    case manual(AutomationManualRunOrigin)
    case trigger(AutomationTriggeredRunOrigin)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "manual":
            self = .manual(try AutomationManualRunOrigin(from: decoder))
        case "trigger":
            self = .trigger(try AutomationTriggeredRunOrigin(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown AutomationRunOrigin discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .manual(var value):
            value.kind = .manual
            try value.encode(to: encoder)
        case .trigger(var value):
            value.kind = .trigger
            try value.encode(to: encoder)
        }
    }
}

public enum AutomationRunLifecycle: Codable, Sendable {
    case pending(AutomationPendingRunLifecycle)
    case running(AutomationRunningRunLifecycle)
    case completed(AutomationCompletedRunLifecycle)
    case failed(AutomationFailedRunLifecycle)
    case cancelled(AutomationCancelledRunLifecycle)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "status"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "pending":
            self = .pending(try AutomationPendingRunLifecycle(from: decoder))
        case "running":
            self = .running(try AutomationRunningRunLifecycle(from: decoder))
        case "completed":
            self = .completed(try AutomationCompletedRunLifecycle(from: decoder))
        case "failed":
            self = .failed(try AutomationFailedRunLifecycle(from: decoder))
        case "cancelled":
            self = .cancelled(try AutomationCancelledRunLifecycle(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown AutomationRunLifecycle discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .pending(var value):
            value.status = .pending
            try value.encode(to: encoder)
        case .running(var value):
            value.status = .running
            try value.encode(to: encoder)
        case .completed(var value):
            value.status = .completed
            try value.encode(to: encoder)
        case .failed(var value):
            value.status = .failed
            try value.encode(to: encoder)
        case .cancelled(var value):
            value.status = .cancelled
            try value.encode(to: encoder)
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

/// The state payload of a snapshot.
public enum SnapshotState: Codable, Sendable {
    case root(RootState)
    case session(SessionState)
    case chat(ChatState)
    case terminal(TerminalState)
    case changeset(ChangesetState)
    case resourceWatch(ResourceWatchState)
    case annotations(AnnotationsState)
    case automations(AutomationState)
    case automationRun(AutomationRunState)

    public init(from decoder: Decoder) throws {
        // Try the most distinctive shapes first. SessionState has required
        // `lifecycle` / `activeClients` / `chats`; ChatState has required
        // `turns`; the remaining variants follow, with RootState as the
        // catch-all.
        if let session = try? SessionState(from: decoder) {
            self = .session(session)
        } else if let chat = try? ChatState(from: decoder) {
            self = .chat(chat)
        } else if let terminal = try? TerminalState(from: decoder) {
            self = .terminal(terminal)
        } else if let changeset = try? ChangesetState(from: decoder) {
            self = .changeset(changeset)
        } else if let resourceWatch = try? ResourceWatchState(from: decoder) {
            self = .resourceWatch(resourceWatch)
        } else if let annotations = try? AnnotationsState(from: decoder) {
            self = .annotations(annotations)
        } else if let automations = try? AutomationState(from: decoder) {
            self = .automations(automations)
        } else if let automationRun = try? AutomationRunState(from: decoder) {
            self = .automationRun(automationRun)
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
        case .automations(let state): try state.encode(to: encoder)
        case .automationRun(let state): try state.encode(to: encoder)
        }
    }
}
