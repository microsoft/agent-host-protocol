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
  SessionTruncatedAction,
  SessionIsReadChangedAction,
  SessionIsDoneChangedAction,
  SessionDiffsChangedAction,
  SessionConfigChangedAction,
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
} from './actions.js';

import { ActionType } from './actions.js';

// ─── Root vs Session vs Terminal Action Unions ───────────────────────────────

/** Union of all root-scoped actions. */
export type RootAction =
  | RootAgentsChangedAction
  | RootActiveSessionsChangedAction
  | RootTerminalsChangedAction
  | RootConfigChangedAction
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
  | SessionTruncatedAction
  | SessionIsReadChangedAction
  | SessionIsDoneChangedAction
  | SessionDiffsChangedAction
  | SessionConfigChangedAction
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
  | SessionIsDoneChangedAction
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
  | SessionDiffsChangedAction
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
  [ActionType.SessionTruncated]: true,
  [ActionType.SessionIsReadChanged]: true,
  [ActionType.SessionIsDoneChanged]: true,
  [ActionType.SessionDiffsChanged]: false,
  [ActionType.SessionConfigChanged]: true,
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
};
