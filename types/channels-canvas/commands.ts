/**
 * Canvas Channel Commands — the server → client provider request family
 * (`canvasOpen` / `canvasInvokeOperation` / `canvasClose`) that drives a
 * client-declared canvas provider.
 *
 * @module channels-canvas/commands
 */

import type { URI } from '../common/state.js';
import type { BaseParams } from '../common/commands.js';

// ─── canvasOpen ────────────────────────────────────────────────────────────

/**
 * Opens a canvas instance against its provider.
 *
 * Sent by the host to the client that declared the target canvas via
 * {@link SessionActiveClient.canvasProviders} (a client that also declared
 * {@link ClientCapabilities.canvas}). For a server-side provider the host
 * resolves the open host-internally and emits no request. The provider returns
 * the initial render target and presentation fields, which the host folds into
 * the new instance's {@link CanvasState}.
 *
 * Mirrors the `resource*` precedent: registered in `ServerCommandMap` and
 * mirrored in `CommandMap` for symmetry. A client normally never initiates it —
 * the host is not a canvas provider — and a receiver SHOULD reject a request
 * whose target is not one of its declared providers.
 *
 * @category Commands
 * @method canvasOpen
 * @direction Client ↔ Server
 * @messageType Request
 * @version 1
 * @throws `CanvasProviderError` (`-32012`) if the provider cannot open the
 * canvas; `data` carries the provider-defined `{ code, message }`.
 * @example
 * ```jsonc
 * // Server → Client
 * { "jsonrpc": "2.0", "id": 41, "method": "canvasOpen",
 *   "params": {
 *     "channel": "ahp-session:/2f9c…",
 *     "canvasId": "diff",
 *     "providerId": "acme.canvases",
 *     "instanceId": "inst-7",
 *     "input": { "path": "src/app.ts" }
 *   } }
 *
 * // Client → Server
 * { "jsonrpc": "2.0", "id": 41, "result": {
 *   "url": "https://acme.example/canvas/inst-7",
 *   "title": "src/app.ts"
 * } }
 * ```
 */
export interface CanvasOpenParams extends BaseParams {
  /** The owning session channel URI (`ahp-session:/<uuid>`). */
  channel: URI;
  /** Provider-local canvas id to open. */
  canvasId: string;
  /** Owning provider id (opaque to AHP). */
  providerId: string;
  /** Caller-minted handle for the new instance. */
  instanceId: string;
  /** Open input, validated by the provider against its declared schema. */
  input?: Record<string, unknown>;
}

/**
 * Result of the `canvasOpen` command.
 */
export interface CanvasOpenResult {
  /** Initial content address for the instance (see {@link CanvasState.url}). */
  url?: string;
  /** Initial title. */
  title?: string;
  /** Initial provider-defined status. */
  status?: string;
}

// ─── canvasInvokeOperation ───────────────────────────────────────────────────

/**
 * Invokes one of a canvas's declared operations against its provider.
 *
 * Sent by the host to the providing client (or resolved host-internally for a
 * server-side provider) when the agent invokes a
 * {@link SessionCanvasOperation | declared operation} on an open instance. The
 * provider returns an opaque, provider-defined value. Registered symmetrically
 * with the rest of the provider family (see {@link CanvasOpenParams}).
 *
 * @category Commands
 * @method canvasInvokeOperation
 * @direction Client ↔ Server
 * @messageType Request
 * @version 1
 * @throws `CanvasProviderError` (`-32012`) if the provider has no handler for
 * the operation or the invocation fails; `data` carries the provider-defined
 * `{ code, message }`.
 */
export interface CanvasInvokeOperationParams extends BaseParams {
  /** The owning session channel URI (`ahp-session:/<uuid>`). */
  channel: URI;
  /** Instance handle the operation targets. */
  instanceId: string;
  /** Provider-local canvas id of the instance. */
  canvasId: string;
  /** Owning provider id (opaque to AHP). */
  providerId: string;
  /** Declared operation name to invoke. */
  operationName: string;
  /** Operation input, validated by the provider against its declared schema. */
  input?: Record<string, unknown>;
}

/**
 * Result of the `canvasInvokeOperation` command.
 */
export interface CanvasInvokeOperationResult {
  /** Opaque, provider-defined return value. */
  value?: unknown;
}

// ─── canvasClose ─────────────────────────────────────────────────────────────

/**
 * Closes a canvas instance against its provider.
 *
 * Sent by the host to the providing client (or resolved host-internally for a
 * server-side provider) as part of the close flow — typically after a client
 * dispatches `canvas/closeRequested`. The host then drops the instance from
 * {@link SessionState.openCanvases}. Registered symmetrically with the rest of
 * the provider family (see {@link CanvasOpenParams}).
 *
 * @category Commands
 * @method canvasClose
 * @direction Client ↔ Server
 * @messageType Request
 * @version 1
 */
export interface CanvasCloseParams extends BaseParams {
  /** The owning session channel URI (`ahp-session:/<uuid>`). */
  channel: URI;
  /** Instance handle to close. */
  instanceId: string;
  /** Provider-local canvas id of the instance. */
  canvasId: string;
  /** Owning provider id (opaque to AHP). */
  providerId: string;
}
