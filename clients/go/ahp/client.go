package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// ─── Configuration ──────────────────────────────────────────────────────

// Config tunes a [Client].
type Config struct {
	// DefaultRequestTimeout bounds how long a [Client.Request] waits
	// for a response. Zero disables the timeout.
	DefaultRequestTimeout time.Duration

	// SubscriptionBuffer is the size of each subscription's event
	// channel. Slow consumers that fail to drain within this many
	// messages will drop frames and must resubscribe.
	SubscriptionBuffer int
}

// DefaultConfig returns a [Config] with sensible defaults: 30s request
// timeout, 256-message subscription buffer.
func DefaultConfig() Config {
	return Config{
		DefaultRequestTimeout: 30 * time.Second,
		SubscriptionBuffer:    256,
	}
}

// ─── Subscription events ─────────────────────────────────────────────────

// SubscriptionEvent is the marker interface implemented by every
// subscription event variant.
type SubscriptionEvent interface{ isSubscriptionEvent() }

// SubscriptionEventAction is a write-ahead action envelope for the
// subscription's channel.
type SubscriptionEventAction struct {
	Envelope ahptypes.ActionEnvelope
}

func (SubscriptionEventAction) isSubscriptionEvent() {}

// SubscriptionEventSessionAdded mirrors the `root/sessionAdded`
// notification.
type SubscriptionEventSessionAdded struct {
	Params ahptypes.SessionAddedParams
}

func (SubscriptionEventSessionAdded) isSubscriptionEvent() {}

// SubscriptionEventSessionRemoved mirrors the `root/sessionRemoved`
// notification.
type SubscriptionEventSessionRemoved struct {
	Params ahptypes.SessionRemovedParams
}

func (SubscriptionEventSessionRemoved) isSubscriptionEvent() {}

// SubscriptionEventSessionSummaryChanged mirrors the
// `root/sessionSummaryChanged` notification.
type SubscriptionEventSessionSummaryChanged struct {
	Params ahptypes.SessionSummaryChangedParams
}

func (SubscriptionEventSessionSummaryChanged) isSubscriptionEvent() {}

// SubscriptionEventAuthRequired mirrors the `auth/required`
// notification.
type SubscriptionEventAuthRequired struct {
	Params ahptypes.AuthRequiredParams
}

func (SubscriptionEventAuthRequired) isSubscriptionEvent() {}

// ClientEvent is a [SubscriptionEvent] tagged with the channel URI it
// was scoped to. Returned by [Client.Events].
type ClientEvent struct {
	Channel ahptypes.URI
	Event   SubscriptionEvent
}

// ─── Subscription handle ────────────────────────────────────────────────

// Subscription is the per-URI fan-out handle returned by
// [Client.Subscribe] and [Client.AttachSubscription]. Drop the handle
// by letting [Client.Shutdown] tear it down, or call its own
// [Subscription.Close] to stop receiving events.
type Subscription struct {
	uri     string
	events  chan SubscriptionEvent
	closeMu sync.Mutex
	closed  bool
}

// URI returns the channel URI this subscription is bound to.
func (s *Subscription) URI() string { return s.uri }

// Events returns a receive-only channel of events. The channel closes
// when the [Client] shuts down or the caller invokes
// [Subscription.Close].
func (s *Subscription) Events() <-chan SubscriptionEvent { return s.events }

// Close stops the subscription locally without notifying the server.
// Safe to call multiple times.
func (s *Subscription) Close() {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	close(s.events)
}

func (s *Subscription) trySend(ev SubscriptionEvent) {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if s.closed {
		return
	}
	select {
	case s.events <- ev:
	default:
	}
}

// ─── DispatchHandle ─────────────────────────────────────────────────────

// DispatchHandle is the receipt returned by [Client.Dispatch],
// recording the client-assigned sequence number for the dispatched
// action.
type DispatchHandle struct {
	ClientSeq int64
}

// ─── Client ─────────────────────────────────────────────────────────────

// pendingResult routes a single in-flight request's outcome to its
// waiter.
type pendingResult struct {
	value json.RawMessage
	err   *ahptypes.JsonRpcError
}

// outboundMsg is the writer goroutine's input queue payload.
type outboundMsg struct {
	msg ahptypes.JsonRpcMessage
	// done, if non-nil, receives the result of the send attempt.
	done chan error
}

