package com.microsoft.agenthostprotocol

// RoundTripCorpusTest — data-driven wire round-trip parity for the Kotlin client.
//
// Loads the SHARED, language-agnostic round-trip corpus under
// types/test-cases/round-trips/*.json (the same fixtures the Go, Swift,
// TypeScript, and Rust clients run) and asserts each via the REAL generated
// Kotlin wire types + kotlinx.serialization + Ahp.json.
// No mocks, no faked SUT: every fixture decodes real bytes into a real type and
// re-encodes with Ahp.json.
//
// Each fixture has the shape:
//   { "name": ..., "description": ..., "group": ..., "type": ...,
//     "input": <wire JSON value>,
//     "acceptableOutputs": [ <exactly one canonical re-encoded value> ],
//     "preservedOutput": <TypeScript-preserved form (group B only, unused here)> }
//
// Group A: all clients agree — assert acceptableOutputs[0].
// Group B: runtime-decoder clients drop unknown keys — assert acceptableOutputs[0].
//          (TypeScript asserts preservedOutput instead; irrelevant to Kotlin.)
// Kotlin is always a runtime decoder → always asserts acceptableOutputs[0].
//
// Run:
//   JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
//   ./gradlew test --rerun-tasks \
//   --tests com.microsoft.agenthostprotocol.RoundTripCorpusTest
//
// Real-execution: no mocks. Every fixture decodes with Ahp.json into the real
// generated types and re-encodes with Ahp.json.

import com.microsoft.agenthostprotocol.generated.ActionEnvelope
import com.microsoft.agenthostprotocol.generated.ChangesetOperationTarget
import com.microsoft.agenthostprotocol.generated.Customization
import com.microsoft.agenthostprotocol.generated.Implementation
import com.microsoft.agenthostprotocol.generated.InitializeResult
import com.microsoft.agenthostprotocol.generated.JsonRpcErrorResponse
import com.microsoft.agenthostprotocol.generated.JsonRpcNotification
import com.microsoft.agenthostprotocol.generated.JsonRpcRequest
import com.microsoft.agenthostprotocol.generated.JsonRpcSuccessResponse
import com.microsoft.agenthostprotocol.generated.PartialSessionSummary
import com.microsoft.agenthostprotocol.generated.SessionAddedParams
import com.microsoft.agenthostprotocol.generated.ChatInputQuestion
import com.microsoft.agenthostprotocol.generated.SessionStatus
import com.microsoft.agenthostprotocol.generated.SessionSummary
import com.microsoft.agenthostprotocol.generated.StateAction
import com.microsoft.agenthostprotocol.generated.StringOrMarkdown
import java.io.File
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Data-driven round-trip corpus parity test for the Kotlin client.
 *
 * Loads corpus fixtures from `types/test-cases/round-trips/`, decodes each
 * `input` through the real generated Kotlin type named by `type`, re-encodes
 * via [Ahp.json], and asserts structural equality to `acceptableOutputs[0]`.
 *
 * The fixture directory is located by:
 *  1. The `ahp.roundTripFixturesDir` system property (set automatically by
 *     `build.gradle.kts` for Gradle runs, including IDE runs that delegate to Gradle).
 *  2. Fallback: walk upward from `user.dir` looking for `types/test-cases/round-trips/`.
 */
class RoundTripCorpusTest {

    private val json: Json = Ahp.json

    // ─── Fixture directory ────────────────────────────────────────────────────

    private fun fixtureDir(): File {
        val fromProperty = System.getProperty("ahp.roundTripFixturesDir")?.let(::File)
        if (fromProperty != null) {
            assertTrue(
                fromProperty.isDirectory,
                "ahp.roundTripFixturesDir points to '${fromProperty.path}' which is not a directory",
            )
            return fromProperty
        }
        // Fallback: walk upward from cwd.
        val cwd = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var dir: File? = cwd
        while (dir != null) {
            val candidate = File(dir, "types/test-cases/round-trips")
            if (candidate.isDirectory) return candidate
            dir = dir.parentFile
        }
        error(
            "Could not locate the round-trip fixtures directory. Set the " +
                "'ahp.roundTripFixturesDir' system property (Gradle does this " +
                "automatically), or run tests from somewhere inside the repo " +
                "checkout containing 'types/test-cases/round-trips/'.",
        )
    }

