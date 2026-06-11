package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.ChangesetOperationRangeTarget
import com.microsoft.agenthostprotocol.generated.ChangesetOperationResourceTarget
import com.microsoft.agenthostprotocol.generated.ChangesetOperationTarget
import com.microsoft.agenthostprotocol.generated.TextPosition
import com.microsoft.agenthostprotocol.generated.TextRange
import com.microsoft.agenthostprotocol.generated.Customization
import com.microsoft.agenthostprotocol.generated.CustomizationUnknown
import com.microsoft.agenthostprotocol.generated.MarkdownResponsePart
import com.microsoft.agenthostprotocol.generated.ReasoningResponsePart
import com.microsoft.agenthostprotocol.generated.ResponsePart
import com.microsoft.agenthostprotocol.generated.ResponsePartKind
import com.microsoft.agenthostprotocol.generated.ResponsePartMarkdown
import com.microsoft.agenthostprotocol.generated.ResponsePartReasoning
import com.microsoft.agenthostprotocol.generated.ResponsePartUnknown
import com.microsoft.agenthostprotocol.generated.ChatInputNumberQuestion
import com.microsoft.agenthostprotocol.generated.ChatInputQuestion
import com.microsoft.agenthostprotocol.generated.ChatInputQuestionNumber
import com.microsoft.agenthostprotocol.generated.ChatInputQuestionKind
import com.microsoft.agenthostprotocol.generated.StringOrMarkdown
import com.microsoft.agenthostprotocol.generated.ToolResultContent
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Tests for discriminated unions emitted as sealed interfaces with custom
 * `KSerializer`s. Verifies the wire-format dispatch matches the Swift /
 * TypeScript clients, including the multi-discriminator case where two wire
 * `kind` values map to the same data class.
 */
class DiscriminatedUnionTest {
    private val json = Ahp.json

    @Test
    fun `ResponsePart markdown variant round-trips`() {
        val part: ResponsePart = ResponsePartMarkdown(
            MarkdownResponsePart(
                kind = ResponsePartKind.MARKDOWN,
                id = "p1",
                content = "Hello **world**",
            ),
        )

        val encoded = json.encodeToString(ResponsePart.serializer(), part)
        val obj = json.parseToJsonElement(encoded).jsonObject
        assertEquals(JsonPrimitive("markdown"), obj["kind"])
        assertEquals(JsonPrimitive("Hello **world**"), obj["content"])

        val decoded = json.decodeFromString(ResponsePart.serializer(), encoded)
        val asMarkdown = assertIs<ResponsePartMarkdown>(decoded)
        assertEquals("Hello **world**", asMarkdown.value.content)
    }

    @Test
    fun `ResponsePart reasoning variant round-trips`() {
        val part: ResponsePart = ResponsePartReasoning(
            ReasoningResponsePart(
                kind = ResponsePartKind.REASONING,
                id = "r1",
                content = "thinking out loud",
            ),
        )
        val encoded = json.encodeToString(ResponsePart.serializer(), part)
        val obj = json.parseToJsonElement(encoded).jsonObject
        assertEquals(JsonPrimitive("reasoning"), obj["kind"])

        val decoded = json.decodeFromString(ResponsePart.serializer(), encoded)
        assertIs<ResponsePartReasoning>(decoded)
    }

    @Test
    fun `ChatInputQuestion accepts both number and integer wire kinds`() {
        // Both "number" and "integer" wire values map to the same Kotlin
        // data class (ChatInputNumberQuestion); the union serializer
        // must dispatch on either.
        val numberWire = """{
            "kind": "number",
            "id": "q1",
            "message": "Pick a number"
        }""".trimIndent()
        val integerWire = """{
            "kind": "integer",
            "id": "q2",
            "message": "Pick an integer"
        }""".trimIndent()

        val asNumber = json.decodeFromString(ChatInputQuestion.serializer(), numberWire)
        val asInteger = json.decodeFromString(ChatInputQuestion.serializer(), integerWire)

        val numberVariant = assertIs<ChatInputQuestionNumber>(asNumber)
        val integerVariant = assertIs<ChatInputQuestionNumber>(asInteger)
        assertEquals("q1", numberVariant.value.id)
        assertEquals("q2", integerVariant.value.id)
        assertEquals(ChatInputQuestionKind.NUMBER, numberVariant.value.kind)
        assertEquals(ChatInputQuestionKind.INTEGER, integerVariant.value.kind)

        // Encode preserves whichever discriminator was originally set on
        // the data class.
        val reEncodedInteger = json.encodeToString(
            ChatInputQuestion.serializer(),
            ChatInputQuestionNumber(
                ChatInputNumberQuestion(
                    kind = ChatInputQuestionKind.INTEGER,
                    id = "q3",
                    message = "Yet another integer",
                ),
            ),
        )
        val reObj = json.parseToJsonElement(reEncodedInteger).jsonObject
        assertEquals(JsonPrimitive("integer"), reObj["kind"])
    }

    @Test
    fun `StringOrMarkdown decodes plain string form`() {
        val plain = json.decodeFromString(StringOrMarkdown.serializer(), "\"hi there\"")
        val asPlain = assertIs<StringOrMarkdown.Plain>(plain)
        assertEquals("hi there", asPlain.value)
    }

    @Test
    fun `StringOrMarkdown decodes object form`() {
        val md = json.decodeFromString(StringOrMarkdown.serializer(), "{\"markdown\":\"**hi**\"}")
        val asMd = assertIs<StringOrMarkdown.Markdown>(md)
        assertEquals("**hi**", asMd.value)
    }

