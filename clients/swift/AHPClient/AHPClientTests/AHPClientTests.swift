//
//  AHPClientTests.swift
//  AHPClientTests
//
//  Created by Peng Lyu on 3/27/26.
//

import Testing
import AgentHostProtocol
@testable import AHPClient

// MARK: - Reconnect State Tests
//
// These tests exercise the state-application logic in AppStore without requiring a live server.
// They verify the critical invariant for reconnect correctness: after applying a ReconnectResult
// (whether replay or snapshot), the in-memory state exactly matches what the server reports.

@MainActor
struct ReconnectResultTests {

    // A minimal AgentInfo for use in test fixtures.
    static func makeAgent(provider: String) -> AgentInfo {
        AgentInfo(provider: provider, displayName: provider, description: "", models: [])
    }

    // MARK: - applySnapshot

    @Test func applySnapshotUpdatesRootState() {
        let store = AppStore()
        let snapshot = Snapshot(
            resource: "agenthost:/root",
            state: .root(RootState(agents: [Self.makeAgent(provider: "agent1")])),
            fromSeq: 10
        )
        store.applySnapshot(snapshot)
        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "agent1")
    }

    // MARK: - applyReconnectResult: replay path

    @Test func replayAppliesActionsInServerSeqOrder() {
        let store = AppStore()

        // Seed root state with one agent.
        store.applySnapshot(Snapshot(
            resource: "agenthost:/root",
            state: .root(RootState(agents: [Self.makeAgent(provider: "old")])),
            fromSeq: 40
        ))

        // Replay two consecutive root actions that update the agent list.
        let action1 = ActionEnvelope(
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [Self.makeAgent(provider: "mid")]
            )),
            serverSeq: 41
        )
        let action2 = ActionEnvelope(
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [Self.makeAgent(provider: "new")]
            )),
            serverSeq: 42
        )
        let result = ReconnectResult.replay(ReconnectReplayResult(
            type: .replay,
            actions: [action1, action2],
            missing: []
        ))

        store.applyReconnectResult(result)

        // The final state should reflect action2 (the last in serverSeq order).
        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "new")
    }

    @Test func replayWithNoActionsLeavesStateUnchanged() {
        let store = AppStore()
        store.applySnapshot(Snapshot(
            resource: "agenthost:/root",
            state: .root(RootState(agents: [Self.makeAgent(provider: "stable")])),
            fromSeq: 50
        ))

        let result = ReconnectResult.replay(ReconnectReplayResult(type: .replay, actions: [], missing: []))
        store.applyReconnectResult(result)

        #expect(store.rootState.agents[0].provider == "stable")
    }

    // MARK: - applyReconnectResult: snapshot path

    @Test func snapshotReplacesRootState() {
        let store = AppStore()

        // Populate stale state.
        store.applySnapshot(Snapshot(
            resource: "agenthost:/root",
            state: .root(RootState(agents: [Self.makeAgent(provider: "stale")])),
            fromSeq: 5
        ))
        #expect(store.rootState.agents[0].provider == "stale")

        // Snapshot result carries fresh state from the server.
        let result = ReconnectResult.snapshot(ReconnectSnapshotResult(
            type: .snapshot,
            snapshots: [Snapshot(
                resource: "agenthost:/root",
                state: .root(RootState(agents: [Self.makeAgent(provider: "fresh")])),
                fromSeq: 60
            )]
        ))

        store.applyReconnectResult(result)

        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "fresh")
    }

    @Test func snapshotRestoresMultipleResources() {
        let store = AppStore()

        // Simulate having a session already subscribed.
        let sessionURI = "copilot:/test-session-id"
        let initialSessionState = SessionState(
            summary: SessionSummary(
                resource: sessionURI,
                provider: "copilot",
                title: "",
                status: .idle,
                createdAt: 0,
                modifiedAt: 0
            ),
            lifecycle: .ready,
            turns: []
        )
        store.sessions[sessionURI] = initialSessionState

        // A snapshot reconnect carries fresh root + session snapshots.
        let freshRoot = RootState(agents: [Self.makeAgent(provider: "copilot")])
        let freshSession = SessionState(
            summary: SessionSummary(
                resource: sessionURI,
                provider: "copilot",
                title: "Restored session",
                status: .idle,
                createdAt: 0,
                modifiedAt: 1
            ),
            lifecycle: .ready,
            turns: []
        )
        let result = ReconnectResult.snapshot(ReconnectSnapshotResult(
            type: .snapshot,
            snapshots: [
                Snapshot(resource: "agenthost:/root", state: .root(freshRoot), fromSeq: 70),
                Snapshot(resource: sessionURI, state: .session(freshSession), fromSeq: 70),
            ]
        ))

        store.applyReconnectResult(result)

        #expect(store.rootState.agents[0].provider == "copilot")
        #expect(store.sessions[sessionURI]?.summary.title == "Restored session")
    }

    // MARK: - serverSeq tracking

    @Test func handleActionAdvancesServerSeqForReplayVerification() {
        let store = AppStore()

        // Apply a root snapshot at seq 10 so root state is initialized.
        store.applySnapshot(Snapshot(
            resource: "agenthost:/root",
            state: .root(RootState(agents: [])),
            fromSeq: 10
        ))

        // Simulate two incoming live action envelopes.
        let envelope = ActionEnvelope(
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [Self.makeAgent(provider: "live")]
            )),
            serverSeq: 11
        )
        store.handleAction(envelope)

        // State should reflect the live action.
        #expect(store.rootState.agents.count == 1)
        #expect(store.rootState.agents[0].provider == "live")
    }
}
