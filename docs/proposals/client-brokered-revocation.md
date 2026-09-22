# Account-safe sign-out on a shared host

This proposal adds a **standalone, capability-gated protocol contract**, with
canonical types, schemas, reducers, client support, and shared conformance
fixtures. It does not depend on
[#404, host-owned authentication](https://github.com/microsoft/agent-host-protocol/pull/404).
Clients still acquire tokens; hosts own their admission, selection, use, and
invalidation.

The normative contract and wire walkthrough are in
[Accounts Channel](../specification/accounts-channel.md). The
[generated reference](/reference/accounts) is derived from the canonical source,
not from illustrative declarations in this document.

## Why this is an account operation

```text
A supplies account A -> B selects account B -> A signs out
```

A local cache cannot tell A whether the shared host now uses B. An empty-token
clear can revoke B; comparing A's last token can miss A's rotated credential.
The host must remove a named authorization lifetime atomically, including
replayable and derived credentials, without interrupting unrelated work.

This is generic authentication, not an IDE extension. The old private revoke
method, vendor metadata, local account IDs, and token fingerprints are not the
proposed API.

## What lands here

| Surface | Source |
| --- | --- |
| Accounts, consumer keys, pending/completed/failed admissions | [`types/channels-accounts/state.ts`](../../types/channels-accounts/state.ts) |
| Four keyed actions, including client-dispatchable removal/cancellation | [`types/channels-accounts/actions.ts`](../../types/channels-accounts/actions.ts) |
| Capability, `authBegin`, and discriminated token bindings | [`types/channels-accounts/commands.ts`](../../types/channels-accounts/commands.ts) |
| Bound delivery and returned account ID on `authenticate` | [`types/common/commands.ts`](../../types/common/commands.ts) |
| Pure account-state reducer | [`types/channels-accounts/reducer.ts`](../../types/channels-accounts/reducer.ts) |
| Snapshot, message, action-origin, and version wiring | [`types/index.ts`](../../types/index.ts) |
| Generated schemas and all client mirrors | [State schema](/schema/state.schema.json), [clients guide](/guide/clients) |
| Reducer, wire-shape, and client conformance cases | [Shared fixtures](https://github.com/microsoft/agent-host-protocol/tree/main/types/test-cases), [`types/accounts.test.ts`](../../types/accounts.test.ts) |

The protocol version constant is unchanged. `clientBrokered` advertisement,
flow acknowledgement, and ordinary account-channel permissions gate the new
behavior. Old implementations must not be allowed to silently ignore a binding
and perform legacy unconditional revocation.

## Bounded design choices

- **One host-authoritative account lifetime.** Its opaque ID survives rotation
  and retires on removal. It is not a permanent human identity or an upstream
  grant; independent grants are not coalesced merely because they name the
  same person.
- **Actions for state, commands for secrets.** `accounts/removed` carries only
  the key. `authBegin` reserves admission; only `authenticate` carries a token.
  Host-authored account updates and ordinary rejected-action echoes let every
  subscribed client converge.
- **Admission and renewal are different.** The single-use attempt closes the
  first-delivery race. Later renewal references a live account and cannot
  change its consumer selection. Removed handles cannot be silently re-enrolled.
- **Recovery is part of the lifetime.** A completed admission receipt remains
  while its account is live, so a lost response does not make sign-out
  impossible. Consumer changes invalidate competing attempts, including a
  selection that later changes back to its original value.
- **Existing consumers, not a new catalogue.** Agents use `(provider, resource)`.
  MCP servers use `(session, customizationId)`. Cross-session preference
  identity, host-run OAuth, and a challenge catalogue are not prerequisites.
- **Credential dependency, not ancestry.** Removing a source invalidates its
  dependent access; removing a derived lifetime leaves the source available.
  Active work stops based on actual credentials and operation ownership, not a
  walk of every descendant chat.

For example, Microsoft sign-out invalidates derived GitHub EMU access, while
GitHub-only sign-out leaves Microsoft usable for other consumers. The normative
rules use only generic source/derived lifetimes, never those provider names.

## Relationship to host-owned authentication

The names `ahp-accounts://`, `authBegin`, and `accounts/removed` intentionally
align with #404. Their complete brokered semantics are defined here, rather
than imported from that proposal. Host-owned acquisition could later feed the
same account lifecycle, but must preserve account-safe removal, retained
receipts, and explicit consumer selection.

This addition neither implements host-owned OAuth nor replaces #404's design.
Likewise [#439](https://github.com/microsoft/agent-host-protocol/pull/439)
addresses a different token-routing concern; a server display name is not the
consumer key used here.

## Review and verification boundaries

Review the concrete lifetime semantics, admission binding, MCP consumer key,
and permission boundary in the types and specification. The shared fixtures
test state projection and serialization, including preservation of B when A
is removed, terminal receipt retention, unknown state variants, and explicit
bindings. Client tests cover channel routing and reconciliation.

This repository does not contain the VS Code credential-holding host. Its
provider ordering, persistent revocation, trusted identity/lineage validation,
and work containment still need implementation and the
[host acceptance cases](../specification/accounts-channel.md#_7-host-acceptance-cases)
before that host can advertise the capability. The type-safe protocol proposal
is not a claim that those host scenarios have already been exercised.

The independently scoped work in
[microsoft/vscode#337204](https://github.com/microsoft/vscode/pull/337204) and
[microsoft/vscode#337188](https://github.com/microsoft/vscode/pull/337188)
is not changed or bundled here.
