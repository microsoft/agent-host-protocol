# AHP Client Plugin

An [open plugin](https://github.com/nicobailon/open-plugin/blob/main/spec/specification.md) that provides an MCP server for connecting to an Agent Host Protocol server over WebSocket, plus a skill that teaches the agent how to use the protocol.

## What's included

| Component | Path | Purpose |
|-----------|------|---------|
| Manifest | `.plugin/plugin.json` | Plugin metadata (open plugin spec) |
| MCP server config | `.mcp.json` | MCP server declaration with `${PLUGIN_ROOT}` paths |
| MCP server | `mcp-server/` | WebSocket client with `connect`, `send`, `get_notifications`, `status`, and `next_id` tools |
| Skill | `skills/ahp-client/SKILL.md` | Protocol guidance, message templates, and doc references |

## Setup

```bash
cd plugins/copilot-plugin/mcp-server
npm install
```

## MCP tools

| Tool | Description |
|------|-------------|
| `connect` | Connect (or reconnect) to an AHP server at a given WebSocket URL |
| `send` | Send a JSON-RPC 2.0 message string; returns the response and any pending notifications |
| `get_notifications` | Drain the notification inbox, with an optional `wait` (seconds) to let notifications accumulate |
| `status` | Check connection state, pending requests, and inbox depth |
| `next_id` | Get a monotonically-increasing integer for use as a JSON-RPC `id` |

## How it works

The MCP server maintains a **single persistent WebSocket** connection. Messages from the AHP server are routed into one of two places:

- **JSON-RPC responses** (messages with an `id` matching a pending request) are delivered to the waiting `send` call.
- **Everything else** (action notifications, server pushes) goes into a **notification inbox** that is drained by `send` (alongside the response) or explicitly via `get_notifications`.

This design lets the agent drive a full AHP session: initialize, subscribe, create sessions, dispatch actions, and stream responses — all via structured MCP tool calls.
