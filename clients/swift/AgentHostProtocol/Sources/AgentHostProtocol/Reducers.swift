// Reducers.swift — Pure state reducers for AHP root and session state.
// Hand-written Swift port of types/reducers.ts.

import Foundation

// MARK: - Timestamp Provider

/// Injectable timestamp provider for testing. Returns epoch milliseconds.
public var currentTimestampProvider: () -> Int = {
    Int(Date().timeIntervalSince1970 * 1000)
}

// MARK: - Status Bitset Helpers

/// Bitmask covering the mutually-exclusive activity bits (bits 0–4).
private let statusActivityMask = SessionStatus(rawValue: (1 << 5) - 1)

/// Sets or clears a metadata flag on a status value.
private func withStatusFlag(_ status: SessionStatus, _ flag: SessionStatus, _ set: Bool) -> SessionStatus {
    set ? status.union(flag) : status.subtracting(flag)
}

/// Resolves a selected confirmation option by ID from a pending-confirmation state.
private func resolveSelectedOption(_ options: [ConfirmationOption]?, id: String?) -> ConfirmationOption? {
    guard let id, let options else {
        return nil
    }
    return options.first { $0.id == id }
}

// MARK: - Root Reducer

/// Pure reducer for root state.
public func rootReducer(state: RootState, action: StateAction) -> RootState {
    switch action {
    case .rootAgentsChanged(let a):
        var next = state
        next.agents = a.agents
        return next

    case .rootActiveSessionsChanged(let a):
        var next = state
        next.activeSessions = a.activeSessions
        return next

    case .rootTerminalsChanged(let a):
        var next = state
        next.terminals = a.terminals
        return next

    case .rootConfigChanged(let a):
        guard var config = state.config else {
            return state
        }
        config.values = a.replace == true ? a.config : config.values.merging(a.config) { _, new in new }
        var next = state
        next.config = config
        return next

    default:
        return state
    }
}

// MARK: - Session Reducer

