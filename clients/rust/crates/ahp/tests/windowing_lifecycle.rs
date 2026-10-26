#![allow(clippy::unwrap_used, clippy::panic)]
use ahp::{
    Client, Transport, TransportError, TransportMessage, WindowOptions, WindowedSubscription,
};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tokio::sync::{mpsc, Notify};

struct Memory {
    inbound: mpsc::UnboundedReceiver<TransportMessage>,
    outbound: mpsc::UnboundedSender<String>,
}
impl Transport for Memory {
    fn window_capabilities(&self) -> ahp::WindowTransportCapabilities {
        ahp::WindowTransportCapabilities::default().raw_text(true)
    }
    async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
        let TransportMessage::Text(text) = message else {
            panic!("expected text")
        };
        self.outbound.send(text).map_err(|_| TransportError::Closed)
    }
    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        Ok(self.inbound.recv().await)
    }
}
struct Script {
    tx: mpsc::UnboundedSender<TransportMessage>,
    rx: mpsc::UnboundedReceiver<String>,
}
impl Script {
    async fn connect(timeout: Option<Duration>) -> (Client, Self) {
        Self::configured(timeout, Default::default()).await
    }
    async fn configured(timeout: Option<Duration>, config: ahp::WindowingConfig) -> (Client, Self) {
        let (tx, inbound) = mpsc::unbounded_channel();
        let (outbound, rx) = mpsc::unbounded_channel();
        let client = Client::builder()
            .default_request_timeout(timeout)
            .windowing(config)
            .connect(Memory { inbound, outbound })
            .await
            .unwrap();
        (client, Self { tx, rx })
    }
    async fn next(&mut self) -> Value {
        serde_json::from_str(
            &tokio::time::timeout(Duration::from_secs(1), self.rx.recv())
                .await
                .unwrap()
                .unwrap(),
        )
        .unwrap()
    }
    fn send(&self, value: Value) {
        self.tx
            .send(TransportMessage::Text(value.to_string()))
            .unwrap();
    }
    fn accept(&self, request: &Value) {
        self.send(
            json!({"jsonrpc":"2.0","id":request["id"],"result":{"flowControl":{
                "clientReceive":{"windowBytes":1024,"maximumFrameBytes":1024},
                "hostReceive":{"windowBytes":1024,"maximumFrameBytes":1024}
            }}}),
        );
    }
    async fn subscribe(&mut self, client: &Client, uri: &str) -> WindowedSubscription {
        let client = client.clone();
        let uri = uri.to_string();
        let pending = tokio::spawn(async move {
            client
                .subscribe_windowed(uri, WindowOptions::default())
                .await
        });
        let request = self.next().await;
        assert_eq!(request["method"], "subscribe");
        self.accept(&request);
        pending.await.unwrap().unwrap().1
    }
    async fn ping(&mut self, client: &Client) {
        let client = client.clone();
        let pending = tokio::spawn(async move { client.ping().await });
        let request = self.next().await;
        assert_eq!(request["method"], "ping");
        self.send(json!({"jsonrpc":"2.0","id":request["id"],"result":null}));
        pending.await.unwrap().unwrap();
    }
}

