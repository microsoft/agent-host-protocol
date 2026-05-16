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
  MessageAttachmentBase,
  TextPosition,
  TextRange,
  TextSelection,
  SimpleMessageAttachment,
  MessageEmbeddedResourceAttachment,
  MessageResourceAttachment,
  MarkdownResponsePart,
  ContentRef,
  ToolCallResponsePart,
  ReasoningResponsePart,
  SystemNotificationResponsePart,
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
  SessionCustomizationUpdatedAction,
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
  CompletionsParams,
  CompletionItem,
  CompletionsResult,
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
  UnsupportedProtocolVersionErrorData,
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

type V1_RootState = RootState;
type V1_RootConfigState = RootConfigState;
type V1_StringOrMarkdown = StringOrMarkdown;
type V1_AgentInfo = AgentInfo;
type V1_ProtectedResourceMetadata = ProtectedResourceMetadata;
type V1_SessionModelInfo = SessionModelInfo;
type V1_ModelSelection = ModelSelection;
type V1_SessionState = SessionState;
type V1_SessionSummary = SessionSummary;
type V1_SessionConfigState = SessionConfigState;
type V1_ProjectInfo = ProjectInfo;
type V1_SessionActiveClient = SessionActiveClient;
type V1_Turn = Turn;
type V1_ActiveTurn = ActiveTurn;
type V1_UserMessage = UserMessage;
type V1_MessageAttachment = MessageAttachment;
type V1_MessageAttachmentBase = MessageAttachmentBase;
type V1_TextPosition = TextPosition;
type V1_TextRange = TextRange;
type V1_TextSelection = TextSelection;
type V1_SimpleMessageAttachment = SimpleMessageAttachment;
type V1_MessageEmbeddedResourceAttachment = MessageEmbeddedResourceAttachment;
type V1_MessageResourceAttachment = MessageResourceAttachment;
type V1_MarkdownResponsePart = MarkdownResponsePart;
type V1_ContentRef = ContentRef;
type V1_ToolCallResponsePart = ToolCallResponsePart;
type V1_ReasoningResponsePart = ReasoningResponsePart;
type V1_SystemNotificationResponsePart = SystemNotificationResponsePart;
type V1_ToolCallResult = ToolCallResult;
type V1_ToolCallStreamingState = ToolCallStreamingState;
type V1_ToolCallPendingConfirmationState = ToolCallPendingConfirmationState;
type V1_ToolCallRunningState = ToolCallRunningState;
type V1_ToolCallPendingResultConfirmationState = ToolCallPendingResultConfirmationState;
type V1_ToolCallCompletedState = ToolCallCompletedState;
type V1_ToolCallCancelledState = ToolCallCancelledState;
type V1_ToolCallState = ToolCallState;
type V1_ToolDefinition = ToolDefinition;
type V1_ToolAnnotations = ToolAnnotations;
type V1_ToolResultTextContent = ToolResultTextContent;
type V1_ToolResultEmbeddedResourceContent = ToolResultEmbeddedResourceContent;
type V1_ToolResultResourceContent = ToolResultResourceContent;
type V1_FileEdit = FileEdit;
type V1_ToolResultFileEditContent = ToolResultFileEditContent;
type V1_ToolResultTerminalContent = ToolResultTerminalContent;
type V1_ToolResultSubagentContent = ToolResultSubagentContent;
type V1_UsageInfo = UsageInfo;
type V1_ErrorInfo = ErrorInfo;
type V1_Snapshot = Snapshot;
type V1_PendingMessage = PendingMessage;
type V1_SessionInputAnswer = SessionInputAnswer;
type V1_SessionInputAnswerValue = SessionInputAnswerValue;
type V1_SessionInputTextAnswerValue = SessionInputTextAnswerValue;
type V1_SessionInputNumberAnswerValue = SessionInputNumberAnswerValue;
type V1_SessionInputBooleanAnswerValue = SessionInputBooleanAnswerValue;
type V1_SessionInputSelectedAnswerValue = SessionInputSelectedAnswerValue;
type V1_SessionInputSelectedManyAnswerValue = SessionInputSelectedManyAnswerValue;
type V1_SessionInputAnswered = SessionInputAnswered;
type V1_SessionInputSkipped = SessionInputSkipped;
type V1_SessionInputOption = SessionInputOption;
type V1_SessionInputQuestion = SessionInputQuestion;
type V1_SessionInputTextQuestion = SessionInputTextQuestion;
type V1_SessionInputNumberQuestion = SessionInputNumberQuestion;
type V1_SessionInputBooleanQuestion = SessionInputBooleanQuestion;
type V1_SessionInputSingleSelectQuestion = SessionInputSingleSelectQuestion;
type V1_SessionInputMultiSelectQuestion = SessionInputMultiSelectQuestion;
type V1_SessionInputRequest = SessionInputRequest;
type V1_ConfirmationOption = ConfirmationOption;
type V1_ConfirmationOptionKind = ConfirmationOptionKind;
type V1_con = Icon;
type V1_CustomizationRef = CustomizationRef;
type V1_SessionCustomization = SessionCustomization;
type V1_StateAction = StateAction;
type V1_ActionEnvelope = ActionEnvelope;
type V1_ActionOrigin = ActionOrigin;
type V1_RootActiveSessionsChangedAction = RootActiveSessionsChangedAction;
type V1_SessionToolCallApprovedAction = SessionToolCallApprovedAction;
type V1_SessionToolCallDeniedAction = SessionToolCallDeniedAction;
type V1_SessionServerToolsChangedAction = SessionServerToolsChangedAction;
type V1_SessionActiveClientChangedAction = SessionActiveClientChangedAction;
type V1_SessionActiveClientToolsChangedAction = SessionActiveClientToolsChangedAction;
type V1_SessionPendingMessageSetAction = SessionPendingMessageSetAction;
type V1_SessionPendingMessageRemovedAction = SessionPendingMessageRemovedAction;
type V1_SessionQueuedMessagesReorderedAction = SessionQueuedMessagesReorderedAction;
type V1_SessionCustomizationsChangedAction = SessionCustomizationsChangedAction;
type V1_SessionCustomizationToggledAction = SessionCustomizationToggledAction;
type V1_SessionCustomizationUpdatedAction = SessionCustomizationUpdatedAction;
type V1_SessionTruncatedAction = SessionTruncatedAction;
type V1_SessionIsReadChangedAction = SessionIsReadChangedAction;
type V1_SessionIsArchivedChangedAction = SessionIsArchivedChangedAction;
type V1_SessionActivityChangedAction = SessionActivityChangedAction;
type V1_SessionDiffsChangedAction = SessionDiffsChangedAction;
type V1_SessionConfigChangedAction = SessionConfigChangedAction;
type V1_SessionToolCallContentChangedAction = SessionToolCallContentChangedAction;
type V1_SessionInputRequestedAction = SessionInputRequestedAction;
type V1_SessionInputAnswerChangedAction = SessionInputAnswerChangedAction;
type V1_SessionInputCompletedAction = SessionInputCompletedAction;
type V1_RootTerminalsChangedAction = RootTerminalsChangedAction;
type V1_RootConfigChangedAction = RootConfigChangedAction;
type V1_TerminalDataAction = TerminalDataAction;
type V1_TerminalInputAction = TerminalInputAction;
type V1_TerminalResizedAction = TerminalResizedAction;
type V1_TerminalClaimedAction = TerminalClaimedAction;
type V1_TerminalTitleChangedAction = TerminalTitleChangedAction;
type V1_TerminalCwdChangedAction = TerminalCwdChangedAction;
type V1_TerminalExitedAction = TerminalExitedAction;
type V1_TerminalClearedAction = TerminalClearedAction;
type V1_TerminalCommandDetectionAvailableAction = TerminalCommandDetectionAvailableAction;
type V1_TerminalCommandExecutedAction = TerminalCommandExecutedAction;
type V1_TerminalCommandFinishedAction = TerminalCommandFinishedAction;
type V1_TerminalInfo = TerminalInfo;
type V1_TerminalClientClaim = TerminalClientClaim;
type V1_TerminalSessionClaim = TerminalSessionClaim;
type V1_TerminalClaim = TerminalClaim;
type V1_TerminalState = TerminalState;
type V1_TerminalContentPart = TerminalContentPart;
type V1_TerminalUnclassifiedPart = TerminalUnclassifiedPart;
type V1_TerminalCommandPart = TerminalCommandPart;
type V1_CreateTerminalParams = CreateTerminalParams;
type V1_CreateSessionParams = CreateSessionParams;
type V1_DisposeTerminalParams = DisposeTerminalParams;
type V1_SessionForkSource = SessionForkSource;
type V1_ProtocolNotification = ProtocolNotification;
type V1_AuthRequiredNotification = AuthRequiredNotification;
type V1_SessionSummaryChangedNotification = SessionSummaryChangedNotification;
type V1_ListSessionsResult = ListSessionsResult;
type V1_AuthenticateParams = AuthenticateParams;
type V1_AuthenticateResult = AuthenticateResult;
type V1_ResourceWriteParams = ResourceWriteParams;
type V1_ResourceWriteResult = ResourceWriteResult;
type V1_ResourceReadParams = ResourceReadParams;
type V1_ResourceReadResult = ResourceReadResult;
type V1_ResourceListParams = ResourceListParams;
type V1_ResourceListResult = ResourceListResult;
type V1_ResourceCopyParams = ResourceCopyParams;
type V1_ResourceCopyResult = ResourceCopyResult;
type V1_ResourceDeleteParams = ResourceDeleteParams;
type V1_ResourceDeleteResult = ResourceDeleteResult;
type V1_ResourceMoveParams = ResourceMoveParams;
type V1_ResourceMoveResult = ResourceMoveResult;
type V1_ResourceRequestParams = ResourceRequestParams;
type V1_ResourceRequestResult = ResourceRequestResult;
type V1_ResolveSessionConfigParams = ResolveSessionConfigParams;
type V1_ResolveSessionConfigResult = ResolveSessionConfigResult;
type V1_ConfigPropertySchema = ConfigPropertySchema;
type V1_ConfigSchema = ConfigSchema;
type V1_SessionConfigPropertySchema = SessionConfigPropertySchema;
type V1_SessionConfigSchema = SessionConfigSchema;
type V1_SessionConfigCompletionsParams = SessionConfigCompletionsParams;
type V1_SessionConfigCompletionsResult = SessionConfigCompletionsResult;
type V1_SessionConfigValueItem = SessionConfigValueItem;
type V1_CompletionsParams = CompletionsParams;
type V1_CompletionItem = CompletionItem;
type V1_CompletionsResult = CompletionsResult;
type V1_InitializeParams = InitializeParams;
type V1_InitializeResult = InitializeResult;
type V1_ReconnectParams = ReconnectParams;
type V1_ReconnectResult = ReconnectResult;
type V1_ReconnectReplayResult = ReconnectReplayResult;
type V1_ReconnectSnapshotResult = ReconnectSnapshotResult;
type V1_CommandMap = CommandMap;
type V1_ServerCommandMap = ServerCommandMap;
type V1_ClientNotificationMap = ClientNotificationMap;
type V1_ServerNotificationMap = ServerNotificationMap;
type V1_NotificationMethodParams = NotificationMethodParams;
type V1_AhpError = AhpError;
type V1_AhpErrorDetailsMap = AhpErrorDetailsMap;
type V1_AuthRequiredErrorData = AuthRequiredErrorData;
type V1_PermissionDeniedErrorData = PermissionDeniedErrorData;
type V1_UnsupportedProtocolVersionErrorData = UnsupportedProtocolVersionErrorData;

