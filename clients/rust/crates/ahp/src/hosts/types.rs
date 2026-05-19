//! Public-facing types for the multi-host SDK.

use std::sync::Arc;
use std::time::SystemTime;

use ahp_types::actions::ActionEnvelope;
use ahp_types::state::{AgentInfo, RootState, SessionSummary, TerminalInfo};
use thiserror::Error;
use tokio::sync::{broadcast, Mutex};

use crate::{Client, ClientConfig, ClientError, DispatchHandle, SubscriptionEvent};

use super::factory::HostTransportFactory;
use super::policy::ReconnectPolicy;

/// Stable identifier for a host registered with [`super::MultiHostClient`].
///
/// This is opaque to the SDK — consumers pick the format. It's used as
/// the routing key for commands and the tag on every
/// [`HostSubscriptionEvent`].
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct HostId(String);

impl HostId {
    /// Build a [`HostId`] from any string-like.
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Borrow the underlying string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for HostId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for HostId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for HostId {
    fn from(s: &str) -> Self {
        Self(s.to_owned())
    }
}

/// Connection state for a single host.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum HostState {
    /// The host has been added but no transport is open.
    Disconnected,
    /// A transport is being opened or the `initialize` handshake is in flight.
    Connecting,
    /// The host is fully connected and serving subscriptions.
    Connected,
    /// A previous connection dropped; the supervisor is retrying with backoff.
    Reconnecting {
        /// One-based attempt counter. Resets to 1 after a successful connection
        /// when [`ReconnectPolicy::reset_on_success`] is `true`.
        attempt: u32,
    },
    /// Reconnect attempts were exhausted (or [`ReconnectPolicy::disabled`]
    /// was configured) and the host is no longer trying.
    Failed {
        /// Most recent failure that drove the host into this state. Cloned
        /// references survive across snapshots without copying the
        /// underlying error.
        error: Arc<ClientError>,
    },
}

impl PartialEq for HostState {
    /// Equality compares the discriminant and any payload that has a
    /// natural equality. [`HostState::Failed`] always compares unequal
    /// because [`ClientError`] is not [`PartialEq`] (it wraps
    /// `serde_json::Error` and JSON-RPC error payloads).
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (HostState::Disconnected, HostState::Disconnected) => true,
            (HostState::Connecting, HostState::Connecting) => true,
            (HostState::Connected, HostState::Connected) => true,
            (HostState::Reconnecting { attempt: a }, HostState::Reconnecting { attempt: b }) => {
                a == b
            }
            _ => false,
        }
    }
}

/// Configuration for a single host registered with [`super::MultiHostClient`].
///
/// Use [`HostConfig::new`] for the common case (id + label + transport
/// factory). Override individual fields with the `with_*` methods.
///
/// # `client_id`
///
/// Each host needs a stable `clientId` so the AHP `reconnect` flow
/// works across launches. By default [`HostConfig::new`] generates a
/// session-stable UUID; pass [`HostConfig::with_client_id`] (typically
/// loaded from your app's keychain or settings store) for a value that
/// survives restarts.
pub struct HostConfig {
    /// Stable host identifier.
    pub id: HostId,
    /// Human-readable label. Surfaced through [`HostHandle::label`].
    pub label: String,
    /// `clientId` sent to this host on `initialize` / `reconnect`.
    pub client_id: String,
    /// URIs to include in the `initialize` handshake. Defaults to
    /// `["ahp-root://"]` so root state is always tracked.
    pub initial_subscriptions: Vec<String>,
    /// Configuration forwarded to the underlying [`Client`].
    pub client_config: ClientConfig,
    /// Factory used to (re-)open a transport for this host.
    pub transport_factory: Arc<dyn HostTransportFactory>,
    /// Reconnect behaviour after an unexpected drop.
    pub reconnect_policy: ReconnectPolicy,
}

