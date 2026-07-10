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
