# What is the Agent Host Protocol?

::: warning UNDER ACTIVE DEVELOPMENT
This protocol is under active development and is not yet stabilized. Breaking changes to wire types, actions, and state shapes are expected.
:::

The **Agent Host Protocol (AHP)** defines how a portable, standalone sessions server communicates with its clients. Multiple clients can connect to the server and see a synchronized view of AI agent sessions. Clients send commands that are reflected back as state-changing actions.

AHP stays agent-agnostic: it describes client-facing session state and display-ready metadata without binding clients to a specific agent runtime or backend-specific tool vocabulary.

## Channels: the core abstraction

Every push-style interaction in AHP lives on a **channel** — a URI-identified subscribable resource. The root catalogue (`ahp-root://`), each session (`ahp-session:/<uuid>`), each terminal (`ahp-terminal:/<id>`), and each changeset (`ahp-changeset:/<id>`) is its own channel. A channel MAY hold an immutable state tree, or it MAY be a stateless pub/sub topic (planned: logging, MCP relay, LSP relay).

Channels are also the routing key for the wire protocol. **Every command's params and every notification's params carry a top-level `channel: URI`** — so a server, a client, or an intermediate proxy can dispatch any incoming message just by inspecting `(method, params.channel)`, without per-method deserialisation. Connection-level commands (`initialize`, `ping`, `listSessions`, the `resource*` filesystem commands, `authenticate`) use the literal `'ahp-root://'`.

See [Channels & Subscriptions](/specification/subscriptions) for the full model.

## Design Requirements

The protocol is built around four core requirements:

1. **Synchronized multi-client state** — An immutable, Redux-like state tree mutated exclusively by actions flowing through pure reducers. Each state-bearing channel has its own tree.

2. **Lazy loading** — Clients subscribe to channels by URI and load data on demand. The session list is fetched imperatively. Large content (images, long tool outputs) is stored by reference and fetched separately.

3. **Write-ahead with reconciliation** — Clients optimistically apply their own actions locally, then reconcile when the server echoes them back alongside any concurrent actions from other clients or the server itself.

4. **Forward-compatible versioning** — Newer clients can connect to older servers. A single protocol version number maps to a capabilities object; clients check capabilities before using features.

## How It Works

```
┌──────────────┐                          ┌──────────────┐
│   Client A   │◄────── JSON-RPC ────────►│              │
└──────────────┘                          │              │
                                          │    Server    │
┌──────────────┐                          │              │
│   Client B   │◄────── JSON-RPC ────────►│  (state +    │
└──────────────┘                          │   agents)    │
                                          │              │
┌──────────────┐                          │              │
│   Client C   │◄────── JSON-RPC ────────►│              │
└──────────────┘                          └──────────────┘
```

The server holds an **authoritative state tree** per state-bearing channel. State changes are represented as ordered protocol actions, which lets every subscribed client converge on the same view of the session.

Clients subscribe to channels by URI and receive:

1. An initial **snapshot** of the current state (for state-bearing channels; stateless channels return `{}`).
2. Subsequent **action envelopes** that incrementally update the state, plus any channel-specific protocol notifications.

Because updates arrive as ordered actions against shared snapshots, clients can reconcile optimistic local changes with the authoritative server stream.

## Key Concepts

| Concept | Description |
|---|---|
| **Channels** | URI-identified subscribable resources. State channels (root, sessions, terminals, changesets) hold an immutable state tree; stateless channels exist for streaming data. Every message carries `channel: URI` for routing. |
| **State** | Immutable tree per state channel — root state, per-session state, per-terminal state, per-changeset state. |
| **Actions** | Discriminated union of typed mutations. The sole mechanism for state change. Delivered inside `ActionEnvelope`s whose `channel` field identifies the target channel. |
| **Reducers** | Pure functions: `(state, action) → newState`. Run identically on server and client. |
| **Subscriptions** | Clients subscribe to channels to receive snapshots and action streams. |
| **Commands** | Imperative RPCs. Every command's params include `channel: URI`; connection-level commands use `'ahp-root://'`. |
| **Notifications** | Ephemeral broadcasts scoped to a channel (e.g. `root/sessionAdded`, `auth/required`, `action`). |

## Who is AHP For?

- **Client developers** building UIs that connect to agent sessions (IDEs, web apps, CLIs).
- **Host developers** running agent backends and managing session state.
- **Platform teams** building multi-client infrastructure for AI agent systems.

## Next Steps

- [Getting Started](/guide/getting-started) — Walk through a basic client-server interaction.
- [State Model](/guide/state-model) — Learn about root state, session state, and content references.
