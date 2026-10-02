#![allow(clippy::panic, clippy::unwrap_used, clippy::useless_conversion)]

//! Integration test: round-trip a JSON-RPC request and a broadcast
//! action through an in-memory transport pair.
//!
//! Exercises the full client state machine end-to-end: request/response
//! correlation, subscription fan-out, and dispatch notification routing.

use ahp::{Client, ClientConfig, SubscriptionEvent, Transport, TransportError, TransportMessage};
use ahp_types::actions::{ActionEnvelope, SessionTitleChangedAction, StateAction};
use ahp_types::messages::{
    ActionNotificationParams, JsonRpcMessage, JsonRpcNotification, JsonRpcSuccessResponse,
    JsonRpcVersion,
};
use tokio::sync::mpsc;

async fn send_event_test_message(server: &mut MemTransport, value: serde_json::Value) {
    let message: JsonRpcMessage = serde_json::from_value(value).unwrap();
    server
        .send(TransportMessage::encode(&message).unwrap())
        .await
        .unwrap();
}

#[tokio::test]
async fn strict_events_capture_atomic_tcp_create_first_action() {
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        let (client_side, mut server_side) = pair();
        let client = Client::connect(client_side, ClientConfig::default()).await.unwrap();
        let mut events = client.events_strict();
        let server = tokio::spawn(async move {
            let JsonRpcMessage::Request(request) = server_side.recv().await.unwrap().unwrap().into_parsed().unwrap() else {
                panic!("expected subscribe request");
            };
            assert_eq!(request.method, "subscribe");
            let params: ahp_types::commands::SubscribeParams =
                serde_json::from_value(serde_json::to_value(request.params).unwrap()).unwrap();
            assert_eq!(params.channel, "ahp-session:/s1");
            assert_eq!(params.create.unwrap().r#type, "tcpConnection");
            send_event_test_message(&mut server_side, serde_json::json!({
                "jsonrpc": "2.0", "id": request.id, "result": {
                    "snapshot": {
                        "resource": "ahp-tcp:/created", "fromSeq": 0,
                        "state": {
                            "session": "ahp-session:/s1", "target": {"host": "localhost", "port": 3000},
                            "encoding": "base64", "clientClosed": false, "hostClosed": false,
                            "input": {"windowBytes": 8, "maximumChunkSize": 6, "receivedBytes": 0, "consumedBytes": 0},
                            "output": {"windowBytes": 8, "maximumChunkSize": 6, "receivedBytes": 0, "consumedBytes": 0}
                        }
                    }
                }
            })).await;
            send_event_test_message(&mut server_side, serde_json::json!({
                "jsonrpc": "2.0", "method": "action", "params": {
                    "channel": "ahp-tcp:/created", "serverSeq": 1, "origin": null,
                    "action": {"type": "tcp/data", "offset": 0, "data": "AA=="}
                }
            })).await;
            let JsonRpcMessage::Request(barrier) = server_side.recv().await.unwrap().unwrap().into_parsed().unwrap() else {
                panic!("expected ping");
            };
            assert_eq!(barrier.method, "ping");
            send_event_test_message(&mut server_side, serde_json::json!({
                "jsonrpc": "2.0", "id": barrier.id, "result": null
            })).await;
        });
        let mut params = ahp_types::commands::SubscribeParams::new("ahp-session:/s1");
        params.create = Some(ahp_types::commands::TcpConnectionSubscription {
            r#type: "tcpConnection".into(), host: "localhost".into(), port: 3000,
            encoding: ahp_types::state::TcpDataEncoding::Base64, receive_window_bytes: 8,
            maximum_chunk_size: 6,
        });
        let result: ahp_types::commands::SubscribeResult = client.request("subscribe", params).await.unwrap();
        // The response to this barrier follows the first action on the wire.
        client.ping().await.unwrap();
        let snapshot = result.snapshot.unwrap();
        let event = events.recv().await.unwrap().unwrap();
        assert_eq!(event.channel, snapshot.resource);
        let SubscriptionEvent::Action(envelope) = event.event else { panic!("expected action") };
        let ahp_types::state::SnapshotState::Tcp(mut state) = snapshot.state else { panic!("expected TCP snapshot") };
        assert_eq!(envelope.server_seq, 1);
        assert_eq!(ahp::apply_action_to_tcp(&mut state, &envelope.action), ahp::ReduceOutcome::Applied);
        assert_eq!(state.output.received_bytes, 1);
        client.shutdown().await;
        server.await.unwrap();
    }).await.expect("strict create recipe timed out");
}

