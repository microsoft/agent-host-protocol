package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.AgentInfo
import com.microsoft.agenthostprotocol.generated.AuthRequiredParams
import com.microsoft.agenthostprotocol.generated.PolicyState
import com.microsoft.agenthostprotocol.generated.ProtectedResourceMetadata
import com.microsoft.agenthostprotocol.generated.SessionAddedParams
import com.microsoft.agenthostprotocol.generated.SessionModelInfo
import com.microsoft.agenthostprotocol.generated.SessionStatus
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
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
                "createdAt": 0,
                "modifiedAt": 0
            }
        }""".trimIndent()
        val sessionAdded = json.decodeFromString(SessionAddedParams.serializer(), sessionAddedWire)
        assertEquals("ahp-root://", sessionAdded.channel)
        assertEquals("ahp-session:/abc", sessionAdded.summary.resource)

        val authWire = """{
            "channel": "ahp-root://",
            "resource": "https://api.github.com",
            "reason": "expired"
        }""".trimIndent()
        val auth = json.decodeFromString(AuthRequiredParams.serializer(), authWire)
        assertEquals("ahp-root://", auth.channel)
        assertEquals("https://api.github.com", auth.resource)
    }
}
