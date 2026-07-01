package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.ActionEnvelope
import com.microsoft.agenthostprotocol.generated.ActionOrigin
import com.microsoft.agenthostprotocol.generated.ActionType
import com.microsoft.agenthostprotocol.generated.ChangesetStatus
import com.microsoft.agenthostprotocol.generated.PartialSessionSummary
import com.microsoft.agenthostprotocol.generated.RootAgentsChangedAction
import com.microsoft.agenthostprotocol.generated.SessionStatus
import com.microsoft.agenthostprotocol.generated.StateAction
import com.microsoft.agenthostprotocol.generated.StateActionChangesetStatusChanged
import com.microsoft.agenthostprotocol.generated.StateActionRootAgentsChanged
import com.microsoft.agenthostprotocol.generated.StateActionSessionTitleChanged
import com.microsoft.agenthostprotocol.generated.StateActionUnknown
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

/**
 * Tests for [StateAction] and the [ActionEnvelope] wrapper. Critical for
 * forward compatibility: clients running an older protocol version must
 * decode unknown action types as [StateActionUnknown] (not throw) so that
 * reducers can no-op them and still apply the rest of a replay batch.
 */
class StateActionTest {
    private val json = Ahp.json

    @Test
    fun `known action round-trips through StateAction sealed interface`() {
        val action: StateAction = StateActionRootAgentsChanged(
            RootAgentsChangedAction(
                type = ActionType.ROOT_AGENTS_CHANGED,
                agents = emptyList(),
            ),
        )
        val encoded = json.encodeToString(StateAction.serializer(), action)
        val obj = json.parseToJsonElement(encoded).jsonObject
        assertEquals(JsonPrimitive("root/agentsChanged"), obj["type"])

        val decoded = json.decodeFromString(StateAction.serializer(), encoded)
        assertIs<StateActionRootAgentsChanged>(decoded)
    }

    @Test
    fun `unknown action type decodes to StateActionUnknown without throwing`() {
        // A future server may emit an action whose `type` is unknown to
        // this client. The reducer must be able to no-op it; that requires
        // the deserializer to never throw on unknown types. The raw JSON
        // object is captured so the action round-trips back across the
        // wire with its full payload intact.
        val futureWire = """{"type":"session/futureUnknownAction","payload":{"foo":42}}"""
        val decoded = json.decodeFromString(StateAction.serializer(), futureWire)
        val unknown = assertIs<StateActionUnknown>(decoded)
        assertEquals(JsonPrimitive("session/futureUnknownAction"), unknown.raw["type"])
        assertEquals(JsonPrimitive(42), unknown.raw["payload"]?.jsonObject?.get("foo"))

        // Re-encoded JSON tree matches the original (semantic round-trip).
        val reEncoded = json.encodeToString(StateAction.serializer(), decoded)
        val reTree = json.parseToJsonElement(reEncoded).jsonObject
        assertEquals(json.parseToJsonElement(futureWire).jsonObject, reTree)
    }

    @Test
    fun `action without type discriminator decodes to StateActionUnknown without throwing`() {
        // Symmetric with the state-channel `XUnknown` variants: a payload
        // that's missing its `type` discriminator entirely is also routed
        // to Unknown rather than throwing. The reducer's `else -> state`
        // arm can then no-op it. The captured raw payload still
        // round-trips so the channel stays alive across protocol drift.
        val malformedWire = """{"payload":{"foo":42}}"""
        val decoded = json.decodeFromString(StateAction.serializer(), malformedWire)
        val unknown = assertIs<StateActionUnknown>(decoded)
        assertNull(unknown.raw["type"])
        assertEquals(JsonPrimitive(42), unknown.raw["payload"]?.jsonObject?.get("foo"))

        val reEncoded = json.encodeToString(StateAction.serializer(), decoded)
        val reTree = json.parseToJsonElement(reEncoded).jsonObject
        assertEquals(json.parseToJsonElement(malformedWire).jsonObject, reTree)
    }

    @Test
    fun `ActionEnvelope wraps a StateAction with serverSeq`() {
        // Channel-scoped envelope: every server-pushed action now carries
        // the channel URI it belongs to. Per-session actions like
        // `session/titleChanged` no longer include the session URI in their
        // payload — the channel identifies it instead.
        val envelopeJson = """{
            "channel": "ahp-session:/abc",
            "action": {
                "type": "session/titleChanged",
                "title": "New title"
            },
            "serverSeq": 42,
            "origin": {
                "clientId": "client-1",
                "clientSeq": 7
            }
        }""".trimIndent()

        val envelope = json.decodeFromString(ActionEnvelope.serializer(), envelopeJson)
        assertEquals("ahp-session:/abc", envelope.channel)
        assertEquals(42L, envelope.serverSeq)
        assertEquals(ActionOrigin(clientId = "client-1", clientSeq = 7L), envelope.origin)
        val title = assertIs<StateActionSessionTitleChanged>(envelope.action)
        assertEquals("New title", title.value.title)
    }

    @Test
    fun `Partial summary supports all-null wire payloads`() {
        // Partial<SessionSummary> models a partial-update notification.
        // Every field must be nullable; an empty payload is the wire
        // representation of "no changes" (rare but legal).
        val empty = json.decodeFromString(PartialSessionSummary.serializer(), "{}")
        assertNull(empty.title)
        assertNull(empty.status)

        // A typical partial: only `title` and `status` change.
        val partialJson = """{"title": "Renamed", "status": 1}"""
        val partial = json.decodeFromString(PartialSessionSummary.serializer(), partialJson)
        assertEquals("Renamed", partial.title)
        assertEquals(SessionStatus.IDLE, partial.status)
    }

    @Test
    fun `changeset statusChanged action decodes on a changeset channel`() {
        // Changeset actions live on `ahp-changeset:` channels rather than
        // session channels. Verifies the new changeset/* action family is
        // wired through StateAction.
        val wire = """{
            "channel": "ahp-changeset:/abc/uncommitted",
            "action": {
                "type": "changeset/statusChanged",
                "status": "ready"
            },
            "serverSeq": 5
        }""".trimIndent()
        val envelope = json.decodeFromString(ActionEnvelope.serializer(), wire)
        assertEquals("ahp-changeset:/abc/uncommitted", envelope.channel)
        val change = assertIs<StateActionChangesetStatusChanged>(envelope.action)
        assertEquals(ChangesetStatus.READY, change.value.status)
    }
}
