package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func flowHealthy(t *testing.T, c *Client, wire *corpusTransport, ctx context.Context) {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- c.Ping(ctx) }()
	m := readFlowWire(t, wire)
	for m.Notification != nil && m.Notification.Method == "channel/credit" {
		m = readFlowWire(t, wire)
	}
	if m.Request == nil || m.Request.Method != "ping" {
		t.Fatalf("unexpected wire message: %s", mustJSON(m))
	}
	hostFlowReply(t, wire, m, nil)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	if c.Err() != nil {
		t.Fatal(c.Err())
	}
}

func TestWindowingNonObjectParamsPreserveLegacyBehavior(t *testing.T) {
	for _, windowed := range []bool{false, true} {
		t.Run(fmt.Sprint(windowed), func(t *testing.T) {
			c, wire, ctx := flowTestClient(t, DefaultConfig())
			uri := "ahp-terminal:/t"
			var s *Subscription
			if windowed {
				s = subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(1024, 1024))
				initialFlowSnapshot(wire, uri, 0)
				d, err := s.Next(ctx)
				if err != nil {
					t.Fatal(err)
				}
				d.Release()
			} else {
				s = c.AttachSubscription(uri)
			}
			for _, params := range []string{"", `,"params":[]`, `,"params":null`, `,"params":17`, `,"params":"text"`} {
				wire.in <- NewTextMessage(`{"jsonrpc":"2.0","method":"action"` + params + `}`)
			}
			hostFlowNotification(wire, "action", map[string]any{"channel": uri, "action": map[string]any{"type": "terminal/data", "data": "alive"}, "serverSeq": 1})
			if windowed {
				d, err := s.Next(ctx)
				if err != nil {
					t.Fatal(err)
				}
				d.Release()
			} else {
				select {
				case <-s.Events():
				case <-ctx.Done():
					t.Fatal(ctx.Err())
				}
			}
			flowHealthy(t, c, wire, ctx)
		})
	}
}

func TestWindowingLateCanceledSubscribeDoesNotCloseConnection(t *testing.T) {
	for _, defaultTimeout := range []bool{false, true} {
		t.Run(fmt.Sprint(defaultTimeout), func(t *testing.T) {
			cfg := DefaultConfig()
			if defaultTimeout {
				cfg.DefaultRequestTimeout = 15 * time.Millisecond
			}
			c, wire, ctx := flowTestClient(t, cfg)
			op := context.Background()
			cancel := func() {}
			if !defaultTimeout {
				op, cancel = context.WithTimeout(ctx, 15*time.Millisecond)
			}
			defer cancel()
			done := make(chan error, 1)
			go func() {
				_, _, err := c.SubscribeWithOptions(op, "ahp-terminal:/late", SubscribeOptions{Window: &WindowOptions{}})
				done <- err
			}()
			request := readFlowWire(t, wire)
			if err := <-done; !errors.Is(err, context.DeadlineExceeded) {
				t.Fatal(err)
			}
			unsubscribe := readFlowWire(t, wire)
			if unsubscribe.Notification == nil || unsubscribe.Notification.Method != "unsubscribe" {
				t.Fatal("abandoned offer was not unsubscribed")
			}
			hostFlowReply(t, wire, request, &ahptypes.SubscribeResult{FlowControl: acceptedFlow(512, 1024)})
			initialFlowSnapshot(wire, "ahp-terminal:/late", 0)
			hostFlowNotification(wire, "channel/frame", ahptypes.ChannelFrameParams{Channel: "ahp-terminal:/late", Data: "ignored"})
			if _, ok := c.Subscription("ahp-terminal:/late"); ok {
				t.Fatal("canceled owner remains reachable")
			}
			flowHealthy(t, c, wire, ctx)
			if err := c.Notify(ctx, "app/data", map[string]any{"channel": "ahp-terminal:/late", "text": "ordinary"}); err != nil {
				t.Fatal(err)
			}
			if m := readFlowWire(t, wire); m.Notification == nil || m.Notification.Method != "app/data" {
				t.Fatal("stale flow held a later send")
			}
			c.flow.mu.Lock()
			count := len(c.flow.channels) + len(c.flow.order)
			c.flow.mu.Unlock()
			if count != 0 {
				t.Fatal("canceled flow leaked scheduler entries")
			}
		})
	}
}

