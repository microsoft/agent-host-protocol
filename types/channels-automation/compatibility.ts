/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AutomationAction } from '../action-origin.generated.js';
import { ActionType } from '../common/actions.js';
import type { AutomationCapabilities, ClientCapabilities } from '../common/commands.js';
import { AutomationTriggerKind, type AutomationState, type AutomationTrigger } from './state.js';

function hasOneTimeTrigger(triggers: readonly AutomationTrigger[] | undefined): boolean {
  return triggers?.some(trigger => trigger.kind === AutomationTriggerKind.OneTime) === true;
}

/** A changed catalogue view requires a fresh initialize, not replay of the previous view. */
export function canResumeAutomationCatalogue(previous: ClientCapabilities | undefined, current: ClientCapabilities | undefined): boolean {
  return (previous?.automations?.oneTime !== undefined) === (current?.automations?.oneTime !== undefined);
}

/** Projects host capabilities for one connection; opt-in is not inferred from protocol version. */
export function automationCapabilitiesForClient(
  capabilities: AutomationCapabilities,
  client?: ClientCapabilities,
): AutomationCapabilities {
  if (client?.automations?.oneTime !== undefined) return capabilities;
  const legacy = { ...capabilities };
  delete legacy.oneTime;
  delete legacy.existingConversation;
  return legacy;
}

/** Applies to initialize, subscribe, reconnect, and windowed-delivery snapshots. */
export function automationStateForClient(state: AutomationState, client?: ClientCapabilities): AutomationState {
  if (client?.automations?.oneTime !== undefined) return state;
  return { ...state, entries: state.entries.filter(entry => !hasOneTimeTrigger(entry.definition.triggers)) };
}

/** Applies before encoding live or replayed actions, retaining the original envelope's sequence. */
export function automationActionForClient(action: AutomationAction, client?: ClientCapabilities): AutomationAction | undefined {
  if (client?.automations?.oneTime !== undefined) return action;
  switch (action.type) {
    case ActionType.AutomationSet:
      // Remove a previously visible entry if an update changes it to one-time.
      return hasOneTimeTrigger(action.automation.definition.triggers)
        ? { type: ActionType.AutomationRemoved, resource: action.automation.resource }
        : action;
    case ActionType.AutomationCreateRequested:
      return hasOneTimeTrigger(action.definition.triggers) ? undefined : action;
    case ActionType.AutomationUpdateRequested:
      return hasOneTimeTrigger(action.changes.triggers) ? undefined : action;
    case ActionType.AutomationRemoved:
      return action;
  }
}
