package hosts

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestManagedResubscribeTimeoutDropsOnlyThatChannel(t *testing.T) {
	m, f, ctx := managedSetupOptions(t, false, "ahp-terminal:/bad", 20*time.Millisecond)
	_, bad, err := m.SubscribeWithOptions(ctx, "host", "ahp-terminal:/bad", ahp.SubscribeOptions{Window: &ahp.WindowOptions{}})
	if err != nil {
		t.Fatal(err)
	}
	_, good, err := m.SubscribeWithOptions(ctx, "host", "ahp-terminal:/good", ahp.SubscribeOptions{Window: &ahp.WindowOptions{}})
	if err != nil {
		t.Fatal(err)
	}
	old, _ := m.ClientHandle("host")
	oldClient, _ := old.Client()
	first := <-f.servers
	_ = first.Close(ctx)
	waitManaged(t, func() bool {
		h, _ := m.ClientHandle("host")
		c, err := h.Client()
		return err == nil && c != oldClient && m.Host("host").State.Kind == HostStateConnected && bad.Err() != nil
	})
	if !errors.Is(bad.Err(), ahp.ErrSubscriptionDropped) {
		t.Fatal(bad.Err())
	}
	if good.Err() != nil {
		t.Fatal("healthy channel dropped", good.Err())
	}
	m.mu.RLock()
	hs := m.hosts["host"]
	m.mu.RUnlock()
	hs.mu.RLock()
	_, keptBad := hs.managed[bad.URI()]
	_, keptGood := hs.managed[good.URI()]
	hs.mu.RUnlock()
	if keptBad || !keptGood {
		t.Fatal("managed registry retained dropped channel")
	}
	second := <-f.servers
	h, _ := m.ClientHandle("host")
	secondClient, _ := h.Client()
	_ = second.Close(ctx)
	waitManaged(t, func() bool {
		h, _ := m.ClientHandle("host")
		c, err := h.Client()
		return err == nil && c != secondClient && m.Host("host").State.Kind == HostStateConnected
	})
	for {
		select {
		case record := <-f.records:
			if record.generation >= 3 && record.message.Request != nil && record.message.Request.Method == "subscribe" {
				var p ahptypes.SubscribeParams
				_ = json.Unmarshal(record.message.Request.Params, &p)
				if p.Channel == bad.URI() {
					t.Fatal("later reconnect retried a dropped channel")
				}
			}
		default:
			return
		}
	}
}

func TestManagedCloseDoesNotWaitForResubscribe(t *testing.T) {
	for _, shutdown := range []bool{false, true} {
		t.Run(map[bool]string{false: "close", true: "shutdown"}[shutdown], func(t *testing.T) {
			m, f, ctx := managedSetupOptions(t, false, "ahp-terminal:/blocked", 0)
			_, s, err := m.SubscribeWithOptions(ctx, "host", "ahp-terminal:/blocked", ahp.SubscribeOptions{Window: &ahp.WindowOptions{}})
			if err != nil {
				t.Fatal(err)
			}
			first := <-f.servers
			_ = first.Close(ctx)
			waiting := false
			deadline := time.After(time.Second)
			for !waiting {
				select {
				case record := <-f.records:
					waiting = record.generation == 2 && record.message.Request != nil && record.message.Request.Method == "subscribe"
				case <-deadline:
					t.Fatal("resubscribe never started")
				}
			}
			op, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
			defer cancel()
			done := make(chan error, 1)
			go func() {
				if shutdown {
					done <- m.Shutdown(op)
				} else {
					done <- s.Close(op)
				}
			}()
			select {
			case err := <-done:
				if err != nil {
					t.Fatal(err)
				}
			case <-op.Done():
				t.Fatal("shutdown/close blocked behind resubscribe")
			}
			if !shutdown {
				waitManaged(t, func() bool { return m.Host("host").State.Kind == HostStateConnected })
				m.mu.RLock()
				hs := m.hosts["host"]
				m.mu.RUnlock()
				hs.mu.RLock()
				n := len(hs.managed)
				hs.mu.RUnlock()
				if n != 0 {
					t.Fatal("closed managed handle remained registered")
				}
			}
		})
	}
}