func TestWindowingFailedSubscribeAndUpdateRollback(t *testing.T) {
	for _, existing := range []bool{false, true} {
		t.Run(fmt.Sprint(existing), func(t *testing.T) {
			c, wire, ctx := flowTestClient(t, DefaultConfig())
			uri := "ahp-terminal:/failure"
			var old *Subscription
			if existing {
				old = subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(512, 1024))
			}
			done := make(chan error, 1)
			go func() {
				_, _, err := c.SubscribeWithOptions(ctx, uri, SubscribeOptions{Window: &WindowOptions{WindowBytes: 1000}})
				done <- err
			}()
			request := readFlowWire(t, wire)
			b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": request.Request.ID, "error": map[string]any{"code": ahptypes.ErrorCodePermissionDenied, "message": "denied"}})
			wire.in <- NewTextMessage(string(b))
			var rpc *RPCError
			if err := <-done; !errors.As(err, &rpc) {
				t.Fatal("RPC failure was not preserved", err)
			}
			current, ok := c.Subscription(uri)
			if existing && (!ok || current != old || current.FlowControl().Limits.ClientReceive.WindowBytes != 512) {
				t.Fatal("failed update changed an accepted owner")
			}
			if !existing && ok {
				t.Fatal("failed new owner remained registered")
			}
			flowHealthy(t, c, wire, ctx)
		})
	}
}

func TestWindowingCloseWhileSubscribeHookIsClaimed(t *testing.T) {
	for _, unsubscribe := range []bool{false, true} {
		t.Run(fmt.Sprint(unsubscribe), func(t *testing.T) {
			c, wire, ctx := flowTestClient(t, DefaultConfig())
			uri := "ahp-terminal:/race"
			done := make(chan error, 1)
			go func() {
				_, _, err := c.SubscribeWithOptions(ctx, uri, SubscribeOptions{Window: &WindowOptions{}})
				done <- err
			}()
			request := readFlowWire(t, wire)
			claimed, allow := make(chan struct{}), make(chan struct{})
			c.pendingMu.Lock()
			h := c.pendingHooks[request.Request.ID]
			complete := h.complete
			h.complete = func(raw json.RawMessage) error { close(claimed); <-allow; return complete(raw) }
			c.pendingMu.Unlock()
			hostFlowReply(t, wire, request, &ahptypes.SubscribeResult{FlowControl: acceptedFlow(512, 1024)})
			<-claimed
			if unsubscribe {
				if err := c.Unsubscribe(ctx, uri); err != nil {
					t.Fatal(err)
				}
			} else {
				s, ok := c.Subscription(uri)
				if !ok {
					t.Fatal("owner missing")
				}
				s.Close()
			}
			close(allow)
			if err := <-done; !errors.Is(err, ErrClosed) {
				t.Fatal("abandoned subscribe did not fail locally", err)
			}
			m := readFlowWire(t, wire)
			if m.Notification == nil || m.Notification.Method != "unsubscribe" {
				t.Fatal("missing unsubscribe")
			}
			initialFlowSnapshot(wire, uri, 0)
			flowHealthy(t, c, wire, ctx)
		})
	}
}

func TestWindowingFreshReconnectOwnersAreReachable(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	done := make(chan error, 1)
	go func() {
		_, err := c.ReconnectWithParams(ctx, ahptypes.ReconnectParams{ClientId: "client", Subscriptions: []string{"ahp-terminal:/a", "ahp-terminal:/b"}, Windows: &ahptypes.ChannelDeliveryResumeOptions{Items: []ahptypes.ChannelDeliveryResumeParams{
			{Channel: "ahp-terminal:/a", FlowControl: ahptypes.SubscriptionFlowControlOptions{Receive: ahptypes.ChannelReceiveLimits{WindowBytes: 512, MaximumFrameBytes: 1024}}},
			{Channel: "ahp-terminal:/b", FlowControl: ahptypes.SubscriptionFlowControlOptions{Receive: ahptypes.ChannelReceiveLimits{WindowBytes: 512, MaximumFrameBytes: 1024}}},
		}}})
		done <- err
	}()
	request := readFlowWire(t, wire)
	closed, ok := c.Subscription("ahp-terminal:/a")
	if !ok {
		t.Fatal("staged reconnect owner inaccessible")
	}
	closed.Close()
	m := readFlowWire(t, wire)
	if m.Notification.Method != "unsubscribe" {
		t.Fatal(m)
	}
	hostFlowReply(t, wire, request, map[string]any{"type": "snapshot", "snapshots": []any{}, "windows": map[string]any{"items": []ahptypes.ResumedChannelSubscription{
		{Channel: "ahp-terminal:/a", FlowControl: *acceptedFlow(512, 1024), Recovery: ahptypes.ChannelRecoveryKindSnapshot},
		{Channel: "ahp-terminal:/b", FlowControl: *acceptedFlow(512, 1024), Recovery: ahptypes.ChannelRecoveryKindSnapshot},
	}}})
	initialFlowSnapshot(wire, "ahp-terminal:/a", 0)
	initialFlowSnapshot(wire, "ahp-terminal:/b", 0)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	kept, ok := c.Subscription("ahp-terminal:/b")
	if !ok {
		t.Fatal("resumed owner inaccessible")
	}
	d, err := kept.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	d.Release()
	m = readFlowWire(t, wire)
	if m.Notification.Method != "channel/credit" {
		t.Fatal("reachable owner did not return credit")
	}
	flowHealthy(t, c, wire, ctx)
}

