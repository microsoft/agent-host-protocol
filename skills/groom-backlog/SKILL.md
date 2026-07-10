---
name: groom-backlog
description: Audits recently closed PRs in agent-host-protocol (AHP) to make sure any future work they promised has a tracking issue (filing new ones or linking PRs to existing ones), then triages every open issue into implementable-now / no-longer-relevant / blocked-on-a-dependency, closing or annotating each accordingly, and finally prioritizes and implements the ready issues. Validates every follow-up and issue against the current state of this repo — the canonical `types/`, the generated client mirrors, the conformance fixtures, and the published versioned artifacts — before acting. Use when asked to triage or groom the issue backlog, file follow-up issues from merged PRs, audit closed PRs for un-tracked work, or work through the open issues.
---

# Triage the backlog: file follow-ups, triage open issues, implement the ready ones

`microsoft/agent-host-protocol` (AHP) is the canonical wire spec plus the five clients generated and hand-maintained against it (Rust, Kotlin, Swift, TypeScript, Go). It accumulates two kinds of latent work that drift out of sync with reality if nobody tends them:

- **Promised-but-untracked follow-ups.** Merged PRs routinely defer work — an "out of scope" section, a "follow-up in a future PR" note, a deferred review thread, a `TODO` / "Known … gap" left in `types/`, a client whose hand-written surface wasn't updated to match a spec change. Some of that becomes a tracking issue; some silently doesn't.
- **Stale or blocked open issues.** Issues filed weeks ago may already be done, may have been obsoleted by a later spec change, or may be waiting on a dependency that hasn't landed (a versioning decision, an unresolved design question, or an open proposal under `docs/proposals/`).

This skill is a **backlog-grooming pass** with three phases:

1. **Audit recently closed PRs** and make sure every still-relevant follow-up they called out has a tracking issue — filing new ones, or linking the PR to an existing one.
2. **Triage every open issue** into *implementable now*, *no longer relevant*, or *blocked on a dependency* — closing the obsolete ones with an explanation, annotating the blocked ones with the specific blocker, and shortlisting the ready ones.
3. **Prioritize and implement** the ready issues in order, grouping closely-related ones into a single PR where it makes sense.

## Mindset — take your time and be thorough

This is the most important instruction in this skill. **Do not rush, and do not jump to conclusions.** Triage is an analysis task first and an editing task second. Opening a duplicate issue, closing one that is still needed, annotating the wrong blocker, or implementing against a stale description is expensive to unwind and erodes trust in the backlog. A shallow pass is worse than doing nothing.

- **Take as much time as you need** to build a genuine understanding of each PR, each issue, and the current state of the spec, the clients, and the docs before you open, close, comment, or implement anything. Read the actual PR diffs, the review threads, the issue bodies, the `types/` they point at, the generated mirrors, and the conformance fixtures — don't infer from titles and subjects alone.
- **Validate every candidate against current reality.** Before filing a follow-up: is it still needed, or did a later PR already do it, or did a subsequent spec change make it moot? Before closing an issue: are you *certain* it's obsolete, or does it just look stale? Before calling an issue "ready": is there really no hidden dependency (a versioning-policy decision, an unresolved design question, an open proposal)? If you can't answer confidently, keep investigating.
- **Distinguish real work from noise.** Not every "out of scope" line in a PR deserves an issue, and not every old issue is dead. Separate "this genuinely still needs doing" from "this is already handled" or "this was speculative and never mattered."
- **When the right answer is ambiguous, stop and ask** rather than guessing — especially before bulk-closing issues or before starting a multi-PR implementation push. A wrong close or a wasted PR is costly.
- **Prefer correctness over a small diff.** Don't contort an implementation to minimize the diff, and don't add migration shims or phased rollouts unless the [versioning policy](../../docs/specification/versioning.md) or the user calls for them. Get each issue *right*. But AHP is a **published, versioned wire contract** with real-world implementers — a breaking protocol change is governed by `docs/specification/versioning.md` and the version registry in `types/version/`, not made casually. When a fix would break the wire surface, treat the versioning policy as a hard constraint and surface the call rather than silently shipping it.

Lean on the `explore` agent to parallelize research across many PRs / issues within this repo when the investigation is broad, and feel free to spend several passes reading before you conclude anything.

