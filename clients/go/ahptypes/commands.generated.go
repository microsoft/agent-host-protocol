// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:go

package ahptypes

import (
	"encoding/json"
)

// Reference the encoding/json import to keep gofmt -d from
// stripping it when a generated file has no struct that mentions
// json.RawMessage directly (rare but possible). Compiled out.
var _ = json.RawMessage(nil)

// ─── Enums ────────────────────────────────────────────────────────────

// Discriminant for reconnect result types.
type ReconnectResultType string

const (
	ReconnectResultTypeReplay   ReconnectResultType = "replay"
	ReconnectResultTypeSnapshot ReconnectResultType = "snapshot"
)

// How a new chat uses its source chat and turn.
type ChatSourceKind string

const (
	// Copy source history through the referenced turn into the new chat.
	ChatSourceKindFork ChatSourceKind = "fork"
	// Supply source context without copying it into the new chat's visible history.
	ChatSourceKindSideChat ChatSourceKind = "sideChat"
)

// Encoding of fetched content data.
type ContentEncoding string

const (
	ContentEncodingBase64 ContentEncoding = "base64"
	ContentEncodingUtf8   ContentEncoding = "utf-8"
)

// The kind of completion items being requested.
type CompletionItemKind string

const (
	// Completions for the text of a {@link Message} the user is composing.
	// Each returned item carries an attachment that gets associated with the
	// message when accepted.
	CompletionItemKindUserMessage CompletionItemKind = "userMessage"
)

// Discriminant for {@link ResourceResolveResult.type}.
type ResourceType string

const (
	ResourceTypeFile      ResourceType = "file"
	ResourceTypeDirectory ResourceType = "directory"
	ResourceTypeSymlink   ResourceType = "symlink"
)

// How {@link ResourceWriteParams.data} is placed within the target file.
//
// Each mode interprets {@link ResourceWriteParams.position} differently:
//
//   - `truncate` (default): rooted at the **start** of the file. The file is
//     truncated at `position` (0 by default) and `data` is written from that
//     offset, so the resulting file is `existing[0..position] + data`. With
//     `position` omitted this is a full overwrite.
//   - `append`: rooted at the **end** of the file. `position` counts bytes
//     backwards from EOF, so `position: 0` (the default) writes at EOF —
//     POSIX append — and `position: 5` inserts `data` 5 bytes before the
//     current EOF, shifting those trailing 5 bytes after the inserted region.
//     The server MUST evaluate the effective EOF and write atomically with
//     respect to other appenders so concurrent `append` writes do not
//     clobber each other.
//   - `insert`: rooted at the **start** of the file. `position` (0 by default)
//     is the byte offset at which `data` is spliced in; bytes at or after
//     `position` are shifted right by `data.length`. `insert` always grows
//     the file — use `truncate` to overwrite bytes in place.
type ResourceWriteMode string

const (
	ResourceWriteModeTruncate ResourceWriteMode = "truncate"
	ResourceWriteModeAppend   ResourceWriteMode = "append"
	ResourceWriteModeInsert   ResourceWriteMode = "insert"
)

// ─── Command Payloads ─────────────────────────────────────────────────

// Establishes a new connection and negotiates the protocol version.
// This MUST be the first message sent by the client.
type InitializeParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Protocol versions the client is willing to speak, ordered from most
	// preferred to least preferred. Each entry is a [SemVer](https://semver.org)
	// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
	//
	// The server selects one entry and returns it as `InitializeResult.protocolVersion`.
	// If the server cannot speak any of the offered versions, it MUST return
	// error code `-32005` (`UnsupportedProtocolVersion`).
	ProtocolVersions []string `json:"protocolVersions"`
	// Unique client identifier
	ClientId string `json:"clientId"`
	// Optional identity of the client implementation (name and version).
	// Informational only — see {@link Implementation} for how it may and may not
	// be used. Distinct from {@link InitializeParams.clientId | `clientId`},
	// which is an opaque per-connection identifier used for reconnection, not a
	// human-readable implementation name.
	ClientInfo *Implementation `json:"clientInfo,omitempty"`
	// URIs to subscribe to during handshake
	InitialSubscriptions []URI `json:"initialSubscriptions,omitempty"`
	// IETF BCP 47 language tag indicating the client's preferred locale
	// (e.g. `"en-US"`, `"ja"`). The server SHOULD use this to localise
	// user-facing strings such as confirmation option labels.
	Locale *string `json:"locale,omitempty"`
	// Optional client capability declarations.
	//
	// Servers SHOULD only advertise features whose corresponding client
	// capability is set here. Absent means "not declared" — the server
	// MUST assume the client does not support the feature.
	Capabilities *ClientCapabilities `json:"capabilities,omitempty"`
}

// Result of the `initialize` command.
//
// `protocolVersion` is the version the server has selected from the client's
// `protocolVersions` list. The client and server MUST use this version for
// the rest of the connection. If the server cannot speak any of the offered
// versions it MUST return error code `-32005` (`UnsupportedProtocolVersion`)
// instead of a result.
type InitializeResult struct {
	// Protocol version selected by the server. MUST be one of the entries in
	// `InitializeParams.protocolVersions`. Formatted as a [SemVer](https://semver.org)
	// `MAJOR.MINOR.PATCH` string (e.g. `"0.1.0"`).
	ProtocolVersion string `json:"protocolVersion"`
	// Current server sequence number
	ServerSeq int64 `json:"serverSeq"`
	// Optional identity of the server implementation (name and version).
	// Informational only — see {@link Implementation} for how it may and may not
	// be used. Whereas {@link InitializeResult.protocolVersion | `protocolVersion`}
	// identifies the negotiated protocol, `serverInfo` identifies the host
	// software behind it.
	ServerInfo *Implementation `json:"serverInfo,omitempty"`
	// Snapshots for each `initialSubscriptions` URI
	Snapshots []Snapshot `json:"snapshots"`
	// Suggested default directory for remote filesystem browsing
	DefaultDirectory *URI `json:"defaultDirectory,omitempty"`
	// Characters that, when typed in a {@link Message} input, SHOULD cause
	// the client to issue a `completions` request with
	// {@link CompletionItemKind.UserMessage}. Typically includes characters like
	// `'@'` or `'/'`.
	CompletionTriggerCharacters []string `json:"completionTriggerCharacters,omitempty"`
	// Prefix that the host recognizes at the start of a user {@link Message.text}
	// as a shorthand for executing the remainder as a terminal command. Currently
	// the standardized convention is `"!"`; absence means the host does not
	// support command prefixes.
	TerminalCommandPrefix *string `json:"terminalCommandPrefix,omitempty"`
	// OTLP telemetry channels the host emits, if any. Each populated field is
	// either a literal `ahp-otlp:` channel URI or an RFC 6570 URI template a
	// client expands before subscribing (currently only the `logs` channel
	// defines a template variable, `{level}`, for subscriber-side severity
	// filtering). Clients MAY ignore signals they cannot process.
	Telemetry *TelemetryCapabilities `json:"telemetry,omitempty"`
	// Host automation support. Absence means unsupported.
	Automations *AutomationCapabilities `json:"automations,omitempty"`
}

