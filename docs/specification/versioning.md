# Versioning

AI is an evolving space. Unlike LSP or DAP — which largely guarantee backwards compatibility in perpetuity — the design space for agent hosts is open-ended and moving quickly. Backwards-incompatible changes to AHP are inevitable. Versioning gives clients and hosts a shared vocabulary for negotiating which behaviors are safe to use on a given connection.

## Stability Index

AHP uses a channel-level stability index based on the [Node.js stability index](https://nodejs.org/api/documentation.html#stability-index). It communicates how much change implementors should expect within a channel independently of the protocol version negotiated on a connection.

Until more granular annotations are introduced, a channel's index applies to its complete surface: URI shape, state, actions, commands, notifications, and lifecycle.

<div class="stability-scale">
  <StabilityIndex level="0" compact />
  <StabilityIndex level="1" compact />
  <StabilityIndex level="1.0" compact />
  <StabilityIndex level="1.1" compact />
  <StabilityIndex level="1.2" compact />
  <StabilityIndex level="2" compact />
  <StabilityIndex level="3" compact />
</div>

- **0 - Deprecated.** Backward compatibility is not guaranteed, and the channel may be removed.
- **1 - Experimental.** Backward-incompatible changes or removal may occur in any future release.
  - **1.0 - Early development.** The channel is unfinished and subject to substantial change.
  - **1.1 - Active development.** The channel is nearing minimum viability but may still change incompatibly.
  - **1.2 - Release candidate.** No further breaking changes are anticipated, but user feedback or development of an underlying specification may still require them.
- **2 - Stable.** Compatibility is a high priority, and normal semantic-versioning guarantees apply.
- **3 - Legacy.** The channel remains supported under semantic versioning but is no longer actively developed.

### Current channel stability

| Channel | Stability |
| --- | --- |
| [Root](/specification/root-channel) | **2 - Stable** |
| [Session](/specification/session-channel) | **2 - Stable** |
| [Chat](/specification/chat-channel) | **2 - Stable** |
| [Terminal](/specification/terminal-channel) | **2 - Stable** |
| [Changeset](/reference/changeset) | **1.2 - Release candidate** |
| [Annotations](/reference/annotations) | **1.1 - Active development** |
| [Telemetry](/specification/telemetry-channel) | **2 - Stable** |
| [Automation catalogue](/specification/automation-channel) | **1.0 - Early development** |
| [Automation run](/specification/automation-run-channel) | **1.0 - Early development** |
| [Tunnels](/specification/tunnels-channel) | **1 - Experimental** |
| [Resource watch](/specification/resource-watch-channel) | **2 - Stable** |
| [MCP](/specification/mcp-channel) | **1.2 - Release candidate** |

The stability index does not replace [protocol version negotiation](#negotiation) or capability checks. A stability change is itself a documentation signal; wire compatibility continues to follow the rules below.

## Version Format

Protocol versions are [SemVer](https://semver.org) `MAJOR.MINOR.PATCH` strings (e.g. `"0.1.0"`). Pre-release and build metadata are not used.

## Negotiation

Version selection happens once, during the [`initialize`](/specification/lifecycle) handshake — modelled after WebSocket subprotocol negotiation:

1. The client sends `InitializeParams.protocolVersions`: an array of every protocol version it is willing to speak, ordered from most preferred to least preferred.
2. The server picks one entry it can speak and returns it as `InitializeResult.protocolVersion`. Servers SHOULD honor the client's preference order when multiple offered versions are acceptable.
3. If the server cannot speak any of the offered versions, it MUST respond with [`UnsupportedProtocolVersion`](/reference/error-codes) (`-32005`) and required `data.supportedVersions` instead of a result, and close the connection.

Both peers MUST use the selected version for the rest of the connection. There is no per-message renegotiation.

## Compatibility Guarantee

AHP follows standard SemVer compatibility:

- Two peers speaking versions `X.y.z` and `X.y'.z'` (same `MAJOR ≥ 1`) are compatible.
- Two peers speaking versions `0.X.y` and `0.X.y'` (same pre-1.0 `MINOR`) are compatible.
- Any other combination is **not** guaranteed to be compatible.

Within a compatible range, additive changes — new optional fields on existing types, new action types, new commands — are introduced in `PATCH` (or `MINOR`, while `MAJOR` is `0`) bumps and MUST be ignored by older peers that do not understand them.

## Capabilities First, Then Required

New behavior generally lands in two stages:

1. **Capability-gated.** A new feature is introduced as an opt-in capability advertised by a host or clients. Implementors check for the capability before exercising the feature. This lets hosts and clients adopt the feature on independent schedules without a version bump.
2. **Required.** Once a capability has matured, a future protocol version may promote it to baseline behavior and remove the capability flag. This reduces long-term implementation complexity.

## Client and Host Update Cadence

Agent hosts may be remote machines, cloud services, or other external APIs that the user does not control. Clients (IDEs, CLI tools, embedded UIs) are typically easier for a user to update than hosts.

As a result:

- **Clients SHOULD offer a wide range of protocol versions** when feasible so that older hosts can still pick a version they understand. Clients then degrade features gracefully when the negotiated version lacks a capability they would otherwise use.
- **Hosts SHOULD pick the highest offered version they implement.** Lower entries in the client's array are fallbacks for older hosts.
- **Hosts MUST refuse incompatible clients** by returning [`UnsupportedProtocolVersion`](/reference/error-codes) (`-32005`) with required `data.supportedVersions` when no offered version is acceptable.

## Forward Compatibility

When a newer client connects to an older host:

1. The client offers its full version list, including older versions it can fall back to.
2. The host picks the newest entry it understands and returns it.
3. The client checks the capability set advertised by the host before using newer features.
4. If a feature is unavailable, the client degrades gracefully — disabling UI affordances, falling back to older code paths, or surfacing a clear message to the user.
5. The host only sends action types known to the negotiated version. As a safety net, clients SHOULD silently ignore actions with unrecognized `type` values.

## Backward Compatibility

When an older client connects to a newer host:

1. The client offers only the versions it knows.
2. The host picks one of those (typically the newest the client offered) or returns `UnsupportedProtocolVersion` with required `data.supportedVersions` if it can no longer speak any of them.
3. On a successful negotiation the host MUST NOT use newer-version-only behaviors on that connection unless gated behind a capability the client has acknowledged.

## Release Model

The protocol specification and the per-language client libraries are released independently. The spec moves on its own SemVer track; each client moves on its own native SemVer track in its native package ecosystem.

### Why not a single shared version

Coupling client versions to the spec version was considered and rejected:

- Three of the four target ecosystems (npm, Cargo, SwiftPM) reject anything other than a strict three-number SemVer core, so a four-part "spec-major.spec-minor.spec-patch.client-iter" scheme is not portable.
- A client-only bug fix is, from the consumer's perspective, a SemVer patch. Encoding "spec patch" as the third digit would mean consumers' `^0.2.0` dependency ranges miss client-only fixes.
- Forcing lock-step would require shipping "dead" releases of unchanged clients every time the spec patches, just to keep version strings aligned.
- The spec already permits independent client and host cadence via "capabilities first, then required" — this section codifies that release-side as well.

### Tag conventions

| Artifact   | Tag pattern   | Registry / discovery                                              |
| ---------- | ------------- | ----------------------------------------------------------------- |
| Spec       | `spec/vX.Y.Z` | GitHub Release with schema assets and a `registry-snapshot.json`. |
| Rust       | `rust/vX.Y.Z` | crates.io (`ahp-types`, `ahp`, `ahp-ws`).                         |
| Kotlin     | `kotlin/vX.Y.Z` | Maven Central (`com.microsoft.agenthostprotocol:agent-host-protocol`). |
| TypeScript | `typescript/vX.Y.Z` | npm (`@microsoft/agent-host-protocol`) — tag triggers a GHA workflow that calls an Azure DevOps publish pipeline. |
| Swift      | `vX.Y.Z` (bare) | SwiftPM (resolved by tag at the repo root).                     |

Bare `vX.Y.Z` tags at the repository root are reserved for the Swift release pipeline because SwiftPM only resolves bare semver tags at the manifest's repo root; path-prefixed tags like `swift/v0.2.0` are invisible to it.

The TypeScript client publishes via an Azure DevOps pipeline (`clients/typescript/pipeline.yml`) that picks up `typescript/vX.Y.Z` tags directly — the validation and npm publish both run in ADO.

### Mapping client releases to spec versions

Every client release advertises which protocol version(s) it supports in two places:

- An exported **`SUPPORTED_PROTOCOL_VERSIONS`** constant (an array of SemVer strings, most-preferred-first), generated from `types/version/registry.ts`. Consumers pass this list (or a derived copy) to `initialize` so the same client binary can fall back to older protocol versions if the host doesn't accept the newest one.
- A checked-in **`clients/<lang>/release-metadata.json`** file (machine-readable: `{ packageVersion, supportedProtocolVersions }`) and a matching **`clients/<lang>/CHANGELOG.md`** entry (human-readable).

CI verifies the constants, the metadata file, and the native package manifest are all consistent on every PR (`npm run verify:release-metadata`).

Full how-to for cutting a release of each artifact lives in [`RELEASING.md`](https://github.com/microsoft/agent-host-protocol/blob/main/RELEASING.md) at the repo root.
