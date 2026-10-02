// Port of clients/go/ahp/client_test.go.
// Uses an in-memory transport pair (two linked channels) to exercise the real
// AhpClient over a real ITransport — no mocking of the client or JSON engine.
#nullable enable

using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;
using Microsoft.AgentHostProtocol.Hosts;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

// ── In-memory transport pair ──────────────────────────────────────────────────

/// <summary>
/// Paired in-memory transport. The two ends share linked channels so frames
/// flow from one's outbox directly into the other's inbox, exactly as the Go
/// <c>memTransport</c> helper works.
/// Graceful close rejects new sends but delivers accepted frames before closed.
/// </summary>
internal sealed class MemTransport : ITransport
{
    private readonly Channel<TransportMessage> _inbox;
    private readonly Channel<TransportMessage> _outbox;
    private MemTransport(
        Channel<TransportMessage> inbox,
        Channel<TransportMessage> outbox)
    {
        _inbox = inbox;
        _outbox = outbox;
    }

    /// <summary>Creates a linked pair. Frames sent to A appear on B's inbox and vice versa.</summary>
    public static (MemTransport A, MemTransport B) CreatePair()
    {
        var a2b = Channel.CreateBounded<TransportMessage>(new BoundedChannelOptions(16) { FullMode = BoundedChannelFullMode.Wait });
        var b2a = Channel.CreateBounded<TransportMessage>(new BoundedChannelOptions(16) { FullMode = BoundedChannelFullMode.Wait });
        return (new MemTransport(b2a, a2b), new MemTransport(a2b, b2a));
    }

    public async ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default)
    {
        try { await _outbox.Writer.WriteAsync(message, cancellationToken).ConfigureAwait(false); }
        catch (ChannelClosedException)
        { throw new AhpTransportException("closed"); }
    }

    public async ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default)
    {
        try { return await _inbox.Reader.ReadAsync(cancellationToken).ConfigureAwait(false); }
        catch (ChannelClosedException)
        { throw new AhpTransportException("closed"); }
    }

    public ValueTask CloseAsync(CancellationToken cancellationToken = default)
    {
        _outbox.Writer.TryComplete();
        _inbox.Writer.TryComplete();
        return ValueTask.CompletedTask;
    }

    public ValueTask DisposeAsync() => CloseAsync();
}

// ── Helper: fake server ───────────────────────────────────────────────────────

