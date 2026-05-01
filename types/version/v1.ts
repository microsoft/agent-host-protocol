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
  RootState,
  RootConfigState,
  AgentInfo,
  SessionModelInfo,
  ModelSelection,
  ProtectedResourceMetadata,
  StringOrMarkdown,
  SessionState,
  SessionSummary,
  SessionConfigState,
  ConfigPropertySchema,
  ConfigSchema,
  ProjectInfo,
  SessionActiveClient,
  Turn,
  ActiveTurn,
  UserMessage,
  MessageAttachment,
  MarkdownResponsePart,
  ContentRef,
  ToolCallResponsePart,
  ReasoningResponsePart,
  ToolCallResult,
  ToolCallStreamingState,
  ToolCallPendingConfirmationState,
  ToolCallRunningState,
  ToolCallPendingResultConfirmationState,
  ToolCallCompletedState,
  ToolCallCancelledState,
  ToolCallState,
  ToolDefinition,
  ToolAnnotations,
  ToolResultTextContent,
  ToolResultEmbeddedResourceContent,
  ToolResultResourceContent,
  FileEdit,
  ToolResultFileEditContent,
  ToolResultTerminalContent,
  ToolResultSubagentContent,
  UsageInfo,
  ErrorInfo,
  Snapshot,
  PendingMessage,
  Icon,
  CustomizationRef,
  SessionCustomization,
  TerminalInfo,
  TerminalClientClaim,
  TerminalSessionClaim,
  TerminalClaim,
  TerminalState,
  TerminalContentPart,
  TerminalUnclassifiedPart,
  TerminalCommandPart,
  SessionInputAnswer,
  SessionInputAnswerValue,
  SessionInputTextAnswerValue,
  SessionInputNumberAnswerValue,
  SessionInputBooleanAnswerValue,
  SessionInputSelectedAnswerValue,
  SessionInputSelectedManyAnswerValue,
  SessionInputAnswered,
  SessionInputSkipped,
  SessionInputOption,
  SessionInputQuestion,
  SessionInputTextQuestion,
  SessionInputNumberQuestion,
  SessionInputBooleanQuestion,
  SessionInputSingleSelectQuestion,
  SessionInputMultiSelectQuestion,
  SessionInputRequest,
  ConfirmationOption,
  ConfirmationOptionKind,
} from '../state.js';

import type {
  StateAction,
  ActionEnvelope,
  ActionOrigin,
  RootActiveSessionsChangedAction,
  SessionToolCallApprovedAction,
  SessionToolCallDeniedAction,
  SessionServerToolsChangedAction,
  SessionActiveClientChangedAction,
  SessionActiveClientToolsChangedAction,
  SessionPendingMessageSetAction,
  SessionPendingMessageRemovedAction,
  SessionQueuedMessagesReorderedAction,
  SessionCustomizationsChangedAction,
  SessionCustomizationToggledAction,
  SessionTruncatedAction,
  SessionIsReadChangedAction,
  SessionIsArchivedChangedAction,
  SessionActivityChangedAction,
  SessionDiffsChangedAction,
  SessionConfigChangedAction,
  RootTerminalsChangedAction,
  RootConfigChangedAction,
  SessionToolCallContentChangedAction,
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
  SessionInputAnswerChangedAction,
  SessionInputCompletedAction,
  SessionInputRequestedAction,
} from '../actions.js';

import type {
  ProtocolNotification,
  AuthRequiredNotification,
  SessionSummaryChangedNotification,
} from '../notifications.js';

import type {
  ListSessionsResult,
  AuthenticateParams,
  AuthenticateResult,
  ResourceWriteParams,
  ResourceWriteResult,
  SessionForkSource,
  ResourceReadParams,
  ResourceReadResult,
  ResourceListParams,
  ResourceListResult,
  ResourceCopyParams,
  ResourceCopyResult,
  ResourceDeleteParams,
  ResourceDeleteResult,
  ResourceMoveParams,
  ResourceMoveResult,
  ResourceRequestParams,
  ResourceRequestResult,
  CreateTerminalParams,
  CreateSessionParams,
  DisposeTerminalParams,
  ResolveSessionConfigParams,
  ResolveSessionConfigResult,
  SessionConfigPropertySchema,
  SessionConfigSchema,
  SessionConfigCompletionsParams,
  SessionConfigCompletionsResult,
  SessionConfigValueItem,
  InitializeParams,
  InitializeResult,
  ReconnectParams,
  ReconnectResult,
  ReconnectReplayResult,
  ReconnectSnapshotResult,
} from '../commands.js';

