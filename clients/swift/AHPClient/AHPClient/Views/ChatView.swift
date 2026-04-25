import AgentHostProtocol
import SwiftUI

/// Main chat view showing the conversation with the agent.
struct ChatView: View {
    @Environment(AppStore.self) private var store
    @State private var inputText = ""
    @FocusState private var inputFocused: Bool
    /// Tracks whether the scroll position is at (or near) the bottom.
    @State private var isAtBottom = true

    // MARK: - Scroll helpers

    /// The stable ID of the bottom-sentinel view used as the scroll target.
    private let bottomID = "chat-bottom-sentinel"

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
                // Floating reconnect progress bar
                if store.isReconnecting {
                    ReconnectProgressBar()
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.easeInOut(duration: 0.25), value: store.isReconnecting)
            // InputBar is declared as a safe-area inset so the scroll view
            // shrinks its visible frame to end above the bar. This ensures
            // scrollToBottom lands at the true visible bottom, not behind the bar.
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 8) {
                    // Pending input requests (elicitation)
                    if let requests = store.currentSession?.inputRequests, !requests.isEmpty {
                        VStack(spacing: 8) {
                            ForEach(requests, id: \.id) { request in
                                InputRequestView(request: request)
                            }
                        }
                        .padding(.horizontal, 14)
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
                ReconnectButton()
            }
        }
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
                    MessageAttachment(type: .file, uri: "src/auth.swift", displayName: "auth.swift")
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
