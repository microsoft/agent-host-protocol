// Generated from types/*.ts — do not edit

package com.microsoft.agenthostprotocol.generated

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull

// ─── ActionType ─────────────────────────────────────────────────────────────

/**
 * Discriminant values for all state actions.
 */
@Serializable
enum class ActionType {
    @SerialName("root/agentsChanged")
    ROOT_AGENTS_CHANGED,
    @SerialName("root/activeSessionsChanged")
    ROOT_ACTIVE_SESSIONS_CHANGED,
    @SerialName("session/ready")
    SESSION_READY,
    @SerialName("session/creationFailed")
    SESSION_CREATION_FAILED,
    @SerialName("session/chatAdded")
    SESSION_CHAT_ADDED,
    @SerialName("session/chatRemoved")
    SESSION_CHAT_REMOVED,
    @SerialName("session/chatUpdated")
    SESSION_CHAT_UPDATED,
    @SerialName("session/defaultChatChanged")
    SESSION_DEFAULT_CHAT_CHANGED,
    @SerialName("chat/turnStarted")
    CHAT_TURN_STARTED,
    @SerialName("chat/delta")
    CHAT_DELTA,
    @SerialName("chat/responsePart")
    CHAT_RESPONSE_PART,
    @SerialName("chat/toolCallStart")
    CHAT_TOOL_CALL_START,
    @SerialName("chat/toolCallDelta")
    CHAT_TOOL_CALL_DELTA,
    @SerialName("chat/toolCallReady")
    CHAT_TOOL_CALL_READY,
    @SerialName("chat/toolCallConfirmed")
    CHAT_TOOL_CALL_CONFIRMED,
    @SerialName("chat/toolCallComplete")
    CHAT_TOOL_CALL_COMPLETE,
    @SerialName("chat/toolCallResultConfirmed")
    CHAT_TOOL_CALL_RESULT_CONFIRMED,
    @SerialName("chat/toolCallContentChanged")
    CHAT_TOOL_CALL_CONTENT_CHANGED,
    @SerialName("chat/turnComplete")
    CHAT_TURN_COMPLETE,
    @SerialName("chat/turnCancelled")
    CHAT_TURN_CANCELLED,
    @SerialName("chat/error")
    CHAT_ERROR,
    @SerialName("chat/activityChanged")
    CHAT_ACTIVITY_CHANGED,
    @SerialName("session/titleChanged")
    SESSION_TITLE_CHANGED,
    @SerialName("chat/usage")
    CHAT_USAGE,
    @SerialName("chat/reasoning")
    CHAT_REASONING,
    @SerialName("session/serverToolsChanged")
    SESSION_SERVER_TOOLS_CHANGED,
    @SerialName("session/activeClientSet")
    SESSION_ACTIVE_CLIENT_SET,
    @SerialName("session/activeClientRemoved")
    SESSION_ACTIVE_CLIENT_REMOVED,
    @SerialName("session/inputNeededSet")
    SESSION_INPUT_NEEDED_SET,
    @SerialName("session/inputNeededRemoved")
    SESSION_INPUT_NEEDED_REMOVED,
    @SerialName("chat/pendingMessageSet")
    CHAT_PENDING_MESSAGE_SET,
    @SerialName("chat/pendingMessageRemoved")
    CHAT_PENDING_MESSAGE_REMOVED,
    @SerialName("chat/queuedMessagesReordered")
    CHAT_QUEUED_MESSAGES_REORDERED,
    @SerialName("chat/draftChanged")
    CHAT_DRAFT_CHANGED,
    @SerialName("chat/inputRequested")
    CHAT_INPUT_REQUESTED,
    @SerialName("chat/inputAnswerChanged")
    CHAT_INPUT_ANSWER_CHANGED,
    @SerialName("chat/inputCompleted")
    CHAT_INPUT_COMPLETED,
    @SerialName("session/customizationsChanged")
    SESSION_CUSTOMIZATIONS_CHANGED,
    @SerialName("session/customizationToggled")
    SESSION_CUSTOMIZATION_TOGGLED,
    @SerialName("session/customizationUpdated")
    SESSION_CUSTOMIZATION_UPDATED,
    @SerialName("session/customizationRemoved")
    SESSION_CUSTOMIZATION_REMOVED,
    @SerialName("session/mcpServerStateChanged")
    SESSION_MCP_SERVER_STATE_CHANGED,
    @SerialName("chat/truncated")
    CHAT_TRUNCATED,
    @SerialName("chat/turnsLoaded")
    CHAT_TURNS_LOADED,
    @SerialName("session/isReadChanged")
    SESSION_IS_READ_CHANGED,
    @SerialName("session/isArchivedChanged")
    SESSION_IS_ARCHIVED_CHANGED,
    @SerialName("session/activityChanged")
    SESSION_ACTIVITY_CHANGED,
    @SerialName("session/changesetsChanged")
    SESSION_CHANGESETS_CHANGED,
    @SerialName("session/configChanged")
    SESSION_CONFIG_CHANGED,
    @SerialName("session/metaChanged")
    SESSION_META_CHANGED,
    @SerialName("changeset/statusChanged")
    CHANGESET_STATUS_CHANGED,
    @SerialName("changeset/fileSet")
    CHANGESET_FILE_SET,
    @SerialName("changeset/fileRemoved")
    CHANGESET_FILE_REMOVED,
    @SerialName("changeset/filesReviewedChanged")
    CHANGESET_FILES_REVIEWED_CHANGED,
    @SerialName("changeset/contentChanged")
    CHANGESET_CONTENT_CHANGED,
    @SerialName("changeset/operationsChanged")
    CHANGESET_OPERATIONS_CHANGED,
    @SerialName("changeset/operationStatusChanged")
    CHANGESET_OPERATION_STATUS_CHANGED,
    @SerialName("changeset/cleared")
    CHANGESET_CLEARED,
    @SerialName("annotations/set")
    ANNOTATIONS_SET,
    @SerialName("annotations/updated")
    ANNOTATIONS_UPDATED,
    @SerialName("annotations/removed")
    ANNOTATIONS_REMOVED,
    @SerialName("annotations/entrySet")
    ANNOTATIONS_ENTRY_SET,
    @SerialName("annotations/entryRemoved")
    ANNOTATIONS_ENTRY_REMOVED,
    @SerialName("root/terminalsChanged")
    ROOT_TERMINALS_CHANGED,
    @SerialName("root/configChanged")
    ROOT_CONFIG_CHANGED,
    @SerialName("terminal/data")
    TERMINAL_DATA,
    @SerialName("terminal/input")
    TERMINAL_INPUT,
    @SerialName("terminal/resized")
    TERMINAL_RESIZED,
    @SerialName("terminal/claimed")
    TERMINAL_CLAIMED,
    @SerialName("terminal/titleChanged")
    TERMINAL_TITLE_CHANGED,
    @SerialName("terminal/cwdChanged")
    TERMINAL_CWD_CHANGED,
    @SerialName("terminal/exited")
    TERMINAL_EXITED,
    @SerialName("terminal/cleared")
    TERMINAL_CLEARED,
    @SerialName("terminal/commandDetectionAvailable")
    TERMINAL_COMMAND_DETECTION_AVAILABLE,
    @SerialName("terminal/commandExecuted")
    TERMINAL_COMMAND_EXECUTED,
    @SerialName("terminal/commandFinished")
    TERMINAL_COMMAND_FINISHED,
    @SerialName("resourceWatch/changed")
    RESOURCE_WATCH_CHANGED
}

// ─── Action Infrastructure ──────────────────────────────────────────────────

@Serializable
data class ActionOrigin(
    val clientId: String,
    val clientSeq: Long
)

