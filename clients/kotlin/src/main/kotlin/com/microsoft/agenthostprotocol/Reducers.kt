// Reducers.kt — Pure state reducers for AHP root, session, terminal, and
// changeset state.
//
// Hand-written Kotlin port of the per-channel reducers in
// `types/channels-*/reducer.ts`. Behaviour parity with the TypeScript
// reference impl is verified by `FixtureDrivenReducerTest`, which replays
// the shared cross-language fixtures in `types/test-cases/reducers/`.

package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.AgentSelection
import com.microsoft.agenthostprotocol.generated.ChangesetFile
import com.microsoft.agenthostprotocol.generated.ChangesetState
import com.microsoft.agenthostprotocol.generated.ChangesetStatus
import com.microsoft.agenthostprotocol.generated.ChangesetOperationStatus
import com.microsoft.agenthostprotocol.generated.ChildCustomization
import com.microsoft.agenthostprotocol.generated.ChildCustomizationAgent
import com.microsoft.agenthostprotocol.generated.ChildCustomizationHook
import com.microsoft.agenthostprotocol.generated.ChildCustomizationMcpServer
import com.microsoft.agenthostprotocol.generated.ChildCustomizationPrompt
import com.microsoft.agenthostprotocol.generated.ChildCustomizationRule
import com.microsoft.agenthostprotocol.generated.ChildCustomizationSkill
import com.microsoft.agenthostprotocol.generated.ChildCustomizationUnknown
import com.microsoft.agenthostprotocol.generated.AnnotationEntry
import com.microsoft.agenthostprotocol.generated.Annotation
import com.microsoft.agenthostprotocol.generated.AnnotationsState
import com.microsoft.agenthostprotocol.generated.ConfirmationOption
import com.microsoft.agenthostprotocol.generated.Customization
import com.microsoft.agenthostprotocol.generated.CustomizationDirectory
import com.microsoft.agenthostprotocol.generated.CustomizationMcpServer
import com.microsoft.agenthostprotocol.generated.CustomizationPlugin
import com.microsoft.agenthostprotocol.generated.CustomizationUnknown
import com.microsoft.agenthostprotocol.generated.ErrorInfo
import com.microsoft.agenthostprotocol.generated.MarkdownResponsePart
import com.microsoft.agenthostprotocol.generated.PendingMessage
import com.microsoft.agenthostprotocol.generated.PendingMessageKind
import com.microsoft.agenthostprotocol.generated.ReasoningResponsePart
import com.microsoft.agenthostprotocol.generated.ResponsePart
import com.microsoft.agenthostprotocol.generated.ResponsePartKind
import com.microsoft.agenthostprotocol.generated.ResponsePartMarkdown
import com.microsoft.agenthostprotocol.generated.ResponsePartReasoning
import com.microsoft.agenthostprotocol.generated.ResponsePartToolCall
import com.microsoft.agenthostprotocol.generated.RootState
import com.microsoft.agenthostprotocol.generated.SessionActiveClient
import com.microsoft.agenthostprotocol.generated.ResourceWatchState
import com.microsoft.agenthostprotocol.generated.SessionInputRequest
import com.microsoft.agenthostprotocol.generated.SessionLifecycle
import com.microsoft.agenthostprotocol.generated.SessionState
import com.microsoft.agenthostprotocol.generated.SessionStatus
import com.microsoft.agenthostprotocol.generated.SessionSummary
import com.microsoft.agenthostprotocol.generated.StateAction
import com.microsoft.agenthostprotocol.generated.StateActionChangesetCleared
import com.microsoft.agenthostprotocol.generated.StateActionChangesetFileRemoved
import com.microsoft.agenthostprotocol.generated.StateActionChangesetFileSet
import com.microsoft.agenthostprotocol.generated.StateActionChangesetOperationsChanged
import com.microsoft.agenthostprotocol.generated.StateActionChangesetOperationStatusChanged
import com.microsoft.agenthostprotocol.generated.StateActionChangesetStatusChanged
import com.microsoft.agenthostprotocol.generated.StateActionAnnotationsEntryRemoved
import com.microsoft.agenthostprotocol.generated.StateActionAnnotationsEntrySet
import com.microsoft.agenthostprotocol.generated.StateActionAnnotationsRemoved
import com.microsoft.agenthostprotocol.generated.StateActionAnnotationsSet
import com.microsoft.agenthostprotocol.generated.StateActionAnnotationsUpdated
import com.microsoft.agenthostprotocol.generated.StateActionRootActiveSessionsChanged
import com.microsoft.agenthostprotocol.generated.StateActionRootAgentsChanged
import com.microsoft.agenthostprotocol.generated.StateActionRootConfigChanged
import com.microsoft.agenthostprotocol.generated.StateActionRootTerminalsChanged
import com.microsoft.agenthostprotocol.generated.StateActionResourceWatchChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionActiveClientChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionActiveClientToolsChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionActivityChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionAgentChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionChangesetsChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionConfigChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionCreationFailed
import com.microsoft.agenthostprotocol.generated.StateActionSessionCustomizationRemoved
import com.microsoft.agenthostprotocol.generated.StateActionSessionCustomizationToggled
import com.microsoft.agenthostprotocol.generated.StateActionSessionCustomizationUpdated
import com.microsoft.agenthostprotocol.generated.StateActionSessionCustomizationsChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionDelta
import com.microsoft.agenthostprotocol.generated.StateActionSessionError
import com.microsoft.agenthostprotocol.generated.StateActionSessionInputAnswerChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionInputCompleted
import com.microsoft.agenthostprotocol.generated.StateActionSessionInputRequested
import com.microsoft.agenthostprotocol.generated.StateActionSessionIsArchivedChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionIsReadChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionMcpServerStateChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionMetaChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionModelChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionPendingMessageRemoved
import com.microsoft.agenthostprotocol.generated.StateActionSessionPendingMessageSet
import com.microsoft.agenthostprotocol.generated.StateActionSessionQueuedMessagesReordered
import com.microsoft.agenthostprotocol.generated.StateActionSessionReady
import com.microsoft.agenthostprotocol.generated.StateActionSessionReasoning
import com.microsoft.agenthostprotocol.generated.StateActionSessionResponsePart
import com.microsoft.agenthostprotocol.generated.StateActionSessionServerToolsChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionTitleChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionToolCallComplete
import com.microsoft.agenthostprotocol.generated.StateActionSessionToolCallConfirmed
import com.microsoft.agenthostprotocol.generated.StateActionSessionToolCallContentChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionToolCallDelta
import com.microsoft.agenthostprotocol.generated.StateActionSessionToolCallReady
import com.microsoft.agenthostprotocol.generated.StateActionSessionToolCallResultConfirmed
import com.microsoft.agenthostprotocol.generated.StateActionSessionToolCallStart
import com.microsoft.agenthostprotocol.generated.StateActionSessionTruncated
import com.microsoft.agenthostprotocol.generated.StateActionSessionTurnCancelled
import com.microsoft.agenthostprotocol.generated.StateActionSessionTurnComplete
import com.microsoft.agenthostprotocol.generated.StateActionSessionTurnStarted
import com.microsoft.agenthostprotocol.generated.StateActionSessionUsage
import com.microsoft.agenthostprotocol.generated.StateActionTerminalClaimed
import com.microsoft.agenthostprotocol.generated.StateActionTerminalCleared
import com.microsoft.agenthostprotocol.generated.StateActionTerminalCommandDetectionAvailable
import com.microsoft.agenthostprotocol.generated.StateActionTerminalCommandExecuted
import com.microsoft.agenthostprotocol.generated.StateActionTerminalCommandFinished
import com.microsoft.agenthostprotocol.generated.StateActionTerminalCwdChanged
import com.microsoft.agenthostprotocol.generated.StateActionTerminalData
import com.microsoft.agenthostprotocol.generated.StateActionTerminalExited
import com.microsoft.agenthostprotocol.generated.StateActionTerminalInput
import com.microsoft.agenthostprotocol.generated.StateActionTerminalResized
import com.microsoft.agenthostprotocol.generated.StateActionTerminalTitleChanged
import com.microsoft.agenthostprotocol.generated.TerminalCommandPart
import com.microsoft.agenthostprotocol.generated.TerminalContentPart
import com.microsoft.agenthostprotocol.generated.TerminalContentPartCommand
import com.microsoft.agenthostprotocol.generated.TerminalContentPartUnclassified
import com.microsoft.agenthostprotocol.generated.TerminalState
import com.microsoft.agenthostprotocol.generated.TerminalUnclassifiedPart
import com.microsoft.agenthostprotocol.generated.ToolCallCancellationReason
import com.microsoft.agenthostprotocol.generated.ToolCallCancelledState
import com.microsoft.agenthostprotocol.generated.ToolCallCompletedState
import com.microsoft.agenthostprotocol.generated.ToolCallConfirmationReason
import com.microsoft.agenthostprotocol.generated.ToolCallContributor
import com.microsoft.agenthostprotocol.generated.ToolCallPendingConfirmationState
import com.microsoft.agenthostprotocol.generated.ToolCallPendingResultConfirmationState
import com.microsoft.agenthostprotocol.generated.ToolCallResponsePart
import com.microsoft.agenthostprotocol.generated.ToolCallRunningState
import com.microsoft.agenthostprotocol.generated.ToolCallState
import com.microsoft.agenthostprotocol.generated.ToolCallStateCancelled
import com.microsoft.agenthostprotocol.generated.ToolCallStateCompleted
import com.microsoft.agenthostprotocol.generated.ToolCallStatePendingConfirmation
import com.microsoft.agenthostprotocol.generated.ToolCallStatePendingResultConfirmation
import com.microsoft.agenthostprotocol.generated.ToolCallStateRunning
import com.microsoft.agenthostprotocol.generated.ToolCallStateStreaming
import com.microsoft.agenthostprotocol.generated.ToolCallStateUnknown
import com.microsoft.agenthostprotocol.generated.ToolCallStatus
import com.microsoft.agenthostprotocol.generated.ToolCallStreamingState
import com.microsoft.agenthostprotocol.generated.Turn
import com.microsoft.agenthostprotocol.generated.ActiveTurn
import com.microsoft.agenthostprotocol.generated.TurnState
import kotlinx.serialization.json.JsonElement

