// Generated from types/*.ts — do not edit.
//
// Regenerate with: npm run generate:rust

#![allow(missing_docs)]

/// Current protocol version (SemVer `MAJOR.MINOR.PATCH`).
pub const PROTOCOL_VERSION: &str = "0.5.2";

/// Every protocol version this crate is willing to negotiate, ordered
/// most-preferred-first. The first entry equals [`PROTOCOL_VERSION`].
///
/// Consumers building `InitializeParams` should pass this slice (or a
/// derived `Vec<String>`) so the same client binary can fall back to
/// older protocol versions if the host doesn't accept the newest one.
pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["0.5.2", "0.5.1"];
