/**
 * Public-facing types for the multi-host SDK.
 *
 * @module client/hosts/types
 */

import type { URI } from '../../types/common/state.js';
import type { AgentInfo } from '../../types/channels-root/state.js';
import type { TerminalInfo } from '../../types/channels-terminal/state.js';
import type { SessionSummary } from '../../types/channels-session/state.js';
import type { AutomationCapabilities } from '../../types/common/commands.js';
import type { ClientEvent, SubscriptionEvent } from '../events.js';
import { AhpClientError } from '../error.js';
import type { ClientIdStore } from './client-id-store.js';
import type { HostTransportFactory } from './factory.js';
import { defaultReconnectPolicy, type ReconnectPolicy } from './policy.js';
import type { AhpClientConfig } from '../client.js';

/**
 * Opaque, consumer-supplied identifier for a host registered with
 * {@link MultiHostClient}.
 *
 * Surface-level alias for `string`; equality is `===`. Used as the
 * routing key for commands and the tag on every
 * {@link HostSubscriptionEvent}.
 */
export type HostId = string;

/** Connection state for a single host. */
export type HostState =
  | { readonly status: 'disconnected' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | {
      readonly status: 'reconnecting';
      /** One-based attempt counter. Resets to 1 after a successful connection when {@link ReconnectPolicy.resetOnSuccess} is `true`. */
      readonly attempt: number;
    }
  | {
      readonly status: 'failed';
      /** Most recent failure that drove the host into this state. */
      readonly error: Error;
    };

/**
 * Convenience predicate: is the host currently connected?
 */
export function isConnected(state: HostState): boolean {
  return state.status === 'connected';
}

/**
 * Convenience predicate: is the host in a terminal failure state?
 */
export function isFailed(state: HostState): boolean {
  return state.status === 'failed';
}

/**
 * Configuration for a single host registered with {@link MultiHostClient}.
 *
 * Use the bare-minimum form (`{ id, label, transportFactory }`) for the
 * common case; the optional fields cover advanced scenarios.
 *
 * `clientId` is intentionally optional. When omitted, the multi-host
 * client resolves it at `addHost` time:
 *
 * 1. If a {@link ClientIdStore} entry already exists for this host, it
 *    is reused.
 * 2. Otherwise, a fresh UUID-shaped id is generated and persisted.
 *
 * Setting `clientId` explicitly always wins over a stored value and is
 * persisted into the store so subsequent launches transparently reuse it.
 */
export interface HostConfig {
  /** Stable host identifier. */
  readonly id: HostId;
  /** Human-readable label. Surfaced through {@link HostHandle.label}. */
  readonly label: string;
  /** Optional explicit `clientId` to send on `initialize` / `reconnect`. */
  readonly clientId?: string;
  /**
   * URIs to include in the `initialize` handshake. Defaults to
   * `['ahp-root://']` so root state is always tracked.
   */
  readonly initialSubscriptions?: readonly URI[];
  /** Configuration forwarded to the underlying {@link AhpClient}. */
  readonly clientConfig?: AhpClientConfig;
  /** Factory used to (re-)open a transport for this host. */
  readonly transportFactory: HostTransportFactory;
  /** Reconnect behaviour after an unexpected drop. */
  readonly reconnectPolicy?: ReconnectPolicy;
}

/**
 * Resolved (defaulted) form of {@link HostConfig} used internally. All
 * optional fields have their defaults filled in.
 *
 * @internal
 */
export interface ResolvedHostConfig {
  readonly id: HostId;
  readonly label: string;
  readonly clientId: string | null;
  readonly initialSubscriptions: readonly URI[];
  readonly clientConfig: AhpClientConfig;
  readonly transportFactory: HostTransportFactory;
  readonly reconnectPolicy: ReconnectPolicy;
}

/** The protocol's root channel URI. */
export const ROOT_RESOURCE_URI: URI = 'ahp-root://';

/**
 * Apply defaults to a {@link HostConfig}, including the default
 * `['ahp-root://']` subscription and the default reconnect policy.
 *
 * @internal
 */
export function resolveConfig(config: HostConfig): ResolvedHostConfig {
  return {
    id: config.id,
    label: config.label,
    clientId: config.clientId ?? null,
    initialSubscriptions: config.initialSubscriptions
      ? [...config.initialSubscriptions]
      : [ROOT_RESOURCE_URI],
    clientConfig: config.clientConfig ?? {},
    transportFactory: config.transportFactory,
    reconnectPolicy: config.reconnectPolicy ?? defaultReconnectPolicy(),
  };
}

/**
 * Snapshot of everything {@link MultiHostClient} knows about a single
 * host: connection state, last error, protocol version, mirrored root
 * fields, subscribed URIs, cached session summaries, generation counter.
 *
 * Cheap to clone — fields are primitives or shallow-cloned arrays.
 * Treat snapshots as immutable: they aren't deeply frozen, but the
 * supervisor never mutates them after construction, and any field you
 * care about should be re-read by taking a fresh snapshot via
 * {@link MultiHostClient.host} or {@link MultiHostClient.hosts}, or by
 * listening to {@link MultiHostClient.hostEvents}.
 */
export interface HostHandle {
  /** Stable identifier. */
  readonly id: HostId;
  /** Human-readable label from the original {@link HostConfig}. */
  readonly label: string;
  /** `clientId` actually sent to the host on `initialize`/`reconnect`. */
  readonly clientId: string;
  /** Current connection state. */
  readonly state: HostState;
  /**
   * Most recent failure that drove the host into a non-connected state.
   * Set when the supervisor enters `reconnecting` or `failed`. Cleared on
   * a successful connect.
   */
  readonly lastError: Error | null;
  /**
   * Wall-clock time of the most recent successful `initialize` or
   * `reconnect`. `null` until the host first connects. Milliseconds
   * since the Unix epoch.
   */
  readonly lastConnectedAt: number | null;
  /** Protocol version negotiated on the most recent successful `initialize`. */
  readonly protocolVersion: string | null;
  /** Highest `serverSeq` observed on this host. */
  readonly serverSeq: number;
  /** Optional `defaultDirectory` from the host's `InitializeResult`. */
  readonly defaultDirectory: string | null;
  /** Automation support advertised by the host. */
  readonly automations: AutomationCapabilities | null;
  /** Agents currently advertised by the host (mirrored from root state). */
  readonly agents: readonly AgentInfo[];
  /** Active session count from root state, when present. */
  readonly activeSessions: number | null;
  /** Lightweight terminal listing from root state, when present. */
  readonly terminals: readonly TerminalInfo[] | null;
  /** URIs the supervisor will (re-)subscribe to across reconnects. */
  readonly subscriptions: readonly URI[];
  /** Trigger characters from `InitializeResult.completionTriggerCharacters`. */
  readonly completionTriggerCharacters: readonly string[];
  /**
   * Cached session summaries seeded by `listSessions` after each
   * connect and kept fresh by
   * `root/sessionAdded`/`Removed`/`SummaryChanged` notifications.
   */
  readonly sessionSummaries: readonly SessionSummary[];
  /**
   * Generation counter — bumped on every `connect` or `reconnect`.
   * Held by {@link HostClientHandle}s to detect connections that have
   * been replaced beneath them.
   */
  readonly generation: number;
}

/** Connection-level event for UX. */
export type HostEvent =
  | { readonly type: 'added'; readonly hostId: HostId }
  | {
      readonly type: 'stateChanged';
      readonly hostId: HostId;
      readonly state: HostState;
      /** Last error, when transitioning into `reconnecting` or `failed`. */
      readonly lastError: Error | null;
    }
  | {
      readonly type: 'connected';
      readonly hostId: HostId;
      /** Generation the new connection lives on. */
      readonly generation: number;
    }
  | { readonly type: 'removed'; readonly hostId: HostId };

/**
 * Inbound event tagged with host of origin.
 *
 * Delivered by {@link MultiHostClient.events}. The `channel` field
 * carries the URI the event is scoped to (the envelope's `channel` for
 * actions, the notification params' `channel` for protocol
 * notifications).
 */
export interface HostSubscriptionEvent {
  /** Host that produced the event. */
  readonly hostId: HostId;
  /** Channel URI this event was scoped to. */
  readonly channel: URI;
  /** The underlying {@link SubscriptionEvent}. */
  readonly event: SubscriptionEvent;
}

/** @internal */
export function tagClientEvent(hostId: HostId, event: ClientEvent): HostSubscriptionEvent {
  return { hostId, channel: event.channel, event: event.event };
}

/**
 * Aggregated session summary tagged with host of origin.
 *
 * Returned by {@link MultiHostClient.aggregatedSessions}. URIs are
 * per-host scoped, so two hosts can legitimately return the same
 * `summary.resource`; consumers should treat `(hostId, summary.resource)`
 * as the compound key.
 */
export interface HostedSessionSummary {
  /** Host the summary belongs to. */
  readonly hostId: HostId;
  /** Host label at the time the snapshot was taken. */
  readonly hostLabel: string;
  /** Underlying summary. */
  readonly summary: SessionSummary;
}

/**
 * Aggregated agent descriptor tagged with host of origin.
 *
 * Returned by {@link MultiHostClient.aggregatedAgents}.
 */
export interface HostedAgent {
  /** Host the agent belongs to. */
  readonly hostId: HostId;
  /** Host label at the time the snapshot was taken. */
  readonly hostLabel: string;
  /** Underlying agent metadata. */
  readonly agent: AgentInfo;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Base class for every error thrown by the multi-host SDK layer that
 * isn't already an {@link AhpClientError} (RPC failures, transport
 * errors, etc. still surface from the underlying {@link AhpClient}
 * unmodified).
 *
 * Extends {@link AhpClientError} so consumers can catch every multi-host
 * SDK error with a single `instanceof` check.
 */
export class HostMultiError extends AhpClientError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HostMultiError';
  }
}

