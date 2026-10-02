// PerChannelReplayCursorTests — regression coverage for independent
// per-channel reconnect cursors.
//
// Mirrors the four new scenarios added to `clients/typescript/test/
// hosts.test.ts` under "Per-channel reconnect/replay cursors": a fast
// channel must never advance a slower sibling's cursor, replay/snapshot
// recoveries must only move the matching channel's cursor, and a channel
// reported `missing` must be dropped from subscriptions and never
// re-requested.

import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class PerChannelReplayCursorTests: XCTestCase {
    private static let channelA = "ahp-canvas:/a"
    private static let channelB = "ahp-canvas:/b"

    /// A fast channel (B) racing ahead of a slow channel (A) must not cause
    /// A's per-channel cursor to advance — the reconnect request must carry
    /// A's own (unseen) baseline, not B's.
    func testFastChannelNeverAdvancesSlowerSiblingsCursor() async throws {
        let state = PerChannelFakeHostState()
        await state.setInjectAfterInit { transport in
            try? await Task.sleep(for: .milliseconds(20))
            _ = await sendCanvasActionNotification(channel: Self.channelB, serverSeq: 101, on: transport)
        }

        let multi = MultiHostClient()
        let config = HostConfig(
            id: "divergent",
            label: "divergent",
            transportFactory: makePerChannelFakeHostFactory(state: state)
        )
        _ = try await multi.add(config)
        await waitForHostState(multi, id: "divergent") { $0.isConnected }
        _ = try await multi.subscribe(host: "divergent", uri: Self.channelA)
        _ = try await multi.subscribe(host: "divergent", uri: Self.channelB)
        // Give the injected B-channel notification time to be applied
        // before triggering the reconnect.
        try? await Task.sleep(for: .milliseconds(60))

        try await multi.reconnect("divergent")
        await waitUntil { await state.reconnectRequests.count >= 1 }

        let reconnectRequests1 = await state.reconnectRequests
        let req = try XCTUnwrap(reconnectRequests1.first)
        let cursorFor = { (channel: String) in
            req.subscriptions.first { $0.channel == channel }?.lastSeenServerSeq
        }
        XCTAssertEqual(cursorFor(Self.channelB), 101, "B's cursor should reflect its own progress")
        XCTAssertEqual(cursorFor(Self.channelA), 0, "A's cursor must stay at its own baseline — never advanced by B")

        await multi.shutdown()
    }

    /// A replay recovery for one channel must only advance that channel's
    /// cursor; an untouched sibling channel (with an empty replay) must stay
    /// at its baseline.
    func testReplayRecoveryAdvancesOnlyItsOwnChannelsCursor() async throws {
        let state = PerChannelFakeHostState()
        await state.setHandleReconnect { params in
            let channels: [ChannelRecovery] = params.subscriptions.map { sub in
                if sub.channel == Self.channelA {
                    let actions = [10, 11].map { seq in
                        ActionEnvelope(
                            channel: Self.channelA,
                            action: .canvasStateChanged(CanvasStateChangedAction(
                                type: .canvasStateChanged,
                                canvas: CanvasState(instanceId: "a", extensionId: "fake", canvasId: "fake-canvas")
                            )),
                            serverSeq: seq
                        )
                    }
                    return .replay(ChannelReplayRecovery(kind: .replay, channel: Self.channelA, actions: actions))
                }
                return .replay(ChannelReplayRecovery(kind: .replay, channel: sub.channel, actions: []))
            }
            return ReconnectResult(channels: channels)
        }

        let multi = MultiHostClient()
        let config = HostConfig(
            id: "replay",
            label: "replay",
            transportFactory: makePerChannelFakeHostFactory(state: state)
        )
        _ = try await multi.add(config)
        await waitForHostState(multi, id: "replay") { $0.isConnected }
        _ = try await multi.subscribe(host: "replay", uri: Self.channelA)
        _ = try await multi.subscribe(host: "replay", uri: Self.channelB)

        try await multi.reconnect("replay")
        await waitUntil { await state.reconnectRequests.count >= 1 }

        // The *next* reconnect must report A's advanced cursor (11) while B
        // — which had an empty replay — stays at 0.
        try await multi.reconnect("replay")
        await waitUntil { await state.reconnectRequests.count >= 2 }

        let reconnectRequestsSnapshot = await state.reconnectRequests
        let req = try XCTUnwrap(reconnectRequestsSnapshot.last)
        let cursorFor = { (channel: String) in
            req.subscriptions.first { $0.channel == channel }?.lastSeenServerSeq
        }
        XCTAssertEqual(cursorFor(Self.channelA), 11, "A's cursor should reflect the exhausted replay")
        XCTAssertEqual(cursorFor(Self.channelB), 0, "B's cursor must be untouched by A's replay")

        await multi.shutdown()
    }

    /// A snapshot recovery must set that channel's cursor to the snapshot's
    /// `fromSeq`, becoming the new baseline for subsequent reconnects.
    func testSnapshotRecoverySetsCursorFromFromSeqBaseline() async throws {
        let state = PerChannelFakeHostState()
        await state.setHandleReconnect { params in
            let channels: [ChannelRecovery] = params.subscriptions.map { sub in
                .snapshot(ChannelSnapshotRecovery(
                    kind: .snapshot,
                    channel: sub.channel,
                    snapshot: Snapshot(
                        resource: sub.channel,
                        state: .canvas(CanvasState(instanceId: "a", extensionId: "fake", canvasId: "fake-canvas")),
                        fromSeq: 50
                    )
                ))
            }
            return ReconnectResult(channels: channels)
        }

        let multi = MultiHostClient()
        let config = HostConfig(
            id: "snap",
            label: "snap",
            transportFactory: makePerChannelFakeHostFactory(state: state)
        )
        _ = try await multi.add(config)
        await waitForHostState(multi, id: "snap") { $0.isConnected }
        _ = try await multi.subscribe(host: "snap", uri: Self.channelA)

        try await multi.reconnect("snap")
        await waitUntil { await state.reconnectRequests.count >= 1 }
        try await multi.reconnect("snap")
        await waitUntil { await state.reconnectRequests.count >= 2 }

        let reconnectRequestsSnapshot = await state.reconnectRequests
        let req = try XCTUnwrap(reconnectRequestsSnapshot.last)
        XCTAssertEqual(req.subscriptions.first { $0.channel == Self.channelA }?.lastSeenServerSeq, 50)

        await multi.shutdown()
    }

    /// A channel reported `missing` on reconnect must be dropped from the
    /// host's subscriptions and must never be re-requested on a later
    /// reconnect, while unrelated channels remain subscribed.
    func testMissingChannelIsDroppedAndNeverReRequested() async throws {
        let gone = "ahp-canvas:/gone"
        let state = PerChannelFakeHostState()
        await state.setHandleReconnect { params in
            let channels: [ChannelRecovery] = params.subscriptions.map { sub in
                if sub.channel == gone {
                    return .missing(ChannelMissingRecovery(kind: .missing, channel: gone))
                }
                return .replay(ChannelReplayRecovery(kind: .replay, channel: sub.channel, actions: []))
            }
            return ReconnectResult(channels: channels)
        }

        let multi = MultiHostClient()
        let config = HostConfig(
            id: "missing",
            label: "missing",
            transportFactory: makePerChannelFakeHostFactory(state: state)
        )
        _ = try await multi.add(config)
        await waitForHostState(multi, id: "missing") { $0.isConnected }
        _ = try await multi.subscribe(host: "missing", uri: Self.channelA)
        _ = try await multi.subscribe(host: "missing", uri: gone)

        try await multi.reconnect("missing")
        await waitUntil { await state.reconnectRequests.count >= 1 }
        await waitUntil {
            let subscriptions = await multi.host("missing")?.subscriptions ?? [gone]
            return !subscriptions.contains(gone)
        }
        let afterFirstReconnect = await multi.host("missing")
        XCTAssertTrue(afterFirstReconnect?.subscriptions.contains(Self.channelA) ?? false, "A should remain subscribed")

        try await multi.reconnect("missing")
        await waitUntil { await state.reconnectRequests.count >= 2 }
        let reconnectRequestsSnapshot = await state.reconnectRequests
        let req = try XCTUnwrap(reconnectRequestsSnapshot.last)
        XCTAssertFalse(req.subscriptions.contains { $0.channel == gone }, "missing channel must not be re-requested")

        await multi.shutdown()
    }
}

