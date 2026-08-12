// Package hosts implements the multi-host runtime layered on top of
// [github.com/microsoft/agent-host-protocol/clients/go/ahp.Client].
//
// A consumer that wants to talk to two or more AHP hosts at once
// would otherwise have to hand-roll N independent Clients, N
// transports, N reconnect supervisors, a per-host metadata registry,
// and a fan-in of inbound events tagged with host of origin. This
// package ships that machinery as [MultiHostClient].
//
// Single-host consumers should reach for [Single], which yields the
// same [HostHandle] abstraction without the consumer ever touching
// registry concepts.
package hosts

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// ─── HostId ────────────────────────────────────────────────────────────

// HostID is the opaque, stable, consumer-supplied identifier for a
// host registered with [MultiHostClient]. The empty string is invalid.
type HostID string

// String returns the underlying string representation.
func (h HostID) String() string { return string(h) }

// ─── HostState ─────────────────────────────────────────────────────────

// HostStateKind enumerates the lifecycle states a host can be in.
type HostStateKind int

const (
	// HostStateDisconnected: the host has been added but no transport
	// is open.
	HostStateDisconnected HostStateKind = iota
	// HostStateConnecting: a transport is being opened or the
	// `initialize` handshake is in flight.
	HostStateConnecting
	// HostStateConnected: the host is fully connected and serving
	// subscriptions.
	HostStateConnected
	// HostStateReconnecting: a previous connection dropped; the
	// supervisor is retrying with backoff.
	HostStateReconnecting
	// HostStateFailed: reconnect attempts were exhausted (or
	// reconnect was disabled) and the host is no longer trying.
	HostStateFailed
)

// String returns a stable name for the state kind, suitable for
// logging.
func (k HostStateKind) String() string {
	switch k {
	case HostStateDisconnected:
		return "disconnected"
	case HostStateConnecting:
		return "connecting"
	case HostStateConnected:
		return "connected"
	case HostStateReconnecting:
		return "reconnecting"
	case HostStateFailed:
		return "failed"
	}
	return "unknown"
}

// HostState captures the current lifecycle state of a host plus any
// state-specific detail (reconnect attempt counter, last error).
type HostState struct {
	Kind    HostStateKind
	Attempt uint32
	Err     error
}

// ─── HostConfig ────────────────────────────────────────────────────────

// HostTransportFactory opens a fresh transport for a given host.
// Called once on `AddHost` and again on every reconnect attempt.
type HostTransportFactory func(ctx context.Context, host HostID) (ahp.Transport, error)

// ReconnectPolicy controls how aggressively a host retries after an
// unexpected drop. The zero value disables reconnection.
type ReconnectPolicy struct {
	// MaxAttempts caps the number of consecutive retry attempts. Zero
	// means unlimited.
	MaxAttempts uint32
	// InitialBackoff is the wait before the first retry.
	InitialBackoff time.Duration
	// MaxBackoff caps the exponential backoff between retries.
	MaxBackoff time.Duration
	// BackoffMultiplier scales each successive backoff. Use 2.0 for
	// classic exponential backoff.
	BackoffMultiplier float64
	// ResetOnSuccess resets the attempt counter and backoff when a
	// reconnect succeeds, so a later drop starts fresh from
	// InitialBackoff.
	ResetOnSuccess bool
}

// DefaultReconnectPolicy returns a reasonable exponential backoff:
// 1 s → 2 s → 4 s → … capped at 30 s, unlimited attempts, reset on
// success.
func DefaultReconnectPolicy() ReconnectPolicy {
	return ReconnectPolicy{
		InitialBackoff:    time.Second,
		MaxBackoff:        30 * time.Second,
		BackoffMultiplier: 2.0,
		ResetOnSuccess:    true,
	}
}

// DisabledReconnectPolicy returns a policy that does not attempt to
// reconnect after a drop.
func DisabledReconnectPolicy() ReconnectPolicy {
	return ReconnectPolicy{MaxAttempts: 0, InitialBackoff: 0}
}

// IsDisabled reports whether reconnection is disabled.
func (p ReconnectPolicy) IsDisabled() bool {
	return p.InitialBackoff <= 0
}

func (p ReconnectPolicy) backoffFor(attempt uint32) time.Duration {
	if p.IsDisabled() {
		return 0
	}
	b := float64(p.InitialBackoff)
	for i := uint32(1); i < attempt; i++ {
		mult := p.BackoffMultiplier
		if mult <= 0 {
			mult = 1
		}
		b *= mult
	}
	cap := time.Duration(b)
	if p.MaxBackoff > 0 && cap > p.MaxBackoff {
		cap = p.MaxBackoff
	}
	return cap
}

