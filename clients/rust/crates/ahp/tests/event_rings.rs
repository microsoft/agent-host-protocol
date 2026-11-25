#![allow(clippy::panic, clippy::unwrap_used)]

//! The client's event rings: what a receiver is given, and what a ring costs.
//!
//! A `Client` keeps one `broadcast` ring of all events and one per attached
//! resource, each of `ClientConfig::subscription_buffer` slots that are
//! allocated when the ring is created. These tests pin the delivery
//! semantics (every event, whole and in order; the newest
//! `subscription_buffer` events for a receiver that lagged further than
//! that; end of stream when the transport closes) and that an idle ring
//! costs a pointer-sized slot rather than an inline event.

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
use std::future::Future;
use std::time::Duration;

use ahp::{
    Client, ClientConfig, ClientEvent, SubscriptionEvent, Transport, TransportError,
    TransportMessage,
};
use ahp_types::actions::{ActionEnvelope, SessionTitleChangedAction, StateAction};
use ahp_types::messages::{
    ActionNotificationParams, JsonRpcMessage, JsonRpcNotification, JsonRpcVersion,
};
use tokio::sync::mpsc;

/// Counts the bytes the calling thread requests from the allocator. Each
/// test runs on its own thread (`#[tokio::test]` is a current-thread
/// runtime), so other tests do not show up in the count.
struct CountingAllocator;

thread_local! {
    static REQUESTED: Cell<usize> = const { Cell::new(0) };
}

// SAFETY: every call is forwarded to the system allocator unchanged; the
// counter is bookkeeping on the side.
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let _ = REQUESTED.try_with(|requested| requested.set(requested.get() + layout.size()));
        // SAFETY: the caller upholds `GlobalAlloc::alloc`'s contract.
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: `ptr` was returned by `alloc` above, i.e. by `System`.
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

fn requested() -> usize {
    REQUESTED.with(Cell::get)
}

struct MemTransport {
    tx: mpsc::Sender<TransportMessage>,
    rx: mpsc::Receiver<TransportMessage>,
}

