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

Connection readiness depends only on a successful `initialize` / `reconnect`.
The event receiver is installed before that handshake, and the client is
published before the session-cache refresh starts. `listSessions` is an ordinary
concurrent RPC: slow or failed discovery does not block other client requests.
Until it completes, `session_summaries` may be empty or retain the previous
connection's cache. Notifications received during the refresh are merged over
its result; cancelled or superseded refreshes cannot update a newer connection.

The underlying client's automatic keepalive checks inbound wire silence,
independently of discovery. Configure it with `HostConfig::with_client_config`
and `ClientConfig::keepalive`; a liveness timeout closes the connection and
enters the normal reconnect policy. Set `keepalive: None` to disable it.

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

Configuration knobs live on `HostConfig` (`with_client_id`, `with_initial_subscriptions`, `with_client_config`, `with_reconnect_policy`), `ClientConfig::keepalive`, and `ReconnectPolicy::{disabled, immediate_forever, exponential}`. For persistent identity across launches, plug in a persistent `ClientIdStore` via `MultiHostClient::with_client_id_store(...)` (see below) or load the `clientId` yourself and pass it through `HostConfig::with_client_id`.

## Persistent `clientId`s — `ClientIdStore`

`HostConfig::client_id` is `Option<String>`. When you don't set it explicitly, the multi-host client resolves the id at `add_host` time:

1. `Some(explicit)` from `HostConfig::with_client_id(...)` always wins, and the value is also persisted into the store so subsequent launches transparently reuse it.
2. Otherwise, the configured `ClientIdStore` is consulted; a stored value is reused as-is.
3. Otherwise, a fresh UUID-shaped id is generated and persisted.

`MultiHostClient::new()` uses an in-process `InMemoryClientIdStore` — fine for tests and short-lived CLIs, but ids reset on restart. For cross-launch identity (the AHP `reconnect` flow needs a stable `clientId` to work across processes), build the client with a persistent store:

```rust
use std::path::PathBuf;
use std::sync::Arc;
use ahp::hosts::{FileClientIdStore, HostConfig, MultiHostClient};

# async fn run() -> Result<(), Box<dyn std::error::Error>> {
// Pick a path that suits the platform (e.g. `$XDG_DATA_HOME/<app>/client-ids`
// on Linux, `Application Support/<app>/client-ids` on macOS).
let store = Arc::new(FileClientIdStore::new(PathBuf::from(
    "/tmp/my-app/client-ids",
)));
let multi = MultiHostClient::with_client_id_store(store);
# # async fn open(_: ahp::hosts::HostId) -> Result<ahp::transport::BoxedTransport, ahp::TransportError> { unimplemented!() }
multi.add_host(HostConfig::new("local", "Local", open)).await?;
# Ok(()) }
```

`FileClientIdStore` writes one file per host id (atomic temp-file + rename, `0o600` mode on Unix from the start, percent-encoded filenames for URL-unsafe ids). Within a process, concurrent writes are serialized by an internal mutex; cross-process writes are last-writer-wins (matching the Swift SDK's `FileClientIdStore`). On Apple platforms that want Keychain semantics, wrap your own implementation of the `ClientIdStore` trait.

Persistence failures bubble up as `HostError::ClientIdStore { host, error }` from `add_host` — they aren't silently swallowed.

## Waking every host at once — `reconnect_all_unavailable`

Mobile-style consumers can call `MultiHostClient::reconnect_all_unavailable().await` to manually reconnect every host that isn't already `Connected` or `Connecting` (so: `Disconnected`, `Reconnecting`, and exhausted-policy `Failed` hosts all wake at the same time). The call dispatches reconnects concurrently, never throws, and returns a `HashMap<HostId, HostError>` of per-host failures.

```rust
# async fn run(multi: ahp::hosts::MultiHostClient) {
// Typical scene-phase pattern: when the app returns to the foreground,
// wake every host the user has been away from in one call.
let failures = multi.reconnect_all_unavailable().await;
for (host_id, err) in failures {
    eprintln!("[{host_id}] reconnect failed: {err}");
}
# }
```

## Host-aware reducer mirror — `MultiHostStateMirror`

For UIs that need to track reducer state across multiple hosts (e.g. a sidebar that surfaces sessions from N hosts at once), the SDK ships `MultiHostStateMirror`. It wraps the existing per-state reducers but keys session/terminal/changeset state by `(host_id, uri)` so the common case of two hosts advertising the same session URI doesn't clobber.

```rust
use ahp::{HostedResourceKey, MultiHostStateMirror};
# async fn run(mut mirror: MultiHostStateMirror, host_id: ahp::hosts::HostId, mut events: ahp::hosts::HostSubscriptionStream) {
while let Some(event) = events.recv().await {
    mirror.apply_event(&event);
}
let session = mirror
    .sessions()
    .get(&HostedResourceKey::new(host_id, "ahp-session:/s1"));
# let _ = session;
# }
```

⚠ Both event sources in the Rust SDK today are `tokio::sync::broadcast`-backed and **drop envelopes on slow consumers** once their buffer fills — `MultiHostClient::events()` and the per-channel `SessionSubscription` from `Client::subscribe` / `attach_subscription`. Neither survives a reconnect's replayed envelopes the way the Swift SDK's per-channel `events(host:uri:)` does. A dropped (or missed-because-reconnected) envelope permanently desyncs the mirror for that `(host, channel)` until it's re-seeded from a fresh snapshot via `apply_snapshot`. Consume with that in mind — the mirror is the right shape for multi-host UI state, but the Rust SDK doesn't yet ship a lossless feeder.

## Choosing single-host vs multi-host

You do not choose. Single-host consumers use `MultiHostClient::single(...)` and never see registry concepts. The SDK imposes no per-host overhead beyond a single supervisor task, and there is no separate single-host API to learn.
