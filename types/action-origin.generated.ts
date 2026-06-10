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
  SessionChatAddedAction,
  SessionChatRemovedAction,
  SessionChatUpdatedAction,
  SessionDefaultChatChangedAction,
  SessionTitleChangedAction,
  SessionModelChangedAction,
  SessionAgentChangedAction,
  SessionServerToolsChangedAction,
  SessionActiveClientChangedAction,
  SessionActiveClientToolsChangedAction,
  SessionCustomizationsChangedAction,
  SessionCustomizationToggledAction,
  SessionCustomizationUpdatedAction,
  SessionCustomizationRemovedAction,
  SessionMcpServerStateChangedAction,
  SessionIsReadChangedAction,
  SessionIsArchivedChangedAction,
  SessionActivityChangedAction,
  SessionChangesetsChangedAction,
  SessionConfigChangedAction,
  SessionMetaChangedAction,
  ChatTurnStartedAction,
  ChatDeltaAction,
  ChatResponsePartAction,
  ChatToolCallStartAction,
  ChatToolCallDeltaAction,
  ChatToolCallReadyAction,
  ChatToolCallConfirmedAction,
  ChatToolCallCompleteAction,
  ChatToolCallResultConfirmedAction,
  ChatToolCallContentChangedAction,
  ChatTurnCompleteAction,
  ChatTurnCancelledAction,
  ChatErrorAction,
  ChatUsageAction,
  ChatReasoningAction,
  ChatPendingMessageSetAction,
  ChatPendingMessageRemovedAction,
  ChatQueuedMessagesReorderedAction,
  ChatInputRequestedAction,
  ChatInputAnswerChangedAction,
  ChatInputCompletedAction,
  ChatTruncatedAction,
  ChangesetStatusChangedAction,
  ChangesetFileSetAction,
  ChangesetFileRemovedAction,
  ChangesetOperationsChangedAction,
  ChangesetOperationStatusChangedAction,
  ChangesetClearedAction,
  AnnotationsSetAction,
  AnnotationsUpdatedAction,
  AnnotationsRemovedAction,
  AnnotationsEntrySetAction,
  AnnotationsEntryRemovedAction,
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

// ─── Root vs Session vs Chat vs Terminal vs Changeset Action Unions ─────────────────

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
  | SessionChatAddedAction
  | SessionChatRemovedAction
  | SessionChatUpdatedAction
  | SessionDefaultChatChangedAction
  | SessionTitleChangedAction
  | SessionModelChangedAction
  | SessionAgentChangedAction
  | SessionServerToolsChangedAction
  | SessionActiveClientChangedAction
  | SessionActiveClientToolsChangedAction
  | SessionCustomizationsChangedAction
  | SessionCustomizationToggledAction
  | SessionCustomizationUpdatedAction
  | SessionCustomizationRemovedAction
  | SessionMcpServerStateChangedAction
  | SessionIsReadChangedAction
  | SessionIsArchivedChangedAction
  | SessionActivityChangedAction
  | SessionChangesetsChangedAction
  | SessionConfigChangedAction
  | SessionMetaChangedAction
;

/** Union of session actions that clients may dispatch. */
export type ClientSessionAction =
  | SessionTitleChangedAction
  | SessionModelChangedAction
  | SessionAgentChangedAction
  | SessionActiveClientChangedAction
  | SessionActiveClientToolsChangedAction
  | SessionCustomizationToggledAction
  | SessionIsReadChangedAction
  | SessionIsArchivedChangedAction
  | SessionConfigChangedAction
;

/** Union of session actions that only the server may produce. */
export type ServerSessionAction =
  | SessionReadyAction
  | SessionCreationFailedAction
  | SessionChatAddedAction
  | SessionChatRemovedAction
  | SessionChatUpdatedAction
  | SessionDefaultChatChangedAction
  | SessionServerToolsChangedAction
  | SessionCustomizationsChangedAction
  | SessionCustomizationUpdatedAction
  | SessionCustomizationRemovedAction
  | SessionMcpServerStateChangedAction
  | SessionActivityChangedAction
  | SessionChangesetsChangedAction
  | SessionMetaChangedAction
;

/** Union of all chat-scoped actions. */
export type ChatAction =
  | ChatTurnStartedAction
  | ChatDeltaAction
  | ChatResponsePartAction
  | ChatToolCallStartAction
  | ChatToolCallDeltaAction
  | ChatToolCallReadyAction
  | ChatToolCallConfirmedAction
  | ChatToolCallCompleteAction
  | ChatToolCallResultConfirmedAction
  | ChatToolCallContentChangedAction
  | ChatTurnCompleteAction
  | ChatTurnCancelledAction
  | ChatErrorAction
  | ChatUsageAction
  | ChatReasoningAction
  | ChatPendingMessageSetAction
  | ChatPendingMessageRemovedAction
  | ChatQueuedMessagesReorderedAction
  | ChatInputRequestedAction
  | ChatInputAnswerChangedAction
  | ChatInputCompletedAction
  | ChatTruncatedAction
