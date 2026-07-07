// roundtrip_corpus.rs — data-driven wire round-trip parity for the Rust client.
//
// Loads the SHARED, language-agnostic round-trip corpus under
// types/test-cases/round-trips/*.json (the same fixtures the Go, Swift,
// TypeScript, and Kotlin clients run) and asserts each via the REAL generated
// Rust wire types — serde + serde_json, the real discriminated-union
// serde(tag) dispatch, the real SessionStatus bitset.
// No mocks, no faked SUT: every fixture decodes real bytes into a real type and
// re-encodes with serde_json.
//
// Each fixture has the shape:
//   { "name": ..., "description": ..., "group": ..., "type": ...,
//     "input": <wire JSON value>,
//     "acceptableOutputs": [ <exactly one canonical re-encoded value> ],
//     "preservedOutput": <TypeScript-preserved form (group B only, unused here)> }
//
// Group A: all clients agree — assert acceptableOutputs[0].
// Group B: runtime-decoder clients drop unknown keys — assert acceptableOutputs[0].
//          (TypeScript asserts preservedOutput instead; irrelevant to Rust.)
// Rust is always a runtime decoder → always asserts acceptableOutputs[0].
//
// Run: cargo test roundtrip (from clients/rust)
//
// Real-execution: no mocks. Every fixture decodes with serde_json into the real
// generated types and re-encodes with serde_json::to_string.

use ahp_types::{
    actions::{ActionEnvelope, StateAction},
    commands::{ChangesetOperationTarget, Implementation},
    common::StringOrMarkdown,
    messages::JsonRpcMessage,
    notifications::{PartialSessionSummary, SessionAddedParams},
    state::{ChatInputQuestion, Customization, SessionStatus, SessionSummary},
    version::{PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS},
};
use serde_json::{Number, Value};
use std::{collections::BTreeMap, fs, path::PathBuf};

// ─── Fixture directory ───────────────────────────────────────────────────────

/// Walks upward from the test binary directory looking for `types/test-cases/round-trips`.
fn find_fixture_dir() -> PathBuf {
    // Under `cargo test`, the binary typically lives under
    // clients/rust/target/debug/deps/ — walk up to find repo root.
    let mut dir =
        std::env::current_dir().expect("current_dir should be accessible under cargo test");
    loop {
        let candidate = dir.join("types").join("test-cases").join("round-trips");
        if candidate.is_dir() {
            return candidate;
        }
        let parent = dir.parent().expect("walked all the way to filesystem root without finding types/test-cases/round-trips").to_path_buf();
        dir = parent;
    }
}

// ─── Fixture shape ───────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct RoundTripFixture {
    #[allow(dead_code)]
    name: Option<String>,
    #[allow(dead_code)]
    description: Option<String>,
    /// "A" = all clients agree; "B" = runtime-decoders drop unknown keys,
    /// TS preserves them. Absent is treated as "A".
    #[allow(dead_code)]
    group: Option<String>,
    #[serde(rename = "type")]
    type_name: String,
    input: Value,
    #[serde(rename = "acceptableOutputs")]
    acceptable_outputs: Vec<Value>,
    /// Unknown-keys-preserved expected output for group B (unused by Rust).
    #[serde(rename = "preservedOutput")]
    #[allow(dead_code)]
    preserved_output: Option<Value>,
    /// Legacy skip list. Rust never appears here; parsed for completeness.
    #[serde(rename = "notApplicable")]
    not_applicable: Option<Vec<String>>,
}

// ─── Main test ───────────────────────────────────────────────────────────────