// Optional capabilities a client declares during `initialize`.
//
// Each field is a presence flag: an empty object `{}` means "supported",
// absence means "not supported". Sub-fields on individual capabilities
// are reserved for future per-capability options.
type ClientCapabilities struct {
	// Client can render
	// [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) — i.e.
	// it can host the View sandbox, run the `ui/*` protocol against it,
	// and forward `mcp://`-channel traffic on the App's behalf.
	//
	// Hosts SHOULD only populate
	// {@link McpServerCustomization.mcpApp | `McpServerCustomization.mcpApp`}
	// (and expose the corresponding
	// {@link McpServerCustomization.channel | `mcp://` channel}) when this
	// capability is declared. Clients that omit it MUST treat
	// App-bearing tool calls as ordinary MCP tool calls.
	McpApps map[string]json.RawMessage `json:"mcpApps,omitempty"`
}

type AutomationCapabilities struct {
	Execution       AutomationExecutionCapabilities      `json:"execution"`
	Create          *AutomationCreateCapability          `json:"create,omitempty"`
	Schedules       *AutomationScheduleCapabilities      `json:"schedules,omitempty"`
	RunCancellation *AutomationRunCancellationCapability `json:"runCancellation,omitempty"`
	SchedulePreview *AutomationSchedulePreviewCapability `json:"schedulePreview,omitempty"`
	RunHistoryLimit *int64                               `json:"runHistoryLimit,omitempty"`
}

type AutomationExecutionCapabilities struct {
	Lifetime AutomationExecutionLifetime `json:"lifetime"`
}

type AutomationCreateCapability struct {
}

type AutomationScheduleCapabilities struct {
	Kinds []AutomationScheduleKind          `json:"kinds"`
	Cron  *AutomationCronScheduleCapability `json:"cron,omitempty"`
}

type AutomationCronScheduleCapability struct {
	Dialect            string `json:"dialect"`
	MinIntervalMinutes *int64 `json:"minIntervalMinutes,omitempty"`
}

type AutomationRunCancellationCapability struct {
}

type AutomationSchedulePreviewCapability struct {
}

// Identifies a protocol implementation — the software (and build) on one end
// of the connection, as distinct from the {@link AgentInfo | agent persona} it
// hosts. Carried as {@link InitializeParams.clientInfo | `clientInfo`} on the
// client side and {@link InitializeResult.serverInfo | `serverInfo`} on the
// server side, mirroring LSP's `clientInfo`/`serverInfo` and MCP's
// `Implementation`.
//
// This is **informational only**: it exists for logging, telemetry, an
// about/status affordance, and — as a last resort — a known-issue workaround
// for a specific buggy build. It is **not** a feature-detection mechanism.
// Feature availability stays with the capability model
// ({@link ClientCapabilities} and the various `*.capabilities` declarations);
// implementations SHOULD NOT gate protocol behaviour on parsing
// {@link Implementation.version | `version`}.
type Implementation struct {
	// Implementation name, e.g. a product or package identifier.
	Name string `json:"name"`
	// Implementation version. A [SemVer](https://semver.org) string is
	// recommended but not required.
	Version *string `json:"version,omitempty"`
	// Optional human-readable display name.
	Title *string `json:"title,omitempty"`
}

// Re-establishes a dropped connection. The server replays missed actions or
// provides fresh snapshots.
type ReconnectParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Client identifier from the original connection
	ClientId string `json:"clientId"`
	// Last `serverSeq` the client received
	LastSeenServerSeq int64 `json:"lastSeenServerSeq"`
	// URIs the client was subscribed to
	Subscriptions []URI `json:"subscriptions"`
}

// Reconnect result when the server can replay from the requested sequence.
//
// The server MUST include all replayed data in the response.
type ReconnectReplayResult struct {
	// Missed action envelopes since `lastSeenServerSeq`
	Actions []ActionEnvelope `json:"actions"`
	// URIs from `ReconnectParams.subscriptions` that the server cannot resume.
	// This includes resources that no longer exist (e.g. disposed sessions or
	// terminals) as well as resources the client is no longer permitted to
	// observe. Clients SHOULD drop these from their local subscription set.
	Missing []URI `json:"missing"`
}

// Reconnect result when the gap exceeds the replay buffer.
type ReconnectSnapshotResult struct {
	// Fresh snapshots for each subscription
	Snapshots []Snapshot `json:"snapshots"`
}

// Subscribe to a URI-identified channel.
//
// A channel MAY have state associated with it (e.g. root, sessions,
// terminals) or be stateless (pure pub/sub for streaming data). For
// state-bearing channels the result includes a snapshot; for stateless
// channels `snapshot` is omitted.
type SubscribeParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Optional delivery preferences for this subscription.
	//
	// Servers MAY use these preferences to buffer and coalesce high-frequency
	// updates while preserving the same reduced state. Omit this field for the
	// server's default delivery behavior.
	Delivery *SubscriptionDeliveryOptions `json:"delivery,omitempty"`
	// Optional client-requested shape for the returned snapshot.
	//
	// Servers that do not understand a requested view ignore it and return their
	// default snapshot. Clients MUST tolerate receiving more state than requested.
	View *SubscribeView `json:"view,omitempty"`
}

// Optional client-requested shape for a subscription snapshot.
type SubscribeView struct {
	// Advisory number of most-recent completed turns to expose in a chat
	// snapshot.
	//
	// Servers MAY return more or fewer turns than requested. When omitted, the
	// host MUST return all retained turns. When older turns remain available, the
	// returned {@link ChatState} carries `turnsNextCursor`; clients pass that
	// cursor to `fetchTurns` to ask the host to page more turns into the chat
	// state.
	Turns *int64 `json:"turns,omitempty"`
}

