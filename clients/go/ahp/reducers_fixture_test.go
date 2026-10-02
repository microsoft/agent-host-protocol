package ahp

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
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

type reducerFixture struct {
	Description   string            `json:"description"`
	Reducer       string            `json:"reducer"`
	Initial       json.RawMessage   `json:"initial"`
	Actions       []json.RawMessage `json:"actions"`
	Expected      json.RawMessage   `json:"expected"`
	ExpectedError string            `json:"expectedError"`
}

// TestFixtureDrivenReducerParity loads every fixture under
// types/test-cases/reducers/*.json, applies the actions through the
// matching Go reducer, and compares the resulting state with the
// fixture's expected output. This is the primary cross-language
// parity gate for the reducers.
func TestFixtureDrivenReducerParity(t *testing.T) {
	dir := findFixtureDir(t)

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

		var fixture reducerFixture
		if err := json.Unmarshal(raw, &fixture); err != nil {
			t.Errorf("%s: parse fixture: %v", name, err)
			failed++
			continue
		}

		ok := t.Run(fmt.Sprintf("%s/%s", fixture.Reducer, name), func(tt *testing.T) {
			switch fixture.Reducer {
			case "root":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToRoot))
			case "session":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToSession))
			case "chat":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToChat))
			case "terminal":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToTerminal))
			case "changeset":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToChangeset))
			case "annotations":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToAnnotations))
			case "resourceWatch":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToResourceWatch))
			case "automation":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToAutomation))
			case "automationRun":
				runFixture(tt, fixture, reducerWithoutError(ApplyActionToAutomationRun))
			case "tcp":
				runFixture(tt, fixture, ApplyActionToTCP)
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

func reducerWithoutError[T any](apply func(*T, ahptypes.StateAction) ReduceOutcome) func(*T, ahptypes.StateAction) (ReduceOutcome, error) {
	return func(state *T, action ahptypes.StateAction) (ReduceOutcome, error) {
		return apply(state, action), nil
	}
}

