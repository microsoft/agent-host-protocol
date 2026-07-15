/**
 * Canvas Channel State Types — Per-open-instance state exposed on
 * `ahp-canvas:` channels.
 *
 * @module channels-canvas/state
 */

import type { URI } from '../common/state.js';
import type { CanvasAvailability } from '../channels-session/state.js';

// ─── Canvas State ────────────────────────────────────────────────────────────

/**
 * Full state for a single open canvas instance, delivered when a client
 * subscribes to the instance's `ahp-canvas:/<id>` channel.
 *
 * One channel exists per open instance — the same "one channel per resource"
 * convention used by terminals, changesets, and resource watches. The instance
 * is identified by that channel URI alone, so this state carries no separate
 * instance handle. The lightweight catalogue entry that advertises the channel
 * is {@link OpenCanvasRef} on {@link SessionState.openCanvases}; this state is
 * the authoritative, mutable per-instance view a renderer reads. The provider
 * source that backs the instance lives on its
 * {@link SessionCanvasDeclaration} in {@link SessionState.canvases}, keyed by
 * `(providerId, canvasId)`.
 *
 * Rendering is state-driven: a client renders the canvas by reading
 * {@link contentUri} and resolving it per the renderer's URL policy — directly
 * for a reachable address, or over the general `resourceRead` command for a
 * content-reference address. It never receives a "render this" request.
 *
 * @category Canvas State
 */
export interface CanvasState {
  /** Provider-local canvas id this instance was opened from. */
  canvasId: string;
  /**
   * Owning provider id — an opaque namespace string AHP does not interpret,
   * carried so a provider-local {@link canvasId} stays unique across providers.
   * Distinct from the provider's client connection: one client can proxy
   * several providers.
   */
  providerId: string;
  /**
   * Input the agent supplied when opening the instance. Retained so the
   * instance can be resumed or rebound after a reconnect.
   */
  input?: Record<string, unknown>;
  /** Current instance title. */
  title?: string;
  /** Human-readable description of what the canvas is currently doing; provider-defined and opaque to AHP. */
  activity?: string;
  /**
   * Renderer-targeted address for the opaque canvas content. Clients MAY load a
   * directly-reachable address (`https:`, an in-process scheme,
   * `http://localhost`) themselves; any other scheme — or an address the
   * renderer cannot reach directly — is resolved with the general `resourceRead`
   * command. Resolving over `resourceRead` keeps content flowing entirely over
   * the AHP transport, so a relayed or brokered deployment — where the host is
   * reachable only over AHP and cannot be dialed directly — can still serve
   * every byte, with no port or direct connection required. The renderer
   * dispatches on the scheme and enforces its URL policy. See
   * {@link /specification/canvas-channel | Canvas Channel}.
   */
  contentUri?: URI;
  /** Whether this instance's provider is currently available. */
  availability: CanvasAvailability;
}