// ─── Reducer Interface ──────────────────────────────────────────────────────

/**
 * A pure state reducer: `reduce(state, action)` returns the next state, with
 * no mutation of [state] and no side effects.
 *
 * The companion top-level functions ([rootReducer], [sessionReducer],
 * [terminalReducer], [changesetReducer], [annotationsReducer], [resourceWatchReducer]) are the canonical implementations.
 * The object instances on this interface ([RootReducer], [SessionReducer],
 * [TerminalReducer], [ChangesetReducer], [AnnotationsReducer]) wrap them for use as values where
 * an instance is needed.
 */
public fun interface Reducer<S, A> {
    public fun reduce(state: S, action: A): S
}

/** Pure root reducer as a [Reducer] instance. Delegates to [rootReducer]. */
public object RootReducer : Reducer<RootState, StateAction> {
    override fun reduce(state: RootState, action: StateAction): RootState =
        rootReducer(state, action)
}

/** Pure session reducer as a [Reducer] instance. Delegates to [sessionReducer]. */
public object SessionReducer : Reducer<SessionState, StateAction> {
    override fun reduce(state: SessionState, action: StateAction): SessionState =
        sessionReducer(state, action)
}

/** Pure terminal reducer as a [Reducer] instance. Delegates to [terminalReducer]. */
public object TerminalReducer : Reducer<TerminalState, StateAction> {
    override fun reduce(state: TerminalState, action: StateAction): TerminalState =
        terminalReducer(state, action)
}

/** Pure changeset reducer as a [Reducer] instance. Delegates to [changesetReducer]. */
public object ChangesetReducer : Reducer<ChangesetState, StateAction> {
    override fun reduce(state: ChangesetState, action: StateAction): ChangesetState =
        changesetReducer(state, action)
}

/** Pure annotations reducer as a [Reducer] instance. Delegates to [annotationsReducer]. */
public object AnnotationsReducer : Reducer<AnnotationsState, StateAction> {
    override fun reduce(state: AnnotationsState, action: StateAction): AnnotationsState =
        annotationsReducer(state, action)
}

/** Pure resource-watch reducer as a [Reducer] instance. Delegates to [resourceWatchReducer]. */
public object ResourceWatchReducer : Reducer<ResourceWatchState, StateAction> {
    override fun reduce(state: ResourceWatchState, action: StateAction): ResourceWatchState =
        resourceWatchReducer(state, action)
}

// ─── Timestamp Provider ─────────────────────────────────────────────────────

/**
 * Injectable timestamp provider. Returns epoch milliseconds.
 *
 * Tests override this to produce deterministic `modifiedAt` values when
 * exercising reducers; production callers should leave it on the default.
 */
public var currentTimestampProvider: () -> Long = { System.currentTimeMillis() }

private fun now(): Long = currentTimestampProvider()

// ─── Status Bitset Helpers ──────────────────────────────────────────────────

/** Bitmask covering the mutually-exclusive activity bits (bits 0–4). */
private const val STATUS_ACTIVITY_MASK: Int = (1 shl 5) - 1

/** Sets or clears a metadata flag on a status value. */
private fun withStatusFlag(status: SessionStatus, flag: SessionStatus, set: Boolean): SessionStatus =
    if (set) {
        SessionStatus(status.rawValue or flag.rawValue)
    } else {
        SessionStatus(status.rawValue and flag.rawValue.inv())
    }