## Familiarize yourself first

Before touching the backlog, ground yourself in the system the same way you would before any non-trivial change here:

- Read the repo's own source and docs: the canonical types under `types/` (the source of truth), the generated `schema/`, the prose in `docs/specification/` and `docs/guide/`, and `AGENTS.md`, `CONTRIBUTING.md`, and `RELEASING.md`. The editorial rules for changing protocol types live in [`.github/instructions/general-instructions.instructions.md`](../../.github/instructions/general-instructions.instructions.md) — follow them.
- Understand how a `types/` change ripples outward: every protocol change regenerates `schema/` and each client's `**/generated/**` mirror, may need a hand-written client update, must keep the conformance fixtures under `types/test-cases/` in sync, and lands a `docs/.changes` fragment for **every** affected artifact (per `AGENTS.md` → "Adding changelog fragments"). The version surface lives in `types/version/registry.ts` (`PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`).
- Refresh your understanding of the protocol's public surface and its **published, versioned artifacts** — the crates, the npm package, the Maven/JVM library, the Swift package, and the Go module, all generated from `types/`. AHP is a contract that external clients implement and external products consume, so "is this follow-up still relevant?" is answered against the current spec, the generated and hand-maintained clients in this repo, and what the protocol already guarantees — not against any single implementation.

You don't need to memorize everything up front, but a follow-up audit and an issue triage are only as good as your understanding of the current state of the system. Invest in that first.

## What to validate against

You triage, file, and implement against this one repo — `microsoft/agent-host-protocol`. This is a **public** repository; keep the entire pass inside it and don't reference, read, or depend on any non-public repository or code. "Validation context" therefore means the current, public state of this repo plus what the protocol already ships:

- **The canonical spec and its generated outputs** — `types/`, the generated `schema/`, and each client's `**/generated/**` mirror.
- **The hand-maintained client surface** under `clients/<lang>/`, plus the conformance fixtures in `types/test-cases/`.
- **The prose** in `docs/specification/` and `docs/guide/`, and the in-flight design notes in `docs/proposals/`.
- **The version surface** in `types/version/registry.ts` and the **published, versioned artifacts** generated from it (the crates, npm package, Maven/JVM library, Swift package, and Go module).
- **The repo's own history** — the merged PRs and the open / closed issues themselves.

AHP is a contract that external clients implement and external products consume, but those live in other repositories that are out of scope here. Judge "is this still relevant?" from the spec and the clients in *this* repo and from what the protocol already guarantees. If an issue's real resolution clearly belongs to some external implementation, **note it for the user** rather than going to read or act on another repository.

Always judge relevance against the **current state of this repo's default branch** plus its **recently active open PRs** — not whatever a local clone happens to have checked out. Fetch/refresh before you judge, and use `gh` to read the remote authoritatively. **Note:** this repo is in the `microsoft` org, where `gh`'s GraphQL-backed commands (`gh issue list`, `gh pr list`) can intermittently fail with a credentials error; when that happens, fall back to the REST endpoints via `gh api repos/microsoft/agent-host-protocol/...` (see the appendix).

## How this repo tracks issues and follow-ups

Ground yourself in the local conventions so your issues match the house style and your triage uses the right signals:

