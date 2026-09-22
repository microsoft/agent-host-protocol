package ahptypes

import (
	"encoding/json"
	"testing"
)

func TestAccountsSnapshotRoundTrip(t *testing.T) {
	for _, input := range []string{
		`{"accounts":[],"attempts":[]}`,
		`{"accounts":[{"id":"account-1","label":"Work","removable":false,"consumers":[{"kind":"agent","provider":"copilot","resource":"https://api.example.test"},{"kind":"mcpServer","session":"ahp-session:/s1","customizationId":"mcp-1"}]}],"attempts":[{"id":"attempt-1","status":"completed","accountId":"account-1","consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"},"resource":"https://api.example.test"}]}`,
	} {
		var snapshot SnapshotState
		if err := json.Unmarshal([]byte(input), &snapshot); err != nil {
			t.Fatal(err)
		}
		if snapshot.Accounts == nil || snapshot.Root != nil {
			t.Fatalf("accounts snapshot was misrouted: %+v", snapshot)
		}
		wire, err := json.Marshal(snapshot)
		if err != nil {
			t.Fatal(err)
		}
		if !canonicalJSONEqualRaw(t, "accounts snapshot", string(wire), input) {
			t.Fatalf("snapshot changed on round-trip: %s", wire)
		}
	}
}

func TestAuthenticationBindingRoundTrips(t *testing.T) {
	for _, binding := range []string{
		`{"kind":"attempt","attemptId":"attempt-1"}`,
		`{"kind":"account","accountId":"account-1"}`,
	} {
		input := `{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":` + binding + `}`
		var params AuthenticateParams
		if err := json.Unmarshal([]byte(input), &params); err != nil {
			t.Fatal(err)
		}
		if params.Binding == nil {
			t.Fatal("binding was dropped during decoding")
		}
		wire, err := json.Marshal(params)
		if err != nil {
			t.Fatal(err)
		}
		if !canonicalJSONEqualRaw(t, "authenticate binding", string(wire), input) {
			t.Fatalf("binding changed on round-trip: %s", wire)
		}
	}
}

func TestAuthenticationLegacyWireRemainsUnbound(t *testing.T) {
	const input = `{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token"}`
	var params AuthenticateParams
	if err := json.Unmarshal([]byte(input), &params); err != nil {
		t.Fatal(err)
	}
	if params.Binding != nil {
		t.Fatal("legacy authentication acquired a binding")
	}
	wire, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	if !canonicalJSONEqualRaw(t, "legacy authenticate", string(wire), input) {
		t.Fatalf("legacy authentication changed on round-trip: %s", wire)
	}
}

func TestAuthenticationRejectsUnknownBinding(t *testing.T) {
	for _, binding := range []string{
		`{"kind":"future","accountId":"account-1"}`,
		`{"accountId":"account-1"}`,
		`{"kind":42,"accountId":"account-1"}`,
	} {
		input := `{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":` + binding + `}`
		var params AuthenticateParams
		if err := json.Unmarshal([]byte(input), &params); err == nil {
			t.Fatalf("unsupported binding decoded without error: %s", binding)
		}
	}
}

func TestAuthenticationFutureFlowRoundTrip(t *testing.T) {
	const input = `{"flows":[{"kind":"future"},{"kind":"clientBrokered"}]}`
	var capability AuthenticationCapability
	if err := json.Unmarshal([]byte(input), &capability); err != nil {
		t.Fatal(err)
	}
	if capability.Flows[0].Kind == AuthFlowKindClientBrokered {
		t.Fatal("future authentication flow became clientBrokered")
	}
	wire, err := json.Marshal(capability)
	if err != nil {
		t.Fatal(err)
	}
	if !canonicalJSONEqualRaw(t, "future flow", string(wire), input) {
		t.Fatalf("future flow changed on round-trip: %s", wire)
	}
}
