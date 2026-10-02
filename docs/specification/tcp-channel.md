# TCP Channel

<StabilityIndex level="1" />

An optional `ahp-tcp:` channel carries one outbound TCP connection from the
agent host's network, scoped to an agent session. It uses the existing JSON-RPC transport,
subscriptions, and ordered actions. No auxiliary endpoint or transport-specific
forwarder is required. See the [design proposal](../proposals/tcp-channels.md)
for motivation and alternatives, and the [type reference](../reference/tcp.md)
for the wire definitions.

## Capability and scope

The host advertises `InitializeResult.tcpConnections`:

```json
{ "encodings": ["base64"], "maximumConnectionsPerClient": 64 }
```

Absence means unsupported. Clients MUST NOT use TCP creation without this
capability; an older host might otherwise ignore `subscribe.create` and
subscribe to the parent session. Hosts implementing the capability MUST reject
unknown creation kinds and unsupported encodings with `InvalidParams`.

Only the host advertises support: it never opens a connection into the client.
The client opts in by creating a channel. Capability presence does not grant
permission to reach any particular destination.

The parent session scopes ownership and lifetime. DNS, loopback, and IP routes
belong to the host endpoint handling the channel, not the client browser.
This transport capability does not reproduce an agent's tool-permission system
or command sandbox. A session whose tools execute in another runtime does not
implicitly move the TCP endpoint into that runtime. Clients MUST NOT infer
network equivalence from workspace or session identifiers.

## Atomic creation and subscription

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "subscribe",
  "params": {
    "channel": "ahp-session:/s1",
    "create": {
      "type": "tcpConnection",
      "host": "localhost",
      "port": 3000,
      "encoding": "base64",
      "receiveWindowBytes": 1048576,
      "maximumChunkSize": 32768
    }
  }
}
```

The host authenticates the caller, checks access to the session, validates
the target and any transport access restrictions, resolves the destination,
and connects before returning success.
`host` is a nonempty DNS name or IP literal, not a URL; `port` is an integer in
`[1, 65535]`. Receive windows are integers in `[1, 2^32 - 1]`; chunk limits are
integers in `[1, receiveWindowBytes]`. Implementations MUST enforce smaller
resource limits where necessary.

The host assigns an unpredictable URI and installs a private subscription:

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "result": {
    "snapshot": {
      "resource": "ahp-tcp:/opaque-id",
      "fromSeq": 42,
      "state": {
        "session": "ahp-session:/s1",
        "target": { "host": "localhost", "port": 3000 },
        "encoding": "base64",
        "input": {
          "windowBytes": 1048576, "maximumChunkSize": 32768,
          "receivedBytes": 0, "consumedBytes": 0
        },
        "output": {
          "windowBytes": 1048576, "maximumChunkSize": 32768,
          "receivedBytes": 0, "consumedBytes": 0
        },
        "clientClosed": false,
        "hostClosed": false
      }
    }
  }
}
```

Unlike normal subscribe, `snapshot.resource` is the new child, not
`params.channel`. Creation MUST NOT subscribe to, replace, or unsubscribe from
the parent. The output limits are the client's requested limits, possibly
reduced by the host; input limits are selected by the host. Both counters begin
at zero, with neither EOF nor reset present.

The subscription and snapshot are established atomically. The response MUST
precede all actions for the new channel on the ordered transport. Clients MUST
install the child route and seed its reducer as part of processing that response,
before applying subsequent child actions. A lossless event receiver installed
**before** the request can instead retain those actions until the caller seeds
the reducer from the response. Merely attaching an asynchronous subscription
after awaiting a generic request is not sufficient if its receive loop can
advance and discard early actions.

Hosts MUST bound connection attempts and their duration. If the transport is
lost before creation succeeds, they MUST cancel the attempt. A channel whose
response was lost is retained only for the bounded reconnect grace period and
disposed when omitted from the owner's reconnect subscriptions or when that
period expires. Clients MUST NOT retry creation as if it were idempotent: each
successful creation opens a different socket.

