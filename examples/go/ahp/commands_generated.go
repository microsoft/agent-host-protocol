// Code generated from types/*.ts — DO NOT EDIT.

package ahp

import (
	"encoding/json"
	"fmt"
)

// ── Command Enums ─────────────────────────────────────────────────────────────

// Discriminant for reconnect result types.
type ReconnectResultType string

const (
	ReconnectResultTypeReplay ReconnectResultType = "replay"
	ReconnectResultTypeSnapshot ReconnectResultType = "snapshot"
)

// Encoding of fetched content data.
type ContentEncoding string

const (
	ContentEncodingBase64 ContentEncoding = "base64"
	ContentEncodingUtf8 ContentEncoding = "utf-8"
)

// ── Command Types ─────────────────────────────────────────────────────────────

// InitializeParams Establishes a new connection and negotiates the protocol version.
type InitializeParams struct {
	// Protocol version the client speaks
	ProtocolVersion int `json:"protocolVersion"`
	// Unique client identifier
	ClientID string `json:"clientId"`
	// URIs to subscribe to during handshake
	InitialSubscriptions []string `json:"initialSubscriptions,omitempty"`
	// IETF BCP 47 language tag indicating the client's preferred locale
	// (e.g. `"en-US"`, `"ja"`). The server SHOULD use this to localise
	// user-facing strings such as confirmation option labels.
	Locale *string `json:"locale,omitempty"`
}

// InitializeResult Result of the `initialize` command.
type InitializeResult struct {
	// Protocol version the server speaks
	ProtocolVersion int `json:"protocolVersion"`
	// Current server sequence number
	ServerSeq int `json:"serverSeq"`
	// Snapshots for each `initialSubscriptions` URI
	Snapshots []Snapshot `json:"snapshots"`
	// Suggested default directory for remote filesystem browsing
	DefaultDirectory *string `json:"defaultDirectory,omitempty"`
}

// ReconnectParams Re-establishes a dropped connection. The server replays missed actions or
type ReconnectParams struct {
	// Client identifier from the original connection
	ClientID string `json:"clientId"`
	// Last `serverSeq` the client received
	LastSeenServerSeq int `json:"lastSeenServerSeq"`
	// URIs the client was subscribed to
	Subscriptions []string `json:"subscriptions"`
}

// ReconnectReplayResult Reconnect result when the server can replay from the requested sequence.
type ReconnectReplayResult struct {
	// Discriminant
	Type ReconnectResultType `json:"type"`
	// Missed action envelopes since `lastSeenServerSeq`
	Actions []ActionEnvelope `json:"actions"`
}

// ReconnectSnapshotResult Reconnect result when the gap exceeds the replay buffer.
type ReconnectSnapshotResult struct {
	// Discriminant
	Type ReconnectResultType `json:"type"`
	// Fresh snapshots for each subscription
	Snapshots []Snapshot `json:"snapshots"`
}

// SubscribeParams Subscribe to a URI-identified state resource.
type SubscribeParams struct {
	// URI to subscribe to
	Resource string `json:"resource"`
}

// SubscribeResult Result of the `subscribe` command.
type SubscribeResult struct {
	// Snapshot of the subscribed resource
	Snapshot Snapshot `json:"snapshot"`
}

// SessionForkSource Creates a new session with the specified agent provider.
type SessionForkSource struct {
	// URI of the existing session to fork from
	Session string `json:"session"`
	// Turn ID in the source session; content up to and including this turn's response is copied
	TurnID string `json:"turnId"`
}

