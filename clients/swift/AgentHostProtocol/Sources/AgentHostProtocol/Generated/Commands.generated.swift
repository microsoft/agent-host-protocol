// Generated from types/*.ts — do not edit

import Foundation

// MARK: - Command Enums

/// Discriminant for reconnect result types.
public enum ReconnectResultType: String, Codable, Sendable {
    case replay = "replay"
    case snapshot = "snapshot"
}

/// How a new chat uses its source chat and turn.
public enum ChatSourceKind: String, Codable, Sendable {
    /// Copy source history through the referenced turn into the new chat.
    case fork = "fork"
    /// Supply source context without copying it into the new chat's visible history.
    case sideChat = "sideChat"
}

/// Encoding of fetched content data.
public enum ContentEncoding: String, Codable, Sendable {
    case base64 = "base64"
    case utf8 = "utf-8"
}

/// The kind of completion items being requested.
public enum CompletionItemKind: String, Codable, Sendable {
    /// Completions for the text of a {@link Message} the user is composing.
    /// Each returned item carries an attachment that gets associated with the
    /// message when accepted.
    case userMessage = "userMessage"
}

/// Discriminant for {@link ResourceResolveResult.type}.
public enum ResourceType: String, Codable, Sendable {
    case file = "file"
    case directory = "directory"
    case symlink = "symlink"
}

/// How {@link ResourceWriteParams.data} is placed within the target file.
///
/// Each mode interprets {@link ResourceWriteParams.position} differently:
///
/// - `truncate` (default): rooted at the **start** of the file. The file is
/// truncated at `position` (0 by default) and `data` is written from that
/// offset, so the resulting file is `existing[0..position] + data`. With
/// `position` omitted this is a full overwrite.
/// - `append`: rooted at the **end** of the file. `position` counts bytes
/// backwards from EOF, so `position: 0` (the default) writes at EOF —
/// POSIX append — and `position: 5` inserts `data` 5 bytes before the
/// current EOF, shifting those trailing 5 bytes after the inserted region.
/// The server MUST evaluate the effective EOF and write atomically with
/// respect to other appenders so concurrent `append` writes do not
/// clobber each other.
/// - `insert`: rooted at the **start** of the file. `position` (0 by default)
/// is the byte offset at which `data` is spliced in; bytes at or after
/// `position` are shifted right by `data.length`. `insert` always grows
/// the file — use `truncate` to overwrite bytes in place.
public enum ResourceWriteMode: String, Codable, Sendable {
    case truncate = "truncate"
    case append = "append"
    case insert = "insert"
}

// MARK: - Command Types

/// Copies source history through a completed turn into the new chat.
public struct ForkChatSource: Codable, Sendable {
    /// Discriminant
    public var kind: ChatSourceKind { .fork }
    /// URI of the existing source chat.
    public var chat: URI
    /// Completed turn identifier in the source chat.
    ///
    /// Content through this turn is copied into the new chat's visible `turns`.
    public var turnId: String

    private enum CodingKeys: String, CodingKey {
        case kind
        case chat
        case turnId
    }

    public init(
        chat: URI,
        turnId: String
    ) {
        self.chat = chat
        self.turnId = turnId
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(ChatSourceKind.self, forKey: .kind)
        guard kind == .fork else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Expected ForkChatSource kind fork")
        }
        self.chat = try container.decode(URI.self, forKey: .chat)
        self.turnId = try container.decode(String.self, forKey: .turnId)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ChatSourceKind.fork, forKey: .kind)
        try container.encode(chat, forKey: .chat)
        try container.encode(turnId, forKey: .turnId)
    }
}

/// Supplies source context to a new side chat without copying it into the side
/// chat's visible history.
public struct SideChatSource: Codable, Sendable {
    /// Discriminant
    public var kind: ChatSourceKind { .sideChat }
    /// URI of the existing source chat.
    public var chat: URI
    /// Stable source-turn identifier in the source chat.
    ///
    /// Hosts resolve this id against the source chat's current `activeTurn` or its
    /// retained `turns` when accepting `createChat`. If it names the current
    /// active turn, the host snapshots the source chat's retained history plus
    /// that turn's current user message and any partial assistant response already
    /// available. Once that turn later becomes historical, it is still referenced
    /// by this same identifier.
    public var turnId: String
    /// Optional immutable selected-text snapshot to carry into the created side
    /// chat's origin.
    public var selection: SideChatSelection?

    private enum CodingKeys: String, CodingKey {
        case kind
        case chat
        case turnId
        case selection
    }

    public init(
        chat: URI,
        turnId: String,
        selection: SideChatSelection? = nil
    ) {
        self.chat = chat
        self.turnId = turnId
        self.selection = selection
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(ChatSourceKind.self, forKey: .kind)
        guard kind == .sideChat else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Expected SideChatSource kind sideChat")
        }
        self.chat = try container.decode(URI.self, forKey: .chat)
        self.turnId = try container.decode(String.self, forKey: .turnId)
        self.selection = try container.decodeIfPresent(SideChatSelection.self, forKey: .selection)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ChatSourceKind.sideChat, forKey: .kind)
        try container.encode(chat, forKey: .chat)
        try container.encode(turnId, forKey: .turnId)
        try container.encodeIfPresent(selection, forKey: .selection)
    }
}

public struct InitializeParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Protocol versions the client is willing to speak, ordered from most
    /// preferred to least preferred. Each entry is a [SemVer](https://semver.org)
    /// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
    ///
    /// The server selects one entry and returns it as `InitializeResult.protocolVersion`.
    /// If the server cannot speak any of the offered versions, it MUST return
    /// error code `-32005` (`UnsupportedProtocolVersion`).
    public var protocolVersions: [String]
    /// Unique client identifier
    public var clientId: String
    /// Optional identity of the client implementation (name and version).
    /// Informational only — see {@link Implementation} for how it may and may not
    /// be used. Distinct from {@link InitializeParams.clientId | `clientId`},
    /// which is an opaque per-connection identifier used for reconnection, not a
    /// human-readable implementation name.
    public var clientInfo: Implementation?
    /// URIs to subscribe to during handshake
    public var initialSubscriptions: [String]?
    /// IETF BCP 47 language tag indicating the client's preferred locale
    /// (e.g. `"en-US"`, `"ja"`). The server SHOULD use this to localise
    /// user-facing strings such as confirmation option labels.
    public var locale: String?
    /// Optional client capability declarations.
    ///
    /// Servers SHOULD only advertise features whose corresponding client
    /// capability is set here. Absent means "not declared" — the server
    /// MUST assume the client does not support the feature.
    public var capabilities: ClientCapabilities?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case protocolVersions
        case clientId
        case clientInfo
        case initialSubscriptions
        case locale
        case capabilities
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        protocolVersions: [String],
        clientId: String,
        clientInfo: Implementation? = nil,
        initialSubscriptions: [String]? = nil,
        locale: String? = nil,
        capabilities: ClientCapabilities? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.protocolVersions = protocolVersions
        self.clientId = clientId
        self.clientInfo = clientInfo
        self.initialSubscriptions = initialSubscriptions
        self.locale = locale
        self.capabilities = capabilities
    }
}

