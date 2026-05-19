import AgentHostProtocol
import SwiftTerm
import SwiftUI
import UIKit

/// Full-screen interactive terminal backed by an AHP terminal process.
struct InteractiveTerminalView: View {
    let terminalURI: String
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private var state: TerminalState? {
        store.terminals[terminalURI]
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let state, !state.content.isEmpty || state.exitCode == nil {
                AHPTerminalSwiftUIView(terminalURI: terminalURI)
                    .ignoresSafeArea(.container, edges: .bottom)
            } else if state?.exitCode != nil {
                VStack(spacing: 12) {
                    Image(systemName: "terminal")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("Terminal exited with code \(state?.exitCode ?? -1)")
                        .foregroundStyle(.secondary)
                }
            } else {
                ProgressView("Connecting…")
                    .foregroundStyle(.white)
            }
        }
        .navigationTitle(state?.title ?? "Terminal")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task {
                        await store.disposeTerminal(uri: terminalURI)
                    }
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .task {
            await store.ensureTerminalSubscribed(uri: terminalURI)
        }
    }
}