@Serializable
data class ActionEnvelope(
    /**
     * Channel URI this action belongs to.
     */
    val channel: String,
    val action: StateAction,
    val serverSeq: Long,
    val origin: ActionOrigin? = null,
    val rejectionReason: String? = null
)

// ─── Action Types ───────────────────────────────────────────────────────────

@Serializable
data class RootAgentsChangedAction(
    val type: ActionType,
    /**
     * Updated agent list
     */
    val agents: List<AgentInfo>
)

@Serializable
data class RootActiveSessionsChangedAction(
    val type: ActionType,
    /**
     * Current count of active sessions
     */
    val activeSessions: Long
)

@Serializable
data class SessionReadyAction(
    val type: ActionType
)

@Serializable
data class SessionCreationFailedAction(
    val type: ActionType,
    /**
     * Error details
     */
    val error: ErrorInfo
)

@Serializable
data class SessionChatAddedAction(
    val type: ActionType,
    /**
     * The full summary of the newly added (or upserted) chat.
     */
    val summary: ChatSummary
)

@Serializable
data class SessionChatRemovedAction(
    val type: ActionType,
    /**
     * The URI of the chat to remove.
     */
    val chat: String
)

@Serializable
data class SessionChatUpdatedAction(
    val type: ActionType,
    /**
     * The URI of the chat whose summary changed.
     */
    val chat: String,
    /**
     * Mutable summary fields that changed; omitted fields are unchanged.
     *
     * Identity fields (`resource`) never change and MUST be omitted by
     * senders; receivers SHOULD ignore them if present.
     */
    val changes: PartialChatSummary
)

@Serializable
data class SessionDefaultChatChangedAction(
    val type: ActionType,
    /**
     * New default chat URI, or `undefined` to clear the hint.
     */
    val defaultChat: String? = null
)

@Serializable
data class ChatTurnStartedAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * The new message
     */
    val message: Message,
    /**
     * If this turn was auto-started from a queued message, the ID of that message
     */
    val queuedMessageId: String? = null,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatDeltaAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Identifier of the response part to append to
     */
    val partId: String,
    /**
     * Text chunk
     */
    val content: String,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatResponsePartAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Response part (markdown or content ref)
     */
    val part: ResponsePart,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatToolCallStartAction(
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Tool call identifier
     */
    val toolCallId: String,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val type: ActionType,
    /**
     * Internal tool name (for debugging/logging)
     */
    val toolName: String,
    /**
     * Human-readable tool name
     */
    val displayName: String,
    /**
     * Human-readable description of what the tool invocation intends to do
     */
    val intention: String? = null,
    /**
     * Reference to the contributor of the tool being called. Absent for
     * server-side tools that are not contributed by a client or MCP server.
     */
    val contributor: ToolCallContributor? = null
)

@Serializable
data class ChatToolCallDeltaAction(
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Tool call identifier
     */
    val toolCallId: String,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val type: ActionType,
    /**
     * Partial parameter content to append
     */
    val content: String,
    /**
     * Updated progress message
     */
    val invocationMessage: StringOrMarkdown? = null
)

@Serializable
data class ChatToolCallReadyAction(
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Tool call identifier
     */
    val toolCallId: String,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val type: ActionType,
    /**
     * Message describing what the tool will do or what confirmation is needed
     */
    val invocationMessage: StringOrMarkdown,
    /**
     * Raw tool input
     */
    val toolInput: String? = null,
    /**
     * Short title for the confirmation prompt (e.g. `"Run in terminal"`, `"Write file"`)
     */
    val confirmationTitle: StringOrMarkdown? = null,
    /**
     * File edits that this tool call will perform, for preview before confirmation
     */
    val edits: JsonElement? = null,
    /**
     * Whether the agent host allows the client to edit the tool's input parameters before confirming
     */
    val editable: Boolean? = null,
    /**
     * If set, the tool was auto-confirmed and transitions directly to `running`
     */
    val confirmed: ToolCallConfirmationReason? = null,
    /**
     * Options the server offers for this confirmation. When present, the client
     * SHOULD render these instead of a plain approve/deny UI. Each option
     * belongs to a {@link ConfirmationOptionGroup} so the client can still
     * categorise the choices.
     */
    val options: List<ConfirmationOption>? = null
)

/**
 * Client approves or denies a pending tool call (merged approved + denied variants).
 */
@Serializable
data class ChatToolCallConfirmedAction(
    /** Action type discriminant */
    val type: ActionType = ActionType.CHAT_TOOL_CALL_CONFIRMED,
    /** Turn identifier */
    val turnId: String,
    /** Tool call identifier */
    val toolCallId: String,
    /** Whether the tool call was approved */
    val approved: Boolean,
    /** How the tool was confirmed (present when approved) */
    val confirmed: ToolCallConfirmationReason? = null,
    /** Edited tool input parameters, if the client modified them before confirming */
    val editedToolInput: String? = null,
    /** Why the tool was cancelled (present when denied) */
    val reason: ToolCallCancellationReason? = null,
    /** What the user suggested instead (present when denied) */
    val userSuggestion: Message? = null,
    /** Explanation for the denial */
    val reasonMessage: StringOrMarkdown? = null,
    /** ID of the selected confirmation option, if the server provided options */
    val selectedOptionId: String? = null,
    /** Additional provider-specific metadata */
    @SerialName("_meta") val meta: Map<String, JsonElement>? = null,
)

@Serializable
data class ChatToolCallCompleteAction(
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Tool call identifier
     */
    val toolCallId: String,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val type: ActionType,
    /**
     * Execution result
     */
    val result: ToolCallResult,
    /**
     * If true, the result requires client approval before finalizing
     */
    val requiresResultConfirmation: Boolean? = null
)

@Serializable
data class ChatToolCallResultConfirmedAction(
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Tool call identifier
     */
    val toolCallId: String,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val type: ActionType,
    /**
     * Whether the result was approved
     */
    val approved: Boolean
)

@Serializable
data class ChatToolCallContentChangedAction(
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Tool call identifier
     */
    val toolCallId: String,
    /**
     * Additional provider-specific metadata for this tool call.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI.
     * For example, a `ptyTerminal` key with `{ input: string; output: string }`
     * indicates the tool operated on a terminal (both `input` and `output` may
     * contain escape sequences).
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null,
    val type: ActionType,
    /**
     * The current partial content for the running tool call
     */
    val content: List<ToolResultContent>
)

@Serializable
data class ChatTurnCompleteAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatTurnCancelledAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatErrorAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Error details
     */
    val error: ErrorInfo,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatActivityChangedAction(
    val type: ActionType,
    /**
     * Human-readable description of current activity; omit or set `undefined` to clear
     */
    val activity: String? = null
)

@Serializable
data class SessionTitleChangedAction(
    val type: ActionType,
    /**
     * New title
     */
    val title: String
)

@Serializable
data class ChatUsageAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Token usage data
     */
    val usage: UsageInfo,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChatReasoningAction(
    val type: ActionType,
    /**
     * Turn identifier
     */
    val turnId: String,
    /**
     * Identifier of the reasoning response part to append to
     */
    val partId: String,
    /**
     * Reasoning text chunk
     */
    val content: String,
    /**
     * Additional provider-specific metadata for this action.
     *
     * Clients MAY look for well-known keys here to provide enhanced UI, and
     * agent hosts MAY use it to carry per-event context that does not fit any
     * other field — for example, attributing the event to a specific agent
     * (such as a sub-agent acting within the turn). Mirrors the MCP `_meta`
     * convention.
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class SessionIsReadChangedAction(
    val type: ActionType,
    /**
     * Whether the session has been read
     */
    val isRead: Boolean
)

@Serializable
data class SessionIsArchivedChangedAction(
    val type: ActionType,
    /**
     * Whether the session is archived
     */
    val isArchived: Boolean
)

