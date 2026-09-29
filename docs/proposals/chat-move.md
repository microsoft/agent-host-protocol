# Atomic Chat Move

## Status

Implemented as baseline behavior for the protocol version that introduces
`moveChat`.

## Motivation

Hosts may need to transfer a top-level chat and its complete internal hierarchy
to another session while preserving durable chat state and client subscriptions.
The hierarchy may include side chats or tool-spawned worker chats, but it is an
agent implementation detail and is not exposed as AHP chat state.

The contract provides one atomic command and a scoped routing notification
instead of requiring clients to coordinate independent remove/add operations or
infer replacement chat URIs.

## Contract

### Request and result

```ts
interface MoveChatParams {
  channel: URI;
  destination:
    | { kind: 'session'; session: URI }
    | { kind: 'newSession' };
  requestId: string;
}

interface MoveChatResult {
  previousSession: URI;
  previousChat: URI;
  session: URI;
  chat: URI;
  movedChats: {
    previousChat: URI;
    chat: URI;
  }[];
}
```

The source MUST be a non-default top-level chat. A `session` destination moves
the source hierarchy into an existing compatible session. A `newSession`
destination allocates a compatible session and makes the requested chat its
default chat. The requested chat remains top-level in either destination.

`ChatState.movable` and `ChatSummary.movable` let clients discover whether a
chat is structurally eligible to be the source. The host is authoritative,
absence means `false`, and the chat referenced by a session's `defaultChat`
MUST NOT be movable. A client only offers or invokes `moveChat` for
`movable: true`. The flag does not guarantee that a particular destination or
the chat's current transient state will pass request-time validation.

`requestId` makes an uncertain request safe to retry. The root convenience
fields identify the requested chat and equal the first `movedChats` entry.
`movedChats` exhaustively maps the root and every host-managed descendant,
including identity-preserving entries, because a host may encode owning-session
identity in every chat URI. Its deterministic root-first, parent-before-child
order lets clients rewrite references without guessing.

### Atomicity and synchronization

The requested chat and its host-managed descendants move as one subtree. The
host validates the whole operation and commits ownership, internal hierarchy,
catalogs, default-chat state, and all resource replacements before publishing
actions or notifications. Immutable `ChatOrigin` remains unchanged even when
its historical URI no longer resolves. Failure leaves all state unchanged.

Existing catalog actions synchronize removal and addition. `chat/moved` is
emitted on each affected previous channel in mapping order and carries the same
exhaustive mapping. The move is committed before delivery, so each notification
is a complete atomic routing snapshot rather than one step of the transaction.
Reconnect snapshots remain the durable recovery path.

### Rejections

The host rejects a move when:

- the source does not advertise `movable: true`;
- the moved subtree contains its current session's default chat;
- the source or a moved descendant has an active turn;
- the existing destination equals the source session;
- either resource belongs to another host;
- the source and destination agent/provider runtimes are incompatible;
- any source or destination resource is unknown.

## Alternatives rejected

- **Expose hierarchy in `ChatState`:** clients do not need the host's internal
  side-chat or sub-agent structure to render or initiate a top-level move.
- **Require session-independent chat URIs:** incompatible with hosts whose
  existing routing and storage contracts encode session ownership.
- **Model the move as independent remove/add requests:** cannot guarantee
  all-or-nothing ownership, hierarchy, and identity changes.
- **Return only the requested root's destination URI:** leaves descendant
  references stale when cross-session ownership replaces the entire subtree.
