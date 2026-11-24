// Applies a handful of chat actions to an empty ChatState to illustrate
// the public reducer API. Post-#213 multi-chat sessions: chat-channel actions
// now target ChatState, not SessionState directly.
// Port of clients/go/examples/reducers_demo/main.go.
#nullable enable

using System;
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.AgentHostProtocol;

var chatState = new ChatState
{
    Resource = "ahp-session:/demo/chat/main",
    Title = "Demo Chat",
    Status = SessionStatus.Idle,
    ModifiedAt = "1970-01-01T00:00:00.000Z",
    Turns = new List<Turn>(),
};

var actions = new List<StateAction>
{
    new StateAction(new ChatTurnStartedAction
    {
        Type = ActionType.ChatTurnStarted,
        TurnId = "t1",
        StartedAt = "2026-07-09T20:00:00.000Z",
        Message = new Message
        {
            Text = "Hello!",
            Origin = new MessageOrigin { Kind = MessageKind.User },
        },
    }),
    new StateAction(new ChatResponsePartAction
    {
        Type = ActionType.ChatResponsePart,
        TurnId = "t1",
        Part = new ResponsePart(new MarkdownResponsePart
        {
            Kind = ResponsePartKind.Markdown,
            Id = "p1",
            Content = "Hi ",
        }),
    }),
    new StateAction(new ChatDeltaAction
    {
        Type = ActionType.ChatDelta,
        TurnId = "t1",
        PartId = "p1",
        Content = "there!",
    }),
    new StateAction(new ChatTurnCompleteAction
    {
        Type = ActionType.ChatTurnComplete,
        TurnId = "t1",
    }),
};

foreach (var action in actions)
{
    var outcome = Reducers.ApplyToChat(chatState, action);
    Console.WriteLine($"applied {action.Value?.GetType().Name} → {OutcomeName(outcome)}");
}

var options = new JsonSerializerOptions { WriteIndented = true };
var pretty = JsonSerializer.Serialize(chatState, options);
Console.WriteLine("final state:");
Console.WriteLine(pretty);

static string OutcomeName(ReduceOutcome o) => o switch
{
    ReduceOutcome.Applied => "Applied",
    ReduceOutcome.NoOp => "NoOp",
    ReduceOutcome.OutOfScope => "OutOfScope",
    _ => "?",
};