@Serializable
data class SessionActivityChangedAction(
    val type: ActionType,
    /**
     * Human-readable description of current activity, or `undefined` to clear
     */
    val activity: String? = null
)

@Serializable
data class SessionChangesetsChangedAction(
    val type: ActionType,
    /**
     * New catalogue, or `undefined` to clear it
     */
    val changesets: List<Changeset>? = null
)

@Serializable
data class SessionServerToolsChangedAction(
    val type: ActionType,
    /**
     * Updated server tools list (full replacement)
     */
    val tools: List<ToolDefinition>
)

@Serializable
data class SessionActiveClientSetAction(
    val type: ActionType,
    /**
     * The active client to add or update, matched by `clientId`.
     */
    val activeClient: SessionActiveClient
)

@Serializable
data class SessionActiveClientRemovedAction(
    val type: ActionType,
    /**
     * The `clientId` of the active client to remove.
     */
    val clientId: String
)

@Serializable
data class SessionInputNeededSetAction(
    val type: ActionType,
    /**
     * The input request to add or update, matched by `id`.
     */
    val request: SessionInputRequest
)

@Serializable
data class SessionInputNeededRemovedAction(
    val type: ActionType,
    /**
     * The `id` of the input request to remove.
     */
    val id: String
)

@Serializable
data class ChatPendingMessageSetAction(
    val type: ActionType,
    /**
     * Whether this is a steering or queued message
     */
    val kind: PendingMessageKind,
    /**
     * Unique identifier for this pending message
     */
    val id: String,
    /**
     * The message content
     */
    val message: Message
)

@Serializable
data class ChatPendingMessageRemovedAction(
    val type: ActionType,
    /**
     * Whether this is a steering or queued message
     */
    val kind: PendingMessageKind,
    /**
     * Identifier of the pending message to remove
     */
    val id: String
)

@Serializable
data class ChatQueuedMessagesReorderedAction(
    val type: ActionType,
    /**
     * Queued message IDs in the desired order
     */
    val order: List<String>
)

@Serializable
data class ChatDraftChangedAction(
    val type: ActionType,
    /**
     * New draft message, or `undefined` to clear it
     */
    val draft: Message? = null
)

@Serializable
data class ChatInputRequestedAction(
    val type: ActionType,
    /**
     * Input request to create or replace
     */
    val request: ChatInputRequest
)

@Serializable
data class ChatInputAnswerChangedAction(
    val type: ActionType,
    /**
     * Input request identifier
     */
    val requestId: String,
    /**
     * Question identifier within the input request
     */
    val questionId: String,
    /**
     * Updated answer, or `undefined` to clear an answer draft
     */
    val answer: ChatInputAnswer? = null
)

@Serializable
data class ChatInputCompletedAction(
    val type: ActionType,
    /**
     * Input request identifier
     */
    val requestId: String,
    /**
     * Completion outcome
     */
    val response: ChatInputResponseKind,
    /**
     * Optional final answer replacement, keyed by question ID
     */
    val answers: Map<String, ChatInputAnswer>? = null
)

@Serializable
data class SessionCustomizationsChangedAction(
    val type: ActionType,
    /**
     * Updated customization list (full replacement).
     */
    val customizations: List<Customization>
)

@Serializable
data class SessionCustomizationToggledAction(
    val type: ActionType,
    /**
     * The id of the container or child to toggle.
     */
    val id: String,
    /**
     * Whether to enable or disable the targeted customization.
     */
    val enabled: Boolean
)

@Serializable
data class SessionCustomizationUpdatedAction(
    val type: ActionType,
    /**
     * The customization to upsert (matched by `customization.id`).
     */
    val customization: Customization
)

@Serializable
data class SessionCustomizationRemovedAction(
    val type: ActionType,
    /**
     * The id of the customization to remove.
     */
    val id: String
)

@Serializable
data class SessionMcpServerStateChangedAction(
    val type: ActionType,
    /**
     * The id of the {@link McpServerCustomization} to update.
     */
    val id: String,
    /**
     * The new lifecycle state.
     */
    val state: McpServerState,
    /**
     * Updated `mcp://` side-channel URI. Full-replacement: omit to clear
     * an existing channel (typical when leaving
     * {@link McpServerStatus.Ready | `Ready`}).
     */
    val channel: String? = null
)

@Serializable
data class ChatTruncatedAction(
    val type: ActionType,
    /**
     * Keep turns up to and including this turn. Omit to clear all turns.
     */
    val turnId: String? = null
)

@Serializable
data class ChatTurnsLoadedAction(
    val type: ActionType,
    /**
     * Older completed turns loaded into the state, ordered oldest-first.
     */
    val turns: List<Turn>,
    /**
     * Opaque cursor for loading the next older page, if one remains.
     */
    val turnsNextCursor: String? = null
)

@Serializable
data class SessionConfigChangedAction(
    val type: ActionType,
    /**
     * Updated config values
     */
    val config: Map<String, JsonElement>,
    /**
     * When `true`, replaces all config values instead of merging
     */
    val replace: Boolean? = null
)

@Serializable
data class SessionMetaChangedAction(
    val type: ActionType,
    /**
     * New `_meta` payload, or `undefined` to clear it
     */
    @SerialName("_meta")
    val meta: Map<String, JsonElement>? = null
)

@Serializable
data class ChangesetStatusChangedAction(
    val type: ActionType,
    /**
     * New computation lifecycle status.
     */
    val status: ChangesetStatus,
    /**
     * Cause when `status === ChangesetStatus.Error`; otherwise omitted.
     */
    val error: ErrorInfo? = null
)

@Serializable
data class ChangesetFileSetAction(
    val type: ActionType,
    /**
     * The new or replacement file entry.
     */
    val file: ChangesetFile
)

@Serializable
data class ChangesetFileRemovedAction(
    val type: ActionType,
    /**
     * The {@link ChangesetFile.id} of the file to remove.
     */
    val fileId: String
)

@Serializable
data class ChangesetFilesReviewedChangedAction(
    val type: ActionType,
    /**
     * The {@link ChangesetFile.id}s whose reviewed state changed.
     */
    val fileIds: List<String>,
    /**
     * The new reviewed state to apply to each listed file.
     */
    val reviewed: Boolean
)

@Serializable
data class ChangesetContentChangedAction(
    val type: ActionType,
    /**
     * Full replacement file list.
     */
    val files: List<ChangesetFile>,
    /**
     * Full replacement operation list. Omit when operations are unchanged.
     */
    val operations: List<ChangesetOperation>? = null,
    /**
     * Error information, if the changeset content change failed.
     */
    val error: ErrorInfo? = null
)

@Serializable
data class ChangesetOperationsChangedAction(
    val type: ActionType,
    /**
     * Updated operation list. Pass `undefined` to clear all operations.
     */
    val operations: List<ChangesetOperation>? = null
)

@Serializable
data class ChangesetOperationStatusChangedAction(
    val type: ActionType,
    /**
     * The {@link ChangesetOperation.id} whose status changed.
     */
    val operationId: String,
    /**
     * New execution status.
     */
    val status: ChangesetOperationStatus,
    /**
     * Cause when `status === ChangesetOperationStatus.Error`; otherwise omitted.
     */
    val error: ErrorInfo? = null
)

@Serializable
data class ChangesetClearedAction(
    val type: ActionType
)

@Serializable
data class AnnotationsSetAction(
    val type: ActionType,
    /**
     * The new or replacement annotation. MUST contain at least one entry.
     */
    val annotation: Annotation
)

