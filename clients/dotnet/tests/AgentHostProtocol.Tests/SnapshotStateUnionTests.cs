// SnapshotState is the shape-probed discriminated union of the six per-channel
// state types (root, session, terminal, changeset, resource-watch, annotations).
// The generated SnapshotStateConverter inspects distinctive top-level wire fields
// to pick the variant. These tests round-trip a SnapshotState through the REAL
// serializer (AhpJson.Options, the same options the production client uses) for
// every variant and assert the result deserializes back to the CORRECT variant —
// in particular that ResourceWatchState and AnnotationsState are NOT silently
// mis-routed to RootState (the fallback branch), which is what a converter that
// only probes session/terminal/changeset/root would do.
#nullable enable

using System.Collections.Generic;
using System.Text.Json;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class SnapshotStateUnionTests
{
    private static SnapshotState RoundTrip(SnapshotState value)
    {
        // Serialize through the real converter, then read it straight back. A
        // correct converter recovers the same variant; a converter missing a
        // probe drops the payload into the RootState fallback branch.
        string wire = JsonSerializer.Serialize(value, AhpJson.Options);
        return JsonSerializer.Deserialize<SnapshotState>(wire, AhpJson.Options)!;
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

        SnapshotState decoded = RoundTrip(original);

        // The decisive assertion: the ResourceWatch variant is recovered and the
        // payload was NOT mis-typed as RootState (the catch-all fallback).
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

        SnapshotState decoded = RoundTrip(original);

        // The decisive assertion: the Annotations variant is recovered and the
        // payload was NOT mis-typed as RootState (the catch-all fallback).
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

    // Guard the other four variants too, so a future re-ordering of the probe
    // chain that shadows an existing variant is caught here as well.
    [Fact]
    public void RootState_RoundTripsToRootVariant()
    {
        var original = new SnapshotState
        {
            Root = new RootState { Agents = new List<AgentInfo>() },
        };

        SnapshotState decoded = RoundTrip(original);

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

        SnapshotState decoded = RoundTrip(original);

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
        // SessionState carries no `summary` field (it was removed when the session
        // state was flattened), so the converter must discriminate on the required
        // `lifecycle` field. A probe that still required `summary` drops a session
        // snapshot into the RootState fallback — this test falsifies that regression.
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

        SnapshotState decoded = RoundTrip(original);

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
        // ChatState is discriminated on its required `turns` field. Completes the
        // per-variant coverage so a chat snapshot is never mis-routed to Root.
        var original = new SnapshotState
        {
            Chat = new ChatState
            {
                Resource = "ahp-session:/s1#chat",
                Title = "chat-snapshot",
                ModifiedAt = "0",
                Turns = new List<Turn>(),
            },
        };

        SnapshotState decoded = RoundTrip(original);

        Assert.NotNull(decoded.Chat);
        Assert.Null(decoded.Root);
        Assert.Null(decoded.Session);
        Assert.Null(decoded.Terminal);
        Assert.Null(decoded.Changeset);
        Assert.Null(decoded.ResourceWatch);
        Assert.Null(decoded.Annotations);

        Assert.Equal("chat-snapshot", decoded.Chat!.Title);
    }
}
