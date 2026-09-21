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

A host can offer to prepare repositories for a new session through a typed list. The client collects repository intent; the host owns authorization, credentials, and preparation. The baseline capability supports **one repository**; a separate option allows future hosts to support multiple repositories without changing the request shape. This capability does not define reusable projects, a repository catalogue, or a general-purpose clone command.

##### Capability and field constraints

The **host**, not an individual agent, opts in through [`InitializeResult.repositoryPreparation`](/reference/common#initialize):

| Capability | Meaning |
|---|---|
| Absent | Repository preparation and repository context in configuration queries are unsupported. |
| `{}` | Supports one repository at its default revision. |
| `revision: true` | Also supports an explicit branch, tag, or commit. |
| `multipleRepositories: true` | Also supports a list containing more than one repository. Absent or `false` means exactly one entry when a list is present. |

The optional typed `repositories: RepositorySource[]` field is shared by [`CreateSessionParams`](/reference/session#createsessionparams), [`ResolveSessionConfigParams`](/reference/root#resolvesessionconfigparams), and [`SessionConfigCompletionsParams`](/reference/root#sessionconfigcompletionsparams). Each [`RepositorySource`](/reference/session#repositorysource) contains:

| Field | Meaning |
|---|---|
| `source` | Required credential-free repository URI identifying the requested source. |
| `revision` | Optional branch, tag, or commit. Omission requests the host's default revision. |

Clients MUST check the host capability rather than infer support from a provider name, protocol version, `_meta`, or configuration property. A host MUST NOT accept repository input without the capability, or an explicit revision unless `revision` is `true`. When `multipleRepositories` is absent or `false`, it MUST reject lists containing more than one entry **before any preparation**, rather than preparing only the first entry.

When present, `repositories` MUST be non-empty. An absent list retains existing directory/default creation; advertising support does not make the field required. The generated types and schemas describe the list and entry shape; the host enforces capability, authorization, URI validity, and cross-field constraints. Only the typed `repositories` field carries repository intent. Generic `config` and its schema remain unchanged, with no aliases or repository-specific configuration carrier.

##### Values and validation

For example, the initialization result can advertise single-repository preparation with revision selection:

```json
{
  "protocolVersion": "0.9.0",
  "serverSeq": 0,
  "snapshots": [],
  "repositoryPreparation": { "revision": true }
}
```

The client passes the same list as context when resolving configuration or requesting completions, then sends it beside the returned configuration when creating the session:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "createSession",
  "params": {
    "channel": "ahp-session:/new-session",
    "repositories": [
      { "source": "https://example.org/team/project.git", "revision": "main" }
    ],
    "config": { "mode": "interactive" }
  }
}
```

The repository URI identifies a source, not a checkout or host filesystem directory. There is **no one-to-one or positional mapping** between `repositories` and the resolved `workingDirectories`. One source can produce multiple directories, and a multi-repository host may accept the same source at different revisions. Clients MUST NOT deduplicate entries by source URI or use it as a checkout identity. No per-repository IDs are introduced.

`createSession.repositories` and a non-empty `createSession.workingDirectories` list are mutually exclusive. Configuration queries may include `repositories` together with an existing `workingDirectory` as context; preparation belongs to creation, not draft configuration. The resulting directories MUST fit the selected provider's existing directory capabilities. Host-level repository support does not grant an agent support for multiple working directories.

Each entry MUST contain a non-empty `source`, and a supplied `revision` MUST be a non-empty string. A revision without a source is invalid. For creation and configuration queries, the host MUST reject invalid or unsupported intent with `InvalidParams` (`-32602`), including an empty list, an unsupported list length or revision, a malformed or credential-bearing source URI, or conflicting creation directories. It MUST NOT silently drop entries, select a default directory, or replace an unsupported revision with its default. A repository-aware client MUST surface invalid capability declarations or unsupported input instead of silently dropping the user's intent.

Repository source URIs MUST NOT contain credentials such as passwords or access tokens. Authentication uses the existing [authentication contract](./authentication); the host MUST authorize the requesting client before repository side effects and use only credentials permitted for that request. Credentials MUST NOT appear in session state, progress messages, or logs.

##### Preparation and recoverable state

Repository preparation is part of the existing `creating` lifecycle. The host MUST finish preparation before executing turns or publishing `session/ready`. No additional lifecycle state is introduced.

The host MUST publish the accepted `repositories` list in the initial `creating` snapshot and retain it **exactly**, including entry order and omitted revisions, through `ready` or `failed`. This immutable field belongs to [`SessionMetadata`](/reference/session#sessionmetadata), so summaries carry the same list. Preserve requested intent even if the host resolves a branch or tag to a commit; the resolved working location is a separate fact. Configuration and working-directory actions do not change this list.

Before dispatching `session/ready` or `session/creationFailed`, the host MUST publish the actual resolved `workingDirectories` in session state, using the existing snapshot and working-directory actions. While no directory has been resolved, `workingDirectories` MAY be absent or empty; do not claim a checkout was prepared when preparation failed. On failure, the existing `session/creationFailed` action records `lifecycle: "failed"` and `creationError`. Both outcomes retain the requested intent and any resolved directories so clients can recover them from a snapshot or replay.

The host MAY report preparation through the existing `createSession.progressToken` and [`root/progress`](./root-channel#progress). Progress is optional, ephemeral, and not replayed. Neither a completed progress indicator nor a successful command response is a replacement for session readiness or failure state.

##### Reattachment, retry, and cleanup

`createSession` is not an idempotent preparation command. A duplicate URI still returns `SessionAlreadyExists` (`-32003`), including while preparation is running or after creation has failed; it MUST NOT start another preparation for that session. After a lost response, the client should reattach to the same session URI through subscription or [reconnection](./lifecycle#reconnection) and inspect its state. Before treating the recovered session as the requested creation, it MUST verify that its complete `repositories` list matches the requested intent, including order and revision omission, and inspect the lifecycle. A mismatch is a conflict, not successful recovery. A duplicate creation error alone is not successful recovery. After a failure is addressed, a user can explicitly retry with a new session URI rather than overwrite the failed session; no per-repository retry is introduced.

The host owns the lifetime of preparation resources it creates; a source URI does not establish ownership of an existing or shared checkout. This capability adds no cancellation RPC or new disposal rules.

##### Minimal-client behavior

A client supporting this capability collects a repository list separately from configuration and respects the host's single- or multi-repository limit. It needs no Git implementation, clone RPC, or progress implementation. Minimal clients can omit `repositories` and continue using directory/default creation. Joining or reconnecting clients read the list, lifecycle, and working directories from authoritative session state without repeating preparation.

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