import type {
  CommandMap,
  ServerCommandMap,
  ClientNotificationMap,
  ServerNotificationMap,
  NotificationMethodParams,
} from '../messages.js';

import type {
  AhpError,
  AhpErrorDetailsMap,
  AuthRequiredErrorData,
  PermissionDeniedErrorData,
} from '../errors.js';

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

type V1_IRootState = RootState;
type V1_IRootConfigState = RootConfigState;
type V1_StringOrMarkdown = StringOrMarkdown;
type V1_IAgentInfo = AgentInfo;
type V1_IProtectedResourceMetadata = ProtectedResourceMetadata;
type V1_ISessionModelInfo = SessionModelInfo;
type V1_IModelSelection = ModelSelection;
type V1_ISessionState = SessionState;
type V1_ISessionSummary = SessionSummary;
type V1_ISessionConfigState = SessionConfigState;
type V1_IProjectInfo = ProjectInfo;
type V1_ISessionActiveClient = SessionActiveClient;
type V1_ITurn = Turn;
type V1_IActiveTurn = ActiveTurn;
type V1_IUserMessage = UserMessage;
type V1_IMessageAttachment = MessageAttachment;
type V1_IMarkdownResponsePart = MarkdownResponsePart;
type V1_IContentRef = ContentRef;
type V1_IToolCallResponsePart = ToolCallResponsePart;
type V1_IReasoningResponsePart = ReasoningResponsePart;
type V1_IToolCallResult = ToolCallResult;
type V1_IToolCallStreamingState = ToolCallStreamingState;
type V1_IToolCallPendingConfirmationState = ToolCallPendingConfirmationState;
type V1_IToolCallRunningState = ToolCallRunningState;
type V1_IToolCallPendingResultConfirmationState = ToolCallPendingResultConfirmationState;
type V1_IToolCallCompletedState = ToolCallCompletedState;
type V1_IToolCallCancelledState = ToolCallCancelledState;
type V1_IToolCallState = ToolCallState;
type V1_IToolDefinition = ToolDefinition;
type V1_IToolAnnotations = ToolAnnotations;
type V1_IToolResultTextContent = ToolResultTextContent;
type V1_IToolResultEmbeddedResourceContent = ToolResultEmbeddedResourceContent;
type V1_IToolResultResourceContent = ToolResultResourceContent;
type V1_IFileEdit = FileEdit;
type V1_IToolResultFileEditContent = ToolResultFileEditContent;
type V1_IToolResultTerminalContent = ToolResultTerminalContent;
type V1_IToolResultSubagentContent = ToolResultSubagentContent;
type V1_IUsageInfo = UsageInfo;
type V1_IErrorInfo = ErrorInfo;
type V1_ISnapshot = Snapshot;
type V1_IPendingMessage = PendingMessage;
type V1_ISessionInputAnswer = SessionInputAnswer;
type V1_ISessionInputAnswerValue = SessionInputAnswerValue;
type V1_ISessionInputTextAnswerValue = SessionInputTextAnswerValue;
type V1_ISessionInputNumberAnswerValue = SessionInputNumberAnswerValue;
type V1_ISessionInputBooleanAnswerValue = SessionInputBooleanAnswerValue;
type V1_ISessionInputSelectedAnswerValue = SessionInputSelectedAnswerValue;
type V1_ISessionInputSelectedManyAnswerValue = SessionInputSelectedManyAnswerValue;
type V1_ISessionInputAnswered = SessionInputAnswered;
type V1_ISessionInputSkipped = SessionInputSkipped;
type V1_ISessionInputOption = SessionInputOption;
type V1_ISessionInputQuestion = SessionInputQuestion;
type V1_ISessionInputTextQuestion = SessionInputTextQuestion;
type V1_ISessionInputNumberQuestion = SessionInputNumberQuestion;
type V1_ISessionInputBooleanQuestion = SessionInputBooleanQuestion;
type V1_ISessionInputSingleSelectQuestion = SessionInputSingleSelectQuestion;
type V1_ISessionInputMultiSelectQuestion = SessionInputMultiSelectQuestion;
type V1_ISessionInputRequest = SessionInputRequest;
type V1_IConfirmationOption = ConfirmationOption;
type V1_ConfirmationOptionKind = ConfirmationOptionKind;
type V1_Icon = Icon;
type V1_ICustomizationRef = CustomizationRef;
type V1_ISessionCustomization = SessionCustomization;
type V1_IStateAction = StateAction;
type V1_IActionEnvelope = ActionEnvelope;
type V1_IActionOrigin = ActionOrigin;
type V1_IRootActiveSessionsChangedAction = RootActiveSessionsChangedAction;
type V1_ISessionToolCallApprovedAction = SessionToolCallApprovedAction;
type V1_ISessionToolCallDeniedAction = SessionToolCallDeniedAction;
type V1_ISessionServerToolsChangedAction = SessionServerToolsChangedAction;
type V1_ISessionActiveClientChangedAction = SessionActiveClientChangedAction;
type V1_ISessionActiveClientToolsChangedAction = SessionActiveClientToolsChangedAction;
type V1_ISessionPendingMessageSetAction = SessionPendingMessageSetAction;
type V1_ISessionPendingMessageRemovedAction = SessionPendingMessageRemovedAction;
type V1_ISessionQueuedMessagesReorderedAction = SessionQueuedMessagesReorderedAction;
type V1_ISessionCustomizationsChangedAction = SessionCustomizationsChangedAction;
type V1_ISessionCustomizationToggledAction = SessionCustomizationToggledAction;
type V1_ISessionTruncatedAction = SessionTruncatedAction;
type V1_ISessionIsReadChangedAction = SessionIsReadChangedAction;
type V1_ISessionIsArchivedChangedAction = SessionIsArchivedChangedAction;
type V1_ISessionActivityChangedAction = SessionActivityChangedAction;
type V1_ISessionDiffsChangedAction = SessionDiffsChangedAction;
type V1_ISessionConfigChangedAction = SessionConfigChangedAction;
type V1_ISessionToolCallContentChangedAction = SessionToolCallContentChangedAction;
type V1_ISessionInputRequestedAction = SessionInputRequestedAction;
type V1_ISessionInputAnswerChangedAction = SessionInputAnswerChangedAction;
type V1_ISessionInputCompletedAction = SessionInputCompletedAction;
type V1_IRootTerminalsChangedAction = RootTerminalsChangedAction;
type V1_IRootConfigChangedAction = RootConfigChangedAction;
type V1_ITerminalDataAction = TerminalDataAction;
type V1_ITerminalInputAction = TerminalInputAction;
type V1_ITerminalResizedAction = TerminalResizedAction;
type V1_ITerminalClaimedAction = TerminalClaimedAction;
type V1_ITerminalTitleChangedAction = TerminalTitleChangedAction;
type V1_ITerminalCwdChangedAction = TerminalCwdChangedAction;
type V1_ITerminalExitedAction = TerminalExitedAction;
type V1_ITerminalClearedAction = TerminalClearedAction;
type V1_ITerminalCommandDetectionAvailableAction = TerminalCommandDetectionAvailableAction;
type V1_ITerminalCommandExecutedAction = TerminalCommandExecutedAction;
type V1_ITerminalCommandFinishedAction = TerminalCommandFinishedAction;
type V1_ITerminalInfo = TerminalInfo;
type V1_ITerminalClientClaim = TerminalClientClaim;
type V1_ITerminalSessionClaim = TerminalSessionClaim;
type V1_ITerminalClaim = TerminalClaim;
type V1_ITerminalState = TerminalState;
type V1_ITerminalContentPart = TerminalContentPart;
type V1_ITerminalUnclassifiedPart = TerminalUnclassifiedPart;
type V1_ITerminalCommandPart = TerminalCommandPart;
type V1_ICreateTerminalParams = CreateTerminalParams;
type V1_ICreateSessionParams = CreateSessionParams;
type V1_IDisposeTerminalParams = DisposeTerminalParams;
type V1_ISessionForkSource = SessionForkSource;
type V1_IProtocolNotification = ProtocolNotification;
type V1_IAuthRequiredNotification = AuthRequiredNotification;
type V1_ISessionSummaryChangedNotification = SessionSummaryChangedNotification;
type V1_IListSessionsResult = ListSessionsResult;
type V1_IAuthenticateParams = AuthenticateParams;
type V1_IAuthenticateResult = AuthenticateResult;
type V1_IResourceWriteParams = ResourceWriteParams;
type V1_IResourceWriteResult = ResourceWriteResult;
type V1_IResourceReadParams = ResourceReadParams;
type V1_IResourceReadResult = ResourceReadResult;
type V1_IResourceListParams = ResourceListParams;
type V1_IResourceListResult = ResourceListResult;
type V1_IResourceCopyParams = ResourceCopyParams;
type V1_IResourceCopyResult = ResourceCopyResult;
type V1_IResourceDeleteParams = ResourceDeleteParams;
type V1_IResourceDeleteResult = ResourceDeleteResult;
type V1_IResourceMoveParams = ResourceMoveParams;
type V1_IResourceMoveResult = ResourceMoveResult;
type V1_IResourceRequestParams = ResourceRequestParams;
type V1_IResourceRequestResult = ResourceRequestResult;
type V1_IResolveSessionConfigParams = ResolveSessionConfigParams;
type V1_IResolveSessionConfigResult = ResolveSessionConfigResult;
type V1_IConfigPropertySchema = ConfigPropertySchema;
type V1_IConfigSchema = ConfigSchema;
type V1_ISessionConfigPropertySchema = SessionConfigPropertySchema;
type V1_ISessionConfigSchema = SessionConfigSchema;
type V1_ISessionConfigCompletionsParams = SessionConfigCompletionsParams;
type V1_ISessionConfigCompletionsResult = SessionConfigCompletionsResult;
type V1_ISessionConfigValueItem = SessionConfigValueItem;
type V1_IInitializeParams = InitializeParams;
type V1_IInitializeResult = InitializeResult;
type V1_IReconnectParams = ReconnectParams;
type V1_IReconnectResult = ReconnectResult;
type V1_IReconnectReplayResult = ReconnectReplayResult;
type V1_IReconnectSnapshotResult = ReconnectSnapshotResult;
type V1_ICommandMap = CommandMap;
type V1_IServerCommandMap = ServerCommandMap;
type V1_IClientNotificationMap = ClientNotificationMap;
type V1_IServerNotificationMap = ServerNotificationMap;
type V1_INotificationMethodParams = NotificationMethodParams;
type V1_IAhpError = AhpError;
type V1_IAhpErrorDetailsMap = AhpErrorDetailsMap;
type V1_IAuthRequiredErrorData = AuthRequiredErrorData;
type V1_IPermissionDeniedErrorData = PermissionDeniedErrorData;

