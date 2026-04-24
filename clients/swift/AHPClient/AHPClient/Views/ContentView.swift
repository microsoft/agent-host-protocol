import SwiftUI

/// Root view: sidebar (session list) + detail (chat).
struct ContentView: View {
    @Environment(AppStore.self) private var store
    @State private var showSettings = false
    @State private var navigationPath: [String] = []

    var body: some View {
        NavigationStack(path: $navigationPath) {
            SidebarView(navigationPath: $navigationPath)
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
        .alert("Error", isPresented: .init(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}
