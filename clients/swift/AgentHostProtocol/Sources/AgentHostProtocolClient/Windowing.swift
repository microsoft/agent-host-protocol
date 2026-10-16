import Foundation
import AgentHostProtocol

/// Defaults only: windowing is enabled by a subscription, never by configuration.
public struct AHPWindowingConfig: Sendable {
    public var windowBytes: Int
    public var maximumFrameBytes: Int?
    public var maxBufferedSendBytes: Int
    public var coalescers: [AHPCoalescer]

    public init(
        windowBytes: Int = 262_144,
        maximumFrameBytes: Int? = nil,
        maxBufferedSendBytes: Int = 1_048_576,
        coalescers: [AHPCoalescer] = []
    ) {
        self.windowBytes = windowBytes
        self.maximumFrameBytes = maximumFrameBytes
        self.maxBufferedSendBytes = maxBufferedSendBytes
        self.coalescers = coalescers
    }
}

public enum AHPReceiveMode: Sendable { case auto, manual }

public struct AHPWindowOptions: Sendable {
    public var windowBytes: Int?
    public var maximumFrameBytes: Int?
    public var receive: AHPReceiveMode
    public var coalescing: Bool

    public init(windowBytes: Int? = nil, maximumFrameBytes: Int? = nil,
                receive: AHPReceiveMode = .auto, coalescing: Bool = true) {
        self.windowBytes = windowBytes
        self.maximumFrameBytes = maximumFrameBytes
        self.receive = receive
        self.coalescing = coalescing
    }
}

public struct AHPSubscriptionOptions: Sendable {
    public var window: AHPWindowOptions?
    public var delivery: SubscriptionDeliveryOptions?
    public var view: SubscribeView?

    public init(window: AHPWindowOptions? = nil,
                delivery: SubscriptionDeliveryOptions? = nil, view: SubscribeView? = nil) {
        self.window = window
        self.delivery = delivery
        self.view = view
    }

    public static func windowed(windowBytes: Int? = nil, maximumFrameBytes: Int? = nil,
                                receive: AHPReceiveMode = .auto, coalescing: Bool = true,
                                delivery: SubscriptionDeliveryOptions? = nil,
                                view: SubscribeView? = nil) -> Self {
        .init(window: .init(windowBytes: windowBytes, maximumFrameBytes: maximumFrameBytes,
                            receive: receive, coalescing: coalescing), delivery: delivery, view: view)
    }
}

public struct AHPFlowControlStatus: Codable, Sendable {
    public var mode: String = "ordinary"
    public var fallbackReason: String?
    public var limits: ChannelFlowControl?
    public var outstandingSendBytes: Int = 0
    public var bufferedSendBytes: Int = 0
    public var bufferedReceiveBytes: Int = 0
    public var writable: Bool = true
}

public struct AHPFlowControlEvent: Sendable {
    public let channel: String
    public let kind: String
    public let status: AHPFlowControlStatus
}

public struct AHPHostedFlowControlEvent: Sendable {
    public let hostId: HostId
    public let event: AHPFlowControlEvent
}

public enum AHPWindowingError: Error, Sendable {
    case backpressure
    case subscriptionDropped(String)
    case consumerAlreadyWaiting
}

public enum AHPDeliveryPayload: Sendable {
    case event(SubscriptionEvent)
    case snapshot(Snapshot)
    case tcpData(TcpDataParams)
    case tcpEof(TcpEofParams)
    case tcpReset(TcpResetParams)
    case progress(ProgressParams)
    case exportLogs(OtlpExportLogsParams)
    case exportTraces(OtlpExportTracesParams)
    case exportMetrics(OtlpExportMetricsParams)
    case dispatchAction(DispatchActionParams)
    case notification(method: String, paramsJSON: Data)
}

/// A notification, with raw parameters for extensible/custom coalescing.
/// Known messages are also decoded to native models on `AHPDelivery.payload`.
public struct AHPNotificationMessage: Sendable {
    public let channel: String
    public let method: String
    public let paramsJSON: Data

    public init<P: Encodable>(method: String, params: P) throws {
        try self.init(method: method, paramsJSON: JSONEncoder().encode(params))
    }

