// Generated from types/*.ts — do not edit

import Foundation

// MARK: - Command Enums

/// Discriminant for reconnect result types.
public enum ReconnectResultType: String, Codable, Sendable {
    case replay = "replay"
    case snapshot = "snapshot"
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

public struct InitializeParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
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

    public init(
        channel: String,
        protocolVersions: [String],
        clientId: String,
        initialSubscriptions: [String]? = nil,
        locale: String? = nil,
        capabilities: ClientCapabilities? = nil
    ) {
        self.channel = channel
        self.protocolVersions = protocolVersions
        self.clientId = clientId
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
    /// Snapshots for each `initialSubscriptions` URI
    public var snapshots: [Snapshot]
    /// Suggested default directory for remote filesystem browsing
    public var defaultDirectory: String?
    /// Characters that, when typed in a {@link Message} input, SHOULD cause
    /// the client to issue a `completions` request with
    /// {@link CompletionItemKind.UserMessage}. Typically includes characters like
    /// `'@'` or `'/'`.
    public var completionTriggerCharacters: [String]?
    /// OTLP telemetry channels the host emits, if any. Each populated field is
    /// either a literal `ahp-otlp:` channel URI or an RFC 6570 URI template a
    /// client expands before subscribing (currently only the `logs` channel
    /// defines a template variable, `{level}`, for subscriber-side severity
    /// filtering). Clients MAY ignore signals they cannot process.
    public var telemetry: TelemetryCapabilities?

    public init(
        protocolVersion: String,
        serverSeq: Int,
        snapshots: [Snapshot],
        defaultDirectory: String? = nil,
        completionTriggerCharacters: [String]? = nil,
        telemetry: TelemetryCapabilities? = nil
    ) {
        self.protocolVersion = protocolVersion
        self.serverSeq = serverSeq
        self.snapshots = snapshots
        self.defaultDirectory = defaultDirectory
        self.completionTriggerCharacters = completionTriggerCharacters
        self.telemetry = telemetry
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

public struct ReconnectParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Client identifier from the original connection
    public var clientId: String
    /// Last `serverSeq` the client received
    public var lastSeenServerSeq: Int
    /// URIs the client was subscribed to
    public var subscriptions: [String]

    public init(
        channel: String,
        clientId: String,
        lastSeenServerSeq: Int,
        subscriptions: [String]
    ) {
        self.channel = channel
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
    /// Optional delivery preferences for this subscription.
    ///
    /// Servers MAY use these preferences to buffer and coalesce high-frequency
    /// updates while preserving the same reduced state. Omit this field for the
    /// server's default delivery behavior.
    public var delivery: SubscriptionDeliveryOptions?

    public init(
        channel: String,
        delivery: SubscriptionDeliveryOptions? = nil
    ) {
        self.channel = channel
        self.delivery = delivery
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
    /// Agent provider ID
    public var provider: String?
    /// Working directory for the session
    public var workingDirectory: String?
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

    public init(
        channel: String,
        provider: String? = nil,
        workingDirectory: String? = nil,
        fork: SessionForkSource? = nil,
        config: [String: AnyCodable]? = nil,
        activeClient: SessionActiveClient? = nil,
        progressToken: String? = nil
    ) {
        self.channel = channel
        self.provider = provider
        self.workingDirectory = workingDirectory
        self.fork = fork
        self.config = config
        self.activeClient = activeClient
        self.progressToken = progressToken
    }
}

public struct DisposeSessionParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String

    public init(
        channel: String
    ) {
        self.channel = channel
    }
}

public struct ChatForkSource: Codable, Sendable {
    /// URI of the existing chat to fork from
    public var chat: String
    /// Turn ID in the source chat; content up to and including this turn's response is copied
    public var turnId: String

    public init(
        chat: String,
        turnId: String
    ) {
        self.chat = chat
        self.turnId = turnId
    }
}

public struct CreateChatParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`).
    public var chat: String
    /// Optional initial message for the new chat.
    public var initialMessage: Message?
    /// Optional source chat and turn to fork from.
    public var source: ChatForkSource?

    public init(
        channel: String,
        chat: String,
        initialMessage: Message? = nil,
        source: ChatForkSource? = nil
    ) {
        self.channel = channel
        self.chat = chat
        self.initialMessage = initialMessage
        self.source = source
    }
}

public struct DisposeChatParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String

    public init(
        channel: String
    ) {
        self.channel = channel
    }
}

public struct ListSessionsParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Optional filter criteria
    public var filter: AnyCodable?

    public init(
        channel: String,
        filter: AnyCodable? = nil
    ) {
        self.channel = channel
        self.filter = filter
    }
}

public struct ListSessionsResult: Codable, Sendable {
    /// The list of session summaries.
    public var items: [SessionSummary]

    public init(
        items: [SessionSummary]
    ) {
        self.items = items
    }
}

public struct ResourceReadParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Content URI from a `ContentRef`
    public var uri: String
    /// Preferred encoding for the returned data (default: server-chosen)
    public var encoding: ContentEncoding?

    public init(
        channel: String,
        uri: String,
        encoding: ContentEncoding? = nil
    ) {
        self.channel = channel
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

    public init(
        channel: String,
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
    /// Directory URI on the server filesystem
    public var uri: String

    public init(
        channel: String,
        uri: String
    ) {
        self.channel = channel
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
    /// Source URI to copy from
    public var source: String
    /// Destination URI to copy to
    public var destination: String
    /// If `true`, the server MUST fail if the destination already exists instead
    /// of overwriting it.
    public var failIfExists: Bool?

    public init(
        channel: String,
        source: String,
        destination: String,
        failIfExists: Bool? = nil
    ) {
        self.channel = channel
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
    /// URI of the resource to delete
    public var uri: String
    /// If `true` and the target is a directory, delete it and all its contents
    /// recursively. If `false` (default), deleting a non-empty directory MUST fail.
    public var recursive: Bool?

    public init(
        channel: String,
        uri: String,
        recursive: Bool? = nil
    ) {
        self.channel = channel
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
    /// Source URI to move from
    public var source: String
    /// Destination URI to move to
    public var destination: String
    /// If `true`, the server MUST fail if the destination already exists instead
    /// of overwriting it.
    public var failIfExists: Bool?

    public init(
        channel: String,
        source: String,
        destination: String,
        failIfExists: Bool? = nil
    ) {
        self.channel = channel
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
    /// URI to resolve
    public var uri: String
    /// When `true` (default), follow symlinks and report the metadata of the
    /// link target — and set `uri` in the result to the canonical (realpath)
    /// URI. When `false`, stat the link itself (lstat semantics) and report
    /// `type: 'symlink'`.
    public var followSymlinks: Bool?

    public init(
        channel: String,
        uri: String,
        followSymlinks: Bool? = nil
    ) {
        self.channel = channel
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
    /// Directory URI to create (parents created as needed).
    public var uri: String

    public init(
        channel: String,
        uri: String
    ) {
        self.channel = channel
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
    /// Resource URI being requested. Typically a `file:` URI on the receiver's
    /// filesystem, but any URI scheme that the receiver mediates access to is
    /// allowed.
    public var uri: String
    /// Whether the caller needs read access to the resource.
    public var read: Bool?
    /// Whether the caller needs write access to the resource.
    public var write: Bool?

    public init(
        channel: String,
        uri: String,
        read: Bool? = nil,
        write: Bool? = nil
    ) {
        self.channel = channel
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

    public init(
        channel: String,
        uri: String,
        recursive: Bool? = nil,
        excludes: AnyCodable? = nil,
        includes: AnyCodable? = nil
    ) {
        self.channel = channel
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
    /// Turn ID to fetch before (exclusive). Omit to fetch from the most recent turn.
    public var before: String?
    /// Maximum number of turns to return. Server MAY impose its own upper bound.
    public var limit: Int?

    public init(
        channel: String,
        before: String? = nil,
        limit: Int? = nil
    ) {
        self.channel = channel
        self.before = before
        self.limit = limit
    }
}

public struct FetchTurnsResult: Codable, Sendable {
    /// The requested turns, ordered oldest-first
    public var turns: [Turn]
    /// Whether more turns exist before the returned range
    public var hasMore: Bool

    public init(
        turns: [Turn],
        hasMore: Bool
    ) {
        self.turns = turns
        self.hasMore = hasMore
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
    /// The protected resource identifier. MUST match a `resource` value from
    /// `ProtectedResourceMetadata` declared in `AgentInfo.protectedResources`.
    public var resource: String
    /// Bearer token obtained from the resource's authorization server
    public var token: String

    public init(
        channel: String,
        resource: String,
        token: String
    ) {
        self.channel = channel
        self.resource = resource
        self.token = token
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

    public init(
        channel: String,
        claim: TerminalClaim,
        name: String? = nil,
        cwd: String? = nil,
        cols: Int? = nil,
        rows: Int? = nil
    ) {
        self.channel = channel
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

    public init(
        channel: String
    ) {
        self.channel = channel
    }
}

public struct ResolveSessionConfigParams: Codable, Sendable {
    /// Channel URI this command targets.
    public var channel: String
    /// Agent provider ID
    public var provider: String?
    /// Working directory for the session
    public var workingDirectory: String?
    /// Current user-filled configuration values
    public var config: [String: AnyCodable]?

    public init(
        channel: String,
        provider: String? = nil,
        workingDirectory: String? = nil,
        config: [String: AnyCodable]? = nil
    ) {
        self.channel = channel
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

    public init(
        channel: String,
        provider: String? = nil,
        workingDirectory: String? = nil,
        config: [String: AnyCodable]? = nil,
        property: String,
        query: String? = nil
    ) {
        self.channel = channel
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
    /// What kind of completion is being requested.
    public var kind: CompletionItemKind
    /// The complete text of the input being completed (e.g. the full user
    /// message text typed so far).
    public var text: String
    /// The character offset within `text` at which the completion is requested,
    /// measured in UTF-16 code units. MUST satisfy `0 <= offset <= text.length`.
    public var offset: Int

    public init(
        channel: String,
        kind: CompletionItemKind,
        text: String,
        offset: Int
    ) {
        self.channel = channel
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
    /// Matches {@link ChangesetOperation.id} from the changeset's `operations` list.
    public var operationId: String
    /// Target of the operation. Required iff the chosen scope is
    /// `'resource'` or `'range'`. Omit for changeset-scoped operations.
    public var target: ChangesetOperationTarget?

    public init(
        channel: String,
        operationId: String,
        target: ChangesetOperationTarget? = nil
    ) {
        self.channel = channel
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
