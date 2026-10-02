# Proposal: session-scoped direct TCP channels

**Status:** experimental protocol implementation; not a shipped browser feature.

## Motivation

An agent starts a dev server in its execution environment and asks a browser
running on the user's machine to open `http://localhost:3000`. Local browser
networking reaches the wrong loopback. Published ports and rewritten URLs do
not generally preserve redirects, private DNS, multiple ports, WebSockets,
HTTPS, or origin-sensitive authentication.

The invariant is: a browser opened for a session reaches destinations through
that session's Agent Host connection, rather than the browser machine's network.
The session scopes ownership and lifetime; it does not make the transport an
implementation of the agent's tool permissions or sandbox. Tools delegated to a
different runtime do not implicitly retarget the host TCP endpoint.

```text
Browser -> client-local authenticated proxy -> existing AHP connection
        -> private ahp-tcp channel -> host network -> destination
```

The browser proxy should consume a provider-neutral duplex stream. It should
not know whether AHP arrived over SSH, WSL, Remote Agent IPC, a tunnel, or a
cloud relay.

## Selected design

The [TCP channel specification](../specification/tcp-channel.md) and canonical
types implement this baseline:

- Host-only `tcpConnections` capability, with base64 as the mandatory encoding.
- Atomic `subscribe.create` under a parent session; host-assigned private URI.
- Ordered actions for input/output, cumulative consumed offsets, EOF, close,
  and reset.
- Bounded per-direction byte credit, with no payload in reducer state.
- Same-socket recovery using AHP's logical-client replay; never snapshot-only
  recovery or replacement-socket replay.

This follows SSH [RFC 4254 sections 5 and 7.2](https://www.rfc-editor.org/rfc/rfc4254)
for independent channels, destination connections, byte credit, half-close,
and two-sided close. It does **not** claim SSH transport compatibility or SSH
reconnection: AHP deliberately uses cumulative offsets and bounded replay over
a replaceable transport instead of SSH's additive window updates and
transport-scoped channel lifetime.

## Alternatives

**Separate SOCKS/CONNECT proxy:** efficient, standard byte protocol, but requires
a second reachable data-plane binding for every carrier/runtime. It does not
meet the baseline goal of working over any existing AHP connection.

**Stateless notifications:** simpler, but discards AHP replay and acknowledgments.
The selected design preserves original sockets only when byte history is intact.

**Binary transport frames:** avoids base64's roughly 33% bandwidth overhead but
changes every transport and SDK. Deferred, not necessary for interoperability.

**Generic stream framework:** possible later; no speculative listener, reverse
connection, datagram, durable payload, or universal execution-context API here.

## Rollout and review questions

This patch does not bump the protocol version. New actions use the current
registry version; support is gated by the explicit experimental capability,
not by version comparison alone. Release assignment remains a maintainer task.

The wire additions are optional and preserve old request/response shapes.
Native source compatibility is distinct: Rust callers constructing
`SubscribeParams`, `InitializeResult`, or `ReconnectSnapshotResult` with struct
literals must supply the new optional fields (`None` preserves old behavior).
Exhaustive matches over generated `SnapshotState` must handle the TCP variant.
Use the existing subscribe constructors when no creation is needed. No promise
of native binary compatibility is made for regenerated SDK assemblies.

Before enabling it in a host:

1. Implement and test its host-network adapter, session ownership, and any
   transport destination restrictions.
2. Use the SDK's owned TCP connection adapter rather than reusing a lossy UI
   queue; bridge its byte operations to the application's native stream.
3. Test disconnect at every open/write/EOF/close boundary, concurrent clients,
   pending-action reconciliation, replay exhaustion, and explicit unsubscribe.
4. Connect VS Code's existing local browser proxy to that adapter.
5. Measure page-load latency and control-message latency under large bundles,
   source maps, WebSockets, slow receivers, and concurrent transfers.

Maintainer review should focus on create-on-subscribe, mandatory replay-only
recovery, and private-channel replay budgeting. No separate binary framing,
mixed per-channel replay result, or public endpoint is introduced.
