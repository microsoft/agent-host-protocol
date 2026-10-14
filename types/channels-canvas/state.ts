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
 * Where the runtime discovered an extension that declares a canvas type.
 *
 * @category Canvas State
 * @nonexhaustive
 */
export const enum CanvasExtensionSource {
  /** Extension installed for the current user. */
  User = 'user',
  /** Extension discovered in the current project. */
  Project = 'project',
  /** Extension installed only for the current session. */
  Session = 'session',
  /** Extension contributed by an installed plugin. */
  Plugin = 'plugin',
  /** Extension source is unavailable or not recognized by this protocol version. */
  Unspecified = 'unknown',
}

/**
 * One canvas type currently available to open for an exact chat.
 *
 * This is discovery metadata, not a live canvas instance. Live instances are
 * represented by {@link CanvasReference} entries on chat state and their
 * corresponding {@link CanvasState} channels.
 *
 * This experimental object may gain optional discovery metadata. Clients
 * SHOULD ignore fields they do not understand.
 *
 * @category Canvas State
 */
export interface CanvasTypeDeclaration {
  /** Provider-local canvas type identifier. */
  canvasId: string;
  /** Stable identifier of the extension that declares the canvas. */
  extensionId: string;
  /** Where the runtime discovered the declaring extension. */
  extensionSource: CanvasExtensionSource;
  /** Human-readable extension name, when available. */
  extensionName?: string;
  /** Human-readable canvas type name. */
  displayName: string;
  /** Description of what the canvas type does. */
  description: string;
  /** Whether opening this canvas requires an input flow. */
  requiresInput: boolean;
  /** Number of actions the canvas declares. */
  actionCount: number;
}

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
   * Current absolute HTTP(S) source URL; absent when the live source is unavailable.
   * Hosts MUST clear this field when the provider becomes unavailable.
   *
   * Source URLs MUST be redacted from diagnostic logs and MUST NOT be reused
   * from persisted state after a provider or host restart.
   */
  url?: URI;
}
