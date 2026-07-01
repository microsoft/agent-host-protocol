//! `MultiHostClient` facade.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex as StdMutex};

use tokio::sync::{broadcast, RwLock};

use super::client_id_store::{ClientIdStore, InMemoryClientIdStore};
use super::runtime::{spawn, HostHandleTx};
use super::types::{
    generate_client_id, HostClientHandle, HostConfig, HostError, HostEvent, HostEventStream,
    HostHandle, HostId, HostState, HostSubscriptionEvent, HostSubscriptionStream, HostedAgent,
    HostedSessionSummary,
};

/// Buffer size for the cross-host fan-in broadcasts.
const DEFAULT_EVENT_BUFFER: usize = 1024;

/// Concurrent registry of [`HostHandle`]s plus the supervisor tasks
/// that drive them.
///
/// Cheap to clone — the inner state is reference-counted, so multiple
/// UI layers can hold their own clone and observe the same hosts.
///
/// See the module docs for the full surface; common entry points:
///
/// - [`MultiHostClient::single`] — one-line single-host constructor.
/// - [`MultiHostClient::add_host`] / [`MultiHostClient::remove_host`].
/// - [`MultiHostClient::events`] / [`MultiHostClient::host_events`].
/// - [`MultiHostClient::aggregated_sessions`] /
///   [`MultiHostClient::aggregated_agents`].
/// - [`MultiHostClient::reconnect_all_unavailable`].
#[derive(Clone)]
pub struct MultiHostClient {
    inner: Arc<MultiInner>,
}

struct MultiInner {
    hosts: RwLock<HashMap<HostId, HostHandleTx>>,
    /// Host ids that are currently mid-`add_host` (between the
    /// duplicate check and the supervisor spawn). Used to keep
    /// concurrent `add_host` calls for the same id from both slipping
    /// past the duplicate check while one of them is awaiting on the
    /// [`ClientIdStore`].
    ///
    /// Held as a [`std::sync::Mutex`] (not a tokio mutex) so the
    /// [`PendingHostGuard`] RAII drop path can clear cancelled
    /// reservations synchronously without needing to await — otherwise
    /// a cancelled `add_host` future would permanently poison the
    /// registry for that host id.
    pending_host_ids: StdMutex<HashSet<HostId>>,
    fan_out: broadcast::Sender<HostSubscriptionEvent>,
    host_events: broadcast::Sender<HostEvent>,
    client_id_store: Arc<dyn ClientIdStore>,
}

impl MultiHostClient {
    /// Build an empty multi-host client using the default
    /// [`InMemoryClientIdStore`].
    pub fn new() -> Self {
        Self::with_client_id_store(Arc::new(InMemoryClientIdStore::new()))
    }

    /// Build an empty multi-host client backed by a caller-supplied
    /// [`ClientIdStore`].
    ///
    /// Use this when you want `clientId`s to persist across launches
    /// (e.g. plug in [`super::FileClientIdStore`] or your own
    /// keychain-backed implementation). With the default
    /// [`InMemoryClientIdStore`], ids are stable within a single
    /// process but reset on restart.
    pub fn with_client_id_store(client_id_store: Arc<dyn ClientIdStore>) -> Self {
        let (fan_out, _) = broadcast::channel(DEFAULT_EVENT_BUFFER);
        let (host_events, _) = broadcast::channel(DEFAULT_EVENT_BUFFER);
        Self {
            inner: Arc::new(MultiInner {
                hosts: RwLock::new(HashMap::new()),
                pending_host_ids: StdMutex::new(HashSet::new()),
                fan_out,
                host_events,
                client_id_store,
            }),
        }
    }

    /// Convenience: construct a multi-host client with a single host
    /// already registered, and wait for the first connection attempt to
    /// either succeed or fail.
    ///
    /// Returns the (`MultiHostClient`, [`HostHandle`]) pair. If the host
    /// fails to connect within the configured reconnect policy, the
    /// returned handle will reflect [`HostState::Failed`] and the
    /// connection error is surfaced via `last_error`.
    ///
    /// Designed so single-host consumers don't have to think about
    /// "registry" concepts — `let (client, host) = MultiHostClient::single(config).await?;`
    /// is the whole onboarding.
    pub async fn single(config: HostConfig) -> Result<(Self, HostHandle), HostError> {
        let multi = Self::new();
        let handle = multi.add_host(config).await?;
        Ok((multi, handle))
    }