// HostConfig is everything [MultiHostClient.AddHost] needs to open
// and supervise a single host.
type HostConfig struct {
	// ID is the stable host identifier.
	ID HostID
	// Label is a human-readable name for the host. Surfaced on
	// [HostHandle.Label].
	Label string
	// ClientID is the stable AHP client identifier sent with
	// `initialize` and `reconnect`. Leave empty to let
	// [MultiHostClient] resolve it from a [ClientIDStore] (or mint
	// a fresh UUID and persist it).
	ClientID string
	// InitialSubscriptions defaults to ["ahp-root://"]. Override to
	// pre-subscribe to additional resources on `initialize`.
	InitialSubscriptions []string
	// ClientConfig configures the underlying [ahp.Client] driver.
	// Pass [ahp.Config]{} to use defaults.
	ClientConfig ahp.Config
	// TransportFactory opens a transport for this host. Required.
	TransportFactory HostTransportFactory
	// ReconnectPolicy controls reconnect behaviour on drops. Defaults
	// to [DefaultReconnectPolicy].
	ReconnectPolicy ReconnectPolicy
	// ProtocolVersions advertised on `initialize`. Defaults to
	// [ahptypes.SupportedProtocolVersions].
	ProtocolVersions []string
}

// NewHostConfig is a convenience constructor with sensible defaults.
func NewHostConfig(id HostID, label string, transport HostTransportFactory) HostConfig {
	return HostConfig{
		ID:                   id,
		Label:                label,
		InitialSubscriptions: []string{ahptypes.RootResourceURI},
		ClientConfig:         ahp.DefaultConfig(),
		TransportFactory:     transport,
		ReconnectPolicy:      DefaultReconnectPolicy(),
		ProtocolVersions:     ahptypes.SupportedProtocolVersions(),
	}
}

// ─── HostHandle ────────────────────────────────────────────────────────

// HostHandle is the observable snapshot a UI renders for one host.
// Returned by [MultiHostClient.Host] and via [MultiHostClient.Hosts].
//
// Snapshots are immutable copies; obtain a fresh one to see updates.
//
// Note: `Agents`, `Sessions`, and `Terminals` are reserved for a
// future release that wires the per-host root reducer into the
// supervisor. They are currently always nil; subscribe to
// [MultiHostClient.Subscriptions] and run the state through
// [ahp.ApplyActionToRoot] in the meantime.
type HostHandle struct {
	ID              HostID
	Label           string
	ClientID        string
	State           HostState
	ProtocolVersion string
	Automations     *ahptypes.AutomationCapabilities
	Agents          []ahptypes.AgentInfo
	Sessions        []ahptypes.SessionSummary
	Terminals       []ahptypes.TerminalInfo
	UpdatedAt       time.Time
}

// ─── ClientIDStore ─────────────────────────────────────────────────────

// ClientIDStore persists the stable `clientId` used to drive AHP's
// reconnect flow across launches.
type ClientIDStore interface {
	// Load returns the stored client ID for host, or ("", nil) if no
	// entry exists.
	Load(host HostID) (string, error)
	// Store persists clientID for host.
	Store(host HostID, clientID string) error
}

// InMemoryClientIDStore is a thread-safe in-memory [ClientIDStore].
// Suitable for tests and short-lived processes.
type InMemoryClientIDStore struct {
	mu   sync.Mutex
	data map[HostID]string
}

// NewInMemoryClientIDStore returns an empty in-memory store.
func NewInMemoryClientIDStore() *InMemoryClientIDStore {
	return &InMemoryClientIDStore{data: make(map[HostID]string)}
}

// Load implements [ClientIDStore].
func (s *InMemoryClientIDStore) Load(host HostID) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data[host], nil
}

// Store implements [ClientIDStore].
func (s *InMemoryClientIDStore) Store(host HostID, clientID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[host] = clientID
	return nil
}

// FileClientIDStore persists clientIds as a JSON file on disk.
// Suitable for desktop and mobile apps that want cross-launch
// identity. The file is created with mode 0600.
type FileClientIDStore struct {
	path string
	mu   sync.Mutex
}

// NewFileClientIDStore returns a [ClientIDStore] backed by a JSON
// file at path. The file is created on first write.
func NewFileClientIDStore(path string) *FileClientIDStore {
	return &FileClientIDStore{path: path}
}

