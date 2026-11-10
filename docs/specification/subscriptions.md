# Channels and Subscriptions

This section defines channels, the `channel` parameter that every message
carries, and the messages that a client uses to subscribe to and unsubscribe
from a channel.

## Channels

A channel is a sequence of messages that is identified by a URI. Every channel
has a state. A subscriber first receives a snapshot of the state, and then
receives the messages that the channel defines: actions that change the state,
and notifications for events that are not stored in it.

The state of some channels has no fields. For example, a telemetry channel
delivers its data only in notifications, so its state is always the empty
object `{}` (`EmptyState`).

All channels use the same `subscribe` and `unsubscribe` messages.

### Channel URIs

| URI | State type | Contents |
|---|---|---|
| `ahp-root://` | `RootState` | Agents, terminals, and host configuration. This channel always exists. |
| `ahp-automations://` | `AutomationState` | All automations visible to the client. This channel exists when `InitializeResult.automations` is present. |
| `ahp-session:/<uuid>` | `SessionState` | Session metadata and the session's list of chats. |
| `ahp-chat:/<cid>` | `ChatState` | One chat: turns, streamed responses, tool calls, pending messages, input requests, and changesets. See [Chat Channel](/specification/chat-channel). |
| `ahp-canvas:/<id>` | `CanvasState` | Experimental. One canvas. The URI is listed in `ChatState.canvases`. See [Canvas Channel](/reference/canvas). |
| `ahp-terminal:/<id>` | `TerminalState` | One terminal. See [Terminal Channel](/specification/terminal-channel). |
| `ahp-tcp:/<id>` | `EmptyState` | Experimental. One TCP connection that the host opened with `createTcpConnection`. Private to the client that created it. See [TCP Channel](/specification/tcp-channel). |
| `ahp-changeset:/<id>` | `ChangesetState` | One changeset. The client builds the URI from the `Changeset.uriTemplate` of a session or chat. |
| `ahp-resource-watch:/<id>` | `ResourceWatchState` | One file watch. The URI is returned by `createResourceWatch`. |
| `ahp-otlp:` | `EmptyState` | OpenTelemetry logs, traces, or metrics. The URIs are listed in `InitializeResult.telemetry`. See [Telemetry Channel](/specification/telemetry-channel). |

In the table, `<uuid>`, `<cid>`, and `<id>` are identifiers chosen by the client
or server, as described on each channel's page. Clients MUST treat telemetry
URIs as opaque.

Future channel types will use new URI schemes. A client MUST NOT subscribe to a
URI whose scheme it does not understand.

## The `channel` Parameter

The `params` object of every request and every notification MUST contain a
member named `channel` whose value is a channel URI. A receiver can therefore
route any message using only its `method` and `params.channel`.

| Messages | Value of `params.channel` |
|---|---|
| `initialize`, `ping`, `reconnect`, `authenticate`, `listSessions`, `resolveSessionConfig`, `sessionConfigCompletions`, `listAutomationTriggerDefinitions` | `ahp-root://` |
| `resourceRead`, `resourceWrite`, `resourceList`, `resourceCopy`, `resourceDelete`, `resourceMove`, `resourceResolve`, `resourceMkdir`, `resourceRequest`, `createResourceWatch` | `ahp-root://`. Either peer can send these requests. |
| `runAutomation`, `fetchAutomationRuns` | `ahp-automations://` |
| `createSession`, `disposeSession`, `createChat` | The session URI. For `createSession`, this is the URI of the new session. |
| `fetchTurns`, `completions`, `disposeChat` | The chat URI |
| `moveChat` | The URI of the chat to move |
| `createTerminal`, `disposeTerminal` | The terminal URI. For `createTerminal`, this is the URI of the new terminal. |
| `createTcpConnection` | The URI of the new TCP channel |
| `invokeChangesetOperation` | The changeset URI |
| `subscribe`, `unsubscribe` | The URI of the channel being subscribed to or released |
| `dispatchAction`, `action` | The URI of the channel that the action changes |
| `root/sessionAdded`, `root/sessionRemoved`, `root/sessionSummaryChanged`, `root/progress` | `ahp-root://` |
| `auth/required` | The URI of the channel that requires authentication |
| `otlp/exportLogs`, `otlp/exportTraces`, `otlp/exportMetrics` | The telemetry channel URI |
| `tcp/data`, `tcp/eof`, `tcp/reset` | The TCP channel URI |
| `channel/snapshot`, `channel/frame`, `channel/credit` | The URI of the subscription using [windowed delivery](/specification/windowed-delivery) |

