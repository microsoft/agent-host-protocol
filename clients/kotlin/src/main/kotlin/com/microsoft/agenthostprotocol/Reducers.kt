// Reducers.kt — Pure state reducers for AHP root, session, terminal, and
// changeset state.
//
// Hand-written Kotlin port of the per-channel reducers in
// `types/channels-*/reducer.ts`. Behaviour parity with the TypeScript
// reference impl is verified by `FixtureDrivenReducerTest`, which replays
// the shared cross-language fixtures in `types/test-cases/reducers/`.

package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.*
import java.time.Instant
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

/** Pure chat reducer as a [Reducer] instance. Delegates to [chatReducer]. */
public object ChatReducer : Reducer<ChatState, StateAction> {
    override fun reduce(state: ChatState, action: StateAction): ChatState =
        chatReducer(state, action)
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

private fun nowIsoString(): String = Instant.ofEpochMilli(currentTimestampProvider()).toString()

// ─── Status Bitset Helpers ──────────────────────────────────────────────────

/** Bitmask covering the mutually-exclusive activity bits (bits 0–4). */
private val STATUS_ACTIVITY_MASK: UInt = (1u shl 5) - 1u

/** Sets or clears a metadata flag on a status value. */
private fun withStatusFlag(status: SessionStatus, flag: SessionStatus, set: Boolean): SessionStatus =
    if (set) {
        SessionStatus(status.rawValue or flag.rawValue)
    } else {
        SessionStatus(status.rawValue and flag.rawValue.inv())
    }

/**
 * Reflects the session-level [SessionState.inputNeeded] queue into the activity
 * bits of [status]. A non-empty queue promotes the activity to
 * [SessionStatus.INPUT_NEEDED]; emptying it clears the input-needed-specific
 * bit. Since INPUT_NEEDED implies [SessionStatus.IN_PROGRESS], an unblocked turn
 * falls back to IN_PROGRESS while an already-idle session stays idle. Orthogonal
 * flags (IS_READ / IS_ARCHIVED) are preserved.
 */
private fun withInputNeededStatus(status: SessionStatus, inputNeeded: List<SessionInputRequest>): SessionStatus =
    if (inputNeeded.isNotEmpty()) {
        SessionStatus((status.rawValue and STATUS_ACTIVITY_MASK.inv()) or SessionStatus.INPUT_NEEDED.rawValue)
    } else {
        val inputBit = SessionStatus.INPUT_NEEDED.rawValue and SessionStatus.IN_PROGRESS.rawValue.inv()
        SessionStatus(status.rawValue and inputBit.inv())
    }

/** Derives the summary status from live session work, preserving orthogonal flags. */
private fun chatSummaryStatus(state: ChatState, terminalStatus: SessionStatus? = null): SessionStatus {
    val activity: SessionStatus = when {
        terminalStatus != null -> terminalStatus
        hasOpenInputRequest(state) || hasBlockingToolCall(state) ->
            SessionStatus.INPUT_NEEDED
        state.activeTurn != null -> SessionStatus.IN_PROGRESS
        else -> SessionStatus.IDLE
    }
    val preserved = state.status.rawValue and STATUS_ACTIVITY_MASK.inv()
    return SessionStatus(preserved or activity.rawValue)
}

private fun hasOpenInputRequest(state: ChatState): Boolean =
    state.activeTurn?.responseParts?.any { part ->
        part is ResponsePartInputRequest && part.value.response == null
    } == true

/**
 * Returns a state with chat [ChatState.status] recomputed. Use after reducers that
 * change data feeding into [chatSummaryStatus] (e.g. tool call lifecycle
 * transitions that may enter or leave a blocking state).
 */
private fun refreshChatSummaryStatus(state: ChatState): ChatState {
    val status = chatSummaryStatus(state)
    if (status.rawValue == state.status.rawValue) {
        return state
    }
    return state.copy(status = status)
}

/**
 * Returns `true` if the active turn has any tool call blocking on something
 * external to the turn itself — a pending confirmation/result-confirmation,
 * or a tool call paused on MCP authentication.
 */
private fun hasBlockingToolCall(state: ChatState): Boolean {
    val active = state.activeTurn ?: return false
    return active.responseParts.any { part ->
        part is ResponsePartToolCall &&
            (part.value.toolCall is ToolCallStatePendingConfirmation ||
                part.value.toolCall is ToolCallStatePendingResultConfirmation ||
                part.value.toolCall is ToolCallStateAuthRequired)
    }
}

// ─── Tool Call Helpers ──────────────────────────────────────────────────────

/** Common base fields shared by all tool call lifecycle states. */
private data class ToolCallBase(
    val toolCallId: String,
    val toolName: String,
    val displayName: String,
    val intention: String?,
    val contributor: ToolCallContributor?,
    val meta: Map<String, JsonElement>?,
) {
    fun withMeta(meta: Map<String, JsonElement>?): ToolCallBase = copy(meta = meta ?: this.meta)
}

private fun toolCallBase(tc: ToolCallState): ToolCallBase = when (tc) {
    is ToolCallStateStreaming -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.intention, it.contributor, it.meta)
    }
    is ToolCallStatePendingConfirmation -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.intention, it.contributor, it.meta)
    }
    is ToolCallStateRunning -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.intention, it.contributor, it.meta)
    }
    is ToolCallStateAuthRequired -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.intention, it.contributor, it.meta)
    }
    is ToolCallStatePendingResultConfirmation -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.intention, it.contributor, it.meta)
    }
    is ToolCallStateCompleted -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.intention, it.contributor, it.meta)
    }
    is ToolCallStateCancelled -> tc.value.let {
        ToolCallBase(it.toolCallId, it.toolName, it.displayName, it.intention, it.contributor, it.meta)
    }
    // Forward-compat: unknown lifecycle variants have no extractable base; mirror
    // Rust's `ToolCallState::Unknown(_) => (String::new(), ...)`. Combined with
    // `toolCallIdOf` returning `""`, this guarantees an unknown tool call never
    // matches a real `toolCallId` in delta/lookup paths.
    is ToolCallStateUnknown -> ToolCallBase("", "", "", null, null, null)
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