- **Labels.** This repo does **not** have a dedicated `follow-up` label — don't assume one exists. Apply the labels a maintainer would: type/area labels like `enhancement`, `documentation`, `bug`, `debt`, `dependencies`, and language tags like `rust`, plus disposition labels `wontfix`, `duplicate`, and `invalid` for closes. `gh label list -R microsoft/agent-host-protocol` is authoritative; if the team would benefit from a `follow-up` label, suggest creating one rather than silently inventing it.
- **Issue templates.** This repo has no `.github/ISSUE_TEMPLATE/` forms today, so new issues are free-form — which means a follow-up issue needs to carry its own structure and completeness.
- **The quality bar for a follow-up issue.** A good follow-up issue stands on its own: a **Context** section linking the originating PR *and* the specific review thread *and* the `types/`/client code or spec prose in question, a **Problem** statement, a concrete **Proposed fix**, an **Affected artifacts** note (which of `types/` / `schema/` / each `clients/<lang>/` / `docs/` / the CHANGELOGs the fix touches), a **Tests / conformance** list (the `types/test-cases/` fixtures or client tests it needs), and an **Out of scope** section. Well-scoped existing issues are the model; read a few current open ones to match the house depth (`gh issue list` / `gh issue view`).
- **Where PRs call out future work.** Look in the PR **body** (`## What` / `## Why` / `## How` notes, "out of scope", "future work", "follow-up", "deferred"), in **review threads** (a reviewer asks for something and the author defers it), and in **the code the PR landed** (`TODO`, `FIXME`, "Known … gap", "deferred from PR #…" in `types/` comments, hand-written client source, or docs). The inverse — promised work with *no* issue — is exactly what phase 1 hunts for.
- **`types/` is the canonical wire contract.** A change to the protocol surface is never local: it regenerates `schema/` and every client's `**/generated/**` mirror, may require a matching hand-written client change, must keep the conformance fixtures in `types/test-cases/` aligned, and lands a `docs/.changes` fragment in each affected artifact's scope. `AGENTS.md` and [`.github/instructions/general-instructions.instructions.md`](../../.github/instructions/general-instructions.instructions.md) are the authorities on when and how to touch that tree; the [versioning policy](../../docs/specification/versioning.md) governs anything that moves `PROTOCOL_VERSION`. Follow them.

## The triage pass

Treat the following as the shape of the work, not a rigid script. Adapt the order and depth to what you find; the goal is a confident, well-understood backlog plus a clear report — **not** mechanical step-execution.

### Phase 1 — Audit recently closed PRs for un-tracked follow-ups

