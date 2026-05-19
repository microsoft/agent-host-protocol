// HostConfig — configuration for a host registered with `MultiHostClient`.

import Foundation

/// Async factory that opens (or re-opens) a transport for a host.
///
/// The supervisor calls this on every connect attempt — including reconnects
/// — so consumers can refresh tokens, rotate URLs, or pick different backends
/// per attempt.
public typealias HostTransportFactory = @Sendable (HostId) async throws -> any AHPTransport

/// Configuration for a single host registered with `MultiHostClient`.
///
/// Use `HostConfig(id:label:transportFactory:)` for the common case and
/// the `with*` builders to override individual fields.
public struct HostConfig: Sendable {
    /// Stable host identifier. Doubles as the `ClientIdStore` persistence key.
    public var id: HostId
    /// Human-readable label. Surfaced through `HostHandle.label`.
    public var label: String
    /// Optional override for the `clientId` sent to this host. When `nil`, the
    /// multi-host client asks its `ClientIdStore` for a stable id keyed on
    /// `id`.
    public var clientId: String?
    /// URIs to include in the `initialize` handshake. Defaults to
    /// `[RootResourceURI]` so root state is always tracked.
    public var initialSubscriptions: [String]
    /// Configuration forwarded to the underlying `AHPClient`.
    public var clientConfig: AHPClientConfig
    /// Factory used to (re-)open a transport for this host.
    public var transportFactory: HostTransportFactory
    /// Reconnect behaviour after an unexpected drop.
    public var reconnectPolicy: ReconnectPolicy
    /// Whether the supervisor should seed `sessionSummaries` with `listSessions`
    /// after each successful connect. Defaults to `true` for multi-host views.
    public var refreshSessionSummariesOnConnect: Bool
    /// Whether replayed actions from a reconnect response should be fanned out
    /// through `events()`. Defaults to `true`; facade layers that return the
    /// raw `ReconnectResult` to another store can disable it to avoid applying
    /// the same replay twice.
    public var fanOutReconnectReplayActions: Bool

    public init(
        id: HostId,
        label: String,
        transportFactory: @escaping HostTransportFactory
    ) {
        self.id = id
        self.label = label
        self.clientId = nil
        self.initialSubscriptions = [RootResourceURI]
        self.clientConfig = .default
        self.transportFactory = transportFactory
        self.reconnectPolicy = .exponential
        self.refreshSessionSummariesOnConnect = true
        self.fanOutReconnectReplayActions = true
    }

    /// Override the explicit `clientId` for this host (skips the
    /// `ClientIdStore` lookup).
    public func withClientId(_ clientId: String) -> Self {
        var copy = self
        copy.clientId = clientId
        return copy
    }

    /// Replace the default `initialSubscriptions` set.
    public func withInitialSubscriptions(_ uris: [String]) -> Self {
        var copy = self
        copy.initialSubscriptions = uris
        return copy
    }

    /// Override the per-host `AHPClientConfig`.
    public func withClientConfig(_ config: AHPClientConfig) -> Self {
        var copy = self
        copy.clientConfig = config
        return copy
    }

    /// Override the reconnect policy.
    public func withReconnectPolicy(_ policy: ReconnectPolicy) -> Self {
        var copy = self
        copy.reconnectPolicy = policy
        return copy
    }

    /// Control whether the supervisor runs `listSessions` after successful
    /// connect/reconnect handshakes.
    public func withSessionSummaryRefreshOnConnect(_ enabled: Bool) -> Self {
        var copy = self
        copy.refreshSessionSummariesOnConnect = enabled
        return copy
    }

    /// Control whether replayed reconnect actions are emitted through
    /// `events()` after being applied to the host mirror.
    public func withReconnectReplayFanOut(_ enabled: Bool) -> Self {
        var copy = self
        copy.fanOutReconnectReplayActions = enabled
        return copy
    }
}
