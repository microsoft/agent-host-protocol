# Client-brokered account identity and revocation

This proposal fills two gaps in the existing client-supplied token flow:
identify the account owning a credential, and let the client notify the host
when it withdraws that account's credentials.

It does not introduce host-owned authentication. There is no account channel,
account catalogue, consumer-selection model, admission RPC, attempt lifecycle,
new reducer, or host-issued account handle. It is independent of
[#404](https://github.com/microsoft/agent-host-protocol/pull/404).

## Protocol delta

| Surface | Addition |
| --- | --- |
| `InitializeResult` | Optional `accountRevocation: {}` presence capability. |
| `AuthenticateParams` | Optional `account: AuthenticationAccount`, containing `authority` and `id`. |
| Client-to-host notification | `auth/revoked` with `channel: "ahp-root://"`, `resource`, and the same `account`. |

`AuthenticateResult` remains `{}`. There are no new request/response methods,
actions, notifications in the opposite direction, error codes, or protocol
version changes.

The notification reports a broker-owned fact. It does not require a new
host-owned account collection for clients to mutate or subscribe to.

The account's authority qualifies its id so two authorization servers cannot
collide. This is identity supplied by the client's auth provider, not a new
host-managed account object. It must be stable across token rotation and
comparable across clients; a local session id or token fingerprint is not
sufficient.

Canonical definitions:
[AuthenticationAccount](../../types/common/state.ts),
[AuthenticateParams / AuthRevokedParams](../../types/common/commands.ts), and
[ClientNotificationMap](../../types/common/messages.ts).
The normative rules are in
[Authentication: account-scoped revocation](../specification/authentication.md#account-scoped-revocation).

## Wire example

The initialize result advertises:

```json
{ "accountRevocation": {} }
```

The existing token push identifies its owner:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "authenticate",
  "params": {
    "channel": "ahp-root://",
    "resource": "https://api.example.test",
    "token": "example-token",
    "account": {
      "authority": "https://login.example.test",
      "id": "account-a"
    }
  }
}
```

On sign-out, the client sends a notification, not an empty-token push:

```json
{
  "jsonrpc": "2.0",
  "method": "auth/revoked",
  "params": {
    "channel": "ahp-root://",
    "resource": "https://api.example.test",
    "account": {
      "authority": "https://login.example.test",
      "id": "account-a"
    }
  }
}
```

## Required behavior

- If B replaced A, processing A's notification must not clear B's credential.
- Rotation does not change account identity. Revocation removes every matching
  token/scope variant, including the host's provider-replay copies.
- Authentication, revocation, and provider replay share the host's ordering
  boundary. Earlier pending work cannot reinstall a revoked credential later.
- The host promptly stops work actually using affected credentials. Chat
  ancestry alone is not a reason to stop independent work using another account.
- Known derived credentials follow the source's revocation. Revoking only a
  derived credential does not revoke its source. Externally derived credentials
  require the broker to send the corresponding notifications; no public
  dependency graph is added.
- Matching is by protected resource and authority-qualified account, with no
  client-supplied scope filter. Clients withdrawing the account from multiple
  resources send a notification for each contributed resource.

## Deliberate limits

This is not a permanent account revocation barrier. A later `authenticate`
may authorize the account again. The host cannot distinguish a deliberate
sign-in from an incorrectly replayed credential using these fields alone.
Clients must cancel stale forwarding, purge token replay caches, and re-check
their live auth provider before reconnect authentication.

The notification has no acknowledgement and is not durably replayed by AHP.
Sending it is not proof of completed host cleanup, especially after a
disconnect. A client reconnecting while the account remains withdrawn
reissues the applicable notification before forwarding new tokens; it must
not blindly replay an old withdrawal after a newer local sign-in.

## Verification boundary

Shared fixtures and client tests validate the account and notification wire
shapes, including absent/present capability markers. They do not simulate
credential revocation inside a real host. Host integration must additionally
verify these acceptance cases:

| Scenario | Expected result |
| --- | --- |
| A supplies account A; B replaces it with B; A signs out using stale local state. | B's selected credential and work survive. |
| A's credential rotates or is supplied with several scope sets. | Withdrawing A removes every matching variant, not one token string. |
| A's provider delivery starts before withdrawal and completes afterward. | Completion cannot restore A's removed credential. |
| A's turn has an independently authorized child using B. | Work using A stops promptly; B's work is not cancelled by ancestry. |
| A source credential has a known derived credential. | Source withdrawal invalidates both; derived-only withdrawal preserves the source. |
| Connection drops during withdrawal, with A still signed out locally. | Client rechecks its provider and reissues withdrawal before token delivery. It cannot claim confirmed remote cleanup. |
| A valid `authenticate` arrives after withdrawal. | It may reauthorize A; this addition does not identify stale versus intentional resubmission. |
| Host omits `accountRevocation`. | Client does not rely on the notification or fall back to clearing a shared resource. |

Existing [microsoft/vscode#337204](https://github.com/microsoft/vscode/pull/337204)
and [microsoft/vscode#337188](https://github.com/microsoft/vscode/pull/337188)
remain separate; this proposal does not modify that implementation.
