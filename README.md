# Agent Host Protocol

A synchronized, multi-client state protocol for AI agent sessions.

**[Read the documentation →](https://microsoft.github.io/agent-host-protocol/)**

## Overview

The Agent Host Protocol (AHP) defines how a portable, standalone sessions server communicates with its clients. Multiple clients can connect to the server and see a synchronized view of AI agent sessions through immutable state, pure reducers, and write-ahead reconciliation.

## Clients

- **Swift** — Add `https://github.com/microsoft/agent-host-protocol` as a Swift Package Manager dependency to use the `AgentHostProtocol` types/reducers library or the `AgentHostProtocolClient` single-host and multi-host client library. See the [Swift package README](clients/swift/AgentHostProtocol/README.md) and [`clients/swift/`](clients/swift/) for the example iOS client. The `Package.swift` manifest lives at the repository root because SwiftPM only resolves manifests at the root of a remote git repo; the actual Swift sources live under `clients/swift/AgentHostProtocol/`.
- **Rust** — See [`clients/rust/`](clients/rust/) for the `ahp`, `ahp-types`, and `ahp-ws` crates.

For consumers that need to talk to two or more hosts at once, the Rust SDK ships a `MultiHostClient` abstraction in [`ahp::hosts`](https://docs.rs/ahp/latest/ahp/hosts/) and the Swift SDK ships `MultiHostClient` in `AgentHostProtocolClient`. Single-host consumers use the same API via `MultiHostClient::single` in Rust or `MultiHostClient.single(...)` in Swift. See [Connecting to Multiple Hosts](https://microsoft.github.io/agent-host-protocol/guide/clients-multi-host) for the design and surface.

## Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run docs:dev

# Build for production
npm run docs:build

# Preview production build
npm run docs:preview
```

## License

MIT