For TCP, `view` is invalid and `delivery` MUST be absent or request zero
intentional latency. Hosts MUST NOT coalesce, truncate, or drop TCP actions,
even when doing so would leave the same reducer counters. Byte side effects,
not only the reduced state, are part of the contract.

## Ownership

The connection belongs to the authenticated logical client that created it,
not merely to whoever supplies its `clientId`. Reconnect MUST establish the
same authenticated identity. Knowing a channel URI is not authorization.

TCP channels are absent from root/session catalogues and invisible to other
clients. Unauthorized subscriptions or dispatches MUST be rejected without
exposing payload. Host-originated actions MUST NOT be accepted from a client.
The action classifier establishes only the allowed direction; the host must
also enforce ownership and the channel's parent-session permission.

An explicit `unsubscribe` disposes the socket immediately. A new `subscribe`
to an existing TCP URI MUST be rejected: state snapshots cannot restore a byte
consumer. The creator is already subscribed; only `reconnect` can restore that
subscription after transport loss.

## Actions and credit

| Action | Origin | Meaning |
| --- | --- | --- |
| `tcp/input` | Owning client | Client-to-host bytes: `offset`, `data` |
| `tcp/data` | Host | Host-to-client bytes: `offset`, `data` |
| `tcp/inputConsumed` | Host | Cumulative input credit: `consumedBytes` |
| `tcp/dataConsumed` | Owning client | Cumulative output credit: `consumedBytes` |
| `tcp/inputEof` | Owning client | Input half-close at `finalOffset` |
| `tcp/dataEof` | Host | Output half-close at `finalOffset` |
| `tcp/clientClose` | Owning client | Client's final close |
| `tcp/hostClose` | Host | Host's final close |
| `tcp/clientReset` | Owning client | Abort with `reason` |
| `tcp/hostReset` | Host | Abort with `reason` |

Clients use `dispatchAction`; the host accepts and echoes actions in ordinary
`ActionEnvelope`s. TCP input MUST NOT use optimistic state reduction. A sender
keeps a separate bounded pending queue and reserves credit for unacknowledged
bytes; otherwise it could send the entire window repeatedly before any echo.
An echo can acknowledge a pending client action only when its owning client,
assigned sequence, action type, and action fields match that retained action.
An origin attached to a host-produced action is not such an acknowledgment.
Previously acknowledged echoes must not advance state or release new credit.
Output credit must also be bounded by bytes the local consumer actually released,
not merely by consumed offsets claimed by the host.
Echoes carrying `rejectionReason` MUST NOT be reduced or perform byte writes.
A rejected TCP write requires resetting that connection.

All data is nonempty canonical padded RFC 4648 base64 without whitespace.
Encoding length does not consume credit: decoded bytes do.

For each direction:

```text
0 <= consumedBytes <= receivedBytes <= 2^53 - 1
outstanding = receivedBytes - consumedBytes
0 <= outstanding <= windowBytes
availableCredit = windowBytes - outstanding
```

For a new data action `[offset, offset + decodedLength)`:

1. Validate base64, safe nonnegative integer offsets, and the chunk limit.
2. If its end is at or before `receivedBytes`, it is a duplicate: no write.
3. Otherwise `offset` MUST equal `receivedBytes`; a gap or partial overlap
   resets the connection with `protocolError`.
4. New data MUST fit the remaining credit and MUST precede that sender's EOF
   and final close.
5. Advance `receivedBytes`, then write the accepted bytes exactly once.

The reference `tcpReducer` performs these checks and retains no payload.
Invalid actions throw before any mutation. The adapter MUST turn validation
failure into a channel reset and socket disposal, not continue the stream.
If a write fails after reduction, reset; the channel cannot safely resume.

Cumulative consumed offsets cannot exceed `receivedBytes`. Equal or older
credit updates are idempotent no-ops. Receivers return credit only as their
bounded stream buffer releases bytes, not merely when JSON is decoded. This is
not acknowledgment that the remote application processed the data.

