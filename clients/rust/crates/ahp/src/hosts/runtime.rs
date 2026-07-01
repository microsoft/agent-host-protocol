//! Per-host supervisor task.
//!
//! Owns the current [`Client`], the reconnect state machine, and the
//! per-host root-state mirror plus session-summary cache. Receives
//! commands over an mpsc channel from [`super::MultiHostClient`] and
//! forwards inbound events to the multi-host fan-in broadcasts.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::SystemTime;

use ahp_types::actions::{ActionEnvelope, StateAction};
use ahp_types::commands::{
    ListSessionsParams, ListSessionsResult, ReconnectResult, SubscribeParams, SubscribeResult,
};
use ahp_types::common::{Uri, ROOT_RESOURCE_URI};
use ahp_types::state::{RootState, SessionSummary, SnapshotState};
use tokio::sync::{broadcast, mpsc, oneshot, Notify};
use tokio::task::JoinHandle;

use crate::reducers::{apply_action_to_root, ReduceOutcome};
use crate::{Client, ClientError, ClientEvent, DispatchHandle, SubscriptionEvent};

use super::types::{
    HostConfig, HostError, HostEvent, HostInternal, HostShared, HostState, HostSubscriptionEvent,
};

/// Commands the runtime accepts from the [`MultiHostClient`].
pub(super) enum HostCommand {
    Reconnect {
        reply: oneshot::Sender<()>,
    },
    Subscribe {
        uri: String,
        reply: oneshot::Sender<Result<SubscribeResult, HostError>>,
    },
    Unsubscribe {
        uri: String,
        reply: oneshot::Sender<Result<(), HostError>>,
    },
    Dispatch {
        channel: Uri,
        action: Box<StateAction>,
        reply: oneshot::Sender<Result<DispatchHandle, HostError>>,
    },
}

/// Inbox handle exposed to the multi-host facade.
pub(super) struct HostHandleTx {
    pub(super) cmd_tx: mpsc::Sender<HostCommand>,
    pub(super) shared: Arc<HostShared>,
    pub(super) shutdown_signal: Arc<Notify>,
    pub(super) join: JoinHandle<()>,
}

impl HostHandleTx {
    /// Initiate shutdown.
    ///
    /// Notifies the supervisor (which interrupts in-flight `connect_once`
    /// or backoff sleeps), drops the command channel so the runtime sees
    /// the disconnect, and awaits the join handle.
    ///
    /// Uses [`Notify::notify_one`] (rather than `notify_waiters`) so the
    /// signal queues a permit if the supervisor isn't yet awaiting on
    /// it — this avoids a race where shutdown is called before the
    /// supervisor's first `select!` has registered as a waiter.
    pub(super) async fn shutdown(self) {
        self.shutdown_signal.notify_one();
        drop(self.cmd_tx);
        let _ = self.join.await;
    }
}

/// Spawn a runtime for `config` and return its inbox.
///
/// `resolved_client_id` is the post-resolution `clientId` that the
/// supervisor should send on every `initialize` / `reconnect`. It's
/// resolved on the [`super::MultiHostClient`] side before the spawn so
/// the runtime never has to await on the [`super::ClientIdStore`].
pub(super) fn spawn(
    config: HostConfig,
    resolved_client_id: String,
    fan_out: broadcast::Sender<HostSubscriptionEvent>,
    host_events: broadcast::Sender<HostEvent>,
) -> HostHandleTx {
    let initial = HostInternal {
        id: config.id.clone(),
        label: config.label.clone(),
        client_id: resolved_client_id.clone(),
        state: HostState::Disconnected,
        last_error: None,
        last_connected_at: None,
        protocol_version: None,
        server_seq: 0,
        default_directory: None,
        root_state: RootState {
            agents: vec![],
            active_sessions: None,
            terminals: None,
            config: None,
            meta: None,
        },
        subscriptions: config.initial_subscriptions.clone(),
        completion_trigger_characters: vec![],
        session_summaries: BTreeMap::new(),
        generation: 0,
        current_client: None,
    };
    let shared = HostShared::new(initial);
    let shutdown_signal = Arc::new(Notify::new());

    let (cmd_tx, cmd_rx) = mpsc::channel(32);
    let runtime = HostRuntime {
        client_id: resolved_client_id,
        config,
        cmd_rx,
        shared: shared.clone(),
        fan_out,
        host_events,
        shutdown_signal: shutdown_signal.clone(),
    };
    let join = tokio::spawn(runtime.run());

    HostHandleTx {
        cmd_tx,
        shared,
        shutdown_signal,
        join,
    }
}