func (s *FileClientIDStore) readAll() (map[HostID]string, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return map[HostID]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := map[HostID]string{}
	if len(data) == 0 {
		return out, nil
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("FileClientIDStore: parse %s: %w", s.path, err)
	}
	return out, nil
}

// Load implements [ClientIDStore].
func (s *FileClientIDStore) Load(host HostID) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.readAll()
	if err != nil {
		return "", err
	}
	return all[host], nil
}

// Store implements [ClientIDStore].
func (s *FileClientIDStore) Store(host HostID, clientID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.readAll()
	if err != nil {
		return err
	}
	all[host] = clientID
	b, err := json.MarshalIndent(all, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// generateClientID mints a fresh random 16-byte hex identifier.
func generateClientID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// ─── Events ────────────────────────────────────────────────────────────

// HostEvent is a connection-level event for UX (state changes,
// reconnect attempts, etc.).
type HostEvent struct {
	HostID HostID
	State  HostState
}

// HostSubscriptionEvent wraps an [ahp.SubscriptionEvent] with the
// originating host id and resource URI. Returned by
// [MultiHostClient.Events].
type HostSubscriptionEvent struct {
	HostID  HostID
	Channel ahptypes.URI
	Event   ahp.SubscriptionEvent
}

// ─── HostClientHandle ──────────────────────────────────────────────────

// HostClientHandle is a generation-checked escape hatch for callers
// that need direct access to the underlying [ahp.Client]. The handle
// refuses to dispatch through a connection that has since been
// replaced by a reconnect, returning [ErrHostReconnected] instead.
type HostClientHandle struct {
	host       *hostState
	generation uint64
}

// HostID returns the host this handle is bound to.
func (h *HostClientHandle) HostID() HostID { return h.host.id }

// Client returns the live [ahp.Client] for the current generation, or
// [ErrHostReconnected] if the connection has since been replaced.
func (h *HostClientHandle) Client() (*ahp.Client, error) {
	h.host.mu.RLock()
	defer h.host.mu.RUnlock()
	if h.host.generation != h.generation {
		return nil, ErrHostReconnected
	}
	if h.host.client == nil {
		return nil, ErrHostNotConnected
	}
	return h.host.client, nil
}

// ─── Errors ────────────────────────────────────────────────────────────

// ErrHostReconnected is returned by [HostClientHandle.Client] when
// the underlying connection has been replaced by a reconnect.
var ErrHostReconnected = errors.New("hosts: handle is stale; the host has reconnected")

// ErrHostNotConnected is returned by [HostClientHandle.Client] when
// the host has no active client (typically because the supervisor is
// between attempts).
var ErrHostNotConnected = errors.New("hosts: host is not currently connected")

// ErrUnknownHost is returned when an operation references an
// unregistered host ID.
var ErrUnknownHost = errors.New("hosts: unknown host id")

// ErrDuplicateHost is returned by [MultiHostClient.AddHost] when the
// id is already registered.
var ErrDuplicateHost = errors.New("hosts: host id already registered")

// ─── MultiHostClient ──────────────────────────────────────────────────

// hostState is the per-host bookkeeping the multi-host runtime owns.
type hostState struct {
	id          HostID
	label       string
	cfg         HostConfig
	mu          sync.RWMutex
	client      *ahp.Client
	state       HostState
	clientID    string
	protoVer    string
	automations *ahptypes.AutomationCapabilities
	agents      []ahptypes.AgentInfo
	sessions    []ahptypes.SessionSummary
	terminals   []ahptypes.TerminalInfo
	updatedAt   time.Time
	generation  uint64
	cancel      context.CancelFunc
	supervised  sync.WaitGroup
}

// MultiHostClient is the public multi-host registry + reconnect
// supervisor.
type MultiHostClient struct {
	mu       sync.RWMutex
	hosts    map[HostID]*hostState
	store    ClientIDStore
	eventsMu sync.Mutex
	events   []chan HostEvent
	subMu    sync.Mutex
	subs     []chan HostSubscriptionEvent

	rootCtx    context.Context
	rootCancel context.CancelFunc
}

// NewMultiHostClient constructs a fresh multi-host registry backed by
// an [InMemoryClientIDStore]. Use [MultiHostClient.WithClientIDStore]
// to plug in a different store.
func NewMultiHostClient() *MultiHostClient {
	ctx, cancel := context.WithCancel(context.Background())
	return &MultiHostClient{
		hosts:      make(map[HostID]*hostState),
		store:      NewInMemoryClientIDStore(),
		rootCtx:    ctx,
		rootCancel: cancel,
	}
}

// WithClientIDStore swaps the [ClientIDStore] used to resolve and
// persist host clientIds. Call before any [MultiHostClient.AddHost].
func (m *MultiHostClient) WithClientIDStore(store ClientIDStore) *MultiHostClient {
	m.mu.Lock()
	defer m.mu.Unlock()
	if store != nil {
		m.store = store
	}
	return m
}

// Single is a one-line constructor for the common "I just want one
// host" case. Returns the host handle for the only host so the caller
// doesn't have to look it up afterwards.
func Single(ctx context.Context, cfg HostConfig) (*MultiHostClient, *HostHandle, error) {
	m := NewMultiHostClient()
	handle, err := m.AddHost(ctx, cfg)
	if err != nil {
		_ = m.Shutdown(ctx)
		return nil, nil, err
	}
	return m, handle, nil
}

// AddHost registers cfg, opens its initial transport, runs the
// `initialize` handshake, and starts the reconnect supervisor. Returns
// a fresh [HostHandle] snapshot.
//
// The returned error is non-nil only if the initial open or
// `initialize` fails. Once the host is registered, subsequent
// disconnects are handled by the supervisor according to
// [HostConfig.ReconnectPolicy].
func (m *MultiHostClient) AddHost(ctx context.Context, cfg HostConfig) (*HostHandle, error) {
	if cfg.ID == "" {
		return nil, fmt.Errorf("hosts: HostConfig.ID is required")
	}
	if cfg.TransportFactory == nil {
		return nil, fmt.Errorf("hosts: HostConfig.TransportFactory is required for %s", cfg.ID)
	}
	if cfg.ReconnectPolicy == (ReconnectPolicy{}) {
		cfg.ReconnectPolicy = DefaultReconnectPolicy()
	}
	if len(cfg.InitialSubscriptions) == 0 {
		cfg.InitialSubscriptions = []string{ahptypes.RootResourceURI}
	}
	if len(cfg.ProtocolVersions) == 0 {
		cfg.ProtocolVersions = ahptypes.SupportedProtocolVersions()
	}

	m.mu.Lock()
	if _, exists := m.hosts[cfg.ID]; exists {
		m.mu.Unlock()
		return nil, ErrDuplicateHost
	}
	store := m.store
	m.mu.Unlock()

	clientID := cfg.ClientID
	if clientID == "" {
		stored, err := store.Load(cfg.ID)
		if err != nil {
			return nil, fmt.Errorf("hosts: load clientId for %s: %w", cfg.ID, err)
		}
		if stored != "" {
			clientID = stored
		} else {
			clientID = generateClientID()
		}
	}
	if err := store.Store(cfg.ID, clientID); err != nil {
		return nil, fmt.Errorf("hosts: persist clientId for %s: %w", cfg.ID, err)
	}

	hostCtx, cancel := context.WithCancel(m.rootCtx)
	hs := &hostState{
		id:        cfg.ID,
		label:     cfg.Label,
		cfg:       cfg,
		clientID:  clientID,
		state:     HostState{Kind: HostStateDisconnected},
		updatedAt: time.Now(),
		cancel:    cancel,
	}

	m.mu.Lock()
	m.hosts[cfg.ID] = hs
	m.mu.Unlock()

	// Initial connect attempt before returning.
	if err := m.openHost(ctx, hs); err != nil {
		m.setHostState(hs, HostState{Kind: HostStateFailed, Err: err})
		_ = m.removeHostLocked(cfg.ID)
		cancel()
		return nil, err
	}

	hs.supervised.Add(1)
	go m.supervise(hostCtx, hs)

	return m.snapshotHandle(hs), nil
}

// openHost opens the transport, wraps it in a Client, and runs the
// `initialize` handshake. Updates the host state to Connecting →
// Connected on success.
func (m *MultiHostClient) openHost(ctx context.Context, hs *hostState) error {
	m.setHostState(hs, HostState{Kind: HostStateConnecting})

	transport, err := hs.cfg.TransportFactory(ctx, hs.id)
	if err != nil {
		return fmt.Errorf("hosts: open transport: %w", err)
	}
	boxed := ahp.NewBoxedTransport(transport)

	client, err := ahp.Connect(ctx, boxed, hs.cfg.ClientConfig)
	if err != nil {
		return fmt.Errorf("hosts: connect: %w", err)
	}

	result, err := client.Initialize(ctx, hs.clientID, hs.cfg.ProtocolVersions, hs.cfg.InitialSubscriptions)
	if err != nil {
		_ = client.Shutdown(ctx)
		return fmt.Errorf("hosts: initialize: %w", err)
	}

	hs.mu.Lock()
	hs.client = client
	hs.protoVer = result.ProtocolVersion
	hs.automations = cloneAutomationCapabilities(result.Automations)
	hs.generation++
	hs.mu.Unlock()

	m.setHostState(hs, HostState{Kind: HostStateConnected})

	// Fan inbound events out to subscribers.
	go m.pumpEvents(hs, client)
	return nil
}

// pumpEvents drains the per-host [ahp.Client.Events] stream and
// re-emits each event tagged with the host id.
func (m *MultiHostClient) pumpEvents(hs *hostState, client *ahp.Client) {
	stream := client.Events()
	defer stream.Close()
	for ev := range stream.Events() {
		m.subMu.Lock()
		subs := append([]chan HostSubscriptionEvent(nil), m.subs...)
		m.subMu.Unlock()
		out := HostSubscriptionEvent{HostID: hs.id, Channel: ev.Channel, Event: ev.Event}
		for _, ch := range subs {
			select {
			case ch <- out:
			default:
			}
		}
	}
}

// supervise watches for transport drops and reconnects per
// [HostConfig.ReconnectPolicy].
func (m *MultiHostClient) supervise(ctx context.Context, hs *hostState) {
	defer hs.supervised.Done()
	policy := hs.cfg.ReconnectPolicy

	for {
		hs.mu.RLock()
		client := hs.client
		hs.mu.RUnlock()
		if client == nil {
			return
		}
		// Block on the client's Done channel — the centralised lifecycle
		// guarantees this closes on Shutdown, transport failure, or
		// reader/writer errors.
		select {
		case <-client.Done():
		case <-ctx.Done():
			return
		}

		select {
		case <-ctx.Done():
			return
		default:
		}
		if policy.IsDisabled() {
			m.setHostState(hs, HostState{Kind: HostStateFailed, Err: errors.New("hosts: transport closed and reconnect disabled")})
			return
		}

		// Ensure the old client is fully torn down before opening a
		// replacement (a no-op if Done fired from Shutdown already).
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = client.Shutdown(shutdownCtx)
		shutdownCancel()

		var attempt uint32 = 1
		for {
			m.setHostState(hs, HostState{Kind: HostStateReconnecting, Attempt: attempt})
			delay := policy.backoffFor(attempt)
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}

			if err := m.openHost(ctx, hs); err == nil {
				if policy.ResetOnSuccess {
					attempt = 0
				}
				break
			}
			attempt++
			if policy.MaxAttempts > 0 && attempt > policy.MaxAttempts {
				m.setHostState(hs, HostState{Kind: HostStateFailed, Err: fmt.Errorf("hosts: exceeded %d reconnect attempts", policy.MaxAttempts)})
				return
			}
		}
	}
}

// setHostState updates the host snapshot and notifies event
// listeners.
func (m *MultiHostClient) setHostState(hs *hostState, state HostState) {
	hs.mu.Lock()
	hs.state = state
	hs.updatedAt = time.Now()
	hs.mu.Unlock()

	m.eventsMu.Lock()
	subs := append([]chan HostEvent(nil), m.events...)
	m.eventsMu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- HostEvent{HostID: hs.id, State: state}:
		default:
		}
	}
}