/** Derives the summary status from live session work, preserving orthogonal flags. */
private fun summaryStatus(state: SessionState, terminalStatus: SessionStatus? = null): SessionStatus {
    val activity: SessionStatus = when {
        terminalStatus != null -> terminalStatus
        (state.inputRequests?.size ?: 0) > 0 || hasPendingToolCallConfirmation(state) ->
            SessionStatus.INPUT_NEEDED
        state.activeTurn != null -> SessionStatus.IN_PROGRESS
        else -> SessionStatus.IDLE
    }
    val preserved = state.summary.status.rawValue and STATUS_ACTIVITY_MASK.inv()
    return SessionStatus(preserved or activity.rawValue)
}

/**
 * Returns a state with `summary.status` recomputed. Use after reducers that
 * change data feeding into [summaryStatus] (e.g. tool call lifecycle
 * transitions that may enter or leave a pending-confirmation state).
 */
private fun refreshSummaryStatus(state: SessionState): SessionState {
    val status = summaryStatus(state)
    if (status.rawValue == state.summary.status.rawValue) {
        return state
    }
    return state.copy(summary = state.summary.copy(status = status))
}

/** Returns `true` if the active turn has any tool call awaiting user confirmation. */
private fun hasPendingToolCallConfirmation(state: SessionState): Boolean {
    val active = state.activeTurn ?: return false
    return active.responseParts.any { part ->
        part is ResponsePartToolCall &&
            (part.value.toolCall is ToolCallStatePendingConfirmation ||
                part.value.toolCall is ToolCallStatePendingResultConfirmation)
    }
}

// ─── Tool Call Helpers ──────────────────────────────────────────────────────

/** Common base fields shared by all tool call lifecycle states. */
private data class ToolCallBase(
    val toolCallId: String,
    val toolName: String,
    val displayName: String,
    val contributor: ToolCallContributor?,
    val meta: Map<String, JsonElement>?,
) {
    fun withMeta(meta: Map<String, JsonElement>?): ToolCallBase = copy(meta = meta ?: this.meta)
}

private fun toolCallBase(tc: ToolCallState): ToolCallBase = when (tc) {
    is ToolCallStateStreaming -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.contributor, it.meta)
    }
    is ToolCallStatePendingConfirmation -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.contributor, it.meta)
    }
    is ToolCallStateRunning -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.contributor, it.meta)
    }
    is ToolCallStatePendingResultConfirmation -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.contributor, it.meta)
    }
    is ToolCallStateCompleted -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.contributor, it.meta)
    }
    is ToolCallStateCancelled -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.contributor, it.meta)
    }
    // Forward-compat: unknown lifecycle variants have no extractable base; mirror
    // Rust's `ToolCallState::Unknown(_) => (String::new(), ...)`. Combined with
    // `toolCallIdOf` returning `""`, this guarantees an unknown tool call never
    // matches a real `toolCallId` in delta/lookup paths.
    is ToolCallStateUnknown -> ToolCallBase("", "", "", null, null)
}

/** Resolves a selected confirmation option by ID from a pending-confirmation state. */
private fun resolveSelectedOption(options: List<ConfirmationOption>?, id: String?): ConfirmationOption? {
    if (id == null || options == null) return null
    return options.firstOrNull { it.id == id }
}

private fun toolCallIdOf(tc: ToolCallState): String = toolCallBase(tc).toolCallId

private fun customizationId(c: Customization): String? = when (c) {
    is CustomizationPlugin -> c.value.id
    is CustomizationDirectory -> c.value.id
    is CustomizationMcpServer -> c.value.id
    // Unknown variants carry an opaque `raw` JSON object — no id to expose.
    // Returning `null` mirrors Rust's `Customization::Unknown(_) => None`, so
    // an unknown container can never collide with a real id during lookups.
    is CustomizationUnknown -> null
}

private fun customizationChildren(c: Customization): List<ChildCustomization>? = when (c) {
    is CustomizationPlugin -> c.value.children
    is CustomizationDirectory -> c.value.children
    is CustomizationMcpServer -> null
    is CustomizationUnknown -> null
}

private fun withCustomizationChildren(c: Customization, children: List<ChildCustomization>): Customization = when (c) {
    is CustomizationPlugin -> CustomizationPlugin(c.value.copy(children = children))
    is CustomizationDirectory -> CustomizationDirectory(c.value.copy(children = children))
    // Pass-through: we can't structurally edit a payload we don't understand.
    is CustomizationMcpServer -> c
    is CustomizationUnknown -> c
}

private fun withCustomizationEnabled(c: Customization, enabled: Boolean): Customization = when (c) {
    is CustomizationPlugin -> CustomizationPlugin(c.value.copy(enabled = enabled))
    is CustomizationDirectory -> CustomizationDirectory(c.value.copy(enabled = enabled))
    is CustomizationMcpServer -> CustomizationMcpServer(c.value.copy(enabled = enabled))
    is CustomizationUnknown -> c
}

private fun childCustomizationId(c: ChildCustomization): String? = when (c) {
    is ChildCustomizationAgent -> c.value.id
    is ChildCustomizationSkill -> c.value.id
    is ChildCustomizationPrompt -> c.value.id
    is ChildCustomizationRule -> c.value.id
    is ChildCustomizationHook -> c.value.id
    is ChildCustomizationMcpServer -> c.value.id
    is ChildCustomizationUnknown -> null
}

/**
 * Immutably updates the tool call inside a [ToolCallResponsePart] in the
 * active turn's `responseParts` array. Returns [state] unchanged if the
 * active turn or tool call doesn't match.
 */
private fun updateToolCallInParts(
    state: SessionState,
    turnId: String,
    toolCallId: String,
    updater: (ToolCallState) -> ToolCallState,
): SessionState {
    val activeTurn = state.activeTurn ?: return state
    if (activeTurn.id != turnId) return state

    var found = false
    val responseParts = activeTurn.responseParts.map { part ->
        if (part is ResponsePartToolCall && toolCallIdOf(part.value.toolCall) == toolCallId) {
            val updated = updater(part.value.toolCall)
            if (updated === part.value.toolCall) {
                part
            } else {
                found = true
                ResponsePartToolCall(part.value.copy(toolCall = updated))
            }
        } else {
            part
        }
    }
    if (!found) return state
    return state.copy(activeTurn = activeTurn.copy(responseParts = responseParts))
}

/**
 * Immutably updates a response part by `partId` in the active turn.
 * For markdown/reasoning parts, matches on `id`. For tool call parts,
 * matches on `toolCall.toolCallId`.
 */
private fun updateResponsePart(
    state: SessionState,
    turnId: String,
    partId: String,
    updater: (ResponsePart) -> ResponsePart,
): SessionState {
    val activeTurn = state.activeTurn ?: return state
    if (activeTurn.id != turnId) return state

    var found = false
    val responseParts = activeTurn.responseParts.map { part ->
        if (found) part else {
            val id: String? = when (part) {
                is ResponsePartToolCall -> toolCallIdOf(part.value.toolCall)
                is ResponsePartMarkdown -> part.value.id
                is ResponsePartReasoning -> part.value.id
                else -> null
            }
            if (id == partId) {
                found = true
                updater(part)
            } else {
                part
            }
        }
    }
    if (!found) return state
    return state.copy(activeTurn = activeTurn.copy(responseParts = responseParts))
}

