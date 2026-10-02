import Foundation
import AgentHostProtocol

internal struct TcpEventReceiver: Sendable {
    let id: UInt64
    let stream: AsyncThrowingStream<ClientEvent, Error>
}

internal final class TcpClientSequences: @unchecked Sendable {
    private let lock = NSLock()
    private var next = 1

    func reserve() throws -> Int {
        lock.lock()
        defer { lock.unlock() }
        try TcpProtocol.safe(next)
        let value = next
        next += 1
        return value
    }

    func advance(past value: Int) {
        lock.lock()
        defer { lock.unlock() }
        next = max(next, value + 1)
    }

    var lastAssigned: Int {
        lock.lock()
        defer { lock.unlock() }
        return next - 1
    }
}

private final class TcpReadChunk {
    let data: Data
    var next: TcpReadChunk?
    init(_ data: Data) { self.data = data }
}

/// An owned TCP stream with pull-based receive credit and one writer at a time.
public actor TcpConnection {
    public nonisolated let resource: String
    public nonisolated let clientId: String
    public private(set) var state: TcpConnectionState
    public private(set) var appliedCheckpoint: Int
    public private(set) var isSuspended = false
    internal private(set) var lastClientSequence = 0
    internal private(set) var isClosed = false
    private var client: AHPClient
    private var pending: [Int: StateAction] = [:]
    private var head: TcpReadChunk?
    private var tail: TcpReadChunk?
    private var sentBytes: Int
    private var consumedBytes: Int
    private var writing = false
    private var reading = false
    private var ending = false
    private var closing = false
    private var released = false
    private var failure: Error?
    private var waiters: [UUID: CheckedContinuation<Void, Error>] = [:]
    private var pump: Task<Void, Never>?
    private var receiver: TcpEventReceiver?
    private var generation = 0
    private var onRelease: (@Sendable () async -> Void)?

    internal func whenReleased(_ callback: @escaping @Sendable () async -> Void) async {
        if released { await callback() }
        else { onRelease = callback }
    }

    internal init(client: AHPClient, clientId: String, snapshot: Snapshot, state: TcpConnectionState) {
        self.client = client
        self.clientId = clientId
        resource = snapshot.resource
        self.state = state
        appliedCheckpoint = snapshot.fromSeq
        sentBytes = state.input.receivedBytes
        consumedBytes = state.output.consumedBytes
    }

    deinit { pump?.cancel() }

    private func wake() {
        let current = waiters
        waiters.removeAll()
        for waiter in current.values { waiter.resume() }
    }

    private func changed() async throws {
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                if Task.isCancelled { continuation.resume(throwing: CancellationError()) }
                else { waiters[id] = continuation }
            }
        } onCancel: {
            Task { await self.cancelWaiter(id) }
        }
    }

    private func cancelWaiter(_ id: UUID) {
        waiters.removeValue(forKey: id)?.resume(throwing: CancellationError())
    }

    private func check() throws {
        try Task.checkCancellation()
        if let failure { throw failure }
    }

    private func enqueue(_ action: StateAction) throws -> (AHPClient, Int, StateAction)? {
        let seq = try client.tcpSequences.reserve()
        lastClientSequence = seq
        pending[seq] = action
        return isSuspended ? nil : (client, seq, action)
    }

    private func send(_ item: (AHPClient, Int, StateAction)?) async throws {
        guard let (sender, sequence, action) = item else { return }
        do {
            try await sender.dispatch(action, channel: resource, clientSeq: sequence)
        } catch {
            if await sender.connectionState == .disconnected {
                if sender === client { suspend() }
            }
            else { throw error }
        }
    }

    /// Returns one chunk and releases its credit. Nil means all output before EOF was drained.
    public func read() async throws -> Data? {
        try check()
        guard !reading else { throw TransportError.protocol("TCP permits one reader at a time") }
        reading = true
        defer { reading = false }
        while true {
            try check()
            if !isSuspended || isClosed {
                if let chunk = head {
                    let credit = isClosed ? nil : try enqueue(.tcpDataConsumed(TcpDataConsumedAction(
                        type: .tcpDataConsumed, consumedBytes: consumedBytes + chunk.data.count
                    )))
                    head = chunk.next
                    if head == nil { tail = nil }
                    consumedBytes += chunk.data.count
                    try await send(credit)
                    return chunk.data
                }
                if isClosed || state.hostClosed || state.output.eofAtBytes != nil { return nil }
            }
            try await changed()
        }
    }

    /// Writes in maximumChunkSize pieces and waits for credit; concurrent writers are rejected.
    public func write(_ data: Data) async throws {
        try check()
        guard !writing && !ending && !closing && !isClosed else { throw TransportError.protocol("TCP write requires an open, idle writer") }
        writing = true
        defer { writing = false; wake() }
        var offset = 0
        while offset < data.count {
            try check()
            guard !closing && !isClosed else { throw TransportError.closed }
            let credit = state.input.windowBytes - (sentBytes - state.input.consumedBytes)
            if isSuspended || credit == 0 { try await changed(); continue }
            let count = min(data.count - offset, min(credit, state.input.maximumChunkSize))
            let start = data.startIndex + offset
            try TcpProtocol.safe(sentBytes + count)
            let action = StateAction.tcpInput(TcpInputAction(
                type: .tcpInput, offset: sentBytes,
                data: data.subdata(in: start..<(start + count)).base64EncodedString()
            ))
            let message = try enqueue(action)
            sentBytes += count
            offset += count
            try await send(message)
        }
    }

    /// Waits until the destination consumes every reserved input byte.
    public func drain() async throws {
        while true {
            try check()
            if state.input.consumedBytes >= sentBytes { return }
            guard !isClosed else { throw TransportError.closed }
            try await changed()
        }
    }

    /// Half-closes input; output remains readable. Finish the current write first.
    public func end() async throws {
        try check()
        guard !writing && !closing && !isClosed else { throw TransportError.protocol("TCP end requires an open, idle writer") }
        if ending { return }
        ending = true
        var queued = false
        do {
            while isSuspended {
                try check()
                guard !closing && !isClosed else { throw TransportError.closed }
                try await changed()
            }
            let action = try enqueue(.tcpInputEof(TcpInputEofAction(type: .tcpInputEof, finalOffset: sentBytes)))
            queued = true
            try await send(action)
        } catch {
            if !queued { ending = false; wake() }
            throw error
        }
    }

    /// Stops input; retains crossing output and ownership until both sides close and drain.
    public func close() async throws {
        if closing || isClosed { return }
        closing = true
        wake()
        do {
            try await send(enqueue(.tcpClientClose(TcpClientCloseAction(type: .tcpClientClose))))
        } catch {
            try await fail(error)
            throw error
        }
    }

    private func finishClose() async throws {
        guard !isClosed, closing, state.clientClosed, state.hostClosed,
              state.input.consumedBytes >= sentBytes,
              state.output.consumedBytes >= state.output.receivedBytes,
              head == nil, pending.isEmpty else { return }
        isClosed = true
        wake()
        try await release()
    }

    /// Terminates all pending operations and releases the owned subscription once.
    public func dispose() async throws {
        try await fail(TransportError.closed)
    }

    internal func suspend() {
        if isClosed { return }
        isSuspended = true
        generation += 1
        pump?.cancel()
        pump = nil
        wake()
    }

    internal func bind(_ replacement: AHPClient) async throws {
        guard !isClosed else { throw TransportError.closed }
        let disconnected = await client.connectionState == .disconnected
        guard !isClosed else { throw TransportError.closed }
        guard isSuspended || disconnected else {
            throw TransportError.protocol("Suspend the previous transport before reconnecting TCP")
        }
        suspend()
        if let receiver { await client.cancelTcpReceiver(receiver.id) }
        receiver = nil
        lastClientSequence = max(lastClientSequence, client.tcpSequences.lastAssigned)
        try TcpProtocol.safe(lastClientSequence)
        if client !== replacement {
            try await replacement.trackTcpConnection(self)
            await client.forgetTcpConnection(self)
            if isClosed {
                await replacement.forgetTcpConnection(self)
                throw TransportError.closed
            }
        }
        client = replacement
    }

    internal func canRebind() async -> Bool {
        let disconnected = await client.connectionState == .disconnected
        return !isClosed && (isSuspended || disconnected)
    }

    internal func owner() -> AHPClient { client }

    internal func accept(_ envelope: ActionEnvelope, generation expected: Int? = nil) async throws {
        guard !isClosed, envelope.channel == resource, expected == nil || expected == generation else { return }
        do {
            try TcpProtocol.safe(envelope.serverSeq)
            let clientEcho: Bool
            switch envelope.action {
            case .tcpInput, .tcpDataConsumed, .tcpInputEof, .tcpClientClose, .tcpClientReset: clientEcho = true
            default: clientEcho = false
            }
            var acknowledgedSequence: Int?
            if clientEcho {
                guard let origin = envelope.origin, origin.clientId == clientId else {
                    throw TransportError.protocol("TCP client echo requires the owning client origin")
                }
                try TcpProtocol.safe(origin.clientSeq)
                guard origin.clientSeq <= lastClientSequence else {
                    throw TransportError.protocol("TCP client echo has an unassigned sequence")
                }
                acknowledgedSequence = origin.clientSeq
            }
            if envelope.serverSeq <= appliedCheckpoint { return }
            if let rejection = envelope.rejectionReason { throw TransportError.protocol(rejection) }
            let next = try tcpReducer(state: state, action: envelope.action)
            if let sequence = acknowledgedSequence {
                if let expected = pending[sequence] {
                    guard TcpProtocol.matchesEcho(expected, envelope.action) else {
                        throw TransportError.protocol("TCP client echo does not match its pending action")
                    }
                } else if next.input.receivedBytes != state.input.receivedBytes
                    || next.input.eofAtBytes != state.input.eofAtBytes
                    || next.output.consumedBytes != state.output.consumedBytes
                    || next.clientClosed != state.clientClosed
                    || (state.reset == nil && next.reset != nil) {
                    throw TransportError.protocol("TCP advancing client echo has no pending action")
                }
            }
            guard next.output.receivedBytes - consumedBytes <= next.output.windowBytes else {
                throw TransportError.protocol("TCP output exceeds locally released credit")
            }
            if case .tcpData(let action) = envelope.action, next.output.receivedBytes > state.output.receivedBytes {
                guard let bytes = Data(base64Encoded: action.data) else { throw TransportError.protocol("Invalid TCP base64") }
                let chunk = TcpReadChunk(bytes)
                if let tail { tail.next = chunk } else { head = chunk }
                tail = chunk
            }
            state = next
            appliedCheckpoint = envelope.serverSeq
            if let sequence = acknowledgedSequence { pending.removeValue(forKey: sequence) }
            wake()
        } catch {
            try await fail(error, reset: true)
            return
        }
        if let reset = state.reset { try await fail(TransportError.protocol("TCP reset: \(reset.reason)")) }
        else {
            if state.hostClosed { try await close() }
            try await finishClose()
        }
    }

    internal func resume(_ events: TcpEventReceiver) async throws {
        for (seq, action) in pending.sorted(by: { $0.key < $1.key }) {
            if isClosed { break }
            try await client.dispatch(action, channel: resource, clientSeq: seq)
        }
        await start(events)
    }

    internal func start(_ events: TcpEventReceiver) async {
        guard !isClosed else { await client.cancelTcpReceiver(events.id); return }
        isSuspended = false
        receiver = events
        generation += 1
        let current = generation
        pump = Task { [weak self] in
            do {
                for try await item in events.stream {
                    if Task.isCancelled { return }
                    if case .action(let envelope) = item.event { try await self?.accept(envelope, generation: current) }
                }
                await self?.suspendIfCurrent(current)
            } catch {
                if !Task.isCancelled { await self?.receiveFailure(error, generation: current) }
            }
        }
        if await client.connectionState == .disconnected, current == generation { suspend() }
        wake()
    }

    private func suspendIfCurrent(_ expected: Int) {
        if expected == generation { suspend() }
    }

    private func receiveFailure(_ error: Error, generation expected: Int) async {
        guard expected == generation else { return }
        do { try await fail(error, reset: true) }
        catch { failure = error; wake() }
    }

    internal func fail(_ error: Error, reset: Bool = false) async throws {
        guard !isClosed else { return }
        failure = error
        isClosed = true
        var message: (AHPClient, Int, StateAction)?
        do {
            if reset && !isSuspended { message = try enqueue(.tcpClientReset(TcpClientResetAction(type: .tcpClientReset, reason: .protocolError))) }
        } catch { failure = error }
        head = nil
        tail = nil
        pending.removeAll()
        wake()
        do { try await send(message) }
        catch { failure = error }
        try await release()
    }

    private func release() async throws {
        if released { return }
        released = true
        let callback = onRelease
        onRelease = nil
        await client.forgetTcpConnection(self)
        await callback?()
        generation += 1
        pending.removeAll()
        pump?.cancel()
        pump = nil
        if let receiver { await client.cancelTcpReceiver(receiver.id) }
        receiver = nil
        if await client.connectionState != .disconnected {
            let owner = client
            let resource = resource
            do { try await Task { try await owner.unsubscribe(resource) }.value }
            catch { failure = error; wake(); throw error }
        }
    }
}