public struct InitializeResult: Codable, Sendable {
    /// Protocol version selected by the server. MUST be one of the entries in
    /// `InitializeParams.protocolVersions`. Formatted as a [SemVer](https://semver.org)
    /// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
    public var protocolVersion: String
    /// Current server sequence number
    public var serverSeq: Int
    /// Optional identity of the server implementation (name and version).
    /// Informational only — see {@link Implementation} for how it may and may not
    /// be used. Whereas {@link InitializeResult.protocolVersion | `protocolVersion`}
    /// identifies the negotiated protocol, `serverInfo` identifies the host
    /// software behind it.
    public var serverInfo: Implementation?
    /// Snapshots for each `initialSubscriptions` URI
    public var snapshots: [Snapshot]
    /// Suggested default directory for remote filesystem browsing
    public var defaultDirectory: String?
    /// Characters that, when typed in a {@link Message} input, SHOULD cause
    /// the client to issue a `completions` request with
    /// {@link CompletionItemKind.UserMessage}. Typically includes characters like
    /// `'@'` or `'/'`.
    public var completionTriggerCharacters: [String]?
    /// Prefix that the host recognizes at the start of a user {@link Message.text}
    /// as a shorthand for executing the remainder as a terminal command. Currently
    /// the standardized convention is `"!"`; absence means the host does not
    /// support command prefixes.
    public var terminalCommandPrefix: String?
    /// OTLP telemetry channels the host emits, if any. Each populated field is
    /// either a literal `ahp-otlp:` channel URI or an RFC 6570 URI template a
    /// client expands before subscribing (currently only the `logs` channel
    /// defines a template variable, `{level}`, for subscriber-side severity
    /// filtering). Clients MAY ignore signals they cannot process.
    public var telemetry: TelemetryCapabilities?
    /// Host-owned automation support. Absence means the host does not expose an
    /// automation catalogue or automation commands.
    public var automations: AutomationCapabilities?

    public init(
        protocolVersion: String,
        serverSeq: Int,
        serverInfo: Implementation? = nil,
        snapshots: [Snapshot],
        defaultDirectory: String? = nil,
        completionTriggerCharacters: [String]? = nil,
        terminalCommandPrefix: String? = nil,
        telemetry: TelemetryCapabilities? = nil,
        automations: AutomationCapabilities? = nil
    ) {
        self.protocolVersion = protocolVersion
        self.serverSeq = serverSeq
        self.serverInfo = serverInfo
        self.snapshots = snapshots
        self.defaultDirectory = defaultDirectory
        self.completionTriggerCharacters = completionTriggerCharacters
        self.terminalCommandPrefix = terminalCommandPrefix
        self.telemetry = telemetry
        self.automations = automations
    }
}

public struct ClientCapabilities: Codable, Sendable {
    /// Client can render
    /// [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) — i.e.
    /// it can host the View sandbox, run the `ui/*` protocol against it,
    /// and forward `mcp://`-channel traffic on the App's behalf.
    ///
    /// Hosts SHOULD only populate
    /// {@link McpServerCustomization.mcpApp | `McpServerCustomization.mcpApp`}
    /// (and expose the corresponding
    /// {@link McpServerCustomization.channel | `mcp://` channel}) when this
    /// capability is declared. Clients that omit it MUST treat
    /// App-bearing tool calls as ordinary MCP tool calls.
    public var mcpApps: [String: AnyCodable]?

    public init(
        mcpApps: [String: AnyCodable]? = nil
    ) {
        self.mcpApps = mcpApps
    }
}

public struct AutomationCapabilities: Codable, Sendable {
    /// Availability guarantee for automatic trigger execution.
    public var execution: AutomationExecutionCapabilities
    /// Present when clients may call `createAutomation`.
    public var create: AutomationCreateCapability?
    /// Present when definitions may contain schedule triggers.
    public var schedules: AutomationScheduleCapabilities?
    /// Present when clients may request cancellation on eligible runs.
    public var runCancellation: AutomationRunCancellationCapability?
    /// Present when clients may call `previewAutomationSchedule`.
    public var schedulePreview: AutomationSchedulePreviewCapability?
    /// Maximum terminal run summaries retained per automation. Active runs are not
    /// counted toward the limit. Absence means the retention limit is
    /// implementation-defined.
    public var runHistoryLimit: Int?

    public init(
        execution: AutomationExecutionCapabilities,
        create: AutomationCreateCapability? = nil,
        schedules: AutomationScheduleCapabilities? = nil,
        runCancellation: AutomationRunCancellationCapability? = nil,
        schedulePreview: AutomationSchedulePreviewCapability? = nil,
        runHistoryLimit: Int? = nil
    ) {
        self.execution = execution
        self.create = create
        self.schedules = schedules
        self.runCancellation = runCancellation
        self.schedulePreview = schedulePreview
        self.runHistoryLimit = runHistoryLimit
    }
}

public struct AutomationExecutionCapabilities: Codable, Sendable {
    /// How long automatic trigger evaluation remains available.
    public var lifetime: AutomationExecutionLifetime

    public init(
        lifetime: AutomationExecutionLifetime
    ) {
        self.lifetime = lifetime
    }
}

public struct AutomationCreateCapability: Codable, Sendable {

    public init(

    ) {
    }
}