/**
 * Ends the active turn, finalizing it into a completed turn record.
 *
 * Tool call parts with non-terminal states are forced to cancelled with
 * [ToolCallCancellationReason.SKIPPED]. Pending permissions / options are
 * stripped from those tool call parts in the process.
 */
private fun endTurn(
    state: SessionState,
    turnId: String,
    turnState: TurnState,
    terminalStatus: SessionStatus? = null,
    error: ErrorInfo? = null,
): SessionState {
    val active = state.activeTurn ?: return state
    if (active.id != turnId) return state

    val finalizedParts: List<ResponsePart> = active.responseParts.map { part ->
        if (part !is ResponsePartToolCall) return@map part
        val tc = part.value.toolCall
        if (tc is ToolCallStateCompleted || tc is ToolCallStateCancelled) return@map part
        val base = toolCallBase(tc)
        // Streaming has no settled invocationMessage/toolInput yet; the TS
        // reducer normalises invocationMessage to '' and drops toolInput.
        val invocationMessage = when (tc) {
            is ToolCallStateStreaming -> tc.value.invocationMessage
                ?: com.microsoft.agenthostprotocol.generated.StringOrMarkdown.Plain("")
            is ToolCallStatePendingConfirmation -> tc.value.invocationMessage
            is ToolCallStateRunning -> tc.value.invocationMessage
            is ToolCallStatePendingResultConfirmation -> tc.value.invocationMessage
            is ToolCallStateCompleted, is ToolCallStateCancelled -> error("filtered above")
            // Mirrors Rust's catch-all (`_ => Default::default()`). An unknown tool
            // call cancelled at turn end becomes a Cancelled state with empty
            // invocation message — destructive, but matches Rust parity exactly.
            is ToolCallStateUnknown -> com.microsoft.agenthostprotocol.generated.StringOrMarkdown.Plain("")
        }
        val toolInput: String? = when (tc) {
            is ToolCallStateStreaming -> null
            is ToolCallStatePendingConfirmation -> tc.value.toolInput
            is ToolCallStateRunning -> tc.value.toolInput
            is ToolCallStatePendingResultConfirmation -> tc.value.toolInput
            is ToolCallStateCompleted, is ToolCallStateCancelled -> error("filtered above")
            is ToolCallStateUnknown -> null
        }
        ResponsePartToolCall(
            part.value.copy(
                toolCall = ToolCallStateCancelled(
                    ToolCallCancelledState(
                        toolCallId = base.toolCallId,
                        toolName = base.toolName,
                        displayName = base.displayName,
                        contributor = base.contributor,
                        meta = base.meta,
                        invocationMessage = invocationMessage,
                        toolInput = toolInput,
                        status = ToolCallStatus.CANCELLED,
                        reason = ToolCallCancellationReason.SKIPPED,
                    ),
                ),
            ),
        )
    }

    val turn = Turn(
        id = active.id,
        message = active.message,
        responseParts = finalizedParts,
        usage = active.usage,
        state = turnState,
        error = error,
    )

    val withoutTurn = state.copy(
        turns = state.turns + turn,
        activeTurn = null,
        inputRequests = null,
        summary = state.summary.copy(modifiedAt = now()),
    )
    return withoutTurn.copy(
        summary = withoutTurn.summary.copy(status = summaryStatus(withoutTurn, terminalStatus)),
    )
}

private fun upsertInputRequest(state: SessionState, request: SessionInputRequest): SessionState {
    val existing = state.inputRequests ?: emptyList()
    val idx = existing.indexOfFirst { it.id == request.id }
    val updated: List<SessionInputRequest> = if (idx >= 0) {
        val priorAnswers = existing[idx].answers
        existing.toMutableList().also { it[idx] = request.copy(answers = request.answers ?: priorAnswers) }
    } else {
        existing + request
    }
    val next = state.copy(inputRequests = updated)
    return next.copy(
        summary = next.summary.copy(
            status = withStatusFlag(summaryStatus(next), SessionStatus.IS_READ, false),
            modifiedAt = now(),
        ),
    )
}

// ─── Root Reducer ───────────────────────────────────────────────────────────

/**
 * Pure reducer for [RootState]. Handles the root-channel action variants;
 * actions belonging to other channels (or unknown variants) are no-ops that
 * return [state] unchanged.
 */
public fun rootReducer(state: RootState, action: StateAction): RootState = when (action) {
    is StateActionRootAgentsChanged ->
        state.copy(agents = action.value.agents)

    is StateActionRootActiveSessionsChanged ->
        state.copy(activeSessions = action.value.activeSessions)

    is StateActionRootTerminalsChanged ->
        state.copy(terminals = action.value.terminals)

    is StateActionRootConfigChanged -> {
        val config = state.config
        if (config == null) {
            state
        } else {
            val newValues = if (action.value.replace == true) {
                action.value.config
            } else {
                config.values + action.value.config
            }
            state.copy(config = config.copy(values = newValues))
        }
    }

    else -> state
}

// ─── Session Reducer ────────────────────────────────────────────────────────

/**
 * Pure reducer for [SessionState]. Handles all session-channel action
 * variants; actions belonging to other channels (or unknown variants) are
 * no-ops that return [state] unchanged.
 */
