/**
 * Per-host supervisor.
 *
 * Owns the current {@link AhpClient}, the reconnect state machine, the
 * per-host root-state mirror, and the session-summary cache. Drives
 * inbound events out to the multi-host fan-in broadcasts.
 *
 * Unlike the Rust port, the supervisor doesn't use an mpsc command
 * channel. JavaScript's single-threaded execution model lets public
 * methods read shared state directly; coordination with the supervisor
 * loop uses {@link AbortController}s for cancel signals (analogous to
 * Rust's `tokio::Notify`).
 *
 * @module client/hosts/runtime
 */

import type { ActionEnvelope } from '../../types/common/actions.js';
import type { URI } from '../../types/common/state.js';
import type { Snapshot } from '../../types/common/state.js';
import type {
  ReconnectResult,
  SubscribeResult,
} from '../../types/common/commands.js';
import { ReconnectResultType } from '../../types/common/commands.js';
import type { ListSessionsResult } from '../../types/channels-root/commands.js';
import type { RootState } from '../../types/channels-root/state.js';
import type { SessionSummary } from '../../types/channels-session/state.js';
import type {
  SessionSummaryChangedParams,
} from '../../types/channels-root/notifications.js';
import { PROTOCOL_VERSION } from '../../types/version/registry.js';
import { AhpClient, type DispatchHandle } from '../client.js';
import type { ClientEvent } from '../events.js';
import { RpcError } from '../error.js';
import type { AsyncBroadcastQueue } from '../async-queue.js';
import { rootReducer } from '../../types/channels-root/reducer.js';
import type { RootAction } from '../../types/action-origin.generated.js';
import type { StateAction } from '../../types/common/actions.js';
import {
  HostNotConnectedError,
  HostShutDownError,
  ROOT_RESOURCE_URI,
  tagClientEvent,
  type HostEvent,
  type HostHandle,
  type HostId,
  type HostState,
  type HostSubscriptionEvent,
  type ResolvedHostConfig,
} from './types.js';
import type { HostClientHandleSource } from './host-client-handle.js';
import {
  attemptsExhausted,
  delayWithJitter,
} from './policy.js';

/**
 * Mutable per-host state read by the runtime, exposed read-only via
 * {@link snapshot} for {@link HostHandle}s and consumed by
 * {@link HostClientHandle}s through {@link HostClientHandleSource}.
 *
 * @internal
 */
export interface HostShared {
  readonly id: HostId;
  readonly label: string;
  clientId: string;
  state: HostState;
  lastError: Error | null;
  lastConnectedAt: number | null;
  protocolVersion: string | null;
  serverSeq: number;
  defaultDirectory: string | null;
  rootState: RootState;
  subscriptions: URI[];
  completionTriggerCharacters: string[];
  sessionSummaries: Map<URI, SessionSummary>;
  generation: number;
  currentClient: AhpClient | null;
  /**
   * Set to `'removed'` by {@link MultiHostClient.removeHost} or
   * `'shutdown'` by a top-level shutdown. Held in the same shared
   * object as `generation` / `currentClient` so generation-checking
   * client handles can also detect a fully removed host.
   */
  shutdownReason: null | 'removed' | 'shutdown';
}

/** Build the initial shared state for a freshly registered host. @internal */
export function makeInitialShared(
  config: ResolvedHostConfig,
  resolvedClientId: string,
): HostShared {
  return {
    id: config.id,
    label: config.label,
    clientId: resolvedClientId,
    state: { status: 'disconnected' },
    lastError: null,
    lastConnectedAt: null,
    protocolVersion: null,
    serverSeq: 0,
    defaultDirectory: null,
    rootState: { agents: [] },
    subscriptions: [...config.initialSubscriptions],
    completionTriggerCharacters: [],
    sessionSummaries: new Map(),
    generation: 0,
    currentClient: null,
    shutdownReason: null,
  };
}

/** Build an immutable {@link HostHandle} snapshot from shared state. @internal */
export function snapshotHandle(shared: HostShared): HostHandle {
  return {
    id: shared.id,
    label: shared.label,
    clientId: shared.clientId,
    state: shared.state,
    lastError: shared.lastError,
    lastConnectedAt: shared.lastConnectedAt,
    protocolVersion: shared.protocolVersion,
    serverSeq: shared.serverSeq,
    defaultDirectory: shared.defaultDirectory,
    agents: [...shared.rootState.agents],
    activeSessions: shared.rootState.activeSessions ?? null,
    terminals: shared.rootState.terminals ? [...shared.rootState.terminals] : null,
    subscriptions: [...shared.subscriptions],
    completionTriggerCharacters: [...shared.completionTriggerCharacters],
    sessionSummaries: Array.from(shared.sessionSummaries.values()),
    generation: shared.generation,
  };
}

