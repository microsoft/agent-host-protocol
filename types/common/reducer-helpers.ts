/**
 * Common Reducer Helpers — Shared reducer utilities (`softAssertNever`,
 * dispatch validation) used by the per-channel reducers.
 *
 * @module common/reducer-helpers
 */

import type {
  RootAction,
  ClientRootAction,
  SessionAction,
  ClientSessionAction,
  TerminalAction,
  ClientTerminalAction,
  ChangesetAction,
  ClientChangesetAction,
} from '../action-origin.generated.js';
import { IS_CLIENT_DISPATCHABLE } from '../action-origin.generated.js';

/**
 * Soft assertion for exhaustiveness checking. Place in the `default` branch of
 * a switch on a discriminated union so the compiler errors when a new variant
 * is added but not handled.
 *
 * At runtime, logs a warning instead of throwing so that forward-compatible
 * clients receiving unknown actions from a newer server degrade gracefully.
 */
export function softAssertNever(value: never, log?: (msg: string) => void): void {
  const msg = `Unhandled action type: ${JSON.stringify(value)}`;
  (log ?? console.warn)(msg);
}

// ─── Dispatch Validation ─────────────────────────────────────────────────────

/**
 * Type guard that checks whether an action may be dispatched by a client.
 *
 * Servers SHOULD call this to validate incoming `dispatchAction` requests
 * and reject any action the client is not allowed to originate.
 */
export function isClientDispatchable(action: RootAction | SessionAction | TerminalAction | ChangesetAction): action is ClientRootAction | ClientSessionAction | ClientTerminalAction | ClientChangesetAction {
  return IS_CLIENT_DISPATCHABLE[action.type];
}
