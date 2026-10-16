package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// WindowingConfig supplies connection defaults. Windowing remains opt-in.
// All byte amounts use UTF-16 bytes of the complete JSON text.
type WindowingConfig struct {
	WindowBytes          int64
	MaximumFrameBytes    int64
	MaxBufferedSendBytes int64
	Coalescers           []Coalescer
}

// ReceiveMode controls when an owner returns credit.
type ReceiveMode uint8

const (
	// ReceiveAuto releases the previous delivery when Next is called again.
	ReceiveAuto ReceiveMode = iota
	// ReceiveManual requires explicit Delivery.Release.
	ReceiveManual
)

// WindowOptions opts a subscription in. Zero limits inherit the connection
// defaults. A nil Coalescing enables built-in and configured coalescers.
type WindowOptions struct {
	WindowBytes       int64
	MaximumFrameBytes int64
	Receive           ReceiveMode
	Coalescing        *bool
}

// SubscribeOptions configures one subscription without changing legacy APIs.
type SubscribeOptions struct {
	Window   *WindowOptions
	Delivery *ahptypes.SubscriptionDeliveryOptions
	View     *ahptypes.SubscribeView
	owner    *Subscription
}

// FlowControlStatus is an immutable snapshot of subscription backpressure.
type FlowControlStatus struct {
	Mode                 string                       `json:"mode"`
	FallbackReason       string                       `json:"fallbackReason,omitempty"`
	Limits               *ahptypes.ChannelFlowControl `json:"limits,omitempty"`
	OutstandingSendBytes int64                        `json:"outstandingSendBytes"`
	BufferedSendBytes    int64                        `json:"bufferedSendBytes"`
	BufferedReceiveBytes int64                        `json:"bufferedReceiveBytes"`
	Writable             bool                         `json:"writable"`
}

// FlowControlEvent is lossy telemetry, never a credit-owning delivery.
type FlowControlEvent struct {
	Channel string            `json:"channel"`
	Kind    string            `json:"kind"`
	Status  FlowControlStatus `json:"status"`
}

var (
	ErrBackpressure        = errors.New("ahp: buffered send limit reached")
	ErrSubscriptionDropped = errors.New("ahp: subscription was not resumed")
)

const maxWindowInteger int64 = 9007199254740991

func utf16Bytes(text string) int64 {
	var size int64
	for _, r := range text {
		if r > 0xffff {
			size += 4
		} else {
			size += 2
		}
	}
	return size
}

type channelFlow struct {
	channel                                        string
	owner                                          *Subscription
	opts                                           SubscribeOptions
	limits                                         *ahptypes.ChannelFlowControl
	reason                                         string
	epoch                                          uint64
	sent, consumed, received, released, advertised int64
	creditReady                                    bool
	creditTimer                                    *time.Timer
	expectSnapshot                                 bool
	fragments                                      strings.Builder
	fragmentBytes                                  int64
	fragmenting                                    bool
	queue                                          []*flowSend
	buffered                                       int64
	retainedSendBytes                              int64
	lastSeq                                        int64
	dropped                                        bool
	reset                                          bool
	statusInitialized                              bool
	lastWritable                                   bool
	accepted                                       bool
	requests                                       map[*requestHooks]struct{}
}

type flowEngine struct {
	c             *Client
	mu            sync.Mutex
	cfg           WindowingConfig
	capabilities  TransportCapabilities
	channels      map[string]*channelFlow
	order         []string
	cursor        int
	creditCursor  int
	wake          chan struct{}
	listeners     []chan FlowControlEvent
	stopped       bool
	controlTokens float64
	controlAt     time.Time
	cleanup       []flowCleanup
}