// ─── Cancellation helpers ────────────────────────────────────────────────────

/** Sentinel returned by {@link raceWithAbort} when the signal aborts first. */
export const ABORTED = Symbol('aborted');

/**
 * Race a promise against an {@link AbortSignal}. Returns the original
 * promise value on completion, or {@link ABORTED} if the signal aborts
 * first.
 *
 * The inner promise is allowed to keep running; callers must not depend
 * on its side effects after a cancellation. A no-op rejection handler
 * is attached to the inner promise so a late rejection (e.g. an
 * in-flight `client.initialize` that surfaces `ClientClosedError`
 * after the client has been shut down) doesn't become an
 * `unhandledRejection`.
 *
 * @internal
 */
export function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T | typeof ABORTED> {
  // Always attach a rejection handler to the inner promise so a late
  // rejection after the race resolves is observed by the runtime.
  // Using `.then(undefined, noop)` swallows the rejection (the original
  // promise itself remains pending/resolved/rejected as before — this
  // adds a separate observer that V8 sees as "handled").
  promise.then(undefined, () => undefined);
  if (signal.aborted) return Promise.resolve(ABORTED);
  return new Promise<T | typeof ABORTED>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      resolve(ABORTED);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      err => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Sleep `ms` milliseconds, returning early if any of the supplied
 * signals abort. Returns `true` if the sleep elapsed, `false` if any
 * signal aborted first.
 *
 * @internal
 */
export function sleepOrAbort(ms: number, ...signals: AbortSignal[]): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(true);
  if (signals.some(s => s.aborted)) return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const cleanup: Array<() => void> = [];
    const timer = setTimeout(() => {
      for (const fn of cleanup) fn();
      resolve(true);
    }, ms);
    for (const signal of signals) {
      const onAbort = (): void => {
        clearTimeout(timer);
        for (const fn of cleanup) fn();
        resolve(false);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      cleanup.push(() => signal.removeEventListener('abort', onAbort));
    }
  });
}

/** Wait for any of the supplied signals to abort. @internal */
function waitForAbort(...signals: AbortSignal[]): Promise<void> {
  if (signals.some(s => s.aborted)) return Promise.resolve();
  return new Promise<void>(resolve => {
    const cleanup: Array<() => void> = [];
    for (const signal of signals) {
      const onAbort = (): void => {
        for (const fn of cleanup) fn();
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      cleanup.push(() => signal.removeEventListener('abort', onAbort));
    }
  });
}

/**
 * Return an {@link AbortSignal} that aborts whenever any of the supplied
 * input signals aborts, plus a {@link dispose} function that detaches
 * the listeners added to the inputs. Used to thread a single composite
 * signal through the connect/handshake path so the operation bails on
 * either shutdown or manual reconnect.
 *
 * Callers MUST call `dispose()` once the composite signal is no longer
 * needed (typically in a `finally`) — otherwise the listeners attached
 * to long-lived input signals (e.g. a per-runtime `shutdownController`)
 * accumulate across connect cycles.
 *
 * @internal
 */
function linkAbortSignals(...signals: AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  if (signals.some(s => s.aborted)) {
    controller.abort();
    return { signal: controller.signal, dispose: () => undefined };
  }
  const cleanup: Array<() => void> = [];
  const onAbort = (): void => {
    for (const fn of cleanup) fn();
    cleanup.length = 0;
    controller.abort();
  };
  for (const signal of signals) {
    signal.addEventListener('abort', onAbort, { once: true });
    cleanup.push(() => signal.removeEventListener('abort', onAbort));
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const fn of cleanup) fn();
      cleanup.length = 0;
    },
  };
}

// ─── Runtime ─────────────────────────────────────────────────────────────────

const EMPTY_ROOT_STATE: RootState = { agents: [] };

/**
 * Per-host supervisor.
 *
 * Construction sets up shared state and emits the `added` host event;
 * {@link HostRuntime.start} kicks off the connect/reconnect loop. The
 * loop runs until {@link HostRuntime.shutdown} aborts the shutdown
 * controller.
 *
 * @internal
 */
