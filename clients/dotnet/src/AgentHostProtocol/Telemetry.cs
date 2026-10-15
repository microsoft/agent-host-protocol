// OpenTelemetry-native instrumentation for the AHP client — a single
// ActivitySource (traces) + a single Meter (metrics), both from the BCL's
// System.Diagnostics. They are consumed directly by OpenTelemetry
// (.AddSource(AhpTelemetry.Name) / .AddMeter(AhpTelemetry.Name)) and are
// ~zero-cost when nothing is listening (StartActivity() returns null; metric
// recording is a no-op with no collector). No Microsoft.Extensions.Logging
// dependency: the library originates traces + metrics; a consumer's own ILogger
// written inside one of these spans already auto-correlates to it.
#nullable enable

using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Reflection;
using System.Collections.Concurrent;

namespace Microsoft.AgentHostProtocol;

/// <summary>
/// The AHP client's observability surface. Light it up from OpenTelemetry with
/// <c>.AddSource(AhpTelemetry.Name)</c> (traces) and <c>.AddMeter(AhpTelemetry.Name)</c>
/// (metrics); both are near-zero-cost when no listener is attached.
/// </summary>
public static class AhpTelemetry
{
    /// <summary>
    /// The instrumentation name shared by the <see cref="System.Diagnostics.ActivitySource"/>
    /// and the <see cref="System.Diagnostics.Metrics.Meter"/>. Pass it to
    /// OpenTelemetry's <c>AddSource</c> / <c>AddMeter</c>.
    /// </summary>
    public const string Name = AhpTelemetryNames.Source;

    private static readonly string? Version =
        typeof(AhpTelemetry).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? typeof(AhpTelemetry).Assembly.GetName().Version?.ToString();

    internal static readonly ActivitySource ActivitySource = new(Name, Version);
    internal static readonly Meter Meter = new(Name, Version);

    // ── Metrics ────────────────────────────────────────────────────────────
    // Names follow OTel-style dotted lowercase. Tags are added at the call site.

    // The `description:` strings reference the generated AhpTelemetryNames.*Description
    // constants — the SINGLE source for each instrument's human-readable description
    // (also rendered as the doc-comment summary above each metric name in the
    // generated holder). Referencing the constant rather than re-typing the literal
    // keeps the runtime metadata in lock-step with the generated contract.
    internal static readonly Counter<long> MessagesSent =
        Meter.CreateCounter<long>(AhpTelemetryNames.MessagesSent, unit: AhpTelemetryNames.MessagesSentUnit,
            description: AhpTelemetryNames.MessagesSentDescription);

    internal static readonly Counter<long> MessagesReceived =
        Meter.CreateCounter<long>(AhpTelemetryNames.MessagesReceived, unit: AhpTelemetryNames.MessagesReceivedUnit,
            description: AhpTelemetryNames.MessagesReceivedDescription);

    internal static readonly Histogram<double> RequestDuration =
        Meter.CreateHistogram<double>(AhpTelemetryNames.RequestDuration, unit: AhpTelemetryNames.RequestDurationUnit,
            description: AhpTelemetryNames.RequestDurationDescription);

    internal static readonly UpDownCounter<long> InflightRequests =
        Meter.CreateUpDownCounter<long>(AhpTelemetryNames.RequestsInFlight, unit: AhpTelemetryNames.RequestsInFlightUnit,
            description: AhpTelemetryNames.RequestsInFlightDescription);

    internal static readonly UpDownCounter<long> ActiveSubscriptions =
        Meter.CreateUpDownCounter<long>(AhpTelemetryNames.SubscriptionsActive, unit: AhpTelemetryNames.SubscriptionsActiveUnit,
            description: AhpTelemetryNames.SubscriptionsActiveDescription);

    internal static readonly Counter<long> Reconnects =
        Meter.CreateCounter<long>(AhpTelemetryNames.Reconnects, unit: AhpTelemetryNames.ReconnectsUnit,
            description: AhpTelemetryNames.ReconnectsDescription);

    internal static readonly Counter<long> DroppedEvents =
        Meter.CreateCounter<long>(AhpTelemetryNames.EventsDropped, unit: AhpTelemetryNames.EventsDroppedUnit,
            description: AhpTelemetryNames.EventsDroppedDescription);

    internal static readonly Counter<long> MalformedFrames =
        Meter.CreateCounter<long>(AhpTelemetryNames.FramesMalformed, unit: AhpTelemetryNames.FramesMalformedUnit,
            description: AhpTelemetryNames.FramesMalformedDescription);

    internal static readonly Counter<long> WindowDataBytesSent = Meter.CreateCounter<long>("ahp.client.window.data.sent", "By");
    internal static readonly Counter<long> WindowDataBytesReceived = Meter.CreateCounter<long>("ahp.client.window.data.received", "By");
    internal static readonly Counter<long> WindowCreditBytesSent = Meter.CreateCounter<long>("ahp.client.window.credit.sent", "By");
    internal static readonly Counter<long> WindowCreditBytesReceived = Meter.CreateCounter<long>("ahp.client.window.credit.received", "By");
    internal static readonly Histogram<double> WindowBlockedDuration = Meter.CreateHistogram<double>("ahp.client.window.blocked.duration", "ms");
    private static readonly ConcurrentDictionary<long, WeakReference<WindowedSubscription>> Windows = new();
    private static long _nextWindow;
    private static readonly ObservableGauge<long> BufferedWindowBytes =
        Meter.CreateObservableGauge<long>("ahp.client.window.buffered", ObserveWindowBytes, "By");

    internal static long TrackWindow(WindowedSubscription subscription)
    {
        foreach (var pair in Windows)
            if (!pair.Value.TryGetTarget(out _)) Windows.TryRemove(pair.Key, out _);
        var key = System.Threading.Interlocked.Increment(ref _nextWindow);
        Windows.TryAdd(key, new WeakReference<WindowedSubscription>(subscription));
        return key;
    }

    internal static void UntrackWindow(long key) => Windows.TryRemove(key, out _);
    internal static int TrackedWindowCount => Windows.Count;

    private static IEnumerable<Measurement<long>> ObserveWindowBytes()
    {
        long send = 0, receive = 0;
        foreach (var pair in Windows)
        {
            if (!pair.Value.TryGetTarget(out var owner) || owner.Closed)
            {
                Windows.TryRemove(pair.Key, out _);
                continue;
            }
            var status = owner.FlowControl;
            send += status.BufferedSendBytes;
            receive += status.BufferedReceiveBytes;
        }
        yield return new Measurement<long>(send, new KeyValuePair<string, object?>("direction", "send"));
        yield return new Measurement<long>(receive, new KeyValuePair<string, object?>("direction", "receive"));
    }

    internal static void FlowEvent(FlowControlEvent value)
    {
        using var activity = Activity.Current is null ? ActivitySource.StartActivity("ahp.flowcontrol") : null;
        (Activity.Current ?? activity)?.AddEvent(new ActivityEvent("ahp.flowcontrol." + value.Kind,
            tags: new ActivityTagsCollection { { "ahp.flowcontrol.bytes", value.Bytes } }));
    }
}
