// Port of clients/go/ahp/hosts/hosts_test.go.
// Uses the same in-memory transport pair from ClientTests.
#nullable enable

using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;
using Microsoft.AgentHostProtocol.Hosts;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class HostsTests
{
    // ── Fake server helper (mirrors hosts_test.go / runFakeServer) ────────
    // Uses the shared FakeHost loop; the per-test logic is just the initialize
    // reply.

    private static Task RunFakeServerAsync(MemTransport serverSide, CancellationToken ct) =>
        FakeHost.New()
            .OnInitialize((req, side, c) => FakeHost.RespondResultAsync(
                side, req.Id, new InitializeResult { ProtocolVersion = ProtocolVersion.Supported[0], Snapshots = new() }, c))
            .RunAsync(serverSide, ct);

    // ── Single host handshake ─────────────────────────────────────────────

    [Fact]
    public async Task SingleHostHandshake_ConnectedWithProtocolVersion()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var serverTask = Task.Run(() => RunFakeServerAsync(serverSide, cts.Token), TestContext.Current.CancellationToken);

        var cfg = new HostConfig
        {
            Id = new HostId("local"),
            Label = "Local",
            TransportFactory = (hostId, ct) => Task.FromResult<ITransport>(clientSide),
        };

        var (multi, handle) = await MultiHostClient.SingleAsync(cfg, cts.Token);
        await using var disposeMulti = multi;

        Assert.Equal(HostStateKind.Connected, handle.State.Kind);
        Assert.Equal(ProtocolVersion.Supported[0], handle.ProtocolVersion);
        Assert.False(string.IsNullOrEmpty(handle.ClientId),
            "ClientID should be auto-generated and non-empty");
        _ = serverTask; // referenced to avoid unused-variable warning
    }

    // ── ClientID persisted across Add/Remove/Add ──────────────────────────

    [Fact]
    public async Task ClientId_PersistedAcrossRemoveAndReAdd()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        var multi = new MultiHostClient();
        await using var disposeMulti = multi;

        // Factory that wires up a fresh fake server each time.
        Func<HostId, CancellationToken, Task<ITransport>> factory = (hostId, ct) =>
        {
            var (c, s) = MemTransport.CreatePair();
            var srvTask = Task.Run(() => RunFakeServerAsync(s, ct));
            _ = srvTask; // fire and forget
            return Task.FromResult<ITransport>(c);
        };

        var cfg = new HostConfig
        {
            Id = new HostId("host-a"),
            Label = "A",
            TransportFactory = (id, ct) => factory(id, ct),
        };

        var h1 = await multi.AddHostAsync(cfg, cts.Token);
        var firstId = h1.ClientId;

        await multi.RemoveHostAsync(new HostId("host-a"), cts.Token);

        var h2 = await multi.AddHostAsync(cfg, cts.Token);

        Assert.Equal(firstId, h2.ClientId);
    }
}
