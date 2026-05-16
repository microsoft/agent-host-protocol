import CryptoKit
import Foundation
import Network
import XCTest
@testable import AgentHostProtocolClient

final class NWConnectionWebSocketTransportTests: XCTestCase {
    func testNativeTransportPerformsHandshakeAndRoundTripsText() async throws {
        let server = try await LoopbackWebSocketServer.start()
        let transport = NWConnectionWebSocketTransport(
            url: await server.url(path: "/rpc?transport=nw"),
            headers: ["Authorization": "Bearer test-token"],
            connectTimeoutNanoseconds: 2_000_000_000
        )

        try await transport.send(.text("client-message"))

        let headers = try await withTimeout { try await server.handshakeHeaders() }
        XCTAssertEqual(headers["authorization"], "Bearer test-token")

        let received = try await withTimeout { try await server.nextText() }
        XCTAssertEqual(received, "client-message")

        try await server.sendText("server-message")
        let response = try await withTimeout { try await transport.recv() }
        XCTAssertEqual(stringPayload(of: response), "server-message")

        try await transport.close()
        await server.stop()
    }

    func testNativeTransportRejectsUnsupportedScheme() async throws {
        let transport = NWConnectionWebSocketTransport(
            url: URL(string: "http://example.com/rpc")!,
            connectTimeoutNanoseconds: 1
        )

        do {
            try await transport.send(.text("{}"))
            XCTFail("expected unsupported scheme error")
        } catch let error as TransportError {
            guard case .protocol(let message) = error else {
                XCTFail("expected protocol error, got \(error)")
                return
            }
            XCTAssertTrue(message.contains("Unsupported WebSocket scheme"))
        }
    }
}

private func stringPayload(of message: TransportMessage?) -> String? {
    guard let message else { return nil }
    switch message {
    case .text(let text): return text
    case .binary(let data): return String(data: data, encoding: .utf8)
    case .parsed: return nil
    }
}

private enum TestTimeoutError: Error {
    case timedOut
}

private func withTimeout<T>(
    nanoseconds: UInt64 = 2_000_000_000,
    operation: @escaping @Sendable () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(nanoseconds: nanoseconds)
            throw TestTimeoutError.timedOut
        }
        let result = try await group.next()!
        group.cancelAll()
        return result
    }
}

