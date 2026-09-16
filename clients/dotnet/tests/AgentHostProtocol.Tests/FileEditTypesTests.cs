#nullable enable

using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class FileEditTypesTests
{
    [Fact]
    public void TypedFileEditsUseGeneratedMetadata()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            TypeInfoResolver = AhpJsonMetadata.Default,
        };
        foreach (Type type in new[]
        {
            typeof(FileEditSide),
            typeof(FileEditDiffStats),
            typeof(FileEditCollection),
        })
        {
            Assert.NotNull(AhpJsonMetadata.Default.GetTypeInfo(type, options));
        }

        var side = new FileEditSide
        {
            Uri = "file:///workspace/file.txt",
            Content = new ContentRef
            {
                Uri = "ahp-content:/file",
                SizeHint = 32,
                ContentType = "text/plain",
                Nonce = "v1",
            },
        };
        var original = new FileEditCollection
        {
            Items = new List<FileEdit>
            {
                new()
                {
                    Before = side,
                    After = side,
                    Diff = new FileEditDiffStats { Added = 2147483648L, Removed = 0 },
                },
            },
        };
        string wire = JsonSerializer.Serialize(original, options);
        var decoded = Assert.IsType<FileEditCollection>(
            JsonSerializer.Deserialize<FileEditCollection>(wire, options));
        FileEdit item = Assert.Single(decoded.Items);
        var before = Assert.IsType<FileEditSide>(item.Before);
        var after = Assert.IsType<FileEditSide>(item.After);
        var stats = Assert.IsType<FileEditDiffStats>(item.Diff);
        long? added = stats.Added;
        Assert.Equal(side.Uri, before.Uri);
        Assert.Equal("ahp-content:/file", after.Content.Uri);
        Assert.Equal(32L, after.Content.SizeHint);
        Assert.Equal("text/plain", after.Content.ContentType);
        Assert.Equal("v1", after.Content.Nonce);
        Assert.Equal(2147483648L, added);
        Assert.Equal(0L, stats.Removed);
    }

    [Fact]
    public void EmptyCollectionPreservesItems()
    {
        var empty = new FileEditCollection { Items = new List<FileEdit>() };
        string wire = SystemTextJsonAhpSerializer.Default.Serialize(empty);
        using JsonDocument document = JsonDocument.Parse(wire);
        JsonElement items = document.RootElement.GetProperty("items");
        Assert.Equal(JsonValueKind.Array, items.ValueKind);
        Assert.Equal(0, items.GetArrayLength());
    }
}
