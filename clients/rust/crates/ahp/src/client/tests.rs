#![allow(clippy::panic, clippy::unwrap_used)]

use super::*;
use crate::error::TransportError;
use std::task::Poll;

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

fn pending_ids(client: &Client) -> Vec<u64> {
    client
        .shared
        .pending
        .lock()
        .unwrap()
        .keys()
        .copied()
        .collect()
}

async fn poll_pending(future: Pin<&mut impl Future>) {
    let mut future = future;
    std::future::poll_fn(|cx| {
        assert!(future.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
}

async fn next_request(peer: &mut MemTransport) -> JsonRpcRequest {
    let wire = tokio::time::timeout(Duration::from_secs(2), peer.recv())
        .await
        .expect("request not sent")
        .unwrap()
        .unwrap();
    let JsonRpcMessage::Request(request) = wire.into_parsed().unwrap() else {
        panic!("expected request");
    };
    request
}

fn response(id: u64) -> JsonRpcMessage {
    JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
        jsonrpc: JsonRpcVersion::V2,
        id,
        result: serde_json::json!({"ok": true}),
    })
}

async fn assert_usable(client: &Client, peer: &mut MemTransport) {
    let mut request = Box::pin(client.request::<_, Value>("next", ()));
    poll_pending(request.as_mut()).await;
    let sent = next_request(peer).await;
    peer.send(TransportMessage::Parsed(response(sent.id)))
        .await
        .unwrap();
    let value = tokio::time::timeout(Duration::from_secs(2), request)
        .await
        .expect("response not delivered")
        .unwrap();
    assert_eq!(value, serde_json::json!({"ok": true}));
    assert!(pending_ids(client).is_empty());
}

#[tokio::test]
async fn abort_sent_request_cleans_pending_with_silent_open_peer() {
    for timeout in [ClientConfig::default().default_request_timeout, None] {
        let (transport, mut peer) = pair();
        let client = Client::connect(
            transport,
            ClientConfig {
                default_request_timeout: timeout,
                ..ClientConfig::default()
            },
        )
        .await
        .unwrap();
        let task = tokio::spawn({
            let client = client.clone();
            async move { client.request::<_, Value>("cancel", ()).await }
        });
        let sent = next_request(&mut peer).await;
        assert_eq!(pending_ids(&client), vec![sent.id]);

        // Keep another request registered to catch cleanup of the wrong entry.
        let mut survivor = Box::pin(client.request::<_, Value>("survivor", ()));
        poll_pending(survivor.as_mut()).await;
        let surviving = next_request(&mut peer).await;
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(pending_ids(&client), vec![surviving.id]);

        // No reply or transport closure was needed to remove the cancelled entry.
        peer.send(TransportMessage::Parsed(response(sent.id)))
            .await
            .unwrap();
        peer.send(TransportMessage::Parsed(response(surviving.id)))
            .await
            .unwrap();
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(2), survivor)
                .await
                .unwrap()
                .unwrap(),
            serde_json::json!({"ok": true})
        );
        assert_usable(&client, &mut peer).await;
        client.shutdown().await;
    }
}

#[tokio::test]
async fn drop_request_blocked_on_outbound_admission_cleans_pending() {
    let (transport, mut peer) = pair();
    let client = Client::connect(transport, ClientConfig::default())
        .await
        .unwrap();

    // Reserve all slots without queuing messages so the driver cannot free them.
    let mut permits = Vec::new();
    for _ in 0..client.shared.outbound.max_capacity() {
        permits.push(client.shared.outbound.reserve().await.unwrap());
    }
    let mut request = Box::pin(client.request::<_, Value>("cancel", ()));
    poll_pending(request.as_mut()).await;
    assert_eq!(client.shared.outbound.capacity(), 0);
    assert_eq!(pending_ids(&client).len(), 1);
    drop(request);
    assert!(pending_ids(&client).is_empty());
    assert_eq!(client.shared.outbound.capacity(), 0);
    assert!(matches!(
        peer.rx.try_recv(),
        Err(mpsc::error::TryRecvError::Empty)
    ));

    drop(permits);
    assert_usable(&client, &mut peer).await;
    client.shutdown().await;
}

#[tokio::test]
async fn request_timeout_preserves_error_and_cleans_pending() {
    let (transport, mut peer) = pair();
    let client = Client::connect(
        transport,
        ClientConfig {
            default_request_timeout: Some(Duration::from_millis(1)),
            ..ClientConfig::default()
        },
    )
    .await
    .unwrap();
    let mut request = Box::pin(client.request::<_, Value>("timeout", ()));
    poll_pending(request.as_mut()).await;
    next_request(&mut peer).await;
    assert!(matches!(request.await, Err(ClientError::Cancelled)));
    assert!(pending_ids(&client).is_empty());
    client.shutdown().await;
}