// ─── Compatibility Assertions ────────────────────────────────────────────────

// These will fail at compile time if the living types diverge from v1 in a
// backward-incompatible way.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootState = AssertCompatible<V1_IRootState, RootState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootConfigState = AssertCompatible<V1_IRootConfigState, RootConfigState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStringOrMarkdown = AssertCompatible<V1_StringOrMarkdown, StringOrMarkdown>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAgentInfo = AssertCompatible<V1_IAgentInfo, AgentInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionModelInfo = AssertCompatible<V1_ISessionModelInfo, SessionModelInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckModelSelection = AssertCompatible<V1_IModelSelection, ModelSelection>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionState = AssertCompatible<V1_ISessionState, SessionState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummary = AssertCompatible<V1_ISessionSummary, SessionSummary>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigState = AssertCompatible<V1_ISessionConfigState, SessionConfigState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProjectInfo = AssertCompatible<V1_IProjectInfo, ProjectInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTurn = AssertCompatible<V1_ITurn, Turn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveTurn = AssertCompatible<V1_IActiveTurn, ActiveTurn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUserMessage = AssertCompatible<V1_IUserMessage, UserMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageAttachment = AssertCompatible<V1_IMessageAttachment, MessageAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMarkdownResponsePart = AssertCompatible<V1_IMarkdownResponsePart, MarkdownResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckContentRef = AssertCompatible<V1_IContentRef, ContentRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResponsePart = AssertCompatible<V1_IToolCallResponsePart, ToolCallResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReasoningResponsePart = AssertCompatible<V1_IReasoningResponsePart, ReasoningResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResult = AssertCompatible<V1_IToolCallResult, ToolCallResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallStreamingState = AssertCompatible<V1_IToolCallStreamingState, ToolCallStreamingState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingConfirmationState = AssertCompatible<V1_IToolCallPendingConfirmationState, ToolCallPendingConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallRunningState = AssertCompatible<V1_IToolCallRunningState, ToolCallRunningState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingResultConfirmationState = AssertCompatible<V1_IToolCallPendingResultConfirmationState, ToolCallPendingResultConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCompletedState = AssertCompatible<V1_IToolCallCompletedState, ToolCallCompletedState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCancelledState = AssertCompatible<V1_IToolCallCancelledState, ToolCallCancelledState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallState = AssertCompatible<V1_IToolCallState, ToolCallState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUsageInfo = AssertCompatible<V1_IUsageInfo, UsageInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckErrorInfo = AssertCompatible<V1_IErrorInfo, ErrorInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSnapshot = AssertCompatible<V1_ISnapshot, Snapshot>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStateAction = AssertCompatible<V1_IStateAction, StateAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionEnvelope = AssertCompatible<V1_IActionEnvelope, ActionEnvelope>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionOrigin = AssertCompatible<V1_IActionOrigin, ActionOrigin>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveSessionsChangedAction = AssertCompatible<V1_IRootActiveSessionsChangedAction, RootActiveSessionsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallApprovedAction = AssertCompatible<V1_ISessionToolCallApprovedAction, SessionToolCallApprovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallDeniedAction = AssertCompatible<V1_ISessionToolCallDeniedAction, SessionToolCallDeniedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionActiveClient = AssertCompatible<V1_ISessionActiveClient, SessionActiveClient>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolDefinition = AssertCompatible<V1_IToolDefinition, ToolDefinition>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolAnnotations = AssertCompatible<V1_IToolAnnotations, ToolAnnotations>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTextContent = AssertCompatible<V1_IToolResultTextContent, ToolResultTextContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultEmbeddedResourceContent = AssertCompatible<V1_IToolResultEmbeddedResourceContent, ToolResultEmbeddedResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultResourceContent = AssertCompatible<V1_IToolResultResourceContent, ToolResultResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckFileEdit = AssertCompatible<V1_IFileEdit, FileEdit>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultFileEditContent = AssertCompatible<V1_IToolResultFileEditContent, ToolResultFileEditContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTerminalContent = AssertCompatible<V1_IToolResultTerminalContent, ToolResultTerminalContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultSubagentContent = AssertCompatible<V1_IToolResultSubagentContent, ToolResultSubagentContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerToolsChangedAction = AssertCompatible<V1_ISessionServerToolsChangedAction, SessionServerToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientChangedAction = AssertCompatible<V1_ISessionActiveClientChangedAction, SessionActiveClientChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientToolsChangedAction = AssertCompatible<V1_ISessionActiveClientToolsChangedAction, SessionActiveClientToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessage = AssertCompatible<V1_IPendingMessage, PendingMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswer = AssertCompatible<V1_ISessionInputAnswer, SessionInputAnswer>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerValue = AssertCompatible<V1_ISessionInputAnswerValue, SessionInputAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextAnswerValue = AssertCompatible<V1_ISessionInputTextAnswerValue, SessionInputTextAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberAnswerValue = AssertCompatible<V1_ISessionInputNumberAnswerValue, SessionInputNumberAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanAnswerValue = AssertCompatible<V1_ISessionInputBooleanAnswerValue, SessionInputBooleanAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedAnswerValue = AssertCompatible<V1_ISessionInputSelectedAnswerValue, SessionInputSelectedAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedManyAnswerValue = AssertCompatible<V1_ISessionInputSelectedManyAnswerValue, SessionInputSelectedManyAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswered = AssertCompatible<V1_ISessionInputAnswered, SessionInputAnswered>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSkipped = AssertCompatible<V1_ISessionInputSkipped, SessionInputSkipped>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputOption = AssertCompatible<V1_ISessionInputOption, SessionInputOption>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputQuestion = AssertCompatible<V1_ISessionInputQuestion, SessionInputQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextQuestion = AssertCompatible<V1_ISessionInputTextQuestion, SessionInputTextQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberQuestion = AssertCompatible<V1_ISessionInputNumberQuestion, SessionInputNumberQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanQuestion = AssertCompatible<V1_ISessionInputBooleanQuestion, SessionInputBooleanQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSingleSelectQuestion = AssertCompatible<V1_ISessionInputSingleSelectQuestion, SessionInputSingleSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputMultiSelectQuestion = AssertCompatible<V1_ISessionInputMultiSelectQuestion, SessionInputMultiSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequest = AssertCompatible<V1_ISessionInputRequest, SessionInputRequest>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageSetAction = AssertCompatible<V1_ISessionPendingMessageSetAction, SessionPendingMessageSetAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageRemovedAction = AssertCompatible<V1_ISessionPendingMessageRemovedAction, SessionPendingMessageRemovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckQueuedMessagesReorderedAction = AssertCompatible<V1_ISessionQueuedMessagesReorderedAction, SessionQueuedMessagesReorderedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequestedAction = AssertCompatible<V1_ISessionInputRequestedAction, SessionInputRequestedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerChangedAction = AssertCompatible<V1_ISessionInputAnswerChangedAction, SessionInputAnswerChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputCompletedAction = AssertCompatible<V1_ISessionInputCompletedAction, SessionInputCompletedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIcon = AssertCompatible<V1_Icon, Icon>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationRef = AssertCompatible<V1_ICustomizationRef, CustomizationRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionCustomization = AssertCompatible<V1_ISessionCustomization, SessionCustomization>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationsChangedAction = AssertCompatible<V1_ISessionCustomizationsChangedAction, SessionCustomizationsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationToggledAction = AssertCompatible<V1_ISessionCustomizationToggledAction, SessionCustomizationToggledAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTruncatedAction = AssertCompatible<V1_ISessionTruncatedAction, SessionTruncatedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsReadChangedAction = AssertCompatible<V1_ISessionIsReadChangedAction, SessionIsReadChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsArchivedChangedAction = AssertCompatible<V1_ISessionIsArchivedChangedAction, SessionIsArchivedChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActivityChangedAction = AssertCompatible<V1_ISessionActivityChangedAction, SessionActivityChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckDiffsChangedAction = AssertCompatible<V1_ISessionDiffsChangedAction, SessionDiffsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigChangedAction = AssertCompatible<V1_ISessionConfigChangedAction, SessionConfigChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallContentChangedAction = AssertCompatible<V1_ISessionToolCallContentChangedAction, SessionToolCallContentChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionForkSource = AssertCompatible<V1_ISessionForkSource, SessionForkSource>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtocolNotification = AssertCompatible<V1_IProtocolNotification, ProtocolNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummaryChangedNotification = AssertCompatible<V1_ISessionSummaryChangedNotification, SessionSummaryChangedNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckListSessionsResult = AssertCompatible<V1_IListSessionsResult, ListSessionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateParams = AssertCompatible<V1_IAuthenticateParams, AuthenticateParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateResult = AssertCompatible<V1_IAuthenticateResult, AuthenticateResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteParams = AssertCompatible<V1_IResourceWriteParams, ResourceWriteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteResult = AssertCompatible<V1_IResourceWriteResult, ResourceWriteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadParams = AssertCompatible<V1_IResourceReadParams, ResourceReadParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadResult = AssertCompatible<V1_IResourceReadResult, ResourceReadResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListParams = AssertCompatible<V1_IResourceListParams, ResourceListParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListResult = AssertCompatible<V1_IResourceListResult, ResourceListResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyParams = AssertCompatible<V1_IResourceCopyParams, ResourceCopyParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyResult = AssertCompatible<V1_IResourceCopyResult, ResourceCopyResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteParams = AssertCompatible<V1_IResourceDeleteParams, ResourceDeleteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteResult = AssertCompatible<V1_IResourceDeleteResult, ResourceDeleteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveParams = AssertCompatible<V1_IResourceMoveParams, ResourceMoveParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveResult = AssertCompatible<V1_IResourceMoveResult, ResourceMoveResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceRequestParams = AssertCompatible<V1_IResourceRequestParams, ResourceRequestParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceRequestResult = AssertCompatible<V1_IResourceRequestResult, ResourceRequestResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtectedResourceMetadata = AssertCompatible<V1_IProtectedResourceMetadata, ProtectedResourceMetadata>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthRequiredNotification = AssertCompatible<V1_IAuthRequiredNotification, AuthRequiredNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCommandMap = AssertCompatible<V1_ICommandMap, CommandMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerCommandMap = AssertCompatible<V1_IServerCommandMap, ServerCommandMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckClientNotificationMap = AssertCompatible<V1_IClientNotificationMap, ClientNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerNotificationMap = AssertCompatible<V1_IServerNotificationMap, ServerNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckNotificationMethodParams = AssertCompatible<V1_INotificationMethodParams, NotificationMethodParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAhpError = AssertCompatible<V1_IAhpError, AhpError>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAhpErrorDetailsMap = AssertCompatible<V1_IAhpErrorDetailsMap, AhpErrorDetailsMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthRequiredErrorData = AssertCompatible<V1_IAuthRequiredErrorData, AuthRequiredErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPermissionDeniedErrorData = AssertCompatible<V1_IPermissionDeniedErrorData, PermissionDeniedErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalsChangedAction = AssertCompatible<V1_IRootTerminalsChangedAction, RootTerminalsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootConfigChangedAction = AssertCompatible<V1_IRootConfigChangedAction, RootConfigChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalDataAction = AssertCompatible<V1_ITerminalDataAction, TerminalDataAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInputAction = AssertCompatible<V1_ITerminalInputAction, TerminalInputAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalResizedAction = AssertCompatible<V1_ITerminalResizedAction, TerminalResizedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaimedAction = AssertCompatible<V1_ITerminalClaimedAction, TerminalClaimedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalTitleChangedAction = AssertCompatible<V1_ITerminalTitleChangedAction, TerminalTitleChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCwdChangedAction = AssertCompatible<V1_ITerminalCwdChangedAction, TerminalCwdChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalExitedAction = AssertCompatible<V1_ITerminalExitedAction, TerminalExitedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClearedAction = AssertCompatible<V1_ITerminalClearedAction, TerminalClearedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandDetectionAvailableAction = AssertCompatible<V1_ITerminalCommandDetectionAvailableAction, TerminalCommandDetectionAvailableAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandExecutedAction = AssertCompatible<V1_ITerminalCommandExecutedAction, TerminalCommandExecutedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandFinishedAction = AssertCompatible<V1_ITerminalCommandFinishedAction, TerminalCommandFinishedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInfo = AssertCompatible<V1_ITerminalInfo, TerminalInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClientClaim = AssertCompatible<V1_ITerminalClientClaim, TerminalClientClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalSessionClaim = AssertCompatible<V1_ITerminalSessionClaim, TerminalSessionClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaim = AssertCompatible<V1_ITerminalClaim, TerminalClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalState = AssertCompatible<V1_ITerminalState, TerminalState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalContentPart = AssertCompatible<V1_ITerminalContentPart, TerminalContentPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalUnclassifiedPart = AssertCompatible<V1_ITerminalUnclassifiedPart, TerminalUnclassifiedPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandPart = AssertCompatible<V1_ITerminalCommandPart, TerminalCommandPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCreateTerminalParams = AssertCompatible<V1_ICreateTerminalParams, CreateTerminalParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCreateSessionParams = AssertCompatible<V1_ICreateSessionParams, CreateSessionParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckDisposeTerminalParams = AssertCompatible<V1_IDisposeTerminalParams, DisposeTerminalParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResolveSessionConfigParams = AssertCompatible<V1_IResolveSessionConfigParams, ResolveSessionConfigParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResolveSessionConfigResult = AssertCompatible<V1_IResolveSessionConfigResult, ResolveSessionConfigResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigPropertySchema = AssertCompatible<V1_IConfigPropertySchema, ConfigPropertySchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigSchema = AssertCompatible<V1_IConfigSchema, ConfigSchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigPropertySchema = AssertCompatible<V1_ISessionConfigPropertySchema, SessionConfigPropertySchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigSchema = AssertCompatible<V1_ISessionConfigSchema, SessionConfigSchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigCompletionsParams = AssertCompatible<V1_ISessionConfigCompletionsParams, SessionConfigCompletionsParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigCompletionsResult = AssertCompatible<V1_ISessionConfigCompletionsResult, SessionConfigCompletionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigValueItem = AssertCompatible<V1_ISessionConfigValueItem, SessionConfigValueItem>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfirmationOption = AssertCompatible<V1_IConfirmationOption, ConfirmationOption>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfirmationOptionKind = AssertCompatible<V1_ConfirmationOptionKind, ConfirmationOptionKind>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInitializeParams = AssertCompatible<V1_IInitializeParams, InitializeParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInitializeResult = AssertCompatible<V1_IInitializeResult, InitializeResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectParams = AssertCompatible<V1_IReconnectParams, ReconnectParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectResult = AssertCompatible<V1_IReconnectResult, ReconnectResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectReplayResult = AssertCompatible<V1_IReconnectReplayResult, ReconnectReplayResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectSnapshotResult = AssertCompatible<V1_IReconnectSnapshotResult, ReconnectSnapshotResult>;