func newFlowEngine(c *Client) (*flowEngine, error) {
	e := &flowEngine{c: c, cfg: c.cfg.Windowing, channels: make(map[string]*channelFlow), wake: make(chan struct{}, 1)}
	e.controlTokens, e.controlAt = 32, time.Now()
	if p, ok := c.transport.(TransportCapabilitiesProvider); ok {
		e.capabilities = p.TransportCapabilities()
	}
	if e.cfg.WindowBytes == 0 {
		e.cfg.WindowBytes = 256 << 10
	}
	if e.cfg.MaximumFrameBytes == 0 {
		e.cfg.MaximumFrameBytes = e.capabilities.MaximumFrameBytes
		if e.cfg.MaximumFrameBytes == 0 {
			e.cfg.MaximumFrameBytes = 1 << 20
		}
	}
	if e.cfg.MaxBufferedSendBytes == 0 {
		e.cfg.MaxBufferedSendBytes = 1 << 20
	}
	if err := validLimits(ahptypes.ChannelReceiveLimits{WindowBytes: e.cfg.WindowBytes, MaximumFrameBytes: e.cfg.MaximumFrameBytes}); err != nil {
		return nil, err
	}
	if e.cfg.MaxBufferedSendBytes < 1 || e.cfg.MaxBufferedSendBytes > maxWindowInteger {
		return nil, fmt.Errorf("ahp: invalid send buffer limit")
	}
	e.cfg.Coalescers = append([]Coalescer(nil), e.cfg.Coalescers...)
	return e, nil
}

func validLimits(l ahptypes.ChannelReceiveLimits) error {
	if l.WindowBytes < 1 || l.WindowBytes > maxWindowInteger || l.MaximumFrameBytes < 1024 || l.MaximumFrameBytes > maxWindowInteger {
		return fmt.Errorf("ahp: invalid flow-control limits")
	}
	return nil
}

func validateAccepted(l *ahptypes.ChannelFlowControl, offer *ahptypes.SubscriptionFlowControlOptions) error {
	if offer == nil {
		return fmt.Errorf("ahp: unsolicited flow control")
	}
	if err := validLimits(l.ClientReceive); err != nil {
		return err
	}
	if err := validLimits(l.HostReceive); err != nil {
		return err
	}
	if l.ClientReceive.WindowBytes > offer.Receive.WindowBytes || l.ClientReceive.MaximumFrameBytes > offer.Receive.MaximumFrameBytes {
		return fmt.Errorf("ahp: accepted limits exceed the offer")
	}
	return nil
}

func copyOptions(o SubscribeOptions) SubscribeOptions {
	if o.Window != nil {
		w := *o.Window
		if w.Coalescing != nil {
			b := *w.Coalescing
			w.Coalescing = &b
		}
		o.Window = &w
	}
	if o.Delivery != nil {
		d := *o.Delivery
		if d.MaxLatencyMs != nil {
			n := *d.MaxLatencyMs
			d.MaxLatencyMs = &n
		}
		o.Delivery = &d
	}
	if o.View != nil {
		v := *o.View
		if v.Turns != nil {
			n := *v.Turns
			v.Turns = &n
		}
		o.View = &v
	}
	return o
}

func (e *flowEngine) signal() {
	select {
	case e.wake <- struct{}{}:
	default:
	}
}

func (e *flowEngine) statusLocked(f *channelFlow) FlowControlStatus {
	receiveBytes := f.received - f.released
	closed := false
	if f.owner != nil {
		f.owner.owner.mu.Lock()
		receiveBytes = f.owner.owner.unreleased
		closed = f.owner.owner.final
		f.owner.owner.mu.Unlock()
	}
	s := FlowControlStatus{Mode: "ordinary", FallbackReason: f.reason, BufferedSendBytes: f.buffered, BufferedReceiveBytes: receiveBytes, Writable: !closed && !e.stopped && !f.dropped && !f.reset}
	if f.limits != nil {
		l := *f.limits
		s.Mode, s.Limits = "windowed", &l
		s.OutstandingSendBytes = f.sent - f.consumed
		s.Writable = !closed && !e.stopped && !f.dropped && !f.reset && s.OutstandingSendBytes < l.HostReceive.WindowBytes && f.buffered < e.cfg.MaxBufferedSendBytes && f.retainedSendBytes < e.cfg.MaxBufferedSendBytes
	}
	return s
}

