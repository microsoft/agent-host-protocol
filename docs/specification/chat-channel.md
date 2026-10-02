# Chat Channel

<StabilityIndex level="2" />

A chat channel carries the full state of a single conversation thread: turns, streaming responses, tool calls, pending messages, input requests, and an optional per-chat changeset catalogue. A chat always belongs to a [session](./session-channel); a session may contain one or many chats. Chats are independently subscribable so a client can observe a subset of activity without paying the bandwidth cost of every chat in the session.

## URI

```
ahp-chat:/<uuid>
```

The path is a server-unique identifier allocated by the server when the chat is
created. Clients MUST treat the full URI as opaque. A host MAY encode owning
session identity in the path for routing or storage, but ownership is
authoritatively expressed by the session's
[`chats`](/reference/session#sessionstate) catalog and creation provenance by
each chat's [`origin`](/reference/chat#chatorigin).

Multiple chat channels may be active simultaneously. Clients subscribe to each chat whose state they want to track.

## State

Subscribers receive a [`ChatState`](/reference/chat#chatstate) snapshot. `ChatState` denormalizes the [`ChatSummary`](/reference/chat#chatsummary) fields directly onto itself (`resource`, `title`, `status`, `activity`, `modifiedAt`, `origin`, `workingDirectories`) and adds the conversation contents (history of completed turns, the active turn if any, pending messages, outstanding input requests, and the user's in-progress [`draft`](#drafts)) plus the optional [`changesets`](#per-chat-changesets) catalogue. Producers MUST keep the chat's `ChatSummary` in the session catalog consistent with these inlined summary fields — typically by dispatching a matching [`session/chatUpdated`](/reference/session#actions) whenever any summary field on the chat changes. Refer to the [State Model guide](/guide/state-model) for a structural overview.

Clients mark any known chat, including the owning session's default chat, as
read or unread by dispatching
[`chat/isReadChanged`](/reference/chat#actions) on that chat's channel. The
action toggles `SessionStatus.IsRead` only on the addressed `ChatState`; it
does not change the read state of the owning session or sibling chats. The host
echoes the accepted action in server order and keeps the corresponding
`ChatSummary.status` synchronized through `session/chatUpdated` and the
matching compact `SessionChatSummary.isRead` projection synchronized through
`root/sessionSummaryChanged`.
`session/isReadChanged` independently changes the owning session's read state;
neither action implies the other.

When a client subscribes with `view.turns`, the server MAY expose only a tail of
the most recent completed turns in the initial snapshot. The requested number is
advisory: the server MAY return more or fewer turns than requested. If
`view.turns` is omitted, the server MUST return all retained turns. If older
retained turns remain available, `ChatState.turnsNextCursor` is present. The
client passes this opaque cursor to
[`fetchTurns`](#commands-paramschannel--ahp-chatuuid) to ask the host to
dispatch `chat/turnsLoaded`, which prepends older turns into the same reduced
chat state and updates or clears `turnsNextCursor`.

Hosts MUST also eagerly load older turns into state before applying any
operation that references a turn outside the currently loaded window (for
example, a fork, side-chat source, chat attachment, or truncation targeting an
older turn).

### Drafts

[`ChatState.draft`](/reference/chat#chatstate) is the user's in-progress input for a chat — the [`Message`](/reference/chat#message) they are composing but have not sent yet, including its model/agent selection and attachments. Unlike the fields above, `draft` is state-only and is **not** mirrored onto [`ChatSummary`](/reference/chat#chatsummary).

Clients MAY periodically sync their local input state into the draft by dispatching [`chat/draftChanged`](/reference/chat#actions). Eager syncing is not required — clients SHOULD debounce and MAY sync only at convenient points (for example, on blur). When presenting input UI for an existing chat, clients SHOULD use any `draft` to initialize their input state. Dispatch `chat/draftChanged` with no `draft` to clear it once the message is sent.

### Per-chat working directory

`ChatState.workingDirectories` (and its mirror on [`ChatSummary`](/reference/chat#chatsummary)) is **optional**. When absent, the chat inherits the session's full [`workingDirectories`](/reference/session#sessionsummary) set; when present it MUST be a subset of that set. Hosts MAY set a per-chat subset to give individual chats their own filesystem context — for example, allocating a separate git worktree per chat so multiple chats in the same session can make independent edits that the orchestrating chat later merges back.

### Per-chat changesets

[`ChatState.changesets`](/reference/chat#chatstate) is an optional catalogue of
the existing [`Changeset`](/reference/changeset#changeset) model. Hosts SHOULD
use it to advertise Branch, Uncommitted Changes, and other views scoped to the
chat's effective working directories. `ChatSummary` intentionally omits this
catalogue so session chat navigation remains lightweight; a client obtains it
from the subscribed chat state.

Each catalogue entry resolves to an independently subscribable
[`ChangesetState`](/reference/changeset#changesetstate). File-level updates
continue to use the existing `changeset/*` action contract. When the catalogue
itself changes, the server dispatches
[`chat/changesetsChanged`](/reference/chat#chatchangesetschangedaction), which
fully replaces the catalogue or clears it when `changesets` is absent.

## Relationship to the session channel

- A chat's [`ChatSummary`](/reference/chat#chatsummary) appears in the session's [`SessionState.chats`](/reference/session#sessionstate) catalog. The session reducer keeps that catalog in sync with the underlying chat lifecycle.
- The session may also expose [`defaultChat`](/reference/session#sessionstate) as a UI routing hint for input that is addressed to the session as a whole. Every chat remains directly addressable.
- Session-level fields such as [`status`](/reference/session#sessionsummary), `activity`, and `modifiedAt` are aggregates derived from the session's chats. See the [Session Channel specification](./session-channel#chat-aggregation) for the derivation rules.

## Lifecycle

```
1. Client subscribes to the owning session URI (ahp-session:/<sid>)
2. Client (or the server, via a tool call, fork, or side chat) creates a chat with createChat
3. Server allocates a chat URI (ahp-chat:/<cid>) and mutates the session's chats catalog
4. Client subscribes to the chat URI to receive its ChatState snapshot
5. Server streams chat actions over the chat channel until the chat (or its session) is disposed
```

### Creation

[`createChat`](/reference/chat#createchat) is a JSON-RPC request. Callers identify the owning session via the request's `channel` parameter (`ahp-session:/<sid>`) and MAY supply:

- an `initialMessage` to start the first turn immediately — carrying its own [`model`](/reference/chat#message) / [`agent`](/reference/chat#message) selection — and
- a `source` of type [`ChatSource`](/reference/chat#chatsource), either
  `{ kind: "fork", chat, turnId }` or `{ kind: "sideChat", chat, turnId }`,
  selecting a specific source turn. Side-chat sources MAY also carry
  `selection: { text, responsePartId? }`, an immutable selected-text snapshot
  captured when the host accepts `createChat`.

The server allocates the chat URI and adds the chat to the session's catalog (`session/chatAdded` on the session channel) before returning.

Clients MUST gate source-based creation using the selected
[`AgentInfo.capabilities.multipleChats`](/reference/root#multiplechatscapability):

- `fork: true` permits `source.kind: "fork"`.
- `sideChat: true` permits `source.kind: "sideChat"`.
Absence or `false` means the corresponding source form is unsupported. The host
MUST reject an unsupported source. It MUST also reject a source chat outside the
target session, an unknown source chat or turn, or a source that names the chat
being created. For forks, the host MUST additionally reject any source whose
`kind` is not `"fork"` — forks only target completed turns.

For side chats, `turnId` is a stable identity, not a lifecycle snapshot. Hosts
and clients resolve it against the source chat's current `activeTurn` or its
retained `turns` as needed. This keeps `/btw`-style side chats from the
currently active turn working even though that same turn later moves into
historical `turns` when it completes.

When `source.kind` is `"sideChat"` and `source.selection` is present, the host
MUST snapshot that exact `selection.text` when it accepts `createChat`; it MUST
be non-empty. Later source-turn edits or streaming deltas do not retroactively
change the stored snapshot. `selection.responsePartId`, when present, is
advisory provenance naming the response part that contained the text at snapshot
time; it is **not** a live range, offset, or patch anchor.

Forks and side chats use the source differently:

- A **fork** copies source history through the referenced turn into the new
  chat's visible `turns`, after which the chats diverge.
- A **side chat** starts with its own empty visible history. The host supplies
  source history through the referenced turn as agent context, but does not copy
  that history into the side chat's `turns`. When the referenced `turnId`
  resolves to the source chat's current `activeTurn`, the host snapshots the
  source chat's retained history plus the active turn's current user message and
  whatever assistant response parts are already available when accepting
  `createChat`; later source-turn deltas do not retroactively change the side
  chat's starting context. If `source.selection` is present, the host also
  snapshots that exact selected text into the created chat's origin. An
  `initialMessage`, when supplied, becomes the side chat's first visible turn.

### Origin

Each chat advertises how it came into existence via [`ChatOrigin`](/reference/chat#chatorigin):

| Kind | Meaning |
|---|---|
| `user` | User created the chat explicitly (e.g. via the host UI). |
| `fork` | Forked from an existing chat at a specific completed turn — payload references the source chat URI and stable source `turnId`. |
| `sideChat` | Created as an independent side conversation using context through a specific source turn — payload references the source chat URI and stable source `turnId`, which may have been active or historical when the chat was created, and MAY retain an immutable `selection` snapshot captured at create acceptance. |
| `tool` | Spawned by a tool call running in another chat — payload references the source chat URI and tool call id (e.g. a sub-agent delegation). |

Clients MAY use the origin to render creation-provenance UI (fork markers,
"spawned by tool" badges). Origin does not expose any host-internal hierarchy;
every chat remains directly addressable.

A tool-spawned worker is described from both ends of the same edge. The worker chat carries the canonical record via its `tool` origin (the spawning chat URI and tool call id). The spawning tool call surfaces the same relationship forward through a [`ToolResultSubagentContent`](/reference/chat#toolresultsubagentcontent) block in its result, whose `resource` is the worker **chat** URI (`ahp-chat:/<cid>`, not a session URI). The tool call that emits that block is the one named by the worker chat's `origin.toolCallId`; hosts MUST keep the two consistent.

#### Provenance after a move

A `fork`, `sideChat`, or `tool` origin permanently names the chat that created
it, together with the turn or tool call that produced it. `moveChat` never
rewrites this provenance. Moving a chat preserves its URI; a historical
`origin.chat` may stop resolving only if the referenced chat is later pruned.

### Moving chats

[`moveChat`](/reference/chat#movechat) atomically changes a chat's owning
session or its position in the current session's ordered chat catalog. The
source is the chat URI in `params.channel`. Its destination is one of:

- `{ kind: "session", session, after? }` — move into an existing session, or
  reorder within the current session. `after` places the requested chat
  immediately after another chat in that session; absence places it first.
- `{ kind: "newSession" }` — allocate a session, transfer the source hierarchy,
  and make the source the new session's `defaultChat`.

When `session` is the current owning session, only the requested public catalog
entry is repositioned. When ownership changes, the requested chat and its
complete host-managed descendant hierarchy transfer together. AHP does not
expose that hierarchy.

The host exposes eligibility through `ChatState.movable` and
`ChatSummary.movable`; absence means `false`. Clients MUST only offer or invoke
`moveChat` for a chat that advertises `movable: true`. The chat referenced by
its owning session's `defaultChat` MUST NOT advertise `movable: true`.
Default status does not constrain catalog position: another movable chat may be
placed before or after the default chat, and the default chat may be an `after`
anchor. Hosts publish `chat/movableChanged` and the corresponding
`session/chatUpdated` when eligibility changes.

```json
{
  "session": "ahp-session:/destination"
}
```

The result always reports the authoritative destination session. Every moved
chat keeps its URI, state, and byte-for-byte `ChatOrigin`, so existing
chat-channel subscriptions remain valid.

#### Validation

At minimum, the source MUST exist and advertise `movable: true`; the destination
session and optional `after` chat MUST resolve; the anchor MUST belong to the
destination session; and the source MUST NOT anchor itself. Hosts MAY reject
unsupported destinations or transient source conditions. Failure has no
observable effect on ownership or catalog order.

Success preserves every moved chat URI, state, and origin, and converges the
durable session catalogs. The protocol does not require provider equality,
prohibit active turns universally, or otherwise expose host-specific storage
and runtime constraints.

#### Atomic synchronization

The host validates and persists ownership, its internal hierarchy, catalog
order, and default-chat state before publishing synchronization actions:

1. Cross-session moves use `session/chatRemoved` and `session/chatAdded` for
   every transferred catalog entry.
2. Ordering changes use `session/chatsReordered`, whose `chats` field is the
   complete authoritative resulting URI order.
3. Root notifications add a newly allocated session and update affected
   `SessionSummary.chats` catalogs.

These messages describe a transaction that is already committed; their delivery
does not define atomicity. Clients observing only a subset of channels reconcile
from snapshots. After an uncertain `newSession` response, clients SHOULD
reconcile root and session state rather than blindly retrying anonymous
allocation.

### Pulling a chat into another chat

A message can attach a bounded transcript using a
[`MessageChatAttachment`](/reference/chat#messagechatattachment). Its `resource`
identifies another chat, which MAY belong to a different session. The model
representation of the attachment identifies the chat in a way that hosts can
resolve regardless of which session owns it. When supplied, `endTurn` identifies
the last completed turn included in the transcript. When it is omitted, the host
pins the referenced chat's latest completed turn when accepting the message. This
lets clients attach chats whose turn identifiers they do not know. In either
case, the bound prevents later turns in the referenced chat from retroactively
changing the context of an already-sent message.

This is the standard way to pull a side-chat result back into its originating
chat. It is not limited to that UX: any chat may attach another chat from the
same or a different session. No merge or chat-to-chat messaging action occurs;
the attachment travels on the ordinary message in `chat/turnStarted`.

When accepting the message, the host MUST resolve the referenced chat's retained
transcript from its first turn through the supplied `endTurn`, or through the
latest completed turn when `endTurn` is omitted, and supply it as model context.
When provided, `endTurn` MUST reference a completed, retained turn. The host
MUST reject an attachment that references an unknown chat, specifies an
unknown, active, or non-retained `endTurn`. When the referenced chat has no
completed retained turns, the resolved transcript is empty and the host MUST
NOT reject the attachment on that basis. Chat attachments inside the referenced
transcript MUST remain references and MUST NOT be recursively expanded,
preventing cycles and unbounded context growth.

The attachment itself remains durable turn state. If the referenced chat is
later pruned, clients SHOULD continue rendering the stored `label` and treat
opening `resource` as best-effort. Pruning does not alter the model input that
the host already materialized when it accepted the containing message.

### Active chat

Once a chat exists and its session is `lifecycle: 'ready'`, the chat accepts turns. The wire shape mirrors the legacy single-chat session shape:

- The client dispatches `chat/turnStarted` to begin a turn.
- The server streams `chat/delta`, `chat/responsePart`, `chat/toolCallStart`, `chat/toolCallReady`, and related actions.
- The client dispatches `chat/toolCallConfirmed` / `chat/toolCallResultConfirmed` to approve or deny tool calls, or `chat/turnCancelled` to abort.
- The server dispatches `chat/turnComplete` or `chat/error` when the turn ends.
- The server MAY dispatch `chat/inputRequested` while a turn is active. Clients sync answer drafts with `chat/inputAnswerChanged` and finish the request with `chat/inputCompleted`.
- A `chat/error` appends an error response part before setting the turn state to `error`. When that part has `resumable: true`, a client may dispatch `chat/turnResume` to continue the same turn without another user message.

All actions dispatched on this channel travel on `ActionEnvelope`s whose `channel` is the chat URI. Action payloads do NOT carry their own chat URI — the channel comes from the envelope.

### Error recovery

An error ends the active turn with `TurnState.Error`, providing a simple
top-level signal for clients that do not implement resume. Its
`ErrorResponsePart` is the detailed source of truth: it contains `ErrorInfo`
and may declare the turn resumable with `resumable: true`. Clients decide whether and how to present
that affordance.

Errors MUST enter the response stream through `chat/error`; reducers ignore an
error part sent through generic `chat/responsePart`. This keeps appending the
detailed error and ending the turn as one atomic state transition.

Dispatching `chat/turnResume` reopens the same turn. The original message, turn
identifier, response parts, and usage are retained. A successful continuation
eventually finalizes that turn as complete. If continuation fails, `chat/error`
appends another error part. This preserves every failure in response-stream
order without creating a synthetic turn or message.

The server MUST validate and sequence the resume action before invoking the
provider. A rejected or stale resume MUST NOT produce side effects.

### Tool call metadata refinement

A host MAY open a tool call before all display metadata is known so clients can
render progress while the model is still generating parameters. In that case,
`chat/toolCallStart` carries the metadata available at discovery time and
`chat/toolCallReady` MAY provide a final `contributor` and `intention`.

Ready-time contributor refinement MUST NOT change execution ownership. A tool
that started as client-contributed remains owned by the same `clientId`, and a
tool that did not start as client-contributed cannot become client-owned at
Ready. Other refinements, such as discovering the MCP customization that owns a
server-executed tool, are allowed. Reducers ignore contributor changes that
would violate this invariant.

### Disposal

A chat is implicitly disposed when its owning session is disposed. The protocol does not currently expose a `disposeChat` command; chats live for the life of their session unless the server prunes them. When a chat is removed (whether explicitly or because its session was torn down), the server MUST update the session's `chats` catalog via `session/chatRemoved` so subscribers can release their per-chat subscriptions.

## Methods and events on this channel

This section lists wire methods that are interpreted in the context of a chat URI (`ahp-chat:/<uuid>`).

### Commands (`params.channel = "ahp-chat:/<uuid>"`)

| Method | Kind | Purpose |
|---|---|---|
| `fetchTurns` | request | Ask the host to load older historical turns into this chat state. |
| `completions` | request | Chat-scoped inline completions (e.g. user-message mentions). |

`createChat` is dispatched against the owning session URI (`params.channel = "ahp-session:/<sid>"`).

### Notifications (`params.channel = "ahp-chat:/<uuid>"`)

| Method | Kind | Meaning |
|---|---|---|
| `action` | server → client notification | Chat action envelope (`chat/*` action payloads). |
| `dispatchAction` | client → server notification | Dispatch client actions on this chat (`chat/turnStarted`, `chat/toolCallConfirmed`, ...). |
| `unsubscribe` | client → server notification | Stop receiving messages for this chat channel. |

## Server Validation of Client Actions

When the server receives a client-dispatched action on this channel, it MUST validate it before applying. Invalid actions MUST be echoed back with a `rejectionReason` on the `ActionEnvelope`. The validation rules mirror the legacy session validation table — substitute `chat/*` for `session/*`:

| Action                                     | Condition                                                                                                                  | Server Behavior                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Any action referencing a non-existent chat | Channel URI not found                                                                                                      | Server MUST silently ignore the action (no echo)                                                 |
| `chat/toolCallConfirmed`                   | Tool call not in `pending-confirmation` state                                                                              | Server MUST reject the action                                                                    |
| `chat/turnCancelled`                       | No active turn                                                                                                             | Server MUST reject the action                                                                    |
| `chat/turnResume`                          | An active turn exists, `turnId` is not the latest errored turn, or its final error part is not resumable                    | Server MUST reject the action |
| `chat/inputAnswerChanged`                  | No input request with matching `requestId`                                                                                 | Server SHOULD reject the action                                                                  |
| `chat/inputAnswerChanged`                  | `answer.state` requires a value but `answer.value` is absent, or `answer.value.kind` is missing the matching payload field | Server SHOULD reject the action                                                                  |
| `chat/inputCompleted`                      | No input request with matching `requestId`                                                                                 | Server SHOULD reject the action                                                                  |
| `chat/inputCompleted`                      | `response` is `'accept'` but required questions do not have submitted answers                                              | Server SHOULD reject the action                                                                  |
| `chat/pendingMessageRemoved`               | No pending message with matching `id` and `kind`                                                                           | Server SHOULD reject the action                                                                  |

## Pending Message Consumption

Pending messages live on the chat, not the session. The consumption rules mirror the legacy session behavior:

### Queued Messages

When a turn completes and `queuedMessages` is non-empty, the server SHOULD:

1. Dispatch `chat/pendingMessageRemoved` with `kind: 'queued'` for the first queued message.
2. Dispatch `chat/turnStarted` with the queued message's `message` and `queuedMessageId` set to the message's `id`.

When a queued message is added while the chat is idle (no active turn), the server SHOULD immediately consume it using the same two-step sequence.

### Steering Messages

When a turn is active and `steeringMessages` is non-empty, the server MAY consume steering messages at its discretion. To consume a steering message, the server:

1. Dispatches `chat/pendingMessageRemoved` with `kind: 'steering'`.
2. Injects the message content into the model context (the injection mechanism is opaque to the protocol).

Steering messages added while idle are silently stored and consumed when a turn becomes active.

## Actions

Refer to the [Chat Channel Reference](/reference/chat#actions) for the full per-action reference. All chat-scoped action envelopes carry `channel: "ahp-chat:/<uuid>"`.