    /// Register a new host and start its supervisor task.
    ///
    /// The supervisor immediately attempts to open a transport via
    /// [`HostConfig::transport_factory`], complete the `initialize`
    /// handshake, and start fanning events. The returned handle is the
    /// snapshot at this moment — by the time the call returns the host
    /// may already be `Connected` (if connect succeeds quickly), still
    /// `Connecting`, or already `Reconnecting` if the first attempt
    /// failed.
    ///
    /// `clientId` is resolved here, before the supervisor is spawned:
    /// `HostConfig::client_id == Some(explicit)` wins outright,
    /// otherwise the configured [`ClientIdStore`] is consulted; if it
    /// returns no value a fresh UUID is generated. The resolved id is
    /// always written back into the store.
    ///
    /// The actual snapshot read uses per-host shared state directly,
    /// never the supervisor's command channel — a slow or hung
    /// transport factory therefore cannot block other registry
    /// operations.
    ///
    /// Returns [`HostError::DuplicateHost`] if the host id is already
    /// in use (or is currently being added by a concurrent caller);
    /// remove the existing host first. Returns
    /// [`HostError::ClientIdStore`] if the configured store fails to
    /// load or persist the host's `clientId`.
    pub async fn add_host(&self, config: HostConfig) -> Result<HostHandle, HostError> {
        let id = config.id.clone();

        // Reserve the id under both locks before any await. The
        // pending-id lock is a `std::sync::Mutex` so a cancelled
        // `add_host` future drops the `PendingHostGuard` and the
        // reservation is cleared synchronously — without it, a
        // cancellation between here and the install path would
        // permanently poison the registry for this id.
        let mut pending_guard = {
            let hosts = self.inner.hosts.read().await;
            let mut pending = self
                .inner
                .pending_host_ids
                .lock()
                .expect("pending_host_ids mutex poisoned");
            if hosts.contains_key(&id) || pending.contains(&id) {
                return Err(HostError::DuplicateHost(id));
            }
            pending.insert(id.clone());
            PendingHostGuard {
                inner: self.inner.clone(),
                id: id.clone(),
                armed: true,
            }
        };

        // Resolve clientId. The guard's `Drop` cleans up the
        // reservation if this await is cancelled or returns an error.
        let resolved = self
            .resolve_client_id(&id, config.client_id.as_deref())
            .await?;

        // Install the supervisor.
        let shared = {
            let mut hosts = self.inner.hosts.write().await;
            // Defensive: a `remove_host` could have re-added the id
            // while we were resolving the client id. Treat that as a
            // duplicate too. The guard still clears `pending` on drop.
            if hosts.contains_key(&id) {
                return Err(HostError::DuplicateHost(id));
            }
            let tx = spawn(
                config,
                resolved,
                self.inner.fan_out.clone(),
                self.inner.host_events.clone(),
            );
            let shared = tx.shared.clone();
            hosts.insert(id.clone(), tx);
            shared
        };

        // Host is fully installed — clear the reservation explicitly
        // and disarm so `Drop` is a no-op.
        pending_guard.commit();

        let snapshot = shared.lock().await.snapshot();
        Ok(snapshot)
    }

    /// Resolve a host's `clientId` per the rules described on
    /// [`HostConfig::client_id`]. Explicit values always win and are
    /// persisted; otherwise the store wins; otherwise a fresh UUID is
    /// generated and persisted.
    async fn resolve_client_id(
        &self,
        host_id: &HostId,
        explicit: Option<&str>,
    ) -> Result<String, HostError> {
        let store = &self.inner.client_id_store;
        let resolved = if let Some(value) = explicit {
            value.to_owned()
        } else {
            match store.load(host_id.clone()).await {
                Ok(Some(stored)) => stored,
                Ok(None) => generate_client_id(),
                Err(error) => {
                    return Err(HostError::ClientIdStore {
                        host: host_id.clone(),
                        error,
                    })
                }
            }
        };
        if let Err(error) = store.store(host_id.clone(), resolved.clone()).await {
            return Err(HostError::ClientIdStore {
                host: host_id.clone(),
                error,
            });
        }
        Ok(resolved)
    }