// EventStream is a top-level fan-in receiver over every inbound event
// from a [Client]. Returned by [Client.Events].
type EventStream struct {
	events  chan ClientEvent
	closeMu sync.Mutex
	closed  bool
}

// Events returns a receive-only channel of every [ClientEvent].
func (s *EventStream) Events() <-chan ClientEvent { return s.events }

// Close stops the stream. Safe to call multiple times.
func (s *EventStream) Close() {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	close(s.events)
}

func (s *EventStream) trySend(ev ClientEvent) {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if s.closed {
		return
	}
	select {
	case s.events <- ev:
	default:
	}
}

// Client is an async JSON-RPC client driving a pluggable [Transport].
//
// A Client is created with [Connect] which spawns a background
// goroutine that pumps inbound frames and dispatches outbound
// requests. Methods are safe to call from multiple goroutines.
type Client struct {
	cfg       Config
	transport Transport

	// outbound carries messages to be sent to the writer goroutine.
	outbound chan outboundMsg

	// pending is the request-correlation map keyed by JSON-RPC id.
	pendingMu sync.Mutex
	pending   map[uint64]chan pendingResult

	// subscriptionsMu guards subscriptions and the all-events
	// fan-out registry.
	subscriptionsMu sync.Mutex
	subscriptions   map[string][]*Subscription
	eventListeners  []*EventStream

	nextID        atomic.Uint64
	nextClientSeq atomic.Int64

	// done closes once the client has begun teardown. Subsequent
	// sends fail with [ErrShutdown].
	done chan struct{}
	// closeOnce guards the centralized close path so concurrent
	// shutdowns / transport faults are idempotent.
	closeOnce sync.Once
	closeErr  atomic.Value // holds error
	wg        sync.WaitGroup
}

// ─── Connect / Shutdown ─────────────────────────────────────────────────

// Connect wires a [Transport] up to a new [Client] and starts the
// background reader/writer goroutines.
//
// The Client owns the transport from this point: callers should not
// invoke [Transport.Send] / [Transport.Recv] directly.
func Connect(_ context.Context, transport Transport, cfg Config) (*Client, error) {
	if cfg.SubscriptionBuffer <= 0 {
		cfg.SubscriptionBuffer = 256
	}
	c := &Client{
		cfg:           cfg,
		transport:     transport,
		outbound:      make(chan outboundMsg, 64),
		pending:       make(map[uint64]chan pendingResult),
		subscriptions: make(map[string][]*Subscription),
		done:          make(chan struct{}),
	}
	c.nextID.Store(1)
	c.nextClientSeq.Store(1)
	c.wg.Add(2)
	go c.runReader()
	go c.runWriter()
	return c, nil
}

// Done returns a channel that closes when the client has begun
// teardown (either via [Client.Shutdown] or a transport failure
// observed by the background reader/writer).
func (c *Client) Done() <-chan struct{} { return c.done }

// Err returns the first error that triggered teardown, or nil if
// the client is still running or was shut down cleanly.
func (c *Client) Err() error {
	if v := c.closeErr.Load(); v != nil {
		if e, ok := v.(error); ok {
			return e
		}
	}
	return nil
}

