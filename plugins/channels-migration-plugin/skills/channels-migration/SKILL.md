---
description: >-
  Migrate code that talks to or implements the Agent Host Protocol from the
  pre-channels model to the current channel-based model. Use when asked to
  upgrade an AHP client/server, when seeing references to `agenthost:/root`,
  `<provider>:/<uuid>` session URIs, a `notification` wrapper method, an
  `envelope` field inside `action` params, a `resource` field on
  subscribe/unsubscribe/snapshot results, or `session` / `terminal` /
  `changeset` fields on command params or action payloads.
---

# AHP Channels Migration

This skill helps you migrate a codebase that consumes (or implements) the
Agent Host Protocol from the **pre-channels model** to the **channel-based
model** introduced by RFC #117. The migration was folded into the protocol
as a single breaking step alongside the `0.2.0` version bump (which also
introduced changesets and the `session/customizationUpdated` action). The
combined wire format on `0.2.0` is what this skill targets; there is no
transitional version.

The migration is mechanical in most places but touches several shapes at once,
so do it in passes rather than file-by-file. The order below minimises the
chance of leaving the codebase in a half-broken state.

## How to use this skill

1. Start with the **Mental model** section so you understand what "channel"
   means and why fields moved.
2. Work through the **Migration passes** in order. Each pass is independent
   enough that you can land it as its own commit.
3. Use the **Grep cheat sheet** at the bottom to find every site that needs
   updating in your codebase.
4. When in doubt about a specific type's new shape, look it up in the AHP
   repo's `types/*.ts` (`state.ts`, `actions.ts`, `commands.ts`,
   `messages.ts`, `notifications.ts`) or in `docs/specification/`.

## Mental model

In the pre-channels world, AHP had a privileged "state subscription"
mechanism: clients subscribed to a URI, got a snapshot, and received action
envelopes for that URI's state. Notifications (session catalogue events,
auth-required) were stuffed inside a single `notification` wrapper method.
The URI of a state-bearing resource was embedded directly into the action
payload (`action.session`, `action.terminal`).

In the channel-based world, every push-style interaction lives on a
**channel**, identified by a URI. Subscriptions, action delivery, and
protocol notifications all carry a top-level `channel: URI` field that
identifies which subscription a message belongs to. A channel MAY have
associated state (root, sessions, terminals), or it MAY be stateless (future
use: logging, MCP, LSP relay). The wire shape is uniform across types.

Concretely:

- **Root URI**: `agenthost:/root` → `ahp-root://`
- **Session URI scheme**: provider-named (`copilot:/<uuid>`) →
  `ahp-session:/<uuid>` in docs/examples. The provider lives on
  `SessionSummary.provider`, not in the URI. (Live session URIs are
  announced by the server, so this is mainly a docs/example change for
  consumers — but type-level shape changes still apply.)
- **Terminal URI scheme** (docs/examples): `ahp-terminal:/<id>`. Server-
  defined; clients treat as opaque.
- **Changeset URI scheme** (docs/examples): `ahp-changeset:/<id>`. Server-
  defined; obtained by expanding a `ChangesetSummary.uriTemplate`.
  Changesets are a new channel type introduced in the same step.
- **`channel` everywhere**: `subscribe`/`unsubscribe`/action-envelope/
  `dispatchAction`/every protocol notification AND every command has
  `channel: URI` at the top level of its params. Commands that are
  connection-level rather than channel-scoped (e.g. `initialize`, `ping`,
  `listSessions`, the `resource*` filesystem commands, `authenticate`)
  set `channel` to the literal `'ahp-root://'`.
- **Action payloads are channel-less**: `session: URI` and `terminal: URI`
  fields are gone from individual actions. Routing is by envelope.
- **Notifications are top-level methods**: the `notification` wrapper and
  the `ProtocolNotification` union are gone.
- **`SessionDiffsChangedAction` is gone**: replaced by
  `SessionChangesetsChangedAction` (catalogue updates on a session) plus a
  new family of per-changeset actions (`changeset/statusChanged`,
  `changeset/fileSet`, `changeset/fileRemoved`,
  `changeset/operationsChanged`, `changeset/cleared`) and the
  `invokeChangesetOperation` command. See `docs/guide/changesets.md`.

## Migration passes

Apply these in order. After each pass, run your typecheck/test loop.

