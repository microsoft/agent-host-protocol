# An AHP CLI for agents

## Status

One-shot CLI and persistent-controller implementation on this branch. The `ahp`
executable ships as the separate `@microsoft/agent-host-protocol-cli` npm package
under `cli/`, with its own manifest, tests, changelog, and publish pipeline.
It is versioned independently from the TypeScript SDK and bundles the SDK's
existing JSON-RPC client, generated wire types, and WebSocket transport at build
time. Installation needs no SDK package; the CLI uses `ws` as its only runtime
dependency to support bounded local socket termination. It does not
introduce another protocol implementation.

## Implementation boundaries

The command frontends own argument parsing, local input/output, and explicit
target selection. The controller runtime owns retained connections, session
preconditions, and operation outcomes; it does not own remote compute or turns.
Shared intent serialization and metadata live with the local journal/storage
code, so inspecting retained evidence does not depend on the controller runtime.
Capture observes the transport boundary and replay never invokes network code.

The SDK owns JSON-RPC requests, correlation, and wire decoding. The CLI's Node
adapter owns connection deadlines and uses `ws`'s built-in close deadline.
Dispatch notifications deliberately await the observed transport write rather
than the SDK's fire-and-forget dispatch helper: the journal must distinguish
recorded intent, transport completion, and authoritative host acceptance.
Convenience actions are checked against generated protocol types and enums;
raw request/action inputs remain explicit diagnostic escape hatches validated
by the host. New protocol commands require a catalog policy, not a new CLI
framework. Add focused debugging verbs as the protocol exposes those operations.

## Purpose

Give a coding agent a small, discoverable tool for investigating an AHP host.
An agent should be able to negotiate a connection, discover sessions, inspect
any channel, make a specific protocol request, observe traffic, and review a
capture without writing a client or knowing a host's implementation.

Unlike `agentctl`, this tool has no Mission Control, sandbox, provisioning, or
compute lifecycle integration. Inputs are an explicit WebSocket endpoint and
native channel URIs. It never guesses a session URI from a platform ID.

## Agent contract

- No prompts, interactive terminal UI, implicit host selection, or stdout
  progress text. Normal output is versioned JSONL. Help goes to stderr.
- Each one-shot process owns one connection and a fresh client ID unless
  explicitly supplied. Named controllers retain their connection and client ID
  across CLI invocations. Both initialize before application requests and
  negotiate the SDK's supported versions.
- A request timeout or disconnect is not proof that a mutation failed.
  Requests and dispatches are never retried automatically.
- Read-oriented commands never dispatch actions, claim an active client, answer
  permission requests, or create sessions. Connecting or subscribing can still
  have host-defined effects, including waking compute or loading a session.
- Raw mutating requests and dispatches require `--confirm`. Unknown extension
  requests also require confirmation. The command policy is exhaustive over
  the canonical `CommandMap`, so new standard methods need an explicit policy.
  High-level mutation verbs express intent directly and require a durable
  operation ID instead of an additional confirmation prompt.
- Server-initiated requests use the SDK's default MethodNotFound response. The
  CLI does not grant the host access to the agent's local files or shell.
- Exit 0 means the requested local command completed, not that a turn finished.
  A controller mutation may only have recorded intent; wait for its outcome.
  Exit 1 means protocol, transport, capture, or replay failure;
  exit 2 means invalid usage; delivered SIGINT exits 130 and SIGTERM exits 143.
  Windows process-kill APIs forcibly terminate instead of delivering those
  signals; captures without a completion marker remain incomplete, not successful.

Every JSONL record includes `version: 1` and a `kind`. Results carry `command`
and `result`. Errors carry `category`, `message`, and, for JSON-RPC failures,
the original numeric `code` and structured `data`. Mutations whose response
was not observed report an unknown outcome. Diagnostics never masquerade as
empty successful results.

## Initial commands

