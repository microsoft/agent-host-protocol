package ahp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

type sendPart struct {
	n     ahptypes.JsonRpcNotification
	ctx   context.Context
	done  chan error
	bytes int64
}
type flowSend struct {
	n             ahptypes.JsonRpcNotification
	text          string
	offset        int
	remaining     int64
	parts         []*sendPart
	started       bool
	retainedBytes int64
}
type flowWrite struct {
	wire        TransportMessage
	message     *flowSend
	final       bool
	creditFlow  *channelFlow
	epoch       uint64
	controlDone chan error
}

func encodeNotification(n ahptypes.JsonRpcNotification) (string, error) {
	b, err := json.Marshal(n)
	return string(b), err
}

func (e *flowEngine) send(ctx context.Context, msg ahptypes.JsonRpcMessage) (bool, error) {
	if msg.Notification == nil {
		return false, nil
	}
	n := *msg.Notification
	channel, err := notificationChannel(n)
	if err != nil {
		return false, nil
	}
	e.mu.Lock()
	f := e.channels[channel]
	if f != nil && n.Method == "unsubscribe" {
		e.retireLocked(f, ErrClosed, false)
		e.mu.Unlock()
		return false, nil
	}
	if f != nil && f.dropped && ahptypes.CountsAgainstWindow(n.Method) {
		e.mu.Unlock()
		return true, ErrSubscriptionDropped
	}
	if f != nil && f.reset && ahptypes.CountsAgainstWindow(n.Method) {
		e.mu.Unlock()
		return true, ErrClosed
	}
	if f == nil || (f.limits == nil && len(f.queue) == 0) || !ahptypes.CountsAgainstWindow(n.Method) {
		if f != nil && (n.Method == "tcp/reset" || n.Method == "unsubscribe") {
			e.failQueueLocked(f, ErrClosed)
			if n.Method == "tcp/reset" {
				f.reset = true
				e.emitLocked(f, "")
			}
		}
		e.mu.Unlock()
		return false, nil
	}
	if e.stopped {
		e.mu.Unlock()
		return true, ErrShutdown
	}
	text, err := encodeNotification(n)
	if err != nil {
		e.mu.Unlock()
		return true, err
	}
	size := utf16Bytes(text)
	queued := len(f.queue) > 0
	if queued && (size > e.cfg.MaxBufferedSendBytes || f.retainedSendBytes > e.cfg.MaxBufferedSendBytes-size) {
		e.mu.Unlock()
		return true, ErrBackpressure
	}
	part := &sendPart{n: n, ctx: ctx, done: make(chan error, 1), bytes: size}
	var merged *flowSend
	if coalescingEnabled(f.opts) && len(f.queue) > 0 {
		last := f.queue[len(f.queue)-1]
		if !last.started {
			if combined, ok := e.coalesce(last.n, n, CoalesceSend, f); ok {
				combinedText, err := encodeNotification(combined)
				if err != nil {
					e.mu.Unlock()
					return true, err
				}
				combinedSize := utf16Bytes(combinedText)
				if f.buffered-last.remaining+combinedSize <= e.cfg.MaxBufferedSendBytes {
					f.buffered += combinedSize - last.remaining
					last.n, last.text, last.remaining = combined, combinedText, combinedSize
					last.parts = append(last.parts, part)
					last.retainedBytes += part.bytes
					f.retainedSendBytes += part.bytes
					merged = last
					e.emitLocked(f, "coalesced")
				}
			}
		}
	}
	if merged == nil {
		if queued && (size > e.cfg.MaxBufferedSendBytes || f.buffered > e.cfg.MaxBufferedSendBytes-size) {
			e.mu.Unlock()
			return true, ErrBackpressure
		}
		f.queue = append(f.queue, &flowSend{n: n, text: text, remaining: size, parts: []*sendPart{part}, retainedBytes: part.bytes})
		f.buffered += size
		f.retainedSendBytes += part.bytes
	}
	e.emitLocked(f, "")
	e.mu.Unlock()
	e.signal()
	select {
	case err := <-part.done:
		return true, err
	case <-ctx.Done():
		e.signal()
		return true, ctx.Err()
	case <-e.c.done:
		return true, ErrShutdown
	}
}

func (e *flowEngine) failQueueLocked(f *channelFlow, err error) {
	for _, m := range f.queue {
		for _, p := range m.parts {
			select {
			case p.done <- err:
			default:
			}
		}
	}
	f.queue = nil
	f.buffered = 0
	f.retainedSendBytes = 0
}

