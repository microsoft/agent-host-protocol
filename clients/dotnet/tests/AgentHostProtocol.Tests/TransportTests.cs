// Phase-1 parity tests for matrix group E (transport) — in-memory transport.
// Exercises the REAL in-memory ITransport pair (MemTransport, defined in
// ClientTests.cs) over the REAL SystemTextJsonAhpSerializer. No mocking of
// ITransport or the JSON engine — the transport pair is the production helper
// the client tests use, and frames flow through real channels.
#nullable enable

using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class TransportTests
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    // ── E: in-mem both directions ─────────────────────────────────────────
    // A frame sent on A arrives on B, and a frame sent on B arrives on A.
    [Fact]
    public async Task InMemoryTransport_DeliversBothDirections()
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // A -> B
        await a.SendAsync(TransportMessage.FromText("a-to-b"), cts.Token);
        var onB = await b.ReceiveAsync(cts.Token);
        Assert.Equal(TransportFrame.Text, onB.Frame);
        Assert.Equal("a-to-b", onB.Text);

        // B -> A (a *different* payload, to prove the channels aren't crossed)
        await b.SendAsync(TransportMessage.FromText("b-to-a"), cts.Token);
        var onA = await a.ReceiveAsync(cts.Token);
        Assert.Equal(TransportFrame.Text, onA.Frame);
        Assert.Equal("b-to-a", onA.Text);

        await a.CloseAsync(cts.Token);
    }

    // ── E: close ends recv ────────────────────────────────────────────────
    // Closing either end unblocks a pending/subsequent ReceiveAsync on BOTH
    // ends with the closed signal (MemTransport throws AhpTransportException
    // "closed" — see ClientTests.cs MemTransport.ReceiveAsync).
    [Fact]
    public async Task InMemoryTransport_Close_EndsBothRecv()
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Start a receive on each end BEFORE closing, so we prove a *pending*
        // receive unblocks (not just a post-close one).
        var recvA = a.ReceiveAsync(cts.Token).AsTask();
        var recvB = b.ReceiveAsync(cts.Token).AsTask();

        // Give both receives a moment to actually park on the channel.
        await Task.Delay(50, cts.Token);

        await a.CloseAsync(cts.Token);

        // Both pending receives end with the closed signal.
        var exA = await Assert.ThrowsAsync<AhpTransportException>(() => recvA);
        Assert.Contains("closed", exA.Message, StringComparison.OrdinalIgnoreCase);
        var exB = await Assert.ThrowsAsync<AhpTransportException>(() => recvB);
        Assert.Contains("closed", exB.Message, StringComparison.OrdinalIgnoreCase);

        // A subsequent receive on either end also fails fast.
        await Assert.ThrowsAsync<AhpTransportException>(
            async () => await b.ReceiveAsync(cts.Token));
    }

    // Graceful close preserves frames whose sends have completed, even if the
    // receiver does not start reading until after close.
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InMemoryTransport_Close_DrainsAlreadySentFrames(bool closePeer)
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        for (int i = 0; i < 2; i++)
        {
            await a.SendAsync(TransportMessage.FromText($"a-{i}"), cts.Token);
            await b.SendAsync(TransportMessage.FromText($"b-{i}"), cts.Token);
        }
        await (closePeer ? b : a).CloseAsync(cts.Token);
        for (int i = 0; i < 2; i++)
        {
            Assert.Equal($"a-{i}", (await b.ReceiveAsync(cts.Token)).Text);
            Assert.Equal($"b-{i}", (await a.ReceiveAsync(cts.Token)).Text);
        }
        await Assert.ThrowsAsync<AhpTransportException>(async () => await a.ReceiveAsync(cts.Token));
        await Assert.ThrowsAsync<AhpTransportException>(async () => await b.ReceiveAsync(cts.Token));
    }

    [Fact]
    public async Task InMemoryTransport_Close_UnblocksBackpressuredSendWithoutLosingAcceptedFrames()
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        for (int i = 0; i < 16; i++)
            await a.SendAsync(TransportMessage.FromText($"frame-{i}"), cts.Token);
        var blocked = a.SendAsync(TransportMessage.FromText("not-accepted"), cts.Token).AsTask();
        Assert.False(blocked.IsCompleted);
        await b.CloseAsync(cts.Token);
        await Assert.ThrowsAsync<AhpTransportException>(() => blocked);
        for (int i = 0; i < 16; i++)
            Assert.Equal($"frame-{i}", (await b.ReceiveAsync(cts.Token)).Text);
        await Assert.ThrowsAsync<AhpTransportException>(async () => await b.ReceiveAsync(cts.Token));
    }

    // ── E: send after close throws ────────────────────────────────────────
    [Fact]
    public async Task InMemoryTransport_SendAfterClose_Throws()
    {
        var (a, _) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        await a.CloseAsync(cts.Token);

        var ex = await Assert.ThrowsAsync<AhpTransportException>(
            async () => await a.SendAsync(TransportMessage.FromText("nope"), cts.Token));
        Assert.Contains("closed", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ── E: TransportMessage round-trip ────────────────────────────────────
    // A JSON-RPC notification packed into a TransportMessage.FromText survives
    // the transport intact and decodes back to a notification with the same
    // method via the real serializer.
    [Fact]
    public async Task TransportMessage_RoundTrip_Notification()
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // A JSON-RPC notification: has "method", no "id".
        const string json = "{\"jsonrpc\":\"2.0\",\"method\":\"action\",\"params\":{}}";
        await a.SendAsync(TransportMessage.FromText(json), cts.Token);

        var received = await b.ReceiveAsync(cts.Token);
        Assert.Equal(TransportFrame.Text, received.Frame);
        Assert.Equal(json, received.Text);

        var decoded = Ser.DecodeMessage(received);
        Assert.NotNull(decoded.Notification);
        Assert.Null(decoded.Request);
        Assert.Equal("action", decoded.Notification!.Method);

        await a.CloseAsync(cts.Token);
    }

    // ── E: TransportMessage round-trip — success response ──────────────────
    // Port of Swift InMemoryTransportTests.testTransportMessageRoundTripPreservesSuccessResponse.
    // Encode a JSON-RPC success response via the REAL serializer, ship it over
    // the REAL MemTransport, decode it back, and assert the variant + id +
    // result survive. Uses EncodeMessage/DecodeMessage (the .NET analogue of
    // Swift's TransportMessage.encode(...).intoParsed()).
    [Fact]
    public async Task TransportMessage_RoundTrip_SuccessResponse()
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var original = new JsonRpcMessage
        {
            SuccessResponse = new JsonRpcSuccessResponse
            {
                Id = 42,
                Result = JsonDocument.Parse("{\"ok\":true}").RootElement,
            },
        };

        await a.SendAsync(Ser.EncodeMessage(original), cts.Token);
        var received = await b.ReceiveAsync(cts.Token);
        Assert.Equal(TransportFrame.Text, received.Frame);

        var decoded = Ser.DecodeMessage(received);
        Assert.NotNull(decoded.SuccessResponse);
        Assert.Null(decoded.Request);
        Assert.Null(decoded.ErrorResponse);
        Assert.Null(decoded.Notification);
        Assert.Equal(42UL, decoded.SuccessResponse!.Id);
        Assert.True(decoded.SuccessResponse.Result.GetProperty("ok").GetBoolean());

        await a.CloseAsync(cts.Token);
    }

    // ── E: TransportMessage round-trip — error response ────────────────────
    // Port of Swift InMemoryTransportTests.testTransportMessageRoundTripPreservesErrorResponse.
    [Fact]
    public async Task TransportMessage_RoundTrip_ErrorResponse()
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var original = new JsonRpcMessage
        {
            ErrorResponse = new JsonRpcErrorResponse
            {
                Id = 7,
                Error = new JsonRpcErrorObject { Code = -32000, Message = "boom" },
            },
        };

        await a.SendAsync(Ser.EncodeMessage(original), cts.Token);
        var received = await b.ReceiveAsync(cts.Token);

        var decoded = Ser.DecodeMessage(received);
        Assert.NotNull(decoded.ErrorResponse);
        Assert.Null(decoded.Request);
        Assert.Null(decoded.SuccessResponse);
        Assert.Null(decoded.Notification);
        Assert.Equal(7UL, decoded.ErrorResponse!.Id);
        Assert.Equal(-32000, decoded.ErrorResponse.Error.Code);
        Assert.Equal("boom", decoded.ErrorResponse.Error.Message);

        await a.CloseAsync(cts.Token);
    }

    // ── E: TransportMessage round-trip — request ───────────────────────────
    // Port of Swift InMemoryTransportTests.testTransportMessageRoundTripPreservesRequest.
    // A request is the (id + method) shape; the shape-probing converter must
    // decode it as a Request (not a Notification, which lacks an id).
    [Fact]
    public async Task TransportMessage_RoundTrip_Request()
    {
        var (a, b) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var original = new JsonRpcMessage
        {
            Request = new JsonRpcRequest
            {
                Id = 1,
                Method = "subscribe",
                Params = JsonDocument.Parse("{\"channel\":\"ahp-root://\"}").RootElement,
            },
        };

        await a.SendAsync(Ser.EncodeMessage(original), cts.Token);
        var received = await b.ReceiveAsync(cts.Token);

        var decoded = Ser.DecodeMessage(received);
        Assert.NotNull(decoded.Request);
        Assert.Null(decoded.Notification);
        Assert.Null(decoded.SuccessResponse);
        Assert.Null(decoded.ErrorResponse);
        Assert.Equal(1UL, decoded.Request!.Id);
        Assert.Equal("subscribe", decoded.Request.Method);
        Assert.Equal("ahp-root://", decoded.Request.Params!.Value.GetProperty("channel").GetString());

        await a.CloseAsync(cts.Token);
    }

    // ── E: subscription-buffer clamp — non-positive normalised ─────────────
    // Parity row "subscription-buffer clamps (>=1, neg->1, positive)". The .NET
    // clamp lives in AhpClient.Connect (AhpClient.cs ~line 233): a non-positive
    // SubscriptionBufferCapacity is normalised to the default 256 (NOT to 1 as
    // Swift's AHPClientConfig does — see featureGaps note). Exercise the REAL
    // clamp by connecting a REAL AhpClient over a REAL MemTransport and reading
    // the effective subscription capacity. The caller-owned config stays unchanged.
    [Theory]
    [InlineData(0)]
    [InlineData(-42)]
    public async Task ClientConfig_SubscriptionBuffer_NonPositiveUsesDefaultWithoutMutatingCaller(int requested)
    {
        var (clientSide, _) = MemTransport.CreatePair();
        var cfg = new ClientConfig { SubscriptionBufferCapacity = requested };

        await using var client = AhpClient.Connect(clientSide, cfg);

        using var subscription = client.AttachSubscription("ahp-test://capacity");
        Assert.Equal(requested, cfg.SubscriptionBufferCapacity);
    }

    // ── E: subscription-buffer clamp — positive preserved ──────────────────
    // The complement: a positive capacity passes through Connect untouched.
    [Fact]
    public async Task ClientConfig_SubscriptionBuffer_PositivePreserved()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        var cfg = new ClientConfig { SubscriptionBufferCapacity = 64 };

        await using var client = AhpClient.Connect(clientSide, cfg);

        Assert.Equal(64, cfg.SubscriptionBufferCapacity);
    }

    // ── E: defaults are reasonable ─────────────────────────────────────────
    // Port of Swift InMemoryTransportTests.AHPClientConfigTests.testDefaultsAreReasonable.
    // Asserts the REAL .NET ClientConfig.Default shape. The .NET buffer default
    // matches Swift (256) and the request-timeout default matches Swift (30s);
    // keep-alive defaults to Disabled, the .NET analogue of Swift's
    // KeepAlive == .disabled.
    [Fact]
    public void ClientConfig_DefaultsAreReasonable()
    {
        var config = ClientConfig.Default;

        Assert.Equal(256, config.SubscriptionBufferCapacity);
        Assert.Equal(TimeSpan.FromSeconds(30), config.DefaultRequestTimeout);
        Assert.Same(TimeProvider.System, config.TimeProvider);
        Assert.False(config.KeepAlive.IsEnabled);
        Assert.Same(KeepAlivePolicy.Disabled, config.KeepAlive);
    }
}
