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

    private let S = "ahp-session:/test-session"
    private let C = "ahp-chat:/test-session/default"
    private let T = "turn-1"

    // MARK: - Reducers under test

    private let rootR = AHPRootReducer()
    private let sessionR = AHPSessionReducer()
    private let chatR = AHPChatReducer()

    // MARK: - Fixtures

    private func makeSessionState(
        lifecycle: SessionLifecycle = .creating,
        status: SessionStatus = .idle
    ) -> SessionState {
        SessionState(
            provider: "copilot",
            title: "Test Session",
            status: status,
            lifecycle: lifecycle,
            activeClients: [],
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
                startedAt: "2026-07-09T20:00:00.000Z",
                message: Message(text: "Hello", origin: MessageOrigin(kind: .user)),
                responseParts: [],
                usage: nil
            )
        )
    }

    // MARK: - Protocol Conformance Tests

    func testReducerProtocolConformance() {
        let _: any Reducer = AHPRootReducer()
        let _: any Reducer = AHPSessionReducer()
        let _: any Reducer = AHPChatReducer()
    }

    func testTypeErasure() {
        let erased = AnyReducer(AHPSessionReducer())
        var state = makeSessionState()
        erased.reduce(into: &state, action: .sessionReady(SessionReadyAction(type: .sessionReady)))
        XCTAssertEqual(state.lifecycle, .ready)
    }

    func testCombinedReducer() {
        let r1 = AnyReducer<SessionState, StateAction> { state, action in
            if case .sessionTitleChanged(let a) = action {
                state.title = a.title
            }
        }
        let r2 = AnyReducer<SessionState, StateAction> { state, action in
            if case .sessionActivityChanged(let a) = action {
                state.activity = a.activity
            }
        }
        let combined = CombinedReducer([r1, r2])

        var state = makeSessionState()
        combined.reduce(into: &state, action: .sessionTitleChanged(SessionTitleChangedAction(
            type: .sessionTitleChanged, title: "Custom Title"
        )))
        XCTAssertEqual(state.title, "Custom Title")

        combined.reduce(into: &state, action: .sessionActivityChanged(SessionActivityChangedAction(
            type: .sessionActivityChanged, activity: "Thinking"
        )))
        XCTAssertEqual(state.activity, "Thinking")
    }

    func testApplyingConvenience() {
        let state = makeSessionState()
        let next = sessionR.applying(
            action: .sessionReady(SessionReadyAction(type: .sessionReady)),
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
        var state = makeChatStateWithActiveTurn()

        chatR.reduce(into: &state, action: .chatResponsePart(ChatResponsePartAction(
            type: .chatResponsePart, turnId: T,
            part: .markdown(MarkdownResponsePart(kind: .markdown, id: "md-1", content: ""))
        )))
        chatR.reduce(into: &state, action: .chatDelta(ChatDeltaAction(
            type: .chatDelta, turnId: T, partId: "md-1", content: "Hello"
        )))
        chatR.reduce(into: &state, action: .chatDelta(ChatDeltaAction(
            type: .chatDelta, turnId: T, partId: "md-1", content: " World"
        )))

        let text = state.activeTurn?.responseParts.compactMap { part in
            if case .markdown(let md) = part { return md.content }
            return nil
        }.joined() ?? ""
        XCTAssertEqual(text, "Hello World")
    }
}
