/**
 * Automation Catalogue Channel Actions — mutations of the
 * `ahp-automations://` catalogue.
 *
 * @module channels-automation/actions
 */

import { ActionType } from '../common/actions.js';
import type { Message } from '../channels-chat/state.js';
import type { URI } from '../common/state.js';
import type {
  AutomationCatalogState,
  AutomationDefinition,
  AutomationOperation,
  AutomationScheduleTrigger,
  AutomationSessionTemplate,
  AutomationState,
  AutomationTrigger,
} from './state.js';

/**
 * Initial schedule occurrence retained while an imported automation is
 * disabled.
 *
 * @category Automation Actions
 */
export interface AutomationImportTriggerNextRun {
  /** Stable {@link AutomationScheduleTrigger.id} in the imported definition. */
  triggerId: string;
  /** Source scheduler's next unevaluated occurrence, as an ISO 8601 timestamp. */
  nextRunAt: string;
}

/**
 * Stable source identity and scheduler state for a legacy automation import.
 *
 * The host remembers the identity independently of the client-chosen automation
 * URI. Retrying with the same identity MUST resolve to the previously imported
 * item rather than creating a duplicate.
 *
 * @category Automation Actions
 */
export interface AutomationImport {
  /** Stable namespace identifying the source implementation or store. */
  source: string;
  /** Identifier shared by every item in one import attempt. */
  batchId: string;
  /** Stable source-side identifier for this definition within the batch. */
  itemId: string;
  /** Source schedule occurrences to retain until {@link AutomationDefinition.enabled} becomes `true`. */
  triggerNextRuns?: AutomationImportTriggerNextRun[];
}

/**
 * Partial replacement of editable {@link AutomationDefinition} fields.
 *
 * Omitted fields are unchanged. Supplied arrays and objects replace their
 * corresponding values in full; they are not merged recursively.
 *
 * @category Automation Actions
 */
export interface AutomationDefinitionPatch {
  /** Replacement {@link AutomationDefinition.title}. */
  title?: string;
  /** Replacement {@link AutomationDefinition.message}. */
  message?: Message;
  /** Replacement {@link AutomationDefinition.session}. */
  session?: AutomationSessionTemplate;
  /** Replacement {@link AutomationDefinition.enabled}. */
  enabled?: boolean;
  /** Complete replacement {@link AutomationDefinition.triggers}. */
  triggers?: AutomationTrigger[];
  /** Complete replacement {@link AutomationDefinition._meta}. */
  _meta?: Record<string, unknown>;
}

/**
 * Ask the host to create a durable automation at a client-chosen resource.
 *
 * Clients may dispatch this action only when the host advertises its `create`
 * automation capability. {@link AutomationCreateRequestedAction.resource |
 * `resource`} MUST use the `ahp-automation:` scheme and MUST NOT already
 * identify an unrelated automation.
 *
 * This side-effect request leaves optimistic catalogue state unchanged. The
 * host validates and persists the definition, then publishes the authoritative
 * result with {@link AutomationSetAction | `automation/set`}. Rejections leave
 * the catalogue unchanged.
 *
 * @category Automation Actions
 * @version 1
 * @clientDispatchable
 */
export interface AutomationCreateRequestedAction {
  type: ActionType.AutomationCreateRequested;
  /** Client-chosen `ahp-automation:` URI that becomes {@link AutomationState.resource}. */
  resource: URI;
  /** Complete initial {@link AutomationState.definition}. */
  definition: AutomationDefinition;
  /**
   * Optional legacy import state. When present,
   * {@link AutomationCreateRequestedAction.definition} MUST have
   * {@link AutomationDefinition.enabled} set to `false` so automatic triggers
   * cannot run before migration cutover.
   */
  import?: AutomationImport;
}

/**
 * Ask the host to update editable fields of an existing automation.
 *
 * Clients may dispatch this action only while the target advertises
 * {@link AutomationOperation.Update}. The host revalidates that operation and
 * the client's authorization.
 *
 * This side-effect request leaves optimistic catalogue state unchanged. The
 * host accepts the patch only when
 * {@link AutomationUpdateRequestedAction.expectedRevision} equals the current
 * {@link AutomationState.revision}, then publishes the authoritative result
 * with {@link AutomationSetAction | `automation/set`}.
 *
 * @category Automation Actions
 * @version 1
 * @clientDispatchable
 */
export interface AutomationUpdateRequestedAction {
  type: ActionType.AutomationUpdateRequested;
  /** Target {@link AutomationState.resource}. */
  resource: URI;
  /** {@link AutomationState.revision} on which the client based the changes. */
  expectedRevision: number;
  /** Editable {@link AutomationDefinition} fields to replace. */
  changes: AutomationDefinitionPatch;
}

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
 * Clients may dispatch this action only while the target advertises
 * {@link AutomationOperation.Dispose}. The host revalidates that operation
 * before permanently deleting the automation. A rejected action leaves the
 * authoritative catalogue and durable definition unchanged.
 *
 * Removing an unknown resource is a no-op.
 *
 * @category Automation Actions
 * @version 1
 * @clientDispatchable
 */
export interface AutomationRemovedAction {
  type: ActionType.AutomationRemoved;
  /** {@link AutomationState.resource} to remove. */
  resource: URI;
}