@Serializable
data class AnnotationsUpdatedAction(
    val type: ActionType,
    /**
     * The {@link Annotation.id} of the annotation to update.
     */
    val annotationId: String,
    /**
     * Re-anchors the annotation to the file versions this turn produced.
     * Matches a {@link Turn.id} on the owning session. Omit to leave the
     * current {@link Annotation.turnId} unchanged.
     */
    val turnId: String? = null,
    /**
     * Re-anchors the annotation to this file. Omit to leave the current
     * {@link Annotation.resource} unchanged.
     */
    val resource: String? = null,
    /**
     * Narrows the annotation to this range within {@link resource}. Omit to
     * leave the current {@link Annotation.range} unchanged; this action cannot
     * clear an existing range — dispatch {@link AnnotationsSetAction} to
     * re-anchor to the whole file.
     */
    val range: TextRange? = null,
    /**
     * Marks the annotation resolved (`true`) or re-opens it (`false`). Omit to
     * leave the current {@link Annotation.resolved} state unchanged.
     */
    val resolved: Boolean? = null
)

@Serializable
data class AnnotationsRemovedAction(
    val type: ActionType,
    /**
     * The {@link Annotation.id} of the annotation to remove.
     */
    val annotationId: String
)

@Serializable
data class AnnotationsEntrySetAction(
    val type: ActionType,
    /**
     * The {@link Annotation.id} the entry belongs to.
     */
    val annotationId: String,
    /**
     * The new or replacement entry.
     */
    val entry: AnnotationEntry
)

@Serializable
data class AnnotationsEntryRemovedAction(
    val type: ActionType,
    /**
     * The {@link Annotation.id} the entry belongs to.
     */
    val annotationId: String,
    /**
     * The {@link AnnotationEntry.id} to remove.
     */
    val entryId: String
)

@Serializable
data class RootTerminalsChangedAction(
    val type: ActionType,
    /**
     * Updated terminal list (full replacement)
     */
    val terminals: List<TerminalInfo>
)

@Serializable
data class RootConfigChangedAction(
    val type: ActionType,
    /**
     * Updated config values
     */
    val config: Map<String, JsonElement>,
    /**
     * When `true`, replaces all config values instead of merging
     */
    val replace: Boolean? = null
)

@Serializable
data class TerminalDataAction(
    val type: ActionType,
    /**
     * Output data (may contain ANSI escape sequences)
     */
    val data: String
)

@Serializable
data class TerminalInputAction(
    val type: ActionType,
    /**
     * Input data to send to the pty
     */
    val data: String
)

@Serializable
data class TerminalResizedAction(
    val type: ActionType,
    /**
     * Terminal width in columns
     */
    val cols: Long,
    /**
     * Terminal height in rows
     */
    val rows: Long
)

@Serializable
data class TerminalClaimedAction(
    val type: ActionType,
    /**
     * The new claim
     */
    val claim: TerminalClaim
)

@Serializable
data class TerminalTitleChangedAction(
    val type: ActionType,
    /**
     * New terminal title
     */
    val title: String
)

@Serializable
data class TerminalCwdChangedAction(
    val type: ActionType,
    /**
     * New working directory
     */
    val cwd: String
)

@Serializable
data class TerminalExitedAction(
    val type: ActionType,
    /**
     * Process exit code. `undefined` if the process was killed without an exit code.
     */
    val exitCode: Long? = null
)

@Serializable
data class TerminalClearedAction(
    val type: ActionType
)

@Serializable
data class TerminalCommandDetectionAvailableAction(
    val type: ActionType
)

@Serializable
data class TerminalCommandExecutedAction(
    val type: ActionType,
    /**
     * Stable identifier for this command, scoped to the terminal URI.
     * Allows correlating `commandExecuted` → `commandFinished` pairs.
     */
    val commandId: String,
    /**
     * The command line text that was submitted
     */
    val commandLine: String,
    /**
     * Unix timestamp (ms) of when the command started executing, as measured
     * on the server.
     */
    val timestamp: Long
)

@Serializable
data class TerminalCommandFinishedAction(
    val type: ActionType,
    /**
     * Matches the `commandId` from the corresponding `commandExecuted`
     */
    val commandId: String,
    /**
     * Shell exit code. `undefined` if the shell did not report one.
     */
    val exitCode: Long? = null,
    /**
     * Wall-clock duration of the command in milliseconds, as measured by the
     * shell integration script on the server side.
     */
    val durationMs: Long? = null
)

@Serializable
data class ResourceWatchChangedAction(
    val type: ActionType,
    /**
     * The set of changes in this batch, wrapped for forward compatibility.
     */
    val changes: JsonElement
)

// ─── Partial Summary Types ──────────────────────────────────────────────────

@Serializable
data class PartialChatSummary(
    /**
     * Chat URI
     */
    val resource: String? = null,
    /**
     * Chat title
     */
    val title: String? = null,
    /**
     * Current chat status (reuses SessionStatus shape)
     */
    val status: SessionStatus? = null,
    /**
     * Human-readable description of what the chat is currently doing
     */
    val activity: String? = null,
    /**
     * Last modification timestamp (ISO 8601, e.g. `"2025-03-10T18:42:03.123Z"`)
     */
    val modifiedAt: String? = null,
    /**
     * How this chat came into existence
     */
    val origin: ChatOrigin? = null,
    /**
     * How the user can interact with this chat. See {@link ChatInteractivity}.
     *
     * Supports agent-team patterns where worker chats are read-only or hidden.
     * Absence defaults to {@link ChatInteractivity.Full} for backward
     * compatibility.
     */
    val interactivity: ChatInteractivity? = null,
    /**
     * Optional per-chat working directory.
     *
     * If absent, the chat inherits
     * {@link SessionSummary.workingDirectory | the session's working directory}.
     * See {@link ChatState.workingDirectory} for usage notes.
     */
    val workingDirectory: String? = null
)

// ─── StateAction Union ──────────────────────────────────────────────────────

/**
 * Discriminated union of all state actions.
 *
 * Unknown wire types decode to [StateActionUnknown], which captures the full
 * raw JSON object (mirrors the state-channel `XUnknown` variants and Rust's
 * `Unknown(serde_json::Value)`). Reducers should treat unknown actions as
 * no-ops; the captured payload is re-emitted unchanged on encode so unknown
 * actions can round-trip across protocol versions.
 */
@Serializable(with = StateActionSerializer::class)
sealed interface StateAction

