/**
 * Automation Channel Actions — server-authored mutations of an
 * `ahp-automation:` channel.
 *
 * @module channels-automation/actions
 */

import { ActionType } from '../common/actions.js';
import type { URI } from '../common/state.js';
import type { AutomationRunSummary } from '../channels-automation-run/state.js';
import type { FetchAutomationRunsParams, UpdateAutomationParams } from './commands.js';
import type { AutomationDefinition, AutomationState } from './state.js';

/**
 * Replace the editable definition after a successful
 * {@link UpdateAutomationParams | updateAutomation} or another host-authorized
 * definition change.
 *
 * Full replacement semantics apply to
 * {@link AutomationDefinitionChangedAction.definition | definition}. The
 * reducer also replaces the revision and modification timestamp. Omitting
 * {@link AutomationDefinitionChangedAction.nextRunAt | nextRunAt} clears the
 * previously projected next occurrence.
 *
 * @category Automation Actions
 * @version 1
 */
export interface AutomationDefinitionChangedAction {
  type: ActionType.AutomationDefinitionChanged;
  /** Complete replacement {@link AutomationState.definition}. */
  definition: AutomationDefinition;
  /** New {@link AutomationState.revision}. */
  revision: number;
  /** New {@link AutomationState.modifiedAt}, in ISO 8601 format. */
  modifiedAt: string;
  /** New {@link AutomationState.nextRunAt}, or omitted to clear it. */
  nextRunAt?: string;
}

/**
 * Upsert one run summary in the retained history.
 *
 * Existing entries are replaced by {@link AutomationRunSummary.resource}. A
 * previously unseen run is inserted at the front because history is
 * newest-first.
 *
 * @category Automation Actions
 * @version 1
 */
export interface AutomationRunSummarySetAction {
  type: ActionType.AutomationRunSummarySet;
  /** New or replacement entry in {@link AutomationState.runs}. */
  run: AutomationRunSummary;
}

/**
 * Remove one retained run summary by its automation-run URI.
 *
 * The action is a no-op when the URI is not present in the current history
 * window.
 *
 * @category Automation Actions
 * @version 1
 */
export interface AutomationRunSummaryRemovedAction {
  type: ActionType.AutomationRunSummaryRemoved;
  /** {@link AutomationRunSummary.resource} to remove. */
  run: URI;
}

/**
 * Append an older page of run summaries returned by
 * {@link FetchAutomationRunsParams | fetchAutomationRuns}.
 *
 * Entries already present by resource URI are ignored, preserving the
 * newest-first ordering of the existing history followed by the fetched page.
 * Omitting {@link AutomationRunsLoadedAction.nextCursor | nextCursor} marks the
 * end of retained history.
 *
 * @category Automation Actions
 * @version 1
 */
export interface AutomationRunsLoadedAction {
  type: ActionType.AutomationRunsLoaded;
  /** Older entries to append to {@link AutomationState.runs}, in newest-first order within this page. */
  runs: AutomationRunSummary[];
  /** New {@link AutomationState.runsNextCursor}, or omitted at the end. */
  nextCursor?: string;
}
