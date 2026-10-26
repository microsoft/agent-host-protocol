//! Async JSON-RPC client.
//!
//! The [`Client`] drives a [`Transport`] through a background task and
//! exposes an ergonomic request/notification API on top of it. The
//! transport is pluggable — WebSocket, stdio, in-memory pairs for tests —
//! anything that can deliver framed JSON-RPC messages works.
//!
//! ## Lifecycle
//!
//! ```no_run
//! # async fn run(transport: impl ahp::Transport) -> Result<(), ahp::ClientError> {
//! use ahp::{Client, ClientConfig};
//!
//! let client = Client::connect(transport, ClientConfig::default()).await?;
//! let init = client.initialize("my-client".into(), vec!["0.1.0".into()], vec![]).await?;
//! // ... use client ...
//! client.shutdown().await;
//! # Ok(()) }
//! ```
//!
//! The background task terminates when [`Client::shutdown`] is called, the
//! transport closes, or the last [`Client`] handle is dropped.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Weak,
};
use std::time::Duration;

use ahp_types::actions::{ActionEnvelope, StateAction};
use ahp_types::commands::{
    CompletionsParams, CompletionsResult, CreateResourceWatchParams, CreateResourceWatchResult,
    DispatchActionParams, InitializeParams, InitializeResult, ReconnectParams, ReconnectResult,
    ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult,
    ResourceListParams, ResourceListResult, ResourceMkdirParams, ResourceMkdirResult,
    ResourceMoveParams, ResourceMoveResult, ResourceReadParams, ResourceReadResult,
    ResourceRequestParams, ResourceRequestResult, ResourceResolveParams, ResourceResolveResult,
    ResourceWriteParams, ResourceWriteResult, SessionConfigCompletionsParams,
    SessionConfigCompletionsResult, SubscribeParams, SubscribeResult, SubscribeView,
    SubscriptionDeliveryOptions, UnsubscribeParams,
};
use ahp_types::common::{Uri, ROOT_RESOURCE_URI};
use ahp_types::errors::json_rpc_error_codes;
use ahp_types::messages::{
    JsonRpcError, JsonRpcErrorResponse, JsonRpcMessage, JsonRpcNotification, JsonRpcRequest,
    JsonRpcSuccessResponse, JsonRpcVersion,
};
use ahp_types::notifications::{
    AuthRequiredParams, SessionAddedParams, SessionRemovedParams, SessionSummaryChangedParams,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;

use crate::error::ClientError;
use crate::transport::{Transport, TransportMessage};

/// Default size of a per-subscription broadcast channel. Consumers that
/// lag behind this many messages will drop frames and must resubscribe.
const DEFAULT_SUBSCRIPTION_BUFFER: usize = 256;

/// Configuration for a [`Client`].
#[derive(Debug, Clone)]
pub struct ClientConfig {
    /// How long to wait for a request to resolve before failing with
    /// [`ClientError::Cancelled`]. `None` disables the default timeout.
    pub default_request_timeout: Option<Duration>,
    /// Size of each subscription's broadcast ring buffer.
    pub subscription_buffer: usize,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            default_request_timeout: Some(Duration::from_secs(30)),
            subscription_buffer: DEFAULT_SUBSCRIPTION_BUFFER,
        }
    }
}

/// Inbound event fanned out to a [`SessionSubscription`].
///
/// `Action` envelopes carry the write-ahead mutation stream; the
/// remaining variants carry per-channel protocol notifications the server emits
/// as top-level JSON-RPC methods (session catalogue events on the root channel
/// and auth-required signals scoped to a channel).
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum SubscriptionEvent {
    /// Initial or replacement channel state.
    Snapshot(ahp_types::state::Snapshot),
    /// TCP bytes received.
    TcpData(ahp_types::notifications::TcpDataParams),
    /// TCP half-close received.
    TcpEof(ahp_types::notifications::TcpEofParams),
    /// TCP abort received.
    TcpReset(ahp_types::notifications::TcpResetParams),
    /// Future notification unknown to this SDK.
    Other(JsonRpcNotification),
    /// A write-ahead action envelope for this subscription's channel.
    Action(ActionEnvelope),
    /// `root/sessionAdded`: a new session was created on the root channel.
    SessionAdded(SessionAddedParams),
    /// `root/sessionRemoved`: a session was disposed on the root channel.
    SessionRemoved(SessionRemovedParams),
    /// `root/sessionSummaryChanged`: a session summary mutated.
    SessionSummaryChanged(SessionSummaryChangedParams),
    /// `auth/required`: the server needs (re-)authentication for a channel.
    AuthRequired(AuthRequiredParams),
}

/// Inbound event fanned out to a [`ClientEventStream`].
///
/// Carries the same payload as [`SubscriptionEvent`] but tagged with the
/// channel URI it was scoped to. Every channel-tagged event — actions
/// and protocol notifications alike — carries the channel from the
/// payload, since the channel model puts a `channel` field on every
/// pushable message.
#[derive(Debug, Clone)]
pub struct ClientEvent {
    /// Channel URI this event was scoped to, drawn from the underlying
    /// payload (the envelope or the notification params).
    pub channel: Uri,
    /// The underlying subscription event.
    pub event: SubscriptionEvent,
}

/// Stream of every inbound event from a single [`Client`].
///
/// Returned by [`Client::events`]. Each call returns a fresh receiver
/// with its own cursor — multiple consumers can listen independently.
/// Slow consumers that lag behind
/// [`ClientConfig::subscription_buffer`] events skip the gap and keep
/// going, matching [`SessionSubscription`] semantics.
pub struct ClientEventStream {
    rx: broadcast::Receiver<ClientEvent>,
}

