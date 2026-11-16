/**
 * Automation Run Channel State Types for `ahp-automation-run:`.
 *
 * Stability: 1.0 - Early development
 *
 * @module channels-automation-run/state
 */

import type { ErrorInfo, URI, UsageInfo } from '../common/state.js';
import type {
  AutomationEventTrigger,
  AutomationMisfirePolicy,
  AutomationScheduleTrigger,
  AutomationOneTimeTrigger,
  AutomationEntry,
} from '../channels-automation/state.js';
import type { RunAutomationParams } from '../channels-automation/commands.js';
import type { SessionState } from '../channels-session/state.js';
import type { AutomationRunLifecycleChangedAction } from './actions.js';

/**
 * Lifecycle status of one automation run.
 *
 * `completed`, `failed`, `cancelled`, and `skipped` are terminal. A run remains `running`
 * while any linked session awaits input or client-side work; linked session
 * state is authoritative for those interactions.
 *
 * @category Automation Run State
 * @exhaustive
 */
export const enum AutomationRunStatus {
  /** The durable run record exists but execution has not started. */
  Pending = 'pending',
  /** One or more linked sessions are executing or awaiting interaction. */
  Running = 'running',
  /** Execution finished successfully. */
  Completed = 'completed',
  /** Execution ended with an error. */
  Failed = 'failed',
  /** Execution ended because cancellation was accepted. */
  Cancelled = 'cancelled',
  /** A trigger occurrence was recorded but deliberately not executed. */
  Skipped = 'skipped',
}

/**
 * Discriminant describing what created an automation run.
 *
 * @category Automation Run State
 * @exhaustive
 */
export const enum AutomationRunOriginKind {
  /** A client explicitly invoked {@link RunAutomationParams | runAutomation}. */
  Manual = 'manual',
  /** An automatic schedule or event trigger fired. */
  Trigger = 'trigger',
}

/**
 * Origin recorded for a client-requested manual run.
 *
 * @category Automation Run State
 */
export interface AutomationManualRunOrigin {
  kind: AutomationRunOriginKind.Manual;
}

/**
 * Origin recorded for a run created by one of the automation's triggers.
 *
 * @category Automation Run State
 */
export interface AutomationTriggeredRunOrigin {
  kind: AutomationRunOriginKind.Trigger;
  /**
   * Matches the stable {@link AutomationScheduleTrigger.id},
   * {@link AutomationEventTrigger.id}, or {@link AutomationOneTimeTrigger.id}
   * in the definition.
   */
  triggerId: string;
  /**
   * Intended schedule occurrence as an ISO 8601 timestamp. Present for
   * schedule and one-time triggers and normally absent for event triggers.
   */
  scheduledFor?: string;
  /**
   * `true` when this is a catch-up run created by
   * {@link AutomationMisfirePolicy.RunOnce}.
   */
  catchUp?: boolean;
  /**
   * Host-defined, non-secret event provenance suitable for display or audit.
   * This is descriptive context, not an input that clients replay.
   */
  event?: Record<string, unknown>;
}

/**
 * Immutable provenance describing why a run was created.
 *
 * @category Automation Run State
 */
export type AutomationRunOrigin =
  | AutomationManualRunOrigin
  | AutomationTriggeredRunOrigin;

/**
 * A durable run exists but has not begun external execution.
 *
 * @category Automation Run State
 */
export interface AutomationPendingRunLifecycle {
  status: AutomationRunStatus.Pending;
  /** Run creation timestamp in ISO 8601 format. */
  createdAt: string;
  /**
   * Why the run has not started yet, when the host knows. The host updates it
   * by dispatching {@link AutomationRunLifecycleChangedAction} from `pending`
   * to `pending`. A run that cannot proceed and will not retry transitions to
   * `failed` instead.
   */
  waiting?: AutomationRunWaiting;
}

/**
 * Host-reported detail explaining why a pending run is waiting.
 *
 * @category Automation Run State
 * @preserveUnknownMembers
 */
export interface AutomationRunWaiting {
  /**
   * Machine-readable reason the run is waiting. Common values include:
   *
   * - `'capacity'`: the host has no execution capacity right now
   * - `'concurrency'`: waiting for earlier runs of the same automation to finish
   * - `'quota'`: a budget or rate limit was reached
   * - `'authentication'`: waiting for credentials, such as a connected,
   *   authenticated client
   * - `'targetBusy'`: the session or chat the run delivers into is busy
   * - `'retry'`: backing off after a transient failure
   * - `'unavailable'`: the host is paused, draining, or otherwise not running
   *   automations
   */
  reason: string;
  /** Human-readable detail suitable for display. */
  message?: string;
  /** When the host expects to try again, as an ISO 8601 timestamp. */
  retryAt?: string;
}

/**
 * The run is executing linked sessions or awaiting interaction on them.
 *
 * Linked {@link SessionState.status} and {@link SessionState.inputNeeded}
 * remain authoritative for whether user attention or client-side work is
 * required.
 *
 * @category Automation Run State
 */
export interface AutomationRunningRunLifecycle {
  status: AutomationRunStatus.Running;
  /** Run creation timestamp in ISO 8601 format. */
  createdAt: string;
  /** First execution start timestamp in ISO 8601 format. */
  startedAt: string;
}

/**
 * Terminal lifecycle for a successfully completed run.
 *
 * @category Automation Run State
 */
export interface AutomationCompletedRunLifecycle {
  status: AutomationRunStatus.Completed;
  /** Run creation timestamp in ISO 8601 format. */
  createdAt: string;
  /** First execution start timestamp in ISO 8601 format. */
  startedAt: string;
  /** Completion timestamp in ISO 8601 format. */
  completedAt: string;
  /** Optional aggregate model usage across all linked sessions. */
  usage?: UsageInfo;
}