#[tokio::test]
async fn strict_events_overflow_is_terminal_and_other_receivers_continue() {
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        let (client_side, mut server_side) = pair();
        let client = Client::connect(
            client_side,
            ClientConfig {
                subscription_buffer: 1,
                ..ClientConfig::default()
            },
        )
        .await
        .unwrap();
        let mut strict = client.events_strict();
        let mut ordinary = client.events();
        let server =
            tokio::spawn(async move {
                for sequences in [&[1, 2][..], &[3][..]] {
                    let JsonRpcMessage::Request(request) = server_side
                        .recv()
                        .await
                        .unwrap()
                        .unwrap()
                        .into_parsed()
                        .unwrap()
                    else {
                        panic!("expected ping")
                    };
                    for seq in sequences {
                        send_event_test_message(&mut server_side, serde_json::json!({
                        "jsonrpc": "2.0", "method": "action", "params": {
                            "channel": "ahp-tcp:/created", "serverSeq": seq, "origin": null,
                            "action": {"type": "tcp/data", "offset": seq - 1, "data": "AA=="}
                        }
                    })).await;
                    }
                    send_event_test_message(
                        &mut server_side,
                        serde_json::json!({
                            "jsonrpc": "2.0", "id": request.id, "result": null
                        }),
                    )
                    .await;
                }
            });
        client.ping().await.unwrap();
        assert!(matches!(
            strict.recv().await,
            Err(ahp::ClientError::SubscriptionLag(
                ahp::SubscriptionLagError { skipped: 1 }
            ))
        ));
        let SubscriptionEvent::Action(event) = ordinary.recv().await.unwrap().event else {
            panic!("expected action")
        };
        assert_eq!(event.server_seq, 2);
        client.ping().await.unwrap();
        assert!(strict.recv().await.unwrap().is_none());
        let SubscriptionEvent::Action(event) = ordinary.recv().await.unwrap().event else {
            panic!("expected action")
        };
        assert_eq!(event.server_seq, 3);
        client.shutdown().await;
        assert!(client.events_strict().recv().await.unwrap().is_none());
        server.await.unwrap();
    })
    .await
    .expect("strict overflow test timed out");
}

