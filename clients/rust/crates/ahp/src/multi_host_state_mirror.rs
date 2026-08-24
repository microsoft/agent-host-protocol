//! Host-aware reducer façade for multi-host consumers.
//!
//! Wraps the existing pure reducers:
//! [`apply_action_to_automation`](crate::reducers::apply_action_to_automation),
//! [`apply_action_to_automation_run`](crate::reducers::apply_action_to_automation_run),
//! [`apply_action_to_root`](crate::reducers::apply_action_to_root),
//! [`apply_action_to_session`](crate::reducers::apply_action_to_session),
//! and [`apply_action_to_terminal`](crate::reducers::apply_action_to_terminal).
//! It applies them the way a single-host consumer would, but keys state by
//! `(host_id, uri)` so resource URIs that legitimately collide across
//! hosts (the normal case for session URIs) don't clobber each other.
//!
//! # Event sources are lossy today
//!
//! Both event surfaces the Rust SDK exposes are
//! [`tokio::sync::broadcast`]-backed and **drop envelopes on slow
//! consumers** once their buffer fills:
//!
//! - [`crate::hosts::MultiHostClient::events`] — the cross-host fan-in.
//! - [`crate::Client::subscribe`] /
//!   [`crate::Client::attach_subscription`] — the per-channel
//!   [`crate::SessionSubscription`] (lag is reported via
//!   [`crate::SubscriptionEvent`] but envelopes are still dropped).
//!
//! Neither survives a reconnect's replayed envelopes the way the Swift
//! SDK's per-channel `events(host:uri:)` does. A dropped envelope (or
//! a missed-because-reconnected envelope) will permanently desync the
//! mirror for that `(host, channel)` until you re-seed it from a fresh
//! snapshot — either via a new `subscribe` call or by applying a
//! `Snapshot` from `ReconnectResult::Snapshot` through
//! [`MultiHostStateMirror::apply_snapshot`].
//!
//! Consume from this mirror with that understanding: it's the right
//! shape for multi-host UI state, but the Rust SDK doesn't yet ship a
//! lossless feeder.

use std::collections::HashMap;

use ahp_types::actions::ActionEnvelope;
use ahp_types::common::ROOT_RESOURCE_URI;
use ahp_types::state::{
    AnnotationsState, AutomationCatalogState, AutomationRunState, AutomationState, ChangesetState,
    ChatState, ResourceWatchState, RootState, SessionState, SnapshotState, TerminalState,
    TunnelsState,
};

use crate::hosts::{HostId, HostSubscriptionEvent};
use crate::reducers::{
    apply_action_to_automation, apply_action_to_automation_run, apply_action_to_chat,
    apply_action_to_root, apply_action_to_session, apply_action_to_terminal,
    apply_action_to_tunnel,
};
use crate::SubscriptionEvent;

const AUTOMATIONS_RESOURCE_URI: &str = "ahp-automations://";
const TUNNELS_RESOURCE_URI: &str = "ahp-tunnels://";

/// Compound key tagging a channel URI with the host that produced it.
///
/// Session, terminal, and changeset URIs aren't globally unique across
/// hosts — `ahp-session:/s1` on Host A and `ahp-session:/s1` on Host B
/// are different resources. Use this struct as the key in any
/// multi-host state map.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct HostedResourceKey {
    /// Host the resource belongs to.
    pub host_id: HostId,
    /// Channel URI the resource is identified by on its host.
    pub uri: String,
}

impl HostedResourceKey {
    /// Build a new key.
    pub fn new(host_id: HostId, uri: impl Into<String>) -> Self {
        Self {
            host_id,
            uri: uri.into(),
        }
    }
}

/// In-memory mirror of per-host root/session/terminal/changeset/automation state,
/// fed by [`ActionEnvelope`]s and snapshot states tagged with their
/// host of origin.
///
/// Single-host consumers should keep using the pure reducers directly;
/// this type adds the host dimension necessary for multi-host UIs.
/// Apply [`HostSubscriptionEvent`]s straight through
/// [`MultiHostStateMirror::apply_event`], or feed envelopes / snapshots
/// individually via [`MultiHostStateMirror::apply_envelope`] /
/// [`MultiHostStateMirror::apply_snapshot`].
///
/// See the module-level docs for a warning about lossy event sources.
#[derive(Debug, Default)]
pub struct MultiHostStateMirror {
    root_states: HashMap<HostId, RootState>,
    sessions: HashMap<HostedResourceKey, SessionState>,
    chats: HashMap<HostedResourceKey, ChatState>,
    terminals: HashMap<HostedResourceKey, TerminalState>,
    changesets: HashMap<HostedResourceKey, ChangesetState>,
    annotations: HashMap<HostedResourceKey, AnnotationsState>,
    resource_watches: HashMap<HostedResourceKey, ResourceWatchState>,
    tunnel_catalogs: HashMap<HostId, TunnelsState>,
    automation_catalogs: HashMap<HostId, AutomationCatalogState>,
    automations: HashMap<HostedResourceKey, AutomationState>,
    automation_runs: HashMap<HostedResourceKey, AutomationRunState>,
}

