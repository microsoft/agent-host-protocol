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
    /** The requested content URI does not exist */
    const val CONTENT_NOT_FOUND: Int = -32006
    /** Authentication required for a protected resource */
    const val AUTH_REQUIRED: Int = -32007
    /** The requested file, folder, or URI does not exist */
    const val NOT_FOUND: Int = -32008
    /** The client is not permitted to access the requested resource */
    const val PERMISSION_DENIED: Int = -32009
    /** The target resource already exists and the operation does not allow overwriting */
    const val ALREADY_EXISTS: Int = -32010
    /** An optimistic-concurrency precondition failed: a request precondition token no longer matches the resource state */
    const val CONFLICT: Int = -32011
    /** A canvas provider request (canvasOpen, canvasInvokeAction, or canvasClose) failed; `data` carries a provider-defined `{ code, message }` */
    const val CANVAS_PROVIDER_ERROR: Int = -32012
}

// ─── Error Detail Payloads ──────────────────────────────────────────────────

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

@Serializable
data class CanvasProviderErrorData(
    /**
     * Provider-defined error code identifying the failure.
     */
    val code: String,
    /**
     * Human-readable error message.
     */
    val message: String
)
