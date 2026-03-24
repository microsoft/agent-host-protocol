/**
 * Version 1 Type Snapshot — Frozen wire-format types for protocol version 1.
 *
 * This file captures the shape of every state type and action type at the time
 * version 1 was released. It MUST NOT be modified after the version is frozen.
 * When `PROTOCOL_VERSION` is bumped, a new `v2.ts` is created and this file
 * becomes permanently immutable.
 *
 * @module version/v1
 */

import type {
  IRootState,
  IAgentInfo,
  ISessionModelInfo,
  IProtectedResourceMetadata,
  StringOrMarkdown,
  ISessionState,
  ISessionSummary,
  ISessionActiveClient,
  ITurn,
  IActiveTurn,
  IUserMessage,
  IMessageAttachment,
  IMarkdownResponsePart,
  IContentRef,
  IToolCallResponsePart,
  IReasoningResponsePart,
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
  IToolResultFileEditContent,
  IUsageInfo,
  IErrorInfo,
  ISnapshot,
} from '../state.js';

import type {
  IStateAction,
  IActionEnvelope,
  IActionOrigin,
  IRootActiveSessionsChangedAction,
  ISessionToolCallApprovedAction,
  ISessionToolCallDeniedAction,
  ISessionServerToolsChangedAction,
  ISessionActiveClientChangedAction,
  ISessionActiveClientToolsChangedAction,
} from '../actions.js';

import type {
  IProtocolNotification,
  IAuthRequiredNotification,
} from '../notifications.js';

import type {
  IListSessionsResult,
  IAuthenticateParams,
  IAuthenticateResult,
} from '../commands.js';

import type {
  ICommandMap,
  IClientNotificationMap,
  IServerNotificationMap,
  INotificationMethodParams,
} from '../messages.js';

// ─── Bidirectional Assignability Check ───────────────────────────────────────

/**
 * Ensures bidirectional assignability between frozen (v1) and current (living)
 * types. The only allowed evolution is adding optional fields:
 *
 * - `Current extends Frozen` → can't remove fields or change field types
 * - `Frozen extends Current` → can't add required fields
 */
type AssertCompatible<Frozen, _Current extends Frozen> =
  Frozen extends _Current ? true : never;

// ─── V1 Frozen State Types ───────────────────────────────────────────────────

// These type aliases pin the current living types as the v1 frozen shapes.
// If a future change to the living types breaks compatibility, the compiler
// will surface it here.

type V1_IRootState = IRootState;
type V1_StringOrMarkdown = StringOrMarkdown;
type V1_IAgentInfo = IAgentInfo;
type V1_IProtectedResourceMetadata = IProtectedResourceMetadata;
type V1_ISessionModelInfo = ISessionModelInfo;
type V1_ISessionState = ISessionState;
type V1_ISessionSummary = ISessionSummary;
type V1_ISessionActiveClient = ISessionActiveClient;
type V1_ITurn = ITurn;
type V1_IActiveTurn = IActiveTurn;
type V1_IUserMessage = IUserMessage;
type V1_IMessageAttachment = IMessageAttachment;
type V1_IMarkdownResponsePart = IMarkdownResponsePart;
type V1_IContentRef = IContentRef;
type V1_IToolCallResponsePart = IToolCallResponsePart;
type V1_IReasoningResponsePart = IReasoningResponsePart;
type V1_IToolCallResult = IToolCallResult;
type V1_IToolCallStreamingState = IToolCallStreamingState;
type V1_IToolCallPendingConfirmationState = IToolCallPendingConfirmationState;
type V1_IToolCallRunningState = IToolCallRunningState;
type V1_IToolCallPendingResultConfirmationState = IToolCallPendingResultConfirmationState;
type V1_IToolCallCompletedState = IToolCallCompletedState;
type V1_IToolCallCancelledState = IToolCallCancelledState;
type V1_IToolCallState = IToolCallState;
type V1_IToolDefinition = IToolDefinition;
type V1_IToolAnnotations = IToolAnnotations;
type V1_IToolResultTextContent = IToolResultTextContent;
type V1_IToolResultBinaryContent = IToolResultBinaryContent;
type V1_IToolResultFileEditContent = IToolResultFileEditContent;
type V1_IUsageInfo = IUsageInfo;
type V1_IErrorInfo = IErrorInfo;
type V1_ISnapshot = ISnapshot;
type V1_IStateAction = IStateAction;
type V1_IActionEnvelope = IActionEnvelope;
type V1_IActionOrigin = IActionOrigin;
type V1_IRootActiveSessionsChangedAction = IRootActiveSessionsChangedAction;
type V1_ISessionToolCallApprovedAction = ISessionToolCallApprovedAction;
type V1_ISessionToolCallDeniedAction = ISessionToolCallDeniedAction;
type V1_ISessionServerToolsChangedAction = ISessionServerToolsChangedAction;
type V1_ISessionActiveClientChangedAction = ISessionActiveClientChangedAction;
type V1_ISessionActiveClientToolsChangedAction = ISessionActiveClientToolsChangedAction;
type V1_IProtocolNotification = IProtocolNotification;
type V1_IAuthRequiredNotification = IAuthRequiredNotification;
type V1_IListSessionsResult = IListSessionsResult;
type V1_IAuthenticateParams = IAuthenticateParams;
type V1_IAuthenticateResult = IAuthenticateResult;
type V1_ICommandMap = ICommandMap;
type V1_IClientNotificationMap = IClientNotificationMap;
type V1_IServerNotificationMap = IServerNotificationMap;
type V1_INotificationMethodParams = INotificationMethodParams;

