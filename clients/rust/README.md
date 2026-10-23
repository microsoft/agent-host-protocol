# Rust SDK for the Agent Host Protocol

Transport-agnostic Rust client for [AHP](../../README.md).

## Crates

- **`ahp-types`** — Wire types generated from the TypeScript source of
  truth in `types/`. Regenerate with `npm run generate:rust` from the
  repo root.
- **`ahp`** — Async client, pure reducers, a pluggable `Transport`
  trait, and an [`ahp::hosts`](https://docs.rs/ahp/latest/ahp/hosts/)
  module for multi-host registry / reconnect / fan-in. No network
  dependencies — bring your own transport.
- **`ahp-ws`** — WebSocket transport adapter built on
  `tokio-tungstenite`.

## Quick start

```rust
use ahp::{Client, ClientConfig, SubscriptionEvent};

let transport = ahp_ws::WebSocketTransport::connect("ws://localhost:12345").await?;
let client = Client::connect(transport, ClientConfig::default()).await?;

let init = client
    .initialize("my-client".into(), vec![ahp_types::PROTOCOL_VERSION.to_string()], vec![ahp_types::ROOT_RESOURCE_URI.to_string()])
    .await?;

let mut sub = client.attach_subscription(ahp_types::ROOT_RESOURCE_URI).await;
while let Some(SubscriptionEvent::Action(a)) = sub.recv().await {
    println!("seq={} {:?}", a.server_seq, a.action);
}
```

## Using a custom transport

Implement `ahp::Transport` for any framed bytes stream — stdio, a Unix
socket, an in-memory channel pair, a TCP connection with your own
framing, etc. The trait surface is three async methods:

```rust
pub trait Transport: Send + 'static {
    fn send(&mut self, msg: TransportMessage)
        -> impl Future<Output = Result<(), TransportError>> + Send;
    fn recv(&mut self)
        -> impl Future<Output = Result<Option<TransportMessage>, TransportError>> + Send;
    fn close(&mut self)
        -> impl Future<Output = Result<(), TransportError>> + Send { async { Ok(()) } }
}
```

See `crates/ahp/tests/client_roundtrip.rs` for a working in-memory
transport used by the integration test.

## Protocol version mapping

This crate exposes two protocol-version constants:

- `ahp_types::PROTOCOL_VERSION` — the SemVer string for the version the
  crate's `0.x.y` source tree implements.
- `ahp_types::SUPPORTED_PROTOCOL_VERSIONS` — every version this crate is
  willing to negotiate, most-preferred-first. Pass the slice (or a
  derived `Vec<String>`) as `InitializeParams.protocol_versions`.

The same information is mirrored, in machine-readable form, in
[`clients/rust/release-metadata.json`](release-metadata.json) and, in
human-readable form, in [`CHANGELOG.md`](CHANGELOG.md).

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

## Multi-host clients

See [MULTI_HOST.md](MULTI_HOST.md) for the Rust SDK's multi-host registry, reconnect supervision, fan-in events, aggregated views, and single-host convenience API.
## Consumer-driven windowing

The `ahp` client now supports opt-in windowed subscriptions. Existing
`ClientConfig`, `Client::connect`, ordinary subscription and observer APIs remain
source-compatible. Use `Client::builder().windowing(WindowingConfig::default())`
for connection defaults and `subscribe_windowed(uri, WindowOptions::default())`
for opt-in. Keep a `Delivery` alive while processing; Drop or `release()` returns
credit. The returned sender exposes `wait_writable()`, awaited `send`/`dispatch`,
and status watch streams. Default and custom connection-wide coalescers operate
only on adjacent queued data.

See [the ahp examples](crates/ahp/README.md#windowed-subscriptions) for automatic
and manual release, send pressure, custom coalescers and managed reconnects, and
[the websocket limits](crates/ahp-ws/README.md#windowing-defaults) for transport-safe
UTF-16 frame defaults.
