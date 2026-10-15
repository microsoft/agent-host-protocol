//! Opt-in, consumer-driven subscription flow control.
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use ahp_types::commands::{ReconnectResult, SubscribeResult};
use ahp_types::messages::JsonRpcNotification;
use ahp_types::notifications::counts_against_window;
use ahp_types::state::{ChannelFlowControl, ChannelReceiveLimits};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{broadcast, oneshot, watch, Notify};

use crate::{Client, ClientConfig, ClientError, DispatchHandle, SubscriptionEvent, Transport};

const SAFE_INTEGER: u64 = (1 << 53) - 1;
pub(crate) const MAX_CONTROL_BYTES: u64 = 64 * 1024;
#[cfg(test)]
#[path = "windowing_tests.rs"]
mod tests;

/// Measure complete, unmodified JSON text in protocol UTF-16 bytes.
pub fn utf16_bytes(text: &str) -> u64 {
    text.encode_utf16().count() as u64 * 2
}

/// Additive transport hints. Parsed-only transports retain ordinary delivery.
#[derive(Clone, Debug, Default)]
#[non_exhaustive]
pub struct WindowTransportCapabilities {
    /// Whether incoming text and outgoing text preserve the actual wire representation.
    pub raw_text: bool,
    /// Safe receive limit in protocol UTF-16 bytes.
    pub maximum_frame_bytes: Option<u64>,
}
impl WindowTransportCapabilities {
    /// Assert exact-text support.
    pub fn raw_text(mut self, value: bool) -> Self {
        self.raw_text = value;
        self
    }
    /// Set the safe protocol frame limit.
    pub fn maximum_frame_bytes(mut self, value: u64) -> Self {
        self.maximum_frame_bytes = Some(value);
        self
    }
}

