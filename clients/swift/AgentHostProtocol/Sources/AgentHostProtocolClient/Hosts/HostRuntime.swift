// HostRuntime — per-host supervisor.
//
// Owns the current `AHPClient`, the reconnect state machine, the per-host
// root-state mirror, and the session-summary cache. Receives commands over
// a single internal `AsyncStream<HostCommand>` and forwards inbound events
// to the multi-host fan-in.

import Foundation
import AgentHostProtocol

/// Per-host supervisor task. Internal to the multi-host SDK.
///
/// Constructed by `MultiHostClient.add(_:)`. The `MultiHostClient` enqueues
/// commands via the public methods (`subscribe`, `dispatch`, …) which all
/// reduce to sending a `HostCommand` into the supervisor's queue.
internal final class HostRuntime: Sendable {
    /// Shared, generation-checked state. Public to the multi-host layer so
    /// `HostClientHandle.checkAlive()` can read generations without going
    /// through the supervisor command queue.
    let shared: HostShared

    private let config: HostConfig
    private let clientId: String

    /// Sink the multi-host facade fans events into. Awaited from the pump
    /// so per-host event ordering is preserved (a fresh per-event Task
    /// would interleave on the way to the consumer actor).
    private let fanOut: @Sendable (HostSubscriptionEvent) async -> Void
    /// Sink for connection-level events. Awaited for the same reason.
    private let hostEventSink: @Sendable (HostEvent) async -> Void

    private let cmdContinuation: AsyncStream<HostCommand>.Continuation
    private let cmdStream: AsyncStream<HostCommand>

    /// Long-running supervisor task. Captured so `shutdown()` can await it.
    nonisolated(unsafe) private var supervisorTask: Task<Void, Never>?

    /// Monotonic counter that mints a fresh token for each pump task and
    /// each backoff sleep. Stale `.connectionEnded`/`.backoffElapsed`
    /// signals from a previous cycle are filtered out by token mismatch.
    private let signalTokenSource = SignalTokenSource()

    init(
        config: HostConfig,
        clientIdStore: ClientIdStore,
        fanOut: @escaping @Sendable (HostSubscriptionEvent) async -> Void,
        hostEventSink: @escaping @Sendable (HostEvent) async -> Void
    ) async {
        self.config = config
        self.fanOut = fanOut
        self.hostEventSink = hostEventSink

        let resolved: String
        if let explicit = config.clientId {
            resolved = explicit
        } else if let stored = await clientIdStore.load(config.id) {
            resolved = stored
        } else {
            resolved = generateClientId()
        }
        await clientIdStore.store(config.id, clientId: resolved)
        self.clientId = resolved

        let initial = HostInternal(
            id: config.id,
            label: config.label,
            clientId: resolved,
            state: .disconnected,
            lastError: nil,
            lastConnectedAt: nil,
            protocolVersion: nil,
            serverSeq: 0,
            defaultDirectory: nil,
            rootState: RootState(agents: []),
            subscriptions: config.initialSubscriptions,
            completionTriggerCharacters: [],
            sessionSummaries: [:],
            generation: 0,
            currentClient: nil
        )
        self.shared = HostShared(initial)

        var cont: AsyncStream<HostCommand>.Continuation!
        let stream = AsyncStream<HostCommand>(bufferingPolicy: .unbounded) { c in
            cont = c
        }
        self.cmdContinuation = cont
        self.cmdStream = stream
    }

    /// Start the supervisor task. Call exactly once after `init`.
    func start() {
        let task = Task { [self] in
            await self.run()
        }
        self.supervisorTask = task
    }

    // MARK: - Public command surface (called by `MultiHostClient`)

    /// Snapshot the current `HostHandle` directly from `HostShared`. Bypasses
    /// the command queue — `HostShared` is its own actor so this is safe and
    /// won't deadlock when the supervisor is mid-await on transport I/O.
    func snapshot() async -> HostHandle {
        await shared.snapshot()
    }

    /// Acquire a generation-checked client handle, when connected.
    func clientHandle() async -> HostClientHandle? {
        let state = await shared.internalState
        guard let client = state.currentClient else { return nil }
        return HostClientHandle(
            hostId: state.id,
            generation: state.generation,
            client: client,
            shared: shared
        )
    }

