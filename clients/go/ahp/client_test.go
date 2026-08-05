package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// memTransport is an in-memory paired transport: the two ends share
// each other's send/recv channels. Used as a fake server in tests.
type memTransport struct {
	inbox   chan TransportMessage
	outbox  chan TransportMessage
	closeMu *sync.Mutex
	closed  *bool
	closeCh chan struct{}
}

func newMemTransportPair() (*memTransport, *memTransport) {
	a2b := make(chan TransportMessage, 16)
	b2a := make(chan TransportMessage, 16)
	closeCh := make(chan struct{})
	mu := &sync.Mutex{}
	closed := false
	return &memTransport{inbox: b2a, outbox: a2b, closeCh: closeCh, closeMu: mu, closed: &closed},
		&memTransport{inbox: a2b, outbox: b2a, closeCh: closeCh, closeMu: mu, closed: &closed}
}

func (t *memTransport) Send(ctx context.Context, m TransportMessage) error {
	select {
	case t.outbox <- m:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-t.closeCh:
		return ErrClosed
	}
}

func (t *memTransport) Recv(ctx context.Context) (TransportMessage, error) {
	select {
	case m := <-t.inbox:
		return m, nil
	case <-ctx.Done():
		return TransportMessage{}, ctx.Err()
	case <-t.closeCh:
		return TransportMessage{}, ErrClosed
	}
}

func (t *memTransport) Close(ctx context.Context) error {
	t.closeMu.Lock()
	defer t.closeMu.Unlock()
	if !*t.closed {
		*t.closed = true
		close(t.closeCh)
	}
	return nil
}

// TestClientRequestRoundTrip drives a fake server that responds to a
// single `initialize` request with a stub result.
func TestClientRequestRoundTrip(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()

	// Server goroutine: read one request, respond.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		msg, err := serverSide.Recv(ctx)
		if err != nil {
			t.Errorf("server recv: %v", err)
			return
		}
		parsed, err := msg.IntoParsed()
		if err != nil {
			t.Errorf("server parse: %v", err)
			return
		}
		if parsed.Request == nil {
			t.Errorf("expected request, got %+v", parsed)
			return
		}
		resultBody, _ := json.Marshal(ahptypes.InitializeResult{
			ProtocolVersion: ahptypes.ProtocolVersion,
		})
		resp := ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
			JsonRpc: ahptypes.JsonRpcV2,
			ID:      parsed.Request.ID,
			Result:  resultBody,
		}}
		out, err := EncodeMessage(resp)
		if err != nil {
			t.Errorf("server encode: %v", err)
			return
		}
		if err := serverSide.Send(ctx, out); err != nil {
			t.Errorf("server send: %v", err)
			return
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	result, err := client.Initialize(ctx, "test-client", ahptypes.SupportedProtocolVersions(), nil)
	if err != nil {
		t.Fatalf("Initialize: %v", err)
	}
	if result.ProtocolVersion != ahptypes.ProtocolVersion {
		t.Errorf("ProtocolVersion = %q, want %q", result.ProtocolVersion, ahptypes.ProtocolVersion)
	}
}

