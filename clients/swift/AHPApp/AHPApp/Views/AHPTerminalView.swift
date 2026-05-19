import AgentHostProtocol
import SwiftTerm
import SwiftUI
import UIKit

// MARK: - AHPTerminalView (UIKit)

/// A SwiftTerm `TerminalView` backed by AHP terminal state.
///
/// Data flow:
///   terminal/data   →  feed(byteArray:) → SwiftTerm renders VT100
///   terminal/exited  →  (display only, no more input)
///   user keystrokes  →  TerminalViewDelegate.send → store.dispatchTerminalInput
///   view resize      →  TerminalViewDelegate.sizeChanged → store.dispatchTerminalResize
final class AHPTerminalUIView: TerminalView, TerminalViewDelegate {

    private let store: AppStore
    private let terminalURI: String

    /// Tracks the number of content parts we have already replayed so incremental
    /// `terminal/data` appends don't re-feed previously rendered content.
    private var replayedContentCount = 0

    /// Tracks the cumulative length of the tail content part's text that we have
    /// already fed, so appending data to an existing part only feeds the delta.
    private var tailPartFedLength = 0

    /// Whether the view has received a layout pass with non-zero bounds.
    /// Content feeding is deferred until this is true so SwiftTerm has correct
    /// column/row dimensions (frame starts at .zero → 2×1 terminal otherwise).
    private var hasValidLayout = false

    /// When true, the terminal is locked to the server's col/row dimensions
    /// and auto-resize from `layoutSubviews` is suppressed.
    private var lockedToServerSize = false

    /// State queued for replay once the view obtains valid layout dimensions.
    var pendingState: TerminalState?

