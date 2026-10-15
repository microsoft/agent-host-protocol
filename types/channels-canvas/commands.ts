/**
 * Canvas Commands — explicit opening for one exact chat.
 *
 * Stability: 1 - Experimental
 *
 * @module channels-canvas/commands
 */

import type { BaseParams } from '../common/commands.js';
import type { URI } from '../common/state.js';
import type { AgentCapabilities } from '../channels-root/state.js';
import type { ChatState } from '../channels-chat/state.js';

// ─── openCanvas ──────────────────────────────────────────────────────────────

/**
 * Opens or focuses one client-addressed canvas resource in an exact chat.
 *
 * The resulting live instance is published through the chat's
 * {@link ChatState.canvases} references and its `ahp-canvas:` state channel.
 * Repeating this command with the same `channel` focuses or refreshes that
 * logical instance rather than creating a duplicate. Reusing the channel for
 * a different chat, extension, or canvas type MUST fail with `Conflict`.
 *
 * The null result is not presentation state. Clients MUST observe
 * {@link ChatState.canvases} and the referenced `ahp-canvas:` channel for
 * authoritative membership, availability, and presentation state.
 *
 * Clients MUST NOT call this command unless the selected agent advertises
 * {@link AgentCapabilities.canvases}.
 *
 * @category Commands
 * @method openCanvas
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface OpenCanvasParams extends BaseParams {
  /**
   * Client-chosen URI for the canvas resource, for example
   * `ahp-canvas:/<uuid>`.
   */
  channel: URI;
  /** Exact chat URI that owns the canvas instance. */
  chat: URI;
  /** Stable identifier of the extension that declares the canvas. */
  extensionId: string;
  /** Provider-local canvas type identifier. */
  canvasId: string;
}
