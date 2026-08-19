//! Tests for [`ahp::MultiHostStateMirror`] — the host-aware reducer
//! façade.
//!
//! Covers root-state isolation across hosts, the core "session URI
//! collisions across hosts don't clobber" invariant, per-host action
//! targeting, snapshot seeding, the `apply_event` forwarding shape,
//! and per-host reset.

use ahp::hosts::{HostId, HostSubscriptionEvent};
use ahp::{HostedResourceKey, MultiHostStateMirror, SubscriptionEvent};
use ahp_types::actions::{
    ActionEnvelope, RootActiveSessionsChangedAction, RootAgentsChangedAction,
    SessionTitleChangedAction, StateAction,
};
use ahp_types::common::ROOT_RESOURCE_URI;
use ahp_types::state::{
    AgentInfo, RootState, SessionLifecycle, SessionState, SessionStatus, SessionSummary, Snapshot,
    SnapshotState,
};

fn agent(provider: &str) -> AgentInfo {
    AgentInfo {
        provider: provider.into(),
        display_name: provider.into(),
        description: String::new(),
        models: vec![],
        protected_resources: None,
        customizations: None,
        capabilities: None,
    }
}

fn root_snapshot(agents: Vec<AgentInfo>) -> Snapshot {
    Snapshot {
        resource: ROOT_RESOURCE_URI.to_string(),
        state: SnapshotState::Root(Box::new(RootState {
            agents,
            active_sessions: None,
            terminals: None,
            config: None,
            meta: None,
        })),
        from_seq: 0,
    }
}

fn session_state(title: &str, _resource: &str) -> SessionState {
    SessionState {
        provider: "copilot".into(),
        title: title.into(),
        status: SessionStatus::Idle.bits(),
        activity: None,
        origin: None,
        project: None,
        working_directories: None,
        annotations: None,
        lifecycle: SessionLifecycle::Ready,
        creation_error: None,
        server_tools: None,
        active_clients: vec![],
        chats: vec![],
        default_chat: None,
        config: None,
        customizations: None,
        changesets: None,
        input_needed: None,
        meta: None,
    }
}

fn session_snapshot(title: &str, resource: &str) -> Snapshot {
    Snapshot {
        resource: resource.into(),
        state: SnapshotState::Session(Box::new(session_state(title, resource))),
        from_seq: 0,
    }
}

fn automation_snapshot() -> Snapshot {
    serde_json::from_value(serde_json::json!({
        "resource": "ahp-automations://",
        "state": {
            "automations": [{
                "resource": "ahp-automation:/a1",
                "definition": {
                    "title": "Old",
                    "message": { "text": "triage", "origin": { "kind": "automation" } },
                    "session": {},
                    "enabled": true,
                    "triggers": []
                },
                "runs": [],
                "operations": ["update", "run"],
                "createdAt": "2026-08-01T00:00:00Z",
                "modifiedAt": "2026-08-01T00:00:00Z"
            }]
        },
        "fromSeq": 1
    }))
    .expect("automation snapshot")
}

fn automation_run_snapshot() -> Snapshot {
    serde_json::from_value(serde_json::json!({
        "resource": "ahp-automation-run:/r1",
        "state": {
            "resource": "ahp-automation-run:/r1",
            "automation": "ahp-automation:/a1",
            "origin": { "kind": "manual" },
            "lifecycle": {
                "status": "pending",
                "createdAt": "2026-08-05T12:00:00Z"
            },
            "sessions": []
        },
        "fromSeq": 2
    }))
    .expect("automation-run snapshot")
}

fn root_agents_changed_envelope(agents: Vec<AgentInfo>, server_seq: u64) -> ActionEnvelope {
    ActionEnvelope {
        channel: ROOT_RESOURCE_URI.to_string(),
        action: StateAction::RootAgentsChanged(RootAgentsChangedAction { agents }),
        server_seq,
        origin: None,
        rejection_reason: None,
    }
}

