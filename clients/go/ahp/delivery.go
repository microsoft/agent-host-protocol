package ahp

import (
	"context"
	"encoding/json"
	"io"
	"sync"
	"sync/atomic"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// SubscriptionEventSnapshot is the initial or replacement channel snapshot.
type SubscriptionEventSnapshot struct {
	Params ahptypes.ChannelSnapshotParams
}

func (SubscriptionEventSnapshot) isSubscriptionEvent() {}

type SubscriptionEventTCPData struct{ Params ahptypes.TcpDataParams }

func (SubscriptionEventTCPData) isSubscriptionEvent() {}

type SubscriptionEventTCPEOF struct{ Params ahptypes.TcpEofParams }

func (SubscriptionEventTCPEOF) isSubscriptionEvent() {}

type SubscriptionEventTCPReset struct{ Params ahptypes.TcpResetParams }

func (SubscriptionEventTCPReset) isSubscriptionEvent() {}

// SubscriptionEventNotification retains notifications without a dedicated event.
type SubscriptionEventNotification struct{ Notification ahptypes.JsonRpcNotification }

func (SubscriptionEventNotification) isSubscriptionEvent() {}

func eventForNotification(n ahptypes.JsonRpcNotification) (SubscriptionEvent, error) {
	decode := func(out any) error { return json.Unmarshal(n.Params, out) }
	switch n.Method {
	case "action":
		var p ahptypes.ActionEnvelope
		err := decode(&p)
		return SubscriptionEventAction{Envelope: p}, err
	case "channel/snapshot":
		var p ahptypes.ChannelSnapshotParams
		err := decode(&p)
		return SubscriptionEventSnapshot{Params: p}, err
	case "tcp/data":
		var p ahptypes.TcpDataParams
		err := decode(&p)
		return SubscriptionEventTCPData{Params: p}, err
	case "tcp/eof":
		var p ahptypes.TcpEofParams
		err := decode(&p)
		return SubscriptionEventTCPEOF{Params: p}, err
	case "tcp/reset":
		var p ahptypes.TcpResetParams
		err := decode(&p)
		return SubscriptionEventTCPReset{Params: p}, err
	case "root/sessionAdded":
		var p ahptypes.SessionAddedParams
		err := decode(&p)
		return SubscriptionEventSessionAdded{Params: p}, err
	case "root/sessionRemoved":
		var p ahptypes.SessionRemovedParams
		err := decode(&p)
		return SubscriptionEventSessionRemoved{Params: p}, err
	case "root/sessionSummaryChanged":
		var p ahptypes.SessionSummaryChangedParams
		err := decode(&p)
		return SubscriptionEventSessionSummaryChanged{Params: p}, err
	case "auth/required":
		var p ahptypes.AuthRequiredParams
		err := decode(&p)
		return SubscriptionEventAuthRequired{Params: p}, err
	default:
		return SubscriptionEventNotification{Notification: n}, nil
	}
}

// Delivery owns the credit for an event. Release is idempotent and can be
// called from another goroutine. WireBytes includes already-credited fragments.
type Delivery struct {
	event        SubscriptionEvent
	notification ahptypes.JsonRpcNotification
	bytes        int64
	epoch        uint64
	credit       int64
	source       *channelFlow
	release      func()
	released     atomic.Bool
}

func newDelivery(n ahptypes.JsonRpcNotification, event SubscriptionEvent, bytes int64, release func()) *Delivery {
	return &Delivery{event: event, notification: n, bytes: bytes, release: release}
}
func (d *Delivery) Event() SubscriptionEvent { return d.event }
func (d *Delivery) Notification() ahptypes.JsonRpcNotification {
	n := d.notification
	n.Params = append(json.RawMessage(nil), n.Params...)
	return n
}
func (d *Delivery) WireBytes() int64 { return d.bytes }
func (d *Delivery) Release() {
	if d != nil && d.released.CompareAndSwap(false, true) && d.release != nil {
		d.release()
	}
}

type deliveryQueue struct {
	mu             sync.Mutex
	nextGate       chan struct{}
	updateGate     chan struct{}
	engine         *flowEngine
	flow           *channelFlow
	items          []*Delivery
	previous       *Delivery
	mode           ReceiveMode
	changed        chan struct{}
	closed         bool
	final          bool
	err            error
	status         FlowControlStatus
	statusStreams  []chan FlowControlStatus
	unreleased     int64
	releaseVersion uint64
}

func newDeliveryQueue() *deliveryQueue {
	return &deliveryQueue{changed: make(chan struct{}), nextGate: make(chan struct{}, 1), updateGate: make(chan struct{}, 1), status: FlowControlStatus{Mode: "ordinary", Writable: true}}
}
func (q *deliveryQueue) signalLocked() { close(q.changed); q.changed = make(chan struct{}) }
func (q *deliveryQueue) bind(e *flowEngine, f *channelFlow) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.engine, q.flow, q.closed, q.err = e, f, false, nil
	q.signalLocked()
}
func (q *deliveryQueue) binding() (*flowEngine, *channelFlow) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.engine, q.flow
}
func (q *deliveryQueue) setMode(opts SubscribeOptions) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.mode = ReceiveAuto
	if opts.Window != nil {
		q.mode = opts.Window.Receive
	}
}
func (q *deliveryQueue) publish(status FlowControlStatus) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.final {
		status.Writable = false
	}
	q.status = status
	for _, ch := range q.statusStreams {
		select {
		case ch <- status:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- status:
			default:
			}
		}
	}
	q.signalLocked()
}
func (q *deliveryQueue) close(err error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.final {
		return
	}
	q.closed, q.err = true, err
	q.signalLocked()
}

