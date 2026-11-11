use ahp_types::state::SnapshotState;
use serde_json::json;

#[test]
fn malformed_known_states_fail_to_decode() {
    for raw in [
        r#"{"lifecycle":"ready","agents":[]}"#,
        r#"{"turns":[]}"#,
        r#"{"content":[]}"#,
        r#"{"automation":"ahp-automation:/a1","origin":{"kind":"manual"},"sessions":[]}"#,
        r#"{"entries":null}"#,
        r#"{"agents":null}"#,
        r#"{"annotations":null}"#,
        r#"{"instanceId":"i1","extensionId":"provider","canvasId":42}"#,
        r#"{"status":null,"files":[]}"#,
        r#"{"root":"file:///workspace","recursive":null}"#,
    ] {
        assert!(
            serde_json::from_str::<SnapshotState>(raw).is_err(),
            "malformed known state must not fall back to another variant: {raw}"
        );
    }
}

#[test]
fn unknown_state_round_trips() {
    let raw = json!({"futureField": {"items": [1, true, "value"]}});
    let state: SnapshotState = serde_json::from_value(raw.clone()).expect("decode unknown state");
    assert!(matches!(&state, SnapshotState::Unknown(_)));
    assert_eq!(
        serde_json::to_value(state).expect("encode unknown state"),
        raw
    );
}

#[test]
fn empty_object_decodes_as_empty() {
    let state: SnapshotState = serde_json::from_str("{}").expect("decode empty state");
    assert!(matches!(&state, SnapshotState::Empty(_)));
    assert_eq!(
        serde_json::to_value(state).expect("encode empty state"),
        json!({})
    );
}

#[test]
fn non_object_states_fail_to_decode() {
    for raw in ["null", "[]", "42", r#""state""#] {
        assert!(
            serde_json::from_str::<SnapshotState>(raw).is_err(),
            "snapshot state must be an object: {raw}"
        );
    }
}
