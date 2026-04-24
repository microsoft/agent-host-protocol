//! WebSocket transport implementation built on `tokio-tungstenite`.

use ahp::{Transport, TransportError, TransportMessage};
use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use thiserror::Error;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tokio::net::TcpStream;
use url::Url;

/// Errors that can occur while building a [`WebSocketTransport`].
#[derive(Debug, Error)]
pub enum WebSocketTransportError {
    /// The URL could not be parsed.
    #[error("invalid url: {0}")]
    InvalidUrl(#[from] url::ParseError),
    /// The underlying WebSocket handshake or I/O failed.
    #[error("websocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),
}

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// A [`Transport`] backed by a `tokio-tungstenite` WebSocket stream.
///
/// Connect with [`WebSocketTransport::connect`] for the common case, or
/// pass an existing [`WebSocketStream`] to [`WebSocketTransport::from_stream`]
/// when you need custom connection options.
pub struct WebSocketTransport {
    inner: WsStream,
}

impl WebSocketTransport {
    /// Open a new WebSocket connection to `url`.
    pub async fn connect(url: &str) -> Result<Self, WebSocketTransportError> {
        let _parsed = Url::parse(url)?; // validate early
        let (stream, _resp) = connect_async(url).await?;
        Ok(Self { inner: stream })
    }

    /// Wrap an already-connected WebSocket stream.
    pub fn from_stream(inner: WsStream) -> Self {
        Self { inner }
    }
}

#[async_trait]
impl Transport for WebSocketTransport {
    async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError> {
        let frame = match msg {
            TransportMessage::Parsed(m) => {
                let s = serde_json::to_string(&m)
                    .map_err(|e| TransportError::Protocol(e.to_string()))?;
                Message::Text(s)
            }
            TransportMessage::Text(s) => Message::Text(s),
            TransportMessage::Binary(b) => Message::Binary(b),
        };
        self.inner
            .send(frame)
            .await
            .map_err(|e| TransportError::Io(e.to_string()))
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        loop {
            match self.inner.next().await {
                None => return Ok(None),
                Some(Err(e)) => return Err(TransportError::Io(e.to_string())),
                Some(Ok(Message::Text(s))) => return Ok(Some(TransportMessage::Text(s))),
                Some(Ok(Message::Binary(b))) => return Ok(Some(TransportMessage::Binary(b))),
                Some(Ok(Message::Close(_))) => return Ok(None),
                // Ping, Pong, Frame: keep looping, tungstenite handles protocol-level response.
                Some(Ok(_)) => continue,
            }
        }
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.inner
            .close(None)
            .await
            .map_err(|e| TransportError::Io(e.to_string()))
    }
}
