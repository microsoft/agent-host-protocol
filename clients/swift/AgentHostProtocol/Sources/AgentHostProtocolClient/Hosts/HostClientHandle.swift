// HostClientHandle — generation-checked escape hatch onto the underlying
// `AHPClient` for a host.

import Foundation
import AgentHostProtocol

/// Generation-checked handle to the underlying single-host `AHPClient`.
///
/// Issued by `MultiHostClient.client(for:)`. Methods on this handle verify
/// that the host is still on the same `generation` it was when the handle
/// was minted; if a reconnect has occurred, dispatching returns
/// `HostError.hostReconnected` instead of silently writing to the new
/// connection.
///
/// TCP streams opened through this handle survive replay reconnects even when
/// this handle becomes stale. Removing the host or shutting it down ends them.
///
/// **Race note:** generation is checked once at the start of each call, so
/// it is possible (but rare) for a reconnect to land between
/// `checkAlive()` and the actual `dispatch`/`request`. In that race the
/// dispatch goes against the stale (now-shutdown) `AHPClient` and surfaces
/// as `AHPClientError.shutdown` wrapped in `HostError.client`. Acquire a
/// fresh handle when this happens. The Rust SDK has the same semantics.
public struct HostClientHandle: Sendable {
    /// Host this handle was issued for.
    public let hostId: HostId
    /// Generation this handle was minted at.
    public let generation: UInt64

    /// The `AHPClient` instance that was current when the handle was minted.
    /// May have been shut down by a subsequent reconnect.
    private let client: AHPClient
    private let shared: HostShared

    internal init(hostId: HostId, generation: UInt64, client: AHPClient, shared: HostShared) {
        self.hostId = hostId
        self.generation = generation
        self.client = client
        self.shared = shared
    }

    /// Validate this handle against the host's current generation. Throws
    /// `HostError.hostReconnected` if a reconnect has happened.
    public func checkAlive() async throws {
        let current = await shared.generation()
        if current != generation {
            throw HostError.hostReconnected(
                host: hostId,
                handleGeneration: generation,
                currentGeneration: current
            )
        }

    }

    /// Opens a TCP stream retained and replayed by this host's supervisor.
    public func openTcpConnection(session: String, create: TcpConnectionSubscription) async throws -> TcpConnection {
        try await checkAlive()
        return try await shared.openTcpConnection(generation: generation, session: session, create: create)
    }

    /// Dispatch an action through this connection on `channel`, refusing if
    /// the connection has been replaced by a reconnect.
    @discardableResult
    public func dispatch(_ action: StateAction, channel: String) async throws -> DispatchHandle {
        try await checkAlive()
        do {
            return try await client.dispatch(action, channel: channel)
        } catch let error as AHPClientError {
            throw HostError.client(error)
        }
    }

    /// Dispatch an action on `channel` with a caller-owned `clientSeq`,
    /// refusing if the connection has been replaced by a reconnect.
    @discardableResult
    public func dispatch(_ action: StateAction, channel: String, clientSeq: Int) async throws -> DispatchHandle {
        try await checkAlive()
        do {
            return try await client.dispatch(action, channel: channel, clientSeq: clientSeq)
        } catch let error as AHPClientError {
            throw HostError.client(error)
        }
    }

    /// Issue an arbitrary JSON-RPC request through this connection, refusing
    /// if the connection has been replaced by a reconnect.
    ///
    /// **Cancellation:** observes `Task.isCancelled` through the underlying
    /// `AHPClient.request`. Cancelling the surrounding `Task` throws
    /// `CancellationError()` and removes the local pending entry. Useful
    /// for typeahead / debounced flows.
    ///
    /// **Swift 6 actor isolation gotcha:** if your project sets
    /// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, any `Codable`
    /// `params` / result type defined inside the actor-isolated module
    /// will inherit `@MainActor` on its synthesised conformances, which
    /// then fails the `Sendable` constraint on this method. Two fixes:
    /// (a) declare the parameter/result types in a file that opts out
    /// of the default isolation (e.g. `nonisolated`), or
    /// (b) call `requestRaw(method:paramsData:)` and serialise/decode
    /// JSON yourself.
    public func request<P: Encodable & Sendable, R: Decodable & Sendable>(
        method: String,
        params: P
    ) async throws -> R {
        try await checkAlive()
        do {
            return try await client.request(method: method, params: params)
        } catch let error as AHPClientError {
            throw HostError.client(error)
        }
    }

    /// Raw-bytes escape hatch around `AHPClient.requestRaw`. Sends
    /// `paramsData` as the JSON-RPC `params` value and returns the
    /// raw `result` bytes. Refuses if the connection has been replaced
    /// by a reconnect. Observes `Task.isCancelled` in the same way
    /// `request(_:params:)` does.
    public func requestRaw(method: String, paramsData: Data) async throws -> Data {
        try await checkAlive()
        do {
            return try await client.requestRaw(method: method, paramsData: paramsData)
        } catch let error as AHPClientError {
            throw HostError.client(error)
        }
    }

    /// Borrow the underlying `AHPClient` for advanced use. The caller is
    /// responsible for not holding it past the next reconnect — the returned
    /// reference becomes a stale handle once the host reconnects.
    public func rawClient() async -> AHPClient {
        client
    }
}
