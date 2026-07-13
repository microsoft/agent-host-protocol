package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Focused unit tests covering the reducer module's public surface, the
 * `Reducer<S, A>` fun-interface wrapper, and a handful of tricky behaviors
 * (queued message reorder algorithm, timestamp provider override). Broad
 * behavior parity is verified by [FixtureDrivenReducerTest] against the
 * shared cross-language fixtures.
 */
class ReducersTest {

    private var originalProvider: (() -> Long)? = null

    @BeforeEach
    fun mockTimestamp() {
        originalProvider = currentTimestampProvider
        currentTimestampProvider = { MOCK_NOW }
    }

    @AfterEach
    fun restoreTimestamp() {
        originalProvider?.let { currentTimestampProvider = it }
        originalProvider = null
    }

    @Test
    fun `Reducer object wrappers delegate to free functions`() {
        // RootReducer
        val rootBefore = RootState(agents = emptyList())
        val agents = listOf(
            AgentInfo(
                provider = "copilot",
                displayName = "Copilot",
                description = "AI",
                models = emptyList(),
            ),
        )
        val rootAction = StateActionRootAgentsChanged(
            RootAgentsChangedAction(type = ActionType.ROOT_AGENTS_CHANGED, agents = agents),
        )
        val rootViaFn = rootReducer(rootBefore, rootAction)
        val rootViaObj = RootReducer.reduce(rootBefore, rootAction)
        assertEquals(rootViaFn, rootViaObj)
        assertEquals(agents, rootViaObj.agents)

        // SessionReducer
        val session = newSession()
        val titleAction = StateActionSessionTitleChanged(
            SessionTitleChangedAction(type = ActionType.SESSION_TITLE_CHANGED, title = "New Title"),
        )
        val viaFn = sessionReducer(session, titleAction)
        val viaObj = SessionReducer.reduce(session, titleAction)
        assertEquals(viaFn, viaObj)
        assertEquals("New Title", viaObj.title)

        // ChangesetReducer
        val cs = ChangesetState(status = ChangesetStatus.READY, files = emptyList())
        val statusAction = StateActionChangesetStatusChanged(
            ChangesetStatusChangedAction(
                type = ActionType.CHANGESET_STATUS_CHANGED,
                status = ChangesetStatus.ERROR,
                error = ErrorInfo(errorType = "X", message = "boom"),
            ),
        )
        val csFn = changesetReducer(cs, statusAction)
        val csObj = ChangesetReducer.reduce(cs, statusAction)
        assertEquals(csFn, csObj)
        assertEquals(ChangesetStatus.ERROR, csObj.status)
        assertEquals("boom", csObj.error?.message)

        // TerminalReducer
        val term = TerminalState(
            title = "term",
            content = emptyList(),
            claim = TerminalClaimClient(
                TerminalClientClaim(kind = TerminalClaimKind.CLIENT, clientId = "c-1"),
            ),
        )
        val dataAction = StateActionTerminalData(
            TerminalDataAction(type = ActionType.TERMINAL_DATA, data = "hello"),
        )
        val termFn = terminalReducer(term, dataAction)
        val termObj = TerminalReducer.reduce(term, dataAction)
        assertEquals(termFn, termObj)
        val part = termObj.content.single()
        assertIs<TerminalContentPartUnclassified>(part)
        assertEquals("hello", part.value.value)
    }

    @Test
    fun `terminal_input is a no-op`() {
        val term = TerminalState(
            title = "term",
            content = listOf(
                TerminalContentPartUnclassified(
                    com.microsoft.agenthostprotocol.generated.TerminalUnclassifiedPart(
                        type = "unclassified",
                        value = "before",
                    ),
                ),
            ),
            claim = TerminalClaimClient(
                TerminalClientClaim(kind = TerminalClaimKind.CLIENT, clientId = "c-1"),
            ),
        )
        val input = StateActionTerminalInput(
            TerminalInputAction(type = ActionType.TERMINAL_INPUT, data = "ls"),
        )
        // Identity equality (===) verifies the reducer returned the exact
        // same instance rather than producing a new equal value.
        assertSame(term, terminalReducer(term, input))
    }

