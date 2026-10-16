// Basic windowed delivery.
//
// The client offers windowed delivery on a terminal subscription. The host
// accepts a smaller window, then sends a snapshot and terminal output. When
// the window is full, the host waits; each time the client takes the next
// delivery, it releases the previous one and returns credit, so the host can
// continue.
//
// Run: swift run --package-path clients/swift/Examples WindowingBasic

import AgentHostProtocol
import AgentHostProtocolClient
import WindowingDemoHost

let terminal = "ahp-terminal:/demo"
let output = [
    "$ npm test",
    "> demo@1.0.0 test",
    "> node --test",
    "ok 1 - parses the configuration file",
    "ok 2 - rejects an unknown option",
    "ok 3 - reads input from stdin",
    "ok 4 - writes the report",
    "# pass 4, fail 0",
]

func log(_ message: String) { print("  client | \(message)") }

// The host accepts at most a 1024-byte window, so it fills after a few messages.
let host = DemoHost(DemoHostOptions(clientWindowBytes: 1024, hostWindowBytes: 4096))
let client = AHPClient(transport: host.clientTransport)
try await client.connect()
try await client.initialize(clientId: "windowing-example", protocolVersions: SUPPORTED_PROTOCOL_VERSIONS)

// Windowing is off by default. Opt in for this subscription and offer a
// 4096-byte window. Coalescing is turned off so that every host message is a
// separate delivery; see WindowingBackpressure for coalescing.
let subscription = try await client.subscribe(
    terminal, options: .windowed(windowBytes: 4096, coalescing: false))
let status = await subscription.status()
log("subscribed: mode=\(status.mode), "
    + "accepted window=\(status.limits.map { String($0.clientReceive.windowBytes) } ?? "none") bytes")

// The host writes terminal output as fast as the window allows.
let writer = Task {
    await host.whenSubscribed()
    for line in output {
        await host.sendAction(.terminalData(TerminalDataAction(type: .terminalData, data: "\(line)\r\n")))
    }
}

// With automatic release (the default for `events`), taking the next delivery
// releases the previous one. The client then returns credit for it.
var lines = 0
for try await delivery in subscription.events {
    let buffered = await subscription.status().bufferedReceiveBytes
    switch delivery.payload {
    case .snapshot:
        log("snapshot (\(delivery.receivedBytes) bytes; \(buffered) bytes not yet released)")
    case .event(.action(let envelope)):
        if case .terminalData(let action) = envelope.action {
            let text = String(action.data.reversed().drop(while: \.isWhitespace).reversed())
            log("output \(String(reflecting: text)) (\(delivery.receivedBytes) bytes; \(buffered) bytes not yet released)")
            lines += 1
        }
    default:
        break
    }
    try await Task.sleep(for: .milliseconds(20)) // Simulate rendering the delivery.
    if lines == output.count { break }
}

log("received all \(lines) lines")
await writer.value
// Leaving the loop does not unsubscribe or release the last delivery; closing
// the subscription does both.
try await subscription.close()
await host.close()
await client.shutdown()
