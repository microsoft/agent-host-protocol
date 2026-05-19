// AHPStateMirror — thin reducer façade for an in-memory state copy.
//
// Wraps the existing pure reducers (`rootReducer`, `sessionReducer`) so a
// consumer can keep an in-memory mirror by just routing every inbound
// `ActionEnvelope` (and any seed `Snapshot`) through `apply` /
// `applySnapshot`. Multi-host runtimes can compose a mirror per host.

import Foundation
import AgentHostProtocol

/// In-memory mirror of root/session/terminal state, fed by `ActionEnvelope`
/// and `Snapshot` values from `AHPClient`.
public actor AHPStateMirror {
    public private(set) var rootState: RootState = RootState(agents: [])
    public private(set) var sessions: [String: SessionState] = [:]
    public private(set) var terminals: [String: TerminalState] = [:]
    public private(set) var changesets: [String: ChangesetState] = [:]

    public init() {}

    /// Apply a single action envelope, routing by `envelope.channel`.
    ///
    /// - Root state lives at `RootResourceURI`; all other channels are
    ///   identified by the URI the server announces. If we have no state for
    ///   the channel yet, the reducer can't initialise one — only
    ///   `applySnapshot` can do that, so the action is dropped.
    public func apply(_ envelope: ActionEnvelope) {
        let channel = envelope.channel
        let action = envelope.action
        if channel == RootResourceURI {
            rootState = rootReducer(state: rootState, action: action)
            return
        }
        if var session = sessions[channel] {
            session = sessionReducer(state: session, action: action)
            sessions[channel] = session
            return
        }
        if terminals[channel] != nil {
            // Terminals don't have a hand-written reducer in the Swift
            // package today; just leave the slot as the latest snapshot.
            // (Native reducer + state shape will be wired up when
            // terminal lifecycle reducers ship.)
            return
        }
        if changesets[channel] != nil {
            // Changesets are also seeded by `applySnapshot` and currently
            // mutated only when fresh snapshots arrive.
            return
        }
    }

    /// Seed the mirror from a `Snapshot` — root, session, or terminal as
    /// the snapshot's `state` discriminator dictates.
    public func applySnapshot(_ snapshot: Snapshot) {
        switch snapshot.state {
        case .root(let state):
            rootState = state
        case .session(let state):
            sessions[snapshot.resource] = state
        case .terminal(let state):
            terminals[snapshot.resource] = state
        case .changeset(let state):
            changesets[snapshot.resource] = state
        }
    }

    /// Reset the mirror to its initial empty state.
    public func reset() {
        rootState = RootState(agents: [])
        sessions.removeAll()
        terminals.removeAll()
        changesets.removeAll()
    }
}