    @Test
    fun `queued message reorder preserves messages not mentioned in order`() {
        val original = listOf(
            PendingMessage(id = "m1", message = userMessage("1")),
            PendingMessage(id = "m2", message = userMessage("2")),
            PendingMessage(id = "m3", message = userMessage("3")),
        )
        val chat = newChat().copy(queuedMessages = original)
        val reorder = StateActionChatQueuedMessagesReordered(
            ChatQueuedMessagesReorderedAction(
                type = ActionType.CHAT_QUEUED_MESSAGES_REORDERED,
                order = listOf("m3", "m1"),
            ),
        )
        val result = chatReducer(chat, reorder)
        assertEquals(listOf("m3", "m1", "m2"), result.queuedMessages?.map { it.id })
    }

    @Test
    fun `queued message reorder ignores duplicate and unknown ids`() {
        val original = listOf(
            PendingMessage(id = "m1", message = userMessage("1")),
            PendingMessage(id = "m2", message = userMessage("2")),
        )
        val chat = newChat().copy(queuedMessages = original)
        val reorder = StateActionChatQueuedMessagesReordered(
            ChatQueuedMessagesReorderedAction(
                type = ActionType.CHAT_QUEUED_MESSAGES_REORDERED,
                order = listOf("m2", "m999", "m2", "m1"),
            ),
        )
        val result = chatReducer(chat, reorder)
        assertEquals(listOf("m2", "m1"), result.queuedMessages?.map { it.id })
    }

    @Test
    fun `pendingMessageSet upserts steering and queued messages distinctly`() {
        val chat = newChat()
        val setSteering = StateActionChatPendingMessageSet(
            ChatPendingMessageSetAction(
                type = ActionType.CHAT_PENDING_MESSAGE_SET,
                kind = PendingMessageKind.STEERING,
                id = "s1",
                message = userMessage("steer"),
            ),
        )
        val withSteering = chatReducer(chat, setSteering)
        assertEquals("s1", withSteering.steeringMessage?.id)
        assertNull(withSteering.queuedMessages)

        val setQueued1 = StateActionChatPendingMessageSet(
            ChatPendingMessageSetAction(
                type = ActionType.CHAT_PENDING_MESSAGE_SET,
                kind = PendingMessageKind.QUEUED,
                id = "q1",
                message = userMessage("q-1"),
            ),
        )
        val setQueued2 = StateActionChatPendingMessageSet(
            ChatPendingMessageSetAction(
                type = ActionType.CHAT_PENDING_MESSAGE_SET,
                kind = PendingMessageKind.QUEUED,
                id = "q2",
                message = userMessage("q-2"),
            ),
        )
        val withTwo = chatReducer(chatReducer(withSteering, setQueued1), setQueued2)
        assertEquals(listOf("q1", "q2"), withTwo.queuedMessages?.map { it.id })

        // Re-setting q1 with a new body should replace in place rather than append.
        val replaceQueued1 = StateActionChatPendingMessageSet(
            ChatPendingMessageSetAction(
                type = ActionType.CHAT_PENDING_MESSAGE_SET,
                kind = PendingMessageKind.QUEUED,
                id = "q1",
                message = userMessage("q-1-revised"),
            ),
        )
        val withReplacement = chatReducer(withTwo, replaceQueued1)
        assertEquals(listOf("q1", "q2"), withReplacement.queuedMessages?.map { it.id })
        assertEquals("q-1-revised", withReplacement.queuedMessages?.first()?.message?.text)
    }

    @Test
    fun `turn start stores producer timestamp while modifiedAt uses local clock`() {
        val chatResult = chatReducer(
            newChat(),
            StateActionChatTurnStarted(
                ChatTurnStartedAction(
                    type = ActionType.CHAT_TURN_STARTED,
                    turnId = "turn-1",
                    startedAt = "1970-01-01T00:00:12.345Z",
                    message = userMessage("hello"),
                ),
            ),
        )
        assertEquals("1970-01-01T00:00:09.999Z", chatResult.modifiedAt)
        assertEquals("1970-01-01T00:00:12.345Z", chatResult.activeTurn?.startedAt)
    }