    /// Send a manual reconnect signal. Returns once the supervisor has
    /// observed the request (it cancels any pending backoff sleep).
    func reconnect() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            cmdContinuation.yield(.manualReconnect(reply: continuation))
        }
    }

    /// Subscribe to `uri` on the current connection. Tracks the URI so it
    /// is replayed across reconnects. Returns `HostError.hostShutDown` if
    /// the host is disconnected.
    func subscribe(_ uri: String) async throws -> SubscribeResult {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<SubscribeResult, Error>) in
            cmdContinuation.yield(.subscribe(uri: uri, reply: continuation))
        }
    }

    /// Unsubscribe from `uri`. Stops replay of `uri` across reconnects. Safe
    /// to call when disconnected — drops the URI from the replay set.
    func unsubscribe(_ uri: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            cmdContinuation.yield(.unsubscribe(uri: uri, reply: continuation))
        }
    }

    /// Dispatch an action through the current connection on `channel`.
    /// Throws `HostError.hostShutDown` if the host is disconnected.
    @discardableResult
    func dispatch(_ action: StateAction, channel: String) async throws -> DispatchHandle {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<DispatchHandle, Error>) in
            cmdContinuation.yield(.dispatch(action: action, channel: channel, clientSeq: nil, reply: continuation))
        }
    }

    /// Dispatch an action through the current connection on `channel` with a
    /// caller-owned `clientSeq`. Throws `HostError.hostShutDown` if the host
    /// is disconnected.
    @discardableResult
    func dispatch(_ action: StateAction, channel: String, clientSeq: Int) async throws -> DispatchHandle {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<DispatchHandle, Error>) in
            cmdContinuation.yield(.dispatch(action: action, channel: channel, clientSeq: clientSeq, reply: continuation))
        }
    }

    /// Tear down the supervisor: cancel any in-flight connect/sleep, close
    /// the current `AHPClient` if any, and finish the supervisor task.
    func shutdown() async {
        cmdContinuation.yield(.shutdown)
        cmdContinuation.finish()
        await supervisorTask?.value
    }

    // MARK: - Supervisor loop

    private func run() async {
        await hostEventSink(.added(config.id))

        var attempt = 0
        var iter = cmdStream.makeAsyncIterator()

        // Initial state announce — the host is about to make its first
        // connect attempt. Subsequent transitions to `.reconnecting`
        // happen at the moment the prior attempt's connection ends, so
        // `HostHandle.state` accurately reflects "we are no longer
        // connected; backoff is in flight" rather than continuing to
        // report `.connected` through the entire backoff sleep.
        await transition(to: .connecting, error: nil)

        outer: while true {
            attempt += 1

            // Try to connect. On success we run the connection until it ends.
            do {
                let streams = try await connectOnce()
                if config.reconnectPolicy.resetOnSuccess {
                    attempt = 0
                }
                let outcome = await runConnection(streams: streams, iter: &iter)
                await tearDownClient()
                switch outcome {
                case .shutdown:
                    return
                case .manualReconnect(let reply):
                    reply.resume()
                    attempt = 0
                    await transition(to: .connecting, error: nil)
                    continue outer
                case .disconnected:
                    // Connection dropped. Surface that immediately so
                    // `HostHandle.state` doesn't keep reporting `.connected`
                    // through the backoff sleep. `attempt` here is either
                    // the count of consecutive failures since last success
                    // (no reset) or 0 (just reset by `resetOnSuccess`); the
                    // next reconnect attempt and displayed attempt are both
                    // clamped to ≥ 1 per the 1-based contract on
                    // `HostState.reconnecting`.
                    attempt = max(1, attempt)
                    let lastErr = await shared.lastError()
                    await transition(
                        to: .reconnecting(attempt: attempt),
                        error: lastErr
                    )
                }
            } catch {
                let reason = String(describing: error)
                await shared.update { $0.lastError = reason }
                // Failed connect attempt. `attempt` was just bumped at the
                // top of this iteration so it is ≥ 1.
                await transition(to: .reconnecting(attempt: attempt), error: reason)
            }

            if config.reconnectPolicy.attemptsExhausted(attempt) {
                let reason = (await shared.lastError()) ?? "reconnect attempts exhausted"
                await transition(to: .failed(reason: reason), error: reason)
                let outcome = await waitForManualReconnectOrShutdown(iter: &iter)
                switch outcome {
                case .shutdown: return
                case .manualReconnect(let reply):
                    reply.resume()
                    attempt = 0
                    await transition(to: .connecting, error: nil)
                    continue outer
                case .disconnected:
                    return
                }
            }

            let delay = config.reconnectPolicy.delay(forAttempt: attempt, sample: jitterSample())
            let outcome = await sleepOrCommand(delay: delay, iter: &iter)
            switch outcome {
            case .shutdown:
                return
            case .manualReconnect(let reply):
                reply.resume()
                attempt = 0
                await transition(to: .connecting, error: nil)
                continue outer
            case .disconnected:
                // Backoff elapsed; `state` is already `.reconnecting(attempt:)`
                // from the disconnect / failure branch above. The next
                // iteration runs the actual connect.
                continue outer
            }
        }
    }

    /// Open a transport, hand it to a fresh `AHPClient`, attach the events
    /// tap *before* the handshake, and complete `initialize`/`reconnect`
    /// plus an opportunistic `listSessions`. Returns both the `client.events`
    /// stream and the `client.stateChanges` stream so the caller can drive
    /// the per-connection event pump *and* a drop detector.
    ///
    /// Any failure after `client.connect()` has started the writer/receive
    /// tasks is funneled through `withClientShutdownOnThrow` so the
    /// orphaned `AHPClient` is torn down before the error propagates back
    /// to the supervisor (which would otherwise open a fresh transport on
    /// the next attempt while the previous client's tasks remain alive).
    private func connectOnce() async throws -> ConnectionStreams {
        let transport = try await config.transportFactory(config.id)
        let client = AHPClient(transport: transport, config: config.clientConfig)

        // Attach the events and state-change taps BEFORE the
        // initialize/reconnect handshake so any notifications the server
        // pushes between the response and the moment we enter the run
        // loop are captured rather than dropped. PR 2's
        // `events_tap_captures_handshake_notifications` test exists to
        // protect this contract for `events`. We also need
        // `stateChanges` because `AHPClient.handleTransportFailure`
        // intentionally keeps the events stream alive after a transport
        // drop (so consumers can observe later state transitions); the
        // only signal we get on a real drop is `connectionState` flipping
        // to `.disconnected`.
        let events = await client.events
        let stateChanges = await client.stateChanges

        try await client.connect()

        // From here on, every `throw` must shut down `client` before
        // propagating — `client.connect()` started writer/receive tasks
        // that hold the transport. `withClientShutdownOnThrow` enforces it.
        return try await withClientShutdownOnThrow(client) {
            try await self.completeHandshake(client: client, events: events, stateChanges: stateChanges)
        }
    }

    /// Run the `initialize`/`reconnect` handshake, the opportunistic
    /// `listSessions` seed, and atomically install the new client in
    /// `HostShared`. Called inside `withClientShutdownOnThrow` so a throw
    /// from any of these steps tears the client down before bubbling up.
    private func completeHandshake(
        client: AHPClient,
        events: AsyncStream<ClientEvent>,
        stateChanges: AsyncStream<ConnectionState>
    ) async throws -> ConnectionStreams {
        // Decide between initialize and reconnect based on prior state.
        let priorSnapshot = await shared.internalState
        let canReconnect = priorSnapshot.serverSeq > 0 && !priorSnapshot.subscriptions.isEmpty
        let priorSubscriptions = priorSnapshot.subscriptions
        let priorSeq = priorSnapshot.serverSeq

        var initResult: InitializeResult? = nil
        var reconnectResult: ReconnectResult? = nil
        var newSeq = priorSeq

        if canReconnect {
            do {
                reconnectResult = try await client.reconnect(
                    clientId: clientId,
                    lastSeenServerSeq: priorSeq,
                    subscriptions: priorSubscriptions
                )
            } catch let error as AHPClientError {
                if case .rpc = error {
                    let init1 = try await client.initialize(
                        clientId: clientId,
                        protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
                        initialSubscriptions: priorSubscriptions
                    )
                    initResult = init1
                    newSeq = init1.serverSeq
                } else {
                    throw error
                }
            }
        } else {
            let init1 = try await client.initialize(
                clientId: clientId,
                protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
                initialSubscriptions: priorSubscriptions
            )
            initResult = init1
            newSeq = init1.serverSeq
        }

        // Refresh session summaries from `listSessions`. Cheap on first
        // connect; kept in sync by notifications afterward. Failures are
        // non-fatal: the cache stays as-is.
        let summaries: ListSessionsResult? = if config.refreshSessionSummariesOnConnect {
            try? await client.request(method: "listSessions", params: ListSessionsParams(channel: RootResourceURI))
        } else {
            nil
        }

        let newGeneration: UInt64 = await {
            var generation: UInt64 = 0
            await shared.update { state in
                state.generation = state.generation &+ 1
                state.currentClient = client
                state.lastConnectedAt = Date()
                state.lastError = nil
                state.serverSeq = newSeq
                if let init1 = initResult {
                    state.protocolVersion = init1.protocolVersion
                    state.defaultDirectory = init1.defaultDirectory
                    state.completionTriggerCharacters = init1.completionTriggerCharacters ?? []
                    if let snap = init1.snapshots.first(where: { $0.resource == RootResourceURI }) {
                        if case .root(let root) = snap.state {
                            state.rootState = root
                        }
                    }
                }
                if let list = summaries {
                    state.sessionSummaries.removeAll()
                    for summary in list.items {
                        state.sessionSummaries[summary.resource] = summary
                    }
                }
                generation = state.generation
            }
            return generation
        }()

        if let reconnectResult {
            await applyReconnectResult(reconnectResult, priorSubscriptions: priorSubscriptions)
            await hostEventSink(.reconnectResult(config.id, reconnectResult))
        }

        await transition(to: .connected, error: nil)
        await hostEventSink(.connected(config.id, generation: newGeneration))
        return ConnectionStreams(events: events, stateChanges: stateChanges)
    }

    /// Apply the result of a successful `reconnect` call.
    ///
    /// Replay envelopes use the same reducer path as live action frames so
    /// host snapshots advance before consumers see fanned-out replay events.
    /// Snapshot results refresh root mirror state and prune subscriptions the
    /// server could not resume.
    private func applyReconnectResult(
        _ result: ReconnectResult,
        priorSubscriptions: [String]
    ) async {
        switch result {
        case .replay(let replay):
            for envelope in replay.actions {
                await applyAction(envelope)
                if config.fanOutReconnectReplayActions {
                    await fanOut(HostSubscriptionEvent(
                        hostId: config.id,
                        resource: envelope.channel,
                        event: .action(envelope)
                    ))
                }
            }
            if !replay.missing.isEmpty {
                await shared.update { state in
                    state.subscriptions.removeAll { replay.missing.contains($0) }
                }
            }
        case .snapshot(let snapshotResult):
            await shared.update { state in
                var surviving: [String] = []
                surviving.reserveCapacity(snapshotResult.snapshots.count)
                for snapshot in snapshotResult.snapshots {
                    if snapshot.fromSeq > state.serverSeq {
                        state.serverSeq = snapshot.fromSeq
                    }
                    if snapshot.resource == RootResourceURI,
                       case .root(let root) = snapshot.state {
                        state.rootState = root
                    }
                    surviving.append(snapshot.resource)
                }
                state.subscriptions.removeAll { uri in
                    priorSubscriptions.contains(uri) && !surviving.contains(uri)
                }
            }
        }
    }

    /// Drain commands and the event pump until the connection ends, the user
    /// asks for a manual reconnect, or shutdown is requested.
    private func runConnection(
        streams: ConnectionStreams,
        iter: inout AsyncStream<HostCommand>.AsyncIterator
    ) async -> RunOutcome {
        // Per-connection token so a stale `.connectionEnded` from a prior
        // pump task can't trick this drain loop into thinking the new
        // connection has already failed.
        let connectionToken = signalTokenSource.next()
        let events = streams.events
        let stateChanges = streams.stateChanges
        let pumpTask = Task { [weak self, cmdContinuation] in
            guard let self else { return }
            for await event in events {
                await self.handleEvent(event)
            }
            cmdContinuation.yield(.connectionEnded(token: connectionToken))
        }
        // Drop detector. `AHPClient.handleTransportFailure` does not finish
        // the events stream after a transport drop (it intentionally keeps
        // the multicast taps alive so consumers can observe later state
        // transitions), so the only signal we get on a real drop is
        // `connectionState` flipping to `.disconnected`. This task converts
        // that into a `.connectionEnded(token:)` sentinel.
        let dropDetector = Task { [cmdContinuation] in
            for await state in stateChanges {
                if case .disconnected = state {
                    cmdContinuation.yield(.connectionEnded(token: connectionToken))
                    return
                }
            }
        }

        defer {
            pumpTask.cancel()
            dropDetector.cancel()
        }

        while let cmd = await iter.next() {
            switch cmd {
            case .shutdown:
                return .shutdown
            case .connectionEnded(let token):
                if token == connectionToken {
                    return .disconnected
                }
                continue
            case .backoffElapsed:
                continue
            case .manualReconnect(let reply):
                return .manualReconnect(reply: reply)
            case .subscribe(let uri, let reply):
                let result = await handleSubscribe(uri)
                resumeCommand(reply: reply, with: result)
            case .unsubscribe(let uri, let reply):
                let result = await handleUnsubscribe(uri)
                resumeCommand(reply: reply, with: result)
            case .dispatch(let action, let channel, let clientSeq, let reply):
                let result = await handleDispatch(action, channel: channel, clientSeq: clientSeq)
                resumeCommand(reply: reply, with: result)
            }
        }
        return .shutdown
    }

    /// Wait for either a manual reconnect or shutdown while in the
    /// `.failed` terminal state. Subscribe/unsubscribe still mutate the
    /// replay set so the next reconnect picks them up.
    private func waitForManualReconnectOrShutdown(
        iter: inout AsyncStream<HostCommand>.AsyncIterator
    ) async -> RunOutcome {
        while let cmd = await iter.next() {
            switch cmd {
            case .shutdown:
                return .shutdown
            case .manualReconnect(let reply):
                return .manualReconnect(reply: reply)
            case .backoffElapsed, .connectionEnded:
                continue
            case .subscribe(let uri, let reply):
                await shared.appendSubscription(uri)
                reply.resume(throwing: HostError.hostShutDown(config.id))
            case .unsubscribe(let uri, let reply):
                await shared.removeSubscription(uri)
                reply.resume(returning: ())
            case .dispatch(_, _, _, let reply):
                reply.resume(throwing: HostError.hostShutDown(config.id))
            }
        }
        return .shutdown
    }

    /// Sleep for `delay` while still servicing snapshot-class commands.
    /// Manual reconnect or shutdown short-circuits the sleep.
    private func sleepOrCommand(
        delay: Duration,
        iter: inout AsyncStream<HostCommand>.AsyncIterator
    ) async -> RunOutcome {
        if delay == .zero {
            return .disconnected
        }
        let cont = cmdContinuation
        let sleepToken = signalTokenSource.next()
        let sleepTask = Task<Void, Never> {
            try? await Task.sleep(for: delay)
            cont.yield(.backoffElapsed(token: sleepToken))
        }
        defer { sleepTask.cancel() }

        while let cmd = await iter.next() {
            switch cmd {
            case .shutdown:
                return .shutdown
            case .manualReconnect(let reply):
                return .manualReconnect(reply: reply)
            case .backoffElapsed(let token):
                if token == sleepToken {
                    return .disconnected
                }
                continue
            case .connectionEnded:
                continue
            case .subscribe(let uri, let reply):
                await shared.appendSubscription(uri)
                reply.resume(throwing: HostError.hostShutDown(config.id))
            case .unsubscribe(let uri, let reply):
                await shared.removeSubscription(uri)
                reply.resume(returning: ())
            case .dispatch(_, _, _, let reply):
                reply.resume(throwing: HostError.hostShutDown(config.id))
            }
        }
        return .shutdown
    }

    // MARK: - Event handling

    private func handleEvent(_ event: ClientEvent) async {
        // Mutate per-host mirrors before broadcasting so observers reading
        // the next snapshot see the post-event state.
        switch event.event {
        case .action(let envelope):
            await applyAction(envelope)
        case .sessionAdded(let n):
            await shared.update { state in
                state.sessionSummaries[n.summary.resource] = n.summary
            }
        case .sessionRemoved(let n):
            await shared.update { state in
                state.sessionSummaries.removeValue(forKey: n.session)
            }
        case .sessionSummaryChanged(let n):
            await shared.update { state in
                if var existing = state.sessionSummaries[n.session] {
                    applySummaryChanges(&existing, changes: n.changes)
                    state.sessionSummaries[n.session] = existing
                }
            }
        case .authRequired:
            break
        }
        let hostEvent = HostSubscriptionEvent(
            hostId: config.id,
            resource: event.resource,
            event: event.event
        )
        await fanOut(hostEvent)
    }

    private func applyAction(_ envelope: ActionEnvelope) async {
        await shared.update { state in
            if envelope.serverSeq > state.serverSeq {
                state.serverSeq = envelope.serverSeq
            }
            // Best-effort root state mirror update via the existing pure
            // reducer. Non-root channels slip through without effect — that's
            // the same posture as the Rust SDK.
            if envelope.channel == RootResourceURI {
                state.rootState = rootReducer(state: state.rootState, action: envelope.action)
            }
        }
    }

    // MARK: - Active-connection command handlers

    private func handleSubscribe(_ uri: String) async -> Result<SubscribeResult, HostError> {
        guard let client = await shared.currentClient() else {
            return .failure(.hostShutDown(config.id))
        }
        do {
            let (result, _) = try await client.subscribe(uri)
            await shared.appendSubscription(uri)
            return .success(result)
        } catch let error as AHPClientError {
            return .failure(.client(error))
        } catch {
            return .failure(.client(.transport(.io(String(describing: error)))))
        }
    }

    private func handleUnsubscribe(_ uri: String) async -> Result<Void, HostError> {
        let client = await shared.currentClient()
        if let client {
            do {
                try await client.unsubscribe(uri)
            } catch let error as AHPClientError {
                return .failure(.client(error))
            } catch {
                return .failure(.client(.transport(.io(String(describing: error)))))
            }
        }
        await shared.removeSubscription(uri)
        return .success(())
    }

    private func handleDispatch(_ action: StateAction, channel: String, clientSeq: Int?) async -> Result<DispatchHandle, HostError> {
        guard let client = await shared.currentClient() else {
            return .failure(.hostShutDown(config.id))
        }
        do {
            let handle: DispatchHandle
            if let clientSeq {
                handle = try await client.dispatch(action, channel: channel, clientSeq: clientSeq)
            } else {
                handle = try await client.dispatch(action, channel: channel)
            }
            return .success(handle)
        } catch let error as AHPClientError {
            return .failure(.client(error))
        } catch {
            return .failure(.client(.transport(.io(String(describing: error)))))
        }
    }

    // MARK: - State transitions and tear-down

    private func transition(to state: HostState, error: String?) async {
        await shared.update { s in
            s.state = state
            if let error {
                s.lastError = error
            }
        }
        await hostEventSink(.stateChanged(config.id, state, lastError: error))
    }

    private func tearDownClient() async {
        let prev: AHPClient? = await {
            var captured: AHPClient? = nil
            await shared.update { state in
                captured = state.currentClient
                state.currentClient = nil
            }
            return captured
        }()
        if let prev {
            await prev.shutdown()
        }
    }
}