@JvmInline value class StateActionRootAgentsChanged(val value: RootAgentsChangedAction) : StateAction
@JvmInline value class StateActionRootActiveSessionsChanged(val value: RootActiveSessionsChangedAction) : StateAction
@JvmInline value class StateActionSessionReady(val value: SessionReadyAction) : StateAction
@JvmInline value class StateActionSessionCreationFailed(val value: SessionCreationFailedAction) : StateAction
@JvmInline value class StateActionSessionChatAdded(val value: SessionChatAddedAction) : StateAction
@JvmInline value class StateActionSessionChatRemoved(val value: SessionChatRemovedAction) : StateAction
@JvmInline value class StateActionSessionChatUpdated(val value: SessionChatUpdatedAction) : StateAction
@JvmInline value class StateActionSessionDefaultChatChanged(val value: SessionDefaultChatChangedAction) : StateAction
@JvmInline value class StateActionChatTurnStarted(val value: ChatTurnStartedAction) : StateAction
@JvmInline value class StateActionChatDelta(val value: ChatDeltaAction) : StateAction
@JvmInline value class StateActionChatResponsePart(val value: ChatResponsePartAction) : StateAction
@JvmInline value class StateActionChatToolCallStart(val value: ChatToolCallStartAction) : StateAction
@JvmInline value class StateActionChatToolCallDelta(val value: ChatToolCallDeltaAction) : StateAction
@JvmInline value class StateActionChatToolCallReady(val value: ChatToolCallReadyAction) : StateAction
@JvmInline value class StateActionChatToolCallConfirmed(val value: ChatToolCallConfirmedAction) : StateAction
@JvmInline value class StateActionChatToolCallComplete(val value: ChatToolCallCompleteAction) : StateAction
@JvmInline value class StateActionChatToolCallResultConfirmed(val value: ChatToolCallResultConfirmedAction) : StateAction
@JvmInline value class StateActionChatToolCallContentChanged(val value: ChatToolCallContentChangedAction) : StateAction
@JvmInline value class StateActionChatTurnComplete(val value: ChatTurnCompleteAction) : StateAction
@JvmInline value class StateActionChatTurnCancelled(val value: ChatTurnCancelledAction) : StateAction
@JvmInline value class StateActionChatError(val value: ChatErrorAction) : StateAction
@JvmInline value class StateActionChatActivityChanged(val value: ChatActivityChangedAction) : StateAction
@JvmInline value class StateActionSessionTitleChanged(val value: SessionTitleChangedAction) : StateAction
@JvmInline value class StateActionChatUsage(val value: ChatUsageAction) : StateAction
@JvmInline value class StateActionChatReasoning(val value: ChatReasoningAction) : StateAction
@JvmInline value class StateActionSessionIsReadChanged(val value: SessionIsReadChangedAction) : StateAction
@JvmInline value class StateActionSessionIsArchivedChanged(val value: SessionIsArchivedChangedAction) : StateAction
@JvmInline value class StateActionSessionActivityChanged(val value: SessionActivityChangedAction) : StateAction
@JvmInline value class StateActionSessionChangesetsChanged(val value: SessionChangesetsChangedAction) : StateAction
@JvmInline value class StateActionSessionServerToolsChanged(val value: SessionServerToolsChangedAction) : StateAction
@JvmInline value class StateActionSessionActiveClientSet(val value: SessionActiveClientSetAction) : StateAction
@JvmInline value class StateActionSessionActiveClientRemoved(val value: SessionActiveClientRemovedAction) : StateAction
@JvmInline value class StateActionSessionInputNeededSet(val value: SessionInputNeededSetAction) : StateAction
@JvmInline value class StateActionSessionInputNeededRemoved(val value: SessionInputNeededRemovedAction) : StateAction
@JvmInline value class StateActionChatPendingMessageSet(val value: ChatPendingMessageSetAction) : StateAction
@JvmInline value class StateActionChatPendingMessageRemoved(val value: ChatPendingMessageRemovedAction) : StateAction
@JvmInline value class StateActionChatQueuedMessagesReordered(val value: ChatQueuedMessagesReorderedAction) : StateAction
@JvmInline value class StateActionChatDraftChanged(val value: ChatDraftChangedAction) : StateAction
@JvmInline value class StateActionChatInputRequested(val value: ChatInputRequestedAction) : StateAction
@JvmInline value class StateActionChatInputAnswerChanged(val value: ChatInputAnswerChangedAction) : StateAction
@JvmInline value class StateActionChatInputCompleted(val value: ChatInputCompletedAction) : StateAction
@JvmInline value class StateActionSessionCustomizationsChanged(val value: SessionCustomizationsChangedAction) : StateAction
@JvmInline value class StateActionSessionCustomizationToggled(val value: SessionCustomizationToggledAction) : StateAction
@JvmInline value class StateActionSessionCustomizationUpdated(val value: SessionCustomizationUpdatedAction) : StateAction
@JvmInline value class StateActionSessionCustomizationRemoved(val value: SessionCustomizationRemovedAction) : StateAction
@JvmInline value class StateActionSessionMcpServerStateChanged(val value: SessionMcpServerStateChangedAction) : StateAction
@JvmInline value class StateActionChatTruncated(val value: ChatTruncatedAction) : StateAction
@JvmInline value class StateActionChatTurnsLoaded(val value: ChatTurnsLoadedAction) : StateAction
@JvmInline value class StateActionSessionConfigChanged(val value: SessionConfigChangedAction) : StateAction
@JvmInline value class StateActionSessionMetaChanged(val value: SessionMetaChangedAction) : StateAction
@JvmInline value class StateActionChangesetStatusChanged(val value: ChangesetStatusChangedAction) : StateAction
@JvmInline value class StateActionChangesetFileSet(val value: ChangesetFileSetAction) : StateAction
@JvmInline value class StateActionChangesetFileRemoved(val value: ChangesetFileRemovedAction) : StateAction
@JvmInline value class StateActionChangesetFilesReviewedChanged(val value: ChangesetFilesReviewedChangedAction) : StateAction
@JvmInline value class StateActionChangesetContentChanged(val value: ChangesetContentChangedAction) : StateAction
@JvmInline value class StateActionChangesetOperationsChanged(val value: ChangesetOperationsChangedAction) : StateAction
@JvmInline value class StateActionChangesetOperationStatusChanged(val value: ChangesetOperationStatusChangedAction) : StateAction
@JvmInline value class StateActionChangesetCleared(val value: ChangesetClearedAction) : StateAction
@JvmInline value class StateActionAnnotationsSet(val value: AnnotationsSetAction) : StateAction
@JvmInline value class StateActionAnnotationsUpdated(val value: AnnotationsUpdatedAction) : StateAction
@JvmInline value class StateActionAnnotationsRemoved(val value: AnnotationsRemovedAction) : StateAction
@JvmInline value class StateActionAnnotationsEntrySet(val value: AnnotationsEntrySetAction) : StateAction
@JvmInline value class StateActionAnnotationsEntryRemoved(val value: AnnotationsEntryRemovedAction) : StateAction
@JvmInline value class StateActionRootTerminalsChanged(val value: RootTerminalsChangedAction) : StateAction
@JvmInline value class StateActionRootConfigChanged(val value: RootConfigChangedAction) : StateAction
@JvmInline value class StateActionTerminalData(val value: TerminalDataAction) : StateAction
@JvmInline value class StateActionTerminalInput(val value: TerminalInputAction) : StateAction
@JvmInline value class StateActionTerminalResized(val value: TerminalResizedAction) : StateAction
@JvmInline value class StateActionTerminalClaimed(val value: TerminalClaimedAction) : StateAction
@JvmInline value class StateActionTerminalTitleChanged(val value: TerminalTitleChangedAction) : StateAction
@JvmInline value class StateActionTerminalCwdChanged(val value: TerminalCwdChangedAction) : StateAction
@JvmInline value class StateActionTerminalExited(val value: TerminalExitedAction) : StateAction
@JvmInline value class StateActionTerminalCleared(val value: TerminalClearedAction) : StateAction
@JvmInline value class StateActionTerminalCommandDetectionAvailable(val value: TerminalCommandDetectionAvailableAction) : StateAction
@JvmInline value class StateActionTerminalCommandExecuted(val value: TerminalCommandExecutedAction) : StateAction
@JvmInline value class StateActionTerminalCommandFinished(val value: TerminalCommandFinishedAction) : StateAction
@JvmInline value class StateActionResourceWatchChanged(val value: ResourceWatchChangedAction) : StateAction
@JvmInline value class StateActionUnknown(val raw: JsonObject) : StateAction

internal object StateActionSerializer : KSerializer<StateAction> {
    override val descriptor: SerialDescriptor =
        buildClassSerialDescriptor("StateAction")