impl ClientEventStream {
    /// Await the next event. Returns `None` when the client has shut
    /// down (the underlying broadcast channel has closed).
    pub async fn recv(&mut self) -> Option<ClientEvent> {
        loop {
            match self.rx.recv().await {
                Ok(ev) => return Some(ev),
                Err(broadcast::error::RecvError::Closed) => return None,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    }
}

/// Handle to a single resource subscription. Drop to stop receiving
/// events. The underlying server subscription is released when the last
/// handle for that URI is dropped and [`Client::unsubscribe`] is called.
pub struct SessionSubscription {
    rx: broadcast::Receiver<SubscriptionEvent>,
    uri: String,
}

impl SessionSubscription {
    /// Resource URI this subscription is bound to.
    pub fn uri(&self) -> &str {
        &self.uri
    }

    /// Await the next event on this subscription. Returns `None` when the
    /// client has shut down.
    pub async fn recv(&mut self) -> Option<SubscriptionEvent> {
        loop {
            match self.rx.recv().await {
                Ok(ev) => return Some(ev),
                Err(broadcast::error::RecvError::Closed) => return None,
                // Slow consumer: skip the gap and keep going. Callers
                // that need strict ordering should use a tighter buffer
                // or their own backpressure.
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
            }
        }
    }
}

/// Handle returned from [`Client::dispatch`].
///
/// Dispatch is fire-and-forget by design; the handle simply records the
/// `clientSeq` that was assigned so callers can correlate their local
/// reducer state with server echoes.
#[derive(Debug, Clone, Copy)]
pub struct DispatchHandle {
    /// Client-local sequence number assigned to this dispatch.
    pub client_seq: i64,
}

// ─── Internal plumbing ───────────────────────────────────────────────────────

type PendingMap = HashMap<u64, oneshot::Sender<Result<Value, JsonRpcError>>>;

struct ControlRate {
    since: tokio::time::Instant,
    count: usize,
}
impl ControlRate {
    fn new() -> Self {
        Self {
            since: tokio::time::Instant::now(),
            count: 0,
        }
    }
    async fn wait(&mut self) {
        let period = Duration::from_millis(5);
        if self.since.elapsed() >= period {
            self.since = tokio::time::Instant::now();
            self.count = 0;
        }
        if self.count >= 64 {
            tokio::time::sleep(period.saturating_sub(self.since.elapsed())).await;
            self.since = tokio::time::Instant::now();
            self.count = 0;
        }
        self.count += 1;
    }
}

struct Shared {
    windowing: crate::windowing::Engine,
    pending: Mutex<PendingMap>,
    subscriptions: Mutex<HashMap<String, broadcast::Sender<SubscriptionEvent>>>,
    /// Top-level all-events broadcast.
    ///
    /// Wrapped in a `std::sync::Mutex<Option<_>>` so [`drive_transport`]
    /// can drop the sender during teardown — without that, every
    /// [`ClientEventStream`] receiver would hang on `recv()` forever
    /// after the underlying transport closes (the `Sender` would stay
    /// alive inside the still-`Arc`-held `Shared`).
    all_events: std::sync::Mutex<Option<broadcast::Sender<ClientEvent>>>,
    outbound: mpsc::Sender<Outbound>,
    next_id: AtomicU64,
    next_client_seq: AtomicU64,
    config: ClientConfig,
    /// Handler for inbound server-initiated requests (the symmetrical
    /// `resource*` family). `None` → the client replies `MethodNotFound`.
    server_request_handler: std::sync::Mutex<Option<ServerRequestHandler>>,
}

enum Outbound {
    Message(JsonRpcMessage),
    Request(JsonRpcMessage, bool),
    AwaitedMessage(
        JsonRpcMessage,
        oneshot::Sender<Result<(), crate::WindowError>>,
    ),
    Shutdown,
}

struct RequestGuard {
    shared: Arc<Shared>,
    id: u64,
    armed: bool,
}
impl Drop for RequestGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        self.shared.windowing.expire_request(self.id);
        if let Ok(mut pending) = self.shared.pending.try_lock() {
            pending.remove(&self.id);
        } else if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            let shared = self.shared.clone();
            let id = self.id;
            runtime.spawn(async move {
                shared.pending.lock().await.remove(&id);
            });
        }
    }
}

struct AcquiringSubscription {
    channel: Arc<crate::windowing::Channel>,
    client: Client,
}
impl Drop for AcquiringSubscription {
    fn drop(&mut self) {
        self.channel.end_acquisition(self.client.clone());
    }
}

// ─── Server-initiated request handling ───────────────────────────────────────

/// Future returned by a [`ServerRequestHandler`].
pub type ServerRequestFuture = Pin<Box<dyn Future<Output = Result<Value, JsonRpcError>> + Send>>;

/// Handler for inbound server-initiated requests.
///
/// AHP's `resource*` methods are symmetrical — a server may issue any of them
/// back to the client. Install a handler with
/// [`Client::set_server_request_handler`] (or the typed
/// [`Client::set_resource_request_handlers`]) to answer them. When no handler
/// is installed the client replies with `MethodNotFound`.
///
/// The closure receives the JSON-RPC method name and raw params, and resolves
/// to the result value to return, or a [`JsonRpcError`] for an error response.
pub type ServerRequestHandler = Arc<dyn Fn(String, Value) -> ServerRequestFuture + Send + Sync>;

/// A single typed inbound `resource*` handler: decoded params in, typed result
/// (or [`JsonRpcError`]) out.
type ResourceHandler<P, R> =
    Arc<dyn Fn(P) -> Pin<Box<dyn Future<Output = Result<R, JsonRpcError>> + Send>> + Send + Sync>;

fn method_not_found(method: &str) -> JsonRpcError {
    JsonRpcError {
        code: json_rpc_error_codes::METHOD_NOT_FOUND,
        message: format!("no handler for server method \"{method}\""),
        data: None,
    }
}

/// Decode `params` into `P`, run the typed `handler`, and re-encode its result.
/// Answers `MethodNotFound` when no handler is registered for the method.
fn run_resource_handler<P, R>(
    handler: Option<ResourceHandler<P, R>>,
    method: String,
    params: Value,
) -> ServerRequestFuture
where
    P: DeserializeOwned + Send + 'static,
    R: Serialize + Send + 'static,
{
    Box::pin(async move {
        let Some(handler) = handler else {
            return Err(method_not_found(&method));
        };
        let parsed: P = serde_json::from_value(params).map_err(|e| JsonRpcError {
            code: json_rpc_error_codes::INVALID_PARAMS,
            message: e.to_string(),
            data: None,
        })?;
        let result = handler(parsed).await?;
        serde_json::to_value(result).map_err(|e| JsonRpcError {
            code: json_rpc_error_codes::INTERNAL_ERROR,
            message: e.to_string(),
            data: None,
        })
    })
}