internal enum TcpProtocol {
    static func matchesEcho(_ expected: StateAction, _ actual: StateAction) -> Bool {
        switch (expected, actual) {
        case (.tcpInput(let expected), .tcpInput(let actual)):
            return expected.offset == actual.offset && expected.data == actual.data
        case (.tcpDataConsumed(let expected), .tcpDataConsumed(let actual)):
            return expected.consumedBytes == actual.consumedBytes
        case (.tcpInputEof(let expected), .tcpInputEof(let actual)):
            return expected.finalOffset == actual.finalOffset
        case (.tcpClientClose, .tcpClientClose): return true
        case (.tcpClientReset(let expected), .tcpClientReset(let actual)): return expected.reason == actual.reason
        default: return false
        }
    }

    static func safe(_ value: Int) throws {
        guard value >= 0 && value <= 9007199254740991 else { throw TransportError.protocol("TCP counter must be a nonnegative safe integer") }
    }

    private static func validateLimits(_ windowBytes: Int, _ maximumChunkSize: Int) throws {
        guard (1...Int(UInt32.max)).contains(windowBytes), maximumChunkSize > 0, maximumChunkSize <= windowBytes else {
            throw TransportError.protocol("TCP window and chunk limits must be positive UInt32 values, with chunk no larger than window")
        }
    }

