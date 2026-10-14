#![allow(clippy::panic, clippy::unwrap_used)]

//! Integration tests for the multi-host SDK (`ahp::hosts`).
//!
//! Uses an in-memory transport pair (mirroring `client_roundtrip.rs`)
//! so the runtime can drive a real `Client` end-to-end without any
//! networking. Each test spins up one or more "fake hosts" — small
//! tasks that respond to `initialize`, `listSessions`, and the
//! occasional `subscribe`, then optionally close their side of the
//! socket to force a reconnect.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use ahp::hosts::{
    ClientIdStore, FileClientIdStore, HostConfig, HostError, HostEvent, HostId, HostState,
    InMemoryClientIdStore, MultiHostClient, ReconnectPolicy,
};
use ahp::transport::BoxedTransport;
use ahp::{Transport, TransportError, TransportMessage};
use ahp_types::commands::AutomationCapabilities;
use ahp_types::messages::{
    JsonRpcMessage, JsonRpcNotification, JsonRpcRequest, JsonRpcSuccessResponse, JsonRpcVersion,
};
use ahp_types::state::AgentInfo;
use tokio::sync::{mpsc, Mutex};

// ─── In-memory transport ────────────────────────────────────────────────────

struct MemTransport {
    tx: mpsc::Sender<TransportMessage>,
    rx: mpsc::Receiver<TransportMessage>,
}

fn pair() -> (MemTransport, MemTransport) {
    let (a_tx, b_rx) = mpsc::channel(64);
    let (b_tx, a_rx) = mpsc::channel(64);
    (
        MemTransport { tx: a_tx, rx: a_rx },
        MemTransport { tx: b_tx, rx: b_rx },
    )
}

impl Transport for MemTransport {
    async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError> {
        self.tx.send(msg).await.map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        Ok(self.rx.recv().await)
    }
}

// ─── Fake host ──────────────────────────────────────────────────────────────

/// Pluggable per-channel-cursor reconnect responder, overriding the
/// default empty-replay-per-channel behaviour. Mirrors the TypeScript
/// harness's `handleReconnect` callback.
type ReconnectResponder =
    Arc<dyn Fn(&ahp_types::commands::ReconnectParams) -> ahp_types::commands::ReconnectResult + Send + Sync>;

#[derive(Clone)]
struct FakeHostState {
    /// Sequential serverSeq counter shared across reconnects on this host.
    server_seq: Arc<AtomicU32>,
    /// Optional list of agents to publish in the initial RootState snapshot.
    agents: Vec<AgentInfo>,
    /// Optional list of session summaries to return from `listSessions`.
    sessions: Vec<ahp_types::state::SessionSummary>,
    /// Automation support to advertise in `InitializeResult`.
    automations: Option<AutomationCapabilities>,
    /// Optional override for the `reconnect` response; see
    /// [`ReconnectResponder`]. Defaults to an empty `Replay` per
    /// requested channel when unset.
    handle_reconnect: Option<ReconnectResponder>,
    /// Every `reconnect` request's params, in order, recorded across
    /// every connection cloned from this state (shared via `Arc`).
    reconnect_requests: Arc<std::sync::Mutex<Vec<ahp_types::commands::ReconnectParams>>>,
    /// Snapshot to return from `subscribe` for a given channel, if any.
    subscribe_snapshots:
        Arc<std::sync::Mutex<std::collections::HashMap<String, ahp_types::state::Snapshot>>>,
}

impl FakeHostState {
    fn new() -> Self {
        Self {
            server_seq: Arc::new(AtomicU32::new(0)),
            agents: vec![],
            sessions: vec![],
            automations: None,
            handle_reconnect: None,
            reconnect_requests: Arc::new(std::sync::Mutex::new(Vec::new())),
            subscribe_snapshots: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        }
    }

    fn with_agents(mut self, agents: Vec<AgentInfo>) -> Self {
        self.agents = agents;
        self
    }

    fn with_sessions(mut self, sessions: Vec<ahp_types::state::SessionSummary>) -> Self {
        self.sessions = sessions;
        self
    }

    fn with_automations(mut self, automations: AutomationCapabilities) -> Self {
        self.automations = Some(automations);
        self
    }

    fn with_handle_reconnect(mut self, handler: ReconnectResponder) -> Self {
        self.handle_reconnect = Some(handler);
        self
    }

    fn reconnect_requests(&self) -> Vec<ahp_types::commands::ReconnectParams> {
        self.reconnect_requests.lock().unwrap().clone()
    }
}

/// Drive a single connection on the server side until the client closes.
async fn drive_fake_host_basic(mut transport: MemTransport, state: FakeHostState) {
    loop {
        let frame = match transport.recv().await {
            Ok(Some(f)) => f,
            _ => return,
        };
        let msg = match frame.into_parsed() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if let JsonRpcMessage::Request(req) = msg {
            let result = handle_request(&req, &state);
            let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id: req.id,
                result: ahp_types::common::AnyValue::from(result),
            });
            if transport
                .send(TransportMessage::encode(&resp).unwrap())
                .await
                .is_err()
            {
                return;
            }
        }
    }
}

/// Like `drive_fake_host_basic`, but also injects a `root/sessionAdded`
/// notification once `initialize` completes. Returns when the client
/// closes the transport.
async fn drive_fake_host_with_injection(
    mut transport: MemTransport,
    state: FakeHostState,
    inject_after_init: Arc<Mutex<Option<ahp_types::state::SessionSummary>>>,
) {
    loop {
        let frame = match transport.recv().await {
            Ok(Some(f)) => f,
            _ => return,
        };
        let msg = match frame.into_parsed() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if let JsonRpcMessage::Request(req) = msg {
            let was_init = matches!(req.method.as_str(), "initialize" | "reconnect");
            let result = handle_request(&req, &state);
            let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id: req.id,
                result: ahp_types::common::AnyValue::from(result),
            });
            if transport
                .send(TransportMessage::encode(&resp).unwrap())
                .await
                .is_err()
            {
                return;
            }
            if was_init {
                let summary = inject_after_init.lock().await.take();
                if let Some(summary) = summary {
                    // Tiny delay so the client has consumed the prior
                    // listSessions response before the notification arrives.
                    tokio::time::sleep(Duration::from_millis(20)).await;
                    let payload = serde_json::json!({
                        "channel": ahp_types::ROOT_RESOURCE_URI,
                        "summary": summary,
                    });
                    let notif = JsonRpcMessage::Notification(JsonRpcNotification {
                        jsonrpc: JsonRpcVersion::V2,
                        method: "root/sessionAdded".into(),
                        params: Some(ahp_types::common::AnyValue::from(payload)),
                    });
                    if transport
                        .send(TransportMessage::encode(&notif).unwrap())
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }
        }
    }
}