    public init(method: String, paramsJSON: Data) throws {
        guard let params = try JSONSerialization.jsonObject(with: paramsJSON) as? [String: Any],
              let channel = params["channel"] as? String else {
            throw TransportError.protocol("notification has no channel")
        }
        self.channel = channel
        self.method = method
        self.paramsJSON = paramsJSON
    }

    public func decode<P: Decodable>(_ type: P.Type) throws -> P {
        try JSONDecoder().decode(type, from: paramsJSON)
    }

    internal func wire() throws -> Data {
        let params = try JSONSerialization.jsonObject(with: paramsJSON)
        return try JSONSerialization.data(withJSONObject: [
            "jsonrpc": "2.0", "method": method, "params": params,
        ])
    }

    internal func payload() throws -> AHPDeliveryPayload {
        switch method {
        case "action": return .event(.action(try decode(ActionEnvelope.self)))
        case "channel/snapshot": return .snapshot(try decode(ChannelSnapshotParams.self).snapshot)
        case "root/sessionAdded": return .event(.sessionAdded(try decode(SessionAddedParams.self)))
        case "root/sessionRemoved": return .event(.sessionRemoved(try decode(SessionRemovedParams.self)))
        case "root/sessionSummaryChanged":
            return .event(.sessionSummaryChanged(try decode(SessionSummaryChangedParams.self)))
        case "auth/required": return .event(.authRequired(try decode(AuthRequiredParams.self)))
        case "tcp/data": return .tcpData(try decode(TcpDataParams.self))
        case "tcp/eof": return .tcpEof(try decode(TcpEofParams.self))
        case "tcp/reset": return .tcpReset(try decode(TcpResetParams.self))
        case "root/progress": return .progress(try decode(ProgressParams.self))
        case "otlp/exportLogs": return .exportLogs(try decode(OtlpExportLogsParams.self))
        case "otlp/exportTraces": return .exportTraces(try decode(OtlpExportTracesParams.self))
        case "otlp/exportMetrics": return .exportMetrics(try decode(OtlpExportMetricsParams.self))
        case "dispatchAction": return .dispatchAction(try decode(DispatchActionParams.self))
        default: return .notification(method: method, paramsJSON: paramsJSON)
        }
    }
}

public struct AHPCoalescingContext: Sendable {
    public let channel: String
    public let direction: String
}

public struct AHPCoalescer: Sendable {
    public let method: String
    public let combine: @Sendable (
        AHPNotificationMessage, AHPNotificationMessage, AHPCoalescingContext
    ) throws -> AHPNotificationMessage?

    public init(method: String, combine: @escaping @Sendable (
        AHPNotificationMessage, AHPNotificationMessage, AHPCoalescingContext
    ) throws -> AHPNotificationMessage?) {
        self.method = method
        self.combine = combine
    }
}

public struct AHPDelivery: Sendable {
    public let message: AHPNotificationMessage
    public let payload: AHPDeliveryPayload
    public let receivedBytes: Int
    internal let epoch: UInt64
    internal let releaseBytes: Int
    internal let releaseBody: @Sendable () async -> Void

    public func release() async { await releaseBody() }
}

internal actor AHPReleaseToken {
    var released = false
    let body: @Sendable () async -> Void
    init(_ body: @escaping @Sendable () async -> Void) { self.body = body }
    func release() async {
        guard !released else { return }
        released = true
        await body()
    }
}

