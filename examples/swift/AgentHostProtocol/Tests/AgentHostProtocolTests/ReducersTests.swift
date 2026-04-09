// ReducersTests.swift — Swift-specific reducer tests.
//
// Fixture-driven tests (covering all reducer logic) are in FixtureDrivenReducerTests.swift.
// This file only contains tests that CANNOT be expressed as JSON fixtures:
//   - Immutability checks (require identity/reference checks)
//   - isClientDispatchable (not part of reducer output)
//   - Timestamp behavior (fixtures mock to fixed value)

import XCTest
@testable import AgentHostProtocol

final class ReducersTests: XCTestCase {

    // MARK: - Constants

    private let S = "copilot:/test-session"
    private let T = "turn-1"

    // MARK: - Fixtures

    private func makeRootState(agents: [AgentInfo] = []) -> RootState {
        RootState(agents: agents)
    }

    private func makeSessionState(
        lifecycle: SessionLifecycle = .creating,
        status: SessionStatus = .idle
    ) -> SessionState {
        SessionState(
            summary: SessionSummary(
                resource: S,
                provider: "copilot",
                title: "Test Session",
                status: status,
                createdAt: 1000,
                modifiedAt: 1000
            ),
            lifecycle: lifecycle,
            turns: []
        )
    }

    private func makeSessionStateWithActiveTurn() -> SessionState {
        SessionState(
            summary: SessionSummary(
                resource: S,
                provider: "copilot",
                title: "Test Session",
                status: .inProgress,
                createdAt: 1000,
                modifiedAt: 2000
            ),
            lifecycle: .ready,
            turns: [],
            activeTurn: ActiveTurn(
                id: T,
                userMessage: UserMessage(text: "Hello"),
                responseParts: [],
                usage: nil
            )
        )
    }

    // MARK: - Immutability Checks

    func testRootReducerDoesNotMutateOriginalState() {
        let state = makeRootState(agents: [])
        let agents = [AgentInfo(provider: "x", displayName: "X", description: "x", models: [])]
        _ = rootReducer(
            state: state,
            action: .rootAgentsChanged(RootAgentsChangedAction(type: .rootAgentsChanged, agents: agents))
        )
        XCTAssertEqual(state.agents.count, 0)
    }

    func testSessionReducerDoesNotMutateTurnsArray() {
        let turn1 = Turn(id: "t1", userMessage: UserMessage(text: "First"), responseParts: [], state: .complete)
        let turn2 = Turn(id: "t2", userMessage: UserMessage(text: "Second"), responseParts: [], state: .complete)
        let turn3 = Turn(id: "t3", userMessage: UserMessage(text: "Third"), responseParts: [], state: .complete)
        let state = SessionState(
            summary: SessionSummary(
                resource: S,
                provider: "copilot",
                title: "T",
                status: .idle,
                createdAt: 1000,
                modifiedAt: 1000
            ),
            lifecycle: .ready,
            turns: [turn1, turn2, turn3]
        )
        let original = state.turns
        _ = sessionReducer(
            state: state,
            action: .sessionTruncated(SessionTruncatedAction(type: .sessionTruncated, session: S, turnId: "t1"))
        )
        XCTAssertEqual(state.turns.count, original.count)
    }

    // MARK: - Dispatch Validation

    func testClientDispatchableReturnsTrue() {
        let action: StateAction = .sessionTurnStarted(SessionTurnStartedAction(
            type: .sessionTurnStarted, session: S, turnId: T, userMessage: UserMessage(text: "Hello")
        ))
        XCTAssertTrue(isClientDispatchable(action))
    }

    func testClientDispatchableReturnsFalse() {
        let action: StateAction = .sessionReady(SessionReadyAction(type: .sessionReady, session: S))
        XCTAssertFalse(isClientDispatchable(action))
    }

    // MARK: - Timestamp Behavior

    func testTurnStartedUpdatesModifiedAt() {
        let state = makeSessionState(lifecycle: .ready)
        let next = sessionReducer(
            state: state,
            action: .sessionTurnStarted(SessionTurnStartedAction(
                type: .sessionTurnStarted, session: S, turnId: T, userMessage: UserMessage(text: "Hello")
            ))
        )
        XCTAssertGreaterThan(next.summary.modifiedAt, state.summary.modifiedAt)
    }

    func testTitleChangedUpdatesModifiedAt() {
        let state = makeSessionState(lifecycle: .ready)
        let next = sessionReducer(
            state: state,
            action: .sessionTitleChanged(SessionTitleChangedAction(
                type: .sessionTitleChanged, session: S, title: "New Title"
            ))
        )
        XCTAssertGreaterThan(next.summary.modifiedAt, state.summary.modifiedAt)
    }
}
