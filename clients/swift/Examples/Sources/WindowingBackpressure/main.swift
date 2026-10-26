// Windowed delivery with backpressure and a custom coalescer.
//
// Part 1, receiving: the client renders slowly. While it is busy, the host
// fills the window and the client queues what arrives. Adjacent queued
// messages are combined before the renderer sees them:
//
// - The built-in coalescer joins adjacent `terminal/data` output.
// - A custom coalescer keeps only the last of adjacent `terminal/resized`
//   actions, because only the final size matters.
//
// Part 2, sending: the client pastes a large block of text into the terminal.
// The host processes input slowly, so the client's send window fills. The
// client waits until the subscription is writable before it sends each chunk,
// instead of queueing the whole paste in memory.
//
// Run: swift run --package-path clients/swift/Examples WindowingBackpressure

import AgentHostProtocol
import AgentHostProtocolClient
import Foundation
import WindowingDemoHost

let terminal = "ahp-terminal:/demo"
func log(_ message: String) { print("  client | \(message)") }

// A custom coalescer runs on two adjacent messages that are still queued. It
// returns the combined message, or nil to leave them separate. The client
// never passes it messages that the protocol requires to stay separate, such
// as actions with an origin.
let latestResize = AHPCoalescer(method: "action") { earlier, later, context in
    guard context.direction == "inbound" else { return nil }
    let first = try earlier.decode(ActionEnvelope.self).action
    let second = try later.decode(ActionEnvelope.self).action
    if case .terminalResized = first, case .terminalResized = second {
        return later
    }
    return nil
}

let host = DemoHost(DemoHostOptions(clientWindowBytes: 2048, hostWindowBytes: 1024, inputDelay: .milliseconds(15)))
let client = AHPClient(transport: host.clientTransport, config: AHPClientConfig(windowing: AHPWindowingConfig(
    // Allow at most 2048 bytes of unsent data to wait behind the message being sent.
    maxBufferedSendBytes: 2048,
    coalescers: [latestResize]
)))
try await client.connect()
try await client.initialize(clientId: "windowing-example", protocolVersions: SUPPORTED_PROTOCOL_VERSIONS)

// Count what the client did. This stream is for monitoring only and can drop
// events; it never affects credit.
actor EventCounts {
    private(set) var counts: [String: Int] = [:]
    func add(_ kind: String) { counts[kind, default: 0] += 1 }
}
let counts = EventCounts()
let flowControlEvents = await client.flowControlEvents
let monitor = Task {
    for await event in flowControlEvents {
        await counts.add(event.kind)
    }
}

let subscription = try await client.subscribe(terminal, options: .windowed(windowBytes: 4096))
let accepted = await subscription.status().limits.map { String($0.clientReceive.windowBytes) } ?? "none"
log("subscribed: accepted window=\(accepted) bytes")

// ─── Part 1: a slow renderer ────────────────────────────────────────────────

print("\nPart 1: slow renderer")
let progress: [StateAction] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map { percent in
    let padded = String(repeating: " ", count: max(0, 3 - String(percent).count)) + String(percent)
    return .terminalData(TerminalDataAction(
        type: .terminalData, data: "[\(padded)%] compiled \(percent * 120 / 100) modules\r\n"))
}
let hostActions: [StateAction] = [
    .terminalData(TerminalDataAction(type: .terminalData, data: "Building 120 modules\r\n")),
    // The user drags the corner of the terminal window.
    .terminalResized(TerminalResizedAction(type: .terminalResized, cols: 100, rows: 30)),
    .terminalResized(TerminalResizedAction(type: .terminalResized, cols: 110, rows: 32)),
    .terminalResized(TerminalResizedAction(type: .terminalResized, cols: 120, rows: 36)),
    .terminalResized(TerminalResizedAction(type: .terminalResized, cols: 132, rows: 40)),
] + progress + [
    .terminalData(TerminalDataAction(type: .terminalData, data: "Build finished\r\n")),
]
let writer = Task {
    await host.whenSubscribed()
    for action in hostActions { await host.sendAction(action) }
}

// With automatic release, taking the next delivery releases the previous one.
// Breaking out of the loop keeps the subscription open for part 2.
var renders = 0
render: for try await delivery in subscription.events {
    renders += 1
    switch delivery.payload {
    case .snapshot:
        log("render snapshot (\(delivery.receivedBytes) bytes)")
    case .event(.action(let envelope)):
        switch envelope.action {
        case .terminalResized(let resize):
            log("render resize to \(resize.cols)x\(resize.rows) (\(delivery.receivedBytes) bytes)")
        case .terminalData(let output):
            let lines = output.data.components(separatedBy: "\r\n").filter { !$0.isEmpty }
            log("render \(lines.count) line(s) of output (\(delivery.receivedBytes) bytes): "
                + String(reflecting: lines.last ?? ""))
            if output.data.contains("Build finished") { break render }
        default:
            break
        }
    default:
        break
    }
    try await Task.sleep(for: .milliseconds(60)) // The renderer is slow; the host fills the window meanwhile.
}
log("rendered \(renders) deliveries for \(hostActions.count + 1) host messages")
await writer.value

// ─── Part 2: pasting into a slow terminal ───────────────────────────────────

print("\nPart 2: pasting into a slow terminal")
let paste = (1...8).map { "echo \"line \($0) of the pasted script\"\n" }
var waits = 0
for (index, chunk) in paste.enumerated() {
    // Wait for room in the host window and the local send queue, rather than
    // queueing the whole paste. With one producer, this keeps sends within the limit.
    let status = await subscription.status()
    if !status.writable {
        log("not writable (\(status.outstandingSendBytes) bytes awaiting credit, "
            + "\(status.bufferedSendBytes) bytes queued); waiting")
        waits += 1
        try await subscription.waitUntilWritable()
    }
    log("send chunk \(index + 1) of \(paste.count)")
    let input = StateAction.terminalInput(TerminalInputAction(type: .terminalInput, data: chunk))
    do {
        // Returns when the message is written to the transport.
        try await client.dispatch(input, channel: terminal)
    } catch AHPWindowingError.backpressure {
        // If another producer filled the queue first, the send fails instead of
        // growing the queue. Wait, then send the chunk again.
        try await subscription.waitUntilWritable()
        try await client.dispatch(input, channel: terminal)
    }
}
// Wait until the host has processed, and credited, every chunk.
for await status in await subscription.statusChanges
where status.outstandingSendBytes == 0 && status.bufferedSendBytes == 0 {
    break
}
let intact = await host.receivedInput == paste.joined()
log("sent \(paste.count) chunks, waiting \(waits) times; host received the paste intact: \(intact)")

// Monitoring events are delivered asynchronously; give the last ones a moment to arrive.
try await Task.sleep(for: .milliseconds(20))
print("\nFlow-control events:")
for (kind, count) in await counts.counts.sorted(by: { $0.key < $1.key }) {
    print("  \(kind): \(count)")
}

monitor.cancel()
try await subscription.close()
await host.close()
await client.shutdown()
