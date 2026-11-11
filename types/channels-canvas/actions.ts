/**
 * Canvas Channel Actions — Mutations of an `ahp-canvas:` channel's state.
 *
 * @module channels-canvas/actions
 */

import { ActionType } from '../common/actions.js';
import type { CanvasState } from './state.js';

/**
 * The presentation state for this canvas changed.
 *
 * Replaces the subscribed canvas channel state entirely. Full-replacement
 * semantics intentionally keep this early-development channel free to evolve
 * without expanding the stable chat action surface.
 *
 * @category Canvas Actions
 * @version 1
 */
export interface CanvasStateChangedAction {
  type: ActionType.CanvasStateChanged;
  /** New authoritative canvas state. */
  canvas: CanvasState;
}
