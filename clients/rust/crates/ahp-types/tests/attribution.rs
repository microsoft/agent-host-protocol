// Copyright (c) Microsoft Corporation. All rights reserved.

#![allow(clippy::panic)]

use ahp_types::{
    actions::{ActionEnvelope, StateAction},
    state::{AttributionSourceLocation, ResponsePart},
};

#[test]
fn attribution_and_source_locations_decode_as_known_variants() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../types/test-cases/round-trips/045-response-attribution-action.json"
    ))
    .expect("read attribution fixture");
    let envelope: ActionEnvelope =
        serde_json::from_value(fixture["input"].clone()).expect("decode attribution action");
    let StateAction::ChatResponsePart(action) = &envelope.action else {
        panic!("expected response-part action, got {:?}", envelope.action);
    };
    let ResponsePart::Attribution(part) = &action.part else {
        panic!("expected typed attribution, got {:?}", action.part);
    };
    assert_eq!(part.target_part_id, "answer-1");
    assert_eq!(part.spans[1].source_ids, ["file", "document"]);
    assert!(matches!(
        &part.sources[0].location,
        Some(AttributionSourceLocation::Text(location)) if location.range.start.line == 2
    ));
    assert!(matches!(
        &part.sources[1].location,
        Some(AttributionSourceLocation::Page(location))
            if location.start_page == 4 && location.end_page == 5
    ));
    assert_eq!(
        serde_json::to_value(envelope).expect("encode attribution action"),
        fixture["acceptableOutputs"][0]
    );
}