/**
 * Terminal lifecycle for a run that ended with an error.
 *
 * `startedAt` is absent when failure occurred before execution began, such as
 * session-template validation or workspace preparation.
 *
 * @category Automation Run State
 */
export interface AutomationFailedRunLifecycle {
  status: AutomationRunStatus.Failed;
  /** Run creation timestamp in ISO 8601 format. */
  createdAt: string;
  /** First execution start timestamp in ISO 8601 format, when execution began. */
  startedAt?: string;
  /** Failure timestamp in ISO 8601 format. */
  completedAt: string;
  /** Stable machine-readable and human-readable failure information. */
  error: ErrorInfo;
}

/**
 * Terminal lifecycle for a cancelled run.
 *
 * `startedAt` is absent when cancellation completed while the run was still
 * pending.
 *
 * @category Automation Run State
 */
export interface AutomationCancelledRunLifecycle {
  status: AutomationRunStatus.Cancelled;
  /** Run creation timestamp in ISO 8601 format. */
  createdAt: string;
  /** First execution start timestamp in ISO 8601 format, when execution began. */
  startedAt?: string;
  /** Cancellation completion timestamp in ISO 8601 format. */
  completedAt: string;
}

/**
 * Terminal lifecycle for a trigger occurrence that the host recorded but
 * deliberately did not execute.
 *
 * A skipped run never starts and links no sessions. The host either creates
 * the run directly as `skipped` or transitions a `pending` run to `skipped`,
 * for example when an overlap policy coalesces it. Its
 * {@link AutomationTriggeredRunOrigin.scheduledFor} or
 * {@link AutomationTriggeredRunOrigin.event} identifies the occurrence.
 *
 * Skipped runs appear in {@link AutomationEntry.runs} alongside executed runs,
 * so clients can explain a missing result without extra state.
 *
 * @category Automation Run State
 */
export interface AutomationSkippedRunLifecycle {
  status: AutomationRunStatus.Skipped;
  /** Run creation timestamp in ISO 8601 format. */
  createdAt: string;
  /** Timestamp, in ISO 8601 format, at which the host decided to skip the occurrence. */
  completedAt: string;
  /**
   * Machine-readable reason the occurrence was skipped. Common values
   * include:
   *
   * - `'misfire'`: dropped by the trigger's {@link AutomationMisfirePolicy}
   * - `'overlap'`: dropped by an overlap or concurrency policy
   * - `'quota'`: dropped because a budget or rate limit was exhausted
   */
  reason: string;
  /** Human-readable detail suitable for display. */
  message?: string;
  /**
   * Number of consecutive occurrences of the same trigger and reason that this
   * record represents, for example every occurrence missed while the host was
   * offline. The origin identifies the most recent of them. Absent means `1`.
   *
   * Hosts SHOULD coalesce consecutive skips this way rather than recording one
   * run per occurrence, so skipped runs don't push executed runs out of the
   * bounded {@link AutomationEntry.runs} window.
   *
   * @integer
   * @minimum 1
   */
  occurrenceCount?: number;
}

/**
 * Discriminated lifecycle of an automation run.
 *
 * @category Automation Run State
 */
export type AutomationRunLifecycle =
  | AutomationPendingRunLifecycle
  | AutomationRunningRunLifecycle
  | AutomationCompletedRunLifecycle
  | AutomationFailedRunLifecycle
  | AutomationCancelledRunLifecycle
  | AutomationSkippedRunLifecycle;

/**
 * Lightweight projection of a run retained in its automation's history.
 *
 * A summary contains enough information to render run history without
 * subscribing to every `ahp-automation-run:` resource.
 *
 * @category Automation Run State
 */
export interface AutomationRunSummary {
  /** Subscribable `ahp-automation-run:` URI matching {@link AutomationRunState.resource}. */
  resource: URI;
  /** Owning `ahp-automation:` URI matching {@link AutomationRunState.automation}. */
  automation: URI;
  /** Immutable provenance matching {@link AutomationRunState.origin}. */
  origin: AutomationRunOrigin;
  /** Current or terminal lifecycle snapshot matching {@link AutomationRunState.lifecycle}. */
  lifecycle: AutomationRunLifecycle;
  /** Session matching {@link AutomationRunState.primarySession}, when selected. */
  primarySession?: URI;
  /** Number of entries in {@link AutomationRunState.sessions}. */
  sessionCount: number;
  /** Opaque host-defined summary metadata. */
  _meta?: Record<string, unknown>;
}

/**
 * Authoritative state of one subscribed `ahp-automation-run:` resource.
 *
 * The run channel owns task-level lifecycle, provenance, and linked-session
 * membership. Linked session and chat channels remain authoritative for
 * transcripts, tools, interaction requirements, changesets, and per-session
 * lifecycle.
 *
 * @category Automation Run State
 */
export interface AutomationRunState {
  /** URI of this automation-run channel. */
  resource: URI;
  /** Owning `ahp-automation:` URI matching {@link AutomationEntry.resource}. */
  automation: URI;
  /** Immutable provenance describing how this run was created. */
  origin: AutomationRunOrigin;
  /** Current or terminal lifecycle. */
  lifecycle: AutomationRunLifecycle;
  /**
   * Ordered, unique session URIs belonging to this run, each matching
   * {@link SessionState.resource}. Entries may represent retries, parallel
   * workers, or delegated attempts.
   */
  sessions: URI[];
  /** Member of {@link AutomationRunState.sessions} that the host recommends opening first. */
  primarySession?: URI;
  /** Opaque host-defined run metadata. */
  _meta?: Record<string, unknown>;
}
