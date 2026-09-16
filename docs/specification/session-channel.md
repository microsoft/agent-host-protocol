# Session Channel

<StabilityIndex level="2" />

A session channel carries session-level state and acts as the coordination scope for one or more chats. The session tracks lifecycle, customizations, per-session configuration, changesets, and the catalog of chats that belong to the session. The per-conversation state — turns, streaming responses, tool calls, pending messages, and input requests — lives on the [chat channel](./chat-channel).

## URI

```
ahp-session:/<uuid>
```

The path is a server-unique identifier (typically a UUID) chosen by the client at creation time. The session's provider (e.g. `"copilot"`) is **not** encoded in the URI scheme — it is carried on [`SessionSummary.provider`](/reference/session#sessionsummary). This decoupling lets the same scheme address sessions backed by any agent.

Multiple session channels may be active simultaneously. Clients subscribe to each one whose state they want to track.

## State

Subscribers receive a [`SessionState`](/reference/session#sessionstate) snapshot containing the session metadata (title, status, provider, activity, working directory, …) inlined directly, the lifecycle phase, the catalog of [`chats`](/reference/session#sessionstate) belonging to this session, the optional [`defaultChat`](/reference/session#sessionstate) routing hint, active-client state, customizations, changesets, the [`inputNeeded`](#aggregated-input-requests) aggregate, and per-session configuration. Per-conversation state (turns, streaming, tool calls, pending messages, input requests) lives on the [chat channel](./chat-channel). Refer to the [State Model guide](/guide/state-model) for a structural overview.

## Lifecycle

```
1. Client picks a session URI (e.g. ahp-session:/<new-uuid>)
2. Client sends createSession(uri, config) command
3. Client sends subscribe(uri) — MAY be batched with the command
4. Server creates session with lifecycle: 'creating', returns the snapshot
5. Server asynchronously initialises the agent backend
6. On success: server dispatches session/ready
7. On failure: server dispatches session/creationFailed
8. Server broadcasts root/sessionAdded to clients subscribed to ahp-root://
```

### Creation

[`createSession`](/reference/session#createsession) is a JSON-RPC request. The client picks the URI; the server allocates session state and begins backend initialisation. If the URI is already in use the server returns `SessionAlreadyExists` (`-32003`).

#### Repository-backed creation

A host can offer to prepare **one repository for a new session** through the existing session configuration flow. The client collects repository intent; the host owns authorization, credentials, preparation, and cleanup. This capability does not define reusable projects, a repository catalogue, or a general-purpose clone command.

##### Capability and field constraints

The host opts in by returning the optional [`SessionConfigSchema.repository`](/reference/session#sessionconfigschema) descriptor from [`resolveSessionConfig`](/reference/root#resolvesessionconfig):

```ts
export interface RepositorySessionConfig {
  urlProperty: string;
  revisionProperty?: string;
}
```

The descriptor identifies existing entries in `schema.properties`; it does not carry the repository values.

| Field | Meaning |
|---|---|
| `urlProperty` | Host-chosen property id for a credential-free repository URI. |
| `revisionProperty` | Optional host-chosen property id for a branch, tag, or commit revision. |

Every referenced property MUST exist in `schema.properties`, have `type: "string"`, and be writable at creation (`readOnly` MUST NOT be `true`). Neither property may have `sessionMutable: true`: these values describe creation intent, not a request to switch repositories or revisions in an existing session. When `revisionProperty` is present, it MUST differ from `urlProperty`. These relationships are host validation rules; validating the descriptor's JSON shape alone does not check its references to other properties.

Clients MUST use the advertised property ids, not hardcoded names. The descriptor itself is the opt-in capability; clients MUST NOT infer repository support from a provider name, protocol version, `_meta`, or a property whose name happens to resemble a repository field. A host MUST NOT accept repository intent unless it advertises this descriptor.

The descriptor does not itself make either value required. The existing `required` list still describes form requirements; AHP adds no globally required repository property. A host without the descriptor, or a request without repository intent, retains its existing directory/default behavior.

##### Values and validation

Values travel in `resolveSessionConfig.config`, then in `createSession.config`. Discovery and iterative configuration resolution MUST NOT clone or prepare a repository. The host MAY advertise supported URI schemes and revision choices through the existing property descriptions, enums, and completions.

For example, a host may choose `source_uri` and `source_ref`:

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "source_uri": { "type": "string", "title": "Repository" },
      "source_ref": { "type": "string", "title": "Revision" }
    },
    "repository": {
      "urlProperty": "source_uri",
      "revisionProperty": "source_ref"
    }
  },
  "values": {}
}
```

The client can submit `{"source_uri":"https://example.org/team/project.git","source_ref":"main"}` as `resolveSessionConfig.config`, without a `workingDirectory`, and pass the returned values to creation:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "createSession",
  "params": {
    "channel": "ahp-session:/new-session",
    "config": {
      "source_uri": "https://example.org/team/project.git",
      "source_ref": "main"
    }
  }
}
```

