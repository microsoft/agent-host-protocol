# @microsoft/agent-host-protocol-cli

An agent-friendly, non-interactive CLI for the
[Agent Host Protocol (AHP)](https://microsoft.github.io/agent-host-protocol/).
The `ahp` executable requires Node 22 or later.

This is a separate npm package, versioned and published independently from
[`@microsoft/agent-host-protocol`](../clients/typescript/README.md).
It bundles the shared TypeScript client's protocol and transport implementation
at build time, so installation needs no SDK package. Its only runtime dependency
is `ws`, allowing the CLI to own and forcibly terminate its local sockets.
It does not introduce another protocol implementation.

## Install and run

The initial package is not published yet; version `0.0.0` is an unpublished
placeholder. After the first release:

```bash
npm install --global @microsoft/agent-host-protocol-cli
ahp --help
ahp describe
ahp connect --url ws://127.0.0.1:8765
ahp sessions --url ws://127.0.0.1:8765
ahp snapshot ahp-session:/session-id --url ws://127.0.0.1:8765
```

From a checkout:

```bash
npm ci
npm ci --prefix cli
npm run build:cli
node cli/dist/main.js --help
npm run --silent ahp -- describe
npm run test:cli
```

`--url` can be replaced by `AHP_URL`. Each one-shot invocation establishes a
fresh connection and negotiates the SDK's supported protocol versions. `connect`
returns initialization; it leaves no background connection. `sessions` returns
one page, optionally bounded by `--page-size`; its cursor belongs to that
connection and cannot be carried into another one-shot invocation.

Results and errors are JSONL with `version: 1` and a `kind`. Results carry
`command` and `result`; RPC errors preserve their numeric code and structured
data. A one-shot `snapshot` emits a separate `kind: "snapshot"` record before
its final result. Help goes to stderr. Exit codes are 0 for completion, 1 for
failure, 2 for invalid arguments, 130 for SIGINT, and 143 for SIGTERM.

Signal exit codes apply when Node receives the signal. On Windows,
`child.kill()` and `process.kill()` forcibly terminate the target instead of
delivering catchable SIGINT/SIGTERM signals, so captures may lack a completion
marker. Replay reports those captures as incomplete. Use bounded command
durations/timeouts and `ahp stop --instance NAME` for graceful controller shutdown.

## Observe, record, and replay

```bash
ahp listen ahp-session:/session-id ahp-chat:/chat-id \
  --url ws://127.0.0.1:8765 --duration-ms 10000 --limit 100 \
  --record capture.jsonl
ahp replay capture.jsonl --direction in --method action --after 0 --limit 100
```

Without `--instance`, `listen` aliases `watch`. Both return initial snapshots
(or explicitly report stateless channels) before bounded notification metadata.
`--include-content` opts into redacted frame bodies. Recording is available on
every network command, creates a new mode-0600 file on POSIX, never overwrites
an existing path, and stops explicitly if its byte cap is exceeded. On Windows,
use a private ACL-protected directory. Cursors are local to each capture.

Offline replay never connects or re-executes actions. It reports whether the
entire capture was inspected and whether it completed, failed, or remains
unverified because a count limit was reached. Missing completion markers,
truncated records, and cursor gaps fail explicitly.

## Exact requests and dispatch

```bash
printf '%s\n' '{"channel":"ahp-root://","uri":"file:///workspace/README.md"}' \
  | ahp request resourceRead --url ws://127.0.0.1:8765 --params-file -
printf '%s\n' '{"type":"session/titleChanged","title":"Investigation"}' \
  | ahp dispatch ahp-session:/session-id --url ws://127.0.0.1:8765 \
      --action-file - --confirm
```

Mutating requests, unknown extension methods, and all dispatches require
`--confirm`. `dispatch` waits for the authoritative echo matching its own client
ID and sequence; rejection exits nonzero. Timeout or disconnect after sending
a mutation reports an **unknown outcome**, not proof of remote failure. Nothing
is automatically retried. The host validates payloads; this debugging tool does
not replace typed application APIs. Read commands never claim participation,
submit work, or accept permissions. Connecting and subscribing may still wake
compute or load sessions. The default server-request handler exposes no local
files.

## Persistent controllers

Use explicit instances to retain a connection, client identity, subscriptions,
and pagination cursors. There is no implicit current instance or context switch.

```bash
ahp join --url "$AHP_URL" --session "$SESSION_URI" --instance work
ahp status --instance work
ahp participate --instance work --op-id participation-1
ahp wait --instance work --op-id participation-1 --until accepted --timeout 30s
ahp send --instance work --op-id send-1 --message-file prompt.txt
ahp wait --instance work --op-id send-1 --until accepted --timeout 30s
# Read the returned turnId, then target that exact turn:
ahp steer --instance work --turn "$TURN_ID" --op-id steer-1 \
  --message-file correction.txt
ahp cancel --instance work --turn "$TURN_ID" --op-id cancel-1
ahp wait --instance work --op-id send-1 --until completed --timeout 2m
ahp stop --instance work
```

`join` starts a detached controller and waits for initialization, optional
authentication, ready-session/default-chat snapshots, and durable recording.
It does not create sessions, guess chat URIs, register participation, or submit
work. `participate` registers only this client, with no local tools, preserving
other active clients. Send/steer/cancel require participation, a fresh binding,
and an interactive chat. Send refuses active turns; steer/cancel require the
exact active turn. Steering refuses to replace a pending steering message.
These snapshot guards are not server-side compare-and-swap guarantees.

For observation only, create a **separate instance**:

```bash
ahp listen --url "$AHP_URL" --session "$SESSION_URI" --instance observer
ahp events --instance observer --after 0 --limit 100
ahp events --instance observer --after "$CURSOR" --follow --timeout 30s
ahp stop --instance observer
ahp events --instance observer --after "$CURSOR"
```

Observers reject participation, high-level mutations, raw dispatches, and
mutating/extension RPCs. Recording continues through idle periods and turns.
`events` emits retained records followed by a result containing `nextCursor`;
filters never prevent the cursor advancing over skipped records. `--limit`
is page size (1-1000), with an approximately 1 MiB page bound; an oversized
record is returned alone. Follow polls stable durable prefixes without dropping
frames, for 30s by default. `--timeout` accepts `ms`, `s`, or `m`, up to one hour.

Each mutation requires `--op-id`. Submission exit 0 means intent recorded,
**not** accepted or completed. `wait` and `status --op-id ID` distinguish
`recorded`, `submitted`, `transport_completed`, `accepted`, `rejected`,
`refused`, and `uncertain`. Identical operation IDs/inputs retrieve outcomes
without resubmission, including after stop/crash; changed inputs fail. Operation
and turn IDs are distinct. A turn already submitted in this journal cannot be
sent under another operation ID. Completion waits support send/cancel only;
steering acceptance does not prove consumption. Completion preserves completed,
cancelled, and error outcomes; turn errors exit nonzero.

`ping`, `sessions`, `snapshot`, `request`, and `dispatch` accept `--instance`;
`sessions --cursor` works only on the retained connection. Controller snapshots
return the subscription result in `result.snapshot`. Raw mutations require
`--confirm` and `--op-id`; controller-owned lifecycle RPCs are unavailable through
`request`. Submission ordering does not wait for acceptance, so reads, waits,
steering, and cancellation remain responsive while another operation awaits
its echo.

Instances exclusively occupy names under `AHP_STATE_DIR` (default `~/.ahp`),
with private metadata, `events.jsonl`, `operations.jsonl`, and a controller log.
IPC uses private Unix sockets or token-authenticated Windows named pipes;
protect Windows storage with current-user ACLs. Captures default to metadata.
Startup `--include-content` includes redacted bodies. The journal retains
redacted mutation-RPC results/errors, which may contain content even without
full wire capture. Captures default to a 64 MiB cap (`--max-record-bytes`),
and journals to 8 MiB. Evidence is fsynced. Exhaustion, malformed frames, and
write failures stop explicitly with partial evidence.

Interrupting a CLI command does not stop its controller or remote operations.
`stop` is local, does not cancel remote work, and retains names/evidence.
Use a new name for another connection. Stopped outcomes and events remain
readable. Missing controllers with stale ready metadata report `interrupted`;
unacknowledged submissions remain uncertain. There is no automatic reconnect
or mutation retry. `replay` reviews stopped `events.jsonl` files offline.

Local shutdown allows one second for a graceful WebSocket close, then terminates
the local socket if the host is unresponsive. Captures and controller metadata
still finalize, and observed operation outcomes are preserved. This deadline
is independent of request timeouts and does not cancel remote work.

## Authentication and privacy

`--auth-file` reads `authenticate` parameters containing `channel: "ahp-root://"`,
an advertised `resource`, and `token`; `-` reads stdin. Tokens stay off argv
and are redacted from output/captures. Controller credentials are passed over
IPC, not persisted in launch arguments or saved configuration. Custom transport
headers, OAuth acquisition, and host-specific challenge sealing are unsupported.
Use `wss://` for remote credentials; `ws://` is plaintext.

Redaction cannot guarantee arbitrary prompts, tool output, URLs, or extension
fields contain no secrets. Keep output, captures, and journals private.

See the [design proposal](../docs/proposals/agent-cli.md) and
[release instructions](../RELEASING.md#cli-clivxyz).