private fun sessionInputRequestId(r: SessionInputRequest): String? = when (r) {
    is SessionInputRequestChatInput -> r.value.id
    is SessionInputRequestToolConfirmation -> r.value.id
    is SessionInputRequestToolClientExecution -> r.value.id
    is SessionInputRequestToolAuthentication -> r.value.id
    // Unknown variants carry an opaque `raw` JSON object — no id to expose.
    is SessionInputRequestUnknown -> null
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

private fun withChildCustomizationEnabled(c: ChildCustomization, enabled: Boolean): ChildCustomization = when (c) {
    is ChildCustomizationAgent -> ChildCustomizationAgent(c.value.copy(enabled = enabled))
    is ChildCustomizationSkill -> ChildCustomizationSkill(c.value.copy(enabled = enabled))
    is ChildCustomizationPrompt -> ChildCustomizationPrompt(c.value.copy(enabled = enabled))
    is ChildCustomizationRule -> ChildCustomizationRule(c.value.copy(enabled = enabled))
    is ChildCustomizationHook -> ChildCustomizationHook(c.value.copy(enabled = enabled))
    is ChildCustomizationMcpServer -> ChildCustomizationMcpServer(c.value.copy(enabled = enabled))
    is ChildCustomizationUnknown -> c
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
    state: ChatState,
    turnId: String,
    toolCallId: String,
    updater: (ToolCallState) -> ToolCallState,
): ChatState {
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
    state: ChatState,
    turnId: String,
    partId: String,
    updater: (ResponsePart) -> ResponsePart,
): ChatState {
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
    state: ChatState,
    turnId: String,
    duration: Long,
    turnState: TurnState,
    terminalStatus: SessionStatus? = null,
    error: ErrorInfo? = null,
): ChatState {
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
            is ToolCallStateAuthRequired -> tc.value.invocationMessage
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
            is ToolCallStateAuthRequired -> tc.value.toolInput
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
                        intention = base.intention,
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

    // Defensive clamp: `duration` is producer-supplied and opaque to this
    // reducer, but a negative value would be nonsensical to display.
    val turn = Turn(
        id = active.id,
        startedAt = active.startedAt,
        duration = maxOf(0L, duration),
        message = active.message,
        responseParts = finalizedParts,
        usage = active.usage,
        state = turnState,
        error = error,
    )

    val withoutTurn = state.copy(
        turns = state.turns + turn,
        activeTurn = null,
        modifiedAt = nowIsoString(),
    )
    return withoutTurn.copy(status = chatSummaryStatus(withoutTurn, terminalStatus))
}

private fun upsertInputRequest(state: ChatState, request: ChatInputRequest): ChatState {
    val activeTurn = state.activeTurn ?: return state
    val idx = activeTurn.responseParts.indexOfFirst { part ->
        part is ResponsePartInputRequest
            && part.value.response == null
            && part.value.request.id == request.id
    }
    val updated = activeTurn.responseParts.toMutableList()
    if (idx >= 0) {
        val existing = (updated[idx] as ResponsePartInputRequest).value
        updated[idx] = ResponsePartInputRequest(
            InputRequestResponsePart(
                kind = ResponsePartKind.INPUT_REQUEST,
                request = request.copy(answers = request.answers ?: existing.request.answers),
            ),
        )
    } else {
        updated += ResponsePartInputRequest(
            InputRequestResponsePart(
                kind = ResponsePartKind.INPUT_REQUEST,
                request = request,
            ),
        )
    }
    val next = state.copy(activeTurn = activeTurn.copy(responseParts = updated))
    return next.copy(
        status = withStatusFlag(chatSummaryStatus(next), SessionStatus.IS_READ, false),
        modifiedAt = nowIsoString(),
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
    is StateActionSessionReady -> state.copy(lifecycle = SessionLifecycle.READY)

    is StateActionSessionCreationFailed -> state.copy(
        lifecycle = SessionLifecycle.CREATION_FAILED,
        creationError = action.value.error,
    )

    is StateActionSessionChatAdded -> {
        val summary = action.value.summary
        val idx = state.chats.indexOfFirst { it.resource == summary.resource }
        if (idx < 0) {
            state.copy(chats = state.chats + summary)
        } else {
            val updated = state.chats.toMutableList()
            updated[idx] = summary
            state.copy(chats = updated)
        }
    }

    is StateActionSessionChatRemoved -> {
        val chat = action.value.chat
        val idx = state.chats.indexOfFirst { it.resource == chat }
        if (idx < 0) {
            state
        } else {
            val updated = state.chats.toMutableList()
            updated.removeAt(idx)
            state.copy(
                chats = updated,
                defaultChat = if (state.defaultChat == chat) null else state.defaultChat,
            )
        }
    }

    is StateActionSessionChatUpdated -> {
        val a = action.value
        val idx = state.chats.indexOfFirst { it.resource == a.chat }
        if (idx < 0) {
            state
        } else {
            val prior = state.chats[idx]
            val c = a.changes
            val updatedSummary = prior.copy(
                title = c.title ?: prior.title,
                status = c.status ?: prior.status,
                activity = c.activity ?: prior.activity,
                modifiedAt = c.modifiedAt ?: prior.modifiedAt,
                origin = c.origin ?: prior.origin,
                workingDirectory = c.workingDirectory ?: prior.workingDirectory,
            )
            val updated = state.chats.toMutableList()
            updated[idx] = updatedSummary
            state.copy(chats = updated)
        }
    }

    is StateActionSessionDefaultChatChanged -> state.copy(defaultChat = action.value.defaultChat)

    is StateActionSessionTitleChanged -> state.copy(title = action.value.title)

    is StateActionSessionIsReadChanged -> state.copy(
        status = withStatusFlag(state.status, SessionStatus.IS_READ, action.value.isRead),
    )

    is StateActionSessionIsArchivedChanged -> state.copy(
        status = withStatusFlag(state.status, SessionStatus.IS_ARCHIVED, action.value.isArchived),
    )

    is StateActionSessionActivityChanged -> state.copy(activity = action.value.activity)

    is StateActionSessionChangesetsChanged -> state.copy(changesets = action.value.changesets)

    is StateActionSessionConfigChanged -> {
        val a = action.value
        val config = state.config
        if (config == null) state else {
            val newValues = if (a.replace == true) a.config else config.values + a.config
            state.copy(config = config.copy(values = newValues))
        }
    }

    is StateActionSessionMetaChanged -> state.copy(meta = action.value.meta)

    is StateActionSessionServerToolsChanged -> state.copy(serverTools = action.value.tools)

    is StateActionSessionActiveClientSet -> {
        val client = action.value.activeClient
        val idx = state.activeClients.indexOfFirst { it.clientId == client.clientId }
        if (idx < 0) {
            state.copy(activeClients = state.activeClients + client)
        } else {
            val updated = state.activeClients.toMutableList()
            updated[idx] = client
            state.copy(activeClients = updated)
        }
    }

    is StateActionSessionActiveClientRemoved -> {
        val idx = state.activeClients.indexOfFirst { it.clientId == action.value.clientId }
        if (idx < 0) {
            state
        } else {
            val updated = state.activeClients.toMutableList()
            updated.removeAt(idx)
            state.copy(activeClients = updated)
        }
    }

    is StateActionSessionInputNeededSet -> {
        val request = action.value.request
        val id = sessionInputRequestId(request)
        if (id == null) state else {
            val list = state.inputNeeded ?: emptyList()
            val idx = list.indexOfFirst { sessionInputRequestId(it) == id }
            val updated = if (idx < 0) {
                list + request
            } else {
                list.toMutableList().also { it[idx] = request }
            }
            state.copy(inputNeeded = updated, status = withInputNeededStatus(state.status, updated))
        }
    }

    is StateActionSessionInputNeededRemoved -> {
        val list = state.inputNeeded
        if (list == null) state else {
            val idx = list.indexOfFirst { sessionInputRequestId(it) == action.value.id }
            if (idx < 0) state else {
                val updated = list.toMutableList()
                updated.removeAt(idx)
                state.copy(
                    inputNeeded = if (updated.isEmpty()) null else updated,
                    status = withInputNeededStatus(state.status, updated),
                )
            }
        }
    }

    is StateActionSessionCustomizationsChanged -> state.copy(customizations = action.value.customizations)

    is StateActionSessionCustomizationToggled -> {
        val a = action.value
        val list = state.customizations
        if (list == null) state else {
            val idx = list.indexOfFirst { customizationId(it) == a.id }
            if (idx >= 0) {
                val updated = list.toMutableList()
                updated[idx] = withCustomizationEnabled(updated[idx], a.enabled)
                state.copy(customizations = updated)
            } else run {
                for (i in list.indices) {
                    val children = customizationChildren(list[i]) ?: continue
                    val childIdx = children.indexOfFirst { childCustomizationId(it) == a.id }
                    if (childIdx < 0) continue
                    val newChildren = children.toMutableList()
                    newChildren[childIdx] = withChildCustomizationEnabled(newChildren[childIdx], a.enabled)
                    val updated = list.toMutableList()
                    updated[i] = withCustomizationChildren(list[i], newChildren)
                    return@run state.copy(customizations = updated)
                }
                state
            }
        }
    }

    is StateActionSessionCustomizationUpdated -> {
        val a = action.value
        val targetId = customizationId(a.customization)
        if (targetId == null) state else {
            val list = state.customizations ?: emptyList()
            val idx = list.indexOfFirst { customizationId(it) == targetId }
            if (idx < 0) state.copy(customizations = list + a.customization) else {
                val updated = list.toMutableList()
                updated[idx] = a.customization
                state.copy(customizations = updated)
            }
        }
    }

    is StateActionSessionCustomizationRemoved -> {
        val a = action.value
        val list = state.customizations
        if (list == null) state else {
            val topIdx = list.indexOfFirst { customizationId(it) == a.id }
            if (topIdx >= 0) {
                val updated = list.toMutableList()
                updated.removeAt(topIdx)
                state.copy(customizations = updated)
            } else {
                var changed = false
                val updated = list.map { container ->
                    val children = customizationChildren(container)
                    if (children == null) container else {
                        val childIdx = children.indexOfFirst { childCustomizationId(it) == a.id }
                        if (childIdx < 0) container else {
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
        val a = action.value
        updateMcpServerCustomizationState(state, a.id, a.state, a.channel)
    }

    is StateActionSessionMcpServerStartRequested -> {
        val a = action.value
        updateMcpServerCustomizationState(
            state,
            a.id,
            McpServerStateStarting(McpServerStartingState(McpServerStatus.STARTING)),
            null
        )
    }

    is StateActionSessionMcpServerStopRequested -> {
        val a = action.value
        updateMcpServerCustomizationState(
            state,
            a.id,
            McpServerStateStopped(McpServerStoppedState(McpServerStatus.STOPPED)),
            null
        )
    }

    else -> state
}

private fun updateMcpServerCustomizationState(
    state: SessionState,
    id: String,
    nextState: McpServerState,
    channel: URI?
): SessionState {
        val list = state.customizations
    return if (list == null) state else {
            val topIdx = list.indexOfFirst { customizationId(it) == id }
            if (topIdx >= 0) {
                val entry = list[topIdx]
                if (entry !is CustomizationMcpServer) state else {
                    val updated = list.toMutableList()
                    updated[topIdx] = CustomizationMcpServer(entry.value.copy(state = nextState, channel = channel))
                    state.copy(customizations = updated)
                }
            } else {
                var changed = false
                val updated = list.map { container ->
                    val children = customizationChildren(container)
                    if (children == null) container else {
                        val childIdx = children.indexOfFirst { childCustomizationId(it) == id }
                        if (childIdx < 0) container else {
                            val child = children[childIdx]
                            if (child !is ChildCustomizationMcpServer) container else {
                                changed = true
                                val newChildren = children.toMutableList()
                                newChildren[childIdx] = ChildCustomizationMcpServer(child.value.copy(state = nextState, channel = channel))
                                withCustomizationChildren(container, newChildren)
                            }
                        }
                    }
                }
                if (!changed) state else state.copy(customizations = updated)
            }
        }
}

// ─── Chat Reducer ───────────────────────────────────────────────────────────

/** Pure reducer for [ChatState]. Handles all chat-channel action variants. */
public fun chatReducer(state: ChatState, action: StateAction): ChatState = when (action) {

    // ── Turn Lifecycle ────────────────────────────────────────────────────

    is StateActionChatTurnStarted -> {
        val a = action.value
        val withTurn = state.copy(
            activeTurn = ActiveTurn(
                id = a.turnId,
                startedAt = a.startedAt,
                message = a.message,
                responseParts = emptyList(),
                usage = null,
            ),
        )
        val withStatus = withTurn.copy(
            status = withStatusFlag(chatSummaryStatus(withTurn), SessionStatus.IS_READ, false),
            modifiedAt = nowIsoString(),
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

    is StateActionChatDelta -> {
        val a = action.value
        updateResponsePart(state, a.turnId, a.partId) { part ->
            if (part is ResponsePartMarkdown) {
                ResponsePartMarkdown(part.value.copy(content = part.value.content + a.content))
            } else {
                part
            }
        }
    }

    is StateActionChatResponsePart -> {
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

    is StateActionChatTurnComplete ->
        endTurn(state, action.value.turnId, action.value.duration, TurnState.COMPLETE)

    is StateActionChatTurnCancelled ->
        endTurn(state, action.value.turnId, action.value.duration, TurnState.CANCELLED)

    is StateActionChatError ->
        endTurn(state, action.value.turnId, action.value.duration, TurnState.ERROR, SessionStatus.ERROR, action.value.error)

    is StateActionChatActivityChanged ->
        state.copy(activity = action.value.activity)

    // ── Tool Call State Machine ───────────────────────────────────────────

    is StateActionChatToolCallStart -> {
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
                            intention = a.intention,
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

    is StateActionChatToolCallDelta -> {
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

    is StateActionChatToolCallReady -> {
        val a = action.value
        refreshChatSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                if (
                    tc !is ToolCallStateStreaming
                    && tc !is ToolCallStateRunning
                    && tc !is ToolCallStatePendingConfirmation
                ) {
                    tc
                } else {
                    val base = toolCallBase(tc).withMeta(a.meta)
                    val pending = (tc as? ToolCallStatePendingConfirmation)?.value
                    if (a.confirmed != null) {
                        ToolCallStateRunning(
                            ToolCallRunningState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                intention = base.intention,
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
                                intention = base.intention,
                                contributor = base.contributor,
                                meta = base.meta,
                                invocationMessage = a.invocationMessage,
                                toolInput = a.toolInput ?: pending?.toolInput,
                                status = ToolCallStatus.PENDING_CONFIRMATION,
                                confirmationTitle = a.confirmationTitle ?: pending?.confirmationTitle,
                                riskAssessment = a.riskAssessment ?: pending?.riskAssessment,
                                edits = a.edits ?: pending?.edits,
                                editable = a.editable ?: pending?.editable,
                                options = a.options ?: pending?.options,
                            ),
                        )
                    }
                }
            },
        )
    }

    is StateActionChatToolCallConfirmed -> {
        val a = action.value
        refreshChatSummaryStatus(
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
                                intention = base.intention,
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
                                intention = base.intention,
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

    is StateActionChatToolCallComplete -> {
        val a = action.value
        val result = a.result
        refreshChatSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                val (invocationMessage, toolInput, confirmed, selectedOption, preAuthContent, fromAuthRequired) = when (tc) {
                    is ToolCallStateRunning -> CompleteCtx(
                        tc.value.invocationMessage,
                        tc.value.toolInput,
                        tc.value.confirmed,
                        tc.value.selectedOption,
                        null,
                    )
                    is ToolCallStatePendingConfirmation -> CompleteCtx(
                        tc.value.invocationMessage,
                        tc.value.toolInput,
                        ToolCallConfirmationReason.NOT_NEEDED,
                        null,
                        null,
                    )
                    // A client MAY cancel an auth-required MCP tool call by dispatching a
                    // failed completion instead of authenticating. A successful completion
                    // is invalid here — execution never resumed after the auth challenge —
                    // and is ignored, leaving the call in auth-required. Any partial content
                    // produced before the call paused for auth is preserved unless the
                    // dispatched result supplies its own content.
                    is ToolCallStateAuthRequired -> {
                        if (result.success) {
                            return@updateToolCallInParts tc
                        }
                        CompleteCtx(
                            tc.value.invocationMessage,
                            tc.value.toolInput,
                            tc.value.confirmed,
                            tc.value.selectedOption,
                            tc.value.content,
                            fromAuthRequired = true,
                        )
                    }
                    else -> return@updateToolCallInParts tc
                }
                val base = toolCallBase(tc).withMeta(a.meta)
                val content = result.content ?: preAuthContent
                // Cancelling from auth-required always completes terminally: the
                // pending auth challenge isn't a "pending result" the client can
                // review, so requiresResultConfirmation is ignored for this path —
                // it must never enter pending-result-confirmation.
                if (a.requiresResultConfirmation == true && !fromAuthRequired) {
                    ToolCallStatePendingResultConfirmation(
                        ToolCallPendingResultConfirmationState(
                            toolCallId = base.toolCallId,
                            toolName = base.toolName,
                            displayName = base.displayName,
                            intention = base.intention,
                            contributor = base.contributor,
                            meta = base.meta,
                            invocationMessage = invocationMessage,
                            toolInput = toolInput,
                            success = result.success,
                            pastTenseMessage = result.pastTenseMessage,
                            content = content,
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
                            intention = base.intention,
                            contributor = base.contributor,
                            meta = base.meta,
                            invocationMessage = invocationMessage,
                            toolInput = toolInput,
                            success = result.success,
                            pastTenseMessage = result.pastTenseMessage,
                            content = content,
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

    is StateActionChatToolCallResultConfirmed -> {
        val a = action.value
        refreshChatSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                if (tc !is ToolCallStatePendingResultConfirmation) tc else {
                    val base = toolCallBase(tc).withMeta(a.meta)
                    if (a.approved) {
                        ToolCallStateCompleted(
                            ToolCallCompletedState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                intention = base.intention,
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
                                intention = base.intention,
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

    is StateActionChatToolCallContentChanged -> {
        val a = action.value
        updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
            if (tc !is ToolCallStateRunning) tc else {
                ToolCallStateRunning(tc.value.copy(meta = a.meta ?: tc.value.meta, content = a.content))
            }
        }
    }

    is StateActionChatToolCallAuthRequired -> {
        val a = action.value
        refreshChatSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                if (tc !is ToolCallStateRunning) {
                    tc
                } else {
                    val contributor = tc.value.contributor
                    if (contributor !is ToolCallContributorMcp) {
                        tc
                    } else {
                        val base = toolCallBase(tc).withMeta(a.meta)
                        ToolCallStateAuthRequired(
                            ToolCallAuthRequiredState(
                                toolCallId = base.toolCallId,
                                toolName = base.toolName,
                                displayName = base.displayName,
                                intention = base.intention,
                                contributor = contributor,
                                meta = base.meta,
                                invocationMessage = tc.value.invocationMessage,
                                toolInput = tc.value.toolInput,
                                confirmed = tc.value.confirmed,
                                selectedOption = tc.value.selectedOption,
                                status = ToolCallStatus.AUTH_REQUIRED,
                                auth = a.auth,
                                content = tc.value.content,
                            ),
                        )
                    }
                }
            },
        )
    }

    is StateActionChatToolCallAuthResolved -> {
        val a = action.value
        refreshChatSummaryStatus(
            updateToolCallInParts(state, a.turnId, a.toolCallId) { tc ->
                if (tc !is ToolCallStateAuthRequired) {
                    tc
                } else {
                    val base = toolCallBase(tc).withMeta(a.meta)
                    ToolCallStateRunning(
                        ToolCallRunningState(
                            toolCallId = base.toolCallId,
                            toolName = base.toolName,
                            displayName = base.displayName,
                            intention = base.intention,
                            contributor = base.contributor,
                            meta = base.meta,
                            invocationMessage = tc.value.invocationMessage,
                            toolInput = tc.value.toolInput,
                            confirmed = tc.value.confirmed,
                            selectedOption = tc.value.selectedOption,
                            status = ToolCallStatus.RUNNING,
                            content = tc.value.content,
                        ),
                    )
                }
            },
        )
    }

    // ── Metadata ──────────────────────────────────────────────────────────
    is StateActionChatUsage -> {
        val a = action.value
        val activeTurn = state.activeTurn
        if (activeTurn == null || activeTurn.id != a.turnId) {
            state
        } else {
            state.copy(activeTurn = activeTurn.copy(usage = a.usage))
        }
    }

    is StateActionChatReasoning -> {
        val a = action.value
        updateResponsePart(state, a.turnId, a.partId) { part ->
            if (part is ResponsePartReasoning) {
                ResponsePartReasoning(part.value.copy(content = part.value.content + a.content))
            } else {
                part
            }
        }
    }
    // ── Truncation ────────────────────────────────────────────────────────

    is StateActionChatTruncated -> {
        val a = action.value
        val turns = if (a.turnId == null) {
            emptyList()
        } else {
            val idx = state.turns.indexOfFirst { it.id == a.turnId }
            if (idx < 0) return@chatReducer state
            state.turns.subList(0, idx + 1).toList()
        }
        val next = state.copy(
            turns = turns,
            turnsNextCursor = if (a.turnId == null) null else state.turnsNextCursor,
            activeTurn = null,
            modifiedAt = nowIsoString(),
        )
        next.copy(status = chatSummaryStatus(next))
    }

    is StateActionChatTurnsLoaded -> {
        val a = action.value
        val existingIds = state.turns.map { it.id }.toSet()
        val olderTurns = a.turns.filter { it.id !in existingIds }
        state.copy(
            turns = olderTurns + state.turns,
            turnsNextCursor = a.turnsNextCursor,
        )
    }

    // ── Session Input Requests ────────────────────────────────────────────

    is StateActionChatInputRequested ->
        upsertInputRequest(state, action.value.request)

    is StateActionChatInputAnswerChanged -> {
        val a = action.value
        val activeTurn = state.activeTurn
        val idx = activeTurn?.responseParts?.indexOfFirst { part ->
            part is ResponsePartInputRequest
                && part.value.response == null
                && part.value.request.id == a.requestId
        } ?: -1
        if (activeTurn == null || idx < 0) {
            state
        } else {
            val part = (activeTurn.responseParts[idx] as ResponsePartInputRequest).value
            val request = part.request
            val answers = (request.answers ?: emptyMap()).toMutableMap()
            if (a.answer == null) {
                answers.remove(a.questionId)
            } else {
                answers[a.questionId] = a.answer
            }
            val newRequest = request.copy(answers = if (answers.isEmpty()) null else answers)
            val updated = activeTurn.responseParts.toMutableList().also {
                it[idx] = ResponsePartInputRequest(part.copy(request = newRequest))
            }
            state.copy(
                activeTurn = activeTurn.copy(responseParts = updated),
                modifiedAt = nowIsoString(),
            )
        }
    }

    is StateActionChatInputCompleted -> {
        val a = action.value
        val activeTurn = state.activeTurn
        val idx = activeTurn?.responseParts?.indexOfFirst { part ->
            part is ResponsePartInputRequest
                && part.value.response == null
                && part.value.request.id == a.requestId
        } ?: -1
        if (activeTurn == null || idx < 0) {
            state
        } else {
            val part = (activeTurn.responseParts[idx] as ResponsePartInputRequest).value
            val finalAnswers = (part.request.answers ?: emptyMap()) + (a.answers ?: emptyMap())
            val updated = activeTurn.responseParts.toMutableList().also {
                it[idx] = ResponsePartInputRequest(
                    part.copy(
                        request = part.request.copy(answers = finalAnswers.ifEmpty { null }),
                        response = a.response,
                    ),
                )
            }
            val next = state.copy(activeTurn = activeTurn.copy(responseParts = updated))
            next.copy(
                status = chatSummaryStatus(next),
                modifiedAt = nowIsoString(),
            )
        }
    }

    // ── Pending Messages ──────────────────────────────────────────────────

    is StateActionChatPendingMessageSet -> {
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

    is StateActionChatPendingMessageRemoved -> {
        val a = action.value
        if (a.kind == PendingMessageKind.STEERING) {
            val steering = state.steeringMessage
            if (steering == null || steering.id != a.id) {
                state
            } else {
                state.copy(steeringMessage = null)
            }
        } else {
            val existing = state.queuedMessages ?: return@chatReducer state
            val filtered = existing.filter { it.id != a.id }
            if (filtered.size == existing.size) {
                state
            } else {
                state.copy(queuedMessages = filtered.ifEmpty { null })
            }
        }
    }

    is StateActionChatQueuedMessagesReordered -> {
        val a = action.value
        val existing = state.queuedMessages ?: return@chatReducer state
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

    is StateActionChatDraftChanged -> state.copy(draft = action.value.draft)

    else -> state

}

/**
 * Locally scoped helper for tool-call completion to avoid Pair/Triple noise
 * when carrying the four context fields from the prior tool call state into
 * the new one.
 */
private data class CompleteCtx(
    val invocationMessage: com.microsoft.agenthostprotocol.generated.StringOrMarkdown,
    val toolInput: String?,
    val confirmed: ToolCallConfirmationReason,
    val selectedOption: ConfirmationOption?,
    val preAuthContent: List<ToolResultContent>?,
    /** Whether this context came from `auth-required` (a cancellation), which forces a terminal completion. */
    val fromAuthRequired: Boolean = false,
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

    is StateActionChangesetFilesReviewChanged -> {
        val ids = action.value.files.toSet()
        var changed = false
        val next = state.files.map { file ->
            if (file.id !in ids || file.reviewed == action.value.reviewed) {
                file
            } else {
                changed = true
                file.copy(reviewed = action.value.reviewed)
            }
        }
        if (changed) state.copy(files = next) else state
    }

    is StateActionChangesetContentChanged ->
        if (action.value.operations == null) {
            state.copy(files = action.value.files, error = action.value.error)
        } else {
            state.copy(files = action.value.files, operations = action.value.operations, error = action.value.error)
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
            val next = state.annotations.toMutableList().also { it.removeAt(idx) }
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