impl MultiHostStateMirror {
    /// Build an empty mirror.
    pub fn new() -> Self {
        Self::default()
    }

    /// Borrow the root states map keyed by host.
    pub fn root_states(&self) -> &HashMap<HostId, RootState> {
        &self.root_states
    }

    /// Borrow the session states map keyed by `(host_id, uri)`.
    pub fn sessions(&self) -> &HashMap<HostedResourceKey, SessionState> {
        &self.sessions
    }

    /// Borrow the chat states map keyed by `(host_id, uri)`.
    pub fn chats(&self) -> &HashMap<HostedResourceKey, ChatState> {
        &self.chats
    }

    /// Borrow the terminal states map keyed by `(host_id, uri)`.
    pub fn terminals(&self) -> &HashMap<HostedResourceKey, TerminalState> {
        &self.terminals
    }

    /// Borrow the changeset states map keyed by `(host_id, uri)`.
    pub fn changesets(&self) -> &HashMap<HostedResourceKey, ChangesetState> {
        &self.changesets
    }

    /// Borrow the annotations states map keyed by `(host_id, uri)`.
    pub fn annotations(&self) -> &HashMap<HostedResourceKey, AnnotationsState> {
        &self.annotations
    }

    /// Borrow the resource-watch states map keyed by `(host_id, uri)`.
    pub fn resource_watches(&self) -> &HashMap<HostedResourceKey, ResourceWatchState> {
        &self.resource_watches
    }

    /// Borrow tunnels states keyed by host.
    pub fn tunnel_catalogs(&self) -> &HashMap<HostId, TunnelsState> {
        &self.tunnel_catalogs
    }

    /// Borrow automation catalogue states keyed by host.
    pub fn automation_catalogs(&self) -> &HashMap<HostId, AutomationCatalogState> {
        &self.automation_catalogs
    }

    /// Borrow automation states keyed by `(host_id, uri)`.
    pub fn automations(&self) -> &HashMap<HostedResourceKey, AutomationState> {
        &self.automations
    }

    /// Borrow automation-run states keyed by `(host_id, uri)`.
    pub fn automation_runs(&self) -> &HashMap<HostedResourceKey, AutomationRunState> {
        &self.automation_runs
    }

    /// Convenience: apply a [`HostSubscriptionEvent`] produced by
    /// [`crate::hosts::MultiHostClient::events`]. Action envelopes are
    /// routed through the reducer; non-action events (session-summary
    /// notifications and auth challenges) are ignored — they don't move any of
    /// the reducer-tracked state shapes.
    pub fn apply_event(&mut self, event: &HostSubscriptionEvent) {
        if let SubscriptionEvent::Action(envelope) = &event.event {
            self.apply_envelope(&event.host_id, envelope);
        }
    }

