# Releasing AHP

Reference for AHP release conventions, CI guards, and publishing
infrastructure.

- **Step-by-step coordinated release workflow:**
  [`skills/release-ahp/SKILL.md`](skills/release-ahp/SKILL.md) (including
  two-commit PR structure, pre-merge tag pushing, website promotion, and
  missed-trigger recovery).
- **Changelog fragment rules:**
  [`skills/changelog/SKILL.md`](skills/changelog/SKILL.md).
- **Protocol versioning policy:**
  [`docs/specification/versioning.md`](docs/specification/versioning.md).

## Release model

Every shippable artifact in this repo (the protocol spec plus the six language
clients) is versioned independently using its ecosystem's native SemVer, and
each client advertises supported protocol versions via a generated
`SUPPORTED_PROTOCOL_VERSIONS` constant and `clients/<lang>/release-metadata.json`.

Coordinated releases ship in **one PR with two commits** (release commit +
post-release development bump and `STABLE_DOC_VERSIONS` promotion), with all
seven release tags pushed at the first commit's SHA after approval and CI pass
but **before merging** (using a merge commit). See
[`skills/release-ahp/SKILL.md`](skills/release-ahp/SKILL.md) for the exact
commands.

To collapse changelog fragments into the seven Keep-a-Changelog files (or a
single-artifact subset via `--targets <target>`):

```sh
npm run changelog:release -- --version X.Y.Z --date YYYY-MM-DD
```

## Tag conventions

| Artifact   | Tag pattern         | Workflow                          | Registry / discovery |
| ---------- | ------------------- | --------------------------------- | -------------------- |
| Spec       | `spec/vX.Y.Z`       | `.github/workflows/publish-spec.yml` | GitHub Release with schema assets. |
| Rust       | `rust/vX.Y.Z`       | `.github/workflows/publish-rust.yml` | crates.io (`ahp-types`, `ahp`, `ahp-ws`). |
| Kotlin     | `kotlin/vX.Y.Z`     | `clients/kotlin/pipeline.yml` (Azure DevOps) | Maven Central (`com.microsoft.agenthostprotocol:agent-host-protocol`) via ESRP. |
| TypeScript | `typescript/vX.Y.Z` | `clients/typescript/pipeline.yml` (Azure DevOps) | npm (`@microsoft/agent-host-protocol`) via ESRP. |
| Swift      | `vX.Y.Z` (bare)     | `.github/workflows/publish-swift.yml` | SwiftPM resolves the tag directly. |
| Go         | `clients/go/vX.Y.Z` | `.github/workflows/publish-go.yml` | Go module proxy resolves the tag directly. |
| .NET       | `dotnet/vX.Y.Z`     | `clients/dotnet/pipeline.yml` (Azure DevOps) | NuGet.org (`Microsoft.VisualStudioCode.AgentHostProtocol`, `.Abstractions`). |

> **Why Swift gets the bare semver tag namespace:** SwiftPM only resolves
> packages by matching plain `X.Y.Z` / `vX.Y.Z` git tags at the manifest's
> repo root. Path-prefixed tags like `swift/v0.2.0` are invisible to it. Bare
> semver tags at this repo's root are therefore reserved for Swift releases
> (and also used by the docs builder to materialize stable doc snapshots).

> **Why Go uses the `clients/go/` prefix:** Go's module-version resolution
> for sub-module paths requires the tag prefix to match the module's
> directory inside the repo (see [`go help mod` › Module versions](https://go.dev/ref/mod#vcs-version)).
> Without the prefix, `go get github.com/microsoft/agent-host-protocol/clients/go@vX.Y.Z`
> would fail to find a matching tag.

> **Why TypeScript, Kotlin, and .NET publish from Azure DevOps:** npm, Maven
> Central, and NuGet publishes go through Microsoft's ESRP-backed
> `vscode-engineering` pipeline templates (1ES-hosted agents, signed publish,
> retention policy). GitHub Actions cannot trigger ADO pipelines here (PATs
> are not permitted), so the ADO pipelines own the `typescript/vX.Y.Z`,
> `kotlin/vX.Y.Z`, and `dotnet/vX.Y.Z` tag triggers directly (and can also be
> triggered manually from the ADO UI as a hotfix escape hatch).

## Single-artifact hotfix notes

For an isolated single-artifact release (outside a coordinated release), bump
that artifact's version manifest, refresh its lockfile if applicable
(`clients/typescript`: `npm install --no-audit --no-fund`; `clients/rust`:
`cargo update -w` and update `[workspace.dependencies]` pins; `clients/kotlin`:
drop `-SNAPSHOT` before tagging and restore `-SNAPSHOT` afterward), run
`npm run generate:metadata`, consume scoped fragments with
`npm run changelog:release -- --version X.Y.Z --targets <target>`, merge to
`main`, and push the matching tag from the table above.

## What CI guards against

| Drift caught by | How |
| --- | --- |
| `Version.generated.{rs,kt,swift,go,cs}` ↔ `types/version/registry.ts` | Per-language CI job re-runs `npm run generate:<lang>` and fails on diff. |
| `release-metadata.json` ↔ native manifest + registry | `npm run verify:release-metadata` (also gated on every publish workflow). |
| `docs/.changes/*.json` shape | `npm run verify:change-fragments` validates fragment type, message, optional details, targets, and issue references before release collapse. |
| Native package version ↔ matching CHANGELOG entry | `npm run verify:changelog` (in CI, and re-run in publish workflows and ADO pipelines). |
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
| Azure DevOps Service Connection to ESRP + NuGet approval | `clients/dotnet/pipeline.yml` | Authenticode-signs assemblies, packs and author-signs NuGet packages, and publishes to NuGet.org after approval. |
| (none required) | `publish-swift.yml`, `publish-spec.yml`, `publish-go.yml` | All three use the default `GITHUB_TOKEN` to create GitHub Releases. No external registry credentials needed — SwiftPM and the Go module proxy index tags directly. |