/// Coalescing direction.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[non_exhaustive]
pub enum Direction {
    /// Incoming consumer queue.
    #[default]
    Receive,
    /// Outgoing unsent queue.
    Send,
}
/// Context passed to custom coalescers.
#[derive(Clone, Debug, Default)]
#[non_exhaustive]
pub struct CoalescingContext {
    /// Subscription URI.
    pub channel: String,
    /// Queue direction.
    pub direction: Direction,
}
/// A connection-wide custom notification coalescer.
pub trait Coalescer: Send + Sync {
    /// Return a merged notification, or decline. Original inputs remain unchanged.
    fn merge(
        &self,
        earlier: &JsonRpcNotification,
        later: &JsonRpcNotification,
        context: &CoalescingContext,
    ) -> Option<JsonRpcNotification>;
}
impl<F> Coalescer for F
where
    F: Fn(
            &JsonRpcNotification,
            &JsonRpcNotification,
            &CoalescingContext,
        ) -> Option<JsonRpcNotification>
        + Send
        + Sync,
{
    fn merge(
        &self,
        earlier: &JsonRpcNotification,
        later: &JsonRpcNotification,
        context: &CoalescingContext,
    ) -> Option<JsonRpcNotification> {
        self(earlier, later, context)
    }
}
/// Connection defaults. Merely configuring these does not enable windowing.
#[derive(Clone)]
#[non_exhaustive]
pub struct WindowingConfig {
    pub(crate) window_bytes: u64,
    pub(crate) maximum_frame_bytes: Option<u64>,
    pub(crate) max_buffered_send_bytes: u64,
    pub(crate) coalescers: Vec<Arc<dyn Coalescer>>,
}
impl Default for WindowingConfig {
    fn default() -> Self {
        Self {
            window_bytes: 262_144,
            maximum_frame_bytes: None,
            max_buffered_send_bytes: 1_048_576,
            coalescers: vec![],
        }
    }
}
impl WindowingConfig {
    /// Default receive window.
    pub fn window_bytes(mut self, value: u64) -> Self {
        self.window_bytes = value;
        self
    }
    /// Override transport-derived maximum frame size.
    pub fn maximum_frame_bytes(mut self, value: u64) -> Self {
        self.maximum_frame_bytes = Some(value);
        self
    }
    /// Bound queued, unsent data per subscription.
    pub fn max_buffered_send_bytes(mut self, value: u64) -> Self {
        self.max_buffered_send_bytes = value;
        self
    }
    /// Register a custom coalescer before built-ins.
    pub fn coalescer(mut self, value: impl Coalescer + 'static) -> Self {
        self.coalescers.push(Arc::new(value));
        self
    }
    /// Replace the custom coalescer list.
    pub fn coalescers(mut self, values: Vec<Arc<dyn Coalescer>>) -> Self {
        self.coalescers = values;
        self
    }
}
/// Overrides for one subscription. Holding deliveries is manual receive control.
#[derive(Clone, Debug)]
#[non_exhaustive]
pub struct WindowOptions {
    pub(crate) window_bytes: Option<u64>,
    pub(crate) maximum_frame_bytes: Option<u64>,
    pub(crate) coalescing: bool,
}
impl Default for WindowOptions {
    fn default() -> Self {
        Self {
            window_bytes: None,
            maximum_frame_bytes: None,
            coalescing: true,
        }
    }
}
impl WindowOptions {
    /// Override the connection's receive window.
    pub fn window_bytes(mut self, value: u64) -> Self {
        self.window_bytes = Some(value);
        self
    }
    /// Override the connection's frame limit.
    pub fn maximum_frame_bytes(mut self, value: u64) -> Self {
        self.maximum_frame_bytes = Some(value);
        self
    }
    /// Enable or disable local queued-item coalescing.
    pub fn coalescing(mut self, value: bool) -> Self {
        self.coalescing = value;
        self
    }
}
/// Inspectable error for the additive windowing API.
#[derive(Clone, Debug, Default, thiserror::Error)]
#[error("{message}")]
#[non_exhaustive]
pub struct WindowError {
    /// Human-readable reason.
    pub message: String,
}
impl WindowError {
    /// Construct an error.
    pub fn message(mut self, message: impl Into<String>) -> Self {
        self.message = message.into();
        self
    }
    pub(crate) fn new(message: impl Into<String>) -> Self {
        Self::default().message(message)
    }
}
impl From<ClientError> for WindowError {
    fn from(value: ClientError) -> Self {
        Self::new(value.to_string())
    }
}
/// Current subscription flow-control status. Amounts are UTF-16 bytes.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct FlowControlStatus {
    /// `ordinary` or `windowed`.
    pub mode: String,
    /// `transport` or `declined`, when an opt-in falls back.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_reason: Option<String>,
    /// Accepted limits.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limits: Option<ChannelFlowControl>,
    /// Sent data awaiting host credit.
    pub outstanding_send_bytes: u64,
    /// Queued, unsent data.
    pub buffered_send_bytes: u64,
    /// Received data awaiting consumer release.
    pub buffered_receive_bytes: u64,
    /// Whether window and queue currently permit progress.
    pub writable: bool,
}
impl Default for FlowControlStatus {
    fn default() -> Self {
        Self {
            mode: "ordinary".into(),
            fallback_reason: None,
            limits: None,
            outstanding_send_bytes: 0,
            buffered_send_bytes: 0,
            buffered_receive_bytes: 0,
            writable: true,
        }
    }
}
impl FlowControlStatus {
    /// Set the delivery mode.
    pub fn mode(mut self, value: impl Into<String>) -> Self {
        self.mode = value.into();
        self
    }
    /// Set a fallback reason.
    pub fn fallback_reason(mut self, value: Option<String>) -> Self {
        self.fallback_reason = value;
        self
    }
    /// Set accepted limits.
    pub fn limits(mut self, value: Option<ChannelFlowControl>) -> Self {
        self.limits = value;
        self
    }
    /// Set outstanding sent bytes.
    pub fn outstanding_send_bytes(mut self, value: u64) -> Self {
        self.outstanding_send_bytes = value;
        self
    }
    /// Set queued sent bytes.
    pub fn buffered_send_bytes(mut self, value: u64) -> Self {
        self.buffered_send_bytes = value;
        self
    }
    /// Set unreleased received bytes.
    pub fn buffered_receive_bytes(mut self, value: u64) -> Self {
        self.buffered_receive_bytes = value;
        self
    }
    /// Set writability.
    pub fn writable(mut self, value: bool) -> Self {
        self.writable = value;
        self
    }
}
/// Observe-only connection flow-control event.
#[derive(Clone, Debug, Default, Serialize)]
#[non_exhaustive]
pub struct FlowControlEvent {
    /// Subscription URI.
    pub channel: String,
    /// negotiated, declined, blocked, unblocked, creditSent, creditReceived,
    /// fragmentedMessageReceived, fragmentedMessageSent, coalesced, resumed, dropped.
    pub kind: String,
    /// Status at the event.
    pub status: FlowControlStatus,
}
impl FlowControlEvent {
    /// Set the subscription URI.
    pub fn channel(mut self, value: impl Into<String>) -> Self {
        self.channel = value.into();
        self
    }
    /// Set the event kind.
    pub fn kind(mut self, value: impl Into<String>) -> Self {
        self.kind = value.into();
        self
    }
    /// Set the associated status.
    pub fn status(mut self, value: FlowControlStatus) -> Self {
        self.status = value;
        self
    }
}
/// Non-breaking client configuration builder.
#[derive(Default)]
#[non_exhaustive]
pub struct ClientBuilder {
    config: ClientConfig,
    windowing: WindowingConfig,
}
impl ClientBuilder {
    /// Configure the existing request timeout.
    pub fn default_request_timeout(mut self, value: Option<std::time::Duration>) -> Self {
        self.config.default_request_timeout = value;
        self
    }
    /// Configure existing ordinary broadcast buffering.
    pub fn subscription_buffer(mut self, value: usize) -> Self {
        self.config.subscription_buffer = value;
        self
    }
    /// Replace existing client options.
    pub fn config(mut self, value: ClientConfig) -> Self {
        self.config = value;
        self
    }
    /// Set opt-in window defaults and coalescers.
    pub fn windowing(mut self, value: WindowingConfig) -> Self {
        self.windowing = value;
        self
    }
    /// Connect through a pluggable transport.
    pub async fn connect<T: Transport>(self, transport: T) -> Result<Client, ClientError> {
        Client::connect_configured(transport, self.config, self.windowing).await
    }
}
/// A notification and its exact accounting receipt.
pub struct Delivery {
    event: SubscriptionEvent,
    notification: JsonRpcNotification,
    bytes: u64,
    release_bytes: u64,
    epoch: u64,
    channel: Arc<Channel>,
}
impl Delivery {
    /// Typed consumer event.
    pub fn event(&self) -> &SubscriptionEvent {
        &self.event
    }
    /// Original or locally coalesced notification.
    pub fn notification(&self) -> &JsonRpcNotification {
        &self.notification
    }
    /// Sum of original message/fragment wire sizes.
    pub fn wire_bytes(&self) -> u64 {
        self.bytes
    }
    /// Release credit; subsequent release or Drop is a no-op.
    pub fn release(&mut self) {
        let bytes = std::mem::take(&mut self.release_bytes);
        if bytes != 0 {
            let mut state = self.channel.lock();
            if state.epoch == self.epoch && !state.closed && !state.dropped {
                state.released += bytes;
                self.channel.publish(&state);
                self.channel.wake.notify_one();
            }
        }
    }
}
impl Drop for Delivery {
    fn drop(&mut self) {
        self.release();
    }
}
/// Single owning, reliable subscription queue (ordinary fallback remains lossy).
pub struct WindowedSubscription {
    pub(crate) channel: Arc<Channel>,
    client: Client,
    pub(crate) host_id: Option<crate::hosts::HostId>,
}
impl WindowedSubscription {
    pub(crate) fn new(channel: Arc<Channel>, client: Client) -> Self {
        channel.owners.fetch_add(1, Ordering::Relaxed);
        channel.drop_requested.store(false, Ordering::Release);
        Self {
            channel,
            client,
            host_id: None,
        }
    }
    /// Channel URI.
    pub fn uri(&self) -> &str {
        &self.channel.uri
    }
    /// Host of a managed multi-host subscription.
    pub fn host_id(&self) -> Option<&crate::hosts::HostId> {
        self.host_id.as_ref()
    }
    /// Take the next delivery. Dropping it releases its credit.
    pub async fn next(&mut self) -> Result<Option<Delivery>, WindowError> {
        loop {
            let notified = self.channel.ready.notified();
            let item = {
                let mut state = self.channel.lock();
                if let Some(item) = state.received.pop_front() {
                    state.initial_delivered = true;
                    Some(item)
                } else if let Some(error) = &state.error {
                    if state.managed && !state.dropped {
                        None
                    } else {
                        return Err(error.clone());
                    }
                } else if state.closed {
                    if state.managed && !state.dropped {
                        None
                    } else {
                        return Ok(None);
                    }
                } else {
                    None
                }
            };
            if let Some(item) = item {
                let event = crate::client::decode_notification(item.notification.clone())
                    .map_err(WindowError::new)?;
                return Ok(Some(Delivery {
                    event,
                    notification: item.notification,
                    bytes: item.bytes,
                    release_bytes: item.release_bytes,
                    epoch: item.epoch,
                    channel: self.channel.clone(),
                }));
            }
            notified.await;
        }
    }
    /// A flow-controlled sender for this channel.
    pub fn sender(&self) -> ChannelSender {
        ChannelSender {
            channel: self.channel.clone(),
        }
    }
    /// Current flow-control status.
    pub fn status(&self) -> FlowControlStatus {
        self.channel.status.borrow().clone()
    }
    /// A watch stream of status changes.
    pub fn status_changes(&self) -> watch::Receiver<FlowControlStatus> {
        self.channel.status.subscribe()
    }
    /// Wait until the send window and queue have room.
    pub async fn wait_writable(&self) -> Result<(), WindowError> {
        self.sender().wait_writable().await
    }
}
impl Drop for WindowedSubscription {
    fn drop(&mut self) {
        if self.channel.owners.fetch_sub(1, Ordering::AcqRel) == 1 {
            self.channel.drop_requested.store(true, Ordering::Release);
            self.channel.schedule_drop(self.client.clone());
        }
    }
}
/// Flow-controlled notification sender.
#[derive(Clone)]
pub struct ChannelSender {
    channel: Arc<Channel>,
}
impl ChannelSender {
    fn current_client(&self) -> Result<Client, WindowError> {
        self.channel
            .binding
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .and_then(crate::client::ClientBinding::upgrade)
            .ok_or_else(|| WindowError::new("connection closed"))
    }
    /// Current status.
    pub fn status(&self) -> FlowControlStatus {
        self.channel.status.borrow().clone()
    }
    /// Observe status changes.
    pub fn status_changes(&self) -> watch::Receiver<FlowControlStatus> {
        self.channel.status.subscribe()
    }
    /// Advisory wait, not a send reservation.
    pub async fn wait_writable(&self) -> Result<(), WindowError> {
        let mut changes = self.status_changes();
        loop {
            {
                let state = self.channel.lock();
                if let Some(error) = &state.error {
                    if !state.managed || state.dropped {
                        return Err(error.clone());
                    }
                }
                if state.closed && (!state.managed || state.dropped) {
                    return Err(WindowError::new("subscription closed"));
                }
            }
            if changes.borrow().writable {
                return Ok(());
            }
            changes
                .changed()
                .await
                .map_err(|_| WindowError::new("subscription closed"))?;
        }
    }
    /// Send and await the actual transport write, not host processing.
    pub async fn send<P: Serialize>(&self, method: &str, params: P) -> Result<(), WindowError> {
        if self.channel.lock().closed {
            return Err(WindowError::new("subscription connection closed"));
        }
        let mut params =
            serde_json::to_value(params).map_err(|e| WindowError::new(e.to_string()))?;
        let object = params
            .as_object_mut()
            .ok_or_else(|| WindowError::new("notification params must be an object"))?;
        if object
            .get("channel")
            .is_some_and(|value| value != &self.channel.uri)
        {
            return Err(WindowError::new("notification channel mismatch"));
        }
        object.insert("channel".into(), self.channel.uri.clone().into());
        self.current_client()?.window_send(method, params).await
    }
    /// Dispatch an individually sequenced action and await transport write.
    pub async fn dispatch(
        &self,
        action: ahp_types::actions::StateAction,
    ) -> Result<DispatchHandle, WindowError> {
        if self.channel.lock().closed {
            return Err(WindowError::new("subscription connection closed"));
        }
        self.current_client()?
            .window_dispatch(self.channel.uri.clone(), action)
            .await
    }
}

