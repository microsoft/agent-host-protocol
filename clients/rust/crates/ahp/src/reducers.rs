//! Pure state reducers ported from `types/reducers.ts`.
//!
//! Reducers mutate state in place and return a [`ReduceOutcome`]. Use
//! [`apply_action_to_root`], [`apply_action_to_session`], and
//! [`apply_action_to_terminal`] to dispatch any [`StateAction`] against
//! the matching scope; unrelated actions short-circuit as
//! [`ReduceOutcome::OutOfScope`] so a client holding all three state
//! trees can blindly fan every action out.
//!
//! All three reducers are pure functions over `(state, action)` — no
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
//!     SessionTitleChangedAction { session: "copilot:/s1".into(), title: "Hi".into() },
//! );
//! assert_eq!(
//!     apply_action_to_root(&mut root, &session_action),
//!     ReduceOutcome::OutOfScope,
//! );
//! ```

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use ahp_types::actions::{
    SessionInputAnswerChangedAction, SessionToolCallCompleteAction, SessionToolCallConfirmedAction,
    SessionToolCallContentChangedAction, SessionToolCallDeltaAction, SessionToolCallReadyAction,
    SessionToolCallResultConfirmedAction, SessionTurnStartedAction, StateAction,
};
use ahp_types::state::{
    ActiveTurn, ConfirmationOption, ErrorInfo, PendingMessage, PendingMessageKind, ResponsePart,
    RootState, SessionCustomization, SessionInputRequest, SessionLifecycle, SessionState,
    SessionStatus, TerminalCommandPart, TerminalContentPart, TerminalState,
    TerminalUnclassifiedPart, ToolCallCancellationReason, ToolCallCancelledState,
    ToolCallCompletedState, ToolCallConfirmationReason, ToolCallPendingConfirmationState,
    ToolCallPendingResultConfirmationState, ToolCallResponsePart, ToolCallRunningState,
    ToolCallState, ToolCallStreamingState, Turn, TurnState,
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

fn tool_call_meta(
    tc: &ToolCallState,
) -> (
    String,
    String,
    String,
    Option<String>,
    Option<serde_json::Map<String, serde_json::Value>>,
) {
    match tc {
        ToolCallState::Streaming(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.tool_client_id.clone(),
            s.meta.clone(),
        ),
        ToolCallState::PendingConfirmation(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.tool_client_id.clone(),
            s.meta.clone(),
        ),
        ToolCallState::Running(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.tool_client_id.clone(),
            s.meta.clone(),
        ),
        ToolCallState::PendingResultConfirmation(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.tool_client_id.clone(),
            s.meta.clone(),
        ),
        ToolCallState::Completed(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.tool_client_id.clone(),
            s.meta.clone(),
        ),
        ToolCallState::Cancelled(s) => (
            s.tool_call_id.clone(),
            s.tool_name.clone(),
            s.display_name.clone(),
            s.tool_client_id.clone(),
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

fn has_pending_tool_call_confirmation(state: &SessionState) -> bool {
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
    let f = flag as u32;
    if set {
        status | f
    } else {
        status & !f
    }
}

fn summary_status(state: &SessionState, terminal: Option<SessionStatus>) -> u32 {
    let activity: u32 = if let Some(t) = terminal {
        t as u32
    } else if state
        .input_requests
        .as_ref()
        .map(|r| !r.is_empty())
        .unwrap_or(false)
        || has_pending_tool_call_confirmation(state)
    {
        SessionStatus::InputNeeded as u32
    } else if state.active_turn.is_some() {
        SessionStatus::InProgress as u32
    } else {
        SessionStatus::Idle as u32
    };
    (state.summary.status & !STATUS_ACTIVITY_MASK) | activity
}

fn refresh_summary_status(state: &mut SessionState) {
    state.summary.status = summary_status(state, None);
}

fn touch_modified(state: &mut SessionState) {
    state.summary.modified_at = now_ms();
}

fn end_turn(
    state: &mut SessionState,
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
                        let (tool_call_id, tool_name, display_name, tool_client_id, meta) =
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
                            tool_client_id,
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
        user_message: active.user_message,
        response_parts,
        usage: active.usage,
        state: turn_state,
        error,
    };

    state.turns.push(turn);
    state.input_requests = None;
    touch_modified(state);
    state.summary.status = summary_status(state, terminal_status);
    ReduceOutcome::Applied
}

fn upsert_input_request(state: &mut SessionState, request: SessionInputRequest) {
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
    state.summary.status = summary_status(state, None);
    touch_modified(state);
    state.summary.status = with_status_flag(state.summary.status, SessionStatus::IsRead, false);
}

fn update_tool_call<F>(
    state: &mut SessionState,
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
                        tool_client_id: None,
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
    state: &mut SessionState,
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
            state.lifecycle = SessionLifecycle::Ready;
            state.summary.status = summary_status(state, None);
            ReduceOutcome::Applied
        }
        StateAction::SessionCreationFailed(a) => {
            state.lifecycle = SessionLifecycle::CreationFailed;
            state.creation_error = Some(a.error.clone());
            ReduceOutcome::Applied
        }
        StateAction::SessionTurnStarted(a) => apply_turn_started(state, a),
        StateAction::SessionDelta(a) => update_response_part(state, &a.turn_id, &a.part_id, |p| {
            if let ResponsePart::Markdown(m) = p {
                m.content.push_str(&a.content);
            }
        }),
        StateAction::SessionResponsePart(a) => {
            let Some(active) = state.active_turn.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if active.id != a.turn_id {
                return ReduceOutcome::NoOp;
            }
            active.response_parts.push(a.part.clone());
            ReduceOutcome::Applied
        }
        StateAction::SessionTurnComplete(a) => {
            end_turn(state, &a.turn_id, TurnState::Complete, None, None)
        }
        StateAction::SessionTurnCancelled(a) => {
            end_turn(state, &a.turn_id, TurnState::Cancelled, None, None)
        }
        StateAction::SessionError(a) => end_turn(
            state,
            &a.turn_id,
            TurnState::Error,
            Some(SessionStatus::Error),
            Some(a.error.clone()),
        ),
        StateAction::SessionToolCallStart(a) => {
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
                        tool_client_id: a.tool_client_id.clone(),
                        meta: a.meta.clone(),
                        partial_input: None,
                        invocation_message: None,
                    }),
                })));
            ReduceOutcome::Applied
        }
        StateAction::SessionToolCallDelta(a) => apply_tool_call_delta(state, a),
        StateAction::SessionToolCallReady(a) => {
            let res = apply_tool_call_ready(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::SessionToolCallConfirmed(a) => {
            let res = apply_tool_call_confirmed(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::SessionToolCallComplete(a) => {
            let res = apply_tool_call_complete(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::SessionToolCallResultConfirmed(a) => {
            let res = apply_tool_call_result_confirmed(state, a);
            if res == ReduceOutcome::Applied {
                refresh_summary_status(state);
            }
            res
        }
        StateAction::SessionToolCallContentChanged(a) => apply_tool_call_content_changed(state, a),
        StateAction::SessionTitleChanged(a) => {
            state.summary.title = a.title.clone();
            touch_modified(state);
            ReduceOutcome::Applied
        }
        StateAction::SessionUsage(a) => {
            let Some(active) = state.active_turn.as_mut() else {
                return ReduceOutcome::NoOp;
            };
            if active.id != a.turn_id {
                return ReduceOutcome::NoOp;
            }
            active.usage = Some(a.usage.clone());
            ReduceOutcome::Applied
        }
        StateAction::SessionReasoning(a) => {
            update_response_part(state, &a.turn_id, &a.part_id, |p| {
                if let ResponsePart::Reasoning(r) = p {
                    r.content.push_str(&a.content);
                }
            })
        }
        StateAction::SessionModelChanged(a) => {
            state.summary.model = Some(a.model.clone());
            touch_modified(state);
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
        StateAction::SessionDiffsChanged(a) => {
            state.summary.diffs = Some(a.diffs.clone());
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
            touch_modified(state);
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
            let Some(idx) = list.iter().position(|c| c.customization.uri == a.uri) else {
                return ReduceOutcome::NoOp;
            };
            list[idx].enabled = a.enabled;
            ReduceOutcome::Applied
        }
        StateAction::SessionCustomizationUpdated(a) => {
            let list = state.customizations.get_or_insert_with(Vec::new);
            if let Some(idx) = list.iter().position(|c| c.customization.uri == a.customization.uri) {
                list[idx].customization = a.customization.clone();
                if let Some(enabled) = a.enabled {
                    list[idx].enabled = enabled;
                }
                if let Some(status) = a.status {
                    list[idx].status = Some(status);
                }
                if let Some(message) = a.status_message.clone() {
                    list[idx].status_message = Some(message);
                }
            } else {
                list.push(SessionCustomization {
                    customization: a.customization.clone(),
                    enabled: a.enabled.unwrap_or(false),
                    client_id: None,
                    status: a.status,
                    status_message: a.status_message.clone(),
                });
            }
            ReduceOutcome::Applied
        }
        StateAction::SessionTruncated(a) => apply_truncated(state, a.turn_id.as_deref()),
        StateAction::SessionInputRequested(a) => {
            upsert_input_request(state, a.request.clone());
            ReduceOutcome::Applied
        }
        StateAction::SessionInputAnswerChanged(a) => apply_input_answer_changed(state, a),
        StateAction::SessionInputCompleted(a) => {
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
            touch_modified(state);
            ReduceOutcome::Applied
        }
        StateAction::SessionPendingMessageSet(a) => {
            let entry = PendingMessage {
                id: a.id.clone(),
                user_message: a.user_message.clone(),
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
        StateAction::SessionPendingMessageRemoved(a) => match a.kind {
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
        StateAction::SessionQueuedMessagesReordered(a) => {
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

fn apply_turn_started(state: &mut SessionState, a: &SessionTurnStartedAction) -> ReduceOutcome {
    state.active_turn = Some(ActiveTurn {
        id: a.turn_id.clone(),
        user_message: a.user_message.clone(),
        response_parts: Vec::new(),
        usage: None,
    });
    state.summary.status = summary_status(state, None);
    touch_modified(state);
    state.summary.status = with_status_flag(state.summary.status, SessionStatus::IsRead, false);

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

fn apply_tool_call_delta(
    state: &mut SessionState,
    a: &SessionToolCallDeltaAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| match tc {
        ToolCallState::Streaming(mut s) => {
            let current = s.partial_input.unwrap_or_default();
            s.partial_input = Some(current + &a.content);
            if let Some(im) = &a.invocation_message {
                s.invocation_message = Some(im.clone());
            }
            ToolCallState::Streaming(s)
        }
        other => other,
    })
}

fn apply_tool_call_ready(
    state: &mut SessionState,
    a: &SessionToolCallReadyAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let (tool_call_id, tool_name, display_name, tool_client_id, meta) = tool_call_meta(&tc);
        match tc {
            ToolCallState::Streaming(_) | ToolCallState::Running(_) => {
                if let Some(confirmed) = a.confirmed {
                    ToolCallState::Running(ToolCallRunningState {
                        tool_call_id,
                        tool_name,
                        display_name,
                        tool_client_id,
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
                        tool_client_id,
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
    state: &mut SessionState,
    a: &SessionToolCallConfirmedAction,
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
        let tool_client_id = s.tool_client_id;
        let meta = s.meta;
        let invocation_message = s.invocation_message;
        let tool_input = s.tool_input;
        if a.approved {
            ToolCallState::Running(ToolCallRunningState {
                tool_call_id,
                tool_name,
                display_name,
                tool_client_id,
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
                tool_client_id,
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
    state: &mut SessionState,
    a: &SessionToolCallCompleteAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| {
        let (tool_call_id, tool_name, display_name, tool_client_id, meta) = tool_call_meta(&tc);
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
                tool_client_id,
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
                tool_client_id,
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
    state: &mut SessionState,
    a: &SessionToolCallResultConfirmedAction,
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
                tool_client_id: s.tool_client_id,
                meta: s.meta,
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
                tool_client_id: s.tool_client_id,
                meta: s.meta,
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
    state: &mut SessionState,
    a: &SessionToolCallContentChangedAction,
) -> ReduceOutcome {
    update_tool_call(state, &a.turn_id, &a.tool_call_id, |tc| match tc {
        ToolCallState::Running(mut s) => {
            s.content = Some(a.content.clone());
            ToolCallState::Running(s)
        }
        other => other,
    })
}

fn apply_truncated(state: &mut SessionState, turn_id: Option<&str>) -> ReduceOutcome {
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
    touch_modified(state);
    state.summary.status = summary_status(state, None);
    ReduceOutcome::Applied
}

fn apply_input_answer_changed(
    state: &mut SessionState,
    a: &SessionInputAnswerChangedAction,
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
    touch_modified(state);
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
    use ahp_types::state::{MarkdownResponsePart, SessionSummary, UserMessage};

    fn empty_session(resource: &str) -> SessionState {
        SessionState {
            summary: SessionSummary {
                resource: resource.to_string(),
                provider: "test".to_string(),
                title: String::new(),
                status: SessionStatus::Idle as u32,
                activity: None,
                created_at: 0,
                modified_at: 0,
                project: None,
                model: None,
                working_directory: None,
                diffs: None,
            },
            lifecycle: SessionLifecycle::Creating,
            creation_error: None,
            server_tools: None,
            active_client: None,
            turns: Vec::new(),
            active_turn: None,
            steering_message: None,
            queued_messages: None,
            input_requests: None,
            config: None,
            customizations: None,
            meta: None,
        }
    }

    #[test]
    fn turn_started_creates_active_turn_and_sets_in_progress() {
        let mut s = empty_session("copilot:/s1");
        let action = StateAction::SessionTurnStarted(SessionTurnStartedAction {
            session: "copilot:/s1".into(),
            turn_id: "t1".into(),
            user_message: UserMessage {
                text: "hi".into(),
                attachments: None,
            },
            queued_message_id: None,
        });
        assert_eq!(
            apply_action_to_session(&mut s, &action),
            ReduceOutcome::Applied
        );
        assert_eq!(s.summary.status, SessionStatus::InProgress as u32);
        assert_eq!(s.active_turn.unwrap().id, "t1");
    }

    #[test]
    fn delta_appends_to_markdown_part() {
        let mut s = empty_session("copilot:/s1");
        s.active_turn = Some(ActiveTurn {
            id: "t1".into(),
            user_message: UserMessage {
                text: "hi".into(),
                attachments: None,
            },
            response_parts: vec![ResponsePart::Markdown(MarkdownResponsePart {
                id: "p1".into(),
                content: "Hello".into(),
            })],
            usage: None,
        });
        let a = StateAction::SessionDelta(ahp_types::actions::SessionDeltaAction {
            session: "copilot:/s1".into(),
            turn_id: "t1".into(),
            part_id: "p1".into(),
            content: ", world".into(),
        });
        assert_eq!(apply_action_to_session(&mut s, &a), ReduceOutcome::Applied);
        match &s.active_turn.unwrap().response_parts[0] {
            ResponsePart::Markdown(m) => assert_eq!(m.content, "Hello, world"),
            _ => panic!(),
        }
    }

    #[test]
    fn turn_complete_moves_active_to_turns_and_returns_idle() {
        let mut s = empty_session("copilot:/s1");
        s.active_turn = Some(ActiveTurn {
            id: "t1".into(),
            user_message: UserMessage {
                text: "hi".into(),
                attachments: None,
            },
            response_parts: Vec::new(),
            usage: None,
        });
        s.summary.status = SessionStatus::InProgress as u32;
        let a = StateAction::SessionTurnComplete(ahp_types::actions::SessionTurnCompleteAction {
            session: "copilot:/s1".into(),
            turn_id: "t1".into(),
        });
        assert_eq!(apply_action_to_session(&mut s, &a), ReduceOutcome::Applied);
        assert!(s.active_turn.is_none());
        assert_eq!(s.turns.len(), 1);
        assert_eq!(s.turns[0].state, TurnState::Complete);
        assert_eq!(s.summary.status, SessionStatus::Idle as u32);
    }

    #[test]
    fn root_reducer_handles_agents_changed() {
        let mut r = RootState {
            agents: Vec::new(),
            active_sessions: None,
            terminals: None,
            config: None,
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
            terminal: "terminal:/1".into(),
            data: "hello".into(),
        });
        apply_action_to_terminal(&mut t, &a);
        let a2 = StateAction::TerminalData(ahp_types::actions::TerminalDataAction {
            terminal: "terminal:/1".into(),
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
                    |s, a| apply_action_to_root(s, a),
                    &file_name,
                    description,
                ),
                "session" => run_fixture::<SessionState>(
                    initial,
                    expected,
                    &parsed_actions,
                    |s, a| apply_action_to_session(s, a),
                    &file_name,
                    description,
                ),
                "terminal" => run_fixture::<TerminalState>(
                    initial,
                    expected,
                    &parsed_actions,
                    |s, a| apply_action_to_terminal(s, a),
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

        eprintln!("Fixture results: {passed} passed, {} total", entries.len());
        assert_eq!(
            passed,
            entries.len(),
            "Expected all {} fixtures to pass, but only {passed} did",
            entries.len(),
        );
    }
}
