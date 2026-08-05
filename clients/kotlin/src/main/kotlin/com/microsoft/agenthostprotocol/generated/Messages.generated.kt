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

// ─── JSON-RPC Base Types ────────────────────────────────────────────────────

/**
 * A JSON-RPC 2.0 request.
 */
@Serializable
data class JsonRpcRequest<P>(
    val id: Long,
    val method: String,
    val params: P,
    val jsonrpc: String = "2.0",
)

/**
 * A JSON-RPC 2.0 error object.
 */
@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String,
    val data: JsonElement? = null,
)

/**
 * A JSON-RPC 2.0 success response.
 */
@Serializable
data class JsonRpcSuccessResponse<R>(
    val id: Long,
    val result: R,
    val jsonrpc: String = "2.0",
)

/**
 * A JSON-RPC 2.0 error response.
 */
@Serializable
data class JsonRpcErrorResponse(
    val id: Long,
    val error: JsonRpcError,
    val jsonrpc: String = "2.0",
)

/**
 * A JSON-RPC 2.0 notification (no id).
 */
@Serializable
data class JsonRpcNotification<P>(
    val method: String,
    val params: P,
    val jsonrpc: String = "2.0",
)

// ─── Server → Client Notification Params ────────────────────────────────────

/** Params for the server → client `action` notification. */
typealias ActionNotificationParams = ActionEnvelope

// ─── AHP Command Helpers ────────────────────────────────────────────────────

/**
 * Typed factories for constructing AHP JSON-RPC requests.
 */
object AhpCommands {
    fun initialize(id: Long, params: InitializeParams): JsonRpcRequest<InitializeParams> =
        JsonRpcRequest(id = id, method = "initialize", params = params)

    // `ping` carries no payload beyond the root channel discriminant, so there is
    // no dedicated `PingParams` type. The helper hardcodes the channel object.
    fun ping(id: Long): JsonRpcRequest<JsonObject> =
        JsonRpcRequest(id = id, method = "ping", params = JsonObject(mapOf("channel" to JsonPrimitive("ahp-root://"))))

    fun reconnect(id: Long, params: ReconnectParams): JsonRpcRequest<ReconnectParams> =
        JsonRpcRequest(id = id, method = "reconnect", params = params)

    fun subscribe(id: Long, params: SubscribeParams): JsonRpcRequest<SubscribeParams> =
        JsonRpcRequest(id = id, method = "subscribe", params = params)

    fun createSession(id: Long, params: CreateSessionParams): JsonRpcRequest<CreateSessionParams> =
        JsonRpcRequest(id = id, method = "createSession", params = params)

    fun disposeSession(id: Long, params: DisposeSessionParams): JsonRpcRequest<DisposeSessionParams> =
        JsonRpcRequest(id = id, method = "disposeSession", params = params)

    fun listSessions(id: Long, params: ListSessionsParams): JsonRpcRequest<ListSessionsParams> =
        JsonRpcRequest(id = id, method = "listSessions", params = params)

    fun resourceRead(id: Long, params: ResourceReadParams): JsonRpcRequest<ResourceReadParams> =
        JsonRpcRequest(id = id, method = "resourceRead", params = params)

    fun resourceWrite(id: Long, params: ResourceWriteParams): JsonRpcRequest<ResourceWriteParams> =
        JsonRpcRequest(id = id, method = "resourceWrite", params = params)

    fun resourceList(id: Long, params: ResourceListParams): JsonRpcRequest<ResourceListParams> =
        JsonRpcRequest(id = id, method = "resourceList", params = params)

    fun resourceCopy(id: Long, params: ResourceCopyParams): JsonRpcRequest<ResourceCopyParams> =
        JsonRpcRequest(id = id, method = "resourceCopy", params = params)

    fun resourceDelete(id: Long, params: ResourceDeleteParams): JsonRpcRequest<ResourceDeleteParams> =
        JsonRpcRequest(id = id, method = "resourceDelete", params = params)

    fun resourceMove(id: Long, params: ResourceMoveParams): JsonRpcRequest<ResourceMoveParams> =
        JsonRpcRequest(id = id, method = "resourceMove", params = params)

    fun resourceRequest(id: Long, params: ResourceRequestParams): JsonRpcRequest<ResourceRequestParams> =
        JsonRpcRequest(id = id, method = "resourceRequest", params = params)

    fun fetchTurns(id: Long, params: FetchTurnsParams): JsonRpcRequest<FetchTurnsParams> =
        JsonRpcRequest(id = id, method = "fetchTurns", params = params)

    fun authenticate(id: Long, params: AuthenticateParams): JsonRpcRequest<AuthenticateParams> =
        JsonRpcRequest(id = id, method = "authenticate", params = params)

    fun createTerminal(id: Long, params: CreateTerminalParams): JsonRpcRequest<CreateTerminalParams> =
        JsonRpcRequest(id = id, method = "createTerminal", params = params)

    fun disposeTerminal(id: Long, params: DisposeTerminalParams): JsonRpcRequest<DisposeTerminalParams> =
        JsonRpcRequest(id = id, method = "disposeTerminal", params = params)

    fun resolveSessionConfig(id: Long, params: ResolveSessionConfigParams): JsonRpcRequest<ResolveSessionConfigParams> =
        JsonRpcRequest(id = id, method = "resolveSessionConfig", params = params)

    fun sessionConfigCompletions(id: Long, params: SessionConfigCompletionsParams): JsonRpcRequest<SessionConfigCompletionsParams> =
        JsonRpcRequest(id = id, method = "sessionConfigCompletions", params = params)

    fun completions(id: Long, params: CompletionsParams): JsonRpcRequest<CompletionsParams> =
        JsonRpcRequest(id = id, method = "completions", params = params)

    fun invokeChangesetOperation(id: Long, params: InvokeChangesetOperationParams): JsonRpcRequest<InvokeChangesetOperationParams> =
        JsonRpcRequest(id = id, method = "invokeChangesetOperation", params = params)
}

/**
 * Typed factories for constructing client → server notifications.
 */
object AhpClientNotifications {
    fun unsubscribe(params: UnsubscribeParams): JsonRpcNotification<UnsubscribeParams> =
        JsonRpcNotification(method = "unsubscribe", params = params)

    fun dispatchAction(params: DispatchActionParams): JsonRpcNotification<DispatchActionParams> =
        JsonRpcNotification(method = "dispatchAction", params = params)
}
