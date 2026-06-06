# Changelog — `AgentHostProtocol` Swift Package

All notable changes to the Swift package (`AgentHostProtocol` +
`AgentHostProtocolClient` products) are documented here. See
[`../../CHANGELOG.md`](../../CHANGELOG.md) for the protocol spec changelog
and [`release-metadata.json`](release-metadata.json) for the machine-readable
mapping between the current source tree and protocol versions.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the package follows [SemVer](https://semver.org).

SwiftPM resolves packages by matching plain `vX.Y.Z` git tags at the repo
root, so Swift releases use the bare semver tag namespace (no `swift/`
prefix). The `publish-swift.yml` workflow refuses to publish a `vX.Y.Z` tag
whose matching `## [X.Y.Z]` heading is missing from this file, and verifies
the tag matches the version pinned in [`VERSION`](VERSION).

## [Unreleased]

### Added

- `RootState` now exposes an optional `_meta` property bag (`meta: [String:
  AnyCodable]?`) for implementation-defined agent-host metadata, such as a
  well-known `hostBuild` key carrying the host's build version/commit/date.

## [0.3.0] — 2026-06-05

Implements AHP 0.3.0.

### Added

- `McpServerCustomization` now exposes the full MCP lifecycle: `enabled`,
  the discriminated `McpServerState` enum
  (`.starting`/`.ready`/`.authRequired`/`.error`/`.stopped`), optional
  `channel` URI for the `mcp://` side-channel, and optional `mcpApp`
  block carrying `AhpMcpUiHostCapabilities` for MCP Apps.
- `McpServerAuthRequiredState` carries `ProtectedResourceMetadata`
  plus `reason` / `requiredScopes` / `description` so the existing
  `authenticate` command can drive per-server auth.
- `Customization.mcpServer` top-level case — hosts MAY surface bare
  MCP servers directly rather than only inside a plugin or directory.
- `SessionMcpServerStateChangedAction` and matching reducer arm —
  narrow upsert of `state` + `channel` on an existing MCP
  server customization by id. Wired through both `Reducers.swift` and
  the protocol-based `NativeReducer.swift`.
- `ClientCapabilities` struct on `InitializeParams.capabilities` with
  first entry `mcpApps`.
- `changeKind` field on `Changeset` (well-known values: `'session'`,
  `'branch'`, `'uncommitted'`, `'turn'`, `'compare-turns'`).
- `status` and `error` fields on `ChangesetOperation` and the
  `changeset/operationStatusChanged` action, tracking the
  `idle → running → error` lifecycle of a changeset operation.
- `AgentCustomization._meta` provider metadata field.
- Optional `changes` field on `SessionSummary` (`ChangesSummary` with optional `additions`, `deletions`, and `files` counts) summarising a session's file-change footprint.


### Changed

- Renamed the `ChangesetSummary` type to `Changeset`. The on-the-wire shape is unchanged.
- Moved the `changesets` catalogue from `SessionSummary` to `SessionState`. The `session/changesetsChanged` action now updates `state.changesets` directly instead of `state.summary.changesets`.

### Removed

- Removed the `additions`, `deletions`, and `files` fields from `ChangesetSummary`. Aggregate counts now live on `SessionSummary.changes`; per-changeset views derive their own totals from `ChangesetState.files`.

### Changed

- `ToolCallBase.toolClientId: String?` replaced by
  `ToolCallBase.contributor: ToolCallContributor?` (enum with
  `.client(ToolCallClientContributor)` and `.mcp(ToolCallMcpContributor)`
  cases). `SessionToolCallStartAction` carries the new `contributor`
  field as well. `Reducers.swift`, `NativeReducer.swift`, and
  `ToolCallStateExtensions.swift` follow the rename.
## [0.2.0] — 2026-05-28

Implements AHP `0.2.0`.

First versioned Swift Package Manager release. Includes:

- `AgentHostProtocol` product — generated wire types, actions, commands,
  notifications, errors, reducers (`AHPRootReducer`, `AHPSessionReducer`,
  `AHPTerminalReducer`, `AHPChangesetReducer`, `NativeReducer`). Includes
  the extended `resource*` family (`resourceResolve`, `resourceMkdir`,
  `createResourceWatch`, the new `ahp-resource-watch:/` channel with the
  `resourceWatch/changed` action), `ResourceWriteParams`'s `mode` /
  `position` / `ifMatch` fields, the new `Conflict` (`-32011`) error code,
  and the bidirectional content-bearing `resource*` surface exposed on
  both `CommandMap` and `ServerCommandMap`.
- `UserMessage.meta` optional `[String: AnyCodable]?` field (serialized as
  `_meta`), exposing the new spec-level provider metadata channel on user
  messages. The generated `init` gains a trailing `meta:` parameter that
  defaults to `nil`.
- `AgentHostProtocolClient` product — single-host `AHPClient`, multi-host
  `MultiHostClient`, `AHPStateMirror` / `MultiHostStateMirror`, transports
  (`URLSessionWebSocketTransport`, `NWConnectionWebSocketTransport`,
  `InMemoryTransport`), and persistent client-ID stores.
- Generated `PROTOCOL_VERSION` and `SUPPORTED_PROTOCOL_VERSIONS` constants
  on the `AgentHostProtocol` module.