#[test]
fn root_states_are_isolated_per_host() {
    let mut mirror = MultiHostStateMirror::new();

    mirror.apply_snapshot(&HostId::new("alpha"), &root_snapshot(vec![agent("a")]));
    mirror.apply_snapshot(&HostId::new("beta"), &root_snapshot(vec![agent("b")]));

    let roots = mirror.root_states();
    assert_eq!(
        roots
            .get(&HostId::new("alpha"))
            .and_then(|r| r.agents.first())
            .map(|a| a.provider.as_str()),
        Some("a")
    );
    assert_eq!(
        roots
            .get(&HostId::new("beta"))
            .and_then(|r| r.agents.first())
            .map(|a| a.provider.as_str()),
        Some("b")
    );
}

#[test]
fn session_uri_collision_across_hosts_does_not_clobber() {
    let mut mirror = MultiHostStateMirror::new();

    mirror.apply_snapshot(
        &HostId::new("alpha"),
        &session_snapshot("A title", "ahp-session:/s1"),
    );
    mirror.apply_snapshot(
        &HostId::new("beta"),
        &session_snapshot("B title", "ahp-session:/s1"),
    );

    let sessions = mirror.sessions();
    assert_eq!(
        sessions
            .get(&HostedResourceKey::new(
                HostId::new("alpha"),
                "ahp-session:/s1"
            ))
            .map(|s| s.title.as_str()),
        Some("A title")
    );
    assert_eq!(
        sessions
            .get(&HostedResourceKey::new(
                HostId::new("beta"),
                "ahp-session:/s1"
            ))
            .map(|s| s.title.as_str()),
        Some("B title")
    );
}

#[test]
fn apply_root_action_updates_only_the_target_host() {
    let mut mirror = MultiHostStateMirror::new();
    mirror.apply_snapshot(&HostId::new("alpha"), &root_snapshot(vec![]));
    mirror.apply_snapshot(&HostId::new("beta"), &root_snapshot(vec![]));

    let envelope = root_agents_changed_envelope(vec![agent("new")], 5);
    mirror.apply_envelope(&HostId::new("alpha"), &envelope);

    let roots = mirror.root_states();
    assert_eq!(
        roots
            .get(&HostId::new("alpha"))
            .and_then(|r| r.agents.first())
            .map(|a| a.provider.as_str()),
        Some("new"),
        "action targeting alpha should mutate alpha's root state"
    );
    assert!(
        roots
            .get(&HostId::new("beta"))
            .map(|r| r.agents.is_empty())
            .unwrap_or(false),
        "action targeting alpha must not touch beta's root state"
    );
}

#[test]
fn apply_session_action_updates_only_the_target_session() {
    let mut mirror = MultiHostStateMirror::new();
    mirror.apply_snapshot(
        &HostId::new("alpha"),
        &session_snapshot("Old", "ahp-session:/s1"),
    );
    mirror.apply_snapshot(
        &HostId::new("beta"),
        &session_snapshot("Old", "ahp-session:/s1"),
    );

    let envelope = ActionEnvelope {
        channel: "ahp-session:/s1".into(),
        action: StateAction::SessionTitleChanged(SessionTitleChangedAction {
            title: "New on alpha".into(),
        }),
        server_seq: 7,
        origin: None,
        rejection_reason: None,
    };
    mirror.apply_envelope(&HostId::new("alpha"), &envelope);

    let sessions = mirror.sessions();
    assert_eq!(
        sessions
            .get(&HostedResourceKey::new(
                HostId::new("alpha"),
                "ahp-session:/s1"
            ))
            .map(|s| s.title.as_str()),
        Some("New on alpha")
    );
    assert_eq!(
        sessions
            .get(&HostedResourceKey::new(
                HostId::new("beta"),
                "ahp-session:/s1"
            ))
            .map(|s| s.title.as_str()),
        Some("Old"),
        "session-scoped action on alpha must not touch beta's identically-named session"
    );
}

