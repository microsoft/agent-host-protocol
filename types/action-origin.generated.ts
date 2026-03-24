// Generated from types/actions.ts — do not edit
// Run `npm run generate` to regenerate.

import type {
  IStateAction,
  IRootAgentsChangedAction,
  IRootActiveSessionsChangedAction,
  ISessionReadyAction,
  ISessionCreationFailedAction,
  ISessionTurnStartedAction,
  ISessionDeltaAction,
  ISessionResponsePartAction,
  ISessionToolCallStartAction,
  ISessionToolCallDeltaAction,
  ISessionToolCallReadyAction,
  ISessionToolCallConfirmedAction,
  ISessionToolCallCompleteAction,
  ISessionToolCallResultConfirmedAction,
  ISessionTurnCompleteAction,
  ISessionTurnCancelledAction,
  ISessionErrorAction,
  ISessionTitleChangedAction,
  ISessionUsageAction,
  ISessionReasoningAction,
  ISessionModelChangedAction,
  ISessionServerToolsChangedAction,
  ISessionActiveClientChangedAction,
  ISessionActiveClientToolsChangedAction,
} from './actions.js';

import { ActionType } from './actions.js';

// ─── Root vs Session Action Unions ───────────────────────────────────────────

/** Union of all root-scoped actions. */
export type IRootAction =
  | IRootAgentsChangedAction
  | IRootActiveSessionsChangedAction
;

/** Union of all session-scoped actions. */
export type ISessionAction =
  | ISessionReadyAction
  | ISessionCreationFailedAction
  | ISessionTurnStartedAction
  | ISessionDeltaAction
  | ISessionResponsePartAction
  | ISessionToolCallStartAction
  | ISessionToolCallDeltaAction
  | ISessionToolCallReadyAction
  | ISessionToolCallConfirmedAction
  | ISessionToolCallCompleteAction
  | ISessionToolCallResultConfirmedAction
  | ISessionTurnCompleteAction
  | ISessionTurnCancelledAction
  | ISessionErrorAction
  | ISessionTitleChangedAction
  | ISessionUsageAction
  | ISessionReasoningAction
  | ISessionModelChangedAction
  | ISessionServerToolsChangedAction
  | ISessionActiveClientChangedAction
  | ISessionActiveClientToolsChangedAction
;

/** Union of session actions that clients may dispatch. */
export type IClientSessionAction =
  | ISessionTurnStartedAction
  | ISessionToolCallConfirmedAction
  | ISessionToolCallCompleteAction
  | ISessionToolCallResultConfirmedAction
  | ISessionTurnCancelledAction
  | ISessionModelChangedAction
  | ISessionActiveClientChangedAction
  | ISessionActiveClientToolsChangedAction
;

/** Union of session actions that only the server may produce. */
export type IServerSessionAction =
  | ISessionReadyAction
  | ISessionCreationFailedAction
  | ISessionDeltaAction
  | ISessionResponsePartAction
  | ISessionToolCallStartAction
  | ISessionToolCallDeltaAction
  | ISessionToolCallReadyAction
  | ISessionTurnCompleteAction
  | ISessionErrorAction
  | ISessionTitleChangedAction
  | ISessionUsageAction
  | ISessionReasoningAction
  | ISessionServerToolsChangedAction
;

// ─── Client-Dispatchable Map ─────────────────────────────────────────────────

/**
 * Exhaustive map indicating which action types may be dispatched by clients.
 * Adding a new action to IStateAction without adding it here is a compile error.
 */
export const IS_CLIENT_DISPATCHABLE: { readonly [K in IStateAction['type']]: boolean } = {
  [ActionType.RootAgentsChanged]: false,
  [ActionType.RootActiveSessionsChanged]: false,
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
  [ActionType.SessionTurnComplete]: false,
  [ActionType.SessionTurnCancelled]: true,
  [ActionType.SessionError]: false,
  [ActionType.SessionTitleChanged]: false,
  [ActionType.SessionUsage]: false,
  [ActionType.SessionReasoning]: false,
  [ActionType.SessionModelChanged]: true,
  [ActionType.SessionServerToolsChanged]: false,
  [ActionType.SessionActiveClientChanged]: true,
  [ActionType.SessionActiveClientToolsChanged]: true,
};