func (e *flowEngine) emitLocked(f *channelFlow, kind string) {
	status := e.statusLocked(f)
	if f.owner != nil && f.owner.owner != nil {
		f.owner.owner.publish(status)
	}
	emit := func(kind string) {
		if kind == "" {
			return
		}
		for _, ch := range e.listeners {
			select {
			case ch <- FlowControlEvent{Channel: f.channel, Kind: kind, Status: status}:
			default:
			}
		}
	}
	emit(kind)
	if f.statusInitialized && !e.stopped && !f.dropped && f.lastWritable != status.Writable {
		transition := "blocked"
		if status.Writable {
			transition = "unblocked"
		}
		if kind != transition {
			emit(transition)
		}
	}
	f.statusInitialized, f.lastWritable = true, status.Writable
}

// FlowControlEvents returns a lossy stream of connection-level telemetry.
func (c *Client) FlowControlEvents() <-chan FlowControlEvent {
	c.flow.mu.Lock()
	defer c.flow.mu.Unlock()
	ch := make(chan FlowControlEvent, 64)
	if c.flow.stopped {
		close(ch)
	} else {
		c.flow.listeners = append(c.flow.listeners, ch)
	}
	return ch
}

func (e *flowEngine) getLocked(uri string) *channelFlow {
	if f := e.channels[uri]; f != nil && !f.dropped {
		return f
	}
	existed := e.channels[uri] != nil
	f := &channelFlow{channel: uri}
	e.channels[uri] = f
	if !existed {
		e.order = append(e.order, uri)
	}
	return f
}

func (e *flowEngine) attachLocked(f *channelFlow, sub *Subscription) {
	if sub == nil {
		sub = &Subscription{uri: f.channel, events: make(chan SubscriptionEvent, e.c.cfg.SubscriptionBuffer), owner: newDeliveryQueue()}
	}
	f.owner = sub
	sub.owner.bind(e, f)
	e.c.subscriptionsMu.Lock()
	found := false
	for _, s := range e.c.subscriptions[f.channel] {
		if s == sub {
			found = true
		}
	}
	if !found {
		e.c.subscriptions[f.channel] = append(e.c.subscriptions[f.channel], sub)
	}
	e.c.subscriptionsMu.Unlock()
}

// SubscribeWithOptions creates or updates the single owner for a channel.
// Use Next for credit-owning consumption; Events remains an observe-only stream.
func (c *Client) SubscribeWithOptions(ctx context.Context, uri string, opts SubscribeOptions) (*ahptypes.SubscribeResult, *Subscription, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	opts = copyOptions(opts)
	c.flow.mu.Lock()
	if c.flow.stopped {
		c.flow.mu.Unlock()
		return nil, nil, ErrShutdown
	}
	if opts.owner != nil {
		current := c.flow.channels[uri]
		if current == nil || current.owner != opts.owner || opts.owner.owner.isFinal() {
			c.flow.mu.Unlock()
			return nil, opts.owner, ErrClosed
		}
	}
	f := c.flow.getLocked(uri)
	created := f.owner == nil
	if f.owner == nil {
		c.flow.attachLocked(f, nil)
	}
	sub := f.owner
	c.flow.mu.Unlock()
	select {
	case sub.owner.updateGate <- struct{}{}:
		defer func() { <-sub.owner.updateGate }()
	case <-ctx.Done():
		return nil, sub, ctx.Err()
	}
	opts.owner = sub
	var result ahptypes.SubscribeResult
	err := c.request(ctx, "subscribe", ahptypes.SubscribeParams{Channel: uri, Delivery: opts.Delivery, View: opts.View}, &result, &opts)
	if err != nil {
		if created {
			sub.Close()
			return nil, nil, err
		}
		c.flow.mu.Lock()
		active := c.flow.channels[uri] == f && f.owner == sub && !sub.owner.isFinal()
		c.flow.mu.Unlock()
		if !active {
			return nil, sub, ErrClosed
		}
		return nil, sub, err
	}
	return &result, sub, nil
}

