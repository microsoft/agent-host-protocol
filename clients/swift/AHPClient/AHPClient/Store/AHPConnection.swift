import AgentHostProtocol
import CryptoKit
import Foundation
import Network

// MARK: - AHPConnection

protocol AHPWebSocketTransport: Actor {
    func connect() async throws
    func send(_ data: Data) async throws
    func sendPing(timeoutNanoseconds: UInt64) async throws
    func receiveMessage() async throws -> Data
    func close() async
}

typealias AHPWebSocketFactory = @Sendable (URL, [String: String]) -> any AHPWebSocketTransport

/// WebSocket-based JSON-RPC transport for communicating with an Agent Host server.
///
/// Handles the initialize/reconnect handshake, request/response correlation,
/// and dispatches incoming server actions and notifications to the store.
actor AHPConnection {

    // MARK: - Types

    /// Errors specific to the AHP connection.
    enum ConnectionError: Error, LocalizedError {
        case notConnected
        case requestFailed(code: Int, message: String)
        case decodingFailed(String)
        case timeout
        case connectTimeout

        var errorDescription: String? {
            switch self {
            case .notConnected: "Not connected to server"
            case .requestFailed(let code, let msg): "Server error \(code): \(msg)"
            case .decodingFailed(let detail): "Decoding failed: \(detail)"
            case .timeout: "Request timed out"
            case .connectTimeout: "Could not reach server"
            }
        }
    }

    enum ConnectionState: Sendable {
        case disconnected
        case connecting
        case connected
        case reconnecting
    }

    // MARK: - Properties

    nonisolated let clientId: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let webSocketFactory: AHPWebSocketFactory
    private let requestTimeoutNanoseconds: UInt64
    private let heartbeatIntervalNanoseconds: UInt64
    private let heartbeatTimeoutNanoseconds: UInt64

    private var webSocket: (any AHPWebSocketTransport)?
    private var nextRequestId = 1
    private var pendingRequests: [Int: CheckedContinuation<Data, Error>] = [:]
    private var requestTimeoutTasks: [Int: Task<Void, Never>] = [:]
    /// Last `serverSeq` received from the server. Internal so tests can inspect it.
    var serverSeq = 0
    private var subscriptions: [String] = []
    private var pendingOutboundActions: [PendingOutboundAction] = []
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?

    private(set) var state: ConnectionState = .disconnected

    /// `true` when there is enough state to attempt a `reconnect` handshake rather than
    /// a full `initialize`. Requires at least one prior successful connection.
    var canReconnect: Bool { serverSeq > 0 && !subscriptions.isEmpty }

    /// Callback invoked on the MainActor when a server action envelope arrives.
    var onAction: (@MainActor (ActionEnvelope) -> Void)?
    /// Callback invoked on the MainActor when a protocol notification arrives.
    var onNotification: (@MainActor (ProtocolNotification) -> Void)?
    /// Callback invoked on the MainActor when the connection state changes.
    var onStateChange: (@MainActor (ConnectionState) -> Void)?
    /// Callback invoked on the MainActor when the transport drops unexpectedly (not from a
    /// deliberate `disconnect()` call). Use this to trigger a reconnect attempt.
    var onUnexpectedDisconnect: (@MainActor () -> Void)?

    /// Generic JSON-RPC success response wrapper (must be top-level in the actor
    /// because Swift does not allow nested types inside generic functions).
    private struct RpcSuccessResponse<R: Codable>: Codable {
        let id: Int
        let result: R
    }

    private struct MessageProbe: Codable {
        /// Numeric id, if present. Decoded tolerantly: if `id` is a string or
        /// any non-Int type, this is `nil` (the message is treated as having
        /// no trackable id rather than failing the entire probe).
        let id: Int?
        let method: String?

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            self.id = try? container.decodeIfPresent(Int.self, forKey: .id)
            self.method = try container.decodeIfPresent(String.self, forKey: .method)
        }

        private enum CodingKeys: String, CodingKey {
            case id
            case method
        }
    }

    private struct PendingOutboundAction: Sendable {
        let clientSeq: Int
        let action: StateAction
    }

    // MARK: - Init

    init(
        clientId: String = "ahp-app-\(UUID().uuidString.prefix(8))",
        requestTimeoutNanoseconds: UInt64 = 15_000_000_000,
        heartbeatIntervalNanoseconds: UInt64 = 10_000_000_000,
        heartbeatTimeoutNanoseconds: UInt64 = 5_000_000_000,
        webSocketFactory: @escaping AHPWebSocketFactory = { url, headers in
            NativeWebSocketConnection(url: url, additionalHeaders: headers)
        }
    ) {
        self.clientId = clientId
        self.requestTimeoutNanoseconds = requestTimeoutNanoseconds
        self.heartbeatIntervalNanoseconds = heartbeatIntervalNanoseconds
        self.heartbeatTimeoutNanoseconds = heartbeatTimeoutNanoseconds
        self.webSocketFactory = webSocketFactory
    }

    func setOnAction(_ callback: @escaping @MainActor (ActionEnvelope) -> Void) {
        onAction = callback
    }

    func setOnNotification(_ callback: @escaping @MainActor (ProtocolNotification) -> Void) {
        onNotification = callback
    }

    func setOnStateChange(_ callback: @escaping @MainActor (ConnectionState) -> Void) {
        onStateChange = callback
    }

    func setOnUnexpectedDisconnect(_ callback: @escaping @MainActor () -> Void) {
        onUnexpectedDisconnect = callback
    }

    // MARK: - Connect

    /// Opens a WebSocket to the given server URL, performs the AHP `initialize` handshake,
    /// and returns the resulting snapshots.
    @discardableResult
    func connect(to url: URL, headers: [String: String] = [:]) async throws -> InitializeResult {
        await setState(.connecting)

        let ws = webSocketFactory(url, headers)
        do {
            try await ws.connect()
            await installWebSocket(ws)

            let params = InitializeParams(
                protocolVersion: 1,
                clientId: clientId,
                initialSubscriptions: ["agenthost:/root"]
            )
            let result: InitializeResult = try await sendRequest(method: "initialize", params: params)
            serverSeq = result.serverSeq
            subscriptions = ["agenthost:/root"]

            await setState(.connected)
            try await replayPendingOutboundActions()
            startHeartbeat()
            return result
        } catch {
            await cleanupAfterFailure(using: ws, error: error)
            throw error
        }
    }

    /// Cleanly disconnects from the server.
    func disconnect() async {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        receiveTask?.cancel()
        receiveTask = nil

        let ws = webSocket
        webSocket = nil
        cancelAllRequestTimeouts()
        failAllRequests(error: ConnectionError.notConnected)

        if let ws {
            await ws.close()
        }

        serverSeq = 0
        subscriptions.removeAll()
        pendingOutboundActions.removeAll()
        await setState(.disconnected)
    }

    // MARK: - Reconnect

    /// Re-establishes the WebSocket transport and performs the AHP `reconnect` handshake,
    /// passing `clientId`, `lastSeenServerSeq`, and the current subscription list so the server
    /// can either replay missed actions or return fresh snapshots.
    ///
    /// After this call succeeds the connection is back in `.connected` state and the caller
    /// is responsible for applying the returned `ReconnectResult` to the app state.
    @discardableResult
    func reconnect(to url: URL, headers: [String: String] = [:]) async throws -> ReconnectResult {
        await setState(.reconnecting)

        let ws = webSocketFactory(url, headers)
        do {
            try await ws.connect()
            await installWebSocket(ws)

            let params = ReconnectParams(
                clientId: clientId,
                lastSeenServerSeq: serverSeq,
                subscriptions: subscriptions
            )
            let result: ReconnectResult = try await sendRequest(method: "reconnect", params: params)

            switch result {
            case .replay(let r):
                if let last = r.actions.last {
                    serverSeq = last.serverSeq
                }
            case .snapshot(let r):
                serverSeq = r.snapshots.map(\.fromSeq).max() ?? serverSeq
            }

            acknowledgeOutboundActions(in: result)
            await setState(.connected)
            try await replayPendingOutboundActions()
            startHeartbeat()
            return result
        } catch {
            await cleanupAfterFailure(using: ws, error: error)
            throw error
        }
    }

    // MARK: - Commands

    /// Subscribe to a resource URI and return the snapshot.
    func subscribe(resource: String) async throws -> Snapshot {
        let result: SubscribeResult = try await sendRequest(
            method: "subscribe",
            params: SubscribeParams(resource: resource)
        )
        if !subscriptions.contains(resource) {
            subscriptions.append(resource)
        }
        return result.snapshot
    }

    /// Unsubscribe from a resource URI (fire-and-forget notification).
    func unsubscribe(resource: String) async throws {
        subscriptions.removeAll { $0 == resource }
        let notification = AHPClientNotifications.unsubscribe(
            params: UnsubscribeParams(resource: resource)
        )
        try await sendNotification(notification)
    }

    /// Create a new session.
    func createSession(params: CreateSessionParams) async throws {
        let _: AnyCodable? = try await sendRequest(method: "createSession", params: params)
    }

    /// Dispose a session.
    func disposeSession(session: String) async throws {
        let _: AnyCodable? = try await sendRequest(
            method: "disposeSession",
            params: DisposeSessionParams(session: session)
        )
    }

    /// Create a new terminal on the server.
    func createTerminal(params: CreateTerminalParams) async throws {
        let _: AnyCodable? = try await sendRequest(method: "createTerminal", params: params)
    }

    /// Dispose a terminal and kill its process.
    func disposeTerminal(terminal: String) async throws {
        let _: AnyCodable? = try await sendRequest(
            method: "disposeTerminal",
            params: DisposeTerminalParams(terminal: terminal)
        )
    }

    /// List sessions.
    func listSessions() async throws -> [SessionSummary] {
        let result: ListSessionsResult = try await sendRequest(
            method: "listSessions",
            params: ListSessionsParams()
        )
        return result.items
    }

    /// Fetch turns for a session.
    func fetchTurns(session: String, before: String? = nil, limit: Int? = nil) async throws -> FetchTurnsResult {
        try await sendRequest(
            method: "fetchTurns",
            params: FetchTurnsParams(session: session, before: before, limit: limit)
        )
    }

    /// Fetch binary/text content by URI.
    func fetchContent(uri: String, encoding: ContentEncoding? = nil) async throws -> ResourceReadResult {
        try await sendRequest(
            method: "resourceRead",
            params: ResourceReadParams(uri: uri, encoding: encoding)
        )
    }

    /// Dispatch a state action to the server.
    func dispatchAction(_ action: StateAction) async throws {
        let seq = nextSeq()
        pendingOutboundActions.append(PendingOutboundAction(clientSeq: seq, action: action))
        try await sendDispatchAction(clientSeq: seq, action: action)
    }

    // MARK: - Private: JSON-RPC

    private func nextSeq() -> Int {
        let id = nextRequestId
        nextRequestId += 1
        return id
    }

    private func sendRequest<P: Codable & Sendable, R: Codable & Sendable>(
        method: String,
        params: P
    ) async throws -> R {
        guard let ws = webSocket else { throw ConnectionError.notConnected }

        let id = nextSeq()
        let request = JsonRpcRequest(id: id, method: method, params: params)
        let data = try encoder.encode(request)

        let responseData: Data = try await withCheckedThrowingContinuation { continuation in
            pendingRequests[id] = continuation
            requestTimeoutTasks[id] = Task { [weak self] in
                try? await Task.sleep(nanoseconds: requestTimeoutNanoseconds)
                await self?.handleRequestTimeout(id: id)
            }
            Task { [weak self] in
                do {
                    try await ws.send(data)
                } catch {
                    await self?.handleTransportFailure(error)
                }
            }
        }

        if let success = try? decoder.decode(RpcSuccessResponse<R>.self, from: responseData) {
            return success.result
        }

        let errorResp = try? decoder.decode(JsonRpcErrorResponse.self, from: responseData)
        if let err = errorResp?.error {
            throw ConnectionError.requestFailed(code: err.code, message: err.message)
        }

        throw ConnectionError.decodingFailed("Could not decode response for \(method)")
    }

    private func sendNotification<P: Codable & Sendable>(_ notification: JsonRpcNotification<P>) async throws {
        guard let ws = webSocket else { throw ConnectionError.notConnected }
        let data = try encoder.encode(notification)
        do {
            try await ws.send(data)
        } catch {
            await handleTransportFailure(error)
            throw error
        }
    }

    private func sendDispatchAction(clientSeq: Int, action: StateAction) async throws {
        let notification = AHPClientNotifications.dispatchAction(
            params: DispatchActionParams(clientSeq: clientSeq, action: action)
        )
        try await sendNotification(notification)
    }

    private func failRequest(id: Int, error: Error) {
        cancelRequestTimeout(id: id)
        pendingRequests.removeValue(forKey: id)?.resume(throwing: error)
    }

    private func failAllRequests(error: Error) {
        cancelAllRequestTimeouts()
        let continuations = pendingRequests.values
        pendingRequests.removeAll()
        for continuation in continuations {
            continuation.resume(throwing: error)
        }
    }

    // MARK: - Private: Receive Loop

    private func startReceiving() {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    guard let ws = await self.webSocket else { break }
                    let data = try await ws.receiveMessage()
                    await self.handleMessage(data)
                } catch {
                    if !Task.isCancelled {
                        await self.handleTransportFailure(error)
                    }
                    break
                }
            }
        }
    }

    private func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                let interval = await self.heartbeatIntervalNanoseconds
                try? await Task.sleep(nanoseconds: interval)
                if Task.isCancelled { break }
                guard let ws = await self.webSocket else { break }
                do {
                    let heartbeatTimeout = await self.heartbeatTimeoutNanoseconds
                    try await ws.sendPing(timeoutNanoseconds: heartbeatTimeout)
                } catch {
                    if !Task.isCancelled {
                        await self.handleTransportFailure(error)
                    }
                    break
                }
            }
        }
    }

    private func handleMessage(_ data: Data) {
        guard let probe = try? decoder.decode(MessageProbe.self, from: data) else {
            print("[AHP] WARNING: Failed to decode message probe from data: \(String(data: data.prefix(500), encoding: .utf8) ?? "<binary>")")
            return
        }

        if let id = probe.id, probe.method == nil {
            cancelRequestTimeout(id: id)
            if let continuation = pendingRequests.removeValue(forKey: id) {
                continuation.resume(returning: data)
            }
        } else if let method = probe.method {
            switch method {
            case "action":
                do {
                    let envelope = try decoder.decode(
                        JsonRpcNotification<ActionEnvelope>.self,
                        from: data
                    )
                    let params = envelope.params
                    serverSeq = params.serverSeq
                    acknowledgeOutboundAction(from: params)
                    if let callback = onAction {
                        Task { @MainActor in callback(params) }
                    }
                } catch {
                    print("[AHP] ERROR: Failed to decode action envelope: \(error)")
                    print("[AHP]   Raw data: \(String(data: data.prefix(1000), encoding: .utf8) ?? "<binary>")")
                }
            case "notification":
                do {
                    let note = try decoder.decode(
                        JsonRpcNotification<NotificationMethodParams>.self,
                        from: data
                    )
                    if let callback = onNotification {
                        let notification = note.params.notification
                        Task { @MainActor in callback(notification) }
                    }
                } catch {
                    print("[AHP] ERROR: Failed to decode notification: \(error)")
                    print("[AHP]   Raw data: \(String(data: data.prefix(1000), encoding: .utf8) ?? "<binary>")")
                }
            default:
                print("[AHP] Unknown method: \(method)")
            }
        }
    }

    private func handleRequestTimeout(id: Int) async {
        guard pendingRequests[id] != nil else { return }
        await handleTransportFailure(ConnectionError.timeout)
    }

    private func cancelRequestTimeout(id: Int) {
        requestTimeoutTasks.removeValue(forKey: id)?.cancel()
    }

    private func cancelAllRequestTimeouts() {
        let tasks = requestTimeoutTasks.values
        requestTimeoutTasks.removeAll()
        for task in tasks {
            task.cancel()
        }
    }

    private func installWebSocket(_ ws: any AHPWebSocketTransport) async {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        receiveTask?.cancel()
        receiveTask = nil

        if let current = webSocket,
           !sameTransport(current, ws) {
            webSocket = nil
            await current.close()
        }

        webSocket = ws
        startReceiving()
    }

    private func replayPendingOutboundActions() async throws {
        for pending in pendingOutboundActions {
            try await sendDispatchAction(clientSeq: pending.clientSeq, action: pending.action)
        }
    }

    private func acknowledgeOutboundActions(in result: ReconnectResult) {
        guard case .replay(let replay) = result else { return }
        for envelope in replay.actions {
            acknowledgeOutboundAction(from: envelope)
        }
    }

    private func acknowledgeOutboundAction(from envelope: ActionEnvelope) {
        guard let origin = envelope.origin,
              origin.clientId == clientId else { return }
        pendingOutboundActions.removeAll { $0.clientSeq <= origin.clientSeq }
    }

    private func handleTransportFailure(_ error: Error) async {
        let shouldNotifyUnexpectedDisconnect = state == .connected

        heartbeatTask?.cancel()
        heartbeatTask = nil
        receiveTask?.cancel()
        receiveTask = nil

        let ws = webSocket
        webSocket = nil

        failAllRequests(error: error)

        if let ws {
            await ws.close()
        }

        await setState(.disconnected)

        if shouldNotifyUnexpectedDisconnect,
           let callback = onUnexpectedDisconnect {
            await MainActor.run { callback() }
        }
    }

    // MARK: - Private: State

    private func setState(_ newState: ConnectionState) async {
        state = newState
        if let callback = onStateChange {
            await MainActor.run { callback(newState) }
        }
    }

    private func cleanupAfterFailure(using ws: any AHPWebSocketTransport, error: Error) async {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        cancelAllRequestTimeouts()
        webSocket = nil
        failAllRequests(error: error)
        await ws.close()
        await setState(.disconnected)
    }

    private func sameTransport(_ lhs: any AHPWebSocketTransport, _ rhs: any AHPWebSocketTransport) -> Bool {
        ObjectIdentifier(lhs as AnyObject) == ObjectIdentifier(rhs as AnyObject)
    }
}

