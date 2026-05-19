# Agent Host Protocol

A synchronized, multi-client state protocol for AI agent sessions.

**[Read the documentation →](https://microsoft.github.io/agent-host-protocol/)**

## Overview

The Agent Host Protocol (AHP) defines how a portable, standalone sessions server communicates with its clients. Multiple clients can connect to the server and see a synchronized view of AI agent sessions through immutable state, pure reducers, and write-ahead reconciliation.

## Clients

- **Swift** — Add `https://github.com/microsoft/agent-host-protocol` as a Swift Package Manager dependency to use the `AgentHostProtocol` library. See [`clients/swift/`](clients/swift/) for an example iOS client. The `Package.swift` manifest lives at the repository root because SwiftPM only resolves manifests at the root of a remote git repo; the actual Swift sources live under `clients/swift/AgentHostProtocol/`.
- **Rust** — See [`clients/rust/`](clients/rust/) for the `ahp`, `ahp-types`, and `ahp-ws` crates.

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
