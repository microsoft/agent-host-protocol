package ahp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

type corpusTransport struct {
	in      chan TransportMessage
	sent    chan string
	done    chan struct{}
	once    sync.Once
	capable bool
}

func newCorpusTransport() *corpusTransport {
	return &corpusTransport{in: make(chan TransportMessage, 128), sent: make(chan string, 128), done: make(chan struct{}), capable: true}
}
func (t *corpusTransport) Send(ctx context.Context, m TransportMessage) error {
	b, _, err := m.Bytes()
	if err != nil {
		return err
	}
	select {
	case t.sent <- string(b):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-t.done:
		return ErrClosed
	}
}
func (t *corpusTransport) Recv(ctx context.Context) (TransportMessage, error) {
	select {
	case m := <-t.in:
		return m, nil
	case <-ctx.Done():
		return TransportMessage{}, ctx.Err()
	case <-t.done:
		return TransportMessage{}, ErrClosed
	}
}
func (t *corpusTransport) Close(context.Context) error {
	t.once.Do(func() { close(t.done) })
	return nil
}
func (t *corpusTransport) TransportCapabilities() TransportCapabilities {
	return TransportCapabilities{SupportsWindowedDelivery: t.capable, MaximumFrameBytes: 16384}
}

func corpusDir(t *testing.T) string {
	return filepath.Join(findFixtureDir(t), "..", "windowed-delivery")
}
func TestWindowedDeliverySizes(t *testing.T) {
	data, err := os.ReadFile(filepath.Join(corpusDir(t), "sizes.json"))
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []struct {
			Name, Text string
			UTF16Bytes int64 `json:"utf16Bytes"`
			UTF8Bytes  int   `json:"utf8Bytes"`
		}
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) == 0 {
		t.Fatal("empty size corpus")
	}
	for _, c := range corpus.Cases {
		t.Run(c.Name, func(t *testing.T) {
			if got := utf16Bytes(c.Text); got != c.UTF16Bytes {
				t.Fatalf("size %d, want %d", got, c.UTF16Bytes)
			}
			if len(c.Text) != c.UTF8Bytes {
				t.Fatal("UTF-8 size mismatch")
			}
		})
	}
}

type corpusStep struct {
	Op          string
	Channel     string
	Window      *WindowOptions
	Receive     string
	Coalescing  *bool
	To          string
	Result      json.RawMessage
	Text        string
	Match       any
	Expect      any
	Absent      []string
	Reassemble  bool
	WithinMs    int
	ExpectBytes *int64
	Index       int
	Method      string
	Params      json.RawMessage
}
type corpusRecord struct {
	text     string
	object   map[string]any
	answered bool
}
type corpusSubscription struct {
	ready chan struct{}
	sub   *Subscription
	err   error
}
type corpusDriver struct {
	t          *testing.T
	ctx        context.Context
	client     *Client
	transport  *corpusTransport
	pending    []*corpusRecord
	history    []*corpusRecord
	subs       map[string]*corpusSubscription
	deliveries map[string][]*Delivery
}

