// AHPClientTestHelpers — utilities shared across the client test suite.

import Foundation
import AgentHostProtocol
@testable import AgentHostProtocolClient

extension TransportMessage {
    /// Convenience: encode a JSON-RPC message into a text frame for tests.
    static func encoded(_ message: JsonRpcMessage) -> TransportMessage {
        return try! TransportMessage.encode(message)
    }
}

/// Build a wire-format JSON-RPC notification that preserves NSNumber Bool/Int
/// fidelity (which AnyCodable's encode order otherwise erases). The path is
/// `typed → JSONEncoder → JSONSerialization → re-serialized JSON Data`.
func makeNotificationWire<P: Encodable>(
    method: String, params: P
) throws -> TransportMessage {
    let paramsBytes = try JSONEncoder().encode(params)
    let paramsAny = try JSONSerialization.jsonObject(
        with: paramsBytes, options: [.fragmentsAllowed]
    )
    let dict: [String: Any] = [
        "jsonrpc": "2.0",
        "method": method,
        "params": paramsAny,
    ]
    let wireBytes = try JSONSerialization.data(withJSONObject: dict)
    guard let text = String(data: wireBytes, encoding: .utf8) else {
        throw TestHelperError.encoding("failed to UTF-8-encode wire bytes")
    }
    return .text(text)
}

func makeResponseWire<R: Encodable>(
    id: Int, result: R
) throws -> TransportMessage {
    let resultBytes = try JSONEncoder().encode(result)
    let resultAny = try JSONSerialization.jsonObject(
        with: resultBytes, options: [.fragmentsAllowed]
    )
    let dict: [String: Any] = [
        "jsonrpc": "2.0",
        "id": id,
        "result": resultAny,
    ]
    let wireBytes = try JSONSerialization.data(withJSONObject: dict)
    guard let text = String(data: wireBytes, encoding: .utf8) else {
        throw TestHelperError.encoding("failed to UTF-8-encode wire bytes")
    }
    return .text(text)
}

enum TestHelperError: Error, LocalizedError {
    case encoding(String)
    var errorDescription: String? {
        switch self {
        case .encoding(let s): return s
        }
    }
}

/// Wait for the next value from an AsyncStream iterator with a timeout.
func nextWithTimeout<E>(
    _ iterator: inout AsyncStream<E>.AsyncIterator,
    _ timeout: Duration = .seconds(2)
) async throws -> E? where E: Sendable {
    try await withThrowingTaskGroup(of: E?.self) { group in
        group.addTask { [iterator = iterator] in
            var iter = iterator
            return await iter.next()
        }
        group.addTask {
            try await Task.sleep(for: timeout)
            throw TimeoutError()
        }
        defer { group.cancelAll() }
        return try await group.next()!
    }
}

struct TimeoutError: Error, LocalizedError {
    var errorDescription: String? { "operation timed out in test" }
}

func nextWithTimeout<E>(
    _ iterator: inout AsyncThrowingStream<E, Error>.AsyncIterator,
    _ timeout: Duration = .seconds(2)
) async throws -> E? where E: Sendable {
    try await withThrowingTaskGroup(of: E?.self) { group in
        group.addTask { [iterator = iterator] in
            var iter = iterator
            return try await iter.next()
        }
        group.addTask {
            try await Task.sleep(for: timeout)
            throw TimeoutError()
        }
        defer { group.cancelAll() }
        return try await group.next()!
    }
}
