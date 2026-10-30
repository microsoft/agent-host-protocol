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

### Automatic idle keepalive

The client driver sends a root-channel `ping` after 30 seconds without received
wire traffic and closes the connection after 90 seconds of continuous inbound
silence. Any inbound frame proves liveness, not just a ping response. Outbound
requests and notifications do not reset these deadlines. There is at most one
automatic ping pending at a time, using the same ID allocator and response map
as ordinary requests. Automatic keepalive is independent of the request timeout
and requires no transport extension or separate heartbeat task.

Configure these deadlines, or disable keepalive, through `ClientConfig`:

```rust
use ahp::{ClientConfig, KeepaliveConfig};
use std::time::Duration;

let config = ClientConfig {
    keepalive: Some(KeepaliveConfig {
        idle_interval: Duration::from_secs(15),
        liveness_timeout: Duration::from_secs(45),
    }),
    ..ClientConfig::default()
};
let disabled = ClientConfig { keepalive: None, ..ClientConfig::default() };
```

The idle interval must be nonzero, and the liveness timeout must be greater
than it. Invalid policy is rejected by `Client::connect` before I/O. Consumers
constructing `ClientConfig` with all fields explicitly must add `keepalive`;
struct updates using `..ClientConfig::default()` remain source-compatible.
The wire protocol is unchanged. These are local SDK settings, not automatic
interpretation of host metadata or negotiated deadlines.

Because `Transport::send` and `recv` borrow the same transport, receive
observation pauses during a send. With keepalive enabled, each send is bounded
separately by `liveness_timeout` measured from the start of that write; a stalled
write is reported as a transport write timeout, not inbound silence. Transport
cleanup is bounded to five seconds, even if `close` cannot complete.

Keepalive ends with shutdown, transport closure, or dropping the last client.
Liveness failure closes event streams so managed hosts follow their normal
reconnect policy. In-flight normal requests retain their `-32000`
`ClientError::Rpc` teardown errors, and request timeouts remain
`ClientError::Cancelled`. Cancelling a request future removes its pending entry
without retracting an already-sent request.

Managed hosts become connected and expose their generation-checked client as
soon as `initialize` / `reconnect` completes, before `listSessions` resolves.
The concurrent session-cache refresh preserves intervening notifications and
cannot apply results after connection replacement. Refresh failures are logged
and do not change readiness.

Managed hosts retain their request ID allocator across connection attempts for
the lifetime of one host supervisor, including failed handshakes. Late replies
from an earlier transport cannot match a newly allocated request on that
logical host. Independent hosts and standalone `Client::connect` calls still
start independent ID sequences. Exhausting the `u64` request ID space fails
explicitly with `ClientError::Transport(TransportError::Protocol(_))` rather
than reusing an ID.

## See also

- [`ahp-types`](https://crates.io/crates/ahp-types) — wire types only (no I/O)
- [`ahp-ws`](https://crates.io/crates/ahp-ws) — WebSocket transport
- [Connecting to multiple hosts](https://github.com/microsoft/agent-host-protocol/blob/main/clients/rust/MULTI_HOST.md) — the [`hosts`](https://docs.rs/ahp/latest/ahp/hosts/) module wraps multi-host registry, reconnect, fan-in, and aggregated views; single-host consumers use `MultiHostClient::single`
- [Protocol documentation](https://microsoft.github.io/agent-host-protocol/)
