---
description: >-
  Migrate code that talks to or implements the Agent Host Protocol to the
  flattened SessionState model. Use when asked to upgrade an AHP
  client/server/binding and you see a `summary` sub-object on `SessionState`
  (e.g. `state.summary.title`, `session.summary.modifiedAt`), `model` / `agent`
  on `SessionState` / `SessionSummary` / `ChatState` / `ChatSummary`, the
  `session/modelChanged` or `session/agentChanged` actions, numeric
  `createdAt` / `modifiedAt`, or `model` / `agent` arguments to `createSession`
  / `createChat`.
---

# AHP Session-Metadata Migration

This skill helps you migrate a codebase that consumes (or implements) the Agent
Host Protocol to the **flattened `SessionState`** model. The change moves all
session metadata directly onto `SessionState`, makes `SessionSummary` a
root-channel-only catalog type, relocates model/agent **selection onto each
`Message`** (with a new per-chat `draft`), switches the summary timestamps to
ISO-8601 strings, and removes the `session/modelChanged` /
`session/agentChanged` actions. It is a single breaking step; there is no
transitional version.

If you are also coming from the pre-channels protocol, run the
**`ahp-channels-migration`** skill first — this skill assumes you are already on
the channel-based model.

The migration is mechanical but touches several shapes at once, so do it in
passes rather than file-by-file. The order below minimises the chance of
leaving the codebase half-broken. After each pass, run your typecheck/test loop.

## How to use this skill

1. Read the **Mental model** section so you understand what moved and why.
2. Work through the **Migration passes** in order. Each is independent enough
   to land as its own commit.
3. Use the **Grep cheat sheet** to find every site that needs updating.
4. When in doubt about a type's new shape, look it up in the AHP repo's
   `types/` (`channels-session/state.ts`, `channels-chat/state.ts`,
   `channels-session/actions.ts`, `channels-chat/actions.ts`) and the canonical
   reducers (`types/channels-session/reducer.ts`,
   `types/channels-chat/reducer.ts`), or in `docs/specification/`.

## Mental model

Previously, `SessionState` embedded a `summary: SessionSummary` sub-object, and
the same `SessionSummary` shape was both the live session metadata *and* the
catalog entry surfaced on the root channel. Model and agent selection was
session-scoped (`summary.model` / `summary.agent`, mutated by
`session/modelChanged` / `session/agentChanged`), with optional per-chat
overrides on `ChatState` / `ChatSummary`.

Now:

- **`SessionState` carries its metadata inline.** A new `SessionMetadata` base
  interface (`provider`, `title`, `status`, `activity?`, `project?`,
  `workingDirectory?`, `annotations?`) is **extended/inlined directly** onto
  `SessionState`. There is no `state.summary` anymore — read `state.title`,
  `state.status`, `state.activity`, etc. directly. `ChatState` already
  denormalized its summary fields this way; `SessionState` now matches.
- **`SessionSummary` is a root-only catalog type.** It still exists and is used
  by `listSessions`, `root/sessionAdded`, and `root/sessionSummaryChanged` to
  keep a cached session list in sync. It shares the `SessionMetadata` fields
  and additionally owns the identity/catalog-only fields: `resource`,
  `createdAt`, `modifiedAt`, and `changes`. It is **not** embedded in
  `SessionState`. The host updates `modifiedAt` at its own discretion and
  streams it via `root/sessionSummaryChanged`.
- **There is no session- or chat-level model/agent selection.** `model` and
  `agent` are removed from `SessionState`, `SessionSummary`, `ChatState`, and
  `ChatSummary`. Selection now lives on the **`Message`**: `Message.model?` and
  `Message.agent?`. A historic message records the selection actually used (so
  a client editing/resending it can retain that choice); when a message omits
  them, the agent host's default applies.
- **Chats have a `draft`.** `ChatState.draft?: Message` is the user's
  in-progress input (text + attachments + its model/agent). The new
  client-dispatchable `chat/draftChanged` action sets or clears it. Clients MAY
  periodically (debounced, **not** eager) sync their local input state into
  `draft`, and SHOULD initialize input UI for an existing chat from any present
  `draft`. `draft` is state-only and is **not** mirrored onto `ChatSummary`.