| Command | Behavior |
| --- | --- |
| `ahp describe` | Offline command policy, dispatchable action names, and supported protocol versions. |
| `ahp describe --url URL` | Standard catalog plus the host's initialization response, preserving advertised capabilities and opaque extension metadata. |
| `ahp describe URI` | Explicit resource subscription and first-class `metadata.host` / `metadata.resource`; uses `--url`, `AHP_URL`, or a retained `--instance`. |
| `ahp connect` | Initialize and return the host's negotiated version and capabilities. |
| `ahp ping` | Initialize, then make a protocol-level liveness request. |
| `ahp sessions` | Return one `listSessions` page, including the host's continuation token. Cursors are connection-scoped, so a subsequent invocation cannot use that token. |
| `ahp snapshot URI` | Subscribe and return the authoritative snapshot. |
| `ahp watch URI...` | Subscribe, return initial snapshots, then emit bounded inbound notification metadata. `listen` is an alias. |
| `ahp request METHOD --params-file FILE` | Send exact JSON parameters using the SDK's explicit untyped request escape hatch. `-` reads stdin. |
| `ahp dispatch URI --action-file FILE --confirm` | Subscribe, dispatch once, and await the authoritative action echo matching this client's origin and sequence. |
| `ahp replay FILE` | Read captured records offline, with cursor, count, method, direction, and channel filters. Never sends frames to a host. |

Every one-shot network command accepts `--url` (or `AHP_URL`), `--client-id`,
`--timeout-ms`, and optional `--auth-file`. A single authentication file
contains the `authenticate` parameters for an advertised resource; the token
does not appear on the command line. Authentication runs after initialization.
Transport-specific OAuth, challenge sealing, custom HTTP headers, stdio, and
platform endpoint resolution are outside the initial implementation.

Request and action files must contain JSON objects. Requests require an explicit
`channel`; action types must be known and client-dispatchable. The host validates
the remaining payload against its negotiated protocol. This intentionally
permits invalid protocol payloads for debugging without casting arbitrary JSON
to a typed SDK request. Lifecycle methods owned by the CLI cannot be sent through
`request`.

`watch` has a duration and notification-count bound. Requests and WebSocket
connection establishment have a timeout. A recording has a byte cap. Exceeding
the cap, a malformed frame, a disconnect, or a disk write failure produces an
explicit error and retains partial evidence.

## Recording and offline review

Add `--record FILE` to any one-shot network command. The file is created exclusively with
mode 0600 on POSIX; on Windows, use a directory with private ACLs.
Existing files and symlinks are never overwritten. The parent directory
must already exist. Records have contiguous, file-local cursors, timestamps,
direction, wire size, and available JSON-RPC routing metadata. Lifecycle records
distinguish completed captures from failed or interrupted captures.

By default recordings and watch events contain metadata, not message bodies.
`--include-content` adds parsed frames. Authentication token fields, common
credential fields, and known authentication token values are redacted in both
output and captures. This is not a guarantee that arbitrary content contains no
secrets: prompts, tool output, URLs, and extension fields can still be sensitive.
Keep captures private.

Captures are written at the transport boundary, not reconstructed from the
SDK's bounded notification queues. Incoming frames, outgoing frames, RPC errors,
unknown notifications, and server requests remain observable. A record error
stops the command rather than silently dropping frames.

Replay is streaming and validates record version, cursor continuity, and
completion markers before declaring success. Filtering affects displayed
records only, not validation. A count limit intentionally reads a prefix and
reports that the capture was not completely inspected. A missing completion
marker is reported as an incomplete capture, not as a clean recording.

## Examples

```bash
ahp describe
ahp connect --url ws://127.0.0.1:8765
ahp sessions --url ws://127.0.0.1:8765
ahp snapshot ahp-session:/session-id --url ws://127.0.0.1:8765
ahp listen ahp-chat:/chat-id --url ws://127.0.0.1:8765 \
  --duration-ms 10000 --record capture.jsonl
ahp replay capture.jsonl --direction in --method action --limit 100
ahp request resourceRead --url ws://127.0.0.1:8765 --params-file read.json
ahp dispatch ahp-session:/session-id --url ws://127.0.0.1:8765 \
  --action-file rename.json --confirm
```

## Persistent controllers

Borrow kubectl's explicit targeting and predictable command contracts, not its
resource framework. Keep verb-first commands, versioned JSONL, no interactive
prompts, and no global current instance, merged configuration, manifests/apply,
plugins, or aliases.

```text
Agent -> short-lived CLI -> authenticated private IPC -> named controller
                                                       | connection/subscriptions
                                                       | ordered mutation writer
                                                       | durable recorder/journal
                                                       v
                                                     AHP host
```

