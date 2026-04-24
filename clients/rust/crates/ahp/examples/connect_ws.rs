//! Minimal example: connect over WebSocket, initialize, and stream
//! events from the root resource until Ctrl+C.
//!
//! Run with:
//!
//! ```sh
//! cargo run --example connect_ws --features ws -- ws://localhost:12345
//! ```
//!
//! Requires the companion `ahp-ws` crate. Passing a `--features` flag is
//! only needed because this example depends on an optional dev dependency
//! on `ahp-ws`; the core `ahp` crate stays transport-agnostic.

use std::env;

use ahp::{Client, ClientConfig, SubscriptionEvent};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::try_init().ok();

    let url = env::args()
        .nth(1)
        .unwrap_or_else(|| "ws://localhost:12345".into());

    let transport = ahp_ws::WebSocketTransport::connect(&url).await?;
    let client = Client::connect(transport, ClientConfig::default()).await?;

    let init = client
        .initialize("rust-example".into(), 1, vec!["root:/".into()])
        .await?;
    println!("connected (protocolVersion={})", init.protocol_version);

    let mut sub = client.attach_subscription("root:/").await;
    println!("subscribed; streaming events (Ctrl+C to quit)...");

    loop {
        tokio::select! {
            ev = sub.recv() => match ev {
                Some(SubscriptionEvent::Action(a)) => {
                    println!("action seq={} {}", a.server_seq, serde_json::to_string(&a.action)?);
                }
                Some(SubscriptionEvent::Notification(n)) => {
                    println!("notification {}", serde_json::to_string(&n)?);
                }
                None => break,
            },
            _ = tokio::signal::ctrl_c() => {
                println!("shutting down");
                break;
            }
        }
    }

    client.shutdown().await;
    Ok(())
}