Adapters MUST stop reading source sockets when credit is exhausted and bound
encoded queues, pending dispatches, write buffers, and retained replay. Generic
SDK event queues that drop old messages for slow consumers are unsuitable for
TCP: use lossless bounded delivery with backpressure, or explicitly reset on
overflow. Pure state mirrors alone are not TCP stream implementations.

### SDK implementation status

All six SDKs include TCP wire types, pure reducers, and byte-stream adapters,
with the TypeScript `tcpReducer` as the reference state machine. Reducers
validate actions without retaining payload; validation failures use each SDK's
native error mechanism and leave state unchanged. The adapters own bounded
payload buffers, credit reservation, acknowledgement, EOF/reset, and same-stream
replay. Kotlin's adapter is transport-independent because that SDK does not ship
a client runtime; the other SDKs integrate adapters with their clients.
Ordinary state mirrors must not be used to restore TCP streams.

Reducer conformance cases live in `types/test-cases/reducers/` alongside the
other channels, using `reducer: "tcp"`. A fixture's optional `expectedError`
means only its final action must fail; `expected` is the unchanged state after
the preceding actions. All six implementations execute these cases. A native
integer decoder may reject an unrepresentable fractional offset before it
reaches the reducer; this is checked as rejection, not skipped or rounded.
JavaScript-only checks and generated large-payload regressions live in the
existing `types/reducers.test.ts`, with native regression tests where needed.

## EOF, close, and reset

EOF's final offset MUST equal the direction's `receivedBytes`. It consumes no
credit. Apply the socket half-close only after all preceding bytes in that
direction have been delivered. Duplicate identical EOF is a no-op; the opposite
direction can continue.

Either side can close without EOF and the other MUST respond with its own
close if it has not sent one. `clientClosed` and `hostClosed` record this
handshake. There is no redundant phase field:

- Neither flag: open (one or both directions may have reached EOF).
- One flag: closing.
- Both flags: closed.
- A present `reset`: aborted, regardless of prior close flags.

New bytes are forbidden after **their sender's** close, not after either close.
This permits data already in flight in the opposite direction to cross a close.
Close does not consume credit. Accepted bytes remain ordered before disposal;
credit updates remain valid while draining. Implementations MUST retain enough
state/replay to deliver accepted bytes and the final close, or explicitly reset
if a bounded drain/reconnect deadline expires. A close response MUST NOT wait
for additional send credit, which could deadlock the handshake.
This governs dispatch of the response, not completion of the close operation or
final disposal: already-dispatched input may still be awaiting consumption when
the response is sent. Keep the accepted-byte drain conditions after responding.

Reset immediately aborts both directions and discards buffered bytes. Once a
reset is accepted, later actions have no effect. Session disposal, policy
revocation, unrecoverable replay loss, socket failure, and process shutdown
dispose the socket. Reset reasons contain no unsanitized system error text.

## Reconnect: same sockets, complete replay

AHP transport replacement MAY preserve the **same** TCP connection. The host
retains it for an implementation-defined bounded grace period; it does not
create a replacement socket. The client must retain its original stream,
reducer, bounded pending writes, and applied-action checkpoint in memory.

The client includes the private URI in `reconnect.subscriptions` only while it
still owns that consumer. The host checks identity, authorization, socket and
channel lifetime, and complete replay availability. Omitted TCP subscriptions
are disposed. A fresh process cannot resume solely from persisted offsets.

`lastSeenServerSeq` MUST NOT advance beyond an action until it is applied or
safely queued for that same live consumer. Treating JSON receipt as stream
delivery can skip bytes after reconnect. Replay MUST run through the same
ordered reducer/side-effect path as live actions. No new actions may overtake
the replay response.

If retained TCP consumers require a lower wire checkpoint than ordinary state
consumers, keep those checkpoints separate. Process the complete TCP replay,
but do not redeliver ordinary-channel actions at or below the ordinary
consumer's previously applied checkpoint. Otherwise incremental actions such
as terminal output would be applied twice merely because an idle TCP stream
retained an older checkpoint.

