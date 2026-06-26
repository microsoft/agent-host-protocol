/**
 * Session State Types — Per-session coordination state exposed on `ahp-session:` channels.
 *
 * @module channels-session/state
 */

import type { Changeset } from '../channels-changeset/state.js';
import type { AnnotationsSummary } from '../channels-annotations/state.js';
import type { ChatSummary } from '../channels-chat/state.js';
import type { ModelSelection } from '../channels-root/state.js';
import type {
  ConfigPropertySchema,
  ErrorInfo,
  Icon,
  ProtectedResourceMetadata,
  TextRange,
  URI,
} from '../common/state.js';

// ─── Session State ───────────────────────────────────────────────────────────

/**
 * Session initialization state.
 *
 * @category Session State
 */
export const enum SessionLifecycle {
  Creating = 'creating',
  Ready = 'ready',
  CreationFailed = 'creationFailed',
}

/**
 * Bitset of summary-level session status flags.
 *
 * Use bitwise checks instead of equality for non-terminal activity. For example,
 * `status & SessionStatus.InProgress` matches both ordinary in-progress turns
 * and turns that are paused waiting for input.
 *
 * @category Session State
 */
export const enum SessionStatus {
  /** Session is idle — no turn is active. */
  Idle = 1,
  /** Session ended with an error. */
  Error = 1 << 1,
  /** A turn is actively streaming. */
  InProgress = 1 << 3,
  /** A turn is in progress but blocked waiting for user input or tool confirmation. */
  InputNeeded = (1 << 3) | (1 << 4),
  /** The client has viewed this session since its last modification. */
  IsRead = 1 << 5,
  /** The session has been archived by the client. */
  IsArchived = 1 << 6,
}

/**
 * Full state for a single session, loaded when a client subscribes to the session's URI.
 *
 * @category Session State
 */
export interface SessionState {
  /** Lightweight session metadata */
  summary: SessionSummary;
  /** Session initialization state */
  lifecycle: SessionLifecycle;
  /** Error details if creation failed */
  creationError?: ErrorInfo;
  /** Tools provided by the server (agent host) for this session */
  serverTools?: ToolDefinition[];
  /**
   * The clients currently providing tools and interactive capabilities to this
   * session. If multiple tools or customizations are provided by the same
   * active client, an agent host MAY deduplicate them when exposed to a model,
   * with a preference given to the client that started the turn.
   *
   * Membership is host-managed: clients add (or refresh) themselves with
   * `session/activeClientSet`, and the host removes them with
   * `session/activeClientRemoved` when they unsubscribe, disconnect without
   * reconnecting in time, or reconnect without resubscribing to the session.
   */
  activeClients: SessionActiveClient[];
  /** Catalog of chats in this session. */
  chats: ChatSummary[];
  /**
   * The chat that receives input when the user addresses the session without
   * selecting a specific chat. This is a UI routing hint, not a hierarchy
   * marker — chats remain equal peers at the protocol level. Hosts MAY change
   * this over the session's lifetime.
   */
  defaultChat?: URI;
  /** Session configuration schema and current values */
  config?: SessionConfigState;
  /**
   * Top-level customizations active in this session.
   *
   * Always one of the {@link Customization} variants:
   *
   * - Container customizations ({@link PluginCustomization},
   *   {@link DirectoryCustomization}) whose children — agents, skills,
   *   prompts, rules, hooks, MCP servers — live in each container's
   *   {@link ContainerCustomizationBase.children | `children`} array.
   * - Top-level {@link McpServerCustomization} entries the host
   *   surfaces directly (for example a globally-configured MCP server
   *   that isn't bundled in a plugin or directory). MCP servers may
   *   also appear as children of a container.
   *
   * Client-published plugins arrive via
   * {@link SessionActiveClient.customizations | `activeClients[].customizations`}
   * and the host propagates them into this list (typically with the
   * container's `clientId` set and `children` populated). Clients
   * publish in container shape only; bare MCP servers at the top level
   * are server-originated.
   */
  customizations?: Customization[];
  /**
   * Catalogue of changesets the server can produce for this session. Each
   * entry advertises a subscribable view of file changes (uncommitted,
   * session-wide, per-turn, etc.) and the URI template the client expands
   * before subscribing. See {@link Changeset} for the full shape and
   * {@link /guide/changesets | Changesets} for an overview of the model.
   */
  changesets?: Changeset[];
  /**
   * Aggregated registry of canvases currently exposed to the agent.
   *
   * Full-replacement: when this changes, the entire array is republished
   * via `session/canvasRegistryChanged`. The host derives it from every
   * active canvas provider attached to the session — server-side
   * ({@link CanvasProviderKind.Server}) and active-client
   * ({@link CanvasProviderKind.ActiveClient}, contributed via
   * {@link SessionActiveClient.canvasProviders}). See
   * {@link /guide/canvases | Canvases} for the model.
   */
  canvasRegistry?: SessionCanvasDeclaration[];
  /**
   * Snapshot of every canvas instance currently open for this session.
   *
   * Maintained via `session/canvasInstanceOpened` (upsert),
   * `session/canvasInstanceUpdated` (partial merge), and
   * `session/canvasInstanceClosed` (remove). Subscribers see open
   * instances in their initial snapshot and as live deltas thereafter,
   * so a reconnecting client can rebuild the open set.
   */
  openCanvases?: SessionOpenCanvas[];
  /**
   * Canvas open / action / close requests the host is currently waiting
   * on a provider to complete.
   *
   * Lives in state — like the chat channel's input requests — so
   * subscribers can see what is in flight and reconnect/replay is
   * correct. Entries are added with `session/canvasRequestCreated` and
   * removed once a `session/canvasRequestCompleted` carries the matching
   * `requestId`, or via `session/canvasRequestCancelled`.
   */
  canvasRequests?: SessionCanvasRequest[];
  /**
   * Additional provider-specific metadata for this session.
   *
   * Clients MAY look for well-known keys here to provide enhanced UI.
   * For example, a `git` key may provide extra git metadata about the session's
   * workingDirectory.
   */
  _meta?: Record<string, unknown>;
}

