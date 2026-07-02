/**
 * Canvas Channel Reducer — Pure reducer for `CanvasState`.
 *
 * @module channels-canvas/reducer
 */

import { ActionType } from '../common/actions.js';
import type { CanvasState } from './state.js';
import type { CanvasAction } from '../action-origin.generated.js';
import { softAssertNever } from '../common/reducer-helpers.js';

/**
 * Pure reducer for canvas state. Handles all {@link CanvasAction} variants.
 *
 * `canvas/updated` is a sparse merge — a present field overwrites the
 * corresponding {@link CanvasState} field and an absent field preserves the
 * current value. `canvas/closeRequested` and `canvas/message` are pure
 * signals with no state effect (the host acts on them out of band), mirroring
 * how `terminal/input` is side-effect-only.
 */
export function canvasReducer(state: CanvasState, action: CanvasAction, log?: (msg: string) => void): CanvasState {
  switch (action.type) {
    case ActionType.CanvasUpdated:
      return {
        ...state,
        title: action.title ?? state.title,
        status: action.status ?? state.status,
        url: action.url ?? state.url,
        availability: action.availability ?? state.availability,
      };

    case ActionType.CanvasCloseRequested:
      // Side-effect-only: a client→host "user hit ✕" signal. The host runs
      // the close flow; the reducer keeps no state for it.
      return state;

    case ActionType.CanvasMessage:
      // Side-effect-only: an opaque View↔provider relay message. No state.
      return state;

    default:
      softAssertNever(action, log);
      return state;
  }
}
