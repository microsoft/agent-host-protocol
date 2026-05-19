/**
 * Common Action Types — `ActionEnvelope`, `ActionOrigin`, the central
 * `ActionType` enum, and the `StateAction` discriminated union over every
 * per-channel action declaration.
 *
 * @module common/actions
 */

import type { URI } from './state.js';

import type {
  RootAgentsChangedAction,
  RootActiveSessionsChangedAction,
  RootTerminalsChangedAction,
  RootConfigChangedAction,
} from '../channels-root/actions.js';

import type {
  SessionReadyAction,
  SessionCreationFailedAction,
  SessionTurnStartedAction,
  SessionDeltaAction,
  SessionResponsePartAction,
  SessionToolCallStartAction,
  SessionToolCallDeltaAction,
  SessionToolCallReadyAction,
  SessionToolCallConfirmedAction,
  SessionToolCallCompleteAction,
  SessionToolCallResultConfirmedAction,
  SessionToolCallContentChangedAction,
  SessionTurnCompleteAction,
  SessionTurnCancelledAction,
  SessionErrorAction,
  SessionTitleChangedAction,
  SessionUsageAction,
  SessionReasoningAction,
  SessionModelChangedAction,
  SessionServerToolsChangedAction,
  SessionActiveClientChangedAction,
  SessionActiveClientToolsChangedAction,
  SessionPendingMessageSetAction,
  SessionPendingMessageRemovedAction,
  SessionQueuedMessagesReorderedAction,
  SessionInputRequestedAction,
  SessionInputAnswerChangedAction,
  SessionInputCompletedAction,
  SessionCustomizationsChangedAction,
  SessionCustomizationToggledAction,
  SessionCustomizationUpdatedAction,
  SessionTruncatedAction,
  SessionIsReadChangedAction,
  SessionIsArchivedChangedAction,
  SessionActivityChangedAction,
  SessionChangesetsChangedAction,
  SessionConfigChangedAction,
  SessionMetaChangedAction,
} from '../channels-session/actions.js';

import type {
  ChangesetStatusChangedAction,
  ChangesetFileSetAction,
  ChangesetFileRemovedAction,
  ChangesetOperationsChangedAction,
  ChangesetClearedAction,
} from '../channels-changeset/actions.js';

import type {
  TerminalDataAction,
  TerminalInputAction,
  TerminalResizedAction,
  TerminalClaimedAction,
  TerminalTitleChangedAction,
  TerminalCwdChangedAction,
  TerminalExitedAction,
  TerminalClearedAction,
  TerminalCommandDetectionAvailableAction,
  TerminalCommandExecutedAction,
  TerminalCommandFinishedAction,
} from '../channels-terminal/actions.js';

// ─── Action Type Enum ────────────────────────────────────────────────────────

/**
 * Discriminant values for all state actions.
 *
 * @category Actions
 */
export const enum ActionType {
  RootAgentsChanged = 'root/agentsChanged',
  RootActiveSessionsChanged = 'root/activeSessionsChanged',
  SessionReady = 'session/ready',
  SessionCreationFailed = 'session/creationFailed',
  SessionTurnStarted = 'session/turnStarted',
  SessionDelta = 'session/delta',
  SessionResponsePart = 'session/responsePart',
  SessionToolCallStart = 'session/toolCallStart',
  SessionToolCallDelta = 'session/toolCallDelta',
  SessionToolCallReady = 'session/toolCallReady',
  SessionToolCallConfirmed = 'session/toolCallConfirmed',
  SessionToolCallComplete = 'session/toolCallComplete',
  SessionToolCallResultConfirmed = 'session/toolCallResultConfirmed',
  SessionToolCallContentChanged = 'session/toolCallContentChanged',
  SessionTurnComplete = 'session/turnComplete',
  SessionTurnCancelled = 'session/turnCancelled',
  SessionError = 'session/error',
  SessionTitleChanged = 'session/titleChanged',
  SessionUsage = 'session/usage',
  SessionReasoning = 'session/reasoning',
  SessionModelChanged = 'session/modelChanged',
  SessionServerToolsChanged = 'session/serverToolsChanged',
  SessionActiveClientChanged = 'session/activeClientChanged',
  SessionActiveClientToolsChanged = 'session/activeClientToolsChanged',
  SessionPendingMessageSet = 'session/pendingMessageSet',
  SessionPendingMessageRemoved = 'session/pendingMessageRemoved',
  SessionQueuedMessagesReordered = 'session/queuedMessagesReordered',
  SessionInputRequested = 'session/inputRequested',
  SessionInputAnswerChanged = 'session/inputAnswerChanged',
  SessionInputCompleted = 'session/inputCompleted',
  SessionCustomizationsChanged = 'session/customizationsChanged',
  SessionCustomizationToggled = 'session/customizationToggled',
  SessionCustomizationUpdated = 'session/customizationUpdated',
  SessionTruncated = 'session/truncated',
  SessionIsReadChanged = 'session/isReadChanged',
  SessionIsArchivedChanged = 'session/isArchivedChanged',
  SessionActivityChanged = 'session/activityChanged',
  SessionChangesetsChanged = 'session/changesetsChanged',
  SessionConfigChanged = 'session/configChanged',
  SessionMetaChanged = 'session/metaChanged',
  ChangesetStatusChanged = 'changeset/statusChanged',
  ChangesetFileSet = 'changeset/fileSet',
  ChangesetFileRemoved = 'changeset/fileRemoved',
  ChangesetOperationsChanged = 'changeset/operationsChanged',
  ChangesetCleared = 'changeset/cleared',
  RootTerminalsChanged = 'root/terminalsChanged',
  RootConfigChanged = 'root/configChanged',
  TerminalData = 'terminal/data',
  TerminalInput = 'terminal/input',
  TerminalResized = 'terminal/resized',
  TerminalClaimed = 'terminal/claimed',
  TerminalTitleChanged = 'terminal/titleChanged',
  TerminalCwdChanged = 'terminal/cwdChanged',
  TerminalExited = 'terminal/exited',
  TerminalCleared = 'terminal/cleared',
  TerminalCommandDetectionAvailable = 'terminal/commandDetectionAvailable',
  TerminalCommandExecuted = 'terminal/commandExecuted',
  TerminalCommandFinished = 'terminal/commandFinished',
}

