#![allow(clippy::panic, clippy::unwrap_used)]

use std::collections::VecDeque;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use ahp::hosts::{HostConfig, HostEvent, HostId, MultiHostClient, ReconnectPolicy};
use ahp::{
    BoxedTransport, Client, ClientConfig, ClientError, KeepaliveConfig, Transport, TransportError,
    TransportMessage,
};
use ahp_types::messages::{
    JsonRpcMessage, JsonRpcNotification, JsonRpcRequest, JsonRpcSuccessResponse, JsonRpcVersion,
};
use serde_json::{json, Value};
use tokio::sync::{mpsc, Mutex};

struct MemTransport {
    tx: mpsc::Sender<TransportMessage>,
    rx: mpsc::Receiver<TransportMessage>,
}

struct Peer {
    tx: mpsc::Sender<TransportMessage>,
    rx: mpsc::Receiver<TransportMessage>,
}

fn pair() -> (MemTransport, Peer) {
    let (to_peer, rx) = mpsc::channel(16);
    let (tx, from_peer) = mpsc::channel(16);
    (
        MemTransport {
            tx: to_peer,
            rx: from_peer,
        },
        Peer { tx, rx },
    )
}

impl Transport for MemTransport {
    async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
        self.tx
            .send(message)
            .await
            .map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        Ok(self.rx.recv().await)
    }
}

async fn bounded<T>(future: impl Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(2), future)
        .await
        .expect("fixture timed out")
}

async fn settle() {
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
}

impl Peer {
    async fn request(&mut self) -> JsonRpcRequest {
        let JsonRpcMessage::Request(request) = bounded(self.rx.recv())
            .await
            .expect("driver closed")
            .into_parsed()
            .unwrap()
        else {
            panic!("expected request")
        };
        request
    }

    async fn reply(&self, id: u64, result: Value) {
        self.tx
            .send(TransportMessage::Parsed(JsonRpcMessage::SuccessResponse(
                JsonRpcSuccessResponse {
                    jsonrpc: JsonRpcVersion::V2,
                    id,
                    result,
                },
            )))
            .await
            .unwrap();
    }

    async fn notify(&self, method: &str, params: Value) {
        self.tx
            .send(TransportMessage::Parsed(JsonRpcMessage::Notification(
                JsonRpcNotification {
                    jsonrpc: JsonRpcVersion::V2,
                    method: method.into(),
                    params: Some(params),
                },
            )))
            .await
            .unwrap();
    }
}

fn config(keepalive: bool) -> ClientConfig {
    ClientConfig {
        default_request_timeout: None,
        keepalive: keepalive.then_some(KeepaliveConfig {
            idle_interval: Duration::from_secs(10),
            liveness_timeout: Duration::from_secs(30),
        }),
        ..ClientConfig::default()
    }
}

#[tokio::test(start_paused = true)]
async fn idle_ping_uses_normal_ids_and_continued_silence_closes_connection() {
    let (transport, mut peer) = pair();
    let client = Client::connect(BoxedTransport::new(transport), config(true))
        .await
        .unwrap();
    let mut events = client.events();
    let request = client.request::<_, Value>("ordinary", ());
    tokio::pin!(request);
    let ordinary = tokio::select! {
        result = &mut request => panic!("premature result: {result:?}"),
        request = peer.request() => request,
    };
    tokio::time::advance(Duration::from_secs(9)).await;
    settle().await;
    assert!(peer.rx.try_recv().is_err());
    tokio::time::advance(Duration::from_secs(1)).await;
    let ping = peer.request().await;
    assert_eq!(ping.method, "ping");
    assert_eq!(ping.id, ordinary.id + 1);
    assert_eq!(ping.params.unwrap()["channel"], "ahp-root://");
    tokio::time::advance(Duration::from_secs(19)).await;
    settle().await;
    assert!(peer.rx.try_recv().is_err(), "at most one unanswered ping");
    tokio::time::advance(Duration::from_secs(1)).await;
    assert!(bounded(peer.rx.recv()).await.is_none());
    assert!(bounded(events.recv()).await.is_none());
    assert!(matches!(bounded(request).await, Err(ClientError::Rpc(error)) if error.code == -32000));
}

