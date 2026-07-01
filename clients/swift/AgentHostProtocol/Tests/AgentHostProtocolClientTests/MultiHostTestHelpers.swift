// MultiHostTestHelpers — shared infrastructure for `MultiHostClientTests`.
//
// Mirrors the Rust integration-test scaffolding (`crates/ahp/tests/hosts.rs`):
// a small "fake host" actor that drives the server side of an
// `InMemoryTransport.pair()` and responds to `initialize`/`reconnect`/
// `listSessions`/`subscribe`. Optionally pushes a `root/sessionAdded`
// after `initialize` to exercise the post-handshake notification path.

import Foundation
import AgentHostProtocol
@testable import AgentHostProtocolClient

/// Minimal mutable state for `FakeHost`. Conceptually equivalent to Rust's
/// `FakeHostState`.
struct FakeHostState: Sendable {
    var agents: [AgentInfo] = []
    var sessions: [SessionSummary] = []
    var serverSeq: Int = 0
}

/// Server-side responder for one in-memory transport pair. Constructed via
/// `FakeHost.start(transport:state:injectAfterInit:)`. Drives the loop in a
/// detached `Task`; cancelled implicitly when the client closes the
/// transport (`recv` throws).
struct FakeHost {
    /// Spin up a fake host driving `transport` (the *server* side of an
    /// `InMemoryTransport.pair()`). When `injectAfterInit` is non-nil, the
    /// fake pushes a `root/sessionAdded` for that summary shortly after
    /// answering `initialize` (or `reconnect`).
    static func start(
        transport: InMemoryTransport,
        state: FakeHostState,
        injectAfterInit: SessionSummary? = nil
    ) -> Task<Void, Never> {
        Task {
            await drive(transport: transport, state: state, injectAfterInit: injectAfterInit)
        }
    }

    private static func drive(
        transport: InMemoryTransport,
        state: FakeHostState,
        injectAfterInit: SessionSummary?
    ) async {
        let encoder = JSONEncoder()
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
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { continue }

            let id = object["id"] as? Int
            let method = object["method"] as? String

            if let id, let method {
                let result = handleRequest(method: method, params: object["params"], state: state)
                let resp: [String: Any] = [
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": result,
                ]
                guard let respData = try? JSONSerialization.data(withJSONObject: resp),
                      let respText = String(data: respData, encoding: .utf8)
                else { continue }
                try? await transport.send(.text(respText))

                if let summary = injectAfterInit, method == "initialize" || method == "reconnect" {
                    // Tiny delay so the client's `listSessions` request has
                    // landed before the notification arrives.
                    try? await Task.sleep(for: .milliseconds(20))
                    let summaryAny: Any
                    if let bytes = try? encoder.encode(summary),
                       let obj = try? JSONSerialization.jsonObject(with: bytes) {
                        summaryAny = obj
                    } else {
                        continue
                    }
                    let notif: [String: Any] = [
                        "jsonrpc": "2.0",
                        "method": "root/sessionAdded",
                        "params": [
                            "channel": RootResourceURI,
                            "summary": summaryAny,
                        ] as [String: Any],
                    ]
                    if let notifData = try? JSONSerialization.data(withJSONObject: notif),
                       let notifText = String(data: notifData, encoding: .utf8) {
                        try? await transport.send(.text(notifText))
                    }
                }
            }
        }
    }

    private static func handleRequest(
        method: String,
        params: Any?,
        state: FakeHostState
    ) -> Any {
        switch method {
        case "initialize":
            let agentsAny = sessionSummariesToJSON(state.agents)
            let snapshot: [String: Any] = [
                "resource": RootResourceURI,
                "state": [
                    "agents": agentsAny,
                    "activeSessions": state.sessions.count,
                ] as [String: Any],
                "fromSeq": state.serverSeq,
            ]
            return [
                "protocolVersion": "0.2.0",
                "serverSeq": state.serverSeq,
                "snapshots": [snapshot],
            ]
        case "reconnect":
            return [
                "type": "replay",
                "actions": [],
                "missing": [],
            ] as [String: Any]
        case "listSessions":
            let items = sessionSummariesToJSON(state.sessions)
            return ["items": items]
        case "subscribe":
            let resource = (params as? [String: Any])?["channel"] as? String ?? RootResourceURI
            let snap: [String: Any] = [
                "resource": resource,
                "state": [
                    "agents": sessionSummariesToJSON(state.agents)
                ] as [String: Any],
                "fromSeq": state.serverSeq,
            ]
            return ["snapshot": snap]
        default:
            return [:] as [String: Any]
        }
    }
}

private func sessionSummariesToJSON<T: Encodable>(_ values: [T]) -> [Any] {
    let encoder = JSONEncoder()
    return values.compactMap { value -> Any? in
        guard let data = try? encoder.encode(value),
              let object = try? JSONSerialization.jsonObject(with: data)
        else { return nil }
        return object
    }
}

/// Build a transport factory that, on every call, opens a fresh
/// `InMemoryTransport.pair()` and starts a `FakeHost` driving the server
/// side. Optionally injects a `root/sessionAdded` after init.
func makeFakeHostFactory(
    state: FakeHostState,
    injectAfterInit: SessionSummary? = nil,
    onConnect: (@Sendable () -> Void)? = nil
) -> HostTransportFactory {
    { _ in
        let (clientSide, serverSide) = InMemoryTransport.pair()
        onConnect?()
        _ = FakeHost.start(
            transport: serverSide,
            state: state,
            injectAfterInit: injectAfterInit
        )
        return clientSide
    }
}

/// Build a `SessionSummary` with the minimal required fields, defaulting
/// optional fields to `nil` so tests stay terse.
func makeSummary(
    _ uri: String,
    _ title: String,
    modifiedAt: Int = 0,
    createdAt: Int = 0
) -> SessionSummary {
    SessionSummary(
        provider: "copilot",
        title: title,
        status: .idle,
        resource: uri,
        createdAt: isoTimestamp(millis: createdAt),
        modifiedAt: isoTimestamp(millis: modifiedAt)
    )
}

/// Formats a millisecond epoch value as an ISO-8601 timestamp with fixed
/// millisecond precision so lexicographic ordering matches chronological order.
private func isoTimestamp(millis: Int) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(identifier: "UTC")
    return formatter.string(from: Date(timeIntervalSince1970: Double(millis) / 1000))
}

/// Build an `AgentInfo` with the minimal required fields.
func makeAgent(
    provider: String = "copilot",
    displayName: String = "Copilot"
) -> AgentInfo {
    AgentInfo(
        provider: provider,
        displayName: displayName,
        description: "demo",
        models: []
    )
}

/// Poll `condition` every 10 ms until it returns true or the timeout
/// elapses. Crashes (intentionally) on timeout.
func waitUntil(
    timeout: Duration = .seconds(2),
    _ condition: @Sendable () async -> Bool,
    file: StaticString = #file,
    line: UInt = #line
) async {
    let deadline = ContinuousClock.now + timeout
    while ContinuousClock.now < deadline {
        if await condition() { return }
        try? await Task.sleep(for: .milliseconds(10))
    }
    fatalError("waitUntil timed out", file: file, line: line)
}

/// Wait for a host's `HostState` to satisfy `predicate`.
func waitForHostState(
    _ multi: MultiHostClient,
    id: HostId,
    timeout: Duration = .seconds(2),
    _ predicate: @escaping @Sendable (HostState) -> Bool,
    file: StaticString = #file,
    line: UInt = #line
) async {
    await waitUntil(timeout: timeout, {
        guard let snap = await multi.host(id) else { return false }
        return predicate(snap.state)
    }, file: file, line: line)
}
