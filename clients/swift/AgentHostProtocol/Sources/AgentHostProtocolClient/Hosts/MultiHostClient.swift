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
    public func remove(_ id: HostId) async throws {
        guard let runtime = hosts.removeValue(forKey: id) else {
            throw HostError.unknownHost(id)
        }
        hostOrder.removeAll { $0 == id }
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

    private func broadcastSubscriptionEvent(_ event: HostSubscriptionEvent) {
        for cont in subscriptionListeners.values {
            cont.yield(event)
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
    }
}
