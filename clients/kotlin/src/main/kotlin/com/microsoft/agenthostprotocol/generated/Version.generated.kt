// Generated from types/*.ts — do not edit

package com.microsoft.agenthostprotocol.generated

/**
 * Current protocol version (SemVer `MAJOR.MINOR.PATCH`).
 */
public const val PROTOCOL_VERSION: String = "1.1.0"

/**
 * Every protocol version this library is willing to negotiate, ordered
 * most-preferred-first, independently of the development [PROTOCOL_VERSION].
 *
 * Pass this list (or a derived `List<String>`) as `protocolVersions` on
 * `InitializeParams` so the same client binary can fall back to older
 * protocol versions if the host doesn't accept the newest one.
 */
public val SUPPORTED_PROTOCOL_VERSIONS: List<String> = listOf(
    "1.0.0",
    "0.9.0",
)

/** Select the highest offered version in a supported caret range.
 * Null means the host must send UnsupportedProtocolVersion and close.
 * Malformed versions throw IllegalArgumentException.
 */
public fun negotiateProtocolVersion(offered: List<String>): String? {
    fun parse(version: String): List<Long> {
        require(Regex("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)").matches(version)) {
            "Invalid protocol version: $version"
        }
        return version.split('.').map {
            val value = it.toLongOrNull()
            require(value != null) { "Invalid protocol version: $version" }
            value
        }
    }
    fun compare(a: List<Long>, b: List<Long>): Int {
        for (i in 0..2) {
            val comparison = a[i].compareTo(b[i])
            if (comparison != 0) return comparison
        }
        return 0
    }
    val baselines = SUPPORTED_PROTOCOL_VERSIONS.map(::parse)
    var selected: String? = null
    var previous: List<Long>? = null
    for (version in offered) {
        val parts = parse(version)
        if (baselines.any { base ->
            parts[0] == base[0] && (parts[0] > 0 || parts[1] == base[1]) &&
                (parts[0] > 0 || parts[1] > 0 || parts[2] == base[2]) && compare(parts, base) >= 0
        } && (previous == null || compare(parts, previous) > 0)) {
            selected = version
            previous = parts
        }
    }
    return selected
}
