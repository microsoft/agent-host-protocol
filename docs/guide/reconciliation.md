# Write-Ahead Reconciliation

Clients optimistically apply their own actions locally, then reconcile when the server echoes them back alongside any concurrent actions from other clients or the server itself. This provides instant UI feedback while maintaining server-authoritative consistency.

## Client-Side State

Each client maintains per-subscription:

- **`confirmedState`** — Last fully server-acknowledged state.
- **`pendingActions[]`** — Optimistically applied but not yet echoed by server.
- **`optimisticState`** — `confirmedState` with `pendingActions` replayed on top (computed, not stored).

```
confirmedState ──► apply pending[0] ──► apply pending[1] ──► ... ──► optimisticState
```

The UI always renders `optimisticState`. Users see their actions reflected immediately.

## Reconciliation Algorithm

When the client receives an `ActionEnvelope` from the server:

1. **Own action echoed** (`origin.clientId === myId` and matches head of `pendingActions`):
   - Pop from pending, apply to `confirmedState`.

2. **Foreign action** (different origin or server-originated):
   - Apply to `confirmedState`, rebase remaining `pendingActions`.

3. **Rejected action** (server echoed with `rejectionReason` present):
   - Remove from pending (optimistic effect reverted). The `rejectionReason` MAY be surfaced to the user.

4. Recompute `optimisticState` from `confirmedState` + remaining `pendingActions`.

## Example

```
Time  Server                          Client A                        Client B
─────────────────────────────────────────────────────────────────────────────────
 t1                                   dispatch(turnStarted)
                                      pending: [turnStarted]
                                      optimistic: has activeTurn
 t2   receives turnStarted from A
      applies, broadcast seq=10
 t3                                   receives seq=10 (own echo)
                                      pop from pending
                                      confirmed = optimistic
 t4   agent produces delta
      broadcasts seq=11
 t5                                   receives seq=11 (foreign)        receives seq=11
                                      apply to confirmed               apply to confirmed
```

## Why Rebasing Is Simple

Most chat actions are **append-only**:
- Add turn, append delta, add tool call, append response part.

Pending actions still apply cleanly to an updated confirmed state because they operate on independent data — the turn the client created still exists; the content it appended is additive.

The rare true conflict (two clients abort the same turn) is resolved by **server-wins semantics** — the server's echo is the source of truth.

## Reconnection

If the transport connection drops:

```jsonc
// Client → Server (request)
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "reconnect",
  "params": {
    "channel": "ahp-root://",
    "clientId": "client-1",
    "lastSeenServerSeq": 42,
    "subscriptions": ["ahp-root://", "ahp-session:/<uuid>"]
  }
}
```

The server MUST include all replayed data in the response. If the gap is within the replay buffer, the response contains missed action envelopes. If the gap exceeds the buffer, the response contains fresh snapshots instead. In both cases, the client resets `confirmedState` accordingly and clears `pendingActions`.

Protocol notifications (like `sessionAdded`/`sessionRemoved`) are **not** replayed — the client should re-fetch the session list.

## Next Steps

- [Actions](/guide/actions) — The action types that flow through reconciliation.
- [Subscriptions](/specification/subscriptions) — How URI-based subscriptions work.
- [Lifecycle](/specification/lifecycle) — Connection handshake and reconnection.
- [Session Channel](/specification/session-channel) — Session creation and lifecycle.
