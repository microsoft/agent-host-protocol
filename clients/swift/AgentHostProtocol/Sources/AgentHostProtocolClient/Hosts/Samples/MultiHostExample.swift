// MultiHostExample — small in-package sample showing two-host UX.
//
// Not a binary target; intended for documentation, manual exploration in a
// playground, and as a sanity reference for downstream consumers. The
// supporting `pairedFakeHost` builder uses `InMemoryTransport.pair()` so
// you can run `MultiHostExample.runDemo()` from a test or scratch script.

import Foundation
import AgentHostProtocol

/// Documentation-quality sample wiring up two hosts behind `MultiHostClient`.
///
/// ```swift
/// // Run from a Swift script or test:
/// try await MultiHostExample.runDemo()
/// ```
public enum MultiHostExample {

    /// Spin up two in-memory "hosts" (one with one session summary, one
    /// with two), connect them through a `MultiHostClient`, and print the
    /// aggregated session list before tearing down.
    public static func runDemo() async throws {
        let storeA = ExampleHostState(label: "Local", sessions: [
            exampleSummary("ahp-session:/local-1", "Local: refactor", modifiedAt: 1_700)
        ])
        let storeB = ExampleHostState(label: "Tunnel", sessions: [
            exampleSummary("ahp-session:/remote-1", "Tunnel: feature work", modifiedAt: 2_000),
            exampleSummary("ahp-session:/remote-2", "Tunnel: bugfix", modifiedAt: 1_500)
        ])

        let multi = MultiHostClient()

        let configA = HostConfig(id: "local", label: "Local", transportFactory: pairedFakeHost(storeA))
        let configB = HostConfig(id: "tunnel", label: "Tunnel", transportFactory: pairedFakeHost(storeB))

        _ = try await multi.add(configA)
        _ = try await multi.add(configB)

        // Wait briefly for both hosts to finish handshake. Production code
        // would consume `hostEvents()` instead of polling.
        try await Task.sleep(for: .milliseconds(50))

        for hosted in await multi.aggregatedSessions() {
            print("[\(hosted.hostLabel)] \(hosted.summary.title) — modified \(hosted.summary.modifiedAt)")
        }

        await multi.shutdown()
    }
}

/// Fake host backing for the sample. Mirrors the test helper but trimmed
/// down to the bits the demo needs (initialize + listSessions). Lives in
/// the same module so the example can be referenced from Swift Playgrounds.
private final class ExampleHostState: @unchecked Sendable {
    let label: String
    let sessions: [SessionSummary]

    init(label: String, sessions: [SessionSummary]) {
        self.label = label
        self.sessions = sessions
    }
}

private func pairedFakeHost(_ state: ExampleHostState) -> HostTransportFactory {
    { _ in
        let (clientSide, serverSide) = InMemoryTransport.pair()
        Task { await driveExampleHost(transport: serverSide, state: state) }
        return clientSide
    }
}

private func driveExampleHost(
    transport: InMemoryTransport,
    state: ExampleHostState
) async {
    let encoder = JSONEncoder()
    while true {
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
            let snapshotJSON: [String: Any] = [
                "resource": RootResourceURI,
                "state": [
                    "agents": [],
                    "activeSessions": state.sessions.count,
                ] as [String: Any],
                "fromSeq": 0,
            ]
            result = [
                "protocolVersion": "0.2.0",
                "serverSeq": 0,
                "snapshots": [snapshotJSON],
            ] as [String: Any]
        case "listSessions":
            let items = state.sessions.compactMap { summary -> Any? in
                guard let bytes = try? encoder.encode(summary),
                      let object = try? JSONSerialization.jsonObject(with: bytes)
                else { return nil }
                return object
            }
            result = ["items": items]
        default:
            result = [:] as [String: Any]
        }
        let response: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: response),
              let text = String(data: data, encoding: .utf8)
        else { continue }
        try? await transport.send(.text(text))
    }
}

private func exampleSummary(_ uri: String, _ title: String, modifiedAt: Int) -> SessionSummary {
    SessionSummary(
        resource: uri,
        provider: "copilot",
        title: title,
        status: .idle,
        createdAt: 0,
        modifiedAt: modifiedAt
    )
}
