# Kotlin client for the Agent Host Protocol

[![Maven Central](https://img.shields.io/maven-central/v/com.microsoft.agenthostprotocol/agent-host-protocol)](https://central.sonatype.com/artifact/com.microsoft.agenthostprotocol/agent-host-protocol)

Pure Kotlin/JVM client library providing auto-generated wire types for the
[Agent Host Protocol](https://microsoft.github.io/agent-host-protocol/). Designed to
be consumed unmodified from Android apps, server-side JVM services, and
KMP/JVM target consumers.

- **Pure Kotlin/JVM** — no Android SDK dependencies; targets Java 8 bytecode
  (built with JDK 17 toolchain) so no AGP version requirement, no core library
  desugaring, no minimum Android API level beyond what kotlinx.serialization
  already requires.
- **Auto-generated** from the canonical TypeScript protocol definitions in the
  parent repo. Generated sources are committed so consumers don't need a
  TypeScript or `tsx` toolchain.
- **`kotlinx.serialization`-native** with idiomatic sealed interfaces for
  every discriminated union, `value class` bitset enums, and nullable types
  for optional fields.

## Installation

Add the dependency to your Android or JVM project:

### Gradle (Kotlin DSL)

```kotlin
dependencies {
    implementation("com.microsoft.agenthostprotocol:agent-host-protocol:0.2.0")
}
```

### Gradle (Groovy DSL)

```groovy
dependencies {
    implementation 'com.microsoft.agenthostprotocol:agent-host-protocol:0.2.0'
}
```

### Maven

```xml
<dependency>
    <groupId>com.microsoft.agenthostprotocol</groupId>
    <artifactId>agent-host-protocol</artifactId>
    <version>0.2.0</version>
</dependency>
```

The library transitively depends on `org.jetbrains.kotlinx:kotlinx-serialization-json`
(`api` scope) — you do not need to declare it separately. You DO need to apply the
[kotlin-serialization Gradle plugin](https://kotlinlang.org/docs/serialization.html#example-json-serialization)
in any module that defines its own `@Serializable` classes alongside this library, but
you do **not** need it just to consume the generated AHP types.

## Usage

Always use the pre-configured `Ahp.json` instance (or a `kotlinx.serialization.json.Json`
instance with the same settings). The custom serializers for AHP discriminated unions
require the JSON-aware encoder/decoder.

```kotlin
import com.microsoft.agenthostprotocol.Ahp
import com.microsoft.agenthostprotocol.generated.ActionEnvelope
import com.microsoft.agenthostprotocol.generated.StateAction
import com.microsoft.agenthostprotocol.generated.StateActionUnknown

// Decode a server-sent action envelope from the wire. Since the v0.2 channels
// reorg, every action carries the `channel` URI it belongs to; per-session
// actions like `session/titleChanged` no longer include the session URI in
// their payload.
val envelope: ActionEnvelope = Ahp.json.decodeFromString(
    ActionEnvelope.serializer(),
    """{"channel":"ahp-session:/abc","action":{"type":"session/titleChanged","title":"new"},"serverSeq":42}""",
)

println(envelope.channel)           // ahp-session:/abc
println(envelope.serverSeq)         // 42
when (val action = envelope.action) {
    is StateActionUnknown -> {
        // Future protocol versions: a no-op fall-through is required so
        // older clients can keep applying actions they DO understand.
    }
    else -> { /* handle each action subtype as needed */ }
}
```

When migrating to a release with typed file-edit models, see the
[file-edit migration guide](../../docs/guide/changesets.md#typed-file-edit-models).
It covers the new model names, constructor and property changes, and decoding
behavior. This is a client API migration, not a new JSON protocol.

### What's in the box

- **`com.microsoft.agenthostprotocol.Ahp`** — `Ahp.json` configured `Json` instance.
- **`com.microsoft.agenthostprotocol.generated.*`** — wire types: `RootState`,
  `SessionState`, `ChangesetState`, `TerminalState`, `AgentInfo`, `AgentSelection`,
  `ActionEnvelope` (with `channel` URI), all command params/results
  (`InitializeParams`, `CreateSessionParams`, `SubscribeParams`,
  `InvokeChangesetOperationParams`, etc.), every per-channel action type
  (`session/*`, `root/*`, `terminal/*`, `changeset/*`), and discriminated-union
  sealed interfaces (`StateAction`, `ResponsePart`, `ToolCallState`,
  `ToolResultContent`, `MessageAttachment`, `SnapshotState`,
  `ChangesetOperationTarget`, `ReconnectResult`, etc.).
- **Pure reducers** — top-level `rootReducer`, `sessionReducer`,
  `terminalReducer`, and `changesetReducer` functions (plus a
  `Reducer<S, A>` fun-interface wrapped as `RootReducer` / `SessionReducer`
  / `TerminalReducer` / `ChangesetReducer` objects) that produce the next
  state from the current state and an applied action. Behavior parity with
  the canonical TypeScript reducers is verified against the shared
  `types/test-cases/reducers/` fixture corpus.
- **Channel-scoped notification params** — `SessionAddedParams`,
  `SessionRemovedParams`, `SessionSummaryChangedParams`, `AuthRequiredParams`,
  `OtlpExportLogsParams`, etc. Notifications are routed by their JSON-RPC
  `method` name (e.g. `root/sessionAdded`, `auth/required`,
  `otlp/exportLogs`) — there is no embedded `type` discriminator union.
- **JSON-RPC envelope types** (`JsonRpcRequest<P>`, `JsonRpcResponse`, etc.) and
  helpers (`AhpCommands.initialize(id, params)`).

### What's NOT in the box (yet)

- A WebSocket / network transport — bring your own (e.g. OkHttp, Ktor).
- An example Android client — see the Swift `AHPClient` example for the architecture
  pattern; a Kotlin/Android equivalent is planned for a follow-up release.

## Protocol version mapping

Two constants in `com.microsoft.agenthostprotocol.generated` track which
protocol version this library implements:

- `PROTOCOL_VERSION` — SemVer string for the version this library's
  source tree implements.
- `SUPPORTED_PROTOCOL_VERSIONS` — every version this library is willing
  to negotiate (most-preferred-first). Pass it as `protocolVersions` on
  `InitializeParams`.

The same information is mirrored, in machine-readable form, in
[`release-metadata.json`](release-metadata.json) and, in human-readable
form, in [`CHANGELOG.md`](CHANGELOG.md). CI verifies all three sources
agree on every PR.

## Building from source

Requires JDK 17+ on `JAVA_HOME`. Gradle wrapper handles everything else.

```bash
cd clients/kotlin
./gradlew build
```

To regenerate the wire types from the TypeScript protocol definitions
(requires Node.js for the generator):

```bash
# from the repo root
npm install
npm run generate:kotlin
```

CI verifies committed sources match the generator output — see
[`AGENTS.md`](AGENTS.md) for details on the generator and release pipeline.

## License

MIT — see [`LICENSE`](../../LICENSE).