// Shutdown gracefully tears down the client. In-flight requests
// resolve with [ErrShutdown]. Subscriptions and event streams are
// closed. The underlying transport is closed too.
//
// Safe to call multiple times.
func (c *Client) Shutdown(ctx context.Context) error {
	c.shutdownWithError(nil)
	doneCh := make(chan struct{})
	go func() { c.wg.Wait(); close(doneCh) }()
	select {
	case <-doneCh:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// shutdownWithError runs the centralized close path exactly once.
// Reader, writer, and Shutdown all funnel through it so concurrent
// callers can't race on closing channels.
func (c *Client) shutdownWithError(err error) {
	c.closeOnce.Do(func() {
		if err != nil {
			c.closeErr.Store(err)
		}
		close(c.done)

		// Close the transport so any blocked Recv unblocks.
		closeCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = c.transport.Close(closeCtx)
		cancel()

		// Fail every in-flight request.
		failErr := &ahptypes.JsonRpcError{Code: -32000, Message: "client shut down"}
		if err != nil {
			failErr.Message = fmt.Sprintf("client shut down: %v", err)
		}
		c.pendingMu.Lock()
		for id, ch := range c.pending {
			select {
			case ch <- pendingResult{err: failErr}:
			default:
			}
			close(ch)
			delete(c.pending, id)
		}
		c.pendingMu.Unlock()

		// Close every subscription and listener so consumers see EOF.
		c.subscriptionsMu.Lock()
		subs := c.subscriptions
		listeners := c.eventListeners
		c.subscriptions = map[string][]*Subscription{}
		c.eventListeners = nil
		c.subscriptionsMu.Unlock()
		for _, list := range subs {
			for _, s := range list {
				s.Close()
			}
		}
		for _, l := range listeners {
			l.Close()
		}
	})
}

// runWriter drains outbound messages and ships them via the transport.
// Exits when c.done is closed.
func (c *Client) runWriter() {
	defer c.wg.Done()
	for {
		select {
		case <-c.done:
			return
		case msg, ok := <-c.outbound:
			if !ok {
				return
			}
			wire, err := EncodeMessage(msg.msg)
			if err != nil {
				if msg.done != nil {
					msg.done <- err
				}
				continue
			}
			ctx, cancel := contextWithDone(context.Background(), c.done)
			sendErr := c.transport.Send(ctx, wire)
			cancel()
			if msg.done != nil {
				msg.done <- sendErr
			}
			if sendErr != nil {
				// Transport faulted — trigger global shutdown so all
				// consumers see EOF in bounded time.
				c.shutdownWithError(fmt.Errorf("ahp: transport send: %w", sendErr))
				return
			}
		}
	}
}

// runReader pumps inbound messages from the transport and dispatches
// them to the pending map / subscriptions. Exits when the transport
// reports closed.
func (c *Client) runReader() {
	defer c.wg.Done()
	for {
		select {
		case <-c.done:
			return
		default:
		}
		ctx, cancel := contextWithDone(context.Background(), c.done)
		msg, err := c.transport.Recv(ctx)
		cancel()
		if err != nil {
			c.shutdownWithError(fmt.Errorf("ahp: transport recv: %w", err))
			return
		}
		parsed, perr := msg.IntoParsed()
		if perr != nil {
			// Skip malformed frames; protocol resync is the server's
			// responsibility.
			continue
		}
		c.dispatch(parsed)
	}
}

// contextWithDone returns a context that's cancelled when either the
// parent ctx is cancelled or done is closed — without spawning a
// long-lived goroutine that outlives the call.
func contextWithDone(parent context.Context, done <-chan struct{}) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(parent)
	stop := make(chan struct{})
	go func() {
		select {
		case <-done:
			cancel()
		case <-stop:
		}
	}()
	wrappedCancel := func() {
		close(stop)
		cancel()
	}
	return ctx, wrappedCancel
}

// dispatch routes a parsed message to the matching consumer.
func (c *Client) dispatch(msg ahptypes.JsonRpcMessage) {
	switch {
	case msg.SuccessResponse != nil:
		c.deliver(msg.SuccessResponse.ID, pendingResult{value: msg.SuccessResponse.Result})
	case msg.ErrorResponse != nil:
		c.deliver(msg.ErrorResponse.ID, pendingResult{err: &msg.ErrorResponse.Error})
	case msg.Notification != nil:
		c.handleNotification(*msg.Notification)
	case msg.Request != nil:
		// Server-initiated requests aren't supported in v0.1.0; drop.
	}
}

func (c *Client) deliver(id uint64, r pendingResult) {
	c.pendingMu.Lock()
	ch, ok := c.pending[id]
	if ok {
		delete(c.pending, id)
	}
	c.pendingMu.Unlock()
	if !ok {
		return
	}
	ch <- r
	close(ch)
}

func (c *Client) handleNotification(n ahptypes.JsonRpcNotification) {
	switch n.Method {
	case "action":
		var env ahptypes.ActionEnvelope
		if err := json.Unmarshal(n.Params, &env); err != nil {
			return
		}
		c.fanOut(env.Channel, SubscriptionEventAction{Envelope: env})
	case "root/sessionAdded":
		var p ahptypes.SessionAddedParams
		if err := json.Unmarshal(n.Params, &p); err != nil {
			return
		}
		c.fanOut(p.Channel, SubscriptionEventSessionAdded{Params: p})
	case "root/sessionRemoved":
		var p ahptypes.SessionRemovedParams
		if err := json.Unmarshal(n.Params, &p); err != nil {
			return
		}
		c.fanOut(p.Channel, SubscriptionEventSessionRemoved{Params: p})
	case "root/sessionSummaryChanged":
		var p ahptypes.SessionSummaryChangedParams
		if err := json.Unmarshal(n.Params, &p); err != nil {
			return
		}
		c.fanOut(p.Channel, SubscriptionEventSessionSummaryChanged{Params: p})
	case "auth/required":
		var p ahptypes.AuthRequiredParams
		if err := json.Unmarshal(n.Params, &p); err != nil {
			return
		}
		c.fanOut(p.Channel, SubscriptionEventAuthRequired{Params: p})
	}
}

func (c *Client) fanOut(channel string, ev SubscriptionEvent) {
	c.subscriptionsMu.Lock()
	subs := append([]*Subscription(nil), c.subscriptions[channel]...)
	listeners := append([]*EventStream(nil), c.eventListeners...)
	c.subscriptionsMu.Unlock()
	for _, s := range subs {
		s.trySend(ev)
	}
	for _, l := range listeners {
		l.trySend(ClientEvent{Channel: channel, Event: ev})
	}
}

// ─── Request / Notify ───────────────────────────────────────────────────

// Request sends a JSON-RPC request and decodes the response into out.
// If out is nil, the result is discarded.
func (c *Client) Request(ctx context.Context, method string, params any, out any) error {
	select {
	case <-c.done:
		return ErrShutdown
	default:
	}
	rawParams, err := encodeParams(params)
	if err != nil {
		return err
	}
	id := c.nextID.Add(1) - 1
	resultCh := make(chan pendingResult, 1)

	c.pendingMu.Lock()
	c.pending[id] = resultCh
	c.pendingMu.Unlock()

	req := ahptypes.JsonRpcMessage{Request: &ahptypes.JsonRpcRequest{
		JsonRpc: ahptypes.JsonRpcV2,
		ID:      id,
		Method:  method,
		Params:  rawParams,
	}}
	if err := c.send(ctx, req); err != nil {
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
		return err
	}

	// Apply the configured default timeout if no deadline is set.
	if c.cfg.DefaultRequestTimeout > 0 {
		if _, ok := ctx.Deadline(); !ok {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, c.cfg.DefaultRequestTimeout)
			defer cancel()
		}
	}

	select {
	case r := <-resultCh:
		if r.err != nil {
			return &RPCError{Code: r.err.Code, Message: r.err.Message, Data: r.err.Data}
		}
		if out != nil && len(r.value) > 0 && string(r.value) != "null" {
			if err := json.Unmarshal(r.value, out); err != nil {
				return fmt.Errorf("ahp: decode response for %q: %w", method, err)
			}
		}
		return nil
	case <-ctx.Done():
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
		return ctx.Err()
	case <-c.done:
		return ErrShutdown
	}
}

