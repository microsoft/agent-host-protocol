/**
 * Agent Host Protocol — Type Definitions
 *
 * @module agent-host-protocol
 * @description Canonical TypeScript type definitions for the Agent Host Protocol.
 * These types are the source of truth from which documentation and JSON Schema
 * are generated.
 */

// State types
export type {
  URI,
  StringOrMarkdown,
  IRootState,
  IAgentInfo,
  IProtectedResourceMetadata,
  ISessionModelInfo,
  ISessionState,
  ISessionSummary,
  ISessionFileDiff,
  ITurn,
  IActiveTurn,
  IUserMessage,
  IMessageAttachment,
  IMarkdownResponsePart,
  IContentRef,
  IToolCallResponsePart,
  IReasoningResponsePart,
  IResponsePart,
  IToolCallResult,
  IToolCallStreamingState,
  IToolCallPendingConfirmationState,
  IToolCallRunningState,
  IToolCallPendingResultConfirmationState,
  IToolCallCompletedState,
  IToolCallCancelledState,
  IToolCallState,
  IToolDefinition,
  IToolAnnotations,
  IToolResultTextContent,
  IToolResultEmbeddedResourceContent,
  IToolResultResourceContent,
  IToolResultContent,
  IToolResultFileEditContent,
  IToolResultTerminalContent,
  ISessionActiveClient,
  IPendingMessage,
  IUsageInfo,
  IErrorInfo,
  ISnapshot,
  ITerminalInfo,
  ITerminalClientClaim,
  ITerminalSessionClaim,
  ITerminalClaim,
  ITerminalState,
} from './state.js';

export {
  PolicyState,
  SessionLifecycle,
  SessionStatus,
  TurnState,
  AttachmentType,
  ResponsePartKind,
  ToolCallStatus,
  ToolCallConfirmationReason,
  ToolCallCancellationReason,
  ToolResultContentType,
  PendingMessageKind,
  TerminalClaimKind,
} from './state.js';

// Action types
export type {
  IActionEnvelope,
  IActionOrigin,
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
  ISessionToolCallApprovedAction,
  ISessionToolCallDeniedAction,
  ISessionToolCallConfirmedAction,
  ISessionToolCallCompleteAction,
  ISessionToolCallResultConfirmedAction,
  ISessionToolCallContentChangedAction,
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
  ISessionPendingMessageSetAction,
  ISessionPendingMessageRemovedAction,
  ISessionQueuedMessagesReorderedAction,
  ISessionTruncatedAction,
  IStateAction,
  IRootTerminalsChangedAction,
  ITerminalDataAction,
  ITerminalInputAction,
  ITerminalResizedAction,
  ITerminalClaimedAction,
  ITerminalTitleChangedAction,
  ITerminalCwdChangedAction,
  ITerminalExitedAction,
  ITerminalClearedAction,
} from './actions.js';

export { ActionType } from './actions.js';

// Generated action origin types
export type {
  IRootAction,
  ISessionAction,
  IClientSessionAction,
  IServerSessionAction,
  ITerminalAction,
  IClientTerminalAction,
  IServerTerminalAction,
} from './action-origin.generated.js';

export { IS_CLIENT_DISPATCHABLE } from './action-origin.generated.js';

// Reducer functions
export {
  rootReducer,
  sessionReducer,
  terminalReducer,
  isClientDispatchable,
} from './reducers.js';

// Command types
export type {
  IInitializeParams,
  IInitializeResult,
  IReconnectParams,
  IReconnectReplayResult,
  IReconnectSnapshotResult,
  IReconnectResult,
  ISubscribeParams,
  ISubscribeResult,
  ICreateSessionParams,
  ISessionForkSource,
  IDisposeSessionParams,
  ICreateTerminalParams,
  IDisposeTerminalParams,
  IListSessionsParams,
  IListSessionsResult,
  IResourceReadParams,
  IResourceReadResult,
  IResourceWriteParams,
  IResourceWriteResult,
  IResourceListParams,
  IDirectoryEntry,
  IResourceListResult,
  IResourceCopyParams,
  IResourceCopyResult,
  IResourceDeleteParams,
  IResourceDeleteResult,
  IResourceMoveParams,
  IResourceMoveResult,
  IFetchTurnsParams,
  IFetchTurnsResult,
  IUnsubscribeParams,
  IDispatchActionParams,
  IAuthenticateParams,
  IAuthenticateResult,
} from './commands.js';

export { ReconnectResultType, ContentEncoding } from './commands.js';

// Notification types
export type {
  ISessionAddedNotification,
  ISessionRemovedNotification,
  IAuthRequiredNotification,
  IProtocolNotification,
} from './notifications.js';

export { NotificationType, AuthRequiredReason } from './notifications.js';

// Message types (JSON-RPC wire format)
export type {
  IJsonRpcRequest,
  IJsonRpcSuccessResponse,
  IJsonRpcErrorResponse,
  IJsonRpcResponse,
  IJsonRpcNotification,
  ICommandMap,
  INotificationMethodParams,
  IClientNotificationMap,
  IServerNotificationMap,
  INotificationMap,
  IAhpRequest,
  IAhpSuccessResponse,
  IAhpResponse,
  IAhpNotification,
  IAhpClientNotification,
  IAhpServerNotification,
  IProtocolMessage,
} from './messages.js';

// Error codes
export {
  JsonRpcErrorCodes,
  AhpErrorCodes,
} from './errors.js';
export type {
  AhpErrorCode,
  JsonRpcErrorCode,
} from './errors.js';

// Version registry
export {
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  ACTION_INTRODUCED_IN,
  NOTIFICATION_INTRODUCED_IN,
  isActionKnownToVersion,
  isNotificationKnownToVersion,
  capabilitiesForVersion,
} from './version/registry.js';
export type { ProtocolCapabilities } from './version/registry.js';
