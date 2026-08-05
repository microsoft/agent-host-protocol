package ahp

import (
	"testing"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestMultiHostStateMirrorDropHostWithoutChangesets(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	automationURI := ahptypes.URI("ahp-automation:/nightly")
	runURI := ahptypes.URI("ahp-automation-run:/nightly/1")

	mirror.PutAutomation("removed", automationURI, ahptypes.AutomationState{Resource: automationURI})
	mirror.PutAutomationRun("removed", runURI, ahptypes.AutomationRunState{Resource: runURI})
	mirror.PutAutomation("retained", automationURI, ahptypes.AutomationState{Resource: automationURI})
	mirror.PutAutomationRun("retained", runURI, ahptypes.AutomationRunState{Resource: runURI})

	mirror.DropHost("removed")

	if _, ok := mirror.Automation("removed", automationURI); ok {
		t.Error("automation for dropped host was retained")
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

func TestMultiHostStateMirrorDropResourceRemovesAutomationState(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	automationURI := ahptypes.URI("ahp-automation:/nightly")
	runURI := ahptypes.URI("ahp-automation-run:/nightly/1")

	mirror.PutAutomation("host", automationURI, ahptypes.AutomationState{Resource: automationURI})
	mirror.PutAutomationRun("host", runURI, ahptypes.AutomationRunState{Resource: runURI})

	mirror.DropResource("host", automationURI)
	mirror.DropResource("host", runURI)

	if _, ok := mirror.Automation("host", automationURI); ok {
		t.Error("automation for dropped resource was retained")
	}
	if _, ok := mirror.AutomationRun("host", runURI); ok {
		t.Error("automation run for dropped resource was retained")
	}
}