    /// Remove a host, cancelling its supervisor task and dropping its
    /// current connection.
    ///
    /// Any outstanding [`HostClientHandle`]s for this host become stale
    /// and will return [`HostError::HostShutDown`] from subsequent
    /// dispatches.
    pub async fn remove_host(&self, id: &HostId) -> Result<(), HostError> {
        let entry = {
            let mut hosts = self.inner.hosts.write().await;
            hosts.remove(id)
        };
        match entry {
            Some(tx) => {
                tx.shutdown().await;
                let _ = self.inner.host_events.send(HostEvent::Removed {
                    host_id: id.clone(),
                });
                Ok(())
            }
            None => Err(HostError::UnknownHost(id.clone())),
        }
    }

    /// Trigger a manual reconnect for `id`. Cancels the current
    /// connection (or pending backoff sleep) and immediately attempts a
    /// fresh connect.
    pub async fn reconnect_host(&self, id: &HostId) -> Result<(), HostError> {
        let tx = self
            .inner
            .hosts
            .read()
            .await
            .get(id)
            .map(|entry| entry.cmd_tx.clone())
            .ok_or_else(|| HostError::UnknownHost(id.clone()))?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(super::runtime::HostCommand::Reconnect { reply: reply_tx })
            .await
            .map_err(|_| HostError::HostShutDown(id.clone()))?;
        reply_rx
            .await
            .map_err(|_| HostError::HostShutDown(id.clone()))?;
        Ok(())
    }

    /// Trigger a manual reconnect on every registered host that is
    /// **not** currently [`HostState::Connected`] or
    /// [`HostState::Connecting`] — i.e. hosts in
    /// [`HostState::Disconnected`], [`HostState::Reconnecting`], or
    /// [`HostState::Failed`]. Hosts already connected (or actively
    /// connecting) are skipped.
    ///
    /// Designed for the mobile scene-phase pattern: when the app
    /// returns from background, call this to wake every host the user
    /// has been away from instead of writing the loop in every
    /// consumer. Useful in particular for [`HostState::Failed`] hosts
    /// whose reconnect policy is exhausted — a manual reconnect
    /// bypasses the policy and starts a fresh attempt.
    ///
    /// Reconnect requests are dispatched concurrently; this method
    /// returns once every targeted supervisor has either acknowledged
    /// its request or failed. Per-host errors are collected into the
    /// returned map; the call itself never errors.
    pub async fn reconnect_all_unavailable(&self) -> HashMap<HostId, HostError> {
        // Snapshot the registry first so the actual reconnect requests
        // run without holding the registry lock.
        let snapshots: Vec<(HostId, Arc<super::types::HostShared>)> = {
            let hosts = self.inner.hosts.read().await;
            let mut out = Vec::with_capacity(hosts.len());
            for (id, entry) in hosts.iter() {
                out.push((id.clone(), entry.shared.clone()));
            }
            out
        };

        let mut targets: Vec<HostId> = Vec::new();
        for (id, shared) in snapshots {
            let state = shared.lock().await.state.clone();
            match state {
                HostState::Connected | HostState::Connecting => continue,
                HostState::Disconnected
                | HostState::Reconnecting { .. }
                | HostState::Failed { .. } => {
                    targets.push(id);
                }
            }
        }

        if targets.is_empty() {
            return HashMap::new();
        }

        // Keep parallel `(HostId, JoinHandle)` pairs so a panicked /
        // cancelled task can still be attributed back to its host
        // instead of being silently swallowed.
        let mut handles: Vec<(HostId, tokio::task::JoinHandle<Result<(), HostError>>)> =
            Vec::with_capacity(targets.len());
        for id in targets {
            let multi = self.clone();
            let task_id = id.clone();
            handles.push((
                id,
                tokio::spawn(async move { multi.reconnect_host(&task_id).await }),
            ));
        }

        let mut errors = HashMap::new();
        for (id, handle) in handles {
            match handle.await {
                Ok(Ok(())) => {}
                Ok(Err(err)) => {
                    errors.insert(id, err);
                }
                Err(join_err) => {
                    // Panicked or cancelled reconnect task — surface it
                    // as `HostShutDown` against the correct host id so
                    // callers don't lose the failure.
                    tracing::error!(
                        host_id = %id,
                        error = ?join_err,
                        "reconnect task failed to join"
                    );
                    errors.insert(id.clone(), HostError::HostShutDown(id));
                }
            }
        }
        errors
    }

