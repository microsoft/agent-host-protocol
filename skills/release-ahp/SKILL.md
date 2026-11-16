---
name: release-ahp
description: Cut a coordinated AHP release (spec + all 6 clients) — bumps manifests, dates CHANGELOGs, promotes website docs alongside the development bump in one PR, and pushes seven release tags before merging. Use when the user says "release AHP X.Y.Z", "publish AHP", "cut a release", "tag the release", or similar. Includes recovery for missing publish triggers.
---

# Releasing AHP

This skill is the operational counterpart to [`RELEASING.md`](../../RELEASING.md)
and the cross-cutting [`AGENTS.md`](../../AGENTS.md). `RELEASING.md` is the
canonical reference for **what** to do per artifact; this skill captures the
**order of operations** and the foot-guns that bite during a multi-artifact
release.

The repo ships seven independently-versioned artifacts but they are released
together by convention — pin the same `X.Y.Z` across all six client
manifests and the spec on every release unless the user explicitly asks
otherwise.

## When to use this skill

The user wants to release AHP. Typical asks:

- "release AHP 0.3.0"
- "tag the release", "push the release tags", "run the publish workflows"
- "the next release will be X.Y.Z" (implies post-release bump)
- "the publish workflow didn't fire on tag T, can you re-trigger it"

If the user asks for a **single-client** release (e.g. "just bump Rust"),
prefer the `.github/prompts/publish-*.prompt.md` files instead — this skill
is for coordinated cross-artifact releases.

## Mental model

A release is **two commits in one PR**, plus **seven tags pushed at the first
commit's SHA after CI and review approval but before merge**:

1. **Release commit** — consumes `docs/.changes/*.json` fragments into
   dated `## [X.Y.Z]` CHANGELOG sections, bumps every client manifest from
   the previous version → `X.Y.Z`, and regenerates `release-metadata.json`
   for every client. **All seven tags must point at this commit's SHA.**
2. **Post-release commit** — bumps `PROTOCOL_VERSION` in
   `types/version/registry.ts` to the next planned version, regenerates native
   version constants, adds an Unreleased spec changelog placeholder, and
   prepends the **released** version to `STABLE_DOC_VERSIONS` in
   `docs/.vitepress/versions.ts`. Keep the released compatibility baselines in
   `SUPPORTED_PROTOCOL_VERSIONS` unchanged unless intentionally revising policy.

Create the bare Swift/docs tag locally before validating commit 2. Push tags
only after the PR is approved and CI passes, then enable merge. Publishing
therefore starts before merge, and the documentation deployment triggered by
merge can resolve the new stable tag. **No follow-up docs PR is needed.**

## Step-by-step

### 0. Capture the inputs

Before touching anything, confirm with the user:

- **Release version** (`X.Y.Z`) — the version to use when consuming
  `docs/.changes/*.json` into the seven changelogs.
- **Next development version** (default: bump minor, i.e. `X.(Y+1).0`).
- **Release scope** (default: all seven artifacts; rare to release one in
  isolation).

### 1. Branch + commit 1 (release commit)

Create `release/ahp-<version>` off `main`. Then in a single commit:

- **CHANGELOGs** — run
  `npm run changelog:release -- --version X.Y.Z --date <today YYYY-MM-DD>`
  to collapse `docs/.changes/*.json` into the seven changelogs. This creates
  or replaces each `## [X.Y.Z] — <today YYYY-MM-DD>` section and adds the
  `Spec version` / `Implements AHP X.Y.Z.` line automatically.
- **Manifests** — bump every native version file to `X.Y.Z`:
  - `clients/rust/Cargo.toml` `[workspace.package].version` **and** the
    `version = "X.Y.Z"` pins on `ahp-types`/`ahp` inside
    `[workspace.dependencies]`.
  - `clients/kotlin/gradle.properties` `VERSION_NAME`.
  - `clients/typescript/package.json` `version`.
  - `clients/swift/VERSION` (bare semver, no `v` prefix, trailing newline).
  - `clients/go/VERSION` (bare semver, no `v` prefix, trailing newline).
  - `clients/dotnet/VERSION` (bare semver, no `v` prefix, trailing newline).
- **Lockfiles** — refresh after the manifest bump:
  - In `clients/typescript/`: `npm install --no-audit --no-fund` (no-op if
    already up to date but writes the version into `package-lock.json`).
  - In `clients/rust/`: `cargo update -w` (rewrites only the workspace
    crates in `Cargo.lock` — outside crates stay pinned).
- **Metadata** — at repo root: `npm run generate:metadata`.
- **Verify** — at repo root: `npm test`. This runs
  `verify:change-fragments`, `verify:release-metadata`, and
  `verify:changelog`, which together gate the release: malformed fragments,
  a metadata drift, or a missing CHANGELOG heading will fail here and not at
  tag-push time.

