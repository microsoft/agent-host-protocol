//! Pure state reducers ported from `types/reducers.ts`.
//!
//! Reducers mutate state in place and return a [`ReduceOutcome`]. Use
//! [`apply_action_to_root`], [`apply_action_to_session`],
//! [`apply_action_to_chat`], and [`apply_action_to_terminal`] to
//! dispatch any [`StateAction`] against the matching scope; unrelated
//! actions short-circuit as [`ReduceOutcome::OutOfScope`] so a client
//! holding every state tree can blindly fan each action out.
//!
//! All reducers are pure functions over `(state, action)` — no
//! I/O, no allocation beyond what the action itself carries — which
//! makes them safe to run inside a UI render loop or a snapshot
//! reconciler.
//!
//! # Example
//!
//! ```
//! use ahp::reducers::{apply_action_to_root, ReduceOutcome};
//! use ahp_types::actions::{
//!     RootActiveSessionsChangedAction, SessionTitleChangedAction, StateAction,
//! };
//! use ahp_types::state::RootState;
//!
//! let mut root = RootState {
//!     agents: vec![],
//!     active_sessions: None,
//!     terminals: None,
//!     config: None,
//!     meta: None,
//! };
//!
//! // A root-scoped action mutates `RootState`.
//! let action = StateAction::RootActiveSessionsChanged(
//!     RootActiveSessionsChangedAction { active_sessions: 5 },
//! );
//! assert_eq!(apply_action_to_root(&mut root, &action), ReduceOutcome::Applied);
//! assert_eq!(root.active_sessions, Some(5));
//!
//! // A session-scoped action is reported as out-of-scope at the root.
//! let session_action = StateAction::SessionTitleChanged(
//!     SessionTitleChangedAction { title: "Hi".into() },
//! );
//! assert_eq!(
//!     apply_action_to_root(&mut root, &session_action),
//!     ReduceOutcome::OutOfScope,
//! );
//! ```

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use ahp_types::actions::{
    ChatInputAnswerChangedAction, ChatToolCallCompleteAction, ChatToolCallConfirmedAction,
    ChatToolCallContentChangedAction, ChatToolCallDeltaAction, ChatToolCallReadyAction,
    ChatToolCallResultConfirmedAction, ChatTurnStartedAction, StateAction,
};
use ahp_types::state::{
    ActiveTurn, ChatInputRequest, ChatState, ChildCustomization, ConfirmationOption, Customization,
    ErrorInfo, PendingMessage, PendingMessageKind, ResponsePart, RootState, SessionLifecycle,
    SessionState, SessionStatus, TerminalCommandPart, TerminalContentPart, TerminalState,
    TerminalUnclassifiedPart, ToolCallCancellationReason, ToolCallCancelledState,
    ToolCallCompletedState, ToolCallConfirmationReason, ToolCallContributor,
    ToolCallPendingConfirmationState, ToolCallPendingResultConfirmationState, ToolCallResponsePart,
    ToolCallRunningState, ToolCallState, ToolCallStreamingState, Turn, TurnState,
};

/// What happened when an action was applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReduceOutcome {
    /// The action was applied and mutated state.
    Applied,
    /// The action was recognized but a no-op against this state (e.g.
    /// an unknown `turnId` or a stale event for a closed tool call).
    NoOp,
    /// The action targets a different scope (e.g. a session action
    /// applied to root). Caller should route to the right reducer.
    OutOfScope,
}

#[cfg(test)]
thread_local! {
    static MOCK_NOW_MS: std::cell::Cell<Option<i64>> = const { std::cell::Cell::new(None) };
}

