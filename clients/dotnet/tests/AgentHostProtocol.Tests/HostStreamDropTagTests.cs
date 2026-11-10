// Regression guard for the multi-host drop-tag refactor (PR #206 telemetry pass):
//
//   1. SOURCE GATE — MultiHostClient.cs must NOT carry any raw "host-*" string
//      literal. Every per-host stream's drop tag must route the ahp.stream value
//      through the generated AhpTelemetryNames.StreamHost* constants (cached as a
//      static KeyValuePair, like the single-host AhpClient/Subscription drop path),
//      not an inline literal. A raw literal here silently drifts from the generated
//      contract the moment a name changes.
//
//   2. RUNTIME PROOF — a real back-pressure drop on a per-host stream fires the
//      events.dropped counter tagged with the host-* value carried by the constant,
//      proving the constant resolves to the expected wire value end-to-end.
#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics.Metrics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol.Hosts;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class HostStreamDropTagTests
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    // The five per-host stream wire values, asserted to (a) be absent as raw
    // literals in the source and (b) equal the generated StreamHost* constants.
    private static readonly (string Constant, string WireValue)[] HostStreamTags =
    {
        (AhpTelemetryNames.StreamHostEvent, "host-event"),
        (AhpTelemetryNames.StreamHostSubscription, "host-subscription"),
        (AhpTelemetryNames.StreamHostResource, "host-resource"),
        (AhpTelemetryNames.StreamHostSnapshot, "host-snapshot"),
        (AhpTelemetryNames.StreamHostSummaries, "host-summaries"),
    };

    [Fact]
    public void GeneratedConstants_CarryTheExpectedHostStreamWireValues()
    {
        // The constants must resolve to the host-* wire values the registry defines.
        foreach (var (constant, wire) in HostStreamTags)
            Assert.Equal(wire, constant);
    }

    [Fact]
    public void MultiHostClientSource_HasNoRawHostStreamLiterals()
    {
        var source = File.ReadAllText(FindMultiHostClientSource());

        // No raw "host-..." quoted literal may remain anywhere in MultiHostClient.cs.
        // After the refactor the drop tags reference AhpTelemetryNames.StreamHost*
        // (and are cached as static KeyValuePairs), so the only host-* text in the
        // file is inside comments — never a `"host-..."` string literal.
        foreach (var (_, wire) in HostStreamTags)
        {
            var literal = "\"" + wire + "\"";
            Assert.DoesNotContain(literal, source, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task HostSnapshotsBackPressure_FiresDroppedCounterTaggedHostSnapshot()
    {
        // Drive a REAL drop on the per-host snapshot stream (capacity-1 DropOldest):
        // overfilling it without a reader evicts the stalest snapshot and fires
        // events.dropped tagged ahp.stream=host-snapshot — carried by the constant.
        long drops = 0;
        var streams = new List<string>();
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<long>((inst, measurement, tags, _) =>
        {
            if (inst.Name != AhpTelemetryNames.EventsDropped) return;
            var stream = TagValue(tags, AhpTelemetryNames.AttrStream);
            // Only count the host-snapshot stream so this test is robust to other
            // tests' drops on the process-wide static Meter.
            if (stream == AhpTelemetryNames.StreamHostSnapshot)
            {
                Interlocked.Add(ref drops, measurement);
                lock (streams) streams.Add(stream);
            }
        });
        meterListener.Start();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var m = new MultiHostClient();
        await using var disposeMulti = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-a"),
            TransportFactory = (id, ct) =>
            {
                var (c, s) = MemTransport.CreatePair();
                _ = Task.Run(() => RespondInitializeLoopAsync(s, ct));
                return Task.FromResult<ITransport>(c);
            },
        }, cts.Token);

        // Register a snapshot stream but never read it. The capacity-1 channel gets
        // one snapshot immediately (the initial Snapshot()); each subsequent host
        // observable change (a manual reconnect transitions state) evicts the prior.
        var snapshots = m.HostSnapshots(new HostId("host-a"));
        _ = snapshots; // intentionally undrained — a stalled consumer

        // Trigger several observable state changes to push past the 1-slot buffer.
        for (var i = 0; i < 6; i++)
        {
            await m.ReconnectAsync(new HostId("host-a"), cts.Token);
            await Task.Delay(20, cts.Token);
        }

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (Interlocked.Read(ref drops) < 1 && DateTime.UtcNow < deadline)
            await Task.Delay(20, cts.Token);

        Assert.True(Interlocked.Read(ref drops) >= 1,
            "expected ≥1 ahp.client.events.dropped tagged ahp.stream=host-snapshot under back-pressure");
        string[] snapshot;
        lock (streams) snapshot = streams.ToArray();
        Assert.All(snapshot, s => Assert.Equal(AhpTelemetryNames.StreamHostSnapshot, s));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private static string? TagValue(ReadOnlySpan<KeyValuePair<string, object?>> tags, string key)
    {
        foreach (var tag in tags)
            if (tag.Key == key) return tag.Value as string;
        return null;
    }

    /// <summary>Answers every `initialize` request on the transport until cancelled.</summary>
    private static async Task RespondInitializeLoopAsync(MemTransport serverSide, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var frame = await serverSide.ReceiveAsync(ct).ConfigureAwait(false);
                var msg = Ser.DecodeMessage(frame);
                if (msg.Request?.Method == "initialize")
                    await FakeHost.RespondResultAsync(
                        serverSide, msg.Request.Id,
                        new InitializeResult { ProtocolVersion = ProtocolVersion.Supported[0], Snapshots = new() },
                        ct).ConfigureAwait(false);
            }
        }
        catch { /* transport closed / cancelled — expected at teardown */ }
    }

    private static string FindMultiHostClientSource()
    {
        string? dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            var candidate = Path.Combine(
                dir, "src", "AgentHostProtocol", "Hosts", "MultiHostClient.cs");
            if (File.Exists(candidate)) return candidate;
            dir = Path.GetDirectoryName(dir.TrimEnd(Path.DirectorySeparatorChar));
        }
        throw new FileNotFoundException(
            "could not locate src/AgentHostProtocol/Hosts/MultiHostClient.cs walking upward from the test assembly");
    }
}