internal static class FakeServer
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    /// <summary>
    /// Reads one <c>initialize</c> request and responds with a stub
    /// <see cref="InitializeResult"/>.
    /// </summary>
    public static async Task HandleOneInitialize(MemTransport serverSide, CancellationToken ct = default)
    {
        var frame = await serverSide.ReceiveAsync(ct).ConfigureAwait(false);
        var msg = Ser.DecodeMessage(frame);
        Assert.NotNull(msg.Request);
        Assert.Equal("initialize", msg.Request!.Method);

        var result = new InitializeResult { ProtocolVersion = ProtocolVersion.Current, Snapshots = new() };
        var response = new JsonRpcMessage
        {
            SuccessResponse = new JsonRpcSuccessResponse
            {
                Id = msg.Request.Id,
                Result = Ser.SerializeToElement(result),
            }
        };
        await serverSide.SendAsync(Ser.EncodeMessage(response), ct).ConfigureAwait(false);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

public sealed class ClientTests
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    private static TcpConnectionSubscription TcpCreation() => new()
    {
        Type = "tcpConnection",
        Host = "localhost",
        Port = 3000,
        Encoding = TcpDataEncoding.Base64,
        ReceiveWindowBytes = 4,
        MaximumChunkSize = 2,
    };

    private static Snapshot TcpSnapshot(string resource = "ahp-tcp:/created") => new()
    {
        Resource = resource,
        FromSeq = 0,
        State = new SnapshotState
        {
            Tcp = new TcpConnectionState
            {
                Session = "ahp-session:/s1",
                Target = new TcpTarget { Host = "localhost", Port = 3000 },
                Encoding = TcpDataEncoding.Base64,
                Input = new FlowControlledByteDirectionState { WindowBytes = 4, MaximumChunkSize = 2 },
                Output = new FlowControlledByteDirectionState { WindowBytes = 4, MaximumChunkSize = 2 },
            },
        },
    };

    private static async Task<(MultiHostClient Multi, ChannelReader<MemTransport> Servers, MemTransport Server, TcpConnection Connection)>
        OpenTcpHost(CancellationToken token, bool autoReconnect = false)
    {
        var servers = Channel.CreateUnbounded<MemTransport>();
        var multi = new MultiHostClient();
        var add = multi.AddHostAsync(new HostConfig
        {
            Id = new HostId("tcp"),
            ClientId = "owner",
            ReconnectPolicy = autoReconnect
                ? new ReconnectPolicy { InitialBackoff = TimeSpan.FromMilliseconds(1), MaxBackoff = TimeSpan.FromMilliseconds(10) }
                : ReconnectPolicy.Disabled,
            TransportFactory = (_, _) =>
            {
                var (side, server) = MemTransport.CreatePair();
                servers.Writer.TryWrite(server);
                return Task.FromResult<ITransport>(side);
            },
        }, token);
        var initial = await servers.Reader.ReadAsync(token);
        await TcpResponse(initial, await TcpRequest(initial, "initialize", token), new InitializeResult
        {
            ProtocolVersion = ProtocolVersion.Current,
            Snapshots = new(),
            TcpConnections = new TcpConnectionsCapability { Encodings = new() { TcpDataEncoding.Base64 } },
        }, token);
        await TcpHostSessions(initial, token);
        await add;
        var open = multi.ClientFor(new HostId("tcp"))!.OpenTcpConnectionAsync("ahp-session:/s1", TcpCreation(), token);
        await TcpResponse(initial, await TcpRequest(initial, "subscribe", token), new SubscribeResult { Snapshot = TcpSnapshot() }, token);
        return (multi, servers.Reader, initial, await open);
    }

    private static async Task TcpHostSessions(MemTransport server, CancellationToken token)
        => await TcpResponse(server, await TcpRequest(server, "listSessions", token), new ListSessionsResult { Items = new() }, token);

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TcpHostReconnectRetainsStreamCreditPayloadAndGlobalSequence(bool spontaneous)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var token = timeout.Token;
        var (multi, servers, oldServer, connection) = await OpenTcpHost(token, spontaneous);
        await using var cleanup = multi;
        var id = new HostId("tcp");
        var handle = multi.ClientFor(id)!;
        var write = connection.WriteAsync(new byte[] { 1, 2, 3, 4, 5, 6 }, token);
        var first = await TcpDispatch(oldServer, token);
        var second = await TcpDispatch(oldServer, token);
        await TcpPush(oldServer, 1, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }), token);
        await TcpPush(oldServer, 2, first.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = first.ClientSeq });
        await handle.DispatchAsync(new StateAction(new SessionTitleChangedAction { Type = ActionType.SessionTitleChanged, Title = "ordinary" }),
            "ahp-session:/s1", 1000, token);
        Assert.Equal(1000, (await TcpDispatch(oldServer, token)).ClientSeq);
        while (connection.AppliedCheckpoint != 2) await Task.Delay(1, token);
        Assert.False(write.IsCompleted);
        await FakeHost.SendNotificationAsync(oldServer, "action", new ActionEnvelope
        {
            Channel = ProtocolVersion.RootResourceUri,
            ServerSeq = 50,
            Action = new StateAction(new RootActiveSessionsChangedAction { Type = ActionType.RootActiveSessionsChanged, ActiveSessions = 1 }),
        }, token);
        while (multi.Host(id)!.ServerSeq != 50) await Task.Delay(1, token);

        if (spontaneous) await oldServer.CloseAsync(token);
        else await multi.ReconnectAsync(id, token);
        var server = await servers.ReadAsync(token);
        var request = await TcpRequest(server, "reconnect", token);
        var parameters = Ser.Deserialize<ReconnectParams>(request.Params!.Value);
        Assert.Equal("owner", parameters.ClientId);
        Assert.Equal(2, parameters.LastSeenServerSeq);
        Assert.Contains(connection.Resource, parameters.Subscriptions);
        await TcpResponse(server, request, new ReconnectResult(new ReconnectReplayResult
        {
            Type = ReconnectResultType.Replay,
            Missing = new(),
            Actions = new()
            {
                new ActionEnvelope { Channel = connection.Resource, ServerSeq = 3,
                    Action = new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = 2 }) },
                new ActionEnvelope { Channel = connection.Resource, ServerSeq = 4,
                    Action = new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }) },
                new ActionEnvelope { Channel = ProtocolVersion.RootResourceUri, ServerSeq = 5,
                    Action = new StateAction(new RootActiveSessionsChangedAction { Type = ActionType.RootActiveSessionsChanged, ActiveSessions = 999 }) },
            },
        }), token);
        var resent = await TcpDispatch(server, token);
        Assert.Equal(second.ClientSeq, resent.ClientSeq);
        Assert.Equal(second.Action.Value, resent.Action.Value);
        DispatchActionParams? tail = null;
        bool sessions = false;
        while (tail is null || !sessions)
        {
            var frame = Ser.DecodeMessage(await server.ReceiveAsync(token));
            if (frame.Request is { } list)
            {
                Assert.Equal("listSessions", list.Method);
                await TcpResponse(server, list, new ListSessionsResult { Items = new() }, token);
                sessions = true;
            }
            else
            {
                tail = Ser.Deserialize<DispatchActionParams>(Assert.IsType<JsonRpcNotification>(frame.Notification).Params!.Value);
            }
        }
        Assert.Equal(4, Assert.IsType<TcpInputAction>(tail.Action.Value).Offset);
        Assert.True(tail.ClientSeq > 1000);
        await write.WaitAsync(token);
        while (multi.Host(id)!.Generation == handle.Generation) await Task.Delay(1, token);
        Assert.Equal(1, multi.Host(id)!.ActiveSessions);
        Assert.Throws<HostNotConnectedException>(() => handle.CheckAliveOrThrow());
        Assert.Equal(new byte[] { 7, 8 }, await connection.ReadAsync(token));
        Assert.IsType<TcpDataConsumedAction>((await TcpDispatch(server, token)).Action.Value);

        var fresh = multi.ClientFor(id)!;
        var open = fresh.OpenTcpConnectionAsync("ahp-session:/s1", TcpCreation(), token);
        await TcpResponse(server, await TcpRequest(server, "subscribe", token), new SubscribeResult { Snapshot = TcpSnapshot("ahp-tcp:/second") }, token);
        var additional = await open;
        await additional.DisposeAsync();
        await TcpUnsubscribe(server, additional.Resource, token);
        var read = connection.ReadAsync(token);
        Assert.False(read.IsCompleted); // replayed duplicate data was not enqueued twice
        var remove = multi.RemoveHostAsync(id, token);
        await remove;
        await TcpUnsubscribe(server, connection.Resource, token);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => read);
    }

    [Theory]
    [InlineData("snapshot")]
    [InlineData("missing")]
    [InlineData("initialize")]
    public async Task TcpHostReconnectFallbackFailsStreamsClosed(string mode)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var token = timeout.Token;
        var (multi, servers, _, connection) = await OpenTcpHost(token);
        await using var cleanup = multi;
        var id = new HostId("tcp");
        var generation = multi.Host(id)!.Generation;
        var read = connection.ReadAsync(token);
        await multi.ReconnectAsync(id, token);
        var server = await servers.ReadAsync(token);
        var request = await TcpRequest(server, "reconnect", token);
        if (mode == "initialize")
        {
            await server.SendAsync(Ser.EncodeMessage(new JsonRpcMessage
            {
                ErrorResponse = new JsonRpcErrorResponse
                {
                    Id = request.Id,
                    Error = new JsonRpcErrorObject { Code = -32601, Message = "reconnect unavailable" },
                },
            }), token);
        }
        else
        {
            var result = mode == "snapshot"
                ? new ReconnectResult(new ReconnectSnapshotResult { Type = ReconnectResultType.Snapshot, Snapshots = new() { TcpSnapshot() } })
                : new ReconnectResult(new ReconnectReplayResult { Type = ReconnectResultType.Replay, Actions = new(), Missing = new() { connection.Resource } });
            await TcpResponse(server, request, result, token);
        }
        await TcpUnsubscribe(server, connection.Resource, token);
        if (mode == "initialize")
        {
            var initialize = await TcpRequest(server, "initialize", token);
            var parameters = Ser.Deserialize<InitializeParams>(initialize.Params!.Value);
            Assert.NotNull(parameters.InitialSubscriptions);
            Assert.DoesNotContain(connection.Resource, parameters.InitialSubscriptions);
            await TcpResponse(server, initialize, new InitializeResult { ProtocolVersion = ProtocolVersion.Current, Snapshots = new() }, token);
        }
        await TcpHostSessions(server, token);
        while (multi.Host(id)!.Generation == generation) await Task.Delay(1, token);
        await Assert.ThrowsAnyAsync<Exception>(() => read);
        await connection.DisposeAsync();
        await multi.ShutdownAsync(token);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TcpHostShutdownTerminatesBlockedOperationsAndPendingCreation(bool disconnected)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var token = timeout.Token;
        var (multi, _, server, connection) = await OpenTcpHost(token);
        await using var cleanup = multi;
        var write = connection.WriteAsync(new byte[6], token);
        _ = await TcpDispatch(server, token);
        _ = await TcpDispatch(server, token);
        var read = connection.ReadAsync(token);
        var drain = connection.DrainAsync(token);
        Task<TcpConnection>? creation = null;
        if (disconnected)
        {
            await server.CloseAsync(token);
            while (!connection.IsSuspended) await Task.Delay(1, token);
        }
        else
        {
            creation = multi.ClientFor(new HostId("tcp"))!.OpenTcpConnectionAsync("ahp-session:/s1", TcpCreation(), token);
            _ = await TcpRequest(server, "subscribe", token);
        }
        Assert.False(write.IsCompleted);
        Assert.False(read.IsCompleted);
        Assert.False(drain.IsCompleted);
        var shutdown = multi.ShutdownAsync(token);
        if (!disconnected) await TcpUnsubscribe(server, connection.Resource, token);
        await shutdown.WaitAsync(token);
        if (creation is not null) await Assert.ThrowsAnyAsync<OperationCanceledException>(() => creation);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => read);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => write);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => drain);
    }

    [Fact]
    public async Task TcpHostShutdownDuringReconnectTerminatesRetainedStream()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (multi, servers, oldServer, connection) = await OpenTcpHost(token, autoReconnect: true);
        await using var cleanup = multi;
        var read = connection.ReadAsync(token);
        await oldServer.CloseAsync(token);
        var server = await servers.ReadAsync(token);
        _ = await TcpRequest(server, "reconnect", token);
        await multi.ShutdownAsync(token).WaitAsync(TimeSpan.FromSeconds(2), token);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => read);
    }

    private static async Task<JsonRpcRequest> TcpRequest(MemTransport server, string method, CancellationToken token)
    {
        var request = Assert.IsType<JsonRpcRequest>(Ser.DecodeMessage(await server.ReceiveAsync(token)).Request);
        Assert.Equal(method, request.Method);
        if (method == "subscribe" && request.Params!.Value.TryGetProperty("create", out var create))
            Assert.Equal("tcpConnection", create.GetProperty("type").GetString());
        return request;
    }

    private static async Task TcpResponse<T>(MemTransport server, JsonRpcRequest request, T result, CancellationToken token)
        => await server.SendAsync(Ser.EncodeMessage(new JsonRpcMessage
        {
            SuccessResponse = new JsonRpcSuccessResponse { Id = request.Id, Result = Ser.SerializeToElement(result) },
        }), token);

    private static async Task<DispatchActionParams> TcpDispatch(MemTransport server, CancellationToken token)
    {
        var notification = Assert.IsType<JsonRpcNotification>(Ser.DecodeMessage(await server.ReceiveAsync(token)).Notification);
        Assert.Equal("dispatchAction", notification.Method);
        return Ser.Deserialize<DispatchActionParams>(notification.Params!.Value);
    }

    private static async Task TcpUnsubscribe(MemTransport server, string resource, CancellationToken token)
    {
        var notification = Assert.IsType<JsonRpcNotification>(Ser.DecodeMessage(await server.ReceiveAsync(token)).Notification);
        Assert.Equal("unsubscribe", notification.Method);
        Assert.Equal(resource, notification.Params!.Value.GetProperty("channel").GetString());
    }

    private static async Task TcpPush(MemTransport server, long sequence, StateAction action, CancellationToken token, ActionOrigin? origin = null, string? rejectionReason = null, string channel = "ahp-tcp:/created")
        => await server.SendAsync(Ser.EncodeMessage(new JsonRpcMessage
        {
            Notification = new JsonRpcNotification
            {
                Method = "action",
                Params = Ser.SerializeToElement(new ActionEnvelope
                {
                    Channel = channel,
                    ServerSeq = sequence,
                    Action = action,
                    Origin = origin,
                    RejectionReason = rejectionReason,
                })
            },
        }), token);

    private static async Task TcpUnrelatedBurst(AhpClient client, MemTransport server, long firstSequence, CancellationToken token)
    {
        using var barrier = client.AttachSubscription("ahp-session:/barrier");
        for (int i = 0; i < 16; i++)
        {
            await TcpPush(server, firstSequence + i * 2, new StateAction(new SessionTitleChangedAction
            { Type = ActionType.SessionTitleChanged, Title = "busy" }), token, channel: "ahp-session:/other");
            await TcpPush(server, firstSequence + i * 2 + 1, new StateAction(new TcpDataAction
            { Type = ActionType.TcpData, Offset = i, Data = "AA==" }), token, channel: "ahp-tcp:/other");
        }
        await TcpPush(server, firstSequence + 32, new StateAction(new SessionTitleChangedAction
        { Type = ActionType.SessionTitleChanged, Title = "barrier" }), token, channel: barrier.Uri);
        await barrier.Events.ReadAsync(token);
    }

    [Fact]
    public async Task TcpScopedCreationAndActiveTraffic()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side, new ClientConfig { SubscriptionBufferCapacity = 2 });
        var initialize = client.InitializeAsync("owner", cancellationToken: token);
        await TcpResponse(server, await TcpRequest(server, "initialize", token), new InitializeResult
        {
            ProtocolVersion = ProtocolVersion.Current,
            Snapshots = new(),
            TcpConnections = new TcpConnectionsCapability { Encodings = new() { TcpDataEncoding.Base64 } },
        }, token);
        await initialize;
        var opening = client.OpenTcpConnectionAsync("ahp-session:/s1", TcpCreation(), token);
        var request = await TcpRequest(server, "subscribe", token);
        await TcpUnrelatedBurst(client, server, 1, token);
        await TcpResponse(server, request, new SubscribeResult { Snapshot = TcpSnapshot() with { FromSeq = 33 } }, token);
        await TcpPush(server, 34, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bw==" }), token);
        var connection = await opening.WaitAsync(token);
        await TcpUnrelatedBurst(client, server, 35, token);
        Assert.Equal(new byte[] { 7 }, await connection.ReadAsync(token));
        Assert.IsType<TcpDataConsumedAction>((await TcpDispatch(server, token)).Action.Value);
        await TcpPush(server, 68, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 1, Data = "CA==" }), token);
        Assert.Equal(new byte[] { 8 }, await connection.ReadAsync(token));
        Assert.IsType<TcpDataConsumedAction>((await TcpDispatch(server, token)).Action.Value);
        await CloseTcp(connection, server, token);
        Assert.Equal(0, client.EventListenerCount);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TcpScopedReconnectIsolatesTrafficAndReportsOwnedOverflow(bool overflow)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (oldSide, oldServer) = MemTransport.CreatePair();
        await using var old = AhpClient.Connect(oldSide);
        var connection = await OpenTcp(old, oldServer, token);
        await old.ShutdownAsync(preserveTcpConnections: true, cancellationToken: token);
        var (side, server) = MemTransport.CreatePair();
        await using var fresh = AhpClient.Connect(side, new ClientConfig { SubscriptionBufferCapacity = 2 });
        var reconnect = fresh.ReconnectTcpConnectionsAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "owner",
            LastSeenServerSeq = 0,
            Subscriptions = new(),
        }, new[] { connection }, token);
        var request = await TcpRequest(server, "reconnect", token);
        await TcpUnrelatedBurst(fresh, server, 2, token);
        if (overflow)
        {
            for (int i = 0; i < 3; i++)
                await TcpPush(server, 35 + i, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = i, Data = "AA==" }), token);
            await TcpUnrelatedBurst(fresh, server, 38, token);
        }
        await TcpResponse(server, request, new ReconnectResult(new ReconnectReplayResult
        {
            Type = ReconnectResultType.Replay,
            Missing = new(),
            Actions = overflow ? new() : new()
            {
                new ActionEnvelope { Channel = connection.Resource, ServerSeq = 1,
                    Action = new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bw==" }) },
            },
        }), token);
        if (!overflow)
            await TcpPush(server, 35, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 1, Data = "CA==" }), token);
        await reconnect.WaitAsync(token);
        if (overflow)
        {
            Assert.IsType<TcpClientResetAction>((await TcpDispatch(server, token)).Action.Value);
            await TcpUnsubscribe(server, connection.Resource, token);
            await Assert.ThrowsAsync<SubscriptionLagException>(() => connection.ReadAsync(token));
        }
        else
        {
            await TcpUnrelatedBurst(fresh, server, 36, token);
            Assert.Equal(new byte[] { 7 }, await connection.ReadAsync(token));
            Assert.Equal(new byte[] { 8 }, await connection.ReadAsync(token));
            _ = await TcpDispatch(server, token);
            _ = await TcpDispatch(server, token);
            await CloseTcp(connection, server, token);
        }
        Assert.Equal(0, fresh.EventListenerCount);
    }

    private static async Task<TcpConnection> OpenTcp(AhpClient client, MemTransport server, CancellationToken token, bool firstAction = false, bool invalidSnapshot = false, int maximumChunkSize = 2)
    {
        var initialize = client.InitializeAsync("owner", cancellationToken: token);
        await TcpResponse(server, await TcpRequest(server, "initialize", token), new InitializeResult
        {
            ProtocolVersion = ProtocolVersion.Current,
            Snapshots = new(),
            TcpConnections = new TcpConnectionsCapability { Encodings = new() { TcpDataEncoding.Base64 } },
        }, token);
        await initialize;
        var open = client.OpenTcpConnectionAsync("ahp-session:/s1", new TcpConnectionSubscription
        {
            Type = "tcpConnection",
            Host = "localhost",
            Port = 3000,
            Encoding = TcpDataEncoding.Base64,
            ReceiveWindowBytes = Math.Max(4, maximumChunkSize),
            MaximumChunkSize = maximumChunkSize,
        }, token);
        var direction = new FlowControlledByteDirectionState { WindowBytes = Math.Max(4, maximumChunkSize), MaximumChunkSize = maximumChunkSize, ReceivedBytes = invalidSnapshot ? 1 : 0 };
        await TcpResponse(server, await TcpRequest(server, "subscribe", token), new SubscribeResult
        {
            Snapshot = new Snapshot
            {
                Resource = "ahp-tcp:/created",
                FromSeq = 0,
                State = new SnapshotState
                {
                    Tcp = new TcpConnectionState
                    {
                        Session = "ahp-session:/s1",
                        Target = new TcpTarget { Host = "localhost", Port = 3000 },
                        Encoding = TcpDataEncoding.Base64,
                        Input = direction,
                        Output = direction,
                    },
                }
            },
        }, token);
        if (firstAction)
            await TcpPush(server, 1, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }), token);
        return await open;
    }

    private static async Task CloseTcp(TcpConnection connection, MemTransport server, CancellationToken token)
    {
        var close = connection.CloseAsync();
        Assert.IsType<TcpClientCloseAction>((await TcpDispatch(server, token)).Action.Value);
        await close;
        await connection.DisposeAsync();
        await TcpUnsubscribe(server, connection.Resource, token);
    }

    [Fact]
    public void TcpCreationRequiresCanonicalDiscriminator()
    {
        var create = TcpCreation() with { Type = "tcpConnection" };
        var capability = new TcpConnectionsCapability { Encodings = new() { TcpDataEncoding.Base64 } };
        TcpProtocol.ValidateRequest("ahp-session:/s1", create, capability);
        Assert.Equal("tcpConnection", Ser.SerializeToElement(new SubscribeParams
        {
            Channel = "ahp-session:/s1",
            Create = create,
        }).GetProperty("create").GetProperty("type").GetString());
        Assert.Throws<InvalidOperationException>(() =>
            TcpProtocol.ValidateRequest("ahp-session:/s1", create with { Type = "tcp" }, capability));
    }

    [Theory]
    [InlineData(1L)]
    [InlineData(4294967295L)]
    [InlineData(0L)]
    [InlineData(-1L)]
    [InlineData(4294967296L)]
    [InlineData(9007199254740991L)]
    public void TcpCreationAndSnapshotLimitsUseUInt32Range(long limit)
    {
        var capability = new TcpConnectionsCapability { Encodings = new() { TcpDataEncoding.Base64 } };
        var valid = limit >= 1 && limit <= 4294967295L;
        foreach (bool chunk in new[] { false, true })
        {
            var create = TcpCreation() with { ReceiveWindowBytes = limit, MaximumChunkSize = chunk ? limit : 1 };
            if (valid) TcpProtocol.ValidateRequest("ahp-session:/s1", create, capability);
            else Assert.Throws<InvalidOperationException>(() => TcpProtocol.ValidateRequest("ahp-session:/s1", create, capability));
            var request = TcpCreation() with { ReceiveWindowBytes = 4294967295L, MaximumChunkSize = 4294967295L };
            foreach (bool input in new[] { false, true })
            {
                var snapshot = TcpSnapshot();
                var direction = new FlowControlledByteDirectionState { WindowBytes = limit, MaximumChunkSize = chunk ? limit : 1 };
                var state = snapshot.State.Tcp!;
                snapshot = snapshot with { State = new SnapshotState { Tcp = input ? state with { Input = direction } : state with { Output = direction } } };
                if (valid) TcpProtocol.ValidateSnapshot("ahp-session:/s1", request, snapshot);
                else Assert.Throws<InvalidOperationException>(() => TcpProtocol.ValidateSnapshot("ahp-session:/s1", request, snapshot));
            }
        }
    }

    [Fact]
    public async Task TcpSingleClientReconnectFiltersReturnedReplayAtCallerCheckpoint()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (oldSide, oldServer) = MemTransport.CreatePair();
        await using var old = AhpClient.Connect(oldSide);
        var connection = await OpenTcp(old, oldServer, token);
        await connection.AcceptAsync(new ActionEnvelope
        {
            Channel = connection.Resource,
            ServerSeq = 10,
            Action = new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = 0 })
        });
        await old.ShutdownAsync(preserveTcpConnections: true, cancellationToken: token);
        var (side, server) = MemTransport.CreatePair();
        await using var fresh = AhpClient.Connect(side);
        var parameters = new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "owner",
            LastSeenServerSeq = 100,
            Subscriptions = new() { "ahp-session:/s1" },
        };
        var reconnect = fresh.ReconnectTcpConnectionsAsync(parameters, new[] { connection }, token);
        var request = await TcpRequest(server, "reconnect", token);
        Assert.Equal(10, Ser.Deserialize<ReconnectParams>(request.Params!.Value).LastSeenServerSeq);
        var actions = new System.Collections.Generic.List<ActionEnvelope>();
        for (long sequence = 11; sequence <= 101; sequence++)
            actions.Add(new ActionEnvelope
            {
                Channel = sequence == 50 ? connection.Resource : "ahp-session:/s1",
                ServerSeq = sequence,
                Action = sequence == 50
                    ? new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" })
                    : new StateAction(new SessionTitleChangedAction { Type = ActionType.SessionTitleChanged, Title = $"title-{sequence}" })
            });
        actions.Add(new ActionEnvelope
        {
            Channel = connection.Resource,
            ServerSeq = 102,
            Action = new StateAction(new TcpDataEofAction { Type = ActionType.TcpDataEof, FinalOffset = 2 })
        });
        await TcpResponse(server, request, new ReconnectResult(new ReconnectReplayResult
        {
            Type = ReconnectResultType.Replay,
            Actions = actions,
            Missing = new() { "ahp-session:/missing" },
        }), token);
        var returned = Assert.IsType<ReconnectReplayResult>((await reconnect.WaitAsync(token)).Value);
        Assert.Equal(100, parameters.LastSeenServerSeq);
        Assert.Equal(102, connection.AppliedCheckpoint);
        Assert.Equal(2, connection.State.Output.ReceivedBytes);
        Assert.Equal(2, connection.State.Output.EofAtBytes);
        Assert.Equal(new byte[] { 7, 8 }, await connection.ReadAsync(token));
        Assert.IsType<TcpDataConsumedAction>((await TcpDispatch(server, token)).Action.Value);
        Assert.Equal(new long[] { 101, 102 }, returned.Actions.ConvertAll(action => action.ServerSeq));
        Assert.Equal(new[] { "ahp-session:/missing" }, returned.Missing);
        await connection.DisposeAsync();
        await TcpUnsubscribe(server, connection.Resource, token);
    }

    [Fact]
    public async Task TcpPeerCloseRespondsWithoutWaitingForCreditOrUnreadOutput()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        var connection = await OpenTcp(client, server, token);
        var write = connection.WriteAsync(new byte[5], token);
        var first = await TcpDispatch(server, token);
        var second = await TcpDispatch(server, token);
        var drain = connection.DrainAsync(token);
        await TcpPush(server, 1, first.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = first.ClientSeq });
        await TcpPush(server, 2, second.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = second.ClientSeq });
        await TcpPush(server, 3, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }), token);
        await TcpPush(server, 4, new StateAction(new TcpHostCloseAction { Type = ActionType.TcpHostClose }), token);
        var close = await TcpDispatch(server, token);
        Assert.IsType<TcpClientCloseAction>(close.Action.Value);
        Assert.False(drain.IsCompleted);
        Assert.Equal(0, connection.State.Input.ConsumedBytes);
        Assert.Equal(0, connection.State.Output.ConsumedBytes);
        Assert.Equal(1, client.EventListenerCount);
        await Assert.ThrowsAsync<InvalidOperationException>(() => write.WaitAsync(token));
        await TcpPush(server, 5, close.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = close.ClientSeq });
        await TcpPush(server, 6, new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = 4 }), token);
        await drain.WaitAsync(token);
        Assert.Equal(new byte[] { 7, 8 }, await connection.ReadAsync(token));
        var credit = await TcpDispatch(server, token);
        Assert.IsType<TcpDataConsumedAction>(credit.Action.Value);
        await TcpPush(server, 7, credit.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = credit.ClientSeq });
        await TcpUnsubscribe(server, connection.Resource, token);
        Assert.Null(await connection.ReadAsync(token));
    }

    [Fact]
    public async Task TcpLocalCloseRetainsCrossingTrafficUntilBothDirectionsDrain()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        var connection = await OpenTcp(client, server, token);
        await connection.WriteAsync(new byte[] { 1, 2 }, token);
        var input = await TcpDispatch(server, token);
        var drain = connection.DrainAsync(token);
        await connection.CloseAsync();
        var close = await TcpDispatch(server, token);
        Assert.IsType<TcpClientCloseAction>(close.Action.Value);
        Assert.False(connection.IsClosed);
        Assert.Equal(1, client.EventListenerCount);
        var read = connection.ReadAsync(token);
        Assert.False(read.IsCompleted);
        await TcpPush(server, 1, input.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = input.ClientSeq });
        await TcpPush(server, 2, close.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = close.ClientSeq });
        await TcpPush(server, 3, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }), token);
        Assert.Equal(new byte[] { 7, 8 }, await read.WaitAsync(token));
        var credit = await TcpDispatch(server, token);
        Assert.Equal(2, Assert.IsType<TcpDataConsumedAction>(credit.Action.Value).ConsumedBytes);
        await connection.AcceptAsync(new ActionEnvelope
        {
            Channel = connection.Resource,
            ServerSeq = 4,
            Action = new StateAction(new TcpHostCloseAction { Type = ActionType.TcpHostClose })
        });
        Assert.False(connection.IsClosed);
        Assert.False(drain.IsCompleted);
        Assert.Equal(1, client.EventListenerCount);
        await connection.AcceptAsync(new ActionEnvelope
        {
            Channel = connection.Resource,
            ServerSeq = 5,
            Action = credit.Action,
            Origin = new ActionOrigin { ClientId = "owner", ClientSeq = credit.ClientSeq }
        });
        Assert.False(connection.IsClosed);
        await TcpPush(server, 6, new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = 2 }), token);
        await TcpUnsubscribe(server, connection.Resource, token);
        await drain.WaitAsync(token);
        Assert.Null(await connection.ReadAsync(token));
        Assert.True(connection.IsClosed);
        Assert.Equal(0, client.EventListenerCount);
        await connection.CloseAsync();
        await connection.DisposeAsync();
    }

    [Fact]
    public async Task TcpAdapterRejectsStaleCreationAndDetachesCancelledSetup()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        await Assert.ThrowsAsync<InvalidOperationException>(() => OpenTcp(client, server, token, invalidSnapshot: true));
        await TcpUnsubscribe(server, "ahp-tcp:/created", token);
        Assert.Equal(0, client.EventListenerCount);
        using var cancellation = new CancellationTokenSource();
        var open = client.OpenTcpConnectionAsync("ahp-session:/s1", new TcpConnectionSubscription
        {
            Type = "tcpConnection",
            Host = "localhost",
            Port = 3000,
            Encoding = TcpDataEncoding.Base64,
            ReceiveWindowBytes = 4,
            MaximumChunkSize = 2,
        }, cancellation.Token);
        _ = await TcpRequest(server, "subscribe", token);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => open);
        Assert.Equal(0, client.EventListenerCount);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TcpResetOrDisposeTerminatesClosingStream(bool reset)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        var connection = await OpenTcp(client, server, token);
        var write = connection.WriteAsync(new byte[5], token);
        _ = await TcpDispatch(server, token);
        _ = await TcpDispatch(server, token);
        var drain = connection.DrainAsync(token);
        await connection.CloseAsync();
        _ = await TcpDispatch(server, token);
        await Assert.ThrowsAsync<InvalidOperationException>(() => write.WaitAsync(token));
        Assert.False(drain.IsCompleted);
        if (reset)
        {
            await connection.AcceptAsync(new ActionEnvelope
            {
                Channel = connection.Resource,
                ServerSeq = 1,
                Action = new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" })
            });
            await TcpPush(server, 2, new StateAction(new TcpHostResetAction { Type = ActionType.TcpHostReset, Reason = TcpResetReason.ProtocolError }), token);
            await TcpUnsubscribe(server, connection.Resource, token);
            await Assert.ThrowsAsync<InvalidOperationException>(() => connection.ReadAsync(token));
        }
        else
        {
            var read = connection.ReadAsync(token);
            Assert.False(read.IsCompleted);
            await connection.DisposeAsync();
            await TcpUnsubscribe(server, connection.Resource, token);
            await Assert.ThrowsAsync<ObjectDisposedException>(() => read);
        }
        await Assert.ThrowsAnyAsync<InvalidOperationException>(() => drain.WaitAsync(token));
        Assert.Equal(0, client.EventListenerCount);
        await connection.DisposeAsync();
        await connection.CloseAsync();
    }

    [Fact]
    public async Task TcpCloseWhileSuspendedReplaysAndDrainsBeforeRelease()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (oldSide, oldServer) = MemTransport.CreatePair();
        await using var old = AhpClient.Connect(oldSide);
        var connection = await OpenTcp(old, oldServer, token);
        await old.ShutdownAsync(preserveTcpConnections: true, cancellationToken: token);
        await connection.CloseAsync();
        Assert.False(connection.IsClosed);
        var read = connection.ReadAsync(token);
        Assert.False(read.IsCompleted);
        var (side, server) = MemTransport.CreatePair();
        await using var fresh = AhpClient.Connect(side);
        var reconnect = fresh.ReconnectTcpConnectionsAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "owner",
            LastSeenServerSeq = 0,
            Subscriptions = new(),
        }, new[] { connection }, token);
        var request = await TcpRequest(server, "reconnect", token);
        Assert.Contains(connection.Resource, Ser.Deserialize<ReconnectParams>(request.Params!.Value).Subscriptions);
        await TcpResponse(server, request, new ReconnectResult(new ReconnectReplayResult
        {
            Type = ReconnectResultType.Replay,
            Missing = new(),
            Actions = new()
            {
                new() { Channel = connection.Resource, ServerSeq = 1, Action = new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }) },
                new() { Channel = connection.Resource, ServerSeq = 2, Action = new StateAction(new TcpHostCloseAction { Type = ActionType.TcpHostClose }) },
            },
        }), token);
        await reconnect.WaitAsync(token);
        var close = await TcpDispatch(server, token);
        Assert.IsType<TcpClientCloseAction>(close.Action.Value);
        Assert.Equal(new byte[] { 7, 8 }, await read.WaitAsync(token));
        var credit = await TcpDispatch(server, token);
        Assert.IsType<TcpDataConsumedAction>(credit.Action.Value);
        Assert.Equal(1, fresh.EventListenerCount);
        await TcpPush(server, 3, close.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = close.ClientSeq });
        await TcpPush(server, 4, credit.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = credit.ClientSeq });
        await TcpUnsubscribe(server, connection.Resource, token);
        Assert.Null(await connection.ReadAsync(token));
        Assert.Equal(0, fresh.EventListenerCount);
    }

    [Theory]
    [InlineData(false, "ahp-tcp:/late")]
    [InlineData(true, "ahp-tcp:/late")]
    [InlineData(true, "ahp-session:/s1")]
    public async Task TcpAdapterReleasesLateCreationWithoutUnsubscribingParent(bool cancel, string resource)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var clock = new FakeTimeProvider();
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side, new ClientConfig { TimeProvider = clock, DefaultRequestTimeout = TimeSpan.FromMinutes(1) });
        var initial = await OpenTcp(client, server, token);
        await CloseTcp(initial, server, token);
        using var cancellation = new CancellationTokenSource();
        var open = client.OpenTcpConnectionAsync("ahp-session:/s1", new TcpConnectionSubscription
        {
            Type = "tcpConnection",
            Host = "localhost",
            Port = 3000,
            Encoding = TcpDataEncoding.Base64,
            ReceiveWindowBytes = 4,
            MaximumChunkSize = 2,
        }, cancellation.Token);
        var request = await TcpRequest(server, "subscribe", token);
        if (cancel) cancellation.Cancel();
        else clock.Advance(TimeSpan.FromMinutes(1));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => open.WaitAsync(token));
        Assert.Equal(0, client.EventListenerCount);
        Assert.Equal(0, client.PendingRequestCount);
        await TcpResponse(server, request, new { snapshot = new { resource } }, token);
        if (resource.StartsWith("ahp-tcp:", StringComparison.Ordinal)) await TcpUnsubscribe(server, resource, token);
        using var barrier = client.AttachSubscription("ahp-session:/barrier");
        await TcpResponse(server, request, new { snapshot = new { resource } }, token);
        await server.SendAsync(BuildActionNotification("ahp-session:/barrier", 99, "barrier"), token);
        _ = await barrier.Events.ReadAsync(token);
        var probe = client.RequestAsync<SubscribeParams, SubscribeResult>("probe", new SubscribeParams { Channel = "ahp-session:/s1" }, token);
        await TcpResponse(server, await TcpRequest(server, "probe", token), new SubscribeResult(), token);
        await probe.WaitAsync(token);
        Assert.Equal(ConnectionState.Connected, client.ConnectionState);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task TcpAdapterResetCloseAndDisposeWakeAllBlockedOperations(int terminal)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        var connection = await OpenTcp(client, server, token);
        var read = connection.ReadAsync(token);
        var write = connection.WriteAsync(new byte[5], token);
        _ = await TcpDispatch(server, token);
        _ = await TcpDispatch(server, token);
        var drain = connection.DrainAsync(token);
        if (terminal == 1)
            await TcpPush(server, 1, new StateAction(new TcpHostResetAction { Type = ActionType.TcpHostReset, Reason = TcpResetReason.ProtocolError }), token);
        else if (terminal == 2)
            await CloseTcp(connection, server, token);
        else
            await connection.DisposeAsync();
        if (terminal != 2) await TcpUnsubscribe(server, connection.Resource, token);
        await Assert.ThrowsAnyAsync<InvalidOperationException>(() => read.WaitAsync(token));
        foreach (var operation in new Task[] { write, drain })
            await Assert.ThrowsAnyAsync<InvalidOperationException>(() => operation.WaitAsync(token));
        await connection.DisposeAsync();
        Assert.Equal(0, client.EventListenerCount);
    }

    [Fact]
    public async Task TcpAdapterReconnectContinuesBlockedWriterAfterReplayCredit()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (oldSide, oldServer) = MemTransport.CreatePair();
        await using var oldClient = AhpClient.Connect(oldSide);
        var connection = await OpenTcp(oldClient, oldServer, token);
        var write = connection.WriteAsync(new byte[6], token);
        var first = await TcpDispatch(oldServer, token);
        var second = await TcpDispatch(oldServer, token);
        await TcpPush(oldServer, 1, first.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = first.ClientSeq });
        await TcpPush(oldServer, 2, second.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = second.ClientSeq });
        await TcpPush(oldServer, 3, new StateAction(new TcpDataEofAction { Type = ActionType.TcpDataEof, FinalOffset = 0 }), token);
        Assert.Null(await connection.ReadAsync(token));
        Assert.False(write.IsCompleted);
        await oldClient.DispatchAsync("ahp-session:/s1",
            new StateAction(new SessionTitleChangedAction { Type = ActionType.SessionTitleChanged, Title = "ordinary action" }), 100, token);
        Assert.Equal(100, (await TcpDispatch(oldServer, token)).ClientSeq);
        await oldClient.ShutdownAsync(preserveTcpConnections: true, cancellationToken: token);
        var (side, server) = MemTransport.CreatePair();
        await using var fresh = AhpClient.Connect(side);
        var reconnect = fresh.ReconnectTcpConnectionsAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "owner",
            Subscriptions = new(),
            LastSeenServerSeq = 20,
        }, new[] { connection }, token);
        var request = await TcpRequest(server, "reconnect", token);
        Assert.Equal(3, Ser.Deserialize<ReconnectParams>(request.Params!.Value).LastSeenServerSeq);
        await TcpResponse(server, request, new ReconnectResult(new ReconnectReplayResult
        {
            Type = ReconnectResultType.Replay,
            Missing = new(),
            Actions = new()
            {
                new() { Channel = connection.Resource, ServerSeq = 4, Action = new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = 2 }) },
            },
        }), token);
        await reconnect.WaitAsync(token);
        var tail = await TcpDispatch(server, token);
        Assert.Equal(4, Assert.IsType<TcpInputAction>(tail.Action.Value).Offset);
        Assert.True(tail.ClientSeq > 100);
        await write.WaitAsync(token);
        await CloseTcp(connection, server, token);
    }

    [Fact]
    public async Task TcpAdapterReservesCreditChunksReadsDuplicatesAndHalfCloses()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (clientSide, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);
        var connection = await OpenTcp(client, server, token);
        var write = connection.WriteAsync(new byte[] { 1, 2, 3, 4, 5 }, token);
        var first = await TcpDispatch(server, token);
        var second = await TcpDispatch(server, token);
        Assert.Equal(2, Convert.FromBase64String(Assert.IsType<TcpInputAction>(first.Action.Value).Data).Length);
        Assert.Equal(2, Assert.IsType<TcpInputAction>(second.Action.Value).Offset);
        Assert.False(write.IsCompleted);
        await Assert.ThrowsAsync<InvalidOperationException>(() => connection.WriteAsync(new byte[] { 9 }, token));
        await TcpPush(server, 1, first.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = first.ClientSeq });
        await TcpPush(server, 2, second.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = second.ClientSeq });
        await TcpPush(server, 3, new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = 2 }), token);
        var third = await TcpDispatch(server, token);
        await write.WaitAsync(token);
        Assert.Equal(4, Assert.IsType<TcpInputAction>(third.Action.Value).Offset);
        var drain = connection.DrainAsync(token);
        Assert.False(drain.IsCompleted);
        await TcpPush(server, 4, third.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = third.ClientSeq });
        await TcpPush(server, 5, new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = 5 }), token);
        await drain.WaitAsync(token);
        var data = new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" });
        await TcpPush(server, 6, data, token);
        await TcpPush(server, 7, data, token);
        await TcpPush(server, 8, new StateAction(new TcpDataEofAction { Type = ActionType.TcpDataEof, FinalOffset = 2 }), token);
        Assert.Equal(new byte[] { 7, 8 }, await connection.ReadAsync(token));
        Assert.Equal(2, Assert.IsType<TcpDataConsumedAction>((await TcpDispatch(server, token)).Action.Value).ConsumedBytes);
        Assert.Null(await connection.ReadAsync(token));
        await connection.EndAsync(token);
        Assert.Equal(5, Assert.IsType<TcpInputEofAction>((await TcpDispatch(server, token)).Action.Value).FinalOffset);
        await CloseTcp(connection, server, token);
        Assert.Equal(0, client.EventListenerCount);
    }

    [Fact]
    public async Task TcpAdapterPreservesFirstActionAndStrictLossWakesWaiters()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (clientSide, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);
        var connection = await OpenTcp(client, server, token, firstAction: true);
        Assert.Equal(new byte[] { 7, 8 }, await connection.ReadAsync(token));
        _ = await TcpDispatch(server, token);
        var read = connection.ReadAsync(token);
        var write = connection.WriteAsync(new byte[5], token);
        _ = await TcpDispatch(server, token);
        _ = await TcpDispatch(server, token);
        var drain = connection.DrainAsync(token);
        await server.SendAsync(TransportMessage.FromText("{"), token);
        await Assert.ThrowsAsync<AhpTransportException>(() => read);
        await Assert.ThrowsAsync<AhpTransportException>(() => write);
        await Assert.ThrowsAsync<AhpTransportException>(() => drain);
        Assert.IsType<TcpClientResetAction>((await TcpDispatch(server, token)).Action.Value);
        await TcpUnsubscribe(server, connection.Resource, token);
        await connection.DisposeAsync();
        Assert.Equal(0, client.EventListenerCount);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("owner")]
    [InlineData("negative")]
    [InlineData("unsafe")]
    [InlineData("unassigned")]
    [InlineData("wrong-pending")]
    [InlineData("reused")]
    [InlineData("payload")]
    [InlineData("eof")]
    [InlineData("credit")]
    [InlineData("close")]
    [InlineData("reset")]
    [InlineData("rejected-empty")]
    public async Task TcpAdapterRejectsMalformedClientEchoWithoutAdvancingState(string malformed)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        var connection = await OpenTcp(client, server, token);
        var read = connection.ReadAsync(token);
        var write = connection.WriteAsync(new byte[] { 1, 2, 3, 4, 5 }, token);
        var first = await TcpDispatch(server, token);
        var second = await TcpDispatch(server, token);
        var drain = connection.DrainAsync(token);
        StateAction action = first.Action;
        ActionOrigin? origin = new() { ClientId = "owner", ClientSeq = first.ClientSeq };
        switch (malformed)
        {
            case "missing": origin = null; break;
            case "owner": origin = origin with { ClientId = "other" }; break;
            case "negative": origin = origin with { ClientSeq = -1 }; break;
            case "unsafe": origin = origin with { ClientSeq = 9007199254740992 }; break;
            case "unassigned": origin = origin with { ClientSeq = second.ClientSeq + 1 }; break;
            case "wrong-pending": origin = origin with { ClientSeq = second.ClientSeq }; break;
            case "reused":
                await TcpPush(server, 1, first.Action, token, origin);
                action = second.Action;
                break;
            case "payload": action = new StateAction(new TcpInputAction { Type = ActionType.TcpInput, Offset = 0, Data = "AgE=" }); break;
            case "eof": origin = null; action = new StateAction(new TcpInputEofAction { Type = ActionType.TcpInputEof, FinalOffset = 0 }); break;
            case "credit": origin = null; action = new StateAction(new TcpDataConsumedAction { Type = ActionType.TcpDataConsumed, ConsumedBytes = 0 }); break;
            case "close": origin = null; action = new StateAction(new TcpClientCloseAction { Type = ActionType.TcpClientClose }); break;
            case "reset": origin = null; action = new StateAction(new TcpClientResetAction { Type = ActionType.TcpClientReset, Reason = TcpResetReason.ProtocolError }); break;
        }
        await TcpPush(server, 2, action, token, origin, malformed == "rejected-empty" ? "" : null);
        foreach (var pending in new Task[] { read, write, drain })
            await Assert.ThrowsAsync<InvalidOperationException>(() => pending.WaitAsync(token));
        Assert.Equal(malformed == "reused" ? 2 : 0, connection.State.Input.ReceivedBytes);
        Assert.Equal(0, connection.State.Input.ConsumedBytes);
        Assert.IsType<TcpClientResetAction>((await TcpDispatch(server, token)).Action.Value);
        await TcpUnsubscribe(server, connection.Resource, token);
        Assert.Equal(0, client.EventListenerCount);
        await connection.DisposeAsync();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TcpAdapterReconnectRetainsReadersAndResendsOnlyUnacknowledgedActions(bool acknowledged)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (oldSide, oldServer) = MemTransport.CreatePair();
        await using var oldClient = AhpClient.Connect(oldSide);
        var connection = await OpenTcp(oldClient, oldServer, token);
        await connection.WriteAsync(new byte[] { 1, 2 }, token);
        var original = await TcpDispatch(oldServer, token);
        var read = connection.ReadAsync(token);
        await oldClient.ShutdownAsync(preserveTcpConnections: true, cancellationToken: token);
        var (freshSide, server) = MemTransport.CreatePair();
        await using var fresh = AhpClient.Connect(freshSide);
        await Assert.ThrowsAsync<InvalidOperationException>(() => fresh.ReconnectTcpConnectionsAsync(
            new ReconnectParams { Channel = ProtocolVersion.RootResourceUri, ClientId = "other", LastSeenServerSeq = 20, Subscriptions = new() },
            new[] { connection }, token));
        var reconnect = fresh.ReconnectTcpConnectionsAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "owner",
            LastSeenServerSeq = 20,
            Subscriptions = new() { "ahp-session:/s1" },
        }, new[] { connection }, token);
        var request = await TcpRequest(server, "reconnect", token);
        var parameters = Ser.Deserialize<ReconnectParams>(request.Params!.Value);
        Assert.Equal(0, parameters.LastSeenServerSeq);
        Assert.Contains(connection.Resource, parameters.Subscriptions);
        var actions = new System.Collections.Generic.List<ActionEnvelope>
        {
            new() { Channel = connection.Resource, ServerSeq = 1, Action = new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }),
                Origin = new ActionOrigin { ClientId = "owner", ClientSeq = original.ClientSeq } },
        };
        if (acknowledged)
            actions.Add(new ActionEnvelope
            {
                Channel = connection.Resource,
                ServerSeq = 2,
                Action = original.Action,
                Origin = new ActionOrigin { ClientId = "owner", ClientSeq = original.ClientSeq }
            });
        await TcpResponse(server, request, new ReconnectResult(new ReconnectReplayResult
        {
            Type = ReconnectResultType.Replay,
            Actions = actions,
            Missing = new(),
        }), token);
        await TcpPush(server, 3, original.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = original.ClientSeq });
        await TcpPush(server, 4, new StateAction(new TcpDataEofAction { Type = ActionType.TcpDataEof, FinalOffset = 2 }), token);
        await reconnect.WaitAsync(token);
        Assert.Equal(new byte[] { 7, 8 }, await read.WaitAsync(token));
        if (!acknowledged)
        {
            var resent = await TcpDispatch(server, token);
            Assert.Equal(original.ClientSeq, resent.ClientSeq);
            Assert.Equal(original.Action.Value, resent.Action.Value);
        }
        var credit = await TcpDispatch(server, token);
        Assert.IsType<TcpDataConsumedAction>(credit.Action.Value);
        Assert.True(credit.ClientSeq > original.ClientSeq);
        Assert.Null(await connection.ReadAsync(token));
        await CloseTcp(connection, server, token);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TcpAdapterReconnectSnapshotOrMissingFailsClosed(bool snapshot)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (oldSide, oldServer) = MemTransport.CreatePair();
        await using var oldClient = AhpClient.Connect(oldSide);
        var connection = await OpenTcp(oldClient, oldServer, token);
        var read = connection.ReadAsync(token);
        await oldClient.ShutdownAsync(preserveTcpConnections: true, cancellationToken: token);
        var (freshSide, server) = MemTransport.CreatePair();
        await using var fresh = AhpClient.Connect(freshSide);
        var reconnect = fresh.ReconnectTcpConnectionsAsync(new ReconnectParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ClientId = "owner",
            Subscriptions = new(),
            LastSeenServerSeq = 0,
        }, new[] { connection }, token);
        var request = await TcpRequest(server, "reconnect", token);
        var result = snapshot
            ? new ReconnectResult(new ReconnectSnapshotResult { Type = ReconnectResultType.Snapshot, Snapshots = new() })
            : new ReconnectResult(new ReconnectReplayResult { Type = ReconnectResultType.Replay, Actions = new(), Missing = new() { connection.Resource } });
        await TcpResponse(server, request, result, token);
        await TcpUnsubscribe(server, connection.Resource, token);
        await reconnect.WaitAsync(token);
        await Assert.ThrowsAsync<InvalidOperationException>(() => read);
        Assert.Equal(0, fresh.EventListenerCount);
        await connection.DisposeAsync();
        var open = fresh.OpenTcpConnectionAsync("ahp-session:/s1", TcpCreation(), token);
        await TcpResponse(server, await TcpRequest(server, "subscribe", token),
            new SubscribeResult { Snapshot = TcpSnapshot("ahp-tcp:/replacement") }, token);
        var replacement = await open;
        await replacement.DisposeAsync();
        await TcpUnsubscribe(server, replacement.Resource, token);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TcpClientDefaultShutdownDisposesEvenAfterPreservedTransportShutdown(bool preserved)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        var connection = await OpenTcp(client, server, token);
        var read = connection.ReadAsync(token);
        var write = connection.WriteAsync(new byte[6], token);
        _ = await TcpDispatch(server, token);
        _ = await TcpDispatch(server, token);
        var drain = connection.DrainAsync(token);
        if (preserved)
        {
            await client.ShutdownAsync(preserveTcpConnections: true, cancellationToken: token);
            Assert.False(read.IsCompleted);
            Assert.False(write.IsCompleted);
            Assert.False(drain.IsCompleted);
        }
        var shutdown = client.ShutdownAsync(token);
        if (!preserved) await TcpUnsubscribe(server, connection.Resource, token);
        await shutdown.WaitAsync(token);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => read);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => write);
        await Assert.ThrowsAsync<ObjectDisposedException>(() => drain);
        Assert.Equal(0, client.EventListenerCount);
    }

    // ── Request round-trip ────────────────────────────────────────────────

    [Fact]
    public async Task TcpAdapterLargeEncodingAndFinalClosePreserveCompletedDrainAndBufferedReads()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var token = timeout.Token;
        var (side, server) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(side);
        var bytes = new byte[4 * 1024 * 1024];
        bytes[0] = 1;
        bytes[bytes.Length - 1] = 255;
        var connection = await OpenTcp(client, server, token, maximumChunkSize: bytes.Length);
        await connection.WriteAsync(bytes, token);
        var sent = await TcpDispatch(server, token);
        var input = Assert.IsType<TcpInputAction>(sent.Action.Value);
        Assert.Equal(0, input.Offset);
        Assert.Equal(bytes, Convert.FromBase64String(input.Data));
        var drain = connection.DrainAsync(token);
        Assert.False(drain.IsCompleted);
        await TcpPush(server, 1, sent.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = sent.ClientSeq });
        await TcpPush(server, 2, new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = bytes.Length }), token);
        await TcpPush(server, 3, new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "Bwg=" }), token);
        await TcpPush(server, 4, new StateAction(new TcpHostCloseAction { Type = ActionType.TcpHostClose }), token);
        var close = await TcpDispatch(server, token);
        Assert.IsType<TcpClientCloseAction>(close.Action.Value);
        Assert.Equal(1, client.EventListenerCount);
        await TcpPush(server, 5, close.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = close.ClientSeq });
        await drain.WaitAsync(token);
        await connection.DrainAsync(token);
        Assert.Equal(new byte[] { 7, 8 }, await connection.ReadAsync(token));
        var credit = await TcpDispatch(server, token);
        Assert.IsType<TcpDataConsumedAction>(credit.Action.Value);
        await TcpPush(server, 6, credit.Action, token, new ActionOrigin { ClientId = "owner", ClientSeq = credit.ClientSeq });
        await TcpUnsubscribe(server, connection.Resource, token);
        Assert.Null(await connection.ReadAsync(token));
        await connection.DisposeAsync();
    }

    [Theory]
    [InlineData("{", false)]
    [InlineData("{", true)]
    [InlineData("""{"jsonrpc":"2.0","id":1}""", false)]
    [InlineData("""{"jsonrpc":"2.0","method":"action"}""", false)]
    [InlineData("""{"jsonrpc":"2.0","method":"action","params":null}""", false)]
    [InlineData("""{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/child","serverSeq":2,"action":{"type":"tcp/dataEof","finalOffset":0.5}}}""", false)]
    [InlineData("""{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/child","serverSeq":2,"action":{"type":"tcp/inputConsumed","consumedBytes":0.5}}}""", false)]
    [InlineData("""{"jsonrpc":"2.0","method":"root/sessionAdded","params":[]}""", false)]
    [InlineData("""{"jsonrpc":"2.0","method":"root/sessionAdded"}""", false)]
    public async Task StrictEventsFailOnMalformedFramesAndNotificationPayloads(string wire, bool binary)
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var client = AhpClient.Connect(clientSide);
        using var strict = client.CreateEventStream(failOnOverflow: true);
        using var ordinary = client.CreateEventStream();
        using var barrier = client.AttachSubscription("ahp-session:/barrier");
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", 1, "prefix"), cts.Token);
        await serverSide.SendAsync(binary
            ? TransportMessage.FromBinary(System.Text.Encoding.UTF8.GetBytes(wire))
            : TransportMessage.FromText(wire), cts.Token);
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", 2, "later"), cts.Token);
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/barrier", 99, "barrier"), cts.Token);
        _ = await barrier.Events.ReadAsync(cts.Token);
        Assert.Equal(1, client.EventListenerCount);
        var prefix = await strict.Events.ReadAsync(cts.Token);
        Assert.Equal(1, Assert.IsType<SubscriptionEventAction>(prefix.Event).Envelope.ServerSeq);
        var error = await Assert.ThrowsAsync<AhpTransportException>(async () =>
        {
            await foreach (var item in strict.Events.ReadAllAsync(cts.Token))
                Assert.Fail($"unexpected event after decode loss: {item.Channel}");
        });
        Assert.Equal("protocol", error.Kind);
        Assert.False(strict.Events.TryRead(out _), "a decode-failed receiver must never resume");
        foreach (long expected in new[] { 1L, 2L, 99L })
        {
            var item = await ordinary.Events.ReadAsync(cts.Token);
            Assert.Equal(expected, Assert.IsType<SubscriptionEventAction>(item.Event).Envelope.ServerSeq);
        }
    }

    [Fact]
    public async Task StrictEventsAllowUnknownNotificationsAndActions()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var client = AhpClient.Connect(clientSide);
        using var events = client.CreateEventStream(failOnOverflow: true);
        await serverSide.SendAsync(TransportMessage.FromText("""{"jsonrpc":"2.0","method":"future/notification"}"""), cts.Token);
        await serverSide.SendAsync(TransportMessage.FromText(
            """{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-tcp:/child","serverSeq":1,"action":{"type":"tcp/future"}}}"""), cts.Token);
        var item = await events.Events.ReadAsync(cts.Token);
        var envelope = Assert.IsType<SubscriptionEventAction>(item.Event).Envelope;
        Assert.Equal(1, envelope.ServerSeq);
        Assert.Equal("ahp-tcp:/child", envelope.Channel);
    }

    [Fact]
    public async Task StrictDecodeFailureWakesBlockedReaderAndUnregisters()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var client = AhpClient.Connect(clientSide);
        using var strict = client.CreateEventStream(failOnOverflow: true);
        using var ordinary = client.CreateEventStream();
        var pending = strict.Events.WaitToReadAsync(cts.Token).AsTask();
        Assert.False(pending.IsCompleted);
        await serverSide.SendAsync(TransportMessage.FromText("{"), cts.Token);
        var error = await Assert.ThrowsAsync<AhpTransportException>(async () => await pending);
        Assert.Equal("protocol", error.Kind);
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", 1, "still connected"), cts.Token);
        var item = await ordinary.Events.ReadAsync(cts.Token);
        Assert.Equal(1, Assert.IsType<SubscriptionEventAction>(item.Event).Envelope.ServerSeq);
        Assert.Equal(1, client.EventListenerCount);
        Assert.False(strict.Events.TryRead(out _));
        await Assert.ThrowsAsync<AhpTransportException>(async () => await strict.Events.Completion);
    }

    [Fact]
    public async Task StrictEventsPreserveFirstTcpActionBeforeCreateReturns()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var client = AhpClient.Connect(clientSide);
        using var events = client.CreateEventStream(failOnOverflow: true);
        using var barrier = client.AttachSubscription("ahp-session:/barrier");
        var server = Task.Run(async () =>
        {
            var message = Ser.DecodeMessage(await serverSide.ReceiveAsync(cts.Token));
            var request = Assert.IsType<JsonRpcRequest>(message.Request);
            Assert.Equal("subscribe", request.Method);
            Assert.Equal("tcpConnection", request.Params!.Value.GetProperty("create").GetProperty("type").GetString());
            var parameters = Ser.Deserialize<SubscribeParams>(request.Params!.Value);
            Assert.Equal("ahp-session:/s1", parameters.Channel);
            Assert.Equal("localhost", parameters.Create!.Host);
            var direction = new FlowControlledByteDirectionState { WindowBytes = 8, MaximumChunkSize = 8 };
            var result = new SubscribeResult
            {
                Snapshot = new Snapshot
                {
                    Resource = "ahp-tcp:/created",
                    State = new SnapshotState
                    {
                        Tcp = new TcpConnectionState
                        {
                            Session = parameters.Channel,
                            Target = new TcpTarget { Host = "localhost", Port = 3000 },
                            Encoding = TcpDataEncoding.Base64,
                            Input = direction,
                            Output = direction,
                        }
                    },
                    FromSeq = 0,
                },
            };
            await serverSide.SendAsync(Ser.EncodeMessage(new JsonRpcMessage
            {
                SuccessResponse = new JsonRpcSuccessResponse { Id = request.Id, Result = Ser.SerializeToElement(result) },
            }), cts.Token);
            await serverSide.SendAsync(Ser.EncodeMessage(new JsonRpcMessage
            {
                Notification = new JsonRpcNotification
                {
                    Method = "action",
                    Params = Ser.SerializeToElement(new ActionEnvelope
                    {
                        Channel = "ahp-tcp:/created",
                        ServerSeq = 1,
                        Action = new StateAction(new TcpDataAction { Type = ActionType.TcpData, Offset = 0, Data = "AA==" }),
                    }),
                },
            }), cts.Token);
            await serverSide.SendAsync(BuildActionNotification("ahp-session:/barrier", 2, "barrier"), cts.Token);
        }, cts.Token);
        var result = await client.RequestAsync<SubscribeParams, SubscribeResult>("subscribe", new SubscribeParams
        {
            Channel = "ahp-session:/s1",
            Create = new TcpConnectionSubscription
            {
                Type = "tcpConnection",
                Host = "localhost",
                Port = 3000,
                Encoding = TcpDataEncoding.Base64,
                ReceiveWindowBytes = 8,
                MaximumChunkSize = 8,
            },
        }, cts.Token);
        await server;
        _ = await barrier.Events.ReadAsync(cts.Token);
        var snapshot = Assert.IsType<Snapshot>(result!.Snapshot);
        var first = await events.Events.ReadAsync(cts.Token);
        Assert.Equal(snapshot.Resource, first.Channel);
        var envelope = Assert.IsType<SubscriptionEventAction>(first.Event).Envelope;
        var initial = Assert.IsType<TcpConnectionState>(snapshot.State.Tcp);
        Assert.Equal(1, Reducers.TcpReducer(initial, envelope.Action).Output.ReceivedBytes);
    }

    [Fact]
    public async Task StrictEventsOverflowIsTerminalAndOrdinaryEventsStillDropOldest()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var client = AhpClient.Connect(clientSide, new ClientConfig { SubscriptionBufferCapacity = 2 });
        using var strict = client.CreateEventStream(failOnOverflow: true);
        using var ordinary = client.CreateEventStream();
        using var barrier = client.AttachSubscription("ahp-session:/barrier");
        for (long seq = 1; seq <= 3; seq++)
            await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", seq, $"e{seq}"), cts.Token);
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/barrier", 99, "barrier"), cts.Token);
        _ = await barrier.Events.ReadAsync(cts.Token);
        Assert.Equal(1, client.EventListenerCount);
        for (long expected = 1; expected <= 2; expected++)
        {
            var item = await strict.Events.ReadAsync(cts.Token);
            Assert.Equal(expected, Assert.IsType<SubscriptionEventAction>(item.Event).Envelope.ServerSeq);
        }
        var error = await Assert.ThrowsAsync<SubscriptionLagException>(async () =>
        {
            await foreach (var item in strict.Events.ReadAllAsync(cts.Token))
                Assert.Fail($"unexpected event after overflow: {item.Channel}");
        });
        Assert.Equal(2, error.Capacity);
        var closed = await Assert.ThrowsAsync<ChannelClosedException>(
            async () => await strict.Events.ReadAsync(cts.Token));
        Assert.IsType<SubscriptionLagException>(closed.InnerException);
        foreach (long expected in new[] { 3L, 99L })
        {
            var item = await ordinary.Events.ReadAsync(cts.Token);
            Assert.Equal(expected, Assert.IsType<SubscriptionEventAction>(item.Event).Envelope.ServerSeq);
        }
        using var healthy = client.CreateEventStream(failOnOverflow: true);
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/barrier", 100, "later"), cts.Token);
        _ = await barrier.Events.ReadAsync(cts.Token);
        Assert.False(strict.Events.TryRead(out _), "an overflowed receiver must never resume");
        await Assert.ThrowsAsync<SubscriptionLagException>(async () => await strict.Events.Completion);
        var later = await healthy.Events.ReadAsync(cts.Token);
        Assert.Equal(100, Assert.IsType<SubscriptionEventAction>(later.Event).Envelope.ServerSeq);
        healthy.Dispose();
        Assert.False(await healthy.Events.WaitToReadAsync(cts.Token));
    }

    [Fact]
    public async Task RequestRoundTrip_InitializeReturnsProtocolVersion()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Server goroutine: respond to one initialize request.
        var serverTask = Task.Run(() => FakeServer.HandleOneInitialize(serverSide, cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var result = await client.InitializeAsync("test-client", cancellationToken: cts.Token);

        Assert.Equal(ProtocolVersion.Current, result.ProtocolVersion);
        await serverTask;
    }

    // ── Subscription fan-out ──────────────────────────────────────────────

    [Fact]
    public async Task SubscriptionFanOut_ActionReachesPerUriAndTopLevel()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);
        var sub = client.AttachSubscription("ahp-session:/s1");
        var stream = client.CreateEventStream();

        // Push an `action` notification from the "server" side.
        var envelope = new ActionEnvelope
        {
            Channel = "ahp-session:/s1",
            ServerSeq = 1,
            Action = new StateAction(new SessionTitleChangedAction
            {
                Type = ActionType.SessionTitleChanged,
                Title = "Hello",
            }),
        };
        var notif = new JsonRpcMessage
        {
            Notification = new JsonRpcNotification
            {
                Method = "action",
                Params = Ser.SerializeToElement(envelope),
            }
        };
        await serverSide.SendAsync(Ser.EncodeMessage(notif), cts.Token);

        // Per-URI subscription receives the action.
        using var readSubCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
        var subEv = await sub.Events.ReadAsync(readSubCts.Token);
        var actionEv = Assert.IsType<SubscriptionEventAction>(subEv);
        Assert.Equal(1, actionEv.Envelope.ServerSeq);

        // Top-level stream also receives it.
        var clientEv = await stream.Events.ReadAsync(readSubCts.Token);
        Assert.Equal("ahp-session:/s1", clientEv.Channel);
        Assert.IsType<SubscriptionEventAction>(clientEv.Event);

        sub.Close();
        stream.Close();
    }

    // ── root/progress fan-out (upstream AHP 0.5.0 #263) ───────────────────

    [Fact]
    public async Task SubscriptionFanOut_RootProgressReachesPerUriAndTopLevel()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);
        var sub = client.AttachSubscription(ProtocolVersion.RootResourceUri);
        var stream = client.CreateEventStream();

        // Push a `root/progress` notification from the "server" side.
        var progress = new ProgressParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            ProgressToken = "tok-1",
            Progress = 18874368,
            Total = 41957498,
            Message = "Downloading provider SDK",
        };
        var notif = new JsonRpcMessage
        {
            Notification = new JsonRpcNotification
            {
                Method = "root/progress",
                Params = Ser.SerializeToElement(progress),
            }
        };
        await serverSide.SendAsync(Ser.EncodeMessage(notif), cts.Token);

        // Per-URI subscription receives the progress event...
        using var readSubCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
        var subEv = await sub.Events.ReadAsync(readSubCts.Token);
        var progressEv = Assert.IsType<SubscriptionEventProgress>(subEv);
        Assert.Equal("tok-1", progressEv.Params.ProgressToken);
        Assert.Equal(18874368, progressEv.Params.Progress);
        Assert.Equal(41957498, progressEv.Params.Total);
        Assert.Equal("Downloading provider SDK", progressEv.Params.Message);

        // ...and the top-level stream sees it on the root channel.
        var clientEv = await stream.Events.ReadAsync(readSubCts.Token);
        Assert.Equal(ProtocolVersion.RootResourceUri, clientEv.Channel);
        Assert.IsType<SubscriptionEventProgress>(clientEv.Event);

        sub.Close();
        stream.Close();
    }

    // ── Shutdown fails in-flight request ──────────────────────────────────

    [Fact]
    public async Task Shutdown_FailsInFlightRequest()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        // The server reads the request frame but never responds — the request
        // stays in-flight until shutdown.

        var client = AhpClient.Connect(clientSide);

        var requestTask = Task.Run(async () =>
        {
            try
            {
                await client.InitializeAsync("x", new[] { ProtocolVersion.Current });
                return (Exception?)null;
            }
            catch (Exception ex) { return ex; }
        });

        // Deterministically wait until the request frame is actually on the wire
        // (so the pending request is registered and truly in-flight) instead of
        // racing a fixed 50ms delay, which flaked under load.
        using (var recvCts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
            await serverSide.ReceiveAsync(recvCts.Token);
        await client.ShutdownAsync(TestContext.Current.CancellationToken);

        var err = await requestTask.WaitAsync(TimeSpan.FromSeconds(3), TestContext.Current.CancellationToken);
        Assert.NotNull(err);
        // Either AhpClientClosedException or AhpRpcException (synthetic shutdown error).
        Assert.True(
            err is AhpClientClosedException || err is AhpRpcException,
            $"Expected AhpClientClosedException or AhpRpcException, got {err?.GetType().Name}: {err?.Message}");
    }

    // ── In-flight request cancellation (parity with Swift) ─────────────────
    // Ported from clients/swift/.../AHPClientTests.swift:
    //   testRequestThrowsCancellationWhenTaskIsCancelled
    //   testRequestFastFailsWhenTaskAlreadyCancelled
    // Each drives the REAL AhpClient over the REAL MemTransport and reads the
    // real pending-request bookkeeping (client.PendingRequestCount) — no client
    // mocking. The "no id minted / no bytes pushed" claim is asserted against
    // the real next-id counter and a real drain of the server transport.

    // Cancelling the caller's token while a request is in flight surfaces an
    // OperationCanceledException AND removes the pending entry (1 -> 0), so a
    // late server response is harmlessly dropped.
    [Fact]
    public async Task Request_CancelDuringFlight_ThrowsAndClearsPending()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);

        // The request gets its own token so we can cancel just this call. The
        // client default-timeout is large enough not to fire first.
        using var reqCts = new CancellationTokenSource();

        var requestTask = Task.Run(async () =>
        {
            try
            {
                await client.InitializeAsync(
                    "test-client",
                    new[] { ProtocolVersion.Current },
                    cancellationToken: reqCts.Token);
                return (Exception?)null;
            }
            catch (Exception ex) { return ex; }
        });

        // The server reads the request frame (proving the wire bytes were
        // pushed) but never responds — the request stays genuinely in flight.
        using (var recvCts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
            await serverSide.ReceiveAsync(recvCts.Token);

        // Wait until the pending entry is registered (deterministic, not a sleep).
        await WaitUntilAsync(
            () => client.PendingRequestCount == 1,
            because: "the in-flight request must register exactly one pending entry");

        // Now cancel the caller's token.
        reqCts.Cancel();

        var err = await requestTask.WaitAsync(TimeSpan.FromSeconds(3), TestContext.Current.CancellationToken);
        Assert.NotNull(err);
        Assert.True(
            err is OperationCanceledException,
            $"expected OperationCanceledException, got {err?.GetType().Name}: {err?.Message}");

        // The cancellation cleaned up the pending entry.
        await WaitUntilAsync(
            () => client.PendingRequestCount == 0,
            because: "cancellation must remove the pending entry so a late response is dropped");
        Assert.Equal(0, client.PendingRequestCount);
    }

    // A token that is ALREADY cancelled before the request is issued fast-fails
    // with OperationCanceledException WITHOUT minting a request id or pushing
    // wire bytes — mirroring the Swift `Task.checkCancellation()` fast path.
    [Fact]
    public async Task Request_PreCancelledToken_FastFailsWithoutMintingIdOrSending()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);

        // Capture the next id BEFORE the cancelled request: it must be unchanged
        // afterwards (no id minted).
        var nextIdBefore = client.NextRequestId;

        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            async () => await client.InitializeAsync(
                "test-client",
                new[] { ProtocolVersion.Current },
                cancellationToken: cancelled.Token));

        // No request id was minted.
        Assert.Equal(nextIdBefore, client.NextRequestId);
        // No pending entry was registered.
        Assert.Equal(0, client.PendingRequestCount);
        // No wire bytes were pushed: the server side has nothing to read.
        using var drainCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            async () => await serverSide.ReceiveAsync(drainCts.Token));
    }

    // Sanity: the happy path still resolves after the fast-fail guard was added.
    [Fact]
    public async Task Request_HappyPath_StillResolves()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var serverTask = Task.Run(() => FakeServer.HandleOneInitialize(serverSide, cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var result = await client.InitializeAsync("test-client", cancellationToken: cts.Token);

        Assert.Equal(ProtocolVersion.Current, result.ProtocolVersion);
        // The resolved request left no pending entry behind.
        Assert.Equal(0, client.PendingRequestCount);
        await serverTask;
    }

    // ── Back-pressure: drop-oldest + laggard fast-forward + no replay ──────
    // Parity with clients/typescript/test/async-queue.test.ts
    //   'bounded buffer drops oldest and fast-forwards laggards'
    //   'reader created after publish does not replay history'
    // The .NET back-pressure is the production BoundedChannelFullMode.DropOldest
    // on each Subscription's event channel (Subscription.cs). This drives the
    // REAL AhpClient + REAL MemTransport with a capacity-2 subscription buffer:
    // we overflow a non-reading (laggard) subscription from the server side and
    // assert it observes the NEWEST items (oldest dropped, no unbounded buffer),
    // and that a subscription attached AFTER the events get no replay.
    [Fact]
    public async Task Subscription_BoundedBuffer_DropsOldest_FastForwards_NoReplay()
    {
        const int capacity = 2;
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(
            clientSide,
            new ClientConfig { SubscriptionBufferCapacity = capacity });

        // Laggard: attached but never read until the very end.
        var laggard = client.AttachSubscription("ahp-session:/s1");
        // Barrier on a DIFFERENT uri: read to confirm the read loop has drained
        // every earlier frame (frames are processed strictly in order).
        var barrier = client.AttachSubscription("ahp-session:/barrier");

        // Push 4 events to the laggard's uri, PAST its capacity of 2. With
        // DropOldest, the oldest two (seq 1, 2) are dropped; the laggard ends up
        // holding the newest two (seq 3, 4).
        for (long seq = 1; seq <= 4; seq++)
            await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", seq, $"e{seq}"), cts.Token);
        // Barrier frame last: once we read it, all 4 prior frames are fanned out.
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/barrier", 99, "barrier"), cts.Token);

        using (var readBarrierCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token))
        {
            var bev = Assert.IsType<SubscriptionEventAction>(await barrier.Events.ReadAsync(readBarrierCts.Token));
            Assert.Equal(99, bev.Envelope.ServerSeq);
        }

        // The laggard buffered at most `capacity` items (no unbounded growth)...
        Assert.Equal(capacity, laggard.Events.Count);

        // ...and they are the NEWEST items: seq 3 then 4 (1 and 2 were dropped).
        using (var readLagCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token))
        {
            var first = Assert.IsType<SubscriptionEventAction>(await laggard.Events.ReadAsync(readLagCts.Token));
            var second = Assert.IsType<SubscriptionEventAction>(await laggard.Events.ReadAsync(readLagCts.Token));
            Assert.Equal(3, first.Envelope.ServerSeq);
            Assert.Equal(4, second.Envelope.ServerSeq);
        }

        // A subscription attached AFTER the events were delivered gets NO replay
        // of the already-fanned-out history (mirrors the TS 'reader created after
        // publish does not replay history').
        var lateReader = client.AttachSubscription("ahp-session:/s1");
        using (var lateDrainCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(200)))
            await Assert.ThrowsAnyAsync<OperationCanceledException>(
                async () => await lateReader.Events.ReadAsync(lateDrainCts.Token));

        // A fresh event after attach DOES reach the late reader (it is live, just
        // without history) — proving the empty read above was "no replay", not a
        // dead subscription.
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", 5, "e5"), cts.Token);
        using (var liveCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token))
        {
            var live = Assert.IsType<SubscriptionEventAction>(await lateReader.Events.ReadAsync(liveCts.Token));
            Assert.Equal(5, live.Envelope.ServerSeq);
        }

        laggard.Close();
        barrier.Close();
        lateReader.Close();
    }

    // ── Done signalled on transport failure ───────────────────────────────

    [Fact]
    public async Task Done_SignalledOnTransportFailure()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();

        await using var client = AhpClient.Connect(clientSide);

        // Closing the server end propagates as a receive error to the client.
        await serverSide.CloseAsync(TestContext.Current.CancellationToken);

        // Client.Completion should fire within a reasonable time.
        await client.Completion.WaitAsync(TimeSpan.FromSeconds(3), TestContext.Current.CancellationToken);
        Assert.NotNull(client.Error);
    }

    // ── Idempotent shutdown ───────────────────────────────────────────────

    [Fact]
    public async Task ShutdownIsIdempotent()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        var client = AhpClient.Connect(clientSide);

        // Concurrent shutdowns must not throw.
        var tasks = new Task[4];
        for (int i = 0; i < 4; i++)
        {
            var cap = i;
            tasks[cap] = Task.Run(() => client.ShutdownAsync(TestContext.Current.CancellationToken), TestContext.Current.CancellationToken);
        }
        await Task.WhenAll(tasks);
    }

    // ── Parity batch-a (matrix group D) ────────────────────────────────────
    // Phase-1 parity tests targeting ClientTests.cs. Each exercises the real
    // AhpClient over the real MemTransport + real SystemTextJsonAhpSerializer —
    // no SUT mocking. The "server" end is a real MemTransport endpoint driven
    // by hand: we decode the client's frame with Ser.DecodeMessage and reply
    // with a JsonRpc success/error frame via Ser.EncodeMessage.

    /// <summary>
    /// Reads one request whose method is <paramref name="expectedMethod"/> and replies
    /// with a JSON-RPC success response carrying <paramref name="result"/> serialized.
    /// Returns the decoded request so the caller can assert on it.
    /// </summary>
    private static async Task<JsonRpcRequest> AnswerOneRequestAsync<TResult>(
        MemTransport serverSide, string expectedMethod, TResult result, CancellationToken ct)
    {
        var frame = await serverSide.ReceiveAsync(ct).ConfigureAwait(false);
        var msg = Ser.DecodeMessage(frame);
        Assert.NotNull(msg.Request);
        Assert.Equal(expectedMethod, msg.Request!.Method);

        var response = new JsonRpcMessage
        {
            SuccessResponse = new JsonRpcSuccessResponse
            {
                Id = msg.Request.Id,
                Result = Ser.SerializeToElement(result),
            }
        };
        await serverSide.SendAsync(Ser.EncodeMessage(response), ct).ConfigureAwait(false);
        return msg.Request;
    }

    /// <summary>Builds an `action` notification frame for <paramref name="channel"/>.</summary>
    private static TransportMessage BuildActionNotification(string channel, long serverSeq, string title)
    {
        var envelope = new ActionEnvelope
        {
            Channel = channel,
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
            }
        };
        return Ser.EncodeMessage(notif);
    }

    // D: initialize snapshot in result.
    [Fact]
    public async Task Initialize_SnapshotDeliveredInResult()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Server replies to `initialize` with a result carrying one snapshot.
        var initResult = new InitializeResult
        {
            ProtocolVersion = ProtocolVersion.Current,
            ServerSeq = 7,
            Snapshots = new System.Collections.Generic.List<Snapshot>
            {
                new Snapshot
                {
                    Resource = "ahp-session:/s1",
                    FromSeq = 7,
                    State = new SnapshotState
                    {
                        Root = new RootState { Agents = new System.Collections.Generic.List<AgentInfo>() },
                    },
                },
            },
        };
        var serverTask = Task.Run(
            () => AnswerOneRequestAsync(serverSide, "initialize", initResult, cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var result = await client.InitializeAsync(
            "test-client",
            initialSubscriptions: new[] { "ahp-session:/s1" },
            cancellationToken: cts.Token);

        Assert.Equal(ProtocolVersion.Current, result.ProtocolVersion);
        Assert.NotNull(result.Snapshots);
        var snapshot = Assert.Single(result.Snapshots);
        Assert.Equal("ahp-session:/s1", snapshot.Resource);
        Assert.Equal(7, snapshot.FromSeq);
        await serverTask;
    }

    [Fact]
    public async Task Initialize_RejectsUnofferedProtocolVersion()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var serverTask = Task.Run(
            () => AnswerOneRequestAsync(
                serverSide,
                "initialize",
                new InitializeResult
                {
                    ProtocolVersion = "999.0.0",
                    Snapshots = new System.Collections.Generic.List<Snapshot>(),
                },
                cts.Token),
            cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var ex = await Assert.ThrowsAsync<AhpTransportException>(
            () => client.InitializeAsync(
                "test-client",
                new[] { ProtocolVersion.Current },
                cancellationToken: cts.Token));

        Assert.Equal("protocol", ex.Kind);
        Assert.Contains("999.0.0", ex.Message, StringComparison.Ordinal);
        await serverTask;
    }

    // D: subscribe round-trip + snapshot.
    [Fact]
    public async Task Subscribe_RoundTrip_DeliversSnapshot()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var subResult = new SubscribeResult
        {
            Snapshot = new Snapshot
            {
                Resource = "ahp-session:/s1",
                FromSeq = 3,
                State = new SnapshotState
                {
                    Root = new RootState { Agents = new System.Collections.Generic.List<AgentInfo>() },
                },
            },
        };
        var serverTask = Task.Run(
            () => AnswerOneRequestAsync(serverSide, "subscribe", subResult, cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var (result, sub) = await client.SubscribeAsync("ahp-session:/s1", cancellationToken: cts.Token);

        // The SubscribeResult carries the snapshot...
        Assert.NotNull(result.Snapshot);
        Assert.Equal("ahp-session:/s1", result.Snapshot!.Resource);
        Assert.Equal(3, result.Snapshot.FromSeq);
        // ...and the returned Subscription is attached to the same URI.
        Assert.Equal("ahp-session:/s1", sub.Uri);

        sub.Close();
        await serverTask;
    }

    // D: subscribe threads the advisory delivery preference onto the wire params
    // (upstream microsoft/agent-host-protocol#293).
    [Fact]
    public async Task Subscribe_PassesDeliveryOptions_ToWire()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var serverTask = Task.Run(
            () => AnswerOneRequestAsync(serverSide, "subscribe", new SubscribeResult(), cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var (_, sub) = await client.SubscribeAsync(
            "ahp-session:/s1",
            new SubscriptionDeliveryOptions { MaxLatencyMs = 250 },
            cts.Token);

        var request = await serverTask;
        Assert.NotNull(request.Params);
        var p = request.Params!.Value;
        Assert.Equal("ahp-session:/s1", p.GetProperty("channel").GetString());
        // The advisory delivery preference rides on the wire, nested exactly as sent.
        Assert.Equal(250, p.GetProperty("delivery").GetProperty("maxLatencyMs").GetInt64());

        sub.Close();
    }

    // D: subscribe without delivery options omits the `delivery` key entirely.
    [Fact]
    public async Task Subscribe_NoDeliveryOptions_OmitsKeyOnWire()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var serverTask = Task.Run(
            () => AnswerOneRequestAsync(serverSide, "subscribe", new SubscribeResult(), cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var (_, sub) = await client.SubscribeAsync("ahp-session:/s1", cancellationToken: cts.Token);

        var request = await serverTask;
        Assert.NotNull(request.Params);
        Assert.False(
            request.Params!.Value.TryGetProperty("delivery", out _),
            "an absent delivery preference must not serialize a `delivery` key");

        sub.Close();
    }

    // D: protocol-level ping targets the root channel and resolves on a null result
    // (upstream microsoft/agent-host-protocol#344).
    [Fact]
    public async Task Ping_TargetsRootChannel_AndResolvesOnNullResult()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // The server answers a single `ping` with a JSON `null` result — the
        // response itself is the liveness signal, so the payload is empty.
        var serverTask = Task.Run(
            () => AnswerOneRequestAsync<object?>(serverSide, "ping", null, cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        await client.PingAsync(cts.Token);

        var request = await serverTask;
        Assert.NotNull(request.Params);
        // No PingParams wrapper: the root channel is hardcoded on the wire.
        Assert.Equal(ProtocolVersion.RootResourceUri, request.Params!.Value.GetProperty("channel").GetString());
    }

    // D: attachSubscription (no round-trip subscribe request is sent).
    [Fact]
    public async Task AttachSubscription_DeliversWithoutRoundTrip()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);
        var sub = client.AttachSubscription("ahp-session:/s1");

        // Push an `action` notification from the server; the attached sub receives it.
        await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", 1, "Hi"), cts.Token);

        using var readCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
        var ev = await sub.Events.ReadAsync(readCts.Token);
        var actionEv = Assert.IsType<SubscriptionEventAction>(ev);
        Assert.Equal(1, actionEv.Envelope.ServerSeq);

        // No subscribe request must have been sent: the server side has no frame waiting.
        // Drain attempt with a short timeout — a frame here would mean a stray request.
        using var drainCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(150));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            async () => await serverSide.ReceiveAsync(drainCts.Token));

        sub.Close();
    }

    // D: multi-sub same uri — both subscriptions on one URI receive the event.
    [Fact]
    public async Task MultipleSubscriptions_SameUri_EachReceiveEvent()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);
        var sub1 = client.AttachSubscription("ahp-session:/s1");
        var sub2 = client.AttachSubscription("ahp-session:/s1");

        await serverSide.SendAsync(BuildActionNotification("ahp-session:/s1", 9, "Both"), cts.Token);

        using var readCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
        var ev1 = Assert.IsType<SubscriptionEventAction>(await sub1.Events.ReadAsync(readCts.Token));
        var ev2 = Assert.IsType<SubscriptionEventAction>(await sub2.Events.ReadAsync(readCts.Token));
        Assert.Equal(9, ev1.Envelope.ServerSeq);
        Assert.Equal(9, ev2.Envelope.ServerSeq);

        sub1.Close();
        sub2.Close();
    }

    // D: unsubscribe finishes stream — the subscription's channel completes.
    [Fact]
    public async Task Unsubscribe_FinishesStream()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Drain the `unsubscribe` notification the client sends so the writer never blocks.
        var serverTask = Task.Run(async () =>
        {
            var frame = await serverSide.ReceiveAsync(cts.Token).ConfigureAwait(false);
            var msg = Ser.DecodeMessage(frame);
            Assert.NotNull(msg.Notification);
            Assert.Equal("unsubscribe", msg.Notification!.Method);
        }, cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var sub = client.AttachSubscription("ahp-session:/s1");

        await client.UnsubscribeAsync("ahp-session:/s1", cts.Token);

        // The subscription channel is completed: ReadAllAsync finishes with no items,
        // and a direct ReadAsync throws ChannelClosedException.
        var received = 0;
        await foreach (var _ in sub.Events.ReadAllAsync(cts.Token))
            received++;
        Assert.Equal(0, received);
        await Assert.ThrowsAsync<System.Threading.Channels.ChannelClosedException>(
            async () => await sub.Events.ReadAsync(cts.Token));

        await serverTask;
    }

    // D: dispatch clientSeq — DispatchAsync emits a dispatchAction notif whose
    // clientSeq matches the returned DispatchHandle.ClientSeq.
    [Fact]
    public async Task Dispatch_EmitsActionNotification_WithClientSeq()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);

        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "Dispatched",
        });
        var handle = await client.DispatchAsync("ahp-session:/s1", action, cancellationToken: cts.Token);

        // The server reads the emitted frame and decodes the dispatchAction notification.
        var frame = await serverSide.ReceiveAsync(cts.Token);
        var msg = Ser.DecodeMessage(frame);
        Assert.NotNull(msg.Notification);
        Assert.Equal("dispatchAction", msg.Notification!.Method);
        Assert.NotNull(msg.Notification.Params);
        var dispatched = Ser.Deserialize<DispatchActionParams>(msg.Notification.Params.Value.GetRawText());
        Assert.Equal("ahp-session:/s1", dispatched.Channel);
        Assert.Equal(handle.ClientSeq, dispatched.ClientSeq);
    }

    // D: json-rpc error -> exception. A JsonRpcErrorResponse maps to AhpRpcException
    // carrying the same code.
    [Fact]
    public async Task RequestError_MapsToAhpRpcException()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var serverTask = Task.Run(async () =>
        {
            var frame = await serverSide.ReceiveAsync(cts.Token).ConfigureAwait(false);
            var msg = Ser.DecodeMessage(frame);
            Assert.NotNull(msg.Request);
            var response = new JsonRpcMessage
            {
                ErrorResponse = new JsonRpcErrorResponse
                {
                    Id = msg.Request!.Id,
                    Error = new JsonRpcErrorObject { Code = -32601, Message = "method not found" },
                }
            };
            await serverSide.SendAsync(Ser.EncodeMessage(response), cts.Token).ConfigureAwait(false);
        }, cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var ex = await Assert.ThrowsAsync<AhpRpcException>(
            async () => await client.InitializeAsync("x", cancellationToken: cts.Token));
        Assert.Equal(-32601, ex.Code);

        await serverTask;
    }

    // D: request timeout — a short DefaultRequestTimeout with no server reply throws.
    [Fact]
    public async Task Request_Timeout_ThrowsRpcTimeout()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        // No server reply — the request must time out via the configured default timeout.
        var client = AhpClient.Connect(
            clientSide,
            new ClientConfig { DefaultRequestTimeout = TimeSpan.FromMilliseconds(50) });

        // RequestAsync's timeout path cancels the linked token, surfacing an
        // OperationCanceledException (TaskCanceledException derives from it).
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            async () => await client.InitializeAsync("x", cancellationToken: TestContext.Current.CancellationToken));

        await client.ShutdownAsync(TestContext.Current.CancellationToken);
    }

    // D: inbound binary frame — a binary transport frame is decoded (not dropped)
    // and fanned out to subscribers.
    [Fact]
    public async Task InboundBinaryFrame_Decoded()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);
        var sub = client.AttachSubscription("ahp-session:/s1");

        // Build the same `action` notification as UTF-8 bytes and send it as a BINARY frame.
        var textFrame = BuildActionNotification("ahp-session:/s1", 42, "Binary");
        Assert.NotNull(textFrame.Text);
        var bytes = System.Text.Encoding.UTF8.GetBytes(textFrame.Text!);
        await serverSide.SendAsync(TransportMessage.FromBinary(bytes), cts.Token);

        using var readCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
        var ev = Assert.IsType<SubscriptionEventAction>(await sub.Events.ReadAsync(readCts.Token));
        Assert.Equal(42, ev.Envelope.ServerSeq);

        sub.Close();
    }

    // D: post-shutdown throws — operations after ShutdownAsync throw AhpClientClosedException.
    [Fact]
    public async Task PostShutdown_Operations_ThrowClientClosed()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        var client = AhpClient.Connect(clientSide);

        await client.ShutdownAsync(TestContext.Current.CancellationToken);

        await Assert.ThrowsAsync<AhpClientClosedException>(
            async () => await client.RequestAsync<object?, InitializeResult>("initialize", null, TestContext.Current.CancellationToken));
        await Assert.ThrowsAsync<AhpClientClosedException>(
            async () => await client.InitializeAsync("x", cancellationToken: TestContext.Current.CancellationToken));
        await Assert.ThrowsAsync<AhpClientClosedException>(
            async () => await client.NotifyAsync<object?>("ping", null, TestContext.Current.CancellationToken));
    }

    // D: server req -> MethodNotFound.
    // With no ServerRequestHandler installed, an inbound server-initiated request
    // is answered with a JSON-RPC MethodNotFound (-32601) error, not dropped.
    [Fact]
    public async Task ServerRequest_NoHandler_RepliesMethodNotFound()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);
        // (no SetServerRequestHandler call)

        // Server sends a request (note: it HAS an id -> it's a request, not a notif).
        var req = new JsonRpcMessage
        {
            Request = new JsonRpcRequest { Id = 99, Method = "permission/request", Params = null },
        };
        await serverSide.SendAsync(Ser.EncodeMessage(req), cts.Token);

        // The client replies with an error frame carrying the same id + -32601.
        var replyFrame = await serverSide.ReceiveAsync(cts.Token);
        var reply = Ser.DecodeMessage(replyFrame);
        Assert.NotNull(reply.ErrorResponse);
        Assert.Equal(99UL, reply.ErrorResponse!.Id);
        Assert.Equal(JsonRpcErrorCodes.MethodNotFound, reply.ErrorResponse.Error.Code);
    }

    // D: server req -> handler result.
    // With a ServerRequestHandler installed, the client replies with the handler's
    // result for an inbound server-initiated request.
    [Fact]
    public async Task ServerRequest_Handler_RepliesResult()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await using var client = AhpClient.Connect(clientSide);
        client.SetServerRequestHandler((method, @params) =>
            Task.FromResult<object?>(new { ok = true, echoed = method }));

        var req = new JsonRpcMessage
        {
            Request = new JsonRpcRequest { Id = 7, Method = "permission/request", Params = null },
        };
        await serverSide.SendAsync(Ser.EncodeMessage(req), cts.Token);

        var replyFrame = await serverSide.ReceiveAsync(cts.Token);
        var reply = Ser.DecodeMessage(replyFrame);
        Assert.NotNull(reply.SuccessResponse);
        Assert.Equal(7UL, reply.SuccessResponse!.Id);
        // The handler's result object is serialized into the reply.
        var resultJson = reply.SuccessResponse.Result.GetRawText();
        Assert.Contains("\"ok\":true", resultJson);
        Assert.Contains("permission/request", resultJson);
    }

    // ── Parity batch P2-A (matrix group D): connection-state + keep-alive ───
    // Ported from the Swift AHPClientTests (clients/swift/.../AHPClientTests.swift):
    //   testKeepAlivePingsCapableTransport     -> KeepAlive_PingsWhenCapable
    //   testKeepAliveDisabledDoesNotPing       -> KeepAlive_DisabledByConfig
    //   testKeepAliveFailureDisconnectsClient  -> KeepAlive_DisconnectsOnPingFailure
    //   testShutdownTerminatesAllStreams (state assertions)
    //                                          -> ConnectionState_TransitionsThroughStateChanges
    //
    // Each drives the REAL AhpClient. The ping tests use PingCountingTransport — a
    // genuine ITransport + IKeepAliveTransport implementation that counts real
    // SendPingAsync calls (the .NET equivalent of Swift's `PingCountingTransport`
    // actor), NOT a mock of the client or a mocking-framework stub.

    /// <summary>
    /// Polls <paramref name="condition"/> until it returns <see langword="true"/> or
    /// <paramref name="timeout"/> elapses. Mirrors the Swift test helper
    /// <c>waitUntil</c>: a deterministic alternative to a fixed sleep. Throws on
    /// timeout so a never-satisfied condition fails the test loudly.
    /// </summary>
    private static async Task WaitUntilAsync(
        Func<bool> condition, TimeSpan? timeout = null, string? because = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(2));
        while (DateTime.UtcNow < deadline)
        {
            if (condition()) return;
            await Task.Delay(5).ConfigureAwait(false);
        }
        if (condition()) return;
        throw new Xunit.Sdk.XunitException(
            $"WaitUntilAsync timed out after {(timeout ?? TimeSpan.FromSeconds(2)).TotalMilliseconds}ms"
            + (because is null ? "" : $": {because}"));
    }

    // D: connectionState/stateChanges — the client is Connected from construction
    // and transitions to Disconnected on shutdown, fanning the transition out to
    // every attached StateChangeStream before completing it. Mirrors the Swift
    // `testShutdownTerminatesAllStreams` state assertions (`lastState == .disconnected`).
    [Fact]
    public async Task ConnectionState_TransitionsThroughStateChanges()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        var client = AhpClient.Connect(clientSide);

        // The read/write loops start at construction, so the client is Connected.
        Assert.Equal(ConnectionState.Connected, client.ConnectionState);

        // Attach a state-change stream BEFORE shutdown so it observes the transition.
        var states = client.CreateStateChangeStream();

        await client.ShutdownAsync(TestContext.Current.CancellationToken);

        // The synchronous accessor reflects the terminal state.
        Assert.Equal(ConnectionState.Disconnected, client.ConnectionState);

        // Draining the stream yields the Connected->Disconnected transition: the
        // stream delivers the final Disconnected then completes, so the last item is
        // Disconnected. (Connected was the pre-attachment value, available only via
        // the synchronous accessor — the stream carries future transitions only.)
        ConnectionState? lastState = null;
        var transitions = 0;
        using var drainCts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await foreach (var state in states.States.ReadAllAsync(drainCts.Token))
        {
            lastState = state;
            transitions++;
        }
        Assert.Equal(ConnectionState.Disconnected, lastState);
        Assert.Equal(1, transitions);
    }

    // D: keep-alive pings — with a ping policy and a ping-capable transport, the
    // client sends periodic pings. Mirrors Swift `testKeepAlivePingsCapableTransport`.
    [Fact]
    public async Task KeepAlive_PingsWhenCapable()
    {
        var transport = new PingCountingTransport();
        var timeProvider = new FakeTimeProvider();
        var client = AhpClient.Connect(
            transport,
            new ClientConfig
            {
                TimeProvider = timeProvider,
                KeepAlive = KeepAlivePolicy.Enabled(
                    interval: TimeSpan.FromSeconds(10),
                    timeout: TimeSpan.FromSeconds(10)),
            });

        timeProvider.Advance(TimeSpan.FromSeconds(10));
        Assert.Equal(1, await transport.ReadPingCountAsync(TestContext.Current.CancellationToken));

        timeProvider.Advance(TimeSpan.FromSeconds(10));
        Assert.Equal(2, await transport.ReadPingCountAsync(TestContext.Current.CancellationToken));

        Assert.Equal(2, transport.PingCount);

        await client.ShutdownAsync(TestContext.Current.CancellationToken);
    }

    // D: keep-alive disabled — with KeepAlivePolicy.Disabled the client never pings,
    // even on a ping-capable transport. Mirrors Swift `testKeepAliveDisabledDoesNotPing`.
    [Fact]
    public async Task KeepAlive_DisabledByConfig()
    {
        var transport = new PingCountingTransport();
        var timeProvider = new FakeTimeProvider();
        var client = AhpClient.Connect(
            transport,
            new ClientConfig
            {
                TimeProvider = timeProvider,
                KeepAlive = KeepAlivePolicy.Disabled,
            });

        timeProvider.Advance(TimeSpan.FromDays(1));

        Assert.Equal(0, transport.PingCount);

        await client.ShutdownAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public void KeepAlive_RejectsNonPositiveIntervalAndTimeout()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            KeepAlivePolicy.Ping(TimeSpan.Zero, TimeSpan.FromSeconds(1)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            KeepAlivePolicy.Ping(TimeSpan.FromSeconds(-1), TimeSpan.FromSeconds(1)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            KeepAlivePolicy.Ping(TimeSpan.FromSeconds(1), TimeSpan.Zero));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            KeepAlivePolicy.Ping(TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(-1)));
    }

    // D: keep-alive ping failure — a failed ping is treated as a transport failure:
    // the client tears down (ConnectionState -> Disconnected) and the transport is
    // closed exactly once. Mirrors Swift `testKeepAliveFailureDisconnectsClient`.
    [Fact]
    public async Task KeepAlive_DisconnectsOnPingFailure()
    {
        var transport = new PingCountingTransport(failPing: true);
        var timeProvider = new FakeTimeProvider();
        var client = AhpClient.Connect(
            transport,
            new ClientConfig
            {
                TimeProvider = timeProvider,
                KeepAlive = KeepAlivePolicy.Enabled(
                    interval: TimeSpan.FromSeconds(10),
                    timeout: TimeSpan.FromSeconds(10)),
            });

        timeProvider.Advance(TimeSpan.FromSeconds(10));
        await transport.Closed.WaitAsync(TestContext.Current.CancellationToken);

        Assert.Equal(ConnectionState.Disconnected, client.ConnectionState);
        // The teardown closes the transport exactly once.
        Assert.Equal(1, transport.CloseCount);
        Assert.NotNull(client.Error);
    }
}