// MARK: - Helpers

/// Commands the supervisor consumes. All public API on `HostRuntime` reduces
/// to enqueueing one of these.
internal enum HostCommand: Sendable {
    case shutdown
    /// Sentinel from a connection's event-pump task signalling that the
    /// underlying transport drained. The token identifies *which*
    /// connection ended, so stale signals queued after `runConnection`
    /// already returned (e.g. for a manual reconnect) are ignored by the
    /// next runConnection cycle instead of being mistaken for an immediate
    /// disconnect on the brand-new connection.
    case connectionEnded(token: UInt64)
    /// Sentinel from `sleepOrCommand`'s sleep task signalling that the
    /// backoff delay elapsed. Tagged with a token for the same reason as
    /// `connectionEnded`.
    case backoffElapsed(token: UInt64)
    case manualReconnect(reply: CheckedContinuation<Void, Error>)
    case subscribe(uri: String, reply: CheckedContinuation<SubscribeResult, Error>)
    case unsubscribe(uri: String, reply: CheckedContinuation<Void, Error>)
    case dispatch(action: StateAction, channel: String, clientSeq: Int?, reply: CheckedContinuation<DispatchHandle, Error>)
}

/// Outcome of one of the supervisor's drain loops.
private enum RunOutcome {
    case shutdown
    case disconnected
    case manualReconnect(reply: CheckedContinuation<Void, Error>)
}