/// Pure reducer for session state.
public func sessionReducer(state: SessionState, action: StateAction) -> SessionState {
    switch action {

    // ── Lifecycle ──────────────────────────────────────────────────────────

    case .sessionReady:
        // Lifecycle-only transition. Must not touch `summary.status`: see
        // the equivalent TypeScript reducer for the rationale.
        var next = state
        next.lifecycle = .ready
        return next

    case .sessionCreationFailed(let a):
        var next = state
        next.lifecycle = .creationFailed
        next.creationError = a.error
        return next

    // ── Turn Lifecycle ────────────────────────────────────────────────────

    case .sessionTurnStarted(let a):
        var next = state
        next.summary.modifiedAt = currentTimestamp()
        next.activeTurn = ActiveTurn(
            id: a.turnId,
            message: a.message,
            responseParts: [],
            usage: nil
        )
        // If auto-started from a pending message, remove it
        if let queuedId = a.queuedMessageId {
            if next.steeringMessage?.id == queuedId {
                next.steeringMessage = nil
            }
            if var queued = next.queuedMessages {
                queued.removeAll { $0.id == queuedId }
                next.queuedMessages = queued.isEmpty ? nil : queued
            }
        }
        next.summary.status = withStatusFlag(sessionSummaryStatus(next), .isRead, false)
        return next

    case .sessionDelta(let a):
        return updateResponsePart(state: state, turnId: a.turnId, partId: a.partId) { part in
            guard case .markdown(var md) = part else { return part }
            md.content += a.content
            return .markdown(md)
        }

    case .sessionResponsePart(let a):
        guard var activeTurn = state.activeTurn, activeTurn.id == a.turnId else {
            return state
        }
        activeTurn.responseParts.append(a.part)
        var next = state
        next.activeTurn = activeTurn
        return next

    case .sessionTurnComplete(let a):
        return endTurn(state: state, turnId: a.turnId, turnState: .complete)

    case .sessionTurnCancelled(let a):
        return endTurn(state: state, turnId: a.turnId, turnState: .cancelled)

    case .sessionError(let a):
        return endTurn(state: state, turnId: a.turnId, turnState: .error, terminalStatus: .error, error: a.error)

    // ── Tool Call State Machine ───────────────────────────────────────────

    case .sessionToolCallStart(let a):
        guard var activeTurn = state.activeTurn, activeTurn.id == a.turnId else {
            return state
        }
        let toolCallPart = ToolCallResponsePart(
            kind: .toolCall,
            toolCall: .streaming(ToolCallStreamingState(
                toolCallId: a.toolCallId,
                toolName: a.toolName,
                displayName: a.displayName,
                contributor: a.contributor,
                meta: a.meta,
                status: .streaming
            ))
        )
        activeTurn.responseParts.append(.toolCall(toolCallPart))
        var next = state
        next.activeTurn = activeTurn
        return next

    case .sessionToolCallDelta(let a):
        return updateToolCall(state: state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
            guard case .streaming(var s) = tc else { return tc }
            s.meta = a.meta ?? s.meta
            s.partialInput = (s.partialInput ?? "") + a.content
            if let msg = a.invocationMessage {
                s.invocationMessage = msg
            }
            return .streaming(s)
        }

    case .sessionToolCallReady(let a):
        return refreshSummaryStatus(updateToolCall(state: state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
            // Only process if currently streaming or running (matches TS behavior)
            switch tc {
            case .streaming, .running: break
            default: return tc
            }
            let base = tc.baseFields
            let meta = a.meta ?? base.meta
            if let confirmed = a.confirmed {
                return .running(ToolCallRunningState(
                    toolCallId: base.toolCallId,
                    toolName: base.toolName,
                    displayName: base.displayName,
                    contributor: base.contributor,
                    meta: meta,
                    invocationMessage: a.invocationMessage,
                    toolInput: a.toolInput,
                    status: .running,
                    confirmed: confirmed
                ))
            }
            return .pendingConfirmation(ToolCallPendingConfirmationState(
                toolCallId: base.toolCallId,
                toolName: base.toolName,
                displayName: base.displayName,
                contributor: base.contributor,
                meta: meta,
                invocationMessage: a.invocationMessage,
                toolInput: a.toolInput,
                status: .pendingConfirmation,
                confirmationTitle: a.confirmationTitle,
                edits: a.edits,
                editable: a.editable,
                options: a.options
            ))
        })

    case .sessionToolCallConfirmed(let a):
        return refreshSummaryStatus(updateToolCall(state: state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
            guard case .pendingConfirmation(let pending) = tc else { return tc }
            let base = tc.baseFields
            let meta = a.meta ?? base.meta
            let selectedOption = resolveSelectedOption(pending.options, id: a.selectedOptionId)
            if a.approved {
                return .running(ToolCallRunningState(
                    toolCallId: base.toolCallId,
                    toolName: base.toolName,
                    displayName: base.displayName,
                    contributor: base.contributor,
                    meta: meta,
                    invocationMessage: pending.invocationMessage,
                    toolInput: a.editedToolInput ?? pending.toolInput,
                    status: .running,
                    confirmed: a.confirmed ?? .notNeeded,
                    selectedOption: selectedOption
                ))
            }
            return .cancelled(ToolCallCancelledState(
                toolCallId: base.toolCallId,
                toolName: base.toolName,
                displayName: base.displayName,
                contributor: base.contributor,
                meta: meta,
                invocationMessage: pending.invocationMessage,
                toolInput: pending.toolInput,
                status: .cancelled,
                reason: a.reason ?? .denied,
                reasonMessage: a.reasonMessage,
                userSuggestion: a.userSuggestion,
                selectedOption: selectedOption
            ))
        })

    case .sessionToolCallComplete(let a):
        return refreshSummaryStatus(updateToolCall(state: state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
            let base = tc.baseFields
            let meta = a.meta ?? base.meta
            let confirmed: ToolCallConfirmationReason
            let invocationMessage: StringOrMarkdown
            let toolInput: String?
            let selectedOption: ConfirmationOption?
            switch tc {
            case .running(let r):
                confirmed = r.confirmed
                invocationMessage = r.invocationMessage
                toolInput = r.toolInput
                selectedOption = r.selectedOption
            case .pendingConfirmation(let p):
                confirmed = .notNeeded
                invocationMessage = p.invocationMessage
                toolInput = p.toolInput
                selectedOption = nil
            default:
                return tc
            }

            if a.requiresResultConfirmation == true {
                return .pendingResultConfirmation(ToolCallPendingResultConfirmationState(
                    toolCallId: base.toolCallId,
                    toolName: base.toolName,
                    displayName: base.displayName,
                    contributor: base.contributor,
                    meta: meta,
                    invocationMessage: invocationMessage,
                    toolInput: toolInput,
                    success: a.result.success,
                    pastTenseMessage: a.result.pastTenseMessage,
                    content: a.result.content,
                    structuredContent: a.result.structuredContent,
                    error: a.result.error,
                    status: .pendingResultConfirmation,
                    confirmed: confirmed,
                    selectedOption: selectedOption
                ))
            }
            return .completed(ToolCallCompletedState(
                toolCallId: base.toolCallId,
                toolName: base.toolName,
                displayName: base.displayName,
                contributor: base.contributor,
                meta: meta,
                invocationMessage: invocationMessage,
                toolInput: toolInput,
                success: a.result.success,
                pastTenseMessage: a.result.pastTenseMessage,
                content: a.result.content,
                structuredContent: a.result.structuredContent,
                error: a.result.error,
                status: .completed,
                confirmed: confirmed,
                selectedOption: selectedOption
            ))
        })

    case .sessionToolCallResultConfirmed(let a):
        return refreshSummaryStatus(updateToolCall(state: state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
            guard case .pendingResultConfirmation(let prc) = tc else { return tc }
            let base = tc.baseFields
            let meta = a.meta ?? base.meta
            if a.approved {
                return .completed(ToolCallCompletedState(
                    toolCallId: base.toolCallId,
                    toolName: base.toolName,
                    displayName: base.displayName,
                    contributor: base.contributor,
                    meta: meta,
                    invocationMessage: prc.invocationMessage,
                    toolInput: prc.toolInput,
                    success: prc.success,
                    pastTenseMessage: prc.pastTenseMessage,
                    content: prc.content,
                    structuredContent: prc.structuredContent,
                    error: prc.error,
                    status: .completed,
                    confirmed: prc.confirmed,
                    selectedOption: prc.selectedOption
                ))
            }
            return .cancelled(ToolCallCancelledState(
                toolCallId: base.toolCallId,
                toolName: base.toolName,
                displayName: base.displayName,
                contributor: base.contributor,
                meta: meta,
                invocationMessage: prc.invocationMessage,
                toolInput: prc.toolInput,
                status: .cancelled,
                reason: .resultDenied,
                selectedOption: prc.selectedOption
            ))
        })

    // ── Metadata ──────────────────────────────────────────────────────────

    case .sessionTitleChanged(let a):
        var next = state
        next.summary.title = a.title
        next.summary.modifiedAt = currentTimestamp()
        return next

    case .sessionUsage(let a):
        guard var activeTurn = state.activeTurn, activeTurn.id == a.turnId else {
            return state
        }
        activeTurn.usage = a.usage
        var next = state
        next.activeTurn = activeTurn
        return next

    case .sessionReasoning(let a):
        return updateResponsePart(state: state, turnId: a.turnId, partId: a.partId) { part in
            guard case .reasoning(var r) = part else { return part }
            r.content += a.content
            return .reasoning(r)
        }

    case .sessionModelChanged(let a):
        var next = state
        next.summary.model = a.model
        next.summary.modifiedAt = currentTimestamp()
        return next

    case .sessionAgentChanged(let a):
        var next = state
        next.summary.agent = a.agent
        next.summary.modifiedAt = currentTimestamp()
        return next

    case .sessionActivityChanged(let a):
        var next = state
        next.summary.activity = a.activity
        return next

    case .sessionChangesetsChanged(let a):
        var next = state
        next.changesets = a.changesets
        return next

    case .sessionConfigChanged(let a):
        guard var config = state.config else { return state }
        config.values = a.replace == true ? a.config : config.values.merging(a.config) { _, new in new }
        var next = state
        next.config = config
        next.summary.modifiedAt = currentTimestamp()
        return next

    case .sessionMetaChanged(let a):
        var next = state
        next.meta = a.meta
        return next

    case .sessionServerToolsChanged(let a):
        var next = state
        next.serverTools = a.tools
        return next

    case .sessionActiveClientChanged(let a):
        var next = state
        next.activeClient = a.activeClient
        return next

    case .sessionActiveClientToolsChanged(let a):
        guard var activeClient = state.activeClient else { return state }
        activeClient.tools = a.tools
        var next = state
        next.activeClient = activeClient
        return next

    // ── Customizations ──────────────────────────────────────────────────

    case .sessionCustomizationsChanged(let a):
        var next = state
        next.customizations = a.customizations
        return next

    case .sessionCustomizationToggled(let a):
        guard var list = state.customizations else { return state }
        guard toggleCustomization(in: &list, id: a.id, enabled: a.enabled) else { return state }
        var next = state
        next.customizations = list
        return next

    case .sessionCustomizationUpdated(let a):
        var list = state.customizations ?? []
        if let idx = list.firstIndex(where: { customizationId($0) == customizationId(a.customization) }) {
            list[idx] = a.customization
        } else {
            list.append(a.customization)
        }
        var next = state
        next.customizations = list
        return next

    case .sessionCustomizationRemoved(let a):
        guard var list = state.customizations else { return state }
        if let idx = list.firstIndex(where: { customizationId($0) == a.id }) {
            list.remove(at: idx)
            var next = state
            next.customizations = list
            return next
        }
        for containerIdx in list.indices {
            var container = list[containerIdx]
            guard var children = customizationChildren(container) else { continue }
            if let idx = children.firstIndex(where: { childId($0) == a.id }) {
                children.remove(at: idx)
                setCustomizationChildren(&container, children)
                list[containerIdx] = container
                var next = state
                next.customizations = list
                return next
            }
        }
        return state

    case .sessionMcpServerStatusChanged(let a):
        guard var list = state.customizations else { return state }
        if let topIdx = list.firstIndex(where: { customizationId($0) == a.id }) {
            guard case .mcpServer(var entry) = list[topIdx] else { return state }
            entry.state = a.state
            entry.channel = a.channel
            list[topIdx] = .mcpServer(entry)
            var next = state
            next.customizations = list
            return next
        }
        var changed = false
        for containerIdx in list.indices {
            var container = list[containerIdx]
            guard var children = customizationChildren(container) else { continue }
            guard let childIdx = children.firstIndex(where: { childId($0) == a.id }) else { continue }
            guard case .mcpServer(var child) = children[childIdx] else { continue }
            child.state = a.state
            child.channel = a.channel
            children[childIdx] = .mcpServer(child)
            setCustomizationChildren(&container, children)
            list[containerIdx] = container
            changed = true
            break
        }
        guard changed else { return state }
        var next = state
        next.customizations = list
        return next

    // ── Truncation ────────────────────────────────────────────────────────

    case .sessionTruncated(let a):
        let turns: [Turn]
        if let turnId = a.turnId {
            guard let idx = state.turns.firstIndex(where: { $0.id == turnId }) else {
                return state
            }
            turns = Array(state.turns.prefix(idx + 1))
        } else {
            turns = []
        }
        var next = state
        next.turns = turns
        next.activeTurn = nil
        next.inputRequests = nil
        next.summary.status = sessionSummaryStatus(next)
        next.summary.modifiedAt = currentTimestamp()
        return next

    // ── Read / Archived ─────────────────────────────────────────────────

    case .sessionIsReadChanged(let a):
        var next = state
        next.summary.status = withStatusFlag(next.summary.status, .isRead, a.isRead)
        return next

    case .sessionIsArchivedChanged(let a):
        var next = state
        next.summary.status = withStatusFlag(next.summary.status, .isArchived, a.isArchived)
        return next


    // ── Tool Call Content ────────────────────────────────────────────────

    case .sessionToolCallContentChanged(let a):
        return updateToolCall(state: state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
            guard case .running(var r) = tc else { return tc }
            r.meta = a.meta ?? r.meta
            r.content = a.content
            return .running(r)
        }

    // ── Pending Messages ──────────────────────────────────────────────────

    case .sessionPendingMessageSet(let a):
        let entry = PendingMessage(id: a.id, message: a.message)
        var next = state
        if a.kind == .steering {
            next.steeringMessage = entry
            return next
        }
        var existing = next.queuedMessages ?? []
        if let idx = existing.firstIndex(where: { $0.id == a.id }) {
            existing[idx] = entry
        } else {
            existing.append(entry)
        }
        next.queuedMessages = existing
        return next

    case .sessionPendingMessageRemoved(let a):
        var next = state
        if a.kind == .steering {
            guard next.steeringMessage?.id == a.id else { return state }
            next.steeringMessage = nil
            return next
        }
        guard var existing = next.queuedMessages else { return state }
        let before = existing.count
        existing.removeAll { $0.id == a.id }
        guard existing.count != before else { return state }
        next.queuedMessages = existing.isEmpty ? nil : existing
        return next

    case .sessionQueuedMessagesReordered(let a):
        guard let existing = state.queuedMessages else { return state }
        let byId = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })
        var ordered = Set<String>()
        var reordered: [PendingMessage] = a.order.compactMap { id in
            guard let msg = byId[id], !ordered.contains(id) else { return nil }
            ordered.insert(id)
            return msg
        }
        // Append any messages not in the new order
        for m in existing where !ordered.contains(m.id) {
            reordered.append(m)
        }
        var next = state
        next.queuedMessages = reordered
        return next

    // ── Session Input Requests ─────────────────────────────────────────────

    case .sessionInputRequested(let a):
        return upsertInputRequest(state: state, request: a.request)

    case .sessionInputAnswerChanged(let a):
        guard var existing = state.inputRequests,
              let idx = existing.firstIndex(where: { $0.id == a.requestId }) else {
            return state
        }
        var request = existing[idx]
        var answers = request.answers ?? [:]
        if let answer = a.answer {
            answers[a.questionId] = answer
        } else {
            answers.removeValue(forKey: a.questionId)
        }
        request.answers = answers.isEmpty ? nil : answers
        existing[idx] = request
        var next = state
        next.inputRequests = existing
        next.summary.modifiedAt = currentTimestamp()
        return next

    case .sessionInputCompleted(let a):
        guard var existing = state.inputRequests,
              existing.contains(where: { $0.id == a.requestId }) else {
            return state
        }
        existing.removeAll { $0.id == a.requestId }
        var next = state
        next.inputRequests = existing.isEmpty ? nil : existing
        next.summary.status = sessionSummaryStatus(next)
        next.summary.modifiedAt = currentTimestamp()
        return next

    default:
        return state
    }
}