    @Test
    fun `actions from other channels are no-ops`() {
        // A root reducer should ignore session actions, and vice versa.
        val session = newSession().copy(title = "before")
        val rootAction = StateActionRootAgentsChanged(
            RootAgentsChangedAction(type = ActionType.ROOT_AGENTS_CHANGED, agents = emptyList()),
        )
        // Session reducer should leave session state unchanged when handed a root action.
        assertSame(session, sessionReducer(session, rootAction))

        val rootBefore = RootState(agents = emptyList())
        val sessionAction = StateActionSessionTitleChanged(
            SessionTitleChangedAction(type = ActionType.SESSION_TITLE_CHANGED, title = "X"),
        )
        // Root reducer should leave root state unchanged when handed a session action.
        assertSame(rootBefore, rootReducer(rootBefore, sessionAction))
    }

    @Test
    fun `changeset reducer cleared returns identity on already-empty state`() {
        val cs = ChangesetState(status = ChangesetStatus.READY, files = emptyList())
        val cleared = StateActionChangesetCleared(
            com.microsoft.agenthostprotocol.generated.ChangesetClearedAction(
                type = ActionType.CHANGESET_CLEARED,
            ),
        )
        // Same instance returned because the reducer short-circuits when
        // there's nothing to clear.
        assertSame(cs, changesetReducer(cs, cleared))
    }

    @Test
    fun `changeset reducer fileSet appends new and replaces existing in place`() {
        val cs = ChangesetState(
            status = ChangesetStatus.READY,
            files = listOf(
                ChangesetFile(id = "a", edit = FileEdit()),
                ChangesetFile(id = "b", edit = FileEdit()),
            ),
        )
        val newC = ChangesetFile(id = "c", edit = FileEdit())
        val appended = changesetReducer(
            cs,
            StateActionChangesetFileSet(
                ChangesetFileSetAction(type = ActionType.CHANGESET_FILE_SET, file = newC),
            ),
        )
        assertEquals(listOf("a", "b", "c"), appended.files.map { it.id })

        val replaceA = ChangesetFile(id = "a", edit = FileEdit())
        val replaced = changesetReducer(
            cs,
            StateActionChangesetFileSet(
                ChangesetFileSetAction(type = ActionType.CHANGESET_FILE_SET, file = replaceA),
            ),
        )
        assertEquals(listOf("a", "b"), replaced.files.map { it.id })
        assertSame(replaceA, replaced.files.first())
    }

    private fun newSession(): SessionState = SessionState(
        provider = "copilot",
        title = "Test",
        status = SessionStatus.IDLE,
        lifecycle = SessionLifecycle.READY,
        activeClients = emptyList(),
        chats = emptyList(),
    )

    private fun newChat(): ChatState = ChatState(
        resource = "ahp-chat:/test/default",
        title = "Test",
        status = SessionStatus.IDLE,
        modifiedAt = "1970-01-01T00:00:01Z",
        turns = emptyList(),
    )

    @Test
    fun `SessionCustomizationUpdated with CustomizationUnknown is a no-op`() {
        // An unknown customization has no extractable id, so the reducer
        // cannot upsert it sensibly. Match Rust: NoOp the action entirely,
        // leaving the existing customization list untouched.
        val baseline = newSession()
        val raw: JsonObject = buildJsonObject {
            put("type", JsonPrimitive("futurePluginVariant"))
            put("payload", buildJsonObject { put("foo", JsonPrimitive(1)) })
        }
        val action = StateActionSessionCustomizationUpdated(
            SessionCustomizationUpdatedAction(
                type = ActionType.SESSION_CUSTOMIZATION_UPDATED,
                customization = CustomizationUnknown(raw),
            ),
        )
        val after = sessionReducer(baseline, action)
        assertSame(baseline, after)
    }

    private companion object {
        private const val MOCK_NOW: Long = 9999L

        private fun userMessage(text: String): Message =
            Message(text = text, origin = MessageOrigin(kind = MessageKind.USER))
    }
}
