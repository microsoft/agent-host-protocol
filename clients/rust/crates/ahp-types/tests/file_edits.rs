use ahp_types::state::{ContentRef, FileEdit, FileEditCollection, FileEditDiffStats, FileEditSide};
use serde_json::json;

#[test]
fn typed_file_edits_round_trip() -> Result<(), serde_json::Error> {
    let side = FileEditSide {
        uri: "file:///workspace/file.txt".into(),
        content: ContentRef {
            uri: "ahp-content:/file".into(),
            size_hint: Some(32),
            content_type: Some("text/plain".into()),
            nonce: Some("v1".into()),
        },
    };
    let original = FileEditCollection {
        items: vec![FileEdit {
            before: Some(side.clone()),
            after: Some(side),
            diff: Some(FileEditDiffStats {
                added: Some(2_147_483_648),
                removed: Some(0),
            }),
        }],
    };
    let encoded = serde_json::to_value(&original)?;
    let decoded: FileEditCollection = serde_json::from_value(encoded)?;
    assert_eq!(decoded, original);
    let after: Option<&FileEditSide> = decoded.items[0].after.as_ref();
    assert_eq!(
        after.map(|side| side.content.uri.as_str()),
        Some("ahp-content:/file")
    );
    let added: Option<i64> = decoded.items[0].diff.as_ref().and_then(|stats| stats.added);
    assert_eq!(added, Some(2_147_483_648));
    Ok(())
}

#[test]
fn empty_collection_preserves_items() -> Result<(), serde_json::Error> {
    let empty = FileEditCollection { items: vec![] };
    assert_eq!(serde_json::to_value(empty)?, json!({"items": []}));
    Ok(())
}
