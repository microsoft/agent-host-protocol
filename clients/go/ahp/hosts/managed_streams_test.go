package hosts

import (
	"context"
	"testing"
	"time"
)

func awaitHostStreamClose[T any](t *testing.T, ctx context.Context, stream <-chan T) {
	t.Helper()
	for {
		select {
		case _, ok := <-stream:
			if !ok {
				return
			}
		case <-ctx.Done():
			t.Fatal("host observer stream remained open")
		}
	}
}

func TestManagedShutdownClosesObserverStreams(t *testing.T) {
	m, _, ctx := managedSetup(t, false)
	events, subscriptions, flow := m.Events(), m.Subscriptions(), m.FlowControlEvents()
	if err := m.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	timeout, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	awaitHostStreamClose(t, timeout, events)
	awaitHostStreamClose(t, timeout, subscriptions)
	awaitHostStreamClose(t, timeout, flow)
	awaitHostStreamClose(t, timeout, m.Events())
	awaitHostStreamClose(t, timeout, m.Subscriptions())
	awaitHostStreamClose(t, timeout, m.FlowControlEvents())
}
