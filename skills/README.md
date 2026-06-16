## Skills layout

- Source of truth for repo-scoped skills: `skills/`.
- Adapter paths: `.claude/skills`, `.codex/skills`, `.github/skills`.
- Adapter paths must stay symlinks to `../skills`.
- Do not add real files under adapter paths — add skills under `skills/` only.

Each skill is a directory under `skills/` containing a `SKILL.md` (plus any supporting files the skill references). The adapter symlinks let the Claude, Codex, and Copilot/GitHub agents all discover the same skills without duplicating them.

## SKILL.md format

Every skill must be authored as a `SKILL.md` file with YAML frontmatter at the top.
Do not create skills without frontmatter.

Use this Copilot-compatible template:

```md
---
name: your-skill-name
description: Short description of when to use the skill.
---
```

Notes:

- `name` and `description` are required for discovery.
- Both must be single-line scalar values. YAML block scalars and multiline values are not supported by skill discovery and will not be parsed correctly, which may produce incorrect `name` or `description` values.
- Do not add extra frontmatter keys such as `metadata:`; they are ignored by discovery.
- Keep the frontmatter at the very top of the file.

Smoke check:

```bash
ls -ld .claude/skills .codex/skills .github/skills
```

If any agent fails to resolve symlinks, switch that client to generated mirror files as fallback.