/** No host with that id is currently registered. */
export class UnknownHostError extends HostMultiError {
  readonly hostId: HostId;

  constructor(hostId: HostId) {
    super(`no host registered with id "${hostId}"`);
    this.name = 'UnknownHostError';
    this.hostId = hostId;
  }
}

/**
 * A host with this id is already registered. Remove the existing host
 * first if you want to replace it.
 */
export class DuplicateHostError extends HostMultiError {
  readonly hostId: HostId;

  constructor(hostId: HostId) {
    super(`a host with id "${hostId}" is already registered`);
    this.name = 'DuplicateHostError';
    this.hostId = hostId;
  }
}

/**
 * The {@link HostClientHandle} was issued for a connection that has
 * since been replaced by a reconnect. Acquire a fresh handle via
 * {@link MultiHostClient.client}.
 *
 * Both generations are reported so consumers can log a clean "stale
 * handle at gen N, host is now gen M" breadcrumb and retry against the
 * fresh handle.
 */
export class HostReconnectedError extends HostMultiError {
  readonly hostId: HostId;
  /** Generation the stale handle was minted at. */
  readonly handleGeneration: number;
  /** Generation the host is currently on. */
  readonly currentGeneration: number;

  constructor(hostId: HostId, handleGeneration: number, currentGeneration: number) {
    super(
      `host "${hostId}" reconnected (generation ${handleGeneration} -> ${currentGeneration}); request a fresh client handle`,
    );
    this.name = 'HostReconnectedError';
    this.hostId = hostId;
    this.handleGeneration = handleGeneration;
    this.currentGeneration = currentGeneration;
  }
}