    @Test
    fun `StringOrMarkdown encodes plain as primitive`() {
        val plainEncoded = json.encodeToString(
            StringOrMarkdown.serializer(),
            StringOrMarkdown.Plain("hello"),
        )
        assertEquals("\"hello\"", plainEncoded)
    }

    @Test
    fun `StringOrMarkdown encodes markdown as object`() {
        val mdEncoded = json.encodeToString(
            StringOrMarkdown.serializer(),
            StringOrMarkdown.Markdown("**bold**"),
        )
        val obj = json.parseToJsonElement(mdEncoded) as JsonObject
        assertEquals(JsonPrimitive("**bold**"), obj["markdown"])
        assertTrue(obj.size == 1)
    }

    @Test
    fun `ChangesetOperationTarget dispatches on the kind discriminator`() {
        // ChangesetOperationTarget is hand-rolled by the generator (the TS
        // shape uses inline variants that aren't exported as their own
        // interfaces). Verifies both variants round-trip.
        val resourceWire = """{"kind":"resource","resource":"file:///a.ts"}"""
        val rangeWire = """{
            "kind": "range",
            "resource": "file:///a.ts",
            "side": "after",
            "range": { "start": {"line": 10, "character": 0}, "end": {"line": 42, "character": 0} }
        }""".trimIndent()

        val res = json.decodeFromString(ChangesetOperationTarget.serializer(), resourceWire)
        val resVariant = assertIs<ChangesetOperationTarget.Resource>(res)
        assertEquals("file:///a.ts", resVariant.value.resource)
        assertEquals("resource", resVariant.value.kind)

        val rng = json.decodeFromString(ChangesetOperationTarget.serializer(), rangeWire)
        val rngVariant = assertIs<ChangesetOperationTarget.Range>(rng)
        assertEquals(TextRange(start = TextPosition(line = 10, character = 0), end = TextPosition(line = 42, character = 0)), rngVariant.value.range)

        // Encoding emits the correct discriminator wire value.
        val encoded = json.encodeToString(
            ChangesetOperationTarget.serializer(),
            ChangesetOperationTarget.Resource(
                ChangesetOperationResourceTarget(resource = "file:///b.ts"),
            ),
        )
        val obj = json.parseToJsonElement(encoded) as JsonObject
        assertEquals(JsonPrimitive("resource"), obj["kind"])
    }

    @Test
    fun `ResponsePart unknown kind decodes to ResponsePartUnknown and round-trips`() {
        // A newer server may emit response part kinds this client has not yet
        // learned about. The decoder must capture the raw payload in a
        // forward-compat Unknown variant instead of throwing.
        val wire = """{"kind":"unknownFuturePart","id":"x1","payload":{"foo":42}}"""

        val decoded = json.decodeFromString(ResponsePart.serializer(), wire)
        val asUnknown = assertIs<ResponsePartUnknown>(decoded)
        assertEquals(JsonPrimitive("unknownFuturePart"), asUnknown.raw["kind"])
        assertEquals(JsonPrimitive("x1"), asUnknown.raw["id"])

        // Re-encoding produces the same JSON tree (semantic round-trip — key
        // order and whitespace aren't guaranteed but the parsed tree matches).
        val reEncoded = json.encodeToString(ResponsePart.serializer(), decoded)
        val reTree = json.parseToJsonElement(reEncoded).jsonObject
        assertEquals(json.parseToJsonElement(wire).jsonObject, reTree)
    }

    @Test
    fun `ToolResultContent unknown type decodes to Unknown and round-trips`() {
        val wire = """{"type":"futureBlob","payload":{"bytes":"AAEC"}}"""

        val decoded = json.decodeFromString(ToolResultContent.serializer(), wire)
        val asUnknown = assertIs<ToolResultContent.Unknown>(decoded)
        assertEquals(JsonPrimitive("futureBlob"), asUnknown.raw["type"])

        val reEncoded = json.encodeToString(ToolResultContent.serializer(), decoded)
        val reTree = json.parseToJsonElement(reEncoded).jsonObject
        assertEquals(json.parseToJsonElement(wire).jsonObject, reTree)
    }

    @Test
    fun `Customization unknown type decodes to CustomizationUnknown without throwing`() {
        val wire = """{"type":"futurePlugin","id":"c1","enabled":true}"""

        val decoded = json.decodeFromString(Customization.serializer(), wire)
        val asUnknown = assertIs<CustomizationUnknown>(decoded)
        assertEquals(JsonPrimitive("futurePlugin"), asUnknown.raw["type"])
        assertEquals(JsonPrimitive("c1"), asUnknown.raw["id"])

        val reEncoded = json.encodeToString(Customization.serializer(), decoded)
        val reTree = json.parseToJsonElement(reEncoded).jsonObject
        assertEquals(json.parseToJsonElement(wire).jsonObject, reTree)
    }

    @Test
    fun `ResponsePart with missing kind decodes to ResponsePartUnknown`() {
        // A payload missing its discriminator entirely is also routed to the
        // Unknown variant for forward-compat unions. This matches Rust's
        // `#[serde(untagged)]` Unknown arm — anything we can't dispatch on
        // becomes Unknown rather than throwing.
        val wire = """{"id":"x1","payload":{"foo":42}}"""

        val decoded = json.decodeFromString(ResponsePart.serializer(), wire)
        val asUnknown = assertIs<ResponsePartUnknown>(decoded)
        assertEquals(JsonPrimitive("x1"), asUnknown.raw["id"])

        val reEncoded = json.encodeToString(ResponsePart.serializer(), decoded)
        val reTree = json.parseToJsonElement(reEncoded).jsonObject
        assertEquals(json.parseToJsonElement(wire).jsonObject, reTree)
    }
}