- **Timestamps are ISO-8601 strings.** `SessionSummary.createdAt` /
  `modifiedAt` changed from numbers (epoch millis) to ISO-8601 strings (e.g.
  `"2025-03-10T18:42:03.123Z"`), matching `ChatSummary.modifiedAt` and the
  `resource*` filesystem `mtime`/`ctime`.
- **Removed actions/params.** `session/modelChanged` (`SessionModelChangedAction`)
  and `session/agentChanged` (`SessionAgentChangedAction`) are gone. The
  `model` / `agent` parameters are removed from `createSession` and
  `createChat`.
- **The session reducer no longer stamps a timestamp.** Title/activity/read/
  archived/config actions mutate the flat `SessionState` fields and do **not**
  touch a session `modifiedAt` (there is none). The chat reducer continues to
  stamp `ChatState.modifiedAt`.

## Migration passes

Apply these in order. Examples are TypeScript (the reference client); Rust,
Kotlin, Swift, and Go consumers apply the same shape changes with their own
casing (`modified_at`, `ModifiedAt`, etc.).

### Pass 1 — Flatten `SessionState` reads and writes

`SessionState.summary` is gone. Every `state.summary.<field>` becomes
`state.<field>` for the metadata fields (`provider`, `title`, `status`,
`activity`, `project`, `workingDirectory`, `annotations`).

```diff
- const title = session.summary.title;
- const isInProgress = (session.summary.status & SessionStatus.InProgress) !== 0;
- const cwd = session.summary.workingDirectory;
+ const title = session.title;
+ const isInProgress = (session.status & SessionStatus.InProgress) !== 0;
+ const cwd = session.workingDirectory;
```

When constructing a `SessionState`, build it flat — do not nest a `summary`:

```diff
  const state: SessionState = {
-   summary: { resource, provider, title, status, createdAt, modifiedAt },
+   provider,
+   title,
+   status,
    lifecycle: SessionLifecycle.Creating,
    activeClients: [],
    chats: [],
  };
```

Note `resource`, `createdAt`, and `modifiedAt` are **not** on `SessionState` —
they live only on the root-channel `SessionSummary` (Pass 2).

### Pass 2 — Treat `SessionSummary` as a root-only catalog type

`SessionSummary` still exists, but only as the catalog entry on the root
channel. Keep using it for your cached session list fed by `listSessions`,
`root/sessionAdded`, and `root/sessionSummaryChanged`. Do **not** read it off
`SessionState`, and do **not** expect `model` / `agent` on it (Pass 4).

If you maintain a session-list cache that merges `root/sessionSummaryChanged`
deltas, drop the `model` / `agent` cases (those fields no longer exist on the
summary) and keep `modifiedAt` as a string (Pass 3):

```diff
  if (changes.title !== undefined) merged.title = changes.title;
  if (changes.status !== undefined) merged.status = changes.status;
  if (changes.modifiedAt !== undefined) merged.modifiedAt = changes.modifiedAt;
- if (changes.model !== undefined) merged.model = changes.model;
  if (changes.workingDirectory !== undefined) merged.workingDirectory = changes.workingDirectory;
```

### Pass 3 — `createdAt` / `modifiedAt` are ISO-8601 strings

`SessionSummary.createdAt` and `modifiedAt` are now strings. Update any code
that parses, formats, compares, or arithmetics them.

```diff
- summaries.sort((a, b) => b.modifiedAt - a.modifiedAt);            // numeric subtraction
+ summaries.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0));
```

ISO-8601 strings sort chronologically under lexicographic comparison, so a
plain string compare is correct for "most recently modified". To do date math,
parse with `Date.parse(...)` / your platform's ISO parser. Producers that
previously emitted `Date.now()` should emit `new Date().toISOString()`.

### Pass 4 — Remove session/chat model & agent selection

Delete every read/write of `model` / `agent` on `SessionState`,
`SessionSummary`, `ChatState`, and `ChatSummary`, and remove all use of the
`session/modelChanged` and `session/agentChanged` actions.

- **Dispatching a model/agent change**: there is no session-level selection to
  change. The selection is whatever the next `Message` carries (Pass 5), so a
  model picker simply updates the chat's `draft` (Pass 6) or sets `model` /
  `agent` on the message you are about to send.