public struct AutomationScheduleCapabilities: Codable, Sendable {
    /// Smallest permitted interval between consecutive occurrences. Omission
    /// means no restriction beyond the cron format's one-minute resolution.
    public var minIntervalMinutes: Int?

    public init(
        minIntervalMinutes: Int? = nil
    ) {
        self.minIntervalMinutes = minIntervalMinutes
    }
}

public struct AutomationRunCancellationCapability: Codable, Sendable {

    public init(

    ) {
    }
}

public struct AutomationSchedulePreviewCapability: Codable, Sendable {

    public init(

    ) {
    }
}

public struct Implementation: Codable, Sendable {
    /// Implementation name, e.g. a product or package identifier.
    public var name: String
    /// Implementation version. A [SemVer](https://semver.org) string is
    /// recommended but not required.
    public var version: String?
    /// Optional human-readable display name.
    public var title: String?

    public init(
        name: String,
        version: String? = nil,
        title: String? = nil
    ) {
        self.name = name
        self.version = version
        self.title = title
    }
}

public struct ReconnectParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Client identifier from the original connection
    public var clientId: String
    /// Last `serverSeq` the client received
    public var lastSeenServerSeq: Int
    /// URIs the client was subscribed to
    public var subscriptions: [String]

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case clientId
        case lastSeenServerSeq
        case subscriptions
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        clientId: String,
        lastSeenServerSeq: Int,
        subscriptions: [String]
    ) {
        self.channel = channel
        self.meta = meta
        self.clientId = clientId
        self.lastSeenServerSeq = lastSeenServerSeq
        self.subscriptions = subscriptions
    }
}

public struct ReconnectReplayResult: Codable, Sendable {
    /// Discriminant
    public var type: ReconnectResultType
    /// Missed action envelopes since `lastSeenServerSeq`
    public var actions: [ActionEnvelope]
    /// URIs from `ReconnectParams.subscriptions` that the server cannot resume.
    /// This includes resources that no longer exist (e.g. disposed sessions or
    /// terminals) as well as resources the client is no longer permitted to
    /// observe. Clients SHOULD drop these from their local subscription set.
    public var missing: [String]

    public init(
        type: ReconnectResultType,
        actions: [ActionEnvelope],
        missing: [String]
    ) {
        self.type = type
        self.actions = actions
        self.missing = missing
    }
}

public struct ReconnectSnapshotResult: Codable, Sendable {
    /// Discriminant
    public var type: ReconnectResultType
    /// Fresh snapshots for each subscription
    public var snapshots: [Snapshot]

    public init(
        type: ReconnectResultType,
        snapshots: [Snapshot]
    ) {
        self.type = type
        self.snapshots = snapshots
    }
}

public struct SubscribeParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Optional delivery preferences for this subscription.
    ///
    /// Servers MAY use these preferences to buffer and coalesce high-frequency
    /// updates while preserving the same reduced state. Omit this field for the
    /// server's default delivery behavior.
    public var delivery: SubscriptionDeliveryOptions?
    /// Optional client-requested shape for the returned snapshot.
    ///
    /// Servers that do not understand a requested view ignore it and return their
    /// default snapshot. Clients MUST tolerate receiving more state than requested.
    public var view: SubscribeView?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case delivery
        case view
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        delivery: SubscriptionDeliveryOptions? = nil,
        view: SubscribeView? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.delivery = delivery
        self.view = view
    }
}

public struct SubscribeView: Codable, Sendable {
    /// Advisory number of most-recent completed turns to expose in a chat
    /// snapshot.
    ///
    /// Servers MAY return more or fewer turns than requested. When omitted, the
    /// host MUST return all retained turns. When older turns remain available, the
    /// returned {@link ChatState} carries `turnsNextCursor`; clients pass that
    /// cursor to `fetchTurns` to ask the host to page more turns into the chat
    /// state.
    public var turns: Int?

    public init(
        turns: Int? = nil
    ) {
        self.turns = turns
    }
}

public struct SubscriptionDeliveryOptions: Codable, Sendable {
    /// Maximum time, in milliseconds, that the server may intentionally delay
    /// delivery while buffering/coalescing updates for this subscription.
    ///
    /// A value of `0` requests immediate delivery with no intentional coalescing.
    public var maxLatencyMs: Int?

    public init(
        maxLatencyMs: Int? = nil
    ) {
        self.maxLatencyMs = maxLatencyMs
    }
}

public struct SubscribeResult: Codable, Sendable {
    /// Snapshot of the subscribed channel's state (omitted for stateless channels)
    public var snapshot: Snapshot?

    public init(
        snapshot: Snapshot? = nil
    ) {
        self.snapshot = snapshot
    }
}

public struct SessionForkSource: Codable, Sendable {
    /// URI of the existing session to fork from
    public var session: String
    /// Turn ID in the source session; content up to and including this turn's response is copied
    public var turnId: String

    public init(
        session: String,
        turnId: String
    ) {
        self.session = session
        self.turnId = turnId
    }
}

public struct CreateSessionParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Agent provider ID
    public var provider: String?
    /// The working directories the session's agent is granted tool access to.
    /// A session may span multiple directories; they are equal peers except when
    /// the agent advertises
    /// {@link MultipleWorkingDirectoriesCapability.immutablePrimary} (in which case
    /// the first entry is a fixed process root).
    ///
    /// A client MUST NOT supply more than one entry unless the agent advertises
    /// {@link AgentCapabilities.multipleWorkingDirectories}; a server without that
    /// capability treats only the first entry as the session's working directory
    /// and ignores the rest. Dispatch `session/workingDirectorySet` /
    /// `session/workingDirectoryRemoved` to change the set after the session has
    /// started.
    ///
    /// Ignored for forked sessions — a fork inherits its working directories
    /// from the source session identified by `fork`.
    public var workingDirectories: [String]?
    /// Fork from an existing session. The new session is populated with content
    /// from the source session up to and including the specified turn's response.
    public var fork: SessionForkSource?
    /// Agent-specific configuration values collected via `resolveSessionConfig`.
    /// Keys and values correspond to the schema returned by the server.
    public var config: [String: AnyCodable]?
    /// Eagerly claim an active client role for the new session.
    ///
    /// When provided, the server initializes the session with this client as an
    /// active client, equivalent to dispatching a `session/activeClientSet`
    /// action immediately after creation. The `clientId` MUST match the
    /// `clientId` the creating client supplied in `initialize`.
    public var activeClient: SessionActiveClient?
    /// Opt-in progress token. When set, the client is offering to receive
    /// `progress` notifications (see `ProgressParams`) for any long-running work
    /// the server does to bring this session up — most notably the lazy,
    /// first-use download of the provider's native SDK. The server echoes this
    /// exact token on every `progress` frame so the client can correlate it to
    /// this `createSession` call (and the UI awaiting it).
    ///
    /// The token MUST be unique across the client's active requests. The server
    /// MAY ignore it (e.g. when nothing long-running is needed), in which case no
    /// `progress` notifications are emitted.
    public var progressToken: String?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case provider
        case workingDirectories
        case fork
        case config
        case activeClient
        case progressToken
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        provider: String? = nil,
        workingDirectories: [String]? = nil,
        fork: SessionForkSource? = nil,
        config: [String: AnyCodable]? = nil,
        activeClient: SessionActiveClient? = nil,
        progressToken: String? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.provider = provider
        self.workingDirectories = workingDirectories
        self.fork = fork
        self.config = config
        self.activeClient = activeClient
        self.progressToken = progressToken
    }
}

