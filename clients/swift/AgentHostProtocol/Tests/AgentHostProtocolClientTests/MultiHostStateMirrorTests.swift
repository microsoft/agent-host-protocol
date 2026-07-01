// MultiHostStateMirrorTests — host-aware reducer façade tests.

import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class MultiHostStateMirrorTests: XCTestCase {

    // MARK: - root_states_are_isolated_per_host

    func testRootStatesAreIsolatedPerHost() async {
        let mirror = MultiHostStateMirror()
        let agentsA = [AgentInfo(provider: "a", displayName: "A", description: "", models: [])]
        let agentsB = [AgentInfo(provider: "b", displayName: "B", description: "", models: [])]

        await mirror.applySnapshot(
            host: "alpha",
            snapshot: Snapshot(resource: RootResourceURI, state: .root(RootState(agents: agentsA)), fromSeq: 0)
        )
        await mirror.applySnapshot(
            host: "beta",
            snapshot: Snapshot(resource: RootResourceURI, state: .root(RootState(agents: agentsB)), fromSeq: 0)
        )

        let roots = await mirror.rootStates
        XCTAssertEqual(roots["alpha"]?.agents.first?.provider, "a")
        XCTAssertEqual(roots["beta"]?.agents.first?.provider, "b")
    }

    // MARK: - session_uri_collisions_across_hosts_do_not_clobber

    /// The core multi-host invariant: two hosts can legitimately
    /// advertise the same session URI; the mirror MUST key by
    /// `(hostId, uri)` so they don't overwrite each other.
    func testSessionUriCollisionAcrossHostsDoesNotClobber() async {
        let mirror = MultiHostStateMirror()
        let sessionA = SessionState(
            provider: "x", title: "A title", status: .idle,
            lifecycle: .ready, activeClients: [], chats: []
        )
        let sessionB = SessionState(
            provider: "x", title: "B title", status: .idle,
            lifecycle: .ready, activeClients: [], chats: []
        )

        await mirror.applySnapshot(
            host: "alpha",
            snapshot: Snapshot(resource: "ahp-session:/s1", state: .session(sessionA), fromSeq: 0)
        )
        await mirror.applySnapshot(
            host: "beta",
            snapshot: Snapshot(resource: "ahp-session:/s1", state: .session(sessionB), fromSeq: 0)
        )

        let sessions = await mirror.sessions
        XCTAssertEqual(sessions[HostedResourceKey(hostId: "alpha", uri: "ahp-session:/s1")]?.title, "A title")
        XCTAssertEqual(sessions[HostedResourceKey(hostId: "beta", uri: "ahp-session:/s1")]?.title, "B title")
    }

    // MARK: - apply_root_action_updates_only_the_target_host

    func testApplyRootActionUpdatesOnlyTargetHost() async {
        let mirror = MultiHostStateMirror()
        await mirror.applySnapshot(
            host: "alpha",
            snapshot: Snapshot(resource: RootResourceURI, state: .root(RootState(agents: [])), fromSeq: 0)
        )
        await mirror.applySnapshot(
            host: "beta",
            snapshot: Snapshot(resource: RootResourceURI, state: .root(RootState(agents: [])), fromSeq: 0)
        )

        let envelope = ActionEnvelope(
            channel: RootResourceURI,
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [AgentInfo(provider: "new", displayName: "New", description: "", models: [])]
            )),
            serverSeq: 5
        )
        await mirror.apply(host: "alpha", envelope: envelope)

        let roots = await mirror.rootStates
        XCTAssertEqual(roots["alpha"]?.agents.first?.provider, "new")
        XCTAssertEqual(roots["beta"]?.agents.count, 0,
                       "applying an action to alpha must not touch beta's root state")
    }

    // MARK: - apply_session_action_updates_only_the_target_session

    func testApplySessionActionUpdatesOnlyTargetSession() async {
        let mirror = MultiHostStateMirror()
        let initial = SessionState(
            provider: "x", title: "Old", status: .idle,
            lifecycle: .ready, activeClients: [], chats: []
        )
        await mirror.applySnapshot(
            host: "alpha",
            snapshot: Snapshot(resource: "ahp-session:/s1", state: .session(initial), fromSeq: 0)
        )
        await mirror.applySnapshot(
            host: "beta",
            snapshot: Snapshot(resource: "ahp-session:/s1", state: .session(initial), fromSeq: 0)
        )

        let envelope = ActionEnvelope(
            channel: "ahp-session:/s1",
            action: .sessionTitleChanged(SessionTitleChangedAction(
                type: .sessionTitleChanged,
                title: "New on alpha"
            )),
            serverSeq: 7
        )
        await mirror.apply(host: "alpha", envelope: envelope)

        let sessions = await mirror.sessions
        XCTAssertEqual(sessions[HostedResourceKey(hostId: "alpha", uri: "ahp-session:/s1")]?.title, "New on alpha")
        XCTAssertEqual(sessions[HostedResourceKey(hostId: "beta", uri: "ahp-session:/s1")]?.title, "Old",
                       "session-scoped action on alpha must not touch beta's identically-named session")
    }

    // MARK: - apply_host_subscription_event_forwards_to_per_host_apply

    func testApplyHostSubscriptionEventForwardsToPerHostApply() async {
        let mirror = MultiHostStateMirror()
        await mirror.applySnapshot(
            host: "alpha",
            snapshot: Snapshot(resource: RootResourceURI, state: .root(RootState(agents: [])), fromSeq: 0)
        )

        let envelope = ActionEnvelope(
            channel: RootResourceURI,
            action: .rootAgentsChanged(RootAgentsChangedAction(
                type: .rootAgentsChanged,
                agents: [AgentInfo(provider: "via-event", displayName: "V", description: "", models: [])]
            )),
            serverSeq: 9
        )
        let hostEvent = HostSubscriptionEvent(
            hostId: "alpha",
            resource: RootResourceURI,
            event: .action(envelope)
        )
        await mirror.apply(event: hostEvent)

        let roots = await mirror.rootStates
        XCTAssertEqual(roots["alpha"]?.agents.first?.provider, "via-event")
    }

    // MARK: - reset_host_drops_only_that_host

    func testResetHostDropsOnlyThatHost() async {
        let mirror = MultiHostStateMirror()
        await mirror.applySnapshot(
            host: "alpha",
            snapshot: Snapshot(resource: RootResourceURI, state: .root(RootState(agents: [])), fromSeq: 0)
        )
        await mirror.applySnapshot(
            host: "beta",
            snapshot: Snapshot(resource: RootResourceURI, state: .root(RootState(agents: [])), fromSeq: 0)
        )

        await mirror.reset(host: "alpha")
        let roots = await mirror.rootStates
        XCTAssertNil(roots["alpha"])
        XCTAssertNotNil(roots["beta"])
    }
}
