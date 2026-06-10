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

    private let S = "ahp-session:/test-session"
    private let C = "ahp-chat:/test-session/default"
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
            chats: []
        )
    }

    private func makeChatStateWithActiveTurn() -> ChatState {
        ChatState(
            resource: C,
            title: "Test Chat",
            status: .inProgress,
            modifiedAt: "1970-01-01T00:00:02.000Z",
            turns: [],
            activeTurn: ActiveTurn(
                id: T,
                message: Message(text: "Hello", origin: AnyCodable(["kind": "user"])),
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

    func testChatReducerDoesNotMutateTurnsArray() {
        let turn1 = Turn(id: "t1", message: Message(text: "First", origin: AnyCodable(["kind": "user"])), responseParts: [], state: .complete)
        let turn2 = Turn(id: "t2", message: Message(text: "Second", origin: AnyCodable(["kind": "user"])), responseParts: [], state: .complete)
        let turn3 = Turn(id: "t3", message: Message(text: "Third", origin: AnyCodable(["kind": "user"])), responseParts: [], state: .complete)
        let state = ChatState(
            resource: C,
            title: "T",
            status: .idle,
            modifiedAt: "1970-01-01T00:00:01.000Z",
            turns: [turn1, turn2, turn3]
        )
        let original = state.turns
        _ = chatReducer(
            state: state,
            action: .chatTruncated(ChatTruncatedAction(type: .chatTruncated, turnId: "t1"))
        )
        XCTAssertEqual(state.turns.count, original.count)
    }

    // MARK: - Dispatch Validation

    func testClientDispatchableReturnsTrue() {
        let action: StateAction = .chatTurnStarted(ChatTurnStartedAction(
            type: .chatTurnStarted, turnId: T, message: Message(text: "Hello", origin: AnyCodable(["kind": "user"]))
        ))
        XCTAssertTrue(isClientDispatchable(action))
    }

    func testClientDispatchableReturnsFalse() {
        let action: StateAction = .sessionReady(SessionReadyAction(type: .sessionReady))
        XCTAssertFalse(isClientDispatchable(action))
    }

    // MARK: - Timestamp Behavior

    func testChatTurnStartedUpdatesModifiedAt() {
        let state = ChatState(
            resource: C,
            title: "Test Chat",
            status: .idle,
            modifiedAt: "1970-01-01T00:00:01.000Z",
            turns: []
        )
        let next = chatReducer(
            state: state,
            action: .chatTurnStarted(ChatTurnStartedAction(
                type: .chatTurnStarted, turnId: T, message: Message(text: "Hello", origin: AnyCodable(["kind": "user"]))
            ))
        )
        XCTAssertGreaterThan(next.modifiedAt, state.modifiedAt)
    }

    func testTitleChangedUpdatesModifiedAt() {
        let state = makeSessionState(lifecycle: .ready)
        let next = sessionReducer(
            state: state,
            action: .sessionTitleChanged(SessionTitleChangedAction(
                type: .sessionTitleChanged, title: "New Title"
            ))
        )
        XCTAssertGreaterThan(next.summary.modifiedAt, state.summary.modifiedAt)
    }
}