// Host returns a fresh snapshot of the host with the given id, or
// nil if not registered.
func (m *MultiHostClient) Host(id HostID) *HostHandle {
	m.mu.RLock()
	hs, ok := m.hosts[id]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	return m.snapshotHandle(hs)
}

// Hosts returns a fresh snapshot of every registered host.
func (m *MultiHostClient) Hosts() []*HostHandle {
	m.mu.RLock()
	out := make([]*HostHandle, 0, len(m.hosts))
	for _, hs := range m.hosts {
		out = append(out, m.snapshotHandle(hs))
	}
	m.mu.RUnlock()
	return out
}

func (m *MultiHostClient) snapshotHandle(hs *hostState) *HostHandle {
	hs.mu.RLock()
	defer hs.mu.RUnlock()
	return &HostHandle{
		ID:              hs.id,
		Label:           hs.label,
		ClientID:        hs.clientID,
		State:           hs.state,
		ProtocolVersion: hs.protoVer,
		Automations:     cloneAutomationCapabilities(hs.automations),
		Agents:          append([]ahptypes.AgentInfo(nil), hs.agents...),
		Sessions:        append([]ahptypes.SessionSummary(nil), hs.sessions...),
		Terminals:       append([]ahptypes.TerminalInfo(nil), hs.terminals...),
		UpdatedAt:       hs.updatedAt,
	}
}

