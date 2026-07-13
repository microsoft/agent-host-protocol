/**
 * Canvas Channel Actions — Mutations of an `ahp-canvas:` channel's state.
 *
 * @module channels-canvas/actions
 */

import { ActionType } from '../common/actions.js';
import type { CanvasAvailability } from '../channels-session/state.js';

// ─── Canvas Actions ──────────────────────────────────────────────────────────

/**
 * The canvas instance's presentation state changed.
 *
 * Emitted by the server for a server-side provider, or dispatched by the client
 * that provides the instance to push its own presentation changes — mirroring
 * how `terminal/titleChanged` lets a client-owned terminal rename itself. This
 * is the only path a client-side provider has to update the structured
 * {@link CanvasState} (and the {@link OpenCanvasRef} fields mirrored from it)
 * that other subscribers render. The host stays the authoritative reducer: it
 * SHOULD reject an update from a client that is not the instance's resolved
 * provider, then applies the merge and re-broadcasts to subscribers.
 *
 * Sparse-merge semantics: each present field overwrites the corresponding
 * {@link CanvasState} field, and an absent field preserves the current value.
 * There is no clear-to-absent via this action — that three-state distinction
 * cannot survive JSON transport uniformly across languages, so a provider that
 * needs to reset a field re-publishes it, and a full reset arrives as a fresh
 * {@link CanvasState} snapshot on (re)subscribe.
 *
 * @category Canvas Actions
 * @version 1
 * @clientDispatchable
 */
export interface CanvasUpdatedAction {
  type: ActionType.CanvasUpdated;
  /** New title. Absent preserves the current title. */
  title?: string;
  /** New provider-defined status. Absent preserves the current status. */
  status?: string;
  /** New content address. Absent preserves the current url. */
  url?: string;
  /** New availability. Absent preserves the current availability. */
  availability?: CanvasAvailability;
}

/**
 * The user asked to close this canvas (e.g. hit the ✕ on the surface).
 *
 * A pure client→host signal with a no-op reducer, mirroring how
 * `terminal/input` is a side-effect-only client action. The host runs the
 * close flow in response — resolving `canvasClose` against the provider and
 * dropping the instance from {@link SessionState.openCanvases} — rather than
 * the reducer mutating channel state.
 *
 * @category Canvas Actions
 * @version 1
 * @clientDispatchable
 */
export interface CanvasCloseRequestedAction {
  type: ActionType.CanvasCloseRequested;
}
