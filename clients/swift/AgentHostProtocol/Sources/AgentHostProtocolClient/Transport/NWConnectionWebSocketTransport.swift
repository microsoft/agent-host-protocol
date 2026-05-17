// NWConnectionWebSocketTransport — native WebSocket transport.
//
// Uses Network.framework directly instead of URLSessionWebSocketTask. This is
// useful for iOS/macOS local development, LAN, and Tailscale-style ws://
// targets where URLSession's ATS behavior is not a good fit.

import CryptoKit
import Foundation
import Network

/// Native WebSocket transport built on `NWConnection`.
///
/// The connection and WebSocket handshake are opened lazily on the first
/// `send` or `recv`, matching `URLSessionWebSocketTransport`'s lifecycle.
/// Client-to-server frames are masked as required by RFC 6455. Incoming text
/// frames are returned as `.text`, and binary frames are returned as `.binary`
/// so `AHPClient` can preserve its raw JSON parsing path.
public actor NWConnectionWebSocketTransport: AHPTransport, AHPKeepAliveTransport {
    private struct ParsedFrame {
        let fin: Bool
        let opcode: UInt8
        let payload: Data
    }

    private enum CompleteMessage {
        case text(String)
        case binary(Data)
    }

    private enum BufferRead {
        case message(CompleteMessage)
        case close
        case none
    }

    private enum NativeWebSocketError: Error, LocalizedError, Sendable, Equatable {
        case invalidURL(String)
        case unsupportedScheme(String)
        case invalidHTTPResponse
        case invalidStatusCode(Int)
        case missingAcceptHeader
        case invalidAcceptHeader
        case disconnected
        case unsupportedFrameLength(UInt64)
        case malformedFrame
        case connectTimeout
        case pingTimeout

        var errorDescription: String? {
            switch self {
            case .invalidURL(let url):
                return "Invalid WebSocket URL: \(url)"
            case .unsupportedScheme(let scheme):
                return "Unsupported WebSocket scheme: \(scheme)"
            case .invalidHTTPResponse:
                return "Invalid WebSocket handshake response"
            case .invalidStatusCode(let statusCode):
                return "Unexpected WebSocket handshake status code: \(statusCode)"
            case .missingAcceptHeader:
                return "WebSocket handshake missing Sec-WebSocket-Accept"
            case .invalidAcceptHeader:
                return "WebSocket handshake returned an invalid Sec-WebSocket-Accept header"
            case .disconnected:
                return "WebSocket is disconnected"
            case .unsupportedFrameLength(let length):
                return "WebSocket frame length is unsupported: \(length)"
            case .malformedFrame:
                return "Malformed WebSocket frame"
            case .connectTimeout:
                return "WebSocket connection timed out"
            case .pingTimeout:
                return "WebSocket heartbeat timed out"
            }
        }
    }

    private static let handshakeGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    private static let headerDelimiter = Data([13, 10, 13, 10])

    private let url: URL
    private let headers: [String: String]
    private let connectTimeoutNanoseconds: UInt64
    private let queue = DispatchQueue(label: "AgentHostProtocolClient.NWConnectionWebSocketTransport")

    private var connection: NWConnection?
    private var connectTask: Task<Void, Error>?
    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var pingContinuation: CheckedContinuation<Void, Error>?
    private var pingTimeoutTask: Task<Void, Never>?
    private var readBuffer = Data()
    private var fragmentedOpcode: UInt8?
    private var fragmentedPayload = Data()
    private var handshakeComplete = false
    private var closed = false

    /// Creates a native WebSocket transport.
    ///
    /// - Parameters:
    ///   - url: A `ws://` or `wss://` endpoint.
    ///   - headers: Additional HTTP headers for the WebSocket upgrade.
    ///   - connectTimeoutNanoseconds: Maximum time to wait for `NWConnection`
    ///     to reach `.ready` before failing the connection attempt.
    public init(
        url: URL,
        headers: [String: String] = [:],
        connectTimeoutNanoseconds: UInt64 = 20_000_000_000
    ) {
        self.url = url
        self.headers = headers
        self.connectTimeoutNanoseconds = connectTimeoutNanoseconds
    }

    public func send(_ message: TransportMessage) async throws {
        do {
            try await connectIfNeeded()
            switch message {
            case .text(let text):
                try await sendFrame(opcode: 0x1, payload: Data(text.utf8))
            case .binary(let data):
                try await sendFrame(opcode: 0x2, payload: data)
            case .parsed(let parsed):
                try await send(TransportMessage.encode(parsed))
            }
        } catch {
            throw mapError(error)
        }
    }

    public func recv() async throws -> TransportMessage? {
        do {
            try await connectIfNeeded()
            while true {
                switch try await nextMessageFromBuffer() {
                case .message(let message):
                    switch message {
                    case .text(let text): return .text(text)
                    case .binary(let data): return .binary(data)
                    }
                case .close:
                    try await closeAfterPeerClose()
                    return nil
                case .none:
                    let chunk = try await receiveRaw()
                    if chunk.isEmpty {
                        markClosed()
                        return nil
                    }
                    readBuffer.append(chunk)
                }
            }
        } catch where closed {
            return nil
        } catch {
            throw mapError(error)
        }
    }

    public func close() async throws {
        guard !closed else { return }
        closed = true
        connectTask?.cancel()
        connectTask = nil

        if let connection {
            if handshakeComplete {
                try? await sendRaw(makeClientFrame(opcode: 0x8, payload: Data()))
            }
            connection.cancel()
        }

        resetConnectionState()
        resolveConnectContinuation(with: .failure(NativeWebSocketError.disconnected))
        resolvePendingPing(with: .failure(NativeWebSocketError.disconnected))
    }

    /// Send a WebSocket ping and wait for the matching pong.
    ///
    /// `AHPClient` calls this when `AHPClientConfig.keepAlive` is enabled.
    /// Other callers may also opt in and decide how ping failures should
    /// influence their own reconnect policy.
    public func sendPing(timeout: Duration) async throws {
        do {
            try await connectIfNeeded()
            guard pingContinuation == nil else { return }

            let pingFrame = makeClientFrame(opcode: 0x9, payload: Data())
            try await withCheckedThrowingContinuation { continuation in
                pingContinuation = continuation
                pingTimeoutTask?.cancel()
                pingTimeoutTask = Task { [weak self] in
                    try? await Task.sleep(for: timeout)
                    await self?.timeoutPendingPing()
                }

                Task { [weak self] in
                    do {
                        try await self?.sendRaw(pingFrame)
                    } catch {
                        await self?.resolvePendingPing(with: .failure(error))
                    }
                }
            }
        } catch {
            throw mapError(error)
        }
    }

    public func sendPing(timeoutNanoseconds: UInt64 = 5_000_000_000) async throws {
        try await sendPing(timeout: .nanoseconds(Int64(clamping: timeoutNanoseconds)))
    }

    // MARK: - Connection lifecycle

    private func connectIfNeeded() async throws {
        if closed { throw TransportError.closed }
        if handshakeComplete { return }
        if let connectTask {
            try await connectTask.value
            return
        }

        let task = Task { try await self.openConnectionAndHandshake() }
        connectTask = task
        do {
            try await task.value
            connectTask = nil
        } catch {
            connectTask = nil
            throw error
        }
    }

    private func openConnectionAndHandshake() async throws {
        guard !closed else { throw TransportError.closed }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let host = components.host else {
            throw NativeWebSocketError.invalidURL(url.absoluteString)
        }

        let scheme = (components.scheme ?? "").lowercased()
        guard scheme == "ws" || scheme == "wss" else {
            throw NativeWebSocketError.unsupportedScheme(scheme)
        }

        let defaultPort = scheme == "wss" ? 443 : 80
        let portValue = components.port ?? defaultPort
        guard let port = NWEndpoint.Port(rawValue: UInt16(portValue)) else {
            throw NativeWebSocketError.invalidURL(url.absoluteString)
        }

        let parameters: NWParameters = {
            if scheme == "wss" {
                return NWParameters(tls: NWProtocolTLS.Options(), tcp: NWProtocolTCP.Options())
            }
            return NWParameters.tcp
        }()

        let connection = NWConnection(
            host: NWEndpoint.Host(host),
            port: port,
            using: parameters
        )
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            Task { await self.handleConnectionState(state) }
        }

        self.connection = connection
        readBuffer.removeAll(keepingCapacity: false)
        fragmentedOpcode = nil
        fragmentedPayload.removeAll(keepingCapacity: false)
        handshakeComplete = false

        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                connectContinuation = continuation
                connection.start(queue: queue)
                let timeout = connectTimeoutNanoseconds
                Task { [weak self] in
                    try? await Task.sleep(nanoseconds: timeout)
                    await self?.timeoutConnectIfPending(for: connection)
                }
            }

            let path = buildRequestPath(from: components)
            let hostHeader = buildHostHeader(host: host, explicitPort: components.port)
            try await performHandshake(path: path, hostHeader: hostHeader)
            handshakeComplete = true
        } catch {
            connection.cancel()
            self.connection = nil
            throw error
        }
    }

    private func handleConnectionState(_ state: NWConnection.State) {
        switch state {
        case .ready:
            resolveConnectContinuation(with: .success(()))
        case .failed(let error):
            resolveConnectContinuation(with: .failure(error))
        case .waiting:
            break
        case .cancelled:
            resolveConnectContinuation(with: .failure(NativeWebSocketError.disconnected))
        default:
            break
        }
    }

    private func resolveConnectContinuation(with result: Result<Void, Error>) {
        guard let continuation = connectContinuation else { return }
        connectContinuation = nil
        continuation.resume(with: result)
    }

    private func timeoutConnectIfPending(for connection: NWConnection) {
        guard connectContinuation != nil, self.connection === connection else { return }
        connection.cancel()
        self.connection = nil
        resolveConnectContinuation(with: .failure(NativeWebSocketError.connectTimeout))
    }

    private func resetConnectionState() {
        connection = nil
        handshakeComplete = false
        readBuffer.removeAll(keepingCapacity: false)
        fragmentedOpcode = nil
        fragmentedPayload.removeAll(keepingCapacity: false)
    }

    private func markClosed() {
        closed = true
        connection?.cancel()
        resetConnectionState()
        resolveConnectContinuation(with: .failure(NativeWebSocketError.disconnected))
        resolvePendingPing(with: .failure(NativeWebSocketError.disconnected))
    }

    // MARK: - Handshake

    private func performHandshake(path: String, hostHeader: String) async throws {
        let secKey = makeSecWebSocketKey()
        let expectedAccept = expectedAcceptValue(for: secKey)

        var requestLines = [
            "GET \(path) HTTP/1.1",
            "Host: \(hostHeader)",
            "Upgrade: websocket",
            "Connection: Upgrade",
            "Sec-WebSocket-Key: \(secKey)",
            "Sec-WebSocket-Version: 13",
        ]
        for (name, value) in headers {
            requestLines.append("\(name): \(value)")
        }
        requestLines.append("")
        requestLines.append("")

        try await sendRaw(Data(requestLines.joined(separator: "\r\n").utf8))

        let responseHeaderData = try await readHeaderBlock()
        guard let responseHeader = String(data: responseHeaderData, encoding: .utf8) else {
            throw NativeWebSocketError.invalidHTTPResponse
        }

        let lines = responseHeader
            .split(separator: "\r\n", omittingEmptySubsequences: false)
            .map(String.init)
        guard let statusLine = lines.first else {
            throw NativeWebSocketError.invalidHTTPResponse
        }

        let statusParts = statusLine.split(separator: " ", omittingEmptySubsequences: true)
        guard statusParts.count >= 2, let statusCode = Int(statusParts[1]) else {
            throw NativeWebSocketError.invalidHTTPResponse
        }
        guard statusCode == 101 else {
            throw NativeWebSocketError.invalidStatusCode(statusCode)
        }

        var responseHeaders: [String: String] = [:]
        for line in lines.dropFirst() where !line.isEmpty {
            guard let delimiter = line.firstIndex(of: ":") else { continue }
            let name = String(line[..<delimiter]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = String(line[line.index(after: delimiter)...]).trimmingCharacters(in: .whitespacesAndNewlines)
            if let existing = responseHeaders[name], !existing.isEmpty {
                responseHeaders[name] = "\(existing),\(value)"
            } else {
                responseHeaders[name] = value
            }
        }

        guard responseHeaders["upgrade"]?.lowercased() == "websocket" else {
            throw NativeWebSocketError.invalidHTTPResponse
        }
        guard headerContainsToken(responseHeaders["connection"] ?? "", token: "upgrade") else {
            throw NativeWebSocketError.invalidHTTPResponse
        }
        guard let acceptHeader = responseHeaders["sec-websocket-accept"] else {
            throw NativeWebSocketError.missingAcceptHeader
        }
        guard acceptHeader == expectedAccept else {
            throw NativeWebSocketError.invalidAcceptHeader
        }
    }

    private func buildHostHeader(host: String, explicitPort: Int?) -> String {
        guard let explicitPort else { return host }
        if host.contains(":") && !host.hasPrefix("[") {
            return "[\(host)]:\(explicitPort)"
        }
        return "\(host):\(explicitPort)"
    }

    private func buildRequestPath(from components: URLComponents) -> String {
        let path = components.percentEncodedPath.isEmpty ? "/" : components.percentEncodedPath
        let query = components.percentEncodedQuery.map { "?\($0)" } ?? ""
        return path + query
    }

    private func makeSecWebSocketKey() -> String {
        var random = [UInt8](repeating: 0, count: 16)
        for index in random.indices {
            random[index] = UInt8.random(in: 0 ... 255)
        }
        return Data(random).base64EncodedString()
    }

    private func expectedAcceptValue(for secKey: String) -> String {
        let combined = secKey + Self.handshakeGUID
        let digest = Insecure.SHA1.hash(data: Data(combined.utf8))
        return Data(digest).base64EncodedString()
    }

    private func headerContainsToken(_ header: String, token: String) -> Bool {
        let normalizedToken = token.lowercased()
        return header
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .contains(normalizedToken)
    }

    private func readHeaderBlock() async throws -> Data {
        while true {
            if let range = readBuffer.range(of: Self.headerDelimiter) {
                let headerEnd = range.upperBound
                let headerData = readBuffer[..<headerEnd]
                readBuffer.removeSubrange(..<headerEnd)
                return Data(headerData)
            }

            let chunk = try await receiveRaw()
            if chunk.isEmpty { throw NativeWebSocketError.invalidHTTPResponse }
            readBuffer.append(chunk)
        }
    }

    // MARK: - Frames

    private func nextMessageFromBuffer() async throws -> BufferRead {
        guard let frame = try parseFrameFromBuffer() else { return .none }

        switch frame.opcode {
        case 0x0:
            guard let opcode = fragmentedOpcode else { throw NativeWebSocketError.malformedFrame }
            fragmentedPayload.append(frame.payload)
            if frame.fin {
                let completePayload = fragmentedPayload
                fragmentedOpcode = nil
                fragmentedPayload.removeAll(keepingCapacity: false)
                return .message(try completeMessage(forOpcode: opcode, payload: completePayload))
            }
            return .none
        case 0x1, 0x2:
            if frame.fin {
                return .message(try completeMessage(forOpcode: frame.opcode, payload: frame.payload))
            }
            fragmentedOpcode = frame.opcode
            fragmentedPayload = frame.payload
            return .none
        case 0x8:
            return .close
        case 0x9:
            try await sendRaw(makeClientFrame(opcode: 0xA, payload: frame.payload))
            return .none
        case 0xA:
            resolvePendingPing(with: .success(()))
            return .none
        default:
            return .none
        }
    }

    private func closeAfterPeerClose() async throws {
        if handshakeComplete {
            try? await sendRaw(makeClientFrame(opcode: 0x8, payload: Data()))
        }
        markClosed()
    }

    private func completeMessage(forOpcode opcode: UInt8, payload: Data) throws -> CompleteMessage {
        switch opcode {
        case 0x1:
            guard let text = String(data: payload, encoding: .utf8) else {
                throw NativeWebSocketError.malformedFrame
            }
            return .text(text)
        case 0x2:
            return .binary(payload)
        default:
            throw NativeWebSocketError.malformedFrame
        }
    }

    private func parseFrameFromBuffer() throws -> ParsedFrame? {
        guard readBuffer.count >= 2 else { return nil }

        let firstByte = readBuffer[0]
        let secondByte = readBuffer[1]
        let fin = (firstByte & 0x80) != 0
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

        guard payloadLength <= UInt64(Int.max) else {
            throw NativeWebSocketError.unsupportedFrameLength(payloadLength)
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

        return ParsedFrame(fin: fin, opcode: opcode, payload: payload)
    }

    private func sendFrame(opcode: UInt8, payload: Data) async throws {
        guard handshakeComplete else { throw NativeWebSocketError.disconnected }
        try await sendRaw(makeClientFrame(opcode: opcode, payload: payload))
    }

    private func makeClientFrame(opcode: UInt8, payload: Data) -> Data {
        var frame = Data()
        frame.append(0x80 | (opcode & 0x0F))

        let payloadCount = payload.count
        let maskBit: UInt8 = 0x80
        if payloadCount <= 125 {
            frame.append(maskBit | UInt8(payloadCount))
        } else if payloadCount <= 65_535 {
            frame.append(maskBit | 126)
            frame.append(UInt8((payloadCount >> 8) & 0xFF))
            frame.append(UInt8(payloadCount & 0xFF))
        } else {
            frame.append(maskBit | 127)
            let length = UInt64(payloadCount)
            for shift in stride(from: 56, through: 0, by: -8) {
                frame.append(UInt8((length >> UInt64(shift)) & 0xFF))
            }
        }

        var maskKey = [UInt8](repeating: 0, count: 4)
        for index in maskKey.indices {
            maskKey[index] = UInt8.random(in: 0 ... 255)
        }
        frame.append(contentsOf: maskKey)

        var maskedPayload = [UInt8](payload)
        for i in maskedPayload.indices {
            maskedPayload[i] ^= maskKey[i % 4]
        }
        frame.append(contentsOf: maskedPayload)
        return frame
    }

    private func sendRaw(_ data: Data) async throws {
        guard let connection else { throw NativeWebSocketError.disconnected }
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

    private func receiveRaw() async throws -> Data {
        guard let connection else { throw NativeWebSocketError.disconnected }
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
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
                    continuation.resume(throwing: NativeWebSocketError.malformedFrame)
                }
            }
        }
    }

    // MARK: - Ping

    private func resolvePendingPing(with result: Result<Void, Error>) {
        pingTimeoutTask?.cancel()
        pingTimeoutTask = nil
        guard let continuation = pingContinuation else { return }
        pingContinuation = nil
        continuation.resume(with: result)
    }

    private func timeoutPendingPing() {
        resolvePendingPing(with: .failure(NativeWebSocketError.pingTimeout))
    }

    // MARK: - Errors

    private func mapError(_ error: Error) -> Error {
        if let transportError = error as? TransportError {
            return transportError
        }
        if let nativeError = error as? NativeWebSocketError {
            switch nativeError {
            case .disconnected:
                return TransportError.closed
            case .invalidURL, .unsupportedScheme, .invalidHTTPResponse, .invalidStatusCode,
                 .missingAcceptHeader, .invalidAcceptHeader, .unsupportedFrameLength,
                 .malformedFrame:
                return TransportError.protocol(nativeError.localizedDescription)
            case .connectTimeout, .pingTimeout:
                return TransportError.io(nativeError.localizedDescription)
            }
        }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return TransportError.closed
        }
        return TransportError.io(nsError.localizedDescription)
    }
}