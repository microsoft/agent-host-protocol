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
- `modelSources` — model sources clients or the host registered. See [Model source registry](#model-source-registry).

The session list is **not** part of root state. Clients fetch it imperatively via [`listSessions`](/reference/root#listsessions) and patch it from `root/*` notifications described below.

### Model sources

An agent provider can offer models from more than one source, such as different services or subscriptions. It lists those sources in [`AgentInfo.modelSources`](/reference/root#agentinfo), and each model names its source in [`SessionModelInfo.modelSourceId`](/reference/root#sessionmodelinfo). Clients use sources to label and group models, for example in a model picker.

- Source IDs MUST be unique within the agent's `modelSources`.
- A model's `modelSourceId` MUST match an entry in the same agent's `modelSources`.
- Model IDs MUST be unique within the agent's `models`. When two sources serve the same upstream model, the host gives each entry its own ID and maps that ID to the upstream model.
- A source can have no models.

A [`ModelSelection`](/reference/root#modelselection) names a model by its `id`, which also determines the source.

```json
{
  "provider": "example",
  "displayName": "Example agent",
  "description": "An agent with two model sources",
  "modelSources": [
    { "id": "source-a", "displayName": "Service A" },
    { "id": "source-b", "displayName": "Service B" }
  ],
  "models": [
    { "id": "shared-model-a", "provider": "example", "name": "Shared model", "modelSourceId": "source-a" },
    { "id": "shared-model-b", "provider": "example", "name": "Shared model", "modelSourceId": "source-b" }
  ]
}
```

### Model source registry

Clients can register bring-your-own-key model sources with the host, so its agents can serve those models to every session and to automations. Root state lists them in [`modelSources`](/reference/root#modelsource), keyed by `id`. An agent that accepts registrations advertises [`AgentCapabilities.modelSourceRegistration`](/reference/root#modelsourceregistrationcapability) with the definition formats it reads, most preferred first, as [`ModelSourceFormatInfo`](/reference/root#modelsourceformatinfo) objects.

```json
{
  "id": "2f6c0e1a-model-source",
  "provider": "example",
  "displayName": "OpenRouter",
  "format": "openaiCompatible",
  "definition": {
    "endpoint": "https://openrouter.ai/api/v1",
    "wireApi": "chatCompletions",
    "models": [{ "id": "vendor/model-a", "maxContextWindow": 200000 }]
  },
  "nonce": "sha256-4f1c9a",
  "retention": "host",
  "state": { "kind": "ready" },
  "credentialResource": {
    "resource": "https://openrouter.ai/api/v1",
    "resource_name": "OpenRouter API key"
  },
  "accountId": "keychain-5c2a"
}
```

A model source's `definition` tells the agent how to reach it: endpoint, wire API, models, and so on, in the format `format` names. AHP recognizes `openaiCompatible`, `anthropic`, `azureOpenai`, and `gemini`, following the pattern of `Changeset.changeKind`, and suggests a shape for each:

- `openaiCompatible`: `{ endpoint, wireApi?, models? }`, where `wireApi` is `chatCompletions` or `responses`;
- `anthropic`: `{ endpoint, models? }`;
- `azureOpenai`: `{ endpoint, apiVersion?, models? }`, with each deployment name as a model `id`;
- `gemini`: `{ endpoint, models? }`.

`endpoint` is the API's base URI, such as `https://api.example.com/v1`. Each `models` entry is `{ id, name?, maxContextWindow?, maxOutputTokens?, supportsVision?, supportsTools? }`, named as in `SessionModelInfo`, where `id` is the endpoint's own model identifier. Agents MAY read more members, and MAY discover models when `models` is absent. AHP doesn't validate definitions, even for the recognized formats: `definition` belongs to the agent. Agents MAY read other formats, named with a namespace such as `example.com/model-source@1`.

Every client can read a source's definition, for example to show which endpoint it uses, or to check it against its own copy before sending a key. Root state is broadcast and replayed, so a definition is never secret, and it MUST NOT contain a credential. A client delivers the credential separately, with [`authenticate`](/specification/authentication#model-source-credentials). `nonce` is an opaque version token for the definition, so reducers compare a string rather than JSON.

#### Registering, updating, and removing

A client registers a source with `root/modelSourceSet { modelSource }`, including its definition, and removes it with `root/modelSourceRemoved { id }`. The reducers follow the keyed-collection convention, with one twist so that re-registering the same definition doesn't disturb a working source:

- **Add.** When no model source has the `id`, `Set` appends `modelSource`.
- **Re-register.** When one has, with the same `provider`, `format`, and `nonce`, `Set` keeps its host-reported fields (`state`, `credentialResource`, and `accountId`) and takes everything else from the action.
- **Update.** When any of the three differs, `Set` replaces the source. Its host-reported fields are absent until the host reports again.
- **Remove.** `Removed` deletes the source by `id`, or returns the state unchanged.

Comparing three strings keeps every client's reducer in agreement without comparing definitions.

A client dispatches `Set` with no host-reported fields, when it starts or reconnects with the source configured, and when the user changes the source. Re-registering an unchanged source is how a second window, a reloaded window, or another device with the same source configured becomes a contributing client. When clients disagree on `displayName`, `icons`, `retention`, or `_meta`, the last `Set` wins. A client SHOULD derive `id` from a stable key in its own configuration, and `nonce` from the definition, for example as a hash of it. A client SHOULD NOT update a source whose `nonce` differs from its own copy unless the user changed the source in its configuration, and SHOULD NOT add back a source another client removed except when it starts or reconnects, or two clients with different configurations would replace each other's source indefinitely.

When the user removes the source from a client's configuration, the client dispatches `Removed`. Removal applies to every client. A client that still has the source configured registers it again the next time it starts or reconnects.

The host rejects a client's `Set`, through `rejectionReason`, when:

- the agent named by `provider` doesn't advertise `modelSourceRegistration`, or doesn't list `format`;
- `modelSource` includes any host-reported field;
- its `provider`, `format`, and `nonce` match the existing source's, but its `definition` differs. A re-registration must not carry a different definition, because reducers keep the credential for it;
- `id` equals a `ModelSourceInfo.id` that the agent declares itself. The catalog entry the host publishes for this same source doesn't count, so a ready source can still be re-registered or updated;
- the host won't honor the requested `retention`. The client can register again with `contributingClient` retention;
- the host registered the source itself;
- the host restricts sources by principal, and the existing source belongs to another principal.

A host MAY reject a client's `Removed` for a source it registered itself or one that belongs to another principal.

The host tracks contributing clients itself, from each `Set`'s `ActionEnvelope.origin`, and they aren't in state. An add or a re-registration adds the dispatching client. An update makes the dispatching client the only one, because the others registered a different definition. When `Set` updates a source, the host drops its credential, and the source goes back through `starting`, so a changed definition never receives a key supplied for a different one. A re-registration, or a change to `displayName`, `icons`, `retention`, or `_meta`, keeps the credential. A host may also register sources itself. Those sources have no contributing clients, and their retention behaves as `host`.

#### Status

The host reports status with `root/modelSourceStateChanged`, as `session/mcpServerStateChanged` does for MCP servers. It sets the host-reported fields together: the source's `state` (`starting`, `ready`, `authRequired`, or `error`), and its `credentialResource` and `accountId`, which an absent value clears. It never reports status by dispatching the source back with `Set`. The reducer ignores an unknown `id` and changes no other field, so a late report can't bring back a removed source or overwrite a newer one.

An `authRequired` state carries a `reason` specific to model sources: `required` (no credential yet), `expired` (its lifetime or lease lapsed), `rejected` (the endpoint refused it), or `revoked` (a client revoked it). See [Model source credentials](/specification/authentication#model-source-credentials) for what clients do with each.

`credentialResource` is the RFC 9728 metadata for the endpoint the credential is for. The host reports it in every state while the source takes a credential, so any client can deliver, rotate, or revoke one, and leaves it absent for a source that needs none. `accountId` names the key the host most recently accepted.

#### Catalog

When a registered source is `ready`, the host adds it to the catalog of the agent named by `provider`, through `root/agentsChanged`: a `ModelSourceInfo` with the source's `id` and `displayName`, and its models in `models` with `modelSourceId` set to that `id`. `modelSourceId` alone doesn't mark a registered source, because an agent's own sources use it too. A source is registered when `modelSources` has an entry with that `id` whose `provider` is the agent.

**Built-in sources.** A source the agent provides itself, such as a first-party service that ships with the agent, stays an agent-declared `ModelSourceInfo`. The host lists it and its models in `AgentInfo` directly, and its sign-in uses `AgentInfo.protectedResources` and an untargeted `authenticate`. It isn't a registered source. Clients register sources only for configuration the agent doesn't have.

Once a registered source has been `ready`, the host keeps its models listed through later `starting` and `authRequired` states, so a key rotation or expiry doesn't change the catalog or break a selection. It withdraws them when the source is removed, when its last contributing client leaves under `contributingClient` retention, when it enters `error`, or when an update mints new model IDs (see [Reserved model IDs](#reserved-model-ids)). The host MAY list the `ModelSourceInfo` in any state.

Any client can select a registered source's models, in any session whose agent is the source's `provider`. The host checks every selection: the model is listed, the chat is backed by the source's agent provider, and, when the host restricts sources by principal, the turn's client acts for the source's principal. It checks whenever it uses a selection, including when a client continues a turn with `chat/turnResume`. Otherwise it rejects the selection through the existing failure paths: `InvalidParams` for requests, and `rejectionReason` for dispatched actions. The host MUST NOT run the work on a different model. A turn that can't use its source ends with the resumable `modelSourceUnavailable` error, as described in [Model source credentials](/specification/authentication#model-source-credentials).

#### Retention

The client that registers a source chooses what happens when the last contributing client leaves. Absent means `contributingClient`, the narrower choice.

A contributing client leaves when its connection closes and it doesn't reconnect with the same `clientId` within a grace period the host chooses. While other contributing clients remain, nothing changes. When the last one leaves:

- With `contributingClient`, the source goes away, like a client-published plugin: the host withdraws its models from the catalog, new work that names them fails, turns already running on it finish, and then the host removes the source with `root/modelSourceRemoved` and drops its credential.
- With `host`, the source stays, like a host-declared MCP server, with its credential in memory and no contributing clients, until a client removes it or host policy expires it. A restart drops its credential, as described below.

When the user removes the source from their configuration, their client removes it, whatever its retention, so `host` retention doesn't leave sources nobody wants. The host MAY expire `host`-retained sources.

A client that reconnects with the same `clientId` within the grace period is still counted. A client that comes back with a new `clientId` and the same configuration re-registers with `Set`, which keeps the status and credential. After a restart, a host that persists its state SHOULD keep `host`-retained sources and their definitions, which come back through `starting`, and reach `authRequired` with `reason: required` only if they need a credential.

#### Principals

AHP doesn't verify which client is which, so every connected client may change, supply credentials for, and select every model source, as with MCP servers. Where a host can verify principals, it MAY restrict changes, credentials, and use of a model source to clients of the principal that registered it, and rejects the rest through the usual failure paths. Root state still lists every model source, with its definition, to every client, so neither is private. A host whose connections carry credentials scoped to one client, such as a relay that forwards each client's own sign-in, SHOULD NOT let one client's model source be used by another: it restricts sources by principal, or doesn't advertise `modelSourceRegistration`.

The grace period and any restriction by principal are host policy. The capability doesn't advertise them, because a client doesn't change what it does or shows because of them.

#### Reserved model IDs

Drafts, pending messages, history, and automation definitions keep a selection after its source goes away, and a chat keeps them when it moves to another session. Once the host publishes a model ID for a registered source, that ID is bound to that source and its upstream model for as long as the host keeps state, including after the source is removed and across a restart. The host MUST NOT resolve the ID to anything else. It MAY publish the ID again only when the same source comes back offering the same upstream model. A model's upstream identity is the endpoint the agent sends its requests to plus that endpoint's model identifier. A change to `provider` or `format`, or a definition change that moves the endpoint, makes it a different upstream model, so the host mints new IDs, even when a different client made the change.

A host SHOULD derive each model's ID deterministically from the source (its `id`, `provider`, and `format`), the endpoint, and the endpoint's model identifier, for example with a hash. The same model then gets the same ID when its source is registered again or the host restarts, without a stored table, and a moved endpoint gets a new one.

#### Automations

An automation may name a registered source's model when the source has `host` retention, or was registered by the host. The host SHOULD reject an automation create or update that names a model from a `contributingClient`-retained source, because the automation would outlive the source. If the source isn't `ready` when a run starts, the run fails through the automation run lifecycle.

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
| `root/modelSourceStateChanged` | Server | Sets a registration's host-reported fields. A no-op for an unknown `id` |

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
