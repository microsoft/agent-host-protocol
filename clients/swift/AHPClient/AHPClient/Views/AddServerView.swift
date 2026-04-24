import SwiftUI

/// Form for adding or editing a saved server configuration.
/// Validates the connection before saving — the server is only persisted after
/// a successful initialize handshake.
struct AddServerView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedField: Field?

    @State private var name: String = ""
    @State private var scheme: String = "ws"
    @State private var host: String = ""
    @State private var token: String = ""
    @State private var isSaving = false
    @State private var hasAttemptedSave = false
    @State private var errorMessage: String?
    @State private var awaitingPermission = false

    let editingServer: ServerConfiguration?
    let onSave: (ServerConfiguration) -> Void

    init(
        editingServer: ServerConfiguration? = nil,
        onSave: @escaping (ServerConfiguration) -> Void
    ) {
        self.editingServer = editingServer
        self.onSave = onSave
        _name = State(initialValue: editingServer?.name ?? "")
        _scheme = State(initialValue: editingServer?.scheme ?? "ws")
        _host = State(initialValue: editingServer?.host ?? "")
        _token = State(initialValue: editingServer?.token ?? "")
    }

    private enum Field: Hashable {
        case name, host, token
    }

    private var canSave: Bool {
        !host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                formFields
                statusSection
                saveButtonSection
            }
            .navigationTitle(editingServer == nil ? "Add Server" : "Edit Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
            }
            .onAppear {
                focusedField = editingServer == nil ? .host : .name
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    @ViewBuilder
    private var formFields: some View {
        Section {
            TextField("Display name", text: $name)
                .focused($focusedField, equals: .name)
                .disabled(isSaving)
        }

        Section {
            Picker("Protocol", selection: $scheme) {
                Text("ws").tag("ws")
                Text("wss").tag("wss")
            }
            .pickerStyle(.segmented)
            .disabled(isSaving)

            TextField("Host", text: $host)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focusedField, equals: .host)
                .disabled(isSaving)

            SecureField("Token (optional)", text: $token)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focusedField, equals: .token)
                .disabled(isSaving)
        } footer: {
            Text("e.g. 127.0.0.1:8081 — token is passed as ?tkn= in the URL")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var statusSection: some View {
        if hasAttemptedSave && host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Section {
                Label("A host address is required.", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .font(.footnote)
            }
        }

        if awaitingPermission {
            Section {
                HStack(spacing: 12) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Waiting for local network permission…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }

        if let errorMessage {
            Section {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .font(.footnote)
            }
        }
    }

    @ViewBuilder
    private var saveButtonSection: some View {
        Section {
            Button {
                Task { await validateAndSave() }
            } label: {
                HStack {
                    Spacer()
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                            .padding(.trailing, 6)
                    }
                    Text(editingServer == nil ? "Save Server" : "Update Server")
                        .fontWeight(.semibold)
                    Spacer()
                }
            }
            .disabled(!canSave)
        }
    }

    private func validateAndSave() async {
        hasAttemptedSave = true
        guard !host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        focusedField = nil
        isSaving = true
        errorMessage = nil
        awaitingPermission = false

        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayName = label.isEmpty ? "\(scheme)://\(trimmedHost)" : label

        let server = ServerConfiguration(
            id: editingServer?.id ?? UUID(),
            name: displayName,
            scheme: scheme,
            host: trimmedHost,
            token: token.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        do {
            try await store.validateServer(server)
        } catch AppStore.ValidationError.localNetworkPermissionNeeded {
            // iOS permission dialog is showing. Wait for the user to respond.
            awaitingPermission = true
            let granted = await store.waitForLocalNetworkPermission()
            awaitingPermission = false

            if granted {
                // Permission granted — retry validation.
                do {
                    try await store.validateServer(server)
                } catch {
                    isSaving = false
                    errorMessage = error.localizedDescription
                    return
                }
            } else {
                isSaving = false
                errorMessage = "Local network access was denied. Please enable it in Settings."
                return
            }
        } catch {
            isSaving = false
            errorMessage = error.localizedDescription
            return
        }

        // Validation succeeded — persist and connect.
        isSaving = false
        onSave(server)
        dismiss()
    }
}
