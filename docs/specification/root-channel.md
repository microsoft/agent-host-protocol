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
}
```

- `agents` — agent backends the server can speak to, including any `protectedResources` they require for authentication. See [Authentication](/specification/authentication).
- `activeSessions` — count of non-disposed sessions. Lightweight badge counter.
- `terminals` — lightweight per-terminal metadata for rendering a terminal manager UI without subscribing to every terminal. See [Terminal Channel](/specification/terminal-channel) for the full state.
- `config` — host-level configuration schema and current values.

The session list is **not** part of root state. Clients fetch it imperatively via [`listSessions`](/reference/root#listsessions) and patch it from `root/*` notifications described below.

### Model sources and selection

One agent harness can expose models from several sources. `AgentInfo.provider`
and `SessionModelInfo.provider` continue to identify that **harness**. They MUST
NOT be repurposed as a model-source, vendor, subscription, or authentication
identity. `SessionModelInfo.vendor` remains a display-oriented vendor string.

A **model source** is an independently selectable source of model access
exposed by an agent harness. It describes availability and selection, not the
provenance of individual inference calls.

An agent MAY advertise `modelSources: ModelSourceInfo[]` alongside `models`.
A descriptor contains only an opaque `id` and a `displayName`. Its ID is stable
within the host and owning harness; labels need not be unique and MUST NOT be
used as identity. IDs MUST NOT be reassigned to a different source. They are
not global account or billing identities, authorization proof, or inherently
safe telemetry values. Availability can depend on the host's current context;
a session-scoped roster does not establish universal pre-session availability.

The full identity of a qualified model is
`(host, harness, modelSourceId, rawModelId)`. The raw `SessionModelInfo.id` and
`ModelSelection.id` MUST remain unchanged: presentation keys MUST NOT be sent
as model IDs to the runtime or its policy allowlists.

#### Atomic catalog

Descriptors and model rows form one catalog in each `AgentInfo`, delivered
together in root snapshots and replaced together by `root/agentsChanged`:

- Descriptor IDs MUST be unique within the owning agent.
- Every `SessionModelInfo.modelSourceId` MUST reference a descriptor in that
  same agent's `modelSources`.
- `(modelSourceId, id)` MUST be unique within the agent. If a raw ID occurs
  more than once, every occurrence MUST be qualified with a different source.
  An unqualified row MUST NOT collide with another row's raw ID.
- A known source MAY have zero models. Missing or empty catalogs do not imply
  that a user needs to sign in, supply an API key, or has a default subscription.
- Missing source fields retain legacy, unqualified identity. Peers MUST NOT
  invent provenance from a vendor, display label, model name, or default.

Hosts MUST NOT publish dangling references or duplicate identities. Clients
encountering them MUST surface an invalid catalog rather than repair it by
guessing a source or offer the invalid entries for selection. Previously
saved selections and history may reference sources no longer available;
they MUST retain their identity, but are not evidence of current availability.

#### Mutual capability gating and legacy projection

The client opts in with
`InitializeParams.capabilities.modelSourceSelection: {}`. An agent promises
exact-pair handling with `AgentInfo.capabilities.modelSourceSelection: {}`.
Both presence flags are required before a client sends a qualified selection.
Negotiating `1.1.0` (or any other protocol version) alone establishes neither
flag. Catalog fields alone also do not promise selection support.

A host MUST expose an ambiguous-by-bare-ID catalog only to an acknowledging
client and only for a supporting agent. For a client that did not opt in, the
host MUST project a safe legacy catalog: omit **all** rows for each ambiguous
raw ID, not choose the first source, merge rows, or add a display suffix and
leave indistinguishable selectable IDs. Remaining selectable rows MUST resolve
safely under the host's established unqualified behavior. A host MAY omit all
qualified rows. The same projection MUST apply to snapshots, updates and replay.

Reconnect retains the original capability declarations and projection. A client
whose capabilities changed MUST initialize afresh; a host unable to recover the
declarations MUST require fresh initialization rather than assume support.
Neither peer may downgrade a saved qualified selection to an unqualified one.
For an incapable client, the host MUST reject operations that could execute or
replace qualified message, draft, pending-work or automation selections without
preserving their qualifier. Unrelated, non-model-affecting operations may
continue. This does not change genuinely unqualified legacy selection behavior.

For example, after mutual opt-in an agent can advertise this partial catalog
(the labels are illustrative, not protocol-defined source kinds):

```json
{
  "provider": "example-harness",
  "displayName": "Example agent",
  "description": "One harness, multiple model sources",
  "capabilities": { "modelSourceSelection": {} },
  "modelSources": [
    { "id": "source-a", "displayName": "Service A" },
    { "id": "source-b", "displayName": "Service B" },
    { "id": "source-c", "displayName": "Service C" }
  ],
  "models": [
    { "id": "shared-model", "provider": "example-harness", "name": "Shared model", "modelSourceId": "source-a" },
    { "id": "shared-model", "provider": "example-harness", "name": "Shared model", "modelSourceId": "source-b" }
  ]
}
```

Selecting the second row is
`{ "id": "shared-model", "modelSourceId": "source-b" }`, optionally with the
existing `config` values. A client MUST qualify a selection made from a
qualified row. For a legacy client, both `shared-model` rows are omitted.

#### Exact selection and failure

A qualified [`ModelSelection`](/reference/root#modelselection) is an exact pair,
never a preference. The owning harness is determined by the session (or the
automation's session template), not by changing `AgentInfo.provider`.
Hosts MUST validate the exact pair when accepting a selection and revalidate
before executing queued, restored or automated work. An unknown source,
unavailable pair, unsupported qualifier, or qualifier lost by a downstream
adapter MUST explicitly fail. Peers MUST NOT strip it and retry a bare ID,
silently choose another subscription, or remap it during policy reconciliation
or resume. A raw-ID policy allowlist match does not authorize source fallback.

Use the existing failure paths: request validation failures return
`InvalidParams` (`-32602`), and rejected dispatched actions carry
`ActionEnvelope.rejectionReason`. `ProviderNotFound` (`-32002`) still refers to
the **agent harness**, not a model-source descriptor. Existing authorization
errors apply when appropriate. If accepted work later becomes unavailable or
switching fails, report failure through the existing chat or automation
lifecycle rather than execute a different pair.

The shared selection MUST be preserved through every applicable path:

| Surface | Selection-bearing value |
| --- | --- |
| Chat creation and first/subsequent turns | `createChat.initialMessage.model`, `chat/turnStarted.message.model` |
| Draft changes and saved drafts | `chat/draftChanged.draft.model`, `ChatState.draft.model` |
| Queued/steering updates and consumption | `chat/pendingMessageSet.message.model`, `PendingMessage.message.model`, the consuming message |
| Authoritative turn state, loaded history, resume, fork/copy/move, snapshot and reconnect | `Message.model` in active and retained turns |
| Automation create/update, saved definitions and run creation | `AutomationSessionTemplate.model` and the run's message selection |

An automation with a qualifier in either its session template or message MUST
persist an explicit `session.provider` at acceptance, including on updates;
see [qualified automation ownership](./automation-channel#qualified-model-ownership).
A later change to the default harness MUST NOT reinterpret that saved selection.

Moving or copying qualified state MUST also preserve its host/harness namespace.
A host MUST reject a transfer request with the existing `InvalidParams`
(`-32602`) error if it cannot preserve that namespace, leaving the source state
unchanged. It MUST NOT strip or rebind the qualifier, or reinterpret a matching
source ID under the destination harness. Identity-preserving transfers within
the same host and harness remain permitted subject to the operation's existing
validation rules. Genuinely unqualified legacy transfers are unchanged.

`createSession` itself has no model field; this feature adds no session-level
selected-model state, switch command, or new acknowledgement. Host-accepted
messages and their authoritative echoes MUST retain the exact pair. Acceptance
of a command, draft, pending message, or turn request is **not** proof that a
deferred runtime switch has activated. The host MUST wait for the exact pair to
be effective before executing the affected work, or fail it; it MUST NOT claim
activation while a switch is still deferred.

Requested/accepted selection is not actual-call usage provenance. This contract
does not add a usage ledger, billing or account binding; existing usage and
metadata extension points remain unchanged.

#### Implementation qualification

Schema and shared wire/reducer tests establish representation and preservation,
not deployment-level safe routing. Before advertising support, downstream
hosts/adapters need runtime tests for duplicate raw IDs, unavailable sources,
initial and subsequent selections, deferred switches, queued/steering work,
restore/resume, unsafe cross-harness transfers, policy allowlists, and old/new
client-host combinations.
Automation qualification MUST also cover a default-harness change between
create, update and run when both harnesses expose identical pair strings,
including template-only and message-only qualifiers. Check normalization or
rejection of omitted owners and preservation through whole-template updates.
In particular, policy reconciliation MUST be tested for silent fallback even
when the runtime accepted the original exact pair. Discovery also needs an
authoritative catalog for the advertised context, not an invented global roster.

The new optional fields are wire-compatible with absent-field legacy payloads,
not a promise of native binary compatibility. Rebuild generated-client
consumers; exhaustive Rust struct literals must initialize the new optional
fields (or use `..Default::default()` where available). Existing named/default
constructor calls can omit the fields; do not persist positional constructor
layouts as a compatibility contract.

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
| `dispatchAction` | client → server notification | Dispatch a root-scoped client action (currently `root/configChanged`). |

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
