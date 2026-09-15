# Agent Guide — Agent Host Protocol Repo

Cross-cutting rules for AI coding agents working in this repository. Per-client
codegen conventions are in `clients/kotlin/AGENTS.md`,
`clients/swift/AGENTS.md`, `clients/go/AGENTS.md`, and
`clients/dotnet/AGENTS.md`. Editorial rules
for protocol types are in
`.github/instructions/general-instructions.instructions.md`. Release mechanics
are in [`RELEASING.md`](RELEASING.md).

## Adding changelog fragments

This repo ships seven independently-versioned artifacts (the spec plus
the Rust / Kotlin / Swift / TypeScript / Go / .NET clients), each with its
own `CHANGELOG.md` in Keep-a-Changelog format. The publish workflows
refuse to release a tag whose matching `## [X.Y.Z]` heading is
missing. To avoid merge conflicts in shared `CHANGELOG.md` files,
normal PRs add JSON changelog fragments under `docs/.changes/` instead
of editing the changelogs directly. Release PRs collapse those fragments
into the seven changelogs with `npm run changelog:release`.

### When to add an entry

Add a one-line fragment whenever your change is
**user-visible**:

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
- Docs in `docs/`, `README.md`, comments, AGENTS.md, CONTRIBUTING.md.
- Tests, CI, lint config, formatting, internal refactors with no observable
  effect.

### Which artifact(s) to target

Each fragment may specify a `targets` array. Omit `targets` when the same
entry applies to the spec and all clients (the common case for protocol
surface changes). Set `targets` to a subset when the change is only visible
to specific artifacts.

Map source paths to fragment targets:

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

### Format

Create a uniquely named JSON file under `docs/.changes/`, usually
`docs/.changes/YYYYMMDD-short-slug.json`. Use lowercase Keep-a-Changelog
types: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`.
Do not include the leading Markdown bullet in `message`.

```json
{
  "type": "added",
  "message": "`session/cancelTurn` action for client-initiated turn cancellation.",
  "issues": [123]
}
```

Scoped client-only example:

```json
{
  "type": "fixed",
  "message": "`AhpClient.connect` now rejects with `AhpProtocolError` on negotiation failure.",
  "targets": ["typescript"]
}
```

Do **not** edit `CHANGELOG.md` files for normal feature/fix PRs and do
not invent a `## [X.Y.Z]` heading. Changelogs are updated by the release
maintainer per [`RELEASING.md`](RELEASING.md). Run
`npm run verify:change-fragments` to validate fragment JSON.

## Preserve protocol object types

For new or changed protocol objects with a fixed schema, prefer named, reusable
types in `types/` and generated native models. Do not replace a known shape with
raw JSON to work around a generator gap.

Reserve raw JSON for intentionally open data, such as `_meta`, JSON Schema and
tool payloads, provider extensions, and unknown variants.

Update the canonical definitions and each affected generator. Do not hand-edit
generated files. Preserve wire names, nesting, optionality, numeric mappings,
and collection wrappers such as `{ items: ... }`.

Check source and binary compatibility separately from JSON compatibility.
Define an explicit migration for public API changes. Keep native decoding
errors visible. Add type-level and wire checks so a known shape cannot become
raw JSON without detection.
