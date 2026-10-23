package hosts

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// ManagedSubscription keeps its owner queue across initialize/re-subscribe
// cycles. Old deliveries precede the new snapshot; old releases send no credit.
type ManagedSubscription struct {
	mu        sync.Mutex
	operation sync.Mutex
	host      *hostState
	channel   string
	sub       *ahp.Subscription
	opts      ahp.SubscribeOptions
	changed   chan struct{}
	closed    bool
	err       error
	lifetime  context.Context
	cancel    context.CancelFunc
}

// SubscribeWithOptions subscribes on one host, retaining a windowed owner
// across connection replacement. A second call updates the same handle.
func (m *MultiHostClient) SubscribeWithOptions(ctx context.Context, id HostID, uri string, opts ahp.SubscribeOptions) (*ahptypes.SubscribeResult, *ManagedSubscription, error) {
	m.mu.RLock()
	hs := m.hosts[id]
	m.mu.RUnlock()
	if hs == nil {
		return nil, nil, ErrUnknownHost
	}
	hs.mu.Lock()
	s := hs.managed[uri]
	created := s == nil
	if s == nil {
		life, cancel := context.WithCancel(context.Background())
		s = &ManagedSubscription{host: hs, channel: uri, changed: make(chan struct{}), lifetime: life, cancel: cancel}
		hs.managed[uri] = s
	}
	hs.mu.Unlock()
	s.operation.Lock()
	defer s.operation.Unlock()
	hs.mu.RLock()
	client := hs.client
	hs.mu.RUnlock()
	if client == nil {
		if created {
			s.drop(ErrHostNotConnected)
		}
		return nil, s, ErrHostNotConnected
	}
	select {
	case <-client.Done():
		if created {
			s.drop(ErrHostNotConnected)
		}
		return nil, s, ErrHostNotConnected
	default:
	}
	opCtx, finish := s.operationContext(ctx)
	defer finish()
	result, sub, err := client.SubscribeWithOptions(opCtx, uri, opts)
	if err != nil {
		if created {
			s.drop(err)
		}
		return nil, s, err
	}
	s.mu.Lock()
	if s.closed {
		err := s.err
		s.mu.Unlock()
		sub.Close()
		return nil, s, err
	}
	s.sub, s.opts, s.closed, s.err = sub, cloneOptions(opts), false, nil
	s.signalLocked()
	s.mu.Unlock()
	return result, s, nil
}

func cloneOptions(o ahp.SubscribeOptions) ahp.SubscribeOptions {
	if o.Window != nil {
		w := *o.Window
		if w.Coalescing != nil {
			v := *w.Coalescing
			w.Coalescing = &v
		}
		o.Window = &w
	}
	if o.Delivery != nil {
		v := *o.Delivery
		if v.MaxLatencyMs != nil {
			n := *v.MaxLatencyMs
			v.MaxLatencyMs = &n
		}
		o.Delivery = &v
	}
	if o.View != nil {
		v := *o.View
		if v.Turns != nil {
			n := *v.Turns
			v.Turns = &n
		}
		o.View = &v
	}
	return o
}
func (s *ManagedSubscription) signalLocked()  { close(s.changed); s.changed = make(chan struct{}) }
func (s *ManagedSubscription) URI() string    { return s.channel }
func (s *ManagedSubscription) HostID() HostID { return s.host.id }