// ─── Compatibility Assertions ────────────────────────────────────────────────

// These will fail at compile time if the living types diverge from v1 in a
// backward-incompatible way.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootState = AssertCompatible<V1_IRootState, IRootState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStringOrMarkdown = AssertCompatible<V1_StringOrMarkdown, StringOrMarkdown>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAgentInfo = AssertCompatible<V1_IAgentInfo, IAgentInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionModelInfo = AssertCompatible<V1_ISessionModelInfo, ISessionModelInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionState = AssertCompatible<V1_ISessionState, ISessionState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummary = AssertCompatible<V1_ISessionSummary, ISessionSummary>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTurn = AssertCompatible<V1_ITurn, ITurn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveTurn = AssertCompatible<V1_IActiveTurn, IActiveTurn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUserMessage = AssertCompatible<V1_IUserMessage, IUserMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageAttachment = AssertCompatible<V1_IMessageAttachment, IMessageAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMarkdownResponsePart = AssertCompatible<V1_IMarkdownResponsePart, IMarkdownResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckContentRef = AssertCompatible<V1_IContentRef, IContentRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResponsePart = AssertCompatible<V1_IToolCallResponsePart, IToolCallResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReasoningResponsePart = AssertCompatible<V1_IReasoningResponsePart, IReasoningResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResult = AssertCompatible<V1_IToolCallResult, IToolCallResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallStreamingState = AssertCompatible<V1_IToolCallStreamingState, IToolCallStreamingState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingConfirmationState = AssertCompatible<V1_IToolCallPendingConfirmationState, IToolCallPendingConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallRunningState = AssertCompatible<V1_IToolCallRunningState, IToolCallRunningState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingResultConfirmationState = AssertCompatible<V1_IToolCallPendingResultConfirmationState, IToolCallPendingResultConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCompletedState = AssertCompatible<V1_IToolCallCompletedState, IToolCallCompletedState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCancelledState = AssertCompatible<V1_IToolCallCancelledState, IToolCallCancelledState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallState = AssertCompatible<V1_IToolCallState, IToolCallState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUsageInfo = AssertCompatible<V1_IUsageInfo, IUsageInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckErrorInfo = AssertCompatible<V1_IErrorInfo, IErrorInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSnapshot = AssertCompatible<V1_ISnapshot, ISnapshot>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStateAction = AssertCompatible<V1_IStateAction, IStateAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionEnvelope = AssertCompatible<V1_IActionEnvelope, IActionEnvelope>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionOrigin = AssertCompatible<V1_IActionOrigin, IActionOrigin>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveSessionsChangedAction = AssertCompatible<V1_IRootActiveSessionsChangedAction, IRootActiveSessionsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallApprovedAction = AssertCompatible<V1_ISessionToolCallApprovedAction, ISessionToolCallApprovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallDeniedAction = AssertCompatible<V1_ISessionToolCallDeniedAction, ISessionToolCallDeniedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionActiveClient = AssertCompatible<V1_ISessionActiveClient, ISessionActiveClient>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolDefinition = AssertCompatible<V1_IToolDefinition, IToolDefinition>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolAnnotations = AssertCompatible<V1_IToolAnnotations, IToolAnnotations>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTextContent = AssertCompatible<V1_IToolResultTextContent, IToolResultTextContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultBinaryContent = AssertCompatible<V1_IToolResultBinaryContent, IToolResultBinaryContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultFileEditContent = AssertCompatible<V1_IToolResultFileEditContent, IToolResultFileEditContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerToolsChangedAction = AssertCompatible<V1_ISessionServerToolsChangedAction, ISessionServerToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientChangedAction = AssertCompatible<V1_ISessionActiveClientChangedAction, ISessionActiveClientChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientToolsChangedAction = AssertCompatible<V1_ISessionActiveClientToolsChangedAction, ISessionActiveClientToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtocolNotification = AssertCompatible<V1_IProtocolNotification, IProtocolNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckListSessionsResult = AssertCompatible<V1_IListSessionsResult, IListSessionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateParams = AssertCompatible<V1_IAuthenticateParams, IAuthenticateParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateResult = AssertCompatible<V1_IAuthenticateResult, IAuthenticateResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtectedResourceMetadata = AssertCompatible<V1_IProtectedResourceMetadata, IProtectedResourceMetadata>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthRequiredNotification = AssertCompatible<V1_IAuthRequiredNotification, IAuthRequiredNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCommandMap = AssertCompatible<V1_ICommandMap, ICommandMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckClientNotificationMap = AssertCompatible<V1_IClientNotificationMap, IClientNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerNotificationMap = AssertCompatible<V1_IServerNotificationMap, IServerNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckNotificationMethodParams = AssertCompatible<V1_INotificationMethodParams, INotificationMethodParams>;
