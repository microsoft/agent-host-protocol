# Terminal Channel

A terminal channel carries the state of a single pseudo-terminal (pty) process — a shell, dev server, build task, or other long-running command. Terminals live independently of any session that may have created them, and may be claimed by clients or by sessions.

For a hands-on walkthrough of terminal flows, see the [Terminals guide](/guide/terminals).

## URI

```
<scheme>:/<id>
```

The scheme and path of a terminal URI are server-defined. The lightweight terminal catalogue carried on [`RootState.terminals`](/specification/root-channel#state) advertises each live terminal's URI; clients subscribe to a terminal URI to get its full state.

## State

Subscribers receive a [`TerminalState`](/reference/terminal#terminalstate) snapshot:

```typescript
TerminalState {
  title: string
  cwd?: URI
  cols?: number
  rows?: number
  content: TerminalContentPart[]
  exitCode?: number
  claim: TerminalClaim
  supportsCommandDetection?: boolean
}
```

`content` is an ordered array of typed parts. Each part is either `unclassified` (raw VT output) or a structured `command` part carrying the command line, accumulated output, exit code, and duration. See the [Terminals guide](/guide/terminals#full-terminal-state) for the part shapes.

A terminal is **always owned** — the [`claim`](/guide/terminals#claims-and-ownership) field records whether it belongs to a client or a session.

## Lifecycle

### Creation

[`createTerminal`](/reference/terminal#createterminal) is a JSON-RPC request that allocates a new terminal with a required initial claim plus optional name, cwd, and dimensions:

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "createTerminal",
  "params": {
    "channel": "ahp-terminal:/<id>",
    "claim": { "kind": "client", "clientId": "client-abc" },
    "name": "build",
    "cwd": "file:///workspace",
    "cols": 120,
    "rows": 30
  }
}
```

After creation, the server dispatches `root/terminalsChanged` so that subscribers of `ahp-root://` see the new entry in the terminal catalogue, and the client SHOULD subscribe to the terminal URI to receive the full state.

### Disposal

[`disposeTerminal`](/reference/terminal#disposeterminal) kills the underlying pty (if running) and removes the terminal. The server dispatches `root/terminalsChanged` to reflect the new catalogue. There is no "release without disposal" — when a terminal is no longer needed, it is disposed.

## Methods and events on this channel

This section lists wire methods that are interpreted in the context of a
terminal URI (`ahp-terminal:/<id>`).

### Commands (`params.channel = "ahp-terminal:/<id>"`)

| Method | Kind | Purpose |
|---|---|---|
| `createTerminal` | request | Create a terminal at the chosen URI with an initial claim. |
| `disposeTerminal` | request | Dispose this terminal and kill its pty if still running. |

### Notifications (`params.channel = "ahp-terminal:/<id>"`)

| Method | Kind | Meaning |
|---|---|---|
| `action` | server → client notification | Terminal action envelope (`terminal/*` action payloads). |
| `dispatchAction` | client → server notification | Dispatch terminal client actions (`terminal/input`, `terminal/resized`, `terminal/claimed`, `terminal/titleChanged`, `terminal/cleared`). |
| `unsubscribe` | client → server notification | Stop receiving messages for this terminal channel. |

## Actions

All terminal-scoped action envelopes carry `channel: "<terminal-uri>"`. Action payloads do NOT carry their own terminal URI.

### Data flow

| Action | Client-dispatchable | Reducer effect |
|---|:---:|---|
| `terminal/data` | No | Appends to the tail content part |
| `terminal/input` | Yes | No-op (server forwards to the pty) |

`terminal/data` is **server-only**. `terminal/input` is a **side-effect-only** client action — the client dispatches keyboard input and the server forwards it to the pty process. The reducer does not modify state on `terminal/input`; any resulting output arrives later via `terminal/data`.

::: tip Why two separate actions?
Terminal I/O is intentionally split into `terminal/input` (client → pty) and `terminal/data` (pty → client) because **standard write-ahead reconciliation is not safe for terminals**. A pty is a stateful, mutable process — optimistically applying input or predicting output would produce incorrect state. By keeping input as a side-effect-only action and output as server-authoritative, clients avoid the reconciliation pitfalls that would arise from treating terminal I/O like normal state actions.
:::

### Command detection

Shell-integrated terminals can announce command boundaries:

| Action | Client-dispatchable | Reducer effect |
|---|:---:|---|
| `terminal/commandDetectionAvailable` | No | Sets `supportsCommandDetection: true` |
| `terminal/commandExecuted` | No | Appends a `command` part, sets `supportsCommandDetection: true` |
| `terminal/commandFinished` | No | Marks the matching `command` part complete with exit code & duration |

The server MUST NOT include shell integration escape sequences in `terminal/data` — they MUST be stripped before dispatch. Clients MUST check `supportsCommandDetection` before relying on command boundaries.

### Control

| Action | Client-dispatchable | Reducer effect |
|---|:---:|---|
| `terminal/resized` | Yes | Sets `cols`, `rows` |
| `terminal/claimed` | Yes | Sets `claim` |
| `terminal/titleChanged` | Yes | Sets `title` |
| `terminal/cwdChanged` | No | Sets `cwd` |
| `terminal/exited` | No | Sets `exitCode` |
| `terminal/cleared` | Yes | Resets `content` to `[]` |

## Commands

- [`createTerminal`](/reference/terminal#createterminal) — create a new terminal with an initial claim
- [`disposeTerminal`](/reference/terminal#disposeterminal) — kill the pty (if running) and remove the terminal

## Catalogue Notifications

The lightweight terminal catalogue on `RootState.terminals` is kept in sync via the server-side `root/terminalsChanged` action on the [Root Channel](/specification/root-channel). Terminal channels themselves emit no protocol notifications — only action envelopes.