/// One reliable owner queue. Auto mode releases the previous item on `next()`.
public actor AHPSubscription {
    public nonisolated let channel: String
    public private(set) var result = SubscribeResult()
    public private(set) var options: AHPSubscriptionOptions
    public private(set) var lastAppliedServerSeq: Int = 0
    internal var managed = false
    internal var pendingWindowOffer = false
    private var engine: AHPWindowingEngine?
    private var queue: [AHPDelivery] = []
    private var nextWaiter: (UUID, CheckedContinuation<AHPDelivery?, Error>)?
    private var consumptionOwner: UUID?
    private let directOwner = UUID()
    private var previous: AHPDelivery?
    private var error: Error?
    private var finished = false
    private var flowStatus = AHPFlowControlStatus()
    private var statusListeners: [UUID: AsyncStream<AHPFlowControlStatus>.Continuation] = [:]
    private var writableWaiters: [UUID: CheckedContinuation<Void, Error>] = [:]
    private var observer: (@Sendable (AHPDeliveryPayload) async -> Void)?
    private var closeObserver: (@Sendable () async -> Void)?
    private var heldBytes = 0
    private var statusRevision: UInt64 = 0

    internal init(channel: String, options: AHPSubscriptionOptions) {
        self.channel = channel
        self.options = options
    }

    public nonisolated var deliveries: AHPDeliverySequence { .init(subscription: self, manual: true) }
    public nonisolated var events: AHPDeliverySequence { .init(subscription: self, manual: false) }
    public func status() -> AHPFlowControlStatus { flowStatus }
    public var statusChanges: AsyncStream<AHPFlowControlStatus> {
        let id = UUID()
        return AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            statusListeners[id] = continuation
            continuation.yield(flowStatus)
            continuation.onTermination = { [weak self] _ in
                Task { await self?.removeStatusListener(id) }
            }
        }
    }

    public func next() async throws -> AHPDelivery? {
        try await nextDelivery(manual: options.window?.receive == .manual, owner: directOwner)
    }

    /// Begin waiting for the next delivery without taking it (auto mode).
    public func advance() async {
        let item = previous
        previous = nil
        await item?.release()
    }

    public func waitUntilWritable() async throws {
        try Task.checkCancellation()
        if let error { throw error }
        if engine == nil { throw AHPClientError.shutdown }
        if flowStatus.writable { return }
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { writableWaiters[id] = $0 }
        } onCancel: {
            Task { await self.cancelWritable(id) }
        }
    }

    public func send<P: Encodable & Sendable>(method: String, params: P) async throws {
        let message = try AHPNotificationMessage(method: method, params: params)
        try await send(message)
    }

    public func send(_ message: AHPNotificationMessage) async throws {
        guard let engine else { throw AHPClientError.shutdown }
        guard message.channel == channel else { throw TransportError.protocol("send channel mismatch") }
        try await engine.send(message)
    }

    @discardableResult
    public func dispatch(_ action: StateAction, clientSeq: Int? = nil) async throws -> DispatchHandle {
        guard let engine else { throw AHPClientError.shutdown }
        return try await engine.dispatch(action, channel: channel, clientSeq: clientSeq)
    }

    public func close() async throws {
        await closeObserver?()
        if let engine { try await engine.unsubscribe(channel) }
        else { finish(nil) }
    }

    @discardableResult
    public func update(options: AHPSubscriptionOptions) async throws -> SubscribeResult {
        guard let engine else { throw AHPClientError.shutdown }
        let subscription = try await engine.update(channel: channel, options: options)
        return await subscription.result
    }

    internal func bind(_ engine: AHPWindowingEngine) {
        guard !finished else { return }
        if self.engine !== engine { statusRevision = 0 }
        self.engine = engine
        error = nil
    }
    internal func install(_ result: SubscribeResult, options: AHPSubscriptionOptions) {
        self.result = result
        self.options = options
        pendingWindowOffer = false
    }
    internal func markManaged() { managed = true }
    internal func setPendingWindowOffer(_ value: Bool) { pendingWindowOffer = value }
    internal func setObserver(_ observer: @escaping @Sendable (AHPDeliveryPayload) async -> Void) {
        self.observer = observer
    }
    internal func setCloseObserver(_ observer: @escaping @Sendable () async -> Void) {
        closeObserver = observer
    }
    internal func removeManagedRegistration() async { await closeObserver?() }
    internal func observe(_ payload: AHPDeliveryPayload) async { await observer?(payload) }

    internal func enqueue(_ source: AHPDelivery, coalescers: [AHPCoalescer], coalescing: Bool) async throws -> Bool {
        guard !finished else { return false }
        let token = AHPReleaseToken { [weak self] in
            await self?.releaseRetained(source.releaseBytes)
            await source.release()
        }
        let delivery = AHPDelivery(message: source.message, payload: source.payload,
                                   receivedBytes: source.receivedBytes, epoch: source.epoch,
                                   releaseBytes: source.releaseBytes, releaseBody: { await token.release() })
        await observer?(delivery.payload)
        guard !finished else { return false }
        if let waiter = nextWaiter {
            retain(delivery)
            nextWaiter = nil
            waiter.1.resume(returning: delivery)
            return false
        }
        if coalescing, let tail = queue.last, tail.epoch == delivery.epoch,
           let merged = try coalesce(tail.message, delivery.message, direction: "inbound", custom: coalescers) {
            let payload = try merged.payload()
            retain(delivery)
            queue.removeLast()
            let token = AHPReleaseToken { await tail.release(); await delivery.release() }
            queue.append(AHPDelivery(message: merged, payload: payload,
                                     receivedBytes: tail.receivedBytes + delivery.receivedBytes,
                                     epoch: delivery.epoch, releaseBytes: tail.releaseBytes + delivery.releaseBytes,
                                     releaseBody: { await token.release() }))
            return true
        } else {
            retain(delivery)
            queue.append(delivery)
            return false
        }
    }

    private func retain(_ delivery: AHPDelivery) {
        heldBytes += delivery.releaseBytes
        switch delivery.payload {
        case .snapshot(let snapshot): lastAppliedServerSeq = snapshot.fromSeq
        case .event(.action(let action)): lastAppliedServerSeq = max(lastAppliedServerSeq, action.serverSeq)
        default: break
        }
    }

    internal func discardQueuedData() async {
        let items = queue.filter {
            if case .snapshot = $0.payload { return false }
            return true
        }
        queue.removeAll {
            if case .snapshot = $0.payload { return false }
            return true
        }
        for item in items { await item.release() }
    }

    private func releaseRetained(_ bytes: Int) {
        heldBytes -= bytes
        flowStatus.bufferedReceiveBytes = heldBytes
        for listener in statusListeners.values { listener.yield(flowStatus) }
    }

    internal func updateStatus(_ status: AHPFlowControlStatus, engine: AHPWindowingEngine,
                               revision: UInt64) -> AHPFlowControlStatus? {
        // Actor hops can complete out of order, including after a reconnect.
        guard self.engine === engine, revision >= statusRevision else { return nil }
        statusRevision = revision
        flowStatus = status
        flowStatus.bufferedReceiveBytes = heldBytes
        for continuation in statusListeners.values { continuation.yield(flowStatus) }
        if status.writable {
            let waiters = writableWaiters.values
            writableWaiters.removeAll()
            for waiter in waiters { waiter.resume() }
        }
        return flowStatus
    }

    internal func detach() {
        engine = nil
        failWritable(AHPClientError.shutdown)
    }

    internal func finish(_ error: Error?) {
        engine = nil
        self.error = error
        finished = true
        flowStatus.writable = false
        if let waiter = nextWaiter {
            nextWaiter = nil
            if let error { waiter.1.resume(throwing: error) } else { waiter.1.resume(returning: nil) }
        }
        failWritable(error ?? AHPClientError.shutdown)
        for c in statusListeners.values { c.yield(flowStatus); c.finish() }
        statusListeners.removeAll()
    }

    private func nextDelivery(manual: Bool, owner: UUID) async throws -> AHPDelivery? {
        try Task.checkCancellation()
        if let consumptionOwner, consumptionOwner != owner { throw AHPWindowingError.consumerAlreadyWaiting }
        consumptionOwner = owner
        if !manual { await advance() }
        let item: AHPDelivery?
        if !queue.isEmpty { item = queue.removeFirst() }
        else if let error { throw error }
        else if finished { return nil }
        else {
            guard nextWaiter == nil else { throw AHPWindowingError.consumerAlreadyWaiting }
            let ticket = UUID()
            item = try await withTaskCancellationHandler {
                try await withCheckedThrowingContinuation { nextWaiter = (ticket, $0) }
            } onCancel: {
                Task { await self.cancelNext(ticket) }
            }
        }
        if !manual { previous = item }
        return item
    }

    private func cancelNext(_ id: UUID) {
        guard nextWaiter?.0 == id else { return }
        nextWaiter?.1.resume(throwing: CancellationError())
        nextWaiter = nil
    }
    private func cancelWritable(_ id: UUID) {
        writableWaiters.removeValue(forKey: id)?.resume(throwing: CancellationError())
    }
    private func failWritable(_ error: Error) {
        let waiters = writableWaiters.values
        writableWaiters.removeAll()
        for waiter in waiters { waiter.resume(throwing: error) }
    }
    private func removeStatusListener(_ id: UUID) { statusListeners.removeValue(forKey: id) }
}