public struct DisposeSessionParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.channel = channel
        self.meta = meta
    }
}

public struct CreateChatParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`).
    public var chat: String
    /// Optional initial message for the new chat.
    public var initialMessage: Message?
    /// Optional source chat and source turn.
    ///
    /// The source chat MUST belong to this session. Clients MUST only request
    /// `kind: "fork"` when the selected agent advertises
    /// `capabilities.multipleChats.fork`, and `kind: "sideChat"` when the
    /// selected agent advertises `capabilities.multipleChats.sideChat`. Both
    /// source forms carry a stable top-level `turnId`. Forks target completed
    /// turns. Side chats also carry a stable `turnId`, which the host resolves
    /// against the source chat's current active turn or retained history. If it
    /// resolves to the active turn, the host snapshots the currently available
    /// partial response when accepting `createChat`. When
    /// `source.kind === "sideChat"` and `source.selection` is present, the host
    /// also snapshots and preserves that exact selected text in the created chat's
    /// origin; any `responsePartId` there is provenance only, not a live range.
    public var source: ChatSource?
    /// Initial working-directory subset for this chat. Every entry MUST be
    /// present in the owning session's `workingDirectories`; the server MUST
    /// reject any entry that is not. When absent, the chat inherits the full
    /// session set. Forked chats (those whose `source.kind` is `"fork"`) inherit
    /// the source chat's `workingDirectories`; this field is ignored for forks.
    ///
    /// A client MUST NOT supply this field unless the agent advertises
    /// {@link AgentCapabilities.multipleWorkingDirectories}.
    public var workingDirectories: [String]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case chat
        case initialMessage
        case source
        case workingDirectories
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        chat: String,
        initialMessage: Message? = nil,
        source: ChatSource? = nil,
        workingDirectories: [String]? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.chat = chat
        self.initialMessage = initialMessage
        self.source = source
        self.workingDirectories = workingDirectories
    }
}

public struct DisposeChatParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.channel = channel
        self.meta = meta
    }
}

public struct ListSessionsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Maximum number of entries to return in this page. The server SHOULD respect
    /// this bound but MAY return fewer entries and MAY impose its own upper cap.
    /// Omit to let the server choose the page size.
    public var limit: Int?
    /// Opaque pagination cursor from a previous {@link PaginatedResult.nextCursor}.
    /// Omit to fetch the first page. Cursors are server-defined and MUST be treated
    /// as opaque — do not parse, modify, or persist them across connections. An
    /// unrecognised cursor SHOULD be rejected with an `InvalidParams` error.
    public var cursor: String?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case limit
        case cursor
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        limit: Int? = nil,
        cursor: String? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.limit = limit
        self.cursor = cursor
    }
}

public struct ListSessionsResult: Codable, Sendable {
    /// Opaque cursor for the next page. Present when more entries exist beyond the
    /// returned page; absent signals the end of the collection. Pass it back as
    /// {@link PaginatedParams.cursor} to fetch the following page.
    public var nextCursor: String?
    /// The list of session summaries. The server SHOULD order them
    /// most-recently-modified first.
    public var items: [SessionSummary]

    public init(
        nextCursor: String? = nil,
        items: [SessionSummary]
    ) {
        self.nextCursor = nextCursor
        self.items = items
    }
}

public struct ResourceReadParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Content URI from a `ContentRef`
    public var uri: String
    /// Preferred encoding for the returned data (default: server-chosen)
    public var encoding: ContentEncoding?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
        case encoding
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        encoding: ContentEncoding? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
        self.encoding = encoding
    }
}

public struct ResourceReadResult: Codable, Sendable {
    /// Content encoded as a string
    public var data: String
    /// How `data` is encoded
    public var encoding: ContentEncoding
    /// Content type (e.g. `"image/png"`, `"text/plain"`)
    public var contentType: String?

    public init(
        data: String,
        encoding: ContentEncoding,
        contentType: String? = nil
    ) {
        self.data = data
        self.encoding = encoding
        self.contentType = contentType
    }
}

public struct ResourceWriteParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Target file URI on the server filesystem
    public var uri: String
    /// Content encoded as a string
    public var data: String
    /// How `data` is encoded
    public var encoding: ContentEncoding
    /// Content type (e.g. `"text/plain"`, `"image/png"`)
    public var contentType: String?
    /// If `true`, the server MUST fail if the file already exists instead of
    /// overwriting it. Useful for safe creation of new files.
    public var createOnly: Bool?
    /// How `data` is placed within the target file. Defaults to `'truncate'`
    /// (full overwrite) when omitted. See {@link ResourceWriteMode} for the
    /// meaning of each mode and how it interprets {@link position}.
    public var mode: ResourceWriteMode?
    /// Byte offset interpreted according to {@link mode}. Defaults to `0`.
    /// - `truncate`: offset from the start of the file at which to truncate
    /// before writing.
    /// - `append`: bytes back from EOF at which to insert `data`.
    /// - `insert`: offset from the start of the file at which to splice in
    /// `data`.
    public var position: Int?
    /// Optimistic-concurrency token previously returned by
    /// {@link ResourceResolveResult.etag}. When set, the server MUST fail with
    /// `Conflict` if the current `etag` does not match — preventing lost
    /// updates between a `resourceResolve` and a subsequent `resourceWrite`.
    public var ifMatch: String?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
        case data
        case encoding
        case contentType
        case createOnly
        case mode
        case position
        case ifMatch
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        data: String,
        encoding: ContentEncoding,
        contentType: String? = nil,
        createOnly: Bool? = nil,
        mode: ResourceWriteMode? = nil,
        position: Int? = nil,
        ifMatch: String? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
        self.data = data
        self.encoding = encoding
        self.contentType = contentType
        self.createOnly = createOnly
        self.mode = mode
        self.position = position
        self.ifMatch = ifMatch
    }
}

public struct ResourceWriteResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct ResourceListParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Directory URI on the server filesystem
    public var uri: String

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
    }
}

public struct ResourceListResult: Codable, Sendable {
    /// Entries directly contained in the requested directory
    public var entries: [DirectoryEntry]

    public init(
        entries: [DirectoryEntry]
    ) {
        self.entries = entries
    }
}

public struct DirectoryEntry: Codable, Sendable {
    /// Base name of the entry
    public var name: String
    /// Whether the entry is a file or directory
    public var type: String

    public init(
        name: String,
        type: String
    ) {
        self.name = name
        self.type = type
    }
}

public struct ResourceCopyParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Source URI to copy from
    public var source: String
    /// Destination URI to copy to
    public var destination: String
    /// If `true`, the server MUST fail if the destination already exists instead
    /// of overwriting it.
    public var failIfExists: Bool?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case source
        case destination
        case failIfExists
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        source: String,
        destination: String,
        failIfExists: Bool? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.source = source
        self.destination = destination
        self.failIfExists = failIfExists
    }
}

public struct ResourceCopyResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct ResourceDeleteParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// URI of the resource to delete
    public var uri: String
    /// If `true` and the target is a directory, delete it and all its contents
    /// recursively. If `false` (default), deleting a non-empty directory MUST fail.
    public var recursive: Bool?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
        case recursive
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        recursive: Bool? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
        self.recursive = recursive
    }
}

public struct ResourceDeleteResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct ResourceMoveParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Source URI to move from
    public var source: String
    /// Destination URI to move to
    public var destination: String
    /// If `true`, the server MUST fail if the destination already exists instead
    /// of overwriting it.
    public var failIfExists: Bool?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case source
        case destination
        case failIfExists
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        source: String,
        destination: String,
        failIfExists: Bool? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.source = source
        self.destination = destination
        self.failIfExists = failIfExists
    }
}

public struct ResourceMoveResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct ResourceResolveParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// URI to resolve
    public var uri: String
    /// When `true` (default), follow symlinks and report the metadata of the
    /// link target — and set `uri` in the result to the canonical (realpath)
    /// URI. When `false`, stat the link itself (lstat semantics) and report
    /// `type: 'symlink'`.
    public var followSymlinks: Bool?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
        case followSymlinks
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        followSymlinks: Bool? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
        self.followSymlinks = followSymlinks
    }
}

public struct ResourceResolveResult: Codable, Sendable {
    /// Canonical URI after symlink resolution. Equal to the requested URI when
    /// `followSymlinks` is `false` or the URI does not traverse a symlink.
    public var uri: String
    /// Resource kind.
    public var type: ResourceType
    /// Size in bytes. Omitted for directories when the provider cannot
    /// cheaply compute it.
    public var size: Int?
    /// Last-modified time in ISO 8601 format, when known.
    public var mtime: String?
    /// Creation time in ISO 8601 format, when known.
    public var ctime: String?
    /// Sniffed MIME type, when known (e.g. `"text/plain"`, `"image/png"`).
    public var contentType: String?
    /// Opaque per-provider version token. When present, pass it as
    /// {@link ResourceWriteParams.ifMatch} on a subsequent `resourceWrite` to
    /// detect concurrent modifications.
    public var etag: String?

    public init(
        uri: String,
        type: ResourceType,
        size: Int? = nil,
        mtime: String? = nil,
        ctime: String? = nil,
        contentType: String? = nil,
        etag: String? = nil
    ) {
        self.uri = uri
        self.type = type
        self.size = size
        self.mtime = mtime
        self.ctime = ctime
        self.contentType = contentType
        self.etag = etag
    }
}

public struct ResourceMkdirParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Directory URI to create (parents created as needed).
    public var uri: String

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
    }
}

public struct ResourceMkdirResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct ResourceRequestParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Resource URI being requested. Typically a `file:` URI on the receiver's
    /// filesystem, but any URI scheme that the receiver mediates access to is
    /// allowed.
    public var uri: String
    /// Whether the caller needs read access to the resource.
    public var read: Bool?
    /// Whether the caller needs write access to the resource.
    public var write: Bool?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
        case read
        case write
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        read: Bool? = nil,
        write: Bool? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
        self.read = read
        self.write = write
    }
}

public struct ResourceRequestResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct CreateResourceWatchParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// URI to watch.
    public var uri: String
    /// If `true`, the receiver MUST report changes for descendants of `uri`.
    /// If `false` (default), only changes to `uri` itself — and, when `uri`
    /// is a directory, its direct children — are reported.
    public var recursive: Bool?
    /// Glob patterns or paths relative to `uri` to exclude from reporting.
    /// Wrapped in `{ items }` for forward compatibility.
    public var excludes: AnyCodable?
    /// Glob patterns or paths relative to `uri` to restrict reporting to.
    /// Omit to report every change under `uri` subject to `excludes`.
    /// Wrapped in `{ items }` for forward compatibility.
    public var includes: AnyCodable?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case uri
        case recursive
        case excludes
        case includes
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        uri: String,
        recursive: Bool? = nil,
        excludes: AnyCodable? = nil,
        includes: AnyCodable? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.uri = uri
        self.recursive = recursive
        self.excludes = excludes
        self.includes = includes
    }
}

public struct CreateResourceWatchResult: Codable, Sendable {
    /// Receiver-assigned watch channel URI (`ahp-resource-watch:/<id>`). The
    /// caller subscribes to this URI to start receiving change events and
    /// unsubscribes to release the watcher.
    public var channel: String

    public init(
        channel: String
    ) {
        self.channel = channel
    }
}

public struct FetchTurnsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Opaque cursor from `ChatState.turnsNextCursor`.
    ///
    /// The host MUST reject unrecognised cursors with `InvalidParams`. Omit only
    /// when asking the host to opportunistically load its next older page for the
    /// chat, if any.
    public var cursor: String?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case cursor
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        cursor: String? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.cursor = cursor
    }
}

public struct FetchTurnsResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct UnsubscribeParams: Codable, Sendable {
    /// Channel URI to unsubscribe from
    public var channel: String

    public init(
        channel: String
    ) {
        self.channel = channel
    }
}

public struct DispatchActionParams: Codable, Sendable {
    /// Channel URI this action targets
    public var channel: String
    /// Client sequence number
    public var clientSeq: Int
    /// The action to dispatch
    public var action: StateAction

    public init(
        channel: String,
        clientSeq: Int,
        action: StateAction
    ) {
        self.channel = channel
        self.clientSeq = clientSeq
        self.action = action
    }
}

public struct AuthenticateParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// The protected resource identifier. MUST match a `resource` value the
    /// server has advertised — via `ProtectedResourceMetadata` in
    /// `AgentInfo.protectedResources`, or via a live
    /// `McpServerAuthRequiredState.resource` / `ToolCallAuthRequiredState.auth.resource`.
    public var resource: String
    /// Bearer token obtained from the resource's authorization server
    public var token: String
    /// OAuth scopes the token grants, when known. Lets the server determine
    /// whether a specific challenge — e.g. the `requiredScopes` on a live
    /// `McpServerAuthRequiredState` or `ToolCallAuthRequiredState.auth` — is
    /// satisfied without decoding the (opaque, server-specific) token itself.
    /// Omit when the client doesn't track granted scopes separately from the
    /// token.
    public var scopes: [String]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case resource
        case token
        case scopes
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        resource: String,
        token: String,
        scopes: [String]? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.resource = resource
        self.token = token
        self.scopes = scopes
    }
}

public struct AuthenticateResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct CreateTerminalParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Initial owner of the terminal
    public var claim: TerminalClaim
    /// Human-readable terminal name
    public var name: String?
    /// Initial working directory URI
    public var cwd: String?
    /// Initial terminal width in columns
    public var cols: Int?
    /// Initial terminal height in rows
    public var rows: Int?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case claim
        case name
        case cwd
        case cols
        case rows
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        claim: TerminalClaim,
        name: String? = nil,
        cwd: String? = nil,
        cols: Int? = nil,
        rows: Int? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.claim = claim
        self.name = name
        self.cwd = cwd
        self.cols = cols
        self.rows = rows
    }
}

public struct DisposeTerminalParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.channel = channel
        self.meta = meta
    }
}

public struct ResolveSessionConfigParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Agent provider ID
    public var provider: String?
    /// Working directory for the session
    public var workingDirectory: String?
    /// Current user-filled configuration values
    public var config: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case provider
        case workingDirectory
        case config
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        provider: String? = nil,
        workingDirectory: String? = nil,
        config: [String: AnyCodable]? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.provider = provider
        self.workingDirectory = workingDirectory
        self.config = config
    }
}

public struct ResolveSessionConfigResult: Codable, Sendable {
    /// JSON Schema describing available configuration properties given the current context
    public var schema: SessionConfigSchema
    /// Current configuration values (echoed back with server-resolved defaults applied)
    public var values: [String: AnyCodable]

    public init(
        schema: SessionConfigSchema,
        values: [String: AnyCodable]
    ) {
        self.schema = schema
        self.values = values
    }
}

public struct SessionConfigPropertySchema: Codable, Sendable {
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
    /// Display extension: when `true`, the full set of allowed values is too large
    /// to enumerate statically. The client SHOULD use `sessionConfigCompletions`
    /// to fetch matching values based on user input. Any values in `enum` are
    /// seed/recent values for initial display.
    public var enumDynamic: Bool?
    /// When `true`, the user may change this property after session creation
    public var sessionMutable: Bool?

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
        case enumDynamic
        case sessionMutable
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
        additionalProperties: ConfigPropertySchema? = nil,
        enumDynamic: Bool? = nil,
        sessionMutable: Bool? = nil
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
        self.enumDynamic = enumDynamic
        self.sessionMutable = sessionMutable
    }
}

public struct SessionConfigSchema: Codable, Sendable {
    /// JSON Schema: always `'object'`
    public var type: String
    /// JSON Schema: property descriptors keyed by property id
    public var properties: [String: SessionConfigPropertySchema]
    /// JSON Schema: list of required property ids
    public var required: [String]?

    public init(
        type: String,
        properties: [String: SessionConfigPropertySchema],
        required: [String]? = nil
    ) {
        self.type = type
        self.properties = properties
        self.required = required
    }
}

public struct SessionConfigCompletionsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Agent provider ID
    public var provider: String?
    /// Working directory for the session
    public var workingDirectory: String?
    /// Current user-filled configuration values (provides context for the query)
    public var config: [String: AnyCodable]?
    /// Property id from the schema to query values for
    public var property: String
    /// Search filter text (empty or omitted returns default/recent values)
    public var query: String?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case provider
        case workingDirectory
        case config
        case property
        case query
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        provider: String? = nil,
        workingDirectory: String? = nil,
        config: [String: AnyCodable]? = nil,
        property: String,
        query: String? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.provider = provider
        self.workingDirectory = workingDirectory
        self.config = config
        self.property = property
        self.query = query
    }
}

public struct SessionConfigCompletionsResult: Codable, Sendable {
    /// Matching value items
    public var items: [SessionConfigValueItem]

    public init(
        items: [SessionConfigValueItem]
    ) {
        self.items = items
    }
}

public struct SessionConfigValueItem: Codable, Sendable {
    /// The value to store in config
    public var value: String
    /// Human-readable display label
    public var label: String
    /// Optional secondary description
    public var description: String?

    public init(
        value: String,
        label: String,
        description: String? = nil
    ) {
        self.value = value
        self.label = label
        self.description = description
    }
}

public struct CompletionsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// What kind of completion is being requested.
    public var kind: CompletionItemKind
    /// The complete text of the input being completed (e.g. the full user
    /// message text typed so far).
    public var text: String
    /// The character offset within `text` at which the completion is requested,
    /// measured in UTF-16 code units. MUST satisfy `0 <= offset <= text.length`.
    public var offset: Int

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case kind
        case text
        case offset
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        kind: CompletionItemKind,
        text: String,
        offset: Int
    ) {
        self.channel = channel
        self.meta = meta
        self.kind = kind
        self.text = text
        self.offset = offset
    }
}

public struct CompletionItem: Codable, Sendable {
    /// The text inserted into the input when this item is accepted.
    public var insertText: String
    /// If defined, the start of the range in the input's `text` that is replaced
    /// by `insertText`. The range is the half-open interval
    /// `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
    /// units.
    ///
    /// When omitted, the client SHOULD insert `insertText` at the cursor.
    ///
    /// Note: this range refers to positions in the *current* input. The
    /// attachment's own `rangeStart`/`rangeEnd` (when present) refer to
    /// positions in the final {@link Message.text} after the item is
    /// accepted.
    public var rangeStart: Int?
    /// The end of the range in the input's `text` that is replaced by
    /// `insertText`. See {@link rangeStart}.
    public var rangeEnd: Int?
    /// The attachment associated with this completion item.
    public var attachment: MessageAttachment

    public init(
        insertText: String,
        rangeStart: Int? = nil,
        rangeEnd: Int? = nil,
        attachment: MessageAttachment
    ) {
        self.insertText = insertText
        self.rangeStart = rangeStart
        self.rangeEnd = rangeEnd
        self.attachment = attachment
    }
}

