# Proposal: Multiple Chats per Session in AHP

Status: Draft for discussion (not a protocol change yet)

## Scope

This proposal covers **multiple chats per session** with shared context — a
session becomes a coordination scope, and chats are independently subscribable
conversation streams over that scope.

The proposal deliberately does **not** model agent hierarchies (lead/worker,
planner/executor, etc.) or session-level nesting. Those are host
implementation concerns that real systems express in many different ways; the
protocol stays at the UI-interoperability layer (the "DAP / LSP for agent
hosts" framing). Where richer coordination — work items, operations,
assignments — eventually belongs in AHP is sketched in §12 as a separate
future axis; this proposal is designed to compose with it without further
breaking changes.

## 1. Motivation

The framing for this proposal is that **a session is a coordination scope, and
chats are the conversation streams over that scope.** A session owns the
shared context (workspace, project, model/agent defaults, config,
customizations, server tools) within which work happens; chats are
independently subscribable conversations that happen *within* that scope.

This is the AHP-style framing — the protocol exposes primitives (a scope and a
stream of conversations over it), not a topology (lead/worker, planner/executor,
manager/reviewer). Whatever organisational structure a host wants to layer on
top is a host concern, expressed through host-specific metadata; the protocol
itself doesn't model agent hierarchies. (See §12 for the natural future axis
of coordination primitives such as work items / operations.)

Today an AHP **session is exactly one linear chat** — the session *is* the
conversation stream, with no separation between scope and stream. `SessionState`
holds `turns: Turn[]` plus a single optional `activeTurn`; there is no
threading or grouping key. We want one session to hold **multiple chats** that
deliver five capabilities:

1. **Shared context** — chats under a session share workspace, files, default
   model/agent, config, and server tools.
2. **Branching/forking** — start a new chat seeded from a point in another
   chat's history to explore alternatives.
3. **Concurrent turns** — multiple chats can stream at the same time.
4. **UI grouping** — related chats are organized under one parent.
5. **Task decomposition** — break a larger feature into subtasks, then run each
   subtask as an agent or subagent under the same session so the work stays
   grouped and visible.

What already exists: **session-level** forking via
`SessionForkSource { session, turnId }` + `createSession`. So branching exists,
but only at whole-session granularity, and sessions share nothing.

## 2. Chosen architecture: session as a container of chat channels

Promote the session from "a chat" to "a thin container of shared context +
a catalog of chats." Introduce a new **`ahp-chat:` channel** that holds the
linear conversation state a session has today.

```
ahp-root://                 ← catalog of sessions (unchanged)
  └─ ahp-session:/<sid>      ← shared context + catalog of chats (NEW role)
       ├─ ahp-chat:/<cid-1>  ← turns + activeTurn (today's session state)
       ├─ ahp-chat:/<cid-2>
       └─ ...
```

This mirrors the existing **root → session** relationship one level down as
**session → chat**, which is the idiomatic AHP pattern: each independently
lazy-loadable, concurrently streaming state tree is its own subscribable
channel.

## 3. State split: what is session-level vs chat-level

Default-plus-override model.

**Session-level (shared context):**
- `provider`, project / working directory
- **default** `model`, **default** `agent`
- resolved config schema + default values (`config`)
- `serverTools`
- `customizations`
- `activeClient` — **session-level / shared** (resolved Q6). The attached client
  contributes workspace-scoped tools and customizations that apply to every chat.
- a **catalog** of chats on `SessionState` (NOT on `SessionSummary` — see §4)
- a **`defaultChat?: URI`** on `SessionState`: the chat that receives input when
  the user addresses the session without selecting a specific chat. This is a UI
  *routing* hint, not a hierarchy marker — chats remain equal peers at the
  protocol level. Hosts MAY change it over the session's lifetime.
- aggregate `summary` (title, status, activity, modifiedAt) derived across chats

**Chat-level (per `ahp-chat:` state):**
- `turns: Turn[]`, `activeTurn?: ActiveTurn`
- `steeringMessage?`, `queuedMessages?`
- `inputRequests?`
- per-chat `summary`: title, status, activity, modifiedAt, isRead/isArchived
- **optional** `model` / `agent` / config overrides
- **`origin?`** — flexible provenance union (user-created / forked / created by
  an operation), see §5