// TestPingTargetsRootChannel drives a fake server that answers a single
// `ping` request with a null result and verifies the request shape.
func TestPingTargetsRootChannel(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		msg, err := serverSide.Recv(ctx)
		if err != nil {
			t.Errorf("server recv: %v", err)
			return
		}
		parsed, err := msg.IntoParsed()
		if err != nil {
			t.Errorf("server parse: %v", err)
			return
		}
		if parsed.Request == nil {
			t.Errorf("expected request, got %+v", parsed)
			return
		}
		if parsed.Request.Method != "ping" {
			t.Errorf("method = %q, want %q", parsed.Request.Method, "ping")
		}
		var params struct {
			Channel string `json:"channel"`
		}
		if err := json.Unmarshal(parsed.Request.Params, &params); err != nil {
			t.Errorf("server decode params: %v", err)
			return
		}
		if params.Channel != string(ahptypes.RootResourceURI) {
			t.Errorf("channel = %q, want %q", params.Channel, ahptypes.RootResourceURI)
		}
		// The server responds with a null result — the response is the signal.
		resp := ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
			JsonRpc: ahptypes.JsonRpcV2,
			ID:      parsed.Request.ID,
			Result:  json.RawMessage("null"),
		}}
		out, err := EncodeMessage(resp)
		if err != nil {
			t.Errorf("server encode: %v", err)
			return
		}
		if err := serverSide.Send(ctx, out); err != nil {
			t.Errorf("server send: %v", err)
			return
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	if err := client.Ping(ctx); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

func TestResourceReadSendWrapperTargetsRootChannel(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	serverErr := make(chan error, 1)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		msg, err := serverSide.Recv(ctx)
		if err != nil {
			serverErr <- err
			return
		}
		parsed, err := msg.IntoParsed()
		if err != nil {
			serverErr <- err
			return
		}
		if parsed.Request == nil {
			serverErr <- errors.New("expected resourceRead request")
			return
		}
		if parsed.Request.Method != "resourceRead" {
			serverErr <- fmt.Errorf("method = %q, want resourceRead", parsed.Request.Method)
			return
		}
		var params ahptypes.ResourceReadParams
		if err := json.Unmarshal(parsed.Request.Params, &params); err != nil {
			serverErr <- err
			return
		}
		if params.Channel != ahptypes.RootResourceURI {
			serverErr <- fmt.Errorf("channel = %q, want %q", params.Channel, ahptypes.RootResourceURI)
			return
		}
		if params.Uri != "ahp-resource:/notes.txt" {
			serverErr <- fmt.Errorf("uri = %q, want ahp-resource:/notes.txt", params.Uri)
			return
		}
		resultBody, err := json.Marshal(ahptypes.ResourceReadResult{
			Data:     "hi",
			Encoding: ahptypes.ContentEncodingUtf8,
		})
		if err != nil {
			serverErr <- err
			return
		}
		resp := ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
			JsonRpc: ahptypes.JsonRpcV2,
			ID:      parsed.Request.ID,
			Result:  resultBody,
		}}
		out, err := EncodeMessage(resp)
		if err != nil {
			serverErr <- err
			return
		}
		serverErr <- serverSide.Send(ctx, out)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	result, err := client.ResourceRead(ctx, ahptypes.ResourceReadParams{
		Channel: "ahp-session:/ignored",
		Uri:     "ahp-resource:/notes.txt",
	})
	if err != nil {
		t.Fatalf("ResourceRead: %v", err)
	}
	if result.Data != "hi" {
		t.Errorf("Data = %q, want hi", result.Data)
	}
	if result.Encoding != ahptypes.ContentEncodingUtf8 {
		t.Errorf("Encoding = %q, want %q", result.Encoding, ahptypes.ContentEncodingUtf8)
	}
	if err := <-serverErr; err != nil {
		t.Fatalf("server: %v", err)
	}
}

func TestCompletionsSendWrapperPreservesChannel(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	serverErr := make(chan error, 1)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		msg, err := serverSide.Recv(ctx)
		if err != nil {
			serverErr <- err
			return
		}
		parsed, err := msg.IntoParsed()
		if err != nil {
			serverErr <- err
			return
		}
		if parsed.Request == nil || parsed.Request.Method != "completions" {
			serverErr <- errors.New("expected completions request")
			return
		}
		var params ahptypes.CompletionsParams
		if err := json.Unmarshal(parsed.Request.Params, &params); err != nil {
			serverErr <- err
			return
		}
		// The wrapper must preserve the caller-supplied chat channel.
		if params.Channel != "ahp-chat:/abc" {
			serverErr <- fmt.Errorf("channel = %q, want ahp-chat:/abc", params.Channel)
			return
		}
		if params.Kind != ahptypes.CompletionItemKindUserMessage {
			serverErr <- fmt.Errorf("kind = %q, want userMessage", params.Kind)
			return
		}
		resultBody, err := json.Marshal(ahptypes.CompletionsResult{Items: []ahptypes.CompletionItem{}})
		if err != nil {
			serverErr <- err
			return
		}
		resp := ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
			JsonRpc: ahptypes.JsonRpcV2,
			ID:      parsed.Request.ID,
			Result:  resultBody,
		}}
		out, err := EncodeMessage(resp)
		if err != nil {
			serverErr <- err
			return
		}
		serverErr <- serverSide.Send(ctx, out)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	result, err := client.Completions(ctx, ahptypes.CompletionsParams{
		Channel: "ahp-chat:/abc",
		Kind:    ahptypes.CompletionItemKindUserMessage,
		Text:    "look at @foo",
		Offset:  12,
	})
	if err != nil {
		t.Fatalf("Completions: %v", err)
	}
	if len(result.Items) != 0 {
		t.Errorf("Items = %d, want 0", len(result.Items))
	}
	if err := <-serverErr; err != nil {
		t.Fatalf("server: %v", err)
	}
}

