#![allow(clippy::panic, clippy::unwrap_used)]

use super::*;
use crate::BoxedTransport;

struct TestTransport {
    sent: mpsc::Sender<TransportMessage>,
    received: mpsc::Receiver<TransportMessage>,
}

impl Transport for TestTransport {
    async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
        self.sent
            .send(message)
            .await
            .map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        Ok(self.received.recv().await)
    }
}

async fn client(
    timeout: Option<Duration>,
) -> (
    Client,
    mpsc::Receiver<TransportMessage>,
    mpsc::Sender<TransportMessage>,
) {
    let (sent, rx) = mpsc::channel(1);
    let (tx, received) = mpsc::channel(1);
    let client = Client::connect(
        BoxedTransport::new(TestTransport { sent, received }),
        ClientConfig {
            default_request_timeout: timeout,
            keepalive: None,
            ..ClientConfig::default()
        },
    )
    .await
    .unwrap();
    (client, rx, tx)
}

#[tokio::test]
async fn cancelled_and_timed_out_requests_remove_pending_entries() {
    let (client, mut sent, _received) = client(None).await;
    let mut request = Box::pin(client.ping());
    tokio::select! {
        result = &mut request => panic!("premature result: {result:?}"),
        _ = sent.recv() => {},
    }
    assert_eq!(client.shared.pending.lock().unwrap().len(), 1);
    drop(request);
    assert!(client.shared.pending.lock().unwrap().is_empty());
    drop(client);
    assert!(sent.recv().await.is_none());

    let (client, mut sent, _received) = self::client(Some(Duration::ZERO)).await;
    assert!(matches!(client.ping().await, Err(ClientError::Cancelled)));
    assert!(client.shared.pending.lock().unwrap().is_empty());
    assert!(sent.recv().await.is_some());
    drop(client);
    assert!(sent.recv().await.is_none());
}

#[tokio::test]
async fn request_id_exhaustion_never_wraps_or_enqueues_another_request() {
    let (client, mut sent, _received) = client(Some(Duration::ZERO)).await;
    *client.shared.request_ids.next.lock().unwrap() = Some(u64::MAX);
    assert!(matches!(client.ping().await, Err(ClientError::Cancelled)));
    let JsonRpcMessage::Request(request) = sent.recv().await.unwrap().into_parsed().unwrap() else {
        panic!("expected request");
    };
    assert_eq!(request.id, u64::MAX);
    for _ in 0..2 {
        assert!(
            matches!(client.ping().await, Err(ClientError::Transport(TransportError::Protocol(message))) if message == "request ID space exhausted")
        );
        assert!(client.shared.pending.lock().unwrap().is_empty());
        assert!(sent.try_recv().is_err());
    }
    client.shutdown().await;
    assert!(matches!(client.ping().await, Err(ClientError::Shutdown)));
    drop(client);
    assert!(sent.recv().await.is_none());
}

#[tokio::test(start_paused = true)]
async fn automatic_ping_and_driver_do_not_outlive_client_or_retain_pending_entries() {
    let (sent, mut rx) = mpsc::channel(1);
    let (_tx, received) = mpsc::channel(1);
    let client = Client::connect(TestTransport { sent, received }, ClientConfig::default())
        .await
        .unwrap();
    let shared = Arc::downgrade(&client.shared);
    let ids = Arc::downgrade(&client.shared.request_ids);
    let request = rx.recv().await.unwrap().into_parsed().unwrap();
    assert!(matches!(request, JsonRpcMessage::Request(request) if request.method == "ping"));
    assert_eq!(client.shared.pending.lock().unwrap().len(), 1);
    let clone = client.clone();
    drop(client);
    assert!(shared.upgrade().is_some());
    drop(clone);
    assert!(rx.recv().await.is_none());
    assert!(shared.upgrade().is_none());
    assert!(ids.upgrade().is_none());
}

#[tokio::test(start_paused = true)]
async fn inbound_activity_retires_automatic_pending_ping() {
    let (sent, mut rx) = mpsc::channel(1);
    let (tx, received) = mpsc::channel(1);
    let client = Client::connect(TestTransport { sent, received }, ClientConfig::default())
        .await
        .unwrap();
    assert!(rx.recv().await.is_some());
    assert_eq!(client.shared.pending.lock().unwrap().len(), 1);
    tx.send(TransportMessage::Text(
        r#"{"jsonrpc":"2.0","method":"activity"}"#.into(),
    ))
    .await
    .unwrap();
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
    assert!(client.shared.pending.lock().unwrap().is_empty());
    client.shutdown().await;
    assert!(rx.recv().await.is_none());
}

