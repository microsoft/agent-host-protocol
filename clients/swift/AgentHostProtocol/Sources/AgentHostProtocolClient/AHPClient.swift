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
    private var outboundContinuation: AsyncStream<Data>.Continuation?
    private var writerTask: Task<Void, Never>?
    private var keepAliveTask: Task<Void, Never>?

    // ── Receive loop ─────────────────────────────────────────────────────
    private var receiveTask: Task<Void, Never>?

    // ── State ────────────────────────────────────────────────────────────
    public private(set) var connectionState: ConnectionState = .disconnected
    public private(set) var lastSeenServerSeq: Int = 0
    private var didShutdown: Bool = false

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
        var cont: AsyncStream<Data>.Continuation!
        let outbound = AsyncStream<Data>(bufferingPolicy: .unbounded) { c in
            cont = c
        }
        self.outboundContinuation = cont
        let transport = self.transport
        self.writerTask = Task { [weak self] in
            for await data in outbound {
                guard let text = String(data: data, encoding: .utf8) else {
                    await self?.handleTransportFailure(
                        TransportError.protocol("outbound bytes are not valid UTF-8")
                    )
                    return
                }
                do {
                    try await transport.send(.text(text))
                } catch {
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

        // Stop the writer (no more sends). Order matters: finishing the
        // outbound stream lets the writer loop exit naturally; cancelling the
        // receive task aborts the inbound loop.
        outboundContinuation?.finish()
        outboundContinuation = nil
        writerTask?.cancel()
        writerTask = nil
        keepAliveTask?.cancel()
        keepAliveTask = nil

        receiveTask?.cancel()
        receiveTask = nil

        try? await transport.close()

        failAllPending(with: .shutdown)
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

    /// Subscribe to a channel URI. Returns the subscribe result (whose
    /// `snapshot` is `nil` for stateless channels) and a fresh stream of
    /// subsequent events.
    ///
    /// If the request fails (RPC error, timeout, transport drop), the local
    /// listener is removed and its stream finished — callers don't need to
    /// clean up the partially-attached subscription.
    public func subscribe(
        _ uri: String,
        delivery: SubscriptionDeliveryOptions? = nil
    ) async throws -> (SubscribeResult, AsyncStream<SubscriptionEvent>) {
        let (stream, listenerId) = attachSubscriptionInternal(uri)
        do {
            let result: SubscribeResult = try await request(
                method: "subscribe",
                params: SubscribeParams(channel: uri, delivery: delivery)
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
        try await notify(method: "unsubscribe", params: UnsubscribeParams(channel: uri))
    }

    /// Fire a write-ahead `dispatchAction` notification on `channel`. Returns
    /// a handle carrying the assigned `clientSeq`.
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
        if didShutdown { throw AHPClientError.shutdown }
        guard let cont = outboundContinuation else {
            throw AHPClientError.shutdown
        }
        // Fast-fail when the surrounding Task is already cancelled.
        // Avoids minting a request id and pushing wire bytes for a
        // request whose result will be thrown away immediately.
        try Task.checkCancellation()

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

                let wireData: Data
                do {
                    wireData = try buildRequestWire(id: id, method: method, params: params)
                } catch {
                    pending.removeValue(forKey: id)
                    continuation.resume(throwing: AHPClientError.decoding(
                        "failed to encode params for \(method): \(error)"
                    ))
                    return
                }
                cont.yield(wireData)

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

        let id = nextRequestId
        nextRequestId += 1

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
                let entry = PendingEntry(continuation: continuation)
                pending[id] = entry

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
                cont.yield(wireData)

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
    private func cancelPending(id: Int) {
        if let entry = pending.removeValue(forKey: id) {
            entry.timeoutTask?.cancel()
            entry.continuation.resume(throwing: CancellationError())
        }
    }

    /// Send a JSON-RPC notification (fire-and-forget).
    public func notify<P: Encodable & Sendable>(method: String, params: P) async throws {
        if didShutdown { throw AHPClientError.shutdown }
        guard let cont = outboundContinuation else {
            throw AHPClientError.shutdown
        }
        let wireData: Data
        do {
            wireData = try buildNotificationWire(method: method, params: params)
        } catch {
            throw AHPClientError.decoding("failed to encode params for \(method): \(error)")
        }
        cont.yield(wireData)
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
        let paramsData = try encoder.encode(params)
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
            do {
                msg = try await transport.recv()
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
                guard let d = s.data(using: .utf8) else {
                    #if DEBUG
                    print("[AHPClient] dropped malformed text frame")
                    #endif
                    continue
                }
                data = d
            case .binary(let d):
                data = d
            case .parsed(let parsed):
                // Slow path: re-serialize via Codable so the rest of the
                // pipeline only deals with raw bytes. Note that any
                // `AnyCodable`-wrapped payload inside `parsed` may already
                // have been corrupted by an earlier `JSONDecoder` pass —
                // see `TransportMessage` docs and microsoft/agent-host-protocol#123.
                // Transports SHOULD prefer `.text`/`.binary` for inbound frames.
                guard let d = try? encoder.encode(parsed) else {
                    #if DEBUG
                    print("[AHPClient] dropped unencodable parsed frame")
                    #endif
                    continue
                }
                data = d
            }
            guard let frame = parseRawFrame(from: data) else {
                #if DEBUG
                print("[AHPClient] dropped malformed frame")
                #endif
                continue
            }
            await dispatchInbound(frame)
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

    private func dispatchInbound(_ frame: RawFrame) async {
        switch frame {
        case .successResponse(let id, let resultData):
            if let entry = pending.removeValue(forKey: id) {
                entry.timeoutTask?.cancel()
                entry.continuation.resume(returning: resultData)
            }
        case .errorResponse(let id, let error):
            if let entry = pending.removeValue(forKey: id) {
                entry.timeoutTask?.cancel()
                entry.continuation.resume(throwing: AHPClientError.rpc(
                    code: error.code, message: error.message, data: error.data
                ))
            }
        case .notification(let method, let params):
            await handleNotification(method: method, paramsData: params)
        case .request(let id, _, _):
            // We don't yet implement server-initiated requests. Reply with
            // a JSON-RPC `method not found` so the peer's pending map doesn't
            // grow unbounded for buggy implementations.
            await sendMethodNotFound(forId: id)
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
        let entries = pending
        pending.removeAll()
        for (_, entry) in entries {
            entry.timeoutTask?.cancel()
            entry.continuation.resume(throwing: error)
        }
    }

    private func timeoutPending(id: Int) {
        if let entry = pending.removeValue(forKey: id) {
            entry.timeoutTask = nil
            entry.continuation.resume(throwing: AHPClientError.requestTimeout)
        }
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
        cont.yield(data)
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
