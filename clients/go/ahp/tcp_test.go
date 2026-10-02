package ahp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

type tcpTestHost struct {
	t             *testing.T
	client        *Client
	server        *memTransport
	ctx           context.Context
	requests      chan ahptypes.JsonRpcRequest
	notifications chan ahptypes.JsonRpcNotification
	mu            sync.Mutex
	seq           int64
	first         []byte
	holdCreate    bool
}

type tcpHeldSubscribeTransport struct {
	Transport
	release <-chan struct{}
}

func (t tcpHeldSubscribeTransport) Send(ctx context.Context, message TransportMessage) error {
	if err := t.Transport.Send(ctx, message); err != nil {
		return err
	}
	parsed, err := message.IntoParsed()
	if err != nil {
		return err
	}
	if parsed.Request != nil && parsed.Request.Method == "subscribe" {
		select {
		case <-t.release:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

func newTCPTestHost(t *testing.T, initialize bool, first []byte, holdCreate bool, sendGate ...<-chan struct{}) *tcpTestHost {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	a, b := newMemTransportPair()
	var transport Transport = a
	if len(sendGate) != 0 {
		transport = tcpHeldSubscribeTransport{Transport: a, release: sendGate[0]}
	}
	client, err := Connect(ctx, transport, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	h := &tcpTestHost{t: t, client: client, server: b, ctx: ctx, requests: make(chan ahptypes.JsonRpcRequest, 8), notifications: make(chan ahptypes.JsonRpcNotification, 64), first: first, holdCreate: holdCreate}
	t.Cleanup(func() { client.Shutdown(context.Background()); cancel() })
	go func() {
		for {
			message, err := b.Recv(ctx)
			if err != nil {
				return
			}
			parsed, err := message.IntoParsed()
			if err != nil {
				t.Error(err)
				return
			}
			if parsed.Notification != nil {
				select {
				case h.notifications <- *parsed.Notification:
				case <-ctx.Done():
					return
				}
			} else if parsed.Request != nil {
				request := *parsed.Request
				switch request.Method {
				case "initialize":
					h.reply(request, map[string]any{"protocolVersion": ahptypes.ProtocolVersion, "serverSeq": 0, "snapshots": []any{}, "tcpConnections": map[string]any{"encodings": []string{"base64"}}})
				case "subscribe":
					if holdCreate {
						h.requests <- request
						continue
					}
					h.reply(request, h.snapshot())
					if first != nil {
						h.emit(&ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: 0, Data: base64.StdEncoding.EncodeToString(first)}, nil, nil)
					}
				case "ping":
					h.reply(request, nil)
				default:
					h.requests <- request
				}
			}
		}
	}()
	if initialize {
		if _, err := client.Initialize(ctx, "owner", ahptypes.SupportedProtocolVersions(), nil); err != nil {
			t.Fatal(err)
		}
	}
	return h
}

func (h *tcpTestHost) snapshot() ahptypes.SubscribeResult {
	state := tcpTestState()
	state.Input.WindowBytes, state.Input.MaximumChunkSize = 4, 3
	state.Output.WindowBytes, state.Output.MaximumChunkSize = 4, 3
	return ahptypes.SubscribeResult{Snapshot: &ahptypes.Snapshot{Resource: "ahp-tcp:/owned", State: ahptypes.SnapshotState{Tcp: &state}}}
}

func (h *tcpTestHost) reply(request ahptypes.JsonRpcRequest, result any) {
	h.t.Helper()
	raw, err := json.Marshal(result)
	if err != nil {
		h.t.Error(err)
		return
	}
	if err := h.server.Send(h.ctx, NewParsedMessage(ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{JsonRpc: ahptypes.JsonRpcV2, ID: request.ID, Result: raw}})); err != nil {
		h.t.Error(err)
	}
}

func (h *tcpTestHost) emit(action any, origin *ahptypes.ActionOrigin, rejected *string) int64 {
	return h.emitOn("ahp-tcp:/owned", action, origin, rejected)
}

func (h *tcpTestHost) emitOn(resource string, action any, origin *ahptypes.ActionOrigin, rejected *string) int64 {
	h.t.Helper()
	raw, err := json.Marshal(action)
	if err != nil {
		h.t.Fatal(err)
	}
	var typed ahptypes.StateAction
	if err := json.Unmarshal(raw, &typed); err != nil {
		h.t.Fatal(err)
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.seq++
	body, err := json.Marshal(ahptypes.ActionEnvelope{Channel: resource, ServerSeq: h.seq, Action: typed, Origin: origin, RejectionReason: rejected})
	if err != nil {
		h.t.Fatal(err)
	}
	if err := h.server.Send(h.ctx, NewParsedMessage(ahptypes.JsonRpcMessage{Notification: &ahptypes.JsonRpcNotification{JsonRpc: ahptypes.JsonRpcV2, Method: "action", Params: body}})); err != nil {
		h.t.Fatal(err)
	}
	return h.seq
}

func (h *tcpTestHost) unrelatedBurst() {
	h.t.Helper()
	barrier := h.client.AttachSubscription("ahp-session:/barrier")
	defer barrier.Close()
	for i := 0; i < 16; i++ {
		h.emitOn("ahp-session:/other", &ahptypes.SessionTitleChangedAction{Type: ahptypes.ActionTypeSessionTitleChanged, Title: "busy"}, nil, nil)
		h.emitOn("ahp-tcp:/other", &ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: int64(i), Data: "AA=="}, nil, nil)
	}
	h.emitOn(barrier.URI(), &ahptypes.SessionTitleChangedAction{Type: ahptypes.ActionTypeSessionTitleChanged, Title: "barrier"}, nil, nil)
	select {
	case <-barrier.Events():
	case <-h.ctx.Done():
		h.t.Fatal("traffic barrier timed out")
	}
}

func TestOwnedTCPScopedCreationAndActiveTraffic(t *testing.T) {
	release := make(chan struct{})
	h := newTCPTestHost(t, true, nil, true, release)
	h.client.cfg.SubscriptionBuffer = 2
	type opened struct {
		connection *TCPConnection
		err        error
	}
	result := make(chan opened, 1)
	go func() {
		connection, err := h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", tcpCreateParams())
		result <- opened{connection, err}
	}()
	request := <-h.requests
	h.unrelatedBurst()
	h.reply(request, h.snapshot())
	h.emit(&ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: 0, Data: "Bw=="}, nil, nil)
	// The request writer is still blocked: the child route must already exist.
	h.unrelatedBurst()
	close(release)
	out := <-result
	if out.err != nil {
		t.Fatal(out.err)
	}
	c := out.connection
	c.mu.Lock()
	h.unrelatedBurst()
	c.mu.Unlock()
	data, err := c.Read(h.ctx)
	if err != nil || !bytes.Equal(data, []byte{7}) {
		t.Fatalf("first child action lost: %v, %v", data, err)
	}
	credit := h.dispatch()
	h.emit(credit.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: credit.ClientSeq}, nil)
	h.emit(&ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: 1, Data: "CA=="}, nil, nil)
	data, err = c.Read(h.ctx)
	if err != nil || !bytes.Equal(data, []byte{8}) {
		t.Fatalf("active stream failed after unrelated traffic: %v, %v", data, err)
	}
	h.dispatch()
	if err := c.Dispose(h.ctx); err != nil {
		t.Fatal(err)
	}
	h.dispatch()
	h.notification("unsubscribe")
}