The repository URI identifies the source, not a host filesystem directory. Repository intent and a non-empty `createSession.workingDirectories` list are mutually exclusive. A revision value without a repository URI is invalid. Omit an unused repository or revision value rather than supplying an empty string. The host MUST reject invalid intent, including conflicting directories or a revision without a repository, with `InvalidParams` (`-32602`), rather than silently selecting a default directory. A repository-aware client MUST surface an invalid or unsupported descriptor instead of silently dropping the user's repository intent.

Repository URIs and configuration values MUST NOT contain credentials such as passwords or access tokens. Authentication uses the existing [authentication contract](./authentication); the host MUST authorize the requesting client before repository side effects and use only credentials permitted for that request. Credentials MUST NOT appear in session state, progress messages, or logs.

##### Preparation and recoverable state

Repository preparation is part of the existing `creating` lifecycle. The host MUST finish preparation before executing turns or publishing `session/ready`. No additional lifecycle state is introduced.

The host MUST publish the accepted, requested repository URI and optional revision under the advertised ids in `SessionState.config.values`, together with the descriptor in `SessionState.config.schema`. Make this intent available in the initial `creating` snapshot so another client joining during preparation can understand the session. Preserve requested intent even if the host resolves a branch or tag to a commit; the resolved working location is a separate fact.

Before dispatching `session/ready` or `session/creationFailed`, the host MUST publish the actual resolved `workingDirectories` in session state, using the existing snapshot and working-directory actions. While no directory has been resolved, `workingDirectories` MAY be absent or empty; do not claim a checkout was prepared when preparation failed. On failure, the existing `session/creationFailed` action records `lifecycle: "failed"` and `creationError`. Both outcomes retain the requested intent and any resolved directories so clients can recover them from a snapshot or replay.

