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
  ISessionFileDiff,
  IProjectInfo,
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
  IToolResultEmbeddedResourceContent,
  IToolResultResourceContent,
  IToolResultFileEditContent,
  IToolResultTerminalContent,
  IToolResultSubagentContent,
  IUsageInfo,
  IErrorInfo,
  ISnapshot,
  IPendingMessage,
  Icon,
  ICustomizationRef,
  ISessionCustomization,
  ITerminalInfo,
  ITerminalClientClaim,
  ITerminalSessionClaim,
  ITerminalClaim,
  ITerminalState,
  ISessionInputAnswer,
  ISessionInputAnswerValue,
  ISessionInputTextAnswerValue,
  ISessionInputNumberAnswerValue,
  ISessionInputBooleanAnswerValue,
  ISessionInputSelectedAnswerValue,
  ISessionInputSelectedManyAnswerValue,
  ISessionInputAnswered,
  ISessionInputSkipped,
  ISessionInputOption,
  ISessionInputQuestion,
  ISessionInputTextQuestion,
  ISessionInputNumberQuestion,
  ISessionInputBooleanQuestion,
  ISessionInputSingleSelectQuestion,
  ISessionInputMultiSelectQuestion,
  ISessionInputRequest,
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
  ISessionPendingMessageSetAction,
  ISessionPendingMessageRemovedAction,
  ISessionQueuedMessagesReorderedAction,
  ISessionCustomizationsChangedAction,
  ISessionCustomizationToggledAction,
  ISessionTruncatedAction,
  ISessionIsReadChangedAction,
  ISessionIsDoneChangedAction,
  ISessionDiffsChangedAction,
  IRootTerminalsChangedAction,
  ISessionToolCallContentChangedAction,
  ITerminalDataAction,
  ITerminalInputAction,
  ITerminalResizedAction,
  ITerminalClaimedAction,
  ITerminalTitleChangedAction,
  ITerminalCwdChangedAction,
  ITerminalExitedAction,
  ITerminalClearedAction,
  ISessionInputAnswerChangedAction,
  ISessionInputCompletedAction,
  ISessionInputRequestedAction,
} from '../actions.js';

import type {
  IProtocolNotification,
  IAuthRequiredNotification,
  ISessionSummaryChangedNotification,
} from '../notifications.js';