public fun sessionReducer(state: SessionState, action: StateAction): SessionState = when (action) {

    // ── Lifecycle ──────────────────────────────────────────────────────────

    is StateActionSessionReady -> {
        // Lifecycle-only transition (Creating → Ready). Must not touch
        // `summary.status`: for provisional sessions the first turn can
        // start before materialisation completes, so an `activeTurn` may
        // already be set. The TS reference impl notes this in detail.
        state.copy(lifecycle = SessionLifecycle.READY)
    }

    is StateActionSessionCreationFailed -> state.copy(
        lifecycle = SessionLifecycle.CREATION_FAILED,
        creationError = action.value.error,
    )

    // ── Turn Lifecycle ────────────────────────────────────────────────────

    is StateActionSessionTurnStarted -> {
        val a = action.value
        val withTurn = state.copy(
            activeTurn = ActiveTurn(
                id = a.turnId,
                message = a.message,
                responseParts = emptyList(),
                usage = null,
            ),
        )
        val withStatus = withTurn.copy(
            summary = withTurn.summary.copy(
                status = withStatusFlag(summaryStatus(withTurn), SessionStatus.IS_READ, false),
                modifiedAt = now(),
            ),
        )
        if (a.queuedMessageId == null) {
            withStatus
        } else {
            var next = withStatus
            if (next.steeringMessage?.id == a.queuedMessageId) {
                next = next.copy(steeringMessage = null)
            }
            val queued = next.queuedMessages
            if (queued != null) {
                val filtered = queued.filter { it.id != a.queuedMessageId }
                next = next.copy(queuedMessages = filtered.ifEmpty { null })
            }
            next
        }
    }

    is StateActionSessionDelta -> {
        val a = action.value
        updateResponsePart(state, a.turnId, a.partId) { part ->
            if (part is ResponsePartMarkdown) {
                ResponsePartMarkdown(part.value.copy(content = part.value.content + a.content))
            } else {
                part
            }
        }
    }

    is StateActionSessionResponsePart -> {
        val a = action.value
        val activeTurn = state.activeTurn
        if (activeTurn == null || activeTurn.id != a.turnId) {
            state
        } else {
            state.copy(
                activeTurn = activeTurn.copy(responseParts = activeTurn.responseParts + a.part),
            )
        }
    }

    is StateActionSessionTurnComplete ->
        endTurn(state, action.value.turnId, TurnState.COMPLETE)

    is StateActionSessionTurnCancelled ->
        endTurn(state, action.value.turnId, TurnState.CANCELLED)

    is StateActionSessionError ->
        endTurn(state, action.value.turnId, TurnState.ERROR, SessionStatus.ERROR, action.value.error)

    // ── Tool Call State Machine ───────────────────────────────────────────

    is StateActionSessionToolCallStart -> {
        val a = action.value
        val activeTurn = state.activeTurn
        if (activeTurn == null || activeTurn.id != a.turnId) {
            state
        } else {
            val newPart = ResponsePartToolCall(
                ToolCallResponsePart(
                    kind = ResponsePartKind.TOOL_CALL,
                    toolCall = ToolCallStateStreaming(
                        ToolCallStreamingState(
                            toolCallId = a.toolCallId,
                            toolName = a.toolName,
                            displayName = a.displayName,
                            contributor = a.contributor,
                            meta = a.meta,
                            status = ToolCallStatus.STREAMING,
                        ),
                    ),
                ),
            )
            state.copy(activeTurn = activeTurn.copy(responseParts = activeTurn.responseParts + newPart))
        }
    }

    is StateActionSessionToolCallDelta -> {
        val a = action.value
        updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
            if (tc !is ToolCallStateStreaming) tc else {
                ToolCallStateStreaming(
                    tc.value.copy(
                        meta = a.meta ?: tc.value.meta,
                        partialInput = (tc.value.partialInput ?: "") + a.content,
                        invocationMessage = a.invocationMessage ?: tc.value.invocationMessage,
                    ),
                )
            }
        }
    }

    is StateActionSessionToolCallReady -> {
        val a = action.value
        refreshSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                if (tc !is ToolCallStateStreaming && tc !is ToolCallStateRunning) {
                    tc
                } else {
                    val base = toolCallBase(tc).withMeta(a.meta)
                    if (a.confirmed != null) {
                        ToolCallStateRunning(
                            ToolCallRunningState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                contributor = base.contributor,
                                meta = base.meta,
                                invocationMessage = a.invocationMessage,
                                toolInput = a.toolInput,
                                status = ToolCallStatus.RUNNING,
                                confirmed = a.confirmed,
                            ),
                        )
                    } else {
                        ToolCallStatePendingConfirmation(
                            ToolCallPendingConfirmationState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                contributor = base.contributor,
                                meta = base.meta,
                                invocationMessage = a.invocationMessage,
                                toolInput = a.toolInput,
                                status = ToolCallStatus.PENDING_CONFIRMATION,
                                confirmationTitle = a.confirmationTitle,
                                edits = a.edits,
                                editable = a.editable,
                                options = a.options,
                            ),
                        )
                    }
                }
            },
        )
    }

    is StateActionSessionToolCallConfirmed -> {
        val a = action.value
        refreshSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                if (tc !is ToolCallStatePendingConfirmation) tc else {
                    val base = toolCallBase(tc).withMeta(a.meta)
                    val selectedOption = resolveSelectedOption(tc.value.options, a.selectedOptionId)
                    if (a.approved) {
                        ToolCallStateRunning(
                            ToolCallRunningState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                contributor = base.contributor,
                                meta = base.meta,
                                invocationMessage = tc.value.invocationMessage,
                                toolInput = a.editedToolInput ?: tc.value.toolInput,
                                status = ToolCallStatus.RUNNING,
                                confirmed = a.confirmed
                                    ?: ToolCallConfirmationReason.USER_ACTION,
                                selectedOption = selectedOption,
                            ),
                        )
                    } else {
                        ToolCallStateCancelled(
                            ToolCallCancelledState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                contributor = base.contributor,
                                meta = base.meta,
                                invocationMessage = tc.value.invocationMessage,
                                toolInput = tc.value.toolInput,
                                status = ToolCallStatus.CANCELLED,
                                reason = a.reason ?: ToolCallCancellationReason.DENIED,
                                reasonMessage = a.reasonMessage,
                                userSuggestion = a.userSuggestion,
                                selectedOption = selectedOption,
                            ),
                        )
                    }
                }
            },
        )
    }

    is StateActionSessionToolCallComplete -> {
        val a = action.value
        val result = a.result
        refreshSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                val (invocationMessage, toolInput, confirmed, selectedOption) = when (tc) {
                    is ToolCallStateRunning -> CompleteCtx(
                        tc.value.invocationMessage,
                        tc.value.toolInput,
                        tc.value.confirmed,
                        tc.value.selectedOption,
                    )
                    is ToolCallStatePendingConfirmation -> CompleteCtx(
                        tc.value.invocationMessage,
                        tc.value.toolInput,
                        ToolCallConfirmationReason.NOT_NEEDED,
                        null,
                    )
                    else -> return@updateToolCallInParts tc
                }
                val base = toolCallBase(tc).withMeta(a.meta)
                if (a.requiresResultConfirmation == true) {
                    ToolCallStatePendingResultConfirmation(
                        ToolCallPendingResultConfirmationState(
                            toolCallId = base.toolCallId,
                            toolName = base.toolName,
                            displayName = base.displayName,
                            contributor = base.contributor,
                            meta = base.meta,
                            invocationMessage = invocationMessage,
                            toolInput = toolInput,
                            success = result.success,
                            pastTenseMessage = result.pastTenseMessage,
                            content = result.content,
                            structuredContent = result.structuredContent,
                            error = result.error,
                            status = ToolCallStatus.PENDING_RESULT_CONFIRMATION,
                            confirmed = confirmed,
                            selectedOption = selectedOption,
                        ),
                    )
                } else {
                    ToolCallStateCompleted(
                        ToolCallCompletedState(
                            toolCallId = base.toolCallId,
                            toolName = base.toolName,
                            displayName = base.displayName,
                            contributor = base.contributor,
                            meta = base.meta,
                            invocationMessage = invocationMessage,
                            toolInput = toolInput,
                            success = result.success,
                            pastTenseMessage = result.pastTenseMessage,
                            content = result.content,
                            structuredContent = result.structuredContent,
                            error = result.error,
                            status = ToolCallStatus.COMPLETED,
                            confirmed = confirmed,
                            selectedOption = selectedOption,
                        ),
                    )
                }
            },
        )
    }

    is StateActionSessionToolCallResultConfirmed -> {
        val a = action.value
        refreshSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                if (tc !is ToolCallStatePendingResultConfirmation) tc else {
                    val base = toolCallBase(tc).withMeta(a.meta)
                    if (a.approved) {
                        ToolCallStateCompleted(
                            ToolCallCompletedState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                contributor = base.contributor,
                                meta = base.meta,
                                invocationMessage = tc.value.invocationMessage,
                                toolInput = tc.value.toolInput,
                                success = tc.value.success,
                                pastTenseMessage = tc.value.pastTenseMessage,
                                content = tc.value.content,
                                structuredContent = tc.value.structuredContent,
                                error = tc.value.error,
                                status = ToolCallStatus.COMPLETED,
                                confirmed = tc.value.confirmed,
                                selectedOption = tc.value.selectedOption,
                            ),
                        )
                    } else {
                        ToolCallStateCancelled(
                            ToolCallCancelledState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                contributor = base.contributor,
                                meta = base.meta,
                                invocationMessage = tc.value.invocationMessage,
                                toolInput = tc.value.toolInput,
                                status = ToolCallStatus.CANCELLED,
                                reason = ToolCallCancellationReason.RESULT_DENIED,
                                selectedOption = tc.value.selectedOption,
                            ),
                        )
                    }
                }
            },
        )
    }

    is StateActionSessionToolCallContentChanged -> {
        val a = action.value
        updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
            if (tc !is ToolCallStateRunning) tc else {
                ToolCallStateRunning(tc.value.copy(meta = a.meta ?: tc.value.meta, content = a.content))
            }
        }
    }

    // ── Metadata ──────────────────────────────────────────────────────────

    is StateActionSessionTitleChanged -> state.copy(
        summary = state.summary.copy(title = action.value.title, modifiedAt = now()),
    )

    is StateActionSessionUsage -> {
        val a = action.value
        val activeTurn = state.activeTurn
        if (activeTurn == null || activeTurn.id != a.turnId) {
            state
        } else {
            state.copy(activeTurn = activeTurn.copy(usage = a.usage))
        }
    }

    is StateActionSessionReasoning -> {
        val a = action.value
        updateResponsePart(state, a.turnId, a.partId) { part ->
            if (part is ResponsePartReasoning) {
                ResponsePartReasoning(part.value.copy(content = part.value.content + a.content))
            } else {
                part
            }
        }
    }

    is StateActionSessionModelChanged -> state.copy(
        summary = state.summary.copy(model = action.value.model, modifiedAt = now()),
    )

    is StateActionSessionAgentChanged -> state.copy(
        summary = state.summary.copy(agent = action.value.agent, modifiedAt = now()),
    )

    is StateActionSessionIsReadChanged -> state.copy(
        summary = state.summary.copy(
            status = withStatusFlag(state.summary.status, SessionStatus.IS_READ, action.value.isRead),
        ),
    )

    is StateActionSessionIsArchivedChanged -> state.copy(
        summary = state.summary.copy(
            status = withStatusFlag(state.summary.status, SessionStatus.IS_ARCHIVED, action.value.isArchived),
        ),
    )

    is StateActionSessionActivityChanged -> state.copy(
        summary = state.summary.copy(activity = action.value.activity),
    )

    is StateActionSessionChangesetsChanged -> state.copy(
        changesets = action.value.changesets,
    )

    is StateActionSessionConfigChanged -> {
        val a = action.value
        val config = state.config
        if (config == null) {
            state
        } else {
            val newValues = if (a.replace == true) a.config else config.values + a.config
            state.copy(
                config = config.copy(values = newValues),
                summary = state.summary.copy(modifiedAt = now()),
            )
        }
    }

    is StateActionSessionMetaChanged -> state.copy(meta = action.value.meta)

    is StateActionSessionServerToolsChanged -> state.copy(serverTools = action.value.tools)

    is StateActionSessionActiveClientChanged -> state.copy(activeClient = action.value.activeClient)

    is StateActionSessionActiveClientToolsChanged -> {
        val client = state.activeClient
        if (client == null) {
            state
        } else {
            state.copy(activeClient = client.copy(tools = action.value.tools))
        }
    }

    // ── Customizations ────────────────────────────────────────────────────

    is StateActionSessionCustomizationsChanged ->
        state.copy(customizations = action.value.customizations)

    is StateActionSessionCustomizationToggled -> {
        val a = action.value
        val list = state.customizations
        if (list == null) {
            state
        } else {
            val idx = list.indexOfFirst { customizationId(it) == a.id }
            if (idx < 0) {
                state
            } else {
                val updated = list.toMutableList()
                updated[idx] = withCustomizationEnabled(updated[idx], a.enabled)
                state.copy(customizations = updated)
            }
        }
    }

    is StateActionSessionCustomizationUpdated -> {
        val a = action.value
        // Match Rust: an unknown customization has no id, so we can't locate or
        // insert it sensibly — NoOp the update entirely.
        val targetId = customizationId(a.customization)
        if (targetId == null) {
            state
        } else {
            val list = state.customizations ?: emptyList()
            val idx = list.indexOfFirst { customizationId(it) == targetId }
            if (idx < 0) {
                state.copy(customizations = list + a.customization)
            } else {
                val updated = list.toMutableList()
                updated[idx] = a.customization
                state.copy(customizations = updated)
            }
        }
    }

    is StateActionSessionCustomizationRemoved -> {
        val a = action.value
        val list = state.customizations
        if (list == null) {
            state
        } else {
            val topIdx = list.indexOfFirst { customizationId(it) == a.id }
            if (topIdx >= 0) {
                val updated = list.toMutableList()
                updated.removeAt(topIdx)
                state.copy(customizations = updated)
            } else {
                var changed = false
                val updated = list.map { container ->
                    val children = customizationChildren(container)
                    if (children == null) {
                        container
                    } else {
                        val childIdx = children.indexOfFirst { childCustomizationId(it) == a.id }
                        if (childIdx < 0) {
                            container
                        } else {
                            changed = true
                            val newChildren = children.toMutableList()
                            newChildren.removeAt(childIdx)
                            withCustomizationChildren(container, newChildren)
                        }
                    }
                }
                if (!changed) state else state.copy(customizations = updated)
            }
        }
    }

    is StateActionSessionMcpServerStateChanged -> {
        // Full-replacement of an MCP server customization's `state` + `channel`,
        // located by id. Mirrors the canonical TS reducer (and the Go/Rust/Swift
        // ports): a top-level McpServer entry is matched first (hosts MAY surface
        // MCP servers directly at the top level); otherwise the search descends
        // into container children. A no-op when no customization carries the id,
        // or when the matched id belongs to a non-MCP customization type.
        val a = action.value
        val list = state.customizations
        if (list == null) {
            state
        } else {
            val topIdx = list.indexOfFirst { customizationId(it) == a.id }
            if (topIdx >= 0) {
                val entry = list[topIdx]
                if (entry !is CustomizationMcpServer) {
                    state
                } else {
                    val updated = list.toMutableList()
                    updated[topIdx] = CustomizationMcpServer(
                        entry.value.copy(state = a.state, channel = a.channel),
                    )
                    state.copy(customizations = updated)
                }
            } else {
                var changed = false
                val updated = list.map { container ->
                    val children = customizationChildren(container)
                    if (children == null) {
                        container
                    } else {
                        val childIdx = children.indexOfFirst { childCustomizationId(it) == a.id }
                        if (childIdx < 0) {
                            container
                        } else {
                            val child = children[childIdx]
                            if (child !is ChildCustomizationMcpServer) {
                                container
                            } else {
                                changed = true
                                val newChildren = children.toMutableList()
                                newChildren[childIdx] = ChildCustomizationMcpServer(
                                    child.value.copy(state = a.state, channel = a.channel),
                                )
                                withCustomizationChildren(container, newChildren)
                            }
                        }
                    }
                }
                if (!changed) state else state.copy(customizations = updated)
            }
        }
    }

    // ── Truncation ────────────────────────────────────────────────────────

    is StateActionSessionTruncated -> {
        val a = action.value
        val turns = if (a.turnId == null) {
            emptyList()
        } else {
            val idx = state.turns.indexOfFirst { it.id == a.turnId }
            if (idx < 0) return@sessionReducer state
            state.turns.subList(0, idx + 1).toList()
        }
        val next = state.copy(
            turns = turns,
            activeTurn = null,
            inputRequests = null,
            summary = state.summary.copy(modifiedAt = now()),
        )
        next.copy(summary = next.summary.copy(status = summaryStatus(next)))
    }

    // ── Session Input Requests ────────────────────────────────────────────

    is StateActionSessionInputRequested ->
        upsertInputRequest(state, action.value.request)

    is StateActionSessionInputAnswerChanged -> {
        val a = action.value
        val existing = state.inputRequests
        val idx = existing?.indexOfFirst { it.id == a.requestId } ?: -1
        if (existing == null || idx < 0) {
            state
        } else {
            val request = existing[idx]
            val answers = (request.answers ?: emptyMap()).toMutableMap()
            if (a.answer == null) {
                answers.remove(a.questionId)
            } else {
                answers[a.questionId] = a.answer
            }
            val newRequest = request.copy(answers = if (answers.isEmpty()) null else answers)
            val updated = existing.toMutableList().also { it[idx] = newRequest }
            state.copy(
                inputRequests = updated,
                summary = state.summary.copy(modifiedAt = now()),
            )
        }
    }

    is StateActionSessionInputCompleted -> {
        val a = action.value
        val existing = state.inputRequests
        if (existing == null || existing.none { it.id == a.requestId }) {
            state
        } else {
            val remaining = existing.filter { it.id != a.requestId }
            val next = state.copy(inputRequests = remaining.ifEmpty { null })
            next.copy(
                summary = next.summary.copy(
                    status = summaryStatus(next),
                    modifiedAt = now(),
                ),
            )
        }
    }

    // ── Pending Messages ──────────────────────────────────────────────────

    is StateActionSessionPendingMessageSet -> {
        val a = action.value
        val entry = PendingMessage(id = a.id, message = a.message)
        if (a.kind == PendingMessageKind.STEERING) {
            state.copy(steeringMessage = entry)
        } else {
            val existing = state.queuedMessages ?: emptyList()
            val idx = existing.indexOfFirst { it.id == a.id }
            val updated = if (idx >= 0) {
                existing.toMutableList().also { it[idx] = entry }
            } else {
                existing + entry
            }
            state.copy(queuedMessages = updated)
        }
    }

    is StateActionSessionPendingMessageRemoved -> {
        val a = action.value
        if (a.kind == PendingMessageKind.STEERING) {
            val steering = state.steeringMessage
            if (steering == null || steering.id != a.id) {
                state
            } else {
                state.copy(steeringMessage = null)
            }
        } else {
            val existing = state.queuedMessages ?: return@sessionReducer state
            val filtered = existing.filter { it.id != a.id }
            if (filtered.size == existing.size) {
                state
            } else {
                state.copy(queuedMessages = filtered.ifEmpty { null })
            }
        }
    }

    is StateActionSessionQueuedMessagesReordered -> {
        val a = action.value
        val existing = state.queuedMessages ?: return@sessionReducer state
        val byId = existing.associateBy { it.id }
        val ordered = LinkedHashSet<String>()
        val reordered = mutableListOf<PendingMessage>()
        for (id in a.order) {
            if (id in byId && ordered.add(id)) {
                reordered.add(byId.getValue(id))
            }
        }
        // Append any messages not mentioned in `order`, preserving original order.
        for (m in existing) {
            if (m.id !in ordered) {
                reordered.add(m)
            }
        }
        state.copy(queuedMessages = reordered)
    }

    else -> state
}