// Advisory delivery preferences for a single subscription.
type SubscriptionDeliveryOptions struct {
	// Maximum time, in milliseconds, that the server may intentionally delay
	// delivery while buffering/coalescing updates for this subscription.
	//
	// A value of `0` requests immediate delivery with no intentional coalescing.
	MaxLatencyMs *int64 `json:"maxLatencyMs,omitempty"`
}

// Result of the `subscribe` command.
//
// `snapshot` is present when the subscribed channel has associated state, and
// absent for stateless channels.
type SubscribeResult struct {
	// Snapshot of the subscribed channel's state (omitted for stateless channels)
	Snapshot *Snapshot `json:"snapshot,omitempty"`
}

// Creates a new session with the specified agent provider.
//
// If the session URI already exists, the server MUST return an error with code
// `-32003` (`SessionAlreadyExists`).
//
// After creation, the client should subscribe to the session URI to receive state
// updates. The server also broadcasts a `root/sessionAdded` notification to all
// clients.
type SessionForkSource struct {
	// URI of the existing session to fork from
	Session URI `json:"session"`
	// Turn ID in the source session; content up to and including this turn's response is copied
	TurnId string `json:"turnId"`
}

type CreateSessionParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// The working directories the session's agent is granted tool access to.
	// A session may span multiple directories; they are equal peers except when
	// the agent advertises
	// {@link MultipleWorkingDirectoriesCapability.immutablePrimary} (in which case
	// the first entry is a fixed process root).
	//
	// A client MUST NOT supply more than one entry unless the agent advertises
	// {@link AgentCapabilities.multipleWorkingDirectories}; a server without that
	// capability treats only the first entry as the session's working directory
	// and ignores the rest. Dispatch `session/workingDirectorySet` /
	// `session/workingDirectoryRemoved` to change the set after the session has
	// started.
	//
	// Ignored for forked sessions — a fork inherits its working directories
	// from the source session identified by `fork`.
	WorkingDirectories []URI `json:"workingDirectories,omitempty"`
	// Fork from an existing session. The new session is populated with content
	// from the source session up to and including the specified turn's response.
	Fork *SessionForkSource `json:"fork,omitempty"`
	// Agent-specific configuration values collected via `resolveSessionConfig`.
	// Keys and values correspond to the schema returned by the server.
	Config map[string]json.RawMessage `json:"config,omitempty"`
	// Eagerly claim an active client role for the new session.
	//
	// When provided, the server initializes the session with this client as an
	// active client, equivalent to dispatching a `session/activeClientSet`
	// action immediately after creation. The `clientId` MUST match the
	// `clientId` the creating client supplied in `initialize`.
	ActiveClient *SessionActiveClient `json:"activeClient,omitempty"`
	// Opt-in progress token. When set, the client is offering to receive
	// `progress` notifications (see `ProgressParams`) for any long-running work
	// the server does to bring this session up — most notably the lazy,
	// first-use download of the provider's native SDK. The server echoes this
	// exact token on every `progress` frame so the client can correlate it to
	// this `createSession` call (and the UI awaiting it).
	//
	// The token MUST be unique across the client's active requests. The server
	// MAY ignore it (e.g. when nothing long-running is needed), in which case no
	// `progress` notifications are emitted.
	ProgressToken *string `json:"progressToken,omitempty"`
}

// Disposes a session and cleans up server-side resources.
//
// The server broadcasts a `root/sessionRemoved` notification to all clients.
type DisposeSessionParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Copies source history through a completed turn into the new chat.
type ForkChatSource struct {
	// Discriminant
	Kind ChatSourceKind `json:"kind"`
	// URI of the existing source chat.
	Chat URI `json:"chat"`
	// Completed turn identifier in the source chat.
	//
	// Content through this turn is copied into the new chat's visible `turns`.
	TurnId string `json:"turnId"`
}

// Supplies source context to a new side chat without copying it into the side
// chat's visible history.
type SideChatSource struct {
	// Discriminant
	Kind ChatSourceKind `json:"kind"`
	// URI of the existing source chat.
	Chat URI `json:"chat"`
	// Stable source-turn identifier in the source chat.
	//
	// Hosts resolve this id against the source chat's current `activeTurn` or its
	// retained `turns` when accepting `createChat`. If it names the current
	// active turn, the host snapshots the source chat's retained history plus
	// that turn's current user message and any partial assistant response already
	// available. Once that turn later becomes historical, it is still referenced
	// by this same identifier.
	TurnId string `json:"turnId"`
	// Optional immutable selected-text snapshot to carry into the created side
	// chat's origin.
	//
	// When present, the host MUST snapshot and preserve this exact selection when
	// it accepts `createChat`; later source-turn deltas do not alter it.
	Selection *SideChatSelection `json:"selection,omitempty"`
}