#[tokio::test]
async fn strict_events_decode_loss_is_terminal_but_future_actions_are_allowed() {
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        for (wire, fails, ordinary_unknown) in [
            ("{", true, false),
            (r#"{"jsonrpc":"2.0","method":"action","params":{"channel":42,"serverSeq":1,"action":{"type":"tcp/dataEof","finalOffset":0}}}"#, true, false),
            (r#"{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/created","serverSeq":1,"action":{"type":"tcp/dataEof","finalOffset":"bad"}}}"#, true, true),
            (r#"{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/created","serverSeq":1,"action":{"type":"tcp/inputConsumed","consumedBytes":"bad"}}}"#, true, true),
            (r#"{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/created","serverSeq":1,"action":{"type":"tcp/futureControl"}}}"#, false, true),
        ] {
            let (client_side, mut server_side) = pair();
            let client = Client::connect(client_side, ClientConfig::default()).await.unwrap();
            let mut strict = client.events_strict();
            let mut ordinary = client.events();
            let server = tokio::spawn(async move {
                let JsonRpcMessage::Request(request) = server_side.recv().await.unwrap().unwrap().into_parsed().unwrap() else { panic!("expected ping") };
                server_side.send(TransportMessage::Text(wire.into())).await.unwrap();
                send_event_test_message(&mut server_side, serde_json::json!({
                    "jsonrpc": "2.0", "method": "action", "params": {
                        "channel": "ahp-tcp:/created", "serverSeq": 2,
                        "action": {"type": "tcp/data", "offset": 0, "data": "AA=="}
                    }
                })).await;
                send_event_test_message(&mut server_side, serde_json::json!({
                    "jsonrpc": "2.0", "id": request.id, "result": null
                })).await;
            });
            client.ping().await.unwrap();
            if fails {
                assert!(matches!(strict.recv().await, Err(ahp::ClientError::Transport(TransportError::Protocol(_)))), "{wire}");
                assert!(strict.recv().await.unwrap().is_none(), "{wire}");
            } else {
                let SubscriptionEvent::Action(event) = strict.recv().await.unwrap().unwrap().event else { panic!("expected action") };
                assert!(matches!(event.action, StateAction::Unknown(_)));
                let SubscriptionEvent::Action(event) = strict.recv().await.unwrap().unwrap().event else { panic!("expected action") };
                assert_eq!(event.server_seq, 2);
            }
            if ordinary_unknown {
                let SubscriptionEvent::Action(event) = ordinary.recv().await.unwrap().event else { panic!("expected action") };
                assert!(matches!(event.action, StateAction::Unknown(_)));
            }
            let SubscriptionEvent::Action(event) = ordinary.recv().await.unwrap().event else { panic!("expected action") };
            assert_eq!(event.server_seq, 2, "ordinary stream changed behavior: {wire}");
            client.shutdown().await;
            server.await.unwrap();
        }
    }).await.expect("strict decode test timed out");
}

/// A bidirectional in-memory transport pair. Each half owns one sender
/// and one receiver; sends on one side are received on the other.
struct MemTransport {
    tx: mpsc::Sender<TransportMessage>,
    rx: mpsc::Receiver<TransportMessage>,
}

fn pair() -> (MemTransport, MemTransport) {
    let (a_tx, b_rx) = mpsc::channel(16);
    let (b_tx, a_rx) = mpsc::channel(16);
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

#[tokio::test]
async fn request_response_and_action_fanout() {
    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");

    // Server task: respond to an `initialize` request, then emit an
    // `action` notification targeting a session URI the client subscribes to.
    let server = tokio::spawn(async move {
        // Read initialize request.
        let msg = server_side.recv().await.unwrap().unwrap();
        let parsed = msg.into_parsed().unwrap();
        let JsonRpcMessage::Request(req) = parsed else {
            panic!("expected Request")
        };
        assert_eq!(req.method, "initialize");

        // Reply with a minimal InitializeResult.
        let result = serde_json::json!({
            "protocolVersion": "0.1.0",
            "serverSeq": 0,
            "snapshots": [],
        });
        let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
            jsonrpc: JsonRpcVersion::V2,
            id: req.id,
            result: ahp_types::common::AnyValue::from(result),
        });
        server_side
            .send(TransportMessage::encode(&resp).unwrap())
            .await
            .unwrap();

        // Read subscribe request.
        let msg = server_side.recv().await.unwrap().unwrap();
        let parsed = msg.into_parsed().unwrap();
        let JsonRpcMessage::Request(req) = parsed else {
            panic!("expected Request")
        };
        assert_eq!(req.method, "subscribe");

        let sub_result = serde_json::json!({
            "snapshot": {
                "resource": "ahp-session:/s1",
                "state": { "agents": [] },
                "fromSeq": 0
            }
        });
        let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
            jsonrpc: JsonRpcVersion::V2,
            id: req.id,
            result: ahp_types::common::AnyValue::from(sub_result),
        });
        server_side
            .send(TransportMessage::encode(&resp).unwrap())
            .await
            .unwrap();

        // Fan out an action envelope for the subscribed session.
        let envelope = ActionEnvelope {
            channel: "ahp-session:/s1".into(),
            action: StateAction::SessionTitleChanged(SessionTitleChangedAction {
                title: "Hello".into(),
            }),
            server_seq: 1,
            origin: None,
            rejection_reason: None,
        };
        let notif = JsonRpcMessage::Notification(JsonRpcNotification {
            jsonrpc: JsonRpcVersion::V2,
            method: "action".into(),
            params: Some(ahp_types::common::AnyValue::from(
                serde_json::to_value(ActionNotificationParams::from(envelope)).unwrap(),
            )),
        });
        server_side
            .send(TransportMessage::encode(&notif).unwrap())
            .await
            .unwrap();
    });

    // Initialize handshake.
    let init = client
        .initialize("test-client".into(), vec!["0.1.0".into()], vec![])
        .await
        .expect("initialize");
    assert_eq!(init.protocol_version, "0.1.0");

    // Subscribe and await the action broadcast.
    let (_snap, mut sub) = client
        .subscribe("ahp-session:/s1".into())
        .await
        .expect("subscribe");

    let event = tokio::time::timeout(std::time::Duration::from_secs(2), sub.recv())
        .await
        .expect("timed out")
        .expect("channel closed");

    match event {
        SubscriptionEvent::Action(env) => {
            assert_eq!(env.server_seq, 1);
            assert_eq!(env.channel, "ahp-session:/s1");
            match env.action {
                StateAction::SessionTitleChanged(a) => {
                    assert_eq!(a.title, "Hello");
                }
                other => panic!("unexpected action: {:?}", other),
            }
        }
        other => panic!("expected an Action event, got {other:?}"),
    }

    client.shutdown().await;
    server.await.unwrap();
}

