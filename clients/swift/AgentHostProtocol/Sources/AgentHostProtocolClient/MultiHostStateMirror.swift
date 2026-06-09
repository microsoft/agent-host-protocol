// MultiHostStateMirror — host-aware reducer façade for multi-host
// consumers.
//
// Wraps the existing pure reducers (`rootReducer`, `sessionReducer`) the
// same way `AHPStateMirror` does, but keys state by `(hostId, uri)` so
// channel URIs that collide across hosts (which is the normal case)
// don't clobber each other. Drop-in for any multi-host consumer; can
// be fed directly from `MultiHostClient.events(host:uri:)` or from a
// `HostSubscriptionEvent` stream.

import Foundation
import AgentHostProtocol

/// Compound key tagging a channel URI with the host that produced it.
///
/// Session and terminal URIs aren't globally unique across hosts —
/// `ahp-session:/s1` on Host A and `ahp-session:/s1` on Host B are
/// different resources. Use this struct as the key in any multi-host
/// state map.
public struct HostedResourceKey: Hashable, Sendable {
    public let hostId: HostId
    public let uri: String

    public init(hostId: HostId, uri: String) {
        self.hostId = hostId
        self.uri = uri
    }
}

/// In-memory mirror of root/session/terminal/changeset state, fed by
/// `ActionEnvelope` and `Snapshot` values tagged with their host of
/// origin.
///
/// Single-host consumers should keep using `AHPStateMirror`; this type
/// adds the host dimension necessary for multi-host UIs. Apply
/// `HostSubscriptionEvent`s directly via `apply(event:)`, or feed
/// individual envelopes/snapshots via `apply(host:envelope:)` /
/// `applySnapshot(host:snapshot:)`.
///
/// **Feed from the reliable per-channel stream.** Pump events into
/// this mirror from `MultiHostClient.events(host:uri:)` (which is
/// unbounded, delivers replayed envelopes, and survives reconnects) —
/// **not** from `MultiHostClient.events()` (which is lossy by design).
/// Dropping action envelopes desyncs the mirror irreversibly.
public actor MultiHostStateMirror {
    public private(set) var rootStates: [HostId: RootState] = [:]
    public private(set) var sessions: [HostedResourceKey: SessionState] = [:]
    public private(set) var terminals: [HostedResourceKey: TerminalState] = [:]
    public private(set) var changesets: [HostedResourceKey: ChangesetState] = [:]
    public private(set) var annotations: [HostedResourceKey: AnnotationsState] = [:]
    public private(set) var resourceWatches: [HostedResourceKey: ResourceWatchState] = [:]

    public init() {}

    /// Convenience: apply a `HostSubscriptionEvent` produced by
    /// `MultiHostClient.events()`. Action envelopes are routed through
    /// the reducer; non-action events are dropped (they don't affect
    /// reducer state).
    public func apply(event: HostSubscriptionEvent) {
        if case .action(let envelope) = event.event {
            apply(host: event.hostId, envelope: envelope)
        }
    }

    /// Apply a single action envelope, scoped to `host`. Routing uses
    /// `envelope.channel`: `RootResourceURI` is the root channel, every
    /// other channel is identified by the URI the server announces.
    public func apply(host: HostId, envelope: ActionEnvelope) {
        let channel = envelope.channel
        let action = envelope.action
        if channel == RootResourceURI {
            let current = rootStates[host, default: RootState(agents: [])]
            rootStates[host] = rootReducer(state: current, action: action)
            return
        }
        let key = HostedResourceKey(hostId: host, uri: channel)
        if var session = sessions[key] {
            session = sessionReducer(state: session, action: action)
            sessions[key] = session
            return
        }
        if terminals[key] != nil {
            // Terminals don't have a hand-written reducer in the Swift
            // package today; just leave the slot as the latest snapshot.
            return
        }
        if changesets[key] != nil {
            // Changesets are also seeded by `applySnapshot` and currently
            // mutated only when fresh snapshots arrive.
            return
        }
        if annotations[key] != nil {
            // Annotations are also seeded by `applySnapshot` and currently
            // mutated only when fresh snapshots arrive.
            return
        }
        if resourceWatches[key] != nil {
            // Resource watches are descriptor-only and never mutated by
            // actions — `resourceWatch/changed` is an event channel, not
            // a reducer input. The slot is seeded by `applySnapshot`.
            return
        }
        // No state for this `(host, channel)` yet — the reducer can't
        // initialise one; only `applySnapshot(host:snapshot:)` can.
    }

    /// Seed the mirror from a `Snapshot` scoped to `host` — root,
    /// session, terminal, changeset, resource-watch, or annotations as
    /// the snapshot's `state` discriminator dictates.
    public func applySnapshot(host: HostId, snapshot: Snapshot) {
        let key = HostedResourceKey(hostId: host, uri: snapshot.resource)
        switch snapshot.state {
        case .root(let state):
            rootStates[host] = state
        case .session(let state):
            sessions[key] = state
        case .terminal(let state):
            terminals[key] = state
        case .changeset(let state):
            changesets[key] = state
        case .resourceWatch(let state):
            resourceWatches[key] = state
        case .annotations(let state):
            annotations[key] = state
        }
    }

    /// Reset every slot for `host` — drops the root state, all sessions
    /// keyed under that host, all terminals keyed under that host, all
    /// changesets keyed under that host, all annotations keyed under
    /// that host, and all resource watches keyed under that host.
    public func reset(host: HostId) {
        rootStates.removeValue(forKey: host)
        sessions = sessions.filter { $0.key.hostId != host }
        terminals = terminals.filter { $0.key.hostId != host }
        changesets = changesets.filter { $0.key.hostId != host }
        annotations = annotations.filter { $0.key.hostId != host }
        resourceWatches = resourceWatches.filter { $0.key.hostId != host }
    }

    /// Reset every host's state.
    public func reset() {
        rootStates.removeAll()
        sessions.removeAll()
        terminals.removeAll()
        changesets.removeAll()
        annotations.removeAll()
        resourceWatches.removeAll()
    }
}
