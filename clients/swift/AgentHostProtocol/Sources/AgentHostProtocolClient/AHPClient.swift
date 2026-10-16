// AHPClient — single-host JSON-RPC client over a pluggable `AHPTransport`.
//
// Owns request/response correlation, per-URI subscription fan-out, a top-level
// `events` multicast tap, and connection-state notifications. Modelled after
// the Rust `ahp::Client` but structured around Swift actors and AsyncStreams.

import Foundation
import AgentHostProtocol

/// Async JSON-RPC client driving a pluggable `AHPTransport`.
///
/// Lifecycle:
///
/// ```swift
/// let transport = URLSessionWebSocketTransport(url: url)
/// let client = AHPClient(transport: transport)
///
/// // Attach taps BEFORE `connect()` so handshake notifications aren't missed.
/// let events = await client.events
/// let states = await client.stateChanges
///
/// try await client.connect()
/// let init = try await client.initialize(
///     clientId: "my-client",
///     protocolVersions: ["0.2.0"],
///     initialSubscriptions: [RootResourceURI]
/// )
/// // ... use client ...
/// await client.shutdown()
/// ```
///
/// `AHPClient` is a *single-shot* connection — reopening a dropped transport
/// and replaying subscriptions belongs to a higher layer. `reconnect(...)` is
/// only the typed JSON-RPC handshake on the current transport.
public actor AHPClient {

    // MARK: - Stored state

    private let transport: AHPTransport
    private let config: AHPClientConfig

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        // Server is JSON-typed; default settings are correct.
        return e
    }()
    private let decoder: JSONDecoder = JSONDecoder()

    // ── Sequence numbers ─────────────────────────────────────────────────
    private var nextRequestId: Int = 1
    private var nextClientSeq: Int = 1

    // ── Pending request continuations ────────────────────────────────────
    /// In-flight JSON-RPC requests keyed by id. Resolves with the raw `result`
    /// AnyCodable on success or fails with `AHPClientError` on error/timeout/
    /// shutdown.
    private var pending: [Int: PendingEntry] = [:]

    // ── Subscription registry ────────────────────────────────────────────
    /// Per-URI listeners. Each entry holds one or more `AsyncStream` continuations
    /// for `attachSubscription`/`subscribe` callers. Streams are unbounded —
    /// dropping action envelopes desyncs the consumer's reducer mirror.
    private var perUriListeners: [String: [SubscriptionListener]] = [:]

    // ── Top-level multicast taps ─────────────────────────────────────────
    /// Multicast listeners for `events` (top-level fan-out tagged with resource).
    private var eventListeners: [EventListener] = []
    /// Multicast listeners for `stateChanges`.
    private var stateListeners: [StateListener] = []

    // ── Outbound writer ──────────────────────────────────────────────────
    /// Outbound channel carries raw JSON bytes. Going via JSONSerialization
    /// preserves the NSNumber Bool/Int distinction that AnyCodable would
    /// otherwise erase on Apple platforms.
    private struct OutboundWrite: Sendable {
        let data: Data
        let completion: UUID?
        let beforeWrite: AHPBeforeWrite?
        init(data: Data, completion: UUID?, beforeWrite: AHPBeforeWrite? = nil) {
            self.data = data
            self.completion = completion
            self.beforeWrite = beforeWrite
        }
    }
    private var outboundContinuation: AsyncStream<OutboundWrite>.Continuation?
    private var windowingEngine: AHPWindowingEngine?
    private var requestContexts: [Int: (String, Data)] = [:]
    private var requestOptions: [Int: AHPSubscriptionOptions] = [:]
    private var flowNegotiations: Set<Int> = []
    private struct SubscriptionRequest {
        let owner: AHPSubscription
        let created: Bool
    }
    private var requestSubscriptions: [Int: SubscriptionRequest] = [:]
    private var abandonedRequests: Set<Int> = []
    private var windowWrites: [UUID: CheckedContinuation<Void, Error>] = [:]
    private var callerWrites: Set<UUID> = []
    private var writerTask: Task<Void, Never>?
    private var keepAliveTask: Task<Void, Never>?

    // ── Receive loop ─────────────────────────────────────────────────────
    private var receiveTask: Task<Void, Never>?

    // ── State ────────────────────────────────────────────────────────────
    public private(set) var connectionState: ConnectionState = .disconnected
    public private(set) var lastSeenServerSeq: Int = 0
    private var didShutdown: Bool = false

    /// Handler for inbound server-initiated requests (the symmetrical
    /// `resource*` family). `nil` → the client replies `MethodNotFound`.
    private var serverRequestHandler: ServerRequestHandler?

    // MARK: - Init

    public init(transport: AHPTransport, config: AHPClientConfig = .default) {
        self.transport = transport
        self.config = config
    }

    // MARK: - Lifecycle

    /// Start the receive and writer loops over the transport.
    ///
    /// The transport is treated as already-open; connect failures (TLS,
    /// handshake) are the transport's concern. After `connect()` returns,
    /// `connectionState == .connected` and the next call should typically be
    /// `initialize(...)` (or `reconnect(...)`).
    ///
    /// You should attach `events` and `stateChanges` taps *before* calling
    /// `connect()` if you need to observe handshake-time notifications.
    public func connect() async throws {
        if didShutdown {
            throw AHPClientError.shutdown
        }
        if connectionState == .connected {
            return
        }
        await transition(to: .connecting)

        // Set up the writer pipeline. Sends are pushed onto `outboundContinuation`
        // from inside the actor and the writer Task drains and serializes them
        // to `transport.send`. This avoids two `await transport.send` calls
        // racing under actor reentrancy.
        var cont: AsyncStream<OutboundWrite>.Continuation!
        let outbound = AsyncStream<OutboundWrite>(bufferingPolicy: .unbounded) { c in
            cont = c
        }
        self.outboundContinuation = cont
        let transport = self.transport
        self.writerTask = Task { [weak self] in
            for await packet in outbound {
                if let before = packet.beforeWrite {
                    do { try await before() }
                    catch {
                        if let id = packet.completion { await self?.finishWindowWrite(id, error: error) }
                        continue
                    }
                }
                guard let text = String(data: packet.data, encoding: .utf8) else {
                    if let id = packet.completion {
                        await self?.finishWindowWrite(id, error: TransportError.protocol("invalid UTF-8"))
                    }
                    await self?.handleTransportFailure(
                        TransportError.protocol("outbound bytes are not valid UTF-8")
                    )
                    return
                }
                do {
                    try await transport.send(.text(text))
                    if let id = packet.completion { await self?.finishWindowWrite(id, error: nil) }
                } catch {
                    if let id = packet.completion { await self?.finishWindowWrite(id, error: error) }
                    if case AHPWindowingError.backpressure = error { continue }
                    await self?.handleTransportFailure(error)
                    return
                }
            }
        }

        // Start the receive loop.
        self.receiveTask = Task { [weak self] in
            await self?.runReceiveLoop()
        }

        startKeepAliveIfNeeded()

        await transition(to: .connected)
    }

    /// Shut the client down: cancel loops, close the transport, fail pending
    /// requests with `AHPClientError.shutdown`, and finish all subscription
    /// streams.
    public func shutdown() async {
        if didShutdown { return }
        didShutdown = true
        outboundContinuation?.finish()
        outboundContinuation = nil
        let writer = writerTask
        writerTask = nil
        keepAliveTask?.cancel()
        keepAliveTask = nil

        receiveTask?.cancel()
        receiveTask = nil

        await windowingEngine?.disconnect(AHPClientError.shutdown)
        failAllPending(with: .shutdown)
        // Preserve already-enqueued ordinary notifications on graceful close.
        // Closing a stalled transport also bounds teardown of a pending write.
        let transport = self.transport
        let watchdog = Task {
            try? await Task.sleep(for: .seconds(1))
            if !Task.isCancelled { try? await transport.close() }
        }
        await writer?.value
        watchdog.cancel()
        try? await transport.close()

        finishAllSubscriptions()
        finishAllEventListeners()
        // Final state transition (also fans out).
        await transition(to: .disconnected)
        finishAllStateListeners()
    }

    private func startKeepAliveIfNeeded() {
        keepAliveTask?.cancel()
        keepAliveTask = nil

        guard case .ping(let interval, let timeout) = config.keepAlive,
              let pingTransport = transport as? AHPKeepAliveTransport
        else { return }

        keepAliveTask = Task { [weak self, pingTransport] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(for: interval)
                    if Task.isCancelled { return }
                    if self == nil { return }
                    try await pingTransport.sendPing(timeout: timeout)
                } catch {
                    if Task.isCancelled { return }
                    await self?.handleTransportFailure(error)
                    return
                }
            }
        }
    }

    // MARK: - Multicast taps

    /// A multicast stream of every event delivered to any subscription on
    /// this client, tagged with the resource URI (if known).
    ///
    /// Each call returns a *fresh* stream. To capture handshake notifications,
    /// call this property *before* `connect()` and `initialize(...)` so the
    /// receive loop has a continuation to deliver into.
    ///
    /// The stream uses `.bufferingNewest(config.subscriptionBufferSize)`; slow
    /// consumers will lose advisory events. For a delivery-guaranteed stream
    /// of action envelopes, use `subscribe(uri)` instead.
    public var events: AsyncStream<ClientEvent> {
        let bufferSize = config.subscriptionBufferSize
        let listenerId = nextListenerId()
        return AsyncStream<ClientEvent>(bufferingPolicy: .bufferingNewest(bufferSize)) { cont in
            let listener = EventListener(id: listenerId, continuation: cont)
            self.eventListeners.append(listener)
            cont.onTermination = { [weak self] _ in
                Task { [weak self] in
                    await self?.removeEventListener(id: listenerId)
                }
            }
        }
    }

    /// A multicast stream of `ConnectionState` transitions.
    ///
    /// Each call returns a *fresh* stream. The current value is available
    /// synchronously via `connectionState`; this stream only delivers
    /// *future* changes after attachment.
    public var stateChanges: AsyncStream<ConnectionState> {
        let bufferSize = max(8, config.subscriptionBufferSize)
        let listenerId = nextListenerId()
        return AsyncStream<ConnectionState>(bufferingPolicy: .bufferingNewest(bufferSize)) { cont in
            let listener = StateListener(id: listenerId, continuation: cont)
            self.stateListeners.append(listener)
            cont.onTermination = { [weak self] _ in
                Task { [weak self] in
                    await self?.removeStateListener(id: listenerId)
                }
            }
        }
    }

    // MARK: - Protocol commands

    /// Issue the `initialize` handshake.
    @discardableResult
    public func initialize(
        clientId: String,
        protocolVersions: [String],
        initialSubscriptions: [String] = []
    ) async throws -> InitializeResult {
        guard !initialSubscriptions.contains(where: { $0.hasPrefix("ahp-tcp:") }) else {
            throw TransportError.protocol("TCP cannot use initialSubscriptions")
        }
        let params = InitializeParams(
            channel: RootResourceURI,
            protocolVersions: protocolVersions,
            clientId: clientId,
            initialSubscriptions: initialSubscriptions.isEmpty ? nil : initialSubscriptions
        )
        let result: InitializeResult = try await request(method: "initialize", params: params)
        if result.serverSeq > lastSeenServerSeq {
            lastSeenServerSeq = result.serverSeq
        }
        return result
    }

    /// Re-establish identity on a fresh transport with `reconnect`.
    ///
    /// This is *only* the typed handshake on the current connection — opening a
    /// new transport, backoff, and generation tracking belong to a higher
    /// layer.
    @discardableResult
    public func reconnect(
        clientId: String,
        lastSeenServerSeq: Int,
        subscriptions: [String]
    ) async throws -> ReconnectResult {
        let params = ReconnectParams(
            channel: RootResourceURI,
            clientId: clientId,
            lastSeenServerSeq: lastSeenServerSeq,
            subscriptions: subscriptions
        )
        let result: ReconnectResult = try await request(method: "reconnect", params: params)
        switch result {
        case .replay(let r):
            if let last = r.actions.last, last.serverSeq > self.lastSeenServerSeq {
                self.lastSeenServerSeq = last.serverSeq
            }
        case .snapshot(let r):
            let maxSeq = r.snapshots.map(\.fromSeq).max() ?? self.lastSeenServerSeq
            if maxSeq > self.lastSeenServerSeq {
                self.lastSeenServerSeq = maxSeq
            }
        }
        return result
    }

    @discardableResult
    public func reconnect(clientId: String, lastSeenServerSeq: Int, subscriptions: [String],
                          windows: ChannelDeliveryResumeOptions) async throws -> ReconnectResult {
        let result: ReconnectResult = try await request(method: "reconnect", params: ReconnectParams(
            channel: RootResourceURI, clientId: clientId, lastSeenServerSeq: lastSeenServerSeq,
            subscriptions: subscriptions, windows: windows))
        switch result {
        case .replay(let value): self.lastSeenServerSeq = max(self.lastSeenServerSeq, value.actions.map(\.serverSeq).max() ?? 0)
        case .snapshot(let value): self.lastSeenServerSeq = max(self.lastSeenServerSeq, value.snapshots.map(\.fromSeq).max() ?? 0)
        }
        return result
    }

    /// Observe flow control without owning or releasing any data.
    public var flowControlEvents: AsyncStream<AHPFlowControlEvent> {
        get async { await flowEngine().events }
    }

    /// Obtain the owner installed by a typed or raw flow-control handshake.
    public func subscription(for channel: String) async -> AHPSubscription? {
        await windowingEngine?.subscription(channel)
    }

    internal func dropManagedSubscription(_ channel: String, error: Error) async {
        await windowingEngine?.drop(channel, error: error)
    }

    private func flowEngine() -> AHPWindowingEngine {
        if let windowingEngine { return windowingEngine }
        let engine = AHPWindowingEngine(config: config.windowing, write: { [weak self] data, before, limited in
            guard let self else { throw AHPClientError.shutdown }
            try await self.writeWindowData(data, beforeWrite: before, callerInitiated: limited)
        }, fail: { [weak self] error in
            await self?.handleTransportFailure(error)
        }, dispatch: { [weak self] action, channel, seq in
            guard let self else { throw AHPClientError.shutdown }
            return try await self.dispatchAndWait(action, channel: channel, clientSeq: seq)
        }, update: { [weak self] channel, options in
            guard let self else { throw AHPClientError.shutdown }
            return try await self.subscribe(channel, options: options)
        })
        windowingEngine = engine
        return engine
    }

    private func writeWindowData(_ data: Data, beforeWrite: AHPBeforeWrite? = nil,
                                 callerInitiated: Bool = false) async throws {
        guard !didShutdown, let continuation = outboundContinuation else { throw AHPClientError.shutdown }
        guard !callerInitiated || callerWrites.count < 256 else { throw AHPWindowingError.backpressure }
        try await withCheckedThrowingContinuation { completion in
            let id = UUID()
            windowWrites[id] = completion
            if callerInitiated { callerWrites.insert(id) }
            continuation.yield(.init(data: data, completion: id, beforeWrite: beforeWrite))
        }
    }

    private func finishWindowWrite(_ id: UUID, error: Error?) {
        callerWrites.remove(id)
        guard let reply = windowWrites.removeValue(forKey: id) else { return }
        if let error { reply.resume(throwing: error) } else { reply.resume() }
    }

    private func dispatchAndWait(_ action: StateAction, channel: String, clientSeq: Int?)
        async throws -> DispatchHandle {
        let seq = clientSeq ?? nextClientSeq
        if seq >= nextClientSeq { nextClientSeq = seq + 1 }
        try await send(method: "dispatchAction",
                       params: DispatchActionParams(channel: channel, clientSeq: seq, action: action))
        return DispatchHandle(clientSeq: seq)
    }

    /// Send a notification and await its actual transport write, including ordinary fallback.
    public func send<P: Encodable & Sendable>(method: String, params: P) async throws {
        try await flowEngine().send(AHPNotificationMessage(method: method, params: params))
    }

    private func transportWindowCapabilities() async -> AHPTransportCapabilities {
        guard let transport = transport as? AHPWindowingTransport else { return .init() }
        return await transport.windowingCapabilities
    }

    private func prepareRequestContext(method: String, params: Data)
        async throws -> (Data, AHPSubscriptionOptions?) {
        if method == "subscribe", let request = try? decoder.decode(SubscribeParams.self, from: params),
           request.channel.hasPrefix("ahp-tcp:"), request.flowControl == nil {
            throw TransportError.protocol("TCP requires windowed subscription options")
        }
        if method == "reconnect", let request = try? decoder.decode(ReconnectParams.self, from: params),
           request.subscriptions.contains(where: { $0.hasPrefix("ahp-tcp:") }) {
            throw TransportError.protocol("TCP cannot reconnect")
        }
        if method == "subscribe", let request = try? decoder.decode(SubscribeParams.self, from: params),
           windowingEngine != nil || request.flowControl != nil {
            let engine = flowEngine()
            let capabilities = await transportWindowCapabilities()
            if let offer = request.flowControl?.receive, !capabilities.preservesOriginalJSONText {
                let options = AHPSubscriptionOptions.windowed(
                    windowBytes: offer.windowBytes, maximumFrameBytes: offer.maximumFrameBytes,
                    delivery: request.delivery, view: request.view)
                _ = try await engine.prepare(channel: request.channel, options: options, capabilities: capabilities)
                var object = try JSONSerialization.jsonObject(with: params) as! [String: Any]
                object.removeValue(forKey: "flowControl")
                let adjusted = try JSONSerialization.data(withJSONObject: object)
                try await engine.prepareGeneric(adjusted, capabilities: capabilities)
                return (adjusted, options)
            }
            do {
                try await engine.prepareGeneric(params, capabilities: capabilities)
                if request.flowControl == nil { try await engine.pauseForOrdinarySubscribe(request.channel) }
            } catch {
                await engine.abortSubscribe(request.channel, error: error)
                throw error
            }
        } else if method == "reconnect",
                  windowingEngine != nil || (try? decoder.decode(ReconnectParams.self, from: params).windows) != nil {
            try await flowEngine().prepareReconnect(params, capabilities: transportWindowCapabilities())
        }
        return (params, nil)
    }

    private func flowNegotiation(method: String, params: Data) async -> Bool {
        if method == "subscribe", let request = try? decoder.decode(SubscribeParams.self, from: params) {
            if request.flowControl != nil { return true }
            return await windowingEngine?.isWindowed(request.channel) ?? false
        }
        if method == "reconnect" {
            return (try? decoder.decode(ReconnectParams.self, from: params).windows) != nil
        }
        return false
    }

    private func checkRequestAdmission(method: String, params: Data) async throws {
        do {
            try Task.checkCancellation()
            guard !didShutdown, outboundContinuation != nil else { throw AHPClientError.shutdown }
        } catch {
            if method == "subscribe", let request = try? decoder.decode(SubscribeParams.self, from: params) {
                await windowingEngine?.abortSubscribe(request.channel)
            }
            throw error
        }
    }

    public func subscribe(_ uri: String, options: AHPSubscriptionOptions) async throws -> AHPSubscription {
        try await subscribeManaged(uri, options: options, observer: nil, onPrepared: nil)
    }

    internal func subscribeManaged(_ uri: String, options: AHPSubscriptionOptions,
                                   observer: (@Sendable (AHPDeliveryPayload) async -> Void)?,
                                   onPrepared: (@Sendable (AHPSubscription) async throws -> Void)?)
        async throws -> AHPSubscription {
        guard !didShutdown, outboundContinuation != nil else { throw AHPClientError.shutdown }
        let (subscription, offer, created) = try await flowEngine().prepare(
            channel: uri, options: options, capabilities: transportWindowCapabilities())
        do {
            if let observer {
                await subscription.markManaged()
                await subscription.setObserver(observer)
            }
            try await onPrepared?(subscription)
            let _: SubscribeResult = try await requestWithOptions(method: "subscribe", params: SubscribeParams(
                channel: uri, delivery: options.delivery, view: options.view,
                flowControl: offer.map { SubscriptionFlowControlOptions(receive: $0) }),
                subscriptionOptions: options, owner: subscription, created: created)
            return subscription
        } catch {
            await windowingEngine?.abortPrepared(subscription, error: error)
            throw error
        }
    }

    internal func restoreManagedSubscriptions(_ subscriptions: [AHPSubscription])
        async throws -> ChannelDeliveryResumeOptions {
        var items: [ChannelDeliveryResumeParams] = []
        for subscription in subscriptions {
            let pendingOffer = await subscription.pendingWindowOffer
            let wasWindowed = await subscription.status().mode == "windowed" || pendingOffer
            let options = await subscription.options
            let (_, offer, _) = try await flowEngine().prepare(
                channel: subscription.channel, options: options,
                capabilities: transportWindowCapabilities(), retained: subscription)
            if let offer, wasWindowed {
                items.append(.init(channel: subscription.channel,
                                   flowControl: .init(receive: offer),
                                   lastAppliedServerSeq: await subscription.lastAppliedServerSeq))
            }
        }
        return .init(items: items)
    }

    /// Protocol-level liveness `ping`.
    ///
    /// Verifies the connection is still alive and keeps it from being closed
    /// by idle-timeout intermediaries (proxies, load balancers, etc.). `ping`
    /// is a connection-level command scoped to the root channel and carries no
    /// payload in either direction — the response itself is the signal. The
    /// server responds regardless of whether `initialize` has completed or any
    /// subscriptions are held.
    ///
    /// This is the protocol-level ping (usable over any transport); it is
    /// distinct from transport-level WebSocket ping frames exposed via
    /// ``AHPKeepAliveTransport``.
    public func ping() async throws {
        let paramsData = try encoder.encode([ "channel": RootResourceURI ])
        _ = try await requestRaw(method: "ping", paramsData: paramsData)
    }

    /// Subscribe to a channel URI. Returns the subscribe result and a fresh
    /// stream of subsequent events. The result's `snapshot` is `nil` with
    /// windowed delivery, and from older hosts for channels with no state.
    ///
    /// If the request fails (RPC error, timeout, transport drop), the local
    /// listener is removed and its stream finished — callers don't need to
    /// clean up the partially-attached subscription.
    public func subscribe(
        _ uri: String,
        delivery: SubscriptionDeliveryOptions? = nil,
        view: SubscribeView? = nil
    ) async throws -> (SubscribeResult, AsyncStream<SubscriptionEvent>) {
        let (stream, listenerId) = attachSubscriptionInternal(uri)
        do {
            let result: SubscribeResult = try await request(
                method: "subscribe",
                params: SubscribeParams(channel: uri, delivery: delivery, view: view)
            )
            return (result, stream)
        } catch {
            removeAndFinishSubscriptionListener(uri: uri, id: listenerId)
            throw error
        }
    }

    /// Attach a subscription stream for `uri` *without* sending a `subscribe`
    /// request. Useful when the URI was included in
    /// `initialize(initialSubscriptions:)`.
    public func attachSubscription(_ uri: String) -> AsyncStream<SubscriptionEvent> {
        let (stream, _) = attachSubscriptionInternal(uri)
        return stream
    }

    /// Internal variant exposing the listener id so callers can detach the
    /// listener if a follow-up wire request fails.
    private func attachSubscriptionInternal(
        _ uri: String
    ) -> (AsyncStream<SubscriptionEvent>, UInt64) {
        let listenerId = nextListenerId()
        let stream = AsyncStream<SubscriptionEvent>(bufferingPolicy: .unbounded) { cont in
            let listener = SubscriptionListener(id: listenerId, continuation: cont)
            var listeners = self.perUriListeners[uri, default: []]
            listeners.append(listener)
            self.perUriListeners[uri] = listeners
            cont.onTermination = { [weak self] _ in
                Task { [weak self] in
                    await self?.removeSubscriptionListener(uri: uri, id: listenerId)
                }
            }
        }
        return (stream, listenerId)
    }

    /// Synchronously remove a subscription listener and finish its stream.
    /// Used by `subscribe()` to roll back a failed attachment.
    private func removeAndFinishSubscriptionListener(uri: String, id: UInt64) {
        guard var listeners = perUriListeners[uri] else { return }
        if let idx = listeners.firstIndex(where: { $0.id == id }) {
            let listener = listeners.remove(at: idx)
            listener.continuation.finish()
            if listeners.isEmpty {
                perUriListeners.removeValue(forKey: uri)
            } else {
                perUriListeners[uri] = listeners
            }
        }
    }

    /// Send `unsubscribe` to the server and finish *all* per-URI streams for
    /// this URI. This is the nuclear option — there is no per-listener
    /// detach. Higher-layer reference counting belongs in a multi-host
    /// runtime.
    public func unsubscribe(_ uri: String) async throws {
        let listeners = perUriListeners.removeValue(forKey: uri) ?? []
        for l in listeners { l.continuation.finish() }
        if let engine = windowingEngine, await engine.subscription(uri) != nil {
            try await engine.unsubscribe(uri)
        } else {
            try await notify(method: "unsubscribe", params: UnsubscribeParams(channel: uri))
        }
    }

    /// Fire a write-ahead `dispatchAction` notification on `channel`. Returns
    /// a handle carrying the assigned `clientSeq`. On an accepted windowed
    /// channel this waits for transport completion; ordinary delivery retains
    /// its fire-and-forget behavior.
    @discardableResult
    public func dispatch(_ action: StateAction, channel: String) async throws -> DispatchHandle {
        let seq = nextClientSeq
        nextClientSeq += 1
        return try await dispatch(action, channel: channel, clientSeq: seq)
    }

    /// Fire a write-ahead `dispatchAction` notification with a caller-owned
    /// `clientSeq`.
    ///
    /// Use this overload when a higher layer owns an outbound action queue and
    /// needs to replay unacknowledged actions across reconnects with stable
    /// sequence numbers. The convenience `dispatch(_:channel:)` overload
    /// remains suitable for simple fire-and-forget clients.
    @discardableResult
    public func dispatch(_ action: StateAction, channel: String, clientSeq: Int) async throws -> DispatchHandle {
        if clientSeq >= nextClientSeq {
            nextClientSeq = clientSeq + 1
        }
        try await notify(
            method: "dispatchAction",
            params: DispatchActionParams(channel: channel, clientSeq: clientSeq, action: action)
        )
        return DispatchHandle(clientSeq: clientSeq)
    }

    // MARK: - Resource commands (send)
    //
    // Typed wrappers around `request` for the symmetrical `resource*` family.
    // Each targets the root channel; any `channel` set on the passed params is
    // overwritten.

    /// Read a resource's content (`resourceRead`).
    @discardableResult
    public func resourceRead(_ params: ResourceReadParams) async throws -> ResourceReadResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceRead", params: params)
    }

    /// Write content to a resource (`resourceWrite`).
    @discardableResult
    public func resourceWrite(_ params: ResourceWriteParams) async throws -> ResourceWriteResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceWrite", params: params)
    }

    /// List the children of a resource (`resourceList`).
    @discardableResult
    public func resourceList(_ params: ResourceListParams) async throws -> ResourceListResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceList", params: params)
    }

    /// Copy a resource (`resourceCopy`).
    @discardableResult
    public func resourceCopy(_ params: ResourceCopyParams) async throws -> ResourceCopyResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceCopy", params: params)
    }

    /// Delete a resource (`resourceDelete`).
    @discardableResult
    public func resourceDelete(_ params: ResourceDeleteParams) async throws -> ResourceDeleteResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceDelete", params: params)
    }

    /// Move or rename a resource (`resourceMove`).
    @discardableResult
    public func resourceMove(_ params: ResourceMoveParams) async throws -> ResourceMoveResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceMove", params: params)
    }

    /// Resolve a resource URI to its canonical form (`resourceResolve`).
    @discardableResult
    public func resourceResolve(_ params: ResourceResolveParams) async throws -> ResourceResolveResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceResolve", params: params)
    }

    /// Create a directory resource (`resourceMkdir`).
    @discardableResult
    public func resourceMkdir(_ params: ResourceMkdirParams) async throws -> ResourceMkdirResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceMkdir", params: params)
    }

    /// Issue a free-form resource request (`resourceRequest`).
    @discardableResult
    public func resourceRequest(_ params: ResourceRequestParams) async throws -> ResourceRequestResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "resourceRequest", params: params)
    }

    /// Create a resource watch channel (`createResourceWatch`). Pair the
    /// returned channel URI with `subscribe(_:)` to stream changes.
    @discardableResult
    public func createResourceWatch(_ params: CreateResourceWatchParams) async throws -> CreateResourceWatchResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "createResourceWatch", params: params)
    }

    // MARK: - Completions commands (send)

    /// Request inline completion items for a partially-typed input
    /// (`completions`), e.g. to power `@`-mention pickers.
    ///
    /// Unlike the `resource*` wrappers, the caller-supplied `channel` (the chat
    /// URI the completion is scoped to) is preserved. Debounce calls to avoid
    /// flooding the server on every keystroke.
    @discardableResult
    public func completions(_ params: CompletionsParams) async throws -> CompletionsResult {
        return try await request(method: "completions", params: params)
    }

    /// Query the server for allowed values of a dynamic session config property
    /// (`sessionConfigCompletions`). Targets the root channel; any `channel` set
    /// on the passed params is overwritten.
    @discardableResult
    public func sessionConfigCompletions(_ params: SessionConfigCompletionsParams) async throws -> SessionConfigCompletionsResult {
        var params = params
        params.channel = RootResourceURI
        return try await request(method: "sessionConfigCompletions", params: params)
    }

    // MARK: - Server-initiated requests (inbound)

    /// Install a generic handler for inbound server-initiated requests.
    ///
    /// AHP's `resource*` methods are symmetrical, so a server may issue any of
    /// them back to the client. The handler receives the method name and raw
    /// params bytes and returns the JSON-encoded result to send back; throw
    /// `AHPClientError.rpc(code:message:data:)` to return a specific error, or
    /// any other error to return an internal error. Passing `nil` clears the
    /// handler, reverting to `MethodNotFound` replies.
    ///
    /// For a typed, per-method API see `setResourceRequestHandlers(_:)`.
    public func setServerRequestHandler(_ handler: ServerRequestHandler?) {
        serverRequestHandler = handler
    }

    /// Install typed per-method handlers for inbound `resource*` requests.
    ///
    /// Sugar over `setServerRequestHandler(_:)` that decodes params and encodes
    /// results for you. Methods with no registered handler answer
    /// `MethodNotFound`.
    public func setResourceRequestHandlers(_ handlers: ResourceRequestHandlers) {
        serverRequestHandler = AHPClient.makeResourceHandler(handlers)
    }

    // MARK: - Generic request

    /// Send a JSON-RPC request and await its decoded result.
    ///
    /// **Cancellation:** observes `Task.isCancelled`. If the surrounding
    /// `Task` is cancelled while the request is in flight, the call
    /// throws `CancellationError()` and the local pending entry is
    /// removed (so a late server response is harmlessly dropped).
    /// **Cancellation only cancels the local wait** — it does not abort
    /// the server's execution of the request. Consumers writing
    /// typeahead / debounce flows can rely on this to surface
    /// cancellation as a normal `Task` interaction without bespoke
    /// request-key bookkeeping.
    public func request<P: Encodable & Sendable, R: Decodable & Sendable>(
        method: String,
        params: P
    ) async throws -> R {
        try await requestWithOptions(method: method, params: params, subscriptionOptions: nil)
    }

    private func requestWithOptions<P: Encodable & Sendable, R: Decodable & Sendable>(
        method: String, params: P, subscriptionOptions: AHPSubscriptionOptions?,
        owner: AHPSubscription? = nil, created: Bool? = nil
    ) async throws -> R {
        if didShutdown { throw AHPClientError.shutdown }
        guard let cont = outboundContinuation else {
            throw AHPClientError.shutdown
        }
        // Fast-fail when the surrounding Task is already cancelled.
        // Avoids minting a request id and pushing wire bytes for a
        // request whose result will be thrown away immediately.
        try Task.checkCancellation()
        let encodedParams = try encoder.encode(params)
        let channel = method == "subscribe" ? (try? decoder.decode(SubscribeParams.self, from: encodedParams).channel) : nil
        var binding = owner
        if binding == nil, let channel { binding = await windowingEngine?.subscription(channel) }
        let createdHere = created ?? (binding == nil)
        let (contextParams, fallbackOptions) = try await prepareRequestContext(method: method, params: encodedParams)
        if binding == nil, let channel { binding = await windowingEngine?.subscription(channel) }
        let isFlowNegotiation = await flowNegotiation(method: method, params: contextParams)
        try await checkRequestAdmission(method: method, params: contextParams)

        // Order matters: register the pending entry BEFORE pushing the
        // outbound message, so an immediate response (which a fast in-memory
        // transport could deliver before this method returns) finds the
        // continuation in the map.
        let id = nextRequestId
        nextRequestId += 1

        let resultData: Data = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
                let entry = PendingEntry(continuation: continuation)
                pending[id] = entry
                requestContexts[id] = (method, contextParams)
                requestOptions[id] = subscriptionOptions ?? fallbackOptions
                if let binding { requestSubscriptions[id] = .init(owner: binding, created: createdHere) }
                if isFlowNegotiation { flowNegotiations.insert(id) }

                let wireData: Data
                do {
                    wireData = try buildRawRequestWire(id: id, method: method, paramsData: contextParams)
                } catch {
                    pending.removeValue(forKey: id)
                    continuation.resume(throwing: AHPClientError.decoding(
                        "failed to encode params for \(method): \(error)"
                    ))
                    return
                }
                cont.yield(.init(data: wireData, completion: nil))

                // Schedule a timeout. The timeout task races against the response;
                // whichever resolves first wins. The task is tracked on the entry
                // so a successful response can cancel the sleep instead of letting
                // it accumulate at high request rates.
                let timeoutDuration = config.requestTimeout
                entry.timeoutTask = Task { [weak self] in
                    try? await Task.sleep(for: timeoutDuration)
                    if Task.isCancelled { return }
                    await self?.timeoutPending(id: id)
                }
            }
        } onCancel: { [weak self] in
            // Hop back to actor isolation to safely race against the
            // response/timeout paths. If the entry has already been
            // removed (response delivered or timed out), `cancelPending`
            // is a no-op.
            Task { [weak self, id] in
                await self?.cancelPending(id: id)
            }
        }

        do {
            return try decoder.decode(R.self, from: resultData)
        } catch {
            throw AHPClientError.decoding(
                "failed to decode result for \(method): \(error)"
            )
        }
    }

    /// Send a raw JSON-RPC request without going through `Codable` for
    /// the params or result.
    ///
    /// `paramsData` must be a JSON value (object, array, number, string,
    /// bool, or null) — it's spliced into the request frame's `params`
    /// slot as-is. The decoded `result` JSON is returned as raw `Data`.
    /// Both shapes give consumers an escape hatch for request shapes
    /// the SDK doesn't model (e.g., host-specific extension RPCs) and
    /// avoids forcing them to define `Codable & Sendable` types whose
    /// synthesised conformance can inherit Swift 6's default actor
    /// isolation (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`) — which
    /// then gets rejected by `request(_:params:)`'s `Sendable`
    /// constraint when called from an actor-isolated context.
    ///
    /// Observes `Task` cancellation in the same way `request(_:params:)`
    /// does.
    public func requestRaw(method: String, paramsData: Data) async throws -> Data {
        if didShutdown { throw AHPClientError.shutdown }
        guard let cont = outboundContinuation else {
            throw AHPClientError.shutdown
        }
        try Task.checkCancellation()
        let channel = method == "subscribe" ? (try? decoder.decode(SubscribeParams.self, from: paramsData).channel) : nil
        var binding: AHPSubscription?
        if let channel { binding = await windowingEngine?.subscription(channel) }
        let createdHere = binding == nil
        let (paramsData, fallbackOptions) = try await prepareRequestContext(method: method, params: paramsData)
        if binding == nil, let channel { binding = await windowingEngine?.subscription(channel) }
        let isFlowNegotiation = await flowNegotiation(method: method, params: paramsData)
        try await checkRequestAdmission(method: method, params: paramsData)

        let id = nextRequestId
        nextRequestId += 1

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
                let entry = PendingEntry(continuation: continuation)
                pending[id] = entry
                requestContexts[id] = (method, paramsData)
                requestOptions[id] = fallbackOptions
                if let binding { requestSubscriptions[id] = .init(owner: binding, created: createdHere) }
                if isFlowNegotiation { flowNegotiations.insert(id) }

                let wireData: Data
                do {
                    wireData = try buildRawRequestWire(id: id, method: method, paramsData: paramsData)
                } catch {
                    pending.removeValue(forKey: id)
                    continuation.resume(throwing: AHPClientError.decoding(
                        "failed to splice raw params for \(method): \(error)"
                    ))
                    return
                }
                cont.yield(.init(data: wireData, completion: nil))

                let timeoutDuration = config.requestTimeout
                entry.timeoutTask = Task { [weak self] in
                    try? await Task.sleep(for: timeoutDuration)
                    if Task.isCancelled { return }
                    await self?.timeoutPending(id: id)
                }
            }
        } onCancel: { [weak self] in
            Task { [weak self, id] in
                await self?.cancelPending(id: id)
            }
        }
    }

    /// Actor-isolated cancellation helper for `request`'s cancel handler.
    /// Removes the pending entry (if still present), cancels the timeout
    /// task, and resumes the continuation with `CancellationError()`. A
    /// no-op when the entry has already been removed by the response or
    /// timeout path — only the first of those three to find the entry
    /// wins, so the continuation is never double-resumed.
    private func cancelPending(id: Int) async {
        await abandonPending(id: id, error: CancellationError())
    }

    private func abandonPending(id: Int, error: Error) async {
        guard let entry = pending.removeValue(forKey: id) else { return }
        entry.timeoutTask?.cancel()
        if let context = requestContexts[id], ["subscribe", "reconnect"].contains(context.0) {
            abandonedRequests.insert(id)
            if let subscription = requestSubscriptions[id] {
                await windowingEngine?.abandonSubscribe(subscription.owner, created: subscription.created, error: error)
            }
        } else {
            requestContexts.removeValue(forKey: id)
            requestOptions.removeValue(forKey: id)
            requestSubscriptions.removeValue(forKey: id)
            flowNegotiations.remove(id)
        }
        entry.continuation.resume(throwing: error)
    }

    /// Send a JSON-RPC notification. Ordinary delivery is fire-and-forget;
    /// accepted windowed data waits for credit and transport completion.
    public func notify<P: Encodable & Sendable>(method: String, params: P) async throws {
        if didShutdown { throw AHPClientError.shutdown }
        guard let cont = outboundContinuation else {
            throw AHPClientError.shutdown
        }
        let paramsData: Data
        do {
            paramsData = try encoder.encode(params)
        } catch {
            throw AHPClientError.decoding("failed to encode params for \(method): \(error)")
        }
        if let engine = windowingEngine {
            if let message = try? AHPNotificationMessage(method: method, paramsJSON: paramsData),
               await engine.isWindowed(message.channel) {
                try await engine.send(message)
                return
            }
        }
        let wireData = try buildRawNotificationWire(method: method, paramsData: paramsData)
        cont.yield(.init(data: wireData, completion: nil))
    }

    // MARK: - Private: wire-building

    /// Build a JSON-RPC request frame as raw JSON bytes. Going through
    /// JSONSerialization for the assembly preserves the NSNumber Bool/Int
    /// distinction that AnyCodable would otherwise erase.
    private func buildRequestWire<P: Encodable>(
        id: Int, method: String, params: P
    ) throws -> Data {
        let paramsData = try encoder.encode(params)
        let paramsAny = try JSONSerialization.jsonObject(
            with: paramsData, options: [.fragmentsAllowed]
        )
        let dict: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": paramsAny,
        ]
        return try JSONSerialization.data(withJSONObject: dict)
    }

    /// Build a JSON-RPC request frame from raw params bytes. Used by
    /// `requestRaw` to skip Codable encoding when the consumer already
    /// has JSON-shaped data.
    private func buildRawRequestWire(
        id: Int, method: String, paramsData: Data
    ) throws -> Data {
        let paramsAny = try JSONSerialization.jsonObject(
            with: paramsData, options: [.fragmentsAllowed]
        )
        let dict: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": paramsAny,
        ]
        return try JSONSerialization.data(withJSONObject: dict)
    }

    private func buildNotificationWire<P: Encodable>(
        method: String, params: P
    ) throws -> Data {
        try buildRawNotificationWire(method: method, paramsData: encoder.encode(params))
    }

    private func buildRawNotificationWire(method: String, paramsData: Data) throws -> Data {
        let paramsAny = try JSONSerialization.jsonObject(
            with: paramsData, options: [.fragmentsAllowed]
        )
        let dict: [String: Any] = [
            "jsonrpc": "2.0",
            "method": method,
            "params": paramsAny,
        ]
        return try JSONSerialization.data(withJSONObject: dict)
    }

    // MARK: - Private: receive loop

    private func runReceiveLoop() async {
        while !Task.isCancelled {
            let msg: TransportMessage?
            let rawText: String?
            do {
                if let measured = transport as? AHPWindowingTransport {
                    let wire = try await measured.recvWireMessage()
                    msg = wire?.message
                    rawText = wire?.originalJSONText
                } else {
                    msg = try await transport.recv()
                    switch msg {
                    case .text(let text): rawText = text
                    case .binary(let data): rawText = String(data: data, encoding: .utf8)
                    default: rawText = nil
                    }
                }
            } catch {
                await handleTransportFailure(error)
                return
            }
            guard let msg else {
                // Clean close.
                await handleTransportFailure(nil)
                return
            }
            // Convert to raw bytes once. Going through JSONSerialization (vs
            // JSONDecoder + AnyCodable) preserves the Bool/Int distinction
            // that NSNumber bridging in JSONDecoder otherwise erases.
            let data: Data
            switch msg {
            case .text(let s):
                guard let d = (rawText ?? s).data(using: .utf8) else {
                    #if DEBUG
                    print("[AHPClient] dropped malformed text frame")
                    #endif
                    continue
                }
                data = d
            case .binary(let d):
                data = rawText.map { Data($0.utf8) } ?? d
            case .parsed(let parsed):
                // Slow path: re-serialize via Codable so the rest of the
                // pipeline only deals with raw bytes. Note that any
                // `AnyCodable`-wrapped payload inside `parsed` may already
                // have been corrupted by an earlier `JSONDecoder` pass —
                // see `TransportMessage` docs and microsoft/agent-host-protocol#123.
                // Transports SHOULD prefer `.text`/`.binary` for inbound frames.
                if let rawText {
                    data = Data(rawText.utf8)
                    break
                }
                guard let d = try? encoder.encode(parsed) else {
                    #if DEBUG
                    print("[AHPClient] dropped unencodable parsed frame")
                    #endif
                    continue
                }
                data = d
            }
            guard let frame = parseRawFrame(from: data) else {
                if await windowingEngine?.hasWindows == true {
                    await handleTransportFailure(TransportError.protocol("malformed JSON-RPC on windowed connection"))
                    return
                }
                #if DEBUG
                print("[AHPClient] dropped malformed frame")
                #endif
                continue
            }
            await dispatchInbound(frame, rawText: rawText)
        }
    }

    /// Internal frame representation that keeps payload sub-trees as raw JSON
    /// bytes. We can then `JSONDecoder.decode` typed values straight from
    /// those bytes — avoiding the round-trip through `AnyCodable`, which on
    /// Apple platforms erases the Bool/Int distinction due to NSNumber
    /// bridging.
    private enum RawFrame {
        case request(id: Int, method: String, params: Data?)
        case successResponse(id: Int, result: Data)
        case errorResponse(id: Int, error: JsonRpcError)
        case notification(method: String, params: Data?)
    }

    private func parseRawFrame(from data: Data) -> RawFrame? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        let id = object["id"] as? Int
        let method = object["method"] as? String

        if let id, method == nil {
            if let errorAny = object["error"] {
                guard let errData = try? JSONSerialization.data(
                    withJSONObject: errorAny, options: [.fragmentsAllowed]
                ),
                      let err = try? decoder.decode(JsonRpcError.self, from: errData)
                else { return nil }
                return .errorResponse(id: id, error: err)
            }
            // A response MUST carry either `result` (possibly null) or `error`.
            // A frame with neither is malformed; drop it. Note: a missing key
            // and an explicit `null` result are different — the latter shows
            // up as `NSNull` in the dict.
            guard let resultAny = object["result"] else {
                return nil
            }
            // If we can't re-serialize the value we just parsed (e.g. an
            // exotic NSObject snuck in), drop the whole frame rather than
            // silently coercing the result to JSON `null`. A `null` would
            // resolve the pending request with a value the peer never sent.
            guard let resultData = try? JSONSerialization.data(
                withJSONObject: resultAny, options: [.fragmentsAllowed]
            ) else {
                return nil
            }
            return .successResponse(id: id, result: resultData)
        }

        if let method {
            let paramsData: Data? = object["params"].flatMap { paramsAny in
                try? JSONSerialization.data(
                    withJSONObject: paramsAny, options: [.fragmentsAllowed]
                )
            }
            if let id {
                return .request(id: id, method: method, params: paramsData)
            }
            return .notification(method: method, params: paramsData)
        }

        return nil
    }

    private func dispatchInbound(_ frame: RawFrame, rawText: String? = nil) async {
        switch frame {
        case .successResponse(let id, let resultData):
            flowNegotiations.remove(id)
            let abandoned = abandonedRequests.remove(id) != nil
            let subscription = requestSubscriptions.removeValue(forKey: id)
            if let (method, params) = requestContexts.removeValue(forKey: id), let engine = windowingEngine {
                do {
                    if method == "subscribe" {
                        let p = try decoder.decode(SubscribeParams.self, from: params)
                        try await engine.installSubscribe(request: p, options: requestOptions.removeValue(forKey: id),
                                                          resultData: resultData, expected: subscription?.owner,
                                                          retain: !abandoned)
                        if abandoned, let subscription {
                            await engine.cleanAbandoned(subscription.owner, created: subscription.created)
                        } else if let subscription, await engine.subscription(p.channel) !== subscription.owner {
                            await engine.cleanAbandoned(subscription.owner, created: true)
                        }
                    } else if method == "reconnect" {
                        try await engine.installReconnect(request: params, resultData: resultData)
                    }
                } catch {
                    await handleTransportFailure(TransportError.protocol("\(error)"))
                    return
                }
            }
            if let entry = pending.removeValue(forKey: id) {
                entry.timeoutTask?.cancel()
                entry.continuation.resume(returning: resultData)
            }
        case .errorResponse(let id, let error):
            flowNegotiations.remove(id)
            abandonedRequests.remove(id)
            let subscription = requestSubscriptions.removeValue(forKey: id)
            if let context = requestContexts.removeValue(forKey: id), context.0 == "subscribe",
               let request = try? decoder.decode(SubscribeParams.self, from: context.1) {
                await windowingEngine?.abortSubscribe(request.channel,
                    error: AHPClientError.rpc(code: error.code, message: error.message, data: error.data),
                    expected: subscription?.owner)
            }
            requestOptions.removeValue(forKey: id)
            if let entry = pending.removeValue(forKey: id) {
                entry.timeoutTask?.cancel()
                entry.continuation.resume(throwing: AHPClientError.rpc(
                    code: error.code, message: error.message, data: error.data
                ))
            }
        case .notification(let method, let params):
            if let engine = windowingEngine, let params {
                do {
                    if let message = try? AHPNotificationMessage(method: method, paramsJSON: params),
                       let subscription = await engine.subscription(message.channel) {
                        if let delivered = try await engine.receive(message, rawText: rawText) {
                            let body = try JSONSerialization.jsonObject(with: delivered.paramsJSON) as? [String: Any]
                            let seq = body?["serverSeq"] as? Int ??
                                ((body?["snapshot"] as? [String: Any])?["fromSeq"] as? Int) ?? 0
                            lastSeenServerSeq = max(lastSeenServerSeq, seq)
                            if await !subscription.managed {
                                await handleNotification(method: delivered.method, paramsData: delivered.paramsJSON)
                            }
                        }
                        return
                    }
                } catch {
                    await handleTransportFailure(TransportError.protocol("\(error)"))
                    return
                }
            }
            await handleNotification(method: method, paramsData: params)
        case .request(let id, let method, let params):
            // Server-initiated requests (the symmetrical `resource*` family)
            // are handled on a detached task so a handler that calls back
            // into this client can't deadlock the receive loop.
            Task { [weak self] in
                await self?.handleServerRequest(id: id, method: method, paramsData: params)
            }
        }
    }

    private func handleNotification(method: String, paramsData: Data?) async {
        switch method {
        case "action":
            await handleActionNotification(paramsData: paramsData)
        case "root/sessionAdded":
            await handleSubscriptionParams(
                paramsData: paramsData,
                type: SessionAddedParams.self,
                wrap: SubscriptionEvent.sessionAdded,
                channel: { $0.channel }
            )
        case "root/sessionRemoved":
            await handleSubscriptionParams(
                paramsData: paramsData,
                type: SessionRemovedParams.self,
                wrap: SubscriptionEvent.sessionRemoved,
                channel: { $0.channel }
            )
        case "root/sessionSummaryChanged":
            await handleSubscriptionParams(
                paramsData: paramsData,
                type: SessionSummaryChangedParams.self,
                wrap: SubscriptionEvent.sessionSummaryChanged,
                channel: { $0.channel }
            )
        case "auth/required":
            await handleSubscriptionParams(
                paramsData: paramsData,
                type: AuthRequiredParams.self,
                wrap: SubscriptionEvent.authRequired,
                channel: { $0.channel }
            )
        default:
            #if DEBUG
            print("[AHPClient] unhandled notification: \(method)")
            #endif
        }
    }

    private func handleActionNotification(paramsData: Data?) async {
        guard let paramsData else { return }
        let envelope: ActionEnvelope
        do {
            envelope = try decoder.decode(ActionEnvelope.self, from: paramsData)
        } catch {
            #if DEBUG
            print("[AHPClient] failed to decode action envelope: \(error)")
            #endif
            return
        }
        if envelope.serverSeq > lastSeenServerSeq {
            lastSeenServerSeq = envelope.serverSeq
        }
        let channel = envelope.channel
        let event = SubscriptionEvent.action(envelope)
        if let listeners = perUriListeners[channel] {
            for l in listeners { l.continuation.yield(event) }
        }
        broadcast(ClientEvent(resource: channel, event: event))
    }

    /// Decode a per-method notification params type, dispatch the resulting
    /// `SubscriptionEvent` to listeners on `params.channel`, and also tee it
    /// into the top-level events tap tagged with the channel.
    private func handleSubscriptionParams<P: Decodable>(
        paramsData: Data?,
        type: P.Type,
        wrap: (P) -> SubscriptionEvent,
        channel: (P) -> String
    ) async {
        guard let paramsData else { return }
        let params: P
        do {
            params = try decoder.decode(P.self, from: paramsData)
        } catch {
            #if DEBUG
            print("[AHPClient] failed to decode notification params: \(error)")
            #endif
            return
        }
        let event = wrap(params)
        let ch = channel(params)
        if let listeners = perUriListeners[ch] {
            for l in listeners { l.continuation.yield(event) }
        }
        broadcast(ClientEvent(resource: ch, event: event))
    }

    // MARK: - Private: failure / cleanup

    /// Invoked when the receive loop terminates (clean close: `error == nil`,
    /// abnormal: `error != nil`) or the writer hits a send failure.
    private func handleTransportFailure(_ error: Error?) async {
        if didShutdown || connectionState == .disconnected { return }
        let clientError: AHPClientError
        if let transportError = error as? TransportError {
            clientError = .transport(transportError)
        } else if let error {
            clientError = .transport(.io("\(error)"))
        } else {
            clientError = .shutdown
        }
        await windowingEngine?.disconnect(clientError)

        outboundContinuation?.finish()
        outboundContinuation = nil
        writerTask?.cancel()
        writerTask = nil
        keepAliveTask?.cancel()
        keepAliveTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        try? await transport.close()

        failAllPending(with: clientError)
        finishAllSubscriptions()
        // Top-level taps stay alive after a transport drop so consumers can
        // observe later state transitions (in this single-shot client, only
        // `.disconnected` will follow).
        await transition(to: .disconnected)
    }

    private func failAllPending(with error: AHPClientError) {
        requestContexts.removeAll()
        requestOptions.removeAll()
        requestSubscriptions.removeAll()
        abandonedRequests.removeAll()
        flowNegotiations.removeAll()
        let writes = windowWrites.values
        windowWrites.removeAll()
        callerWrites.removeAll()
        for reply in writes { reply.resume(throwing: error) }
        let entries = pending
        pending.removeAll()
        for (_, entry) in entries {
            entry.timeoutTask?.cancel()
            entry.continuation.resume(throwing: error)
        }
    }

    private func timeoutPending(id: Int) async {
        await abandonPending(id: id, error: AHPClientError.requestTimeout)
    }

    /// Answer an inbound server-initiated request via the installed
    /// `serverRequestHandler`, or with `MethodNotFound` when none is set.
    private func handleServerRequest(id: Int, method: String, paramsData: Data?) async {
        guard let handler = serverRequestHandler else {
            await sendMethodNotFound(forId: id)
            return
        }
        do {
            let resultData = try await handler(method, paramsData)
            sendSuccessResponse(id: id, resultData: resultData)
        } catch let AHPClientError.rpc(code, message, data) {
            sendErrorResponse(id: id, code: code, message: message, data: data)
        } catch {
            sendErrorResponse(id: id, code: -32603, message: "\(error)", data: nil)
        }
    }

    /// Yield a JSON-RPC success response, splicing `resultData` (JSON bytes)
    /// into the frame's `result` slot without a Codable round-trip.
    private func sendSuccessResponse(id: Int, resultData: Data) {
        guard let cont = outboundContinuation else { return }
        let resultAny = (try? JSONSerialization.jsonObject(
            with: resultData, options: [.fragmentsAllowed]
        )) ?? NSNull()
        let dict: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "result": resultAny,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return }
        cont.yield(.init(data: data, completion: nil))
    }

    /// Yield a JSON-RPC error response with the given code/message/data.
    private func sendErrorResponse(id: Int, code: Int, message: String, data: AnyCodable?) {
        guard let cont = outboundContinuation else { return }
        var errorObject: [String: Any] = [
            "code": code,
            "message": message,
        ]
        if let data,
           let encoded = try? encoder.encode(data),
           let dataAny = try? JSONSerialization.jsonObject(with: encoded, options: [.fragmentsAllowed]) {
            errorObject["data"] = dataAny
        }
        let dict: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "error": errorObject,
        ]
        guard let wire = try? JSONSerialization.data(withJSONObject: dict) else { return }
        cont.yield(.init(data: wire, completion: nil))
    }

    /// Adapt a typed `ResourceRequestHandlers` into a generic
    /// `ServerRequestHandler`: route by method, decode params, run the typed
    /// handler, and encode the result. Unregistered methods → `MethodNotFound`.
    private static func makeResourceHandler(_ handlers: ResourceRequestHandlers) -> ServerRequestHandler {
        return { method, paramsData in
            switch method {
            case "resourceRead":
                return try await dispatchResourceHandler(handlers.onResourceRead, paramsData, method)
            case "resourceWrite":
                return try await dispatchResourceHandler(handlers.onResourceWrite, paramsData, method)
            case "resourceList":
                return try await dispatchResourceHandler(handlers.onResourceList, paramsData, method)
            case "resourceCopy":
                return try await dispatchResourceHandler(handlers.onResourceCopy, paramsData, method)
            case "resourceDelete":
                return try await dispatchResourceHandler(handlers.onResourceDelete, paramsData, method)
            case "resourceMove":
                return try await dispatchResourceHandler(handlers.onResourceMove, paramsData, method)
            case "resourceResolve":
                return try await dispatchResourceHandler(handlers.onResourceResolve, paramsData, method)
            case "resourceMkdir":
                return try await dispatchResourceHandler(handlers.onResourceMkdir, paramsData, method)
            case "resourceRequest":
                return try await dispatchResourceHandler(handlers.onResourceRequest, paramsData, method)
            case "createResourceWatch":
                return try await dispatchResourceHandler(handlers.onCreateResourceWatch, paramsData, method)
            default:
                throw AHPClientError.rpc(
                    code: -32601, message: "no handler for server method \"\(method)\"", data: nil
                )
            }
        }
    }

    /// Decode `paramsData` into `P`, run `handler`, and encode its `R` result.
    /// `nil` handler → `MethodNotFound`; decode failure → `InvalidParams`.
    private static func dispatchResourceHandler<P: Decodable & Sendable, R: Encodable & Sendable>(
        _ handler: (@Sendable (P) async throws -> R)?,
        _ paramsData: Data?,
        _ method: String
    ) async throws -> Data {
        guard let handler else {
            throw AHPClientError.rpc(
                code: -32601, message: "no handler for server method \"\(method)\"", data: nil
            )
        }
        let params: P
        do {
            params = try JSONDecoder().decode(P.self, from: paramsData ?? Data("null".utf8))
        } catch {
            throw AHPClientError.rpc(
                code: -32602, message: "invalid params for \(method): \(error)", data: nil
            )
        }
        let result = try await handler(params)
        return try JSONEncoder().encode(result)
    }

    /// Send a JSON-RPC error response back to the peer. Used for unsolicited
    /// server-initiated requests so the peer's pending map doesn't grow
    /// unbounded.
    private func sendMethodNotFound(forId id: Int) async {
        guard let cont = outboundContinuation else { return }
        let dict: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "error": [
                "code": -32601,
                "message": "method not found",
            ] as [String: Any],
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return }
        cont.yield(.init(data: data, completion: nil))
    }

    private func finishAllSubscriptions() {
        let listeners = perUriListeners
        perUriListeners.removeAll()
        for (_, ls) in listeners {
            for l in ls { l.continuation.finish() }
        }
    }

    private func finishAllEventListeners() {
        for l in eventListeners { l.continuation.finish() }
        eventListeners.removeAll()
    }

    private func finishAllStateListeners() {
        for l in stateListeners { l.continuation.finish() }
        stateListeners.removeAll()
    }

    private func broadcast(_ event: ClientEvent) {
        for l in eventListeners { l.continuation.yield(event) }
    }

    private func transition(to newState: ConnectionState) async {
        connectionState = newState
        for l in stateListeners { l.continuation.yield(newState) }
    }

    // MARK: - Private: listener bookkeeping

    private var nextListenerSeq: UInt64 = 1
    private func nextListenerId() -> UInt64 {
        let id = nextListenerSeq
        nextListenerSeq += 1
        return id
    }

    private func removeEventListener(id: UInt64) {
        eventListeners.removeAll { $0.id == id }
    }

    private func removeStateListener(id: UInt64) {
        stateListeners.removeAll { $0.id == id }
    }

    private func removeSubscriptionListener(uri: String, id: UInt64) {
        guard var listeners = perUriListeners[uri] else { return }
        listeners.removeAll { $0.id == id }
        if listeners.isEmpty {
            perUriListeners.removeValue(forKey: uri)
        } else {
            perUriListeners[uri] = listeners
        }
    }

    // MARK: - Private: helpers

    // MARK: - Internal test hooks

    /// Internal accessor used by tests to confirm listener cleanup. Counts
    /// the number of per-URI subscription listeners attached for `uri`.
    internal func _listenerCount(forUri uri: String) -> Int {
        return perUriListeners[uri]?.count ?? 0
    }

    /// Internal accessor used by tests. Counts the in-flight pending
    /// requests.
    internal func _pendingCount() -> Int {
        return pending.count
    }

    internal func _windowWriteCount() -> Int { windowWrites.count }
    internal func _callerWriteCount() -> Int { callerWrites.count }
    internal func _windowOrderCount() async -> Int { await windowingEngine?.bookkeepingCount() ?? 0 }
    internal func _requestContextCount() -> Int { requestContexts.count }
}