struct HostRuntime {
    config: HostConfig,
    client_id: String,
    cmd_rx: mpsc::Receiver<HostCommand>,
    shared: Arc<HostShared>,
    fan_out: broadcast::Sender<HostSubscriptionEvent>,
    host_events: broadcast::Sender<HostEvent>,
    shutdown_signal: Arc<Notify>,
}

enum InnerOutcome {
    /// The connection ended. Reconnect according to policy.
    Disconnected,
    /// A manual reconnect was requested. Reconnect immediately, ignoring
    /// the current backoff schedule.
    ManualReconnect,
    /// A shutdown command was received (or the inbox closed). Tear down.
    Shutdown,
}

impl HostRuntime {
    async fn run(mut self) {
        // Announce the host so consumers can wire up UI before the first connect.
        let _ = self.host_events.send(HostEvent::Added {
            host_id: self.config.id.clone(),
        });

        let mut attempt: u32 = 0;
        loop {
            // Connect attempt.
            attempt = attempt.saturating_add(1);
            if attempt == 1 {
                self.set_state(HostState::Connecting, None).await;
            } else {
                self.set_state(
                    HostState::Reconnecting {
                        attempt: attempt - 1,
                    },
                    None,
                )
                .await;
            }

            // Race the connect attempt with shutdown. A hung transport
            // factory (or a slow handshake) would otherwise block
            // `remove_host` for the request timeout — or indefinitely
            // if the factory never returns.
            let shutdown = self.shutdown_signal.clone();
            let connect = tokio::select! {
                result = self.connect_once() => Some(result),
                _ = shutdown.notified() => None,
            };

            let connect_result = match connect {
                Some(r) => r,
                None => break,
            };

            match connect_result {
                Ok(events) => {
                    if self.config.reconnect_policy.reset_on_success {
                        attempt = 0;
                    }
                    let outcome = self.run_connection(events).await;
                    self.tear_down_client().await;
                    match outcome {
                        InnerOutcome::Shutdown => break,
                        InnerOutcome::ManualReconnect => {
                            // Reset attempt counter for manual reconnect — the
                            // user explicitly asked us to try again now.
                            attempt = 0;
                            continue;
                        }
                        InnerOutcome::Disconnected => {
                            // Fall through to the policy check below.
                        }
                    }
                }
                Err(err) => {
                    let arc_err = Arc::new(err);
                    tracing::warn!(
                        host_id = %self.config.id,
                        attempt,
                        error = %arc_err,
                        "host connect failed"
                    );
                    {
                        let mut state = self.shared.lock().await;
                        state.last_error = Some(arc_err);
                    }
                }
            }

            // Decide whether to retry.
            if self.config.reconnect_policy.attempts_exhausted(attempt) {
                let last_error = self.shared.lock().await.last_error.clone();
                let error = last_error.unwrap_or_else(|| Arc::new(ClientError::Shutdown));
                self.set_state(
                    HostState::Failed {
                        error: error.clone(),
                    },
                    Some(error),
                )
                .await;
                // Stay alive so commands can still inspect state, request manual
                // reconnect, or shutdown the host.
                if !self.wait_for_manual_reconnect_or_shutdown().await {
                    break;
                }
                attempt = 0;
                continue;
            }

            let delay = self
                .config
                .reconnect_policy
                .delay_with_jitter(attempt, jitter_sample());
            if !self.sleep_or_command(delay).await {
                break;
            }
        }
    }

