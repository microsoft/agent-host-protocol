//! Windowed delivery with backpressure and a custom coalescer.
//!
//! Part 1, receiving: the client renders slowly. While it is busy, the host
//! fills the window and the client queues what arrives. Adjacent queued
//! messages are combined before the renderer sees them:
//!
//! - The built-in coalescer joins adjacent `terminal/data` output.
//! - A custom coalescer keeps only the last of adjacent `terminal/resized`
//!   actions, because only the final size matters.
//!
//! Part 2, sending: the client pastes a large block of text into the terminal.
//! The host processes input slowly, so the client's send window fills. The
//! client waits until the subscription is writable before it sends each chunk,
//! instead of queueing the whole paste in memory.
//!
//! Run with:
//!
//! ```sh
//! cargo run -p ahp --example windowing_backpressure
//! ```

#[path = "support/windowing_demo_host.rs"]
mod windowing_demo_host;

use std::collections::BTreeMap;
use std::time::Duration;

use ahp::ahp_types::actions::{
    StateAction, TerminalDataAction, TerminalInputAction, TerminalResizedAction,
};
use ahp::ahp_types::messages::JsonRpcNotification;
use ahp::ahp_types::SUPPORTED_PROTOCOL_VERSIONS;
use ahp::{
    Client, CoalescingContext, Direction, FlowControlEvent, SubscriptionEvent, WindowOptions,
    WindowingConfig,
};
use tokio::sync::{broadcast, oneshot};
use windowing_demo_host::{DemoHost, DemoHostOptions, Error};

const TERMINAL: &str = "ahp-terminal:/demo";

fn log(message: impl std::fmt::Display) {
    println!("  client | {message}");
}

// A custom coalescer runs on two adjacent messages that are still queued. It
// returns the combined message, or `None` to leave them separate. The client
// never passes it messages that the protocol requires to stay separate, such
// as actions with an origin.
fn latest_resize(
    earlier: &JsonRpcNotification,
    later: &JsonRpcNotification,
    context: &CoalescingContext,
) -> Option<JsonRpcNotification> {
    if context.direction != Direction::Receive || later.method != "action" {
        return None;
    }
    let is_resize = |notification: &JsonRpcNotification| {
        notification
            .params
            .as_ref()
            .is_some_and(|params| params["action"]["type"] == "terminal/resized")
    };
    (is_resize(earlier) && is_resize(later)).then(|| later.clone())
}

// Count flow-control events by kind until `stop` fires, then count the events
// that are still buffered and return the totals.
async fn count_events(
    mut events: broadcast::Receiver<FlowControlEvent>,
    mut stop: oneshot::Receiver<()>,
) -> BTreeMap<String, usize> {
    use broadcast::error::{RecvError, TryRecvError};
    let mut counts = BTreeMap::new();
    loop {
        let event = tokio::select! {
            event = events.recv() => event,
            _ = &mut stop => break,
        };
        match event {
            Ok(event) => *counts.entry(event.kind).or_default() += 1,
            Err(RecvError::Lagged(_)) => {}
            Err(RecvError::Closed) => return counts,
        }
    }
    loop {
        match events.try_recv() {
            Ok(event) => *counts.entry(event.kind).or_default() += 1,
            Err(TryRecvError::Lagged(_)) => {}
            Err(_) => return counts,
        }
    }
}

