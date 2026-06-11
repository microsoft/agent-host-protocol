// TestRoundTripCorpus — data-driven wire round-trip parity for the Go client.
//
// Loads the SHARED, language-agnostic round-trip corpus under
// types/test-cases/round-trips/*.json (the same fixtures the Swift and
// TypeScript clients run) and asserts each via the REAL generated Go wire
// types — encoding/json (un)marshal, the real discriminated-union
// UnmarshalJSON/MarshalJSON, the real SessionStatus bitset.
// No mocks, no faked SUT: every fixture decodes real bytes into a real type and
// re-encodes with the same serializer.
//
// Each fixture has the shape:
//   { "name": ..., "description": ..., "type": ...,
//     "input": <wire JSON value>,
//     "acceptableOutputs": [ <exactly one canonical re-encoded value> ],
//     "notApplicable": [ <optional list of client names to skip> ] }
//
// The harness decodes `input` as the real type named by `type`, re-encodes
// with encoding/json, and asserts the result structurally equals
// acceptableOutputs[0] (key-order-independent, value- and key-presence-sensitive).
// acceptableOutputs MUST have exactly one entry — the single intended wire form.
//
// If the fixture carries "notApplicable": ["go"] (unlikely — only expected for
// the TypeScript structural limitation), the fixture is skipped with a note.
//
// Run: go test ./ahptypes/ -run TestRoundTripCorpus -v

package ahptypes

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// findRoundTripFixtureDir walks upward from the cwd looking for
// types/test-cases/round-trips so the test works whether `go test` runs from
// clients/go/ahptypes or the module root.
func findRoundTripFixtureDir(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		candidate := filepath.Join(wd, "types", "test-cases", "round-trips")
		if fi, err := os.Stat(candidate); err == nil && fi.IsDir() {
			return candidate
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			t.Fatalf("could not locate types/test-cases/round-trips walking upward from cwd")
		}
		wd = parent
	}
}

// roundTripFixture is the decoded shape of one corpus JSON file.
type roundTripFixture struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	// Group "A" = all clients agree (assert acceptableOutputs[0]).
	// Group "B" = runtime-decoders drop unknown keys (assert acceptableOutputs[0]);
	//             TypeScript preserves them (asserts preservedOutput instead).
	// Absent group is treated as "A" for backward compatibility.
	Group             string            `json:"group"`
	Type              string            `json:"type"`
	Input             json.RawMessage   `json:"input"`
	AcceptableOutputs []json.RawMessage `json:"acceptableOutputs"`
	// PreservedOutput is the expected output for the TypeScript client (Group B only).
	// Go always asserts acceptableOutputs[0] for both groups.
	PreservedOutput json.RawMessage `json:"preservedOutput"`
	// NotApplicable lists client names for which this fixture does not apply.
	// Legacy field — new fixtures use group:"B" + preservedOutput instead.
	NotApplicable []string `json:"notApplicable"`
}

// TestRoundTripCorpus is the primary cross-language wire round-trip parity gate
// for the Go client.
func TestRoundTripCorpus(t *testing.T) {
	dir := findRoundTripFixtureDir(t)

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	var fixtureFiles []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		fixtureFiles = append(fixtureFiles, entry.Name())
	}

	// Loaded-something guard: the checkout must actually include the corpus.
	if len(fixtureFiles) == 0 {
		t.Fatalf("no round-trip fixtures found in %s — ensure the checkout includes types/test-cases/round-trips/", dir)
	}

	ranReal := 0
	for _, name := range fixtureFiles {
		name := name
		ok := t.Run(name, func(tt *testing.T) {
			path := filepath.Join(dir, name)
			raw, err := os.ReadFile(path)
			if err != nil {
				tt.Fatalf("read: %v", err)
			}
			runRoundTripFixture(tt, name, raw)
		})
		if ok {
			ranReal++
		}
	}

	t.Logf("round-trip corpus: %d fixtures, %d asserted for real", len(fixtureFiles), ranReal)
}

func runRoundTripFixture(t *testing.T, name string, raw []byte) {
	t.Helper()

	var fx roundTripFixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if fx.Type == "" {
		t.Fatalf("missing `type`")
	}
	if len(fx.Input) == 0 {
		t.Fatalf("%s: missing `input`", name)
	}
	if len(fx.AcceptableOutputs) == 0 {
		t.Fatalf("%s: fixture made no assertions — `acceptableOutputs` is empty", name)
	}

	// Enforce single canonical form: acceptableOutputs MUST have exactly one entry.
	// Multi-form acceptance sets encode observed-but-wrong divergence as acceptable.
	if len(fx.AcceptableOutputs) != 1 {
		t.Fatalf("%s: acceptableOutputs must have exactly 1 entry (the single canonical re-encoded form); got %d. "+
			"Multiple entries cement divergence instead of fixing it.", name, len(fx.AcceptableOutputs))
	}

	// Honor notApplicable: skip clients listed there with a note.
	// Legacy field — new fixtures use group:"B" + preservedOutput instead.
	for _, skip := range fx.NotApplicable {
		if skip == "go" {
			t.Logf("⊘ %s: not applicable to go — %s", name, fx.Description)
			t.Skip()
			return
		}
	}

	// Group B: Go is a runtime-decoder — it drops unknown keys → asserts acceptableOutputs[0].
	// (Group A also asserts acceptableOutputs[0]; the group field only affects the TypeScript harness.)

	// Decode `input` as the real generated type, re-encode with encoding/json.
	reencoded := decodeAndReencode(t, name, fx.Type, string(fx.Input))

	// Assert the re-encoded result structurally equals the single canonical output.
	if canonicalJSONEqualRaw(t, name, reencoded, string(fx.AcceptableOutputs[0])) {
		return // PASS
	}

	t.Fatalf("%s: re-encoded output does not match the canonical acceptableOutput.\n  got:      %s\n  expected: %s",
		name, reencoded, string(fx.AcceptableOutputs[0]))
}

