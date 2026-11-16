// AHPClientEvents — event and state types fanned out by `AHPClient`.

import Foundation
import AgentHostProtocol

/// One event delivered by a per-channel subscription.
///
/// `action` envelopes carry the write-ahead mutation stream for a stateful
/// channel; the remaining cases carry decoding failures or protocol-level
/// signals the server broadcasts. Every case carries a `channel: String`
/// directly or on its associated params, used to route it to subscriptions.
public enum SubscriptionEvent: Sendable {
    case action(ActionEnvelope)

    /// An envelope header decoded, but its action payload did not.
    ///
    /// `lastSeenServerSeq` advances past this envelope so reconnect does not
    /// replay the same undecodable payload forever. Consumers should resubscribe
    /// for a fresh snapshot and can settle pending actions using `origin`.
    /// The original decoding error is preserved in `error`.
    case actionDecodingFailed(
        channel: String,
        serverSeq: Int,
        origin: ActionOrigin?,
        rejectionReason: String?,
        error: Error
    )
    case sessionAdded(SessionAddedParams)
    case sessionRemoved(SessionRemovedParams)
    case sessionSummaryChanged(SessionSummaryChangedParams)
    case authRequired(AuthRequiredParams)
}

/// One event delivered by `AHPClient.events` — the top-level multicast tap.
///
/// `resource` carries the channel URI for channel-scoped events, including
/// action decoding failures, and is nil for cross-resource notifications.
/// Mirrors the shape planned for the Rust `Client::events()` method.
public struct ClientEvent: Sendable {
    public let resource: String?
    public let event: SubscriptionEvent

    public init(resource: String?, event: SubscriptionEvent) {
        self.resource = resource
        self.event = event
    }
}

/// Connection state observable on `AHPClient.connectionState` and the
/// `stateChanges` stream.
public enum ConnectionState: Sendable, Equatable {
    /// No active receive loop; the transport may or may not be open.
    case disconnected
    /// `connect()` is in progress.
    case connecting
    /// Receive loop is running; the transport is treated as live.
    case connected
}

/// Handle returned from `AHPClient.dispatch`.
///
/// Dispatch is fire-and-forget by design; the handle records the
/// client-assigned `clientSeq` so callers can correlate optimistic local
/// updates with server echoes (`ActionEnvelope.origin.clientSeq`).
public struct DispatchHandle: Sendable, Equatable {
    public let clientSeq: Int

    public init(clientSeq: Int) {
        self.clientSeq = clientSeq
    }
}