func tcpCreateParams() ahptypes.TcpConnectionSubscription {
	return ahptypes.TcpConnectionSubscription{Type: "tcpConnection", Host: "localhost", Port: 3000, Encoding: ahptypes.TcpDataEncodingBase64, ReceiveWindowBytes: 4, MaximumChunkSize: 3}
}

func (h *tcpTestHost) open() *TCPConnection {
	h.t.Helper()
	connection, err := h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", tcpCreateParams())
	if err != nil {
		h.t.Fatal(err)
	}
	return connection
}

func (h *tcpTestHost) notification(method string) ahptypes.JsonRpcNotification {
	h.t.Helper()
	select {
	case notification := <-h.notifications:
		if notification.Method != method {
			h.t.Fatalf("got %s, want %s", notification.Method, method)
		}
		return notification
	case <-h.ctx.Done():
		h.t.Fatal("notification timeout")
		return ahptypes.JsonRpcNotification{}
	}
}

func (h *tcpTestHost) dispatch() ahptypes.DispatchActionParams {
	h.t.Helper()
	n := h.notification("dispatchAction")
	var params ahptypes.DispatchActionParams
	if err := json.Unmarshal(n.Params, &params); err != nil {
		h.t.Fatal(err)
	}
	return params
}

func (h *tcpTestHost) closeGracefully(c *TCPConnection) {
	h.t.Helper()
	done := make(chan error, 1)
	go func() { done <- c.Close(h.ctx) }()
	action := h.dispatch()
	if _, ok := action.Action.Value.(*ahptypes.TcpClientCloseAction); !ok {
		h.t.Fatal("missing client close")
	}
	h.emit(action.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: action.ClientSeq}, nil)
	h.emit(&ahptypes.TcpHostCloseAction{Type: ahptypes.ActionTypeTcpHostClose}, nil, nil)
	if err := <-done; err != nil {
		h.t.Fatal(err)
	}
	h.notification("unsubscribe")
}

func waitTCPState(t *testing.T, ctx context.Context, c *TCPConnection, predicate func(*TCPConnection) bool) {
	t.Helper()
	for {
		c.mu.Lock()
		ok := predicate(c)
		changed := c.changed
		c.mu.Unlock()
		if ok {
			return
		}
		if err := waitTCP(ctx, changed); err != nil {
			t.Fatal(err)
		}
	}
}

func TestOwnedTCPFlowControlAndHalfClose(t *testing.T) {
	h := newTCPTestHost(t, true, []byte("abc"), false)
	c := h.open()
	waitTCPState(t, h.ctx, c, func(c *TCPConnection) bool { return c.state.Output.ReceivedBytes == 3 })
	select {
	case event := <-h.notifications:
		t.Fatalf("receipt released credit: %s", event.Method)
	default:
	}
	data, err := c.Read(h.ctx)
	if err != nil || string(data) != "abc" {
		t.Fatalf("read %q %v", data, err)
	}
	credit := h.dispatch()
	if a, ok := credit.Action.Value.(*ahptypes.TcpDataConsumedAction); !ok || a.ConsumedBytes != 3 {
		t.Fatalf("bad delivered credit: %+v", credit)
	}
	done := make(chan error, 1)
	go func() {
		n, err := c.Write(h.ctx, []byte("abcdef"))
		if err == nil && n != 6 {
			err = errors.New("short write")
		}
		done <- err
	}()
	first, second := h.dispatch(), h.dispatch()
	a, b := first.Action.Value.(*ahptypes.TcpInputAction), second.Action.Value.(*ahptypes.TcpInputAction)
	if a.Offset != 0 || a.Data != "YWJj" || b.Offset != 3 || b.Data != "ZA==" {
		t.Fatalf("chunks: %+v %+v", a, b)
	}
	c.mu.Lock()
	received := c.state.Input.ReceivedBytes
	c.mu.Unlock()
	if received != 0 {
		t.Fatal("optimistic reducer mutation")
	}
	select {
	case err := <-done:
		t.Fatalf("write did not block: %v", err)
	default:
	}
	hostAction := h.emit(&ahptypes.TcpInputConsumedAction{Type: ahptypes.ActionTypeTcpInputConsumed, ConsumedBytes: 0},
		&ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: first.ClientSeq}, nil)
	waitTCPState(t, h.ctx, c, func(c *TCPConnection) bool { return c.checkpoint >= hostAction })
	c.mu.Lock()
	_, retained := c.pending[first.ClientSeq]
	c.mu.Unlock()
	if !retained {
		t.Fatal("host action cleared pending client action")
	}
	h.emit(a, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: first.ClientSeq}, nil)
	h.emit(a, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: first.ClientSeq}, nil)
	h.emit(b, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: second.ClientSeq}, nil)
	h.emit(&ahptypes.TcpInputConsumedAction{Type: ahptypes.ActionTypeTcpInputConsumed, ConsumedBytes: 4}, nil, nil)
	last := h.dispatch()
	lastInput := last.Action.Value.(*ahptypes.TcpInputAction)
	if lastInput.Offset != 4 || lastInput.Data != "ZWY=" {
		t.Fatalf("resumed write %+v", lastInput)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	drained := make(chan error, 1)
	go func() { drained <- c.Drain(h.ctx) }()
	h.emit(lastInput, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: last.ClientSeq}, nil)
	h.emit(&ahptypes.TcpInputConsumedAction{Type: ahptypes.ActionTypeTcpInputConsumed, ConsumedBytes: 6}, nil, nil)
	if err := <-drained; err != nil {
		t.Fatal(err)
	}
	h.emit(&ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: 0, Data: "YWJj"}, nil, nil)
	h.emit(&ahptypes.TcpDataEofAction{Type: ahptypes.ActionTypeTcpDataEof, FinalOffset: 3}, nil, nil)
	if _, err := c.Read(h.ctx); !errors.Is(err, io.EOF) {
		t.Fatalf("duplicate data delivered or missing EOF: %v", err)
	}
	if err := c.End(h.ctx); err != nil {
		t.Fatal(err)
	}
	end := h.dispatch()
	if a, ok := end.Action.Value.(*ahptypes.TcpInputEofAction); !ok || a.FinalOffset != 6 {
		t.Fatalf("bad EOF %+v", end)
	}
	h.emit(credit.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: credit.ClientSeq}, nil)
	h.emit(end.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: end.ClientSeq}, nil)
	h.closeGracefully(c)
	if err := c.Dispose(h.ctx); err != nil {
		t.Fatal(err)
	}
	if err := h.client.Ping(h.ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case n := <-h.notifications:
		t.Fatalf("duplicate cleanup %s", n.Method)
	default:
	}
}