fn now_ms() -> i64 {
    #[cfg(test)]
    {
        if let Some(v) = MOCK_NOW_MS.with(|c| c.get()) {
            return v;
        }
    }
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn now_iso() -> String {
    iso8601_from_unix_millis(now_ms())
}

fn iso8601_from_unix_millis(ms: i64) -> String {
    let seconds = ms.div_euclid(1_000);
    let millis = ms.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn tool_call_meta(
    tc: &ToolCallState,
) -> (
    String,
    String,
    String,
    Option<ToolCallContributor>,
    Option<serde_json::Map<String, serde_json::Value>>,
) {
    match tc {
        ToolCallState::Streaming(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.contributor.clone(),
            s.meta.clone(),
        ),
        ToolCallState::PendingConfirmation(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.contributor.clone(),
            s.meta.clone(),
        ),
        ToolCallState::Running(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.contributor.clone(),
            s.meta.clone(),
        ),
        ToolCallState::PendingResultConfirmation(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.contributor.clone(),
            s.meta.clone(),
        ),
        ToolCallState::Completed(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.contributor.clone(),
            s.meta.clone(),
        ),
        ToolCallState::Cancelled(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.contributor.clone(),
            s.meta.clone(),
        ),
        ToolCallState::Unknown(_) => (String::new(), String::new(), String::new(), None, None),
    }
}

fn tool_call_id(tc: &ToolCallState) -> &str {
    match tc {
        ToolCallState::Streaming(s) => &s.tool_call_id,
        ToolCallState::PendingConfirmation(s) => &s.tool_call_id,
        ToolCallState::Running(s) => &s.tool_call_id,
        ToolCallState::PendingResultConfirmation(s) => &s.tool_call_id,
        ToolCallState::Completed(s) => &s.tool_call_id,
        ToolCallState::Cancelled(s) => &s.tool_call_id,
        ToolCallState::Unknown(_) => "",
    }
}

fn has_pending_tool_call_confirmation(state: &ChatState) -> bool {
    let Some(active) = &state.active_turn else {
        return false;
    };
    active.response_parts.iter().any(|part| match part {
        ResponsePart::ToolCall(tc) => matches!(
            tc.tool_call,
            ToolCallState::PendingConfirmation(_) | ToolCallState::PendingResultConfirmation(_)
        ),
        _ => false,
    })
}

/// Bitmask covering the mutually-exclusive activity bits (bits 0–4).
const STATUS_ACTIVITY_MASK: u32 = (1 << 5) - 1;

/// Sets or clears a metadata flag on a status value.
fn with_status_flag(status: u32, flag: SessionStatus, set: bool) -> u32 {
    let f = flag.bits();
    if set {
        status | f
    } else {
        status & !f
    }
}

fn summary_status(state: &ChatState, terminal: Option<SessionStatus>) -> u32 {
    let activity: u32 = if let Some(t) = terminal {
        t.bits()
    } else if state
        .input_requests
        .as_ref()
        .map(|r| !r.is_empty())
        .unwrap_or(false)
        || has_pending_tool_call_confirmation(state)
    {
        SessionStatus::InputNeeded.bits()
    } else if state.active_turn.is_some() {
        SessionStatus::InProgress.bits()
    } else {
        SessionStatus::Idle.bits()
    };
    (state.status & !STATUS_ACTIVITY_MASK) | activity
}

fn refresh_summary_status(state: &mut ChatState) {
    state.status = summary_status(state, None);
}

fn touch_chat_modified(state: &mut ChatState) {
    state.modified_at = now_iso();
}

fn touch_session_modified(state: &mut SessionState) {
    state.summary.modified_at = now_ms();
}

fn end_turn(
    state: &mut ChatState,
    turn_id: &str,
    turn_state: TurnState,
    terminal_status: Option<SessionStatus>,
    error: Option<ErrorInfo>,
) -> ReduceOutcome {
    let Some(active) = state.active_turn.as_ref() else {
        return ReduceOutcome::NoOp;
    };
    if active.id != turn_id {
        return ReduceOutcome::NoOp;
    }
    let active = state.active_turn.take().unwrap();

    let response_parts: Vec<ResponsePart> = active
        .response_parts
        .into_iter()
        .map(|part| match part {
            ResponsePart::ToolCall(tc_part) => {
                let tc = tc_part.tool_call;
                match &tc {
                    ToolCallState::Completed(_) | ToolCallState::Cancelled(_) => {
                        ResponsePart::ToolCall(Box::new(ToolCallResponsePart { tool_call: tc }))
                    }
                    _ => {
                        let (tool_call_id, tool_name, display_name, contributor, meta) =
                            tool_call_meta(&tc);
                        let invocation_message = match &tc {
                            ToolCallState::Streaming(s) => {
                                s.invocation_message.clone().unwrap_or_default()
                            }
                            ToolCallState::PendingConfirmation(s) => s.invocation_message.clone(),
                            ToolCallState::Running(s) => s.invocation_message.clone(),
                            ToolCallState::PendingResultConfirmation(s) => {
                                s.invocation_message.clone()
                            }
                            _ => Default::default(),
                        };
                        let tool_input = match &tc {
                            ToolCallState::Streaming(_) => None,
                            ToolCallState::PendingConfirmation(s) => s.tool_input.clone(),
                            ToolCallState::Running(s) => s.tool_input.clone(),
                            ToolCallState::PendingResultConfirmation(s) => s.tool_input.clone(),
                            _ => None,
                        };
                        let cancelled = ToolCallCancelledState {
                            tool_call_id,
                            tool_name,
                            display_name,
                            contributor,
                            meta,
                            invocation_message,
                            tool_input,
                            reason: ToolCallCancellationReason::Skipped,
                            reason_message: None,
                            user_suggestion: None,
                            selected_option: None,
                        };
                        ResponsePart::ToolCall(Box::new(ToolCallResponsePart {
                            tool_call: ToolCallState::Cancelled(cancelled),
                        }))
                    }
                }
            }
            other => other,
        })
        .collect();

    let turn = Turn {
        id: active.id,
        message: active.message,
        response_parts,
        usage: active.usage,
        state: turn_state,
        error,
    };

    state.turns.push(turn);
    state.input_requests = None;
    touch_chat_modified(state);
    state.status = summary_status(state, terminal_status);
    ReduceOutcome::Applied
}

fn upsert_input_request(state: &mut ChatState, request: ChatInputRequest) {
    let existing = state.input_requests.get_or_insert_with(Vec::new);
    if let Some(idx) = existing.iter().position(|r| r.id == request.id) {
        let answers = request
            .answers
            .clone()
            .or_else(|| existing[idx].answers.clone());
        let mut next = request;
        next.answers = answers;
        existing[idx] = next;
    } else {
        existing.push(request);
    }
    state.status = summary_status(state, None);
    touch_chat_modified(state);
    state.status = with_status_flag(state.status, SessionStatus::IsRead, false);
}

// ─── Customization Helpers ───────────────────────────────────────────────────

fn customization_id(c: &Customization) -> Option<&str> {
    match c {
        Customization::Plugin(p) => Some(p.id.as_str()),
        Customization::Directory(d) => Some(d.id.as_str()),
        Customization::McpServer(m) => Some(m.id.as_str()),
        Customization::Unknown(_) => None,
    }
}

fn child_id_of(c: &ChildCustomization) -> Option<&str> {
    match c {
        ChildCustomization::Agent(x) => Some(x.id.as_str()),
        ChildCustomization::Skill(x) => Some(x.id.as_str()),
        ChildCustomization::Prompt(x) => Some(x.id.as_str()),
        ChildCustomization::Rule(x) => Some(x.id.as_str()),
        ChildCustomization::Hook(x) => Some(x.id.as_str()),
        ChildCustomization::McpServer(x) => Some(x.id.as_str()),
        ChildCustomization::Unknown(_) => None,
    }
}

fn container_children_mut(c: &mut Customization) -> Option<&mut Vec<ChildCustomization>> {
    match c {
        Customization::Plugin(p) => p.children.as_mut(),
        Customization::Directory(d) => d.children.as_mut(),
        Customization::McpServer(_) | Customization::Unknown(_) => None,
    }
}

fn set_container_enabled(c: &mut Customization, enabled: bool) {
    match c {
        Customization::Plugin(p) => p.enabled = enabled,
        Customization::Directory(d) => d.enabled = enabled,
        Customization::McpServer(m) => m.enabled = enabled,
        Customization::Unknown(_) => {}
    }
}

fn apply_toggle(list: &mut [Customization], id: &str, enabled: bool) -> bool {
    if let Some(container) = list.iter_mut().find(|c| customization_id(c) == Some(id)) {
        set_container_enabled(container, enabled);
        return true;
    }
    false
}

fn update_tool_call<F>(
    state: &mut ChatState,
    turn_id: &str,
    tool_call_id_target: &str,
    updater: F,
) -> ReduceOutcome
where
    F: FnOnce(ToolCallState) -> ToolCallState,
{
    let Some(active) = state.active_turn.as_mut() else {
        return ReduceOutcome::NoOp;
    };
    if active.id != turn_id {
        return ReduceOutcome::NoOp;
    }
    for part in active.response_parts.iter_mut() {
        if let ResponsePart::ToolCall(tc) = part {
            if tool_call_id(&tc.tool_call) == tool_call_id_target {
                let owned = std::mem::replace(
                    &mut tc.tool_call,
                    ToolCallState::Cancelled(ToolCallCancelledState {
                        tool_call_id: String::new(),
                        tool_name: String::new(),
                        display_name: String::new(),
                        contributor: None,
                        meta: None,
                        invocation_message: Default::default(),
                        tool_input: None,
                        reason: ToolCallCancellationReason::Skipped,
                        reason_message: None,
                        user_suggestion: None,
                        selected_option: None,
                    }),
                );
                tc.tool_call = updater(owned);
                return ReduceOutcome::Applied;
            }
        }
    }
    ReduceOutcome::NoOp
}

fn update_response_part<F>(
    state: &mut ChatState,
    turn_id: &str,
    part_id: &str,
    updater: F,
) -> ReduceOutcome
where
    F: FnOnce(&mut ResponsePart),
{
    let Some(active) = state.active_turn.as_mut() else {
        return ReduceOutcome::NoOp;
    };
    if active.id != turn_id {
        return ReduceOutcome::NoOp;
    }
    for part in active.response_parts.iter_mut() {
        let id = match part {
            ResponsePart::ToolCall(tc) => Some(tool_call_id(&tc.tool_call).to_owned()),
            ResponsePart::Markdown(m) => Some(m.id.clone()),
            ResponsePart::Reasoning(r) => Some(r.id.clone()),
            ResponsePart::ContentRef(_)
            | ResponsePart::SystemNotification(_)
            | ResponsePart::Unknown(_) => None,
        };
        if id.as_deref() == Some(part_id) {
            updater(part);
            return ReduceOutcome::Applied;
        }
    }
    ReduceOutcome::NoOp
}

// ─── Root Reducer ─────────────────────────────────────────────────────

/// Apply a [`StateAction`] to a [`RootState`] in place.
pub fn apply_action_to_root(state: &mut RootState, action: &StateAction) -> ReduceOutcome {
    match action {
        StateAction::RootAgentsChanged(a) => {
            state.agents = a.agents.clone();
            ReduceOutcome::Applied
        }
        StateAction::RootActiveSessionsChanged(a) => {
            state.active_sessions = Some(a.active_sessions);
            ReduceOutcome::Applied
        }
        StateAction::RootTerminalsChanged(a) => {
            state.terminals = Some(a.terminals.clone());
            ReduceOutcome::Applied
        }
        StateAction::RootConfigChanged(a) => {
            let Some(config) = state.config.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if a.replace.unwrap_or(false) {
                config.values = a.config.clone();
            } else {
                for (k, v) in &a.config {
                    config.values.insert(k.clone(), v.clone());
                }
            }
            ReduceOutcome::Applied
        }
        _ => ReduceOutcome::OutOfScope,
    }
}

// ─── Session Reducer ──────────────────────────────────────────────────

/// Apply a [`StateAction`] to a [`SessionState`] in place.
pub fn apply_action_to_session(state: &mut SessionState, action: &StateAction) -> ReduceOutcome {
    match action {
        StateAction::SessionReady(_) => {
            // Lifecycle-only transition. Must not touch `summary.status`: see
            // the equivalent TypeScript reducer for the rationale.
            state.lifecycle = SessionLifecycle::Ready;
            ReduceOutcome::Applied
        }
        StateAction::SessionCreationFailed(a) => {
            state.lifecycle = SessionLifecycle::CreationFailed;
            state.creation_error = Some(a.error.clone());
            ReduceOutcome::Applied
        }
        StateAction::SessionChatAdded(a) => {
            if let Some(idx) = state
                .chats
                .iter()
                .position(|chat| chat.resource == a.summary.resource)
            {
                state.chats[idx] = a.summary.clone();
            } else {
                state.chats.push(a.summary.clone());
            }
            ReduceOutcome::Applied
        }
        StateAction::SessionChatRemoved(a) => {
            let Some(idx) = state.chats.iter().position(|chat| chat.resource == a.chat) else {
                return ReduceOutcome::NoOp;
            };
            state.chats.remove(idx);
            if state.default_chat.as_ref() == Some(&a.chat) {
                state.default_chat = None;
            }
            ReduceOutcome::Applied
        }
        StateAction::SessionChatUpdated(a) => {
            let Some(chat) = state.chats.iter_mut().find(|chat| chat.resource == a.chat) else {
                return ReduceOutcome::NoOp;
            };
            if let Some(title) = &a.changes.title {
                chat.title = title.clone();
            }
            if let Some(status) = a.changes.status {
                chat.status = status;
            }
            if let Some(activity) = &a.changes.activity {
                chat.activity = Some(activity.clone());
            }
            if let Some(modified_at) = &a.changes.modified_at {
                chat.modified_at = modified_at.clone();
            }
            if let Some(model) = &a.changes.model {
                chat.model = Some(model.clone());
            }
            if let Some(agent) = &a.changes.agent {
                chat.agent = Some(agent.clone());
            }
            if let Some(origin) = &a.changes.origin {
                chat.origin = Some(origin.clone());
            }
            if let Some(working_directory) = &a.changes.working_directory {
                chat.working_directory = Some(working_directory.clone());
            }
            ReduceOutcome::Applied
        }
        StateAction::SessionDefaultChatChanged(a) => {
            state.default_chat = a.default_chat.clone();
            ReduceOutcome::Applied
        }
        StateAction::SessionTitleChanged(a) => {
            state.summary.title = a.title.clone();
            touch_session_modified(state);
            ReduceOutcome::Applied
        }
        StateAction::SessionModelChanged(a) => {
            state.summary.model = Some(a.model.clone());
            touch_session_modified(state);
            ReduceOutcome::Applied
        }
        StateAction::SessionAgentChanged(a) => {
            state.summary.agent = a.agent.clone();
            touch_session_modified(state);
            ReduceOutcome::Applied
        }
        StateAction::SessionIsReadChanged(a) => {
            state.summary.status =
                with_status_flag(state.summary.status, SessionStatus::IsRead, a.is_read);
            ReduceOutcome::Applied
        }
        StateAction::SessionIsArchivedChanged(a) => {
            state.summary.status = with_status_flag(
                state.summary.status,
                SessionStatus::IsArchived,
                a.is_archived,
            );
            ReduceOutcome::Applied
        }
        StateAction::SessionActivityChanged(a) => {
            state.summary.activity = a.activity.clone();
            ReduceOutcome::Applied
        }
        StateAction::SessionChangesetsChanged(a) => {
            state.changesets = a.changesets.clone();
            ReduceOutcome::Applied
        }
        StateAction::SessionConfigChanged(a) => {
            let Some(config) = state.config.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if a.replace.unwrap_or(false) {
                config.values = a.config.clone();
            } else {
                for (k, v) in &a.config {
                    config.values.insert(k.clone(), v.clone());
                }
            }
            touch_session_modified(state);
            ReduceOutcome::Applied
        }
        StateAction::SessionMetaChanged(a) => {
            state.meta = a.meta.clone();
            ReduceOutcome::Applied
        }
        StateAction::SessionServerToolsChanged(a) => {
            state.server_tools = Some(a.tools.clone());
            ReduceOutcome::Applied
        }
        StateAction::SessionActiveClientChanged(a) => {
            state.active_client = a.active_client.clone();
            ReduceOutcome::Applied
        }
        StateAction::SessionActiveClientToolsChanged(a) => {
            let Some(ac) = state.active_client.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            ac.tools = a.tools.clone();
            ReduceOutcome::Applied
        }
        StateAction::SessionCustomizationsChanged(a) => {
            state.customizations = Some(a.customizations.clone());
            ReduceOutcome::Applied
        }
        StateAction::SessionCustomizationToggled(a) => {
            let Some(list) = state.customizations.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if apply_toggle(list, &a.id, a.enabled) {
                ReduceOutcome::Applied
            } else {
                ReduceOutcome::NoOp
            }
        }
        StateAction::SessionCustomizationUpdated(a) => {
            let list = state.customizations.get_or_insert_with(Vec::new);
            let action_id = customization_id(&a.customization);
            let Some(action_id) = action_id else {
                // Unknown variant — no id to match on.
                return ReduceOutcome::NoOp;
            };
            if let Some(idx) = list
                .iter()
                .position(|c| customization_id(c) == Some(action_id))
            {
                list[idx] = a.customization.clone();
            } else {
                list.push(a.customization.clone());
            }
            ReduceOutcome::Applied
        }
        StateAction::SessionCustomizationRemoved(a) => {
            let Some(list) = state.customizations.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            // Try to remove a top-level container.
            if let Some(idx) = list
                .iter()
                .position(|c| customization_id(c) == Some(a.id.as_str()))
            {
                list.remove(idx);
                return ReduceOutcome::Applied;
            }
            // Otherwise look for a child to remove.
            for container in list.iter_mut() {
                if let Some(children) = container_children_mut(container) {
                    if let Some(idx) = children
                        .iter()
                        .position(|c| child_id_of(c) == Some(a.id.as_str()))
                    {
                        children.remove(idx);
                        return ReduceOutcome::Applied;
                    }
                }
            }
            ReduceOutcome::NoOp
        }
        StateAction::SessionMcpServerStateChanged(a) => {
            let Some(list) = state.customizations.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if let Some(idx) = list
                .iter()
                .position(|c| customization_id(c) == Some(a.id.as_str()))
            {
                match &mut list[idx] {
                    Customization::McpServer(m) => {
                        m.state = a.state.clone();
                        m.channel = a.channel.clone();
                        return ReduceOutcome::Applied;
                    }
                    // Top-level entry exists but isn't an MCP server: no-op.
                    _ => return ReduceOutcome::NoOp,
                }
            }
            for container in list.iter_mut() {
                let Some(children) = container_children_mut(container) else {
                    continue;
                };
                if let Some(idx) = children
                    .iter()
                    .position(|c| child_id_of(c) == Some(a.id.as_str()))
                {
                    if let ChildCustomization::McpServer(m) = &mut children[idx] {
                        m.state = a.state.clone();
                        m.channel = a.channel.clone();
                        return ReduceOutcome::Applied;
                    }
                    return ReduceOutcome::NoOp;
                }
            }
            ReduceOutcome::NoOp
        }
        _ => ReduceOutcome::OutOfScope,
    }
}

// ─── Chat Reducer ─────────────────────────────────────────────────────

/// Apply a [`StateAction`] to a [`ChatState`] in place.
///
/// Handles all chat-scoped actions — turn lifecycle, tool calls, input
/// requests, and pending/queued messages. Actions targeting a different
/// scope short-circuit as [`ReduceOutcome::OutOfScope`].
pub fn apply_action_to_chat(state: &mut ChatState, action: &StateAction) -> ReduceOutcome {
    match action {
        StateAction::ChatTurnStarted(a) => apply_turn_started(state, a),
        StateAction::ChatDelta(a) => update_response_part(state, &a.turn_id, &a.part_id, |p| {
            if let ResponsePart::Markdown(m) = p {
                m.content.push_str(&a.content);
            }
        }),
        StateAction::ChatResponsePart(a) => {
            let Some(active) = state.active_turn.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if active.id != a.turn_id {
                return ReduceOutcome::NoOp;
            }
            active.response_parts.push(a.part.clone());
            ReduceOutcome::Applied
        }
        StateAction::ChatTurnComplete(a) => {
            end_turn(state, &a.turn_id, TurnState::Complete, None, None)
        }
        StateAction::ChatTurnCancelled(a) => {
            end_turn(state, &a.turn_id, TurnState::Cancelled, None, None)
        }
        StateAction::ChatError(a) => end_turn(
            state,
            &a.turn_id,
            TurnState::Error,
            Some(SessionStatus::Error),
            Some(a.error.clone()),
        ),
        StateAction::ChatToolCallStart(a) => {
            let Some(active) = state.active_turn.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if active.id != a.turn_id {
                return ReduceOutcome::NoOp;
            }
            active
                .response_parts
                .push(ResponsePart::ToolCall(Box::new(ToolCallResponsePart {
                    tool_call: ToolCallState::Streaming(ToolCallStreamingState {
                        tool_call_id: a.tool_call_id.clone(),
                        tool_name: a.tool_name.clone(),
                        display_name: a.display_name.clone(),
                        contributor: a.contributor.clone(),
                        meta: a.meta.clone(),
                        partial_input: None,
                        invocation_message: None,
                    }),
                })));
            ReduceOutcome::Applied
        }
        StateAction::ChatToolCallDelta(a) => apply_tool_call_delta(state, a),
        StateAction::ChatToolCallReady(a) => {
            let res = apply_tool_call_ready(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::ChatToolCallConfirmed(a) => {
            let res = apply_tool_call_confirmed(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::ChatToolCallComplete(a) => {
            let res = apply_tool_call_complete(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::ChatToolCallResultConfirmed(a) => {
            let res = apply_tool_call_result_confirmed(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::ChatToolCallContentChanged(a) => apply_tool_call_content_changed(state, a),
        StateAction::ChatUsage(a) => {
            let Some(active) = state.active_turn.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if active.id != a.turn_id {
                return ReduceOutcome::NoOp;
            }
            active.usage = Some(a.usage.clone());
            ReduceOutcome::Applied
        }
        StateAction::ChatReasoning(a) => update_response_part(state, &a.turn_id, &a.part_id, |p| {
            if let ResponsePart::Reasoning(r) = p {
                r.content.push_str(&a.content);
            }
        }),
        StateAction::ChatTruncated(a) => apply_truncated(state, a.turn_id.as_deref()),
        StateAction::ChatInputRequested(a) => {
            upsert_input_request(state, a.request.clone());
            ReduceOutcome::Applied
        }
        StateAction::ChatInputAnswerChanged(a) => apply_input_answer_changed(state, a),
        StateAction::ChatInputCompleted(a) => {
            let Some(list) = state.input_requests.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            let had = list.iter().any(|r| r.id == a.request_id);
            if !had {
                return ReduceOutcome::NoOp;
            }
            list.retain(|r| r.id != a.request_id);
            if list.is_empty() {
                state.input_requests = None;
            }
            refresh_summary_status(state);
            touch_chat_modified(state);
            ReduceOutcome::Applied
        }
        StateAction::ChatPendingMessageSet(a) => {
            let entry = PendingMessage {
                id: a.id.clone(),
                message: a.message.clone(),
            };
            match a.kind {
                PendingMessageKind::Steering => {
                    state.steering_message = Some(entry);
                }
                PendingMessageKind::Queued => {
                    let list = state.queued_messages.get_or_insert_with(Vec::new);
                    if let Some(idx) = list.iter().position(|m| m.id == entry.id) {
                        list[idx] = entry;
                    } else {
                        list.push(entry);
                    }
                }
            }
            ReduceOutcome::Applied
        }
        StateAction::ChatPendingMessageRemoved(a) => match a.kind {
            PendingMessageKind::Steering => match &state.steering_message {
                Some(m) if m.id == a.id => {
                    state.steering_message = None;
                    ReduceOutcome::Applied
                }
                _ => ReduceOutcome::NoOp,
            },
            PendingMessageKind::Queued => {
                let Some(list) = state.queued_messages.as_mut() else {
                    return ReduceOutcome::NoOp;
                };
                let before = list.len();
                list.retain(|m| m.id != a.id);
                if list.len() == before {
                    return ReduceOutcome::NoOp;
                }
                if list.is_empty() {
                    state.queued_messages = None;
                }
                ReduceOutcome::Applied
            }
        },
        StateAction::ChatQueuedMessagesReordered(a) => {
            let Some(list) = state.queued_messages.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            let mut by_id: HashMap<String, PendingMessage> =
                list.drain(..).map(|m| (m.id.clone(), m)).collect();
            let mut reordered: Vec<PendingMessage> = Vec::with_capacity(by_id.len());
            let mut seen: std::collections::HashSet<String> = Default::default();
            for id in &a.order {
                if let Some(msg) = by_id.remove(id) {
                    if seen.insert(id.clone()) {
                        reordered.push(msg);
                    }
                }
            }
            // Append any remaining messages in their original iteration order.
            let mut leftover: Vec<PendingMessage> = by_id.into_values().collect();
            leftover.sort_by(|a, b| a.id.cmp(&b.id));
            reordered.extend(leftover);
            *list = reordered;
            ReduceOutcome::Applied
        }
        _ => ReduceOutcome::OutOfScope,
    }
}

fn apply_turn_started(state: &mut ChatState, a: &ChatTurnStartedAction) -> ReduceOutcome {
    state.active_turn = Some(ActiveTurn {
        id: a.turn_id.clone(),
        message: a.message.clone(),
        response_parts: Vec::new(),
        usage: None,
    });
    state.status = summary_status(state, None);
    touch_chat_modified(state);
    state.status = with_status_flag(state.status, SessionStatus::IsRead, false);

    if let Some(qmid) = &a.queued_message_id {
        if state.steering_message.as_ref().map(|m| m.id.as_str()) == Some(qmid.as_str()) {
            state.steering_message = None;
        }
        if let Some(list) = state.queued_messages.as_mut() {
            list.retain(|m| m.id != *qmid);
            if list.is_empty() {
                state.queued_messages = None;
            }
        }
    }
    ReduceOutcome::Applied
}

fn apply_tool_call_delta(state: &mut ChatState, a: &ChatToolCallDeltaAction) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| match tc {
        ToolCallState::Streaming(mut s) => {
            let current = s.partial_input.unwrap_or_default();
            s.partial_input = Some(current + &a.content);
            if let Some(meta) = &a.meta {
                s.meta = Some(meta.clone());
            }
            if let Some(im) = &a.invocation_message {
                s.invocation_message = Some(im.clone());
            }
            ToolCallState::Streaming(s)
        }
        other => other,
    })
}

fn apply_tool_call_ready(state: &mut ChatState, a: &ChatToolCallReadyAction) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let (tool_call_id, tool_name, display_name, contributor, meta) = tool_call_meta(&tc);
        let meta = a.meta.clone().or(meta);
        match tc {
            ToolCallState::Streaming(_) | ToolCallState::Running(_) => {
                if let Some(confirmed) = a.confirmed {
                    ToolCallState::Running(ToolCallRunningState {
                        tool_call_id,
                        tool_name,
                        display_name,
                        contributor,
                        meta,
                        invocation_message: a.invocation_message.clone(),
                        tool_input: a.tool_input.clone(),
                        confirmed,
                        selected_option: None,
                        content: None,
                    })
                } else {
                    ToolCallState::PendingConfirmation(ToolCallPendingConfirmationState {
                        tool_call_id,
                        tool_name,
                        display_name,
                        contributor,
                        meta,
                        invocation_message: a.invocation_message.clone(),
                        tool_input: a.tool_input.clone(),
                        confirmation_title: a.confirmation_title.clone(),
                        edits: a.edits.clone(),
                        editable: a.editable,
                        options: a.options.clone(),
                    })
                }
            }
            other => other,
        }
    })
}

fn resolve_selected_option(
    options: Option<&[ConfirmationOption]>,
    id: Option<&str>,
) -> Option<ConfirmationOption> {
    let id = id?;
    let opts = options?;
    opts.iter().find(|o| o.id == id).cloned()
}

fn apply_tool_call_confirmed(
    state: &mut ChatState,
    a: &ChatToolCallConfirmedAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let ToolCallState::PendingConfirmation(s) = tc else {
            return tc;
        };
        let selected_option =
            resolve_selected_option(s.options.as_deref(), a.selected_option_id.as_deref());
        let tool_call_id = s.tool_call_id;
        let tool_name = s.tool_name;
        let display_name = s.display_name;
        let contributor = s.contributor;
        let meta = a.meta.clone().or(s.meta);
        let invocation_message = s.invocation_message;
        let tool_input = s.tool_input;
        if a.approved {
            ToolCallState::Running(ToolCallRunningState {
                tool_call_id,
                tool_name,
                display_name,
                contributor,
                meta,
                invocation_message,
                tool_input: a.edited_tool_input.clone().or(tool_input),
                confirmed: a.confirmed.unwrap_or(ToolCallConfirmationReason::NotNeeded),
                selected_option,
                content: None,
            })
        } else {
            ToolCallState::Cancelled(ToolCallCancelledState {
                tool_call_id,
                tool_name,
                display_name,
                contributor,
                meta,
                invocation_message,
                tool_input,
                reason: a.reason.unwrap_or(ToolCallCancellationReason::Denied),
                reason_message: a.reason_message.clone(),
                user_suggestion: a.user_suggestion.clone(),
                selected_option,
            })
        }
    })
}

fn apply_tool_call_complete(
    state: &mut ChatState,
    a: &ChatToolCallCompleteAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let (tool_call_id, tool_name, display_name, contributor, meta) = tool_call_meta(&tc);
        let meta = a.meta.clone().or(meta);
        let (invocation_message, tool_input, confirmed, selected_option) = match tc {
            ToolCallState::Running(s) => (
                s.invocation_message,
                s.tool_input,
                s.confirmed,
                s.selected_option,
            ),
            ToolCallState::PendingConfirmation(s) => (
                s.invocation_message,
                s.tool_input,
                ToolCallConfirmationReason::NotNeeded,
                None,
            ),
            other => return other,
        };
        if a.requires_result_confirmation.unwrap_or(false) {
            ToolCallState::PendingResultConfirmation(ToolCallPendingResultConfirmationState {
                tool_call_id,
                tool_name,
                display_name,
                contributor,
                meta,
                invocation_message,
                tool_input,
                success: a.result.success,
                past_tense_message: a.result.past_tense_message.clone(),
                content: a.result.content.clone(),
                structured_content: a.result.structured_content.clone(),
                error: a.result.error.clone(),
                confirmed,
                selected_option,
            })
        } else {
            ToolCallState::Completed(ToolCallCompletedState {
                tool_call_id,
                tool_name,
                display_name,
                contributor,
                meta,
                invocation_message,
                tool_input,
                success: a.result.success,
                past_tense_message: a.result.past_tense_message.clone(),
                content: a.result.content.clone(),
                structured_content: a.result.structured_content.clone(),
                error: a.result.error.clone(),
                confirmed,
                selected_option,
            })
        }
    })
}

fn apply_tool_call_result_confirmed(
    state: &mut ChatState,
    a: &ChatToolCallResultConfirmedAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let ToolCallState::PendingResultConfirmation(s) = tc else {
            return tc;
        };
        if a.approved {
            ToolCallState::Completed(ToolCallCompletedState {
                tool_call_id: s.tool_call_id,
                tool_name: s.tool_name,
                display_name: s.display_name,
                contributor: s.contributor,
                meta: a.meta.clone().or(s.meta),
                invocation_message: s.invocation_message,
                tool_input: s.tool_input,
                success: s.success,
                past_tense_message: s.past_tense_message,
                content: s.content,
                structured_content: s.structured_content,
                error: s.error,
                confirmed: s.confirmed,
                selected_option: s.selected_option,
            })
        } else {
            ToolCallState::Cancelled(ToolCallCancelledState {
                tool_call_id: s.tool_call_id,
                tool_name: s.tool_name,
                display_name: s.display_name,
                contributor: s.contributor,
                meta: a.meta.clone().or(s.meta),
                invocation_message: s.invocation_message,
                tool_input: s.tool_input,
                reason: ToolCallCancellationReason::ResultDenied,
                reason_message: None,
                user_suggestion: None,
                selected_option: s.selected_option,
            })
        }
    })
}

