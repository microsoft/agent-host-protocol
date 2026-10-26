//! A small in-memory AHP host for the windowing examples.
//!
//! It implements only what the examples need: `initialize`, a windowed
//! `subscribe` to one terminal, and the host side of the window rules:
//!
//! - It counts every data message it sends, in UTF-16 bytes, and stops while
//!   `sent - consumed` is at or above the client's window.
//! - It counts every data message the client sends, and returns
//!   `channel/credit` after it has processed each one.
//!
//! A real host applies the same rules to every windowed subscription.

// Each example includes this file with `#[path]`, and neither uses every item.
#![allow(dead_code)]

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use ahp::ahp_types::actions::StateAction;
use ahp::ahp_types::state::{ChannelFlowControl, ChannelReceiveLimits};
use ahp::ahp_types::SUPPORTED_PROTOCOL_VERSIONS;
use ahp::windowing::utf16_bytes;
use ahp::{Transport, TransportError, TransportMessage, WindowTransportCapabilities};
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

/// The error type that the examples return.
pub type Error = Box<dyn std::error::Error + Send + Sync>;

const MAXIMUM_FRAME_BYTES: i64 = 16_384;

fn log(message: impl std::fmt::Display) {
    println!("  host   | {message}");
}

/// Options for [`DemoHost::start`].
pub struct DemoHostOptions {
    /// The largest window the host accepts for data that it sends.
    pub client_window_bytes: i64,
    /// The window the host offers for data that the client sends.
    pub host_window_bytes: i64,
    /// How long the host takes to process one message from the client.
    pub input_delay: Duration,
}

/// The client's half of an in-memory connection to a [`DemoHost`].
///
/// It passes JSON text through unchanged, so it reports raw-text support and
/// the client can offer windowed delivery over it.
pub struct DemoTransport {
    inbound: mpsc::UnboundedReceiver<String>,
    outbound: mpsc::UnboundedSender<String>,
}

impl Transport for DemoTransport {
    fn window_capabilities(&self) -> WindowTransportCapabilities {
        WindowTransportCapabilities::default().raw_text(true)
    }

    async fn send(&mut self, message: TransportMessage) -> Result<(), TransportError> {
        let text = match message {
            TransportMessage::Text(text) => text,
            TransportMessage::Binary(bytes) => {
                String::from_utf8(bytes).map_err(|e| TransportError::Protocol(e.to_string()))?
            }
            TransportMessage::Parsed(message) => serde_json::to_string(&message)
                .map_err(|e| TransportError::Protocol(e.to_string()))?,
        };
        self.outbound.send(text).map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        Ok(self.inbound.recv().await.map(TransportMessage::Text))
    }
}

/// An in-memory host. Clones share the same connection.
#[derive(Clone)]
pub struct DemoHost {
    shared: Arc<Shared>,
}

struct Shared {
    options: DemoHostOptions,
    // Dropping the sender closes the connection to the client.
    outbound: Mutex<Option<mpsc::UnboundedSender<String>>>,
    state: Mutex<State>,
    subscribed: watch::Sender<bool>,
    // The client's running credit total for data that the host sends.
    consumed_bytes: watch::Sender<u64>,
    // Data messages from the client, waiting to be processed one at a time.
    input: mpsc::UnboundedSender<(u64, Value)>,
    tasks: Mutex<Vec<JoinHandle<()>>>,
}

#[derive(Default)]
struct State {
    limits: Option<ChannelFlowControl>,
    channel: String,
    server_seq: i64,
    sent_bytes: u64,
    received_bytes: u64,
    processed_bytes: u64,
    received_input: String,
}

impl DemoHost {
    /// Start the host. Give the returned transport to the client.
    pub fn start(options: DemoHostOptions) -> (Self, DemoTransport) {
        let (to_client, client_inbound) = mpsc::unbounded_channel();
        let (client_outbound, from_client) = mpsc::unbounded_channel();
        let (input, inputs) = mpsc::unbounded_channel();
        let host = Self {
            shared: Arc::new(Shared {
                options,
                outbound: Mutex::new(Some(to_client)),
                state: Mutex::default(),
                subscribed: watch::Sender::new(false),
                consumed_bytes: watch::Sender::new(0),
                input,
                tasks: Mutex::default(),
            }),
        };
        let tasks = vec![
            tokio::spawn(host.clone().run(from_client)),
            tokio::spawn(host.clone().process_input(inputs)),
        ];
        *lock(&host.shared.tasks) = tasks;
        let transport = DemoTransport {
            inbound: client_inbound,
            outbound: client_outbound,
        };
        (host, transport)
    }

    /// Wait until the host has accepted the subscription and sent the snapshot.
    pub async fn when_subscribed(&self) {
        let _ = self
            .shared
            .subscribed
            .subscribe()
            .wait_for(|subscribed| *subscribed)
            .await;
    }

    /// Terminal input that the host has processed, in order.
    pub fn received_input(&self) -> String {
        lock(&self.shared.state).received_input.clone()
    }

    /// Send one terminal action, first waiting for credit if the client's window is full.
    pub async fn send_action(&self, action: StateAction) -> Result<(), Error> {
        let (window, sent) = {
            let state = lock(&self.shared.state);
            let limits = state.limits.as_ref().ok_or("no windowed subscription")?;
            (limits.client_receive.window_bytes as u64, state.sent_bytes)
        };
        let mut consumed = self.shared.consumed_bytes.subscribe();
        let outstanding = sent - *consumed.borrow_and_update();
        if outstanding >= window {
            log(format!(
                "window full ({outstanding} of {window} bytes outstanding); pausing output"
            ));
            let consumed = *consumed
                .wait_for(|consumed| sent - consumed < window)
                .await?;
            log(format!(
                "credit received (consumedBytes={consumed}); resuming output"
            ));
        }
        let message = {
            let mut state = lock(&self.shared.state);
            state.server_seq += 1;
            json!({
                "jsonrpc": "2.0",
                "method": "action",
                "params": {
                    "channel": state.channel,
                    "action": action,
                    "serverSeq": state.server_seq,
                },
            })
        };
        self.send_data(&message);
        Ok(())
    }