public struct CompletionsResult: Codable, Sendable {
    /// The completion items, in the order the server suggests displaying them.
    public var items: [CompletionItem]

    public init(
        items: [CompletionItem]
    ) {
        self.items = items
    }
}

public struct InvokeChangesetOperationParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Matches {@link ChangesetOperation.id} from the changeset's `operations` list.
    public var operationId: String
    /// Target of the operation. Required iff the chosen scope is
    /// `'resource'` or `'range'`. Omit for changeset-scoped operations.
    public var target: ChangesetOperationTarget?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case operationId
        case target
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        operationId: String,
        target: ChangesetOperationTarget? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.operationId = operationId
        self.target = target
    }
}

public struct InvokeChangesetOperationResult: Codable, Sendable {
    /// Optional human-readable message describing the result.
    public var message: StringOrMarkdown?
    /// Optional follow-up: a URI to open (e.g. a PR), a content ref, etc.
    public var followUp: ChangesetOperationFollowUp?

    public init(
        message: StringOrMarkdown? = nil,
        followUp: ChangesetOperationFollowUp? = nil
    ) {
        self.message = message
        self.followUp = followUp
    }
}

public struct ChangesetOperationFollowUp: Codable, Sendable {
    public var content: ContentRef
    /// When `true`, open in an external handler rather than inline.
    public var external: Bool?

