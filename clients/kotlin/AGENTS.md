# Kotlin Client — Agent Guide

## Overview

This directory contains the **Kotlin/JVM** client library for the Agent Host Protocol (AHP), distributed via Maven Central as `com.microsoft.agenthostprotocol:agent-host-protocol`.

The library targets pure Kotlin/JVM (Java 8 bytecode, JDK 17 toolchain) so it works for Android consumers, server-side JVM consumers, and KMP/JVM target consumers without any Android-specific dependencies. Only `kotlinx-serialization-json` is on the classpath at runtime.

## Code Generation

Types in `src/main/kotlin/com/microsoft/agenthostprotocol/generated/` are **auto-generated** from the TypeScript definitions in `types/`. Do not edit these files directly. Generated files are committed to source control so the package is consumable via Maven Central without a code-generation toolchain.

To regenerate after protocol changes:

```bash
npm run generate:kotlin    # runs: tsx scripts/generate.ts --kotlin
```

Generated files: `State`, `Commands`, `Actions`, `Errors`, `Messages`, `Notifications` — all suffixed `.generated.kt`.

CI verifies the committed generated files match the output of `npm run generate:kotlin` and fails on drift.

## Library structure

- `src/main/kotlin/com/microsoft/agenthostprotocol/Ahp.kt` — Hand-maintained entry point. Exposes the configured `kotlinx.serialization.json.Json` instance (`Ahp.json`) that consumers MUST use to encode/decode protocol messages. The custom `KSerializer`s for discriminated unions require a JSON-aware encoder/decoder, so generic `Json` instances may not work.
- `src/main/kotlin/com/microsoft/agenthostprotocol/Reducers.kt` — Hand-written pure reducers (`rootReducer`, `sessionReducer`, `chatReducer`, `terminalReducer`, `changesetReducer`, `annotationsReducer`, `resourceWatchReducer`) ported from `types/channels-*/reducer.ts`, plus a small `Reducer<S, A>` fun-interface and per-channel `object` wrappers. See [Reducers](#reducers) below.
- `src/main/kotlin/com/microsoft/agenthostprotocol/generated/` — Auto-generated wire types.
- `build.gradle.kts` — Gradle build config. Sets `jvmTarget = JVM_1_8` (Android-friendly) with a JDK 17 toolchain. Configures the Vanniktech `maven-publish` plugin for Sonatype Central Portal publishing. Also wires the absolute path of `types/test-cases/reducers/` into the test JVM as the `ahp.reducerFixturesDir` system property so `FixtureDrivenReducerTest` can load fixtures regardless of cwd.
- `gradle.properties` — Source of truth for the artifact's Maven coordinates (`GROUP`, `VERSION_NAME`) and POM metadata.
- `gradle/libs.versions.toml` — Version catalog (Kotlin, kotlinx.serialization, JUnit, Vanniktech plugin).

## Type mapping (TS → Kotlin)

| TypeScript                    | Kotlin                                                            |
| ----------------------------- | ----------------------------------------------------------------- |
| `string`                      | `String`                                                          |
| `number`                      | `Long` (TS contract: 64-bit ints)                                 |
| `number` w/ `@format float`   | `Double`                                                          |
| `boolean`                     | `Boolean`                                                         |
| `unknown` / `object`          | `kotlinx.serialization.json.JsonElement`                          |
| `T \| null`                   | `T?`                                                              |
| `T?` field / `T \| undefined` | `T? = null`                                                       |
| `T[]` / `Array<T>`            | `List<T>`                                                         |
| `Record<string, T>`           | `Map<String, T>`                                                  |
| `Partial<T>`                  | `PartialT` data class with all fields nullable                    |
| `enum E { A = "a" }`          | `@Serializable enum class E { @SerialName("a") A }`               |
| Bitset enum (JSDoc "Bitset")  | `@JvmInline value class` over `Int` w/ companion-object constants |
| Interface struct              | `@Serializable data class`                                        |
| Discriminated union           | sealed interface + custom `KSerializer` (mirrors Swift)           |
| `URI`                         | `typealias URI = String`                                          |
| `StringOrMarkdown`            | sealed interface w/ custom serializer                             |
| Recursive struct              | data class (heap-allocated by default)                            |
| `_meta` field                 | Kotlin `meta` + `@SerialName("_meta")`                            |
| `snake_case` wire field       | camelCase + `@SerialName("snake_case")`                           |

### Why custom union serializers (and not `@JsonClassDiscriminator`)

`@JsonClassDiscriminator` is the idiomatic kotlinx-serialization way to model discriminated unions, but it forbids the discriminator field from existing on the variant data class. Since our TS variant interfaces include their discriminator (e.g. `MarkdownResponsePart.kind = 'markdown'`), generating `@JsonClassDiscriminator`-based unions would require cross-cutting field filtering everywhere those interfaces appear. Mirroring Swift's manual sealed-union serializer keeps the variant data classes 1:1 with their TS counterparts.

A consequence: **always use `Ahp.json` (or a `Json` instance with `classDiscriminator` set to a sentinel value)** when encoding/decoding. The default kotlinx `"type"` discriminator collides with real `type` fields in our schema.

### Notifications are routed by JSON-RPC method, not by an embedded discriminator

Since the v0.2 channels reorg, server → client notifications are dispatched on the JSON-RPC `method` name (e.g. `root/sessionAdded`, `auth/required`, `otlp/exportLogs`) rather than on a `type` discriminator field. The generator therefore emits each notification payload as a plain `*Params` data class (no sealed-union wrapper). Consumers extract `method` from the JSON-RPC envelope themselves and decode the matching params type. The `action` notification is special-cased: its params are always `ActionEnvelope`.

### Multi-value discriminators

`SessionInputQuestion` is the one union where two wire `kind` values map to the same Kotlin data class:

- `kind: "number"` → `SessionInputQuestionNumber(SessionInputNumberQuestion(kind = NUMBER, ...))`
- `kind: "integer"` → `SessionInputQuestionNumber(SessionInputNumberQuestion(kind = INTEGER, ...))`

The custom serializer handles both wire values during decode; encode preserves whichever discriminator was set on the data class. Tests in `DiscriminatedUnionTest.kt` cover this case.

### Hand-rolled `ChangesetOperationTarget` union

The TS source models `ChangesetOperationTarget` as a discriminated union over two inline variant shapes that aren't exported as their own interfaces. The generator emits the whole subgraph — the sealed `ChangesetOperationTarget`, the two variant data classes (`ChangesetOperationResourceTarget` and `ChangesetOperationRangeTarget`), the `ChangesetOperationTargetRange` helper, and the custom serializer — by hand from `generateChangesetOperationTargetKotlin()` so the Kotlin wire surface stays aligned with the Swift and Rust clients.

### Bitset enums

`SessionStatus` is currently the only bitset enum in the protocol. It's emitted as a `@JvmInline value class` over `Int` so that **unknown future flags survive a decode/encode round-trip** without being silently dropped. Use `or`/`and`/`in` for combinator/containment ops:

```kotlin
val combined = SessionStatus.IDLE or SessionStatus.IS_READ
SessionStatus.IDLE in combined   // true
```

## Distribution

Artifacts are published to Maven Central (Sonatype Central Portal) via Microsoft's ESRP-backed `vscode-engineering` `maven-package` pipeline template on `kotlin/v*` git tags. The [`gradle-maven-publish-plugin`](https://github.com/vanniktech/gradle-maven-publish-plugin) (v0.36+) is used to stage the artifacts into a local Maven repository layout that ESRP then signs and uploads.

The release pipeline ([`clients/kotlin/pipeline.yml`](pipeline.yml)) is an Azure DevOps pipeline (GitHub Actions cannot trigger ADO in this repo — PATs are not permitted):

1. **Tag validation** — verifies the `kotlin/vX.Y.Z` tag matches `gradle.properties` `VERSION_NAME`, that the version is not `-SNAPSHOT`, and that `CHANGELOG.md` has a matching `## [X.Y.Z]` heading.
2. **Generator + Gradle check** — re-runs `npm run generate:kotlin` (fails on diff) and `./gradlew check`.
3. **Stage** — `./gradlew -Pahp.signPublications=false publishAllPublicationsToStagingRepository` writes a Maven layout to `build/maven-staging/`. Local PGP signing is skipped because ESRP signs server-side.
4. **ESRP publish** — the `maven-package` template hands the staging folder to ESRP (`contenttype: maven`), which signs and uploads to Maven Central via the Sonatype Central Portal.

No GitHub-side secrets are required — ESRP credentials live inside the Microsoft ADO tenant.

### Cutting a release

See [`RELEASING.md`](../../RELEASING.md) for the full release flow.
Summary, scoped to Kotlin:

1. Bump `VERSION_NAME` in `clients/kotlin/gradle.properties` (drop `-SNAPSHOT` for a public release; the version should match the `PROTOCOL_VERSION` in `types/version/registry.ts` when shipping a protocol-aligned drop, e.g. `0.2.0`).
2. Run `npm run generate:metadata` and commit the regenerated `clients/kotlin/release-metadata.json`.
3. Rotate the `## [Unreleased]` section of `clients/kotlin/CHANGELOG.md` to `## [X.Y.Z] — YYYY-MM-DD` with an `Implements AHP <version>` line. The publish workflow fails if no `## [X.Y.Z]` heading exists for the tag version.
4. Commit, merge to `main`.
5. Tag the merge commit using `kotlin/v` + the same version (e.g. `git tag kotlin/v0.2.0 && git push origin kotlin/v0.2.0`). The ADO publish pipeline rejects any mismatch between the tag and `VERSION_NAME`, and refuses `*-SNAPSHOT` tags outright.
6. The ADO pipeline runs, stages the Maven artifacts, and hands them to ESRP for signing and upload to Maven Central. With `automaticRelease = true` set in `mavenPublishing { ... }` and ESRP handling the publish, no manual Sonatype UI interaction is required.
7. Bump `VERSION_NAME` back to the next `-SNAPSHOT` for ongoing development.

## Building and testing locally

```bash
cd clients/kotlin
./gradlew build           # compile + tests + assemble
./gradlew test            # tests only
./gradlew publishToMavenLocal   # smoke-test publishing (skips signing if no key configured)
```

Requires a JDK 17+ on `JAVA_HOME`. Gradle wrapper handles everything else.

## Out of scope (intentional)

This package currently ships **wire types and pure reducers**. The following are deferred to follow-up PRs:

- Example Android app (analog of Swift's `AHPClient`)
- WebSocket transport / async client
- Kotlin Multiplatform (KMP) build — JVM target is sufficient for current Android consumers

## Reducers

`Reducers.kt` exposes pure reducer functions and their `object`-wrapped equivalents that conform to the `Reducer<S, A>` fun-interface:

```kotlin
public fun rootReducer(state: RootState, action: StateAction): RootState
public fun sessionReducer(state: SessionState, action: StateAction): SessionState
public fun chatReducer(state: ChatState, action: StateAction): ChatState
public fun terminalReducer(state: TerminalState, action: StateAction): TerminalState
public fun changesetReducer(state: ChangesetState, action: StateAction): ChangesetState
public fun annotationsReducer(state: AnnotationsState, action: StateAction): AnnotationsState
public fun resourceWatchReducer(state: ResourceWatchState, action: StateAction): ResourceWatchState

public fun interface Reducer<S, A> { public fun reduce(state: S, action: A): S }
public object RootReducer : Reducer<RootState, StateAction>      // delegates to rootReducer
public object SessionReducer : Reducer<SessionState, StateAction>
public object ChatReducer : Reducer<ChatState, StateAction>
public object TerminalReducer : Reducer<TerminalState, StateAction>
public object ChangesetReducer : Reducer<ChangesetState, StateAction>
public object AnnotationsReducer : Reducer<AnnotationsState, StateAction>
public object ResourceWatchReducer : Reducer<ResourceWatchState, StateAction>
```

Each reducer dispatches on the [`StateAction`] sealed interface and handles the action variants that belong to its channel. Actions belonging to other channels (or unknown `StateActionUnknown` variants returned by the wire-types decoder when the server sends a newer action type than this version of the client knows about) fall through to an `else -> state` no-op — this matches the forward-compatibility semantics of the canonical TypeScript and Swift reducers.

State-channel unions decoded inside actions follow the same principle: when the server emits a discriminator this client doesn't recognise (e.g. a future `ResponsePart` kind, `ToolCallState`, `Customization` type, etc.) the decoder lifts the raw JSON into an `XUnknown` variant rather than throwing. `StateActionUnknown` uses the same shape for unknown action types. Reducers treat these variants conservatively — `customizationId` returns `null` so an unknown container can't false-match a real id, `SessionCustomizationUpdated` short-circuits to NoOp when the payload is Unknown, and cancellation collapses unknown tool calls to empty cancelled state. These behaviours mirror the Rust reducer exactly.

### Hand-port from TypeScript

Each reducer is a direct hand-port of the corresponding file in `types/channels-*/reducer.ts`. Notable mechanical translations:

| TypeScript                                                  | Kotlin                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `{ ...state, foo: bar }`                                    | `state.copy(foo = bar)`                                                             |
| `delete next.inputRequests`                                 | `next.copy(inputRequests = null)` (collapses to absent on the wire via `explicitNulls = false`) |
| `arr.findIndex(...)` + splice in place                      | `arr.indexOfFirst { ... }` + `toMutableList().also { it[idx] = ... }`               |
| spread of conditional object: `...(opt ? { selectedOption: opt } : {})` | nullable field assignment: `selectedOption = opt`                       |
| `status & ~STATUS_ACTIVITY_MASK | activity`                 | `SessionStatus((status.rawValue and STATUS_ACTIVITY_MASK.inv()) or activity.rawValue)` |
| `if (action.confirmed)` (truthy check on optional enum)     | `if (action.confirmed != null)`                                                     |

The Kotlin port preserves Swift parity caveats already documented in PR #115:

1. **`T | null` vs `T?`** — both collapse to nullable Kotlin fields. With `explicitNulls = false`, both encode as absent.
2. **Discriminator validation** — no runtime check that, e.g., a `MarkdownResponsePart`'s `kind` matches `MARKDOWN`. Mirrors Swift. For forward-compat unions, an *unrecognised* discriminator decodes to the `XUnknown(val raw: JsonObject)` variant (mirrors Rust's `Unknown(serde_json::Value)`) and round-trips its raw payload on re-encode.
3. **`StateActionUnknown`** — captures the full raw JSON object of an unknown action (same shape as the state-channel `XUnknown` variants). The reducer treats it as a no-op. Re-encoding round-trips the original payload back to the wire.

### Injectable timestamp

The session reducer stamps `summary.modifiedAt` whenever it mutates fields that semantically advance the session's modification time (turn lifecycle, title change, agent change, customization update, input request changes, etc.). The stamp comes from a top-level `var`:

```kotlin
public var currentTimestampProvider: () -> Long = { System.currentTimeMillis() }
```

Tests override this with a constant to produce deterministic output, then restore the default in `@AfterEach`. The provider is global mutable state; if you parallelize tests across JVM threads, snap a value into a `ThreadLocal` first.

### Cross-language parity tests

`FixtureDrivenReducerTest` loads every fixture under `types/test-cases/reducers/*.json` and verifies that the Kotlin reducer's output matches the fixture's `expected` state. Fixtures are shared with the TypeScript, Swift, and Rust reducer impls, so this test is the primary cross-language parity gate.

The fixture path is wired into the test JVM via the `ahp.reducerFixturesDir` system property in `build.gradle.kts`, so the test works under `./gradlew test`, IDE runs that delegate to Gradle (the IntelliJ default), or CI without depending on the current working directory. When neither Gradle nor a delegating runner sets the property, the test falls back to walking upward from `user.dir` looking for `types/test-cases/reducers/`, so direct IDE JUnit runs from inside the repo still work.

A small `SKIPPED_FIXTURES` set carries any fixtures intentionally skipped because they exercise wire-type decoding behaviour this package doesn't yet support. The `coverageReport().decodable-fixture-budget` assertion bounds the skip set size so regressions surface in CI. The full reducer fixture corpus is currently covered (`SKIPPED_FIXTURES` is empty and `MAX_SKIPPED_FIXTURES = 0`). Forward-compat coverage for unknown discriminators on state-channel unions (`ResponsePart`, `ToolCallState`, `Customization`, …) is exercised by `103-delta-skips-parts-without-id.json` and the dedicated round-trip tests in `DiscriminatedUnionTest`.

### `ReducersTest`

`ReducersTest` covers a handful of behaviors that benefit from explicit local coverage: the `Reducer<S, A>` `object` wrappers delegating to the free functions, `terminal/input` being a no-op (returns the same instance), the queued message reorder algorithm (preserves messages not mentioned in `order`; ignores duplicates and unknown ids), pending steering vs. queued message upsert semantics, and the `currentTimestampProvider` override flowing through.