func cloneAutomationCapabilities(capabilities *ahptypes.AutomationCapabilities) *ahptypes.AutomationCapabilities {
	if capabilities == nil {
		return nil
	}

	clone := *capabilities
	if capabilities.Create != nil {
		value := *capabilities.Create
		clone.Create = &value
	}
	if capabilities.Schedules != nil {
		value := *capabilities.Schedules
		if capabilities.Schedules.MinIntervalMinutes != nil {
			minIntervalMinutes := *capabilities.Schedules.MinIntervalMinutes
			value.MinIntervalMinutes = &minIntervalMinutes
		}
		clone.Schedules = &value
	}
	if capabilities.RunCancellation != nil {
		value := *capabilities.RunCancellation
		clone.RunCancellation = &value
	}
	if capabilities.SchedulePreview != nil {
		value := *capabilities.SchedulePreview
		clone.SchedulePreview = &value
	}
	if capabilities.RunHistoryLimit != nil {
		value := *capabilities.RunHistoryLimit
		clone.RunHistoryLimit = &value
	}
	return &clone
}

// ClientHandle returns a generation-checked [HostClientHandle] for
// the named host, or ErrUnknownHost if the host is not registered.
func (m *MultiHostClient) ClientHandle(id HostID) (*HostClientHandle, error) {
	m.mu.RLock()
	hs, ok := m.hosts[id]
	m.mu.RUnlock()
	if !ok {
		return nil, ErrUnknownHost
	}
	hs.mu.RLock()
	gen := hs.generation
	hs.mu.RUnlock()
	return &HostClientHandle{host: hs, generation: gen}, nil
}