fn handle_request(req: &JsonRpcRequest, state: &FakeHostState) -> serde_json::Value {
    match req.method.as_str() {
        "initialize" => {
            let seq = state.server_seq.load(Ordering::SeqCst);
            let snapshot = serde_json::json!({
                "resource": ahp_types::ROOT_RESOURCE_URI,
                "state": {
                    "type": "Root",
                    "agents": state.agents,
                    "activeSessions": state.sessions.len() as i64,
                },
                "fromSeq": seq,
            });
            serde_json::json!({
                "protocolVersion": ahp_types::PROTOCOL_VERSION,
                "serverSeq": seq,
                "snapshots": [snapshot],
                "automations": state.automations,
            })
        }
        "reconnect" => {
            let params: ahp_types::commands::ReconnectParams = req
                .params
                .clone()
                .and_then(|p| serde_json::from_value(p).ok())
                .expect("reconnect request must carry ReconnectParams");
            state.reconnect_requests.lock().unwrap().push(params.clone());
            let result = match &state.handle_reconnect {
                Some(handler) => handler(&params),
                // Default: reply with an empty replay for every
                // requested channel so the supervisor moves on.
                None => ahp_types::commands::ReconnectResult {
                    channels: params
                        .subscriptions
                        .iter()
                        .map(|sub| {
                            ahp_types::commands::ChannelRecovery::Replay(
                                ahp_types::commands::ChannelReplayRecovery {
                                    channel: sub.channel.clone(),
                                    actions: vec![],
                                },
                            )
                        })
                        .collect(),
                },
            };
            serde_json::to_value(result).unwrap()
        }
        "listSessions" => serde_json::json!({ "items": state.sessions }),
        "subscribe" => {
            let resource = req
                .params
                .as_ref()
                .and_then(|p| p.as_object())
                .and_then(|m| m.get("channel"))
                .and_then(|v| v.as_str())
                .unwrap_or(ahp_types::ROOT_RESOURCE_URI)
                .to_string();
            if let Some(snapshot) = state.subscribe_snapshots.lock().unwrap().get(&resource) {
                return serde_json::json!({ "snapshot": snapshot });
            }
            let seq = state.server_seq.load(Ordering::SeqCst);
            serde_json::json!({
                "snapshot": {
                    "resource": resource,
                    "state": {
                        "type": "Root",
                        "agents": state.agents,
                    },
                    "fromSeq": seq
                }
            })
        }
        _ => serde_json::json!({}),
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[tokio::test]
async fn single_constructor_yields_connected_handle() {
    let agent = AgentInfo {
        provider: "copilot".into(),
        display_name: "Copilot".into(),
        description: "demo".into(),
        models: vec![],
        protected_resources: None,
        customizations: None,
        capabilities: None,
    };
    let state = FakeHostState::new().with_agents(vec![agent.clone()]);
    let factory = make_basic_factory(state);

    let config = HostConfig::new("local", "Local", factory);
    let (multi, _initial) = MultiHostClient::single(config).await.expect("single");

    let id = HostId::new("local");
    wait_for_state(&multi, &id, |s| s.is_connected(), 2000).await;

    let snap = multi.host(&id).await.expect("host present");
    assert!(snap.state.is_connected());
    assert_eq!(snap.label, "Local");
    assert_eq!(snap.agents, vec![agent]);
    assert_eq!(
        snap.protocol_version.as_deref(),
        Some(ahp_types::PROTOCOL_VERSION)
    );
    assert!(snap.last_connected_at.is_some());
}

#[tokio::test]
async fn two_hosts_register_and_connect_independently() {
    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "a",
            "A",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();
    multi
        .add_host(HostConfig::new(
            "b",
            "B",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("a"), |s| s.is_connected(), 2000).await;
    wait_for_state(&multi, &HostId::new("b"), |s| s.is_connected(), 2000).await;

    let hosts = multi.hosts().await;
    assert_eq!(hosts.len(), 2);
    assert!(hosts.iter().all(|h| h.state.is_connected()));
    let labels: Vec<_> = hosts.iter().map(|h| h.label.clone()).collect();
    assert!(labels.contains(&"A".to_string()));
    assert!(labels.contains(&"B".to_string()));
}

#[tokio::test]
async fn aggregated_sessions_track_listsessions_then_notification() {
    let initial_summary = make_summary("copilot:/s1", "Initial title", 1_000);
    let added_summary = make_summary("copilot:/s2", "Added later", 2_000);

    let state = FakeHostState::new().with_sessions(vec![initial_summary]);
    let injected = Arc::new(Mutex::new(Some(added_summary)));
    let factory = make_injecting_factory(state, injected);

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new("local", "Local", factory))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("local"), |s| s.is_connected(), 2000).await;

    wait_until(2000, || async {
        multi.aggregated_sessions().await.len() == 2
    })
    .await;
    let aggregated = multi.aggregated_sessions().await;
    let titles: Vec<_> = aggregated.iter().map(|h| h.summary.title.clone()).collect();
    assert_eq!(
        titles,
        vec!["Added later".to_string(), "Initial title".to_string()]
    );
    assert!(aggregated.iter().all(|h| h.host_id == HostId::new("local")));
    assert!(aggregated.iter().all(|h| h.host_label == "Local"));
}

#[tokio::test]
async fn host_client_handle_invalidates_after_reconnect() {
    let factory = make_basic_factory(FakeHostState::new());

    let multi = MultiHostClient::new();
    multi
        .add_host(
            HostConfig::new("local", "Local", factory)
                .with_reconnect_policy(ReconnectPolicy::immediate_forever()),
        )
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("local"), |s| s.is_connected(), 2000).await;

    let handle = multi
        .client(&HostId::new("local"))
        .await
        .expect("client handle");
    let initial_generation = handle.generation();

    multi
        .reconnect_host(&HostId::new("local"))
        .await
        .expect("reconnect");
    wait_until(2000, || async {
        multi
            .host(&HostId::new("local"))
            .await
            .map(|h| h.generation > initial_generation && h.state.is_connected())
            .unwrap_or(false)
    })
    .await;

    let err = handle
        .check_alive()
        .await
        .expect_err("expected HostReconnected");
    match err {
        HostError::HostReconnected {
            handle_generation,
            current_generation,
            ..
        } => {
            assert_eq!(handle_generation, initial_generation);
            assert!(current_generation > initial_generation);
        }
        other => panic!("unexpected error: {other:?}"),
    }

    let fresh = multi
        .client(&HostId::new("local"))
        .await
        .expect("fresh client handle");
    assert!(fresh.generation() > initial_generation);
    fresh.check_alive().await.expect("fresh handle alive");
}

