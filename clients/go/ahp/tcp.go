package ahp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"sort"
	"strings"
	"sync"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

const tcpMaxWindowBytes int64 = (1 << 32) - 1

// TCPConnectionError is a terminal stream or invalid-operation error.
type TCPConnectionError struct {
	Reason string
	Cause  error
}

func (e *TCPConnectionError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("ahp: TCP %s: %v", e.Reason, e.Cause)
	}
	return "ahp: TCP " + e.Reason
}

func (e *TCPConnectionError) Unwrap() error { return e.Cause }

type tcpPending struct {
	action ahptypes.StateAction
	sent   uint64
}

// TCPConnection owns one protocol byte stream, not a native socket.
// Write accepts bytes into bounded protocol credit; Drain waits for consumption
// at the host. Transport loss suspends the same handle until explicitly resumed.
type TCPConnection struct {
	mu          sync.Mutex
	sendMu      sync.Mutex
	resumeMu    sync.Mutex
	client      *Client
	events      *EventStream
	resource    string
	owner       string
	state       ahptypes.TcpConnectionState
	checkpoint  int64
	lastSeq     int64
	epoch       uint64
	online      bool
	resuming    bool
	writing     bool
	ending      bool
	closing     bool
	closeQueued bool
	terminal    bool
	err         error
	pending     map[int64]tcpPending
	received    [][]byte
	sentBytes   int64
	consumed    int64
	changed     chan struct{}
	cleanup     chan struct{}
	cleanupErr  error
}

// Resource is the host-assigned child channel URI.
func (t *TCPConnection) Resource() string { return t.resource }

// IsClosed reports final close/reset/disposal, not a resumable transport loss.
func (t *TCPConnection) IsClosed() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.terminal
}

func (c *Client) registerTCPStream(connection *TCPConnection) bool {
	c.tcpMu.Lock()
	defer c.tcpMu.Unlock()
	if c.tcpDisposed {
		return false
	}
	if c.tcpStreams == nil {
		c.tcpStreams = make(map[*TCPConnection]struct{})
	}
	c.tcpStreams[connection] = struct{}{}
	return true
}

func (c *Client) disposeTCPStreams(ctx context.Context) error {
	c.tcpMu.Lock()
	c.tcpDisposed = true
	streams := make([]*TCPConnection, 0, len(c.tcpStreams))
	for connection := range c.tcpStreams {
		streams = append(streams, connection)
	}
	c.tcpMu.Unlock()
	var err error
	for _, connection := range streams {
		if connection.finishForClient(tcpConnectionError("disposed", "client shut down"),
			tcpResetAction(ahptypes.TcpResetReasonConnectionAborted), false, c) {
			err = errors.Join(err, connection.waitCleanup(ctx))
		}
	}
	return err
}

// RestoreReconnectState carries negotiated TCP support and the complete client
// sequence allocator to a fresh transport. Host runtimes call this before their
// reconnect handshake; it does not initialize or subscribe the new transport.
func (c *Client) RestoreReconnectState(previous *Client) error {
	if previous == nil || previous == c {
		return tcpConnectionError("resume", "a previous client on a different transport is required")
	}
	previous.tcpMu.Lock()
	owner, capability := previous.tcpClientID, previous.tcpCapability
	previous.tcpMu.Unlock()
	c.tcpMu.Lock()
	if c.tcpClientID != "" && c.tcpClientID != owner {
		c.tcpMu.Unlock()
		return tcpConnectionError("resume", "previous transport belongs to a different clientId")
	}
	c.tcpClientID, c.tcpCapability = owner, capability
	c.tcpMu.Unlock()
	floor := previous.nextClientSeq.Load()
	for {
		next := c.nextClientSeq.Load()
		if next >= floor || c.nextClientSeq.CompareAndSwap(next, floor) {
			return nil
		}
	}
}

func tcpConnectionError(reason, message string) error {
	return &TCPConnectionError{Reason: reason, Cause: errors.New(message)}
}

func tcpResetAction(reason ahptypes.TcpResetReason) ahptypes.StateAction {
	return ahptypes.StateAction{Value: &ahptypes.TcpClientResetAction{Type: ahptypes.ActionTypeTcpClientReset, Reason: reason}}
}

func validTCPDirection(d ahptypes.FlowControlledByteDirectionState) bool {
	return d.WindowBytes > 0 && d.WindowBytes <= tcpMaxWindowBytes &&
		d.MaximumChunkSize > 0 && d.MaximumChunkSize <= d.WindowBytes &&
		d.ReceivedBytes == 0 && d.ConsumedBytes == 0 && d.EofAtBytes == nil
}

