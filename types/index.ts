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
  IToolResultBinaryContent,
  IToolResultContent,
  IToolResultFileEditContent,
  ISessionActiveClient,
  IUsageInfo,
  IErrorInfo,
  ISnapshot,
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
  IStateAction,
} from './actions.js';

export { ActionType } from './actions.js';

// Generated action origin types
export type {
  IRootAction,
  ISessionAction,
  IClientSessionAction,
  IServerSessionAction,
} from './action-origin.generated.js';

export { IS_CLIENT_DISPATCHABLE } from './action-origin.generated.js';

// Reducer functions
export {
  rootReducer,
  sessionReducer,
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
  IDisposeSessionParams,
  IListSessionsParams,
  IListSessionsResult,
  IFetchContentParams,
  IFetchContentResult,
  IBrowseDirectoryParams,
  IDirectoryEntry,
  IBrowseDirectoryResult,
  IFetchTurnsParams,
  IFetchTurnsResult,
  IUnsubscribeParams,
  IDispatchActionParams,
  IAuthenticateParams,
  IAuthenticateResult,
  IBrowseDirectoryEntry,
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