### Pass 1 — Rename the root URI

```
agenthost:/root  →  ahp-root://
```

This is the one immediately-wire-breaking rename. Any client that subscribes
to root state with the old URI will receive an error from a channels-era
server.

Update every literal occurrence in code, tests, fixtures, configuration, and
documentation. Search patterns:

- TypeScript/JavaScript/JSON: `agenthost:/root`
- Anywhere the URI is constructed from constants: look for an `AHP_ROOT_URI`
  or similar constant.

### Pass 2 — `subscribe` / `unsubscribe` params: `resource` → `channel`

```ts
// before
{ method: 'subscribe',   params: { resource: <uri> } }
{ method: 'unsubscribe', params: { resource: <uri> } }

// after
{ method: 'subscribe',   params: { channel: <uri> } }
{ method: 'unsubscribe', params: { channel: <uri> } }
```

`SubscribeParams.resource` is now `SubscribeParams.channel`.
`UnsubscribeParams.resource` is now `UnsubscribeParams.channel`. The URI
value is unchanged for state channels — only the field name moves.

### Pass 3 — `SubscribeResult` becomes `{ snapshot? }`

The result of a `subscribe` request was a flat snapshot. It is now wrapped
in an optional `snapshot` field, because stateless channels return no
snapshot.

```ts
// before — SubscribeResult was the snapshot directly
{
  resource: 'ahp-session:/<uuid>',
  state:    { ... },
  fromSeq:  5,
}

// after — SubscribeResult is { snapshot?: Snapshot }
{
  snapshot: {
    resource: 'ahp-session:/<uuid>',
    state:    { ... },
    fromSeq:  5,
  }
}
```

For stateless channels, `snapshot` is omitted entirely:

```ts
// stateless channel: subscribe returns an empty result
{}
```

Update every place that destructures the subscribe response. If your client
threaded the snapshot directly into reducers, you now need to read
`result.snapshot` and handle `undefined` (stateless) as a separate path.

### Pass 4 — Action envelopes carry `channel`; action payloads lose theirs

The envelope grew a top-level `channel` field. Every individual session and
terminal action lost its inner channel-identifier field.

```ts
// before — ActionEnvelope
{
  action: { type: 'session/delta', session: 'copilot:/<uuid>', turnId: 't1', ... },
  serverSeq: 6,
  origin: { ... },
}

// after — ActionEnvelope
{
  channel: 'ahp-session:/<uuid>',
  action:  { type: 'session/delta', turnId: 't1', ... },  // no `session` field
  serverSeq: 6,
  origin: { ... },
}
```

**Producer-side changes** (anything that builds action envelopes or
individual actions): stop populating `session`/`terminal` on action payloads.
Populate `envelope.channel` instead. The two are typically the same URI you
were already using.

**Consumer-side changes** (anything that routes actions to per-session or
per-terminal reducers): switch your dispatch keying from
`action.session` / `action.terminal` to `envelope.channel`. The reducer
selection becomes "look at the envelope's `channel`, route by URI scheme".

Action interfaces that lost their channel field — full list:

- All session actions: `SessionReadyAction`, `SessionCreationFailedAction`,
  `SessionTurnStartedAction`, `SessionDeltaAction`,
  `SessionResponsePartAction`, `SessionToolCallStartAction`,
  `SessionToolCallDeltaAction`, `SessionToolCallReadyAction`,
  `SessionToolCallConfirmedAction`, `SessionToolCallCompleteAction`,
  `SessionToolCallResultConfirmedAction`,
  `SessionToolCallContentChangedAction`, `SessionTurnCompleteAction`,
  `SessionTurnCancelledAction`, `SessionErrorAction`,
  `SessionTitleChangedAction`, `SessionUsageAction`,
  `SessionReasoningAction`, `SessionModelChangedAction`,
  `SessionServerToolsChangedAction`,
  `SessionActiveClientChangedAction`,
  `SessionActiveClientToolsChangedAction`,
  `SessionPendingMessageSetAction`,
  `SessionPendingMessageRemovedAction`,
  `SessionQueuedMessagesReorderedAction`,
  `SessionInputRequestedAction`, `SessionInputAnswerChangedAction`,
  `SessionInputCompletedAction`, `SessionCustomizationsChangedAction`,
  `SessionCustomizationToggledAction`,
  `SessionCustomizationUpdatedAction`, `SessionTruncatedAction`,
  `SessionIsReadChangedAction`, `SessionIsArchivedChangedAction`,
  `SessionActivityChangedAction`,
  `SessionChangesetsChangedAction` (replaces the removed
  `SessionDiffsChangedAction`),
  `SessionConfigChangedAction`, `SessionMetaChangedAction`.