    private fun loadFixtures(): List<Pair<File, JsonObject>> {
        val dir = fixtureDir()
        val files = dir.listFiles { f -> f.isFile && f.name.endsWith(".json") }
            ?.sortedBy { it.name }
            ?: return emptyList()
        // Permissive Json to parse the fixture structure itself (not Ahp.json).
        val fixtureJson = Json { ignoreUnknownKeys = true }
        return files.map { file ->
            val obj = fixtureJson.parseToJsonElement(file.readText()).jsonObject
            file to obj
        }
    }

    // ─── Loaded-something guard ───────────────────────────────────────────────

    @Test
    fun `corpus is present`() {
        val fixtures = loadFixtures()
        assertTrue(
            fixtures.isNotEmpty(),
            "No round-trip fixtures found at ${fixtureDir().absolutePath}. " +
                "Ensure the repo checkout includes types/test-cases/round-trips/.",
        )
    }

    // ─── Whole-corpus runner ──────────────────────────────────────────────────

    @TestFactory
    fun `round-trip corpus decodes and re-encodes via the real generated types`(): List<DynamicTest> {
        val fixtures = loadFixtures()
        return fixtures.map { (file, fixture) ->
            DynamicTest.dynamicTest(file.name) {
                runFixture(file, fixture)
            }
        }
    }

    // ─── Per-fixture runner ───────────────────────────────────────────────────

    private fun runFixture(file: File, fixture: JsonObject) {
        val typeName = fixture["type"]?.jsonPrimitive?.contentOrNull
            ?: fail("${file.name}: missing `type`")
        val inputElement = fixture["input"]
            ?: fail("${file.name}: missing `input`")
        val acceptableOutputsArray = fixture["acceptableOutputs"]?.jsonArray
            ?: fail("${file.name}: missing or non-array `acceptableOutputs`")

        assertTrue(
            acceptableOutputsArray.isNotEmpty(),
            "${file.name}: fixture made no assertions — `acceptableOutputs` is empty",
        )

        // Enforce single canonical form.
        assertEquals(
            1,
            acceptableOutputsArray.size,
            "${file.name}: acceptableOutputs must have exactly 1 entry (the single canonical " +
                "re-encoded form); got ${acceptableOutputsArray.size}. " +
                "Multiple entries cement divergence instead of fixing it.",
        )

        // Honor notApplicable (legacy). Kotlin is never listed there, but parse defensively.
        val notApplicable = fixture["notApplicable"]?.jsonArray
            ?.mapNotNull { it.jsonPrimitive.contentOrNull }
            ?: emptyList()
        if ("kotlin" in notApplicable) {
            println("⊘ ${file.name}: not applicable to kotlin (legacy notApplicable)")
            return
        }

        // Kotlin is a runtime decoder → always asserts acceptableOutputs[0] (both groups A and B).
        val inputJson = Json.encodeToString(kotlinx.serialization.serializer<JsonElement>(), inputElement)
        val reencoded: JsonElement = decodeAndReencode(file.name, typeName, inputJson)

        val canonical = acceptableOutputsArray[0]

        // Structural equality: compare both sides via key-sorted JSON.
        val reencodedNorm = canonicalJson(reencoded)
        val expectedNorm = canonicalJson(canonical)

        assertEquals(
            expectedNorm,
            reencodedNorm,
            "${file.name}: re-encoded output does not match the canonical acceptableOutput.\n" +
                "  got:      $reencodedNorm\n" +
                "  expected: $expectedNorm",
        )
    }

    // ─── Real decode dispatch ────────────────────────────────────────────────

