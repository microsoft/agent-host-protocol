use ahp_types::{
    actions::StateAction,
    commands::{
        AuthBeginParams, AuthBeginResult, AuthenticateParams, AuthenticateResult,
        BrokeredAuthenticationBinding, InitializeResult,
    },
    state::{AccountConsumer, AuthAttemptState, Snapshot, SnapshotState},
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};

fn roundtrip<T: DeserializeOwned + Serialize>(value: Value) -> T {
    let parsed: T = serde_json::from_value(value.clone()).expect("decode accounts wire type");
    assert_eq!(
        serde_json::to_value(&parsed).expect("encode accounts wire type"),
        value
    );
    parsed
}

#[test]
fn accounts_snapshot_is_distinct_from_root_and_preserves_all_attempt_outcomes() {
    let agent = json!({"kind":"agent","provider":"copilot","resource":"https://api.example.test"});
    let mcp = json!({"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"});
    roundtrip::<AccountConsumer>(agent.clone());
    roundtrip::<AccountConsumer>(mcp.clone());
    let attempts = [
        json!({"id":"pending","status":"pending","consumer":agent,"resource":"https://api.example.test"}),
        json!({"id":"done","status":"completed","consumer":mcp,"resource":"https://mcp.example.test","accountId":"account-1"}),
        json!({"id":"failed","status":"failed","consumer":mcp,"resource":"https://mcp.example.test","error":{"errorType":"Denied","message":"Not allowed"}}),
    ];
    for attempt in &attempts {
        roundtrip::<AuthAttemptState>(attempt.clone());
    }
    let snapshot = roundtrip::<Snapshot>(json!({
        "resource":"ahp-accounts://","fromSeq":5,
        "state":{
            "accounts":[{"id":"account-1","label":"Example","removable":false,"consumers":[agent,mcp]}],
            "attempts":attempts
        }
    }));
    assert!(matches!(snapshot.state, SnapshotState::Accounts(_)));
}

#[test]
fn accounts_commands_preserve_capability_target_and_both_credential_bindings() {
    let init = roundtrip::<InitializeResult>(json!({
        "protocolVersion":"0.9.0","serverSeq":0,"snapshots":[],
        "authentication":{"flows":[{"kind":"clientBrokered"}]}
    }));
    assert!(init.authentication.is_some());
    roundtrip::<AuthBeginParams>(json!({
        "channel":"ahp-accounts://",
        "target":{"consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"}},
        "flows":[{"kind":"clientBrokered"}],"accountId":"account-1",
        "_meta":{"example.trace":"begin"}
    }));
    roundtrip::<AuthBeginResult>(json!({"flow":"clientBrokered","attemptId":"attempt-1"}));
    for binding in [
        json!({"kind":"attempt","attemptId":"attempt-1"}),
        json!({"kind":"account","accountId":"account-1"}),
    ] {
        roundtrip::<BrokeredAuthenticationBinding>(binding.clone());
        roundtrip::<AuthenticateParams>(json!({
            "channel":"ahp-root://","resource":"https://api.example.test",
            "token":"example-test-credential","expiresIn":120,"scopes":["read"],"binding":binding
        }));
    }
    roundtrip::<AuthenticateResult>(json!({"accountId":"account-1"}));
    roundtrip::<AuthenticateResult>(json!({}));
}

#[test]
fn key_only_removals_and_forward_compatible_outcomes_roundtrip_without_becoming_success() {
    roundtrip::<StateAction>(json!({"type":"accounts/removed","id":"account-1"}));
    roundtrip::<StateAction>(json!({"type":"accounts/authAttemptRemoved","id":"attempt-1"}));
    let future = roundtrip::<AuthAttemptState>(json!({
        "status":"waitingForHost","id":"attempt-1","resource":"https://api.example.test",
        "consumer":{"kind":"futureConsumer","resourceId":"consumer-1"}
    }));
    assert!(matches!(future, AuthAttemptState::Unknown(_)));
    assert!(
        serde_json::from_value::<BrokeredAuthenticationBinding>(json!({
            "kind":"futureBinding","accountId":"account-1"
        }))
        .is_err()
    );
}
