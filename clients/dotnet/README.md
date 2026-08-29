# Agent Host Protocol — .NET client

The [Agent Host Protocol](https://microsoft.github.io/agent-host-protocol/)
(AHP) client for .NET: the wire types, the pure state reducers, an async
JSON-RPC client, a `ClientWebSocket` transport, and the multi-host runtime.
The shipping libraries target `netstandard2.0` and `net8.0`; tests and
examples run on `net8.0`.

## Install

```bash
dotnet add package Microsoft.VisualStudioCode.AgentHostProtocol
```

| Package | Use it for |
| --- | --- |
| `Microsoft.VisualStudioCode.AgentHostProtocol.Abstractions` | Wire types + reducers' data contracts + the `ITransport` / `IAhpSerializer` interfaces. No I/O, no dependencies. Reference this alone to parse / construct AHP messages or implement a transport. |
| `Microsoft.VisualStudioCode.AgentHostProtocol` | The async `AhpClient`, pure reducers, default System.Text.Json serializer, `ClientWebSocket` transport, and `MultiHostClient`. |

`Microsoft.VisualStudioCode.AgentHostProtocol` references `.Abstractions`
transitively, so most consumers only add the main package. The C# namespaces
remain `Microsoft.AgentHostProtocol`.

## Quickstart

```csharp
using Microsoft.AgentHostProtocol;

// The client takes ownership of the transport and disposes it on shutdown,
// so dispose the client (not the transport).
var transport = await WebSocketTransport.ConnectAsync(new Uri("ws://localhost:5172"));
await using var client = AhpClient.Connect(transport);

await client.InitializeAsync(
    clientId: "ahp-dotnet-example",
    protocolVersions: ProtocolVersion.Supported,
    initialSubscriptions: new[] { ProtocolVersion.RootResourceUri });

var root = client.AttachSubscription(ProtocolVersion.RootResourceUri);
await foreach (var evt in root.Events.ReadAllAsync())
{
    Console.WriteLine(evt);
}
```

The pure reducers need no client at all:

```csharp
var state = new SessionState { /* ... */ };
Reducers.ApplyToSession(state, action);   // mutates `state` in place
```

See [`examples/`](examples/) for runnable `ConnectWs` and `ReducersDemo`
console apps.

## Dependency injection

Register the services with `AddAgentHostProtocol` (in the
`Microsoft.Extensions.DependencyInjection` namespace):

```csharp
services.AddAgentHostProtocol(cfg => cfg.DefaultRequestTimeout = TimeSpan.FromSeconds(10));
```

That registers `IAhpSerializer`, `IClientIdStore`, `MultiHostClient`, and an
`IAhpClientFactory` as singletons. Because a client needs a live transport,
resolve the factory and call `Connect(transport)`:

```csharp
var factory = provider.GetRequiredService<IAhpClientFactory>();
await using var client = factory.Connect(transport);
```

The `MultiHostClient` singleton is disposed by the container on shutdown. The
`configureClient` options apply to the factory path; `MultiHostClient` hosts are
configured per host via `HostConfig.ClientConfig`.

`ClientConfig.TimeProvider` controls request timeouts, keep-alive scheduling,
reconnect backoff, and host timestamps. It defaults to `TimeProvider.System`;
tests can supply a fake provider to advance these behaviors without wall-clock
delays.

`MultiHostClient.EventsForHost` and `MultiHostClient.Subscriptions` preserve
resource continuity across reconnects. A replay is delivered as
`SubscriptionEventAction` values; when the server must replace replay with fresh
state, each returned resource is delivered as a `SubscriptionEventSnapshot`
before the host reports `Connected`. Consumers should replace that resource's
local reducer state with the snapshot before processing later actions.

## Observability

The client emits OpenTelemetry-native traces and metrics via `System.Diagnostics`
(no `ILogger` dependency) under the source/meter name `AhpTelemetry.Name`
(`"Microsoft.AgentHostProtocol"`):

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(t => t.AddSource(AhpTelemetry.Name))
    .WithMetrics(m => m.AddMeter(AhpTelemetry.Name));
```

Spans cover requests (`ahp.request {method}`); metrics include
`ahp.client.request.duration`, `ahp.client.messages.{sent,received}`,
`ahp.client.requests.in_flight`, `ahp.client.subscriptions.active`,
`ahp.client.reconnects`, `ahp.client.events.dropped`, and
`ahp.client.frames.malformed`. All are near-zero-cost when no listener is
attached. See [`TELEMETRY.md`](TELEMETRY.md) for the full contract — the span
plus every metric name, unit, and attribute.

## Code generation

The wire types under
`src/AgentHostProtocol.Abstractions/Generated/*.generated.cs` are generated
from the canonical TypeScript protocol definitions in `types/`. Do not edit
them by hand. From the repository root:

```bash
npm install
npm run generate:dotnet
```

CI re-runs the generator and fails on any diff, so generated sources always
match the protocol definitions. Hand-written support lives alongside the
generated files (`Json/`, `Transport/`) and in the `Microsoft.AgentHostProtocol`
project.

## Serialization is pluggable

The client talks to the JSON engine through the `IAhpSerializer` seam; the
default is `SystemTextJsonAhpSerializer` (System.Text.Json). An alternative
implementation can swap the engine or decorate it with JSON-Schema validation
(against the schemas the repository generates under `schema/`) without changing
the client or transport.

### Native AOT and trimming

The `net8.0` assets are trim- and Native AOT-compatible. The generator emits
System.Text.Json metadata for the complete generated protocol model. The
default serializer uses that metadata for JSON-RPC framing, discriminated
unions, snapshots, and wire enums without enabling reflection serialization.
`AhpJsonMetadata.Default` exposes the resolver without making the generated
context's hundreds of implementation-detail properties public API.

Custom values passed through `IAhpSerializer` need their own metadata when
reflection is disabled. Add the application's context to the options before
constructing the serializer; the serializer copies and freezes the options and
adds the AHP context. Protocol camel-case naming and null handling remain fixed;
other caller settings and resolvers are preserved:

```csharp
var options = new JsonSerializerOptions();
options.TypeInfoResolverChain.Add(MyApplicationJsonContext.Default);
var serializer = new SystemTextJsonAhpSerializer(options);
```

This includes non-null application-defined values returned from
`SetServerRequestHandler`: the serializer resolves metadata for the value's
runtime type because the handler contract returns `object`. A null handler
result is emitted as JSON `null` without requiring metadata for `object`.

CI packs both libraries, restores `tests/AgentHostProtocol.AotSmoke` from those
local NuGet packages, and runs it as a native executable with
`JsonSerializerIsReflectionEnabledByDefault=false`. The smoke covers
initialization, reconnect replay, subscriptions and reducers, custom generic
requests and notifications, and typed and raw inbound request handling.

The .NET test suite also owns a hermetic cross-implementation lane. It starts a
repository-local TypeScript WebSocket host that imports the canonical
`sessionReducer`, connects through the real .NET `WebSocketTransport`, and
verifies current protocol negotiation, `InitializeResult` snapshot seeding,
and structurally equivalent state after the streamed actions pass through the
handwritten C# reducers. Run `npm ci` at the repository root before
`dotnet test` so the checked-in TypeScript host can use the repository's `tsx`
toolchain and the development-only `ws` server; no published AHP package or
separately running service is involved.

## Releasing

1. Bump [`VERSION`](VERSION).
2. From the repo root, run `npm run generate:metadata` and commit the updated
   [`release-metadata.json`](release-metadata.json).
3. Rotate the `## [Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md) to
   `## [X.Y.Z]`.
4. Merge to `main`, then tag and push `dotnet/vX.Y.Z`.
5. [`pipeline.yml`](pipeline.yml) validates, builds, tests, Authenticode-signs
   the assemblies, packs and author-signs both packages through ESRP, then
   publishes them to NuGet.org after approval.

## License

MIT
