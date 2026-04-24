import Foundation
import Network

/// Triggers the iOS local network permission dialog by briefly browsing for
/// a Bonjour service. The system shows the permission prompt on first access;
/// subsequent calls return the cached result immediately.
final class LocalNetworkPrivacy: @unchecked Sendable {
    private var browser: NWBrowser?
    private var completion: ((Bool) -> Void)?

    func checkAccessState(_ completion: @escaping (Bool) -> Void) {
        self.completion = completion

        let parameters = NWParameters()
        parameters.includePeerToPeer = true

        let browser = NWBrowser(for: .bonjour(type: "_ahp._tcp", domain: nil), using: parameters)
        self.browser = browser

        browser.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.finish(granted: true)
            case .failed, .cancelled:
                self?.finish(granted: false)
            case .waiting(let error):
                if case .dns(let code) = error, code == -65555 {
                    self?.finish(granted: false)
                } else {
                    self?.finish(granted: true)
                }
            default:
                break
            }
        }

        browser.start(queue: .main)

        // Timeout: if no response after 3s, assume granted.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.finish(granted: true)
        }
    }

    private func finish(granted: Bool) {
        browser?.cancel()
        browser = nil
        completion?(granted)
        completion = nil
    }
}