- Tool-call actions also lost `session` because `ToolCallActionBase` no
  longer carries it. `turnId` and `toolCallId` remain.
- All terminal actions: `TerminalDataAction`, `TerminalInputAction`,
  `TerminalResizedAction`, `TerminalClaimedAction`,
  `TerminalTitleChangedAction`, `TerminalCwdChangedAction`,
  `TerminalExitedAction`, `TerminalClearedAction`,
  `TerminalCommandDetectionAvailableAction`,
  `TerminalCommandExecutedAction`, `TerminalCommandFinishedAction`.
- All changeset actions (new in `0.2.0`):
  `ChangesetStatusChangedAction`, `ChangesetFileSetAction`,
  `ChangesetFileRemovedAction`, `ChangesetOperationsChangedAction`,
  `ChangesetClearedAction`. These never carried a `changeset: URI` field
  in shipping code — it was removed before they were released.

### Pass 5 — `action` server notification: drop the `envelope` wrapper

The server → client `action` method previously wrapped its envelope:

```ts
// before
{ method: 'action', params: { envelope: ActionEnvelope } }

// after
{ method: 'action', params: ActionEnvelope }   // envelope is the params, flat
```

Wherever you build or parse `action` notifications, remove the extra
`{ envelope: ... }` nesting.

### Pass 6 — `dispatchAction` gains a `channel`

Client → server still uses the `dispatchAction` method name (this did **not**
get renamed to `action`). The params type adds a top-level `channel`:

```ts
// before
{
  method: 'dispatchAction',
  params: { clientSeq: 1, action: { type: 'session/turnStarted', session: '...', ... } }
}

// after
{
  method: 'dispatchAction',
  params: {
    channel:   'ahp-session:/<uuid>',
    clientSeq: 1,
    action:    { type: 'session/turnStarted', turnId: '...', ... }   // no `session`
  }
}
```

### Pass 7 — Protocol notifications become top-level methods

The `notification` wrapper method is gone. Each protocol notification is
now its own top-level JSON-RPC method with its own params type, and each
carries a top-level `channel`.

| Pre-channels                                         | Post-channels (method)          | Params type                  |
|------------------------------------------------------|---------------------------------|------------------------------|
| `notification` → `notify/sessionAdded`               | `root/sessionAdded`             | `SessionAddedParams`         |
| `notification` → `notify/sessionRemoved`             | `root/sessionRemoved`           | `SessionRemovedParams`       |
| `notification` → `notify/sessionSummaryChanged`      | `root/sessionSummaryChanged`    | `SessionSummaryChangedParams`|
| `notification` → `notify/authRequired`               | `auth/required`                 | `AuthRequiredParams`         |

Each new params type has `channel: URI` as its top-level field. For
`root/*` notifications, `channel` is `ahp-root://`. For `auth/required`,
`channel` can be any channel the auth requirement is scoped to.

```ts
// before
{
  method: 'notification',
  params: {
    notification: {
      type:    'notify/sessionAdded',
      summary: { resource: 'copilot:/<uuid>', ... }
    }
  }
}

// after
{
  method: 'root/sessionAdded',
  params: {
    channel: 'ahp-root://',
    summary: { resource: 'ahp-session:/<uuid>', ... }
  }
}
```

Drop any code that imports `ProtocolNotification`, the `NotificationType`
enum, `NotificationMethodParams`, or the combined `NotificationMap` — these
types were removed. Replace them with the per-method params types and a
direct lookup on the wire-level method name. The type-level constraint
that every entry in `ClientNotificationMap` / `ServerNotificationMap` has
`params extends { channel: URI }` is enforced in
`types/version/message-checks.ts`, alongside an equivalent check that
every entry in `CommandMap` / `ServerCommandMap` has
`params extends BaseParams` (see Pass 10).

### Pass 8 — Session URI scheme (docs/examples + helpers)