// Creates a new chat within a session.
type CreateChatParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`).
	Chat URI `json:"chat"`
	// Optional initial message for the new chat.
	InitialMessage *Message `json:"initialMessage,omitempty"`
	// Optional source chat and source turn.
	//
	// The source chat MUST belong to this session. Clients MUST only request
	// `kind: "fork"` when the selected agent advertises
	// `capabilities.multipleChats.fork`, and `kind: "sideChat"` when the
	// selected agent advertises `capabilities.multipleChats.sideChat`. Both
	// source forms carry a stable top-level `turnId`. Forks target completed
	// turns. Side chats also carry a stable `turnId`, which the host resolves
	// against the source chat's current active turn or retained history. If it
	// resolves to the active turn, the host snapshots the currently available
	// partial response when accepting `createChat`. When
	// `source.kind === "sideChat"` and `source.selection` is present, the host
	// also snapshots and preserves that exact selected text in the created chat's
	// origin; any `responsePartId` there is provenance only, not a live range.
	Source *ChatSource `json:"source,omitempty"`
	// Initial working-directory subset for this chat. Every entry MUST be
	// present in the owning session's `workingDirectories`; the server MUST
	// reject any entry that is not. When absent, the chat inherits the full
	// session set. Forked chats (those whose `source.kind` is `"fork"`) inherit
	// the source chat's `workingDirectories`; this field is ignored for forks.
	//
	// A client MUST NOT supply this field unless the agent advertises
	// {@link AgentCapabilities.multipleWorkingDirectories}.
	WorkingDirectories []URI `json:"workingDirectories,omitempty"`
}

// Disposes a chat and cleans up server-side resources.
type DisposeChatParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Returns a list of session summaries. Used to populate session lists and sidebars.
//
// The session list is **not** part of the state tree because it can be arbitrarily
// large. Clients fetch it imperatively and maintain a local cache updated by
// `root/sessionAdded` and `root/sessionRemoved` notifications.
//
// A large catalogue can be fetched incrementally via the {@link PaginatedParams}
// `limit`/`cursor` inputs (see that type for the full pagination contract). The
// server SHOULD return most-recently-modified entries first, so the first page
// is the immediately useful one. The `root/session*` notifications keep an
// already-fetched page live; pagination governs only the initial and backfill
// fetches.
type ListSessionsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Maximum number of entries to return in this page. The server SHOULD respect
	// this bound but MAY return fewer entries and MAY impose its own upper cap.
	// Omit to let the server choose the page size.
	Limit *int64 `json:"limit,omitempty"`
	// Opaque pagination cursor from a previous {@link PaginatedResult.nextCursor}.
	// Omit to fetch the first page. Cursors are server-defined and MUST be treated
	// as opaque — do not parse, modify, or persist them across connections. An
	// unrecognised cursor SHOULD be rejected with an `InvalidParams` error.
	Cursor *string `json:"cursor,omitempty"`
}

// Result of the `listSessions` command.
type ListSessionsResult struct {
	// Opaque cursor for the next page. Present when more entries exist beyond the
	// returned page; absent signals the end of the collection. Pass it back as
	// {@link PaginatedParams.cursor} to fetch the following page.
	NextCursor *string `json:"nextCursor,omitempty"`
	// The list of session summaries. The server SHOULD order them
	// most-recently-modified first.
	Items []SessionSummary `json:"items"`
}

// Reads the content of a resource by URI.
//
// Content references keep the state tree small by storing large data (images,
// long tool outputs) by reference rather than inline.
//
// Binary content (images, etc.) MUST use `base64` encoding. Text content MAY
// use `utf-8` encoding.
//
// Like all `resource*` methods, `resourceRead` is symmetrical and MAY be
// sent in either direction. Hosts use it to fetch content from a
// client-published URI (e.g. `virtual://my-client/...` plugins); clients
// use it to read host-side files. The receiver enforces access via the
// same permission/`resourceRequest` flow regardless of which peer initiated.
type ResourceReadParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Content URI from a `ContentRef`
	Uri string `json:"uri"`
	// Preferred encoding for the returned data (default: server-chosen)
	Encoding *ContentEncoding `json:"encoding,omitempty"`
}

// Result of the `resourceRead` command.
//
// The server SHOULD honor the `encoding` requested in the params. If the
// server cannot provide the requested encoding, it MUST fall back to either
// `base64` or `utf-8`.
type ResourceReadResult struct {
	// Content encoded as a string
	Data string `json:"data"`
	// How `data` is encoded
	Encoding ContentEncoding `json:"encoding"`
	// Content type (e.g. `"image/png"`, `"text/plain"`)
	ContentType *string `json:"contentType,omitempty"`
}

// Writes content to a file on the server's filesystem.
//
// Binary content (images, etc.) MUST use `base64` encoding. Text content MAY
// use `utf-8` encoding.
//
// If the file does not exist, it is created. If the file already exists, the
// effect on existing bytes depends on {@link ResourceWriteParams.mode}:
// `truncate` (default) overwrites from the chosen offset onward, `append`
// preserves all existing bytes and adds `data` at a position rooted at EOF,
// and `insert` preserves all existing bytes and splices `data` in at an
// offset rooted at the start of the file.
//
// Like all `resource*` methods, `resourceWrite` is symmetrical and MAY be
// sent in either direction.
type ResourceWriteParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Target file URI on the server filesystem
	Uri URI `json:"uri"`
	// Content encoded as a string
	Data string `json:"data"`
	// How `data` is encoded
	Encoding ContentEncoding `json:"encoding"`
	// Content type (e.g. `"text/plain"`, `"image/png"`)
	ContentType *string `json:"contentType,omitempty"`
	// If `true`, the server MUST fail if the file already exists instead of
	// overwriting it. Useful for safe creation of new files.
	CreateOnly *bool `json:"createOnly,omitempty"`
	// How `data` is placed within the target file. Defaults to `'truncate'`
	// (full overwrite) when omitted. See {@link ResourceWriteMode} for the
	// meaning of each mode and how it interprets {@link position}.
	Mode *ResourceWriteMode `json:"mode,omitempty"`
	// Byte offset interpreted according to {@link mode}. Defaults to `0`.
	// - `truncate`: offset from the start of the file at which to truncate
	//   before writing.
	// - `append`: bytes back from EOF at which to insert `data`.
	// - `insert`: offset from the start of the file at which to splice in
	//   `data`.
	Position *int64 `json:"position,omitempty"`
	// Optimistic-concurrency token previously returned by
	// {@link ResourceResolveResult.etag}. When set, the server MUST fail with
	// `Conflict` if the current `etag` does not match — preventing lost
	// updates between a `resourceResolve` and a subsequent `resourceWrite`.
	IfMatch *string `json:"ifMatch,omitempty"`
}

// Result of the `resourceWrite` command.
//
// An empty object on success.
type ResourceWriteResult struct {
}

// Lists directory entries at a file URI on the server's filesystem.
//
// This is intended for remote folder pickers and similar UI that needs to let
// users navigate the server's local filesystem.
//
// The server MUST return success only if the target exists and is a directory.
// If the target does not exist, is not a directory, or cannot be accessed, the
// server MUST return a JSON-RPC error.
//
// Like all `resource*` methods, `resourceList` is symmetrical and MAY be
// sent in either direction.
type ResourceListParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Directory URI on the server filesystem
	Uri URI `json:"uri"`
}

// Result of the `resourceList` command.
type ResourceListResult struct {
	// Entries directly contained in the requested directory
	Entries []DirectoryEntry `json:"entries"`
}

// Directory entry returned by `resourceList`.
type DirectoryEntry struct {
	// Base name of the entry
	Name string `json:"name"`
	// Whether the entry is a file or directory
	Type string `json:"type"`
}

// Copies a resource from one URI to another on the server's filesystem.
//
// If the destination already exists, it is overwritten unless `failIfExists`
// is set.
//
// Like all `resource*` methods, `resourceCopy` is symmetrical and MAY be
// sent in either direction.
type ResourceCopyParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Source URI to copy from
	Source URI `json:"source"`
	// Destination URI to copy to
	Destination URI `json:"destination"`
	// If `true`, the server MUST fail if the destination already exists instead
	// of overwriting it.
	FailIfExists *bool `json:"failIfExists,omitempty"`
}

// Result of the `resourceCopy` command.
//
// An empty object on success.
type ResourceCopyResult struct {
}

