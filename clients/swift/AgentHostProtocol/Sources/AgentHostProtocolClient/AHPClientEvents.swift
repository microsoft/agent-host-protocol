// AHPClientEvents — event and state types fanned out by `AHPClient`.

import Foundation
import AgentHostProtocol

/// One event delivered by a per-channel subscription.
///
/// `action` envelopes carry the write-ahead mutation stream for a stateful
/// channel; the remaining cases carry protocol-level signals the server
/// broadcasts. Every case carries a `channel: String` on its associated
/// params, which is how the client routes them to subscriptions.
public enum SubscriptionEvent: Sendable {
    case action(ActionEnvelope)
    case sessionAdded(SessionAddedParams)
    case sessionRemoved(SessionRemovedParams)
    case sessionSummaryChanged(SessionSummaryChangedParams)
    case authRequired(AuthRequiredParams)
}

/// One event delivered by `AHPClient.events` — the top-level multicast tap.
///
/// `resource` is non-nil for action envelopes (carrying the URI the action is
/// scoped to) and nil for cross-resource protocol notifications. Mirrors the
/// shape planned for the Rust `Client::events()` method.
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
