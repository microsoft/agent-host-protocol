package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func flowTestClient(t *testing.T, cfg Config) (*Client, *corpusTransport, context.Context) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	wire := newCorpusTransport()
	c, err := Connect(ctx, wire, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Shutdown(context.Background()) })
	return c, wire, ctx
}
func readFlowWire(t *testing.T, wire *corpusTransport) ahptypes.JsonRpcMessage {
	t.Helper()
	select {
	case text := <-wire.sent:
		var m ahptypes.JsonRpcMessage
		if err := json.Unmarshal([]byte(text), &m); err != nil {
			t.Fatal(err)
		}
		return m
	case <-time.After(time.Second):
		t.Fatal("no outgoing message")
		return ahptypes.JsonRpcMessage{}
	}
}
func hostFlowReply(t *testing.T, wire *corpusTransport, request ahptypes.JsonRpcMessage, result any) {
	t.Helper()
	if request.Request == nil {
		t.Fatal("expected request")
	}
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": request.Request.ID, "result": result})
	wire.in <- NewTextMessage(string(b))
}
func hostFlowNotification(wire *corpusTransport, method string, params any) {
	b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "method": method, "params": params})
	wire.in <- NewTextMessage(string(b))
}
func acceptedFlow(window, frame int64) *ahptypes.ChannelFlowControl {
	return &ahptypes.ChannelFlowControl{
		ClientReceive: ahptypes.ChannelReceiveLimits{WindowBytes: window, MaximumFrameBytes: frame},
		HostReceive:   ahptypes.ChannelReceiveLimits{WindowBytes: window, MaximumFrameBytes: frame},
	}
}
func subscribeFlow(t *testing.T, c *Client, wire *corpusTransport, ctx context.Context, uri string, opts SubscribeOptions, limits *ahptypes.ChannelFlowControl) *Subscription {
	t.Helper()
	type result struct {
		sub *Subscription
		err error
	}
	done := make(chan result, 1)
	go func() { _, s, err := c.SubscribeWithOptions(ctx, uri, opts); done <- result{s, err} }()
	request := readFlowWire(t, wire)
	hostFlowReply(t, wire, request, &ahptypes.SubscribeResult{FlowControl: limits})
	select {
	case r := <-done:
		if r.err != nil {
			t.Fatal(r.err)
		}
		return r.sub
	case <-ctx.Done():
		t.Fatal(ctx.Err())
		return nil
	}
}
func initialFlowSnapshot(wire *corpusTransport, uri string, seq int64) {
	hostFlowNotification(wire, "channel/snapshot", map[string]any{"channel": uri, "snapshot": map[string]any{"resource": uri, "state": map[string]any{}, "fromSeq": seq}})
}
func waitFlow(t *testing.T, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for !predicate() {
		if time.Now().After(deadline) {
			t.Fatal("flow condition did not become true")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestFlowTransportFallbackAndSnapshot(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	wire := newCorpusTransport()
	wire.capable = false
	c, err := Connect(ctx, wire, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Shutdown(context.Background())
	done := make(chan *Subscription, 1)
	go func() {
		_, s, _ := c.SubscribeWithOptions(ctx, "ahp-terminal:/t", SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}})
		done <- s
	}()
	request := readFlowWire(t, wire)
	var p ahptypes.SubscribeParams
	_ = json.Unmarshal(request.Request.Params, &p)
	if p.FlowControl != nil {
		t.Fatal("parsed transport offered windowing")
	}
	hostFlowReply(t, wire, request, map[string]any{"snapshot": map[string]any{"resource": p.Channel, "state": map[string]any{}, "fromSeq": 3}})
	sub := <-done
	if sub.FlowControl().FallbackReason != "transport" {
		t.Fatal(sub.FlowControl())
	}
	d, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := d.Event().(SubscriptionEventSnapshot); !ok || d.WireBytes() != 0 {
		t.Fatal("fallback did not inject an uncharged snapshot")
	}
	d.Release()
	select {
	case text := <-wire.sent:
		t.Fatalf("ordinary fallback sent %s", text)
	case <-time.After(15 * time.Millisecond):
	}
}

func TestFlowRawRequestHooksAndBinaryAccounting(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	uri := "ahp-terminal:/generic"
	done := make(chan error, 1)
	go func() {
		var out ahptypes.SubscribeResult
		done <- c.Request(ctx, "subscribe", ahptypes.SubscribeParams{Channel: uri, FlowControl: &ahptypes.SubscriptionFlowControlOptions{Receive: ahptypes.ChannelReceiveLimits{WindowBytes: 1024, MaximumFrameBytes: 1024}}}, &out)
	}()
	request := readFlowWire(t, wire)
	hostFlowReply(t, wire, request, &ahptypes.SubscribeResult{FlowControl: acceptedFlow(1024, 1024)})
	raw := `{ "jsonrpc":"2.0", "method":"channel/snapshot", "params":{"channel":"ahp-terminal:/generic","snapshot":{"resource":"ahp-terminal:/generic","state":{},"fromSeq":0}} }`
	wire.in <- NewBinaryMessage([]byte(raw))
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	c.flow.mu.Lock()
	sub := c.flow.channels[uri].owner
	c.flow.mu.Unlock()
	d, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if d.WireBytes() != utf16Bytes(raw) {
		t.Fatal("binary input was reserialized")
	}
	d.Release()
	m := readFlowWire(t, wire)
	if m.Notification.Method != "channel/credit" {
		t.Fatal(m)
	}
}

func TestFlowCustomCoalescerAndValidation(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Windowing.Coalescers = []Coalescer{{Method: "app/chunk", Merge: func(a, b ahptypes.JsonRpcNotification, ctx CoalescingContext) (ahptypes.JsonRpcNotification, bool) {
		if ctx.Direction != CoalesceReceive {
			return a, false
		}
		var p, q map[string]any
		_ = json.Unmarshal(a.Params, &p)
		_ = json.Unmarshal(b.Params, &q)
		p["text"] = p["text"].(string) + q["text"].(string)
		a.Params, _ = json.Marshal(p)
		return a, true
	}}}
	c, wire, ctx := flowTestClient(t, cfg)
	uri := "ahp-terminal:/custom"
	sub := subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(1024, 1024))
	initialFlowSnapshot(wire, uri, 0)
	snapshot, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Release()
	_ = readFlowWire(t, wire)
	hostFlowNotification(wire, "app/chunk", map[string]any{"channel": uri, "text": "a"})
	hostFlowNotification(wire, "app/chunk", map[string]any{"channel": uri, "text": "b"})
	waitFlow(t, func() bool {
		sub.owner.mu.Lock()
		defer sub.owner.mu.Unlock()
		return len(sub.owner.items) == 1 && strings.Contains(string(sub.owner.items[0].notification.Params), `"ab"`)
	})
	d, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(d.Notification().Params), `"ab"`) {
		t.Fatal(d.Notification())
	}
	d.Release()
	d.Release()
	waitFlow(t, func() bool { return sub.FlowControl().BufferedReceiveBytes == 0 })
	c.flow.mu.Lock()
	c.flow.cfg.Coalescers[0].Merge = func(a, b ahptypes.JsonRpcNotification, _ CoalescingContext) (ahptypes.JsonRpcNotification, bool) {
		a.Params = json.RawMessage(`{"channel":"ahp-terminal:/wrong"}`)
		return a, true
	}
	c.flow.mu.Unlock()
	hostFlowNotification(wire, "app/chunk", map[string]any{"channel": uri, "text": "a"})
	hostFlowNotification(wire, "app/chunk", map[string]any{"channel": uri, "text": "b"})
	waitFlow(t, func() bool { sub.owner.mu.Lock(); defer sub.owner.mu.Unlock(); return len(sub.owner.items) == 2 })
}