/**
 * A client currently providing tools and interactive capabilities to a session.
 *
 * A session MAY have several active clients at once; entries in
 * {@link SessionState.activeClients} are keyed by `clientId`. The server SHOULD
 * automatically remove an active client when that client disconnects.
 *
 * @category Session State
 */
export interface SessionActiveClient {
  /** Client identifier (matches `clientId` from `initialize`) */
  clientId: string;
  /** Human-readable client name (e.g. `"VS Code"`) */
  displayName?: string;
  /** Tools this client provides to the session */
  tools: ToolDefinition[];
  /**
   * Plugin customizations this client contributes to the session.
   *
   * Clients publish in [Open Plugins](https://open-plugins.com/) format
   * — i.e. always container-shaped plugins. They MAY synthesize virtual
   * plugins in memory and rely on the host to expand them into concrete
   * children inside {@link SessionState.customizations}.
   */
  customizations?: ClientPluginCustomization[];
  /**
   * Canvas providers this active client contributes to the session.
   *
   * Each entry is a single canvas declaration the client can host; a
   * client with multiple canvases publishes one entry per canvas. When
   * this field is populated, the host SHOULD register the client as a
   * canvas provider with its backend and aggregate the contributions
   * into {@link SessionState.canvasRegistry} with
   * {@link CanvasProviderKind.ActiveClient} and `clientId` set to this
   * client's `clientId`.
   *
   * Updated atomically via `session/activeClientSet` — there is no
   * separate "canvasProvidersChanged" action; clients re-publish their
   * full entry, identical to the {@link customizations} / {@link tools}
   * pattern.
   */
  canvasProviders?: ClientCanvasDeclaration[];
  /**
   * Renderer-capability hint. When `true`, the host MAY route canvas open
   * requests targeting server-owned providers to this client (a
   * `session/canvasRequestCreated` whose `target.clientId` is this
   * client). Clients that do not render canvases SHOULD omit the field.
   *
   * Independent of {@link canvasProviders}: a client can render canvases
   * declared by other providers without declaring any of its own, and
   * vice versa.
   */
  canRenderCanvases?: boolean;
}

/**
 * Server-owned project metadata for a session.
 *
 * @category Session State
 */
export interface ProjectInfo {
  /** Project URI */
  uri: URI;
  /** Human-readable project name */
  displayName: string;
}

/**
 * Lightweight catalog entry summarizing one session. Surfaced via
 * {@link RootChannelCommands.listSessions | `root/listSessions`} and
 * `root/sessionAdded`/`root/sessionSummaryChanged` notifications.
 *
 * **Aggregation across chats.** Once a session contains more than one chat,
 * several `SessionSummary` fields are derived from the underlying
 * {@link SessionState.chats | chat catalog}. Producers SHOULD follow these
 * rules so clients that only consume the session summary (e.g. a session
 * list) still see meaningful state:
 *
 * - `status`: take the activity bits (`Idle` / `InProgress` / `InputNeeded` /
 *   `Error` — bits 0–4) from the
 *   {@link SessionState.defaultChat | default chat} when present, else from
 *   the most recently modified chat. **Promote** `InputNeeded` whenever any
 *   chat in the session needs input, and **promote** `Error` whenever any
 *   chat is in an error state — both override the default-chat bits. The
 *   orthogonal flag bits (`IsRead`, `IsArchived`) remain session-scoped.
 * - `activity`: mirror the activity string of the default chat, or of the
 *   chat currently driving the promoted status bits when a non-default chat
 *   wins (e.g. the chat that raised `InputNeeded`).
 * - `modifiedAt`: the max of all chats' `modifiedAt`.
 * - `model` / `agent`: the session-level selection. Per-chat overrides are
 *   surfaced on individual {@link ChatSummary} entries, not aggregated up.
 * - `workingDirectory`: the session-level **default**. Individual chats MAY
 *   override via {@link ChatSummary.workingDirectory}; aggregating these up
 *   is meaningless and SHOULD NOT be attempted.
 * - `changes`: optional roll-up across all chats. Producers MAY sum the
 *   per-chat changeset stats or report the most expensive chat's stats —
 *   whichever is cheaper for the host to compute.
 *
 * Sessions with a single chat trivially satisfy all of the above (the chat's
 * values pass through unchanged). The rules only matter once a session
 * carries multiple chats.
 *
 * @category Session State
 */
export interface SessionSummary {
  /** Session URI */
  resource: URI;
  /** Agent provider ID */
  provider: string;
  /** Session title */
  title: string;
  /** Current session status */
  status: SessionStatus;
  /** Human-readable description of what the session is currently doing */
  activity?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  modifiedAt: number;
  /** Server-owned project for this session */
  project?: ProjectInfo;
  /** Currently selected model */
  model?: ModelSelection;
  /**
   * Currently selected custom agent.
   *
   * Absent (`undefined`) means no custom agent is selected for this session
   * — the session uses the provider's default behavior.
   */
  agent?: AgentSelection;
  /**
   * The default working directory URI for this session. Individual chats
   * MAY override via {@link ChatSummary.workingDirectory | their own
   * `workingDirectory`}; this field acts as the fallback for any chat that
   * does not.
   */
  workingDirectory?: URI;
  /**
  * Aggregate summary of file changes associated with this session. Servers
  * may populate this to give clients a quick at-a-glance view of the
  * session's footprint (e.g., for list rendering) without requiring the
  * client to subscribe to a changeset.
  */
  changes?: ChangesSummary;
  /**
   * Lightweight summary of this session's inline annotations channel
   * (`ahp-session:/<uuid>/annotations`). Surfaced so badge UI can render
   * annotation / entry counts without subscribing. Absent when the session
   * does not expose an annotations channel.
   */
  annotations?: AnnotationsSummary;

