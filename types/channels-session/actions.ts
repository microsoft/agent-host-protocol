/**
 * Session Channel Actions — Mutations of an `ahp-session:` channel's state.
 *
 * @module channels-session/actions
 */

import { ActionType } from '../common/actions.js';
import type { ErrorInfo } from '../common/state.js';
import type {
  ToolDefinition,
  SessionActiveClient,
  Customization,
  McpServerState,
  AgentSelection,
  SessionCanvasDeclaration,
  SessionOpenCanvas,
  SessionCanvasRequest,
  CanvasInstanceAvailability,
  CanvasRequestOutcome,
  CanvasRequestCancelReason,
} from './state.js';
import type { ModelSelection } from '../channels-root/state.js';
import type { URI } from '../common/state.js';
import type { Changeset } from '../channels-changeset/state.js';
import type { ChatSummary } from '../channels-chat/state.js';

// ─── Session Actions ─────────────────────────────────────────────────────────

/**
 * Session backend initialized successfully.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionReadyAction {
  type: ActionType.SessionReady;
}

/**
 * Session backend failed to initialize.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCreationFailedAction {
  type: ActionType.SessionCreationFailed;
  /** Error details */
  error: ErrorInfo;
}

/**
 * A chat was added to this session's catalog. Upsert semantics: if a chat
 * with the same `summary.resource` already exists, the existing entry is
 * replaced.
 *
 * Mirrors the root-channel `root/sessionAdded` notification.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionChatAddedAction {
  type: ActionType.SessionChatAdded;
  /** The full summary of the newly added (or upserted) chat. */
  summary: ChatSummary;
}

/**
 * A chat was removed from this session's catalog. No-op when no entry matches.
 *
 * Mirrors the root-channel `root/sessionRemoved` notification.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionChatRemovedAction {
  type: ActionType.SessionChatRemoved;
  /** The URI of the chat to remove. */
  chat: URI;
}

/**
 * One existing chat's summary fields changed.
 *
 * Partial-update semantics: only fields present in `changes` are written;
 * omitted fields are preserved. Identity fields (`resource`) MUST NOT be
 * carried in `changes`. No-op when no entry with `chat` exists — clients
 * SHOULD then wait for a {@link SessionChatAddedAction | `session/chatAdded`}.
 *
 * Mirrors the root-channel `root/sessionSummaryChanged` notification.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionChatUpdatedAction {
  type: ActionType.SessionChatUpdated;
  /** The URI of the chat whose summary changed. */
  chat: URI;
  /**
   * Mutable summary fields that changed; omitted fields are unchanged.
   *
   * Identity fields (`resource`) never change and MUST be omitted by
   * senders; receivers SHOULD ignore them if present.
   */
  changes: Partial<ChatSummary>;
}

/**
 * The default chat input-routing hint for this session changed.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionDefaultChatChangedAction {
  type: ActionType.SessionDefaultChatChanged;
  /** New default chat URI, or `undefined` to clear the hint. */
  defaultChat?: URI;
}

/**
 * Session title updated. Fired by the server when the title is auto-generated
 * from conversation, or dispatched by a client to rename a session.
 *
 * @category Session Actions
 * @clientDispatchable
 * @version 1
 */
export interface SessionTitleChangedAction {
  type: ActionType.SessionTitleChanged;
  /** New title */
  title: string;
}

/**
 * Model changed for this session.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionModelChangedAction {
  type: ActionType.SessionModelChanged;
  /** New model selection */
  model: ModelSelection;
}

/**
 * Custom agent selection changed for this session.
 *
 * Omitting `agent` (or setting it to `undefined`) clears the selection and
 * resets the session to no selected custom agent (provider default behavior).
 *
 * When a turn is currently active, the server MUST defer the change until
 * the active turn completes, then apply it for the next turn (same rule as
 * {@link SessionModelChangedAction | `session/modelChanged`}).
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionAgentChangedAction {
  type: ActionType.SessionAgentChanged;
  /**
   * New agent selection, or `undefined` to clear the selection and reset the
   * session to no selected custom agent.
   */
  agent?: AgentSelection;
}

