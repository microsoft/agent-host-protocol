/**
 * Canvas Channel Commands — the server → client provider request family
 * (`canvasOpen` / `canvasInvokeAction` / `canvasClose`) and the client →
 * server `canvasReadResource` content-fetch request.
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
 *     "extensionId": "acme.canvases",
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
  /** Owning provider id. */
  extensionId: string;
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

// ─── canvasInvokeAction ──────────────────────────────────────────────────────

/**
 * Invokes one of a canvas's declared actions against its provider.
 *
 * Sent by the host to the providing client (or resolved host-internally for a
 * server-side provider) when the agent invokes a
 * {@link SessionCanvasAction | declared action} on an open instance. The
 * provider returns an opaque, provider-defined value. Registered symmetrically
 * with the rest of the provider family (see {@link CanvasOpenParams}).
 *
 * @category Commands
 * @method canvasInvokeAction
 * @direction Client ↔ Server
 * @messageType Request
 * @version 1
 * @throws `CanvasProviderError` (`-32012`) if the provider has no handler for
 * the action (`canvas_action_no_handler`) or the invocation fails; `data`
 * carries the provider-defined `{ code, message }`.
 */
export interface CanvasInvokeActionParams extends BaseParams {
  /** The owning session channel URI (`ahp-session:/<uuid>`). */
  channel: URI;
  /** Instance handle the action targets. */
  instanceId: string;
  /** Provider-local canvas id of the instance. */
  canvasId: string;
  /** Owning provider id. */
  extensionId: string;
  /** Declared action name to invoke. */
  actionName: string;
  /** Action input, validated by the provider against its declared schema. */
  input?: Record<string, unknown>;
}

/**
 * Result of the `canvasInvokeAction` command.
 */
export interface CanvasInvokeActionResult {
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
  /** Owning provider id. */
  extensionId: string;
}

// ─── canvasReadResource ──────────────────────────────────────────────────────

/**
 * Reads channel-served canvas content by `ahp-canvas-content:` URI.
 *
 * A client → host request, modeled on MCP's `resources/read`. When a canvas's
 * {@link CanvasState.url} (or a sub-resource the rendered document references)
 * is an `ahp-canvas-content:/<instanceId>/<path>` address, the renderer cannot
 * dial the host directly — for example in a relayed deployment behind a broker
 * — so it resolves the bytes over the instance's existing `ahp-canvas:/<id>`
 * channel with this request instead of loading a network URL. The `<instanceId>`
 * segment of the URI identifies which canvas channel to read from. See
 * {@link /specification/canvas-channel | Canvas Channel}.
 *
 * @category Commands
 * @method canvasReadResource
 * @direction Client → Server
 * @messageType Request
 * @version 1
 * @throws `NotFound` (`-32008`) if the content URI does not resolve.
 * @example
 * ```jsonc
 * // Client → Server
 * { "jsonrpc": "2.0", "id": 52, "method": "canvasReadResource",
 *   "params": {
 *     "channel": "ahp-canvas:/9b1e…",
 *     "uri": "ahp-canvas-content:/inst-7/index.html"
 *   } }
 *
 * // Server → Client
 * { "jsonrpc": "2.0", "id": 52, "result": {
 *   "contents": [
 *     { "uri": "ahp-canvas-content:/inst-7/index.html",
 *       "mimeType": "text/html", "text": "<!doctype html>…" }
 *   ]
 * } }
 * ```
 */
export interface CanvasReadResourceParams extends BaseParams {
  /** The owning canvas channel URI (`ahp-canvas:/<id>`). */
  channel: URI;
  /** An `ahp-canvas-content:/<instanceId>/<path>` content URI to read. */
  uri: string;
}

/**
 * Result of the `canvasReadResource` command.
 */
export interface CanvasReadResourceResult {
  /** The resolved content parts, wrapped for forward compatibility. */
  contents: CanvasResourceContent[];
}

/**
 * One resolved piece of channel-served canvas content.
 *
 * Carries exactly one of {@link text} (text payloads) or {@link blob}
 * (base64-encoded binary payloads).
 *
 * @category Commands
 */
export interface CanvasResourceContent {
  /** The content URI this part resolves. */
  uri: string;
  /** MIME type of the content, when known. */
  mimeType?: string;
  /** UTF-8 text content, for text payloads. */
  text?: string;
  /** Base64-encoded content, for binary payloads. */
  blob?: string;
}
