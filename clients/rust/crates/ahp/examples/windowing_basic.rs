//! Basic windowed delivery.
//!
//! The client offers windowed delivery on a terminal subscription. The host
//! accepts a smaller window, then sends a snapshot and terminal output. When
//! the window is full, the host waits; each time the client finishes with a
//! delivery, it releases it and returns credit, so the host can continue.
//!
//! Run with:
//!
//! ```sh
//! cargo run -p ahp --example windowing_basic
//! ```

#[path = "support/windowing_demo_host.rs"]
mod windowing_demo_host;

use std::time::Duration;

use ahp::ahp_types::actions::{StateAction, TerminalDataAction};
use ahp::ahp_types::SUPPORTED_PROTOCOL_VERSIONS;
use ahp::{Client, FlowControlStatus, SubscriptionEvent, WindowOptions};
use windowing_demo_host::{DemoHost, DemoHostOptions, Error};

const TERMINAL: &str = "ahp-terminal:/demo";
const OUTPUT: [&str; 8] = [
    "$ npm test",
    "> demo@1.0.0 test",
    "> node --test",
    "ok 1 - parses the configuration file",
    "ok 2 - rejects an unknown option",
    "ok 3 - reads input from stdin",
    "ok 4 - writes the report",
    "# pass 4, fail 0",
];

fn log(message: impl std::fmt::Display) {
    println!("  client | {message}");
}

fn accepted_window(status: &FlowControlStatus) -> String {
    status.limits.as_ref().map_or("none".into(), |limits| {
        limits.client_receive.window_bytes.to_string()
    })
}

// A single-threaded runtime keeps the host and client log lines in a stable order.
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Error> {
    // The host accepts at most a 1024-byte window, so it fills after a few messages.
    let (host, transport) = DemoHost::start(DemoHostOptions {
        client_window_bytes: 1024,
        host_window_bytes: 4096,
        input_delay: Duration::ZERO,
    });
    let client = Client::builder().connect(transport).await?;
    let versions = SUPPORTED_PROTOCOL_VERSIONS.iter().map(|v| v.to_string());
    client
        .initialize("windowing-example".into(), versions.collect(), vec![])
        .await?;

    // Windowing is off by default. Opt in for this subscription and offer a
    // 4096-byte window. Coalescing is turned off so that every host message is a
    // separate delivery; see windowing_backpressure.rs for coalescing.
    let (_, mut subscription) = client
        .subscribe_windowed(
            TERMINAL,
            WindowOptions::default()
                .window_bytes(4096)
                .coalescing(false),
        )
        .await?;
    let status = subscription.status();
    log(format!(
        "subscribed: mode={}, accepted window={} bytes",
        status.mode,
        accepted_window(&status)
    ));

    // The host writes terminal output as fast as the window allows.
    let writer = tokio::spawn({
        let host = host.clone();
        async move {
            host.when_subscribed().await;
            for line in OUTPUT {
                let data = format!("{line}\r\n");
                host.send_action(StateAction::TerminalData(TerminalDataAction { data }))
                    .await?;
            }
            Ok::<_, Error>(())
        }
    });

    // Each delivery holds its credit until it is dropped. Here it drops at the
    // end of the loop body, before the next one is taken, which is automatic
    // release. The client then returns credit for it. To release later, move
    // the delivery elsewhere and call `release()` or drop it there.
    let mut lines = 0;
    while let Some(delivery) = subscription.next().await? {
        let buffered = subscription.status().buffered_receive_bytes;
        let bytes = delivery.wire_bytes();
        match delivery.event() {
            SubscriptionEvent::Snapshot(_) => {
                log(format!(
                    "snapshot ({bytes} bytes; {buffered} bytes not yet released)"
                ));
            }
            SubscriptionEvent::Action(envelope) => {
                if let StateAction::TerminalData(output) = &envelope.action {
                    let text = output.data.trim_end();
                    log(format!(
                        "output {text:?} ({bytes} bytes; {buffered} bytes not yet released)"
                    ));
                    lines += 1;
                }
            }
            _ => {}
        }
        tokio::time::sleep(Duration::from_millis(20)).await; // Simulate rendering the delivery.
        if lines == OUTPUT.len() {
            break;
        }
    }

    log(format!("received all {lines} lines"));
    writer.await??;
    // Dropping the subscription also unsubscribes, in the background.
    client.unsubscribe(TERMINAL.into()).await?;
    drop(subscription);
    host.close();
    client.shutdown().await;
    Ok(())
}