/**
 * Locally scoped helper for [StateActionSessionToolCallComplete] to avoid
 * Pair/Triple noise when carrying the four context fields from the prior
 * tool call state into the new one.
 */
private data class CompleteCtx(
    val invocationMessage: com.microsoft.agenthostprotocol.generated.StringOrMarkdown,
    val toolInput: String?,
    val confirmed: ToolCallConfirmationReason,
    val selectedOption: ConfirmationOption?,
)

// ─── Terminal Reducer ───────────────────────────────────────────────────────

/**
 * Pure reducer for [TerminalState]. Handles all terminal-channel action
 * variants; actions belonging to other channels (or unknown variants) are
 * no-ops that return [state] unchanged.
 */
public fun terminalReducer(state: TerminalState, action: StateAction): TerminalState = when (action) {
    is StateActionTerminalData -> {
        val data = action.value.data
        val content = state.content
        val tail = content.lastOrNull()
        val updated: List<TerminalContentPart> = when {
            tail is TerminalContentPartCommand && !tail.value.isComplete ->
                content.toMutableList().also {
                    it[it.lastIndex] = TerminalContentPartCommand(
                        tail.value.copy(output = tail.value.output + data),
                    )
                }
            tail is TerminalContentPartUnclassified ->
                content.toMutableList().also {
                    it[it.lastIndex] = TerminalContentPartUnclassified(
                        tail.value.copy(value = tail.value.value + data),
                    )
                }
            else -> content + TerminalContentPartUnclassified(
                TerminalUnclassifiedPart(type = "unclassified", value = data),
            )
        }
        state.copy(content = updated)
    }

    // Side-effect-only: the server forwards to the pty. No state change.
    is StateActionTerminalInput -> state

    is StateActionTerminalResized -> state.copy(
        cols = action.value.cols,
        rows = action.value.rows,
    )

    is StateActionTerminalClaimed -> state.copy(claim = action.value.claim)

    is StateActionTerminalTitleChanged -> state.copy(title = action.value.title)

    is StateActionTerminalCwdChanged -> state.copy(cwd = action.value.cwd)

    is StateActionTerminalExited -> state.copy(exitCode = action.value.exitCode)

    is StateActionTerminalCleared -> state.copy(content = emptyList())

    is StateActionTerminalCommandDetectionAvailable ->
        state.copy(supportsCommandDetection = true)

    is StateActionTerminalCommandExecuted -> {
        val a = action.value
        val newPart = TerminalContentPartCommand(
            TerminalCommandPart(
                type = "command",
                commandId = a.commandId,
                commandLine = a.commandLine,
                output = "",
                timestamp = a.timestamp,
                isComplete = false,
            ),
        )
        state.copy(
            content = state.content + newPart,
            supportsCommandDetection = true,
        )
    }

    is StateActionTerminalCommandFinished -> {
        val a = action.value
        val content = state.content.map { part ->
            if (part is TerminalContentPartCommand && part.value.commandId == a.commandId) {
                TerminalContentPartCommand(
                    part.value.copy(
                        isComplete = true,
                        exitCode = a.exitCode,
                        durationMs = a.durationMs,
                    ),
                )
            } else {
                part
            }
        }
        state.copy(content = content)
    }

    else -> state
}