#[tokio::test]
async fn failed_cancelled_and_timed_out_subscribes_do_not_leave_dead_queues() {
    for failure in ["rpc", "cancel", "timeout"] {
        let (client, mut host) = Script::connect(Some(Duration::from_millis(30))).await;
        let child = client.clone();
        let pending = tokio::spawn(async move {
            child
                .subscribe_windowed("ahp-terminal:/failed", WindowOptions::default())
                .await
        });
        let request = host.next().await;
        match failure {
            "rpc" => {
                host.send(json!({"jsonrpc":"2.0","id":request["id"],"error":{"code":-32602,"message":"refused"}}));
                assert!(pending.await.unwrap().is_err());
            }
            "cancel" => {
                pending.abort();
                assert!(pending.await.is_err());
            }
            _ => {
                assert!(pending.await.unwrap().is_err());
            }
        }
        client
            .notify(
                "custom/after",
                json!({"channel":"ahp-terminal:/failed","value":1}),
            )
            .await
            .unwrap();
        assert_eq!(host.next().await["method"], "custom/after");
        if failure != "rpc" {
            host.accept(&request);
            assert_eq!(host.next().await["method"], "unsubscribe");
        }
        host.ping(&client).await;
        client.shutdown().await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn unsubscribe_racing_subscribe_and_drop_followed_by_subscribe_are_nonfatal() {
    let (client, mut host) = Script::connect(None).await;
    let child = client.clone();
    let pending = tokio::spawn(async move {
        child
            .subscribe_windowed("ahp-terminal:/race", WindowOptions::default())
            .await
    });
    let request = host.next().await;
    client
        .unsubscribe("ahp-terminal:/race".into())
        .await
        .unwrap();
    assert_eq!(host.next().await["method"], "unsubscribe");
    host.accept(&request);
    assert_eq!(host.next().await["method"], "unsubscribe");
    assert!(pending.await.unwrap().is_err());
    let mut sub = host.subscribe(&client, "ahp-terminal:/race").await;
    for _ in 0..30 {
        drop(sub);
        let child = client.clone();
        let pending = tokio::spawn(async move {
            child
                .subscribe_windowed("ahp-terminal:/race", WindowOptions::default())
                .await
        });
        let mut request = host.next().await;
        while request["method"] == "unsubscribe" {
            request = host.next().await;
        }
        assert_eq!(request["method"], "subscribe");
        host.accept(&request);
        sub = pending.await.unwrap().unwrap().1;
    }
    host.ping(&client).await;
    client.shutdown().await;
}

#[tokio::test]
async fn late_resubscribe_and_reconnect_results_install_without_closing() {
    let (client, mut host) = Script::connect(Some(Duration::from_millis(30))).await;
    let sub = host.subscribe(&client, "ahp-terminal:/late").await;
    let child = client.clone();
    let pending = tokio::spawn(async move {
        child
            .subscribe_windowed(
                "ahp-terminal:/late",
                WindowOptions::default().window_bytes(2048),
            )
            .await
    });
    let request = host.next().await;
    assert!(pending.await.unwrap().is_err());
    host.accept(&request);
    host.ping(&client).await;
    assert_eq!(sub.status().mode, "windowed");
    let child = client.clone();
    let reconnect = tokio::spawn(async move {
        child.reconnect_with_windows(serde_json::from_value(json!({
            "channel":"ahp-root://","clientId":"late","lastSeenServerSeq":0,
            "subscriptions":["ahp-terminal:/late"],
            "windows":{"items":[{"channel":"ahp-terminal:/late","flowControl":{"receive":{"windowBytes":2048,"maximumFrameBytes":1024}},"lastAppliedServerSeq":0}]}
        })).unwrap()).await
    });
    let request = host.next().await;
    assert!(reconnect.await.unwrap().is_err());
    host.send(json!({"jsonrpc":"2.0","id":request["id"],"result":{"type":"replay","actions":[],"missing":[],"windows":{"items":[{
        "channel":"ahp-terminal:/late","flowControl":{
            "clientReceive":{"windowBytes":1024,"maximumFrameBytes":1024},
            "hostReceive":{"windowBytes":1024,"maximumFrameBytes":1024}
        },"recovery":"replay"}]}}}));
    host.ping(&client).await;
    client.shutdown().await;
}

#[tokio::test]
async fn late_initialize_installs_without_closing() {
    let (client, mut host) = Script::connect(Some(Duration::from_millis(30))).await;
    let _sub = host.subscribe(&client, "ahp-terminal:/late").await;
    let child = client.clone();
    let initialize = tokio::spawn(async move {
        child
            .initialize(
                "late".into(),
                vec!["1.0.0".into()],
                vec!["ahp-terminal:/late".into()],
            )
            .await
    });
    let request = host.next().await;
    assert!(initialize.await.unwrap().is_err());
    host.send(json!({"jsonrpc":"2.0","id":request["id"],"result":{
        "protocolVersion":"1.0.0","serverSeq":1,
        "snapshots":[{"resource":"ahp-terminal:/late","state":{},"fromSeq":1}]
    }}));
    host.ping(&client).await;
    client.shutdown().await;
}

#[tokio::test]
async fn control_traffic_bypasses_a_full_one_byte_send_budget() {
    let (client, mut host) = Script::configured(
        None,
        ahp::WindowingConfig::default().max_buffered_send_bytes(1),
    )
    .await;
    let child = client.clone();
    let subscribe = tokio::spawn(async move {
        child
            .subscribe_windowed("ahp-tcp:/control", WindowOptions::default())
            .await
    });
    let request = host.next().await;
    host.send(
        json!({"jsonrpc":"2.0","id":request["id"],"result":{"flowControl":{
            "clientReceive":{"windowBytes":1024,"maximumFrameBytes":1024},
            "hostReceive":{"windowBytes":1,"maximumFrameBytes":1024}
        }}}),
    );
    let mut sub = subscribe.await.unwrap().unwrap().1;
    host.send(json!({"jsonrpc":"2.0","method":"channel/snapshot","params":{"channel":sub.uri(),"snapshot":{"resource":sub.uri(),"state":{},"fromSeq":0}}}));
    sub.next().await.unwrap().unwrap().release();
    let credit = host.next().await;
    assert_eq!(credit["method"], "channel/credit");
    assert!(credit["params"]["consumedBytes"].as_u64().unwrap() > 1);
    let sender = sub.sender();
    let first_sender = sender.clone();
    let first =
        tokio::spawn(async move { first_sender.send("tcp/data", json!({"data":"eA=="})).await });
    assert_eq!(host.next().await["method"], "tcp/data");
    first.await.unwrap().unwrap();
    assert!(!sender.status().writable);
    let data_sender = sender.clone();
    let blocked =
        tokio::spawn(async move { data_sender.send("tcp/data", json!({"data":"eA=="})).await });
    tokio::task::yield_now().await;
    let control = tokio::spawn(async move { sender.send("tcp/reset", json!({})).await });
    assert_eq!(host.next().await["method"], "tcp/reset");
    control.await.unwrap().unwrap();
    client.unsubscribe("ahp-tcp:/control".into()).await.unwrap();
    assert_eq!(host.next().await["method"], "unsubscribe");
    assert!(blocked.await.unwrap().is_err());
    host.ping(&client).await;
    client.shutdown().await;
}

#[tokio::test]
async fn ordinary_messages_are_drained_before_shutdown() {
    let (client, mut host) = Script::connect(None).await;
    let mut events = client.events();
    let mut subscription = client.attach_subscription("ahp-root://").await;
    for index in 0..100 {
        client
            .notify(
                "ordinary/data",
                json!({"channel":"ahp-root://","index":index}),
            )
            .await
            .unwrap();
    }
    client
        .dispatch(
            "ahp-root://".into(),
            ahp::ahp_types::actions::StateAction::RootActiveSessionsChanged(
                ahp::ahp_types::actions::RootActiveSessionsChangedAction { active_sessions: 1 },
            ),
        )
        .await
        .unwrap();
    client.unsubscribe("ahp-root://".into()).await.unwrap();
    client.shutdown().await;
    for index in 0..100 {
        assert_eq!(host.next().await["params"]["index"], index);
    }
    assert_eq!(host.next().await["method"], "dispatchAction");
    assert_eq!(host.next().await["method"], "unsubscribe");
    assert!(events.recv().await.is_none());
    assert!(subscription.recv().await.is_none());
}

struct Stalled {
    entered: Arc<Notify>,
    dropped: Arc<AtomicBool>,
}
impl Drop for Stalled {
    fn drop(&mut self) {
        self.dropped.store(true, Ordering::Release);
    }
}
impl Transport for Stalled {
    async fn send(&mut self, _: TransportMessage) -> Result<(), TransportError> {
        self.entered.notify_one();
        std::future::pending().await
    }
    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        std::future::pending().await
    }
}
#[tokio::test(start_paused = true)]
async fn forced_shutdown_with_full_outbound_queue_still_tears_down_readers() {
    let entered = Arc::new(Notify::new());
    let dropped = Arc::new(AtomicBool::new(false));
    let client = Client::connect(
        Stalled {
            entered: entered.clone(),
            dropped: dropped.clone(),
        },
        Default::default(),
    )
    .await
    .unwrap();
    let mut events = client.events();
    let mut subscription = client.attach_subscription("ahp-root://").await;
    client
        .notify("ordinary/data", json!({"channel":"ahp-root://"}))
        .await
        .unwrap();
    entered.notified().await;
    for _ in 0..64 {
        client
            .notify("ordinary/data", json!({"channel":"ahp-root://"}))
            .await
            .unwrap();
    }
    let child = client.clone();
    let shutdown = tokio::spawn(async move { child.shutdown().await });
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(11)).await;
    shutdown.await.unwrap();
    assert!(dropped.load(Ordering::Acquire));
    assert!(events.recv().await.is_none());
    assert!(subscription.recv().await.is_none());
}
