# Implementations

These projects implement or consume the Agent Host Protocol.

## Clients

- **Swift** — Add `https://github.com/microsoft/agent-host-protocol` as a Swift Package Manager dependency to use the `AgentHostProtocol` library. See [the Swift client](https://github.com/microsoft/agent-host-protocol/tree/main/clients/swift) for an example iOS client. The `Package.swift` manifest lives at the repository root because SwiftPM only resolves manifests at the root of a remote git repo; the actual Swift sources live under `clients/swift/AgentHostProtocol/`.
- **Rust** — See [the Rust client crates](https://github.com/microsoft/agent-host-protocol/tree/main/clients/rust) for the `ahp`, `ahp-types`, and `ahp-ws` crates.
- **[AHPX](https://github.com/TylerLeonhardt/ahpx)** — A command-line and Node.js client for connecting to AHP servers, managing sessions, and sending prompts.
- **[VS Code](https://github.com/microsoft/vscode)** — VS Code includes Agent Sessions client code for working with AHP hosts.

## Servers

- **[VS Code agent host](https://github.com/microsoft/vscode)** — The reference AHP server implementation. Start in [`src/vs/platform/agentHost/node/`](https://github.com/microsoft/vscode/tree/main/src/vs/platform/agentHost/node) when browsing the repository.