> **Do not** bump `PROTOCOL_VERSION` in this commit. The tag-push
> workflows validate that the registry version matches the tag's version,
> so commit 1 must still have `PROTOCOL_VERSION = X.Y.Z`.

Commit message:

```
release: AHP X.Y.Z
```

**Record this commit's SHA and create the bare Swift/docs tag locally.**
Every release tag points at this SHA. Do not push tags yet.

```sh
RELEASE_SHA=$(git rev-parse HEAD)
git tag vX.Y.Z "$RELEASE_SHA"
```

### 2. Commit 2 (post-release bump and docs promotion)

On the same branch, in a second commit:

- `types/version/registry.ts`:
  - `PROTOCOL_VERSION = 'X.(Y+1).0'`.
  - Leave `SUPPORTED_PROTOCOL_VERSIONS` unchanged: it contains released
    compatibility baselines, not every release or development version.
- In `docs/.vitepress/versions.ts`, prepend `X.Y.Z` to
  `STABLE_DOC_VERSIONS`, keeping older entries. For example, releasing `1.1.0`
  and starting `1.2.0` sets `PROTOCOL_VERSION = '1.2.0'` and
  `STABLE_DOC_VERSIONS = ['1.1.0', '1.0.0']` in this same commit.
  Both the homepage specification label and the default docs use the first
  stable entry; only the draft label follows `PROTOCOL_VERSION`.
- Run `npm run generate` at repo root — this regenerates every client's
  `Version.generated.*` and every `release-metadata.json`.
- In the root spec `CHANGELOG.md`, add a
  `## [X.(Y+1).0] — Unreleased` placeholder (with a
  `Spec version: \`X.(Y+1).0\`` line) below the existing
  `## [Unreleased]` section. Per-client changelogs already keep their
  empty `## [Unreleased]` section after fragment consumption.
- Run `npm test` and `npm run docs:build`. The local `vX.Y.Z` tag from step 1
  supplies the new stable snapshot. Verify the default release pages, older
  version routes, and next-development draft label.

Commit message:

```
chore: bump PROTOCOL_VERSION to X.(Y+1).0 for ongoing development
```

### 3. Open the PR and obtain approval (do not enable auto-merge yet)

```sh
git push -u origin release/ahp-X.Y.Z
gh pr create --base main --head release/ahp-X.Y.Z \
  --title "release: AHP X.Y.Z" \
  --body-file <(...)
```

Wait for all required CI checks and collaborator approvals. Confirm merge
commits are allowed; otherwise stop and agree on a release strategy before
publishing tags. Do not push release tags while the PR still needs changes.
If either commit changes, revalidate the release SHA and docs build before
continuing; never move an already-published tag.

The PR body should include:

- The release SHA in a copy-pastable variable assignment.
- The seven tag-push commands (see step 4 below), noting that they must run
  before auto-merge is enabled.
