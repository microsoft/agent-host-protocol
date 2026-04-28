//! Apply a stream of actions to a local `RootState` and print the
//! result.
//!
//! The example mirrors what a UI client does internally: it consumes
//! [`ActionEnvelope`]s, fans them out to the matching reducer, and
//! reports each [`ReduceOutcome`].
//!
//! Run with:
//!
//! ```sh
//! cargo run --example reducers_demo
//! ```

use ahp::reducers::{apply_action_to_root, ReduceOutcome};
use ahp_types::actions::{
    ActionEnvelope, RootActiveSessionsChangedAction, RootAgentsChangedAction, StateAction,
};
use ahp_types::state::{AgentInfo, RootState};

fn main() {
    let mut root = RootState {
        agents: vec![],
        active_sessions: None,
        terminals: None,
        config: None,
    };

    let envelopes = vec![
        ActionEnvelope {
            action: StateAction::RootAgentsChanged(RootAgentsChangedAction {
                agents: vec![AgentInfo {
                    provider: "copilot".into(),
                    display_name: "GitHub Copilot".into(),
                    description: "AI pair programmer".into(),
                    models: vec![],
                    protected_resources: None,
                    customizations: None,
                }],
            }),
            server_seq: 1,
            origin: None,
            rejection_reason: None,
        },
        ActionEnvelope {
            action: StateAction::RootActiveSessionsChanged(RootActiveSessionsChangedAction {
                active_sessions: 3,
            }),
            server_seq: 2,
            origin: None,
            rejection_reason: None,
        },
    ];

    for env in &envelopes {
        let outcome = apply_action_to_root(&mut root, &env.action);
        println!("seq={} outcome={:?}", env.server_seq, outcome);
        debug_assert_eq!(outcome, ReduceOutcome::Applied);
    }

    println!("\nfinal RootState:");
    println!("  agents: {}", root.agents.len());
    println!("  active_sessions: {:?}", root.active_sessions);
}