  /**
   * Lightweight server-defined metadata clients may use for the session
   * presentation. The protocol does not interpret these values; producers
   * SHOULD keep the payload small because summaries appear in session lists
   * and session notifications.
   */
  _meta?: Record<string, unknown>;
}

/**
 * Aggregate counts describing the file changes associated with a session.
 *
 * All fields are optional so servers can populate only the metrics they
 * cheaply have available.
 *
 * @category Session State
 */
export interface ChangesSummary {
  /** Total number of inserted lines across all changed files. */
  additions?: number;
  /** Total number of deleted lines across all changed files. */
  deletions?: number;
  /** Number of files that have changes. */
  files?: number;
}

// ─── Model Selection ─────────────────────────────────────────────────────────
// `ModelSelection` is declared in channels-root/state.ts (the model lives on
// `AgentInfo`); we import it above for use in `SessionSummary.model`.

// ─── Agent Selection ─────────────────────────────────────────────────────────

/**
 * A selected custom agent for a session.
 *
 * The `uri` identifies a specific custom agent (matching an
 * {@link AgentCustomization.uri | `AgentCustomization.uri`} exposed via
 * the session's effective customizations). Consumers resolve the agent's
 * display name by looking up `uri` in the session's customization tree.
 *
 * A session with no `agent` selected uses the provider's default behavior.
 *
 * @category Session State
 */
export interface AgentSelection {
  /** Stable agent URI (matches an {@link AgentCustomization.uri}). */
  uri: URI;
}

// ─── Session Config Types ────────────────────────────────────────────────────

/**
 * A session configuration property descriptor.
 *
 * Extends the generic {@link ConfigPropertySchema} with session-specific
 * display extensions.
 *
 * @category Session Config Types
 */
export interface SessionConfigPropertySchema extends ConfigPropertySchema {
  /**
   * Display extension: when `true`, the full set of allowed values is too large
   * to enumerate statically. The client SHOULD use `sessionConfigCompletions`
   * to fetch matching values based on user input. Any values in `enum` are
   * seed/recent values for initial display.
   */
  enumDynamic?: boolean;
  /** When `true`, the user may change this property after session creation */
  sessionMutable?: boolean;
}

/**
 * A JSON Schema object describing available session configuration metadata.
 *
 * @category Session Config Types
 */
export interface SessionConfigSchema {
  /** JSON Schema: always `'object'` */
  type: 'object';
  /** JSON Schema: property descriptors keyed by property id */
  properties: Record<string, SessionConfigPropertySchema>;
  /** JSON Schema: list of required property ids */
  required?: string[];
}

/**
 * Live session configuration metadata.
 *
 * The schema describes the available configuration properties and the values
 * contain the current value for each resolved property.
 *
 * @category Session Config Types
 */
export interface SessionConfigState {
  /** JSON Schema describing available configuration properties */
  schema: SessionConfigSchema;
  /** Current configuration values */
  values: Record<string, unknown>;
}

// ─── Tool Definition Types ───────────────────────────────────────────────────

/**
 * Describes a tool available in a session, provided by either the server or the active client.
 *
 * @category Tool Definition Types
 */
export interface ToolDefinition {
  /** Unique tool identifier */
  name: string;
  /** Human-readable display name */
  title?: string;
  /** Description of what the tool does */
  description?: string;
  /**
   * JSON Schema defining the expected input parameters.
   *
   * Optional because client-provided tools may not have formal schemas.
   * Mirrors MCP `Tool.inputSchema`.
   */
  inputSchema?: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
  /**
   * JSON Schema defining the structure of the tool's output.
   *
   * Mirrors MCP `Tool.outputSchema`.
   */
  outputSchema?: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
  /** Behavioral hints about the tool. All properties are advisory. */
  annotations?: ToolAnnotations;
  /**
   * Additional provider-specific metadata.
   *
   * Mirrors the MCP `_meta` convention.
   */
  _meta?: Record<string, unknown>;
}

/**
 * Behavioral hints about a tool. All properties are advisory and not
 * guaranteed to faithfully describe tool behavior.
 *
 * Mirrors MCP `ToolAnnotations` from the Model Context Protocol specification.
 *
 * @category Tool Definition Types
 */
export interface ToolAnnotations {
  /** Alternate human-readable title */
  title?: string;
  /** Tool does not modify its environment (default: false) */
  readOnlyHint?: boolean;
  /** Tool may perform destructive updates (default: true) */
  destructiveHint?: boolean;
  /** Repeated calls with the same arguments have no additional effect (default: false) */
  idempotentHint?: boolean;
  /** Tool may interact with external entities (default: true) */
  openWorldHint?: boolean;
}

// ─── Customization Types ─────────────────────────────────────────────────────

/**
 * Discriminant for the kind of customization.
 *
 * Top-level entries in {@link SessionState.customizations} and
 * {@link AgentInfo.customizations} are either container customizations
 * ({@link CustomizationType.Plugin | `Plugin`} or
 * {@link CustomizationType.Directory | `Directory`}) or
 * {@link CustomizationType.McpServer | `McpServer`} entries surfaced
 * directly by the host. The remaining types appear only as children of
 * a container.
 *
 * @category Customization Types
 */
export const enum CustomizationType {
  Plugin = 'plugin',
  Directory = 'directory',
  Agent = 'agent',
  Skill = 'skill',
  Prompt = 'prompt',
  Rule = 'rule',
  Hook = 'hook',
  McpServer = 'mcpServer',
}

/**
 * Customization types that appear as children of a
 * {@link PluginCustomization} or {@link DirectoryCustomization}.
 *
 * @category Customization Types
 */
export type ChildCustomizationType =
  | CustomizationType.Agent
  | CustomizationType.Skill
  | CustomizationType.Prompt
  | CustomizationType.Rule
  | CustomizationType.Hook
  | CustomizationType.McpServer;

/**
 * Fields shared by every customization variant.
 *
 * @category Customization Types
 */