- **Reducers/handlers**: remove the `SessionModelChanged` / `SessionAgentChanged`
  cases. Remove `model` / `agent` from any `ChatSummary` partial-update merge
  (e.g. the `session/chatUpdated` handler).

```diff
- store.dispatch(session, { type: 'session/modelChanged', model: { id: 'gpt-4o' } });
+ // Keep the picked model in your local input state and attach it to the
+ // outgoing message (Pass 5), or sync it into the chat draft (Pass 6).
```

### Pass 5 — Put model/agent on the `Message`

`Message` gained `model?: ModelSelection` and `agent?: AgentSelection`. Set
them when you send a turn or steering/queued message, and read them back from
historic messages when editing/resending.

```diff
  const message: Message = {
    text,
    origin: { kind: MessageKind.User },
    attachments,
+   model: selectedModel,   // omit to use the agent host's default
+   agent: selectedAgent,   // omit for no custom agent
  };
  store.dispatch(chat, { type: 'chat/turnStarted', turnId, message });
```

When rendering an existing turn, the model/agent it ran with is on
`turn.message.model` / `turn.message.agent` (absent ⇒ host default).

### Pass 6 — Add the per-chat `draft` and `chat/draftChanged`

`ChatState.draft?: Message` holds the user's in-progress input. Wire two
directions:

- **Initialize input UI from `draft`.** When you open/show a chat, seed your
  composer (text, attachments, model/agent) from `chat.draft` if present.
- **Sync local input into `draft`.** Periodically dispatch `chat/draftChanged`
  with the current composer contents. **Debounce** — eager per-keystroke sync
  is not required. Dispatch with no `draft` to clear it once the message is
  sent.

```ts
// Debounced (e.g. on idle/blur), not on every keystroke:
store.dispatch(chat, {
  type: 'chat/draftChanged',
  draft: { text, origin: { kind: MessageKind.User }, attachments, model, agent },
});

// Clear after sending:
store.dispatch(chat, { type: 'chat/draftChanged' });
```

If you maintain a reducer, the `chat/draftChanged` case is a plain set/clear
(`{ ...state, draft: action.draft }`) and does **not** stamp `modifiedAt`.

### Pass 7 — Drop `model` / `agent` from `createSession` / `createChat`

These command params no longer accept `model` / `agent`. Convey an initial
selection on the first message instead.

```diff
  await client.createSession({
    channel: sessionUri,
    provider: 'copilot',
-   model: { id: 'gpt-4o' },
-   agent: { uri: agentUri },
    workingDirectory,
  });
```

```diff
  await client.createChat({
    channel: sessionUri,
    chat: chatUri,
-   model: { id: 'gpt-4o' },
-   agent: { uri: agentUri },
-   initialMessage: { text, origin: { kind: MessageKind.User } },
+   initialMessage: { text, origin: { kind: MessageKind.User }, model, agent },
  });
```

### Pass 8 — Update your reducer (if you maintain one)

Mirror the canonical reducers in `types/channels-session/reducer.ts` and
`types/channels-chat/reducer.ts`:

- `session/titleChanged` → set `state.title`; **no** `modifiedAt` stamp.
- `session/isReadChanged` / `session/isArchivedChanged` → flip the flag on
  `state.status` via your `withStatusFlag` helper.
- `session/activityChanged` → set `state.activity`.
- `session/configChanged` → merge/replace `state.config.values`; **no**
  `modifiedAt` stamp.
- Remove the `session/modelChanged` and `session/agentChanged` cases.
- Remove any helper that stamped the session summary's `modifiedAt` (the
  session reducer no longer owns a timestamp). Keep your chat reducer's own
  `modifiedAt` stamping and its injectable "now" seam.
- Add a `chat/draftChanged` case: `state.draft = action.draft` (set or clear).

The shared conformance fixtures in `types/test-cases/reducers/` already encode
the new shapes (including `223-chat-draftchanged-sets-draft` and
`224-chat-draftchanged-clears-draft`); run them against your reducer.

## Grep cheat sheet