#[tokio::test(start_paused = true)]
async fn automatic_ping_exhaustion_fails_connection_without_id_reuse() {
    let (sent, mut rx) = mpsc::channel(1);
    let (_tx, received) = mpsc::channel(1);
    let client = Client::connect(TestTransport { sent, received }, ClientConfig::default())
        .await
        .unwrap();
    *client.shared.request_ids.next.lock().unwrap() = None;
    assert!(rx.recv().await.is_none());
    assert!(client.shared.pending.lock().unwrap().is_empty());
    assert!(matches!(client.ping().await, Err(ClientError::Shutdown)));
}

struct BlockedTransport {
    entered: Option<oneshot::Sender<()>>,
    dropped: Option<oneshot::Sender<()>>,
}

impl Transport for BlockedTransport {
    async fn send(&mut self, _: TransportMessage) -> Result<(), TransportError> {
        self.entered.take().unwrap().send(()).unwrap();
        std::future::pending().await
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        std::future::pending().await
    }
}

impl Drop for BlockedTransport {
    fn drop(&mut self) {
        self.dropped.take().unwrap().send(()).unwrap();
    }
}

#[tokio::test(start_paused = true)]
async fn stalled_send_is_interrupted_by_shutdown_or_liveness_timeout() {
    for shutdown in [false, true] {
        let (entered, send_started) = oneshot::channel();
        let (dropped, transport_dropped) = oneshot::channel();
        let client = Client::connect(
            BlockedTransport {
                entered: Some(entered),
                dropped: Some(dropped),
            },
            ClientConfig::default(),
        )
        .await
        .unwrap();
        let mut events = client.events();
        client.notify("block", ()).await.unwrap();
        send_started.await.unwrap();
        if shutdown {
            // Full outbound queue must not trap graceful shutdown either.
            for _ in 0..64 {
                client.notify("queued", ()).await.unwrap();
            }

            client.shutdown().await;
        } else {
            tokio::time::advance(Duration::from_secs(90)).await;
        }
        assert!(events.recv().await.is_none());
        transport_dropped.await.unwrap();
        assert!(client.shared.pending.lock().unwrap().is_empty());
    }
}

struct StalledCloseTransport {
    dropped: Option<oneshot::Sender<()>>,
}

impl Transport for StalledCloseTransport {
    async fn send(&mut self, _: TransportMessage) -> Result<(), TransportError> {
        Ok(())
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        std::future::pending().await
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        std::future::pending().await
    }
}

impl Drop for StalledCloseTransport {
    fn drop(&mut self) {
        self.dropped.take().unwrap().send(()).unwrap();
    }
}

#[tokio::test(start_paused = true)]
async fn stalled_close_is_bounded_without_trapping_shutdown_or_receivers() {
    let (dropped, mut transport_dropped) = oneshot::channel();
    let client = Client::connect(
        StalledCloseTransport {
            dropped: Some(dropped),
        },
        ClientConfig::default(),
    )
    .await
    .unwrap();
    let mut events = client.events();
    client.shutdown().await;
    assert!(events.recv().await.is_none());
    assert!(transport_dropped.try_recv().is_err());
    tokio::time::advance(Duration::from_secs(5)).await;
    transport_dropped.await.unwrap();
    assert!(client.shared.pending.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn blocked_write_watchdog_starts_with_send_not_the_last_inbound_deadline() {
    let (entered, send_started) = oneshot::channel();
    let (dropped, mut transport_dropped) = oneshot::channel();
    let client = Client::connect(
        BlockedTransport {
            entered: Some(entered),
            dropped: Some(dropped),
        },
        ClientConfig::default(),
    )
    .await
    .unwrap();
    tokio::time::advance(Duration::from_secs(25)).await;
    client.notify("block", ()).await.unwrap();
    send_started.await.unwrap();
    tokio::time::advance(Duration::from_secs(65)).await;
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
    assert!(
        transport_dropped.try_recv().is_err(),
        "write must not reuse old inbound-silence deadline"
    );
    tokio::time::advance(Duration::from_secs(25)).await;
    transport_dropped.await.unwrap();
}
