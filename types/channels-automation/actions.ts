/**
 * Automation Catalogue Channel Actions — server-authored mutations of the
 * `ahp-automations://` catalogue.
 *
 * @module channels-automation/actions
 */

import { ActionType } from '../common/actions.js';
import type { URI } from '../common/state.js';
import type { AutomationCatalogState, AutomationState } from './state.js';

/**
 * Add or replace one full automation state in
 * {@link AutomationCatalogState.automations}.
 *
 * Existing entries are matched by {@link AutomationState.resource} and
 * replaced in place. A previously unseen resource is appended.
 *
 * @category Automation Actions
 * @version 1
 */
export interface AutomationSetAction {
  type: ActionType.AutomationSet;
  /** Full new or replacement automation state. */
  automation: AutomationState;
}

/**
 * Remove one automation from {@link AutomationCatalogState.automations}.
 *
 * @category Automation Actions
 * @version 1
 */
export interface AutomationRemovedAction {
  type: ActionType.AutomationRemoved;
  /** {@link AutomationState.resource} to remove. */
  resource: URI;
}
