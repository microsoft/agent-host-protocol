# Telemetry Channel

<StabilityIndex level="2" />

The telemetry channel is the way an agent host emits OpenTelemetry (OTel) data — logs, traces, and metrics — to AHP clients. It is a thin pass-through: payloads on the wire are [OTLP/JSON](https://github.com/open-telemetry/opentelemetry-proto) values verbatim. AHP only adds the routing envelope.

This page is normative. The OTel data model itself is defined by [opentelemetry-proto](https://github.com/open-telemetry/opentelemetry-proto); AHP does not redeclare it.

## URI Scheme

Telemetry channels use the `ahp-otlp:` scheme. The authority and path portion of the URI are implementation-defined. A host MAY also advertise an [RFC 6570](https://datatracker.ietf.org/doc/html/rfc6570) URI template; the client expands the template using values from this spec (currently only `{level}` on the logs channel) and subscribes with the resulting concrete URI.

Clients MUST treat the URI as opaque apart from expanding well-known template variables defined here, and subscribe with the value the host advertised on `InitializeResult.telemetry` (after expansion).

There is no requirement that the URIs for the three signals share a common path, host, or any other structure. Each one is independent.

## Discovery

The agent host advertises which OTel signals it emits — and on which channel URIs — on `InitializeResult.telemetry`:

```jsonc
// Server → Client (initialize response, excerpt)
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "0.3.0",
    "serverSeq": 0,
    "snapshots": [],
    "telemetry": {
      "logs":    "ahp-otlp://logs{?level}",
      "traces":  "ahp-otlp://traces",
      "metrics": "ahp-otlp://metrics"
    }
  }
}
```

Each field is optional. A host that emits no metrics simply omits `metrics`. A host that emits no telemetry at all omits `telemetry` entirely.Clients SHOULD subscribe only to the signals they can process.

## Subscribing

Telemetry channels are stateless*, subscribing returns an empty `SubscribeResult`. After the subscribe succeeds the client receives `otlp/export*` notifications for batches the host emits while the subscription is live.

```jsonc
// Client → Server
{ "jsonrpc": "2.0", "id": 2, "method": "subscribe",
  "params": { "channel": "ahp-otlp://logs" } }

// Server → Client
{ "jsonrpc": "2.0", "id": 2, "result": {} }
```

Telemetry is not replayed on reconnect. After `reconnect`, clients re-subscribe and resume from the live edge.

## Wire Format

There is exactly one server → client notification method per OTel signal:

| Method | Channel | Payload |
|---|---|---|
| `otlp/exportLogs` | `TelemetryCapabilities.logs` | OTLP/JSON [`ExportLogsServiceRequest`](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/collector/logs/v1/logs_service.proto) |
| `otlp/exportTraces` | `TelemetryCapabilities.traces` | OTLP/JSON [`ExportTraceServiceRequest`](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/collector/trace/v1/trace_service.proto) |
| `otlp/exportMetrics` | `TelemetryCapabilities.metrics` | OTLP/JSON [`ExportMetricsServiceRequest`](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/collector/metrics/v1/metrics_service.proto) |

Each notification's params have the shape:

```jsonc
{
  "channel": "<the ahp-otlp: URI from InitializeResult.telemetry>",
  "payload": { /* OTLP/JSON ExportXxxServiceRequest, verbatim */ }
}
```

The `channel` field follows the universal AHP rule: every notification's params carry the channel URI it scopes to. Clients route batches by `channel`, then parse `payload` as OTLP/JSON.

### Example — logs

```jsonc
{
  "jsonrpc": "2.0",
  "method": "otlp/exportLogs",
  "params": {
    "channel": "ahp-otlp://logs",
    "payload": {
      "resourceLogs": [
        {
          "resource": {
            "attributes": [
              { "key": "service.name",     "value": { "stringValue": "ahp-agent-host" } },
              { "key": "ahp.session.id",   "value": { "stringValue": "f1e3...e0" } }
            ]
          },
          "scopeLogs": [
            {
              "scope": { "name": "agent-host.tools" },
              "logRecords": [
                {
                  "timeUnixNano": "1736870400000000000",
                  "severityNumber": 9,
                  "severityText": "INFO",
                  "body": { "stringValue": "tool call started" },
                  "attributes": [
                    { "key": "tool.name", "value": { "stringValue": "read_file" } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
```

### Example — traces and metrics

The traces and metrics notifications have the same envelope; only the top-level field name inside `payload` differs (`resourceSpans` for traces, `resourceMetrics` for metrics). Refer to opentelemetry-proto for the full data shapes.

## Filtering

The logs channel supports optional subscriber-side severity filtering via an [RFC 6570](https://datatracker.ietf.org/doc/html/rfc6570) URI template. A host that supports filtering advertises a template containing the `{level}` variable, e.g. `"ahp-otlp://logs{?level}"`; a host that does not support filtering advertises a literal URI.

| Variables in template | Meaning |
| --- | --- |
| _(none)_ | All log records are delivered. |
| `{level}` | Minimum [OTLP `SeverityNumber`](https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber) to deliver, as a short name (case-insensitive): `trace`, `debug`, `info`, `warn`, `error`, `fatal`. The server delivers records whose `severityNumber` falls in the corresponding band or above (e.g. `info` → `severityNumber >= 9`, covering INFO/WARN/ERROR/FATAL). |

```jsonc
// Host advertises:                  "ahp-otlp://logs{?level}"
// Client expands {level=info} and subscribes to:
{ "jsonrpc": "2.0", "id": 7, "method": "subscribe",
  "params": { "channel": "ahp-otlp://logs?level=info" } }
```

Each distinct expansion is its own subscription URI from the server's point of view, so two clients subscribed at different levels receive independent, pre-filtered streams. Hosts that advertise a literal URI (no `{level}`) deliver all severities.

No filter variables are currently defined for traces or metrics.

## Correlation

Hosts SHOULD use standard OpenTelemetry resource and record attributes to correlate telemetry with AHP entities — for example:

- `service.name` (Resource): identifies the host.
- `ahp.session.id` (Resource or LogRecord/Span attribute): the session URI's UUID.
- `ahp.turn.id`, `ahp.tool_call.id` (LogRecord/Span attribute): the turn or tool call the record belongs to.

These are conventions, not protocol fields; clients that want to slice telemetry by session/turn do so by attribute filtering on the receiving side.