#[tokio::test]
async fn automation_capabilities_are_exposed_and_survive_reconnect() {
    let automations = AutomationCapabilities {
        create: None,
        schedules: None,
        run_cancellation: None,
        run_history_limit: Some(25),
        customizations: None,
    };
    let drop_after_init = Arc::new(AtomicBool::new(false));
    let return_replay = Arc::new(Mutex::new(true));
    let state = FakeHostState::new().with_automations(automations.clone());
    let multi = MultiHostClient::new();
    multi
        .add_host(
            HostConfig::new(
                "local",
                "Local",
                make_replay_factory(state, drop_after_init, return_replay),
            )
            .with_reconnect_policy(ReconnectPolicy::immediate_forever()),
        )
        .await
        .unwrap();

    let host_id = HostId::new("local");
    wait_for_state(&multi, &host_id, |s| s.is_connected(), 2000).await;
    let before = multi.host(&host_id).await.expect("host");
    assert_eq!(before.automations, Some(automations.clone()));

    multi.reconnect_host(&host_id).await.expect("reconnect");
    wait_until(2000, || async {
        multi
            .host(&host_id)
            .await
            .map(|host| host.generation > before.generation && host.state.is_connected())
            .unwrap_or(false)
    })
    .await;

    let after = multi.host(&host_id).await.expect("host");
    assert_eq!(after.automations, Some(automations));
}

#[tokio::test]
async fn remove_host_terminates_supervisor_and_emits_event() {
    let factory = make_basic_factory(FakeHostState::new());

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new("temp", "Temporary", factory))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("temp"), |s| s.is_connected(), 2000).await;

    let mut events = multi.host_events();

    multi
        .remove_host(&HostId::new("temp"))
        .await
        .expect("remove");

    let mut saw_removed = false;
    let deadline = tokio::time::Instant::now() + Duration::from_millis(1000);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(100), events.recv()).await {
            Ok(Some(HostEvent::Removed { host_id })) if host_id == HostId::new("temp") => {
                saw_removed = true;
                break;
            }
            Ok(Some(_)) => continue,
            _ => break,
        }
    }
    assert!(saw_removed, "expected HostEvent::Removed");

    assert!(multi.host(&HostId::new("temp")).await.is_none());
}

#[tokio::test]
async fn fan_in_events_carry_host_id_and_resource() {
    let summary = make_summary("copilot:/s1", "first", 100);

    let state_a = FakeHostState::new().with_sessions(vec![summary.clone()]);
    let state_b = FakeHostState::new().with_sessions(vec![summary.clone()]);
    let inject_a = Arc::new(Mutex::new(Some(make_summary(
        "copilot:/added-a",
        "a-side",
        200,
    ))));
    let inject_b = Arc::new(Mutex::new(Some(make_summary(
        "copilot:/added-b",
        "b-side",
        300,
    ))));

    // Subscribe BEFORE adding hosts so the broadcast captures every
    // event from the very first connect.
    let multi = MultiHostClient::new();
    let mut events = multi.events();

    multi
        .add_host(HostConfig::new(
            "a",
            "Host A",
            make_injecting_factory(state_a, inject_a),
        ))
        .await
        .unwrap();
    multi
        .add_host(HostConfig::new(
            "b",
            "Host B",
            make_injecting_factory(state_b, inject_b),
        ))
        .await
        .unwrap();

    let mut hosts_seen: std::collections::HashSet<HostId> = std::collections::HashSet::new();
    let deadline = tokio::time::Instant::now() + Duration::from_millis(2500);
    while tokio::time::Instant::now() < deadline && hosts_seen.len() < 2 {
        match tokio::time::timeout(Duration::from_millis(500), events.recv()).await {
            Ok(Some(event)) => {
                hosts_seen.insert(event.host_id.clone());
                // The injected sessionAdded is a root-channel notification.
                assert_eq!(event.channel, ahp_types::ROOT_RESOURCE_URI);
            }
            _ => break,
        }
    }
    assert!(
        hosts_seen.contains(&HostId::new("a")),
        "missing event from host A; saw {hosts_seen:?}"
    );
    assert!(
        hosts_seen.contains(&HostId::new("b")),
        "missing event from host B; saw {hosts_seen:?}"
    );
}