/**
 * The read state of the session changed.
 *
 * Dispatched by a client to mark a session as read (e.g. after viewing it)
 * or unread (e.g. after new activity since the client last looked at it).
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionIsReadChangedAction {
  type: ActionType.SessionIsReadChanged;
  /** Whether the session has been read */
  isRead: boolean;
}

/**
 * The archived state of the session changed.
 *
 * Dispatched by a client to archive a session (e.g. the task is
 * complete) or to unarchive it.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionIsArchivedChangedAction {
  type: ActionType.SessionIsArchivedChanged;
  /** Whether the session is archived */
  isArchived: boolean;
}

/**
 * The activity description of the session changed.
 *
 * Dispatched by the server to indicate what the session is currently doing
 * (e.g. running a tool, thinking). Clear activity by setting it to `undefined`.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionActivityChangedAction {
  type: ActionType.SessionActivityChanged;
  /** Human-readable description of current activity, or `undefined` to clear */
  activity: string | undefined;
}

/**
 * The {@link Changeset | catalogue of changesets} the agent host
 * advertises for this session changed. Replaces
 * {@link SessionState.changesets | `state.changesets`} entirely
 * (full-replacement semantics) — set to `undefined` to clear the
 * catalogue.
 *
 * Producers dispatch this whenever entries are added or removed. The
 * fan-out happens through this action so observers see catalogue
 * mutations in the same {@link ChangesetAction | per-changeset} action
 * stream they already follow for file-level updates.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionChangesetsChangedAction {
  type: ActionType.SessionChangesetsChanged;
  /** New catalogue, or `undefined` to clear it */
  changesets: Changeset[] | undefined;
}

/**
 * Server tools for this session have changed.
 *
 * Full-replacement semantics: the `tools` array replaces the previous `serverTools` entirely.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionServerToolsChangedAction {
  type: ActionType.SessionServerToolsChanged;
  /** Updated server tools list (full replacement) */
  tools: ToolDefinition[];
}

/**
 * An active client for this session was added or updated.
 *
 * Upsert semantics keyed by {@link SessionActiveClient.clientId | `clientId`}:
 * a client dispatches this action with its own `SessionActiveClient` to join
 * the session's active clients or refresh its entry, replacing any existing
 * entry that has the same `clientId`. Multiple clients may be active at once.
 * This is also how a client updates its published tools or customizations —
 * re-dispatch with the full, updated entry. Use
 * {@link SessionActiveClientRemovedAction | `session/activeClientRemoved`} to
 * leave. The server SHOULD automatically dispatch that removal when an active
 * client disconnects.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionActiveClientSetAction {
  type: ActionType.SessionActiveClientSet;
  /** The active client to add or update, matched by `clientId`. */
  activeClient: SessionActiveClient;
}

/**
 * An active client was removed from this session.
 *
 * Removes the entry for the client identified by `clientId` from
 * {@link SessionState.activeClients}; a no-op when no entry matches.
 *
 * The host SHOULD dispatch this automatically when a client stops participating
 * in the session — for example when it unsubscribes from the session channel,
 * when it disconnects and does not reconnect within a host-defined grace
 * period, or when a `reconnect` command's `subscriptions` omit a session the
 * client was still active in. When removing a client, the host SHOULD also
 * cancel that client's in-flight tool calls — those whose tool call state
 * carries a client `ToolCallContributor` with the matching `clientId` — by
 * dispatching `chat/toolCallComplete` with `result.success = false`. (There is
 * no per-tool-call server cancel; a failed completion is the cancellation
 * mechanism, and the call ends in `completed` status with a failed result.)
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionActiveClientRemovedAction {
  type: ActionType.SessionActiveClientRemoved;
  /** The `clientId` of the active client to remove. */
  clientId: string;
}

// ─── Customization Actions ───────────────────────────────────────────────────

/**
 * The session's customizations have changed.
 *
 * Full-replacement semantics: the `customizations` array replaces the
 * previous `customizations` entirely.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCustomizationsChangedAction {
  type: ActionType.SessionCustomizationsChanged;
  /** Updated customization list (full replacement). */
  customizations: Customization[];
}

/**
 * A client toggled a container customization on or off.
 *
 * Targets a top-level container (plugin or directory) by `id`. Only
 * containers have an `enabled` flag; children are always active when
 * their container is enabled. Is a no-op when no matching container is
 * found.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionCustomizationToggledAction {
  type: ActionType.SessionCustomizationToggled;
  /** The id of the container to toggle. */
  id: string;
  /** Whether to enable or disable the container. */
  enabled: boolean;
}

