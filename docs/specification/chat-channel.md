# Chat Channel

A chat channel carries the full state of a single conversation thread: turns, streaming responses, tool calls, pending messages, and input requests. A chat always belongs to a [session](./session-channel); a session may contain one or many chats. Chats are independently subscribable so a client can observe a subset of activity without paying the bandwidth cost of every chat in the session.

## URI

```
ahp-chat:/<uuid>
```

The path is a server-unique identifier (typically a UUID) allocated by the server when the chat is created. The owning session URI is **not** encoded in the chat URI — the relationship is expressed via the session's [`chats`](/reference/session#sessionstate) catalog and each chat's [`origin`](/reference/chat#chatorigin).

Multiple chat channels may be active simultaneously. Clients subscribe to each chat whose state they want to track.

## State

Subscribers receive a [`ChatState`](/reference/chat#chatstate) snapshot. `ChatState` **denormalizes** the [`ChatSummary`](/reference/chat#chatsummary) fields directly onto itself (`resource`, `title`, `status`, `activity`, `modifiedAt`, `model`, `agent`, `origin`, `workingDirectory`) and adds the conversation contents (history of completed turns, the active turn if any, pending messages, outstanding input requests). Producers MUST keep the chat's `ChatSummary` in the session catalog consistent with these inlined fields — typically by dispatching a matching [`session/chatUpdated`](/reference/session#actions) whenever any summary field on the chat changes. Refer to the [State Model guide](/guide/state-model) for a structural overview.

### Per-chat working directory

`ChatState.workingDirectory` (and its mirror on [`ChatSummary`](/reference/chat#chatsummary)) is **optional**. When absent, the chat inherits the session's [`workingDirectory`](/reference/session#sessionsummary). Hosts MAY set a per-chat working directory to give individual chats their own filesystem context — for example, allocating a separate git worktree per chat so multiple chats in the same session can make independent edits that the orchestrating chat later merges back. The session-level `workingDirectory` is then the default/primary location for chats that do not override it.

## Relationship to the session channel

- A chat's [`ChatSummary`](/reference/chat#chatsummary) appears in the session's [`SessionState.chats`](/reference/session#sessionstate) catalog. The session reducer keeps that catalog in sync with the underlying chat lifecycle.
- The session may also expose [`defaultChat`](/reference/session#sessionstate) as a UI routing hint for input that is addressed to the session as a whole. This is advisory only — chats remain equal peers at the protocol level.
- Session-level fields such as [`status`](/reference/session#sessionsummary), `activity`, and `modifiedAt` are aggregates derived from the session's chats. See the [Session Channel specification](./session-channel#chat-aggregation) for the derivation rules.

## Lifecycle

```
1. Client subscribes to the owning session URI (ahp-session:/<sid>)
2. Client (or the server, via a tool call or fork) creates a chat with createChat
3. Server allocates a chat URI (ahp-chat:/<cid>) and mutates the session's chats catalog
4. Client subscribes to the chat URI to receive its ChatState snapshot
5. Server streams chat actions over the chat channel until the chat (or its session) is disposed
```

### Creation

[`createChat`](/reference/chat#createchat) is a JSON-RPC request. Callers identify the owning session via the request's `channel` parameter (`ahp-session:/<sid>`) and MAY supply:

- an `initialMessage` to start the first turn immediately,
- per-chat `agent` / `model` / `config` overrides that win over the session defaults, and
- a `source` of type [`ChatForkSource`](/reference/chat#chatforksource) to fork from an existing chat at a specific turn.

The server allocates the chat URI and adds the chat to the session's catalog (`session/chatAdded` on the session channel) before returning.

### Origin

Each chat advertises how it came into existence via [`ChatOrigin`](/reference/chat#chatorigin):

| Kind | Meaning |
|---|---|
| `user` | User created the chat explicitly (e.g. via the host UI). |
| `fork` | Forked from an existing chat at a specific turn — payload references the source chat URI and turn id. |
| `tool` | Spawned by a tool call running in another chat — payload references the source chat URI and tool call id (e.g. a sub-agent delegation). |

Clients MAY use the origin to render contextual UI (parent indicators, fork markers, "spawned by tool" badges), but origin is **not** a hierarchy — every chat is equally addressable.

### Active chat

Once a chat exists and its session is `lifecycle: 'ready'`, the chat accepts turns. The wire shape mirrors the legacy single-chat session shape:

- The client dispatches `chat/turnStarted` to begin a turn.
- The server streams `chat/delta`, `chat/responsePart`, `chat/toolCallStart`, `chat/toolCallReady`, and related actions.
- The client dispatches `chat/toolCallConfirmed` / `chat/toolCallResultConfirmed` to approve or deny tool calls, or `chat/turnCancelled` to abort.
- The server dispatches `chat/turnComplete` or `chat/error` when the turn ends.
- The server MAY dispatch `chat/inputRequested` while a turn is active. Clients sync answer drafts with `chat/inputAnswerChanged` and finish the request with `chat/inputCompleted`.

All actions dispatched on this channel travel on `ActionEnvelope`s whose `channel` is the chat URI. Action payloads do NOT carry their own chat URI — the channel comes from the envelope.

### Disposal

A chat is implicitly disposed when its owning session is disposed. The protocol does not currently expose a `disposeChat` command; chats live for the life of their session unless the server prunes them. When a chat is removed (whether explicitly or because its session was torn down), the server MUST update the session's `chats` catalog via `session/chatRemoved` so subscribers can release their per-chat subscriptions.

## Methods and events on this channel

This section lists wire methods that are interpreted in the context of a chat URI (`ahp-chat:/<uuid>`).

### Commands (`params.channel = "ahp-chat:/<uuid>"`)

| Method | Kind | Purpose |
|---|---|---|
| `fetchTurns` | request | Page historical turns for this chat. |
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
