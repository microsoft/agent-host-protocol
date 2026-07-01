# Releasing AHP

This document covers the mechanics of cutting a release of any shippable
artifact in this repo. For the protocol-level versioning policy (SemVer
rules for the spec itself, the supported-version window, etc.) see
[`docs/specification/versioning.md`](docs/specification/versioning.md).

## Release model

Every shippable artifact in this repo is versioned independently using its
ecosystem's native SemVer. The protocol specification is a fifth artifact
with its own release cadence. Each client release advertises which protocol
versions it supports via a generated `SUPPORTED_PROTOCOL_VERSIONS` constant
and a checked-in `clients/<lang>/release-metadata.json`.

## Tag conventions

| Artifact   | Tag pattern         | Workflow                          | Registry / discovery |
| ---------- | ------------------- | --------------------------------- | -------------------- |
| Spec       | `spec/vX.Y.Z`       | `.github/workflows/publish-spec.yml` | GitHub Release with schema assets. |
| Rust       | `rust/vX.Y.Z`       | `.github/workflows/publish-rust.yml` | crates.io (`ahp-types`, `ahp`, `ahp-ws`). |
| Kotlin     | `kotlin/vX.Y.Z`     | `clients/kotlin/pipeline.yml` (Azure DevOps) | Maven Central (`com.microsoft.agenthostprotocol:agent-host-protocol`) via ESRP. |
| TypeScript | `typescript/vX.Y.Z` | `clients/typescript/pipeline.yml` (Azure DevOps) | npm (`@microsoft/agent-host-protocol`) via ESRP. |
| Swift      | `vX.Y.Z` (bare)     | `.github/workflows/publish-swift.yml` | SwiftPM resolves the tag directly. |
| Go         | `clients/go/vX.Y.Z` | `.github/workflows/publish-go.yml` | Go module proxy resolves the tag directly. |

> **Why Swift gets the bare semver tag namespace:** SwiftPM only resolves
> packages by matching plain `X.Y.Z` / `vX.Y.Z` git tags at the manifest's
> repo root. Path-prefixed tags like `swift/v0.2.0` are invisible to it. Bare
> semver tags at this repo's root are therefore reserved for Swift releases.

