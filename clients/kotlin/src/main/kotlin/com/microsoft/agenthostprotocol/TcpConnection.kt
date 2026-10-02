package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.*
import java.util.ArrayDeque
import java.util.Base64
import java.util.concurrent.CompletableFuture

/**
 * Transport boundary for the portable TCP adapter. Callbacks must enqueue without
 * blocking. Sequence allocation is shared with all actions of this logical client.
 * Throwing from send suspends the handle; retained actions are reconciled on resume.
 */
public class TcpConnectionTransport(
    public val clientId: String,
    public val nextSequence: () -> Long,
    public val advanceSequencePast: (Long) -> Unit,
    public val send: (String, Long, StateAction) -> Unit,
    public val unsubscribe: (String) -> Unit,
    public val lastAssignedSequence: () -> Long,
)

/**
 * Portable subscribe/create lifecycle. The transport sends [parameters] and
 * forwards its definitive reply to [accept], even after a timeout/cancellation.
 * [fail] reports request failure; a late private child is released by the SDK.
 */
public class TcpConnectionCreation(
    private val session: String,
    private val create: TcpConnectionSubscription,
    private val initialized: InitializeResult,
    private val transport: TcpConnectionTransport,
) {
    public val parameters: SubscribeParams = TcpConnection.creationParameters(session, create, initialized)
    public val completion: CompletableFuture<TcpConnection> = CompletableFuture()
    private val lock = Any()
    private var received = false

    public fun fail(error: Throwable) { completion.completeExceptionally(error) }

    /** Cleanup failures throw to the transport caller instead of disappearing in a detached task. */
    public fun accept(result: SubscribeResult): Unit = synchronized(lock) {
        if (received) return@synchronized
        received = true
        if (completion.isDone) {
            result.snapshot?.resource?.takeIf { it.startsWith("ahp-tcp:") }?.let(transport.unsubscribe)
            return@synchronized
        }
        try {
            val connection = TcpConnection.open(session, create, initialized, result, transport)
            if (!completion.complete(connection)) connection.dispose()
        } catch (error: Exception) {
            if (!completion.completeExceptionally(error)) throw error
        }
    }
}

/**
 * A transport-independent, bounded TCP consumer. No worker threads or network
 * runtime are created. Feed accepted envelopes through [accept], call [suspend]
 * on disconnect, and [fail] on strict receiver lag or decode loss.
 */