    /// Snapshot the current state of `id`.
    ///
    /// Reads from per-host shared state directly; safe to call even if
    /// the host's supervisor is mid-`connect_once` and unable to
    /// process commands.
    pub async fn host(&self, id: &HostId) -> Option<HostHandle> {
        let shared = self
            .inner
            .hosts
            .read()
            .await
            .get(id)
            .map(|e| e.shared.clone())?;
        let snapshot = shared.lock().await.snapshot();
        Some(snapshot)
    }

    /// Snapshot every registered host. Order is unspecified.
    ///
    /// Reads from per-host shared state directly; safe to call even if
    /// some hosts' supervisors are mid-`connect_once`.
    pub async fn hosts(&self) -> Vec<HostHandle> {
        let shareds: Vec<_> = self
            .inner
            .hosts
            .read()
            .await
            .values()
            .map(|e| e.shared.clone())
            .collect();
        let mut out = Vec::with_capacity(shareds.len());
        for shared in shareds {
            out.push(shared.lock().await.snapshot());
        }
        out
    }

    /// Acquire a generation-checked client handle for `id`.
    ///
    /// Returns `None` if the host is not registered or has no live
    /// connection. The returned handle refuses to dispatch through a
    /// connection that has been replaced by a reconnect — request a
    /// fresh handle in that case.
    pub async fn client(&self, id: &HostId) -> Option<HostClientHandle> {
        // Read the current generation + Client clone directly from
        // shared state. No need to round-trip through the supervisor.
        let shared = self
            .inner
            .hosts
            .read()
            .await
            .get(id)
            .map(|e| e.shared.clone())?;
        let state = shared.lock().await;
        let client = state.current_client.clone()?;
        Some(HostClientHandle {
            host_id: id.clone(),
            generation: state.generation,
            client,
            shared: shared.clone(),
        })
    }

    /// Convenience: subscribe to `uri` on `host_id`.
    pub async fn subscribe(
        &self,
        host_id: &HostId,
        uri: String,
    ) -> Result<ahp_types::commands::SubscribeResult, HostError> {
        let entry = self.host_entry(host_id).await?;
        entry.subscribe(uri).await
    }

    /// Convenience: unsubscribe from `uri` on `host_id`.
    pub async fn unsubscribe(&self, host_id: &HostId, uri: String) -> Result<(), HostError> {
        let entry = self.host_entry(host_id).await?;
        entry.unsubscribe(uri).await
    }

    /// Convenience: dispatch `action` on `channel` against `host_id`.
    pub async fn dispatch(
        &self,
        host_id: &HostId,
        channel: ahp_types::common::Uri,
        action: ahp_types::actions::StateAction,
    ) -> Result<crate::DispatchHandle, HostError> {
        let entry = self.host_entry(host_id).await?;
        entry.dispatch(channel, action).await
    }

    /// Subscribe to a fan-in stream of every inbound event from every
    /// registered host. Each call returns a fresh receiver — multiple
    /// consumers can listen independently.
    pub fn events(&self) -> HostSubscriptionStream {
        HostSubscriptionStream {
            rx: self.inner.fan_out.subscribe(),
        }
    }

    /// Subscribe to connection-state events for UX. Each call returns a
    /// fresh receiver.
    pub fn host_events(&self) -> HostEventStream {
        HostEventStream {
            rx: self.inner.host_events.subscribe(),
        }
    }

    /// Aggregated session summaries across every registered host,
    /// sorted by `summary.modified_at` descending. Includes both the
    /// host id and label so consumers can render a unified inbox
    /// without losing host attribution.
    pub async fn aggregated_sessions(&self) -> Vec<HostedSessionSummary> {
        let mut out = Vec::new();
        for handle in self.hosts().await {
            for summary in handle.session_summaries.iter().cloned() {
                out.push(HostedSessionSummary {
                    host_id: handle.id.clone(),
                    host_label: handle.label.clone(),
                    summary,
                });
            }
        }
        // Sort by `modified_at` descending. `sort_by_key` requires a
        // total order on the key, which `Reverse` provides while
        // preserving the insertion order for equal keys.
        out.sort_by_key(|item| std::cmp::Reverse(item.summary.modified_at.clone()));
        out
    }

    /// Aggregated agents across every registered host, in registration
    /// order per host.
    pub async fn aggregated_agents(&self) -> Vec<HostedAgent> {
        let mut out = Vec::new();
        for handle in self.hosts().await {
            for agent in handle.agents.iter().cloned() {
                out.push(HostedAgent {
                    host_id: handle.id.clone(),
                    host_label: handle.label.clone(),
                    agent,
                });
            }
        }
        out
    }

