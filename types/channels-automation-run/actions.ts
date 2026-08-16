/**
 * Automation Run Channel Actions — mutations and side-effect requests scoped
 * to an `ahp-automation-run:` channel.
 *
 * @module channels-automation-run/actions
 */

import { ActionType } from '../common/actions.js';
import type { URI } from '../common/state.js';
import type {
  AutomationRunArtifact,
  AutomationRunLifecycle,
  AutomationRunOperation,
  AutomationRunState,
} from './state.js';

/**
 * Replace the run lifecycle and currently allowed operations atomically.
 *
 * The host dispatches this action for every lifecycle transition. Terminal
 * lifecycles normally carry an empty operations list.
 *
 * @category Automation Run Actions
 * @version 1
 */
export interface AutomationRunLifecycleChangedAction {
  type: ActionType.AutomationRunLifecycleChanged;
  /** Complete replacement {@link AutomationRunState.lifecycle}. */
  lifecycle: AutomationRunLifecycle;
  /** Complete replacement {@link AutomationRunState.operations}. */
  operations: AutomationRunOperation[];
}

/**
 * Add a session to {@link AutomationRunState.sessions}.
 *
 * Session URIs are unique. Setting an existing URI is a no-op.
 *
 * @category Automation Run Actions
 * @version 1
 */
export interface AutomationRunSessionSetAction {
  type: ActionType.AutomationRunSessionSet;
  /** Session URI to append to {@link AutomationRunState.sessions} when not already linked. */
  session: URI;
}

/**
 * Remove a linked session from the run.
 *
 * Removing the current primary session also clears
 * {@link AutomationRunState.primarySession}. An unknown URI is a no-op.
 *
 * @category Automation Run Actions
 * @version 1
 */
export interface AutomationRunSessionRemovedAction {
  type: ActionType.AutomationRunSessionRemoved;
  /** Entry in {@link AutomationRunState.sessions} to remove. */
  session: URI;
}

/**
 * Select or clear the session clients should open first for this run.
 *
 * @category Automation Run Actions
 * @version 1
 */
export interface AutomationRunPrimarySessionChangedAction {
  type: ActionType.AutomationRunPrimarySessionChanged;
  /** New {@link AutomationRunState.primarySession}, or omitted to clear the selection. */
  primarySession?: URI;
}

/**
 * Upsert a run-scoped artifact by {@link AutomationRunArtifact.id}.
 *
 * @category Automation Run Actions
 * @version 1
 */
export interface AutomationRunArtifactSetAction {
  type: ActionType.AutomationRunArtifactSet;
  /** New or replacement entry in {@link AutomationRunState.artifacts}. */
  artifact: AutomationRunArtifact;
}

/**
 * Remove a run-scoped artifact by id.
 *
 * The action is a no-op when the id is not present.
 *
 * @category Automation Run Actions
 * @version 1
 */
export interface AutomationRunArtifactRemovedAction {
  type: ActionType.AutomationRunArtifactRemoved;
  /** {@link AutomationRunArtifact.id} to remove. */
  artifactId: string;
}

/**
 * Ask the host to cancel this run.
 *
 * This is the only client-dispatchable automation-run action. It is a
 * side-effect request and deliberately leaves optimistic state unchanged. The
 * authoritative outcome arrives later through
 * {@link AutomationRunLifecycleChangedAction}: cancellation may transition to
 * `cancelled`, or the run may complete or fail before cancellation takes
 * effect.
 *
 * @category Automation Run Actions
 * @version 1
 * @clientDispatchable
 */
export interface AutomationRunCancelRequestedAction {
  type: ActionType.AutomationRunCancelRequested;
}
