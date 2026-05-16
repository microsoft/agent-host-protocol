// URLSessionWebSocketTransport — default WebSocket transport.
//
// Wraps `URLSessionWebSocketTask`. Suitable for `wss://` deployments and
// `ws://` targets where ATS isn't a problem. Consumers that need native
// Network.framework behavior for `ws://` LAN/Tailscale targets can use
// `NWConnectionWebSocketTransport`.

import Foundation

/// Default WebSocket transport built on `URLSessionWebSocketTask`.
public final class URLSessionWebSocketTransport: AHPTransport, @unchecked Sendable {
    private let url: URL
    private let headers: [String: String]
    private let session: URLSession

    private let lock = NSLock()
    private var task: URLSessionWebSocketTask?
    private var closed = false

    /// Creates a new WebSocket transport. The connection is opened lazily on
    /// the first call to `send` or `recv`.
    public init(
        url: URL,
        headers: [String: String] = [:],
        session: URLSession = .shared
    ) {
        self.url = url
        self.headers = headers
        self.session = session
    }

    public func send(_ message: TransportMessage) async throws {
        let task = try ensureTask()
        let wsMessage: URLSessionWebSocketTask.Message
        switch message {
        case .text(let s):
            wsMessage = .string(s)
        case .binary(let data):
            wsMessage = .data(data)
        case .parsed(let parsed):
            // Re-encode and send as text. WebSocket peers vary in whether they
            // accept text vs binary JSON; text is the lowest-friction choice.
            let encoded = try TransportMessage.encode(parsed)
            try await send(encoded)
            return
        }
        do {
            try await task.send(wsMessage)
        } catch {
            throw mapError(error)
        }
    }

    public func recv() async throws -> TransportMessage? {
        let task = try ensureTask()
        do {
            let message = try await task.receive()
            switch message {
            case .data(let data):
                return .binary(data)
            case .string(let s):
                return .text(s)
            @unknown default:
                throw TransportError.protocol("unknown WebSocket frame kind")
            }
        } catch {
            // Distinguish a clean close from an abnormal one. URLSession
            // throws on close instead of returning nil.
            if isCleanClose(error: error, task: task) {
                return nil
            }
            throw mapError(error)
        }
    }

    public func close() async throws {
        let task = clearTaskAndMarkClosed()
        // 1000 (normal closure) is the conventional value for client-initiated
        // close. Leaving the reason empty is fine.
        task?.cancel(with: .normalClosure, reason: nil)
    }

    // MARK: - Helpers

    private func clearTaskAndMarkClosed() -> URLSessionWebSocketTask? {
        lock.lock(); defer { lock.unlock() }
        let task = self.task
        self.task = nil
        closed = true
        return task
    }

    private func ensureTask() throws -> URLSessionWebSocketTask {
        lock.lock()
        defer { lock.unlock() }
        if closed { throw TransportError.closed }
        if let task { return task }
        var request = URLRequest(url: url)
        for (k, v) in headers {
            request.setValue(v, forHTTPHeaderField: k)
        }
        let task = session.webSocketTask(with: request)
        task.resume()
        self.task = task
        return task
    }

    private func isCleanClose(error: Error, task: URLSessionWebSocketTask) -> Bool {
        // Our own `close()` cancels the task with `.normalClosure`; that
        // surfaces as `URLError(.cancelled)` from `receive()`.
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return true
        }
        // The peer closing also surfaces as a thrown error; check the close
        // code. Only whitelist explicitly-clean codes — everything else is an
        // abnormal closure that the consumer should treat as a transport
        // failure (e.g. so a higher-layer reconnect supervisor can retry).
        switch task.closeCode {
        case .normalClosure, .goingAway, .noStatusReceived:
            return true
        default:
            return false
        }
    }

    private func mapError(_ error: Error) -> TransportError {
        if let transportError = error as? TransportError {
            return transportError
        }
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return .closed
        }
        return .io(nsError.localizedDescription)
    }
}
