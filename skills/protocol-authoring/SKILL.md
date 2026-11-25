---
name: protocol-authoring
description: Design and evolve canonical AHP protocol types, reducers, and documentation under types/ and docs/. Covers AHP doctrine, naming conventions, discriminated unions, enum compatibility tags, bitsets, keyed-collection actions, preserving named protocol object types, regenerating all 6 clients, and running Podman verification toolchains. Use before editing types/ or protocol specification docs.
---

# Authoring AHP Protocol Changes

Follow these rules whenever you add, change, or document protocol types under
`types/` or protocol specification/guide prose under `docs/`.

## Design & naming foundations

- Treat [AHP Doctrine](../../docs/guide/doctrine.md) as the design compass for
  protocol changes. Before adding or changing protocol types, check the
  doctrine's principles and design tests: durable user-visible results should
  be represented in state, the host should remain authoritative, minimal
  clients should keep a coherent experience, and agent implementation details
  should stay behind the host boundary.
- Name things using the [protocol naming dictionary](./naming.md): reuse its
  established terms, identifier and unit conventions, and message-naming
  patterns, and don't copy the legacy names it lists.
- Always prefer dispatching state actions (that can cause side effects) rather
  than making imperative RPC calls. For example, rather than a `sendMessage`
  command, we have a `session/turnStarted` message.
- Never update `PROTOCOL_VERSION` unless you were explicitly instructed to do
  so.

## Type modeling rules

### Make invalid states inexpressible

Don't write mutually dependent optional fields:

```ts
interface IApproval {
  denied: boolean;
  reason?: string; // only present if denied=true
}
```

Instead, use a discriminated union:

```ts
interface IDenial {
  denied: true;
  reason: string;
}
interface IApproval {
  denied: false;
}
type IApproval = IDenial | IApproval;
```

Or inline a single optional field when its presence carries the state:

```ts
interface IApproval {
  deniedReason?: string; // if present, implies denied
}
```

### Preserve protocol object types

- For new or changed protocol objects with a fixed schema, prefer named,
  reusable types in `types/` and generated native models. Do not replace a
  known shape with raw JSON to work around a generator gap.
- Reserve raw JSON (`Record<string, unknown>` / `unknown`) for intentionally
  open data, such as `_meta`, JSON Schema and tool payloads, provider
  extensions, and unknown variants.
- Update the canonical definitions and each affected generator. **Do not
  hand-edit generated files** (`**/generated/**`). Preserve wire names,
  nesting, optionality, numeric mappings, and collection wrappers such as
  `{ items: ... }`.
- Check source and binary compatibility separately from JSON compatibility.
  Define an explicit migration for public API changes. Keep native decoding
  errors visible. Cover known shapes with shared round-trip fixtures under
  `types/test-cases/round-trips/`, not per-language serialization tests.

### Numbers, enums, bitsets, and wrappers

- `number` types are assumed to be 64-bit integers. Carry `@integer` in JSDoc
  so JSON Schema emits `type: "integer"`. If floating-point values are
  reasonable for a field, annotate its JSDoc with `@format float`.
- Every protocol `enum` declaration MUST carry exactly one JSDoc compatibility
  annotation: use `@nonexhaustive` when later protocol versions may add wire
  values (clients preserve unknown raw values), and `@exhaustive` only when an
  unknown value is invalid and clients must reject it. The generators validate
  this contract and use it for both raw enums and discriminated unions.
- Numeric flag enums MUST carry `@bitset` in their main JSDoc block. Members
  must be unsigned 32-bit integers; combinations and unknown bits remain valid
  wire values. Generators use this tag, not description prose, to identify
  bitsets and include each named flag's value and documentation in JSON Schema.
- For actions or commands that could be implemented by returning an array
  `T[]` directly, still prefer to wrap it in a named interface `{ items: T[] }`
  for forward compatibility so additional fields can be added later without
  breaking the shape.