    async fn connect_once(&mut self) -> Result<crate::ClientEventStream, ClientError> {
        let transport = self
            .config
            .transport_factory
            .open_transport(self.config.id.clone())
            .await?;

        let client = Client::connect(transport, self.config.client_config.clone()).await?;

        // Attach the events receiver BEFORE the initialize/reconnect
        // handshake so any notifications the server pushes between the
        // handshake response and the moment we enter `run_connection`
        // are captured rather than dropped.
        let events = client.events();

        // Decide between initialize and reconnect based on prior state.
        let (subscriptions, server_seq_after, init_result, reconnect_result) = {
            let snapshot = self.shared.lock().await;
            let can_reconnect = snapshot.server_seq > 0 && !snapshot.subscriptions.is_empty();
            let subscriptions = snapshot.subscriptions.clone();
            let server_seq = snapshot.server_seq;
            drop(snapshot);

            if can_reconnect {
                match client
                    .reconnect(self.client_id.clone(), server_seq, subscriptions.clone())
                    .await
                {
                    Ok(result) => (subscriptions, server_seq, None, Some(result)),
                    Err(ClientError::Rpc(_)) => {
                        // Server refused reconnect (likely too much state has
                        // elapsed); fall back to initialize.
                        let init = client
                            .initialize(
                                self.client_id.clone(),
                                vec![ahp_types::PROTOCOL_VERSION.to_string()],
                                subscriptions.clone(),
                            )
                            .await?;
                        let new_seq = init.server_seq;
                        (subscriptions, new_seq, Some(init), None)
                    }
                    Err(other) => return Err(other),
                }
            } else {
                let init = client
                    .initialize(
                        self.client_id.clone(),
                        vec![ahp_types::PROTOCOL_VERSION.to_string()],
                        subscriptions.clone(),
                    )
                    .await?;
                let new_seq = init.server_seq;
                (subscriptions, new_seq, Some(init), None)
            }
        };

        // Refresh session summaries from `listSessions` — cheap on first
        // connect, kept in sync by notifications afterward. Failures are
        // non-fatal: we just leave the cache as-is and log.
        let summaries: Result<ListSessionsResult, ClientError> = client
            .request(
                "listSessions",
                ListSessionsParams {
                    channel: ROOT_RESOURCE_URI.to_string(),
                    filter: None,
                },
            )
            .await;

        // Bump generation and install the new client.
        let new_generation = {
            let mut state = self.shared.lock().await;
            state.generation = state.generation.saturating_add(1);
            state.current_client = Some(client.clone());
            state.last_connected_at = Some(SystemTime::now());
            state.last_error = None;
            if state.server_seq < server_seq_after {
                state.server_seq = server_seq_after;
            }
            if let Some(init) = init_result.as_ref() {
                if let Some(snapshot) = init
                    .snapshots
                    .iter()
                    .find(|s| s.resource == ahp_types::ROOT_RESOURCE_URI)
                {
                    if let SnapshotState::Root(root) = &snapshot.state {
                        state.root_state = root.as_ref().clone();
                    }
                }
                state.protocol_version = Some(init.protocol_version.clone());
                state.default_directory = init.default_directory.clone();
                state.completion_trigger_characters = init
                    .completion_trigger_characters
                    .clone()
                    .unwrap_or_default();
            }
            if let Ok(list) = summaries {
                state.session_summaries.clear();
                for summary in list.items {
                    state
                        .session_summaries
                        .insert(summary.resource.clone(), summary);
                }
            }
            state.generation
        };

        // Apply the reconnect response (if this was a reconnect rather
        // than a fresh initialize). Replayed actions must be fanned out
        // through the same path live envelopes take so consumers' state
        // mirrors and aggregated views stay correct; missing
        // subscriptions must be dropped from the cache.
        if let Some(result) = reconnect_result {
            self.apply_reconnect_result(result, &subscriptions).await;
        }

        self.set_state(HostState::Connected, None).await;
        let _ = self.host_events.send(HostEvent::Connected {
            host_id: self.config.id.clone(),
            generation: new_generation,
        });

        let did_reconnect = init_result.is_none();
        tracing::info!(
            host_id = %self.config.id,
            generation = new_generation,
            reconnected = did_reconnect,
            "host connected"
        );
        Ok(events)
    }