func (q *deliveryQueue) finishLocked(err error) {
	if q.final {
		return
	}
	q.closed, q.final, q.err = true, true, err
	q.items, q.previous = nil, nil
	q.status.Writable = false
	q.status.BufferedReceiveBytes = 0
	q.unreleased = 0
	q.releaseVersion++
	for _, ch := range q.statusStreams {
		close(ch)
	}

	q.statusStreams = nil
	q.signalLocked()
}

func (q *deliveryQueue) isFinal() bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.final
}

// Next retrieves the next credit-owning delivery. ReceiveAuto releases the
// previous delivery before waiting, including when ctx is canceled.
// Do not use Events as a substitute: it is an observe-only, lossy channel.
func (s *Subscription) Next(ctx context.Context) (*Delivery, error) {
	if s.owner == nil {
		return nil, io.EOF
	}
	q := s.owner
	select {
	case q.nextGate <- struct{}{}:
		defer func() { <-q.nextGate }()
	case <-ctx.Done():
		q.advance()
		return nil, ctx.Err()
	}
	q.advance()
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		q.mu.Lock()
		if len(q.items) > 0 {
			d := q.items[0]
			q.items[0] = nil
			q.items = q.items[1:]
			if q.mode == ReceiveAuto {
				q.previous = d
			}
			q.mu.Unlock()
			return d, nil
		}
		if q.closed {
			err := q.err
			q.mu.Unlock()
			if err == nil {
				err = io.EOF
			}
			return nil, err
		}
		changed := q.changed
		q.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-changed:
		}
	}
}

func (q *deliveryQueue) advance() {
	q.mu.Lock()
	prev := q.previous
	q.previous = nil
	q.mu.Unlock()
	if prev != nil {
		prev.Release()
	}
}

// FlowControl returns current backpressure; its limits are an independent copy.
func (s *Subscription) FlowControl() FlowControlStatus {
	if s.owner == nil {
		return FlowControlStatus{Mode: "ordinary", Writable: true}
	}
	q := s.owner
	q.mu.Lock()
	defer q.mu.Unlock()
	status := q.status
	if status.Limits != nil {
		l := *status.Limits
		status.Limits = &l
	}
	return status
}

// FlowControlChanges returns a conflated status stream, initially current status.
func (s *Subscription) FlowControlChanges() <-chan FlowControlStatus {
	ch := make(chan FlowControlStatus, 1)
	if s.owner == nil {
		ch <- s.FlowControl()
		return ch
	}
	q := s.owner
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.final {
		ch <- q.status
		close(ch)
		return ch
	}
	ch <- q.status
	q.statusStreams = append(q.statusStreams, ch)
	return ch
}
func (s *Subscription) WaitWritable(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if s.owner == nil {
		return nil
	}
	q := s.owner
	for {
		q.mu.Lock()
		if q.closed {
			err := q.err
			q.mu.Unlock()
			return err
		}
		if q.status.Writable {
			q.mu.Unlock()
			return nil
		}
		changed := q.changed
		q.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-changed:
		}
	}
}
func (s *Subscription) Err() error {
	if s.owner == nil {
		return nil
	}
	s.owner.mu.Lock()
	defer s.owner.mu.Unlock()
	return s.owner.err
}
