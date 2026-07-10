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
    Arc,
};
use std::time::Duration;

use ahp_types::actions::{ActionEnvelope, StateAction};
use ahp_types::commands::{
    CreateResourceWatchParams, CreateResourceWatchResult, DispatchActionParams, InitializeParams,
    InitializeResult, ReconnectParams, ReconnectResult, ResourceCopyParams, ResourceCopyResult,
    ResourceDeleteParams, ResourceDeleteResult, ResourceListParams, ResourceListResult,
    ResourceMkdirParams, ResourceMkdirResult, ResourceMoveParams, ResourceMoveResult,
    ResourceReadParams, ResourceReadResult, ResourceRequestParams, ResourceRequestResult,
    ResourceResolveParams, ResourceResolveResult, ResourceWriteParams, ResourceWriteResult,
    SubscribeParams, SubscribeResult, SubscribeView, SubscriptionDeliveryOptions,
    UnsubscribeParams,
};
use ahp_types::common::{Uri, ROOT_RESOURCE_URI};
use ahp_types::errors::json_rpc_error_codes;
use ahp_types::messages::{
    ActionNotificationParams, JsonRpcError, JsonRpcErrorResponse, JsonRpcMessage,
    JsonRpcNotification, JsonRpcRequest, JsonRpcSuccessResponse, JsonRpcVersion,
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
/// remaining variants carry per-channel protocol notifications the
/// server emits as top-level JSON-RPC methods (session catalogue events
/// on the root channel, auth-required signals scoped to a channel).
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum SubscriptionEvent {
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

struct Shared {
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
    Shutdown,
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
    /// Connect a client to the given transport. Spawns a background task
    /// that drives the transport until shutdown.
    pub async fn connect<T: Transport>(
        transport: T,
        config: ClientConfig,
    ) -> Result<Self, ClientError> {
        let (outbound_tx, outbound_rx) = mpsc::channel::<Outbound>(64);
        let (all_events_tx, _) = broadcast::channel::<ClientEvent>(config.subscription_buffer);
        let shared = Arc::new(Shared {
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
        let _ = self.shared.outbound.send(Outbound::Shutdown).await;
        // Fail any pending in-flight requests.
        let mut pending = self.shared.pending.lock().await;
        for (_, tx) in pending.drain() {
            let _ = tx.send(Err(JsonRpcError {
                code: -32000,
                message: "client shut down".into(),
                data: None,
            }));
        }
    }

    /// Send a JSON-RPC request and await its result.
    pub async fn request<P, R>(&self, method: &str, params: P) -> Result<R, ClientError>
    where
        P: Serialize,
        R: DeserializeOwned,
    {
        let id = self.shared.next_id.fetch_add(1, Ordering::Relaxed);
        let params_val = serde_json::to_value(&params)?;
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
            .send(Outbound::Message(req))
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
                    self.shared.pending.lock().await.remove(&id);
                    return Err(ClientError::Cancelled);
                }
            },
            None => rx.await,
        };

        match result {
            Ok(Ok(value)) => Ok(serde_json::from_value(value)?),
            Ok(Err(e)) => Err(ClientError::Rpc(e)),
            Err(_) => Err(ClientError::Shutdown),
        }
    }

    /// Send a JSON-RPC notification (fire-and-forget).
    pub async fn notify<P: Serialize>(&self, method: &str, params: P) -> Result<(), ClientError> {
        let params_val = serde_json::to_value(&params)?;
        let params_any = if params_val.is_null() {
            None
        } else {
            Some(ahp_types::common::AnyValue::from(params_val))
        };
        let msg = JsonRpcMessage::Notification(JsonRpcNotification {
            jsonrpc: JsonRpcVersion::V2,
            method: method.into(),
            params: params_any,
        });
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
            client_id,
            last_seen_server_seq,
            subscriptions,
        };
        self.request("reconnect", params).await
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
                    delivery,
                    view,
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
        {
            let mut subs = self.shared.subscriptions.lock().await;
            subs.remove(&uri);
        }
        self.notify("unsubscribe", UnsubscribeParams { channel: uri })
            .await
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
}

async fn drive_transport<T: Transport>(
    mut transport: T,
    shared: Arc<Shared>,
    mut outbound: mpsc::Receiver<Outbound>,
) {
    loop {
        tokio::select! {
            outbound_msg = outbound.recv() => {
                match outbound_msg {
                    Some(Outbound::Message(msg)) => {
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
                }
            }
            inbound = transport.recv() => {
                match inbound {
                    Ok(Some(wire)) => {
                        match wire.into_parsed() {
                            Ok(msg) => dispatch_inbound(&shared, msg).await,
                            Err(err) => tracing::warn!(?err, "malformed frame"),
                        }
                    }
                    Ok(None) => break,
                    Err(err) => {
                        tracing::warn!(?err, "transport recv error");
                        break;
                    }
                }
            }
        }
    }

    // Teardown: close everything so waiters see Shutdown.
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
    let params_val: Value = n.params.unwrap_or(Value::Null);

    match n.method.as_str() {
        "action" => {
            if let Ok(envelope) = serde_json::from_value::<ActionNotificationParams>(params_val) {
                let channel = envelope.channel.clone();
                fan_out(shared, &channel, SubscriptionEvent::Action(envelope)).await;
            }
        }
        "root/sessionAdded" => {
            if let Ok(params) = serde_json::from_value::<SessionAddedParams>(params_val) {
                let channel = params.channel.clone();
                fan_out(shared, &channel, SubscriptionEvent::SessionAdded(params)).await;
            }
        }
        "root/sessionRemoved" => {
            if let Ok(params) = serde_json::from_value::<SessionRemovedParams>(params_val) {
                let channel = params.channel.clone();
                fan_out(shared, &channel, SubscriptionEvent::SessionRemoved(params)).await;
            }
        }
        "root/sessionSummaryChanged" => {
            if let Ok(params) = serde_json::from_value::<SessionSummaryChangedParams>(params_val) {
                let channel = params.channel.clone();
                fan_out(
                    shared,
                    &channel,
                    SubscriptionEvent::SessionSummaryChanged(params),
                )
                .await;
            }
        }
        "auth/required" => {
            if let Ok(params) = serde_json::from_value::<AuthRequiredParams>(params_val) {
                let channel = params.channel.clone();
                fan_out(shared, &channel, SubscriptionEvent::AuthRequired(params)).await;
            }
        }
        other => {
            tracing::debug!(method = %other, "unhandled notification");
        }
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