- The docs promotion and successful `npm run docs:build` validation.
- A note that Kotlin, TypeScript, and .NET publish via Azure DevOps pipelines
  (they appear under [agent-host-protocol pipelines in
  vscode-engineering](https://dev.azure.com/vscode/VSCode/_build)), not
  GitHub Actions.

### 4. Push the seven tags before merge

The PR must be approved and CI green before this step: pushing these tags
starts publishing from the validated release commit before it reaches `main`.
The bare `vX.Y.Z` tag was already created locally in step 1.

```sh
RELEASE_SHA=<sha from step 1>
git tag spec/vX.Y.Z       "$RELEASE_SHA"
git tag rust/vX.Y.Z       "$RELEASE_SHA"
git tag kotlin/vX.Y.Z     "$RELEASE_SHA"
git tag typescript/vX.Y.Z "$RELEASE_SHA"
git tag clients/go/vX.Y.Z "$RELEASE_SHA"
git tag dotnet/vX.Y.Z     "$RELEASE_SHA"
git push origin spec/vX.Y.Z
git push origin rust/vX.Y.Z
git push origin kotlin/vX.Y.Z
git push origin typescript/vX.Y.Z
git push origin vX.Y.Z
git push origin clients/go/vX.Y.Z
git push origin dotnet/vX.Y.Z
git ls-remote --tags origin '*/vX.Y.Z' 'vX.Y.Z'
```

Verify all seven remote tags point at `RELEASE_SHA` before enabling merge.
Push tags separately so each emits its own publish event.

The seven tag schemes are deliberate and not interchangeable. Bare
`vX.Y.Z` is reserved for Swift (SwiftPM only resolves root-level tags);
`clients/go/vX.Y.Z` is required by the Go module proxy's sub-module
resolution.

### 5. Confirm publish runs started

For each tag, verify the corresponding workflow run is queued or in
progress:

```sh
GH_PAGER=cat gh run list --limit 10 \
  --json databaseId,event,headBranch,status,conclusion,workflowName,displayTitle
```

Expect to see four GH Actions runs (one per tag below) within seconds:

| Tag                  | Workflow              | Publishes to |
| -------------------- | --------------------- | ------------ |
| `spec/vX.Y.Z`        | `Publish Spec`        | GitHub Release (schema assets) |
| `rust/vX.Y.Z`        | `Publish Rust Crates` | crates.io (`ahp-types`, `ahp`, `ahp-ws`) |
| `vX.Y.Z`             | `Publish Swift Package` | SwiftPM (tag-resolved) |
| `clients/go/vX.Y.Z`  | `Publish Go Module`   | Go module proxy (tag-resolved) |

The remaining three tags trigger Azure DevOps pipelines that don't appear
in `gh run list`:

| Tag                  | ADO Pipeline                         | Publishes to |
| -------------------- | ------------------------------------ | ------------ |
| `kotlin/vX.Y.Z`      | `clients/kotlin/pipeline.yml`        | Maven Central via ESRP |
| `typescript/vX.Y.Z`  | `clients/typescript/pipeline.yml`    | npm via ESRP |
| `dotnet/vX.Y.Z`      | `clients/dotnet/pipeline.yml`        | NuGet.org via ESRP (approval required) |

For Kotlin/TypeScript/.NET, link the user to the AHP pipelines in ADO
(`vscode-engineering` tenant) to confirm the runs started. These
pipelines can also be triggered manually from the ADO UI as a hotfix
escape hatch — the validation steps inside each pipeline are identical
to the tag-triggered path.

### 6. Merge the combined PR and verify the deployed website

Only after all remote tags are verified and publish runs have started:

```sh
gh pr merge <num> --auto --merge
```

**Use `--merge`, not `--squash` or rebase-and-merge**, to keep the tagged release
SHA reachable from `main`.

After merge:

```sh
git fetch origin main
git merge-base --is-ancestor "$RELEASE_SHA" origin/main
```

Do not tag the post-release commit: its registry is already on the next
development version. Wait for `Deploy Documentation` to succeed, then verify
the live homepage shows `vX.Y.Z`, default docs use `X.Y.Z`, the version selector
includes older stable releases, and only the next development version is
labelled `(draft)`. Track publish approvals/failures explicitly. Do not mark the
release complete based only on package publication or a local docs build.

## Recovery — tag pushed but no publish run fired

This has happened. Symptom: tag exists on `origin` but `gh run list`
shows no corresponding workflow run.

None of the four GH Actions publish workflows currently declare
`workflow_dispatch`, so manual dispatch is not available. The recovery
is to **delete the remote tag and re-push it** at the same SHA — this
emits a fresh push event without changing the tagged commit:

```sh
git push origin --delete <tag>
git push origin <tag>
```

Do **not** include the `--delete`d tag in the same `git push` command as
the re-push — push them in separate `git push` invocations so each tag
emits its own push event. Re-pushing several tags in a single command
sometimes coalesces into a single event and only one workflow fires.

Once recovery is verified, suggest a follow-up PR adding
`workflow_dispatch:` to the four publish workflows so the next missed
trigger can be re-run from the Actions UI without tag thrash.

## Common foot-guns

- **Deferring docs promotion or merging before tags exist** — update
  `STABLE_DOC_VERSIONS` alongside the development bump in the same PR. Create
  the bare tag locally for validation, push it after CI/review approval, and
  only then enable merge. Otherwise the website stays on the old release or
  its build cannot resolve the new snapshot.
- **GPG signing lock during `git commit`** — if you see
  `gpg: keydb_search failed: Operation timed out`, run
  `gpgconf --kill all && rm -f ~/.gnupg/public-keys.d/pubring.db.lock`
  and retry the commit.
- **Bumping `PROTOCOL_VERSION` in commit 1** — the publish workflows
  re-validate the tag against the tagged commit's `PROTOCOL_VERSION`,
  so a release tag pointing at the post-release commit fails the "Verify
  tag matches" step. Always keep the bump in commit 2.
- **Forgetting the Rust `[workspace.dependencies]` pins** — bumping just
  `[workspace.package].version` leaves the cross-crate `ahp-types`/`ahp`
  pins on the old version. `verify-release-metadata` does not catch this
  but `cargo publish --dry-run` will.
- **Forgetting `cargo update -w`** — without it, `Cargo.lock` keeps the
  old version for ahp-types/ahp/ahp-ws and the resulting commit is
  partially-bumped. CI's per-language drift check catches it.
- **Forgetting the Swift/Go trailing newline in `VERSION`** — the
  `read*PackageVersion` helpers trim, so functionally it's fine, but
  the convention is `0.3.0\n`.
- **Mixing up the Swift tag namespace** — Swift uses **bare** `vX.Y.Z`
  (no prefix). Every other artifact has a prefix. Putting `swift/vX.Y.Z`
  on Swift's tag silently breaks SwiftPM resolution.
