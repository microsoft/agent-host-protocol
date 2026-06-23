# ahp-ws

WebSocket transport for the [Agent Host Protocol (AHP)](https://github.com/microsoft/agent-host-protocol) Rust SDK.

[![crates.io](https://img.shields.io/crates/v/ahp-ws.svg)](https://crates.io/crates/ahp-ws)
[![docs.rs](https://img.shields.io/docsrs/ahp-ws)](https://docs.rs/ahp-ws)

Implements [`ahp::Transport`](https://docs.rs/ahp/latest/ahp/transport/trait.Transport.html) using [`tokio-tungstenite`](https://crates.io/crates/tokio-tungstenite), supporting both `ws://` and `wss://`.

## Usage

```toml
[dependencies]
ahp = "0.1"
ahp-ws = "0.1"
tokio = { version = "1", features = ["full"] }
```

```rust
use ahp::{Client, ClientConfig, SubscriptionEvent};
use ahp_ws::WebSocketTransport;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let transport = WebSocketTransport::connect("ws://localhost:12345").await?;
    let client = Client::connect(transport, ClientConfig::default()).await?;

    client.initialize("my-client".into(), vec![ahp_types::PROTOCOL_VERSION.to_string()], vec![ahp_types::ROOT_RESOURCE_URI.to_string()]).await?;

    let mut sub = client.attach_subscription(ahp_types::ROOT_RESOURCE_URI).await;
    while let Some(SubscriptionEvent::Action(a)) = sub.recv().await {
        println!("{:?}", a.action);
    }

    client.shutdown().await;
    Ok(())
}
```

## API

- **[`WebSocketTransport::connect(url)`](https://docs.rs/ahp-ws/latest/ahp_ws/struct.WebSocketTransport.html#method.connect)** — open a new connection
- **[`WebSocketTransport::from_stream(stream)`](https://docs.rs/ahp-ws/latest/ahp_ws/struct.WebSocketTransport.html#method.from_stream)** — wrap an existing `tokio-tungstenite` stream for custom TLS or connection options

## TLS backends

`wss://` support is selected by Cargo feature. The default is `rustls-tls-native-roots`: a pure-Rust TLS stack (no OpenSSL on Linux) with roots loaded from the OS trust store, so dials through a TLS-intercepting egress proxy keep working. Override it with `default-features = false` and pick one:

| Feature | TLS stack | Trust roots |
| --- | --- | --- |
| `rustls-tls-native-roots` (default) | rustls (pure Rust) | OS trust store |
| `rustls-tls-webpki-roots` | rustls (pure Rust) | bundled Mozilla roots |
| `native-tls` | platform (SChannel / Secure Transport / OpenSSL) | OS trust store |

With no TLS feature enabled, only `ws://` works; `wss://` fails at connect time. The rustls backends use the `ring` crypto provider. If more than one backend ends up enabled (e.g. via Cargo feature unification across the dependency graph), `native-tls` takes precedence, since `tokio-tungstenite`'s automatic connector prefers it. Because any crate in the graph can pull in `native-tls`, your own feature selection alone can't guarantee which backend `connect` uses; when you need a specific backend regardless of the final feature set, build a `tokio-tungstenite` connector yourself and wrap it with `WebSocketTransport::from_stream`.

## See also

- [`ahp`](https://crates.io/crates/ahp) — the main client crate
- [`ahp-types`](https://crates.io/crates/ahp-types) — wire types only
- [Protocol documentation](https://microsoft.github.io/agent-host-protocol/)
