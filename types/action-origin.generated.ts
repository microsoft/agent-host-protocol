// Generated from types/actions.ts — do not edit
// Run `npm run generate` to regenerate.

import type {
  StateAction,
  RootAgentsChangedAction,
  RootActiveSessionsChangedAction,
  RootTerminalsChangedAction,
  RootConfigChangedAction,
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
  SessionAgentChangedAction,
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
  SessionCustomizationRemovedAction,
  SessionTruncatedAction,
  SessionIsReadChangedAction,
  SessionIsArchivedChangedAction,
  SessionActivityChangedAction,
  SessionChangesetsChangedAction,
  SessionConfigChangedAction,
  SessionMetaChangedAction,
  ChangesetStatusChangedAction,
  ChangesetFileSetAction,
  ChangesetFileRemovedAction,
  ChangesetOperationsChangedAction,
  ChangesetOperationStatusChangedAction,
  ChangesetClearedAction,
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
  ResourceWatchChangedAction,
} from './actions.js';

import { ActionType } from './actions.js';

// ─── Root vs Session vs Terminal vs Changeset Action Unions ─────────────────

/** Union of all root-scoped actions. */
export type RootAction =
  | RootAgentsChangedAction
  | RootActiveSessionsChangedAction
  | RootTerminalsChangedAction
  | RootConfigChangedAction
;

/** Union of root actions that clients may dispatch. */
export type ClientRootAction =
  | RootConfigChangedAction
;

/** Union of root actions that only the server may produce. */
export type ServerRootAction =
  | RootAgentsChangedAction
  | RootActiveSessionsChangedAction
  | RootTerminalsChangedAction
;

/** Union of all session-scoped actions. */
export type SessionAction =
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
  | SessionAgentChangedAction
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
  | SessionCustomizationRemovedAction
  | SessionTruncatedAction
  | SessionIsReadChangedAction
  | SessionIsArchivedChangedAction
  | SessionActivityChangedAction
  | SessionChangesetsChangedAction
  | SessionConfigChangedAction
  | SessionMetaChangedAction
;

/** Union of session actions that clients may dispatch. */
export type ClientSessionAction =
  | SessionTurnStartedAction
  | SessionToolCallConfirmedAction
  | SessionToolCallCompleteAction
  | SessionToolCallResultConfirmedAction
  | SessionToolCallContentChangedAction
  | SessionTurnCancelledAction
  | SessionTitleChangedAction
  | SessionModelChangedAction
  | SessionAgentChangedAction
  | SessionActiveClientChangedAction
  | SessionActiveClientToolsChangedAction
  | SessionPendingMessageSetAction
  | SessionPendingMessageRemovedAction
  | SessionQueuedMessagesReorderedAction
  | SessionInputAnswerChangedAction
  | SessionInputCompletedAction
  | SessionCustomizationToggledAction
  | SessionTruncatedAction
  | SessionIsReadChangedAction
  | SessionIsArchivedChangedAction
  | SessionConfigChangedAction
;

/** Union of session actions that only the server may produce. */
export type ServerSessionAction =
  | SessionReadyAction
  | SessionCreationFailedAction
  | SessionDeltaAction
  | SessionResponsePartAction
  | SessionToolCallStartAction
  | SessionToolCallDeltaAction
  | SessionToolCallReadyAction
  | SessionTurnCompleteAction
  | SessionErrorAction
  | SessionUsageAction
  | SessionReasoningAction
  | SessionServerToolsChangedAction
  | SessionInputRequestedAction
  | SessionCustomizationsChangedAction
  | SessionCustomizationUpdatedAction
  | SessionCustomizationRemovedAction
  | SessionActivityChangedAction
  | SessionChangesetsChangedAction
  | SessionMetaChangedAction
;

/** Union of all terminal-scoped actions. */
export type TerminalAction =
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
  | TerminalCommandFinishedAction
;

/** Union of terminal actions that clients may dispatch. */
export type ClientTerminalAction =
  | TerminalInputAction
  | TerminalResizedAction
  | TerminalClaimedAction
  | TerminalTitleChangedAction
  | TerminalClearedAction
;

/** Union of terminal actions that only the server may produce. */
export type ServerTerminalAction =
  | TerminalDataAction
  | TerminalCwdChangedAction
  | TerminalExitedAction
  | TerminalCommandDetectionAvailableAction
  | TerminalCommandExecutedAction
  | TerminalCommandFinishedAction
;

/** Union of all changeset-scoped actions. */
export type ChangesetAction =
  | ChangesetStatusChangedAction
  | ChangesetFileSetAction
  | ChangesetFileRemovedAction
  | ChangesetOperationsChangedAction
  | ChangesetOperationStatusChangedAction
  | ChangesetClearedAction