macro_rules! resource_request_handlers {
    ($( $(#[$doc:meta])* $field:ident : $setter:ident => $method:literal ($params:ty) -> $result:ty ),+ $(,)?) => {
        /// A typed per-method registry of inbound `resource*` request handlers.
        ///
        /// Sugar over [`Client::set_server_request_handler`]: build with the
        /// `on_*` methods and install with
        /// [`Client::set_resource_request_handlers`]. Each handler receives the
        /// decoded params and returns the typed result (or a [`JsonRpcError`]).
        /// Methods with no registered handler answer `MethodNotFound`.
        #[derive(Clone, Default)]
        pub struct ResourceRequestHandlers {
            $( $(#[$doc])* pub $field: Option<ResourceHandler<$params, $result>>, )+
        }

        impl ResourceRequestHandlers {
            /// Create an empty registry.
            pub fn new() -> Self {
                Self::default()
            }

            $(
                $(#[$doc])*
                pub fn $setter<F, Fut>(mut self, handler: F) -> Self
                where
                    F: Fn($params) -> Fut + Send + Sync + 'static,
                    Fut: Future<Output = Result<$result, JsonRpcError>> + Send + 'static,
                {
                    self.$field = Some(Arc::new(move |p| Box::pin(handler(p))));
                    self
                }
            )+

            /// Collapse this typed registry into a generic [`ServerRequestHandler`].
            pub fn into_handler(self) -> ServerRequestHandler {
                Arc::new(move |method: String, params: Value| match method.as_str() {
                    $( $method => run_resource_handler(self.$field.clone(), method.clone(), params), )+
                    _ => {
                        let unknown = method.clone();
                        Box::pin(async move { Err(method_not_found(&unknown)) })
                    }
                })
            }
        }
    };
}

resource_request_handlers! {
    /// Handle an inbound `resourceRead` request.
    resource_read: on_resource_read => "resourceRead" (ResourceReadParams) -> ResourceReadResult,
    /// Handle an inbound `resourceWrite` request.
    resource_write: on_resource_write => "resourceWrite" (ResourceWriteParams) -> ResourceWriteResult,
    /// Handle an inbound `resourceList` request.
    resource_list: on_resource_list => "resourceList" (ResourceListParams) -> ResourceListResult,
    /// Handle an inbound `resourceCopy` request.
    resource_copy: on_resource_copy => "resourceCopy" (ResourceCopyParams) -> ResourceCopyResult,
    /// Handle an inbound `resourceDelete` request.
    resource_delete: on_resource_delete => "resourceDelete" (ResourceDeleteParams) -> ResourceDeleteResult,
    /// Handle an inbound `resourceMove` request.
    resource_move: on_resource_move => "resourceMove" (ResourceMoveParams) -> ResourceMoveResult,
    /// Handle an inbound `resourceResolve` request.
    resource_resolve: on_resource_resolve => "resourceResolve" (ResourceResolveParams) -> ResourceResolveResult,
    /// Handle an inbound `resourceMkdir` request.
    resource_mkdir: on_resource_mkdir => "resourceMkdir" (ResourceMkdirParams) -> ResourceMkdirResult,
    /// Handle an inbound `resourceRequest` request.
    resource_request: on_resource_request => "resourceRequest" (ResourceRequestParams) -> ResourceRequestResult,
    /// Handle an inbound `createResourceWatch` request.
    create_resource_watch: on_create_resource_watch => "createResourceWatch" (CreateResourceWatchParams) -> CreateResourceWatchResult,
}

/// Async JSON-RPC client driving a pluggable [`Transport`].
///
/// Cheaply cloneable — all clones share the same background task, pending
/// request map, and subscription registry.
#[derive(Clone)]
pub struct Client {
    shared: Arc<Shared>,
    _reader: Arc<DriveHandle>,
}

struct DriveHandle {
    handle: Mutex<Option<JoinHandle<()>>>,
}

pub(crate) struct ClientBinding {
    shared: Weak<Shared>,
    reader: Weak<DriveHandle>,
}
impl ClientBinding {
    pub(crate) fn upgrade(&self) -> Option<Client> {
        Some(Client {
            shared: self.shared.upgrade()?,
            _reader: self.reader.upgrade()?,
        })
    }
}

impl Drop for DriveHandle {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.handle.try_lock() {
            if let Some(h) = guard.take() {
                h.abort();
            }
        }
    }
}

impl Client {
    /// Configure a client without changing public ClientConfig struct literals.
    pub fn builder() -> crate::ClientBuilder {
        crate::ClientBuilder::default()
    }
    /// Connect a client to the given transport. Spawns a background task
    /// that drives the transport until shutdown.
    pub async fn connect<T: Transport>(
        transport: T,
        config: ClientConfig,
    ) -> Result<Self, ClientError> {
        Self::connect_configured(transport, config, crate::WindowingConfig::default()).await
    }

    pub(crate) async fn connect_configured<T: Transport>(
        transport: T,
        config: ClientConfig,
        windowing: crate::WindowingConfig,
    ) -> Result<Self, ClientError> {
        let capabilities = transport.window_capabilities();
        let (outbound_tx, outbound_rx) = mpsc::channel::<Outbound>(64);
        let (all_events_tx, _) = broadcast::channel::<ClientEvent>(config.subscription_buffer);
        let shared = Arc::new(Shared {
            windowing: crate::windowing::Engine::new(
                windowing,
                capabilities,
                config.subscription_buffer,
            ),
            pending: Mutex::new(HashMap::new()),
            subscriptions: Mutex::new(HashMap::new()),
            all_events: std::sync::Mutex::new(Some(all_events_tx)),
            outbound: outbound_tx,
            next_id: AtomicU64::new(1),
            next_client_seq: AtomicU64::new(1),
            config,
            server_request_handler: std::sync::Mutex::new(None),
        });

        let handle = tokio::spawn(drive_transport(transport, shared.clone(), outbound_rx));
        Ok(Self {
            shared,
            _reader: Arc::new(DriveHandle {
                handle: Mutex::new(Some(handle)),
            }),
        })
    }

    /// Gracefully shut down the client, aborting any in-flight requests
    /// with [`ClientError::Shutdown`].
    pub async fn shutdown(&self) {
        self.shared.windowing.close(None);
        let must_abort = tokio::time::timeout(
            Duration::from_secs(10),
            self.shared.outbound.send(Outbound::Shutdown),
        )
        .await
        .is_err();
        if let Some(mut reader) = self._reader.handle.lock().await.take() {
            if must_abort {
                reader.abort();
            }
            if tokio::time::timeout(Duration::from_secs(10), &mut reader)
                .await
                .is_err()
            {
                reader.abort();
                let _ = reader.await;
            }
        }
        teardown(&self.shared, None).await;
    }

    /// Send a JSON-RPC request and await its result.
    pub async fn request<P, R>(&self, method: &str, params: P) -> Result<R, ClientError>
    where
        P: Serialize,
        R: DeserializeOwned,
    {
        self.request_inner(method, params, None).await
    }

    async fn request_inner<P: Serialize, R: DeserializeOwned>(
        &self,
        method: &str,
        params: P,
        options: Option<(crate::WindowOptions, Arc<crate::windowing::Channel>)>,
    ) -> Result<R, ClientError> {
        if self.shared.outbound.is_closed() {
            return Err(ClientError::Shutdown);
        }
        let id = self.shared.next_id.fetch_add(1, Ordering::Relaxed);
        let mut params_val = serde_json::to_value(&params)?;
        let expected = options.as_ref().map(|(_, channel)| channel.clone());
        let registration = if let Some((options, channel)) = options {
            self.shared
                .windowing
                .register_owned(id, &channel, options, &params_val)
        } else {
            self.shared
                .windowing
                .register_request(id, method, &mut params_val)
        };
        if let Err(error) = registration {
            if let Some(channel) = expected.or_else(|| {
                params_val["channel"]
                    .as_str()
                    .and_then(|uri| self.shared.windowing.subscription(uri))
            }) {
                self.shared.windowing.cleanup_unaccepted(&channel);
            }
            return Err(ClientError::Transport(crate::TransportError::Protocol(
                error.to_string(),
            )));
        }
        let mut guard = RequestGuard {
            shared: self.shared.clone(),
            id,
            armed: true,
        };
        let tracked = self.shared.windowing.has_request(id);
        let params_any = if params_val.is_null() {
            None
        } else {
            Some(ahp_types::common::AnyValue::from(params_val))
        };
        let req = JsonRpcMessage::Request(JsonRpcRequest {
            jsonrpc: JsonRpcVersion::V2,
            id,
            method: method.into(),
            params: params_any,
        });

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.shared.pending.lock().await;
            pending.insert(id, tx);
        }

        if self
            .shared
            .outbound
            .send(Outbound::Request(req, tracked))
            .await
            .is_err()
        {
            self.shared.pending.lock().await.remove(&id);
            return Err(ClientError::Shutdown);
        }

        let result = match self.shared.config.default_request_timeout {
            Some(dur) => match tokio::time::timeout(dur, rx).await {
                Ok(r) => r,
                Err(_) => {
                    return Err(ClientError::Cancelled);
                }
            },
            None => rx.await,
        };

        guard.armed = false;
        match result {
            Ok(Ok(value)) => Ok(serde_json::from_value(value)?),
            Ok(Err(e)) => Err(ClientError::Rpc(e)),
            Err(_) => Err(ClientError::Shutdown),
        }
    }

    /// Send a JSON-RPC notification (fire-and-forget).
    pub async fn notify<P: Serialize>(&self, method: &str, params: P) -> Result<(), ClientError> {
        if self.shared.outbound.is_closed() {
            return Err(ClientError::Shutdown);
        }
        let params_val = serde_json::to_value(&params)?;
        let params_any = if params_val.is_null() {
            None
        } else {
            Some(ahp_types::common::AnyValue::from(params_val))
        };
        let notification = JsonRpcNotification {
            jsonrpc: JsonRpcVersion::V2,
            method: method.into(),
            params: params_any,
        };
        if !ahp_types::notifications::counts_against_window(method)
            && self.shared.windowing.has_windowed()
            && crate::windowing::utf16_bytes(&serde_json::to_string(&notification)?)
                > crate::windowing::MAX_CONTROL_BYTES
        {
            return Err(ClientError::Transport(crate::TransportError::Protocol(
                "control message exceeds size limit".into(),
            )));
        }
        if self.is_window_notification(&notification) {
            return self
                .shared
                .windowing
                .enqueue(notification, None)
                .await
                .map_err(|e| {
                    ClientError::Transport(crate::TransportError::Protocol(e.to_string()))
                });
        }
        let msg = JsonRpcMessage::Notification(notification);
        self.shared
            .outbound
            .send(Outbound::Message(msg))
            .await
            .map_err(|_| ClientError::Shutdown)
    }

    /// Issue the `initialize` handshake.
    ///
    /// `protocol_versions` is the list of protocol versions the client is
    /// willing to speak, ordered most preferred first. The server picks one
    /// and returns it as `InitializeResult.protocol_version`.
    pub async fn initialize(
        &self,
        client_id: String,
        protocol_versions: Vec<String>,
        initial_subscriptions: Vec<String>,
    ) -> Result<InitializeResult, ClientError> {
        let params = InitializeParams {
            channel: ROOT_RESOURCE_URI.to_string(),
            meta: None,
            protocol_versions,
            client_id,
            initial_subscriptions: if initial_subscriptions.is_empty() {
                None
            } else {
                Some(initial_subscriptions)
            },
            locale: None,
            capabilities: None,
            client_info: None,
        };
        self.request("initialize", params).await
    }

    /// Re-establish a dropped connection with `reconnect`.
    pub async fn reconnect(
        &self,
        client_id: String,
        last_seen_server_seq: i64,
        subscriptions: Vec<String>,
    ) -> Result<ReconnectResult, ClientError> {
        let params = ReconnectParams {
            channel: ROOT_RESOURCE_URI.to_string(),
            meta: None,
            client_id,
            last_seen_server_seq,
            subscriptions,
            windows: None,
        };
        self.request("reconnect", params).await
    }

    /// Protocol-level liveness `ping`.
    ///
    /// Verifies the connection is still alive and keeps it from being closed
    /// by idle-timeout intermediaries (proxies, load balancers, etc.). `ping`
    /// is a connection-level command scoped to the root channel and carries no
    /// payload in either direction — the response itself is the signal. The
    /// server responds regardless of whether `initialize` has completed or any
    /// subscriptions are held.
    pub async fn ping(&self) -> Result<(), ClientError> {
        #[derive(Serialize)]
        struct PingParams {
            channel: &'static str,
        }
        self.request(
            "ping",
            PingParams {
                channel: ROOT_RESOURCE_URI,
            },
        )
        .await
    }

    /// Subscribe to a URI and obtain a handle that streams
    /// [`SubscriptionEvent`]s for that channel.
    pub async fn subscribe(
        &self,
        uri: String,
    ) -> Result<(SubscribeResult, SessionSubscription), ClientError> {
        self.subscribe_with_delivery(uri, None).await
    }

    /// Subscribe to a URI with advisory delivery preferences and obtain a
    /// handle that streams [`SubscriptionEvent`]s for that channel.
    pub async fn subscribe_with_delivery(
        &self,
        uri: String,
        delivery: Option<SubscriptionDeliveryOptions>,
    ) -> Result<(SubscribeResult, SessionSubscription), ClientError> {
        self.subscribe_with_options(uri, delivery, None).await
    }

    /// Subscribe to a URI with advisory delivery preferences and snapshot view
    /// preferences.
    pub async fn subscribe_with_options(
        &self,
        uri: String,
        delivery: Option<SubscriptionDeliveryOptions>,
        view: Option<SubscribeView>,
    ) -> Result<(SubscribeResult, SessionSubscription), ClientError> {
        let sub = self.attach_subscription(&uri).await;
        let result: SubscribeResult = self
            .request(
                "subscribe",
                SubscribeParams {
                    channel: uri,
                    meta: None,
                    delivery,
                    view,
                    flow_control: None,
                },
            )
            .await?;
        Ok((result, sub))
    }

    /// Attach a new local subscription handle for `uri` without sending a
    /// `subscribe` request — useful when the URI was included in
    /// `initialSubscriptions` during [`Client::initialize`].
    pub async fn attach_subscription(&self, uri: &str) -> SessionSubscription {
        let mut subs = self.shared.subscriptions.lock().await;
        let tx = subs
            .entry(uri.to_string())
            .or_insert_with(|| broadcast::channel(self.shared.config.subscription_buffer).0);
        SessionSubscription {
            rx: tx.subscribe(),
            uri: uri.to_string(),
        }
    }

    /// Send an `unsubscribe` notification and drop the local fan-out for
    /// this URI. In-flight [`SessionSubscription`] handles will see the
    /// channel close.
    pub async fn unsubscribe(&self, uri: String) -> Result<(), ClientError> {
        self.unsubscribe_impl(&uri, None).await
    }

    pub(crate) async fn unsubscribe_if_current(
        &self,
        uri: &str,
        expected: &Arc<crate::windowing::Channel>,
    ) -> Result<(), ClientError> {
        self.unsubscribe_impl(uri, Some(expected)).await
    }

    async fn unsubscribe_impl(
        &self,
        uri: &str,
        expected: Option<&Arc<crate::windowing::Channel>>,
    ) -> Result<(), ClientError> {
        let mut client = self.clone();
        loop {
            if let Some(current) = expected.and_then(|channel| {
                channel
                    .binding
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .as_ref()
                    .and_then(ClientBinding::upgrade)
            }) {
                client = current;
            }
            let sender = client.shared.outbound.clone();
            let permit = sender.reserve().await.ok();
            if let Some(current) = expected.and_then(|channel| {
                channel
                    .binding
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .as_ref()
                    .and_then(ClientBinding::upgrade)
            }) {
                if !Arc::ptr_eq(&current.shared, &client.shared) {
                    drop(permit);
                    client = current;
                    continue;
                }
            }
            let message = JsonRpcMessage::Notification(JsonRpcNotification {
                jsonrpc: JsonRpcVersion::V2,
                method: "unsubscribe".into(),
                params: Some(serde_json::to_value(UnsubscribeParams {
                    channel: uri.into(),
                })?),
            });
            let removed = client.shared.windowing.remove_and(uri, expected, || {
                if let Some(permit) = permit {
                    permit.send(Outbound::Message(message));
                }
            });
            if removed {
                client.shared.subscriptions.lock().await.remove(uri);
            }
            break;
        }
        Ok(())
    }

    /// Subscribe to a top-level stream of every inbound event from this
    /// client, regardless of channel URI.
    ///
    /// Each call returns a fresh receiver — multiple consumers can listen
    /// independently. Useful for the multi-host runtime in
    /// [`crate::hosts`], or any consumer that needs a single fan-in feed
    /// rather than per-URI subscriptions.
    ///
    /// Every event carries its channel URI in [`ClientEvent::channel`] —
    /// action envelopes from the envelope's `channel` field, protocol
    /// notifications from the notification params. Events are also
    /// delivered once to each per-URI [`SessionSubscription`] for the
    /// matching channel.
    ///
    /// Once the underlying transport has closed, any in-flight call to
    /// [`ClientEventStream::recv`] resolves with `None` and subsequent
    /// calls to `events()` return a stream that immediately yields
    /// `None`.
    pub fn events(&self) -> ClientEventStream {
        let rx = match self.shared.all_events.lock() {
            Ok(guard) => guard.as_ref().map(|s| s.subscribe()),
            Err(_) => None,
        };
        let rx = rx.unwrap_or_else(|| {
            // Channel was already torn down; return a receiver bound to
            // a sender we immediately drop so `recv()` resolves to None.
            let (_, rx) = broadcast::channel(1);
            rx
        });
        ClientEventStream { rx }
    }

    /// Fire a write-ahead `dispatchAction` notification with a
    /// client-assigned sequence number.
    pub async fn dispatch(
        &self,
        channel: Uri,
        action: StateAction,
    ) -> Result<DispatchHandle, ClientError> {
        let client_seq = self.shared.next_client_seq.fetch_add(1, Ordering::Relaxed) as i64;
        self.notify(
            "dispatchAction",
            DispatchActionParams {
                channel,
                client_seq,
                action,
            },
        )
        .await?;
        Ok(DispatchHandle { client_seq })
    }

    /// Subscribe with consumer-driven window credit. A second call updates the same queue.
    pub async fn subscribe_windowed(
        &self,
        uri: impl Into<String>,
        options: crate::WindowOptions,
    ) -> Result<(SubscribeResult, crate::WindowedSubscription), crate::WindowError> {
        if self.shared.outbound.is_closed() {
            return Err(crate::WindowError::new("connection closed"));
        }
        let uri = uri.into();
        let offer = self.shared.windowing.prepare(&uri, options.clone())?;
        let channel = self
            .shared
            .windowing
            .subscription(&uri)
            .ok_or_else(|| crate::WindowError::new("subscription cancelled"))?;
        channel.begin_acquisition();
        let _acquiring = AcquiringSubscription {
            channel: channel.clone(),
            client: self.clone(),
        };
        if uri.starts_with("ahp-tcp:") && offer.is_none() {
            self.shared.windowing.cleanup_unaccepted(&channel);
            return Err(crate::WindowError::new("TCP requires raw-text transport"));
        }
        let result = self
            .request_inner(
                "subscribe",
                SubscribeParams {
                    channel: uri.clone(),
                    meta: None,
                    delivery: None,
                    view: None,
                    flow_control: offer.map(|receive| {
                        ahp_types::commands::SubscriptionFlowControlOptions { receive }
                    }),
                },
                Some((options, channel.clone())),
            )
            .await;
        let result = match result {
            Ok(result) => result,
            Err(error) => {
                self.shared.windowing.cleanup_unaccepted(&channel);
                return Err(error.into());
            }
        };
        if !self
            .shared
            .windowing
            .subscription(&uri)
            .is_some_and(|current| Arc::ptr_eq(&current, &channel))
        {
            return Err(crate::WindowError::new("subscription cancelled"));
        }
        *channel.binding.lock().unwrap_or_else(|e| e.into_inner()) = Some(self.binding());
        Ok((
            result,
            crate::WindowedSubscription::new(channel, self.clone()),
        ))
    }

    fn binding(&self) -> ClientBinding {
        ClientBinding {
            shared: Arc::downgrade(&self.shared),
            reader: Arc::downgrade(&self._reader),
        }
    }

    /// Obtain the owning queue after an advanced raw subscribe request.
    ///
    /// Handles for the same URI share one queue, rather than duplicating credit.
    pub fn windowed_subscription(
        &self,
        uri: &str,
    ) -> Result<crate::WindowedSubscription, crate::WindowError> {
        if self.shared.outbound.is_closed() {
            return Err(crate::WindowError::new("connection closed"));
        }
        let channel = self
            .shared
            .windowing
            .subscription(uri)
            .ok_or_else(|| crate::WindowError::new("unknown window subscription"))?;
        *channel.binding.lock().unwrap_or_else(|e| e.into_inner()) = Some(self.binding());
        Ok(crate::WindowedSubscription::new(channel, self.clone()))
    }

    pub(crate) fn managed_channels(&self) -> Vec<Arc<crate::windowing::Channel>> {
        self.shared.windowing.managed_channels()
    }

    pub(crate) fn restore_channels(
        &self,
        channels: &[Arc<crate::windowing::Channel>],
    ) -> Result<(), crate::WindowError> {
        for channel in channels {
            if channel.dropped() || channel.unowned_drop() {
                continue;
            }
            self.shared.windowing.adopt(channel.clone())?;
            *channel.binding.lock().unwrap_or_else(|e| e.into_inner()) = Some(self.binding());
        }
        Ok(())
    }

    pub(crate) fn fail_subscription(
        &self,
        channel: &Arc<crate::windowing::Channel>,
        error: crate::WindowError,
    ) {
        self.shared.windowing.fail_subscription(channel, error);
    }

    pub(crate) fn is_connected(&self) -> bool {
        !self.shared.outbound.is_closed()
    }

    pub(crate) fn resume_windows(
        &self,
    ) -> Option<ahp_types::commands::ChannelDeliveryResumeOptions> {
        self.shared.windowing.resume_windows()
    }

    /// Observe lossy connection flow-control telemetry without releasing credit.
    pub fn flow_control_events(&self) -> broadcast::Receiver<crate::FlowControlEvent> {
        self.shared.windowing.events.subscribe()
    }

    /// Reconnect with explicit generated window resume parameters.
    pub async fn reconnect_with_windows(
        &self,
        params: ReconnectParams,
    ) -> Result<ReconnectResult, crate::WindowError> {
        Ok(self.request("reconnect", params).await?)
    }

    fn is_window_notification(&self, n: &JsonRpcNotification) -> bool {
        ahp_types::notifications::counts_against_window(&n.method)
            && n.params
                .as_ref()
                .and_then(|p| p["channel"].as_str())
                .is_some_and(|uri| self.shared.windowing.subscription(uri).is_some())
    }

    pub(crate) async fn window_send(
        &self,
        method: &str,
        params: Value,
    ) -> Result<(), crate::WindowError> {
        if self.shared.outbound.is_closed() {
            return Err(crate::WindowError::new("connection closed"));
        }
        let notification = JsonRpcNotification {
            jsonrpc: JsonRpcVersion::V2,
            method: method.into(),
            params: Some(params),
        };
        if !self.is_window_notification(&notification) {
            if crate::windowing::utf16_bytes(
                &serde_json::to_string(&notification)
                    .map_err(|e| crate::WindowError::new(e.to_string()))?,
            ) > crate::windowing::MAX_CONTROL_BYTES
            {
                return Err(crate::WindowError::new(
                    "control message exceeds size limit",
                ));
            }
            let (tx, rx) = oneshot::channel();
            self.shared
                .outbound
                .send(Outbound::AwaitedMessage(
                    JsonRpcMessage::Notification(notification),
                    tx,
                ))
                .await
                .map_err(|_| crate::WindowError::new("connection closed"))?;
            return rx
                .await
                .map_err(|_| crate::WindowError::new("connection closed"))?;
        }
        let (tx, rx) = oneshot::channel();
        self.shared
            .windowing
            .enqueue(notification, Some(tx))
            .await?;
        rx.await
            .map_err(|_| crate::WindowError::new("connection closed"))?
    }

    pub(crate) async fn window_dispatch(
        &self,
        channel: String,
        action: StateAction,
    ) -> Result<DispatchHandle, crate::WindowError> {
        let client_seq = self.shared.next_client_seq.fetch_add(1, Ordering::Relaxed) as i64;
        self.window_send(
            "dispatchAction",
            serde_json::to_value(DispatchActionParams {
                channel,
                client_seq,
                action,
            })
            .map_err(|e| crate::WindowError::new(e.to_string()))?,
        )
        .await?;
        Ok(DispatchHandle { client_seq })
    }

    // ─── Server-initiated requests (inbound) ─────────────────────────────

    /// Install a generic handler for inbound server-initiated requests.
    ///
    /// AHP's `resource*` methods are symmetrical, so a server may issue any
    /// of them back to the client. The handler receives the method name and
    /// raw params and resolves to the result value (or a [`JsonRpcError`]).
    /// Replaces any previously-installed handler. When none is installed the
    /// client answers inbound requests with `MethodNotFound`.
    ///
    /// For a typed, per-method API see [`Client::set_resource_request_handlers`].
    pub fn set_server_request_handler<F, Fut>(&self, handler: F)
    where
        F: Fn(String, Value) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Value, JsonRpcError>> + Send + 'static,
    {
        let handler: ServerRequestHandler =
            Arc::new(move |method, params| Box::pin(handler(method, params)));
        if let Ok(mut guard) = self.shared.server_request_handler.lock() {
            *guard = Some(handler);
        }
    }

    /// Install typed per-method handlers for inbound `resource*` requests.
    ///
    /// Sugar over [`Client::set_server_request_handler`] that decodes params
    /// and encodes results for you. Unhandled methods answer `MethodNotFound`.
    pub fn set_resource_request_handlers(&self, handlers: ResourceRequestHandlers) {
        if let Ok(mut guard) = self.shared.server_request_handler.lock() {
            *guard = Some(handlers.into_handler());
        }
    }

    /// Remove any installed server-request handler; inbound requests revert to
    /// answering `MethodNotFound`.
    pub fn clear_server_request_handler(&self) {
        if let Ok(mut guard) = self.shared.server_request_handler.lock() {
            *guard = None;
        }
    }

    // ─── Resource commands (send) ────────────────────────────────────────
    //
    // Typed wrappers around `request()` for the symmetrical `resource*`
    // family. Each targets the root channel; any `channel` set on `params`
    // is overwritten.

    /// Read a resource's content (`resourceRead`).
    pub async fn resource_read(
        &self,
        mut params: ResourceReadParams,
    ) -> Result<ResourceReadResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceRead", params).await
    }

    /// Write content to a resource (`resourceWrite`).
    pub async fn resource_write(
        &self,
        mut params: ResourceWriteParams,
    ) -> Result<ResourceWriteResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceWrite", params).await
    }

    /// List the children of a resource (`resourceList`).
    pub async fn resource_list(
        &self,
        mut params: ResourceListParams,
    ) -> Result<ResourceListResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceList", params).await
    }

    /// Copy a resource (`resourceCopy`).
    pub async fn resource_copy(
        &self,
        mut params: ResourceCopyParams,
    ) -> Result<ResourceCopyResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceCopy", params).await
    }

    /// Delete a resource (`resourceDelete`).
    pub async fn resource_delete(
        &self,
        mut params: ResourceDeleteParams,
    ) -> Result<ResourceDeleteResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceDelete", params).await
    }

    /// Move or rename a resource (`resourceMove`).
    pub async fn resource_move(
        &self,
        mut params: ResourceMoveParams,
    ) -> Result<ResourceMoveResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceMove", params).await
    }

    /// Resolve a resource URI to its canonical form (`resourceResolve`).
    pub async fn resource_resolve(
        &self,
        mut params: ResourceResolveParams,
    ) -> Result<ResourceResolveResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceResolve", params).await
    }

    /// Create a directory resource (`resourceMkdir`).
    pub async fn resource_mkdir(
        &self,
        mut params: ResourceMkdirParams,
    ) -> Result<ResourceMkdirResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceMkdir", params).await
    }

    /// Issue a free-form resource request (`resourceRequest`).
    pub async fn resource_request(
        &self,
        mut params: ResourceRequestParams,
    ) -> Result<ResourceRequestResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("resourceRequest", params).await
    }

    /// Create a resource watch channel (`createResourceWatch`). Pair the
    /// returned channel URI with [`Client::subscribe`] to stream changes.
    pub async fn create_resource_watch(
        &self,
        mut params: CreateResourceWatchParams,
    ) -> Result<CreateResourceWatchResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("createResourceWatch", params).await
    }

    // ─── Completions commands (send) ─────────────────────────────────────

    /// Request inline completion items for a partially-typed input
    /// (`completions`), e.g. to power `@`-mention pickers.
    ///
    /// Unlike the `resource*` wrappers, the caller-supplied `channel` (the chat
    /// URI the completion is scoped to) is preserved. Debounce calls to avoid
    /// flooding the server on every keystroke.
    pub async fn completions(
        &self,
        params: CompletionsParams,
    ) -> Result<CompletionsResult, ClientError> {
        self.request("completions", params).await
    }

    /// Query the server for allowed values of a dynamic session config property
    /// (`sessionConfigCompletions`). Targets the root channel; any `channel`
    /// set on `params` is overwritten.
    pub async fn session_config_completions(
        &self,
        mut params: SessionConfigCompletionsParams,
    ) -> Result<SessionConfigCompletionsResult, ClientError> {
        params.channel = ROOT_RESOURCE_URI.to_string();
        self.request("sessionConfigCompletions", params).await
    }
}

