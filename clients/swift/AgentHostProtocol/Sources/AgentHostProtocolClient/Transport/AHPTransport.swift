// AHPTransport — pluggable async transport for the JSON-RPC client.
//
// Inspired by the Rust `Transport` trait (`clients/rust/crates/ahp/src/transport.rs`)
// but uses Swift's `async throws` directly. Implementations may be backed by
// WebSocket, stdio, an in-memory pair for tests, or anything else that
// delivers framed JSON-RPC messages.

import Foundation
import AgentHostProtocol

// MARK: - JSON-RPC message union

/// A typed JSON-RPC 2.0 message.
///
/// The Swift types library ships per-kind generics (`JsonRpcRequest<P>`,
/// `JsonRpcSuccessResponse<R>`, `JsonRpcErrorResponse`, `JsonRpcNotification<P>`)
/// but no enum to discriminate them on the wire. This local union closes that
/// gap for transports and the client without forcing the types library to
/// take any new dependency.
public enum JsonRpcMessage: Sendable {
    /// JSON-RPC request (has `id` and `method`).
    case request(id: Int, method: String, params: AnyCodable?)
    /// Successful JSON-RPC response (has `id` and `result`).
    case successResponse(id: Int, result: AnyCodable)
    /// JSON-RPC error response (has `id` and `error`).
    case errorResponse(id: Int, error: JsonRpcError)
    /// JSON-RPC notification (has `method` but no `id`).
    case notification(method: String, params: AnyCodable?)
}

extension JsonRpcMessage: Codable {
    private enum CodingKeys: String, CodingKey {
        case jsonrpc, id, method, params, result, error
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let id = try container.decodeIfPresent(Int.self, forKey: .id)
        let method = try container.decodeIfPresent(String.self, forKey: .method)

        if let id, method == nil {
            // Response (success or error).
            if let error = try container.decodeIfPresent(JsonRpcError.self, forKey: .error) {
                self = .errorResponse(id: id, error: error)
            } else if let result = try container.decodeIfPresent(AnyCodable.self, forKey: .result) {
                self = .successResponse(id: id, result: result)
            } else {
                throw DecodingError.dataCorruptedError(
                    forKey: .result, in: container,
                    debugDescription: "JSON-RPC response missing both result and error"
                )
            }
        } else if let method, let id {
            // Server → client request (rare, but spec-permitted).
            let params = try container.decodeIfPresent(AnyCodable.self, forKey: .params)
            self = .request(id: id, method: method, params: params)
        } else if let method {
            // Notification.
            let params = try container.decodeIfPresent(AnyCodable.self, forKey: .params)
            self = .notification(method: method, params: params)
        } else {
            throw DecodingError.dataCorruptedError(
                forKey: .method, in: container,
                debugDescription: "JSON-RPC message has neither method nor id"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("2.0", forKey: .jsonrpc)
        switch self {
        case .request(let id, let method, let params):
            try container.encode(id, forKey: .id)
            try container.encode(method, forKey: .method)
            try container.encodeIfPresent(params, forKey: .params)
        case .successResponse(let id, let result):
            try container.encode(id, forKey: .id)
            try container.encode(result, forKey: .result)
        case .errorResponse(let id, let error):
            try container.encode(id, forKey: .id)
            try container.encode(error, forKey: .error)
        case .notification(let method, let params):
            try container.encode(method, forKey: .method)
            try container.encodeIfPresent(params, forKey: .params)
        }
    }
}

// MARK: - TransportMessage

/// One message flowing in or out over an `AHPTransport`.
///
/// Transports may hand the client an already-decoded message via `.parsed`
/// when one is naturally available (e.g. an in-memory pair); otherwise text
/// or binary frames carry the JSON-encoded payload and the client decodes
/// them itself.
///
/// **Prefer `.text` or `.binary` for inbound frames.** `AHPClient` decodes
/// inbound JSON via `JSONSerialization` to preserve the NSNumber
/// `Bool`/`Int` distinction that `JSONDecoder`+`AnyCodable` collapses on
/// Apple platforms (tracked as
/// [microsoft/agent-host-protocol#123](https://github.com/microsoft/agent-host-protocol/issues/123)).
/// Inbound `.parsed` messages bypass that path: the client must re-encode
/// them to recover bytes, and any `AnyCodable`-wrapped payload inside them
/// may already have been corrupted before reaching the client. `.parsed` is
/// safe for outbound sends (the writer encodes to `.text` itself) and for
/// transports that construct `JsonRpcMessage` values without going through
/// `AnyCodable`/`JSONDecoder`. The in-memory test transport in this package
/// only emits `.text`.
public enum TransportMessage: Sendable {
    /// A pre-decoded JSON-RPC message.
    case parsed(JsonRpcMessage)
    /// A text frame whose payload is a JSON-RPC message encoded as UTF-8.
    case text(String)
    /// A binary frame carrying a JSON-RPC message encoded as UTF-8.
    case binary(Data)