## 4. Chat catalog lives on the session state

The chat catalog is a property of the **full session state** (loaded on
subscribe to `ahp-session:/<sid>`), not of the lightweight `SessionSummary`
shown in session lists:

- `SessionState.chats: ChatSummary[]` — a lightweight catalog of the session's
  chats. Each `ChatSummary` advertises the chat's URI plus its per-chat
  `title`/`status`/`activity`/`modifiedAt`. Full per-chat state (turns,
  `activeTurn`) is loaded lazily by subscribing to the `ahp-chat:` channel.
- Catalog changes (a chat added or removed, or a chat summary changing)
  propagate through the **session state** update path — there is a single
  source of truth and a single set of actions that mutate it.
- The lightweight `SessionSummary` returned by `listSessions` carries only the
  rollups needed by the session-list view (title, status, activity, timestamps)
  — chats are not enumerated there. A client that wants to display chats
  subscribes to the session.
- Session-level `status`/`activity`/`modifiedAt` rollups *are* still derived
  across chats and exposed on `SessionSummary` (Q3) so the session list reflects
  per-session activity without needing the full catalog.
- Chat creation is **bi-directional**: a chat can be **user-initiated** via a
  client command (`createChat`, channel = the session URI) or
  **agent/server-initiated** (the server adds it to the catalog, surfaced via
  the next session state update). The protocol does not force all chats to
  originate from tool calls.

