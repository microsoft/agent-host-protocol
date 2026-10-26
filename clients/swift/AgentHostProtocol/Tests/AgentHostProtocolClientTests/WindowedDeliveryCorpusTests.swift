import Foundation
import XCTest
import AgentHostProtocol
@testable import AgentHostProtocolClient

final class WindowedDeliveryCorpusTests: XCTestCase {
    func testRecorderChecksAvailableMessagesBeforeItsDeadline() async throws {
        let recorder = CorpusRecorder(timeout: .zero)
        await recorder.append("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"subscribe\",\"params\":{\"channel\":\"ahp-terminal:/ready\"}}")
        let message = try await recorder.take(["method": "subscribe"]).1
        let id = try await recorder.requestId("subscribe")
        XCTAssertEqual(message["id"] as? Int, 1)
        XCTAssertEqual(id, 1)
    }

    private static let corpus = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("types/test-cases/windowed-delivery")

    func testEveryRawSize() throws {
        let object = try JSONSerialization.jsonObject(
            with: Data(contentsOf: Self.corpus.appendingPathComponent("sizes.json"))) as! [String: Any]
        let cases = object["cases"] as! [[String: Any]]
        XCTAssertFalse(cases.isEmpty)
        for item in cases {
            XCTAssertEqual(ahpUTF16Bytes(item["text"] as! String), item["utf16Bytes"] as? Int,
                           item["name"] as! String)
        }
    }

