/**
 * `MultiHostClient` façade.
 *
 * @module client/hosts/multi
 */

import type { URI } from '../../types/common/state.js';
import type { StateAction } from '../../types/common/actions.js';
import type { SubscribeResult } from '../../types/common/commands.js';
import type { DispatchHandle } from '../client.js';
import { AsyncBroadcastQueue } from '../async-queue.js';
import { HostClientHandle } from './host-client-handle.js';
import {
  ClientIdStoreError,
  DuplicateHostError,
  generateClientId,
  HostShutDownError,
  resolveConfig,
  type HostConfig,
  type HostEvent,
  type HostHandle,
  type HostId,
  type HostSubscriptionEvent,
  type HostedAgent,
  type HostedSessionSummary,
} from './types.js';
import { isConnected, isFailed, UnknownHostError } from './types.js';
import { HostRuntime, snapshotHandle } from './runtime.js';
import {
  InMemoryClientIdStore,
  type ClientIdStore,
} from './client-id-store.js';

const DEFAULT_EVENT_BUFFER = 1024;

/**
 * Concurrent registry of {@link HostHandle}s plus the supervisor tasks
 * that drive them.
 *
 * Cheap to clone — the inner state is reference-shared, so multiple UI
 * layers can hold their own reference and observe the same hosts.
 *
 * Common entry points:
 *
 * - {@link MultiHostClient.single} — one-line single-host constructor.
 * - {@link MultiHostClient.addHost} / {@link MultiHostClient.removeHost}.
 * - {@link MultiHostClient.events} / {@link MultiHostClient.hostEvents}.
 * - {@link MultiHostClient.aggregatedSessions} / {@link MultiHostClient.aggregatedAgents}.
 * - {@link MultiHostClient.reconnectAllUnavailable}.
 */
export class MultiHostClient {
  private readonly hosts = new Map<HostId, HostRuntime>();
  /**
   * Host ids currently mid-`addHost` (between the duplicate check and
   * the supervisor install). Keeps concurrent `addHost` calls for the
   * same id from both passing the duplicate check while one of them is
   * awaiting the {@link ClientIdStore}.
   */
  private readonly pendingHostIds = new Set<HostId>();
  private readonly fanOut: AsyncBroadcastQueue<HostSubscriptionEvent>;
  private readonly hostEventsQueue: AsyncBroadcastQueue<HostEvent>;
  private readonly clientIdStore: ClientIdStore;
  /**
   * Aborted by {@link shutdown}. Passed into {@link ClientIdStore.load}
   * / {@link ClientIdStore.store} so slow store implementations can
   * bail out on shutdown — honouring the cancellation contract
   * documented on {@link ClientIdStore}.
   */
  private readonly shutdownController = new AbortController();
  private shutDown = false;

  /**
   * Build an empty multi-host client.
   *
   * @param options.clientIdStore Persistent store for stable per-host
   *   `clientId`s. Defaults to {@link InMemoryClientIdStore} which is
   *   session-stable only — provide your own (Keychain, `localStorage`,
   *   IndexedDB, Node `fs`, …) for cross-launch identity.
   * @param options.eventBuffer Buffer size for the cross-host fan-in
   *   broadcasts. Slow consumers that lag past this many events drop
   *   the gap, mirroring {@link AhpClient.events}. Default `1024`.
   */
  constructor(options: { clientIdStore?: ClientIdStore; eventBuffer?: number } = {}) {
    this.clientIdStore = options.clientIdStore ?? new InMemoryClientIdStore();
    const buffer = options.eventBuffer ?? DEFAULT_EVENT_BUFFER;
    this.fanOut = new AsyncBroadcastQueue<HostSubscriptionEvent>(buffer);
    this.hostEventsQueue = new AsyncBroadcastQueue<HostEvent>(buffer);
  }

  /**
   * Convenience: construct a multi-host client with a single host
   * already registered, and return its initial {@link HostHandle}
   * snapshot. The handle reflects the host at the moment `addHost`
   * resolves — if the connect attempt is fast it may already be
   * `connected`, otherwise it may still be `connecting`.
   *
   * Designed so single-host consumers don't have to think about
   * registry concepts — `const { multi, host } = await MultiHostClient.single({ ... });`
   * is the whole onboarding.
   */
  static async single(
    config: HostConfig,
    options: { clientIdStore?: ClientIdStore; eventBuffer?: number } = {},
  ): Promise<{ multi: MultiHostClient; host: HostHandle }> {
    const multi = new MultiHostClient(options);
    const host = await multi.addHost(config);
    return { multi, host };
  }