export class HostRuntime {
  private readonly config: ResolvedHostConfig;
  readonly shared: HostShared;
  readonly handleSource: HostClientHandleSource;
  private readonly fanOut: AsyncBroadcastQueue<HostSubscriptionEvent>;
  private readonly hostEvents: AsyncBroadcastQueue<HostEvent>;

  private readonly shutdownController = new AbortController();
  private manualReconnectController = new AbortController();
  private supervisorPromise: Promise<void> | null = null;
  /**
   * Resolved by {@link reconnect} when the manual-reconnect cycle has
   * actually been observed by the supervisor (state transitions to
   * `connecting` / `reconnecting`). Used so external callers see a
   * deterministic completion point.
   */
  private reconnectAck: { promise: Promise<void>; resolve: () => void } | null = null;

  constructor(
    config: ResolvedHostConfig,
    resolvedClientId: string,
    fanOut: AsyncBroadcastQueue<HostSubscriptionEvent>,
    hostEvents: AsyncBroadcastQueue<HostEvent>,
  ) {
    this.config = config;
    this.fanOut = fanOut;
    this.hostEvents = hostEvents;
    this.shared = makeInitialShared(config, resolvedClientId);
    this.handleSource = {
      hostId: this.shared.id,
      generation: this.shared.generation,
      currentClient: this.shared.currentClient,
      shutdownReason: this.shared.shutdownReason,
    };
  }

  /** Start the supervisor. Emits the `added` host event before the first connect. */
  start(): void {
    if (this.supervisorPromise !== null) return;
    this.hostEvents.publish({ type: 'added', hostId: this.shared.id });
    this.supervisorPromise = this.runSupervisor().catch(err => {
      // The supervisor's own errors are surfaced via shared state +
      // host events; this guard prevents an unhandled rejection in the
      // unlikely event of a logic bug.
      // eslint-disable-next-line no-console
      console.error(`HostRuntime[${this.shared.id}] supervisor crashed:`, err);
    });
  }

  /**
   * Request a manual reconnect. The current connection (or pending
   * backoff sleep) is interrupted and the supervisor immediately
   * attempts a fresh connect. Returns when the supervisor has
   * acknowledged the request (state has transitioned).
   */
  async reconnect(): Promise<void> {
    if (this.shared.shutdownReason !== null) {
      // The supervisor is gone; nothing to nudge.
      return;
    }
    const ack = this.reconnectAck ?? this.makeReconnectAck();
    this.reconnectAck = ack;
    this.manualReconnectController.abort();
    await ack.promise;
  }

  /**
   * Tear down the supervisor. Marks the runtime as `removed`, aborts
   * the shutdown controller (which unblocks any in-flight
   * `connectOnce`, sleep, or read loop), and resolves once the
   * supervisor has exited.
   */
  async shutdown(reason: 'removed' | 'shutdown' = 'removed'): Promise<void> {
    if (this.shared.shutdownReason !== null) {
      // Already tearing down.
      if (this.supervisorPromise) await this.supervisorPromise;
      return;
    }
    this.shared.shutdownReason = reason;
    this.handleSource.shutdownReason = reason;
    this.shutdownController.abort();
    // Also wake any reconnect waiter so a pending `reconnect()` call resolves.
    this.reconnectAck?.resolve();
    if (this.supervisorPromise) await this.supervisorPromise;
  }

  /**
   * Subscribe to `uri`, tracking it for re-subscription across
   * reconnects.
   *
   * Throws {@link HostShutDownError} if the host has been permanently
   * torn down (removed or the multi-host client was shut down).
   *
   * Throws {@link HostNotConnectedError} if the host is registered but
   * has no active client connection right now (connecting, reconnecting,
   * disconnected, or failed). The URI is still appended to the local
   * subscription list first, so the next successful (re)connect will
   * subscribe to it automatically.
   */
  async subscribe(uri: URI): Promise<SubscribeResult> {
    if (this.shared.shutdownReason !== null) {
      throw new HostShutDownError(this.shared.id);
    }
    const client = this.shared.currentClient;
    if (!client) {
      this.trackSubscription(uri);
      throw new HostNotConnectedError(this.shared.id);
    }
    const { result } = await client.subscribe(uri);
    this.trackSubscription(uri);
    return result;
  }

