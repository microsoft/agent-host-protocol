# What is the Agent Host Protocol?

::: warning UNDER ACTIVE DEVELOPMENT
This protocol is under active development and is not yet stabilized. Breaking changes to wire types, actions, and state shapes are expected.
:::

The **Agent Host Protocol (AHP)** defines how a portable, standalone sessions server communicates with its clients. Multiple clients can connect to the server and see a synchronized view of AI agent sessions. Clients send commands that are reflected back as state-changing actions.

## Design Requirements

The protocol is built around four core requirements:

1. **Synchronized multi-client state** — An immutable, Redux-like state tree mutated exclusively by actions flowing through pure reducers.

2. **Lazy loading** — Clients subscribe to state by URI and load data on demand. The session list is fetched imperatively. Large content (images, long tool outputs) is stored by reference and fetched separately.

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

The server holds an **authoritative state tree** managed by a `SessionStateManager`. State is mutated by actions flowing through pure reducers. Raw progress events from agent backends are mapped to protocol state actions via an event mapper.

Clients subscribe to URI-identified **channels** — the [Root Channel](/specification/root-channel) (`ahp-root://`), individual [Session Channels](/specification/session-channel) (`ahp-session:/<uuid>`), and [Terminal Channels](/specification/terminal-channel) — and receive:

1. An initial **snapshot** of the current state (for state-bearing channels).
2. Subsequent **action envelopes** that incrementally update the state.

The same reducer code runs on both the server and clients, which is what makes write-ahead reconciliation possible.

## Key Concepts

| Concept | Description |
|---|---|
| **Channels** | URI-identified subscribable resources. State channels (root, sessions, terminals) hold an immutable state tree; stateless channels exist for streaming data. |
| **State** | Immutable tree per state channel — root state, per-session state, per-terminal state. |
| **Actions** | Discriminated union of typed mutations. The sole mechanism for state change. |
| **Reducers** | Pure functions: `(state, action) → newState`. Run identically on server and client. |
| **Subscriptions** | Clients subscribe to channels to receive snapshots and action streams. |
| **Commands** | Imperative RPCs for operations that don't map to a single state action. |
| **Notifications** | Ephemeral broadcasts scoped to a channel (e.g. `root/sessionAdded`, `auth/required`). |

## Who is AHP For?

- **Client developers** building UIs that connect to agent sessions (IDEs, web apps, CLIs).
- **Host developers** running agent backends and managing session state.
- **Platform teams** building multi-client infrastructure for AI agent systems.

## Next Steps

- [Getting Started](/guide/getting-started) — Walk through a basic client-server interaction.
- [Architecture](/guide/architecture) — Understand the process model and communication layers.
- [State Model](/guide/state-model) — Learn about root state, session state, and content references.