Run these searches in your codebase. Each pattern is a strong signal that a
migration site still needs attention.

| Pattern | What it indicates |
|---------|-------------------|
| `.summary.` near a session value (`session.summary`, `state.summary`, `summary.title`, `summary.status`, `summary.workingDirectory`) | Reading metadata off the removed `SessionState.summary` (Pass 1) |
| `summary:` inside a `SessionState` literal | Constructing the old nested shape (Pass 1) |
| `summary.modifiedAt` / `summary.createdAt` used in arithmetic or `-`/`<`/`>` numeric compare | Numeric timestamp assumptions (Pass 3) |
| `createdAt:` / `modifiedAt:` set to a number, `Date.now()` into a summary | Old numeric timestamps (Pass 3) |
| `session/modelChanged`, `session/agentChanged`, `SessionModelChangedAction`, `SessionAgentChangedAction` | Removed actions (Pass 4) |
| `.model` / `.agent` on a session or chat **summary/state** value | Removed selection fields (Pass 4) |
| `summary.model`, `summary.agent`, `changes.model`, `changes.agent` | Removed summary fields / `root/sessionSummaryChanged` deltas (Pass 4) |
| `createSession(` / `CreateSessionParams` with `model:` or `agent:` | Removed command params (Pass 7) |
| `createChat(` / `CreateChatParams` with `model:` or `agent:` | Removed command params (Pass 7) |
| `chat/draftChanged`, `ChatDraftChangedAction`, `ChatState.draft` | New draft surface — confirm you sync/initialize it (Pass 6) |
| `Message` constructed for a turn without `model` / `agent` where a picker exists | Selection not carried on the message (Pass 5) |

## Verification checklist

After the migration, your code should:

- [ ] Read session metadata from `SessionState` directly (`state.title`,
      `state.status`, `state.activity`, `state.workingDirectory`, …) — no
      `state.summary`.
- [ ] Build `SessionState` flat, without a nested `summary`, and without
      `model` / `agent` / `createdAt` / `modifiedAt` on it.
- [ ] Use `SessionSummary` only as the root-channel catalog entry
      (`listSessions`, `root/sessionAdded`, `root/sessionSummaryChanged`).
- [ ] Treat `SessionSummary.createdAt` / `modifiedAt` as ISO-8601 strings
      everywhere they are parsed, formatted, sorted, or compared.
- [ ] Carry model/agent selection on `Message.model` / `Message.agent`; read a
      historic turn's selection from `turn.message`.
- [ ] No `session/modelChanged` / `session/agentChanged` dispatch or handling,
      and no `model` / `agent` on `SessionState` / `SessionSummary` /
      `ChatState` / `ChatSummary`.
- [ ] No `model` / `agent` arguments to `createSession` / `createChat`.
- [ ] Initialize chat input UI from `ChatState.draft` and (debounced) sync the
      composer back via `chat/draftChanged`, clearing it on send.
- [ ] If you maintain a reducer: the session reducer no longer stamps a
      timestamp, and a `chat/draftChanged` case sets/clears `draft`.

When all these are true, your consumer is on the flattened-`SessionState` model.

## References

For the full normative description, consult these documents in the
`microsoft/agent-host-protocol` repository:

- `docs/guide/state-model.md` — `SessionState`, `SessionSummary`, `Message`,
  and the session/chat metadata relationship
- `docs/specification/session-channel.md` — session channel state, the
  chat-aggregation rules for the root-channel summary, client-action validation
- `docs/specification/chat-channel.md` — chat state, message-level model/agent
  selection, and the `draft` / `chat/draftChanged` behavior
- `docs/specification/root-channel.md` — `listSessions`, `root/sessionAdded`,
  `root/sessionSummaryChanged`, and the ISO-8601 timestamp examples
- `types/channels-session/state.ts`, `types/channels-chat/state.ts` —
  `SessionMetadata`, `SessionState`, `SessionSummary`, `ChatState`,
  `ChatSummary`, `Message` source-of-truth definitions
- `types/channels-session/reducer.ts`, `types/channels-chat/reducer.ts` —
  canonical reducer behavior to mirror
- `types/test-cases/reducers/` — shared conformance fixtures, including the
  `chat/draftChanged` cases
