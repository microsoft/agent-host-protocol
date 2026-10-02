package hosts

import (
	"context"
	"encoding/json"
	"io"
	"strings"
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

func TestManagedTCPReconnectAndShutdown(t *testing.T) {
	for _, mode := range []string{"replay", "retry", "snapshot", "missing", "refused"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			multi := NewMultiHostClient()
			events := multi.Subscriptions()
			defer multi.Shutdown(context.Background())
			servers := make(chan *fakeTransport, 4)
			reconnects := make(chan ahptypes.ReconnectParams, 4)
			dispatches := make(chan ahptypes.DispatchActionParams, 32)
			attempt := 0
			snapshot := func(resource string) map[string]any {
				direction := map[string]any{"windowBytes": 4, "maximumChunkSize": 3, "receivedBytes": 0, "consumedBytes": 0, "eofAtBytes": nil}
				return map[string]any{"snapshot": map[string]any{"resource": resource, "fromSeq": 10,
					"state": map[string]any{"type": "tcp", "session": "ahp-session:/s1", "target": map[string]any{"host": "localhost", "port": 3000},
						"encoding": "base64", "input": direction, "output": direction, "clientClosed": false, "hostClosed": false, "reset": nil}}}
			}
			cfg := NewHostConfig("tcp", "TCP", func(_ context.Context, _ HostID) (ahp.Transport, error) {
				attempt++
				current := attempt
				client, server := newFakePair()
				servers <- server
				go func() {
					send := func(value any) {
						data, err := json.Marshal(value)
						if err != nil {
							t.Error(err)
							return
						}
						if err := server.Send(ctx, ahp.NewTextMessage(string(data))); err != nil && ctx.Err() == nil {
							t.Error(err)
						}
					}
					for {
						frame, err := server.Recv(ctx)
						if err != nil {
							return
						}
						message, err := frame.IntoParsed()
						if err != nil {
							t.Error(err)
							return
						}
						if message.Notification != nil {
							if message.Notification.Method == "dispatchAction" {
								var params ahptypes.DispatchActionParams
								if err := json.Unmarshal(message.Notification.Params, &params); err != nil {
									t.Error(err)
									return
								}
								dispatches <- params
							}
							continue
						}
						if message.Request == nil {
							continue
						}
						req := message.Request
						var result any
						switch req.Method {
						case "initialize":
							var params ahptypes.InitializeParams
							if err := json.Unmarshal(req.Params, &params); err != nil {
								t.Error(err)
								return
							}
							for _, resource := range params.InitialSubscriptions {
								if strings.HasPrefix(resource, "ahp-tcp:") {
									t.Error("TCP entered initialize fallback")
								}
							}
							result = map[string]any{"protocolVersion": ahptypes.ProtocolVersion, "serverSeq": 10, "snapshots": []any{}, "tcpConnections": map[string]any{"encodings": []string{"base64"}}}
						case "subscribe":
							resource := "ahp-tcp:/owned"
							if current > 1 {
								resource = "ahp-tcp:/second"
							}
							result = snapshot(resource)
						case "reconnect":
							var params ahptypes.ReconnectParams
							if err := json.Unmarshal(req.Params, &params); err != nil {
								t.Error(err)
								return
							}
							reconnects <- params
							if mode == "retry" && current == 2 {
								server.Close(ctx)
								return
							}
							if mode == "refused" {
								send(map[string]any{"jsonrpc": "2.0", "id": req.ID, "error": map[string]any{"code": -32000, "message": "replay expired"}})
								continue
							}
							result = map[string]any{"type": "replay", "actions": []any{}, "missing": []string{}}
							if mode == "replay" || mode == "retry" {
								result = map[string]any{"type": "replay", "missing": []string{}, "actions": []any{
									map[string]any{"channel": "ahp-terminal:/t", "serverSeq": 20, "action": map[string]any{"type": "terminal/data", "data": "hello"}},
									map[string]any{"channel": "ahp-terminal:/t", "serverSeq": 21, "action": map[string]any{"type": "terminal/data", "data": "!"}},
								}}
							}
							if mode == "snapshot" {
								result = map[string]any{"type": "snapshot", "snapshots": []any{}}
							}
							if mode == "missing" {
								result = map[string]any{"type": "replay", "actions": []any{}, "missing": []string{"ahp-tcp:/owned"}}
							}
						default:
							t.Errorf("unexpected request %s", req.Method)
							return
						}
						send(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": result})
						if req.Method == "subscribe" && current == 1 {
							send(map[string]any{"jsonrpc": "2.0", "method": "action", "params": map[string]any{"channel": "ahp-tcp:/owned", "serverSeq": 11, "action": map[string]any{"type": "tcp/data", "offset": 0, "data": "eA=="}}})
						}
						if req.Method == "reconnect" && (mode == "replay" || mode == "retry") {
							send(map[string]any{"jsonrpc": "2.0", "method": "action", "params": map[string]any{"channel": "ahp-tcp:/owned", "serverSeq": 22, "action": map[string]any{"type": "tcp/dataEof", "finalOffset": 1}}})
						}
					}
				}()
				return client, nil
			})
			cfg.ClientID = "owner"
			cfg.InitialSubscriptions = []string{ahptypes.RootResourceURI, "ahp-tcp:/must-not-initialize"}
			cfg.ReconnectPolicy = ReconnectPolicy{MaxAttempts: 2, InitialBackoff: time.Millisecond, MaxBackoff: time.Millisecond, BackoffMultiplier: 1, ResetOnSuccess: true}
			if _, err := multi.AddHost(ctx, cfg); err != nil {
				t.Fatal(err)
			}
			old, err := multi.ClientHandle(cfg.ID)
			if err != nil {
				t.Fatal(err)
			}
			create := ahptypes.TcpConnectionSubscription{Type: "tcpConnection", Host: "localhost", Port: 3000, Encoding: ahptypes.TcpDataEncodingBase64, ReceiveWindowBytes: 4, MaximumChunkSize: 3}
			connection, err := old.OpenTCPConnection(ctx, "ahp-session:/s1", create)
			if err != nil {
				t.Fatal(err)
			}
			receive := func() ahptypes.DispatchActionParams {
				select {
				case p := <-dispatches:
					return p
				case <-ctx.Done():
					t.Fatal("dispatch timeout")
					return ahptypes.DispatchActionParams{}
				}
			}
			if data, err := connection.Read(ctx); err != nil || string(data) != "x" {
				t.Fatalf("first data %q: %v", data, err)
			}
			credit := receive()
			if _, err := connection.Write(ctx, []byte("ab")); err != nil {
				t.Fatal(err)
			}
			input := receive()
			raw, err := old.Client()
			if err != nil {
				t.Fatal(err)
			}
			ordinary, err := raw.Dispatch(ctx, "ahp-session:/s1", ahptypes.StateAction{Value: &ahptypes.SessionTitleChangedAction{Type: ahptypes.ActionTypeSessionTitleChanged, Title: "ordinary"}})
			if err != nil {
				t.Fatal(err)
			}
			receive()
			oldServer := <-servers
			if err := oldServer.Send(ctx, ahp.NewTextMessage(`{"jsonrpc":"2.0","method":"action","params":{"channel":"ahp-terminal:/t","serverSeq":20,"action":{"type":"terminal/data","data":"hello"}}}`)); err != nil {
				t.Fatal(err)
			}
			for {
				select {
				case event := <-events:
					if event.Channel == "ahp-terminal:/t" {
						goto ordinaryApplied
					}
				case <-ctx.Done():
					t.Fatal("ordinary event not delivered")
				}
			}
		ordinaryApplied:
			if err := oldServer.Close(ctx); err != nil {
				t.Fatal(err)
			}
			var reconnect ahptypes.ReconnectParams
			select {
			case reconnect = <-reconnects:
			case <-ctx.Done():
				t.Fatal("missing TCP reconnect")
			}
			found := false
			for _, resource := range reconnect.Subscriptions {
				found = found || resource == connection.Resource()
			}
			if !found || reconnect.ClientId != "owner" || reconnect.LastSeenServerSeq > 11 {
				t.Fatalf("unsafe reconnect %+v", reconnect)
			}
			var fresh *HostClientHandle
			for {
				fresh, err = multi.ClientHandle(cfg.ID)
				if err == nil && fresh.generation > old.generation && multi.Host(cfg.ID).State.Kind == HostStateConnected {
					break
				}
				select {
				case <-ctx.Done():
					t.Fatal("reconnect did not finish")
				case <-time.After(time.Millisecond):
				}
			}
			if mode == "replay" || mode == "retry" {
				text := "hello"
			replayed:
				for {
					select {
					case event := <-events:
						if action, ok := event.Event.(ahp.SubscriptionEventAction); ok {
							if data, ok := action.Envelope.Action.Value.(*ahptypes.TerminalDataAction); ok {
								text += data.Data
							}
							if action.Envelope.ServerSeq == 22 {
								break replayed
							}
						}
					case <-ctx.Done():
						t.Fatal("replay not delivered")
					}
				}
				if text != "hello!" {
					t.Fatalf("managed replay duplicated terminal output: %q", text)
				}
				if got := receive(); got.ClientSeq != credit.ClientSeq {
					t.Fatal("credit was renumbered")
				}
				if got := receive(); got.ClientSeq != input.ClientSeq {
					t.Fatal("input was renumbered")
				}
				if _, err := connection.Read(ctx); err != io.EOF {
					t.Fatalf("replayed EOF: %v", err)
				}
				if _, err := connection.Write(ctx, []byte("c")); err != nil {
					t.Fatal(err)
				}
				if got := receive(); got.ClientSeq <= ordinary.ClientSeq {
					t.Fatal("ordinary sequence floor lost")
				}
				second, err := fresh.OpenTCPConnection(ctx, "ahp-session:/s1", create)
				if err != nil {
					t.Fatal(err)
				}
				waiter := make(chan error, 1)
				go func() { _, err := second.Read(ctx); waiter <- err }()
				if err := multi.Shutdown(ctx); err != nil {
					t.Fatal(err)
				}
				if !connection.IsClosed() || !second.IsClosed() {
					t.Fatal("permanent shutdown retained live streams")
				}
				select {
				case err := <-waiter:
					if err == nil {
						t.Fatal("shutdown did not fail blocked read")
					}
				case <-ctx.Done():
					t.Fatal("shutdown blocked read")
				}
			} else {
				if !connection.IsClosed() {
					t.Fatal("snapshot/missing/fallback revived TCP")
				}
				if _, err := connection.Read(ctx); err == nil {
					t.Fatal("terminated stream read succeeded")
				}
			}
		})
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
		runHistoryLimit := int64(10)
		if attempt > 1 {
			runHistoryLimit = 25
		}
		go runFakeServerWithInitializeResult(t, serverSide, ahptypes.InitializeResult{
			ProtocolVersion: ahptypes.ProtocolVersion,
			Automations: &ahptypes.AutomationCapabilities{
				RunHistoryLimit: &runHistoryLimit,
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
	if got := handle.Automations.RunHistoryLimit; got == nil || *got != 10 {
		t.Fatalf("initial run history limit = %v, want 10", got)
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
			handle.Automations.RunHistoryLimit != nil &&
			*handle.Automations.RunHistoryLimit == 25 {
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