#[tokio::test(start_paused = true)]
async fn inbound_wire_traffic_suppresses_pings_and_retires_unanswered_ping() {
    let (transport, mut peer) = pair();
    let client = Client::connect(transport, config(true)).await.unwrap();
    for _ in 0..5 {
        tokio::time::advance(Duration::from_secs(9)).await;
        peer.notify("activity", json!({})).await;
        settle().await;
        assert!(peer.rx.try_recv().is_err());
    }

    tokio::time::advance(Duration::from_secs(10)).await;
    let first = peer.request().await;
    assert_eq!(first.method, "ping");
    peer.notify("activity", json!({})).await;
    settle().await;
    tokio::time::advance(Duration::from_secs(10)).await;
    let second = peer.request().await;
    assert_eq!(second.id, first.id + 1);
    peer.reply(first.id, Value::Null).await;
    peer.reply(second.id, Value::Null).await;
    settle().await;
    tokio::time::advance(Duration::from_secs(9)).await;
    settle().await;
    assert!(peer.rx.try_recv().is_err());
    client.shutdown().await;
    assert!(bounded(peer.rx.recv()).await.is_none());
}

#[tokio::test]
async fn continuously_ready_inbound_traffic_does_not_starve_outbound_requests() {
    struct BusyTransport {
        sent: mpsc::UnboundedSender<TransportMessage>,
    }
    impl Transport for BusyTransport {
        async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
            self.sent.send(message).map_err(|_| TransportError::Closed)
        }
        async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
            tokio::task::consume_budget().await;
            Ok(Some(TransportMessage::Text(
                r#"{"jsonrpc":"2.0","method":"activity"}"#.into(),
            )))
        }
    }
    let (sent, mut rx) = mpsc::unbounded_channel();
    let client = Client::connect(BusyTransport { sent }, config(true))
        .await
        .unwrap();
    client.notify("outbound", ()).await.unwrap();
    let message = bounded(rx.recv()).await.unwrap().into_parsed().unwrap();
    assert!(
        matches!(message, JsonRpcMessage::Notification(message) if message.method == "outbound")
    );
    client.shutdown().await;
    assert!(bounded(rx.recv()).await.is_none());
}

#[tokio::test(start_paused = true)]
async fn outbound_traffic_does_not_prove_inbound_liveness_and_keepalive_can_be_disabled() {
    for enabled in [false, true] {
        let (transport, mut peer) = pair();
        let client = Client::connect(transport, config(enabled)).await.unwrap();
        for _ in 0..3 {
            client.notify("outbound", ()).await.unwrap();
            assert!(bounded(peer.rx.recv()).await.is_some());
            tokio::time::advance(Duration::from_secs(9)).await;
            settle().await;
            if enabled && !peer.rx.is_empty() {
                assert_eq!(peer.request().await.method, "ping");
            }
        }
        tokio::time::advance(Duration::from_secs(3)).await;
        settle().await;
        if enabled {
            assert!(bounded(peer.rx.recv()).await.is_none());
        } else {
            assert!(peer.rx.try_recv().is_err());
            client.shutdown().await;
            assert!(bounded(peer.rx.recv()).await.is_none());
        }
    }
}

#[tokio::test]
async fn invalid_keepalive_policy_is_rejected_before_transport_io() {
    for policy in [
        KeepaliveConfig {
            idle_interval: Duration::ZERO,
            liveness_timeout: Duration::from_secs(1),
        },
        KeepaliveConfig {
            idle_interval: Duration::from_secs(1),
            liveness_timeout: Duration::from_secs(1),
        },
        KeepaliveConfig {
            idle_interval: Duration::from_secs(2),
            liveness_timeout: Duration::from_secs(1),
        },
        KeepaliveConfig {
            idle_interval: Duration::from_secs(1),
            liveness_timeout: Duration::MAX,
        },
    ] {
        let (transport, mut peer) = pair();
        let result = Client::connect(
            transport,
            ClientConfig {
                keepalive: Some(policy),
                ..config(false)
            },
        )
        .await;
        assert!(matches!(
            result,
            Err(ClientError::Transport(TransportError::Protocol(_)))
        ));
        assert!(peer.rx.recv().await.is_none());
    }
}

async fn add_host(
    multi: &MultiHostClient,
    transports: Vec<Result<MemTransport, TransportError>>,
    keepalive: bool,
) {
    let transports = Arc::new(Mutex::new(VecDeque::from(transports)));
    let config = HostConfig::new("host", "Host", move |_| {
        let transports = transports.clone();
        async move {
            transports
                .lock()
                .await
                .pop_front()
                .unwrap()
                .map(BoxedTransport::new)
        }
    })
    .with_client_config(config(keepalive))
    .with_reconnect_policy(ReconnectPolicy::immediate_forever());
    multi.add_host(config).await.unwrap();
}

