import SwiftUI

/// Main entry point for the AHP client app — an iOS SwiftUI application
/// that connects to an Agent Host Protocol server over WebSocket.
@main
struct AHPAppMain: App {
    @State private var store = AppStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
                .task {
                    if store.selectedServer != nil {
                        await store.connect(debugTrigger: "app launch")
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    // When the app returns to the foreground (e.g. after the screen was locked or
                    // the app was backgrounded) the WebSocket is often already dead. Attempt a
                    // foreground recovery pass so the user doesn't have to manually refresh.
                    if newPhase == .active {
                        Task { await store.handleSceneActive() }
                    }
                }
        }
    }
}