// Notify sends a JSON-RPC notification (fire-and-forget).
func (c *Client) Notify(ctx context.Context, method string, params any) error {
	select {
	case <-c.done:
		return ErrShutdown
	default:
	}
	rawParams, err := encodeParams(params)
	if err != nil {
		return err
	}
	msg := ahptypes.JsonRpcMessage{Notification: &ahptypes.JsonRpcNotification{
		JsonRpc: ahptypes.JsonRpcV2,
		Method:  method,
		Params:  rawParams,
	}}
	return c.send(ctx, msg)
}

func (c *Client) send(ctx context.Context, msg ahptypes.JsonRpcMessage) error {
	done := make(chan error, 1)
	select {
	case c.outbound <- outboundMsg{msg: msg, done: done}:
	case <-ctx.Done():
		return ctx.Err()
	case <-c.done:
		return ErrShutdown
	}
	select {
	case err := <-done:
		if err != nil && (errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)) {
			return err
		}
		return err
	case <-ctx.Done():
		return ctx.Err()
	case <-c.done:
		return ErrShutdown
	}
}

func encodeParams(params any) (json.RawMessage, error) {
	if params == nil {
		return nil, nil
	}
	b, err := json.Marshal(params)
	if err != nil {
		return nil, fmt.Errorf("ahp: encode params: %w", err)
	}
	if string(b) == "null" {
		return nil, nil
	}
	return b, nil
}

// ─── Protocol surface ───────────────────────────────────────────────────