public struct AHPDeliverySequence: AsyncSequence, Sendable {
    public typealias Element = AHPDelivery
    internal let subscription: AHPSubscription
    internal let manual: Bool
    public struct AsyncIterator: AsyncIteratorProtocol {
        internal let subscription: AHPSubscription
        internal let manual: Bool
        internal let owner: UUID
        public mutating func next() async throws -> AHPDelivery? {
            try await subscription.nextFromIterator(manual: manual, owner: owner)
        }
    }
    public func makeAsyncIterator() -> AsyncIterator { .init(subscription: subscription, manual: manual, owner: UUID()) }
}

extension AHPSubscription {
    fileprivate func nextFromIterator(manual: Bool, owner: UUID) async throws -> AHPDelivery? {
        try await nextDelivery(manual: manual || options.window?.receive == .manual, owner: owner)
    }
}

internal func coalesce(_ earlier: AHPNotificationMessage, _ later: AHPNotificationMessage,
                       direction: String, custom: [AHPCoalescer]) throws -> AHPNotificationMessage? {
    guard earlier.channel == later.channel, earlier.method == later.method,
          countsAgainstWindow(earlier.method),
          !["channel/snapshot", "channel/frame", "dispatchAction", "tcp/eof"].contains(earlier.method)
    else { return nil }
    var a = try JSONSerialization.jsonObject(with: earlier.paramsJSON) as! [String: Any]
    let b = try JSONSerialization.jsonObject(with: later.paramsJSON) as! [String: Any]
    guard a["origin"] == nil, b["origin"] == nil,
          a["rejectionReason"] == nil, b["rejectionReason"] == nil else { return nil }
    for c in custom where c.method == earlier.method {
        if let result = try c.combine(earlier, later, .init(channel: earlier.channel, direction: direction)) {
            guard result.channel == earlier.channel, result.method == earlier.method,
                  countsAgainstWindow(result.method) else {
                throw TransportError.protocol("custom coalescer changed channel or method")
            }
            return result
        }
    }
    if direction == "outbound", earlier.method == "tcp/data",
       let x = a["data"] as? String, let y = b["data"] as? String,
       var data = Data(base64Encoded: x), let more = Data(base64Encoded: y) {
        data.append(more)
        a["data"] = data.base64EncodedString()
    } else if direction == "inbound", earlier.method == "action",
              var x = a["action"] as? [String: Any], let y = b["action"] as? [String: Any],
              let type = x["type"] as? String, type == y["type"] as? String {
        if type == "terminal/data", let one = x["data"] as? String, let two = y["data"] as? String,
           try sameJSON(x.filter { $0.key != "data" }, y.filter { $0.key != "data" }) {
            x["data"] = one + two
        } else if type == "chat/delta", let one = x["content"] as? String,
                  let two = y["content"] as? String,
                  try sameJSON(x.filter { $0.key != "content" }, y.filter { $0.key != "content" }) {
            x["content"] = one + two
        } else { return nil }
        a["action"] = x
        a["serverSeq"] = b["serverSeq"]
    } else { return nil }
    return try .init(method: earlier.method, paramsJSON: JSONSerialization.data(withJSONObject: a))
}

internal func ahpUTF16Bytes(_ text: String) -> Int { text.utf16.count * 2 }

private func sameJSON(_ a: [String: Any], _ b: [String: Any]) throws -> Bool {
    try JSONSerialization.data(withJSONObject: a, options: [.sortedKeys]) ==
        JSONSerialization.data(withJSONObject: b, options: [.sortedKeys])
}