func TestOwnedTCPNegotiatedOutputLimits(t *testing.T) {
	for _, limits := range []struct {
		window, chunk int64
		valid         bool
	}{
		{2, 1, true}, {4, 2, true}, {0, 1, false}, {2, 0, false},
		{5, 1, false}, {4, 3, false}, {1, 2, false},
	} {
		h := newTCPTestHost(t, true, nil, true)
		create := tcpCreateParams()
		create.MaximumChunkSize = 2
		var connection *TCPConnection
		var err error
		done := make(chan struct{})
		go func() { connection, err = h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", create); close(done) }()
		req := <-h.requests
		snapshot := h.snapshot()
		snapshot.Snapshot.State.Tcp.Output.WindowBytes = limits.window
		snapshot.Snapshot.State.Tcp.Output.MaximumChunkSize = limits.chunk
		h.reply(req, snapshot)
		<-done
		if (err == nil) != limits.valid {
			t.Fatalf("limits %d/%d valid=%v: %v", limits.window, limits.chunk, limits.valid, err)
		}
		if connection != nil {
			if connection.state.Output.WindowBytes != limits.window || connection.state.Output.MaximumChunkSize != limits.chunk {
				t.Fatal("negotiated limits not retained")
			}
			if err := connection.Dispose(h.ctx); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func TestOwnedTCPLimitsUInt32(t *testing.T) {
	const limit int64 = 4_294_967_295
	for _, field := range []string{"boundary", "requestWindow", "requestChunk", "inputWindow", "inputChunk", "outputWindow", "outputChunk"} {
		t.Run(field, func(t *testing.T) {
			h := newTCPTestHost(t, true, nil, true)
			create := tcpCreateParams()
			create.ReceiveWindowBytes, create.MaximumChunkSize = limit, limit
			snapshot := h.snapshot()
			state := snapshot.Snapshot.State.Tcp
			state.Input.WindowBytes, state.Input.MaximumChunkSize = limit, limit
			state.Output.WindowBytes, state.Output.MaximumChunkSize = limit, limit
			switch field {
			case "requestWindow":
				create.ReceiveWindowBytes++
			case "requestChunk":
				create.MaximumChunkSize++
			case "inputWindow":
				state.Input.WindowBytes++
			case "inputChunk":
				state.Input.MaximumChunkSize++
			case "outputWindow":
				state.Output.WindowBytes++
			case "outputChunk":
				state.Output.MaximumChunkSize++
			}
			var connection *TCPConnection
			var err error
			done := make(chan struct{})
			go func() { connection, err = h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", create); close(done) }()
			select {
			case req := <-h.requests:
				if field == "requestWindow" || field == "requestChunk" {
					t.Error("out-of-UInt32 request was sent")
				}
				h.reply(req, snapshot)
				<-done
			case <-done:
			case <-h.ctx.Done():
				t.Fatal("creation hung")
			}
			if (err == nil) != (field == "boundary") {
				t.Errorf("UInt32 validation result: %v", err)
			}
			if connection != nil {
				if err := connection.Dispose(h.ctx); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func TestOwnedTCPReconnectFiltersOrdinaryReplay(t *testing.T) {
	old := newTCPTestHost(t, true, nil, false)
	c := old.open()
	if err := old.client.ShutdownPreservingTCP(old.ctx); err != nil {
		t.Fatal(err)
	}
	fresh := newTCPTestHost(t, false, nil, false)
	done := make(chan *ahptypes.ReconnectResult, 1)
	go func() {
		result, err := fresh.client.ReconnectTCPConnections(fresh.ctx, ahptypes.ReconnectParams{ClientId: "owner", LastSeenServerSeq: 20}, []*TCPConnection{c})
		if err != nil {
			t.Error(err)
		}
		done <- result
	}()
	req := <-fresh.requests
	var params ahptypes.ReconnectParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		t.Fatal(err)
	}
	if params.LastSeenServerSeq != 0 {
		t.Fatal("wire checkpoint not clamped for TCP")
	}
	fresh.reply(req, &ahptypes.ReconnectReplayResult{Missing: []string{}, Actions: []ahptypes.ActionEnvelope{
		{Channel: c.Resource(), ServerSeq: 11, Action: ahptypes.StateAction{Value: &ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Data: "eA=="}}},
		{Channel: "ahp-terminal:/t", ServerSeq: 15, Action: ahptypes.StateAction{Value: &ahptypes.TerminalDataAction{Type: ahptypes.ActionTypeTerminalData, Data: "hello"}}},
		{Channel: "ahp-terminal:/t", ServerSeq: 21, Action: ahptypes.StateAction{Value: &ahptypes.TerminalDataAction{Type: ahptypes.ActionTypeTerminalData, Data: "!"}}},
	}})
	result := <-done
	if result == nil {
		t.Fatal("reconnect failed")
	}
	text := "hello"
	for _, action := range result.Value.(*ahptypes.ReconnectReplayResult).Actions {
		if data, ok := action.Action.Value.(*ahptypes.TerminalDataAction); ok {
			text += data.Data
		}
	}
	if text != "hello!" {
		t.Fatalf("ordinary replay duplicated output: %q", text)
	}
	if data, err := c.Read(fresh.ctx); err != nil || string(data) != "x" {
		t.Fatalf("TCP replay lost: %q %v", data, err)
	}
	if err := c.Dispose(fresh.ctx); err != nil {
		t.Fatal(err)
	}
}

func TestOwnedTCPCloseRetainsCrossingDataUntilAcknowledged(t *testing.T) {
	h := newTCPTestHost(t, true, nil, false)
	c := h.open()
	done := make(chan error, 1)
	go func() { done <- c.Close(h.ctx) }()
	closeAction := h.dispatch()
	if _, ok := closeAction.Action.Value.(*ahptypes.TcpClientCloseAction); !ok {
		t.Fatal("missing client close")
	}
	if c.IsClosed() {
		t.Fatal("local close released ownership before host close")
	}
	h.emit(closeAction.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: closeAction.ClientSeq}, nil)
	h.emit(&ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: 0, Data: "YWI="}, nil, nil)
	seq := h.emit(&ahptypes.TcpHostCloseAction{Type: ahptypes.ActionTypeTcpHostClose}, nil, nil)
	waitTCPState(t, h.ctx, c, func(c *TCPConnection) bool { return c.checkpoint == seq })
	if err := h.client.Ping(h.ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case n := <-h.notifications:
		t.Fatalf("cleanup before output drain: %s", n.Method)
	default:
	}
	data, err := c.Read(h.ctx)
	if err != nil || string(data) != "ab" {
		t.Fatalf("crossing data %q: %v", data, err)
	}
	credit := h.dispatch()
	if a, ok := credit.Action.Value.(*ahptypes.TcpDataConsumedAction); !ok || a.ConsumedBytes != 2 {
		t.Fatal("missing read credit")
	}
	if _, err := c.Read(h.ctx); !errors.Is(err, io.EOF) {
		t.Fatal("host close did not finish output")
	}
	if c.IsClosed() {
		t.Fatal("released before credit acknowledgement")
	}
	h.emit(credit.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: credit.ClientSeq}, nil)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	h.notification("unsubscribe")
	if !c.IsClosed() {
		t.Fatal("handshake did not release ownership")
	}
}

func TestOwnedTCPClosingResumesAndResetWakesClose(t *testing.T) {
	old := newTCPTestHost(t, true, nil, false)
	c := old.open()
	closed := make(chan error, 1)
	go func() { closed <- c.Close(old.ctx) }()
	original := old.dispatch()
	if err := old.client.ShutdownPreservingTCP(old.ctx); err != nil {
		t.Fatal(err)
	}
	fresh := newTCPTestHost(t, false, nil, false)
	resumed := make(chan error, 1)
	go func() {
		_, err := fresh.client.ReconnectTCPConnections(fresh.ctx, ahptypes.ReconnectParams{ClientId: "owner"}, []*TCPConnection{c})
		resumed <- err
	}()
	req := <-fresh.requests
	fresh.reply(req, &ahptypes.ReconnectReplayResult{Actions: []ahptypes.ActionEnvelope{}, Missing: []string{}})
	if err := <-resumed; err != nil {
		t.Fatal(err)
	}
	action := fresh.dispatch()
	if _, ok := action.Action.Value.(*ahptypes.TcpClientCloseAction); !ok || action.ClientSeq != original.ClientSeq {
		t.Fatal("closing resume replaced or renumbered client close")
	}
	select {
	case err := <-closed:
		t.Fatalf("close completed before handshake: %v", err)
	default:
	}
	fresh.emit(&ahptypes.TcpHostResetAction{Type: ahptypes.ActionTypeTcpHostReset, Reason: ahptypes.TcpResetReasonConnectionReset}, nil, nil)
	select {
	case err := <-closed:
		var tcpErr *TCPConnectionError
		if !errors.As(err, &tcpErr) || tcpErr.Reason != "reset" {
			t.Fatalf("reset close result: %v", err)
		}
	case <-fresh.ctx.Done():
		t.Fatal("reset left close blocked")
	}
	fresh.notification("unsubscribe")
	if err := c.Dispose(fresh.ctx); err != nil {
		t.Fatal(err)
	}
	if err := fresh.client.Ping(fresh.ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case n := <-fresh.notifications:
		t.Fatalf("duplicate cleanup: %s", n.Method)
	default:
	}
}

func TestOwnedTCPResetAndRejectionWakeWaiters(t *testing.T) {
	for _, reject := range []bool{false, true} {
		t.Run(map[bool]string{false: "reset", true: "rejection"}[reject], func(t *testing.T) {
			h := newTCPTestHost(t, true, nil, false)
			c := h.open()
			if _, err := c.Write(h.ctx, []byte("abcd")); err != nil {
				t.Fatal(err)
			}
			first := h.dispatch()
			h.dispatch()
			results := make(chan error, 3)
			go func() { _, err := c.Read(h.ctx); results <- err }()
			go func() { _, err := c.Write(h.ctx, []byte("x")); results <- err }()
			go func() { results <- c.Drain(h.ctx) }()
			if reject {
				reason := ""
				h.emit(first.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: first.ClientSeq}, &reason)
			} else {
				h.emit(&ahptypes.TcpHostResetAction{Type: ahptypes.ActionTypeTcpHostReset, Reason: ahptypes.TcpResetReasonConnectionReset}, nil, nil)
			}
			for i := 0; i < 3; i++ {
				select {
				case err := <-results:
					if err == nil {
						t.Fatal("waiter succeeded after terminal failure")
					}
				case <-h.ctx.Done():
					t.Fatal("waiter hung")
				}
			}
			if reject {
				if a, ok := h.dispatch().Action.Value.(*ahptypes.TcpClientResetAction); !ok || a.Reason != ahptypes.TcpResetReasonProtocolError {
					t.Fatal("missing protocol reset")
				}
			}
			h.notification("unsubscribe")
		})
	}
}

func TestOwnedTCPReconnectRetainsHandleAndPendingSequences(t *testing.T) {
	for _, acknowledged := range []bool{false, true} {
		t.Run(map[bool]string{false: "resend", true: "acknowledged"}[acknowledged], func(t *testing.T) {
			old := newTCPTestHost(t, true, nil, false)
			c := old.open()
			if _, err := c.Write(old.ctx, []byte("ab")); err != nil {
				t.Fatal(err)
			}
			original := old.dispatch()
			seq := old.emit(&ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: 0, Data: "eHk="}, nil, nil)
			waitTCPState(t, old.ctx, c, func(c *TCPConnection) bool { return c.checkpoint == seq })
			if err := old.client.ShutdownPreservingTCP(old.ctx); err != nil {
				t.Fatal(err)
			}
			fresh := newTCPTestHost(t, false, nil, false)
			done := make(chan error, 1)
			go func() {
				_, err := fresh.client.ReconnectTCPConnections(fresh.ctx, ahptypes.ReconnectParams{ClientId: "owner", LastSeenServerSeq: 999, Subscriptions: []string{"ahp-session:/s1"}}, []*TCPConnection{c})
				done <- err
			}()
			var request ahptypes.JsonRpcRequest
			select {
			case request = <-fresh.requests:
			case <-fresh.ctx.Done():
				t.Fatal("missing reconnect")
			}
			var params ahptypes.ReconnectParams
			if err := json.Unmarshal(request.Params, &params); err != nil {
				t.Fatal(err)
			}
			if request.Method != "reconnect" || params.LastSeenServerSeq != seq || len(params.Subscriptions) != 2 {
				t.Fatalf("unsafe reconnect %+v", params)
			}
			actions := []ahptypes.ActionEnvelope{}
			if acknowledged {
				actions = append(actions, ahptypes.ActionEnvelope{Channel: c.Resource(), ServerSeq: 2, Action: original.Action, Origin: &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: original.ClientSeq}})
			}
			fresh.reply(request, &ahptypes.ReconnectReplayResult{Actions: actions, Missing: []string{}})
			if err := <-done; err != nil {
				t.Fatal(err)
			}
			if err := old.client.Shutdown(old.ctx); err != nil {
				t.Fatal(err)
			}
			if c.IsClosed() {
				t.Fatal("old client shutdown disposed rebound stream")
			}
			if !acknowledged {
				replayed := fresh.dispatch()
				if replayed.ClientSeq != original.ClientSeq || replayed.Channel != original.Channel {
					t.Fatal("pending action was renumbered")
				}
				if a := replayed.Action.Value.(*ahptypes.TcpInputAction); a.Offset != 0 || a.Data != "YWI=" {
					t.Fatal("pending bytes changed")
				}
			}
			data, err := c.Read(fresh.ctx)
			if err != nil || string(data) != "xy" {
				t.Fatalf("retained read %q %v", data, err)
			}
			credit := fresh.dispatch()
			if _, ok := credit.Action.Value.(*ahptypes.TcpDataConsumedAction); !ok || credit.ClientSeq <= original.ClientSeq {
				t.Fatalf("ack replayed or sequence reused: %+v", credit)
			}
			fresh.client.tcpMu.Lock()
			retainedIdentity := fresh.client.tcpClientID == "owner" && fresh.client.tcpCapability != nil
			fresh.client.tcpMu.Unlock()
			if !retainedIdentity {
				t.Fatal("resume lost negotiated TCP capability")
			}
			if err := c.Dispose(fresh.ctx); err != nil {
				t.Fatal(err)
			}
			fresh.dispatch()
			fresh.notification("unsubscribe")
		})
	}
}

func TestOwnedTCPReconnectAppliesReplayBeforeQueuedLiveData(t *testing.T) {
	old := newTCPTestHost(t, true, nil, false)
	c := old.open()
	if _, err := c.Write(old.ctx, []byte("xy")); err != nil {
		t.Fatal(err)
	}
	original := old.dispatch()
	if err := old.client.ShutdownPreservingTCP(old.ctx); err != nil {
		t.Fatal(err)
	}
	fresh := newTCPTestHost(t, false, nil, false)
	fresh.client.cfg.SubscriptionBuffer = 2
	done := make(chan error, 1)
	go func() {
		_, err := fresh.client.ReconnectTCPConnections(fresh.ctx,
			ahptypes.ReconnectParams{ClientId: "owner", LastSeenServerSeq: 999}, []*TCPConnection{c})
		done <- err
	}()
	request := <-fresh.requests
	fresh.mu.Lock()
	fresh.seq = 1
	fresh.mu.Unlock()
	fresh.unrelatedBurst()
	func() {
		// Hold application of replay while the receive loop queues later live frames.
		c.mu.Lock()
		defer c.mu.Unlock()
		if !c.resuming || c.online {
			t.Fatal("stream operations were released before replay")
		}
		fresh.reply(request, &ahptypes.ReconnectReplayResult{
			Actions: []ahptypes.ActionEnvelope{{
				Channel: c.resource, ServerSeq: 1,
				Action: ahptypes.StateAction{Value: &ahptypes.TcpDataAction{
					Type: ahptypes.ActionTypeTcpData, Offset: 0, Data: "YWI=",
				}},
			}},
			Missing: []string{},
		})
		fresh.unrelatedBurst()
		fresh.emit(&ahptypes.TcpDataAction{Type: ahptypes.ActionTypeTcpData, Offset: 2, Data: "Y2Q="}, nil, nil)
		fresh.emit(&ahptypes.TcpDataEofAction{Type: ahptypes.ActionTypeTcpDataEof, FinalOffset: 4}, nil, nil)
		if err := fresh.client.Ping(fresh.ctx); err != nil {
			t.Fatal(err)
		}
		select {
		case n := <-fresh.notifications:
			t.Fatalf("outgoing action before replay applied: %s", n.Method)
		default:
		}
	}()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	resend := fresh.dispatch()
	if resend.ClientSeq != original.ClientSeq {
		t.Fatal("resume renumbered pending input")
	}
	if input, ok := resend.Action.Value.(*ahptypes.TcpInputAction); !ok || input.Offset != 0 || input.Data != "eHk=" {
		t.Fatalf("incorrect resumed input: %+v", resend)
	}
	if err := fresh.client.Ping(fresh.ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case n := <-fresh.notifications:
		t.Fatalf("receipt released credit or duplicated input: %s", n.Method)
	default:
	}
	for i, expected := range []string{"ab", "cd"} {
		data, err := c.Read(fresh.ctx)
		if err != nil || string(data) != expected {
			t.Fatalf("read %q: %v", data, err)
		}
		credit := fresh.dispatch()
		if action, ok := credit.Action.Value.(*ahptypes.TcpDataConsumedAction); !ok ||
			action.ConsumedBytes != int64((i+1)*2) || credit.ClientSeq <= original.ClientSeq {
			t.Fatalf("incorrect resumed credit: %+v", credit)
		}
	}
	if _, err := c.Read(fresh.ctx); !errors.Is(err, io.EOF) {
		t.Fatalf("missing live EOF: %v", err)
	}
	if err := c.Dispose(fresh.ctx); err != nil {
		t.Fatal(err)
	}
	fresh.dispatch()
	fresh.notification("unsubscribe")
}

func TestOwnedTCPReconnectSnapshotAndMissingAreTerminal(t *testing.T) {
	for _, snapshot := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing", true: "snapshot"}[snapshot], func(t *testing.T) {
			old := newTCPTestHost(t, true, nil, false)
			c := old.open()
			old.client.ShutdownPreservingTCP(old.ctx)
			fresh := newTCPTestHost(t, false, nil, false)
			done := make(chan error, 1)
			go func() {
				_, err := fresh.client.ReconnectTCPConnections(fresh.ctx, ahptypes.ReconnectParams{ClientId: "owner"}, []*TCPConnection{c})
				done <- err
			}()
			request := <-fresh.requests
			if snapshot {
				fresh.reply(request, &ahptypes.ReconnectSnapshotResult{Snapshots: []ahptypes.Snapshot{*fresh.snapshot().Snapshot}})
			} else {
				fresh.reply(request, &ahptypes.ReconnectReplayResult{Actions: []ahptypes.ActionEnvelope{}, Missing: []string{c.Resource()}})
			}
			if err := <-done; err != nil {
				t.Fatal(err)
			}
			_, err := c.Read(fresh.ctx)
			var tcpErr *TCPConnectionError
			if !errors.As(err, &tcpErr) || tcpErr.Reason != "replayUnavailable" {
				t.Fatalf("restored invalid stream: %v", err)
			}
			fresh.notification("unsubscribe")
			next := fresh.open()
			if err := next.Dispose(fresh.ctx); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestOwnedTCPCancelledCreationCleansKnownChild(t *testing.T) {
	h := newTCPTestHost(t, true, nil, true)
	ctx, cancel := context.WithCancel(h.ctx)
	done := make(chan error, 1)
	go func() { _, err := h.client.OpenTCPConnection(ctx, "ahp-session:/s1", tcpCreateParams()); done <- err }()
	request := <-h.requests
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	h.reply(request, h.snapshot())
	h.dispatch()
	n := h.notification("unsubscribe")
	var params ahptypes.UnsubscribeParams
	if err := json.Unmarshal(n.Params, &params); err != nil {
		t.Fatal(err)
	}
	if params.Channel != "ahp-tcp:/owned" {
		t.Fatalf("unsubscribed parent: %s", params.Channel)
	}
}

func TestOwnedTCPClientShutdownDisposesLiveAndSuspendedStreams(t *testing.T) {
	for _, suspended := range []bool{false, true} {
		t.Run(map[bool]string{false: "live", true: "suspended"}[suspended], func(t *testing.T) {
			h := newTCPTestHost(t, true, nil, false)
			c := h.open()
			if _, err := c.Write(h.ctx, []byte("abcd")); err != nil {
				t.Fatal(err)
			}
			h.dispatch()
			h.dispatch()
			results := make(chan error, 3)
			go func() { _, err := c.Read(h.ctx); results <- err }()
			go func() { _, err := c.Write(h.ctx, []byte("x")); results <- err }()
			go func() { results <- c.Drain(h.ctx) }()
			for {
				c.mu.Lock()
				waiting := c.writing
				c.mu.Unlock()
				if waiting {
					break
				}
				select {
				case <-h.ctx.Done():
					t.Fatal("writer never blocked")
				default:
					runtime.Gosched()
				}
			}
			if suspended {
				if err := h.client.ShutdownPreservingTCP(h.ctx); err != nil {
					t.Fatal(err)
				}
				if c.IsClosed() {
					t.Fatal("preserving shutdown disposed stream")
				}
			}
			if err := h.client.Shutdown(h.ctx); err != nil {
				t.Fatal(err)
			}
			if !c.IsClosed() {
				t.Fatal("shutdown left stream suspended")
			}
			if h.client.registerTCPStream(c) {
				t.Fatal("shutdown permitted new stream registration")
			}
			for i := 0; i < 3; i++ {
				select {
				case err := <-results:
					var tcpErr *TCPConnectionError
					if !errors.As(err, &tcpErr) || tcpErr.Reason != "disposed" {
						t.Fatalf("waiter: %v", err)
					}
				case <-h.ctx.Done():
					t.Fatal("shutdown left waiter blocked")
				}
			}
			if err := h.client.Shutdown(h.ctx); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestOwnedTCPCloseWaitsForAcceptedInput(t *testing.T) {
	h := newTCPTestHost(t, true, nil, false)
	c := h.open()
	if _, err := c.Write(h.ctx, []byte("ab")); err != nil {
		t.Fatal(err)
	}
	input := h.dispatch()
	done := make(chan error, 1)
	go func() { done <- c.Close(h.ctx) }()
	waitTCPState(t, h.ctx, c, func(c *TCPConnection) bool { return c.ending })
	select {
	case err := <-done:
		t.Fatalf("closed before drain: %v", err)
	default:
	}
	select {
	case n := <-h.notifications:
		t.Fatalf("premature %s", n.Method)
	default:
	}
	h.emit(input.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: input.ClientSeq}, nil)
	h.emit(&ahptypes.TcpInputConsumedAction{Type: ahptypes.ActionTypeTcpInputConsumed, ConsumedBytes: 2}, nil, nil)
	closeAction := h.dispatch()
	if _, ok := closeAction.Action.Value.(*ahptypes.TcpClientCloseAction); !ok {
		t.Fatal("missing final close")
	}
	h.emit(closeAction.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: closeAction.ClientSeq}, nil)
	h.emit(&ahptypes.TcpHostCloseAction{Type: ahptypes.ActionTypeTcpHostClose}, nil, nil)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	h.notification("unsubscribe")
}

func TestOwnedTCPLargePayloadEncoding(t *testing.T) {
	h := newTCPTestHost(t, true, nil, true)
	const size = 4 * 1024 * 1024
	params := tcpCreateParams()
	params.ReceiveWindowBytes, params.MaximumChunkSize = size, size
	var c *TCPConnection
	var err error
	done := make(chan struct{})
	go func() { c, err = h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", params); close(done) }()
	req := <-h.requests
	snapshot := h.snapshot()
	snapshot.Snapshot.State.Tcp.Input.WindowBytes, snapshot.Snapshot.State.Tcp.Input.MaximumChunkSize = size, size
	snapshot.Snapshot.State.Tcp.Output.WindowBytes, snapshot.Snapshot.State.Tcp.Output.MaximumChunkSize = size, size
	h.reply(req, snapshot)
	<-done
	if err != nil {
		t.Fatal(err)
	}
	payload := bytes.Repeat([]byte{0xab}, size)
	if n, err := c.Write(h.ctx, payload); err != nil || n != size {
		t.Fatalf("write %d: %v", n, err)
	}
	input := h.dispatch()
	action := input.Action.Value.(*ahptypes.TcpInputAction)
	decoded, err := base64.StdEncoding.Strict().DecodeString(action.Data)
	if err != nil || !bytes.Equal(decoded, payload) || action.Offset != 0 {
		t.Fatalf("incorrect large payload: %v", err)
	}
	h.emit(action, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: input.ClientSeq}, nil)
	h.emit(&ahptypes.TcpInputConsumedAction{Type: ahptypes.ActionTypeTcpInputConsumed, ConsumedBytes: size}, nil, nil)
	h.closeGracefully(c)
}
func TestOwnedTCPStrictLossWakesReader(t *testing.T) {
	for _, overflow := range []bool{false, true} {
		t.Run(map[bool]string{false: "decode", true: "overflow"}[overflow], func(t *testing.T) {
			h := newTCPTestHost(t, true, nil, false)
			c := h.open()
			done := make(chan error, 1)
			go func() { _, err := c.Read(h.ctx); done <- err }()
			if overflow {
				c.mu.Lock()
				for i := 0; i < h.client.cfg.SubscriptionBuffer+2; i++ {
					h.emit(map[string]any{"type": "future/tcp"}, nil, nil)
				}
				err := h.client.Ping(h.ctx)
				c.mu.Unlock()
				if err != nil {
					t.Fatal(err)
				}
			} else if err := h.server.Send(h.ctx, NewTextMessage("{")); err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-done:
				var lag *SubscriptionLagError
				var protocol *TransportError
				if overflow && !errors.As(err, &lag) || !overflow && (!errors.As(err, &protocol) || protocol.Kind != "protocol") {
					t.Fatalf("loss was not surfaced: %v", err)
				}
			case <-h.ctx.Done():
				t.Fatal("loss did not wake reader")
			}
			if _, ok := h.dispatch().Action.Value.(*ahptypes.TcpClientResetAction); !ok {
				t.Fatal("missing loss reset")
			}
			h.notification("unsubscribe")
			if _, err := c.Read(h.ctx); err == nil {
				t.Fatal("failed stream resumed")
			}
		})
	}
}

func TestOwnedTCPValidationAndInvalidCreationCleanup(t *testing.T) {
	h := newTCPTestHost(t, false, nil, true)
	if c, err := h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", tcpCreateParams()); err == nil || c != nil {
		t.Fatal("uninitialized creation accepted")
	}
	if _, err := h.client.Initialize(h.ctx, "owner", ahptypes.SupportedProtocolVersions(), nil); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*ahptypes.TcpConnectionSubscription){
		func(p *ahptypes.TcpConnectionSubscription) { p.Port = 0 },
		func(p *ahptypes.TcpConnectionSubscription) { p.Host = "http://localhost" },
		func(p *ahptypes.TcpConnectionSubscription) { p.MaximumChunkSize = 5 },
		func(p *ahptypes.TcpConnectionSubscription) { p.ReceiveWindowBytes = tcpMaxSafeInteger + 1 },
		func(p *ahptypes.TcpConnectionSubscription) { p.Encoding = "future" },
	} {
		params := tcpCreateParams()
		change(&params)
		if c, err := h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", params); err == nil || c != nil {
			t.Fatal("invalid creation accepted")
		}
	}
	done := make(chan error, 1)
	go func() {
		c, err := h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", tcpCreateParams())
		if c != nil {
			t.Error("invalid creation returned a handle")
		}
		done <- err
	}()
	request := <-h.requests
	response := h.snapshot()
	response.Snapshot.State.Tcp.Input.ReceivedBytes = 1
	h.reply(request, response)
	if err := <-done; err == nil {
		t.Fatal("non-fresh snapshot accepted")
	}
	h.notification("unsubscribe")
}

func TestOwnedTCPTimeoutReleasesLateChildOnLiveTransport(t *testing.T) {
	for _, mode := range []string{"valid", "malformedState", "heldSend"} {
		t.Run(mode, func(t *testing.T) {
			var gate chan struct{}
			var gates []<-chan struct{}
			if mode == "heldSend" {
				gate = make(chan struct{})
				gates = append(gates, gate)
			}
			h := newTCPTestHost(t, true, nil, true, gates...)
			h.client.cfg.DefaultRequestTimeout = 100 * time.Millisecond
			done := make(chan error, 1)
			go func() {
				c, err := h.client.OpenTCPConnection(h.ctx, "ahp-session:/s1", tcpCreateParams())
				if c != nil {
					t.Error("timeout returned a connection")
				}
				done <- err
			}()
			request := <-h.requests
			if err := <-done; !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("expected timeout: %v", err)
			}
			if gate != nil {
				close(gate)
			}
			if mode == "malformedState" {
				h.reply(request, json.RawMessage(`{"snapshot":{"state":{"type":"tcp","input":{"windowBytes":0.5}},"resource":"ahp-tcp:/owned","fromSeq":0}}`))
			} else {
				h.reply(request, h.snapshot())
			}
			reset := h.dispatch()
			if reset.Channel != "ahp-tcp:/owned" {
				t.Fatal("reset targeted parent")
			}
			if action, ok := reset.Action.Value.(*ahptypes.TcpClientResetAction); !ok || action.Reason != ahptypes.TcpResetReasonConnectionAborted {
				t.Fatal("missing late creation reset")
			}
			n := h.notification("unsubscribe")
			var params ahptypes.UnsubscribeParams
			if err := json.Unmarshal(n.Params, &params); err != nil {
				t.Fatal(err)
			}
			if params.Channel != "ahp-tcp:/owned" {
				t.Fatal("unsubscribed parent")
			}
			h.reply(request, h.snapshot())
			if err := h.client.Ping(h.ctx); err != nil {
				t.Fatal(err)
			}
			select {
			case n := <-h.notifications:
				t.Fatalf("duplicate cleanup: %s", n.Method)
			default:
			}
		})
	}
}