`join --instance NAME --session URI --url URL` starts one controller. It returns
after initialize/authenticate, session readiness and advertised default-chat
snapshots, and durable capture readiness. The instance retains that exact chat
selection, rather than silently following later default-chat changes.
`listen` with the same flags creates a separate observer-only instance; its
remote mutation commands are rejected. Legacy `listen URI...` remains an alias
for one-shot watch.

`status`, cursor-based `events`, `wait`, and local `stop` operate on explicit
instances. Protocol read commands and raw request/dispatch can reuse the
connection with `--instance`; connection-scoped listSessions cursors therefore
remain usable. Event follow reads durable prefixes by cursor, without a second
in-memory replay/live feed or its buffer handoff complexity.

`participate --op-id ID` registers only the instance's initialized client,
advertising no local tools. This implements current AHP's **plural active-client
model**, not exclusive ownership or takeover. `send`, `steer`, and `cancel`
require explicit participation, fresh session/chat binding, and an interactive
chat. Send refuses an existing active turn; steer/cancel require its exact ID.
Steering refuses an existing pending message. Snapshot checks do not provide
server-side compare-and-swap.

Mutations reserve and fsync journal intent before submission. Caller-supplied
operation IDs deduplicate locally; changed inputs under an existing ID fail.
An operation ID is not a turn ID or a host-side exactly-once guarantee.
Submission responses explicitly report recorded intent; subsequent outcome
milestones distinguish submission, transport completion, authoritative
acceptance/rejection, refusal before send, and uncertainty. Late matching echoes
can resolve uncertainty without a retry. The writer is ordered but does not wait
for acceptance, so steering, cancellation, observation and waits can overlap.
Turn completion is separate from action acceptance; steering-message removal is
not inferred to mean consumption.

Controller instances have an exclusive local name and generation, distinct from
their AHP client ID. Generation-bound random credentials authenticate IPC. Tokens
and endpoint credentials are passed to the child over IPC, not process arguments
or saved configuration. Storage is private on POSIX; Windows requires a
current-user ACL-protected state directory and uses a named pipe.

Each controller fsyncs transport-boundary capture and operation-journal records.
Recordings use the existing offline replay format; default metadata-only capture
omits frame bodies. Mutation-RPC results and structured errors are retained in
the private journal and may contain content. Full redacted capture is opt-in. Event queries use
stable complete-record prefixes, advance across filters, enforce count/page
limits, and remain usable after stop. The recorder caps at 64 MiB by default,
the journal at 8 MiB, the submission queue at 128 intents/16 MiB, and IPC at
16 concurrent clients. Exhaustion/failure is explicit rather than silently
dropping records.

CLI exit, local controller stop, and remote turn cancellation are different
lifetimes. Stop retains evidence and the occupied instance name. A crash with
stale ready metadata is interrupted, not healthy, and unacknowledged submissions
remain uncertain. There is no automatic reconnect or mutation replay.
Local shutdown allows a one-second graceful WebSocket close before forcibly
terminating the owned socket. An unresponsive peer cannot prevent evidence
finalization or local process exit.

## Follow-ons

Input requests are inspectable as active-turn response parts and explicitly
answerable through raw `chat/inputAnswerChanged` / `chat/inputCompleted`
dispatches. Required answers must be submitted, not merely drafted, before
acceptance. A successful dispatch does not prove runtime resumption; observe
the turn outcome separately. Observers never answer. Real-host E2E exercises
request discovery, draft synchronization, required-answer rejection, explicit
submission, runtime resumption, and retained resolved transcripts.

`describe --url` exposes advertised host metadata without guessing extension
names. First-class `metadata.host` mirrors handshake `_meta`, or `null` when
absent. `describe URI` additionally exposes resource state `_meta` under
`metadata.resource`, with a `resource` descriptor distinguishing stateless
channels from stateful channels with absent metadata. It subscribes only to the
explicit target and can reuse a retained controller without reinitializing.
AHP has no universal nonstandard-method enumeration RPC; extensions
with their own discovery contracts are callable explicitly through `request`
with confirmation. Their unknown result fields and schemas remain intact.

Follow-ons are generated per-method input schemas, typed convenience
commands for session creation and turns, state reduction during offline replay,
normalized extension discovery, reconnect reconciliation, safe instance
archiving/removal, a foreground command stream, and additional transports. Replaying a
capture into a live host is deliberately not part of offline replay: mutation
reproduction must be a separately authorized operation with fresh IDs.
