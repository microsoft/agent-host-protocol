//! WebSocket transport implementation built on `tokio-tungstenite`.

use ahp::{Transport, TransportError, TransportMessage};
use futures_util::{SinkExt, StreamExt};
use thiserror::Error;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
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
/// Use [`WebSocketTransport::connect`] for the common case, or
/// [`WebSocketTransport::from_stream`] when you need custom connection
/// options (custom TLS configuration, additional headers, etc.).
///
/// # Example
///
/// ```no_run
/// use ahp::{Client, ClientConfig};
/// use ahp_ws::WebSocketTransport;
///
/// # async fn run() -> Result<(), Box<dyn std::error::Error>> {
/// let transport = WebSocketTransport::connect("ws://localhost:12345").await?;
/// let client = Client::connect(transport, ClientConfig::default()).await?;
/// client.initialize("demo".into(), 1, vec![]).await?;
/// # Ok(()) }
/// ```
pub struct WebSocketTransport {
    inner: WsStream,
}

impl WebSocketTransport {
    /// Open a new WebSocket connection to `url`.
    ///
    /// Both `ws://` and `wss://` schemes are accepted; TLS is handled
    /// transparently via `native-tls`. The URL is parsed eagerly so
    /// malformed URLs surface as
    /// [`WebSocketTransportError::InvalidUrl`] before any network I/O.
    pub async fn connect(url: &str) -> Result<Self, WebSocketTransportError> {
        let _parsed = Url::parse(url)?; // validate early
        let (stream, _resp) = connect_async(url).await?;
        Ok(Self { inner: stream })
    }

    /// Wrap an already-connected WebSocket stream.
    ///
    /// Use this when you need to drive the `tokio-tungstenite`
    /// handshake yourself — for custom TLS configuration, request
    /// headers, or to reuse an existing socket.
    pub fn from_stream(inner: WsStream) -> Self {
        Self { inner }
    }
}

impl Transport for WebSocketTransport {
    async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError> {
        let frame = match msg {
            TransportMessage::Parsed(m) => {
                let s = serde_json::to_string(&m)
                    .map_err(|e| TransportError::Protocol(e.to_string()))?;
                Message::Text(s.into())
            }
            TransportMessage::Text(s) => Message::Text(s.into()),
            TransportMessage::Binary(b) => Message::Binary(b.into()),
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
                Some(Ok(Message::Text(s))) => {
                    return Ok(Some(TransportMessage::Text(s.to_string())))
                }
                Some(Ok(Message::Binary(b))) => {
                    return Ok(Some(TransportMessage::Binary(b.into())))
                }
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