func (e *flowEngine) pruneLocked(f *channelFlow) {
	for len(f.queue) > 0 {
		m := f.queue[0]
		if m.started {
			return
		}
		live := make([]*sendPart, 0, len(m.parts))
		for _, p := range m.parts {
			if err := p.ctx.Err(); err != nil {
				select {
				case p.done <- err:
				default:
				}
			} else {
				live = append(live, p)
			}
		}
		if len(live) == len(m.parts) {
			return
		}
		f.retainedSendBytes -= m.retainedBytes
		f.buffered -= m.remaining
		if len(live) == 0 {
			f.queue = f.queue[1:]
			e.emitLocked(f, "")
			continue
		}
		n := live[0].n
		for _, p := range live[1:] {
			combined, ok := e.coalesce(n, p.n, CoalesceSend, f)
			if ok {
				n = combined
			} else {
				// A canceled middle item can invalidate a custom merge. Restore
				// separate sends rather than drop or alter the survivors.
				replacement := make([]*flowSend, 0, len(live))
				for _, part := range live {
					text, _ := encodeNotification(part.n)
					size := utf16Bytes(text)
					replacement = append(replacement, &flowSend{n: part.n, text: text, remaining: size, parts: []*sendPart{part}, retainedBytes: part.bytes})
					f.buffered += size
					f.retainedSendBytes += part.bytes
				}
				f.queue = append(replacement, f.queue[1:]...)
				e.emitLocked(f, "")
				return
			}
		}
		text, _ := encodeNotification(n)
		m.n, m.text, m.parts, m.remaining = n, text, live, utf16Bytes(text)
		m.retainedBytes = 0
		for _, part := range live {
			m.retainedBytes += part.bytes
		}
		f.retainedSendBytes += m.retainedBytes
		f.buffered += m.remaining
		e.emitLocked(f, "")
		return
	}
}

func frameText(channel, data string, final bool) (string, error) {
	p := ahptypes.ChannelFrameParams{Channel: channel, Data: data}
	if final {
		p.Final = &final
	}
	raw, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	return encodeNotification(ahptypes.JsonRpcNotification{JsonRpc: ahptypes.JsonRpcV2, Method: "channel/frame", Params: raw})
}