    /// Apply the result of a `reconnect` call.
    ///
    /// For [`ReconnectResult::Replay`]: fans the missed action envelopes
    /// through the per-host event tap and the per-host state mirror so
    /// consumers see them in `serverSeq` order, then drops any
    /// `missing` URIs from the local subscription set.
    ///
    /// For [`ReconnectResult::Snapshot`]: refreshes the per-host root
    /// state mirror and records the snapshot's `from_seq` in the
    /// supervisor's `serverSeq`. URIs the server didn't return a
    /// snapshot for are dropped from the local subscription set.
    async fn apply_reconnect_result(
        &self,
        result: ReconnectResult,
        prior_subscriptions: &[String],
    ) {
        match result {
            ReconnectResult::Replay(replay) => {
                for envelope in replay.actions {
                    let channel = envelope.channel.clone();
                    self.apply_action(&envelope).await;
                    let host_event = HostSubscriptionEvent {
                        host_id: self.config.id.clone(),
                        channel: channel.clone(),
                        event: SubscriptionEvent::Action(envelope),
                    };
                    let _ = self.fan_out.send(host_event);
                }
                if !replay.missing.is_empty() {
                    let mut state = self.shared.lock().await;
                    state.subscriptions.retain(|u| !replay.missing.contains(u));
                }
                let _ = prior_subscriptions; // intentionally unused on replay
            }
            ReconnectResult::Snapshot(snap) => {
                let mut state = self.shared.lock().await;
                let mut surviving: Vec<String> = Vec::with_capacity(snap.snapshots.len());
                for snapshot in snap.snapshots {
                    if snapshot.from_seq > state.server_seq {
                        state.server_seq = snapshot.from_seq;
                    }
                    if snapshot.resource == ahp_types::ROOT_RESOURCE_URI {
                        if let SnapshotState::Root(root) = &snapshot.state {
                            state.root_state = root.as_ref().clone();
                        }
                    }
                    surviving.push(snapshot.resource);
                }
                // Drop subscriptions the server didn't return a snapshot
                // for — they're effectively `missing` even though the
                // snapshot arm doesn't carry an explicit list.
                state
                    .subscriptions
                    .retain(|u| surviving.contains(u) || !prior_subscriptions.contains(u));
            }
        }
    }

    async fn run_connection(&mut self, mut events: crate::ClientEventStream) -> InnerOutcome {
        loop {
            tokio::select! {
                _ = self.shutdown_signal.notified() => return InnerOutcome::Shutdown,
                ev = events.recv() => match ev {
                    Some(event) => {
                        self.handle_event(event).await;
                    }
                    None => return InnerOutcome::Disconnected,
                },
                cmd = self.cmd_rx.recv() => match cmd {
                    None => return InnerOutcome::Shutdown,
                    Some(HostCommand::Reconnect { reply }) => {
                        let _ = reply.send(());
                        return InnerOutcome::ManualReconnect;
                    }
                    Some(HostCommand::Subscribe { uri, reply }) => {
                        let result = self.handle_subscribe(uri).await;
                        let _ = reply.send(result);
                    }
                    Some(HostCommand::Unsubscribe { uri, reply }) => {
                        let result = self.handle_unsubscribe(uri).await;
                        let _ = reply.send(result);
                    }
                    Some(HostCommand::Dispatch { channel, action, reply }) => {
                        let result = self.handle_dispatch(channel, *action).await;
                        let _ = reply.send(result);
                    }
                },
            }
        }
    }

