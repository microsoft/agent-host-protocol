// A small in-memory AHP host for the windowing examples.
//
// It implements only what the examples need: `initialize`, a windowed
// `subscribe` to one terminal, and the host side of the window rules:
//
// - It counts every data message it sends, in UTF-16 bytes, and stops while
//   `sent - consumed` is at or above the client's window.
// - It counts every data message the client sends, and returns
//   `channel/credit` after it has processed each one.
//
// A real host applies the same rules to every windowed subscription.

import AgentHostProtocol
import AgentHostProtocolClient
import Foundation

public struct DemoHostOptions: Sendable {
    /// The largest window the host accepts for data that it sends.
    public var clientWindowBytes: Int
    /// The window the host offers for data that the client sends.
    public var hostWindowBytes: Int
    /// How long the host takes to process one message from the client.
    public var inputDelay: Duration

    public init(clientWindowBytes: Int, hostWindowBytes: Int, inputDelay: Duration = .zero) {
        self.clientWindowBytes = clientWindowBytes
        self.hostWindowBytes = hostWindowBytes
        self.inputDelay = inputDelay
    }
}

private let maximumFrameBytes = 16_384
private func utf16Bytes(_ text: String) -> Int { text.utf16.count * 2 }
private func log(_ message: String) { print("  host   | \(message)") }

private struct Notification<Params: Encodable>: Encodable {
    var jsonrpc = "2.0"
    var method: String
    var params: Params
}

private struct Response<Result: Encodable>: Encodable {
    var jsonrpc = "2.0"
    var id: Int
    var result: Result
}

private struct PendingInput: Sendable {
    let bytes: Int
    let action: StateAction
}