**Coordination with issue #187.** Issue
[#187](https://github.com/microsoft/agent-host-protocol/issues/187) splits
`SessionSummary` out of `SessionState` so each has its own update path. Placing
`chats[]` directly on `SessionState` from the start (rather than via
`SessionSummary`) avoids re-creating the dual-update problem #187 is fixing,
and means this proposal composes cleanly with that refactor regardless of which
lands first.

## 5. Branching

Keep **both** fork operations; they are distinct:
- `SessionForkSource { session, turnId }` — fork into a new **session/container** (exists).
- **`ChatForkSource { chat: URI, turnId: string }`** — fork into a new **chat**,
  via a new `createChat` command. Chat forks are **intra-session only** (Q8): the
  source chat must belong to the same session.

### Chat provenance: an `origin` union, not a single `forkedFrom`

Rather than modelling a single fork-specific field, every chat carries an
optional **`origin`** that captures how it came into existence. A discriminated
union keeps the door open to future provenance kinds (e.g. operations) without
further breaking changes:

```ts
type ChatOrigin =
  | { kind: 'userCreated' }
  | { kind: 'forked'; sourceChat: URI; sourceTurnId: string }
  | { kind: 'createdByOperation'; operationId: string };

interface ChatSummary {
  // ...other fields...
  origin?: ChatOrigin;
}
```

This proposal initially populates the **`userCreated`** and **`forked`**
variants; **`createdByOperation`** is reserved for the future coordination-primitives
work referenced in §12 — declaring the shape now avoids a breaking change when
operations land. The field is **purely informational** (lineage / provenance);
it does not imply hierarchy, delegation, or supervision and is not used for
routing or aggregation. A separate UI-grouping parent, if needed later, would
live in a separate field.

### Why both operations are needed

**Session-level fork** creates an entirely new container — new shared context,
new chat catalog, new workspace scope. Use this when you want full isolation.

**Chat-level fork** creates a new conversation thread inside the same session —
same shared context, same workspace, same team. Use this when you want to explore
alternatives while staying coordinated.

### Examples

**Example 1: Exploring alternative implementations (chat fork)**

You're implementing a caching feature. The lead chat has established:
- workspace context (the repo, files, config)
- decisions made (Redis as the cache backend)
- shared understanding (API contracts)

At turn 5, you want to explore two approaches: write-through vs write-behind.

→ **Chat fork from turn 5** twice:
- Chat A explores write-through, shares the workspace, can see the same files
- Chat B explores write-behind, same shared context

Both stay in the same session. You compare results, pick one, and continue.

If you used a **session fork** here, each would get its own isolated workspace —
they couldn't share the Redis decision or coordinate on the same files.

**Example 2: Task decomposition with subagents (chat fork)**

You ask: "Implement user authentication with OAuth, tests, and docs."

The lead chat breaks this into subtasks and spawns three chats:
- Chat: "auth-impl" — implements OAuth flow
- Chat: "auth-tests" — writes test cases
- Chat: "auth-docs" — writes documentation

All three share the session's workspace and can see each other's file changes.
When auth-impl finishes, auth-tests can immediately test those files.

If you used **session forks**, each would be isolated — auth-tests couldn't see
auth-impl's files without explicit coordination.

**Example 3: Starting fresh with a different approach (session fork)**

You've been working on a feature but realize the whole approach is wrong — you
want to start over with a different tech stack, different workspace, maybe even
a different model.

→ **Session fork**: creates a new container with its own context. The old session
stays intact for reference; the new session starts fresh.

A **chat fork** wouldn't help here — you'd still be in the same shared context
with the same (wrong) decisions baked in.

**Example 4: Sharing a starting point across teams (session fork)**

You have a well-tuned session with good context: project setup, coding standards,
established patterns. You want to give a colleague their own workspace based on
this starting point.

→ **Session fork**: they get their own session container, their own chats, their
own workspace — but seeded from your established context.

A **chat fork** would put their work inside *your* session, which isn't what you
want.

### Summary

| Scenario | Use |
|---|---|
| Explore alternatives on the same problem | Chat fork |
| Decompose a task into parallel subtasks | Chat fork |
| Start fresh with different context/approach | Session fork |
| Clone a setup for someone else | Session fork |
| Keep coordination and shared files | Chat fork |
| Need full isolation | Session fork |
## 6. Concurrency

Each chat is its own channel with its own write-ahead/serverSeq stream and its
own `activeTurn`. Concurrent turns across chats reconcile independently — no
special handling needed beyond the existing per-channel reconciliation model.

## 7. Backward compatibility: breaking change

Per the Q4 decision (§9), multi-chat is introduced as a **breaking change**
rather than via deprecated projection shims:

- **Remove** `SessionState.turns` and `SessionState.activeTurn`. Turn data lives
  only on the chat channel (`ahp-chat:/<cid>`). An earlier draft kept these as
  deprecated properties projecting a "primary chat", but aggregating turns
  across chats while handling multiple simultaneous active turns produced
  confusing semantics with no clean rule, so they are dropped.
- Per-turn input/queue state (`steeringMessage`, `queuedMessages`,
  `inputRequests`) likewise moves to the chat channel.
- Clients update to subscribe to `ahp-chat:` channels for all conversation
  state. There is no "primary chat" — all chats are equal peers (Q2).
- `SessionSummary.status` is an explicit **aggregate** over chats (see Q3):
  `InputNeeded` if any chat needs input → else `InProgress` if any chat active →
  else `Idle`. `ChatSummary.status` is authoritative per conversation. The
  `chats[]` catalog itself lives on `SessionState`, not `SessionSummary`, so the
  session list view stays cheap.
- Chat-unaware clients are handled by a whole-protocol SemVer version bump at
  `initialize` (Q10) — no per-feature capability flags. A multi-chat server MAY
  also speak the old version with a single-chat projection, or return `-32005`.

## 8. Protocol surface this touches

`ahp-chat:` is a first-class channel, parallel to session/terminal/changeset:
URI scheme docs, subscription snapshots, reconnect/replay, command map, action
union + reducers (+ tests), generated schema, the chat catalog on the session
**state** (plus `defaultChat?` and per-chat `origin?`), auth
scoping, `message-checks.ts` (every params carries `channel`), docs page, and a
root/session→chat relationship doc. CHANGELOGs: root + every client (a `types/`
change ripples to all).

## 9. Design questions

### Resolved

- **Q1. Chat URI shape.** Opaque `ahp-chat:/<cid>`, matching the existing
  flat/opaque pattern used by sessions, terminals, and changesets. The session
  it belongs to is discovered via the catalog, not encoded in the URI.
- **Q2. Chat catalog.** Lives as `chats: ChatSummary[]` on **`SessionState`**
  (loaded on subscribe), not on `SessionSummary`. Session-list views stay cheap;
  the full catalog arrives when a client subscribes to a session. There is no
  separate `listChats` command. Chats are equal peers at the protocol level
  (see Q11 for the UI input-routing hint).
- **Q3. Session aggregate rules.** Session-level `status`, `activity`, and
  `modifiedAt` are first-class aggregates derived from the chats:
  - `status`: `InputNeeded` if any chat needs input, else `InProgress` if any
    chat is in progress, else `Idle`.
  - `activity`: taken from the most-recently-active chat.
  - `modifiedAt`: max of all chats' `modifiedAt`.
- **Q4. Deprecated turn projection.** Resolved as a **breaking change**:
  `SessionState.turns` and `SessionState.activeTurn` are **removed**. Turn data
  lives only on the chat channel (`ahp-chat:/<cid>`). Aggregating turns across
  chats while handling multiple simultaneous active turns produced confusing
  semantics, so clients update to subscribe to chat channels instead.
- **Q5. Chat vs session config precedence.** Inheritance with chat override.
  A chat MAY carry its own `model` / `agent` / config values; when present they
  override the session value. When absent, the chat inherits the session value.
  This supports "each teammate runs a different model" while keeping a session
  default.

- **Q6. `activeClient` scope.** Session-level / shared. The attached client's
  tools and customizations are workspace-scoped, so all chats use the same
  active client. Interactive routing (which client answers a given chat's
  prompt) is handled separately and does not require a per-chat `activeClient`.

- **Q8. Cross-session chat forks.** Not allowed — chat forks are
  **intra-session only**. A chat always belongs to exactly one session, and
  forking a chat stays within that session's shared context. Cross-session
  branching is served by **session fork** (clone the container) instead.

- **Q9. `fetchTurns` / `completions` target.** Both target the **chat channel**
  (`ahp-chat:/<cid>`). `fetchTurns` is forced there since turns live only on the
  chat (Q4); `completions` follows for consistency and to allow future
  chat-context-aware completions, while the server still resolves workspace
  sources via the chat's parent session.

- **Q10. Chat-unaware clients.** Handled by a whole-protocol **SemVer version
  bump** (currently `0.3.0` → `0.4.0`), matching AHP's existing `initialize`
  negotiation. A chat-unaware client offers only the old version; a multi-chat
  server either also speaks that version (and MAY present a single-chat
  projection) or returns `-32005` (`UnsupportedProtocolVersion`). Keeping
  old-version support is a server implementation choice, not a protocol
  requirement.

  **Why not "capabilities first, then required" (the documented convention).**
  [`versioning.md`](../../docs/specification/versioning.md) states new behavior
  *generally* lands as an additive, capability-gated feature first and is only
  promoted to a required (breaking) baseline later. We deliberately skip the
  capability-gated stage for this feature, for two reasons:

  1. **Multi-chat is removal-shaped, not additive.** Its end-state *removes*
     `turns`/`activeTurn` from `SessionState`. A capability can gate a new
     *addition* (an unknown channel an old client ignores), but it cannot gate a
     *removal* — so the gated stage is forced to keep a **single-chat
     projection**. That projection reintroduces the "primary chat" concept we
     deliberately dropped in Q2 (one chat made special to mirror), and forces
     every host to maintain two parallel representations of the same
     conversation that must never disagree. For a feature whose core invariant
     is "chats are equal peers," a compatibility mode premised on "one chat is
     special" is semantically incoherent, not merely inconvenient.
  2. **Pre-1.0 is the cheapest moment to break.** The protocol is at `0.3.0`;
     `versioning.md` makes breaking changes expected and permits them on a
     **MINOR** bump while `MAJOR` is `0`. There is no stability promise yet and
     the implementor set is small, so a one-time coordinated move to `0.4.0`
     confines the migration cost to a single upgrade boundary instead of baking
     a dual read path into every future host.

  Note this is an *exception*, not a rejection of the convention: it is justified
  by the removal-shaped nature of the change and the pre-1.0 window, not by the
  feature's size. (If anything, a large/novel feature argues *for* gating; the
  deciding factors here are the data-model removal and the pre-1.0 status.)