interface CustomizationBase {
  /**
   * Session-unique opaque identifier. Used by every action that targets a
   * specific customization. Minted by whoever publishes the customization
   * (typically the agent host).
   */
  id: string;
  /**
   * Source URI for this customization. A plugin URL, a file URI, or a
   * directory URI.
   *
   * For declarations that live inside a larger file — e.g. an MCP
   * server declared inline in a `plugins.json` manifest — `uri` points
   * to the containing file and {@link CustomizationBase.range | `range`}
   * narrows it to the declaration's span.
   */
  uri: URI;
  /** Human-readable name. */
  name: string;
  /** Icons for UI display. */
  icons?: Icon[];
  /**
   * Optional span within {@link CustomizationBase.uri | `uri`} when this
   * customization is a subset of a larger file (for example, one entry
   * in an inline `mcpServers` block of a `plugins.json` manifest).
   * Absent when the customization covers the whole resource.
   */
  range?: TextRange;
}

/**
 * Discriminant values for {@link CustomizationLoadState}.
 *
 * @category Customization Types
 */
export const enum CustomizationLoadStatus {
  Loading = 'loading',
  Loaded = 'loaded',
  Degraded = 'degraded',
  Error = 'error',
}

/**
 * Container is being loaded by the host.
 *
 * @category Customization Types
 */
export interface CustomizationLoadingState {
  kind: CustomizationLoadStatus.Loading;
}

/**
 * Container loaded successfully.
 *
 * @category Customization Types
 */
export interface CustomizationLoadedState {
  kind: CustomizationLoadStatus.Loaded;
}

/**
 * Container partially loaded but has warnings.
 *
 * @category Customization Types
 */
export interface CustomizationDegradedState {
  kind: CustomizationLoadStatus.Degraded;
  /** Human-readable description of the warning. */
  message: string;
}

/**
 * Container failed to load.
 *
 * @category Customization Types
 */
export interface CustomizationErrorState {
  kind: CustomizationLoadStatus.Error;
  /** Human-readable error message. */
  message: string;
}

/**
 * Discriminated load state for a container customization
 * ({@link PluginCustomization} or {@link DirectoryCustomization}).
 *
 * @category Customization Types
 */
export type CustomizationLoadState =
  | CustomizationLoadingState
  | CustomizationLoadedState
  | CustomizationDegradedState
  | CustomizationErrorState;

/**
 * Fields shared by container customizations.
 *
 * @category Customization Types
 */
interface ContainerCustomizationBase extends CustomizationBase {
  /** Whether this container is currently enabled. */
  enabled: boolean;
  /**
   * `clientId` of the client that contributed this container. Absent for
   * server-originated entries.
   */
  clientId?: string;
  /**
   * Host-reported load state. Absent means the host has not yet reported
   * a load state for this container.
   */
  load?: CustomizationLoadState;
  /**
   * Children discovered inside this container.
   *
   * Absent means the host has not parsed this container yet. An empty
   * array means the host parsed the container and it contributes
   * nothing.
   */
  children?: ChildCustomization[];
}

/**
 * An [Open Plugins](https://open-plugins.com/) plugin.
 *
 * @category Customization Types
 */
export interface PluginCustomization extends ContainerCustomizationBase {
  type: CustomizationType.Plugin;
}

/**
 * A {@link PluginCustomization} as published by a client. Extends the
 * server-facing shape with an opaque `nonce` so the host can detect when
 * the client's view of a plugin has changed and re-parse only as needed.
 *
 * Clients SHOULD include a `nonce`. Server-side fields like
 * {@link ContainerCustomizationBase.children | `children`} and
 * {@link ContainerCustomizationBase.load | `load`} are typically left
 * absent on publication and populated by the host when the resolved
 * plugin appears in {@link SessionState.customizations}.
 *
 * @category Customization Types
 */
export interface ClientPluginCustomization extends PluginCustomization {
  /** Opaque version token used by the host to detect changes. */
  nonce?: string;
}

/**
 * A directory the host watches for this session.
 *
 * Presence in the customization list signals that the host may discover
 * customizations from this directory. When `writable` is `true`, clients
 * MAY persist new customizations into the directory using
 * [`resourceWrite`](/reference/common#resourcewrite); the host will
 * then surface the resulting child via the customization actions.
 *
 * The directory may not yet exist on disk.
 *
 * @category Customization Types
 */
export interface DirectoryCustomization extends ContainerCustomizationBase {
  type: CustomizationType.Directory;
  /** Which child customization type this directory holds. */
  contents: ChildCustomizationType;
  /** Whether clients may write into this directory. */
  writable: boolean;
}

/**
 * A custom agent contributed by a plugin or directory.
 *
 * Mirrors the [Open Plugins agent](https://open-plugins.com/agent-builders/components/agents)
 * format: a markdown file with YAML frontmatter, where the body is the
 * agent's system prompt.
 *
 * @category Customization Types
 */
export interface AgentCustomization extends CustomizationBase {
  type: CustomizationType.Agent;
  /**
   * Short description of what the agent specializes in and when to
   * invoke it. Sourced from the agent file's frontmatter `description`.
   */
  description?: string;
  /**
   * Additional provider-specific metadata for this custom agent.
   *
   * Mirrors the MCP `_meta` convention.
   */
  _meta?: Record<string, unknown>;
}

/**
 * A skill contributed by a plugin or directory.
 *
 * Covers both [Open Plugins skill formats](https://open-plugins.com/agent-builders/components/skills)
 * — the `skills/` directory layout (one subdirectory per skill, each with
 * a `SKILL.md`) and the flatter `commands/` directory of slash-command
 * skills.
 *
 * @category Customization Types
 */
export interface SkillCustomization extends CustomizationBase {
  type: CustomizationType.Skill;
  /**
   * Short description used for help text and auto-invocation matching.
   * Sourced from the skill's frontmatter `description`.
   */
  description?: string;
  /**
   * When `true`, only the user can invoke this skill — the agent will not
   * auto-invoke it. Sourced from the command skill's frontmatter
   * `disable-model-invocation` flag.
   */
  disableModelInvocation?: boolean;
}

