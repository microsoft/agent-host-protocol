package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.AgentInfo
import com.microsoft.agenthostprotocol.generated.AhpCommands
import com.microsoft.agenthostprotocol.generated.AhpClientNotifications
import com.microsoft.agenthostprotocol.generated.AuthenticateParams
import com.microsoft.agenthostprotocol.generated.AuthenticateResult
import com.microsoft.agenthostprotocol.generated.AuthenticationAccount
import com.microsoft.agenthostprotocol.generated.AuthRevokedParams
import com.microsoft.agenthostprotocol.generated.AuthRequiredParams
import com.microsoft.agenthostprotocol.generated.InitializeResult
import com.microsoft.agenthostprotocol.generated.JsonRpcNotification
import com.microsoft.agenthostprotocol.generated.JsonRpcRequest
import com.microsoft.agenthostprotocol.generated.PolicyState
import com.microsoft.agenthostprotocol.generated.ProtectedResourceMetadata
import com.microsoft.agenthostprotocol.generated.SessionAddedParams
import com.microsoft.agenthostprotocol.generated.SessionModelInfo
import com.microsoft.agenthostprotocol.generated.SessionStatus
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Round-trip tests for individual generator output categories: plain enums,
 * structs with snake_case wire names, structs with `_meta` fields, and
 * structs with default values. These verify that the kotlinx-serialization
 * configuration in [Ahp.json] preserves the wire format expected by the
 * Swift and TypeScript clients.
 */
class GeneratedStructsTest {
    private val json: Json = Ahp.json

    @Test
    fun `authentication account is optional and success remains empty`() {
        val account = AuthenticationAccount(authority = "https://login.example.com", id = "account-a")
        val params = AuthenticateParams(
            channel = "ahp-root://", resource = "https://api.example.com", token = "opaque", account = account,
        )
        val encoded = json.encodeToJsonElement(AuthenticateParams.serializer(), params)
        assertEquals(json.encodeToJsonElement(AuthenticationAccount.serializer(), account), encoded.jsonObject["account"])
        assertEquals(params, json.decodeFromJsonElement(AuthenticateParams.serializer(), encoded))
        val legacy = json.encodeToJsonElement(AuthenticateParams.serializer(), params.copy(account = null))
        assertFalse(legacy.jsonObject.containsKey("account"))
        val result = json.decodeFromString(AuthenticateResult.serializer(), "{}")
        assertEquals(JsonObject(emptyMap()), json.encodeToJsonElement(AuthenticateResult.serializer(), result))
    }

    @Test
    fun `auth revoked builder emits a typed notification without id or token`() {
        val notification = AhpClientNotifications.authRevoked(AuthRevokedParams(
            channel = "ahp-root://",
            resource = "https://api.example.com",
            account = AuthenticationAccount(authority = "https://login.example.com", id = "account-a"),
        ))
        val serializer = JsonRpcNotification.serializer(AuthRevokedParams.serializer())
        val encoded = json.encodeToJsonElement(serializer, notification)
        assertEquals(json.parseToJsonElement("""
            {"jsonrpc":"2.0","method":"auth/revoked","params":{"channel":"ahp-root://",
             "resource":"https://api.example.com","account":{"authority":"https://login.example.com","id":"account-a"}}}
        """), encoded)
        assertEquals(notification, json.decodeFromJsonElement(serializer, encoded))
    }

    @Test
    fun `account revocation capability preserves empty object presence`() {
        val supported = json.decodeFromString(InitializeResult.serializer(), """
            {"protocolVersion":"0.9.0","serverSeq":0,"snapshots":[],"accountRevocation":{}}
        """)
        assertTrue(assertNotNull(supported.accountRevocation).isEmpty())
        val encoded = json.encodeToJsonElement(InitializeResult.serializer(), supported).jsonObject
        assertEquals(JsonObject(emptyMap()), encoded["accountRevocation"])
        val legacy = json.encodeToJsonElement(
            InitializeResult.serializer(), supported.copy(accountRevocation = null),
        ).jsonObject
        assertFalse(legacy.containsKey("accountRevocation"))
    }

    @Test
    fun `plain enum encodes wire string and decodes back`() {
        val encoded = json.encodeToString(PolicyState.serializer(), PolicyState.UNCONFIGURED)
        assertEquals("\"unconfigured\"", encoded)
        val decoded = json.decodeFromString(PolicyState.serializer(), "\"enabled\"")
        assertEquals(PolicyState.ENABLED, decoded)
    }

    @Test
    fun `struct with snake_case wire names round-trips via SerialName`() {
        // ProtectedResourceMetadata follows RFC 9728 with snake_case JSON
        // keys but camelCase Kotlin properties.
        val original = ProtectedResourceMetadata(
            resource = "https://api.github.com",
            resourceName = "GitHub API",
            authorizationServers = listOf("https://github.com/login/oauth/authorize"),
            scopesSupported = listOf("repo", "user"),
            required = true,
        )

        val encoded = json.encodeToString(ProtectedResourceMetadata.serializer(), original)
        val obj = json.parseToJsonElement(encoded).jsonObject
        // Snake-case keys on the wire
        assertTrue(obj.containsKey("resource_name"), "wire must use snake_case 'resource_name'")
        assertTrue(obj.containsKey("authorization_servers"))
        assertTrue(obj.containsKey("scopes_supported"))
        assertFalse(obj.containsKey("resourceName"), "wire must NOT use camelCase 'resourceName'")
        // Optional null fields are omitted (explicitNulls = false)
        assertFalse(obj.containsKey("jwks_uri"))

        val decoded = json.decodeFromString(ProtectedResourceMetadata.serializer(), encoded)
        assertEquals(original, decoded)
    }

