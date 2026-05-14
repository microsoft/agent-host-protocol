// NativeReducer.swift — Protocol-based reducer pattern for AHP.
//
// Inspired by Swift by Sundell's reducer patterns and
// the Composable Architecture (TCA) from Point-Free.
//
// This provides an idiomatic Swift reducer abstraction using:
//   - A `Reducer` protocol with associated `State` and `Action` types
//   - `inout` mutation for ergonomic state updates
//   - Struct-based conformers for `RootReducer` and `SessionReducer`
//   - Composable design allowing reducer combination

import Foundation

// MARK: - Reducer Protocol

/// A pure function that transforms state in response to an action.
///
/// Conforming types encapsulate the logic for a specific state domain.
/// The `reduce(into:action:)` method mutates state in place using `inout`,
/// which is both ergonomic and efficient with Swift's copy-on-write semantics.
///
/// Example usage:
/// ```swift
/// let reducer = AHPSessionReducer()
/// var state = SessionState(...)
/// reducer.reduce(into: &state, action: .sessionReady(...))
/// ```
public protocol Reducer {
    associatedtype State
    associatedtype Action

    /// Applies an action to the given state, mutating it in place.
    func reduce(into state: inout State, action: Action)
}

// MARK: - AnyReducer (Type Erasure)

/// A type-erased reducer that wraps any `Reducer` conforming type.
///
/// Useful for storing reducers in collections or passing them as parameters
/// without exposing the concrete type.
public struct AnyReducer<State, Action>: Reducer {
    private let _reduce: (inout State, Action) -> Void

    public init<R: Reducer>(_ reducer: R) where R.State == State, R.Action == Action {
        self._reduce = reducer.reduce
    }

    public init(reduce: @escaping (inout State, Action) -> Void) {
        self._reduce = reduce
    }

    public func reduce(into state: inout State, action: Action) {
        _reduce(&state, action)
    }
}

// MARK: - CombinedReducer

/// Combines multiple reducers into one, applying them in sequence.
///
/// This enables composing smaller, focused reducers into a larger one.
/// Each reducer operates on the same state and action types.
public struct CombinedReducer<State, Action>: Reducer {
    private let reducers: [AnyReducer<State, Action>]

    public init(_ reducers: [AnyReducer<State, Action>]) {
        self.reducers = reducers
    }

    public func reduce(into state: inout State, action: Action) {
        for reducer in reducers {
            reducer.reduce(into: &state, action: action)
        }
    }
}

// MARK: - Root Reducer (Protocol-based)

/// Protocol-based root reducer for AHP root state.
///
/// Uses `inout` mutation for idiomatic Swift state updates instead of
/// creating copies with spread operators.
public struct AHPRootReducer: Reducer {
    public typealias State = RootState
    public typealias Action = StateAction

    public init() {}

    public func reduce(into state: inout RootState, action: StateAction) {
        switch action {
        case .rootAgentsChanged(let a):
            state.agents = a.agents

        case .rootActiveSessionsChanged(let a):
            state.activeSessions = a.activeSessions

        case .rootTerminalsChanged(let a):
            state.terminals = a.terminals

        case .rootConfigChanged(let a):
            guard var config = state.config else { return }
            config.values = a.replace == true ? a.config : config.values.merging(a.config) { _, new in new }
            state.config = config

        default:
            break
        }
    }
}

// MARK: - Session Reducer (Protocol-based)

/// Protocol-based session reducer for AHP session state.
///
/// This is a native Swift implementation of the session reducer using
/// idiomatic patterns:
///   - `inout` mutation instead of copy-on-write spread
///   - Guard-based early returns
///   - Pattern matching on enums
///   - Helper methods as private functions
public struct AHPSessionReducer: Reducer {
    public typealias State = SessionState
    public typealias Action = StateAction

    public init() {}