Unacknowledged client actions are retained with their original `clientSeq` and
byte offsets. Replay first reconciles echoed input; only then may the client
resend remaining pending actions in order. Offset duplicate suppression prevents
a second socket write when acknowledgment delivery was ambiguous. EOF and
cumulative credit are likewise idempotent.

**Snapshots cannot recover payload.** If normal AHP replay cannot supply the
complete missed range, the host MUST:

1. Include the requested TCP URI in `ReconnectResult.missing`.
2. Omit it from snapshots and discard any incomplete TCP replay for it.
3. Dispose its destination socket.

The snapshot result gains optional `missing` for compatibility with older
hosts. TCP-capable hosts MUST populate it for failed TCP subscriptions. Clients
MUST close their local stream for every missing TCP channel and MUST NOT accept
a TCP snapshot in a reconnect response, even if `missing` is absent.

Host/client restart, lost local buffers, changed identity, expired grace, and
lost replay all fail closed. Browser/application retry may establish a new
connection; the TCP adapter MUST NOT replay an old request into a new socket.

Replay storage MUST be bounded. Implementations SHOULD isolate private TCP
replay pressure from ordinary state history and fairly interleave small TCP
chunks with control traffic. A bounded buffer that cannot retain a required
range must reset, never silently skip bytes. Replay and logging MUST preserve
channel ownership; payload may contain credentials and SHOULD NOT be persisted
or logged.

## Errors and policy

Malformed targets, encodings, and numeric limits use `InvalidParams`.
Unknown sessions use `SessionNotFound`; denied access uses `PermissionDenied`.
Expected connection failures use `TcpConnectionOpenFailed` (`-32012`) with:

```json
{ "reason": "nameResolutionFailed", "retryable": false }
```

Other reasons are `connectionFailed`, `resourceShortage`, and `sessionNotReady`.
An unclassified implementation failure uses `InternalError`.

The host remains authoritative for DNS and transport access. It MUST authenticate
callers, enforce session/channel ownership, and bound connection attempts,
connections, bandwidth, replay, and memory. If it applies destination access
restrictions, those checks MUST cover resolved addresses without an unchecked
second DNS lookup. Agent tool permissions and sandbox policy remain the concern
of the session's execution backend; the TCP transport MUST NOT infer those policies
from provider-specific settings.

Browser clients still own URL approval, page sharing, local proxy protection,
and storage isolation. They should use one host-network route per browser
storage session, including redirects, subresources, and popups. HTTPS TLS remains
end-to-end between the browser and destination.

## SDK adoption

Use the SDK's owned TCP connection adapter rather than implementing credit and
replay in application code. The client-backed helpers validate creation and
install child routing before accepting live actions. Reconnect operates on
the original handles, processes replay before live delivery, and disposes
streams that are missing or cannot be recovered without snapshots.

| SDK responsibility | Consumer responsibility |
| --- | --- |
| Ordered actions, duplicate suppression, and rejected-envelope handling | Transport selection, authentication, and reconnect timing/policy |
| Receive buffering, consumed credit, input reservations, and chunk encoding | Connection-count limits and application admission policy |
| Half-close, final close, reset, and cancellation cleanup | Native socket/stream bridges and application-specific destination approval |
| Original-consumer replay, pending-action reconciliation, and sequence allocation | Reading only when the application's destination can accept bytes |

The negotiated receive window bounds unread SDK payload. Returning a buffer
from `read` transfers responsibility for it to the consumer and releases credit;
a native-stream bridge must not eagerly drain into an unbounded application
queue. Socket I/O and host-side destination connection management remain outside
the client adapter.

The [TypeScript SDK](https://github.com/microsoft/agent-host-protocol/tree/main/clients/typescript#tcp-channels)
shows the owned stream and reconnect APIs. Native SDKs expose equivalent
operations in their language's conventions. Kotlin accepts a caller-supplied
transport binding rather than adding a new client runtime.

The lower-level types, reducers, and strict event receivers remain available
for custom integrations. Such integrations must meet the same lossless,
same-consumer rules; ordinary snapshot mirrors and lossy UI event queues cannot
replace the adapter.