// MARK: - Client Dispatchable

/// Set of action types that clients are allowed to dispatch.
public let clientDispatchableActions: Set<String> = [
    "session/turnStarted",
    "session/toolCallConfirmed",
    "session/toolCallComplete",
    "session/toolCallResultConfirmed",
    "session/turnCancelled",
    "session/modelChanged",
    "session/activeClientChanged",
    "session/activeClientToolsChanged",
    "session/pendingMessageSet",
    "session/pendingMessageRemoved",
    "session/queuedMessagesReordered",
    "session/inputAnswerChanged",
    "session/inputCompleted",
    "session/customizationToggled",
    "session/isReadChanged",
    "session/isArchivedChanged",
]

/// Checks whether an action may be dispatched by a client.
public func isClientDispatchable(_ action: StateAction) -> Bool {
    switch action {
    case .sessionTurnStarted, .sessionToolCallConfirmed, .sessionToolCallComplete,
         .sessionToolCallResultConfirmed, .sessionTurnCancelled,
         .sessionModelChanged, .sessionActiveClientChanged,
         .sessionActiveClientToolsChanged, .sessionPendingMessageSet,
         .sessionPendingMessageRemoved, .sessionQueuedMessagesReordered,
         .sessionInputAnswerChanged, .sessionInputCompleted,
         .sessionCustomizationToggled, .sessionIsReadChanged,
         .sessionIsArchivedChanged:
        return true
    default:
        return false
    }
}

