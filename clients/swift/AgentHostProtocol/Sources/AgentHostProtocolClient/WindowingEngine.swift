import Foundation
import AgentHostProtocol

internal actor AHPWindowingEngine {
    private final class SendEntry {
        let id: UUID
        var message: AHPNotificationMessage
        var wire: String
        var bytes: Int
        var bufferedBytes: Int
        var headAllowance: Int
        var scalars: [Unicode.Scalar]?
        var offset = 0
        var started = false
        var emitting = false
        var emissionID: UUID?
        var replies: [CheckedContinuation<Void, Error>]
        var ids: [UUID]
        var messages: [AHPNotificationMessage]
        init(id: UUID, message: AHPNotificationMessage, wire: String,
             reply: CheckedContinuation<Void, Error>) {
            self.id = id
            self.message = message
            self.wire = wire
            self.bytes = ahpUTF16Bytes(wire)
            self.bufferedBytes = self.bytes
            self.headAllowance = self.bytes
            self.replies = [reply]
            self.ids = [id]
            self.messages = [message]
        }
    }

    private final class Channel {
        let subscription: AHPSubscription
        var options: AHPSubscriptionOptions
        var pendingRequests = 0
        var installed = false
        var ready = false
        var hasConsumer = false
        var fallback: String?
        var limits: ChannelFlowControl?
        var epoch = UInt64.random(in: 0...UInt64.max)
        var sent = 0
        var credited = 0
        var received = 0
        var released = 0
        var creditSent = 0
        var creditTask: Task<Void, Never>?
        var awaitingSnapshot = false
        var assembly: String?
        var assemblyBytes = 0
        var sends: [SendEntry] = []
        var buffered = 0
        var sentEOF = false
        var receivedEOF = false
        var reset = false
        var pauseNewData = false
        var modeWaiters: [UUID: CheckedContinuation<Void, Error>] = [:]
        var statusRevision: UInt64 = 0
        var lastWritable = true
        init(_ subscription: AHPSubscription, options: AHPSubscriptionOptions) {
            self.subscription = subscription
            self.options = options
        }
    }

    private let config: AHPWindowingConfig
    private let writeBody: @Sendable (Data, AHPBeforeWrite?, Bool) async throws -> Void
    private let fail: @Sendable (Error) async -> Void
    private let dispatchBody: @Sendable (StateAction, String, Int?) async throws -> DispatchHandle
    private let updateBody: @Sendable (String, AHPSubscriptionOptions) async throws -> AHPSubscription
    private var channels: [String: Channel] = [:]
    private var order: [String] = []
    private var cursor = 0
    private var scheduler: Task<Void, Never>?
    private var closed = false
    private var telemetry: [UUID: AsyncStream<AHPFlowControlEvent>.Continuation] = [:]

    init(config: AHPWindowingConfig,
         write: @escaping @Sendable (Data, AHPBeforeWrite?, Bool) async throws -> Void,
         fail: @escaping @Sendable (Error) async -> Void,
         dispatch: @escaping @Sendable (StateAction, String, Int?) async throws -> DispatchHandle,
         update: @escaping @Sendable (String, AHPSubscriptionOptions) async throws -> AHPSubscription) {
        self.config = config
        self.writeBody = write
        self.fail = fail
        self.dispatchBody = dispatch
        self.updateBody = update
    }

    var events: AsyncStream<AHPFlowControlEvent> {
        let id = UUID()
        return AsyncStream(bufferingPolicy: .bufferingNewest(256)) { continuation in
            telemetry[id] = continuation
            continuation.onTermination = { [weak self] _ in Task { await self?.removeTelemetry(id) } }
        }
    }
    private func removeTelemetry(_ id: UUID) { telemetry.removeValue(forKey: id) }

    func prepare(channel: String, options: AHPSubscriptionOptions,
                 capabilities: AHPTransportCapabilities,
                 retained: AHPSubscription? = nil) async throws -> (AHPSubscription, ChannelReceiveLimits?, Bool) {
        guard !closed else { throw AHPClientError.shutdown }
        let offer: ChannelReceiveLimits?
        if let window = options.window, capabilities.preservesOriginalJSONText {
            let limits = ChannelReceiveLimits(
                windowBytes: window.windowBytes ?? config.windowBytes,
                maximumFrameBytes: window.maximumFrameBytes ?? config.maximumFrameBytes ?? capabilities.maximumFrameBytes
            )
            try validate(limits)
            guard config.maxBufferedSendBytes > 0 else {
                throw TransportError.protocol("maxBufferedSendBytes must be positive")
            }
            offer = limits
        } else { offer = nil }
        if channel.hasPrefix("ahp-tcp:"), offer == nil {
            throw TransportError.protocol("TCP requires a window-capable transport and a window offer")
        }
        let created = channels[channel] == nil
        let record: Channel
        if let existing = channels[channel] { record = existing }
        else {
            let subscription = retained ?? AHPSubscription(channel: channel, options: options)
            record = Channel(subscription, options: options)
            record.installed = retained != nil
            record.hasConsumer = retained != nil
            if retained != nil { record.fallback = await subscription.status().fallbackReason }
            channels[channel] = record
            if !order.contains(channel) { order.append(channel) }
        }
        if record.ready { await record.subscription.bind(self) }
        await record.subscription.setPendingWindowOffer(offer != nil)
        return (record.subscription, offer, created)
    }

    func prepareGeneric(_ params: Data, capabilities: AHPTransportCapabilities) async throws {
        let p = try JSONDecoder().decode(SubscribeParams.self, from: params)
        if channels[p.channel] == nil, let offer = p.flowControl?.receive {
            _ = try await prepare(channel: p.channel, options: .windowed(
                windowBytes: offer.windowBytes, maximumFrameBytes: offer.maximumFrameBytes,
                delivery: p.delivery, view: p.view), capabilities: capabilities)
        }
        channels[p.channel]?.pendingRequests += 1
    }

    func prepareReconnect(_ params: Data, capabilities: AHPTransportCapabilities) async throws {
        let request = try JSONDecoder().decode(ReconnectParams.self, from: params)
        guard let windows = request.windows else { return }
        guard capabilities.preservesOriginalJSONText,
              Set(windows.items.map(\.channel)).count == windows.items.count else {
            throw TransportError.protocol("reconnect windows require raw text and unique channels")
        }
        for item in windows.items {
            try validate(item.flowControl.receive)
            guard request.subscriptions.contains(item.channel), !item.channel.hasPrefix("ahp-tcp:") else {
                throw TransportError.protocol("invalid reconnect window channel")
            }
            if channels[item.channel] == nil {
                _ = try await prepare(channel: item.channel, options: .windowed(
                    windowBytes: item.flowControl.receive.windowBytes,
                    maximumFrameBytes: item.flowControl.receive.maximumFrameBytes), capabilities: capabilities)
            }
        }
    }

    func optionsForRequest(_ request: SubscribeParams) -> AHPSubscriptionOptions {
        var options = channels[request.channel]?.options ?? .init()
        options.delivery = request.delivery
        options.view = request.view
        options.window = request.flowControl.map {
            .init(windowBytes: $0.receive.windowBytes, maximumFrameBytes: $0.receive.maximumFrameBytes,
                  receive: options.window?.receive ?? .auto, coalescing: options.window?.coalescing ?? true)
        }
        return options
    }

    func pauseForOrdinarySubscribe(_ channel: String) async throws {
        try Task.checkCancellation()
        guard let r = channels[channel], r.limits != nil else { return }
        r.pauseNewData = true
        guard let entry = r.sends.first, entry.started || entry.emitting, entry.scalars != nil else { return }
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { r.modeWaiters[id] = $0 }
        } onCancel: {
            Task { await self.cancelModeWait(channel, id: id) }
        }
    }

    private func cancelModeWait(_ channel: String, id: UUID) {
        guard let r = channels[channel] else { return }
        r.modeWaiters.removeValue(forKey: id)?.resume(throwing: CancellationError())
        r.pauseNewData = false
        startScheduler()
    }

    func abortSubscribe(_ channel: String, error: Error? = nil, expected: AHPSubscription? = nil) async {
        guard let r = channels[channel] else { return }
        if let expected, r.subscription !== expected { return }
        r.pendingRequests = max(0, r.pendingRequests - 1)
        r.pauseNewData = false
        if r.pendingRequests == 0 { await r.subscription.setPendingWindowOffer(false) }
        if !r.installed && r.pendingRequests == 0 {
            await drop(channel, error: error ?? AHPClientError.shutdown)
        }
        startScheduler()
    }

    func abortPrepared(_ subscription: AHPSubscription, error: Error) async {
        guard let r = channels[subscription.channel], r.subscription === subscription,
              !r.installed, r.pendingRequests == 0 else { return }
        await drop(subscription.channel, error: error)
    }

    func abandonSubscribe(_ subscription: AHPSubscription, created: Bool, error: Error) async {
        guard created, let r = channels[subscription.channel], r.subscription === subscription,
              !r.installed, r.pendingRequests <= 1 else { return }
        await drop(subscription.channel, error: error)
    }

    func cleanAbandoned(_ subscription: AHPSubscription, created: Bool) async {
        guard !closed, created else { return }
        if let r = channels[subscription.channel] {
            guard r.subscription === subscription, r.pendingRequests == 0, !r.hasConsumer else { return }
            await unsubscribeIfCurrent(subscription)
        } else {
            try? await write(AHPNotificationMessage(method: "unsubscribe",
                params: UnsubscribeParams(channel: subscription.channel)).wire())
        }
    }

    private func unsubscribeIfCurrent(_ subscription: AHPSubscription) async {
        do { try await subscription.close() }
        catch is CancellationError {}
        catch AHPWindowingError.backpressure {}
        catch { await fail(error) }
    }

    func installSubscribe(request: SubscribeParams, options: AHPSubscriptionOptions?,
                          resultData: Data, expected: AHPSubscription? = nil,
                          retain: Bool = true) async throws {
        let channel = request.channel
        let result = try JSONDecoder().decode(SubscribeResult.self, from: resultData)
        if let limits = result.flowControl {
            guard result.snapshot == nil, let offer = request.flowControl?.receive else {
                throw TransportError.protocol("unsolicited flow control or snapshot in accepted result")
            }
            try validateAccepted(limits, offer: offer)
        } else if channel.hasPrefix("ahp-tcp:") {
            throw TransportError.protocol("TCP window offer declined")
        }
        guard let r = channels[channel] else { return }
        if let expected, r.subscription !== expected { return }
        r.pendingRequests = max(0, r.pendingRequests - 1)
        if (r.limits == nil) != (result.flowControl == nil) {
            guard r.assembly == nil else {
                throw TransportError.protocol("subscription mode changed during inbound fragments")
            }
            r.epoch &+= 1
            r.sent = 0; r.credited = 0; r.received = 0; r.released = 0; r.creditSent = 0
            r.assembly = nil; r.assemblyBytes = 0
            r.creditTask?.cancel(); r.creditTask = nil
        }
        r.limits = result.flowControl
        r.installed = true
        if retain { r.hasConsumer = true }
        r.ready = true
        r.pauseNewData = false
        r.options = options ?? optionsForRequest(request)
        r.fallback = r.options.window == nil ? nil : (request.flowControl == nil ? "transport" : "declined")
        r.awaitingSnapshot = result.flowControl != nil
        await r.subscription.bind(self)
        await r.subscription.install(result, options: r.options)
        if let snapshot = result.snapshot {
            let message = try AHPNotificationMessage(
                method: "channel/snapshot", params: ChannelSnapshotParams(channel: channel, snapshot: snapshot))
            try await enqueue(r, message: message, bytes: 0, releaseBytes: 0)
        }
        await publish(channel, kind: r.limits == nil ? "declined" : "negotiated")
        startScheduler()
    }

    func installReconnect(request: Data, resultData: Data) async throws {
        let p = try JSONDecoder().decode(ReconnectParams.self, from: request)
        let result = try JSONDecoder().decode(ReconnectResult.self, from: resultData)
        for channel in p.subscriptions where !(p.windows?.items.contains(where: { $0.channel == channel }) ?? false) {
            guard let r = channels[channel] else { continue }
            r.ready = true
            await r.subscription.bind(self)
            await publish(channel, kind: "resumed")
        }
        switch result {
        case .replay(let value):
            for action in value.actions {
                if let r = channels[action.channel], r.limits == nil,
                   !(p.windows?.items.contains(where: { $0.channel == action.channel }) ?? false) {
                    let message = try AHPNotificationMessage(method: "action", params: action)
                    try await enqueue(r, message: message, bytes: 0, releaseBytes: 0)
                }
            }
            for channel in value.missing {
                await drop(channel, error: AHPWindowingError.subscriptionDropped(channel))
            }
        case .snapshot(let value):
            for snapshot in value.snapshots {
                if let r = channels[snapshot.resource], r.limits == nil,
                   !(p.windows?.items.contains(where: { $0.channel == snapshot.resource }) ?? false) {
                    let message = try AHPNotificationMessage(method: "channel/snapshot",
                        params: ChannelSnapshotParams(channel: snapshot.resource, snapshot: snapshot))
                    try await enqueue(r, message: message, bytes: 0, releaseBytes: 0)
                }
            }
        }
        guard let requested = p.windows else { return }
        let items: [ResumedChannelSubscription]
        switch result {
        case .replay(let value): items = value.windows?.items ?? []
        case .snapshot(let value): items = value.windows?.items ?? []
        }
        guard Set(items.map(\.channel)).count == items.count else {
            throw TransportError.protocol("duplicate reconnect window")
        }
        for item in items {
            guard let offered = requested.items.first(where: { $0.channel == item.channel }),
                  p.subscriptions.contains(item.channel), let r = channels[item.channel] else {
                throw TransportError.protocol("unrequested reconnect window")
            }
            try validateAccepted(item.flowControl, offer: offered.flowControl.receive)
            r.limits = item.flowControl
            r.ready = true
            r.epoch &+= 1
            r.sent = 0; r.credited = 0; r.received = 0; r.released = 0; r.creditSent = 0
            r.assembly = nil; r.assemblyBytes = 0
            r.awaitingSnapshot = item.recovery == .snapshot
            await r.subscription.bind(self)
            await r.subscription.install(SubscribeResult(flowControl: item.flowControl), options: r.options)
            await publish(item.channel, kind: "resumed")
        }
        for offered in requested.items where !items.contains(where: { $0.channel == offered.channel }) {
            await drop(offered.channel, error: AHPWindowingError.subscriptionDropped(offered.channel))
        }
    }

    func subscription(_ channel: String) -> AHPSubscription? { channels[channel]?.subscription }
    func bookkeepingCount() -> Int { order.count }
    func isWindowed(_ channel: String) -> Bool { channels[channel]?.limits != nil }
    var hasWindows: Bool { channels.values.contains { $0.limits != nil } }

    func receive(_ message: AHPNotificationMessage, rawText: String?) async throws -> AHPNotificationMessage? {
        guard !closed else { return nil }
        guard let r = channels[message.channel] else { return message }
        if !r.ready && message.method != "channel/credit" {
            // An unsubscribe can race with already-sent data from the previous
            // subscription. The next result is the ordered receive boundary;
            // until then, that traffic does not belong to the new owner.
            if ["channel/frame", "channel/snapshot"].contains(message.method) { return nil }
            await r.subscription.observe(try message.payload())
            return message
        }
        if r.reset && message.method != "channel/credit" { return nil }
        if message.method == "channel/credit" {
            guard r.limits != nil else { return nil }
            let credit = try message.decode(ChannelCreditParams.self).consumedBytes
            guard credit >= 0, credit <= r.sent else { throw TransportError.protocol("credit exceeds sent bytes") }
            if credit > r.credited {
                r.credited = credit
                await publish(message.channel, kind: "creditReceived")
                startScheduler()
            }
            return nil
        }
        guard let limits = r.limits else {
            guard !["channel/frame", "channel/snapshot"].contains(message.method) else {
                throw TransportError.protocol("window delivery message on ordinary subscription")
            }
            try await enqueue(r, message: message, bytes: 0, releaseBytes: 0)
            return message
        }
        let counted = countsAgainstWindow(message.method)
        guard !counted || rawText != nil else { throw TransportError.protocol("missing original JSON text") }
        let bytes = counted ? ahpUTF16Bytes(rawText!) : 0
        guard bytes <= limits.clientReceive.maximumFrameBytes else {
            throw TransportError.protocol("received data exceeds maximumFrameBytes")
        }
        r.received = try adding(r.received, bytes)
        if message.method == "tcp/data" {
            guard !r.receivedEOF, !r.reset else { throw TransportError.protocol("TCP data after EOF/reset") }
            try validateTCPData(message)
        } else if message.method == "tcp/eof" {
            guard !r.receivedEOF, !r.reset else { throw TransportError.protocol("duplicate TCP EOF/reset") }
            r.receivedEOF = true
        } else if message.method == "tcp/reset" {
            r.reset = true
            r.epoch &+= 1
            r.assembly = nil; r.assemblyBytes = 0
            await r.subscription.discardQueuedData()
        }
        if message.method == "channel/frame" {
            let frame = try message.decode(ChannelFrameParams.self)
            guard !frame.data.isEmpty else { throw TransportError.protocol("empty channel/frame") }
            r.assembly = (r.assembly ?? "") + frame.data
            r.assemblyBytes = try adding(r.assemblyBytes, bytes)
            if frame.final != true {
                r.released = try adding(r.released, bytes)
                await flushCredit(message.channel)
                await publish(message.channel, kind: message.method == "tcp/reset" ? "dropped" : nil)
                return nil
            }
            let joined = r.assembly!
            let total = r.assemblyBytes
            r.assembly = nil; r.assemblyBytes = 0
            guard let dict = try JSONSerialization.jsonObject(with: Data(joined.utf8)) as? [String: Any],
                  dict["id"] == nil, let method = dict["method"] as? String,
                  method != "channel/frame", countsAgainstWindow(method),
                  let params = dict["params"] as? [String: Any] else {
                throw TransportError.protocol("invalid joined channel/frame")
            }
            let joinedMessage = try AHPNotificationMessage(
                method: method, paramsJSON: JSONSerialization.data(withJSONObject: params))
            guard joinedMessage.channel == message.channel else {
                throw TransportError.protocol("fragment channel mismatch")
            }
            if method == "tcp/data" {
                guard !r.receivedEOF, !r.reset else { throw TransportError.protocol("TCP data after EOF/reset") }
                try validateTCPData(joinedMessage)
            } else if method == "tcp/eof" {
                guard !r.receivedEOF, !r.reset else { throw TransportError.protocol("duplicate TCP EOF/reset") }
                r.receivedEOF = true
            }
            try checkSnapshot(r, message: joinedMessage)
            try await enqueue(r, message: joinedMessage, bytes: total, releaseBytes: bytes)
            await publish(message.channel, kind: "fragmentedMessageReceived")
            return joinedMessage
        } else {
            guard !counted || r.assembly == nil else {
                throw TransportError.protocol("data interleaved with unfinished fragments")
            }
            if counted { try checkSnapshot(r, message: message) }
            try await enqueue(r, message: message, bytes: bytes, releaseBytes: bytes)
            if message.method == "tcp/reset" {
                failSends(r, error: AHPWindowingError.subscriptionDropped(message.channel))
                try await r.subscription.close()
            }
            await publish(message.channel)
            return message
        }
    }

    private func checkSnapshot(_ r: Channel, message: AHPNotificationMessage) throws {
        if r.awaitingSnapshot {
            guard message.method == "channel/snapshot" else {
                throw TransportError.protocol("first data is not channel/snapshot")
            }
            r.awaitingSnapshot = false
        }
        if message.method == "channel/snapshot" {
            guard try message.decode(ChannelSnapshotParams.self).snapshot.resource == message.channel else {
                throw TransportError.protocol("snapshot channel mismatch")
            }
        }
    }

    private func enqueue(_ r: Channel, message: AHPNotificationMessage, bytes: Int,
                         releaseBytes: Int) async throws {
        let epoch = r.epoch
        let token = AHPReleaseToken { [weak self] in
            await self?.release(channel: message.channel, epoch: epoch, bytes: releaseBytes)
        }
        let delivery = AHPDelivery(message: message, payload: try message.payload(),
                                   receivedBytes: bytes, epoch: epoch, releaseBytes: releaseBytes,
                                   releaseBody: { await token.release() })
        let combined = try await r.subscription.enqueue(delivery, coalescers: config.coalescers,
                                                        coalescing: r.limits != nil && r.options.window?.coalescing != false)
        await publish(message.channel, kind: combined ? "coalesced" : nil)
    }

    private func release(channel: String, epoch: UInt64, bytes: Int) async {
        guard let r = channels[channel], r.epoch == epoch, r.limits != nil, !closed, bytes > 0 else { return }
        let wasFull = r.received - r.released >= r.limits!.clientReceive.windowBytes
        r.released += bytes
        let threshold = min(16_384, max(1, r.limits!.clientReceive.windowBytes / 4))
        if wasFull || r.released - r.creditSent >= threshold {
            await flushCredit(channel)
        } else if r.creditTask == nil {
            r.creditTask = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(5))
                if !Task.isCancelled { await self?.flushCredit(channel) }
            }
        }
        await publish(channel)
    }

    private func flushCredit(_ channel: String) async {
        guard let r = channels[channel], !closed, r.limits != nil, r.released > r.creditSent else { return }
        r.creditTask?.cancel(); r.creditTask = nil
        r.creditSent = r.released
        do {
            let message = try AHPNotificationMessage(
                method: "channel/credit", params: ChannelCreditParams(channel: channel, consumedBytes: r.creditSent))
            let epoch = r.epoch
            try await writeBody(message.wire(), { [weak self] in
                guard let self else { throw CancellationError() }
                try await self.validateCredit(channel, epoch: epoch)
            }, false)
            await publish(channel, kind: "creditSent")
        } catch is CancellationError {
        } catch AHPWindowingError.backpressure {
            r.creditSent = 0
            r.creditTask = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(5))
                if !Task.isCancelled { await self?.flushCredit(channel) }
            }
        } catch { await fail(error) }
    }

    private func validateCredit(_ channel: String, epoch: UInt64) throws {
        guard !closed, let r = channels[channel], r.epoch == epoch, r.limits != nil else {
            throw CancellationError()
        }
    }

    func send(_ message: AHPNotificationMessage) async throws {
        try Task.checkCancellation()
        guard !closed else { throw AHPClientError.shutdown }
        if let r = channels[message.channel] {
            if message.method == "tcp/data" {
                guard !r.reset, !r.sentEOF, !r.sends.contains(where: { $0.message.method == "tcp/eof" }) else {
                    throw TransportError.protocol("TCP data after EOF/reset")
                }
                try validateTCPData(message)
            } else if message.method == "tcp/eof" {
                guard !r.reset, !r.sentEOF, !r.sends.contains(where: { $0.message.method == "tcp/eof" }) else {
                    throw TransportError.protocol("duplicate TCP EOF/reset")
                }
            } else if message.method == "tcp/reset" {
                r.reset = true
                r.epoch &+= 1
                r.assembly = nil; r.assemblyBytes = 0
                failSends(r, error: AHPWindowingError.subscriptionDropped(message.channel))
                await r.subscription.discardQueuedData()
                await publish(message.channel, kind: "dropped")
                try await writeBody(message.wire(), nil, countsAgainstWindow(message.method))
                try await r.subscription.close()
                return
            }
        }
        guard let r = channels[message.channel], countsAgainstWindow(message.method), r.limits != nil else {
            try await writeBody(message.wire(), nil, countsAgainstWindow(message.method))
            return
        }
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                do {
                    let wire = String(decoding: try message.wire(), as: UTF8.self)
                    let entry = SendEntry(id: id, message: message, wire: wire, reply: continuation)
                    if r.options.window?.coalescing != false, let tail = r.sends.last, !tail.started, !tail.emitting,
                       let merged = try coalesce(tail.message, message, direction: "outbound", custom: config.coalescers) {
                        let mergedWire = String(decoding: try merged.wire(), as: UTF8.self)
                        let mergedBytes = ahpUTF16Bytes(mergedWire)
                        let behind = queuedBehindHead(r)
                        let queued = behind - tail.bytes + mergedBytes
                        guard queued <= config.maxBufferedSendBytes else {
                            throw AHPWindowingError.backpressure
                        }
                        r.buffered += mergedBytes - tail.bytes
                        tail.message = merged; tail.wire = mergedWire; tail.bytes = mergedBytes
                        tail.bufferedBytes = mergedBytes
                        tail.replies.append(continuation)
                        tail.ids.append(id)
                        tail.messages.append(message)
                        Task { await self.publish(message.channel, kind: "coalesced") }
                    } else {
                        guard r.sends.isEmpty || queuedBehindHead(r) + entry.bytes <= config.maxBufferedSendBytes else {
                            throw AHPWindowingError.backpressure
                        }
                        r.buffered += entry.bytes
                        r.sends.append(entry)
                    }
                    startScheduler()
                } catch { continuation.resume(throwing: error) }
            }
        } onCancel: {
            Task { await self.cancelSend(channel: message.channel, id: id) }
        }
    }

    func dispatch(_ action: StateAction, channel: String, clientSeq: Int?) async throws -> DispatchHandle {
        try await dispatchBody(action, channel, clientSeq)
    }

    func update(channel: String, options: AHPSubscriptionOptions) async throws -> AHPSubscription {
        try await updateBody(channel, options)
    }

    func unsubscribe(_ channel: String) async throws {
        await drop(channel, error: nil)
        try await write(AHPNotificationMessage(method: "unsubscribe", params: UnsubscribeParams(channel: channel)).wire())
    }

    func drop(_ channel: String, error: Error?) async {
        guard let r = channels.removeValue(forKey: channel) else { return }
        for index in order.indices.reversed() where order[index] == channel {
            order.remove(at: index)
            if index < cursor { cursor -= 1 }
        }
        cursor = order.isEmpty ? 0 : cursor % order.count
        r.creditTask?.cancel()
        failSends(r, error: error ?? AHPClientError.shutdown)
        await r.subscription.removeManagedRegistration()
        await r.subscription.finish(error)
        var value = status(r)
        value.writable = false
        let event = AHPFlowControlEvent(channel: channel, kind: "dropped", status: value)
        for listener in telemetry.values { listener.yield(event) }
    }

    func disconnect(_ error: Error) async {
        guard !closed else { return }
        closed = true
        scheduler?.cancel(); scheduler = nil
        for (channel, r) in channels {
            r.creditTask?.cancel()
            r.assembly = nil
            failSends(r, error: error)
            await publish(channel, kind: channel.hasPrefix("ahp-tcp:") ? "dropped" : nil)
            if await r.subscription.managed, !channel.hasPrefix("ahp-tcp:") {
                await r.subscription.detach()
            } else {
                await r.subscription.removeManagedRegistration()
                await r.subscription.finish(error)
            }
        }
        for listener in telemetry.values { listener.finish() }
        telemetry.removeAll()
    }

    private func startScheduler() {
        guard scheduler == nil, !closed else { return }
        scheduler = Task { await self.drain() }
    }

    private func drain() async {
        for channel in order { await publish(channel) }
        while !closed && !Task.isCancelled {
            var selected: (String, Channel, SendEntry)?
            for _ in 0..<order.count {
                let channel = order[cursor % order.count]
                cursor = (cursor + 1) % order.count
                guard let r = channels[channel], let entry = r.sends.first else { continue }
                if r.pauseNewData && !entry.started { continue }
                if let limits = r.limits, r.sent - r.credited >= limits.hostReceive.windowBytes { continue }
                selected = (channel, r, entry)
                break
            }
            guard let (channel, r, entry) = selected else { break }
            let oldOffset = entry.offset
            do {
                let (wire, final, originalBytes) = try nextFrame(entry, channel: channel, record: r)
                entry.emitting = true
                let id = UUID()
                entry.emissionID = id
                let epoch = r.epoch
                let bytes = ahpUTF16Bytes(wire)
                try await writeBody(Data(wire.utf8), { [weak self] in
                    guard let self else { throw AHPClientError.shutdown }
                    try await self.commitSend(channel: channel, id: id, epoch: epoch, bytes: bytes)
                }, false)
                entry.emitting = false
                if r.sends.first === entry {
                    r.buffered -= originalBytes
                    entry.bufferedBytes -= originalBytes
                    entry.headAllowance = max(0, entry.headAllowance - originalBytes)
                }
                if final {
                    if r.sends.first === entry {
                        r.sends.removeFirst()
                        if let head = r.sends.first { head.headAllowance = head.bufferedBytes }
                    }
                    let replies = entry.replies
                    entry.replies.removeAll()
                    for reply in replies { reply.resume() }
                    let waiters = r.modeWaiters.values
                    r.modeWaiters.removeAll()
                    for waiter in waiters { waiter.resume() }
                    await publish(channel, kind: entry.scalars == nil ? nil : "fragmentedMessageSent")
                } else {
                    await publish(channel)
                }
            } catch is EmissionDeferred {
                entry.offset = oldOffset
                entry.emitting = false
                if !entry.started { entry.scalars = nil }
            } catch is CancellationError {
                entry.emitting = false
            } catch AHPWindowingError.backpressure {
                failSends(r, error: AHPWindowingError.backpressure)
                await publish(channel)
            } catch {
                failSends(r, error: error)
                await fail(error)
                break
            }
        }
        scheduler = nil
    }

    private struct EmissionDeferred: Error {}

    private func write(_ data: Data) async throws { try await writeBody(data, nil, false) }

    private func commitSend(channel: String, id: UUID, epoch: UInt64, bytes: Int) async throws {
        guard !closed, let r = channels[channel], let entry = r.sends.first, entry.emissionID == id else {
            throw CancellationError()
        }
        guard r.epoch == epoch else { throw EmissionDeferred() }
        if let limits = r.limits {
            guard r.sent - r.credited < limits.hostReceive.windowBytes,
                  bytes <= limits.hostReceive.maximumFrameBytes else { throw EmissionDeferred() }
            r.sent = try adding(r.sent, bytes)
        }
        entry.started = true
        if entry.message.method == "tcp/eof" { r.sentEOF = true }
        await publish(channel)
    }

    private func nextFrame(_ entry: SendEntry, channel: String, record: Channel) throws -> (String, Bool, Int) {
        guard let limits = record.limits else { return (entry.wire, true, entry.bufferedBytes) }
        let maximum = limits.hostReceive.maximumFrameBytes
        if entry.scalars == nil && entry.bytes <= maximum { return (entry.wire, true, entry.bufferedBytes) }
        if entry.scalars == nil { entry.scalars = Array(entry.wire.unicodeScalars) }
        let scalars = entry.scalars!
        func frame(_ count: Int) throws -> String {
            let text = String(String.UnicodeScalarView(scalars[entry.offset..<(entry.offset + count)]))
            let message = try AHPNotificationMessage(method: "channel/frame", params: ChannelFrameParams(
                channel: channel, data: text, final: entry.offset + count == scalars.count ? true : nil))
            return String(decoding: try message.wire(), as: UTF8.self)
        }
        let smallest = try frame(1)
        guard ahpUTF16Bytes(smallest) <= maximum else {
            throw TransportError.protocol("frame envelope cannot carry a scalar")
        }
        let remaining = limits.hostReceive.windowBytes - (record.sent - record.credited)
        let target = min(maximum, max(remaining, ahpUTF16Bytes(smallest)))
        var low = 1
        var high = min(scalars.count - entry.offset, target / 2)
        while low < high {
            let middle = (low + high + 1) / 2
            if ahpUTF16Bytes(try frame(middle)) <= target { low = middle } else { high = middle - 1 }
        }
        let text = try frame(low)
        let original = String(String.UnicodeScalarView(scalars[entry.offset..<(entry.offset + low)]))
        entry.offset += low
        return (text, entry.offset == scalars.count, ahpUTF16Bytes(original))
    }

    private func cancelSend(channel: String, id: UUID) async {
        guard let r = channels[channel], let index = r.sends.firstIndex(where: { $0.ids.contains(id) }),
              !r.sends[index].started else { return }
        let entry = r.sends.remove(at: index)
        r.buffered -= entry.bytes
        let removed = entry.ids.firstIndex(of: id)!
        entry.ids.remove(at: removed)
        entry.messages.remove(at: removed)
        entry.replies.remove(at: removed).resume(throwing: CancellationError())
        do {
            var replacements: [SendEntry] = []
            for source in entry.messages.indices {
                let message = entry.messages[source]
                if let tail = replacements.last,
                   let combined = try coalesce(tail.message, message, direction: "outbound", custom: config.coalescers) {
                    tail.message = combined
                    tail.wire = String(decoding: try combined.wire(), as: UTF8.self)
                    tail.bytes = ahpUTF16Bytes(tail.wire)
                    tail.bufferedBytes = tail.bytes
                    tail.replies.append(entry.replies[source])
                    tail.ids.append(entry.ids[source])
                    tail.messages.append(message)
                } else {
                    replacements.append(SendEntry(id: entry.ids[source], message: message,
                        wire: String(decoding: try message.wire(), as: UTF8.self), reply: entry.replies[source]))
                }
            }
            let bytes = replacements.reduce(0) { $0 + $1.bytes }
            let head = index == 0 ? replacements.first : r.sends.first
            let headBytes = head.map { min($0.bufferedBytes, $0.headAllowance) } ?? 0
            guard r.buffered + bytes - headBytes <= config.maxBufferedSendBytes else {
                throw AHPWindowingError.backpressure
            }
            r.sends.insert(contentsOf: replacements, at: index)
            r.buffered += bytes
        } catch {
            for reply in entry.replies { reply.resume(throwing: error) }
        }
        entry.replies.removeAll()
        if entry.scalars != nil {
            let waiters = r.modeWaiters.values
            r.modeWaiters.removeAll()
            for waiter in waiters { waiter.resume() }
        }
        await publish(channel)
    }

    private func failSends(_ r: Channel, error: Error) {
        let modeWaiters = r.modeWaiters.values
        r.modeWaiters.removeAll()
        for waiter in modeWaiters { waiter.resume(throwing: error) }
        let entries = r.sends
        r.sends.removeAll(); r.buffered = 0
        for entry in entries {
            for reply in entry.replies { reply.resume(throwing: error) }
            entry.replies.removeAll()
        }
    }

    private func status(_ r: Channel) -> AHPFlowControlStatus {
        var value = AHPFlowControlStatus()
        value.mode = r.limits == nil ? "ordinary" : "windowed"
        value.fallbackReason = r.limits == nil ? r.fallback : nil
        value.limits = r.limits
        value.outstandingSendBytes = r.sent - r.credited
        value.bufferedSendBytes = r.buffered
        value.bufferedReceiveBytes = r.received - r.released
        value.writable = !closed && !r.reset && queuedBehindHead(r) < config.maxBufferedSendBytes &&
            (r.limits.map { r.sent - r.credited < $0.hostReceive.windowBytes } ?? true)
        return value
    }

    private func queuedBehindHead(_ r: Channel) -> Int {
        r.buffered - (r.sends.first.map { min($0.bufferedBytes, $0.headAllowance) } ?? 0)
    }

    private func publish(_ channel: String, kind: String? = nil) async {
        guard let r = channels[channel] else { return }
        let snapshot = status(r)
        let transition = r.lastWritable == snapshot.writable ? nil : (snapshot.writable ? "unblocked" : "blocked")
        r.lastWritable = snapshot.writable
        r.statusRevision &+= 1
        guard let value = await r.subscription.updateStatus(snapshot, engine: self, revision: r.statusRevision) else { return }
        for eventKind in [kind, transition].compactMap({ $0 }) {
            for listener in telemetry.values {
                listener.yield(.init(channel: channel, kind: eventKind, status: value))
            }
        }
    }

    private func validate(_ limits: ChannelReceiveLimits) throws {
        guard limits.windowBytes > 0, limits.maximumFrameBytes >= 1024,
              limits.windowBytes <= 9_007_199_254_740_991,
              limits.maximumFrameBytes <= 9_007_199_254_740_991 else {
            throw TransportError.protocol("invalid window limits")
        }
    }
    private func validateTCPData(_ message: AHPNotificationMessage) throws {
        let value = try message.decode(TcpDataParams.self).data
        guard !value.isEmpty, let data = Data(base64Encoded: value), data.base64EncodedString() == value else {
            throw TransportError.protocol("invalid padded TCP base64")
        }
    }
    private func validateAccepted(_ limits: ChannelFlowControl, offer: ChannelReceiveLimits) throws {
        try validate(limits.clientReceive); try validate(limits.hostReceive)
        guard limits.clientReceive.windowBytes <= offer.windowBytes,
              limits.clientReceive.maximumFrameBytes <= offer.maximumFrameBytes else {
            throw TransportError.protocol("accepted limits exceed offer")
        }
    }
    private func adding(_ a: Int, _ b: Int) throws -> Int {
        let (value, overflow) = a.addingReportingOverflow(b)
        guard !overflow, value <= 9_007_199_254_740_991 else {
            throw TransportError.protocol("window counter overflow")
        }
        return value
    }
}
