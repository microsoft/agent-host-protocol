package hosts

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// fakeTransport is a tiny in-memory transport pair, mirroring the
// helper in ahp/client_test.go but exported via the test binary by
// duplication so the hosts package can use it without bouncing
// through an export.
type fakeTransport struct {
	inbox   chan ahp.TransportMessage
	outbox  chan ahp.TransportMessage
	closeMu *sync.Mutex
	closed  *bool
	closeCh chan struct{}
}

func newFakePair() (*fakeTransport, *fakeTransport) {
	a2b := make(chan ahp.TransportMessage, 16)
	b2a := make(chan ahp.TransportMessage, 16)
	closeCh := make(chan struct{})
	mu := &sync.Mutex{}
	closed := false
	return &fakeTransport{inbox: b2a, outbox: a2b, closeCh: closeCh, closeMu: mu, closed: &closed},
		&fakeTransport{inbox: a2b, outbox: b2a, closeCh: closeCh, closeMu: mu, closed: &closed}
}

func (t *fakeTransport) Send(ctx context.Context, m ahp.TransportMessage) error {
	select {
	case t.outbox <- m:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-t.closeCh:
		return ahp.ErrClosed
	}
}
func (t *fakeTransport) Recv(ctx context.Context) (ahp.TransportMessage, error) {
	select {
	case m := <-t.inbox:
		return m, nil
	case <-ctx.Done():
		return ahp.TransportMessage{}, ctx.Err()
	case <-t.closeCh:
		return ahp.TransportMessage{}, ahp.ErrClosed
	}
}
func (t *fakeTransport) Close(_ context.Context) error {
	t.closeMu.Lock()
	defer t.closeMu.Unlock()
	if !*t.closed {
		*t.closed = true
		close(t.closeCh)
	}
	return nil
}

// runFakeServer responds to one Initialize request with a stub
// InitializeResult. It exits when the transport closes.
func runFakeServer(t *testing.T, serverSide *fakeTransport) {
	runFakeServerWithInitializeResult(t, serverSide, ahptypes.InitializeResult{
		ProtocolVersion: ahptypes.ProtocolVersion,
	})
}

func runFakeServerWithInitializeResult(t *testing.T, serverSide *fakeTransport, initializeResult ahptypes.InitializeResult) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	for {
		msg, err := serverSide.Recv(ctx)
		if err != nil {
			return
		}
		parsed, err := msg.IntoParsed()
		if err != nil {
			return
		}
		if parsed.Request == nil {
			continue
		}
		if parsed.Request.Method == "initialize" {
			result, _ := json.Marshal(initializeResult)
			resp := ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
				JsonRpc: ahptypes.JsonRpcV2,
				ID:      parsed.Request.ID,
				Result:  result,
			}}
			out, _ := ahp.EncodeMessage(resp)
			_ = serverSide.Send(ctx, out)
		}
	}
}

func TestAutomationCapabilitiesUpdatedAcrossReconnect(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	multi := NewMultiHostClient()
	defer multi.Shutdown(context.Background())

	servers := make(chan *fakeTransport, 2)
	attempt := 0
	cfg := NewHostConfig("automation-host", "Automation Host", func(_ context.Context, _ HostID) (ahp.Transport, error) {
		attempt++
		clientSide, serverSide := newFakePair()
		lifetime := ahptypes.AutomationExecutionLifetimeHostLifetime
		if attempt > 1 {
			lifetime = ahptypes.AutomationExecutionLifetimeManaged
		}
		go runFakeServerWithInitializeResult(t, serverSide, ahptypes.InitializeResult{
			ProtocolVersion: ahptypes.ProtocolVersion,
			Automations: &ahptypes.AutomationCapabilities{
				Execution: ahptypes.AutomationExecutionCapabilities{Lifetime: lifetime},
			},
		})
		servers <- serverSide
		return clientSide, nil
	})
	cfg.ReconnectPolicy = ReconnectPolicy{
		MaxAttempts:       2,
		InitialBackoff:    time.Millisecond,
		MaxBackoff:        time.Millisecond,
		BackoffMultiplier: 1,
		ResetOnSuccess:    true,
	}

	handle, err := multi.AddHost(ctx, cfg)
	if err != nil {
		t.Fatalf("AddHost: %v", err)
	}
	if handle.Automations == nil {
		t.Fatal("initial Automations is nil")
	}
	if got := handle.Automations.Execution.Lifetime; got != ahptypes.AutomationExecutionLifetimeHostLifetime {
		t.Fatalf("initial lifetime = %q, want %q", got, ahptypes.AutomationExecutionLifetimeHostLifetime)
	}

	firstServer := <-servers
	if err := firstServer.Close(ctx); err != nil {
		t.Fatalf("close first server: %v", err)
	}

	for {
		handle = multi.Host(cfg.ID)
		if handle != nil &&
			handle.State.Kind == HostStateConnected &&
			handle.Automations != nil &&
			handle.Automations.Execution.Lifetime == ahptypes.AutomationExecutionLifetimeManaged {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal("automation capabilities were not updated after reconnect")
		case <-time.After(time.Millisecond):
		}
	}
}

// TestSingleHostHandshake exercises the [Single] one-line constructor
// against a fake server and confirms the host transitions to the
// Connected state with a populated protocol version.
func TestSingleHostHandshake(t *testing.T) {
	clientSide, serverSide := newFakePair()
	go runFakeServer(t, serverSide)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cfg := NewHostConfig("local", "Local", func(_ context.Context, _ HostID) (ahp.Transport, error) {
		return clientSide, nil
	})
	multi, handle, err := Single(ctx, cfg)
	if err != nil {
		t.Fatalf("Single: %v", err)
	}
	defer multi.Shutdown(context.Background())

	if handle.State.Kind != HostStateConnected {
		t.Errorf("state = %s, want connected", handle.State.Kind)
	}
	if handle.ProtocolVersion != ahptypes.ProtocolVersion {
		t.Errorf("protocol version = %q, want %q", handle.ProtocolVersion, ahptypes.ProtocolVersion)
	}
	if handle.ClientID == "" {
		t.Error("ClientID should be auto-generated")
	}
}

// TestClientIDPersistedAcrossAdds checks that an InMemoryClientIDStore
// keeps the host's clientId stable across an AddHost → RemoveHost →
// AddHost cycle.
func TestClientIDPersistedAcrossAdds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	multi := NewMultiHostClient()
	defer multi.Shutdown(context.Background())

	open := func() *fakeTransport {
		c, s := newFakePair()
		go runFakeServer(t, s)
		return c
	}

	cfg := NewHostConfig("host-a", "A", func(_ context.Context, _ HostID) (ahp.Transport, error) {
		return open(), nil
	})

	h1, err := multi.AddHost(ctx, cfg)
	if err != nil {
		t.Fatalf("AddHost: %v", err)
	}
	firstID := h1.ClientID

	if err := multi.RemoveHost(ctx, cfg.ID); err != nil {
		t.Fatalf("RemoveHost: %v", err)
	}

	h2, err := multi.AddHost(ctx, cfg)
	if err != nil {
		t.Fatalf("AddHost again: %v", err)
	}
	if h2.ClientID != firstID {
		t.Errorf("ClientID changed across re-add: was %q got %q", firstID, h2.ClientID)
	}
}
