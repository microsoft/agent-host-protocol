/**
 * Host-aware reducer façade for multi-host consumers.
 *
 * Wraps the existing pure reducers (`rootReducer`, `sessionReducer`,
 * `terminalReducer`, `changesetReducer`) the way a single-host
 * consumer would, but keys session/terminal/changeset state by
 * `(hostId, uri)` so URIs that legitimately collide across hosts (the
 * normal case for session URIs) don't clobber each other.
 *
 * # Event sources are lossy today
 *
 * Both event surfaces the TypeScript SDK exposes are
 * {@link AsyncBroadcastQueue}-backed and **drop envelopes on slow
 * consumers** once their buffer fills:
 *
 * - {@link MultiHostClient.events} — the cross-host fan-in.
 * - {@link AhpClient.subscribe} / {@link AhpClient.attachSubscription}
 *   — per-channel {@link Subscription}.
 *
 * Neither survives a reconnect's replayed envelopes the way the Swift
 * SDK's per-channel `events(host:uri:)` does. A dropped envelope (or
 * a missed-because-reconnected envelope) permanently desyncs the
 * mirror for that `(host, channel)` until it's re-seeded from a fresh
 * snapshot via {@link MultiHostStateMirror.applySnapshot}. Consume
 * with that in mind — the mirror is the right shape for multi-host UI
 * state, but the SDK doesn't yet ship a lossless feeder.
 *
 * @module client/hosts/state-mirror
 */

import type { ActionEnvelope } from '../../types/common/actions.js';
import type { Snapshot, URI } from '../../types/common/state.js';
import type {
  ChangesetAction,
  RootAction,
  SessionAction,
  TerminalAction,
} from '../../types/action-origin.generated.js';
import type { ChangesetState } from '../../types/channels-changeset/state.js';
import type { RootState } from '../../types/channels-root/state.js';
import type { SessionState } from '../../types/channels-session/state.js';
import type { TerminalState } from '../../types/channels-terminal/state.js';
import { changesetReducer } from '../../types/channels-changeset/reducer.js';
import { rootReducer } from '../../types/channels-root/reducer.js';
import { sessionReducer } from '../../types/channels-session/reducer.js';
import { terminalReducer } from '../../types/channels-terminal/reducer.js';
import { ROOT_RESOURCE_URI, type HostId, type HostSubscriptionEvent } from './types.js';

const INITIAL_ROOT: RootState = { agents: [] };

/**
 * Compound key tagging a channel URI with the host that produced it.
 *
 * Session, terminal, and changeset URIs aren't globally unique across
 * hosts — `ahp-session:/s1` on Host A and `ahp-session:/s1` on Host B
 * are different resources. Compose into a string for Map keys so we
 * don't depend on reference identity.
 *
 * The encoding is length-prefixed (`${hostId.length}\0${hostId}${uri}`)
 * rather than a plain separator-joined string so that any character
 * (including `\0`) inside a {@link HostId} or {@link URI} is
 * unambiguous. Two different (`hostId`, `uri`) pairs always produce
 * distinct keys.
 */
export interface HostedResourceKey {
  readonly hostId: HostId;
  readonly uri: URI;
}

/**
 * Build a Map-stable key string from a {@link HostedResourceKey}.
 *
 * The encoding is length-prefixed so it stays unambiguous even when
 * a {@link HostId} contains `\0` or other characters that would
 * otherwise collide with the separator.
 */
export function hostedResourceKey(hostId: HostId, uri: URI): string {
  return `${hostId.length}\x00${hostId}${uri}`;
}

/** @internal Length-prefixed `hostId` prefix shared by all of a host's resource keys. */
function hostedResourceKeyPrefix(hostId: HostId): string {
  return `${hostId.length}\x00${hostId}`;
}

/**
 * In-memory mirror of per-host root/session/terminal/changeset state,
 * fed by {@link ActionEnvelope}s and snapshot states tagged with their
 * host of origin.
 *
 * Single-host consumers should keep using {@link AhpStateMirror}; this
 * type adds the host dimension necessary for multi-host UIs.
 *
 * See the module-level docs for a warning about lossy event sources.
 */
export class MultiHostStateMirror {
  private readonly rootStatesMap = new Map<HostId, RootState>();
  private readonly sessionsMap = new Map<string, SessionState>();
  private readonly terminalsMap = new Map<string, TerminalState>();
  private readonly changesetsMap = new Map<string, ChangesetState>();

  /** All known root states keyed by host. */
  get rootStates(): ReadonlyMap<HostId, RootState> {
    return this.rootStatesMap;
  }

  /** All known session states keyed by `hostedResourceKey(hostId, uri)`. */
  get sessions(): ReadonlyMap<string, SessionState> {
    return this.sessionsMap;
  }