#[tokio::test]
async fn transport_factory_is_called_for_each_reconnect() {
    let connect_count = Arc::new(AtomicU32::new(0));
    let count_clone = connect_count.clone();
    let state = FakeHostState::new();

    let factory = move |_host_id: HostId| {
        let count = count_clone.clone();
        let state = state.clone();
        Box::pin(async move {
            count.fetch_add(1, Ordering::SeqCst);
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_basic(server_side, state));
            Ok(BoxedTransport::new(client_side))
        })
            as std::pin::Pin<
                Box<
                    dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send,
                >,
            >
    };

    let multi = MultiHostClient::new();
    multi
        .add_host(
            HostConfig::new("local", "Local", factory)
                .with_reconnect_policy(ReconnectPolicy::immediate_forever()),
        )
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("local"), |s| s.is_connected(), 2000).await;
    assert_eq!(connect_count.load(Ordering::SeqCst), 1);

    multi
        .reconnect_host(&HostId::new("local"))
        .await
        .expect("reconnect");
    wait_until(2000, || async {
        connect_count.load(Ordering::SeqCst) >= 2
            && multi
                .host(&HostId::new("local"))
                .await
                .map(|h| h.state.is_connected())
                .unwrap_or(false)
    })
    .await;
    assert_eq!(connect_count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn duplicate_host_id_is_rejected_with_typed_error() {
    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "dup",
            "first",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();

    let err = multi
        .add_host(HostConfig::new(
            "dup",
            "second",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .expect_err("expected duplicate-id rejection");
    match err {
        HostError::DuplicateHost(id) => assert_eq!(id, HostId::new("dup")),
        other => panic!("expected DuplicateHost, got {other:?}"),
    }
}

#[tokio::test]
async fn reconnect_replay_actions_are_fanned_out_with_advanced_seq() {
    use ahp_types::actions::{RootActiveSessionsChangedAction, StateAction};

    // Force a reconnect handshake by pre-seeding a non-zero serverSeq +
    // subscription set, then make the second connect return a Replay
    // arm carrying a single root-state action.
    let drop_after_init = Arc::new(AtomicBool::new(false));
    let return_replay = Arc::new(Mutex::new(false));
    let state = FakeHostState::new();

    let multi = MultiHostClient::new();
    let mut events = multi.events();

    multi
        .add_host(HostConfig::new(
            "h",
            "Host",
            make_replay_factory(state, drop_after_init.clone(), return_replay.clone()),
        ))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("h"), |s| s.is_connected(), 2000).await;

    // Drain the live events from the first connect so the replay
    // assertions below aren't polluted.
    drain_events(&mut events, Duration::from_millis(150)).await;

    // Now flip the next-connect to use Replay, force a manual reconnect.
    *return_replay.lock().await = true;
    drop_after_init.store(true, Ordering::SeqCst);
    multi
        .reconnect_host(&HostId::new("h"))
        .await
        .expect("reconnect");

    // Expect to see the replayed action through the fan-in stream.
    let mut saw_replayed_action = false;
    let deadline = tokio::time::Instant::now() + Duration::from_millis(2500);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(500), events.recv()).await {
            Ok(Some(event)) => {
                if let ahp::SubscriptionEvent::Action(env) = event.event {
                    if matches!(
                        env.action,
                        StateAction::RootActiveSessionsChanged(RootActiveSessionsChangedAction {
                            active_sessions: 7
                        })
                    ) {
                        assert_eq!(event.host_id, HostId::new("h"));
                        assert_eq!(event.channel, ahp_types::ROOT_RESOURCE_URI);
                        saw_replayed_action = true;
                        break;
                    }
                }
            }
            _ => break,
        }
    }
    assert!(
        saw_replayed_action,
        "expected the replayed RootActiveSessionsChanged action to fan out via events()"
    );

    // server_seq should have advanced past the replay envelope.
    let snap = multi.host(&HostId::new("h")).await.expect("host");
    assert!(
        snap.server_seq >= 42,
        "expected server_seq advanced past replay (got {})",
        snap.server_seq
    );
}

#[tokio::test]
async fn client_events_recv_returns_none_after_transport_close() {
    use ahp::{Client, ClientConfig};

    // Build a Client over an in-memory transport, attach an events
    // receiver, then drop the server side so the transport closes.
    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");
    let mut events = client.events();

    // Server task: ack initialize, then close.
    tokio::spawn(async move {
        if let Ok(Some(frame)) = server_side.recv().await {
            if let Ok(JsonRpcMessage::Request(req)) = frame.into_parsed() {
                let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                    jsonrpc: JsonRpcVersion::V2,
                    id: req.id,
                    result: ahp_types::common::AnyValue::from(serde_json::json!({
                        "protocolVersion": ahp_types::PROTOCOL_VERSION,
                        "serverSeq": 0,
                        "snapshots": []
                    })),
                });
                let _ = server_side
                    .send(TransportMessage::encode(&resp).unwrap())
                    .await;
            }
        }
        // Drop server_side to close the transport from the server side.
        drop(server_side);
    });

    let _ = client
        .initialize(
            "test".into(),
            vec![ahp_types::PROTOCOL_VERSION.to_string()],
            vec![],
        )
        .await
        .expect("init");

    // events.recv() should resolve to None once the transport closes
    // and `drive_transport` runs teardown — without the all_events
    // sender being explicitly dropped, this would hang forever.
    let next = tokio::time::timeout(Duration::from_secs(2), events.recv()).await;
    assert!(matches!(next, Ok(None)), "expected None, got {next:?}");
}

#[tokio::test]
async fn shutdown_is_not_blocked_by_a_hung_transport_factory() {
    // Factory that never returns — simulates a hung token refresh / DNS
    // lookup / TLS handshake. Without the shutdown signal racing
    // `connect_once`, `remove_host` would block forever (or until the
    // request timeout, whichever came first).
    let factory = |_host_id: HostId| -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send>,
    > {
        Box::pin(async move {
            // Sleep effectively forever.
            tokio::time::sleep(Duration::from_secs(3600)).await;
            Err::<BoxedTransport, TransportError>(TransportError::Closed)
        })
    };

    let multi = MultiHostClient::new();
    let _ = multi
        .add_host(HostConfig::new("hung", "Hung", factory))
        .await;

    // Give the runtime a beat to enter `connect_once`.
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Remove must complete promptly. Bound to a generous timeout so a
    // regression of this fix would surface as a clear test failure
    // rather than a CI hang.
    let removed = tokio::time::timeout(
        Duration::from_secs(2),
        multi.remove_host(&HostId::new("hung")),
    )
    .await;
    assert!(
        matches!(removed, Ok(Ok(()))),
        "remove_host should not block on a hung connect; got {removed:?}"
    );
}

// ─── reconnect_all_unavailable / ClientIdStore tests ───────────────────────

