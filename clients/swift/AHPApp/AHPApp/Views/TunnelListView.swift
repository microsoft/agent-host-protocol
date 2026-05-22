import DevTunnelsClient
import Security
import SwiftUI
import UIKit

// MARK: - Tunnel + Identifiable

extension Tunnel: @retroactive Identifiable {
    public var id: String { tunnelId ?? UUID().uuidString }

    /// Tunnel labels used by VS Code's CLI to mark service-owned tunnels.
    /// These are infrastructure tags, not user-visible names, so we filter
    /// them out when picking a friendly label for display.
    /// Source: `cli/src/tunnels/dev_tunnels.rs` in microsoft/vscode.
    private static let vscodeReservedLabels: Set<String> = [
        "vscode-server-launcher",
        "vscode-port-forward",
    ]

    /// Human-readable display name. Prefers (in order): the tunnel's `name`
    /// field, the first non-reserved entry in `labels` (VS Code's CLI stores
    /// the user-facing machine name there), and finally the tunnel ID.
    var displayName: String {
        if let name, !name.isEmpty { return name }
        if let labels {
            if let friendly = labels.first(where: { !$0.isEmpty && !Self.vscodeReservedLabels.contains($0) }) {
                return friendly
            }
        }
        return tunnelId ?? ""
    }
}

// MARK: - Token Storage

/// Persists the GitHub access token in the iOS Keychain so it survives
/// across sheet presentations and app launches.
enum TunnelTokenStore {
    private static let service = "com.rebornix.AHPApp.DevTunnels"
    private static let account = "github-token"

    static func save(_ token: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var addQuery = query
        addQuery[kSecValueData as String] = data
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8)
        else { return nil }
        return token
    }

    static func delete() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

let tunnelAuthenticationExpiredMessage = "GitHub sign-in expired. Sign in again to browse or connect to Dev Tunnels."
let tunnelConnectTokenUnavailableMessage = "Couldn't acquire a Dev Tunnel connect token. Sign in again from Dev Tunnels."
let tunnelEndpointUnavailableMessage = "Couldn't find a Dev Tunnel endpoint for the Agent Host port. Restart the tunnel and try again."

func isTunnelAuthenticationFailure(_ error: Error) -> Bool {
    let nsError = error as NSError
    if nsError.code == 401 || nsError.code == 403 {
        return true
    }

    let description = error.localizedDescription.lowercased()
    return description.contains("401")
        || description.contains("403")
        || description.contains("unauthorized")
        || description.contains("forbidden")
}

func isTunnelReauthenticationMessage(_ message: String?) -> Bool {
    guard let message else { return false }
    return message == tunnelAuthenticationExpiredMessage
        || message == tunnelConnectTokenUnavailableMessage
}

func encodeTunnelDeviceCodeResponse(_ response: DeviceCodeResponse) -> String? {
    guard let data = try? JSONEncoder().encode(response) else { return nil }
    return String(data: data, encoding: .utf8)
}

func decodeTunnelDeviceCodeResponse(_ json: String) -> DeviceCodeResponse? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(DeviceCodeResponse.self, from: data)
}

func isTunnelDeviceCodeResponseExpired(
    _ response: DeviceCodeResponse,
    startedAt: Date,
    now: Date = Date()
) -> Bool {
    now.timeIntervalSince(startedAt) >= TimeInterval(response.expiresIn)
}

// MARK: - TunnelListView

/// View for browsing Dev Tunnels and initiating device code authentication.
struct TunnelListView: View {
    var startsAuthenticationOnAppear = false
    var onAuthenticated: (() -> Void)?
    /// Called when the user selects a tunnel port to use as an AHP server.
    var onConnectToTunnel: ((ServerConfiguration) -> Void)?

    @State private var tunnels: [Tunnel] = []
    @State private var accessToken: String = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    // Device code auth state
    @State private var deviceCodeResponse: DeviceCodeResponse?
    @State private var isPolling = false
    @State private var authMessage: String?
    @SceneStorage("tunnelDeviceCodeResponseJSON") private var storedDeviceCodeResponseJSON: String?
    @SceneStorage("tunnelDeviceCodeStartedAt") private var storedDeviceCodeStartedAt: Double = 0