fn apply_tool_call_content_changed(
    state: &mut ChatState,
    a: &ChatToolCallContentChangedAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| match tc {
        ToolCallState::Running(mut s) => {
            if let Some(meta) = &a.meta {
                s.meta = Some(meta.clone());
            }
            s.content = Some(a.content.clone());
            ToolCallState::Running(s)
        }
        other => other,
    })
}

fn apply_truncated(state: &mut ChatState, turn_id: Option<&str>) -> ReduceOutcome {
    match turn_id {
        None => {
            state.turns.clear();
        }
        Some(id) => {
            let Some(idx) = state.turns.iter().position(|t| t.id == id) else {
                return ReduceOutcome::NoOp;
            };
            state.turns.truncate(idx + 1);
        }
    }
    state.active_turn = None;
    state.input_requests = None;
    touch_chat_modified(state);
    state.status = summary_status(state, None);
    ReduceOutcome::Applied
}

fn apply_input_answer_changed(
    state: &mut ChatState,
    a: &ChatInputAnswerChangedAction,
) -> ReduceOutcome {
    let Some(list) = state.input_requests.as_mut() else {
        return ReduceOutcome::NoOp;
    };
    let Some(idx) = list.iter().position(|r| r.id == a.request_id) else {
        return ReduceOutcome::NoOp;
    };
    let req = &mut list[idx];
    let answers = req.answers.get_or_insert_with(HashMap::new);
    match &a.answer {
        None => {
            answers.remove(&a.question_id);
        }
        Some(ans) => {
            answers.insert(a.question_id.clone(), ans.clone());
        }
    }
    if answers.is_empty() {
        req.answers = None;
    }
    touch_chat_modified(state);
    ReduceOutcome::Applied
}

