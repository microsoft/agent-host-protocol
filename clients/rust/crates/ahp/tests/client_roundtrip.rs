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

async fn read_accounts_request(server: &mut MemTransport) -> ahp_types::messages::JsonRpcRequest {
    let frame = tokio::time::timeout(std::time::Duration::from_secs(2), server.recv())
        .await
        .expect("request timeout")
        .expect("receive")
        .expect("frame");
    match frame.into_parsed().expect("decode request") {
        JsonRpcMessage::Request(request) => request,
        other => panic!("expected request, got {other:?}"),
    }
}

async fn reply_accounts_request(server: &mut MemTransport, id: u64, result: serde_json::Value) {
    server
        .send(
            TransportMessage::encode(&JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id,
                result,
            }))
            .expect("encode response"),
        )
        .await
        .expect("send response");
}

async fn initialize_accounts(
    client: &Client,
    server: &mut MemTransport,
    authentication: serde_json::Value,
) {
    let (result, ()) = tokio::join!(
        client.initialize("client-1".into(), vec!["0.9.0".into()], vec![]),
        async {
            let request = read_accounts_request(server).await;
            assert_eq!(request.method, "initialize");
            reply_accounts_request(
                server,
                request.id,
                serde_json::json!({
                    "protocolVersion":"0.9.0","serverSeq":0,"snapshots":[],
                    "authentication":authentication
                }),
            )
            .await;
        }
    );
    result.expect("initialize");
}

#[tokio::test]
async fn accounts_commands_preserve_brokered_bindings_and_correlate_rejected_dispatches() {
    use ahp_types::commands::{AuthBeginParams, AuthenticateParams};
    use ahp_types::state::SnapshotState;
    let (transport, mut server) = pair();
    let client = Client::connect(transport, ClientConfig::default())
        .await
        .expect("connect");
    initialize_accounts(
        &client,
        &mut server,
        serde_json::json!({"flows":[{"kind":"clientBrokered"}]}),
    )
    .await;

    let params = serde_json::json!({
        "channel":"ahp-accounts://",
        "target":{"consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"}},
        "flows":[{"kind":"clientBrokered"}],"accountId":"account-1"
    });
    let typed: AuthBeginParams = serde_json::from_value(params.clone()).expect("begin params");
    let (begin, ()) = tokio::join!(client.auth_begin(typed), async {
        let request = read_accounts_request(&mut server).await;
        assert_eq!(request.method, "authBegin");
        assert_eq!(request.params, Some(params));
        reply_accounts_request(
            &mut server,
            request.id,
            serde_json::json!({
                "flow":"clientBrokered","attemptId":"attempt-1"
            }),
        )
        .await;
    });
    assert_eq!(begin.expect("begin result").attempt_id, "attempt-1");

    for binding in [
        serde_json::json!({"kind":"attempt","attemptId":"attempt-1"}),
        serde_json::json!({"kind":"account","accountId":"account-1"}),
    ] {
        let params = serde_json::json!({
            "channel":"ahp-root://","resource":"https://api.example.test",
            "token":"example-test-credential","expiresIn":120,"scopes":["read"],"binding":binding
        });
        let typed: AuthenticateParams =
            serde_json::from_value(params.clone()).expect("bound params");
        let (result, ()) = tokio::join!(client.authenticate(typed), async {
            let request = read_accounts_request(&mut server).await;
            assert_eq!(request.method, "authenticate");
            assert_eq!(request.params, Some(params));
            reply_accounts_request(
                &mut server,
                request.id,
                serde_json::json!({"accountId":"account-1"}),
            )
            .await;
        });
        assert_eq!(
            result.expect("bound result").account_id.as_deref(),
            Some("account-1")
        );
    }

    let (subscription, ()) = tokio::join!(client.subscribe("ahp-accounts://".into()), async {
        let request = read_accounts_request(&mut server).await;
        assert_eq!(request.method, "subscribe");
        assert_eq!(
            request.params,
            Some(serde_json::json!({"channel":"ahp-accounts://"}))
        );
        reply_accounts_request(&mut server, request.id, serde_json::json!({
                "snapshot":{"resource":"ahp-accounts://","fromSeq":1,"state":{"accounts":[],"attempts":[]}}
            })).await;
    });
    let (snapshot, mut subscription) = subscription.expect("subscribe accounts");
    assert!(matches!(
        snapshot.snapshot.expect("accounts snapshot").state,
        SnapshotState::Accounts(_)
    ));
    let action = StateAction::AccountRemoved(ahp_types::actions::AccountRemovedAction {
        id: "account-1".into(),
    });
    let dispatch = client
        .dispatch("ahp-accounts://".into(), action.clone())
        .await
        .expect("dispatch");
    let frame = server
        .recv()
        .await
        .expect("receive dispatch")
        .expect("dispatch frame");
    let JsonRpcMessage::Notification(notification) = frame.into_parsed().expect("decode dispatch")
    else {
        panic!("expected notification");
    };
    assert_eq!(notification.method, "dispatchAction");
    assert_eq!(
        notification.params,
        Some(serde_json::json!({
            "channel":"ahp-accounts://","clientSeq":dispatch.client_seq,
            "action":{"type":"accounts/removed","id":"account-1"}
        }))
    );
    let envelope = serde_json::json!({
        "channel":"ahp-accounts://","serverSeq":2,"action":{"type":"accounts/removed","id":"account-1"},
        "origin":{"clientId":"client-1","clientSeq":dispatch.client_seq},"rejectionReason":"Permission denied"
    });
    server
        .send(
            TransportMessage::encode(&JsonRpcMessage::Notification(JsonRpcNotification {
                jsonrpc: JsonRpcVersion::V2,
                method: "action".into(),
                params: Some(envelope),
            }))
            .expect("encode rejection"),
        )
        .await
        .expect("send rejection");
    let event = tokio::time::timeout(std::time::Duration::from_secs(2), subscription.recv())
        .await
        .expect("rejection timeout")
        .expect("subscription event");
    let SubscriptionEvent::Action(rejected) = event else {
        panic!("expected action")
    };
    assert_eq!(rejected.action, action);
    assert_eq!(
        rejected.rejection_reason.as_deref(),
        Some("Permission denied")
    );
    assert_eq!(
        rejected.origin.expect("origin").client_seq,
        dispatch.client_seq
    );
    client.shutdown().await;
}

