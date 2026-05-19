# Connecting to Multiple Hosts

The Agent Host Protocol describes a single _client -> host_ connection. A real product often needs to talk to **two or more hosts at once**: a local sessions server and a tunnel-attached remote, a personal host and a teammate's, multiple project hosts in a desktop sidebar, and so on. The protocol itself does not say how to wire that up; it is a client SDK concern.

This page covers the Rust SDK's multi-host layer.

## Why a built-in abstraction?

Without one, every consumer ends up writing the same things:

- N independent `Client` instances and their lifetimes
- N transports plus reconnect supervisors with backoff and cancellation
- A registry that keys per-host metadata (label, URL, connection state, last error, agents, `serverSeq`, subscriptions, default directory) for UX
- A fan-in of inbound events tagged with which host produced them
- Per-host scoping of resource URIs (`ahp-session:/s1` on Host A != `ahp-session:/s1` on Host B)
- Persistence of `clientId` per host so reconnect identity survives restarts
- A per-host root state mirror plus session summary cache so sidebars and inboxes do not degrade to "subscribe to everything"

The Rust SDK ships a `MultiHostClient` that wraps all of this. **Single-host = N=1 of multi-host**, so the same API works either way.

## Per-host UX surface

Every registered host appears as a `HostHandle` snapshot:

| Field | Notes |
|---|---|
| `id`, `label` | Stable identifier and human-readable display name |
| `state` | `Disconnected`, `Connecting`, `Connected`, `Reconnecting { attempt }`, `Failed { reason }` |
| `last_error`, `last_connected_at` | Surface in your status bar / debug panel |
| `protocol_version`, `default_directory`, `completion_trigger_characters` | From `InitializeResult` |
| `client_id` | The id actually sent on `initialize`/`reconnect` |
| `server_seq` | Highest `serverSeq` seen for this host |
| `agents`, `active_sessions`, `terminals` | Mirrored from the host's `RootState` |
| `subscriptions` | URIs the supervisor will re-subscribe to across reconnects |
| `session_summaries` | Cached `SessionSummary[]` kept fresh by `listSessions` plus root session notifications |
| `generation` | Bumped on every reconnect; used to invalidate stale client handles |

Snapshots are immutable. To observe changes, listen to the connection-event stream (`host_events`) or take fresh snapshots when you need them.

## Reconnect, generation, and ownership

Each host runs in its own internal task, a `HostRuntime`, that owns the current `Client`, retries the configured `ReconnectPolicy`, and re-subscribes to known URIs across reconnects.

Every successful reconnect bumps a per-host **generation** counter. Any `HostClientHandle` you obtained from a previous connection refuses to dispatch on the new one and returns `HostError::HostReconnected`; request a fresh handle in that case. This prevents subtle bugs where a handle held across a reconnect silently writes to a different connection.

## Stable `clientId` per host

The protocol uses `clientId` to identify a logical client across reconnects. Each host gets its own `clientId`. `HostConfig::new` generates a session-stable id by default; production apps should persist one and pass it back through `HostConfig::with_client_id` so reconnect identity survives launches.

## Rust API

Single-host first:

```rust
use std::sync::Arc;
use ahp::hosts::{HostConfig, MultiHostClient};
use ahp::transport::BoxedTransport;
use ahp::TransportError;

async fn open_local(_id: ahp::hosts::HostId) -> Result<BoxedTransport, TransportError> {
    let transport = ahp_ws::WebSocketTransport::connect("ws://localhost:12345").await?;
    Ok(BoxedTransport::new(transport))
}

# async fn run() -> Result<(), Box<dyn std::error::Error>> {
let config = HostConfig::new("local", "Local sessions server", open_local);
let (multi, handle) = MultiHostClient::single(config).await?;
println!("connected to {}: {:?}", handle.label, handle.state);
# let _ = multi; Ok(()) }
```

Multi-host shape. The consumer never sees registry boilerplate beyond the call to `add_host`:

```rust
use ahp::hosts::{HostConfig, MultiHostClient};

# async fn run() -> Result<(), Box<dyn std::error::Error>> {
let multi = MultiHostClient::new();
multi
    .add_host(HostConfig::new("local", "Local", open_local))
    .await?;
multi
    .add_host(HostConfig::new("remote", "Tunnel", open_remote))
    .await?;

let mut events = multi.events();
while let Some(event) = events.recv().await {
    println!(
        "[{}] resource={:?} event={:?}",
        event.host_id, event.resource, event.event
    );
}
# # async fn open_local(_: ahp::hosts::HostId) -> Result<ahp::transport::BoxedTransport, ahp::TransportError> { unimplemented!() }
# # async fn open_remote(_: ahp::hosts::HostId) -> Result<ahp::transport::BoxedTransport, ahp::TransportError> { unimplemented!() }
# Ok(()) }
```

Aggregated views are first-class. The multi-host layer maintains the per-host session-summary cache, so this is a snapshot read, not a fan-out subscription:

```rust
# async fn run(multi: ahp::hosts::MultiHostClient) {
let inbox = multi.aggregated_sessions().await;
for hosted in inbox {
    println!(
        "[{}] {} ({})",
        hosted.host_label, hosted.summary.title, hosted.host_id
    );
}
# }
```

Advanced consumers can drop down to the underlying `Client` through a generation-checked `HostClientHandle`:

```rust
# async fn run(multi: ahp::hosts::MultiHostClient) -> Result<(), ahp::hosts::HostError> {
let handle = multi
    .client(&"local".into())
    .await
    .expect("host registered");

handle.check_alive().await?;
# Ok(()) }
```

Configuration knobs live on `HostConfig` (`with_client_id`, `with_initial_subscriptions`, `with_client_config`, `with_reconnect_policy`) and on `ReconnectPolicy::{disabled, immediate_forever, exponential}`. For persistent identity across launches, persist the `clientId` you pass to [`HostConfig::with_client_id`](https://docs.rs/ahp/latest/ahp/hosts/struct.HostConfig.html#method.with_client_id) yourself, for example in your app's keychain or settings store, and supply it on subsequent launches.

## Choosing single-host vs multi-host

You do not choose. Single-host consumers use `MultiHostClient::single(...)` and never see registry concepts. The SDK imposes no per-host overhead beyond a single supervisor task, and there is no separate single-host API to learn.