func TestOwnedTCPResumeDoesNotReuseFullyAckedSequence(t *testing.T) {
	old := newTCPTestHost(t, true, nil, false)
	c := old.open()
	if _, err := c.Write(old.ctx, []byte("ab")); err != nil {
		t.Fatal(err)
	}
	original := old.dispatch()
	old.emit(original.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: original.ClientSeq}, nil)
	waitTCPState(t, old.ctx, c, func(c *TCPConnection) bool { return len(c.pending) == 0 })
	ordinary, err := old.client.Dispatch(old.ctx, "ahp-session:/s1", ahptypes.StateAction{
		Value: &ahptypes.SessionTitleChangedAction{Type: ahptypes.ActionTypeSessionTitleChanged, Title: "ordinary"},
	})
	if err != nil {
		t.Fatal(err)
	}
	old.dispatch()
	old.client.ShutdownPreservingTCP(old.ctx)
	fresh := newTCPTestHost(t, false, nil, false)
	done := make(chan error, 1)
	go func() {
		_, err := fresh.client.ReconnectTCPConnections(fresh.ctx, ahptypes.ReconnectParams{ClientId: "owner", LastSeenServerSeq: 1}, []*TCPConnection{c})
		done <- err
	}()
	request := <-fresh.requests
	fresh.reply(request, &ahptypes.ReconnectReplayResult{Actions: []ahptypes.ActionEnvelope{}, Missing: []string{}})
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if _, err := c.Write(fresh.ctx, []byte("c")); err != nil {
		t.Fatal(err)
	}
	next := fresh.dispatch()
	if next.ClientSeq <= ordinary.ClientSeq {
		t.Fatal("reused original client's ordinary action sequence")
	}
	if action, ok := next.Action.Value.(*ahptypes.TcpInputAction); !ok || action.Offset != 2 {
		t.Fatal("lost retained input offset")
	}
	if err := c.Dispose(fresh.ctx); err != nil {
		t.Fatal(err)
	}
	fresh.dispatch()
	fresh.notification("unsubscribe")
}

