package com.microsoft.agenthostprotocol

import com.microsoft.agenthostprotocol.generated.ChatState
import com.microsoft.agenthostprotocol.generated.ChangesetState
import com.microsoft.agenthostprotocol.generated.AnnotationsState
import com.microsoft.agenthostprotocol.generated.ResourceWatchState
import com.microsoft.agenthostprotocol.generated.RootState
import com.microsoft.agenthostprotocol.generated.SessionState
import com.microsoft.agenthostprotocol.generated.StateAction
import com.microsoft.agenthostprotocol.generated.TerminalState
import java.io.File
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertAll
import org.junit.jupiter.api.fail
import kotlin.test.assertTrue

/**
 * JSON-fixture-driven reducer tests for cross-language parity.
 *
 * Loads test cases from `types/test-cases/reducers/` (shared with the
 * TypeScript / Rust / Swift reducer impls) and verifies that the Kotlin
 * reducers produce identical output.
 *
 * The fixture directory is located by:
 *
 * 1. The `ahp.reducerFixturesDir` system property if set — this is wired
 *    up automatically by `build.gradle.kts` when tests are run via
 *    Gradle (including IDE runs that delegate to Gradle, which is the
 *    IntelliJ default for Gradle projects).
 * 2. Otherwise, by walking upward from `user.dir` looking for a
 *    directory containing `types/test-cases/reducers/`. This makes
 *    direct IDE test runs (e.g. with the JUnit runner instead of the
 *    Gradle delegating runner) work without extra configuration as long
 *    as `user.dir` is inside the repo.
 *
 * To run only this class:
 * ```
 * ./gradlew test --tests com.microsoft.agenthostprotocol.FixtureDrivenReducerTest
 * ```
 */
class FixtureDrivenReducerTest {

    private var originalProvider: (() -> Long)? = null

    @BeforeEach
    fun mockTimestamp() {
        // Match the TypeScript test mock (`Date.now = () => 9999`) so chat
        // fixtures assert the corresponding ISO `modifiedAt` value.
        originalProvider = currentTimestampProvider
        currentTimestampProvider = { MOCK_NOW }
    }

    @AfterEach
    fun restoreTimestamp() {
        originalProvider?.let { currentTimestampProvider = it }
        originalProvider = null
    }

    @TestFactory
    fun allFixtures(): List<DynamicTest> {
        val fixtures = loadFixtures()
        assertTrue(
            fixtures.isNotEmpty(),
            "No reducer fixtures found at ${fixtureDir().absolutePath}. " +
                "Ensure the repo checkout includes types/test-cases/reducers/.",
        )
        return fixtures.map { (file, fixture) ->
            DynamicTest.dynamicTest("${file.name}: ${fixture["description"]?.jsonPrimitiveContent()}") {
                runFixture(file, fixture)
            }
        }
    }

    @TestFactory
    fun coverageReport(): List<DynamicTest> {
        // A standalone factory test that asserts the fixture corpus exists
        // and reports any fixtures that we silently skip (e.g. because they
        // exercise types Kotlin can't decode yet). Helps reviewers see when
        // skipped counts drift across protocol revisions.
        val all = loadFixtures()
        val byReducer = all.groupBy { (_, fx) ->
            fx["reducer"]?.jsonPrimitiveContent() ?: "<unknown>"
        }
        val coveragePerReducer = byReducer.entries.sortedBy { it.key }.map { (reducer, list) ->
            DynamicTest.dynamicTest("coverage[$reducer]") {
                assertTrue(list.isNotEmpty(), "No fixtures for reducer '$reducer'")
            }
        }
        // Bound the number of skipped fixtures so we notice if a future
        // refactor accidentally bypasses more coverage than we intend.
        val skipCap = DynamicTest.dynamicTest("decodable-fixture-budget") {
            val skipped = all.count { (_, fx) -> SKIPPED_FIXTURES.contains(fx["description"]?.jsonPrimitiveContent()) }
            assertTrue(
                skipped <= MAX_SKIPPED_FIXTURES,
                "Skipped $skipped fixtures, expected at most $MAX_SKIPPED_FIXTURES. " +
                    "Update SKIPPED_FIXTURES / MAX_SKIPPED_FIXTURES intentionally if growing the skip set.",
            )
        }
        return coveragePerReducer + skipCap
    }

