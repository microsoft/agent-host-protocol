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

    private func tcpState(size: Int = 8) -> TcpConnectionState {
        TcpConnectionState(
            session: "ahp-session:/test", target: TcpTarget(host: "localhost", port: 3000),
            encoding: .base64,
            input: FlowControlledByteDirectionState(windowBytes: size, maximumChunkSize: size, receivedBytes: 0, consumedBytes: 0),
            output: FlowControlledByteDirectionState(windowBytes: size, maximumChunkSize: size, receivedBytes: 0, consumedBytes: 0),
            clientClosed: false, hostClosed: false
        )
    }

    func testTcpFourMiBChunkAndAtomicNativeWrapper() throws {
        let size = 4 * 1024 * 1024
        let data = String(repeating: "AAAA", count: size / 3) + "AA=="
        let before = tcpState(size: size)
        let action = StateAction.tcpInput(TcpInputAction(type: .tcpInput, offset: 0, data: data))
        var state = before
        try AHPTcpReducer().reduce(into: &state, action: action)
        XCTAssertEqual(state.input.receivedBytes, size)
        XCTAssertEqual(before.input.receivedBytes, 0)
        try AHPTcpReducer().reduce(into: &state, action: action)
        XCTAssertEqual(state.input.receivedBytes, size)
        let saved = try JSONEncoder().encode(state)
        XCTAssertThrowsError(try AHPTcpReducer().reduce(
            into: &state, action: .tcpInput(TcpInputAction(type: .tcpInput, offset: size, data: "AA=="))
        )) { error in
            XCTAssertEqual(String(describing: error), "Invalid TCP action: receive window exceeded")
        }
        XCTAssertEqual(try JSONSerialization.jsonObject(with: saved) as? NSDictionary,
                       try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as? NSDictionary)
    }

    func testTcpSafeIntegerCounters() throws {
        let max = 9007199254740991
        var state = tcpState()
        state.input.receivedBytes = max - 1
        state.input.consumedBytes = max - 1
        state = try tcpReducer(state: state, action: .tcpInput(TcpInputAction(type: .tcpInput, offset: max - 1, data: "AA==")))
        state = try tcpReducer(state: state, action: .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: max)))
        state = try tcpReducer(state: state, action: .tcpInputEof(TcpInputEofAction(type: .tcpInputEof, finalOffset: max)))
        XCTAssertEqual(state.input.receivedBytes, max)
        XCTAssertEqual(state.input.consumedBytes, max)
        XCTAssertEqual(state.input.eofAtBytes, max)
        for value in [-1, max + 1, Int.max] {
            let actions: [StateAction] = [
                .tcpInput(TcpInputAction(type: .tcpInput, offset: value, data: "AA==")),
                .tcpData(TcpDataAction(type: .tcpData, offset: value, data: "AA==")),
                .tcpInputConsumed(TcpInputConsumedAction(type: .tcpInputConsumed, consumedBytes: value)),
                .tcpDataConsumed(TcpDataConsumedAction(type: .tcpDataConsumed, consumedBytes: value)),
                .tcpInputEof(TcpInputEofAction(type: .tcpInputEof, finalOffset: value)),
                .tcpDataEof(TcpDataEofAction(type: .tcpDataEof, finalOffset: value)),
            ]
            for action in actions {
                XCTAssertThrowsError(try AHPTcpReducer().reduce(into: &state, action: action)) { error in
                    XCTAssertEqual(String(describing: error), "Invalid TCP action: offset must be a nonnegative safe integer")
                }
                XCTAssertEqual(state.input.receivedBytes, max)
            }
        }
    }

    func testTcpRejectsWhitespaceAndUnicodeBase64() {
        for data in ["AAA\n", "AAA\r", "AAA\t", "AAA ", "AAA\u{e9}", "AA\u{1f600}"] {
            XCTAssertThrowsError(try tcpReducer(
                state: tcpState(), action: .tcpInput(TcpInputAction(type: .tcpInput, offset: 0, data: data))
            )) { error in
                XCTAssertEqual(String(describing: error), "Invalid TCP action: base64 encoding")
            }
        }
    }

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