    /// Apply a single action envelope, scoped to `host`. Routing uses
    /// `envelope.channel`: [`ROOT_RESOURCE_URI`] is the root channel,
    /// every other channel is identified by the URI the server
    /// announces.
    pub fn apply_envelope(&mut self, host: &HostId, envelope: &ActionEnvelope) {
        if envelope.channel == ROOT_RESOURCE_URI {
            let root = self
                .root_states
                .entry(host.clone())
                .or_insert_with(|| RootState {
                    agents: vec![],
                    active_sessions: None,
                    terminals: None,
                    config: None,
                    meta: None,
                });
            apply_action_to_root(root, &envelope.action);
            return;
        }
        if envelope.channel == AUTOMATIONS_RESOURCE_URI {
            let automations = self.automation_catalogs.get_mut(host).map(|catalog| {
                apply_action_to_automation(catalog, &envelope.action);
                catalog.automations.clone()
            });
            if let Some(automations) = automations {
                self.replace_automations(host, automations);
            }
            return;
        }
        if envelope.channel == TUNNELS_RESOURCE_URI {
            if let Some(catalog) = self.tunnel_catalogs.get_mut(host) {
                apply_action_to_tunnel(catalog, &envelope.action);
            }
            return;
        }
        let key = HostedResourceKey::new(host.clone(), envelope.channel.clone());
        if let Some(session) = self.sessions.get_mut(&key) {
            apply_action_to_session(session, &envelope.action);
            return;
        }
        if let Some(chat) = self.chats.get_mut(&key) {
            apply_action_to_chat(chat, &envelope.action);
            return;
        }
        if let Some(terminal) = self.terminals.get_mut(&key) {
            apply_action_to_terminal(terminal, &envelope.action);
            return;
        }
        if let Some(run) = self.automation_runs.get_mut(&key) {
            apply_action_to_automation_run(run, &envelope.action);
        }
        // Changesets are seeded by `apply_snapshot` only — there's no
        // changeset reducer in the SDK today (matching the Swift
        // mirror's behavior). Fall through silently.
    }

    /// Seed the mirror from a [`Snapshot`](ahp_types::state::Snapshot)
    /// scoped to `host` — root, session, terminal, changeset,
    /// resource-watch, annotations, automation, or automation-run as the
    /// snapshot's `state` discriminator dictates.
    pub fn apply_snapshot(&mut self, host: &HostId, snapshot: &ahp_types::state::Snapshot) {
        let key = HostedResourceKey::new(host.clone(), snapshot.resource.clone());
        match &snapshot.state {
            SnapshotState::Root(state) => {
                self.root_states
                    .insert(host.clone(), state.as_ref().clone());
            }
            SnapshotState::Session(state) => {
                self.sessions.insert(key, state.as_ref().clone());
            }
            SnapshotState::Chat(state) => {
                self.chats.insert(key, state.as_ref().clone());
            }
            SnapshotState::Terminal(state) => {
                self.terminals.insert(key, state.as_ref().clone());
            }
            SnapshotState::Changeset(state) => {
                self.changesets.insert(key, state.as_ref().clone());
            }
            SnapshotState::ResourceWatch(state) => {
                self.resource_watches.insert(key, state.as_ref().clone());
            }
            SnapshotState::Annotations(state) => {
                self.annotations.insert(key, state.as_ref().clone());
            }
            SnapshotState::Tunnels(state) => {
                self.tunnel_catalogs
                    .insert(host.clone(), state.as_ref().clone());
            }
            SnapshotState::Automations(state) => {
                let state = state.as_ref().clone();
                self.replace_automations(host, state.automations.clone());
                self.automation_catalogs.insert(host.clone(), state);
            }
            SnapshotState::AutomationRun(state) => {
                self.automation_runs.insert(key, state.as_ref().clone());
            }
        }
    }

    /// Drop every slot keyed under `host` — root state, sessions,
    /// terminals, changesets, resource watches, annotations, automations,
    /// and automation runs.
    pub fn reset_host(&mut self, host: &HostId) {
        self.root_states.remove(host);
        self.sessions.retain(|key, _| &key.host_id != host);
        self.chats.retain(|key, _| &key.host_id != host);
        self.terminals.retain(|key, _| &key.host_id != host);
        self.changesets.retain(|key, _| &key.host_id != host);
        self.annotations.retain(|key, _| &key.host_id != host);
        self.resource_watches.retain(|key, _| &key.host_id != host);
        self.tunnel_catalogs.remove(host);
        self.automation_catalogs.remove(host);
        self.automations.retain(|key, _| &key.host_id != host);
        self.automation_runs.retain(|key, _| &key.host_id != host);
    }

    /// Drop every host's state.
    pub fn reset(&mut self) {
        self.root_states.clear();
        self.sessions.clear();
        self.chats.clear();
        self.terminals.clear();
        self.changesets.clear();
        self.annotations.clear();
        self.resource_watches.clear();
        self.tunnel_catalogs.clear();
        self.automation_catalogs.clear();
        self.automations.clear();
        self.automation_runs.clear();
    }

    fn replace_automations(&mut self, host: &HostId, automations: Vec<AutomationState>) {
        self.automations.retain(|key, _| &key.host_id != host);
        for automation in automations {
            self.automations.insert(
                HostedResourceKey::new(host.clone(), automation.resource.clone()),
                automation,
            );
        }
    }
}