// ─── Action Envelope ─────────────────────────────────────────────────────────

/**
 * Identifies the client that originally dispatched an action.
 */
export interface ActionOrigin {
  clientId: string;
  clientSeq: number;
}

/**
 * Every action is wrapped in an `ActionEnvelope`.
 *
 * The envelope identifies the channel the action belongs to (e.g.
 * `ahp-root://` for root actions, the session URI for session actions, the
 * terminal URI for terminal actions). Individual action payloads carry only
 * fields that are intrinsic to the action; the channel comes from the
 * envelope so that any subscribable resource can route its actions uniformly.
 */
export interface ActionEnvelope {
  /** Channel URI this action belongs to. */
  readonly channel: URI;
  readonly action: StateAction;
  readonly serverSeq: number;
  readonly origin: ActionOrigin | undefined;
  readonly rejectionReason?: string;
}

// ─── Discriminated Union ─────────────────────────────────────────────────────

/**
 * Discriminated union of all state actions.
 */
export type StateAction =
  | RootAgentsChangedAction
  | RootActiveSessionsChangedAction
  | RootTerminalsChangedAction
  | RootConfigChangedAction
  | SessionReadyAction
  | SessionCreationFailedAction
  | SessionTurnStartedAction
  | SessionDeltaAction
  | SessionResponsePartAction
  | SessionToolCallStartAction
  | SessionToolCallDeltaAction
  | SessionToolCallReadyAction
  | SessionToolCallConfirmedAction
  | SessionToolCallCompleteAction
  | SessionToolCallResultConfirmedAction
  | SessionToolCallContentChangedAction
  | SessionTurnCompleteAction
  | SessionTurnCancelledAction
  | SessionErrorAction
  | SessionTitleChangedAction
  | SessionUsageAction
  | SessionReasoningAction
  | SessionModelChangedAction
  | SessionServerToolsChangedAction
  | SessionActiveClientChangedAction
  | SessionActiveClientToolsChangedAction
  | SessionPendingMessageSetAction
  | SessionPendingMessageRemovedAction
  | SessionQueuedMessagesReorderedAction
  | SessionInputRequestedAction
  | SessionInputAnswerChangedAction
  | SessionInputCompletedAction
  | SessionCustomizationsChangedAction
  | SessionCustomizationToggledAction
  | SessionCustomizationUpdatedAction
  | SessionTruncatedAction
  | SessionIsReadChangedAction
  | SessionIsArchivedChangedAction
  | SessionActivityChangedAction
  | SessionChangesetsChangedAction
  | SessionConfigChangedAction
  | SessionMetaChangedAction
  | ChangesetStatusChangedAction
  | ChangesetFileSetAction
  | ChangesetFileRemovedAction
  | ChangesetOperationsChangedAction
  | ChangesetClearedAction
  | TerminalDataAction
  | TerminalInputAction
  | TerminalResizedAction
  | TerminalClaimedAction
  | TerminalTitleChangedAction
  | TerminalCwdChangedAction
  | TerminalExitedAction
  | TerminalClearedAction
  | TerminalCommandDetectionAvailableAction
  | TerminalCommandExecutedAction
  | TerminalCommandFinishedAction;
