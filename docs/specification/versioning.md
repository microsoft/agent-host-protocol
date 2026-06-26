# Versioning

AI is an evolving space. Unlike LSP or DAP — which largely guarantee backwards compatibility in perpetuity — the design space for agent hosts is open-ended and moving quickly. Backwards-incompatible changes to AHP are inevitable. Versioning gives clients and hosts a shared vocabulary for negotiating which behaviors are safe to use on a given connection.

## Version Format

Protocol versions are [SemVer](https://semver.org) `MAJOR.MINOR.PATCH` strings (e.g. `"0.1.0"`). Pre-release and build metadata are not used.

## Negotiation

Version selection happens once, during the [`initialize`](/specification/lifecycle) handshake — modelled after WebSocket subprotocol negotiation:

1. The client sends `InitializeParams.protocolVersions`: an array of every protocol version it is willing to speak, ordered from most preferred to least preferred.
2. The server picks one entry it can speak and returns it as `InitializeResult.protocolVersion`. Servers SHOULD honor the client's preference order when multiple offered versions are acceptable.
3. If the server cannot speak any of the offered versions, it MUST respond with [`UnsupportedProtocolVersion`](/reference/error-codes) (`-32005`) instead of a result, and close the connection.

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

## Stability Levels

Capability advertisement is binary — a surface is either advertised or it isn't. But an agent host commonly wraps a fast-moving backend (a CLI, runtime, or remote service) that exposes **experimental** surfaces it reserves the right to reshape. Such a surface occupies a middle state: implemented and emitted on the wire, but with a shape that is not yet stable. A host that relays it has only two honest options without a standard signal — drop it (the client loses fidelity) or emit it silently (the client can't tell it's volatile).

A stability level closes that gap. The host advertises the wire/schema stability of selected surfaces in [`InitializeResult.featureStability`](/reference/common#initializeresult) — an optional map keyed by a surface identifier (a notification method, a command method, a channel URI scheme, or a named capability):

```jsonc
{
  "protocolVersion": "0.5.0",
  "serverSeq": 42,
  "snapshots": [ /* ... */ ],
  "featureStability": {
    "session/canvasOpened": "experimental",
    "session/someOlderThing": "deprecated"
  }
}
```

| Level | Meaning | Client guidance |
| --- | --- | --- |
| `stable` (default / absent) | Normal SemVer additive guarantees apply. | Build on it freely. |
| `experimental` | On the wire, but its shape may change or be removed within an otherwise-compatible version range. | Parse defensively, gate behind a flag, tolerate shape changes, don't assume longevity. |
| `deprecated` | Still emitted, but scheduled for removal. | Migrate off; don't adopt anew. |

A surface absent from the map is `stable`, so hosts list only the surfaces that are not stable. The signal is strictly about **wire/schema volatility** — *not* product gating, entitlement, or preview access; a client uses it only to decide how defensively to code against a surface.

Stability is a static property of a surface, so it is advertised **once**, at the surface level, in the handshake — not stamped onto every message instance. It is connection-level metadata: a [`reconnect`](/specification/lifecycle#reconnection) continues the same logical connection, so clients retain the map rather than re-requesting it. Older clients that don't understand `featureStability` ignore it and treat every surface as stable, consistent with the [forward-compatibility](#forward-compatibility) rule.

This adds a stability axis to the capability lifecycle above: a surface can be advertised **and** flagged `experimental`, giving an explicit path of `experimental → stable → (eventually) required`.

## Client and Host Update Cadence

Agent hosts may be remote machines, cloud services, or other external APIs that the user does not control. Clients (IDEs, CLI tools, embedded UIs) are typically easier for a user to update than hosts.

As a result:

- **Clients SHOULD offer a wide range of protocol versions** when feasible so that older hosts can still pick a version they understand. Clients then degrade features gracefully when the negotiated version lacks a capability they would otherwise use.
- **Hosts SHOULD pick the highest offered version they implement.** Lower entries in the client's array are fallbacks for older hosts.
- **Hosts MUST refuse incompatible clients** by returning [`UnsupportedProtocolVersion`](/reference/error-codes) (`-32005`) when no offered version is acceptable.

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
2. The host picks one of those (typically the newest the client offered) or returns `UnsupportedProtocolVersion` if it can no longer speak any of them.
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
