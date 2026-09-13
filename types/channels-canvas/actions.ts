/**
 * Canvas Channel Actions — Mutations of an `ahp-canvas:` channel's state.
 *
 * All actions here are server-dispatched: canvas live state reflects
 * authoritative resolution outcomes, not client-optimistic writes. Clients
 * request effects through the `openCanvas`, `invokeCanvasAction`,
 * `restartCanvasProvider`, and `closeCanvas` commands instead.
 *
 * @module channels-canvas/actions
 */

import { ActionType } from '../common/actions.js';
import type { CanvasAvailabilityState, CanvasTrustState } from './state.js';

// ─── Canvas Actions ──────────────────────────────────────────────────────────

/**
 * Replaces the canvas's live resolution state.
 *
 * Dispatched by the host on every availability transition: initial
 * resolution after `openCanvas`, provider restart, reload, and failure.
 *
 * @category Canvas Actions
 * @version 1
 */
export interface CanvasAvailabilityChangedAction {
  type: ActionType.CanvasAvailabilityChanged;
  /** New {@link CanvasState.availability}. */
  availability: CanvasAvailabilityState;
  /**
   * The {@link CanvasState.revision} this action results in. The reducer
   * MUST reject (no-op) this action if `revision` is not strictly greater
   * than the canvas's current `revision` — this is how stale/out-of-order
   * deliveries are consistently rejected across every canvas action, not
   * just this one.
   */
  revision: number;
}

/**
 * Replaces the canvas's trust decision.
 *
 * Dispatched by the host whenever the execution-trust decision for this
 * canvas's declared actions changes (e.g. a pending decision resolves, or an
 * administrator revokes a previously trusted source).
 *
 * @category Canvas Actions
 * @version 1
 */
export interface CanvasTrustChangedAction {
  type: ActionType.CanvasTrustChanged;
  /** New {@link CanvasState.trust}. */
  trust: CanvasTrustState;
  /** The {@link CanvasState.revision} this action results in; see {@link CanvasAvailabilityChangedAction.revision}. */
  revision: number;
}

/**
 * Records that the canvas's live endpoint was replaced by a fresh one for
 * the same logical instance (e.g. the owning provider restarted).
 *
 * The host MUST dispatch {@link CanvasAvailabilityChangedAction} to
 * transition through `notLoaded`/`loading` around this change. Receivers
 * MUST reject in-flight `invokeCanvasAction` replies and stale server-pushed
 * callbacks addressed to a superseded `incarnation` — because `incarnation`
 * is opaque (see {@link CanvasIdentity.incarnation}), that rejection is
 * driven by the accompanying `revision` bump here, not by comparing
 * `incarnation` values for order.
 *
 * @category Canvas Actions
 * @version 1
 */
export interface CanvasIncarnationChangedAction {
  type: ActionType.CanvasIncarnationChanged;
  /** New {@link CanvasIdentity.incarnation}. MUST differ from the previous value and MUST NOT be reused for this logical identity. */
  incarnation: string;
  /** The {@link CanvasState.revision} this action results in; see {@link CanvasAvailabilityChangedAction.revision}. */
  revision: number;
}

/**
 * Replaces the canvas's display title.
 *
 * @category Canvas Actions
 * @version 1
 */
export interface CanvasTitleChangedAction {
  type: ActionType.CanvasTitleChanged;
  /** New {@link CanvasState.title}. */
  title: string;
  /** The {@link CanvasState.revision} this action results in; see {@link CanvasAvailabilityChangedAction.revision}. */
  revision: number;
}