/**
 * The host's runtime has been torn down — the host was removed via
 * {@link MultiHostClient.removeHost} or the entire {@link MultiHostClient}
 * was shut down. This is a **permanent** failure; the host is not
 * coming back. Use {@link HostNotConnectedError} to distinguish the
 * transient "registered but currently disconnected/reconnecting" case.
 */
export class HostShutDownError extends HostMultiError {
  readonly hostId: HostId;

  constructor(hostId: HostId) {
    super(`host "${hostId}" runtime is no longer active`);
    this.name = 'HostShutDownError';
    this.hostId = hostId;
  }
}

/**
 * The host is registered but has no active client connection right now
 * (the supervisor is `connecting`, `reconnecting`, `disconnected`, or
 * `failed`). This is **recoverable**: the supervisor will keep retrying
 * per its {@link ReconnectPolicy}, or the caller can force a fresh
 * attempt via {@link MultiHostClient.reconnectHost}. Subscriptions
 * issued in this state are still tracked locally and replayed on the
 * next successful connect.
 *
 * Use {@link HostShutDownError} to distinguish permanent teardown.
 */
export class HostNotConnectedError extends HostMultiError {
  readonly hostId: HostId;

  constructor(hostId: HostId) {
    super(`host "${hostId}" is not currently connected`);
    this.name = 'HostNotConnectedError';
    this.hostId = hostId;
  }
}

/**
 * The configured {@link ClientIdStore} failed to load or persist a
 * host's `clientId`.
 *
 * Surfaced from {@link MultiHostClient.addHost} when the underlying
 * store I/O fails (e.g. a file-backed store can't write its directory).
 */
export class ClientIdStoreError extends HostMultiError {
  readonly hostId: HostId;

  constructor(hostId: HostId, message: string, options?: { cause?: unknown }) {
    super(`client id store error for host "${hostId}": ${message}`, options);
    this.name = 'ClientIdStoreError';
    this.hostId = hostId;
  }
}

// ─── ID generation ───────────────────────────────────────────────────────────

/**
 * Generate a fresh UUID-shaped `clientId`. Prefers
 * `crypto.randomUUID()` (Node 19+, modern browsers); falls back to
 * `crypto.getRandomValues()` for the 16 random bytes when only that is
 * available (older browsers / non-secure contexts); and only falls
 * back to `Math.random()` as a last resort for environments where no
 * Web Crypto API is exposed at all.
 *
 * @internal
 */
export function generateClientId(): string {
  const cryptoObj = (globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
    };
  }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    // Last-resort fallback. `Math.random()` is not cryptographically
    // strong, but consumers that need cross-launch identity should
    // persist the value through a ClientIdStore anyway.
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  const h = Array.from(bytes, hex).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