// Update renegotiates the same subscription. Existing deliveries remain ordered.
func (s *Subscription) Update(ctx context.Context, opts SubscribeOptions) (*ahptypes.SubscribeResult, error) {
	if s.owner == nil {
		return nil, fmt.Errorf("ahp: Update requires an options-based subscription")
	}
	e, _ := s.owner.binding()
	opts.owner = s
	r, _, err := e.c.SubscribeWithOptions(ctx, s.uri, opts)
	return r, err
}

// ResumeSubscription is used by managed hosts after a fresh initialize. It
// preserves the owner's unread queue and requests a new snapshot/credit epoch.
// The old Client must be shut down before calling it.
func (c *Client) ResumeSubscription(ctx context.Context, s *Subscription, opts SubscribeOptions) (*ahptypes.SubscribeResult, error) {
	if s.owner == nil {
		return nil, fmt.Errorf("ahp: not an options-based subscription")
	}
	s.owner.mu.Lock()
	final := s.owner.final
	s.owner.mu.Unlock()
	if final {
		return nil, ErrClosed
	}
	old, _ := s.owner.binding()
	select {
	case <-old.c.Done():
	default:
		return nil, fmt.Errorf("ahp: old subscription connection is still open")
	}
	s.closeMu.Lock()
	s.closed = false
	s.events = make(chan SubscriptionEvent, c.cfg.SubscriptionBuffer)
	s.closeMu.Unlock()
	c.flow.mu.Lock()
	f := c.flow.getLocked(s.uri)
	if f.owner != nil && f.owner != s {
		c.flow.mu.Unlock()
		return nil, fmt.Errorf("ahp: channel already has an owner")
	}
	c.flow.attachLocked(f, s)
	c.flow.mu.Unlock()
	r, _, err := c.SubscribeWithOptions(ctx, s.uri, opts)
	return r, err
}

