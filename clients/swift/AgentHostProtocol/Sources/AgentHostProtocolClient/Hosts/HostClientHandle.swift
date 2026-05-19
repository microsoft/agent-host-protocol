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

    /// Borrow the underlying `AHPClient` for advanced use. The caller is
    /// responsible for not holding it past the next reconnect — the returned
    /// reference becomes a stale handle once the host reconnects.
    public func rawClient() async -> AHPClient {
        client
    }
}
