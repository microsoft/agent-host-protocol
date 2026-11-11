# Atomic Chat Move

## Status

Implemented as baseline behavior for the protocol version that introduces
`moveChat`.

## Motivation

Hosts may need to transfer a top-level chat and its complete internal hierarchy
to another session, or reorder a chat within its current session, while
preserving durable chat state and client subscriptions. The hierarchy may
include side chats or tool-spawned worker chats, but it is a host implementation
detail and is not exposed as AHP chat state.

The contract provides one atomic command for both ownership transfer and
same-session ordering. Chat URIs are stable, so existing chat subscriptions
remain valid.

## Contract

### Request and result

```ts
interface MoveChatParams {
  channel: URI;
  destination:
    | { kind: 'session'; session: URI; after?: URI }
    | { kind: 'newSession' };
}

interface MoveChatResult {
  session: URI;
}
```

A `session` destination names either the current session or another existing
session. When it is the current session, only the requested public catalog
entry is reordered. When it is another session, the requested chat and its
complete host-managed descendant hierarchy transfer together. `after` places
the requested entry immediately after another chat in the destination; when it
is absent, the requested entry is placed first.

A `newSession` destination allocates a session, transfers the complete
hierarchy, and makes the requested chat its non-movable default chat.

`ChatState.movable` and `ChatSummary.movable` let clients discover whether a
chat is eligible to be moved or reordered. The host is authoritative, absence
means `false`, and the chat referenced by a session's `defaultChat` MUST NOT be
movable. Default status does not pin catalog position: movable chats may be
placed before or after the default chat, and may use it as an `after` anchor.

### Atomicity and synchronization

For cross-session moves, the requested chat and its host-managed descendants
move as one unit. For same-session moves, only the requested public catalog
entry changes position. The host validates the whole operation and commits
ownership, internal hierarchy, catalogs, and default-chat state before
publishing synchronization actions. Failure leaves all state unchanged.

Every moved chat keeps its URI, state, and immutable `ChatOrigin`. Existing
catalog actions synchronize removals and additions.
`session/chatsReordered` carries the complete authoritative resulting URI order
when ordering changes. Root summaries mirror the same catalogs.

Reconnect snapshots are the durable recovery path. Because anonymous
`newSession` allocation has no idempotency key, a client with an uncertain
response reconciles root and session snapshots rather than blindly retrying and
possibly allocating another session.

### Validation

At minimum, the source must exist and advertise `movable: true`; the destination
and optional anchor must resolve; and the source cannot anchor itself. Hosts may
reject unsupported destinations or transient source conditions. Any rejection
leaves ownership and order unchanged. Success preserves chat URIs, state, and
origin while converging the durable session and root catalogs.

## Alternatives rejected

- **Expose hierarchy in `ChatState`:** clients do not need the host's internal
  side-chat or sub-agent structure to render or initiate a top-level move.
- **Replace chat URIs on transfer:** breaks active subscriptions and requires
  an ephemeral routing handoff that cannot be recovered after reconnect.
- **Model the move as independent remove/add requests:** cannot guarantee
  all-or-nothing ownership, hierarchy, and identity changes.
- **Separate reorder command:** duplicates eligibility, validation, and
  synchronization semantics already expressed by same-session `moveChat`.