private actor LoopbackWebSocketServer {
    private struct ParsedFrame {
        let opcode: UInt8
        let payload: Data
    }

    private static let headerDelimiter = Data([13, 10, 13, 10])
    private static let handshakeGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

    private let listener: NWListener
    private let queue = DispatchQueue(label: "AgentHostProtocolClientTests.LoopbackWebSocketServer")

    private var connection: NWConnection?
    private var readBuffer = Data()
    private var handshakeHeaderValues: [String: String]?
    private var handshakeContinuation: CheckedContinuation<[String: String], Error>?
    private var textMessages: [String] = []
    private var textContinuation: CheckedContinuation<String, Error>?

    static func start() async throws -> LoopbackWebSocketServer {
        let listener = try NWListener(using: .tcp, on: .any)
        let server = LoopbackWebSocketServer(listener: listener)
        try await server.startListening()
        return server
    }

    private init(listener: NWListener) {
        self.listener = listener
    }

    func url(path: String = "/") -> URL {
        let port = listener.port?.rawValue ?? 0
        return URL(string: "ws://127.0.0.1:\(port)\(path)")!
    }

    func handshakeHeaders() async throws -> [String: String] {
        if let handshakeHeaderValues { return handshakeHeaderValues }
        return try await withCheckedThrowingContinuation { continuation in
            handshakeContinuation = continuation
        }
    }

    func nextText() async throws -> String {
        if !textMessages.isEmpty {
            return textMessages.removeFirst()
        }
        return try await withCheckedThrowingContinuation { continuation in
            textContinuation = continuation
        }
    }

    func sendText(_ text: String) async throws {
        guard let connection else { throw TransportError.closed }
        try await sendRaw(makeServerFrame(opcode: 0x1, payload: Data(text.utf8)), on: connection)
    }

    func stop() {
        connection?.cancel()
        listener.cancel()
        resumePending(with: TransportError.closed)
    }

    private func startListening() async throws {
        let ready = OneShot<Void>()
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                ready.resume(returning: ())
            case .failed(let error):
                ready.resume(throwing: error)
            default:
                break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            Task { await self?.accept(connection) }
        }
        listener.start(queue: queue)
        try await ready.value()
    }

    private func accept(_ connection: NWConnection) async {
        self.connection = connection
        connection.start(queue: queue)
        do {
            try await performHandshake(on: connection)
            while true {
                guard let frame = try await readFrame(on: connection) else { return }
                switch frame.opcode {
                case 0x1:
                    guard let text = String(data: frame.payload, encoding: .utf8) else {
                        throw TransportError.protocol("invalid UTF-8 text frame")
                    }
                    recordText(text)
                case 0x8:
                    try? await sendRaw(makeServerFrame(opcode: 0x8, payload: Data()), on: connection)
                    return
                case 0x9:
                    try await sendRaw(makeServerFrame(opcode: 0xA, payload: frame.payload), on: connection)
                default:
                    break
                }
            }
        } catch {
            resumePending(with: error)
        }
    }

    private func performHandshake(on connection: NWConnection) async throws {
        let headerData = try await readHeaderBlock(on: connection)
        guard let headerText = String(data: headerData, encoding: .utf8) else {
            throw TransportError.protocol("invalid handshake header")
        }

        let lines = headerText
            .split(separator: "\r\n", omittingEmptySubsequences: false)
            .map(String.init)
        var headers: [String: String] = [:]
        for line in lines.dropFirst() where !line.isEmpty {
            guard let delimiter = line.firstIndex(of: ":") else { continue }
            let name = String(line[..<delimiter]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = String(line[line.index(after: delimiter)...]).trimmingCharacters(in: .whitespacesAndNewlines)
            headers[name] = value
        }

        guard let secKey = headers["sec-websocket-key"] else {
            throw TransportError.protocol("missing Sec-WebSocket-Key")
        }

        let accept = expectedAcceptValue(for: secKey)
        let response = [
            "HTTP/1.1 101 Switching Protocols",
            "Upgrade: websocket",
            "Connection: Upgrade",
            "Sec-WebSocket-Accept: \(accept)",
            "",
            "",
        ].joined(separator: "\r\n")

        try await sendRaw(Data(response.utf8), on: connection)
        handshakeHeaderValues = headers
        handshakeContinuation?.resume(returning: headers)
        handshakeContinuation = nil
    }

    private func readHeaderBlock(on connection: NWConnection) async throws -> Data {
        while true {
            if let range = readBuffer.range(of: Self.headerDelimiter) {
                let headerEnd = range.upperBound
                let headerData = readBuffer[..<headerEnd]
                readBuffer.removeSubrange(..<headerEnd)
                return Data(headerData)
            }

            let chunk = try await receiveRaw(on: connection)
            if chunk.isEmpty { throw TransportError.closed }
            readBuffer.append(chunk)
        }
    }

    private func readFrame(on connection: NWConnection) async throws -> ParsedFrame? {
        while true {
            if let frame = try parseFrameFromBuffer() { return frame }
            let chunk = try await receiveRaw(on: connection)
            if chunk.isEmpty { return nil }
            readBuffer.append(chunk)
        }
    }

    private func parseFrameFromBuffer() throws -> ParsedFrame? {
        guard readBuffer.count >= 2 else { return nil }

        let firstByte = readBuffer[0]
        let secondByte = readBuffer[1]
        let opcode = firstByte & 0x0F
        let masked = (secondByte & 0x80) != 0
        var index = 2
        var payloadLength = UInt64(secondByte & 0x7F)

        switch payloadLength {
        case 126:
            guard readBuffer.count >= index + 2 else { return nil }
            payloadLength = (UInt64(readBuffer[index]) << 8) | UInt64(readBuffer[index + 1])
            index += 2
        case 127:
            guard readBuffer.count >= index + 8 else { return nil }
            payloadLength = 0
            for byte in readBuffer[index..<(index + 8)] {
                payloadLength = (payloadLength << 8) | UInt64(byte)
            }
            index += 8
        default:
            break
        }

        var maskKey: [UInt8] = []
        if masked {
            guard readBuffer.count >= index + 4 else { return nil }
            maskKey = Array(readBuffer[index..<(index + 4)])
            index += 4
        }

        let payloadCount = Int(payloadLength)
        guard readBuffer.count >= index + payloadCount else { return nil }

        var payload = Data(readBuffer[index..<(index + payloadCount)])
        readBuffer.removeSubrange(0..<(index + payloadCount))

        if masked {
            var bytes = [UInt8](payload)
            for i in bytes.indices {
                bytes[i] ^= maskKey[i % 4]
            }
            payload = Data(bytes)
        }

        return ParsedFrame(opcode: opcode, payload: payload)
    }

    private func makeServerFrame(opcode: UInt8, payload: Data) -> Data {
        var frame = Data()
        frame.append(0x80 | (opcode & 0x0F))

        let payloadCount = payload.count
        if payloadCount <= 125 {
            frame.append(UInt8(payloadCount))
        } else if payloadCount <= 65_535 {
            frame.append(126)
            frame.append(UInt8((payloadCount >> 8) & 0xFF))
            frame.append(UInt8(payloadCount & 0xFF))
        } else {
            frame.append(127)
            let length = UInt64(payloadCount)
            for shift in stride(from: 56, through: 0, by: -8) {
                frame.append(UInt8((length >> UInt64(shift)) & 0xFF))
            }
        }

        frame.append(payload)
        return frame
    }

    private func sendRaw(_ data: Data, on connection: NWConnection) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
    }

    private func receiveRaw(on connection: NWConnection) async throws -> Data {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, isComplete, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                if let data, !data.isEmpty {
                    continuation.resume(returning: data)
                    return
                }
                if isComplete {
                    continuation.resume(returning: Data())
                } else {
                    continuation.resume(throwing: TransportError.protocol("malformed frame"))
                }
            }
        }
    }

    private func expectedAcceptValue(for secKey: String) -> String {
        let combined = secKey + Self.handshakeGUID
        let digest = Insecure.SHA1.hash(data: Data(combined.utf8))
        return Data(digest).base64EncodedString()
    }

    private func recordText(_ text: String) {
        if let continuation = textContinuation {
            textContinuation = nil
            continuation.resume(returning: text)
        } else {
            textMessages.append(text)
        }
    }

    private func resumePending(with error: Error) {
        handshakeContinuation?.resume(throwing: error)
        handshakeContinuation = nil
        textContinuation?.resume(throwing: error)
        textContinuation = nil
    }
}

private final class OneShot<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var result: Result<Value, Error>?
    private var continuation: CheckedContinuation<Value, Error>?

    func value() async throws -> Value {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if let result {
                lock.unlock()
                continuation.resume(with: result)
            } else {
                self.continuation = continuation
                lock.unlock()
            }
        }
    }

    func resume(returning value: Value) {
        resume(with: .success(value))
    }

    func resume(throwing error: Error) {
        resume(with: .failure(error))
    }

    private func resume(with result: Result<Value, Error>) {
        lock.lock()
        guard self.result == nil else {
            lock.unlock()
            return
        }
        self.result = result
        let continuation = self.continuation
        self.continuation = nil
        lock.unlock()
        continuation?.resume(with: result)
    }
}