If your code constructs session URIs via a helper like
`AgentSession.uri(provider, rawId)`, the provider component is no longer
encoded in the scheme. Update the helper to produce `ahp-session:/<rawId>`
and remove any `AgentSession.provider(session)` lookups that extracted the
provider from the URI. Read the provider from `SessionSummary.provider`
instead.

For session URIs that are **announced** by an existing AHP server you talk
to, you do not need to change anything in your client beyond accepting the
new scheme. Treat session URIs as opaque strings except where you
specifically construct them.

### Pass 9 — Reconnect / replay behaviour for stateless channels

`reconnect` still carries `subscriptions: URI[]`. State-channel replay
behaviour is unchanged. Stateless channels (where they exist) are
re-subscribed on reconnect — missed messages are dropped, never replayed.
If you implement a server: do not include stateless channels in the
`replay` result's `actions` list. They will simply re-subscribe.

### Pass 10 — Commands carry `channel: URI`

Every command's params now extends `BaseParams { channel: URI }`. The
`channel` field tells the server which channel the command targets, so a
router can dispatch any incoming message — request, response, or
notification — by inspecting `params.channel` without further
deserialisation.

There are two flavours:

**Channel-scoped commands** — rename the existing
`session` / `terminal` / `changeset` field to `channel`. The URI value is
unchanged.

| Command                     | Old field             | New field |
|-----------------------------|-----------------------|-----------|
| `createSession`             | `session: URI`        | `channel: URI` |
| `disposeSession`            | `session: URI`        | `channel: URI` |
| `createTerminal`            | `terminal: URI`       | `channel: URI` |
| `disposeTerminal`           | `terminal: URI`       | `channel: URI` |
| `fetchTurns`                | `session: URI`        | `channel: URI` |
| `completions`               | `session: URI`        | `channel: URI` |
| `invokeChangesetOperation`  | `changeset: URI`      | `channel: URI` |
| `subscribe`, `unsubscribe`, `dispatchAction` | already `channel` (Passes 2 & 6) | unchanged |

**Connection-level commands** — narrow `channel` to the literal
`'ahp-root://'`. Add the field explicitly; the TS types enforce it.

Methods: `initialize`, `ping`, `reconnect`, `listSessions`,
`authenticate`, `resolveSessionConfig`, `sessionConfigCompletions`,
`resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`,
`resourceDelete`, `resourceMove`, `resourceRequest`.

```ts
// before
{ method: 'initialize', params: { protocolVersions: ['0.2.0'], clientId: 'c1' } }
{ method: 'listSessions', params: {} }
{ method: 'createSession', params: { session: 'ahp-session:/<uuid>', provider: 'copilot' } }
{ method: 'fetchTurns', params: { session: 'ahp-session:/<uuid>', limit: 20 } }

// after
{ method: 'initialize',   params: { channel: 'ahp-root://', protocolVersions: ['0.2.0'], clientId: 'c1' } }
{ method: 'listSessions', params: { channel: 'ahp-root://' } }
{ method: 'createSession', params: { channel: 'ahp-session:/<uuid>', provider: 'copilot' } }
{ method: 'fetchTurns',   params: { channel: 'ahp-session:/<uuid>', limit: 20 } }
```

The compile-time check `_CheckCommandsHaveChannel` in
`types/version/message-checks.ts` verifies that every entry in
`CommandMap` / `ServerCommandMap` has params assignable to `BaseParams`.
If you forget to add `channel` to a new command's params, the check
fails to compile and points at the missing field.

## Grep cheat sheet

Run these searches in your codebase. Each pattern is a strong signal that a
migration site still needs attention.