// ─── Changeset Reducer ──────────────────────────────────────────────────────

/**
 * Pure reducer for [ChangesetState]. Handles all changeset-channel action
 * variants; actions belonging to other channels (or unknown variants) are
 * no-ops that return [state] unchanged.
 */
public fun changesetReducer(state: ChangesetState, action: StateAction): ChangesetState = when (action) {
    is StateActionChangesetStatusChanged -> {
        // Carry `error` only when the new status is `Error` so we don't
        // leave a stale error sitting on a recovered changeset.
        if (action.value.status == ChangesetStatus.ERROR) {
            state.copy(status = action.value.status, error = action.value.error)
        } else {
            state.copy(status = action.value.status, error = null)
        }
    }

    is StateActionChangesetFileSet -> {
        val file = action.value.file
        val idx = state.files.indexOfFirst { it.id == file.id }
        if (idx < 0) {
            state.copy(files = state.files + file)
        } else {
            val next = state.files.toMutableList().also { it[idx] = file }
            state.copy(files = next)
        }
    }

    is StateActionChangesetFileRemoved -> {
        val idx = state.files.indexOfFirst { it.id == action.value.fileId }
        if (idx < 0) {
            state
        } else {
            val next: List<ChangesetFile> = state.files.toMutableList().also { it.removeAt(idx) }
            state.copy(files = next)
        }
    }

    is StateActionChangesetOperationsChanged ->
        state.copy(operations = action.value.operations)

    is StateActionChangesetOperationStatusChanged -> {
        val operations = state.operations
        val idx = operations?.indexOfFirst { it.id == action.value.operationId } ?: -1
        if (operations == null || idx < 0) {
            state
        } else {
            // Carry `error` only when the new status is `Error` so we don't
            // leave a stale error on an operation that recovered or started
            // running.
            val current = operations[idx]
            val nextOp = if (action.value.status == ChangesetOperationStatus.ERROR) {
                current.copy(status = action.value.status, error = action.value.error)
            } else {
                current.copy(status = action.value.status, error = null)
            }
            val next = operations.toMutableList().also { it[idx] = nextOp }
            state.copy(operations = next)
        }
    }

    is StateActionChangesetCleared ->
        if (state.files.isEmpty()) state else state.copy(files = emptyList())

    else -> state
}