func TestSessionConfigCompletionsSendWrapperTargetsRootChannel(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	serverErr := make(chan error, 1)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		msg, err := serverSide.Recv(ctx)
		if err != nil {
			serverErr <- err
			return
		}
		parsed, err := msg.IntoParsed()
		if err != nil {
			serverErr <- err
			return
		}
		if parsed.Request == nil || parsed.Request.Method != "sessionConfigCompletions" {
			serverErr <- errors.New("expected sessionConfigCompletions request")
			return
		}
		var params ahptypes.SessionConfigCompletionsParams
		if err := json.Unmarshal(parsed.Request.Params, &params); err != nil {
			serverErr <- err
			return
		}
		// The wrapper must force the root channel regardless of caller input.
		if params.Channel != ahptypes.RootResourceURI {
			serverErr <- fmt.Errorf("channel = %q, want %q", params.Channel, ahptypes.RootResourceURI)
			return
		}
		if params.Property != "baseBranch" {
			serverErr <- fmt.Errorf("property = %q, want baseBranch", params.Property)
			return
		}
		resultBody, err := json.Marshal(ahptypes.SessionConfigCompletionsResult{
			Items: []ahptypes.SessionConfigValueItem{{Value: "main", Label: "main"}},
		})
		if err != nil {
			serverErr <- err
			return
		}
		resp := ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
			JsonRpc: ahptypes.JsonRpcV2,
			ID:      parsed.Request.ID,
			Result:  resultBody,
		}}
		out, err := EncodeMessage(resp)
		if err != nil {
			serverErr <- err
			return
		}
		serverErr <- serverSide.Send(ctx, out)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	query := "ma"
	result, err := client.SessionConfigCompletions(ctx, ahptypes.SessionConfigCompletionsParams{
		Channel:  "ahp-session:/ignored",
		Property: "baseBranch",
		Query:    &query,
	})
	if err != nil {
		t.Fatalf("SessionConfigCompletions: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Value != "main" {
		t.Errorf("Items = %+v, want one item with value main", result.Items)
	}
	if err := <-serverErr; err != nil {
		t.Fatalf("server: %v", err)
	}
}

func TestInboundResourceRequestRoutesToTypedHandler(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	client.SetResourceRequestHandlers(ResourceRequestHandlers{
		OnResourceRead: func(ctx context.Context, p ahptypes.ResourceReadParams) (*ahptypes.ResourceReadResult, error) {
			if ctx == nil {
				t.Error("handler context is nil")
			}
			if p.Uri != "virtual:/server.txt" {
				t.Errorf("handler uri = %q, want virtual:/server.txt", p.Uri)
			}
			return &ahptypes.ResourceReadResult{
				Data:     "server-data",
				Encoding: ahptypes.ContentEncodingUtf8,
			}, nil
		},
	})

	readParams, err := json.Marshal(ahptypes.ResourceReadParams{
		Channel: ahptypes.RootResourceURI,
		Uri:     "virtual:/server.txt",
	})
	if err != nil {
		t.Fatalf("marshal read params: %v", err)
	}
	readReq := ahptypes.JsonRpcMessage{Request: &ahptypes.JsonRpcRequest{
		JsonRpc: ahptypes.JsonRpcV2,
		ID:      100,
		Method:  "resourceRead",
		Params:  readParams,
	}}
	readWire, err := EncodeMessage(readReq)
	if err != nil {
		t.Fatalf("encode read request: %v", err)
	}
	if err := serverSide.Send(ctx, readWire); err != nil {
		t.Fatalf("send read request: %v", err)
	}
	readRespWire, err := serverSide.Recv(ctx)
	if err != nil {
		t.Fatalf("recv read response: %v", err)
	}
	readResp, err := readRespWire.IntoParsed()
	if err != nil {
		t.Fatalf("parse read response: %v", err)
	}
	if readResp.SuccessResponse == nil {
		t.Fatalf("expected success response, got %+v", readResp)
	}
	if readResp.SuccessResponse.ID != 100 {
		t.Errorf("success id = %d, want 100", readResp.SuccessResponse.ID)
	}
	var readResult ahptypes.ResourceReadResult
	if err := json.Unmarshal(readResp.SuccessResponse.Result, &readResult); err != nil {
		t.Fatalf("decode read result: %v", err)
	}
	if readResult.Data != "server-data" {
		t.Errorf("Data = %q, want server-data", readResult.Data)
	}

	writeParams, err := json.Marshal(ahptypes.ResourceWriteParams{
		Channel:  ahptypes.RootResourceURI,
		Uri:      "virtual:/server.txt",
		Data:     "client-data",
		Encoding: ahptypes.ContentEncodingUtf8,
	})
	if err != nil {
		t.Fatalf("marshal write params: %v", err)
	}
	writeReq := ahptypes.JsonRpcMessage{Request: &ahptypes.JsonRpcRequest{
		JsonRpc: ahptypes.JsonRpcV2,
		ID:      101,
		Method:  "resourceWrite",
		Params:  writeParams,
	}}
	writeWire, err := EncodeMessage(writeReq)
	if err != nil {
		t.Fatalf("encode write request: %v", err)
	}
	if err := serverSide.Send(ctx, writeWire); err != nil {
		t.Fatalf("send write request: %v", err)
	}
	writeRespWire, err := serverSide.Recv(ctx)
	if err != nil {
		t.Fatalf("recv write response: %v", err)
	}
	writeResp, err := writeRespWire.IntoParsed()
	if err != nil {
		t.Fatalf("parse write response: %v", err)
	}
	if writeResp.ErrorResponse == nil {
		t.Fatalf("expected error response, got %+v", writeResp)
	}
	if writeResp.ErrorResponse.ID != 101 {
		t.Errorf("error id = %d, want 101", writeResp.ErrorResponse.ID)
	}
	if writeResp.ErrorResponse.Error.Code != ahptypes.ErrorCodeMethodNotFound {
		t.Errorf("error code = %d, want %d", writeResp.ErrorResponse.Error.Code, ahptypes.ErrorCodeMethodNotFound)
	}
}

