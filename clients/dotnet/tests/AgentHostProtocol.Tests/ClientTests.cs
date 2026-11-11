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
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

// ── In-memory transport pair ──────────────────────────────────────────────────

/// <summary>
/// Paired in-memory transport. The two ends share linked channels so frames
/// flow from one's outbox directly into the other's inbox, exactly as the Go
/// <c>memTransport</c> helper works.
/// </summary>
internal sealed class MemTransport : ITransport
{
    private readonly Channel<TransportMessage> _inbox;
    private readonly Channel<TransportMessage> _outbox;
    private readonly CancellationTokenSource _closeCts;

    private MemTransport(
        Channel<TransportMessage> inbox,
        Channel<TransportMessage> outbox,
        CancellationTokenSource closeCts)
    {
        _inbox = inbox;
        _outbox = outbox;
        _closeCts = closeCts;
    }

    /// <summary>Creates a linked pair. Frames sent to A appear on B's inbox and vice versa.</summary>
    public static (MemTransport A, MemTransport B) CreatePair()
    {
        var a2b = Channel.CreateBounded<TransportMessage>(new BoundedChannelOptions(16) { FullMode = BoundedChannelFullMode.Wait });
        var b2a = Channel.CreateBounded<TransportMessage>(new BoundedChannelOptions(16) { FullMode = BoundedChannelFullMode.Wait });
        var cts = new CancellationTokenSource(); // shared — closing either side closes both.
        return (new MemTransport(b2a, a2b, cts), new MemTransport(a2b, b2a, cts));
    }

    public async ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _closeCts.Token);
        try { await _outbox.Writer.WriteAsync(message, linked.Token).ConfigureAwait(false); }
        catch (OperationCanceledException) when (_closeCts.IsCancellationRequested)
        { throw new AhpTransportException("closed"); }
    }

    public async ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _closeCts.Token);
        try { return await _inbox.Reader.ReadAsync(linked.Token).ConfigureAwait(false); }
        catch (OperationCanceledException) when (_closeCts.IsCancellationRequested)
        { throw new AhpTransportException("closed"); }
    }

    public ValueTask CloseAsync(CancellationToken cancellationToken = default)
    {
        _closeCts.Cancel();
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

        var offered = Ser.Deserialize<InitializeParams>(msg.Request.Params!.Value.GetRawText()).ProtocolVersions;
        var selected = ProtocolVersion.Negotiate(offered)
            ?? throw new InvalidOperationException("Fake server received no compatible protocol version");
        var result = new InitializeResult { ProtocolVersion = selected, Snapshots = new() };
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

    // ── Request round-trip ────────────────────────────────────────────────

    [Fact]
    public async Task RequestRoundTrip_InitializeReturnsProtocolVersion()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Server goroutine: respond to one initialize request.
        var serverTask = Task.Run(() => FakeServer.HandleOneInitialize(serverSide, cts.Token), cts.Token);

        await using var client = AhpClient.Connect(clientSide);
        var result = await client.InitializeAsync("test-client", cancellationToken: cts.Token);

        Assert.Equal(ProtocolVersion.Supported[0], result.ProtocolVersion);
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

        Assert.Equal(ProtocolVersion.Supported[0], result.ProtocolVersion);
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
            ProtocolVersion = ProtocolVersion.Supported[0],
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

        Assert.Equal(ProtocolVersion.Supported[0], result.ProtocolVersion);
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
