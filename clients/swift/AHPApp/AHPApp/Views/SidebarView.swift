import AgentHostProtocol
import SwiftUI

private let healthyGreen = Color(.sRGB, red: 73/255, green: 210/255, blue: 123/255, opacity: 1)

// MARK: - Grouping Types

enum SessionGroupingMode: String, CaseIterable {
    case byTime
    case byFolder

    var systemImage: String {
        switch self {
        case .byTime: "clock"
        case .byFolder: "folder"
        }
    }

    var toggled: SessionGroupingMode {
        self == .byTime ? .byFolder : .byTime
    }
}

enum SessionTimeGroup: String, CaseIterable, Identifiable {
    case today, yesterday, lastWeek, older

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .yesterday: "Yesterday"
        case .lastWeek: "Last 7 Days"
        case .older: "Older"
        }
    }

    static func group(for timestamp: Int) -> SessionTimeGroup {
        let date = Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000)
        let now = Date()
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: now)
        let startOfYesterday = calendar.date(byAdding: .day, value: -1, to: startOfToday)!
        let startOfWeek = calendar.date(byAdding: .day, value: -7, to: startOfToday)!

        if date >= startOfToday { return .today }
        if date >= startOfYesterday { return .yesterday }
        if date >= startOfWeek { return .lastWeek }
        return .older
    }
}

struct SessionFolderGroup: Identifiable, Hashable {
    let path: String
    let displayName: String

    var id: String { path }

    static func make(from workingDirectory: String?) -> SessionFolderGroup {
        guard let wd = workingDirectory, !wd.isEmpty else {
            return SessionFolderGroup(path: "", displayName: "Default")
        }
        // Extract last path component as display name
        let name = wd.split(separator: "/").last.map(String.init) ?? wd
        return SessionFolderGroup(path: wd, displayName: name)
    }
}

// MARK: - SidebarView