    var body: some View {
        List {
            authSection
            if !accessToken.isEmpty {
                tunnelListSection
            }
        }
        .navigationTitle("Dev Tunnels")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await loadTunnels()
        }
        .task {
            await restoreAuthenticationState()
        }
    }

    // MARK: - Auth Section

    @ViewBuilder
    private var authSection: some View {
        Section {
            if accessToken.isEmpty {
                if let dcr = deviceCodeResponse {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Sign in with GitHub")
                            .font(.headline)
                        Text("Go to **\(dcr.verificationUri)** and enter:")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(dcr.userCode)
                            .font(.system(.title, design: .monospaced, weight: .bold))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 4)

                        HStack(spacing: 8) {
                            Button {
                                UIPasteboard.general.string = dcr.userCode
                            } label: {
                                Label("Copy Code", systemImage: "doc.on.doc")
                                    .font(.subheadline.weight(.medium))
                                    .frame(maxWidth: .infinity)
                            }

                            if let url = URL(string: dcr.verificationUri) {
                                Link(destination: url) {
                                    Label("Open GitHub", systemImage: "arrow.up.forward")
                                        .font(.subheadline.weight(.medium))
                                        .frame(maxWidth: .infinity)
                                }
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .buttonBorderShape(.roundedRectangle(radius: 10))
                        .padding(.top, 4)

                        if isPolling {
                            HStack {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Waiting for authorization…")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        if let msg = authMessage {
                            Text(msg)
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Button {
                            Task { await startAuth() }
                        } label: {
                            Label("Sign in with GitHub", systemImage: "person.badge.key")
                        }

                        if let msg = authMessage {
                            Text(msg)
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }
                }
            } else {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Authenticated")
                    Spacer()
                    Button("Sign Out") {
                        TunnelTokenStore.delete()
                        accessToken = ""
                        tunnels = []
                        deviceCodeResponse = nil
                        authMessage = nil
                        clearPendingDeviceCodeResponse()
                    }
                    .font(.caption)
                    .buttonStyle(.borderless)
                }
            }
        } header: {
            Text("Authentication")
        }
    }

    // MARK: - Tunnel List Section

    @ViewBuilder
    private var tunnelListSection: some View {
        Section {
            if isLoading {
                HStack {
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading tunnels…")
                        .foregroundStyle(.secondary)
                }
            } else if tunnels.isEmpty {
                Text("No tunnels found")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(tunnels) { tunnel in
                    NavigationLink {
                        TunnelDetailView(
                            tunnel: tunnel,
                            accessToken: accessToken,
                            onConnectToTunnel: onConnectToTunnel
                        )
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tunnel.displayName)
                                    .font(.body)
                                Text("\(tunnel.clusterId ?? "") · \(tunnel.tunnelId ?? "")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if onConnectToTunnel != nil {
                                Button("Connect") {
                                    connectTunnel(tunnel)
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                            }
                        }
                    }
                }
            }

            if let err = errorMessage {
                Label(err, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .font(.caption)
            }
        } header: {
            Text("Tunnels")
        }
    }

    // MARK: - Actions

    private func storePendingDeviceCodeResponse(_ response: DeviceCodeResponse) {
        storedDeviceCodeResponseJSON = encodeTunnelDeviceCodeResponse(response)
        storedDeviceCodeStartedAt = Date().timeIntervalSince1970
    }

    private func clearPendingDeviceCodeResponse() {
        storedDeviceCodeResponseJSON = nil
        storedDeviceCodeStartedAt = 0
    }

    private func restoredPendingDeviceCodeResponse() -> DeviceCodeResponse? {
        guard let json = storedDeviceCodeResponseJSON,
              let response = decodeTunnelDeviceCodeResponse(json) else {
            clearPendingDeviceCodeResponse()
            return nil
        }

        if storedDeviceCodeStartedAt > 0,
           isTunnelDeviceCodeResponseExpired(
               response,
               startedAt: Date(timeIntervalSince1970: storedDeviceCodeStartedAt)
           ) {
            clearPendingDeviceCodeResponse()
            authMessage = "Code expired. Please try again."
            return nil
        }

        return response
    }

    private func restoreAuthenticationState() async {
        if let saved = TunnelTokenStore.load() {
            accessToken = saved
            clearPendingDeviceCodeResponse()
            await loadTunnels()
            if startsAuthenticationOnAppear,
               !accessToken.isEmpty,
               deviceCodeResponse == nil,
               !isPolling,
               errorMessage == nil {
                onAuthenticated?()
            }
            return
        }

        if let pendingResponse = restoredPendingDeviceCodeResponse() {
            deviceCodeResponse = pendingResponse
            authMessage = "Finish signing in in Safari. We'll keep checking here."
            await resumePollingIfNeeded(with: pendingResponse)
            return
        }

        guard startsAuthenticationOnAppear else { return }
        await startAuth()
    }

    private func resumePollingIfNeeded(with response: DeviceCodeResponse) async {
        guard !isPolling else { return }
        isPolling = true
        await pollForToken(response: response)
    }

    private func expireAuthentication(message: String = tunnelAuthenticationExpiredMessage) {
        TunnelTokenStore.delete()
        accessToken = ""
        tunnels = []
        deviceCodeResponse = nil
        isPolling = false
        errorMessage = nil
        authMessage = message
        clearPendingDeviceCodeResponse()
    }

    private func startAuth() async {
        guard !isPolling else { return }
        do {
            let response = try await DeviceCodeAuth().start()
            deviceCodeResponse = response
            storePendingDeviceCodeResponse(response)
            authMessage = nil
            await resumePollingIfNeeded(with: response)
        } catch {
            authMessage = error.localizedDescription
        }
    }

    private func pollForToken(response: DeviceCodeResponse) async {
        let interval = UInt64(max(response.interval, 1)) * 1_000_000_000
        while isPolling {
            try? await Task.sleep(nanoseconds: interval)
            do {
                let result = try await DeviceCodeAuth().poll(deviceCode: response.deviceCode)
                switch result {
                case .accessToken(let token):
                    accessToken = token
                    TunnelTokenStore.save(token)
                    isPolling = false
                    deviceCodeResponse = nil
                    authMessage = nil
                    clearPendingDeviceCodeResponse()
                    if let onAuthenticated {
                        onAuthenticated()
                    } else {
                        await loadTunnels()
                    }
                case .pending:
                    continue
                case .expired:
                    authMessage = "Code expired. Please try again."
                    isPolling = false
                    deviceCodeResponse = nil
                    clearPendingDeviceCodeResponse()
                case .error(let message):
                    authMessage = message
                    isPolling = false
                    clearPendingDeviceCodeResponse()
                }
            } catch {
                authMessage = error.localizedDescription
                isPolling = false
            }
        }
    }

    private func loadTunnels() async {
        guard !accessToken.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        do {
            let client = TunnelManagementClient(accessToken: accessToken)
            tunnels = try await client.listTunnels()
            authMessage = nil
            isLoading = false
        } catch {
            if isTunnelAuthenticationFailure(error) {
                expireAuthentication()
                if startsAuthenticationOnAppear {
                    await startAuth()
                }
            } else {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    /// Connect directly to a tunnel's AHP port (31546), fetching the connect
    /// access token in the background.
    private func connectTunnel(_ tunnel: Tunnel) {
        Task {
            let port = TunnelDetailView.agentHostPort
            let tunnelId = tunnel.tunnelId ?? ""
            let clusterId = tunnel.clusterId ?? ""
            var connectToken: String?
            do {
                let client = TunnelManagementClient(accessToken: accessToken)
                let detail = try await client.getTunnel(
                    clusterId: clusterId,
                    tunnelId: tunnelId,
                    options: TunnelRequestOptions(
                        includePorts: true,
                        tokenScopes: [TunnelAccessScopes.connect]
                    )
                )
                connectToken = TunnelConnection.connectToken(from: detail)
            } catch {
                if isTunnelAuthenticationFailure(error) {
                    await MainActor.run {
                        expireAuthentication()
                    }
                    return
                }
                print("[AHP] Warning: failed to fetch connect token: \(error)")
            }
            let host = "\(tunnelId)-\(port).\(clusterId).devtunnels.ms"
            guard let connectToken, !connectToken.isEmpty else {
                await MainActor.run {
                    authMessage = tunnelConnectTokenUnavailableMessage
                }
                return
            }
            let server = ServerConfiguration(
                name: tunnel.displayName,
                scheme: "wss",
                host: host,
                token: accessToken,
                tunnelId: tunnelId,
                clusterId: clusterId,
                connectAccessToken: connectToken
            )
            onConnectToTunnel?(server)
        }
    }
}

// MARK: - Tunnel Detail

struct TunnelDetailView: View {
    /// Agent Host Protocol port, matching VS Code's convention.
    static let agentHostPort = 31546

    let tunnel: Tunnel
    let accessToken: String
    var onConnectToTunnel: ((ServerConfiguration) -> Void)?

    @State private var detail: Tunnel?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section("Info") {
                LabeledContent("Name", value: tunnel.displayName)
                LabeledContent("Tunnel ID", value: tunnel.tunnelId ?? "")
                LabeledContent("Cluster", value: tunnel.clusterId ?? "")
            }

            if isLoading {
                Section {
                    HStack {
                        ProgressView().controlSize(.small)
                        Text("Loading details…").foregroundStyle(.secondary)
                    }
                }
            } else if let detail {
                if let relayUri = TunnelConnection.clientRelayURI(from: detail) {
                    Section("Relay") {
                        Text(relayUri)
                            .font(.caption)
                            .textSelection(.enabled)
                    }
                }

                Section("Ports") {
                    let ports = detail.ports ?? []
                    if ports.isEmpty {
                        Text("No ports configured")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(sortedPorts(ports), id: \.self) { port in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text("Port \(port)")
                                            .font(.body)
                                        if port == TunnelDetailView.agentHostPort {
                                            Text("AHP")
                                                .font(.caption2.weight(.semibold))
                                                .padding(.horizontal, 5)
                                                .padding(.vertical, 1)
                                                .background(.blue.opacity(0.15))
                                                .foregroundStyle(.blue)
                                                .clipShape(Capsule())
                                        }
                                    }
                                    Text("\(tunnel.tunnelId ?? "")-\(port).\(tunnel.clusterId ?? "").devtunnels.ms")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if onConnectToTunnel != nil {
                                    Button("Connect") {
                                        connectToPort(port)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                }
                            }
                        }
                    }
                }
            }

            if let err = errorMessage {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle(tunnel.displayName)
        .task {
            await loadDetail()
        }
    }

    /// Sort ports so the AHP port (31546) appears first.
    private func sortedPorts(_ ports: [TunnelPort]) -> [Int] {
        ports.map { Int($0.portNumber) }.sorted { a, b in
            if a == Self.agentHostPort { return true }
            if b == Self.agentHostPort { return false }
            return a < b
        }
    }

    private func connectToPort(_ port: Int) {
        let tunnelId = tunnel.tunnelId ?? ""
        let clusterId = tunnel.clusterId ?? ""
        let host = "\(tunnelId)-\(port).\(clusterId).devtunnels.ms"
        guard let connectToken = detail.flatMap({ TunnelConnection.connectToken(from: $0) }),
              !connectToken.isEmpty else {
            errorMessage = tunnelConnectTokenUnavailableMessage
            return
        }
        let server = ServerConfiguration(
            name: tunnel.displayName,
            scheme: "wss",
            host: host,
            token: accessToken,
            tunnelId: tunnelId,
            clusterId: clusterId,
            connectAccessToken: connectToken
        )
        onConnectToTunnel?(server)
    }

    private func loadDetail() async {
        do {
            let client = TunnelManagementClient(accessToken: accessToken)
            detail = try await client.getTunnel(
                clusterId: tunnel.clusterId ?? "",
                tunnelId: tunnel.tunnelId ?? "",
                options: TunnelRequestOptions(
                    includePorts: true,
                    tokenScopes: [TunnelAccessScopes.connect]
                )
            )
            isLoading = false
        } catch {
            errorMessage = isTunnelAuthenticationFailure(error)
                ? tunnelAuthenticationExpiredMessage
                : error.localizedDescription
            isLoading = false
        }
    }
}
