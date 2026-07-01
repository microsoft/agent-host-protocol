# AHP Session-Metadata Migration Plugin

An [open plugin](https://github.com/nicobailon/open-plugin/blob/main/spec/specification.md) that provides a skill for migrating an AHP consumer — client, server, or library binding — to the **flattened `SessionState`** model and the **message-level model/agent selection** introduced alongside the `chat/draftChanged` action.

## What's included

| Component | Path | Purpose |
|-----------|------|---------|
| Manifest  | `.plugin/plugin.json` | Plugin metadata (open plugin spec) |
| Skill     | `skills/session-metadata-migration/SKILL.md` | Step-by-step migration guidance for an agent driving the refactor |

## When to use

Invoke this skill when you have a codebase written against the older AHP shape where:

- `SessionState` embedded a `summary: SessionSummary` sub-object;
- `SessionState` / `SessionSummary` / `ChatState` / `ChatSummary` carried `model` and `agent`;
- the session was reconfigured with `session/modelChanged` / `session/agentChanged`;
- `SessionSummary.createdAt` / `modifiedAt` were numbers (epoch millis).

The skill walks through every breaking shape change, the field relocations (model/agent now live on `Message`, plus a per-chat `draft`), the timestamp format change, the removed actions and command params, and the reducer changes — with a grep cheat sheet and a verification checklist.