type CreateSessionParams struct {
	// Session URI (client-chosen, e.g. `copilot:/<uuid>`)
	Session string `json:"session"`
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// Model selection (ID and optional model-specific configuration)
	Model *ModelSelection `json:"model,omitempty"`
	// Working directory for the session
	WorkingDirectory *string `json:"workingDirectory,omitempty"`
	// Fork from an existing session. The new session is populated with content
	// from the source session up to and including the specified turn's response.
	Fork *SessionForkSource `json:"fork,omitempty"`
	// Agent-specific configuration values collected via `resolveSessionConfig`.
	// Keys and values correspond to the schema returned by the server.
	Config map[string]json.RawMessage `json:"config,omitempty"`
	// Eagerly claim the active client role for the new session.
	// 
	// When provided, the server initializes the session with this client as the
	// active client, equivalent to dispatching a `session/activeClientChanged`
	// action immediately after creation. The `clientId` MUST match the
	// `clientId` the creating client supplied in `initialize`.
	ActiveClient *SessionActiveClient `json:"activeClient,omitempty"`
}

// DisposeSessionParams Disposes a session and cleans up server-side resources.
type DisposeSessionParams struct {
	// Session URI to dispose
	Session string `json:"session"`
}

// ListSessionsParams Returns a list of session summaries. Used to populate session lists and sidebars.
type ListSessionsParams struct {
	// Optional filter criteria
	Filter map[string]json.RawMessage `json:"filter,omitempty"`
}

// ListSessionsResult Result of the `listSessions` command.
type ListSessionsResult struct {
	// The list of session summaries.
	Items []SessionSummary `json:"items"`
}

// ResourceReadParams Reads the content of a resource by URI.
type ResourceReadParams struct {
	// Content URI from a `ContentRef`
	URI string `json:"uri"`
	// Preferred encoding for the returned data (default: server-chosen)
	Encoding *ContentEncoding `json:"encoding,omitempty"`
}

// ResourceReadResult Result of the `resourceRead` command.
type ResourceReadResult struct {
	// Content encoded as a string
	Data string `json:"data"`
	// How `data` is encoded
	Encoding ContentEncoding `json:"encoding"`
	// Content type (e.g. `"image/png"`, `"text/plain"`)
	ContentType *string `json:"contentType,omitempty"`
}

// ResourceWriteParams Writes content to a file on the server's filesystem.
type ResourceWriteParams struct {
	// Target file URI on the server filesystem
	URI string `json:"uri"`
	// Content encoded as a string
	Data string `json:"data"`
	// How `data` is encoded
	Encoding ContentEncoding `json:"encoding"`
	// Content type (e.g. `"text/plain"`, `"image/png"`)
	ContentType *string `json:"contentType,omitempty"`
	// If `true`, the server MUST fail if the file already exists instead of
	// overwriting it. Useful for safe creation of new files.
	CreateOnly *bool `json:"createOnly,omitempty"`
}

// ResourceWriteResult Result of the `resourceWrite` command.
type ResourceWriteResult struct {
}

// ResourceListParams Lists directory entries at a file URI on the server's filesystem.
type ResourceListParams struct {
	// Directory URI on the server filesystem
	URI string `json:"uri"`
}

// ResourceListResult Result of the `resourceList` command.
type ResourceListResult struct {
	// Entries directly contained in the requested directory
	Entries []DirectoryEntry `json:"entries"`
}

// DirectoryEntry Directory entry returned by `resourceList`.
type DirectoryEntry struct {
	// Base name of the entry
	Name string `json:"name"`
	// Whether the entry is a file or directory
	Type string `json:"type"`
}

// ResourceCopyParams Copies a resource from one URI to another on the server's filesystem.
type ResourceCopyParams struct {
	// Source URI to copy from
	Source string `json:"source"`
	// Destination URI to copy to
	Destination string `json:"destination"`
	// If `true`, the server MUST fail if the destination already exists instead
	// of overwriting it.
	FailIfExists *bool `json:"failIfExists,omitempty"`
}

// ResourceCopyResult Result of the `resourceCopy` command.
type ResourceCopyResult struct {
}

// ResourceDeleteParams Deletes a resource at a URI on the server's filesystem.
type ResourceDeleteParams struct {
	// URI of the resource to delete
	URI string `json:"uri"`
	// If `true` and the target is a directory, delete it and all its contents
	// recursively. If `false` (default), deleting a non-empty directory MUST fail.
	Recursive *bool `json:"recursive,omitempty"`
}

// ResourceDeleteResult Result of the `resourceDelete` command.
type ResourceDeleteResult struct {
}

