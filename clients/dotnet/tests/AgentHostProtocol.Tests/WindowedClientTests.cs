#nullable enable

using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol.Hosts;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class WindowedClientTests
{
    private const string Uri = "ahp-test:/window";
    private const string SnapshotText = "{\"jsonrpc\":\"2.0\",\"method\":\"channel/snapshot\",\"params\":{\"channel\":\"ahp-test:/window\",\"snapshot\":{\"resource\":\"ahp-test:/window\",\"state\":{},\"fromSeq\":7}}}";
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    [Fact]
    public async Task BlockedChannelDoesNotHoldOtherChannelsOrCanceledSends() =>
        await CheckFairnessAsync();

    private static async Task CheckFairnessAsync()
    {
        var transport = new CorpusTransport();
        RespondAutomatically(transport);
        await using var client = AhpClient.Connect(transport);
        var (_, blocked) = await client.SubscribeWindowedAsync(Uri,
            new WindowOptions { WindowBytes = 512, MaximumFrameBytes = 1024 }).ConfigureAwait(false);
        var (_, other) = await client.SubscribeWindowedAsync("ahp-test:/other").ConfigureAwait(false);
        await blocked.NotifyAsync("future/data", new TcpDataParams { Channel = Uri, Data = new string('x', 220) }).ConfigureAwait(false);
        Assert.False(blocked.FlowControl.Writable);
        using var cancellation = new CancellationTokenSource();
        var canceled = blocked.NotifyAsync("future/canceled", new TcpEofParams { Channel = Uri }, cancellation.Token);
        await WindowedDeliveryCorpusTests.UntilAsync(() => blocked.FlowControl.BufferedSendBytes > 0).ConfigureAwait(false);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => canceled).ConfigureAwait(false);
        await other.NotifyAsync("future/data", new TcpEofParams { Channel = other.Uri }).WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        await WindowedDeliveryCorpusTests.UntilAsync(() => blocked.FlowControl.BufferedSendBytes == 0).ConfigureAwait(false);
        Assert.DoesNotContain(transport.Snapshot(), x => x.Json.GetProperty("method").GetString() == "future/canceled");
        var writable = blocked.WaitWritableAsync().AsTask();
        Assert.False(writable.IsCompleted);
        transport.Inject(Ser.Serialize(new JsonRpcNotification
        {
            Method = "channel/credit",
            Params = Ser.SerializeToElement(new ChannelCreditParams { Channel = Uri, ConsumedBytes = blocked.Sent }),
        }));
        await writable.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
    }

    [Fact]
    public async Task MissingWindowClosesItsRetainedQueue() =>
        await CheckMissingWindowAsync();

    private static async Task CheckMissingWindowAsync()
    {
        var transport = new CorpusTransport();
        RespondAutomatically(transport, keepWindows: false);
        await using var client = AhpClient.Connect(transport);
        var (_, owner) = await client.SubscribeWindowedAsync(Uri, new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        transport.Inject(SnapshotText);
        await WindowedDeliveryCorpusTests.UntilAsync(() => owner.LastAppliedServerSeq == 7).ConfigureAwait(false);
        await client.ResumeAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "missing-window",
            LastSeenServerSeq = 7,
            Subscriptions = new List<string> { Uri },
            Windows = new ChannelDeliveryResumeOptions
            {
                Items = new List<ChannelDeliveryResumeParams>
                {
                    new() { Channel = Uri, FlowControl = new SubscriptionFlowControlOptions { Receive = owner.Offer } },
                },
            },
        }).ConfigureAwait(false);
        Assert.Null(client.GetWindowedSubscription(Uri));
        await Assert.ThrowsAsync<AhpTransportException>(() => owner.Deliveries.ReadAsync().AsTask()).ConfigureAwait(false);
        Assert.Equal(0, owner.FlowControl.BufferedReceiveBytes);
    }

    [Fact]
    public async Task TcpOwnerClosesAndIsExcludedFromManagedReconnect() =>
        await CheckTcpReconnectAsync();

    private static async Task CheckTcpReconnectAsync()
    {
        var transports = new List<CorpusTransport>();
        await using var multi = new MultiHostClient();
        await multi.AddHostAsync(new HostConfig
        {
            Id = "tcp-host",
            ReconnectPolicy = ReconnectPolicy.Disabled,
            TransportFactory = (_, _) =>
            {
                var transport = new CorpusTransport();
                RespondAutomatically(transport);
                lock (transports) transports.Add(transport);
                return Task.FromResult<ITransport>(transport);
            },
        }).ConfigureAwait(false);
        var (_, tcp) = await multi.SubscribeWindowedAsync("tcp-host", "ahp-tcp:/test",
            new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        var generation = multi.Host("tcp-host")!.Generation;
        await multi.ReconnectAsync("tcp-host").ConfigureAwait(false);
        await WindowedDeliveryCorpusTests.UntilAsync(() => multi.Host("tcp-host")!.Generation > generation).ConfigureAwait(false);
        Assert.True(tcp.Closed);
        var request = transports[1].Snapshot().First(x => x.Json.GetProperty("method").GetString() == "reconnect").Json;
        Assert.DoesNotContain(request.GetProperty("params").GetProperty("subscriptions").EnumerateArray(),
            x => x.GetString() == tcp.Uri);
        Assert.False(request.GetProperty("params").TryGetProperty("windows", out _));
    }

    [Theory]
    [InlineData(null, 1048576)]
    [InlineData(33554432L, 22369620)]
    public async Task TransportDefaultsAreEncodingSafe(long? cap, long expected) =>
        await CheckDefaultAsync(cap, expected);

    private static async Task CheckDefaultAsync(long? cap, long expected)
    {
        var transport = new CorpusTransport { MaximumInboundMessageBytes = cap };
        await using var client = AhpClient.Connect(transport);
        RespondAutomatically(transport);
        var (_, owner) = await client.SubscribeWindowedAsync(Uri).ConfigureAwait(false);
        Assert.Equal(expected, owner.Offer.MaximumFrameBytes);
        Assert.Equal(262144, owner.Offer.WindowBytes);
    }

    [Fact]
    public async Task AutomaticIteratorReleasesOnlyOnAdvanceAndDisposal() =>
        await CheckAutomaticAsync();

    private static async Task CheckAutomaticAsync()
    {
        var transport = new CorpusTransport();
        RespondAutomatically(transport);
        await using var client = AhpClient.Connect(transport);
        var (_, owner) = await client.SubscribeWindowedAsync(Uri).ConfigureAwait(false);
        var observers = client.CreateEventStream();
        using (observers)
        {
            transport.Inject(SnapshotText);
            await using var iterator = owner.ReadEventsAsync().GetAsyncEnumerator();
            Assert.True(await iterator.MoveNextAsync().ConfigureAwait(false));
            Assert.IsType<SubscriptionEventSnapshot>(iterator.Current);
            Assert.DoesNotContain(transport.Snapshot(), x => x.Json.GetProperty("method").GetString() == "channel/credit");
            var waiting = iterator.MoveNextAsync().AsTask();
            await WindowedDeliveryCorpusTests.UntilAsync(() => HasCredit(transport, (long)SnapshotText.Length * 2)).ConfigureAwait(false);
            Assert.False(waiting.IsCompleted);
            transport.Inject("{\"jsonrpc\":\"2.0\",\"method\":\"future/data\",\"params\":{\"channel\":\"ahp-test:/window\",\"value\":1}}");
            Assert.True(await waiting.ConfigureAwait(false));
            Assert.IsType<SubscriptionEventNotification>(iterator.Current);
        }
        await WindowedDeliveryCorpusTests.UntilAsync(() => owner.FlowControl.BufferedReceiveBytes == 0).ConfigureAwait(false);
    }

    [Theory]
    [InlineData("snapshot")]
    [InlineData("replay")]
    [InlineData("live")]
    public async Task ManagedEpochRetainsUnreadItemsWithoutCreditingNewConnection(string recovery) =>
        await CheckEpochAsync(recovery);

    private static async Task CheckEpochAsync(string recovery)
    {
        var first = new CorpusTransport();
        RespondAutomatically(first);
        await using var oldClient = AhpClient.Connect(first);
        oldClient.RetainManagedWindows = true;
        var (_, owner) = await oldClient.SubscribeWindowedAsync(Uri, new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        first.Inject(SnapshotText);
        await WindowedDeliveryCorpusTests.UntilAsync(() => owner.Queue.Count == 1).ConfigureAwait(false);
        await oldClient.ShutdownAsync().ConfigureAwait(false);
        var transport = new CorpusTransport();
        RespondAutomatically(transport, recovery);
        await using var client = AhpClient.Connect(transport);
        client.BindManagedWindow(owner);
        var result = await client.ResumeAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "window-client",
            LastSeenServerSeq = 7,
            Subscriptions = new List<string> { Uri },
            Windows = new ChannelDeliveryResumeOptions
            {
                Items = new List<ChannelDeliveryResumeParams>
                {
                    new() { Channel = Uri, FlowControl = new SubscriptionFlowControlOptions { Receive = owner.Offer }, LastAppliedServerSeq = owner.LastAppliedServerSeq },
                },
            },
        }).ConfigureAwait(false);
        Assert.NotNull(result);
        var old = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        old.Dispose();
        Assert.DoesNotContain(transport.Snapshot(), x => x.Json.GetProperty("method").GetString() == "channel/credit");
        Assert.Equal(0, owner.FlowControl.BufferedReceiveBytes);
        if (recovery == "snapshot") transport.Inject(SnapshotText);
        else transport.Inject("{\"jsonrpc\":\"2.0\",\"method\":\"future/data\",\"params\":{\"channel\":\"ahp-test:/window\"}}");
        using var current = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        current.Release();
        await WindowedDeliveryCorpusTests.UntilAsync(() => HasCredit(transport, current.WireBytes)).ConfigureAwait(false);
    }

    [Fact]
    public async Task MultiHostKeepsOwnerAndOptionsAcrossReconnect() =>
        await CheckMultiHostAsync();

    private static async Task CheckMultiHostAsync()
    {
        var transports = new List<CorpusTransport>();
        await using var multi = new MultiHostClient();
        await multi.AddHostAsync(new HostConfig
        {
            Id = "window-host",
            ReconnectPolicy = ReconnectPolicy.Disabled,
            TransportFactory = (_, _) =>
            {
                var transport = new CorpusTransport();
                RespondAutomatically(transport);
                lock (transports) transports.Add(transport);
                return Task.FromResult<ITransport>(transport);
            },
        }).ConfigureAwait(false);
        var (_, owner) = await multi.SubscribeWindowedAsync("window-host", Uri,
            new WindowOptions { Receive = ReceiveMode.Manual, WindowBytes = 8192 }).ConfigureAwait(false);
        transports[0].Inject(SnapshotText);
        await WindowedDeliveryCorpusTests.UntilAsync(() => owner.LastAppliedServerSeq == 7).ConfigureAwait(false);
        var generation = multi.Host("window-host")!.Generation;
        await multi.ReconnectAsync("window-host").ConfigureAwait(false);
        await WindowedDeliveryCorpusTests.UntilAsync(() => multi.Host("window-host")!.Generation > generation).ConfigureAwait(false);
        Assert.Same(owner, multi.GetWindowedSubscription("window-host", Uri));
        var request = transports[1].Snapshot().First(x => x.Json.GetProperty("method").GetString() == "reconnect").Json;
        Assert.Equal(7, request.GetProperty("params").GetProperty("windows").GetProperty("items")[0].GetProperty("lastAppliedServerSeq").GetInt64());
        Assert.Equal(8192, owner.Offer.WindowBytes);
        using var old = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        old.Release();
        Assert.DoesNotContain(transports[1].Snapshot(), x => x.Json.GetProperty("method").GetString() == "channel/credit");
    }

    [Fact]
    public async Task CustomCoalescerAndTelemetryAreObservable() =>
        await CheckTelemetryAsync();

    private static async Task CheckTelemetryAsync()
    {
        var measurements = new System.Collections.Concurrent.ConcurrentDictionary<string, long>(StringComparer.Ordinal);
        using var meter = new MeterListener
        {
            InstrumentPublished = (instrument, listener) =>
            {
                if (instrument.Meter.Name == AhpTelemetry.Name) listener.EnableMeasurementEvents(instrument);
            },
        };
        meter.SetMeasurementEventCallback<long>((instrument, value, _, _) =>
            measurements.AddOrUpdate(instrument.Name, value, (_, previous) => previous + value));
        meter.Start();
        var events = new System.Collections.Concurrent.ConcurrentBag<string>();
        using var activities = new ActivityListener
        {
            ShouldListenTo = source => source.Name == AhpTelemetry.Name,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = activity =>
            {
                foreach (var ev in activity.Events) events.Add(ev.Name);
            },
        };
        ActivitySource.AddActivityListener(activities);
        var transport = new CorpusTransport();
        RespondAutomatically(transport);
        var config = new ClientConfig();
        config.Windowing.Coalescers.Add(new TestCoalescer());
        await using var client = AhpClient.Connect(transport, config);
        var flowEvents = client.FlowControlEvents();
        var (_, owner) = await client.SubscribeWindowedAsync(Uri, new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        transport.Inject(SnapshotText);
        using var snapshot = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        snapshot.Release();
        const string text = "{\"jsonrpc\":\"2.0\",\"method\":\"root/progress\",\"params\":{\"channel\":\"ahp-test:/window\",\"progressToken\":\"p\"}}";
        transport.Inject(text);
        transport.Inject(text);
        await WindowedDeliveryCorpusTests.UntilAsync(() =>
        {
            lock (owner.Gate) return owner.Queue.First?.Value.WireBytes == text.Length * 4L;
        }).ConfigureAwait(false);
        meter.RecordObservableInstruments();
        Assert.True(measurements.ContainsKey("ahp.client.window.buffered"));
        using var merged = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        merged.Release();
        await WindowedDeliveryCorpusTests.UntilAsync(() => measurements.ContainsKey("ahp.client.window.credit.sent")).ConfigureAwait(false);
        Assert.True(measurements["ahp.client.window.data.received"] > 0);
        Assert.Contains(events, x => x == "ahp.flowcontrol.coalesced");
        Assert.True(flowEvents.TryRead(out _));
    }

    private sealed class TestCoalescer : IChannelMessageCoalescer
    {
        public JsonRpcNotification? Coalesce(JsonRpcNotification earlier, JsonRpcNotification later, CoalescingContext context) =>
            context.Direction == CoalescingDirection.Incoming && earlier.Method == "root/progress" ? later : null;
    }

    private static bool HasCredit(CorpusTransport transport, long amount) => transport.Snapshot().Any(x =>
        x.Json.GetProperty("method").GetString() == "channel/credit"
        && x.Json.GetProperty("params").GetProperty("consumedBytes").GetInt64() >= amount);

    private static void RespondAutomatically(CorpusTransport transport, string recovery = "replay", bool keepWindows = true)
    {
        transport.OnSent = request =>
        {
            if (!request.TryGetProperty("id", out var id)) return;
            var method = request.GetProperty("method").GetString();
            object result;
            if (method == "subscribe")
            {
                var offer = Ser.Deserialize<SubscribeParams>(request.GetProperty("params")).FlowControl!.Receive;
                result = new SubscribeResult { FlowControl = new ChannelFlowControl { ClientReceive = offer, HostReceive = offer } };
            }
            else if (method == "initialize")
                result = new InitializeResult { ProtocolVersion = "1.0.0", ServerSeq = 0, Snapshots = new List<Snapshot>() };
            else if (method == "reconnect")
            {
                var parameters = Ser.Deserialize<ReconnectParams>(request.GetProperty("params"));
                var items = parameters.Windows?.Items.Where(_ => keepWindows).Select(x => new ResumedChannelSubscription
                {
                    Channel = x.Channel,
                    FlowControl = new ChannelFlowControl { ClientReceive = x.FlowControl.Receive, HostReceive = x.FlowControl.Receive },
                    Recovery = recovery switch { "snapshot" => ChannelRecoveryKind.Snapshot, "live" => ChannelRecoveryKind.Live, _ => ChannelRecoveryKind.Replay },
                }).ToList();
                result = new ReconnectReplayResult
                {
                    Type = ReconnectResultType.Replay,
                    Actions = new List<ActionEnvelope>(),
                    Missing = new List<string>(),
                    Windows = items is null ? null : new ChannelDeliveryResumeResult { Items = items },
                };
            }
            else result = new Dictionary<string, JsonElement>();
            transport.Inject("{\"jsonrpc\":\"2.0\",\"id\":" + id.GetRawText() + ",\"result\":" + Ser.Serialize(result) + "}");
        };
    }
}