/**
 * Upserts a top-level customization (plugin or directory).
 *
 * The reducer locates the existing entry by `customization.id`:
 *
 * - If found, the entry is replaced entirely with `customization`,
 *   including its `children` array. To preserve existing children, the
 *   host must include them on the payload.
 * - If not found, the entry is appended.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCustomizationUpdatedAction {
  type: ActionType.SessionCustomizationUpdated;
  /** The customization to upsert (matched by `customization.id`). */
  customization: Customization;
}

/**
 * Removes a customization by id.
 *
 * Searches every container and its children for the entry. If the entry
 * is a container, its children are removed with it. Is a no-op when no
 * matching id is found.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCustomizationRemovedAction {
  type: ActionType.SessionCustomizationRemoved;
  /** The id of the customization to remove. */
  id: string;
}

/**
 * Updates the runtime fields of an existing
 * {@link McpServerCustomization} — narrow alternative to
 * {@link SessionCustomizationUpdatedAction} for the high-frequency
 * `starting` ↔ `ready` ↔ `authRequired` transitions.
 *
 * Locates the target entry by `id`, searching both the top-level
 * customization list and the `children` array of every container.
 * Replaces the entry's {@link McpServerCustomization.state | `state`}
 * and {@link McpServerCustomization.channel | `channel`}
 * (full-replacement semantics: omit `channel` to clear an existing
 * channel URI). Other fields of the customization are preserved.
 *
 * Is a no-op when no matching `McpServerCustomization` is found. To
 * update any other field (name, icons, `mcpApp` capabilities, etc.) use
 * {@link SessionCustomizationUpdatedAction} instead.
 *
 * When the transition is to {@link McpServerStatus.AuthRequired}
 * because of a request issued mid-turn, the host SHOULD also raise
 * {@link SessionStatus.InputNeeded} on the session — see
 * {@link McpServerAuthRequiredState} for the rationale.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionMcpServerStateChangedAction {
  type: ActionType.SessionMcpServerStateChanged;
  /** The id of the {@link McpServerCustomization} to update. */
  id: string;
  /** The new lifecycle state. */
  state: McpServerState;
  /**
   * Updated `mcp://` side-channel URI. Full-replacement: omit to clear
   * an existing channel (typical when leaving
   * {@link McpServerStatus.Ready | `Ready`}).
   */
  channel?: URI;
}

// ─── Config Actions ──────────────────────────────────────────────────────────

/**
 * Client changed a mutable config value mid-session.
 *
 * Only properties with `sessionMutable: true` in the config schema may be
 * changed. The server validates and broadcasts the action; the reducer merges
 * the new values into `state.config.values`.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionConfigChangedAction {
  type: ActionType.SessionConfigChanged;
  /** Updated config values */
  config: Record<string, unknown>;
  /** When `true`, replaces all config values instead of merging */
  replace?: boolean;
}

/**
 * The session's `_meta` side-channel changed. Replaces `state._meta`
 * entirely (full-replacement semantics). Producers SHOULD merge any
 * keys they wish to preserve into the new value before dispatching.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionMetaChangedAction {
  type: ActionType.SessionMetaChanged;
  /** New `_meta` payload, or `undefined` to clear it */
  _meta: Record<string, unknown> | undefined;
}

// ─── Canvas Actions ──────────────────────────────────────────────────────────

/**
 * The aggregated {@link SessionCanvasDeclaration | canvas registry} for this
 * session changed. Full-replacement semantics: `canvases` replaces
 * {@link SessionState.canvasRegistry} entirely.
 *
 * Emitted after a canvas provider joins or leaves — a server-side extension
 * lifecycle change, or an `session/activeClientSet` /
 * `session/activeClientRemoved` that adds or drops a client's
 * {@link SessionActiveClient.canvasProviders}.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCanvasRegistryChangedAction {
  type: ActionType.SessionCanvasRegistryChanged;
  /** Full replacement of `state.canvasRegistry`. */
  canvases: SessionCanvasDeclaration[];
}