  /**
   * Register a new host and start its supervisor.
   *
   * The supervisor immediately attempts to open a transport via
   * {@link HostConfig.transportFactory}, complete the `initialize`
   * handshake, and start fanning events. The returned snapshot reflects
   * the host's state at the moment this call returns — it may already
   * be `connected`, still `connecting`, or already `reconnecting` if
   * the first attempt failed.
   *
   * `clientId` is resolved here, before the supervisor is spawned:
   * `HostConfig.clientId` (if set) always wins, otherwise the
   * configured {@link ClientIdStore} is consulted; if it returns no
   * value a fresh UUID is generated. The resolved id is always written
   * back into the store.
   *
   * Throws {@link DuplicateHostError} if the host id is already in use
   * (or is currently being added by a concurrent caller).
   *
   * Throws {@link ClientIdStoreError} if the configured store fails to
   * load or persist the host's `clientId`.
   *
   * Throws {@link HostShutDownError} if the multi-host client has been
   * shut down — either before this call or while it was awaiting the
   * {@link ClientIdStore}. The pending-id reservation is always cleared
   * before returning, regardless of which error path is taken.
   */
  async addHost(config: HostConfig): Promise<HostHandle> {
    this.assertOpen();
    const id = config.id;
    if (this.hosts.has(id) || this.pendingHostIds.has(id)) {
      throw new DuplicateHostError(id);
    }
    this.pendingHostIds.add(id);

    try {
      const resolved = resolveConfig(config);
      const clientId = await this.resolveClientId(id, resolved.clientId);
      // Defensive re-checks after the store await:
      //  - `shutdown()` may have closed the client while we awaited the
      //    store. Surfacing the same error as `assertOpen` keeps the
      //    post-shutdown guarantee that future operations throw.
      //  - A concurrent removeHost+addHost could have landed a runtime
      //    under our id, which would clobber it if we proceeded.
      this.assertOpen();
      if (this.hosts.has(id)) {
        throw new DuplicateHostError(id);
      }
      const runtime = new HostRuntime(resolved, clientId, this.fanOut, this.hostEventsQueue);
      this.hosts.set(id, runtime);
      runtime.start();
      return snapshotHandle(runtime.shared);
    } finally {
      this.pendingHostIds.delete(id);
    }
  }

  /**
   * Remove a host, cancelling its supervisor and dropping the current
   * connection. Outstanding {@link HostClientHandle}s for this host
   * start throwing {@link HostShutDownError} once the runtime has
   * finished tearing down.
   *
   * Throws {@link UnknownHostError} if `id` is not registered.
   */
  async removeHost(id: HostId): Promise<void> {
    const runtime = this.hosts.get(id);
    if (!runtime) throw new UnknownHostError(id);
    this.hosts.delete(id);
    await runtime.shutdown('removed');
    this.hostEventsQueue.publish({ type: 'removed', hostId: id });
  }

  /**
   * Trigger a manual reconnect for `id`. Cancels the current connection
   * (or pending backoff sleep) and immediately attempts a fresh
   * connect.
   */
  async reconnectHost(id: HostId): Promise<void> {
    const runtime = this.hosts.get(id);
    if (!runtime) throw new UnknownHostError(id);
    await runtime.reconnect();
  }

  /**
   * Trigger a manual reconnect on every registered host that is
   * **not** currently `connected` or `connecting` — i.e. hosts in
   * `disconnected`, `reconnecting`, or `failed`. Hosts already
   * connected (or actively connecting) are skipped.
   *
   * Designed for the mobile scene-phase pattern: when the app returns
   * from background, call this to wake every host the user has been
   * away from instead of writing the loop in every consumer. Useful in
   * particular for `failed` hosts whose reconnect policy is exhausted —
   * a manual reconnect bypasses the policy and starts a fresh attempt.
   *
   * Reconnect requests are dispatched concurrently. Per-host errors
   * are collected into the returned map; the call itself never throws.
   */
  async reconnectAllUnavailable(): Promise<Map<HostId, Error>> {
    const targets: Array<{ id: HostId; runtime: HostRuntime }> = [];
    for (const [id, runtime] of this.hosts) {
      const status = runtime.shared.state.status;
      if (status === 'connected' || status === 'connecting') continue;
      targets.push({ id, runtime });
    }
    if (targets.length === 0) return new Map();
    const errors = new Map<HostId, Error>();
    await Promise.all(
      targets.map(async ({ id, runtime }) => {
        try {
          await runtime.reconnect();
        } catch (err) {
          errors.set(id, err instanceof Error ? err : new Error(String(err)));
        }
      }),
    );
    return errors;
  }

  /**
   * Snapshot the current state of `id`. Returns `undefined` if the
   * host is not registered.
   */
  host(id: HostId): HostHandle | undefined {
    const runtime = this.hosts.get(id);
    return runtime ? snapshotHandle(runtime.shared) : undefined;
  }

  /** Snapshot every registered host. Order is insertion order. */
  hostsSnapshot(): HostHandle[] {
    return Array.from(this.hosts.values(), r => snapshotHandle(r.shared));
  }

  /**
   * Acquire a generation-checked client handle for `id`.
   *
   * Returns `undefined` if the host is not registered or has no live
   * connection. The returned handle refuses to dispatch through a
   * connection that has been replaced by a reconnect — request a fresh
   * handle in that case.
   */
  client(id: HostId): HostClientHandle | undefined {
    const runtime = this.hosts.get(id);
    if (!runtime) return undefined;
    const client = runtime.shared.currentClient;
    if (!client) return undefined;
    return new HostClientHandle(runtime.handleSource, runtime.shared.generation, client);
  }