// Deletes a resource at a URI on the server's filesystem.
//
// Like all `resource*` methods, `resourceDelete` is symmetrical and MAY be
// sent in either direction.
type ResourceDeleteParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// URI of the resource to delete
	Uri URI `json:"uri"`
	// If `true` and the target is a directory, delete it and all its contents
	// recursively. If `false` (default), deleting a non-empty directory MUST fail.
	Recursive *bool `json:"recursive,omitempty"`
}

// Result of the `resourceDelete` command.
//
// An empty object on success.
type ResourceDeleteResult struct {
}

// Moves (renames) a resource from one URI to another on the server's filesystem.
//
// If the destination already exists, it is overwritten unless `failIfExists`
// is set.
//
// Like all `resource*` methods, `resourceMove` is symmetrical and MAY be
// sent in either direction.
type ResourceMoveParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Source URI to move from
	Source URI `json:"source"`
	// Destination URI to move to
	Destination URI `json:"destination"`
	// If `true`, the server MUST fail if the destination already exists instead
	// of overwriting it.
	FailIfExists *bool `json:"failIfExists,omitempty"`
}

// Result of the `resourceMove` command.
//
// An empty object on success.
type ResourceMoveResult struct {
}

// Resolves a resource — the combination of POSIX `stat` and `realpath`.
//
// `resourceResolve` returns metadata about the resource together with its
// canonical URI after symlink resolution. Use this in place of any
// `resourceExists` shim: a missing resource MUST surface as a `NotFound`
// JSON-RPC error rather than a success with a sentinel value. Callers that
// truly need a boolean check should attempt `resourceResolve` and treat
// `NotFound` as "does not exist".
//
// Like all `resource*` methods, `resourceResolve` is symmetrical and MAY be
// sent in either direction.
type ResourceResolveParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// URI to resolve
	Uri URI `json:"uri"`
	// When `true` (default), follow symlinks and report the metadata of the
	// link target — and set `uri` in the result to the canonical (realpath)
	// URI. When `false`, stat the link itself (lstat semantics) and report
	// `type: 'symlink'`.
	FollowSymlinks *bool `json:"followSymlinks,omitempty"`
}

// Result of the `resourceResolve` command.
type ResourceResolveResult struct {
	// Canonical URI after symlink resolution. Equal to the requested URI when
	// `followSymlinks` is `false` or the URI does not traverse a symlink.
	Uri URI `json:"uri"`
	// Resource kind.
	Type ResourceType `json:"type"`
	// Size in bytes. Omitted for directories when the provider cannot
	// cheaply compute it.
	Size *int64 `json:"size,omitempty"`
	// Last-modified time in ISO 8601 format, when known.
	Mtime *string `json:"mtime,omitempty"`
	// Creation time in ISO 8601 format, when known.
	Ctime *string `json:"ctime,omitempty"`
	// Sniffed MIME type, when known (e.g. `"text/plain"`, `"image/png"`).
	ContentType *string `json:"contentType,omitempty"`
	// Opaque per-provider version token. When present, pass it as
	// {@link ResourceWriteParams.ifMatch} on a subsequent `resourceWrite` to
	// detect concurrent modifications.
	Etag *string `json:"etag,omitempty"`
}

// Creates a directory on the server's filesystem with `mkdir -p` semantics.
//
// The server MUST create any missing parent directories. Creating a
// directory that already exists is a no-op success. If `uri` already
// exists but is **not** a directory, the server MUST fail with
// `AlreadyExists`.
//
// Like all `resource*` methods, `resourceMkdir` is symmetrical and MAY be
// sent in either direction.
type ResourceMkdirParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Directory URI to create (parents created as needed).
	Uri URI `json:"uri"`
}

// Result of the `resourceMkdir` command.
//
// An empty object on success.
type ResourceMkdirResult struct {
}

// Requests permission to access a resource on the receiver's filesystem.
//
// `resourceRequest` is symmetrical and MAY be sent in either direction: a
// client asks the server to grant access to a server-side resource, or a
// server asks the client to grant access to a client-side resource. The
// receiver decides whether to allow, deny, or prompt the user for the
// requested access.
//
// If the receiver denies access, it MUST respond with `PermissionDenied`
// (-32009). The error data MAY include a `ResourceRequestParams` value
// describing the access the caller would need to be granted for the
// operation to succeed; see `PermissionDeniedErrorData` in
// `types/errors.ts`.
//
// After a successful `resourceRequest`, the caller MAY use the corresponding
// `resource*` commands (e.g. `resourceRead`, `resourceWrite`) to perform the
// operation. Receivers MAY rescind access at any time by returning
// `PermissionDenied` on subsequent operations.
//
// Either `read`, `write`, or both SHOULD be set to `true`. A request with
// neither flag set is treated as `read: true` by receivers.
type ResourceRequestParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Resource URI being requested. Typically a `file:` URI on the receiver's
	// filesystem, but any URI scheme that the receiver mediates access to is
	// allowed.
	Uri URI `json:"uri"`
	// Whether the caller needs read access to the resource.
	Read *bool `json:"read,omitempty"`
	// Whether the caller needs write access to the resource.
	Write *bool `json:"write,omitempty"`
}

// Result of the `resourceRequest` command.
//
// An empty object on success.
type ResourceRequestResult struct {
}

// Creates a resource watcher on the receiver's filesystem.
//
// The receiver allocates an `ahp-resource-watch:/<id>` channel URI and
// returns it on {@link CreateResourceWatchResult.channel}. The caller then
// [`subscribe`](./subscriptions)s to that channel to receive
// `resourceWatch/changed` actions over the standard action envelope.
//
// The watch lifecycle is tied to subscription: when every subscriber has
// unsubscribed (or the underlying connection drops), the receiver MUST
// release the watcher. There is no explicit dispose command — `unsubscribe`
// is the only handle the caller needs.
//
// Like the rest of the `resource*` family, `createResourceWatch` is
// symmetrical and MAY be sent in either direction. Access is gated through
// the same permission flow as `resourceRead`/`resourceWrite`.
type CreateResourceWatchParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// URI to watch.
	Uri URI `json:"uri"`
	// If `true`, the receiver MUST report changes for descendants of `uri`.
	// If `false` (default), only changes to `uri` itself — and, when `uri`
	// is a directory, its direct children — are reported.
	Recursive *bool `json:"recursive,omitempty"`
	// Glob patterns or paths relative to `uri` to exclude from reporting.
	// Wrapped in `{ items }` for forward compatibility.
	Excludes *json.RawMessage `json:"excludes,omitempty"`
	// Glob patterns or paths relative to `uri` to restrict reporting to.
	// Omit to report every change under `uri` subject to `excludes`.
	// Wrapped in `{ items }` for forward compatibility.
	Includes *json.RawMessage `json:"includes,omitempty"`
}