| Pattern                              | What it indicates |
|--------------------------------------|--------------------|
| `agenthost:/root`                    | Old root URI literal (Pass 1) |
| `"resource"`/`resource:` near `subscribe`/`unsubscribe`/`Subscribe` | Old subscribe param shape (Pass 2) |
| `result.resource` / `result.state` / `result.fromSeq` right after subscribe | Old flat-snapshot subscribe result (Pass 3) |
| `action.session` / `action.terminal` | Reading the channel off the action payload — should be from the envelope (Pass 4) |
| `session:` inside an action literal  | Producer writing pre-channels payload (Pass 4) |
| `params.envelope` near `'action'`    | Old `action` server notification wrapper (Pass 5) |
| `dispatchAction` without `channel`   | Client dispatch missing channel (Pass 6) |
| `'notification'` as a JSON-RPC method name | Old protocol notification wrapper (Pass 7) |
| `notify/sessionAdded`, `notify/sessionRemoved`, `notify/sessionSummaryChanged`, `notify/authRequired` | Old protocol notification names (Pass 7) |
| `ProtocolNotification`, `NotificationType`, `NotificationMethodParams`, `NotificationMap` | Removed types (Pass 7) |
| `SessionAddedNotification`, `SessionRemovedNotification`, `SessionSummaryChangedNotification`, `AuthRequiredNotification` | Old notification interfaces — renamed to `*Params` (Pass 7) |
| `AgentSession.provider`, `provider` extracted from session scheme | Old provider-via-scheme helper (Pass 8) |
| `SessionDiffsChangedAction`, `summary.diffs`, `session/diffsChanged` | Removed in favour of changesets (Pass 4 list) |
| `CreateSessionParams\W+session:`, `DisposeSessionParams\W+session:`, `CreateTerminalParams\W+terminal:`, `DisposeTerminalParams\W+terminal:`, `FetchTurnsParams\W+session:`, `CompletionsParams\W+session:`, `InvokeChangesetOperationParams\W+changeset:` | Channel-scoped command params still using the old field name (Pass 10) |
| `ListSessionsParams()`, `PingParams()`, `ResourceReadParams\(uri:` (no `channel:`), or any other command params constructed without `channel` | Connection-level command missing the `channel: 'ahp-root://'` literal (Pass 10) |

## Verification checklist

After the migration, your code should:

- [ ] Subscribe to `ahp-root://` instead of `agenthost:/root`.
- [ ] Pass `{ channel }` (not `{ resource }`) to `subscribe` and `unsubscribe`.
- [ ] Read `result.snapshot` from `subscribe` responses; tolerate
      `snapshot === undefined` for stateless channels.
- [ ] Build action envelopes with a top-level `channel`. No
      `session` / `terminal` fields inside individual action payloads.
- [ ] Consume the `action` server notification's params as the envelope
      itself, not as `{ envelope }`.
- [ ] Build `dispatchAction` params with a top-level `channel`.
- [ ] Receive protocol notifications as top-level methods
      (`root/sessionAdded`, `root/sessionRemoved`,
      `root/sessionSummaryChanged`, `auth/required`) rather than nested
      inside `notification`.
- [ ] No imports of `ProtocolNotification`, `NotificationType`,
      `NotificationMethodParams`, or `NotificationMap`.
- [ ] Resolve a session's provider via `SessionSummary.provider`, not via
      the URI scheme.
- [ ] No `SessionDiffsChangedAction` / `summary.diffs` references; consume
      `summary.changesets` plus the `changeset/*` action family instead.
- [ ] Every command's params carries `channel: URI`. Channel-scoped
      commands (`createSession`, `disposeSession`, `createTerminal`,
      `disposeTerminal`, `fetchTurns`, `completions`,
      `invokeChangesetOperation`) pass the target channel URI;
      connection-level commands pass the literal `'ahp-root://'`.

When all these are true, your consumer is on the channels model.

## References

For the full normative description of the channel model, consult these
documents in the `microsoft/agent-host-protocol` repository:

- `docs/specification/subscriptions.md` — Channels & Subscriptions (the
  framework, including stateless channels and the URI scheme table)
- `docs/specification/root-channel.md` — Root channel state, actions, and
  protocol notifications
- `docs/specification/session-channel.md` — Session channel lifecycle,
  client-action validation, pending-message consumption
- `docs/specification/terminal-channel.md` — Terminal channel data flow
  and command detection
- `docs/specification/lifecycle.md` — Connection handshake and reconnection
- `docs/guide/changesets.md` — Changeset channel model, catalogue,
  per-changeset state, and `invokeChangesetOperation`
- `types/actions.ts`, `types/commands.ts`, `types/messages.ts`,
  `types/notifications.ts` — Source-of-truth type definitions
  (`BaseParams` lives in `commands.ts`)
- `types/version/message-checks.ts` — Compile-time checks that every
  command and notification carries `channel: URI`
- GitHub issue [#117](https://github.com/microsoft/agent-host-protocol/issues/117)
  — The RFC that introduced the channel model
