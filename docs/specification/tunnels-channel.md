# Tunnels Channel

The tunnels channel coordinates port forwards that AHP clients establish
through implementation-defined facilities such as SSH forwarding, remote
development transports, or managed tunnel services. AHP synchronizes the
request and lifecycle state; it does not carry forwarded bytes or prescribe
the underlying mechanism.

## URI and discovery

The host advertises support through `InitializeResult.tunnels`:

```json
{
  "tunnels": {
    "channel": "ahp-tunnels://"
  }
}
```

The advertised URI identifies the state-bearing `TunnelsState` channel. The
host advertisement means only that it maintains the authoritative state.
Clients separately advertise the directions they can establish through
`ClientCapabilities.tunnels`.

## State

`TunnelsState.ports` contains every visible port-forward request.
Entries are keyed by a stable `ahp-tunnel:/<id>` resource URI but are not
independently subscribable.

A direction describes where a service becomes reachable:

- `hostToClient` makes a host-side service reachable through one or more
  client-side listening addresses.
- `clientToHost` makes a service reachable from one client available through a
  host-side listening address.

TCP traffic remains bidirectional in either case.

Each assigned client owns establishment of its forwarding attempt and reports
its lifecycle independently. A `hostToClient` entry therefore has a `clients`
array, while a `clientToHost` entry has exactly one `client`.
`requestedLocalAddress` and `requestedRemoteAddress` live on the port entry
because every assigned client attempts the same requested mapping. These are
requests, not proof that the addresses were successfully established.

## Lifecycle

Client forwarding attempts progress through the following states:

```text
pending -> accepted -> ready
                    \-> failed
pending -> declined
* -> unavailable
```

When a requested local port is `0`, the forwarding implementation allocates an
available port. The `ready` state carries the effective local and remote
addresses, including the allocated non-zero port.

## Actions

- `tunnel/portSet` adds or replaces a complete entry. It may be dispatched by
  either a client or the host.
- `tunnel/portClientSet` adds or replaces a complete participating client. On
  `clientToHost`, it replaces the single responsible client.
- `tunnel/portClientUpdated` replaces the lifecycle state for one client-owned
  attempt. The host must verify that a client action's origin matches the
  supplied `clientId`.
- `tunnel/portClientRemoved` removes a participant from `hostToClient`. It is a
  no-op on `clientToHost`, whose required client can only be removed by deleting
  the complete port.
- `tunnel/portRemoved` removes an entry and coordinates cleanup. Clients may
  dispatch it directly.

All actions reduce state directly. The host validates client-dispatched actions
before broadcasting them in server order; rejected actions use the standard
`ActionEnvelope.rejectionReason` reconciliation path.

## Reconnection

Tunnels data is ordinary replayable AHP state. Reconnection restores the
host's latest knowledge of requests and client-reported lifecycle.

The underlying forwarding mechanism is outside AHP and may or may not survive
a disconnected client. The host should mark a participant `unavailable` when
it can no longer rely on that client to maintain the forward.

## Security

The host remains the authorization boundary even though clients establish the
actual forwarding:

- validate every requested mapping and participant assignment;
- reject lifecycle updates for another `clientId`;
- default listeners to loopback unless broader exposure is explicitly allowed;
- treat remote target selection as network-access capability;
- bound the number of active entries and participants.