    override fun deserialize(decoder: Decoder): StateAction {
        val input = decoder as? JsonDecoder
            ?: error("StateAction can only be deserialized from JSON")
        val element = input.decodeJsonElement()
        val obj = element as? JsonObject
            ?: error("Expected JsonObject for StateAction")
        val type = (obj["type"] as? JsonPrimitive)?.contentOrNull
            ?: return StateActionUnknown(obj)
        return when (type) {
            "root/agentsChanged" -> StateActionRootAgentsChanged(input.json.decodeFromJsonElement(RootAgentsChangedAction.serializer(), element))
            "root/activeSessionsChanged" -> StateActionRootActiveSessionsChanged(input.json.decodeFromJsonElement(RootActiveSessionsChangedAction.serializer(), element))
            "session/ready" -> StateActionSessionReady(input.json.decodeFromJsonElement(SessionReadyAction.serializer(), element))
            "session/creationFailed" -> StateActionSessionCreationFailed(input.json.decodeFromJsonElement(SessionCreationFailedAction.serializer(), element))
            "session/chatAdded" -> StateActionSessionChatAdded(input.json.decodeFromJsonElement(SessionChatAddedAction.serializer(), element))
            "session/chatRemoved" -> StateActionSessionChatRemoved(input.json.decodeFromJsonElement(SessionChatRemovedAction.serializer(), element))
            "session/chatUpdated" -> StateActionSessionChatUpdated(input.json.decodeFromJsonElement(SessionChatUpdatedAction.serializer(), element))
            "session/defaultChatChanged" -> StateActionSessionDefaultChatChanged(input.json.decodeFromJsonElement(SessionDefaultChatChangedAction.serializer(), element))
            "chat/turnStarted" -> StateActionChatTurnStarted(input.json.decodeFromJsonElement(ChatTurnStartedAction.serializer(), element))
            "chat/delta" -> StateActionChatDelta(input.json.decodeFromJsonElement(ChatDeltaAction.serializer(), element))
            "chat/responsePart" -> StateActionChatResponsePart(input.json.decodeFromJsonElement(ChatResponsePartAction.serializer(), element))
            "chat/toolCallStart" -> StateActionChatToolCallStart(input.json.decodeFromJsonElement(ChatToolCallStartAction.serializer(), element))
            "chat/toolCallDelta" -> StateActionChatToolCallDelta(input.json.decodeFromJsonElement(ChatToolCallDeltaAction.serializer(), element))
            "chat/toolCallReady" -> StateActionChatToolCallReady(input.json.decodeFromJsonElement(ChatToolCallReadyAction.serializer(), element))
            "chat/toolCallConfirmed" -> StateActionChatToolCallConfirmed(input.json.decodeFromJsonElement(ChatToolCallConfirmedAction.serializer(), element))
            "chat/toolCallComplete" -> StateActionChatToolCallComplete(input.json.decodeFromJsonElement(ChatToolCallCompleteAction.serializer(), element))
            "chat/toolCallResultConfirmed" -> StateActionChatToolCallResultConfirmed(input.json.decodeFromJsonElement(ChatToolCallResultConfirmedAction.serializer(), element))
            "chat/toolCallContentChanged" -> StateActionChatToolCallContentChanged(input.json.decodeFromJsonElement(ChatToolCallContentChangedAction.serializer(), element))
            "chat/turnComplete" -> StateActionChatTurnComplete(input.json.decodeFromJsonElement(ChatTurnCompleteAction.serializer(), element))
            "chat/turnCancelled" -> StateActionChatTurnCancelled(input.json.decodeFromJsonElement(ChatTurnCancelledAction.serializer(), element))
            "chat/error" -> StateActionChatError(input.json.decodeFromJsonElement(ChatErrorAction.serializer(), element))
            "chat/activityChanged" -> StateActionChatActivityChanged(input.json.decodeFromJsonElement(ChatActivityChangedAction.serializer(), element))
            "session/titleChanged" -> StateActionSessionTitleChanged(input.json.decodeFromJsonElement(SessionTitleChangedAction.serializer(), element))
            "chat/usage" -> StateActionChatUsage(input.json.decodeFromJsonElement(ChatUsageAction.serializer(), element))
            "chat/reasoning" -> StateActionChatReasoning(input.json.decodeFromJsonElement(ChatReasoningAction.serializer(), element))
            "session/isReadChanged" -> StateActionSessionIsReadChanged(input.json.decodeFromJsonElement(SessionIsReadChangedAction.serializer(), element))
            "session/isArchivedChanged" -> StateActionSessionIsArchivedChanged(input.json.decodeFromJsonElement(SessionIsArchivedChangedAction.serializer(), element))
            "session/activityChanged" -> StateActionSessionActivityChanged(input.json.decodeFromJsonElement(SessionActivityChangedAction.serializer(), element))
            "session/changesetsChanged" -> StateActionSessionChangesetsChanged(input.json.decodeFromJsonElement(SessionChangesetsChangedAction.serializer(), element))
            "session/serverToolsChanged" -> StateActionSessionServerToolsChanged(input.json.decodeFromJsonElement(SessionServerToolsChangedAction.serializer(), element))
            "session/activeClientSet" -> StateActionSessionActiveClientSet(input.json.decodeFromJsonElement(SessionActiveClientSetAction.serializer(), element))
            "session/activeClientRemoved" -> StateActionSessionActiveClientRemoved(input.json.decodeFromJsonElement(SessionActiveClientRemovedAction.serializer(), element))
            "session/inputNeededSet" -> StateActionSessionInputNeededSet(input.json.decodeFromJsonElement(SessionInputNeededSetAction.serializer(), element))
            "session/inputNeededRemoved" -> StateActionSessionInputNeededRemoved(input.json.decodeFromJsonElement(SessionInputNeededRemovedAction.serializer(), element))
            "chat/pendingMessageSet" -> StateActionChatPendingMessageSet(input.json.decodeFromJsonElement(ChatPendingMessageSetAction.serializer(), element))
            "chat/pendingMessageRemoved" -> StateActionChatPendingMessageRemoved(input.json.decodeFromJsonElement(ChatPendingMessageRemovedAction.serializer(), element))
            "chat/queuedMessagesReordered" -> StateActionChatQueuedMessagesReordered(input.json.decodeFromJsonElement(ChatQueuedMessagesReorderedAction.serializer(), element))
            "chat/draftChanged" -> StateActionChatDraftChanged(input.json.decodeFromJsonElement(ChatDraftChangedAction.serializer(), element))
            "chat/inputRequested" -> StateActionChatInputRequested(input.json.decodeFromJsonElement(ChatInputRequestedAction.serializer(), element))
            "chat/inputAnswerChanged" -> StateActionChatInputAnswerChanged(input.json.decodeFromJsonElement(ChatInputAnswerChangedAction.serializer(), element))
            "chat/inputCompleted" -> StateActionChatInputCompleted(input.json.decodeFromJsonElement(ChatInputCompletedAction.serializer(), element))
            "session/customizationsChanged" -> StateActionSessionCustomizationsChanged(input.json.decodeFromJsonElement(SessionCustomizationsChangedAction.serializer(), element))
            "session/customizationToggled" -> StateActionSessionCustomizationToggled(input.json.decodeFromJsonElement(SessionCustomizationToggledAction.serializer(), element))
            "session/customizationUpdated" -> StateActionSessionCustomizationUpdated(input.json.decodeFromJsonElement(SessionCustomizationUpdatedAction.serializer(), element))
            "session/customizationRemoved" -> StateActionSessionCustomizationRemoved(input.json.decodeFromJsonElement(SessionCustomizationRemovedAction.serializer(), element))
            "session/mcpServerStateChanged" -> StateActionSessionMcpServerStateChanged(input.json.decodeFromJsonElement(SessionMcpServerStateChangedAction.serializer(), element))
            "chat/truncated" -> StateActionChatTruncated(input.json.decodeFromJsonElement(ChatTruncatedAction.serializer(), element))
            "chat/turnsLoaded" -> StateActionChatTurnsLoaded(input.json.decodeFromJsonElement(ChatTurnsLoadedAction.serializer(), element))
            "session/configChanged" -> StateActionSessionConfigChanged(input.json.decodeFromJsonElement(SessionConfigChangedAction.serializer(), element))
            "session/metaChanged" -> StateActionSessionMetaChanged(input.json.decodeFromJsonElement(SessionMetaChangedAction.serializer(), element))
            "changeset/statusChanged" -> StateActionChangesetStatusChanged(input.json.decodeFromJsonElement(ChangesetStatusChangedAction.serializer(), element))
            "changeset/fileSet" -> StateActionChangesetFileSet(input.json.decodeFromJsonElement(ChangesetFileSetAction.serializer(), element))
            "changeset/fileRemoved" -> StateActionChangesetFileRemoved(input.json.decodeFromJsonElement(ChangesetFileRemovedAction.serializer(), element))
            "changeset/filesReviewedChanged" -> StateActionChangesetFilesReviewedChanged(input.json.decodeFromJsonElement(ChangesetFilesReviewedChangedAction.serializer(), element))
            "changeset/contentChanged" -> StateActionChangesetContentChanged(input.json.decodeFromJsonElement(ChangesetContentChangedAction.serializer(), element))
            "changeset/operationsChanged" -> StateActionChangesetOperationsChanged(input.json.decodeFromJsonElement(ChangesetOperationsChangedAction.serializer(), element))
            "changeset/operationStatusChanged" -> StateActionChangesetOperationStatusChanged(input.json.decodeFromJsonElement(ChangesetOperationStatusChangedAction.serializer(), element))
            "changeset/cleared" -> StateActionChangesetCleared(input.json.decodeFromJsonElement(ChangesetClearedAction.serializer(), element))
            "annotations/set" -> StateActionAnnotationsSet(input.json.decodeFromJsonElement(AnnotationsSetAction.serializer(), element))
            "annotations/updated" -> StateActionAnnotationsUpdated(input.json.decodeFromJsonElement(AnnotationsUpdatedAction.serializer(), element))
            "annotations/removed" -> StateActionAnnotationsRemoved(input.json.decodeFromJsonElement(AnnotationsRemovedAction.serializer(), element))
            "annotations/entrySet" -> StateActionAnnotationsEntrySet(input.json.decodeFromJsonElement(AnnotationsEntrySetAction.serializer(), element))
            "annotations/entryRemoved" -> StateActionAnnotationsEntryRemoved(input.json.decodeFromJsonElement(AnnotationsEntryRemovedAction.serializer(), element))
            "root/terminalsChanged" -> StateActionRootTerminalsChanged(input.json.decodeFromJsonElement(RootTerminalsChangedAction.serializer(), element))
            "root/configChanged" -> StateActionRootConfigChanged(input.json.decodeFromJsonElement(RootConfigChangedAction.serializer(), element))
            "terminal/data" -> StateActionTerminalData(input.json.decodeFromJsonElement(TerminalDataAction.serializer(), element))
            "terminal/input" -> StateActionTerminalInput(input.json.decodeFromJsonElement(TerminalInputAction.serializer(), element))
            "terminal/resized" -> StateActionTerminalResized(input.json.decodeFromJsonElement(TerminalResizedAction.serializer(), element))
            "terminal/claimed" -> StateActionTerminalClaimed(input.json.decodeFromJsonElement(TerminalClaimedAction.serializer(), element))
            "terminal/titleChanged" -> StateActionTerminalTitleChanged(input.json.decodeFromJsonElement(TerminalTitleChangedAction.serializer(), element))
            "terminal/cwdChanged" -> StateActionTerminalCwdChanged(input.json.decodeFromJsonElement(TerminalCwdChangedAction.serializer(), element))
            "terminal/exited" -> StateActionTerminalExited(input.json.decodeFromJsonElement(TerminalExitedAction.serializer(), element))
            "terminal/cleared" -> StateActionTerminalCleared(input.json.decodeFromJsonElement(TerminalClearedAction.serializer(), element))
            "terminal/commandDetectionAvailable" -> StateActionTerminalCommandDetectionAvailable(input.json.decodeFromJsonElement(TerminalCommandDetectionAvailableAction.serializer(), element))
            "terminal/commandExecuted" -> StateActionTerminalCommandExecuted(input.json.decodeFromJsonElement(TerminalCommandExecutedAction.serializer(), element))
            "terminal/commandFinished" -> StateActionTerminalCommandFinished(input.json.decodeFromJsonElement(TerminalCommandFinishedAction.serializer(), element))
            "resourceWatch/changed" -> StateActionResourceWatchChanged(input.json.decodeFromJsonElement(ResourceWatchChangedAction.serializer(), element))
            else -> StateActionUnknown(obj)
        }
    }