### Unknown-member preservation (`@preserveUnknownMembers`)

**Default: do not add `@preserveUnknownMembers`.** Strongly-typed SDK decoders
(Rust, Swift, Kotlin, Go, .NET) intentionally ignore and discard unrecognized
JSON keys on ordinary types.

Use `@preserveUnknownMembers` **only** on types that are **round-tripped
through a client in a read-modify-replace flow** — i.e., decoded from host
state by an older client, edited, and sent back to the host as a full
replacement object — plus every fixed-schema object and union variant
transitively nested inside those replacement payloads, so editing known fields
does not silently erase newer fields stored on the host:

- **Annotate:**
  - Existing round-trip graphs and any new fixed-schema types or union variants
    nested inside them: `AutomationDefinitionPatch` (`automation/updateRequested`
    — `AutomationSessionTemplate`, `AutomationTrigger`,
    `AutomationDisableCondition`, `AutomationTarget`, `Message`, and their
    nested types) and `SearchQuery` (`search/queryChanged` and its
    `SearchTarget` variants).
  - Any new action/command payload that replaces a host-stored object after the
    client reads and edits it, along with its nested fixed-schema types.
- **Do NOT annotate:**
  - **Host-to-client read-only state and metadata** (`*Summary`, `*Info`,
    `*Capabilities`, `Turn`, `ToolCallState`, `SearchResult`, `ChangesetFile`,
    etc.) — clients read these without sending them back as replacements.
  - **Client-constructed one-shot requests** (`CreateSessionParams`,
    `CreateChatParams`, `AuthenticateParams`, `McpServerAuthenticateTarget`,
    `ResourceReadParams`, etc.) — clients build these fresh per call, so there
    are no decoded unknown fields to preserve.
  - **Host-only command results** (`*Result`).

Keep this annotation minimal because it carries real SDK cost: it adds an
`extra` / `Extra` map field and custom serializers, breaks Go `==`
comparability, requires `extra` / `..` in Rust struct literals and exhaustive
patterns, and changes .NET record equality on `Extra` to reference comparison.
Because adding it to an already-published type is a source/binary breaking
change in generated SDKs, decide deliberately when introducing a new
read-modify-replace type rather than adding it speculatively everywhere.

### Discriminated unions

- Lifecycle / state-machine unions: name the union `Foo*State` and its
  discriminant enum `Foo*Status`. Variant interfaces are `Foo*State` (e.g.
  `ToolCallState` + `ToolCallStatus` + `ToolCallStreamingState`;
  `McpServerState` + `McpServerStatus` + `McpServerStartingState`;
  `CustomizationLoadState` + `CustomizationLoadStatus`).
- General / typological unions (not a lifecycle): name the discriminant
  `Foo*Kind` (e.g. `MessageAttachment` + `MessageAttachmentKind`,
  `ResponsePart` + `ResponsePartKind`, `ToolCallContributor` +
  `ToolCallContributorKind`).
- Generator note: variant interface names must differ from the union wrapper
  names emitted by the per-language generators (e.g. Kotlin emits
  `value class FooStateStarting(val value: FooStartingState)`), so name
  variants `Foo*State` rather than `FooStatus*`.

## Actions and reducers

- Whenever you change or add an action, review the reducers in `types/reducers.ts`
  (and per-channel `reducer.ts` files) to see if it needs to be propagated into
  state. If it does, add the logic, update every hand-written client reducer,
  and add fixtures in `types/test-cases/reducers/` to keep `types/reducers.ts`
  at 100% branch coverage.
