#nullable enable

using System.Collections.Generic;
using System.Text.Json;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class SnapshotStateUnionTests
{
    private static SnapshotState RoundTrip(string resource, SnapshotState value)
    {
        var snapshot = new Snapshot { Resource = resource, State = value, FromSeq = 0 };
        string wire = JsonSerializer.Serialize(snapshot, AhpJson.Options);
        return JsonSerializer.Deserialize<Snapshot>(wire, AhpJson.Options)!.State;
    }

    [Fact]
    public void ResourceWatchState_RoundTripsToResourceWatchVariant()
    {
        var original = new SnapshotState
        {
            ResourceWatch = new ResourceWatchState
            {
                Root = "ahp-resource-watch://workspace/src",
                Recursive = true,
            },
        };

        SnapshotState decoded = RoundTrip("ahp-resource-watch:/a", original);

        Assert.NotNull(decoded.ResourceWatch);
        Assert.Null(decoded.Root);
        Assert.Null(decoded.Session);
        Assert.Null(decoded.Terminal);
        Assert.Null(decoded.Changeset);
        Assert.Null(decoded.Annotations);

        Assert.Equal("ahp-resource-watch://workspace/src", decoded.ResourceWatch!.Root);
        Assert.True(decoded.ResourceWatch.Recursive);
    }

    [Fact]
    public void AnnotationsState_RoundTripsToAnnotationsVariant()
    {
        var original = new SnapshotState
        {
            Annotations = new AnnotationsState
            {
                Annotations = new List<Annotation>
                {
                    new Annotation
                    {
                        Id = "ann-1",
                        Origin = new AnnotationOrigin
                        {
                            Session = "ahp-session:/00000000-0000-0000-0000-000000000000",
                            TurnId = "turn-1",
                        },
                        Resource = "ahp-session:/00000000-0000-0000-0000-000000000000/file.cs",
                        Resolved = false,
                        Entries = new List<AnnotationEntry>
                        {
                            new AnnotationEntry { Id = "entry-1", Text = StringOrMarkdown.FromPlain("first note") },
                        },
                    },
                },
            },
        };

        SnapshotState decoded = RoundTrip("ahp-annotations:/a", original);

        Assert.NotNull(decoded.Annotations);
        Assert.Null(decoded.Root);
        Assert.Null(decoded.Session);
        Assert.Null(decoded.Terminal);
        Assert.Null(decoded.Changeset);
        Assert.Null(decoded.ResourceWatch);

        Assert.Single(decoded.Annotations!.Annotations);
        Assert.Equal("ann-1", decoded.Annotations.Annotations[0].Id);
        Assert.Equal("first note", decoded.Annotations.Annotations[0].Entries[0].Text.AsText());
    }

    [Fact]
    public void RootState_RoundTripsToRootVariant()
    {
        var original = new SnapshotState
        {
            Root = new RootState { Agents = new List<AgentInfo>() },
        };

        SnapshotState decoded = RoundTrip("ahp-root:/", original);

        Assert.NotNull(decoded.Root);
        Assert.Null(decoded.ResourceWatch);
        Assert.Null(decoded.Annotations);
        Assert.Null(decoded.Session);
        Assert.Null(decoded.Terminal);
        Assert.Null(decoded.Changeset);
    }

    [Fact]
    public void ChangesetState_RoundTripsToChangesetVariant()
    {
        var original = new SnapshotState
        {
            Changeset = new ChangesetState
            {
                Status = ChangesetStatus.Ready,
                Files = new List<ChangesetFile>(),
            },
        };

        SnapshotState decoded = RoundTrip("ahp-changeset:/a", original);

        Assert.NotNull(decoded.Changeset);
        Assert.Null(decoded.Root);
        Assert.Null(decoded.ResourceWatch);
        Assert.Null(decoded.Annotations);
        Assert.Null(decoded.Session);
        Assert.Null(decoded.Terminal);
    }

    [Fact]
    public void SessionState_RoundTripsToSessionVariant()
    {
        var original = new SnapshotState
        {
            Session = new SessionState
            {
                Provider = "copilot",
                Title = "session-snapshot",
                Lifecycle = SessionLifecycle.Ready,
                ActiveClients = new List<SessionActiveClient>(),
                Chats = new List<ChatSummary>(),
            },
        };

        SnapshotState decoded = RoundTrip("ahp-session:/s1", original);

        Assert.NotNull(decoded.Session);
        Assert.Null(decoded.Root);
        Assert.Null(decoded.Chat);
        Assert.Null(decoded.Terminal);
        Assert.Null(decoded.Changeset);
        Assert.Null(decoded.ResourceWatch);
        Assert.Null(decoded.Annotations);

        Assert.Equal("session-snapshot", decoded.Session!.Title);
        Assert.Equal(SessionLifecycle.Ready, decoded.Session.Lifecycle);
    }

    [Fact]
    public void ChatState_RoundTripsToChatVariant()
    {
        var original = new SnapshotState
        {
            Chat = new ChatState
            {
                Resource = "ahp-chat:/c1",
                Title = "chat-snapshot",
                ModifiedAt = "0",
                Turns = new List<Turn>(),
            },
        };

        SnapshotState decoded = RoundTrip("ahp-chat:/c1", original);

        Assert.NotNull(decoded.Chat);
        Assert.Null(decoded.Root);
        Assert.Null(decoded.Session);
        Assert.Null(decoded.Terminal);
        Assert.Null(decoded.Changeset);
        Assert.Null(decoded.ResourceWatch);
        Assert.Null(decoded.Annotations);

        Assert.Equal("chat-snapshot", decoded.Chat!.Title);
    }

    [Theory]
    [InlineData("null")]
    [InlineData("false")]
    [InlineData("42")]
    [InlineData("\"state\"")]
    [InlineData("[]")]
    [InlineData("{}")]
    [InlineData("{\"content\":null,\"lifecycle\":false,\"entries\":0}")]
    public void WithoutKnownResource_PreservesAnyJson(string wire)
    {
        var standalone = JsonSerializer.Deserialize<SnapshotState>(wire, AhpJson.Options)!;
        Assert.Equal(wire, standalone.Unknown!.Value.GetRawText());
        Assert.Equal(wire, JsonSerializer.Serialize(standalone, AhpJson.Options));

        using var doc = JsonDocument.Parse(wire);
        foreach (var resource in new[] { "x-ext:/a", "ahp-root" })
        {
            var state = SnapshotState.FromResource(resource, doc.RootElement, AhpJson.Options);
            Assert.Equal(wire, state.Unknown!.Value.GetRawText());
        }
        var snapshotWire = "{\"resource\":\"x-ext:/a\",\"state\":" + wire + ",\"fromSeq\":0}";
        var snapshot = JsonSerializer.Deserialize<Snapshot>(snapshotWire, AhpJson.Options)!;
        Assert.Equal(wire, snapshot.State.Unknown!.Value.GetRawText());
    }

    [Theory]
    [InlineData("null")]
    [InlineData("false")]
    [InlineData("{\"lifecycle\":\"ready\"}")]
    public void KnownResource_PropagatesDecodeErrors(string wire)
    {
        using var doc = JsonDocument.Parse(wire);
        Assert.Throws<JsonException>(() => SnapshotState.FromResource("ahp-terminal:/t1", doc.RootElement, AhpJson.Options));
        var snapshotWire = "{\"resource\":\"ahp-terminal:/t1\",\"state\":" + wire + ",\"fromSeq\":0}";
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<Snapshot>(snapshotWire, AhpJson.Options));
    }
}
