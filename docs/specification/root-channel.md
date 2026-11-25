# Root Channel

<StabilityIndex level="2" />

The root channel is the top-level channel every AHP server exposes. It carries global state — the agents the server provides, the terminals it manages, and host-level configuration — plus the catalogue events for sessions.

## URI

```
ahp-root://
```

Exactly one root channel exists per server. Clients SHOULD subscribe to it during the handshake via `initialSubscriptions` to receive the agent list, terminal list, and host config in the same round-trip.

## State

Subscribers receive a [`RootState`](/reference/root#rootstate) snapshot:

```typescript
RootState {
  agents: AgentInfo[]
  activeSessions?: number
  terminals?: TerminalInfo[]
  config?: RootConfigState
  modelSources?: ModelSource[]
}
```

- `agents` — agent backends the server can speak to, including any `protectedResources` they require for authentication. See [Authentication](/specification/authentication).
- `activeSessions` — count of non-disposed sessions. Lightweight badge counter.
- `terminals` — lightweight per-terminal metadata for rendering a terminal manager UI without subscribing to every terminal. See [Terminal Channel](/specification/terminal-channel) for the full state.
- `config` — host-level configuration schema and current values.
- `modelSources` — the sources agents offer models from, including ones clients registered. See [Model sources](#model-sources).

The session list is **not** part of root state. Clients fetch it imperatively via [`listSessions`](/reference/root#listsessions) and patch it from `root/*` notifications described below.

### Model sources

An agent provider can offer models from more than one source, such as a service, subscription, or endpoint. Root state lists every source in [`modelSources`](/reference/root#modelsource), each naming its agent `provider`, and each model names its source in [`SessionModelInfo.modelSourceId`](/reference/root#sessionmodelinfo). Clients use sources to label and group models, for example in a model picker.

- Source IDs MUST be unique within `modelSources`.
- A model's `modelSourceId` MUST match a source whose `provider` is the model's agent provider.
- Model IDs MUST be unique within the agent's `models`. When two sources serve the same upstream model, the host gives each entry its own ID and maps that ID to the upstream model.
- Model IDs are stable. A host SHOULD keep a model's ID across catalog updates, so saved selections keep working. It MUST NOT reuse an ID for a different source or upstream model, even after the model leaves `models`. A saved selection whose ID is no longer in `models` is unavailable.
- A source can have no models.

A [`ModelSelection`](/reference/root#modelselection) names a model by its `id`, which also determines the source. The host lists the sources an agent provides itself. They have no `format` or `definition`, and their sign-in uses `AgentInfo.protectedResources`.

#### Registering sources

An agent that serves models from client-registered sources advertises [`AgentCapabilities.modelSourceRegistration`](/reference/root#modelsourceregistrationcapability) with the formats it reads. A client registers a source with `root/modelSourceSet`, giving its `format`, a `definition` that tells the agent how to reach it, and a `nonce` that versions the definition, such as a hash of it. Each agent decides which formats it reads. Every client can read a definition, so it MUST NOT contain a credential: a client delivers that separately, with [`authenticate`](/specification/authentication#model-source-credentials).

`root/modelSourceSet` adds a source, or updates the one with the same `id`:

- **Add.** When no source has the `id`, it appends the source.
- **Re-register.** When one has, with the same `provider`, `format`, and `nonce`, it keeps the host-reported fields (`state`, `credentialResource`, and `accountId`) and takes everything else from the action.
- **Update.** When any of the three differs, it replaces the source, whose host-reported fields are absent until the host reports again. The host drops the source's credential.

`root/modelSourceRemoved` removes a source for every client. The host rejects a client's `Set`, through `rejectionReason`, when:

- the agent doesn't advertise `modelSourceRegistration` or list `format`, or the source lacks `format`, `definition`, or `nonce`;
- the source includes a host-reported field;
- its `provider`, `format`, and `nonce` match the existing source's, but its `definition` differs;
- it would change a source the host registered itself, including an agent's own;
- the host won't honor the requested `retention`.

A client registers its sources when it starts or reconnects, and when the user changes one. It SHOULD derive `id` from a stable key in its own configuration, so every window and device with the same source shares one, and SHOULD NOT update a source whose `nonce` differs from its own copy unless the user changed that source. Re-registering an unchanged source makes the client a contributing client. The host tracks contributing clients itself, from `ActionEnvelope.origin`.

Every connected client may change, supply credentials for, and select every source. A host that can verify principals MAY restrict a source to clients of the principal that registered it.

#### Status and catalog

The host reports a registered source's status with `root/modelSourceStateChanged`, which sets `state`, `credentialResource`, and `accountId` together, and ignores an unknown `id`. The state is `starting`, `ready`, `authRequired` with a `reason`, or `error`.

Once a registered source has been `ready`, the host keeps its models in the agent's `models` through later `starting` and `authRequired` states, so rotating a key doesn't break a selection. It withdraws them when the source is removed or enters `error`, or when an update changes its endpoint. A host SHOULD derive each model's ID deterministically from the source's `id`, `provider`, and `format`, its endpoint, and the endpoint's own model identifier, so a source registered again gets the same IDs.

The host checks a selection whenever it uses one, and never runs the work on a different model. A turn that can't use its source fails as described in [Model source credentials](/specification/authentication#turns).

#### Retention

A source's `retention` decides what happens when its last contributing client disconnects and doesn't return within a grace period the host chooses:

- `contributingClient`, the default: the host stops new work on the source, lets running turns finish, and then removes it.
- `host`: the source stays until a client removes it or host policy expires it.

The host SHOULD reject an automation that names a model from a `contributingClient`-retained source, because the automation would outlive the source.

### Paginating the catalogue

A large catalogue can be fetched incrementally. [`listSessions`](/reference/root#listsessions) accepts an optional `limit` (the maximum number of entries the client wants in the page — the server SHOULD respect it, but MAY return fewer and MAY impose its own upper cap) and an optional opaque `cursor`. The result carries the page in `items` plus an optional `nextCursor`:

- To fetch the first page, omit `cursor`. Supply `limit` to bound the page size.
- If the result includes a `nextCursor`, more entries exist — pass it back as `cursor` on the next call to fetch the following page.
- A missing `nextCursor` signals the end of the catalogue.

The cursor is **opaque and server-defined**: the server picks the ordering and keyset. Clients MUST NOT parse, modify, or persist a cursor across connections. An unrecognised cursor SHOULD be rejected with an `InvalidParams` error. The server SHOULD return most-recently-modified entries first, so the first page is the immediately useful one.

Pagination is fully additive. A client that omits `limit`/`cursor` and ignores `nextCursor` sees the pre-pagination behaviour (subject to any server-imposed cap), and a server that does not paginate ignores the inputs and returns everything in one page. Pagination governs only the initial and backfill fetches — the `root/session*` notifications keep an already-loaded page live exactly as before.

## Methods and events on this channel

This section lists wire methods that are interpreted in the context of
`ahp-root://`. If `params.channel` is some other URI, they are handled by the
target channel instead.

### Commands (`params.channel = "ahp-root://"`)

| Method | Kind | Why it belongs on root |
|---|---|---|
| `initialize` | request | Connection-level handshake command; scoped to the root channel. |
| `ping` | request | Connection liveness check; scoped to the root channel. |
| `reconnect` | request | Connection resume/replay negotiation; scoped to the root channel. |
| `listSessions` | request | Session catalogue lives on root (`root/session*` events keep the cache fresh). |
| `resourceRead` | request | Filesystem/content access is connection-level, not session-local. May also be issued **server → client** to fetch from a client-published URI. |
| `resourceWrite` | request | Filesystem/content access is connection-level, not session-local. May also be issued **server → client** for host-driven per-session FS providers. |
| `resourceList` | request | Filesystem/content access is connection-level, not session-local. May also be issued **server → client**. |
| `resourceCopy` | request | Filesystem/content access is connection-level, not session-local. May also be issued **server → client**. |
| `resourceDelete` | request | Filesystem/content access is connection-level, not session-local. May also be issued **server → client**. |
| `resourceMove` | request | Filesystem/content access is connection-level, not session-local. May also be issued **server → client**. |
| `resourceResolve` | request | `stat` + `realpath` combination; throws `NotFound` for missing URIs. May also be issued **server → client**. |
| `resourceMkdir` | request | `mkdir -p` semantics. May also be issued **server → client**. |
| `resourceRequest` | request | Permission grant/revocation flow is connection-level. Symmetrical: either peer MAY initiate. |
| `createResourceWatch` | request | Opens a file-change watcher; the receiver returns an `ahp-resource-watch:/<id>` channel. May also be issued **server → client** to watch a client-side URI. The watcher is released when subscribers unsubscribe — no explicit dispose call. |
| `authenticate` | request | Bearer-token push for protected resources is connection-level. |
| `resolveSessionConfig` | request | Pre-creation config resolution happens before any session channel exists. |
| `sessionConfigCompletions` | request | Completes dynamic fields in pre-creation session config. |
| `listAutomationTriggerDefinitions` | request | Describes host-defined event triggers. |

### Notifications (`params.channel = "ahp-root://"`)

| Method | Kind | Meaning |
|---|---|---|
| `action` | server → client notification | Root-scoped action envelope (`root/*` action payloads). |
| `root/sessionAdded` | server → client notification | Session catalogue entry created. |
| `root/sessionRemoved` | server → client notification | Session catalogue entry removed. |
| `root/sessionSummaryChanged` | server → client notification | Session catalogue entry mutated. |
| `root/progress` | server → client notification | Generic progress for a long-running operation a client opted into (e.g. an SDK download). |
| `unsubscribe` | client → server notification | Stop receiving root-channel messages. |
| `dispatchAction` | client → server notification | Dispatch a root-scoped client action: `root/configChanged`, `root/modelSourceSet`, or `root/modelSourceRemoved`. |

`auth/required` may also be emitted on `ahp-root://` when the auth requirement
is root-scoped; see [Authentication](/specification/authentication).

## Actions

Root state is mutated by action envelopes broadcast on this channel. Refer to the [Root Channel Reference](/reference/root#actions) for the full list; the root-scoped actions are:

| Action                       | Direction       | Reducer effect                       |
| ---------------------------- | --------------- | ------------------------------------ |
| `root/agentsChanged`         | Server          | Replaces `agents`                    |
| `root/activeSessionsChanged` | Server          | Replaces `activeSessions`            |
| `root/terminalsChanged`      | Server          | Replaces `terminals`                 |
| `root/configChanged`         | Server / Client | Merges (or replaces) `config.values` |
| `root/modelSourceSet` | Server / Client | Adds, re-registers, or updates a source in `modelSources` by `id`, including its definition |
| `root/modelSourceRemoved` | Server / Client | Removes a source by `id` |
| `root/modelSourceStateChanged` | Server | Sets a source's host-reported fields. A no-op for an unknown `id` |

All root-scoped action envelopes have `channel: "ahp-root://"`.

## Protocol Notifications

In addition to action envelopes, the server pushes per-session catalogue events to subscribers of `ahp-root://`. These notifications keep cached session lists in sync without subscribing to every session URI individually.

### `root/sessionAdded`

Emitted when a new session is created.

```json
{
  "jsonrpc": "2.0",
  "method": "root/sessionAdded",
  "params": {
    "channel": "ahp-root://",
    "summary": {
      "resource": "ahp-session:/<uuid>",
      "title": "New Session",
      "status": 1,
      "createdAt": "2024-03-09T16:00:00.000Z",
      "modifiedAt": "2024-03-09T16:00:00.000Z"
    }
  }
}
```

### `root/sessionRemoved`

Emitted when a session is disposed.

```json
{
  "jsonrpc": "2.0",
  "method": "root/sessionRemoved",
  "params": {
    "channel": "ahp-root://",
    "session": "ahp-session:/<uuid>"
  }
}
```

### `root/sessionSummaryChanged`

Emitted when any mutable field on an existing [`SessionSummary`](/reference/session#sessionsummary) changes (title, status, `modifiedAt`, working directory, read/done state, change statistics, …). Only the changed fields are carried; identity fields (`resource`, `provider`, `createdAt`) never change and MUST be omitted.

```json
{
  "jsonrpc": "2.0",
  "method": "root/sessionSummaryChanged",
  "params": {
    "channel": "ahp-root://",
    "session": "ahp-session:/<uuid>",
    "changes": {
      "title": "Refactor auth middleware",
      "status": 8,
      "modifiedAt": "2024-03-09T16:02:03.456Z"
    }
  }
}
```

Servers MAY coalesce or debounce this notification for noisy fields — for example, rapid `modifiedAt` bumps during a streaming turn, or frequent `changes` updates during an edit burst. Clients that have no cached entry for `session` MAY ignore the notification.

Like all protocol notifications, the `root/*` events are ephemeral and are **not** replayed on reconnect. After reconnecting, clients SHOULD re-fetch the catalogue via [`listSessions`](/reference/root#listsessions).

## Progress

The server MAY emit `root/progress` to report incremental progress on a long-running operation a client opted into — most notably the lazy, first-use download of an agent's native SDK. A client opts in by supplying a `progressToken` on the originating request (today the `progressToken` field of [`createSession`](/reference/session#createsession)); the server echoes that token on every frame so the client can correlate progress back to the call and the UI awaiting it. The notification is operation-agnostic — it names no domain object.

```json
{
  "jsonrpc": "2.0",
  "method": "root/progress",
  "params": {
    "channel": "ahp-root://",
    "progressToken": "9b2c1f7e-4a0d-4e2b-8b1a-2f7e4a0d4e2b",
    "progress": 18874368,
    "total": 41957498,
    "message": "Downloading Claude agent…"
  }
}
```

`progress` is monotonically non-decreasing for a given `progressToken`. `total` is present only when the magnitude is known up front (e.g. a `Content-Length`); when absent, clients SHOULD show an indeterminate indicator. The operation is complete when `progress === total` — the server MUST emit a final frame satisfying this, setting `total` to the final `progress` when the total was never known, after which no further frames reference the token. An optional `message` carries a human-readable description of the work in progress; a client that tracks the token renders its own (localized) label and MAY ignore it, while a generic client MAY display `message` verbatim. The server MAY emit no progress at all (for example when the work was already done), in which case the client simply never shows an indicator. Like the catalogue events, `root/progress` is ephemeral and is **not** replayed on reconnect.

## Authentication Events

The server MAY emit [`auth/required`](/specification/authentication#auth-expiry-notification) on the root channel when an agent's protected resource needs (re-)authentication. See [Authentication](/specification/authentication) for the full flow.