    public init(
        content: ContentRef,
        external: Bool? = nil
    ) {
        self.content = content
        self.external = external
    }
}

public struct ListAutomationsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Maximum number of entries to return in this page. The server SHOULD respect
    /// this bound but MAY return fewer entries and MAY impose its own upper cap.
    /// Omit to let the server choose the page size.
    public var limit: Int?
    /// Opaque pagination cursor from a previous {@link PaginatedResult.nextCursor}.
    /// Omit to fetch the first page. Cursors are server-defined and MUST be treated
    /// as opaque — do not parse, modify, or persist them across connections. An
    /// unrecognised cursor SHOULD be rejected with an `InvalidParams` error.
    public var cursor: String?
    /// Optional exact filter on {@link AutomationDefinition.enabled}.
    public var enabled: Bool?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case limit
        case cursor
        case enabled
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        limit: Int? = nil,
        cursor: String? = nil,
        enabled: Bool? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.limit = limit
        self.cursor = cursor
        self.enabled = enabled
    }
}

public struct ListAutomationsResult: Codable, Sendable {
    /// Opaque cursor for the next page. Present when more entries exist beyond the
    /// returned page; absent signals the end of the collection. Pass it back as
    /// {@link PaginatedParams.cursor} to fetch the following page.
    public var nextCursor: String?
    /// Automation summaries in host-defined catalogue order.
    public var items: [AutomationSummary]

