/**
 * Automation Channel Actions.
 *
 * @module channels-automation/actions
 */

import { ActionType } from '../common/actions.js';
import type { URI } from '../common/state.js';
import type { AutomationDefinition } from './state.js';
import type { AutomationRunSummary } from '../channels-automation-run/state.js';

/** @category Automation Actions */
export interface AutomationDefinitionChangedAction {
  type: ActionType.AutomationDefinitionChanged;
  definition: AutomationDefinition;
  revision: number;
  modifiedAt: string;
  nextRunAt?: string;
}

/** @category Automation Actions */
export interface AutomationRunSummarySetAction {
  type: ActionType.AutomationRunSummarySet;
  run: AutomationRunSummary;
}

/** @category Automation Actions */
export interface AutomationRunSummaryRemovedAction {
  type: ActionType.AutomationRunSummaryRemoved;
  run: URI;
}

/** @category Automation Actions */
export interface AutomationRunsLoadedAction {
  type: ActionType.AutomationRunsLoaded;
  runs: AutomationRunSummary[];
  nextCursor?: string;
}

