package ahp

import (
	"reflect"
	"testing"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestMultiHostStateMirrorCanvasLifecycle(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	uri := ahptypes.URI("ahp-canvas:/preview")
	state := ahptypes.CanvasState{
		InstanceId:  "preview",
		ExtensionId: "project:preview",
		CanvasId:    "preview",
	}
	mirror.PutCanvas("host-a", uri, state)
	mirror.PutCanvas("host-b", uri, state)
	mirror.DropResource("host-a", uri)
	_, removed := mirror.Canvas("host-a", uri)
	retained, found := mirror.Canvas("host-b", uri)
	mirror.PutCanvas("host-a", uri, state)
	mirror.DropHost("host-a")
	_, dropped := mirror.Canvas("host-a", uri)
	_, otherHost := mirror.Canvas("host-b", uri)
	if removed || !found || !reflect.DeepEqual(retained, state) || dropped || !otherHost {
		t.Fatal("canvas state was not isolated or removed with its resource and host")
	}
}

func TestMultiHostStateMirrorDropHostWithoutChangesets(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	automationURI := ahptypes.URI("ahp-automation:/nightly")
	runURI := ahptypes.URI("ahp-automation-run:/nightly/1")

	mirror.PutAutomationCatalog("removed", ahptypes.AutomationState{
		Entries: []ahptypes.AutomationEntry{{Resource: automationURI}},
	})
	mirror.PutAutomationRun("removed", runURI, ahptypes.AutomationRunState{Resource: runURI})
	mirror.PutAutomationCatalog("retained", ahptypes.AutomationState{
		Entries: []ahptypes.AutomationEntry{{Resource: automationURI}},
	})
	mirror.PutAutomationRun("retained", runURI, ahptypes.AutomationRunState{Resource: runURI})

	mirror.DropHost("removed")

	if _, ok := mirror.Automation("removed", automationURI); ok {
		t.Error("automation for dropped host was retained")
	}
	if _, ok := mirror.AutomationCatalog("removed"); ok {
		t.Error("automation catalogue for dropped host was retained")
	}
	if _, ok := mirror.AutomationRun("removed", runURI); ok {
		t.Error("automation run for dropped host was retained")
	}
	if _, ok := mirror.Automation("retained", automationURI); !ok {
		t.Error("automation for other host was removed")
	}
	if _, ok := mirror.AutomationRun("retained", runURI); !ok {
		t.Error("automation run for other host was removed")
	}
}

func TestMultiHostStateMirrorDropResourceRemovesAutomationCatalogue(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	automationURI := ahptypes.URI("ahp-automation:/nightly")
	runURI := ahptypes.URI("ahp-automation-run:/nightly/1")

	mirror.PutAutomationCatalog("host", ahptypes.AutomationState{
		Entries: []ahptypes.AutomationEntry{{Resource: automationURI}},
	})
	mirror.PutAutomationRun("host", runURI, ahptypes.AutomationRunState{Resource: runURI})

	mirror.DropResource("host", "ahp-automations://")
	mirror.DropResource("host", runURI)

	if _, ok := mirror.AutomationCatalog("host"); ok {
		t.Error("automation catalogue for dropped resource was retained")
	}
	if _, ok := mirror.Automation("host", automationURI); ok {
		t.Error("automation for dropped resource was retained")
	}
	if _, ok := mirror.AutomationRun("host", runURI); ok {
		t.Error("automation run for dropped resource was retained")
	}
}
