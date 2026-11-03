/**
 * Canvas Channel State Types — Per-canvas presentation state exposed on
 * `ahp-canvas:` channels.
 *
 * Stability: 1 - Experimental
 *
 * @module channels-canvas/state
 */

import type { URI } from '../common/state.js';

/**
 * Stable reference to a subscribable canvas channel.
 *
 * Chat state intentionally carries only this reference so the experimental
 * canvas presentation model can evolve without changing the stable chat
 * channel shape.
 *
 * @category Canvas State
 */
export interface CanvasReference {
  /** Canvas channel URI. Subscribe to this resource for the full state. */
  resource: URI;
}

/**
 * Full state for one live canvas, returned when a client subscribes to its
 * `ahp-canvas:` URI.
 *
 * The client already knows the subscribed resource, so the state does not
 * redundantly carry its channel URI.
 *
 * @category Canvas State
 */
export interface CanvasState {
  /** Stable caller-supplied instance identifier. */
  instanceId: string;
  /** Owning extension/provider identifier. */
  extensionId: string;
  /** Owning extension display name, when available. */
  extensionName?: string;
  /** Provider-local canvas type identifier. */
  canvasId: string;
  /** Provider-supplied title, when available. */
  title?: string;
  /** Provider-supplied status text, when available. */
  status?: string;
  /**
   * Current absolute content URI; absent when the live source is unavailable.
   * MAY be an HTTP(S) URL. Hosts SHOULD make the advertised resource readable
   * through `resourceRead` for clients that cannot retrieve it directly.
   * Hosts MUST clear this field when the provider becomes unavailable.
   *
   * The content URI is distinct from the canvas's opaque subscription URI.
   * Non-HTTP(S) sources require the negotiated Resource Reads contract and a
   * scheme the host advertises there. Without it, hosts MUST retain HTTP(S)
   * sources or omit this field when no compatible source is available.
   *
   * Source URIs MUST be redacted from diagnostic logs and MUST NOT be reused
   * from persisted state after a provider or host restart.
   *
   * @see {@link /specification/canvas-channel | Canvas Channel}
   * @see {@link /specification/resource-reads | Resource Reads}
   */
  url?: URI;
}