/// Sidebar listing sessions with a "New Session" button and connection controls.
struct SidebarView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.colorScheme) private var colorScheme
    @Binding var navigationPath: [String]
    let onShowSettings: () -> Void

    @State private var searchText = ""
    @State private var showingAddServer = false
    @State private var showingNewSession = false
    @State private var newSessionDirectory: String?
    @State private var editingServer: ServerConfiguration?
    @State private var showingTunnels = false
    @AppStorage("sessionGroupingMode") private var groupingMode: SessionGroupingMode = .byTime

    private var filteredSummaries: [SessionSummary] {
        let summaries = store.sessionSummaries
        if searchText.isEmpty { return summaries }
        return summaries.filter {
            $0.title.localizedCaseInsensitiveContains(searchText)
            || $0.provider.localizedCaseInsensitiveContains(searchText)
            || ($0.workingDirectory ?? "").localizedCaseInsensitiveContains(searchText)
        }
    }

    // Time-based grouping
    private var groupedByTime: [(group: SessionTimeGroup, sessions: [SessionSummary])] {
        var buckets: [SessionTimeGroup: [SessionSummary]] = [:]
        for summary in filteredSummaries {
            let group = SessionTimeGroup.group(for: summary.modifiedAt)
            buckets[group, default: []].append(summary)
        }
        return SessionTimeGroup.allCases.compactMap { group in
            guard let sessions = buckets[group], !sessions.isEmpty else { return nil }
            return (group, sessions)
        }
    }

    private static let maxSessionsPerFolder = 5

    // Folder-based grouping
    private var groupedByFolder: [(group: SessionFolderGroup, sessions: [SessionSummary], hasMore: Bool)] {
        var buckets: [String: (group: SessionFolderGroup, sessions: [SessionSummary])] = [:]
        for summary in filteredSummaries {
            let folder = SessionFolderGroup.make(from: summary.workingDirectory)
            if var existing = buckets[folder.path] {
                existing.sessions.append(summary)
                buckets[folder.path] = existing
            } else {
                buckets[folder.path] = (folder, [summary])
            }
        }
        return buckets.values
            .sorted { lhs, rhs in
                let lhsTime = lhs.sessions.first?.modifiedAt ?? 0
                let rhsTime = rhs.sessions.first?.modifiedAt ?? 0
                return lhsTime > rhsTime
            }
            .map { group, sessions in
                let hasMore = sessions.count > Self.maxSessionsPerFolder
                let truncated = hasMore ? Array(sessions.prefix(Self.maxSessionsPerFolder)) : sessions
                return (group, truncated, hasMore)
            }
    }

    private var activeSessions: Int {
        store.sessionSummaries.filter { $0.status == .inProgress }.count
    }

    private var idleSessions: Int {
        store.sessionSummaries.filter { $0.status != .inProgress }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            if store.selectedServer == nil {
                // No server configured / selected
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "server.rack")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text("No Server Selected")
                        .font(.title3.weight(.semibold))
                    Text("Add a server to get started")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button {
                        showingAddServer = true
                    } label: {
                        Label("Add Server", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        summaryCard

                        if filteredSummaries.isEmpty && !searchText.isEmpty {
                            ContentUnavailableView.search(text: searchText)
                        } else if filteredSummaries.isEmpty {
                            VStack(spacing: 8) {
                                Text("Start a new session to chat with your agent")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.top, 28)
                        } else {
                            switch groupingMode {
                            case .byTime:
                                ForEach(groupedByTime, id: \.group) { group, sessions in
                                    sessionSection(title: group.title, sessions: sessions)
                                }
                            case .byFolder:
                                ForEach(groupedByFolder, id: \.group) { group, sessions, hasMore in
                                    folderSection(group: group, sessions: sessions, hasMore: hasMore)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 16)
                }
                .refreshable {
                    await store.refreshSessionSummaries()
                }

                if #available(iOS 26.0, *) {
                    // iOS 26: new session button lives in bottomBar toolbar
                } else {
                    newSessionFooter
                }
            }
        }
        .frame(minWidth: 220)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $searchText,
            placement: searchPlacement,
            prompt: "Search sessions"
        )
        .textInputAutocapitalization(.never)
        .disableAutocorrection(true)
        .toolbar {
            if #available(iOS 26.0, *) {
                DefaultToolbarItem(kind: .search, placement: .bottomBar)
                ToolbarItem(placement: .bottomBar) {
                    Button {
                        newSessionDirectory = nil
                        showingNewSession = true
                    } label: {
                        Label("New Session", systemImage: "plus")
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(colorScheme == .dark ? Color(red: 0.12, green: 0.13, blue: 0.18) : .black)
                    .foregroundStyle(.white)
                    .controlSize(.large)
                    .disabled(store.connectionState != .connected)
                }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                if store.selectedServer != nil && !store.sessionSummaries.isEmpty {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            groupingMode = groupingMode.toggled
                        }
                    } label: {
                        Image(systemName: groupingMode.systemImage)
                    }
                    .accessibilityLabel(groupingMode == .byTime ? "Group by folder" : "Group by time")
                }
            }
            ToolbarItem(placement: .principal) {
                serverSwitcherMenu
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Section {
                        Button(action: onShowSettings) {
                            Label("Settings", systemImage: "gearshape")
                        }
                    }

                    if store.selectedServer != nil {
                        Section {
                            Button {
                                Task {
                                    if store.connectionState == .connected {
                                        await store.disconnect()
                                    } else {
                                        await store.connect()
                                    }
                                }
                            } label: {
                                Label(
                                    store.connectionState == .connected ? "Disconnect" : "Connect",
                                    systemImage: store.connectionState == .connected ? "bolt.slash" : "bolt"
                                )
                            }
                        }
                    }

                    if let server = store.selectedServer {
                        Section {
                            Button {
                                editingServer = server
                            } label: {
                                Label("Edit Server", systemImage: "pencil")
                            }

                            Button(role: .destructive) {
                                store.deleteServer(id: server.id)
                            } label: {
                                Label("Delete Server", systemImage: "trash")
                            }
                        }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis")
                }
            }
        }
        .sheet(isPresented: $showingAddServer) {
            AddServerView { server in
                store.addServer(server)
                store.selectServer(server.id)
            }
            .environment(store)
        }
        .sheet(item: $editingServer) { server in
            AddServerView(editingServer: server) { updated in
                store.updateServer(updated)
            }
            .environment(store)
        }
        .sheet(isPresented: $showingNewSession) {
            NavigationStack {
                AgentPicker(initialDirectory: newSessionDirectory) { provider, model, workingDirectory in
                    showingNewSession = false
                    Task { await store.createSession(provider: provider, model: model, workingDirectory: workingDirectory) }
                }
                .navigationTitle("New Chat")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingNewSession = false }
                    }
                }
            }
            // Force fresh @State when switching between folder/non-folder creation
            .id(newSessionDirectory)
            .environment(store)
        }
        .sheet(isPresented: $showingTunnels) {
            NavigationStack {
                TunnelListView(onConnectToTunnel: { server in
                    showingTunnels = false
                    store.addServer(server)
                    // Find by host — addServer may have deduplicated to an existing entry.
                    let serverId = store.servers.first(where: { $0.host == server.host })?.id ?? server.id
                    store.selectServer(serverId)
                })
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { showingTunnels = false }
                        }
                    }
            }
        }
    }

    // MARK: - Sections

    private func sessionSection(title: String, sessions: [SessionSummary]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            ForEach(sessions, id: \.resource) { summary in
                sessionButton(for: summary, showModel: false)
            }
        }
    }

    private func folderSection(group: SessionFolderGroup, sessions: [SessionSummary], hasMore: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "folder")
                    .foregroundStyle(.secondary)
                Text(group.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Button {
                    newSessionDirectory = group.path
                    showingNewSession = true
                } label: {
                    Image(systemName: "plus")
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }

            ForEach(sessions, id: \.resource) { summary in
                sessionButton(for: summary, showFolder: false)
            }

            if hasMore {
                NavigationLink(value: "folder:\(group.path)") {
                    HStack {
                        Text("Show More Sessions")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .foregroundStyle(.primary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .modifier(SessionCardStyle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func sessionButton(for summary: SessionSummary, showFolder: Bool = true, showModel: Bool = true) -> some View {
        Button {
            Task {
                await store.selectSession(uri: summary.resource)
                navigationPath = [summary.resource]
            }
        } label: {
            SessionRow(
                summary: summary,
                isActive: summary.status == .inProgress,
                showFolder: showFolder,
                showModel: showModel
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Delete", role: .destructive) {
                Task { await store.disposeSession(uri: summary.resource) }
            }
        }
    }

    // MARK: - Server Switcher Menu

    private var serverSwitcherMenu: some View {
        Menu {
            if !store.servers.isEmpty {
                Section("Servers") {
                    ForEach(store.servers) { server in
                        Button {
                            store.selectServer(server.id)
                        } label: {
                            HStack {
                                Text(server.name)
                                if server.id == store.selectedServerId {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                }
            }

            Section {
                Button {
                    showingAddServer = true
                } label: {
                    Label("Add Server", systemImage: "plus")
                }

                Button {
                    showingTunnels = true
                } label: {
                    Label("Dev Tunnels", systemImage: "network")
                }
            }
        } label: {
            HStack(spacing: 10) {
                Circle()
                    .fill(connectionDotColor)
                    .frame(width: 9, height: 9)
                Text(connectionLabel)
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    private var connectionDotColor: Color {
        store.connectionState == .connected ? .green : .orange
    }

    private var connectionLabel: String {
        if let server = store.selectedServer {
            return server.name
        }
        return "No Server"
    }

    // MARK: - Summary Card

    private var summaryCard: some View {
        SummaryCardView(
            agentName: store.agents.first?.provider.capitalized,
            activeSessions: activeSessions,
            idleSessions: idleSessions,
            connectionState: store.connectionState
        )
    }

    // MARK: - Search placement

    private var searchPlacement: SearchFieldPlacement {
        if #available(iOS 26.0, *) {
            return .toolbar
        } else {
            return .navigationBarDrawer(displayMode: .automatic)
        }
    }

    // MARK: - Footer

    private var newSessionFooter: some View {
        HStack {
            Spacer()
            NewSessionButton()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
        .padding(.top, 6)
    }
}

// MARK: - SummaryCardView

/// Extracted as a standalone Equatable view so SwiftUI can skip re-rendering
/// when none of the inputs change.
struct SummaryCardView: View, Equatable {
    let agentName: String?
    let activeSessions: Int
    let idleSessions: Int
    let connectionState: AHPConnection.ConnectionState

    static func == (lhs: SummaryCardView, rhs: SummaryCardView) -> Bool {
        lhs.agentName == rhs.agentName
            && lhs.activeSessions == rhs.activeSessions
            && lhs.idleSessions == rhs.idleSessions
            && lhs.connectionState == rhs.connectionState
    }

    private var isConnected: Bool { connectionState == .connected }
    private var isInProgress: Bool {
        connectionState == .connecting || connectionState == .reconnecting
    }

    private var statusIcon: String {
        if isConnected { return "bolt.fill" }
        if isInProgress { return "bolt.horizontal.fill" }
        return "bolt.slash.fill"
    }

    private var statusLabel: String {
        switch connectionState {
        case .connected: "Connected"
        case .connecting: "Connecting…"
        case .reconnecting: "Reconnecting…"
        case .disconnected: "Disconnected"
        }
    }

    private var statusStyle: AnyShapeStyle {
        if isConnected { return AnyShapeStyle(.secondary) }
        return AnyShapeStyle(Color.orange)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(agentName ?? "Agent")
                .font(.system(size: 24, weight: .bold, design: .rounded))

            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(healthyGreen)
                        .frame(width: 8, height: 8)
                    Text("\(activeSessions) active")
                        .font(.caption.weight(.medium))
                }

                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(.systemGray4))
                        .frame(width: 8, height: 8)
                    Text("\(idleSessions) idle")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 6) {
                if isInProgress {
                    ProgressView()
                        .controlSize(.mini)
                } else {
                    Image(systemName: statusIcon)
                        .font(.caption2)
                }
                Text(statusLabel)
                    .font(.caption.weight(.medium))
            }
            .foregroundStyle(statusStyle)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .modifier(SessionCardStyle())
    }
}

// MARK: - SessionCardStyle

struct SessionCardStyle: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(colorScheme == .dark ? Color(.secondarySystemBackground) : Color.white)
            )
            .shadow(color: Color.black.opacity(colorScheme == .dark ? 0 : 0.05), radius: 10, y: 6)
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(
                        Color(.systemGray5).opacity(colorScheme == .dark ? 0.4 : 1),
                        lineWidth: colorScheme == .dark ? 0.5 : 1
                    )
            )
    }
}

// MARK: - SessionRow

struct SessionRow: View {
    let summary: SessionSummary
    var isActive: Bool = false
    var showFolder: Bool = true
    var showModel: Bool = true

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(isActive ? healthyGreen : Color(.systemGray4))
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 4) {
                Text(summary.title.isEmpty ? "New Chat" : summary.title)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(.primary)

                HStack(spacing: 4) {
                    if showFolder, let wd = summary.workingDirectory, !wd.isEmpty {
                        Image(systemName: "folder")
                            .font(.caption)
                        Text(wd.split(separator: "/").last.map(String.init) ?? wd)
                            .font(.caption)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Text("·")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    Text(summary.provider)
                        .font(.caption)
                }
                .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                Text(relativeTime(from: summary.modifiedAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(SessionCardStyle())
    }

    private func relativeTime(from timestamp: Int) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(timestamp) / 1000)
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "now" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days == 1 { return "1d ago" }
        if days < 7 { return "\(days)d ago" }
        let weeks = days / 7
        return "\(weeks)w ago"
    }
}

// MARK: - NewSessionButton

struct NewSessionButton: View {
    @Environment(AppStore.self) private var store
    @Environment(\.colorScheme) private var colorScheme
    @State private var showingPicker = false

    private var buttonTint: Color {
        colorScheme == .dark
            ? Color(red: 0.12, green: 0.13, blue: 0.18)
            : .black
    }

    var body: some View {
        Button {
            showingPicker = true
        } label: {
            Image(systemName: "plus")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 50, height: 50)
        }
        .buttonStyle(.plain)
        .background(
            Capsule(style: .continuous)
                .fill(buttonTint)
        )
        .clipShape(Capsule(style: .continuous))
        .disabled(store.connectionState != .connected)
        .opacity(store.connectionState != .connected ? 0.7 : 1)
        .sheet(isPresented: $showingPicker) {
            NavigationStack {
                AgentPicker { provider, model, workingDirectory in
                    showingPicker = false
                    Task { await store.createSession(provider: provider, model: model, workingDirectory: workingDirectory) }
                }
                .navigationTitle("New Chat")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingPicker = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }
}

// MARK: - ConnectionIndicator

struct ConnectionIndicator: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .help(label)
    }

    private var color: Color {
        switch store.connectionState {
        case .connected: .green
        case .connecting, .reconnecting: .orange
        case .disconnected: .red
        }
    }

    private var label: String {
        switch store.connectionState {
        case .connected: "Connected"
        case .connecting: "Connecting…"
        case .reconnecting: "Reconnecting…"
        case .disconnected: "Disconnected"
        }
    }
}
