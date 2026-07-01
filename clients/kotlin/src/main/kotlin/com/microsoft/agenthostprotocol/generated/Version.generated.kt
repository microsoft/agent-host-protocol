// Generated from types/*.ts — do not edit

package com.microsoft.agenthostprotocol.generated

/**
 * Current protocol version (SemVer `MAJOR.MINOR.PATCH`).
 */
public const val PROTOCOL_VERSION: String = "0.5.1"

/**
 * Every protocol version this library is willing to negotiate, ordered
 * most-preferred-first. The first entry equals [PROTOCOL_VERSION].
 *
 * Pass this list (or a derived `List<String>`) as `protocolVersions` on
 * `InitializeParams` so the same client binary can fall back to older
 * protocol versions if the host doesn't accept the newest one.
 */
public val SUPPORTED_PROTOCOL_VERSIONS: List<String> = listOf(
    "0.5.1",
    "0.5.0",
)