    init(store: AppStore, terminalURI: String, frame: CGRect = .zero) {
        self.store = store
        self.terminalURI = terminalURI
        super.init(frame: frame)
        terminalDelegate = self
        configureAppearance()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    // MARK: - Layout

    override func layoutSubviews() {
        if lockedToServerSize {
            // Skip super's processSizeChange so SwiftTerm stays at the server's
            // col/row count. We still need UIScrollView layout for scrolling.
            let oldDelegate = terminalDelegate
            terminalDelegate = nil
            super.layoutSubviews()
            terminalDelegate = oldDelegate
        } else {
            super.layoutSubviews()
        }
        if !hasValidLayout && bounds.width > 0 && bounds.height > 0 {
            hasValidLayout = true
            if let state = pendingState {
                replaySnapshot(state)
                pendingState = nil
            }
        }
    }

    // MARK: - Appearance

    private func configureAppearance() {
        let monoFont = UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        font = monoFont
        nativeBackgroundColor = UIColor.black
        nativeForegroundColor = UIColor(white: 0.9, alpha: 1)
    }

    // MARK: - Content Sync

    /// Called when the terminal state changes. Feeds only new data to SwiftTerm.
    func syncContent(from state: TerminalState) {
        guard hasValidLayout else {
            pendingState = state
            return
        }
        let parts = state.content

        // Feed any brand-new content parts that appeared since the last sync.
        for i in replayedContentCount..<parts.count {
            let part = parts[i]
            let text: String
            switch part {
            case .unclassified(let u): text = u.value
            case .command(let c): text = c.output
            }

            if i == replayedContentCount && i == parts.count - 1 {
                // This is the tail part that may have grown since last sync.
                let alreadyFed = tailPartFedLength
                if text.count > alreadyFed {
                    let startIdx = text.index(text.startIndex, offsetBy: alreadyFed)
                    let delta = String(text[startIdx...])
                    feedText(delta)
                }
                tailPartFedLength = text.count
            } else {
                // A part we haven't seen at all — feed it entirely.
                feedText(text)
            }
        }

        // If the previously-tracked tail part grew (same index, longer text),
        // feed just the delta.
        if parts.count == replayedContentCount && !parts.isEmpty {
            let tailIndex = parts.count - 1
            let part = parts[tailIndex]
            let text: String
            switch part {
            case .unclassified(let u): text = u.value
            case .command(let c): text = c.output
            }
            if text.count > tailPartFedLength {
                let startIdx = text.index(text.startIndex, offsetBy: tailPartFedLength)
                let delta = String(text[startIdx...])
                feedText(delta)
                tailPartFedLength = text.count
            }
        }

        if parts.count > replayedContentCount {
            // Moved to new parts — reset tail tracking for the latest part.
            let lastPart = parts[parts.count - 1]
            let lastText: String
            switch lastPart {
            case .unclassified(let u): lastText = u.value
            case .command(let c): lastText = c.output
            }
            tailPartFedLength = lastText.count
            replayedContentCount = parts.count
        }
    }

    /// Replays the full content array from a snapshot (initial subscribe or reconnect).
    /// Resizes SwiftTerm to match the server's col/row count so content renders
    /// exactly as the server intended, with horizontal scrolling if needed.
    func replaySnapshot(_ state: TerminalState) {
        replayedContentCount = 0
        tailPartFedLength = 0

        // Lock to the server's terminal dimensions.
        let serverCols = state.cols ?? 80
        let serverRows = state.rows ?? 24
        let term = getTerminal()
        if term.cols != serverCols || term.rows != serverRows {
            term.resize(cols: serverCols, rows: serverRows)
        }
        lockedToServerSize = true

        for part in state.content {
            switch part {
            case .unclassified(let u):
                if !u.value.isEmpty { feedText(u.value) }
            case .command(let c):
                if !c.output.isEmpty { feedText(c.output) }
            }
        }

        replayedContentCount = state.content.count
        if let lastPart = state.content.last {
            switch lastPart {
            case .unclassified(let u): tailPartFedLength = u.value.count
            case .command(let c): tailPartFedLength = c.output.count
            }
        }
    }

    // MARK: - Helpers

    private func feedText(_ text: String) {
        let bytes = Array(text.utf8)
        feed(byteArray: bytes[0...])
    }

    // MARK: - TerminalViewDelegate

    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        let string = String(bytes: data, encoding: .utf8) ?? ""
        Task { @MainActor in
            await store.dispatchTerminalInput(terminal: terminalURI, data: string)
        }
    }

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        // Don't resize the server's pty when locked to server dimensions.
        guard !lockedToServerSize else { return }
        Task { @MainActor in
            await store.dispatchTerminalResize(terminal: terminalURI, cols: newCols, rows: newRows)
        }
    }

    func scrolled(source: TerminalView, position: Double) {}
    func setTerminalTitle(source: TerminalView, title: String) {}
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
    func clipboardCopy(source: TerminalView, content: Data) {
        UIPasteboard.general.setData(content, forPasteboardType: "public.utf8-plain-text")
    }
    func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
        guard let url = URL(string: link) else { return }
        UIApplication.shared.open(url)
    }
    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}

// MARK: - SwiftUI Wrapper

/// SwiftUI wrapper for `AHPTerminalUIView`. Subscribes to the terminal URI on
/// appearance and streams content updates into SwiftTerm.
struct AHPTerminalSwiftUIView: UIViewRepresentable {
    let terminalURI: String
    @Environment(AppStore.self) private var store

    func makeUIView(context: Context) -> AHPTerminalUIView {
        let view = AHPTerminalUIView(store: store, terminalURI: terminalURI)
        // Queue existing snapshot; it will be replayed once the view has valid layout.
        if let state = store.terminals[terminalURI] {
            view.pendingState = state
        }
        context.coordinator.terminalView = view
        return view
    }

    func updateUIView(_ uiView: AHPTerminalUIView, context: Context) {
        // Sync incremental content updates from the store.
        if let state = store.terminals[terminalURI] {
            uiView.syncContent(from: state)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator {
        var terminalView: AHPTerminalUIView?
    }
}