func TestFlowFairnessControlAndCancellation(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	a := subscribeFlow(t, c, wire, ctx, "ahp-terminal:/a", SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(512, 1024))
	b := subscribeFlow(t, c, wire, ctx, "ahp-terminal:/b", SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(512, 1024))
	aCtx, cancel := context.WithCancel(ctx)
	firstDone := make(chan error, 1)
	go func() {
		firstDone <- c.Notify(aCtx, "app/data", map[string]any{"channel": a.URI(), "data": strings.Repeat("漢😀\\\"", 500)})
	}()
	first := readFlowWire(t, wire)
	if first.Notification.Method != "channel/frame" {
		t.Fatal("large message not fragmented")
	}
	cancel()
	if !errors.Is(<-firstDone, context.Canceled) {
		t.Fatal("send cancellation not reported")
	}
	waitFlow(t, func() bool { return !a.FlowControl().Writable })
	blockCtx, blockCancel := context.WithTimeout(ctx, 20*time.Millisecond)
	defer blockCancel()
	if !errors.Is(a.WaitWritable(blockCtx), context.DeadlineExceeded) {
		t.Fatal("full window writable")
	}
	if err := c.Notify(ctx, "app/data", map[string]any{"channel": b.URI(), "data": "other"}); err != nil {
		t.Fatal(err)
	}
	for i := 0; ; i++ {
		other := readFlowWire(t, wire)
		channel, _ := notificationChannel(*other.Notification)
		if channel == b.URI() {
			break
		}
		if i >= 2 || channel != a.URI() {
			t.Fatal("another channel was starved")
		}
	}
	pingCtx, pingCancel := context.WithTimeout(ctx, 20*time.Millisecond)
	defer pingCancel()
	if err := c.Ping(pingCtx); err == nil {
		t.Fatal("unanswered ping should time out")
	}
	ping := readFlowWire(t, wire)
	if ping.Request == nil || ping.Request.Method != "ping" {
		t.Fatal("RPC did not bypass full window")
	}
	// The canceled, already-fragmenting message must still finish.
	for {
		c.flow.mu.Lock()
		total := c.flow.channels[a.URI()].sent
		c.flow.mu.Unlock()
		hostFlowNotification(wire, "channel/credit", ahptypes.ChannelCreditParams{Channel: a.URI(), ConsumedBytes: total})
		m := readFlowWire(t, wire)
		if m.Notification == nil || m.Notification.Method != "channel/frame" {
			t.Fatal(m)
		}
		var p ahptypes.ChannelFrameParams
		_ = json.Unmarshal(m.Notification.Params, &p)
		if p.Final != nil && *p.Final {
			break
		}
	}
	waitFlow(t, func() bool { return a.FlowControl().BufferedSendBytes == 0 })
}