// Result of the `createResourceWatch` command.
type CreateResourceWatchResult struct {
	// Receiver-assigned watch channel URI (`ahp-resource-watch:/<id>`). The
	// caller subscribes to this URI to start receiving change events and
	// unsubscribes to release the watcher.
	Channel URI `json:"channel"`
}

// Requests that the host load older historical turns into a chat state.
//
// The command result does not carry turns. Instead, before responding, the host
// MUST dispatch `chat/turnsLoaded` to insert any loaded turns into the chat
// channel's `turns` state, ahead of the already-loaded window, and update or
// clear `turnsNextCursor`.
//
// Before applying any operation that references a turn outside the currently
// loaded window, the host MUST eagerly load enough older turns into state for
// that operation to reduce against valid state.
type FetchTurnsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Opaque cursor from `ChatState.turnsNextCursor`.
	//
	// The host MUST reject unrecognised cursors with `InvalidParams`. Omit only
	// when asking the host to opportunistically load its next older page for the
	// chat, if any.
	Cursor *string `json:"cursor,omitempty"`
}

// Result of the `fetchTurns` command.
type FetchTurnsResult struct {
}

// Stop receiving updates for a channel.
type UnsubscribeParams struct {
	// Channel URI to unsubscribe from
	Channel URI `json:"channel"`
}

// Fire-and-forget action dispatch (write-ahead). The client applies actions
// optimistically to local state and the server echoes them back as an
// {@link ActionEnvelope} once accepted.
//
// The client → server method is named `dispatchAction`; the server's reply
// arrives on the server → client `action` notification (params:
// {@link ActionEnvelope}).
type DispatchActionParams struct {
	// Channel URI this action targets
	Channel URI `json:"channel"`
	// Client sequence number
	ClientSeq int64 `json:"clientSeq"`
	// The action to dispatch
	Action StateAction `json:"action"`
}

// Pushes a Bearer token for a protected resource. The `resource` field MUST
// match a protected-resource identifier the client has discovered from the
// server — whether declared statically in `AgentInfo.protectedResources`,
// or discovered dynamically from a live `McpServerAuthRequiredState.resource`
// or `ToolCallAuthRequiredState.auth.resource` (both surfaced only once the
// corresponding MCP server or tool call actually challenges for auth).
// Servers MUST accept any `resource` value they have themselves advertised
// through one of these three mechanisms.
//
// Tokens are delivered using [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750)
// (Bearer Token Usage) semantics. The client obtains the token from the
// authorization server(s) listed in the resource's metadata and pushes it
// to the server via this command.
type AuthenticateParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// The protected resource identifier. MUST match a `resource` value the
	// server has advertised — via `ProtectedResourceMetadata` in
	// `AgentInfo.protectedResources`, or via a live
	// `McpServerAuthRequiredState.resource` / `ToolCallAuthRequiredState.auth.resource`.
	Resource string `json:"resource"`
	// Bearer token obtained from the resource's authorization server
	Token string `json:"token"`
	// OAuth scopes the token grants, when known. Lets the server determine
	// whether a specific challenge — e.g. the `requiredScopes` on a live
	// `McpServerAuthRequiredState` or `ToolCallAuthRequiredState.auth` — is
	// satisfied without decoding the (opaque, server-specific) token itself.
	// Omit when the client doesn't track granted scopes separately from the
	// token.
	Scopes []string `json:"scopes,omitempty"`
}

// Result of the `authenticate` command.
//
// An empty object on success. If the token is invalid or the resource is
// unrecognized, the server MUST return a JSON-RPC error (e.g. `AuthRequired`
// `-32007` or `InvalidParams` `-32602`).
type AuthenticateResult struct {
}

// Creates a new terminal on the server.
//
// After creation, the client should subscribe to the terminal URI to receive
// state updates. The server dispatches `root/terminalsChanged` to update the
// root terminal list.
type CreateTerminalParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Initial owner of the terminal
	Claim TerminalClaim `json:"claim"`
	// Human-readable terminal name
	Name *string `json:"name,omitempty"`
	// Initial working directory URI
	Cwd *URI `json:"cwd,omitempty"`
	// Initial terminal width in columns
	Cols *int64 `json:"cols,omitempty"`
	// Initial terminal height in rows
	Rows *int64 `json:"rows,omitempty"`
}

// Disposes a terminal and kills its process if still running.
//
// The server dispatches `root/terminalsChanged` to remove the terminal from
// the root terminal list.
type DisposeTerminalParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

// Iteratively resolves the session configuration schema. The client sends the
// current partial session config and any user-filled metadata values. The server
// returns a property schema describing what additional metadata is needed,
// contextual to the current selections.
//
// The client calls this command whenever the user changes a significant input
// (e.g. picks a working directory, toggles a property). Each response returns
// the full current property set (not a delta). The returned `values` contain
// server-resolved defaults to pass to `createSession`.
type ResolveSessionConfigParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// Working directory for the session
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
	// Current user-filled configuration values
	Config map[string]json.RawMessage `json:"config,omitempty"`
}

// Result of the `resolveSessionConfig` command.
type ResolveSessionConfigResult struct {
	// JSON Schema describing available configuration properties given the current context
	Schema SessionConfigSchema `json:"schema"`
	// Current configuration values (echoed back with server-resolved defaults applied)
	Values map[string]json.RawMessage `json:"values"`
}

// Queries the server for allowed values of a dynamic session config property.
//
// Used when a property in the schema returned by `resolveSessionConfig` has
// `enumDynamic: true`. The client sends a search query and receives matching
// values with display metadata.
type SessionConfigCompletionsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// Working directory for the session
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
	// Current user-filled configuration values (provides context for the query)
	Config map[string]json.RawMessage `json:"config,omitempty"`
	// Property id from the schema to query values for
	Property string `json:"property"`
	// Search filter text (empty or omitted returns default/recent values)
	Query *string `json:"query,omitempty"`
}

// Result of the `sessionConfigCompletions` command.
type SessionConfigCompletionsResult struct {
	// Matching value items
	Items []SessionConfigValueItem `json:"items"`
}