#[tokio::test]
async fn automation_catalogue_actions_fan_out() {
    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");
    let mut subscription = client
        .attach_subscription("ahp-automations://".into())
        .await;

    for (server_seq, action) in [
        (
            1,
            serde_json::json!({
                "type": "automation/set",
                "automation": {
                    "resource": "ahp-automation:/a1",
                    "definition": {
                        "title": "Nightly triage",
                        "message": {
                            "text": "Triage issues",
                            "origin": { "kind": "automation" }
                        },
                        "session": {},
                        "enabled": true,
                        "triggers": []
                    },
                    "runs": [],
                    "operations": ["update", "remove", "run"],
                    "createdAt": "2026-08-01T00:00:00Z",
                    "modifiedAt": "2026-08-05T12:00:00Z"
                }
            }),
        ),
        (
            2,
            serde_json::json!({
                "type": "automation/removed",
                "resource": "ahp-automation:/a1"
            }),
        ),
    ] {
        let notification = JsonRpcMessage::Notification(JsonRpcNotification {
            jsonrpc: JsonRpcVersion::V2,
            method: "action".into(),
            params: Some(ahp_types::common::AnyValue::from(serde_json::json!({
                "channel": "ahp-automations://",
                "serverSeq": server_seq,
                "action": action,
                "origin": null
            }))),
        });
        server_side
            .send(TransportMessage::encode(&notification).unwrap())
            .await
            .unwrap();
    }

    let set = tokio::time::timeout(std::time::Duration::from_secs(2), subscription.recv())
        .await
        .expect("timed out")
        .expect("channel closed");
    let SubscriptionEvent::Action(set) = set else {
        panic!("expected automation/set action")
    };
    let StateAction::AutomationSet(set) = set.action else {
        panic!("expected AutomationSet")
    };
    assert_eq!(set.automation.resource, "ahp-automation:/a1");

    let removed = subscription.recv().await.expect("channel closed");
    let SubscriptionEvent::Action(removed) = removed else {
        panic!("expected automation/removed action")
    };
    let StateAction::AutomationRemoved(removed) = removed.action else {
        panic!("expected AutomationRemoved")
    };
    assert_eq!(removed.resource, "ahp-automation:/a1");

    client.shutdown().await;
}