  /**
   * Unsubscribe from `uri` and drop it from the local subscription
   * list. No-op if the host has been removed.
   */
  async unsubscribe(uri: URI): Promise<void> {
    if (this.shared.shutdownReason !== null) {
      this.untrackSubscription(uri);
      return;
    }
    const client = this.shared.currentClient;
    this.untrackSubscription(uri);
    if (client) await client.unsubscribe(uri);
  }

  /**
   * Helper: dispatch on the current client (no generation check).
   *
   * Throws {@link HostShutDownError} if the host has been permanently
   * torn down, or {@link HostNotConnectedError} if it's currently
   * disconnected/reconnecting.
   */
  dispatch(
    channel: URI,
    action: StateAction,
    clientSeq?: number,
  ): DispatchHandle {
    if (this.shared.shutdownReason !== null) {
      throw new HostShutDownError(this.shared.id);
    }
    const client = this.shared.currentClient;
    if (!client) throw new HostNotConnectedError(this.shared.id);
    return client.dispatch(channel, action, clientSeq);
  }

  // ─── Supervisor loop ───────────────────────────────────────────────────────

  private async runSupervisor(): Promise<void> {
    const policy = this.config.reconnectPolicy;
    let attempt = 0;
    while (this.shared.shutdownReason === null) {
      attempt += 1;
      this.transitionTo(
        attempt === 1
          ? { status: 'connecting' }
          : { status: 'reconnecting', attempt: attempt - 1 },
        null,
      );
      // Resolve any pending reconnect ack now that the state has moved.
      const pendingAck = this.reconnectAck;
      this.reconnectAck = null;
      pendingAck?.resolve();

      let connection: { client: AhpClient; events: AsyncIterableIterator<ClientEvent> } | null = null;
      try {
        connection = await this.connectOnce();
      } catch (err) {
        if (this.shared.shutdownReason !== null) break;
        // If the in-flight connect was interrupted by a manual reconnect
        // request, skip the backoff and immediately retry with a fresh
        // controller. The error is the deliberate "aborted" sentinel,
        // not a real connect failure, so we don't surface it as
        // `lastError` or log a warning.
        if (this.manualReconnectController.signal.aborted) {
          this.resetManualReconnectController();
          attempt = 0;
          continue;
        }
        const error = toError(err);
        this.shared.lastError = error;
        // eslint-disable-next-line no-console
        console.warn(`HostRuntime[${this.shared.id}] connect attempt ${attempt} failed:`, error);
      }

      if (connection === null) {
        // Connect failed (or was aborted). Decide whether to retry.
        if (this.shared.shutdownReason !== null) break;
        if (attemptsExhausted(policy, attempt)) {
          const error = this.shared.lastError ?? new Error('connect failed');
          this.transitionTo({ status: 'failed', error }, error);
          // Park until manual reconnect or shutdown.
          if (!(await this.waitForManualReconnectOrShutdown())) break;
          // The manual-reconnect controller is currently aborted —
          // reset it so the next iteration's `runConnection` /
          // `sleepOrAbort` don't immediately see a phantom abort.
          this.resetManualReconnectController();
          attempt = 0;
          continue;
        }
        const delay = delayWithJitter(policy, attempt, Math.random());
        if (
          !(await sleepOrAbort(
            delay,
            this.shutdownController.signal,
            this.manualReconnectController.signal,
          ))
        ) {
          if (this.shared.shutdownReason !== null) break;
          // Manual reconnect during backoff — reset attempt and retry now.
          this.resetManualReconnectController();
          attempt = 0;
        }
        continue;
      }

      // Connect succeeded.
      if (policy.resetOnSuccess) attempt = 0;
      const outcome = await this.runConnection(connection.events);
      await this.tearDownClient();

      if (outcome === 'shutdown') break;
      if (outcome === 'manualReconnect') {
        this.resetManualReconnectController();
        attempt = 0;
        continue;
      }
      // 'disconnected' — fall through to the retry/backoff path.
    }

    // Final cleanup. The handle source mirrors shared state already.
    this.handleSource.currentClient = null;
    this.handleSource.generation = this.shared.generation;
  }