;

/** Union of changeset actions that clients may dispatch. */
export type ClientChangesetAction =
  never
;

/** Union of changeset actions that only the server may produce. */
export type ServerChangesetAction =
  | ChangesetStatusChangedAction
  | ChangesetFileSetAction
  | ChangesetFileRemovedAction
  | ChangesetOperationsChangedAction
  | ChangesetOperationStatusChangedAction
  | ChangesetClearedAction
;

/** Union of all resource-watch-scoped actions. */
export type ResourceWatchAction =
  | ResourceWatchChangedAction
;

/** Union of resource-watch actions that clients may dispatch. */
export type ClientResourceWatchAction =
  never
;

/** Union of resource-watch actions that only the server may produce. */
export type ServerResourceWatchAction =
  | ResourceWatchChangedAction
;

// ─── Client-Dispatchable Map ─────────────────────────────────────────────────

/**
 * Exhaustive map indicating which action types may be dispatched by clients.
 * Adding a new action to StateAction without adding it here is a compile error.
 */
export const IS_CLIENT_DISPATCHABLE: { readonly [K in StateAction['type']]: boolean } = {
  [ActionType.RootAgentsChanged]: false,
  [ActionType.RootActiveSessionsChanged]: false,
  [ActionType.RootTerminalsChanged]: false,
  [ActionType.RootConfigChanged]: true,
  [ActionType.SessionReady]: false,
  [ActionType.SessionCreationFailed]: false,
  [ActionType.SessionTurnStarted]: true,
  [ActionType.SessionDelta]: false,
  [ActionType.SessionResponsePart]: false,
  [ActionType.SessionToolCallStart]: false,
  [ActionType.SessionToolCallDelta]: false,
  [ActionType.SessionToolCallReady]: false,
  [ActionType.SessionToolCallConfirmed]: true,
  [ActionType.SessionToolCallComplete]: true,
  [ActionType.SessionToolCallResultConfirmed]: true,
  [ActionType.SessionToolCallContentChanged]: true,
  [ActionType.SessionTurnComplete]: false,
  [ActionType.SessionTurnCancelled]: true,
  [ActionType.SessionError]: false,
  [ActionType.SessionTitleChanged]: true,
  [ActionType.SessionUsage]: false,
  [ActionType.SessionReasoning]: false,
  [ActionType.SessionModelChanged]: true,
  [ActionType.SessionAgentChanged]: true,
  [ActionType.SessionServerToolsChanged]: false,
  [ActionType.SessionActiveClientChanged]: true,
  [ActionType.SessionActiveClientToolsChanged]: true,
  [ActionType.SessionPendingMessageSet]: true,
  [ActionType.SessionPendingMessageRemoved]: true,
  [ActionType.SessionQueuedMessagesReordered]: true,
  [ActionType.SessionInputRequested]: false,
  [ActionType.SessionInputAnswerChanged]: true,
  [ActionType.SessionInputCompleted]: true,
  [ActionType.SessionCustomizationsChanged]: false,
  [ActionType.SessionCustomizationToggled]: true,
  [ActionType.SessionCustomizationUpdated]: false,
  [ActionType.SessionCustomizationRemoved]: false,
  [ActionType.SessionTruncated]: true,
  [ActionType.SessionIsReadChanged]: true,
  [ActionType.SessionIsArchivedChanged]: true,
  [ActionType.SessionActivityChanged]: false,
  [ActionType.SessionChangesetsChanged]: false,
  [ActionType.SessionConfigChanged]: true,
  [ActionType.SessionMetaChanged]: false,
  [ActionType.ChangesetStatusChanged]: false,
  [ActionType.ChangesetFileSet]: false,
  [ActionType.ChangesetFileRemoved]: false,
  [ActionType.ChangesetOperationsChanged]: false,
  [ActionType.ChangesetOperationStatusChanged]: false,
  [ActionType.ChangesetCleared]: false,
  [ActionType.TerminalData]: false,
  [ActionType.TerminalInput]: true,
  [ActionType.TerminalResized]: true,
  [ActionType.TerminalClaimed]: true,
  [ActionType.TerminalTitleChanged]: true,
  [ActionType.TerminalCwdChanged]: false,
  [ActionType.TerminalExited]: false,
  [ActionType.TerminalCleared]: true,
  [ActionType.TerminalCommandDetectionAvailable]: false,
  [ActionType.TerminalCommandExecuted]: false,
  [ActionType.TerminalCommandFinished]: false,
  [ActionType.ResourceWatchChanged]: false,
};