    public init(
        nextCursor: String? = nil,
        items: [AutomationSummary]
    ) {
        self.nextCursor = nextCursor
        self.items = items
    }
}

public struct ListAutomationTriggerDefinitionsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Prospective provider id, or omitted for the host default.
    public var provider: String?
    /// Prospective ordered working-directory list.
    public var workingDirectories: [String]?
    /// Prospective resolved session configuration values.
    public var sessionConfig: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case provider
        case workingDirectories
        case sessionConfig
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        provider: String? = nil,
        workingDirectories: [String]? = nil,
        sessionConfig: [String: AnyCodable]? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.provider = provider
        self.workingDirectories = workingDirectories
        self.sessionConfig = sessionConfig
    }
}

public struct ListAutomationTriggerDefinitionsResult: Codable, Sendable {
    /// Available event trigger definitions.
    public var items: [AutomationTriggerDefinition]

    public init(
        items: [AutomationTriggerDefinition]
    ) {
        self.items = items
    }
}

public struct CreateAutomationParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Complete initial definition.
    public var definition: AutomationDefinition
    /// Optional idempotency identity when importing a legacy definition.
    public var `import`: AutomationImportIdentity?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case definition
        case `import` = "import"
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        definition: AutomationDefinition,
        `import`: AutomationImportIdentity? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.definition = definition
        self.`import` = `import`
    }
}

public struct AutomationImportIdentity: Codable, Sendable {
    /// Stable namespace identifying the source implementation or store.
    public var source: String
    /// Identifier shared by every item in one import attempt.
    public var batchId: String
    /// Stable source-side identifier for this definition within the batch.
    public var itemId: String

    public init(
        source: String,
        batchId: String,
        itemId: String
    ) {
        self.source = source
        self.batchId = batchId
        self.itemId = itemId
    }
}

