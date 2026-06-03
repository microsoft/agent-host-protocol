# Agent Host Protocol

A synchronized, multi-client state protocol for AI agent sessions.

**[Read the documentation →](https://microsoft.github.io/agent-host-protocol/)**

## Overview

The Agent Host Protocol (AHP) defines how a portable, standalone sessions server communicates with its clients. Multiple clients can connect to the server and see a synchronized view of AI agent sessions through immutable state, pure reducers, and write-ahead reconciliation.

## Implementations

### Clients

- **Swift** — Add `https://github.com/microsoft/agent-host-protocol` as a Swift Package Manager dependency (resolves bare `vX.Y.Z` tags at the repo root) to use the `AgentHostProtocol` types/reducers library or the `AgentHostProtocolClient` single-host and multi-host client library. See the [Swift package README](clients/swift/AgentHostProtocol/README.md), [`clients/swift/CHANGELOG.md`](clients/swift/CHANGELOG.md), and [`clients/swift/`](clients/swift/) for the example iOS client. The `Package.swift` manifest lives at the repository root because SwiftPM only resolves manifests at the root of a remote git repo; the actual Swift sources live under `clients/swift/AgentHostProtocol/`.
- **Rust** — See [`clients/rust/`](clients/rust/) for the `ahp`, `ahp-types`, and `ahp-ws` crates. Released to crates.io via `rust/vX.Y.Z` tags ([`CHANGELOG`](clients/rust/CHANGELOG.md)).
- **Kotlin** — Add `com.microsoft.agenthostprotocol:agent-host-protocol` from Maven Central to use from Android or any JVM project. See [`clients/kotlin/`](clients/kotlin/) for the source and [`CHANGELOG`](clients/kotlin/CHANGELOG.md). Released via `kotlin/vX.Y.Z` tags.
- **TypeScript** — Install `@microsoft/agent-host-protocol` to use the wire types, reducers, `AhpClient`, and the `WebSocketTransport`. See [`clients/typescript/`](clients/typescript/) and [`CHANGELOG`](clients/typescript/CHANGELOG.md). Released via `typescript/vX.Y.Z` tags; the Azure DevOps publish pipeline at [`clients/typescript/pipeline.yml`](clients/typescript/pipeline.yml) picks up the tag, validates it, and publishes to npm.
- **Go** — `go get github.com/microsoft/agent-host-protocol/clients/go` to use the `ahptypes` wire types, the `ahp` async client (client + pure reducers + pluggable `Transport`), and the `ahpws` WebSocket transport. See [`clients/go/`](clients/go/) and [`CHANGELOG`](clients/go/CHANGELOG.md). Released via `clients/go/vX.Y.Z` tags — the Go module proxy indexes the directory-prefixed tag directly from this repo, so there is no separate package registry.
- **[AHPX](https://github.com/TylerLeonhardt/ahpx)** — A command-line and Node.js client for connecting to AHP servers, managing sessions, and sending prompts.
- **[VS Code](https://github.com/microsoft/vscode)** — VS Code includes Agent Sessions client code for working with AHP hosts.

### Servers

- **[VS Code agent host](https://github.com/microsoft/vscode)** — The reference AHP server implementation. Start in [`src/vs/platform/agentHost/node/`](https://github.com/microsoft/vscode/tree/main/src/vs/platform/agentHost/node) when browsing the repository.

For consumers that need to talk to two or more hosts at once, the Rust SDK ships a `MultiHostClient` abstraction in [`ahp::hosts`](https://docs.rs/ahp/latest/ahp/hosts/), the Swift SDK ships `MultiHostClient` in `AgentHostProtocolClient`, and the Go SDK ships `MultiHostClient` in [`ahp/hosts`](clients/go/ahp/hosts/). Single-host consumers use the same API via `MultiHostClient::single` in Rust, `MultiHostClient.single(...)` in Swift, or `hosts.Single(...)` in Go. See [Connecting to Multiple Hosts](https://microsoft.github.io/agent-host-protocol/guide/clients-multi-host) for the design and surface.

## Versioning and releases

Each language client and the spec itself release independently on their own SemVer tracks. See [`docs/specification/versioning.md`](docs/specification/versioning.md) for the protocol-level rules and [`RELEASING.md`](RELEASING.md) for the release mechanics (tag conventions, CHANGELOG / metadata enforcement, required CI environments).

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
