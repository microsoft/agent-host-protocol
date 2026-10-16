//! Transport abstraction.
//!
//! The SDK is deliberately transport-agnostic. Any framed byte stream —
//! WebSocket, raw TCP, Unix socket, stdio, an in-memory pair for tests —
//! can back a [`Transport`] implementation. The client consumes typed
//! [`TransportMessage`]s; framing and TLS are the transport's concern.
//!
//! # Implementing a transport
//!
//! Three async methods are required: [`Transport::send`],
//! [`Transport::recv`], and (optionally) [`Transport::close`]. The
//! crate uses the `impl Future` form of async-fn-in-trait, so no
//! dynamic dispatch box is required.
//!
//! ```
//! use ahp::{Transport, TransportError, TransportMessage};
//! use std::future::Future;
//! use tokio::sync::mpsc;
//!
//! /// One half of an in-memory transport pair — handy for tests.
//! pub struct MemTransport {
//!     tx: mpsc::Sender<TransportMessage>,
//!     rx: mpsc::Receiver<TransportMessage>,
//! }
//!
//! impl Transport for MemTransport {
//!     async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError> {
//!         self.tx.send(msg).await.map_err(|_| TransportError::Closed)
//!     }
//!     async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
//!         Ok(self.rx.recv().await)
//!     }
//! }
//! ```
//!
//! For ready-made transports, see the [`ahp-ws`](https://docs.rs/ahp-ws)
//! crate (WebSocket via `tokio-tungstenite`).
//!
//! # Type-erased transports
//!
//! [`Transport`] is intentionally generic and not object-safe — the
//! `impl Future` returns let it stay zero-cost on the hot path. When you
//! need to store transports of different concrete types behind one
//! handle (a registry of hosts, a transport factory that picks WebSocket
//! vs stdio at runtime, etc.), wrap each one in [`BoxedTransport`]:
//!
//! ```no_run
//! # use ahp::transport::BoxedTransport;
//! # use ahp::TransportError;
//! # async fn open_a() -> Result<BoxedTransport, TransportError> { unimplemented!() }
//! # async fn open_b() -> Result<BoxedTransport, TransportError> { unimplemented!() }
//! # async fn run() -> Result<(), TransportError> {
//! let transports: Vec<BoxedTransport> = vec![
//!     open_a().await?,
//!     open_b().await?,
//! ];
//! # let _ = transports;
//! # Ok(()) }
//! ```
//!
//! `BoxedTransport` itself implements [`Transport`], so it can be passed
//! straight to [`crate::Client::connect`].

use std::future::Future;
use std::pin::Pin;

use crate::error::TransportError;
use ahp_types::messages::JsonRpcMessage;

/// A single message flowing in or out over a [`Transport`].
///
/// This is a thin wrapper around [`JsonRpcMessage`] so transports can
/// avoid re-serializing when they already have a decoded value, while
/// remaining free to hand us raw bytes if that's more natural.
#[derive(Debug, Clone, PartialEq)]
pub enum TransportMessage {
    /// A pre-decoded JSON-RPC message.
    Parsed(JsonRpcMessage),
    /// A text frame whose payload is a JSON-RPC message encoded as
    /// UTF-8. The client will parse it.
    Text(String),
    /// A binary frame carrying a JSON-RPC message encoded as UTF-8.
    Binary(Vec<u8>),
}

impl TransportMessage {
    /// Decode this message into a typed [`JsonRpcMessage`].
    pub fn into_parsed(self) -> Result<JsonRpcMessage, TransportError> {
        match self {
            TransportMessage::Parsed(m) => Ok(m),
            TransportMessage::Text(s) => {
                serde_json::from_str(&s).map_err(|e| TransportError::Protocol(e.to_string()))
            }
            TransportMessage::Binary(b) => {
                serde_json::from_slice(&b).map_err(|e| TransportError::Protocol(e.to_string()))
            }
        }
    }

    /// Build a [`TransportMessage`] carrying a JSON-encoded payload.
    pub fn encode(msg: &JsonRpcMessage) -> Result<Self, TransportError> {
        let s = serde_json::to_string(msg).map_err(|e| TransportError::Protocol(e.to_string()))?;
        Ok(TransportMessage::Text(s))
    }
}

/// Pluggable transport trait. Implementations are driven by the
/// [`crate::Client`]; they must deliver inbound messages in order and
/// accept outbound sends serially.
///
/// Transports are expected to be full-duplex and half-closable — the
/// client sends indefinitely until the underlying connection closes,
/// and `recv` signals closure by returning `None`.
pub trait Transport: Send + 'static {
    /// Exact-text windowing support; defaults to ordinary delivery.
    fn window_capabilities(&self) -> crate::WindowTransportCapabilities {
        crate::WindowTransportCapabilities::default()
    }
    /// Send a single message.
    ///
    /// Errors returned here are typically fatal for the transport
    /// (the connection is broken). The client will surface them to
    /// the pending in-flight request(s) and shut down.
    fn send(
        &mut self,
        msg: TransportMessage,
    ) -> impl Future<Output = Result<(), TransportError>> + Send;

    /// Receive the next inbound message.
    ///
    /// Returns `Ok(None)` when the remote half of the connection has
    /// cleanly closed. Errors are treated as abnormal closure.
    fn recv(
        &mut self,
    ) -> impl Future<Output = Result<Option<TransportMessage>, TransportError>> + Send;

    /// Close the transport and release any underlying resources.
    ///
    /// Default implementation is a no-op — implementations that hold
    /// owned resources (sockets, tasks) should override.
    fn close(&mut self) -> impl Future<Output = Result<(), TransportError>> + Send {
        async { Ok(()) }
    }
}