// MARK: - Helpers

private func currentTimestamp() -> Int {
    currentTimestampProvider()
}

private func sessionSummaryStatus(_ state: SessionState, terminalStatus: SessionStatus? = nil) -> SessionStatus {
    let activity: SessionStatus
    if let terminalStatus {
        activity = terminalStatus
    } else if state.inputRequests?.isEmpty == false || hasPendingToolCallConfirmation(state) {
        activity = .inputNeeded
    } else if state.activeTurn != nil {
        activity = .inProgress
    } else {
        activity = .idle
    }
    return state.summary.status.subtracting(statusActivityMask).union(activity)
}

/// Returns `true` if the active turn has any tool call awaiting user confirmation.
private func hasPendingToolCallConfirmation(_ state: SessionState) -> Bool {
    guard let activeTurn = state.activeTurn else { return false }
    for part in activeTurn.responseParts {
        guard case .toolCall(let tcPart) = part else { continue }
        switch tcPart.toolCall {
        case .pendingConfirmation, .pendingResultConfirmation:
            return true
        default:
            continue
        }
    }
    return false
}

/// Returns a state with `summary.status` recomputed. Use this after reducers
/// that change data feeding into `sessionSummaryStatus` (e.g. tool call
/// lifecycle transitions that may enter or leave a pending-confirmation state).
private func refreshSummaryStatus(_ state: SessionState) -> SessionState {
    let status = sessionSummaryStatus(state)
    guard status != state.summary.status else { return state }
    var next = state
    next.summary.status = status
    return next
}