async fn handshake(peer: &mut Peer, reconnect: bool) -> JsonRpcRequest {
    let request = peer.request().await;
    assert_eq!(
        request.method,
        if reconnect { "reconnect" } else { "initialize" }
    );
    peer.reply(request.id, if reconnect {
        json!({"type": "replay", "actions": [], "missing": []})
    } else {
        json!({"protocolVersion": ahp_types::PROTOCOL_VERSION, "serverSeq": 10, "snapshots": []})
    }).await;
    request
}

async fn connected(events: &mut ahp::hosts::HostEventStream) {
    loop {
        if matches!(
            bounded(events.recv()).await,
            Some(HostEvent::Connected { .. })
        ) {
            break;
        }
    }
}

fn summary(uri: &str, title: &str) -> Value {
    json!({"resource": uri, "provider": "test", "title": title, "status": 0,
        "createdAt": "1970-01-01T00:00:00Z", "modifiedAt": "1970-01-01T00:00:00Z"})
}

#[tokio::test(start_paused = true)]
async fn handshake_publishes_client_and_keepalive_works_while_discovery_is_pending() {
    let (transport, mut peer) = pair();
    let multi = MultiHostClient::new();
    let mut events = multi.host_events();
    add_host(&multi, vec![Ok(transport)], true).await;
    handshake(&mut peer, false).await;
    connected(&mut events).await;
    let discovery = peer.request().await;
    assert_eq!(discovery.method, "listSessions");
    let handle = multi
        .client(&HostId::new("host"))
        .await
        .expect("ready before discovery");
    assert!(multi
        .host(&HostId::new("host"))
        .await
        .unwrap()
        .state
        .is_connected());
    let ordinary = handle.request::<_, Value>("ordinary", ());
    tokio::pin!(ordinary);
    let request = tokio::select! {
        result = &mut ordinary => panic!("premature result: {result:?}"),
        request = peer.request() => request,
    };
    peer.reply(request.id, json!("usable")).await;
    assert_eq!(bounded(ordinary).await.unwrap(), json!("usable"));
    tokio::time::advance(Duration::from_secs(10)).await;
    let ping = peer.request().await;
    assert_eq!(ping.method, "ping");
    assert_ne!(ping.id, discovery.id);
    peer.reply(ping.id, Value::Null).await;
    settle().await;
    bounded(multi.remove_host(&HostId::new("host")))
        .await
        .unwrap();
    assert!(bounded(peer.rx.recv()).await.is_none());
}

