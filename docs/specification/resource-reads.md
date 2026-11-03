# Resource Reads

<StabilityIndex level="1.0" />

`resourceRead` retrieves a resource's finite content through the existing AHP
connection. It is symmetrical: either peer can read resources that the other
peer exposes. The wire types are in the [Common reference](/reference/common#resourceread).

Hosts SHOULD make advertised renderable content, including HTTP(S) sources,
readable through this method for clients that cannot retrieve it directly.
Examples include canvas documents, images, and referenced tool output. This is
not an unrestricted HTTP proxy: publishing a reference does not grant authority
to fetch any resource supplied by a caller or provider.

This page defines an **opt-in extension** to existing resource reads. It adds
scheme discovery, effective content URIs, and typed failures. It does not add
an HTTP method, header, cookie, status, range, or streaming API.

## Negotiation

A client offers the contract in `InitializeParams.capabilities.resourceRead`.
The host accepts in `InitializeResult.resourceRead`:

```jsonc
// Client -> Server
{ "jsonrpc": "2.0", "id": 1, "method": "initialize",
  "params": { "channel": "ahp-root://", "clientId": "reader-1",
    "protocolVersions": ["1.0.0"],
    "capabilities": { "resourceRead": { "schemes": [] } } } }

// Server -> Client
{ "jsonrpc": "2.0", "id": 1, "result": {
  "protocolVersion": "1.0.0", "serverSeq": 1, "snapshots": [],
  "resourceRead": { "schemes": ["http", "https", "canvas-content"] }
} }
```

Each list names the schemes **that peer serves under this contract**, as
distinct lowercase RFC 3986 scheme names without `:` (`[a-z][a-z0-9+.-]*`).
It is not an inventory or allowlist of every scheme the peer can read.
The empty client list offers support as a reader without changing any
reverse-direction reads. A client can keep serving `file:` and `virtual:`
resources with its existing behavior while offering `{"schemes":[]}`. To
apply the new semantics to its `virtual:` reads, it includes `virtual`.

Hosts MUST decline an absent or malformed `resourceRead` offer by omitting
`InitializeResult.resourceRead`. A malformed optional offer MUST NOT, by
itself, fail `initialize`. Hosts SHOULD record a sanitized diagnostic naming
the invalid capability, without echoing its values. This tolerance applies
only to this optional member, not to malformed JSON-RPC or required initialize
parameters. Hosts using strict native decoders must discard the invalid
optional member before decoding the remaining `InitializeParams`; the
generated model's typed `schemes` field is not weakened.

For example, this malformed offer leaves the optional feature off while the
otherwise valid connection initializes:

```jsonc
// Client -> Server
{ "jsonrpc": "2.0", "id": 7, "method": "initialize",
  "params": { "channel": "ahp-root://", "clientId": "reader-1",
    "protocolVersions": ["1.0.0"],
    "capabilities": { "resourceRead": { "schemes": "http" } } } }

// Server -> Client: no resourceRead acceptance.
{ "jsonrpc": "2.0", "id": 7, "result": {
  "protocolVersion": "1.0.0", "serverSeq": 1, "snapshots": []
} }
```

Clients MUST fail initialization on a malformed or unsolicited acceptance
rather than enable an ambiguously active contract. A valid capability is an
object with a required array of distinct valid scheme strings; unknown fields
are ignored for forward compatibility. Missing or non-array `schemes`,
non-string members, invalid scheme names, and duplicates are malformed.

The host MUST NOT accept an absent offer. Presence on both sides enables the
contract **only for each receiver's listed schemes**. The lists need not
intersect: client-to-host reads use the host's list; reverse reads use the
client's. A listed scheme promises these semantics, not access to every URI
or a guarantee that a resource is still live.

Unlisted schemes retain their existing reads and permission policy. Callers
MAY continue to request them, and receivers MUST NOT reject a supported read
solely because its scheme is unlisted. Effective-URI handling, typed failures,
and HTTP mediation are not promised for those reads. On a negotiated
connection, a receiver MAY use `ResourceReadFailed` / `unsupportedScheme` when
it does not serve a scheme **at all**; a missing advertisement alone is never
sufficient to produce that error.

With the offer and acceptance above:

| Direction | Requested URI | Behavior |
|---|---|---|
| Client to host | `canvas-content://c1/preview` | Resource Reads contract |
| Client to host | `file:///workspace/readme.md` | Existing file-read behavior |
| Client to host | `ahp-changeset:/c1/content` | Existing changeset-read behavior |
| Host to client | `file:///workspace/input.txt` | Existing reverse file-read behavior |
| Host to client | `virtual://client/plugin.json` | Existing reverse virtual-read behavior |

The offer and acceptance apply for the initialized connection and any
continuation through `reconnect`; peers MUST retain both lists with that
agreement. If either peer cannot recover the
agreement, it must establish a fresh initialized connection before relying on
these semantics.

If either member is absent, existing resource-read behavior is unchanged. In
particular, absence does not mean an older host cannot read files or existing
content references. It means the new contract is **not negotiated**: callers
MUST NOT infer HTTP(S) mediation, effective-URI handling, or the new failure
details from the protocol version or the presence of a resource reference.
Receivers MUST NOT introduce base-changing redirects that rely on
`effectiveUri` for such callers. They must retain legacy behavior, reject the
new read path, or advertise a compatible, directly addressable source.

The following rules apply to reads covered by the receiver's scheme list.
They do not impose new semantics on unlisted legacy schemes.

## URI Resolution

Requests address the advertised **content URI**, not a URI synthesized from a
state channel. Under this contract, `uri` MUST be absolute and fragment-free.
Malformed URIs return `InvalidParams`.

A renderer resolves references against the URI of the **containing resource**,
using RFC 3986 section 5 and the document format's base-URI rules. After a read,
that URI is `result.effectiveUri` when present, otherwise the requested URI.
References within a stylesheet use the stylesheet's effective URI, not the
entry document's. A document-defined base is still subject to renderer policy
and does not grant authority to read the resulting resources.

The renderer retains fragments for local navigation but removes them from
fetch requests. A fragment-only navigation does not require another read.
Trailing slashes, resource-specific queries, and percent escapes retain their
normal meaning. Dot segments are resolved before authorization; they are not
categorically forbidden.

For a containing resource at
`http://127.0.0.1:41234/preview/index.html?token=abc`:

| Reference | Resolved resource URI |
|---|---|
| `assets/app.js?v=2` | `http://127.0.0.1:41234/preview/assets/app.js?v=2` |
| `docs/` | `http://127.0.0.1:41234/preview/docs/` |
| `../shared.css` | `http://127.0.0.1:41234/shared.css` |
| `/assets/logo.svg` | `http://127.0.0.1:41234/assets/logo.svg` |
| `?view=2` | `http://127.0.0.1:41234/preview/index.html?view=2` |
| `#details` | `http://127.0.0.1:41234/preview/index.html?token=abc` |

The last row is a local navigation, not an instruction to fetch again. A query
on the entry document is not an ambient credential: clients MUST NOT copy it
onto subresource URLs. Resource-specific credentials are the serving peer's
responsibility.

Hosts MAY publish indirect content URIs instead of their private backing
locations. An indirect tree with relative resources MUST expose a hierarchical
namespace that preserves the same resolution behavior, including root-relative
references. Its authority and path need not reveal anything about the backing
host. A scheme such as `canvas-content://c1/preview/index.html` is an example,
not a standardized scheme. Public URI resolution and authorization MUST NOT
depend on parsing the opaque canvas subscription URI.

Indirection is not arbitrary HTML rewriting. Content must have usable
references in the public namespace, or the renderer must have separate,
authorized access to the absolute resources it references. This contract does
not make arbitrary websites portable into an isolated frame.

## HTTP-Backed Reads and Redirects

For HTTP(S)-backed resources, the receiver MUST issue a `GET` without a request
body. Only a final 2xx response succeeds. It SHOULD report a valid upstream
`Content-Type` as `contentType`; it MUST NOT report an HTTP error page as a
successful resource.

The receiver MAY follow a finite number of same-origin redirects. It MUST NOT
follow a redirect to a different backing origin (scheme, host, or effective
port), and MUST check its resource policy at every hop before network I/O.
Same-origin is a necessary condition, not a grant of access to every path.

If following a redirect changes the public URI of the returned content,
`effectiveUri` MUST contain that final absolute, fragment-free **public** URI.
If unchanged, the field SHOULD be omitted. Callers MUST use the effective URI
for relative references. For an indirect resource, the receiver MUST map the
final location into the public namespace rather than disclose the backing
location. The effective URI MUST remain within the original public origin and
authorized namespace. For a non-HTTP(S) hierarchical content URI, this means
unchanged scheme and authority, not equality of a browser's opaque-origin
value (which may be `null` for multiple unrelated custom-scheme resources).
Readers MUST reject a malformed effective URI or one outside that public
origin instead of using it as a base. If the receiver cannot preserve this
relationship, it MUST fail the read rather than silently return content with
the wrong base.

For example, `/preview` may redirect to `/preview/`:

```jsonc
// Client -> Server
{ "jsonrpc": "2.0", "id": 2, "method": "resourceRead",
  "params": { "channel": "ahp-root://",
    "uri": "canvas-content://c1/preview", "encoding": "base64" } }

// Server -> Client
{ "jsonrpc": "2.0", "id": 2, "result": {
  "data": "PGgxPkhlbGxvPC9oMT4=", "encoding": "base64",
  "contentType": "text/html", "effectiveUri": "canvas-content://c1/preview/"
} }
```

`app.js` now resolves to `canvas-content://c1/preview/app.js`, not
`canvas-content://c1/app.js`. The same rule applies to directory-changing
redirects of stylesheets and other resources.

Reads do not forward caller-supplied cookies, authorization headers, or other
HTTP headers. A receiver MUST NOT attach ambient host credentials or proxy
credentials to a source without an explicit resource-specific grant. This
contract does not create a shared browser cookie jar or forward `Set-Cookie`.

## Authorization

Before reading, the receiver MUST establish both:

1. The caller may access the advertised resource in its owning context.
2. The receiver may access the backing source using its own filesystem and
   network authority.

Neither provider registration, URI knowledge, a scheme advertisement, nor a
loopback address proves source ownership. A host may authorize a source it
created and controls or use an applicable operator preauthorization.
For a provider-supplied HTTP(S) canvas source without such authorization, it
MUST use the [canvas origin-grant flow](#canvas-origin-grants) before fetching.
This flow authorizes a destination; it does not require per-OS listener or
process-ownership inspection.

The receiver MUST enforce policy against the actual interpreted destination,
including URI normalization, decoded paths, resolved network addresses,
redirects, and configured proxies. Subresource resolution does not expand
access. A root-relative or parent-relative reference is valid syntax but may
still be denied.

Use the existing [resource permission flow](/reference/common#resourcerequest)
when access can be granted. An advertised source does not require a new prompt
for every asset when an applicable grant already exists. Grants remain
revocable: pending reads MUST NOT release content under revoked authority.
An implementation may conceal a resource's existence with `NotFound` instead
of `PermissionDenied`, consistently with its privacy policy.

### Canvas Origin Grants

A canvas origin grant permits **read-only GET access to one backing HTTP(S)
origin** (scheme, host, and effective port), for one authenticated caller and
one live canvas source. It covers all paths and queries on that origin, not
an implicit path prefix. It grants no writes, other origins, other canvases,
or ambient host credentials. Public resource mappings and independent host
policy may restrict access further; a grant does not expose unregistered
content or override a denial that a user is not allowed to lift.

When that grant could enable a denied canvas read, the host MUST return
`PermissionDenied` with `PermissionDeniedErrorData.request` containing a
read-only `ResourceRequestParams`. Its `uri` is an **opaque, host-issued
permission-request URI**, not the backing origin or the content URI. The host
registers it against the caller's security context, canvas registration
incarnation, current source lifetime, and canonical backing origin. This
keeps private backing URLs out of error data and makes a stale approval
unable to authorize a different canvas or a replacement source.

Public content URIs MUST resolve to an unambiguous canvas source registration
for this check. If a backing URL is shared by different canvas lifetimes or
callers with different grants, the host must publish distinct indirect content
URIs rather than select a grant merely because the backing origin matches.

The client MAY forward that exact request through `resourceRequest`. The
host validates the binding and decides whether to grant, deny, or prompt
through its trusted permission flow. Its UI MAY be rendered on a client; it
does not require a GUI on the host. The host supplies and validates the scope.
Forwarding the request is **not consent**.
If a prompt is needed, the host MUST identify the owning canvas and backing
origin and explain that access covers all paths and queries, is read-only,
and lasts only while that canvas source remains live. The prompt MUST omit
userinfo, source paths, queries, and credentials. A generic prompt containing
only the opaque request URI is insufficient. The client need not infer a
scope from a URL or implement a different grant flow per host.

If the host cannot obtain the necessary trusted approval, it MUST retain the
denial. A host with no grantable path omits `data.request`; clients MUST NOT
construct a broader origin request, treat denial as permission to fetch
locally, or automatically retry permission requests after refusal.

For example, `resource-grant:/g1` below is an illustrative host-issued URI;
its spelling and scheme are not prescribed. It is accepted by `resourceRequest`
and is not a content resource or a scheme to put in `resourceRead.schemes`.

```jsonc
// Host denies a canvas content read pending an origin grant.
{ "jsonrpc": "2.0", "id": 4, "error": {
  "code": -32009, "message": "Canvas source access requires approval",
  "data": { "request": {
    "channel": "ahp-root://", "uri": "resource-grant:/g1", "read": true
  } }
} }

// Client forwards the request; the host owns the approval decision.
{ "jsonrpc": "2.0", "id": 5, "method": "resourceRequest",
  "params": { "channel": "ahp-root://", "uri": "resource-grant:/g1", "read": true } }

// Host approves, then the client retries the original content URI.
{ "jsonrpc": "2.0", "id": 5, "result": {} }
{ "jsonrpc": "2.0", "id": 6, "method": "resourceRead",
  "params": { "channel": "ahp-root://",
    "uri": "canvas-content://c1/preview/index.html", "encoding": "base64" } }
{ "jsonrpc": "2.0", "id": 6, "result": {
  "data": "PGgxPkhlbGxvPC9oMT4=", "encoding": "base64", "contentType": "text/html"
} }
```

`resourceRequest` succeeds with its existing empty result only after approval
or an applicable preauthorization. It grants access to retry the original
content read and its authorized same-origin assets, not to fetch the
permission-request URI. For these request URIs, `read` MUST be `true` and
`write` MUST be absent or `false`; other values return `InvalidParams`. An
unknown, expired, or foreign request URI MUST NOT grant anything and returns
`NotFound`. A refused approval returns
`PermissionDenied` without another automatically actionable grant request.
Grant issuance must be bounded and idempotent for repeated reads of the same
live scope, so concurrent asset requests do not create an unbounded prompt
queue. Replaying an already-approved request while its binding is still live
may return success without another prompt, but MUST NOT extend its lifetime.

Both pending requests and issued grants MUST expire when the canvas closes,
the provider becomes unavailable, the source is replaced (even on the same
origin), the caller loses access, or the host restarts. A reused canvas URI,
instance ID, or listening port MUST NOT resurrect the grant. The host rechecks
the binding when approval completes and before releasing content; source
retirement during a pending approval or read cannot grant or release content
for its replacement. A reconnect may retain a grant only when the host
verifies continuity of the authenticated caller and the same live canvas
source; a claimed `clientId` alone is insufficient.

This is explicitly stricter than direct local rendering: a client that loads
`CanvasState.url` itself uses its own renderer/network policy and does not
perform this host-side grant exchange. The added check protects the remote
host's authority. A grant authorizes an origin during a bounded source
lifetime; it is not an attestation about which process owns a listening socket.

## Bounds and Failures

A receiver MUST impose finite limits on admission, concurrent reads, read
duration, body size, encoded message size, and aggregate retained response
memory. These are implementation limits, not universal AHP numbers.

The read deadline includes waiting for admission and source I/O. Reply
delivery MUST also be bounded: queued and in-flight responses retain their
memory budget until delivered or discarded. A stalled writer must not allow
an unbounded accumulation of completed bodies. If a failure response cannot
be delivered within the connection's delivery policy, terminate the connection
rather than retain it indefinitely. Connection teardown cancels outstanding
work.

Slow source I/O MUST NOT monopolize unrelated command processing. AHP does not
require a dedicated worker per canvas or promise that concurrent canvas reads
never queue behind one another.

Binary content uses base64. UTF-8 is allowed only for valid text and remains
subject to the **serialized** response bound, including JSON escaping.
Receivers MAY fall back to base64 when text encoding would exceed that bound,
as permitted by `ResourceReadResult`. A successful result contains the entire
resource, never a silently truncated prefix. Callers MUST enforce their own
transport, decoding, and rendering limits.

`resourceRead` responses are not subscription messages.
[Windowed delivery](/specification/windowed-delivery) does not bound or
fragment them; transport-specific fragmentation must still respect these
limits.

| Failure | Error |
|---|---|
| Malformed absolute URI or a fragment in the fetch URI | `InvalidParams` (`-32602`) |
| Authentication required | Existing `AuthRequired` (`-32007`) and its data |
| Resource missing, retired, or HTTP 404/410 | `NotFound` (`-32008`) |
| Caller or source-policy denial, including an off-origin redirect | `PermissionDenied` (`-32009`), subject to the privacy rule above |
| Scheme not served at all (not merely unlisted) | `ResourceReadFailed` (`-32013`), `kind: "unsupportedScheme"` |
| Body or serialized response exceeds a size limit | `ResourceReadFailed`, `kind: "tooLarge"` |
| Read deadline exceeded | `ResourceReadFailed`, `kind: "timeout"` |
| Admission or response capacity unavailable | `ResourceReadFailed`, `kind: "busy"` |
| Other upstream status, source failure, redirect loop, or unrepresentable redirect | `ResourceReadFailed`, `kind: "upstream"` |

`ResourceReadFailed` requires the named `ResourceReadFailedErrorData` payload.
For example:

```json
{ "jsonrpc": "2.0", "id": 3, "error": {
  "code": -32013, "message": "Resource exceeds the read size limit",
  "data": { "kind": "tooLarge" }
} }
```

Callers MUST treat unknown future failure kinds as failed reads and MUST NOT
parse diagnostic strings to decide behavior. A failure does not itself
authorize retries, access expansion, or a fallback to a different network.
`Conflict` is an optimistic-concurrency error, not a queue-full signal.

## Confidentiality and Rendering

Receivers MUST NOT include backing URLs, credentials, resource queries,
response headers, or raw upstream diagnostics in errors or diagnostic logs.
Logs may identify the owning session, resource registration, and failure kind
without disclosing those values. This includes generic RPC tracing for
requests, results, and errors; redacting only the HTTP fetcher's logs is not
sufficient.

The backing origin displayed in the trusted origin-grant prompt is an
intentional disclosure to the approving user, not an exception for error
payloads or logs. Indirect content URIs and opaque permission-request URIs
continue to conceal the full backing URL from protocol consumers.

An intentionally published content URI is visible to the authorized peer.
If even that peer must not see a backing address or credential, the receiver
must publish an indirect URI and keep effective URIs in that public namespace.
URI indirection does not sanitize secrets embedded in the content itself.

Resource content remains untrusted. Renderers SHOULD isolate it from their
privileged origin and APIs and apply their own MIME and navigation policies.
Support for a URI scheme means content retrieval, not permission to execute
the URI through an OS handler.

## Compatibility

The capability members, `effectiveUri`, and `ResourceReadFailed` details are
additive wire changes. Existing peers need not implement this feature. Older
clients must not be assumed to understand new content schemes or redirect
bases simply because they can deserialize a URI string.

Clients adopting the feature must update to models that expose the new fields,
offer the capability, check acceptance and per-scheme coverage, and propagate
each covered resource's effective URI to their renderer. Opting in MUST NOT
disable existing unlisted file, changeset, or reverse-resource reads.
Hosts must update their read implementation and publish
compatible canvas state per connection. Generated models alone do not perform
negotiation, fetching, authorization, or renderer integration.

Wire compatibility does not guarantee source or binary compatibility of a
generated SDK update. Rust consumers using exhaustive struct literals must
initialize the new optional members (or use an available default); native
consumers must rebuild against the updated models. No protocol or package
version is bumped by this proposal; release coordination follows the normal
repository process.