  /**
   * Open a transport, negotiate `initialize` or `reconnect`, refresh
   * caches, bump generation, install the client, and transition to
   * `connected`. Returns the connected client and an events iterator
   * that was attached BEFORE the handshake — passing the iterator into
   * {@link runConnection} ensures notifications pushed between the
   * handshake response and the moment we enter the event loop are
   * delivered instead of dropped.
   *
   * Races each await against a combined signal that aborts on either
   * shutdown OR manual reconnect, so an in-flight factory or handshake
   * doesn't block teardown or a user-initiated reconnect. The factory
   * receives the same combined signal so it can bail out internally
   * (matching the {@link HostTransportFactory} contract). The combined
   * signal's listeners are detached in a `finally` so successful
   * connects don't leak listeners on the long-lived shutdown signal.
   */
  private async connectOnce(): Promise<{ client: AhpClient; events: AsyncIterableIterator<ClientEvent> }> {
    const shutdownSignal = this.shutdownController.signal;
    const manualSignal = this.manualReconnectController.signal;
    const link = linkAbortSignals(shutdownSignal, manualSignal);
    const cancelSignal = link.signal;

    try {
      const transportResult = await raceWithAbort(
        this.config.transportFactory(this.shared.id, cancelSignal),
        cancelSignal,
      );
      if (transportResult === ABORTED) {
        throw new Error('connect aborted');
      }
      const transport = transportResult;

      const client = new AhpClient(transport, this.config.clientConfig);
      client.connect();
      // Attach the events stream BEFORE the handshake so any
      // notifications the server pushes between the handshake response
      // and `runConnection` are captured rather than dropped by the
      // broadcast queue's no-replay-for-late-readers behaviour.
      const events = client.events();

      let success = false;
      try {
        const prior = {
          serverSeq: this.shared.serverSeq,
          subscriptions: [...this.shared.subscriptions],
        };
        const canReconnect = prior.serverSeq > 0 && prior.subscriptions.length > 0;

        let reconnectResult: ReconnectResult | null = null;
        let initSnapshots: Snapshot[] | null = null;
        let initServerSeq = prior.serverSeq;
        let initProtocolVersion: string | null = null;
        let initDefaultDirectory: string | null = null;
        let initCompletionTriggers: string[] = [];

        if (canReconnect) {
          try {
            const reconnectRes = await raceWithAbort(
              client.reconnect({
                clientId: this.shared.clientId,
                lastSeenServerSeq: prior.serverSeq,
                subscriptions: prior.subscriptions,
              }),
              cancelSignal,
            );
            if (reconnectRes === ABORTED) throw new Error('reconnect aborted');
            reconnectResult = reconnectRes;
          } catch (err) {
            if (this.shared.shutdownReason !== null) throw err;
            if (cancelSignal.aborted) throw err;
            // Server refused reconnect (likely too much state has
            // elapsed); fall back to initialize. Only RPC-level errors
            // are eligible — transport errors propagate.
            if (!(err instanceof RpcError)) throw err;
            const initResult = await raceWithAbort(
              client.initialize({
                clientId: this.shared.clientId,
                protocolVersions: [PROTOCOL_VERSION],
                initialSubscriptions: prior.subscriptions,
              }),
              cancelSignal,
            );
            if (initResult === ABORTED) throw new Error('initialize aborted');
            initSnapshots = initResult.snapshots;
            initServerSeq = initResult.serverSeq;
            initProtocolVersion = initResult.protocolVersion;
            initDefaultDirectory = initResult.defaultDirectory ?? null;
            initCompletionTriggers = initResult.completionTriggerCharacters ?? [];
          }
        } else {
          const initResult = await raceWithAbort(
            client.initialize({
              clientId: this.shared.clientId,
              protocolVersions: [PROTOCOL_VERSION],
              initialSubscriptions: prior.subscriptions,
            }),
            cancelSignal,
          );
          if (initResult === ABORTED) throw new Error('initialize aborted');
          initSnapshots = initResult.snapshots;
          initServerSeq = initResult.serverSeq;
          initProtocolVersion = initResult.protocolVersion;
          initDefaultDirectory = initResult.defaultDirectory ?? null;
          initCompletionTriggers = initResult.completionTriggerCharacters ?? [];
        }

        // Refresh session summaries. Failures are non-fatal — we keep the
        // cache as-is and the next snapshot/notification will catch up.
        let summaries: ListSessionsResult | null = null;
        try {
          const res = await raceWithAbort(
            client.request('listSessions', {
              channel: ROOT_RESOURCE_URI as 'ahp-root://',
              filter: undefined,
            }),
            cancelSignal,
          );
          if (res !== ABORTED) summaries = res;
        } catch {
          // Tolerate; the connect itself still succeeded.
        }

        if (cancelSignal.aborted) throw new Error('connect aborted');

        // Apply replay envelopes BEFORE transitioning to `connected` so
        // consumers observing the `connected` host event already see the
        // catch-up applied to state and event streams.
        let postReplaySubscriptions: string[] | null = null;
        const replayEnvelopes: ActionEnvelope[] = [];
        let snapshotPrunedSubscriptions: string[] | null = null;

        if (reconnectResult !== null) {
          if (reconnectResult.type === ReconnectResultType.Replay) {
            for (const env of reconnectResult.actions) replayEnvelopes.push(env);
            if (reconnectResult.missing.length > 0) {
              const missing = new Set<string>(reconnectResult.missing);
              postReplaySubscriptions = this.shared.subscriptions.filter(u => !missing.has(u));
            }
          } else {
            // Snapshot variant: refresh root state from the matching
            // snapshot, then drop subscriptions that were in prior set
            // but are absent from the returned snapshot list.
            const surviving = new Set<string>(reconnectResult.snapshots.map(s => s.resource));
            const priorSet = new Set<string>(prior.subscriptions);
            snapshotPrunedSubscriptions = this.shared.subscriptions.filter(
              u => surviving.has(u) || !priorSet.has(u),
            );
            for (const snap of reconnectResult.snapshots) {
              if (snap.fromSeq > initServerSeq) initServerSeq = snap.fromSeq;
              if (snap.resource === ROOT_RESOURCE_URI) {
                this.shared.rootState = (snap.state as RootState) ?? EMPTY_ROOT_STATE;
              }
            }
          }
        }

        // Commit shared state.
        this.shared.generation += 1;
        this.shared.currentClient = client;
        this.shared.lastConnectedAt = Date.now();
        this.shared.lastError = null;
        if (this.shared.serverSeq < initServerSeq) {
          this.shared.serverSeq = initServerSeq;
        }
        if (initSnapshots !== null) {
          const rootSnap = initSnapshots.find(s => s.resource === ROOT_RESOURCE_URI);
          if (rootSnap) this.shared.rootState = (rootSnap.state as RootState) ?? EMPTY_ROOT_STATE;
          if (initProtocolVersion) this.shared.protocolVersion = initProtocolVersion;
          this.shared.defaultDirectory = initDefaultDirectory;
          this.shared.completionTriggerCharacters = [...initCompletionTriggers];
        }
        if (summaries !== null) {
          this.shared.sessionSummaries.clear();
          for (const s of summaries.items) this.shared.sessionSummaries.set(s.resource, s);
        }
        if (postReplaySubscriptions !== null) {
          this.shared.subscriptions = postReplaySubscriptions;
        } else if (snapshotPrunedSubscriptions !== null) {
          this.shared.subscriptions = snapshotPrunedSubscriptions;
        }

        // Mirror the new generation + client into the shared handle source.
        this.handleSource.generation = this.shared.generation;
        this.handleSource.currentClient = client;

        // Replay missed envelopes through state mirror and fan-out.
        for (const env of replayEnvelopes) {
          this.applyEnvelopeLocally(env);
          this.fanOut.publish({
            hostId: this.shared.id,
            channel: env.channel,
            event: { type: 'action', params: env },
          });
        }

        // Now transition to connected and emit the connected host event.
        this.transitionTo({ status: 'connected' }, null);
        this.hostEvents.publish({
          type: 'connected',
          hostId: this.shared.id,
          generation: this.shared.generation,
        });

        success = true;
        return { client, events };
      } finally {
        if (!success) {
          // Connect failed mid-flight — shut the half-built client down so
          // we don't leak the transport.
          try {
            await client.shutdown();
          } catch {
            // best-effort
          }
        }
      }
    } finally {
      // Detach the abort listeners we attached to the long-lived
      // shutdown / manual-reconnect signals so successful connects
      // don't accumulate listeners across reconnect cycles.
      link.dispose();
    }
  }