/// Bundle of multicast streams attached to the per-connection `AHPClient`.
/// Returned by `connectOnce` and consumed by `runConnection`.
internal struct ConnectionStreams: @unchecked Sendable {
    let events: AsyncStream<ClientEvent>
    let stateChanges: AsyncStream<ConnectionState>
}

/// Resume a `CheckedContinuation<T, Error>` with a `Result<T, HostError>`.
private func resumeCommand<T: Sendable>(
    reply: CheckedContinuation<T, Error>,
    with result: Result<T, HostError>
) {
    switch result {
    case .success(let value): reply.resume(returning: value)
    case .failure(let error): reply.resume(throwing: error)
    }
}

/// Run `body`; if it throws, shut down `client` before rethrowing. Used to
/// keep handshake failures (`initialize`, `reconnect`, `listSessions`) from
/// leaking an `AHPClient` whose writer/receive tasks are already running —
/// without it, a failed connect attempt would leave the previous client's
/// tasks alive while the supervisor opens a fresh transport for the next
/// retry, holding the original transport indefinitely.
private func withClientShutdownOnThrow<T: Sendable>(
    _ client: AHPClient,
    _ body: () async throws -> T
) async throws -> T {
    do {
        return try await body()
    } catch {
        await client.shutdown()
        throw error
    }
}