// ResourceMoveParams Moves (renames) a resource from one URI to another on the server's filesystem.
type ResourceMoveParams struct {
	// Source URI to move from
	Source string `json:"source"`
	// Destination URI to move to
	Destination string `json:"destination"`
	// If `true`, the server MUST fail if the destination already exists instead
	// of overwriting it.
	FailIfExists *bool `json:"failIfExists,omitempty"`
}

// ResourceMoveResult Result of the `resourceMove` command.
type ResourceMoveResult struct {
}

// FetchTurnsParams Fetches historical turns for a session. Used for lazy loading of conversation
type FetchTurnsParams struct {
	// Session URI
	Session string `json:"session"`
	// Turn ID to fetch before (exclusive). Omit to fetch from the most recent turn.
	Before *string `json:"before,omitempty"`
	// Maximum number of turns to return. Server MAY impose its own upper bound.
	Limit *int `json:"limit,omitempty"`
}

// FetchTurnsResult Result of the `fetchTurns` command.
type FetchTurnsResult struct {
	// The requested turns, ordered oldest-first
	Turns []Turn `json:"turns"`
	// Whether more turns exist before the returned range
	HasMore bool `json:"hasMore"`
}

// UnsubscribeParams Stop receiving updates for a URI.
type UnsubscribeParams struct {
	// URI to unsubscribe from
	Resource string `json:"resource"`
}

// DispatchActionParams Fire-and-forget action dispatch (write-ahead). The client applies actions
type DispatchActionParams struct {
	// Client sequence number
	ClientSeq int `json:"clientSeq"`
	// The action to dispatch
	Action StateAction `json:"action"`
}

// AuthenticateParams Pushes a Bearer token for a protected resource. The `resource` field MUST
type AuthenticateParams struct {
	// The protected resource identifier. MUST match a `resource` value from
	// `IProtectedResourceMetadata` declared in `IAgentInfo.protectedResources`.
	Resource string `json:"resource"`
	// Bearer token obtained from the resource's authorization server
	Token string `json:"token"`
}

// AuthenticateResult Result of the `authenticate` command.
type AuthenticateResult struct {
}

// CreateTerminalParams Creates a new terminal on the server.
type CreateTerminalParams struct {
	// Terminal URI (client-chosen)
	Terminal string `json:"terminal"`
	// Initial owner of the terminal
	Claim TerminalClaim `json:"claim"`
	// Human-readable terminal name
	Name *string `json:"name,omitempty"`
	// Initial working directory URI
	Cwd *string `json:"cwd,omitempty"`
	// Initial terminal width in columns
	Cols *int `json:"cols,omitempty"`
	// Initial terminal height in rows
	Rows *int `json:"rows,omitempty"`
}

// DisposeTerminalParams Disposes a terminal and kills its process if still running.
type DisposeTerminalParams struct {
	// Terminal URI to dispose
	Terminal string `json:"terminal"`
}

// ResolveSessionConfigParams Iteratively resolves the session configuration schema. The client sends the
type ResolveSessionConfigParams struct {
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// Working directory for the session
	WorkingDirectory *string `json:"workingDirectory,omitempty"`
	// Current user-filled configuration values
	Config map[string]json.RawMessage `json:"config,omitempty"`
}

// ResolveSessionConfigResult Result of the `resolveSessionConfig` command.
type ResolveSessionConfigResult struct {
	// JSON Schema describing available configuration properties given the current context
	Schema SessionConfigSchema `json:"schema"`
	// Current configuration values (echoed back with server-resolved defaults applied)
	Values map[string]json.RawMessage `json:"values"`
}