func partialMatch(actual, expected any) bool {
	if object, ok := expected.(map[string]any); ok {
		got, ok := actual.(map[string]any)
		if !ok {
			return false
		}
		for k, v := range object {
			if !partialMatch(got[k], v) {
				return false
			}
		}
		return true
	}
	return reflect.DeepEqual(actual, expected)
}
func jsonObject(value any) map[string]any {
	b, _ := json.Marshal(value)
	var out map[string]any
	_ = json.Unmarshal(b, &out)
	return out
}
func (d *corpusDriver) record(text string) *corpusRecord {
	var object map[string]any
	if err := json.Unmarshal([]byte(text), &object); err != nil {
		d.t.Fatal(err)
	}
	r := &corpusRecord{text: text, object: object}
	d.history = append(d.history, r)
	return r
}
func (d *corpusDriver) take(ctx context.Context) *corpusRecord {
	if len(d.pending) > 0 {
		r := d.pending[0]
		d.pending = d.pending[1:]
		return r
	}
	select {
	case text := <-d.transport.sent:
		return d.record(text)
	case <-ctx.Done():
		d.t.Fatalf("waiting for sent message: %v (client error %v)", ctx.Err(), d.client.Err())
		return nil
	}
}
func (d *corpusDriver) subscription(uri string) *Subscription {
	d.t.Helper()
	s := d.subs[uri]
	if s == nil {
		d.t.Fatalf("no subscription %s", uri)
	}
	select {
	case <-s.ready:
		if s.err != nil {
			d.t.Fatal(s.err)
		}
		return s.sub
	case <-time.After(time.Second):
		d.t.Fatalf("subscribe did not complete: %v", d.client.Err())
		return nil
	}
}
func (d *corpusDriver) inject(text string) {
	select {
	case d.transport.in <- NewTextMessage(text):
	case <-d.ctx.Done():
		d.t.Fatal(d.ctx.Err())
	}
}
func (d *corpusDriver) expectSent(s corpusStep) {
	ctx, cancel := context.WithTimeout(d.ctx, time.Second)
	defer cancel()
	var joined strings.Builder
	for {
		r := d.take(ctx)
		method, _ := r.object["method"].(string)
		if s.Reassemble && method == "channel/frame" {
			params := r.object["params"].(map[string]any)
			channel := params["channel"].(string)
			status := d.subscription(channel).FlowControl()
			if utf16Bytes(r.text) > status.Limits.HostReceive.MaximumFrameBytes {
				d.t.Fatal("oversized outgoing fragment")
			}
			joined.WriteString(params["data"].(string))
			if params["final"] != true {
				continue
			}
			var message any
			if err := json.Unmarshal([]byte(joined.String()), &message); err != nil {
				d.t.Fatal(err)
			}
			if !partialMatch(message, s.Match) {
				d.t.Fatalf("reassembled mismatch: %v != %v", message, s.Match)
			}
			return
		}
		if partialMatch(r.object, s.Match) {
			for _, path := range s.Absent {
				var cur any = r.object
				for _, key := range strings.Split(path, ".") {
					m, ok := cur.(map[string]any)
					if !ok {
						cur = nil
						break
					}
					cur = m[key]
				}
				if cur != nil {
					d.t.Fatalf("unexpected field %s", path)
				}
			}
			return
		}
		if method == "channel/credit" {
			continue
		}
		d.t.Fatalf("unexpected sent message %s; want %v", r.text, s.Match)
	}
}
func (d *corpusDriver) step(s corpusStep) {
	d.t.Helper()
	switch s.Op {
	case "subscribe":
		opts := SubscribeOptions{Window: s.Window}
		if opts.Window != nil {
			opts.Window.Coalescing = s.Coalescing
			if s.Receive == "manual" {
				opts.Window.Receive = ReceiveManual
			}
		}
		old := d.subs[s.Channel]
		state := &corpusSubscription{ready: make(chan struct{})}
		d.subs[s.Channel] = state
		go func() {
			if old != nil {
				<-old.ready
				state.sub = old.sub
				if old.err != nil {
					state.err = old.err
				} else {
					_, state.err = old.sub.Update(d.ctx, opts)
				}
			} else {
				_, state.sub, state.err = d.client.SubscribeWithOptions(d.ctx, s.Channel, opts)
			}
			close(state.ready)
		}()
	case "respond":
		var request *corpusRecord
		for _, r := range d.history {
			if r.object["method"] == s.To && r.object["id"] != nil && !r.answered {
				request = r
				break
			}
		}
		if request == nil {
			d.t.Fatalf("no unanswered %s", s.To)
		}
		request.answered = true
		b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": request.object["id"], "result": s.Result})
		d.inject(string(b))
	case "unsubscribe":
		if err := d.client.Unsubscribe(d.ctx, s.Channel); err != nil {
			d.t.Fatal(err)
		}
		delete(d.subs, s.Channel)
	case "hostSends":
		d.inject(s.Text)
	case "expectSent":
		d.expectSent(s)
	case "expectNotSent":
		for _, r := range d.pending {
			if partialMatch(r.object, s.Match) {
				d.t.Fatalf("already sent %s", r.text)
			}
		}
		timer := time.NewTimer(time.Duration(s.WithinMs) * time.Millisecond)
		defer timer.Stop()
		for {
			select {
			case text := <-d.transport.sent:
				r := d.record(text)
				d.pending = append(d.pending, r)
				if partialMatch(r.object, s.Match) {
					d.t.Fatalf("unexpected send %s", text)
				}
			case <-timer.C:
				return
			}
		}
	case "next":
		ctx, cancel := context.WithTimeout(d.ctx, time.Second)
		defer cancel()
		item, err := d.subscription(s.Channel).Next(ctx)
		if err != nil {
			d.t.Fatal(err)
		}
		if !partialMatch(jsonObject(item.Notification()), s.Expect) {
			d.t.Fatalf("delivery %s, want %v", mustJSON(item.Notification()), s.Expect)
		}
		if s.ExpectBytes != nil && item.WireBytes() != *s.ExpectBytes {
			d.t.Fatalf("delivery bytes %d, want %d", item.WireBytes(), *s.ExpectBytes)
		}
		d.deliveries[s.Channel] = append(d.deliveries[s.Channel], item)
	case "advance":
		items := d.deliveries[s.Channel]
		if len(items) == 0 {
			d.t.Fatal("no previous delivery")
		}
		items[len(items)-1].Release()
	case "release":
		d.deliveries[s.Channel][s.Index].Release()
	case "send":
		d.subscription(s.Channel)
		ctx, cancel := context.WithCancel(d.ctx)
		d.t.Cleanup(cancel)
		done := make(chan error, 1)
		go func() { done <- d.client.Notify(ctx, s.Method, s.Params) }()
		// Ensure sequential scenario sends are admitted in the scripted order.
		deadline := time.Now().Add(time.Second)
		for {
			select {
			case err := <-done:
				if err != nil {
					d.t.Fatal(err)
				}
				return
			default:
			}
			d.client.flow.mu.Lock()
			admitted := false
			if f := d.client.flow.channels[s.Channel]; f != nil {
				for _, m := range f.queue {
					for _, p := range m.parts {
						if p.ctx == ctx {
							admitted = true
						}
					}
				}
			}
			d.client.flow.mu.Unlock()
			if admitted {
				return
			}
			if time.Now().After(deadline) {
				d.t.Fatal("send not admitted")
			}
			time.Sleep(time.Millisecond)
		}
	case "hostCreditsAll":
		for {
			select {
			case text := <-d.transport.sent:
				r := d.record(text)
				d.pending = append(d.pending, r)
			default:
				goto drained
			}
		}
	drained:
		var total int64
		for _, r := range d.history {
			method, _ := r.object["method"].(string)
			params, _ := r.object["params"].(map[string]any)
			if r.object["id"] == nil && params["channel"] == s.Channel && ahptypes.CountsAgainstWindow(method) {
				total += utf16Bytes(r.text)
			}
		}
		b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "method": "channel/credit", "params": map[string]any{"channel": s.Channel, "consumedBytes": total}})
		d.inject(string(b))
	case "expectStatus":
		sub := d.subscription(s.Channel)
		deadline := time.Now().Add(time.Second)
		for {
			if partialMatch(jsonObject(sub.FlowControl()), s.Match) {
				return
			}
			if time.Now().After(deadline) {
				d.t.Fatalf("status %s, want %v", mustJSON(sub.FlowControl()), s.Match)
			}
			time.Sleep(time.Millisecond)
		}
	case "expectClosed":
		select {
		case <-d.client.Done():
			if d.client.Err() == nil {
				d.t.Fatal("missing protocol error")
			}
		case <-time.After(time.Second):
			d.t.Fatal("connection did not close")
		}
	default:
		d.t.Fatalf("unsupported corpus step %s", s.Op)
	}
}
func mustJSON(v any) string { b, _ := json.Marshal(v); return string(b) }

func TestWindowedDeliveryCorpus(t *testing.T) {
	files, err := filepath.Glob(filepath.Join(corpusDir(t), "scenarios", "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("empty windowed delivery scenario corpus")
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var scenario struct {
				Windowing WindowingConfig
				Steps     []corpusStep
			}
			if err := json.Unmarshal(data, &scenario); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			transport := newCorpusTransport()
			cfg := DefaultConfig()
			cfg.Windowing = scenario.Windowing
			client, err := Connect(ctx, transport, cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer client.Shutdown(context.Background())
			d := &corpusDriver{t: t, ctx: ctx, client: client, transport: transport, subs: make(map[string]*corpusSubscription), deliveries: make(map[string][]*Delivery)}
			for i, s := range scenario.Steps {
				t.Logf("step %d: %s", i, s.Op)
				d.step(s)
			}
		})
	}
}
