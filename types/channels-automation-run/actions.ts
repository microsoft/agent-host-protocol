/**
 * Automation Run Channel Actions.
 *
 * @module channels-automation-run/actions
 */

import { ActionType } from '../common/actions.js';
import type { URI } from '../common/state.js';
import type { AutomationRunArtifact, AutomationRunLifecycle, AutomationRunOperation } from './state.js';

/** @category Automation Run Actions */
export interface AutomationRunLifecycleChangedAction {
  type: ActionType.AutomationRunLifecycleChanged;
  lifecycle: AutomationRunLifecycle;
  operations: AutomationRunOperation[];
}

/** @category Automation Run Actions */
export interface AutomationRunSessionSetAction {
  type: ActionType.AutomationRunSessionSet;
  session: URI;
}

/** @category Automation Run Actions */
export interface AutomationRunSessionRemovedAction {
  type: ActionType.AutomationRunSessionRemoved;
  session: URI;
}

/** @category Automation Run Actions */
export interface AutomationRunPrimarySessionChangedAction {
  type: ActionType.AutomationRunPrimarySessionChanged;
  primarySession?: URI;
}

/** @category Automation Run Actions */
export interface AutomationRunArtifactSetAction {
  type: ActionType.AutomationRunArtifactSet;
  artifact: AutomationRunArtifact;
}

/** @category Automation Run Actions */
export interface AutomationRunArtifactRemovedAction {
  type: ActionType.AutomationRunArtifactRemoved;
  artifactId: string;
}

/**
 * @category Automation Run Actions
 * @clientDispatchable
 */
export interface AutomationRunCancelRequestedAction {
  type: ActionType.AutomationRunCancelRequested;
}