    static func validate(_ session: String, _ create: TcpConnectionSubscription, _ capability: TcpConnectionsCapability?) throws {
        guard session.hasPrefix("ahp-session:"), create.type == "tcpConnection", !create.host.trimmingCharacters(in: .whitespaces).isEmpty,
              (1...65535).contains(create.port), create.encoding == .base64,
              capability?.encodings.contains(create.encoding) == true else { throw TransportError.protocol("Invalid or unsupported TCP creation request") }
        try validateLimits(create.receiveWindowBytes, create.maximumChunkSize)
    }

    static func validate(_ session: String, _ create: TcpConnectionSubscription, _ snapshot: Snapshot?) throws -> TcpConnectionState {
        guard let snapshot, snapshot.resource.hasPrefix("ahp-tcp:"), case .tcp(let state) = snapshot.state,
              state.session == session, state.target.host == create.host, state.target.port == create.port,
              state.encoding == create.encoding, !state.clientClosed, !state.hostClosed, state.reset == nil else {
            throw TransportError.protocol("Invalid TCP creation snapshot")
        }
        try safe(snapshot.fromSeq)
        for direction in [state.input, state.output] {
            try validateLimits(direction.windowBytes, direction.maximumChunkSize)
            guard direction.receivedBytes == 0, direction.consumedBytes == 0, direction.eofAtBytes == nil else {
                throw TransportError.protocol("TCP creation requires fresh byte directions")
            }
        }
        guard state.output.windowBytes <= create.receiveWindowBytes, state.output.maximumChunkSize <= create.maximumChunkSize else {
            throw TransportError.protocol("TCP creation exceeded requested receive limits")
        }
        return state
    }
}

