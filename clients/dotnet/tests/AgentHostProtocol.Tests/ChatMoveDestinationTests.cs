#nullable enable

using System.Text.Json;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class ChatMoveDestinationTests
{
    private static readonly SystemTextJsonAhpSerializer Serializer = SystemTextJsonAhpSerializer.Default;

    [Fact]
    public void UnknownDestination_RoundTrips()
    {
        const string json = """{"kind":"future","value":42}""";

        ChatMoveDestination destination = Serializer.Deserialize<ChatMoveDestination>(json);
        JsonElement encoded = Serializer.SerializeToElement(destination);

        Assert.Equal("future", encoded.GetProperty("kind").GetString());
        Assert.Equal(42, encoded.GetProperty("value").GetInt32());
    }
}