    /// Decode this message into a typed `JsonRpcMessage`.
    public func intoParsed() throws -> JsonRpcMessage {
        switch self {
        case .parsed(let m):
            return m
        case .text(let s):
            guard let data = s.data(using: .utf8) else {
                throw TransportError.protocol("text frame is not valid UTF-8")
            }
            do {
                return try JSONDecoder().decode(JsonRpcMessage.self, from: data)
            } catch {
                throw TransportError.protocol("failed to decode text frame: \(error)")
            }
        case .binary(let data):
            do {
                return try JSONDecoder().decode(JsonRpcMessage.self, from: data)
            } catch {
                throw TransportError.protocol("failed to decode binary frame: \(error)")
            }
        }
    }

    /// Encode a `JsonRpcMessage` into a text-frame `TransportMessage`.
    public static func encode(_ message: JsonRpcMessage) throws -> TransportMessage {
        do {
            let data = try JSONEncoder().encode(message)
            guard let s = String(data: data, encoding: .utf8) else {
                throw TransportError.protocol("encoded message is not valid UTF-8")
            }
            return .text(s)
        } catch let error as TransportError {
            throw error
        } catch {
            throw TransportError.protocol("failed to encode message: \(error)")
        }
    }
}

// MARK: - TransportError

/// Errors raised by an `AHPTransport` implementation.
public enum TransportError: Error, Sendable, Equatable {
    /// The transport was closed before the operation could complete.
    case closed
    /// I/O failure (network error, broken pipe, etc.).
    case io(String)
    /// Protocol-level error (bad framing, decode failure, malformed UTF-8).
    case `protocol`(String)
}

// MARK: - AHPTransport

/// Pluggable transport for the JSON-RPC client.
///
/// `AHPClient` calls `send` and `recv` *serially* — implementations are not
/// required to support reentrant `send` from multiple tasks. The receive loop
/// runs concurrently with the writer, so `send` and `recv` can overlap, but
/// neither is invoked from multiple tasks simultaneously by the client.
///
/// `close` MUST be idempotent — `AHPClient` may call it from both its
/// `shutdown()` path and its abnormal-disconnect handler, possibly back to
/// back if the two interleave.
///
/// Transports are expected to be full-duplex and half-closable: the client
/// will keep sending until the underlying connection closes, and `recv`
/// signals a clean close by returning `nil`.
public protocol AHPTransport: AnyObject, Sendable {
    /// Send a single message.
    ///
    /// Errors thrown here are typically fatal for the transport; `AHPClient`
    /// will surface them to in-flight requests and tear down.
    func send(_ message: TransportMessage) async throws

    /// Receive the next inbound message.
    ///
    /// Returns `nil` when the remote half has cleanly closed. Errors are
    /// treated as abnormal closure.
    func recv() async throws -> TransportMessage?

    /// Close the transport and release any underlying resources.
    func close() async throws
}

/// Optional capability for transports that can send protocol-level pings.
///
/// `AHPClient` uses this only when `AHPClientConfig.keepAlive` is enabled.
/// Transports that do not support pings can ignore the capability entirely;
/// keepalive is simply unavailable for those transports.
public protocol AHPKeepAliveTransport: AHPTransport {
    /// Send a transport-level ping and return after the matching pong arrives.
    func sendPing(timeout: Duration) async throws
}