#[test]
fn roundtrip_corpus() {
    let fixture_dir = find_fixture_dir();
    let mut entries: Vec<_> = fs::read_dir(&fixture_dir)
        .unwrap_or_else(|e| panic!("cannot read fixture dir {:?}: {}", fixture_dir, e))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().ends_with(".json"))
        .map(|e| e.path())
        .collect();
    entries.sort();

    assert!(
        !entries.is_empty(),
        "No round-trip fixtures found at {:?}. Ensure the checkout includes types/test-cases/round-trips/.",
        fixture_dir
    );

    let mut failures: Vec<String> = Vec::new();
    let mut ran_real = 0usize;

    for path in &entries {
        let file = path.file_name().unwrap().to_string_lossy().into_owned();
        let raw = fs::read_to_string(path).unwrap_or_else(|e| panic!("read {:?}: {}", path, e));

        match run_fixture(&file, &raw) {
            Ok(()) => ran_real += 1,
            Err(msg) => failures.push(format!("✗ {}: {}", file, msg)),
        }
    }

    assert!(
        ran_real > 0,
        "No fixtures ran real assertions — check fixture dir {:?}",
        fixture_dir
    );

    if !failures.is_empty() {
        panic!(
            "{} round-trip fixture(s) failed:\n{}",
            failures.len(),
            failures.join("\n")
        );
    }

    println!(
        "round-trip corpus: {} fixtures, {} asserted for real",
        entries.len(),
        ran_real
    );
}

// ─── Per-fixture runner ───────────────────────────────────────────────────────

fn run_fixture(file: &str, raw: &str) -> Result<(), String> {
    let fx: RoundTripFixture =
        serde_json::from_str(raw).map_err(|e| format!("parse fixture: {}", e))?;

    if fx.type_name.is_empty() {
        return Err("missing `type`".into());
    }
    if fx.input.is_null() && !matches!(&fx.input, Value::Null) {
        return Err(format!("{}: missing `input`", file));
    }
    if fx.acceptable_outputs.is_empty() {
        return Err(format!(
            "{}: fixture made no assertions — `acceptableOutputs` is empty",
            file
        ));
    }
    // Enforce single canonical form.
    if fx.acceptable_outputs.len() != 1 {
        return Err(format!(
            "{}: acceptableOutputs must have exactly 1 entry (the single canonical re-encoded form); got {}. \
             Multiple entries cement divergence instead of fixing it.",
            file, fx.acceptable_outputs.len()
        ));
    }

    // Honor notApplicable (legacy). Rust is never listed there, but parse defensively.
    if let Some(not_applicable) = &fx.not_applicable {
        if not_applicable.iter().any(|s| s == "rust") {
            eprintln!("⊘ {}: not applicable to rust (legacy notApplicable)", file);
            return Ok(());
        }
    }

    // Rust is a runtime decoder → always asserts acceptableOutputs[0] (both groups).
    let input_json =
        serde_json::to_string(&fx.input).map_err(|e| format!("re-serialize input: {}", e))?;

    let reencoded = decode_and_reencode(file, &fx.type_name, &input_json)?;
    let canonical_expected = &fx.acceptable_outputs[0];

    if canonical_equal(&reencoded, canonical_expected) {
        Ok(())
    } else {
        Err(format!(
            "{}: re-encoded output does not match the canonical acceptableOutput.\n  got:      {}\n  expected: {}",
            file,
            serde_json::to_string(&reencoded).unwrap_or_else(|_| "<error>".into()),
            serde_json::to_string(canonical_expected).unwrap_or_else(|_| "<error>".into()),
        ))
    }
}

// ─── Real decode dispatch ────────────────────────────────────────────────────

