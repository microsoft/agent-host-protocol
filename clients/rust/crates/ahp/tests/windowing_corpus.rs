#![allow(clippy::unwrap_used, clippy::panic)]

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use ahp::transport::TransportMessage;
use ahp::{
    Client, Delivery, Transport, TransportError, WindowOptions, WindowedSubscription,
    WindowingConfig,
};
use serde_json::{json, Value};
use tokio::sync::{mpsc, Mutex, Notify};

struct MemoryTransport {
    inbound: mpsc::UnboundedReceiver<TransportMessage>,
    outbound: mpsc::UnboundedSender<String>,
    closed: Arc<Notify>,
}
impl Transport for MemoryTransport {
    fn window_capabilities(&self) -> ahp::WindowTransportCapabilities {
        ahp::WindowTransportCapabilities::default().raw_text(true)
    }
    async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
        let TransportMessage::Text(text) = message else {
            panic!("expected exact text")
        };
        self.outbound.send(text).map_err(|_| TransportError::Closed)
    }
    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        Ok(self.inbound.recv().await)
    }
    async fn close(&mut self) -> Result<(), TransportError> {
        self.closed.notify_one();
        Ok(())
    }
}
fn matches(actual: &Value, expected: &Value) -> bool {
    if let Some(object) = expected.as_object() {
        object.iter().all(|(key, expected)| {
            actual
                .get(key)
                .is_some_and(|value| matches(value, expected))
        })
    } else {
        actual == expected
    }
}
fn corpus() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../types/test-cases/windowed-delivery")
}
#[tokio::test]
async fn all_shared_sizes() {
    let data: Value =
        serde_json::from_str(&std::fs::read_to_string(corpus().join("sizes.json")).unwrap())
            .unwrap();
    for case in data["cases"].as_array().unwrap() {
        assert_eq!(
            ahp::windowing::utf16_bytes(case["text"].as_str().unwrap()),
            case["utf16Bytes"].as_u64().unwrap(),
            "{}",
            case["name"]
        );
    }
}
#[tokio::test]
async fn all_shared_scenarios() {
    let mut files: Vec<_> = std::fs::read_dir(corpus().join("scenarios"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    files.sort();
    assert_eq!(files.len(), 24);
    for file in files {
        let scenario: Value =
            serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        println!("scenario {}", file.display());
        tokio::time::timeout(Duration::from_secs(15), run_scenario(scenario))
            .await
            .unwrap_or_else(|_| panic!("scenario timed out: {}", file.display()));
    }
}
async fn run_scenario(scenario: Value) {
    let (host_tx, inbound) = mpsc::unbounded_channel();
    let (outbound, mut host_rx) = mpsc::unbounded_channel();
    let closed = Arc::new(Notify::new());
    let client = Client::builder()
        .windowing(
            WindowingConfig::default()
                .window_bytes(
                    scenario["windowing"]["windowBytes"]
                        .as_u64()
                        .unwrap_or(262_144),
                )
                .max_buffered_send_bytes(
                    scenario["windowing"]["maxBufferedSendBytes"]
                        .as_u64()
                        .unwrap_or(1_048_576),
                )
                .maximum_frame_bytes(
                    scenario["windowing"]["maximumFrameBytes"]
                        .as_u64()
                        .unwrap_or(16_384),
                ),
        )
        .connect(MemoryTransport {
            inbound,
            outbound,
            closed: closed.clone(),
        })
        .await
        .unwrap();
    let subscriptions: Arc<Mutex<HashMap<String, WindowedSubscription>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let mut tasks = vec![];
    let mut deliveries: HashMap<String, Vec<Option<Delivery>>> = HashMap::new();
    let mut manual = HashMap::new();
    let mut requests = VecDeque::new();
    let mut buffered = VecDeque::<Value>::new();
    let mut sent_totals = HashMap::<String, u64>::new();
    let mut frame_limits = HashMap::<String, u64>::new();
    for step in scenario["steps"].as_array().unwrap() {
        let uri = step["channel"].as_str().unwrap_or("").to_string();
        match step["op"].as_str().unwrap() {
            "subscribe" => {
                manual.insert(uri.clone(), step["receive"] == "manual");
                let client = client.clone();
                let subscriptions = subscriptions.clone();
                let window = step.get("window").cloned();
                let coalescing = step["coalescing"].as_bool().unwrap_or(true);
                tasks.push(tokio::spawn(async move {
                    if let Some(window) = window {
                        let mut options = WindowOptions::default().coalescing(coalescing);
                        if let Some(value) = window["windowBytes"].as_u64() {
                            options = options.window_bytes(value);
                        }
                        if let Some(value) = window["maximumFrameBytes"].as_u64() {
                            options = options.maximum_frame_bytes(value);
                        }
                        if let Ok((_, subscription)) =
                            client.subscribe_windowed(uri.clone(), options).await
                        {
                            subscriptions.lock().await.insert(uri, subscription);
                        }
                    } else {
                        let _ = client.subscribe(uri).await;
                    }
                }));
            }
            "respond" => {
                let position = requests
                    .iter()
                    .position(|request: &Value| request["method"] == step["to"])
                    .unwrap();
                let request = requests.remove(position).unwrap();
                if let Some(limit) = step
                    .pointer("/result/flowControl/hostReceive/maximumFrameBytes")
                    .and_then(Value::as_u64)
                {
                    frame_limits
                        .insert(request["params"]["channel"].as_str().unwrap().into(), limit);
                }
                host_tx
                    .send(TransportMessage::Text(
                        json!({"jsonrpc":"2.0","id":request["id"],"result":step["result"]})
                            .to_string(),
                    ))
                    .unwrap();
            }
            "hostSends" => {
                host_tx
                    .send(TransportMessage::Text(
                        step["text"].as_str().unwrap().into(),
                    ))
                    .unwrap();
            }
            "expectSent" => {
                let deadline = tokio::time::Instant::now() + Duration::from_secs(1);
                let mut joined = String::new();
                loop {
                    let value = if let Some(value) = buffered.pop_front() {
                        value
                    } else {
                        let text = tokio::time::timeout_at(deadline, host_rx.recv())
                            .await
                            .unwrap_or_else(|_| panic!("missing sent message {step}"))
                            .unwrap();
                        record(&text, &mut requests, &mut sent_totals)
                    };
                    if value["method"] == "channel/frame" && step["reassemble"] == true {
                        let channel = value["params"]["channel"].as_str().unwrap();
                        assert!(
                            ahp::windowing::utf16_bytes(&value.to_string())
                                <= frame_limits[channel]
                        );
                        joined.push_str(value["params"]["data"].as_str().unwrap());
                        if value["params"]["final"] != true {
                            continue;
                        }
                        let joined: Value = serde_json::from_str(&joined).unwrap();
                        assert!(matches(&joined, &step["match"]), "{joined} != {step}");
                        break;
                    }
                    if matches(&value, &step["match"]) {
                        if let Some(absent) = step["absent"].as_array() {
                            for path in absent {
                                let pointer =
                                    format!("/{}", path.as_str().unwrap().replace('.', "/"));
                                assert!(value.pointer(&pointer).is_none());
                            }
                        }
                        break;
                    }
                    assert_eq!(
                        value["method"], "channel/credit",
                        "unexpected sent {value}; expected {step}"
                    );
                }
            }
            "expectNotSent" => {
                assert!(!buffered.iter().any(|value| matches(value, &step["match"])));
                let deadline = tokio::time::Instant::now()
                    + Duration::from_millis(step["withinMs"].as_u64().unwrap());
                while let Ok(Some(text)) = tokio::time::timeout_at(deadline, host_rx.recv()).await {
                    let value = record(&text, &mut requests, &mut sent_totals);
                    assert!(!matches(&value, &step["match"]), "unexpected sent {value}");
                    buffered.push_back(value);
                }
            }
            "next" => {
                if !manual[&uri] {
                    if let Some(previous) = deliveries.get_mut(&uri).and_then(|d| d.last_mut()) {
                        previous.take();
                    }
                }
                let delivery = tokio::time::timeout(Duration::from_secs(1), async {
                    loop {
                        let mut subscriptions = subscriptions.lock().await;
                        if let Some(subscription) = subscriptions.get_mut(&uri) {
                            break subscription.next().await.unwrap().unwrap();
                        }
                        drop(subscriptions);
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .unwrap();
                let value = serde_json::to_value(delivery.notification()).unwrap();
                assert!(
                    matches(&value, &step["expect"]),
                    "delivery {value} != {step}"
                );
                if let Some(bytes) = step["expectBytes"].as_u64() {
                    assert_eq!(delivery.wire_bytes(), bytes);
                }
                deliveries.entry(uri).or_default().push(Some(delivery));
            }
            "unsubscribe" => {
                client.unsubscribe(uri.clone()).await.unwrap();
                subscriptions.lock().await.remove(&uri);
                sent_totals.remove(&uri);
            }
            "advance" => {
                deliveries.get_mut(&uri).unwrap().last_mut().unwrap().take();
            }
            "release" => {
                deliveries.get_mut(&uri).unwrap()[step["index"].as_u64().unwrap() as usize]
                    .as_mut()
                    .unwrap()
                    .release();
            }
            "send" => {
                let sender = tokio::time::timeout(Duration::from_secs(1), async {
                    loop {
                        if let Some(subscription) = subscriptions.lock().await.get(&uri) {
                            break subscription.sender();
                        }
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .unwrap();
                let method = step["method"].as_str().unwrap().to_string();
                let params = step["params"].clone();
                tasks.push(tokio::spawn(async move {
                    sender.send(&method, params).await.unwrap();
                }));
                tokio::task::yield_now().await;
            }
            "hostCreditsAll" => {
                while let Ok(text) = host_rx.try_recv() {
                    buffered.push_back(record(&text, &mut requests, &mut sent_totals));
                }
                host_tx.send(TransportMessage::Text(json!({"jsonrpc":"2.0","method":"channel/credit","params":{"channel":uri,"consumedBytes":sent_totals.get(&uri).copied().unwrap_or(0)}}).to_string())).unwrap();
            }
            "expectStatus" => {
                tokio::time::timeout(Duration::from_secs(1), async {
                    loop {
                        if let Some(subscription) = subscriptions.lock().await.get(&uri) {
                            let status = serde_json::to_value(subscription.status()).unwrap();
                            if matches(&status, &step["match"]) {
                                break;
                            }
                        }
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .unwrap_or_else(|_| panic!("status mismatch {step}"));
            }
            "expectClosed" => {
                tokio::time::timeout(Duration::from_secs(1), closed.notified())
                    .await
                    .unwrap();
            }
            other => panic!("unsupported op {other}"),
        }
    }
    client.shutdown().await;
    for task in tasks {
        task.abort();
    }
}
fn record(text: &str, requests: &mut VecDeque<Value>, totals: &mut HashMap<String, u64>) -> Value {
    let value: Value = serde_json::from_str(text).unwrap();
    if value.get("id").is_some() && value.get("method").is_some() {
        requests.push_back(value.clone());
    } else if let Some(method) = value["method"].as_str() {
        if ahp_types::notifications::counts_against_window(method) {
            if let Some(channel) = value["params"]["channel"].as_str() {
                *totals.entry(channel.into()).or_default() += ahp::windowing::utf16_bytes(text);
            }
        }
    }
    value
}

#[tokio::test]
async fn managed_recovery_retains_queue_and_rebinds_sender() {
    for recovery in [
        "snapshot",
        "replay",
        "live",
        "dropped",
        "consumer-drop",
        "resubscribe-failed",
        "resubscribe-hung",
        "subscribe-hung",
    ] {
        managed_recovery(recovery).await;
    }
}

async fn managed_recovery(recovery: &'static str) {
    use ahp::hosts::{HostConfig, HostId, MultiHostClient, ReconnectPolicy};
    use ahp::transport::BoxedTransport;
    use std::sync::atomic::{AtomicUsize, Ordering};
    let attempts = Arc::new(AtomicUsize::new(0));
    let loss = Arc::new(Notify::new());
    let reconnect_gate = Arc::new(Notify::new());
    let records = Arc::new(Mutex::new(Vec::<(usize, Value)>::new()));
    let recovery_text = recovery;
    let factory = {
        let attempts = attempts.clone();
        let loss = loss.clone();
        let reconnect_gate = reconnect_gate.clone();
        let records = records.clone();
        move |_| {
            let attempt = attempts.fetch_add(1, Ordering::Relaxed);
            let loss = loss.clone();
            let reconnect_gate = reconnect_gate.clone();
            let records = records.clone();
            async move {
                if attempt > 0 {
                    reconnect_gate.notified().await;
                }
                let (in_tx, inbound) = mpsc::unbounded_channel();
                let (outbound, mut out_rx) = mpsc::unbounded_channel::<String>();
                tokio::spawn(async move {
                    let limits = json!({"clientReceive":{"windowBytes":1024,"maximumFrameBytes":1024},"hostReceive":{"windowBytes":128,"maximumFrameBytes":1024}});
                    loop {
                        let text = tokio::select! {
                            _ = loss.notified(), if attempt == 0 => break,
                            message = out_rx.recv() => match message { Some(text) => text, None => break },
                        };
                        let request: Value = serde_json::from_str(&text).unwrap();
                        records.lock().await.push((attempt, request.clone()));
                        if request.get("id").is_none() {
                            continue;
                        }
                        let resubscribing = recovery_text.starts_with("resubscribe-");
                        if (request["method"] == "reconnect" && resubscribing)
                            || (request["method"] == "subscribe"
                                && attempt > 0
                                && recovery_text == "resubscribe-failed")
                        {
                            in_tx.send(TransportMessage::Text(json!({"jsonrpc":"2.0","id":request["id"],"error":{"code":-32602,"message":"refused"}}).to_string())).unwrap();
                            continue;
                        }
                        if request["method"] == "subscribe"
                            && (recovery_text == "subscribe-hung"
                                || (attempt > 0 && recovery_text == "resubscribe-hung"))
                        {
                            continue;
                        }
                        let root =
                            json!({"resource":"ahp-root://","state":{"agents":[]},"fromSeq":1});
                        let uri = request["params"]["channel"].as_str().unwrap();
                        let result = match request["method"].as_str().unwrap() {
                            "initialize" => {
                                json!({"protocolVersion":"0.9.0","serverSeq":1,"snapshots":[root]})
                            }
                            "listSessions" => json!({"items":[]}),
                            "subscribe" => json!({"flowControl":limits}),
                            "reconnect" => {
                                if request["params"].get("windows").is_none() {
                                    in_tx.send(TransportMessage::Text(json!({"jsonrpc":"2.0","id":request["id"],"result":{"type":"snapshot","snapshots":[root]}}).to_string())).unwrap();
                                    continue;
                                }
                                let windows = if recovery_text == "dropped" {
                                    json!([])
                                } else {
                                    json!([{"channel":"ahp-terminal:/retained","flowControl":limits,"recovery":recovery_text}])
                                };
                                json!({"type":"snapshot","snapshots":[root],"windows":{"items":windows}})
                            }
                            _ => Value::Null,
                        };
                        in_tx
                            .send(TransportMessage::Text(
                                json!({"jsonrpc":"2.0","id":request["id"],"result":result})
                                    .to_string(),
                            ))
                            .unwrap();
                        if request["method"] == "subscribe" {
                            let snapshot = json!({"jsonrpc":"2.0","method":"channel/snapshot","params":{"channel":uri,"snapshot":{"resource":uri,"state":{},"fromSeq":1}}});
                            in_tx
                                .send(TransportMessage::Text(snapshot.to_string()))
                                .unwrap();
                            if !uri.starts_with("ahp-tcp:") {
                                in_tx.send(TransportMessage::Text(json!({"jsonrpc":"2.0","method":"action","params":{"channel":uri,"serverSeq":2,"action":{"type":"terminal/data","data":"retained"}}}).to_string())).unwrap();
                            }
                        } else if request["method"] == "reconnect"
                            && matches!(recovery_text, "snapshot" | "replay" | "live")
                        {
                            let value = if recovery_text == "snapshot" {
                                json!({"jsonrpc":"2.0","method":"channel/snapshot","params":{"channel":"ahp-terminal:/retained","snapshot":{"resource":"ahp-terminal:/retained","state":{},"fromSeq":3}}})
                            } else {
                                json!({"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-terminal:/retained","serverSeq":3,"action":{"type":"terminal/data","data":"new"}}})
                            };
                            in_tx
                                .send(TransportMessage::Text(value.to_string()))
                                .unwrap();
                        }
                    }
                });
                Ok(BoxedTransport::new(MemoryTransport {
                    inbound,
                    outbound,
                    closed: Arc::new(Notify::new()),
                }))
            }
        }
    };
    let host_id = HostId::new("window-host");
    let config = HostConfig::new(host_id.clone(), "window host", factory)
        .with_client_config(ahp::ClientConfig {
            default_request_timeout: None,
            ..Default::default()
        })
        .with_reconnect_policy(ReconnectPolicy::immediate_forever())
        .with_windowing(
            WindowingConfig::default()
                .window_bytes(1024)
                .maximum_frame_bytes(1024),
        );
    let (multi, _) = MultiHostClient::single(config).await.unwrap();
    tokio::time::timeout(Duration::from_secs(1), async {
        while multi.host(&host_id).await.unwrap().generation == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let mut telemetry = multi.flow_control_events();
    if recovery == "subscribe-hung" {
        let child = multi.clone();
        let child_id = host_id.clone();
        let subscribe = tokio::spawn(async move {
            child
                .subscribe_windowed(&child_id, "ahp-terminal:/hung", WindowOptions::default())
                .await
        });
        tokio::time::timeout(Duration::from_secs(1), async {
            while !records
                .lock()
                .await
                .iter()
                .any(|(_, request)| request["method"] == "subscribe")
            {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(1), multi.remove_host(&host_id))
            .await
            .unwrap()
            .unwrap();
        assert!(subscribe.await.unwrap().is_err());
        return;
    }
    let (_, mut subscription) = multi
        .subscribe_windowed(&host_id, "ahp-terminal:/retained", WindowOptions::default())
        .await
        .unwrap();
    assert_eq!(subscription.host_id(), Some(&host_id));
    let old_snapshot = subscription.next().await.unwrap().unwrap();
    let old_action = subscription.next().await.unwrap().unwrap();
    let (_, mut tcp) = multi
        .subscribe_windowed(&host_id, "ahp-tcp:/ephemeral", WindowOptions::default())
        .await
        .unwrap();
    let old_tcp = tcp.next().await.unwrap().unwrap();
    if recovery == "consumer-drop" {
        drop(subscription);
        tokio::time::timeout(Duration::from_secs(1), async {
            while multi
                .host(&host_id)
                .await
                .unwrap()
                .subscriptions
                .contains(&"ahp-terminal:/retained".into())
            {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        loss.notify_one();
        tokio::time::timeout(Duration::from_secs(1), async {
            while attempts.load(Ordering::Relaxed) < 2 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        reconnect_gate.notify_one();
        tokio::time::timeout(Duration::from_secs(1), async {
            while multi.host(&host_id).await.unwrap().generation < 2 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        let records = records.lock().await;
        let request = &records
            .iter()
            .find(|(attempt, request)| *attempt == 1 && request["method"] == "reconnect")
            .unwrap()
            .1;
        assert!(request["params"].get("windows").is_none());
        assert!(!request["params"]["subscriptions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|uri| uri == "ahp-terminal:/retained"));
        drop(records);
        drop(old_snapshot);
        drop(old_action);
        drop(old_tcp);
        multi.remove_host(&host_id).await.unwrap();
        return;
    }
    loss.notify_one();
    tokio::time::timeout(Duration::from_secs(1), async {
        while attempts.load(Ordering::Relaxed) < 2 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(10), subscription.next())
            .await
            .is_err()
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(10), subscription.wait_writable())
            .await
            .is_err()
    );
    reconnect_gate.notify_one();
    if recovery == "resubscribe-hung" {
        tokio::time::timeout(Duration::from_secs(1), async {
            while !records
                .lock()
                .await
                .iter()
                .any(|(attempt, request)| *attempt == 1 && request["method"] == "subscribe")
            {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(1), multi.remove_host(&host_id))
            .await
            .unwrap()
            .unwrap();
        return;
    }
    tokio::time::timeout(Duration::from_secs(1), async {
        while multi.host(&host_id).await.unwrap().generation < 2 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    drop(old_snapshot);
    drop(old_action);
    drop(old_tcp);
    assert!(tcp.next().await.unwrap().is_none());
    let recorded = records.lock().await.clone();
    let reconnect = recorded
        .iter()
        .find(|(attempt, value)| *attempt == 1 && value["method"] == "reconnect")
        .unwrap()
        .1
        .clone();
    assert_eq!(
        reconnect["params"]["windows"]["items"][0]["lastAppliedServerSeq"],
        2
    );
    assert!(!reconnect["params"]["subscriptions"]
        .as_array()
        .unwrap()
        .iter()
        .any(|uri| uri.as_str().unwrap().starts_with("ahp-tcp:")));
    if recovery == "dropped" || recovery == "resubscribe-failed" {
        assert!(subscription.next().await.is_err());
        assert!(!multi
            .host(&host_id)
            .await
            .unwrap()
            .subscriptions
            .contains(&"ahp-terminal:/retained".into()));
        if recovery == "resubscribe-failed" {
            assert_eq!(attempts.load(Ordering::Relaxed), 2);
            assert!(multi.host(&host_id).await.unwrap().state.is_connected());
            multi
                .client(&host_id)
                .await
                .unwrap()
                .raw_client()
                .ping()
                .await
                .unwrap();
        }
    } else {
        let delivery = tokio::time::timeout(Duration::from_secs(1), subscription.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(
            subscription.status().buffered_receive_bytes,
            delivery.wire_bytes()
        );
        let new_bytes = delivery.wire_bytes();
        drop(delivery);
        subscription
            .sender()
            .send(
                "custom/write",
                json!({"channel":"ahp-terminal:/retained","value":1}),
            )
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if records.lock().await.iter().any(|(attempt, value)| {
                    *attempt == 1
                        && value["method"] == "channel/credit"
                        && value["params"]["consumedBytes"] == new_bytes
                }) {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(records
            .lock()
            .await
            .iter()
            .any(|(attempt, value)| *attempt == 1 && value["method"] == "custom/write"));
    }
    let event = tokio::time::timeout(Duration::from_secs(1), telemetry.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(event.host_id, host_id);
    multi.remove_host(&host_id).await.unwrap();
}