// A single-threaded runtime keeps the host and client log lines in a stable order.
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Error> {
    let (host, transport) = DemoHost::start(DemoHostOptions {
        client_window_bytes: 2048,
        host_window_bytes: 1024,
        input_delay: Duration::from_millis(15),
    });
    let client = Client::builder()
        .windowing(
            WindowingConfig::default()
                .coalescer(latest_resize)
                // Allow at most 2048 bytes of unsent data to wait behind the message being sent.
                .max_buffered_send_bytes(2048),
        )
        .connect(transport)
        .await?;
    let versions = SUPPORTED_PROTOCOL_VERSIONS.iter().map(|v| v.to_string());
    client
        .initialize("windowing-example".into(), versions.collect(), vec![])
        .await?;

    // Count what the client did. This stream is for monitoring only and can drop
    // events; it never affects credit.
    let (stop_counting, stop) = oneshot::channel();
    let counter = tokio::spawn(count_events(client.flow_control_events(), stop));

    let (_, mut subscription) = client
        .subscribe_windowed(TERMINAL, WindowOptions::default().window_bytes(4096))
        .await?;
    let accepted = subscription
        .status()
        .limits
        .map_or("none".into(), |limits| {
            limits.client_receive.window_bytes.to_string()
        });
    log(format!("subscribed: accepted window={accepted} bytes"));

    // ─── Part 1: a slow renderer ────────────────────────────────────────────

    println!("\nPart 1: slow renderer");
    let data = |data: String| StateAction::TerminalData(TerminalDataAction { data });
    let resize = |cols, rows| StateAction::TerminalResized(TerminalResizedAction { cols, rows });
    let mut host_actions = vec![
        data("Building 120 modules\r\n".into()),
        // The user drags the corner of the terminal window.
        resize(100, 30),
        resize(110, 32),
        resize(120, 36),
        resize(132, 40),
    ];
    host_actions.extend((1..=10).map(|step| {
        let percent = step * 10;
        data(format!(
            "[{percent:>3}%] compiled {} modules\r\n",
            percent * 120 / 100
        ))
    }));
    host_actions.push(data("Build finished\r\n".into()));
    let host_messages = host_actions.len() + 1; // The snapshot, then each action.
    let writer = tokio::spawn({
        let host = host.clone();
        async move {
            host.when_subscribed().await;
            for action in host_actions {
                host.send_action(action).await?;
            }
            Ok::<_, Error>(())
        }
    });

    let mut renders = 0;
    while let Some(delivery) = subscription.next().await? {
        renders += 1;
        let bytes = delivery.wire_bytes();
        match delivery.event() {
            SubscriptionEvent::Snapshot(_) => log(format!("render snapshot ({bytes} bytes)")),
            SubscriptionEvent::Action(envelope) => match &envelope.action {
                StateAction::TerminalResized(size) => log(format!(
                    "render resize to {}x{} ({bytes} bytes)",
                    size.cols, size.rows
                )),
                StateAction::TerminalData(output) => {
                    let lines: Vec<_> = output
                        .data
                        .split("\r\n")
                        .filter(|l| !l.is_empty())
                        .collect();
                    let last = lines.last().copied().unwrap_or_default();
                    log(format!(
                        "render {} line(s) of output ({bytes} bytes): {last:?}",
                        lines.len()
                    ));
                    if output.data.contains("Build finished") {
                        break;
                    }
                }
                _ => {}
            },
            _ => {}
        }
        // The renderer is slow; the host fills the window meanwhile.
        tokio::time::sleep(Duration::from_millis(60)).await;
    }
    log(format!(
        "rendered {renders} deliveries for {host_messages} host messages"
    ));
    writer.await??;

    // ─── Part 2: pasting into a slow terminal ───────────────────────────────

    println!("\nPart 2: pasting into a slow terminal");
    let paste: Vec<String> = (1..=8)
        .map(|i| format!("echo \"line {i} of the pasted script\"\n"))
        .collect();
    let sender = subscription.sender();
    let mut waits = 0;
    for (index, chunk) in paste.iter().enumerate() {
        // Wait for room in the host window and the local send queue, rather than
        // queueing the whole paste. With one producer, this keeps sends within the limit.
        let status = subscription.status();
        if !status.writable {
            log(format!(
                "not writable ({} bytes awaiting credit, {} bytes queued); waiting",
                status.outstanding_send_bytes, status.buffered_send_bytes
            ));
            waits += 1;
            subscription.wait_writable().await?;
        }
        log(format!("send chunk {} of {}", index + 1, paste.len()));
        // Completes when the message is written to the transport. If another
        // producer has filled the send queue, this waits for room instead of
        // failing, so there is no backpressure error to retry. An error here
        // means the subscription or connection has closed.
        sender
            .dispatch(StateAction::TerminalInput(TerminalInputAction {
                data: chunk.clone(),
            }))
            .await?;
    }
    // Wait until the host has processed, and credited, every chunk.
    subscription
        .status_changes()
        .wait_for(|status| status.outstanding_send_bytes == 0 && status.buffered_send_bytes == 0)
        .await?;
    log(format!(
        "sent {} chunks, waiting {waits} times; host received the paste intact: {}",
        paste.len(),
        host.received_input() == paste.concat()
    ));

    let _ = stop_counting.send(());
    println!("\nFlow-control events:");
    for (kind, count) in counter.await? {
        println!("  {kind}: {count}");
    }

    client.unsubscribe(TERMINAL.into()).await?;
    drop(subscription);
    host.close();
    client.shutdown().await;
    Ok(())
}
