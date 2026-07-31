/**
 * Convenience reducer-driven state store, mirroring the Swift
 * `AHPStateMirror` and the Rust reducers example.
 *
 * Tracks one {@link RootState}, a `Map<URI, SessionState>`, a
 * `Map<URI, TerminalState>`, and a `Map<URI, ChangesetState>`. Apply
 * {@link Snapshot}s and {@link ActionEnvelope}s and the mirror keeps
 * those maps up to date via the generated reducers.
 *
 * Useful for simple clients. Larger apps will usually keep their own
 * state and call the reducers directly.
 *
 * @module client/state-mirror
 */

import type { ActionEnvelope } from '../types/common/actions.js';
import type { Snapshot, URI } from '../types/common/state.js';
import type {
  ChangesetAction,
  RootAction,
  SessionAction,
  TerminalAction,
} from '../types/action-origin.generated.js';
import type { ChangesetState } from '../types/channels-changeset/state.js';
import type { RootState } from '../types/channels-root/state.js';
import type { SessionState } from '../types/channels-session/state.js';
import type { TerminalState } from '../types/channels-terminal/state.js';
import { changesetReducer } from '../types/channels-changeset/reducer.js';
import { rootReducer } from '../types/channels-root/reducer.js';
import { sessionReducer } from '../types/channels-session/reducer.js';
import { terminalReducer } from '../types/channels-terminal/reducer.js';

const ROOT_URI = 'ahp-root://' as const;

const INITIAL_ROOT: RootState = { agents: [] };

/** Reducer-driven state container synchronised with server events. */
export class AhpStateMirror {
  private rootState: RootState = INITIAL_ROOT;
  private readonly sessionsMap = new Map<URI, SessionState>();
  private readonly terminalsMap = new Map<URI, TerminalState>();
  private readonly changesetsMap = new Map<URI, ChangesetState>();

  /** Current root state. */
  get root(): RootState {
    return this.rootState;
  }

  /** All known sessions keyed by URI. */
  get sessions(): ReadonlyMap<URI, SessionState> {
    return this.sessionsMap;
  }

  /** All known terminals keyed by URI. */
  get terminals(): ReadonlyMap<URI, TerminalState> {
    return this.terminalsMap;
  }

  /** All known changesets keyed by URI. */
  get changesets(): ReadonlyMap<URI, ChangesetState> {
    return this.changesetsMap;
  }


  /** Look up a session by URI. */
  getSession(uri: URI): SessionState | undefined {
    return this.sessionsMap.get(uri);
  }

  /** Look up a terminal by URI. */
  getTerminal(uri: URI): TerminalState | undefined {
    return this.terminalsMap.get(uri);
  }


  /**
   * Apply a server snapshot, replacing the state for the resource the
   * snapshot covers.
   */
  applySnapshot(snapshot: Snapshot): void {
    const resource = snapshot.resource;
    if (resource === ROOT_URI) {
      this.rootState = snapshot.state as RootState;
      return;
    }
    if (resource.startsWith('ahp-session:')) {
      this.sessionsMap.set(resource, snapshot.state as SessionState);
      return;
    }
    if (resource.startsWith('ahp-terminal:')) {
      this.terminalsMap.set(resource, snapshot.state as TerminalState);
      return;
    }
    if (resource.startsWith('ahp-changeset:')) {
      this.changesetsMap.set(resource, snapshot.state as ChangesetState);
      return;
    }
  }

  /**
   * Apply a server-pushed {@link ActionEnvelope}, routing through the
   * matching reducer. Unknown channels are ignored.
   *
   * The channel-based routing here discriminates which reducer applies;
   * the action is cast to the appropriate per-channel subset (the
   * `RootAction` / `SessionAction` / `TerminalAction` / `ChangesetAction`
   * unions generated from `@clientDispatchable` annotations) because
   * TypeScript cannot infer that narrowing from the channel string alone.
   */
  apply(envelope: ActionEnvelope): void {
    const { channel, action } = envelope;
    if (channel === ROOT_URI) {
      this.rootState = rootReducer(this.rootState, action as RootAction);
      return;
    }
    if (channel.startsWith('ahp-session:')) {
      const current = this.sessionsMap.get(channel);
      if (!current) return;
      this.sessionsMap.set(channel, sessionReducer(current, action as SessionAction));
      return;
    }
    if (channel.startsWith('ahp-terminal:')) {
      const current = this.terminalsMap.get(channel);
      if (!current) return;
      this.terminalsMap.set(channel, terminalReducer(current, action as TerminalAction));
      return;
    }
    if (channel.startsWith('ahp-changeset:')) {
      const current = this.changesetsMap.get(channel);
      if (!current) return;
      this.changesetsMap.set(channel, changesetReducer(current, action as ChangesetAction));
      return;
    }
  }
}
