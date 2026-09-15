package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.ChangesetFile
import com.microsoft.agenthostprotocol.generated.ChatToolCallReadyAction
import com.microsoft.agenthostprotocol.generated.ContentRef
import com.microsoft.agenthostprotocol.generated.FileEdit
import com.microsoft.agenthostprotocol.generated.FileEditCollection
import com.microsoft.agenthostprotocol.generated.FileEditDiffStats
import com.microsoft.agenthostprotocol.generated.FileEditSide
import com.microsoft.agenthostprotocol.generated.Snapshot
import com.microsoft.agenthostprotocol.generated.ToolCallPendingConfirmationState
import com.microsoft.agenthostprotocol.generated.ToolResultContent
import com.microsoft.agenthostprotocol.generated.ToolResultFileEditContent
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNotNull

class FileEditTypesTest {
    private val json: Json = Ahp.json
    private val before = FileEditSide(
        uri = "file:///workspace/old.txt",
        content = ContentRef(
            uri = "ahp-content:/before",
            sizeHint = 32L,
            contentType = "text/plain",
            nonce = "before-v1"
        )
    )
    private val after = FileEditSide(
        uri = "file:///workspace/new.txt",
        content = ContentRef(
            uri = "ahp-content:/after",
            sizeHint = 64L,
            contentType = "text/plain",
            nonce = "after-v2"
        )
    )
    private val edit = FileEdit(
        before = before,
        after = after,
        diff = FileEditDiffStats(added = 2_147_483_648L, removed = 0L)
    )
    private val editWire = """{"before":{"uri":"file:///workspace/old.txt","content":{"uri":"ahp-content:/before","sizeHint":32,"contentType":"text/plain","nonce":"before-v1"}},"after":{"uri":"file:///workspace/new.txt","content":{"uri":"ahp-content:/after","sizeHint":64,"contentType":"text/plain","nonce":"after-v2"}},"diff":{"added":2147483648,"removed":0}}"""
    private val malformedEdits = buildList {
        add("""{"before":{}}""")
        add("""{"after":{"uri":"file:///workspace/file.txt"}}""")
        add("""{"after":{"content":{"uri":"ahp-content:/file"}}}""")
        add("""{"after":{"uri":"file:///workspace/file.txt","content":{}}}""")
        add("""{"after":{"uri":"file:///workspace/file.txt","content":[]}}""")
        add("""{"before":[]}""")
        add("""{"diff":{"added":{}}}""")
        add("""{"diff":{"removed":[]}}""")
    }
    private val malformedCollections = buildList {
        add("{}")
        add("""{"items":null}""")
        add("""{"items":{}}""")
        add("""{"items":[null]}""")
    }

    @Test
    fun `file edit properties have shared serializable types`() {
        val decoded = json.decodeFromString(
            deserializer = FileEdit.serializer(),
            string = editWire
        )
        val decodedSide: FileEditSide = assertNotNull(decoded.after)
        val decodedStats: FileEditDiffStats = assertNotNull(decoded.diff)
        val added: Long? = decodedStats.added
        assertEquals(expected = after, actual = decodedSide)
        assertEquals(expected = before, actual = decoded.before)
        assertEquals(expected = 2_147_483_648L, actual = added)
        assertEquals(expected = edit, actual = decoded)
        assertEquals(
            expected = json.parseToJsonElement(editWire),
            actual = json.parseToJsonElement(
                json.encodeToString(serializer = FileEdit.serializer(), value = edit)
            )
        )
    }

    @Test
    fun `ready actions and pending states expose the same collection type`() {
        val collection = FileEditCollection(items = listOf(edit))
        val ready = json.decodeFromString(
            deserializer = ChatToolCallReadyAction.serializer(),
            string = """{"type":"chat/toolCallReady","turnId":"t1","toolCallId":"tc1","invocationMessage":"Review","edits":{"items":[$editWire]}}"""
        )
        val pending = json.decodeFromString(
            deserializer = ToolCallPendingConfirmationState.serializer(),
            string = """{"status":"pending-confirmation","toolCallId":"tc1","toolName":"edit","displayName":"Edit","invocationMessage":"Review","edits":{"items":[$editWire]}}"""
        )
        val readyEdits: FileEditCollection? = ready.edits
        val pendingEdits: FileEditCollection? = pending.edits
        assertEquals(expected = collection, actual = readyEdits)
        assertEquals(expected = collection, actual = pendingEdits)
    }