/// Reconnects every non-`Connected`/`Connecting` host: skips a host that
/// is already connected and wakes one that has been pushed into `Failed`
/// by `ReconnectPolicy::disabled` + a one-shot transport.
#[tokio::test]
async fn reconnect_all_unavailable_skips_connected_and_wakes_failed() {
    let alive_state = FakeHostState::new();
    let alive_factory = make_basic_factory(alive_state);

    // Factory whose first connect fails (so the host with
    // `disabled` reconnect policy lands in `Failed`), and whose
    // second connect succeeds. Lets us assert that
    // `reconnect_all_unavailable` actually drives it from `Failed`
    // back to `Connected`.
    let dead_state = FakeHostState::new();
    let dead_state = Arc::new(dead_state);
    let attempt = Arc::new(AtomicU32::new(0));
    let dead_factory = {
        let attempt = attempt.clone();
        let dead_state = dead_state.clone();
        move |_host_id: HostId| {
            let attempt = attempt.clone();
            let dead_state = dead_state.clone();
            Box::pin(async move {
                let n = attempt.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    // First attempt: fail before returning a transport so
                    // the host with disabled-reconnect policy lands in
                    // `Failed`.
                    Err::<BoxedTransport, TransportError>(TransportError::Closed)
                } else {
                    let (client_side, server_side) = pair();
                    tokio::spawn(drive_fake_host_basic(server_side, (*dead_state).clone()));
                    Ok(BoxedTransport::new(client_side))
                }
            })
                as std::pin::Pin<
                    Box<
                        dyn std::future::Future<Output = Result<BoxedTransport, TransportError>>
                            + Send,
                    >,
                >
        }
    };

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new("alive", "Alive", alive_factory))
        .await
        .unwrap();
    multi
        .add_host(
            HostConfig::new("dead", "Dead", dead_factory)
                .with_reconnect_policy(ReconnectPolicy::disabled()),
        )
        .await
        .unwrap();

    // Wait for both terminal states.
    wait_for_state(&multi, &HostId::new("alive"), |s| s.is_connected(), 2000).await;
    wait_for_state(&multi, &HostId::new("dead"), |s| s.is_failed(), 2000).await;

    let errors = multi.reconnect_all_unavailable().await;
    assert!(
        errors.is_empty(),
        "expected no per-host errors from reconnect_all_unavailable, got {errors:?}"
    );

    // The dead host should now be moving back through the connect
    // path. We don't pin down the exact intermediate state, but it
    // must end up `Connected` shortly.
    wait_for_state(&multi, &HostId::new("dead"), |s| s.is_connected(), 2000).await;
    // The alive host must stay connected — it was already connected,
    // so `reconnect_all_unavailable` should have skipped it.
    let alive = multi.host(&HostId::new("alive")).await.unwrap();
    assert!(alive.state.is_connected());
}

/// `reconnect_all_unavailable` is a no-op when there are no hosts in
/// an "unavailable" state — and never panics on an empty registry.
#[tokio::test]
async fn reconnect_all_unavailable_is_a_noop_with_no_hosts() {
    let multi = MultiHostClient::new();
    let errors = multi.reconnect_all_unavailable().await;
    assert!(errors.is_empty());
}

#[tokio::test]
async fn explicit_client_id_wins_over_store_and_is_persisted() {
    // Pre-seed the store with one value for `alpha`, then add a host
    // whose `HostConfig::with_client_id` supplies a different value.
    // Explicit values win, AND the explicit value is persisted to the
    // store so subsequent launches that don't pass an explicit value
    // pick it up.
    let store = Arc::new(InMemoryClientIdStore::new());
    store
        .store(HostId::new("alpha"), "from-store".into())
        .await
        .unwrap();

    let multi = MultiHostClient::with_client_id_store(store.clone());
    multi
        .add_host(
            HostConfig::new("alpha", "Alpha", make_basic_factory(FakeHostState::new()))
                .with_client_id("from-explicit"),
        )
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("alpha"), |s| s.is_connected(), 2000).await;
    let snap = multi.host(&HostId::new("alpha")).await.unwrap();
    assert_eq!(snap.client_id, "from-explicit");
    assert_eq!(
        store.load(HostId::new("alpha")).await.unwrap().as_deref(),
        Some("from-explicit"),
        "explicit value should be persisted back to the store"
    );
}

