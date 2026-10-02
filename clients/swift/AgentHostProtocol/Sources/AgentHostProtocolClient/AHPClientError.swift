// AHPClientError — errors raised by `AHPClient`.

import Foundation
import AgentHostProtocol

/// A strict event receiver exhausted its buffer and cannot continue across the gap.
public struct SubscriptionLagError: Error, Sendable, LocalizedError {
    public let capacity: Int

    public init(capacity: Int) { self.capacity = capacity }

    public var errorDescription: String? {
        "Event receiver exceeded its capacity of \(capacity); the receiver is permanently terminated."
    }
}

/// Errors raised by `AHPClient`.
public enum AHPClientError: Error, Sendable {
    /// Underlying transport failure.
    case transport(TransportError)
    /// JSON-RPC error response from the peer.
    case rpc(code: Int, message: String, data: AnyCodable?)
    /// Failed to decode a response or notification payload.
    case decoding(String)
    /// The client was shut down (cleanly or by transport close) before the
    /// operation completed.
    case shutdown
    /// A request didn't resolve before `requestTimeout`.
    case requestTimeout
}

extension AHPClientError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .transport(let e):
            return "transport error: \(e)"
        case .rpc(let code, let message, _):
            return "JSON-RPC error \(code): \(message)"
        case .decoding(let detail):
            return "failed to decode: \(detail)"
        case .shutdown:
            return "client was shut down"
        case .requestTimeout:
            return "request timed out"
        }
    }
}
