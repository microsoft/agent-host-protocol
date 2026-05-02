// Generated from types/*.ts — do not edit

import Foundation

// MARK: - JSON-RPC Base Types

/// A JSON-RPC 2.0 request.
public struct JsonRpcRequest<Params: Codable>: Codable, Sendable where Params: Sendable {
    public let jsonrpc: String
    public let id: Int
    public let method: String
    public let params: Params

    public init(id: Int, method: String, params: Params) {
        self.jsonrpc = "2.0"
        self.id = id
        self.method = method
        self.params = params
    }
}

/// A JSON-RPC 2.0 error object.
public struct JsonRpcError: Codable, Sendable {
    public let code: Int
    public let message: String
    public let data: AnyCodable?

    public init(code: Int, message: String, data: AnyCodable? = nil) {
        self.code = code
        self.message = message
        self.data = data
    }
}

/// A JSON-RPC 2.0 success response.
public struct JsonRpcSuccessResponse<Result: Codable>: Codable, Sendable where Result: Sendable {
    public let jsonrpc: String
    public let id: Int
    public let result: Result
}

/// A JSON-RPC 2.0 error response.
public struct JsonRpcErrorResponse: Codable, Sendable {
    public let jsonrpc: String
    public let id: Int
    public let error: JsonRpcError
}

/// A JSON-RPC 2.0 notification (no id).
public struct JsonRpcNotification<Params: Codable>: Codable, Sendable where Params: Sendable {
    public let jsonrpc: String
    public let method: String
    public let params: Params

    public init(method: String, params: Params) {
        self.jsonrpc = "2.0"
        self.method = method
        self.params = params
    }
}

// MARK: - Server → Client Notification Params

/// Params for the server → client `action` notification.
public typealias ActionNotificationParams = ActionEnvelope

/// Params for the server → client `notification` method.
public struct NotificationMethodParams: Codable, Sendable {
    public let notification: ProtocolNotification

    public init(notification: ProtocolNotification) {
        self.notification = notification
    }
}

// MARK: - AHP Command Helpers

/// Typed helper for constructing AHP JSON-RPC requests.
public enum AHPCommands {
    public static func initialize(id: Int, params: InitializeParams) -> JsonRpcRequest<InitializeParams> {
        JsonRpcRequest(id: id, method: "initialize", params: params)
    }

    public static func reconnect(id: Int, params: ReconnectParams) -> JsonRpcRequest<ReconnectParams> {
        JsonRpcRequest(id: id, method: "reconnect", params: params)
    }

    public static func subscribe(id: Int, params: SubscribeParams) -> JsonRpcRequest<SubscribeParams> {
        JsonRpcRequest(id: id, method: "subscribe", params: params)
    }

    public static func createSession(id: Int, params: CreateSessionParams) -> JsonRpcRequest<CreateSessionParams> {
        JsonRpcRequest(id: id, method: "createSession", params: params)
    }

    public static func disposeSession(id: Int, params: DisposeSessionParams) -> JsonRpcRequest<DisposeSessionParams> {
        JsonRpcRequest(id: id, method: "disposeSession", params: params)
    }

    public static func listSessions(id: Int, params: ListSessionsParams) -> JsonRpcRequest<ListSessionsParams> {
        JsonRpcRequest(id: id, method: "listSessions", params: params)
    }

    public static func resourceRead(id: Int, params: ResourceReadParams) -> JsonRpcRequest<ResourceReadParams> {
        JsonRpcRequest(id: id, method: "resourceRead", params: params)
    }

    public static func resourceWrite(id: Int, params: ResourceWriteParams) -> JsonRpcRequest<ResourceWriteParams> {
        JsonRpcRequest(id: id, method: "resourceWrite", params: params)
    }

    public static func resourceList(id: Int, params: ResourceListParams) -> JsonRpcRequest<ResourceListParams> {
        JsonRpcRequest(id: id, method: "resourceList", params: params)
    }

    public static func resourceCopy(id: Int, params: ResourceCopyParams) -> JsonRpcRequest<ResourceCopyParams> {
        JsonRpcRequest(id: id, method: "resourceCopy", params: params)
    }

    public static func resourceDelete(id: Int, params: ResourceDeleteParams) -> JsonRpcRequest<ResourceDeleteParams> {
        JsonRpcRequest(id: id, method: "resourceDelete", params: params)
    }

    public static func resourceMove(id: Int, params: ResourceMoveParams) -> JsonRpcRequest<ResourceMoveParams> {
        JsonRpcRequest(id: id, method: "resourceMove", params: params)
    }

    public static func resourceRequest(id: Int, params: ResourceRequestParams) -> JsonRpcRequest<ResourceRequestParams> {
        JsonRpcRequest(id: id, method: "resourceRequest", params: params)
    }

    public static func fetchTurns(id: Int, params: FetchTurnsParams) -> JsonRpcRequest<FetchTurnsParams> {
        JsonRpcRequest(id: id, method: "fetchTurns", params: params)
    }

    public static func authenticate(id: Int, params: AuthenticateParams) -> JsonRpcRequest<AuthenticateParams> {
        JsonRpcRequest(id: id, method: "authenticate", params: params)
    }
}

/// Typed helper for constructing client → server notifications.
public enum AHPClientNotifications {
    public static func unsubscribe(params: UnsubscribeParams) -> JsonRpcNotification<UnsubscribeParams> {
        JsonRpcNotification(method: "unsubscribe", params: params)
    }

    public static func dispatchAction(params: DispatchActionParams) -> JsonRpcNotification<DispatchActionParams> {
        JsonRpcNotification(method: "dispatchAction", params: params)
    }
}
