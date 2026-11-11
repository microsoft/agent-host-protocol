using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class VersionNegotiationTests
{
    [Fact]
    public void SharedCorpus()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (!File.Exists(Path.Combine(root.FullName, "types", "test-cases", "version-negotiation.json")))
        {
            root = root.Parent ?? throw new DirectoryNotFoundException("Cannot locate version negotiation corpus");
        }
        using var document = JsonDocument.Parse(File.ReadAllText(
            Path.Combine(root.FullName, "types", "test-cases", "version-negotiation.json")));
        Assert.NotEqual(0, document.RootElement.GetArrayLength());
        foreach (var fixture in document.RootElement.EnumerateArray())
        {
            var offered = fixture.GetProperty("offered").EnumerateArray()
                .Select(value => value.GetString() ?? throw new InvalidDataException("Null offered version")).ToArray();
            if (fixture.TryGetProperty("invalid", out var invalid) && invalid.GetBoolean())
            {
                Assert.Throws<ArgumentException>(() => ProtocolVersion.Negotiate(offered));
            }
            else
            {
                Assert.Equal(fixture.GetProperty("expected").GetString(), ProtocolVersion.Negotiate(offered));
            }
        }
    }
}
