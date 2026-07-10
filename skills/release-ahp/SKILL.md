---
name: release-ahp
description: Cut a coordinated AHP release (spec + all 5 clients) — bumps every manifest, dates the CHANGELOGs, opens the release PR with auto-merge, and walks through pushing the six per-artifact tags. Use when the user says "release AHP X.Y.Z", "publish AHP", "cut a release", "tag the release", or similar. The skill also captures the recovery procedure for tags whose publish workflow didn't fire.
---

# Releasing AHP

This skill is the operational counterpart to [`RELEASING.md`](../../RELEASING.md)
and the cross-cutting [`AGENTS.md`](../../AGENTS.md). `RELEASING.md` is the
canonical reference for **what** to do per artifact; this skill captures the
**order of operations** and the foot-guns that bite during a multi-artifact
release.

The repo ships six independently-versioned artifacts but they are released
together by convention — pin the same `X.Y.Z` across all five client
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

A release is **two commits in one PR**, plus **six tags pushed at the first
commit's SHA after merge**:

1. **Release commit** — consumes `docs/.changes/*.json` fragments into
   dated `## [X.Y.Z]` CHANGELOG sections, bumps every client manifest from
   the previous version → `X.Y.Z`, and regenerates `release-metadata.json`
   for every client. **All six tags must point at this commit's SHA.**
2. **Post-release commit** — bumps `PROTOCOL_VERSION` in
   `types/version/registry.ts` to the next planned version, prepends it to
   `SUPPORTED_PROTOCOL_VERSIONS`, regenerates each
   `Version.generated.{rs,kt,swift,go}`, and adds a
   `## [X.Y+1.0] — Unreleased` placeholder in the root spec `CHANGELOG.md`.

## Step-by-step

### 0. Capture the inputs

Before touching anything, confirm with the user:

- **Release version** (`X.Y.Z`) — the version to use when consuming
  `docs/.changes/*.json` into the six changelogs.
- **Next development version** (default: bump minor, i.e. `X.(Y+1).0`).
- **Release scope** (default: all six artifacts; rare to release one in
  isolation).

### 1. Branch + commit 1 (release commit)

Create `release/ahp-<version>` off `main`. Then in a single commit:

- **CHANGELOGs** — run
  `npm run changelog:release -- --version X.Y.Z --date <today YYYY-MM-DD>`
  to collapse `docs/.changes/*.json` into the six changelogs. This creates
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

**Record this commit's SHA.** Every release tag points at it.

### 2. Commit 2 (post-release bump)

On the same branch, in a second commit:

- `types/version/registry.ts`:
  - `PROTOCOL_VERSION = 'X.(Y+1).0'`.
  - `SUPPORTED_PROTOCOL_VERSIONS = ['X.(Y+1).0', 'X.Y.Z', ...]` (newest
    first; keep any older entries the previous list had).
- Run `npm run generate` at repo root — this regenerates every client's
  `Version.generated.*` and every `release-metadata.json`.
- In the root spec `CHANGELOG.md`, add a
  `## [X.(Y+1).0] — Unreleased` placeholder (with a
  `Spec version: \`X.(Y+1).0\`` line) below the existing
  `## [Unreleased]` section. Per-client changelogs already keep their
  empty `## [Unreleased]` section after fragment consumption.
- Run `npm test` again.

Commit message:

```
chore: bump PROTOCOL_VERSION to X.(Y+1).0 for ongoing development
```

### 3. Open the PR with auto-merge

```sh
git push -u origin release/ahp-X.Y.Z
gh pr create --base main --head release/ahp-X.Y.Z \
  --title "release: AHP X.Y.Z" \
  --body-file <(...)
gh pr merge <num> --auto --merge
```

**Use `--merge`, not `--squash`** — the tags need commit 1's SHA to
survive the merge. A squash collapses both commits into a new SHA on
`main`, and the workflows' `PROTOCOL_VERSION` check would then fail
because post-merge HEAD is on the next-dev version. A merge commit
preserves both original commits as reachable parents.

If the repo's branch protection forces squash, fall back to either:

- Tag the SHA **before** the squash-merge completes (the commit stays
  retained once tagged), or
- Use the "Rebase and merge" strategy (also preserves both SHAs).

Always confirm before merging which strategy preserves commit 1's SHA on
`main`, and resolve any ambiguity with the user.

The PR body should include:

- The release SHA in a copy-pastable variable assignment.
- The six tag-push commands (see step 5 below).
- A note that Kotlin and TypeScript publish via Azure DevOps pipelines
  (they appear under [agent-host-protocol pipelines in
  vscode-engineering](https://dev.azure.com/vscode/VSCode/_build)), not
  GitHub Actions.

### 4. After merge — verify the release SHA is reachable

```sh
git checkout main
git pull --ff-only origin main
git cat-file -t <RELEASE_SHA>   # must print "commit"
```

If it doesn't exist (squash happened despite intent), open a follow-up
discussion with the user before tagging. Do **not** tag the squashed
commit on `main` — its registry shows the post-release version, and
every publish workflow will reject the tag.

### 5. Push the six tags

```sh
RELEASE_SHA=<sha from step 1>
git tag spec/v<X.Y.Z>        $RELEASE_SHA
git tag rust/v<X.Y.Z>        $RELEASE_SHA
git tag kotlin/v<X.Y.Z>      $RELEASE_SHA
git tag typescript/v<X.Y.Z>  $RELEASE_SHA
git tag v<X.Y.Z>             $RELEASE_SHA   # Swift — bare per RELEASING.md
git tag clients/go/v<X.Y.Z>  $RELEASE_SHA
git push origin \
  spec/v<X.Y.Z> rust/v<X.Y.Z> kotlin/v<X.Y.Z> \
  typescript/v<X.Y.Z> v<X.Y.Z> clients/go/v<X.Y.Z>
```

The six tag schemes are deliberate and not interchangeable. Bare
`vX.Y.Z` is reserved for Swift (SwiftPM only resolves root-level tags);
`clients/go/vX.Y.Z` is required by the Go module proxy's sub-module
resolution.

### 6. Confirm publish runs started

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

The remaining two tags trigger Azure DevOps pipelines that don't appear
in `gh run list`:

| Tag                  | ADO Pipeline                         | Publishes to |
| -------------------- | ------------------------------------ | ------------ |
| `kotlin/vX.Y.Z`      | `clients/kotlin/pipeline.yml`        | Maven Central via ESRP |
| `typescript/vX.Y.Z`  | `clients/typescript/pipeline.yml`    | npm via ESRP |

For Kotlin/TypeScript, link the user to the AHP pipelines in ADO
(`vscode-engineering` tenant) to confirm the runs started. Both
pipelines can also be triggered manually from the ADO UI as a hotfix
escape hatch — the validation steps inside each pipeline are identical
to the tag-triggered path.

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
