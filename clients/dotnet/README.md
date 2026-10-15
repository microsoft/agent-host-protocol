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
console apps, and the windowing examples described under
[Windowed delivery](#windowed-delivery-opt-in).

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

## Windowed delivery (opt-in)

Windowing is off by default. It is offered per subscription, without changing
the protocol versions offered by initialization. A host that omits flow control
declines the offer; the returned handle reports `FlowControl.Mode == "ordinary"`
and `FallbackReason == "declined"`. Its snapshot is still the first event
(when an ordinary empty-state result omits its snapshot, there is no snapshot
event). Ordinary fallback retains the existing drop-oldest buffering behavior.
TCP subscriptions require acceptance and cannot fall back.

```csharp
var config = new ClientConfig
{
    Windowing = new WindowingConfig
    {
        WindowBytes = 256 * 1024,
        MaximumFrameBytes = 16 * 1024,
        MaxBufferedSendBytes = 1024 * 1024, // per subscription
    },
};
await using var client = AhpClient.Connect(transport, config);
await client.InitializeAsync("my-client");
var (result, terminal) = await client.SubscribeWindowedAsync("ahp-terminal:/t1");
await foreach (var evt in terminal.ReadEventsAsync(cancellationToken))
{
    await RenderOrApplyAsync(evt, cancellationToken);
} // advancing (or disposing) the iterator releases the preceding event
```

The additive `IWindowedAhpClient` capability and `IAhpClient` extension methods
also work with clients returned by the DI factory. Existing `IAhpClient`,
`ITransport`, and serializer implementations do not need new interface members.
Per-host defaults use `HostConfig.ClientConfig.Windowing`; the multi-host
runtime offers the same `SubscribeWindowedAsync(host, uri, options)` API.

For manual release, choose `ReceiveMode.Manual` and process delivery leases:

```csharp
var (_, tcp) = await client.SubscribeWindowedAsync(tcpUri,
    new WindowOptions { Receive = ReceiveMode.Manual, Coalescing = false });
await foreach (var delivery in tcp.Deliveries.ReadAllAsync(cancellationToken))
{
    using (delivery)
    {
        await WriteToBoundedSinkAsync(delivery.Event, cancellationToken);
    } // Dispose() or Release() returns credit exactly once
}
```

There is one credit-owning handle per URI. Re-subscribing updates that same
handle. `AttachSubscription`, global event streams, and host observer streams
remain lossy observers and **never** release credit. The owning handle retains
every windowed event; it does not silently discard events when a consumer is slow.
New event variants cover snapshots, TCP data/EOF/reset, and unknown notifications.

Send-side backpressure is exposed independently:

```csharp
await tcp.WaitWritableAsync(cancellationToken); // advisory, not a reservation
await tcp.NotifyAsync("tcp/data",
    new TcpDataParams { Channel = tcpUri, Data = Convert.ToBase64String(bytes) },
    cancellationToken); // completes after transport transmission
var status = tcp.FlowControl;
tcp.FlowControlChanged += (_, current) => UpdateStatus(current);
await foreach (var current in tcp.FlowControlChanges().ReadAllAsync(cancellationToken))
{
    UpdateStatus(current);
}
```

Existing `NotifyAsync` and `DispatchAsync` use the same fair scheduler for an
enabled URI. An oversized single send is accepted when its subscription's queue
is empty; fragmentation and the negotiated window pace it. `MaxBufferedSendBytes`
bounds additional queued data, not the size of that first logical message.
Cancellation removes unsent messages, but an already-started fragmented message
finishes to avoid corrupting the channel.

Receive coalescing is enabled by default, only for adjacent unconsumed terminal
output or chat deltas targeting the same part with matching metadata. It does
not introduce latency or delivery preferences. TCP sends can combine decoded
bytes; numbered dispatches, client-origin echoes, snapshots and EOF/reset never
combine. Register custom rules per connection:

```csharp
config.Windowing.Coalescers.Add(new ProgressCoalescer()); // before Connect()

sealed class ProgressCoalescer : IChannelMessageCoalescer
{
    public JsonRpcNotification? Coalesce(JsonRpcNotification earlier,
        JsonRpcNotification later, CoalescingContext context)
    {
        // Example only when this application's progress events are replaceable.
        return context.Direction == CoalescingDirection.Incoming &&
            earlier.Method == "root/progress" &&
            earlier.Params?.GetProperty("progressToken").GetString() ==
                later.Params?.GetProperty("progressToken").GetString()
            ? later : null;
    }
}
```

A rule must preserve channel/method and channel-required event semantics.
Custom coalescers must be fast and synchronous; the library validates their
output and faults invalid results. Merged receive deliveries preserve original
wire charges, not the serialization size of the merged event.

All protocol sizes are **UTF-16 code units × 2 of the exact JSON text**, not
UTF-8 bytes. `WebSocketTransportOptions.MaxMessageBytes` defaults to 32 MiB of
complete inbound wire-message bytes; its growing 64 KiB receive buffer limits
only a read chunk. The transport-derived AHP frame default is
`2 * (MaxMessageBytes / 3)` = **22,369,620 UTF-16 bytes**. Unknown or unbounded
transport limits use **1,048,576**. Custom transports may implement the optional
`ITransportMessageLimits` capability; raw text/binary payloads are already
retained by `TransportMessage`.

Managed windowed subscriptions retain their owner and unread deliveries across
reconnect, reset byte counters, and resume with snapshot/replay/live recovery.
Releasing old-connection deliveries never credits the new connection. Missing
subscriptions fail visibly. TCP channels close on connection loss and are never
automatically recreated. Low-level users open a new client and call
`ResumeAsync(ReconnectParams)` with the generated `Windows.Items` wrapper;
`GetWindowedSubscription(uri)` exposes its new owners.

The receive window does not cap complete reassembled message size or total
memory. Incomplete fragments are credited as they are stored so messages larger
than a window can finish; consumer release holds the final fragment's credit.
Applications must still avoid retaining deliveries indefinitely.

### Examples

Two runnable examples use an in-memory demo host that follows the window rules,
so they need no server:

- [`examples/WindowingBasic`](examples/WindowingBasic/Program.cs) opts a
  terminal subscription into windowed delivery and shows the host pausing when
  the window is full and resuming as the client returns credit.
- [`examples/WindowingBackpressure`](examples/WindowingBackpressure/Program.cs)
  adds a slow renderer, a custom coalescer that keeps only the latest terminal
  resize, and a paste that waits for `WaitWritableAsync()` instead of queueing.

```sh
dotnet run --project examples/WindowingBasic
dotnet run --project examples/WindowingBackpressure
```

The demo host and in-memory transport are in [`examples/Shared`](examples/Shared).

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