// ─── Annotations Reducer ──────────────────────────────────────────

/**
 * Pure reducer for [AnnotationsState]. Handles all annotations-channel action
 * variants; actions belonging to other channels (or unknown variants) are
 * no-ops that return [state] unchanged.
 *
 * The single-entry-minimum invariant is enforced by the server, not the
 * reducer — a malformed server that removes an annotation's last entry via
 * `annotations/entryRemoved` would leave an empty annotation, which is
 * observable but not catastrophic.
 */
public fun annotationsReducer(state: AnnotationsState, action: StateAction): AnnotationsState = when (action) {
    is StateActionAnnotationsSet -> {
        val annotation = action.value.annotation
        val idx = state.annotations.indexOfFirst { it.id == annotation.id }
        if (idx < 0) {
            state.copy(annotations = state.annotations + annotation)
        } else {
            val next = state.annotations.toMutableList().also { it[idx] = annotation }
            state.copy(annotations = next)
        }
    }

    is StateActionAnnotationsUpdated -> {
        val idx = state.annotations.indexOfFirst { it.id == action.value.annotationId }
        if (idx < 0) {
            state
        } else {
            val annotation = state.annotations[idx]
            val updated = annotation.copy(
                turnId = action.value.turnId ?: annotation.turnId,
                resource = action.value.resource ?: annotation.resource,
                range = action.value.range ?: annotation.range,
                resolved = action.value.resolved ?: annotation.resolved
            )
            val next = state.annotations.toMutableList().also { it[idx] = updated }
            state.copy(annotations = next)
        }
    }

    is StateActionAnnotationsRemoved -> {
        val idx = state.annotations.indexOfFirst { it.id == action.value.annotationId }
        if (idx < 0) {
            state
        } else {
            val next: List<Annotation> = state.annotations.toMutableList().also { it.removeAt(idx) }
            state.copy(annotations = next)
        }
    }

    is StateActionAnnotationsEntrySet -> {
        val tIdx = state.annotations.indexOfFirst { it.id == action.value.annotationId }
        if (tIdx < 0) {
            state
        } else {
            val annotation = state.annotations[tIdx]
            val entry = action.value.entry
            val cIdx = annotation.entries.indexOfFirst { it.id == entry.id }
            val nextEntries = if (cIdx < 0) {
                annotation.entries + entry
            } else {
                annotation.entries.toMutableList().also { it[cIdx] = entry }
            }
            val nextAnnotations = state.annotations.toMutableList()
                .also { it[tIdx] = annotation.copy(entries = nextEntries) }
            state.copy(annotations = nextAnnotations)
        }
    }

    is StateActionAnnotationsEntryRemoved -> {
        val tIdx = state.annotations.indexOfFirst { it.id == action.value.annotationId }
        if (tIdx < 0) {
            state
        } else {
            val annotation = state.annotations[tIdx]
            val cIdx = annotation.entries.indexOfFirst { it.id == action.value.entryId }
            if (cIdx < 0) {
                state
            } else {
                val nextEntries: List<AnnotationEntry> = annotation.entries.toMutableList()
                    .also { it.removeAt(cIdx) }
                val nextAnnotations = state.annotations.toMutableList()
                    .also { it[tIdx] = annotation.copy(entries = nextEntries) }
                state.copy(annotations = nextAnnotations)
            }
        }
    }

    else -> state
}

/**
 * Pure reducer for an [ResourceWatchState]. Pattern-matches on the
 * `resourceWatch/changed` action; actions belonging to other channels
 * (or unknown variants) are no-ops that return [state] unchanged.
 *
 * Watches are intentionally event-pass-through: `resourceWatch/changed`
 * delivers events directly to subscribers and the reducer keeps no
 * history of them. The state captured at subscription time is therefore
 * immutable for the life of the watch.
 */
public fun resourceWatchReducer(state: ResourceWatchState, action: StateAction): ResourceWatchState = when (action) {
    is StateActionResourceWatchChanged -> state
    else -> state
}