    func testEveryScenario() async throws {
        let directory = Self.corpus.appendingPathComponent("scenarios")
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        XCTAssertEqual(files.count, 24)
        for file in files {
            let scenario = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any]
            do { try await run(scenario) }
            catch { XCTFail("\(file.lastPathComponent): \(error)") }
        }
    }

    private func run(_ scenario: [String: Any]) async throws {
        let config = scenario["windowing"] as? [String: Int] ?? [:]
        let (transport, host) = InMemoryTransport.pair()
        let client = AHPClient(transport: transport, config: .init(windowing: .init(
            windowBytes: config["windowBytes"] ?? 262_144,
            maximumFrameBytes: config["maximumFrameBytes"] ?? 16_384,
            maxBufferedSendBytes: config["maxBufferedSendBytes"] ?? 1_048_576)))
        let recorder = CorpusRecorder()
        let pump = Task {
            while let message = try? await host.recv() {
                if case .text(let text) = message { await recorder.append(text) }
            }
            await recorder.finish()
        }
        try await client.connect()
        var subscriptions: [String: Task<AHPSubscription, Error>] = [:]
        var deliveries: [String: [AHPDelivery]] = [:]
        var sends: [Task<Void, Error>] = []
        do {
            for step in scenario["steps"] as! [[String: Any]] {
                let op = step["op"] as! String
                let channel = step["channel"] as? String ?? ""
                switch op {
                case "subscribe":
                    let window = step["window"] as? [String: Int]
                    let options: AHPSubscriptionOptions = window.map {
                        .windowed(windowBytes: $0["windowBytes"], maximumFrameBytes: $0["maximumFrameBytes"],
                                  receive: step["receive"] as? String == "manual" ? .manual : .auto,
                                  coalescing: step["coalescing"] as? Bool ?? true)
                    } ?? .init()
                    subscriptions[channel] = Task { try await client.subscribe(channel, options: options) }
                case "respond":
                    let id = try await recorder.requestId(step["to"] as! String)
                    let response: [String: Any] = ["jsonrpc": "2.0", "id": id, "result": step["result"]!]
                    try await host.send(.binary(JSONSerialization.data(withJSONObject: response)))
                case "hostSends":
                    try await host.send(.text(step["text"] as! String))
                case "hostCreditsAll":
                    let bytes = await recorder.sentBytes(channel)
                    try await host.send(makeNotificationWire(method: "channel/credit",
                        params: ChannelCreditParams(channel: channel, consumedBytes: bytes)))
                case "expectSent":
                    let match = step["match"] as! [String: Any]
                    let object: [String: Any]
                    if step["reassemble"] as? Bool == true {
                        var joined = ""
                        let targetChannel = (match["params"] as! [String: Any])["channel"] as! String
                        let sub = try await subscriptions[targetChannel]!.value
                        let cap = await sub.status().limits!.hostReceive.maximumFrameBytes
                        while true {
                            let (text, message) = try await recorder.take(["method": "channel/frame"])
                            guard ahpUTF16Bytes(text) <= cap else { throw CorpusFailure("oversized outbound frame") }
                            let p = message["params"] as! [String: Any]
                            joined += p["data"] as! String
                            if p["final"] as? Bool == true { break }
                        }
                        object = try JSONSerialization.jsonObject(with: Data(joined.utf8)) as! [String: Any]
                        guard matches(object, match) else { throw CorpusFailure("joined data does not match") }
                    } else { object = try await recorder.take(match).1 }
                    for path in step["absent"] as? [String] ?? [] {
                        guard lookup(object, path) == nil else { throw CorpusFailure("unexpected \(path)") }
                    }
                case "expectNotSent":
                    let duration = Duration.milliseconds(step["withinMs"] as! Int)
                    let deadline = ContinuousClock.now + duration
                    while ContinuousClock.now < deadline {
                        guard await !recorder.contains(step["match"]!) else {
                            throw CorpusFailure("unexpected sent message \(step["match"]!)")
                        }
                        try await Task.sleep(for: .milliseconds(2))
                    }
                case "next":
                    let sub = try await subscriptions[channel]!.value
                    guard let item = try await corpusTimeout({ try await sub.next() }) else {
                        throw CorpusFailure("subscription ended")
                    }
                    let p = try JSONSerialization.jsonObject(with: item.message.paramsJSON)
                    let object: [String: Any] = ["method": item.message.method, "params": p]
                    guard matches(object, step["expect"]!) else { throw CorpusFailure("delivery mismatch: \(object)") }
                    if let expected = step["expectBytes"] as? Int, expected != item.receivedBytes {
                        throw CorpusFailure("delivery size \(item.receivedBytes), expected \(expected)")
                    }
                    deliveries[channel, default: []].append(item)
                case "advance":
                    let sub = try await subscriptions[channel]!.value
                    await sub.advance()
                case "release":
                    await deliveries[channel]![step["index"] as! Int].release()
                case "unsubscribe":
                    let sub = try await subscriptions[channel]!.value
                    try await sub.close()
                case "send":
                    let sub = try await subscriptions[channel]!.value
                    let message = try AHPNotificationMessage(
                        method: step["method"] as! String,
                        paramsJSON: JSONSerialization.data(withJSONObject: step["params"]!))
                    sends.append(Task { try await sub.send(message) })
                    // Ensure admission order without waiting for blocked transport completion.
                    try await Task.sleep(for: .milliseconds(5))
                case "expectStatus":
                    let sub = try await subscriptions[channel]!.value
                    try await corpusTimeout {
                        while true {
                            let value = try JSONSerialization.jsonObject(with: JSONEncoder().encode(await sub.status()))
                            if matches(value, step["match"]!) { return }
                            try await Task.sleep(for: .milliseconds(1))
                        }
                    }
                case "expectClosed":
                    try await corpusTimeout {
                        while await client.connectionState != .disconnected {
                            try await Task.sleep(for: .milliseconds(1))
                        }
                    }
                default: throw CorpusFailure("unsupported corpus op \(op)")
                }
            }
        } catch {
            await client.shutdown(); try? await host.close(); pump.cancel()
            for task in subscriptions.values { task.cancel() }
            for task in sends { task.cancel(); _ = try? await task.value }
            throw error
        }
        await client.shutdown(); try? await host.close(); pump.cancel()
        for task in subscriptions.values { task.cancel() }
        for task in sends { task.cancel(); _ = try? await task.value }
    }
}

