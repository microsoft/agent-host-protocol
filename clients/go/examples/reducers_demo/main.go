// Command reducers_demo applies a handful of session actions to an
// empty SessionState to illustrate the public reducer API.
package main

import (
	"encoding/json"
	"fmt"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func main() {
	state := ahptypes.SessionState{
		Summary: ahptypes.SessionSummary{
			Resource:  "ahp-session:/demo",
			Provider:  "demo",
			Title:     "Demo",
			Status:    ahptypes.SessionStatusIdle,
			CreatedAt: 1,
		},
		Lifecycle: ahptypes.SessionLifecycleReady,
	}

	actions := []ahptypes.StateAction{
		{Value: &ahptypes.SessionTurnStartedAction{
			Type:    ahptypes.ActionTypeSessionTurnStarted,
			TurnId:  "t1",
			Message: ahptypes.Message{Text: "Hello!"},
		}},
		{Value: &ahptypes.SessionResponsePartAction{
			Type:   ahptypes.ActionTypeSessionResponsePart,
			TurnId: "t1",
			Part: ahptypes.ResponsePart{Value: &ahptypes.MarkdownResponsePart{
				Kind:    ahptypes.ResponsePartKindMarkdown,
				Id:      "p1",
				Content: "Hi ",
			}},
		}},
		{Value: &ahptypes.SessionDeltaAction{
			Type:    ahptypes.ActionTypeSessionDelta,
			TurnId:  "t1",
			PartId:  "p1",
			Content: "there!",
		}},
		{Value: &ahptypes.SessionTurnCompleteAction{
			Type:   ahptypes.ActionTypeSessionTurnComplete,
			TurnId: "t1",
		}},
	}

	for _, a := range actions {
		outcome := ahp.ApplyActionToSession(&state, a)
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