// RemoveHost unregisters a host and tears down its supervisor and
// client. Returns ErrUnknownHost if the host is not registered.
func (m *MultiHostClient) RemoveHost(ctx context.Context, id HostID) error {
	m.mu.Lock()
	hs, ok := m.hosts[id]
	delete(m.hosts, id)
	m.mu.Unlock()
	if !ok {
		return ErrUnknownHost
	}
	hs.cancel()
	hs.mu.RLock()
	client := hs.client
	hs.mu.RUnlock()
	if client != nil {
		_ = client.Shutdown(ctx)
	}
	hs.supervised.Wait()
	return nil
}

func (m *MultiHostClient) removeHostLocked(id HostID) error {
	m.mu.Lock()
	delete(m.hosts, id)
	m.mu.Unlock()
	return nil
}

// Events returns a fresh event stream of every host-level state
// transition. Each call yields an independent channel; callers must
// drain the channel or events for slow consumers are dropped.
func (m *MultiHostClient) Events() <-chan HostEvent {
	ch := make(chan HostEvent, 64)
	m.eventsMu.Lock()
	m.events = append(m.events, ch)
	m.eventsMu.Unlock()
	return ch
}

// Subscriptions returns a fresh stream of every inbound
// [HostSubscriptionEvent] from every registered host.
func (m *MultiHostClient) Subscriptions() <-chan HostSubscriptionEvent {
	ch := make(chan HostSubscriptionEvent, 256)
	m.subMu.Lock()
	m.subs = append(m.subs, ch)
	m.subMu.Unlock()
	return ch
}

// Shutdown tears down every host and releases registered event
// channels. After Shutdown the MultiHostClient is no longer usable.
func (m *MultiHostClient) Shutdown(ctx context.Context) error {
	m.rootCancel()
	m.mu.Lock()
	hosts := make([]*hostState, 0, len(m.hosts))
	for _, hs := range m.hosts {
		hosts = append(hosts, hs)
	}
	m.hosts = map[HostID]*hostState{}
	m.mu.Unlock()
	for _, hs := range hosts {
		hs.cancel()
		hs.mu.RLock()
		client := hs.client
		hs.mu.RUnlock()
		if client != nil {
			_ = client.Shutdown(ctx)
		}
		hs.supervised.Wait()
	}
	return nil
}