    @Test
    fun `_meta field round-trips via SerialName mapping`() {
        // SessionModelInfo.meta wire-name is "_meta" (MCP convention)
        val original = SessionModelInfo(
            id = "gpt-5",
            provider = "openai",
            name = "GPT-5",
            maxContextWindow = 200_000,
            meta = mapOf("pricing" to JsonPrimitive("flat")),
        )

        val encoded = json.encodeToString(SessionModelInfo.serializer(), original)
        val obj = json.parseToJsonElement(encoded).jsonObject
        assertTrue(obj.containsKey("_meta"), "wire must use '_meta' (with leading underscore)")
        assertFalse(obj.containsKey("meta"), "Kotlin property name 'meta' must not appear on wire")

        val decoded = json.decodeFromString(SessionModelInfo.serializer(), encoded)
        assertEquals(original.id, decoded.id)
        assertEquals(JsonPrimitive("flat"), decoded.meta?.get("pricing"))
    }

    @Test
    fun `Long fields preserve values larger than Int MAX VALUE`() {
        // TS numbers are 64-bit ints in this protocol; clients must not
        // silently downcast to 32-bit.
        val largeContext = (Int.MAX_VALUE.toLong()) + 100L
        val info = SessionModelInfo(
            id = "future-model",
            provider = "vendor",
            name = "Future",
            maxContextWindow = largeContext,
        )
        val encoded = json.encodeToString(SessionModelInfo.serializer(), info)
        val parsed = json.parseToJsonElement(encoded).jsonObject
        val wireValue = parsed["maxContextWindow"] as JsonPrimitive
        assertEquals(largeContext, wireValue.long)

        val decoded = json.decodeFromString(SessionModelInfo.serializer(), encoded)
        assertEquals(largeContext, decoded.maxContextWindow)
    }

    @Test
    fun `nested optional struct survives a round trip when null`() {
        val info = AgentInfo(
            provider = "copilot",
            displayName = "Copilot",
            description = "GitHub Copilot",
            models = listOf(),
        )
        val encoded = json.encodeToString(AgentInfo.serializer(), info)
        val obj = json.parseToJsonElement(encoded).jsonObject
        assertFalse(obj.containsKey("protectedResources"))
        assertFalse(obj.containsKey("customizations"))

        val decoded = json.decodeFromString(AgentInfo.serializer(), encoded)
        assertEquals(info, decoded)
    }

    @Test
    fun `unknown wire keys are ignored by Ahp json on decode`() {
        // Forward compatibility: a future protocol version may add fields
        // that current clients should silently tolerate.
        val futureWire = """{
            "id": "x",
            "provider": "y",
            "name": "z",
            "futureFieldNotInGenerated": 42
        }""".trimIndent()
        val decoded = json.decodeFromString(SessionModelInfo.serializer(), futureWire)
        assertEquals("x", decoded.id)
    }

    @Test
    fun `sanity check that Ahp json instance can be obtained`() {
        // Sanity check that Ahp object initializes lazily and produces the
        // SessionStatus reference (just to ensure the import graph compiles).
        assertNotNull(Ahp.json)
        assertEquals(8u, SessionStatus.IN_PROGRESS.rawValue)
    }

    @Test
    fun `channel-scoped notification params decode and carry channel uri`() {
        // Post-channels-reorg, every notification (other than `action`)
        // carries a `channel` field identifying its subscription. Verifies
        // both a channel-routed notification (root/sessionAdded) and the
        // connection-level auth/required notification.
        val sessionAddedWire = """{
            "channel": "ahp-root://",
            "summary": {
                "resource": "ahp-session:/abc",
                "provider": "copilot",
                "title": "New",
                "status": 1,
                "createdAt": "2024-03-09T16:00:00.000Z",
                "modifiedAt": "2024-03-09T16:00:00.000Z"
            }
        }""".trimIndent()
        val sessionAdded = json.decodeFromString(SessionAddedParams.serializer(), sessionAddedWire)
        assertEquals("ahp-root://", sessionAdded.channel)
        assertEquals("ahp-session:/abc", sessionAdded.summary.resource)

        val authWire = """{
            "channel": "ahp-root://",
            "resource": {
                "resource": "https://api.github.com",
                "authorization_servers": ["https://github.com/login/oauth"]
            },
            "reason": "expired"
        }""".trimIndent()
        val auth = json.decodeFromString(AuthRequiredParams.serializer(), authWire)
        assertEquals("ahp-root://", auth.channel)
        assertEquals("https://api.github.com", auth.resource.resource)
    }

    @Test
    fun `AhpCommands ping builds a root-scoped ping request`() {
        // `ping` has no dedicated params type; the factory hardcodes the root
        // channel object. Verify the emitted request shape matches the wire.
        val request = AhpCommands.ping(7L)
        assertEquals("ping", request.method)

        val encoded = json.encodeToString(JsonRpcRequest.serializer(JsonObject.serializer()), request)
        val obj = json.parseToJsonElement(encoded).jsonObject
        assertEquals("2.0", obj["jsonrpc"]?.jsonPrimitive?.content)
        assertEquals(7L, obj["id"]?.jsonPrimitive?.long)
        assertEquals("ping", obj["method"]?.jsonPrimitive?.content)
        assertEquals("ahp-root://", obj["params"]?.jsonObject?.get("channel")?.jsonPrimitive?.content)
    }
}
