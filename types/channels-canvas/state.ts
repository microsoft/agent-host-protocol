/**
 * Canvas Channel State Types — Per-open-instance state exposed on
 * `ahp-canvas:` channels.
 *
 * @module channels-canvas/state
 */

import type {
  CanvasAvailability,
  CanvasProviderSource,
} from '../channels-session/state.js';

// ─── Canvas State ────────────────────────────────────────────────────────────

/**
 * Full state for a single open canvas instance, delivered when a client
 * subscribes to the instance's `ahp-canvas:/<id>` channel.
 *
 * One channel exists per open instance — the same "one channel per resource"
 * convention used by terminals, changesets, and resource watches. The
 * lightweight catalogue entry that advertises this channel is
 * {@link OpenCanvasRef} on {@link SessionState.openCanvases}; this state is the
 * authoritative, mutable per-instance view a renderer reads.
 *
 * Rendering is state-driven: a client renders the canvas by reading
 * {@link url} and resolving it per the renderer's URL policy — directly for a
 * reachable address, or over this channel via `canvasReadResource` for an
 * `ahp-canvas-content:` address. It never receives a "render this" request.
 *
 * @category Canvas State
 */
export interface CanvasState {
  /** Server-assigned instance handle, unique within the session. */
  instanceId: string;
  /** Provider-local canvas id this instance was opened from. */
  canvasId: string;
  /** Owning provider id. */
  extensionId: string;
  /** Human-readable provider name. */
  extensionName?: string;
  /** Human-readable canvas name. */
  displayName?: string;
  /**
   * Input the agent supplied when opening the instance. Retained so the
   * instance can be resumed or rebound after a reconnect.
   */
  input?: Record<string, unknown>;
  /** Current instance title. */
  title?: string;
  /** Provider-defined status string (opaque to AHP). */
  status?: string;
  /**
   * Renderer-targeted address for the opaque canvas content — either a
   * directly-loadable URL (`https:`, an in-process scheme, `http://localhost`)
   * or a channel-served `ahp-canvas-content:/<instanceId>/<path>` address the
   * renderer resolves over this channel with `canvasReadResource`. The
   * renderer dispatches on the scheme and enforces its URL policy. See
   * {@link /specification/canvas-channel | Canvas Channel}.
   */
  url?: string;
  /** Whether this instance's provider is currently available. */
  availability: CanvasAvailability;
  /** Which provider owns the callbacks (`canvasOpen` / … ) for this instance. */
  provider: CanvasProviderSource;
}
