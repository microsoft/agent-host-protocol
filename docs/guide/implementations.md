# Implementations

These projects implement or consume the Agent Host Protocol.

## Clients

The five clients shipped from this repository are released to the
package registry idiomatic for each ecosystem. See [Clients](/guide/clients)
for install snippets and per-language entry points.

- **Rust** — three crates on crates.io (`ahp-types`, `ahp`, `ahp-ws`). See [the Rust client crates](https://github.com/microsoft/agent-host-protocol/tree/main/clients/rust).
- **TypeScript** — `npm install @microsoft/agent-host-protocol` for wire types, reducers, `AhpClient`, `MultiHostClient`, and `WebSocketTransport`. See [the TypeScript client](https://github.com/microsoft/agent-host-protocol/tree/main/clients/typescript). Browser-friendly; works in any environment that exposes the global `WebSocket`.
- **Kotlin / JVM** — `com.microsoft.agenthostprotocol:agent-host-protocol` on Maven Central. Pure Kotlin/JVM (Java 8 bytecode) so it works unchanged on Android, server-side JVM, and KMP/JVM targets. See [the Kotlin client](https://github.com/microsoft/agent-host-protocol/tree/main/clients/kotlin).
- **Swift** — add `https://github.com/microsoft/agent-host-protocol` as a Swift Package Manager dependency for the `AgentHostProtocol` and `AgentHostProtocolClient` libraries. See [the Swift client](https://github.com/microsoft/agent-host-protocol/tree/main/clients/swift) for an example iOS client. The `Package.swift` manifest lives at the repository root because SwiftPM only resolves manifests at the root of a remote git repo; the actual Swift sources live under `clients/swift/AgentHostProtocol/`.
- **Go** — `go get github.com/microsoft/agent-host-protocol/clients/go@latest` for the `ahptypes`, `ahp`, and `ahpws` packages, mirroring the Rust three-crate split. See [the Go client](https://github.com/microsoft/agent-host-protocol/tree/main/clients/go).
- **[AHPX](https://github.com/TylerLeonhardt/ahpx)** — A command-line and Node.js client for connecting to AHP servers, managing sessions, and sending prompts.
- **[VS Code](https://github.com/microsoft/vscode)** — VS Code includes Agent Sessions client code for working with AHP hosts.

## Servers

- **[VS Code agent host](https://github.com/microsoft/vscode)** — The reference AHP server implementation. Start in [`src/vs/platform/agentHost/node/`](https://github.com/microsoft/vscode/tree/main/src/vs/platform/agentHost/node) when browsing the repository.
- **[pi-ahp](https://github.com/Qusic/pi-ahp)** — An open-source AHP host for the [pi coding agent](https://github.com/earendil-works/pi), exposing pi sessions to AHP clients over WebSocket.