/**
 * A canvas instance was opened (or its full record was refreshed). Upsert
 * semantics keyed by {@link SessionOpenCanvas.instanceId | `instanceId`}:
 * the `instance` replaces any existing entry with the same `instanceId`, or
 * is appended when new. Idempotent for reopen and for the host's durable
 * resume replay (which carries no live `url`).
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCanvasInstanceOpenedAction {
  type: ActionType.SessionCanvasInstanceOpened;
  /** Full instance, upserted into `state.openCanvases` by `instanceId`. */
  instance: SessionOpenCanvas;
}

/**
 * A provider pushed a status / title / url / availability update for an open
 * canvas. Partial-merge by `instanceId`: present fields overwrite, absent
 * fields are preserved. Only these mutable fields may change after open;
 * identity (`instanceId`, `canvasId`, `extensionId`, `extensionName`) and the
 * renderer binding are fixed at open time. To clear a value, re-upsert the
 * whole instance with `session/canvasInstanceOpened`. A no-op when no open
 * instance matches.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCanvasInstanceUpdatedAction {
  type: ActionType.SessionCanvasInstanceUpdated;
  /** The instance to update. */
  instanceId: string;
  /** New display title, when changed. */
  title?: string;
  /** New status text, when changed. */
  status?: string;
  /** New render URL, when changed. */
  url?: string;
  /** New routing availability, when changed. */
  availability?: CanvasInstanceAvailability;
}

/**
 * An open canvas was closed. Removes it from {@link SessionState.openCanvases}
 * by `instanceId` and cascade-removes any
 * {@link SessionState.canvasRequests | pending requests} targeting it. A
 * no-op when neither an open instance nor a pending request matches.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCanvasInstanceClosedAction {
  type: ActionType.SessionCanvasInstanceClosed;
  /** The instance to close. */
  instanceId: string;
}

/**
 * A client (typically a renderer's close button) asks the host to close an
 * instance. The host translates this into the provider-facing close and
 * ultimately a `session/canvasInstanceClosed`. Pure client-to-host signal:
 * the reducer does not mutate state.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionCanvasInstanceCloseRequestedAction {
  type: ActionType.SessionCanvasInstanceCloseRequested;
  /** The instance the client wants closed. */
  instanceId: string;
}

/**
 * The host routed an open / action / close request to a provider and is
 * waiting on completion. Upsert into {@link SessionState.canvasRequests} keyed
 * by {@link SessionCanvasRequest.requestId | `requestId`} (a duplicate
 * `requestId` from a replay path replaces rather than duplicates). Visible to
 * all subscribers so a recovering client can see what is mid-flight.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCanvasRequestCreatedAction {
  type: ActionType.SessionCanvasRequestCreated;
  /** The in-flight request. */
  request: SessionCanvasRequest;
}

/**
 * The targeted provider reported the outcome of a
 * {@link SessionCanvasRequestCreatedAction}. Removes the matching entry from
 * {@link SessionState.canvasRequests} by `requestId`; a no-op when none
 * matches. The {@link CanvasRequestOutcome | `outcome`} is either a success
 * (carrying a {@link CanvasRequestResult} whose `kind` matches the originating
 * request's `kind`) or a failure (carrying a {@link CanvasError}).
 *
 * Direction depends on the request's `target`: for an
 * {@link CanvasProviderKind.ActiveClient} target only the client whose
 * `clientId` matches `target.clientId` may dispatch this; for a
 * {@link CanvasProviderKind.Server} target the host emits it and the server
 * SHOULD reject any client-dispatched completion.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface SessionCanvasRequestCompletedAction {
  type: ActionType.SessionCanvasRequestCompleted;
  /** The request being completed. */
  requestId: string;
  /** Success result or failure error — exactly one, by construction. */
  outcome: CanvasRequestOutcome;
}

/**
 * The host abandoned an in-flight request — typically because the targeted
 * provider disconnected or the deadline elapsed. Removes the matching entry
 * from {@link SessionState.canvasRequests} by `requestId`; a no-op when none
 * matches. Server-dispatched only.
 *
 * @category Session Actions
 * @version 1
 */
export interface SessionCanvasRequestCancelledAction {
  type: ActionType.SessionCanvasRequestCancelled;
  /** The request being abandoned. */
  requestId: string;
  /** Why the host gave up. */
  reason: CanvasRequestCancelReason;
}
