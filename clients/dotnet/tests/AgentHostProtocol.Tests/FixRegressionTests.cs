// Regression tests pinning the behaviors fixed after the adversarial review, so a
// future refactor that reintroduces a bug FAILS here rather than silently shipping.
// Each test maps to a confirmed finding from the review.
#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics.Metrics;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol.Hosts;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class FixRegressionTests
{
    // ── Subscription lifecycle: Close()/Dispose() must detach, regardless of teardown
    //    path (the subscriptions.active-gauge desync + _subscriptions registry leak fix). ──

    [Fact]
    public void Subscription_Close_RunsDetachHookExactlyOnce()
    {
        int detached = 0;
        var sub = new Subscription("ahp-session:/s1", 8);
        sub.OnClose(() => Interlocked.Increment(ref detached));
        sub.Close();
        sub.Close();   // idempotent
        sub.Dispose();
        Assert.Equal(1, detached);
    }

    [Fact]
    public async Task DirectSubscriptionClose_DetachesFromClientRegistry()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);

        var sub = client.AttachSubscription("ahp-session:/s1");
        Assert.Equal(1, client.SubscriptionCount);

        sub.Close();   // a direct Close() (not UnsubscribeAsync) must still detach
        Assert.Equal(0, client.SubscriptionCount);
    }

    // ── Back-pressure: each drop-oldest eviction is counted EXACTLY once via the BCL
    //    ItemDropped callback (replacing the racy Count-then-write probe). ──

    [Fact]
    public void BoundedDropOldestChannel_ReportsEachEvictionExactlyOnce()
    {
        int dropped = 0;
        var channel = new BoundedDropOldestChannel<int>(2, _ => Interlocked.Increment(ref dropped));
        for (int i = 0; i < 5; i++) channel.TrySend(i);   // capacity 2, 5 sends, no reader -> 3 evictions
        Assert.Equal(3, dropped);
    }

    // ── ClientConfig.Default is a fresh instance per access (no cross-consumer bleed). ──

    [Fact]
    public void ClientConfigDefault_ReturnsDistinctInstances()
    {
        var a = ClientConfig.Default;
        var b = ClientConfig.Default;
        Assert.NotSame(a, b);
        a.DefaultRequestTimeout = TimeSpan.FromSeconds(99);
        Assert.NotEqual(a.DefaultRequestTimeout, b.DefaultRequestTimeout);
    }

    // ── A request timeout is recorded as ahp.outcome="timeout", distinct from a caller
    //    cancellation ("cancelled") or a success ("ok"). ──

    [Fact]
    public async Task RequestTimeout_RecordsOutcomeTimeout()
    {
        var sawTimeout = false;
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (inst, l) =>
            {
                if (inst.Meter.Name == AhpTelemetry.Name) l.EnableMeasurementEvents(inst);
            },
        };
        meterListener.SetMeasurementEventCallback<double>((inst, _, tags, _) =>
        {
            if (inst.Name != "ahp.client.request.duration") return;
            foreach (var tag in tags)
                if (tag.Key == "ahp.outcome" && (tag.Value as string) == "timeout") sawTimeout = true;
        });
        meterListener.Start();

        var timeProvider = new FakeTimeProvider();
        var (clientSide, serverSide) = MemTransport.CreatePair();   // server never replies
        var cfg = new ClientConfig
        {
            DefaultRequestTimeout = TimeSpan.FromSeconds(30),
            TimeProvider = timeProvider,
        };
        await using var client = AhpClient.Connect(clientSide, cfg);

        var request = client.RequestAsync<object?, object?>(
            "noop",
            null,
            TestContext.Current.CancellationToken);
        await serverSide.ReceiveAsync(TestContext.Current.CancellationToken);
        timeProvider.Advance(TimeSpan.FromSeconds(30));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);

        Assert.True(sawTimeout, "request.duration should carry ahp.outcome=timeout when the default timeout fires");
    }

    [Fact]
    public async Task RequestTimeout_DoesNotCancelActiveTransportSend()
    {
        var timeProvider = new FakeTimeProvider();
        var transport = new ControlledSendTransport();
        await using var client = AhpClient.Connect(
            transport,
            new ClientConfig
            {
                DefaultRequestTimeout = TimeSpan.FromSeconds(30),
                TimeProvider = timeProvider,
            });

        var request = client.RequestAsync<object?, object?>(
            "slow-send",
            null,
            TestContext.Current.CancellationToken);
        await transport.FirstSendStarted.WaitAsync(TestContext.Current.CancellationToken);

        timeProvider.Advance(TimeSpan.FromSeconds(30));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
        Assert.False(transport.FirstSendCanceled.IsCompleted);

        transport.ReleaseFirstSend();
        await client.NotifyAsync("after-timeout", new { }, TestContext.Current.CancellationToken);
        Assert.Equal(2, transport.SendAttempts);
    }

    [Fact]
    public async Task RequestTimeout_SkipsCanceledQueuedSend()
    {
        var timeProvider = new FakeTimeProvider();
        var transport = new ControlledSendTransport();
        await using var client = AhpClient.Connect(
            transport,
            new ClientConfig
            {
                DefaultRequestTimeout = TimeSpan.FromSeconds(30),
                TimeProvider = timeProvider,
            });

        var firstSend = client.NotifyAsync(
            "blocking-send",
            new { },
            TestContext.Current.CancellationToken);
        await transport.FirstSendStarted.WaitAsync(TestContext.Current.CancellationToken);

        var request = client.RequestAsync<object?, object?>(
            "queued-request",
            null,
            TestContext.Current.CancellationToken);
        timeProvider.Advance(TimeSpan.FromSeconds(30));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);

        transport.ReleaseFirstSend();
        await firstSend;
        await client.NotifyAsync("after-timeout", new { }, TestContext.Current.CancellationToken);

        Assert.Equal(2, transport.SendAttempts);
    }

    [Fact]
    public async Task RequestTimeout_DuringSerialization_SkipsTransportSend()
    {
        var timeProvider = new FakeTimeProvider();
        var transport = new CountingTransport();
        var serializer = new BlockingEncodeSerializer();
        await using var client = AhpClient.Connect(
            transport,
            new ClientConfig
            {
                DefaultRequestTimeout = TimeSpan.FromSeconds(30),
                TimeProvider = timeProvider,
            },
            serializer);

        var request = client.RequestAsync<object?, object?>(
            "slow-serialization",
            null,
            TestContext.Current.CancellationToken);
        await serializer.EncodeStarted.WaitAsync(TestContext.Current.CancellationToken);

        try
        {
            timeProvider.Advance(TimeSpan.FromSeconds(30));
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
        }
        finally
        {
            serializer.ReleaseEncode();
        }
        await client.NotifyAsync("after-timeout", new { }, TestContext.Current.CancellationToken);

        Assert.Equal(1, transport.SendAttempts);
    }

    [Fact]
    public async Task InvalidRequestTimeout_DoesNotRegisterPendingRequest()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(
            clientSide,
            new ClientConfig { DefaultRequestTimeout = TimeSpan.MaxValue });
        var nextRequestId = client.NextRequestId;

        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() =>
            client.RequestAsync<object?, object?>(
                "invalid-timeout",
                null,
                TestContext.Current.CancellationToken));

        Assert.Equal(0, client.PendingRequestCount);
        Assert.Equal(nextRequestId, client.NextRequestId);
    }

    // ── Pre-existing fix: HostEntry.ApplySummaryChange is copy-on-write, so a snapshot
    //    already handed to a consumer is never mutated underneath it (torn-read fix). ──

    [Fact]
    public void ApplySummaryChange_DoesNotMutate_AlreadyTakenSnapshot()
    {
        var entry = new HostEntry(
            new HostId("h"),
            new HostConfig
            {
                Id = new HostId("h"),
                TransportFactory = (_, _) => throw new InvalidOperationException(),
            },
            "client-1");
        entry.PutSessionSummary(new SessionSummary
        {
            Resource = "ahp-session:/s1",
            Provider = "p",
            Title = "Original",
            CreatedAt = "2024-01-01T00:00:00.001Z",
            ModifiedAt = "2024-01-01T00:00:00.001Z",
        });

        var held = entry.Snapshot().SessionSummaries.Single(s => s.Resource == "ahp-session:/s1");
        Assert.Equal("Original", held.Title);

        entry.ApplySummaryChange("ahp-session:/s1", new PartialSessionSummary { Title = "Changed" });

        Assert.Equal("Original", held.Title);   // copy-on-write: the prior snapshot is immutable
        Assert.Equal("Changed",
            entry.Snapshot().SessionSummaries.Single(s => s.Resource == "ahp-session:/s1").Title);
    }

    // ── Upstream #254: SessionSummary._meta is a patchable field on
    //    root/sessionSummaryChanged — the merge overrides it when the patch carries
    //    it and otherwise carries the existing value over (mirrors the TS reducer's
    //    `if (changes._meta !== undefined) merged._meta = changes._meta`). ──

    [Fact]
    public void ApplySummaryChange_Meta_OverridesWhenPresent_CarriesOverWhenAbsent()
    {
        var entry = new HostEntry(
            new HostId("h"),
            new HostConfig
            {
                Id = new HostId("h"),
                TransportFactory = (_, _) => throw new InvalidOperationException(),
            },
            "client-1");
        var originalMeta = new Dictionary<string, JsonElement>
        {
            ["pinned"] = JsonDocument.Parse("true").RootElement,
        };
        entry.PutSessionSummary(new SessionSummary
        {
            Resource = "ahp-session:/s1",
            Provider = "p",
            Title = "Original",
            CreatedAt = "2024-01-01T00:00:00.001Z",
            ModifiedAt = "2024-01-01T00:00:00.001Z",
            Meta = originalMeta,
        });

        // Patch that omits _meta keeps the existing metadata.
        entry.ApplySummaryChange("ahp-session:/s1", new PartialSessionSummary { Title = "Changed" });
        var afterTitleOnly = entry.Snapshot().SessionSummaries.Single(s => s.Resource == "ahp-session:/s1");
        Assert.Equal("Changed", afterTitleOnly.Title);
        Assert.NotNull(afterTitleOnly.Meta);
        Assert.True(afterTitleOnly.Meta!["pinned"].GetBoolean());

        // Patch that carries _meta overrides it.
        var newMeta = new Dictionary<string, JsonElement>
        {
            ["pinned"] = JsonDocument.Parse("false").RootElement,
        };
        entry.ApplySummaryChange("ahp-session:/s1", new PartialSessionSummary { Meta = newMeta });
        var afterMetaPatch = entry.Snapshot().SessionSummaries.Single(s => s.Resource == "ahp-session:/s1");
        Assert.NotNull(afterMetaPatch.Meta);
        Assert.False(afterMetaPatch.Meta!["pinned"].GetBoolean());
    }

    // ── Upstream drift port (model config widened to JSON primitives; SessionModelInfo
    //    token-limit fields). ModelSelection.Config + ConfigPropertySchema.Enum carry
    //    arbitrary JSON primitives (not just strings), so a numeric/boolean picker value
    //    must round-trip as-is. Falsifies a revert to Dictionary<string,string> /
    //    List<string> (which can't hold a number) or a drop of the new token fields. ──

    [Fact]
    public void ModelSelection_Config_CarriesNonStringJsonPrimitives()
    {
        var selection = new ModelSelection
        {
            Id = "gpt-5",
            Config = new Dictionary<string, JsonElement>
            {
                ["preset"] = JsonDocument.Parse("\"fast\"").RootElement,
                ["temperature"] = JsonDocument.Parse("0.7").RootElement,
                ["stream"] = JsonDocument.Parse("true").RootElement,
            },
        };

        string json = SystemTextJsonAhpSerializer.Default.Serialize(selection);
        var back = SystemTextJsonAhpSerializer.Default.Deserialize<ModelSelection>(json);

        Assert.NotNull(back!.Config);
        Assert.Equal("fast", back.Config!["preset"].GetString());
        Assert.Equal(0.7, back.Config["temperature"].GetDouble());
        Assert.True(back.Config["stream"].GetBoolean());
    }

    [Fact]
    public void SessionModelInfo_RoundTripsOutputAndPromptTokenLimits()
    {
        var info = new SessionModelInfo
        {
            Id = "gpt-5",
            Provider = "openai",
            Name = "GPT-5",
            MaxContextWindow = 200_000,
            MaxOutputTokens = 32_000,
            MaxPromptTokens = 168_000,
        };

        string json = SystemTextJsonAhpSerializer.Default.Serialize(info);
        var back = SystemTextJsonAhpSerializer.Default.Deserialize<SessionModelInfo>(json);

        Assert.Equal(32_000, back!.MaxOutputTokens);
        Assert.Equal(168_000, back.MaxPromptTokens);
        Assert.Equal(200_000, back.MaxContextWindow);
    }

    // ── Pre-existing fix: MultiHostStateMirror carries the Chat dimension (Go parity),
    //    and both drop paths (DropResource, DropHost) cover it. ──

    [Fact]
    public void MultiHostStateMirror_StoresAndDropsChatSnapshots()
    {
        var mirror = new MultiHostStateMirror();
        var chat = new ChatState { Resource = "ahp-session:/s1#chat", Title = "c1", ModifiedAt = "0", Turns = new() };

        mirror.PutChat("host-a", "ahp-session:/s1#chat", chat);
        Assert.True(mirror.Chat("host-a", "ahp-session:/s1#chat").Found);
        Assert.Same(chat, mirror.Chat("host-a", "ahp-session:/s1#chat").Value);

        mirror.DropResource("host-a", "ahp-session:/s1#chat");
        Assert.False(mirror.Chat("host-a", "ahp-session:/s1#chat").Found);

        mirror.PutChat("host-b", "ahp-session:/s2#chat", chat);
        mirror.DropHost("host-b");
        Assert.False(mirror.Chat("host-b", "ahp-session:/s2#chat").Found);
    }

    // ── Pre-existing fix: CreateEventStream / CreateStateChangeStream detach on dispose,
    //    so an abandoned stream leaves the client's fan-out list (no per-stream leak). ──

    [Fact]
    public async Task EventStream_Dispose_DetachesFromClientFanout()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);

        var stream = client.CreateEventStream();
        Assert.Equal(1, client.EventListenerCount);

        stream.Dispose();
        Assert.Equal(0, client.EventListenerCount);   // detached, not leaked
    }

    [Fact]
    public async Task StateChangeStream_Dispose_DetachesFromClientFanout()
    {
        var (clientSide, _) = MemTransport.CreatePair();
        await using var client = AhpClient.Connect(clientSide);

        var stream = client.CreateStateChangeStream();
        Assert.Equal(1, client.StateListenerCount);

        stream.Dispose();
        Assert.Equal(0, client.StateListenerCount);   // detached, not leaked
    }

    // ── Multiple active clients per session (microsoft/agent-host-protocol#261):
    //    activeClient? -> activeClients[]. Sequential session/activeClientSet upserts
    //    keyed by clientId build a multi-client list; session/activeClientRemoved
    //    removes by clientId (no-op on miss). Falsifies a revert to a single-value
    //    field or a broken upsert that appends duplicates instead of replacing. ──
    [Fact]
    public void SessionActiveClients_SetUpsertsByClientId_RemoveDropsByClientId()
    {
        var state = new SessionState
        {
            Provider = "copilot",
            Title = "s",
            Lifecycle = SessionLifecycle.Ready,
            ActiveClients = new(),
            Chats = new(),
        };

        SessionActiveClient Client(string id, string name) =>
            new() { ClientId = id, DisplayName = name, Tools = new() };

        // SET a, then SET b — both coexist (the headline #261 capability).
        Reducers.ApplyToSession(state, new StateAction(new SessionActiveClientSetAction
        {
            Type = ActionType.SessionActiveClientSet,
            ActiveClient = Client("vscode-1", "VS Code"),
        }));
        Reducers.ApplyToSession(state, new StateAction(new SessionActiveClientSetAction
        {
            Type = ActionType.SessionActiveClientSet,
            ActiveClient = Client("cli-1", "CLI"),
        }));
        Assert.Equal(new[] { "vscode-1", "cli-1" }, state.ActiveClients.Select(c => c.ClientId));

        // SET vscode-1 again — upsert replaces in place (length stays 2, not 3).
        Reducers.ApplyToSession(state, new StateAction(new SessionActiveClientSetAction
        {
            Type = ActionType.SessionActiveClientSet,
            ActiveClient = Client("vscode-1", "VS Code Insiders"),
        }));
        Assert.Equal(2, state.ActiveClients.Count);
        Assert.Equal("VS Code Insiders", state.ActiveClients.Single(c => c.ClientId == "vscode-1").DisplayName);

        // REMOVE vscode-1 — leaves cli-1.
        var removed = Reducers.ApplyToSession(state, new StateAction(new SessionActiveClientRemovedAction
        {
            Type = ActionType.SessionActiveClientRemoved,
            ClientId = "vscode-1",
        }));
        Assert.Equal(ReduceOutcome.Applied, removed);
        Assert.Equal(new[] { "cli-1" }, state.ActiveClients.Select(c => c.ClientId));

        // REMOVE unknown — no-op, list unchanged.
        var noop = Reducers.ApplyToSession(state, new StateAction(new SessionActiveClientRemovedAction
        {
            Type = ActionType.SessionActiveClientRemoved,
            ClientId = "ghost",
        }));
        Assert.Equal(ReduceOutcome.NoOp, noop);
        Assert.Single(state.ActiveClients);
    }

    // ── Optional tool invocation intention (microsoft/agent-host-protocol#283):
    //    ToolCallBase + ChatToolCallStartAction gain optional `intention?`. The
    //    reducer sets it on tool-call-start and carries it through every tool-call
    //    transition (the ToolCallCommon helper). The canonical corpus (fixture 019)
    //    covers the happy-path lifecycle start→…→complete; no fixture drives a
    //    non-null intention into a CANCELLED state, so this locks that path: EndTurn
    //    force-cancelling a streaming tool call must preserve the intention onto the
    //    resulting ToolCallCancelledState. Falsifies a revert of either the
    //    start-set (a.Intention) or the ToolCallCommon carry. ──
    [Fact]
    public void ToolCallIntention_CarriesFromStartThroughForcedCancel()
    {
        var chat = new ChatState { Resource = "ahp-session:/s1#chat", Title = "c1", ModifiedAt = "0", Turns = new() };
        var msg = new Message { Text = "list files", Origin = new MessageOrigin { Kind = MessageKind.User } };

        Reducers.ApplyToChat(chat, new StateAction(new ChatTurnStartedAction
        {
            Type = ActionType.ChatTurnStarted,
            TurnId = "t1",
            StartedAt = "2026-01-01T00:00:00.000Z",
            Message = msg,
        }));
        Reducers.ApplyToChat(chat, new StateAction(new ChatToolCallStartAction
        {
            Type = ActionType.ChatToolCallStart,
            TurnId = "t1",
            ToolCallId = "tc1",
            ToolName = "ls",
            DisplayName = "List",
            Intention = "List the files in the current directory",
        }));

        // Force-cancel the turn — the in-progress streaming tool call is cancelled via EndTurn.
        Reducers.ApplyToChat(chat, new StateAction(new ChatTurnCancelledAction
        {
            Type = ActionType.ChatTurnCancelled,
            TurnId = "t1",
        }));

        var part = Assert.IsType<ToolCallResponsePart>(chat.Turns.Single().ResponseParts.Single().Value);
        var cancelled = Assert.IsType<ToolCallCancelledState>(part.ToolCall.Value);
        Assert.Equal("List the files in the current directory", cancelled.Intention);
    }

    // ── Changeset file review state (microsoft/agent-host-protocol#328):
    //    ChangesetFile carries optional `reviewed?`, and the client-dispatchable
    //    changeset/filesReviewChanged sets it on every listed file (`files`). The
    //    shared corpus (fixtures 225–227, filesReviewChanged marks/clears/no-op)
    //    drives the resulting STATE, but RunFixture ignores the ReduceOutcome — so
    //    it cannot tell Applied from NoOp. This locks the outcome contract: a real
    //    flip is Applied, an already-in-target file or an unmatched id is a NoOp,
    //    and unknown ids are ignored. Falsifies a reducer that always returns
    //    Applied (dropping the change-detection the canonical TypeScript reducer
    //    performs). ──
    [Fact]
    public void ChangesetFilesReviewChanged_SetsReviewed_NoOpWhenUnchanged()
    {
        ChangesetFile File(string id, bool? reviewed) =>
            new() { Id = id, Edit = new FileEdit(), Reviewed = reviewed };

        var state = new ChangesetState
        {
            Status = ChangesetStatus.Ready,
            Files = new List<ChangesetFile> { File("a", null), File("b", true) },
        };

        // Mark "a" reviewed — one file flips → Applied; "b" is already true.
        var applied = Reducers.ApplyToChangeset(state, new StateAction(new ChangesetFilesReviewChangedAction
        {
            Type = ActionType.ChangesetFilesReviewChanged,
            Files = new List<string> { "a" },
            Reviewed = true,
        }));
        Assert.Equal(ReduceOutcome.Applied, applied);
        Assert.True(state.Files.Single(f => f.Id == "a").Reviewed == true);
        Assert.True(state.Files.Single(f => f.Id == "b").Reviewed == true);

        // Re-mark "a" + "b" reviewed=true — both already true → NoOp, no state change.
        var noop = Reducers.ApplyToChangeset(state, new StateAction(new ChangesetFilesReviewChangedAction
        {
            Type = ActionType.ChangesetFilesReviewChanged,
            Files = new List<string> { "a", "b" },
            Reviewed = true,
        }));
        Assert.Equal(ReduceOutcome.NoOp, noop);

        // An id that matches no current file → NoOp, and matching files untouched.
        var unknown = Reducers.ApplyToChangeset(state, new StateAction(new ChangesetFilesReviewChangedAction
        {
            Type = ActionType.ChangesetFilesReviewChanged,
            Files = new List<string> { "missing" },
            Reviewed = false,
        }));
        Assert.Equal(ReduceOutcome.NoOp, unknown);
        Assert.True(state.Files.Single(f => f.Id == "a").Reviewed == true);
    }

    // ── MCP server start/stop requests (microsoft/agent-host-protocol#319):
    //    session/mcpServerStartRequested optimistically moves the target
    //    McpServerCustomization to `starting`; session/mcpServerStopRequested to
    //    `stopped`. Both clear any previous `channel` and are client-dispatchable.
    //    The shared corpus fixtures (235-239) compare resulting STATE, but
    //    RunFixture ignores the ReduceOutcome — so this test pins Applied-vs-NoOp
    //    (a start on a missing id must NoOp, not silently claim Applied) and the
    //    dispatchability predicate, which the corpus cannot. ──
    [Fact]
    public void SessionMcpServerStartStopRequested_TransitionsStateClearsChannel_NoOpOnMiss()
    {
        McpServerCustomization Server(string id) => new()
        {
            Type = CustomizationType.McpServer,
            Id = id,
            Uri = "file:///workspace/.mcp/servers.json",
            Name = "Filesystem",
            State = new McpServerState(new McpServerReadyState { Kind = McpServerStatus.Ready }),
            Channel = "mcp://filesystem",
        };

        var state = new SessionState
        {
            Provider = "copilot",
            Title = "s",
            Lifecycle = SessionLifecycle.Ready,
            ActiveClients = new(),
            Chats = new(),
            Customizations = new() { new Customization(Server("mcp-1")) },
        };

        McpServerCustomization Current() => (McpServerCustomization)state.Customizations!.Single().Value!;

        // START moves the ready server to `starting` and clears its channel.
        var started = Reducers.ApplyToSession(state, new StateAction(new SessionMcpServerStartRequestedAction
        {
            Type = ActionType.SessionMcpServerStartRequested,
            Id = "mcp-1",
        }));
        Assert.Equal(ReduceOutcome.Applied, started);
        Assert.IsType<McpServerStartingState>(Current().State.Value);
        Assert.Null(Current().Channel);

        // STOP moves it to `stopped` (channel already null; stays null).
        var stopped = Reducers.ApplyToSession(state, new StateAction(new SessionMcpServerStopRequestedAction
        {
            Type = ActionType.SessionMcpServerStopRequested,
            Id = "mcp-1",
        }));
        Assert.Equal(ReduceOutcome.Applied, stopped);
        Assert.IsType<McpServerStoppedState>(Current().State.Value);

        // START on an unknown id → NoOp, target untouched.
        var miss = Reducers.ApplyToSession(state, new StateAction(new SessionMcpServerStartRequestedAction
        {
            Type = ActionType.SessionMcpServerStartRequested,
            Id = "ghost",
        }));
        Assert.Equal(ReduceOutcome.NoOp, miss);
        Assert.IsType<McpServerStoppedState>(Current().State.Value);

        // Both requests are client-dispatchable (unlike session/mcpServerStateChanged).
        Assert.True(Reducers.IsClientDispatchable(new StateAction(new SessionMcpServerStartRequestedAction
        {
            Type = ActionType.SessionMcpServerStartRequested,
            Id = "mcp-1",
        })));
        Assert.True(Reducers.IsClientDispatchable(new StateAction(new SessionMcpServerStopRequestedAction
        {
            Type = ActionType.SessionMcpServerStopRequested,
            Id = "mcp-1",
        })));
    }

    // ── session/mcpServerBackgroundRequested optimistically clears `blocking` on a
    //    blocking `starting` server and is a no-op otherwise. The corpus fixtures
    //    (274-276) compare STATE only; this pins Applied-vs-NoOp. ──
    [Fact]
    public void SessionMcpServerBackgroundRequested_ClearsBlocking_NoOpOtherwise()
    {
        var state = new SessionState
        {
            Provider = "copilot",
            Title = "s",
            Lifecycle = SessionLifecycle.Ready,
            ActiveClients = new(),
            Chats = new(),
            Customizations = new()
            {
                new Customization(new McpServerCustomization
                {
                    Type = CustomizationType.McpServer,
                    Id = "mcp-1",
                    Uri = "file:///workspace/.mcp/servers.json",
                    Name = "Filesystem",
                    State = new McpServerState(new McpServerStartingState { Kind = McpServerStatus.Starting, Blocking = true }),
                }),
            },
        };

        McpServerCustomization Current() => (McpServerCustomization)state.Customizations!.Single().Value!;
        ReduceOutcome Background(string id) => Reducers.ApplyToSession(state, new StateAction(new SessionMcpServerBackgroundRequestedAction
        {
            Type = ActionType.SessionMcpServerBackgroundRequested,
            Id = id,
        }));

        Assert.Equal(ReduceOutcome.Applied, Background("mcp-1"));
        Assert.False(Assert.IsType<McpServerStartingState>(Current().State.Value).Blocking);

        // Already unblocked → NoOp.
        Assert.Equal(ReduceOutcome.NoOp, Background("mcp-1"));

        // Unknown id → NoOp.
        Assert.Equal(ReduceOutcome.NoOp, Background("missing"));

        Assert.True(Reducers.IsClientDispatchable(new StateAction(new SessionMcpServerBackgroundRequestedAction
        {
            Type = ActionType.SessionMcpServerBackgroundRequested,
            Id = "mcp-1",
        })));
    }

    // ── MCP tool call authentication (microsoft/agent-host-protocol#336): a running
    //    MCP-contributed tool call pauses in `auth-required` and resumes on
    //    `chat/toolCallAuthResolved`. The canonical corpus covers the state transitions
    //    thoroughly (fixtures 243-255), but every fixture drives the reducer through
    //    the wire types only — it can't reach `Reducers.IsClientDispatchable`, and the
    //    harness discards the returned ReduceOutcome. This pins the two things the
    //    corpus structurally cannot: that neither action is client-dispatchable, and
    //    that a genuinely-absent target is reported as NoOp.
    //
    //    Note the guards below (successful-complete from `auth-required`, a non-MCP
    //    contributor, a second resolve) are asserted on the resulting STATE, not on
    //    ReduceOutcome: `UpdateToolCall` reports Applied whenever it FINDS the target
    //    tool call, whether or not the updater changed it — the same convention the
    //    Rust client's `update_tool_call` uses. The rejection is observable as the
    //    state that survives it. ──
    [Fact]
    public void ChatToolCallAuth_RejectsInvalidTransitions_AndIsNotClientDispatchable()
    {
        static ChatState RunningMcpToolCall(ToolCallContributor? contributor)
        {
            var chat = new ChatState { Resource = "ahp-session:/s1#chat", Title = "c1", ModifiedAt = "0", Turns = new() };
            Reducers.ApplyToChat(chat, new StateAction(new ChatTurnStartedAction
            {
                Type = ActionType.ChatTurnStarted,
                TurnId = "t1",
                StartedAt = "2026-01-01T00:00:00.000Z",
                Message = new Message { Text = "search", Origin = new MessageOrigin { Kind = MessageKind.User } },
            }));
            Reducers.ApplyToChat(chat, new StateAction(new ChatToolCallStartAction
            {
                Type = ActionType.ChatToolCallStart,
                TurnId = "t1",
                ToolCallId = "tc1",
                ToolName = "search",
                DisplayName = "Search",
                Contributor = contributor,
            }));
            Reducers.ApplyToChat(chat, new StateAction(new ChatToolCallReadyAction
            {
                Type = ActionType.ChatToolCallReady,
                TurnId = "t1",
                ToolCallId = "tc1",
                InvocationMessage = StringOrMarkdown.FromPlain("Search: foo"),
                Confirmed = ToolCallConfirmationReason.NotNeeded,
            }));
            return chat;
        }

        static ToolCallState ToolCallOf(ChatState chat) =>
            ((ToolCallResponsePart)chat.ActiveTurn!.ResponseParts.Single().Value!).ToolCall;

        var auth = new McpAuthRequirement
        {
            Reason = McpAuthRequiredReason.Required,
            Resource = new ProtectedResourceMetadata { Resource = "https://mcp.example.com" },
        };

        StateAction AuthRequired() => new(new ChatToolCallAuthRequiredAction
        {
            Type = ActionType.ChatToolCallAuthRequired,
            TurnId = "t1",
            ToolCallId = "tc1",
            Auth = auth,
        });

        StateAction AuthResolved() => new(new ChatToolCallAuthResolvedAction
        {
            Type = ActionType.ChatToolCallAuthResolved,
            TurnId = "t1",
            ToolCallId = "tc1",
        });

        var mcp = new ToolCallContributor(new ToolCallMcpContributor
        {
            Kind = ToolCallContributorKind.MCP,
            CustomizationId = "mcp-1",
        });

        // A running MCP tool call accepts the challenge.
        ChatState chat = RunningMcpToolCall(mcp);
        Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToChat(chat, AuthRequired()));
        Assert.IsType<ToolCallAuthRequiredState>(ToolCallOf(chat).Value);

        // `auth-required` blocks the session, so the chat reports InputNeeded.
        Assert.Equal(SessionStatus.InputNeeded, chat.Status & SessionStatus.InputNeeded);

        // A SUCCESSFUL completion from `auth-required` is invalid — execution never
        // resumed after the challenge, so nothing could have produced a real result.
        // It is rejected: the tool call is still waiting on auth afterwards.
        Reducers.ApplyToChat(chat, new StateAction(new ChatToolCallCompleteAction
        {
            Type = ActionType.ChatToolCallComplete,
            TurnId = "t1",
            ToolCallId = "tc1",
            Result = new ToolCallResult { Success = true, PastTenseMessage = StringOrMarkdown.FromPlain("Searched") },
        }));
        Assert.IsType<ToolCallAuthRequiredState>(ToolCallOf(chat).Value);

        // Resolving returns it to `running`, restoring the pre-auth confirmation context.
        Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToChat(chat, AuthResolved()));
        var resumed = Assert.IsType<ToolCallRunningState>(ToolCallOf(chat).Value);
        Assert.Equal(ToolCallConfirmationReason.NotNeeded, resumed.Confirmed);

        // A second resolve has nothing to resume — the call stays `running`.
        Reducers.ApplyToChat(chat, AuthResolved());
        Assert.IsType<ToolCallRunningState>(ToolCallOf(chat).Value);

        // The challenge only applies to MCP-contributed tool calls: a client-contributed
        // one (and one with no contributor at all) stays `running`.
        ChatState clientTool = RunningMcpToolCall(new ToolCallContributor(new ToolCallClientContributor
        {
            Kind = ToolCallContributorKind.Client,
            ClientId = "client-1",
        }));
        Reducers.ApplyToChat(clientTool, AuthRequired());
        Assert.IsType<ToolCallRunningState>(ToolCallOf(clientTool).Value);

        ChatState noContributor = RunningMcpToolCall(null);
        Reducers.ApplyToChat(noContributor, AuthRequired());
        Assert.IsType<ToolCallRunningState>(ToolCallOf(noContributor).Value);

        // An absent target really is a NoOp — nothing was found to update.
        Assert.Equal(ReduceOutcome.NoOp, Reducers.ApplyToChat(chat, new StateAction(new ChatToolCallAuthRequiredAction
        {
            Type = ActionType.ChatToolCallAuthRequired,
            TurnId = "t1",
            ToolCallId = "ghost",
            Auth = auth,
        })));

        // Both actions are server-dispatched only — a client resolves the challenge by
        // pushing a token via the `authenticate` command, never by dispatching these.
        Assert.False(Reducers.IsClientDispatchable(AuthRequired()));
        Assert.False(Reducers.IsClientDispatchable(AuthResolved()));
    }

    // ── #338: input requests are LIVE response parts. ──
    //
    // These pin the Applied-vs-NoOp outcomes and the in-place-update invariant, which
    // the shared fixture corpus structurally cannot express: the fixture runner asserts
    // over resulting STATE only, so it cannot distinguish "the reducer NoOp'd" from
    // "the reducer applied a change that happened to be identity", nor "resolved the
    // part in place" from "removed it and appended an identical one at the same index".

    private static ChatState ChatForInput(bool withActiveTurn)
    {
        var state = new ChatState
        {
            Resource = "chat://c1",
            Title = "chat",
            ModifiedAt = "2024-01-01T00:00:00.000Z",
            Status = SessionStatus.Idle,
            Turns = new List<Turn>(),
        };
        if (withActiveTurn)
        {
            state.ActiveTurn = new ActiveTurn
            {
                Id = "t1",
                StartedAt = "2026-01-01T00:00:00.000Z",
                Message = new Message
                {
                    Text = "go",
                    Origin = new MessageOrigin { Kind = MessageKind.User },
                },
                ResponseParts = new List<ResponsePart>(),
            };
        }

        return state;
    }

    private static ChatInputAnswer TextAnswer(string value) => new(new ChatInputAnswered
    {
        State = ChatInputAnswerState.Draft,
        Value = new ChatInputAnswerValue(new ChatInputTextAnswerValue
        {
            Kind = ChatInputAnswerValueKind.Text,
            Value = value,
        }),
    });

    private static StateAction InputRequested(
        string id,
        Dictionary<string, ChatInputAnswer>? answers = null) =>
        new(new ChatInputRequestedAction
        {
            Type = ActionType.ChatInputRequested,
            Request = new ChatInputRequest { Id = id, Message = "Proceed?", Answers = answers },
        });

    private static InputRequestResponsePart InputPartAt(ChatState state, int index) =>
        Assert.IsType<InputRequestResponsePart>(state.ActiveTurn!.ResponseParts[index].Value);

    // An input request is turn-scoped state. With no active turn there is nowhere to
    // put the part, so the action is a NoOp rather than a silently-dropped Applied.
    [Fact]
    public void ChatInputRequested_WithoutActiveTurn_IsNoOp()
    {
        ChatState state = ChatForInput(withActiveTurn: false);

        Assert.Equal(ReduceOutcome.NoOp, Reducers.ApplyToChat(state, InputRequested("req-1")));
        Assert.Null(state.ActiveTurn);
        // A NoOp must not touch the chat's derived surfaces either.
        Assert.Equal(SessionStatus.Idle, state.Status);
        Assert.Equal("2024-01-01T00:00:00.000Z", state.ModifiedAt);
    }

    // Re-requesting the same id REPLACES the open part where it already sits rather
    // than appending a second one — the request's stream position is stable — and
    // answer drafts survive a re-request that omits them.
    [Fact]
    public void ChatInputRequested_SameId_ReplacesInPlaceAndPreservesAnswers()
    {
        ChatState state = ChatForInput(withActiveTurn: true);

        // A markdown part ahead of the request pins the request's stream index at 1:
        // an append-instead-of-replace bug would move it to index 2.
        state.ActiveTurn!.ResponseParts.Add(new ResponsePart(new MarkdownResponsePart
        {
            Kind = ResponsePartKind.Markdown,
            Id = "p0",
            Content = "thinking",
        }));

        Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToChat(
            state,
            InputRequested("req-1", new Dictionary<string, ChatInputAnswer> { ["q1"] = TextAnswer("draft") })));
        Assert.Equal(2, state.ActiveTurn.ResponseParts.Count);

        // A re-request omitting `answers` keeps the synced draft.
        Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToChat(state, InputRequested("req-1")));
        Assert.Equal(2, state.ActiveTurn.ResponseParts.Count);
        InputRequestResponsePart part = InputPartAt(state, 1);
        Assert.Equal("req-1", part.Request.Id);
        Assert.Null(part.Response);
        Assert.Equal("draft", Assert.IsType<ChatInputTextAnswerValue>(
            Assert.IsType<ChatInputAnswered>(part.Request.Answers!["q1"].Value).Value.Value).Value);

        // A re-request that DOES carry answers replaces the draft outright.
        Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToChat(
            state,
            InputRequested("req-1", new Dictionary<string, ChatInputAnswer> { ["q1"] = TextAnswer("fresh") })));
        Assert.Equal(2, state.ActiveTurn.ResponseParts.Count);
        Assert.Equal("fresh", Assert.IsType<ChatInputTextAnswerValue>(
            Assert.IsType<ChatInputAnswered>(InputPartAt(state, 1).Request.Answers!["q1"].Value).Value.Value).Value);

        // A DIFFERENT id appends rather than replacing.
        Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToChat(state, InputRequested("req-2")));
        Assert.Equal(3, state.ActiveTurn.ResponseParts.Count);
    }

    // Completion resolves the EXISTING part in place: no append, no removal, same index.
    // The action's answers override the synced drafts question-by-question.
    [Fact]
    public void ChatInputCompleted_ResolvesExistingPartInPlace()
    {
        ChatState state = ChatForInput(withActiveTurn: true);
        Reducers.ApplyToChat(state, InputRequested("req-1", new Dictionary<string, ChatInputAnswer>
        {
            ["q1"] = TextAnswer("kept"),
            ["q2"] = TextAnswer("stale"),
        }));
        Assert.Single(state.ActiveTurn!.ResponseParts);

        // A part streamed in AFTER the request pins the request at index 0. Without a
        // trailing part, a remove-and-append regression would re-land the resolved part
        // at the same index and this test could not see it.
        state.ActiveTurn.ResponseParts.Add(new ResponsePart(new MarkdownResponsePart
        {
            Kind = ResponsePartKind.Markdown,
            Id = "p1",
            Content = "after",
        }));

        ReduceOutcome outcome = Reducers.ApplyToChat(state, new StateAction(new ChatInputCompletedAction
        {
            Type = ActionType.ChatInputCompleted,
            RequestId = "req-1",
            Response = ChatInputResponseKind.Accept,
            Answers = new Dictionary<string, ChatInputAnswer> { ["q2"] = TextAnswer("submitted") },
        }));

        Assert.Equal(ReduceOutcome.Applied, outcome);
        Assert.Equal(2, state.ActiveTurn.ResponseParts.Count);   // updated, not appended
        // Stream position is stable: the request is still ahead of the part that
        // followed it, and the trailing part has not shifted.
        InputRequestResponsePart part = InputPartAt(state, 0);
        Assert.Equal("p1", Assert.IsType<MarkdownResponsePart>(
            state.ActiveTurn.ResponseParts[1].Value).Id);
        Assert.Equal(ChatInputResponseKind.Accept, part.Response);
        // The un-overridden draft survives; the overridden one takes the action's value.
        Assert.Equal("kept", Assert.IsType<ChatInputTextAnswerValue>(
            Assert.IsType<ChatInputAnswered>(part.Request.Answers!["q1"].Value).Value.Value).Value);
        Assert.Equal("submitted", Assert.IsType<ChatInputTextAnswerValue>(
            Assert.IsType<ChatInputAnswered>(part.Request.Answers["q2"].Value).Value.Value).Value);

        // The part is now resolved, so it is no longer OPEN: a second completion — and
        // a re-request reusing the id — must not reopen or mutate it.
        Assert.Equal(ReduceOutcome.NoOp, Reducers.ApplyToChat(state, new StateAction(new ChatInputCompletedAction
        {
            Type = ActionType.ChatInputCompleted,
            RequestId = "req-1",
            Response = ChatInputResponseKind.Cancel,
        })));
        Assert.Equal(ChatInputResponseKind.Accept, InputPartAt(state, 0).Response);

        // A re-request reusing a RESOLVED id does not reopen it — the resolved part is
        // not "open", so no part matches and a second, distinct open part is appended.
        // Duplicate request ids across parts are expected. Nothing in the shared corpus
        // pins this, so all five clients agreeing on it rests on this test locally.
        Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToChat(state, InputRequested("req-1")));
        Assert.Equal(3, state.ActiveTurn.ResponseParts.Count);   // appended a NEW open part
        Assert.Equal(ChatInputResponseKind.Accept, InputPartAt(state, 0).Response);
        Assert.Null(InputPartAt(state, 2).Response);
    }

    // The #338 headline: an unresolved request is no longer discarded when the turn
    // ends — it stays in the completed turn's transcript with `response` absent.
    // Pre-#338 the reducer deleted the live `inputRequests` surface on endTurn.
    [Fact]
    public void ChatTurnComplete_KeepsUnresolvedInputRequestPart()
    {
        ChatState state = ChatForInput(withActiveTurn: true);
        Reducers.ApplyToChat(state, InputRequested("req-1"));
        Assert.Equal(SessionStatus.InputNeeded, state.Status & (SessionStatus)((1u << 5) - 1));

        ReduceOutcome outcome = Reducers.ApplyToChat(state, new StateAction(new ChatTurnCompleteAction
        {
            Type = ActionType.ChatTurnComplete,
            TurnId = "t1",
            Duration = 5,
        }));

        Assert.Equal(ReduceOutcome.Applied, outcome);
        Assert.Null(state.ActiveTurn);
        Turn turn = Assert.Single(state.Turns);
        ResponsePart part = Assert.Single(turn.ResponseParts);
        var recorded = Assert.IsType<InputRequestResponsePart>(part.Value);
        Assert.Equal("req-1", recorded.Request.Id);
        Assert.Null(recorded.Response);   // survives UNRESOLVED

        // The open request no longer drives status once the turn is over: status is
        // derived from the ACTIVE turn only, so a completed turn's unresolved part
        // does not pin the chat at InputNeeded forever.
        Assert.Equal(SessionStatus.Idle, state.Status & (SessionStatus)((1u << 5) - 1));
    }

    // An OPEN request drives InputNeeded; resolving it releases the status.
    [Fact]
    public void OpenInputRequest_DrivesInputNeededStatus_ResolvedDoesNot()
    {
        const SessionStatus activityMask = (SessionStatus)((1u << 5) - 1);
        ChatState state = ChatForInput(withActiveTurn: false);
        state.Status = SessionStatus.Idle | SessionStatus.IsRead;

        // Baseline: an active turn with no open request is merely InProgress.
        Reducers.ApplyToChat(state, new StateAction(new ChatTurnStartedAction
        {
            Type = ActionType.ChatTurnStarted,
            TurnId = "t1",
            StartedAt = "2026-01-01T00:00:00.000Z",
            Message = new Message
            {
                Text = "go",
                Origin = new MessageOrigin { Kind = MessageKind.User },
            },
        }));
        Assert.Equal(SessionStatus.InProgress, state.Status & activityMask);

        Reducers.ApplyToChat(state, InputRequested("req-1"));
        Assert.Equal(SessionStatus.InputNeeded, state.Status & activityMask);
        // `chat/inputRequested` also clears IsRead — a new question is unread. The
        // shared fixture corpus never seeds IsRead, so nothing else pins this.
        Assert.Equal((SessionStatus)0, state.Status & SessionStatus.IsRead);

        Reducers.ApplyToChat(state, new StateAction(new ChatInputCompletedAction
        {
            Type = ActionType.ChatInputCompleted,
            RequestId = "req-1",
            Response = ChatInputResponseKind.Decline,
        }));

        // Resolved: the part stays in the stream but no longer counts as open, so the
        // chat falls back to InProgress (the turn is still active).
        Assert.NotNull(InputPartAt(state, 0).Response);
        Assert.Equal(SessionStatus.InProgress, state.Status & activityMask);
    }

    // ── #338 input-request upsert must NOT mutate the caller's action. ──
    //    ChatInputRequest is a `sealed class` (reference type) and the reducer receives
    //    ChatInputRequestedAction.Request BY REFERENCE, so the old
    //    `req.Answers ??= existing.Request.Answers;` wrote the surviving answer drafts
    //    straight back into the action object AND aliased one dictionary across the
    //    action and the stored response part. No shared fixture catches this: the corpus
    //    only asserts the resulting STATE, never that the action survived untouched.
    //    Every sibling client is structurally immune -- Rust takes the request by move,
    //    Go and Swift are value types, TypeScript and Kotlin copy explicitly -- which is
    //    why C# is the only implementation that needed an explicit copy.
    [Fact]
    public void InputRequestUpsert_DoesNotMutateTheCallerAction()
    {
        var chat = new ChatState { Resource = "ahp-session:/s1#chat", Title = "c1", ModifiedAt = "0", Turns = new() };
        Reducers.ApplyToChat(chat, new StateAction(new ChatTurnStartedAction
        {
            Type = ActionType.ChatTurnStarted,
            TurnId = "t1",
            StartedAt = "2026-01-01T00:00:00.000Z",
            Message = new Message { Text = "ask me", Origin = new MessageOrigin { Kind = MessageKind.User } },
        }));

        // First request carries an answer draft.
        var answers = new Dictionary<string, ChatInputAnswer> { ["q1"] = TextAnswer("draft") };
        Reducers.ApplyToChat(chat, new StateAction(new ChatInputRequestedAction
        {
            Type = ActionType.ChatInputRequested,
            Request = new ChatInputRequest { Id = "r1", Message = "pick one", Answers = answers },
        }));

        // Re-request the SAME id, omitting answers. The reducer must carry the surviving
        // drafts onto the stored part WITHOUT writing them back into this action.
        var reRequest = new ChatInputRequest { Id = "r1", Message = "pick one (again)" };
        var action = new ChatInputRequestedAction { Type = ActionType.ChatInputRequested, Request = reRequest };
        Reducers.ApplyToChat(chat, new StateAction(action));

        // THE REGRESSION: the caller's action must be untouched.
        Assert.Null(reRequest.Answers);
        Assert.Null(action.Request.Answers);

        // ...while the stored part still carries the surviving draft.
        // The turn is still OPEN, so the part lives on ActiveTurn (not the closed-turn list).
        var part = Assert.IsType<InputRequestResponsePart>(chat.ActiveTurn!.ResponseParts.Single().Value);
        Assert.NotNull(part.Request.Answers);
        Assert.Same(answers, part.Request.Answers);
        Assert.True(part.Request.Answers!.ContainsKey("q1"));
        Assert.Equal("pick one (again)", part.Request.Message);
    }

    private sealed class ControlledSendTransport : ITransport
    {
        private readonly TaskCompletionSource _firstSendStarted =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _firstSendCanceled =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _releaseFirstSend =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _closed =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _sendAttempts;

        public Task FirstSendStarted => _firstSendStarted.Task;

        public Task FirstSendCanceled => _firstSendCanceled.Task;

        public int SendAttempts => Volatile.Read(ref _sendAttempts);

        public void ReleaseFirstSend() => _releaseFirstSend.TrySetResult();

        public async ValueTask SendAsync(
            TransportMessage message,
            CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref _sendAttempts) != 1)
                return;

            _firstSendStarted.TrySetResult();
            try
            {
                await _releaseFirstSend.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                _firstSendCanceled.TrySetResult();
                throw;
            }
        }

        public async ValueTask<TransportMessage> ReceiveAsync(
            CancellationToken cancellationToken = default)
        {
            await _closed.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
            throw new TransportClosedException();
        }

        public ValueTask CloseAsync(CancellationToken cancellationToken = default)
        {
            _closed.TrySetResult();
            return ValueTask.CompletedTask;
        }

        public ValueTask DisposeAsync() => CloseAsync();
    }

    private sealed class CountingTransport : ITransport
    {
        private readonly TaskCompletionSource _closed =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _sendAttempts;

        public int SendAttempts => Volatile.Read(ref _sendAttempts);

        public ValueTask SendAsync(
            TransportMessage message,
            CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _sendAttempts);
            return ValueTask.CompletedTask;
        }

        public async ValueTask<TransportMessage> ReceiveAsync(
            CancellationToken cancellationToken = default)
        {
            await _closed.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
            throw new TransportClosedException();
        }

        public ValueTask CloseAsync(CancellationToken cancellationToken = default)
        {
            _closed.TrySetResult();
            return ValueTask.CompletedTask;
        }

        public ValueTask DisposeAsync() => CloseAsync();
    }

    private sealed class BlockingEncodeSerializer : IAhpSerializer
    {
        private readonly ManualResetEventSlim _releaseEncode = new(initialState: false);
        private readonly TaskCompletionSource _encodeStarted =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _encodeCount;

        public Task EncodeStarted => _encodeStarted.Task;

        public void ReleaseEncode() => _releaseEncode.Set();

        public string Serialize<T>(T value) => SystemTextJsonAhpSerializer.Default.Serialize(value);

        public JsonElement SerializeToElement<T>(T value) =>
            SystemTextJsonAhpSerializer.Default.SerializeToElement(value);

        public T Deserialize<T>(string json) =>
            SystemTextJsonAhpSerializer.Default.Deserialize<T>(json);

        public T Deserialize<T>(ReadOnlySpan<byte> utf8Json) =>
            SystemTextJsonAhpSerializer.Default.Deserialize<T>(utf8Json);

        public T Deserialize<T>(JsonElement element) =>
            SystemTextJsonAhpSerializer.Default.Deserialize<T>(element);

        public JsonRpcMessage DecodeMessage(TransportMessage message) =>
            SystemTextJsonAhpSerializer.Default.DecodeMessage(message);

        public TransportMessage EncodeMessage(JsonRpcMessage message)
        {
            if (Interlocked.Increment(ref _encodeCount) == 1)
            {
                _encodeStarted.TrySetResult();
                _releaseEncode.Wait(TestContext.Current.CancellationToken);
            }

            return SystemTextJsonAhpSerializer.Default.EncodeMessage(message);
        }
    }
}
