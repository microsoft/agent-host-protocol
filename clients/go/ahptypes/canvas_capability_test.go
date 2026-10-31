// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package ahptypes

import (
	"encoding/json"
	"testing"
)

func TestCanvasCapabilityPresenceRoundTrip(t *testing.T) {
	var capabilities AgentCapabilities
	if err := json.Unmarshal([]byte(`{"canvases":{}}`), &capabilities); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(capabilities)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"canvases":{}}` {
		t.Fatalf("canvas capability presence was not preserved: %s", encoded)
	}
}
