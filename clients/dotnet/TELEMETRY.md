# Telemetry — AgentHostProtocol .NET client

The client is instrumented natively with `System.Diagnostics` — an
`ActivitySource` (traces) and a `Meter` (metrics) — so an OpenTelemetry pipeline
lights up without the library taking any telemetry-SDK dependency or forcing a
logging framework on you. Both live in `System.Diagnostics.DiagnosticSource`,
which is in the shared framework on .NET 8+, so there is ~zero added deployed
dependency, and the instrumentation is ~zero-cost when nothing is listening
(`StartActivity()` returns `null`; span tags are built only when a listener is
attached, gated by `ActivitySource.HasListeners()`).

## Enabling it

The instrumentation-scope name for both the source and the meter is
`Microsoft.AgentHostProtocol` (`AhpTelemetry.Name`). Register them with your
OpenTelemetry provider:

```csharp
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

builder.Services.AddOpenTelemetry()
    .WithTracing(t => t.AddSource("Microsoft.AgentHostProtocol"))
    .WithMetrics(m => m.AddMeter("Microsoft.AgentHostProtocol"));
```

The client emits only counts, durations, and outcomes — **never message content**
— so there is no sensitive-data switch to consider.

## Traces

One span per JSON-RPC request:

| Span name | Kind | Attributes |
|---|---|---|
| `ahp.request {method}` | `Client` | `rpc.system=jsonrpc`, `rpc.method`, `ahp.outcome` (`ok` \| `error` \| `cancelled` \| `timeout`); status `Ok`/`Error` |

The name follows the OpenTelemetry `{operation} {target}` shape (e.g.
`ahp.request initialize`), and the `rpc.*` attributes follow the OTel RPC
semantic conventions.

## Metrics

| Metric name | Instrument | Unit | Attributes |
|---|---|---|---|
| `ahp.client.messages.sent` | Counter | `{message}` | `ahp.message.kind` (`request` \| `notification`) |
| `ahp.client.messages.received` | Counter | `{message}` | — |
| `ahp.client.request.duration` | Histogram | `ms` | `rpc.method`, `ahp.outcome` |
| `ahp.client.requests.in_flight` | UpDownCounter | `{request}` | — |
| `ahp.client.subscriptions.active` | UpDownCounter | `{subscription}` | — |
| `ahp.client.reconnects` | Counter | `{reconnect}` | `ahp.outcome` |
| `ahp.client.events.dropped` | Counter | `{event}` | `ahp.stream` (`subscription` \| `event` \| `state` \| `host-*`) |
| `ahp.client.frames.malformed` | Counter | `{frame}` | — |
| `ahp.client.window.data.sent` | Counter | `By` | — |
| `ahp.client.window.data.received` | Counter | `By` | — |
| `ahp.client.window.credit.sent` | Counter | `By` | — |
| `ahp.client.window.credit.received` | Counter | `By` | — |
| `ahp.client.window.blocked.duration` | Histogram | `ms` | — |
| `ahp.client.window.buffered` | ObservableGauge | `By` | `direction` (`send` \| `receive`) |

Metric names are lowercase-dotted per OpenTelemetry convention (the C# instrument
fields are PascalCase). A consumer's own `ILogger` written inside one of the
client's spans auto-correlates to that trace, so no logs are originated here.

Window data counters measure the actual JSON message/fragment envelopes in
UTF-16 bytes. Credit counters measure the credit notifications' UTF-16 wire
size, not their cumulative `consumedBytes` value. The buffered gauge sums unsent
data and retained receive deliveries across live owning handles, including
completed unread deliveries retained across managed reconnect. Merged receive
items retain the sum of their original charges. The duration histogram records
blocked-to-writable (or closed) intervals, rather than polling samples.
Closed owners are explicitly removed from the process-wide gauge registry;
cleanup does not depend on a metrics listener collecting the gauge.

Each flow-control transition adds an `ahp.flowcontrol.{kind}` Activity event
with `ahp.flowcontrol.bytes`, without payload content. When no ambient Activity
exists, an `ahp.flowcontrol` span hosts the event; no span is created when
tracing is disabled.

`WindowedSubscription.FlowControl`, the `FlowControlChanged` event, and
`FlowControlChanges()` expose current limits, fallback reason, buffered and
outstanding amounts, and writability. `client.FlowControlEvents()` is a lossy,
observe-only connection stream carrying channel, kind and status. Kinds are
`negotiated`, `declined`, `blocked`, `unblocked`, `creditSent`, `creditReceived`,
`fragmentedMessageReceived`, `fragmentedMessageSent`, `coalesced`, `resumed`,
and `dropped`. `MultiHostClient.FlowControlEvents()` adds host attribution.
Reading these streams does not consume deliveries or return credit.