The TypeScript definitions enforce this rule. The compile-time check in
`types/version/message-checks.ts` fails if a method's params do not have a
`channel` member.

## Subscribing {#subscribe-request}

A client subscribes to a channel by sending a `subscribe` request.

The result contains a `snapshot`. The snapshot has the channel's current
`state` and `fromSeq`, which is the `serverSeq` at which the state was
captured. Every action that the server sends after the snapshot has a
`serverSeq` greater than `fromSeq`. With
[windowed delivery](/specification/windowed-delivery), the result contains
`flowControl` instead, and the snapshot is sent in a `channel/snapshot`
notification.

```jsonc
// Client to server
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscribe",
  "params": { "channel": "ahp-session:/<uuid>" }
}

// Server to client
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "snapshot": {
      "resource": "ahp-session:/<uuid>",
      "state": {
        "provider": "copilot",
        "title": "New Session",
        "status": 1,
        "lifecycle": "creating",
        "chats": [],
        "activeClients": []
      },
      "fromSeq": 5
    }
  }
}
```

For a channel whose state has no fields, the snapshot's `state` is an empty
object, and `fromSeq` is the server's current `serverSeq`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "snapshot": { "resource": "ahp-otlp://logs", "state": {}, "fromSeq": 5 }
  }
}
```

The server MAY omit the snapshot for a channel whose state has no fields. In
that case `subscribe` returns `{}`, and `initialize` and `reconnect` results
leave the channel out of `snapshots`. Clients MUST accept both forms.

Later protocol versions can add channels with new kinds of state. A client
MUST NOT fail because a snapshot's `state` has a form that it does not
recognize; it ignores that snapshot.

After a successful `subscribe`, the server sends the client every message for
that channel until the client unsubscribes or the connection closes.

A client has at most one subscription to each channel. If it sends `subscribe`
for a channel that it is already subscribed to, the request changes the
existing subscription, for example to start windowed delivery or to change its
window. No data is lost: the client keeps the messages that it has already
received and processes them in order. The server answers as it would for a new
subscription, so the client receives a new snapshot. If the subscription used
windowed delivery both before and after the change, its counters continue from
their current values; otherwise they start at zero when the server sends the
result. If the request fails, the subscription does not change.

The `subscribe` params can also contain these optional members:

| Member | Purpose |
|---|---|
| `delivery` | Asks the server to limit how long it holds updates. See [Delivery Preferences](#delivery-preferences). |
| `view` | Asks for a smaller snapshot. See [Snapshot Views](#snapshot-views). |
| `flowControl` | Offers windowed delivery. See [Windowed Delivery](/specification/windowed-delivery). |

### Delivery Preferences

`delivery.maxLatencyMs` is the longest time, in milliseconds, that the client
wants the server to hold updates for this subscription before sending them.

A server MAY use this time to combine updates. A server MUST NOT combine
updates unless the combined update produces the same state as the original
updates and the client still receives every event that the channel requires.
For example, if the server
generates two `chat/delta` actions for the same response part within 100 ms, it
can send one `chat/delta` that contains both pieces of text.

A value of `0` asks the server to send each update without delay. If `delivery`
is absent, the server uses its default behavior. Delivery preferences do not
allow a server to exceed the limits of a
[windowed subscription](/specification/windowed-delivery).

### Snapshot Views

A client MAY include `view` to ask for a smaller snapshot. A server that does
not support a requested view ignores it. Clients MUST accept a snapshot that
contains more state than they requested.

For a chat channel, `view.turns` is the number of most recent completed turns
that the client wants in the snapshot:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "subscribe",
  "params": {
    "channel": "ahp-chat:/<cid>",
    "view": { "turns": 20 }
  }
}
```

The server MAY return more or fewer turns than requested. If `view.turns` is
absent, the server MUST return all turns that it retains. If older turns are
available, `ChatState.turnsNextCursor` is present. The client passes that cursor
to `fetchTurns` to load older turns into the chat state.

