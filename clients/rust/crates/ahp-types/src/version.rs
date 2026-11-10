// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:rust

#![allow(missing_docs)]

/// Current protocol version (SemVer `MAJOR.MINOR.PATCH`).
pub const PROTOCOL_VERSION: &str = "1.1.0";

/// Every protocol version this crate is willing to negotiate, ordered
/// most-preferred-first, independently of the development [`PROTOCOL_VERSION`].
///
/// Consumers building `InitializeParams` should pass this slice (or a
/// derived `Vec<String>`) so the same client binary can fall back to
/// older protocol versions if the host doesn't accept the newest one.
pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["1.0.0", "0.9.0"];

/// Select the highest offered version in a supported caret range.
/// None means the host must send UnsupportedProtocolVersion and close.
pub fn negotiate_protocol_version(offered: &[String]) -> Result<Option<&str>, String> {
    fn parse(version: &str) -> Result<(u64, u64, u64), String> {
        let invalid = || format!("Invalid protocol version: {version}");
        let parts: Vec<&str> = version.split('.').collect();
        if parts.len() != 3 {
            return Err(invalid());
        }
        let mut values = [0; 3];
        for (index, part) in parts.iter().enumerate() {
            if part.is_empty()
                || (part.len() > 1 && part.starts_with('0'))
                || !part.bytes().all(|byte| byte.is_ascii_digit())
            {
                return Err(invalid());
            }
            values[index] = part.parse::<u64>().map_err(|_| invalid())?;
        }
        Ok((values[0], values[1], values[2]))
    }
    let baselines = SUPPORTED_PROTOCOL_VERSIONS
        .iter()
        .map(|version| parse(version))
        .collect::<Result<Vec<_>, _>>()?;
    let mut selected: Option<(&str, (u64, u64, u64))> = None;
    for version in offered {
        let parts = parse(version)?;
        if baselines.iter().any(|base| {
            parts.0 == base.0
                && (parts.0 > 0 || parts.1 == base.1)
                && (parts.0 > 0 || parts.1 > 0 || parts.2 == base.2)
                && parts >= *base
        }) && selected
            .as_ref()
            .map_or(true, |(_, previous)| parts > *previous)
        {
            selected = Some((version.as_str(), parts));
        }
    }
    Ok(selected.map(|(version, _)| version))
}
