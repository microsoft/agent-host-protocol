# Canvas Channel

<StabilityIndex level="1" />

A canvas is a web surface that an agent's extension serves from the host's
environment, such as a preview or a dashboard. Chat state lists open canvases
in `ChatState.canvases`. Each entry names an `ahp-canvas:` URI. Clients treat
the URI as opaque and subscribe to it to receive the canvas's `CanvasState`.
The type reference is on the [Canvas Channel reference](/reference/canvas) page.

`CanvasState.url` is the canvas's live, absolute **content URI**, distinct from
its opaque subscription URI. It MAY be an HTTP(S) URL, including a loopback
address in the host's environment. Hosts SHOULD make the advertised content
readable through [`resourceRead`](/specification/resource-reads) for clients
that cannot retrieve it directly.

## Reading Canvas Content

After [negotiating Resource Reads](/specification/resource-reads#negotiation),
a client reads `CanvasState.url` itself, retaining any navigation fragment
locally rather than sending it in the read. The protocol does **not** define
`resourceRead(<canvas channel URI>)` as an alias for the entry document or
define a `<canvas channel URI>/<path>` convention.

For example, a host may publish `canvas-content://c1/preview/index.html` as the
content URI for a canvas subscribed at `ahp-canvas:/9f2c`. `canvas-content` is an
illustrative host-defined scheme, not a new required AHP scheme. The host
advertises it in `InitializeResult.resourceRead.schemes` and resolves it to its
private source. The client reads:

```jsonc
// Client → Server
{ "jsonrpc": "2.0", "id": 21, "method": "resourceRead",
  "params": { "channel": "ahp-root://", "uri": "canvas-content://c1/preview/index.html", "encoding": "base64" } }

// Server → Client
{ "jsonrpc": "2.0", "id": 21, "result": {
  "data": "PGgxPkhlbGxvPC9oMT4=",
  "encoding": "base64",
  "contentType": "text/html"
}}
```

The client resolves each document or stylesheet's references against that
resource's effective URI, following the [shared resolution rules](/specification/resource-reads#uri-resolution).
It does not append paths to the canvas's channel URI. An indirect content tree
must preserve those rules, including root-relative paths and redirect bases.
Publishing an indirect URI does not itself rewrite absolute URLs inside HTML.

Clients MAY load an HTTP(S) source directly when their environment and policy
permit it. A remote host's loopback address refers to the **host**, not the
client's machine; clients MUST NOT assume that fetching it locally reaches the
same resource. A client need not implement a native fetcher for every scheme:
it can use the host's negotiated resource reader or show an unavailable source.
Content URIs MUST NOT be executed as commands or opened as arbitrary OS handlers.

## Authorization and Lifetime

The host MUST check that the caller may access the canvas **and** that the
backing source is within the host's resource policy. Neither knowledge of the
URI nor provider registration grants network or filesystem access. Loopback
alone is not proof that an endpoint belongs to a canvas.

For an HTTP(S) source without applicable host authorization, the host uses
the shared [canvas origin-grant flow](/specification/resource-reads#canvas-origin-grants):
`PermissionDenied` carries a host-issued `resourceRequest`, the client may
forward it, and the host obtains approval for read-only access to that backing
origin for the current canvas source lifetime. Approval is not inferred from
the client's retry. Pending grants and issued grants expire when the source
changes or the canvas is retired, even if a later canvas reuses the same URI.
Direct local rendering uses the client's own policy, not this host-side grant.

A missing canvas, missing asset, or source that is no longer live returns
`NotFound`. That error does not distinguish these cases; clients use the canvas
and chat state to determine whether the canvas still exists and has a source.
The host MUST clear `url` when the provider becomes unavailable. Old content
URIs MUST NOT continue to grant access after their canvas or source is retired.
An admitted read MUST be cancelled or have its authority rechecked before
releasing content if that authority is revoked while the read is pending.

Clients MUST NOT reuse source URIs from persisted state after a provider or
host restart. They re-subscribe and use the current state. A source URI change
invalidates the old document's resource-resolution base; clients reload from
the new source rather than mixing assets from different source lifetimes.

The shared [confidentiality rules](/specification/resource-reads#confidentiality-and-rendering)
apply. A URI published in `CanvasState.url` is visible to authorized
subscribers. To keep backing URLs or credentials from those subscribers, the
host must publish an indirect URI rather than the private URL itself.

## Compatibility and Scope

Without negotiated Resource Reads, hosts MUST retain the existing HTTP(S)
source shape. If no compatible source can be exposed, they omit `url` for that
client; they MUST NOT send an unfamiliar content scheme to a legacy renderer.
Non-HTTP(S) sources require negotiation and a scheme advertised by the host.
The existence of a canvas or agreement on protocol 1.0 does not imply content
read support.

This contract retrieves finite documents and assets. It does not define
canvas open/close requests, action invocation, provider registration, native
client canvases, or live HTTP proxying. TCP channels are the separate mechanism
for applications that need a full network stream.
