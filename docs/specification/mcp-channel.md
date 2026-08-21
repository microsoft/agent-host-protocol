# The `mcp://` Channel

<StabilityIndex level="1.2" />

The `mcp://` channel is an optional side-channel that lets an AHP client originate a constrained subset of [MCP](https://modelcontextprotocol.io/) traffic against an MCP server the agent host is already running. It is the wire format AHP uses whenever a client needs to talk MCP — but only as much MCP as the host has explicitly opted into exposing.

The channel itself is generic. The set of methods and notifications it actually serves is determined entirely by capability advertisements on the customization it hangs off. Today the only such advertisement is [`AhpMcpUiHostCapabilities`](/reference/session#ahpmcpuihostcapabilities) (used by [MCP Apps](/guide/mcp#mcp-apps)), but additional domain-specific capability sets MAY be added in the future without changing the channel itself.

## Wire format

The channel speaks [MCP](https://modelcontextprotocol.io/specification) verbatim — JSON-RPC 2.0 requests, responses, and notifications exactly as defined by the upstream MCP specification. AHP does not redefine the request/response shapes or notification payloads; consult MCP for those.

The only AHP-level addition is the routing envelope shared by every AHP message: each request, response, and notification carries a top-level `channel: URI` whose value is the [channel URI](#channel-uri) exposed on the owning customization. The receiver routes the message by `channel` exactly the same way it routes any other AHP traffic — no per-method dispatch logic is needed.

Because the channel piggybacks on the existing AHP transport rather than opening a fresh MCP connection to the server, by the time a client opens the channel the upstream server is already past MCP `initialize` (or it isn't `ready` and the channel is unavailable); the client is joining an in-flight session. As a consequence:

- The MCP `initialize` / `initialized` handshake is **not** carried over the channel.
- Methods that are state-bearing in MCP and already mirrored by AHP (e.g. tool execution lifecycle, session state) are **not** served over the channel — clients use the corresponding AHP actions and state.
- Only the methods explicitly enabled by a capability advertisement on the channel's owning customization are served. Everything else MUST be rejected by the host.

The host serves the channel; the client originates traffic on it.

## Negotiating the served surface

The set of methods a client may send (and the set of notifications the host promises to forward) is the **union** of every capability advertisement attached to the channel's owning customization. Each capability set covers a specific feature area; a server that needs more surface area than one capability set provides advertises additional ones.

Currently the only defined capability set is [`AhpMcpUiHostCapabilities`](/reference/session#ahpmcpuihostcapabilities), which covers what MCP Apps need:

| Capability flag | Methods served (Client → Host → Server) | Notifications forwarded (Server → Host → Client) |
|---|---|---|
| `serverTools` | `tools/list`, `tools/call` | `notifications/tools/list_changed` *(when `listChanged: true`)* |
| `serverResources` | `resources/list`, `resources/templates/list`, `resources/read` | `notifications/resources/list_changed` *(when `listChanged: true`)* |
| `logging` | `logging/setLevel`, `notifications/message` | — |
| `sampling` | `sampling/createMessage` | — |

A method outside every advertised capability set MUST be rejected by the host with JSON-RPC `-32601` *Method not found*. Clients SHOULD NOT speculate beyond the advertisement — capability sets are the only source of truth for what's served.

How the host satisfies a served method (proxying it upstream to the MCP server, handling it inside the agent harness, or some mixture) is an implementation detail and not specified here. The advertisement guarantees the method is **served**, not how it's served.

## Channel URI

The channel URI is exposed on the customization that owns it. Today that means [`McpServerCustomization.channel`](/reference/session#mcpservercustomization); future customizations that warrant a side-channel MAY follow the same pattern.

The URI itself is opaque to the client. Its scheme is `mcp://`; its path and authority are host-defined.

- There is at most one channel per customization within a session.
- The host MAY only expose `channel` while the owning customization is in a usable runtime state (for `McpServerCustomization` that's `state.kind === 'ready'`). When that condition no longer holds, the host MAY clear `channel` via the customization's update action. Clients SHOULD treat the channel as unavailable while it is absent.
- The URI SHOULD be stable across the customization's lifetime, but the host MAY change it (for example after a restart). Clients MUST re-read `channel` whenever the customization is updated.
- The channel is only present when the owning customization advertises at least one capability set requiring it. Customizations without such an advertisement do not need a side-channel — their state is already covered by AHP's normal flows.

## Next steps

- [MCP Servers](/guide/mcp) — how the customization the channel hangs off works.
- [Session Channel Reference](/reference/session#ahpmcpuihostcapabilities) — type definition for `AhpMcpUiHostCapabilities` (the first capability set served on this channel).