func validateTCPOpen(session string, create ahptypes.TcpConnectionSubscription) error {
	if !strings.HasPrefix(session, "ahp-session:") || len(session) == len("ahp-session:") ||
		create.Type != "tcpConnection" || create.Host == "" || strings.ContainsAny(create.Host, "/\\\x00 \t\r\n") ||
		create.Port < 1 || create.Port > 65535 || create.Encoding != ahptypes.TcpDataEncodingBase64 ||
		create.ReceiveWindowBytes < 1 || create.ReceiveWindowBytes > tcpMaxWindowBytes ||
		create.MaximumChunkSize < 1 || create.MaximumChunkSize > create.ReceiveWindowBytes {
		return tcpConnectionError("invalidOpen", "invalid session, target, encoding, or byte limits")
	}
	return nil
}

func tcpContext(c *Client) (context.Context, context.CancelFunc) {
	if c.cfg.DefaultRequestTimeout > 0 {
		return context.WithTimeout(context.Background(), c.cfg.DefaultRequestTimeout)
	}
	return context.WithCancel(context.Background())
}

// OpenTCPConnection atomically creates a child channel after Initialize has
// advertised base64 TCP support. Cancellation still cleans up a late creation
// response, including after the request timeout; the parent is never unsubscribed.
// For managed hosts use hosts.HostClientHandle.OpenTCPConnection so the runtime
// retains the stream across reconnects.
func (c *Client) OpenTCPConnection(ctx context.Context, session string, create ahptypes.TcpConnectionSubscription) (*TCPConnection, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateTCPOpen(session, create); err != nil {
		return nil, err
	}
	c.tcpMu.Lock()
	owner, capability := c.tcpClientID, c.tcpCapability
	supported := false
	if capability != nil {
		for _, encoding := range capability.Encodings {
			supported = supported || encoding == create.Encoding
		}
	}
	c.tcpMu.Unlock()
	if owner == "" || !supported {
		return nil, tcpConnectionError("unsupported", "Initialize must advertise the requested TCP encoding")
	}
	events := c.events(true, "")
	type opened struct {
		connection *TCPConnection
		err        error
	}
	result := make(chan opened)
	go func() {
		requestCtx, cancel := tcpContext(c)
		defer cancel()
		var response ahptypes.SubscribeResult
		err := c.requestWithLateResult(requestCtx, "subscribe", ahptypes.SubscribeParams{Channel: session, Create: &create}, &response, c.cleanupLateTCPCreation, func(raw json.RawMessage) {
			var identity tcpCreationIdentity
			if json.Unmarshal(raw, &identity) == nil && identity.Snapshot != nil {
				c.bindEventStream(events, identity.Snapshot.Resource)
			}
		})
		var connection *TCPConnection
		if err == nil {
			snapshot := response.Snapshot
			if snapshot == nil || !strings.HasPrefix(snapshot.Resource, "ahp-tcp:") || snapshot.Resource == "ahp-tcp:" ||
				snapshot.FromSeq < 0 || snapshot.FromSeq > tcpMaxSafeInteger || snapshot.State.Tcp == nil {
				err = tcpConnectionError("protocol", "creation did not return a TCP snapshot")
			} else {
				state := snapshot.State.Tcp
				if state.Session != session || state.Target.Host != create.Host || state.Target.Port != create.Port ||
					state.Encoding != create.Encoding || !validTCPDirection(state.Input) || !validTCPDirection(state.Output) ||
					state.Output.WindowBytes > create.ReceiveWindowBytes || state.Output.MaximumChunkSize > create.MaximumChunkSize ||
					state.ClientClosed || state.HostClosed || state.Reset != nil {
					err = tcpConnectionError("protocol", "creation snapshot is not fresh or does not match the request")
				} else {
					connection = &TCPConnection{
						client: c, events: events, resource: snapshot.Resource, owner: owner, state: *state,
						checkpoint: snapshot.FromSeq, epoch: 1, online: true,
						pending: make(map[int64]tcpPending), changed: make(chan struct{}),
					}
				}
			}
		}
		if err == nil && !c.registerTCPStream(connection) {
			err = ErrShutdown
		}
		if err == nil && events.Err() != nil {
			err = events.Err()
		}
		if err != nil {
			events.Close()
			if connection != nil {
				connection.finish(err, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
				err = errors.Join(err, connection.waitCleanup(requestCtx))
				connection = nil
			} else if response.Snapshot != nil && strings.HasPrefix(response.Snapshot.Resource, "ahp-tcp:") && response.Snapshot.Resource != "ahp-tcp:" {
				err = errors.Join(err, c.Unsubscribe(requestCtx, response.Snapshot.Resource))
			}
		}
		select {
		case result <- opened{connection, err}:
			if err == nil {
				connection.start(1, events)
			}
		case <-ctx.Done():
			events.Close()
			if connection != nil && err == nil {
				if err := connection.Dispose(requestCtx); err != nil {
					log.Printf("ahp: cancelled TCP creation cleanup failed: %v", err)
				}
			}
		}
	}()
	select {
	case out := <-result:
		return out.connection, out.err
	case <-ctx.Done():
		events.Close()
		return nil, ctx.Err()
	}
}

func (t *TCPConnection) wakeLocked() {
	close(t.changed)
	t.changed = make(chan struct{})
}

// Cleanup needs the child identity even when the abandoned state cannot decode.
type tcpCreationIdentity struct {
	Snapshot *tcpSnapshotIdentity `json:"snapshot"`
}

type tcpSnapshotIdentity struct {
	Resource string `json:"resource"`
}

func (c *Client) cleanupLateTCPCreation(raw json.RawMessage) {
	var response tcpCreationIdentity
	if err := json.Unmarshal(raw, &response); err != nil {
		log.Printf("ahp: invalid late TCP creation response: %v", err)
		return
	}
	if response.Snapshot == nil || !strings.HasPrefix(response.Snapshot.Resource, "ahp-tcp:") || response.Snapshot.Resource == "ahp-tcp:" {
		log.Printf("ahp: late TCP creation response omitted a valid child resource")
		return
	}
	ctx, cancel := tcpContext(c)
	defer cancel()
	seq := c.nextClientSeq.Add(1) - 1
	var err error
	if seq < 1 || seq > tcpMaxSafeInteger {
		err = tcpConnectionError("protocol", "client sequence exhausted")
	} else {
		err = c.Notify(ctx, "dispatchAction", ahptypes.DispatchActionParams{
			Channel: response.Snapshot.Resource, ClientSeq: seq,
			Action: tcpResetAction(ahptypes.TcpResetReasonConnectionAborted),
		})
	}
	err = errors.Join(err, c.Unsubscribe(ctx, response.Snapshot.Resource))
	if err != nil {
		log.Printf("ahp: late TCP creation cleanup failed: %v", err)
	}
}

func (t *TCPConnection) queueLocked(action ahptypes.StateAction) error {
	seq := t.client.nextClientSeq.Add(1) - 1
	if seq < 1 || seq > tcpMaxSafeInteger {
		return tcpConnectionError("protocol", "client sequence exhausted")
	}
	t.lastSeq = seq
	t.pending[seq] = tcpPending{action: action}
	t.wakeLocked()
	return nil
}

func waitTCP(ctx context.Context, changed <-chan struct{}) error {
	select {
	case <-changed:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Read delivers one decoded chunk. Delivery, not arrival, releases receive credit.
// EOF is returned only after buffered output has been delivered.
func (t *TCPConnection) Read(ctx context.Context) ([]byte, error) {
	for {
		t.mu.Lock()
		if t.err != nil {
			err := t.err
			t.mu.Unlock()
			return nil, err
		}
		if !t.resuming && len(t.received) > 0 {
			data := t.received[0]
			consumed := t.consumed + int64(len(data))
			var err error
			if !t.terminal {
				err = t.queueLocked(ahptypes.StateAction{Value: &ahptypes.TcpDataConsumedAction{Type: ahptypes.ActionTypeTcpDataConsumed, ConsumedBytes: consumed}})
			}
			if err == nil {
				t.received[0] = nil
				t.received = t.received[1:]
				t.consumed = consumed
			}
			t.mu.Unlock()
			if err != nil {
				t.finish(err, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
				return nil, err
			}
			return data, nil
		}
		if t.terminal || (!t.resuming && (t.state.Output.EofAtBytes != nil || t.state.HostClosed)) {
			t.mu.Unlock()
			return nil, io.EOF
		}
		changed := t.changed
		t.mu.Unlock()
		if err := waitTCP(ctx, changed); err != nil {
			return nil, err
		}
	}
}

// Write accepts bytes into the negotiated input window. One concurrent writer
// is permitted; partial progress is returned on cancellation. Accepted bytes are
// retained across disconnect, including actions not yet echoed by the host.
func (t *TCPConnection) Write(ctx context.Context, data []byte) (int, error) {
	t.mu.Lock()
	if t.writing || t.ending || t.terminal {
		t.mu.Unlock()
		return 0, tcpConnectionError("closed", "write requires an open, idle writer")
	}
	t.writing = true
	t.mu.Unlock()
	defer func() {
		t.mu.Lock()
		t.writing = false
		t.wakeLocked()
		t.mu.Unlock()
	}()
	written := 0
	for written < len(data) {
		if err := ctx.Err(); err != nil {
			return written, err
		}
		t.mu.Lock()
		if t.err != nil || t.terminal || t.ending {
			err := t.err
			if err == nil {
				err = tcpConnectionError("closed", "connection closed during write")
			}
			t.mu.Unlock()
			return written, err
		}
		credit := t.state.Input.WindowBytes - (t.sentBytes - t.state.Input.ConsumedBytes)
		if !t.online || t.resuming || credit == 0 {
			changed := t.changed
			t.mu.Unlock()
			if err := waitTCP(ctx, changed); err != nil {
				return written, err
			}
			continue
		}
		length := min(int64(len(data)-written), credit, t.state.Input.MaximumChunkSize)
		if length <= 0 || t.sentBytes > tcpMaxSafeInteger-length {
			t.mu.Unlock()
			err := tcpConnectionError("protocol", "invalid input credit or byte offset exhaustion")
			t.finish(err, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
			return written, err
		}
		action := ahptypes.StateAction{Value: &ahptypes.TcpInputAction{
			Type: ahptypes.ActionTypeTcpInput, Offset: t.sentBytes, Data: base64.StdEncoding.EncodeToString(data[written : written+int(length)]),
		}}
		if err := t.queueLocked(action); err != nil {
			t.mu.Unlock()
			return written, err
		}
		t.sentBytes += length
		written += int(length)
		t.mu.Unlock()
	}
	return written, nil
}

// Drain waits for all accepted input to be consumed at the host.
func (t *TCPConnection) Drain(ctx context.Context) error {
	for {
		t.mu.Lock()
		if t.err != nil || (t.terminal && t.state.Input.ConsumedBytes < t.sentBytes) {
			err := t.err
			if err == nil {
				err = tcpConnectionError("closed", "connection closed before drain")
			}
			t.mu.Unlock()
			return err
		}
		if t.state.Input.ConsumedBytes >= t.sentBytes {
			t.mu.Unlock()
			return nil
		}
		changed := t.changed
		t.mu.Unlock()
		if err := waitTCP(ctx, changed); err != nil {
			return err
		}
	}
}

// End half-closes input, preserving output reads. Finish a concurrent Write first.
func (t *TCPConnection) End(ctx context.Context) error {
	for {
		t.mu.Lock()
		if t.terminal || t.writing {
			t.mu.Unlock()
			return tcpConnectionError("closed", "end requires an open, idle writer")
		}
		if !t.resuming {
			var err error
			if !t.ending {
				err = t.queueLocked(ahptypes.StateAction{Value: &ahptypes.TcpInputEofAction{Type: ahptypes.ActionTypeTcpInputEof, FinalOffset: t.sentBytes}})
				if err == nil {
					t.ending = true
				}
			}
			t.mu.Unlock()
			return err
		}
		changed := t.changed
		t.mu.Unlock()
		if err := waitTCP(ctx, changed); err != nil {
			return err
		}
	}
}

// Close stops writes and awaits both close acknowledgements and consumed bytes.
// Continue reading concurrently to drain output. Dispose aborts without draining.
func (t *TCPConnection) Close(ctx context.Context) error {
	t.mu.Lock()
	if t.terminal {
		t.mu.Unlock()
		return t.waitCleanup(ctx)
	}
	if t.writing {
		t.mu.Unlock()
		return tcpConnectionError("busy", "close requires an idle writer")
	}
	t.ending, t.closing = true, true
	t.wakeLocked()
	t.mu.Unlock()
	t.advanceClose()
	for {
		t.mu.Lock()
		err, terminal, changed := t.err, t.terminal, t.changed
		t.mu.Unlock()
		if err != nil {
			return err
		}
		if terminal {
			return t.waitCleanup(ctx)
		}
		if err := waitTCP(ctx, changed); err != nil {
			return err
		}
	}
}

func (t *TCPConnection) advanceClose() {
	t.mu.Lock()
	if t.terminal || t.resuming || !t.closing {
		t.mu.Unlock()
		return
	}
	var err error
	if !t.closeQueued && (t.state.HostClosed || t.state.Input.ConsumedBytes == t.sentBytes) {
		err = t.queueLocked(ahptypes.StateAction{Value: &ahptypes.TcpClientCloseAction{Type: ahptypes.ActionTypeTcpClientClose}})
		t.closeQueued = err == nil
	}
	complete := t.state.ClientClosed && t.state.HostClosed &&
		t.state.Input.ConsumedBytes == t.sentBytes &&
		t.consumed == t.state.Output.ReceivedBytes &&
		t.state.Output.ConsumedBytes == t.consumed && len(t.pending) == 0
	t.mu.Unlock()
	if err != nil {
		t.finish(err, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
	} else if complete {
		t.finish(nil, ahptypes.StateAction{}, true)
	}
}

// Dispose aborts the stream and discards buffered output. Cleanup is exactly once.
func (t *TCPConnection) Dispose(ctx context.Context) error {
	t.finish(tcpConnectionError("disposed", "connection disposed"), tcpResetAction(ahptypes.TcpResetReasonConnectionAborted), false)
	return t.waitCleanup(ctx)
}

func (t *TCPConnection) waitCleanup(ctx context.Context) error {
	t.mu.Lock()
	done := t.cleanup
	t.mu.Unlock()
	select {
	case <-done:
		t.mu.Lock()
		err := t.cleanupErr
		t.mu.Unlock()
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (t *TCPConnection) finish(reason error, action ahptypes.StateAction, preserve bool) {
	t.finishForClient(reason, action, preserve, nil)
}

func (t *TCPConnection) finishForClient(reason error, action ahptypes.StateAction, preserve bool, owner *Client) bool {
	t.mu.Lock()
	if owner != nil && t.client != owner {
		t.mu.Unlock()
		return false
	}
	if t.terminal {
		t.mu.Unlock()
		return true
	}
	t.terminal, t.online, t.resuming, t.err = true, false, false, reason
	t.pending = nil
	if !preserve {
		t.received = nil
	}
	t.cleanup = make(chan struct{})
	client, events := t.client, t.events
	t.wakeLocked()
	t.mu.Unlock()
	events.Close()
	go func() {
		t.sendMu.Lock()
		defer t.sendMu.Unlock()
		ctx, cancel := tcpContext(client)
		defer cancel()
		var err error
		closed := false
		select {
		case <-client.Done():
			closed = true
		default:
		}
		if !closed && action.Value != nil {
			seq := client.nextClientSeq.Add(1) - 1
			if seq < 1 || seq > tcpMaxSafeInteger {
				err = tcpConnectionError("protocol", "client sequence exhausted")
			} else {
				err = client.Notify(ctx, "dispatchAction", ahptypes.DispatchActionParams{Channel: t.resource, ClientSeq: seq, Action: action})
			}
		}
		if !closed {
			err = errors.Join(err, client.Unsubscribe(ctx, t.resource))
		}
		t.mu.Lock()
		t.cleanupErr = err
		if t.err != nil && err != nil {
			t.err = errors.Join(t.err, err)
		}
		close(t.cleanup)
		t.mu.Unlock()
		client.tcpMu.Lock()
		delete(client.tcpStreams, t)
		client.tcpMu.Unlock()
	}()
	return true
}

func (t *TCPConnection) suspend(epoch uint64) {
	t.mu.Lock()
	if t.epoch != epoch || t.terminal {
		t.mu.Unlock()
		return
	}
	t.online, t.resuming = false, false
	events := t.events
	t.wakeLocked()
	t.mu.Unlock()
	events.Close()
}

func tcpEchoMatches(expected, actual ahptypes.StateAction) bool {
	switch action := actual.Value.(type) {
	case *ahptypes.TcpInputAction:
		pending, ok := expected.Value.(*ahptypes.TcpInputAction)
		return ok && *pending == *action
	case *ahptypes.TcpDataConsumedAction:
		pending, ok := expected.Value.(*ahptypes.TcpDataConsumedAction)
		return ok && *pending == *action
	case *ahptypes.TcpInputEofAction:
		pending, ok := expected.Value.(*ahptypes.TcpInputEofAction)
		return ok && *pending == *action
	case *ahptypes.TcpClientCloseAction:
		pending, ok := expected.Value.(*ahptypes.TcpClientCloseAction)
		return ok && *pending == *action
	case *ahptypes.TcpClientResetAction:
		pending, ok := expected.Value.(*ahptypes.TcpClientResetAction)
		return ok && *pending == *action
	default:
		return false
	}
}

func (t *TCPConnection) accept(envelope ahptypes.ActionEnvelope, epoch uint64) {
	t.mu.Lock()
	if t.epoch != epoch || t.terminal || envelope.Channel != t.resource {
		t.mu.Unlock()
		return
	}
	var err error
	clientEcho := false
	switch envelope.Action.Value.(type) {
	case *ahptypes.TcpInputAction, *ahptypes.TcpDataConsumedAction, *ahptypes.TcpInputEofAction,
		*ahptypes.TcpClientCloseAction, *ahptypes.TcpClientResetAction:
		clientEcho = true
	}
	var pending tcpPending
	var pendingExists bool
	if clientEcho {
		origin := envelope.Origin
		if origin == nil || origin.ClientId != t.owner || origin.ClientSeq < 1 ||
			origin.ClientSeq > tcpMaxSafeInteger || origin.ClientSeq > t.lastSeq {
			err = tcpConnectionError("protocol", "invalid client TCP echo origin")
		} else {
			pending, pendingExists = t.pending[origin.ClientSeq]
			if pendingExists && !tcpEchoMatches(pending.action, envelope.Action) {
				err = tcpConnectionError("protocol", "TCP echo does not match pending action")
			}
		}
	}
	if err == nil && envelope.ServerSeq <= t.checkpoint {
		t.mu.Unlock()
		return
	}
	before := t.state.Output.ReceivedBytes
	next := t.state
	if envelope.RejectionReason != nil {
		err = tcpConnectionError("rejected", *envelope.RejectionReason)
	} else if envelope.ServerSeq > tcpMaxSafeInteger {
		err = tcpConnectionError("protocol", "invalid server sequence")
	} else if err == nil {
		var outcome ReduceOutcome
		outcome, err = ApplyActionToTCP(&next, envelope.Action)
		if err == nil && clientEcho && !pendingExists && outcome == ReduceOutcomeApplied {
			err = tcpConnectionError("protocol", "unacknowledged TCP state advanced without a matching pending action")
		}
	}
	if err == nil && (next.Input.ReceivedBytes > t.sentBytes || next.Output.ConsumedBytes > t.consumed ||
		next.Output.ReceivedBytes-t.consumed > next.Output.WindowBytes) {
		err = tcpConnectionError("protocol", "host exceeded owned byte counters")
	}
	if err == nil && next.Output.ReceivedBytes > before {
		if action, ok := envelope.Action.Value.(*ahptypes.TcpDataAction); ok {
			var bytes []byte
			bytes, err = base64.StdEncoding.Strict().DecodeString(action.Data)
			if err == nil {
				t.received = append(t.received, bytes)
			}
		}
	}
	if err == nil {
		t.state = next
		t.checkpoint = envelope.ServerSeq
		if clientEcho {
			delete(t.pending, envelope.Origin.ClientSeq)
		}
	}
	reset := t.state.Reset
	if t.state.HostClosed {
		t.ending, t.closing = true, true
	}
	t.wakeLocked()
	t.mu.Unlock()
	if err != nil {
		t.finish(err, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
	} else if reset != nil {
		t.finish(tcpConnectionError("reset", string(reset.Reason)), ahptypes.StateAction{}, false)
	} else {
		t.advanceClose()
	}
}

func (t *TCPConnection) start(epoch uint64, events *EventStream) {
	go func() {
		for event := range events.Events() {
			t.mu.Lock()
			current := t.epoch == epoch && !t.terminal
			t.mu.Unlock()
			if !current {
				return
			}
			if action, ok := event.Event.(SubscriptionEventAction); ok {
				t.accept(action.Envelope, epoch)
			}
		}
		t.mu.Lock()
		current := t.epoch == epoch && !t.terminal
		t.mu.Unlock()
		if !current {
			return
		}
		var lag *SubscriptionLagError
		var protocol *TransportError
		err := events.Err()
		if errors.As(err, &lag) || (errors.As(err, &protocol) && protocol.Kind == "protocol") {
			t.finish(err, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
		} else {
			t.suspend(epoch)
		}
	}()
	go t.sendPending(epoch)
}

func (t *TCPConnection) sendPending(epoch uint64) {
	for {
		t.mu.Lock()
		if t.epoch != epoch || t.terminal || !t.online || t.resuming {
			t.mu.Unlock()
			return
		}
		var seq int64
		for candidate, pending := range t.pending {
			if pending.sent != epoch && (seq == 0 || candidate < seq) {
				seq = candidate
			}
		}
		pending, client, changed := t.pending[seq], t.client, t.changed
		t.mu.Unlock()
		if seq == 0 {
			select {
			case <-changed:
				continue
			case <-client.Done():
				t.suspend(epoch)
				return
			}
		}
		t.sendMu.Lock()
		t.mu.Lock()
		current := t.epoch == epoch && !t.terminal && t.online
		t.mu.Unlock()
		var err error
		if current {
			ctx, cancel := tcpContext(client)
			err = client.Notify(ctx, "dispatchAction", ahptypes.DispatchActionParams{Channel: t.resource, ClientSeq: seq, Action: pending.action})
			cancel()
		}
		t.sendMu.Unlock()
		if !current {
			return
		}
		if err != nil {
			t.suspend(epoch)
			return
		}
		t.mu.Lock()
		if existing, ok := t.pending[seq]; ok && t.epoch == epoch {
			existing.sent = epoch
			t.pending[seq] = existing
		}
		t.mu.Unlock()
	}
}

// ReconnectTCPConnections resumes existing handles on a caller-provided fresh
// transport. It never creates replacements. Replay is applied before queued live
// events and remaining pending actions are resent with their original sequences.
func (c *Client) ReconnectTCPConnections(ctx context.Context, params ahptypes.ReconnectParams, connections []*TCPConnection) (*ahptypes.ReconnectResult, error) {
	seen := make(map[*TCPConnection]bool)
	params.Subscriptions = append([]string(nil), params.Subscriptions...)
	c.tcpMu.Lock()
	wrongIdentity := c.tcpClientID != "" && c.tcpClientID != params.ClientId
	c.tcpMu.Unlock()
	if wrongIdentity {
		return nil, tcpConnectionError("resume", "new transport was initialized for a different clientId")
	}
	locked := make([]*TCPConnection, 0, len(connections))
	defer func() {
		for _, connection := range locked {
			connection.resumeMu.Unlock()
		}
	}()
	for _, connection := range connections {
		if connection == nil || seen[connection] || !connection.resumeMu.TryLock() {
			return nil, tcpConnectionError("resume", "duplicate, nil, or concurrently resuming handle")
		}
		seen[connection] = true
		locked = append(locked, connection)
	}
	for _, connection := range connections {
		connection.mu.Lock()
	}
	unlock := func() {
		for _, connection := range connections {
			connection.mu.Unlock()
		}
	}
	if params.ClientId == "" || params.LastSeenServerSeq < 0 || params.LastSeenServerSeq > tcpMaxSafeInteger {
		unlock()
		return nil, tcpConnectionError("resume", "invalid identity or checkpoint")
	}
	consumerCheckpoint := params.LastSeenServerSeq
	highest := c.nextClientSeq.Load() - 1
	var capability *ahptypes.TcpConnectionsCapability
	for _, connection := range connections {
		select {
		case <-connection.client.Done():
			connection.online = false
		default:
		}
		if connection.owner != params.ClientId || connection.terminal || connection.online || connection.client == c {
			unlock()
			return nil, tcpConnectionError("resume", "handles must be suspended, live, and owned by the same clientId")
		}
		highest = max(highest, connection.lastSeq, connection.client.nextClientSeq.Load()-1)
		connection.client.tcpMu.Lock()
		capability = connection.client.tcpCapability
		connection.client.tcpMu.Unlock()
		params.LastSeenServerSeq = min(params.LastSeenServerSeq, connection.checkpoint)
		found := false
		for _, resource := range params.Subscriptions {
			found = found || resource == connection.resource
		}
		if !found {
			params.Subscriptions = append(params.Subscriptions, connection.resource)
		}
	}
	for {
		next := c.nextClientSeq.Load()
		if next > highest || c.nextClientSeq.CompareAndSwap(next, highest+1) {
			break
		}
	}
	if len(connections) != 0 {
		c.tcpMu.Lock()
		c.tcpClientID, c.tcpCapability = params.ClientId, capability
		c.tcpMu.Unlock()
	}
	epochs := make(map[*TCPConnection]uint64, len(connections))
	for _, connection := range connections {
		connection.events.Close()
		connection.client.tcpMu.Lock()
		delete(connection.client.tcpStreams, connection)
		connection.client.tcpMu.Unlock()
		connection.client, connection.events = c, c.events(true, connection.resource)
		connection.epoch++
		epochs[connection] = connection.epoch
		connection.resuming, connection.online = true, false
		connection.wakeLocked()
	}
	registrationFailed := false
	for _, connection := range connections {
		registrationFailed = !c.registerTCPStream(connection) || registrationFailed
	}
	unlock()
	if registrationFailed {
		for _, connection := range connections {
			connection.finishForClient(tcpConnectionError("disposed", "client shut down"), ahptypes.StateAction{}, false, c)
		}
		return nil, ErrShutdown
	}
	params.Channel = ahptypes.RootResourceURI
	var result ahptypes.ReconnectResult
	var raw json.RawMessage
	err := c.Request(ctx, "reconnect", params, &raw)
	if err != nil {
		for _, connection := range connections {
			var lag *SubscriptionLagError
			var protocol *TransportError
			failure := connection.events.Err()
			if errors.As(failure, &lag) || (errors.As(failure, &protocol) && protocol.Kind == "protocol") {
				connection.finish(failure, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
			} else {
				connection.suspend(epochs[connection])
			}
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		protocol := &TransportError{Kind: "protocol", Err: err}
		for _, connection := range connections {
			connection.finish(protocol, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
		}
		return nil, protocol
	}
	replay, ok := result.Value.(*ahptypes.ReconnectReplayResult)
	if !ok {
		for _, connection := range connections {
			connection.finish(tcpConnectionError("replayUnavailable", "TCP cannot recover from a snapshot"), ahptypes.StateAction{}, false)
		}
		return &result, nil
	}
	actions := replay.Actions[:0]
	for _, action := range replay.Actions {
		if strings.HasPrefix(action.Channel, "ahp-tcp:") || action.ServerSeq > consumerCheckpoint {
			actions = append(actions, action)
		}
	}
	clear(replay.Actions[len(actions):])
	replay.Actions = actions
	for _, connection := range connections {
		for _, missing := range replay.Missing {
			if missing == connection.resource {
				connection.finish(tcpConnectionError("replayUnavailable", "TCP channel is missing"), ahptypes.StateAction{}, false)
			}
		}
		for _, action := range replay.Actions {
			connection.mu.Lock()
			epoch := connection.epoch
			connection.mu.Unlock()
			connection.accept(action, epoch)
		}
	}
	type resend struct {
		connection *TCPConnection
		seq        int64
		action     ahptypes.StateAction
	}
	var pending []resend
	for _, connection := range connections {
	drain:
		for {
			select {
			case event, open := <-connection.events.Events():
				if !open {
					if failure := connection.events.Err(); failure != nil {
						var lag *SubscriptionLagError
						var protocol *TransportError
						if errors.As(failure, &lag) || (errors.As(failure, &protocol) && protocol.Kind == "protocol") {
							connection.finish(failure, tcpResetAction(ahptypes.TcpResetReasonProtocolError), false)
						} else {
							connection.suspend(epochs[connection])
						}
					} else {
						connection.suspend(epochs[connection])
					}
					break drain
				}
				if action, ok := event.Event.(SubscriptionEventAction); ok {
					connection.mu.Lock()
					epoch := connection.epoch
					connection.mu.Unlock()
					connection.accept(action.Envelope, epoch)
				}
			default:
				break drain
			}
		}
		connection.mu.Lock()
		if !connection.terminal && connection.resuming {
			for seq, action := range connection.pending {
				pending = append(pending, resend{connection, seq, action.action})
			}
		}
		connection.mu.Unlock()
	}
	sort.Slice(pending, func(i, j int) bool { return pending[i].seq < pending[j].seq })
	for _, item := range pending {
		item.connection.sendMu.Lock()
		item.connection.mu.Lock()
		terminal := item.connection.terminal
		item.connection.mu.Unlock()
		if terminal {
			item.connection.sendMu.Unlock()
			continue
		}
		err := c.Notify(ctx, "dispatchAction", ahptypes.DispatchActionParams{Channel: item.connection.resource, ClientSeq: item.seq, Action: item.action})
		item.connection.sendMu.Unlock()
		if err != nil {
			for _, connection := range connections {
				connection.suspend(epochs[connection])
			}
			return nil, err
		}
		item.connection.mu.Lock()
		if action, exists := item.connection.pending[item.seq]; exists {
			action.sent = item.connection.epoch
			item.connection.pending[item.seq] = action
		}
		item.connection.mu.Unlock()
	}
	for _, connection := range connections {
		connection.mu.Lock()
		if !connection.terminal && connection.resuming {
			connection.online, connection.resuming = true, false
			connection.wakeLocked()
			connection.start(connection.epoch, connection.events)
		}
		connection.mu.Unlock()
		connection.advanceClose()
	}
	return &result, nil
}
