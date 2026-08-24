// narrowed_union_wire.rs — regression test for the union-payload narrowing.
//
// `ToolCallAuthRequiredState.contributor` narrows the `ToolCallContributor`
// tagged union to its `ToolCallMcpContributor` payload. In Rust the union
// discriminant (`#[serde(tag = "kind")]`) lives on the enum, not the payload
// struct — `ToolCallMcpContributor` has no `kind` field — so serializing the
// bare payload would drop `"kind":"mcp"` from the wire. The generator emits a
// serde-`with` module that injects it. This test pins that the type stays
// narrowed AND the wire stays tagged, deserialize→serialize.

use ahp_types::state::ToolCallAuthRequiredState;

/// A wire-shaped `auth-required` tool call: `contributor` carries the union tag
/// `"kind":"mcp"`, as an MCP server would send it.
fn wire() -> serde_json::Value {
    serde_json::json!({
        "status": "auth-required",
        "toolCallId": "tc1",
        "toolName": "search",
        "displayName": "Search",
        "invocationMessage": "Search: foo",
        "toolInput": "foo",
        "confirmed": "not-needed",
        "contributor": { "kind": "mcp", "customizationId": "mcp-1" },
        "auth": {
            "reason": "required",
            "resource": {
                "resource": "https://mcp.example.com",
                "authorization_servers": ["https://auth.example.com"]
            }
        }
    })
}

#[test]
fn narrowed_contributor_deserializes_dropping_the_tag() {
    let s: ToolCallAuthRequiredState = serde_json::from_value(wire()).unwrap();
    // The tag is consumed; the field is the narrowed payload type.
    assert_eq!(s.contributor.customization_id, "mcp-1");
}

#[test]
fn narrowed_contributor_reserializes_with_the_tag() {
    let s: ToolCallAuthRequiredState = serde_json::from_value(wire()).unwrap();
    let out = serde_json::to_value(&s).unwrap();
    let c = &out["contributor"];
    // The narrowed payload still emits the union discriminant on the wire.
    assert_eq!(c["kind"], "mcp", "wire dropped the union tag: {c}");
    assert_eq!(c["customizationId"], "mcp-1");
}

/// A field narrowed to one variant's payload must REJECT a foreign discriminant rather
/// than decode it and silently re-emit it as its own.
///
/// Without the check in the generated `deserialize`, `kind: "client"` decodes fine (the
/// payload struct does not `deny_unknown_fields`) and then re-serializes as `kind: "mcp"`
/// -- so this change would fix tag LOSS and introduce tag REWRITING, which is worse. The
/// repo already rejects a mismatched discriminant this way in `deserialize_running_tool_call`.
#[test]
fn narrowed_contributor_rejects_a_foreign_tag() {
    let mut w = wire();
    w["contributor"]["kind"] = serde_json::json!("client");

    let decoded: Result<ToolCallAuthRequiredState, _> = serde_json::from_value(w);
    assert!(
        decoded.is_err(),
        "a foreign contributor tag must be rejected, not decoded and silently re-tagged as mcp"
    );
}

/// An absent tag is still accepted: the payload struct is the narrowed type either way,
/// and a peer that omits the redundant discriminant is not sending something wrong.
#[test]
fn narrowed_contributor_accepts_an_absent_tag() {
    let mut w = wire();
    w["contributor"] = serde_json::json!({ "customizationId": "mcp-1" });

    let s: ToolCallAuthRequiredState = serde_json::from_value(w).expect("absent tag is fine");
    assert_eq!(s.contributor.customization_id, "mcp-1");
    // ...and it is re-emitted WITH the tag, which is the whole point of the with-module.
    let out = serde_json::to_value(&s).unwrap();
    assert_eq!(out["contributor"]["kind"], "mcp");
}
