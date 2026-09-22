#nullable enable

using Microsoft.AgentHostProtocol.Hosts;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class AccountsTests
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    [Theory]
    [InlineData("""{"accounts":[],"attempts":[]}""")]
    [InlineData("""
        {"accounts":[{"id":"a","label":"Work","removable":false,"consumers":[
          {"kind":"agent","provider":"copilot","resource":"https://api.example.test"},
          {"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"}]}],
         "attempts":[{"id":"attempt-1","status":"completed","accountId":"a",
           "consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"},
           "resource":"https://api.example.test"}]}
        """)]
    public void AccountsSnapshot_RoundTripsWithoutBecomingRoot(string input)
    {
        var snapshot = Ser.Deserialize<SnapshotState>(input);
        Assert.NotNull(snapshot.Accounts);
        Assert.Null(snapshot.Root);
        Assert.Equal(JsonCanon.Of(Ser.Deserialize<JsonElement>(input)), JsonCanon.Of(Ser.SerializeToElement(snapshot)));
    }

    [Theory]
    [InlineData("""{"kind":"attempt","attemptId":"attempt-1"}""")]
    [InlineData("""{"kind":"account","accountId":"account-1"}""")]
    public void Authenticate_RoundTripsBindings(string binding)
    {
        string input = """{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":"""
            + binding + "}";
        var parameters = Ser.Deserialize<AuthenticateParams>(input);
        Assert.NotNull(parameters.Binding);
        Assert.Equal(JsonCanon.Of(Ser.Deserialize<JsonElement>(input)), JsonCanon.Of(Ser.SerializeToElement(parameters)));
    }

    [Fact]
    public void Authenticate_LegacyWireRemainsUnbound()
    {
        const string input = """{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token"}""";
        var parameters = Ser.Deserialize<AuthenticateParams>(input);
        Assert.Null(parameters.Binding);
        Assert.Equal(JsonCanon.Of(Ser.Deserialize<JsonElement>(input)), JsonCanon.Of(Ser.SerializeToElement(parameters)));
    }

    [Theory]
    [InlineData("""{"kind":"future","accountId":"a"}""")]
    [InlineData("""{"accountId":"a"}""")]
    [InlineData("""{"kind":42,"accountId":"a"}""")]
    public void Authenticate_RejectsUnknownBindings(string binding)
    {
        string input = """{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":"""
            + binding + "}";
        Assert.Throws<JsonException>(() => Ser.Deserialize<AuthenticateParams>(input));
    }

    [Fact]
    public void Authentication_PreservesFutureFlowWithoutInterpretingItAsSupported()
    {
        const string input = """{"flows":[{"kind":"future"},{"kind":"clientBrokered"}]}""";
        var capability = Ser.Deserialize<AuthenticationCapability>(input);
        Assert.NotEqual(AuthFlowKind.ClientBrokered, capability.Flows[0].Kind);
        Assert.Equal(JsonCanon.Of(Ser.Deserialize<JsonElement>(input)), JsonCanon.Of(Ser.SerializeToElement(capability)));
    }

    [Fact]
    public void Reducer_UpsertsRemovesAndPreservesOtherEntries()
    {
        var state = Ser.Deserialize<AccountsState>("""{"accounts":[],"attempts":[]}""");
        string[] actions =
        [
            """{"type":"accounts/set","account":{"id":"a","label":"First","removable":true,"consumers":[]}}""",
            """{"type":"accounts/set","account":{"id":"b","label":"Other","removable":false,"consumers":[]}}""",
            """{"type":"accounts/set","account":{"id":"a","label":"Updated","removable":true,"consumers":[]}}""",
            """
            {"type":"accounts/authAttemptSet","attempt":{"id":"one","status":"pending",
             "consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"},
             "resource":"https://api.example.test"}}
            """,
            """
            {"type":"accounts/authAttemptSet","attempt":{"id":"two","status":"pending",
             "consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"},
             "resource":"https://mcp.example.test"}}
            """,
            """
            {"type":"accounts/authAttemptSet","attempt":{"id":"one","status":"completed","accountId":"a",
             "consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"},
             "resource":"https://api.example.test"}}
            """,
            """
            {"type":"accounts/authAttemptSet","attempt":{"id":"two","status":"failed",
             "error":{"errorType":"denied","message":"Denied"},
             "consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"},
             "resource":"https://mcp.example.test"}}
            """,
            """{"type":"accounts/removed","id":"a"}""",
            """{"type":"accounts/authAttemptRemoved","id":"one"}""",
        ];
        foreach (string wire in actions)
            Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToAccounts(state, Ser.Deserialize<StateAction>(wire)));

        const string expected = """
            {"accounts":[{"id":"b","label":"Other","removable":false,"consumers":[]}],
             "attempts":[{"id":"two","status":"failed","error":{"errorType":"denied","message":"Denied"},
               "consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"},
               "resource":"https://mcp.example.test"}]}
            """;
        Assert.Equal(JsonCanon.Of(Ser.Deserialize<JsonElement>(expected)), JsonCanon.Of(Ser.SerializeToElement(state)));
        Assert.Equal(ReduceOutcome.NoOp, Reducers.ApplyToAccounts(state,
            Ser.Deserialize<StateAction>("""{"type":"accounts/removed","id":"missing"}""")));
        Assert.Equal(ReduceOutcome.NoOp, Reducers.ApplyToAccounts(state,
            Ser.Deserialize<StateAction>("""{"type":"accounts/authAttemptRemoved","id":"missing"}""")));
        Assert.Equal(ReduceOutcome.OutOfScope, Reducers.ApplyToAccounts(state,
            Ser.Deserialize<StateAction>("""{"type":"root/activeSessionsChanged","activeSessions":3}""")));
    }

    [Fact]
    public void Mirror_IsolatesHostsAndDropsAccountsWithoutRoot()
    {
        var mirror = new MultiHostStateMirror();
        mirror.PutAccounts("first", Ser.Deserialize<AccountsState>(
            """{"accounts":[{"id":"a","label":"First","removable":true,"consumers":[]}],"attempts":[]}"""));
        mirror.PutAccounts("second", Ser.Deserialize<AccountsState>(
            """{"accounts":[{"id":"b","label":"Second","removable":true,"consumers":[]}],"attempts":[]}"""));
        mirror.PutRoot("first", new RootState { Agents = [] });

        mirror.DropResource("first", ProtocolVersion.AccountsResourceUri);
        Assert.False(mirror.Accounts("first").Found);
        Assert.True(mirror.Root("first").Found);
        Assert.Equal("b", Assert.Single(mirror.Accounts("second").Value!.Accounts).Id);
        mirror.DropHost("second");
        Assert.False(mirror.Accounts("second").Found);
    }
}
