import SwiftUI

/// Settings sheet showing saved servers and app info.
struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("showSessionDebugStatus") private var showSessionDebugStatus = false
    @State private var showingAddServer = false
    @State private var editingServer: ServerConfiguration?
    @State private var showingTunnels = false

    var body: some View {
        NavigationStack {
            Form {
                serverListSection
                tunnelSection
                debugSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingAddServer) {
                AddServerView { server in
                    store.addServer(server)
                }
                .environment(store)
            }
            .sheet(item: $editingServer) { server in
                AddServerView(editingServer: server) { updated in
                    store.updateServer(updated)
                }
                .environment(store)
            }
            .navigationDestination(isPresented: $showingTunnels) {
                TunnelListView()
            }
        }
    }

    @ViewBuilder
    private var tunnelSection: some View {
        Section("Dev Tunnels") {
            Button {
                showingTunnels = true
            } label: {
                Label("Browse Tunnels", systemImage: "network")
            }
        }
    }

    @ViewBuilder
    private var debugSection: some View {
        Section("Debug") {
            Toggle("Show session debug status", isOn: $showSessionDebugStatus)
        }
    }

    @ViewBuilder
    private var serverListSection: some View {
        Section("Servers") {
            ForEach(store.servers) { server in
                serverRow(server)
            }
            .onDelete { offsets in
                for index in offsets {
                    store.deleteServer(id: store.servers[index].id)
                }
            }

            Button {
                showingAddServer = true
            } label: {
                Label("Add Server", systemImage: "plus")
            }
        }
    }

    @ViewBuilder
    private func serverRow(_ server: ServerConfiguration) -> some View {
        Button {
            editingServer = server
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(server.name)
                        .foregroundStyle(.primary)
                    Text("\(server.scheme)://\(server.host)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if server.id == store.selectedServerId {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Color.accentColor)
                }
            }
        }
    }
}
