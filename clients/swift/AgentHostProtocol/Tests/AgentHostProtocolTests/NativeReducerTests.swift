// NativeReducerTests.swift — Tests for the protocol-based native Swift reducer pattern.
//
// Reducer behavioral tests are in FixtureDrivenReducerTests.swift (JSON fixtures).
// This file only tests the protocol/wrapper pattern unique to the Swift implementation:
//   - Reducer protocol conformance
//   - Type erasure (AnyReducer)
//   - CombinedReducer composition
//   - applying() convenience (copy-on-write)
//   - inout mutation efficiency

import XCTest
@testable import AgentHostProtocol

final class NativeReducerTests: XCTestCase {

    // MARK: - Constants

    private let S = "copilot:/test-session"
    private let T = "turn-1"

    // MARK: - Reducers under test

    private let rootR = AHPRootReducer()
    private let sessionR = AHPSessionReducer()

    // MARK: - Fixtures

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

    // MARK: - Protocol Conformance Tests

    func testReducerProtocolConformance() {
        let _: any Reducer = AHPRootReducer()
        let _: any Reducer = AHPSessionReducer()
    }

    func testTypeErasure() {
        let erased = AnyReducer(AHPSessionReducer())
        var state = makeSessionState()
        erased.reduce(into: &state, action: .sessionReady(SessionReadyAction(type: .sessionReady, session: S)))
        XCTAssertEqual(state.lifecycle, .ready)
    }

    func testCombinedReducer() {
        let r1 = AnyReducer<SessionState, StateAction> { state, action in
            if case .sessionTitleChanged(let a) = action {
                state.summary.title = a.title
            }
        }
        let r2 = AnyReducer<SessionState, StateAction> { state, action in
            if case .sessionModelChanged(let a) = action {
                state.summary.model = a.model
            }
        }
        let combined = CombinedReducer([r1, r2])

        var state = makeSessionState()
        combined.reduce(into: &state, action: .sessionTitleChanged(SessionTitleChangedAction(
            type: .sessionTitleChanged, session: S, title: "Custom Title"
        )))
        XCTAssertEqual(state.summary.title, "Custom Title")

        combined.reduce(into: &state, action: .sessionModelChanged(SessionModelChangedAction(
            type: .sessionModelChanged, session: S, model: "gpt-4"
        )))
        XCTAssertEqual(state.summary.model, "gpt-4")
    }

    func testApplyingConvenience() {
        let state = makeSessionState()
        let next = sessionR.applying(
            action: .sessionReady(SessionReadyAction(type: .sessionReady, session: S)),
            to: state
        )
        XCTAssertEqual(state.lifecycle, .creating)
        XCTAssertEqual(next.lifecycle, .ready)
    }

    func testRootReducerDoesNotMutateOriginalViaApplying() {
        let state = RootState(agents: [])
        let agents = [AgentInfo(provider: "x", displayName: "X", description: "x", models: [])]
        _ = rootR.applying(
            action: .rootAgentsChanged(RootAgentsChangedAction(type: .rootAgentsChanged, agents: agents)),
            to: state
        )
        XCTAssertEqual(state.agents.count, 0)
    }

    func testInoutMutationEfficiency() {
        var state = makeSessionStateWithActiveTurn()

        sessionR.reduce(into: &state, action: .sessionResponsePart(SessionResponsePartAction(
            type: .sessionResponsePart, session: S, turnId: T,
            part: .markdown(MarkdownResponsePart(kind: .markdown, id: "md-1", content: ""))
        )))
        sessionR.reduce(into: &state, action: .sessionDelta(SessionDeltaAction(
            type: .sessionDelta, session: S, turnId: T, partId: "md-1", content: "Hello"
        )))
        sessionR.reduce(into: &state, action: .sessionDelta(SessionDeltaAction(
            type: .sessionDelta, session: S, turnId: T, partId: "md-1", content: " World"
        )))

        let text = state.activeTurn?.responseParts.compactMap { part in
            if case .markdown(let md) = part { return md.content }
            return nil
        }.joined() ?? ""
        XCTAssertEqual(text, "Hello World")
    }
}
