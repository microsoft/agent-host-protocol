# Rust SDK for the Agent Host Protocol

Transport-agnostic Rust client for [AHP](../../README.md).

## Crates

- **`ahp-types`** — Wire types generated from the TypeScript source of
  truth in `types/`. Regenerate with `npm run generate:rust` from the
  repo root.
- **`ahp`** — Async client, pure reducers, and a pluggable `Transport`
  trait. No network dependencies — bring your own transport.
- **`ahp-ws`** — WebSocket transport adapter built on
  `tokio-tungstenite`.

## Quick start

```rust
use ahp::{Client, ClientConfig, SubscriptionEvent};

let transport = ahp_ws::WebSocketTransport::connect("ws://localhost:12345").await?;
let client = Client::connect(transport, ClientConfig::default()).await?;

let init = client
    .initialize("my-client".into(), 1, vec!["root:/".into()])
    .await?;

let mut sub = client.attach_subscription("root:/").await;
while let Some(SubscriptionEvent::Action(a)) = sub.recv().await {
    println!("seq={} {:?}", a.server_seq, a.action);
}
```

## Using a custom transport

Implement `ahp::Transport` for any framed bytes stream — stdio, a Unix
socket, an in-memory channel pair, a TCP connection with your own
framing, etc. The trait surface is three async methods:

```rust
#[async_trait]
pub trait Transport: Send + 'static {
    async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError>;
    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError>;
    async fn close(&mut self) -> Result<(), TransportError> { Ok(()) }
}
```

See `crates/ahp/tests/client_roundtrip.rs` for a working in-memory
transport used by the integration test.

## Regenerating types

```sh
npm run generate:rust
```

The generator (`scripts/generate-rust.ts`) parses `types/*.ts` with
`ts-morph` and emits Rust modules under `crates/ahp-types/src/`. Do not
edit the generated files by hand.

## Running tests

```sh
cargo test --workspace
```
