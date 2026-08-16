/**
 * Automation Commands — trigger discovery and mutation of
 * `ahp-automation:` resources.
 *
 * @module channels-automation/commands
 */

import type { BaseParams } from '../common/commands.js';
import type { URI } from '../common/state.js';
import type { AutomationRunState } from '../channels-automation-run/state.js';
import type { AgentInfo } from '../channels-root/state.js';
import type { AutomationSetAction } from './actions.js';
import type {
  AutomationDefinition,
  AutomationOperation,
  AutomationSchedule,
  AutomationScheduleTrigger,
  AutomationSessionTemplate,
  AutomationState,
  AutomationTrigger,
  AutomationTriggerDefinition,
} from './state.js';
import type { Message } from '../channels-chat/state.js';

/**
 * Discover event-trigger types available for a prospective session template.
 *
 * Hosts may vary definitions by provider, workspace, and session
 * configuration. Schedule triggers are protocol-defined and therefore do not
 * appear in this result.
 *
 * @category Commands
 * @method listAutomationTriggerDefinitions
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface ListAutomationTriggerDefinitionsParams extends BaseParams {
  /** Trigger definitions are discovered from the root channel. */
  channel: 'ahp-root://';
  /** Prospective provider id matching {@link AgentInfo.provider}, or omitted for the host default. */
  provider?: string;
  /** Prospective {@link AutomationSessionTemplate.workingDirectories}. */
  workingDirectories?: URI[];
  /** Prospective resolved {@link AutomationSessionTemplate.config}. */
  sessionConfig?: Record<string, unknown>;
}

/**
 * Host-defined event trigger types available for the supplied context.
 *
 * @category Commands
 */
export interface ListAutomationTriggerDefinitionsResult {
  /** Available event trigger definitions. */
  items: AutomationTriggerDefinition[];
}

/**
 * Initial schedule occurrence retained while an imported automation is disabled.
 *
 * @category Commands
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
 * @category Commands
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
 * Create a durable automation at a client-chosen URI.
 *
 * {@link CreateAutomationParams.resource | `resource`} MUST use the
 * `ahp-automation:` scheme and MUST NOT already identify an unrelated
 * automation. The host validates the complete definition, persists it, and
 * makes it visible through the automation catalogue before returning success.
 *
 * @category Commands
 * @method createAutomation
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface CreateAutomationParams extends BaseParams {
  /** Automation creation is scoped to the catalogue channel. */
  channel: 'ahp-automations://';
  /** Client-chosen `ahp-automation:` URI that becomes {@link AutomationState.resource}. */
  resource: URI;
  /** Complete initial {@link AutomationState.definition}. */
  definition: AutomationDefinition;
  /**
   * Optional legacy import state. When present,
   * {@link CreateAutomationParams.definition} MUST have
   * {@link AutomationDefinition.enabled} set to `false` so automatic triggers
   * cannot run before migration cutover.
   */
  import?: AutomationImport;
}

/**
 * Partial replacement of editable {@link AutomationDefinition} fields.
 *
 * Omitted fields are unchanged. Supplied arrays and objects replace their
 * corresponding values in full; they are not merged recursively.
 *
 * @category Commands
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
 * Update editable fields of an existing automation using optimistic
 * concurrency.
 *
 * The host accepts the patch only when `expectedRevision` equals the current
 * {@link AutomationState.revision}. A stale revision is rejected; clients
 * SHOULD reconcile the latest state before retrying.
 *
 * @category Commands
 * @method updateAutomation
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface UpdateAutomationParams extends BaseParams {
  /** Automation updates are scoped to the catalogue channel. */
  channel: 'ahp-automations://';
  /** Target {@link AutomationState.resource}. */
  automation: URI;
  /** {@link AutomationState.revision} on which the client based {@link UpdateAutomationParams.changes}. */
  expectedRevision: number;
  /** Editable {@link AutomationDefinition} fields to replace. */
  changes: AutomationDefinitionPatch;
}

/**
 * Permanently remove an automation.
 *
 * The host rejects the command when {@link AutomationOperation.Dispose} is not
 * currently advertised, for example while a non-terminal run prevents
 * disposal.
 *
 * @category Commands
 * @method disposeAutomation
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface DisposeAutomationParams extends BaseParams {
  /** Automation disposal is scoped to the catalogue channel. */
  channel: 'ahp-automations://';
  /** Target {@link AutomationState.resource}. */
  automation: URI;
}

/**
 * Start a manual run of an automation.
 *
 * Manual execution is independent of {@link AutomationDefinition.enabled}.
 * The host persists the run before beginning session side effects.
 *
 * @category Commands
 * @method runAutomation
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface RunAutomationParams extends BaseParams {
  /** Manual runs are scoped to the catalogue channel. */
  channel: 'ahp-automations://';
  /** Target {@link AutomationState.resource}. */
  automation: URI;
  /**
   * Durable client-generated idempotency key. Retrying with the same key and
   * automation MUST return the original run URI rather than create another
   * run.
   */
  requestId: string;
}

/**
 * Result identifying the existing or newly created run.
 *
 * @category Commands
 */
export interface RunAutomationResult {
  /** Subscribable `ahp-automation-run:` URI matching {@link AutomationRunState.resource}. */
  run: URI;
}

/**
 * Load one older page into a catalogued automation's run-history state.
 *
 * The response only acknowledges the request. The updated full state arrives
 * through {@link AutomationSetAction | `automation/set`} on the
 * `ahp-automations://` channel, keeping all catalogue subscribers synchronized
 * through the normal action stream.
 *
 * @category Commands
 * @method fetchAutomationRuns
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface FetchAutomationRunsParams extends BaseParams {
  /** Run-history loading is scoped to the catalogue channel. */
  channel: 'ahp-automations://';
  /** Target {@link AutomationState.resource}. */
  automation: URI;
  /**
   * Cursor previously received as {@link AutomationState.runsNextCursor}.
   * Omit to request the first page not already included by the snapshot.
   */
  cursor?: string;
}

/**
 * Empty acknowledgement; the updated automation state is delivered by action.
 *
 * @category Commands
 */
export interface FetchAutomationRunsResult {}

/**
 * Ask the host to evaluate a schedule without creating an automation.
 *
 * Clients SHOULD use this command for validation and preview instead of
 * implementing their own cron evaluator, especially around time-zone
 * transitions.
 *
 * @category Commands
 * @method previewAutomationSchedule
 * @direction Client → Server
 * @messageType Request
 * @version 1
 */
export interface PreviewAutomationScheduleParams extends BaseParams {
  /** Schedule preview is requested from the root channel. */
  channel: 'ahp-root://';
  /** Portable AHP cron schedule to evaluate. */
  schedule: AutomationSchedule;
  /** Requested maximum number of future occurrences; the host MAY cap it. */
  count?: number;
}

/**
 * Host-canonical future schedule occurrences.
 *
 * @category Commands
 */
export interface PreviewAutomationScheduleResult {
  /** Ascending ISO 8601 timestamps. */
  items: string[];
}