func TestFlowQueueCapAndCanceledUnsentData(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Windowing.MaxBufferedSendBytes = 600
	c, wire, ctx := flowTestClient(t, cfg)
	s := subscribeFlow(t, c, wire, ctx, "ahp-terminal:/t", SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(1, 1024))
	if err := c.Notify(ctx, "app/data", map[string]any{"channel": s.URI(), "text": "first"}); err != nil {
		t.Fatal(err)
	}
	_ = readFlowWire(t, wire)
	sendCtx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() {
		done <- c.Notify(sendCtx, "app/data", map[string]any{"channel": s.URI(), "text": strings.Repeat("x", 120)})
	}()
	waitFlow(t, func() bool { return s.FlowControl().BufferedSendBytes > 0 })
	if err := c.Notify(ctx, "app/data", map[string]any{"channel": s.URI(), "text": strings.Repeat("x", 120)}); !errors.Is(err, ErrBackpressure) {
		t.Fatalf("cap returned %v", err)
	}
	cancel()
	if !errors.Is(<-done, context.Canceled) {
		t.Fatal("canceled unsent data remained pending")
	}
	waitFlow(t, func() bool { return s.FlowControl().BufferedSendBytes == 0 })
	c.flow.mu.Lock()
	total := c.flow.channels[s.URI()].sent
	c.flow.mu.Unlock()
	hostFlowNotification(wire, "channel/credit", ahptypes.ChannelCreditParams{Channel: s.URI(), ConsumedBytes: total})
	waitFlow(t, func() bool { return s.FlowControl().Writable })
	select {
	case text := <-wire.sent:
		t.Fatalf("canceled data sent: %s", text)
	case <-time.After(15 * time.Millisecond):
	}
}