    private fun runFixture(file: File, fixture: JsonObject) {
        val reducer = fixture["reducer"]?.jsonPrimitiveContent()
            ?: fail("${file.name}: missing 'reducer' field")
        val description = fixture["description"]?.jsonPrimitiveContent()
        val initial = fixture["initial"] ?: fail("${file.name}: missing 'initial' field")
        val actionsArr = fixture["actions"] ?: fail("${file.name}: missing 'actions' field")
        val expected = fixture["expected"] ?: fail("${file.name}: missing 'expected' field")

        // A handful of fixtures exercise types the current Kotlin wire-types
        // package can't decode losslessly (e.g. forward-compat for unknown
        // ResponsePart discriminators). Skip them by design and keep the
        // skip set tight via the `coverageReport().decodable-fixture-budget`
        // assertion. Mirrors Swift's `DecodingError`-based skip behavior.
        if (description != null && description in SKIPPED_FIXTURES) {
            org.junit.jupiter.api.Assumptions.abort<Unit>(
                "Skipped: ${file.name} ($description) — see SKIPPED_FIXTURES in FixtureDrivenReducerTest.",
            )
        }

        val actions = Ahp.json.decodeFromJsonElement(
            ListSerializer(StateAction.serializer()),
            actionsArr,
        )

        when (reducer) {
            "root" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = RootState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = rootReducer(s, action)
                    s
                },
            )