#[tokio::test]
async fn accounts_capability_gates_requests_and_removals_without_legacy_fallback() {
    use ahp::{ClientError, TransportError};
    use ahp_types::commands::{AuthBeginParams, AuthenticateParams};
    let begin = serde_json::json!({
        "channel":"ahp-accounts://",
        "target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"}},
        "flows":[{"kind":"clientBrokered"}]
    });
    let bound = serde_json::json!({
        "channel":"ahp-root://","resource":"https://api.example.test","token":"example-test-credential",
        "binding":{"kind":"attempt","attemptId":"attempt-1"}
    });
    for capability in [
        serde_json::Value::Null,
        serde_json::json!({"flows":[]}),
        serde_json::json!({"flows":[{"kind":"futureFlow"}]}),
    ] {
        let (transport, mut server) = pair();
        let client = Client::connect(transport, ClientConfig::default())
            .await
            .expect("connect");
        initialize_accounts(&client, &mut server, capability).await;
        let begin_params: AuthBeginParams =
            serde_json::from_value(begin.clone()).expect("begin params");
        assert!(matches!(
            client.auth_begin(begin_params).await,
            Err(ClientError::UnsupportedCapability(_))
        ));
        let bound_params: AuthenticateParams =
            serde_json::from_value(bound.clone()).expect("bound params");
        assert!(matches!(
            client.authenticate(bound_params).await,
            Err(ClientError::UnsupportedCapability(_))
        ));
        assert!(matches!(
            client.subscribe("ahp-accounts://".into()).await,
            Err(ClientError::UnsupportedCapability(_))
        ));
        assert!(matches!(
            client
                .dispatch(
                    "ahp-accounts://".into(),
                    StateAction::AccountRemoved(ahp_types::actions::AccountRemovedAction {
                        id: "account-1".into()
                    })
                )
                .await,
            Err(ClientError::UnsupportedCapability(_))
        ));
        let (ping, ()) = tokio::join!(client.ping(), async {
            let request = read_accounts_request(&mut server).await;
            assert_eq!(
                request.method, "ping",
                "no unbound or empty-token fallback traffic"
            );
            reply_accounts_request(&mut server, request.id, serde_json::Value::Null).await;
        });
        ping.expect("ping");
        client.shutdown().await;
    }

    let (transport, mut server) = pair();
    let client = Client::connect(transport, ClientConfig::default())
        .await
        .expect("connect");
    initialize_accounts(
        &client,
        &mut server,
        serde_json::json!({"flows":[{"kind":"clientBrokered"}]}),
    )
    .await;
    let (result, ()) = tokio::join!(
        client.authenticate(serde_json::from_value(bound).expect("bound params")),
        async {
            let request = read_accounts_request(&mut server).await;
            reply_accounts_request(&mut server, request.id, serde_json::json!({})).await;
        }
    );
    assert!(matches!(
        result,
        Err(ClientError::Transport(TransportError::Protocol(_)))
    ));
    let renewal: AuthenticateParams = serde_json::from_value(serde_json::json!({
        "channel":"ahp-root://","resource":"https://api.example.test","token":"example-test-credential",
        "binding":{"kind":"account","accountId":"account-1"}
    }))
    .expect("renewal params");
    let (result, ()) = tokio::join!(client.authenticate(renewal), async {
        let request = read_accounts_request(&mut server).await;
        reply_accounts_request(
            &mut server,
            request.id,
            serde_json::json!({"accountId":"another-account"}),
        )
        .await;
    });
    assert!(matches!(
        result,
        Err(ClientError::Transport(TransportError::Protocol(_)))
    ));
    let (result, ()) = tokio::join!(
        client.auth_begin(serde_json::from_value(begin).expect("begin params")),
        async {
            let request = read_accounts_request(&mut server).await;
            reply_accounts_request(
                &mut server,
                request.id,
                serde_json::json!({"flow":"futureFlow","attemptId":"attempt-1"}),
            )
            .await;
        }
    );
    assert!(matches!(
        result,
        Err(ClientError::Transport(TransportError::Protocol(_)))
    ));
    let (ping, ()) = tokio::join!(client.ping(), async {
        let request = read_accounts_request(&mut server).await;
        assert_eq!(request.method, "ping");
        reply_accounts_request(&mut server, request.id, serde_json::Value::Null).await;
    });
    ping.expect("ping");
    client.shutdown().await;
}

#[tokio::test]
async fn accounts_reconnect_restores_capability_only_after_host_acceptance() {
    let (transport, mut server) = pair();
    let client = Client::connect(transport, ClientConfig::default())
        .await
        .expect("connect");
    let authentication = serde_json::from_value(serde_json::json!({
        "flows":[{"kind":"clientBrokered"}]
    }))
    .expect("authentication capability");
    let (result, ()) = tokio::join!(
        client.reconnect_with_authentication(
            "client-1".into(),
            2,
            vec!["ahp-accounts://".into()],
            Some(authentication)
        ),
        async {
            let request = read_accounts_request(&mut server).await;
            assert_eq!(
                request.params,
                Some(serde_json::json!({
                    "channel":"ahp-root://","clientId":"client-1","lastSeenServerSeq":2,"subscriptions":["ahp-accounts://"]
                }))
            );
            assert!(client.authentication().await.is_none());
            reply_accounts_request(
                &mut server,
                request.id,
                serde_json::json!({
                    "type":"replay","actions":[],"missing":[]
                }),
            )
            .await;
        }
    );
    result.expect("reconnect");
    assert!(client.authentication().await.is_some());
    client.shutdown().await;
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
