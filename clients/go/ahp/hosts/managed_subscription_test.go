package hosts

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func (t *fakeTransport) TransportCapabilities() ahp.TransportCapabilities {
	return ahp.TransportCapabilities{SupportsWindowedDelivery: true, MaximumFrameBytes: 16384}
}

type managedWireRecord struct {
	generation int
	message    ahptypes.JsonRpcMessage
}
type managedHostFactory struct {
	servers      chan *fakeTransport
	records      chan managedWireRecord
	generation   atomic.Int32
	rejectSecond bool
	ignoreSecond string
}

func (f *managedHostFactory) open(ctx context.Context, _ HostID) (ahp.Transport, error) {
	generation := int(f.generation.Add(1))
	client, server := newFakePair()
	f.servers <- server
	go func() {
		for {
			frame, err := server.Recv(ctx)
			if err != nil {
				return
			}
			m, err := frame.IntoParsed()
			if err != nil {
				return
			}
			f.records <- managedWireRecord{generation, m}
			if m.Request == nil {
				continue
			}
			var result any
			switch m.Request.Method {
			case "initialize":
				result = map[string]any{"protocolVersion": "1.0.0"}
			case "subscribe":
				var p ahptypes.SubscribeParams
				_ = json.Unmarshal(m.Request.Params, &p)
				if generation > 1 && p.Channel == f.ignoreSecond {
					continue
				}
				if p.FlowControl == nil {
					b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": m.Request.ID, "error": map[string]any{"code": -32602, "message": "missing window offer"}})
					_ = server.Send(ctx, ahp.NewTextMessage(string(b)))
					continue
				}
				if f.rejectSecond && generation > 1 {
					b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": m.Request.ID, "error": map[string]any{"code": ahptypes.ErrorCodePermissionDenied, "message": "permission changed"}})
					_ = server.Send(ctx, ahp.NewTextMessage(string(b)))
					continue
				}
				result = map[string]any{"flowControl": map[string]any{"clientReceive": map[string]any{"windowBytes": 1024, "maximumFrameBytes": 1024}, "hostReceive": map[string]any{"windowBytes": 1, "maximumFrameBytes": 1024}}}
				b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": m.Request.ID, "result": result})
				_ = server.Send(ctx, ahp.NewTextMessage(string(b)))
				b, _ = json.Marshal(map[string]any{"jsonrpc": "2.0", "method": "channel/snapshot", "params": map[string]any{"channel": p.Channel, "snapshot": map[string]any{"resource": p.Channel, "state": map[string]any{}, "fromSeq": generation * 100}}})
				_ = server.Send(ctx, ahp.NewTextMessage(string(b)))
				if generation == 1 && !strings.HasPrefix(p.Channel, "ahp-tcp:") {
					b, _ = json.Marshal(map[string]any{"jsonrpc": "2.0", "method": "action", "params": map[string]any{"channel": p.Channel, "action": map[string]any{"type": "terminal/data", "data": "old"}, "serverSeq": 101}})
					_ = server.Send(ctx, ahp.NewTextMessage(string(b)))
				}
				continue
			default:
				result = nil
			}
			b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": m.Request.ID, "result": result})
			_ = server.Send(ctx, ahp.NewTextMessage(string(b)))
		}
	}()
	return client, nil
}
func managedSetup(t *testing.T, reject bool) (*MultiHostClient, *managedHostFactory, context.Context) {
	return managedSetupOptions(t, reject, "", 30*time.Second)
}