/**
 * A prompt contributed by a plugin or directory.
 *
 * @category Customization Types
 */
export interface PromptCustomization extends CustomizationBase {
  type: CustomizationType.Prompt;
  /** Short description of what the prompt does. */
  description?: string;
}

/**
 * A rule contributed by a plugin or directory.
 *
 * Mirrors the [Open Plugins rule](https://open-plugins.com/agent-builders/components/rules)
 * format: a markdown file (e.g. `.mdc`) whose body is injected into
 * context while the rule is active. This type also covers tool-specific
 * "instruction" formats (e.g. VS Code Copilot's
 * `.github/instructions/*.md`), which differ only in naming — they
 * share the same semantics of `description`, optional always-on
 * activation, and optional glob scoping.
 *
 * @category Customization Types
 */
export interface RuleCustomization extends CustomizationBase {
  type: CustomizationType.Rule;
  /**
   * Description of what the rule enforces.
   */
  description?: string;
  /**
   * When `true`, the rule is always active (subject to `globs` if any).
   * When `false` or absent, the agent or user decides whether to apply
   * the rule.
   */
  alwaysApply?: boolean;
  /**
   * Glob patterns the rule applies to. When present, the rule is only
   * active for matching files.
   */
  globs?: string[];
}

/**
 * A hook manifest contributed by a plugin or directory.
 *
 * @category Customization Types
 */
export interface HookCustomization extends CustomizationBase {
  type: CustomizationType.Hook;
}

/**
 * An MCP server contributed by a plugin or directory.
 *
 * When the server is declared inline in the containing plugin manifest,
 * `uri` points at the manifest file and
 * {@link CustomizationBase.range | `range`} narrows it to the
 * declaration's span.
 *
 * The MCP server customization also reflects its current status.
 *
 * @category Customization Types
 */
export interface McpServerCustomization extends CustomizationBase {
  type: CustomizationType.McpServer;
  /**
   * Whether this MCP server is currently enabled.
   */
  enabled: boolean;
  /**
   * Current lifecycle state of the MCP server.
   */
  state: McpServerState;
  /**
   * An `mcp://`-protocol channel the client uses to side-channel traffic
   * into the upstream MCP server itself. The channel is NOT a fresh raw MCP
   * connection: it piggybacks on the AHP transport
   * and skips the MCP `initialize` sequence.
   *
   * The agent host MAY only serve a subset of MCP on this
   * channel; the served subset is described by domain-specific
   * capabilities such as those in
   * {@link McpServerCustomizationApps.capabilities}.
   *
   * The channel URI SHOULD be stable across the server's lifetime, but
   * the agent host MAY change it (for example across a restart) and
   * MAY only expose it while the server is in
   * {@link McpServerStatus.Ready | `Ready`}. Absence means no
   * side-channel is currently available.
   */
  channel?: URI;
  /**
   * MCP App support. This property SHOULD be advertised for MCP servers
   * which support apps.
   */
  mcpApp?: McpServerCustomizationApps;
}

/**
 * Information from the agent host needed to render MCP Apps served
 * by this MCP server.
 *
 * @category MCP Server State
 */
export interface McpServerCustomizationApps {
  /**
   * The subset of MCP App
   * [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
   * the AHP host can satisfy for Views backed by this server. The
   * client feeds these straight through into the `hostCapabilities` of
   * the `ui/initialize` response delivered to the View.
   */
  capabilities: AhpMcpUiHostCapabilities;
}

/**
 * The subset of MCP App
 * [`HostCapabilities`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)
 * an AHP host can derive from the upstream MCP server (and from AHP's own
 * forwarding plumbing). Advertised on
 * {@link McpServerCustomizationApps.capabilities} so clients can pass it
 * through into the `hostCapabilities` of the `ui/initialize` response
 * delivered to an MCP App View.
 *
 * Field names mirror the MCP Apps spec exactly, so the AHP-side producer
 * can pass them straight through into the `hostCapabilities` of the
 * `ui/initialize` response delivered to the View.
 *
 * Capabilities outside this set (`openLinks`, `downloadFile`, `sandbox`,
 * `experimental`) are decided locally by whichever AHP client renders the
 * View and are NOT part of this AHP-level advertisement — only the
 * server-derived subset is.
 *
 * An agent host MUST only advertise a capability when it actually accepts the
 * corresponding methods/notifications on the `mcp://` channel:
 *
 * - {@link serverTools}: host proxies `tools/list` and `tools/call` to
 *   the MCP server. When `listChanged` is `true`, the host also forwards
 *   `notifications/tools/list_changed`.
 * - {@link serverResources}: host proxies `resources/read`,
 *   `resources/list`, and `resources/templates/list` to the MCP server.
 *   When `listChanged` is `true`, the host also forwards
 *   `notifications/resources/list_changed`.
 * - {@link logging}: host accepts `notifications/message` log entries
 *   from the App and forwards them via `mcpNotification` (and forwards
 *   `logging/setLevel` calls to the server).
 * - {@link sampling}: host serves `sampling/createMessage` via
 *   `mcpMethodCall`. When `sampling.tools` is present, the host also
 *   accepts SEP-1577 `tools` / `toolChoice` / `tool_use` content blocks
 *   inside `CreateMessageRequest`.
 *
 * @category MCP Server State
 * @see {@link https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx | MCP Apps spec (SEP-1865)}
 */
export interface AhpMcpUiHostCapabilities {
  /** Producer proxies the MCP `tools/*` methods to the upstream server. */
  serverTools?: {
    /** Producer forwards `notifications/tools/list_changed` from the server. */
    listChanged?: boolean;
  };
  /** Producer proxies the MCP `resources/*` methods to the upstream server. */
  serverResources?: {
    /** Producer forwards `notifications/resources/list_changed` from the server. */
    listChanged?: boolean;
  };
  /** Producer accepts `notifications/message` log entries from the App via `mcpNotification`. */
  logging?: Record<string, never>;
  /** Producer serves `sampling/createMessage` via `mcpMethodCall`. */
  sampling?: {
    /**
     * Producer accepts SEP-1577 `tools` / `toolChoice` / `tool_use` content
     * blocks inside `CreateMessageRequest`.
     */
    tools?: Record<string, never>;
  };
}

