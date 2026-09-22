package ahp

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestAccountsReducerUpsertsRemovesAndPreservesOtherEntries(t *testing.T) {
	var state ahptypes.AccountsState
	if err := json.Unmarshal([]byte(`{"accounts":[],"attempts":[]}`), &state); err != nil {
		t.Fatal(err)
	}
	actions := []string{
		`{"type":"accounts/set","account":{"id":"a","label":"First","removable":true,"consumers":[]}}`,
		`{"type":"accounts/set","account":{"id":"b","label":"Other","removable":false,"consumers":[]}}`,
		`{"type":"accounts/set","account":{"id":"a","label":"Updated","removable":true,"consumers":[]}}`,
		`{"type":"accounts/authAttemptSet","attempt":{"id":"one","status":"pending","consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"},"resource":"https://api.example.test"}}`,
		`{"type":"accounts/authAttemptSet","attempt":{"id":"two","status":"pending","consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"},"resource":"https://mcp.example.test"}}`,
		`{"type":"accounts/authAttemptSet","attempt":{"id":"one","status":"completed","accountId":"a","consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"},"resource":"https://api.example.test"}}`,
		`{"type":"accounts/authAttemptSet","attempt":{"id":"two","status":"failed","error":{"errorType":"denied","message":"Denied"},"consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"},"resource":"https://mcp.example.test"}}`,
		`{"type":"accounts/removed","id":"a"}`,
		`{"type":"accounts/authAttemptRemoved","id":"one"}`,
	}
	for _, input := range actions {
		var action ahptypes.StateAction
		if err := json.Unmarshal([]byte(input), &action); err != nil {
			t.Fatal(err)
		}
		if outcome := ApplyActionToAccounts(&state, action); outcome != ReduceOutcomeApplied {
			t.Fatalf("outcome = %v for %s", outcome, input)
		}
	}
	expected := parseJSON(t, []byte(`{"accounts":[{"id":"b","label":"Other","removable":false,"consumers":[]}],"attempts":[{"id":"two","status":"failed","error":{"errorType":"denied","message":"Denied"},"consumer":{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"},"resource":"https://mcp.example.test"}]}`))
	if actual := reMarshal(t, state); !reflect.DeepEqual(actual, expected) {
		t.Fatalf("state = %s, want %s", mustPretty(actual), mustPretty(expected))
	}

	for _, input := range []string{
		`{"type":"accounts/removed","id":"missing"}`,
		`{"type":"accounts/authAttemptRemoved","id":"missing"}`,
	} {
		var action ahptypes.StateAction
		if err := json.Unmarshal([]byte(input), &action); err != nil {
			t.Fatal(err)
		}
		if outcome := ApplyActionToAccounts(&state, action); outcome != ReduceOutcomeNoOp {
			t.Fatalf("outcome = %v for missing removal", outcome)
		}
	}
	if outcome := ApplyActionToAccounts(&state, ahptypes.StateAction{Value: &ahptypes.RootActiveSessionsChangedAction{
		Type: ahptypes.ActionTypeRootActiveSessionsChanged, ActiveSessions: 3,
	}}); outcome != ReduceOutcomeOutOfScope {
		t.Fatalf("root action outcome = %v", outcome)
	}
}

func TestAccountsMirrorHostAndResourceIsolation(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	mirror.PutAccounts("first", ahptypes.AccountsState{Accounts: []ahptypes.HostAccount{{Id: "a"}}})
	mirror.PutAccounts("second", ahptypes.AccountsState{Accounts: []ahptypes.HostAccount{{Id: "b"}}})
	mirror.PutRoot("first", ahptypes.RootState{})
	mirror.DropResource("first", ahptypes.AccountsResourceURI)
	if _, found := mirror.Accounts("first"); found {
		t.Fatal("dropped accounts resource remains")
	}
	if _, found := mirror.Root("first"); !found {
		t.Fatal("dropping accounts removed root state")
	}
	if accounts, found := mirror.Accounts("second"); !found || accounts.Accounts[0].Id != "b" {
		t.Fatal("other host's accounts changed")
	}
	mirror.DropHost("second")
	if _, found := mirror.Accounts("second"); found {
		t.Fatal("dropped host's accounts remain")
	}
}