func TestOwnedTCPFinalCloseDrainsBufferedReads(t *testing.T) {
	h := newTCPTestHost(t, true, []byte("abc"), false)
	c := h.open()
	if _, err := c.Write(h.ctx, []byte("abcd")); err != nil {
		t.Fatal(err)
	}
	first, second := h.dispatch(), h.dispatch()
	write := make(chan error, 1)
	drain := make(chan error, 1)
	go func() { _, err := c.Write(h.ctx, []byte("x")); write <- err }()
	go func() { drain <- c.Drain(h.ctx) }()
	h.emit(&ahptypes.TcpHostCloseAction{Type: ahptypes.ActionTypeTcpHostClose}, nil, nil)
	if err := <-write; err == nil {
		t.Fatal("host close did not stop new writes")
	}
	select {
	case err := <-drain:
		t.Fatalf("drain finished before input consumption: %v", err)
	default:
	}
	closeAction := h.dispatch()
	if _, ok := closeAction.Action.Value.(*ahptypes.TcpClientCloseAction); !ok {
		t.Fatal("missing close response before input consumption")
	}
	if c.IsClosed() {
		t.Fatal("close response disposed unconsumed input")
	}
	if data, err := c.Read(h.ctx); string(data) != "abc" || err != nil {
		t.Fatalf("lost buffered close data %q: %v", data, err)
	}
	if _, err := c.Read(h.ctx); !errors.Is(err, io.EOF) {
		t.Fatal(err)
	}
	credit := h.dispatch()
	if _, ok := credit.Action.Value.(*ahptypes.TcpDataConsumedAction); !ok {
		t.Fatal("missing read credit")
	}
	h.emit(first.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: first.ClientSeq}, nil)
	h.emit(second.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: second.ClientSeq}, nil)
	ack := h.emit(closeAction.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: closeAction.ClientSeq}, nil)
	waitTCPState(t, h.ctx, c, func(c *TCPConnection) bool { return c.checkpoint == ack })
	if c.IsClosed() {
		t.Fatal("two-sided close discarded unconsumed bytes")
	}
	if err := h.client.Ping(h.ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case n := <-h.notifications:
		t.Fatalf("cleanup before drain: %s", n.Method)
	default:
	}
	h.emit(&ahptypes.TcpInputConsumedAction{Type: ahptypes.ActionTypeTcpInputConsumed, ConsumedBytes: 4}, nil, nil)
	if err := <-drain; err != nil {
		t.Fatal(err)
	}
	if c.IsClosed() {
		t.Fatal("closed before credit ack")
	}
	h.emit(credit.Action.Value, &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: credit.ClientSeq}, nil)
	h.notification("unsubscribe")
	if err := c.Close(h.ctx); err != nil {
		t.Fatal(err)
	}
}