func fragmentText(channel, text string, maximum, remaining int64) (string, int, error) {
	if text == "" {
		return "", 0, fmt.Errorf("ahp: empty fragment")
	}
	_, first := utf8.DecodeRuneInString(text)
	smallest, err := frameText(channel, text[:first], first == len(text))
	if err != nil {
		return "", 0, err
	}
	minimum := utf16Bytes(smallest)
	if minimum > maximum {
		return "", 0, fmt.Errorf("ahp: channel/frame cannot carry a character within maximumFrameBytes")
	}
	target := remaining
	if target < minimum {
		target = minimum
	}
	if target > maximum {
		target = maximum
	}
	boundaries := []int{0}
	var prefixBytes int64
	for i, r := range text {
		if r > 0xffff {
			prefixBytes += 4
		} else {
			prefixBytes += 2
		}
		if prefixBytes > target {
			break
		}
		boundaries = append(boundaries, i+utf8.RuneLen(r))
	}
	low, high := 1, len(boundaries)-1
	best := 1
	for low <= high {
		mid := low + (high-low)/2
		frame, err := frameText(channel, text[:boundaries[mid]], boundaries[mid] == len(text))
		if err != nil {
			return "", 0, err
		}
		if utf16Bytes(frame) <= target {
			best = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}
	frame, err := frameText(channel, text[:boundaries[best]], boundaries[best] == len(text))
	return frame, boundaries[best], err
}

func (e *flowEngine) nextCredit() (*flowWrite, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for i := 0; i < len(e.order); i++ {
		index := (e.creditCursor + i) % len(e.order)
		uri := e.order[index]
		f := e.channels[uri]
		if f == nil || !f.creditReady || f.limits == nil || f.released <= f.advertised {
			continue
		}
		if f.owner != nil && f.owner.owner.isFinal() {
			continue
		}
		raw, err := json.Marshal(ahptypes.ChannelCreditParams{Channel: uri, ConsumedBytes: f.released})
		if err != nil {
			return nil, err
		}
		text, err := encodeNotification(ahptypes.JsonRpcNotification{JsonRpc: ahptypes.JsonRpcV2, Method: "channel/credit", Params: raw})
		if err != nil {
			return nil, err
		}
		f.creditReady = false
		f.advertised = f.released
		if f.creditTimer != nil {
			f.creditTimer.Stop()
			f.creditTimer = nil
		}
		e.emitLocked(f, "creditSent")
		e.creditCursor = (index + 1) % len(e.order)
		return &flowWrite{wire: NewTextMessage(text), creditFlow: f, epoch: f.epoch}, nil
	}
	return nil, nil
}

func (e *flowEngine) nextData() (*flowWrite, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for i := 0; i < len(e.order); i++ {
		index := (e.cursor + i) % len(e.order)
		f := e.channels[e.order[index]]
		if f == nil {
			continue
		}
		e.pruneLocked(f)
		if len(f.queue) == 0 {
			continue
		}
		if f.limits != nil && f.sent-f.consumed >= f.limits.HostReceive.WindowBytes {
			continue
		}
		m := f.queue[0]
		text := m.text[m.offset:]
		count := len(text)
		final := true
		if f.limits != nil && (m.offset > 0 || m.remaining > f.limits.HostReceive.MaximumFrameBytes) {
			var err error
			text, count, err = fragmentText(f.channel, text, f.limits.HostReceive.MaximumFrameBytes, f.limits.HostReceive.WindowBytes-(f.sent-f.consumed))
			if err != nil {
				return nil, err
			}
			final = m.offset+count == len(m.text)
		}
		cost := utf16Bytes(text)
		if f.sent > maxWindowInteger-cost {
			return nil, fmt.Errorf("ahp: sent counter overflow")
		}
		m.started = true
		if f.limits != nil {
			f.sent += cost
		}
		consumed := utf16Bytes(m.text[m.offset : m.offset+count])
		m.offset += count
		m.remaining -= consumed
		f.buffered -= consumed
		if final {
			f.queue = f.queue[1:]
			f.retainedSendBytes -= m.retainedBytes
		}
		e.cursor = (index + 1) % len(e.order)
		kind := ""
		if final && m.text != text {
			kind = "fragmentedMessageSent"
		}
		e.emitLocked(f, kind)
		return &flowWrite{wire: NewTextMessage(text), message: m, final: final}, nil
	}
	return nil, nil
}

func (e *flowEngine) write(w *flowWrite) bool {
	if w.creditFlow != nil {
		e.mu.Lock()
		live := e.channels[w.creditFlow.channel] == w.creditFlow && w.creditFlow.epoch == w.epoch && !w.creditFlow.dropped && (w.creditFlow.owner == nil || !w.creditFlow.owner.owner.isFinal())
		e.mu.Unlock()
		if !live {
			return true
		}
	}
	ctx, cancel := contextWithDone(context.Background(), e.c.done)
	if w.message == nil && e.waitControl(ctx) != nil {
		cancel()
		return false
	}
	err := e.c.transport.Send(ctx, w.wire)
	cancel()
	if w.controlDone != nil {
		w.controlDone <- err
	}
	if w.message != nil && (w.final || err != nil) {
		for _, p := range w.message.parts {
			select {
			case p.done <- err:
			default:
			}
		}
	}
	if err != nil {
		e.c.shutdownWithError(fmt.Errorf("ahp: transport send: %w", err))
		return false
	}
	return true
}

func (e *flowEngine) writeOrdinary(msg outboundMsg) bool {
	for {
		cleanup, err := e.nextCleanup()
		if err != nil {
			e.c.shutdownWithError(err)
			return false
		}
		if cleanup == nil {
			break
		}
		if !e.write(cleanup) {
			return false
		}
	}
	if msg.hooks != nil && !e.beginRequest(msg.hooks) {
		if msg.done != nil {
			msg.done <- msg.hooks.err
		}
		return true
	}
	wire, err := EncodeMessage(msg.msg)
	if err != nil {
		if msg.done != nil {
			msg.done <- err
		}
		return true
	}
	control := msg.msg.Notification != nil && !ahptypes.CountsAgainstWindow(msg.msg.Notification.Method) && e.hasWindows()
	if control && utf16Bytes(wire.text) > 1<<20 {
		if msg.done != nil {
			msg.done <- ErrBackpressure
		}
		return true
	}
	ctx, cancel := contextWithDone(context.Background(), e.c.done)
	if control {
		if err := e.waitControl(ctx); err != nil {
			cancel()
			if msg.done != nil {
				msg.done <- err
			}
			return true
		}
	}
	err = e.c.transport.Send(ctx, wire)
	cancel()
	if msg.done != nil {
		msg.done <- err
	}

	if err != nil {
		e.c.shutdownWithError(fmt.Errorf("ahp: transport send: %w", err))
		return false
	}
	return true
}

// Only the writer touches this token bucket. Control traffic has a bounded
// burst and rate independently of data windows; credits stay cumulative.
func (e *flowEngine) waitControl(ctx context.Context) error {
	for {
		now := time.Now()
		e.controlTokens += now.Sub(e.controlAt).Seconds() * 1000
		e.controlAt = now
		if e.controlTokens > 32 {
			e.controlTokens = 32
		}
		if e.controlTokens >= 1 {
			e.controlTokens--
			return nil
		}
		timer := time.NewTimer(time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func (e *flowEngine) runWriter() {
	defer e.c.wg.Done()
	controlBurst := 0
	for {
		select {
		case <-e.c.done:
			return
		default:
		}
		if controlBurst < 8 {
			cleanup, err := e.nextCleanup()
			if err != nil {
				e.c.shutdownWithError(err)
				return
			}
			if cleanup != nil {
				if !e.write(cleanup) {
					return
				}
				controlBurst++
				continue
			}
			w, err := e.nextCredit()
			if err != nil {
				e.c.shutdownWithError(&TransportError{Kind: "protocol", Err: err})
				return
			}
			if w != nil {
				if !e.write(w) {
					return
				}
				controlBurst++
				continue
			}
			select {
			case msg := <-e.c.outbound:
				if !e.writeOrdinary(msg) {
					return
				}
				controlBurst++
				continue
			default:
			}
		}
		w, err := e.nextData()
		if err != nil {
			e.c.shutdownWithError(&TransportError{Kind: "protocol", Err: err})
			return
		}
		controlBurst = 0
		if w != nil {
			if !e.write(w) {
				return
			}
			continue
		}
		select {
		case <-e.c.done:
			return
		case msg := <-e.c.outbound:
			if !e.writeOrdinary(msg) {
				return
			}
		case <-e.wake:
		}
	}
}