// ─── Compatibility Assertions ────────────────────────────────────────────────

// These will fail at compile time if the living types diverge from v1 in a
// backward-incompatible way.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootState = AssertCompatible<V1_RootState, RootState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootConfigState = AssertCompatible<V1_RootConfigState, RootConfigState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStringOrMarkdown = AssertCompatible<V1_StringOrMarkdown, StringOrMarkdown>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAgentInfo = AssertCompatible<V1_AgentInfo, AgentInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionModelInfo = AssertCompatible<V1_SessionModelInfo, SessionModelInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckModelSelection = AssertCompatible<V1_ModelSelection, ModelSelection>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionState = AssertCompatible<V1_SessionState, SessionState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummary = AssertCompatible<V1_SessionSummary, SessionSummary>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigState = AssertCompatible<V1_SessionConfigState, SessionConfigState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProjectInfo = AssertCompatible<V1_ProjectInfo, ProjectInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTurn = AssertCompatible<V1_Turn, Turn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveTurn = AssertCompatible<V1_ActiveTurn, ActiveTurn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUserMessage = AssertCompatible<V1_UserMessage, UserMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageAttachment = AssertCompatible<V1_MessageAttachment, MessageAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageAttachmentBase = AssertCompatible<V1_MessageAttachmentBase, MessageAttachmentBase>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTextPosition = AssertCompatible<V1_TextPosition, TextPosition>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTextRange = AssertCompatible<V1_TextRange, TextRange>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTextSelection = AssertCompatible<V1_TextSelection, TextSelection>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSimpleMessageAttachment = AssertCompatible<V1_SimpleMessageAttachment, SimpleMessageAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageEmbeddedResourceAttachment = AssertCompatible<V1_MessageEmbeddedResourceAttachment, MessageEmbeddedResourceAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageResourceAttachment = AssertCompatible<V1_MessageResourceAttachment, MessageResourceAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMarkdownResponsePart = AssertCompatible<V1_MarkdownResponsePart, MarkdownResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckContentRef = AssertCompatible<V1_ContentRef, ContentRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResponsePart = AssertCompatible<V1_ToolCallResponsePart, ToolCallResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReasoningResponsePart = AssertCompatible<V1_ReasoningResponsePart, ReasoningResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSystemNotificationResponsePart = AssertCompatible<V1_SystemNotificationResponsePart, SystemNotificationResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResult = AssertCompatible<V1_ToolCallResult, ToolCallResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallStreamingState = AssertCompatible<V1_ToolCallStreamingState, ToolCallStreamingState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingConfirmationState = AssertCompatible<V1_ToolCallPendingConfirmationState, ToolCallPendingConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallRunningState = AssertCompatible<V1_ToolCallRunningState, ToolCallRunningState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingResultConfirmationState = AssertCompatible<V1_ToolCallPendingResultConfirmationState, ToolCallPendingResultConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCompletedState = AssertCompatible<V1_ToolCallCompletedState, ToolCallCompletedState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCancelledState = AssertCompatible<V1_ToolCallCancelledState, ToolCallCancelledState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallState = AssertCompatible<V1_ToolCallState, ToolCallState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUsageInfo = AssertCompatible<V1_UsageInfo, UsageInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckErrorInfo = AssertCompatible<V1_ErrorInfo, ErrorInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSnapshot = AssertCompatible<V1_Snapshot, Snapshot>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStateAction = AssertCompatible<V1_StateAction, StateAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionEnvelope = AssertCompatible<V1_ActionEnvelope, ActionEnvelope>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionOrigin = AssertCompatible<V1_ActionOrigin, ActionOrigin>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveSessionsChangedAction = AssertCompatible<V1_RootActiveSessionsChangedAction, RootActiveSessionsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallApprovedAction = AssertCompatible<V1_SessionToolCallApprovedAction, SessionToolCallApprovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallDeniedAction = AssertCompatible<V1_SessionToolCallDeniedAction, SessionToolCallDeniedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionActiveClient = AssertCompatible<V1_SessionActiveClient, SessionActiveClient>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolDefinition = AssertCompatible<V1_ToolDefinition, ToolDefinition>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolAnnotations = AssertCompatible<V1_ToolAnnotations, ToolAnnotations>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTextContent = AssertCompatible<V1_ToolResultTextContent, ToolResultTextContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultEmbeddedResourceContent = AssertCompatible<V1_ToolResultEmbeddedResourceContent, ToolResultEmbeddedResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultResourceContent = AssertCompatible<V1_ToolResultResourceContent, ToolResultResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckFileEdit = AssertCompatible<V1_FileEdit, FileEdit>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultFileEditContent = AssertCompatible<V1_ToolResultFileEditContent, ToolResultFileEditContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTerminalContent = AssertCompatible<V1_ToolResultTerminalContent, ToolResultTerminalContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultSubagentContent = AssertCompatible<V1_ToolResultSubagentContent, ToolResultSubagentContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerToolsChangedAction = AssertCompatible<V1_SessionServerToolsChangedAction, SessionServerToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientChangedAction = AssertCompatible<V1_SessionActiveClientChangedAction, SessionActiveClientChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientToolsChangedAction = AssertCompatible<V1_SessionActiveClientToolsChangedAction, SessionActiveClientToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessage = AssertCompatible<V1_PendingMessage, PendingMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswer = AssertCompatible<V1_SessionInputAnswer, SessionInputAnswer>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerValue = AssertCompatible<V1_SessionInputAnswerValue, SessionInputAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextAnswerValue = AssertCompatible<V1_SessionInputTextAnswerValue, SessionInputTextAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberAnswerValue = AssertCompatible<V1_SessionInputNumberAnswerValue, SessionInputNumberAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanAnswerValue = AssertCompatible<V1_SessionInputBooleanAnswerValue, SessionInputBooleanAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedAnswerValue = AssertCompatible<V1_SessionInputSelectedAnswerValue, SessionInputSelectedAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedManyAnswerValue = AssertCompatible<V1_SessionInputSelectedManyAnswerValue, SessionInputSelectedManyAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswered = AssertCompatible<V1_SessionInputAnswered, SessionInputAnswered>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSkipped = AssertCompatible<V1_SessionInputSkipped, SessionInputSkipped>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputOption = AssertCompatible<V1_SessionInputOption, SessionInputOption>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputQuestion = AssertCompatible<V1_SessionInputQuestion, SessionInputQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextQuestion = AssertCompatible<V1_SessionInputTextQuestion, SessionInputTextQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberQuestion = AssertCompatible<V1_SessionInputNumberQuestion, SessionInputNumberQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanQuestion = AssertCompatible<V1_SessionInputBooleanQuestion, SessionInputBooleanQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSingleSelectQuestion = AssertCompatible<V1_SessionInputSingleSelectQuestion, SessionInputSingleSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputMultiSelectQuestion = AssertCompatible<V1_SessionInputMultiSelectQuestion, SessionInputMultiSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequest = AssertCompatible<V1_SessionInputRequest, SessionInputRequest>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageSetAction = AssertCompatible<V1_SessionPendingMessageSetAction, SessionPendingMessageSetAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageRemovedAction = AssertCompatible<V1_SessionPendingMessageRemovedAction, SessionPendingMessageRemovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckQueuedMessagesReorderedAction = AssertCompatible<V1_SessionQueuedMessagesReorderedAction, SessionQueuedMessagesReorderedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequestedAction = AssertCompatible<V1_SessionInputRequestedAction, SessionInputRequestedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerChangedAction = AssertCompatible<V1_SessionInputAnswerChangedAction, SessionInputAnswerChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputCompletedAction = AssertCompatible<V1_SessionInputCompletedAction, SessionInputCompletedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIcon = AssertCompatible<V1_con, Icon>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationRef = AssertCompatible<V1_CustomizationRef, CustomizationRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionCustomization = AssertCompatible<V1_SessionCustomization, SessionCustomization>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationsChangedAction = AssertCompatible<V1_SessionCustomizationsChangedAction, SessionCustomizationsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationToggledAction = AssertCompatible<V1_SessionCustomizationToggledAction, SessionCustomizationToggledAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationUpdatedAction = AssertCompatible<V1_SessionCustomizationUpdatedAction, SessionCustomizationUpdatedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTruncatedAction = AssertCompatible<V1_SessionTruncatedAction, SessionTruncatedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsReadChangedAction = AssertCompatible<V1_SessionIsReadChangedAction, SessionIsReadChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsArchivedChangedAction = AssertCompatible<V1_SessionIsArchivedChangedAction, SessionIsArchivedChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActivityChangedAction = AssertCompatible<V1_SessionActivityChangedAction, SessionActivityChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckDiffsChangedAction = AssertCompatible<V1_SessionDiffsChangedAction, SessionDiffsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigChangedAction = AssertCompatible<V1_SessionConfigChangedAction, SessionConfigChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallContentChangedAction = AssertCompatible<V1_SessionToolCallContentChangedAction, SessionToolCallContentChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionForkSource = AssertCompatible<V1_SessionForkSource, SessionForkSource>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtocolNotification = AssertCompatible<V1_ProtocolNotification, ProtocolNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummaryChangedNotification = AssertCompatible<V1_SessionSummaryChangedNotification, SessionSummaryChangedNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckListSessionsResult = AssertCompatible<V1_ListSessionsResult, ListSessionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateParams = AssertCompatible<V1_AuthenticateParams, AuthenticateParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateResult = AssertCompatible<V1_AuthenticateResult, AuthenticateResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteParams = AssertCompatible<V1_ResourceWriteParams, ResourceWriteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteResult = AssertCompatible<V1_ResourceWriteResult, ResourceWriteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadParams = AssertCompatible<V1_ResourceReadParams, ResourceReadParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadResult = AssertCompatible<V1_ResourceReadResult, ResourceReadResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListParams = AssertCompatible<V1_ResourceListParams, ResourceListParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListResult = AssertCompatible<V1_ResourceListResult, ResourceListResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyParams = AssertCompatible<V1_ResourceCopyParams, ResourceCopyParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyResult = AssertCompatible<V1_ResourceCopyResult, ResourceCopyResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteParams = AssertCompatible<V1_ResourceDeleteParams, ResourceDeleteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteResult = AssertCompatible<V1_ResourceDeleteResult, ResourceDeleteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveParams = AssertCompatible<V1_ResourceMoveParams, ResourceMoveParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveResult = AssertCompatible<V1_ResourceMoveResult, ResourceMoveResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceRequestParams = AssertCompatible<V1_ResourceRequestParams, ResourceRequestParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceRequestResult = AssertCompatible<V1_ResourceRequestResult, ResourceRequestResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtectedResourceMetadata = AssertCompatible<V1_ProtectedResourceMetadata, ProtectedResourceMetadata>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthRequiredNotification = AssertCompatible<V1_AuthRequiredNotification, AuthRequiredNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCommandMap = AssertCompatible<V1_CommandMap, CommandMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerCommandMap = AssertCompatible<V1_ServerCommandMap, ServerCommandMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckClientNotificationMap = AssertCompatible<V1_ClientNotificationMap, ClientNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerNotificationMap = AssertCompatible<V1_ServerNotificationMap, ServerNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckNotificationMethodParams = AssertCompatible<V1_NotificationMethodParams, NotificationMethodParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAhpError = AssertCompatible<V1_AhpError, AhpError>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAhpErrorDetailsMap = AssertCompatible<V1_AhpErrorDetailsMap, AhpErrorDetailsMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthRequiredErrorData = AssertCompatible<V1_AuthRequiredErrorData, AuthRequiredErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPermissionDeniedErrorData = AssertCompatible<V1_PermissionDeniedErrorData, PermissionDeniedErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUnsupportedProtocolVersionErrorData = AssertCompatible<V1_UnsupportedProtocolVersionErrorData, UnsupportedProtocolVersionErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalsChangedAction = AssertCompatible<V1_RootTerminalsChangedAction, RootTerminalsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootConfigChangedAction = AssertCompatible<V1_RootConfigChangedAction, RootConfigChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalDataAction = AssertCompatible<V1_TerminalDataAction, TerminalDataAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInputAction = AssertCompatible<V1_TerminalInputAction, TerminalInputAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalResizedAction = AssertCompatible<V1_TerminalResizedAction, TerminalResizedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaimedAction = AssertCompatible<V1_TerminalClaimedAction, TerminalClaimedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalTitleChangedAction = AssertCompatible<V1_TerminalTitleChangedAction, TerminalTitleChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCwdChangedAction = AssertCompatible<V1_TerminalCwdChangedAction, TerminalCwdChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalExitedAction = AssertCompatible<V1_TerminalExitedAction, TerminalExitedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClearedAction = AssertCompatible<V1_TerminalClearedAction, TerminalClearedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandDetectionAvailableAction = AssertCompatible<V1_TerminalCommandDetectionAvailableAction, TerminalCommandDetectionAvailableAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandExecutedAction = AssertCompatible<V1_TerminalCommandExecutedAction, TerminalCommandExecutedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandFinishedAction = AssertCompatible<V1_TerminalCommandFinishedAction, TerminalCommandFinishedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInfo = AssertCompatible<V1_TerminalInfo, TerminalInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClientClaim = AssertCompatible<V1_TerminalClientClaim, TerminalClientClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalSessionClaim = AssertCompatible<V1_TerminalSessionClaim, TerminalSessionClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaim = AssertCompatible<V1_TerminalClaim, TerminalClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalState = AssertCompatible<V1_TerminalState, TerminalState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalContentPart = AssertCompatible<V1_TerminalContentPart, TerminalContentPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalUnclassifiedPart = AssertCompatible<V1_TerminalUnclassifiedPart, TerminalUnclassifiedPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandPart = AssertCompatible<V1_TerminalCommandPart, TerminalCommandPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCreateTerminalParams = AssertCompatible<V1_CreateTerminalParams, CreateTerminalParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCreateSessionParams = AssertCompatible<V1_CreateSessionParams, CreateSessionParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckDisposeTerminalParams = AssertCompatible<V1_DisposeTerminalParams, DisposeTerminalParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResolveSessionConfigParams = AssertCompatible<V1_ResolveSessionConfigParams, ResolveSessionConfigParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResolveSessionConfigResult = AssertCompatible<V1_ResolveSessionConfigResult, ResolveSessionConfigResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigPropertySchema = AssertCompatible<V1_ConfigPropertySchema, ConfigPropertySchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigSchema = AssertCompatible<V1_ConfigSchema, ConfigSchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigPropertySchema = AssertCompatible<V1_SessionConfigPropertySchema, SessionConfigPropertySchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigSchema = AssertCompatible<V1_SessionConfigSchema, SessionConfigSchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigCompletionsParams = AssertCompatible<V1_SessionConfigCompletionsParams, SessionConfigCompletionsParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigCompletionsResult = AssertCompatible<V1_SessionConfigCompletionsResult, SessionConfigCompletionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigValueItem = AssertCompatible<V1_SessionConfigValueItem, SessionConfigValueItem>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCompletionsParams = AssertCompatible<V1_CompletionsParams, CompletionsParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCompletionItem = AssertCompatible<V1_CompletionItem, CompletionItem>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCompletionsResult = AssertCompatible<V1_CompletionsResult, CompletionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfirmationOption = AssertCompatible<V1_ConfirmationOption, ConfirmationOption>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfirmationOptionKind = AssertCompatible<V1_ConfirmationOptionKind, ConfirmationOptionKind>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInitializeParams = AssertCompatible<V1_InitializeParams, InitializeParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInitializeResult = AssertCompatible<V1_InitializeResult, InitializeResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectParams = AssertCompatible<V1_ReconnectParams, ReconnectParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectResult = AssertCompatible<V1_ReconnectResult, ReconnectResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectReplayResult = AssertCompatible<V1_ReconnectReplayResult, ReconnectReplayResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectSnapshotResult = AssertCompatible<V1_ReconnectSnapshotResult, ReconnectSnapshotResult>;