impl HostConfig {
    /// Build a [`HostConfig`] with sensible defaults.
    ///
    /// Generates a fresh, session-stable `clientId`. If you want
    /// reconnect identity to survive process restarts, persist the id
    /// you supply here yourself and pass it via
    /// [`HostConfig::with_client_id`] on subsequent launches.
    pub fn new(
        id: impl Into<HostId>,
        label: impl Into<String>,
        transport_factory: impl HostTransportFactory,
    ) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            client_id: generate_client_id(),
            initial_subscriptions: vec![ahp_types::ROOT_RESOURCE_URI.to_string()],
            client_config: ClientConfig::default(),
            transport_factory: Arc::new(transport_factory),
            reconnect_policy: ReconnectPolicy::default(),
        }
    }

    /// Override the `clientId` for this host.
    pub fn with_client_id(mut self, client_id: impl Into<String>) -> Self {
        self.client_id = client_id.into();
        self
    }

    /// Replace the default `initialSubscriptions` set.
    pub fn with_initial_subscriptions(mut self, uris: Vec<String>) -> Self {
        self.initial_subscriptions = uris;
        self
    }

    /// Override the per-host [`ClientConfig`].
    pub fn with_client_config(mut self, config: ClientConfig) -> Self {
        self.client_config = config;
        self
    }

    /// Override the reconnect policy.
    pub fn with_reconnect_policy(mut self, policy: ReconnectPolicy) -> Self {
        self.reconnect_policy = policy;
        self
    }
}

impl std::fmt::Debug for HostConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HostConfig")
            .field("id", &self.id)
            .field("label", &self.label)
            .field("client_id", &self.client_id)
            .field("initial_subscriptions", &self.initial_subscriptions)
            .field("reconnect_policy", &self.reconnect_policy)
            .finish_non_exhaustive()
    }
}

/// Snapshot of everything the multi-host SDK knows about a single host.
///
/// This is the value type UIs render: connection state, last error,
/// protocol version, agents pulled from root state, subscribed URIs,
/// cached session summaries, and so on. Cheap to clone (most fields
/// are small or already `Arc`-shared internally).
///
/// Snapshots are immutable; refresh by calling [`super::MultiHostClient::host`]
/// or [`super::MultiHostClient::hosts`] again, or subscribe to the
/// observable event stream via [`super::MultiHostClient::host_events`].
#[derive(Debug, Clone)]
pub struct HostHandle {
    /// Stable identifier.
    pub id: HostId,
    /// Human-readable label from the original [`HostConfig`].
    pub label: String,
    /// `clientId` actually sent to the host on `initialize`/`reconnect`.
    pub client_id: String,
    /// Current connection state.
    pub state: HostState,
    /// Most recent failure that drove the host into a non-connected
    /// state, set when the supervisor enters
    /// [`HostState::Reconnecting`] or [`HostState::Failed`]. Cleared on
    /// a successful connect. Wrapped in [`Arc`] so cloning a snapshot
    /// doesn't copy the underlying error.
    pub last_error: Option<Arc<ClientError>>,
    /// Wall-clock time of the most recent successful `initialize` or
    /// `reconnect`. `None` until the host first connects.
    pub last_connected_at: Option<SystemTime>,
    /// Protocol version negotiated with the host on the most recent
    /// successful `initialize`.
    pub protocol_version: Option<String>,
    /// Highest `serverSeq` observed on this host.
    pub server_seq: i64,
    /// Optional `defaultDirectory` from the host's `InitializeResult`.
    pub default_directory: Option<String>,
    /// Agents currently advertised by the host (mirrored from root state).
    pub agents: Vec<AgentInfo>,
    /// Active session count from root state, when present.
    pub active_sessions: Option<i64>,
    /// Lightweight terminal listing from root state, when present.
    pub terminals: Option<Vec<TerminalInfo>>,
    /// URIs the supervisor will (re-)subscribe to across reconnects.
    pub subscriptions: Vec<String>,
    /// Trigger characters from `InitializeResult.completionTriggerCharacters`.
    pub completion_trigger_characters: Vec<String>,
    /// Cached session summaries keyed by URI. Seeded by `listSessions`
    /// after each connect and kept fresh by
    /// `root/sessionAdded`/`Removed`/`SummaryChanged` notifications.
    pub session_summaries: Vec<SessionSummary>,
    /// Generation counter — bumped on every `connect` or `reconnect`.
    /// [`HostClientHandle`]s carry the generation they were issued at,
    /// and refuse to dispatch through a stale connection.
    pub generation: u64,
}