// SessionConfigPropertySchema A session configuration property descriptor.
type SessionConfigPropertySchema struct {
	// JSON Schema: property type
	Type string `json:"type"`
	// JSON Schema: human-readable label for the property
	Title string `json:"title"`
	// JSON Schema: description / tooltip
	Description *string `json:"description,omitempty"`
	// JSON Schema: default value
	Default json.RawMessage `json:"default,omitempty"`
	// JSON Schema: allowed values (typically used with `string` type)
	Enum []string `json:"enum,omitempty"`
	// Display extension: human-readable label per enum value (parallel array)
	EnumLabels []string `json:"enumLabels,omitempty"`
	// Display extension: description per enum value (parallel array)
	EnumDescriptions []string `json:"enumDescriptions,omitempty"`
	// JSON Schema: when `true`, the property is displayed but cannot be modified by the user
	ReadOnly *bool `json:"readOnly,omitempty"`
	// JSON Schema: schema for array items (used when `type` is `'array'`)
	Items *ConfigPropertySchema `json:"items,omitempty"`
	// JSON Schema: property descriptors for object properties (used when `type` is `'object'`)
	Properties map[string]ConfigPropertySchema `json:"properties,omitempty"`
	// JSON Schema: list of required property ids (used when `type` is `'object'`)
	Required []string `json:"required,omitempty"`
	// Display extension: when `true`, the full set of allowed values is too large
	// to enumerate statically. The client SHOULD use `sessionConfigCompletions`
	// to fetch matching values based on user input. Any values in `enum` are
	// seed/recent values for initial display.
	EnumDynamic *bool `json:"enumDynamic,omitempty"`
	// When `true`, the user may change this property after session creation
	SessionMutable *bool `json:"sessionMutable,omitempty"`
}

// SessionConfigSchema A JSON Schema object describing available session configuration metadata.
type SessionConfigSchema struct {
	// JSON Schema: always `'object'`
	Type string `json:"type"`
	// JSON Schema: property descriptors keyed by property id
	Properties map[string]SessionConfigPropertySchema `json:"properties"`
	// JSON Schema: list of required property ids
	Required []string `json:"required,omitempty"`
}

// SessionConfigCompletionsParams Queries the server for allowed values of a dynamic session config property.
type SessionConfigCompletionsParams struct {
	// Agent provider ID
	Provider *string `json:"provider,omitempty"`
	// Working directory for the session
	WorkingDirectory *string `json:"workingDirectory,omitempty"`
	// Current user-filled configuration values (provides context for the query)
	Config map[string]json.RawMessage `json:"config,omitempty"`
	// Property id from the schema to query values for
	Property string `json:"property"`
	// Search filter text (empty or omitted returns default/recent values)
	Query *string `json:"query,omitempty"`
}

// SessionConfigCompletionsResult Result of the `sessionConfigCompletions` command.
type SessionConfigCompletionsResult struct {
	// Matching value items
	Items []SessionConfigValueItem `json:"items"`
}

// SessionConfigValueItem A single value item returned by `sessionConfigCompletions`.
type SessionConfigValueItem struct {
	// The value to store in config
	Value string `json:"value"`
	// Human-readable display label
	Label string `json:"label"`
	// Optional secondary description
	Description *string `json:"description,omitempty"`
}

// ── ReconnectResult Union ─────────────────────────────────────────────────────

// ReconnectResult is a discriminated union keyed on "type".
type ReconnectResult struct {
	Replay *ReconnectReplayResult
	Snapshot *ReconnectSnapshotResult
}

func (u *ReconnectResult) UnmarshalJSON(data []byte) error {
	var disc struct {
		D string `json:"type"`
	}
	if err := json.Unmarshal(data, &disc); err != nil {
		return err
	}
	switch disc.D {
	case "replay":
		u.Replay = new(ReconnectReplayResult)
		return json.Unmarshal(data, u.Replay)
	case "snapshot":
		u.Snapshot = new(ReconnectSnapshotResult)
		return json.Unmarshal(data, u.Snapshot)
	default:
		return fmt.Errorf("unknown ReconnectResult type: %q", disc.D)
	}
}

func (u ReconnectResult) MarshalJSON() ([]byte, error) {
	if u.Replay != nil {
		return json.Marshal(u.Replay)
	}
	if u.Snapshot != nil {
		return json.Marshal(u.Snapshot)
	}
	return nil, fmt.Errorf("empty ReconnectResult: no variant set")
}