// A single value item returned by `sessionConfigCompletions`.
type SessionConfigValueItem struct {
	// The value to store in config
	Value string `json:"value"`
	// Human-readable display label
	Label string `json:"label"`
	// Optional secondary description
	Description *string `json:"description,omitempty"`
}

// Requests completion items for a partially-typed input (e.g. a user message
// the user is currently composing). Used to power `@`-mention pickers,
// file/symbol references, and similar inline-completion experiences.
//
// Servers SHOULD treat this command as best-effort and return promptly. The
// client SHOULD debounce calls to avoid flooding the server with requests on
// every keystroke.
type CompletionsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// What kind of completion is being requested.
	Kind CompletionItemKind `json:"kind"`
	// The complete text of the input being completed (e.g. the full user
	// message text typed so far).
	Text string `json:"text"`
	// The character offset within `text` at which the completion is requested,
	// measured in UTF-16 code units. MUST satisfy `0 <= offset <= text.length`.
	Offset int64 `json:"offset"`
}

// A single completion item returned by the `completions` command.
//
// When the user accepts an item, the client SHOULD:
//  1. Replace the range `[rangeStart, rangeEnd)` in the input with `insertText`
//     (or insert `insertText` at the cursor when the range is omitted).
//  2. Associate the item's `attachment` with the resulting {@link Message}.
type CompletionItem struct {
	// The text inserted into the input when this item is accepted.
	InsertText string `json:"insertText"`
	// If defined, the start of the range in the input's `text` that is replaced
	// by `insertText`. The range is the half-open interval
	// `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
	// units.
	//
	// When omitted, the client SHOULD insert `insertText` at the cursor.
	//
	// Note: this range refers to positions in the *current* input. The
	// attachment's own `rangeStart`/`rangeEnd` (when present) refer to
	// positions in the final {@link Message.text} after the item is
	// accepted.
	RangeStart *int64 `json:"rangeStart,omitempty"`
	// The end of the range in the input's `text` that is replaced by
	// `insertText`. See {@link rangeStart}.
	RangeEnd *int64 `json:"rangeEnd,omitempty"`
	// The attachment associated with this completion item.
	Attachment MessageAttachment `json:"attachment"`
}

// Result of the `completions` command.
type CompletionsResult struct {
	// The completion items, in the order the server suggests displaying them.
	Items []CompletionItem `json:"items"`
}

// Invokes a server-defined {@link ChangesetOperation} against a changeset,
// a single file, or a line range.
//
// The server validates that `operationId` exists in the changeset's
// current `operations` list and that the requested `target.kind` is
// contained in the operation's `scopes`. Invalid combinations result in a
// JSON-RPC error.
//
// State changes resulting from invocation flow back through the normal
// `changeset/*` action stream on the relevant changeset URIs. Clients
// SHOULD NOT synthesise local optimistic changes for invocations unless
// the server explicitly opts in via a future capability.
type InvokeChangesetOperationParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Matches {@link ChangesetOperation.id} from the changeset's `operations` list.
	OperationId string `json:"operationId"`
	// Target of the operation. Required iff the chosen scope is
	// `'resource'` or `'range'`. Omit for changeset-scoped operations.
	Target *ChangesetOperationTarget `json:"target,omitempty"`
}

// Result of the {@link InvokeChangesetOperationParams | `invokeChangesetOperation`}
// command.
//
// Success is implicit: the server returns this result when it accepted
// the operation. Failure is signalled by rejecting the JSON-RPC request
// with an appropriate error code, not by any field on this result. The
// operation MAY still produce subsequent failure feedback through the
// {@link ChangesetStatusChangedAction | `changeset/statusChanged`} stream.
type InvokeChangesetOperationResult struct {
	// Optional human-readable message describing the result.
	Message *StringOrMarkdown `json:"message,omitempty"`
	// Optional follow-up: a URI to open (e.g. a PR), a content ref, etc.
	FollowUp *ChangesetOperationFollowUp `json:"followUp,omitempty"`
}

// Optional follow-up surfaced by the server after an operation completes —
// a {@link ContentRef} the client can fetch and display.
//
// Set `external` to `true` to open the content in the user's preferred
// external handler (e.g. browser); otherwise the client is expected to
// surface it inline.
type ChangesetOperationFollowUp struct {
	Content ContentRef `json:"content"`
	// When `true`, open in an external handler rather than inline.
	External *bool `json:"external,omitempty"`
}

type ListAutomationsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
	// Maximum number of entries to return in this page. The server SHOULD respect
	// this bound but MAY return fewer entries and MAY impose its own upper cap.
	// Omit to let the server choose the page size.
	Limit *int64 `json:"limit,omitempty"`
	// Opaque pagination cursor from a previous {@link PaginatedResult.nextCursor}.
	// Omit to fetch the first page. Cursors are server-defined and MUST be treated
	// as opaque — do not parse, modify, or persist them across connections. An
	// unrecognised cursor SHOULD be rejected with an `InvalidParams` error.
	Cursor  *string `json:"cursor,omitempty"`
	Enabled *bool   `json:"enabled,omitempty"`
}

type ListAutomationsResult struct {
	// Opaque cursor for the next page. Present when more entries exist beyond the
	// returned page; absent signals the end of the collection. Pass it back as
	// {@link PaginatedParams.cursor} to fetch the following page.
	NextCursor *string             `json:"nextCursor,omitempty"`
	Items      []AutomationSummary `json:"items"`
}

type ListAutomationTriggerDefinitionsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta               map[string]json.RawMessage `json:"_meta,omitempty"`
	Provider           *string                    `json:"provider,omitempty"`
	WorkingDirectories []URI                      `json:"workingDirectories,omitempty"`
	SessionConfig      map[string]json.RawMessage `json:"sessionConfig,omitempty"`
}

type ListAutomationTriggerDefinitionsResult struct {
	Items []AutomationTriggerDefinition `json:"items"`
}

type CreateAutomationParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta       map[string]json.RawMessage `json:"_meta,omitempty"`
	Definition AutomationDefinition       `json:"definition"`
	Import     *json.RawMessage           `json:"import,omitempty"`
}

type AutomationDefinitionPatch struct {
	Title    *string                     `json:"title,omitempty"`
	Message  *Message                    `json:"message,omitempty"`
	Session  *AutomationSessionTemplate  `json:"session,omitempty"`
	Enabled  *bool                       `json:"enabled,omitempty"`
	Triggers *[]AutomationTrigger        `json:"triggers,omitempty"`
	Meta     *map[string]json.RawMessage `json:"_meta,omitempty"`
}

type UpdateAutomationParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta             map[string]json.RawMessage `json:"_meta,omitempty"`
	ExpectedRevision int64                      `json:"expectedRevision"`
	Changes          AutomationDefinitionPatch  `json:"changes"`
}

type DisposeAutomationParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta map[string]json.RawMessage `json:"_meta,omitempty"`
}

type RunAutomationParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta      map[string]json.RawMessage `json:"_meta,omitempty"`
	RequestId string                     `json:"requestId"`
}

type RunAutomationResult struct {
	Run URI `json:"run"`
}

type FetchAutomationRunsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta   map[string]json.RawMessage `json:"_meta,omitempty"`
	Cursor *string                    `json:"cursor,omitempty"`
}

type FetchAutomationRunsResult struct {
}

type PreviewAutomationScheduleParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional JSON-serializable metadata associated with this request.
	// Receivers MUST ignore keys they do not understand.
	Meta     map[string]json.RawMessage `json:"_meta,omitempty"`
	Schedule AutomationSchedule         `json:"schedule"`
	Count    *int64                     `json:"count,omitempty"`
}

type PreviewAutomationScheduleResult struct {
	Items []string `json:"items"`
}

func (v *ForkChatSource) UnmarshalJSON(data []byte) error {
	disc, ok, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	if !ok {
		return missingDiscriminatorError("ForkChatSource", "kind")
	}
	if disc != "fork" {
		return unknownDiscriminatorError("ForkChatSource", "kind", disc)
	}
	type wire ForkChatSource
	var raw wire
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*v = ForkChatSource(raw)
	v.Kind = ChatSourceKindFork
	return nil
}

func (v ForkChatSource) MarshalJSON() ([]byte, error) {
	type wire ForkChatSource
	raw := wire(v)
	raw.Kind = ChatSourceKindFork
	return json.Marshal(raw)
}

func (v *SideChatSource) UnmarshalJSON(data []byte) error {
	disc, ok, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	if !ok {
		return missingDiscriminatorError("SideChatSource", "kind")
	}
	if disc != "sideChat" {
		return unknownDiscriminatorError("SideChatSource", "kind", disc)
	}
	type wire SideChatSource
	var raw wire
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*v = SideChatSource(raw)
	v.Kind = ChatSourceKindSideChat
	return nil
}

func (v SideChatSource) MarshalJSON() ([]byte, error) {
	type wire SideChatSource
	raw := wire(v)
	raw.Kind = ChatSourceKindSideChat
	return json.Marshal(raw)
}

// ─── ChatSource Union ─────────────────────────────────────────────────

// ChatSource identifies how a new chat uses a source chat.
type ChatSource struct {
	Value isChatSource
}

// isChatSource is the marker interface implemented by every
// concrete variant of ChatSource.
type isChatSource interface{ isChatSource() }

func (*ForkChatSource) isChatSource() {}
func (*SideChatSource) isChatSource() {}

// UnmarshalJSON decodes the variant indicated by the "kind" discriminator.
func (u *ChatSource) UnmarshalJSON(data []byte) error {
	disc, ok, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	if !ok {
		return missingDiscriminatorError("ChatSource", "kind")
	}
	switch disc {
	case "fork":
		var value ForkChatSource
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "sideChat":
		var value SideChatSource
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		return unknownDiscriminatorError("ChatSource", "kind", disc)
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ChatSource) MarshalJSON() ([]byte, error) {
	if u.Value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(u.Value)
}

// ─── ReconnectResult Union ────────────────────────────────────────────

// ReconnectResult is the result of the `reconnect` command.
type ReconnectResult struct {
	Value isReconnectResult
}

// isReconnectResult is the marker interface implemented by every
// concrete variant of ReconnectResult.
type isReconnectResult interface{ isReconnectResult() }

func (*ReconnectReplayResult) isReconnectResult()   {}
func (*ReconnectSnapshotResult) isReconnectResult() {}

// UnmarshalJSON decodes the variant indicated by the "type" discriminator.
func (u *ReconnectResult) UnmarshalJSON(data []byte) error {
	disc, ok, err := readDiscriminator(data, "type")
	if err != nil {
		return err
	}
	if !ok {
		return missingDiscriminatorError("ReconnectResult", "type")
	}
	switch disc {
	case "replay":
		var value ReconnectReplayResult
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	case "snapshot":
		var value ReconnectSnapshotResult
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		u.Value = &value
	default:
		return unknownDiscriminatorError("ReconnectResult", "type", disc)
	}
	return nil
}

// MarshalJSON encodes the active variant back to JSON.
func (u ReconnectResult) MarshalJSON() ([]byte, error) {
	if u.Value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(u.Value)
}

// ─── Changeset Operation Unions ───────────────────────────────────────

// ChangesetOperationTarget identifies the file or range a
// ChangesetOperation should act on.
type ChangesetOperationTarget struct {
	Value isChangesetOperationTarget
}

// isChangesetOperationTarget is the marker interface for the two variants.
type isChangesetOperationTarget interface{ isChangesetOperationTarget() }

// ChangesetOperationResourceTarget targets an entire resource.
type ChangesetOperationResourceTarget struct {
	Kind     string  `json:"kind"`
	Resource URI     `json:"resource"`
	Side     *string `json:"side,omitempty"`
}

func (*ChangesetOperationResourceTarget) isChangesetOperationTarget() {}

// ChangesetOperationRangeTarget targets a range within a resource.
type ChangesetOperationRangeTarget struct {
	Kind     string    `json:"kind"`
	Resource URI       `json:"resource"`
	Side     *string   `json:"side,omitempty"`
	Range    TextRange `json:"range"`
}

func (*ChangesetOperationRangeTarget) isChangesetOperationTarget() {}

// UnmarshalJSON dispatches on the `kind` discriminator.
func (t *ChangesetOperationTarget) UnmarshalJSON(data []byte) error {
	disc, _, err := readDiscriminator(data, "kind")
	if err != nil {
		return err
	}
	switch disc {
	case "resource":
		var v ChangesetOperationResourceTarget
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		t.Value = &v
	case "range":
		var v ChangesetOperationRangeTarget
		if err := json.Unmarshal(data, &v); err != nil {
			return err
		}
		t.Value = &v
	default:
		return &json.UnmarshalTypeError{Value: "ChangesetOperationTarget"}
	}
	return nil
}

// MarshalJSON encodes the active variant.
func (t ChangesetOperationTarget) MarshalJSON() ([]byte, error) {
	if t.Value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(t.Value)
}
