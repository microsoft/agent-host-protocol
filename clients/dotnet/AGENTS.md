# Agent Guide — .NET client

Conventions for AI coding agents working on the .NET client. Cross-cutting
repo rules are in the root [`AGENTS.md`](../../AGENTS.md); release mechanics
are in [`RELEASING.md`](../../RELEASING.md).

## Layout

| Path | Contents |
| --- | --- |
| `src/AgentHostProtocol.Abstractions/Generated/*.generated.cs` | **Generated** wire types. Do not edit. |
| `src/AgentHostProtocol.Abstractions/Json/`, `Transport/` | Hand-written serialization support (`AhpUnion`, `UnionConverter`, `WireEnumConverter`, `StringOrMarkdown`) and the `ITransport` / `IAhpSerializer` seams. |
| `src/AgentHostProtocol/` | `AhpClient`, the reducers, the default `SystemTextJsonAhpSerializer`, subscriptions, and the `Hosts/` multi-host runtime. |
| `src/AgentHostProtocol/WebSocketTransport.cs` | `ClientWebSocket`-based transport. |
| `tests/AgentHostProtocol.Tests/` | xUnit tests, including the shared reducer-fixture conformance suite. |
| `examples/` | Runnable console samples. |

## Code generation

Generated files are produced by `scripts/generate-csharp.ts` (run from the repo
root via `npm run generate:dotnet`) from the TypeScript definitions in
`types/`. The generator is modeled on `scripts/generate-go.ts` and shares its
curated struct / enum / union lists — they are protocol-driven, not
language-specific. After changing anything under `types/`, regenerate and
commit; CI fails on any diff between the committed sources and a fresh run.

## Type mapping (TS → C#)

- `number` → `long` (or `double` when the property carries `@format float`).
- `unknown` / `object` → `System.Text.Json.JsonElement`;
  `Record<string, unknown>` → `Dictionary<string, JsonElement>`.
- Optional (`?` / `| undefined` / `| null`) fields → nullable + `[JsonIgnore(
  Condition = JsonIgnoreCondition.WhenWritingNull)]`. Required fields serialize
  their value (a required reference left null serializes as `null`, mirroring
  Go's `nil`-slice semantics).
- String enums → C# `enum` with `[WireValue("…")]` per member, (de)serialized
  by `WireEnumConverter<T>`. Bitset enums → `[Flags] enum : uint`, serialized
  as their numeric value so unknown future bits round-trip.
- Discriminated unions → a sealed wrapper deriving from `AhpUnion` (carrying
  `object? Value`) plus a generated `UnionConverter<T>`. Unknown discriminator
  values are preserved verbatim as a raw `JsonElement`.

## Reducers

The reducers are a faithful port of the Go client's `reducers.go` and mirror
the canonical TypeScript reducers. They mutate state in place. The shared
fixtures under `types/test-cases/reducers/*.json` are the cross-language parity
gate — run them with `dotnet test`. The `resourceWatch` reducer is an
intentional stub (parity with the Rust and Go clients).

## Testing

The shipping libraries build for `netstandard2.0` and `net8.0`; tests run
against `net8.0`:

1. **Shared reducer conformance** — `FixtureDrivenReducerTests` replays every
   cross-language reducer fixture (`types/test-cases/reducers/*.json`). The
   whole set counts as a single `[Theory]`.
2. **Shared wire round-trip corpus** — `TypesRoundTripFixtures` data-drives the
   language-agnostic round-trip corpus under `types/test-cases/round-trips/*.json`
   through the REAL serializer, asserting decode → re-encode is a byte-exact
   fixed point. A `[Theory]` (`CorpusFixture`) iterates every fixture in the dir.
3. **Native unit tests** — `ClientTests` (full `AhpClient` over an in-memory
   `MemTransport`, the port of Go's `client_test.go`), `HostsTests`,
   `MultiHostClientTests`, `MultiHostStateMirrorTests`, `NativeReducerTests`,
   `ReconnectPolicyTests`, `ClientIdStoreTests`,
   `FileClientIdStoreTests`, `TransportTests`, `WebSocketTransportTests`. The
   multi-host / host / client fake servers share one declarative loop helper,
   `FakeHost`.
4. **Cross-implementation convergence** — `CrossImplementationConvergenceTests`
   replays a session trace captured from an independent host, while
   `RealSocketTypeScriptConformanceTests` launches the repository-local
   TypeScript conformance host over a real WebSocket and proves current-version
   negotiation, snapshot seeding from `InitializeResult`, and streamed action
   convergence through the handwritten C# reducers. The host imports the
   canonical TypeScript `sessionReducer` directly and uses the development-only
   `ws` package for server framing; it does not use a published package or an
   external service.

Cross-language parity is verified by the shared fixture corpora the suite
replays — the 189 reducer fixtures (`types/test-cases/reducers/*.json`) and the
round-trip corpus (`types/test-cases/round-trips/*.json`), both of which every
client runs. (A .NET-only grep-based test-count gate used to live here; it was
retired in favor of relying on the shared corpora, which actually exercise the
behavior rather than counting method names.)

## Architecture decisions

- [`docs/decisions/sync.md`](docs/decisions/sync.md)
  — the full menu of .NET synchronization primitives, the distinct concurrency
  use cases in the client, which primitive each gets (`ConcurrentDictionary`
  for the collections, `lock` for the `HostEntry` field-bundle, `SemaphoreSlim`
  only for the WebSocket send path, `Channels`/`Interlocked`/`volatile`
  elsewhere), and the `netstandard2.0` compatibility strategy.
- [`docs/decisions/serialization.md`](docs/decisions/serialization.md)
  — System.Text.Json (default, in-box, fastest) behind the `IAhpSerializer`
  seam, versus Newtonsoft / lazy-DOM / validating options, across speed,
  memory, lazy-vs-eager, validation, dependencies, and AOT.
- [`docs/decisions/reconnect.md`](docs/decisions/reconnect.md)
  — hand-rolled exponential backoff (with opt-in jitter) versus
  Polly / `Microsoft.Extensions.Resilience`, and why the core stays
  dependency-free.

These decision records live under `docs/decisions/` and are repo-only — they are not packed into any NuGet
package (only `README.md` is).

## Releasing

Sub-package releases publish the
`Microsoft.VisualStudioCode.AgentHostProtocol*` packages to NuGet.org.
`pipeline.yml` is the tag-driven Azure DevOps release pipeline: it signs the
assemblies and packages through ESRP before publishing. The
`clients/dotnet/VERSION` ↔ `CHANGELOG.md` heading match is enforced for every
PR by `npm run verify:changelog`.

## Out of scope

JSON-Schema validation (a
`Microsoft.VisualStudioCode.AgentHostProtocol.Validation` decorator over
`IAhpSerializer`) and DI/extension helpers
(`Microsoft.VisualStudioCode.AgentHostProtocol.Extensions`) are planned
follow-ups, not part of this client yet.
