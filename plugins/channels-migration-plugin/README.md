# AHP Channels Migration Plugin

An [open plugin](https://github.com/nicobailon/open-plugin/blob/main/spec/specification.md) that provides a skill for migrating an AHP consumer — client, server, or library binding — from the pre-channels protocol model to the current channel-based model.

## What's included

| Component | Path | Purpose |
|-----------|------|---------|
| Manifest  | `.plugin/plugin.json` | Plugin metadata (open plugin spec) |
| Skill     | `skills/channels-migration/SKILL.md` | Step-by-step migration guidance for an agent driving a refactor |

## When to use

Invoke this skill when you have a codebase (TypeScript, Rust, Swift, or any AHP consumer) written against the pre-channels protocol and want to update it to the channel-based protocol. The skill walks through every breaking shape change, the renames, the new fields, and the patterns to grep for at each step.
