// Proves the OpenTelemetry-native instrumentation actually EMITS (not just
// compiles): an ActivityListener captures the request span and a MeterListener
// captures the metrics, driven through a real InitializeAsync round-trip over
// the in-memory transport (MemTransport / FakeServer from ClientTests).
// Assertions are "at least one matching" so the signal — which flows through the
// process-wide static ActivitySource/Meter — is robust to other test classes
// running in parallel: it proves the instrumentation fires, not that it is the
// only emitter.
#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol.Hosts;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class TelemetryTests
{
    [Fact]
    public async Task Request_EmitsActivitySpan_WithRpcTags()
    {
        var spans = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = src => src.Name == AhpTelemetry.Name,
            Sample = (ref ActivityCreationOptions<ActivityContext> options) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = a => { lock (spans) spans.Add(a); },
        };
        ActivitySource.AddActivityListener(listener);

        await DriveOneInitializeAsync();

        Activity[] snapshot;
        lock (spans) snapshot = spans.ToArray();
        // Span name follows the OTel "{operation} {target}" shape, e.g. "ahp.request initialize".
        Assert.Contains(snapshot, a =>
            a.OperationName == $"{AhpTelemetryNames.RequestSpan} initialize"
            && a.Kind == ActivityKind.Client
            && (a.GetTagItem(AhpTelemetryNames.AttrRpcSystem) as string) == AhpTelemetryNames.RpcSystemJsonrpc
            && (a.GetTagItem(AhpTelemetryNames.AttrRpcMethod) as string) == "initialize"
            && a.Status == ActivityStatusCode.Ok);
    }

    [Fact]
    public async Task Request_RecordsSentAndDurationMetrics()
    {
        long messagesSent = 0;
        long durationSamples = 0;
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<long>((inst, measurement, _, _) =>
        {
            if (inst.Name == AhpTelemetryNames.MessagesSent) Interlocked.Add(ref messagesSent, measurement);
        });
        meterListener.SetMeasurementEventCallback<double>((inst, _, _, _) =>
        {
            if (inst.Name == AhpTelemetryNames.RequestDuration) Interlocked.Increment(ref durationSamples);
        });
        meterListener.Start();

        await DriveOneInitializeAsync();

        Assert.True(Interlocked.Read(ref messagesSent) >= 1, "expected an ahp.client.messages.sent measurement");
        Assert.True(Interlocked.Read(ref durationSamples) >= 1, "expected an ahp.client.request.duration measurement");
    }

    [Fact]
    public async Task Initialize_EmitsReceivedAndInflightMetrics()
    {
        long messagesReceived = 0;
        long inflightIncrements = 0;
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<long>((inst, measurement, _, _) =>
        {
            if (inst.Name == AhpTelemetryNames.MessagesReceived) Interlocked.Add(ref messagesReceived, measurement);
            if (inst.Name == AhpTelemetryNames.RequestsInFlight && measurement > 0) Interlocked.Add(ref inflightIncrements, measurement);
        });
        meterListener.Start();

        await DriveOneInitializeAsync();

        Assert.True(Interlocked.Read(ref messagesReceived) >= 1, "expected an ahp.client.messages.received measurement (the initialize response)");
        Assert.True(Interlocked.Read(ref inflightIncrements) >= 1, "expected ahp.client.requests.in_flight to record a +1 while the request was outstanding");
    }

    [Fact]
    public async Task AttachSubscription_EmitsActiveSubscriptionGauge()
    {
        long ups = 0, downs = 0;
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<long>((inst, measurement, _, _) =>
        {
            if (inst.Name != AhpTelemetryNames.SubscriptionsActive) return;
            if (measurement > 0) Interlocked.Add(ref ups, measurement);
            else if (measurement < 0) Interlocked.Add(ref downs, -measurement);
        });
        meterListener.Start();

        var (clientSide, _) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);

        var sub = client.AttachSubscription("ahp-session:/s1");
        Assert.True(Interlocked.Read(ref ups) >= 1, "AttachSubscription should record a +1 on ahp.client.subscriptions.active");

        sub.Close();
        Assert.True(Interlocked.Read(ref downs) >= 1, "Close should record a -1 on ahp.client.subscriptions.active");
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Tag-VALUE coverage — assert the real attribute values carried on each
    //  metric, not merely that a metric fired. Plus the previously-uncovered
    //  signals: dropped events (back-pressure), malformed frames (decode skip),
    //  and the MultiHostClient reconnect-supervisor outcome (added in this PR).
    // ══════════════════════════════════════════════════════════════════════

    [Fact]
    public async Task Request_MessagesSent_CarriesRequestMessageKind()
    {
        // Capture the ahp.message.kind tag value on every messages.sent measurement
        // and assert at least one carries the `request` value (the initialize RPC).
        var kinds = new List<string>();
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<long>((inst, _, tags, _) =>
        {
            if (inst.Name != AhpTelemetryNames.MessagesSent) return;
            var kind = TagValue(tags, AhpTelemetryNames.AttrMessageKind);
            if (kind is not null) lock (kinds) kinds.Add(kind);
        });
        meterListener.Start();

        await DriveOneInitializeAsync();

        string[] snapshot;
        lock (kinds) snapshot = kinds.ToArray();
        Assert.Contains(AhpTelemetryNames.MessageKindRequest, snapshot);
    }

    [Fact]
    public async Task Request_Duration_CarriesMethodAndOkOutcome()
    {
        // Assert the request.duration histogram carries BOTH the rpc.method value
        // and the ahp.outcome=ok value for a successful initialize round-trip.
        var matched = false;
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<double>((inst, _, tags, _) =>
        {
            if (inst.Name != AhpTelemetryNames.RequestDuration) return;
            var method = TagValue(tags, AhpTelemetryNames.AttrRpcMethod);
            var outcome = TagValue(tags, AhpTelemetryNames.AttrOutcome);
            if (method == "initialize" && outcome == AhpTelemetryNames.OutcomeOk) Volatile.Write(ref matched, true);
        });
        meterListener.Start();

        await DriveOneInitializeAsync();

        Assert.True(Volatile.Read(ref matched),
            "expected an ahp.client.request.duration sample tagged rpc.method=initialize and ahp.outcome=ok");
    }

    [Fact]
    public async Task DroppedEvents_UnderBackPressure_CountWithSubscriptionStreamTag()
    {
        // Drive a REAL back-pressure drop: a tiny subscription buffer (capacity 2)
        // with no reader, fed more `action` notifications than it can hold, so the
        // BoundedDropOldestChannel evicts the stalest events and fires the
        // events.dropped counter tagged ahp.stream=subscription.
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
            Interlocked.Add(ref drops, measurement);
            var stream = TagValue(tags, AhpTelemetryNames.AttrStream);
            if (stream is not null) lock (streams) streams.Add(stream);
        });
        meterListener.Start();

        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var serverTask = Task.Run(() => FakeServer.HandleOneInitialize(serverSide, cts.Token), cts.Token);
        await using var client = AhpClient.Connect(
            clientSide, new ClientConfig { SubscriptionBufferCapacity = 2 });
        await client.InitializeAsync("test-client", cancellationToken: cts.Token);
        await serverTask;

        const string uri = "ahp-session:/drops";
        // Hold the subscription but NEVER read its Events — a stalled consumer.
        using var sub = client.AttachSubscription(uri);

        // Push more action notifications than the buffer (2) can hold. The reader
        // never drains, so events past capacity are dropped-oldest. Several extra
        // ensure ≥1 eviction deterministically.
        for (long seq = 1; seq <= 8; seq++)
            await serverSide.SendAsync(BuildActionNotification(uri, seq, $"e{seq}"), cts.Token);

        // The drop callback fires on the reader pump; spin briefly until observed.
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        while (Interlocked.Read(ref drops) < 1 && DateTime.UtcNow < deadline)
            await Task.Delay(20, cts.Token);

        Assert.True(Interlocked.Read(ref drops) >= 1,
            "expected at least one ahp.client.events.dropped measurement under back-pressure");
        string[] streamSnapshot;
        lock (streams) streamSnapshot = streams.ToArray();
        Assert.Contains(AhpTelemetryNames.StreamSubscription, streamSnapshot);
    }

    [Fact]
    public async Task MalformedFrame_IsSkipped_AndCounted()
    {
        // Feed a non-JSON text frame to the client reader. DecodeMessage throws, the
        // reader skips the frame and increments ahp.client.frames.malformed, then
        // keeps running (a subsequent valid frame still decodes — proven by the
        // initialize response below resolving).
        long malformed = 0;
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<long>((inst, measurement, _, _) =>
        {
            if (inst.Name == AhpTelemetryNames.FramesMalformed) Interlocked.Add(ref malformed, measurement);
        });
        meterListener.Start();

        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);

        // 1) Inject a malformed frame from the server side — the reader skips it.
        await serverSide.SendAsync(TransportMessage.FromText("{ this is not valid json"), cts.Token);

        // 2) Then a real initialize round-trip — proves the reader resynced and the
        //    client is still alive AFTER the malformed frame was skipped.
        var serverTask = Task.Run(() => FakeServer.HandleOneInitialize(serverSide, cts.Token), cts.Token);
        await client.InitializeAsync("test-client", cancellationToken: cts.Token);
        await serverTask;

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(2);
        while (Interlocked.Read(ref malformed) < 1 && DateTime.UtcNow < deadline)
            await Task.Delay(20, cts.Token);

        Assert.True(Interlocked.Read(ref malformed) >= 1,
            "expected an ahp.client.frames.malformed measurement after a non-JSON frame");
    }

    [Fact]
    public async Task MultiHostReconnect_EmitsReconnectsWithOkOutcome()
    {
        // Drive a REAL transport drop + supervised reconnect through MultiHostClient
        // and assert its supervisor emits ahp.client.reconnects tagged ahp.outcome=ok
        // on the successful reconnect. This covers the supervisor instrumentation
        // added in this PR (the single-host AhpClient reconnect path is a separate
        // emit site).
        long okReconnects = 0;
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<long>((inst, measurement, tags, _) =>
        {
            if (inst.Name != AhpTelemetryNames.Reconnects) return;
            if (TagValue(tags, AhpTelemetryNames.AttrOutcome) == AhpTelemetryNames.OutcomeOk)
                Interlocked.Add(ref okReconnects, measurement);
        });
        meterListener.Start();

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var disposeMulti = m;

        var subs = m.Subscriptions();
        const string channel = "ahp-session:/s1";

        // Per-attempt factory: first connection pushes seq=1 then drops; the
        // supervisor reconnects and the second connection pushes seq=2. Identical
        // shape to MultiHostClientTests.MultiHost_Reconnect_ReplaysActionsWithAdvancedSeq,
        // but here we assert the reconnect METRIC rather than the replayed seq.
        var attempt = 0;
        HostTransportFactory factory = (hostId, ct) =>
        {
            var n = Interlocked.Increment(ref attempt);
            var (c, s) = MemTransport.CreatePair();
            if (n == 1)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var frame = await s.ReceiveAsync(ct).ConfigureAwait(false);
                        var msg = Ser.DecodeMessage(frame);
                        if (msg.Request?.Method == "initialize")
                        {
                            await RespondInitializeAsync(s, msg.Request.Id, ct).ConfigureAwait(false);
                            for (var i = 0; i < 4 && !ct.IsCancellationRequested; i++)
                            {
                                await s.SendAsync(BuildActionNotification(channel, 1, "e1"), ct).ConfigureAwait(false);
                                await Task.Delay(15, ct).ConfigureAwait(false);
                            }
                        }
                    }
                    catch { /* ignore */ }
                    finally { await s.CloseAsync().ConfigureAwait(false); }
                });
            }
            else
            {
                // Reconnected connection: answer `initialize` AND the supervisor's
                // `reconnect` RPC (replaying an action at the advanced seq=2), and
                // push live seq=2 actions after initialize. The FakeHost builder runs
                // the canonical receive→decode→dispatch loop so the reconnect RPC
                // actually settles — without it the supervisor's reconnect hangs.
                _ = Task.Run(() => FakeHost.New()
                    .OnInitialize((req, side, c) => RespondInitializeAsync(side, req.Id, c))
                    .AfterInitialize(async (side, c) =>
                    {
                        while (!c.IsCancellationRequested)
                        {
                            await side.SendAsync(BuildActionNotification(channel, 2, "e2"), c).ConfigureAwait(false);
                            await Task.Delay(15, c).ConfigureAwait(false);
                        }
                    })
                    .OnReconnect((req, side, c) =>
                    {
                        var replay = new ChannelReplayRecovery
                        {
                            Channel = channel,
                            Actions = new List<ActionEnvelope>
                            {
                                new ActionEnvelope
                                {
                                    Channel = channel,
                                    ServerSeq = 2,
                                    Action = new StateAction(new SessionTitleChangedAction
                                    {
                                        Type = ActionType.SessionTitleChanged,
                                        Title = "replay-2",
                                    }),
                                },
                            },
                        };
                        return FakeHost.RespondResultAsync(
                            side,
                            req.Id,
                            new ReconnectResult
                            {
                                Channels = new List<ChannelRecovery> { new ChannelRecovery(replay) },
                            },
                            c);
                    })
                    .RunAsync(s, ct));
            }
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-a"),
            TransportFactory = (id, ct) => factory(id, ct),
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(20),
                MaxBackoff = TimeSpan.FromMilliseconds(20),
                BackoffMultiplier = 1.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);

        // Drain until we see a post-reconnect (seq=2) event — proves the reconnect
        // actually completed before we assert on the metric.
        long maxSeqSeen = 0;
        while (maxSeqSeen < 2)
        {
            var ev = await subs.ReadAsync(cts.Token);
            if (ev.Event is SubscriptionEventAction action)
                maxSeqSeen = Math.Max(maxSeqSeen, action.Envelope.ServerSeq);
        }

        Assert.True(Interlocked.Read(ref okReconnects) >= 1,
            "expected the MultiHostClient supervisor to emit ahp.client.reconnects with ahp.outcome=ok on a successful reconnect");
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    /// <summary>Reads a string-valued tag from a measurement's tag span, or null.</summary>
    private static string? TagValue(ReadOnlySpan<KeyValuePair<string, object?>> tags, string key)
    {
        foreach (var tag in tags)
            if (tag.Key == key) return tag.Value as string;
        return null;
    }

    /// <summary>Builds an `action` notification frame for <paramref name="uri"/>.</summary>
    private static TransportMessage BuildActionNotification(string uri, long serverSeq, string title)
    {
        var envelope = new ActionEnvelope
        {
            Channel = uri,
            ServerSeq = serverSeq,
            Action = new StateAction(new SessionTitleChangedAction
            {
                Type = ActionType.SessionTitleChanged,
                Title = title,
            }),
        };
        var notif = new JsonRpcMessage
        {
            Notification = new JsonRpcNotification
            {
                Method = "action",
                Params = Ser.SerializeToElement(envelope),
            },
        };
        return Ser.EncodeMessage(notif);
    }

    private static Task RespondInitializeAsync(MemTransport serverSide, ulong id, CancellationToken ct) =>
        FakeHost.RespondResultAsync(
            serverSide, id,
            new InitializeResult { ProtocolVersion = ProtocolVersion.Current, Snapshots = new() }, ct);

    private static async Task DriveOneInitializeAsync()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var serverTask = Task.Run(() => FakeServer.HandleOneInitialize(serverSide, cts.Token), cts.Token);
        await using (var client = AhpClient.Connect(clientSide))
        {
            await client.InitializeAsync("test-client", cancellationToken: cts.Token);
        }
        await serverTask;
    }
}