// TestClientSubscriptionFanOut verifies that an inbound `action`
// notification reaches both per-URI subscribers and the top-level event
// stream.
func TestClientSubscriptionFanOut(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	sub := client.AttachSubscription("ahp-session:/s1")
	stream := client.Events()

	// Push an `action` notification from the "server" end.
	envBody, err := json.Marshal(ahptypes.ActionEnvelope{
		Channel:   "ahp-session:/s1",
		ServerSeq: 1,
		Action: ahptypes.StateAction{
			Value: &ahptypes.SessionTitleChangedAction{
				Type:  ahptypes.ActionTypeSessionTitleChanged,
				Title: "Hello",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode envelope: %v", err)
	}
	notif := ahptypes.JsonRpcMessage{Notification: &ahptypes.JsonRpcNotification{
		JsonRpc: ahptypes.JsonRpcV2,
		Method:  "action",
		Params:  envBody,
	}}
	out, err := EncodeMessage(notif)
	if err != nil {
		t.Fatalf("encode notification: %v", err)
	}
	if err := serverSide.Send(ctx, out); err != nil {
		t.Fatalf("server send: %v", err)
	}

	// Subscription receives the action.
	select {
	case ev := <-sub.Events():
		a, ok := ev.(SubscriptionEventAction)
		if !ok {
			t.Fatalf("subscription got %T, want SubscriptionEventAction", ev)
		}
		if a.Envelope.ServerSeq != 1 {
			t.Errorf("serverSeq = %d, want 1", a.Envelope.ServerSeq)
		}
	case <-ctx.Done():
		t.Fatal("subscription did not receive event")
	}

	// Top-level stream receives the action too.
	select {
	case ev := <-stream.Events():
		if ev.Channel != "ahp-session:/s1" {
			t.Errorf("channel = %q", ev.Channel)
		}
	case <-ctx.Done():
		t.Fatal("event stream did not receive event")
	}
}

func TestClientAutomationCatalogueNotifications(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	sub := client.AttachSubscription(ahptypes.RootResourceURI)
	stream := client.Events()
	automationURI := ahptypes.URI("ahp-automation:/nightly")

	tests := []struct {
		name   string
		method string
		params any
		check  func(t *testing.T, event SubscriptionEvent)
	}{
		{
			name:   "added",
			method: "root/automationAdded",
			params: ahptypes.AutomationAddedParams{
				Channel: ahptypes.RootResourceURI,
				Summary: ahptypes.AutomationSummary{Resource: automationURI},
			},
			check: func(t *testing.T, event SubscriptionEvent) {
				t.Helper()
				added, ok := event.(SubscriptionEventAutomationAdded)
				if !ok {
					t.Fatalf("got %T, want SubscriptionEventAutomationAdded", event)
				}
				if added.Params.Summary.Resource != automationURI {
					t.Errorf("resource = %q, want %q", added.Params.Summary.Resource, automationURI)
				}
			},
		},
		{
			name:   "removed",
			method: "root/automationRemoved",
			params: ahptypes.AutomationRemovedParams{
				Channel:    ahptypes.RootResourceURI,
				Automation: automationURI,
			},
			check: func(t *testing.T, event SubscriptionEvent) {
				t.Helper()
				removed, ok := event.(SubscriptionEventAutomationRemoved)
				if !ok {
					t.Fatalf("got %T, want SubscriptionEventAutomationRemoved", event)
				}
				if removed.Params.Automation != automationURI {
					t.Errorf("automation = %q, want %q", removed.Params.Automation, automationURI)
				}
			},
		},
		{
			name:   "summary changed",
			method: "root/automationSummaryChanged",
			params: ahptypes.AutomationSummaryChangedParams{
				Channel: ahptypes.RootResourceURI,
				Summary: ahptypes.AutomationSummary{Resource: automationURI},
			},
			check: func(t *testing.T, event SubscriptionEvent) {
				t.Helper()
				changed, ok := event.(SubscriptionEventAutomationSummaryChanged)
				if !ok {
					t.Fatalf("got %T, want SubscriptionEventAutomationSummaryChanged", event)
				}
				if changed.Params.Summary.Resource != automationURI {
					t.Errorf("resource = %q, want %q", changed.Params.Summary.Resource, automationURI)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params, err := json.Marshal(tt.params)
			if err != nil {
				t.Fatalf("marshal params: %v", err)
			}
			wire, err := EncodeMessage(ahptypes.JsonRpcMessage{Notification: &ahptypes.JsonRpcNotification{
				JsonRpc: ahptypes.JsonRpcV2,
				Method:  tt.method,
				Params:  params,
			}})
			if err != nil {
				t.Fatalf("encode notification: %v", err)
			}
			if err := serverSide.Send(ctx, wire); err != nil {
				t.Fatalf("send notification: %v", err)
			}

			select {
			case event := <-sub.Events():
				tt.check(t, event)
			case <-ctx.Done():
				t.Fatal("subscription did not receive event")
			}

			select {
			case event := <-stream.Events():
				if event.Channel != ahptypes.RootResourceURI {
					t.Errorf("channel = %q, want %q", event.Channel, ahptypes.RootResourceURI)
				}
				tt.check(t, event.Event)
			case <-ctx.Done():
				t.Fatal("top-level stream did not receive event")
			}
		})
	}
}

// TestClientShutdownFailsInFlightRequest confirms a Shutdown unblocks
// any pending request with ErrShutdown.
func TestClientShutdownFailsInFlightRequest(t *testing.T) {
	clientSide, _ := newMemTransportPair()
	ctx := context.Background()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		_, err := client.Initialize(ctx, "x", []string{"0.2.0"}, nil)
		done <- err
	}()

	// Give the goroutine a moment to send the request.
	time.Sleep(50 * time.Millisecond)
	_ = client.Shutdown(ctx)

	select {
	case err := <-done:
		if !errors.Is(err, ErrShutdown) {
			var rpc *RPCError
			if errors.As(err, &rpc) {
				// Acceptable: failPending may resolve with the
				// synthetic JSON-RPC error before the shutdown channel
				// is observed. Treat as shutdown.
				return
			}
			t.Errorf("err = %v, want ErrShutdown or synthetic RPC", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Initialize did not return after Shutdown")
	}
}

// TestClientDoneSignalledOnTransportFailure exercises the
// centralized close path triggered by a transport recv failure: the
// client's Done channel must fire and Err must report the cause.
func TestClientDoneSignalledOnTransportFailure(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	ctx := context.Background()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer client.Shutdown(context.Background())

	// Closing the server end produces an ErrClosed on the client's
	// Recv, which should drive the centralized shutdown path.
	_ = serverSide.Close(ctx)

	select {
	case <-client.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("Client.Done() did not fire after transport close")
	}
	if err := client.Err(); err == nil {
		t.Error("expected non-nil Err() after transport failure")
	}
}

// TestShutdownIsIdempotent confirms two concurrent shutdowns don't
// panic on a double channel close.
func TestShutdownIsIdempotent(t *testing.T) {
	clientSide, _ := newMemTransportPair()
	ctx := context.Background()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}

	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = client.Shutdown(context.Background())
		}()
	}
	wg.Wait()
}
