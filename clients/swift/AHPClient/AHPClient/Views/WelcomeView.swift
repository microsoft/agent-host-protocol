import SwiftUI
import AgentHostProtocol

/// Welcome view shown when no session is selected.
struct WelcomeView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("AHP Client")
                .font(.largeTitle.bold())

            Text("A SwiftUI client for the Agent Host Protocol")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if store.connectionState == .disconnected {
                VStack(spacing: 12) {
                    Text("Connect to an AHP server to get started.")
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    Button("Connect") {
                        Task { await store.connect() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else if store.connectionState == .connected {
                VStack(spacing: 12) {
                    if store.agents.isEmpty {
                        Text("No agents available on this server.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Select a session or create a new one.")
                            .font(.callout)
                            .foregroundStyle(.secondary)

                        Button("New Chat") {
                            if let first = store.agents.first {
                                Task { await store.createSession(provider: first.provider) }
                            }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            } else {
                ProgressView("Connecting…")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