func TestFlowFragmentSizingSurrogatesAndLongURI(t *testing.T) {
	text := strings.Repeat("漢😀\\\"<\n", 300)
	for _, remaining := range []int64{1, 200, 512, 1024} {
		frame, count, err := fragmentText("ahp-terminal:/t", text, 1024, remaining)
		if err != nil {
			t.Fatal(err)
		}
		if utf16Bytes(frame) > 1024 || !utf8.ValidString(text[:count]) {
			t.Fatal("invalid fragment prefix or size")
		}
		var n ahptypes.JsonRpcNotification
		_ = json.Unmarshal([]byte(frame), &n)
		var p ahptypes.ChannelFrameParams
		_ = json.Unmarshal(n.Params, &p)
		if p.Data != text[:count] {
			t.Fatal("fragment data changed")
		}
	}
	if _, _, err := fragmentText(strings.Repeat("x", 1000), "a", 1024, 512); err == nil {
		t.Fatal("impossible frame accepted")
	}
	for _, p := range []string{`{"data":"\ud800"}`, `{"data":"\udc00"}`} {
		if validFragmentString([]byte(p)) {
			t.Fatal("split surrogate accepted")
		}
	}
	for _, p := range []string{`{"data":"\ud83d\ude00"}`, `{"data":"\\ud800"}`, `{"data":"😀"}`} {
		if !validFragmentString([]byte(p)) {
			t.Fatal("valid fragment rejected", p)
		}
	}
}

func TestFlowResubscribeAndOwnerClose(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	uri := "ahp-terminal:/t"
	sub := subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(512, 1024))
	initialFlowSnapshot(wire, uri, 0)
	d, err := sub.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	sub.Close()
	m := readFlowWire(t, wire)
	if m.Notification.Method != "unsubscribe" {
		t.Fatal("close must unsubscribe, not credit unread data")
	}
	d.Release()
	c.flow.mu.Lock()
	if c.flow.channels[uri] != nil || len(c.flow.order) != 0 {
		t.Fatal("closed subscription remained in scheduler")
	}
	c.flow.mu.Unlock()
	select {
	case text := <-wire.sent:
		t.Fatalf("closed owner sent %s", text)
	case <-time.After(15 * time.Millisecond):
	}
}

func TestFlowReconnectRecoveryKindsAndDropped(t *testing.T) {
	for _, kind := range []ahptypes.ChannelRecoveryKind{ahptypes.ChannelRecoveryKindSnapshot, ahptypes.ChannelRecoveryKindReplay, ahptypes.ChannelRecoveryKindLive} {
		t.Run(string(kind), func(t *testing.T) {
			c, wire, ctx := flowTestClient(t, DefaultConfig())
			uri := "ahp-terminal:/kept"
			sub := subscribeFlow(t, c, wire, ctx, uri, SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(512, 1024))
			dropped := subscribeFlow(t, c, wire, ctx, "ahp-terminal:/dropped", SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(512, 1024))
			initialFlowSnapshot(wire, uri, 7)
			old, err := sub.Next(ctx)
			if err != nil {
				t.Fatal(err)
			}
			done := make(chan error, 1)
			seq := int64(7)
			go func() {
				_, err := c.ReconnectWithParams(ctx, ahptypes.ReconnectParams{ClientId: "client", Subscriptions: []string{uri, dropped.URI()}, Windows: &ahptypes.ChannelDeliveryResumeOptions{Items: []ahptypes.ChannelDeliveryResumeParams{
					{Channel: uri, FlowControl: ahptypes.SubscriptionFlowControlOptions{Receive: ahptypes.ChannelReceiveLimits{WindowBytes: 512, MaximumFrameBytes: 1024}}, LastAppliedServerSeq: &seq},
					{Channel: dropped.URI(), FlowControl: ahptypes.SubscriptionFlowControlOptions{Receive: ahptypes.ChannelReceiveLimits{WindowBytes: 512, MaximumFrameBytes: 1024}}},
				}}})
				done <- err
			}()
			request := readFlowWire(t, wire)
			hostFlowReply(t, wire, request, map[string]any{"type": "snapshot", "snapshots": []any{}, "windows": map[string]any{"items": []ahptypes.ResumedChannelSubscription{{Channel: uri, FlowControl: *acceptedFlow(512, 1024), Recovery: kind}}}})
			if kind == ahptypes.ChannelRecoveryKindSnapshot {
				initialFlowSnapshot(wire, uri, 8)
			} else {
				hostFlowNotification(wire, "app/data", map[string]any{"channel": uri, "text": "new"})
			}
			if err := <-done; err != nil {
				t.Fatal(err)
			}
			old.Release()
			fresh, err := sub.Next(ctx)
			if err != nil {
				t.Fatal(err)
			}
			fresh.Release()
			m := readFlowWire(t, wire)
			var credit ahptypes.ChannelCreditParams
			_ = json.Unmarshal(m.Notification.Params, &credit)
			if credit.ConsumedBytes != fresh.WireBytes() {
				t.Fatal("old epoch credited on new connection")
			}
			if !errors.Is(dropped.Err(), ErrSubscriptionDropped) {
				t.Fatal("missing reconnect window not dropped")
			}
		})
	}
}