// ── Ping-counting transport (real ITransport + IKeepAliveTransport) ─────────────

/// <summary>
/// A real in-memory transport that counts <see cref="SendPingAsync"/> calls and can
/// optionally fail every ping. Port of the Swift test double
/// <c>PingCountingTransport</c> (an <c>actor</c> conforming to
/// <c>AHPKeepAliveTransport</c>). This is a genuine <see cref="IKeepAliveTransport"/>
/// implementation exercised by the real <see cref="AhpClient"/> — NOT a mock of the
/// client or a mocking-framework stub.
/// <para>
/// <see cref="ReceiveAsync"/> parks until <see cref="CloseAsync"/> is called, then
/// reports a clean close by throwing <see cref="TransportClosedException"/> (the .NET
/// equivalent of Swift's <c>recv()</c> returning <c>nil</c>). <see cref="SendAsync"/>
/// is a no-op while open; the keep-alive tests never push wire frames.
/// </para>
/// </summary>
internal sealed class PingCountingTransport : IKeepAliveTransport
{
    private readonly bool _failPing;
    private readonly TaskCompletionSource _closedTcs =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly Channel<int> _pingCounts = Channel.CreateUnbounded<int>();
    private int _pings;
    private int _closes;
    private int _closed;

    public PingCountingTransport(bool failPing = false) => _failPing = failPing;

