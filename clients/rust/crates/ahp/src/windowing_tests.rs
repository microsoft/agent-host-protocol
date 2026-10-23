#![allow(clippy::unwrap_used, clippy::panic)]
use super::*;

fn notification(uri: &str, method: &str, params: Value) -> JsonRpcNotification {
    let mut params = params;
    params["channel"] = uri.into();
    serde_json::from_value(json!({"jsonrpc":"2.0","method":method,"params":params})).unwrap()
}
fn engine(config: WindowingConfig) -> Engine {
    Engine::new(
        config,
        WindowTransportCapabilities::default().raw_text(true),
        256,
    )
}
fn accept(engine: &Engine, uri: &str, window: i64) {
    let offer = engine
        .prepare(uri, WindowOptions::default())
        .unwrap()
        .unwrap();
    let channel = engine.subscription(uri).unwrap();
    engine
        .install(
            &channel,
            Some(offer),
            Some(ChannelFlowControl {
                client_receive: ChannelReceiveLimits {
                    window_bytes: 1024,
                    maximum_frame_bytes: 1024,
                },
                host_receive: ChannelReceiveLimits {
                    window_bytes: window,
                    maximum_frame_bytes: 1024,
                },
            }),
            true,
        )
        .unwrap();
}

#[tokio::test]
async fn fair_fragment_scheduling_unicode_and_cancellation() {
    let engine = engine(WindowingConfig::default());
    accept(&engine, "ahp-terminal:/a", 128);
    accept(&engine, "ahp-terminal:/b", 128);
    let payload = "😀漢字\"\\\n".repeat(500);
    let a = notification("ahp-terminal:/a", "custom/data", json!({"text":payload}));
    let b = notification("ahp-terminal:/b", "custom/data", json!({"text":"small"}));
    let (tx, rx) = oneshot::channel();
    engine.enqueue(a.clone(), Some(tx)).await.unwrap();
    engine.enqueue(b, None).await.unwrap();
    let first = engine.next_send().unwrap().unwrap();
    let value: Value = serde_json::from_str(&first.text).unwrap();
    assert_eq!(value["params"]["channel"], "ahp-terminal:/a");
    assert_eq!(value["method"], "channel/frame");
    let mut joined = value["params"]["data"].as_str().unwrap().to_string();
    first.complete(Ok(()));
    let second = engine.next_send().unwrap().unwrap();
    let value: Value = serde_json::from_str(&second.text).unwrap();
    assert_eq!(value["params"]["channel"], "ahp-terminal:/b");
    second.complete(Ok(()));
    assert!(engine.next_send().unwrap().is_none());
    let mut rx = rx;
    assert!(rx.try_recv().is_err());
    loop {
        let sent = engine.subscription("ahp-terminal:/a").unwrap().lock().sent;
        engine
            .inbound(
                notification(
                    "ahp-terminal:/a",
                    "channel/credit",
                    json!({"consumedBytes":sent}),
                ),
                None,
            )
            .unwrap();
        let wire = engine.next_send().unwrap().unwrap();
        assert!(utf16_bytes(&wire.text) <= 1024);
        let value: Value = serde_json::from_str(&wire.text).unwrap();
        joined.push_str(value["params"]["data"].as_str().unwrap());
        let final_frame = value["params"]["final"] == true;
        wire.complete(Ok(()));
        if final_frame {
            break;
        }
    }
    assert_eq!(
        serde_json::from_str::<Value>(&joined).unwrap(),
        serde_json::to_value(a).unwrap()
    );
    rx.await.unwrap().unwrap();
    let channel = engine.subscription("ahp-terminal:/b").unwrap();
    let sent = channel.lock().sent;
    engine
        .inbound(
            notification(
                "ahp-terminal:/b",
                "channel/credit",
                json!({"consumedBytes":sent}),
            ),
            None,
        )
        .unwrap();
    let (tx, rx) = oneshot::channel();
    engine
        .enqueue(
            notification("ahp-terminal:/b", "custom/data", json!({"text":"cancel"})),
            Some(tx),
        )
        .await
        .unwrap();
    drop(rx);
    assert!(engine.next_send().unwrap().is_none());
    assert_eq!(channel.status.borrow().buffered_send_bytes, 0);
}

