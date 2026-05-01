import AgentHostProtocol
import SwiftUI

// MARK: - UserBubble

struct UserBubble: View {
    let text: String
    let attachments: [MessageAttachment]?

    private let parsed: ParsedUserMessage

    init(text: String, attachments: [MessageAttachment]?) {
        self.text = text
        self.attachments = attachments
        self.parsed = ParsedUserMessage(raw: text)
    }

    /// All pills: context tags + file attachments, unified style.
    private var allPills: [ContextPill] {
        var result = parsed.pills
        if let attachments, !attachments.isEmpty {
            for (i, a) in attachments.enumerated() {
                let icon = attachmentIcon(a.type)
                let label = a.displayName ?? a.uri
                result.append(ContextPill(id: "attachment-\(i)", label: label, icon: icon, content: a.uri))
            }
        }
        return result
    }

    private func attachmentIcon(_ type: AttachmentType) -> String {
        switch type {
        case .directory: return "folder"
        case .file: return "doc"
        case .selection: return "text.cursor"
        }
    }

    var body: some View {
        HStack {
            Spacer(minLength: 40)
            VStack(alignment: .trailing, spacing: 6) {
                messageBubble

                if !allPills.isEmpty {
                    pillsView
                }
            }
        }
    }

    private var messageBubble: some View {
        Text(parsed.displayText)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Color.accentColor.opacity(0.15),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
    }

    private var pillsView: some View {
        FlowLayout(spacing: 4) {
            ForEach(allPills) { pill in
                PillView(pill: pill)
            }
        }
    }
}

// MARK: - PillView

private struct PillView: View {
    let pill: ContextPill
    @State private var showContent = false

    var body: some View {
        Button {
            if pill.content != nil {
                showContent = true
            }
        } label: {
            HStack(spacing: 3) {
                Image(systemName: pill.icon)
                    .font(.system(size: 9))
                Text(pill.label)
                    .font(.caption2)
            }
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Color(.systemGray5), in: Capsule())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showContent) {
            PillContentSheet(pill: pill)
        }
    }
}

private struct PillContentSheet: View {
    let pill: ContextPill
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(pill.content ?? "")
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .navigationTitle(pill.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Right-aligned flow layout that wraps items to the next line when they exceed the width.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        var height: CGFloat = 0
        for (index, row) in rows.enumerated() {
            let rowHeight = row.map { $0.size.height }.max() ?? 0
            height += rowHeight
            if index > 0 { height += spacing }
        }
        let width: CGFloat
        if let proposedWidth = proposal.width {
            width = proposedWidth
        } else {
            var maxRowWidth: CGFloat = 0
            for row in rows {
                var rowWidth: CGFloat = 0
                for item in row {
                    if rowWidth > 0 { rowWidth += spacing }
                    rowWidth += item.size.width
                }
                maxRowWidth = max(maxRowWidth, rowWidth)
            }
            width = maxRowWidth
        }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = computeRows(proposal: proposal, subviews: subviews)
        var y = bounds.minY
        for row in rows {
            let rowHeight = row.map { $0.size.height }.max() ?? 0
            var rowWidth: CGFloat = 0
            for item in row {
                if rowWidth > 0 { rowWidth += spacing }
                rowWidth += item.size.width
            }
            var x = bounds.maxX - rowWidth
            for item in row {
                let yOffset = y + (rowHeight - item.size.height) / 2
                item.subview.place(at: CGPoint(x: x, y: yOffset), proposal: .init(item.size))
                x += item.size.width + spacing
            }
            y += rowHeight + spacing
        }
    }

    private struct LayoutItem {
        let subview: LayoutSubview
        let size: CGSize
    }

    private func computeRows(proposal: ProposedViewSize, subviews: Subviews) -> [[LayoutItem]] {
        let maxWidth = proposal.width ?? .infinity
        var rows: [[LayoutItem]] = [[]]
        var currentWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            let needed = currentWidth > 0 ? size.width + spacing : size.width
            if currentWidth + needed > maxWidth, !rows[rows.count - 1].isEmpty {
                rows.append([])
                currentWidth = 0
            }
            rows[rows.count - 1].append(LayoutItem(subview: subview, size: size))
            currentWidth += (currentWidth > 0 ? spacing : 0) + size.width
        }
        return rows
    }
}

// MARK: - ParsedUserMessage

/// A displayable pill derived from a detected XML context tag.
struct ContextPill: Identifiable {
    let id: String
    let label: String
    let icon: String
    let content: String?
}

/// Strips XML-like tags (`<reminder>`, `<attachments>`, `<userRequest>`, etc.)
/// from raw user message text, extracting just the readable content.
struct ParsedUserMessage {
    let displayText: String
    let tags: [String]
    /// Extracted raw content keyed by tag name.
    let tagContents: [String: String]

    /// Displayable pills — filtered and with friendly labels.
    var pills: [ContextPill] {
        tags.compactMap { tag in
            let content = tagContents[tag]
            switch tag {
            case "reminder": return ContextPill(id: tag, label: "reminder", icon: "bell", content: content)
            case "context": return ContextPill(id: tag, label: "context", icon: "info.circle", content: content)
            case "attachments": return ContextPill(id: tag, label: "attachments", icon: "paperclip", content: content)
            case "userRequest", "attachment": return nil
            default: return ContextPill(id: tag, label: tag, icon: "tag", content: content)
            }
        }
    }

    /// Known wrapper tags injected by agent hosts around user messages.
    private static let knownTags = ["reminder", "attachments", "attachment", "userRequest", "context"]

