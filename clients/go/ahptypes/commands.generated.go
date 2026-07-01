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
	// Snapshots for each `initialSubscriptions` URI
	Snapshots []Snapshot `json:"snapshots"`
	// Suggested default directory for remote filesystem browsing
	DefaultDirectory *URI `json:"defaultDirectory,omitempty"`
	// Characters that, when typed in a {@link Message} input, SHOULD cause
	// the client to issue a `completions` request with
	// {@link CompletionItemKind.UserMessage}. Typically includes characters like
	// `'@'` or `'/'`.
	CompletionTriggerCharacters []string `json:"completionTriggerCharacters,omitempty"`
	// OTLP telemetry channels the host emits, if any. Each populated field is
	// either a literal `ahp-otlp:` channel URI or an RFC 6570 URI template a
	// client expands before subscribing (currently only the `logs` channel
	// defines a template variable, `{level}`, for subscriber-side severity
	// filtering). Clients MAY ignore signals they cannot process.
	Telemetry *TelemetryCapabilities `json:"telemetry,omitempty"`
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

// Re-establishes a dropped connection. The server replays missed actions or
// provides fresh snapshots.
type ReconnectParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
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
	// Optional delivery preferences for this subscription.
	//
	// Servers MAY use these preferences to buffer and coalesce high-frequency
	// updates while preserving the same reduced state. Omit this field for the
	// server's default delivery behavior.
	Delivery *SubscriptionDeliveryOptions `json:"delivery,omitempty"`
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
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// Working directory for the session
	WorkingDirectory *URI `json:"workingDirectory,omitempty"`
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
}

// Identifies a source chat and turn to fork from.
type ChatForkSource struct {
	// URI of the existing chat to fork from
	Chat URI `json:"chat"`
	// Turn ID in the source chat; content up to and including this turn's response is copied
	TurnId string `json:"turnId"`
}

// Creates a new chat within a session.
type CreateChatParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Chat URI (client-chosen, e.g. `ahp-chat:/<uuid>`).
	Chat URI `json:"chat"`
	// Optional initial message for the new chat.
	InitialMessage *Message `json:"initialMessage,omitempty"`
	// Optional source chat and turn to fork from.
	Source *ChatForkSource `json:"source,omitempty"`
}

// Disposes a chat and cleans up server-side resources.
type DisposeChatParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
}

// Returns a list of session summaries. Used to populate session lists and sidebars.
//
// The session list is **not** part of the state tree because it can be arbitrarily
// large. Clients fetch it imperatively and maintain a local cache updated by
// `root/sessionAdded` and `root/sessionRemoved` notifications.
type ListSessionsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Optional filter criteria
	Filter *json.RawMessage `json:"filter,omitempty"`
}

// Result of the `listSessions` command.
type ListSessionsResult struct {
	// The list of session summaries.
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

// Fetches historical turns for a chat. Used for lazy loading of conversation
// history.
type FetchTurnsParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// Turn ID to fetch before (exclusive). Omit to fetch from the most recent turn.
	Before *string `json:"before,omitempty"`
	// Maximum number of turns to return. Server MAY impose its own upper bound.
	Limit *int64 `json:"limit,omitempty"`
}

// Result of the `fetchTurns` command.
type FetchTurnsResult struct {
	// The requested turns, ordered oldest-first
	Turns []Turn `json:"turns"`
	// Whether more turns exist before the returned range
	HasMore bool `json:"hasMore"`
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
// match a `ProtectedResourceMetadata.resource` value declared by an agent
// in `AgentInfo.protectedResources`.
//
// Tokens are delivered using [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750)
// (Bearer Token Usage) semantics. The client obtains the token from the
// authorization server(s) listed in the resource's metadata and pushes it
// to the server via this command.
type AuthenticateParams struct {
	// Channel URI this command targets.
	Channel URI `json:"channel"`
	// The protected resource identifier. MUST match a `resource` value from
	// `ProtectedResourceMetadata` declared in `AgentInfo.protectedResources`.
	Resource string `json:"resource"`
	// Bearer token obtained from the resource's authorization server
	Token string `json:"token"`
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
	disc, _, err := readDiscriminator(data, "type")
	if err != nil {
		return err
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
		return &json.UnmarshalTypeError{Value: "ReconnectResult", Type: nil}
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
