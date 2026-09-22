# Account-safe sign-out on a shared host

> **Design draft, not implemented protocol.** This is a bounded addition to
> [#404, host-owned authentication](https://github.com/microsoft/agent-host-protocol/pull/404),
> not a replacement for it. It reuses that proposal's accounts channel,
> account-removal action, and sign-in attempts for **client-brokered**
> credentials. The wire sketches below are proposed changes, not fields that
> current clients or hosts support.
>
> No canonical types, generated clients, schemas, or protocol versions change
> in this PR. Normative words below describe the proposed contract.

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

## 2. Relationship to the existing designs

The [current authentication spec](../specification/authentication.md) describes
connection-scoped credentials, delivered independently per protected resource.
That is not the shared-host behavior motivating
[#153](https://github.com/microsoft/agent-host-protocol/issues/153). Sharing a
credential across connections changes its ownership and lifetime; it cannot be
introduced implicitly through metadata.

| Mode | Credential acquisition | Credential use and sign-out |
| --- | --- | --- |
| Existing client-brokered baseline | Client obtains and pushes tokens. | Connection-scoped; no account-safe shared-host revocation guarantee. |
| Proposed shared client-brokered mode | Client still obtains tokens. Host validates and admits them to an account. | Host-authoritative account state, explicit consumer selection, account-scoped removal across connections. |
| Host-owned mode in #404 | Host obtains and may refresh credentials. | Same accounts/removal model; host-owned OAuth flows remain separate. |

This draft deliberately amends three points in #404:

1. A pushed credential is not inherently **non-removable**. The host may forget
   its own usable copies without revoking a client's upstream grant.
   `HostAccount.removable` can be true for a negotiated shared brokered account.
2. An account ID names one **host-held authorization lifetime** for an identity.
   It survives token rotation, but is retired on removal. An independently
   owned grant must not be merged into that removal lifetime merely because
   the human identity is the same.
3. Rejected removals use the existing ordered
   [`ActionEnvelope.rejectionReason`](../guide/reconciliation.md), not silence.
   Successful sign-out also has a prompt, credential-scoped active-work rule.

Everything else stays small: `HostAccount` remains an identity plus consumers,
not a credential catalogue. No tokens, scope sets, expiry clocks, token hashes,
or credential-health fields are added to account state. No new revoke command
or vendor-specific metadata is introduced.

### Identity, selection, and ownership

- **Account ID:** opaque and host-assigned, scoped to a host authority. All
  accepted rotations and resource/scope variants in the same authorization
  lifetime use the same ID, regardless of which client supplied them.
- **Verified identity:** the host establishes identity through a trusted
  provider: for example, an authenticated issuer/tenant and stable subject.
  Pairwise subjects from different OAuth clients require a trusted mapping.
  Email, display label, client-local account ID, and token equality are not
  identity proofs. Opaque tokens do not justify an unverified identity claim.
- **Consumer:** reuse #404's `AccountConsumer`: an agent's `(provider, resource)`
  or an MCP server's host-published identity. Both union arms need a `kind`.
  A consumer selects an account; a token refresh does not select a consumer.
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

## 3. Minimal proposed wire surface

Reuse `ahp-accounts://`, `HostAccount`, `AuthAttemptState`, `accounts/set`,
`accounts/updated`, and key-only `accounts/removed` from #404. Secrets still
travel only in the existing `authenticate` request, never in actions or state.

Add one **`clientBrokered` flow kind** to #404's flow support/request, begin
result, and pending-attempt unions. It means "reserve a client-supplied
credential admission," not "the host runs OAuth." A broker-only host can
advertise just this flow; it need not implement device code, callback relaying,
refresh-token storage, or any host-owned acquisition.

```ts
// Additions to #404's flow unions; names are provisional.
interface ClientBrokeredFlow {
  kind: 'clientBrokered';
}

interface ClientBrokeredBeginResult {
  flow: 'clientBrokered';
  attemptId: string;
}

interface ClientBrokeredPendingState extends AuthAttemptBase {
  status: AuthAttemptStatus.Pending;
  flow: AuthFlowKind.ClientBrokered;
}

type BrokeredAuthenticationBinding =
  | { kind: 'attempt'; attemptId: string }
  | { kind: 'account'; accountId: string };

interface AuthenticateParams {
  // Existing channel, resource, token, scopes, and expiresIn remain.
  binding?: BrokeredAuthenticationBinding;
}

interface AuthenticateResult {
  accountId?: string;
}
```

The optional fields preserve the baseline wire shape. In shared brokered mode,
`binding`, a **nonempty** token, and the successful result's `accountId` are
required. Missing fields are errors, not requests to infer an account.

### Admission is distinct from renewal

1. The client reads a host-published challenge or consumer, then calls
   `authBegin` with `flows: [{ kind: "clientBrokered" }]`. For this new flow,
   `accountId`, when present, explicitly names a live account to reauthorize;
   omission means admission of an identity, not an implicit default from a
   challenge. A challenge tied to an existing account requires an explicit
   matching `accountId`; switching identities instead targets its published
   consumer. This makes the existing proposal's ambiguous default explicit.
2. The host records a single-use attempt, its initiating connection's
   authorization context, target, account intent, and place in host order.
   The attempt captures the consumer's current binding as a precondition.
   `attemptId` is a correlation key, not a bearer authorization.
3. The client obtains a token and supplies it with `binding.kind: "attempt"`.
   The host verifies identity, resource, ownership/lineage, and the still-live
   attempt. Admission reuses the live account ID for that verified identity
   and ownership lifetime, or allocates one if none exists. Explicit
   reauthorization MUST match the requested account, not silently switch it.
4. The host commits the credential and intended consumer selection, publishes
   the ordinary account/attempt state actions, and returns `accountId`.
   A conflicting consumer selection since `authBegin` fails with `Conflict`
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
fallback to another identity.

For resource matching, use the exact identifier the host advertised. Admission
must match the attempt's target; renewal must be authorized for that resource
under the live account and cannot add consumer bindings. Do not infer ownership
from a resource shared by two agents or MCP servers. Scope names are
case-sensitive; order and duplicates do not change a scope set. Missing `scopes`
means unknown, not "all scopes." Existing `expiresIn` rules still apply. Account
removal is deliberately **not** limited to the scope set or resource known to
the signing-out client.

### Capability and compatibility rules

Use #404's typed `InitializeResult.authentication.flows` advertisement:

```json
{
  "authentication": {
    "flows": [{ "kind": "clientBrokered" }]
  }
}
```

This is an initialize-result fragment, not a new top-level capability system.
The client selects the flow in `authBegin`; no duplicate client capability is
needed. The host must return `flow: "clientBrokered"` before an attempt-bound
transfer. Renewal under an already admitted account requires the advertised
flow and reconciled account state, not another admission attempt. Account
operations remain subject to the negotiated protocol version and normal
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
  or version-string heuristics. No protocol version bump is assigned here;
  action registry entries and version gates belong to the eventual type PR.

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

If containment fails after some credentials have already been invalidated,
rejection does not restore them. The account identity may remain while its
consumers report authentication failure; retry can complete removal. An
accepted echo means the host has contained credential use and replay, not that
an upstream OAuth server has revoked a grant.

For client-brokered grants, the host MUST NOT revoke the client's upstream grant
under this contract. Host-owned grants keep #404's separate upstream-revocation
policy. Remote failure must never undo a completed local removal.

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

This is an obligation on the host's credential owner, not a new client-maintained
graph or a public credential-management API. Hosts/providers that observe the
derivation establish the edge. If derivation happened elsewhere and the host
cannot establish its ownership/lineage, it MUST NOT admit it as an independent
credential under this guarantee. How to convey trustworthy externally produced
lineage is left for review, not papered over with metadata.

> Non-normative motivating example: Microsoft sign-out invalidates GitHub EMU
> access derived from that Microsoft account. GitHub-only sign-out leaves the
> Microsoft source available to other consumers. Nothing in the wire vocabulary
> names either provider.

### Stop affected work promptly

At the revocation boundary the host MUST stop admitting new affected work,
invalidate pending credential deliveries, and initiate cancellation of active
affected turns/operations. It MUST NOT wait for token expiration, an idle turn,
or an upstream revocation request. Queued approvals, callbacks, refreshes, and
stream events must not restart the stopped work.

The host publishes existing terminal turn state, such as `chat/turnCancelled`
or `chat/error`, and existing auth-required state/challenges for consumers that
need another sign-in. No special cancellation RPC or account-health enum is
required. Action delivery remains normally ordered; this does not invent an
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

Assume the host advertised `clientBrokered` and published challenge `need-1`
for the registered `assistant` consumer and `https://api.example.test`.
The following arrays are ordered JSON-RPC transcripts, not batch requests.

First admission (the host, not the client, assigns `account-a`):

```json
[
  {
    "jsonrpc": "2.0", "id": 2, "method": "authBegin",
    "params": {
      "channel": "ahp-accounts://",
      "target": { "challengeId": "need-1" },
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

The host also publishes `accounts/set` and the completed attempt carrying
`accountId`, as in #404. Another broker renewing A uses
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

## 7. Acceptance cases for implementation

These are required future host/client tests, **not tests implemented by this
documentation PR**. Pure reducers alone cannot prove provider containment.

| Case | Required observable result |
| --- | --- |
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
| SDK abort fails or hangs during sign-out | Further credential use and replay are fenced promptly; affected work reaches terminal state without waiting for expiry or idle. |
| A source is removed while derived access is live or being exchanged | Invalidate the transitive dependents, reject late exchange results, preserve unrelated accounts. |
| Only the derived account is removed | Source remains available to its other consumers; no reverse cascade. |
| Parent turn uses A, independent child uses B | Stop the parent; preserve B child. An independent child actually using A must stop. |
| Two MCP servers or agents share resource and scopes but not account selection | Delivery and revocation honor exact consumers and account lifetimes, not broad resource fan-out. |

## 8. Review decisions and eventual implementation

This proposes a contract, not approval of every wire spelling. Before changing
canonical types, review:

- **The lifetime boundary:** agree that `HostAccount.id` can represent an
  identity's revocable enrollment, and that independently owned grants cannot
  be coalesced. If #404 requires a permanent identity ID instead, a separate
  lifetime handle is needed; a token hash or generation counter is not a fix.
- **Brokered admission:** agree on the small `clientBrokered` extension to
  `authBegin`/attempts and its explicit account intent, including recovery of a
  lost completion after attempt retention expires. Until recoverable, that
  outcome must remain unconfirmed, not become an automatic sign-in.
- **Identity and external lineage:** define the trusted provider contract for
  opaque tokens, pairwise subjects, and derivation outside the host. This draft
  requires fail-closed behavior rather than accepting client identity metadata.
- **Consumer identity:** reconcile MCP targeting with
  [#439](https://github.com/microsoft/agent-host-protocol/pull/439) and #404.
  A server name alone is not globally unique. Missing or renamed bindings must
  require rebinding, not silently select a different account.

The eventual implementation starts in `types/`: flow/command additions,
accounts state/actions, `@clientDispatchable` removal and attempt cancellation,
reducers, and the version registry. Generate the schema and all client mirrors
from that source; add keyed-collection reducer fixtures for every branch,
message/compatibility tests, and host integration tests for the cases above.
Run `npm run generate`, `npm test`, documentation validation, and the affected
client suites. This docs-only draft intentionally adds no release fragment.

The deferred VS Code experiments informed the cases, not the API. In particular,
their private revoke method, metadata keys, local account IDs, and token
fingerprints are not proposed for standardization. The independently scoped
auth-extension race fixes in
[microsoft/vscode#337204](https://github.com/microsoft/vscode/pull/337204)
and subagent cancellation work in
[microsoft/vscode#337188](https://github.com/microsoft/vscode/pull/337188)
do not implement this contract and are not dependencies to bundle into this PR.
