package ahp

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func (e *flowEngine) prepareReconnect(raw json.RawMessage) (json.RawMessage, *requestHooks, error) {
	var p ahptypes.ReconnectParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return raw, nil, err
	}
	subs := make(map[string]bool)
	for _, uri := range p.Subscriptions {
		if strings.HasPrefix(uri, "ahp-tcp:") {
			return raw, nil, fmt.Errorf("ahp: TCP cannot resume")
		}
		subs[uri] = true
	}
	if p.Windows == nil {
		return raw, nil, nil
	}
	requested := make(map[string]ahptypes.ChannelDeliveryResumeParams)
	for _, item := range p.Windows.Items {
		if _, exists := requested[item.Channel]; exists || !subs[item.Channel] || strings.HasPrefix(item.Channel, "ahp-tcp:") {
			return raw, nil, fmt.Errorf("ahp: invalid reconnect window channel")
		}
		if err := validLimits(item.FlowControl.Receive); err != nil {
			return raw, nil, err
		}
		if item.LastAppliedServerSeq != nil && (*item.LastAppliedServerSeq < 0 || *item.LastAppliedServerSeq > maxWindowInteger) {
			return raw, nil, fmt.Errorf("ahp: invalid resume sequence")
		}
		requested[item.Channel] = item
	}
	if !e.capabilities.SupportsWindowedDelivery {
		return raw, nil, fmt.Errorf("ahp: reconnect windows require raw transport")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.stopped {
		return raw, nil, ErrShutdown
	}
	h := &requestHooks{done: make(chan struct{}), flows: make(map[*channelFlow]struct{})}
	flows := make(map[string]*channelFlow)
	owners := make(map[string]*Subscription)
	for uri := range requested {
		f := e.getLocked(uri)
		if f.owner == nil {
			e.attachLocked(f, nil)
		}
		flows[uri], owners[uri] = f, f.owner
		if f.requests == nil {
			f.requests = make(map[*requestHooks]struct{})
		}
		f.requests[h] = struct{}{}
		h.flows[f] = struct{}{}
	}
	h.cancel = func() {
		e.mu.Lock()
		defer e.mu.Unlock()
		for _, f := range flows {
			e.retireLocked(f, ErrClosed, true)
		}
	}
	h.failed = func(err error) {
		e.mu.Lock()
		defer e.mu.Unlock()
		for _, f := range flows {
			delete(f.requests, h)
			if !f.accepted {
				e.retireLocked(f, err, true)
			}
		}
	}
	h.complete = func(result json.RawMessage) error {
		e.mu.Lock()
		defer e.mu.Unlock()
		if e.stopped {
			return nil
		}
		active := len(flows) == 0
		for uri, f := range flows {
			if e.channels[uri] == f && f.owner == owners[uri] && !owners[uri].owner.isFinal() {
				active = true
				break
			}
		}
		if !active {
			return nil
		}
		var r struct {
			Windows *ahptypes.ChannelDeliveryResumeResult `json:"windows"`
		}
		if err := json.Unmarshal(result, &r); err != nil {
			return err
		}
		kept := make(map[string]bool)
		if r.Windows != nil {
			for _, item := range r.Windows.Items {
				offer, ok := requested[item.Channel]
				if !ok || kept[item.Channel] {
					return fmt.Errorf("ahp: unexpected resumed channel")
				}
				kept[item.Channel] = true
				f, owner := flows[item.Channel], owners[item.Channel]
				if e.channels[item.Channel] != f || f.owner != owner || owner.owner.isFinal() {
					continue
				}
				if err := validateAccepted(&item.FlowControl, &offer.FlowControl); err != nil {
					return err
				}
				if item.Recovery != ahptypes.ChannelRecoveryKindSnapshot && item.Recovery != ahptypes.ChannelRecoveryKindReplay && item.Recovery != ahptypes.ChannelRecoveryKindLive {
					return fmt.Errorf("ahp: unknown recovery kind")
				}
				delete(f.requests, h)
				e.failQueueLocked(f, ErrShutdown)
				f.epoch++
				if f.creditTimer != nil {
					f.creditTimer.Stop()
					f.creditTimer = nil
				}
				f.creditReady = false
				f.sent, f.consumed, f.received, f.released, f.advertised = 0, 0, 0, 0, 0
				f.fragments.Reset()
				f.fragmenting = false
				f.fragmentBytes = 0
				l := item.FlowControl
				f.limits = &l
				f.accepted = true
				if f.opts.Window == nil {
					f.opts.Window = &WindowOptions{}
				}
				f.opts.Window.WindowBytes = offer.FlowControl.Receive.WindowBytes
				f.opts.Window.MaximumFrameBytes = offer.FlowControl.Receive.MaximumFrameBytes
				f.expectSnapshot = item.Recovery == ahptypes.ChannelRecoveryKindSnapshot
				owner.owner.setMode(f.opts)
				e.emitLocked(f, "resumed")
			}
		}
		for uri, f := range flows {
			if !kept[uri] {
				delete(f.requests, h)
				e.retireLocked(f, ErrSubscriptionDropped, false)
			}
		}
		e.signal()
		return nil
	}
	return raw, h, nil
}
