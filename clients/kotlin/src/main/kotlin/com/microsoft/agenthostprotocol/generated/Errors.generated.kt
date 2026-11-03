// Generated from types/*.ts — do not edit

package com.microsoft.agenthostprotocol.generated

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.contentOrNull

// ─── Standard JSON-RPC Error Codes ──────────────────────────────────────────

object JsonRpcErrorCodes {
    /** Invalid JSON */
    const val PARSE_ERROR: Int = -32700
    /** Not a valid JSON-RPC request */
    const val INVALID_REQUEST: Int = -32600
    /** Unknown method name */
    const val METHOD_NOT_FOUND: Int = -32601
    /** Invalid method parameters */
    const val INVALID_PARAMS: Int = -32602
    /** Unspecified server error */
    const val INTERNAL_ERROR: Int = -32603
}

// ─── AHP Application Error Codes ────────────────────────────────────────────

object AhpErrorCodes {
    /** The referenced session URI does not exist */
    const val SESSION_NOT_FOUND: Int = -32001
    /** The requested agent provider is not registered */
    const val PROVIDER_NOT_FOUND: Int = -32002
    /** A session with the given URI already exists */
    const val SESSION_ALREADY_EXISTS: Int = -32003
    /** The operation requires no active turn, but one is in progress */
    const val TURN_IN_PROGRESS: Int = -32004
    /** The server cannot speak any of the protocol versions offered by the client */
    const val UNSUPPORTED_PROTOCOL_VERSION: Int = -32005
    // -32006 is intentionally reserved and unassigned.
    /** Authentication required for a protected resource */
    const val AUTH_REQUIRED: Int = -32007
    /** The requested file, folder, or URI does not exist */
    const val NOT_FOUND: Int = -32008
    /** The client is not permitted to access the requested resource */
    const val PERMISSION_DENIED: Int = -32009
    /** The target resource already exists and the operation does not allow overwriting */
    const val ALREADY_EXISTS: Int = -32010
    /** A negotiated resource read failed; data is ResourceReadFailedErrorData */
    const val RESOURCE_READ_FAILED: Int = -32013
}

// ─── Error Detail Payloads ──────────────────────────────────────────────────

/**
 * Failure kinds for the negotiated Resource Reads contract.
 *
 * Unknown future kinds MUST be treated as a failed read, not as success or
 * permission to retry automatically.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable(with = ResourceReadFailureKindSerializer::class)
@JvmInline
value class ResourceReadFailureKind(val rawValue: String) {
    companion object {
        /**
         * The receiver does not serve this URI scheme at all. Omission from the
         * negotiated scheme list is not sufficient: unlisted legacy reads remain valid.
         */
        val UNSUPPORTED_SCHEME: ResourceReadFailureKind = ResourceReadFailureKind("unsupportedScheme")
        /**
         * The body or encoded response exceeds the receiver's size limit.
         */
        val TOO_LARGE: ResourceReadFailureKind = ResourceReadFailureKind("tooLarge")
        /**
         * The read exceeded its deadline.
         */
        val TIMEOUT: ResourceReadFailureKind = ResourceReadFailureKind("timeout")
        /**
         * The receiver cannot admit the read within its bounded capacity.
         */
        val BUSY: ResourceReadFailureKind = ResourceReadFailureKind("busy")
        /**
         * The backing source failed, including an unusable redirect or response.
         */
        val UPSTREAM: ResourceReadFailureKind = ResourceReadFailureKind("upstream")
    }
}

internal object ResourceReadFailureKindSerializer : KSerializer<ResourceReadFailureKind> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ResourceReadFailureKind", PrimitiveKind.STRING)
    override fun serialize(encoder: Encoder, value: ResourceReadFailureKind) {
        encoder.encodeString(value.rawValue)
    }
    override fun deserialize(decoder: Decoder): ResourceReadFailureKind =
        ResourceReadFailureKind(decoder.decodeString())
}

/**
 * Required `data` for a `ResourceReadFailed` (-32013) error.
 *
 * The payload MUST NOT contain backing URLs, credentials, response headers,
 * or raw upstream diagnostics. Existing `AuthRequired`, `PermissionDenied`,
 * `NotFound`, and `InvalidParams` errors retain their meanings.
 *
 * Stability: 1.0 - Early development.
 */
@Serializable
data class ResourceReadFailedErrorData(
    /**
     * Machine-readable reason the read failed.
     */
    val kind: ResourceReadFailureKind
)

@Serializable
data class AuthRequiredErrorData(
    /**
     * Protected resources that require authentication.
     */
    val resources: List<ProtectedResourceMetadata>
)

@Serializable
data class PermissionDeniedErrorData(
    /**
     * The resource access that, if granted via `resourceRequest`, would unlock
     * the operation. Omitted when no specific access grant would resolve the
     * denial (for example, when the resource is fundamentally inaccessible).
     */
    val request: ResourceRequestParams? = null
)

@Serializable
data class UnsupportedProtocolVersionErrorData(
    /**
     * Protocol versions the server is willing to speak.
     *
     * Each entry is either a [SemVer](https://semver.org) `MAJOR.MINOR.PATCH`
     * string (e.g. `"0.1.0"`) or a [SemVer range](https://semver.org/#spec-item-11)
     * constraint (e.g. `">=0.1.0 <0.3.0"` or `"^0.2.0"`).
     */
    val supportedVersions: List<String>
)
