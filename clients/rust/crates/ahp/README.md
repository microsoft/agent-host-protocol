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

## Owned TCP byte streams

After `initialize` advertises `tcpConnections` with `base64` support, create a
stream atomically through its parent session:

```rust
use ahp_types::state::TcpDataEncoding;
use ahp_types::commands::TcpConnectionSubscription;

let connection = client.open_tcp_connection(session_uri.clone(), TcpConnectionSubscription {
    r#type: "tcpConnection".into(),
    host: "localhost".into(),
    port: 3000,
    encoding: TcpDataEncoding::Base64,
    receive_window_bytes: 256 * 1024,
    maximum_chunk_size: 64 * 1024,
}).await?;
connection.write_all(&request_bytes).await?;
connection.end().await?; // Input EOF; output remains readable.
while let Some(chunk) = connection.read().await? {
    // Consume this chunk.
}
connection.dispose().await?;
```

The SDK owns buffering, flow control, and replay. `read` releases receive credit;
`drain` waits for destination consumption. `write` accepts one chunk and returns
its byte count; `write_all` loops under one writer permit. Concurrent writers
are rejected. Cancelling `write_all` can leave an accepted prefix, so do not
blindly retry the whole buffer.

Finish the writer before calling `close`, and keep reading until EOF while the
close handshake drains. Cancelling the future stops waiting, not the handshake.
`dispose` aborts without draining; call it on error/cancellation too. Clones share
ownership; last-handle drop attempts best-effort cleanup.

Transport loss suspends the same handles. For deliberate transport replacement,
use `shutdown_preserving_tcp().await`; normal shutdown disposes streams. Create a
fresh `Client` and resume instead of initializing again:

```rust
use ahp_types::commands::ReconnectParams;

let result = fresh_client.reconnect_tcp_connections(ReconnectParams {
    channel: ahp_types::ROOT_RESOURCE_URI.into(),
    meta: None,
    client_id: "my-client".into(), // Same ID used by the original initialize.
    last_seen_server_seq,
    subscriptions: vec![session_uri],
}, &[connection.clone()]).await?;
```

Continue using the same handle; apply the returned result only to non-TCP
subscriptions. Snapshot fallback or missing resources fail streams rather than
creating new sockets.

For managed hosts, call `HostClientHandle::open_tcp_connection(session_uri, create)`
instead of opening through `raw_client()`. The runtime automatically resumes
streams across reconnects and disposes them on host removal or shutdown.
Transport/retry policy, connection limits, and native socket bridges remain
application-owned. See the [TCP channel contract](../../../../docs/specification/tcp-channel.md).

## Loss-sensitive raw events (advanced)

Ordinary `client.events()` skips events when its bounded buffer overflows.
For loss-sensitive consumers, attach `client.events_strict()` before sending
requests. Its `recv().await` returns `Result<Option<ClientEvent>, ClientError>`:
overflow reports `ClientError::SubscriptionLag`, and decode loss reports
`ClientError::Transport(TransportError::Protocol(...))`. Both terminate the
receiver rather than skipping events. Capacity uses
`ClientConfig::subscription_buffer`; ordinary receivers are unchanged.
These raw receivers are global. The owned TCP adapter instead registers a strict
child-scoped receiver during creation reply processing and reattaches it per
child on reconnect. Unrelated traffic cannot exhaust a TCP stream's event buffer.

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