  /** All known terminal states keyed by `hostedResourceKey(hostId, uri)`. */
  get terminals(): ReadonlyMap<string, TerminalState> {
    return this.terminalsMap;
  }

  /** All known changeset states keyed by `hostedResourceKey(hostId, uri)`. */
  get changesets(): ReadonlyMap<string, ChangesetState> {
    return this.changesetsMap;
  }


  /** Look up the root state for `hostId`. */
  getRoot(hostId: HostId): RootState | undefined {
    return this.rootStatesMap.get(hostId);
  }

  /** Look up a session by `(hostId, uri)`. */
  getSession(hostId: HostId, uri: URI): SessionState | undefined {
    return this.sessionsMap.get(hostedResourceKey(hostId, uri));
  }

  /** Look up a terminal by `(hostId, uri)`. */
  getTerminal(hostId: HostId, uri: URI): TerminalState | undefined {
    return this.terminalsMap.get(hostedResourceKey(hostId, uri));
  }

  /** Look up a changeset by `(hostId, uri)`. */
  getChangeset(hostId: HostId, uri: URI): ChangesetState | undefined {
    return this.changesetsMap.get(hostedResourceKey(hostId, uri));
  }


  /**
   * Convenience: apply a {@link HostSubscriptionEvent} produced by
   * {@link MultiHostClient.events}. Action envelopes are routed through
   * the matching reducer; non-action events (session-summary
   * notifications, auth challenges) are ignored — they don't move any
   * of the reducer-tracked state shapes.
   */
  applyEvent(event: HostSubscriptionEvent): void {
    if (event.event.type === 'action') {
      this.applyEnvelope(event.hostId, event.event.params);
    }
  }

  /**
   * Apply a single action envelope scoped to `hostId`. Routing uses
   * `envelope.channel`: {@link ROOT_RESOURCE_URI} is the root channel,
   * every other URI is identified by the channel the server announces.
   */
  applyEnvelope(hostId: HostId, envelope: ActionEnvelope): void {
    const { channel, action } = envelope;
    if (channel === ROOT_RESOURCE_URI) {
      const root = this.rootStatesMap.get(hostId) ?? INITIAL_ROOT;
      this.rootStatesMap.set(hostId, rootReducer(root, action as RootAction));
      return;
    }
    if (channel.startsWith('ahp-session:')) {
      const key = hostedResourceKey(hostId, channel);
      const current = this.sessionsMap.get(key);
      if (!current) return;
      this.sessionsMap.set(key, sessionReducer(current, action as SessionAction));
      return;
    }
    if (channel.startsWith('ahp-terminal:')) {
      const key = hostedResourceKey(hostId, channel);
      const current = this.terminalsMap.get(key);
      if (!current) return;
      this.terminalsMap.set(key, terminalReducer(current, action as TerminalAction));
      return;
    }
    if (channel.startsWith('ahp-changeset:')) {
      const key = hostedResourceKey(hostId, channel);
      const current = this.changesetsMap.get(key);
      if (!current) return;
      this.changesetsMap.set(key, changesetReducer(current, action as ChangesetAction));
      return;
    }
  }

  /**
   * Seed the mirror from a {@link Snapshot} scoped to `hostId` — root,
   * session, terminal, or changeset as the snapshot's `state` shape
   * dictates.
   */
  applySnapshot(hostId: HostId, snapshot: Snapshot): void {
    const { resource } = snapshot;
    if (resource === ROOT_RESOURCE_URI) {
      this.rootStatesMap.set(hostId, snapshot.state as RootState);
      return;
    }
    const key = hostedResourceKey(hostId, resource);
    if (resource.startsWith('ahp-session:')) {
      this.sessionsMap.set(key, snapshot.state as SessionState);
      return;
    }
    if (resource.startsWith('ahp-terminal:')) {
      this.terminalsMap.set(key, snapshot.state as TerminalState);
      return;
    }
    if (resource.startsWith('ahp-changeset:')) {
      this.changesetsMap.set(key, snapshot.state as ChangesetState);
      return;
    }
  }

  /** Drop every slot keyed under `hostId` — root, sessions, terminals, changesets. */
  resetHost(hostId: HostId): void {
    this.rootStatesMap.delete(hostId);
    const prefix = hostedResourceKeyPrefix(hostId);
    for (const key of this.sessionsMap.keys()) {
      if (key.startsWith(prefix)) this.sessionsMap.delete(key);
    }
    for (const key of this.terminalsMap.keys()) {
      if (key.startsWith(prefix)) this.terminalsMap.delete(key);
    }
    for (const key of this.changesetsMap.keys()) {
      if (key.startsWith(prefix)) this.changesetsMap.delete(key);
    }
  }

  /** Drop every host's state. */
  reset(): void {
    this.rootStatesMap.clear();
    this.sessionsMap.clear();
    this.terminalsMap.clear();
    this.changesetsMap.clear();
  }
}