// ─── Terminal Reducer ─────────────────────────────────────────────────

/// Apply a [`StateAction`] to a [`TerminalState`] in place.
pub fn apply_action_to_terminal(state: &mut TerminalState, action: &StateAction) -> ReduceOutcome {
    match action {
        StateAction::TerminalData(a) => {
            let tail = state.content.last_mut();
            match tail {
                Some(TerminalContentPart::Command(c)) if !c.is_complete => {
                    c.output.push_str(&a.data);
                }
                Some(TerminalContentPart::Unclassified(u)) => {
                    u.value.push_str(&a.data);
                }
                _ => {
                    state.content.push(TerminalContentPart::Unclassified(
                        TerminalUnclassifiedPart {
                            value: a.data.clone(),
                        },
                    ));
                }
            }
            ReduceOutcome::Applied
        }
        StateAction::TerminalInput(_) => ReduceOutcome::NoOp,
        StateAction::TerminalResized(a) => {
            state.cols = Some(a.cols);
            state.rows = Some(a.rows);
            ReduceOutcome::Applied
        }
        StateAction::TerminalClaimed(a) => {
            state.claim = a.claim.clone();
            ReduceOutcome::Applied
        }
        StateAction::TerminalTitleChanged(a) => {
            state.title = a.title.clone();
            ReduceOutcome::Applied
        }
        StateAction::TerminalCwdChanged(a) => {
            state.cwd = Some(a.cwd.clone());
            ReduceOutcome::Applied
        }
        StateAction::TerminalExited(a) => {
            state.exit_code = a.exit_code;
            ReduceOutcome::Applied
        }
        StateAction::TerminalCleared(_) => {
            state.content.clear();
            ReduceOutcome::Applied
        }
        StateAction::TerminalCommandDetectionAvailable(_) => {
            state.supports_command_detection = Some(true);
            ReduceOutcome::Applied
        }
        StateAction::TerminalCommandExecuted(a) => {
            state
                .content
                .push(TerminalContentPart::Command(TerminalCommandPart {
                    command_id: a.command_id.clone(),
                    command_line: a.command_line.clone(),
                    output: String::new(),
                    timestamp: a.timestamp,
                    is_complete: false,
                    exit_code: None,
                    duration_ms: None,
                }));
            state.supports_command_detection = Some(true);
            ReduceOutcome::Applied
        }
        StateAction::TerminalCommandFinished(a) => {
            for part in state.content.iter_mut() {
                if let TerminalContentPart::Command(c) = part {
                    if c.command_id == a.command_id {
                        c.is_complete = true;
                        c.exit_code = a.exit_code;
                        c.duration_ms = a.duration_ms;
                        return ReduceOutcome::Applied;
                    }
                }
            }
            ReduceOutcome::NoOp
        }
        _ => ReduceOutcome::OutOfScope,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ahp_types::state::{ChatSummary, MarkdownResponsePart, Message, SessionSummary};

    fn user_message(text: &str) -> Message {
        Message {
            text: text.into(),
            origin: serde_json::json!({ "kind": "user" }),
            attachments: None,
            meta: None,
        }
    }

    fn empty_session(resource: &str) -> SessionState {
        SessionState {
            summary: SessionSummary {
                resource: resource.to_string(),
                provider: "test".to_string(),
                title: String::new(),
                status: SessionStatus::Idle.bits(),
                activity: None,
                created_at: 0,
                modified_at: 0,
                project: None,
                model: None,
                agent: None,
                working_directory: None,
                changes: None,
                annotations: None,
            },
            lifecycle: SessionLifecycle::Creating,
            creation_error: None,
            server_tools: None,
            active_client: None,
            chats: Vec::new(),
            default_chat: None,
            config: None,
            customizations: None,
            changesets: None,
            meta: None,
        }
    }

    fn empty_chat(resource: &str) -> ChatState {
        ChatState {
            resource: resource.to_string(),
            title: String::new(),
            status: SessionStatus::Idle.bits(),
            activity: None,
            modified_at: "1970-01-01T00:00:00.000Z".into(),
            model: None,
            agent: None,
            origin: None,
            interactivity: None,
            working_directory: None,
            turns: Vec::new(),
            active_turn: None,
            steering_message: None,
            queued_messages: None,
            input_requests: None,
            meta: None,
        }
    }

    #[test]
    fn turn_started_creates_active_turn_and_sets_in_progress() {
        let mut s = empty_chat("copilot:/s1/chat/1");
        let action = StateAction::ChatTurnStarted(ChatTurnStartedAction {
            turn_id: "t1".into(),
            message: user_message("hi"),
            queued_message_id: None,
        });
        assert_eq!(
            apply_action_to_chat(&mut s, &action),
            ReduceOutcome::Applied
        );
        assert_eq!(s.status, SessionStatus::InProgress.bits());
        assert_eq!(s.active_turn.unwrap().id, "t1");
    }

    #[test]
    fn delta_appends_to_markdown_part() {
        let mut s = empty_chat("copilot:/s1/chat/1");
        s.active_turn = Some(ActiveTurn {
            id: "t1".into(),
            message: user_message("hi"),
            response_parts: vec![ResponsePart::Markdown(MarkdownResponsePart {
                id: "p1".into(),
                content: "Hello".into(),
            })],
            usage: None,
        });
        let a = StateAction::ChatDelta(ahp_types::actions::ChatDeltaAction {
            turn_id: "t1".into(),
            part_id: "p1".into(),
            content: ", world".into(),
        });
        assert_eq!(apply_action_to_chat(&mut s, &a), ReduceOutcome::Applied);
        match &s.active_turn.unwrap().response_parts[0] {
            ResponsePart::Markdown(m) => assert_eq!(m.content, "Hello, world"),
            _ => panic!(),
        }
    }

    #[test]
    fn turn_complete_moves_active_to_turns_and_returns_idle() {
        let mut s = empty_chat("copilot:/s1/chat/1");
        s.active_turn = Some(ActiveTurn {
            id: "t1".into(),
            message: user_message("hi"),
            response_parts: Vec::new(),
            usage: None,
        });
        s.status = SessionStatus::InProgress.bits();
        let a = StateAction::ChatTurnComplete(ahp_types::actions::ChatTurnCompleteAction {
            turn_id: "t1".into(),
        });
        assert_eq!(apply_action_to_chat(&mut s, &a), ReduceOutcome::Applied);
        assert!(s.active_turn.is_none());
        assert_eq!(s.turns.len(), 1);
        assert_eq!(s.turns[0].state, TurnState::Complete);
        assert_eq!(s.status, SessionStatus::Idle.bits());
    }

    #[test]
    fn session_reducer_handles_ready_and_chat_catalog_actions() {
        let mut s = empty_session("copilot:/s1");
        let ready = StateAction::SessionReady(ahp_types::actions::SessionReadyAction {});
        assert_eq!(
            apply_action_to_session(&mut s, &ready),
            ReduceOutcome::Applied
        );
        assert_eq!(s.lifecycle, SessionLifecycle::Ready);

        let chat = ChatSummary {
            resource: "copilot:/s1/chat/1".into(),
            title: "c1".into(),
            status: SessionStatus::Idle.bits(),
            activity: None,
            modified_at: "1970-01-01T00:00:00.000Z".into(),
            model: None,
            agent: None,
            origin: None,
            interactivity: None,
            working_directory: None,
        };
        let added = StateAction::SessionChatAdded(ahp_types::actions::SessionChatAddedAction {
            summary: chat.clone(),
        });
        assert_eq!(
            apply_action_to_session(&mut s, &added),
            ReduceOutcome::Applied
        );
        assert_eq!(s.chats, vec![chat.clone()]);

        let updated =
            StateAction::SessionChatUpdated(ahp_types::actions::SessionChatUpdatedAction {
                chat: chat.resource.clone(),
                changes: ahp_types::actions::PartialChatSummary {
                    title: Some("renamed".into()),
                    modified_at: Some("1970-01-01T00:00:09.999Z".into()),
                    ..Default::default()
                },
            });
        assert_eq!(
            apply_action_to_session(&mut s, &updated),
            ReduceOutcome::Applied
        );
        assert_eq!(s.chats[0].title, "renamed");
        assert_eq!(s.chats[0].modified_at, "1970-01-01T00:00:09.999Z");

        s.default_chat = Some(chat.resource.clone());
        let removed =
            StateAction::SessionChatRemoved(ahp_types::actions::SessionChatRemovedAction {
                chat: chat.resource.clone(),
            });
        assert_eq!(
            apply_action_to_session(&mut s, &removed),
            ReduceOutcome::Applied
        );
        assert!(s.chats.is_empty());
        assert!(s.default_chat.is_none());

        // A chat-scoped action is out of scope for the session reducer.
        let turn = StateAction::ChatTurnComplete(ahp_types::actions::ChatTurnCompleteAction {
            turn_id: "t1".into(),
        });
        assert_eq!(
            apply_action_to_session(&mut s, &turn),
            ReduceOutcome::OutOfScope
        );
    }

    #[test]
    fn root_reducer_handles_agents_changed() {
        let mut r = RootState {
            agents: Vec::new(),
            active_sessions: None,
            terminals: None,
            config: None,
            meta: None,
        };
        let a = StateAction::RootActiveSessionsChanged(
            ahp_types::actions::RootActiveSessionsChangedAction { active_sessions: 3 },
        );
        assert_eq!(apply_action_to_root(&mut r, &a), ReduceOutcome::Applied);
        assert_eq!(r.active_sessions, Some(3));
    }

    #[test]
    fn terminal_data_appends_to_unclassified_tail() {
        let mut t = TerminalState {
            title: "t".into(),
            cwd: None,
            cols: None,
            rows: None,
            content: Vec::new(),
            exit_code: None,
            claim: ahp_types::state::TerminalClaim::Session(
                ahp_types::state::TerminalSessionClaim {
                    session: "session:/s1".into(),
                    turn_id: None,
                    tool_call_id: None,
                },
            ),
            supports_command_detection: None,
        };
        let a = StateAction::TerminalData(ahp_types::actions::TerminalDataAction {
            data: "hello".into(),
        });
        apply_action_to_terminal(&mut t, &a);
        let a2 = StateAction::TerminalData(ahp_types::actions::TerminalDataAction {
            data: " world".into(),
        });
        apply_action_to_terminal(&mut t, &a2);
        assert_eq!(t.content.len(), 1);
        match &t.content[0] {
            TerminalContentPart::Unclassified(u) => assert_eq!(u.value, "hello world"),
            _ => panic!(),
        }
    }

    // ─── Fixture-Driven Tests ─────────────────────────────────────────

    /// Recursively strip JSON `null` values from objects so that absent
    /// optional fields (which Rust omits via `skip_serializing_if`) match
    /// the fixture expectations that spell them out as `null`.
    fn strip_nulls(v: serde_json::Value) -> serde_json::Value {
        match v {
            serde_json::Value::Object(map) => {
                let cleaned: serde_json::Map<String, serde_json::Value> = map
                    .into_iter()
                    .filter(|(_, v)| !v.is_null())
                    .map(|(k, v)| (k, strip_nulls(v)))
                    .collect();
                serde_json::Value::Object(cleaned)
            }
            serde_json::Value::Array(arr) => {
                serde_json::Value::Array(arr.into_iter().map(strip_nulls).collect())
            }
            other => other,
        }
    }

    const MOCK_NOW: i64 = 9999;

    fn set_mock_time() {
        MOCK_NOW_MS.with(|c| c.set(Some(MOCK_NOW)));
    }

    fn clear_mock_time() {
        MOCK_NOW_MS.with(|c| c.set(None));
    }

    /// Load all JSON fixtures from `types/test-cases/reducers/` and run
    /// each one through the appropriate Rust reducer, asserting that the
    /// resulting state matches the expected output.
    ///
    /// This mirrors the TypeScript fixture runner in `types/reducers.test.ts`
    /// and ensures cross-language parity for every shared test case.
    #[test]
    fn json_fixture_tests() {
        // Navigate from crates/ahp up to the repo root's types/test-cases/reducers
        let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let fixture_dir = manifest
            .parent() // crates/
            .unwrap()
            .parent() // rust/
            .unwrap()
            .parent() // examples/
            .unwrap()
            .parent() // repo root
            .unwrap()
            .join("types")
            .join("test-cases")
            .join("reducers");

        assert!(
            fixture_dir.is_dir(),
            "Fixture directory not found: {}",
            fixture_dir.display()
        );

        let mut entries: Vec<_> = std::fs::read_dir(&fixture_dir)
            .expect("failed to read fixture dir")
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "json")
                    .unwrap_or(false)
            })
            .collect();
        entries.sort_by_key(|e| e.file_name());

        assert!(!entries.is_empty(), "no fixture files found");

        let mut passed = 0usize;
        let mut skipped = 0usize;

        set_mock_time();

        for entry in &entries {
            let path = entry.path();
            let file_name = path.file_name().unwrap().to_string_lossy().to_string();
            let raw: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(&path)
                    .unwrap_or_else(|e| panic!("{file_name}: read error: {e}")),
            )
            .unwrap_or_else(|e| panic!("{file_name}: JSON parse error: {e}"));

            let description = raw["description"].as_str().unwrap_or(&file_name);
            let reducer = raw["reducer"].as_str().unwrap_or("unknown");
            let initial = raw["initial"].clone();
            let actions = raw["actions"].as_array().expect("actions must be an array");
            let expected = raw["expected"].clone();

            let parsed_actions: Vec<StateAction> = actions
                .iter()
                .map(|v| {
                    serde_json::from_value::<StateAction>(v.clone()).unwrap_or_else(|e| {
                        panic!("{file_name} ({description}): failed to deserialize action: {e}")
                    })
                })
                .collect();

            /// Deserialize initial state, apply actions, compare result.
            /// Also checks that initial state round-trips through Rust types,
            /// catching any data loss from the generated de/serializers.
            fn run_fixture<S>(
                initial: serde_json::Value,
                expected: serde_json::Value,
                actions: &[StateAction],
                apply: fn(&mut S, &StateAction) -> ReduceOutcome,
                file_name: &str,
                description: &str,
            ) where
                S: serde::de::DeserializeOwned + serde::Serialize,
            {
                let state: S = serde_json::from_value(initial.clone()).unwrap_or_else(|e| {
                    panic!("{file_name} ({description}): failed to deserialize initial state: {e}")
                });
                // Verify the initial state round-trips. If this fails, either the
                // fixture data is wrong or the Rust types are dropping fields.
                let rt = strip_nulls(serde_json::to_value(&state).unwrap());
                let initial_normalized = strip_nulls(initial);
                assert_eq!(
                    rt, initial_normalized,
                    "\n=== ROUND-TRIP FAILED: {file_name} ({description}) ===\nre-serialized: {}\noriginal:      {}",
                    serde_json::to_string_pretty(&rt).unwrap(),
                    serde_json::to_string_pretty(&initial_normalized).unwrap(),
                );
                let mut state = state;
                for action in actions {
                    apply(&mut state, action);
                }
                let actual = strip_nulls(serde_json::to_value(&state).unwrap());
                let expected = strip_nulls(expected);
                assert_eq!(
                    actual, expected,
                    "\n=== FIXTURE FAILED: {file_name} ({description}) ===\nactual:   {}\nexpected: {}",
                    serde_json::to_string_pretty(&actual).unwrap(),
                    serde_json::to_string_pretty(&expected).unwrap(),
                );
            }

            match reducer {
                "root" => run_fixture::<RootState>(
                    initial,
                    expected,
                    &parsed_actions,
                    apply_action_to_root,
                    &file_name,
                    description,
                ),
                "session" => run_fixture::<SessionState>(
                    initial,
                    expected,
                    &parsed_actions,
                    apply_action_to_session,
                    &file_name,
                    description,
                ),
                "chat" => run_fixture::<ChatState>(
                    initial,
                    expected,
                    &parsed_actions,
                    apply_action_to_chat,
                    &file_name,
                    description,
                ),
                "terminal" => run_fixture::<TerminalState>(
                    initial,
                    expected,
                    &parsed_actions,
                    apply_action_to_terminal,
                    &file_name,
                    description,
                ),
                "changeset" => {
                    // changeset reducer not yet implemented in Rust; skip.
                    skipped += 1;
                    continue;
                }
                "annotations" => {
                    // annotations reducer not yet implemented in Rust; skip.
                    skipped += 1;
                    continue;
                }
                "resourceWatch" => {
                    // resourceWatch reducer not yet implemented in Rust; skip.
                    skipped += 1;
                    continue;
                }
                other => {
                    panic!("{file_name}: unknown reducer type '{other}'");
                }
            }

            passed += 1;
        }

        clear_mock_time();

        eprintln!(
            "Fixture results: {passed} passed, {skipped} skipped, {} total",
            entries.len()
        );
        assert_eq!(
            passed + skipped,
            entries.len(),
            "Expected all {} fixtures to pass or be skipped, but only {passed} passed and {skipped} skipped",
            entries.len(),
        );
    }
}