async fn drive_transport<T: Transport>(
    mut transport: T,
    shared: Arc<Shared>,
    mut outbound: mpsc::Receiver<Outbound>,
) {
    let mut tick = tokio::time::interval(Duration::from_millis(5));
    let mut failure = None;
    let mut send_controls = ControlRate::new();
    let mut receive_controls = ControlRate::new();
    loop {
        tokio::select! {
            outbound_msg = outbound.recv() => {
                match outbound_msg {
                    Some(outbound @ (Outbound::Message(_) | Outbound::Request(..))) => {
                        let (msg, tracked) = match outbound {
                            Outbound::Message(message) => (message, false),
                            Outbound::Request(message, tracked) => (message, tracked),
                            _ => unreachable!(),
                        };
                        if let JsonRpcMessage::Request(request) = &msg {
                            let pending = shared.pending.lock().await;
                            if pending.get(&request.id).map_or(true, oneshot::Sender::is_closed) {
                                shared.windowing.failed_request(request.id);
                                continue;
                            }
                            if tracked && !shared.windowing.request_sent(request.id) {
                                continue;
                            }
                        }
                        if matches!(&msg, JsonRpcMessage::Notification(n) if !ahp_types::notifications::counts_against_window(&n.method))
                            && shared.windowing.has_windowed() { send_controls.wait().await; }
                        if let Ok(wire) = TransportMessage::encode(&msg) {
                            if let Err(err) = transport.send(wire).await {
                                tracing::warn!(?err, "transport send failed");
                                break;
                            }
                        }
                    }
                    Some(Outbound::Shutdown) | None => {
                        let _ = transport.close().await;
                        break;
                    }
                    Some(Outbound::AwaitedMessage(msg, completion)) => {
                        if completion.is_closed() { continue; }
                        send_controls.wait().await;
                        let result = match TransportMessage::encode(&msg) {
                            Ok(wire) => transport.send(wire).await.map_err(|e| crate::WindowError::new(e.to_string())),
                            Err(error) => Err(crate::WindowError::new(error.to_string())),
                        };
                        let _ = completion.send(result.clone());
                        if let Err(error) = result {
                            failure = Some(error); let _ = transport.close().await; break;
                        }
                    }
                }
            }
            inbound = transport.recv() => {
                match inbound {
                    Ok(Some(wire)) => {
                        let (size, parsed) = match wire {
                            TransportMessage::Text(text) => (Some(crate::windowing::utf16_bytes(&text)),
                                serde_json::from_str(&text).map_err(|error| crate::TransportError::Protocol(error.to_string()))),
                            TransportMessage::Binary(bytes) => match std::str::from_utf8(&bytes) {
                                Ok(text) => (Some(crate::windowing::utf16_bytes(text)),
                                    serde_json::from_str(text).map_err(|error| crate::TransportError::Protocol(error.to_string()))),
                                Err(error) => (None, Err(crate::TransportError::Protocol(error.to_string()))),
                            },
                            TransportMessage::Parsed(message) => (None, Ok(message)),
                        };
                        match parsed {
                            Ok(msg) => {
                                let result = match msg {
                                    JsonRpcMessage::Notification(notification) => {
                                        if !ahp_types::notifications::counts_against_window(&notification.method) && shared.windowing.has_windowed() {
                                            receive_controls.wait().await;
                                        }
                                        shared.windowing.inbound(notification, size).map(|n| n.map(JsonRpcMessage::Notification))
                                    },
                                    JsonRpcMessage::SuccessResponse(response) => {
                                        match shared.windowing.response(response.id, &response.result) {
                                            Ok(cleanup) => {
                                                for uri in cleanup {
                                                    let text = serde_json::json!({"jsonrpc":"2.0","method":"unsubscribe","params":{"channel":uri}}).to_string();
                                                    if let Err(error) = transport.send(TransportMessage::Text(text)).await {
                                                        failure = Some(crate::WindowError::new(error.to_string()));
                                                        break;
                                                    }
                                                }
                                                Ok(Some(JsonRpcMessage::SuccessResponse(response)))
                                            }
                                            Err(error) => Err(error),
                                        }
                                    },
                                    JsonRpcMessage::ErrorResponse(response) => {
                                        shared.windowing.failed_request(response.id);
                                        Ok(Some(JsonRpcMessage::ErrorResponse(response)))
                                    }
                                    other => Ok(Some(other)),
                                };
                                match result {
                                    Ok(Some(msg)) => dispatch_inbound(&shared, msg).await,
                                    Ok(None) => {},
                                    Err(error) => { failure = Some(error); let _ = transport.close().await; break; }
                                }
                            }
                            Err(err) => {
                                if shared.windowing.has_windowed() {
                                    failure = Some(crate::WindowError::new(err.to_string()));
                                    let _ = transport.close().await;
                                    break;
                                }
                                tracing::warn!(?err, "malformed frame");
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(err) => {
                        tracing::warn!(?err, "transport recv error");
                        break;
                    }
                }
            }
            _ = shared.windowing.wake.notified() => {
                match shared.windowing.next_send() {
                    Ok(Some(send)) => {
                        if send.control { send_controls.wait().await; }
                        if !send.is_live() {
                            send.complete(Err(crate::WindowError::new("subscription closed")));
                            continue;
                        }
                        let result = tokio::time::timeout(Duration::from_secs(10), transport.send(TransportMessage::Text(send.text.clone()))).await;
                        match result {
                            Ok(Ok(())) => send.complete(Ok(())),
                            other => {
                                let error = crate::WindowError::new(format!("windowed transport send failed: {other:?}"));
                                send.complete(Err(error.clone()));
                                failure = Some(error); let _ = transport.close().await; break;
                            }
                        }
                        shared.windowing.wake.notify_one();
                    }
                    Ok(None) => {},
                    Err(error) => { failure = Some(error); let _ = transport.close().await; break; }
                }
            }
            _ = tick.tick(), if shared.windowing.has_subscriptions() => { shared.windowing.wake.notify_one(); }
        }
    }

    teardown(&shared, failure).await;
}

async fn teardown(shared: &Shared, failure: Option<crate::WindowError>) {
    shared.windowing.close(failure);
    let mut pending = shared.pending.lock().await;
    for (_, tx) in pending.drain() {
        let _ = tx.send(Err(JsonRpcError {
            code: -32000,
            message: "transport closed".into(),
            data: None,
        }));
    }
    let mut subs = shared.subscriptions.lock().await;
    subs.clear();
    // Drop the top-level fan-out sender so any active
    // `ClientEventStream::recv()` resolves with `None` rather than
    // hanging forever (the `Sender` would otherwise stay alive inside
    // the still-`Arc`-held `Shared`).
    if let Ok(mut guard) = shared.all_events.lock() {
        guard.take();
    }
}

async fn dispatch_inbound(shared: &Arc<Shared>, msg: JsonRpcMessage) {
    match msg {
        JsonRpcMessage::SuccessResponse(r) => {
            if let Some(tx) = shared.pending.lock().await.remove(&r.id) {
                let _ = tx.send(Ok(r.result));
            }
        }
        JsonRpcMessage::ErrorResponse(r) => {
            if let Some(tx) = shared.pending.lock().await.remove(&r.id) {
                let _ = tx.send(Err(r.error));
            }
        }
        JsonRpcMessage::Notification(n) => {
            handle_notification(shared, n).await;
        }
        JsonRpcMessage::Request(r) => {
            // Handle on a detached task: a handler may call back into the
            // client (e.g. issue its own request), which must not block the
            // transport read loop.
            let shared = shared.clone();
            tokio::spawn(async move {
                handle_server_request(&shared, r).await;
            });
        }
    }
}

/// Answer an inbound server-initiated request via the installed
/// [`ServerRequestHandler`], or with `MethodNotFound` when none is set.
async fn handle_server_request(shared: &Shared, req: JsonRpcRequest) {
    let handler = shared
        .server_request_handler
        .lock()
        .ok()
        .and_then(|guard| guard.clone());
    let id = req.id;
    let params = req.params.unwrap_or(Value::Null);
    let response = match handler {
        Some(handler) => match handler(req.method, params).await {
            Ok(result) => JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id,
                result,
            }),
            Err(error) => JsonRpcMessage::ErrorResponse(JsonRpcErrorResponse {
                jsonrpc: JsonRpcVersion::V2,
                id,
                error,
            }),
        },
        None => JsonRpcMessage::ErrorResponse(JsonRpcErrorResponse {
            jsonrpc: JsonRpcVersion::V2,
            id,
            error: method_not_found(&req.method),
        }),
    };
    let _ = shared.outbound.send(Outbound::Message(response)).await;
}

async fn handle_notification(shared: &Shared, n: JsonRpcNotification) {
    let tracked = n
        .params
        .as_ref()
        .and_then(|params| params["channel"].as_str())
        .is_some_and(|uri| shared.windowing.subscription(uri).is_some());
    if !tracked
        && !matches!(
            n.method.as_str(),
            "action"
                | "root/sessionAdded"
                | "root/sessionRemoved"
                | "root/sessionSummaryChanged"
                | "auth/required"
        )
    {
        return;
    }
    if let Ok(event) = decode_notification(n.clone()) {
        if let Some(channel) = n.params.as_ref().and_then(|p| p["channel"].as_str()) {
            fan_out(shared, &channel.to_string(), event).await;
        }
    }
}

pub(crate) fn decode_notification(n: JsonRpcNotification) -> Result<SubscriptionEvent, String> {
    let value = n.params.clone().unwrap_or(Value::Null);
    let decode = |error: serde_json::Error| error.to_string();
    match n.method.as_str() {
        "channel/snapshot" => {
            serde_json::from_value::<ahp_types::notifications::ChannelSnapshotParams>(value)
                .map(|p| SubscriptionEvent::Snapshot(p.snapshot))
                .map_err(decode)
        }
        "tcp/data" => serde_json::from_value(value)
            .map(SubscriptionEvent::TcpData)
            .map_err(decode),
        "tcp/eof" => serde_json::from_value(value)
            .map(SubscriptionEvent::TcpEof)
            .map_err(decode),
        "tcp/reset" => serde_json::from_value(value)
            .map(SubscriptionEvent::TcpReset)
            .map_err(decode),
        "action" => serde_json::from_value(value)
            .map(SubscriptionEvent::Action)
            .map_err(decode),
        "root/sessionAdded" => serde_json::from_value(value)
            .map(SubscriptionEvent::SessionAdded)
            .map_err(decode),
        "root/sessionRemoved" => serde_json::from_value(value)
            .map(SubscriptionEvent::SessionRemoved)
            .map_err(decode),
        "root/sessionSummaryChanged" => serde_json::from_value(value)
            .map(SubscriptionEvent::SessionSummaryChanged)
            .map_err(decode),
        "auth/required" => serde_json::from_value(value)
            .map(SubscriptionEvent::AuthRequired)
            .map_err(decode),
        _ => Ok(SubscriptionEvent::Other(n)),
    }
}

/// Dispatch an inbound event to the matching per-URI subscription (if
/// any) and to the top-level fan-in stream.
async fn fan_out(shared: &Shared, channel: &Uri, event: SubscriptionEvent) {
    {
        let subs = shared.subscriptions.lock().await;
        if let Some(tx) = subs.get(channel) {
            let _ = tx.send(event.clone());
        }
    }
    if let Ok(guard) = shared.all_events.lock() {
        if let Some(tx) = guard.as_ref() {
            let _ = tx.send(ClientEvent {
                channel: channel.clone(),
                event,
            });
        }
    }
}