;

/** Union of chat actions that clients may dispatch. */
export type ClientChatAction =
  | ChatTurnStartedAction
  | ChatToolCallConfirmedAction
  | ChatToolCallCompleteAction
  | ChatToolCallResultConfirmedAction
  | ChatToolCallContentChangedAction
  | ChatTurnCancelledAction
  | ChatPendingMessageSetAction
  | ChatPendingMessageRemovedAction
  | ChatQueuedMessagesReorderedAction
  | ChatInputAnswerChangedAction
  | ChatInputCompletedAction
  | ChatTruncatedAction
;

/** Union of chat actions that only the server may produce. */
export type ServerChatAction =
  | ChatDeltaAction
  | ChatResponsePartAction
  | ChatToolCallStartAction
  | ChatToolCallDeltaAction
  | ChatToolCallReadyAction
  | ChatTurnCompleteAction
  | ChatErrorAction
  | ChatUsageAction
  | ChatReasoningAction
  | ChatInputRequestedAction
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

/** Union of all annotations-scoped actions. */
export type AnnotationsAction =
  | AnnotationsSetAction
  | AnnotationsUpdatedAction
  | AnnotationsRemovedAction
  | AnnotationsEntrySetAction
  | AnnotationsEntryRemovedAction
;

/** Union of annotations actions that clients may dispatch. */
export type ClientAnnotationsAction =
  | AnnotationsSetAction
  | AnnotationsUpdatedAction
  | AnnotationsRemovedAction
  | AnnotationsEntrySetAction
  | AnnotationsEntryRemovedAction
;

/** Union of annotations actions that only the server may produce. */
export type ServerAnnotationsAction =
  never
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
  [ActionType.SessionChatAdded]: false,
  [ActionType.SessionChatRemoved]: false,
  [ActionType.SessionChatUpdated]: false,
  [ActionType.SessionDefaultChatChanged]: false,
  [ActionType.SessionTitleChanged]: true,
  [ActionType.SessionModelChanged]: true,
  [ActionType.SessionAgentChanged]: true,
  [ActionType.SessionServerToolsChanged]: false,
  [ActionType.SessionActiveClientChanged]: true,
  [ActionType.SessionActiveClientToolsChanged]: true,
  [ActionType.SessionCustomizationsChanged]: false,
  [ActionType.SessionCustomizationToggled]: true,
  [ActionType.SessionCustomizationUpdated]: false,
  [ActionType.SessionCustomizationRemoved]: false,
  [ActionType.SessionMcpServerStateChanged]: false,
  [ActionType.SessionIsReadChanged]: true,
  [ActionType.SessionIsArchivedChanged]: true,
  [ActionType.SessionActivityChanged]: false,
  [ActionType.SessionChangesetsChanged]: false,
  [ActionType.SessionConfigChanged]: true,
  [ActionType.SessionMetaChanged]: false,
  [ActionType.ChatTurnStarted]: true,
  [ActionType.ChatDelta]: false,
  [ActionType.ChatResponsePart]: false,
  [ActionType.ChatToolCallStart]: false,
  [ActionType.ChatToolCallDelta]: false,
  [ActionType.ChatToolCallReady]: false,
  [ActionType.ChatToolCallConfirmed]: true,
  [ActionType.ChatToolCallComplete]: true,
  [ActionType.ChatToolCallResultConfirmed]: true,
  [ActionType.ChatToolCallContentChanged]: true,
  [ActionType.ChatTurnComplete]: false,
  [ActionType.ChatTurnCancelled]: true,
  [ActionType.ChatError]: false,
  [ActionType.ChatUsage]: false,
  [ActionType.ChatReasoning]: false,
  [ActionType.ChatPendingMessageSet]: true,
  [ActionType.ChatPendingMessageRemoved]: true,
  [ActionType.ChatQueuedMessagesReordered]: true,
  [ActionType.ChatInputRequested]: false,
  [ActionType.ChatInputAnswerChanged]: true,
  [ActionType.ChatInputCompleted]: true,
  [ActionType.ChatTruncated]: true,
  [ActionType.ChangesetStatusChanged]: false,
  [ActionType.ChangesetFileSet]: false,
  [ActionType.ChangesetFileRemoved]: false,
  [ActionType.ChangesetOperationsChanged]: false,
  [ActionType.ChangesetOperationStatusChanged]: false,
  [ActionType.ChangesetCleared]: false,
  [ActionType.AnnotationsSet]: true,
  [ActionType.AnnotationsUpdated]: true,
  [ActionType.AnnotationsRemoved]: true,
  [ActionType.AnnotationsEntrySet]: true,
  [ActionType.AnnotationsEntryRemoved]: true,
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