#[tokio::test]
async fn outbound_closed_preserves_shutdown_error_and_cleans_pending() {
    let (transport, _peer) = pair();
    let client = Client::connect(transport, ClientConfig::default())
        .await
        .unwrap();
    let driver = client._reader.handle.lock().await.take().unwrap();
    driver.abort();
    assert!(driver.await.unwrap_err().is_cancelled());

    assert!(matches!(
        client.request::<_, Value>("closed", ()).await,
        Err(ClientError::Shutdown)
    ));
    assert!(pending_ids(&client).is_empty());
}

#[tokio::test]
async fn request_preserves_rpc_and_decode_errors() {
    let (transport, mut peer) = pair();
    let client = Client::connect(transport, ClientConfig::default())
        .await
        .unwrap();
    let mut request = Box::pin(client.request::<_, Value>("unknown", ()));
    poll_pending(request.as_mut()).await;
    let sent = next_request(&mut peer).await;
    dispatch_inbound(
        &client.shared,
        JsonRpcMessage::ErrorResponse(JsonRpcErrorResponse {
            jsonrpc: JsonRpcVersion::V2,
            id: sent.id,
            error: method_not_found("unknown"),
        }),
    )
    .await;
    assert!(matches!(
        request.await,
        Err(ClientError::Rpc(error)) if error.code == json_rpc_error_codes::METHOD_NOT_FOUND
    ));
    assert!(pending_ids(&client).is_empty());

    let mut request = Box::pin(client.request::<_, String>("invalid", ()));
    poll_pending(request.as_mut()).await;
    let sent = next_request(&mut peer).await;
    dispatch_inbound(&client.shared, response(sent.id)).await;
    assert!(matches!(
        request.await,
        Err(ClientError::Deserialization(_))
    ));
    assert!(pending_ids(&client).is_empty());
    assert_usable(&client, &mut peer).await;
    client.shutdown().await;
}

#[tokio::test]
async fn response_before_request_drop_keeps_other_request_pending() {
    for error_response in [false, true] {
        let (transport, mut peer) = pair();
        let client = Client::connect(transport, ClientConfig::default())
            .await
            .unwrap();
        let mut request = Box::pin(client.request::<_, Value>("cancel", ()));
        poll_pending(request.as_mut()).await;
        let sent = next_request(&mut peer).await;
        let mut survivor = Box::pin(client.request::<_, Value>("survivor", ()));
        poll_pending(survivor.as_mut()).await;
        let surviving = next_request(&mut peer).await;

        let reply = if error_response {
            JsonRpcMessage::ErrorResponse(JsonRpcErrorResponse {
                jsonrpc: JsonRpcVersion::V2,
                id: sent.id,
                error: method_not_found("cancel"),
            })
        } else {
            response(sent.id)
        };
        dispatch_inbound(&client.shared, reply).await;
        drop(request);
        assert_eq!(pending_ids(&client), vec![surviving.id]);
        drop(survivor);
        assert!(pending_ids(&client).is_empty());
        client.shutdown().await;
    }
}

#[tokio::test]
async fn shutdown_and_request_drop_can_happen_in_either_order() {
    for drop_first in [false, true] {
        let (transport, mut peer) = pair();
        let client = Client::connect(transport, ClientConfig::default())
            .await
            .unwrap();
        let mut request = Box::pin(client.request::<_, Value>("cancel", ()));
        poll_pending(request.as_mut()).await;
        next_request(&mut peer).await;
        if drop_first {
            drop(request);
            assert!(pending_ids(&client).is_empty());
            client.shutdown().await;
        } else {
            client.shutdown().await;
            assert!(pending_ids(&client).is_empty());
            drop(request);
        }
        assert!(pending_ids(&client).is_empty());
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn abort_request_racing_response_or_shutdown_cleans_pending() {
    for shutdown in [false, true] {
        let (transport, mut peer) = pair();
        let client = Client::connect(transport, ClientConfig::default())
            .await
            .unwrap();
        let request = tokio::spawn({
            let client = client.clone();
            async move { client.request::<_, Value>("cancel", ()).await }
        });
        let sent = next_request(&mut peer).await;
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let completion = tokio::spawn({
            let client = client.clone();
            let barrier = barrier.clone();
            async move {
                barrier.wait().await;
                if shutdown {
                    client.shutdown().await;
                } else {
                    dispatch_inbound(&client.shared, response(sent.id)).await;
                }
            }
        });
        barrier.wait().await;
        request.abort();
        let result = request.await;
        assert!(result.is_ok() || result.unwrap_err().is_cancelled());
        tokio::time::timeout(Duration::from_secs(2), completion)
            .await
            .expect("completion blocked")
            .unwrap();
        assert!(pending_ids(&client).is_empty());
        if !shutdown {
            assert_usable(&client, &mut peer).await;
            client.shutdown().await;
        }
    }
}
