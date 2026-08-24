package ahp

import (
	"testing"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestMultiHostStateMirrorDropHostWithoutChangesets(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	automationURI := ahptypes.URI("ahp-automation:/nightly")
	runURI := ahptypes.URI("ahp-automation-run:/nightly/1")

	mirror.PutAutomationCatalog("removed", ahptypes.AutomationCatalogState{
		Automations: []ahptypes.AutomationState{{Resource: automationURI}},
	})
	mirror.PutAutomationRun("removed", runURI, ahptypes.AutomationRunState{Resource: runURI})
	mirror.PutAutomationCatalog("retained", ahptypes.AutomationCatalogState{
		Automations: []ahptypes.AutomationState{{Resource: automationURI}},
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

	mirror.PutAutomationCatalog("host", ahptypes.AutomationCatalogState{
		Automations: []ahptypes.AutomationState{{Resource: automationURI}},
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

func TestMultiHostStateMirrorDropResourceRemovesTunnelCatalogue(t *testing.T) {
	mirror := NewMultiHostStateMirror()
	mirror.PutTunnelCatalog("host", ahptypes.TunnelsState{})

	mirror.DropResource("host", "ahp-tunnels://")

	if _, ok := mirror.TunnelCatalog("host"); ok {
		t.Error("tunnels state for dropped resource was retained")
	}
}