func (e *flowEngine) prepareRequest(method string, raw json.RawMessage, options *SubscribeOptions) (json.RawMessage, *requestHooks, error) {
	if method == "initialize" {
		var p ahptypes.InitializeParams
		if err := json.Unmarshal(raw, &p); err != nil {
			return raw, nil, err
		}
		for _, uri := range p.InitialSubscriptions {
			if strings.HasPrefix(uri, "ahp-tcp:") {
				return raw, nil, fmt.Errorf("ahp: TCP cannot be an initial subscription")
			}
		}
	}
	if method == "reconnect" {
		return e.prepareReconnect(raw)
	}
	if method != "subscribe" {
		return raw, nil, nil
	}
	var p ahptypes.SubscribeParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return raw, nil, err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.stopped {
		return raw, nil, ErrShutdown
	}
	if options == nil && p.FlowControl == nil && e.channels[p.Channel] == nil {
		return raw, nil, nil
	}
	if options != nil && options.owner != nil {
		current := e.channels[p.Channel]
		if current == nil || current.owner != options.owner || options.owner.owner.isFinal() {
			return raw, nil, ErrClosed
		}
	}
	f := e.getLocked(p.Channel)
	if f.owner == nil {
		e.attachLocked(f, nil)
	}
	validated := false
	defer func() {
		if !validated && !f.accepted && len(f.requests) == 0 {
			e.retireLocked(f, ErrClosed, false)
		}
	}()
	opts := copyOptions(f.opts)
	if options != nil {
		opts = copyOptions(*options)
	} else {
		opts.Delivery, opts.View = p.Delivery, p.View
		if p.FlowControl != nil {
			opts.Window = &WindowOptions{WindowBytes: p.FlowControl.Receive.WindowBytes, MaximumFrameBytes: p.FlowControl.Receive.MaximumFrameBytes}
		} else {
			opts.Window = nil
		}
	}
	reason := ""
	if opts.Window != nil {
		w := opts.Window
		if w.Receive != ReceiveAuto && w.Receive != ReceiveManual {
			return raw, nil, fmt.Errorf("ahp: invalid receive mode")
		}
		window, frame := w.WindowBytes, w.MaximumFrameBytes
		if window == 0 {
			window = e.cfg.WindowBytes
		}
		if frame == 0 {
			frame = e.cfg.MaximumFrameBytes
		}
		p.FlowControl = &ahptypes.SubscriptionFlowControlOptions{Receive: ahptypes.ChannelReceiveLimits{WindowBytes: window, MaximumFrameBytes: frame}}
		if err := validLimits(p.FlowControl.Receive); err != nil {
			return raw, nil, err
		}
		if !e.capabilities.SupportsWindowedDelivery {
			p.FlowControl = nil
			reason = "transport"
		}
	}
	if options != nil && options.Window == nil {
		p.FlowControl = nil
	}
	if strings.HasPrefix(p.Channel, "ahp-tcp:") && p.FlowControl == nil {
		return raw, nil, fmt.Errorf("ahp: TCP requires windowed delivery")
	}
	offer := p.FlowControl
	encoded, err := json.Marshal(p)
	if err != nil {
		return raw, nil, err
	}
	owner := f.owner
	h := &requestHooks{done: make(chan struct{}), flows: map[*channelFlow]struct{}{f: {}}}
	if f.requests == nil {
		f.requests = make(map[*requestHooks]struct{})
	}
	f.requests[h] = struct{}{}
	h.cancel = func() {
		e.mu.Lock()
		defer e.mu.Unlock()
		e.retireLocked(f, ErrClosed, true)
	}
	h.failed = func(err error) {
		e.mu.Lock()
		defer e.mu.Unlock()
		delete(f.requests, h)
		if !f.accepted {
			e.retireLocked(f, err, true)
		}
	}
	h.complete = func(result json.RawMessage) error {
		e.mu.Lock()
		defer e.mu.Unlock()
		if e.stopped || e.channels[p.Channel] != f || f.owner != owner || owner.owner.isFinal() {
			return nil
		}
		var r ahptypes.SubscribeResult
		if err := json.Unmarshal(result, &r); err != nil {
			return err
		}
		if r.FlowControl != nil {
			if err := validateAccepted(r.FlowControl, offer); err != nil {
				return err
			}
			if r.Snapshot != nil {
				return fmt.Errorf("ahp: windowed result also contains a snapshot")
			}
			minimum, err := frameText(p.Channel, "A", false)
			if err != nil || utf16Bytes(minimum) > r.FlowControl.ClientReceive.MaximumFrameBytes || utf16Bytes(minimum) > r.FlowControl.HostReceive.MaximumFrameBytes {
				return fmt.Errorf("ahp: accepted frame cannot carry a character")
			}
		} else if strings.HasPrefix(p.Channel, "ahp-tcp:") {
			return fmt.Errorf("ahp: host declined mandatory TCP windowing")
		}
		if (f.limits == nil) != (r.FlowControl == nil) {
			f.epoch++
			if f.creditTimer != nil {
				f.creditTimer.Stop()
				f.creditTimer = nil
			}
			f.creditReady = false
			f.sent, f.consumed, f.received, f.released, f.advertised = 0, 0, 0, 0, 0
		}
		f.limits, f.opts, f.reason = r.FlowControl, opts, reason
		f.accepted = true
		delete(f.requests, h)
		f.dropped = false
		if opts.Window != nil && r.FlowControl == nil && reason == "" {
			f.reason = "declined"
		}
		f.expectSnapshot = r.FlowControl != nil
		owner.owner.setMode(opts)
		kind := "negotiated"
		if f.reason != "" {
			kind = "declined"
		}
		e.emitLocked(f, kind)
		if r.Snapshot != nil {
			n := snapshotNotification(p.Channel, *r.Snapshot)
			if err := e.enqueueLocked(f, n, 0, 0); err != nil {
				return err
			}
		}
		e.signal()
		return nil
	}
	validated = true
	return encoded, h, nil
}

func snapshotNotification(uri string, snapshot ahptypes.Snapshot) ahptypes.JsonRpcNotification {
	raw, _ := json.Marshal(ahptypes.ChannelSnapshotParams{Channel: uri, Snapshot: snapshot})
	return ahptypes.JsonRpcNotification{JsonRpc: ahptypes.JsonRpcV2, Method: "channel/snapshot", Params: raw}
}

func (e *flowEngine) hasWindows() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, f := range e.channels {
		if f.limits != nil {
			return true
		}
	}
	return false
}