// MARK: - Server-initiated request handling

/// Handler for inbound server-initiated requests.
///
/// AHP's `resource*` methods are symmetrical — a server may issue any of them
/// back to the client. Install one with `AHPClient.setServerRequestHandler(_:)`
/// (or the typed `AHPClient.setResourceRequestHandlers(_:)`). The handler
/// receives the method name and raw params bytes and returns the JSON-encoded
/// result to send back; throw `AHPClientError.rpc(code:message:data:)` to
/// return a specific error, or any other error to return an internal error.
/// When no handler is installed the client replies with `MethodNotFound`.
public typealias ServerRequestHandler = @Sendable (_ method: String, _ paramsData: Data?) async throws -> Data

/// A typed per-method registry of inbound `resource*` request handlers.
///
/// Sugar over `AHPClient.setServerRequestHandler(_:)`: set the `on*` closures
/// you care about and install with `AHPClient.setResourceRequestHandlers(_:)`.
/// Each handler receives the decoded params and returns the typed result (or
/// throws). Methods with no registered handler answer `MethodNotFound`.
public struct ResourceRequestHandlers: Sendable {
    public var onResourceRead: (@Sendable (ResourceReadParams) async throws -> ResourceReadResult)?
    public var onResourceWrite: (@Sendable (ResourceWriteParams) async throws -> ResourceWriteResult)?
    public var onResourceList: (@Sendable (ResourceListParams) async throws -> ResourceListResult)?
    public var onResourceCopy: (@Sendable (ResourceCopyParams) async throws -> ResourceCopyResult)?
    public var onResourceDelete: (@Sendable (ResourceDeleteParams) async throws -> ResourceDeleteResult)?
    public var onResourceMove: (@Sendable (ResourceMoveParams) async throws -> ResourceMoveResult)?
    public var onResourceResolve: (@Sendable (ResourceResolveParams) async throws -> ResourceResolveResult)?
    public var onResourceMkdir: (@Sendable (ResourceMkdirParams) async throws -> ResourceMkdirResult)?
    public var onResourceRequest: (@Sendable (ResourceRequestParams) async throws -> ResourceRequestResult)?
    public var onCreateResourceWatch: (@Sendable (CreateResourceWatchParams) async throws -> CreateResourceWatchResult)?

