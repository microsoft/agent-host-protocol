package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.negotiateProtocolVersion
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class VersionNegotiationTest {
    @Test
    fun sharedCorpus() {
        val reducers = File(requireNotNull(System.getProperty("ahp.reducerFixturesDir")))
        val cases = Json.parseToJsonElement(File(reducers.parentFile, "version-negotiation.json").readText()).jsonArray
        assertFalse(cases.isEmpty())
        for (fixture in cases) {
            val item = fixture.jsonObject
            val offered = item.getValue("offered").jsonArray.map { it.jsonPrimitive.content }
            if (item["invalid"]?.jsonPrimitive?.booleanOrNull == true) {
                assertThrows(IllegalArgumentException::class.java) { negotiateProtocolVersion(offered) }
            } else {
                assertEquals(item["expected"]?.jsonPrimitive?.contentOrNull, negotiateProtocolVersion(offered))
            }
        }
    }
}