// Initialize issues the `initialize` handshake.
//
// protocolVersions is the list of protocol versions the client is
// willing to speak, ordered most-preferred-first. Pass
// [ahptypes.SupportedProtocolVersions]() to advertise every version
// this generated source knows about. initialSubscriptions may be nil
// or empty.
func (c *Client) Initialize(ctx context.Context, clientID string, protocolVersions []string, initialSubscriptions []string) (*ahptypes.InitializeResult, error) {
	params := ahptypes.InitializeParams{
		Channel:          ahptypes.RootResourceURI,
		ProtocolVersions: protocolVersions,
		ClientId:         clientID,
	}
	if len(initialSubscriptions) > 0 {
		params.InitialSubscriptions = initialSubscriptions
	}
	var out ahptypes.InitializeResult
	if err := c.Request(ctx, "initialize", params, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Reconnect re-establishes a dropped connection with the server's
// `reconnect` flow.
func (c *Client) Reconnect(ctx context.Context, clientID string, lastSeenServerSeq int64, subscriptions []string) (*ahptypes.ReconnectResult, error) {
	params := ahptypes.ReconnectParams{
		Channel:           ahptypes.RootResourceURI,
		ClientId:          clientID,
		LastSeenServerSeq: lastSeenServerSeq,
		Subscriptions:     subscriptions,
	}
	var out ahptypes.ReconnectResult
	if err := c.Request(ctx, "reconnect", params, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Subscribe sends a `subscribe` request and returns the initial snapshot
// together with a per-URI [Subscription] handle.
func (c *Client) Subscribe(ctx context.Context, uri string) (*ahptypes.SubscribeResult, *Subscription, error) {
	return c.SubscribeWithDelivery(ctx, uri, nil)
}

// SubscribeWithDelivery sends a `subscribe` request with advisory delivery
// preferences and returns the initial snapshot together with a per-URI
// [Subscription] handle.
func (c *Client) SubscribeWithDelivery(ctx context.Context, uri string, delivery *ahptypes.SubscriptionDeliveryOptions) (*ahptypes.SubscribeResult, *Subscription, error) {
	sub := c.AttachSubscription(uri)
	var out ahptypes.SubscribeResult
	if err := c.Request(ctx, "subscribe", ahptypes.SubscribeParams{Channel: uri, Delivery: delivery}, &out); err != nil {
		sub.Close()
		return nil, nil, err
	}
	return &out, sub, nil
}

// AttachSubscription returns a local [Subscription] for uri without
// sending a `subscribe` request. Useful when uri was included in
// `initialSubscriptions` during [Client.Initialize].
func (c *Client) AttachSubscription(uri string) *Subscription {
	c.subscriptionsMu.Lock()
	defer c.subscriptionsMu.Unlock()
	sub := &Subscription{uri: uri, events: make(chan SubscriptionEvent, c.cfg.SubscriptionBuffer)}
	c.subscriptions[uri] = append(c.subscriptions[uri], sub)
	return sub
}

// Unsubscribe sends an `unsubscribe` notification and drops every
// local [Subscription] for uri.
func (c *Client) Unsubscribe(ctx context.Context, uri string) error {
	c.subscriptionsMu.Lock()
	subs := c.subscriptions[uri]
	delete(c.subscriptions, uri)
	c.subscriptionsMu.Unlock()
	for _, s := range subs {
		s.Close()
	}
	return c.Notify(ctx, "unsubscribe", ahptypes.UnsubscribeParams{Channel: uri})
}

// Dispatch fires a write-ahead `dispatchAction` notification with a
// client-assigned sequence number.
func (c *Client) Dispatch(ctx context.Context, channel string, action ahptypes.StateAction) (DispatchHandle, error) {
	seq := c.nextClientSeq.Add(1) - 1
	err := c.Notify(ctx, "dispatchAction", ahptypes.DispatchActionParams{
		Channel:   channel,
		ClientSeq: seq,
		Action:    action,
	})
	if err != nil {
		return DispatchHandle{}, err
	}
	return DispatchHandle{ClientSeq: seq}, nil
}

// Events returns a new top-level [EventStream] that receives every
// inbound event from this client, tagged with the channel URI it was
// scoped to. Multiple streams may exist concurrently.
func (c *Client) Events() *EventStream {
	c.subscriptionsMu.Lock()
	defer c.subscriptionsMu.Unlock()
	s := &EventStream{events: make(chan ClientEvent, c.cfg.SubscriptionBuffer)}
	c.eventListeners = append(c.eventListeners, s)
	return s
}