#[tokio::test]
async fn stored_client_id_is_reused_when_no_explicit_value_is_set() {
    let store = Arc::new(InMemoryClientIdStore::new());
    store
        .store(HostId::new("alpha"), "stored-id".into())
        .await
        .unwrap();

    let multi = MultiHostClient::with_client_id_store(store);
    multi
        .add_host(HostConfig::new(
            "alpha",
            "Alpha",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("alpha"), |s| s.is_connected(), 2000).await;
    let snap = multi.host(&HostId::new("alpha")).await.unwrap();
    assert_eq!(snap.client_id, "stored-id");
}

#[tokio::test]
async fn missing_store_entry_generates_and_persists_fresh_id() {
    let store = Arc::new(InMemoryClientIdStore::new());
    let multi = MultiHostClient::with_client_id_store(store.clone());
    multi
        .add_host(HostConfig::new(
            "alpha",
            "Alpha",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("alpha"), |s| s.is_connected(), 2000).await;
    let snap = multi.host(&HostId::new("alpha")).await.unwrap();
    assert!(!snap.client_id.is_empty());
    assert_eq!(
        store.load(HostId::new("alpha")).await.unwrap().as_deref(),
        Some(snap.client_id.as_str()),
        "generated id should be persisted to the store"
    );
}

#[tokio::test]
async fn file_client_id_store_round_trips_through_multi_host() {
    // End-to-end smoke test: write through one `MultiHostClient`, read
    // through a fresh `MultiHostClient` (sharing the same on-disk
    // store) and confirm the same `client_id` comes back out.
    let dir = std::env::temp_dir().join(format!(
        "ahp-hosts-file-store-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let store: Arc<dyn ClientIdStore> = Arc::new(FileClientIdStore::new(&dir));

    let first = MultiHostClient::with_client_id_store(store.clone());
    first
        .add_host(HostConfig::new(
            "alpha",
            "Alpha",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();
    wait_for_state(&first, &HostId::new("alpha"), |s| s.is_connected(), 2000).await;
    let first_id = first.host(&HostId::new("alpha")).await.unwrap().client_id;
    first.remove_host(&HostId::new("alpha")).await.unwrap();

    let second = MultiHostClient::with_client_id_store(store);
    second
        .add_host(HostConfig::new(
            "alpha",
            "Alpha",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();
    wait_for_state(&second, &HostId::new("alpha"), |s| s.is_connected(), 2000).await;
    let second_id = second.host(&HostId::new("alpha")).await.unwrap().client_id;
    assert_eq!(
        first_id, second_id,
        "FileClientIdStore should persist across MultiHostClient instances"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// Cancelling an `add_host` future while it's awaiting the
/// `ClientIdStore` must release the pending-id reservation so a
/// subsequent `add_host` for the same id can succeed. Without the
/// `PendingHostGuard` RAII drop, the reservation would persist forever
/// and every later `add_host(id)` would return `DuplicateHost`.
#[tokio::test]
async fn add_host_cancellation_releases_pending_reservation() {
    use std::time::Duration;

    /// A store whose `load`/`store` block for a long time so we can
    /// reliably cancel the surrounding `add_host` future while it's
    /// stuck in `resolve_client_id`.
    struct SlowStore;
    impl ClientIdStore for SlowStore {
        fn load(
            &self,
            _host_id: HostId,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = std::io::Result<Option<String>>> + Send + '_>,
        > {
            Box::pin(async {
                // Long enough that `tokio::time::timeout` is guaranteed
                // to elapse before this resolves.
                tokio::time::sleep(Duration::from_secs(60)).await;
                Ok(None)
            })
        }
        fn store(
            &self,
            _host_id: HostId,
            _client_id: String,
        ) -> std::pin::Pin<Box<dyn std::future::Future<Output = std::io::Result<()>> + Send + '_>>
        {
            Box::pin(async { Ok(()) })
        }
    }

    let multi = MultiHostClient::with_client_id_store(Arc::new(SlowStore));

    // First add_host: cancel it via `tokio::time::timeout` while it
    // sits inside `SlowStore::load`. The reservation must be cleared
    // on drop.
    let cancelled = tokio::time::timeout(
        Duration::from_millis(150),
        multi.add_host(HostConfig::new(
            "x",
            "X",
            make_basic_factory(FakeHostState::new()),
        )),
    )
    .await;
    assert!(
        cancelled.is_err(),
        "expected the first add_host to be cancelled by the timeout"
    );

    // Second add_host with a real (fast) store would now permanently
    // see `DuplicateHost` if the pending reservation hadn't been
    // released. Use a fresh `MultiHostClient` with a fast store but
    // share nothing else with the cancelled one — verifies the local
    // reservation cleanup, not the slow store specifically.
    let fast = MultiHostClient::new();
    let result = fast
        .add_host(HostConfig::new(
            "x",
            "X",
            make_basic_factory(FakeHostState::new()),
        ))
        .await;
    assert!(
        result.is_ok(),
        "second add_host on a fresh client should succeed: {result:?}"
    );

    // Stronger end-to-end check: on the original `multi` (with the
    // SlowStore), the cancelled reservation should also be cleared.
    // Swap in a fast store via a second `with_client_id_store` won't
    // work (the existing `multi` is locked to `SlowStore`), so instead
    // verify by inspecting that another timeout-bounded `add_host`
    // doesn't return `DuplicateHost` — it should be cancelled by the
    // timeout (proving it reached `SlowStore::load`), not rejected at
    // the duplicate check.
    let retried = tokio::time::timeout(
        Duration::from_millis(150),
        multi.add_host(HostConfig::new(
            "x",
            "X",
            make_basic_factory(FakeHostState::new()),
        )),
    )
    .await;
    assert!(
        retried.is_err(),
        "expected the retry to reach SlowStore::load and time out, not return DuplicateHost"
    );
}

// ─── Per-channel reconnect cursor regression tests ─────────────────────────
//
// These four tests prove the actual bug fix: a single connection-wide
// reconnect watermark would let a fast channel's progress silently
// skip a slower channel's undelivered actions on reconnect. Per-channel
// cursors must keep every subscribed channel's replay checkpoint
// completely independent.

#[tokio::test]
async fn reconnect_sends_independent_per_channel_cursors_a_fast_channel_never_advances_a_slower_one()
{
    let a = "ahp-canvas:/a".to_string();
    let b = "ahp-canvas:/b".to_string();
    let state = FakeHostState::new();

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "divergent",
            "divergent",
            make_action_injecting_factory(state.clone(), b.clone(), 101),
        ))
        .await
        .unwrap();
    let id = HostId::new("divergent");
    wait_for_state(&multi, &id, |s| s.is_connected(), 2000).await;

    multi.subscribe(&id, a.clone()).await.unwrap();
    multi.subscribe(&id, b.clone()).await.unwrap();

    // B races ahead to serverSeq=101 via the injected notification
    // while A never receives anything. A single connection-wide
    // watermark would send `lastSeenServerSeq: 101` for every channel
    // on the next reconnect and silently skip any of A's undelivered
    // actions below that value; per-channel cursors must keep A at its
    // own baseline instead.
    wait_until(2000, || async {
        multi.host(&id).await.map(|h| h.server_seq).unwrap_or(0) >= 101
    })
    .await;

    multi.reconnect_host(&id).await.unwrap();
    wait_until(2000, || async { state.reconnect_requests().len() >= 1 }).await;

    let req = state.reconnect_requests().into_iter().next().unwrap();
    let cursor_for = |ch: &str| {
        req.subscriptions
            .iter()
            .find(|s| s.channel == ch)
            .map(|s| s.last_seen_server_seq)
    };
    assert_eq!(cursor_for(&b), Some(101), "B's cursor should reflect its own progress");
    assert_eq!(
        cursor_for(&a),
        Some(0),
        "A's cursor must stay at its own baseline — never advanced by B"
    );

}

#[tokio::test]
async fn channel_replay_recovery_advances_only_that_channels_cursor() {
    let a = "ahp-canvas:/a".to_string();
    let b = "ahp-canvas:/b".to_string();

    let a_for_handler = a.clone();
    let state = FakeHostState::new().with_handle_reconnect(Arc::new(move |params| {
        let channels = params
            .subscriptions
            .iter()
            .map(|sub| {
                if sub.channel == a_for_handler {
                    ahp_types::commands::ChannelRecovery::Replay(
                        ahp_types::commands::ChannelReplayRecovery {
                            channel: sub.channel.clone(),
                            actions: vec![
                                make_canvas_envelope(&sub.channel, 10),
                                make_canvas_envelope(&sub.channel, 11),
                            ],
                        },
                    )
                } else {
                    ahp_types::commands::ChannelRecovery::Replay(
                        ahp_types::commands::ChannelReplayRecovery {
                            channel: sub.channel.clone(),
                            actions: vec![],
                        },
                    )
                }
            })
            .collect();
        ahp_types::commands::ReconnectResult { channels }
    }));

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "replay",
            "replay",
            make_basic_factory(state.clone()),
        ))
        .await
        .unwrap();
    let id = HostId::new("replay");
    wait_for_state(&multi, &id, |s| s.is_connected(), 2000).await;

    multi.subscribe(&id, a.clone()).await.unwrap();
    multi.subscribe(&id, b.clone()).await.unwrap();

    multi.reconnect_host(&id).await.unwrap();
    wait_until(2000, || async { state.reconnect_requests().len() >= 1 }).await;

    // The *next* reconnect after the replay must report A's advanced
    // cursor (11) while B — which had an empty replay — stays at 0.
    multi.reconnect_host(&id).await.unwrap();
    wait_until(2000, || async { state.reconnect_requests().len() >= 2 }).await;

    let reqs = state.reconnect_requests();
    let req = reqs.last().unwrap();
    let cursor_for = |ch: &str| {
        req.subscriptions
            .iter()
            .find(|s| s.channel == ch)
            .map(|s| s.last_seen_server_seq)
    };
    assert_eq!(cursor_for(&a), Some(11), "A's cursor should reflect the exhausted replay");
    assert_eq!(cursor_for(&b), Some(0), "B's cursor must be untouched by A's replay");

}

#[tokio::test]
async fn channel_snapshot_recovery_sets_that_channels_cursor_from_the_snapshot_from_seq_baseline() {
    let a = "ahp-canvas:/a".to_string();

    let state = FakeHostState::new().with_handle_reconnect(Arc::new(|params| {
        let channels = params
            .subscriptions
            .iter()
            .map(|sub| {
                ahp_types::commands::ChannelRecovery::Snapshot(
                    ahp_types::commands::ChannelSnapshotRecovery {
                        channel: sub.channel.clone(),
                        snapshot: ahp_types::state::Snapshot {
                            resource: sub.channel.clone(),
                            state: ahp_types::state::SnapshotState::Canvas(Box::new(
                                make_canvas_state(&sub.channel),
                            )),
                            from_seq: 50,
                        },
                    },
                )
            })
            .collect();
        ahp_types::commands::ReconnectResult { channels }
    }));

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "snap",
            "snap",
            make_basic_factory(state.clone()),
        ))
        .await
        .unwrap();
    let id = HostId::new("snap");
    wait_for_state(&multi, &id, |s| s.is_connected(), 2000).await;

    multi.subscribe(&id, a.clone()).await.unwrap();

    multi.reconnect_host(&id).await.unwrap();
    wait_until(2000, || async { state.reconnect_requests().len() >= 1 }).await;
    multi.reconnect_host(&id).await.unwrap();
    wait_until(2000, || async { state.reconnect_requests().len() >= 2 }).await;

    let reqs = state.reconnect_requests();
    let req = reqs.last().unwrap();
    assert_eq!(
        req.subscriptions
            .iter()
            .find(|s| s.channel == a)
            .map(|s| s.last_seen_server_seq),
        Some(50)
    );

}

#[tokio::test]
async fn a_channel_reported_missing_on_reconnect_is_dropped_from_subscriptions_and_not_re_requested()
{
    let a = "ahp-canvas:/a".to_string();
    let gone = "ahp-canvas:/gone".to_string();

    let gone_for_handler = gone.clone();
    let state = FakeHostState::new().with_handle_reconnect(Arc::new(move |params| {
        let channels = params
            .subscriptions
            .iter()
            .map(|sub| {
                if sub.channel == gone_for_handler {
                    ahp_types::commands::ChannelRecovery::Missing(
                        ahp_types::commands::ChannelMissingRecovery {
                            channel: sub.channel.clone(),
                        },
                    )
                } else {
                    ahp_types::commands::ChannelRecovery::Replay(
                        ahp_types::commands::ChannelReplayRecovery {
                            channel: sub.channel.clone(),
                            actions: vec![],
                        },
                    )
                }
            })
            .collect();
        ahp_types::commands::ReconnectResult { channels }
    }));

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "missing",
            "missing",
            make_basic_factory(state.clone()),
        ))
        .await
        .unwrap();
    let id = HostId::new("missing");
    wait_for_state(&multi, &id, |s| s.is_connected(), 2000).await;

    multi.subscribe(&id, a.clone()).await.unwrap();
    multi.subscribe(&id, gone.clone()).await.unwrap();

    multi.reconnect_host(&id).await.unwrap();
    wait_until(2000, || async { state.reconnect_requests().len() >= 1 }).await;
    wait_until(2000, || async {
        !multi
            .host(&id)
            .await
            .map(|h| h.subscriptions.contains(&gone))
            .unwrap_or(true)
    })
    .await;
    assert!(
        multi
            .host(&id)
            .await
            .unwrap()
            .subscriptions
            .contains(&a),
        "A should remain subscribed"
    );

    multi.reconnect_host(&id).await.unwrap();
    wait_until(2000, || async { state.reconnect_requests().len() >= 2 }).await;
    let reqs = state.reconnect_requests();
    let req = reqs.last().unwrap();
    assert!(
        !req.subscriptions.iter().any(|s| s.channel == gone),
        "missing channel must not be re-requested"
    );

}

fn make_canvas_state(instance_id: &str) -> ahp_types::state::CanvasState {
    ahp_types::state::CanvasState {
        instance_id: instance_id.to_string(),
        extension_id: "fake".into(),
        extension_name: None,
        canvas_id: "fake-canvas".into(),
        title: None,
        status: None,
        url: None,
    }
}

fn make_canvas_envelope(channel: &str, server_seq: u64) -> ahp_types::actions::ActionEnvelope {
    ahp_types::actions::ActionEnvelope {
        channel: channel.to_string(),
        action: ahp_types::actions::StateAction::CanvasStateChanged(
            ahp_types::actions::CanvasStateChangedAction {
                canvas: make_canvas_state(channel),
            },
        ),
        server_seq,
        origin: None,
        rejection_reason: None,
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn make_summary(uri: &str, title: &str, modified_at: i64) -> ahp_types::state::SessionSummary {
    let secs = modified_at / 1000;
    let ms = modified_at % 1000;
    let modified = format!(
        "1970-01-01T{:02}:{:02}:{:02}.{:03}Z",
        secs / 3600,
        (secs % 3600) / 60,
        secs % 60,
        ms
    );
    ahp_types::state::SessionSummary {
        resource: uri.into(),
        provider: "copilot".into(),
        title: title.into(),
        status: 0,
        activity: None,
        origin: None,
        created_at: "1970-01-01T00:00:00.000Z".into(),
        modified_at: modified,
        project: None,
        working_directories: None,
        changes: None,
        annotations: None,
        meta: None,
        chats: None,
        default_chat: None,
    }
}

fn make_basic_factory(
    state: FakeHostState,
) -> impl Fn(
    HostId,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send>,
> + Send
       + Sync
       + 'static {
    let state = Arc::new(state);
    move |_host_id| {
        let state = state.clone();
        Box::pin(async move {
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_basic(server_side, (*state).clone()));
            Ok(BoxedTransport::new(client_side))
        })
    }
}

fn make_injecting_factory(
    state: FakeHostState,
    inject: Arc<Mutex<Option<ahp_types::state::SessionSummary>>>,
) -> impl Fn(
    HostId,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send>,
> + Send
       + Sync
       + 'static {
    let state = Arc::new(state);
    move |_host_id| {
        let state = state.clone();
        let inject = inject.clone();
        Box::pin(async move {
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_with_injection(
                server_side,
                (*state).clone(),
                inject,
            ));
            Ok(BoxedTransport::new(client_side))
        })
    }
}

/// Factory used by the divergent-per-channel-cursor regression test.
/// Drives a basic fake host, then — shortly after the first
/// `initialize`/`reconnect` response — fans in a single raw `action`
/// notification for `channel` at `server_seq`. The short delay gives
/// the test time to finish its `subscribe` round trips before the
/// notification races in, mirroring the channel-B-races-ahead scenario
/// the per-channel cursor fix is meant to cover.
fn make_action_injecting_factory(
    state: FakeHostState,
    channel: String,
    server_seq: u64,
) -> impl Fn(
    HostId,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send>,
> + Send
       + Sync
       + 'static {
    let state = Arc::new(state);
    move |_host_id| {
        let state = state.clone();
        let channel = channel.clone();
        Box::pin(async move {
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_with_action_injection(
                server_side,
                (*state).clone(),
                channel,
                server_seq,
            ));
            Ok(BoxedTransport::new(client_side))
        })
    }
}

async fn drive_fake_host_with_action_injection(
    mut transport: MemTransport,
    state: FakeHostState,
    channel: String,
    server_seq: u64,
) {
    let mut injection_ran = false;
    loop {
        let frame = match transport.recv().await {
            Ok(Some(f)) => f,
            _ => return,
        };
        let msg = match frame.into_parsed() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if let JsonRpcMessage::Request(req) = msg {
            let was_init = matches!(req.method.as_str(), "initialize" | "reconnect");
            let result = handle_request(&req, &state);
            let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id: req.id,
                result: ahp_types::common::AnyValue::from(result),
            });
            if transport
                .send(TransportMessage::encode(&resp).unwrap())
                .await
                .is_err()
            {
                return;
            }
            if !injection_ran && was_init {
                injection_ran = true;
                tokio::time::sleep(Duration::from_millis(30)).await;
                let payload = serde_json::json!({
                    "channel": channel,
                    "action": {
                        "type": "canvas/stateChanged",
                        "canvas": {
                            "instanceId": "a",
                            "extensionId": "fake",
                            "canvasId": "fake-canvas",
                        },
                    },
                    "serverSeq": server_seq,
                    "origin": null,
                });
                let notif = JsonRpcMessage::Notification(JsonRpcNotification {
                    jsonrpc: JsonRpcVersion::V2,
                    method: "action".into(),
                    params: Some(ahp_types::common::AnyValue::from(payload)),
                });
                if transport
                    .send(TransportMessage::encode(&notif).unwrap())
                    .await
                    .is_err()
                {
                    return;
                }
            }
        }
    }
}