import type {
  IListSessionsResult,
  IAuthenticateParams,
  IAuthenticateResult,
  IResourceWriteParams,
  IResourceWriteResult,
  ISessionForkSource,
  IResourceReadParams,
  IResourceReadResult,
  IResourceListParams,
  IResourceListResult,
  IResourceCopyParams,
  IResourceCopyResult,
  IResourceDeleteParams,
  IResourceDeleteResult,
  IResourceMoveParams,
  IResourceMoveResult,
  ICreateTerminalParams,
  IDisposeTerminalParams,
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
type V1_ISessionFileDiff = ISessionFileDiff;
type V1_IProjectInfo = IProjectInfo;
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
type V1_IToolResultEmbeddedResourceContent = IToolResultEmbeddedResourceContent;
type V1_IToolResultResourceContent = IToolResultResourceContent;
type V1_IToolResultFileEditContent = IToolResultFileEditContent;
type V1_IToolResultTerminalContent = IToolResultTerminalContent;
type V1_IToolResultSubagentContent = IToolResultSubagentContent;
type V1_IUsageInfo = IUsageInfo;
type V1_IErrorInfo = IErrorInfo;
type V1_ISnapshot = ISnapshot;
type V1_IPendingMessage = IPendingMessage;
type V1_ISessionInputAnswer = ISessionInputAnswer;
type V1_ISessionInputAnswerValue = ISessionInputAnswerValue;
type V1_ISessionInputTextAnswerValue = ISessionInputTextAnswerValue;
type V1_ISessionInputNumberAnswerValue = ISessionInputNumberAnswerValue;
type V1_ISessionInputBooleanAnswerValue = ISessionInputBooleanAnswerValue;
type V1_ISessionInputSelectedAnswerValue = ISessionInputSelectedAnswerValue;
type V1_ISessionInputSelectedManyAnswerValue = ISessionInputSelectedManyAnswerValue;
type V1_ISessionInputAnswered = ISessionInputAnswered;
type V1_ISessionInputSkipped = ISessionInputSkipped;
type V1_ISessionInputOption = ISessionInputOption;
type V1_ISessionInputQuestion = ISessionInputQuestion;
type V1_ISessionInputTextQuestion = ISessionInputTextQuestion;
type V1_ISessionInputNumberQuestion = ISessionInputNumberQuestion;
type V1_ISessionInputBooleanQuestion = ISessionInputBooleanQuestion;
type V1_ISessionInputSingleSelectQuestion = ISessionInputSingleSelectQuestion;
type V1_ISessionInputMultiSelectQuestion = ISessionInputMultiSelectQuestion;
type V1_ISessionInputRequest = ISessionInputRequest;
type V1_Icon = Icon;
type V1_ICustomizationRef = ICustomizationRef;
type V1_ISessionCustomization = ISessionCustomization;
type V1_IStateAction = IStateAction;
type V1_IActionEnvelope = IActionEnvelope;
type V1_IActionOrigin = IActionOrigin;
type V1_IRootActiveSessionsChangedAction = IRootActiveSessionsChangedAction;
type V1_ISessionToolCallApprovedAction = ISessionToolCallApprovedAction;
type V1_ISessionToolCallDeniedAction = ISessionToolCallDeniedAction;
type V1_ISessionServerToolsChangedAction = ISessionServerToolsChangedAction;
type V1_ISessionActiveClientChangedAction = ISessionActiveClientChangedAction;
type V1_ISessionActiveClientToolsChangedAction = ISessionActiveClientToolsChangedAction;
type V1_ISessionPendingMessageSetAction = ISessionPendingMessageSetAction;
type V1_ISessionPendingMessageRemovedAction = ISessionPendingMessageRemovedAction;
type V1_ISessionQueuedMessagesReorderedAction = ISessionQueuedMessagesReorderedAction;
type V1_ISessionCustomizationsChangedAction = ISessionCustomizationsChangedAction;
type V1_ISessionCustomizationToggledAction = ISessionCustomizationToggledAction;
type V1_ISessionTruncatedAction = ISessionTruncatedAction;
type V1_ISessionIsReadChangedAction = ISessionIsReadChangedAction;
type V1_ISessionIsDoneChangedAction = ISessionIsDoneChangedAction;
type V1_ISessionDiffsChangedAction = ISessionDiffsChangedAction;
type V1_ISessionToolCallContentChangedAction = ISessionToolCallContentChangedAction;
type V1_ISessionInputRequestedAction = ISessionInputRequestedAction;
type V1_ISessionInputAnswerChangedAction = ISessionInputAnswerChangedAction;
type V1_ISessionInputCompletedAction = ISessionInputCompletedAction;
type V1_IRootTerminalsChangedAction = IRootTerminalsChangedAction;
type V1_ITerminalDataAction = ITerminalDataAction;
type V1_ITerminalInputAction = ITerminalInputAction;
type V1_ITerminalResizedAction = ITerminalResizedAction;
type V1_ITerminalClaimedAction = ITerminalClaimedAction;
type V1_ITerminalTitleChangedAction = ITerminalTitleChangedAction;
type V1_ITerminalCwdChangedAction = ITerminalCwdChangedAction;
type V1_ITerminalExitedAction = ITerminalExitedAction;
type V1_ITerminalClearedAction = ITerminalClearedAction;
type V1_ITerminalInfo = ITerminalInfo;
type V1_ITerminalClientClaim = ITerminalClientClaim;
type V1_ITerminalSessionClaim = ITerminalSessionClaim;
type V1_ITerminalClaim = ITerminalClaim;
type V1_ITerminalState = ITerminalState;
type V1_ICreateTerminalParams = ICreateTerminalParams;
type V1_IDisposeTerminalParams = IDisposeTerminalParams;
type V1_ISessionForkSource = ISessionForkSource;
type V1_IProtocolNotification = IProtocolNotification;
type V1_IAuthRequiredNotification = IAuthRequiredNotification;
type V1_ISessionSummaryChangedNotification = ISessionSummaryChangedNotification;
type V1_IListSessionsResult = IListSessionsResult;
type V1_IAuthenticateParams = IAuthenticateParams;
type V1_IAuthenticateResult = IAuthenticateResult;
type V1_IResourceWriteParams = IResourceWriteParams;
type V1_IResourceWriteResult = IResourceWriteResult;
type V1_IResourceReadParams = IResourceReadParams;
type V1_IResourceReadResult = IResourceReadResult;
type V1_IResourceListParams = IResourceListParams;
type V1_IResourceListResult = IResourceListResult;
type V1_IResourceCopyParams = IResourceCopyParams;
type V1_IResourceCopyResult = IResourceCopyResult;
type V1_IResourceDeleteParams = IResourceDeleteParams;
type V1_IResourceDeleteResult = IResourceDeleteResult;
type V1_IResourceMoveParams = IResourceMoveParams;
type V1_IResourceMoveResult = IResourceMoveResult;
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
type _CheckSessionFileDiff = AssertCompatible<V1_ISessionFileDiff, ISessionFileDiff>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProjectInfo = AssertCompatible<V1_IProjectInfo, IProjectInfo>;
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
type _CheckToolResultEmbeddedResourceContent = AssertCompatible<V1_IToolResultEmbeddedResourceContent, IToolResultEmbeddedResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultResourceContent = AssertCompatible<V1_IToolResultResourceContent, IToolResultResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultFileEditContent = AssertCompatible<V1_IToolResultFileEditContent, IToolResultFileEditContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTerminalContent = AssertCompatible<V1_IToolResultTerminalContent, IToolResultTerminalContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultSubagentContent = AssertCompatible<V1_IToolResultSubagentContent, IToolResultSubagentContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerToolsChangedAction = AssertCompatible<V1_ISessionServerToolsChangedAction, ISessionServerToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientChangedAction = AssertCompatible<V1_ISessionActiveClientChangedAction, ISessionActiveClientChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientToolsChangedAction = AssertCompatible<V1_ISessionActiveClientToolsChangedAction, ISessionActiveClientToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessage = AssertCompatible<V1_IPendingMessage, IPendingMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswer = AssertCompatible<V1_ISessionInputAnswer, ISessionInputAnswer>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerValue = AssertCompatible<V1_ISessionInputAnswerValue, ISessionInputAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextAnswerValue = AssertCompatible<V1_ISessionInputTextAnswerValue, ISessionInputTextAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberAnswerValue = AssertCompatible<V1_ISessionInputNumberAnswerValue, ISessionInputNumberAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanAnswerValue = AssertCompatible<V1_ISessionInputBooleanAnswerValue, ISessionInputBooleanAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedAnswerValue = AssertCompatible<V1_ISessionInputSelectedAnswerValue, ISessionInputSelectedAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedManyAnswerValue = AssertCompatible<V1_ISessionInputSelectedManyAnswerValue, ISessionInputSelectedManyAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswered = AssertCompatible<V1_ISessionInputAnswered, ISessionInputAnswered>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSkipped = AssertCompatible<V1_ISessionInputSkipped, ISessionInputSkipped>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputOption = AssertCompatible<V1_ISessionInputOption, ISessionInputOption>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputQuestion = AssertCompatible<V1_ISessionInputQuestion, ISessionInputQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextQuestion = AssertCompatible<V1_ISessionInputTextQuestion, ISessionInputTextQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberQuestion = AssertCompatible<V1_ISessionInputNumberQuestion, ISessionInputNumberQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanQuestion = AssertCompatible<V1_ISessionInputBooleanQuestion, ISessionInputBooleanQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSingleSelectQuestion = AssertCompatible<V1_ISessionInputSingleSelectQuestion, ISessionInputSingleSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputMultiSelectQuestion = AssertCompatible<V1_ISessionInputMultiSelectQuestion, ISessionInputMultiSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequest = AssertCompatible<V1_ISessionInputRequest, ISessionInputRequest>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageSetAction = AssertCompatible<V1_ISessionPendingMessageSetAction, ISessionPendingMessageSetAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageRemovedAction = AssertCompatible<V1_ISessionPendingMessageRemovedAction, ISessionPendingMessageRemovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckQueuedMessagesReorderedAction = AssertCompatible<V1_ISessionQueuedMessagesReorderedAction, ISessionQueuedMessagesReorderedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequestedAction = AssertCompatible<V1_ISessionInputRequestedAction, ISessionInputRequestedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerChangedAction = AssertCompatible<V1_ISessionInputAnswerChangedAction, ISessionInputAnswerChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputCompletedAction = AssertCompatible<V1_ISessionInputCompletedAction, ISessionInputCompletedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIcon = AssertCompatible<V1_Icon, Icon>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationRef = AssertCompatible<V1_ICustomizationRef, ICustomizationRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionCustomization = AssertCompatible<V1_ISessionCustomization, ISessionCustomization>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationsChangedAction = AssertCompatible<V1_ISessionCustomizationsChangedAction, ISessionCustomizationsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationToggledAction = AssertCompatible<V1_ISessionCustomizationToggledAction, ISessionCustomizationToggledAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTruncatedAction = AssertCompatible<V1_ISessionTruncatedAction, ISessionTruncatedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsReadChangedAction = AssertCompatible<V1_ISessionIsReadChangedAction, ISessionIsReadChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsDoneChangedAction = AssertCompatible<V1_ISessionIsDoneChangedAction, ISessionIsDoneChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckDiffsChangedAction = AssertCompatible<V1_ISessionDiffsChangedAction, ISessionDiffsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallContentChangedAction = AssertCompatible<V1_ISessionToolCallContentChangedAction, ISessionToolCallContentChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionForkSource = AssertCompatible<V1_ISessionForkSource, ISessionForkSource>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtocolNotification = AssertCompatible<V1_IProtocolNotification, IProtocolNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummaryChangedNotification = AssertCompatible<V1_ISessionSummaryChangedNotification, ISessionSummaryChangedNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckListSessionsResult = AssertCompatible<V1_IListSessionsResult, IListSessionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateParams = AssertCompatible<V1_IAuthenticateParams, IAuthenticateParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateResult = AssertCompatible<V1_IAuthenticateResult, IAuthenticateResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteParams = AssertCompatible<V1_IResourceWriteParams, IResourceWriteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteResult = AssertCompatible<V1_IResourceWriteResult, IResourceWriteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadParams = AssertCompatible<V1_IResourceReadParams, IResourceReadParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadResult = AssertCompatible<V1_IResourceReadResult, IResourceReadResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListParams = AssertCompatible<V1_IResourceListParams, IResourceListParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListResult = AssertCompatible<V1_IResourceListResult, IResourceListResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyParams = AssertCompatible<V1_IResourceCopyParams, IResourceCopyParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyResult = AssertCompatible<V1_IResourceCopyResult, IResourceCopyResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteParams = AssertCompatible<V1_IResourceDeleteParams, IResourceDeleteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteResult = AssertCompatible<V1_IResourceDeleteResult, IResourceDeleteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveParams = AssertCompatible<V1_IResourceMoveParams, IResourceMoveParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveResult = AssertCompatible<V1_IResourceMoveResult, IResourceMoveResult>;
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalsChangedAction = AssertCompatible<V1_IRootTerminalsChangedAction, IRootTerminalsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalDataAction = AssertCompatible<V1_ITerminalDataAction, ITerminalDataAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInputAction = AssertCompatible<V1_ITerminalInputAction, ITerminalInputAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalResizedAction = AssertCompatible<V1_ITerminalResizedAction, ITerminalResizedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaimedAction = AssertCompatible<V1_ITerminalClaimedAction, ITerminalClaimedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalTitleChangedAction = AssertCompatible<V1_ITerminalTitleChangedAction, ITerminalTitleChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCwdChangedAction = AssertCompatible<V1_ITerminalCwdChangedAction, ITerminalCwdChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalExitedAction = AssertCompatible<V1_ITerminalExitedAction, ITerminalExitedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClearedAction = AssertCompatible<V1_ITerminalClearedAction, ITerminalClearedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInfo = AssertCompatible<V1_ITerminalInfo, ITerminalInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClientClaim = AssertCompatible<V1_ITerminalClientClaim, ITerminalClientClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalSessionClaim = AssertCompatible<V1_ITerminalSessionClaim, ITerminalSessionClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaim = AssertCompatible<V1_ITerminalClaim, ITerminalClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalState = AssertCompatible<V1_ITerminalState, ITerminalState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCreateTerminalParams = AssertCompatible<V1_ICreateTerminalParams, ICreateTerminalParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckDisposeTerminalParams = AssertCompatible<V1_IDisposeTerminalParams, IDisposeTerminalParams>;
