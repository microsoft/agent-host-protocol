import AgentHostProtocol
import SwiftUI

/// Shows all sessions for a given working directory folder.
struct FolderSessionsView: View {
    @Environment(AppStore.self) private var store
    let folderPath: String
    @Binding var navigationPath: [String]

    private var displayName: String {
        if folderPath.isEmpty { return "Default" }
        return folderPath.split(separator: "/").last.map(String.init) ?? folderPath
    }

    private var sessions: [SessionSummary] {
        store.sessionSummaries.filter { summary in
            let wd = summary.workingDirectory ?? ""
            if folderPath.isEmpty {
                return wd.isEmpty
            }
            return wd == folderPath
        }
    }

    // Group sessions by time within the folder
    private var groupedByTime: [(group: SessionTimeGroup, sessions: [SessionSummary])] {
        var buckets: [SessionTimeGroup: [SessionSummary]] = [:]
        for summary in sessions {
            let group = SessionTimeGroup.group(for: summary.modifiedAt)
            buckets[group, default: []].append(summary)
        }
        return SessionTimeGroup.allCases.compactMap { group in
            guard let sessions = buckets[group], !sessions.isEmpty else { return nil }
            return (group, sessions)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if sessions.isEmpty {
                    VStack(spacing: 8) {
                        Text("No sessions in this folder")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 28)
                } else {
                    ForEach(groupedByTime, id: \.group) { group, sessions in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(group.title)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)

                            ForEach(sessions, id: \.resource) { summary in
                                sessionButton(for: summary)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
        }
        .navigationTitle(displayName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func sessionButton(for summary: SessionSummary) -> some View {
        Button {
            Task {
                await store.selectSession(uri: summary.resource)
                navigationPath = [summary.resource]
            }
        } label: {
            SessionRow(
                summary: summary,
                isActive: summary.status == .inProgress,
                showFolder: false
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Delete", role: .destructive) {
                Task { await store.disposeSession(uri: summary.resource) }
            }
        }
    }
}