// decodeAndReencode decodes inputJSON into the real generated type named by
// `type` and re-encodes it with encoding/json. Adding a wire type to the
// corpus is a deliberate edit here — the corpus never decodes arbitrary types
// reflectively.
func decodeAndReencode(t *testing.T, name, typ, inputJSON string) string {
	t.Helper()

	dec := func(v any) {
		if err := json.Unmarshal([]byte(inputJSON), v); err != nil {
			t.Fatalf("%s: decode %s: %v", name, typ, err)
		}
	}
	enc := func(v any) string {
		out, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("%s: re-encode %s: %v", name, typ, err)
		}
		return string(out)
	}

	switch typ {
	case "ActionEnvelope":
		var v ActionEnvelope
		dec(&v)
		return enc(&v)
	case "StateAction":
		var v StateAction
		dec(&v)
		return enc(&v)
	case "Customization":
		var v Customization
		dec(&v)
		return enc(&v)
	case "SessionStatus":
		var v SessionStatus
		dec(&v)
		return enc(v)
	case "StringOrMarkdown":
		var v StringOrMarkdown
		dec(&v)
		return enc(&v)
	case "JsonRpcMessage":
		var v JsonRpcMessage
		dec(&v)
		return enc(&v)
	case "ChangesetOperationTarget":
		var v ChangesetOperationTarget
		dec(&v)
		return enc(&v)
	case "ChatInputQuestion":
		var v ChatInputQuestion
		dec(&v)
		return enc(&v)
	case "SessionSummary":
		var v SessionSummary
		dec(&v)
		return enc(&v)
	case "SessionAddedParams":
		var v SessionAddedParams
		dec(&v)
		return enc(&v)
	case "PartialSessionSummary":
		var v PartialSessionSummary
		dec(&v)
		return enc(&v)
	default:
		t.Fatalf("%s: round-trip fixture: unknown wire type %q. Add a decode entry to decodeAndReencode.", name, typ)
		return ""
	}
}

// ─── JSON equality ───────────────────────────────────────────────────────────

// canonicalJSONEqualRaw compares two JSON documents structurally (key-order
// independent, value- and key-presence sensitive).
func canonicalJSONEqualRaw(t *testing.T, name, lhs, rhs string) bool {
	t.Helper()
	lo := parseToAny(t, name, lhs)
	ro := parseToAny(t, name, rhs)
	return canonicalJSONEqual(t, name, lo, ro)
}

// parseToAny decodes a JSON document into a generic value using json.Number so
// large 64-bit integers stay exact.
func parseToAny(t *testing.T, name, s string) any {
	t.Helper()
	d := json.NewDecoder(strings.NewReader(s))
	d.UseNumber()
	var out any
	if err := d.Decode(&out); err != nil {
		t.Fatalf("%s: parse JSON %q: %v", name, s, err)
	}
	return out
}

// canonicalJSONEqual re-serializes both sides through encoding/json after
// normalizing json.Number values, so equality is structural.
func canonicalJSONEqual(t *testing.T, name string, a, b any) bool {
	t.Helper()
	return canonicalString(t, name, a) == canonicalString(t, name, b)
}

func canonicalString(t *testing.T, name string, v any) string {
	t.Helper()
	out, err := json.Marshal(normalizeNumbers(v))
	if err != nil {
		t.Fatalf("%s: canonicalize: %v", name, err)
	}
	return string(out)
}

// normalizeNumbers walks a generic JSON value and converts json.Number leaves to
// a canonical numeric form so that, e.g., 0 and 0.0 compare equal.
func normalizeNumbers(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			out[k] = normalizeNumbers(val)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, val := range x {
			out[i] = normalizeNumbers(val)
		}
		return out
	case json.Number:
		if i, err := x.Int64(); err == nil {
			return i
		}
		if f, err := x.Float64(); err == nil {
			return f
		}
		return x.String()
	default:
		return v
	}
}

// ─── ProtocolVersion constant tests ─────────────────────────────────────────

// TestProtocolVersionConstants verifies the three properties of the
// ProtocolVersion constants that were previously exercised via corpus
// fixtures 021–023 (now deleted from the round-trip corpus).
func TestProtocolVersionConstants(t *testing.T) {
	if strings.TrimSpace(ProtocolVersion) == "" {
		t.Errorf("ProtocolVersion must be non-empty, got %q", ProtocolVersion)
	}

	supported := SupportedProtocolVersions()
	if len(supported) == 0 {
		t.Errorf("SupportedProtocolVersions() must be non-empty")
	}

	if len(supported) > 0 && supported[0] != ProtocolVersion {
		t.Errorf("first SupportedProtocolVersions entry %q must equal ProtocolVersion %q",
			supported[0], ProtocolVersion)
	}
}
