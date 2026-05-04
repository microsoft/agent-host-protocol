import AgentHostProtocol
import SwiftUI
import UIKit

/// Main chat view showing the conversation with the agent.
struct ChatView: View {
    @Environment(AppStore.self) private var store
    @AppStorage("showSessionDebugStatus") private var showSessionDebugStatus = false
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool
    /// Tracks whether the scroll position is at (or near) the bottom.
    @State private var isAtBottom = true
    /// URI of an interactive terminal to navigate to.
    @State private var activeTerminalURI: String?
    /// Currently presented input request in the modal sheet.
    @State private var presentedInputRequestId: String?

    // MARK: - Scroll helpers

    /// The stable ID of the bottom-sentinel view used as the scroll target.
    private let bottomID = "chat-bottom-sentinel"
    private var sessionPermissionPickerModel: SessionPermissionPickerModel? {
        guard let session = store.currentSession else { return nil }
        return SessionPermissionPickerModel(session: session)
    }
    private var sessionModelPickerModel: SessionModelPickerModel? {
        guard let session = store.currentSession else { return nil }
        return SessionModelPickerModel(session: session, agents: store.agents)
    }

    /// True when the active turn has at least one streaming or running tool
    /// call. Used to suppress the floating input-request prompt because the
    /// owning tool card already shows its own "Respond" CTA.
    private var hasInProgressToolCall: Bool {
        guard let parts = store.currentSession?.activeTurn?.responseParts else { return false }
        for part in parts {
            if case .toolCall(let tc) = part {
                switch tc.toolCall {
                case .streaming, .running: return true
                default: continue
                }
            }
        }
        return false
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool) {
        if animated {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(bottomID, anchor: .bottom)
            }
        } else {
            proxy.scrollTo(bottomID, anchor: .bottom)
        }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottomTrailing) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        if let session = store.currentSession {
                            // Completed turns
                            ForEach(session.turns, id: \.id) { turn in
                                TurnView(turn: turn, activeTurnId: nil)
                                    .id(turn.id)
                            }

                            // Active turn (streaming)
                            if let activeTurn = session.activeTurn {
                                ActiveTurnView(turn: activeTurn)
                                    .id("active-\(activeTurn.id)")
                            }

                            // Steering message — will be injected into the
                            // current turn at the server's next opportunity.
                            if let steering = session.steeringMessage {
                                PendingMessageView(
                                    message: steering,
                                    caption: "Steering",
                                    captionIcon: "arrow.turn.down.right"
                                )
                                .id("steering-\(steering.id)")
                            }

                            // Queued messages — auto-started as new turns
                            // after the current turn completes (or immediately
                            // when the session is idle).
                            if let queued = session.queuedMessages {
                                ForEach(queued, id: \.id) { msg in
                                    PendingMessageView(
                                        message: msg,
                                        caption: "Queued",
                                        captionIcon: "clock"
                                    )
                                    .id("queued-\(msg.id)")
                                }
                            }
                        }

                        // Bottom sentinel — scroll target and at-bottom detection.
                        Color.clear
                            .frame(height: 1)
                            .id(bottomID)
                            .onAppear  { isAtBottom = true }
                            .onDisappear { isAtBottom = false }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                    .padding(.bottom, 8)
                }
                .defaultScrollAnchor(.bottom)
                .onAppear {
                    isAtBottom = true
                    scrollToBottom(proxy, animated: false)
                }
                .onChange(of: store.selectedSessionURI) {
                    isAtBottom = true
                    scrollToBottom(proxy, animated: false)
                }
                .onChange(of: store.currentSession?.activeTurn?.responseParts.count) {
                    if isAtBottom {
                        scrollToBottom(proxy, animated: true)
                    }
                }
                .onChange(of: store.currentSession?.turns.count) {
                    if isAtBottom {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            scrollToBottom(proxy, animated: true)
                        }
                    }
                }
                .onChange(of: store.currentSession?.queuedMessages?.count) {
                    if isAtBottom {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            scrollToBottom(proxy, animated: true)
                        }
                    }
                }
                .onChange(of: store.currentSession?.steeringMessage?.id) {
                    if isAtBottom {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            scrollToBottom(proxy, animated: true)
                        }
                    }
                }

                // Scroll-to-bottom button — visible when the user has scrolled up.
                if !isAtBottom {
                    Button {
                        scrollToBottom(proxy, animated: true)
                    } label: {
                        if #available(iOS 26, *) {
                            Image(systemName: "arrow.down")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.primary)
                                .padding(12)
                                .glassEffect(.regular.interactive(), in: .circle)
                        } else {
                            Image(systemName: "arrow.down")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.primary)
                                .padding(10)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 16)
                    .accessibilityLabel("Scroll to bottom")
                    .transition(.scale.combined(with: .opacity))
                    .animation(.easeOut(duration: 0.15), value: isAtBottom)
                }
            }
            .overlay(alignment: .top) {
                VStack(spacing: 8) {
                    if store.isCurrentSessionStale || store.isCurrentSessionSyncing {
                        SessionSyncStatusBar(isSyncing: store.isCurrentSessionSyncing)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    // Floating reconnect progress bar
                    if store.isReconnectBannerVisible {
                        ReconnectProgressBar()
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
                .padding(.top, 8)
            }
            .animation(.easeInOut(duration: 0.2), value: store.isReconnectBannerVisible)
            .animation(.easeInOut(duration: 0.25), value: store.isCurrentSessionStale)
            .animation(.easeInOut(duration: 0.25), value: store.isCurrentSessionSyncing)
            // InputBar is declared as a safe-area inset so the scroll view
            // shrinks its visible frame to end above the bar. This ensures
            // scrollToBottom lands at the true visible bottom, not behind the bar.
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 8) {
                    // Pending input requests (elicitation) — shown only when
                    // no in-progress tool call owns the request. The active
                    // tool card embeds its own "Respond" CTA in that case.
                    if let requests = store.currentSession?.inputRequests,
                       !requests.isEmpty,
                       !hasInProgressToolCall {
                        VStack(spacing: 8) {
                            ForEach(requests, id: \.id) { request in
                                InputRequestPrompt(request: request) {
                                    presentedInputRequestId = request.id
                                }
                            }
                        }
                        .padding(.horizontal, 14)
                    }

                    SessionAccessoryBar(
                        permissionModel: sessionPermissionPickerModel,
                        modelPickerModel: sessionModelPickerModel
                    )

                    if showSessionDebugStatus {
                        SessionDebugStatusBar(
                            connectionState: store.connectionState,
                            isSessionSyncing: store.isCurrentSessionSyncing,
                            isSessionStale: store.isCurrentSessionStale,
                            selectedSessionURI: store.selectedSessionURI,
                            status: store.sessionDebugStatus
                        )
                    }

                    InputBar(text: $inputText, isFocused: $inputFocused) {
                        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                        let message = inputText
                        inputText = ""
                        Task { await store.sendMessage(message) }
                    }
                }
            }
        }
        .navigationTitle(store.currentSession?.summary.title.isEmpty == false ? store.currentSession!.summary.title : "New Chat")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 12) {
                    Button {
                        Task {
                            if let uri = await store.createTerminal() {
                                activeTerminalURI = uri
                            }
                        }
                    } label: {
                        Image(systemName: "terminal")
                            .accessibilityLabel("New terminal")
                    }
                    .disabled(store.connectionState != .connected)

                    ReconnectButton()
                }
            }
        }
        .navigationDestination(item: $activeTerminalURI) { uri in
            InteractiveTerminalView(terminalURI: uri)
        }
        .sheet(item: Binding(
            get: { presentedInputRequest.map { IdentifiedRequest(request: $0) } },
            set: { presentedInputRequestId = $0?.request.id }
        )) { wrapper in
            InputRequestSheet(request: wrapper.request) {
                presentedInputRequestId = nil
            }
        }
        .onChange(of: store.currentSession?.inputRequests?.map(\.id) ?? []) { _, ids in
            // Auto-dismiss the sheet if the active request was resolved.
            if let id = presentedInputRequestId, !ids.contains(id) {
                presentedInputRequestId = nil
            }
        }
    }

    /// The full request currently presented in the modal sheet, if any.
    private var presentedInputRequest: SessionInputRequest? {
        guard let id = presentedInputRequestId,
              let requests = store.currentSession?.inputRequests else { return nil }
        return requests.first(where: { $0.id == id })
    }
}