public struct AutomationDefinitionPatch: Codable, Sendable {
    /// Replacement human-readable title.
    public var title: String?
    /// Replacement initial user message.
    public var message: Message?
    /// Replacement session template.
    public var session: AutomationSessionTemplate?
    /// Replacement automatic-trigger enabled state.
    public var enabled: Bool?
    /// Complete replacement trigger list.
    public var triggers: [AutomationTrigger]?
    /// Complete replacement implementation-defined metadata.
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

public struct UpdateAutomationParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Revision on which the client based {@link changes}.
    public var expectedRevision: Int
    /// Editable fields to replace.
    public var changes: AutomationDefinitionPatch

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case expectedRevision
        case changes
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        expectedRevision: Int,
        changes: AutomationDefinitionPatch
    ) {
        self.channel = channel
        self.meta = meta
        self.expectedRevision = expectedRevision
        self.changes = changes
    }
}

public struct DisposeAutomationParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil
    ) {
        self.channel = channel
        self.meta = meta
    }
}

public struct RunAutomationParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Durable client-generated idempotency key. Retrying with the same key and
    /// automation MUST return the original run URI rather than create another
    /// run.
    public var requestId: String

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case requestId
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        requestId: String
    ) {
        self.channel = channel
        self.meta = meta
        self.requestId = requestId
    }
}

public struct RunAutomationResult: Codable, Sendable {
    /// Subscribable `ahp-automation-run:` URI.
    public var run: String

    public init(
        run: String
    ) {
        self.run = run
    }
}

public struct FetchAutomationRunsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Cursor previously received as {@link AutomationState.runsNextCursor}.
    /// Omit to request the first page not already included by the snapshot.
    public var cursor: String?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case cursor
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        cursor: String? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.cursor = cursor
    }
}

public struct FetchAutomationRunsResult: Codable, Sendable {

    public init(

    ) {
    }
}

public struct PreviewAutomationScheduleParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional JSON-serializable metadata associated with this request.
    /// Receivers MUST ignore keys they do not understand.
    public var meta: [String: AnyCodable]?
    /// Portable AHP cron schedule to evaluate.
    public var schedule: AutomationSchedule
    /// Requested maximum number of future occurrences; the host MAY cap it.
    public var count: Int?

    enum CodingKeys: String, CodingKey {
        case channel
        case meta = "_meta"
        case schedule
        case count
    }

    public init(
        channel: String,
        meta: [String: AnyCodable]? = nil,
        schedule: AutomationSchedule,
        count: Int? = nil
    ) {
        self.channel = channel
        self.meta = meta
        self.schedule = schedule
        self.count = count
    }
}

public struct PreviewAutomationScheduleResult: Codable, Sendable {
    /// Ascending ISO 8601 timestamps.
    public var items: [String]

    public init(
        items: [String]
    ) {
        self.items = items
    }
}

// MARK: - Command Unions

public enum ChatSource: Codable, Sendable {
    case fork(ForkChatSource)
    case sideChat(SideChatSource)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "fork":
            self = .fork(try ForkChatSource(from: decoder))
        case "sideChat":
            self = .sideChat(try SideChatSource(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ChatSource discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .fork(let value): try value.encode(to: encoder)
        case .sideChat(let value): try value.encode(to: encoder)
        }
    }
}

// MARK: - ReconnectResult Union

public enum ReconnectResult: Codable, Sendable {
    case replay(ReconnectReplayResult)
    case snapshot(ReconnectSnapshotResult)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "type"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "replay":
            self = .replay(try ReconnectReplayResult(from: decoder))
        case "snapshot":
            self = .snapshot(try ReconnectSnapshotResult(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ReconnectResult discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .replay(let value): try value.encode(to: encoder)
        case .snapshot(let value): try value.encode(to: encoder)
        }
    }
}

// MARK: - Changeset Operation Unions

/// Identifies the file or range a `ChangesetOperation` should act on.
public enum ChangesetOperationTarget: Codable, Sendable {
    case resource(ChangesetOperationResourceTarget)
    case range(ChangesetOperationRangeTarget)

    private enum DiscriminantKey: String, CodingKey {
        case discriminant = "kind"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DiscriminantKey.self)
        let discriminant = try container.decode(String.self, forKey: .discriminant)
        switch discriminant {
        case "resource":
            self = .resource(try ChangesetOperationResourceTarget(from: decoder))
        case "range":
            self = .range(try ChangesetOperationRangeTarget(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(forKey: .discriminant, in: container, debugDescription: "Unknown ChangesetOperationTarget discriminant: \(discriminant)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .resource(let value): try value.encode(to: encoder)
        case .range(let value): try value.encode(to: encoder)
        }
    }
}

public struct ChangesetOperationResourceTarget: Codable, Sendable {
    public var kind: String { "resource" }
    public var resource: String
    public var side: String?

    public init(resource: String, side: String? = nil) {
        self.resource = resource
        self.side = side
    }

    // kind is the union discriminant: a fixed constant for this variant (so it
    // is NOT decoded from the wire — the union already dispatched on it), but it
    // MUST be re-emitted on encode so the wire stays a decodable
    // discriminated-union value. Hence the custom encode and the decode-only
    // CodingKeys that omit kind.
    private enum CodingKeys: String, CodingKey { case resource, side }
    private enum EncodingKeys: String, CodingKey { case kind, resource, side }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(resource, forKey: .resource)
        try container.encodeIfPresent(side, forKey: .side)
    }
}

public struct ChangesetOperationRangeTarget: Codable, Sendable {
    public var kind: String { "range" }
    public var resource: String
    public var side: String?
    public var range: TextRange

    public init(resource: String, side: String? = nil, range: TextRange) {
        self.resource = resource
        self.side = side
        self.range = range
    }

    // See ChangesetOperationResourceTarget: kind is re-emitted on encode but
    // not decoded (the union dispatches on it).
    private enum CodingKeys: String, CodingKey { case resource, side, range }
    private enum EncodingKeys: String, CodingKey { case kind, resource, side, range }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: EncodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(resource, forKey: .resource)
        try container.encodeIfPresent(side, forKey: .side)
        try container.encode(range, forKey: .range)
    }
}