  /**
   * Drain the connected client's event stream until it ends, the
   * shutdown signal aborts, or a manual reconnect is requested.
   */
  private async runConnection(
    events: AsyncIterableIterator<ClientEvent>,
  ): Promise<'shutdown' | 'manualReconnect' | 'disconnected'> {
    const shutdownSignal = this.shutdownController.signal;
    const manualSignal = this.manualReconnectController.signal;

    while (true) {
      if (shutdownSignal.aborted) return 'shutdown';
      if (manualSignal.aborted) return 'manualReconnect';

      const nextPromise = events.next();
      const aborted = waitForAbort(shutdownSignal, manualSignal);
      const result = await Promise.race([
        nextPromise.then(value => ({ kind: 'event' as const, value })),
        aborted.then(() => ({ kind: 'aborted' as const })),
      ]);

      if (result.kind === 'aborted') {
        if (shutdownSignal.aborted) return 'shutdown';
        return 'manualReconnect';
      }
      const ev = result.value;
      if (ev.done) return 'disconnected';
      this.handleEvent(ev.value);
    }
  }

  /** Park until a manual reconnect or shutdown wakes us up. */
  private async waitForManualReconnectOrShutdown(): Promise<boolean> {
    await waitForAbort(this.shutdownController.signal, this.manualReconnectController.signal);
    return !this.shutdownController.signal.aborted;
  }