struct Received {
    notification: JsonRpcNotification,
    bytes: u64,
    release_bytes: u64,
    epoch: u64,
}
struct Queued {
    notification: JsonRpcNotification,
    text: String,
    offset: usize,
    bytes: u64,
    parts: Vec<QueuedPart>,
}
struct QueuedPart {
    notification: JsonRpcNotification,
    completion: Option<oneshot::Sender<Result<(), WindowError>>>,
}
pub(crate) struct ChannelState {
    options: WindowOptions,
    offer: Option<ChannelReceiveLimits>,
    limits: Option<ChannelFlowControl>,
    fallback: Option<String>,
    epoch: u64,
    sent: u64,
    consumed: u64,
    received_bytes: u64,
    released: u64,
    advertised: u64,
    credit_since: Option<tokio::time::Instant>,
    received: VecDeque<Received>,
    outgoing: VecDeque<Queued>,
    queued_bytes: u64,
    fragment: String,
    fragment_bytes: u64,
    snapshot_expected: bool,
    pub(crate) retained_seq: Option<i64>,
    pub(crate) closed: bool,
    error: Option<WindowError>,
    dropped: bool,
    pending_options: Option<WindowOptions>,
    accepted: bool,
    initial_delivered: bool,
    pub(crate) managed: bool,
    dropped_notified: bool,
    pub(crate) drop_hook: Option<Arc<dyn Fn() + Send + Sync>>,
}
pub(crate) struct Channel {
    pub(crate) uri: String,
    state: Mutex<ChannelState>,
    ready: Notify,
    wake: Arc<Notify>,
    status: watch::Sender<FlowControlStatus>,
    events: Mutex<broadcast::Sender<FlowControlEvent>>,
    max_send: u64,
    ordinary_buffer: usize,
    pub(crate) binding: Mutex<Option<crate::client::ClientBinding>>,
    owners: AtomicUsize,
    acquisitions: AtomicUsize,
    drop_requested: AtomicBool,
}
impl Channel {
    pub(crate) fn begin_acquisition(&self) {
        self.acquisitions.fetch_add(1, Ordering::AcqRel);
    }
    pub(crate) fn end_acquisition(self: &Arc<Self>, client: Client) {
        if self.acquisitions.fetch_sub(1, Ordering::AcqRel) == 1
            && self.drop_requested.load(Ordering::Acquire)
        {
            self.schedule_drop(client);
        }
    }
    fn schedule_drop(self: &Arc<Self>, fallback: Client) {
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            let channel = self.clone();
            runtime.spawn(async move {
                let _ = fallback
                    .unsubscribe_if_current(&channel.uri, &channel)
                    .await;
            });
        }
    }
    pub(crate) fn lock(&self) -> std::sync::MutexGuard<'_, ChannelState> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub(crate) fn options(&self) -> WindowOptions {
        self.lock().options.clone()
    }
    pub(crate) fn windowed(&self) -> bool {
        self.lock().limits.is_some()
    }
    pub(crate) fn dropped(&self) -> bool {
        self.lock().dropped
    }
    pub(crate) fn unowned_drop(&self) -> bool {
        self.drop_requested.load(Ordering::Acquire)
            && self.owners.load(Ordering::Acquire) == 0
            && self.acquisitions.load(Ordering::Acquire) == 0
    }
    pub(crate) fn finish(&self, error: Option<WindowError>) {
        let mut state = self.lock();
        state.managed = false;
        state.dropped = true;
        state.closed = true;
        state.error = error;
        state.credit_since = None;
        self.publish(&state);
        self.status.send_modify(|_| {});
        self.ready.notify_waiters();
        if !state.dropped_notified {
            state.dropped_notified = true;
            self.event("dropped");
        }
        let hook = state.drop_hook.take();
        drop(state);
        if let Some(hook) = hook {
            hook();
        }
    }
    fn publish(&self, state: &ChannelState) {
        let status = FlowControlStatus {
            mode: if state.limits.is_some() {
                "windowed"
            } else {
                "ordinary"
            }
            .into(),
            fallback_reason: state.fallback.clone(),
            limits: state.limits.clone(),
            outstanding_send_bytes: state.sent - state.consumed,
            buffered_send_bytes: state.queued_bytes,
            buffered_receive_bytes: state.received_bytes - state.released,
            writable: state.accepted
                && !state.closed
                && state
                    .queued_bytes
                    .saturating_sub(state.outgoing.front().map_or(0, |item| item.bytes))
                    < self.max_send
                && state.limits.as_ref().map_or(true, |limits| {
                    state.sent - state.consumed < limits.host_receive.window_bytes as u64
                }),
        };
        let previous = self.status.borrow().clone();
        let was_writable = previous.writable;
        if previous != status {
            self.status.send_replace(status.clone());
        }
        if was_writable != status.writable {
            self.event(if status.writable {
                "unblocked"
            } else {
                "blocked"
            });
        }
    }
    fn event(&self, kind: &str) {
        let event = FlowControlEvent::default()
            .channel(self.uri.clone())
            .kind(kind)
            .status(self.status.borrow().clone());
        tracing::debug!(channel = %event.channel, kind, status = ?event.status, "flow control");
        let _ = self
            .events
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .send(event);
    }
}
enum PendingKind {
    Subscribe {
        uri: String,
        channel: std::sync::Weak<Channel>,
        offer: Option<ChannelReceiveLimits>,
        options: Option<WindowOptions>,
    },
    Reconnect {
        windows: Vec<ResumeOffer>,
        ordinary: ChannelScope,
    },
    Initialize(ChannelScope),
}
struct ChannelScope {
    channels: Vec<std::sync::Weak<Channel>>,
    uris: Vec<String>,
}
struct ResumeOffer {
    uri: String,
    channel: std::sync::Weak<Channel>,
    offer: Option<ChannelReceiveLimits>,
}
struct PendingOperation {
    kind: PendingKind,
    abandoned: bool,
    sent: bool,
}
struct EngineState {
    channels: HashMap<String, Arc<Channel>>,
    pending: HashMap<u64, PendingOperation>,
    cursor: usize,
}
pub(crate) struct Engine {
    state: Mutex<EngineState>,
    pub(crate) config: WindowingConfig,
    capabilities: WindowTransportCapabilities,
    pub(crate) wake: Arc<Notify>,
    pub(crate) events: broadcast::Sender<FlowControlEvent>,
    ordinary_buffer: usize,
}
pub(crate) struct WireSend {
    pub(crate) text: String,
    pub(crate) control: bool,
    completions: Vec<oneshot::Sender<Result<(), WindowError>>>,
    event: Option<(Arc<Channel>, &'static str)>,
    channel: Arc<Channel>,
    epoch: u64,
}
impl WireSend {
    pub(crate) fn is_live(&self) -> bool {
        let state = self.channel.lock();
        !state.closed && state.epoch == self.epoch
    }
    pub(crate) fn complete(self, result: Result<(), WindowError>) {
        if result.is_ok() {
            if let Some((channel, kind)) = self.event {
                channel.event(kind);
            }
        }
        for completion in self.completions {
            let _ = completion.send(result.clone());
        }
    }
}
impl Engine {
    pub(crate) fn new(
        config: WindowingConfig,
        capabilities: WindowTransportCapabilities,
        ordinary_buffer: usize,
    ) -> Self {
        let (events, _) = broadcast::channel(256);
        Self {
            state: Mutex::new(EngineState {
                channels: HashMap::new(),
                pending: HashMap::new(),
                cursor: 0,
            }),
            config,
            capabilities,
            wake: Arc::new(Notify::new()),
            events,
            ordinary_buffer,
        }
    }
    fn lock(&self) -> std::sync::MutexGuard<'_, EngineState> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub(crate) fn subscription(&self, uri: &str) -> Option<Arc<Channel>> {
        self.lock().channels.get(uri).cloned()
    }
    pub(crate) fn has_subscriptions(&self) -> bool {
        !self.lock().channels.is_empty()
    }
    pub(crate) fn has_windowed(&self) -> bool {
        self.lock()
            .channels
            .values()
            .any(|channel| channel.windowed())
    }
    fn capture_scope(&self) -> ChannelScope {
        let channels = self.managed_channels();
        ChannelScope {
            uris: channels.iter().map(|channel| channel.uri.clone()).collect(),
            channels: channels.iter().map(Arc::downgrade).collect(),
        }
    }
    pub(crate) fn prepare(
        &self,
        uri: &str,
        options: WindowOptions,
    ) -> Result<Option<ChannelReceiveLimits>, WindowError> {
        if self.lock().pending.len() >= 256 {
            return Err(WindowError::new("too many pending window negotiations"));
        }
        if utf16_bytes(&json!({"jsonrpc":"2.0","method":"channel/credit","params":{"channel":uri,"consumedBytes":SAFE_INTEGER}}).to_string()) > MAX_CONTROL_BYTES {
            return Err(WindowError::new("channel URI exceeds control message limit"));
        }
        let offer = ChannelReceiveLimits {
            window_bytes: options.window_bytes.unwrap_or(self.config.window_bytes) as i64,
            maximum_frame_bytes: options
                .maximum_frame_bytes
                .or(self.config.maximum_frame_bytes)
                .or(self.capabilities.maximum_frame_bytes)
                .unwrap_or(1_048_576) as i64,
        };
        validate_limits(&offer)?;
        if self.config.max_buffered_send_bytes == 0 {
            return Err(WindowError::new("send buffer must be positive"));
        }
        let mut engine = self.lock();
        let channel = engine
            .channels
            .entry(uri.into())
            .or_insert_with(|| {
                let (status, _) = watch::channel(FlowControlStatus::default());
                Arc::new(Channel {
                    uri: uri.into(),
                    state: Mutex::new(ChannelState {
                        options: options.clone(),
                        offer: None,
                        limits: None,
                        fallback: None,
                        epoch: 0,
                        sent: 0,
                        consumed: 0,
                        received_bytes: 0,
                        released: 0,
                        advertised: 0,
                        credit_since: None,
                        received: VecDeque::new(),
                        outgoing: VecDeque::new(),
                        queued_bytes: 0,
                        fragment: String::new(),
                        fragment_bytes: 0,
                        snapshot_expected: false,
                        retained_seq: None,
                        closed: false,
                        error: None,
                        dropped: false,
                        pending_options: None,
                        accepted: false,
                        initial_delivered: false,
                        managed: false,
                        dropped_notified: false,
                        drop_hook: None,
                    }),
                    ready: Notify::new(),
                    wake: self.wake.clone(),
                    status,
                    events: Mutex::new(self.events.clone()),
                    max_send: self.config.max_buffered_send_bytes,
                    ordinary_buffer: self.ordinary_buffer,
                    binding: Mutex::new(None),
                    owners: AtomicUsize::new(0),
                    acquisitions: AtomicUsize::new(0),
                    drop_requested: AtomicBool::new(false),
                })
            })
            .clone();
        let mut state = channel.lock();
        state.pending_options = Some(options);
        if state.limits.is_none() {
            state.fallback = (!self.capabilities.raw_text).then(|| "transport".into());
        }
        let offer = self.capabilities.raw_text.then_some(offer);
        channel.publish(&state);
        Ok(offer)
    }
    pub(crate) fn register_request(
        &self,
        id: u64,
        method: &str,
        params: &mut Value,
    ) -> Result<(), WindowError> {
        if matches!(method, "subscribe" | "reconnect" | "initialize")
            && self.lock().pending.len() >= 256
        {
            return Err(WindowError::new("too many pending window negotiations"));
        }
        if method == "subscribe" {
            if !self.capabilities.raw_text && params.get("flowControl").is_some() {
                let uri = params["channel"]
                    .as_str()
                    .ok_or_else(|| WindowError::new("channel missing"))?;
                self.prepare(uri, WindowOptions::default())?;
                if let Some(object) = params.as_object_mut() {
                    object.remove("flowControl");
                }
            }
            let uri = params["channel"]
                .as_str()
                .ok_or_else(|| WindowError::new("subscribe channel missing"))?;
            if uri.starts_with("ahp-tcp:") && params.get("flowControl").is_none() {
                return Err(WindowError::new("TCP requires windowing"));
            }
            let offer: Option<ChannelReceiveLimits> = params
                .pointer("/flowControl/receive")
                .map(|v| {
                    serde_json::from_value(v.clone()).map_err(|e| WindowError::new(e.to_string()))
                })
                .transpose()?;
            if let Some(limits) = &offer {
                validate_limits(limits)?;
                if self.subscription(uri).is_none() {
                    self.prepare(
                        uri,
                        WindowOptions::default()
                            .window_bytes(limits.window_bytes as u64)
                            .maximum_frame_bytes(limits.maximum_frame_bytes as u64),
                    )?;
                }
            }
            if let Some(channel) = self.subscription(uri) {
                channel.lock().pending_options = None;
                let options = Some(channel.options());
                self.lock().pending.insert(
                    id,
                    PendingOperation {
                        kind: PendingKind::Subscribe {
                            uri: uri.into(),
                            channel: Arc::downgrade(&channel),
                            offer,
                            options,
                        },
                        abandoned: false,
                        sent: false,
                    },
                );
            }
        } else if method == "initialize" {
            if params["initialSubscriptions"]
                .as_array()
                .is_some_and(|channels| {
                    channels
                        .iter()
                        .any(|uri| uri.as_str().is_some_and(|uri| uri.starts_with("ahp-tcp:")))
                })
            {
                return Err(WindowError::new("TCP cannot be an initial subscription"));
            }
            if !self.lock().channels.is_empty() {
                let channels = self.capture_scope();
                self.lock().pending.insert(
                    id,
                    PendingOperation {
                        kind: PendingKind::Initialize(channels),
                        abandoned: false,
                        sent: false,
                    },
                );
            }
        } else if method == "reconnect" {
            if params["subscriptions"].as_array().is_some_and(|channels| {
                channels
                    .iter()
                    .any(|uri| uri.as_str().is_some_and(|uri| uri.starts_with("ahp-tcp:")))
            }) {
                return Err(WindowError::new("TCP cannot be resumed"));
            }
            if !self.capabilities.raw_text {
                if let Some(items) = params.pointer("/windows/items").and_then(Value::as_array) {
                    for item in items {
                        let uri = item["channel"]
                            .as_str()
                            .ok_or_else(|| WindowError::new("resume channel missing"))?;
                        self.prepare(uri, WindowOptions::default())?;
                    }
                }
                if let Some(object) = params.as_object_mut() {
                    object.remove("windows");
                }
            }
            if let Some(items) = params.pointer("/windows/items").and_then(Value::as_array) {
                let mut channels: Vec<ResumeOffer> = Vec::new();
                for item in items {
                    let uri = item["channel"]
                        .as_str()
                        .ok_or_else(|| WindowError::new("resume channel missing"))?;
                    if uri.starts_with("ahp-tcp:") || channels.iter().any(|c| c.uri == uri) {
                        return Err(WindowError::new("invalid resume channel"));
                    }
                    if !params["subscriptions"]
                        .as_array()
                        .is_some_and(|subscriptions| subscriptions.iter().any(|value| value == uri))
                    {
                        return Err(WindowError::new("resume channel is not subscribed"));
                    }
                    let limits: ChannelReceiveLimits =
                        serde_json::from_value(item["flowControl"]["receive"].clone())
                            .map_err(|e| WindowError::new(e.to_string()))?;
                    let options = self
                        .subscription(uri)
                        .map(|channel| channel.lock().options.clone())
                        .unwrap_or_default();
                    let offer = self.prepare(
                        uri,
                        options
                            .window_bytes(limits.window_bytes as u64)
                            .maximum_frame_bytes(limits.maximum_frame_bytes as u64),
                    )?;
                    if let Some(channel) = self.subscription(uri) {
                        let mut state = channel.lock();
                        state.offer = offer;
                        if let Some(sequence) = item["lastAppliedServerSeq"].as_i64() {
                            if sequence < 0 || sequence as u64 > SAFE_INTEGER {
                                return Err(WindowError::new("invalid retained sequence"));
                            }
                            state.retained_seq =
                                Some(state.retained_seq.unwrap_or(0).max(sequence));
                        }
                    }
                    let channel = self
                        .subscription(uri)
                        .ok_or_else(|| WindowError::new("subscription cancelled"))?;
                    channels.push(ResumeOffer {
                        uri: uri.into(),
                        offer: channel.lock().offer.clone(),
                        channel: Arc::downgrade(&channel),
                    });
                }
                let ordinary = self.capture_scope();
                self.lock().pending.insert(
                    id,
                    PendingOperation {
                        kind: PendingKind::Reconnect {
                            windows: channels,
                            ordinary,
                        },
                        abandoned: false,
                        sent: false,
                    },
                );
            } else if self.has_subscriptions() {
                let ordinary = self.capture_scope();
                self.lock().pending.insert(
                    id,
                    PendingOperation {
                        kind: PendingKind::Reconnect {
                            windows: vec![],
                            ordinary,
                        },
                        abandoned: false,
                        sent: false,
                    },
                );
            }
        }
        Ok(())
    }
    pub(crate) fn register_owned(
        &self,
        id: u64,
        channel: &Arc<Channel>,
        options: WindowOptions,
        params: &Value,
    ) -> Result<(), WindowError> {
        let offer = params
            .pointer("/flowControl/receive")
            .map(|value| {
                serde_json::from_value(value.clone())
                    .map_err(|error| WindowError::new(error.to_string()))
            })
            .transpose()?;
        let mut engine = self.lock();
        if engine.pending.len() >= 256 {
            return Err(WindowError::new("too many pending window negotiations"));
        }
        if !engine
            .channels
            .get(&channel.uri)
            .is_some_and(|current| Arc::ptr_eq(current, channel))
        {
            return Err(WindowError::new("subscription cancelled"));
        }
        channel.lock().pending_options = None;
        engine.pending.insert(
            id,
            PendingOperation {
                kind: PendingKind::Subscribe {
                    uri: channel.uri.clone(),
                    channel: Arc::downgrade(channel),
                    offer,
                    options: Some(options),
                },
                abandoned: false,
                sent: false,
            },
        );
        Ok(())
    }
    pub(crate) fn response(&self, id: u64, result: &Value) -> Result<Vec<String>, WindowError> {
        let mut cleanup = vec![];
        let operation = self
            .lock()
            .pending
            .remove(&id)
            .map(|operation| operation.kind);
        match operation {
            Some(PendingKind::Subscribe {
                uri,
                channel,
                offer,
                options,
            }) => {
                let current = self.subscription(&uri);
                let Some(channel) = channel.upgrade().filter(|channel| {
                    current
                        .as_ref()
                        .is_some_and(|current| Arc::ptr_eq(current, channel))
                }) else {
                    return Ok(current.is_none().then_some(uri).into_iter().collect());
                };
                let result: SubscribeResult = serde_json::from_value(result.clone())
                    .map_err(|e| WindowError::new(e.to_string()))?;
                channel.lock().pending_options = options;
                if !self.install(&channel, offer, result.flow_control, true)? {
                    return Ok(self
                        .subscription(&uri)
                        .is_none()
                        .then_some(uri)
                        .into_iter()
                        .collect());
                }
                if let Some(snapshot) = result.snapshot {
                    if channel.lock().limits.is_some() {
                        return Err(WindowError::new(
                            "accepted subscription has result snapshot",
                        ));
                    }
                    self.receive_on(&channel, json!({"jsonrpc":"2.0","method":"channel/snapshot","params":{"channel":uri,"snapshot":snapshot}}), 0, 0)?;
                }
            }
            Some(PendingKind::Reconnect { windows, ordinary }) => {
                let channels: Vec<_> = windows.iter().map(|window| window.uri.clone()).collect();
                let result: ReconnectResult = serde_json::from_value(result.clone())
                    .map_err(|e| WindowError::new(e.to_string()))?;
                let resumed = match &result {
                    ReconnectResult::Replay(result) => result.windows.clone(),
                    ReconnectResult::Snapshot(result) => result.windows.clone(),
                };
                let items = resumed.map(|w| w.items).unwrap_or_default();
                for channel in ordinary
                    .channels
                    .iter()
                    .filter_map(|channel| channel.upgrade())
                    .filter(|channel| self.is_current(channel))
                {
                    if !channels.contains(&channel.uri) {
                        self.install(&channel, None, None, false)?;
                    }
                }
                let mut seen = std::collections::HashSet::new();
                for item in &items {
                    if !channels.contains(&item.channel) || !seen.insert(item.channel.clone()) {
                        return Err(WindowError::new("unsolicited or duplicate resumed channel"));
                    }
                }
                match &result {
                    ReconnectResult::Replay(result) => {
                        for action in &result.actions {
                            if channels.contains(&action.channel) {
                                return Err(WindowError::new(
                                    "windowed replay must arrive as data",
                                ));
                            }
                            if ordinary
                                .channels
                                .iter()
                                .filter_map(|channel| channel.upgrade())
                                .any(|channel| {
                                    channel.uri == action.channel && self.is_current(&channel)
                                })
                                && !channels.contains(&action.channel)
                            {
                                self.receive(
                                    json!({"jsonrpc":"2.0","method":"action","params":action}),
                                    0,
                                    0,
                                )?;
                            }
                        }
                    }
                    ReconnectResult::Snapshot(result) => {
                        for snapshot in &result.snapshots {
                            if channels.contains(&snapshot.resource) {
                                return Err(WindowError::new(
                                    "windowed snapshot must arrive as data",
                                ));
                            }
                            if ordinary
                                .channels
                                .iter()
                                .filter_map(|channel| channel.upgrade())
                                .any(|channel| {
                                    channel.uri == snapshot.resource && self.is_current(&channel)
                                })
                                && !channels.contains(&snapshot.resource)
                            {
                                self.receive(json!({"jsonrpc":"2.0","method":"channel/snapshot","params":{"channel":snapshot.resource,"snapshot":snapshot}}), 0, 0)?;
                            }
                        }
                    }
                }
                for window in windows {
                    if let Some(channel) = window
                        .channel
                        .upgrade()
                        .filter(|channel| self.is_current(channel))
                    {
                        if let Some(item) = items.iter().find(|item| item.channel == window.uri) {
                            self.install(
                                &channel,
                                window.offer,
                                Some(item.flow_control.clone()),
                                item.recovery == ahp_types::state::ChannelRecoveryKind::Snapshot,
                            )?;
                            channel.event("resumed");
                        } else {
                            self.fail_subscription(
                                &channel,
                                WindowError::new("subscription dropped by reconnect"),
                            );
                        }
                    } else if self.subscription(&window.uri).is_none()
                        && items.iter().any(|item| item.channel == window.uri)
                    {
                        cleanup.push(window.uri);
                    }
                }
                for uri in ordinary.uris {
                    if self.subscription(&uri).is_none() && !cleanup.contains(&uri) {
                        cleanup.push(uri);
                    }
                }
            }
            Some(PendingKind::Initialize(channels)) => {
                let result: ahp_types::commands::InitializeResult =
                    serde_json::from_value(result.clone())
                        .map_err(|e| WindowError::new(e.to_string()))?;
                for channel in channels
                    .channels
                    .iter()
                    .filter_map(|channel| channel.upgrade())
                    .filter(|channel| self.is_current(channel))
                {
                    channel.lock().retained_seq = None;
                    self.install(&channel, None, None, false)?;
                }
                for snapshot in result.snapshots {
                    if channels
                        .channels
                        .iter()
                        .filter_map(|channel| channel.upgrade())
                        .any(|channel| {
                            channel.uri == snapshot.resource && self.is_current(&channel)
                        })
                    {
                        self.receive(json!({"jsonrpc":"2.0","method":"channel/snapshot","params":{"channel":snapshot.resource,"snapshot":snapshot}}), 0, 0)?;
                    }
                }
                for uri in channels.uris {
                    if self.subscription(&uri).is_none() {
                        cleanup.push(uri);
                    }
                }
            }
            None => {}
        }
        Ok(cleanup)
    }
    pub(crate) fn failed_request(&self, id: u64) {
        let operation = self.lock().pending.remove(&id);
        let channels: Vec<_> = match operation.map(|operation| operation.kind) {
            Some(PendingKind::Subscribe { channel, .. }) => channel.upgrade().into_iter().collect(),
            Some(PendingKind::Reconnect { ordinary, .. })
            | Some(PendingKind::Initialize(ordinary)) => ordinary
                .channels
                .iter()
                .filter_map(|channel| channel.upgrade())
                .filter(|channel| !channel.lock().managed)
                .collect(),
            None => vec![],
        };
        for channel in channels {
            self.cleanup_unaccepted(&channel);
        }
    }
    pub(crate) fn expire_request(&self, id: u64) {
        let channels = {
            let mut engine = self.lock();
            let Some(operation) = engine.pending.get_mut(&id) else {
                return;
            };
            operation.abandoned = true;
            let channels: Vec<_> = match &operation.kind {
                PendingKind::Subscribe { channel, .. } => channel.upgrade().into_iter().collect(),
                PendingKind::Reconnect { ordinary, .. } | PendingKind::Initialize(ordinary) => {
                    ordinary
                        .channels
                        .iter()
                        .filter_map(|channel| channel.upgrade())
                        .collect()
                }
            };
            if !operation.sent {
                engine.pending.remove(&id);
            }
            channels
        };
        for channel in channels {
            self.cleanup_unaccepted(&channel);
        }
    }

