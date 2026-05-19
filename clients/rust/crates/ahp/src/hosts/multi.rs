//! `MultiHostClient` facade.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{broadcast, RwLock};

use super::runtime::{spawn, HostHandleTx};
use super::types::{
    HostClientHandle, HostConfig, HostError, HostEvent, HostEventStream, HostHandle, HostId,
    HostState, HostSubscriptionEvent, HostSubscriptionStream, HostedAgent, HostedSessionSummary,
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
#[derive(Clone)]
pub struct MultiHostClient {
    inner: Arc<MultiInner>,
}

struct MultiInner {
    hosts: RwLock<HashMap<HostId, HostHandleTx>>,
    fan_out: broadcast::Sender<HostSubscriptionEvent>,
    host_events: broadcast::Sender<HostEvent>,
}

impl MultiHostClient {
    /// Build an empty multi-host client.
    pub fn new() -> Self {
        let (fan_out, _) = broadcast::channel(DEFAULT_EVENT_BUFFER);
        let (host_events, _) = broadcast::channel(DEFAULT_EVENT_BUFFER);
        Self {
            inner: Arc::new(MultiInner {
                hosts: RwLock::new(HashMap::new()),
                fan_out,
                host_events,
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
    /// This call is non-blocking with respect to the host's own
    /// supervisor: the snapshot is read directly from per-host shared
    /// state, never via the supervisor's command channel. A slow or
    /// hung transport factory therefore cannot block other registry
    /// operations.
    ///
    /// Returns [`HostError::DuplicateHost`] if the host id is already in
    /// use; remove the existing host first.
    pub async fn add_host(&self, config: HostConfig) -> Result<HostHandle, HostError> {
        let id = config.id.clone();
        let shared = {
            // Reserve the id atomically — release the write lock before
            // awaiting anything so a slow connect path can't block other
            // registry operations behind us.
            let mut hosts = self.inner.hosts.write().await;
            if hosts.contains_key(&id) {
                return Err(HostError::DuplicateHost(id));
            }
            let tx = spawn(
                config,
                self.inner.fan_out.clone(),
                self.inner.host_events.clone(),
            );
            let shared = tx.shared.clone();
            hosts.insert(id, tx);
            shared
        };
        // Snapshot directly from per-host shared state. Doing this via
        // the supervisor's command channel would block here when the
        // supervisor is busy in `connect_once` (e.g. a hung transport
        // factory) — see Copilot review on #121 for the bug this avoids.
        let snapshot = shared.lock().await.snapshot();
        Ok(snapshot)
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
        out.sort_by_key(|item| std::cmp::Reverse(item.summary.modified_at));
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
