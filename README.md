# Agent Host Protocol

A synchronized, multi-client state protocol for AI agent sessions.

**[Read the documentation →](https://microsoft.github.io/agent-host-protocol/)**

## Overview

The Agent Host Protocol (AHP) defines how a portable, standalone sessions server communicates with its clients. Multiple clients can connect to the server and see a synchronized view of AI agent sessions through immutable state, pure reducers, and write-ahead reconciliation.

## Client libraries

| Language | Package | Version | Source |
| --- | --- | --- | --- |
| **Rust** | [`ahp`](https://crates.io/crates/ahp) · [`ahp-types`](https://crates.io/crates/ahp-types) · [`ahp-ws`](https://crates.io/crates/ahp-ws) | [![crates.io](https://img.shields.io/crates/v/ahp.svg?logo=rust)](https://crates.io/crates/ahp) | [`clients/rust/`](clients/rust/) · [CHANGELOG](clients/rust/CHANGELOG.md) |
| **TypeScript** | [`@microsoft/agent-host-protocol`](https://www.npmjs.com/package/@microsoft/agent-host-protocol) | [![npm](https://img.shields.io/npm/v/@microsoft/agent-host-protocol.svg?logo=npm)](https://www.npmjs.com/package/@microsoft/agent-host-protocol) | [`clients/typescript/`](clients/typescript/) · [CHANGELOG](clients/typescript/CHANGELOG.md) |
| **Kotlin** | [`com.microsoft.agenthostprotocol:agent-host-protocol`](https://central.sonatype.com/artifact/com.microsoft.agenthostprotocol/agent-host-protocol) | [![Maven Central](https://img.shields.io/maven-central/v/com.microsoft.agenthostprotocol/agent-host-protocol.svg?logo=apachemaven)](https://central.sonatype.com/artifact/com.microsoft.agenthostprotocol/agent-host-protocol) | [`clients/kotlin/`](clients/kotlin/) · [CHANGELOG](clients/kotlin/CHANGELOG.md) |
| **Go** | [`github.com/microsoft/agent-host-protocol/clients/go`](https://pkg.go.dev/github.com/microsoft/agent-host-protocol/clients/go) | [![Go Reference](https://pkg.go.dev/badge/github.com/microsoft/agent-host-protocol/clients/go.svg)](https://pkg.go.dev/github.com/microsoft/agent-host-protocol/clients/go) | [`clients/go/`](clients/go/) · [CHANGELOG](clients/go/CHANGELOG.md) |
| **Swift** | [SwiftPM: `microsoft/agent-host-protocol`](https://github.com/microsoft/agent-host-protocol) | [![Tag](https://img.shields.io/github/v/tag/microsoft/agent-host-protocol?filter=v*&label=SwiftPM&logo=swift)](https://github.com/microsoft/agent-host-protocol/tags) | [package README](clients/swift/AgentHostProtocol/README.md) · [CHANGELOG](clients/swift/CHANGELOG.md) |

Other clients: [**AHPX**](https://github.com/TylerLeonhardt/ahpx) (CLI + Node.js client) and [**VS Code**](https://github.com/microsoft/vscode) (built-in Agent Sessions client).

The Rust, Swift, and Go SDKs ship a `MultiHostClient` for talking to two or more hosts at once (single-host consumers use the same API via `MultiHostClient::single` / `.single(...)` / `hosts.Single(...)`). See [Connecting to Multiple Hosts](https://microsoft.github.io/agent-host-protocol/guide/clients-multi-host).

## Servers

- **[VS Code agent host](https://github.com/microsoft/vscode)** — The reference AHP server implementation ([`src/vs/platform/agentHost/node/`](https://github.com/microsoft/vscode/tree/main/src/vs/platform/agentHost/node)).

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