#[test]
fn automation_snapshots_and_actions_are_mirrored() {
    let host = HostId::new("alpha");
    let mut mirror = MultiHostStateMirror::new();
    mirror.apply_snapshot(&host, &automation_snapshot());
    mirror.apply_snapshot(&host, &automation_run_snapshot());

    let automation_set = serde_json::from_value(serde_json::json!({
        "type": "automation/set",
        "automation": {
            "resource": "ahp-automation:/a1",
            "definition": {
                "title": "New",
                "message": { "text": "triage", "origin": { "kind": "automation" } },
                "session": {},
                "enabled": false,
                "triggers": []
            },
            "runs": [],
            "operations": ["update", "run"],
            "createdAt": "2026-08-01T00:00:00Z",
            "modifiedAt": "2026-08-05T13:00:00Z"
        }
    }))
    .expect("automation/set action");
    mirror.apply_envelope(
        &host,
        &ActionEnvelope {
            channel: "ahp-automations://".into(),
            action: automation_set,
            server_seq: 3,
            origin: None,
            rejection_reason: None,
        },
    );

    let session_set = serde_json::from_value(serde_json::json!({
        "type": "automationRun/sessionSet",
        "session": "ahp-session:/s1"
    }))
    .expect("sessionSet action");
    mirror.apply_envelope(
        &host,
        &ActionEnvelope {
            channel: "ahp-automation-run:/r1".into(),
            action: session_set,
            server_seq: 4,
            origin: None,
            rejection_reason: None,
        },
    );

    let automation_key = HostedResourceKey::new(host.clone(), "ahp-automation:/a1");
    let run_key = HostedResourceKey::new(host.clone(), "ahp-automation-run:/r1");
    assert_eq!(
        mirror
            .automations()
            .get(&automation_key)
            .map(|state| state.definition.title.as_str()),
        Some("New")
    );
    assert_eq!(
        mirror
            .automation_runs()
            .get(&run_key)
            .map(|state| state.sessions.clone()),
        Some(vec!["ahp-session:/s1".to_string()])
    );

    mirror.reset_host(&host);
    assert!(mirror.automation_catalogs().is_empty());
    assert!(mirror.automations().is_empty());
    assert!(mirror.automation_runs().is_empty());
}

#[test]
fn apply_host_subscription_event_forwards_to_per_host_apply() {
    let mut mirror = MultiHostStateMirror::new();
    mirror.apply_snapshot(&HostId::new("alpha"), &root_snapshot(vec![]));

    let envelope = root_agents_changed_envelope(vec![agent("via-event")], 9);
    let event = HostSubscriptionEvent {
        host_id: HostId::new("alpha"),
        channel: ROOT_RESOURCE_URI.into(),
        event: SubscriptionEvent::Action(envelope),
    };
    mirror.apply_event(&event);

    let roots = mirror.root_states();
    assert_eq!(
        roots
            .get(&HostId::new("alpha"))
            .and_then(|r| r.agents.first())
            .map(|a| a.provider.as_str()),
        Some("via-event")
    );
}

#[test]
fn apply_envelope_for_unknown_channel_is_a_no_op_for_sessions() {
    let mut mirror = MultiHostStateMirror::new();
    // No snapshot for this `(host, uri)` — there's no session to mutate
    // and no changeset reducer to fall back to. The mirror should
    // silently ignore the envelope rather than crash or seed garbage.
    let envelope = ActionEnvelope {
        channel: "ahp-session:/unknown".into(),
        action: StateAction::SessionTitleChanged(SessionTitleChangedAction {
            title: "lost".into(),
        }),
        server_seq: 1,
        origin: None,
        rejection_reason: None,
    };
    mirror.apply_envelope(&HostId::new("alpha"), &envelope);
    assert!(mirror.sessions().is_empty());
}

