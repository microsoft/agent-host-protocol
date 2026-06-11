package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.SessionStatus
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Tests for bitset-style enums emitted as `@JvmInline value class` wrappers
 * over [Int]. These verify bitwise containment, the OR/AND combinators, and
 * — most importantly — that unknown future bits survive a decode/encode
 * round-trip without being dropped.
 */
class BitsetEnumTest {
    private val json = Ahp.json

    @Test
    fun `single flag is contained in itself`() {
        assertTrue(SessionStatus.IDLE in SessionStatus.IDLE)
        assertTrue(SessionStatus.IS_READ in SessionStatus.IS_READ)
    }

    @Test
    fun `OR combines flags and contains both`() {
        val combined = SessionStatus.IDLE or SessionStatus.IS_READ
        assertTrue(SessionStatus.IDLE in combined)
        assertTrue(SessionStatus.IS_READ in combined)
        assertFalse(SessionStatus.IN_PROGRESS in combined)
    }

    @Test
    fun `INPUT_NEEDED contains IN_PROGRESS`() {
        // SessionStatus.INPUT_NEEDED has value 24 = 8 (IN_PROGRESS) | 16
        // — so a turn waiting for input is also "in progress".
        assertTrue(SessionStatus.IN_PROGRESS in SessionStatus.INPUT_NEEDED)
    }

    @Test
    fun `bitset encodes as raw int`() {
        val combined = SessionStatus.IDLE or SessionStatus.IS_READ
        val encoded = json.encodeToString(SessionStatus.serializer(), combined)
        // wire form is the OR of raw values: 1 | 32 = 33
        assertEquals("33", encoded)
    }

    @Test
    fun `unknown future bits survive round trip`() {
        // A future protocol version might add bit 128. Decoding must
        // preserve it so subsequent re-encoding doesn't drop the unknown
        // capability.
        val withFutureBit = json.decodeFromString(SessionStatus.serializer(), "129")
        assertEquals(129u, withFutureBit.rawValue)
        assertTrue(SessionStatus.IDLE in withFutureBit)

        val reencoded = json.encodeToString(SessionStatus.serializer(), withFutureBit)
        assertEquals("129", reencoded)
    }

    @Test
    fun `high bits above signed int32 range survive round trip`() {
        // SessionStatus is an unsigned 32-bit bitset on the wire (the .NET
        // reference models it as `uint`). A forward-compat unknown bit at or
        // above the sign bit 2^31 (2147483648) is a positive value that does
        // NOT fit a signed 32-bit Int — backing rawValue with UInt is what lets
        // it round-trip. Mirrors the shared corpus fixture
        // 005-session-status-unknown-bits-preserved: 8|64|2^31 = 2147483720.
        val wire = "2147483720"
        val status = json.decodeFromString(SessionStatus.serializer(), wire)
        assertEquals(2147483720u, status.rawValue)
        assertTrue(SessionStatus.IN_PROGRESS in status)
        assertTrue(SessionStatus.IS_ARCHIVED in status)

        val reencoded = json.encodeToString(SessionStatus.serializer(), status)
        assertEquals(wire, reencoded)
    }

    @Test
    fun `bitset wire value is a plain JSON number`() {
        val parsed = json.parseToJsonElement("64") as JsonPrimitive
        assertEquals(64, parsed.int)
    }
}