private func upsertInputRequest(state: SessionState, request: SessionInputRequest) -> SessionState {
    var next = state
    var existing = next.inputRequests ?? []
    if let idx = existing.firstIndex(where: { $0.id == request.id }) {
        var replacement = request
        replacement.answers = request.answers ?? existing[idx].answers
        existing[idx] = replacement
    } else {
        existing.append(request)
    }
    next.inputRequests = existing
    next.summary.status = withStatusFlag(sessionSummaryStatus(next), .isRead, false)
    next.summary.modifiedAt = currentTimestamp()
    return next
}

// ToolCallBaseFields and toolCallBase() are now shared via
// ToolCallState.baseFields in ToolCallStateExtensions.swift.

/// Ends the active turn, producing a completed Turn record.
/// Non-terminal tool calls are forced to cancelled.
private func endTurn(
    state: SessionState,
    turnId: String,
    turnState: TurnState,
    terminalStatus: SessionStatus? = nil,
    error: ErrorInfo? = nil
) -> SessionState {
    guard let activeTurn = state.activeTurn, activeTurn.id == turnId else {
        return state
    }

    let responseParts: [ResponsePart] = activeTurn.responseParts.map { part in
        guard case .toolCall(let tcPart) = part else { return part }
        let tc = tcPart.toolCall
        switch tc {
        case .completed, .cancelled:
            return part
        default:
            let base = tc.baseFields
            let invocationMessage: StringOrMarkdown
            let toolInput: String?
            switch tc {
            case .streaming(let s):
                invocationMessage = s.invocationMessage ?? .string("")
                toolInput = nil
            case .pendingConfirmation(let p):
                invocationMessage = p.invocationMessage
                toolInput = p.toolInput
            case .running(let r):
                invocationMessage = r.invocationMessage
                toolInput = r.toolInput
            case .pendingResultConfirmation(let r):
                invocationMessage = r.invocationMessage
                toolInput = r.toolInput
            default:
                invocationMessage = .string("")
                toolInput = nil
            }
            return .toolCall(ToolCallResponsePart(
                kind: .toolCall,
                toolCall: .cancelled(ToolCallCancelledState(
                    toolCallId: base.toolCallId,
                    toolName: base.toolName,
                    displayName: base.displayName,
                    contributor: base.contributor,
                    meta: base.meta,
                    invocationMessage: invocationMessage,
                    toolInput: toolInput,
                    status: .cancelled,
                    reason: .skipped
                ))
            ))
        }
    }

    let turn = Turn(
        id: activeTurn.id,
        message: activeTurn.message,
        responseParts: responseParts,
        usage: activeTurn.usage,
        state: turnState,
        error: error
    )

    var next = state
    next.turns.append(turn)
    next.activeTurn = nil
    next.inputRequests = nil
    next.summary.status = sessionSummaryStatus(next, terminalStatus: terminalStatus)
    next.summary.modifiedAt = currentTimestamp()
    return next
}