            "session" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = SessionState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = sessionReducer(s, action)
                    s
                },
            )

            "chat" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = ChatState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = chatReducer(s, action)
                    s
                },
            )

            "terminal" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = TerminalState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = terminalReducer(s, action)
                    s
                },
            )

            "changeset" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = ChangesetState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = changesetReducer(s, action)
                    s
                },
            )

            "annotations" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = AnnotationsState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = annotationsReducer(s, action)
                    s
                },
            )

            "resourceWatch" -> compareFixture(
                file = file,
                initial = initial,
                expected = expected,
                serializer = ResourceWatchState.serializer(),
                run = { state ->
                    var s = state
                    for (action in actions) s = resourceWatchReducer(s, action)
                    s
                },
            )

            else -> fail("${file.name}: unsupported reducer '$reducer'")
        }
    }

    /**
     * Decodes [initial] through [serializer], runs the reducer pipeline,
     * decodes [expected] through the same serializer (to normalise the
     * shape — drop fields Kotlin doesn't model, collapse explicit `null`
     * to absent via `explicitNulls = false`), and compares the two as
     * [JsonElement]s without any further normalisation.
     *
     * NB: we do *not* recursively strip `null` from the comparison side.
     * That would mask cases where a reducer accidentally writes `JsonNull`
     * into a `JsonElement` payload (e.g. `_meta`, `edits`, structured
     * content). `explicitNulls = false` on `Ahp.json` already drops
     * nullable Kotlin properties whose runtime value is `null`, which is
     * what the TS `undefined` ⇒ absent semantics require.
     */
    private fun <T> compareFixture(
        file: File,
        initial: JsonElement,
        expected: JsonElement,
        serializer: kotlinx.serialization.KSerializer<T>,
        run: (T) -> T,
    ) {
        val initialState = try {
            Ahp.json.decodeFromJsonElement(serializer, initial)
        } catch (t: Throwable) {
            fail("${file.name}: failed to decode initial: ${t.message}", t)
        }
        val finalState = run(initialState)
        val actualJson = Ahp.json.encodeToJsonElement(serializer, finalState)

        val expectedState = try {
            Ahp.json.decodeFromJsonElement(serializer, expected)
        } catch (t: Throwable) {
            fail("${file.name}: failed to decode expected: ${t.message}", t)
        }
        val expectedJson = Ahp.json.encodeToJsonElement(serializer, expectedState)

        if (actualJson != expectedJson) {
            fail(
                buildString {
                    appendLine("${file.name}: state mismatch")
                    appendLine("expected:")
                    appendLine(prettyPrint(expectedJson))
                    appendLine("actual:")
                    appendLine(prettyPrint(actualJson))
                },
            )
        }
    }

    private fun prettyPrint(element: JsonElement): String =
        Ahp.prettyJson.encodeToString(JsonElement.serializer(), element)

    @Test
    fun `fixtureDir falls back to walking up from cwd when system property is unset`() {
        // Direct-IDE-run safety net: even without Gradle's system property
        // wiring, fixtureDir() should still locate the shared fixtures by
        // walking upward from cwd. This covers IDE test runners that don't
        // delegate to Gradle.
        val savedProperty = System.getProperty("ahp.reducerFixturesDir")
        System.clearProperty("ahp.reducerFixturesDir")
        try {
            val dir = fixtureDir()
            assertTrue(dir.isDirectory, "fallback returned non-directory: ${dir.path}")
            assertTrue(
                dir.toPath().endsWith(File("types/test-cases/reducers").toPath()),
                "fallback returned unexpected path: ${dir.path}",
            )
        } finally {
            if (savedProperty != null) System.setProperty("ahp.reducerFixturesDir", savedProperty)
        }
    }



    private fun loadFixtures(): List<Pair<File, JsonObject>> {
        val dir = fixtureDir()
        val files = dir.listFiles { f -> f.isFile && f.name.endsWith(".json") }
            ?.sortedBy { it.name }
            ?: return emptyList()
        return files.map { file ->
            val obj = Ahp.json.parseToJsonElement(file.readText()).jsonObject
            file to obj
        }
    }

    private fun fixtureDir(): File {
        val fromProperty = System.getProperty("ahp.reducerFixturesDir")?.let(::File)
        if (fromProperty != null) {
            assertTrue(
                fromProperty.isDirectory,
                "ahp.reducerFixturesDir points to '${fromProperty.path}' which is not a directory",
            )
            return fromProperty
        }
        // Fallback: walk upward from cwd looking for the well-known fixtures
        // path. Lets non-Gradle IDE test runners work without manual config
        // (Gradle-delegated IDE runs always have the system property set).
        val cwd = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var dir: File? = cwd
        while (dir != null) {
            val candidate = File(dir, "types/test-cases/reducers")
            if (candidate.isDirectory) return candidate
            dir = dir.parentFile
        }
        error(
            "Could not locate the reducer fixtures directory. Set the " +
                "'ahp.reducerFixturesDir' system property (Gradle does this " +
                "automatically), or run tests from somewhere inside the repo " +
                "checkout containing 'types/test-cases/reducers/'. " +
                "Searched upward from '${cwd.path}'.",
        )
    }

    private companion object {
        // Matches the TypeScript test mock: Date.now = () => 9999.
        private const val MOCK_NOW: Long = 9999L

        /**
         * Fixture descriptions intentionally skipped because they exercise
         * decoding behaviour the generated wire types in this package do
         * not yet support. Each entry is keyed by the fixture's top-level
         * `description` field so re-numbering or splitting JSON files
         * doesn't silently change what is skipped. As of this writing the
         * full reducer fixture corpus is covered (zero skipped).
         */
        private val SKIPPED_FIXTURES: Set<String> = emptySet()

        /**
         * Upper bound on how many fixtures may be skipped. Raising this
         * requires a corresponding entry in [SKIPPED_FIXTURES]; lowering
         * it requires removing one.
         */
        private const val MAX_SKIPPED_FIXTURES: Int = 0
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

private fun JsonElement.jsonPrimitiveContent(): String? =
    (this as? kotlinx.serialization.json.JsonPrimitive)?.content

internal val Ahp.prettyJson: kotlinx.serialization.json.Json
    get() = kotlinx.serialization.json.Json(Ahp.json) { prettyPrint = true }
