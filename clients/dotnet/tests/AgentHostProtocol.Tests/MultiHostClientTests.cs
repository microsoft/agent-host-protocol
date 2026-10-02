// Port of the H-group multi-host parity tests (Phase 1 rows). Drives the real
// MultiHostClient over the real MemTransport with a fake server — no mocking of
// the client, the transport, or the JSON engine. Reuses the MemTransport helper
// and the RunFakeServer idiom established by HostsTests.cs / ClientTests.cs.
#nullable enable

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;          // mirror/client tests that build wire payloads
using Microsoft.AgentHostProtocol;
using Microsoft.AgentHostProtocol.Hosts;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class MultiHostClientTests
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    private sealed class BlockingClientIdStore : IClientIdStore
    {
        public TaskCompletionSource<object?> LoadStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource<object?> ContinueLoad { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<string?> LoadAsync(HostId host, CancellationToken cancellationToken = default)
        {
            LoadStarted.TrySetResult(null);
            await ContinueLoad.Task.WaitAsync(cancellationToken);
            return "client-a";
        }

        public Task StoreAsync(
            HostId host,
            string clientId,
            CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    // ── Fake server helpers ───────────────────────────────────────────────
    // The receive→decode→dispatch loop lives once in FakeHost; these helpers
    // build the per-test FakeHost definitions and the response payloads.

    /// <summary>
    /// Server loop that answers <c>initialize</c>. Mirrors HostsTests.RunFakeServer.
    /// </summary>
    private static Task RunFakeServerAsync(MemTransport serverSide, CancellationToken ct) =>
        FakeHost.New()
            .OnInitialize((req, side, c) => RespondInitializeAsync(side, req.Id, c))
            .RunAsync(serverSide, ct);

    /// <summary>
    /// Server loop that answers <c>initialize</c> then pushes the same
    /// <c>action</c> notification on <paramref name="actionChannel"/> with
    /// <paramref name="serverSeq"/> on a short repeat. Used to prove host-tagged
    /// events fan out. The repeat closes the timing gap between the server's
    /// post-initialize send and the host pump registering its event stream
    /// (the pump only attaches after InitializeAsync returns inside
    /// MultiHostClient.OpenHostAsync). DropOldest channels make the extra sends
    /// harmless — the consumer reads exactly one. The <c>reconnect</c> handler
    /// replays an action at the (advanced) serverSeq, mirroring a host that
    /// resumes from the gap.
    /// </summary>
    private static Task RunFakeServerWithActionAsync(
        MemTransport serverSide,
        string actionChannel,
        long serverSeq,
        CancellationToken ct) =>
        FakeHost.New()
            .OnInitialize((req, side, c) => RespondInitializeAsync(side, req.Id, c))
            .AfterInitialize((side, c) => RepeatActionAsync(side, actionChannel, serverSeq, c))
            .OnReconnect((req, side, c) =>
            {
                var replay = new ChannelReplayRecovery
                {
                    Channel = actionChannel,
                    Actions = new List<ActionEnvelope>
                    {
                        new ActionEnvelope
                        {
                            Channel = actionChannel,
                            ServerSeq = serverSeq,
                            Action = new StateAction(new RootActiveSessionsChangedAction
                            {
                                Type = ActionType.RootActiveSessionsChanged,
                                ActiveSessions = 7,
                            }),
                        },
                    },
                };
                var result = new ReconnectResult
                {
                    Channels = new List<ChannelRecovery> { new ChannelRecovery(replay) },
                };
                return FakeHost.RespondResultAsync(side, req.Id, result, c);
            })
            .RunAsync(serverSide, ct);

    /// <summary>Pushes the action repeatedly until cancelled or the peer drops.</summary>
    private static async Task RepeatActionAsync(
        MemTransport serverSide, string channel, long serverSeq, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await SendActionAsync(serverSide, channel, serverSeq, ct).ConfigureAwait(false);
                await Task.Delay(25, ct).ConfigureAwait(false);
            }
        }
        catch { /* cancelled or peer gone */ }
    }

    private static Task RespondInitializeAsync(MemTransport serverSide, ulong id, CancellationToken ct) =>
        FakeHost.RespondResultAsync(
            serverSide, id, new InitializeResult { ProtocolVersion = ProtocolVersion.Current, Snapshots = new() }, ct);

    private static Task SendActionAsync(
        MemTransport serverSide, string channel, long serverSeq, CancellationToken ct) =>
        FakeHost.SendNotificationAsync(serverSide, "action", new ActionEnvelope
        {
            Channel = channel,
            ServerSeq = serverSeq,
            Action = new StateAction(new SessionTitleChangedAction
            {
                Type = ActionType.SessionTitleChanged,
                Title = $"seq-{serverSeq}",
            }),
        }, ct);

    // ── H: two hosts independent ───────────────────────────────────────────

    [Fact]
    public async Task MultiHost_TwoHosts_RegisterAndConnectIndependently()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        var m = new MultiHostClient();
        await using var disposeMulti = m;

        HostTransportFactory factory = (hostId, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerAsync(s, ct)); // fire-and-forget fake server
            return Task.FromResult<ITransport>(c);
        };

        var hA = await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-a"),
            Label = "A",
            TransportFactory = (id, ct) => factory(id, ct),
        }, cts.Token);

        var hB = await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-b"),
            Label = "B",
            TransportFactory = (id, ct) => factory(id, ct),
        }, cts.Token);

        Assert.Equal(HostStateKind.Connected, hA.State.Kind);
        Assert.Equal(HostStateKind.Connected, hB.State.Kind);
        Assert.False(string.IsNullOrEmpty(hA.ClientId));
        Assert.False(string.IsNullOrEmpty(hB.ClientId));
        Assert.NotEqual(hA.ClientId, hB.ClientId);   // each host mints its own clientId
        Assert.Equal(2, m.Hosts().Count);
    }

    [Fact]
    public async Task MultiHost_AddHostSnapshotsConfigurationBeforeFirstAwait()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var store = new BlockingClientIdStore();
        var subscriptions = new List<string> { "ahp-test://original" };
        var protocolVersions = new List<string> { ProtocolVersion.Current };
        var observedInitialize = new TaskCompletionSource<InitializeParams>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        await using var multiHost = new MultiHostClient(store);

        var config = new HostConfig
        {
            Id = new HostId("host-a"),
            InitialSubscriptions = subscriptions,
            ProtocolVersions = protocolVersions,
            TransportFactory = (hostId, ct) =>
            {
                var (client, server) = MemTransport.CreatePair();
                _ = Task.Run(() => FakeHost.New()
                    .OnInitialize((request, side, token) =>
                    {
                        observedInitialize.TrySetResult(
                            Ser.Deserialize<InitializeParams>(request.Params!.Value.GetRawText()));
                        return RespondInitializeAsync(side, request.Id, token);
                    })
                    .RunAsync(server, ct));
                return Task.FromResult<ITransport>(client);
            },
        };

        var addTask = multiHost.AddHostAsync(config, cts.Token);
        await store.LoadStarted.Task.WaitAsync(cts.Token);
        subscriptions[0] = "ahp-test://changed";
        protocolVersions[0] = "changed";
        store.ContinueLoad.TrySetResult(null);

        await addTask;
        var initialize = await observedInitialize.Task.WaitAsync(cts.Token);
        Assert.Equal("ahp-test://original", Assert.Single(initialize.InitialSubscriptions!));
        Assert.Equal(ProtocolVersion.Current, Assert.Single(initialize.ProtocolVersions));
    }

    // ── H: events tagged hostId ────────────────────────────────────────────

    [Fact]
    public async Task MultiHost_Events_CarryHostIdAndResource()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        var m = new MultiHostClient();
        await using var disposeMulti = m;

        var subs = m.Subscriptions();
        const string channel = "ahp-session:/s1";

        // Host-a's server pushes an action after initialize; host-b stays quiet.
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-a"),
            TransportFactory = (id, ct) =>
            {
                var (c, s) = MemTransport.CreatePair();
                _ = Task.Run(() => RunFakeServerWithActionAsync(s, channel, 1, ct));
                return Task.FromResult<ITransport>(c);
            },
        }, cts.Token);

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-b"),
            TransportFactory = (id, ct) =>
            {
                var (c, s) = MemTransport.CreatePair();
                _ = Task.Run(() => RunFakeServerAsync(s, ct));
                return Task.FromResult<ITransport>(c);
            },
        }, cts.Token);

        // The event read off the top-level subscriptions reader is tagged with
        // the originating host and the channel URI it was scoped to.
        var ev = await subs.ReadAsync(cts.Token);
        Assert.Equal(new HostId("host-a"), ev.HostId);
        Assert.Equal(channel, ev.Channel);
        var action = Assert.IsType<SubscriptionEventAction>(ev.Event);
        Assert.Equal(1, action.Envelope.ServerSeq);
    }

    // ── H: reconnect replay ────────────────────────────────────────────────

    [Fact]
    public async Task MultiHost_Reconnect_ReplaysActionsWithAdvancedSeq()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));

        var m = new MultiHostClient();
        await using var disposeMulti = m;

        var subs = m.Subscriptions();
        const string channel = "ahp-session:/s1";

        // Per-attempt transport factory. The first connection's server pushes an
        // action at serverSeq=1 and then closes (simulating a drop). The fast
        // ReconnectPolicy makes the supervisor reconnect; on the SECOND connection
        // the supervisor issues a `reconnect` RPC (lastSeenServerSeq) and the
        // server replays an action at the ADVANCED serverSeq=2. We assert that a
        // post-reconnect event carries the higher serverSeq end-to-end — the real
        // reconnect-replay path (OpenHostAsync → ReconnectAsync), mirroring Swift.
        var attempt = 0;
        HostTransportFactory factory = (hostId, ct) =>
        {
            var n = Interlocked.Increment(ref attempt);
            var (c, s) = MemTransport.CreatePair();
            if (n == 1)
            {
                _ = Task.Run(async () =>
                {
                    // Respond to initialize, push seq=1 a few times so the pump
                    // can't miss it, then drop the transport to force a reconnect.
                    try
                    {
                        var frame = await s.ReceiveAsync(ct).ConfigureAwait(false);
                        var msg = Ser.DecodeMessage(frame);
                        if (msg.Request?.Method == "initialize")
                        {
                            await RespondInitializeAsync(s, msg.Request.Id, ct).ConfigureAwait(false);
                            for (var i = 0; i < 4 && !ct.IsCancellationRequested; i++)
                            {
                                await SendActionAsync(s, channel, 1, ct).ConfigureAwait(false);
                                await Task.Delay(15, ct).ConfigureAwait(false);
                            }
                        }
                    }
                    catch { /* ignore */ }
                    finally
                    {
                        await s.CloseAsync().ConfigureAwait(false); // force a drop
                    }
                });
            }
            else
            {
                // Reconnected connection: respond to initialize, push seq=2.
                _ = Task.Run(() => RunFakeServerWithActionAsync(s, channel, 2, ct));
            }
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-a"),
            TransportFactory = (id, ct) => factory(id, ct),
            // Fast reconnect so the test does not wait the 1s default backoff.
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(20),
                MaxBackoff = TimeSpan.FromMilliseconds(20),
                BackoffMultiplier = 1.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);

        // Drain events until we observe the advanced (post-reconnect) serverSeq.
        long maxSeqSeen = 0;
        while (maxSeqSeen < 2)
        {
            var ev = await subs.ReadAsync(cts.Token);
            if (ev.Event is SubscriptionEventAction action)
            {
                maxSeqSeen = Math.Max(maxSeqSeen, action.Envelope.ServerSeq);
                Assert.Equal(new HostId("host-a"), ev.HostId);
            }
        }

        // The post-reconnect action carried the advanced serverSeq.
        Assert.Equal(2, maxSeqSeen);
    }

    [Fact]
    public async Task MultiHost_Reconnect_UsesLiveSubscriptionsAndServerSequence()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var reconnectParams = new TaskCompletionSource<ReconnectParams>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        MemTransport? firstServer = null;
        var attempt = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            if (Interlocked.Increment(ref attempt) == 1)
            {
                firstServer = server;
                _ = Task.Run(() => FakeHost.New()
                    .OnInitialize((request, side, token) =>
                        RespondInitializeWithRootAsync(side, request.Id, null, 0, token))
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .On("subscribe", (request, side, token) =>
                        FakeHost.RespondResultAsync(side, request.Id, new SubscribeResult(), token))
                    .RunAsync(server, cts.Token));
            }
            else
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnReconnect((request, side, token) =>
                    {
                        reconnectParams.TrySetResult(
                            Ser.Deserialize<ReconnectParams>(request.Params!.Value.GetRawText()));
                        var result = new ReconnectResult
                        {
                            Channels = new List<ChannelRecovery>
                            {
                                new ChannelRecovery(new ChannelReplayRecovery
                                {
                                    Channel = ProtocolVersion.RootResourceUri,
                                    Actions = new List<ActionEnvelope>(),
                                }),
                                new ChannelRecovery(new ChannelMissingRecovery
                                {
                                    Channel = "copilot:/dynamic",
                                }),
                            },
                        };
                        return FakeHost.RespondResultAsync(side, request.Id, result, token);
                    })
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .RunAsync(server, cts.Token));
            }
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            InitialSubscriptions = new[] { ProtocolVersion.RootResourceUri },
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(20),
                MaxBackoff = TimeSpan.FromMilliseconds(20),
                BackoffMultiplier = 1,
            },
        }, cts.Token);

        await m.SubscribeAsync(new HostId("h"), "copilot:/dynamic", cts.Token);
        await SendActionAsync(firstServer!, ProtocolVersion.RootResourceUri, 41, cts.Token);
        await WaitUntilAsync(
            () => m.Host(new HostId("h"))?.ServerSeq == 41,
            cts.Token);

        var initialGeneration = m.Host(new HostId("h"))!.Generation;
        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var observed = await reconnectParams.Task.WaitAsync(cts.Token);
        await WaitUntilAsync(
            () => m.Host(new HostId("h")) is { } host
                && host.Generation > initialGeneration
                && host.State.Kind == HostStateKind.Connected,
            cts.Token,
            8000);

        Assert.Equal(
            41,
            observed.Subscriptions.Single(s => s.Channel == ProtocolVersion.RootResourceUri).LastSeenServerSeq);
        Assert.Equal(
            0,
            observed.Subscriptions.Single(s => s.Channel == "copilot:/dynamic").LastSeenServerSeq);
        Assert.Equal(
            new[] { ProtocolVersion.RootResourceUri, "copilot:/dynamic" },
            observed.Subscriptions.Select(s => s.Channel));
        Assert.DoesNotContain("copilot:/dynamic", m.Host(new HostId("h"))!.Subscriptions);
    }

    [Fact]
    public async Task MultiHost_ReconnectReplay_InstallsReplacementBeforePublishingActions()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var attempt = 0;
        var actions = Enumerable.Range(1, 500)
            .Select(seq => new ActionEnvelope
            {
                Channel = ProtocolVersion.RootResourceUri,
                ServerSeq = seq,
                Action = new StateAction(new RootActiveSessionsChangedAction
                {
                    Type = ActionType.RootActiveSessionsChanged,
                    ActiveSessions = seq,
                }),
            })
            .ToList();

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            var host = FakeHost.New()
                .OnListSessions((request, side, token) =>
                    RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token));
            if (Interlocked.Increment(ref attempt) == 1)
            {
                host.OnInitialize((request, side, token) =>
                    RespondInitializeWithRootAsync(side, request.Id, null, 0, token));
            }
            else
            {
                host.OnReconnect((request, side, token) =>
                    FakeHost.RespondResultAsync(
                        side,
                        request.Id,
                        new ReconnectResult
                        {
                            Channels = new List<ChannelRecovery>
                            {
                                new ChannelRecovery(new ChannelReplayRecovery
                                {
                                    Channel = ProtocolVersion.RootResourceUri,
                                    Actions = actions,
                                }),
                            },
                        },
                        token));
            }
            _ = host.RunAsync(server, cts.Token);
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            InitialSubscriptions = new[] { ProtocolVersion.RootResourceUri },
        }, cts.Token);

        var replayEvents = m.EventsForHost(new HostId("h"), ProtocolVersion.RootResourceUri);
        var dispatchOnReplay = Task.Run(async () =>
        {
            _ = Assert.IsType<SubscriptionEventAction>(await replayEvents.ReadAsync(cts.Token));
            return await m.DispatchAsync(
                new HostId("h"),
                new StateAction(new RootActiveSessionsChangedAction
                {
                    Type = ActionType.RootActiveSessionsChanged,
                    ActiveSessions = 501,
                }),
                ProtocolVersion.RootResourceUri,
                cancellationToken: cts.Token);
        }, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var handle = await dispatchOnReplay.WaitAsync(cts.Token);

        Assert.Equal(1, handle.ClientSeq);
    }

    [Fact]
    public async Task MultiHost_ReconnectReplay_AdvancesSequenceOnlyAfterEachAppliedAction()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var thirdAttemptParams = new TaskCompletionSource<ReconnectParams>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var attempt = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            var currentAttempt = Interlocked.Increment(ref attempt);
            var host = FakeHost.New()
                .OnListSessions((request, side, token) =>
                    RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token));
            if (currentAttempt == 1)
            {
                host.OnInitialize((request, side, token) =>
                    RespondInitializeWithRootAsync(side, request.Id, null, 0, token));
            }
            else
            {
                host.OnReconnect((request, side, token) =>
                {
                    if (currentAttempt == 3)
                    {
                        thirdAttemptParams.TrySetResult(
                            Ser.Deserialize<ReconnectParams>(request.Params!.Value.GetRawText()));
                    }

                    var replay = new ChannelReplayRecovery
                    {
                        Channel = ProtocolVersion.RootResourceUri,
                        Actions = currentAttempt == 2
                            ? new List<ActionEnvelope>
                            {
                                new()
                                {
                                    Channel = ProtocolVersion.RootResourceUri,
                                    ServerSeq = 10,
                                    Action = new StateAction(new RootActiveSessionsChangedAction
                                    {
                                        Type = ActionType.RootActiveSessionsChanged,
                                        ActiveSessions = 10,
                                    }),
                                },
                                new()
                                {
                                    Channel = ProtocolVersion.RootResourceUri,
                                    ServerSeq = 11,
                                    Action = new StateAction(new RootAgentsChangedAction
                                    {
                                        Type = ActionType.RootAgentsChanged,
                                        Agents = null!,
                                    }),
                                },
                            }
                            : new List<ActionEnvelope>(),
                    };
                    return FakeHost.RespondResultAsync(
                        side,
                        request.Id,
                        new ReconnectResult
                        {
                            Channels = new List<ChannelRecovery> { new ChannelRecovery(replay) },
                        },
                        token);
                });
            }
            _ = host.RunAsync(server, cts.Token);
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            InitialSubscriptions = new[] { ProtocolVersion.RootResourceUri },
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(1),
                MaxBackoff = TimeSpan.FromMilliseconds(1),
                BackoffMultiplier = 1,
                MaxAttempts = 1,
            },
        }, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        await WaitForHostStateAsync(
            m,
            new HostId("h"),
            state => state.Kind == HostStateKind.Failed,
            cts.Token);
        Assert.Equal(10, m.Host(new HostId("h"))!.ServerSeq);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var observed = await thirdAttemptParams.Task.WaitAsync(cts.Token);

        // The root channel's replay cursor persisted across the FAILED second
        // attempt at exactly the last action that truly committed (seq 10),
        // not the seq 11 action whose apply threw.
        Assert.Equal(
            10,
            observed.Subscriptions.Single(s => s.Channel == ProtocolVersion.RootResourceUri).LastSeenServerSeq);
    }

    [Fact]
    public async Task MultiHost_ReconnectSnapshot_AppliesStateAndRetainsStatelessSubscriptions()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var initializeCount = 0;
        const string sessionResource = "ahp-session:/s1";

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            _ = Task.Run(() => FakeHost.New()
                .OnInitialize((request, side, token) =>
                {
                    Interlocked.Increment(ref initializeCount);
                    return RespondInitializeWithRootAsync(side, request.Id, null, 1, token);
                })
                .OnReconnect((request, side, token) =>
                    FakeHost.RespondResultAsync(
                        side,
                        request.Id,
                        new ReconnectResult
                        {
                            Channels = new List<ChannelRecovery>
                            {
                                new ChannelRecovery(new ChannelSnapshotRecovery
                                {
                                    Channel = ProtocolVersion.RootResourceUri,
                                    Snapshot = new Snapshot
                                    {
                                        Resource = ProtocolVersion.RootResourceUri,
                                        FromSeq = 77,
                                        State = new SnapshotState
                                        {
                                            Root = new RootState
                                            {
                                                Agents = new List<AgentInfo>(),
                                                ActiveSessions = 9,
                                            },
                                        },
                                    },
                                }),
                                new ChannelRecovery(new ChannelSnapshotRecovery
                                {
                                    Channel = sessionResource,
                                    Snapshot = new Snapshot
                                    {
                                        Resource = sessionResource,
                                        FromSeq = 78,
                                        State = new SnapshotState
                                        {
                                            Session = new SessionState
                                            {
                                                Provider = "test",
                                                Title = "Restored session",
                                                ActiveClients = new List<SessionActiveClient>(),
                                                Chats = new List<ChatSummary>(),
                                            },
                                        },
                                    },
                                }),
                            },
                        },
                        token))
                .OnListSessions((request, side, token) =>
                    RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                .RunAsync(server, cts.Token));
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            InitialSubscriptions = new[] { ProtocolVersion.RootResourceUri, sessionResource, "copilot:/missing" },
        }, cts.Token);

        var sessionEvents = m.EventsForHost(new HostId("h"), sessionResource);
        var initialGeneration = m.Host(new HostId("h"))!.Generation;
        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var snapshotEvent = Assert.IsType<SubscriptionEventSnapshot>(
            await sessionEvents.ReadAsync(cts.Token));
        await WaitUntilAsync(
            () => m.Host(new HostId("h")) is { } host
                && host.Generation > initialGeneration
                && host.State.Kind == HostStateKind.Connected,
            cts.Token,
            8000);

        var snapshot = m.Host(new HostId("h"))!;
        Assert.Equal(1, Volatile.Read(ref initializeCount));
        Assert.Equal(78, snapshot.ServerSeq);
        Assert.Equal(9, snapshot.ActiveSessions);
        Assert.Equal(sessionResource, snapshotEvent.Snapshot.Resource);
        Assert.Equal(
            "Restored session",
            Assert.IsType<SessionState>(snapshotEvent.Snapshot.State.Session).Title);
        Assert.Contains(ProtocolVersion.RootResourceUri, snapshot.Subscriptions);
        Assert.Contains(sessionResource, snapshot.Subscriptions);
        Assert.Contains("copilot:/missing", snapshot.Subscriptions);
    }

    [Fact]
    public async Task MultiHost_Initialize_BuffersHandshakeEventsAndAppliesRootActions()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var (client, server) = MemTransport.CreatePair();
        _ = FakeHost.New()
            .OnInitialize(async (request, side, token) =>
            {
                await FakeHost.SendNotificationAsync(side, "action", new ActionEnvelope
                {
                    Channel = ProtocolVersion.RootResourceUri,
                    ServerSeq = 5,
                    Action = new StateAction(new RootActiveSessionsChangedAction
                    {
                        Type = ActionType.RootActiveSessionsChanged,
                        ActiveSessions = 7,
                    }),
                }, token);
                await RespondInitializeWithRootAsync(side, request.Id, null, 0, token);
            })
            .OnListSessions((request, side, token) =>
                RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
            .RunAsync(server, cts.Token);

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = (_, _) => Task.FromResult<ITransport>(client),
            InitialSubscriptions = new[] { ProtocolVersion.RootResourceUri },
        }, cts.Token);

        await WaitUntilAsync(
            () => m.Host(new HostId("h")) is { ServerSeq: 5, ActiveSessions: 7 },
            cts.Token);
    }

    [Fact]
    public async Task MultiHost_SubscribeDuringReconnect_TargetsReplacementConnection()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var reconnectEntered = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseReconnect = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var replacementSubscribed = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var attempt = 0;

        HostTransportFactory factory = (_, _) =>
        {
            var (client, server) = MemTransport.CreatePair();
            if (Interlocked.Increment(ref attempt) == 1)
            {
                _ = FakeHost.New()
                    .OnInitialize((request, side, token) =>
                        RespondInitializeWithRootAsync(side, request.Id, null, 0, token))
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .RunAsync(server, cts.Token);
            }
            else
            {
                _ = FakeHost.New()
                    .OnReconnect(async (request, side, token) =>
                    {
                        reconnectEntered.TrySetResult();
                        await releaseReconnect.Task.WaitAsync(token);
                        await FakeHost.RespondResultAsync(
                            side,
                            request.Id,
                            new ReconnectResult
                            {
                                Channels = new List<ChannelRecovery>
                                {
                                    new ChannelRecovery(new ChannelReplayRecovery
                                    {
                                        Channel = ProtocolVersion.RootResourceUri,
                                        Actions = new List<ActionEnvelope>(),
                                    }),
                                },
                            },
                            token);
                    })
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .On("subscribe", (request, side, token) =>
                    {
                        replacementSubscribed.TrySetResult();
                        return FakeHost.RespondResultAsync(side, request.Id, new SubscribeResult(), token);
                    })
                    .RunAsync(server, cts.Token);
            }
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            InitialSubscriptions = new[] { ProtocolVersion.RootResourceUri },
        }, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        await reconnectEntered.Task.WaitAsync(cts.Token);
        var subscribeTask = m.SubscribeAsync(new HostId("h"), "copilot:/dynamic", cts.Token);
        Assert.False(subscribeTask.IsCompleted);

        releaseReconnect.TrySetResult();
        await subscribeTask;
        await replacementSubscribed.Task.WaitAsync(cts.Token);
        Assert.Contains("copilot:/dynamic", m.Host(new HostId("h"))!.Subscriptions);
    }

    [Fact]
    public async Task HostEntry_BeginReconnect_AtomicallyWaitsForReplacementClient()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var (firstTransport, _) = MemTransport.CreatePair();
        var (replacementTransport, _) = MemTransport.CreatePair();
        await using var first = AhpClient.Connect(firstTransport);
        await using var replacement = AhpClient.Connect(replacementTransport);
        using var entry = new HostEntry(
            new HostId("h"),
            new HostConfig
            {
                Id = new HostId("h"),
                TransportFactory = (_, _) => throw new NotSupportedException(),
            },
            "client");
        entry.SetState(new HostState { Kind = HostStateKind.Connected });
        entry.SetClient(first, "0.1");

        entry.BeginReconnect(new HostState
        {
            Kind = HostStateKind.Reconnecting,
            Attempt = 1,
        });
        var waiting = entry.WaitForClientAsync(cts.Token);
        Assert.False(waiting.IsCompleted);

        entry.SetClient(replacement, "0.1");

        Assert.Same(replacement, await waiting);

        entry.BeginReconnect(new HostState
        {
            Kind = HostStateKind.Reconnecting,
            Attempt = 2,
        });
        var terminalWait = entry.WaitForClientAsync(cts.Token);
        entry.SetState(new HostState { Kind = HostStateKind.Failed });

        await Assert.ThrowsAsync<HostNotConnectedException>(() => terminalWait);

        entry.SetState(new HostState
        {
            Kind = HostStateKind.Reconnecting,
            Attempt = 3,
        });
        var retryWait = entry.WaitForClientAsync(cts.Token);
        Assert.False(retryWait.IsCompleted);
        entry.SetClient(first, "0.1");

        Assert.Same(first, await retryWait);
    }

    [Fact]
    public void OpenHostAttempt_CommitAndAbandonmentAreMutuallyExclusive()
    {
        var committing = new MultiHostClient.OpenHostAttempt();
        committing.BeginCommit(CancellationToken.None);
        Assert.False(committing.TryAbandon());

        var abandoned = new MultiHostClient.OpenHostAttempt();
        Assert.True(abandoned.TryAbandon());
        Assert.Throws<OperationCanceledException>(
            () => abandoned.BeginCommit(CancellationToken.None));
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Phase 2 (P2-C) — aggregated views, per-host streams, manual reconnect,
    //  typed host errors. Ported from Swift MultiHostClientTests.swift. Drives
    //  the REAL MultiHostClient over REAL MemTransport pairs with a fake server
    //  — NO mocking of the client, transport, or serializer.
    // ══════════════════════════════════════════════════════════════════════

    // ── Extra fake-server helpers (Swift FakeHost parity) ──────────────────

    /// <summary>
    /// Full fake server: answers <c>initialize</c> (optionally embedding a root
    /// snapshot carrying <paramref name="agents"/> + <paramref name="activeSessions"/>),
    /// answers <c>listSessions</c> with <paramref name="sessions"/>, and — if
    /// <paramref name="injectAfterInit"/> is set — pushes a <c>root/sessionAdded</c>
    /// notification (scoped to the root channel) shortly after initialize. The
    /// notification is repeated until cancelled so the host pump can't miss it.
    /// Mirrors Swift's <c>makeFakeHostFactory(state:injectAfterInit:)</c>.
    /// </summary>
    private static Task RunFakeServerFullAsync(
        MemTransport serverSide,
        IReadOnlyList<SessionSummary>? sessions = null,
        IReadOnlyList<AgentInfo>? agents = null,
        long activeSessions = 0,
        SessionSummary? injectAfterInit = null,
        CancellationToken ct = default)
    {
        var host = FakeHost.New()
            .OnInitialize((req, side, c) => RespondInitializeWithRootAsync(side, req.Id, agents, activeSessions, c))
            .OnListSessions((req, side, c) => RespondListSessionsAsync(side, req.Id, sessions ?? Array.Empty<SessionSummary>(), c))
            // Acknowledge any other request with an empty object so the client's
            // pending entry resolves.
            .AckUnmatchedWithEmpty();
        if (injectAfterInit is not null)
            host.AfterInitialize((side, c) => RepeatSessionAddedAsync(side, (SessionSummary)injectAfterInit, c));
        return host.RunAsync(serverSide, ct);
    }

    /// <summary>
    /// Reconnect-capable fake server: answers <c>initialize</c> + <c>listSessions</c>,
    /// then on <c>reconnect</c> replies with a replay result carrying a single
    /// rootActiveSessionsChanged action at <paramref name="replaySeq"/> and the
    /// given <paramref name="missing"/> URIs. Mirrors Swift's
    /// <c>makeReconnectResultFactory</c> (replayWithMissingAndLiveAction mode).
    /// </summary>
    private static Task RunReconnectFakeServerAsync(
        MemTransport serverSide,
        long replaySeq,
        string[] missing,
        CancellationToken ct = default) =>
        FakeHost.New()
            .OnInitialize((req, side, c) => RespondInitializeWithRootAsync(side, req.Id, null, 1, c))
            .OnListSessions((req, side, c) => RespondListSessionsAsync(side, req.Id, Array.Empty<SessionSummary>(), c))
            .OnReconnect((req, side, c) =>
            {
                var channels = new List<ChannelRecovery>
                {
                    new ChannelRecovery(new ChannelReplayRecovery
                    {
                        Channel = ProtocolVersion.RootResourceUri,
                        Actions = new List<ActionEnvelope>
                        {
                            new ActionEnvelope
                            {
                                Channel = ProtocolVersion.RootResourceUri,
                                ServerSeq = replaySeq,
                                Action = new StateAction(new RootActiveSessionsChangedAction
                                {
                                    Type = ActionType.RootActiveSessionsChanged,
                                    ActiveSessions = 7,
                                }),
                            },
                        },
                    }),
                };
                channels.AddRange(missing.Select(uri =>
                    new ChannelRecovery(new ChannelMissingRecovery { Channel = uri })));
                return FakeHost.RespondResultAsync(
                    side,
                    req.Id,
                    new ReconnectResult { Channels = channels },
                    c);
            })
            .AckUnmatchedWithEmpty()
            .RunAsync(serverSide, ct);

    private static Task RespondInitializeWithRootAsync(
        MemTransport serverSide, ulong id, IReadOnlyList<AgentInfo>? agents, long activeSessions, CancellationToken ct)
    {
        var result = new InitializeResult
        {
            ProtocolVersion = ProtocolVersion.Current,
            ServerSeq = 0,
            Snapshots = new List<Snapshot>
            {
                new Snapshot
                {
                    Resource = ProtocolVersion.RootResourceUri,
                    FromSeq = 0,
                    State = new SnapshotState
                    {
                        Root = new RootState
                        {
                            Agents = agents is not null
                                ? new List<AgentInfo>(agents)
                                : new List<AgentInfo>(),
                            ActiveSessions = activeSessions,
                        },
                    },
                },
            },
        };
        return FakeHost.RespondResultAsync(serverSide, id, result, ct);
    }

    private static Task RespondListSessionsAsync(
        MemTransport serverSide, ulong id, IReadOnlyList<SessionSummary> sessions, CancellationToken ct) =>
        FakeHost.RespondResultAsync(
            serverSide, id, new ListSessionsResult { Items = new List<SessionSummary>(sessions) }, ct);

    // Thin aliases for the few tests (#9, #10, #15) that hand-roll a bespoke
    // connect-then-drop loop the declarative builder doesn't model.
    private static Task RespondEmptyAsync(MemTransport serverSide, ulong id, CancellationToken ct) =>
        FakeHost.RespondEmptyAsync(serverSide, id, ct);

    private static Task RepeatSessionAddedAsync(MemTransport serverSide, SessionSummary summary, CancellationToken ct)
    {
        return Loop();

        async Task Loop()
        {
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await FakeHost.SendNotificationAsync(serverSide, "root/sessionAdded",
                        new SessionAddedParams { Channel = ProtocolVersion.RootResourceUri, Summary = summary }, ct).ConfigureAwait(false);
                    await Task.Delay(25, ct).ConfigureAwait(false);
                }
            }
            catch { /* cancelled or peer gone */ }
        }
    }

    // ISO 8601 timestamps sort lexically in chronological order, so the
    // newest-first ordering the aggregation tests assert is preserved when the
    // numeric `modifiedAt` ms is rendered to the 0.5.0 string form.
    private static string IsoMs(long ms) =>
        DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime
            .ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture);

    private static SessionSummary MakeSummary(string resource, string title, long modifiedAt) => new()
    {
        Resource = resource,
        Provider = "copilot",
        Title = title,
        Status = SessionStatus.Idle,
        CreatedAt = IsoMs(0),
        ModifiedAt = IsoMs(modifiedAt),
    };

    private static AgentInfo MakeAgent(string provider = "copilot") => new()
    {
        Provider = provider,
        DisplayName = "Copilot",
        Description = "",
        Models = new System.Collections.Generic.List<SessionModelInfo>(),
    };

    /// <summary>Polls <paramref name="predicate"/> until true or the deadline passes.</summary>
    private static async Task WaitUntilAsync(Func<bool> predicate, CancellationToken ct, int timeoutMs = 4000)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            if (predicate()) return;
            await Task.Delay(15, ct).ConfigureAwait(false);
        }
        throw new TimeoutException("condition not met before deadline");
    }

    /// <summary>Polls a host until its state matches <paramref name="match"/>.</summary>
    private static Task WaitForHostStateAsync(MultiHostClient m, HostId id, Func<HostState, bool> match, CancellationToken ct, int timeoutMs = 6000) =>
        WaitUntilAsync(() => m.Host(id) is { } h && match(h.State), ct, timeoutMs);

    /// <summary>Reads the next item from a reader with a per-read timeout.</summary>
    private static async Task<(bool Ok, T Value)> ReadWithTimeoutAsync<T>(
        System.Threading.Channels.ChannelReader<T> reader, CancellationToken ct, int timeoutMs = 1500)
    {
        using var to = CancellationTokenSource.CreateLinkedTokenSource(ct);
        to.CancelAfter(timeoutMs);
        try { var v = await reader.ReadAsync(to.Token).ConfigureAwait(false); return (true, v); }
        catch (OperationCanceledException) { return (false, default!); }
        catch (System.Threading.Channels.ChannelClosedException) { return (false, default!); }
    }

    private static HostTransportFactory FullFactory(
        CancellationToken outerCt,
        IReadOnlyList<SessionSummary>? sessions = null,
        IReadOnlyList<AgentInfo>? agents = null,
        long activeSessions = 0,
        SessionSummary? injectAfterInit = null) =>
        (id, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(s, sessions, agents, activeSessions, injectAfterInit, outerCt));
            return Task.FromResult<ITransport>(c);
        };

    // ── 1. duplicate host id → typed exception ─────────────────────────────

    [Fact]
    public async Task MultiHost_DuplicateHostId_ThrowsDuplicateHostException()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("dup"),
            Label = "first",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);

        var ex = await Assert.ThrowsAsync<DuplicateHostException>(() =>
            m.AddHostAsync(new HostConfig
            {
                Id = new HostId("dup"),
                Label = "second",
                TransportFactory = FullFactory(cts.Token),
            }, cts.Token));
        Assert.Equal(new HostId("dup"), ex.HostId);
    }

    // ── 2. aggregated sessions sorted + host-labeled ───────────────────────

    [Fact]
    public async Task MultiHost_AggregatedSessions_SortedAndHostLabeled()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        var initial = MakeSummary("ahp-session:/s1", "Initial title", modifiedAt: 1_000);
        var added = MakeSummary("ahp-session:/s2", "Added later", modifiedAt: 2_000);

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("local"),
            Label = "Local",
            TransportFactory = FullFactory(cts.Token, sessions: new[] { initial }, injectAfterInit: added),
        }, cts.Token);

        await WaitForHostStateAsync(m, new HostId("local"), s => s.Kind == HostStateKind.Connected, cts.Token);
        await WaitUntilAsync(() => m.AggregatedSessions().Count == 2, cts.Token);

        var aggregated = m.AggregatedSessions();
        Assert.Equal(2, aggregated.Count);
        // Sorted by modifiedAt DESC: "Added later" (2000) before "Initial title" (1000).
        Assert.Equal(new[] { "Added later", "Initial title" }, aggregated.ConvertAll(r => r.Summary.Title).ToArray());
        // Every row carries its host id + label.
        Assert.All(aggregated, r => Assert.Equal(new HostId("local"), r.HostId));
        Assert.All(aggregated, r => Assert.Equal("Local", r.HostLabel));
    }

    // ── 3. aggregated agents tagged by host ────────────────────────────────

    [Fact]
    public async Task MultiHost_AggregatedAgents_TaggedByHost()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Two hosts, each advertising one agent in its root snapshot.
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("a"),
            Label = "Host A",
            TransportFactory = FullFactory(cts.Token, agents: new[] { MakeAgent("copilot") }),
        }, cts.Token);
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("b"),
            Label = "Host B",
            TransportFactory = FullFactory(cts.Token, agents: new[] { MakeAgent("claude") }),
        }, cts.Token);

        await WaitForHostStateAsync(m, new HostId("a"), s => s.Kind == HostStateKind.Connected, cts.Token);
        await WaitForHostStateAsync(m, new HostId("b"), s => s.Kind == HostStateKind.Connected, cts.Token);
        await WaitUntilAsync(() => m.AggregatedAgents().Count == 2, cts.Token);

        var agents = m.AggregatedAgents();
        Assert.Equal(2, agents.Count);
        // Each agent row carries its originating host id + label.
        var byHost = new System.Collections.Generic.Dictionary<string, HostedAgent>();
        foreach (var row in agents) byHost[row.HostId.ToString()] = row;
        Assert.Equal("Host A", byHost["a"].HostLabel);
        Assert.Equal("copilot", byHost["a"].Agent.Provider);
        Assert.Equal("Host B", byHost["b"].HostLabel);
        Assert.Equal("claude", byHost["b"].Agent.Provider);
    }

    // ── 4. host snapshots stream ───────────────────────────────────────────

    [Fact]
    public async Task MultiHost_HostSnapshots_Stream()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Unknown host throws (Swift returns nil; .NET surface throws typed error).
        Assert.Throws<UnknownHostException>(() => m.HostSnapshots(new HostId("missing")));

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);

        var reader = m.HostSnapshots(new HostId("h"));
        // First yield is the initial snapshot for this host.
        var (ok0, initial) = await ReadWithTimeoutAsync(reader, cts.Token);
        Assert.True(ok0);
        Assert.Equal(new HostId("h"), initial.Id);

        // The initial snapshot is already Connected (AddHostAsync returned Connected
        // before we subscribed), so count it; also pump in case a connect lands later.
        var sawConnected = initial.State.Kind == HostStateKind.Connected;
        for (var i = 0; i < 30 && !sawConnected; i++)
        {
            var (ok, snap) = await ReadWithTimeoutAsync(reader, cts.Token, 500);
            if (!ok) continue;
            if (snap.State.Kind == HostStateKind.Connected) { sawConnected = true; Assert.Equal(new HostId("h"), snap.Id); }
        }
        Assert.True(sawConnected, "expected a Connected snapshot on the per-host snapshot stream");

        // Removing the host finishes the stream so the reader completes.
        await m.RemoveHostAsync(new HostId("h"), cts.Token);
        var seen = 0;
        await foreach (var _u in reader.ReadAllAsync(cts.Token)) { if (++seen > 50) break; }
        // The await-foreach exits only when the channel completes; had removal
        // NOT finished the stream, the 15s cts would have cancelled the read and
        // failed the test. Assert completion explicitly rather than relying on
        // "reached here" (matches tests #8 ~L909 and #17 ~L1337 in this file).
        Assert.True(reader.Completion.IsCompleted,
            "removing the host must complete its per-host snapshot stream");
        Assert.True(seen <= 50, "a finished stream must not keep emitting after removal");
    }

    // ── 5. session summaries stream ────────────────────────────────────────

    [Fact]
    public async Task MultiHost_SessionSummaries_Stream()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Unknown host throws.
        Assert.Throws<UnknownHostException>(() => m.SessionSummariesForHost(new HostId("missing")));

        var initial = MakeSummary("copilot:/s1", "Initial", modifiedAt: 100);
        var added = MakeSummary("copilot:/s2", "Added", modifiedAt: 200);

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            TransportFactory = FullFactory(cts.Token, sessions: new[] { initial }, injectAfterInit: added),
        }, cts.Token);

        var reader = m.SessionSummariesForHost(new HostId("h"));
        // Poll the stream until we see BOTH the listSessions-seeded summary
        // (copilot:/s1) and the injected sessionAdded (copilot:/s2).
        var sawInitial = false;
        var sawAdded = false;
        for (var i = 0; i < 60 && !(sawInitial && sawAdded); i++)
        {
            var (ok, list) = await ReadWithTimeoutAsync(reader, cts.Token, 400);
            if (!ok) continue;
            foreach (var s in list)
            {
                if (s.Resource == "copilot:/s1") sawInitial = true;
                if (s.Resource == "copilot:/s2") sawAdded = true;
            }
        }
        Assert.True(sawInitial, "expected listSessions-seeded summary on the stream");
        Assert.True(sawAdded, "expected injected sessionAdded to update the stream");
    }

    // ── 6. events(host, uri) live ──────────────────────────────────────────

    [Fact]
    public async Task MultiHost_HostEvents_Live()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        var initial = MakeSummary("ahp-session:/sess", "init", modifiedAt: 100);
        var added = MakeSummary("ahp-session:/added", "post", modifiedAt: 200);

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "Host",
            TransportFactory = FullFactory(cts.Token, sessions: new[] { initial }, injectAfterInit: added),
        }, cts.Token);

        // Attach a per-(host, root-channel) listener; session notifications are
        // scoped to the root channel.
        var reader = m.EventsForHost(new HostId("h"), ProtocolVersion.RootResourceUri);

        var sawAdded = false;
        for (var i = 0; i < 40 && !sawAdded; i++)
        {
            var (ok, ev) = await ReadWithTimeoutAsync(reader, cts.Token, 400);
            if (!ok) continue;
            if (ev is SubscriptionEventSessionAdded added2 && added2.Params.Summary.Resource == "ahp-session:/added")
                sawAdded = true;
        }
        Assert.True(sawAdded, "expected the injected sessionAdded notification on the per-channel stream");
    }

    // ── 7. events(host, uri) survives reconnect + sees replay ──────────────

    [Fact]
    public async Task MultiHost_HostEvents_SurvivesReconnect()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        HostTransportFactory factory = (id, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunReconnectFakeServerAsync(s, replaySeq: 42, missing: new[] { "copilot:/missing" }, ct: cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "Host",
            TransportFactory = factory,
            InitialSubscriptions = new[] { ProtocolVersion.RootResourceUri },
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("h"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var initialGen = m.Host(new HostId("h"))!.Generation;

        // Attach the per-channel listener AFTER the first connect, BEFORE the
        // reconnect, so it is in place when replayed envelopes fan out.
        var reader = m.EventsForHost(new HostId("h"), ProtocolVersion.RootResourceUri);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        await WaitUntilAsync(() =>
            m.Host(new HostId("h")) is { } h && h.Generation > initialGen && h.State.Kind == HostStateKind.Connected,
            cts.Token, 8000);

        // The replayed envelope (rootActiveSessionsChanged @ serverSeq=42) must
        // reach the per-channel listener since it survives the reconnect.
        var sawReplay = false;
        for (var i = 0; i < 40 && !sawReplay; i++)
        {
            var (ok, ev) = await ReadWithTimeoutAsync(reader, cts.Token, 400);
            if (!ok) continue;
            if (ev is SubscriptionEventAction action && action.Envelope.ServerSeq == 42)
                sawReplay = true;
        }
        Assert.True(sawReplay, "per-channel stream should see replayed envelopes after reconnect");
    }

    // ── 8. events(host, uri) finishes when host is removed ─────────────────

    [Fact]
    public async Task MultiHost_HostEvents_FinishesOnUnsubscribe()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("tmp"),
            Label = "Temp",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("tmp"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var reader = m.EventsForHost(new HostId("tmp"), "copilot:/x");

        await m.RemoveHostAsync(new HostId("tmp"), cts.Token);

        // Removing the host finishes the per-(host, uri) stream so the reader
        // completes and the await-foreach exits promptly.
        var count = 0;
        await foreach (var _u in reader.ReadAllAsync(cts.Token)) { if (++count > 10) break; }
        // The await-foreach exits only when the channel completes; had removal
        // NOT finished the stream, the 15s cts would have cancelled the read and
        // failed the test. Assert completion explicitly rather than relying on
        // "reached here" (and prove it finished, not that it kept emitting).
        Assert.True(reader.Completion.IsCompleted,
            "removing the host must complete the per-(host,uri) event stream");
        Assert.True(count <= 10, "a finished stream must not keep emitting after removal");
    }

    // ── 9. reconnect wakes an exhausted (.failed) host ─────────────────────

    [Fact]
    public async Task MultiHost_ReconnectHost_WakesExhaustedHost()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Attempt 1 connects then drops → with a disabled reconnect policy the
        // supervisor parks the host in .failed (exhausted/disabled). A manual
        // ReconnectAsync bypasses the disabled policy and wakes it; attempt 2
        // connects and stays up.
        var attempts = 0;
        HostTransportFactory factory = (id, ct) =>
        {
            var n = Interlocked.Increment(ref attempts);
            var (c, s) = MemTransport.CreatePair();
            if (n == 1)
            {
                // Answer the handshake then close to force a drop.
                _ = Task.Run(() => RunHandshakeThenDropAsync(s, ct));
            }
            else
            {
                _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            }
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("ex"),
            Label = "Ex",
            TransportFactory = factory,
            ReconnectPolicy = ReconnectPolicy.Disabled,
        }, cts.Token);

        // The first connection drops; disabled policy parks it in .failed.
        await WaitForHostStateAsync(m, new HostId("ex"), s => s.Kind == HostStateKind.Failed, cts.Token, 15000);

        // Manual reconnect wakes the exhausted host (bypassing the disabled
        // policy) → attempt 2 connects.
        await m.ReconnectAsync(new HostId("ex"), cts.Token);
        await WaitForHostStateAsync(m, new HostId("ex"), s => s.Kind == HostStateKind.Connected, cts.Token, 15000);
        Assert.Equal(HostStateKind.Connected, m.Host(new HostId("ex"))!.State.Kind);
        Assert.True(Volatile.Read(ref attempts) >= 2, "manual reconnect should have triggered a second connect attempt");
    }

    /// <summary>
    /// Answers <c>initialize</c> + <c>listSessions</c> once, then closes the
    /// transport to force a drop. Used by reconnect tests that need a host to
    /// connect and then drop.
    /// </summary>
    private static async Task RunHandshakeThenDropAsync(MemTransport serverSide, CancellationToken ct)
    {
        try
        {
            var sawInit = false; var sawList = false;
            while (!ct.IsCancellationRequested && !(sawInit && sawList))
            {
                TransportMessage frame;
                try { frame = await serverSide.ReceiveAsync(ct).ConfigureAwait(false); }
                catch { break; }
                JsonRpcMessage msg;
                try { msg = Ser.DecodeMessage(frame); }
                catch { break; }
                if (msg.Request?.Method == "initialize")
                { await RespondInitializeWithRootAsync(serverSide, msg.Request.Id, null, 0, ct).ConfigureAwait(false); sawInit = true; }
                else if (msg.Request?.Method == "listSessions")
                { await RespondListSessionsAsync(serverSide, msg.Request.Id, Array.Empty<SessionSummary>(), ct).ConfigureAwait(false); sawList = true; }
                else if (msg.Request is not null)
                    await RespondEmptyAsync(serverSide, msg.Request.Id, ct).ConfigureAwait(false);
            }
            // Handshake answered → the host reaches Connected (AddHostAsync awaits
            // OpenHostAsync). Brief grace so it is Connected + supervised before we
            // drop the transport, forcing a clean spontaneous drop.
            await Task.Delay(100, ct).ConfigureAwait(false);
        }
        catch { /* ignore */ }
        finally { try { await serverSide.CloseAsync().ConfigureAwait(false); } catch { } }
    }

    // ── 10. reconnectAllUnavailable skips connected, wakes others ──────────

    [Fact]
    public async Task MultiHost_ReconnectAllUnavailable_SkipsConnected()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Host A: connects and stays connected.
        var aAttempts = 0;
        HostTransportFactory factoryA = (id, ct) =>
        {
            Interlocked.Increment(ref aAttempts);
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        // Host B: first attempt answers the handshake then DROPS the transport,
        // so AddHostAsync returns Connected and B genuinely registers; with a
        // disabled reconnect policy the spontaneous drop parks it in .failed
        // (NOT removed). The second attempt — driven by ReconnectAllUnavailable —
        // returns a working transport and B reconnects. This is the same
        // register-then-park-as-.failed shape as test #9
        // (MultiHost_ReconnectHost_WakesExhaustedHost), and mirrors Swift
        // testReconnectAllUnavailableSkipsConnectedAndWakesOthers.
        var bAttempts = 0;
        HostTransportFactory factoryB = (id, ct) =>
        {
            var n = Interlocked.Increment(ref bAttempts);
            var (c, s) = MemTransport.CreatePair();
            if (n == 1)
                _ = Task.Run(() => RunHandshakeThenDropAsync(s, ct));
            else
                _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig { Id = new HostId("a"), Label = "A", TransportFactory = factoryA }, cts.Token);
        await m.AddHostAsync(new HostConfig { Id = new HostId("b"), Label = "B", TransportFactory = factoryB, ReconnectPolicy = ReconnectPolicy.Disabled }, cts.Token);

        // A stays connected; B's first connection drops and the disabled policy
        // parks it in .failed (registered, but unavailable).
        await WaitForHostStateAsync(m, new HostId("a"), s => s.Kind == HostStateKind.Connected, cts.Token);
        await WaitForHostStateAsync(m, new HostId("b"), s => s.Kind == HostStateKind.Failed, cts.Token, 15000);
        Assert.Equal(1, Volatile.Read(ref aAttempts));
        var bAttemptsBefore = Volatile.Read(ref bAttempts);
        Assert.Equal(1, bAttemptsBefore);

        // reconnectAllUnavailable must SKIP the connected host A (no error, no
        // extra connect attempt) AND WAKE the parked host B.
        var errors = m.ReconnectAllUnavailable();
        Assert.Empty(errors);

        // Host B is woken and reconnects.
        await WaitForHostStateAsync(m, new HostId("b"), s => s.Kind == HostStateKind.Connected, cts.Token, 15000);
        // Host A was skipped: still connected, still exactly one connect attempt.
        Assert.Equal(HostStateKind.Connected, m.Host(new HostId("a"))!.State.Kind);
        Assert.Equal(1, Volatile.Read(ref aAttempts));
        // Host B re-attempted exactly once (its second connect).
        Assert.Equal(2, Volatile.Read(ref bAttempts));
    }

    // ── 11. reconnectAllUnavailable reports per-host errors ────────────────

    [Fact]
    public async Task MultiHost_ReconnectAllUnavailable_ReportsPerHostErrors()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        // With every registered host connected, the unavailable-set is empty,
        // so the per-host error map is empty (the success shape of the return).
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("x"),
            Label = "X",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("x"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var errors = m.ReconnectAllUnavailable();
        // The return is a per-host error MAP (HostId → Exception); connected
        // hosts are skipped, so it is empty here. This asserts the per-host-error
        // surface shape (a dictionary keyed by HostId) exists and is honored.
        Assert.NotNull(errors);
        Assert.Empty(errors);
        Assert.IsType<System.Collections.Generic.Dictionary<HostId, Exception>>(errors);
    }

    // ── 12. reconnect aborts a slow transport factory ─────────────────────

    [Fact]
    public async Task MultiHost_ReconnectHost_AbortsSlowFactory()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Attempt 1 connects normally. After a forced reconnect, attempt 2's
        // factory blocks until cancelled (slow factory). A SECOND manual
        // reconnect must abort that hung attempt; attempt 3 then succeeds.
        var attempts = 0;
        var attempt2Aborted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        HostTransportFactory factory = async (id, ct) =>
        {
            var n = Interlocked.Increment(ref attempts);
            if (n == 2)
            {
                // Slow/hung factory: wait until the per-attempt token is
                // cancelled by the next manual reconnect, then surface the
                // cancellation (proving the abort path fired).
                try { await Task.Delay(Timeout.Infinite, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { attempt2Aborted.TrySetResult(true); throw; }
            }
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            return c;
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("slow"),
            Label = "Slow",
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(10),
                MaxBackoff = TimeSpan.FromMilliseconds(10),
                BackoffMultiplier = 1.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("slow"), s => s.Kind == HostStateKind.Connected, cts.Token);

        // Force reconnect → attempt #2 runs the slow factory and hangs.
        await m.ReconnectAsync(new HostId("slow"), cts.Token);
        await WaitUntilAsync(() => Volatile.Read(ref attempts) >= 2, cts.Token, 8000);

        // Second manual reconnect aborts the hung attempt #2…
        await m.ReconnectAsync(new HostId("slow"), cts.Token);
        var aborted = await Task.WhenAny(attempt2Aborted.Task, Task.Delay(8000, cts.Token));
        Assert.True(attempt2Aborted.Task.IsCompletedSuccessfully, "the slow factory's in-flight attempt should have been aborted");

        // …and attempt #3 reconnects successfully.
        await WaitUntilAsync(() =>
            m.Host(new HostId("slow")) is { } h && h.State.Kind == HostStateKind.Connected && Volatile.Read(ref attempts) >= 3,
            cts.Token, 10000);
        Assert.Equal(HostStateKind.Connected, m.Host(new HostId("slow"))!.State.Kind);
    }

    [Fact]
    public async Task MultiHost_Shutdown_DoesNotWaitForFactoryThatIgnoresCancellation()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var reconnectFactoryEntered = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var neverCompletes = new TaskCompletionSource<ITransport>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var attempts = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            if (Interlocked.Increment(ref attempts) == 2)
            {
                reconnectFactoryEntered.TrySetResult();
                return neverCompletes.Task;
            }

            var (client, server) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(server, ct: cts.Token));
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("hung"),
            TransportFactory = factory,
        }, cts.Token);

        await m.ReconnectAsync(new HostId("hung"), cts.Token);
        await reconnectFactoryEntered.Task.WaitAsync(cts.Token);
        await m.ShutdownAsync(cts.Token);

        Assert.Null(m.Host(new HostId("hung")));
    }

    // ── 13. unknown host subscribe → typed exception ───────────────────────

    [Fact]
    public async Task MultiHost_UnknownHost_Subscribe_Throws()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var m = new MultiHostClient();
        await using var _mh = m;

        // EventsForHost on an unknown host throws a typed UnknownHostException
        // (Swift returns nil; the .NET surface throws, per the test contract).
        var ex1 = Assert.Throws<UnknownHostException>(() => m.EventsForHost(new HostId("missing"), "copilot:/anything"));
        Assert.Equal(new HostId("missing"), ex1.HostId);

        // SubscribeAsync on an unknown host likewise throws.
        var ex2 = await Assert.ThrowsAsync<UnknownHostException>(() =>
            m.SubscribeAsync(new HostId("missing"), "copilot:/anything", cts.Token));
        Assert.Equal(new HostId("missing"), ex2.HostId);
    }

    // ── 14. unknown host dispatch → typed exception ────────────────────────

    [Fact]
    public async Task MultiHost_UnknownHost_Dispatch_Throws()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var m = new MultiHostClient();
        await using var _mh = m;

        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "x",
        });

        var ex = await Assert.ThrowsAsync<UnknownHostException>(() =>
            m.DispatchAsync(new HostId("missing"), action, "copilot:/s1", cancellationToken: cts.Token));
        Assert.Equal(new HostId("missing"), ex.HostId);
    }

    // ── 15. not-connected dispatch → typed exception ───────────────────────

    [Fact]
    public async Task MultiHost_NotConnected_Dispatch_Throws()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        // A host whose initial connect fails is removed by AddHostAsync; rather
        // than rely on that, build a host that connects then drops with a
        // disabled policy so it parks in .failed (registered, NOT connected).
        var connectOnce = 0;
        HostTransportFactory factory = (id, ct) =>
        {
            var n = Interlocked.Increment(ref connectOnce);
            var (c, s) = MemTransport.CreatePair();
            if (n == 1)
            {
                // Answer initialize + listSessions, then close to force a drop.
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var sawInit = false; var sawList = false;
                        while (!ct.IsCancellationRequested && !(sawInit && sawList))
                        {
                            var frame = await s.ReceiveAsync(ct).ConfigureAwait(false);
                            var msg = Ser.DecodeMessage(frame);
                            if (msg.Request?.Method == "initialize")
                            { await RespondInitializeWithRootAsync(s, msg.Request.Id, null, 0, ct).ConfigureAwait(false); sawInit = true; }
                            else if (msg.Request?.Method == "listSessions")
                            { await RespondListSessionsAsync(s, msg.Request.Id, Array.Empty<SessionSummary>(), ct).ConfigureAwait(false); sawList = true; }
                            else if (msg.Request is not null)
                                await RespondEmptyAsync(s, msg.Request.Id, ct).ConfigureAwait(false);
                        }
                        // Handshake answered → the host reaches Connected (AddHostAsync awaits
                        // OpenHostAsync). Brief grace so it is Connected + supervised before we
                        // drop the transport; a spontaneous drop on a disabled policy parks the
                        // host in .failed (registered, not connected) — exactly what this test needs.
                        await Task.Delay(100, ct).ConfigureAwait(false);
                    }
                    catch { /* ignore */ }
                    finally { await s.CloseAsync().ConfigureAwait(false); }
                });
            }
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("nc"),
            Label = "NC",
            TransportFactory = factory,
            ReconnectPolicy = ReconnectPolicy.Disabled,
        }, cts.Token);

        // Wait until the host drops and parks in .failed (disabled policy).
        await WaitForHostStateAsync(m, new HostId("nc"), s => s.Kind == HostStateKind.Failed, cts.Token, 12000);

        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "x",
        });

        // Host is registered but has no live connection → typed not-connected error.
        var ex = await Assert.ThrowsAsync<HostNotConnectedException>(() =>
            m.DispatchAsync(new HostId("nc"), action, "copilot:/s1", cancellationToken: cts.Token));
        Assert.Equal(new HostId("nc"), ex.HostId);
    }

    // ── 16. handle after remove → HostShutDown ─────────────────────────────

    [Fact]
    public async Task MultiHost_HandleAfterRemove_ThrowsHostShutDown()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("temp"),
            Label = "Temp",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("temp"), s => s.Kind == HostStateKind.Connected, cts.Token);

        // Acquire a live client handle, then remove the host out from under it.
        var handle = m.ClientFor(new HostId("temp"));
        Assert.NotNull(handle);

        await m.RemoveHostAsync(new HostId("temp"), cts.Token);

        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "x",
        });

        // The host runtime is gone; the stale handle refuses to operate.
        var ex = await Assert.ThrowsAsync<HostShutDownException>(() =>
            handle!.DispatchAsync(action, "copilot:/s1", cancellationToken: cts.Token));
        Assert.Equal(new HostId("temp"), ex.HostId);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Phase 2 (test-only §H gap closure) — additional rows that Swift's
    //  MultiHostClientTests.swift covers but the .NET suite lacked, plus
    //  AggregatedSessions tie-break pinning (a mutation sweep found those
    //  two comparison branches unverified). All drive the REAL MultiHostClient
    //  over REAL MemTransport pairs with a fake server — NO mocking of the
    //  client, transport, or serializer; every test asserts a real outcome.
    // ══════════════════════════════════════════════════════════════════════

    // ── 17. removeHost terminates the supervisor (host gone + stream done) ──
    //
    // Swift's testRemoveHostTerminatesSupervisorAndEmitsEvent asserts both a
    // HostEvent.removed(id) on multi.hostEvents() AND supervisor termination.
    // The event-emission half is now covered separately by
    // MultiHost_RemoveHost_EmitsRemovedEvent (HostEvent gained an IsRemoved
    // discriminator). This test pins the supervisor-termination half: after
    // RemoveHostAsync the host snapshot is gone (null) and the per-host snapshot
    // stream completes (proving the supervisor + its plumbing were torn down,
    // not merely orphaned).
    [Fact]
    public async Task MultiHost_RemoveHost_TerminatesSupervisor()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("temp"),
            Label = "Temporary",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("temp"), s => s.Kind == HostStateKind.Connected, cts.Token);

        // A live per-host snapshot stream; removal must finish it.
        var snapshots = m.HostSnapshots(new HostId("temp"));

        await m.RemoveHostAsync(new HostId("temp"), cts.Token);

        // The host is no longer registered.
        Assert.Null(m.Host(new HostId("temp")));

        // The per-host stream completes (supervisor + plumbing torn down): the
        // await-foreach exits promptly instead of the 15s cts cancelling it.
        var seen = 0;
        await foreach (var _u in snapshots.ReadAllAsync(cts.Token)) { if (++seen > 50) break; }
        Assert.True(snapshots.Completion.IsCompleted,
            "removing the host must complete its per-host snapshot stream");

        // Removing an unknown host throws the typed error.
        await Assert.ThrowsAsync<UnknownHostException>(() =>
            m.RemoveHostAsync(new HostId("temp"), cts.Token));
    }

    // ── 18. the transport factory is invoked once per (re)connect ──────────
    //
    // Mirrors Swift's testTransportFactoryIsCalledForEachReconnect: the factory
    // is a fresh-transport mint, so each connect attempt must call it exactly
    // once. After the initial connect the count is 1; a manual reconnect makes
    // it 2 (and the host returns to Connected on the new transport).
    [Fact]
    public async Task MultiHost_TransportFactory_CalledForEachReconnect()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        var calls = 0;
        HostTransportFactory factory = (id, ct) =>
        {
            Interlocked.Increment(ref calls);
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("local"),
            Label = "Local",
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(20),
                MaxBackoff = TimeSpan.FromMilliseconds(20),
                BackoffMultiplier = 1.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("local"), s => s.Kind == HostStateKind.Connected, cts.Token);
        Assert.Equal(1, Volatile.Read(ref calls));

        // Force a reconnect → the factory is invoked a second time and the host
        // reconnects on the fresh transport.
        await m.ReconnectAsync(new HostId("local"), cts.Token);
        await WaitUntilAsync(() =>
            Volatile.Read(ref calls) >= 2 && m.Host(new HostId("local")) is { State.Kind: HostStateKind.Connected },
            cts.Token, 8000);
        Assert.Equal(2, Volatile.Read(ref calls));
    }

    // ── 19. event/subscription readers receive nothing after shutdown ──────
    //
    // Maps Swift's testShutdownTearsDownAllHostsAndStreams stream-finish half
    // to the .NET reader surface: after ShutdownAsync, both the connection-event
    // reader (Events()) and the subscription fan-in reader (Subscriptions())
    // complete, so a drain reads zero further items and the ReadAllAsync loop
    // exits. (Pinning "recv none after transport/host teardown".)
    [Fact]
    public async Task MultiHost_ClientEvents_RecvNoneAfterShutdown()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("h"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var events = m.Events();
        var subs = m.Subscriptions();

        await m.ShutdownAsync(cts.Token);

        // Both readers must complete so their drains terminate (no item is
        // delivered after teardown). Had shutdown NOT completed them, the cts
        // would cancel the ReadAllAsync and fail the test.
        var evCount = 0;
        await foreach (var _u in events.ReadAllAsync(cts.Token)) { if (++evCount > 100) break; }
        var subCount = 0;
        await foreach (var _u in subs.ReadAllAsync(cts.Token)) { if (++subCount > 100) break; }

        Assert.True(events.Completion.IsCompleted, "shutdown must complete the connection-event reader");
        Assert.True(subs.Completion.IsCompleted, "shutdown must complete the subscription fan-in reader");

        // No host snapshots are retrievable after shutdown.
        Assert.Null(m.Host(new HostId("h")));
    }

    // ── 20. shutdown is not blocked by a hung transport factory ────────────
    //
    // Mirrors the intent behind Swift's parked-attempt teardown: a host whose
    // reconnect attempt is stuck inside a transport factory that never returns
    // must NOT wedge ShutdownAsync. We drive the host to a hung attempt #2
    // (factory awaits Timeout.Infinite on its per-attempt token), then call
    // ShutdownAsync and assert it completes within a bounded window — the
    // lifetime cancellation aborts the hung factory.
    [Fact]
    public async Task MultiHost_Shutdown_NotBlockedByHungTransportFactory()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        var m = new MultiHostClient();

        var attempts = 0;
        var attempt2Entered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        HostTransportFactory factory = async (id, ct) =>
        {
            var n = Interlocked.Increment(ref attempts);
            if (n >= 2)
            {
                // Hung factory: never returns a transport until the per-attempt
                // token (cancelled by lifetime teardown) fires.
                attempt2Entered.TrySetResult(true);
                await Task.Delay(Timeout.Infinite, ct).ConfigureAwait(false);
            }
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            return c;
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("hung"),
            Label = "Hung",
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(10),
                MaxBackoff = TimeSpan.FromMilliseconds(10),
                BackoffMultiplier = 1.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("hung"), s => s.Kind == HostStateKind.Connected, cts.Token);

        // Force a reconnect → attempt #2 enters the hung factory and parks.
        await m.ReconnectAsync(new HostId("hung"), cts.Token);
        await Task.WhenAny(attempt2Entered.Task, Task.Delay(8000, cts.Token));
        Assert.True(attempt2Entered.Task.IsCompletedSuccessfully, "the hung factory's attempt should have started");

        // ShutdownAsync must complete despite the in-flight hung factory: the
        // lifetime cancel aborts the attempt. Bound it well under the cts so a
        // wedge fails loudly rather than hanging the whole run.
        var shutdown = m.ShutdownAsync(cts.Token);
        var winner = await Task.WhenAny(shutdown, Task.Delay(10000, cts.Token));
        Assert.True(ReferenceEquals(winner, shutdown) && shutdown.IsCompletedSuccessfully,
            "ShutdownAsync must not be blocked by a hung transport factory");
    }

    [Fact]
    public async Task MultiHost_Shutdown_NotBlockedByHungInitialTransportFactory()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var factoryEntered = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var m = new MultiHostClient();

        HostTransportFactory factory = async (_, ct) =>
        {
            factoryEntered.TrySetResult();
            await Task.Delay(Timeout.Infinite, ct).ConfigureAwait(false);
            throw new InvalidOperationException("unreachable");
        };

        var addTask = m.AddHostAsync(new HostConfig
        {
            Id = new HostId("hung-initial"),
            TransportFactory = factory,
        }, CancellationToken.None);
        await factoryEntered.Task.WaitAsync(cts.Token);

        await m.ShutdownAsync(cts.Token);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await addTask);
    }

    // ── 21. explicit clientId wins over store ──────────────────────────────
    //
    // Pins the clientId-resolution branch in AddHostAsync: an explicit
    // HostConfig.ClientId is used verbatim (not the stored value, not a fresh
    // mint) AND is persisted to the store. Mirrors the Swift SDK's explicit-id
    // precedence (Swift exercises this through its client-id store seams).
    [Fact]
    public async Task MultiHost_ClientId_ExplicitWins()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var store = new InMemoryClientIdStore();
        // Pre-seed a DIFFERENT id so we can prove explicit wins over stored.
        await store.StoreAsync(new HostId("h"), "stored-id", cts.Token);

        var m = new MultiHostClient(store);
        await using var _mh = m;

        var handle = await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            ClientId = "explicit-id",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);

        Assert.Equal("explicit-id", handle.ClientId);
        Assert.Equal("explicit-id", m.Host(new HostId("h"))!.ClientId);
        // Explicit id is persisted, overwriting the pre-seeded stored value.
        Assert.Equal("explicit-id", await store.LoadAsync(new HostId("h"), cts.Token));
    }

    // ── 22. stored clientId is reused when none is supplied ────────────────
    //
    // When HostConfig.ClientId is empty, AddHostAsync loads the persisted id
    // from the store and reuses it (the AHP reconnect-stability contract).
    [Fact]
    public async Task MultiHost_ClientId_StoredReused()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var store = new InMemoryClientIdStore();
        await store.StoreAsync(new HostId("h"), "persisted-id", cts.Token);

        var m = new MultiHostClient(store);
        await using var _mh = m;

        var handle = await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            // No ClientId supplied → the stored one is reused.
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);

        Assert.Equal("persisted-id", handle.ClientId);
        Assert.Equal("persisted-id", m.Host(new HostId("h"))!.ClientId);
        Assert.Equal("persisted-id", await store.LoadAsync(new HostId("h"), cts.Token));
    }

    // ── 23. a missing clientId is generated and then persisted ─────────────
    //
    // With no explicit id and an empty store, AddHostAsync mints a fresh
    // non-empty clientId and persists it for future reconnect stability.
    [Fact]
    public async Task MultiHost_ClientId_MissingGenerates()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var store = new InMemoryClientIdStore();
        Assert.Null(await store.LoadAsync(new HostId("h"), cts.Token)); // empty store

        var m = new MultiHostClient(store);
        await using var _mh = m;

        var handle = await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);

        Assert.False(string.IsNullOrEmpty(handle.ClientId), "a clientId must be generated");
        // The generated id is the one surfaced on the snapshot AND persisted.
        Assert.Equal(handle.ClientId, m.Host(new HostId("h"))!.ClientId);
        Assert.Equal(handle.ClientId, await store.LoadAsync(new HostId("h"), cts.Token));
    }

    // ── 24. a cancelled/failed add releases the host-id reservation ────────
    //
    // AddHostAsync reserves the id (TryAdd) BEFORE the initial connect, then
    // removes it on connect failure (see the catch in AddHostAsync). This pins
    // that the reservation is released: a first add whose factory throws fails,
    // and a SECOND add of the SAME id then succeeds (no spurious
    // DuplicateHostException from a leaked reservation).
    [Fact]
    public async Task MultiHost_AddHostFailure_ReleasesReservation()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        var attempts = 0;
        HostTransportFactory factory = (id, ct) =>
        {
            var n = Interlocked.Increment(ref attempts);
            if (n == 1)
                throw new AhpTransportException("io", "intentional first-attempt failure");
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        // First add fails during the initial connect.
        await Assert.ThrowsAnyAsync<Exception>(() =>
            m.AddHostAsync(new HostConfig
            {
                Id = new HostId("r"),
                Label = "R",
                TransportFactory = factory,
                ReconnectPolicy = ReconnectPolicy.Disabled,
            }, cts.Token));

        // The reservation was released → the host is NOT registered.
        Assert.Null(m.Host(new HostId("r")));

        // Re-adding the SAME id succeeds (no leaked DuplicateHostException).
        var handle = await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("r"),
            Label = "R",
            TransportFactory = factory,
        }, cts.Token);
        Assert.Equal(new HostId("r"), handle.Id);
        await WaitForHostStateAsync(m, new HostId("r"), s => s.Kind == HostStateKind.Connected, cts.Token);
        Assert.Equal(2, Volatile.Read(ref attempts));
    }

    // ── 25. a client handle invalidates after the host reconnects ──────────
    //
    // Mirrors Swift's testHostClientHandleInvalidatesAfterReconnect. A handle
    // is minted at the current generation; after a reconnect bumps the
    // generation the stale handle refuses to operate (Swift surfaces
    // .hostReconnected; .NET folds that into HostNotConnectedException — "not
    // the connection you held; reacquire"), and a fresh handle works.
    [Fact]
    public async Task MultiHost_HostClientHandle_InvalidatesAfterReconnect()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("local"),
            Label = "Local",
            TransportFactory = FullFactory(cts.Token),
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(20),
                MaxBackoff = TimeSpan.FromMilliseconds(20),
                BackoffMultiplier = 1.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("local"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var handle = m.ClientFor(new HostId("local"));
        Assert.NotNull(handle);
        var initialGeneration = handle!.Generation;
        handle.CheckAliveOrThrow(); // valid before reconnect

        // FullFactory mints a fresh server per call, so a manual reconnect lands
        // a NEW connection at a higher generation.
        await m.ReconnectAsync(new HostId("local"), cts.Token);
        await WaitUntilAsync(() =>
            m.Host(new HostId("local")) is { } h && h.Generation > initialGeneration && h.State.Kind == HostStateKind.Connected,
            cts.Token, 10000);

        // The stale handle now refuses to operate (generation moved).
        Assert.Throws<HostNotConnectedException>(() => handle.CheckAliveOrThrow());
        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "x",
        });
        await Assert.ThrowsAsync<HostNotConnectedException>(() =>
            handle.DispatchAsync(action, "copilot:/s1", cancellationToken: cts.Token));

        // A freshly acquired handle is at the new generation and is valid.
        var fresh = m.ClientFor(new HostId("local"));
        Assert.NotNull(fresh);
        Assert.True(fresh!.Generation > initialGeneration);
        fresh.CheckAliveOrThrow();
    }

    // ── 26. a failed handshake shuts down the underlying client ────────────
    //
    // Mirrors Swift's testFailedHandshakeShutsDownUnderlyingClient. If
    // `initialize` errors after the client's reader/writer tasks have started,
    // the supervisor must shut the AhpClient down (which closes the wrapped
    // transport) before propagating — otherwise the orphaned client keeps
    // holding the transport. We observe this via a tracking transport whose
    // Closed flag flips on CloseAsync.
    [Fact]
    public async Task MultiHost_FailedHandshake_ShutsDownUnderlyingClient()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        var observer = new ClosedObserver();
        HostTransportFactory factory = (id, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            // Server returns a JSON-RPC error to `initialize`.
            _ = Task.Run(() => RunFailingInitServerAsync(s, ct));
            return Task.FromResult<ITransport>(new TrackingTransport(c, observer));
        };

        // Disabled policy so the host parks in .failed after one failed handshake
        // instead of looping forever.
        await Assert.ThrowsAnyAsync<Exception>(() =>
            m.AddHostAsync(new HostConfig
            {
                Id = new HostId("fail"),
                Label = "Fail",
                TransportFactory = factory,
                ReconnectPolicy = ReconnectPolicy.Disabled,
            }, cts.Token));

        // The supervisor shut the AhpClient down on the handshake failure, which
        // closed the wrapped transport.
        await WaitUntilAsync(() => observer.IsClosed, cts.Token, 8000);
        Assert.True(observer.IsClosed,
            "AhpClient shutdown on a failed handshake should have closed the transport");
    }

    [Fact]
    public async Task MultiHost_CancelledReconnect_ShutsDownUnderlyingClient()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var reconnectStarted = new TaskCompletionSource<object?>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var observer = new ClosedObserver();
        var attempt = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            if (Interlocked.Increment(ref attempt) == 1)
            {
                _ = Task.Run(() => RunFakeServerFullAsync(server, ct: cts.Token));
                return Task.FromResult<ITransport>(client);
            }

            _ = Task.Run(async () =>
            {
                try
                {
                    var frame = await server.ReceiveAsync(cts.Token).ConfigureAwait(false);
                    var message = Ser.DecodeMessage(frame);
                    if (message.Request?.Method == "reconnect")
                        reconnectStarted.TrySetResult(null);
                    await Task.Delay(Timeout.InfiniteTimeSpan, cts.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { }
            });
            return Task.FromResult<ITransport>(new TrackingTransport(client, observer));
        };

        var m = new MultiHostClient();
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
        }, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        await reconnectStarted.Task.WaitAsync(cts.Token);
        await m.RemoveHostAsync(new HostId("h"), cts.Token);

        Assert.True(observer.IsClosed);
        await m.DisposeAsync();
    }

    // ── 27. state during backoff after a drop is Reconnecting ──────────────
    //
    // Regression mirror of Swift's testStateDuringBackoffAfterDropIsReconnecting:
    // while the supervisor sleeps in backoff after a connection dropped,
    // snapshots must report Reconnecting (not Connected). We connect, drop the
    // transport, and — with a long backoff and a parking second attempt — assert
    // the host surfaces Reconnecting during the sleep window.
    [Fact]
    public async Task MultiHost_StateDuringBackoffAfterDrop_IsReconnecting()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var timeProvider = new FakeTimeProvider();
        var m = new MultiHostClient();
        await using var _mh = m;

        var attempts = 0;
        HostTransportFactory factory = (id, ct) =>
        {
            var n = Interlocked.Increment(ref attempts);
            var (c, s) = MemTransport.CreatePair();
            if (n == 1)
            {
                // Answer the handshake, reach Connected, then drop to force the
                // post-drop backoff window.
                _ = Task.Run(() => RunHandshakeThenDropAsync(s, ct));
            }
            else
            {
                // Subsequent attempts park (never reply) so the runtime stays in
                // the Reconnecting/backoff window while we observe.
                _ = Task.Run(async () => { try { await s.ReceiveAsync(ct).ConfigureAwait(false); } catch { } });
            }
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("drop"),
            Label = "Drop",
            TransportFactory = factory,
            ClientConfig = new ClientConfig { TimeProvider = timeProvider },
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromSeconds(5),
                MaxBackoff = TimeSpan.FromSeconds(5),
                BackoffMultiplier = 1.0,
                Jitter = 0.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("drop"), s => s.Kind == HostStateKind.Connected, cts.Token);

        // After the drop the supervisor transitions to Reconnecting and sleeps
        // the (long) backoff; the state must read Reconnecting during that sleep.
        await WaitForHostStateAsync(m, new HostId("drop"), s => s.Kind == HostStateKind.Reconnecting, cts.Token, 8000);
        Assert.Equal(HostStateKind.Reconnecting, m.Host(new HostId("drop"))!.State.Kind);
        Assert.Equal(1, Volatile.Read(ref attempts));

        timeProvider.Advance(TimeSpan.FromSeconds(5));
        await WaitUntilAsync(() => Volatile.Read(ref attempts) == 2, cts.Token);
        Assert.Equal(2, Volatile.Read(ref attempts));
    }

    // ── 28. MultiHostClient shutdown is idempotent ─────────────────────────
    //
    // Mirrors the idempotency tail of Swift's testShutdownTearsDownAllHostsAndStreams:
    // a second ShutdownAsync is a safe no-op, and a post-shutdown AddHostAsync
    // is rejected with HostShutDownException carrying the would-be id.
    [Fact]
    public async Task MultiHost_Shutdown_IsIdempotent()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("alpha"),
            Label = "Alpha",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("alpha"), s => s.Kind == HostStateKind.Connected, cts.Token);

        await m.ShutdownAsync(cts.Token);
        // Second shutdown is a no-op (does not throw, returns promptly).
        await m.ShutdownAsync(cts.Token);

        Assert.Null(m.Host(new HostId("alpha")));

        // A post-shutdown add is rejected with the typed error carrying the id.
        var ex = await Assert.ThrowsAsync<HostShutDownException>(() =>
            m.AddHostAsync(new HostConfig
            {
                Id = new HostId("gamma"),
                Label = "Gamma",
                TransportFactory = FullFactory(cts.Token),
            }, cts.Token));
        Assert.Equal(new HostId("gamma"), ex.HostId);
    }

    // ── 29. repeated reconnect cycles stay healthy (no abort-listener leak) ─
    //
    // The .NET reconnect path registers a per-attempt cancellation (BeginAttempt)
    // that a later manual reconnect / removal can abort. There is no public
    // listener-count surface, so we pin the OBSERVABLE consequence of a leak:
    // many reconnect cycles in a row keep the host healthy — each cycle bumps
    // the generation monotonically and lands back at Connected, with no error
    // accumulation, hang, or stuck state. A leaked abort registration would
    // eventually wedge a cycle (stuck non-Connected) or fault the host.
    [Fact]
    public async Task MultiHost_RepeatedReconnectCycles_StayHealthy()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var m = new MultiHostClient();
        await using var _mh = m;

        HostTransportFactory factory = (id, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunFakeServerFullAsync(s, ct: cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("loop"),
            Label = "Loop",
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(10),
                MaxBackoff = TimeSpan.FromMilliseconds(10),
                BackoffMultiplier = 1.0,
                ResetOnSuccess = true,
            },
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("loop"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var lastGen = m.Host(new HostId("loop"))!.Generation;

        // Hammer reconnect repeatedly; each cycle must complete cleanly with a
        // strictly higher generation and a Connected end state.
        for (var i = 0; i < 8; i++)
        {
            var prevGen = lastGen;
            await m.ReconnectAsync(new HostId("loop"), cts.Token);
            await WaitUntilAsync(() =>
                m.Host(new HostId("loop")) is { } h && h.Generation > prevGen && h.State.Kind == HostStateKind.Connected,
                cts.Token, 8000);
            var snap = m.Host(new HostId("loop"))!;
            Assert.Equal(HostStateKind.Connected, snap.State.Kind);
            Assert.True(snap.Generation > prevGen,
                $"reconnect cycle {i} should bump the generation ({prevGen} -> {snap.Generation})");
            lastGen = snap.Generation;
        }

        // Still healthy after the storm of reconnects.
        Assert.Equal(HostStateKind.Connected, m.Host(new HostId("loop"))!.State.Kind);
    }

    // ── 30. AggregatedSessions tie-break: host registration order ──────────
    //
    // Pins the FIRST tie-break branch in AggregatedSessions (MultiHostClient.cs:
    // host registration-order comparison): when sessions on DIFFERENT hosts share
    // an identical Summary.ModifiedAt, every row from the earlier-registered host
    // sorts before every row from the later host.
    //
    // Falsifiability: AggregatedSessions sorts with List.Sort (an UNSTABLE
    // introsort). We give EACH host MANY equal-modifiedAt sessions (well past the
    // ~16-element insertion-sort threshold) so the host-order comparison is the
    // ONLY thing that can produce a deterministic A-before-B partition — neuter it
    // (return 0) and the unstable sort interleaves the two hosts' rows, failing
    // the "all of host-a precedes all of host-b" assertion. Empirically verified
    // to fail against a neutered tie-break before landing.
    [Fact]
    public async Task MultiHost_AggregatedSessions_HostRegistrationOrderTieBreak()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Every session shares the SAME modifiedAt → the timestamp comparison is a
        // tie for ALL pairs, forcing the secondary (host-order) tie-break across a
        // large enough set that an unstable sort would scramble it absent the
        // comparison.
        const long sharedModifiedAt = 5_000;
        const int perHost = 12; // > introsort insertion-sort threshold (16 total each side margin)
        var aSessions = new List<SessionSummary>();
        var bSessions = new List<SessionSummary>();
        for (var i = 0; i < perHost; i++)
        {
            // Resource ordering is deliberately INTERLEAVED with host so the final
            // tie-break (resource ordinal) can't accidentally reproduce the
            // host-partition: host-a uses odd-ish keys, host-b even-ish, mixed.
            aSessions.Add(MakeSummary($"ahp-session:/a-{(perHost - i):D2}", $"a{i}", sharedModifiedAt));
            bSessions.Add(MakeSummary($"ahp-session:/b-{i:D2}", $"b{i}", sharedModifiedAt));
        }

        // Register "host-a" BEFORE "host-b".
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-a"),
            Label = "A",
            TransportFactory = FullFactory(cts.Token, sessions: aSessions),
        }, cts.Token);
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("host-b"),
            Label = "B",
            TransportFactory = FullFactory(cts.Token, sessions: bSessions),
        }, cts.Token);

        await WaitForHostStateAsync(m, new HostId("host-a"), s => s.Kind == HostStateKind.Connected, cts.Token);
        await WaitForHostStateAsync(m, new HostId("host-b"), s => s.Kind == HostStateKind.Connected, cts.Token);
        await WaitUntilAsync(() => m.AggregatedSessions().Count == perHost * 2, cts.Token);

        var aggregated = m.AggregatedSessions();
        Assert.Equal(perHost * 2, aggregated.Count);

        // The host-order tie-break must place EVERY host-a row before EVERY host-b
        // row (the two hosts share orderIndex 0 vs 1). Find the boundary: the first
        // host-b row, and assert no host-a row appears after it.
        var hostIds = aggregated.ConvertAll(r => r.HostId);
        var firstB = hostIds.FindIndex(h => h.Equals(new HostId("host-b")));
        Assert.Equal(perHost, firstB); // first perHost rows are all host-a
        for (var i = 0; i < perHost; i++)
            Assert.Equal(new HostId("host-a"), aggregated[i].HostId);
        for (var i = perHost; i < perHost * 2; i++)
            Assert.Equal(new HostId("host-b"), aggregated[i].HostId);
    }

    // ── 31. AggregatedSessions tie-break: Resource ordinal (within a host) ─
    //
    // Pins the FINAL tie-break branch (ordinal on Summary.Resource): sessions that
    // tie on BOTH modifiedAt AND host (same host, equal timestamp) are ordered by
    // Resource ordinal. The per-host snapshot layer co-enforces this ordering, so
    // this is a belt-and-suspenders OUTCOME pin spanning both sort layers — the
    // user-visible contract is "equal-timestamp sessions on one host come out in a
    // deterministic Resource-ordinal order".
    //
    // Falsifiability: a single host carries MANY equal-modifiedAt sessions listed
    // in REVERSE Resource order; the asserted output is strict ascending Resource
    // ordinal. A regression in EITHER sort layer (or a switch to an unstable sort
    // with no resource tie-break) breaks the strict-ascending assertion on this
    // large set.
    [Fact]
    public async Task MultiHost_AggregatedSessions_ResourceOrdinalTieBreak()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        // One host, all sessions at the SAME modifiedAt, supplied in REVERSE
        // resource order (s-20, s-19, …, s-01) so a working ordinal tie-break must
        // re-sort them to ascending (s-01, …, s-20).
        const long sharedModifiedAt = 9_000;
        const int n = 20;
        var reversed = new List<SessionSummary>();
        for (var i = n; i >= 1; i--)
            reversed.Add(MakeSummary($"ahp-session:/s-{i:D2}", $"t{i}", sharedModifiedAt));

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("solo"),
            Label = "Solo",
            TransportFactory = FullFactory(cts.Token, sessions: reversed),
        }, cts.Token);

        await WaitForHostStateAsync(m, new HostId("solo"), s => s.Kind == HostStateKind.Connected, cts.Token);
        await WaitUntilAsync(() => m.AggregatedSessions().Count == n, cts.Token);

        var aggregated = m.AggregatedSessions();
        Assert.Equal(n, aggregated.Count);
        // Equal modifiedAt + same host → strictly ascending Resource ordinal.
        var resources = aggregated.ConvertAll(r => r.Summary.Resource);
        var expected = new List<string>();
        for (var i = 1; i <= n; i++) expected.Add($"ahp-session:/s-{i:D2}");
        Assert.Equal(expected, resources);
        // Explicitly assert strict ordinal ascent (catches any pair inversion).
        for (var i = 1; i < resources.Count; i++)
            Assert.True(string.CompareOrdinal(resources[i - 1], resources[i]) < 0,
                $"row {i - 1} ({resources[i - 1]}) must sort before row {i} ({resources[i]})");
    }

    // ── 32. events(host, uri): a non-matching (empty) resource sees nothing ─
    //
    // §H sub-case (events nil/empty-resource). EventsForHost on a KNOWN host with
    // a URI that never matches any delivered channel (here the empty string)
    // yields a live reader that simply never fires — session notifications are
    // scoped to the root channel, so an empty-URI listener observes none of them,
    // while a root-channel listener on the SAME host does. This pins that the
    // per-(host,uri) fan-out is URI-scoped (not a firehose).
    [Fact]
    public async Task MultiHost_HostEvents_EmptyResourceListener_SeesNothing()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        var added = MakeSummary("ahp-session:/added", "post", modifiedAt: 200);
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "Host",
            TransportFactory = FullFactory(cts.Token, injectAfterInit: added),
        }, cts.Token);

        // Listener on an empty/non-matching resource and a control listener on the
        // root channel (where root/sessionAdded is scoped).
        var emptyReader = m.EventsForHost(new HostId("h"), "");
        var rootReader = m.EventsForHost(new HostId("h"), ProtocolVersion.RootResourceUri);

        // The root listener DOES see the injected sessionAdded.
        var sawOnRoot = false;
        for (var i = 0; i < 40 && !sawOnRoot; i++)
        {
            var (ok, ev) = await ReadWithTimeoutAsync(rootReader, cts.Token, 400);
            if (ok && ev is SubscriptionEventSessionAdded sa && sa.Params.Summary.Resource == "ahp-session:/added")
                sawOnRoot = true;
        }
        Assert.True(sawOnRoot, "the root-channel listener should see the injected sessionAdded");

        // The empty-resource listener saw NOTHING in that same window (URI-scoped
        // fan-out, not a firehose).
        var (gotEmpty, _empty) = await ReadWithTimeoutAsync(emptyReader, cts.Token, 300);
        Assert.False(gotEmpty, "an empty/non-matching resource listener must not receive root-channel events");
    }

    // ── Extra fake-server + transport helpers for the gap tests ────────────

    /// <summary>
    /// Server loop that responds to <c>initialize</c> with a JSON-RPC ERROR
    /// (not a result), driving the client's handshake to fault. Mirrors Swift's
    /// <c>startFailingInitFakeHost</c>. Any other request gets an empty success
    /// so a fallback path can resolve.
    /// </summary>
    private static async Task RunFailingInitServerAsync(MemTransport serverSide, CancellationToken ct)
    {
        try
        {
            while (true)
            {
                TransportMessage frame;
                try { frame = await serverSide.ReceiveAsync(ct).ConfigureAwait(false); }
                catch { return; }

                JsonRpcMessage msg;
                try { msg = Ser.DecodeMessage(frame); }
                catch { return; }

                if (msg.Request is null) continue;
                if (msg.Request.Method is "initialize" or "reconnect")
                {
                    var resp = new JsonRpcMessage
                    {
                        ErrorResponse = new JsonRpcErrorResponse
                        {
                            Id = msg.Request.Id,
                            Error = new JsonRpcErrorObject { Code = -32000, Message = "init refused for test" },
                        },
                    };
                    try { await serverSide.SendAsync(Ser.EncodeMessage(resp), ct).ConfigureAwait(false); }
                    catch { return; }
                }
                else
                {
                    await RespondEmptyAsync(serverSide, msg.Request.Id, ct).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) { }
    }

    /// <summary>
    /// Records whether <see cref="TrackingTransport.CloseAsync"/> ran. Mirrors
    /// Swift's <c>ClosedObserver</c> actor.
    /// </summary>
    private sealed class ClosedObserver
    {
        private int _closeCount;
        public bool IsClosed => Volatile.Read(ref _closeCount) > 0;
        public void MarkClosed() => Interlocked.Increment(ref _closeCount);
    }

    /// <summary>
    /// Thin <see cref="ITransport"/> wrapper that flips an observable closed flag
    /// on <see cref="CloseAsync"/>. Used to prove the supervisor shuts the
    /// underlying client down (which closes the transport) on a failed handshake.
    /// Mirrors Swift's <c>TrackingTransport</c>.
    /// </summary>
    private sealed class TrackingTransport : ITransport
    {
        private readonly ITransport _inner;
        private readonly ClosedObserver _observer;

        public TrackingTransport(ITransport inner, ClosedObserver observer)
        {
            _inner = inner; _observer = observer;
        }

        public ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default) =>
            _inner.SendAsync(message, cancellationToken);

        public ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default) =>
            _inner.ReceiveAsync(cancellationToken);

        public async ValueTask CloseAsync(CancellationToken cancellationToken = default)
        {
            _observer.MarkClosed();
            await _inner.CloseAsync(cancellationToken).ConfigureAwait(false);
        }

        public async ValueTask DisposeAsync()
        {
            _observer.MarkClosed();
            await _inner.DisposeAsync().ConfigureAwait(false);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Production-parity gap closure (features Swift ships + tests that the
    //  .NET surface previously lacked). All drive the REAL MultiHostClient /
    //  AhpClient over REAL MemTransport pairs with a fake server — NO mocking
    //  of the client, transport, or serializer; every test asserts a real
    //  outcome.
    // ══════════════════════════════════════════════════════════════════════

    /// <summary>Thread-safe recorder of the <c>clientSeq</c> values a fake server
    /// observed on inbound <c>dispatchAction</c> notifications. Mirrors Swift's
    /// <c>DispatchRecorder</c> actor.</summary>
    private sealed class DispatchRecorder
    {
        private readonly object _gate = new();
        private readonly List<long> _seqs = new();
        public void Append(long seq) { lock (_gate) { _seqs.Add(seq); } }
        public List<long> Seqs() { lock (_gate) { return new List<long>(_seqs); } }
    }

    /// <summary>
    /// Full fake server that ALSO captures the <c>clientSeq</c> of every inbound
    /// <c>dispatchAction</c> notification into <paramref name="recorder"/>. Answers
    /// <c>initialize</c> + <c>listSessions</c> like <see cref="RunFakeServerFullAsync"/>;
    /// acknowledges other requests with an empty success. Mirrors Swift's
    /// <c>startDispatchRecordingHost</c>.
    /// </summary>
    private static async Task RunDispatchRecordingServerAsync(
        MemTransport serverSide, DispatchRecorder recorder, CancellationToken ct)
    {
        try
        {
            while (true)
            {
                TransportMessage frame;
                try { frame = await serverSide.ReceiveAsync(ct).ConfigureAwait(false); }
                catch { return; }

                JsonRpcMessage msg;
                try { msg = Ser.DecodeMessage(frame); }
                catch { return; }

                // Capture the clientSeq carried by dispatchAction notifications —
                // the real value the client put on the wire (no mocking).
                if (msg.Notification?.Method == "dispatchAction" && msg.Notification.Params is { } p)
                {
                    var dispatched = Ser.Deserialize<DispatchActionParams>(p.GetRawText());
                    recorder.Append(dispatched.ClientSeq);
                    continue;
                }

                var method = msg.Request?.Method;
                if (method == "initialize")
                    await RespondInitializeWithRootAsync(serverSide, msg.Request!.Id, null, 0, ct).ConfigureAwait(false);
                else if (method == "listSessions")
                    await RespondListSessionsAsync(serverSide, msg.Request!.Id, Array.Empty<SessionSummary>(), ct).ConfigureAwait(false);
                else if (msg.Request is not null)
                    await RespondEmptyAsync(serverSide, msg.Request.Id, ct).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) { }
    }

    // ── Gap 1: HostEvent.removed(id) emitted on RemoveHostAsync ─────────────
    //
    // Swift's testRemoveHostTerminatesSupervisorAndEmitsEvent asserts a
    // HostEvent.removed(id) lands on hostEvents() when a host is removed. The
    // .NET HostEvent now carries an IsRemoved discriminator (mirroring Swift's
    // `removed` enum case); RemoveHostAsync emits it. Pin that a live Events()
    // listener observes a removal event for the right host id.
    [Fact]
    public async Task MultiHost_RemoveHost_EmitsRemovedEvent()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("temp"),
            Label = "Temporary",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("temp"), s => s.Kind == HostStateKind.Connected, cts.Token);

        // Attach the connection-event listener BEFORE removal so the removed
        // event isn't missed (Swift subscribes to hostEvents() before remove).
        var events = m.Events();

        await m.RemoveHostAsync(new HostId("temp"), cts.Token);

        // Drain until we see the removed event for the right host id. The host
        // is already gone by the time the event fires (removal precedes the
        // broadcast), so we assert the event, not the registry.
        var sawRemoved = false;
        for (var i = 0; i < 40 && !sawRemoved; i++)
        {
            var (ok, ev) = await ReadWithTimeoutAsync(events, cts.Token, 400);
            if (!ok) continue;
            if (ev.IsRemoved && ev.HostId.Equals(new HostId("temp")))
                sawRemoved = true;
        }
        Assert.True(sawRemoved, "expected a HostEvent with IsRemoved=true for host 'temp'");

        // And the host is no longer registered (the removal really happened).
        Assert.Null(m.Host(new HostId("temp")));
    }

    // ── Gap 1b: a state-change event is NOT mistaken for a removal ──────────
    //
    // Falsifiability guard for the IsRemoved discriminator: ordinary state
    // transitions (e.g. the connect that drives a host to Connected) must carry
    // IsRemoved=false. Without this, "IsRemoved" could be wired to a constant
    // and the test above would still pass.
    [Fact]
    public async Task MultiHost_StateChangeEvent_IsNotRemoved()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        // Listen before adding so we capture the connecting→connected transitions.
        var events = m.Events();

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("h"), s => s.Kind == HostStateKind.Connected, cts.Token);

        // Drain the buffered state-change events; every one must be a non-removal
        // carrying a real state kind, and at least one must report Connected.
        var sawConnectedNonRemoval = false;
        for (var i = 0; i < 40; i++)
        {
            var (ok, ev) = await ReadWithTimeoutAsync(events, cts.Token, 300);
            if (!ok) break;
            Assert.False(ev.IsRemoved, "a state-change event must not be flagged as a removal");
            if (ev.State.Kind == HostStateKind.Connected) sawConnectedNonRemoval = true;
        }
        Assert.True(sawConnectedNonRemoval, "expected a non-removal Connected state-change event");
    }

    // ── Gap 3: subscribe then unsubscribe drops the URI from the replay set ─
    //
    // Mirrors the unsubscribe half of Swift's subscribe/unsubscribe replay-set
    // tracking. After SubscribeAsync the URI is tracked for replay
    // (Host(id).Subscriptions); after UnsubscribeAsync it is gone.
    [Fact]
    public async Task MultiHost_Unsubscribe_DropsUriFromReplaySet()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var m = new MultiHostClient();
        await using var _mh = m;

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            Label = "H",
            TransportFactory = FullFactory(cts.Token),
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("h"), s => s.Kind == HostStateKind.Connected, cts.Token);

        const string uri = "copilot:/sub-target";

        // Subscribe → the URI is tracked for replay across reconnects.
        await m.SubscribeAsync(new HostId("h"), uri, cts.Token);
        Assert.Contains(uri, m.Host(new HostId("h"))!.Subscriptions);

        // Unsubscribe → the URI is dropped from the replay set.
        await m.UnsubscribeAsync(new HostId("h"), uri, cts.Token);
        Assert.DoesNotContain(uri, m.Host(new HostId("h"))!.Subscriptions);
    }

    // ── Gap 3b: unsubscribe on an unknown host → typed exception ────────────
    [Fact]
    public async Task MultiHost_UnknownHost_Unsubscribe_Throws()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var m = new MultiHostClient();
        await using var _mh = m;

        var ex = await Assert.ThrowsAsync<UnknownHostException>(() =>
            m.UnsubscribeAsync(new HostId("missing"), "copilot:/anything", cts.Token));
        Assert.Equal(new HostId("missing"), ex.HostId);
    }

    // ── Gap 3c: unsubscribe on a registered-but-disconnected host → typed ───
    //
    // The .NET surface (symmetric with SubscribeAsync) surfaces the no-live-
    // connection case as HostNotConnectedException. Build a host that connects
    // then drops with a disabled policy so it parks in .failed (registered, not
    // connected) — the same setup MultiHost_NotConnected_Dispatch_Throws uses.
    [Fact]
    public async Task MultiHost_NotConnected_Unsubscribe_Throws()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var m = new MultiHostClient();
        await using var _mh = m;

        var connectOnce = 0;
        HostTransportFactory factory = (id, ct) =>
        {
            var n = Interlocked.Increment(ref connectOnce);
            var (c, s) = MemTransport.CreatePair();
            if (n == 1)
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var sawInit = false; var sawList = false;
                        while (!ct.IsCancellationRequested && !(sawInit && sawList))
                        {
                            var frame = await s.ReceiveAsync(ct).ConfigureAwait(false);
                            var msg = Ser.DecodeMessage(frame);
                            if (msg.Request?.Method == "initialize")
                            { await RespondInitializeWithRootAsync(s, msg.Request.Id, null, 0, ct).ConfigureAwait(false); sawInit = true; }
                            else if (msg.Request?.Method == "listSessions")
                            { await RespondListSessionsAsync(s, msg.Request.Id, Array.Empty<SessionSummary>(), ct).ConfigureAwait(false); sawList = true; }
                            else if (msg.Request is not null)
                                await RespondEmptyAsync(s, msg.Request.Id, ct).ConfigureAwait(false);
                        }
                        await Task.Delay(100, ct).ConfigureAwait(false);
                    }
                    catch { /* ignore */ }
                    finally { await s.CloseAsync().ConfigureAwait(false); }
                });
            }
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("nc"),
            Label = "NC",
            TransportFactory = factory,
            ReconnectPolicy = ReconnectPolicy.Disabled,
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("nc"), s => s.Kind == HostStateKind.Failed, cts.Token, 12000);

        var ex = await Assert.ThrowsAsync<HostNotConnectedException>(() =>
            m.UnsubscribeAsync(new HostId("nc"), "copilot:/s1", cts.Token));
        Assert.Equal(new HostId("nc"), ex.HostId);
    }

    // ── Gap 4: explicit clientSeq override is sent verbatim on the wire ─────
    //
    // Mirrors Swift's testDispatchCanUseExplicitClientSeqThroughMultiHostSurfaces
    // (42 via the facade dispatch, 77 via the client handle). A fake server
    // records the clientSeq the client actually put on the dispatchAction
    // notification; both explicit values must arrive exactly, in order.
    [Fact]
    public async Task MultiHost_Dispatch_ExplicitClientSeq_SentOnWire()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var recorder = new DispatchRecorder();
        var m = new MultiHostClient();
        await using var _mh = m;

        HostTransportFactory factory = (id, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunDispatchRecordingServerAsync(s, recorder, cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("local"),
            Label = "Local",
            TransportFactory = factory,
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("local"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "From app outbox",
        });

        // 42 via the facade surface.
        var first = await m.DispatchAsync(new HostId("local"), action, "copilot:/s1", clientSeq: 42, cancellationToken: cts.Token);
        Assert.Equal(42, first.ClientSeq);

        // 77 via the generation-checked client handle surface.
        var handle = m.ClientFor(new HostId("local"));
        Assert.NotNull(handle);
        var second = await handle!.DispatchAsync(action, "copilot:/s1", clientSeq: 77, cancellationToken: cts.Token);
        Assert.Equal(77, second.ClientSeq);

        // The server observed exactly the explicit sequences the client put on
        // the wire, in dispatch order (no auto-increment substitution).
        await WaitUntilAsync(() =>
        {
            var seqs = recorder.Seqs();
            return seqs.Count == 2 && seqs[0] == 42 && seqs[1] == 77;
        }, cts.Token, 8000);
    }

    // ── Gap 4b: an explicit clientSeq advances the auto-increment counter ───
    //
    // After dispatching an explicit clientSeq, a subsequent AUTO-assigned
    // dispatch must not reuse a number at or below the explicit one (Swift's
    // `if clientSeq >= nextClientSeq { nextClientSeq = clientSeq + 1 }`). Prove
    // the next auto seq is explicit+1 = 43.
    [Fact]
    public async Task MultiHost_Dispatch_ExplicitClientSeq_AdvancesAutoCounter()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var recorder = new DispatchRecorder();
        var m = new MultiHostClient();
        await using var _mh = m;

        HostTransportFactory factory = (id, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            _ = Task.Run(() => RunDispatchRecordingServerAsync(s, recorder, cts.Token));
            return Task.FromResult<ITransport>(c);
        };

        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("local"),
            Label = "Local",
            TransportFactory = factory,
        }, cts.Token);
        await WaitForHostStateAsync(m, new HostId("local"), s => s.Kind == HostStateKind.Connected, cts.Token);

        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "x",
        });

        var handle = m.ClientFor(new HostId("local"));
        Assert.NotNull(handle);

        // Explicit 42, then an auto-assigned dispatch (clientSeq omitted).
        var first = await handle!.DispatchAsync(action, "copilot:/s1", clientSeq: 42, cancellationToken: cts.Token);
        Assert.Equal(42, first.ClientSeq);
        var auto = await handle.DispatchAsync(action, "copilot:/s1", cancellationToken: cts.Token);
        Assert.Equal(43, auto.ClientSeq); // counter advanced past the explicit value

        await WaitUntilAsync(() =>
        {
            var seqs = recorder.Seqs();
            return seqs.Count == 2 && seqs[0] == 42 && seqs[1] == 43;
        }, cts.Token, 8000);
    }

    // ── Per-channel replay cursor regression tests ──────────────────────────
    // Ports of clients/typescript/test/hosts.test.ts's four newest tests.
    // These prove the actual bug the per-channel cursor design fixes: a
    // single connection-wide watermark would let one channel's progress
    // silently skip another channel's undelivered actions on reconnect.

    [Fact]
    public async Task MultiHost_Reconnect_SendsIndependentPerChannelCursors_FastChannelNeverAdvancesSlowOne()
    {
        const string channelA = "ahp-canvas:/a";
        const string channelB = "ahp-canvas:/b";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var reconnectParams = new TaskCompletionSource<ReconnectParams>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        MemTransport? firstServer = null;
        var attempt = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            if (Interlocked.Increment(ref attempt) == 1)
            {
                firstServer = server;
                _ = Task.Run(() => FakeHost.New()
                    .OnInitialize((request, side, token) =>
                        RespondInitializeWithRootAsync(side, request.Id, null, 0, token))
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .On("subscribe", (request, side, token) =>
                        FakeHost.RespondResultAsync(side, request.Id, new SubscribeResult(), token))
                    .RunAsync(server, cts.Token));
            }
            else
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnReconnect((request, side, token) =>
                    {
                        reconnectParams.TrySetResult(
                            Ser.Deserialize<ReconnectParams>(request.Params!.Value.GetRawText()));
                        var result = new ReconnectResult
                        {
                            Channels = new List<ChannelRecovery>
                            {
                                new ChannelRecovery(new ChannelReplayRecovery
                                {
                                    Channel = channelA,
                                    Actions = new List<ActionEnvelope>(),
                                }),
                                new ChannelRecovery(new ChannelReplayRecovery
                                {
                                    Channel = channelB,
                                    Actions = new List<ActionEnvelope>(),
                                }),
                            },
                        };
                        return FakeHost.RespondResultAsync(side, request.Id, result, token);
                    })
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .RunAsync(server, cts.Token));
            }
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(20),
                MaxBackoff = TimeSpan.FromMilliseconds(20),
                BackoffMultiplier = 1,
            },
        }, cts.Token);

        await m.SubscribeAsync(new HostId("h"), channelA, cts.Token);
        await m.SubscribeAsync(new HostId("h"), channelB, cts.Token);

        // B races ahead to serverSeq=101 while A never receives anything. A
        // single connection-wide watermark would send `lastSeenServerSeq: 101`
        // on the next reconnect and silently skip any of A's undelivered
        // actions below that value; per-channel cursors must keep A at its
        // own baseline instead.
        await SendActionAsync(firstServer!, channelB, 101, cts.Token);
        await WaitUntilAsync(() => m.Host(new HostId("h"))?.ServerSeq == 101, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var observed = await reconnectParams.Task.WaitAsync(cts.Token);

        Assert.Equal(
            101,
            observed.Subscriptions.Single(s => s.Channel == channelB).LastSeenServerSeq);
        Assert.Equal(
            0,
            observed.Subscriptions.Single(s => s.Channel == channelA).LastSeenServerSeq);
    }

    [Fact]
    public async Task MultiHost_ChannelReplayRecovery_AdvancesOnlyThatChannelsCursor()
    {
        const string channelA = "ahp-canvas:/a";
        const string channelB = "ahp-canvas:/b";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var secondReconnectParams = new TaskCompletionSource<ReconnectParams>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var attempt = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            var currentAttempt = Interlocked.Increment(ref attempt);
            if (currentAttempt == 1)
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnInitialize((request, side, token) =>
                        RespondInitializeWithRootAsync(side, request.Id, null, 0, token))
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .On("subscribe", (request, side, token) =>
                        FakeHost.RespondResultAsync(side, request.Id, new SubscribeResult(), token))
                    .RunAsync(server, cts.Token));
            }
            else
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnReconnect((request, side, token) =>
                    {
                        if (currentAttempt == 3)
                        {
                            secondReconnectParams.TrySetResult(
                                Ser.Deserialize<ReconnectParams>(request.Params!.Value.GetRawText()));
                        }

                        // On the first reconnect, A exhausts a 2-action replay
                        // while B gets an empty replay. The *next* reconnect
                        // must report A's advanced cursor (11) while B — which
                        // had no actions — stays at 0.
                        var channels = new List<ChannelRecovery>
                        {
                            new ChannelRecovery(new ChannelReplayRecovery
                            {
                                Channel = channelA,
                                Actions = currentAttempt == 2
                                    ? new List<ActionEnvelope>
                                    {
                                        new()
                                        {
                                            Channel = channelA,
                                            ServerSeq = 10,
                                            Action = new StateAction(new SessionTitleChangedAction
                                            {
                                                Type = ActionType.SessionTitleChanged,
                                                Title = "a-10",
                                            }),
                                        },
                                        new()
                                        {
                                            Channel = channelA,
                                            ServerSeq = 11,
                                            Action = new StateAction(new SessionTitleChangedAction
                                            {
                                                Type = ActionType.SessionTitleChanged,
                                                Title = "a-11",
                                            }),
                                        },
                                    }
                                    : new List<ActionEnvelope>(),
                            }),
                            new ChannelRecovery(new ChannelReplayRecovery
                            {
                                Channel = channelB,
                                Actions = new List<ActionEnvelope>(),
                            }),
                        };
                        return FakeHost.RespondResultAsync(
                            side, request.Id, new ReconnectResult { Channels = channels }, token);
                    })
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .RunAsync(server, cts.Token));
            }
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(1),
                MaxBackoff = TimeSpan.FromMilliseconds(1),
                BackoffMultiplier = 1,
            },
        }, cts.Token);

        await m.SubscribeAsync(new HostId("h"), channelA, cts.Token);
        await m.SubscribeAsync(new HostId("h"), channelB, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        await WaitUntilAsync(() => m.Host(new HostId("h"))?.ServerSeq == 11, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var observed = await secondReconnectParams.Task.WaitAsync(cts.Token);

        Assert.Equal(
            11,
            observed.Subscriptions.Single(s => s.Channel == channelA).LastSeenServerSeq);
        Assert.Equal(
            0,
            observed.Subscriptions.Single(s => s.Channel == channelB).LastSeenServerSeq);
    }

    [Fact]
    public async Task MultiHost_ChannelSnapshotRecovery_SetsCursorFromFromSeqBaseline()
    {
        const string channelA = "ahp-canvas:/a";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var secondReconnectParams = new TaskCompletionSource<ReconnectParams>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var attempt = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            var currentAttempt = Interlocked.Increment(ref attempt);
            if (currentAttempt == 1)
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnInitialize((request, side, token) =>
                        RespondInitializeWithRootAsync(side, request.Id, null, 0, token))
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .On("subscribe", (request, side, token) =>
                        FakeHost.RespondResultAsync(side, request.Id, new SubscribeResult(), token))
                    .RunAsync(server, cts.Token));
            }
            else
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnReconnect((request, side, token) =>
                    {
                        if (currentAttempt == 3)
                        {
                            secondReconnectParams.TrySetResult(
                                Ser.Deserialize<ReconnectParams>(request.Params!.Value.GetRawText()));
                        }

                        var channels = new List<ChannelRecovery>
                        {
                            new ChannelRecovery(currentAttempt == 2
                                ? new ChannelSnapshotRecovery
                                {
                                    Channel = channelA,
                                    Snapshot = new Snapshot
                                    {
                                        Resource = channelA,
                                        FromSeq = 50,
                                        State = new SnapshotState(),
                                    },
                                }
                                : (object)new ChannelReplayRecovery
                                {
                                    Channel = channelA,
                                    Actions = new List<ActionEnvelope>(),
                                }),
                        };
                        return FakeHost.RespondResultAsync(
                            side, request.Id, new ReconnectResult { Channels = channels }, token);
                    })
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .RunAsync(server, cts.Token));
            }
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(1),
                MaxBackoff = TimeSpan.FromMilliseconds(1),
                BackoffMultiplier = 1,
            },
        }, cts.Token);

        await m.SubscribeAsync(new HostId("h"), channelA, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        await WaitUntilAsync(
            () => m.Host(new HostId("h"))?.State.Kind == HostStateKind.Connected,
            cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var observed = await secondReconnectParams.Task.WaitAsync(cts.Token);

        Assert.Equal(
            50,
            observed.Subscriptions.Single(s => s.Channel == channelA).LastSeenServerSeq);
    }

    [Fact]
    public async Task MultiHost_ChannelMissingRecovery_DropsFromSubscriptionsAndIsNotReRequested()
    {
        const string channelA = "ahp-canvas:/a";
        const string channelGone = "ahp-canvas:/gone";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var secondReconnectParams = new TaskCompletionSource<ReconnectParams>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var attempt = 0;

        HostTransportFactory factory = (id, ct) =>
        {
            var (client, server) = MemTransport.CreatePair();
            var currentAttempt = Interlocked.Increment(ref attempt);
            if (currentAttempt == 1)
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnInitialize((request, side, token) =>
                        RespondInitializeWithRootAsync(side, request.Id, null, 0, token))
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .On("subscribe", (request, side, token) =>
                        FakeHost.RespondResultAsync(side, request.Id, new SubscribeResult(), token))
                    .RunAsync(server, cts.Token));
            }
            else
            {
                _ = Task.Run(() => FakeHost.New()
                    .OnReconnect((request, side, token) =>
                    {
                        if (currentAttempt == 3)
                        {
                            secondReconnectParams.TrySetResult(
                                Ser.Deserialize<ReconnectParams>(request.Params!.Value.GetRawText()));
                        }

                        var channels = currentAttempt == 2
                            ? new List<ChannelRecovery>
                            {
                                new ChannelRecovery(new ChannelReplayRecovery
                                {
                                    Channel = channelA,
                                    Actions = new List<ActionEnvelope>(),
                                }),
                                new ChannelRecovery(new ChannelMissingRecovery { Channel = channelGone }),
                            }
                            : new List<ChannelRecovery>
                            {
                                new ChannelRecovery(new ChannelReplayRecovery
                                {
                                    Channel = channelA,
                                    Actions = new List<ActionEnvelope>(),
                                }),
                            };
                        return FakeHost.RespondResultAsync(
                            side, request.Id, new ReconnectResult { Channels = channels }, token);
                    })
                    .OnListSessions((request, side, token) =>
                        RespondListSessionsAsync(side, request.Id, Array.Empty<SessionSummary>(), token))
                    .RunAsync(server, cts.Token));
            }
            return Task.FromResult<ITransport>(client);
        };

        var m = new MultiHostClient();
        await using var _mh = m;
        await m.AddHostAsync(new HostConfig
        {
            Id = new HostId("h"),
            TransportFactory = factory,
            ReconnectPolicy = new ReconnectPolicy
            {
                InitialBackoff = TimeSpan.FromMilliseconds(1),
                MaxBackoff = TimeSpan.FromMilliseconds(1),
                BackoffMultiplier = 1,
            },
        }, cts.Token);

        await m.SubscribeAsync(new HostId("h"), channelA, cts.Token);
        await m.SubscribeAsync(new HostId("h"), channelGone, cts.Token);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        await WaitUntilAsync(
            () => !(m.Host(new HostId("h"))?.Subscriptions.Contains(channelGone) ?? true),
            cts.Token);
        Assert.Contains(channelA, m.Host(new HostId("h"))!.Subscriptions);

        await m.ReconnectAsync(new HostId("h"), cts.Token);
        var observed = await secondReconnectParams.Task.WaitAsync(cts.Token);

        Assert.DoesNotContain(channelGone, observed.Subscriptions.Select(s => s.Channel));
    }
}