/// Mirror Rust: SipHash + atomic counter is enough randomness for jitter.
private func jitterSample() -> Double {
    var hasher = Hasher()
    hasher.combine(jitterCounter.bumpAndGet())
    hasher.combine(Date().timeIntervalSince1970.bitPattern)
    let bits = UInt64(bitPattern: Int64(hasher.finalize()))
    return Double(bits) / Double(UInt64.max)
}

private final class JitterCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var n: UInt64 = 0
    func bumpAndGet() -> UInt64 {
        lock.lock(); defer { lock.unlock() }
        n &+= 1
        return n
    }
}

private let jitterCounter = JitterCounter()

/// Thread-safe monotonic counter producing per-connection / per-sleep tokens
/// so stale signals from prior pump tasks can't leak into a fresh
/// `runConnection`/`sleepOrCommand` cycle.
internal final class SignalTokenSource: @unchecked Sendable {
    private let lock = NSLock()
    private var counter: UInt64 = 0

    func next() -> UInt64 {
        lock.lock(); defer { lock.unlock() }
        counter &+= 1
        return counter
    }
}

/// Generate a UUIDv4-shaped client id without taking a UUID dependency from
/// other targets. Foundation's `UUID()` is fine here.
private func generateClientId() -> String {
    UUID().uuidString.lowercased()
}

/// Apply a `PartialSessionSummary` patch in-place. Identity fields are
/// ignored per spec.
private func applySummaryChanges(
    _ existing: inout SessionSummary,
    changes: PartialSessionSummary
) {
    if let v = changes.title { existing.title = v }
    if let v = changes.status { existing.status = v }
    if let v = changes.activity { existing.activity = v }
    if let v = changes.modifiedAt { existing.modifiedAt = v }
    if let v = changes.project { existing.project = v }
    if let v = changes.model { existing.model = v }
    if let v = changes.workingDirectory { existing.workingDirectory = v }
}