#[tokio::test]
async fn resource_read_send_wrapper_targets_root_channel() {
    use ahp_types::commands::{ContentEncoding, ResourceReadParams};

    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");

    let server = tokio::spawn(async move {
        let msg = server_side.recv().await.unwrap().unwrap();
        let JsonRpcMessage::Request(req) = msg.into_parsed().unwrap() else {
            panic!("expected Request")
        };
        assert_eq!(req.method, "resourceRead");
        let params = req.params.unwrap();
        // The wrapper must force the root channel regardless of caller input.
        assert_eq!(params["channel"], "ahp-root://");
        assert_eq!(params["uri"], "ahp-resource:/notes.txt");

        let result = serde_json::json!({ "data": "hi", "encoding": "utf-8" });
        let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
            jsonrpc: JsonRpcVersion::V2,
            id: req.id,
            result: ahp_types::common::AnyValue::from(result),
        });
        server_side
            .send(TransportMessage::encode(&resp).unwrap())
            .await
            .unwrap();
    });

    let result = client
        .resource_read(ResourceReadParams {
            channel: String::new(),
            meta: None,
            uri: "ahp-resource:/notes.txt".into(),
            encoding: None,
        })
        .await
        .expect("resource_read");
    assert_eq!(result.data, "hi");
    assert_eq!(result.encoding, ContentEncoding::Utf8);

    client.shutdown().await;
    server.await.unwrap();
}

#[tokio::test]
async fn completions_send_wrapper_preserves_channel() {
    use ahp_types::commands::{CompletionItemKind, CompletionsParams};

    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");

    let server = tokio::spawn(async move {
        let msg = server_side.recv().await.unwrap().unwrap();
        let JsonRpcMessage::Request(req) = msg.into_parsed().unwrap() else {
            panic!("expected Request")
        };
        assert_eq!(req.method, "completions");
        let params = req.params.unwrap();
        // The wrapper must preserve the caller-supplied chat channel.
        assert_eq!(params["channel"], "ahp-chat:/abc");
        assert_eq!(params["kind"], "userMessage");
        assert_eq!(params["text"], "look at @foo");

        let result = serde_json::json!({ "items": [] });
        let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
            jsonrpc: JsonRpcVersion::V2,
            id: req.id,
            result: ahp_types::common::AnyValue::from(result),
        });
        server_side
            .send(TransportMessage::encode(&resp).unwrap())
            .await
            .unwrap();
    });

    let result = client
        .completions(CompletionsParams {
            channel: "ahp-chat:/abc".into(),
            meta: None,
            kind: CompletionItemKind::UserMessage,
            text: "look at @foo".into(),
            offset: 12,
        })
        .await
        .expect("completions");
    assert!(result.items.is_empty());

    client.shutdown().await;
    server.await.unwrap();
}

#[tokio::test]
async fn session_config_completions_send_wrapper_targets_root_channel() {
    use ahp_types::commands::SessionConfigCompletionsParams;

    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");

    let server = tokio::spawn(async move {
        let msg = server_side.recv().await.unwrap().unwrap();
        let JsonRpcMessage::Request(req) = msg.into_parsed().unwrap() else {
            panic!("expected Request")
        };
        assert_eq!(req.method, "sessionConfigCompletions");
        let params = req.params.unwrap();
        // The wrapper must force the root channel regardless of caller input.
        assert_eq!(params["channel"], "ahp-root://");
        assert_eq!(params["property"], "baseBranch");
        assert_eq!(params["query"], "ma");

        let result = serde_json::json!({ "items": [{ "value": "main", "label": "main" }] });
        let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
            jsonrpc: JsonRpcVersion::V2,
            id: req.id,
            result: ahp_types::common::AnyValue::from(result),
        });
        server_side
            .send(TransportMessage::encode(&resp).unwrap())
            .await
            .unwrap();
    });

    let result = client
        .session_config_completions(SessionConfigCompletionsParams {
            channel: String::new(),
            meta: None,
            provider: None,
            working_directory: None,
            config: None,
            property: "baseBranch".into(),
            query: Some("ma".into()),
        })
        .await
        .expect("session_config_completions");
    assert_eq!(result.items.len(), 1);
    assert_eq!(result.items[0].value, "main");

    client.shutdown().await;
    server.await.unwrap();
}