/// Wrapper to make `SessionInputRequest` `Identifiable` for `.sheet(item:)`.
private struct IdentifiedRequest: Identifiable {
    let request: SessionInputRequest
    var id: String { request.id }
}

// MARK: - SessionSyncStatusBar

private struct SessionSyncStatusBar: View {
    let isSyncing: Bool

    var body: some View {
        HStack(spacing: 8) {
            if isSyncing {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            Text(isSyncing ? "Syncing session…" : "Session content may be stale")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
    }
}

private struct SessionDebugStatusBar: View {
    let connectionState: AHPConnection.ConnectionState
    let isSessionSyncing: Bool
    let isSessionStale: Bool
    let selectedSessionURI: String?
    let status: SessionDebugStatus

    var body: some View {
        Button(action: copyDebugDetails) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(connectionColor)
                        .frame(width: 7, height: 7)

                    Text("state \(connectionLabel)")
                        .fontWeight(.semibold)

                    Text("session \(sessionLabel)")
                        .foregroundStyle(.secondary)
                }

                Text(triggerLine)
                    .foregroundStyle(.secondary)

                Text(pathLine)
                    .foregroundStyle(.secondary)

                Text(timingLine)
                    .foregroundStyle(.secondary)
            }
            .font(.caption2.monospacedDigit())
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4), lineWidth: 0.5)
            )
            .padding(.horizontal, 12)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Copies detailed session debug information")
    }

    private var connectionColor: Color {
        switch connectionState {
        case .connected: Color(.systemGreen)
        case .connecting, .reconnecting: .orange
        case .disconnected: .red
        }
    }

    private var connectionLabel: String {
        switch connectionState {
        case .connected: "connected"
        case .connecting: "connecting"
        case .reconnecting: "reconnecting"
        case .disconnected: "disconnected"
        }
    }

    private var sessionLabel: String {
        if isSessionSyncing { return "syncing" }
        if isSessionStale { return "stale" }
        return "ready"
    }

    private var triggerLine: String {
        let trigger = status.lastTrigger ?? "none"
        let detail = status.lastTriggerDetail.map { " (\($0))" } ?? ""
        return "trigger \(trigger)\(detail) · \(ageText(status.lastTriggerAt))"
    }

    private var pathLine: String {
        let labels = collapsedPathLabels
        guard !labels.isEmpty else { return "path none" }
        return "path " + labels.joined(separator: " -> ")
    }

    private var collapsedPathLabels: [String] {
        let labels = status.recentEvents.suffix(4).map(\.label)
        var collapsed: [String] = []
        for label in labels where collapsed.last != label {
            collapsed.append(label)
        }
        return collapsed
    }

    private var timingLine: String {
        let summaries = "summaries \(ageText(status.lastSessionSummariesFetchAt))"
        let session = status.lastSessionRefreshAt.map { _ in
            "session \(ageText(status.lastSessionRefreshAt))"
        } ?? "session never"
        let reconnect = "reconnect \(ageText(status.lastSuccessfulReconnectAt))"
        let state = "state \(ageText(status.lastConnectionStateChangeAt))"
        return "\(summaries) · \(session) · \(reconnect) · \(state)"
    }

    private var copyText: String {
        """
        state: \(connectionLabel)
        session: \(sessionLabel)
        selectedSessionURI: \(selectedSessionURI ?? "none")
        lastTrigger: \(status.lastTrigger ?? "none")
        lastTriggerDetail: \(status.lastTriggerDetail ?? "none")
        recentPath: \(status.recentEvents.map(\.label).joined(separator: " -> "))
        lastTriggerAt: \(copyDate(status.lastTriggerAt))
        lastConnectionStateChangeAt: \(copyDate(status.lastConnectionStateChangeAt))
        lastSuccessfulConnectAt: \(copyDate(status.lastSuccessfulConnectAt))
        lastSuccessfulReconnectAt: \(copyDate(status.lastSuccessfulReconnectAt))
        lastSessionSummariesFetchAt: \(copyDate(status.lastSessionSummariesFetchAt))
        lastSessionRefreshAt: \(copyDate(status.lastSessionRefreshAt))
        lastSessionRefreshURI: \(status.lastSessionRefreshURI ?? "none")
        """
    }

    private func copyDebugDetails() {
        UIPasteboard.general.string = copyText
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func ageText(_ date: Date?) -> String {
        guard let date else { return "never" }
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        return "\(hours / 24)d"
    }

    private func copyDate(_ date: Date?) -> String {
        guard let date else { return "never" }
        return date.ISO8601Format()
    }
}

