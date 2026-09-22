# Accounts Channel

<StabilityIndex level="1.0" />

The optional `ahp-accounts://` channel provides account-safe sign-out for
client-brokered credentials on a shared host. The host owns admission, consumer
selection, credential invalidation, and affected-work cancellation. Clients
still acquire tokens. No host-owned OAuth flow is required.

The [generated reference](/reference/accounts) describes the canonical types,
commands, and actions. The [proposal rationale](../proposals/client-brokered-revocation.md)
explains the design choices and relationship to future acquisition modes.

## 1. The failure to prevent

Two clients share a host, but not a local token cache:

```text
A supplies account A -> B selects account B -> A signs out
```

A's cache cannot tell which credential the host currently uses. An unconditional
`authenticate({ resource, token: "" })` can clear B's credential. Comparing the
token A last sent is also insufficient: another client may have renewed A's
token, and providers or reconnect caches may still hold older copies.

The required operation is **remove this host account's authorization lifetime**,
not "clear whatever currently authenticates this resource." The host decides
atomically which credentials and work depend on that account. This contract
must be the same for an IDE, CLI, browser, or other AHP client.

## 2. Scope

The [authentication spec](./authentication.md) describes
connection-scoped credentials, delivered independently per protected resource.
That is not the shared-host behavior motivating
[#153](https://github.com/microsoft/agent-host-protocol/issues/153). Sharing a
credential across connections changes its ownership and lifetime; it cannot be
introduced implicitly through metadata.

| Mode | Credential acquisition | Credential use and sign-out |
| --- | --- | --- |
| Existing client-brokered baseline | Client obtains and pushes tokens. | Connection-scoped; no account-safe shared-host revocation guarantee. |
| Shared client-brokered mode | Client still obtains tokens. Host validates and admits them to an account. | Host-authoritative account state, explicit consumer selection, account-scoped removal across connections. |
| Future host-owned acquisition | Host obtains and may refresh credentials. | Could use the same account lifecycle later; not required here. |

This channel depends only on AHP initialization, subscriptions,
actions, reconciliation, authentication discovery, and token delivery.
It does **not** require host-run OAuth, `authComplete`, device-code or browser
relay flows, a challenge catalogue, refresh-token storage, or a cross-session
account-preference system.

The host can remove its copies of a brokered credential without revoking the upstream grant;
account IDs name revocable authorization lifetimes; and rejected removals use
the existing ordered
[`ActionEnvelope.rejectionReason`](../guide/reconciliation.md), not silence.
Integration with other acquisition modes must preserve those guarantees.

### Identity, selection, and ownership

- **Account ID:** opaque and host-assigned, scoped to a host authority. All
  accepted rotations and resource/scope variants in the same authorization
  lifetime use the same ID, regardless of which client supplied them.
- **Verified identity:** the host establishes identity through a trusted
  provider: for example, an authenticated issuer/tenant and stable subject.
  Pairwise subjects from different OAuth clients require a trusted mapping.
  Email, display label, client-local account ID, and token equality are not
  identity proofs. Opaque tokens do not justify an unverified identity claim.
- **Consumer:** an agent's `(provider, resource)` or a session's exact MCP
  customization, as defined below using existing AHP state. A consumer selects
  an account; a token refresh does not select a consumer.
- **Work:** the host records the account lifetime actually authorizing a unit
  of work. Switching a consumer to B does not relabel already-running A work.

The host MUST verify that a replacement token belongs to the named account.
It MUST NOT accept an account ID as evidence of identity or permission. If a
provider cannot establish identity across rotation and brokers, that provider
cannot participate in this shared mode; token fingerprints are not a fallback.

Removal is host-local, across the clients sharing that authorization lifetime.
It does not sign the person out of other hosts or revoke all of their OAuth
grants. Clients must describe that scope. Independently owned host grants and
ambient credentials MUST NOT be coalesced into a brokered account's lifetime.
An ambient credential the host cannot stop rediscovering is not removable.

## 3. Wire surface

The source of truth is [the accounts reference](/reference/accounts), generated
from the canonical types. All operations use existing AHP channel routing.

### Accounts state and actions

The singleton state channel `ahp-accounts://` uses ordinary
`subscribe`, snapshots, ordered action envelopes, and reconnect replay. Reading
the account list and mutating it are separately authorized by host policy;
`subscribe` may fail with `PermissionDenied`. Account IDs are not permissions.

[`AccountsState`](/reference/accounts#accountsstate) has two required keyed
collections: `accounts: HostAccount[]` and `attempts: AuthAttemptState[]`.
Each account has `id`, `label`, `removable`, and `consumers`. Each attempt has
`id`, `consumer`, `resource`, and a discriminated outcome:

| Status | Additional required data |
| --- | --- |
| `pending` | None; it authorizes no credential use. |
| `completed` | `accountId`, the admitted host lifetime. |
| `failed` | `error: ErrorInfo`, without secrets. |

Clients MUST preserve unknown future statuses without interpreting them as
success. Unknown token-binding kinds, by contrast, MUST be rejected.

`id` is host-assigned and `label` is display text, never an identity proof.
`removable` describes whether local removal is possible, not whether a grant
can be revoked upstream; caller authorization is still checked on every
mutation. `consumers` records explicit selections, never token contents.
No credential inventory, account-health state, or public lineage graph is added.

| Action | Producer | Reducer and host behavior |
| --- | --- | --- |
| `accounts/set` | Host | Upsert the complete account by `id`; insert or replace in place. |
| `accounts/removed` | Client or host | Remove by `id`, a no-op when absent. The host performs the revocation boundary before accepting a client's action. |
| `accounts/authAttemptSet` | Host | Upsert the complete attempt by `id`. Expiry or failed admission becomes `failed` with an `ErrorInfo`. |
| `accounts/authAttemptRemoved` | Client or host | Remove by `id`, a no-op when absent. Client removal cancels a pending admission before acceptance; host removal also garbage-collects terminal attempts. |

A client trying to cancel an already completed/failed attempt receives an
ordered rejection, leaving the terminal result available to reconcile. If
completion won the race, the client reads its `accountId` and removes the
account separately. A host MUST retain a completed outcome while its account
lifetime is live, including across restart if that lifetime is retained.
Failed outcomes and receipts for already removed accounts MAY expire under
host policy. An absent attempt in a reconciled authoritative snapshot therefore
cannot own a still-live account. While disconnected or denied access, outcome
remains unconfirmed. Cancelled or expired attempts cannot install credentials.

**Consumer discovery does not need a new challenge catalogue.** The agent key
comes from `AgentInfo.provider` and its advertised `protectedResources`. The MCP
key is the session URI plus the `id` of its host-published
`McpServerCustomization`, not a server name or manifest URI guessed by a client.
The host resolves the MCP resource from that server's current auth requirement
or existing binding and captures it for the attempt. It rejects an unknown
consumer or one whose resource it cannot determine.

These MCP keys intentionally identify a live session customization, not a
persistent cross-session preference. If the session/customization disappears,
or its resource changes during admission, fail with `Conflict` and require a
fresh target. Hosts MUST NOT reuse the same key for a different consumer while
bindings or attempts still reference it. Missing bindings never fall back to a
different account. Longer-lived MCP identity can be added independently later.

### Brokered admission and token delivery

The typed `InitializeResult.authentication` capability and
[`authBegin`](/reference/accounts#authbegin) request use **`clientBrokered`**
to mean "reserve admission of a client-supplied credential," not "the host runs OAuth." It is the only flow
required here. Tokens still travel only in `authenticate`, never in actions,
state, or `authBegin`.

| Surface | Required shape |
| --- | --- |
| Capability | `authentication.flows` includes `{ kind: "clientBrokered" }`. |
| `authBegin` params | `channel: "ahp-accounts://"`, `target: { consumer }`, `flows`; optional explicit live `accountId`. |
| `authBegin` result | `flow: "clientBrokered"`, `attemptId`. |
| Admission binding on `authenticate` | `binding: { kind: "attempt", attemptId }`. |
| Renewal binding on `authenticate` | `binding: { kind: "account", accountId }`. |
| Bound `authenticate` result | `accountId`. |

The optional fields preserve the baseline wire shape. In shared brokered mode,
`binding`, a **nonempty** token, and the successful result's `accountId` are
required. Missing fields are errors, not requests to infer an account. A client
receiving a success response without `accountId` for bound delivery MUST report
the outcome as unconfirmed and reconcile; it MUST NOT retry without the binding.
Account-bound renewal MUST return the requested account id; a different id is
a protocol failure, not an implicit account switch.
`flows` must offer `clientBrokered`; an empty or unsupported offer is rejected
with `InvalidParams`, without creating an attempt or starting another flow.

### Admission is distinct from renewal

1. The client selects a consumer from existing root/session state, then calls
   `authBegin` with `flows: [{ kind: "clientBrokered" }]`. `accountId`, when
   present, explicitly names a live account to reauthorize; omission means
   admission of an identity. Neither intent is inferred from a challenge.
   The host validates the target and flow before recording the attempt.
2. The host records a single-use attempt, its initiating connection's
   authorization context, target, account intent, and place in host order.
   The attempt captures the consumer's current binding and resource as
   preconditions. Only that authorized context, including a verified reconnect,
   may complete or cancel it; `attemptId` is not a bearer authorization.
   A change to the consumer selection/resource invalidates competing pending
   attempts, even if a later change restores the original selection.
3. The client obtains a token and supplies it with `binding.kind: "attempt"`.
   The host verifies identity, resource, ownership/lineage, and the still-live
   attempt. Admission reuses the live account ID for that verified identity
   and ownership lifetime, or allocates one if none exists. Explicit
   reauthorization MUST match the requested account, not silently switch it.
4. The host commits the credential and intended consumer selection, publishes
   `accounts/set` and a completed `accounts/authAttemptSet`, and returns
   `accountId`. A conflicting consumer selection since `authBegin` fails with `Conflict`
   rather than overwriting the newer choice.
5. Subsequent rotation uses `binding.kind: "account"`. It updates credentials
   under that live account **without changing any consumer's selection**.

The extra admission step is necessary: otherwise any reconnect cache could
resurrect a removed account by replaying a token without an account ID.
Uncertain admission results are reconciled through the attempt state; they
are not retried as unbound authentication.

If a consumer move needs multiple keyed actions, detach it from the old account
before attaching it to the new one. The host's authorization decision is atomic;
an intermediate client view must neither contain duplicate selection nor cause
fallback to another identity. These are host-authored `accounts/set` actions
computed from current authoritative state, not client-authored replacement
arrays. A separate `accounts/updated` binding-management API is not required.

For resource matching, use the exact identifier the host advertised. Admission
must match the attempt's target; renewal must be authorized for that resource
under the live account and cannot add consumer bindings. Do not infer ownership
from a resource shared by two agents or MCP servers. Scope names are
case-sensitive; order and duplicates do not change a scope set. Missing `scopes`
means unknown, not "all scopes." Existing `expiresIn` rules still apply. Account
removal is deliberately **not** limited to the scope set or resource known to
the signing-out client.

### Capability and compatibility rules

The capability defined above is advertised as an initialize-result fragment:

```json
{
  "authentication": {
    "flows": [{ "kind": "clientBrokered" }]
  }
}
```

This uses AHP's existing typed-capability system, with no dependency on another
authentication proposal. The client selects the flow in `authBegin`; no
duplicate client capability is needed. The host must return
`flow: "clientBrokered"` before an attempt-bound transfer. Renewal under an
already admitted account requires the advertised flow and reconciled account
state, not another admission attempt. Clients explicitly subscribe to
`ahp-accounts://`; its state/actions are not sent to unsubscribed legacy clients.
Account operations remain subject to the negotiated protocol version and
account-channel permissions.

- An old host cannot advertise this contract merely by ignoring new fields.
  Clients MUST NOT send the new bound form without support for this flow,
  or fall back to empty-token revocation, unbound delivery, or a private method.
  Local sign-out can still happen, but host sign-out must be reported as
  unsupported or unconfirmed, never as completed.
- A supporting host MUST reject unbound token delivery and empty-token
  revocation into a shared account-managed authentication context, including
  from legacy connections. It may keep genuinely isolated baseline contexts.
  A legacy connection MUST NOT be allowed to overwrite or resurrect the shared
  credential through the old path.
- Existing shared, untracked credentials cannot be silently adopted. The host
  must first establish their identity, ownership, replay, and work boundaries,
  or decline this mode. If old and new contexts cannot be isolated, reject the
  incompatible use rather than pretending both guarantees hold.
- Capability checks use typed protocol fields, not `_meta`, software names,
  or software-version heuristics. The capability is optional within `0.9.0`;
  the four actions have registry entries at `0.9.0`, but version recognition
  alone MUST NOT substitute for the `clientBrokered` capability.

## 4. The host's revocation boundary

`accounts/removed { id }` is the entire request. No resource, token, hash,
client-supplied identity, or "unconditional" flag accompanies it.

Authentication commit, consumer selection, removal, derived credential
installation, and provider replay MUST share the host's authoritative ordering
boundary whenever their account lifetimes or consumers overlap. Token
validation can happen outside that boundary, but its result is not usable
until the host revalidates and commits it inside the boundary.

Conceptual host pseudocode, not a prescribed cache or service implementation:

```text
commitAuthentication(validatedCredential, binding):
    atomically in host order:
        require authorized caller, live binding, matching verified identity
        if binding is an attempt:
            require admission still valid and consumer precondition still matches
        require every credential dependency still live
        install under that account lifetime
        publish committed account/attempt state
        return accountId

removeAccount(id):
    atomically in the same host order:
        require permission
        if account is absent: echo accepted no-op; return
        require removability
        affected = this lifetime and its dependent authorization lifetimes
        fence all affected credential use, installation, refresh, and replay
        invalidate affected pending admissions and credential installations
        persist the removal boundary if any related state survives restart
        cancel only work owned by or credential-dependent on affected lifetimes
        publish dependent removals and affected work state
        remove this account and echo the originating action
    finish cleanup without restoring revoked access
```

The account's current consumers are **not** the entire revocation set. The host
must invalidate every usable or replayable credential in its lifetime, including
rotated tokens, other scope sets/resources, provider-held copies, pending
refresh/exchange results, and credentials held by previously started work.
Revoking an inactive A must not clear B's current credential; old A work, if
still credential-dependent on A, must nevertheless stop.

### Ordering, admission races, and restart

- **Renewal commits first:** removal invalidates the renewed credential too.
  **Removal commits first:** renewal with that account ID fails with `Conflict`
  (`-32011`), even if token validation or an exchange began earlier.
- **Unidentified admission races removal:** after verifying identity, the host
  MUST reject an attempt admitted before the latest removal of that identity
  in the same ownership context, or of any required parent lifetime. Calling
  it a "new account" must not bypass this check. The host retains enough ordered
  removal evidence while such attempts can still complete.
- **Deliberate sign-in after removal:** a fresh, authorized `authBegin` can
  admit a new lifetime. It receives a new account ID; a retired ID is never
  reused. Clients MUST NOT start this flow automatically to recover a revoked
  account, from a replay cache, or in response to an auth-required notification.
  This is local revocation, not a defense against a newly authorized sign-in.
  An auth-required notification for a still-live account may drive an ordinary
  bound refresh; it does not authorize readmission of a removed account.
- **Provider registration/replay:** read live authority at installation time,
  not a captured token list. A provider arriving during removal cannot receive
  the removed credential, nor can late completion reinstall it.
- **Reconnection:** reconcile accounts/attempts through replay or snapshots
  before sending tokens. A live account ID may be renewed; an absent or retired
  ID must be dropped from reconnect caches. Lost admission/removal responses
  are an uncertain outcome until reconciled. Retrying removal of the same ID
  is safe; retrying authentication without its binding is not.
- **Restart:** persist account identity and the removal boundary together with
  any retained credentials/attempts. Alternatively discard those credentials
  and attempts and require fresh admission. Never reload credentials while
  forgetting their revocation. Fresh initialization cannot silently downgrade
  a cached shared credential to legacy authentication.

These are rules over account/attempt lifetimes and existing host order, not a
new client-maintained generation counter. The account ID is stable throughout
rotation; it changes only when a removed authorization lifetime is newly admitted.

Clients also cancel or serialize their own pending admission/renewal work when
local sign-out begins and evict every cached credential for the affected host
account. If a first admission wins a cancellation race, the client must recover
its `accountId` and remove it. Until it can establish that outcome, it reports
host sign-out as unconfirmed. Client cache cleanup complements the host boundary;
it never substitutes for it.

### Rejection and failure are observable

| Condition | Required outcome |
| --- | --- |
| Malformed binding, empty token in shared mode, or unadvertised/mismatched resource | `InvalidParams` (`-32602`); no credential commit. |
| Caller lacks authority to admit, use, or remove the account | `PermissionDenied` (`-32009`) for requests; ordered `rejectionReason` for a dispatched removal. |
| Retired account, consumed/cancelled attempt, stale consumer selection, or revoked dependency | `Conflict` (`-32011`); no automatic fresh admission. |
| Invalid token for a still-live target | `AuthRequired` (`-32007`) with the existing required resource metadata; no partial installation. |
| Repeated removal of an absent account | Accepted ordered echo, pure reducer no-op, no effect on any other account. |
| Non-removable account or failure to establish local containment | Rejected ordered echo with an explanation; do not claim sign-out succeeded. |
| Cleanup fails after effective containment | Keep access fenced and the account removed; surface the failure through appropriate existing error state/logging, without resurrecting credentials. |

Rejected actions retain their `origin` and carry `rejectionReason`, so optimistic
clients can reconcile. Silence, an empty success-shaped result on failure, and
putting secrets in errors are not allowed.

Clients MAY optimistically update account state, but MUST NOT report host
sign-out as confirmed until the accepted echo or authoritative reconciliation
establishes removal. Local token eviction alone is not that confirmation.

If containment fails after some credentials have already been invalidated,
rejection does not restore them. The account identity may remain while its
consumers report authentication failure; retry can complete removal. An
accepted echo means the host has contained credential use and replay, not that
an upstream OAuth server has revoked a grant.

For client-brokered grants, the host MUST NOT revoke the client's upstream grant
under this contract. Upstream revocation of independently host-owned grants is
outside this proposal. Remote failure must never undo a completed local removal.

## 5. Dependent credentials and active work

### Dependency, not provider names

A host may derive credential D from a source account S. D's authorization
lifetime depends on S even if D has a different issuer, resource, subject, or
expiration. The host records this dependency when admitting the exchange:

```text
source account S ----required authorization----> derived account D
remove S -> invalidate S and D
remove D -> invalidate D, leave S usable by its other consumers
```

Required dependencies are transitive and acyclic. Rotation does not sever them.
An exchange completing after a parent was removed MUST NOT install its result.
An independently acquired credential for the same principal is not evidence of
dependency and must not be merged into this lifetime or silently substituted
after removal.

Removing D also fences exchanges targeting D itself, even while S remains live.
The host MUST NOT silently recreate D or its consumer selection from S on the
next request; another D lifetime requires deliberate authorized admission.
S remains usable by its other consumers, not as an automatic undo of D's removal.

This is an obligation on the host's credential owner, not a new client-maintained
graph or a public credential-management API. Hosts/providers that observe the
derivation establish the edge. If derivation happened elsewhere and the host
cannot establish its ownership/lineage, it MUST NOT admit it as an independent
credential under this guarantee. How to convey trustworthy externally produced
lineage is left for review, not papered over with metadata.

### Stop affected work promptly

At the revocation boundary the host MUST stop admitting new affected work,
invalidate pending credential deliveries, and initiate cancellation of active
affected turns/operations. It MUST NOT wait for token expiration, an idle turn,
or an upstream revocation request. Queued approvals, callbacks, refreshes, and
stream events must not restart the stopped work.

The host publishes existing terminal turn state, such as `chat/turnCancelled`
or `chat/error`, and existing `McpServerAuthRequiredState` /
`ToolCallAuthRequiredState` where applicable. Agent requests continue to use
`AuthRequired` errors and `auth/required` notifications. No new challenge
catalogue, cancellation RPC, or account-health enum is required.
Action delivery remains normally ordered; this does not invent an
atomic cross-channel notification. Dependent removals and cancellation state
are published before the accepted root account-removal echo. Intermediate
client views never authorize credential use.

Cancellation follows **actual credential and operation ownership**, not a walk
of the chat tree:

| Work | On removal of A |
| --- | --- |
| Active work using A, including background or independently steered work | Stop: independence from a parent turn does not preserve a revoked credential. |
| Work still using A after its consumer switched to B | Stop A work; preserve B's credential and B work. |
| B work sharing A's provider process, session, or parent chat | Preserve; sharing a container or ancestry is not authorization dependency. |
| A genuinely turn-bound child operation owned by the cancelled turn | Cancel through that ownership boundary. |
| An idle or independently running child using unrelated credentials | Do not cancel merely because its parent stopped. |

An SDK abort may fail or never reply. The host must still contain the affected
credential scope, including stopping an isolated runtime if necessary, and
publish the terminal state rather than await that callback indefinitely. If the
host cannot do so without terminating unrelated accounts' work, it cannot
advertise this shared mode for that configuration. A blanket provider restart
is not an account-safe implementation.

Already-dispatched external side effects may be irreversible. This contract
does not promise rollback; it requires containment of further credential use
and honest terminal/error state.

## 6. Compact wire walkthrough

Assume the host advertised `clientBrokered` and root state advertises provider
`assistant` with protected resource `https://api.example.test`.
The following arrays are ordered JSON-RPC transcripts, not batch requests.

First admission (the host, not the client, assigns `account-a`):

```json
[
  {
    "jsonrpc": "2.0", "id": 2, "method": "authBegin",
    "params": {
      "channel": "ahp-accounts://",
      "target": {
        "consumer": {
          "kind": "agent", "provider": "assistant", "resource": "https://api.example.test"
        }
      },
      "flows": [{ "kind": "clientBrokered" }]
    }
  },
  {
    "jsonrpc": "2.0", "id": 2,
    "result": { "flow": "clientBrokered", "attemptId": "attempt-1" }
  },
  {
    "jsonrpc": "2.0", "id": 3, "method": "authenticate",
    "params": {
      "channel": "ahp-root://", "resource": "https://api.example.test",
      "token": "example-token", "scopes": ["chat"], "expiresIn": 3600,
      "binding": { "kind": "attempt", "attemptId": "attempt-1" }
    }
  },
  { "jsonrpc": "2.0", "id": 3, "result": { "accountId": "account-a" } }
]
```

The host also publishes `accounts/set` and `accounts/authAttemptSet` with
`status: "completed"` and `accountId`. Another broker renewing A uses
`binding: { "kind": "account", "accountId": "account-a" }`; neither the ID nor
consumer selection changes because the token changes.

Later B has deliberately selected its different account for the same consumer.
An illustrative **confirmed** accounts-state fragment is:

```json
{
  "accounts": [
    { "id": "account-a", "label": "Account A", "removable": true, "consumers": [] },
    {
      "id": "account-b", "label": "Account B", "removable": true,
      "consumers": [
        { "kind": "agent", "provider": "assistant", "resource": "https://api.example.test" }
      ]
    }
  ]
}
```

A signs out using only its host-issued ID. B stays selected and usable:

```json
[
  {
    "jsonrpc": "2.0", "method": "dispatchAction",
    "params": {
      "channel": "ahp-accounts://", "clientSeq": 7,
      "action": { "type": "accounts/removed", "id": "account-a" }
    }
  },
  {
    "jsonrpc": "2.0", "method": "action",
    "params": {
      "channel": "ahp-accounts://", "serverSeq": 42,
      "origin": { "clientId": "client-a", "clientSeq": 7 },
      "action": { "type": "accounts/removed", "id": "account-a" }
    }
  }
]
```

If policy rejects removal, the same ordered envelope carries, for example,
`rejectionReason: "This account cannot be removed by this connection"`, and is
not reduced into confirmed state. A stale renewal is a request failure:

```json
{
  "jsonrpc": "2.0", "id": 4,
  "error": {
    "code": -32011,
    "message": "The account authorization lifetime is no longer live"
  }
}
```

## 7. Host acceptance cases

These are required host integration behaviors. The repository's shared
reducer/serialization fixtures and client tests validate the wire and state
projections, not a credential-holding host. Pure reducers cannot establish
provider containment, OAuth lineage, or work cancellation.

| Case | Required observable result |
| --- | --- |
| Host implements only client-brokered accounts, without host-owned acquisition or a challenge catalogue | Advertise `clientBrokered`, admit a token for an existing root/session consumer, rotate it, and remove the account using only the surface in section 3. |
| A's dedup cache is stale after B selects a different account | Removing A preserves B's tokens, selection, and active work; no empty-token clear is sent for B. |
| Another client rotates A before removal | Remove every A credential, including the new token; same host account ID throughout rotation. |
| A has read/write, unknown-scope, and multiple-resource credentials | Remove all A variants, with no scope/resource guessed from the signing-out client's cache. Preserve B variants sharing the same resource. |
| A renewal or B selection is concurrent with removal | Both host orderings satisfy the rules in section 4; no stale commit can restore A or clear B. |
| An old admission/exchange completes after removal | Identity/dependency validation rejects installation, including an attempt initially lacking a known account ID. |
| A deliberate post-removal admission succeeds | New account ID; an old removal retry cannot remove the new lifetime. |
| A rotation presents B's identity, or an untrusted issuer/subject claim | Reject without replacing A or moving its consumers. |
| A provider registers or replays during removal | It receives no removed credential, including after asynchronous provider completion. |
| A client reconnects after missing removal | Snapshot/replay invalidates its cached handle; renewal gets `Conflict`, never unbound replay or automatic admission. |
| Removal/admission acknowledgement is lost | Reconcile via state; report uncertainty until resolved, never infer success from local cache eviction. |
| Host restarts after accepted removal, including storage-cleanup failure | No revoked credential or pending attempt becomes usable; retained removal evidence or discarded credential state prevents replay. |
| Client connects to an older host | No new bound token or unconditional revoke is sent; local sign-out is distinguished from unsupported host sign-out. |
| Legacy client sends unbound auth into an account-managed context | Reject or route only to a genuinely isolated baseline context; never mutate the shared account. |
| Duplicate, unauthorized, or non-removable account removal | Absent account: ordered no-op. Denied removal: ordered rejection with origin; optimistic state reconciles. |
| Client cancels an admission while token validation completes | Cancellation first prevents installation. Completion first rejects cancellation and preserves the result so the client can remove its account. |
| Client reconnects long after losing admission completion | Retain the completed receipt while its account is live; a reconciled absent attempt has no live admitted lifetime. |
| A consumer changes from A to B and back while admission is pending | Invalidate the old attempt on the first change; it cannot pass a later equality check and overwrite the newer selection. |
| SDK abort fails or hangs during sign-out | Further credential use and replay are fenced promptly; affected work reaches terminal state without waiting for expiry or idle. |
| A source is removed while derived access is live or being exchanged | Invalidate the transitive dependents, reject late exchange results, preserve unrelated accounts. |
| Only the derived account is removed | Source remains available to its other consumers; no reverse cascade. |
| Source remains live after derived-account removal | Automatic re-exchange cannot recreate the removed derived access or consumer binding; a new lifetime requires deliberate admission. |
| Parent turn uses A, independent child uses B | Stop the parent; preserve B child. An independent child actually using A must stop. |
| Two MCP servers or agents share resource and scopes but not account selection | Delivery and revocation honor exact consumers and account lifetimes, not broad resource fan-out. |
| MCP customization disappears, is replaced, or changes resource during admission | Reject the stale target; do not fall back by server name or select another account. |

## 8. Implementation boundary

The canonical types, pure reducer, generated schemas and client mirrors expose
this contract. A host advertises the capability only after implementing the
authoritative credential, replay, dependency, and work-containment rules above.
Successful serialization or reduction is not evidence of those host guarantees.
