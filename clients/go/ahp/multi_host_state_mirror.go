package ahp

import (
	"sync"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// HostedResourceKey identifies a resource on a particular host.
// Used by [MultiHostStateMirror] as the lookup key.
type HostedResourceKey struct {
	HostID string
	URI    ahptypes.URI
}

// MultiHostStateMirror is a thread-safe map of (host, URI) → state
// snapshot. It deliberately exposes only the bare minimum needed to
// drive a UI that observes multiple hosts simultaneously: write
// snapshots in, read them back, drop them when the host or resource
// disappears.
//
// The mirror has no opinion about how snapshots are kept in sync with
// the server — that's the consumer's job, typically by feeding action
// envelopes from a [HostSubscriptionEvent] stream through the matching
// [ApplyActionToRoot] / [ApplyActionToSession] / [ApplyActionToChat] /
// [ApplyActionToTerminal] reducer and re-storing the result.
type MultiHostStateMirror struct {
	mu      sync.RWMutex
	roots   map[string]ahptypes.RootState
	session map[HostedResourceKey]ahptypes.SessionState
	chat    map[HostedResourceKey]ahptypes.ChatState
	term    map[HostedResourceKey]ahptypes.TerminalState
	changes map[HostedResourceKey]ahptypes.ChangesetState
}

// NewMultiHostStateMirror returns an empty mirror.
func NewMultiHostStateMirror() *MultiHostStateMirror {
	return &MultiHostStateMirror{
		roots:   make(map[string]ahptypes.RootState),
		session: make(map[HostedResourceKey]ahptypes.SessionState),
		chat:    make(map[HostedResourceKey]ahptypes.ChatState),
		term:    make(map[HostedResourceKey]ahptypes.TerminalState),
		changes: make(map[HostedResourceKey]ahptypes.ChangesetState),
	}
}

// PutRoot stores host's root snapshot.
func (m *MultiHostStateMirror) PutRoot(hostID string, root ahptypes.RootState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.roots[hostID] = root
}

// Root returns the root snapshot for hostID, or (zero, false) if
// none is recorded.
func (m *MultiHostStateMirror) Root(hostID string) (ahptypes.RootState, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.roots[hostID]
	return v, ok
}

// PutSession stores a session snapshot under (hostID, uri).
func (m *MultiHostStateMirror) PutSession(hostID string, uri ahptypes.URI, s ahptypes.SessionState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.session[HostedResourceKey{hostID, uri}] = s
}

// Session returns the session snapshot at (hostID, uri), or
// (zero, false) if none is recorded.
func (m *MultiHostStateMirror) Session(hostID string, uri ahptypes.URI) (ahptypes.SessionState, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.session[HostedResourceKey{hostID, uri}]
	return v, ok
}

// PutChat stores a chat snapshot under (hostID, uri).
func (m *MultiHostStateMirror) PutChat(hostID string, uri ahptypes.URI, c ahptypes.ChatState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.chat[HostedResourceKey{hostID, uri}] = c
}

// Chat returns the chat snapshot at (hostID, uri), or
// (zero, false) if none is recorded.
func (m *MultiHostStateMirror) Chat(hostID string, uri ahptypes.URI) (ahptypes.ChatState, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.chat[HostedResourceKey{hostID, uri}]
	return v, ok
}

// PutTerminal stores a terminal snapshot under (hostID, uri).
func (m *MultiHostStateMirror) PutTerminal(hostID string, uri ahptypes.URI, t ahptypes.TerminalState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.term[HostedResourceKey{hostID, uri}] = t
}

// Terminal returns the terminal snapshot at (hostID, uri), or
// (zero, false) if none is recorded.
func (m *MultiHostStateMirror) Terminal(hostID string, uri ahptypes.URI) (ahptypes.TerminalState, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.term[HostedResourceKey{hostID, uri}]
	return v, ok
}

// PutChangeset stores a changeset snapshot under (hostID, uri).
func (m *MultiHostStateMirror) PutChangeset(hostID string, uri ahptypes.URI, c ahptypes.ChangesetState) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.changes[HostedResourceKey{hostID, uri}] = c
}

// Changeset returns the changeset snapshot at (hostID, uri), or
// (zero, false) if none is recorded.
func (m *MultiHostStateMirror) Changeset(hostID string, uri ahptypes.URI) (ahptypes.ChangesetState, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.changes[HostedResourceKey{hostID, uri}]
	return v, ok
}

// DropHost removes every snapshot belonging to hostID. Use when a
// host is removed from the multi-host registry.
func (m *MultiHostStateMirror) DropHost(hostID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.roots, hostID)
	for k := range m.session {
		if k.HostID == hostID {
			delete(m.session, k)
		}
	}
	for k := range m.chat {
		if k.HostID == hostID {
			delete(m.chat, k)
		}
	}
	for k := range m.term {
		if k.HostID == hostID {
			delete(m.term, k)
		}
	}
	for k := range m.changes {
		if k.HostID == hostID {
			delete(m.changes, k)
		}
	}
}

// DropResource removes the snapshot at (hostID, uri) across every
// resource kind. No-op if no snapshot exists.
func (m *MultiHostStateMirror) DropResource(hostID string, uri ahptypes.URI) {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := HostedResourceKey{hostID, uri}
	delete(m.session, k)
	delete(m.chat, k)
	delete(m.term, k)
	delete(m.changes, k)
}