public actor DemoHost {
    /// The half of the transport to give to `AHPClient`.
    public nonisolated let clientTransport: InMemoryTransport
    /// Terminal input that the host has processed, in order.
    public private(set) var receivedInput = ""

    private let options: DemoHostOptions
    private let transport: InMemoryTransport
    private let encoder: JSONEncoder
    private var limits: ChannelFlowControl?
    private var channel = ""
    private var serverSeq = 0
    private var subscribed = false
    private var subscribedWaiters: [CheckedContinuation<Void, Never>] = []

    // Data that the host sends to the client.
    private var sentBytes = 0
    private var consumedBytes = 0
    private var creditWaiter: CheckedContinuation<Void, Never>?

    // Data that the client sends to the host.
    private var receivedBytes = 0
    private var processedBytes = 0
    private let inputs: AsyncStream<PendingInput>.Continuation

    public init(_ options: DemoHostOptions) {
        self.options = options
        (clientTransport, transport) = InMemoryTransport.pair()
        // Byte counts depend only on the serialized text, so a stable key order
        // and unescaped slashes match what other AHP implementations send.
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let (pending, inputs) = AsyncStream.makeStream(of: PendingInput.self)
        self.inputs = inputs

        Task { await self.run() }
        // Process input one message at a time, then return credit for it.
        Task {
            for await input in pending {
                try? await Task.sleep(for: options.inputDelay)
                await self.processed(input)
            }
        }
    }

    /// Returns after the host has accepted the subscription and sent the snapshot.
    public func whenSubscribed() async {
        if subscribed { return }
        await withCheckedContinuation { subscribedWaiters.append($0) }
    }

    /// Send one terminal action, first waiting for credit if the client's window is full.
    public func sendAction(_ action: StateAction) async {
        guard let limits else { preconditionFailure("sendAction before the subscription was accepted") }
        let window = limits.clientReceive.windowBytes
        if sentBytes - consumedBytes >= window {
            log("window full (\(sentBytes - consumedBytes) of \(window) bytes outstanding); pausing output")
            while sentBytes - consumedBytes >= window {
                await withCheckedContinuation { creditWaiter = $0 }
            }
            log("credit received (consumedBytes=\(consumedBytes)); resuming output")
        }
        serverSeq += 1
        await sendData(Notification(method: "action", params: ActionEnvelope(
            channel: channel, action: action, serverSeq: serverSeq)))
    }

    public func close() async {
        inputs.finish()
        try? await transport.close()
    }

    private func serialize(_ message: some Encodable) -> String {
        // The host only encodes generated protocol models, which always encode.
        String(decoding: try! encoder.encode(message), as: UTF8.self)
    }

    private func sendData(_ message: some Encodable) async {
        let text = serialize(message)
        sentBytes += utf16Bytes(text)
        try? await transport.send(.text(text))
    }

    private func sendControl(_ message: some Encodable) async {
        try? await transport.send(.text(serialize(message)))
    }

    private func run() async {
        while let frame = try? await transport.recv() {
            guard case .text(let text) = frame,
                  let message = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                  let method = message["method"] as? String,
                  let params = message["params"] as? [String: Any],
                  let paramsJSON = try? JSONSerialization.data(withJSONObject: params)
            else { continue }
            switch method {
            case "initialize":
                guard let id = message["id"] as? Int else { continue }
                await sendControl(Response(id: id, result: InitializeResult(
                    protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0], serverSeq: 0, snapshots: [])))
            case "subscribe":
                guard let id = message["id"] as? Int,
                      let request = try? JSONDecoder().decode(SubscribeParams.self, from: paramsJSON)
                else { continue }
                await acceptSubscription(id: id, request: request)
            case "channel/credit":
                // Credit is a running total, so ignore values that are not larger.
                if let consumed = params["consumedBytes"] as? Int, consumed > consumedBytes {
                    consumedBytes = consumed
                    creditWaiter?.resume()
                    creditWaiter = nil
                }
            case "dispatchAction":
                if let request = try? JSONDecoder().decode(DispatchActionParams.self, from: paramsJSON) {
                    receiveInput(text, action: request.action)
                }
            default:
                break
            }
        }
    }

    private func acceptSubscription(id: Int, request: SubscribeParams) async {
        guard let offered = request.flowControl?.receive else {
            preconditionFailure("the examples expect a windowed subscribe")
        }
        channel = request.channel
        // A host can lower the limits that the client offered, but never raise them.
        let limits = ChannelFlowControl(
            clientReceive: ChannelReceiveLimits(
                windowBytes: min(offered.windowBytes, options.clientWindowBytes),
                maximumFrameBytes: min(offered.maximumFrameBytes, maximumFrameBytes)),
            hostReceive: ChannelReceiveLimits(
                windowBytes: options.hostWindowBytes, maximumFrameBytes: maximumFrameBytes))
        self.limits = limits
        log("accepted windowed delivery: client window \(limits.clientReceive.windowBytes) bytes "
            + "(offered \(offered.windowBytes)), host window \(limits.hostReceive.windowBytes) bytes")
        await sendControl(Response(id: id, result: SubscribeResult(flowControl: limits)))

        // The first data message on a windowed subscription is always the snapshot.
        let state = TerminalState(
            title: "demo shell",
            content: [],
            lifecycle: .running(TerminalRunningLifecycleState(status: .running)),
            claim: .client(TerminalClientClaim(kind: .client, clientId: "windowing-example")))
        await sendData(Notification(method: "channel/snapshot", params: ChannelSnapshotParams(
            channel: channel,
            snapshot: Snapshot(resource: channel, state: .terminal(state), fromSeq: serverSeq))))

        subscribed = true
        for waiter in subscribedWaiters { waiter.resume() }
        subscribedWaiters.removeAll()
    }

    private func receiveInput(_ text: String, action: StateAction) {
        let bytes = utf16Bytes(text)
        receivedBytes += bytes
        if let limits = limits?.hostReceive,
           // The client can go past the window only with the message that fills it.
           receivedBytes - processedBytes > limits.windowBytes + limits.maximumFrameBytes {
            log("client went past the host window")
        }
        inputs.yield(PendingInput(bytes: bytes, action: action))
    }

    private func processed(_ input: PendingInput) async {
        if case .terminalInput(let terminalInput) = input.action {
            receivedInput += terminalInput.data
        }
        processedBytes += input.bytes
        await sendControl(Notification(method: "channel/credit", params: ChannelCreditParams(
            channel: channel, consumedBytes: processedBytes)))
    }
}