func notificationChannel(n ahptypes.JsonRpcNotification) (string, error) {
	var p struct {
		Channel string `json:"channel"`
	}
	err := json.Unmarshal(n.Params, &p)
	return p.Channel, err
}

func (e *flowEngine) receive(n ahptypes.JsonRpcNotification, wire TransportMessage) (bool, error) {
	channel, err := notificationChannel(n)
	if err != nil {
		return false, nil
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.stopped {
		return true, nil
	}
	f := e.channels[channel]
	if f == nil {
		return false, nil
	}
	if f.dropped {
		return true, nil
	}
	if f.owner != nil && f.owner.owner.isFinal() {
		e.retireLocked(f, ErrClosed, true)
		return true, nil
	}
	if !f.accepted {
		return true, nil
	}
	if f.reset && ahptypes.CountsAgainstWindow(n.Method) {
		return true, fmt.Errorf("ahp: data after TCP reset")
	}
	if f.limits != nil && n.JsonRpc != ahptypes.JsonRpcV2 {
		return true, fmt.Errorf("ahp: invalid JSON-RPC notification")
	}
	if !ahptypes.CountsAgainstWindow(n.Method) {
		if raw, ok := wire.RawJSONText(); ok && utf16Bytes(raw) > 1<<20 {
			return true, fmt.Errorf("ahp: control message too large")
		}
	}
	if f.limits == nil && n.Method == "channel/credit" {
		return true, nil
	}
	if n.Method == "channel/credit" {
		var p ahptypes.ChannelCreditParams
		if err := json.Unmarshal(n.Params, &p); err != nil {
			return true, err
		}
		if p.ConsumedBytes < 0 || p.ConsumedBytes > f.sent {
			return true, fmt.Errorf("ahp: credit exceeds sent bytes")
		}
		if p.ConsumedBytes > f.consumed {
			f.consumed = p.ConsumedBytes
			e.emitLocked(f, "creditReceived")
			e.signal()
		}
		return true, nil
	}
	var cost int64
	if f.limits != nil && ahptypes.CountsAgainstWindow(n.Method) {
		text, ok := wire.RawJSONText()
		if !ok || !utf8.ValidString(text) {
			return true, fmt.Errorf("ahp: raw UTF-8 JSON text required")
		}
		cost = utf16Bytes(text)
		if cost > f.limits.ClientReceive.MaximumFrameBytes {
			return true, fmt.Errorf("ahp: data exceeds maximumFrameBytes")
		}
		if f.received > maxWindowInteger-cost {
			return true, fmt.Errorf("ahp: received counter overflow")
		}
		f.received += cost
	}
	if n.Method == "channel/frame" {
		if f.limits == nil {
			return true, fmt.Errorf("ahp: fragment on ordinary subscription")
		}
		var p ahptypes.ChannelFrameParams
		if err := json.Unmarshal(n.Params, &p); err != nil {
			return true, err
		}
		if p.Data == "" || !validFragmentString(n.Params) {
			return true, fmt.Errorf("ahp: invalid fragment data")
		}
		f.fragmenting = true
		f.fragments.WriteString(p.Data)
		f.fragmentBytes += cost
		if p.Final == nil || !*p.Final {
			e.releaseLocked(f, cost, true)
			return true, nil
		}
		var joined ahptypes.JsonRpcMessage
		if err := json.Unmarshal([]byte(f.fragments.String()), &joined); err != nil {
			return true, fmt.Errorf("ahp: invalid joined JSON: %w", err)
		}
		if joined.Notification == nil || joined.Notification.JsonRpc != ahptypes.JsonRpcV2 {
			return true, fmt.Errorf("ahp: frame contains a request or response")
		}
		n = *joined.Notification
		innerChannel, err := notificationChannel(n)
		if err != nil || innerChannel != channel || n.Method == "channel/frame" || !ahptypes.CountsAgainstWindow(n.Method) {
			return true, fmt.Errorf("ahp: invalid joined channel or method")
		}
		total := f.fragmentBytes
		f.fragments.Reset()
		f.fragmentBytes = 0
		f.fragmenting = false
		e.emitLocked(f, "fragmentedMessageReceived")
		return true, e.enqueueLocked(f, n, total, cost)
	}
	if f.fragmenting && ahptypes.CountsAgainstWindow(n.Method) {
		return true, fmt.Errorf("ahp: interleaved fragmented message")
	}
	if (n.Method == "channel/snapshot") && f.limits == nil {
		return true, fmt.Errorf("ahp: unsolicited windowed snapshot")
	}
	if n.Method == "tcp/reset" {
		e.failQueueLocked(f, ErrClosed)
		f.reset = true
		f.epoch++
		if f.owner != nil {
			q := f.owner.owner
			q.mu.Lock()
			q.items, q.previous = nil, nil
			q.unreleased = 0
			q.releaseVersion++
			q.mu.Unlock()
		}
		e.releaseLocked(f, f.received-f.released, true)
		f.fragments.Reset()
		f.fragmenting = false
		f.fragmentBytes = 0
	}
	return true, e.enqueueLocked(f, n, cost, cost)
}

// encoding/json accepts unpaired escaped surrogates by replacing them; fragments
// cannot split a surrogate pair, so validate their raw JSON strings first.
func validFragmentString(params []byte) bool {
	var raw map[string]json.RawMessage
	if json.Unmarshal(params, &raw) != nil {
		return false
	}
	b := raw["data"]
	for i := 0; i < len(b); i++ {
		if b[i] != '\\' {
			continue
		}
		i++
		if i >= len(b) {
			return false
		}
		if b[i] != 'u' {
			continue
		}
		read := func(pos int) (uint16, bool) {
			if pos+4 >= len(b) {
				return 0, false
			}
			var n uint16
			for _, c := range b[pos+1 : pos+5] {
				n <<= 4
				switch {
				case c >= '0' && c <= '9':
					n += uint16(c - '0')
				case c >= 'a' && c <= 'f':
					n += uint16(c - 'a' + 10)
				case c >= 'A' && c <= 'F':
					n += uint16(c - 'A' + 10)
				default:
					return 0, false
				}
			}
			return n, true
		}
		n, ok := read(i)
		if !ok {
			return false
		}
		i += 4
		if n >= 0xdc00 && n <= 0xdfff {
			return false
		}
		if n >= 0xd800 && n <= 0xdbff {
			if i+2 >= len(b) || b[i+1] != '\\' || b[i+2] != 'u' {
				return false
			}
			low, ok := read(i + 2)
			if !ok || low < 0xdc00 || low > 0xdfff {
				return false
			}
			i += 6
		}
	}
	return true
}

func (e *flowEngine) enqueueLocked(f *channelFlow, n ahptypes.JsonRpcNotification, total, credit int64) error {
	if f.expectSnapshot && ahptypes.CountsAgainstWindow(n.Method) {
		if n.Method != "channel/snapshot" {
			return fmt.Errorf("ahp: first data must be channel/snapshot")
		}
		f.expectSnapshot = false
	}
	ev, err := eventForNotification(n)
	if err != nil {
		return err
	}
	if p, ok := ev.(SubscriptionEventSnapshot); ok {
		if p.Params.Snapshot.Resource != f.channel {
			return fmt.Errorf("ahp: snapshot resource mismatch")
		}
	}
	epoch := f.epoch
	if f.owner != nil {
		q := f.owner.owner
		q.mu.Lock()
		if q.closed {
			q.mu.Unlock()
			e.releaseLocked(f, credit, false)
			e.c.fanOut(f.channel, ev)
			return nil
		}
		version := q.releaseVersion
		d := newDelivery(n, ev, total, e.deliveryRelease(f, epoch, credit, q, version))
		d.credit, d.source = credit, f
		q.unreleased += credit
		if !q.closed {
			if f.limits != nil && coalescingEnabled(f.opts) && len(q.items) > 0 {
				last := q.items[len(q.items)-1]
				if last.epoch == epoch && last.source == f {
					if merged, ok := e.coalesce(last.notification, n, CoalesceReceive, f); ok {
						event, err := eventForNotification(merged)
						if err != nil {
							q.mu.Unlock()
							return err
						}
						old := last
						combinedCredit := old.credit + credit
						d = newDelivery(merged, event, old.bytes+total, e.deliveryRelease(f, epoch, combinedCredit, q, version))
						d.epoch, d.credit, d.source = epoch, combinedCredit, f
						q.items[len(q.items)-1] = d
						q.signalLocked()
						q.mu.Unlock()
						keepSequence(f, event)
						e.emitLocked(f, "coalesced")
						e.c.fanOut(f.channel, ev)
						return nil
					}
				}
			}
			d.epoch = epoch
			if f.limits != nil || len(q.items) < e.c.cfg.SubscriptionBuffer {
				q.items = append(q.items, d)
				q.signalLocked()
				keepSequence(f, ev)
			}

		}
		q.mu.Unlock()
	} else {
		e.releaseLocked(f, credit, false)
	}
	e.emitLocked(f, "")
	e.c.fanOut(f.channel, ev)
	return nil
}

func keepSequence(f *channelFlow, event SubscriptionEvent) {
	var seq int64
	switch v := event.(type) {
	case SubscriptionEventSnapshot:
		seq = v.Params.Snapshot.FromSeq
	case SubscriptionEventAction:
		seq = v.Envelope.ServerSeq
	}
	if seq > f.lastSeq {
		f.lastSeq = seq
	}
}

func (e *flowEngine) deliveryRelease(f *channelFlow, epoch uint64, credit int64, q *deliveryQueue, version uint64) func() {
	return func() {
		e.mu.Lock()
		q.mu.Lock()
		current, currentFlow := q.engine, q.flow
		changed := q.releaseVersion == version
		if changed {
			q.unreleased -= credit
		}
		q.mu.Unlock()
		if changed && !e.stopped && !f.dropped && f.epoch == epoch {
			e.releaseLocked(f, credit, false)
		} else if current == e && changed {
			e.emitLocked(f, "")
		}
		e.mu.Unlock()
		if current != e && changed {
			current.mu.Lock()
			current.emitLocked(currentFlow, "")
			current.mu.Unlock()
		}
	}
}

func coalescingEnabled(opts SubscribeOptions) bool {
	return opts.Window != nil && (opts.Window.Coalescing == nil || *opts.Window.Coalescing)
}

func (e *flowEngine) releaseLocked(f *channelFlow, bytes int64, immediate bool) {
	if bytes == 0 || f.limits == nil {
		return
	}
	f.released += bytes
	threshold := f.limits.ClientReceive.WindowBytes / 4
	if threshold < 1 {
		threshold = 1
	}
	if threshold > 16<<10 {
		threshold = 16 << 10
	}
	if immediate || f.released-f.advertised >= threshold || f.received-f.advertised >= f.limits.ClientReceive.WindowBytes {
		f.creditReady = true
		e.signal()
	} else if f.creditTimer == nil {
		epoch := f.epoch
		f.creditTimer = time.AfterFunc(5*time.Millisecond, func() {
			e.mu.Lock()
			defer e.mu.Unlock()
			if f.epoch != epoch {
				return
			}
			f.creditTimer = nil
			if !e.stopped && f.epoch == epoch && f.released > f.advertised {
				f.creditReady = true
				e.signal()
			}
		})
	}
	e.emitLocked(f, "")
}

func (e *flowEngine) stop() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.stopped {
		return
	}
	e.stopped = true
	for _, f := range e.channels {
		if f.creditTimer != nil {
			f.creditTimer.Stop()
		}
		f.fragments.Reset()
		f.fragmenting = false
		f.fragmentBytes = 0
		e.failQueueLocked(f, ErrShutdown)
		e.emitLocked(f, "dropped")
		for h := range f.requests {
			h.drop(ErrShutdown)
		}
	}
	e.channels = make(map[string]*channelFlow)
	e.order = nil
	e.cleanup = nil
	for _, ch := range e.listeners {
		close(ch)
	}
	e.listeners = nil
}