fn pair() -> (MemTransport, MemTransport) {
    let (a_tx, a_rx) = mpsc::channel(64);
    let (b_tx, b_rx) = mpsc::channel(64);
    (
        MemTransport { tx: a_tx, rx: b_rx },
        MemTransport { tx: b_tx, rx: a_rx },
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

const SESSION: &str = "ahp-session:/rings";

fn config(subscription_buffer: usize) -> ClientConfig {
    ClientConfig {
        default_request_timeout: Some(Duration::from_secs(5)),
        subscription_buffer,
    }
}

/// Server side: emit a `session/titleChanged` action for `SESSION`.
async fn send_title(server: &mut MemTransport, server_seq: u64, title: &str) {
    let envelope = ActionEnvelope {
        channel: SESSION.into(),
        action: StateAction::SessionTitleChanged(SessionTitleChangedAction {
            title: title.into(),
        }),
        server_seq,
        origin: None,
        rejection_reason: None,
    };
    let notification = JsonRpcMessage::Notification(JsonRpcNotification {
        jsonrpc: JsonRpcVersion::V2,
        method: "action".into(),
        params: Some(ahp_types::common::AnyValue::from(
            serde_json::to_value(ActionNotificationParams::from(envelope)).unwrap(),
        )),
    });
    server
        .send(TransportMessage::encode(&notification).unwrap())
        .await
        .unwrap();
}

/// `(channel, server_seq, title)` of a title-changed action event.
fn title_of(event: SubscriptionEvent) -> (String, u64, String) {
    let SubscriptionEvent::Action(envelope) = event else {
        panic!("expected an action event");
    };
    let StateAction::SessionTitleChanged(action) = envelope.action else {
        panic!("expected a title-changed action");
    };
    (envelope.channel, envelope.server_seq, action.title)
}

fn title_of_client_event(event: ClientEvent) -> (String, u64, String) {
    let (channel, server_seq, title) = title_of(event.event);
    assert_eq!(event.channel, channel);
    (channel, server_seq, title)
}

async fn soon<T>(future: impl Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(5), future)
        .await
        .expect("timed out waiting for an event")
}

/// A ring allocates all of its slots up front. With the event stored inline
/// a slot is several hundred bytes; behind a pointer it is a few words.
#[tokio::test]
async fn an_idle_ring_costs_a_pointer_per_slot() {
    const SLOTS: usize = 4_096;
    // A pointer slot is 32 bytes on 64-bit targets; an inline event is well
    // over 500.
    const MAX_BYTES_PER_SLOT: usize = 64;

    let (client_side, _server) = pair();
    let before = requested();
    let client = Client::connect(client_side, config(SLOTS)).await.unwrap();
    let all_events = requested() - before;
    assert!(
        all_events <= SLOTS * MAX_BYTES_PER_SLOT,
        "the all-events ring requested {all_events} bytes for {SLOTS} slots"
    );

    let before = requested();
    let subscription = client.attach_subscription(SESSION).await;
    let per_resource = requested() - before;
    assert!(
        per_resource <= SLOTS * MAX_BYTES_PER_SLOT,
        "a resource's ring requested {per_resource} bytes for {SLOTS} slots"
    );
    drop(subscription);
}

/// Two all-events receivers and one per-resource receiver each get every
/// event, whole and in the order it was sent.
#[tokio::test]
async fn every_receiver_gets_every_event_in_order() {
    let (client_side, mut server) = pair();
    let client = Client::connect(client_side, config(64)).await.unwrap();
    let mut first = client.events();
    let mut second = client.events();
    let mut resource = client.attach_subscription(SESSION).await;

    let padding = "a title long enough to live on the heap ".repeat(200);
    let sent: Vec<(String, u64, String)> = (1..=40)
        .map(|seq| (SESSION.to_string(), seq, format!("{seq} {padding}")))
        .collect();
    for (_, seq, title) in &sent {
        send_title(&mut server, *seq, title).await;
    }

    let mut by_first = Vec::new();
    let mut by_second = Vec::new();
    let mut by_resource = Vec::new();
    for _ in &sent {
        by_first.push(title_of_client_event(soon(first.recv()).await.unwrap()));
        by_resource.push(title_of(soon(resource.recv()).await.unwrap()));
    }
    // The second receiver starts only after the first has read everything:
    // each receiver has its own cursor.
    for _ in &sent {
        by_second.push(title_of_client_event(soon(second.recv()).await.unwrap()));
    }
    assert_eq!(by_first, sent);
    assert_eq!(by_second, sent);
    assert_eq!(by_resource, sent);
}

/// A receiver that lagged by more than the ring's capacity resumes at the
/// oldest event still held, i.e. it gets the newest `subscription_buffer`
/// events and continues from there.
#[tokio::test]
async fn a_lagging_receiver_resumes_at_the_newest_buffer() {
    const SLOTS: u64 = 8;
    let (client_side, mut server) = pair();
    let client = Client::connect(client_side, config(SLOTS as usize))
        .await
        .unwrap();
    let mut prompt = client.events();
    let mut late = client.events();
    let mut late_resource = client.attach_subscription(SESSION).await;

    // `prompt` reads each event as it arrives, so all twenty have been
    // fanned out before the late receivers read their first.
    for seq in 1..=20 {
        send_title(&mut server, seq, "t").await;
        assert_eq!(
            title_of_client_event(soon(prompt.recv()).await.unwrap()).1,
            seq
        );
    }

    let mut by_late = Vec::new();
    let mut by_late_resource = Vec::new();
    for _ in 0..SLOTS {
        by_late.push(title_of_client_event(soon(late.recv()).await.unwrap()).1);
        by_late_resource.push(title_of(soon(late_resource.recv()).await.unwrap()).1);
    }
    let newest: Vec<u64> = (20 - SLOTS + 1..=20).collect();
    assert_eq!(by_late, newest);
    assert_eq!(by_late_resource, newest);

    send_title(&mut server, 21, "t").await;
    assert_eq!(
        title_of_client_event(soon(late.recv()).await.unwrap()).1,
        21
    );
    assert_eq!(title_of(soon(late_resource.recv()).await.unwrap()).1, 21);
}

/// A receiver only gets events sent after it was created, and keeps getting
/// its own after other receivers are dropped.
#[tokio::test]
async fn a_receiver_gets_only_events_sent_after_it_was_created() {
    let (client_side, mut server) = pair();
    let client = Client::connect(client_side, config(16)).await.unwrap();
    let mut resource = client.attach_subscription(SESSION).await;

    // No all-events receiver exists yet. Reading the event from the
    // per-resource receiver proves the client has already fanned it out.
    send_title(&mut server, 1, "before any all-events receiver").await;
    assert_eq!(title_of(soon(resource.recv()).await.unwrap()).1, 1);
    let mut early = client.events();
    send_title(&mut server, 2, "first for the all-events receiver").await;
    assert_eq!(
        title_of_client_event(soon(early.recv()).await.unwrap()).1,
        2
    );

    let mut remaining = client.events();
    drop(early);
    drop(resource);
    send_title(&mut server, 3, "after the other receivers were dropped").await;
    assert_eq!(
        title_of_client_event(soon(remaining.recv()).await.unwrap()),
        (
            SESSION.to_string(),
            3,
            "after the other receivers were dropped".to_string()
        )
    );
}

/// When the transport closes, an all-events receiver gets what was sent and
/// then end of stream.
#[tokio::test]
async fn receivers_see_end_of_stream_when_the_transport_closes() {
    let (client_side, mut server) = pair();
    let client = Client::connect(client_side, config(16)).await.unwrap();
    let mut events = client.events();

    send_title(&mut server, 1, "last").await;
    assert_eq!(
        title_of_client_event(soon(events.recv()).await.unwrap()).1,
        1
    );
    drop(server);
    assert!(soon(events.recv()).await.is_none());
    // A receiver created after the close sees end of stream immediately.
    assert!(soon(client.events().recv()).await.is_none());
}