- **Q11. Default input target.** `SessionState` carries an optional
  `defaultChat?: URI` indicating which chat receives input when the user
  addresses the session without picking a chat. This is a **UI routing hint**,
  not a hierarchy marker — chats remain equal peers and the field is purely
  about resolving "where does this message go?" when the addressee is
  ambiguous. Hosts MAY change it over the session's lifetime as work moves
  between chats. (Surveyed multi-agent systems — Gas Town, Claude Agent Teams,
  AutoGen, LangGraph, CrewAI, MetaGPT, ChatDev — uniformly designate a lead
  chat for inbound user messages; `defaultChat` standardises that routing
  without introducing a privileged "primary" in state semantics.)

- **Q12. Chat provenance shape.** Each chat carries an optional
  `origin?: ChatOrigin` discriminated union (`'userCreated'`, `'forked'`,
  `'createdByOperation'`) rather than a single fork-specific `forkedFrom`
  field. We initially populate `userCreated` and `forked`; `createdByOperation`
  is reserved for a future coordination-primitives proposal (see §12).
  Declaring the union shape now lets later provenance kinds land additively
  without further breaking changes. `origin` is **informational** — it does not
  imply hierarchy, delegation, or routing semantics, and is not used by
  aggregation.

### What actually breaks for old clients