    /// Pre-compiled regexes keyed by tag — avoids recreating NSRegularExpression on every render.
    private static let stripRegexes: [String: NSRegularExpression] = {
        var map = [String: NSRegularExpression]()
        for tag in knownTags {
            if let regex = try? NSRegularExpression(pattern: "(?s)<\(tag)[^>]*>.*?</\(tag)>") {
                map[tag] = regex
            }
        }
        return map
    }()

    private static let captureRegexes: [String: NSRegularExpression] = {
        var map = [String: NSRegularExpression]()
        for tag in knownTags {
            if let regex = try? NSRegularExpression(pattern: "(?s)<\(tag)[^>]*>(.*?)</\(tag)>") {
                map[tag] = regex
            }
        }
        return map
    }()

    init(raw: String) {
        var cleaned = raw
        var foundTags: [String] = []
        var contents: [String: String] = [:]

        // If <userRequest>...</userRequest> exists, prefer its content as the display text
        if let userReqContent = ParsedUserMessage.extractContent(from: raw, tag: "userRequest") {
            cleaned = userReqContent
            foundTags.append("userRequest")
            contents["userRequest"] = userReqContent
        }

        // Strip all known XML blocks from cleaned text, extract their content
        for tag in ParsedUserMessage.knownTags {
            guard let regex = ParsedUserMessage.stripRegexes[tag] else { continue }
            let rawRange = NSRange(raw.startIndex..., in: raw)

            // Extract inner content
            if let capRegex = ParsedUserMessage.captureRegexes[tag],
               let match = capRegex.firstMatch(in: raw, range: rawRange),
               let range = Range(match.range(at: 1), in: raw) {
                let extracted = String(raw[range]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !extracted.isEmpty {
                    contents[tag] = extracted
                }
            }

            // Track found tag
            if regex.firstMatch(in: raw, range: rawRange) != nil,
               !foundTags.contains(tag) {
                foundTags.append(tag)
            }

            // Strip from cleaned text
            cleaned = regex.stringByReplacingMatches(
                in: cleaned,
                range: NSRange(cleaned.startIndex..., in: cleaned),
                withTemplate: ""
            )
        }

        self.displayText = cleaned
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ? raw.trimmingCharacters(in: .whitespacesAndNewlines) : cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        self.tags = foundTags
        self.tagContents = contents
    }

    private static func extractContent(from text: String, tag: String) -> String? {
        guard let regex = captureRegexes[tag],
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(match.range(at: 1), in: text) else { return nil }
        let content = String(text[range]).trimmingCharacters(in: .whitespacesAndNewlines)
        return content.isEmpty ? nil : content
    }
}

// MARK: - InputBar Preview Helper

/// Wraps InputBar so FocusState can be provided in a #Preview context.
private struct InputBarPreviewWrapper: View {
    @State private var text = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        InputBar(text: $text, isFocused: $isFocused) { }
    }
}

// MARK: - Previews

#Preview("Request Parts", traits: .fixedLayout(width: 390, height: 1200)) {
    ScrollView {
        VStack(alignment: .leading, spacing: 24) {
            // Plain text message
            Text("Plain Message").font(.caption.bold()).foregroundStyle(.secondary)
            UserBubble(
                text: "Can you help me refactor the auth module?",
                attachments: nil
            )

            // Message with XML tags (raw agent host format)
            Text("With XML Context").font(.caption.bold()).foregroundStyle(.secondary)
            UserBubble(
                text: """
                Fix the login bug on the settings page.
                 <reminder>
                IMPORTANT: this context may or may not be relevant to your tasks.
                </reminder>
                <attachments>
                <attachment id="file:auth.swift">
                User's active selection from auth.swift
                </attachment>
                </attachments>
                <userRequest>
                Fix the login bug on the settings page.
                </userRequest>
                """,
                attachments: nil
            )

            // Message with <userRequest> only
            Text("userRequest Only").font(.caption.bold()).foregroundStyle(.secondary)
            UserBubble(
                text: """
                <context>
                Some hidden context about the workspace.
                </context>
                <userRequest>
                How does the reconnection logic work?
                </userRequest>
                """,
                attachments: nil
            )

            // Message with attachments
            Text("With Attachments").font(.caption.bold()).foregroundStyle(.secondary)
            UserBubble(
                text: "Please review these files",
                attachments: [
                    MessageAttachment(type: .file, uri: "src/auth/login.swift", displayName: "login.swift"),
                    MessageAttachment(type: .directory, uri: "src/models/", displayName: "models"),
                    MessageAttachment(type: .selection, uri: "src/app.swift", displayName: "app.swift (selection)")
                ]
            )

            // Message with XML tags + attachments
            Text("Full Agent Message").font(.caption.bold()).foregroundStyle(.secondary)
            UserBubble(
                text: """
                <reminder>
                IMPORTANT: context may not be relevant
                </reminder>
                <attachments>
                <attachment id="microsoft/agent-host-protocol">
                Repository info
                </attachment>
                </attachments>
                <userRequest>
                Update the AGENTS.md documentation with the new reconnection flow.
                </userRequest>
                """,
                attachments: [
                    MessageAttachment(type: .file, uri: "AGENTS.md", displayName: "AGENTS.md")
                ]
            )

            // Input Bar
            Text("Input Bar").font(.caption.bold()).foregroundStyle(.secondary)
            InputBarPreviewWrapper()
        }
        .padding()
    }
    .environment(AppStore())
}