/// Errors specific to the multi-host SDK layer.
///
/// Everything else still surfaces as [`ClientError`] from the
/// underlying [`Client`].
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum HostError {
    /// No host with that id is currently registered.
    #[error("no host registered with id {0}")]
    UnknownHost(HostId),

    /// A host with this id is already registered. Remove the existing
    /// host first if you want to replace it.
    #[error("a host with id {0} is already registered")]
    DuplicateHost(HostId),

    /// The [`HostClientHandle`] was issued for a connection that has
    /// since been replaced by a reconnect. Acquire a fresh handle via
    /// [`super::MultiHostClient::client`].
    #[error("host {host} reconnected (generation {handle_generation} -> {current_generation}); request a fresh client handle")]
    HostReconnected {
        /// The host this handle was issued for.
        host: HostId,
        /// Generation the handle was minted at.
        handle_generation: u64,
        /// Generation the host is currently on.
        current_generation: u64,
    },

    /// The host's runtime task has been torn down (e.g. the host was
    /// removed, or the multi-host client was dropped).
    #[error("host {0} runtime is no longer active")]
    HostShutDown(HostId),

    /// A request bubbled up an error from the underlying [`Client`].
    #[error(transparent)]
    Client(#[from] ClientError),
}

/// Generation-checked handle to the underlying single-host [`Client`].
///
/// Issued by [`super::MultiHostClient::client`]. Methods on this handle
/// verify that the host is still on the same `generation` it was when
/// the handle was minted; if a reconnect has occurred, dispatching
/// returns [`HostError::HostReconnected`] instead of silently writing to
/// the new connection.
#[derive(Clone)]
pub struct HostClientHandle {
    pub(super) host_id: HostId,
    pub(super) generation: u64,
    pub(super) client: Client,
    pub(super) shared: Arc<HostShared>,
}

impl HostClientHandle {
    /// Host this handle was issued for.
    pub fn host_id(&self) -> &HostId {
        &self.host_id
    }

    /// Generation this handle was minted at.
    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Validate this handle against the host's current generation.
    pub async fn check_alive(&self) -> Result<(), HostError> {
        let state = self.shared.lock().await;
        if state.generation != self.generation {
            return Err(HostError::HostReconnected {
                host: self.host_id.clone(),
                handle_generation: self.generation,
                current_generation: state.generation,
            });
        }
        Ok(())
    }

    /// Dispatch an action through this connection, refusing if the
    /// connection has been replaced by a reconnect.
    pub async fn dispatch(
        &self,
        channel: ahp_types::common::Uri,
        action: ahp_types::actions::StateAction,
    ) -> Result<DispatchHandle, HostError> {
        self.check_alive().await?;
        Ok(self.client.dispatch(channel, action).await?)
    }

    /// Issue an arbitrary JSON-RPC request through this connection,
    /// refusing if the connection has been replaced by a reconnect.
    pub async fn request<P, R>(&self, method: &str, params: P) -> Result<R, HostError>
    where
        P: serde::Serialize,
        R: serde::de::DeserializeOwned,
    {
        self.check_alive().await?;
        Ok(self.client.request(method, params).await?)
    }

    /// Borrow the underlying [`Client`] for advanced use. The caller is
    /// responsible for not holding it past the next reconnect.
    pub fn raw_client(&self) -> &Client {
        &self.client
    }
}

impl std::fmt::Debug for HostClientHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HostClientHandle")
            .field("host_id", &self.host_id)
            .field("generation", &self.generation)
            .finish_non_exhaustive()
    }
}