/// Updates a tool call inside the active turn's response parts.
private func updateToolCall(
    state: SessionState,
    turnId: String,
    toolCallId: String,
    updater: (ToolCallState) -> ToolCallState
) -> SessionState {
    guard var activeTurn = state.activeTurn, activeTurn.id == turnId else {
        return state
    }

    var found = false
    let parts: [ResponsePart] = activeTurn.responseParts.map { part in
        guard case .toolCall(var tcPart) = part else { return part }
        guard tcPart.toolCall.toolCallId == toolCallId else { return part }
        found = true
        tcPart.toolCall = updater(tcPart.toolCall)
        return .toolCall(tcPart)
    }

    guard found else { return state }
    activeTurn.responseParts = parts
    var next = state
    next.activeTurn = activeTurn
    return next
}

/// Updates a response part identified by partId in the active turn.
private func updateResponsePart(
    state: SessionState,
    turnId: String,
    partId: String,
    updater: (ResponsePart) -> ResponsePart
) -> SessionState {
    guard var activeTurn = state.activeTurn, activeTurn.id == turnId else {
        return state
    }

    var found = false
    let parts: [ResponsePart] = activeTurn.responseParts.map { part in
        guard !found else { return part }
        guard part.partId == partId else { return part }
        found = true
        return updater(part)
    }

    guard found else { return state }
    activeTurn.responseParts = parts
    var next = state
    next.activeTurn = activeTurn
    return next
}