#[test]
fn custom_coalescers_validate_identity_and_preserve_credit() {
    let config = WindowingConfig::default().coalescer(
        |earlier: &JsonRpcNotification, later: &JsonRpcNotification, _: &CoalescingContext| {
            if earlier.method != "custom/amount" {
                return None;
            }
            let mut merged = later.clone();
            merged.params.as_mut()?["amount"] = (earlier.params.as_ref()?["amount"].as_i64()?
                + later.params.as_ref()?["amount"].as_i64()?)
            .into();
            Some(merged)
        },
    );
    let engine = engine(config);
    let uri = "ahp-terminal:/custom";
    accept(&engine, uri, 1024);
    engine
        .inbound(
            notification(
                uri,
                "channel/snapshot",
                json!({"snapshot":{"resource":uri,"state":{},"fromSeq":0}}),
            ),
            Some(300),
        )
        .unwrap();
    engine
        .inbound(
            notification(uri, "custom/amount", json!({"amount":2})),
            Some(214),
        )
        .unwrap();
    engine
        .inbound(
            notification(uri, "custom/amount", json!({"amount":3})),
            Some(220),
        )
        .unwrap();
    let channel = engine.subscription(uri).unwrap();
    let state = channel.lock();
    assert_eq!(state.received.len(), 2);
    let merged = state.received.back().unwrap();
    assert_eq!(merged.bytes, 434);
    assert_eq!(merged.release_bytes, 434);
    assert_eq!(merged.notification.params.as_ref().unwrap()["amount"], 5);
    drop(state);
    let invalid: Vec<Arc<dyn Coalescer>> = vec![Arc::new(
        |_: &JsonRpcNotification, later: &JsonRpcNotification, _: &CoalescingContext| {
            let mut value = later.clone();
            value.params.as_mut().unwrap()["channel"] = "ahp-terminal:/wrong".into();
            Some(value)
        },
    )];
    assert!(merge(
        &invalid,
        &notification(uri, "custom/amount", json!({"amount":1})),
        &notification(uri, "custom/amount", json!({"amount":2})),
        Direction::Receive
    )
    .is_none());
}

#[tokio::test]
async fn queue_bound_and_failed_resubscribe_preserve_options() {
    let engine = engine(WindowingConfig::default().max_buffered_send_bytes(512));
    let uri = "ahp-terminal:/bounded";
    accept(&engine, uri, 1);
    engine
        .enqueue(
            notification(uri, "custom/data", json!({"text":"x".repeat(512)})),
            None,
        )
        .await
        .unwrap();
    let channel = engine.subscription(uri).unwrap();
    assert!(channel.status.borrow().buffered_send_bytes > 512);
    engine
        .prepare(uri, WindowOptions::default().coalescing(false))
        .unwrap();
    engine.register_request(2, "subscribe", &mut json!({"channel":uri,"flowControl":{"receive":{"windowBytes":262144,"maximumFrameBytes":1048576}}})).unwrap();
    engine.failed_request(2);
    assert!(channel.lock().options.coalescing);
    assert!(channel.lock().limits.is_some());
}

#[test]
fn invalid_limits_and_fragment_flags_are_protocol_errors() {
    let engine = engine(WindowingConfig::default());
    for options in [
        WindowOptions::default().window_bytes(0),
        WindowOptions::default().maximum_frame_bytes(100),
        WindowOptions::default().window_bytes(SAFE_INTEGER + 1),
    ] {
        assert!(engine.prepare("ahp-terminal:/bad", options).is_err());
    }
    let uri = "ahp-terminal:/a";
    accept(&engine, uri, 1024);
    assert!(engine
        .inbound(
            notification(uri, "channel/frame", json!({"data":"x","final":0})),
            Some(240)
        )
        .is_err());
}

#[test]
fn transport_fallback_protects_initial_snapshot_in_lossy_queue() {
    let engine = Engine::new(
        WindowingConfig::default(),
        WindowTransportCapabilities::default(),
        1,
    );
    let uri = "ahp-terminal:/parsed";
    assert!(engine
        .prepare(uri, WindowOptions::default())
        .unwrap()
        .is_none());
    let mut request = json!({"channel":uri,"flowControl":{"receive":{"windowBytes":512,"maximumFrameBytes":1024}}});
    engine
        .register_request(1, "subscribe", &mut request)
        .unwrap();
    assert!(request.get("flowControl").is_none());
    engine
        .response(
            1,
            &json!({"snapshot":{"resource":uri,"state":{},"fromSeq":1}}),
        )
        .unwrap();
    for count in 0..10 {
        engine
            .inbound(
                notification(uri, "custom/data", json!({"count":count})),
                None,
            )
            .unwrap();
    }
    let channel = engine.subscription(uri).unwrap();
    let state = channel.lock();
    assert_eq!(state.received.len(), 2);
    assert_eq!(state.received[0].notification.method, "channel/snapshot");
    assert_eq!(
        state.received[1].notification.params.as_ref().unwrap()["count"],
        9
    );
    assert_eq!(
        channel.status.borrow().fallback_reason.as_deref(),
        Some("transport")
    );
}

#[tokio::test]
async fn cancelling_one_coalesced_send_preserves_other_sends() {
    let engine = engine(WindowingConfig::default());
    let uri = "ahp-tcp:/a";
    accept(&engine, uri, 1);
    let (keep_tx, keep_rx) = oneshot::channel();
    let (cancel_tx, cancel_rx) = oneshot::channel();
    engine
        .enqueue(
            notification(uri, "tcp/data", json!({"data":"aGVs"})),
            Some(keep_tx),
        )
        .await
        .unwrap();
    engine
        .enqueue(
            notification(uri, "tcp/data", json!({"data":"bG8="})),
            Some(cancel_tx),
        )
        .await
        .unwrap();
    assert_eq!(engine.subscription(uri).unwrap().lock().outgoing.len(), 1);
    drop(cancel_rx);
    let wire = engine.next_send().unwrap().unwrap();
    let value: Value = serde_json::from_str(&wire.text).unwrap();
    assert_eq!(value["params"]["data"], "aGVs");
    wire.complete(Ok(()));
    keep_rx.await.unwrap().unwrap();
    assert!(engine.next_send().unwrap().is_none());
}

