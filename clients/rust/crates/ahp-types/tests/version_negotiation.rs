use ahp_types::negotiate_protocol_version;
use serde::Deserialize;

#[derive(Deserialize)]
struct Case {
    offered: Vec<String>,
    expected: Option<String>,
    #[serde(default)]
    invalid: bool,
}

#[test]
fn shared_negotiation_corpus() -> Result<(), Box<dyn std::error::Error>> {
    let cases: Vec<Case> = serde_json::from_str(include_str!(
        "../../../../../types/test-cases/version-negotiation.json"
    ))?;
    for case in cases {
        let result = negotiate_protocol_version(&case.offered);
        if case.invalid {
            assert!(result.is_err(), "{:?}", case.offered);
        } else {
            assert_eq!(
                result?.map(str::to_owned),
                case.expected,
                "{:?}",
                case.offered
            );
        }
    }
    Ok(())
}