  private async tearDownClient(): Promise<void> {
    const prev = this.shared.currentClient;
    this.shared.currentClient = null;
    this.handleSource.currentClient = null;
    if (prev) {
      try {
        await prev.shutdown();
      } catch {
        // best-effort
      }
    }
  }

  private handleEvent(event: ClientEvent): void {
    // Update local mirrors before fanning out so consumers observing
    // the next snapshot see the result of this event.
    switch (event.event.type) {
      case 'action':
        this.applyEnvelopeLocally(event.event.params);
        break;
      case 'sessionAdded': {
        const summary = event.event.params.summary;
        this.shared.sessionSummaries.set(summary.resource, summary);
        break;
      }
      case 'sessionRemoved':
        this.shared.sessionSummaries.delete(event.event.params.session);
        break;
      case 'sessionSummaryChanged':
        applySummaryChange(this.shared.sessionSummaries, event.event.params);
        break;
      case 'authRequired':
        // No cache update; consumers observe via the event stream.
        break;
    }
    this.fanOut.publish(tagClientEvent(this.shared.id, event));
  }

  private applyEnvelopeLocally(envelope: ActionEnvelope): void {
    if (envelope.serverSeq > this.shared.serverSeq) {
      this.shared.serverSeq = envelope.serverSeq;
    }
    if (envelope.channel === ROOT_RESOURCE_URI) {
      this.shared.rootState = rootReducer(this.shared.rootState, envelope.action as RootAction);
    }
    // Non-root channels: leave the rooted root-state mirror untouched
    // (per-session / per-terminal mirrors are intentionally not
    // duplicated here — consumers feed those through
    // MultiHostStateMirror or their own store).
  }

  private trackSubscription(uri: URI): void {
    if (!this.shared.subscriptions.includes(uri)) {
      this.shared.subscriptions.push(uri);
    }
  }

  private untrackSubscription(uri: URI): void {
    this.shared.subscriptions = this.shared.subscriptions.filter(u => u !== uri);
  }

  private transitionTo(state: HostState, lastError: Error | null): void {
    this.shared.state = state;
    if (lastError !== null) this.shared.lastError = lastError;
    this.hostEvents.publish({
      type: 'stateChanged',
      hostId: this.shared.id,
      state,
      lastError: lastError ?? this.shared.lastError,
    });
  }

  private resetManualReconnectController(): void {
    this.manualReconnectController = new AbortController();
  }

  private makeReconnectAck(): { promise: Promise<void>; resolve: () => void } {
    let resolveFn!: () => void;
    const promise = new Promise<void>(resolve => {
      resolveFn = resolve;
    });
    return { promise, resolve: resolveFn };
  }
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function applySummaryChange(
  cache: Map<URI, SessionSummary>,
  params: SessionSummaryChangedParams,
): void {
  const existing = cache.get(params.session);
  if (!existing) return;
  const merged: SessionSummary = { ...existing };
  const changes = params.changes;
  if (changes.title !== undefined) merged.title = changes.title;
  if (changes.status !== undefined) merged.status = changes.status;
  if (changes.activity !== undefined) merged.activity = changes.activity;
  if (changes.modifiedAt !== undefined) merged.modifiedAt = changes.modifiedAt;
  if (changes.project !== undefined) merged.project = changes.project;
  if (changes.workingDirectory !== undefined) merged.workingDirectory = changes.workingDirectory;
  if (changes._meta !== undefined) merged._meta = changes._meta;
  cache.set(params.session, merged);
}