#[tokio::test]
async fn delayed_discovery_preserves_queued_additions_changes_and_removals() {
    let (transport, mut peer) = pair();
    let multi = MultiHostClient::new();
    let mut events = multi.events();
    let mut hosts = multi.host_events();
    add_host(&multi, vec![Ok(transport)], false).await;
    let init = peer.request().await;
    // Notifications before the handshake completes must already be captured.
    peer.notify(
        "root/sessionAdded",
        json!({"channel":"ahp-root://", "summary":summary("added","first")}),
    )
    .await;
    peer.reply(
        init.id,
        json!({"protocolVersion": ahp_types::PROTOCOL_VERSION, "serverSeq":10, "snapshots":[]}),
    )
    .await;
    connected(&mut hosts).await;
    let discovery = peer.request().await;
    bounded(events.recv()).await.unwrap();
    for (method, params) in [
        (
            "root/sessionSummaryChanged",
            json!({"session":"added", "changes":{"title":"new"}, "channel":"ahp-root://"}),
        ),
        (
            "root/sessionSummaryChanged",
            json!({"session":"changed", "changes":{"title":"fresh", "_meta":{"test":true},
                "chats":[{"resource":"ahp-chat:/latest", "title":"Latest", "status":97}]}, "channel":"ahp-root://"}),
        ),
        (
            "root/sessionSummaryChanged",
            json!({"session":"changed", "changes":{"activity":"busy", "defaultChat":"ahp-chat:/latest"}, "channel":"ahp-root://"}),
        ),
        (
            "root/sessionRemoved",
            json!({"session":"removed", "channel":"ahp-root://"}),
        ),
        (
            "root/sessionAdded",
            json!({"summary":summary("readded","new"), "channel":"ahp-root://"}),
        ),
        (
            "root/sessionRemoved",
            json!({"session":"readded", "channel":"ahp-root://"}),
        ),
        (
            "root/sessionAdded",
            json!({"summary":summary("readded","latest"), "channel":"ahp-root://"}),
        ),
    ] {
        peer.notify(method, params).await;
        bounded(events.recv()).await.unwrap();
    }
    peer.reply(
        discovery.id,
        json!({"items":[summary("changed","old"),summary("removed","old"),summary("added","old")]}),
    )
    .await;
    bounded(async {
        loop {
            let sessions = multi
                .host(&HostId::new("host"))
                .await
                .unwrap()
                .session_summaries;
            if sessions.len() == 3 && sessions.iter().any(|s| s.resource == "changed") {
                assert!(!sessions.iter().any(|s| s.resource == "removed"));
                assert_eq!(
                    sessions
                        .iter()
                        .find(|s| s.resource == "added")
                        .unwrap()
                        .title,
                    "new"
                );
                assert_eq!(
                    sessions
                        .iter()
                        .find(|s| s.resource == "readded")
                        .unwrap()
                        .title,
                    "latest"
                );
                let changed = sessions.iter().find(|s| s.resource == "changed").unwrap();
                assert_eq!(changed.title, "fresh");
                assert_eq!(changed.activity.as_deref(), Some("busy"));
                assert_eq!(changed.meta.as_ref().unwrap()["test"], json!(true));
                let chat = &changed.chats.as_ref().unwrap()[0];
                assert_eq!(chat.resource, "ahp-chat:/latest");
                assert_eq!(chat.status, Some(97));
                assert_eq!(changed.default_chat.as_deref(), Some("ahp-chat:/latest"));
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await;
    bounded(multi.remove_host(&HostId::new("host")))
        .await
        .unwrap();
    assert!(bounded(peer.rx.recv()).await.is_none());
}

#[tokio::test]
async fn failed_refresh_keeps_host_ready_and_live_cache() {
    let (transport, mut peer) = pair();
    let multi = MultiHostClient::new();
    let mut events = multi.events();
    add_host(&multi, vec![Ok(transport)], false).await;
    handshake(&mut peer, false).await;
    let discovery = peer.request().await;
    peer.notify(
        "root/sessionAdded",
        json!({"channel":"ahp-root://", "summary":summary("live","Live")}),
    )
    .await;
    bounded(events.recv()).await.unwrap();
    // A bad result is a nonfatal refresh error, not a readiness failure.
    peer.reply(discovery.id, json!({"bad":"result"})).await;
    settle().await;
    assert!(multi.client(&HostId::new("host")).await.is_some());
    assert_eq!(
        multi
            .host(&HostId::new("host"))
            .await
            .unwrap()
            .session_summaries[0]
            .title,
        "Live"
    );
    bounded(multi.remove_host(&HostId::new("host")))
        .await
        .unwrap();
    assert!(bounded(peer.rx.recv()).await.is_none());
}

#[tokio::test]
async fn continuous_session_updates_allow_discovery_and_supervisor_commands_to_progress() {
    struct BusyHost {
        replies: VecDeque<TransportMessage>,
    }
    impl Transport for BusyHost {
        async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
            let JsonRpcMessage::Request(request) = message.into_parsed()? else {
                panic!("expected request");
            };
            let result = match request.method.as_str() {
                "initialize" => json!({
                    "protocolVersion": ahp_types::PROTOCOL_VERSION,
                    "serverSeq": 10,
                    "snapshots": []
                }),
                "listSessions" => json!({"items":[summary("listed","Listed")]}),
                method => panic!("unexpected request: {method}"),
            };
            self.replies
                .push_back(TransportMessage::Parsed(JsonRpcMessage::SuccessResponse(
                    JsonRpcSuccessResponse {
                        jsonrpc: JsonRpcVersion::V2,
                        id: request.id,
                        result,
                    },
                )));
            Ok(())
        }

        async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
            Ok(Some(self.replies.pop_front().unwrap_or_else(|| {
                TransportMessage::Parsed(JsonRpcMessage::Notification(JsonRpcNotification {
                    jsonrpc: JsonRpcVersion::V2,
                    method: "root/sessionSummaryChanged".into(),
                    params: Some(json!({
                        "channel": "ahp-root://",
                        "session": "busy",
                        "changes": {"title": "Live"}
                    })),
                }))
            })))
        }
    }
    let (replacement, mut peer) = pair();
    let transports = Arc::new(Mutex::new(VecDeque::from([
        BoxedTransport::new(BusyHost {
            replies: VecDeque::new(),
        }),
        BoxedTransport::new(replacement),
    ])));
    let multi = MultiHostClient::new();
    let host = HostId::new("host");
    let config = HostConfig::new("host", "Host", move |_| {
        let transports = transports.clone();
        async move { Ok(transports.lock().await.pop_front().unwrap()) }
    })
    .with_client_config(config(false))
    .with_reconnect_policy(ReconnectPolicy::immediate_forever());
    multi.add_host(config).await.unwrap();
    bounded(async {
        loop {
            if multi
                .host(&host)
                .await
                .unwrap()
                .session_summaries
                .iter()
                .any(|summary| summary.resource == "listed")
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await;
    bounded(multi.reconnect_host(&host)).await.unwrap();
    handshake(&mut peer, true).await;
    assert_eq!(peer.request().await.method, "listSessions");
    bounded(multi.remove_host(&host)).await.unwrap();
    assert!(bounded(peer.rx.recv()).await.is_none());
}

#[tokio::test]
async fn superseded_refresh_and_old_handshake_reply_cannot_cross_connection_epoch() {
    let (first, mut old) = pair();
    let (second, mut peer) = pair();
    let (third, mut retry) = pair();
    let multi = MultiHostClient::new();
    let mut events = multi.host_events();
    add_host(
        &multi,
        vec![
            Err(TransportError::Closed),
            Ok(first),
            Ok(second),
            Ok(third),
        ],
        false,
    )
    .await;
    let abandoned = old.request().await;
    assert_eq!(abandoned.id, 1);
    drop(old.tx);
    assert!(bounded(old.rx.recv()).await.is_none());
    let init = peer.request().await;
    peer.reply(
        abandoned.id,
        json!({"protocolVersion":ahp_types::PROTOCOL_VERSION,"serverSeq":99,"snapshots":[]}),
    )
    .await;
    settle().await;
    assert!(
        peer.rx.try_recv().is_err(),
        "stale response must not finish handshake"
    );
    assert_eq!(init.id, 2);
    peer.reply(
        init.id,
        json!({"protocolVersion":ahp_types::PROTOCOL_VERSION,"serverSeq":10,"snapshots":[]}),
    )
    .await;
    connected(&mut events).await;
    let old_refresh = peer.request().await;
    assert_eq!(old_refresh.method, "listSessions");
    multi.reconnect_host(&HostId::new("host")).await.unwrap();
    assert!(bounded(peer.rx.recv()).await.is_none());
    let reconnect = retry.request().await;
    assert_eq!(reconnect.method, "reconnect");
    assert!(reconnect.id > old_refresh.id);
    retry
        .reply(old_refresh.id, json!({"items":[summary("old","Stale")]}))
        .await;
    settle().await;
    assert!(retry.rx.try_recv().is_err());
    retry
        .reply(
            reconnect.id,
            json!({"type":"replay","actions":[],"missing":[]}),
        )
        .await;
    connected(&mut events).await;
    let refresh = retry.request().await;
    retry
        .reply(refresh.id, json!({"items":[summary("new","Current")]}))
        .await;
    bounded(async {
        loop {
            let host = multi.host(&HostId::new("host")).await.unwrap();
            if !host.session_summaries.is_empty() {
                assert_eq!(host.session_summaries.len(), 1);
                assert_eq!(host.session_summaries[0].title, "Current");
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await;
    bounded(multi.remove_host(&HostId::new("host")))
        .await
        .unwrap();
    assert!(bounded(retry.rx.recv()).await.is_none());
}

#[tokio::test(start_paused = true)]
async fn liveness_failure_reconnects_and_restarts_keepalive_before_discovery_completes() {
    let (first, mut old) = pair();
    let (second, mut peer) = pair();
    let multi = MultiHostClient::new();
    let mut events = multi.host_events();
    add_host(&multi, vec![Ok(first), Ok(second)], true).await;
    handshake(&mut old, false).await;
    connected(&mut events).await;
    let discovery = old.request().await;
    assert_eq!(discovery.method, "listSessions");
    tokio::time::advance(Duration::from_secs(10)).await;
    let ping = old.request().await;
    assert_eq!(ping.method, "ping");
    tokio::time::advance(Duration::from_secs(20)).await;
    assert!(bounded(old.rx.recv()).await.is_none());
    let reconnect = handshake(&mut peer, true).await;
    assert!(reconnect.id > ping.id);
    connected(&mut events).await;
    let discovery = peer.request().await;
    assert_eq!(discovery.method, "listSessions");
    assert!(multi.client(&HostId::new("host")).await.is_some());
    tokio::time::advance(Duration::from_secs(10)).await;
    let ping = peer.request().await;
    assert_eq!(ping.method, "ping");
    peer.reply(ping.id, Value::Null).await;
    settle().await;
    bounded(multi.remove_host(&HostId::new("host")))
        .await
        .unwrap();
    assert!(bounded(peer.rx.recv()).await.is_none());
}