#[test]
fn upgrading_ordinary_subscription_starts_new_owner_at_snapshot() {
    let engine = engine(WindowingConfig::default());
    let uri = "ahp-terminal:/upgrade";
    let offer = engine
        .prepare(uri, WindowOptions::default())
        .unwrap()
        .unwrap();
    let ordinary_action = notification(
        uri,
        "action",
        json!({"serverSeq":1,"action":{"type":"terminal/data","data":"old"}}),
    );
    assert!(engine
        .inbound(ordinary_action, Some(280))
        .unwrap()
        .is_some());
    let channel = engine.subscription(uri).unwrap();
    assert!(channel.lock().received.is_empty());
    engine
        .install(
            &channel,
            Some(offer),
            Some(ChannelFlowControl {
                client_receive: ChannelReceiveLimits {
                    window_bytes: 1024,
                    maximum_frame_bytes: 1024,
                },
                host_receive: ChannelReceiveLimits {
                    window_bytes: 1024,
                    maximum_frame_bytes: 1024,
                },
            }),
            true,
        )
        .unwrap();
    engine
        .inbound(
            notification(
                uri,
                "channel/snapshot",
                json!({"snapshot":{"resource":uri,"state":{},"fromSeq":2}}),
            ),
            Some(300),
        )
        .unwrap();
    assert_eq!(
        channel.lock().received.front().unwrap().notification.method,
        "channel/snapshot"
    );
}

#[test]
fn cancelled_negotiation_bookkeeping_is_bounded_and_pruned() {
    let engine = engine(WindowingConfig::default());
    for id in 0..256 {
        let uri = format!("ahp-terminal:/cancel-{id}");
        let offer = engine
            .prepare(&uri, WindowOptions::default())
            .unwrap()
            .unwrap();
        engine
            .register_request(
                id,
                "subscribe",
                &mut json!({"channel":uri,"flowControl":{"receive":offer}}),
            )
            .unwrap();
        engine.request_sent(id);
        engine.expire_request(id);
        assert!(!engine.has_subscriptions());
    }
    assert_eq!(engine.lock().pending.len(), 256);
    assert!(engine
        .prepare("ahp-terminal:/bounded", WindowOptions::default())
        .is_err());
    for id in 0..256 {
        engine.failed_request(id);
    }
    assert!(engine.lock().pending.is_empty());
    for _ in 0..100 {
        accept(&engine, "ahp-terminal:/same", 1024);
        engine.remove_and("ahp-terminal:/same", None, || {});
    }
    assert!(!engine.has_subscriptions());
    assert!(engine.lock().pending.is_empty());
}

#[tokio::test(start_paused = true)]
async fn unsubscribe_clears_credit_timers_and_old_receipts_cannot_credit_replacements() {
    let engine = engine(WindowingConfig::default());
    let uri = "ahp-terminal:/pending";
    accept(&engine, uri, 1024);
    let channel = engine.subscription(uri).unwrap();
    let snapshot = notification(
        uri,
        "channel/snapshot",
        json!({"snapshot":{"resource":uri,"state":{},"fromSeq":0}}),
    );
    engine.inbound(snapshot, Some(300)).unwrap();
    fn take(channel: &Arc<Channel>) -> Delivery {
        let item = channel.lock().received.pop_front().unwrap();
        Delivery {
            event: crate::client::decode_notification(item.notification.clone()).unwrap(),
            notification: item.notification,
            bytes: item.bytes,
            release_bytes: item.release_bytes,
            epoch: item.epoch,
            channel: channel.clone(),
        }
    }
    take(&channel).release();
    engine.next_send().unwrap().unwrap().complete(Ok(()));
    for _ in 0..2 {
        let note = notification(uri, "n", json!({}));
        let bytes = utf16_bytes(&serde_json::to_string(&note).unwrap());
        assert!(bytes < 256);
        engine.inbound(note, Some(bytes)).unwrap();
    }
    take(&channel).release();
    let mut old = take(&channel);
    assert!(engine.next_send().unwrap().is_none());
    assert!(channel.lock().credit_since.is_some());
    engine.remove_and(uri, None, || {});
    assert!(channel.lock().credit_since.is_none());
    let released = channel.lock().released;
    old.release();
    assert_eq!(channel.lock().released, released);
    tokio::time::advance(std::time::Duration::from_millis(10)).await;
    assert!(engine.next_send().unwrap().is_none());
    accept(&engine, uri, 1024);
    let current = engine.subscription(uri).unwrap();
    assert!(!Arc::ptr_eq(&current, &channel));
    assert_eq!(current.lock().received_bytes, 0);
    assert_eq!(current.lock().released, 0);
}