/// Inbound event tagged with host of origin.
///
/// Delivered by [`super::MultiHostClient::events`]. The `channel` field
/// carries the URI the event is scoped to (the envelope's `channel` for
/// actions, the notification params' `channel` for protocol
/// notifications).
#[derive(Debug, Clone)]
pub struct HostSubscriptionEvent {
    /// Host that produced the event.
    pub host_id: HostId,
    /// Channel URI this event was scoped to.
    pub channel: String,
    /// The underlying [`SubscriptionEvent`].
    pub event: SubscriptionEvent,
}

/// Stream of [`HostSubscriptionEvent`]s.
///
/// Returned by [`super::MultiHostClient::events`]. Each call returns a
/// fresh receiver — multiple consumers can listen independently. Slow
/// consumers that lag past the buffer skip the gap and keep going,
/// matching [`crate::SessionSubscription`] semantics.
///
/// Ordering is **only** guaranteed within a single host. There is no
/// cross-host total order — different hosts run independently.
pub struct HostSubscriptionStream {
    pub(super) rx: broadcast::Receiver<HostSubscriptionEvent>,
}

impl HostSubscriptionStream {
    /// Await the next event. Returns `None` when the multi-host client
    /// has been dropped.
    pub async fn recv(&mut self) -> Option<HostSubscriptionEvent> {
        loop {
            match self.rx.recv().await {
                Ok(ev) => return Some(ev),
                Err(broadcast::error::RecvError::Closed) => return None,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    }
}

/// Connection-level event for UX.
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum HostEvent {
    /// A new host was registered.
    Added {
        /// The host that was added.
        host_id: HostId,
    },
    /// The host's [`HostState`] changed.
    StateChanged {
        /// Host whose state changed.
        host_id: HostId,
        /// New state.
        state: HostState,
        /// Last error, when [`HostState::Reconnecting`] or [`HostState::Failed`].
        last_error: Option<Arc<ClientError>>,
    },
    /// The host successfully (re)connected; `generation` is the new value.
    Connected {
        /// Host that connected.
        host_id: HostId,
        /// Generation the new connection lives on.
        generation: u64,
    },
    /// A host was removed from the multi-host client.
    Removed {
        /// Host that was removed.
        host_id: HostId,
    },
}

/// Stream of [`HostEvent`]s for connection-state UX.
///
/// Returned by [`super::MultiHostClient::host_events`]. Multicast and
/// lossy on slow consumers, like [`HostSubscriptionStream`].
pub struct HostEventStream {
    pub(super) rx: broadcast::Receiver<HostEvent>,
}

impl HostEventStream {
    /// Await the next event. Returns `None` when the multi-host client
    /// has been dropped.
    pub async fn recv(&mut self) -> Option<HostEvent> {
        loop {
            match self.rx.recv().await {
                Ok(ev) => return Some(ev),
                Err(broadcast::error::RecvError::Closed) => return None,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    }
}

/// Aggregated session summary tagged with host of origin.
///
/// Returned by [`super::MultiHostClient::aggregated_sessions`]. URIs are
/// per-host scoped, so two hosts can legitimately return the same
/// `summary.resource`; consumers should treat `(host_id, summary.resource)`
/// as the compound key.
#[derive(Debug, Clone)]
pub struct HostedSessionSummary {
    /// Host the summary belongs to.
    pub host_id: HostId,
    /// Host label at the time the snapshot was taken.
    pub host_label: String,
    /// Underlying summary.
    pub summary: SessionSummary,
}

/// Aggregated agent descriptor tagged with host of origin.
///
/// Returned by [`super::MultiHostClient::aggregated_agents`].
#[derive(Debug, Clone)]
pub struct HostedAgent {
    /// Host the agent belongs to.
    pub host_id: HostId,
    /// Host label at the time the snapshot was taken.
    pub host_label: String,
    /// Underlying agent metadata.
    pub agent: AgentInfo,
}

// ─── Internal shared state ──────────────────────────────────────────────────

/// Per-host mutable state owned by the runtime and observable through
/// generation-checked snapshots. Held inside an `Arc<Mutex<_>>` so the
/// runtime task and `HostClientHandle`s can coordinate.
pub(super) struct HostShared {
    inner: Mutex<HostInternal>,
}

impl HostShared {
    pub(super) fn new(initial: HostInternal) -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(initial),
        })
    }

    pub(super) async fn lock(&self) -> tokio::sync::MutexGuard<'_, HostInternal> {
        self.inner.lock().await
    }
}

