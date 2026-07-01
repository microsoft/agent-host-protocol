package ahptypes

import (
	"encoding/json"
	"testing"
)

// TestProtocolVersion sanity-checks the constants emitted into
// version.generated.go.
func TestProtocolVersion(t *testing.T) {
	if ProtocolVersion == "" {
		t.Fatal("ProtocolVersion is empty")
	}
	supported := SupportedProtocolVersions()
	if len(supported) == 0 {
		t.Fatal("SupportedProtocolVersions is empty")
	}
	if supported[0] != ProtocolVersion {
		t.Fatalf("SupportedProtocolVersions[0] = %q, want %q (ProtocolVersion)", supported[0], ProtocolVersion)
	}
}

// TestActionEnvelopeRoundTrip decodes a representative
// session/titleChanged envelope and re-encodes it, checking the
// envelope-level fields are preserved and the StateAction discriminator
// resolves to the expected variant.
func TestActionEnvelopeRoundTrip(t *testing.T) {
	const wire = `{
		"channel": "ahp-session:/s1",
		"action": { "type": "session/titleChanged", "title": "Hello" },
		"serverSeq": 7,
		"origin": null
	}`

	var env ActionEnvelope
	if err := json.Unmarshal([]byte(wire), &env); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	if env.Channel != "ahp-session:/s1" {
		t.Errorf("channel = %q, want ahp-session:/s1", env.Channel)
	}
	if env.ServerSeq != 7 {
		t.Errorf("serverSeq = %d, want 7", env.ServerSeq)
	}
	title, ok := env.Action.Value.(*SessionTitleChangedAction)
	if !ok {
		t.Fatalf("action variant = %T, want *SessionTitleChangedAction", env.Action.Value)
	}
	if title.Title != "Hello" {
		t.Errorf("title = %q, want Hello", title.Title)
	}

	out, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}
	// Round-trip again to compare on equal footing.
	var back ActionEnvelope
	if err := json.Unmarshal(out, &back); err != nil {
		t.Fatalf("re-unmarshal envelope: %v", err)
	}
	if back.ServerSeq != env.ServerSeq || back.Channel != env.Channel {
		t.Errorf("round-trip mismatch: got %+v", back)
	}
}

// TestStateActionUnknownVariant ensures a discriminator value we don't
// recognize is preserved verbatim in the Unknown variant and round-trips.
func TestStateActionUnknownVariant(t *testing.T) {
	const wire = `{"type":"future/newAction","foo":42}`
	var a StateAction
	if err := json.Unmarshal([]byte(wire), &a); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	unk, ok := a.Value.(*StateActionUnknown)
	if !ok {
		t.Fatalf("variant = %T, want *StateActionUnknown", a.Value)
	}
	out, err := json.Marshal(a)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(out) != string(unk.Raw) {
		t.Errorf("round-trip mismatch:\nwant %s\ngot  %s", wire, out)
	}
}

// TestSnapshotStateVariants confirms the SnapshotState discriminator picks the
// right variant for each state shape — in particular that a chat snapshot
// resolves to Chat (and not the Root catch-all) and a flattened session
// snapshot resolves to Session.
func TestSnapshotStateVariants(t *testing.T) {
	for _, tc := range []struct {
		name string
		wire string
		want func(SnapshotState) bool
	}{
		{
			"session",
			`{"provider":"p","title":"S","status":0,"lifecycle":"ready","activeClients":[],"chats":[]}`,
			func(s SnapshotState) bool { return s.Session != nil },
		},
		{
			"chat",
			`{"resource":"ahp-chat:/c1","title":"C","status":0,"modifiedAt":"2025-03-10T18:42:03.123Z","turns":[]}`,
			func(s SnapshotState) bool { return s.Chat != nil },
		},
		{
			"terminal",
			`{"title":"T","content":[],"claim":{"kind":"client","clientId":"x"}}`,
			func(s SnapshotState) bool { return s.Terminal != nil },
		},
		{
			"changeset",
			`{"status":"open","files":[]}`,
			func(s SnapshotState) bool { return s.Changeset != nil },
		},
		{
			"resourceWatch",
			`{"root":"file:///r","recursive":true}`,
			func(s SnapshotState) bool { return s.ResourceWatch != nil },
		},
		{
			"annotations",
			`{"annotations":[]}`,
			func(s SnapshotState) bool { return s.Annotations != nil },
		},
		{
			"root",
			`{"agents":[]}`,
			func(s SnapshotState) bool { return s.Root != nil },
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var s SnapshotState
			if err := json.Unmarshal([]byte(tc.wire), &s); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if !tc.want(s) {
				t.Fatalf("wrong variant for %s snapshot: %+v", tc.name, s)
			}
		})
	}
}

// TestSessionStatusBitset confirms the typed-uint32 Has/Or helpers
// match the canonical bitset semantics.
func TestSessionStatusBitset(t *testing.T) {
	s := SessionStatusInProgress.Or(SessionStatusIsArchived)
	if !s.Has(SessionStatusInProgress) {
		t.Error("missing InProgress")
	}
	if !s.Has(SessionStatusIsArchived) {
		t.Error("missing IsArchived")
	}
	if s.Has(SessionStatusIdle) {
		t.Error("unexpectedly has Idle")
	}
	// Unknown future bit survives a round-trip through JSON.
	const unknownBit SessionStatus = 1 << 31
	s = s.Or(unknownBit)
	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var back SessionStatus
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
	if back != s {
		t.Errorf("bitset round-trip: want %d got %d", s, back)
	}
}

// TestStringOrMarkdownPlainAndObject round-trips both wire forms.
func TestStringOrMarkdownPlainAndObject(t *testing.T) {
	for _, tc := range []struct {
		name string
		wire string
	}{
		{"plain", `"hello"`},
		{"object", `{"markdown":"# title"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var v StringOrMarkdown
			if err := json.Unmarshal([]byte(tc.wire), &v); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			out, err := json.Marshal(v)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			if string(out) != tc.wire {
				t.Errorf("round-trip:\nwant %s\ngot  %s", tc.wire, out)
			}
		})
	}
}

// TestJsonRpcMessageVariants exercises the JsonRpcMessage discriminator.
func TestJsonRpcMessageVariants(t *testing.T) {
	for _, tc := range []struct {
		name     string
		wire     string
		wantKind string
	}{
		{"request", `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`, "request"},
		{"notification", `{"jsonrpc":"2.0","method":"action","params":{}}`, "notification"},
		{"success", `{"jsonrpc":"2.0","id":1,"result":{}}`, "success"},
		{"error", `{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"x"}}`, "error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var m JsonRpcMessage
			if err := json.Unmarshal([]byte(tc.wire), &m); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			switch tc.wantKind {
			case "request":
				if m.Request == nil {
					t.Fatal("expected Request variant")
				}
			case "notification":
				if m.Notification == nil {
					t.Fatal("expected Notification variant")
				}
			case "success":
				if m.SuccessResponse == nil {
					t.Fatal("expected SuccessResponse variant")
				}
			case "error":
				if m.ErrorResponse == nil {
					t.Fatal("expected ErrorResponse variant")
				}
			}
		})
	}
}
