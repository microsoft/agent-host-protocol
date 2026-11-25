---
name: changelog
description: Write, update, or review AHP changelog fragments under docs/.changes/ using plain consumer-friendly language, brief code snippets for complex features, public documentation links, target scoping, and unreleased-feature consolidation. Use whenever a PR makes a user-visible change to types/, schema/, clients/, or generators, or when editing changelog entries.
---

# Writing AHP Changelog Fragments

This repo ships seven independently-versioned artifacts (the spec plus the Rust,
Kotlin, Swift, TypeScript, Go, and .NET clients), each with its own
`CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. The publish workflows refuse to release a tag whose matching
`## [X.Y.Z]` heading is missing.

To avoid merge conflicts in shared `CHANGELOG.md` files, normal PRs add or
update JSON changelog fragments under `docs/.changes/` instead of editing
changelogs directly. Release PRs collapse those fragments into the seven
changelogs with `npm run changelog:release` (see
[`release-ahp`](../release-ahp/SKILL.md)).

## When to add an entry

Add a fragment whenever your change is **user-visible**:

- A new, removed, renamed, or behaviourally-changed action, command, state
  field, error, notification, or version constant in `types/`.
- A new, removed, or behaviourally-changed public API in one of the
  `clients/<lang>/` source trees (constructor signatures, exported
  functions/types, transport options, reducer outputs, etc.).
- A bug fix that changes observable behaviour for a consumer of the spec or
  any client.
- A security-relevant change (use `"type": "security"`).

**Skip the fragment** when the change is purely:

- Edits under `**/generated/**` (those mirror a `types/` change that should
  have its own entry).
- Docs in `docs/`, `README.md`, comments, `AGENTS.md`, `CONTRIBUTING.md`, or
  `skills/`.
- Tests, CI, lint config, formatting, or internal refactors with no observable
  effect.

## One fragment per feature (update unreleased entries)

- **One fragment per feature in a PR.** Do not split one feature across
  multiple fragments for its sub-types, helper constants, or companion tweaks.
  Use multiple fragments only when changes genuinely belong to different
  Keep-a-Changelog types (for example, a breaking rename in `changed` alongside
  a separate `deprecated` notice) or distinct artifact `targets`.
- **Update unreleased fragments instead of adding new ones.** Before creating
  a new fragment, inspect existing files in `docs/.changes/`. If you are
  iterating on, refining, or fixing a feature that was introduced since the
  last release and has not shipped yet, **edit its existing fragment** (and
  append any new issue numbers to `issues`) instead of creating another entry.
  Consumers should see the final shape of an unreleased feature once, not a
  play-by-play of pre-release iterations.

## Writing style

Write changelogs for **consumers adopting the release**, not as a mechanical
inventory of internal type names:

- **Use plain, direct language.** Start `message` with a clear verb ("Add …",
  "Rename …", "Fix …", "Deprecate …") and explain *why* the change exists or
  *how* it helps a client or host author, not just which fields were added.
- **Give a brief example for complex changes.** When a change introduces a new
  channel, command/action flow, capability negotiation, or non-trivial API
  change, add a short `details` block with a concise TypeScript or pseudo-code
  snippet (~5–15 lines) showing the feature in action. Keep simple single-field
  additions and small fixes to a crisp single line (plus a doc link if useful).
- **Link relevant documentation and issue/PR numbers.** When a guide or
  specification page covers the feature, link to it using the public
  documentation URL (`https://microsoft.github.io/agent-host-protocol/...`,
  without `/draft/`, since released pages are published at the site root).
  Avoid relative repo links, which break in `clients/<lang>/CHANGELOG.md` and
  GitHub Releases. Always put issue/PR numbers in the fragment's `issues`
  array so they render as Markdown links
  (`([#123](https://github.com/microsoft/agent-host-protocol/issues/123))`);
  if a `#123` reference appears in prose inside `message`, `details`, or a
  `CHANGELOG.md`, always link it explicitly.

## Which artifact(s) to target

Each fragment may specify a `targets` array. Omit `targets` when the same
entry applies to the spec and all clients (the common case for protocol
surface changes). Set `targets` to a subset when the change is only visible
to specific artifacts.

| Source path touched | Fragment target(s) |
| --- | --- |
| `types/**` (protocol surface) | Omit `targets` (spec + all clients) unless the visibility is intentionally narrower. |
| `clients/rust/**` (non-generated) | `"targets": ["rust"]` |
| `clients/kotlin/**` (non-generated) | `"targets": ["kotlin"]` |
| `clients/swift/**` (non-generated) | `"targets": ["swift"]` |
| `clients/typescript/**` (non-generated) | `"targets": ["typescript"]` |
| `clients/go/**` (non-generated) | `"targets": ["go"]` |
| `clients/dotnet/**` (non-generated) | `"targets": ["dotnet"]` |
| `schema/**` | `"targets": ["spec"]` |
| `scripts/generate*.ts` that changes any client's generated output | Omit `targets` or list every affected target. |

## Format

Create a uniquely named JSON file under `docs/.changes/`, usually
`docs/.changes/YYYYMMDD-short-slug.json`. Use lowercase Keep-a-Changelog
types: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`.
`message` is a single-line headline without a leading Markdown bullet (`issues`
are appended to it automatically as linked
` ([#123](https://github.com/microsoft/agent-host-protocol/issues/123))`). For
complex changes, add an optional `details` array of Markdown lines (or a
string); each line is rendered indented under the bullet.

Simple one-line example:

```json
{
  "type": "added",
  "message": "Add optional `InitializeResult.environment.pathStyle` metadata describing how to represent agent host file paths."
}
```

Complex feature with a brief code snippet and docs link:

```json
{
  "type": "added",
  "message": "Add experimental flow-control with byte accounting, framed delivery, and consumption credit notifications so fast producers do not overwhelm slow clients.",
  "details": [
    "```ts",
    "const sub = await client.subscribe({",
    "  resource,",
    "  flowControl: { windowBytes: 65536, maxFrameBytes: 16384 },",
    "});",
    "// Return credit after processing incoming notifications",
    "client.notify('channel/windowUpdate', { resource, consumedBytes });",
    "```",
    "Read more in [Windowed Delivery](https://microsoft.github.io/agent-host-protocol/specification/windowed-delivery)."
  ],
  "issues": [492]
}
```

Scoped client-only example:

```json
{
  "type": "fixed",
  "message": "Fix `AhpClient.connect` to reject with `AhpProtocolError` when protocol negotiation fails.",
  "targets": ["typescript"]
}
```

## Validation

Do **not** edit `CHANGELOG.md` files for normal feature/fix PRs and do not
invent a `## [X.Y.Z]` heading — changelogs are updated at release time per
[`RELEASING.md`](../../RELEASING.md) and [`release-ahp`](../release-ahp/SKILL.md).

Validate fragment JSON before finishing:

```bash
npm run verify:change-fragments
```