/// Mutable per-host state. Updated by the runtime task; read on the
/// snapshot path to build [`HostHandle`]s.
pub(super) struct HostInternal {
    pub(super) id: HostId,
    pub(super) label: String,
    pub(super) client_id: String,
    pub(super) state: HostState,
    pub(super) last_error: Option<Arc<ClientError>>,
    pub(super) last_connected_at: Option<SystemTime>,
    pub(super) protocol_version: Option<String>,
    pub(super) server_seq: i64,
    pub(super) default_directory: Option<String>,
    pub(super) root_state: RootState,
    pub(super) subscriptions: Vec<String>,
    pub(super) completion_trigger_characters: Vec<String>,
    pub(super) session_summaries: std::collections::BTreeMap<String, SessionSummary>,
    pub(super) generation: u64,
    pub(super) current_client: Option<Client>,
}

impl HostInternal {
    pub(super) fn snapshot(&self) -> HostHandle {
        HostHandle {
            id: self.id.clone(),
            label: self.label.clone(),
            client_id: self.client_id.clone(),
            state: self.state.clone(),
            last_error: self.last_error.clone(),
            last_connected_at: self.last_connected_at,
            protocol_version: self.protocol_version.clone(),
            server_seq: self.server_seq,
            default_directory: self.default_directory.clone(),
            agents: self.root_state.agents.clone(),
            active_sessions: self.root_state.active_sessions,
            terminals: self.root_state.terminals.clone(),
            subscriptions: self.subscriptions.clone(),
            completion_trigger_characters: self.completion_trigger_characters.clone(),
            session_summaries: self.session_summaries.values().cloned().collect(),
            generation: self.generation,
        }
    }
}

/// Helper used by the runtime to update per-host state from an
/// [`ActionEnvelope`] in one place. The protocol exposes `serverSeq`
/// as a non-negative wire counter; the SDK holds it as `i64` to match
/// the rest of the surface (`InitializeResult::server_seq`,
/// `ReconnectParams::last_seen_server_seq`).
pub(super) fn server_seq_from_envelope(env: &ActionEnvelope) -> i64 {
    env.server_seq as i64
}

/// Generate a session-stable UUIDv4-shaped string for use as a default
/// `clientId`. Consumers that want cross-launch stability should
/// persist the id themselves and pass it via [`HostConfig::with_client_id`].
pub(super) fn generate_client_id() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut hasher = DefaultHasher::new();
    let mut out = [0u8; 16];
    let now_nanos = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for i in 0..2 {
        n.hash(&mut hasher);
        now_nanos.hash(&mut hasher);
        i.hash(&mut hasher);
        let bytes = hasher.finish().to_be_bytes();
        out[i * 8..(i + 1) * 8].copy_from_slice(&bytes);
    }
    out[6] = (out[6] & 0x0f) | 0x40;
    out[8] = (out[8] & 0x3f) | 0x80;
    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        u32::from_be_bytes([out[0], out[1], out[2], out[3]]),
        u16::from_be_bytes([out[4], out[5]]),
        u16::from_be_bytes([out[6], out[7]]),
        u16::from_be_bytes([out[8], out[9]]),
        u64::from_be_bytes([0, 0, out[10], out[11], out[12], out[13], out[14], out[15]])
            & 0xffff_ffff_ffff,
    )
}
