package ahp

import (
	"encoding/json"
	"errors"
	"sync"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// Hooks belong to one request and one set of captured flow instances. Retiring
// a flow wakes its callers; a late response cannot revive a replacement owner.
type requestHooks struct {
	complete func(json.RawMessage) error
	failed   func(error)
	cancel   func()
	done     chan struct{}
	once     sync.Once
	err      error
	written  bool // guarded by flowEngine.mu
	flows    map[*channelFlow]struct{}
}

type flowCleanup struct {
	channel string
	done    chan error
}

func (h *requestHooks) drop(err error) {
	h.once.Do(func() { h.err = err; close(h.done) })
}

func (e *flowEngine) retireLocked(f *channelFlow, err error, notify bool) {
	if e.channels[f.channel] != f {
		return
	}
	written := f.accepted
	f.dropped = true
	f.epoch++
	if f.creditTimer != nil {
		f.creditTimer.Stop()
		f.creditTimer = nil
	}
	f.creditReady = false
	f.fragments.Reset()
	f.fragmenting = false
	e.failQueueLocked(f, err)
	for h := range f.requests {
		written = written || h.written
		delete(h.flows, f)
		if len(h.flows) == 0 {
			h.drop(err)
		}
	}
	f.requests = nil
	if f.owner != nil {
		q := f.owner.owner
		q.mu.Lock()
		q.finishLocked(err)
		q.mu.Unlock()
		e.emitLocked(f, "dropped")
	}
	e.c.subscriptionsMu.Lock()
	subs := e.c.subscriptions[f.channel]
	delete(e.c.subscriptions, f.channel)
	if !written && !f.accepted && !errors.Is(err, ErrSubscriptionDropped) {
		var closing []*Subscription
		for _, sub := range subs {
			if sub == f.owner {
				closing = append(closing, sub)
			} else {
				e.c.subscriptions[f.channel] = append(e.c.subscriptions[f.channel], sub)
			}
		}
		subs = closing
	}
	e.c.subscriptionsMu.Unlock()
	for _, s := range subs {
		s.closeEvents()
	}
	delete(e.channels, f.channel)
	for i, uri := range e.order {
		if uri == f.channel {
			copy(e.order[i:], e.order[i+1:])
			e.order[len(e.order)-1] = ""
			e.order = e.order[:len(e.order)-1]
			if e.cursor > i {
				e.cursor--
			}
			if e.creditCursor > i {
				e.creditCursor--
			}
			break
		}
	}
	if e.cursor >= len(e.order) {
		e.cursor = 0
	}
	if e.creditCursor >= len(e.order) {
		e.creditCursor = 0
	}
	if notify && written && !e.stopped {
		e.cleanup = append(e.cleanup, flowCleanup{channel: f.channel})
		e.signal()
	}
}

// Subscription returns the current owner, including handles created by raw
// subscribe or ReconnectWithParams. Retired subscriptions are not returned.
func (c *Client) Subscription(uri string) (*Subscription, bool) {
	c.flow.mu.Lock()
	defer c.flow.mu.Unlock()
	f := c.flow.channels[uri]
	if f == nil || f.dropped || f.owner == nil {
		return nil, false
	}
	return f.owner, true
}

func (e *flowEngine) beginRequest(h *requestHooks) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	select {
	case <-h.done:
		return false
	default:
		h.written = true
		return true
	}
}

func (e *flowEngine) nextCleanup() (*flowWrite, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.cleanup) == 0 || e.stopped {
		return nil, nil
	}
	cleanup := e.cleanup[0]
	e.cleanup[0] = flowCleanup{}
	e.cleanup = e.cleanup[1:]
	if len(e.cleanup) == 0 {
		e.cleanup = nil
	}
	raw, err := json.Marshal(ahptypes.UnsubscribeParams{Channel: cleanup.channel})
	if err != nil {
		return nil, err
	}
	text, err := encodeNotification(ahptypes.JsonRpcNotification{JsonRpc: ahptypes.JsonRpcV2, Method: "unsubscribe", Params: raw})
	if err != nil {
		return nil, err
	}
	return &flowWrite{wire: NewTextMessage(text), controlDone: cleanup.done}, nil
}