The host MAY report preparation through the existing `createSession.progressToken` and [`root/progress`](./root-channel#progress). Progress is optional, ephemeral, and not replayed. Neither a completed progress indicator nor a successful command response is a replacement for session readiness or failure state.

##### Reattachment, retry, and cleanup

`createSession` is not an idempotent preparation command. A duplicate URI still returns `SessionAlreadyExists` (`-32003`), including while preparation is running or after creation has failed; it MUST NOT start another preparation for that session. After a lost response, the client should reattach to the same session URI through subscription or [reconnection](./lifecycle#reconnection) and inspect its state. It MUST NOT treat a duplicate creation as successful recovery. After a failure is addressed, a user can explicitly retry with a new session URI rather than overwrite the failed session.

Cancelling a local wait, disconnecting, or unsubscribing does not grant permission to delete repository data. When the user intends to dispose the session, use the existing `disposeSession` command; this capability adds no cancellation RPC. The host MUST NOT erase a shared checkout or uncommitted user changes during cancellation or disposal. Cleanup of exclusively owned temporary preparation resources remains a host responsibility.

##### Minimal-client behavior

A minimal client can ignore the descriptor, render the ordinary advertised configuration fields, pass resolved values through `config`, and render the existing session lifecycle and `workingDirectories`. It needs neither Git support nor a repository-specific form, clone RPC, or progress implementation. It can also omit this optional creation capability entirely and continue using directory/default creation. A joining or reconnecting client renders the authoritative state without repeating repository preparation.

### Active session

Once a session reaches `lifecycle: 'ready'`, clients may create chats on it with [`createChat`](/reference/chat#createchat). Each chat is independently subscribable at its own `ahp-chat:/<cid>` URI; see the [Chat Channel specification](./chat-channel) for the per-chat lifecycle, turn flow, tool calls, and input request handling.

Session-scoped actions dispatched on this channel are limited to:

- Catalog mutations — `session/chatAdded`, `session/chatRemoved`, `session/chatUpdated`, and `session/defaultChatChanged`.
- Session-wide configuration — active-client tracking, customizations, changesets, lifecycle transitions.

All actions dispatched on this channel travel on `ActionEnvelope`s whose `channel` is the session URI. Action payloads do NOT carry their own session URI — the channel comes from the envelope.

### Chat catalog mutations

Three discrete actions keep `SessionState.chats` in sync as chats come and go. Sessions with a single chat trivially round-trip a `session/chatAdded` once at creation; multi-chat sessions exercise all three:

| Action | Payload | Reducer behavior |
|---|---|---|
| `session/chatAdded` | `summary: ChatSummary` | Upsert by `summary.resource`. Appends when no entry has the same URI; otherwise replaces the existing entry. Mirrors `root/sessionAdded`. |
| `session/chatRemoved` | `chat: URI` | Removes the matching entry. No-op when no entry matches. If `state.defaultChat` referenced the removed URI, the reducer clears it. Mirrors `root/sessionRemoved`. |
| `session/chatUpdated` | `chat: URI, changes: Partial<ChatSummary>` | Merges the non-identity fields of `changes` onto the matching entry. No-op when no entry matches; clients SHOULD then wait for a `session/chatAdded`. Identity fields (`resource`) MUST NOT be carried in `changes`. Mirrors `root/sessionSummaryChanged`. |

The producer of the chat's own [`ChatState`](./chat-channel#state) is responsible for emitting matching `session/chatUpdated` actions so the catalog and the per-chat channel stay consistent.

### Chat aggregation

[`SessionSummary`](/reference/session#sessionsummary) carries session-wide identity (`resource`, `provider`, `createdAt`, `workingDirectories`) but several of its mutable fields are aggregates derived from the session's chats. Producers SHOULD apply these rules so clients that only consume the session summary (a session list, for example) still see meaningful state:

| Field | Derivation rule |
|---|---|
| `status` | Take the activity bits (`Idle` / `InProgress` / `InputNeeded` / `Error`) from the [`defaultChat`](#defaultchat) when set, else from the most recently modified chat. Promote `InputNeeded` if **any** chat needs input. Promote `Error` if **any** chat is in an error state. The orthogonal `IsRead` / `IsArchived` flags remain session-scoped and pass through unchanged. |
| `activity` | Mirror the activity string of the chat that contributes the activity bits — usually the default chat, but the chat that raised `InputNeeded` / `Error` when a non-default chat wins the promotion. |
| `modifiedAt` | The maximum of every chat's `modifiedAt`. |
| `workingDirectories` | The session-level set. Individual chats MAY restrict to a subset via [`ChatSummary.workingDirectories`](/reference/chat#chatsummary); aggregating per-chat subsets up is meaningless and SHOULD NOT be attempted. |
| `changes` | Optional roll-up. Producers MAY sum per-chat changeset stats or report the most expensive chat's stats — whichever is cheaper to compute. |

Sessions with a single chat satisfy all of the above trivially (the chat's values pass through). The rules only matter once a session carries multiple chats.

### Aggregated input requests

A chat blocks on user input (an [elicitation](/guide/elicitation)) or on a tool confirmation deep inside its turn state. Discovering those blocks would normally require subscribing to every chat channel — impractical for a mobile app or a tool-providing client that only watches the session.

[`SessionState.inputNeeded`](/reference/session#sessionstate) is a session-level roll-up of every outstanding block across all chats. The host upserts entries with `session/inputNeededSet` and removes them with `session/inputNeededRemoved` as the underlying chat-level requests appear and resolve. Whenever the list is non-empty the session's [`status`](#chat-aggregation) carries the `InputNeeded` bit.

Each entry is a [`SessionInputRequest`](/reference/session#sessioninputrequest) — a discriminated union over `kind`:

| `kind` | Carries | Respond by dispatching… |
|---|---|---|
| `chatInput` | the mirrored [`ChatInputRequest`](/reference/chat#chatinputrequest) | `chat/inputCompleted` (or `chat/inputAnswerChanged`) |
| `toolConfirmation` | a [`ToolCallConfirmationState`](/reference/chat#toolcallconfirmationstate) plus `turnId` | `chat/toolCallConfirmed` or `chat/toolCallResultConfirmed` |
| `toolClientExecution` | a [`ToolCallState`](/reference/chat#toolcallstate) in `running` status plus `turnId` and the owning `clientId` | `chat/toolCallComplete` (optionally `chat/toolCallContentChanged`) |
| `toolAuthentication` | a [`ToolCallAuthRequiredState`](/reference/chat#toolcallauthrequiredstate) plus `turnId` | *(see below)* `authenticate` |

Every entry carries the owning `chat` URI plus the identifiers (`request.id`, or `turnId` + `toolCall.toolCallId`) needed to construct the response. A client therefore answers by dispatching the ordinary `chat/*` action **to that chat's channel** — it does **not** need to have subscribed to the chat first. `inputNeeded` is a read/respond convenience surface, not a separate response protocol: the chat channel remains the source of truth and the host removes the aggregate entry once the chat-level request resolves.

`toolAuthentication` is the one exception to the "respond via `chat/*` action" pattern: the client resolves it by calling the connection-level `authenticate` command with the resource from `toolCall.auth.resource` (see [Authentication](/specification/authentication)), not by dispatching an action to the chat. The host dispatches `chat/toolCallAuthResolved` once the token is accepted and removes the `session/inputNeeded` entry at that point.

### Disposal

```jsonc
// Client → Server (request)
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "disposeSession",
  "params": { "channel": "ahp-session:/<uuid>" },
}
```

The server tears down the session backend, drops associated subscriptions, and broadcasts `root/sessionRemoved` to clients subscribed to `ahp-root://`.

## Methods and events on this channel

This section lists wire methods that are interpreted in the context of a
session URI (`ahp-session:/<uuid>`).

### Commands (`params.channel = "ahp-session:/<uuid>"`)

| Method | Kind | Purpose |
|---|---|---|
| `createSession` | request | Create a session at the chosen URI. |
| `disposeSession` | request | Dispose this session and its backend resources (cascades to every chat in the session's catalog). |

### Notifications (`params.channel = "ahp-session:/<uuid>"`)

| Method | Kind | Meaning |
|---|---|---|
| `action` | server → client notification | Session action envelope (`session/*` action payloads — catalog updates, lifecycle, customizations, changesets). |
| `dispatchAction` | client → server notification | Dispatch client actions on this session (`session/titleChanged`, `session/defaultChatChanged`, ...). |
| `unsubscribe` | client → server notification | Stop receiving messages for this session channel. |

`auth/required` may also target a session URI when auth is required for an
operation scoped to that session; see
[Authentication](/specification/authentication).

## Server Validation of Client Actions

When the server receives a client-dispatched action on this channel, it MUST validate it before applying. Invalid actions MUST be echoed back with a `rejectionReason` on the `ActionEnvelope`. The following validation rules apply:

| Action                                        | Condition                                                                                                                  | Server Behavior                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Any action referencing a non-existent session | Channel URI not found                                                                                                      | Server MUST silently ignore the action (no echo)                                                    |
| `session/defaultChatChanged`                  | `defaultChat` URI does not match an entry in the session's chat catalog                                                    | Server MUST reject the action                                                                       |

Turn-, tool-call-, input-request-, and pending-message-level validation lives on the [Chat Channel](./chat-channel#server-validation-of-client-actions).

## Actions

Refer to the [Session Channel Reference](/reference/session#actions) for the full per-action reference. All session-scoped action envelopes carry `channel: "ahp-session:/<uuid>"`.

## Catalogue Notifications

Session catalogue events (creation, disposal, summary mutations) are emitted on the [Root Channel](/specification/root-channel#protocol-notifications), not on the session channel itself. This lets clients track the session list without subscribing to every session.
