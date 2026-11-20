---
description: Dictionary of protocol terms and naming conventions for AHP types
applyTo: 'types/**/*.ts,docs/specification/**/*.md,docs/guide/**/*.md'
---

# Protocol naming dictionary

Use this dictionary when you name or describe anything in `types/` or the
protocol docs. Prefer the established name over a near-synonym, even when the
synonym reads better locally. Structural rules (enum compatibility tags,
bitsets, keyed-collection actions, `{ items }` wrappers,
`@preserveUnknownMembers`) are in
[general-instructions](./general-instructions.instructions.md); this file
covers vocabulary and naming.

Some existing names predate these rules. They are listed under
[Legacy names](#legacy-names-do-not-copy). Keep them for wire compatibility,
but don't use them as precedent.

## Glossary

| Term | Meaning | Don't confuse with |
| --- | --- | --- |
| **host** | The authoritative side that runs agents and owns channel state. Use it in prose. | **server** is the JSON-RPC role: use it in `@direction` tags (`Client → Server`) and established names such as `serverSeq`. |
| **client** | A UI or application that connects to a host, renders state, and dispatches actions. | |
| **peer** | Either side, for symmetric messages such as `resource*` commands and `tcp/*`. | |
| **channel** | A URI-addressed stream of state or signals, such as `ahp-session:/<id>`. Every command and notification carries a `channel`. | A channel is not a session or chat; it is how one is addressed. |
| **subscription** | A client following a channel. It starts with a snapshot and continues with actions or notifications. | |
| **snapshot** | `{ resource, state, fromSeq }`: a channel's state at a sequence position. | |
| **action** | A typed state mutation applied by a pure **reducer**, delivered in an `ActionEnvelope`. | A **notification**: a JSON-RPC message with no response that is not a state mutation. |
| **command** | A JSON-RPC request with a response. | |
| **`serverSeq`** | The host's ordering and replay position for a channel. | |
| **action origin** | `{ clientId, clientSeq }` of the client that dispatched an action; absent for host-originated actions. | `ChatOrigin` (how a chat was created) and `MessageOrigin` (who produced a message). |
| **root / session / chat** | Root is host-wide state. A session owns working directories, customizations, config, and a catalog of chats. A chat is one conversation. | Don't say "session" when you mean a single conversation; that is a chat. |
| **turn / active turn** | A turn is one request and response cycle in a chat. `activeTurn` is the turn in progress; `turns` are completed. | |
| **response part** | One typed piece of a turn's response: markdown, reasoning, tool call, content reference, and so on. | |
| **tool call** | A response part with its own lifecycle (`ToolCallStatus`) and confirmation flow. | |
| **agent** | An agent implementation that the host exposes, described by `AgentInfo`. | |
| **agent provider** (`provider`) | The ID of the agent backing a session or chat (`AgentInfo.provider`, `SessionState.provider`, `ChatState.provider`). Always write "agent provider" in prose. | The **custom agent** (`Message.agent`, `AgentSelection`): a configured persona within an agent provider. The **model vendor** (`SessionModelInfo.vendor`): the company that serves a model. |
| **model** | A model offered by an agent provider (`SessionModelInfo`). It is selected per message (`Message.model`). | |
| **customization** | The umbrella term for session extensions. **Containers** are plugins and directories. **Children** are agents, skills, prompts, rules, hooks, and MCP servers. An MCP server can also be top-level. | Don't use "plugin" for every customization. |
| **pending message** | Input waiting to be consumed. Its `kind` is **steering** (injected into the active turn) or **queued** (starts a later turn). Both kinds live in `ChatState.queuedMessages`. | |
| **working directories** | The session's set of directories. A chat may use a subset. | Don't use "workspace" for a protocol field. |
| **capability** | Optional support that a peer advertises, checked before use. | **stability**: how much a surface may still change (see `@stability` and `docs/specification/versioning.md`). |
| **`x-` prefix** | Reserved for implementation-defined methods, action types, and URI schemes. First-party names never start with `x-`. | |

Channel families follow `types/channels-<domain>/` and use the scheme
`ahp-<domain>:`. Some names differ: `channels-otlp` is the **Telemetry**
channel, `channels-automation` is the **Automation catalogue**, and
`channels-automation-run` is an **Automation run**.

## Identifiers and references

- **An object's own key is `id`.** Don't repeat the type name: write
  `Annotation.id`, not `Annotation.annotationId`.
- **A reference to another object by local ID is `<entity>Id`**, for example
  `turnId`, `partId`, `toolCallId`, `fileId`, `operationId`, `customizationId`,
  and `queuedMessageId`. The same entity uses the same reference name
  everywhere.
- **A reference to something addressable by URI is named for the entity**,
  for example `session: URI` and `chat: URI`. Never write `sessionId` or
  `chatUri`.
- **Routing parameters are `channel`.** Every command and notification takes
  `channel: URI`; root methods narrow it to `'ahp-root://'`.
- **`resource` is a subscribable URI that a state or summary belongs to**, for
  example `Snapshot.resource` and `ChatSummary.resource`. **`uri` is the
  location of content or a file**, for example `ContentRef.uri` and
  `ResourceChange.uri`. Use `url` only for a web page that a user opens, such
  as a URL-style elicitation.
- **URI-valued fields use the `URI` type alias, never a bare `string`.**
  `uriTemplate` is the exception, because a template is not a URI.
- **Pagination uses `cursor`** in params and **`nextCursor`** in results.
  Absent means there are no more pages. A state field with its own cursor
  names it after its collection, as in `turnsNextCursor`.
- An explicit ordering is `order: string[]` of IDs.

## Times, durations, and numbers

- **Timestamps** are ISO 8601 strings named `<event>At`: `createdAt`,
  `modifiedAt`, `startedAt`, `completedAt`, `nextRunAt`.
- **Durations and other time spans** are integer milliseconds with no unit
  suffix: write `duration`, never `durationMs`. Milliseconds is the
  protocol's default time unit; say so in the field's JSDoc. A field in any
  other unit must say so, and a field that mirrors an external standard
  keeps that standard's name and unit (`expiresIn` is OAuth seconds).
- **Every integer field carries `@integer`**; without it the JSON Schema
  emits `number`. Add `@minimum` and `@maximum` when bounds are meaningful.
  Use `@format float` for fractional values.
- Limits are **`max*`**, never `maximum*` (`maxItems`, `maxContextWindow`).
- Counts are **`*Count`** (`entryCount`, `runCount`).
- Byte ranges and sizes use **`position`, `length`, and `size`**, in bytes.
  Add a `*Bytes` suffix when the unit is not obvious from context.
  Windowed-delivery `*Bytes` fields count **UTF-16 bytes** (two per UTF-16
  code unit); keep that unit and wording there.

## Booleans

- Use **`is<State>`** for a state flag on an entity: `isRead`, `isArchived`,
  `isComplete`, `isPty`. `enabled` and `reviewed` are established bare forms.
  Keep them where they already appear.
- Use **bare adjectives or verbs for request and action modifiers**:
  `replace`, `final`.
- Use **`supports<Feature>`** for a feature flag inside descriptive info, such
  as `supportsVision`.
- **Don't use a boolean for something that may grow.** Use an enum, or a
  `@bitset` enum for independent flags. A capability is an optional presence
  object, never a boolean (see [Capabilities](#capabilities)).

## Enums and discriminants

- `*Kind` is a typological discriminant and `*Status` is a lifecycle (see the
  general instructions). `*Reason` explains an outcome, `*Mode` selects a
  behaviour, and `*Policy` selects a rule.
- **Don't name new discriminants `*Type`** (except `ActionType`), and don't
  name an enum `*State`: `*State` is reserved for state objects and union
  variants.
- String values are **camelCase**, except values that spell an external
  standard (`'utf-8'`). Use `export const enum`.

## Display and text fields

| Field | Use for |
| --- | --- |
| `title` | The display title of a chat, session, terminal, automation, or canvas. |
| `label` | A short label for an option, operation, or button. |
| `name` | A stable or machine-oriented name (tool name, server name). Pair it with `displayName` when a human-facing form differs. |
| `description` | Explanatory or help text. |
| `detail` | Secondary text in a completion or list row. |
| `activity` | A short human-readable description of what is happening now. |
| `message` | A user-facing message, or a structured `Message` in chat. |
| `text` | Plain text. |
| `content` | A body or payload, such as a response part's content or tool result content. |

Use `StringOrMarkdown` for display text that may contain markdown. Don't add
free-text fields named `status`: `status` is a typed lifecycle or bitset.

## Type names

| Suffix | Meaning |
| --- | --- |
| `<Method>Params` / `<Method>Result` | A command's request and response, named from the method (`createChat` → `CreateChatParams`). Notifications use `<Method>Params`. |
| `*State` | A channel's snapshot state (`ChatState`), or a variant of a lifecycle union (`McpServerStartingState`). |
| `*Summary` | A lightweight catalog view of a state (`ChatSummary`, `SessionSummary`). |
| `*Info` | Descriptive information about an entity (`AgentInfo`, `TerminalInfo`). |
| `*Metadata` | Identity or protocol metadata (`SessionMetadata`). |
| `*Capability` / `*Capabilities` | One capability's presence object or options / a group of capabilities. |
| `*Options` | Tunable parameters for an operation (`SubscriptionFlowControlOptions`). |
| `*Reference` / `*Ref` | A pointer to something stored elsewhere (`CanvasReference`, `ContentRef`). |
| `*Selection` | A user choice (`AgentSelection`) or a selected text span (`TextSelection`). |
| `*Schema` | A JSON Schema–shaped description (`SessionConfigSchema`). |
| `*Entry` | One member of a catalog (`AutomationEntry`, `DirectoryEntry`). |
| `*Source` / `*Origin` | What something is created from (`ChatSource`) / the durable provenance recorded on it (`ChatOrigin`). |
| `*Base` | Shared fields for union variants. Never on the wire by itself. |
| `*Action` | An action payload, named from its action type (see below). |

## Messages

### Action types

- The wire form is **`<channel>/<event>`** in lowerCamel, describing what
  happened in the past tense: `chat/turnStarted`, `session/chatAdded`,
  `terminal/resized`. The `ActionType` member is the PascalCase
  concatenation (`ChatTurnStarted`) and the interface adds `Action`
  (`ChatTurnStartedAction`).
- Streaming appends may use a noun for the appended content: `chat/delta`,
  `chat/reasoning`, `chat/usage`, `terminal/data`.
- Suffix vocabulary:

| Suffix | Use for |
| --- | --- |
| `Set` / `Removed` / `Updated` | Upsert, remove, or partially update a keyed collection entry (see the general instructions). |
| `Changed` | Replace one field or one whole value, such as `session/titleChanged` or `chat/changesetsChanged` (a full catalog replacement). |
| `Requested` | A client asks the host to do something whose outcome the host reflects later (`session/mcpServerStartRequested`, `automation/createRequested`). |
| `Reordered` / `Replaced` / `Toggled` / `Cleared` | Reorder a list / swap one entry for another / flip an enablement / empty a collection. |
| `Started` / `Completed` / `Cancelled` / `Failed` | Lifecycle events. |

### Commands

- Method names are **verb-first lowerCamel**:
  - `create*` and `dispose*` manage the lifecycle of a channel resource.
  - `list*` returns a paginated catalog.
  - `fetch*` loads more of something already known.
  - `resolve*` computes a derived value.
  - `invoke*` runs a declared operation.
  - `run*` starts an automation.
- The `resource*` family (`resourceRead`, `resourceWrite`, …) is
  deliberately noun-first; extend it with the same pattern.
- New commands return a `<Method>Result` object, even when it is empty
  (`{}`), so they can gain fields later. Some older commands return `null`;
  don't copy that.

### Notifications

- Method names are **`<namespace>/<lowerCamel>`**: `root/sessionAdded`,
  `auth/required`, `channel/frame`, `otlp/exportLogs`, `tcp/data`.
- Tag every notification with `@direction`. Mark control messages that must
  not count against a window with `@windowExempt`.

### Error codes

- Names are PascalCase nouns or states (`SessionNotFound`, `AlreadyExists`,
  `Conflict`).
- AHP-defined codes use `-32000` to `-32099`. Allocate the next number after
  the highest existing code, and never reuse a number.
- Prefer a generic code (`NotFound`, `InvalidParams`, `Conflict`) over a new
  feature-specific one.

## Capabilities

- A capability is an **optional object whose presence means supported**. A
  presence-only capability is an empty interface named `<Feature>Capability`.
  Put options for the capability inside that object.
- Where capabilities live:
  - Host-wide: fields on `InitializeResult`.
  - Per agent: `AgentInfo.capabilities`.
  - Client: `InitializeParams.capabilities`.
- Field names are feature nouns (`automations`, `tcpConnections`,
  `multipleChats`).

## Extensibility

- `_meta?: Record<string, unknown>` is the open, implementation-specific
  side channel on objects and actions. Don't give it protocol meaning.
- When mirroring an external field that would collide with AHP's own
  `_meta`, give it a descriptive name instead, as with
  `ToolCallResult.resultMetadata` for MCP `CallToolResult._meta`.
- Use `Record<string, unknown>` only for intentionally open data (config
  values, JSON Schema, tool payloads). Model known shapes as named types.

## Legacy names (do not copy)

| Name | Why it's legacy |
| --- | --- |
| `TerminalCommandPart.timestamp` (Unix ms number) | Timestamps are ISO `*At` strings. |
| `durationMs` (`TerminalCommandPart`, `TerminalCommandFinishedAction`), `maxLatencyMs` | Time spans are milliseconds without a unit suffix. |
| `ResourceReadParams.uri: string` | URI-valued fields use `URI`. |
| `maximumFrameBytes` | Limits are `max*` (renamed to `maxFrameBytes` in #596). |
| `ChangesetFile.isEditing` | A boolean that may grow (replaced by a `ChangesetFileStatus` bitset in #596). |
| `CanvasState.url` | A content location is `uri` (renamed in #596). |
| `CanvasState.status` (free text) | `status` is a typed lifecycle. |
| `ChatState.queuedMessages` | Holds both steering and queued messages; read it as "pending messages". |
| `CustomizationType`, `ResourceChangeType`, `ToolResultContentType`, `ReconnectResultType` | New discriminants use `*Kind` or `*Status`. |
| `TurnState`, `PolicyState`, `ChatInputAnswerState` enums | `*State` is reserved for state objects. |
| `MessageKind` declared as `enum` | Use `export const enum`. |
| `chat/toolCallStart`, `chat/turnComplete`, `chat/toolCallComplete`, `chat/turnResume`, `chat/error` | Action types are past-tense events. |
| `dispatchAction` / `action` methods | Core envelopes that predate `<namespace>/<event>` method names. |
| `null` command results (`createSession`, `createChat`, …) | New commands return a `*Result` object. |
