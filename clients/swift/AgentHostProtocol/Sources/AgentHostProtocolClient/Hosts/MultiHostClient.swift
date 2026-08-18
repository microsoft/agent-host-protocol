// MultiHostClient — public actor facade that owns multiple `HostRuntime`s and
// fans inbound events into multicast streams.

import Foundation
import AgentHostProtocol

/// Default buffer size for fan-in event streams. Slow consumers see oldest
/// items dropped (matching `AHPClient.events` semantics) rather than blocking
/// the publisher.
private let defaultFanInBuffer: Int = 1024

/// Multi-host client.
///
/// Wraps N independent `AHPClient`s behind a single facade with per-host
/// supervisor tasks, generation-checked client handles, multicast event
/// streams, and a session-summary cache per host. Single-host consumers can
/// use `MultiHostClient.single(_:)` to skip the registry-style API entirely.
///
/// `MultiHostClient` is an `actor` and runs off the main thread. UI threading
/// is the consumer's concern — wrap it in your `@MainActor` `@Observable`
/// store to bind into SwiftUI.
///
/// **Lifecycle:** call `shutdown()` when you're done. Per-host runtimes spawn
/// long-running supervisor tasks that don't stop on `deinit`.
public actor MultiHostClient {

    private let clientIdStore: ClientIdStore
    private var hosts: [HostId: HostRuntime] = [:]
    /// Ids that are mid-add. Reserved synchronously so two concurrent
    /// `add(_:)` calls for the same id can't both pass the duplicate check
    /// across the `await HostRuntime(...)` suspension.
    private var pendingHostIds: Set<HostId> = []
    /// Insertion order of hosts (resolved on `add`). Used for deterministic
    /// secondary tie-breaking in aggregated views.
    private var hostOrder: [HostId] = []
    private var didShutDown: Bool = false

    // Multicast bookkeeping. Each `events()` / `hostEvents()` call gets a
    // fresh `AsyncStream`; we register its continuation on the actor and
    // remove it on stream termination.
    private var nextListenerId: UInt64 = 1
    private var subscriptionListeners: [UInt64: AsyncStream<HostSubscriptionEvent>.Continuation] = [:]
    private var hostEventListeners: [UInt64: AsyncStream<HostEvent>.Continuation] = [:]
    /// Per-`(hostId, uri)` listener registry for `events(host:uri:)`.
    /// Lives on this actor (rather than inside `HostRuntime`) so listeners
    /// outlive any single `AHPClient` instance and survive reconnects —
    /// replayed envelopes from `applyReconnectResult` flow through the
    /// same `broadcastSubscriptionEvent` path live envelopes do.
    /// Keyed first by host, then by listener id, so removing a listener
    /// is O(1) and looking up listeners for a host on every event is
    /// O(1) lookup + O(matching listeners) iteration.
    private var perResourceListeners: [HostId: [UInt64: PerResourceListener]] = [:]

    public init(clientIdStore: ClientIdStore = InMemoryClientIdStore()) {
        self.clientIdStore = clientIdStore
    }

    /// Convenience constructor for single-host consumers.
    ///
    /// Builds an empty `MultiHostClient`, registers `config`, and returns
    /// the resulting `HostHandle` snapshot taken immediately after the
    /// supervisor task is spawned. The snapshot may be `.disconnected`,
    /// `.connecting`, `.connected`, `.reconnecting`, or `.failed` depending
    /// on how far the first connect attempt has progressed; consumers that
    /// need to wait for `.connected` should subscribe to `hostEvents()` or
    /// poll `host(_:)`.
    public static func single(
        _ config: HostConfig,
        clientIdStore: ClientIdStore = InMemoryClientIdStore()
    ) async throws -> (MultiHostClient, HostHandle) {
        let multi = MultiHostClient(clientIdStore: clientIdStore)
        let handle = try await multi.add(config)
        return (multi, handle)
    }

    // MARK: - Host registry

    /// Register a new host and start its supervisor. Throws
    /// `HostError.duplicateHost` if `config.id` is already registered (or
    /// is mid-`add` from a concurrent caller). Throws
    /// `HostError.hostShutDown` if `MultiHostClient.shutdown()` has been
    /// called.
    @discardableResult
    public func add(_ config: HostConfig) async throws -> HostHandle {
        let id = config.id
        if didShutDown {
            throw HostError.hostShutDown(id)
        }
        if hosts[id] != nil || pendingHostIds.contains(id) {
            throw HostError.duplicateHost(id)
        }
        // Reserve the id synchronously so a concurrent `add(_:)` for the
        // same id can't slip past the duplicate check while we await on
        // `HostRuntime.init`'s `clientIdStore` lookups.
        pendingHostIds.insert(id)

        // Capture isolated callbacks that publish back into this actor.
        // Sinks are `async` and awaited from the runtime so per-host event
        // ordering is preserved (a fresh per-event Task would be racy
        // because each Task's hop into the actor can interleave).
        let fanOut: @Sendable (HostSubscriptionEvent) async -> Void = { [weak self] event in
            guard let self else { return }
            await self.broadcastSubscriptionEvent(event)
        }
        let hostEventSink: @Sendable (HostEvent) async -> Void = { [weak self] event in
            guard let self else { return }
            await self.broadcastHostEvent(event)
        }

        let runtime = await HostRuntime(
            config: config,
            clientIdStore: clientIdStore,
            fanOut: fanOut,
            hostEventSink: hostEventSink
        )

        // We may have been shut down while awaiting the runtime init; bail
        // before exposing the new supervisor.
        if didShutDown {
            pendingHostIds.remove(id)
            await runtime.shutdown()
            throw HostError.hostShutDown(id)
        }

        hosts[id] = runtime
        hostOrder.append(id)
        pendingHostIds.remove(id)
        runtime.start()
        return await runtime.snapshot()
    }

    /// Remove a host, cancelling its supervisor task and dropping its current
    /// connection. Outstanding `HostClientHandle`s for this host become stale
    /// and surface `HostError.hostShutDown` (or `AHPClientError.shutdown` if
    /// raced).
    ///
    /// Per-`(host, uri)` event streams returned by `events(host:uri:)` for
    /// this host are finished, so consumers' `for await` loops exit
    /// cleanly.
    public func remove(_ id: HostId) async throws {
        guard let runtime = hosts.removeValue(forKey: id) else {
            throw HostError.unknownHost(id)
        }
        hostOrder.removeAll { $0 == id }
        finishPerResourceListeners(for: id)
        await runtime.shutdown()
        broadcastHostEvent(.removed(id))
    }

    /// Trigger a manual reconnect. Cancels any in-flight backoff sleep and
    /// jumps to the next connect attempt. Returns once the supervisor has
    /// observed the request.
    public func reconnect(_ id: HostId) async throws {
        guard let runtime = hosts[id] else {
            throw HostError.unknownHost(id)
        }
        try await runtime.reconnect()
    }

    /// Trigger a manual reconnect on every registered host that is **not**
    /// currently `.connected` or `.connecting` — i.e., hosts in
    /// `.disconnected`, `.reconnecting`, or `.failed`. Hosts already
    /// connected (or actively connecting) are skipped.
    ///
    /// Designed for the mobile scene-phase pattern: on
    /// `ScenePhase.active`, call this to wake every host the user has
    /// been away from instead of writing the loop in every consumer.
    /// Useful in particular for `.failed` hosts whose reconnect policy
    /// is exhausted — a manual reconnect bypasses the policy and starts
    /// a fresh attempt.
    ///
    /// Reconnect requests are dispatched concurrently; this method
    /// returns once every supervisor has either acknowledged its
    /// request or thrown. Per-host errors are collected and returned;
    /// the call does not throw.
    @discardableResult
    public func reconnectAllUnavailable() async -> [HostId: Error] {
        var pending: [(HostId, HostRuntime)] = []
        for id in hostOrder {
            guard let runtime = hosts[id] else { continue }
            let snap = await runtime.snapshot()
            switch snap.state {
            case .connected, .connecting:
                continue
            case .disconnected, .reconnecting, .failed:
                pending.append((id, runtime))
            }
        }
        return await withTaskGroup(of: (HostId, Error?).self) { group in
            for (id, runtime) in pending {
                group.addTask {
                    do {
                        try await runtime.reconnect()
                        return (id, nil)
                    } catch {
                        return (id, error)
                    }
                }
            }
            var errors: [HostId: Error] = [:]
            for await (id, error) in group {
                if let error { errors[id] = error }
            }
            return errors
        }
    }

    /// Snapshot the current state of `id`, or `nil` if no host is registered
    /// under that id.
    public func host(_ id: HostId) async -> HostHandle? {
        guard let runtime = hosts[id] else { return nil }
        return await runtime.snapshot()
    }

    /// Snapshot every registered host. Order is unspecified.
    public func hosts() async -> [HostHandle] {
        var out: [HostHandle] = []
        out.reserveCapacity(hosts.count)
        for runtime in hosts.values {
            out.append(await runtime.snapshot())
        }
        return out
    }

    /// Acquire a generation-checked client handle for `id`. Returns `nil` if
    /// the host is not registered or has no live connection.
    public func client(for id: HostId) async -> HostClientHandle? {
        guard let runtime = hosts[id] else { return nil }
        return await runtime.clientHandle()
    }

    // MARK: - Per-host convenience wrappers

    /// Subscribe to `uri` on `host`. Tracks the URI for replay across
    /// reconnects.
    ///
    /// **Returns only the server's `SubscribeResult`** (the per-resource
    /// snapshot the server pushes back). To consume the live stream of
    /// `ActionEnvelope`s for `uri`, call `events(host:uri:)` separately
    /// — typically **before** this call, so no envelopes the server
    /// pushes between the subscribe response and your `for await` loop
    /// are dropped:
    ///
    /// ```swift
    /// guard let stream = await multi.events(host: hostId, uri: uri) else {
    ///     // host isn't registered — handle as appropriate for your app
    ///     return
    /// }
    /// let snapshot = try await multi.subscribe(host: hostId, uri: uri)
    /// for await event in stream { ... }
    /// ```
    @discardableResult
    public func subscribe(host: HostId, uri: String) async throws -> SubscribeResult {
        guard let runtime = hosts[host] else {
            throw HostError.unknownHost(host)
        }
        return try await runtime.subscribe(uri)
    }

    /// Unsubscribe from `uri` on `host`. Drops the URI from the replay set.
    public func unsubscribe(host: HostId, uri: String) async throws {
        guard let runtime = hosts[host] else {
            throw HostError.unknownHost(host)
        }
        try await runtime.unsubscribe(uri)
    }

    /// Dispatch an action on `host` for `channel`. Returns the resulting
    /// `DispatchHandle` (carrying `clientSeq`) for optimistic-update
    /// correlation.
    @discardableResult
    public func dispatch(host: HostId, action: StateAction, channel: String) async throws -> DispatchHandle {
        guard let runtime = hosts[host] else {
            throw HostError.unknownHost(host)
        }
        return try await runtime.dispatch(action, channel: channel)
    }

    /// Dispatch an action on `host` for `channel` with a caller-owned
    /// `clientSeq`. Use this when an app-level outbox needs stable sequence
    /// numbers across reconnect/replay.
    @discardableResult
    public func dispatch(host: HostId, action: StateAction, channel: String, clientSeq: Int) async throws -> DispatchHandle {
        guard let runtime = hosts[host] else {
            throw HostError.unknownHost(host)
        }
        return try await runtime.dispatch(action, channel: channel, clientSeq: clientSeq)
    }

    // MARK: - Event multicast

    /// Subscribe to a fan-in stream of every inbound event from every
    /// registered host.
    ///
    /// Each call returns a fresh `AsyncStream` — multiple consumers can
    /// listen independently. The stream uses
    /// `.bufferingNewest(defaultFanInBuffer)`; slow consumers will lose
    /// older events but the stream stays alive (matching the lossy `Lagged`
    /// semantics of the Rust SDK's broadcast).
    ///
    /// **Use this for advisory / notification-style consumption only.** It
    /// is **not safe for reducer-critical `ActionEnvelope`s** because
    /// dropped envelopes desync downstream state mirrors. For
    /// guaranteed-delivery per-channel action streams, use
    /// `events(host:uri:)` instead — that surface uses unbounded
    /// buffering per channel and survives reconnects.
    ///
    /// **Ordering** is per-host only. Different hosts run independently;
    /// there is no cross-host total order.
    ///
    /// `async` so registration completes synchronously with respect to the
    /// caller — no events fired between `events()` and the next `await` are
    /// missed.
    public func events() async -> AsyncStream<HostSubscriptionEvent> {
        let id = bumpListenerId()
        return AsyncStream<HostSubscriptionEvent>(
            bufferingPolicy: .bufferingNewest(defaultFanInBuffer)
        ) { cont in
            self.subscriptionListeners[id] = cont
            cont.onTermination = { [weak self] _ in
                guard let self else { return }
                Task { await self.removeSubscriptionListener(id: id) }
            }
        }
    }

    /// Per-`(host, channel)` event stream — **the reliable channel for
    /// reducer-critical action envelopes**.
    ///
    /// Returns a fresh `AsyncStream<SubscriptionEvent>` that delivers
    /// every event scoped to `uri` on `host` — both live envelopes and
    /// envelopes replayed during reconnect. The stream is **unbounded**
    /// (no buffer drop) because losing an action envelope would desync
    /// downstream state mirrors.
    ///
    /// Unlike the per-channel streams returned by `AHPClient.subscribe(_:)`,
    /// **these listeners survive reconnects**: they're owned by
    /// `MultiHostClient`, not by any single `AHPClient` instance, so
    /// replayed envelopes that the supervisor fans out on reconnect
    /// reach them too.
    ///
    /// Every event carries the channel it was delivered on, so
    /// session/auth-style notifications surface on the channel the
    /// server scoped them to (typically `RootResourceURI` for
    /// `root/sessionAdded`/`Removed`/`SummaryChanged`). Listen on the
    /// channel that matches the events you care about.
    ///
    /// **Subscription is independent from registration.** Calling
    /// `events(host:uri:)` does NOT send a `subscribe` request to the
    /// server. You still call `subscribe(host:uri:)` to ask the server
    /// to start delivering for `uri` (and to track it for replay across
    /// reconnects). Attach the listener **before** `subscribe(host:uri:)`
    /// to avoid missing the initial post-subscribe events:
    ///
    /// ```swift
    /// guard let stream = await multi.events(host: hostId, uri: uri) else {
    ///     // host isn't registered — handle as appropriate for your app
    ///     return
    /// }
    /// _ = try await multi.subscribe(host: hostId, uri: uri)
    /// for await event in stream { ... }
    /// ```
    ///
    /// **Consume promptly.** The stream is unbounded — a stalled consumer
    /// retains an unbounded backlog. Process events on a fast loop and
    /// dispatch reducer work asynchronously if needed.
    ///
    /// Returns `nil` if no host with `host` is registered.
    public func events(host: HostId, uri: String) async -> AsyncStream<SubscriptionEvent>? {
        guard hosts[host] != nil else { return nil }
        let id = bumpListenerId()
        return AsyncStream<SubscriptionEvent>(bufferingPolicy: .unbounded) { cont in
            let listener = PerResourceListener(uri: uri, continuation: cont)
            var bucket = self.perResourceListeners[host, default: [:]]
            bucket[id] = listener
            self.perResourceListeners[host] = bucket
            cont.onTermination = { [weak self] _ in
                guard let self else { return }
                Task { await self.removePerResourceListener(host: host, id: id) }
            }
        }
    }

    /// Subscribe to connection-state events for UX. Each call returns a
    /// fresh stream.
    public func hostEvents() async -> AsyncStream<HostEvent> {
        let id = bumpListenerId()
        return AsyncStream<HostEvent>(
            bufferingPolicy: .bufferingNewest(defaultFanInBuffer)
        ) { cont in
            self.hostEventListeners[id] = cont
            cont.onTermination = { [weak self] _ in
                guard let self else { return }
                Task { await self.removeHostEventListener(id: id) }
            }
        }
    }

    /// Observable stream of `HostHandle` snapshots for `host`.
    ///
    /// Yields the current snapshot **immediately** on subscription, then
    /// yields a fresh snapshot whenever the host's observable state
    /// changes — connection state transitions, reconnect completion,
    /// session summary updates, subscription set changes, and so on.
    ///
    /// Convenient for `@Observable` UI binding without the
    /// "refresh-on-every-event" boilerplate. The stream uses
    /// `.bufferingNewest(1)` since only the latest snapshot is useful
    /// to a UI consumer; slow consumers will drop intermediate
    /// snapshots and resume with the most recent. Yields may repeat
    /// when a sequence of changes produces the same snapshot;
    /// consumers should compare against the previous value if
    /// duplicates matter (e.g., via `Equatable`-friendly diffing).
    ///
    /// "Immediately" here means the initial value is dispatched onto
    /// the stream as the first element. Because `AsyncStream`'s build
    /// closure is synchronous, the dispatch goes through a short-lived
    /// `Task` — so the very first `await iter.next()` resolves to the
    /// snapshot captured at subscription time, but it isn't strictly
    /// synchronous with the caller.
    ///
    /// Returns `nil` if no host with `host` is registered.
    public func hostSnapshots(host: HostId) async -> AsyncStream<HostHandle>? {
        guard let runtime = hosts[host] else { return nil }
        return AsyncStream<HostHandle>(bufferingPolicy: .bufferingNewest(1)) { cont in
            // Dispatch the initial snapshot as the first stream element.
            // We can't `await runtime.snapshot()` inline because this
            // build closure is synchronous; the short-lived `Task` hop
            // is what "immediately" in the docstring above refers to.
            Task { [runtime] in
                cont.yield(await runtime.snapshot())
            }

            // Spawn a watcher Task that re-yields on every relevant
            // signal. We bridge two upstream streams (host-level events
            // and inbound subscription events) into one merged refresh
            // signal; both can drive an observable change to the
            // snapshot.
            let watcher = Task { [weak self, host] in
                guard let self else { return }
                let hostStream = await self.hostEvents()
                let subStream = await self.events()
                await withTaskGroup(of: Void.self) { group in
                    group.addTask {
                        for await event in hostStream {
                            switch event {
                            case .stateChanged(let id, _, _),
                                 .connected(let id, _),
                                 .reconnectResult(let id, _),
                                 .added(let id):
                                guard id == host else { continue }
                                if let snap = await self.host(host) {
                                    cont.yield(snap)
                                }
                            case .removed(let id):
                                if id == host {
                                    // Exit this child task; the outer
                                    // `cont.finish()` below handles the
                                    // terminal yield so we don't
                                    // double-finish.
                                    return
                                }
                            }
                        }
                    }
                    group.addTask {
                        for await event in subStream {
                            guard event.hostId == host else { continue }
                            if let snap = await self.host(host) {
                                cont.yield(snap)
                            }
                        }
                    }
                    await group.next()
                    group.cancelAll()
                }
                cont.finish()
            }
            cont.onTermination = { _ in
                watcher.cancel()
            }
        }
    }

    /// Observable stream of cached session summaries for `host`.
    ///
    /// Yields the current cached summaries **immediately** on
    /// subscription (sorted by `modifiedAt` descending), then yields a
    /// fresh sorted list whenever the cache changes — `listSessions`
    /// refresh on connect, or `notify/sessionAdded` /
    /// `notify/sessionRemoved` / `notify/sessionSummaryChanged` from the
    /// server.
    ///
    /// The stream uses `.bufferingNewest(1)` since only the latest
    /// summary list is useful to a UI consumer; slow consumers will
    /// drop intermediate lists and resume with the most recent.
    /// "Immediately" here matches the semantics described on
    /// `hostSnapshots(host:)` — the initial value is dispatched via a
    /// short-lived `Task`, so the first `await iter.next()` resolves
    /// to the cache captured at subscription time.
    ///
    /// Returns `nil` if no host with `host` is registered.
    public func sessionSummaries(host: HostId) async -> AsyncStream<[SessionSummary]>? {
        guard let runtime = hosts[host] else { return nil }
        return AsyncStream<[SessionSummary]>(bufferingPolicy: .bufferingNewest(1)) { cont in
            Task { [runtime] in
                cont.yield(await runtime.snapshot().sessionSummaries)
            }

            let watcher = Task { [weak self, host] in
                guard let self else { return }
                let hostStream = await self.hostEvents()
                let subStream = await self.events()
                await withTaskGroup(of: Void.self) { group in
                    group.addTask {
                        for await event in hostStream {
                            switch event {
                            case .connected(let id, _):
                                guard id == host else { continue }
                                if let snap = await self.host(host) {
                                    cont.yield(snap.sessionSummaries)
                                }
                            case .removed(let id):
                                if id == host {
                                    // See `hostSnapshots`: exit and let
                                    // the outer `cont.finish()` run
                                    // exactly once.
                                    return
                                }
                            case .added, .stateChanged, .reconnectResult:
                                // Session summaries are refreshed via
                                // `listSessions` during `.connected` and
                                // by the per-summary notifications below;
                                // these events don't independently move
                                // the summary cache.
                                continue
                            }
                        }
                    }
                    group.addTask {
                        for await event in subStream {
                            guard event.hostId == host else { continue }
                            // Re-yield only on session-summary-shaped
                            // notifications; ignore action envelopes and
                            // unrelated notifications.
                            switch event.event {
                            case .sessionAdded, .sessionRemoved, .sessionSummaryChanged:
                                if let snap = await self.host(host) {
                                    cont.yield(snap.sessionSummaries)
                                }
                            case .action, .authRequired:
                                continue
                            }
                        }
                    }
                    await group.next()
                    group.cancelAll()
                }
                cont.finish()
            }
            cont.onTermination = { _ in
                watcher.cancel()
            }
        }
    }

    private func broadcastSubscriptionEvent(_ event: HostSubscriptionEvent) {
        for cont in subscriptionListeners.values {
            cont.yield(event)
        }
        // Per-channel fan-out. Every event carries a channel (action
        // envelopes plus session/auth notifications all surface as
        // `event.resource`), so listeners only receive events for the
        // channel they subscribed to. The `resource == nil` fallback is
        // retained for forward compatibility with any future event
        // variant that intentionally targets every listener.
        guard let bucket = perResourceListeners[event.hostId] else { return }
        for listener in bucket.values {
            if let resource = event.resource {
                if listener.uri == resource {
                    listener.continuation.yield(event.event)
                }
            } else {
                listener.continuation.yield(event.event)
            }
        }
    }

    private func broadcastHostEvent(_ event: HostEvent) {
        for cont in hostEventListeners.values {
            cont.yield(event)
        }
    }

    private func removeSubscriptionListener(id: UInt64) {
        subscriptionListeners.removeValue(forKey: id)
    }

    private func removeHostEventListener(id: UInt64) {
        hostEventListeners.removeValue(forKey: id)
    }

    private func removePerResourceListener(host: HostId, id: UInt64) {
        guard var bucket = perResourceListeners[host] else { return }
        bucket.removeValue(forKey: id)
        if bucket.isEmpty {
            perResourceListeners.removeValue(forKey: host)
        } else {
            perResourceListeners[host] = bucket
        }
    }

    /// Finish every per-URI listener registered for `host` and remove the
    /// bucket. Called on `remove(_:)` and `shutdown()` so consumers
    /// observing the stream exit their `for await` loop cleanly.
    private func finishPerResourceListeners(for host: HostId) {
        guard let bucket = perResourceListeners.removeValue(forKey: host) else { return }
        for listener in bucket.values {
            listener.continuation.finish()
        }
    }

    private func bumpListenerId() -> UInt64 {
        let id = nextListenerId
        nextListenerId &+= 1
        return id
    }

    // MARK: - Aggregated views

    /// Aggregated session summaries across every registered host, sorted by
    /// `summary.modifiedAt` descending. Includes both the host id and label
    /// so consumers can render a unified inbox without losing host
    /// attribution.
    ///
    /// **Tie-breaking:** for equal `modifiedAt`, summaries are ordered by
    /// host registration order, then by `summary.resource`, so the result
    /// is deterministic across calls.
    public func aggregatedSessions() async -> [HostedSessionSummary] {
        let order = hostOrder
        let orderIndex = Dictionary(uniqueKeysWithValues: order.enumerated().map { ($1, $0) })
        var out: [HostedSessionSummary] = []
        for id in order {
            guard let runtime = hosts[id] else { continue }
            let snap = await runtime.snapshot()
            for summary in snap.sessionSummaries {
                out.append(HostedSessionSummary(
                    hostId: snap.id,
                    hostLabel: snap.label,
                    summary: summary
                ))
            }
        }
        return out.sorted { lhs, rhs in
            if lhs.summary.modifiedAt != rhs.summary.modifiedAt {
                return lhs.summary.modifiedAt > rhs.summary.modifiedAt
            }
            let li = orderIndex[lhs.hostId] ?? Int.max
            let ri = orderIndex[rhs.hostId] ?? Int.max
            if li != ri { return li < ri }
            return lhs.summary.resource < rhs.summary.resource
        }
    }

    /// Aggregated agents across every registered host, in registration order
    /// per host.
    public func aggregatedAgents() async -> [HostedAgent] {
        var out: [HostedAgent] = []
        for id in hostOrder {
            guard let runtime = hosts[id] else { continue }
            let snap = await runtime.snapshot()
            for agent in snap.agents {
                out.append(HostedAgent(
                    hostId: snap.id,
                    hostLabel: snap.label,
                    agent: agent
                ))
            }
        }
        return out
    }

    // MARK: - Shutdown

    /// Tear down every registered host's supervisor and finish all event
    /// streams. Safe to call multiple times.
    public func shutdown() async {
        if didShutDown { return }
        didShutDown = true
        let runtimes = hosts.values.map { $0 }
        hosts.removeAll()
        hostOrder.removeAll()
        for runtime in runtimes {
            await runtime.shutdown()
        }
        for cont in subscriptionListeners.values { cont.finish() }
        subscriptionListeners.removeAll()
        for cont in hostEventListeners.values { cont.finish() }
        hostEventListeners.removeAll()
        for bucket in perResourceListeners.values {
            for listener in bucket.values { listener.continuation.finish() }
        }
        perResourceListeners.removeAll()
    }
}

/// One per-`(host, uri)` listener registered via
/// `MultiHostClient.events(host:uri:)`. Held inside the actor's
/// `perResourceListeners` registry.
private struct PerResourceListener {
    let uri: String
    let continuation: AsyncStream<SubscriptionEvent>.Continuation
}
