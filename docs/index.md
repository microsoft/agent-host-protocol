---
layout: home

hero:
  name: Agent Host Protocol
  text: Synchronized multi-client state for AI agent sessions
  tagline: A portable, standalone server protocol that gives multiple clients a synchronized view of AI agent sessions through immutable state, pure reducers, and write-ahead reconciliation. This protocol is under active development and is not yet stabilized.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/what-is-ahp
    - theme: alt
      text: View Specification
      link: /specification/overview
    - theme: alt
      text: GitHub
      link: https://github.com/microsoft/agent-host-protocol

features:
  - icon: 📡
    title: Channels All the Way Down
    details: 'Every push-style interaction lives on a URI-identified channel — root, sessions, terminals, changesets, and more. Every command and notification carries a top-level <code>channel</code> URI, so any message can be routed by inspecting <code>(method, channel)</code>.'
  - icon: 🔄
    title: Synchronized Multi-Client State
    details: An immutable, Redux-like state tree per state-bearing channel, mutated exclusively by actions flowing through pure reducers. Multiple clients see the same synchronized view.
  - icon: 📦
    title: Lazy Loading & Subscriptions
    details: Clients subscribe to channels by URI and load data on demand. Large content is stored by reference and fetched separately, keeping the state tree small.
  - icon: ⚡
    title: Write-Ahead Reconciliation
    details: Clients optimistically apply their own actions locally, then reconcile when the server echoes them back alongside concurrent actions from other clients.
  - icon: 🔀
    title: Forward-Compatible Versioning
    details: A single protocol version number maps to a capabilities object. Newer clients check capabilities before using features, enabling graceful degradation.
---