    /// <summary>The number of <see cref="SendPingAsync"/> calls observed so far.</summary>
    public int PingCount => Volatile.Read(ref _pings);

    /// <summary>The number of times <see cref="CloseAsync"/> transitioned to closed.</summary>
    public int CloseCount => Volatile.Read(ref _closes);

    public Task Closed => _closedTcs.Task;

    public ValueTask<int> ReadPingCountAsync(CancellationToken cancellationToken) =>
        _pingCounts.Reader.ReadAsync(cancellationToken);

    public ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default)
    {
        if (Volatile.Read(ref _closed) == 1) throw new AhpTransportException("closed");
        return ValueTask.CompletedTask;
    }

    public async ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default)
    {
        if (Volatile.Read(ref _closed) == 1) throw new TransportClosedException();
        // Park until the transport is closed, then signal a clean close. The keep-alive
        // tests drive the client purely through the ping loop, so no inbound frames arrive.
        await _closedTcs.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
        throw new TransportClosedException();
    }

    public ValueTask CloseAsync(CancellationToken cancellationToken = default)
    {
        if (Interlocked.CompareExchange(ref _closed, 1, 0) == 0)
        {
            Interlocked.Increment(ref _closes);
            _closedTcs.TrySetResult();
        }
        return ValueTask.CompletedTask;
    }

    public ValueTask SendPingAsync(TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        if (Volatile.Read(ref _closed) == 1) throw new AhpTransportException("closed");
        var count = Interlocked.Increment(ref _pings);
        _pingCounts.Writer.TryWrite(count);
        if (_failPing) throw new AhpTransportException("io", "ping failed");
        return ValueTask.CompletedTask;
    }

    public ValueTask DisposeAsync() => CloseAsync();
}
