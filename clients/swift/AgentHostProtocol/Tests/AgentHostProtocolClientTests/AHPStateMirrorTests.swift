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
            provider: "test",
            title: "T",
            status: .idle,
            lifecycle: .ready,
            activeClients: [],
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

    func testAutomationIndexUsesLastDuplicateResourceAcrossSnapshotAndAction() async {
        let mirror = AHPStateMirror()
        let resource = "ahp-automation:/a1"
        let first = makeAutomationEntry(resource: resource, title: "First")
        let latest = makeAutomationEntry(resource: resource, title: "Latest")

        await mirror.applySnapshot(Snapshot(
            resource: "ahp-automations://",
            state: .automations(AutomationState(entries: [first, latest])),
            fromSeq: 0
        ))

        var automations = await mirror.automations
        XCTAssertEqual(automations.count, 1)
        XCTAssertEqual(automations[resource]?.definition.title, "Latest")

        let added = makeAutomationEntry(resource: "ahp-automation:/a2", title: "Added")
        await mirror.apply(ActionEnvelope(
            channel: "ahp-automations://",
            action: .automationSet(AutomationSetAction(
                type: .automationSet,
                automation: added
            )),
            serverSeq: 1
        ))

        automations = await mirror.automations
        XCTAssertEqual(automations.count, 2)
        XCTAssertEqual(automations[resource]?.definition.title, "Latest")
        XCTAssertEqual(automations[added.resource]?.definition.title, "Added")
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
            provider: "test",
            title: "Old",
            status: .idle,
            lifecycle: .ready,
            activeClients: [],
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
        XCTAssertEqual(sessions["ahp-session:/s1"]?.title, "New")
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

private func makeAutomationEntry(resource: String, title: String) -> AutomationEntry {
    AutomationEntry(
        resource: resource,
        definition: AutomationDefinition(
            title: title,
            message: Message(text: "Run", origin: MessageOrigin(kind: .user)),
            session: AutomationSessionTemplate(),
            enabled: true,
            triggers: []
        ),
        runs: [],
        operations: [.update, .run],
        createdAt: "2026-08-05T12:00:00Z",
        modifiedAt: "2026-08-05T12:00:00Z"
    )
}