## Unsubscribing {#unsubscribe-notification}

A client stops receiving messages for a channel by sending an `unsubscribe`
notification. The server does not respond.

```json
{
  "jsonrpc": "2.0",
  "method": "unsubscribe",
  "params": { "channel": "ahp-session:/<uuid>" }
}
```

The server stops sending messages for the channel after it processes the
notification. Messages that the server sent before that point can still arrive.

## Actions

The server sends each change to a channel's state as an `action`
notification. The server sends the notification to every client that is
subscribed to the channel.

```json
{
  "jsonrpc": "2.0",
  "method": "action",
  "params": {
    "channel": "ahp-chat:/<cid>",
    "action": { "type": "chat/delta", "turnId": "t1", "partId": "p1", "content": "Hello" },
    "serverSeq": 6,
    "origin": { "clientId": "client-1", "clientSeq": 1 }
  }
}
```

| Member | Meaning |
|---|---|
| `channel` | The channel that the action changes |
| `action` | The change. Its `type` identifies the action. |
| `serverSeq` | The position of the action in the server's order of actions |
| `origin` | The client and client sequence number that sent the action. Absent for actions that the server created. |
| `rejectionReason` | Present when the server rejected a client action |

The `action` object contains only the fields of the action itself. It does not
contain the channel URI. For example, a terminal action does not contain a
`terminal` field; the receiver uses `params.channel`.

A client sends an action with the `dispatchAction` notification:

```json
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "channel": "ahp-chat:/<cid>",
    "clientSeq": 1,
    "action": { "type": "chat/turnStarted", "turnId": "t1", "message": { "text": "Hi", "origin": { "kind": "user" } } }
  }
}
```

The server then sends the action to subscribers in an `action` notification
whose `origin` identifies the sending client. See
[Write-Ahead Reconciliation](/guide/reconciliation) for how a client applies its
own actions before the server confirms them, and [Actions](/guide/actions) for
the actions that clients can send.

## Subscribing During Initialization

A client MAY list channels in the `initialSubscriptions` member of `initialize`.
The client is then subscribed to those channels when initialization completes,
without separate `subscribe` requests.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "channel": "ahp-root://",
    "protocolVersions": ["0.3.0"],
    "clientId": "client-abc",
    "initialSubscriptions": ["ahp-root://", "ahp-session:/<prev-session>"]
  }
}
```

The `initialize` result contains a snapshot for each channel in the list,
except channels whose snapshot the server omits, as described in
[Subscribing](#subscribe-request). These
subscriptions use ordinary delivery. A client that wants windowed delivery for
one of these channels sends `subscribe` for it, which changes the existing
subscription.

## Protocol Notifications

A channel can also define notifications for events that are not stored in its
state. Each such notification is a separate JSON-RPC method. For example, the
server sends `root/sessionAdded` when a session is created:

```json
{
  "jsonrpc": "2.0",
  "method": "root/sessionAdded",
  "params": {
    "channel": "ahp-root://",
    "summary": { "resource": "ahp-session:/<uuid>", "title": "New Session", ... }
  }
}
```

and `root/sessionSummaryChanged` when some fields of a session summary change:

```json
{
  "jsonrpc": "2.0",
  "method": "root/sessionSummaryChanged",
  "params": {
    "channel": "ahp-root://",
    "session": "ahp-session:/<uuid>",
    "changes": { "title": "Refactor auth middleware", "status": 8 }
  }
}
```

The server sends a protocol notification only to clients that are subscribed to
its channel. With ordinary delivery, protocol notifications are not replayed
after a client reconnects. To get current data after reconnecting, a client uses
channel state or a request such as `listSessions`.

## Windowed Delivery

By default, the server sends a subscription's messages as soon as they are
available. A client can instead offer **windowed delivery** when it subscribes.
With windowed delivery, a sender waits for credit when the amount of data it
has sent but the receiver has not released reaches the subscription's window.
Large messages are sent in fragments, and each fragment counts against the
window. The receiver releases data with `channel/credit` notifications.

Windowed delivery is useful for channels that can produce data faster than a
client processes it, such as terminal output. See
[Windowed Delivery](/specification/windowed-delivery) for the complete
definition.