#[tokio::test]
async fn ping_targets_root_channel_and_resolves_on_null_result() {
    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");

    let server = tokio::spawn(async move {
        let msg = server_side.recv().await.unwrap().unwrap();
        let JsonRpcMessage::Request(req) = msg.into_parsed().unwrap() else {
            panic!("expected Request")
        };
        assert_eq!(req.method, "ping");
        // `ping` is a connection-level command scoped to the root channel.
        assert_eq!(req.params.unwrap()["channel"], "ahp-root://");

        // The server responds with a `null` result — the response is the signal.
        let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
            jsonrpc: JsonRpcVersion::V2,
            id: req.id,
            result: ahp_types::common::AnyValue::from(serde_json::Value::Null),
        });
        server_side
            .send(TransportMessage::encode(&resp).unwrap())
            .await
            .unwrap();
    });

    client.ping().await.expect("ping");

    client.shutdown().await;
    server.await.unwrap();
}

#[tokio::test]
async fn inbound_resource_request_routes_to_typed_handler() {
    use ahp::ResourceRequestHandlers;
    use ahp_types::commands::{ContentEncoding, ResourceReadResult};

    let (client_side, mut server_side) = pair();
    let client = Client::connect(client_side, ClientConfig::default())
        .await
        .expect("connect");

    client.set_resource_request_handlers(ResourceRequestHandlers::new().on_resource_read(
        |params| async move {
            assert_eq!(params.uri, "ahp-resource:/from-server.txt");
            Ok(ResourceReadResult {
                data: "server-data".into(),
                encoding: ContentEncoding::Utf8,
                content_type: None,
            })
        },
    ));

    // A registered method is answered by the typed handler; an unregistered
    // one falls through to MethodNotFound.
    let server = tokio::spawn(async move {
        let read_req = JsonRpcMessage::Request(ahp_types::messages::JsonRpcRequest {
            jsonrpc: JsonRpcVersion::V2,
            id: 100,
            method: "resourceRead".into(),
            params: Some(ahp_types::common::AnyValue::from(serde_json::json!({
                "channel": "ahp-root://",
                "uri": "ahp-resource:/from-server.txt",
            }))),
        });
        server_side
            .send(TransportMessage::encode(&read_req).unwrap())
            .await
            .unwrap();

        let JsonRpcMessage::SuccessResponse(resp) = server_side
            .recv()
            .await
            .unwrap()
            .unwrap()
            .into_parsed()
            .unwrap()
        else {
            panic!("expected SuccessResponse")
        };
        assert_eq!(resp.id, 100);
        assert_eq!(resp.result["data"], "server-data");

        let write_req = JsonRpcMessage::Request(ahp_types::messages::JsonRpcRequest {
            jsonrpc: JsonRpcVersion::V2,
            id: 101,
            method: "resourceWrite".into(),
            params: Some(ahp_types::common::AnyValue::from(serde_json::json!({
                "channel": "ahp-root://",
                "uri": "ahp-resource:/x.txt",
                "data": "y",
                "encoding": "utf-8",
            }))),
        });
        server_side
            .send(TransportMessage::encode(&write_req).unwrap())
            .await
            .unwrap();

        let JsonRpcMessage::ErrorResponse(resp) = server_side
            .recv()
            .await
            .unwrap()
            .unwrap()
            .into_parsed()
            .unwrap()
        else {
            panic!("expected ErrorResponse")
        };
        assert_eq!(resp.id, 101);
        assert_eq!(resp.error.code, -32601);
    });

    server.await.unwrap();
    client.shutdown().await;
}