func managedSetupOptions(t *testing.T, reject bool, ignore string, timeout time.Duration) (*MultiHostClient, *managedHostFactory, context.Context) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	m := NewMultiHostClient()
	t.Cleanup(func() { _ = m.Shutdown(context.Background()) })
	f := &managedHostFactory{servers: make(chan *fakeTransport, 8), records: make(chan managedWireRecord, 128), rejectSecond: reject, ignoreSecond: ignore}
	cfg := NewHostConfig("host", "Host", f.open)
	cfg.ReconnectPolicy = ReconnectPolicy{InitialBackoff: time.Millisecond, MaxBackoff: time.Millisecond, MaxAttempts: 3}
	cfg.ClientConfig.Windowing = ahp.WindowingConfig{WindowBytes: 2048, MaximumFrameBytes: 4096}
	cfg.ClientConfig.DefaultRequestTimeout = timeout
	if _, err := m.AddHost(ctx, cfg); err != nil {
		t.Fatal(err)
	}
	return m, f, ctx
}
func waitManaged(t *testing.T, p func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for !p() {
		if time.Now().After(deadline) {
			t.Fatal("managed condition timed out")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestManagedWindowQueueAndEpochsAcrossInitialize(t *testing.T) {
	m, f, ctx := managedSetup(t, false)
	events := m.FlowControlEvents()
	_, sub, err := m.SubscribeWithOptions(ctx, "host", "ahp-terminal:/t", ahp.SubscribeOptions{Window: &ahp.WindowOptions{Receive: ahp.ReceiveManual}})
	if err != nil {
		t.Fatal(err)
	}
	first, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	oldHandle, _ := m.ClientHandle("host")
	oldClient, _ := oldHandle.Client()
	waitManaged(t, func() bool { return sub.FlowControl().BufferedReceiveBytes > first.WireBytes() })
	server := <-f.servers
	_ = server.Close(ctx)
	waitManaged(t, func() bool {
		h, _ := m.ClientHandle("host")
		c, err := h.Client()
		return err == nil && c != oldClient && m.Host("host").State.Kind == HostStateConnected
	})
	if _, err := oldHandle.Client(); !errors.Is(err, ErrHostReconnected) {
		t.Fatal("old client handle stayed valid")
	}
	old, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if a, ok := old.Event().(ahp.SubscriptionEventAction); !ok || a.Envelope.ServerSeq != 101 {
		t.Fatal("retained item was reordered")
	}
	fresh, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if s, ok := fresh.Event().(ahp.SubscriptionEventSnapshot); !ok || s.Params.Snapshot.FromSeq != 200 {
		t.Fatal("new snapshot not after retained queue")
	}
	buffered := sub.FlowControl().BufferedReceiveBytes
	first.Release()
	old.Release()
	if sub.FlowControl().BufferedReceiveBytes != buffered-first.WireBytes()-old.WireBytes() {
		t.Fatal("old retained receive bytes were not released")
	}
	fresh.Release()
	waitManaged(t, func() bool { return sub.FlowControl().BufferedReceiveBytes == 0 })
	found := false
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	for !found {
		select {
		case r := <-f.records:
			if r.message.Request != nil && r.message.Request.Method == "reconnect" {
				t.Fatal("Go hosts changed to protocol reconnect")
			}
			if r.message.Notification != nil && r.message.Notification.Method == "channel/credit" && r.generation == 2 {
				var p ahptypes.ChannelCreditParams
				_ = json.Unmarshal(r.message.Notification.Params, &p)
				if p.ConsumedBytes != fresh.WireBytes() {
					t.Fatal("wrong new-epoch cumulative credit")
				}
				found = true
			}
		case <-timer.C:
			t.Fatal("no new credit")
		}
	}
	resumed := false
	waitManaged(t, func() bool {
		for {
			select {
			case e := <-events:
				if e.HostID == "host" && e.Event.Kind == "resumed" {
					resumed = true
				}
			default:
				return resumed
			}
		}
	})
}

func TestManagedTCPDroppedAndPermissionChange(t *testing.T) {
	for _, tcp := range []bool{true, false} {
		t.Run(map[bool]string{true: "tcp", false: "permission"}[tcp], func(t *testing.T) {
			m, f, ctx := managedSetup(t, !tcp)
			uri := "ahp-terminal:/t"
			if tcp {
				uri = "ahp-tcp:/t"
			}
			_, sub, err := m.SubscribeWithOptions(ctx, "host", uri, ahp.SubscribeOptions{Window: &ahp.WindowOptions{}})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := sub.Next(ctx); err != nil {
				t.Fatal(err)
			}
			server := <-f.servers
			_ = server.Close(ctx)
			waitManaged(t, func() bool { return errors.Is(sub.Err(), ahp.ErrSubscriptionDropped) })
			if _, err := sub.Next(ctx); !errors.Is(err, ahp.ErrSubscriptionDropped) {
				t.Fatal("dropped stream did not fail")
			}
			waitManaged(t, func() bool { return f.generation.Load() > 1 && m.Host("host").State.Kind == HostStateConnected })
			for {
				select {
				case r := <-f.records:
					if tcp && r.generation > 1 && r.message.Request != nil && r.message.Request.Method == "subscribe" {
						t.Fatal("TCP automatically re-subscribed")
					}
				default:
					return
				}
			}
		})
	}
}

func TestManagedSameHandleUpdateAndHostIsolation(t *testing.T) {
	m, f, ctx := managedSetup(t, false)
	cfg := NewHostConfig("other", "Other", f.open)
	if _, err := m.AddHost(ctx, cfg); err != nil {
		t.Fatal(err)
	}
	_, a, err := m.SubscribeWithOptions(ctx, "host", "ahp-terminal:/t", ahp.SubscribeOptions{Window: &ahp.WindowOptions{}})
	if err != nil {
		t.Fatal(err)
	}
	_, again, err := m.SubscribeWithOptions(ctx, "host", a.URI(), ahp.SubscribeOptions{Window: &ahp.WindowOptions{WindowBytes: 2048}})
	if err != nil {
		t.Fatal(err)
	}
	if again != a {
		t.Fatal("re-subscribe created a second owner")
	}
	_, b, err := m.SubscribeWithOptions(ctx, "other", a.URI(), ahp.SubscribeOptions{Window: &ahp.WindowOptions{}})
	if err != nil {
		t.Fatal(err)
	}
	h, _ := m.ClientHandle("host")
	c, _ := h.Client()
	if err := c.Notify(ctx, "app/data", map[string]any{"channel": a.URI(), "text": "blocked"}); err != nil {
		t.Fatal(err)
	}
	if a.FlowControl().Writable || !b.FlowControl().Writable {
		t.Fatal("windows shared across hosts")
	}
}
