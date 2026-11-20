/**
 * Canvases Channel State — Chat-scoped registry and live membership on
 * `ahp-canvases:` channels.
 *
 * Stability: 1 - Experimental
 *
 * @module channels-canvases/state
 */

import type { ErrorInfo } from '../common/state.js';
import type { CanvasReference, CanvasRegistry } from '../channels-canvas/state.js';

export type { CanvasRegistry } from '../channels-canvas/state.js';

/**
 * Registry materialization status.
 *
 * @category Canvases State
 * @nonexhaustive
 */
export enum CanvasRegistryStatus {
  Uninitialized = 'uninitialized',
  Loading = 'loading',
  Ready = 'ready',
  Error = 'error',
}

/**
 * The registry has not been materialized.
 * @category Canvases State
 */
export interface CanvasRegistryUninitializedState {
  status: CanvasRegistryStatus.Uninitialized;
}

/**
 * Registry materialization is in progress.
 * @category Canvases State
 */
export interface CanvasRegistryLoadingState {
  status: CanvasRegistryStatus.Loading;
}

/**
 * The registry is loaded, extending {@link CanvasRegistry} with a required
 * `extensions` array; an empty array is authoritative.
 * @category Canvases State
 */
export interface CanvasRegistryReadyState extends CanvasRegistry {
  status: CanvasRegistryStatus.Ready;
}

/**
 * Registry materialization failed; a later request may retry.
 * @category Canvases State
 */
export interface CanvasRegistryErrorState {
  status: CanvasRegistryStatus.Error;
  error: ErrorInfo;
}

/**
 * Authoritative registry load state, independent of live canvas membership.
 * @category Canvases State
 */
export type CanvasRegistryState =
  | CanvasRegistryUninitializedState
  | CanvasRegistryLoadingState
  | CanvasRegistryReadyState
  | CanvasRegistryErrorState;

/**
 * State of an advertised `ahp-canvases:` collection owned by one chat.
 *
 * Advertising and subscribing are observation only: hosts MUST NOT create
 * backing, resume a cold runtime, or start extensions to serve a subscription.
 * Hosts MAY enumerate or refresh an already-live runtime. Collection ownership
 * is established by the host, not inferred from URI grammar. Other ownership
 * scopes are not currently defined.
 *
 * Unsubscribing MUST NOT dispose canvases. Legacy chat canvas references MUST
 * be projected from this same authoritative membership, not maintained as a
 * second source of truth.
 *
 * @category Canvases State
 * @stability 1.0
 */
export interface CanvasesState {
  registry: CanvasRegistryState;
  /** Live instances, keyed by their unique channel resource URI. */
  canvases: CanvasReference[];
}