Multi-chat is breaking, but the blast radius is contained to **conversation /
turn reading**. Session enumeration, titles, status, activity, and config all
remain structurally compatible.

| Decision | Breaks old clients? | Why |
|---|---|---|
| Q1 — `ahp-chat:` channel | No | Additive; old clients never subscribe. |
| Q2 — `chats[]` on `SessionState` | No | Additive field on the subscribed state; unknown fields ignored. |
| Q3 — session aggregate status/activity/modifiedAt | No | Same field shapes; only server derivation changes. Keeps the session list working. |
| **Q4 — remove `turns`/`activeTurn`** | **Yes** | The one real break: session-level turn data is gone. |
| Q5 — chat config inheritance | No | Session still carries its own model/agent; overrides live on the chat. |
| Q6 — `activeClient` session-level | No | Unchanged from today. |
| Q8 — intra-session chat forks only | No | Constraint on a new operation. |
| Q9 — `fetchTurns`/`completions` → chat | Same break as Q4 | Not a new break; turns simply no longer live on the session. |
| Q11 — `defaultChat?` on `SessionState` | No | Additive optional field; absence means "no default". |
| Q12 — `origin?` union on `ChatSummary` | No | Additive optional field; new chat type so no field replacement. |

The single lever for backward compatibility is **Q4**. The only way to keep old
clients fully working would be to retain `turns`/`activeTurn` as a single-chat
projection — the capability-gated path rejected above for reintroducing a
"primary chat" and a permanent dual read path.

### Open implementation questions (to resolve before types land)

The §9 decisions pin down the *type shapes*. These questions remain open and
need answers (or explicit "out-of-scope") statements before the implementing PR:

- **Cross-chat write coordination.** Multiple concurrent chats share the
  session's workspace. The protocol provides no advisory locks,
  read-after-write barriers, or write-serialization primitives, so two chats
  editing the same file race. Either we add a coordination primitive, or we
  explicitly downgrade the "shared workspace" claim to "shared *reads*; writes
  are best-effort and harness-coordinated" — and update the motivating examples
  to reflect that.
- **Session-disposal lifecycle.** What happens to active chats — and their
  in-flight `activeTurn`s, pending `inputRequests`, and `queuedMessages` — when
  the parent session is disposed? Cascade-cancel? Reject-while-busy? Default
  semantics need to be normative.
- **Interactive routing under concurrency.** With N chats running, multiple
  permission prompts / elicitations can be raised simultaneously to a single
  session-level `activeClient`. The protocol needs at least a defined ordering
  (FIFO? priority?) and a UX-friendly batching/queue story.
