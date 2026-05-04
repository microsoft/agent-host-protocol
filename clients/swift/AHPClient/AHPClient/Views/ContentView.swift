import SwiftUI

/// Root view: sidebar (session list) + detail (chat).
struct ContentView: View {
    @Environment(AppStore.self) private var store
    @State private var showSettings = false
    @State private var showingTunnelReauthentication = false
    @State private var navigationPath: [String] = []

    private var canReauthenticateTunnelFromError: Bool {
        store.selectedServer?.isTunnel == true
            && isTunnelReauthenticationMessage(store.errorMessage)
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            SidebarView(
                navigationPath: $navigationPath,
                onShowSettings: { showSettings = true }
            )
                .navigationDestination(for: String.self) { value in
                    if value.hasPrefix("folder:") {
                        let path = String(value.dropFirst("folder:".count))
                        FolderSessionsView(folderPath: path, navigationPath: $navigationPath)
                    } else {
                        ChatView()
                    }
                }
        }
        .onChange(of: store.selectedSessionURI) { _, newValue in
            if let uri = newValue {
                if navigationPath.last != uri {
                    navigationPath = [uri]
                }
            } else {
                navigationPath = []
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environment(store)
        }
        .sheet(isPresented: $showingTunnelReauthentication) {
            NavigationStack {
                TunnelListView(
                    startsAuthenticationOnAppear: true,
                    onAuthenticated: {
                        showingTunnelReauthentication = false
                        Task { await store.connect(debugTrigger: "tunnel reauth") }
                    }
                )
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingTunnelReauthentication = false }
                    }
                }
            }
        }
        .alert("Error", isPresented: .init(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            if canReauthenticateTunnelFromError {
                Button("Sign In") {
                    store.errorMessage = nil
                    showingTunnelReauthentication = true
                }
                Button("Cancel", role: .cancel) {
                    store.errorMessage = nil
                }
            } else {
                Button("OK") { store.errorMessage = nil }
            }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}
