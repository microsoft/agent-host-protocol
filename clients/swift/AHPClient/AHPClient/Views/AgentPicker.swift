import AgentHostProtocol
import SwiftUI

/// Agent/model picker for creating a new session.
struct AgentPicker: View {
    @Environment(AppStore.self) private var store
    @State private var selectedProvider: String = ""
    @State private var selectedModel: String = ""
    @State private var workingDirectory: String = ""

    /// Optional pre-filled working directory (e.g. from a folder section).
    var initialDirectory: String?
    let onSelect: (_ provider: String, _ model: String?, _ workingDirectory: String?) -> Void

    private var selectedAgent: AgentInfo? {
        store.agents.first { $0.provider == selectedProvider }
    }

    private var canCreate: Bool {
        !selectedProvider.isEmpty
    }

    var body: some View {
        Form {
            Section {
                Picker("Agent", selection: $selectedProvider) {
                    Text("Select an agent").tag("")
                    ForEach(store.agents, id: \.provider) { agent in
                        Text(agent.displayName).tag(agent.provider)
                    }
                }

                Picker("Model", selection: $selectedModel) {
                    Text("Default").tag("")
                    if let agent = selectedAgent {
                        ForEach(agent.models, id: \.id) { model in
                            Text(model.name).tag(model.id)
                        }
                    }
                }
                .disabled(selectedProvider.isEmpty)
            }

            Section {
                TextField("e.g. /Users/me/project", text: $workingDirectory)
                    .font(.system(.body, design: .monospaced))
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
            } header: {
                Text("Working Directory")
            } footer: {
                if let dir = store.defaultDirectory {
                    let display = dir.hasPrefix("file://") ? String(dir.dropFirst(7)) : dir
                    Text("Server default: \(display)")
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") {
                    let dir = workingDirectory.trimmingCharacters(in: .whitespacesAndNewlines)
                    onSelect(
                        selectedProvider,
                        selectedModel.isEmpty ? nil : selectedModel,
                        dir.isEmpty ? nil : dir
                    )
                }
                .disabled(!canCreate)
            }
        }
        .onAppear {
            if let dir = initialDirectory {
                workingDirectory = dir
            } else if let dir = store.defaultDirectory, workingDirectory.isEmpty {
                workingDirectory = dir
            }
            if store.agents.count == 1, let agent = store.agents.first {
                selectedProvider = agent.provider
            }
        }
        .onChange(of: selectedProvider) {
            selectedModel = ""
        }
    }
}