private actor NativeWebSocketConnection: AHPWebSocketTransport {
    private struct ParsedFrame {
        let fin: Bool
        let opcode: UInt8
        let payload: Data
    }

    private enum NativeWebSocketError: LocalizedError {
        case invalidURL(URL)
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
                return "Invalid WebSocket URL: \(url.absoluteString)"
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
    /// Maximum time we'll let `connect()` sit waiting for NWConnection to reach `.ready`
    /// before giving up. NWConnection's `.waiting` state can otherwise hang indefinitely.
    fileprivate static let connectTimeoutNanoseconds: UInt64 = 20_000_000_000

    private let url: URL
    private let additionalHeaders: [String: String]
    private let queue = DispatchQueue(label: "AHPClient.NativeWebSocketConnection")

    private var connection: NWConnection?
    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var pingContinuation: CheckedContinuation<Void, Error>?
    private var pingTimeoutTask: Task<Void, Never>?
    private var readBuffer = Data()
    private var fragmentedOpcode: UInt8?
    private var fragmentedPayload = Data()
    private var handshakeComplete = false

    init(url: URL, additionalHeaders: [String: String] = [:]) {
        self.url = url
        self.additionalHeaders = additionalHeaders
    }

    func connect() async throws {
        guard connection == nil else { return }

        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let host = components.host else {
            throw NativeWebSocketError.invalidURL(url)
        }

        let scheme = (components.scheme ?? "").lowercased()
        guard scheme == "ws" || scheme == "wss" else {
            throw NativeWebSocketError.unsupportedScheme(scheme)
        }

        let defaultPort = scheme == "wss" ? 443 : 80
        let portValue = components.port ?? defaultPort
        guard let port = NWEndpoint.Port(rawValue: UInt16(portValue)) else {
            throw NativeWebSocketError.invalidURL(url)
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

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connectContinuation = continuation
            connection.start(queue: queue)
            // Guard against the connection sitting in `.waiting` forever on a
            // dead network. NWConnection won't fail on its own in that case.
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: Self.connectTimeoutNanoseconds)
                await self?.timeoutConnectIfPending(for: connection)
            }
        }

        do {
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

    func send(_ data: Data) async throws {
        guard handshakeComplete else { throw NativeWebSocketError.disconnected }
        let frame = makeClientFrame(opcode: 0x1, payload: data)
        try await sendRaw(frame)
    }

    func sendPing(timeoutNanoseconds: UInt64) async throws {
        guard handshakeComplete else { throw NativeWebSocketError.disconnected }
        guard pingContinuation == nil else { return }

        let pingFrame = makeClientFrame(opcode: 0x9, payload: Data())
        try await withCheckedThrowingContinuation { continuation in
            pingContinuation = continuation
            pingTimeoutTask?.cancel()
            pingTimeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: timeoutNanoseconds)
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
    }

    func receiveMessage() async throws -> Data {
        guard handshakeComplete else { throw NativeWebSocketError.disconnected }

        while true {
            if let payload = try await nextMessageFromBuffer() {
                return payload
            }
            let chunk = try await receiveRaw()
            if chunk.isEmpty {
                throw NativeWebSocketError.disconnected
            }
            readBuffer.append(chunk)
        }
    }

    func close() async {
        guard let connection else { return }
        if handshakeComplete {
            let closeFrame = makeClientFrame(opcode: 0x8, payload: Data())
            try? await sendRaw(closeFrame)
        }
        connection.cancel()
        self.connection = nil
        handshakeComplete = false
        resolvePendingPing(with: .failure(NativeWebSocketError.disconnected))
        readBuffer.removeAll(keepingCapacity: false)
        fragmentedOpcode = nil
        fragmentedPayload.removeAll(keepingCapacity: false)
    }

    private func handleConnectionState(_ state: NWConnection.State) {
        switch state {
        case .ready:
            resolveConnectContinuation(with: .success(()))
        case .failed(let error):
            resolveConnectContinuation(with: .failure(error))
        case .waiting:
            // `.waiting` is a normal transient state on slow / constrained
            // networks — NWConnection retries internally and typically
            // progresses to `.ready`. Don't abort the handshake here; the
            // outer connect-timeout handles networks that never recover.
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

    /// Cancels a pending connect attempt that's been stuck (typically in
    /// `.waiting`) past `connectTimeoutNanoseconds`. No-op if the connect
    /// already resolved or if a different connection has since been started.
    private func timeoutConnectIfPending(for connection: NWConnection) {
        guard connectContinuation != nil, self.connection === connection else { return }
        connection.cancel()
        self.connection = nil
        resolveConnectContinuation(with: .failure(NativeWebSocketError.connectTimeout))
    }

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

        for (name, value) in additionalHeaders {
            requestLines.append("\(name): \(value)")
        }

        requestLines.append("")
        requestLines.append("")

        let request = requestLines.joined(separator: "\r\n")
        try await sendRaw(Data(request.utf8))

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

        let upgradeHeader = responseHeaders["upgrade"]?.lowercased() ?? ""
        guard upgradeHeader == "websocket" else {
            throw NativeWebSocketError.invalidHTTPResponse
        }

        let connectionHeader = responseHeaders["connection"] ?? ""
        guard headerContainsToken(connectionHeader, token: "upgrade") else {
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
            if chunk.isEmpty {
                throw NativeWebSocketError.invalidHTTPResponse
            }
            readBuffer.append(chunk)
        }
    }

    private func nextMessageFromBuffer() async throws -> Data? {
        guard let frame = try parseFrameFromBuffer() else { return nil }

        switch frame.opcode {
        case 0x0:
            guard let opcode = fragmentedOpcode else { return nil }
            fragmentedPayload.append(frame.payload)
            if frame.fin {
                let completePayload = fragmentedPayload
                fragmentedOpcode = nil
                fragmentedPayload.removeAll(keepingCapacity: false)
                return completePayloadForOpcode(opcode, payload: completePayload)
            }
            return nil
        case 0x1, 0x2:
            if frame.fin {
                return completePayloadForOpcode(frame.opcode, payload: frame.payload)
            }
            fragmentedOpcode = frame.opcode
            fragmentedPayload = frame.payload
            return nil
        case 0x8:
            throw NativeWebSocketError.disconnected
        case 0x9:
            let pong = makeClientFrame(opcode: 0xA, payload: frame.payload)
            try await sendRaw(pong)
            return nil
        case 0xA:
            resolvePendingPing(with: .success(()))
            return nil
        default:
            return nil
        }
    }

    private func completePayloadForOpcode(_ opcode: UInt8, payload: Data) -> Data {
        switch opcode {
        case 0x1, 0x2:
            return payload
        default:
            return payload
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
}