/**
 * Child customizations that live inside a {@link PluginCustomization} or
 * {@link DirectoryCustomization}.
 *
 * @category Customization Types
 */
export type ChildCustomization =
  | AgentCustomization
  | SkillCustomization
  | PromptCustomization
  | RuleCustomization
  | HookCustomization
  | McpServerCustomization;

/**
 * A top-level customization active in a session. Either a container
 * ({@link PluginCustomization} or {@link DirectoryCustomization}) whose
 * leaf customizations live in its
 * {@link ContainerCustomizationBase.children | `children`} array, or a
 * bare {@link McpServerCustomization} surfaced directly by the host.
 *
 * @category Customization Types
 */
export type Customization =
  | PluginCustomization
  | DirectoryCustomization
  | McpServerCustomization;


// ─── MCP Server State ────────────────────────────────────────────────────────

/**
 * Discriminant for the {@link McpServerState} union.
 *
 * @category MCP Server State
 */
export const enum McpServerStatus {
  /** Server has been registered but is not yet running. */
  Starting = 'starting',
  /** Server is running and serving requests. */
  Ready = 'ready',
  /**
   * Server is reachable but requires additional authentication before it
   * can start, or before it can serve a particular request. Carries the
   * RFC 9728 Protected Resource Metadata the client needs to obtain a
   * token; the client then pushes the token via the existing
   * `authenticate` command.
   */
  AuthRequired = 'authRequired',
  /** Server failed to start, crashed, or otherwise transitioned to a fatal error. */
  Error = 'error',
  /** Server has been shut down. */
  Stopped = 'stopped',
}

/**
 * Why an MCP server is currently in the {@link McpServerStatus.AuthRequired}
 * state. Mirrors the three failure modes defined by the
 * [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.md).
 *
 * @category MCP Server State
 */
export const enum McpAuthRequiredReason {
  /** No token has been provided yet (HTTP 401, no prior token). */
  Required = 'required',
  /** A previously valid token expired or was revoked (HTTP 401). */
  Expired = 'expired',
  /**
   * Step-up auth: a token is present but its scopes are insufficient for
   * the requested operation (HTTP 403 with
   * `WWW-Authenticate: Bearer error="insufficient_scope"`).
   *
   * Unlike {@link Required} and {@link Expired} — which typically surface
   * before any tool work is in flight — `InsufficientScope` is almost
   * always triggered by an MCP request issued mid-turn (a `tools/call`,
   * `resources/read`, etc.). The host SHOULD pair the
   * {@link McpServerAuthRequiredState} transition with
   * {@link SessionStatus.InputNeeded} on
   * {@link SessionSummary.status | the session} so the activity becomes
   * visible at the session-summary level, and clients SHOULD watch for
   * this kind on any
   * {@link McpServerCustomization | MCP server} backing a running tool
   * call so they can present an explicit "grant more access" affordance
   * tied to the blocked tool call.
   */
  InsufficientScope = 'insufficientScope',
}

/**
 * Server is registered with the host but has not yet started.
 *
 * @category MCP Server State
 */
export interface McpServerStartingState {
  kind: McpServerStatus.Starting;
}

/**
 * Server is running and serving requests.
 *
 * @category MCP Server State
 */
export interface McpServerReadyState {
  kind: McpServerStatus.Ready;
}

/**
 * Server is reachable but cannot serve requests until the client
 * authenticates. Mirrors the discovery flow defined by
 * [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)
 * (Protected Resource Metadata) and the OAuth 2.1 / RFC 6750 challenge
 * semantics required by the MCP authorization spec.
 *
 * Clients react to this state by calling the existing `authenticate`
 * command with the {@link ProtectedResourceMetadata.resource | resource}
 * carried here. There is **no** `notify/authRequired` notification for
 * MCP servers — the action stream is the single source of truth.
 *
 * When the transition is triggered by a request issued during a turn
 * — most commonly
 * {@link McpAuthRequiredReason.InsufficientScope | `InsufficientScope`}
 * surfacing mid-tool-call — the host SHOULD also raise
 * {@link SessionStatus.InputNeeded} on the session so the block is
 * visible at the summary level. Clients SHOULD watch this status on
 * any MCP server backing a running tool call and surface an explicit
 * affordance (e.g. a "grant additional access" prompt) tied to that
 * tool call, rather than relying on the user to notice the
 * customization’s status badge.
 *
 * @category MCP Server State
 */
export interface McpServerAuthRequiredState {
  kind: McpServerStatus.AuthRequired;
  /** Why authentication is required. */
  reason: McpAuthRequiredReason;
  /**
   * RFC 9728 Protected Resource Metadata. The `resource` field is the
   * canonical MCP server URI per RFC 8707, used as the OAuth `resource`
   * indicator. `authorization_servers` is REQUIRED by the MCP
   * authorization spec.
   */
  resource: ProtectedResourceMetadata;
  /**
   * Scopes required for the current challenge, parsed from the
   * `WWW-Authenticate: Bearer scope="…"` header (or `scopes_supported`
   * fallback). Authoritative for the next authorization request — clients
   * MUST NOT assume any subset/superset relationship to
   * `resource.scopes_supported`.
   */
  requiredScopes?: string[];
  /** Human-readable hint, typically from the OAuth `error_description`. */
  description?: string;
}

/**
 * Server failed to start, crashed, or otherwise transitioned to a
 * non-recoverable error. Use {@link McpServerStatus.AuthRequired}
 * for authentication failures.
 *
 * @category MCP Server State
 */
export interface McpServerErrorState {
  kind: McpServerStatus.Error;
  /** Error details. */
  error: ErrorInfo;
}

/**
 * Server has been shut down. The host MAY remove the server from the
 * session entirely shortly after this state.
 *
 * @category MCP Server State
 */