// MARK: - Per-channel fake host harness

/// Server-side state for `drivePerChannelFakeHost`: records every decoded
/// `reconnect` request (in order) and allows tests to override the
/// `ReconnectResult` returned, and to inject an action notification shortly
/// after the first `initialize`/`reconnect` response.
actor PerChannelFakeHostState {
    private(set) var reconnectRequests: [ReconnectParams] = []
    private var handleReconnect: (@Sendable (ReconnectParams) -> ReconnectResult)?
    private var injectAfterInit: (@Sendable (InMemoryTransport) async -> Void)?

    func setHandleReconnect(_ handler: @escaping @Sendable (ReconnectParams) -> ReconnectResult) {
        handleReconnect = handler
    }

    func setInjectAfterInit(_ handler: @escaping @Sendable (InMemoryTransport) async -> Void) {
        injectAfterInit = handler
    }

    func recordReconnect(_ params: ReconnectParams) {
        reconnectRequests.append(params)
    }

    func buildReconnectResult(for params: ReconnectParams) -> ReconnectResult {
        if let handleReconnect {
            return handleReconnect(params)
        }
        // Default: an empty replay for every requested channel.
        let channels: [ChannelRecovery] = params.subscriptions.map {
            .replay(ChannelReplayRecovery(kind: .replay, channel: $0.channel, actions: []))
        }
        return ReconnectResult(channels: channels)
    }

    func runInjection(on transport: InMemoryTransport) async {
        guard let injectAfterInit else { return }
        await injectAfterInit(transport)
    }
}