- **Aggregation bounds.** Q3 defines session-level aggregation rules over a
  session's chats. With many chats the summary stream churns continuously and
  `status === 'InProgress'` becomes uninformative. Worth considering an
  `activeChildCount` (or similar) and/or a debounce/coalesce rule on summary
  emission instead of cascading every per-chat change.
- **Session-wide turn history.** `fetchTurns` now targets a single chat
  (Q9). The "show me everything that happened in this session, interleaved"
  use case becomes `listChats` + N × `fetchTurns` + client-side merge. We
  should decide whether a session-scoped overload that returns time-merged
  turns is worth adding, or whether the per-chat-only model is acceptable.

## 10. Validation against Claude "Agent Teams"

Reference: https://code.claude.com/docs/en/agent-teams

Claude's harness has two distinct multi-agent features:
- **Subagents** — own context, results return to the caller. AHP **already models
  this**: `ToolResultSubagentContent.resource` is a **session URI**, subscribable
  for full state. So in AHP today, "another agent" = "another session" referenced
  from a tool-call result.
- **Agent teams** — a **lead** session + independent **teammates** (each a full
  Claude Code instance, own context window), a shared **task list**, and a
  **mailbox** for direct agent-to-agent messaging. This is the use case to match.

### Natural mapping
`team → session (container)`, `lead → one designated chat`, `teammate → chat`.
Each teammate's conversation = one `ahp-chat:` channel. Shared
workspace/project/MCP/skills = session-level shared context. (Note: AHP itself
has no built-in lead/teammate role — "lead" here is a harness-level convention
layered on equal-peer chats; an explicit role field is a gap, see below.)

### What the proposal already covers
| Agent-teams concept | Covered by proposal |
|---|---|
| Teammates run concurrently, each own context | ✅ each chat is its own channel with its own `activeTurn` |
| Shared workspace / project / config / tools | ✅ session-level shared context |
| Team = container of members with a catalog | ✅ session + chat catalog (`SessionState.chats`) |
| Per-teammate model / agent type | ✅ per-chat model/agent override |
| "Talk to a teammate directly" | ✅ dispatch `session/turnStarted` to that chat's channel |
| Spawn / shut down a teammate | ⚠️ partial — `createChat` + catalog removal, but no handshake |
| Lead vs teammate roles | ⚠️ partial — chats are equal peers; no explicit role field |

### Gaps — coordination primitives the proposal does NOT yet model
1. **Inter-agent mailbox** — teammates message each other (agent-initiated, by
   name). AHP has no chat-to-chat messaging primitive. *(May stay host-internal
   unless clients must render it.)*
2. **Shared task list** — pending/in-progress/completed items, dependencies,
   file-locked claiming, surfaced in the UI (Ctrl+T). AHP has no task-list
   channel/state. Clearest genuine gap if clients must display it.
3. **Roles & hierarchy** — explicit lead/teammate (+ who-spawned-whom). Proposal
   has no role field; chats are equal peers, with only fork lineage / grouping
   parent.
4. **Spawn semantics** — spawn prompt + agent type / subagent definition +
   optional "require plan approval". `createChat` covers initial message + agent,
   but not the plan-approval requirement.