// MARK: - InputBar

struct InputBar: View {
    @Binding var text: String
    var isFocused: FocusState<Bool>.Binding
    let onSubmit: () -> Void

    @Environment(AppStore.self) private var store

    private var isStreaming: Bool {
        store.currentSession?.activeTurn != nil
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private let containerRadius: CGFloat = 20

    var body: some View {
        VStack(spacing: 0) {
            // Text field row
            TextField("Message the agent…", text: $text, axis: .vertical)
                .lineLimit(1...8)
                .focused(isFocused)
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
                .font(.body)
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 8)

            // Toolbar row
            HStack(spacing: 12) {
                Spacer()

                // Send / Stop button
                Button {
                    if isStreaming {
                        Task { await store.cancelTurn() }
                    } else {
                        isFocused.wrappedValue = false
                        onSubmit()
                    }
                } label: {
                    Image(systemName: isStreaming ? "stop.fill" : "arrow.up")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(isStreaming ? Color.primary : Color.white)
                        .frame(width: 32, height: 32)
                        .background(
                            Circle()
                                .fill(isStreaming ? Color(.systemGray5) : (canSend ? Color.black : Color(.systemGray3)))
                        )
                        .overlay(
                            Circle()
                                .stroke(Color(.systemGray3), lineWidth: isStreaming ? 1 : 0)
                        )
                }
                .buttonStyle(.plain)
                .disabled(!isStreaming && !canSend)
                .accessibilityLabel(isStreaming ? "Stop turn" : "Send message")
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
        .glassInputBackground(cornerRadius: containerRadius)
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }
}

// MARK: - Session Permission Picker

private let autoApproveConfigKey = "autoApprove"
private let wellKnownAutoApproveValues: Set<String> = ["default", "autoApprove", "autopilot"]

private struct SessionPermissionOption: Identifiable {
    let value: String
    let label: String

    var id: String { value }
}

private struct SessionModelOption: Identifiable {
    let id: String
    let label: String
}

private struct SessionPermissionPickerModel {
    let title: String
    let options: [SessionPermissionOption]
    let selectedValue: String

    var selectedLabel: String {
        options.first(where: { $0.value == selectedValue })?.label ?? selectedValue
    }

    init?(session: SessionState) {
        guard let config = session.config,
              let property = config.schema.properties[autoApproveConfigKey],
              property.type == "string",
              property.sessionMutable == true,
              property.readOnly != true,
              let values = property.enum,
              values.contains("default"),
              values.allSatisfy({ wellKnownAutoApproveValues.contains($0) }) else {
            return nil
        }

        let options = values.enumerated().map { index, value in
            let label: String
            if let labels = property.enumLabels, labels.indices.contains(index) {
                label = labels[index]
            } else {
                label = value
            }

            return SessionPermissionOption(
                value: value,
                label: label
            )
        }

        guard !options.isEmpty else { return nil }

        let currentValue = config.values[autoApproveConfigKey]?.value as? String
        let selectedValue = currentValue.flatMap { value in
            options.contains(where: { $0.value == value }) ? value : nil
        } ?? "default"

        self.title = property.title
        self.options = options
        self.selectedValue = selectedValue
    }
}

private struct SessionModelPickerModel {
    let title = "Model"
    let options: [SessionModelOption]
    let selectedValue: String?
    let selectedLabel: String

    init?(session: SessionState, agents: [AgentInfo]) {
        guard let agent = agents.first(where: { $0.provider == session.summary.provider }),
              !agent.models.isEmpty else {
            return nil
        }

        let options = agent.models.map { model in
            SessionModelOption(id: model.id, label: model.name)
        }
        let currentModelId = session.summary.model?.id
        let selectedOption = currentModelId.flatMap { id in
            options.first(where: { $0.id == id })
        }

        self.options = options
        self.selectedValue = selectedOption?.id ?? currentModelId
        self.selectedLabel = selectedOption?.label ?? currentModelId ?? "Default model"
    }
}

private struct SessionAccessoryBar: View {
    let permissionModel: SessionPermissionPickerModel?
    let modelPickerModel: SessionModelPickerModel?

    var body: some View {
        if permissionModel != nil || modelPickerModel != nil {
            HStack(spacing: 8) {
                if let permissionModel {
                    SessionPermissionPickerView(model: permissionModel)
                }

                if let modelPickerModel {
                    SessionModelPickerView(model: modelPickerModel)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
        }
    }
}

private struct SessionPermissionPickerView: View {
    let model: SessionPermissionPickerModel

    @Environment(AppStore.self) private var store

    var body: some View {
        Menu {
            ForEach(model.options) { option in
                Button {
                    guard option.value != model.selectedValue else { return }
                    Task {
                        await store.setSessionConfigValue(
                            property: autoApproveConfigKey,
                            value: AnyCodable(option.value)
                        )
                    }
                } label: {
                    if option.value == model.selectedValue {
                        Label(option.label, systemImage: "checkmark")
                    } else {
                        Text(option.label)
                    }
                }
            }
        } label: {
            SessionAccessoryButtonLabel(
                systemImage: "lock.shield",
                text: model.selectedLabel
            )
        }
        .accessibilityLabel(model.title)
        .accessibilityValue(model.selectedLabel)
        .tint(.primary)
    }
}

private struct SessionModelPickerView: View {
    let model: SessionModelPickerModel

    @Environment(AppStore.self) private var store

    var body: some View {
        Menu {
            ForEach(model.options) { option in
                Button {
                    guard option.id != model.selectedValue else { return }
                    Task {
                        await store.changeModel(option.id)
                    }
                } label: {
                    if option.id == model.selectedValue {
                        Label(option.label, systemImage: "checkmark")
                    } else {
                        Text(option.label)
                    }
                }
            }
        } label: {
            SessionAccessoryButtonLabel(
                systemImage: "cpu",
                text: model.selectedLabel
            )
        }
        .accessibilityLabel(model.title)
        .accessibilityValue(model.selectedLabel)
        .tint(.primary)
    }
}

private struct SessionAccessoryButtonLabel: View {
    let systemImage: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))

            Text(text)
                .font(.caption.weight(.medium))
                .lineLimit(1)

            Image(systemName: "chevron.up.chevron.down")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .glassInputBackground(cornerRadius: 16)
    }
}

// MARK: - Glass Background

private extension View {
    @ViewBuilder
    func glassInputBackground(cornerRadius: CGFloat) -> some View {
        if #available(iOS 26, *) {
            self.glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
        } else {
            self
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(Color(.systemGray4), lineWidth: 0.5)
                )
        }
    }
}