// ─── Object-safe adapter ────────────────────────────────────────────────────

/// Object-safe sibling of [`Transport`].
///
/// This trait is what [`BoxedTransport`] stores internally. It is
/// implemented automatically for every type implementing [`Transport`],
/// so users never need to implement it directly — wrap any
/// [`Transport`] in [`BoxedTransport::new`] to type-erase it.
///
/// The futures returned here are heap-allocated, so [`BoxedTransport`]
/// is slightly more expensive than using a concrete [`Transport`].
/// Reach for it when heterogeneous storage is more important than the
/// allocation cost (typically: registries that hold one transport per
/// host).
pub trait DynTransport: Send + 'static {
    /// Object-safe windowing hints.
    fn window_capabilities(&self) -> crate::WindowTransportCapabilities {
        crate::WindowTransportCapabilities::default()
    }
    /// Object-safe analogue of [`Transport::send`].
    fn send<'a>(
        &'a mut self,
        msg: TransportMessage,
    ) -> Pin<Box<dyn Future<Output = Result<(), TransportError>> + Send + 'a>>;

    /// Object-safe analogue of [`Transport::recv`].
    fn recv<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<Option<TransportMessage>, TransportError>> + Send + 'a>>;

    /// Object-safe analogue of [`Transport::close`].
    fn close<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<(), TransportError>> + Send + 'a>>;
}

impl<T: Transport> DynTransport for T {
    fn window_capabilities(&self) -> crate::WindowTransportCapabilities {
        Transport::window_capabilities(self)
    }
    fn send<'a>(
        &'a mut self,
        msg: TransportMessage,
    ) -> Pin<Box<dyn Future<Output = Result<(), TransportError>> + Send + 'a>> {
        Box::pin(<T as Transport>::send(self, msg))
    }

    fn recv<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<Option<TransportMessage>, TransportError>> + Send + 'a>>
    {
        Box::pin(<T as Transport>::recv(self))
    }

    fn close<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = Result<(), TransportError>> + Send + 'a>> {
        Box::pin(<T as Transport>::close(self))
    }
}

/// Type-erased [`Transport`].
///
/// Wraps any concrete [`Transport`] implementation in a `Box<dyn ..>`
/// while still satisfying [`Transport`] itself, so the result can be
/// passed to [`crate::Client::connect`]. Use this when a registry,
/// factory, or container needs to hold transports of different concrete
/// types behind a single handle (for example, the multi-host runtime
/// in [`crate::hosts`]).
///
/// ```
/// # async fn run() -> Result<(), ahp::TransportError> {
/// use ahp::transport::{BoxedTransport, TransportMessage};
/// use ahp::{Transport, TransportError};
/// use tokio::sync::mpsc;
///
/// struct NoopTransport;
/// impl Transport for NoopTransport {
///     async fn send(&mut self, _: TransportMessage) -> Result<(), TransportError> { Ok(()) }
///     async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> { Ok(None) }
/// }
///
/// let boxed: BoxedTransport = BoxedTransport::new(NoopTransport);
/// // `boxed` itself implements `Transport` and can be handed to `Client::connect`.
/// # let _ = boxed;
/// # Ok(()) }
/// ```
pub struct BoxedTransport {
    inner: Box<dyn DynTransport>,
}

impl BoxedTransport {
    /// Wrap any [`Transport`] in a heap-allocated, object-safe handle.
    pub fn new<T: Transport>(transport: T) -> Self {
        Self {
            inner: Box::new(transport),
        }
    }

    /// Wrap an already-boxed object-safe transport.
    ///
    /// Useful when a factory produces `Box<dyn DynTransport>` directly
    /// (e.g. from a runtime-selected backend).
    pub fn from_dyn(inner: Box<dyn DynTransport>) -> Self {
        Self { inner }
    }
}

impl std::fmt::Debug for BoxedTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BoxedTransport").finish_non_exhaustive()
    }
}

impl Transport for BoxedTransport {
    fn window_capabilities(&self) -> crate::WindowTransportCapabilities {
        self.inner.window_capabilities()
    }
    fn send(
        &mut self,
        msg: TransportMessage,
    ) -> impl Future<Output = Result<(), TransportError>> + Send {
        self.inner.send(msg)
    }

    fn recv(
        &mut self,
    ) -> impl Future<Output = Result<Option<TransportMessage>, TransportError>> + Send {
        self.inner.recv()
    }

    fn close(&mut self) -> impl Future<Output = Result<(), TransportError>> + Send {
        self.inner.close()
    }
}

/// Assert exact-text support for a custom transport.
///
/// Incoming notifications must be unmodified Text/UTF-8 Binary and outgoing
/// Text must be sent unchanged. Parsed windowed data is a protocol error.
pub struct RawTextTransport<T> {
    inner: T,
    maximum_frame_bytes: Option<u64>,
}
impl<T> RawTextTransport<T> {
    /// Wrap a transport with an optional safe UTF-16 receive limit.
    pub fn new(inner: T, maximum_frame_bytes: Option<u64>) -> Self {
        Self {
            inner,
            maximum_frame_bytes,
        }
    }
}
impl<T: Transport> Transport for RawTextTransport<T> {
    fn window_capabilities(&self) -> crate::WindowTransportCapabilities {
        let mut capabilities = crate::WindowTransportCapabilities::default().raw_text(true);
        capabilities.maximum_frame_bytes = self.maximum_frame_bytes;
        capabilities
    }
    async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
        self.inner.send(message).await
    }
    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        self.inner.recv().await
    }
    async fn close(&mut self) -> Result<(), TransportError> {
        self.inner.close().await
    }
}
