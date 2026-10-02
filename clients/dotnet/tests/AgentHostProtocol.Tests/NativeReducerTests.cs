// Port of the Swift ReducersTests "Dispatch Validation" cases. These exercise the
// SHIPPED production predicate `Reducers.IsClientDispatchable(StateAction)` — exactly
// like Swift's tests call its production `isClientDispatchable`. The canonical
// client-dispatchable set lives in production (`Reducers.ClientDispatchableActions`,
// mirroring Swift's `clientDispatchableActions`); there is intentionally no test-local
// copy of it here.
//
// The predicate derives each action's wire `type` by serializing a REAL StateAction
// through the REAL serializer and reading the emitted `type` field — exercising the
// generated union + serializer's [WireValue] mapping, not a hand-typed literal.
#nullable enable

using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class NativeReducerTests
{
    private static TcpConnectionState TcpState(long size = 8) => new()
    {
        Session = "ahp-session:/test",
        Target = new TcpTarget { Host = "localhost", Port = 3000 },
        Encoding = TcpDataEncoding.Base64,
        Input = new FlowControlledByteDirectionState { WindowBytes = size, MaximumChunkSize = size },
        Output = new FlowControlledByteDirectionState { WindowBytes = size, MaximumChunkSize = size },
    };

    [Fact]
    public void TcpFourMiBChunkDoesNotAllocateDecodedPayload()
    {
        const int size = 4 * 1024 * 1024;
        string data = new string('A', size / 3 * 4) + "AA==";
        var before = TcpState(size);
        var action = new StateAction(new TcpInputAction { Type = ActionType.TcpInput, Offset = 0, Data = data });
        _ = Reducers.TcpReducer(before, action);
        long allocated = GC.GetAllocatedBytesForCurrentThread();
        var after = Reducers.TcpReducer(before, action);
        allocated = GC.GetAllocatedBytesForCurrentThread() - allocated;
        Assert.True(allocated < 64 * 1024, $"Reducer allocated {allocated} bytes for a 4 MiB chunk");
        Assert.Equal(size, after.Input.ReceivedBytes);
        Assert.Equal(0, before.Input.ReceivedBytes);
        Assert.Same(after, Reducers.TcpReducer(after, action));
        Assert.Same(before.Output, after.Output);
        var error = Assert.Throws<InvalidOperationException>(() => Reducers.TcpReducer(after,
            new StateAction(new TcpInputAction { Type = ActionType.TcpInput, Offset = size, Data = "AA==" })));
        Assert.Equal("Invalid TCP action: receive window exceeded", error.Message);
        Assert.Equal(size, after.Input.ReceivedBytes);
    }

    [Fact]
    public void TcpSafeIntegerCounters()
    {
        const long max = 9007199254740991L;
        var before = TcpState();
        before = before with { Input = before.Input with { ReceivedBytes = max - 1, ConsumedBytes = max - 1 } };
        var state = Reducers.TcpReducer(before, new StateAction(new TcpInputAction { Type = ActionType.TcpInput, Offset = max - 1, Data = "AA==" }));
        state = Reducers.TcpReducer(state, new StateAction(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = max }));
        state = Reducers.TcpReducer(state, new StateAction(new TcpInputEofAction { Type = ActionType.TcpInputEof, FinalOffset = max }));
        Assert.Equal(max, state.Input.ReceivedBytes);
        Assert.Equal(max, state.Input.ConsumedBytes);
        Assert.Equal(max, state.Input.EofAtBytes);
        foreach (long value in new[] { -1L, max + 1, long.MaxValue })
        {
            StateAction[] actions =
            {
                new(new TcpInputAction { Type = ActionType.TcpInput, Offset = value, Data = "AA==" }),
                new(new TcpDataAction { Type = ActionType.TcpData, Offset = value, Data = "AA==" }),
                new(new TcpInputConsumedAction { Type = ActionType.TcpInputConsumed, ConsumedBytes = value }),
                new(new TcpDataConsumedAction { Type = ActionType.TcpDataConsumed, ConsumedBytes = value }),
                new(new TcpInputEofAction { Type = ActionType.TcpInputEof, FinalOffset = value }),
                new(new TcpDataEofAction { Type = ActionType.TcpDataEof, FinalOffset = value }),
            };
            foreach (StateAction action in actions)
            {
                var error = Assert.Throws<InvalidOperationException>(() => Reducers.TcpReducer(state, action));
                Assert.Equal("Invalid TCP action: offset must be a nonnegative safe integer", error.Message);
                Assert.Equal(max, state.Input.ReceivedBytes);
            }
        }
    }

    [Fact]
    public void TcpRejectsWhitespaceAndUnicodeBase64()
    {
        foreach (string data in new[] { "AAA\n", "AAA\r", "AAA\t", "AAA ", "AAA\u00e9", "AA\U0001f600" })
        {
            var error = Assert.Throws<InvalidOperationException>(() => Reducers.TcpReducer(TcpState(),
                new StateAction(new TcpInputAction { Type = ActionType.TcpInput, Offset = 0, Data = data })));
            Assert.Equal("Invalid TCP action: base64 encoding", error.Message);
        }
    }

    // #338: an open request is an UNRESOLVED InputRequestResponsePart living in the
    // active turn's response stream — there is no longer a separate live surface, so
    // without an active turn there is nowhere for an open request to exist at all.
    private static ChatState ChatWithOpenRequest(bool withActiveTurn)
    {
        var state = new ChatState
        {
            Resource = "chat://c1",
            Title = "chat",
            ModifiedAt = "2024-01-01T00:00:00.000Z",
            Turns = new List<Turn>(),
        };
        if (withActiveTurn)
        {
            state.ActiveTurn = new ActiveTurn
            {
                Id = "turn-1",
                StartedAt = "2026-01-01T00:00:00.000Z",
                Message = new Message
                {
                    Text = "go",
                    Origin = new MessageOrigin { Kind = MessageKind.User },
                },
                ResponseParts = new List<ResponsePart>
                {
                    new(new InputRequestResponsePart
                    {
                        Kind = ResponsePartKind.InputRequest,
                        Request = new ChatInputRequest { Id = "req-1", Message = "Proceed?" },
                    }),
                },
            };
        }

        return state;
    }

    // #338: completing an input request resolves the EXISTING part in place — the
    // response lands on the part already in the stream rather than on an appended copy.
    [Fact]
    public void ChatInputCompleted_ResolvesExistingPartInPlace()
    {
        ChatState state = ChatWithOpenRequest(withActiveTurn: true);
        var action = new StateAction(new ChatInputCompletedAction
        {
            Type = ActionType.ChatInputCompleted,
            RequestId = "req-1",
            Response = ChatInputResponseKind.Decline,
        });

        ReduceOutcome outcome = Reducers.ApplyToChat(state, action);

        Assert.Equal(ReduceOutcome.Applied, outcome);
        ResponsePart part = Assert.Single(state.ActiveTurn!.ResponseParts);
        var recorded = Assert.IsType<InputRequestResponsePart>(part.Value);
        Assert.Equal(ResponsePartKind.InputRequest, recorded.Kind);
        Assert.Equal(ChatInputResponseKind.Decline, recorded.Response);
        Assert.Equal("req-1", recorded.Request.Id);
    }

    // #338: with no active turn there is no part to resolve, so completion is a no-op.
    // Under the pre-#338 model this cleared a live request and returned Applied.
    [Fact]
    public void ChatInputCompleted_WithoutActiveTurn_IsNoOp()
    {
        ChatState state = ChatWithOpenRequest(withActiveTurn: false);
        var action = new StateAction(new ChatInputCompletedAction
        {
            Type = ActionType.ChatInputCompleted,
            RequestId = "req-1",
            Response = ChatInputResponseKind.Accept,
        });

        ReduceOutcome outcome = Reducers.ApplyToChat(state, action);

        Assert.Equal(ReduceOutcome.NoOp, outcome);
        Assert.Null(state.ActiveTurn);
    }

    // #324/#338: completing an unknown request id is a no-op — the open part survives
    // unresolved and nothing is appended.
    [Fact]
    public void ChatInputCompleted_UnknownId_IsNoOp()
    {
        ChatState state = ChatWithOpenRequest(withActiveTurn: true);
        var action = new StateAction(new ChatInputCompletedAction
        {
            Type = ActionType.ChatInputCompleted,
            RequestId = "does-not-exist",
            Response = ChatInputResponseKind.Cancel,
        });

        ReduceOutcome outcome = Reducers.ApplyToChat(state, action);

        Assert.Equal(ReduceOutcome.NoOp, outcome);
        ResponsePart part = Assert.Single(state.ActiveTurn!.ResponseParts);
        Assert.Null(Assert.IsType<InputRequestResponsePart>(part.Value).Response);
    }

    // A: clientDispatchable true — a chat-channel action (chat/turnStarted) is dispatchable.
    [Fact]
    public void ClientDispatchable_TrueForUserChannelAction()
    {
        var action = new StateAction(new ChatTurnStartedAction
        {
            Type = ActionType.ChatTurnStarted,
            TurnId = "t1",
            StartedAt = "2026-01-01T00:00:00.000Z",
            // Message.Origin is a required (non-nullable) MessageOrigin — give it a
            // valid value so the action serializes.
            Message = new Message
            {
                Text = "hi",
                Origin = new MessageOrigin { Kind = MessageKind.User },
            },
        });
        Assert.True(Reducers.IsClientDispatchable(action));
    }

    // A: clientDispatchable false — a host-only action (session/ready) is NOT dispatchable.
    [Fact]
    public void ClientDispatchable_FalseForHostOnlyAction()
    {
        var action = new StateAction(new SessionReadyAction
        {
            Type = ActionType.SessionReady,
        });
        Assert.False(Reducers.IsClientDispatchable(action));
    }

    // AHP 0.5.0 (#264): chat/draftChanged is the new client-dispatchable action
    // (a client syncs its in-progress draft); chat/activityChanged is server-only.
    [Fact]
    public void ClientDispatchable_TrueForChatDraftChanged()
    {
        var action = new StateAction(new ChatDraftChangedAction
        {
            Type = ActionType.ChatDraftChanged,
            Draft = new Message
            {
                Text = "in progress…",
                Origin = new MessageOrigin { Kind = MessageKind.User },
            },
        });
        Assert.True(Reducers.IsClientDispatchable(action));
    }

    [Fact]
    public void ClientDispatchable_FalseForChatActivityChanged()
    {
        var action = new StateAction(new ChatActivityChangedAction
        {
            Type = ActionType.ChatActivityChanged,
            Activity = "running a tool",
        });
        Assert.False(Reducers.IsClientDispatchable(action));
    }

    [Fact]
    public void ClientDispatchable_TrueForChatIsArchivedChanged()
    {
        var action = new StateAction(new ChatIsArchivedChangedAction
        {
            Type = ActionType.ChatIsArchivedChanged,
            IsArchived = true,
        });
        Assert.True(Reducers.IsClientDispatchable(action));
    }

    [Fact]
    public void ClientDispatchable_TrueForChatIsReadChanged()
    {
        var action = new StateAction(new ChatIsReadChangedAction
        {
            Type = ActionType.ChatIsReadChanged,
            IsRead = true,
        });
        Assert.True(Reducers.IsClientDispatchable(action));
    }

    // AHP 0.6.0 (#328): changeset/filesReviewChanged is the first client-dispatchable
    // changeset action — a reviewer toggles per-file review state directly through the
    // write-ahead reducer. Every other changeset/* action remains server-only.
    [Fact]
    public void ClientDispatchable_TrueForChangesetFilesReviewChanged()
    {
        var action = new StateAction(new ChangesetFilesReviewChangedAction
        {
            Type = ActionType.ChangesetFilesReviewChanged,
            Files = new List<string> { "a" },
            Reviewed = true,
        });
        Assert.True(Reducers.IsClientDispatchable(action));
    }

    [Fact]
    public void ClientDispatchable_FalseForChangesetFileSet()
    {
        var action = new StateAction(new ChangesetFileSetAction
        {
            Type = ActionType.ChangesetFileSet,
            File = new ChangesetFile { Id = "a", Edit = new FileEdit() },
        });
        Assert.False(Reducers.IsClientDispatchable(action));
    }
}