func TestOwnedTCPInvalidEchoTerminatesWithoutRetainingPayload(t *testing.T) {
	for _, mode := range []string{"missing", "foreign", "zero", "negative", "unsafe", "unassigned",
		"mismatched", "reusedAck", "creditMissing", "eofMissing", "closeMissing", "resetMissing"} {
		t.Run(mode, func(t *testing.T) {
			h := newTCPTestHost(t, true, []byte("x"), false)
			c := h.open()
			if _, err := c.Write(h.ctx, []byte("ab")); err != nil {
				t.Fatal(err)
			}
			original := h.dispatch()
			action := original.Action.Value
			origin := &ahptypes.ActionOrigin{ClientId: "owner", ClientSeq: original.ClientSeq}
			switch mode {
			case "missing":
				origin = nil
			case "foreign":
				origin.ClientId = "another"
			case "zero":
				origin.ClientSeq = 0
			case "negative":
				origin.ClientSeq = -1
			case "unsafe":
				origin.ClientSeq = tcpMaxSafeInteger + 1
			case "unassigned":
				origin.ClientSeq += 100
			case "mismatched":
				action = &ahptypes.TcpInputAction{Type: ahptypes.ActionTypeTcpInput, Offset: 0, Data: "eHk="}
			case "reusedAck":
				seq := h.emit(original.Action.Value, origin, nil)
				waitTCPState(t, h.ctx, c, func(c *TCPConnection) bool { return c.checkpoint == seq })
				if _, err := c.Write(h.ctx, []byte("c")); err != nil {
					t.Fatal(err)
				}
				action = h.dispatch().Action.Value
			case "creditMissing":
				if _, err := c.Read(h.ctx); err != nil {
					t.Fatal(err)
				}
				action = h.dispatch().Action.Value
				origin = nil
			case "eofMissing":
				if err := c.End(h.ctx); err != nil {
					t.Fatal(err)
				}
				action = h.dispatch().Action.Value
				origin = nil
			case "closeMissing":
				action = &ahptypes.TcpClientCloseAction{Type: ahptypes.ActionTypeTcpClientClose}
				origin = nil
			case "resetMissing":
				action = &ahptypes.TcpClientResetAction{Type: ahptypes.ActionTypeTcpClientReset, Reason: ahptypes.TcpResetReasonConnectionAborted}
				origin = nil
			}
			c.mu.Lock()
			beforeInput, beforeConsumed := c.state.Input.ReceivedBytes, c.state.Output.ConsumedBytes
			c.mu.Unlock()
			h.emit(action, origin, nil)
			waitTCPState(t, h.ctx, c, func(c *TCPConnection) bool { return c.terminal })
			c.mu.Lock()
			unchanged := c.state.Input.ReceivedBytes == beforeInput && c.state.Output.ConsumedBytes == beforeConsumed
			released := len(c.pending) == 0
			c.mu.Unlock()
			if !unchanged || !released {
				t.Fatal("bad echo changed counters or retained payload")
			}
			if _, err := c.Read(h.ctx); err == nil {
				t.Fatal("bad echo did not terminate reader")
			}
			if _, err := c.Write(h.ctx, []byte("z")); err == nil {
				t.Fatal("bad echo did not terminate writer")
			}
			if reset, ok := h.dispatch().Action.Value.(*ahptypes.TcpClientResetAction); !ok || reset.Reason != ahptypes.TcpResetReasonProtocolError {
				t.Fatal("missing protocol reset")
			}
			h.notification("unsubscribe")
		})
	}
}

