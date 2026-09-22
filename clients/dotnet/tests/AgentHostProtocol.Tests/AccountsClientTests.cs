#nullable enable

using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol.Hosts;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class AccountsClientTests
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    [Theory]
    [InlineData("authenticate", "{}")]
    [InlineData("authenticate", """{"accountId":""}""")]
    [InlineData("authenticate", """{"accountId":"different-account"}""")]
    [InlineData("authBegin", """{"attemptId":"attempt-1"}""")]
    [InlineData("authBegin", """{"flow":"future","attemptId":"attempt-1"}""")]
    [InlineData("authBegin", """{"flow":"clientBrokered","attemptId":""}""")]
    public async Task AuthenticationHelpers_RejectUnconfirmedResultsWithoutRetry(string method, string result)
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        int deliveries = 0;
        Task serverTask = FakeHost.New()
            .OnInitialize((req, side, ct) => FakeHost.RespondResultAsync(side, req.Id, new InitializeResult
            {
                ProtocolVersion = ProtocolVersion.Current,
                Snapshots = [],
                Authentication = new AuthenticationCapability { Flows = [new AuthFlowSupport { Kind = AuthFlowKind.ClientBrokered }] },
            }, ct))
            .On(method, (req, side, ct) =>
            {
                Interlocked.Increment(ref deliveries);
                if (method == "authenticate")
                    Assert.NotNull(Ser.Deserialize<AuthenticateParams>(req.Params!.Value).Binding);
                return FakeHost.RespondResultAsync(side, req.Id, Ser.Deserialize<JsonElement>(result), ct);
            })
            .On("ping", (req, side, ct) => FakeHost.RespondEmptyAsync(side, req.Id, ct))
            .RunAsync(serverSide, cts.Token);
        await using var client = AhpClient.Connect(clientSide);
        await client.InitializeAsync("accounts-client", cancellationToken: cts.Token);
        if (method == "authBegin")
        {
            var parameters = Ser.Deserialize<AuthBeginParams>("""
                {"channel":"ahp-accounts://","target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"}},
                 "flows":[{"kind":"clientBrokered"}]}
                """);
            await Assert.ThrowsAsync<AhpTransportException>(() => client.AuthBeginAsync(parameters, cts.Token));
        }
        else
        {
            var parameters = Ser.Deserialize<AuthenticateParams>(
                """{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":{"kind":"account","accountId":"account-1"}}""");
            await Assert.ThrowsAsync<AhpTransportException>(() => client.AuthenticateAsync(parameters, cts.Token));
        }
        await client.PingAsync(cts.Token);
        Assert.Equal(1, deliveries);
        await client.ShutdownAsync(cts.Token);
        await serverTask;
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MultiHost_RetainsAuthenticationCapabilityAcrossReconnect(bool useSnapshot)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var serverTasks = new List<Task>();
        int initializes = 0;
        int reconnects = 0;
        HostTransportFactory factory = (_, _) =>
        {
            var (client, server) = MemTransport.CreatePair();
            serverTasks.Add(FakeHost.New()
                .OnInitialize((req, side, ct) =>
                {
                    Interlocked.Increment(ref initializes);
                    return FakeHost.RespondResultAsync(side, req.Id, new InitializeResult
                    {
                        ProtocolVersion = ProtocolVersion.Current,
                        Snapshots = [],
                        Authentication = new AuthenticationCapability { Flows = [new AuthFlowSupport { Kind = AuthFlowKind.ClientBrokered }] },
                    }, ct);
                })
                .OnReconnect((req, side, ct) =>
                {
                    Interlocked.Increment(ref reconnects);
                    return FakeHost.RespondResultAsync(side, req.Id,
                        useSnapshot
                            ? new ReconnectResult(new ReconnectSnapshotResult { Type = ReconnectResultType.Snapshot, Snapshots = [] })
                            : new ReconnectResult(new ReconnectReplayResult { Type = ReconnectResultType.Replay, Actions = [], Missing = [] }), ct);
                })
                .OnListSessions((req, side, ct) =>
                    FakeHost.RespondResultAsync(side, req.Id, new ListSessionsResult { Items = [] }, ct))
                .On("authenticate", (req, side, ct) =>
                    FakeHost.RespondResultAsync(side, req.Id, new AuthenticateResult { AccountId = "account-1" }, ct))
                .RunAsync(server, cts.Token));
            return Task.FromResult<ITransport>(client);
        };
        await using var hosts = new MultiHostClient();
        var hostId = new HostId("accounts-host");
        await hosts.AddHostAsync(new HostConfig { Id = hostId, TransportFactory = factory }, cts.Token);
        var initial = Assert.IsType<HostClientHandle>(hosts.ClientFor(hostId));
        var parameters = Ser.Deserialize<AuthenticateParams>(
            """{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":{"kind":"account","accountId":"account-1"}}""");
        Assert.Equal("account-1", (await initial.AuthenticateAsync(parameters, cts.Token)).AccountId);
        var snapshots = hosts.HostSnapshots(hostId);
        await hosts.ReconnectAsync(hostId, cts.Token);
        HostHandle snapshot;
        do
        {
            snapshot = await snapshots.ReadAsync(cts.Token);
        }
        while (snapshot.State.Kind != HostStateKind.Connected || snapshot.Generation == initial.Generation);

        var reconnected = Assert.IsType<HostClientHandle>(hosts.ClientFor(hostId));
        Assert.Equal("account-1", (await reconnected.AuthenticateAsync(parameters, cts.Token)).AccountId);
        Assert.Equal(1, initializes);
        Assert.Equal(1, reconnects);
        await hosts.ShutdownAsync(cts.Token);
        await Task.WhenAll(serverTasks);
    }

    [Fact]
    public async Task AuthenticationHelpers_PreserveTargetsAndBothBindings()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        AuthBeginParams? receivedBegin = null;
        var receivedBindings = new List<string>();
        Task serverTask = FakeHost.New()
            .OnInitialize((req, side, ct) => FakeHost.RespondResultAsync(side, req.Id, new InitializeResult
            {
                ProtocolVersion = ProtocolVersion.Current,
                Snapshots = [],
                Authentication = new AuthenticationCapability { Flows = [new AuthFlowSupport { Kind = AuthFlowKind.ClientBrokered }] },
            }, ct))
            .On("authBegin", async (req, side, ct) =>
            {
                receivedBegin = Ser.Deserialize<AuthBeginParams>(req.Params!.Value);
                await FakeHost.RespondResultAsync(side, req.Id,
                    new AuthBeginResult { Flow = AuthFlowKind.ClientBrokered, AttemptId = "attempt-1" }, ct);
            })
            .On("authenticate", async (req, side, ct) =>
            {
                var parameters = Ser.Deserialize<AuthenticateParams>(req.Params!.Value);
                Assert.Equal(ProtocolVersion.RootResourceUri, parameters.Channel);
                Assert.Equal("https://api.example.test", parameters.Resource);
                Assert.NotNull(parameters.Binding);
                receivedBindings.Add(JsonCanon.Of(Ser.SerializeToElement(parameters.Binding)));
                await FakeHost.RespondResultAsync(side, req.Id, new AuthenticateResult { AccountId = "account-1" }, ct);
            })
            .RunAsync(serverSide, cts.Token);
        await using var client = AhpClient.Connect(clientSide);
        var api = Assert.IsAssignableFrom<IAhpClient>(client);
        var initialized = await api.InitializeAsync("accounts-client", cancellationToken: cts.Token);
        initialized.Authentication!.Flows.Clear();

        const string beginWire = """
            {"channel":"ahp-session:/ignored",
             "target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"}},
             "flows":[{"kind":"clientBrokered"}],"accountId":"account-1"}
            """;
        var begin = Ser.Deserialize<AuthBeginParams>(beginWire);
        var attempt = await api.AuthBeginAsync(begin, cts.Token);
        Assert.Equal("attempt-1", attempt.AttemptId);
        Assert.NotNull(receivedBegin);
        Assert.Equal(ProtocolVersion.AccountsResourceUri, receivedBegin.Channel);
        Assert.Equal("account-1", receivedBegin.AccountId);
        Assert.Equal(JsonCanon.Of(Ser.SerializeToElement(begin.Target)), JsonCanon.Of(Ser.SerializeToElement(receivedBegin.Target)));
        Assert.Equal("ahp-session:/ignored", begin.Channel);

        string[] bindings =
        [
            """{"kind":"attempt","attemptId":"attempt-1"}""",
            """{"kind":"account","accountId":"account-1"}""",
        ];
        foreach (string binding in bindings)
        {
            var parameters = Ser.Deserialize<AuthenticateParams>(
                """{"channel":"ahp-session:/ignored","resource":"https://api.example.test","token":"test-token","binding":"""
                + binding + "}");
            var result = await api.AuthenticateAsync(parameters, cts.Token);
            Assert.Equal("account-1", result.AccountId);
        }
        Assert.Equal(bindings.Length, receivedBindings.Count);
        for (int i = 0; i < bindings.Length; i++)
            Assert.Equal(JsonCanon.Of(Ser.Deserialize<JsonElement>(bindings[i])), receivedBindings[i]);

        await client.ShutdownAsync(cts.Token);
        await serverTask;
    }

    [Theory]
    [InlineData(null)]
    [InlineData("""{"flows":[]}""")]
    [InlineData("""{"flows":[{"kind":"futureHostFlow"}]}""")]
    public async Task BoundAuthentication_RequiresAdvertisedFlow(string? capability)
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        int unexpectedRequests = 0;
        Task serverTask = FakeHost.New()
            .OnInitialize((req, side, ct) => FakeHost.RespondResultAsync(side, req.Id, new InitializeResult
            {
                ProtocolVersion = ProtocolVersion.Current,
                Snapshots = [],
                Authentication = capability is null ? null : Ser.Deserialize<AuthenticationCapability>(capability),
            }, ct))
            .On("ping", (req, side, ct) => FakeHost.RespondEmptyAsync(side, req.Id, ct))
            .OnDefault((req, side, ct) =>
            {
                Interlocked.Increment(ref unexpectedRequests);
                return FakeHost.RespondEmptyAsync(side, req.Id, ct);
            })
            .RunAsync(serverSide, cts.Token);
        await using var client = AhpClient.Connect(clientSide);
        await client.InitializeAsync("accounts-client", cancellationToken: cts.Token);

        var parameters = Ser.Deserialize<AuthenticateParams>(
            """{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":{"kind":"account","accountId":"a"}}""");
        await Assert.ThrowsAsync<AhpTransportException>(() => client.AuthenticateAsync(parameters, cts.Token));
        var begin = Ser.Deserialize<AuthBeginParams>("""
            {"channel":"ahp-accounts://","target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"}},
             "flows":[{"kind":"clientBrokered"}]}
            """);
        await Assert.ThrowsAsync<AhpTransportException>(() => client.AuthBeginAsync(begin, cts.Token));
        await Assert.ThrowsAsync<AhpTransportException>(() => client.SubscribeAccountsAsync(cancellationToken: cts.Token));

        await client.PingAsync(cts.Token);
        Assert.Equal(0, unexpectedRequests);
        await client.ShutdownAsync(cts.Token);
        await serverTask;
    }

    [Fact]
    public async Task AccountsSubscription_RoutesSnapshotsAndRejectionEnvelopes()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        Task serverTask = FakeHost.New()
            .OnInitialize((req, side, ct) => FakeHost.RespondResultAsync(side, req.Id, new InitializeResult
            {
                ProtocolVersion = ProtocolVersion.Current,
                Snapshots = [],
                Authentication = new AuthenticationCapability { Flows = [new AuthFlowSupport { Kind = AuthFlowKind.ClientBrokered }] },
            }, ct))
            .On("subscribe", async (req, side, ct) =>
            {
                var parameters = Ser.Deserialize<SubscribeParams>(req.Params!.Value);
                Assert.Equal(ProtocolVersion.AccountsResourceUri, parameters.Channel);
                await FakeHost.RespondResultAsync(side, req.Id, Ser.Deserialize<SubscribeResult>(
                    """{"snapshot":{"resource":"ahp-accounts://","fromSeq":1,"state":{"accounts":[],"attempts":[]}}}"""), ct);
                await FakeHost.SendNotificationAsync(side, "action", Ser.Deserialize<ActionEnvelope>("""
                    {"channel":"ahp-accounts://","serverSeq":2,
                     "action":{"type":"accounts/set","account":{"id":"managed","label":"Managed","removable":false,"consumers":[]}}}
                    """), ct);
                await FakeHost.SendNotificationAsync(side, "action", Ser.Deserialize<ActionEnvelope>("""
                    {"channel":"ahp-accounts://","serverSeq":3,"action":{"type":"accounts/removed","id":"managed"},
                     "origin":{"clientId":"accounts-client","clientSeq":9},"rejectionReason":"Account is not removable"}
                    """), ct);
            })
            .RunAsync(serverSide, cts.Token);
        await using var client = AhpClient.Connect(clientSide);
        await client.InitializeAsync("accounts-client", cancellationToken: cts.Token);
        var (result, sub) = await client.SubscribeAccountsAsync(cancellationToken: cts.Token);
        using (sub)
        {
            Assert.Equal(ProtocolVersion.AccountsResourceUri, sub.Uri);
            var snapshot = Assert.IsType<Snapshot>(result.Snapshot);
            var state = Assert.IsType<AccountsState>(snapshot.State.Accounts);
            var accepted = Assert.IsType<SubscriptionEventAction>(await sub.Events.ReadAsync(cts.Token));
            Assert.Null(accepted.Envelope.RejectionReason);
            Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToAccounts(state, accepted.Envelope.Action));
            var rejected = Assert.IsType<SubscriptionEventAction>(await sub.Events.ReadAsync(cts.Token));
            Assert.Equal("Account is not removable", rejected.Envelope.RejectionReason);
            Assert.Equal(9, rejected.Envelope.Origin!.ClientSeq);
            Assert.Equal("managed", Assert.Single(state.Accounts).Id);
        }
        await client.ShutdownAsync(cts.Token);
        await serverTask;
    }

    [Fact]
    public async Task LegacyAuthenticate_StillWorksWithoutCapability()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        Task serverTask = FakeHost.New()
            .On("authenticate", async (req, side, ct) =>
            {
                var parameters = Ser.Deserialize<AuthenticateParams>(req.Params!.Value);
                Assert.Equal(ProtocolVersion.RootResourceUri, parameters.Channel);
                Assert.Null(parameters.Binding);
                await FakeHost.RespondResultAsync(side, req.Id, new AuthenticateResult(), ct);
            })
            .RunAsync(serverSide, cts.Token);
        await using var client = AhpClient.Connect(clientSide);
        var result = await client.AuthenticateAsync(new AuthenticateParams
        {
            Channel = "ahp-session:/ignored",
            Resource = "https://api.example.test",
            Token = "test-token",
        }, cts.Token);
        Assert.Null(result.AccountId);
        await client.ShutdownAsync(cts.Token);
        await serverTask;
    }
}
