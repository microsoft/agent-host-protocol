/**
 * Canvas Commands — discovery and explicit opening for one exact chat.
 *
 * @module channels-canvas/commands
 */

import type { BaseParams } from '../common/commands.js';
import type { URI } from '../common/state.js';
import type { AgentCapabilities } from '../channels-root/state.js';
import type { ChatState } from '../channels-chat/state.js';
import type { CanvasTypeDeclaration } from './state.js';

// ─── listCanvasTypes ─────────────────────────────────────────────────────────

/**
 * Lists canvas types currently available to open for one exact chat.
 *
 * This read MAY lazily resume an existing persisted chat so its extension
 * registry can be reconstructed. It MUST NOT create a backing runtime for a
 * brand-new chat, send a user message, or invoke a model.
 *
 * Clients MUST NOT call this command unless the selected agent advertises
 * {@link AgentCapabilities.canvases}.
 *
 * @category Commands
 * @method listCanvasTypes
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface ListCanvasTypesParams extends BaseParams {
  /** Exact chat URI whose extension registry should be queried. */
  channel: URI;
}

/**
 * Canvas types available to open for the requested chat.
 *
 * @category Commands
 */
export interface ListCanvasTypesResult {
  /** Available canvas types and their declaring extensions. */
  items: CanvasTypeDeclaration[];
}

// ─── openCanvas ──────────────────────────────────────────────────────────────

/**
 * Opens or focuses one stable canvas instance in an exact chat.
 *
 * The resulting live instance is published through the chat's
 * {@link ChatState.canvases} references and its `ahp-canvas:` state channel.
 * Repeating this command with the same `instanceId` focuses or refreshes that
 * logical instance rather than creating a duplicate.
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
  /** Exact chat URI that owns the canvas instance. */
  channel: URI;
  /** Stable identifier of the extension that declares the canvas. */
  extensionId: string;
  /** Provider-local canvas type identifier. */
  canvasId: string;
  /** Caller-chosen stable instance identifier. */
  instanceId: string;
}