// MARK: - Terminal Reducer

/// Pure reducer for terminal state. Handles all terminal-scoped actions.
public func terminalReducer(state: TerminalState, action: StateAction) -> TerminalState {
    switch action {
    case .terminalData(let a):
        var content = state.content
        if let tail = content.last {
            switch tail {
            case .command(var cmd) where !cmd.isComplete:
                cmd.output += a.data
                content[content.count - 1] = .command(cmd)
            case .unclassified(var u):
                u.value += a.data
                content[content.count - 1] = .unclassified(u)
            default:
                content.append(.unclassified(TerminalUnclassifiedPart(type: "unclassified", value: a.data)))
            }
        } else {
            content.append(.unclassified(TerminalUnclassifiedPart(type: "unclassified", value: a.data)))
        }
        var next = state
        next.content = content
        return next

    case .terminalInput:
        // Side-effect-only: forwarded to pty by the server.
        return state

    case .terminalResized(let a):
        var next = state
        next.cols = a.cols
        next.rows = a.rows
        return next

    case .terminalClaimed(let a):
        var next = state
        next.claim = a.claim
        return next

    case .terminalTitleChanged(let a):
        var next = state
        next.title = a.title
        return next

    case .terminalCwdChanged(let a):
        var next = state
        next.cwd = a.cwd
        return next

    case .terminalExited(let a):
        var next = state
        next.exitCode = a.exitCode
        return next

    case .terminalCleared:
        var next = state
        next.content = []
        return next

    case .terminalCommandDetectionAvailable:
        var next = state
        next.supportsCommandDetection = true
        return next

    case .terminalCommandExecuted(let a):
        let part = TerminalCommandPart(
            type: "command",
            commandId: a.commandId,
            commandLine: a.commandLine,
            output: "",
            timestamp: a.timestamp,
            isComplete: false,
            exitCode: nil,
            durationMs: nil
        )
        var next = state
        next.content.append(.command(part))
        next.supportsCommandDetection = true
        return next

    case .terminalCommandFinished(let a):
        var next = state
        next.content = next.content.map { part in
            if case .command(var cmd) = part, cmd.commandId == a.commandId {
                cmd.isComplete = true
                cmd.exitCode = a.exitCode
                cmd.durationMs = a.durationMs
                return .command(cmd)
            }
            return part
        }
        return next

    default:
        return state
    }
}

