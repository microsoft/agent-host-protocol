# Canvases

A **canvas** is a rich, interactive UI surface the agent can open next to a session — a document or spreadsheet editor, a diff view, a live web preview, a design surface. Where a chat turn is a stream of messages and tool calls, a canvas is a durable, stateful *view* the user works in directly while the agent keeps assisting.

Canvases are AHP's native counterpart to [MCP Apps](https://github.com/modelcontextprotocol/ext-apps): where an MCP App is a View embedded in a tool result, a canvas is a first-class, individually subscribable resource with its own channel, discovery surface, and lifecycle — the same "one channel per resource" model used by [terminals](/guide/terminals) and [changesets](/guide/changesets).

## Two roles a client plays

A client that declares the `canvas` capability can act in either or both of two roles:

- **Renderer** — it hosts the isolated surface and displays a canvas by loading its content address. Every capable client is a renderer.
- **Provider** — it *contributes* canvases (a VS Code extension exposing a "diff" canvas, say) and answers the open/invoke/close callbacks for them. A canvas can equally be provided by the host itself.

The provider owns behaviour; the renderer owns presentation. They are frequently different clients — one client provides a canvas, another renders it — which is exactly why canvas state is synchronised through AHP rather than kept in one process.

## Discovery

The session advertises two things once any client declares the capability:

- **A registry** (`SessionState.canvases`) of every canvas the agent *can* open. The host aggregates it from server-side declarations and the providers each client publishes on `SessionActiveClient.canvasProviders`.
- **An open catalogue** (`SessionState.openCanvases`) of instances that *are* open. Each entry carries the instance's `ahp-canvas:/<id>` channel URI, so a client can render an open canvas by subscribing to that one channel — it never has to subscribe to every instance to know what exists.

Both lists are published with full-replacement actions (`session/canvasesChanged`, `session/openCanvasesChanged`), matching how the tools catalogue is republished atomically.

## State-driven rendering

The defining idea: **a renderer renders from state, not from requests.** Subscribing to a canvas instance yields a `CanvasState` with a `contentUri`, and the renderer resolves that address:

- a directly-loadable `https:`, in-process, or `http://localhost` address is loaded straight into the surface; or
- a content-reference address is resolved over the general `resourceRead` command — which keeps content flowing over the AHP transport itself, the escape hatch for relayed deployments where the renderer can't reach the host's network directly.

When the canvas changes, the provider emits a `canvas/updated` action that sparse-merges the new `title` / `status` / `contentUri` / `availability` into state, and every subscriber re-renders. There is no imperative "draw this" message anywhere in the protocol.

## Interaction

Interaction travels back to the provider through **declared operations.** A canvas can declare named operations (with input schemas) the agent may invoke; the host issues a `canvasInvokeOperation` request to the provider and returns its opaque result. Opening and closing are the same shape (`canvasOpen`, `canvasClose`). All three address the instance's own `ahp-canvas:/<id>` channel, the same way terminal and changeset operations target their channel URI. For a host-provided canvas the host resolves these internally and sends no request.

Closing follows a signal-then-request pattern: the user hits ✕, the renderer dispatches `canvas/closeRequested`, and the host runs the close flow — resolving `canvasClose` against the provider and dropping the instance from `openCanvases`.

## Lifecycle

1. A client declares `ClientCapabilities.canvas` and publishes any `canvasProviders`. The host folds them into `SessionState.canvases`.
2. The agent opens a canvas. The host mints an instance, sends `canvasOpen` to the provider (or resolves it internally), and adds an `OpenCanvasRef` to `SessionState.openCanvases`.
3. A renderer subscribes to the instance's `ahp-canvas:/<id>` channel, receives the `CanvasState` snapshot, and loads its `contentUri`.
4. The provider pushes `canvas/updated` as the canvas evolves, and the agent invokes declared operations.
5. The user (or the agent) closes the canvas. The host resolves `canvasClose` and republishes `openCanvases` without the instance; subscribers see the channel go away.

See the [Canvas Channel specification](/specification/canvas-channel) for the exact state shapes, action semantics, command signatures, and error codes.
