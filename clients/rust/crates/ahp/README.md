# ahp

Async Rust client for the [Agent Host Protocol (AHP)](https://github.com/microsoft/agent-host-protocol).

[![crates.io](https://img.shields.io/crates/v/ahp.svg)](https://crates.io/crates/ahp)
[![docs.rs](https://img.shields.io/docsrs/ahp)](https://docs.rs/ahp)

Transport-agnostic SDK that builds on [`ahp-types`](https://crates.io/crates/ahp-types). Bring your own transport — WebSocket, stdio, TCP, or an in-memory channel pair for tests.

## Features

- **[`Client`](https://docs.rs/ahp/latest/ahp/client/struct.Client.html)** — async JSON-RPC client with action subscription, write-ahead dispatch, and background I/O task
- **[`reducers`](https://docs.rs/ahp/latest/ahp/reducers/)** — pure state reducers; apply `StateAction`s to `RootState` / `SessionState` / terminal state
- **[`Transport`](https://docs.rs/ahp/latest/ahp/transport/trait.Transport.html)** — pluggable trait for any framed message stream

## Usage

```toml
[dependencies]
ahp = "0.1"
ahp-ws = "0.1"   # or bring your own transport
tokio = { version = "1", features = ["full"] }
```

```rust
use ahp::{Client, ClientConfig, SubscriptionEvent};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let transport = ahp_ws::WebSocketTransport::connect("ws://localhost:12345").await?;
    let client = Client::connect(transport, ClientConfig::default()).await?;

    client.initialize("my-client".into(), vec![ahp_types::PROTOCOL_VERSION.to_string()], vec![ahp_types::ROOT_RESOURCE_URI.to_string()]).await?;

    let mut sub = client.attach_subscription(ahp_types::ROOT_RESOURCE_URI).await;
    while let Some(SubscriptionEvent::Action(a)) = sub.recv().await {
        println!("seq={} action={:?}", a.server_seq, a.action);
    }

    client.shutdown().await;
    Ok(())
}
```

## Custom transport

Implement `ahp::Transport` for any framed byte stream:

```rust
use ahp::{Transport, TransportError, TransportMessage};
use std::future::Future;

struct MyTransport { /* ... */ }

impl Transport for MyTransport {
    fn send(&mut self, msg: TransportMessage)
        -> impl Future<Output = Result<(), TransportError>> + Send
    { async { todo!() } }

    fn recv(&mut self)
        -> impl Future<Output = Result<Option<TransportMessage>, TransportError>> + Send
    { async { todo!() } }
}
```

See `tests/client_roundtrip.rs` for a complete in-memory example.

## See also

- [`ahp-types`](https://crates.io/crates/ahp-types) — wire types only (no I/O)
- [`ahp-ws`](https://crates.io/crates/ahp-ws) — WebSocket transport
- [Connecting to multiple hosts](https://github.com/microsoft/agent-host-protocol/blob/main/clients/rust/MULTI_HOST.md) — the [`hosts`](https://docs.rs/ahp/latest/ahp/hosts/) module wraps multi-host registry, reconnect, fan-in, and aggregated views; single-host consumers use `MultiHostClient::single`
- [Protocol documentation](https://microsoft.github.io/agent-host-protocol/)
## Windowed subscriptions

Windowing is **off by default**. Configure defaults through the non-breaking
builder, then opt in separately for each subscription:

```rust
use ahp::{Client, SubscriptionEvent, WindowOptions, WindowingConfig};
use ahp_ws::WebSocketTransport;

async fn example() -> Result<(), Box<dyn std::error::Error>> {
let client = Client::builder()
    .default_request_timeout(Some(std::time::Duration::from_secs(30)))
    .subscription_buffer(256)
    .windowing(WindowingConfig::default()
        .window_bytes(262_144)
        .max_buffered_send_bytes(1_048_576))
    .connect(WebSocketTransport::connect("ws://localhost:12345").await?)
    .await?;
client.initialize("example".into(), vec!["1.1.0".into()], vec![]).await?;

let (_, mut terminal) = client
    .subscribe_windowed("ahp-terminal:/t1", WindowOptions::default())
    .await?;
while let Some(delivery) = terminal.next().await? {
    match delivery.event() {
        SubscriptionEvent::Snapshot(snapshot) => println!("reset: {:?}", snapshot.state),
        SubscriptionEvent::Action(action) => println!("apply: {:?}", action.action),
        _ => {}
    }
    // Await your slow rendering here. Credit is withheld until delivery drops.
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
}
Ok(())
}
```

There is no auto/manual flag in Rust. Dropping `Delivery` at the end of the loop
body is automatic release. Moving it into another task or retaining it is manual
release; `delivery.release()` is idempotent and Drop releases any remaining credit.
The snapshot is always the first delivery when supplied, including ordinary
fallback (where it carries no credit). The host may lower the offered limits or
decline them; inspect `subscription.status()` for mode, fallback reason, limits,
queued amounts and writability. Offers do not change protocol version negotiation.

```rust
async fn example(mut tcp: ahp::WindowedSubscription) -> Result<(), ahp::WindowError> {
let (tx, mut rx) = tokio::sync::mpsc::channel::<ahp::Delivery>(16);
let writer = tokio::spawn(async move {
    while let Some(mut delivery) = rx.recv().await {
        // Write tcp/data's decoded bytes to your bounded sink, awaiting completion.
        // Retaining this delivery during the write slows the sender.
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        delivery.release();
    }
});
while let Some(delivery) = tcp.next().await? {
    if tx.send(delivery).await.is_err() { break; }
}
drop(tx);
let _ = writer.await;
Ok(())
}
```

The sender's awaited methods complete after transport writing, not host processing.
`wait_writable()` is advisory, not a reservation. Queue admission waits when the
configured send budget is full. A single message larger than that budget is
admitted when the subscription's queue is empty, and fragments/window credit pace
it; the budget limits data waiting behind it. The send budget/status includes original queued inputs, including the
individual receipts retained by a coalesced send. Window accounting charges only
the actual merged wire text. Cancelling a queued send before it starts removes it; once fragmenting
starts, the logical message completes.

```rust
async fn example(tcp: ahp::WindowedSubscription) -> Result<(), ahp::WindowError> {
// Create this TCP connection through createTcpConnection before subscribing.
let sender = tcp.sender();
sender.wait_writable().await?;
sender.send("tcp/data", ahp::ahp_types::notifications::TcpDataParams {
    channel: tcp.uri().into(),
    data: "SGk=".into(),
}).await?;
let mut changes = tcp.status_changes();
println!("pressure: {:?}", changes.borrow_and_update());
Ok(())
}
```

Coalescing is enabled by default and merges only adjacent queued data:
incoming `terminal/data`, compatible `chat/delta`, and outgoing TCP byte chunks.
It never merges snapshots, controls, echoes carrying origin, or individually
sequenced dispatches. Disable it with `WindowOptions::default().coalescing(false)`.
Register connection-wide custom coalescers before the built-ins:

```rust
use ahp::{CoalescingContext, Direction, WindowingConfig};
use ahp::ahp_types::messages::JsonRpcNotification;

let config = WindowingConfig::default().coalescer(
    |earlier: &JsonRpcNotification, later: &JsonRpcNotification,
     context: &CoalescingContext| {
        // An application-defined notification whose counts can be added losslessly.
        if context.direction != Direction::Receive || later.method != "example/count" {
            return None;
        }
        let total = earlier.params.as_ref()?["count"].as_u64()?
            .checked_add(later.params.as_ref()?["count"].as_u64()?)?;
        let mut merged = later.clone();
        merged.params.as_mut()?["count"] = total.into();
        Some(merged)
    });
```

Custom rules must preserve channel/method and mandatory event semantics. Receive
coalescing does not inject or require delivery latency preferences. Credits retain
original wire sizes, not the size of the local projection. Fragments are credited
as stored, except the final fragment held by the consumer. Consequently windowing
does not bound reassembled-message memory.

Use `Client::flow_control_events()` for lossy connection telemetry; the same event
points emit `tracing` debug records. Existing global/broadcast event streams are
observers, remain lossy, and never release credit.

Multi-host consumers use `HostConfig::with_windowing(config)` and
`MultiHostClient::subscribe_windowed(&host_id, uri, options)`. The owner queue
survives reconnect, including unread old deliveries; their later release never
credits a new connection. Snapshot/replay/live recovery is per channel, dropped
subscriptions report an error, pending sends fail instead of replaying, and TCP
channels never resume. `MultiHostStateMirror::apply_delivery` accepts this reliable
feed. Multi-host flow events include the host id.

Dropping a managed handle also removes its runtime subscription intent. Failed or
cancelled subscribe calls do not leave inactive send queues; late replies are
installed for the same subscription generation or cleaned up without closing the
connection. Graceful shutdown drains already-enqueued ordinary messages and
always closes observer streams, including when a stalled transport must be aborted.

Custom transports retain source compatibility and default to ordinary fallback.
For exact-text transports, implement `Transport::window_capabilities()` or wrap
with `ahp::transport::RawTextTransport::new(transport, Some(safe_utf16_limit))`.
Never return parsed-only data after asserting this capability: exact received text
is required for accounting. Advanced generated subscribe/reconnect requests use
the same negotiation hook; obtain their owning queue with `windowed_subscription`.
