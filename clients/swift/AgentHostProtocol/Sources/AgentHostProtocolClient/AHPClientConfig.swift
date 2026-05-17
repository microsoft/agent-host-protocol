// AHPClientConfig — knobs for an `AHPClient` instance.

import Foundation

/// Optional transport liveness policy for `AHPClient`.
///
/// Keepalive is disabled by default. When enabled, the client sends periodic
/// transport-level pings if the configured transport conforms to
/// `AHPKeepAliveTransport`; ping failures are treated as transport failures.
public enum AHPKeepAlivePolicy: Sendable, Equatable {
    /// Do not run a keepalive task.
    case disabled
    /// Periodically send a transport-level ping.
    case ping(interval: Duration, timeout: Duration)

    /// Convenience for the common WebSocket ping policy.
    public static func enabled(
        interval: Duration = .seconds(30),
        timeout: Duration = .seconds(5)
    ) -> AHPKeepAlivePolicy {
        .ping(interval: interval, timeout: timeout)
    }
}

/// Tunable settings for an `AHPClient` instance.
public struct AHPClientConfig: Sendable {
    /// Maximum time a `request` will wait for its response before failing
    /// with `AHPClientError.requestTimeout`. Defaults to 30 seconds.
    public var requestTimeout: Duration

    /// Buffer size for the multicast `events` and `stateChanges` streams.
    /// When a consumer falls behind by more than this many items, the oldest
    /// items are dropped (`.bufferingNewest`). Per-URI subscription streams
    /// are *unbounded* regardless of this value, since dropping action
    /// envelopes desyncs the consumer's reducer mirror.
    ///
    /// Values less than 1 are silently clamped to 1 by the initializer so
    /// the buffering policy always retains at least the most recent item.
    ///
    /// Defaults to 256.
    public var subscriptionBufferSize: Int

    /// Optional transport liveness policy. Defaults to `.disabled`.
    public var keepAlive: AHPKeepAlivePolicy

    public init(
        requestTimeout: Duration = .seconds(30),
        subscriptionBufferSize: Int = 256,
        keepAlive: AHPKeepAlivePolicy = .disabled
    ) {
        self.requestTimeout = requestTimeout
        // `.bufferingNewest(0)` means "buffer nothing" and `.bufferingNewest`
        // with a negative count is undefined; clamp to 1 so the public API
        // never lets the consumer reach those edges by accident.
        self.subscriptionBufferSize = max(1, subscriptionBufferSize)
        self.keepAlive = keepAlive
    }

    public static let `default` = AHPClientConfig()
}