    async fn wait_for_manual_reconnect_or_shutdown(&mut self) -> bool {
        loop {
            tokio::select! {
                _ = self.shutdown_signal.notified() => return false,
                cmd = self.cmd_rx.recv() => match cmd {
                    None => return false,
                    Some(HostCommand::Reconnect { reply }) => {
                        let _ = reply.send(());
                        return true;
                    }
                    Some(HostCommand::Subscribe { uri, reply }) => {
                        // Defer to next connect; remember the URI so we resubscribe.
                        {
                            let mut state = self.shared.lock().await;
                            if !state.subscriptions.contains(&uri) {
                                state.subscriptions.push(uri.clone());
                            }
                        }
                        let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                    }
                    Some(HostCommand::Unsubscribe { uri, reply }) => {
                        {
                            let mut state = self.shared.lock().await;
                            state.subscriptions.retain(|u| u != &uri);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    Some(HostCommand::Dispatch { reply, .. }) => {
                        let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                    }
                },
            }
        }
    }

    /// Sleep for `delay`, but exit early on inbound commands or
    /// shutdown. Returns `true` to keep looping, `false` to shut down.
    async fn sleep_or_command(&mut self, delay: std::time::Duration) -> bool {
        if delay.is_zero() {
            return true;
        }
        let sleep = tokio::time::sleep(delay);
        tokio::pin!(sleep);
        loop {
            tokio::select! {
                _ = self.shutdown_signal.notified() => return false,
                _ = &mut sleep => return true,
                cmd = self.cmd_rx.recv() => match cmd {
                    None => return false,
                    Some(HostCommand::Reconnect { reply }) => {
                        let _ = reply.send(());
                        return true;
                    }
                    Some(HostCommand::Subscribe { uri, reply }) => {
                        {
                            let mut state = self.shared.lock().await;
                            if !state.subscriptions.contains(&uri) {
                                state.subscriptions.push(uri.clone());
                            }
                        }
                        let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                    }
                    Some(HostCommand::Unsubscribe { uri, reply }) => {
                        {
                            let mut state = self.shared.lock().await;
                            state.subscriptions.retain(|u| u != &uri);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    Some(HostCommand::Dispatch { reply, .. }) => {
                        let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                    }
                },
            }
        }
    }

    async fn handle_event(&self, event: ClientEvent) {
        // Update internal state mirrors before fanning out so consumers
        // observing the next snapshot see the result of this event.
        match &event.event {
            SubscriptionEvent::Action(envelope) => {
                self.apply_action(envelope).await;
            }
            SubscriptionEvent::SessionAdded(n) => {
                let mut state = self.shared.lock().await;
                state
                    .session_summaries
                    .insert(n.summary.resource.clone(), n.summary.clone());
            }
            SubscriptionEvent::SessionRemoved(n) => {
                let mut state = self.shared.lock().await;
                state.session_summaries.remove(&n.session);
            }
            SubscriptionEvent::SessionSummaryChanged(n) => {
                let mut state = self.shared.lock().await;
                if let Some(existing) = state.session_summaries.get_mut(&n.session) {
                    apply_summary_changes(existing, &n.changes);
                }
            }
            SubscriptionEvent::AuthRequired(_) => {
                // No cache update; consumers observe via the event stream.
            }
        }

        let host_event = HostSubscriptionEvent {
            host_id: self.config.id.clone(),
            channel: event.channel,
            event: event.event,
        };
        let _ = self.fan_out.send(host_event);
    }

    async fn apply_action(&self, envelope: &ActionEnvelope) {
        let mut state = self.shared.lock().await;
        let envelope_seq = super::types::server_seq_from_envelope(envelope);
        if envelope_seq > state.server_seq {
            state.server_seq = envelope_seq;
        }
        // Best-effort root state mirror update; for non-root actions this
        // is a no-op (the reducer reports OutOfScope).
        if matches!(
            apply_action_to_root(&mut state.root_state, &envelope.action),
            ReduceOutcome::OutOfScope
        ) {
            // Not a root action; leave root state untouched. Per-session
            // and per-terminal state mirrors are intentionally not
            // duplicated here — consumers that need them can subscribe
            // to the per-resource event stream and run the reducers
            // themselves.
        }
    }

    async fn handle_subscribe(&self, uri: String) -> Result<SubscribeResult, HostError> {
        let client = self
            .shared
            .lock()
            .await
            .current_client
            .clone()
            .ok_or_else(|| HostError::HostShutDown(self.config.id.clone()))?;
        let result: SubscribeResult = client
            .request(
                "subscribe",
                SubscribeParams {
                    channel: uri.clone(),
                    delivery: None,
                },
            )
            .await
            .map_err(HostError::Client)?;
        // Track subscription so reconnect can replay it.
        {
            let mut state = self.shared.lock().await;
            if !state.subscriptions.contains(&uri) {
                state.subscriptions.push(uri.clone());
            }
        }
        // Make sure local broadcasts exist so per-URI listeners don't miss events.
        let _ = client.attach_subscription(&uri).await;
        Ok(result)
    }

    async fn handle_unsubscribe(&self, uri: String) -> Result<(), HostError> {
        let client_opt = { self.shared.lock().await.current_client.clone() };
        if let Some(client) = client_opt {
            client
                .unsubscribe(uri.clone())
                .await
                .map_err(HostError::Client)?;
        }
        let mut state = self.shared.lock().await;
        state.subscriptions.retain(|u| u != &uri);
        Ok(())
    }

    async fn handle_dispatch(
        &self,
        channel: Uri,
        action: StateAction,
    ) -> Result<DispatchHandle, HostError> {
        let client = self
            .shared
            .lock()
            .await
            .current_client
            .clone()
            .ok_or_else(|| HostError::HostShutDown(self.config.id.clone()))?;
        client
            .dispatch(channel, action)
            .await
            .map_err(HostError::Client)
    }

    async fn tear_down_client(&self) {
        let prev = {
            let mut state = self.shared.lock().await;
            state.current_client.take()
        };
        if let Some(client) = prev {
            client.shutdown().await;
        }
    }

    async fn set_state(&self, state: HostState, last_error: Option<Arc<ClientError>>) {
        {
            let mut s = self.shared.lock().await;
            s.state = state.clone();
            if last_error.is_some() {
                s.last_error = last_error.clone();
            }
        }
        let _ = self.host_events.send(HostEvent::StateChanged {
            host_id: self.config.id.clone(),
            state,
            last_error,
        });
    }
}

/// Apply a [`ahp_types::notifications::PartialSessionSummary`] in place.
fn apply_summary_changes(
    existing: &mut SessionSummary,
    changes: &ahp_types::notifications::PartialSessionSummary,
) {
    if let Some(v) = &changes.provider {
        existing.provider = v.clone();
    }
    if let Some(v) = &changes.title {
        existing.title = v.clone();
    }
    if let Some(v) = changes.status {
        existing.status = v;
    }
    if let Some(v) = &changes.activity {
        existing.activity = Some(v.clone());
    }
    if let Some(v) = &changes.modified_at {
        existing.modified_at = v.clone();
    }
    if let Some(v) = &changes.created_at {
        existing.created_at = v.clone();
    }
    if let Some(v) = &changes.project {
        existing.project = Some(v.clone());
    }
    if let Some(v) = &changes.working_directory {
        existing.working_directory = Some(v.clone());
    }
    if let Some(v) = &changes.annotations {
        existing.annotations = Some(v.clone());
    }
    if let Some(v) = &changes.changes {
        existing.changes = Some(v.clone());
    }
}

// ─── Random helpers (no external dep on `rand`) ─────────────────────────────

fn jitter_sample() -> f64 {
    // Hash of an instant + a counter is enough: the consumer can supply
    // their own RNG by overriding `ReconnectPolicy`. Using SipHash on
    // a small input keeps us free of crate-level RNG dependencies.
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut hasher = DefaultHasher::new();
    n.hash(&mut hasher);
    SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .hash(&mut hasher);
    let raw = hasher.finish();
    // Map 64 random bits into [0.0, 1.0).
    (raw as f64) / (u64::MAX as f64)
}
