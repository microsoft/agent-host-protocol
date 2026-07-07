# Agent Host Protocol Doctrine

The Agent Host Protocol (AHP) is a state synchronization protocol for agent experiences. It lets clients and hosts share an authoritative, replayable view of agent sessions without requiring the client to understand a particular agent runtime, tool vocabulary, filesystem model, model provider, or UI framework.

Compared to point-to-point agent protocols such as ACP, AHP treats synchronization, reconnection, and multi-client coordination as first-class protocol concerns. AHP is not a replacement for an agent protocol below the host; it is the client-facing layer above one or more agent implementations.

## Principles

### AHP is state-first

AHP standardizes shared state, ordered actions, snapshots, subscriptions, and replay. Clients render from state-bearing channels and update that state by applying protocol actions through pure reducers.

Protocol additions should therefore start by asking what durable state a client needs to render or reconcile, not which backend event happened first. Ephemeral notifications are useful for routing and short-lived signals, but user-visible session truth should be recoverable from state.

### AHP is host-authoritative and client-responsive

The host owns the authoritative state for every state-bearing channel. Clients may apply their own actions optimistically for immediate feedback, then reconcile when the host echoes accepted or rejected actions in server order.

This lets multiple clients share the same session without turning the client into the source of truth. When conflicts occur, the host sequences the outcome and all clients converge on the same state.

### AHP is easy to adopt incrementally

A minimal host should be able to expose a useful agent experience with root and session channels, session creation, basic turns, and state updates. A minimal client should be able to render and provide interactions for sessions without implementing every advanced feature.

Protocol additions should be additive whenever possible. Advanced hosts and clients can negotiate or ignore optional capabilities, while simple implementations continue to interoperate with the parts of the protocol they understand.

### AHP is opinionated about synchronization, not agent implementation

AHP has strong opinions about state authority, action ordering, channel routing, replay, and reconciliation. It should not enshrine a particular agent loop, harness, model provider, tool schema, authentication system, storage backend, or filesystem assumption.

The same protocol should support traditional codebases backed by a Git repository, cloud workspaces without a local filesystem, browser-only clients, IDE integrations, CLIs, and hosted agent services.

### AHP is channel-oriented

Every push-style interaction in AHP is scoped to a URI-addressed channel. Root state, sessions, terminals, changesets, and future relay-style resources all use the same basic subscription and routing model.

New protocol surfaces should fit this model deliberately: choose the channel that owns the state or signal, make routing possible from the method and top-level channel URI, and avoid hidden coupling to a specific client view.

### AHP is a client-facing presentation model

AHP describes display-ready session state and interaction primitives that clients can use to build agent experiences. It is not the place to implement an agent loop, define how a model reasons, or expose backend-specific tool names as client contract.

Hosts translate agent-specific events into AHP actions and state. Clients should be able to render the core experience from protocol fields rather than provider-specific metadata or private tool vocabularies.

### AHP keeps escape hatches explicit

The protocol allows provider-specific metadata, model configuration, customizations, and future extension points. These are important for experimentation and host-specific polish, but they should not be required for the baseline experience.

If a feature becomes necessary for interoperable clients, it should graduate from an escape hatch into typed protocol state or capability-gated behavior.

### AHP evolves through compatibility and capabilities

New features should preserve useful behavior for older or smaller implementations whenever practical. Optional fields, ignored unknown metadata, and capability checks are preferred over changes that force every client and host to upgrade at once.

Breaking changes may still be necessary while the protocol is under active development, but the long-term direction is a protocol where clients can test capabilities and degrade gracefully.

## Design tests

When evaluating a protocol addition, ask:

- Can a minimal client ignore this and still render a coherent session?
- Is the durable, user-visible result represented in state rather than only in an ephemeral notification?
- Does the host remain the authority for sequencing and conflict resolution?
- Does this expose an agent implementation detail that should stay behind the host boundary?
- Does the feature fit an existing channel, or does it need a new URI-addressed channel?
- Can clients discover support through capabilities or optional state?
- Is provider-specific metadata an enhancement rather than a requirement?

## Anti-goals

AHP intentionally does not define:

- How agents reason, plan, call tools, or manage context.
- A required model provider, model router, or credential flow.
- A universal backend tool registry or tool schema.
- A required UI layout, editor integration, or client framework.
- A requirement that every workspace has a local filesystem or Git repository.
- Agent-to-agent coordination semantics.
- A replacement for ACP or other downstream agent protocols.