extension AHPClient {
    internal func trackTcpConnection(_ connection: TcpConnection) throws {
        guard !tcpDisposed else { throw AHPClientError.shutdown }
        ownedTcpConnections[ObjectIdentifier(connection)] = connection
    }

    internal func forgetTcpConnection(_ connection: TcpConnection) {
        ownedTcpConnections.removeValue(forKey: ObjectIdentifier(connection))
    }

    internal func inheritTcpClient(_ previous: AHPClient) async {
        tcpIdentity = await previous.tcpIdentity
        tcpCapability = await previous.tcpCapability
        tcpSequences.advance(past: previous.tcpSequences.lastAssigned)
    }

    /// Creates a stream after initialization, registering its child route during reply processing.
    public func openTcpConnection(session: String, create: TcpConnectionSubscription) async throws -> TcpConnection {
        guard let clientId = tcpIdentity else { throw TransportError.protocol("Initialize before opening TCP") }
        try TcpProtocol.validate(session, create, tcpCapability)
        let events = tcpEventReceiver(resource: "")
        var snapshot: Snapshot?
        var connection: TcpConnection?
        do {
            let result = try await requestTcpCreation(SubscribeParams(channel: session, create: create), receiverId: events.id)
            snapshot = result.snapshot
            let state = try TcpProtocol.validate(session, create, snapshot)
            try Task.checkCancellation()
            guard let snapshot else { throw TransportError.protocol("Missing TCP creation snapshot") }
            let created = TcpConnection(client: self, clientId: clientId, snapshot: snapshot, state: state)
            connection = created
            try trackTcpConnection(created)
            await created.start(events)
            guard !tcpDisposed else { throw AHPClientError.shutdown }
            return created
        } catch {
            cancelTcpReceiver(events.id)
            if let connection { try await connection.dispose() }
            else if let snapshot, snapshot.resource.hasPrefix("ahp-tcp:"), connectionState != .disconnected {
                try await Task { try await self.unsubscribe(snapshot.resource) }.value
            }
            throw error
        }
    }