    /**
     * Decodes [inputJson] into the real generated Kotlin type named by [typeName]
     * and re-encodes with [Ahp.json]. Adding a wire type to the corpus is a
     * deliberate edit here — the corpus never decodes arbitrary types reflectively.
     */
    private fun decodeAndReencode(file: String, typeName: String, inputJson: String): JsonElement {
        fun <T> rt(serializer: KSerializer<T>): JsonElement {
            val decoded = try {
                json.decodeFromString(serializer, inputJson)
            } catch (t: Throwable) {
                fail("$file: decode $typeName: ${t.message}")
            }
            return try {
                json.encodeToJsonElement(serializer, decoded)
            } catch (t: Throwable) {
                fail("$file: re-encode $typeName: ${t.message}")
            }
        }

        return when (typeName) {
            "ActionEnvelope" -> rt(ActionEnvelope.serializer())
            "StateAction" -> rt(StateAction.serializer())
            "Customization" -> rt(Customization.serializer())
            // SessionStatus decodes via the REAL generated value class — no Long sidestep.
            // The widened SessionStatus wraps a Long, so it holds bitset combinations (004)
            // and unknown high bits (005, value 2147483720 > Int.MAX) and re-encodes as the
            // same JSON number. Decoding via a bare Long would bypass the real wire type.
            "SessionStatus" -> rt(SessionStatus.serializer())
            "StringOrMarkdown" -> rt(StringOrMarkdown.serializer())
            "JsonRpcMessage" -> {
                // Dispatch to the real generated variant class based on JSON shape,
                // mirroring the JSON-RPC 2.0 discriminant rules:
                //   has "error"          → JsonRpcErrorResponse
                //   has "result"         → JsonRpcSuccessResponse
                //   has "id" + "method"  → JsonRpcRequest
                //   else (method only)   → JsonRpcNotification
                val inputObj = json.parseToJsonElement(inputJson).let { it as? JsonObject }
                    ?: fail("$file: JsonRpcMessage input is not a JSON object")
                when {
                    inputObj.containsKey("error") ->
                        rt(JsonRpcErrorResponse.serializer())
                    inputObj.containsKey("result") ->
                        rt(JsonRpcSuccessResponse.serializer(JsonElement.serializer()))
                    inputObj.containsKey("id") && inputObj.containsKey("method") ->
                        rt(JsonRpcRequest.serializer(JsonElement.serializer()))
                    else ->
                        rt(JsonRpcNotification.serializer(JsonElement.serializer()))
                }
            }
            "ChangesetOperationTarget" -> rt(ChangesetOperationTarget.serializer())
            "ChatInputQuestion" -> rt(ChatInputQuestion.serializer())
            "SessionSummary" -> rt(SessionSummary.serializer())
            "SessionAddedParams" -> rt(SessionAddedParams.serializer())
            "PartialSessionSummary" -> rt(PartialSessionSummary.serializer())
            "Implementation" -> rt(Implementation.serializer())
            "InitializeResult" -> rt(InitializeResult.serializer())
            else -> fail(
                "$file: unknown wire type \"$typeName\". " +
                    "Add a decode entry to decodeAndReencode.",
            )
        }
    }

    // ─── Structural JSON equality ─────────────────────────────────────────────

    /**
     * Returns a key-sorted JSON representation of [element] for structural comparison.
     * Key order is normalized (sorted) so object key order doesn't affect equality.
     * Null values and absent keys remain distinct (a null value does NOT equal absent).
     */
    private fun canonicalJson(element: JsonElement): String = buildString { appendSorted(element) }

    private fun StringBuilder.appendSorted(element: JsonElement) {
        when (element) {
            is JsonObject -> {
                append('{')
                val sorted = element.entries.sortedBy { it.key }
                sorted.forEachIndexed { idx, (k, v) ->
                    if (idx > 0) append(',')
                    // Encode key as a JSON string (quoted, with escaping).
                    append(Json.encodeToString(kotlinx.serialization.serializer<String>(), k))
                    append(':')
                    appendSorted(v)
                }
                append('}')
            }
            is JsonArray -> {
                append('[')
                element.forEachIndexed { idx, v ->
                    if (idx > 0) append(',')
                    appendSorted(v)
                }
                append(']')
            }
            is kotlinx.serialization.json.JsonPrimitive -> {
                // Normalize: whole-number floats (e.g. "10.0") compare equal to integers ("10").
                // This handles the Kotlin Double serialization case where @format-float fields
                // like SessionInputNumberQuestion.min serialize 10 as 10.0.
                // Null vs absent is NOT normalized: null primitives stay as "null".
                if (element.isString) {
                    append(element.toString())
                } else {
                    val raw = element.content
                    val asDouble = raw.toDoubleOrNull()
                    if (asDouble != null && asDouble.isFinite() && asDouble % 1.0 == 0.0) {
                        val asLong = asDouble.toLong()
                        append(asLong.toString())
                    } else {
                        append(raw)
                    }
                }
            }
        }
    }
}