    @Test
    fun `file edit tool results expose the same side and statistics types`() {
        val wire = JsonObject(
            json.parseToJsonElement(editWire).jsonObject +
                ("type" to JsonPrimitive("fileEdit"))
        )
        val result = json.decodeFromString(
            deserializer = ToolResultFileEditContent.serializer(),
            string = wire.toString()
        )
        val resultBefore: FileEditSide? = result.before
        val resultAfter: FileEditSide? = result.after
        val resultStats: FileEditDiffStats? = result.diff
        assertEquals(expected = before, actual = resultBefore)
        assertEquals(expected = after, actual = resultAfter)
        assertEquals(expected = edit.diff, actual = resultStats)
    }

    @Test
    fun `empty objects and collections preserve key presence`() {
        assertEquals(
            expected = "{}",
            actual = json.encodeToString(
                serializer = FileEdit.serializer(),
                value = FileEdit()
            )
        )
        assertEquals(
            expected = """{"diff":{}}""",
            actual = json.encodeToString(
                serializer = FileEdit.serializer(),
                value = FileEdit(diff = FileEditDiffStats())
            )
        )
        assertEquals(
            expected = """{"items":[]}""",
            actual = json.encodeToString(
                serializer = FileEditCollection.serializer(),
                value = FileEditCollection(items = emptyList())
            )
        )
    }

    @Test
    fun `malformed known file edits report serialization errors`() {
        for (wire in malformedEdits) {
            assertFailsWith<SerializationException>(message = wire) {
                json.decodeFromString(
                    deserializer = FileEdit.serializer(),
                    string = wire
                )
            }
            val resultWire = JsonObject(
                json.parseToJsonElement(wire).jsonObject +
                    ("type" to JsonPrimitive("fileEdit"))
            )
            assertFailsWith<SerializationException>(message = resultWire.toString()) {
                json.decodeFromString(
                    deserializer = ToolResultContent.serializer(),
                    string = resultWire.toString()
                )
            }
        }
    }

    @Test
    fun `required collection items do not receive silent defaults`() {
        for (wire in malformedCollections) {
            assertFailsWith<SerializationException>(message = wire) {
                json.decodeFromString(
                    deserializer = FileEditCollection.serializer(),
                    string = wire
                )
            }
        }
    }

    @Test
    fun `a malformed file fails the containing changeset snapshot`() {
        val wire = """{"resource":"ahp-changeset:/c1","fromSeq":1,"state":{"status":"ready","files":[{"id":"good","edit":$editWire},{"id":"bad","edit":{"after":{"uri":"file:///workspace/bad.txt","content":{}}}}]}}"""
        assertFailsWith<SerializationException> {
            json.decodeFromString(
                deserializer = Snapshot.serializer(),
                string = wire
            )
        }
    }

    @Test
    fun `known file edit shapes ignore unknown fields`() {
        val wire = """{"futureCollection":1,"items":[{"futureEdit":2,"after":{"uri":"file:///workspace/file.txt","futureSide":3,"content":{"uri":"ahp-content:/file","futureContent":4}},"diff":{"futureStats":5}}]}"""
        val decoded = json.decodeFromString(
            deserializer = FileEditCollection.serializer(),
            string = wire
        )
        assertEquals(
            expected = json.parseToJsonElement("""{"items":[{"after":{"uri":"file:///workspace/file.txt","content":{"uri":"ahp-content:/file"}},"diff":{}}]}"""),
            actual = json.parseToJsonElement(
                json.encodeToString(
                    serializer = FileEditCollection.serializer(),
                    value = decoded
                )
            )
        )
    }

    @Test
    fun `changeset extension metadata remains raw`() {
        val wire = """{"id":"file","edit":$editWire,"_meta":{"vendor":{"keep":true}}}"""
        val decoded = json.decodeFromString(
            deserializer = ChangesetFile.serializer(),
            string = wire
        )
        assertEquals(
            expected = json.parseToJsonElement(wire),
            actual = json.parseToJsonElement(
                json.encodeToString(
                    serializer = ChangesetFile.serializer(),
                    value = decoded
                )
            )
        )
    }

    @Test
    fun `unknown tool result variants retain their raw payload`() {
        val wire = """{"type":"futureFileEdit","payload":{"keep":true}}"""
        val decoded = json.decodeFromString(
            deserializer = ToolResultContent.serializer(),
            string = wire
        )
        val unknown = assertIs<ToolResultContent.Unknown>(decoded)
        assertEquals(expected = json.parseToJsonElement(wire), actual = unknown.raw)
        assertEquals(
            expected = json.parseToJsonElement(wire),
            actual = json.parseToJsonElement(
                json.encodeToString(
                    serializer = ToolResultContent.serializer(),
                    value = decoded
                )
            )
        )
    }
}
