//! Pure state reducers ported from `types/reducers.ts`.
//!
//! Reducers mutate state in place and return a [`ReduceOutcome`]. Use
//! [`apply_action_to_root`], [`apply_action_to_session`],
//! [`apply_action_to_chat`], [`apply_action_to_terminal`],
//! [`apply_action_to_changeset`], [`apply_action_to_annotations`], and
//! [`apply_action_to_resource_watch`] to dispatch any [`StateAction`]
//! against the matching scope; unrelated actions short-circuit as
//! [`ReduceOutcome::OutOfScope`] so a client holding every state tree can
//! blindly fan each action out.
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

use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use ahp_types::actions::{
    ChatInputAnswerChangedAction, ChatToolCallAuthRequiredAction, ChatToolCallAuthResolvedAction,
    ChatToolCallCompleteAction, ChatToolCallConfirmedAction, ChatToolCallContentChangedAction,
    ChatToolCallDeltaAction, ChatToolCallReadyAction, ChatToolCallResultConfirmedAction,
    ChatTurnStartedAction, StateAction,
};
use ahp_types::state::{
    ActiveTurn, AnnotationsState, ChangesetOperationStatus, ChangesetState, ChangesetStatus,
    ChatInputRequest, ChatState, ChildCustomization, ConfirmationOption, Customization, ErrorInfo,
    InputRequestResponsePart, McpServerStartingState, McpServerState, McpServerStoppedState,
    PendingMessage, PendingMessageKind, ResourceWatchState, ResponsePart, RootState,
    SessionInputRequest, SessionLifecycle, SessionState, SessionStatus, TerminalCommandPart,
    TerminalContentPart, TerminalState, TerminalUnclassifiedPart, ToolCallAuthRequiredState,
    ToolCallCancellationReason, ToolCallCancelledState, ToolCallCompletedState,
    ToolCallConfirmationReason, ToolCallContributor, ToolCallPendingConfirmationState,
    ToolCallPendingResultConfirmationState, ToolCallResponsePart, ToolCallRunningState,
    ToolCallState, ToolCallStatus, ToolCallStreamingState, Turn, TurnState,
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

struct ToolCallBase {
    tool_call_id: String,
    tool_name: String,
    display_name: String,
    intention: Option<String>,
    contributor: Option<ToolCallContributor>,
    meta: Option<serde_json::Map<String, serde_json::Value>>,
}

fn tool_call_meta(tc: &ToolCallState) -> ToolCallBase {
    match tc {
        ToolCallState::Streaming(s) => ToolCallBase {
            tool_call_id: s.tool_call_id.clone(),
            tool_name: s.tool_name.clone(),
            display_name: s.display_name.clone(),
            intention: s.intention.clone(),
            contributor: s.contributor.clone(),
            meta: s.meta.clone(),
        },
        ToolCallState::PendingConfirmation(s) => ToolCallBase {
            tool_call_id: s.tool_call_id.clone(),
            tool_name: s.tool_name.clone(),
            display_name: s.display_name.clone(),
            intention: s.intention.clone(),
            contributor: s.contributor.clone(),
            meta: s.meta.clone(),
        },
        ToolCallState::Running(s) => ToolCallBase {
            tool_call_id: s.tool_call_id.clone(),
            tool_name: s.tool_name.clone(),
            display_name: s.display_name.clone(),
            intention: s.intention.clone(),
            contributor: s.contributor.clone(),
            meta: s.meta.clone(),
        },
        ToolCallState::AuthRequired(s) => ToolCallBase {
            tool_call_id: s.tool_call_id.clone(),
            tool_name: s.tool_name.clone(),
            display_name: s.display_name.clone(),
            intention: s.intention.clone(),
            contributor: s.contributor.clone(),
            meta: s.meta.clone(),
        },
        ToolCallState::PendingResultConfirmation(s) => ToolCallBase {
            tool_call_id: s.tool_call_id.clone(),
            tool_name: s.tool_name.clone(),
            display_name: s.display_name.clone(),
            intention: s.intention.clone(),
            contributor: s.contributor.clone(),
            meta: s.meta.clone(),
        },
        ToolCallState::Completed(s) => ToolCallBase {
            tool_call_id: s.tool_call_id.clone(),
            tool_name: s.tool_name.clone(),
            display_name: s.display_name.clone(),
            intention: s.intention.clone(),
            contributor: s.contributor.clone(),
            meta: s.meta.clone(),
        },
        ToolCallState::Cancelled(s) => ToolCallBase {
            tool_call_id: s.tool_call_id.clone(),
            tool_name: s.tool_name.clone(),
            display_name: s.display_name.clone(),
            intention: s.intention.clone(),
            contributor: s.contributor.clone(),
            meta: s.meta.clone(),
        },
        ToolCallState::Unknown(_) => ToolCallBase {
            tool_call_id: String::new(),
            tool_name: String::new(),
            display_name: String::new(),
            intention: None,
            contributor: None,
            meta: None,
        },
    }
}

fn tool_call_id(tc: &ToolCallState) -> &str {
    match tc {
        ToolCallState::Streaming(s) => &s.tool_call_id,
        ToolCallState::PendingConfirmation(s) => &s.tool_call_id,
        ToolCallState::Running(s) => &s.tool_call_id,
        ToolCallState::AuthRequired(s) => &s.tool_call_id,
        ToolCallState::PendingResultConfirmation(s) => &s.tool_call_id,
        ToolCallState::Completed(s) => &s.tool_call_id,
        ToolCallState::Cancelled(s) => &s.tool_call_id,
        ToolCallState::Unknown(_) => "",
    }
}

fn has_blocking_tool_call(state: &ChatState) -> bool {
    let Some(active) = &state.active_turn else {
        return false;
    };
    active.response_parts.iter().any(|part| match part {
        ResponsePart::ToolCall(tc) => matches!(
            tc.tool_call,
            ToolCallState::PendingConfirmation(_)
                | ToolCallState::PendingResultConfirmation(_)
                | ToolCallState::AuthRequired(_)
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

/// Reflects the session-level input queue into the activity bits of `status`.
/// A non-empty queue promotes the activity to `InputNeeded`; emptying it clears
/// the input-needed-specific bit. Since `InputNeeded` implies `InProgress`, an
/// unblocked turn falls back to `InProgress` while an already-idle session stays
/// idle. Orthogonal flags (`IsRead` / `IsArchived`) are preserved.
fn with_input_needed_status(status: u32, input_needed: &[SessionInputRequest]) -> u32 {
    if input_needed.is_empty() {
        status & !(SessionStatus::InputNeeded.bits() & !SessionStatus::InProgress.bits())
    } else {
        (status & !STATUS_ACTIVITY_MASK) | SessionStatus::InputNeeded.bits()
    }
}

fn summary_status(state: &ChatState, terminal: Option<SessionStatus>) -> u32 {
    let activity: u32 = if let Some(t) = terminal {
        t.bits()
    } else if has_open_input_request(state) || has_blocking_tool_call(state) {
        SessionStatus::InputNeeded.bits()
    } else if state.active_turn.is_some() {
        SessionStatus::InProgress.bits()
    } else {
        SessionStatus::Idle.bits()
    };
    (state.status & !STATUS_ACTIVITY_MASK) | activity
}

fn has_open_input_request(state: &ChatState) -> bool {
    state
        .active_turn
        .as_ref()
        .map(|turn| {
            turn.response_parts.iter().any(|part| {
                matches!(part, ResponsePart::InputRequest(input) if input.response.is_none())
            })
        })
        .unwrap_or(false)
}

fn refresh_summary_status(state: &mut ChatState) {
    state.status = summary_status(state, None);
}

fn touch_chat_modified(state: &mut ChatState) {
    state.modified_at = now_iso();
}

fn end_turn(
    state: &mut ChatState,
    turn_id: &str,
    duration: i64,
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
                        let base = tool_call_meta(&tc);
                        let invocation_message = match &tc {
                            ToolCallState::Streaming(s) => {
                                s.invocation_message.clone().unwrap_or_default()
                            }
                            ToolCallState::PendingConfirmation(s) => s.invocation_message.clone(),
                            ToolCallState::Running(s) => s.invocation_message.clone(),
                            ToolCallState::AuthRequired(s) => s.invocation_message.clone(),
                            ToolCallState::PendingResultConfirmation(s) => {
                                s.invocation_message.clone()
                            }
                            _ => Default::default(),
                        };
                        let tool_input = match &tc {
                            ToolCallState::Streaming(_) => None,
                            ToolCallState::PendingConfirmation(s) => s.tool_input.clone(),
                            ToolCallState::Running(s) => s.tool_input.clone(),
                            ToolCallState::AuthRequired(s) => s.tool_input.clone(),
                            ToolCallState::PendingResultConfirmation(s) => s.tool_input.clone(),
                            _ => None,
                        };
                        let cancelled = ToolCallCancelledState {
                            tool_call_id: base.tool_call_id,
                            tool_name: base.tool_name,
                            display_name: base.display_name,
                            intention: base.intention,
                            contributor: base.contributor,
                            meta: base.meta,
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

    // Defensive clamp: `duration` is producer-supplied and opaque to this
    // reducer, but a negative value would be nonsensical to display.
    let turn = Turn {
        id: active.id,
        started_at: Some(active.started_at),
        duration: Some(duration.max(0)),
        message: active.message,
        response_parts,
        usage: active.usage,
        state: turn_state,
        error,
    };

    state.turns.push(turn);
    state.modified_at = now_iso();
    state.status = summary_status(state, terminal_status);
    ReduceOutcome::Applied
}

fn upsert_input_request(state: &mut ChatState, request: ChatInputRequest) -> ReduceOutcome {
    let Some(active) = state.active_turn.as_mut() else {
        return ReduceOutcome::NoOp;
    };
    if let Some(existing) = active
        .response_parts
        .iter_mut()
        .find_map(|part| match part {
            ResponsePart::InputRequest(input)
                if input.response.is_none() && input.request.id == request.id =>
            {
                Some(input)
            }
            _ => None,
        })
    {
        let answers = request
            .answers
            .clone()
            .or_else(|| existing.request.answers.clone());
        let mut next = request;
        next.answers = answers;
        existing.request = next;
        existing.response = None;
    } else {
        active
            .response_parts
            .push(ResponsePart::InputRequest(InputRequestResponsePart {
                request,
                response: None,
            }));
    }
    state.status = summary_status(state, None);
    touch_chat_modified(state);
    state.status = with_status_flag(state.status, SessionStatus::IsRead, false);
    ReduceOutcome::Applied
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

fn session_input_request_id(r: &SessionInputRequest) -> Option<&str> {
    match r {
        SessionInputRequest::ChatInput(x) => Some(x.id.as_str()),
        SessionInputRequest::ToolConfirmation(x) => Some(x.id.as_str()),
        SessionInputRequest::ToolClientExecution(x) => Some(x.id.as_str()),
        SessionInputRequest::ToolAuthentication(x) => Some(x.id.as_str()),
        SessionInputRequest::Unknown(v) => v.get("id").and_then(serde_json::Value::as_str),
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

fn set_child_enabled(c: &mut ChildCustomization, enabled: bool) {
    match c {
        ChildCustomization::Agent(x) => x.enabled = Some(enabled),
        ChildCustomization::Skill(x) => x.enabled = Some(enabled),
        ChildCustomization::Prompt(x) => x.enabled = Some(enabled),
        ChildCustomization::Rule(x) => x.enabled = Some(enabled),
        ChildCustomization::Hook(x) => x.enabled = Some(enabled),
        ChildCustomization::McpServer(x) => x.enabled = enabled,
        ChildCustomization::Unknown(_) => {}
    }
}

fn apply_toggle(list: &mut [Customization], id: &str, enabled: bool) -> bool {
    if let Some(container) = list.iter_mut().find(|c| customization_id(c) == Some(id)) {
        set_container_enabled(container, enabled);
        return true;
    }
    for container in list.iter_mut() {
        if let Some(children) = container_children_mut(container) {
            if let Some(child) = children.iter_mut().find(|c| child_id_of(c) == Some(id)) {
                set_child_enabled(child, enabled);
                return true;
            }
        }
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
                        intention: None,
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
            | ResponsePart::InputRequest(_)
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
            // Lifecycle-only transition. Must not touch `status`: see
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
            state.title = a.title.clone();
            ReduceOutcome::Applied
        }
        StateAction::SessionIsReadChanged(a) => {
            state.status = with_status_flag(state.status, SessionStatus::IsRead, a.is_read);
            ReduceOutcome::Applied
        }
        StateAction::SessionIsArchivedChanged(a) => {
            state.status = with_status_flag(state.status, SessionStatus::IsArchived, a.is_archived);
            ReduceOutcome::Applied
        }
        StateAction::SessionActivityChanged(a) => {
            state.activity = a.activity.clone();
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
        StateAction::SessionActiveClientSet(a) => {
            if let Some(idx) = state
                .active_clients
                .iter()
                .position(|client| client.client_id == a.active_client.client_id)
            {
                state.active_clients[idx] = a.active_client.clone();
            } else {
                state.active_clients.push(a.active_client.clone());
            }
            ReduceOutcome::Applied
        }
        StateAction::SessionActiveClientRemoved(a) => {
            let Some(idx) = state
                .active_clients
                .iter()
                .position(|client| client.client_id == a.client_id)
            else {
                return ReduceOutcome::NoOp;
            };
            state.active_clients.remove(idx);
            ReduceOutcome::Applied
        }
        StateAction::SessionInputNeededSet(a) => {
            let Some(action_id) = session_input_request_id(&a.request) else {
                return ReduceOutcome::NoOp;
            };
            let list = state.input_needed.get_or_insert_with(Vec::new);
            if let Some(idx) = list
                .iter()
                .position(|r| session_input_request_id(r) == Some(action_id))
            {
                list[idx] = a.request.clone();
            } else {
                list.push(a.request.clone());
            }
            let new_status = with_input_needed_status(
                state.status,
                state.input_needed.as_deref().unwrap_or(&[]),
            );
            state.status = new_status;
            ReduceOutcome::Applied
        }
        StateAction::SessionInputNeededRemoved(a) => {
            let Some(list) = state.input_needed.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            let Some(idx) = list
                .iter()
                .position(|r| session_input_request_id(r) == Some(a.id.as_str()))
            else {
                return ReduceOutcome::NoOp;
            };
            list.remove(idx);
            let empty = list.is_empty();
            if empty {
                state.input_needed = None;
            }
            let new_status = with_input_needed_status(
                state.status,
                state.input_needed.as_deref().unwrap_or(&[]),
            );
            state.status = new_status;
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
            update_mcp_server_customization_state(state, &a.id, a.state.clone(), a.channel.clone())
        }
        StateAction::SessionMcpServerStartRequested(a) => update_mcp_server_customization_state(
            state,
            &a.id,
            McpServerState::Starting(McpServerStartingState {}),
            None,
        ),
        StateAction::SessionMcpServerStopRequested(a) => update_mcp_server_customization_state(
            state,
            &a.id,
            McpServerState::Stopped(McpServerStoppedState {}),
            None,
        ),
        _ => ReduceOutcome::OutOfScope,
    }
}

fn update_mcp_server_customization_state(
    state: &mut SessionState,
    id: &str,
    next_state: McpServerState,
    channel: Option<String>,
) -> ReduceOutcome {
    let Some(list) = state.customizations.as_mut() else {
        return ReduceOutcome::NoOp;
    };
    if let Some(idx) = list.iter().position(|c| customization_id(c) == Some(id)) {
        match &mut list[idx] {
            Customization::McpServer(m) => {
                m.state = next_state;
                m.channel = channel;
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
        if let Some(idx) = children.iter().position(|c| child_id_of(c) == Some(id)) {
            if let ChildCustomization::McpServer(m) = &mut children[idx] {
                m.state = next_state;
                m.channel = channel;
                return ReduceOutcome::Applied;
            }
            return ReduceOutcome::NoOp;
        }
    }
    ReduceOutcome::NoOp
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
        StateAction::ChatTurnComplete(a) => end_turn(
            state,
            &a.turn_id,
            a.duration,
            TurnState::Complete,
            None,
            None,
        ),
        StateAction::ChatTurnCancelled(a) => end_turn(
            state,
            &a.turn_id,
            a.duration,
            TurnState::Cancelled,
            None,
            None,
        ),
        StateAction::ChatError(a) => end_turn(
            state,
            &a.turn_id,
            a.duration,
            TurnState::Error,
            Some(SessionStatus::Error),
            Some(a.error.clone()),
        ),
        StateAction::ChatActivityChanged(a) => {
            state.activity = a.activity.clone();
            ReduceOutcome::Applied
        }
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
                        intention: a.intention.clone(),
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
        StateAction::ChatToolCallAuthRequired(a) => {
            let res = apply_tool_call_auth_required(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::ChatToolCallAuthResolved(a) => {
            let res = apply_tool_call_auth_resolved(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
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
        StateAction::ChatTurnsLoaded(a) => {
            let existing_ids: HashSet<&str> =
                state.turns.iter().map(|turn| turn.id.as_str()).collect();
            let mut older_turns: Vec<Turn> = a
                .turns
                .iter()
                .filter(|turn| !existing_ids.contains(turn.id.as_str()))
                .cloned()
                .collect();
            older_turns.append(&mut state.turns);
            state.turns = older_turns;
            state.turns_next_cursor = a.turns_next_cursor.clone();
            ReduceOutcome::Applied
        }
        StateAction::ChatInputRequested(a) => upsert_input_request(state, a.request.clone()),
        StateAction::ChatInputAnswerChanged(a) => apply_input_answer_changed(state, a),
        StateAction::ChatInputCompleted(a) => {
            let Some(active) = state.active_turn.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            let Some(part) = active
                .response_parts
                .iter_mut()
                .find_map(|part| match part {
                    ResponsePart::InputRequest(input)
                        if input.response.is_none() && input.request.id == a.request_id =>
                    {
                        Some(input)
                    }
                    _ => None,
                })
            else {
                return ReduceOutcome::NoOp;
            };
            let mut final_answers = part.request.answers.clone().unwrap_or_default();
            if let Some(answers) = &a.answers {
                for (k, v) in answers {
                    final_answers.insert(k.clone(), v.clone());
                }
            }
            part.request.answers = if final_answers.is_empty() {
                None
            } else {
                Some(final_answers)
            };
            part.response = Some(a.response);
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
        StateAction::ChatDraftChanged(a) => {
            state.draft = a.draft.clone();
            ReduceOutcome::Applied
        }
        _ => ReduceOutcome::OutOfScope,
    }
}

fn apply_turn_started(state: &mut ChatState, a: &ChatTurnStartedAction) -> ReduceOutcome {
    state.active_turn = Some(ActiveTurn {
        id: a.turn_id.clone(),
        started_at: a.started_at.clone(),
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
        let base = tool_call_meta(&tc);
        let meta = a.meta.clone().or(base.meta);
        let pending = match &tc {
            ToolCallState::PendingConfirmation(value) => Some(value.clone()),
            _ => None,
        };
        match tc {
            ToolCallState::Streaming(_)
            | ToolCallState::Running(_)
            | ToolCallState::PendingConfirmation(_) => {
                if let Some(confirmed) = a.confirmed {
                    ToolCallState::Running(ToolCallRunningState {
                        tool_call_id: base.tool_call_id,
                        tool_name: base.tool_name,
                        display_name: base.display_name,
                        intention: base.intention,
                        contributor: base.contributor,
                        meta,
                        invocation_message: a.invocation_message.clone(),
                        tool_input: a.tool_input.clone(),
                        confirmed,
                        selected_option: None,
                        content: None,
                    })
                } else {
                    ToolCallState::PendingConfirmation(ToolCallPendingConfirmationState {
                        tool_call_id: base.tool_call_id,
                        tool_name: base.tool_name,
                        display_name: base.display_name,
                        intention: base.intention,
                        contributor: base.contributor,
                        meta,
                        invocation_message: a.invocation_message.clone(),
                        tool_input: a
                            .tool_input
                            .clone()
                            .or_else(|| pending.as_ref().and_then(|p| p.tool_input.clone())),
                        confirmation_title: a.confirmation_title.clone().or_else(|| {
                            pending.as_ref().and_then(|p| p.confirmation_title.clone())
                        }),
                        risk_assessment: a
                            .risk_assessment
                            .clone()
                            .or_else(|| pending.as_ref().and_then(|p| p.risk_assessment.clone())),
                        edits: a
                            .edits
                            .clone()
                            .or_else(|| pending.as_ref().and_then(|p| p.edits.clone())),
                        editable: a
                            .editable
                            .or_else(|| pending.as_ref().and_then(|p| p.editable)),
                        options: a
                            .options
                            .clone()
                            .or_else(|| pending.as_ref().and_then(|p| p.options.clone())),
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
        let intention = s.intention;
        let contributor = s.contributor;
        let meta = a.meta.clone().or(s.meta);
        let invocation_message = s.invocation_message;
        let tool_input = s.tool_input;
        if a.approved {
            ToolCallState::Running(ToolCallRunningState {
                tool_call_id,
                tool_name,
                display_name,
                intention,
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
                intention,
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
        let base = tool_call_meta(&tc);
        let meta = a.meta.clone().or(base.meta);
        let (
            invocation_message,
            tool_input,
            confirmed,
            selected_option,
            pre_auth_content,
            from_auth_required,
        ) = match tc {
            ToolCallState::Running(s) => (
                s.invocation_message,
                s.tool_input,
                s.confirmed,
                s.selected_option,
                None,
                false,
            ),
            ToolCallState::PendingConfirmation(s) => (
                s.invocation_message,
                s.tool_input,
                ToolCallConfirmationReason::NotNeeded,
                None,
                None,
                false,
            ),
            // A client MAY cancel an auth-required MCP tool call by dispatching a
            // failed completion instead of authenticating. A successful completion
            // is invalid here — execution never resumed after the auth challenge —
            // and is ignored, leaving the call in auth-required. Any partial content
            // produced before the call paused for auth is preserved unless the
            // dispatched result supplies its own content.
            ToolCallState::AuthRequired(s) => {
                if a.result.success {
                    return ToolCallState::AuthRequired(s);
                }
                (
                    s.invocation_message,
                    s.tool_input,
                    s.confirmed,
                    s.selected_option,
                    s.content,
                    true,
                )
            }
            other => return other,
        };
        let content = a.result.content.clone().or(pre_auth_content);
        // Cancelling from auth-required always completes terminally: the pending
        // auth challenge isn't a "pending result" the client can review, so
        // requires_result_confirmation is ignored for this path — it must never
        // enter pending-result-confirmation.
        if a.requires_result_confirmation.unwrap_or(false) && !from_auth_required {
            ToolCallState::PendingResultConfirmation(ToolCallPendingResultConfirmationState {
                tool_call_id: base.tool_call_id,
                tool_name: base.tool_name,
                display_name: base.display_name,
                intention: base.intention,
                contributor: base.contributor,
                meta,
                invocation_message,
                tool_input,
                success: a.result.success,
                past_tense_message: a.result.past_tense_message.clone(),
                content,
                structured_content: a.result.structured_content.clone(),
                error: a.result.error.clone(),
                confirmed,
                selected_option,
            })
        } else {
            ToolCallState::Completed(ToolCallCompletedState {
                tool_call_id: base.tool_call_id,
                tool_name: base.tool_name,
                display_name: base.display_name,
                intention: base.intention,
                contributor: base.contributor,
                meta,
                invocation_message,
                tool_input,
                success: a.result.success,
                past_tense_message: a.result.past_tense_message.clone(),
                content,
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
                intention: s.intention,
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
                intention: s.intention,
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

fn apply_tool_call_auth_required(
    state: &mut ChatState,
    a: &ChatToolCallAuthRequiredAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let base = tool_call_meta(&tc);
        let meta = a.meta.clone().or(base.meta);
        match tc {
            ToolCallState::Running(s) => {
                if !matches!(s.contributor, Some(ToolCallContributor::Mcp(_))) {
                    return ToolCallState::Running(s);
                }
                ToolCallState::AuthRequired(ToolCallAuthRequiredState {
                    tool_call_id: base.tool_call_id,
                    tool_name: base.tool_name,
                    display_name: base.display_name,
                    intention: base.intention,
                    contributor: s.contributor,
                    meta,
                    invocation_message: s.invocation_message,
                    tool_input: s.tool_input,
                    confirmed: s.confirmed,
                    selected_option: s.selected_option,
                    status: ToolCallStatus::AuthRequired,
                    auth: a.auth.clone(),
                    content: s.content,
                })
            }
            other => other,
        }
    })
}

fn apply_tool_call_auth_resolved(
    state: &mut ChatState,
    a: &ChatToolCallAuthResolvedAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let base = tool_call_meta(&tc);
        let meta = a.meta.clone().or(base.meta);
        match tc {
            ToolCallState::AuthRequired(s) => ToolCallState::Running(ToolCallRunningState {
                tool_call_id: base.tool_call_id,
                tool_name: base.tool_name,
                display_name: base.display_name,
                intention: base.intention,
                contributor: s.contributor,
                meta,
                invocation_message: s.invocation_message,
                tool_input: s.tool_input,
                confirmed: s.confirmed,
                selected_option: s.selected_option,
                content: s.content,
            }),
            other => other,
        }
    })
}

fn apply_truncated(state: &mut ChatState, turn_id: Option<&str>) -> ReduceOutcome {
    match turn_id {
        None => {
            state.turns.clear();
            state.turns_next_cursor = None;
        }
        Some(id) => {
            let Some(idx) = state.turns.iter().position(|t| t.id == id) else {
                return ReduceOutcome::NoOp;
            };
            state.turns.truncate(idx + 1);
        }
    }
    state.active_turn = None;
    touch_chat_modified(state);
    state.status = summary_status(state, None);
    ReduceOutcome::Applied
}

fn apply_input_answer_changed(
    state: &mut ChatState,
    a: &ChatInputAnswerChangedAction,
) -> ReduceOutcome {
    let Some(active) = state.active_turn.as_mut() else {
        return ReduceOutcome::NoOp;
    };
    let Some(part) = active
        .response_parts
        .iter_mut()
        .find_map(|part| match part {
            ResponsePart::InputRequest(input)
                if input.response.is_none() && input.request.id == a.request_id =>
            {
                Some(input)
            }
            _ => None,
        })
    else {
        return ReduceOutcome::NoOp;
    };
    let req = &mut part.request;
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

// ─── Changeset Reducer ────────────────────────────────────────────

/// Apply a [`StateAction`] to a [`ChangesetState`] in place.
///
/// Handles all changeset-channel actions. Actions targeting a different
/// scope short-circuit as [`ReduceOutcome::OutOfScope`].
pub fn apply_action_to_changeset(
    state: &mut ChangesetState,
    action: &StateAction,
) -> ReduceOutcome {
    match action {
        StateAction::ChangesetStatusChanged(a) => {
            // Carry `error` only when the new status is `Error` so we don't
            // leave a stale error sitting on a recovered changeset.
            if a.status == ChangesetStatus::Error {
                state.status = a.status;
                state.error = a.error.clone();
            } else {
                state.status = a.status;
                state.error = None;
            }
            ReduceOutcome::Applied
        }
        StateAction::ChangesetFileSet(a) => {
            if let Some(idx) = state.files.iter().position(|f| f.id == a.file.id) {
                state.files[idx] = a.file.clone();
            } else {
                state.files.push(a.file.clone());
            }
            ReduceOutcome::Applied
        }
        StateAction::ChangesetFileRemoved(a) => {
            let Some(idx) = state.files.iter().position(|f| f.id == a.file_id) else {
                return ReduceOutcome::NoOp;
            };
            state.files.remove(idx);
            ReduceOutcome::Applied
        }
        StateAction::ChangesetFilesReviewChanged(a) => {
            let ids: std::collections::HashSet<&String> = a.files.iter().collect();
            let mut changed = false;
            for file in state.files.iter_mut() {
                if !ids.contains(&file.id) || file.reviewed == Some(a.reviewed) {
                    continue;
                }
                file.reviewed = Some(a.reviewed);
                changed = true;
            }
            if changed {
                ReduceOutcome::Applied
            } else {
                ReduceOutcome::NoOp
            }
        }
        StateAction::ChangesetContentChanged(a) => {
            state.files = a.files.clone();
            if let Some(operations) = &a.operations {
                state.operations = Some(operations.clone());
            }
            state.error = a.error.clone();
            ReduceOutcome::Applied
        }
        StateAction::ChangesetOperationsChanged(a) => {
            state.operations = a.operations.clone();
            ReduceOutcome::Applied
        }
        StateAction::ChangesetOperationStatusChanged(a) => {
            let Some(ops) = state.operations.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            let Some(idx) = ops.iter().position(|o| o.id == a.operation_id) else {
                return ReduceOutcome::NoOp;
            };
            // Carry `error` only when the new status is `Error` so we don't
            // leave a stale error on an operation that recovered or started running.
            if a.status == ChangesetOperationStatus::Error {
                ops[idx].status = a.status;
                ops[idx].error = a.error.clone();
            } else {
                ops[idx].status = a.status;
                ops[idx].error = None;
            }
            ReduceOutcome::Applied
        }
        StateAction::ChangesetCleared(_) => {
            if state.files.is_empty() {
                return ReduceOutcome::NoOp;
            }
            state.files.clear();
            ReduceOutcome::Applied
        }
        _ => ReduceOutcome::OutOfScope,
    }
}

// ─── Annotations Reducer ──────────────────────────────────────────

/// Apply a [`StateAction`] to an [`AnnotationsState`] in place.
///
/// Handles all annotations-channel actions. Actions targeting a different
/// scope short-circuit as [`ReduceOutcome::OutOfScope`].
pub fn apply_action_to_annotations(
    state: &mut AnnotationsState,
    action: &StateAction,
) -> ReduceOutcome {
    match action {
        StateAction::AnnotationsSet(a) => {
            if let Some(idx) = state
                .annotations
                .iter()
                .position(|t| t.id == a.annotation.id)
            {
                state.annotations[idx] = a.annotation.clone();
            } else {
                state.annotations.push(a.annotation.clone());
            }
            ReduceOutcome::Applied
        }
        StateAction::AnnotationsUpdated(a) => {
            let Some(idx) = state
                .annotations
                .iter()
                .position(|t| t.id == a.annotation_id)
            else {
                return ReduceOutcome::NoOp;
            };
            let ann = &mut state.annotations[idx];
            if let Some(turn_id) = &a.turn_id {
                ann.turn_id = turn_id.clone();
            }
            if let Some(resource) = &a.resource {
                ann.resource = resource.clone();
            }
            if let Some(range) = &a.range {
                ann.range = Some(range.clone());
            }
            if let Some(resolved) = a.resolved {
                ann.resolved = resolved;
            }
            ReduceOutcome::Applied
        }
        StateAction::AnnotationsRemoved(a) => {
            let Some(idx) = state
                .annotations
                .iter()
                .position(|t| t.id == a.annotation_id)
            else {
                return ReduceOutcome::NoOp;
            };
            state.annotations.remove(idx);
            ReduceOutcome::Applied
        }
        StateAction::AnnotationsEntrySet(a) => {
            let Some(t_idx) = state
                .annotations
                .iter()
                .position(|t| t.id == a.annotation_id)
            else {
                return ReduceOutcome::NoOp;
            };
            let entries = &mut state.annotations[t_idx].entries;
            if let Some(c_idx) = entries.iter().position(|e| e.id == a.entry.id) {
                entries[c_idx] = a.entry.clone();
            } else {
                entries.push(a.entry.clone());
            }
            ReduceOutcome::Applied
        }
        StateAction::AnnotationsEntryRemoved(a) => {
            let Some(t_idx) = state
                .annotations
                .iter()
                .position(|t| t.id == a.annotation_id)
            else {
                return ReduceOutcome::NoOp;
            };
            let entries = &mut state.annotations[t_idx].entries;
            let Some(c_idx) = entries.iter().position(|e| e.id == a.entry_id) else {
                return ReduceOutcome::NoOp;
            };
            entries.remove(c_idx);
            ReduceOutcome::Applied
        }
        _ => ReduceOutcome::OutOfScope,
    }
}

// ─── Resource-Watch Reducer ───────────────────────────────────────

/// Apply a [`StateAction`] to a [`ResourceWatchState`] in place.
///
/// `resourceWatch/changed` is intentionally a pass-through — the reducer
/// keeps no history of change events. Actions targeting a different scope
/// short-circuit as [`ReduceOutcome::OutOfScope`].
pub fn apply_action_to_resource_watch(
    _state: &mut ResourceWatchState,
    action: &StateAction,
) -> ReduceOutcome {
    match action {
        StateAction::ResourceWatchChanged(_) => ReduceOutcome::NoOp,
        _ => ReduceOutcome::OutOfScope,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ahp_types::state::{
        ChatSummary, MarkdownResponsePart, Message, MessageKind, MessageOrigin,
    };

    fn user_message(text: &str) -> Message {
        Message {
            text: text.into(),
            origin: MessageOrigin {
                kind: MessageKind::User,
            },
            attachments: None,
            model: None,
            agent: None,
            meta: None,
        }
    }

    fn empty_session(_resource: &str) -> SessionState {
        SessionState {
            provider: "test".to_string(),
            title: String::new(),
            status: SessionStatus::Idle.bits(),
            activity: None,
            project: None,
            working_directory: None,
            annotations: None,
            lifecycle: SessionLifecycle::Creating,
            creation_error: None,
            server_tools: None,
            active_clients: Vec::new(),
            chats: Vec::new(),
            default_chat: None,
            config: None,
            customizations: None,
            changesets: None,
            input_needed: None,
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
            origin: None,
            interactivity: None,
            working_directory: None,
            turns: Vec::new(),
            turns_next_cursor: None,
            active_turn: None,
            steering_message: None,
            queued_messages: None,
            draft: None,
            meta: None,
        }
    }

    #[test]
    fn turn_started_creates_active_turn_and_sets_in_progress() {
        let mut s = empty_chat("copilot:/s1/chat/1");
        let action = StateAction::ChatTurnStarted(ChatTurnStartedAction {
            turn_id: "t1".into(),
            started_at: "2026-07-09T20:00:00.000Z".into(),
            message: user_message("hi"),
            queued_message_id: None,
            meta: None,
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
            started_at: "2026-07-09T20:00:00.000Z".into(),
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
            meta: None,
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
            started_at: "2026-07-09T20:00:00.000Z".into(),
            message: user_message("hi"),
            response_parts: Vec::new(),
            usage: None,
        });
        s.status = SessionStatus::InProgress.bits();
        let a = StateAction::ChatTurnComplete(ahp_types::actions::ChatTurnCompleteAction {
            turn_id: "t1".into(),
            duration: 1000,
            meta: None,
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
            duration: 1000,
            meta: None,
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
        let skipped = 0usize;

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
                "changeset" => run_fixture::<ChangesetState>(
                    initial,
                    expected,
                    &parsed_actions,
                    apply_action_to_changeset,
                    &file_name,
                    description,
                ),
                "annotations" => run_fixture::<AnnotationsState>(
                    initial,
                    expected,
                    &parsed_actions,
                    apply_action_to_annotations,
                    &file_name,
                    description,
                ),
                "resourceWatch" => run_fixture::<ResourceWatchState>(
                    initial,
                    expected,
                    &parsed_actions,
                    apply_action_to_resource_watch,
                    &file_name,
                    description,
                ),
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