  /** Convenience: subscribe to `uri` on `hostId`. */
  async subscribe(hostId: HostId, uri: URI): Promise<SubscribeResult> {
    const runtime = this.hosts.get(hostId);
    if (!runtime) throw new UnknownHostError(hostId);
    return runtime.subscribe(uri);
  }

  /** Convenience: unsubscribe from `uri` on `hostId`. */
  async unsubscribe(hostId: HostId, uri: URI): Promise<void> {
    const runtime = this.hosts.get(hostId);
    if (!runtime) throw new UnknownHostError(hostId);
    await runtime.unsubscribe(uri);
  }

  /** Convenience: dispatch `action` on `channel` against `hostId`. */
  dispatch(
    hostId: HostId,
    channel: URI,
    action: StateAction,
    clientSeq?: number,
  ): DispatchHandle {
    const runtime = this.hosts.get(hostId);
    if (!runtime) throw new UnknownHostError(hostId);
    return runtime.dispatch(channel, action, clientSeq);
  }

  /**
   * Subscribe to a fan-in stream of every inbound event from every
   * registered host. Each call returns a fresh independent iterator —
   * multiple consumers can listen independently.
   *
   * Events buffered before the iterator was created are not replayed;
   * iterators start at the next event. Slow consumers that lag past
   * the buffer (default 1024) skip the gap, matching {@link AhpClient.events}.
   */
  events(): AsyncIterableIterator<HostSubscriptionEvent> {
    return this.fanOut.reader();
  }

  /** Subscribe to connection-state events for UX. Each call returns a fresh iterator. */
  hostEvents(): AsyncIterableIterator<HostEvent> {
    return this.hostEventsQueue.reader();
  }

  /**
   * Aggregated session summaries across every registered host, sorted
   * by `summary.modifiedAt` descending. Includes both the host id and
   * label so consumers can render a unified inbox without losing host
   * attribution.
   */
  aggregatedSessions(): HostedSessionSummary[] {
    const out: HostedSessionSummary[] = [];
    for (const runtime of this.hosts.values()) {
      const { id, label, sessionSummaries } = runtime.shared;
      for (const summary of sessionSummaries.values()) {
        out.push({ hostId: id, hostLabel: label, summary });
      }
    }
    // Sort modifiedAt descending. `modifiedAt` is an ISO 8601 timestamp, which
    // sorts chronologically under lexicographic comparison. Stable across ties
    // because Array.sort in modern engines (Node ≥ 12, modern browsers) is stable.
    out.sort((a, b) => (a.summary.modifiedAt < b.summary.modifiedAt ? 1 : a.summary.modifiedAt > b.summary.modifiedAt ? -1 : 0));
    return out;
  }

  /**
   * Aggregated agents across every registered host, in registration
   * order per host.
   */
  aggregatedAgents(): HostedAgent[] {
    const out: HostedAgent[] = [];
    for (const runtime of this.hosts.values()) {
      const { id, label, rootState } = runtime.shared;
      for (const agent of rootState.agents) {
        out.push({ hostId: id, hostLabel: label, agent });
      }
    }
    return out;
  }

  /**
   * Gracefully shut down every host and tear down the internal event
   * fan-in queues. Idempotent.
   *
   * After `shutdown` resolves, subsequent calls to `addHost` /
   * `reconnectHost` / `dispatch` / `subscribe` throw, and active event
   * iterators see end-of-stream.
   */
  async shutdown(): Promise<void> {
    if (this.shutDown) return;
    this.shutDown = true;
    // Abort the shutdown signal first so any in-flight ClientIdStore
    // operations (started from `addHost` / `resolveClientId`) bail out
    // before we wait on the host supervisors.
    this.shutdownController.abort();
    const runtimes = Array.from(this.hosts.values());
    this.hosts.clear();
    await Promise.all(runtimes.map(r => r.shutdown('shutdown')));
    this.fanOut.close();
    this.hostEventsQueue.close();
  }

  private assertOpen(): void {
    if (this.shutDown) throw new HostShutDownError('<multi-host client>');
  }

  private async resolveClientId(hostId: HostId, explicit: string | null): Promise<string> {
    const signal = this.shutdownController.signal;
    if (explicit !== null) {
      try {
        await this.clientIdStore.store(hostId, explicit, signal);
      } catch (err) {
        throw new ClientIdStoreError(hostId, (err as Error).message ?? String(err), { cause: err });
      }
      return explicit;
    }
    let stored: string | null;
    try {
      stored = await this.clientIdStore.load(hostId, signal);
    } catch (err) {
      throw new ClientIdStoreError(hostId, (err as Error).message ?? String(err), { cause: err });
    }
    const resolved = stored ?? generateClientId();
    try {
      await this.clientIdStore.store(hostId, resolved, signal);
    } catch (err) {
      throw new ClientIdStoreError(hostId, (err as Error).message ?? String(err), { cause: err });
    }
    return resolved;
  }
}

// Re-export the predicate helpers for ergonomics so consumers don't
// have to dig through ./types.
export { isConnected, isFailed };