func TestFlowTCPNeverInitialOrResumed(t *testing.T) {
	c, _, ctx := flowTestClient(t, DefaultConfig())
	if _, err := c.Initialize(ctx, "client", ahptypes.SupportedProtocolVersions(), []string{"ahp-tcp:/t"}); err == nil {
		t.Fatal("TCP initial subscription accepted")
	}
	if _, err := c.ReconnectWithParams(ctx, ahptypes.ReconnectParams{ClientId: "client", Subscriptions: []string{"ahp-tcp:/t"}, Windows: &ahptypes.ChannelDeliveryResumeOptions{}}); err == nil {
		t.Fatal("TCP resume accepted")
	}
}

func TestFlowConcurrentNextCancellationAndAutoAdvance(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	s := subscribeFlow(t, c, wire, ctx, "ahp-terminal:/t", SubscribeOptions{Window: &WindowOptions{}}, acceptedFlow(512, 1024))
	initialFlowSnapshot(wire, s.URI(), 0)
	d, err := s.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := s.Next(canceled); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if !d.released.Load() {
		t.Fatal("canceled next did not auto-release")
	}
	waiting, stop := context.WithCancel(ctx)
	defer stop()
	done := make(chan error, 1)
	go func() { _, err := s.Next(waiting); done <- err }()
	deadline, finish := context.WithTimeout(ctx, 15*time.Millisecond)
	defer finish()
	if _, err := s.Next(deadline); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("concurrent next ignored cancellation", err)
	}
	stop()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestFlowTCPResetDiscardsUnreadDataAndStopsSends(t *testing.T) {
	c, wire, ctx := flowTestClient(t, DefaultConfig())
	s := subscribeFlow(t, c, wire, ctx, "ahp-tcp:/t", SubscribeOptions{Window: &WindowOptions{Receive: ReceiveManual}}, acceptedFlow(1024, 1024))
	initialFlowSnapshot(wire, s.URI(), 0)
	snapshot, err := s.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Release()
	_ = readFlowWire(t, wire)
	hostFlowNotification(wire, "tcp/data", ahptypes.TcpDataParams{Channel: s.URI(), Data: "aGVsbG8="})
	hostFlowNotification(wire, "tcp/reset", ahptypes.TcpResetParams{Channel: s.URI()})
	waitFlow(t, func() bool { c.flow.mu.Lock(); defer c.flow.mu.Unlock(); return c.flow.channels[s.URI()].reset })
	d, err := s.Next(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := d.Event().(SubscriptionEventTCPReset); !ok {
		t.Fatal("reset left unread TCP data ahead of it")
	}
	if err := c.Notify(ctx, "tcp/data", ahptypes.TcpDataParams{Channel: s.URI(), Data: "eA=="}); !errors.Is(err, ErrClosed) {
		t.Fatal("send after reset accepted", err)
	}
}

func TestFlowCreditSchedulingIsFair(t *testing.T) {
	e := &flowEngine{cfg: WindowingConfig{MaxBufferedSendBytes: 1 << 20}, channels: make(map[string]*channelFlow), order: []string{"a", "b"}}
	for _, uri := range e.order {
		e.channels[uri] = &channelFlow{channel: uri, limits: acceptedFlow(512, 1024), released: 200, creditReady: true}
	}
	first, err := e.nextCredit()
	if err != nil {
		t.Fatal(err)
	}
	var n ahptypes.JsonRpcNotification
	_ = json.Unmarshal([]byte(first.wire.text), &n)
	if channel, _ := notificationChannel(n); channel != "a" {
		t.Fatal(channel)
	}
	e.channels["a"].released += 200
	e.channels["a"].creditReady = true
	second, err := e.nextCredit()
	if err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal([]byte(second.wire.text), &n)
	if channel, _ := notificationChannel(n); channel != "b" {
		t.Fatal("busy channel starved another channel's credit")
	}
}
