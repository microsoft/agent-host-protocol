package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.*
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class AccountsTest {
    private val agent = AccountConsumerAgent(
        AgentAccountConsumer(
            kind = AccountConsumerKind.AGENT,
            provider = "copilot",
            resource = "https://api.example.com",
        ),
    )

    @Test
    fun `accounts snapshots decode without becoming root state`() {
        val snapshot = roundTrip(
            Snapshot.serializer(),
            """{"resource":"ahp-accounts://","state":{"accounts":[],"attempts":[]},"fromSeq":7}""",
        )
        val accounts = assertIs<SnapshotState.Accounts>(snapshot.state)
        assertTrue(accounts.value.accounts.isEmpty())
        assertTrue(accounts.value.attempts.isEmpty())
        val root = roundTrip(
            Snapshot.serializer(),
            """{"resource":"ahp-root://","state":{"agents":[]},"fromSeq":7}""",
        )
        assertIs<SnapshotState.Root>(root.state)
    }

    @Test
    fun `consumer and attempt discriminators round trip including future variants`() {
        val consumers = listOf(
            """{"kind":"agent","provider":"copilot","resource":"https://api.example.com"}""",
            """{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"}""",
            """{"kind":"futureConsumer","selection":{"id":"future"}}""",
        )
        consumers.forEach { roundTrip(AccountConsumer.serializer(), it) }
        val outcomes = listOf(
            """"status":"pending"""",
            """"status":"completed","accountId":"a1"""",
            """"status":"failed","error":{"errorType":"Expired","message":"Attempt expired"}""",
            """"status":"futureStatus","outcome":{"preserve":true}""",
        )
        outcomes.forEach {
            roundTrip(
                AuthAttemptState.serializer(),
                """{"id":"attempt-1","consumer":${consumers[0]},"resource":"https://api.example.com",$it}""",
            )
        }
    }

    @Test
    fun `authenticate preserves binding metadata and rejects unknown binding kinds`() {
        for (binding in listOf(
            """{"kind":"attempt","attemptId":"attempt-1"}""",
            """{"kind":"account","accountId":"a1"}""",
        )) {
            val params = roundTrip(
                AuthenticateParams.serializer(),
                """{"channel":"ahp-root://","resource":"https://api.example.com","token":"opaque",
                   "expiresIn":300,"scopes":["read"],"binding":$binding,"_meta":{"trace":"request-1"}}""",
            )
            val request = AhpCommands.authenticate(1, params)
            assertEquals("authenticate", request.method)
            val encoded = Ahp.json.encodeToJsonElement(
                JsonRpcRequest.serializer(AuthenticateParams.serializer()), request,
            ).jsonObject
            assertEquals(Ahp.json.parseToJsonElement(binding), encoded["params"]?.jsonObject?.get("binding"))
        }
        assertFails {
            Ahp.json.decodeFromString(
                AuthenticateParams.serializer(),
                """{"channel":"ahp-root://","resource":"https://api.example.com","token":"opaque",
                   "binding":{"kind":"futureBinding","accountId":"a1"}}""",
            )
        }
        val legacy = roundTrip(
            AuthenticateParams.serializer(),
            """{"channel":"ahp-root://","resource":"https://api.example.com","token":"opaque"}""",
        )
        assertNull(legacy.binding)
        roundTrip(AuthenticateResult.serializer(), """{"accountId":"a1"}""")
    }

    @Test
    fun `auth begin helper preserves explicit consumer offered flows and reauthorization id`() {
        val params = AuthBeginParams(
            channel = "ahp-accounts://",
            target = AuthBeginTarget(consumer = agent),
            flows = listOf(AuthFlowSupport(kind = AuthFlowKind.CLIENT_BROKERED)),
            accountId = "a1",
        )
        val request = AhpCommands.authBegin(2, params)
        assertEquals("authBegin", request.method)
        val encoded = Ahp.json.encodeToJsonElement(JsonRpcRequest.serializer(AuthBeginParams.serializer()), request)
        val wireParams = encoded.jsonObject["params"]!!.jsonObject
        val expected = Ahp.json.parseToJsonElement(
            """{"channel":"ahp-accounts://",
               "target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.com"}},
               "flows":[{"kind":"clientBrokered"}],"accountId":"a1"}""",
        )
        assertEquals(expected, wireParams)
        roundTrip(AuthBeginResult.serializer(), """{"flow":"clientBrokered","attemptId":"attempt-1"}""")
        val future = roundTrip(AuthBeginResult.serializer(), """{"flow":"futureFlow","attemptId":"attempt-1"}""")
        assertNotEquals(AuthFlowKind.CLIENT_BROKERED, future.flow)
    }

    @Test
    fun `authentication capability is independent of protocol version`() {
        val supported = roundTrip(
            InitializeResult.serializer(),
            """{"protocolVersion":"0.9.0","serverSeq":0,"snapshots":[],
               "authentication":{"flows":[{"kind":"clientBrokered"}]}}""",
        )
        assertEquals(AuthFlowKind.CLIENT_BROKERED, supported.authentication?.flows?.single()?.kind)
        val future = roundTrip(
            InitializeResult.serializer(),
            """{"protocolVersion":"0.9.0","serverSeq":0,"snapshots":[],
               "authentication":{"flows":[{"kind":"futureHostFlow"}]}}""",
        )
        assertFalse(future.authentication?.flows?.any { it.kind == AuthFlowKind.CLIENT_BROKERED } == true)
        val legacy = roundTrip(
            InitializeResult.serializer(),
            """{"protocolVersion":"0.9.0","serverSeq":0,"snapshots":[]}""",
        )
        assertNull(legacy.authentication)
    }

    @Test
    fun `accounts reducer upserts and removes only requested lifetime`() {
        val first = HostAccount(id = "a1", label = "First", removable = true, consumers = listOf(agent))
        val second = HostAccount(id = "a2", label = "Second", removable = false, consumers = emptyList())
        val initial = AccountsState(accounts = listOf(first, second), attempts = emptyList())
        val action = StateActionAccountSet(
            AccountSetAction(type = ActionType.ACCOUNT_SET, account = first.copy(label = "Updated", consumers = emptyList())),
        )
        val updated = AccountsReducer.reduce(initial, action)
        assertEquals(accountsReducer(initial, action), updated)
        assertEquals(listOf("a1", "a2"), updated.accounts.map { it.id })
        assertEquals(listOf("Updated", "Second"), updated.accounts.map { it.label })
        assertTrue(updated.accounts[0].consumers.isEmpty())
        assertEquals("First", initial.accounts[0].label)
        val removed = accountsReducer(
            updated, StateActionAccountRemoved(AccountRemovedAction(type = ActionType.ACCOUNT_REMOVED, id = "a1")),
        )
        assertEquals(listOf(second), removed.accounts)
        val absent = StateActionAccountRemoved(AccountRemovedAction(type = ActionType.ACCOUNT_REMOVED, id = "missing"))
        assertSame(removed, accountsReducer(removed, absent))
        val appended = accountsReducer(
            removed, StateActionAccountSet(AccountSetAction(type = ActionType.ACCOUNT_SET, account = first)),
        )
        assertEquals(listOf("a2", "a1"), appended.accounts.map { it.id })
    }

    @Test
    fun `attempt completion and cancellation do not mutate account selections`() {
        val account = HostAccount(id = "a1", label = "Account", removable = true, consumers = listOf(agent))
        val pending = AuthAttemptStatePending(AuthAttemptPendingState(
            id = "attempt-1", consumer = agent, resource = "https://api.example.com", status = AuthAttemptStatus.PENDING,
        ))
        var state = accountsReducer(
            AccountsState(accounts = listOf(account), attempts = emptyList()),
            StateActionAuthAttemptSet(AuthAttemptSetAction(type = ActionType.AUTH_ATTEMPT_SET, attempt = pending)),
        )
        val completed = AuthAttemptStateCompleted(AuthAttemptCompletedState(
            id = "attempt-1", consumer = agent, resource = "https://api.example.com",
            status = AuthAttemptStatus.COMPLETED, accountId = "a1",
        ))
        state = accountsReducer(
            state, StateActionAuthAttemptSet(AuthAttemptSetAction(type = ActionType.AUTH_ATTEMPT_SET, attempt = completed)),
        )
        assertEquals(listOf(completed), state.attempts)
        val future = Ahp.json.decodeFromString(
            AuthAttemptState.serializer(),
            """{"id":"attempt-1","consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.com"},
               "resource":"https://api.example.com","status":"futureStatus","preserve":true}""",
        )
        state = accountsReducer(
            state, StateActionAuthAttemptSet(AuthAttemptSetAction(type = ActionType.AUTH_ATTEMPT_SET, attempt = future)),
        )
        assertIs<AuthAttemptStateUnknown>(state.attempts.single())
        val missing = StateActionAuthAttemptRemoved(
            AuthAttemptRemovedAction(type = ActionType.AUTH_ATTEMPT_REMOVED, id = "missing"),
        )
        assertSame(state, accountsReducer(state, missing))
        state = accountsReducer(
            state, StateActionAuthAttemptRemoved(AuthAttemptRemovedAction(type = ActionType.AUTH_ATTEMPT_REMOVED, id = "attempt-1")),
        )
        assertTrue(state.attempts.isEmpty())
        assertEquals(listOf(account), state.accounts)
    }

    @Test
    fun `unrelated actions are a no-op`() {
        val initial = AccountsState(accounts = emptyList(), attempts = emptyList())
        val action = StateActionRootAgentsChanged(
            RootAgentsChangedAction(type = ActionType.ROOT_AGENTS_CHANGED, agents = emptyList()),
        )
        assertSame(initial, accountsReducer(initial, action))
    }

    private fun <T> roundTrip(serializer: KSerializer<T>, wire: String): T {
        val decoded = Ahp.json.decodeFromString(serializer, wire)
        assertEquals(Ahp.json.parseToJsonElement(wire), Ahp.json.encodeToJsonElement(serializer, decoded))
        return decoded
    }
}