// MARK: - TurnView (completed)

struct TurnView: View {
    let turn: Turn
    let activeTurnId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // User message
            UserBubble(text: turn.userMessage.text, attachments: turn.userMessage.attachments)

            // Response parts
            ForEach(Array(turn.responseParts.enumerated()), id: \.offset) { _, part in
                ResponsePartView(part: part)
            }

            // Turn status footer
            if turn.state == .error, let error = turn.error {
                Label(error.message, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.red.opacity(0.1), in: Capsule())
            }

            if turn.state == .cancelled {
                Label("Cancelled", systemImage: "xmark.circle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color(.systemGray5), in: Capsule())
            }

            // Usage info
            if let usage = turn.usage {
                UsageBadge(usage: usage)
            }
        }
    }
}

// MARK: - ActiveTurnView (streaming)

struct ActiveTurnView: View {
    let turn: ActiveTurn

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            UserBubble(text: turn.userMessage.text, attachments: turn.userMessage.attachments)

            ForEach(Array(turn.responseParts.enumerated()), id: \.offset) { _, part in
                ResponsePartView(part: part)
            }

            // Streaming indicator
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.small)
                Text("Thinking…")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(.systemGray6), in: Capsule())

            if let usage = turn.usage {
                UsageBadge(usage: usage)
            }
        }
    }
}

