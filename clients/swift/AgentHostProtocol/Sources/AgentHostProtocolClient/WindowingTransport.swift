import Foundation

internal typealias AHPBeforeWrite = @Sendable () async throws -> Void

public struct AHPWireMessage: Sendable {
    public let message: TransportMessage
    public let originalJSONText: String?
    public init(message: TransportMessage, originalJSONText: String? = nil) {
        self.message = message
        self.originalJSONText = originalJSONText
    }
}

public struct AHPTransportCapabilities: Sendable {
    public let preservesOriginalJSONText: Bool
    public let maximumReceiveMessageUTF8Bytes: Int?
    public init(preservesOriginalJSONText: Bool = false, maximumReceiveMessageUTF8Bytes: Int? = nil) {
        self.preservesOriginalJSONText = preservesOriginalJSONText
        self.maximumReceiveMessageUTF8Bytes = maximumReceiveMessageUTF8Bytes
    }
    public var maximumFrameBytes: Int {
        maximumReceiveMessageUTF8Bytes.map { 2 * ($0 / 3) } ?? 1_048_576
    }
}

/// Optional refinement; legacy transports and TransportMessage remain unchanged.
public protocol AHPWindowingTransport: AHPTransport {
    var windowingCapabilities: AHPTransportCapabilities { get async }
    func recvWireMessage() async throws -> AHPWireMessage?
}

extension AHPWindowingTransport {
    public var windowingCapabilities: AHPTransportCapabilities { get async { .init() } }
    public func recvWireMessage() async throws -> AHPWireMessage? {
        guard let message = try await recv() else { return nil }
        switch message {
        case .text(let text): return .init(message: message, originalJSONText: text)
        case .binary(let data):
            guard let text = String(data: data, encoding: .utf8) else {
                throw TransportError.protocol("binary JSON is not UTF-8")
            }
            return .init(message: message, originalJSONText: text)
        case .parsed: return .init(message: message)
        }
    }
}

extension InMemoryTransport: AHPWindowingTransport {
    public var windowingCapabilities: AHPTransportCapabilities {
        get async { .init(preservesOriginalJSONText: true) }
    }
}

extension NWConnectionWebSocketTransport: AHPWindowingTransport {
    public var windowingCapabilities: AHPTransportCapabilities {
        get async { .init(preservesOriginalJSONText: true) }
    }
}