public class TcpConnection private constructor(
    public val resource: String,
    initial: TcpConnectionState,
    checkpoint: Long,
    private var transport: TcpConnectionTransport,
) : AutoCloseable {
    public val clientId: String = transport.clientId
    private val lock = Any()
    private var current = initial
    private var checkpoint = checkpoint
    private val received = ArrayDeque<ByteArray>()
    private val pending = sortedMapOf<Long, StateAction>()
    private var sentBytes = initial.input.receivedBytes
    private var consumedBytes = initial.output.consumedBytes
    private var lastSequence = -1L
    private var suspended = false
    private var closing = false
    private var closed = false
    private var released = false
    private var ending = false
    private var failure: Throwable? = null
    private var transportFailure: Throwable? = null
    private var reader: CompletableFuture<ByteArray?>? = null
    private var writer: Write? = null
    private var endResult: CompletableFuture<Unit>? = null
    private val drains = mutableListOf<CompletableFuture<Unit>>()
    private var progressing = false
    private var dirty = false

    private class Write(val data: ByteArray, val result: CompletableFuture<Unit>, var offset: Int = 0)

    public val state: TcpConnectionState get() = synchronized(lock) { current }
    public val appliedCheckpoint: Long get() = synchronized(lock) { checkpoint }
    public val isSuspended: Boolean get() = synchronized(lock) { suspended }
    public val isClosed: Boolean get() = synchronized(lock) { closed }
    public val lastTransportFailure: Throwable? get() = synchronized(lock) { transportFailure }

    /** Pulls a chunk and releases its credit. Null is returned only after buffered EOF drains. */
    public fun read(): CompletableFuture<ByteArray?> = synchronized(lock) {
        check(reader == null) { "TCP permits one reader at a time" }
        val result = CompletableFuture<ByteArray?>()
        reader = result
        result.whenComplete { _, _ -> synchronized(lock) { if (reader === result && result.isCancelled) reader = null } }
        progress()
        result
    }

    /** One writer at a time. The caller must not mutate data until the result completes. */
    public fun write(data: ByteArray): CompletableFuture<Unit> = synchronized(lock) {
        check(writer == null && !ending && !closing && !closed) { "TCP write requires an open, idle writer" }
        val result = CompletableFuture<Unit>()
        val operation = Write(data, result)
        writer = operation
        result.whenComplete { _, _ -> synchronized(lock) { if (writer === operation && result.isCancelled) writer = null } }
        progress()
        result
    }

    /** Waits until all reserved input bytes are consumed by the destination. */
    public fun drain(): CompletableFuture<Unit> = synchronized(lock) {
        val result = CompletableFuture<Unit>()
        drains.add(result)
        result.whenComplete { _, _ -> synchronized(lock) { drains.remove(result) } }
        progress()
        result
    }

    /** Half-closes input. Finish an active write first. */
    public fun end(): CompletableFuture<Unit> = synchronized(lock) {
        check(writer == null && !closing && !closed) { "TCP end requires an open, idle writer" }
        if (ending) return@synchronized endResult ?: CompletableFuture.completedFuture(Unit)
        ending = true
        val result = CompletableFuture<Unit>()
        endResult = result
        result.whenComplete { _, _ -> synchronized(lock) {
            if (endResult === result && result.isCancelled) { endResult = null; ending = false }
        } }
        progress()
        result
    }

    /** Stops input; retains crossing output and ownership until both sides close and drain. */
    override fun close(): Unit = synchronized(lock) {
        if (closing || closed) return@synchronized
        closing = true
        dispatch(StateActionTcpClientClose(TcpClientCloseAction(ActionType.TCP_CLIENT_CLOSE)))
        progress()
        failure?.let { throw it }
    }

    /** Disposal terminates every pending operation, discarding unread bytes. */
    public fun dispose(): Unit = fail(IllegalStateException("TCP connection disposed"))

    public fun suspend(cause: Throwable? = null): Unit = synchronized(lock) {
        if (!closed) {
            suspended = true
            transportFailure = cause
        }
    }

    /** Lag/decode loss is terminal, not a resumable transport interruption. */
    public fun fail(error: Throwable): Unit = synchronized(lock) { failLocked(error, reset = true) }

    public fun accept(envelope: ActionEnvelope): Unit = synchronized(lock) {
        if (!suspended) apply(envelope)
    }

    private fun apply(envelope: ActionEnvelope) {
        if (closed || envelope.channel != resource) return
        try {
            safe(envelope.serverSeq)
            val clientEcho = when (envelope.action) {
                is StateActionTcpInput, is StateActionTcpDataConsumed, is StateActionTcpInputEof,
                is StateActionTcpClientClose, is StateActionTcpClientReset -> true
                else -> false
            }
            val sequence = if (clientEcho) {
                val origin = envelope.origin
                check(origin != null && origin.clientId == clientId) { "TCP client echo requires the owning client origin" }
                safe(origin.clientSeq)
                check(origin.clientSeq <= lastSequence) { "TCP client echo has an unassigned sequence" }
                origin.clientSeq
            } else null
            if (envelope.serverSeq <= checkpoint) return
            check(envelope.rejectionReason == null) { envelope.rejectionReason ?: "Rejected TCP action" }
            val next = tcpReducer(current, envelope.action)
            if (sequence != null) {
                val expected = pending[sequence]
                if (expected != null) check(expected == envelope.action) { "TCP client echo does not match its pending action" }
                else check(next == current) { "TCP advancing client echo has no pending action" }
            }
            check(next.output.receivedBytes - consumedBytes <= next.output.windowBytes) { "TCP output exceeds locally released credit" }
            val action = envelope.action
            if (action is StateActionTcpData && next.output.receivedBytes > current.output.receivedBytes) {
                received.addLast(Base64.getDecoder().decode(action.value.data))
            }
            current = next
            checkpoint = envelope.serverSeq
            if (sequence != null) pending.remove(sequence)
        } catch (error: IllegalArgumentException) {
            failLocked(error, reset = true)
            return
        } catch (error: IllegalStateException) {
            failLocked(error, reset = true)
            return
        }
        if (current.reset != null) failLocked(IllegalStateException("TCP reset: ${current.reset?.reason}"), reset = false)
        else if (current.hostClosed) close()
        progress()
    }

    private fun dispatch(action: StateAction) {
        val sequence = transport.nextSequence()
        safe(sequence)
        check(sequence > lastSequence) { "TCP sequence allocator did not advance" }
        lastSequence = sequence
        pending[sequence] = action
        if (!suspended) send(sequence, action)
    }

    private fun send(sequence: Long, action: StateAction) {
        try {
            transport.send(resource, sequence, action)
        } catch (error: Exception) {
            transportFailure = error
            suspended = true
            if (closed) {
                val previous = failure
                if (previous == null) failure = error else previous.addSuppressed(error)
            }
        }
    }

    private fun failLocked(error: Throwable, reset: Boolean) {
        if (closed) return
        failure = error
        closed = true
        try {
            if (reset && !suspended) dispatch(StateActionTcpClientReset(TcpClientResetAction(ActionType.TCP_CLIENT_RESET, TcpResetReason.PROTOCOL_ERROR)))
        } catch (sendError: Exception) { error.addSuppressed(sendError) }
        received.clear()
        release()
        progress()
    }

    private fun release() {
        if (released) return
        released = true
        pending.clear()
        try {
            transport.unsubscribe(resource)
        } catch (error: Exception) {
            val previous = failure
            if (previous == null) failure = error else previous.addSuppressed(error)
        }
    }

    private fun progress() {
        dirty = true
        if (progressing) return
        progressing = true
        try {
            while (dirty) {
                dirty = false
                val error = failure
                if (error != null) {
                    val read = reader; reader = null; read?.completeExceptionally(error)
                    val write = writer; writer = null; write?.result?.completeExceptionally(error)
                    endResult?.completeExceptionally(error); endResult = null
                    for (drain in drains.toList()) drain.completeExceptionally(error)
                    continue
                }
                if (!suspended || closed) {
                    reader?.let { result ->
                        if (received.isNotEmpty()) {
                            val bytes = received.removeFirst()
                            reader = null
                            consumedBytes += bytes.size
                            if (!closed) dispatch(StateActionTcpDataConsumed(TcpDataConsumedAction(ActionType.TCP_DATA_CONSUMED, consumedBytes)))
                            result.complete(bytes)
                        } else if (closed || current.hostClosed || current.output.eofAtBytes != null) {
                            reader = null
                            result.complete(null)
                        }
                    }
                }
                while (!suspended && !closing && !closed) {
                    val write = writer ?: break
                    if (write.offset == write.data.size) {
                        writer = null
                        write.result.complete(Unit)
                        break
                    }
                    val credit = current.input.windowBytes - (sentBytes - current.input.consumedBytes)
                    if (credit == 0L) break
                    val count = minOf(credit, current.input.maximumChunkSize, (write.data.size - write.offset).toLong()).toInt()
                    safe(sentBytes + count)
                    val action = StateActionTcpInput(TcpInputAction(ActionType.TCP_INPUT, sentBytes,
                        Base64.getEncoder().encodeToString(write.data.copyOfRange(write.offset, write.offset + count))))
                    sentBytes += count
                    write.offset += count
                    dispatch(action)
                }
                if (!suspended && !closing && !closed) {
                    endResult?.let { result ->
                        endResult = null
                        dispatch(StateActionTcpInputEof(TcpInputEofAction(ActionType.TCP_INPUT_EOF, sentBytes)))
                        result.complete(Unit)
                    }
                }
                if (!closed && closing && current.clientClosed && current.hostClosed
                    && current.input.consumedBytes >= sentBytes
                    && current.output.consumedBytes >= current.output.receivedBytes
                    && received.isEmpty() && pending.isEmpty()) {
                    closed = true
                    release()
                    dirty = true
                }
                if (closing || closed) {
                    val errorClosed = IllegalStateException("TCP connection closed")
                    val write = writer; writer = null; write?.result?.completeExceptionally(errorClosed)
                    endResult?.completeExceptionally(errorClosed); endResult = null
                }
                if (current.input.consumedBytes >= sentBytes) {
                    for (drain in drains.toList()) drain.complete(Unit)
                }
            }
        } catch (error: Exception) {
            failLocked(error, reset = false)
        } finally {
            progressing = false
        }
        if (dirty) progress()
    }

    public companion object {
        private fun safe(value: Long) { require(value in 0..9007199254740991L) { "TCP counter must be a nonnegative safe integer" } }

        private fun validateLimits(windowBytes: Long, maximumChunkSize: Long) {
            require(windowBytes in 1..4294967295L && maximumChunkSize in 1..windowBytes) {
                "TCP window and chunk limits must be positive UInt32 values, with chunk no larger than window"
            }
        }

        /** Validates capability and flow limits before the injected transport sends subscribe. */
        public fun creationParameters(session: String, create: TcpConnectionSubscription, initialized: InitializeResult): SubscribeParams {
            require(session.startsWith("ahp-session:") && create.type == "tcpConnection" && create.host.isNotBlank()
                && create.port in 1..65535 && create.encoding == TcpDataEncoding.BASE64
                && initialized.tcpConnections?.encodings?.contains(create.encoding) == true) { "Invalid or unsupported TCP creation request" }
            validateLimits(create.receiveWindowBytes, create.maximumChunkSize)
            return SubscribeParams(channel = session, create = create)
        }

        /** Seeds only a validated, freshly created stream; never a reconnect snapshot. */
        public fun open(session: String, create: TcpConnectionSubscription, initialized: InitializeResult,
                        result: SubscribeResult, transport: TcpConnectionTransport): TcpConnection {
            val snapshot = requireNotNull(result.snapshot) { "Missing TCP creation snapshot" }
            try {
                creationParameters(session, create, initialized)
                val state = (snapshot.state as? SnapshotState.Tcp)?.value
                    ?: throw IllegalArgumentException("Invalid TCP creation snapshot")
                require(snapshot.resource.startsWith("ahp-tcp:") && state.session == session && state.target.host == create.host
                    && state.target.port == create.port && state.encoding == create.encoding
                    && !state.clientClosed && !state.hostClosed && state.reset == null) { "Invalid TCP creation snapshot" }
                safe(snapshot.fromSeq)
                for (direction in listOf(state.input, state.output)) {
                    validateLimits(direction.windowBytes, direction.maximumChunkSize)
                    require(direction.receivedBytes == 0L && direction.consumedBytes == 0L && direction.eofAtBytes == null) { "TCP creation requires fresh directions" }
                }
                require(state.output.windowBytes <= create.receiveWindowBytes && state.output.maximumChunkSize <= create.maximumChunkSize)
                return TcpConnection(snapshot.resource, state, snapshot.fromSeq, transport)
            } catch (error: IllegalArgumentException) {
                if (snapshot.resource.startsWith("ahp-tcp:")) transport.unsubscribe(snapshot.resource)
                throw error
            }
        }

        /** Call before sending reconnect; the transport must buffer subsequent live events until resume returns. */
        public fun reconnectParameters(parameters: ReconnectParams, connections: List<TcpConnection>): ReconnectParams {
            safe(parameters.lastSeenServerSeq)
            require(parameters.channel == "ahp-root://")
            require(connections.map { it.resource }.distinct().size == connections.size)
            var checkpoint = parameters.lastSeenServerSeq
            for (connection in connections) synchronized(connection.lock) {
                require(connection.clientId == parameters.clientId && connection.suspended && !connection.closed) { "TCP reconnect requires suspended handles owned by the same client" }
                checkpoint = minOf(checkpoint, connection.checkpoint)
            }
            return parameters.copy(lastSeenServerSeq = checkpoint, subscriptions = (parameters.subscriptions + connections.map { it.resource }).distinct())
        }

        /** Rebinds, applies replay, cleans acknowledgements, then resends original pending identities. */
        public fun resume(parameters: ReconnectParams, result: ReconnectResult, connections: List<TcpConnection>, transport: TcpConnectionTransport) {
            require(transport.clientId == parameters.clientId)
            val checked = reconnectParameters(parameters, connections)
            require(checked.lastSeenServerSeq == parameters.lastSeenServerSeq && parameters.subscriptions.containsAll(checked.subscriptions)) {
                "Use reconnectParameters before sending reconnect"
            }
            val lastSequence = connections.maxOfOrNull { synchronized(it.lock) {
                val assigned = it.transport.lastAssignedSequence()
                if (assigned != -1L) safe(assigned)
                it.lastSequence = maxOf(it.lastSequence, assigned)
                it.lastSequence
            } }
            if (lastSequence != null && lastSequence >= 0) transport.advanceSequencePast(lastSequence)
            if (result is ReconnectResultReplay) {
                var previous = parameters.lastSeenServerSeq
                for (envelope in result.value.actions) {
                    safe(envelope.serverSeq)
                    require(envelope.serverSeq > previous) { "TCP replay is not ordered" }
                    previous = envelope.serverSeq
                }
            }
            for (connection in connections) synchronized(connection.lock) {
                connection.transport = transport
                if (result !is ReconnectResultReplay || connection.resource in result.value.missing) {
                    connection.failLocked(IllegalStateException("TCP cannot resume missing resources or snapshot fallback"), reset = false)
                } else {
                    for (envelope in result.value.actions) connection.apply(envelope)
                    if (!connection.closed) {
                        connection.suspended = false
                        connection.transportFailure = null
                        for ((sequence, action) in connection.pending.toMap()) {
                            if (connection.suspended) break
                            connection.send(sequence, action)
                        }
                        connection.progress()
                    }
                }
            }
        }
    }
}
