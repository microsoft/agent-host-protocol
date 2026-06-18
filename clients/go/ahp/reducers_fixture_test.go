package ahp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// findFixtureDir walks upward from the cwd looking for
// types/test-cases/reducers so the test works whether `go test` is run
// from clients/go/ahp or somewhere else.
func findFixtureDir(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		candidate := filepath.Join(wd, "types", "test-cases", "reducers")
		if fi, err := os.Stat(candidate); err == nil && fi.IsDir() {
			return candidate
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			t.Fatalf("could not locate types/test-cases/reducers walking upward from cwd")
		}
		wd = parent
	}
}

// stripNulls recursively removes `null` values from objects so that
// fields the Go marshaler omits (`,omitempty`) compare equal to
// fixtures that spell them out as `null`.
func stripNulls(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, val := range x {
			if val == nil {
				continue
			}
			out[k] = stripNulls(val)
		}
		return out
	case []any:
		out := make([]any, 0, len(x))
		for _, val := range x {
			out = append(out, stripNulls(val))
		}
		return out
	default:
		return v
	}
}

// reMarshal round-trips v through JSON and parses it as a generic
// `any` value so two states can be compared after stripping nulls.
func reMarshal(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return out
}

// reducerFixturesSkipList is a small set of fixtures we intentionally
// skip because they exercise behaviour the Go port doesn't yet match.
// Keep this aligned with the Rust client's similar list — additions
// here should come with an issue link.
var reducerFixturesSkipList = map[string]string{
	// Add entries like "123-foo.json": "reason" when needed.
}

// TestFixtureDrivenReducerParity loads every fixture under
// types/test-cases/reducers/*.json, applies the actions through the
// matching Go reducer, and compares the resulting state with the
// fixture's expected output. This is the primary cross-language
// parity gate for the reducers.
func TestFixtureDrivenReducerParity(t *testing.T) {
	dir := findFixtureDir(t)

	// Use a deterministic timestamp so modifiedAt matches the TypeScript
	// reference reducer: Date.now() === 9999, so chat timestamps become
	// "1970-01-01T00:00:09.999Z".
	const mockNowMillis int64 = 9999
	SetNowProvider(func() int64 { return mockNowMillis })
	t.Cleanup(func() { SetNowProvider(nil) })

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	var passed, skipped, failed int
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		name := entry.Name()
		if reason, skip := reducerFixturesSkipList[name]; skip {
			t.Logf("SKIP %s: %s", name, reason)
			skipped++
			continue
		}

		path := filepath.Join(dir, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("%s: read: %v", name, err)
			failed++
			continue
		}

		var fixture struct {
			Description string            `json:"description"`
			Reducer     string            `json:"reducer"`
			Initial     json.RawMessage   `json:"initial"`
			Actions     []json.RawMessage `json:"actions"`
			Expected    json.RawMessage   `json:"expected"`
		}
		if err := json.Unmarshal(raw, &fixture); err != nil {
			t.Errorf("%s: parse fixture: %v", name, err)
			failed++
			continue
		}

		ok := t.Run(fmt.Sprintf("%s/%s", fixture.Reducer, name), func(tt *testing.T) {
			actions := make([]ahptypes.StateAction, len(fixture.Actions))
			for i, raw := range fixture.Actions {
				if err := json.Unmarshal(raw, &actions[i]); err != nil {
					tt.Fatalf("decode action %d: %v", i, err)
				}
			}

			switch fixture.Reducer {
			case "root":
				runFixture[ahptypes.RootState](tt, fixture.Initial, fixture.Expected, actions, ApplyActionToRoot)
			case "session":
				runFixture[ahptypes.SessionState](tt, fixture.Initial, fixture.Expected, actions, ApplyActionToSession)
			case "chat":
				runFixture[ahptypes.ChatState](tt, fixture.Initial, fixture.Expected, actions, ApplyActionToChat)
			case "terminal":
				runFixture[ahptypes.TerminalState](tt, fixture.Initial, fixture.Expected, actions, ApplyActionToTerminal)
			case "changeset":
				runFixture[ahptypes.ChangesetState](tt, fixture.Initial, fixture.Expected, actions, ApplyActionToChangeset)
			case "annotations":
				runFixture[ahptypes.AnnotationsState](tt, fixture.Initial, fixture.Expected, actions, ApplyActionToAnnotations)
			case "resourceWatch":
				runFixture[ahptypes.ResourceWatchState](tt, fixture.Initial, fixture.Expected, actions, ApplyActionToResourceWatch)
			default:
				tt.Fatalf("unknown reducer kind %q", fixture.Reducer)
			}
		})
		if ok {
			passed++
		} else {
			failed++
		}
	}

	t.Logf("Fixture results: %d passed, %d skipped, %d failed (of %d total)", passed, skipped, failed, passed+skipped+failed)
}

func runFixture[T any](t *testing.T, initial, expected json.RawMessage, actions []ahptypes.StateAction, apply func(*T, ahptypes.StateAction) ReduceOutcome) {
	t.Helper()
	var state T
	if err := json.Unmarshal(initial, &state); err != nil {
		t.Fatalf("decode initial state: %v", err)
	}
	// Round-trip the initial state through marshal/unmarshal to catch
	// any data loss in the generated types before we mutate.
	roundTripped := stripNulls(reMarshal(t, &state))
	originalParsed := stripNulls(parseJSON(t, initial))
	if !reflect.DeepEqual(roundTripped, originalParsed) {
		t.Fatalf("initial state did not survive round-trip:\nre-serialized: %s\noriginal:      %s",
			mustPretty(roundTripped), mustPretty(originalParsed))
	}

	for i, action := range actions {
		_ = apply(&state, action)
		_ = i
	}

	actual := stripNulls(reMarshal(t, &state))
	want := stripNulls(parseJSON(t, expected))
	if !reflect.DeepEqual(actual, want) {
		t.Fatalf("state mismatch:\nactual:   %s\nexpected: %s",
			mustPretty(actual), mustPretty(want))
	}
}

func parseJSON(t *testing.T, raw json.RawMessage) any {
	t.Helper()
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("parse JSON: %v", err)
	}
	return out
}

func mustPretty(v any) string {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Sprintf("<%v>", err)
	}
	return string(b)
}
