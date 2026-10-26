#![allow(clippy::unwrap_used)]
use ahp::Transport;
use ahp_ws::WebSocketTransport;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::protocol::{Role, WebSocketConfig};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

#[tokio::test]
async fn effective_websocket_limits_are_converted_conservatively() {
    for (config, expected) in [
        (WebSocketConfig::default(), 11_184_810),
        (
            WebSocketConfig::default()
                .max_frame_size(Some(6144))
                .max_message_size(Some(3072)),
            2048,
        ),
        (
            WebSocketConfig::default()
                .max_frame_size(None)
                .max_message_size(Some(1536)),
            1024,
        ),
        (
            WebSocketConfig::default()
                .max_frame_size(None)
                .max_message_size(None),
            1_048_576,
        ),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let (client, server) = tokio::join!(
            TcpStream::connect(listener.local_addr().unwrap()),
            listener.accept()
        );
        let stream = WebSocketStream::from_raw_socket(
            MaybeTlsStream::Plain(client.unwrap()),
            Role::Client,
            Some(config),
        )
        .await;
        let transport = WebSocketTransport::from_stream(stream);
        assert!(transport.window_capabilities().raw_text);
        assert_eq!(
            transport.window_capabilities().maximum_frame_bytes,
            Some(expected)
        );
        drop(server);
    }
}

#[tokio::test]
async fn configured_transport_accepts_non_ascii_safe_bound() {
    use futures_util::SinkExt;
    use tokio_tungstenite::tungstenite::Message;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let host = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let mut stream = tokio_tungstenite::accept_async(socket).await.unwrap();
        stream
            .send(Message::Text(
                format!("{{\"text\":\"{}\"}}", "漢".repeat(400)).into(),
            ))
            .await
            .unwrap();
    });
    let config = WebSocketConfig::default()
        .max_frame_size(Some(1536))
        .max_message_size(Some(1536));
    let mut transport = WebSocketTransport::connect_with_config(&format!("ws://{address}"), config)
        .await
        .unwrap();
    assert_eq!(
        transport.window_capabilities().maximum_frame_bytes,
        Some(1024)
    );
    let ahp::TransportMessage::Text(text) = transport.recv().await.unwrap().unwrap() else {
        unreachable!()
    };
    assert!(ahp::windowing::utf16_bytes(&text) <= 1024);
    assert!(text.len() > 1024);
    host.await.unwrap();
}