/// Factory used by the reconnect-replay test. The first connect responds
/// to `initialize` normally with a non-zero `serverSeq` and a single
/// subscription so the next connect chooses the `reconnect` arm. When
/// `drop_after_init` is set, the server drops its side of the
/// connection right after the handshake to force the runtime into a
/// reconnect cycle. When `return_replay` is set, that reconnect's
/// response carries a single `RootActiveSessionsChanged` action.
fn make_replay_factory(
    state: FakeHostState,
    drop_after_init: Arc<AtomicBool>,
    return_replay: Arc<Mutex<bool>>,
) -> impl Fn(
    HostId,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send>,
> + Send
       + Sync
       + 'static {
    let state = Arc::new(state);
    state.server_seq.store(40, Ordering::SeqCst);
    move |_host_id| {
        let state = state.clone();
        let drop_after_init = drop_after_init.clone();
        let return_replay = return_replay.clone();
        Box::pin(async move {
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_replay(
                server_side,
                (*state).clone(),
                drop_after_init,
                return_replay,
            ));
            Ok(BoxedTransport::new(client_side))
        })
    }
}

async fn drive_fake_host_replay(
    mut transport: MemTransport,
    state: FakeHostState,
    drop_after_init: Arc<AtomicBool>,
    return_replay: Arc<Mutex<bool>>,
) {
    loop {
        let frame = match transport.recv().await {
            Ok(Some(f)) => f,
            _ => return,
        };
        let msg = match frame.into_parsed() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if let JsonRpcMessage::Request(req) = msg {
            let result = if req.method == "reconnect" && *return_replay.lock().await {
                // Replay arm with a single RootActiveSessionsChanged
                // action carrying serverSeq=42 (advances past the
                // pre-seeded 40).
                serde_json::json!({
                    "channels": [
                        {
                            "kind": "replay",
                            "channel": ahp_types::ROOT_RESOURCE_URI,
                            "actions": [
                                {
                                    "channel": ahp_types::ROOT_RESOURCE_URI,
                                    "action": {
                                        "type": "root/activeSessionsChanged",
                                        "activeSessions": 7
                                    },
                                    "serverSeq": 42,
                                    "origin": null,
                                }
                            ]
                        }
                    ]
                })
            } else {
                handle_request(&req, &state)
            };
            let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id: req.id,
                result: ahp_types::common::AnyValue::from(result),
            });
            if transport
                .send(TransportMessage::encode(&resp).unwrap())
                .await
                .is_err()
            {
                return;
            }

            if (req.method == "initialize" || req.method == "reconnect")
                && drop_after_init.swap(false, Ordering::SeqCst)
            {
                // Close the transport from the server side so the
                // client supervisor sees a disconnect and reconnects.
                drop(transport);
                return;
            }
        }
    }
}

async fn drain_events(events: &mut ahp::hosts::HostSubscriptionStream, window: Duration) {
    let deadline = tokio::time::Instant::now() + window;
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(20), events.recv()).await {
            Ok(Some(_)) => continue,
            _ => break,
        }
    }
}

async fn wait_for_state(
    multi: &MultiHostClient,
    id: &HostId,
    pred: impl Fn(&HostState) -> bool,
    timeout_ms: u64,
) {
    wait_until(timeout_ms, || async {
        multi
            .host(id)
            .await
            .map(|h| pred(&h.state))
            .unwrap_or(false)
    })
    .await;
}

async fn wait_until<F, Fut>(timeout_ms: u64, mut cond: F)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
    while tokio::time::Instant::now() < deadline {
        if cond().await {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("condition did not become true within {timeout_ms} ms");
}
