# Agent Guide — Agent Host Protocol Repo

This repository uses repo-scoped skills under [`skills/`](skills/) (symlinked
into `.claude/skills`, `.codex/skills`, and `.github/skills`) as the single
source of truth for task workflows and conventions.

## Global invariants

- **`types/` is canonical; never hand-edit `**/generated/**`.** After protocol
  changes, run `npm run generate` and commit all regenerated schemas and client
  mirrors.
- **Never bump `PROTOCOL_VERSION`** unless explicitly instructed to do so.
- **Validate before finishing:** run `npm test` at the repo root plus the build
  and test suites for any affected clients (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
- **User-visible changes need a changelog fragment** under `docs/.changes/`
  (never edit `CHANGELOG.md` directly on feature/fix PRs). Keep one fragment
  per feature and update existing unreleased fragments instead of adding new
  ones for follow-up iterations.

## Skills

Load the relevant skill before starting work in that area:

| Task | Skill |
| --- | --- |
| Editing `types/`, reducers, or protocol docs (includes naming dictionary) | [`protocol-authoring`](skills/protocol-authoring/SKILL.md) ([naming dictionary](skills/protocol-authoring/naming.md)) |
| Adding, updating, or reviewing `docs/.changes/` changelog fragments | [`changelog`](skills/changelog/SKILL.md) |
| Cutting a coordinated AHP release or recovering publish triggers | [`release-ahp`](skills/release-ahp/SKILL.md) |
| Auditing closed PRs and triaging/implementing open issues | [`groom-backlog`](skills/groom-backlog/SKILL.md) |

## Additional guides

- Per-client codegen & runtime conventions: [`clients/dotnet/AGENTS.md`](clients/dotnet/AGENTS.md),
  [`clients/go/AGENTS.md`](clients/go/AGENTS.md),
  [`clients/kotlin/AGENTS.md`](clients/kotlin/AGENTS.md),
  [`clients/swift/AGENTS.md`](clients/swift/AGENTS.md).
- Repo layout & local dev commands: [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Release tags, CI guards & publishing infrastructure: [`RELEASING.md`](RELEASING.md).