    /// Close the connection and stop the host.
    pub fn close(&self) {
        lock(&self.shared.outbound).take();
        for task in lock(&self.shared.tasks).drain(..) {
            task.abort();
        }
    }

    fn send_data(&self, message: &Value) {
        let text = message.to_string();
        lock(&self.shared.state).sent_bytes += utf16_bytes(&text);
        self.send_text(text);
    }

    fn send_control(&self, message: &Value) {
        self.send_text(message.to_string());
    }

    fn send_text(&self, text: String) {
        if let Some(outbound) = lock(&self.shared.outbound).as_ref() {
            let _ = outbound.send(text);
        }
    }

    async fn run(self, mut from_client: mpsc::UnboundedReceiver<String>) {
        while let Some(text) = from_client.recv().await {
            let Ok(message) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            match message["method"].as_str() {
                Some("initialize") => self.send_control(&json!({
                    "jsonrpc": "2.0",
                    "id": message["id"],
                    "result": {
                        "protocolVersion": SUPPORTED_PROTOCOL_VERSIONS[0],
                        "serverSeq": 0,
                        "snapshots": [],
                    },
                })),
                Some("subscribe") => self.accept_subscription(&message),
                Some("channel/credit") => {
                    // Credit is a running total, so ignore values that are not larger.
                    if let Some(total) = message["params"]["consumedBytes"].as_u64() {
                        self.shared.consumed_bytes.send_if_modified(|consumed| {
                            let larger = total > *consumed;
                            if larger {
                                *consumed = total;
                            }
                            larger
                        });
                    }
                }
                Some("dispatchAction") => {
                    self.receive_input(&text, message["params"]["action"].clone());
                }
                _ => {}
            }
        }
    }

    fn accept_subscription(&self, message: &Value) {
        let params = &message["params"];
        let offered = &params["flowControl"]["receive"];
        let (Some(offered_window), Some(offered_frame)) = (
            offered["windowBytes"].as_i64(),
            offered["maximumFrameBytes"].as_i64(),
        ) else {
            self.send_control(&json!({
                "jsonrpc": "2.0",
                "id": message["id"],
                "error": { "code": -32602, "message": "the examples expect a windowed subscribe" },
            }));
            return;
        };
        let channel = params["channel"].as_str().unwrap_or_default().to_owned();
        // A host can lower the limits that the client offered, but never raise them.
        let limits = ChannelFlowControl {
            client_receive: ChannelReceiveLimits {
                window_bytes: offered_window.min(self.shared.options.client_window_bytes),
                maximum_frame_bytes: offered_frame.min(MAXIMUM_FRAME_BYTES),
            },
            host_receive: ChannelReceiveLimits {
                window_bytes: self.shared.options.host_window_bytes,
                maximum_frame_bytes: MAXIMUM_FRAME_BYTES,
            },
        };
        log(format!(
            "accepted windowed delivery: client window {} bytes (offered {offered_window}), host window {} bytes",
            limits.client_receive.window_bytes, limits.host_receive.window_bytes,
        ));
        self.send_control(&json!({
            "jsonrpc": "2.0",
            "id": message["id"],
            "result": { "flowControl": limits },
        }));
        let server_seq = {
            let mut state = lock(&self.shared.state);
            state.channel.clone_from(&channel);
            state.limits = Some(limits);
            state.server_seq
        };

        // The first data message on a windowed subscription is always the snapshot.
        self.send_data(&json!({
            "jsonrpc": "2.0",
            "method": "channel/snapshot",
            "params": {
                "channel": channel,
                "snapshot": {
                    "resource": channel,
                    "state": {
                        "title": "demo shell",
                        "content": [],
                        "lifecycle": { "status": "running" },
                        "claim": { "kind": "client", "clientId": "windowing-example" },
                    },
                    "fromSeq": server_seq,
                },
            },
        }));
        self.shared.subscribed.send_replace(true);
    }

    fn receive_input(&self, text: &str, action: Value) {
        let bytes = utf16_bytes(text);
        let mut state = lock(&self.shared.state);
        state.received_bytes += bytes;
        if let Some(limits) = &state.limits {
            let limits = &limits.host_receive;
            // The client can go past the window only with the message that fills it.
            if state.received_bytes - state.processed_bytes
                > (limits.window_bytes + limits.maximum_frame_bytes) as u64
            {
                log("client went past the host window");
            }
        }
        let _ = self.shared.input.send((bytes, action));
    }

    // Process input one message at a time, then return credit for it.
    async fn process_input(self, mut inputs: mpsc::UnboundedReceiver<(u64, Value)>) {
        while let Some((bytes, action)) = inputs.recv().await {
            tokio::time::sleep(self.shared.options.input_delay).await;
            let message = {
                let mut state = lock(&self.shared.state);
                if let Ok(StateAction::TerminalInput(input)) = serde_json::from_value(action) {
                    state.received_input.push_str(&input.data);
                }
                state.processed_bytes += bytes;
                json!({
                    "jsonrpc": "2.0",
                    "method": "channel/credit",
                    "params": { "channel": state.channel, "consumedBytes": state.processed_bytes },
                })
            };
            self.send_control(&message);
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}