export interface McpServerStoppedState {
  kind: McpServerStatus.Stopped;
}

/**
 * Discriminated union of all MCP server lifecycle states.
 * Discriminated by `kind` (a {@link McpServerStatus} value).
 *
 * @category MCP Server State
 */
export type McpServerState =
  | McpServerStartingState
  | McpServerReadyState
  | McpServerAuthRequiredState
  | McpServerErrorState
  | McpServerStoppedState;

// ─── Canvas Types ────────────────────────────────────────────────────────────

/**
 * Where a canvas declaration came from. Used by the host for routing
 * provider requests and for cleanup when a provider goes away.
 *
 * Doubles as the discriminant for {@link CanvasRequestTarget}: a request
 * either targets the host process itself ({@link CanvasProviderKind.Server})
 * or a specific active client ({@link CanvasProviderKind.ActiveClient}).
 *
 * @category Canvas Types
 */
export const enum CanvasProviderKind {
  /** Declared by the host process (a server-side extension or builtin). */
  Server = 'server',
  /** Declared by a {@link SessionActiveClient} via `canvasProviders`. */
  ActiveClient = 'activeClient',
}

/**
 * A named operation a canvas exposes. Distinct from an AHP `StateAction`:
 * the agent invokes it over the canvas action family, addressed by
 * `(canvasId, name)`.
 *
 * @category Canvas Types
 */
export interface SessionCanvasAction {
  /** Action name. Provider-local; unique within `(extensionId, canvasId)`. */
  name: string;
  /** Short description shown to the agent. */
  description?: string;
  /**
   * JSON Schema for this action's input. Opaque to AHP — mirrors
   * {@link ToolDefinition.inputSchema}.
   */
  inputSchema?: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
}

/**
 * One entry in the aggregated {@link SessionState.canvasRegistry}. A canvas
 * the agent can open, keyed by `(extensionId, canvasId)`.
 *
 * @category Canvas Types
 */
export interface SessionCanvasDeclaration {
  /** Owning provider identifier. Stable across declarations and instances. */
  extensionId: string;
  /** Optional human-readable extension name. */
  extensionName?: string;
  /** Provider-local canvas identifier. Unique within `extensionId`. */
  canvasId: string;
  /** Human-readable canvas name. */
  displayName: string;
  /** Short description shown to the agent in canvas catalogs. */
  description: string;
  /**
   * JSON Schema for canvas open input. Opaque to AHP — mirrors
   * {@link ToolDefinition.inputSchema}.
   */
  inputSchema?: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
  /** Actions this canvas exposes. */
  actions?: SessionCanvasAction[];
  /** Where the declaration came from. Used for routing and cleanup. */
  source: CanvasProviderKind;
  /**
   * When `source === {@link CanvasProviderKind.ActiveClient}`, the
   * contributing client's `clientId`. Absent for server-declared canvases.
   */
  clientId?: string;
}

/**
 * Routing availability of an {@link SessionOpenCanvas}. Host-derived: the
 * host sets {@link CanvasInstanceAvailability.Stale | `Stale`} when the
 * owning provider becomes unreachable and
 * {@link CanvasInstanceAvailability.Ready | `Ready`} once the instance is
 * live again. A closed set rather than a free-form string.
 *
 * @category Canvas Types
 */
export const enum CanvasInstanceAvailability {
  /** The owning provider is reachable; actions may be routed to it. */
  Ready = 'ready',
  /** The owning provider is unreachable; the entry is kept but not routable. */
  Stale = 'stale',
}

/**
 * One entry in the {@link SessionState.openCanvases} snapshot — a single
 * open canvas, keyed by its caller-supplied `instanceId`.
 *
 * @category Canvas Types
 */
export interface SessionOpenCanvas {
  /** Caller-supplied stable instance identifier (agent-minted). */
  instanceId: string;
  /** Declaration this instance was opened from. */
  canvasId: string;
  /** Owning provider identifier. */
  extensionId: string;
  /** Optional human-readable extension name. */
  extensionName?: string;
  /** Routing availability — host-derived. */
  availability: CanvasInstanceAvailability;
  /**
   * Input the agent supplied when opening. Retained so a recovering host
   * can re-bind the instance without round-tripping the agent.
   */
  input?: Record<string, unknown>;
  /** Provider-supplied display title. */
  title?: string;
  /** Provider-supplied status text. */
  status?: string;
  /** URL for rendered canvases. Subject to renderer policy. */
  url?: string;
  /**
   * Renderer-side binding once a client has accepted the open. Lets the
   * host route subsequent actions to the right renderer and authorise a
   * `session/canvasInstanceCloseRequested`. Optional — server-rendered
   * canvases may have no specific bound renderer, in which case any client
   * with {@link SessionActiveClient.canRenderCanvases} MAY render it.
   */
  renderer?: { clientId: string };
}

/**
 * What the host is asking a provider to do in a {@link SessionCanvasRequest}.
 * Doubles as the discriminant for {@link CanvasRequestResult}.
 *
 * @category Canvas Types
 */
export const enum CanvasRequestKind {
  Open = 'open',
  Action = 'action',
  Close = 'close',
}

/**
 * Who the host has routed a {@link SessionCanvasRequest} to. A request is
 * fulfilled either by the host process itself
 * ({@link CanvasProviderKind.Server}) or by a specific active client
 * ({@link CanvasProviderKind.ActiveClient}). The `kind` determines which
 * direction may dispatch the matching `session/canvasRequestCompleted`.
 *
 * `clientId` is present exactly when `kind` is
 * {@link CanvasProviderKind.ActiveClient} — the host populates it with the
 * targeted client's `clientId` so a reconnecting client can tell whether a
 * pending request is addressed to it. It is absent for
 * {@link CanvasProviderKind.Server} targets.
 *
 * @category Canvas Types
 */
export interface CanvasRequestTarget {
  /** Which provider direction owns the request. */
  kind: CanvasProviderKind;
  /**
   * Targeted client's `clientId`. Present iff
   * `kind === {@link CanvasProviderKind.ActiveClient}`.
   */
  clientId?: string;
}