func runFixture[T any](t *testing.T, fixture reducerFixture, apply func(*T, ahptypes.StateAction) (ReduceOutcome, error)) {
	t.Helper()
	var state T
	if err := json.Unmarshal(fixture.Initial, &state); err != nil {
		t.Fatalf("decode initial state: %v", err)
	}
	// Round-trip the initial state through marshal/unmarshal to catch
	// any data loss in the generated types before we mutate.
	roundTripped := stripNulls(reMarshal(t, &state))
	originalParsed := stripNulls(parseJSON(t, fixture.Initial))
	if !reflect.DeepEqual(roundTripped, originalParsed) {
		t.Fatalf("initial state did not survive round-trip:\nre-serialized: %s\noriginal:      %s",
			mustPretty(roundTripped), mustPretty(originalParsed))
	}

	if fixture.ExpectedError != "" && len(fixture.Actions) == 0 {
		t.Fatal("expectedError requires a final action")
	}
	for i, raw := range fixture.Actions {
		expectError := fixture.ExpectedError != "" && i == len(fixture.Actions)-1
		before := reMarshal(t, &state)
		var action ahptypes.StateAction
		if err := json.Unmarshal(raw, &action); err != nil {
			var typeError *json.UnmarshalTypeError
			offset, fractional := parseJSON(t, raw).(map[string]any)["offset"].(float64)
			if !expectError || fixture.Reducer != "tcp" ||
				fixture.ExpectedError != "Invalid TCP action: offset must be a nonnegative safe integer" ||
				!fractional || math.Mod(offset, 1) == 0 ||
				!errors.As(err, &typeError) || typeError.Type.Kind() != reflect.Int64 || typeError.Field != "offset" {
				t.Fatalf("decode action %d: %v", i, err)
			}
			t.Logf("final fractional action rejected by native int64 deserializer: %v", err)
		} else {
			_, err := apply(&state, action)
			if expectError {
				if err == nil || err.Error() != fixture.ExpectedError {
					t.Fatalf("action %d: expected error %q, got %v", i, fixture.ExpectedError, err)
				}
			} else if err != nil {
				t.Fatalf("action %d: unexpected reducer error: %v", i, err)
			}
		}
		if expectError && !reflect.DeepEqual(before, reMarshal(t, &state)) {
			t.Fatalf("rejected action %d mutated state", i)
		}
	}

	actual := stripNulls(reMarshal(t, &state))
	want := stripNulls(parseJSON(t, fixture.Expected))
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

func tcpTestState() ahptypes.TcpConnectionState {
	direction := ahptypes.FlowControlledByteDirectionState{WindowBytes: 8, MaximumChunkSize: 6}
	return ahptypes.TcpConnectionState{
		Session: "ahp-session:/s1", Target: ahptypes.TcpTarget{Host: "localhost", Port: 3000},
		Encoding: ahptypes.TcpDataEncodingBase64, Input: direction, Output: direction,
	}
}

func TestTCPReducerLargePayload(t *testing.T) {
	const size = 4 * 1024 * 1024
	data := strings.Repeat("A", 4*((size+2)/3)-2) + "=="
	for _, actionType := range []string{"tcp/input", "tcp/data"} {
		t.Run(actionType, func(t *testing.T) {
			state := tcpTestState()
			state.Input.WindowBytes, state.Output.WindowBytes = size, size
			state.Input.MaximumChunkSize, state.Output.MaximumChunkSize = size, size
			var action ahptypes.StateAction
			raw, err := json.Marshal(map[string]any{"type": actionType, "offset": 0, "data": data})
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(raw, &action); err != nil {
				t.Fatal(err)
			}
			if outcome, err := ApplyActionToTCP(&state, action); outcome != ReduceOutcomeApplied || err != nil {
				t.Fatalf("large chunk: %v, %v", outcome, err)
			}
			direction := state.Input
			if actionType == "tcp/data" {
				direction = state.Output
			}
			if direction.ReceivedBytes != size {
				t.Fatalf("received %d bytes, want %d", direction.ReceivedBytes, size)
			}
			before := reMarshal(t, state)
			if outcome, err := ApplyActionToTCP(&state, action); outcome != ReduceOutcomeNoOp || err != nil {
				t.Fatalf("duplicate: %v, %v", outcome, err)
			}
			// Even a fully duplicated range must pass canonical encoding validation.
			switch a := action.Value.(type) {
			case *ahptypes.TcpInputAction:
				a.Data = data[:len(data)-3] + "B=="
			case *ahptypes.TcpDataAction:
				a.Data = data[:len(data)-3] + "B=="
			}
			_, err = ApplyActionToTCP(&state, action)
			var tcpError *TcpReduceError
			if !errors.As(err, &tcpError) || tcpError.Reason != "noncanonical base64 padding bits" {
				t.Fatalf("invalid padding: %v", err)
			}
			if !reflect.DeepEqual(before, reMarshal(t, state)) {
				t.Fatal("duplicate or rejected chunk mutated state")
			}
		})
	}
}

func TestTCPReducerNativeIntegerBounds(t *testing.T) {
	for _, actionType := range []string{"tcp/input", "tcp/data", "tcp/inputConsumed", "tcp/dataConsumed", "tcp/inputEof", "tcp/dataEof"} {
		t.Run(actionType, func(t *testing.T) {
			field := "offset"
			if strings.HasSuffix(actionType, "Consumed") {
				field = "consumedBytes"
			} else if strings.HasSuffix(actionType, "Eof") {
				field = "finalOffset"
			}

			for _, value := range []int64{math.MinInt64, -1, tcpMaxSafeInteger + 1, math.MaxInt64} {
				state := tcpTestState()
				before := reMarshal(t, state)
				raw, err := json.Marshal(map[string]any{"type": actionType, field: value, "data": "AA=="})
				if err != nil {
					t.Fatal(err)
				}
				var action ahptypes.StateAction
				if err := json.Unmarshal(raw, &action); err != nil {
					t.Fatal(err)
				}
				outcome, err := ApplyActionToTCP(&state, action)
				var tcpError *TcpReduceError
				if outcome != ReduceOutcomeNoOp || !errors.As(err, &tcpError) ||
					tcpError.Reason != "offset must be a nonnegative safe integer" {
					t.Fatalf("%d: %v, %v", value, outcome, err)
				}
				if !reflect.DeepEqual(before, reMarshal(t, state)) {
					t.Fatal("invalid integer mutated state")
				}
			}
		})
	}
	state := tcpTestState()
	state.Input.ReceivedBytes, state.Input.ConsumedBytes = tcpMaxSafeInteger-1, tcpMaxSafeInteger-1
	action := ahptypes.StateAction{Value: &ahptypes.TcpInputAction{Offset: tcpMaxSafeInteger - 1, Data: "AA=="}}
	if outcome, err := ApplyActionToTCP(&state, action); outcome != ReduceOutcomeApplied || err != nil || state.Input.ReceivedBytes != tcpMaxSafeInteger {
		t.Fatalf("last safe byte: %v, %v", outcome, err)
	}
}

func TestTCPReducerNonASCIIErrorOrder(t *testing.T) {
	for _, test := range []struct {
		data, reason string
	}{
		{"\u00e9\u00e9\u00e9", "base64 encoding"},
		{"\U0001f600\U0001f600", "base64 encoding"},
		{"\U0001f600\U0001f600A", "chunk size"},
	} {
		state := tcpTestState()
		state.Input.MaximumChunkSize = 1
		before := reMarshal(t, state)
		_, err := ApplyActionToTCP(&state, ahptypes.StateAction{Value: &ahptypes.TcpInputAction{Offset: 0, Data: test.data}})
		var tcpError *TcpReduceError
		if !errors.As(err, &tcpError) || tcpError.Reason != test.reason {
			t.Fatalf("%q: got %v, want %s", test.data, err, test.reason)
		}
		if !reflect.DeepEqual(before, reMarshal(t, state)) {
			t.Fatal("invalid encoding mutated state")
		}
	}
}