// MARK: - Changeset Reducer

/// Pure reducer for changeset state. Handles all changeset-scoped actions.
///
/// Per the spec, every changeset action is server-only. New files are
/// appended via `changeset/fileSet` when the id is unknown and replaced in
/// place when it matches an existing entry, preserving a stable file order.
public func changesetReducer(state: ChangesetState, action: StateAction) -> ChangesetState {
    switch action {
    case .changesetStatusChanged(let a):
        // Carry `error` only when the new status is `error` so we don't leave a
        // stale error sitting on a recovered changeset.
        var next = state
        next.status = a.status
        next.error = a.status == .error ? a.error : nil
        return next

    case .changesetFileSet(let a):
        var next = state
        if let idx = next.files.firstIndex(where: { $0.id == a.file.id }) {
            next.files[idx] = a.file
        } else {
            next.files.append(a.file)
        }
        return next

    case .changesetFileRemoved(let a):
        guard let idx = state.files.firstIndex(where: { $0.id == a.fileId }) else {
            return state
        }
        var next = state
        next.files.remove(at: idx)
        return next

    case .changesetOperationsChanged(let a):
        // `operations` is nil when the action omits the field, which clears the
        // operation list.
        var next = state
        next.operations = a.operations
        return next

    case .changesetOperationStatusChanged(let a):
        guard var operations = state.operations,
              let idx = operations.firstIndex(where: { $0.id == a.operationId }) else {
            return state
        }
        var op = operations[idx]
        op.status = a.status
        // Carry `error` only when the new status is `error` so we don't leave a
        // stale error on an operation that recovered or started running.
        op.error = a.status == .error ? a.error : nil
        operations[idx] = op
        var next = state
        next.operations = operations
        return next

    case .changesetCleared:
        guard !state.files.isEmpty else { return state }
        var next = state
        next.files = []
        return next

    default:
        return state
    }
}

// MARK: - Resource-Watch Reducer

/// Pure reducer for resource-watch state. Handles every resource-watch action.
///
/// Watches are intentionally event-pass-through: change events are delivered
/// via `resourceWatch/changed` actions but the reducer keeps no history of
/// them. The state therefore tracks only the watch descriptor, which is set at
/// subscription time and never mutates over the life of the watch. Unknown
/// action types degrade gracefully so a client speaking an older protocol stays
/// correct if the server adds new `resourceWatch/*` actions in a future version.
public func resourceWatchReducer(state: ResourceWatchState, action: StateAction) -> ResourceWatchState {
    switch action {
    case .resourceWatchChanged:
        return state

    default:
        return state
    }
}
