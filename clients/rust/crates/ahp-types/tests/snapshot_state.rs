use ahp_types::state::{Snapshot, SnapshotState};
use serde_json::json;

#[test]
fn malformed_known_channel_state_fails_to_decode() {
    let raw = json!({
        "resource": "ahp-session:/s1",
        "state": {"lifecycle": "ready"},
        "fromSeq": 1,
    });
    assert!(serde_json::from_value::<Snapshot>(raw).is_err());
}

#[test]
fn unknown_and_standalone_states_round_trip() {
    for state in [
        json!({"content": [], "lifecycle": "ready", "entries": null}),
        json!({}),
        json!(null),
        json!([]),
        json!(42),
        json!("state"),
    ] {
        let raw = json!({"resource": "x-ext:/a", "state": state, "fromSeq": 1});
        let snapshot: Snapshot = serde_json::from_value(raw.clone()).expect("decode snapshot");
        assert!(matches!(&snapshot.state, SnapshotState::Unknown(_)));
        assert_eq!(
            serde_json::to_value(snapshot).expect("encode snapshot"),
            raw
        );

        let standalone: SnapshotState =
            serde_json::from_value(state.clone()).expect("decode standalone state");
        assert!(matches!(&standalone, SnapshotState::Unknown(_)));
        assert_eq!(
            serde_json::to_value(standalone).expect("encode state"),
            state
        );
    }
}

#[test]
fn terminal_channel_decodes_as_terminal() {
    let raw = json!({
        "resource": "ahp-terminal:/t1",
        "state": {
            "title": "Shell",
            "content": [],
            "lifecycle": {"status": "running"},
            "claim": {"kind": "client", "clientId": "c1"},
        },
        "fromSeq": 1,
    });
    let snapshot: Snapshot = serde_json::from_value(raw).expect("decode terminal snapshot");
    assert!(matches!(snapshot.state, SnapshotState::Terminal(_)));
}

#[test]
fn annotations_channel_decodes_as_annotations() {
    let raw = json!({
        "resource": "ahp-annotations:/s1",
        "state": {"annotations": []},
        "fromSeq": 1,
    });
    let snapshot: Snapshot = serde_json::from_value(raw).expect("decode annotations snapshot");
    assert!(matches!(snapshot.state, SnapshotState::Annotations(_)));
}