    public func reduce(into state: inout SessionState, action: StateAction) {
        switch action {

        // ── Lifecycle ──────────────────────────────────────────────────────────

        case .sessionReady:
            state.lifecycle = .ready
            state.summary.status = .idle

        case .sessionCreationFailed(let a):
            state.lifecycle = .creationFailed
            state.creationError = a.error

        // ── Turn Lifecycle ────────────────────────────────────────────────────

        case .sessionTurnStarted(let a):
            state.summary.modifiedAt = currentTimestamp()
            state.activeTurn = ActiveTurn(
                id: a.turnId,
                userMessage: a.userMessage,
                responseParts: [],
                usage: nil
            )
            // If auto-started from a pending message, remove it
            if let queuedId = a.queuedMessageId {
                if state.steeringMessage?.id == queuedId {
                    state.steeringMessage = nil
                }
                if var queued = state.queuedMessages {
                    queued.removeAll { $0.id == queuedId }
                    state.queuedMessages = queued.isEmpty ? nil : queued
                }
            }
            state.summary.status = Self.withStatusFlag(Self.sessionSummaryStatus(state), .isRead, false)

        case .sessionDelta(let a):
            Self.updateResponsePartInPlace(state: &state, turnId: a.turnId, partId: a.partId) { part in
                guard case .markdown(var md) = part else { return }
                md.content += a.content
                part = .markdown(md)
            }

        case .sessionResponsePart(let a):
            guard state.activeTurn?.id == a.turnId else { return }
            state.activeTurn?.responseParts.append(a.part)

        case .sessionTurnComplete(let a):
            Self.endTurn(state: &state, turnId: a.turnId, turnState: .complete)

        case .sessionTurnCancelled(let a):
            Self.endTurn(state: &state, turnId: a.turnId, turnState: .cancelled)

        case .sessionError(let a):
            Self.endTurn(state: &state, turnId: a.turnId, turnState: .error, terminalStatus: .error, error: a.error)

        // ── Tool Call State Machine ───────────────────────────────────────────

        case .sessionToolCallStart(let a):
            guard state.activeTurn?.id == a.turnId else { return }
            let toolCallPart = ToolCallResponsePart(
                kind: .toolCall,
                toolCall: .streaming(ToolCallStreamingState(
                    toolCallId: a.toolCallId,
                    toolName: a.toolName,
                    displayName: a.displayName,
                    toolClientId: a.toolClientId,
                    meta: a.meta,
                    status: .streaming
                ))
            )
            state.activeTurn?.responseParts.append(.toolCall(toolCallPart))

        case .sessionToolCallDelta(let a):
            Self.updateToolCallInPlace(state: &state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
                guard case .streaming(var s) = tc else { return }
                s.partialInput = (s.partialInput ?? "") + a.content
                if let msg = a.invocationMessage {
                    s.invocationMessage = msg
                }
                tc = .streaming(s)
            }

        case .sessionToolCallReady(let a):
            Self.updateToolCallInPlace(state: &state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
                // Only process if currently streaming or running
                switch tc {
                case .streaming, .running: break
                default: return
                }
                let base = tc.baseFields
                if let confirmed = a.confirmed {
                    tc = .running(ToolCallRunningState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
                        invocationMessage: a.invocationMessage,
                        toolInput: a.toolInput,
                        status: .running,
                        confirmed: confirmed
                    ))
                } else {
                    tc = .pendingConfirmation(ToolCallPendingConfirmationState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
                        invocationMessage: a.invocationMessage,
                        toolInput: a.toolInput,
                        status: .pendingConfirmation,
                        confirmationTitle: a.confirmationTitle,
                        edits: a.edits,
                        editable: a.editable,
                        options: a.options
                    ))
                }
            }
            Self.refreshSummaryStatus(&state)

