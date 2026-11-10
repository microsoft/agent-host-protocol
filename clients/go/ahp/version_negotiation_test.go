package ahp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestSharedVersionNegotiationCorpus(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(findFixtureDir(t), "..", "version-negotiation.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Offered  []string `json:"offered"`
		Expected *string  `json:"expected"`
		Invalid  bool     `json:"invalid"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range cases {
		actual, err := ahptypes.NegotiateProtocolVersion(fixture.Offered)
		if fixture.Invalid {
			if err == nil {
				t.Fatalf("expected invalid offer: %v", fixture.Offered)
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		expected := ""
		if fixture.Expected != nil {
			expected = *fixture.Expected
		}
		if actual != expected {
			t.Fatalf("%v: got %q, want %q", fixture.Offered, actual, expected)
		}
	}
}