// MARK: - PendingMessageView (queued / steering)

/// Renders a pending user message — either a queued message (will start
/// a new turn after the current one finishes, or immediately if the
/// session is idle) or a steering message (will be injected into the
/// current turn at the server's next opportunity).
struct PendingMessageView: View {
    let message: PendingMessage
    let caption: String
    let captionIcon: String

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            UserBubble(text: message.userMessage.text, attachments: message.userMessage.attachments)
                .opacity(0.7)

            HStack(spacing: 4) {
                Image(systemName: captionIcon)
                    .font(.caption2)
                Text(caption)
                    .font(.caption2)
            }
            .foregroundStyle(.secondary)
            .padding(.trailing, 4)
        }
    }
}

// MARK: - UsageBadge

struct UsageBadge: View {
    let usage: UsageInfo
    
    var body: some View {
        HStack(spacing: 8) {
            if let input = usage.inputTokens {
                Label("\(input) in", systemImage: "arrow.down.circle")
                    .font(.caption2)
            }
            if let output = usage.outputTokens {
                Label("\(output) out", systemImage: "arrow.up.circle")
                    .font(.caption2)
            }
        }
        .foregroundStyle(.tertiary)
    }
}

// MARK: - ReconnectProgressBar

/// Floating horizontal progress indicator shown at the top of the chat view
/// while a reconnect is in flight.
private struct ReconnectProgressBar: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text("Reconnecting…")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
        .padding(.top, 8)
    }
}

