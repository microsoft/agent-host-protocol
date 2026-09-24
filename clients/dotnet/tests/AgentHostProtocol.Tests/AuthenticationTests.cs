#nullable enable

using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class AuthenticationTests
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Authenticate_PreservesOptionalAccountAndEmptyResult(bool identified)
    {
        var parameters = new AuthenticateParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            Resource = "https://api.example.test",
            Token = "test-token",
            Account = identified
                ? new AuthenticationAccount { Authority = "https://issuer.example.test/", Id = "user-123" }
                : null,
        };
        var wire = Ser.SerializeToElement(parameters);
        Assert.Equal(identified, wire.TryGetProperty("account", out _));
        var decoded = Ser.Deserialize<AuthenticateParams>(wire);
        Assert.Equal(parameters.Account, decoded.Account);
        Assert.Equal(parameters.Token, decoded.Token);
        Assert.Equal("{}", Ser.Serialize(new AuthenticateResult()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Initialize_PreservesEmptyCapabilityPresence(bool advertised)
    {
        var result = new InitializeResult
        {
            ProtocolVersion = ProtocolVersion.Current,
            Snapshots = [],
            AccountRevocation = advertised ? new Dictionary<string, JsonElement>() : null,
        };
        var wire = Ser.SerializeToElement(result);
        Assert.Equal(advertised, wire.TryGetProperty("accountRevocation", out var marker));
        if (advertised)
        {
            Assert.Equal(JsonValueKind.Object, marker.ValueKind);
            Assert.Empty(marker.EnumerateObject());
        }
        Assert.Equal(advertised, Ser.Deserialize<InitializeResult>(wire).AccountRevocation is not null);
    }

    [Fact]
    public async Task Notify_SendsTypedAccountRevocationWithoutRequest()
    {
        var (clientSide, serverSide) = MemTransport.CreatePair();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await using var client = AhpClient.Connect(clientSide);
        var parameters = new AuthRevokedParams
        {
            Channel = ProtocolVersion.RootResourceUri,
            Resource = "https://api.example.test",
            Account = new AuthenticationAccount { Authority = "https://issuer.example.test/", Id = "user-123" },
        };
        await client.NotifyAsync("auth/revoked", parameters, cts.Token);
        var message = Ser.DecodeMessage(await serverSide.ReceiveAsync(cts.Token));
        var notification = Assert.IsType<JsonRpcNotification>(message.Notification);
        Assert.Null(message.Request);
        Assert.Equal("auth/revoked", notification.Method);
        var decoded = Ser.Deserialize<AuthRevokedParams>(notification.Params!.Value);
        Assert.Equal(parameters, decoded);
    }
}