/**
 * Live correlation state for an in-flight provider callback, surfaced in
 * {@link SessionState.canvasRequests}. The host adds an entry when it routes
 * an open / action / close to a provider and removes it when the provider
 * reports completion (`session/canvasRequestCompleted`) or the host abandons
 * it (`session/canvasRequestCancelled`).
 *
 * @category Canvas Types
 */
export interface SessionCanvasRequest {
  /** Stable correlation id minted by the host. */
  requestId: string;
  /** What the host is asking the provider to do. */
  kind: CanvasRequestKind;
  /** Instance the request acts on. */
  instanceId: string;
  /** Declaration the instance belongs to. */
  canvasId: string;
  /** Owning provider identifier. */
  extensionId: string;
  /** Who the host has routed this request to. */
  target: CanvasRequestTarget;
  /** Action name when `kind === {@link CanvasRequestKind.Action}`. */
  actionName?: string;
  /**
   * Open-time input when `kind === {@link CanvasRequestKind.Open}`; action
   * input when `kind === {@link CanvasRequestKind.Action}`.
   */
  input?: Record<string, unknown>;
  /**
   * Server-side deadline at which the host will give up and fail the
   * underlying provider callback. Milliseconds since the Unix epoch.
   */
  deadlineMs?: number;
}

/**
 * A canvas declaration contributed by a {@link SessionActiveClient}. Lighter
 * than {@link SessionCanvasDeclaration}: `extensionId` and `source` are
 * derived by the host from the client's identity when it aggregates the
 * contribution into {@link SessionState.canvasRegistry}.
 *
 * @category Canvas Types
 */
export interface ClientCanvasDeclaration {
  /** Provider-local canvas identifier. */
  canvasId: string;
  /** Human-readable canvas name. */
  displayName: string;
  /** Short description shown to the agent. */
  description: string;
  /** JSON Schema for canvas open input. Opaque to AHP. */
  inputSchema?: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
  /** Actions this canvas exposes. */
  actions?: SessionCanvasAction[];
}

/**
 * Successful result of a canvas open request. `kind` matches the originating
 * {@link SessionCanvasRequest}'s {@link CanvasRequestKind.Open | `kind`}.
 *
 * @category Canvas Types
 */
export interface CanvasOpenResult {
  kind: CanvasRequestKind.Open;
  /** Provider-supplied render URL. Subject to renderer policy. */
  url?: string;
  /** Provider-supplied display title. */
  title?: string;
  /** Provider-supplied status text. */
  status?: string;
}

/**
 * Successful result of a canvas action invocation.
 *
 * @category Canvas Types
 */
export interface CanvasActionResult {
  kind: CanvasRequestKind.Action;
  /** Opaque provider-defined value. */
  value?: unknown;
}

/**
 * Successful result of a canvas close request.
 *
 * @category Canvas Types
 */
export interface CanvasCloseResult {
  kind: CanvasRequestKind.Close;
}

/**
 * Successful result of a {@link SessionCanvasRequest}, discriminated by `kind`
 * (a {@link CanvasRequestKind} value matching the originating request's
 * `kind`). Carried by `session/canvasRequestCompleted`.
 *
 * @category Canvas Types
 */
export type CanvasRequestResult =
  | CanvasOpenResult
  | CanvasActionResult
  | CanvasCloseResult;

/**
 * Error reported by a provider for a failed {@link SessionCanvasRequest}.
 *
 * @category Canvas Types
 */
export interface CanvasError {
  /**
   * Machine-readable code, e.g. `canvas_action_no_handler`,
   * `canvas_provider_unavailable`.
   */
  code: string;
  /** Human-readable message. */
  message: string;
}

/**
 * Whether a {@link SessionCanvasRequest} succeeded or failed — the discriminant
 * for {@link CanvasRequestOutcome}.
 *
 * @category Canvas Types
 */
export const enum CanvasRequestOutcomeKind {
  /** The provider fulfilled the request; a {@link CanvasRequestResult} follows. */
  Success = 'success',
  /** The provider could not fulfil the request; a {@link CanvasError} follows. */
  Error = 'error',
}

/**
 * Successful {@link CanvasRequestOutcome}, carrying the provider's
 * {@link CanvasRequestResult}.
 *
 * @category Canvas Types
 */
export interface CanvasRequestSuccessOutcome {
  kind: CanvasRequestOutcomeKind.Success;
  /** Provider result; its `kind` matches the originating request's `kind`. */
  result: CanvasRequestResult;
}

/**
 * Failed {@link CanvasRequestOutcome}, carrying the provider's
 * {@link CanvasError}.
 *
 * @category Canvas Types
 */
export interface CanvasRequestErrorOutcome {
  kind: CanvasRequestOutcomeKind.Error;
  /** Why the provider could not fulfil the request. */
  error: CanvasError;
}

/**
 * Outcome of a {@link SessionCanvasRequest}, carried by
 * `session/canvasRequestCompleted`. A discriminated union over
 * {@link CanvasRequestOutcomeKind} so a completion carries either a success
 * {@link CanvasRequestResult | result} or a failure {@link CanvasError | error}
 * — never both and never neither.
 *
 * @category Canvas Types
 */
export type CanvasRequestOutcome =
  | CanvasRequestSuccessOutcome
  | CanvasRequestErrorOutcome;

/**
 * Why the host abandoned an in-flight {@link SessionCanvasRequest}, carried by
 * `session/canvasRequestCancelled`.
 *
 * @category Canvas Types
 */
export const enum CanvasRequestCancelReason {
  /** The request's deadline elapsed before the provider answered. */
  Timeout = 'timeout',
  /** The targeted provider disconnected. */
  ProviderDisconnected = 'providerDisconnected',
  /** The instance was closed while the request was in flight. */
  InstanceClosed = 'instanceClosed',
  /** The host is shutting down. */
  HostShutdown = 'hostShutdown',
}