    /// Reconciles retained handles on this fresh transport; never recreates sockets or restores TCP snapshots.
    /// Returned replay excludes actions at or below the caller's original checkpoint.
    public func reconnectTcpConnections(params: ReconnectParams, connections: [TcpConnection]) async throws -> ReconnectResult {
        try TcpProtocol.safe(params.lastSeenServerSeq)
        guard params.channel == RootResourceURI, tcpIdentity == nil || tcpIdentity == params.clientId,
              Set(connections.map(\.resource)).count == connections.count else { throw TransportError.protocol("Invalid TCP reconnect ownership") }
        var checkpoint = params.lastSeenServerSeq
        var resources = Set(params.subscriptions)
        for connection in connections {
            guard connection.clientId == params.clientId, await connection.canRebind() else { throw TransportError.protocol("TCP reconnect requires suspended handles owned by the same logical client") }
            checkpoint = min(checkpoint, await connection.appliedCheckpoint)
            resources.insert(connection.resource)
        }
        let receivers = connections.map { tcpEventReceiver(resource: $0.resource) }
        do {
            if let first = connections.first { await inheritTcpClient(await first.owner()) }
            for connection in connections { try await connection.bind(self) }
            for connection in connections { tcpSequences.advance(past: await connection.lastClientSequence) }
            let result = try await reconnect(clientId: params.clientId, lastSeenServerSeq: checkpoint, subscriptions: resources.sorted())
            tcpIdentity = params.clientId
            if case .replay(var replay) = result {
                var previous = checkpoint
                for action in replay.actions {
                    try TcpProtocol.safe(action.serverSeq)
                    guard action.serverSeq > previous else { throw TransportError.protocol("TCP replay is not ordered") }
                    previous = action.serverSeq
                }
                for connection in connections {
                    if replay.missing.contains(connection.resource) {
                        try await connection.fail(TransportError.protocol("TCP resource is missing on reconnect"))
                    } else {
                        for envelope in replay.actions { try await connection.accept(envelope) }
                    }
                }
                for (connection, receiver) in zip(connections, receivers) {
                    try Task.checkCancellation()
                    if await connection.isClosed {
                        cancelTcpReceiver(receiver.id)
                    } else { try await connection.resume(receiver) }
                }
                replay.actions.removeAll { $0.serverSeq <= params.lastSeenServerSeq }
                return .replay(replay)
            } else {
                for connection in connections { try await connection.fail(TransportError.protocol("TCP cannot be restored from a reconnect snapshot")) }
                for receiver in receivers { cancelTcpReceiver(receiver.id) }
            }
            return result
        } catch {
            for connection in connections { await connection.suspend() }
            for receiver in receivers { cancelTcpReceiver(receiver.id) }
            throw error
        }
    }
}
