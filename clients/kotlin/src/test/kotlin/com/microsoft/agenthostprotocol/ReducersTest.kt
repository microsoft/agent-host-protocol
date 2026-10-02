package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith

/**
 * Focused unit tests covering the reducer module's public surface, the
 * `Reducer<S, A>` fun-interface wrapper, and a handful of tricky behaviors
 * (queued message reorder algorithm, deterministic turn timestamps). Broad
 * behavior parity is verified by [FixtureDrivenReducerTest] against the
 * shared cross-language fixtures.
 */
class ReducersTest {

    @Test
    fun `TCP creation requires canonical discriminator`() {
        val create = TcpConnectionSubscription("tcpConnection", "localhost", 3000, TcpDataEncoding.BASE64, 4, 2)
        val initialized = InitializeResult(protocolVersion = "1", snapshots = emptyList(), serverSeq = 0,
            tcpConnections = TcpConnectionsCapability(listOf(TcpDataEncoding.BASE64)))
        val creation = TcpConnectionCreation("ahp-session:/test", create, initialized, TcpHarness().transport)
        val wire = Ahp.json.encodeToJsonElement(SubscribeParams.serializer(), creation.parameters) as JsonObject
        assertEquals(JsonPrimitive("tcpConnection"), (wire["create"] as JsonObject)["type"])
        assertFailsWith<IllegalArgumentException> {
            TcpConnection.creationParameters("ahp-session:/test", create.copy(type = "tcp"), initialized)
        }
    }

