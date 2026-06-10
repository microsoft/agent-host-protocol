// AHPStateMirrorTests — smoke test for the reducer façade.

import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class AHPStateMirrorTests: XCTestCase {

    func testApplySnapshotSeedsRootState() async {
        let mirror = AHPStateMirror()
        let agents = [
            AgentInfo(provider: "copilot", displayName: "Copilot", description: "", models: [])
        ]
        let snapshot = Snapshot(
            resource: RootResourceURI,
            state: .root(RootState(agents: agents)),
            fromSeq: 0
        )
        await mirror.applySnapshot(snapshot)
        let root = await mirror.rootState
        XCTAssertEqual(root.agents.count, 1)
        XCTAssertEqual(root.agents.first?.provider, "copilot")
    }

    func testApplySnapshotSeedsSessionState() async {
        let mirror = AHPStateMirror()
        let session = SessionState(
            summary: SessionSummary(
                resource: "ahp-session:/s1",
                provider: "test",
                title: "T",
                status: .idle,
                createdAt: 1, modifiedAt: 1
            ),
            lifecycle: .ready,
            chats: []
        )
        let snapshot = Snapshot(
            resource: "ahp-session:/s1",
            state: .session(session),
            fromSeq: 0
        )
        await mirror.applySnapshot(snapshot)
        let sessions = await mirror.sessions
        XCTAssertNotNil(sessions["ahp-session:/s1"])
    }

    func testApplyRootActionUpdatesRoot() async {
        let mirror = AHPStateMirror()
        let agents = [
            AgentInfo(provider: "x", displayName: "X", description: "", models: [])
        ]
        let envelope = ActionEnvelope(
            channel: RootResourceURI,
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: agents
            )),
            serverSeq: 1
        )
        await mirror.apply(envelope)
        let root = await mirror.rootState
        XCTAssertEqual(root.agents.count, 1)
        XCTAssertEqual(root.agents.first?.provider, "x")
    }

    func testApplySessionActionUpdatesSession() async {
        let mirror = AHPStateMirror()
        let initial = SessionState(
            summary: SessionSummary(
                resource: "ahp-session:/s1",
                provider: "test",
                title: "Old",
                status: .idle,
                createdAt: 1, modifiedAt: 1
            ),
            lifecycle: .ready,
            chats: []
        )
        await mirror.applySnapshot(Snapshot(
            resource: "ahp-session:/s1",
            state: .session(initial),
            fromSeq: 0
        ))

        let envelope = ActionEnvelope(
            channel: "ahp-session:/s1",
            action: .sessionTitleChanged(SessionTitleChangedAction(
                type: .sessionTitleChanged,
                title: "New"
            )),
            serverSeq: 1
        )
        await mirror.apply(envelope)
        let sessions = await mirror.sessions
        XCTAssertEqual(sessions["ahp-session:/s1"]?.summary.title, "New")
    }

    func testResetClearsState() async {
        let mirror = AHPStateMirror()
        await mirror.applySnapshot(Snapshot(
            resource: RootResourceURI,
            state: .root(RootState(agents: [
                AgentInfo(provider: "copilot", displayName: "Copilot", description: "", models: [])
            ])),
            fromSeq: 0
        ))
        await mirror.reset()
        let root = await mirror.rootState
        XCTAssertEqual(root.agents.count, 0)
    }
}
