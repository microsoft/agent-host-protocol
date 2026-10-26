// Package demohost is a small in-memory AHP host for the windowing examples.
//
// It implements only what the examples need: `initialize`, a windowed
// `subscribe` to one terminal, and the host side of the window rules:
//
//   - It counts every data message it sends, in UTF-16 bytes, and stops while
//     `sent - consumed` is at or above the client's window.
//   - It counts every data message the client sends, and returns
//     `channel/credit` after it has processed each one.
//
// A real host applies the same rules to every windowed subscription.
package demohost

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// Options configures a [Host].
type Options struct {
	// ClientWindowBytes is the largest window the host accepts for data that it sends.
	ClientWindowBytes int64
	// HostWindowBytes is the window the host offers for data that the client sends.
	HostWindowBytes int64
	// InputDelay is how long the host takes to process one message from the client.
	InputDelay time.Duration
}

const maximumFrameBytes = 16_384

// ErrClosed is returned by [Host.SendAction] after [Host.Close].
var ErrClosed = errors.New("demohost: closed")

// Host is an in-memory AHP host that follows the window rules.
type Host struct {
	opts       Options
	client     *pipe
	transport  *pipe
	subscribed chan struct{}
	done       chan struct{}
	closeOnce  sync.Once

	mu        sync.Mutex
	limits    *ahptypes.ChannelFlowControl
	channel   string
	serverSeq int64

	// Data that the host sends to the client.
	sentBytes     int64
	consumedBytes int64
	credit        chan struct{} // closed and replaced when consumedBytes grows

	// Data that the client sends to the host.
	receivedBytes  int64
	processedBytes int64
	inputTail      chan struct{} // closed when the previous input has been processed
	receivedInput  strings.Builder
}

// New starts a host. Give [Host.ClientTransport] to [ahp.Connect].
func New(opts Options) *Host {
	client, transport := newPipe()
	idle := make(chan struct{})
	close(idle)
	h := &Host{
		opts:       opts,
		client:     client,
		transport:  transport,
		subscribed: make(chan struct{}),
		done:       make(chan struct{}),
		credit:     make(chan struct{}),
		inputTail:  idle,
	}
	go h.run()
	return h
}

// ClientTransport returns the half of the transport to give to the client.
func (h *Host) ClientTransport() ahp.Transport { return h.client }

// Subscribed is closed after the host has accepted the subscription and sent the snapshot.
func (h *Host) Subscribed() <-chan struct{} { return h.subscribed }

// ReceivedInput returns the terminal input that the host has processed, in order.
func (h *Host) ReceivedInput() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.receivedInput.String()
}

// SendAction sends one terminal action, first waiting for credit if the
// client's window is full. Call it after [Host.Subscribed] is closed.
func (h *Host) SendAction(ctx context.Context, action ahptypes.StateAction) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.limits == nil {
		return errors.New("demohost: not subscribed")
	}
	window := h.limits.ClientReceive.WindowBytes
	if h.sentBytes-h.consumedBytes >= window {
		logf("window full (%d of %d bytes outstanding); pausing output", h.sentBytes-h.consumedBytes, window)
		for h.sentBytes-h.consumedBytes >= window {
			credit := h.credit
			h.mu.Unlock()
			select {
			case <-credit:
				h.mu.Lock()
			case <-ctx.Done():
				h.mu.Lock()
				return ctx.Err()
			case <-h.done:
				h.mu.Lock()
				return ErrClosed
			}
		}
		logf("credit received (consumedBytes=%d); resuming output", h.consumedBytes)
	}
	h.serverSeq++
	h.sendDataLocked(notification{
		JsonRpc: ahptypes.JsonRpcV2,
		Method:  "action",
		Params: actionEnvelope{
			Channel: h.channel,
			// Encode the variant directly: the union's MarshalJSON would escape
			// characters such as '>' that a JavaScript host sends as-is.
			Action:    json.RawMessage(encode(action.Value)),
			ServerSeq: h.serverSeq,
		},
	})
	return nil
}

// Close closes the connection to the client.
func (h *Host) Close() {
	h.closeOnce.Do(func() {
		close(h.done)
		_ = h.transport.Close(context.Background())
	})
}

type notification struct {
	JsonRpc ahptypes.JsonRpcVersion `json:"jsonrpc"`
	Method  string                  `json:"method"`
	Params  any                     `json:"params"`
}

// actionEnvelope has the same fields, in the same order, as [ahptypes.ActionEnvelope].
type actionEnvelope struct {
	Channel   string          `json:"channel"`
	Action    json.RawMessage `json:"action"`
	ServerSeq int64           `json:"serverSeq"`
}

type response struct {
	JsonRpc ahptypes.JsonRpcVersion `json:"jsonrpc"`
	ID      uint64                  `json:"id"`
	Result  any                     `json:"result"`
}

func (h *Host) sendDataLocked(message any) {
	text := encode(message)
	h.sentBytes += utf16Bytes(text)
	_ = h.transport.Send(context.Background(), ahp.NewTextMessage(text))
}

func (h *Host) sendControl(message any) {
	_ = h.transport.Send(context.Background(), ahp.NewTextMessage(encode(message)))
}