/// Decodes `input_json` into the real generated Rust type named by `type_name`
/// and re-encodes with serde_json. Adding a wire type to the corpus requires a
/// deliberate edit here — the corpus never decodes arbitrary types reflectively.
fn decode_and_reencode(file: &str, type_name: &str, input_json: &str) -> Result<Value, String> {
    macro_rules! round_trip {
        ($T:ty) => {{
            let v: $T = serde_json::from_str(input_json)
                .map_err(|e| format!("{}: decode {}: {}", file, type_name, e))?;
            serde_json::to_value(&v)
                .map_err(|e| format!("{}: re-encode {}: {}", file, type_name, e))
        }};
    }

    match type_name {
        "ActionEnvelope" => round_trip!(ActionEnvelope),
        "StateAction" => round_trip!(StateAction),
        "Customization" => round_trip!(Customization),
        // SessionStatus decodes via the REAL generated type — no raw-u32 sidestep.
        // On the old `enum SessionStatus` this FAILS for bitset combinations and
        // unknown high bits (fixtures 004/005); it passes only once the type is
        // the `u32` newtype from the SessionStatus-widening change. That red→green
        // is the proof the corpus actually exercises the real wire type.
        "SessionStatus" => round_trip!(SessionStatus),
        "StringOrMarkdown" => round_trip!(StringOrMarkdown),
        "JsonRpcMessage" => round_trip!(JsonRpcMessage),
        "ChangesetOperationTarget" => round_trip!(ChangesetOperationTarget),
        "ChatInputQuestion" => round_trip!(ChatInputQuestion),
        "SessionSummary" => round_trip!(SessionSummary),
        "SessionAddedParams" => round_trip!(SessionAddedParams),
        "PartialSessionSummary" => round_trip!(PartialSessionSummary),
        "Implementation" => round_trip!(Implementation),
        other => Err(format!(
            "{}: unknown wire type {:?}. Add a decode entry to decode_and_reencode.",
            file, other
        )),
    }
}

// ─── Structural JSON equality ────────────────────────────────────────────────

/// Compares two serde_json::Value instances structurally (key-order independent,
/// value- and key-presence sensitive). Uses a canonicalized form: numbers are
/// normalized (integer vs float with same value compare equal), objects are
/// compared as BTreeMap (sorted keys).
fn canonical_equal(a: &Value, b: &Value) -> bool {
    canonical_bytes(a) == canonical_bytes(b)
}

fn canonical_bytes(v: &Value) -> Vec<u8> {
    serde_json::to_vec(&normalize(v)).expect("re-serialize for comparison")
}

/// Normalize a Value for structural comparison:
/// - Object keys are sorted (BTreeMap order via serde_json::Map → BTreeMap).
/// - Numbers: integers and whole-number floats compare equal (10 == 10.0).
///   This handles the Rust f64 serialization case where `@format float` fields
///   like SessionInputNumberQuestion.min serialize 10 as 10.0.
fn normalize(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let sorted: BTreeMap<_, _> = map
                .iter()
                .map(|(k, val)| (k.clone(), normalize(val)))
                .collect();
            Value::Object(sorted.into_iter().collect())
        }
        Value::Array(arr) => Value::Array(arr.iter().map(normalize).collect()),
        Value::Number(n) => {
            // Normalize: if the number is representable as an exact i64, use that form.
            // This handles both integer JSON numbers (e.g. 10) and whole-number floats
            // (e.g. f64 10.0 serialized as JSON 10.0 by Rust serde_json).
            if let Some(i) = n.as_i64() {
                Value::Number(Number::from(i))
            } else if let Some(f) = n.as_f64() {
                // Also check: is the float exactly representable as an integer?
                if f.fract() == 0.0 && f.abs() < 9.007_199_254_740_992e15_f64 {
                    if let Ok(i) = i64::try_from(f as i128) {
                        return Value::Number(Number::from(i));
                    }
                }
                Value::Number(Number::from_f64(f).unwrap_or(n.clone()))
            } else {
                Value::Number(n.clone())
            }
        }
        other => other.clone(),
    }
}

// ─── ProtocolVersion constants ───────────────────────────────────────────────

#[test]
fn protocol_version_constants() {
    assert!(
        !PROTOCOL_VERSION.trim().is_empty(),
        "PROTOCOL_VERSION must be non-empty, got {:?}",
        PROTOCOL_VERSION
    );
    let supported = SUPPORTED_PROTOCOL_VERSIONS;
    assert!(
        !supported.is_empty(),
        "SUPPORTED_PROTOCOL_VERSIONS must be non-empty"
    );
    assert_eq!(
        supported[0], PROTOCOL_VERSION,
        "first SUPPORTED_PROTOCOL_VERSIONS entry {:?} must equal PROTOCOL_VERSION {:?}",
        supported[0], PROTOCOL_VERSION
    );
}
