#nullable enable

using System.Diagnostics.Metrics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol.Hosts;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

[CollectionDefinition("Window lifecycle", DisableParallelization = true)]
public sealed class WindowLifecycleIsolation { }

[Collection("Window lifecycle")]
public sealed class WindowedLifecycleTests
{
    private const string Uri = "ahp-test:/lifecycle";
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    [Fact]
    public async Task LateReconnectResponseAfterTimeoutIsCleanedUpWithoutClosing() => await CheckLateReconnectAsync();

    private static async Task CheckLateReconnectAsync()
    {
        var transport = Peer();
        transport.OnSent = request =>
        {
            if (Method(request) != "reconnect") Respond(transport, request);
        };
        var time = new FakeTimeProvider();
        await using var client = AhpClient.Connect(transport, new ClientConfig
        {
            TimeProvider = time,
            DefaultRequestTimeout = TimeSpan.FromSeconds(1),
        });
        var reconnecting = client.ResumeAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "late-reconnect",
            LastSeenServerSeq = 0,
            Subscriptions = new List<string> { Uri },
            Windows = new ChannelDeliveryResumeOptions
            {
                Items = new List<ChannelDeliveryResumeParams>
                {
                    new()
                    {
                        Channel = Uri,
                        FlowControl = new SubscriptionFlowControlOptions
                        {
                            Receive = new ChannelReceiveLimits { WindowBytes = 262144, MaximumFrameBytes = 1048576 },
                        },
                    },
                },
            },
        });
        await WindowedDeliveryCorpusTests.UntilAsync(() => transport.Snapshot().Any(x => Method(x.Json) == "reconnect")).ConfigureAwait(false);
        var request = transport.Snapshot().First(x => Method(x.Json) == "reconnect").Json;
        time.Advance(TimeSpan.FromSeconds(1));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => reconnecting).ConfigureAwait(false);
        Assert.Null(client.GetWindowedSubscription(Uri));
        Respond(transport, request);
        Notify(transport, "channel/snapshot", new ChannelSnapshotParams { Channel = Uri, Snapshot = Snapshot(Uri, 1) });
        await WindowedDeliveryCorpusTests.UntilAsync(() => transport.Snapshot().Any(x => Method(x.Json) == "unsubscribe")).ConfigureAwait(false);
        await client.PingAsync().ConfigureAwait(false);
        Assert.Equal(0, client.PendingWindowResponseCount);
        Assert.False(client.Completion.IsCompleted);
    }

    [Fact]
    public async Task ClosedChannelHistoryRemainsBoundedWithoutDuplicateEntries() => await CheckHistoryAsync();

    private static async Task CheckHistoryAsync()
    {
        var transport = Peer();
        await using var client = AhpClient.Connect(transport);
        for (var i = 0; i < 1030; i++)
        {
            var (_, owner) = await client.SubscribeWindowedAsync("ahp-test:/history-" + i).ConfigureAwait(false);
            await owner.UnsubscribeAsync().ConfigureAwait(false);
        }
        Assert.Equal(1024, client.ClosedWindowCount);
        for (var i = 0; i < 5; i++)
        {
            var (_, owner) = await client.SubscribeWindowedAsync("ahp-test:/history-1029").ConfigureAwait(false);
            await owner.UnsubscribeAsync().ConfigureAwait(false);
        }
        Assert.Equal(1024, client.ClosedWindowCount);
    }

    [Fact]
    public async Task UnsubscribeIgnoresInflightWindowTrafficAndCancelsCreditTimer() => await CheckUnsubscribeAsync();

    private static async Task CheckUnsubscribeAsync()
    {
        var time = new FakeTimeProvider();
        var transport = Peer();
        await using var client = AhpClient.Connect(transport, new ClientConfig { TimeProvider = time });
        var (_, owner) = await client.SubscribeWindowedAsync(Uri, new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        Notify(transport, "channel/snapshot", new ChannelSnapshotParams { Channel = Uri, Snapshot = Snapshot(Uri, 1) });
        using var delivery = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        delivery.Release();
        Assert.True(owner.CreditTimer);
        await owner.UnsubscribeAsync().ConfigureAwait(false);
        Assert.False(owner.CreditTimer);
        time.Advance(TimeSpan.FromSeconds(1));
        Notify(transport, "channel/credit", new ChannelCreditParams { Channel = Uri, ConsumedBytes = 999999 });
        Notify(transport, "channel/frame", new ChannelFrameParams { Channel = Uri, Data = "{", Final = true });
        Notify(transport, "channel/snapshot", new ChannelSnapshotParams { Channel = Uri, Snapshot = Snapshot(Uri, 2) });
        await client.PingAsync().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        Assert.False(client.Completion.IsCompleted);
        Assert.DoesNotContain(transport.Snapshot(), x => Method(x.Json) == "channel/credit");
        var (_, replacement) = await client.SubscribeWindowedAsync(Uri, new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        Assert.NotSame(owner, replacement);
        Assert.Equal(0, replacement.Received);
        Assert.Equal(0, replacement.Sent);
        Assert.Equal(0, replacement.CreditSent);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UnsentSubscribeCancellationOrTimeoutDoesNotTrapPlainSends(bool timeout) => await CheckUnsentAsync(timeout);

    private static async Task CheckUnsentAsync(bool timeout)
    {
        var transport = new GatedTransport(Peer());
        var time = new FakeTimeProvider();
        await using var client = AhpClient.Connect(transport, new ClientConfig
        {
            TimeProvider = time,
            DefaultRequestTimeout = TimeSpan.FromSeconds(1),
        });
        var blocker = client.NotifyAsync("ordinary/blocked", new TcpEofParams { Channel = Uri });
        await transport.Entered.Task.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        using var cancellation = new CancellationTokenSource();
        var subscribing = client.SubscribeWindowedAsync(Uri, cancellationToken: timeout ? default : cancellation.Token);
        await WindowedDeliveryCorpusTests.UntilAsync(() => client.PendingWindowResponseCount == 1).ConfigureAwait(false);
        if (timeout) time.Advance(TimeSpan.FromSeconds(1));
        else cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => subscribing).ConfigureAwait(false);
        Assert.Null(client.GetWindowedSubscription(Uri));
        Assert.Equal(0, client.PendingWindowResponseCount);
        transport.Release.TrySetResult(true);
        await blocker.ConfigureAwait(false);
        await client.DispatchAsync(Uri, new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "ordinary",
        })).WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        Assert.DoesNotContain(transport.Inner.Snapshot(), x => Method(x.Json) == "subscribe");
        Assert.False(client.Completion.IsCompleted);
    }

    [Theory]
    [InlineData("cancel")]
    [InlineData("timeout")]
    [InlineData("unsubscribe")]
    [InlineData("rpc-error")]
    public async Task AbandonedSubscribeAndLateSnapshotDoNotCloseConnection(string reason) => await CheckAbandonedAsync(reason);

    private static async Task CheckAbandonedAsync(string reason)
    {
        var transport = Peer();
        var time = new FakeTimeProvider();
        transport.OnSent = request =>
        {
            if (Method(request) != "subscribe") Respond(transport, request);
        };
        await using var client = AhpClient.Connect(transport, new ClientConfig
        {
            TimeProvider = time,
            DefaultRequestTimeout = TimeSpan.FromSeconds(1),
        });
        using var cancellation = new CancellationTokenSource();
        var subscribing = client.SubscribeWindowedAsync(Uri, cancellationToken: cancellation.Token);
        await WindowedDeliveryCorpusTests.UntilAsync(() => transport.Snapshot().Any(x => Method(x.Json) == "subscribe")).ConfigureAwait(false);
        var request = transport.Snapshot().First(x => Method(x.Json) == "subscribe").Json;
        if (reason == "cancel") cancellation.Cancel();
        else if (reason == "timeout") time.Advance(TimeSpan.FromSeconds(1));
        else if (reason == "unsubscribe") await client.UnsubscribeAsync(Uri).ConfigureAwait(false);
        else ReplyError(transport, request);
        await Assert.ThrowsAnyAsync<Exception>(() => subscribing).ConfigureAwait(false);
        Assert.Null(client.GetWindowedSubscription(Uri));
        if (reason != "rpc-error")
        {
            Respond(transport, request);
            Notify(transport, "channel/snapshot", new ChannelSnapshotParams { Channel = Uri, Snapshot = Snapshot(Uri, 1) });
            await WindowedDeliveryCorpusTests.UntilAsync(() => transport.Snapshot().Any(x => Method(x.Json) == "unsubscribe")).ConfigureAwait(false);
        }
        await client.NotifyAsync("ordinary/data", new TcpEofParams { Channel = Uri }).WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        await client.PingAsync().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        Assert.Equal(0, client.PendingWindowResponseCount);
        Assert.False(client.Completion.IsCompleted);
    }

    [Fact]
    public async Task LargeSingleSendAndControlsBypassTinySendBudget() => await CheckLargeAndControlsAsync();

    private static async Task CheckLargeAndControlsAsync()
    {
        var transport = Peer();
        transport.OnSent = request =>
        {
            if (Method(request) == "subscribe")
            {
                var parameters = Ser.Deserialize<SubscribeParams>(request.GetProperty("params"));
                Reply(transport, request, new SubscribeResult
                {
                    FlowControl = new ChannelFlowControl
                    {
                        ClientReceive = parameters.FlowControl!.Receive,
                        HostReceive = new ChannelReceiveLimits { WindowBytes = 1, MaximumFrameBytes = 1024 },
                    },
                });
            }
            else Respond(transport, request);
        };
        await using var client = AhpClient.Connect(transport, new ClientConfig
        {
            Windowing = new WindowingConfig { MaxBufferedSendBytes = 1 },
        });
        var (_, owner) = await client.SubscribeWindowedAsync(Uri, new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        await owner.WaitWritableAsync().ConfigureAwait(false);
        var sending = owner.NotifyAsync("future/large", new TcpDataParams { Channel = Uri, Data = new string('x', 2048) });
        await WindowedDeliveryCorpusTests.UntilAsync(() => transport.Snapshot().Any(x => Method(x.Json) == "channel/frame")).ConfigureAwait(false);
        Assert.False(sending.IsCompleted);
        await client.PingAsync().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        Notify(transport, "channel/snapshot", new ChannelSnapshotParams { Channel = Uri, Snapshot = Snapshot(Uri, 1) });
        using var snapshot = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        snapshot.Release();
        await WindowedDeliveryCorpusTests.UntilAsync(() => transport.Snapshot().Any(x => Method(x.Json) == "channel/credit")).ConfigureAwait(false);
        await owner.NotifyAsync("tcp/reset", new TcpResetParams { Channel = Uri }).WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        await owner.UnsubscribeAsync().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
        await Assert.ThrowsAsync<AhpClientClosedException>(() => sending).ConfigureAwait(false);
        Assert.False(client.Completion.IsCompleted);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task ManagedReadersEndOnRemoveAndShutdown(bool remove, bool manual) => await CheckManagedEndAsync(remove, manual);

    private static async Task CheckManagedEndAsync(bool remove, bool manual)
    {
        await using var multi = new MultiHostClient();
        await multi.AddHostAsync(Config(_ => Peer())).ConfigureAwait(false);
        var (_, owner) = await multi.SubscribeWindowedAsync("lifecycle", Uri,
            new WindowOptions { Receive = manual ? ReceiveMode.Manual : ReceiveMode.Auto }).ConfigureAwait(false);
        var observer = multi.EventsForHost("lifecycle", Uri);
        await using var iterator = owner.ReadEventsAsync().GetAsyncEnumerator();
        var waiting = manual ? owner.Deliveries.WaitToReadAsync().AsTask() : iterator.MoveNextAsync().AsTask();
        if (remove) await multi.RemoveHostAsync("lifecycle").WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false);
        else await multi.ShutdownAsync().WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false);
        await Assert.ThrowsAsync<HostShutDownException>(() => waiting).ConfigureAwait(false);
        await observer.Completion.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ClosedManagedOwnerIsNeverResumed(bool synchronous) => await CheckManagedCloseAsync(synchronous);

    private static async Task CheckManagedCloseAsync(bool synchronous)
    {
        var transports = new List<CorpusTransport>();
        await using var multi = new MultiHostClient();
        await multi.AddHostAsync(Config(_ =>
        {
            var transport = Peer();
            transports.Add(transport);
            return transport;
        })).ConfigureAwait(false);
        var (_, owner) = await multi.SubscribeWindowedAsync("lifecycle", Uri).ConfigureAwait(false);
        if (synchronous) owner.Dispose();
        else await owner.UnsubscribeAsync().ConfigureAwait(false);
        Assert.DoesNotContain(Uri, multi.Host("lifecycle")!.Subscriptions);
        var generation = multi.Host("lifecycle")!.Generation;
        await multi.ReconnectAsync("lifecycle").ConfigureAwait(false);
        await WindowedDeliveryCorpusTests.UntilAsync(() => multi.Host("lifecycle")!.Generation > generation).ConfigureAwait(false);
        var request = transports[1].Snapshot().First(x => Method(x.Json) == "reconnect").Json;
        Assert.DoesNotContain(request.GetProperty("params").GetProperty("subscriptions").EnumerateArray(), x => x.GetString() == Uri);
        Assert.False(request.GetProperty("params").TryGetProperty("windows", out _));
        Assert.True(owner.Closed);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FreshResubscribeFailureIsPerChannelAndShutdownCanCancelIt(bool stall) => await CheckFreshFailureAsync(stall);

    private static async Task CheckFreshFailureAsync(bool stall)
    {
        var transports = new List<CorpusTransport>();
        await using var multi = new MultiHostClient();
        await multi.AddHostAsync(Config(index =>
        {
            var transport = Peer();
            transports.Add(transport);
            if (index > 0)
                transport.OnSent = request =>
                {
                    if (Method(request) == "reconnect") ReplyError(transport, request);
                    else if (Method(request) == "subscribe" && request.GetProperty("params").GetProperty("channel").GetString() == Uri)
                    {
                        if (!stall) ReplyError(transport, request);
                    }
                    else Respond(transport, request);
                };
            return transport;
        })).ConfigureAwait(false);
        var (_, failed) = await multi.SubscribeWindowedAsync("lifecycle", Uri).ConfigureAwait(false);
        var (_, kept) = await multi.SubscribeWindowedAsync("lifecycle", "ahp-test:/kept").ConfigureAwait(false);
        var generation = multi.Host("lifecycle")!.Generation;
        await multi.ReconnectAsync("lifecycle").ConfigureAwait(false);
        await WindowedDeliveryCorpusTests.UntilAsync(() => transports.Count > 1
            && transports[1].Snapshot().Any(x => Method(x.Json) == "subscribe")).ConfigureAwait(false);
        if (stall)
        {
            await multi.ShutdownAsync().WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false);
            Assert.True(failed.Closed);
            Assert.True(kept.Closed);
        }
        else
        {
            await WindowedDeliveryCorpusTests.UntilAsync(() => multi.Host("lifecycle")!.Generation > generation).ConfigureAwait(false);
            Assert.True(failed.Closed);
            Assert.IsType<AhpRpcException>(failed.CloseError);
            Assert.False(kept.Closed);
            Assert.DoesNotContain(Uri, multi.Host("lifecycle")!.Subscriptions);
            Assert.Equal(HostStateKind.Connected, multi.Host("lifecycle")!.State.Kind);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task OrdinaryFallbackRecoveryPrecedesBackToBackLiveEvents(bool snapshot) => await CheckOrdinaryRecoveryAsync(snapshot);

    private static async Task CheckOrdinaryRecoveryAsync(bool snapshot)
    {
        await using var multi = new MultiHostClient();
        await multi.AddHostAsync(Config(index =>
        {
            var transport = Peer();
            transport.OnSent = request =>
            {
                if (Method(request) == "subscribe")
                    Reply(transport, request, new SubscribeResult { Snapshot = Snapshot(Uri, 1) });
                else if (Method(request) == "reconnect" && index > 0)
                {
                    if (snapshot)
                        Reply(transport, request, new ReconnectSnapshotResult
                        {
                            Type = ReconnectResultType.Snapshot,
                            Snapshots = new List<Snapshot> { Snapshot(Uri, 2) },
                        });
                    else
                        Reply(transport, request, new ReconnectReplayResult
                        {
                            Type = ReconnectResultType.Replay,
                            Actions = new List<ActionEnvelope> { Action(2) },
                            Missing = new List<string>(),
                        });
                    Notify(transport, "action", Action(3));
                }
                else Respond(transport, request);
            };
            return transport;
        })).ConfigureAwait(false);
        var (_, owner) = await multi.SubscribeWindowedAsync("lifecycle", Uri, new WindowOptions { Receive = ReceiveMode.Manual }).ConfigureAwait(false);
        using var initial = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        var observer = multi.EventsForHost("lifecycle", Uri);
        var generation = multi.Host("lifecycle")!.Generation;
        await multi.ReconnectAsync("lifecycle").ConfigureAwait(false);
        await WindowedDeliveryCorpusTests.UntilAsync(() => multi.Host("lifecycle")!.Generation > generation).ConfigureAwait(false);
        using var first = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        using var second = await owner.Deliveries.ReadAsync().ConfigureAwait(false);
        Assert.Equal(2, Sequence(first.Event));
        Assert.Equal(3, Sequence(second.Event));
        Assert.Equal(2, Sequence(await observer.ReadAsync().ConfigureAwait(false)));
        Assert.Equal(3, Sequence(await observer.ReadAsync().ConfigureAwait(false)));
        Assert.Equal(3, multi.Host("lifecycle")!.ServerSeq);
    }

    [Fact]
    public async Task RegistryIsPrunedWithoutGaugeCollectionAndReconnectMetricsRemain() => await CheckTelemetryAsync();

    private static async Task CheckTelemetryAsync()
    {
        var baseline = AhpTelemetry.TrackedWindowCount;
        var transport = Peer();
        await using (var client = AhpClient.Connect(transport))
            for (var i = 0; i < 40; i++)
            {
                var (_, owner) = await client.SubscribeWindowedAsync("ahp-test:/registry-" + i).ConfigureAwait(false);
                await owner.UnsubscribeAsync().ConfigureAwait(false);
            }
        Assert.True(AhpTelemetry.TrackedWindowCount <= baseline);
        long reconnects = 0;
        using var listener = new MeterListener
        {
            InstrumentPublished = (instrument, meter) =>
            {
                if (instrument.Name == "ahp.client.reconnects") meter.EnableMeasurementEvents(instrument);
            },
        };
        listener.SetMeasurementEventCallback<long>((_, value, _, _) => Interlocked.Add(ref reconnects, value));
        listener.Start();
        await using var multi = new MultiHostClient();
        await multi.AddHostAsync(Config(_ => Peer())).ConfigureAwait(false);
        var generation = multi.Host("lifecycle")!.Generation;
        await multi.ReconnectAsync("lifecycle").ConfigureAwait(false);
        await WindowedDeliveryCorpusTests.UntilAsync(() => multi.Host("lifecycle")!.Generation > generation && Volatile.Read(ref reconnects) >= 2).ConfigureAwait(false);
        Assert.Equal(2, Volatile.Read(ref reconnects));
    }

    [Theory]
    [InlineData("notify")]
    [InlineData("dispatchAction")]
    [InlineData("unsubscribe")]
    public async Task OrdinarySendsDrainBeforeShutdownAndObserversEnd(string method) => await CheckOrdinaryShutdownAsync(method);

    private static async Task CheckOrdinaryShutdownAsync(string method)
    {
        var transport = Peer();
        await using var client = AhpClient.Connect(transport);
        using var events = client.CreateEventStream();
        var sent = method switch
        {
            "dispatchAction" => client.DispatchAsync(Uri, new StateAction(new SessionTitleChangedAction { Type = ActionType.SessionTitleChanged, Title = "sent" })),
            "unsubscribe" => client.UnsubscribeAsync(Uri),
            _ => client.NotifyAsync("notify", new TcpEofParams { Channel = Uri }),
        };
        await client.ShutdownAsync().WaitAsync(TimeSpan.FromSeconds(2)).ConfigureAwait(false);
        await sent.ConfigureAwait(false);
        Assert.Contains(transport.Snapshot(), x => Method(x.Json) == method);
        await events.Events.Completion.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
    }

    private static HostConfig Config(Func<int, CorpusTransport> factory)
    {
        var index = -1;
        return new HostConfig
        {
            Id = "lifecycle",
            ReconnectPolicy = ReconnectPolicy.Disabled,
            ClientConfig = new ClientConfig { DefaultRequestTimeout = TimeSpan.Zero },
            TransportFactory = (_, _) => Task.FromResult<ITransport>(factory(Interlocked.Increment(ref index))),
        };
    }

    private static CorpusTransport Peer()
    {
        var transport = new CorpusTransport();
        transport.OnSent = request => Respond(transport, request);
        return transport;
    }

    private static void Respond(CorpusTransport transport, JsonElement request)
    {
        if (!request.TryGetProperty("id", out _)) return;
        object result;
        if (Method(request) == "initialize")
            result = new InitializeResult { ProtocolVersion = ProtocolVersion.Supported[0], Snapshots = new List<Snapshot>(), ServerSeq = 0 };
        else if (Method(request) == "subscribe")
        {
            var parameters = Ser.Deserialize<SubscribeParams>(request.GetProperty("params"));
            result = new SubscribeResult
            {
                FlowControl = parameters.FlowControl is { } flow
                    ? new ChannelFlowControl { ClientReceive = flow.Receive, HostReceive = flow.Receive } : null,
            };
        }
        else if (Method(request) == "reconnect")
        {
            var parameters = Ser.Deserialize<ReconnectParams>(request.GetProperty("params"));
            result = new ReconnectReplayResult
            {
                Type = ReconnectResultType.Replay,
                Actions = new List<ActionEnvelope>(),
                Missing = new List<string>(),
                Windows = parameters.Windows is null ? null : new ChannelDeliveryResumeResult
                {
                    Items = parameters.Windows.Items.Select(x => new ResumedChannelSubscription
                    {
                        Channel = x.Channel,
                        FlowControl = new ChannelFlowControl { ClientReceive = x.FlowControl.Receive, HostReceive = x.FlowControl.Receive },
                        Recovery = ChannelRecoveryKind.Live,
                    }).ToList(),
                },
            };
        }
        else result = new Dictionary<string, JsonElement>();
        Reply(transport, request, result);
    }

    private static void Reply(CorpusTransport transport, JsonElement request, object result) =>
        transport.Inject(Ser.EncodeMessage(new JsonRpcMessage
        {
            SuccessResponse = new JsonRpcSuccessResponse { Id = request.GetProperty("id").GetUInt64(), Result = Ser.SerializeToElement(result) },
        }).Text!);

    private static void ReplyError(CorpusTransport transport, JsonElement request) =>
        transport.Inject(Ser.EncodeMessage(new JsonRpcMessage
        {
            ErrorResponse = new JsonRpcErrorResponse
            {
                Id = request.GetProperty("id").GetUInt64(),
                Error = new JsonRpcErrorObject { Code = -32601, Message = "not available" },
            },
        }).Text!);

    private static void Notify<T>(CorpusTransport transport, string method, T parameters) =>
        transport.Inject(Ser.EncodeMessage(new JsonRpcMessage
        {
            Notification = new JsonRpcNotification { Method = method, Params = Ser.SerializeToElement(parameters) },
        }).Text!);

    private static string? Method(JsonElement message) => message.GetProperty("method").GetString();
    private static Snapshot Snapshot(string uri, long sequence) => new() { Resource = uri, State = new SnapshotState { Empty = new EmptyState() }, FromSeq = sequence };
    private static ActionEnvelope Action(long sequence) => new()
    {
        Channel = Uri,
        ServerSeq = sequence,
        Action = new StateAction(new SessionTitleChangedAction { Type = ActionType.SessionTitleChanged, Title = sequence.ToString(System.Globalization.CultureInfo.InvariantCulture) }),
    };
    private static long Sequence(SubscriptionEvent value) => value switch
    {
        SubscriptionEventAction action => action.Envelope.ServerSeq,
        SubscriptionEventSnapshot snapshot => snapshot.Snapshot.FromSeq,
        _ => throw new InvalidOperationException("Unexpected event."),
    };

    private sealed class GatedTransport(CorpusTransport inner) : ITransport
    {
        internal CorpusTransport Inner => inner;
        internal readonly TaskCompletionSource<bool> Entered = WindowedSubscription.Signal();
        internal readonly TaskCompletionSource<bool> Release = WindowedSubscription.Signal();
        public async ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default)
        {
            Entered.TrySetResult(true);
            await Release.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
            await inner.SendAsync(message, cancellationToken).ConfigureAwait(false);
        }
        public ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default) => inner.ReceiveAsync(cancellationToken);
        public ValueTask CloseAsync(CancellationToken cancellationToken = default) => inner.CloseAsync(cancellationToken);
        public ValueTask DisposeAsync() => inner.DisposeAsync();
    }
}
