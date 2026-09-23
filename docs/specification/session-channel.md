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

A host can prepare repositories for a new session. The client supplies sources; the host owns authorization, credentials, and preparation. This does not introduce a clone command or require a particular repository or worktree backend.

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
| `subdirectory` | Optional repository-relative selected folder, such as `packages/api`. Omission selects the repository root. |

Clients MUST check the host capability. Hosts MUST reject unsupported repository input, explicit revisions without `revision: true`, and multiple entries without `multipleRepositories: true` **before preparation**. When present, the list MUST be non-empty; omission retains directory/default creation. Generic `config` remains unchanged.

##### Request and resolved directories

Pass the repository list as context to configuration queries, then beside the resolved configuration in `createSession`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "createSession",
  "params": {
    "channel": "ahp-session:/new-session",
    "repositories": [
      {
        "source": "https://example.org/team/project.git",
        "revision": "main",
        "subdirectory": "packages/api"
      }
    ],
    "config": { "mode": "interactive" }
  }
}
```

A host that prepares a worktree could publish this resolved session state:

```json
{
  "lifecycle": "ready",
  "workingDirectories": [
    {
      "uri": "file:///worktrees/session-42/packages/api",
      "repo": "https://example.org/team/project.git",
      "origin": {
        "kind": "worktree",
        "mainWorktree": "file:///workspaces/project"
      }
    }
  ]
}
```

`SessionMetadata.workingDirectories` accepts URI strings and [`WorkingDirectory`](/reference/session#workingdirectory) records, shared by full state and summaries:

| Record field | Meaning |
|---|---|
| `uri` | Required actual selected directory. The unique entry key, including when selecting a subdirectory. |
| `repo` | Optional credential-free source association, **not** a checkout identity. |
| `origin` | Optional host-reported result: `local`, `repo`, or `worktree`. `worktree` requires `mainWorktree: URI`. Omission is unspecified provenance. |

`local` describes a supplied local directory; `repo` describes repository preparation without a host-created worktree; `worktree` describes a host-created worktree even when the input was a repository source. Multiple entries may share `repo`. Clients MUST NOT deduplicate by source, associate requests and results by array position, or infer a checkout root from the selected directory. Metadata does not grant cleanup authority or imply generic worktree-creation support.

##### Host validation and lifecycle

For creation and configuration queries, hosts MUST reject invalid or unsupported input with `InvalidParams` (`-32602`): empty lists, empty sources or revisions, malformed or credential-bearing source URIs, and empty, absolute, or escaping `subdirectory` paths. Hosts MUST ensure the selected folder resolves inside the prepared repository, including through symbolic links, and MUST NOT silently substitute the root or a default revision.

`createSession.repositories` and non-empty `createSession.workingDirectories` are mutually exclusive. Configuration queries may also include an existing `workingDirectory` as context but MUST NOT prepare repositories. Hosts MUST authorize the client before preparation, use the existing [authentication contract](./authentication), and keep credentials out of source URIs, state, progress, and logs.

Preparation stays within the existing `creating` lifecycle. Before `session/ready` or `session/creationFailed`, the host MUST publish any actual resolved directories. Unresolved directories stay absent or empty; failure uses `creationError`, not a fabricated checkout. The original repository list is **not** echoed into session metadata.

Clients MUST wait for native session readiness before sending turns and use the actual resolved directories, not requested sources or guessed paths. Optional `createSession.progressToken` / [`root/progress`](./root-channel#progress) updates and a successful command response do not establish readiness.

Repository preparation does not change the agent's existing multi-directory, immutable-primary, or primary-replacement rules. Resolved directories must fit those capabilities; later directory changes remain available under the same rules.

##### Compatibility and host authority

Clients opt into rich records with `initialize.capabilities.workingDirectoryInfo: {}`. New clients MUST also accept URI-only and mixed lists, including responses from older hosts.

Hosts MUST retain authoritative rich state and project every record to its `uri` for clients without this capability. Projection is per client and MUST NOT erase metadata from shared state or the replay log. It applies to **every carrier**:

- `initialize` and `subscribe` snapshots;
- `listSessions`, `root/sessionAdded`, and `root/sessionSummaryChanged` deltas;
- live and replayed `session/workingDirectorySet` / `session/workingDirectoryReplaced` actions;
- reconnect snapshots and any full-snapshot reset.

The capability remains in effect across reconnect, for both replay and snapshot recovery.

Set actions carry `directory: URI | WorkingDirectory`; replacement actions carry the target `directory: URI` and `replacement: URI | WorkingDirectory`; removal carries only a URI. Clients MUST NOT supply `repo` or non-local provenance. Hosts MUST validate and enrich client input before broadcasting the accepted action. A rich set replaces the complete same-URI record; a URI-only duplicate preserves known metadata. Remove and replace compare URI keys and preserve existing ordering and primary-slot rules; a URI-only replacement preserves metadata already known for its URI.

Chats retain `workingDirectories?: URI[]`: each URI matches a session URI string or record's `uri`. Chats do not duplicate directory metadata.

##### Lost creation responses and cleanup

`createSession` remains non-idempotent. An existing URI returns `SessionAlreadyExists` (`-32003`) and MUST NOT start another preparation. There is no creation token or original-request echo. After a lost response, a duplicate error MUST NOT be treated as proof of successful creation, and clients MUST NOT automatically send pending turns on that basis. A user may explicitly reopen the existing session or retry with a new URI. Ordinary reconnect of an already attached session remains unchanged.

The host owns resources it creates, not arbitrary existing or shared directories. This capability adds no cancellation RPC or disposal rule; `repo` and `origin` do not authorize deletion.

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