        case .sessionToolCallConfirmed(let a):
            Self.updateToolCallInPlace(state: &state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
                guard case .pendingConfirmation(let pending) = tc else { return }
                let base = tc.baseFields
                let selectedOption = Self.resolveSelectedOption(pending.options, id: a.selectedOptionId)
                if a.approved {
                    tc = .running(ToolCallRunningState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
                        invocationMessage: pending.invocationMessage,
                        toolInput: a.editedToolInput ?? pending.toolInput,
                        status: .running,
                        confirmed: a.confirmed ?? .notNeeded,
                        selectedOption: selectedOption
                    ))
                } else {
                    tc = .cancelled(ToolCallCancelledState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
                        invocationMessage: pending.invocationMessage,
                        toolInput: pending.toolInput,
                        status: .cancelled,
                        reason: a.reason ?? .denied,
                        reasonMessage: a.reasonMessage,
                        userSuggestion: a.userSuggestion,
                        selectedOption: selectedOption
                    ))
                }
            }
            Self.refreshSummaryStatus(&state)

        case .sessionToolCallComplete(let a):
            Self.updateToolCallInPlace(state: &state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
                let base = tc.baseFields
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
                    return
                }

                if a.requiresResultConfirmation == true {
                    tc = .pendingResultConfirmation(ToolCallPendingResultConfirmationState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
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
                } else {
                    tc = .completed(ToolCallCompletedState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
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
                }
            }
            Self.refreshSummaryStatus(&state)

        case .sessionToolCallResultConfirmed(let a):
            Self.updateToolCallInPlace(state: &state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
                guard case .pendingResultConfirmation(let prc) = tc else { return }
                let base = tc.baseFields
                if a.approved {
                    tc = .completed(ToolCallCompletedState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
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
                } else {
                    tc = .cancelled(ToolCallCancelledState(
                        toolCallId: base.toolCallId,
                        toolName: base.toolName,
                        displayName: base.displayName,
                        toolClientId: base.toolClientId,
                        meta: base.meta,
                        invocationMessage: prc.invocationMessage,
                        toolInput: prc.toolInput,
                        status: .cancelled,
                        reason: .resultDenied,
                        selectedOption: prc.selectedOption
                    ))
                }
            }
            Self.refreshSummaryStatus(&state)

        // ── Metadata ──────────────────────────────────────────────────────────

        case .sessionTitleChanged(let a):
            state.summary.title = a.title
            state.summary.modifiedAt = currentTimestamp()

        case .sessionUsage(let a):
            guard state.activeTurn?.id == a.turnId else { return }
            state.activeTurn?.usage = a.usage

        case .sessionReasoning(let a):
            Self.updateResponsePartInPlace(state: &state, turnId: a.turnId, partId: a.partId) { part in
                guard case .reasoning(var r) = part else { return }
                r.content += a.content
                part = .reasoning(r)
            }

        case .sessionModelChanged(let a):
            state.summary.model = a.model
            state.summary.modifiedAt = currentTimestamp()

        case .sessionActivityChanged(let a):
            state.summary.activity = a.activity

        case .sessionConfigChanged(let a):
            guard var config = state.config else { return }
            config.values = a.replace == true ? a.config : config.values.merging(a.config) { _, new in new }
            state.config = config
            state.summary.modifiedAt = currentTimestamp()

        case .sessionMetaChanged(let a):
            state.meta = a.meta

        case .sessionServerToolsChanged(let a):
            state.serverTools = a.tools

        case .sessionActiveClientChanged(let a):
            state.activeClient = a.activeClient

        case .sessionActiveClientToolsChanged(let a):
            guard state.activeClient != nil else { return }
            state.activeClient?.tools = a.tools

        // ── Customizations ──────────────────────────────────────────────────

        case .sessionCustomizationsChanged(let a):
            state.customizations = a.customizations

        case .sessionCustomizationToggled(let a):
            guard let idx = state.customizations?.firstIndex(where: { $0.customization.uri == a.uri }) else { return }
            state.customizations?[idx].enabled = a.enabled

        case .sessionCustomizationUpdated(let a):
            if state.customizations == nil {
                state.customizations = []
            }
            if let idx = state.customizations?.firstIndex(where: { $0.customization.uri == a.customization.uri }) {
                state.customizations?[idx].customization = a.customization
                if let enabled = a.enabled {
                    state.customizations?[idx].enabled = enabled
                }
                if let status = a.status {
                    state.customizations?[idx].status = status
                }
                if let message = a.statusMessage {
                    state.customizations?[idx].statusMessage = message
                }
            } else {
                state.customizations?.append(SessionCustomization(
                    customization: a.customization,
                    enabled: a.enabled ?? false,
                    clientId: nil,
                    status: a.status,
                    statusMessage: a.statusMessage
                ))
            }

        // ── Truncation ────────────────────────────────────────────────────────

        case .sessionTruncated(let a):
            let turns: [Turn]
            if let turnId = a.turnId {
                guard let idx = state.turns.firstIndex(where: { $0.id == turnId }) else {
                    return
                }
                turns = Array(state.turns.prefix(idx + 1))
            } else {
                turns = []
            }
            state.turns = turns
            state.activeTurn = nil
            state.inputRequests = nil
            state.summary.status = Self.sessionSummaryStatus(state)
            state.summary.modifiedAt = currentTimestamp()

        // ── Read / Archived ─────────────────────────────────────────────────

        case .sessionIsReadChanged(let a):
            state.summary.status = Self.withStatusFlag(state.summary.status, .isRead, a.isRead)

        case .sessionIsArchivedChanged(let a):
            state.summary.status = Self.withStatusFlag(state.summary.status, .isArchived, a.isArchived)

        // ── Diffs ─────────────────────────────────────────────────────────────

        case .sessionDiffsChanged(let a):
            state.summary.diffs = a.diffs

        // ── Tool Call Content ────────────────────────────────────────────────

        case .sessionToolCallContentChanged(let a):
            Self.updateToolCallInPlace(state: &state, turnId: a.turnId, toolCallId: a.toolCallId) { tc in
                guard case .running(var r) = tc else { return }
                r.content = a.content
                tc = .running(r)
            }

        // ── Pending Messages ──────────────────────────────────────────────────

        case .sessionPendingMessageSet(let a):
            let entry = PendingMessage(id: a.id, userMessage: a.userMessage)
            if a.kind == .steering {
                state.steeringMessage = entry
                return
            }
            if let idx = state.queuedMessages?.firstIndex(where: { $0.id == a.id }) {
                state.queuedMessages?[idx] = entry
            } else {
                var existing = state.queuedMessages ?? []
                existing.append(entry)
                state.queuedMessages = existing
            }

        case .sessionPendingMessageRemoved(let a):
            if a.kind == .steering {
                guard state.steeringMessage?.id == a.id else { return }
                state.steeringMessage = nil
                return
            }
            guard var existing = state.queuedMessages else { return }
            let before = existing.count
            existing.removeAll { $0.id == a.id }
            guard existing.count != before else { return }
            state.queuedMessages = existing.isEmpty ? nil : existing

        case .sessionQueuedMessagesReordered(let a):
            guard let existing = state.queuedMessages else { return }
            let byId = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })
            var ordered = Set<String>()
            var reordered: [PendingMessage] = a.order.compactMap { id in
                guard let msg = byId[id], !ordered.contains(id) else { return nil }
                ordered.insert(id)
                return msg
            }
            for m in existing where !ordered.contains(m.id) {
                reordered.append(m)
            }
            state.queuedMessages = reordered

        // ── Session Input Requests ─────────────────────────────────────────────

        case .sessionInputRequested(let a):
            Self.upsertInputRequest(state: &state, request: a.request)

        case .sessionInputAnswerChanged(let a):
            guard var existing = state.inputRequests,
                  let idx = existing.firstIndex(where: { $0.id == a.requestId }) else {
                return
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
            state.inputRequests = existing
            state.summary.modifiedAt = currentTimestamp()

        case .sessionInputCompleted(let a):
            guard var existing = state.inputRequests,
                  existing.contains(where: { $0.id == a.requestId }) else {
                return
            }
            existing.removeAll { $0.id == a.requestId }
            state.inputRequests = existing.isEmpty ? nil : existing
            state.summary.status = Self.sessionSummaryStatus(state)
            state.summary.modifiedAt = currentTimestamp()

        default:
            break
        }
    }

    // MARK: - Private Helpers

    /// Bitmask covering the mutually-exclusive activity bits (bits 0–4).
    private static let statusActivityMask = SessionStatus(rawValue: (1 << 5) - 1)

    /// Sets or clears a metadata flag on a status value.
    private static func withStatusFlag(_ status: SessionStatus, _ flag: SessionStatus, _ set: Bool) -> SessionStatus {
        set ? status.union(flag) : status.subtracting(flag)
    }

    // ToolCallBaseFields and toolCallBase() are now shared via
    // ToolCallState.baseFields in ToolCallStateExtensions.swift.

    /// Ends the active turn, producing a completed Turn record.
    /// Non-terminal tool calls are forced to cancelled.
    private static func endTurn(
        state: inout SessionState,
        turnId: String,
        turnState: TurnState,
        terminalStatus: SessionStatus? = nil,
        error: ErrorInfo? = nil
    ) {
        guard let activeTurn = state.activeTurn, activeTurn.id == turnId else { return }

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
                        toolClientId: base.toolClientId,
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
            userMessage: activeTurn.userMessage,
            responseParts: responseParts,
            usage: activeTurn.usage,
            state: turnState,
            error: error
        )

        state.turns.append(turn)
        state.activeTurn = nil
        state.inputRequests = nil
        state.summary.status = Self.sessionSummaryStatus(state, terminalStatus: terminalStatus)
        state.summary.modifiedAt = currentTimestamp()
    }

    private static func sessionSummaryStatus(_ state: SessionState, terminalStatus: SessionStatus? = nil) -> SessionStatus {
        let activity: SessionStatus
        if let terminalStatus {
            activity = terminalStatus
        } else if state.inputRequests?.isEmpty == false || Self.hasPendingToolCallConfirmation(state) {
            activity = .inputNeeded
        } else if state.activeTurn != nil {
            activity = .inProgress
        } else {
            activity = .idle
        }
        return state.summary.status.subtracting(Self.statusActivityMask).union(activity)
    }

    /// Returns `true` if the active turn has any tool call awaiting user confirmation.
    private static func hasPendingToolCallConfirmation(_ state: SessionState) -> Bool {
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

    private static func resolveSelectedOption(_ options: [ConfirmationOption]?, id: String?) -> ConfirmationOption? {
        guard let id, let options else {
            return nil
        }
        return options.first { $0.id == id }
    }

    /// Recomputes `summary.status` from the current state in place.
    private static func refreshSummaryStatus(_ state: inout SessionState) {
        state.summary.status = Self.sessionSummaryStatus(state)
    }

    private static func upsertInputRequest(state: inout SessionState, request: SessionInputRequest) {
        var existing = state.inputRequests ?? []
        if let idx = existing.firstIndex(where: { $0.id == request.id }) {
            var replacement = request
            replacement.answers = request.answers ?? existing[idx].answers
            existing[idx] = replacement
        } else {
            existing.append(request)
        }
        state.inputRequests = existing
        state.summary.status = Self.withStatusFlag(Self.sessionSummaryStatus(state), .isRead, false)
        state.summary.modifiedAt = currentTimestamp()
    }

    /// Updates a tool call inside the active turn's response parts in place.
    private static func updateToolCallInPlace(
        state: inout SessionState,
        turnId: String,
        toolCallId: String,
        updater: (inout ToolCallState) -> Void
    ) {
        guard state.activeTurn?.id == turnId else { return }
        guard let parts = state.activeTurn?.responseParts else { return }

        var found = false
        let newParts: [ResponsePart] = parts.map { part in
            guard case .toolCall(var tcPart) = part else { return part }
            guard tcPart.toolCall.toolCallId == toolCallId else { return part }
            found = true
            updater(&tcPart.toolCall)
            return .toolCall(tcPart)
        }

        guard found else { return }
        state.activeTurn?.responseParts = newParts
    }

    /// Updates a response part identified by partId in the active turn in place.
    private static func updateResponsePartInPlace(
        state: inout SessionState,
        turnId: String,
        partId: String,
        updater: (inout ResponsePart) -> Void
    ) {
        guard state.activeTurn?.id == turnId else { return }
        guard let parts = state.activeTurn?.responseParts else { return }

        var found = false
        let newParts: [ResponsePart] = parts.map { part in
            guard !found else { return part }
            guard part.partId == partId else { return part }
            found = true
            var mutable = part
            updater(&mutable)
            return mutable
        }

        guard found else { return }
        state.activeTurn?.responseParts = newParts
    }
}

// MARK: - Convenience Extensions

extension Reducer {
    /// Returns a new state by applying the action to a copy.
    /// Useful when you want value-semantics without mutating the original.
    public func applying(action: Action, to state: State) -> State {
        var copy = state
        reduce(into: &copy, action: action)
        return copy
    }
}

// MARK: - Timestamp Helper

private func currentTimestamp() -> Int {
    currentTimestampProvider()
}