func TestOwnedTCPMalformedReplayIsTerminal(t *testing.T) {
	old := newTCPTestHost(t, true, nil, false)
	c := old.open()
	old.client.ShutdownPreservingTCP(old.ctx)
	fresh := newTCPTestHost(t, false, nil, false)
	if _, err := fresh.client.ReconnectTCPConnections(fresh.ctx, ahptypes.ReconnectParams{ClientId: "different"}, []*TCPConnection{c}); err == nil {
		t.Fatal("changed owner accepted")
	}
	done := make(chan error, 1)
	go func() {
		_, err := fresh.client.ReconnectTCPConnections(fresh.ctx, ahptypes.ReconnectParams{ClientId: "owner"}, []*TCPConnection{c})
		done <- err
	}()
	request := <-fresh.requests
	fresh.reply(request, map[string]any{"type": "replay", "missing": []any{}, "actions": []any{
		map[string]any{"channel": c.Resource(), "serverSeq": 1, "action": map[string]any{"type": "tcp/dataEof", "finalOffset": 0.5}},
	}})
	if err := <-done; err == nil {
		t.Fatal("malformed replay succeeded")
	}
	if _, err := c.Read(fresh.ctx); err == nil {
		t.Fatal("malformed replay did not terminate stream")
	}
	fresh.dispatch()
	fresh.notification("unsubscribe")
}
