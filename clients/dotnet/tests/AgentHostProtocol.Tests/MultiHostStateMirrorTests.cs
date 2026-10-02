// Port of clients/go/ahp/hosts/multi_host_state_mirror_test.go (and the TS
// multi_host_state_mirror tests). Exercises the real MultiHostStateMirror, the
// real root reducer, and the real HostSubscriptionEvent type — no mocking.
#nullable enable

using System;
using System.Collections.Generic;
using System.Text.Json;          // mirror/client tests that build wire payloads
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;
using Microsoft.AgentHostProtocol.Hosts;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class MultiHostStateMirrorTests
{
    [Fact]
    public void CanvasState_IsIsolatedAndDroppedWithItsResourceAndHost()
    {
        var mirror = new MultiHostStateMirror();
        const string uri = "ahp-canvas:/preview";
        CanvasState State() => new()
        {
            InstanceId = "preview",
            ExtensionId = "project:preview",
            CanvasId = "preview",
            Url = "https://example.test/original",
        };
        mirror.PutCanvas("host-a", uri, State());
        mirror.PutCanvas("host-b", uri, State());
        var (target, _) = mirror.Canvas("host-a", uri);
        Reducers.ApplyToCanvas(target!, new StateAction(new CanvasStateChangedAction
        {
            Type = ActionType.CanvasStateChanged,
            Canvas = new CanvasState
            {
                InstanceId = "preview",
                ExtensionId = "project:preview",
                CanvasId = "preview",
            },
        }));
        var (retained, _) = mirror.Canvas("host-b", uri);
        var targeted = new[] { target!.Url, retained!.Url };
        mirror.DropResource("host-a", uri);
        var (_, resourceFound) = mirror.Canvas("host-a", uri);
        mirror.PutCanvas("host-a", uri, State());
        mirror.DropHost("host-a");
        var (_, hostFound) = mirror.Canvas("host-a", uri);
        var (_, otherFound) = mirror.Canvas("host-b", uri);
        Assert.Equal(new string?[] { null, "https://example.test/original" }, targeted);
        Assert.Equal(new[] { false, false, true }, new[] { resourceFound, hostFound, otherFound });
    }

    // A minimal-but-valid RootState carrying a distinguishing active-session
    // count so two hosts' roots are observably different snapshots.
    private static RootState Root(long activeSessions) => new()
    {
        Agents = new List<AgentInfo>(),
        ActiveSessions = activeSessions,
    };

    private static SessionState Session(string title) => new()
    {
        Provider = "copilot",
        Title = title,
        Lifecycle = SessionLifecycle.Ready,
        ActiveClients = new(),
        Chats = new(),
    };

    // ── G: roots isolated per host ─────────────────────────────────────────

    [Fact]
    public void StateMirror_RootStatesIsolatedPerHost()
    {
        var m = new MultiHostStateMirror();
        var rootA = Root(1);
        var rootB = Root(2);

        m.PutRoot("host-a", rootA);
        m.PutRoot("host-b", rootB);

        var (gotA, foundA) = m.Root("host-a");
        var (gotB, foundB) = m.Root("host-b");

        Assert.True(foundA);
        Assert.True(foundB);
        // Each host keeps its own distinct snapshot.
        Assert.Equal(1, gotA!.ActiveSessions);
        Assert.Equal(2, gotB!.ActiveSessions);
        Assert.NotSame(gotA, gotB);
    }

    // ── G: uri collision no clobber ────────────────────────────────────────

    [Fact]
    public void StateMirror_SessionUriCollision_NoClobber()
    {
        var m = new MultiHostStateMirror();
        var sA = Session("a-title");
        var sB = Session("b-title");

        // SAME uri, different host — the (hostId, uri) tuple key keeps them
        // separate. This is the .NET equivalent of the collision-safe
        // hostedResourceKey used by the TS/Go mirrors.
        m.PutSession("host-a", "ahp-session:/s1", sA);
        m.PutSession("host-b", "ahp-session:/s1", sB);

        var (gotA, foundA) = m.Session("host-a", "ahp-session:/s1");
        var (gotB, foundB) = m.Session("host-b", "ahp-session:/s1");

        Assert.True(foundA);
        Assert.True(foundB);
        Assert.Equal("a-title", gotA!.Title);
        Assert.Equal("b-title", gotB!.Title);
        Assert.NotSame(gotA, gotB);
    }

    // ── G: root action targets one ─────────────────────────────────────────

    [Fact]
    public void StateMirror_ApplyRootAction_UpdatesOnlyTarget()
    {
        var m = new MultiHostStateMirror();
        m.PutRoot("host-a", Root(1));
        m.PutRoot("host-b", Root(1));

        // The .NET mirror has no ApplyRootAction method — that behavior is
        // composed from the real root reducer + PutRoot. Take host-a's root,
        // apply a RootActiveSessionsChanged action through Reducers.ApplyToRoot,
        // then write it back. host-b must be untouched.
        var (rootA, _) = m.Root("host-a");
        var action = new StateAction(new RootActiveSessionsChangedAction
        {
            Type = ActionType.RootActiveSessionsChanged,
            ActiveSessions = 42,
        });
        var outcome = Reducers.ApplyToRoot(rootA!, action);
        m.PutRoot("host-a", rootA!);

        Assert.Equal(ReduceOutcome.Applied, outcome);

        var (gotA, _) = m.Root("host-a");
        var (gotB, _) = m.Root("host-b");
        Assert.Equal(42, gotA!.ActiveSessions);   // target host changed
        Assert.Equal(1, gotB!.ActiveSessions);    // other host unchanged
    }

    // ── G: session action targets one ──────────────────────────────────────
    // Port of Swift MultiHostStateMirrorTests.testApplySessionActionUpdatesOnlyTargetSession.
    // Two hosts advertise the SAME session uri (ahp-session:/s1). A session-scoped
    // action applied to host-a's session must NOT touch host-b's identically-named
    // session. Like the root-action case above, the .NET mirror has no
    // ApplySessionAction method — the behavior is composed from the real session
    // reducer (Reducers.ApplyToSession) + PutSession, keyed by (hostId, uri).
    [Fact]
    public void StateMirror_ApplySessionAction_UpdatesOnlyTargetSession()
    {
        var m = new MultiHostStateMirror();
        m.PutSession("host-a", "ahp-session:/s1", Session("Old"));
        m.PutSession("host-b", "ahp-session:/s1", Session("Old"));

        var (sessA, _) = m.Session("host-a", "ahp-session:/s1");
        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "New on host-a",
        });
        var outcome = Reducers.ApplyToSession(sessA!, action);
        m.PutSession("host-a", "ahp-session:/s1", sessA!);

        Assert.Equal(ReduceOutcome.Applied, outcome);

        var (gotA, _) = m.Session("host-a", "ahp-session:/s1");
        var (gotB, _) = m.Session("host-b", "ahp-session:/s1");
        Assert.Equal("New on host-a", gotA!.Title);   // target session changed
        Assert.Equal("Old", gotB!.Title);             // collision-twin untouched
    }

    // ── G: forwards subscription event ─────────────────────────────────────

    [Fact]
    public void StateMirror_AppliesHostSubscriptionEvent()
    {
        // The host-tagged event shape carries hostId + channel + the underlying
        // subscription event through to consumers of MultiHostClient.Subscriptions().
        var envelope = new ActionEnvelope
        {
            Channel = "ahp-session:/s1",
            ServerSeq = 7,
            Action = new StateAction(new SessionTitleChangedAction
            {
                Type = ActionType.SessionTitleChanged,
                Title = "Hello",
            }),
        };
        SubscriptionEvent inner = new SubscriptionEventAction(envelope);

        var hostEv = new HostSubscriptionEvent(new HostId("host-a"), "ahp-session:/s1", inner);

        Assert.Equal(new HostId("host-a"), hostEv.HostId);
        Assert.Equal("ahp-session:/s1", hostEv.Channel);
        var action = Assert.IsType<SubscriptionEventAction>(hostEv.Event);
        Assert.Equal(7, action.Envelope.ServerSeq);
    }

    // ── G: reset host drops one ────────────────────────────────────────────

    [Fact]
    public void StateMirror_ResetHost_DropsOnlyThatHost()
    {
        var m = new MultiHostStateMirror();
        m.PutRoot("host-a", Root(1));
        m.PutSession("host-a", "ahp-session:/s1", Session("a"));
        m.PutRoot("host-b", Root(2));

        // DropHost is the .NET method name; the parity row calls this "Reset".
        m.DropHost("host-a");

        var (_, rootAFound) = m.Root("host-a");
        var (_, sessAFound) = m.Session("host-a", "ahp-session:/s1");
        var (gotB, rootBFound) = m.Root("host-b");

        Assert.False(rootAFound);    // host-a root gone
        Assert.False(sessAFound);    // host-a session gone
        Assert.True(rootBFound);     // host-b survives
        Assert.Equal(2, gotB!.ActiveSessions);
    }
}