- Actions that mutate a keyed collection in state (an array whose entries are
  identified by a stable key such as `id`, `clientId`, `resource`, or a URI —
  e.g. `chats`, `customizations`, `files`, `annotations`, `activeClients`) MUST
  follow the established add/remove/update convention rather than inventing a
  new shape:
  - **Upsert (`Foo*Set`)**: carries the **full entry object**. The reducer
    finds the entry by key, **appends** it when absent and **replaces** it in
    place when present (never duplicating a key). Always name a generic
    create-or-replace action `Set` — not `Added`, `Changed`, or `Updated`.
  - **Remove (`Foo*Removed`)**: carries **only the key** (e.g. `{ clientId }`,
    `{ fileId }`), never the whole object. The reducer is a **no-op returning
    the original `state`** when no entry matches.
  - **Partial update (`Foo*Updated`)**: carries the **key plus the optional
    fields that changed**; the reducer merges them onto the existing entry and
    is a **no-op returning `state`** when no entry matches. Ignore the key
    inside any `changes` payload so it can't be reassigned.
  - Prefer a key-only **remove** action over an upsert that accepts a
    nullable/sentinel "unset" value (e.g. do not model removal as `Changed`
    with `entry: null`).
  - Reducer mechanics are uniform:
    `const idx = list.findIndex(x => x.<key> === action.<key>)`, branch on
    `idx < 0`, copy immutably (`list.slice()` / `[...list]`), then write or
    `splice`, and return `{ ...state, <collection>: next }`. Every branch
    (insert, replace, remove, no-op) needs a fixture in
    `types/test-cases/reducers/`.

## Docs, changelogs, and finalizing changes

- After making your changes, check that the documentation in `docs/` is up to
  date. For significant new flows or features, add or expand documentation
  (Mermaid diagrams are supported).
- For user-visible protocol changes, load the [`changelog`](../changelog/SKILL.md)
  skill and add a single fragment under `docs/.changes/` (or update the
  existing fragment if iterating on an unreleased feature).
- Before declaring a protocol change complete, run from the repo root:

```bash
npm run generate
npm test
```

Resolve any generated-output, typecheck, lint, test, or generator issues those
commands expose before handing the change back. For language-specific codegen
conventions, see the per-client guides:
[`clients/dotnet/AGENTS.md`](../../clients/dotnet/AGENTS.md),
[`clients/go/AGENTS.md`](../../clients/go/AGENTS.md),
[`clients/kotlin/AGENTS.md`](../../clients/kotlin/AGENTS.md), and
[`clients/swift/AGENTS.md`](../../clients/swift/AGENTS.md).

## Running toolchains you don't have locally

A spec change ripples into every `clients/<lang>/` mirror, so you often need to
build and test a client whose toolchain isn't installed on your machine.
**Don't skip verification** — run it in a container with `podman`. Use these
pinned images so every agent verifies against the same environment (add a row
when you containerize another toolchain so the images stay consistent):

| Toolchain | Image | Notes |
| --- | --- | --- |
| JDK 17 (Kotlin client) | `docker.io/library/eclipse-temurin:17-jdk` | Gradle comes from the repo's `./gradlew` wrapper. |
| .NET SDK 10 (.NET client) | `mcr.microsoft.com/dotnet/sdk:10.0` | Supports `.slnx`; the test host rolls forward from .NET 8. |

The full Swift client and tests import Apple-only `Network` and `CryptoKit`, so
run them on macOS with a full Xcode install, which includes XCTest (Command
Line Tools alone may lack it). Run every target; don't exclude transport
targets or add platform shims to get a pass.

Mount the **repo root** (the shared conformance fixtures under
`types/test-cases/` are resolved by walking up from the working directory, so a
client-dir-only mount fails) and keep build caches out of `$HOME`. Example —
run the Kotlin client's tests:

```sh
podman run --rm \
  -e GRADLE_USER_HOME=/tmp/gradle-home \
  -v "$PWD":/workspace \
  -w /workspace/clients/kotlin \
  docker.io/library/eclipse-temurin:17-jdk \
  ./gradlew test --no-daemon --console=plain
```

On macOS this needs a running `podman machine` (`podman machine start`). Build
artifacts (`clients/kotlin/build/`, `.gradle/`) are git-ignored.