/// Build a transport factory that, on every call, opens a fresh
/// `InMemoryTransport.pair()` and starts `drivePerChannelFakeHost` driving
/// the server side.
func makePerChannelFakeHostFactory(state: PerChannelFakeHostState) -> HostTransportFactory {
    { _ in
        let (clientSide, serverSide) = InMemoryTransport.pair()
        Task {
            await drivePerChannelFakeHost(transport: serverSide, state: state)
        }
        return clientSide
    }
}

/// Drive one fake-host connection, responding to `initialize`, `reconnect`,
/// `listSessions`, and `subscribe`. Other requests echo an empty `{}`
/// result. Runs `state`'s injection callback once, after the first
/// `initialize` or `reconnect` response.
private func drivePerChannelFakeHost(transport: InMemoryTransport, state: PerChannelFakeHostState) async {
    let decoder = JSONDecoder()
    let encoder = JSONEncoder()
    var injectionRan = false
    while !Task.isCancelled {
        let frame: TransportMessage?
        do {
            frame = try await transport.recv()
        } catch {
            return
        }
        guard let frame else { return }
        guard case .text(let text) = frame,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = object["id"] as? Int,
              let method = object["method"] as? String
        else { continue }

        let result: Any
        switch method {
        case "initialize":
            result = [
                "protocolVersion": "0.1.0",
                "serverSeq": 0,
                "snapshots": [[
                    "resource": RootResourceURI,
                    "state": ["agents": [], "activeSessions": 0] as [String: Any],
                    "fromSeq": 0,
                ] as [String: Any]],
            ] as [String: Any]
        case "reconnect":
            guard let paramsObject = object["params"],
                  let paramsData = try? JSONSerialization.data(withJSONObject: paramsObject),
                  let params = try? decoder.decode(ReconnectParams.self, from: paramsData)
            else { continue }
            await state.recordReconnect(params)
            let reconnectResult = await state.buildReconnectResult(for: params)
            guard let encoded = try? encoder.encode(reconnectResult),
                  let obj = try? JSONSerialization.jsonObject(with: encoded)
            else { continue }
            result = obj
        case "listSessions":
            result = ["items": []] as [String: Any]
        case "subscribe":
            // The fake server doesn't enforce real subscriptions; no
            // snapshot means the subscribed channel starts at cursor 0.
            result = [:] as [String: Any]
        default:
            result = [:] as [String: Any]
        }

        let response: [String: Any] = ["jsonrpc": "2.0", "id": id, "result": result]
        guard let respData = try? JSONSerialization.data(withJSONObject: response),
              let respText = String(data: respData, encoding: .utf8)
        else { continue }
        do {
            try await transport.send(.text(respText))
        } catch {
            return
        }

        if !injectionRan && (method == "initialize" || method == "reconnect") {
            injectionRan = true
            await state.runInjection(on: transport)
        }
    }
}

/// Send an `action` notification for a non-root `CanvasStateChanged`
/// envelope on `channel`, for per-channel-cursor tests.
private func sendCanvasActionNotification(
    channel: String,
    serverSeq: Int,
    on transport: InMemoryTransport
) async -> Bool {
    let envelope = ActionEnvelope(
        channel: channel,
        action: .canvasStateChanged(CanvasStateChangedAction(
            type: .canvasStateChanged,
            canvas: CanvasState(instanceId: channel, extensionId: "fake", canvasId: "fake-canvas")
        )),
        serverSeq: serverSeq
    )
    guard let data = try? JSONEncoder().encode(envelope),
          let paramsObject = try? JSONSerialization.jsonObject(with: data)
    else { return false }
    let notification: [String: Any] = [
        "jsonrpc": "2.0",
        "method": "action",
        "params": paramsObject,
    ]
    guard let notifData = try? JSONSerialization.data(withJSONObject: notification),
          let notifText = String(data: notifData, encoding: .utf8)
    else { return false }
    do {
        try await transport.send(.text(notifText))
        return true
    } catch {
        return false
    }
}