    @Test
    fun `TCP local close retains crossing traffic until both directions drain`() {
        val harness = TcpHarness()
        val connection = harness.open()
        connection.write(byteArrayOf(1, 2)).join()
        val input = harness.sent.last()
        val drain = connection.drain()
        connection.close()
        val close = harness.sent.last()
        assertIs<StateActionTcpClientClose>(close.second)
        assertTrue(!connection.isClosed)
        assertTrue(harness.unsubscribed.isEmpty())
        val read = connection.read()
        assertTrue(!read.isDone)
        connection.accept(tcpEnvelope(1, input.second, ActionOrigin("owner", input.first)))
        connection.accept(tcpEnvelope(2, close.second, ActionOrigin("owner", close.first)))
        connection.accept(tcpEnvelope(3, StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, 0, "Bwg="))))
        assertTrue(byteArrayOf(7, 8).contentEquals(read.join()))
        val credit = harness.sent.last()
        assertEquals(2, assertIs<StateActionTcpDataConsumed>(credit.second).value.consumedBytes)
        connection.accept(tcpEnvelope(4, StateActionTcpHostClose(TcpHostCloseAction(ActionType.TCP_HOST_CLOSE))))
        assertTrue(!connection.isClosed && !drain.isDone && harness.unsubscribed.isEmpty())
        connection.accept(tcpEnvelope(5, credit.second, ActionOrigin("owner", credit.first)))
        assertTrue(!connection.isClosed && harness.unsubscribed.isEmpty())
        connection.accept(tcpEnvelope(6, StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, 2))))
        drain.join()
        assertNull(connection.read().join())
        assertTrue(connection.isClosed)
        connection.close()
        connection.dispose()
        assertEquals(listOf(connection.resource), harness.unsubscribed)
    }

    @Test
    fun `TCP creation and snapshot limits use UInt32 range`() {
        val initialized = InitializeResult(protocolVersion = "1", snapshots = emptyList(), serverSeq = 0,
            tcpConnections = TcpConnectionsCapability(listOf(TcpDataEncoding.BASE64)))
        val request = TcpConnectionSubscription("tcpConnection", "localhost", 3000, TcpDataEncoding.BASE64, 4294967295L, 4294967295L)
        for (limit in listOf(1L, 4294967295L, 0L, -1L, 4294967296L, 9007199254740991L)) {
            val valid = limit in 1..4294967295L
            for (chunk in listOf(false, true)) {
                val create = request.copy(receiveWindowBytes = limit, maximumChunkSize = if (chunk) limit else 1)
                if (valid) TcpConnection.creationParameters("ahp-session:/test", create, initialized)
                else assertFailsWith<IllegalArgumentException>("creation $limit") {
                    TcpConnection.creationParameters("ahp-session:/test", create, initialized)
                }
                for (input in listOf(false, true)) {
                    val direction = FlowControlledByteDirectionState(limit, if (chunk) limit else 1, 0, 0)
                    val state = if (input) tcpState().copy(input = direction) else tcpState().copy(output = direction)
                    val result = SubscribeResult(Snapshot("ahp-tcp:/created", SnapshotState.Tcp(state), 0))
                    val harness = TcpHarness()
                    if (valid) {
                        val connection = TcpConnection.open("ahp-session:/test", request, initialized, result, harness.transport)
                        connection.dispose()
                    } else assertFailsWith<IllegalArgumentException>("snapshot $limit, input $input") {
                        TcpConnection.open("ahp-session:/test", request, initialized, result, harness.transport)
                    }
                    assertEquals(listOf("ahp-tcp:/created"), harness.unsubscribed)
                }
            }
        }
    }

    @Test
    fun `TCP peer close responds without waiting for credit or unread output`() {
        val harness = TcpHarness()
        val connection = harness.open()
        val write = connection.write(ByteArray(5))
        val drain = connection.drain()
        harness.sent.toList().forEachIndexed { index, item ->
            connection.accept(tcpEnvelope(index + 1L, item.second, ActionOrigin("owner", item.first)))
        }
        connection.accept(tcpEnvelope(3, StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, 0, "Bwg="))))
        connection.accept(tcpEnvelope(4, StateActionTcpHostClose(TcpHostCloseAction(ActionType.TCP_HOST_CLOSE))))
        val close = harness.sent.last()
        assertIs<StateActionTcpClientClose>(close.second)
        assertEquals(0, connection.state.input.consumedBytes)
        assertEquals(0, connection.state.output.consumedBytes)
        assertTrue(write.isCompletedExceptionally && !drain.isDone && harness.unsubscribed.isEmpty())
        connection.accept(tcpEnvelope(5, close.second, ActionOrigin("owner", close.first)))
        connection.accept(tcpEnvelope(6, StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, 4))))
        drain.join()
        assertTrue(byteArrayOf(7, 8).contentEquals(connection.read().join()))
        val credit = harness.sent.last()
        assertIs<StateActionTcpDataConsumed>(credit.second)
        connection.accept(tcpEnvelope(7, credit.second, ActionOrigin("owner", credit.first)))
        assertNull(connection.read().join())
        assertEquals(listOf(connection.resource), harness.unsubscribed)
    }

    @Test
    fun `TCP creation releases late children after timeout or cancellation but never the parent`() {
        for (cancel in listOf(false, true)) for (resource in listOf("ahp-tcp:/late", "ahp-session:/test")) {
            val harness = TcpHarness()
            val creation = TcpConnectionCreation("ahp-session:/test",
                TcpConnectionSubscription("tcpConnection", "localhost", 3000, TcpDataEncoding.BASE64, 4, 4),
                InitializeResult(protocolVersion = "1", snapshots = emptyList(), serverSeq = 0,
                    tcpConnections = TcpConnectionsCapability(listOf(TcpDataEncoding.BASE64))), harness.transport)
            if (cancel) creation.completion.cancel(false)
            else creation.fail(java.util.concurrent.TimeoutException("create timeout"))
            val result = SubscribeResult(Snapshot(resource, SnapshotState.Tcp(tcpState(4)), 0))
            creation.accept(result)
            creation.accept(result)
            assertTrue(creation.completion.isCompletedExceptionally)
            assertEquals(if (resource.startsWith("ahp-tcp:")) listOf(resource) else emptyList(), harness.unsubscribed)
            assertTrue(harness.sent.isEmpty())
        }
    }

    private class TcpHarness {
        val sent = mutableListOf<Pair<Long, StateAction>>()
        val unsubscribed = mutableListOf<String>()
        var sequence = 1L
        val transport = TcpConnectionTransport("owner", { sequence++ }, { sequence = maxOf(sequence, it + 1) },
            { _, seq, action -> sent.add(seq to action) }, { unsubscribed.add(it) }, { sequence - 1 })
        fun open(maximumChunkSize: Long = 2): TcpConnection {
            val window = maxOf(4, maximumChunkSize)
            val direction = FlowControlledByteDirectionState(window, maximumChunkSize, 0, 0)
            val state = TcpConnectionState("ahp-session:/test", TcpTarget("localhost", 3000), TcpDataEncoding.BASE64,
                direction, direction, false, false)
            val creation = TcpConnectionCreation("ahp-session:/test",
                TcpConnectionSubscription("tcpConnection", "localhost", 3000, TcpDataEncoding.BASE64, window, maximumChunkSize),
                InitializeResult(protocolVersion = "1", snapshots = emptyList(), serverSeq = 0, tcpConnections = TcpConnectionsCapability(listOf(TcpDataEncoding.BASE64))),
                transport)
            val wire = Ahp.json.encodeToJsonElement(SubscribeParams.serializer(), creation.parameters) as JsonObject
            assertEquals(JsonPrimitive("tcpConnection"), (wire["create"] as JsonObject)["type"])
            creation.accept(SubscribeResult(Snapshot("ahp-tcp:/created", SnapshotState.Tcp(state), 0)))
            return creation.completion.join()
        }
    }

    @Test
    fun `TCP reset or dispose terminates a closing stream`() {
        for (reset in listOf(false, true)) {
            val harness = TcpHarness()
            val connection = harness.open()
            val write = connection.write(ByteArray(5))
            val drain = connection.drain()
            connection.close()
            assertTrue(write.isCompletedExceptionally)
            assertTrue(!drain.isDone)
            if (reset) {
                connection.accept(tcpEnvelope(1, StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, 0, "Bwg="))))
                connection.accept(tcpEnvelope(2, StateActionTcpHostReset(TcpHostResetAction(ActionType.TCP_HOST_RESET, TcpResetReason.PROTOCOL_ERROR))))
                assertTrue(connection.read().isCompletedExceptionally)
            } else {
                val read = connection.read()
                assertTrue(!read.isDone)
                connection.dispose()
                assertTrue(read.isCompletedExceptionally)
            }
            assertTrue(drain.isCompletedExceptionally)
            connection.dispose()
            connection.close()
            assertEquals(listOf(connection.resource), harness.unsubscribed)
        }
    }

    @Test
    fun `TCP close while suspended replays and drains before release`() {
        val old = TcpHarness()
        val connection = old.open()
        connection.suspend()
        connection.close()
        assertTrue(!connection.isClosed && old.sent.isEmpty() && old.unsubscribed.isEmpty())
        val read = connection.read()
        assertTrue(!read.isDone)
        val request = TcpConnection.reconnectParameters(ReconnectParams("ahp-root://", clientId = "owner",
            lastSeenServerSeq = 0, subscriptions = emptyList()), listOf(connection))
        assertTrue(connection.resource in request.subscriptions)
        val fresh = TcpHarness()
        TcpConnection.resume(request, ReconnectResultReplay(ReconnectReplayResult(ReconnectResultType.REPLAY, listOf(
            tcpEnvelope(1, StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, 0, "Bwg="))),
            tcpEnvelope(2, StateActionTcpHostClose(TcpHostCloseAction(ActionType.TCP_HOST_CLOSE))),
        ), emptyList())), listOf(connection), fresh.transport)
        val close = fresh.sent.first()
        assertIs<StateActionTcpClientClose>(close.second)
        assertTrue(byteArrayOf(7, 8).contentEquals(read.join()))
        val credit = fresh.sent.last()
        assertIs<StateActionTcpDataConsumed>(credit.second)
        connection.accept(tcpEnvelope(3, close.second, ActionOrigin("owner", close.first)))
        assertTrue(fresh.unsubscribed.isEmpty())
        connection.accept(tcpEnvelope(4, credit.second, ActionOrigin("owner", credit.first)))
        assertNull(connection.read().join())
        assertEquals(listOf(connection.resource), fresh.unsubscribed)
        assertTrue(old.unsubscribed.isEmpty())
    }

    private fun tcpEnvelope(sequence: Long, action: StateAction, origin: ActionOrigin? = null) =
        ActionEnvelope(channel = "ahp-tcp:/created", action = action, serverSeq = sequence, origin = origin)

    @Test
    fun `TCP adapter encodes 4 MiB and final close preserves drain and buffered reads`() {
        val harness = TcpHarness()
        val bytes = ByteArray(4 * 1024 * 1024)
        bytes[0] = 1
        bytes[bytes.lastIndex] = -1
        val connection = harness.open(bytes.size.toLong())
        connection.write(bytes).join()
        val sent = harness.sent.single()
        val input = assertIs<StateActionTcpInput>(sent.second).value
        assertEquals(0L, input.offset)
        assertTrue(bytes.contentEquals(java.util.Base64.getDecoder().decode(input.data)))
        val drain = connection.drain()
        assertTrue(!drain.isDone)
        connection.accept(tcpEnvelope(1, sent.second, ActionOrigin("owner", sent.first)))
        connection.accept(tcpEnvelope(2, StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, bytes.size.toLong()))))
        connection.accept(tcpEnvelope(3, StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, 0, "Bwg="))))
        connection.accept(tcpEnvelope(4, StateActionTcpHostClose(TcpHostCloseAction(ActionType.TCP_HOST_CLOSE))))
        val close = harness.sent.last()
        assertIs<StateActionTcpClientClose>(close.second)
        connection.accept(tcpEnvelope(5, close.second, ActionOrigin("owner", close.first)))
        assertTrue(harness.unsubscribed.isEmpty())
        drain.join()
        connection.drain().join()
        assertTrue(byteArrayOf(7, 8).contentEquals(connection.read().join()))
        val credit = harness.sent.last()
        assertIs<StateActionTcpDataConsumed>(credit.second)
        assertTrue(harness.unsubscribed.isEmpty())
        connection.accept(tcpEnvelope(6, credit.second, ActionOrigin("owner", credit.first)))
        assertNull(connection.read().join())
        assertEquals(listOf(connection.resource), harness.unsubscribed)
    }

    @Test
    fun `TCP adapter rejects malformed client echoes before advancing or releasing payloads`() {
        for (malformed in listOf("missing", "owner", "negative", "unsafe", "unassigned", "wrong-pending", "reused", "payload", "eof", "credit", "close", "reset", "rejected-empty")) {
            val harness = TcpHarness()
            val connection = harness.open()
            val read = connection.read()
            val write = connection.write(byteArrayOf(1, 2, 3, 4, 5))
            val drain = connection.drain()
            val first = harness.sent[0]
            val second = harness.sent[1]
            var origin: ActionOrigin? = ActionOrigin("owner", first.first)
            var action = first.second
            when (malformed) {
                "missing" -> origin = null
                "owner" -> origin = ActionOrigin("other", first.first)
                "negative" -> origin = ActionOrigin("owner", -1)
                "unsafe" -> origin = ActionOrigin("owner", 9007199254740992)
                "unassigned" -> origin = ActionOrigin("owner", second.first + 1)
                "wrong-pending" -> origin = ActionOrigin("owner", second.first)
                "reused" -> { connection.accept(tcpEnvelope(1, first.second, origin)); action = second.second }
                "payload" -> action = StateActionTcpInput(TcpInputAction(ActionType.TCP_INPUT, 0, "AgE="))
                "eof" -> { origin = null; action = StateActionTcpInputEof(TcpInputEofAction(ActionType.TCP_INPUT_EOF, 0)) }
                "credit" -> { origin = null; action = StateActionTcpDataConsumed(TcpDataConsumedAction(ActionType.TCP_DATA_CONSUMED, 0)) }
                "close" -> { origin = null; action = StateActionTcpClientClose(TcpClientCloseAction(ActionType.TCP_CLIENT_CLOSE)) }
                "reset" -> { origin = null; action = StateActionTcpClientReset(TcpClientResetAction(ActionType.TCP_CLIENT_RESET, TcpResetReason.PROTOCOL_ERROR)) }
            }
            connection.accept(tcpEnvelope(2, action, origin).copy(rejectionReason = if (malformed == "rejected-empty") "" else null))
            for (future in listOf(read, write, drain)) assertTrue(future.isCompletedExceptionally, malformed)
            assertEquals(if (malformed == "reused") 2L else 0L, connection.state.input.receivedBytes)
            assertEquals(0, connection.state.input.consumedBytes)
            assertIs<StateActionTcpClientReset>(harness.sent.last().second)
            assertEquals(listOf(connection.resource), harness.unsubscribed)
        }
    }

    @Test
    fun `TCP adapter reserves credit chunks reads duplicates and half closes`() {
        val harness = TcpHarness()
        val connection = harness.open()
        val write = connection.write(byteArrayOf(1, 2, 3, 4, 5))
        assertTrue(!write.isDone)
        assertEquals(2, harness.sent.size)
        assertFailsWith<IllegalStateException> { connection.write(byteArrayOf(9)) }
        for ((index, item) in harness.sent.toList().withIndex()) {
            assertEquals(2, java.util.Base64.getDecoder().decode(assertIs<StateActionTcpInput>(item.second).value.data).size)
            connection.accept(tcpEnvelope(index + 1L, item.second, ActionOrigin("owner", item.first)))
        }
        connection.accept(tcpEnvelope(3, StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, 2))))
        write.get(1, java.util.concurrent.TimeUnit.SECONDS)
        val last = harness.sent.last()
        assertEquals(4, assertIs<StateActionTcpInput>(last.second).value.offset)
        val drain = connection.drain()
        assertTrue(!drain.isDone)
        connection.accept(tcpEnvelope(4, last.second, ActionOrigin("owner", last.first)))
        connection.accept(tcpEnvelope(5, StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, 5))))
        drain.get(1, java.util.concurrent.TimeUnit.SECONDS)
        val data = StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, 0, "Bwg="))
        connection.accept(tcpEnvelope(6, data))
        connection.accept(tcpEnvelope(7, data))
        connection.accept(tcpEnvelope(8, StateActionTcpDataEof(TcpDataEofAction(ActionType.TCP_DATA_EOF, 2))))
        assertTrue(byteArrayOf(7, 8).contentEquals(connection.read().get()))
        assertEquals(2, assertIs<StateActionTcpDataConsumed>(harness.sent.last().second).value.consumedBytes)
        assertNull(connection.read().get())
        connection.end().get()
        assertEquals(5, assertIs<StateActionTcpInputEof>(harness.sent.last().second).value.finalOffset)
        connection.close()
        connection.dispose()
        assertEquals(listOf(connection.resource), harness.unsubscribed)
    }

    @Test
    fun `TCP adapter resumes retained readers and only resends unacknowledged identities`() {
        val first = TcpHarness()
        val connection = first.open()
        connection.write(byteArrayOf(1, 2)).get()
        connection.end().get()
        connection.accept(tcpEnvelope(1, StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, 0, "Bwg=")), ActionOrigin("owner", first.sent[0].first)))
        connection.suspend()
        val reader = connection.read()
        assertTrue(!reader.isDone)
        val request = TcpConnection.reconnectParameters(ReconnectParams("ahp-root://", clientId = "owner",
            lastSeenServerSeq = 20, subscriptions = listOf("ahp-session:/test")), listOf(connection))
        assertEquals(1, request.lastSeenServerSeq)
        assertTrue(connection.resource in request.subscriptions)
        val fresh = TcpHarness()
        TcpConnection.resume(request, ReconnectResultReplay(ReconnectReplayResult(ReconnectResultType.REPLAY, emptyList(), emptyList())),
            listOf(connection), fresh.transport)
        assertEquals(first.sent.take(2), fresh.sent.take(2))
        assertEquals(3, fresh.sent.last().first)
        assertTrue(byteArrayOf(7, 8).contentEquals(reader.get()))
        connection.suspend()
        val again = TcpHarness()
        val replay = tcpEnvelope(3, first.sent[0].second, ActionOrigin("owner", first.sent[0].first))
        TcpConnection.resume(request, ReconnectResultReplay(ReconnectReplayResult(ReconnectResultType.REPLAY, listOf(replay), emptyList())),
            listOf(connection), again.transport)
        assertEquals(listOf(2L, 3L), again.sent.map { it.first })
        connection.accept(tcpEnvelope(4, first.sent[0].second, ActionOrigin("owner", first.sent[0].first)))
        assertTrue(!connection.isClosed)
        connection.dispose()
    }

    @Test
    fun `TCP adapter continues a blocked writer after replay releases credit`() {
        val first = TcpHarness()
        val connection = first.open()
        val write = connection.write(ByteArray(6))
        assertTrue(!write.isDone)
        first.sent.forEachIndexed { index, item -> connection.accept(tcpEnvelope(index + 1L, item.second, ActionOrigin("owner", item.first))) }
        val unrelatedSequence = first.transport.nextSequence()
        connection.suspend()
        val request = TcpConnection.reconnectParameters(ReconnectParams("ahp-root://", clientId = "owner",
            lastSeenServerSeq = 20, subscriptions = emptyList()), listOf(connection))
        assertEquals(2, request.lastSeenServerSeq)
        val replay = listOf(tcpEnvelope(3, StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, 2))))
        val fresh = TcpHarness()
        TcpConnection.resume(request, ReconnectResultReplay(ReconnectReplayResult(ReconnectResultType.REPLAY, replay, emptyList())),
            listOf(connection), fresh.transport)
        write.get(1, java.util.concurrent.TimeUnit.SECONDS)
        assertEquals(1, fresh.sent.size)
        assertEquals(4, assertIs<StateActionTcpInput>(fresh.sent.single().second).value.offset)
        assertTrue(fresh.sent.single().first > unrelatedSequence)
        connection.dispose()
    }

    @Test
    fun `TCP adapter snapshot missing and strict loss terminate pending operations`() {
        val results = listOf<ReconnectResult>(
            ReconnectResultSnapshot(ReconnectSnapshotResult(ReconnectResultType.SNAPSHOT, emptyList())),
            ReconnectResultReplay(ReconnectReplayResult(ReconnectResultType.REPLAY, emptyList(), listOf("ahp-tcp:/created"))),
        )
        for (result in results) {
            val harness = TcpHarness()
            val connection = harness.open()
            val read = connection.read()
            val write = connection.write(ByteArray(5))
            val drain = connection.drain()
            connection.suspend()
            val request = TcpConnection.reconnectParameters(ReconnectParams("ahp-root://", clientId = "owner", lastSeenServerSeq = 0,
                subscriptions = emptyList()), listOf(connection))
            TcpConnection.resume(request, result, listOf(connection), harness.transport)
            for (future in listOf(read, write, drain)) assertTrue(future.isCompletedExceptionally)
            assertEquals(listOf(connection.resource), harness.unsubscribed)
        }
        val harness = TcpHarness()
        val connection = harness.open()
        val read = connection.read()
        val write = connection.write(ByteArray(5))
        connection.fail(IllegalStateException("strict decode loss"))
        assertTrue(read.isCompletedExceptionally && write.isCompletedExceptionally)
        assertIs<StateActionTcpClientReset>(harness.sent.last().second)
        connection.dispose()
        assertEquals(1, harness.unsubscribed.size)
        val closing = TcpHarness().open()
        val pendingRead = closing.read()
        val pendingWrite = closing.write(ByteArray(5))
        val pendingDrain = closing.drain()
        closing.close()
        assertTrue(!pendingRead.isDone && !pendingDrain.isDone)
        assertTrue(pendingWrite.isCompletedExceptionally)
        closing.dispose()
        assertTrue(pendingRead.isCompletedExceptionally && pendingDrain.isCompletedExceptionally)
    }

    private fun tcpState(size: Long = 8): TcpConnectionState = TcpConnectionState(
        session = "ahp-session:/test",
        target = TcpTarget(host = "localhost", port = 3000),
        encoding = TcpDataEncoding.BASE64,
        input = FlowControlledByteDirectionState(size, size, 0, 0),
        output = FlowControlledByteDirectionState(size, size, 0, 0),
        clientClosed = false,
        hostClosed = false,
    )

    @Test
    fun `TCP validates a four MiB chunk without decoding or retaining payload`() {
        val size = 4 * 1024 * 1024
        val data = "AAAA".repeat(size / 3) + "AA=="
        val before = tcpState(size.toLong())
        val action = StateActionTcpInput(TcpInputAction(ActionType.TCP_INPUT, 0, data))
        val after = TcpReducer.reduce(before, action)
        assertEquals(size.toLong(), after.input.receivedBytes)
        assertEquals(0L, before.input.receivedBytes)
        assertSame(after, tcpReducer(after, action))
        assertSame(before.output, after.output)
        val error = assertFailsWith<IllegalArgumentException> {
            tcpReducer(after, StateActionTcpInput(TcpInputAction(ActionType.TCP_INPUT, size.toLong(), "AA==")))
        }
        assertEquals("Invalid TCP action: receive window exceeded", error.message)
        assertEquals(size.toLong(), after.input.receivedBytes)
    }

    @Test
    fun `TCP checks all integer counters and accepts the safe boundary`() {
        val max = 9007199254740991L
        val before = tcpState().let { it.copy(input = it.input.copy(receivedBytes = max - 1, consumedBytes = max - 1)) }
        var state = tcpReducer(before, StateActionTcpInput(TcpInputAction(ActionType.TCP_INPUT, max - 1, "AA==")))
        state = tcpReducer(state, StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, max)))
        state = tcpReducer(state, StateActionTcpInputEof(TcpInputEofAction(ActionType.TCP_INPUT_EOF, max)))
        assertEquals(max, state.input.receivedBytes)
        assertEquals(max, state.input.consumedBytes)
        assertEquals(max, state.input.eofAtBytes)
        for (value in listOf(-1L, max + 1, Long.MAX_VALUE)) {
            val actions = listOf(
                StateActionTcpInput(TcpInputAction(ActionType.TCP_INPUT, value, "AA==")),
                StateActionTcpData(TcpDataAction(ActionType.TCP_DATA, value, "AA==")),
                StateActionTcpInputConsumed(TcpInputConsumedAction(ActionType.TCP_INPUT_CONSUMED, value)),
                StateActionTcpDataConsumed(TcpDataConsumedAction(ActionType.TCP_DATA_CONSUMED, value)),
                StateActionTcpInputEof(TcpInputEofAction(ActionType.TCP_INPUT_EOF, value)),
                StateActionTcpDataEof(TcpDataEofAction(ActionType.TCP_DATA_EOF, value)),
            )
            for (action in actions) {
                val error = assertFailsWith<IllegalArgumentException> { tcpReducer(state, action) }
                assertEquals("Invalid TCP action: offset must be a nonnegative safe integer", error.message)
                assertEquals(max, state.input.receivedBytes)
            }
        }
    }

    @Test
    fun `TCP rejects actual whitespace and Unicode base64`() {
        for (data in listOf("AAA\n", "AAA\r", "AAA\t", "AAA ", "AAA\u00e9", "AA\uD83D\uDE00")) {
            val error = assertFailsWith<IllegalArgumentException> {
                tcpReducer(tcpState(), StateActionTcpInput(TcpInputAction(ActionType.TCP_INPUT, 0, data)))
            }
            assertEquals("Invalid TCP action: base64 encoding", error.message)
        }
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
            lifecycle = TerminalLifecycleStateRunning(
                TerminalRunningLifecycleState(status = TerminalLifecycleStatus.RUNNING),
            ),
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
            lifecycle = TerminalLifecycleStateRunning(
                TerminalRunningLifecycleState(status = TerminalLifecycleStatus.RUNNING),
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
    fun `turn start uses producer timestamp for modifiedAt`() {
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
        assertEquals("1970-01-01T00:00:12.345Z", chatResult.modifiedAt)
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

        private fun userMessage(text: String): Message =
            Message(text = text, origin = MessageOrigin(kind = MessageKind.USER))
    }
}
