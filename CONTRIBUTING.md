# Contributing to the Agent Host Protocol

Thanks for your interest in contributing to AHP. This document covers the
mechanics of working in this repository as a contributor — for the
protocol design rationale see the [specification](docs/specification/) and
the [versioning policy](docs/specification/versioning.md), and for the
mechanics of cutting a release see [`RELEASING.md`](RELEASING.md).

> **Code of conduct:** participation is governed by the
> [Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md).

## Repository layout

This is a polyglot repo. The TypeScript types under `types/` are the canonical
source of truth; everything else is generated from them or hand-maintained
against them.

| Path | What lives here |
| --- | --- |
| `types/` | Canonical TypeScript protocol types, reducers, version registry. |
| `schema/` | JSON Schema files generated from `types/`. |
| `docs/` | VitePress documentation source. |
| `scripts/` | TypeScript code-gen scripts (one per target language + shared helpers). |
| `clients/rust/` | `ahp-types`, `ahp`, `ahp-ws` Cargo workspace. |
| `clients/kotlin/` | Kotlin/JVM library (`com.microsoft.agenthostprotocol:agent-host-protocol`). |
| `clients/swift/` | Swift package (consumed by SwiftPM at the repo root). |
| `clients/typescript/` | npm package `@microsoft/agent-host-protocol`. |
| `clients/go/` | Go module (`ahptypes`, `ahp`, `ahpws`). |
| `clients/dotnet/` | .NET / NuGet packages (`Microsoft.VisualStudioCode.AgentHostProtocol`, `.Abstractions`). |
| `.github/workflows/` | CI and per-artifact publish pipelines. |

## Local dev loop

```bash
npm install                      # install root tooling
npm run generate                 # regenerate every client + schemas
npm test                         # typecheck + lint + release/changelog verification + reducer tests
```

Per-client builds (run only what's relevant to your change):

```bash
cd clients/typescript && npm ci && npm test && npm run build
cd clients/rust && cargo test --workspace
cd clients/kotlin && ./gradlew build
swift build && swift test        # Swift uses the root Package.swift
cd clients/go && go test ./...
cd clients/dotnet && dotnet test
```

### Documentation theme

The site and homepage notebook share light/dark palette tokens in
[`docs/.vitepress/theme/custom.css`](docs/.vitepress/theme/custom.css).
Use those `--nb-*` semantic tokens in demo components and their `--vp-*`
aliases for documentation surfaces, rather than hard-coding light colors.
VitePress owns the theme switch and persisted preference.

For theme or notebook changes, run the focused tests and documentation build:

```bash
npx tsx --test scripts/site-theme.test.ts scripts/homepage-*.test.ts
npm run generate:docs
npx vitepress build docs
```

Check the homepage's chat, automation, terminal and channel chapters as well as
guide/specification/reference pages, search, and mobile navigation in both modes.

## Guides and skills

Workflow guides live under [`skills/`](skills/) as the single source of truth
for both human contributors and AI coding agents:

- **Protocol changes & naming:** [`skills/protocol-authoring/SKILL.md`](skills/protocol-authoring/SKILL.md)
  and the [protocol naming dictionary](skills/protocol-authoring/naming.md).
- **Changelog fragments:** [`skills/changelog/SKILL.md`](skills/changelog/SKILL.md)
  — add a single fragment under `docs/.changes/` (or update an existing
  unreleased fragment) for user-visible changes, and validate with
  `npm run verify:change-fragments`. Do not edit `CHANGELOG.md` files directly
  on feature/fix PRs.
- **Releases:** [`skills/release-ahp/SKILL.md`](skills/release-ahp/SKILL.md)
  for the coordinated release flow, and [`RELEASING.md`](RELEASING.md) for tag
  conventions, CI guards, and publishing infrastructure.
- **Per-client conventions:** [`clients/dotnet/AGENTS.md`](clients/dotnet/AGENTS.md),
  [`clients/go/AGENTS.md`](clients/go/AGENTS.md),
  [`clients/kotlin/AGENTS.md`](clients/kotlin/AGENTS.md), and
  [`clients/swift/AGENTS.md`](clients/swift/AGENTS.md).

## Code-style and review

Editor / lint / typecheck configuration lives in `eslint.config.mjs`,
`tsconfig.json`, and each client's native config. Run `npm test` before
opening a PR; CI runs the same checks plus per-language builds.