#[test]
fn apply_envelope_with_no_root_seeds_root_via_action() {
    // The protocol guarantees a root snapshot at initialize time, but
    // exercise the convenience that root actions can still land even if
    // a consumer applies a `RootActiveSessionsChanged` before any
    // snapshot is seeded.
    let mut mirror = MultiHostStateMirror::new();
    let envelope = ActionEnvelope {
        channel: ROOT_RESOURCE_URI.into(),
        action: StateAction::RootActiveSessionsChanged(RootActiveSessionsChangedAction {
            active_sessions: 3,
        }),
        server_seq: 1,
        origin: None,
        rejection_reason: None,
    };
    mirror.apply_envelope(&HostId::new("alpha"), &envelope);
    assert_eq!(
        mirror
            .root_states()
            .get(&HostId::new("alpha"))
            .and_then(|r| r.active_sessions),
        Some(3)
    );
}

#[test]
fn reset_host_drops_only_that_host() {
    let mut mirror = MultiHostStateMirror::new();
    mirror.apply_snapshot(&HostId::new("alpha"), &root_snapshot(vec![]));
    mirror.apply_snapshot(&HostId::new("beta"), &root_snapshot(vec![]));
    mirror.apply_snapshot(
        &HostId::new("alpha"),
        &session_snapshot("a", "ahp-session:/x"),
    );
    mirror.apply_snapshot(
        &HostId::new("beta"),
        &session_snapshot("b", "ahp-session:/x"),
    );

    mirror.reset_host(&HostId::new("alpha"));

    assert!(mirror.root_states().get(&HostId::new("alpha")).is_none());
    assert!(mirror.root_states().get(&HostId::new("beta")).is_some());
    assert!(mirror
        .sessions()
        .get(&HostedResourceKey::new(
            HostId::new("alpha"),
            "ahp-session:/x"
        ))
        .is_none());
    assert!(mirror
        .sessions()
        .get(&HostedResourceKey::new(
            HostId::new("beta"),
            "ahp-session:/x"
        ))
        .is_some());
}

#[test]
fn reset_drops_everything() {
    let mut mirror = MultiHostStateMirror::new();
    mirror.apply_snapshot(&HostId::new("alpha"), &root_snapshot(vec![]));
    mirror.apply_snapshot(
        &HostId::new("alpha"),
        &session_snapshot("a", "ahp-session:/x"),
    );
    mirror.reset();
    assert!(mirror.root_states().is_empty());
    assert!(mirror.sessions().is_empty());
}

#[test]
fn non_action_event_is_ignored() {
    use ahp_types::notifications::SessionAddedParams;

    let mut mirror = MultiHostStateMirror::new();
    mirror.apply_snapshot(&HostId::new("alpha"), &root_snapshot(vec![]));

    // Session-summary notifications don't move reducer-tracked state;
    // ensure `apply_event` ignores them without panicking or touching
    // the existing root mirror.
    let event = HostSubscriptionEvent {
        host_id: HostId::new("alpha"),
        channel: ROOT_RESOURCE_URI.into(),
        event: SubscriptionEvent::SessionAdded(SessionAddedParams {
            channel: ROOT_RESOURCE_URI.into(),
            summary: SessionSummary {
                resource: "ahp-session:/new".into(),
                provider: "copilot".into(),
                title: "new".into(),
                status: SessionStatus::Idle.bits(),
                activity: None,
                origin: None,
                created_at: "1970-01-01T00:00:00.000Z".into(),
                modified_at: "1970-01-01T00:00:00.000Z".into(),
                project: None,
                working_directories: None,
                changes: None,
                annotations: None,
                meta: None,
            },
        }),
    };
    mirror.apply_event(&event);

    let roots = mirror.root_states();
    assert!(roots
        .get(&HostId::new("alpha"))
        .map(|r| r.agents.is_empty())
        .unwrap_or(false));
    assert!(mirror.sessions().is_empty());
}