    pub(crate) fn has_request(&self, id: u64) -> bool {
        self.lock().pending.contains_key(&id)
    }

    pub(crate) fn request_sent(&self, id: u64) -> bool {
        if let Some(operation) = self.lock().pending.get_mut(&id) {
            if operation.abandoned {
                return false;
            }
            operation.sent = true;
            return true;
        }
        false
    }
    fn is_current(&self, channel: &Arc<Channel>) -> bool {
        self.subscription(&channel.uri)
            .is_some_and(|current| Arc::ptr_eq(&current, channel))
    }

    fn has_pending(engine: &EngineState, channel: &Arc<Channel>) -> bool {
        engine.pending.values().any(|operation| !operation.abandoned && matches!(&operation.kind,
            PendingKind::Subscribe { channel: pending, .. } if pending.ptr_eq(&Arc::downgrade(channel))))
    }

    pub(crate) fn cleanup_unaccepted(&self, channel: &Arc<Channel>) {
        let mut engine = self.lock();
        if !channel.lock().accepted
            && !Self::has_pending(&engine, channel)
            && engine
                .channels
                .get(&channel.uri)
                .is_some_and(|current| Arc::ptr_eq(current, channel))
        {
            engine.channels.remove(&channel.uri);
            channel.lock().pending_options = None;
            self.close_channel(
                channel,
                Some(WindowError::new("subscription negotiation cancelled")),
            );
        }
    }
    fn install(
        &self,
        channel: &Arc<Channel>,
        offer: Option<ChannelReceiveLimits>,
        limits: Option<ChannelFlowControl>,
        snapshot: bool,
    ) -> Result<bool, WindowError> {
        let mut state = channel.lock();
        if state.closed {
            return Ok(false);
        }
        if let Some(limits) = &limits {
            validate_limits(&limits.client_receive)?;
            validate_limits(&limits.host_receive)?;
            let offer = offer
                .as_ref()
                .ok_or_else(|| WindowError::new("unoffered window acceptance"))?;
            if limits.client_receive.window_bytes > offer.window_bytes
                || limits.client_receive.maximum_frame_bytes > offer.maximum_frame_bytes
            {
                return Err(WindowError::new("accepted limits exceed offer"));
            }
        } else if channel.uri.starts_with("ahp-tcp:") {
            return Err(WindowError::new("TCP requires window acceptance"));
        }
        if let Some(options) = state.pending_options.take() {
            state.options = options;
        }
        if state.limits.is_some() != limits.is_some() {
            state.epoch += 1;
            state.sent = 0;
            state.consumed = 0;
            state.received_bytes = 0;
            state.released = 0;
            state.advertised = 0;
            state.credit_since = None;
        }
        state.offer = offer;
        state.limits = limits;
        state.accepted = true;
        state.snapshot_expected = snapshot && state.limits.is_some();
        if state.limits.is_none() && state.fallback.is_none() {
            state.fallback = Some("declined".into());
        } else if state.limits.is_some() {
            state.fallback = None;
        }
        channel.publish(&state);
        channel.event(if state.limits.is_some() {
            "negotiated"
        } else {
            "declined"
        });
        self.wake.notify_one();
        if channel.unowned_drop() {
            let client = channel
                .binding
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .as_ref()
                .and_then(crate::client::ClientBinding::upgrade);
            if let Some(client) = client {
                channel.schedule_drop(client);
            }
        }
        Ok(true)
    }
    pub(crate) fn inbound(
        &self,
        notification: JsonRpcNotification,
        bytes: Option<u64>,
    ) -> Result<Option<JsonRpcNotification>, WindowError> {
        if !counts_against_window(&notification.method)
            && bytes.is_some_and(|bytes| bytes > MAX_CONTROL_BYTES)
        {
            return Err(WindowError::new("control message exceeds size limit"));
        }
        let params = notification.params.as_ref().unwrap_or(&Value::Null);
        let Some(uri) = params["channel"].as_str() else {
            return Ok(Some(notification));
        };
        let Some(channel) = self.subscription(uri) else {
            return Ok(Some(notification));
        };
        if channel.lock().closed {
            return Ok(None);
        }
        if !channel.lock().accepted && !channel.windowed() {
            if matches!(
                notification.method.as_str(),
                "channel/frame" | "channel/snapshot" | "channel/credit"
            ) {
                // Traffic from a retired subscription may still be in flight.
                return Ok(None);
            }
            return Ok(Some(notification));
        }
        if notification.method == "channel/credit" {
            let credit = params["consumedBytes"]
                .as_u64()
                .filter(|v| *v <= SAFE_INTEGER)
                .ok_or_else(|| WindowError::new("invalid credit"))?;
            let mut state = channel.lock();
            if state.closed {
                return Ok(None);
            }
            if state.limits.is_none() {
                return Err(WindowError::new("credit on ordinary subscription"));
            }
            if credit > state.sent {
                return Err(WindowError::new("credit exceeds sent bytes"));
            }
            if credit > state.consumed {
                state.consumed = credit;
                channel.publish(&state);
                channel.event("creditReceived");
                self.wake.notify_one();
            }
            return Ok(None);
        }
        let charged =
            channel.lock().limits.is_some() && counts_against_window(&notification.method);
        let bytes = if charged {
            bytes.ok_or_else(|| WindowError::new("transport lost raw text"))?
        } else {
            0
        };
        if charged {
            let mut state = channel.lock();
            if state.closed {
                return Ok(None);
            }
            if !state.accepted {
                return Err(WindowError::new("data before negotiation response"));
            }
            let limits = state
                .limits
                .as_ref()
                .ok_or_else(|| WindowError::new("missing limits"))?;
            if bytes > limits.client_receive.maximum_frame_bytes as u64 {
                return Err(WindowError::new("data exceeds maximum frame bytes"));
            }
            state.received_bytes = checked_total(state.received_bytes, bytes)?;
            channel.publish(&state);
        }
        if notification.method == "channel/frame" {
            if !charged {
                return Err(WindowError::new("frame on ordinary subscription"));
            }
            let data = params["data"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or_else(|| WindowError::new("empty fragment"))?;
            if params.get("final").is_some_and(|value| !value.is_boolean()) {
                return Err(WindowError::new("invalid fragment final flag"));
            }
            let mut state = channel.lock();
            if state.closed {
                return Ok(None);
            }
            state.fragment.push_str(data);
            state.fragment_bytes = checked_total(state.fragment_bytes, bytes)?;
            if params["final"].as_bool() != Some(true) {
                state.released += bytes;
                channel.publish(&state);
                self.wake.notify_one();
                return Ok(None);
            }
            let joined = std::mem::take(&mut state.fragment);
            let total = std::mem::take(&mut state.fragment_bytes);
            drop(state);
            let value: Value =
                serde_json::from_str(&joined).map_err(|e| WindowError::new(e.to_string()))?;
            if value["params"]["channel"] != uri
                || value.get("id").is_some()
                || value["method"]
                    .as_str()
                    .map_or(true, |m| m == "channel/frame" || !counts_against_window(m))
            {
                return Err(WindowError::new("invalid joined fragment notification"));
            }
            if !self.receive_on(&channel, value.clone(), total, bytes)? {
                return Ok(None);
            }
            channel.event("fragmentedMessageReceived");
            let message: JsonRpcNotification =
                serde_json::from_value(value).map_err(|e| WindowError::new(e.to_string()))?;
            return Ok(Some(message));
        }
        if charged && !channel.lock().fragment.is_empty() {
            return Err(WindowError::new("interleaved fragment data"));
        }
        let value =
            serde_json::to_value(&notification).map_err(|e| WindowError::new(e.to_string()))?;
        if !self.receive_on(&channel, value, bytes, bytes)? {
            return Ok(None);
        }
        Ok(Some(notification))
    }
    fn receive(&self, value: Value, bytes: u64, release_bytes: u64) -> Result<bool, WindowError> {
        let uri = value["params"]["channel"]
            .as_str()
            .ok_or_else(|| WindowError::new("channel missing"))?;
        let Some(channel) = self.subscription(uri) else {
            return Ok(false);
        };
        self.receive_on(&channel, value, bytes, release_bytes)
    }

    fn receive_on(
        &self,
        channel: &Arc<Channel>,
        value: Value,
        bytes: u64,
        release_bytes: u64,
    ) -> Result<bool, WindowError> {
        let uri = channel.uri.as_str();
        let mut state = channel.lock();
        if state.closed {
            return Ok(false);
        }
        let notification: JsonRpcNotification =
            serde_json::from_value(value.clone()).map_err(|e| WindowError::new(e.to_string()))?;
        crate::client::decode_notification(notification.clone()).map_err(WindowError::new)?;
        if state.snapshot_expected && counts_against_window(&notification.method) {
            if notification.method != "channel/snapshot" {
                return Err(WindowError::new("first delivery must be snapshot"));
            }
            state.snapshot_expected = false;
        }
        if notification.method == "channel/snapshot"
            && value["params"]["snapshot"]["resource"] != uri
        {
            return Err(WindowError::new("snapshot resource mismatch"));
        }
        let seq = value["params"]["serverSeq"]
            .as_i64()
            .or_else(|| value["params"]["snapshot"]["fromSeq"].as_i64());
        if let Some(seq) = seq {
            state.retained_seq = Some(state.retained_seq.unwrap_or(0).max(seq));
        }
        let epoch = state.epoch;
        if state.options.coalescing && state.limits.is_some() {
            if let Some(tail) = state.received.back_mut() {
                if tail.epoch == epoch {
                    if let Some(merged) = merge(
                        &self.config.coalescers,
                        &tail.notification,
                        &notification,
                        Direction::Receive,
                    ) {
                        tail.notification = merged;
                        tail.bytes += bytes;
                        tail.release_bytes += release_bytes;
                        channel.event("coalesced");
                        channel.ready.notify_one();
                        return Ok(true);
                    }
                }
            }
        }
        let reserved_snapshot = usize::from(
            !state.initial_delivered
                && state
                    .received
                    .front()
                    .is_some_and(|item| item.notification.method == "channel/snapshot"),
        );
        if state.limits.is_none()
            && state.received.len().saturating_sub(reserved_snapshot) >= channel.ordinary_buffer
        {
            state.received.remove(reserved_snapshot);
        }
        state.received.push_back(Received {
            notification,
            bytes,
            release_bytes,
            epoch,
        });
        channel.ready.notify_one();
        Ok(true)
    }
    pub(crate) async fn enqueue(
        &self,
        notification: JsonRpcNotification,
        completion: Option<oneshot::Sender<Result<(), WindowError>>>,
    ) -> Result<(), WindowError> {
        let uri = notification
            .params
            .as_ref()
            .and_then(|p| p["channel"].as_str())
            .ok_or_else(|| WindowError::new("channel missing"))?;
        let channel = self
            .subscription(uri)
            .ok_or_else(|| WindowError::new("subscription missing"))?;
        let text =
            serde_json::to_string(&notification).map_err(|e| WindowError::new(e.to_string()))?;
        let bytes = utf16_bytes(&text);
        let mut completion = completion;
        let mut changes = channel.status.subscribe();
        loop {
            {
                let mut state = channel.lock();
                if state.closed {
                    return Err(state
                        .error
                        .clone()
                        .unwrap_or_else(|| WindowError::new("subscription closed")));
                }
                let behind = state
                    .queued_bytes
                    .saturating_sub(state.outgoing.front().map_or(0, |item| item.bytes));
                if state.outgoing.is_empty() || behind.saturating_add(bytes) <= channel.max_send {
                    if state.options.coalescing && state.limits.is_some() {
                        if let Some(tail) = state.outgoing.back_mut().filter(|tail| {
                            tail.offset == 0 && tail.bytes.saturating_add(bytes) <= channel.max_send
                        }) {
                            if let Some(merged) = merge(
                                &self.config.coalescers,
                                &tail.notification,
                                &notification,
                                Direction::Send,
                            ) {
                                let merged_text = serde_json::to_string(&merged)
                                    .map_err(|e| WindowError::new(e.to_string()))?;
                                tail.notification = merged;
                                tail.text = merged_text;
                                tail.bytes += bytes;
                                tail.parts.push(QueuedPart {
                                    notification: notification.clone(),
                                    completion: completion.take(),
                                });
                                state.queued_bytes += bytes;
                                channel.publish(&state);
                                channel.event("coalesced");
                                self.wake.notify_one();
                                return Ok(());
                            }
                        }
                    }
                    state.outgoing.push_back(Queued {
                        notification: notification.clone(),
                        text,
                        offset: 0,
                        bytes,
                        parts: vec![QueuedPart {
                            notification,
                            completion: completion.take(),
                        }],
                    });
                    state.queued_bytes += bytes;
                    channel.publish(&state);
                    self.wake.notify_one();
                    return Ok(());
                }
            }
            changes
                .changed()
                .await
                .map_err(|_| WindowError::new("subscription closed"))?;
        }
    }
    pub(crate) fn next_send(&self) -> Result<Option<WireSend>, WindowError> {
        let mut engine = self.lock();
        let mut channels: Vec<_> = engine.channels.values().cloned().collect();
        channels.sort_by(|a, b| a.uri.cmp(&b.uri));
        for channel in &channels {
            let mut state = channel.lock();
            if state.closed || !state.accepted {
                continue;
            }
            if state.limits.is_some() && state.released > state.advertised {
                let limits = state
                    .limits
                    .as_ref()
                    .ok_or_else(|| WindowError::new("missing limits"))?;
                let threshold = (limits.client_receive.window_bytes as u64 / 4).clamp(1, 16_384);
                let stalled = state.received_bytes - state.advertised
                    >= limits.client_receive.window_bytes as u64;
                let since = *state
                    .credit_since
                    .get_or_insert_with(tokio::time::Instant::now);
                if !stalled
                    && state.released - state.advertised < threshold
                    && since.elapsed() < std::time::Duration::from_millis(5)
                {
                    continue;
                }
                state.advertised = state.released;
                state.credit_since = None;
                let text = json!({"jsonrpc":"2.0","method":"channel/credit","params":{"channel":channel.uri,"consumedBytes":state.released}}).to_string();
                return Ok(Some(WireSend {
                    text,
                    control: true,
                    completions: vec![],
                    event: Some((channel.clone(), "creditSent")),
                    channel: channel.clone(),
                    epoch: state.epoch,
                }));
            }
        }
        for index in 0..channels.len() {
            let position = (engine.cursor + index) % channels.len();
            let channel = &channels[position];
            let mut state = channel.lock();
            if state.closed || !state.accepted {
                continue;
            }
            self.remove_cancelled(&mut state)?;
            if state.outgoing.is_empty() {
                channel.publish(&state);
                continue;
            }
            let outstanding = state.sent - state.consumed;
            let limits = state.limits.as_ref().map(|l| l.host_receive.clone());
            if limits
                .as_ref()
                .is_some_and(|l| outstanding >= l.window_bytes as u64)
            {
                continue;
            }
            let mut item = state
                .outgoing
                .pop_front()
                .ok_or_else(|| WindowError::new("queue disappeared"))?;
            let (text, final_frame) = if limits
                .as_ref()
                .is_some_and(|l| utf16_bytes(&item.text) > l.maximum_frame_bytes as u64)
            {
                let limits = limits
                    .as_ref()
                    .ok_or_else(|| WindowError::new("missing send limits"))?;
                let (text, end) = fragment(
                    &channel.uri,
                    &item.text,
                    item.offset,
                    limits.maximum_frame_bytes as u64,
                    (limits.window_bytes as u64).saturating_sub(outstanding),
                )?;
                item.offset = end;
                (text, end == item.text.len())
            } else {
                (item.text.clone(), true)
            };
            if limits.is_some() {
                state.sent = checked_total(state.sent, utf16_bytes(&text))?;
            }
            let event = (final_frame && item.offset != 0)
                .then(|| (channel.clone(), "fragmentedMessageSent"));
            let completions = if final_frame {
                state.queued_bytes -= item.bytes;
                item.parts
                    .into_iter()
                    .filter_map(|part| part.completion)
                    .collect()
            } else {
                state.outgoing.push_front(item);
                vec![]
            };
            channel.publish(&state);
            engine.cursor = position + 1;
            return Ok(Some(WireSend {
                text,
                control: false,
                completions,
                event,
                channel: channel.clone(),
                epoch: state.epoch,
            }));
        }
        Ok(None)
    }
    fn close_channel(&self, channel: &Arc<Channel>, error: Option<WindowError>) {
        let mut state = channel.lock();
        state.closed = true;
        state.error = error.clone();
        state.credit_since = None;
        state.fragment.clear();
        state.fragment_bytes = 0;
        for item in state.outgoing.drain(..) {
            for completion in item.parts.into_iter().filter_map(|part| part.completion) {
                let _ = completion.send(Err(error
                    .clone()
                    .unwrap_or_else(|| WindowError::new("connection closed"))));
            }
        }
        state.queued_bytes = 0;
        channel.publish(&state);
        channel.status.send_modify(|_| {});
        channel.ready.notify_waiters();
        if (!state.managed || state.dropped) && !state.dropped_notified {
            state.dropped_notified = true;
            channel.event("dropped");
        }
    }
    pub(crate) fn close(&self, error: Option<WindowError>) {
        self.lock().pending.clear();
        let channels: Vec<_> = self.lock().channels.values().cloned().collect();
        for channel in channels {
            self.close_channel(&channel, error.clone());
        }
    }
    pub(crate) fn remove_and(
        &self,
        uri: &str,
        expected: Option<&Arc<Channel>>,
        queued: impl FnOnce(),
    ) -> bool {
        let mut engine = self.lock();
        if let Some(expected) = expected {
            if !engine
                .channels
                .get(uri)
                .is_some_and(|current| Arc::ptr_eq(current, expected))
                || expected.owners.load(Ordering::Acquire) != 0
                || expected.acquisitions.load(Ordering::Acquire) != 0
                || expected.lock().pending_options.is_some()
                || Self::has_pending(&engine, expected)
            {
                return false;
            }
        }
        if let Some(channel) = engine.channels.remove(uri) {
            channel.finish(None);
            self.close_channel(&channel, None);
            let hook = channel.lock().drop_hook.clone();
            if let Some(hook) = hook {
                hook();
            }
        }
        queued();
        true
    }

    pub(crate) fn fail_subscription(&self, channel: &Arc<Channel>, error: WindowError) {
        let mut engine = self.lock();
        if engine
            .channels
            .get(&channel.uri)
            .is_some_and(|current| Arc::ptr_eq(current, channel))
        {
            engine.channels.remove(&channel.uri);
        }
        channel.finish(Some(error.clone()));
        self.close_channel(channel, Some(error));
        let hook = channel.lock().drop_hook.clone();
        if let Some(hook) = hook {
            hook();
        }
    }
    fn remove_cancelled(&self, state: &mut ChannelState) -> Result<(), WindowError> {
        while state.outgoing.front().is_some_and(|item| {
            item.offset == 0
                && item.parts.iter().any(|part| {
                    part.completion
                        .as_ref()
                        .is_some_and(oneshot::Sender::is_closed)
                })
        }) {
            let item = state
                .outgoing
                .pop_front()
                .ok_or_else(|| WindowError::new("queue disappeared"))?;
            state.queued_bytes -= item.bytes;
            let mut rebuilt: Vec<Queued> = vec![];
            for part in item.parts.into_iter().filter(|part| {
                !part
                    .completion
                    .as_ref()
                    .is_some_and(oneshot::Sender::is_closed)
            }) {
                let text = serde_json::to_string(&part.notification)
                    .map_err(|e| WindowError::new(e.to_string()))?;
                let bytes = utf16_bytes(&text);
                state.queued_bytes += bytes;
                if let Some(tail) = rebuilt.last_mut() {
                    if let Some(merged) = merge(
                        &self.config.coalescers,
                        &tail.notification,
                        &part.notification,
                        Direction::Send,
                    ) {
                        tail.text = serde_json::to_string(&merged)
                            .map_err(|e| WindowError::new(e.to_string()))?;
                        tail.notification = merged;
                        tail.bytes += bytes;
                        tail.parts.push(part);
                        continue;
                    }
                }
                rebuilt.push(Queued {
                    notification: part.notification.clone(),
                    text,
                    offset: 0,
                    bytes,
                    parts: vec![part],
                });
            }
            for item in rebuilt.into_iter().rev() {
                state.outgoing.push_front(item);
            }
        }
        Ok(())
    }

    pub(crate) fn managed_channels(&self) -> Vec<Arc<Channel>> {
        self.lock()
            .channels
            .values()
            .filter(|channel| {
                !channel.uri.starts_with("ahp-tcp:")
                    && !channel.lock().dropped
                    && !channel.unowned_drop()
            })
            .cloned()
            .collect()
    }

    pub(crate) fn adopt(&self, channel: Arc<Channel>) -> Result<(), WindowError> {
        let options = {
            let mut state = channel.lock();
            state.epoch += 1;
            state.sent = 0;
            state.consumed = 0;
            state.received_bytes = 0;
            state.released = 0;
            state.advertised = 0;
            state.fragment.clear();
            state.credit_since = None;
            state.fragment_bytes = 0;
            state.closed = false;
            state.error = None;
            state.dropped_notified = false;
            state.accepted = false;
            state.options.clone()
        };
        self.lock()
            .channels
            .insert(channel.uri.clone(), channel.clone());
        *channel.events.lock().unwrap_or_else(|e| e.into_inner()) = self.events.clone();
        let offer = self.prepare(&channel.uri, options)?;
        let mut state = channel.lock();
        state.offer = offer;
        if state.offer.is_none() {
            state.limits = None;
            state.snapshot_expected = false;
        }
        channel.publish(&state);
        Ok(())
    }

    pub(crate) fn resume_windows(
        &self,
    ) -> Option<ahp_types::commands::ChannelDeliveryResumeOptions> {
        use ahp_types::commands::{
            ChannelDeliveryResumeOptions, ChannelDeliveryResumeParams,
            SubscriptionFlowControlOptions,
        };
        let items: Vec<_> = self
            .managed_channels()
            .into_iter()
            .filter_map(|channel| {
                let state = channel.lock();
                state.limits.as_ref()?;
                Some(ChannelDeliveryResumeParams {
                    channel: channel.uri.clone(),
                    flow_control: SubscriptionFlowControlOptions {
                        receive: state.offer.clone()?,
                    },
                    last_applied_server_seq: state.retained_seq,
                })
            })
            .collect();
        (!items.is_empty()).then_some(ChannelDeliveryResumeOptions { items })
    }
}

fn validate_limits(limits: &ChannelReceiveLimits) -> Result<(), WindowError> {
    if limits.window_bytes < 1
        || limits.maximum_frame_bytes < 1024
        || limits.window_bytes as u64 > SAFE_INTEGER
        || limits.maximum_frame_bytes as u64 > SAFE_INTEGER
    {
        return Err(WindowError::new("invalid window limits"));
    }
    Ok(())
}
fn checked_total(value: u64, increment: u64) -> Result<u64, WindowError> {
    value
        .checked_add(increment)
        .filter(|v| *v <= SAFE_INTEGER)
        .ok_or_else(|| WindowError::new("window counter overflow"))
}
fn fragment(
    uri: &str,
    text: &str,
    offset: usize,
    maximum: u64,
    remaining: u64,
) -> Result<(String, usize), WindowError> {
    let ends: Vec<_> = text[offset..]
        .char_indices()
        .map(|(i, c)| offset + i + c.len_utf8())
        .collect();
    let first = *ends
        .first()
        .ok_or_else(|| WindowError::new("empty outbound fragment"))?;
    let encode = |end: usize| {
        json!({"jsonrpc":"2.0","method":"channel/frame","params":{"channel":uri,"data":&text[offset..end],"final":end==text.len()}}).to_string()
    };
    let minimum = utf16_bytes(&encode(first));
    if minimum > maximum {
        return Err(WindowError::new(
            "frame envelope cannot carry one character",
        ));
    }
    let target = maximum.min(remaining.max(minimum));
    let mut low = 0;
    let mut high = ends.len();
    while low < high {
        let middle = (low + high) / 2;
        if utf16_bytes(&encode(ends[middle])) <= target {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    let end = ends[low.saturating_sub(1)];
    Ok((encode(end), end))
}
fn merge(
    rules: &[Arc<dyn Coalescer>],
    earlier: &JsonRpcNotification,
    later: &JsonRpcNotification,
    direction: Direction,
) -> Option<JsonRpcNotification> {
    if earlier.method != later.method
        || !counts_against_window(&earlier.method)
        || matches!(
            earlier.method.as_str(),
            "channel/snapshot" | "channel/frame" | "tcp/eof" | "dispatchAction"
        )
    {
        return None;
    }
    let a = earlier.params.as_ref()?;
    let b = later.params.as_ref()?;
    if a["channel"] != b["channel"]
        || a.get("origin").is_some()
        || b.get("origin").is_some()
        || a.get("rejectionReason").is_some()
        || b.get("rejectionReason").is_some()
    {
        return None;
    }
    let context = CoalescingContext {
        channel: a["channel"].as_str()?.into(),
        direction,
    };
    for rule in rules {
        if let Some(result) = rule.merge(earlier, later, &context) {
            if result.method == earlier.method
                && result
                    .params
                    .as_ref()
                    .is_some_and(|params| params["channel"] == a["channel"])
                && crate::client::decode_notification(result.clone()).is_ok()
            {
                return Some(result);
            }
        }
    }
    let mut merged = later.clone();
    let params = merged.params.as_mut()?;
    if direction == Direction::Receive && earlier.method == "action" {
        let kind = a["action"]["type"].as_str()?;
        if kind != b["action"]["type"].as_str()? {
            return None;
        }
        let field = match kind {
            "terminal/data" => "data",
            "chat/delta"
                if a["action"]["turnId"] == b["action"]["turnId"]
                    && a["action"]["partId"] == b["action"]["partId"]
                    && a["action"]["_meta"] == b["action"]["_meta"] =>
            {
                "content"
            }
            _ => return None,
        };
        params["action"][field] = format!(
            "{}{}",
            a["action"][field].as_str()?,
            b["action"][field].as_str()?
        )
        .into();
        return Some(merged);
    }
    if direction == Direction::Send && earlier.method == "tcp/data" {
        use base64::Engine as _;
        let mut data = base64::engine::general_purpose::STANDARD
            .decode(a["data"].as_str()?)
            .ok()?;
        data.extend(
            base64::engine::general_purpose::STANDARD
                .decode(b["data"].as_str()?)
                .ok()?,
        );
        params["data"] = base64::engine::general_purpose::STANDARD
            .encode(data)
            .into();
        return Some(merged);
    }
    None
}
