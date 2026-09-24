# Atomic Chat Move

## Status

Implemented as an additive, capability-gated AHP contract.

## Motivation

Creation provenance and current organization answer different questions.
`ChatOrigin` records why a chat exists and must remain stable for audit and
explanation. Users may later reorganize that chat under another chat or promote
it into a session without rewriting history. Hosts may also need to migrate the
backing chat identity when ownership crosses backend session boundaries.

The contract therefore adds mutable hierarchy state, one atomic command, and a
scoped routing notification instead of encoding ownership in every chat URI or
redesigning chat resources.

## Contract

### Durable state

`ChatSummary.parentChat?: URI` and `ChatState.parentChat?: URI` are the current
structural parent. Absence means top-level in the owning session. A present
parent resolves within that session and the hierarchy is acyclic.

`ChatOrigin` is unchanged. Source-based and tool-based creation initialize
`parentChat` from the creating chat, but later moves change only hierarchy.

### Capability discovery

`AgentCapabilities.multipleChats` gains:

- `reparent?: boolean` for `{ kind: "chat", chat }`;
- `promote?: boolean` for `{ kind: "newSession" }`.

Both are opt-in. Cross-session reparenting is limited to the same host and a
compatible provider/agent runtime.

### Request and result

```ts
interface MoveChatParams {
  channel: URI;
  destination:
    | { kind: 'chat'; chat: URI }
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

`requestId` makes an uncertain request safe to retry. The root convenience
fields identify the requested chat and equal the first `movedChats` entry.
`movedChats` exhaustively maps the root and every descendant, including
identity-preserving entries, because a host may encode owning-session identity
in every chat URI. Its deterministic parent-before-child order lets clients
rewrite references without guessing.

### Atomicity and synchronization

The requested chat and its descendants move as one subtree. The host validates
the whole operation and commits ownership, hierarchy, catalogs, default-chat
state, and all resource replacements before publishing actions or
notifications. Every descendant's `parentChat` is rewritten to its moved
parent's mapped destination URI. Immutable `ChatOrigin` remains unchanged even
when its historical URI no longer resolves. Failure leaves all state unchanged.

Existing catalog actions synchronize removal and addition. The
`chat/parentChanged` action updates preserved chat snapshots.
`chat/moved` is emitted on each affected previous channel in mapping order and
carries the same exhaustive mapping. The move is committed before delivery, so
each notification is a complete atomic routing snapshot rather than one step of
the transaction. Reconnect snapshots remain the durable recovery path.

### Rejections

The host rejects a move when:

- the moved subtree contains its current session's default chat;
- the source or a moved descendant has an active turn;
- the target would create a cycle;
- the required capability is absent;
- either resource belongs to another host;
- the source and destination agent/provider runtimes are incompatible;
- any source or destination resource is unknown.

## Alternatives rejected

- **Rewrite `ChatOrigin`:** loses immutable creation provenance.
- **Require session-independent chat URIs:** incompatible with hosts whose
  existing routing and storage contracts encode session ownership.
- **Model the move as independent remove/add requests:** cannot guarantee
  all-or-nothing ownership, hierarchy, and identity changes.
- **Return only the requested root's destination URI:** leaves descendant
  references stale when cross-session ownership replaces the entire subtree.
