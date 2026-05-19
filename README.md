# Agent Host Protocol

A synchronized, multi-client state protocol for AI agent sessions.

**[Read the documentation →](https://microsoft.github.io/agent-host-protocol/)**

## Overview

The Agent Host Protocol (AHP) defines how a portable, standalone sessions server communicates with its clients. Multiple clients can connect to the server and see a synchronized view of AI agent sessions through immutable state, pure reducers, and write-ahead reconciliation.

## Implementations

### Clients

- **Swift** — Add `https://github.com/microsoft/agent-host-protocol` as a Swift Package Manager dependency to use the `AgentHostProtocol` library. See [`clients/swift/`](clients/swift/) for an example iOS client. The `Package.swift` manifest lives at the repository root because SwiftPM only resolves manifests at the root of a remote git repo; the actual Swift sources live under `clients/swift/AgentHostProtocol/`.
- **Rust** — See [`clients/rust/`](clients/rust/) for the `ahp`, `ahp-types`, and `ahp-ws` crates.
- **[AHPX](https://github.com/TylerLeonhardt/ahpx)** — A command-line and Node.js client for connecting to AHP servers, managing sessions, and sending prompts.
- **[VS Code](https://github.com/microsoft/vscode)** — VS Code includes Agent Sessions client code for working with AHP hosts.

### Servers

- **[VS Code agent host](https://github.com/microsoft/vscode)** — The reference AHP server implementation. Start in [`src/vs/platform/agentHost/node/`](https://github.com/microsoft/vscode/tree/main/src/vs/platform/agentHost/node) when browsing the repository.

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
