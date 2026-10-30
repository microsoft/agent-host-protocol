# Canvas Channel

<StabilityIndex level="1" />

A canvas is a web surface that an agent's extension serves from the host's
environment, such as a preview or a dashboard. Chat state lists open canvases
in `ChatState.canvases`. Each entry names an `ahp-canvas:` URI. Clients treat
the URI as opaque and subscribe to it to receive the canvas's `CanvasState`.
The type reference is on the [Canvas Channel reference](/reference/canvas) page.

`CanvasState.url` is the canvas's live HTTP(S) source. It is often a loopback
address in the host's environment, so a remote client usually can't load it.
A host can let such a client read the source through `resourceRead` instead,
as described below. The client never has to resolve or fetch the source URL
itself.

## Reading Canvas Content

A host MAY serve canvas content through
[`resourceRead`](/reference/common#resourceread). A host that does so accepts
two forms of URI:

| URI | Reads |
|---|---|
| `<canvas>` | The source URL exactly as `CanvasState.url` gives it, including its query. |
| `<canvas>/<path>` | `<path>` resolved against `CanvasState.url` as a relative reference ([RFC 3986, section 5](https://www.rfc-editor.org/rfc/rfc3986#section-5)). |

`<canvas>` is the canvas's channel URI, for example `ahp-canvas:/9f2c…`. `<path>`
is one or more `/`-separated segments. Each segment is non-empty,
percent-encoded, and is neither `.` nor `..`. `<path>` contains no `?` or `#`.
Because the reference is relative, the result keeps the source URL's scheme,
host and port, replaces the last segment of its path, and drops its query and
fragment. A browser that loaded the source would request the same URL for a
relative subresource.

For example, if `CanvasState.url` is
`http://127.0.0.1:41234/preview/index.html?token=abc`:

| `uri` | Host fetches |
|---|---|
| `ahp-canvas:/9f2c…` | `http://127.0.0.1:41234/preview/index.html?token=abc` |
| `ahp-canvas:/9f2c…/assets/app.js` | `http://127.0.0.1:41234/preview/assets/app.js` |

```jsonc
// Client → Server
{ "jsonrpc": "2.0", "id": 21, "method": "resourceRead",
  "params": { "channel": "ahp-root://", "uri": "ahp-canvas:/9f2c…/assets/app.js", "encoding": "base64" } }

// Server → Client
{ "jsonrpc": "2.0", "id": 21, "result": {
  "data": "Y29uc29sZS5sb2coImhpIik7",
  "encoding": "base64",
  "contentType": "text/javascript"
}}
```

A host that serves canvas content:

- MUST authorize the read as it would a subscription to the canvas channel.
- MUST answer `NotFound` (`-32008`) when the canvas doesn't exist, or when its
  state has no `url`.
- MUST answer `InvalidParams` (`-32602`) for a `<path>` that doesn't follow
  the rules above.
- MUST send an HTTP `GET` and MUST NOT follow a redirect to a different origin.
  If the source answers with a status other than 2xx, the host fails the read.
  It SHOULD answer `NotFound` for `404` and `410`.
- SHOULD report the response's `Content-Type` as `contentType`.
- MAY bound the size of the content and the time it spends on the read, and
  fail a read that exceeds either bound.
- MUST NOT include the source URL, its query, or the response's headers in an
  error message or a diagnostic log. The source URL often carries a
  credential.

A host that doesn't serve canvas content rejects these URIs as it rejects any
other URI it can't read, typically with `PermissionDenied` (`-32009`) or
`NotFound`.

Canvas content comes from an extension in the host's environment. A client
that displays it SHOULD isolate it from the client's own origin, for example in
a sandboxed frame.