    async fn host_entry(&self, id: &HostId) -> Result<HostHandleTxRef, HostError> {
        self.inner
            .hosts
            .read()
            .await
            .get(id)
            .map(|e| HostHandleTxRef {
                cmd_tx: e.cmd_tx.clone(),
                shared: e.shared.clone(),
            })
            .ok_or_else(|| HostError::UnknownHost(id.clone()))
    }
}

impl Default for MultiHostClient {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for MultiHostClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MultiHostClient").finish_non_exhaustive()
    }
}

/// RAII reservation for a host id in `MultiInner::pending_host_ids`.
///
/// Inserted by [`MultiHostClient::add_host`] just before the
/// `ClientIdStore` await; cleared either explicitly via
/// [`PendingHostGuard::commit`] on success, or synchronously from
/// [`Drop`] on any error / cancellation path. Without this guard, a
/// future cancellation between the reservation and the install path
/// would permanently poison the registry for that host id (all later
/// `add_host` calls would return `DuplicateHost`).
///
/// Cancellation safety relies on `pending_host_ids` being a
/// [`std::sync::Mutex`] (not a tokio mutex), so `Drop` can acquire it
/// synchronously without an await.
struct PendingHostGuard {
    inner: Arc<MultiInner>,
    id: HostId,
    armed: bool,
}

impl PendingHostGuard {
    /// Successfully installed the host — clear the reservation now and
    /// disarm so `Drop` is a no-op.
    fn commit(&mut self) {
        if self.armed {
            self.remove_pending();
            self.armed = false;
        }
    }

    fn remove_pending(&self) {
        // `expect` on the std mutex matches `add_host` itself —
        // poisoning indicates a panic while holding the lock, which is
        // already a hard error.
        let mut pending = self
            .inner
            .pending_host_ids
            .lock()
            .expect("pending_host_ids mutex poisoned");
        pending.remove(&self.id);
    }
}

impl Drop for PendingHostGuard {
    fn drop(&mut self) {
        if self.armed {
            self.remove_pending();
        }
    }
}

/// Handle on a host's command sender that doesn't block the registry
/// `RwLock` while we await on the host's runtime.
struct HostHandleTxRef {
    cmd_tx: tokio::sync::mpsc::Sender<super::runtime::HostCommand>,
    shared: Arc<super::types::HostShared>,
}

impl HostHandleTxRef {
    async fn subscribe(
        &self,
        uri: String,
    ) -> Result<ahp_types::commands::SubscribeResult, HostError> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let host_id = self.host_id().await;
        self.cmd_tx
            .send(super::runtime::HostCommand::Subscribe { uri, reply: tx })
            .await
            .map_err(|_| HostError::HostShutDown(host_id.clone()))?;
        rx.await.map_err(|_| HostError::HostShutDown(host_id))?
    }

    async fn unsubscribe(&self, uri: String) -> Result<(), HostError> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let host_id = self.host_id().await;
        self.cmd_tx
            .send(super::runtime::HostCommand::Unsubscribe { uri, reply: tx })
            .await
            .map_err(|_| HostError::HostShutDown(host_id.clone()))?;
        rx.await.map_err(|_| HostError::HostShutDown(host_id))?
    }

    async fn dispatch(
        &self,
        channel: ahp_types::common::Uri,
        action: ahp_types::actions::StateAction,
    ) -> Result<crate::DispatchHandle, HostError> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let host_id = self.host_id().await;
        self.cmd_tx
            .send(super::runtime::HostCommand::Dispatch {
                channel,
                action: Box::new(action),
                reply: tx,
            })
            .await
            .map_err(|_| HostError::HostShutDown(host_id.clone()))?;
        rx.await.map_err(|_| HostError::HostShutDown(host_id))?
    }

    async fn host_id(&self) -> HostId {
        self.shared.lock().await.id.clone()
    }
}

// Convenience predicates for tests/consumers.
impl HostState {
    /// Convenience: is the host currently connected?
    pub fn is_connected(&self) -> bool {
        matches!(self, HostState::Connected)
    }

    /// Convenience: is the host in a terminal failure state?
    pub fn is_failed(&self) -> bool {
        matches!(self, HostState::Failed { .. })
    }
}
