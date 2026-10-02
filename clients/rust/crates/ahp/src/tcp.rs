//! Owned, flow-controlled protocol byte streams. Native sockets and transport
//! reconnection policy belong to the consumer, not this module.

use std::collections::{BTreeMap, VecDeque};
use std::sync::{Arc, Weak};

use ahp_types::actions::*;
use ahp_types::commands::{
    DispatchActionParams, ReconnectParams, ReconnectResult, SubscribeParams, SubscribeResult,
    TcpConnectionSubscription,
};
use ahp_types::state::{
    FlowControlledByteDirectionState, SnapshotState, TcpConnectionState, TcpDataEncoding,
    TcpResetReason,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use tokio::sync::{oneshot, watch, Mutex};

use crate::{
    apply_action_to_tcp, Client, ClientError, ReduceOutcome, StrictClientEventStream,
    SubscriptionEvent, TransportError,
};

const MAX_SAFE: i64 = (1 << 53) - 1;
const MAX_WINDOW_BYTES: i64 = (1 << 32) - 1;

/// Errors from an owned TCP protocol stream.
#[derive(Debug, Clone, thiserror::Error)]
pub enum TcpError {
    /// The operation's arguments or the negotiated capability are invalid.
    #[error("invalid TCP operation: {0}")]
    Invalid(&'static str),
    /// The host violated the stream protocol.
    #[error("TCP protocol error: {0}")]
    Protocol(String),
    /// An underlying client operation failed.
    #[error("TCP client error: {0}")]
    Client(#[source] Arc<ClientError>),
    /// An endpoint reset the stream.
    #[error("TCP reset: {0:?}")]
    Reset(TcpResetReason),
    /// Final close terminated the stream.
    #[error("TCP connection closed")]
    Closed,
    /// The owner explicitly disposed the stream.
    #[error("TCP connection disposed")]
    Disposed,
    /// A snapshot or missing resource cannot restore retained byte ownership.
    #[error("TCP replay unavailable")]
    ReplayUnavailable,
}

impl From<ClientError> for TcpError {
    fn from(error: ClientError) -> Self {
        Self::Client(Arc::new(error))
    }
}

struct Pending {
    action: StateAction,
    sent: u64,
}

struct Inner {
    client: Client,
    state: TcpConnectionState,
    checkpoint: i64,
    last_seq: u64,
    epoch: u64,
    online: bool,
    resuming: bool,
    ending: bool,
    closing: bool,
    close_queued: bool,
    terminal: bool,
    error: Option<TcpError>,
    cleanup: Option<Result<(), TcpError>>,
    pending: BTreeMap<i64, Pending>,
    received: VecDeque<Vec<u8>>,
    sent_bytes: i64,
    consumed: i64,
}

struct Shared {
    resource: String,
    owner: String,
    inner: Mutex<Inner>,
    changed: watch::Sender<u64>,
    writer: Arc<Mutex<()>>,
    resume: Arc<Mutex<()>>,
    send: Mutex<()>,
}

impl Shared {
    fn wake(&self) {
        self.changed
            .send_modify(|value| *value = value.wrapping_add(1));
    }
}

impl Drop for Shared {
    fn drop(&mut self) {
        let inner = self.inner.get_mut();
        if inner.terminal {
            return;
        }
        inner.terminal = true;
        let client = inner.client.clone();
        let resource = self.resource.clone();
        match tokio::runtime::Handle::try_current() {
            Ok(runtime) => {
                runtime.spawn(async move {
                    let seq = client.tcp_next_sequence();
                    if seq <= MAX_SAFE as u64 {
                        if let Err(error) = client
                            .notify(
                                "dispatchAction",
                                DispatchActionParams {
                                    channel: resource.clone(),
                                    client_seq: seq as i64,
                                    action: StateAction::TcpClientReset(TcpClientResetAction {
                                        reason: TcpResetReason::ConnectionAborted,
                                    }),
                                },
                            )
                            .await
                        {
                            tracing::warn!(?error, "TCP drop reset failed");
                        }
                    }
                    if let Err(error) = client.unsubscribe(resource).await {
                        tracing::warn!(?error, "TCP drop unsubscribe failed");
                    }
                });
            }
            Err(error) => tracing::warn!(
                ?error,
                "TCP handle dropped outside runtime; use dispose before runtime shutdown"
            ),
        }
    }
}

/// An owned protocol stream. Clones share one reader queue and one writer permit.
/// Dropping the last handle aborts it; `dispose` awaits explicit cleanup.
#[derive(Clone)]
pub struct TcpConnection {
    shared: Arc<Shared>,
}

pub(crate) struct WeakTcpConnection(Weak<Shared>);

impl WeakTcpConnection {
    pub(crate) fn matches(&self, connection: &TcpConnection) -> bool {
        self.0.ptr_eq(&Arc::downgrade(&connection.shared))
    }
    pub(crate) fn upgrade(&self) -> Option<TcpConnection> {
        self.0.upgrade().map(|shared| TcpConnection { shared })
    }
}

fn reset_action(reason: TcpResetReason) -> StateAction {
    StateAction::TcpClientReset(TcpClientResetAction { reason })
}

fn close_action() -> StateAction {
    StateAction::TcpClientClose(TcpClientCloseAction {})
}

fn valid_direction(direction: &FlowControlledByteDirectionState) -> bool {
    (1..=MAX_WINDOW_BYTES).contains(&direction.window_bytes)
        && (1..=direction.window_bytes).contains(&direction.maximum_chunk_size)
        && direction.received_bytes == 0
        && direction.consumed_bytes == 0
        && direction.eof_at_bytes.is_none()
}

fn queue(inner: &mut Inner, action: StateAction) -> Result<(), TcpError> {
    let seq = inner.client.tcp_next_sequence();
    if seq == 0 || seq > MAX_SAFE as u64 {
        return Err(TcpError::Protocol("client sequence exhausted".into()));
    }
    inner.last_seq = seq;
    inner
        .pending
        .insert(seq as i64, Pending { action, sent: 0 });
    Ok(())
}

impl TcpConnection {
    pub(crate) fn downgrade(&self) -> WeakTcpConnection {
        WeakTcpConnection(Arc::downgrade(&self.shared))
    }

    /// Whether the stream has finally closed, as opposed to transport suspension.
    pub async fn is_closed(&self) -> bool {
        self.shared.inner.lock().await.terminal
    }
    /// Host-assigned child channel URI.
    pub fn resource(&self) -> &str {
        &self.shared.resource
    }

    /// Deliver one chunk and release its receive credit. EOF follows buffered data.
    pub async fn read(&self) -> Result<Option<Vec<u8>>, TcpError> {
        let mut changed = self.shared.changed.subscribe();
        loop {
            let mut inner = self.shared.inner.lock().await;
            if let Some(error) = &inner.error {
                return Err(error.clone());
            }
            if !inner.resuming {
                if let Some(data) = inner.received.front() {
                    let consumed_bytes = inner.consumed + data.len() as i64;
                    if !inner.terminal {
                        queue(
                            &mut inner,
                            StateAction::TcpDataConsumed(TcpDataConsumedAction { consumed_bytes }),
                        )?;
                    }
                    inner.consumed = consumed_bytes;
                    let data = inner.received.pop_front();
                    self.shared.wake();
                    return Ok(data);
                }
                if inner.state.output.eof_at_bytes.is_some() || inner.state.host_closed {
                    return Ok(None);
                }
            }
            if inner.terminal {
                return Ok(None);
            }
            drop(inner);
            changed.changed().await.map_err(|_| TcpError::Closed)?;
        }
    }

    /// Accept up to one negotiated chunk. A cancelled wait accepts no bytes.
    /// Only one writer is allowed. Use `write_all` to submit a complete slice.
    pub async fn write(&self, data: &[u8]) -> Result<usize, TcpError> {
        let _writer = self
            .shared
            .writer
            .clone()
            .try_lock_owned()
            .map_err(|_| TcpError::Invalid("writer is busy"))?;
        self.write_chunk(data).await
    }

    /// Submit a complete slice with bounded credit. Like standard `write_all`,
    /// cancellation may leave a prefix accepted; do not blindly retry the slice.
    pub async fn write_all(&self, data: &[u8]) -> Result<(), TcpError> {
        let _writer = self
            .shared
            .writer
            .clone()
            .try_lock_owned()
            .map_err(|_| TcpError::Invalid("writer is busy"))?;
        let mut offset = 0;
        while offset < data.len() {
            offset += self.write_chunk(&data[offset..]).await?;
        }
        Ok(())
    }

    async fn write_chunk(&self, data: &[u8]) -> Result<usize, TcpError> {
        let mut changed = self.shared.changed.subscribe();
        loop {
            let mut inner = self.shared.inner.lock().await;
            if let Some(error) = &inner.error {
                return Err(error.clone());
            }
            if inner.terminal || inner.ending {
                return Err(TcpError::Closed);
            }
            if data.is_empty() {
                return Ok(0);
            }
            let credit = inner.state.input.window_bytes
                - (inner.sent_bytes - inner.state.input.consumed_bytes);
            if inner.online && !inner.resuming && credit > 0 {
                let length =
                    (credit.min(inner.state.input.maximum_chunk_size) as usize).min(data.len());
                if inner.sent_bytes > MAX_SAFE - length as i64 {
                    drop(inner);
                    let error = TcpError::Protocol("byte offset exhausted".into());
                    self.finish(
                        Some(error.clone()),
                        Some(reset_action(TcpResetReason::ProtocolError)),
                        false,
                    )
                    .await;
                    return Err(error);
                }
                let action = StateAction::TcpInput(TcpInputAction {
                    offset: inner.sent_bytes,
                    data: STANDARD.encode(&data[..length]),
                });
                queue(&mut inner, action)?;
                inner.sent_bytes += length as i64;
                self.shared.wake();
                return Ok(length);
            }
            drop(inner);
            changed.changed().await.map_err(|_| TcpError::Closed)?;
        }
    }

    /// Wait until all accepted input is consumed by the host's destination buffer.
    pub async fn drain(&self) -> Result<(), TcpError> {
        let mut changed = self.shared.changed.subscribe();
        loop {
            let inner = self.shared.inner.lock().await;
            if let Some(error) = &inner.error {
                return Err(error.clone());
            }
            if inner.state.input.consumed_bytes >= inner.sent_bytes {
                return Ok(());
            }
            if inner.terminal {
                return Err(TcpError::Closed);
            }
            drop(inner);
            changed.changed().await.map_err(|_| TcpError::Closed)?;
        }
    }

    /// Half-close input after preceding writes; output remains readable.
    pub async fn end(&self) -> Result<(), TcpError> {
        let _writer = self
            .shared
            .writer
            .clone()
            .try_lock_owned()
            .map_err(|_| TcpError::Invalid("writer is busy"))?;
        let mut changed = self.shared.changed.subscribe();
        loop {
            let mut inner = self.shared.inner.lock().await;
            if let Some(error) = &inner.error {
                return Err(error.clone());
            }
            if inner.terminal {
                return Err(TcpError::Closed);
            }
            if !inner.resuming {
                if !inner.ending {
                    let final_offset = inner.sent_bytes;
                    queue(
                        &mut inner,
                        StateAction::TcpInputEof(TcpInputEofAction { final_offset }),
                    )?;
                    inner.ending = true;
                    self.shared.wake();
                }
                return Ok(());
            }
            drop(inner);
            changed.changed().await.map_err(|_| TcpError::Closed)?;
        }
    }

    /// Stop writes and await both close acknowledgements and consumed bytes.
    /// Continue reading concurrently to drain output. `dispose` aborts immediately.
    pub async fn close(&self) -> Result<(), TcpError> {
        if self.is_closed().await {
            return self.wait_cleanup().await;
        }
        let _writer = self
            .shared
            .writer
            .clone()
            .try_lock_owned()
            .map_err(|_| TcpError::Invalid("writer is busy"))?;
        {
            let mut inner = self.shared.inner.lock().await;
            inner.ending = true;
            inner.closing = true;
        }
        drop(_writer);
        self.shared.wake();
        self.advance_close().await;
        let mut changed = self.shared.changed.subscribe();
        loop {
            let inner = self.shared.inner.lock().await;
            if let Some(error) = &inner.error {
                return Err(error.clone());
            }
            if inner.terminal {
                drop(inner);
                return self.wait_cleanup().await;
            }
            drop(inner);
            changed.changed().await.map_err(|_| TcpError::Closed)?;
        }
    }

    async fn advance_close(&self) {
        let mut inner = self.shared.inner.lock().await;
        if inner.terminal || inner.resuming || !inner.closing {
            return;
        }
        let mut error = None;
        if !inner.close_queued
            && (inner.state.host_closed || inner.state.input.consumed_bytes == inner.sent_bytes)
        {
            match queue(&mut inner, close_action()) {
                Ok(()) => inner.close_queued = true,
                Err(failure) => error = Some(failure),
            }
            self.shared.wake();
        }
        let complete = inner.state.client_closed
            && inner.state.host_closed
            && inner.state.input.consumed_bytes == inner.sent_bytes
            && inner.consumed == inner.state.output.received_bytes
            && inner.state.output.consumed_bytes == inner.consumed
            && inner.pending.is_empty();
        drop(inner);
        if let Some(error) = error {
            self.finish(
                Some(error),
                Some(reset_action(TcpResetReason::ProtocolError)),
                false,
            )
            .await;
        } else if complete {
            self.finish(None, None, true).await;
        }
    }

    /// Abort, discard buffered bytes, and await exactly-once unsubscribe.
    pub async fn dispose(&self) -> Result<(), TcpError> {
        self.finish(
            Some(TcpError::Disposed),
            Some(reset_action(TcpResetReason::ConnectionAborted)),
            false,
        )
        .await;
        self.wait_cleanup().await
    }

    async fn wait_cleanup(&self) -> Result<(), TcpError> {
        let mut changed = self.shared.changed.subscribe();
        loop {
            if let Some(result) = &self.shared.inner.lock().await.cleanup {
                return result.clone();
            }
            changed.changed().await.map_err(|_| TcpError::Closed)?;
        }
    }

    pub(crate) async fn dispose_for_client(&self, client: &Client) -> Result<(), TcpError> {
        if self
            .finish_for_client(
                Some(TcpError::Disposed),
                Some(reset_action(TcpResetReason::ConnectionAborted)),
                false,
                Some(client),
            )
            .await
        {
            self.wait_cleanup().await
        } else {
            Ok(())
        }
    }

    async fn finish(&self, error: Option<TcpError>, action: Option<StateAction>, preserve: bool) {
        self.finish_for_client(error, action, preserve, None).await;
    }

    async fn finish_for_client(
        &self,
        error: Option<TcpError>,
        action: Option<StateAction>,
        preserve: bool,
        owner: Option<&Client>,
    ) -> bool {
        let mut inner = self.shared.inner.lock().await;
        if owner.is_some_and(|owner| !inner.client.tcp_same_transport(owner)) {
            return false;
        }
        if inner.terminal {
            return true;
        }
        inner.terminal = true;
        inner.online = false;
        inner.resuming = false;
        inner.error = error;
        inner.pending.clear();
        if !preserve {
            inner.received.clear();
        }
        let client = inner.client.clone();
        drop(inner);
        self.shared.wake();
        let shared = self.shared.clone();
        tokio::spawn(async move {
            let _send = shared.send.lock().await;
            let mut error = None;
            if let Some(action) = action.filter(|_| !client.tcp_is_closed()) {
                let seq = client.tcp_next_sequence();
                if seq > MAX_SAFE as u64 {
                    error = Some(TcpError::Protocol("client sequence exhausted".into()));
                } else if let Err(failure) = client
                    .notify(
                        "dispatchAction",
                        DispatchActionParams {
                            channel: shared.resource.clone(),
                            client_seq: seq as i64,
                            action,
                        },
                    )
                    .await
                {
                    error = Some(failure.into());
                }
            }
            if !client.tcp_is_closed() {
                if let Err(failure) = client.unsubscribe(shared.resource.clone()).await {
                    if error.is_none() {
                        error = Some(failure.into());
                    } else {
                        tracing::warn!(?failure, "TCP unsubscribe failed after close failure");
                    }
                }
            }
            let mut inner = shared.inner.lock().await;
            inner.cleanup = Some(error.map_or(Ok(()), Err));
            shared.wake();
            drop(inner);
            drop(_send);
            client.tcp_unregister(&TcpConnection { shared }).await;
        });
        true
    }

    async fn suspend(&self, epoch: u64) {
        let mut inner = self.shared.inner.lock().await;
        if inner.epoch != epoch || inner.terminal {
            return;
        }
        inner.online = false;
        inner.resuming = false;
        self.shared.wake();
    }

    async fn accept(&self, envelope: ActionEnvelope, epoch: u64) {
        let mut inner = self.shared.inner.lock().await;
        if inner.epoch != epoch || inner.terminal || envelope.channel != self.shared.resource {
            return;
        }
        let malformed = crate::client::strict_action_error(&envelope.action);
        let mut next = inner.state.clone();
        let mut error = malformed
            .map(|error| TcpError::Client(Arc::new(ClientError::Transport(error))))
            .or_else(|| envelope.rejection_reason.map(TcpError::Protocol));
        let client_echo = matches!(
            &envelope.action,
            StateAction::TcpInput(_)
                | StateAction::TcpDataConsumed(_)
                | StateAction::TcpInputEof(_)
                | StateAction::TcpClientClose(_)
                | StateAction::TcpClientReset(_)
        );
        let mut pending_exists = false;
        if client_echo {
            match &envelope.origin {
                Some(origin)
                    if origin.client_id == self.shared.owner
                        && (1..=MAX_SAFE).contains(&origin.client_seq)
                        && origin.client_seq as u64 <= inner.last_seq =>
                {
                    if let Some(pending) = inner.pending.get(&origin.client_seq) {
                        pending_exists = true;
                        if pending.action != envelope.action {
                            error = Some(TcpError::Protocol(
                                "TCP echo does not match pending action".into(),
                            ));
                        }
                    }
                }
                _ => error = Some(TcpError::Protocol("invalid client TCP echo origin".into())),
            }
        }
        if envelope.server_seq <= inner.checkpoint as u64 && error.is_none() {
            return;
        }
        if envelope.server_seq > MAX_SAFE as u64 {
            error = Some(TcpError::Protocol("invalid server sequence".into()));
        }
        if error.is_none() {
            match apply_action_to_tcp(&mut next, &envelope.action) {
                ReduceOutcome::Invalid(failure) => {
                    error = Some(TcpError::Protocol(failure.to_string()))
                }
                ReduceOutcome::Applied if client_echo && !pending_exists => {
                    error = Some(TcpError::Protocol(
                        "unacknowledged TCP state advanced without a matching pending action"
                            .into(),
                    ));
                }
                _ => {}
            }
        }
        if error.is_none()
            && (next.input.received_bytes > inner.sent_bytes
                || next.output.consumed_bytes > inner.consumed
                || next.output.received_bytes - inner.consumed > next.output.window_bytes)
        {
            error = Some(TcpError::Protocol(
                "host exceeded owned byte counters".into(),
            ));
        }
        if error.is_none() && next.output.received_bytes > inner.state.output.received_bytes {
            if let StateAction::TcpData(action) = &envelope.action {
                match STANDARD.decode(&action.data) {
                    Ok(bytes) => inner.received.push_back(bytes),
                    Err(failure) => error = Some(TcpError::Protocol(failure.to_string())),
                }
            }
        }
        if error.is_none() {
            inner.state = next;
            inner.checkpoint = envelope.server_seq as i64;
            if client_echo {
                if let Some(origin) = envelope.origin {
                    inner.pending.remove(&origin.client_seq);
                }
            }
        }
        let reset = inner.state.reset.clone();
        if inner.state.host_closed {
            inner.ending = true;
            inner.closing = true;
        }
        drop(inner);
        self.shared.wake();
        if let Some(error) = error {
            self.finish(
                Some(error),
                Some(reset_action(TcpResetReason::ProtocolError)),
                false,
            )
            .await;
        } else if let Some(reset) = reset {
            self.finish(Some(TcpError::Reset(reset.reason)), None, false)
                .await;
        } else {
            self.advance_close().await;
        }
    }

    fn start(&self, epoch: u64, mut events: StrictClientEventStream) {
        let weak = Arc::downgrade(&self.shared);
        let mut changed = self.shared.changed.subscribe();
        tokio::spawn(async move {
            loop {
                let Some(shared) = weak.upgrade() else { return };
                let inner = shared.inner.lock().await;
                if inner.epoch != epoch || inner.terminal || !inner.online {
                    return;
                }
                drop(inner);
                drop(shared);
                tokio::select! {
                    event = events.recv() => {
                        let Some(shared) = weak.upgrade() else { return };
                        let connection = TcpConnection { shared };
                        match event {
                            Ok(Some(event)) => if let SubscriptionEvent::Action(action) = event.event { connection.accept(action, epoch).await; },
                            Ok(None) => { connection.suspend(epoch).await; return; },
                            Err(error) => {
                                if matches!(error, ClientError::SubscriptionLag(_) | ClientError::Transport(TransportError::Protocol(_))) {
                                    connection.finish(Some(error.into()), Some(reset_action(TcpResetReason::ProtocolError)), false).await;
                                } else { connection.suspend(epoch).await; }
                                return;
                            }
                        }
                    }
                    _ = changed.changed() => {
                        // Closing remains owned if the caller cancels its close future.
                        let Some(shared) = weak.upgrade() else { return };
                        TcpConnection { shared }.advance_close().await;
                    }
                }
            }
        });
        tokio::spawn(send_pending(Arc::downgrade(&self.shared), epoch));
    }
}

async fn send_pending(weak: Weak<Shared>, epoch: u64) {
    let Some(initial) = weak.upgrade() else {
        return;
    };
    let mut changed = initial.changed.subscribe();
    drop(initial);
    loop {
        let Some(shared) = weak.upgrade() else { return };
        let inner = shared.inner.lock().await;
        if inner.epoch != epoch || inner.terminal || !inner.online || inner.resuming {
            return;
        }
        let next = inner
            .pending
            .iter()
            .find(|(_, action)| action.sent != epoch)
            .map(|(seq, action)| (*seq, action.action.clone()));
        let client = inner.client.clone();
        drop(inner);
        if let Some((seq, action)) = next {
            let send = shared.send.lock().await;
            let inner = shared.inner.lock().await;
            if inner.epoch != epoch || inner.terminal || !inner.online {
                return;
            }
            drop(inner);
            let result = client
                .notify(
                    "dispatchAction",
                    DispatchActionParams {
                        channel: shared.resource.clone(),
                        client_seq: seq,
                        action,
                    },
                )
                .await;
            drop(send);
            if result.is_err() {
                TcpConnection { shared }.suspend(epoch).await;
                return;
            }
            let mut inner = shared.inner.lock().await;
            if inner.epoch == epoch {
                if let Some(pending) = inner.pending.get_mut(&seq) {
                    pending.sent = epoch;
                }
            }
        } else {
            drop(shared);
            if changed.changed().await.is_err() {
                return;
            }
        }
    }
}

impl Client {
    /// Atomically create an owned TCP stream after `initialize` advertised support.
    /// Cancellation and request timeout clean up late successful creation responses.
    /// For managed hosts, use [`crate::hosts::HostClientHandle::open_tcp_connection`]
    /// so the runtime retains this stream across reconnects.
    pub async fn open_tcp_connection(
        &self,
        session: String,
        create: TcpConnectionSubscription,
    ) -> Result<TcpConnection, TcpError> {
        if !session.starts_with("ahp-session:")
            || session == "ahp-session:"
            || create.r#type != "tcpConnection"
            || create.host.is_empty()
            || create
                .host
                .chars()
                .any(|c| c.is_whitespace() || "/\\\0".contains(c))
            || !(1..=65535).contains(&create.port)
            || create.encoding != TcpDataEncoding::Base64
            || !(1..=MAX_WINDOW_BYTES).contains(&create.receive_window_bytes)
            || !(1..=create.receive_window_bytes).contains(&create.maximum_chunk_size)
        {
            return Err(TcpError::Invalid(
                "invalid session, target, encoding, or limits",
            ));
        }
        let Some((owner, Some(capability))) = self.tcp_identity().await else {
            return Err(TcpError::Invalid("initialize must advertise TCP support"));
        };
        if owner.is_empty() || !capability.encodings.contains(&create.encoding) {
            return Err(TcpError::Invalid("requested TCP encoding is not supported"));
        }
        let client = self.clone();
        let (sender, receiver) = oneshot::channel();
        tokio::spawn(async move {
            let result = create_connection(client, owner, session, create).await;
            if let Err(Ok(connection)) = sender.send(result) {
                if let Err(error) = connection.dispose().await {
                    tracing::warn!(?error, "cancelled TCP creation cleanup failed");
                }
            }
        });
        receiver.await.map_err(|_| TcpError::Closed)?
    }

    /// Resume retained handles on a fresh transport using replay, never creation.
    /// Checkpoints are clamped to retained state. Cancellation does not abandon
    /// an in-flight reconciliation; the owned task finishes or suspends handles.
    pub async fn reconnect_tcp_connections(
        &self,
        params: ReconnectParams,
        connections: &[TcpConnection],
    ) -> Result<ReconnectResult, TcpError> {
        let client = self.clone();
        let connections = connections.to_vec();
        let (sender, receiver) = oneshot::channel();
        tokio::spawn(async move {
            let _ = sender.send(resume_connections(client, params, connections).await);
        });
        receiver.await.map_err(|_| TcpError::Closed)?
    }
}

async fn create_connection(
    client: Client,
    owner: String,
    session: String,
    create: TcpConnectionSubscription,
) -> Result<TcpConnection, TcpError> {
    let mut params = SubscribeParams::new(session.clone());
    params.create = Some(create.clone());
    let cleanup_client = client.clone();
    let events_slot = Arc::new(std::sync::Mutex::new(None));
    let result_events = events_slot.clone();
    let route_client = client.clone();
    let raw: serde_json::Value = client
        .request_with_late_result(
            "subscribe",
            params,
            Some(Box::new(move |result| {
                tokio::spawn(cleanup_late_creation(cleanup_client, result));
            })),
            Some(Box::new(move |result| {
                if let Some(resource) = result["snapshot"]["resource"].as_str() {
                    *result_events.lock().expect("creation events lock poisoned") =
                        Some(route_client.resource_events_strict(resource.to_owned()));
                }
            })),
        )
        .await?;
    let result: SubscribeResult = match serde_json::from_value(raw.clone()) {
        Ok(result) => result,
        Err(error) => {
            if let Some(resource) = raw["snapshot"]["resource"].as_str() {
                if resource.starts_with("ahp-tcp:") && resource != "ahp-tcp:" {
                    if let Err(cleanup) = client.unsubscribe(resource.to_owned()).await {
                        tracing::warn!(?cleanup, "invalid TCP creation cleanup failed");
                    }
                }
            }
            return Err(TcpError::Protocol(format!(
                "invalid creation response: {error}"
            )));
        }
    };
    let Some(snapshot) = result.snapshot else {
        return Err(TcpError::Protocol("creation omitted snapshot".into()));
    };
    let valid_resource =
        snapshot.resource.starts_with("ahp-tcp:") && snapshot.resource != "ahp-tcp:";
    let valid = if let SnapshotState::Tcp(state) = &snapshot.state {
        valid_resource
            && (0..=MAX_SAFE).contains(&snapshot.from_seq)
            && state.session == session
            && state.target.host == create.host
            && state.target.port == create.port
            && state.encoding == create.encoding
            && valid_direction(&state.input)
            && valid_direction(&state.output)
            && state.output.window_bytes <= create.receive_window_bytes
            && state.output.maximum_chunk_size <= create.maximum_chunk_size
            && !state.client_closed
            && !state.host_closed
            && state.reset.is_none()
    } else {
        false
    };
    if !valid {
        if valid_resource {
            client.unsubscribe(snapshot.resource).await?;
        }
        return Err(TcpError::Protocol(
            "creation snapshot is not fresh or does not match request".into(),
        ));
    }
    let SnapshotState::Tcp(state) = snapshot.state else {
        return Err(TcpError::Protocol("expected TCP snapshot".into()));
    };
    let mut events = events_slot
        .lock()
        .expect("creation events lock poisoned")
        .take()
        .ok_or_else(|| TcpError::Protocol("creation omitted resource route".into()))?;
    let (changed, _) = watch::channel(0);
    let connection = TcpConnection {
        shared: Arc::new(Shared {
            resource: snapshot.resource,
            owner,
            inner: Mutex::new(Inner {
                client,
                state: *state,
                checkpoint: snapshot.from_seq,
                last_seq: 0,
                epoch: 1,
                online: true,
                resuming: false,
                ending: false,
                closing: false,
                close_queued: false,
                terminal: false,
                error: None,
                cleanup: None,
                pending: BTreeMap::new(),
                received: VecDeque::new(),
                sent_bytes: 0,
                consumed: 0,
            }),
            changed,
            writer: Arc::new(Mutex::new(())),
            resume: Arc::new(Mutex::new(())),
            send: Mutex::new(()),
        }),
    };
    let owner = connection.shared.inner.lock().await.client.clone();
    if !owner.tcp_register(&connection).await {
        connection.dispose().await?;
        return Err(ClientError::Shutdown.into());
    }
    if drain_events(&connection, 1, &mut events).await {
        connection.start(1, events);
    }
    if let Some(error) = &connection.shared.inner.lock().await.error {
        return Err(error.clone());
    }
    Ok(connection)
}

async fn cleanup_late_creation(client: Client, result: serde_json::Value) {
    let Some(resource) = result["snapshot"]["resource"].as_str() else {
        tracing::warn!("late TCP creation response omitted its child resource");
        return;
    };
    if !resource.starts_with("ahp-tcp:") || resource == "ahp-tcp:" {
        tracing::warn!("late TCP creation response has an invalid child resource");
        return;
    }
    let seq = client.tcp_next_sequence();
    if seq == 0 || seq > MAX_SAFE as u64 {
        tracing::warn!("late TCP creation reset failed: client sequence exhausted");
    } else if let Err(error) = client
        .notify(
            "dispatchAction",
            DispatchActionParams {
                channel: resource.into(),
                client_seq: seq as i64,
                action: reset_action(TcpResetReason::ConnectionAborted),
            },
        )
        .await
    {
        tracing::warn!(?error, "late TCP creation reset failed");
    }
    if let Err(error) = client.unsubscribe(resource.into()).await {
        tracing::warn!(?error, "late TCP creation unsubscribe failed");
    }
}

async fn resume_connections(
    client: Client,
    mut params: ReconnectParams,
    connections: Vec<TcpConnection>,
) -> Result<ReconnectResult, TcpError> {
    let consumer_checkpoint = params.last_seen_server_seq;
    let mut identity = client.tcp_identity().await;
    if identity
        .as_ref()
        .is_some_and(|(owner, _)| owner != &params.client_id)
    {
        return Err(TcpError::Invalid("new client has a different clientId"));
    }
    let mut permits = Vec::new();
    for connection in &connections {
        permits.push(
            connection
                .shared
                .resume
                .clone()
                .try_lock_owned()
                .map_err(|_| TcpError::Invalid("duplicate or concurrently resuming handle"))?,
        );
    }
    if params.client_id.is_empty() || !(0..=MAX_SAFE).contains(&params.last_seen_server_seq) {
        return Err(TcpError::Invalid(
            "invalid reconnect identity or checkpoint",
        ));
    }
    let mut inners = Vec::new();
    for connection in &connections {
        inners.push(connection.shared.inner.lock().await);
    }
    let mut next = client.tcp_sequence_floor();
    for (connection, inner) in connections.iter().zip(inners.iter()) {
        if connection.shared.owner != params.client_id
            || inner.terminal
            || (inner.online && !inner.client.tcp_is_closed())
            || inner.client.tcp_same_transport(&client)
        {
            return Err(TcpError::Invalid(
                "handles must be suspended, live, and owned by the same clientId",
            ));
        }
        next = next
            .max(inner.last_seq + 1)
            .max(inner.client.tcp_sequence_floor());
        identity = inner.client.tcp_identity().await;
        params.last_seen_server_seq = params.last_seen_server_seq.min(inner.checkpoint);
        if !params.subscriptions.contains(&connection.shared.resource) {
            params
                .subscriptions
                .push(connection.shared.resource.clone());
        }
    }
    client.tcp_advance_sequence(next);
    if let Some(identity) = identity {
        client.tcp_restore_identity(identity).await;
    }
    let mut bindings = Vec::new();
    for (connection, inner) in connections.iter().zip(inners.iter_mut()) {
        inner.client.tcp_unregister(connection).await;
        inner.client = client.clone();
        inner.epoch += 1;
        inner.online = false;
        inner.resuming = true;
        bindings.push((
            inner.epoch,
            client.resource_events_strict(connection.shared.resource.clone()),
        ));
        connection.shared.wake();
    }
    let mut registration_failed = false;
    for connection in &connections {
        registration_failed |= !client.tcp_register(connection).await;
    }
    drop(inners);
    if registration_failed {
        for connection in &connections {
            connection.dispose_for_client(&client).await?;
        }
        return Err(ClientError::Shutdown.into());
    }
    params.channel = ahp_types::ROOT_RESOURCE_URI.into();
    let mut result: ReconnectResult = match client.request("reconnect", params).await {
        Ok(result) => result,
        Err(error) => {
            for (connection, (epoch, events)) in connections.iter().zip(bindings.iter_mut()) {
                let mut failure = if matches!(error, ClientError::Deserialization(_)) {
                    Some(TcpError::Protocol(error.to_string()))
                } else {
                    None
                };
                loop {
                    match events.try_recv() {
                        Ok(Some(_)) => continue,
                        Err(
                            loss @ (ClientError::SubscriptionLag(_)
                            | ClientError::Transport(TransportError::Protocol(_))),
                        ) => {
                            failure = Some(loss.into());
                            break;
                        }
                        _ => break,
                    }
                }
                if let Some(failure) = failure {
                    connection
                        .finish(
                            Some(failure),
                            Some(reset_action(TcpResetReason::ProtocolError)),
                            false,
                        )
                        .await;
                } else {
                    connection.suspend(*epoch).await;
                }
            }
            return Err(error.into());
        }
    };
    let ReconnectResult::Replay(replay) = &mut result else {
        for connection in &connections {
            connection
                .finish(Some(TcpError::ReplayUnavailable), None, false)
                .await;
        }
        return Ok(result);
    };
    replay.actions.retain(|action| {
        action.channel.starts_with("ahp-tcp:") || action.server_seq > consumer_checkpoint as u64
    });
    for connection in &connections {
        if replay.missing.contains(&connection.shared.resource) {
            connection
                .finish(Some(TcpError::ReplayUnavailable), None, false)
                .await;
        }
        for action in &replay.actions {
            let epoch = connection.shared.inner.lock().await.epoch;
            connection.accept(action.clone(), epoch).await;
        }
    }
    let mut resend = Vec::new();
    for (index, connection) in connections.iter().enumerate() {
        let (epoch, events) = &mut bindings[index];
        if !drain_events(connection, *epoch, events).await {
            continue;
        }
        let inner = connection.shared.inner.lock().await;
        if !inner.terminal && inner.resuming {
            for (seq, pending) in &inner.pending {
                resend.push((*seq, index, pending.action.clone()));
            }
        }
    }
    resend.sort_by_key(|(seq, _, _)| *seq);
    for (seq, index, action) in resend {
        let connection = &connections[index];
        let _send = connection.shared.send.lock().await;
        if connection.shared.inner.lock().await.terminal {
            continue;
        }
        if let Err(error) = client
            .notify(
                "dispatchAction",
                DispatchActionParams {
                    channel: connection.shared.resource.clone(),
                    client_seq: seq,
                    action,
                },
            )
            .await
        {
            for (connection, (epoch, _)) in connections.iter().zip(bindings.iter()) {
                connection.suspend(*epoch).await;
            }
            return Err(error.into());
        }
        let mut inner = connection.shared.inner.lock().await;
        let epoch = inner.epoch;
        if let Some(pending) = inner.pending.get_mut(&seq) {
            pending.sent = epoch;
        }
    }
    for (connection, (epoch, events)) in connections.iter().zip(bindings) {
        let mut inner = connection.shared.inner.lock().await;
        if !inner.terminal && inner.resuming {
            inner.online = true;
            inner.resuming = false;
            connection.shared.wake();
            connection.start(epoch, events);
        }
        drop(inner);
        connection.advance_close().await;
    }
    Ok(result)
}

async fn drain_events(
    connection: &TcpConnection,
    epoch: u64,
    events: &mut StrictClientEventStream,
) -> bool {
    loop {
        match events.try_recv() {
            Ok(Some(event)) => {
                if let SubscriptionEvent::Action(action) = event.event {
                    connection.accept(action, epoch).await;
                }
            }
            Ok(None) => return true,
            Err(error) => {
                if matches!(
                    error,
                    ClientError::SubscriptionLag(_)
                        | ClientError::Transport(TransportError::Protocol(_))
                ) {
                    connection
                        .finish(
                            Some(error.into()),
                            Some(reset_action(TcpResetReason::ProtocolError)),
                            false,
                        )
                        .await;
                } else {
                    connection.suspend(epoch).await;
                }
                return false;
            }
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::{ClientConfig, Transport, TransportMessage};
    use ahp_types::messages::{JsonRpcMessage, JsonRpcRequest};
    use serde_json::{json, Value};
    use std::time::Duration;
    use tokio::sync::mpsc;

    struct Wire {
        tx: mpsc::Sender<TransportMessage>,
        rx: mpsc::Receiver<TransportMessage>,
    }
    impl Transport for Wire {
        async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
            self.tx
                .send(message)
                .await
                .map_err(|_| TransportError::Closed)
        }
        async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
            Ok(self.rx.recv().await)
        }
    }
    fn pair() -> (Wire, Wire) {
        let (a, b) = mpsc::channel(32);
        let (c, d) = mpsc::channel(32);
        (Wire { tx: a, rx: d }, Wire { tx: c, rx: b })
    }
    async fn send(server: &mut Wire, value: Value) {
        server
            .send(TransportMessage::Text(value.to_string()))
            .await
            .unwrap();
    }
    async fn request(server: &mut Wire) -> JsonRpcRequest {
        let JsonRpcMessage::Request(request) =
            server.recv().await.unwrap().unwrap().into_parsed().unwrap()
        else {
            panic!("expected request")
        };
        request
    }
    async fn notification(server: &mut Wire, method: &str) -> Value {
        let JsonRpcMessage::Notification(n) =
            server.recv().await.unwrap().unwrap().into_parsed().unwrap()
        else {
            panic!("expected notification")
        };
        assert_eq!(n.method, method);
        serde_json::to_value(n.params).unwrap()
    }
    async fn dispatch(server: &mut Wire) -> DispatchActionParams {
        serde_json::from_value(notification(server, "dispatchAction").await).unwrap()
    }
    fn options() -> TcpConnectionSubscription {
        TcpConnectionSubscription {
            r#type: "tcpConnection".into(),
            host: "localhost".into(),
            port: 3000,
            encoding: TcpDataEncoding::Base64,
            receive_window_bytes: 4,
            maximum_chunk_size: 3,
        }
    }
    fn snapshot() -> Value {
        json!({"snapshot":{"resource":"ahp-tcp:/owned","fromSeq":10,"state":{
            "session":"ahp-session:/s1","target":{"host":"localhost","port":3000},"encoding":"base64",
            "input":{"windowBytes":4,"maximumChunkSize":3,"receivedBytes":0,"consumedBytes":0},
            "output":{"windowBytes":4,"maximumChunkSize":3,"receivedBytes":0,"consumedBytes":0},
            "clientClosed":false,"hostClosed":false
        }}})
    }
    async fn reply(server: &mut Wire, request: JsonRpcRequest, result: Value) {
        send(
            server,
            json!({"jsonrpc":"2.0","id":request.id,"result":result}),
        )
        .await;
    }
    async fn emit(server: &mut Wire, seq: u64, action: Value, origin: Option<i64>) {
        send(
            server,
            json!({"jsonrpc":"2.0","method":"action","params":{
                "channel":"ahp-tcp:/owned","serverSeq":seq,"action":action,
                "origin":origin.map(|seq|json!({"clientId":"owner","clientSeq":seq}))
            }}),
        )
        .await;
    }
    async fn acknowledge_close(server: &mut Wire, seq: u64) {
        let close = dispatch(server).await;
        assert!(matches!(&close.action, StateAction::TcpClientClose(_)));
        emit(
            server,
            seq,
            serde_json::to_value(close.action).unwrap(),
            Some(close.client_seq),
        )
        .await;
        emit(server, seq + 1, json!({"type":"tcp/hostClose"}), None).await;
    }

    async fn unrelated_burst(client: &Client, server: &mut Wire, first_seq: u64) {
        for i in 0..16 {
            for (offset, channel, action) in [
                (
                    0,
                    "ahp-session:/other",
                    json!({"type":"session/titleChanged","title":"busy"}),
                ),
                (
                    1,
                    "ahp-tcp:/other",
                    json!({"type":"tcp/data","offset":i,"data":"AA=="}),
                ),
            ] {
                send(
                    server,
                    json!({"jsonrpc":"2.0","method":"action","params":{
                        "channel":channel,"serverSeq":first_seq + i * 2 + offset,"action":action
                    }}),
                )
                .await;
            }
        }
        let (ping, ()) = tokio::join!(client.ping(), async {
            let req = request(server).await;
            assert_eq!(req.method, "ping");
            reply(server, req, Value::Null).await;
        });
        ping.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_scoped_creation_and_active_traffic() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, mut server) = initialized_with_config(ClientConfig {
                subscription_buffer: 2,
                ..ClientConfig::default()
            })
            .await;
            let opener = client.clone();
            let opening = tokio::spawn(async move {
                opener
                    .open_tcp_connection("ahp-session:/s1".into(), options())
                    .await
            });
            let req = request(&mut server).await;
            unrelated_burst(&client, &mut server, 1).await;
            let mut initial = snapshot();
            initial["snapshot"]["fromSeq"] = json!(32);
            reply(&mut server, req, initial).await;
            emit(
                &mut server,
                33,
                json!({"type":"tcp/data","offset":0,"data":"Bw=="}),
                None,
            )
            .await;
            let connection = opening.await.unwrap().unwrap();
            {
                let _inner = connection.shared.inner.lock().await;
                unrelated_burst(&client, &mut server, 34).await;
            }
            assert_eq!(connection.read().await.unwrap(), Some(vec![7]));
            assert!(matches!(
                dispatch(&mut server).await.action,
                StateAction::TcpDataConsumed(_)
            ));
            connection.dispose().await.unwrap();
            assert!(matches!(
                dispatch(&mut server).await.action,
                StateAction::TcpClientReset(_)
            ));
            notification(&mut server, "unsubscribe").await;
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    async fn initialized() -> (Client, Wire) {
        initialized_with_config(ClientConfig::default()).await
    }

    async fn initialized_with_config(config: ClientConfig) -> (Client, Wire) {
        let (wire, mut server) = pair();
        let client = Client::connect(wire, config).await.unwrap();
        let (result, ()) = tokio::join!(
            client.initialize(
                "owner".into(),
                vec![ahp_types::PROTOCOL_VERSION.into()],
                vec![]
            ),
            async {
                let req = request(&mut server).await;
                assert_eq!(req.method, "initialize");
                reply(&mut server,req,json!({"protocolVersion":ahp_types::PROTOCOL_VERSION,"serverSeq":0,"snapshots":[],"tcpConnections":{"encodings":["base64"]}})).await;
            }
        );
        result.unwrap();
        (client, server)
    }
    async fn opened(first: Option<&str>) -> (Client, TcpConnection, Wire) {
        let (client, mut server) = initialized().await;
        let (result, ()) = tokio::join!(
            client.open_tcp_connection("ahp-session:/s1".into(), options()),
            async {
                let req = request(&mut server).await;
                assert_eq!(req.method, "subscribe");
                reply(&mut server, req, snapshot()).await;
                if let Some(data) = first {
                    emit(
                        &mut server,
                        11,
                        json!({"type":"tcp/data","offset":0,"data":data}),
                        None,
                    )
                    .await;
                }
            }
        );
        (client, result.unwrap(), server)
    }

    #[tokio::test]
    async fn owned_tcp_shutdown_disposes_live_and_suspended_streams() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for suspended in [false, true] {
                let (client, connection, mut server) = opened(None).await;
                connection.write_all(b"abcd").await.unwrap();
                dispatch(&mut server).await;
                dispatch(&mut server).await;
                let reader = connection.clone();
                let read = tokio::spawn(async move { reader.read().await });
                let writer = connection.clone();
                let write = tokio::spawn(async move { writer.write(b"x").await });
                let drainer = connection.clone();
                let drain = tokio::spawn(async move { drainer.drain().await });
                tokio::task::yield_now().await;
                assert!(!read.is_finished() && !write.is_finished() && !drain.is_finished());
                if suspended {
                    client.shutdown_preserving_tcp().await;
                    assert!(!connection.is_closed().await);
                }
                client.shutdown().await;
                assert!(connection.is_closed().await);
                assert!(matches!(read.await.unwrap(), Err(TcpError::Disposed)));
                assert!(matches!(write.await.unwrap(), Err(TcpError::Disposed)));
                assert!(matches!(drain.await.unwrap(), Err(TcpError::Disposed)));
                assert!(!client.tcp_register(&connection).await);
                client.shutdown().await;
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_close_waits_for_accepted_input() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, connection, mut server) = opened(None).await;
            connection.write_all(b"ab").await.unwrap();
            let input = dispatch(&mut server).await;
            let mut changed = connection.shared.changed.subscribe();
            let closing = connection.clone();
            let close = tokio::spawn(async move { closing.close().await });
            while !connection.shared.inner.lock().await.ending {
                changed.changed().await.unwrap();
            }
            assert!(!close.is_finished());
            assert!(server.rx.try_recv().is_err());
            emit(
                &mut server,
                11,
                serde_json::to_value(&input.action).unwrap(),
                Some(input.client_seq),
            )
            .await;
            emit(
                &mut server,
                12,
                json!({"type":"tcp/inputConsumed","consumedBytes":2}),
                None,
            )
            .await;
            acknowledge_close(&mut server, 13).await;
            close.await.unwrap().unwrap();
            notification(&mut server, "unsubscribe").await;
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_large_payload_encoding() {
        tokio::time::timeout(Duration::from_secs(10), async {
            let (client, mut server) = initialized().await;
            const SIZE: usize = 4 * 1024 * 1024;
            let mut params = options();
            params.receive_window_bytes = SIZE as i64;
            params.maximum_chunk_size = SIZE as i64;
            let mut initial = snapshot();
            for direction in ["input", "output"] {
                initial["snapshot"]["state"][direction]["windowBytes"] = json!(SIZE);
                initial["snapshot"]["state"][direction]["maximumChunkSize"] = json!(SIZE);
            }
            let (connection, ()) = tokio::join!(
                client.open_tcp_connection("ahp-session:/s1".into(), params),
                async {
                    let req = request(&mut server).await;
                    reply(&mut server, req, initial).await;
                }
            );
            let connection = connection.unwrap();
            let payload = vec![0xab; SIZE];
            assert_eq!(connection.write(&payload).await.unwrap(), SIZE);
            let input = dispatch(&mut server).await;
            let StateAction::TcpInput(action) = &input.action else {
                panic!("expected input")
            };
            assert_eq!(action.offset, 0);
            assert_eq!(STANDARD.decode(&action.data).unwrap(), payload);
            emit(
                &mut server,
                11,
                serde_json::to_value(&input.action).unwrap(),
                Some(input.client_seq),
            )
            .await;
            emit(
                &mut server,
                12,
                json!({"type":"tcp/inputConsumed","consumedBytes":SIZE}),
                None,
            )
            .await;
            let (closed, ()) = tokio::join!(connection.close(), acknowledge_close(&mut server, 13));
            closed.unwrap();
            notification(&mut server, "unsubscribe").await;
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_negotiated_output_limits() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for (window, chunk, valid) in [
                (2, 1, true),
                (4, 2, true),
                (0, 1, false),
                (2, 0, false),
                (5, 1, false),
                (4, 3, false),
                (1, 2, false),
            ] {
                let (client, mut server) = initialized().await;
                let mut create = options();
                create.maximum_chunk_size = 2;
                let mut snap = snapshot();
                snap["snapshot"]["state"]["output"]["windowBytes"] = json!(window);
                snap["snapshot"]["state"]["output"]["maximumChunkSize"] = json!(chunk);
                let (result, ()) = tokio::join!(
                    client.open_tcp_connection("ahp-session:/s1".into(), create),
                    async {
                        let req = request(&mut server).await;
                        reply(&mut server, req, snap).await;
                    }
                );
                assert_eq!(
                    result.is_ok(),
                    valid,
                    "limits {window}/{chunk}: {:?}",
                    result.as_ref().err()
                );
                if let Ok(connection) = result {
                    let inner = connection.shared.inner.lock().await;
                    assert_eq!(inner.state.output.window_bytes, window);
                    assert_eq!(inner.state.output.maximum_chunk_size, chunk);
                    drop(inner);
                    connection.dispose().await.unwrap();
                }
                client.shutdown().await;
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_request_limits_uint32() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for (window, chunk, valid) in [
                (4_294_967_295, 4_294_967_295, true),
                (4_294_967_296, 1, false),
                (4_294_967_295, 4_294_967_296, false),
            ] {
                let (client, mut server) = initialized().await;
                let mut create = options();
                create.receive_window_bytes = window;
                create.maximum_chunk_size = chunk;
                let opening = client.open_tcp_connection("ahp-session:/s1".into(), create);
                tokio::pin!(opening);
                let result = tokio::select! {
                    result = &mut opening => result,
                    req = request(&mut server) => {
                        assert!(valid, "out-of-UInt32 request was sent: {window}/{chunk}");
                        let mut snap = snapshot();
                        snap["snapshot"]["state"]["output"]["windowBytes"] = json!(window);
                        snap["snapshot"]["state"]["output"]["maximumChunkSize"] = json!(chunk);
                        reply(&mut server, req, snap).await;
                        opening.await
                    }
                };
                assert_eq!(result.is_ok(), valid);
                if let Ok(connection) = result {
                    connection.dispose().await.unwrap();
                }
                client.shutdown().await;
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_snapshot_limits_uint32() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for (direction, field) in [
                ("input", "boundary"),
                ("input", "windowBytes"),
                ("input", "maximumChunkSize"),
                ("output", "boundary"),
                ("output", "windowBytes"),
                ("output", "maximumChunkSize"),
            ] {
                let (client, mut server) = initialized().await;
                let mut create = options();
                create.receive_window_bytes = 4_294_967_295;
                create.maximum_chunk_size = 4_294_967_295;
                let mut snap = snapshot();
                snap["snapshot"]["state"][direction]["windowBytes"] = json!(4_294_967_295_i64);
                snap["snapshot"]["state"][direction]["maximumChunkSize"] = json!(4_294_967_295_i64);
                if field != "boundary" {
                    snap["snapshot"]["state"][direction][field] = json!(4_294_967_296_i64);
                }
                let (result, ()) = tokio::join!(
                    client.open_tcp_connection("ahp-session:/s1".into(), create),
                    async {
                        let req = request(&mut server).await;
                        reply(&mut server, req, snap).await;
                    }
                );
                assert_eq!(result.is_ok(), field == "boundary", "{direction}/{field}");
                if let Ok(connection) = result {
                    connection.dispose().await.unwrap();
                }
                client.shutdown().await;
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_resume_filters_ordinary_replay() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (old, connection, _server) = opened(None).await;
            old.shutdown_preserving_tcp().await;
            let (wire, mut server) = pair();
            let client = Client::connect(wire, ClientConfig::default()).await.unwrap();
            let (result, ()) = tokio::join!(
                client.reconnect_tcp_connections(ReconnectParams {
                    channel: ahp_types::ROOT_RESOURCE_URI.into(), meta: None, client_id: "owner".into(),
                    last_seen_server_seq: 20, subscriptions: vec![],
                }, std::slice::from_ref(&connection)),
                async {
                    let req = request(&mut server).await;
                    assert_eq!(serde_json::to_value(&req.params).unwrap()["lastSeenServerSeq"], 10);
                    reply(&mut server, req, json!({"type":"replay", "missing":[], "actions":[
                        {"channel":connection.resource(),"serverSeq":11,"action":{"type":"tcp/data","offset":0,"data":"eA=="}},
                        {"channel":"ahp-terminal:/t","serverSeq":15,"action":{"type":"terminal/data","data":"hello"}},
                        {"channel":"ahp-terminal:/t","serverSeq":21,"action":{"type":"terminal/data","data":"!"}}
                    ]})).await;
                }
            );
            let ReconnectResult::Replay(replay) = result.unwrap() else { panic!("expected replay") };
            let mut text = "hello".to_string();
            for action in replay.actions {
                if let StateAction::TerminalData(data) = action.action { text.push_str(&data.data); }
            }
            assert_eq!(text, "hello!");
            assert_eq!(connection.read().await.unwrap(), Some(b"x".to_vec()));
            connection.dispose().await.unwrap();
            client.shutdown().await;
        }).await.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_close_retains_crossing_data_until_acknowledged() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, connection, mut server) = opened(None).await;
            let closing = connection.clone();
            let done = tokio::spawn(async move { closing.close().await });
            let close = dispatch(&mut server).await;
            assert!(matches!(close.action, StateAction::TcpClientClose(_)));
            assert!(
                !connection.is_closed().await,
                "local close released ownership"
            );
            emit(
                &mut server,
                11,
                serde_json::to_value(close.action).unwrap(),
                Some(close.client_seq),
            )
            .await;
            emit(
                &mut server,
                12,
                json!({"type":"tcp/data","offset":0,"data":"YWI="}),
                None,
            )
            .await;
            emit(&mut server, 13, json!({"type":"tcp/hostClose"}), None).await;
            let mut changed = connection.shared.changed.subscribe();
            while connection.shared.inner.lock().await.checkpoint < 13 {
                changed.changed().await.unwrap();
            }
            assert!(server.rx.try_recv().is_err(), "cleanup before output drain");
            assert_eq!(connection.read().await.unwrap(), Some(b"ab".to_vec()));
            let credit = dispatch(&mut server).await;
            assert!(matches!(
                credit.action,
                StateAction::TcpDataConsumed(TcpDataConsumedAction { consumed_bytes: 2 })
            ));
            assert!(connection.read().await.unwrap().is_none());
            assert!(!connection.is_closed().await, "released before credit ack");
            emit(
                &mut server,
                14,
                serde_json::to_value(credit.action).unwrap(),
                Some(credit.client_seq),
            )
            .await;
            done.await.unwrap().unwrap();
            notification(&mut server, "unsubscribe").await;
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_closing_resumes_and_reset_wakes_close() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (old, connection, mut old_server) = opened(None).await;
            let closing = connection.clone();
            let closed = tokio::spawn(async move { closing.close().await });
            let original = dispatch(&mut old_server).await;
            old.shutdown_preserving_tcp().await;
            let (wire, mut server) = pair();
            let client = Client::connect(wire, ClientConfig::default())
                .await
                .unwrap();
            let (resumed, ()) = tokio::join!(
                client.reconnect_tcp_connections(
                    ReconnectParams {
                        channel: ahp_types::ROOT_RESOURCE_URI.into(),
                        meta: None,
                        client_id: "owner".into(),
                        last_seen_server_seq: 10,
                        subscriptions: vec![],
                    },
                    std::slice::from_ref(&connection)
                ),
                async {
                    let req = request(&mut server).await;
                    reply(
                        &mut server,
                        req,
                        json!({"type":"replay","actions":[],"missing":[]}),
                    )
                    .await;
                }
            );
            resumed.unwrap();
            let action = dispatch(&mut server).await;
            assert_eq!(action.client_seq, original.client_seq);
            assert_eq!(action.action, original.action);
            assert!(matches!(&action.action, StateAction::TcpClientClose(_)));
            assert!(!closed.is_finished());
            emit(
                &mut server,
                11,
                json!({"type":"tcp/hostReset","reason":"connectionReset"}),
                None,
            )
            .await;
            assert!(matches!(
                closed.await.unwrap(),
                Err(TcpError::Reset(TcpResetReason::ConnectionReset))
            ));
            notification(&mut server, "unsubscribe").await;
            connection.dispose().await.unwrap();
            assert!(server.rx.try_recv().is_err());
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn managed_tcp_reconnect_and_shutdown() {
        use crate::hosts::{HostConfig, HostId, MultiHostClient, ReconnectPolicy};
        tokio::time::timeout(Duration::from_secs(10), async {
            for mode in ["replay", "retry", "snapshot", "missing", "refused"] {
                let (servers_tx, mut servers) = mpsc::unbounded_channel();
                let factory = move |_id: HostId| -> std::pin::Pin<Box<dyn std::future::Future<Output=Result<crate::BoxedTransport, TransportError>> + Send>> {
                    let (wire, server) = pair();
                    servers_tx.send(server).unwrap();
                    Box::pin(async move { Ok(crate::BoxedTransport::new(wire)) })
                };
                let multi = MultiHostClient::new();
                let mut events = multi.events();
                let id = HostId::new("tcp");
                multi.add_host(HostConfig::new(id.clone(), "TCP", factory)
                    .with_client_id("owner")
                    .with_initial_subscriptions(vec![ahp_types::ROOT_RESOURCE_URI.into(), "ahp-tcp:/must-not-initialize".into()])
                    .with_reconnect_policy(ReconnectPolicy::immediate_forever())).await.unwrap();
                let initialize = json!({"protocolVersion":ahp_types::PROTOCOL_VERSION,"serverSeq":10,"snapshots":[],"tcpConnections":{"encodings":["base64"]}});
                let mut server = servers.recv().await.unwrap();
                let req = request(&mut server).await;
                assert_eq!(req.method, "initialize");
                let params = serde_json::to_value(&req.params).unwrap();
                assert!(!params["initialSubscriptions"].as_array().unwrap().iter().any(|uri|uri.as_str().unwrap().starts_with("ahp-tcp:")));
                reply(&mut server, req, initialize.clone()).await;
                let req = request(&mut server).await;
                assert_eq!(req.method, "listSessions");
                reply(&mut server, req, json!({"items":[]})).await;
                while !multi.host(&id).await.unwrap().state.is_connected() { tokio::task::yield_now().await; }
                let old = multi.client(&id).await.unwrap();
                let opener = old.clone();
                let opening = tokio::spawn(async move { opener.open_tcp_connection("ahp-session:/s1".into(),options()).await });
                let req = request(&mut server).await;
                assert_eq!(req.method, "subscribe");
                reply(&mut server, req, snapshot()).await;
                emit(&mut server, 11, json!({"type":"tcp/data","offset":0,"data":"eA=="}), None).await;
                let connection = opening.await.unwrap().unwrap();
                assert_eq!(connection.read().await.unwrap(), Some(b"x".to_vec()));
                let credit = dispatch(&mut server).await;
                connection.write_all(b"ab").await.unwrap();
                let input = dispatch(&mut server).await;
                let ordinary = old.dispatch("ahp-session:/s1".into(), StateAction::SessionTitleChanged(SessionTitleChangedAction{title:"ordinary".into()})).await.unwrap();
                dispatch(&mut server).await;
                send(&mut server, json!({"jsonrpc":"2.0","method":"action","params":{
                    "channel":"ahp-terminal:/t","serverSeq":20,"action":{"type":"terminal/data","data":"hello"}
                }})).await;
                loop {
                    if events.recv().await.unwrap().channel == "ahp-terminal:/t" { break; }
                }
                old.raw_client().shutdown_preserving_tcp().await;
                let mut server = servers.recv().await.unwrap();
                let mut req = request(&mut server).await;
                assert_eq!(req.method, "reconnect", "{mode}");
                if mode == "retry" {
                    drop(server);
                    server = servers.recv().await.unwrap();
                    req = request(&mut server).await;
                    assert_eq!(req.method, "reconnect");
                }
                let params: ReconnectParams = serde_json::from_value(serde_json::to_value(&req.params).unwrap()).unwrap();
                assert_eq!(params.client_id, "owner");
                assert!(params.last_seen_server_seq<=11);
                assert!(params.subscriptions.contains(&connection.resource().to_owned()), "{mode}: missing retained stream; closed={}", connection.is_closed().await);
                if mode == "refused" {
                    send(&mut server, json!({"jsonrpc":"2.0","id":req.id,"error":{"code":-32000,"message":"replay expired"}})).await;
                } else {
                    let result = match mode {
                        "snapshot" => json!({"type":"snapshot","snapshots":[]}),
                        "missing" => json!({"type":"replay","actions":[],"missing":[connection.resource()]}),
                        _ => json!({"type":"replay","actions":[
                            {"channel":"ahp-terminal:/t","serverSeq":20,"action":{"type":"terminal/data","data":"hello"}},
                            {"channel":"ahp-terminal:/t","serverSeq":21,"action":{"type":"terminal/data","data":"!"}}
                        ],"missing":[]}),
                    };
                    reply(&mut server, req, result).await;
                    if mode == "replay" || mode == "retry" {
                        emit(&mut server,22,json!({"type":"tcp/dataEof","finalOffset":1}),None).await;
                    }
                }
                let mut resent = Vec::new();
                loop {
                    match server.recv().await.unwrap().unwrap().into_parsed().unwrap() {
                        JsonRpcMessage::Request(req) if req.method=="initialize" => {
                            assert_eq!(mode, "refused");
                            let params = serde_json::to_value(&req.params).unwrap();
                            assert!(!params["initialSubscriptions"].as_array().unwrap().iter().any(|uri|uri.as_str().unwrap().starts_with("ahp-tcp:")));
                            reply(&mut server,req,initialize.clone()).await;
                        }
                        JsonRpcMessage::Request(req) => {
                            assert_eq!(req.method,"listSessions");
                            reply(&mut server,req,json!({"items":[]})).await;
                            break;
                        }
                        JsonRpcMessage::Notification(n) if n.method=="dispatchAction" => {
                            let action: DispatchActionParams = serde_json::from_value(serde_json::to_value(n.params).unwrap()).unwrap();
                            resent.push(action);
                        }
                        JsonRpcMessage::Notification(n) => assert_eq!(n.method,"unsubscribe"),
                        _ => panic!("unexpected host packet"),
                    }
                }
                let fresh = loop {
                    if let Some(handle) = multi.client(&id).await {
                        if handle.generation()>old.generation() && multi.host(&id).await.unwrap().state.is_connected() { break handle; }
                    }
                    tokio::task::yield_now().await;
                };
                if mode == "replay" || mode == "retry" {
                    let mut text = "hello".to_string();
                    loop {
                        if let SubscriptionEvent::Action(action) = events.recv().await.unwrap().event {
                            if let StateAction::TerminalData(data) = action.action { text.push_str(&data.data); }
                            if action.server_seq == 22 { break; }
                        }
                    }
                    assert_eq!(text, "hello!", "managed replay duplicated terminal output");
                    assert_eq!(resent.len(),2);
                    assert_eq!(resent[0].client_seq,credit.client_seq);
                    assert_eq!(resent[1].client_seq,input.client_seq);
                    assert!(connection.read().await.unwrap().is_none());
                    connection.write_all(b"c").await.unwrap();
                    assert!(dispatch(&mut server).await.client_seq>ordinary.client_seq);
                    let opener = fresh.clone();
                    let opening = tokio::spawn(async move { opener.open_tcp_connection("ahp-session:/s1".into(),options()).await });
                    let req = request(&mut server).await;
                    assert_eq!(req.method,"subscribe");
                    let mut snap = snapshot();snap["snapshot"]["resource"]=json!("ahp-tcp:/second");
                    reply(&mut server,req,snap).await;
                    let second=opening.await.unwrap().unwrap();
                    let reader=second.clone();
                    let waiting=tokio::spawn(async move{reader.read().await});
                    multi.remove_host(&id).await.unwrap();
                    assert!(connection.is_closed().await && second.is_closed().await);
                    assert!(waiting.await.unwrap().is_err());
                } else {
                    assert!(connection.is_closed().await,"{mode}");
                    assert!(connection.read().await.is_err(),"{mode}");
                    multi.remove_host(&id).await.unwrap();
                }
            }
        }).await.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_timeout_releases_late_child_on_live_transport() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, mut server) = initialized_with_config(ClientConfig {
                default_request_timeout: Some(Duration::from_millis(100)),
                ..ClientConfig::default()
            }).await;
            let opening = client.clone();
            let task = tokio::spawn(async move {
                opening.open_tcp_connection("ahp-session:/s1".into(), options()).await
            });
            let req = request(&mut server).await;
            assert!(matches!(task.await.unwrap(), Err(TcpError::Client(error)) if matches!(error.as_ref(), ClientError::Cancelled)));
            reply(&mut server, req.clone(), snapshot()).await;
            let reset = dispatch(&mut server).await;
            assert_eq!(reset.channel, "ahp-tcp:/owned");
            assert!(matches!(reset.action, StateAction::TcpClientReset(TcpClientResetAction { reason: TcpResetReason::ConnectionAborted })));
            assert_eq!(notification(&mut server, "unsubscribe").await["channel"], "ahp-tcp:/owned");
            reply(&mut server, req, snapshot()).await;
            let ping_client = client.clone();
            let ping = tokio::spawn(async move {
                let _: Value = ping_client.request("ping", json!({})).await.unwrap();
            });
            let req = request(&mut server).await;
            assert_eq!(req.method, "ping");
            reply(&mut server, req, json!(null)).await;
            ping.await.unwrap();
            assert!(server.rx.try_recv().is_err());
            client.shutdown().await;
        }).await.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_resume_does_not_reuse_fully_acked_sequence() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (old, connection, mut old_server) = opened(None).await;
            connection.write_all(b"ab").await.unwrap();
            let original = dispatch(&mut old_server).await;
            emit(
                &mut old_server,
                11,
                serde_json::to_value(&original.action).unwrap(),
                Some(original.client_seq),
            )
            .await;
            emit(
                &mut old_server,
                12,
                json!({"type":"tcp/inputConsumed","consumedBytes":2}),
                None,
            )
            .await;
            connection.drain().await.unwrap();
            assert!(connection.shared.inner.lock().await.pending.is_empty());
            let ordinary = old
                .dispatch(
                    "ahp-session:/s1".into(),
                    StateAction::SessionTitleChanged(SessionTitleChangedAction {
                        title: "ordinary".into(),
                    }),
                )
                .await
                .unwrap();
            dispatch(&mut old_server).await;
            old.shutdown_preserving_tcp().await;
            let (wire, mut server) = pair();
            let client = Client::connect(wire, ClientConfig::default())
                .await
                .unwrap();
            let fresh = client.clone();
            let retained = connection.clone();
            let task = tokio::spawn(async move {
                fresh
                    .reconnect_tcp_connections(
                        ReconnectParams {
                            channel: ahp_types::ROOT_RESOURCE_URI.into(),
                            meta: None,
                            client_id: "owner".into(),
                            last_seen_server_seq: 12,
                            subscriptions: vec![],
                        },
                        &[retained],
                    )
                    .await
            });
            let req = request(&mut server).await;
            reply(
                &mut server,
                req,
                json!({"type":"replay","actions":[],"missing":[]}),
            )
            .await;
            task.await.unwrap().unwrap();
            old.shutdown().await;
            assert!(!connection.is_closed().await);
            connection.write_all(b"c").await.unwrap();
            let next = dispatch(&mut server).await;
            assert!(next.client_seq > ordinary.client_seq);
            assert!(matches!(
                next.action,
                StateAction::TcpInput(TcpInputAction { offset: 2, .. })
            ));
            connection.dispose().await.unwrap();
            dispatch(&mut server).await;
            notification(&mut server, "unsubscribe").await;
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_invalid_echo_terminates_without_retaining_payload() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for mode in [
                "missing",
                "foreign",
                "zero",
                "negative",
                "unsafe",
                "unassigned",
                "mismatched",
                "reusedAck",
                "creditMissing",
                "eofMissing",
                "closeMissing",
                "resetMissing",
            ] {
                let (client, connection, mut server) = opened(Some("eA==")).await;
                connection.write_all(b"ab").await.unwrap();
                let original = dispatch(&mut server).await;
                let mut action = serde_json::to_value(&original.action).unwrap();
                let mut origin = json!({"clientId":"owner","clientSeq":original.client_seq});
                match mode {
                    "missing" => origin = json!(null),
                    "foreign" => origin["clientId"] = json!("another"),
                    "zero" => origin["clientSeq"] = json!(0),
                    "negative" => origin["clientSeq"] = json!(-1),
                    "unsafe" => origin["clientSeq"] = json!(MAX_SAFE + 1),
                    "unassigned" => origin["clientSeq"] = json!(original.client_seq + 100),
                    "mismatched" => action["data"] = json!("eHk="),
                    "reusedAck" => {
                        emit(&mut server, 12, action.clone(), Some(original.client_seq)).await;
                        emit(
                            &mut server,
                            13,
                            json!({"type":"tcp/inputConsumed","consumedBytes":2}),
                            None,
                        )
                        .await;
                        connection.drain().await.unwrap();
                        connection.write_all(b"c").await.unwrap();
                        action = serde_json::to_value(dispatch(&mut server).await.action).unwrap();
                    }
                    "creditMissing" => {
                        connection.read().await.unwrap();
                        action = serde_json::to_value(dispatch(&mut server).await.action).unwrap();
                        origin = json!(null);
                    }
                    "eofMissing" => {
                        connection.end().await.unwrap();
                        action = serde_json::to_value(dispatch(&mut server).await.action).unwrap();
                        origin = json!(null);
                    }
                    "closeMissing" => {
                        action = json!({"type":"tcp/clientClose"});
                        origin = json!(null);
                    }
                    "resetMissing" => {
                        action = json!({"type":"tcp/clientReset","reason":"connectionAborted"});
                        origin = json!(null);
                    }
                    _ => unreachable!(),
                }
                let (received, consumed) = {
                    let inner = connection.shared.inner.lock().await;
                    (
                        inner.state.input.received_bytes,
                        inner.state.output.consumed_bytes,
                    )
                };
                let drainer = connection.clone();
                let drain = tokio::spawn(async move { drainer.drain().await });
                send(&mut server, json!({"jsonrpc":"2.0","method":"action","params":{
                    "channel":connection.resource(),"serverSeq":14,"action":action,"origin":origin
                }})).await;
                assert!(drain.await.unwrap().is_err(), "{mode}");
                assert!(connection.read().await.is_err(), "{mode}");
                assert!(connection.write(b"z").await.is_err(), "{mode}");
                {
                    let inner = connection.shared.inner.lock().await;
                    assert_eq!(inner.state.input.received_bytes, received, "{mode}");
                    assert_eq!(inner.state.output.consumed_bytes, consumed, "{mode}");
                    assert!(inner.pending.is_empty(), "{mode}");
                }
                assert!(matches!(
                    dispatch(&mut server).await.action,
                    StateAction::TcpClientReset(TcpClientResetAction {
                        reason: TcpResetReason::ProtocolError
                    })
                ));
                notification(&mut server, "unsubscribe").await;
                client.shutdown().await;
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_final_close_drains_buffered_reads() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, connection, mut server) = opened(Some("YWJj")).await;
            connection.write_all(b"abcd").await.unwrap();
            let first = dispatch(&mut server).await;
            let second = dispatch(&mut server).await;
            let writer = connection.clone();
            let write = tokio::spawn(async move { writer.write(b"x").await });
            let drainer = connection.clone();
            let drain = tokio::spawn(async move { drainer.drain().await });
            emit(&mut server, 12, json!({"type":"tcp/hostClose"}), None).await;
            assert!(write.await.unwrap().is_err());
            assert!(!drain.is_finished());
            let close = dispatch(&mut server).await;
            assert!(matches!(&close.action, StateAction::TcpClientClose(_)));
            assert!(
                !connection.is_closed().await,
                "response disposed unconsumed input"
            );
            assert_eq!(connection.read().await.unwrap(), Some(b"abc".to_vec()));
            assert!(connection.read().await.unwrap().is_none());
            let credit = dispatch(&mut server).await;
            assert!(matches!(&credit.action, StateAction::TcpDataConsumed(_)));
            emit(
                &mut server,
                13,
                serde_json::to_value(first.action).unwrap(),
                Some(first.client_seq),
            )
            .await;
            emit(
                &mut server,
                14,
                serde_json::to_value(second.action).unwrap(),
                Some(second.client_seq),
            )
            .await;
            emit(
                &mut server,
                15,
                serde_json::to_value(close.action).unwrap(),
                Some(close.client_seq),
            )
            .await;
            let mut changed = connection.shared.changed.subscribe();
            while connection.shared.inner.lock().await.checkpoint < 15 {
                changed.changed().await.unwrap();
            }
            assert!(
                !connection.is_closed().await,
                "two-sided close discarded unconsumed bytes"
            );
            assert!(server.rx.try_recv().is_err(), "cleanup before drain");
            emit(
                &mut server,
                16,
                json!({"type":"tcp/inputConsumed","consumedBytes":4}),
                None,
            )
            .await;
            drain.await.unwrap().unwrap();
            assert!(!connection.is_closed().await);
            emit(
                &mut server,
                17,
                serde_json::to_value(credit.action).unwrap(),
                Some(credit.client_seq),
            )
            .await;
            notification(&mut server, "unsubscribe").await;
            connection.close().await.unwrap();
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_strict_overflow_wakes_reader() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, connection, mut server) = opened(None).await;
            let reader = connection.clone();
            let read = tokio::spawn(async move { reader.read().await });
            let inner = connection.shared.inner.lock().await;
            for seq in 11..ClientConfig::default().subscription_buffer as u64 + 14 {
                emit(&mut server, seq, json!({"type":"future/tcp"}), None).await;
            }
            let barrier = client.clone();
            let ping = tokio::spawn(async move {
                let _: Value = barrier.request("ping", json!({})).await.unwrap();
            });
            let req = request(&mut server).await;
            reply(&mut server, req, json!(null)).await;
            ping.await.unwrap();
            drop(inner);
            assert!(matches!(
                read.await.unwrap(),
                Err(TcpError::Client(error)) if matches!(error.as_ref(), ClientError::SubscriptionLag(_))
            ));
            assert!(matches!(dispatch(&mut server).await.action, StateAction::TcpClientReset(_)));
            notification(&mut server, "unsubscribe").await;
            assert!(connection.read().await.is_err());
            client.shutdown().await;
        }).await.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_validation_and_invalid_creation_cleanup() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (wire, _server) = pair();
            let uninitialized = Client::connect(wire, ClientConfig::default())
                .await
                .unwrap();
            assert!(uninitialized
                .open_tcp_connection("ahp-session:/s1".into(), options())
                .await
                .is_err());
            uninitialized.shutdown().await;
            let (client, mut server) = initialized().await;
            for params in [
                TcpConnectionSubscription {
                    port: 0,
                    ..options()
                },
                TcpConnectionSubscription {
                    host: "http://localhost".into(),
                    ..options()
                },
                TcpConnectionSubscription {
                    maximum_chunk_size: 5,
                    ..options()
                },
                TcpConnectionSubscription {
                    receive_window_bytes: MAX_SAFE + 1,
                    ..options()
                },
            ] {
                assert!(client
                    .open_tcp_connection("ahp-session:/s1".into(), params)
                    .await
                    .is_err());
            }
            for malformed in [false, true] {
                let opening = client.clone();
                let task = tokio::spawn(async move {
                    opening
                        .open_tcp_connection("ahp-session:/s1".into(), options())
                        .await
                });
                let req = request(&mut server).await;
                let mut result = snapshot();
                if malformed {
                    result["snapshot"]["state"]["input"]["windowBytes"] = json!(0.5);
                } else {
                    result["snapshot"]["state"]["input"]["receivedBytes"] = json!(1);
                }
                reply(&mut server, req, result).await;
                assert!(task.await.unwrap().is_err());
                assert_eq!(
                    notification(&mut server, "unsubscribe").await["channel"],
                    "ahp-tcp:/owned"
                );
            }
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_malformed_replay_terminates() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for malformed_envelope in [false, true] {
                let (old, connection, _old_server) = opened(None).await;
                old.shutdown_preserving_tcp().await;
                let (wire, mut server) = pair();
                let client = Client::connect(wire, ClientConfig::default()).await.unwrap();
                let params = ReconnectParams {
                    channel: ahp_types::ROOT_RESOURCE_URI.into(), meta: None,
                    client_id: "owner".into(), last_seen_server_seq: 10,
                    subscriptions: vec![],
                };
                let mut wrong_owner = params.clone();
                wrong_owner.client_id = "different".into();
                assert!(client.reconnect_tcp_connections(wrong_owner, std::slice::from_ref(&connection)).await.is_err());
                let fresh = client.clone();
                let retained = connection.clone();
                let task = tokio::spawn(async move {
                    fresh.reconnect_tcp_connections(params, &[retained]).await
                });
                let req = request(&mut server).await;
                let action = if malformed_envelope {
                    json!({"channel":connection.resource(),"serverSeq":11.5,"action":{"type":"tcp/dataEof","finalOffset":0}})
                } else {
                    json!({"channel":connection.resource(),"serverSeq":11,"action":{"type":"tcp/dataEof","finalOffset":0.5}})
                };
                reply(&mut server, req, json!({"type":"replay","actions":[action],"missing":[]})).await;
                let result = task.await.unwrap();
                assert_eq!(result.is_err(), malformed_envelope);
                assert!(connection.read().await.is_err());
                assert!(matches!(dispatch(&mut server).await.action, StateAction::TcpClientReset(_)));
                notification(&mut server, "unsubscribe").await;
                client.shutdown().await;
            }
        }).await.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_credit_chunking_and_half_close() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, connection, mut server) = opened(Some("YWJj")).await;
            assert_eq!(connection.read().await.unwrap(), Some(b"abc".to_vec()));
            let credit = dispatch(&mut server).await;
            assert!(matches!(
                credit.action,
                StateAction::TcpDataConsumed(TcpDataConsumedAction { consumed_bytes: 3 })
            ));
            let writer = connection.clone();
            let writing = tokio::spawn(async move { writer.write_all(b"abcdef").await });
            let first = dispatch(&mut server).await;
            let second = dispatch(&mut server).await;
            assert!(
                matches!(&first.action,StateAction::TcpInput(a) if a.offset==0 && a.data=="YWJj")
            );
            assert!(
                matches!(&second.action,StateAction::TcpInput(a) if a.offset==3 && a.data=="ZA==")
            );
            assert!(!writing.is_finished());
            assert!(matches!(
                connection.write(b"x").await,
                Err(TcpError::Invalid(_))
            ));
            emit(
                &mut server,
                12,
                serde_json::to_value(&first.action).unwrap(),
                Some(first.client_seq),
            )
            .await;
            emit(
                &mut server,
                13,
                serde_json::to_value(&second.action).unwrap(),
                Some(second.client_seq),
            )
            .await;
            emit(
                &mut server,
                14,
                json!({"type":"tcp/inputConsumed","consumedBytes":4}),
                None,
            )
            .await;
            let last = dispatch(&mut server).await;
            assert!(
                matches!(&last.action,StateAction::TcpInput(a) if a.offset==4 && a.data=="ZWY=")
            );
            writing.await.unwrap().unwrap();
            let draining = connection.clone();
            let drain = tokio::spawn(async move { draining.drain().await });
            emit(
                &mut server,
                15,
                serde_json::to_value(&last.action).unwrap(),
                Some(last.client_seq),
            )
            .await;
            emit(
                &mut server,
                16,
                json!({"type":"tcp/inputConsumed","consumedBytes":6}),
                None,
            )
            .await;
            drain.await.unwrap().unwrap();
            connection.end().await.unwrap();
            let end = dispatch(&mut server).await;
            assert!(matches!(
                &end.action,
                StateAction::TcpInputEof(TcpInputEofAction { final_offset: 6 })
            ));
            emit(
                &mut server,
                17,
                json!({"type":"tcp/data","offset":0,"data":"YWJj"}),
                None,
            )
            .await;
            emit(
                &mut server,
                18,
                json!({"type":"tcp/dataEof","finalOffset":3}),
                None,
            )
            .await;
            assert!(connection.read().await.unwrap().is_none());
            emit(
                &mut server,
                19,
                serde_json::to_value(credit.action).unwrap(),
                Some(credit.client_seq),
            )
            .await;
            emit(
                &mut server,
                20,
                serde_json::to_value(end.action).unwrap(),
                Some(end.client_seq),
            )
            .await;
            let (closed, ()) = tokio::join!(connection.close(), acknowledge_close(&mut server, 21));
            closed.unwrap();
            assert_eq!(
                notification(&mut server, "unsubscribe").await["channel"],
                connection.resource()
            );
            connection.dispose().await.unwrap();
            assert!(server.rx.try_recv().is_err());
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_reset_and_rejection_wake_waiters() {
        tokio::time::timeout(Duration::from_secs(5),async{
                    for rejection in [false,true] {
                        let (client,connection,mut server)=opened(None).await;
                        connection.write_all(b"abcd").await.unwrap();
                        let first=dispatch(&mut server).await;dispatch(&mut server).await;
                        let reader=connection.clone();let read=tokio::spawn(async move{reader.read().await});
                        let writer=connection.clone();let write=tokio::spawn(async move{writer.write(b"z").await});
                        let drainer=connection.clone();let drain=tokio::spawn(async move{drainer.drain().await});
                        if rejection {
                            send(&mut server,json!({"jsonrpc":"2.0","method":"action","params":{
                                "channel":connection.resource(),"serverSeq":11,"action":first.action,"origin":{"clientId":"owner","clientSeq":first.client_seq},"rejectionReason":""
                            }})).await;
                        }else{
                            emit(&mut server,11,json!({"type":"tcp/hostReset","reason":"connectionReset"}),None).await;
                        }
                        assert!(read.await.unwrap().is_err());assert!(write.await.unwrap().is_err());assert!(drain.await.unwrap().is_err());
                        if rejection{assert!(matches!(dispatch(&mut server).await.action,StateAction::TcpClientReset(TcpClientResetAction{reason:TcpResetReason::ProtocolError})));}
                        notification(&mut server,"unsubscribe").await;
                        client.shutdown().await;
                    }
                }).await.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_resume_reconciles_echoes_before_resending() {
        tokio::time::timeout(Duration::from_secs(5),async{
                    for acknowledged in [false,true] {
                        let (old,connection,mut old_server)=opened(Some("eHk=")).await;
                        assert_eq!(connection.write(b"ab").await.unwrap(),2);
                        let original=dispatch(&mut old_server).await;
                        old.shutdown_preserving_tcp().await;
                        let (wire,mut server)=pair();
                        let client=Client::connect(wire,ClientConfig::default()).await.unwrap();
                        let fresh=client.clone();let retained=connection.clone();
                        let resume=tokio::spawn(async move{
                            fresh.reconnect_tcp_connections(ReconnectParams{
                                channel:ahp_types::ROOT_RESOURCE_URI.into(),meta:None,client_id:"owner".into(),last_seen_server_seq:999,subscriptions:vec!["ahp-session:/s1".into()]
                            },&[retained]).await
                        });
                        let req=request(&mut server).await;assert_eq!(req.method,"reconnect");
                        let params:ReconnectParams=serde_json::from_value(serde_json::to_value(req.params.clone()).unwrap()).unwrap();
                        assert!(params.last_seen_server_seq<=11);assert!(params.subscriptions.contains(&connection.resource().to_string()));
                        let mut actions=vec![json!({"channel":connection.resource(),"serverSeq":11,"action":{"type":"tcp/data","offset":0,"data":"eHk="}})];
                        if acknowledged{actions.push(json!({"channel":connection.resource(),"serverSeq":12,"action":original.action,"origin":{"clientId":"owner","clientSeq":original.client_seq}}));}
                        reply(&mut server,req,json!({"type":"replay","actions":actions,"missing":[]})).await;
                        emit(&mut server,13,json!({"type":"tcp/data","offset":0,"data":"eHk="}),None).await;
                        emit(&mut server,14,json!({"type":"tcp/dataEof","finalOffset":2}),None).await;
                        resume.await.unwrap().unwrap();
                        let identity = client.tcp_identity().await.unwrap();
                        assert_eq!(identity.0, "owner");
                        assert!(identity.1.is_some());
                        if !acknowledged{
                            let replay=dispatch(&mut server).await;
                            assert_eq!(replay.client_seq,original.client_seq);assert_eq!(replay.action,original.action);
                        }
                        assert_eq!(connection.read().await.unwrap(),Some(b"xy".to_vec()));
                        let credit=dispatch(&mut server).await;
                        assert!(credit.client_seq>original.client_seq);assert!(matches!(credit.action,StateAction::TcpDataConsumed(_)));
                        assert!(connection.read().await.unwrap().is_none());
                        connection.dispose().await.unwrap();dispatch(&mut server).await;notification(&mut server,"unsubscribe").await;
                        client.shutdown().await;
                    }
                }).await.unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_resume_applies_replay_before_queued_live_data() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (old, connection, mut old_server) = opened(None).await;
            connection.write_all(b"xy").await.unwrap();
            let original = dispatch(&mut old_server).await;
            old.shutdown_preserving_tcp().await;
            let (wire, mut server) = pair();
            let client = Client::connect(
                wire,
                ClientConfig {
                    subscription_buffer: 2,
                    ..ClientConfig::default()
                },
            )
            .await
            .unwrap();
            let fresh = client.clone();
            let retained = connection.clone();
            let resume = tokio::spawn(async move {
                fresh
                    .reconnect_tcp_connections(
                        ReconnectParams {
                            channel: ahp_types::ROOT_RESOURCE_URI.into(),
                            meta: None,
                            client_id: "owner".into(),
                            last_seen_server_seq: 999,
                            subscriptions: vec![],
                        },
                        &[retained],
                    )
                    .await
            });
            let req = request(&mut server).await;
            unrelated_burst(&client, &mut server, 12).await;
            {
                // Hold replay application until later live frames reach the strict receiver.
                let inner = connection.shared.inner.lock().await;
                assert!(inner.resuming && !inner.online);
                reply(
                    &mut server,
                    req,
                    json!({
                        "type":"replay", "missing":[], "actions":[{
                            "channel":connection.resource(), "serverSeq":11,
                            "action":{"type":"tcp/data","offset":0,"data":"YWI="}
                        }]
                    }),
                )
                .await;
                unrelated_burst(&client, &mut server, 44).await;
                emit(
                    &mut server,
                    76,
                    json!({"type":"tcp/data","offset":2,"data":"Y2Q="}),
                    None,
                )
                .await;
                emit(
                    &mut server,
                    77,
                    json!({"type":"tcp/dataEof","finalOffset":4}),
                    None,
                )
                .await;
                let (ping, ()) = tokio::join!(client.ping(), async {
                    let req = request(&mut server).await;
                    assert_eq!(req.method, "ping");
                    reply(&mut server, req, Value::Null).await;
                });
                ping.unwrap();
                assert!(server.rx.try_recv().is_err());
            }
            resume.await.unwrap().unwrap();
            let resend = dispatch(&mut server).await;
            assert_eq!(resend.client_seq, original.client_seq);
            assert_eq!(resend.action, original.action);
            let (ping, ()) = tokio::join!(client.ping(), async {
                let req = request(&mut server).await;
                assert_eq!(req.method, "ping");
                reply(&mut server, req, Value::Null).await;
            });
            ping.unwrap();
            assert!(server.rx.try_recv().is_err());
            for (index, expected) in [b"ab", b"cd"].iter().enumerate() {
                assert_eq!(connection.read().await.unwrap(), Some(expected.to_vec()));
                let credit = dispatch(&mut server).await;
                assert!(credit.client_seq > original.client_seq);
                assert_eq!(
                    credit.action,
                    StateAction::TcpDataConsumed(TcpDataConsumedAction {
                        consumed_bytes: (index as i64 + 1) * 2,
                    })
                );
            }
            assert!(connection.read().await.unwrap().is_none());
            connection.dispose().await.unwrap();
            dispatch(&mut server).await;
            notification(&mut server, "unsubscribe").await;
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_snapshot_missing_and_decode_loss_are_terminal() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for snapshot_fallback in [false, true] {
                let (old, connection, _old_server) = opened(None).await;
                old.shutdown_preserving_tcp().await;
                let (wire, mut server) = pair();
                let client = Client::connect(wire, ClientConfig::default())
                    .await
                    .unwrap();
                let fresh = client.clone();
                let retained = connection.clone();
                let resume = tokio::spawn(async move {
                    fresh
                        .reconnect_tcp_connections(
                            ReconnectParams {
                                channel: ahp_types::ROOT_RESOURCE_URI.into(),
                                meta: None,
                                client_id: "owner".into(),
                                last_seen_server_seq: 0,
                                subscriptions: vec![],
                            },
                            &[retained],
                        )
                        .await
                });
                let req = request(&mut server).await;
                reply(
                    &mut server,
                    req,
                    if snapshot_fallback {
                        json!({"type":"snapshot","snapshots":[snapshot()["snapshot"]]})
                    } else {
                        json!({"type":"replay","actions":[],"missing":[connection.resource()]})
                    },
                )
                .await;
                resume.await.unwrap().unwrap();
                assert!(matches!(
                    connection.read().await,
                    Err(TcpError::ReplayUnavailable)
                ));
                notification(&mut server, "unsubscribe").await;
                let (next, ()) = tokio::join!(
                    client.open_tcp_connection("ahp-session:/s1".into(), options()),
                    async {
                        let req = request(&mut server).await;
                        assert_eq!(req.method, "subscribe");
                        reply(&mut server, req, snapshot()).await;
                    }
                );
                next.unwrap().dispose().await.unwrap();
                dispatch(&mut server).await;
                notification(&mut server, "unsubscribe").await;
                client.shutdown().await;
            }
            let (client, connection, mut server) = opened(None).await;
            server
                .send(TransportMessage::Text("{".into()))
                .await
                .unwrap();
            assert!(matches!(connection.read().await, Err(TcpError::Client(_))));
            assert!(matches!(
                dispatch(&mut server).await.action,
                StateAction::TcpClientReset(_)
            ));
            notification(&mut server, "unsubscribe").await;
            client.shutdown().await;
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owned_tcp_cancelled_creation_cleans_late_child() {
        tokio::time::timeout(Duration::from_secs(5), async {
            let (client, mut server) = initialized().await;
            let creator = client.clone();
            let opening = tokio::spawn(async move {
                creator
                    .open_tcp_connection("ahp-session:/s1".into(), options())
                    .await
            });
            let req = request(&mut server).await;
            assert_eq!(req.method, "subscribe");
            opening.abort();
            assert!(matches!(opening.await, Err(error) if error.is_cancelled()));
            reply(&mut server, req, snapshot()).await;
            assert!(matches!(
                dispatch(&mut server).await.action,
                StateAction::TcpClientReset(_)
            ));
            assert_eq!(
                notification(&mut server, "unsubscribe").await["channel"],
                "ahp-tcp:/owned"
            );
            client.shutdown().await;
        })
        .await
        .unwrap();
    }
}