actor CorpusRecorder {
    private struct ChangeWaiter {
        let continuation: CheckedContinuation<Void, Error>
        let timer: Task<Void, Never>
    }
    private let timeout: Duration
    private var changeWaiters: [UUID: ChangeWaiter] = [:]
    private var finished = false
    var messages: [(String, [String: Any])] = []
    var all: [(String, [String: Any])] = []
    var unanswered: [(Int, String)] = []

    init(timeout: Duration = .seconds(1)) { self.timeout = timeout }

    func append(_ text: String) {
        let object = try! JSONSerialization.jsonObject(with: Data(text.utf8)) as! [String: Any]
        messages.append((text, object)); all.append((text, object))
        if let id = object["id"] as? Int, let method = object["method"] as? String {
            unanswered.append((id, method))
        }
        wakeAll()
    }

    func finish() {
        finished = true
        wakeAll()
    }

    private func wakeAll() {
        let waiters = changeWaiters.values
        changeWaiters.removeAll()
        for waiter in waiters {
            waiter.timer.cancel()
            waiter.continuation.resume()
        }
    }
    func requestId(_ method: String) async throws -> Int {
        let deadline = ContinuousClock.now + timeout
        while true {
            try Task.checkCancellation()
            if let i = unanswered.firstIndex(where: { $0.1 == method }) {
                return unanswered.remove(at: i).0
            }
            guard !finished else { throw CorpusFailure("transport closed waiting for unanswered \(method)") }
            guard ContinuousClock.now < deadline else { throw CorpusFailure("no unanswered \(method)") }
            try await waitForChange(until: deadline)
        }
    }
    func take(_ match: [String: Any]) async throws -> (String, [String: Any]) {
        let deadline = ContinuousClock.now + timeout
        while true {
            try Task.checkCancellation()
            if !messages.isEmpty {
                let item = messages.removeFirst()
                if matches(item.1, match) { return item }
                if item.1["method"] as? String == "channel/credit" { continue }
                throw CorpusFailure("unexpected sent message \(item.1), expected \(match)")
            }
            guard !finished else { throw CorpusFailure("transport closed waiting for \(match)") }
            guard ContinuousClock.now < deadline else { throw CorpusFailure("timed out waiting for \(match)") }
            try await waitForChange(until: deadline)
        }
    }

    private func waitForChange(until deadline: ContinuousClock.Instant) async throws {
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let timer = Task { [weak self] in
                    try? await Task.sleep(until: deadline, clock: .continuous)
                    if !Task.isCancelled { await self?.wake(id) }
                }
                changeWaiters[id] = ChangeWaiter(continuation: continuation, timer: timer)
            }
        } onCancel: {
            Task { await self.cancelWait(id) }
        }
    }

    private func wake(_ id: UUID) {
        guard let waiter = changeWaiters.removeValue(forKey: id) else { return }
        waiter.timer.cancel()
        waiter.continuation.resume()
    }

    private func cancelWait(_ id: UUID) {
        guard let waiter = changeWaiters.removeValue(forKey: id) else { return }
        waiter.timer.cancel()
        waiter.continuation.resume(throwing: CancellationError())
    }
    func contains(_ match: Any) -> Bool { messages.contains { matches($0.1, match) } }
    func allMethods() -> [String] { all.compactMap { $0.1["method"] as? String } }
    func sentBytes(_ channel: String) -> Int {
        all.reduce(0) { sum, item in
            guard item.1["id"] == nil, let method = item.1["method"] as? String,
                  countsAgainstWindow(method),
                  (item.1["params"] as? [String: Any])?["channel"] as? String == channel else { return sum }
            return sum + ahpUTF16Bytes(item.0)
        }
    }
}

private func matches(_ value: Any, _ expected: Any) -> Bool {
    if let e = expected as? [String: Any], let v = value as? [String: Any] {
        return e.allSatisfy { key, value in v[key].map { matches($0, value) } ?? false }
    }
    return (value as? NSObject)?.isEqual(expected) ?? false
}
private func lookup(_ object: [String: Any], _ path: String) -> Any? {
    var current: Any = object
    for key in path.split(separator: ".") {
        guard let next = (current as? [String: Any])?[String(key)] else { return nil }
        current = next
    }
    return current
}
private struct CorpusFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}
func corpusTimeout<T: Sendable>(timeout: Duration = .seconds(1),
                                _ body: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await body() }
        group.addTask { try await Task.sleep(for: timeout); throw CorpusFailure("step timed out") }
        defer { group.cancelAll() }
        return try await group.next()!
    }
}