// MARK: - ReconnectButton

/// A nav-bar button that forces a reconnect, useful for testing the reconnect flow
/// without having to lock the screen or kill the network.
struct ReconnectButton: View {
    @Environment(AppStore.self) private var store
    @State private var isReconnecting = false

    var body: some View {
        Button {
            guard !isReconnecting else { return }
            isReconnecting = true
            Task {
                await store.reconnect()
                isReconnecting = false
            }
        } label: {
            if isReconnecting {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "arrow.trianglehead.2.clockwise")
                    .accessibilityLabel("Force reconnect")
            }
        }
        .disabled(isReconnecting)
    }
}

// MARK: - Preview Helpers

private struct InputBarPreviewWrapper: View {
    @State private var text = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        InputBar(text: $text, isFocused: $isFocused) { }
    }
}

// MARK: - Previews

#Preview("Conversation Flow", traits: .fixedLayout(width: 390, height: 2400)) {
    ScrollView {
        VStack(alignment: .leading, spacing: 12) {
            // Turn 1: Simple question → markdown response
            UserBubble(
                text: "What does the auth module do?",
                attachments: nil
            )
            MarkdownPartView(part: MarkdownResponsePart(
                kind: .markdown,
                id: "m1",
                content: "The auth module handles **JWT-based authentication**. It provides `login()`, `logout()`, and `refreshToken()` functions that manage session state without server-side cookies."
            ))

            // Turn 2: XML context + attachments → reasoning + tool calls + markdown
            UserBubble(
                text: """
                <reminder>
                IMPORTANT: check existing tests before making changes.
                </reminder>
                <userRequest>
                Can you refactor it to use async/await?
                </userRequest>
                """,
                attachments: [
                    .resource(MessageResourceAttachment(label: "auth.swift", displayKind: "document", uri: "src/auth.swift", type: .resource))
                ]
            )
            ReasoningPartView(part: ReasoningResponsePart(
                kind: .reasoning,
                id: "r1",
                content: "I need to check the current implementation first, then convert the completion handler patterns to async/await."
            ))
            ToolCallPartView(toolCall: .completed(ToolCallCompletedState(
                toolCallId: "tc1",
                toolName: "readFile",
                displayName: "Read file",
                invocationMessage: .string("Reading src/auth.swift"),
                toolInput: "{\"path\": \"src/auth.swift\"}",
                success: true,
                pastTenseMessage: .string("Read src/auth.swift"),
                status: .completed,
                confirmed: .notNeeded
            )))
            ToolCallPartView(toolCall: .completed(ToolCallCompletedState(
                toolCallId: "tc2",
                toolName: "editFile",
                displayName: "Edit file",
                invocationMessage: .string("Editing src/auth.swift"),
                toolInput: "{\"path\": \"src/auth.swift\"}",
                success: true,
                pastTenseMessage: .string("Edited src/auth.swift"),
                status: .completed,
                confirmed: .notNeeded
            )))
            MarkdownPartView(part: MarkdownResponsePart(
                kind: .markdown,
                id: "m2",
                content: "I've refactored the auth module to use `async/await`. The key changes:\n\n- `login()` → `async throws`\n- `refreshToken()` → `async throws`\n- Removed callback-based API"
            ))

            // Turn 3: Tool needing confirmation
            UserBubble(
                text: "Now deploy it",
                attachments: nil
            )
            ToolCallPartView(toolCall: .pendingConfirmation(ToolCallPendingConfirmationState(
                toolCallId: "tc3",
                toolName: "bash",
                displayName: "Run command",
                invocationMessage: .string("Run: npm run deploy --production"),
                toolInput: "{\"command\": \"npm run deploy --production\"}",
                status: .pendingConfirmation,
                confirmationTitle: .string("Allow production deployment?")
            )))

            // Turn 4: Active turn with running tool
            UserBubble(
                text: "While that's pending, explain the token refresh flow",
                attachments: nil
            )
            ToolCallPartView(toolCall: .running(ToolCallRunningState(
                toolCallId: "tc4",
                toolName: "readFile",
                displayName: "Read file",
                invocationMessage: .string("Reading src/auth/token.swift"),
                toolInput: "{\"path\": \"src/auth/token.swift\"}",
                status: .running,
                confirmed: .notNeeded
            )))

            // Floating input
            InputBarPreviewWrapper()
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 16)
    }
    .environment(AppStore())
}