func (s *ManagedSubscription) resume(ctx context.Context, client *ahp.Client) error {
	s.operation.Lock()
	defer s.operation.Unlock()
	s.mu.Lock()
	if s.closed || s.sub == nil {
		s.mu.Unlock()
		return nil
	}
	sub, opts := s.sub, cloneOptions(s.opts)
	s.mu.Unlock()
	if opts.Window == nil || strings.HasPrefix(s.channel, "ahp-tcp:") {
		s.drop(ahp.ErrSubscriptionDropped)
		return nil
	}
	opCtx, finish := s.operationContext(ctx)
	defer finish()
	_, err := client.ResumeSubscription(opCtx, sub, opts)
	if err != nil {
		select {
		case <-client.Done():
			return err
		default:
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		s.mu.Lock()
		closed := s.closed
		s.mu.Unlock()
		if !closed {
			s.drop(fmt.Errorf("%w: %v", ahp.ErrSubscriptionDropped, err))
		}
		return nil
	}
	s.mu.Lock()
	s.signalLocked()
	s.mu.Unlock()
	return nil
}

// Next waits through managed reconnects. ReceiveAuto releases on the next call.
func (s *ManagedSubscription) Next(ctx context.Context) (*ahp.Delivery, error) {
	for {
		s.mu.Lock()
		if s.closed {
			err := s.err
			s.mu.Unlock()
			return nil, err
		}
		sub, changed := s.sub, s.changed
		s.mu.Unlock()
		if sub != nil {
			d, err := sub.Next(ctx)
			if err == nil {
				return d, nil
			}
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if sub.Err() == nil && !errors.Is(err, ahp.ErrClosed) && !errors.Is(err, ahp.ErrShutdown) {
				return nil, err
			}
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-changed:
		}
	}
}
func (s *ManagedSubscription) FlowControl() ahp.FlowControlStatus {
	s.mu.Lock()
	sub := s.sub
	s.mu.Unlock()
	if sub == nil {
		return ahp.FlowControlStatus{Mode: "ordinary"}
	}
	return sub.FlowControl()
}
func (s *ManagedSubscription) FlowControlChanges() <-chan ahp.FlowControlStatus {
	s.mu.Lock()
	sub := s.sub
	s.mu.Unlock()
	if sub == nil {
		ch := make(chan ahp.FlowControlStatus)
		close(ch)
		return ch
	}
	return sub.FlowControlChanges()
}
func (s *ManagedSubscription) WaitWritable(ctx context.Context) error {
	for {
		s.mu.Lock()
		if s.closed {
			err := s.err
			s.mu.Unlock()
			return err
		}
		sub, changed := s.sub, s.changed
		s.mu.Unlock()
		if sub != nil {
			err := sub.WaitWritable(ctx)
			if err == nil {
				return nil
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if sub.Err() == nil && !errors.Is(err, ahp.ErrClosed) && !errors.Is(err, ahp.ErrShutdown) {
				return err
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-changed:
		}
	}
}
func (s *ManagedSubscription) Update(ctx context.Context, opts ahp.SubscribeOptions) (*ahptypes.SubscribeResult, error) {
	s.operation.Lock()
	defer s.operation.Unlock()
	s.mu.Lock()
	sub := s.sub
	s.mu.Unlock()
	if sub == nil {
		return nil, ErrHostNotConnected
	}
	opCtx, finish := s.operationContext(ctx)
	defer finish()
	result, err := sub.Update(opCtx, opts)
	if err == nil {
		s.mu.Lock()
		s.opts = cloneOptions(opts)
		s.mu.Unlock()
	}
	return result, err
}
func (s *ManagedSubscription) Err() error { s.mu.Lock(); defer s.mu.Unlock(); return s.err }
func (s *ManagedSubscription) drop(err error) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed, s.err = true, err
	sub := s.sub
	s.cancel()
	s.signalLocked()
	s.mu.Unlock()
	s.host.mu.Lock()
	if s.host.managed[s.channel] == s {
		delete(s.host.managed, s.channel)
	}
	s.host.mu.Unlock()
	if sub != nil {
		sub.Close()
	}
}

// Close unsubscribes and permanently removes this managed owner.
func (s *ManagedSubscription) Close(ctx context.Context) error {
	s.drop(ahp.ErrClosed)
	return nil
}

func (s *ManagedSubscription) operationContext(ctx context.Context) (context.Context, context.CancelFunc) {
	op, cancel := context.WithCancel(ctx)
	stop := context.AfterFunc(s.lifetime, cancel)
	return op, func() { stop(); cancel() }
}
func (m *MultiHostClient) closeManaged(hs *hostState, err error) {
	hs.mu.RLock()
	subs := make([]*ManagedSubscription, 0, len(hs.managed))
	for _, s := range hs.managed {
		subs = append(subs, s)
	}
	hs.mu.RUnlock()
	for _, s := range subs {
		s.drop(err)
	}
}
func (m *MultiHostClient) dropManagedTCP(hs *hostState) {
	hs.mu.RLock()
	subs := make([]*ManagedSubscription, 0)
	for uri, s := range hs.managed {
		if strings.HasPrefix(uri, "ahp-tcp:") {
			subs = append(subs, s)
		}
	}
	hs.mu.RUnlock()
	for _, s := range subs {
		s.drop(ahp.ErrSubscriptionDropped)
	}
}

type HostFlowControlEvent struct {
	HostID HostID
	Event  ahp.FlowControlEvent
}

// FlowControlEvents observes telemetry from every host; it never releases credit.
func (m *MultiHostClient) FlowControlEvents() <-chan HostFlowControlEvent {
	ch := make(chan HostFlowControlEvent, 64)
	m.flowMu.Lock()
	select {
	case <-m.rootCtx.Done():
		close(ch)
	default:
		m.flowEvents = append(m.flowEvents, ch)
	}
	m.flowMu.Unlock()
	return ch
}
func (m *MultiHostClient) pumpFlowEvents(hs *hostState, client *ahp.Client, resuming bool) {
	for event := range client.FlowControlEvents() {
		if resuming && event.Kind == "negotiated" {
			event.Kind = "resumed"
		}
		m.flowMu.Lock()
		for _, ch := range m.flowEvents {
			select {
			case ch <- HostFlowControlEvent{HostID: hs.id, Event: event}:
			default:
			}
		}
		m.flowMu.Unlock()
	}
}