5. **Plan-approval handshake** — teammate→lead request, lead approve/reject with
   feedback, teammate revises. Could reuse `SessionInputRequest`-style elicitation
   **if** input requests can be routed cross-chat (lead chat answers a teammate
   chat's request) — not in the model today.
6. **Graceful shutdown handshake** — shutdown request the teammate can approve or
   reject. Proposal only has a hard catalog removal.

(Out of AHP scope by design: display modes/split panes, tmux/iTerm2, hooks,
per-teammate permission prompt routing — these are harness/client concerns.)

### Can the Claude harness implement it?
- **Partially today / with this proposal:** As the host, the harness owns the team
  runtime (it already persists task lists + mailbox locally). It can map
  team→session and teammate→chat, expose each teammate's transcript as a
  subscribable channel (concurrent streaming ✅), share workspace context ✅, and
  let a user drive any teammate by dispatching a turn to that channel ✅. So the
  **view + direct-interaction** slice is implementable.
- **Not fully, without additions:** to expose the full agent-teams *experience* to
  AHP clients — render the shared **task list**, show/answer **plan-approval**
  requests, surface **lead/teammate roles**, and represent the graceful
  **shutdown** handshake — AHP needs the coordination primitives in the gap list.
  The **inter-agent mailbox** is likely host-internal and may not need AHP surface
  at all (unless a client must display agent-to-agent chatter).

### Verdict
The proposal is a **necessary foundation and a correct directional match** for
agent teams (concurrent independent conversations + shared context + a member
catalog), but it is **not sufficient on its own**. To let the Claude harness
implement agent teams end-to-end for AHP clients, add (in priority order):
**(a)** a shared **task-list** representation, **(b)** explicit **chat roles**
(lead/teammate) + spawn lineage, **(c)** cross-chat routing for **plan-approval /
elicitation**, and **(d)** lifecycle **handshakes** (shutdown, plan approval).

## 11. How this architecture serves the use cases

| Use case | How the chat-channels architecture serves it |
|---|---|
| **Shared context** | session-level defaults (model, agent, workspace, config, tools) inherited by all chats |
| **Branching/forking** | new chat seeded from another chat's turn via `ChatForkSource` |
| **Concurrent turns** | each chat is its own channel with its own `activeTurn` + write-ahead stream |
| **UI grouping** | session = parent container, chats are enumerable via `SessionState.chats` (loaded on session subscribe) |
| **Task decomposition** | break a feature into subtasks, each runs as a chat (user-initiated or agent-spawned), grouped under one session |
| **Agent/user-initiated chats** | `createChat` (user) and server-side catalog additions (server) both create first-class chats, no tool-call coupling |

All of these map naturally to the chat-channels model without workarounds.

## 12. Alternative architectures considered

### Alternative 1: All chats inside one SessionState tree

**Shape:** `SessionState { chats: Chat[] }`, each chat owns its turns/activeTurn.

**Why not chosen:**
- Threads a `chatId` through every existing session action, complicating backward compatibility.
- Concentrates all concurrent turn mutations into one state tree, violating AHP's pattern of independent lazy-loadable channels.
- Loses per-chat lazy loading — subscribing to the session loads all chats' state.
- Harder to reason about concurrent reconciliation when multiple `activeTurn`s are in the same state tree.

**Best for:** simplest implementation if you don't care about channel isolation.

### Alternative 2: Multiple sessions sharing a context object

**Shape:** Keep `ahp-session:` = one chat. Add a shared `ahp-context:/<id>` or `ahp-group:/<id>` that multiple sessions reference. Hierarchy: `context → [session A, session B, session C]`.

**Upsides:**
- Better backward compatibility — doesn't change what a session is.
- Reuses existing session reducers / state shapes with minimal changes.
- Lighter protocol surface.

**Why not chosen for these use cases:**
- Sessions are not grouped under one parent in `listSessions` — root sees a flat list, needing separate grouping UI.
- "Session" no longer means "the user's container of related work" — less semantically direct.
- Branching and task decomposition feel like separate sessions rather than coordinated chats under one roof.
- The context object adds a new root-level resource type, increasing protocol complexity while still needing a grouping layer.

**Best for:** maximum compatibility with existing infrastructure; less intrusive protocol change.

### Alternative 3: Reuse ToolResultSubagentContent (tool-call delegation only)

**Shape:** Subagents *always* appear as tool-result blocks inside a parent turn, never as free-standing chats.

**Why not chosen:**
- Conflates "a delegated subtask" (the proper use of tool-result subagents) with "a peer chat in a team."
- Prevents agent-initiated chats from surfacing without an anchor turn/tool call.
- No enumerable chat catalog — you learn about a subagent *only* by parsing a parent turn.
- Doesn't solve task decomposition cleanly (every subtask looks like a tool call result, not a first-class team member).

**Best for:** minimal protocol change; works if subagents will always be transient tool-delegation.

### Alternative 4: Additive capability advertisement (no breaking change)

**Note:** Unlike Alternatives 1–3, this is not a different *architecture* — it
keeps the chosen chat-channels model. It is an alternative **backward-compat
strategy** that replaces the breaking change (Q4) + SemVer bump (Q10) with an
additive migration. It is also AHP's *documented default* — the **"capabilities
first, then required"** flow in
[`versioning.md`](../../docs/specification/versioning.md) — so it is rejected
here as a deliberate, justified exception (see Q10), not an oversight.

**Shape:** Reuse AHP's existing capability-advertisement idiom — the same one
used for `TelemetryCapabilities` on `InitializeResult`, where the server
advertises an optional channel family by the presence of a field, and unaware
clients ignore it.

- **Keep** `SessionState.turns` / `activeTurn` as a **single-chat projection**
  (the simple "first/primary chat only" flavor — *not* a cross-chat merge), so
  old clients keep seeing a working conversation.
- The new `ahp-chat:` channel and the `SessionState.chats[]` catalog are
  purely additive — an unknown field to old clients, the capability signal to
  new ones (exactly like an absent vs present `telemetry.logs`).
- Chat-aware clients read the chat channels; chat-unaware clients transparently
  see the projected primary chat.
- **No SemVer major bump** is required because nothing is removed or relocated.

**Upsides:**
- Non-breaking: existing clients keep working with zero changes.
- Clients adopt multi-chat at their own pace.
- Reuses an idiom already in the protocol (`TelemetryCapabilities`), rather than
  inventing a negotiated capability handshake.

**Why not chosen:** (see Q10 for the full rationale)
- **The change is removal-shaped, so a capability cannot cleanly gate it.**
  Capabilities gate *additions* an old client can ignore; multi-chat's end-state
  *removes* `turns`/`activeTurn`, so the gated stage is forced into a projection.
- Reintroduces the **"primary chat"** concept we deliberately dropped in Q2 —
  the projection needs a designated chat to mirror, so chats are no longer pure
  equal peers at the session-state level. The compatibility mode contradicts the
  feature's core invariant ("chats are equal peers").
- Requires maintaining a **permanent dual read path**: every server must keep
  `SessionState.turns`/`activeTurn` coherent *and* serve `ahp-chat:` channels,
  doubling the surface that can drift or disagree.
- The projection is intrinsically lossy — concurrent sibling chats are invisible
  through the session-level view, so an old client silently sees an incomplete
  picture of a multi-chat session (it cannot represent what it cannot see).
- **Pre-1.0 makes the additive stage poor value.** At `0.3.0`, `versioning.md`
  permits breaking on a MINOR bump and there is no stability promise; a one-time
  coordinated move to `0.4.0` confines migration cost to the upgrade boundary
  instead of every future server carrying the dual path forever.

**Best for:** ecosystems that cannot coordinate a client upgrade and must keep
chat-unaware clients functioning indefinitely.

---

### Future direction: coordination primitives, not session trees

A natural follow-up axis — once multi-chat lands — is **coordination
primitives** (work items, operations, assignments, lifecycle state,
participants) rather than nested sessions.

Looking at real multi-agent systems (Gas Town convoys, CrewAI tasks, AutoGen
jobs, Claude Agent Teams tasks, LangGraph state graphs), the thing they
actually coordinate around is **work units**, not transcript trees. A
deeply-nested session hierarchy is rarely the abstraction these systems reach
for; explicit work-tracking primitives are. This also matches AHP's existing
shape — the protocol already exposes generic `changesets` and `operations`
rather than Git-specific concepts like commits or pull requests, and would
analogously expose generic work coordination rather than host-specific roles
("mayor", "planner", "reviewer", etc.).

The chat-catalog shape introduced here is intentionally compatible with that
direction: a future `ChatOrigin.createdByOperation` variant (already declared
in Q12) lets work units spawn chats without further breaking changes, and
nothing in the current state shape precludes adding a sibling `operations[]`
or `workItems[]` catalog to `SessionState` later. That work is out of scope
for this proposal — flagged here only so reviewers know where the model is
headed and can confirm the shapes chosen here don't paint us into a corner.
