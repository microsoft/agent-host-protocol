// Command reducers_demo applies a handful of chat actions to an
// empty ChatState to illustrate the public reducer API.
package main

import (
	"encoding/json"
	"fmt"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func main() {
	state := ahptypes.ChatState{
		Resource:   "ahp-chat:/demo",
		Title:      "Demo",
		Status:     ahptypes.SessionStatusIdle,
		ModifiedAt: "1970-01-01T00:00:00.001Z",
	}

	actions := []ahptypes.StateAction{
		{Value: &ahptypes.ChatTurnStartedAction{
			Type:      ahptypes.ActionTypeChatTurnStarted,
			TurnId:    "t1",
			StartedAt: "2026-07-09T20:00:00.000Z",
			Message:   ahptypes.Message{Text: "Hello!", Origin: ahptypes.MessageOrigin{Kind: ahptypes.MessageKindUser}},
		}},
		{Value: &ahptypes.ChatResponsePartAction{
			Type:   ahptypes.ActionTypeChatResponsePart,
			TurnId: "t1",
			Part: ahptypes.ResponsePart{Value: &ahptypes.MarkdownResponsePart{
				Kind:    ahptypes.ResponsePartKindMarkdown,
				Id:      "p1",
				Content: "Hi ",
			}},
		}},
		{Value: &ahptypes.ChatDeltaAction{
			Type:    ahptypes.ActionTypeChatDelta,
			TurnId:  "t1",
			PartId:  "p1",
			Content: "there!",
		}},
		{Value: &ahptypes.ChatTurnCompleteAction{
			Type:     ahptypes.ActionTypeChatTurnComplete,
			TurnId:   "t1",
			Duration: 1000,
		}},
	}

	for _, a := range actions {
		outcome := ahp.ApplyActionToChat(&state, a)
		fmt.Printf("applied %T → %v\n", a.Value, outcomeName(outcome))
	}

	pretty, _ := json.MarshalIndent(state, "", "  ")
	fmt.Println("final state:")
	fmt.Println(string(pretty))
}

func outcomeName(o ahp.ReduceOutcome) string {
	switch o {
	case ahp.ReduceOutcomeApplied:
		return "Applied"
	case ahp.ReduceOutcomeNoOp:
		return "NoOp"
	case ahp.ReduceOutcomeOutOfScope:
		return "OutOfScope"
	}
	return "?"
}