    public init(
        onResourceRead: (@Sendable (ResourceReadParams) async throws -> ResourceReadResult)? = nil,
        onResourceWrite: (@Sendable (ResourceWriteParams) async throws -> ResourceWriteResult)? = nil,
        onResourceList: (@Sendable (ResourceListParams) async throws -> ResourceListResult)? = nil,
        onResourceCopy: (@Sendable (ResourceCopyParams) async throws -> ResourceCopyResult)? = nil,
        onResourceDelete: (@Sendable (ResourceDeleteParams) async throws -> ResourceDeleteResult)? = nil,
        onResourceMove: (@Sendable (ResourceMoveParams) async throws -> ResourceMoveResult)? = nil,
        onResourceResolve: (@Sendable (ResourceResolveParams) async throws -> ResourceResolveResult)? = nil,
        onResourceMkdir: (@Sendable (ResourceMkdirParams) async throws -> ResourceMkdirResult)? = nil,
        onResourceRequest: (@Sendable (ResourceRequestParams) async throws -> ResourceRequestResult)? = nil,
        onCreateResourceWatch: (@Sendable (CreateResourceWatchParams) async throws -> CreateResourceWatchResult)? = nil
    ) {
        self.onResourceRead = onResourceRead
        self.onResourceWrite = onResourceWrite
        self.onResourceList = onResourceList
        self.onResourceCopy = onResourceCopy
        self.onResourceDelete = onResourceDelete
        self.onResourceMove = onResourceMove
        self.onResourceResolve = onResourceResolve
        self.onResourceMkdir = onResourceMkdir
        self.onResourceRequest = onResourceRequest
        self.onCreateResourceWatch = onCreateResourceWatch
    }
}

private final class PendingEntry: @unchecked Sendable {
    let continuation: CheckedContinuation<Data, Error>
    var timeoutTask: Task<Void, Never>?

    init(continuation: CheckedContinuation<Data, Error>) {
        self.continuation = continuation
    }
}

private struct SubscriptionListener {
    let id: UInt64
    let continuation: AsyncStream<SubscriptionEvent>.Continuation
}

private struct EventListener {
    let id: UInt64
    let continuation: AsyncStream<ClientEvent>.Continuation
}

private struct StateListener {
    let id: UInt64
    let continuation: AsyncStream<ConnectionState>.Continuation
}