> **Why Go uses the `clients/go/` prefix:** Go's module-version resolution
> for sub-module paths requires the tag prefix to match the module's
> directory inside the repo (see [`go help mod` › Module versions](https://go.dev/ref/mod#vcs-version)).
> Without the prefix, `go get github.com/microsoft/agent-host-protocol/clients/go@vX.Y.Z`
> would fail to find a matching tag.

> **Why TypeScript and Kotlin publish from Azure DevOps:** the npm
> registry publish for `@microsoft/agent-host-protocol` and the Maven
> Central publish for `com.microsoft.agenthostprotocol:agent-host-protocol`
> both go through Microsoft's ESRP-backed `vscode-engineering` pipeline
> templates (1ES-hosted agents, signed publish, retention policy) — that
> machinery lives in Azure DevOps. GitHub Actions cannot trigger an ADO
> pipeline in this repo (PATs are not permitted), so the ADO pipelines
> own the `typescript/vX.Y.Z` and `kotlin/vX.Y.Z` tag triggers directly
> and run the same validation steps (tag ↔ manifest match, CHANGELOG
> entry, release metadata, generated-source freshness, full client build
> + tests) before handing off to ESRP. Each pipeline can also be
> triggered manually from the ADO UI as a hotfix escape hatch.

## Per-client release flow

### Rust (`rust/vX.Y.Z`)

1. Bump `[workspace.package].version` in `clients/rust/Cargo.toml` (this
   bumps all three crates — `ahp-types`, `ahp`, `ahp-ws` — together; the
   workspace is intentionally version-locked).
2. Update cross-crate `version = "0.X.Y"` pins in
   `[workspace.dependencies]` and any per-crate dependency declarations.
3. Run `npm run generate:metadata` and commit the regenerated
   `clients/rust/release-metadata.json`.
4. Rotate `clients/rust/CHANGELOG.md`: move the `## [Unreleased]` section to
   `## [X.Y.Z] — YYYY-MM-DD` with an `Implements AHP <version>` line.
5. Merge to `main`.
6. Tag: `git tag rust/v0.X.Y && git push origin rust/v0.X.Y`.
7. `publish-rust.yml` validates, then publishes `ahp-types`, `ahp`, and
   `ahp-ws` to crates.io in dependency order.

### Kotlin (`kotlin/vX.Y.Z`)

1. Bump `VERSION_NAME` in `clients/kotlin/gradle.properties`. Drop any
   `-SNAPSHOT` suffix (the publish workflow rejects snapshot tags).
2. Run `npm run generate:metadata` and commit the regenerated
   `clients/kotlin/release-metadata.json`.
3. Rotate `clients/kotlin/CHANGELOG.md`.
4. Merge to `main`.
5. Tag: `git tag kotlin/v0.X.Y && git push origin kotlin/v0.X.Y`.
6. `clients/kotlin/pipeline.yml` (Azure DevOps) validates the tag,
   re-runs the generator + Gradle `check`, fetches the GPG signing key
   from the `vscode` Key Vault, stages **and GPG-signs** a Maven
   repository layout under `clients/kotlin/build/maven-staging/`, and
   hands it to ESRP (`contenttype: maven`). ESRP uploads the signed
   artifacts to Maven Central via the Sonatype Central Portal. No manual
   Sonatype UI interaction is required.
7. Bump `VERSION_NAME` back to the next `-SNAPSHOT` for ongoing development.

### TypeScript (`typescript/vX.Y.Z`)

The TypeScript client publishes from an Azure DevOps pipeline
(`clients/typescript/pipeline.yml`) that extends Microsoft's internal
`vscode-engineering` npm-package template. ADO owns the tag trigger
directly — there is no GitHub Actions bridge — because this repo cannot
use PATs to trigger ADO from GHA.

1. Bump `version` in `clients/typescript/package.json`.
2. `cd clients/typescript && npm install` to refresh the lockfile.
3. Run `npm run generate:metadata` from the repo root and commit the
   regenerated `clients/typescript/release-metadata.json`.
4. Rotate `clients/typescript/CHANGELOG.md`: move `## [Unreleased]` to
   `## [X.Y.Z] — YYYY-MM-DD` with an `Implements AHP <version>` line.
5. Merge to `main`.
6. Tag: `git tag typescript/v0.X.Y && git push origin typescript/v0.X.Y`.
7. The ADO pipeline picks up the tag, validates it against
   `package.json`, runs `verify:release-metadata`, `verify:changelog`,
   and the regen + build + test sequence, then publishes
   `@microsoft/agent-host-protocol` to npm with signed provenance via
   the vscode-engineering template.

The ADO pipeline can also be triggered manually from the ADO UI as a
hotfix escape hatch — manual runs publish too. Both paths funnel
through the same validation steps in the pipeline's `buildSteps` so a
release artifact can't ship from a broken state regardless of which
trigger started the run.

### Swift (`vX.Y.Z`, bare)

1. Update `clients/swift/VERSION` to the new bare semver string (no
   leading `v`, no `-SNAPSHOT`).
2. Run `npm run generate:metadata` and commit the regenerated
   `clients/swift/release-metadata.json`.
3. Rotate `clients/swift/CHANGELOG.md`.
4. Merge to `main`.
5. Tag: `git tag v0.X.Y && git push origin v0.X.Y`. **Note the absence of
   any prefix** — this is the one place in the repo where bare semver tags
   are correct.
6. `publish-swift.yml` validates the tag against `clients/swift/VERSION`,
   builds and tests the Swift package on macOS, and publishes a GitHub
   Release. SwiftPM consumers resolve the tag directly; no registry push
   happens.

### Go (`clients/go/vX.Y.Z`)

1. Update `clients/go/VERSION` to the new bare semver string (no leading
   `v`, no `-SNAPSHOT`).
2. Run `npm run generate:metadata` and commit the regenerated
   `clients/go/release-metadata.json`.
3. Rotate `clients/go/CHANGELOG.md`.
4. Merge to `main`.
5. Tag: `git tag clients/go/v0.X.Y && git push origin clients/go/v0.X.Y`.
   **The `clients/go/` prefix is required** — it is what the Go module
   proxy expects for sub-module tag resolution. Bare semver tags are
   reserved for Swift.
6. `publish-go.yml` validates the tag against `clients/go/VERSION`,
   builds + vets + tests the module, warms the Go module proxy with the
   new version, and creates a GitHub Release with the CHANGELOG section
   for the tag. Go consumers resolve the tag via
   `go get github.com/microsoft/agent-host-protocol/clients/go@vX.Y.Z`;
   no registry push happens.

### Spec (`spec/vX.Y.Z`)

1. Bump `PROTOCOL_VERSION` in `types/version/registry.ts` (and, if the
   release is also adding the version to the supported list,
   `SUPPORTED_PROTOCOL_VERSIONS`).
2. Update `ACTION_INTRODUCED_IN` / `NOTIFICATION_INTRODUCED_IN` for any
   new symbols.
3. Run `npm run generate` to refresh schemas, generated client sources,
   and metadata.
4. Rotate the root `CHANGELOG.md`.
5. Merge to `main`.
6. Tag: `git tag spec/v0.X.Y && git push origin spec/v0.X.Y`.
7. `publish-spec.yml` validates, regenerates the JSON schemas from the
   tagged commit, captures a `registry-snapshot.json` of the introduced-in
   maps, and creates a GitHub Release with all of the above as assets.

## What CI guards against

| Drift caught by | How |
| --- | --- |
| `Version.generated.{rs,kt,swift,go}` ↔ `types/version/registry.ts` | Per-language CI job re-runs `npm run generate:<lang>` and fails on diff. |
| `release-metadata.json` ↔ native manifest + registry | `npm run verify:release-metadata` (also gated on every publish workflow). |
| Native package version ↔ matching CHANGELOG entry | `npm run verify:changelog` (in CI, and re-run in `publish-rust.yml` / `publish-swift.yml` / `publish-go.yml` / both ADO `pipeline.yml`s). |
| Tag ↔ manifest version | Every tag-driven publish workflow's "Verify tag matches" step. |
| Tag-derived version ↔ CHANGELOG entry | Every tag-driven publish workflow's `grep -qE '^## \[<tag-version>\]'` step (defense-in-depth alongside `verify:changelog`). |

## Required infrastructure (one-time setup)

These environments and secrets are required for the publish workflows to
function. They are set per-repo by a maintainer with admin access.

| Environment / secret | Used by | Purpose |
| --- | --- | --- |
| `crates-io` environment, `CARGO_REGISTRY_TOKEN` secret | `publish-rust.yml` | Authenticates `cargo publish` for `ahp-types` / `ahp` / `ahp-ws`. |
| Azure DevOps Service Connection to ESRP + Maven Central provisioning | `clients/kotlin/pipeline.yml` (vscode-engineering `maven-package` template) | Uploads the GPG-signed staged Maven layout to Maven Central via the Sonatype Central Portal. Provisioned inside the Microsoft ADO tenant; no GitHub secret required. |
| `vscode` Key Vault secrets `maven-gpg-private-key` + `maven-gpg-passphrase` | vscode-engineering `maven-package` template (`AzureKeyVault@2`), consumed by `clients/kotlin/pipeline.yml` | GPG key used to sign the Kotlin Maven artifacts (`.asc`) — Maven Central requires PGP signatures and ESRP does not generate them. The matching public key must be published to a keyserver. Provisioned inside the Microsoft ADO tenant; no GitHub secret required. |
| Azure DevOps Service Connection to ESRP + npm publish creds | `clients/typescript/pipeline.yml` (vscode-engineering `npm-package` template) | Authenticates `npm publish` for `@microsoft/agent-host-protocol`. Provisioned inside the Microsoft ADO tenant; no GitHub secret required. |
| (none required) | `publish-swift.yml`, `publish-spec.yml`, `publish-go.yml` | All three use the default `GITHUB_TOKEN` to create GitHub Releases. No external registry credentials needed — SwiftPM and the Go module proxy index tags directly. |