    override fun serialize(encoder: Encoder, value: StateAction) {
        val output = encoder as? JsonEncoder
            ?: error("StateAction can only be serialized to JSON")
        val element: JsonElement = when (value) {
            is StateActionRootAgentsChanged -> output.json.encodeToJsonElement(RootAgentsChangedAction.serializer(), value.value)
            is StateActionRootActiveSessionsChanged -> output.json.encodeToJsonElement(RootActiveSessionsChangedAction.serializer(), value.value)
            is StateActionSessionReady -> output.json.encodeToJsonElement(SessionReadyAction.serializer(), value.value)
            is StateActionSessionCreationFailed -> output.json.encodeToJsonElement(SessionCreationFailedAction.serializer(), value.value)
            is StateActionSessionChatAdded -> output.json.encodeToJsonElement(SessionChatAddedAction.serializer(), value.value)
            is StateActionSessionChatRemoved -> output.json.encodeToJsonElement(SessionChatRemovedAction.serializer(), value.value)
            is StateActionSessionChatUpdated -> output.json.encodeToJsonElement(SessionChatUpdatedAction.serializer(), value.value)
            is StateActionSessionDefaultChatChanged -> output.json.encodeToJsonElement(SessionDefaultChatChangedAction.serializer(), value.value)
            is StateActionChatTurnStarted -> output.json.encodeToJsonElement(ChatTurnStartedAction.serializer(), value.value)
            is StateActionChatDelta -> output.json.encodeToJsonElement(ChatDeltaAction.serializer(), value.value)
            is StateActionChatResponsePart -> output.json.encodeToJsonElement(ChatResponsePartAction.serializer(), value.value)
            is StateActionChatToolCallStart -> output.json.encodeToJsonElement(ChatToolCallStartAction.serializer(), value.value)
            is StateActionChatToolCallDelta -> output.json.encodeToJsonElement(ChatToolCallDeltaAction.serializer(), value.value)
            is StateActionChatToolCallReady -> output.json.encodeToJsonElement(ChatToolCallReadyAction.serializer(), value.value)
            is StateActionChatToolCallConfirmed -> output.json.encodeToJsonElement(ChatToolCallConfirmedAction.serializer(), value.value)
            is StateActionChatToolCallComplete -> output.json.encodeToJsonElement(ChatToolCallCompleteAction.serializer(), value.value)
            is StateActionChatToolCallResultConfirmed -> output.json.encodeToJsonElement(ChatToolCallResultConfirmedAction.serializer(), value.value)
            is StateActionChatToolCallContentChanged -> output.json.encodeToJsonElement(ChatToolCallContentChangedAction.serializer(), value.value)
            is StateActionChatTurnComplete -> output.json.encodeToJsonElement(ChatTurnCompleteAction.serializer(), value.value)
            is StateActionChatTurnCancelled -> output.json.encodeToJsonElement(ChatTurnCancelledAction.serializer(), value.value)
            is StateActionChatError -> output.json.encodeToJsonElement(ChatErrorAction.serializer(), value.value)
            is StateActionChatActivityChanged -> output.json.encodeToJsonElement(ChatActivityChangedAction.serializer(), value.value)
            is StateActionSessionTitleChanged -> output.json.encodeToJsonElement(SessionTitleChangedAction.serializer(), value.value)
            is StateActionChatUsage -> output.json.encodeToJsonElement(ChatUsageAction.serializer(), value.value)
            is StateActionChatReasoning -> output.json.encodeToJsonElement(ChatReasoningAction.serializer(), value.value)
            is StateActionSessionIsReadChanged -> output.json.encodeToJsonElement(SessionIsReadChangedAction.serializer(), value.value)
            is StateActionSessionIsArchivedChanged -> output.json.encodeToJsonElement(SessionIsArchivedChangedAction.serializer(), value.value)
            is StateActionSessionActivityChanged -> output.json.encodeToJsonElement(SessionActivityChangedAction.serializer(), value.value)
            is StateActionSessionChangesetsChanged -> output.json.encodeToJsonElement(SessionChangesetsChangedAction.serializer(), value.value)
            is StateActionSessionServerToolsChanged -> output.json.encodeToJsonElement(SessionServerToolsChangedAction.serializer(), value.value)
            is StateActionSessionActiveClientSet -> output.json.encodeToJsonElement(SessionActiveClientSetAction.serializer(), value.value)
            is StateActionSessionActiveClientRemoved -> output.json.encodeToJsonElement(SessionActiveClientRemovedAction.serializer(), value.value)
            is StateActionSessionInputNeededSet -> output.json.encodeToJsonElement(SessionInputNeededSetAction.serializer(), value.value)
            is StateActionSessionInputNeededRemoved -> output.json.encodeToJsonElement(SessionInputNeededRemovedAction.serializer(), value.value)
            is StateActionChatPendingMessageSet -> output.json.encodeToJsonElement(ChatPendingMessageSetAction.serializer(), value.value)
            is StateActionChatPendingMessageRemoved -> output.json.encodeToJsonElement(ChatPendingMessageRemovedAction.serializer(), value.value)
            is StateActionChatQueuedMessagesReordered -> output.json.encodeToJsonElement(ChatQueuedMessagesReorderedAction.serializer(), value.value)
            is StateActionChatDraftChanged -> output.json.encodeToJsonElement(ChatDraftChangedAction.serializer(), value.value)
            is StateActionChatInputRequested -> output.json.encodeToJsonElement(ChatInputRequestedAction.serializer(), value.value)
            is StateActionChatInputAnswerChanged -> output.json.encodeToJsonElement(ChatInputAnswerChangedAction.serializer(), value.value)
            is StateActionChatInputCompleted -> output.json.encodeToJsonElement(ChatInputCompletedAction.serializer(), value.value)
            is StateActionSessionCustomizationsChanged -> output.json.encodeToJsonElement(SessionCustomizationsChangedAction.serializer(), value.value)
            is StateActionSessionCustomizationToggled -> output.json.encodeToJsonElement(SessionCustomizationToggledAction.serializer(), value.value)
            is StateActionSessionCustomizationUpdated -> output.json.encodeToJsonElement(SessionCustomizationUpdatedAction.serializer(), value.value)
            is StateActionSessionCustomizationRemoved -> output.json.encodeToJsonElement(SessionCustomizationRemovedAction.serializer(), value.value)
            is StateActionSessionMcpServerStateChanged -> output.json.encodeToJsonElement(SessionMcpServerStateChangedAction.serializer(), value.value)
            is StateActionChatTruncated -> output.json.encodeToJsonElement(ChatTruncatedAction.serializer(), value.value)
            is StateActionChatTurnsLoaded -> output.json.encodeToJsonElement(ChatTurnsLoadedAction.serializer(), value.value)
            is StateActionSessionConfigChanged -> output.json.encodeToJsonElement(SessionConfigChangedAction.serializer(), value.value)
            is StateActionSessionMetaChanged -> output.json.encodeToJsonElement(SessionMetaChangedAction.serializer(), value.value)
            is StateActionChangesetStatusChanged -> output.json.encodeToJsonElement(ChangesetStatusChangedAction.serializer(), value.value)
            is StateActionChangesetFileSet -> output.json.encodeToJsonElement(ChangesetFileSetAction.serializer(), value.value)
            is StateActionChangesetFileRemoved -> output.json.encodeToJsonElement(ChangesetFileRemovedAction.serializer(), value.value)
            is StateActionChangesetFilesReviewedChanged -> output.json.encodeToJsonElement(ChangesetFilesReviewedChangedAction.serializer(), value.value)
            is StateActionChangesetContentChanged -> output.json.encodeToJsonElement(ChangesetContentChangedAction.serializer(), value.value)
            is StateActionChangesetOperationsChanged -> output.json.encodeToJsonElement(ChangesetOperationsChangedAction.serializer(), value.value)
            is StateActionChangesetOperationStatusChanged -> output.json.encodeToJsonElement(ChangesetOperationStatusChangedAction.serializer(), value.value)
            is StateActionChangesetCleared -> output.json.encodeToJsonElement(ChangesetClearedAction.serializer(), value.value)
            is StateActionAnnotationsSet -> output.json.encodeToJsonElement(AnnotationsSetAction.serializer(), value.value)
            is StateActionAnnotationsUpdated -> output.json.encodeToJsonElement(AnnotationsUpdatedAction.serializer(), value.value)
            is StateActionAnnotationsRemoved -> output.json.encodeToJsonElement(AnnotationsRemovedAction.serializer(), value.value)
            is StateActionAnnotationsEntrySet -> output.json.encodeToJsonElement(AnnotationsEntrySetAction.serializer(), value.value)
            is StateActionAnnotationsEntryRemoved -> output.json.encodeToJsonElement(AnnotationsEntryRemovedAction.serializer(), value.value)
            is StateActionRootTerminalsChanged -> output.json.encodeToJsonElement(RootTerminalsChangedAction.serializer(), value.value)
            is StateActionRootConfigChanged -> output.json.encodeToJsonElement(RootConfigChangedAction.serializer(), value.value)
            is StateActionTerminalData -> output.json.encodeToJsonElement(TerminalDataAction.serializer(), value.value)
            is StateActionTerminalInput -> output.json.encodeToJsonElement(TerminalInputAction.serializer(), value.value)
            is StateActionTerminalResized -> output.json.encodeToJsonElement(TerminalResizedAction.serializer(), value.value)
            is StateActionTerminalClaimed -> output.json.encodeToJsonElement(TerminalClaimedAction.serializer(), value.value)
            is StateActionTerminalTitleChanged -> output.json.encodeToJsonElement(TerminalTitleChangedAction.serializer(), value.value)
            is StateActionTerminalCwdChanged -> output.json.encodeToJsonElement(TerminalCwdChangedAction.serializer(), value.value)
            is StateActionTerminalExited -> output.json.encodeToJsonElement(TerminalExitedAction.serializer(), value.value)
            is StateActionTerminalCleared -> output.json.encodeToJsonElement(TerminalClearedAction.serializer(), value.value)
            is StateActionTerminalCommandDetectionAvailable -> output.json.encodeToJsonElement(TerminalCommandDetectionAvailableAction.serializer(), value.value)
            is StateActionTerminalCommandExecuted -> output.json.encodeToJsonElement(TerminalCommandExecutedAction.serializer(), value.value)
            is StateActionTerminalCommandFinished -> output.json.encodeToJsonElement(TerminalCommandFinishedAction.serializer(), value.value)
            is StateActionResourceWatchChanged -> output.json.encodeToJsonElement(ResourceWatchChangedAction.serializer(), value.value)
            is StateActionUnknown -> value.raw
        }
        output.encodeJsonElement(element)
    }
}