1. **Scope the window.** Gather the recently closed (merged) PRs. If the user gave a window, use it; otherwise default to a sensible recent range (e.g. since the last triage pass, or the last several weeks of merged PRs) and say what you chose. Dependabot / pure-dependency PRs rarely spawn follow-ups — skim them, don't dwell.
2. **Extract the promises.** For each PR, read the body, the review threads, and the code it landed, and list every piece of work it explicitly **deferred to the future** — "out of scope", "follow-up", "in a later PR", "known gap", a `TODO`/`FIXME` it introduced, a reviewer request the author postponed, a client mirror left un-regenerated, a conformance fixture marked skipped.
3. **Validate each candidate against current reality.** Before filing anything, confirm the work is *still* real and correctly described:
   - Did a **later PR** already do it? (Then there's nothing to file — note it in the report.)
   - Did a **subsequent spec change** make it moot or change its shape? Re-describe or drop accordingly.
   - Is the `types/`/client code or doc it pointed at still there and still the right place?
4. **Check for an existing issue.** Search open **and** closed issues for the same work. If a matching **open** issue exists, **link the PR(s) to it** (a comment cross-referencing the PR and the relevant thread/code) rather than opening a duplicate. If a matching issue was already **closed as done**, the follow-up is satisfied — don't refile.
5. **File the gaps.** For each still-relevant, un-tracked follow-up, open a new issue at the quality bar above: Context (links to the PR, the review thread, and the code/spec), Problem, Proposed fix, Affected artifacts, Tests/conformance, Out of scope. Label it with the area labels a maintainer would apply (e.g. `enhancement`, `documentation`, `bug`, `rust`). Cross-link the PR.

### Phase 2 — Triage every open issue

1. **Pull the full open list** and read each issue in depth — its body, its links, and the current state of the `types/`/client code, the schema, the docs, and any `docs/proposals/` discussion it refers to. **Validate before you classify.** Never close or annotate on a hunch.
2. **Classify each issue into exactly one bucket:**
   - **Implementable now** — still relevant, correctly described, and has **no** unresolved dependency or external blocker. Shortlist it for phase 3.
   - **No longer relevant / necessary** — already implemented, superseded, obsoleted by a later spec change, or speculative work that no longer makes sense. **Close it** with a comment that explains *precisely why* (link the PR/commit/change that resolved or invalidated it) and apply the fitting disposition label (`wontfix` / `duplicate` / `invalid`). Use the "not planned" close reason when it wasn't completed.
   - **Blocked on a dependency / external factor** — still relevant but can't proceed until something else lands (a versioning-policy decision, an unresolved design question or open `docs/proposals/` discussion, a prerequisite spec change). **Leave it open** and add a comment naming the *specific* blocker, why it must resolve first, and — where possible — a link to the issue / PR / proposal in this repo to watch.
3. **Be explicit and auditable.** Every close and every blocked annotation should stand on its own: a future reader should understand the call without re-deriving it. If a classification is genuinely ambiguous, surface it for the user rather than guessing.

### Phase 3 — Prioritize and implement the ready issues

1. **Prioritize** the "implementable now" shortlist by importance and urgency. Security and spec-correctness items lead; then conformance gaps and behaviour bugs affecting consumers (e.g. a client mirror or reducer that diverges from `types/`); then enhancements and docs. State the ordering and the reasoning.
2. **Cluster** closely-related issues that can be implemented and reviewed together into a single PR; keep unrelated work in separate, focused PRs (per `CONTRIBUTING.md`).
3. **Implement in priority order.** For each issue (or tight cluster): work on a focused branch, make the change, and keep the whole chain in lockstep when the wire contract moves — edit `types/`, run `npm run generate` so `schema/` and every client's `**/generated/**` mirror regenerate, update any hand-written client surface and the `types/test-cases/` conformance fixtures, refresh the docs, and add the `docs/.changes` fragment(s) the change requires (per `AGENTS.md`). **Validate** with the repo's own build / lint / test gates (see appendix). Don't consider a change done until it builds and passes. Open the PR with `Closes #N` (list each issue in a cluster).
   - If the user asked you to confirm before acting (e.g. "check with me first", "don't change anything yet"), present the audit results, the triage classification, and the proposed implementation order, and **wait for approval** before opening/closing issues or writing code.

### Report

Produce a clear, honest summary covering:

- **Follow-ups filed / linked** — new issues opened (with links), PRs linked to existing issues, and follow-ups you deliberately *didn't* file (already done / obsolete) with the reason.
- **Triage outcome** — the three buckets: what you closed and why, what you annotated as blocked and on what, and the ready shortlist.
- **Implementation** — what you implemented, the PR(s), and which issues each closes; plus what remains on the ready list for next time.
- **Belongs-elsewhere items** — anything whose real fix lives outside this repo (in an external client implementation or a consuming product). Describe each precisely and hand it back to the user — don't go read or act on another repository yourself.
- **Anything notable or uncertain** that warrants the user's attention or a decision (especially anything that would require a `PROTOCOL_VERSION` bump under the versioning policy).

If the user wants a durable artifact, the report can be written to the repo's gitignored `.local/` folder; otherwise present it in the conversation.

## Guardrails

- **Validate before you mutate the backlog.** Don't open, close, or re-label an issue until you've confirmed the call against the current `types/`, the generated mirrors, the schema, the docs, and the conformance fixtures. A wrong close is worse than a stale issue.
- **Never open a duplicate.** Always search open *and* closed issues first; prefer linking a PR to an existing issue over filing a new one.
- **Match the house style.** New issues meet the quality bar above and carry the labels a maintainer would apply; don't invent labels (there is no `follow-up` label) — suggest one if it's warranted. Closed issues get an explanatory comment and a disposition label.
- **Stay inside this repository.** This is a public repo; keep the entire pass within `microsoft/agent-host-protocol` and don't reference, read, or act on any other (non-public) repository. If an issue's resolution belongs elsewhere, describe it for the user instead of acting on it.
- **Pause before high-consequence batches.** When a pass would bulk-close many issues or kick off a multi-PR implementation push, and the user hasn't clearly said "just do it," present the plan and get a go-ahead first.
- **The wire contract moves as one unit.** When a change touches `types/`, the regenerated `schema/` + client mirrors, the conformance fixtures, the docs, and the scoped `docs/.changes` fragment move together — never hand-edit a `**/generated/**` file. A breaking protocol change is gated by the [versioning policy](../../docs/specification/versioning.md); don't ship one without honoring it.
- **Correctness wins, within the versioning policy.** Don't shrink a correct implementation to keep the diff small, and don't add migrations/deprecations/phased rollouts unless the versioning policy or the user calls for them.
- **Validate before declaring done.** Run the repo's build/lint/test and resolve any fallout from every change you implement.

## Appendix — grounding facts and commands

These are starting points, not the whole method — verify them against the repo's current state (`AGENTS.md`, `CONTRIBUTING.md`, `RELEASING.md`, `gh label list`), which is authoritative if it disagrees with anything here. For each `gh issue`/`gh pr` command below, if the GraphQL-backed form returns a credentials error in this `microsoft`-org repo, use the REST `gh api repos/microsoft/agent-host-protocol/...` form instead.

**Survey recently closed PRs and read what they promised:**

```sh
# Recently merged PRs (adjust --limit / filter the window you chose):
gh pr list -R microsoft/agent-host-protocol --state merged --limit 50 \
  --json number,title,mergedAt,url --jq '.[] | "\(.number)\t\(.mergedAt)\t\(.title)"'
# REST fallback if the above errors:
gh api "repos/microsoft/agent-host-protocol/pulls?state=closed&per_page=50" \
  --jq '.[] | select(.merged_at) | "\(.number)\t\(.merged_at)\t\(.title)"'

# A PR's body, the issues it already closes, and its review threads:
gh pr view <n> -R microsoft/agent-host-protocol --json title,body,url,closingIssuesReferences
gh pr view <n> -R microsoft/agent-host-protocol --comments
gh api repos/microsoft/agent-host-protocol/pulls/<n>/comments --jq '.[] | {path, line, body}'

# Deferred markers left in the code (run in the working tree):
grep -rniE 'TODO|FIXME|follow-up|known .* gap|deferred from' types/ clients/ docs/
```

**Search existing issues before filing (open *and* closed), then file or link:**

```sh
gh issue list -R microsoft/agent-host-protocol --state all --search "<keywords>" \
  --json number,title,state --jq '.[] | "\(.number)\t\(.state)\t\(.title)"'
# REST fallback:
gh api "repos/microsoft/agent-host-protocol/issues?state=all&per_page=100" \
  --jq '.[] | "\(.number)\t\(.state)\t\(.title)"'

# File a new follow-up issue (match the quality bar in the body; pick real labels):
gh issue create -R microsoft/agent-host-protocol \
  --title "<area>: <concise follow-up>" --body-file <path> --label enhancement

# Or link a PR to an existing open issue instead of duplicating:
gh issue comment <n> -R microsoft/agent-host-protocol \
  --body "Follow-up tracked here was deferred from #<pr> (<thread/code link>)."
```

**Triage the open issues:**

```sh
# Full open list with labels and recency:
gh issue list -R microsoft/agent-host-protocol --state open --limit 100 \
  --json number,title,labels,updatedAt \
  --jq '.[] | "\(.number)\t\(.updatedAt)\t[\(.labels|map(.name)|join(","))]\t\(.title)"'

gh issue view <n> -R microsoft/agent-host-protocol    # read one in full

# No longer relevant — close with an explanation + disposition label:
gh issue close <n> -R microsoft/agent-host-protocol --reason "not planned" \
  --comment "Closing: <why it's obsolete, with link to the PR/change that resolved or invalidated it>."
gh issue edit <n> -R microsoft/agent-host-protocol --add-label wontfix   # or duplicate / invalid

# Blocked — leave open, annotate the specific blocker:
gh issue comment <n> -R microsoft/agent-host-protocol \
  --body "Blocked on <dependency> (<blocking issue / PR / proposal link>); needs to land first because <reason>."
```

**Judge relevance against this repo's own history and surface:**

```sh
# Did a later merged PR already do it, or change its shape?
gh pr list -R microsoft/agent-host-protocol --state merged --limit 100 \
  --search "<keywords>" --json number,title,mergedAt \
  --jq '.[] | "\(.number)\t\(.mergedAt)\t\(.title)"'

# Is the spec surface it pointed at still there and still the right place?
grep -rniE '<symbol or keyword>' types/ docs/

# The protocol/version surface a follow-up was written against:
cat types/version/registry.ts
```

**Validate every implementation before declaring it done** (see `CONTRIBUTING.md` / `AGENTS.md` for the authoritative list):

```sh
npm install                 # root tooling
npm run generate            # regenerate every client mirror + schemas from types/
npm test                    # typecheck + lint + release/changelog verification + reducer tests

# Per-client (run only what your change touches):
cd clients/typescript && npm ci && npm test && npm run build
cd clients/rust && cargo test --workspace
cd clients/kotlin && ./gradlew build
swift build && swift test   # Swift uses the root Package.swift
cd clients/go && go test ./...
```
