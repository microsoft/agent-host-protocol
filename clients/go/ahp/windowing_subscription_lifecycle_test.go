package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestWindowingLateReconnectTimeoutDoesNotReviveOwners(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	op, cancel := context.WithTimeout(ctx, 15*time.Millisecond)
	defer cancel()
	done := make(chan error, 1)
	uri := "ahp-terminal:/late-reconnect"
	go func() {
		_, err := c.ReconnectWithParams(op, ahptypes.ReconnectParams{ClientId: "client", Subscriptions: []string{uri}, Windows: &ahptypes.ChannelDeliveryResumeOptions{Items: []ahptypes.ChannelDeliveryResumeParams{
			{Channel: uri, FlowControl: ahptypes.SubscriptionFlowControlOptions{Receive: ahptypes.ChannelReceiveLimits{WindowBytes: 512, MaximumFrameBytes: 1024}}},
		}}})
		done <- err
	}()
	request := readFlowWire(t, wire)
	if err := <-done; !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal(err)
	}
	if m := readFlowWire(t, wire); m.Notification == nil || m.Notification.Method != "unsubscribe" {
		t.Fatal("timed out reconnect was not unsubscribed")
	}
	hostFlowReply(t, wire, request, map[string]any{"type": "snapshot", "snapshots": []any{}, "windows": map[string]any{"items": []ahptypes.ResumedChannelSubscription{
		{Channel: uri, FlowControl: *acceptedFlow(512, 1024), Recovery: ahptypes.ChannelRecoveryKindSnapshot},
	}}})
	initialFlowSnapshot(wire, uri, 0)
	if _, ok := c.Subscription(uri); ok {
		t.Fatal("timed out reconnect left a hidden owner")
	}
	flowHealthy(t, c, wire, ctx)
}

func TestWindowingFailedOptInRetainsLegacyObserver(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	uri := "ahp-terminal:/legacy"
	legacy := c.AttachSubscription(uri)
	done := make(chan error, 1)
	go func() {
		_, _, err := c.SubscribeWithOptions(ctx, uri, SubscribeOptions{Window: &WindowOptions{}})
		done <- err
	}()
	request := readFlowWire(t, wire)
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": request.Request.ID, "error": map[string]any{"code": ahptypes.ErrorCodePermissionDenied, "message": "denied"}})
	wire.in <- NewTextMessage(string(b))
	var rpc *RPCError
	if err := <-done; !errors.As(err, &rpc) {
		t.Fatal(err)
	}
	hostFlowNotification(wire, "action", map[string]any{"channel": uri, "action": map[string]any{"type": "terminal/data", "data": "still observed"}, "serverSeq": 1})
	select {
	case _, ok := <-legacy.Events():
		if !ok {
			t.Fatal("failed opt-in closed an existing observer")
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	flowHealthy(t, c, wire, ctx)
}

func TestWindowingClosedOwnerUpdateDoesNotCreateHiddenOwner(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	sub := subscribeFlow(t, c, wire, ctx, "ahp-terminal:/closed", SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(512, 1024))
	changes := sub.FlowControlChanges()
	sub.Close()
	if m := readFlowWire(t, wire); m.Notification.Method != "unsubscribe" {
		t.Fatal(m)
	}
	if _, err := sub.Update(ctx, SubscribeOptions{Window: &WindowOptions{}}); !errors.Is(err, ErrClosed) {
		t.Fatal("closed owner was updated", err)
	}
	if _, ok := c.Subscription(sub.URI()); ok {
		t.Fatal("Update created a replacement owner")
	}
	for range changes {
	}
	flowHealthy(t, c, wire, ctx)
}

func TestWindowingUnsubscribeStopsPendingCreditTimer(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	uri := "ahp-terminal:/timer"
	sub := subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(4096, 1024))
	initialFlowSnapshot(wire, uri, 0)
	old, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	old.Release()
	if err := c.Unsubscribe(ctx, uri); err != nil {
		t.Fatal(err)
	}
	for {
		m := readFlowWire(t, wire)
		if m.Notification.Method == "unsubscribe" {
			break
		}
		if m.Notification.Method != "channel/credit" {
			t.Fatal(m)
		}
	}
	select {
	case text := <-wire.sent:
		t.Fatal("credit timer survived unsubscribe", text)
	case <-time.After(15 * time.Millisecond):
	}
	fresh := subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(4096, 1024))
	initialFlowSnapshot(wire, uri, 0)
	d, err := fresh.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	d.Release()
	m := readFlowWire(t, wire)
	var credit ahptypes.ChannelCreditParams
	_ = json.Unmarshal(m.Notification.Params, &credit)
	if m.Notification.Method != "channel/credit" || credit.ConsumedBytes != d.WireBytes() {
		t.Fatal("new counters were not reset", m)
	}
}