func TestWindowingControlBypassesFullAndOversizedSendQueues(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Windowing.MaxBufferedSendBytes = 1
	c, wire, ctx := flowTestClient(t, cfg)
	s := subscribeFlow(t, c, wire, ctx, "ahp-tcp:/control", SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(512, 1024))
	initialFlowSnapshot(wire, s.URI(), 0)
	d, err := s.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		done <- c.Notify(ctx, "tcp/data", ahptypes.TcpDataParams{Channel: s.URI(), Data: strings.Repeat("eHh4", 1000)})
	}()
	m := readFlowWire(t, wire)
	if m.Notification.Method != "channel/frame" {
		t.Fatal("oversized head did not fragment")
	}
	waitFlow(t, func() bool { return !s.FlowControl().Writable })
	d.Release()
	m = readFlowWire(t, wire)
	for m.Notification.Method == "channel/frame" {
		m = readFlowWire(t, wire)
	}
	if m.Notification.Method != "channel/credit" {
		t.Fatal("credit was blocked by cap")
	}
	flowHealthy(t, c, wire, ctx)
	if err := c.Notify(ctx, "tcp/reset", ahptypes.TcpResetParams{Channel: s.URI()}); err != nil {
		t.Fatal(err)
	}
	if err := <-done; !errors.Is(err, ErrClosed) {
		t.Fatal("reset did not cancel pending send", err)
	}
	m = readFlowWire(t, wire)
	if m.Notification.Method != "tcp/reset" {
		t.Fatal(m)
	}
	if err := c.Unsubscribe(ctx, s.URI()); err != nil {
		t.Fatal(err)
	}
	m = readFlowWire(t, wire)
	if m.Notification.Method != "unsubscribe" {
		t.Fatal(m)
	}
	flowHealthy(t, c, wire, ctx)
}

func TestWindowingPlainSendsThenShutdownPreserveWireAndStreams(t *testing.T) {
	for _, method := range []string{"notify", "dispatch", "unsubscribe"} {
		t.Run(method, func(t *testing.T) {
			c, wire, ctx := flowTestClient(t, DefaultConfig())
			sub := c.AttachSubscription("ahp-terminal:/plain")
			events := c.Events()
			var err error
			switch method {
			case "notify":
				err = c.Notify(ctx, "app/data", map[string]any{"channel": sub.URI()})
			case "dispatch":
				_, err = c.Dispatch(ctx, sub.URI(), ahptypes.StateAction{Value: &ahptypes.TerminalInputAction{Type: ahptypes.ActionTypeTerminalInput, Data: "x"}})
			case "unsubscribe":
				err = c.Unsubscribe(ctx, sub.URI())
			}
			if err != nil {
				t.Fatal(err)
			}
			if err := c.Shutdown(ctx); err != nil {
				t.Fatal(err)
			}
			if m := readFlowWire(t, wire); m.Notification == nil {
				t.Fatal("plain message not on wire before shutdown")
			}
			select {
			case _, ok := <-events.Events():
				if ok {
					t.Fatal("global stream still open")
				}
			default:
				t.Fatal("global stream not closed")
			}
			select {
			case _, ok := <-sub.Events():
				if ok {
					t.Fatal("subscription stream still open")
				}
			default:
				t.Fatal("subscription stream not closed")
			}
		})
	}
}

func TestWindowingSchedulerEntriesArePruned(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	for i := 0; i < 50; i++ {
		uri := fmt.Sprintf("ahp-terminal:/prune-%d", i)
		s := subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(512, 1024))
		s.Close()
		if m := readFlowWire(t, wire); m.Notification.Method != "unsubscribe" {
			t.Fatal(m)
		}
	}
	c.flow.mu.Lock()
	n := len(c.flow.order) + len(c.flow.channels) + len(c.flow.cleanup)
	c.flow.mu.Unlock()
	if n != 0 {
		t.Fatal("bookkeeping grew with closed channels", n)
	}
	flowHealthy(t, c, wire, ctx)
}