func (h *Host) run() {
	for {
		frame, err := h.transport.Recv(context.Background())
		if err != nil {
			return
		}
		text, ok := frame.RawJSONText()
		if !ok {
			continue
		}
		var message ahptypes.JsonRpcMessage
		if err := json.Unmarshal([]byte(text), &message); err != nil {
			continue
		}
		switch {
		case message.Request != nil:
			switch message.Request.Method {
			case "initialize":
				h.sendControl(response{
					JsonRpc: ahptypes.JsonRpcV2,
					ID:      message.Request.ID,
					Result: ahptypes.InitializeResult{
						ProtocolVersion: ahptypes.SupportedProtocolVersions()[0],
						Snapshots:       []ahptypes.Snapshot{},
					},
				})
			case "subscribe":
				h.acceptSubscription(message.Request)
			}
		case message.Notification != nil:
			switch message.Notification.Method {
			case "channel/credit":
				var params ahptypes.ChannelCreditParams
				if json.Unmarshal(message.Notification.Params, &params) == nil {
					h.receiveCredit(params.ConsumedBytes)
				}
			case "dispatchAction":
				var params ahptypes.DispatchActionParams
				if json.Unmarshal(message.Notification.Params, &params) == nil {
					h.receiveInput(text, params.Action)
				}
			}
		}
	}
}

func (h *Host) acceptSubscription(request *ahptypes.JsonRpcRequest) {
	var params ahptypes.SubscribeParams
	if err := json.Unmarshal(request.Params, &params); err != nil || params.FlowControl == nil {
		panic("demohost: the examples expect a windowed subscribe")
	}
	offered := params.FlowControl.Receive

	h.mu.Lock()
	defer h.mu.Unlock()
	h.channel = params.Channel
	// A host can lower the limits that the client offered, but never raise them.
	h.limits = &ahptypes.ChannelFlowControl{
		ClientReceive: ahptypes.ChannelReceiveLimits{
			WindowBytes:       min(offered.WindowBytes, h.opts.ClientWindowBytes),
			MaximumFrameBytes: min(offered.MaximumFrameBytes, maximumFrameBytes),
		},
		HostReceive: ahptypes.ChannelReceiveLimits{WindowBytes: h.opts.HostWindowBytes, MaximumFrameBytes: maximumFrameBytes},
	}
	logf("accepted windowed delivery: client window %d bytes (offered %d), host window %d bytes",
		h.limits.ClientReceive.WindowBytes, offered.WindowBytes, h.limits.HostReceive.WindowBytes)
	h.sendControl(response{
		JsonRpc: ahptypes.JsonRpcV2,
		ID:      request.ID,
		Result:  ahptypes.SubscribeResult{FlowControl: h.limits},
	})

	// The first data message on a windowed subscription is always the snapshot.
	h.sendDataLocked(notification{
		JsonRpc: ahptypes.JsonRpcV2,
		Method:  "channel/snapshot",
		Params: ahptypes.ChannelSnapshotParams{
			Channel: h.channel,
			Snapshot: ahptypes.Snapshot{
				Resource: h.channel,
				State: ahptypes.SnapshotState{Terminal: &ahptypes.TerminalState{
					Title:     "demo shell",
					Content:   []ahptypes.TerminalContentPart{},
					Lifecycle: ahptypes.TerminalLifecycleState{Value: &ahptypes.TerminalRunningLifecycleState{Status: ahptypes.TerminalLifecycleStatusRunning}},
					Claim:     ahptypes.TerminalClaim{Value: &ahptypes.TerminalClientClaim{Kind: ahptypes.TerminalClaimKindClient, ClientId: "windowing-example"}},
				}},
				FromSeq: h.serverSeq,
			},
		},
	})
	close(h.subscribed)
}

func (h *Host) receiveCredit(consumedBytes int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	// Credit is a running total, so ignore values that are not larger.
	if consumedBytes > h.consumedBytes {
		h.consumedBytes = consumedBytes
		close(h.credit)
		h.credit = make(chan struct{})
	}
}

func (h *Host) receiveInput(text string, action ahptypes.StateAction) {
	size := utf16Bytes(text)
	h.mu.Lock()
	h.receivedBytes += size
	limits := h.limits.HostReceive
	// The client can go past the window only with the message that fills it.
	if h.receivedBytes-h.processedBytes > limits.WindowBytes+limits.MaximumFrameBytes {
		logf("client went past the host window")
	}
	// Process input one message at a time, then return credit for it.
	previous, done := h.inputTail, make(chan struct{})
	h.inputTail = done
	h.mu.Unlock()

	go func() {
		defer close(done)
		select {
		case <-previous:
		case <-h.done:
			return
		}
		select {
		case <-time.After(h.opts.InputDelay):
		case <-h.done:
			return
		}
		h.mu.Lock()
		if input, ok := action.Value.(*ahptypes.TerminalInputAction); ok {
			h.receivedInput.WriteString(input.Data)
		}
		h.processedBytes += size
		credit := ahptypes.ChannelCreditParams{Channel: h.channel, ConsumedBytes: h.processedBytes}
		h.mu.Unlock()
		h.sendControl(notification{JsonRpc: ahptypes.JsonRpcV2, Method: "channel/credit", Params: credit})
	}()
}

// encode serializes a message the way a JavaScript host would, without
// escaping HTML characters.
func encode(message any) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(message); err != nil {
		panic(err)
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// utf16Bytes returns the AHP size of text: two bytes per UTF-16 code unit.
// Go strings are UTF-8, so count code units per rune rather than using len.
func utf16Bytes(text string) int64 {
	var size int64
	for _, r := range text {
		if r > 0xffff {
			size += 4 // a surrogate pair
		} else {
			size += 2
		}
	}
	return size
}

func logf(format string, args ...any) {
	fmt.Printf("  host   | "+format+"\n", args...)
}
