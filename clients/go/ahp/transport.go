package ahp

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// ─── TransportMessage ────────────────────────────────────────────────────

// transportFrameKind enumerates the three payload shapes a transport
// may carry. Most implementations will use TransportFrameText.
type transportFrameKind int

const (
	transportFrameUnset transportFrameKind = iota
	transportFrameParsed
	transportFrameText
	transportFrameBinary
)

// TransportMessage is a single message flowing in or out over a
// [Transport]. Construct one with one of the helpers below; transports
// may inspect [TransportMessage.AsParsed] / [TransportMessage.AsBytes]
// to decide how to ship the payload.
type TransportMessage struct {
	kind   transportFrameKind
	parsed *ahptypes.JsonRpcMessage
	text   string
	binary []byte
	raw    *string
}

// TransportCapabilities describes optional support for exact JSON text
// accounting. MaximumFrameBytes is measured in AHP UTF-16 bytes, not UTF-8.
type TransportCapabilities struct {
	SupportsWindowedDelivery bool
	MaximumFrameBytes        int64
}

// TransportCapabilitiesProvider is optional; Transport itself is unchanged.
// Providers must retain received text and send text messages without rewriting.
type TransportCapabilitiesProvider interface {
	TransportCapabilities() TransportCapabilities
}

// MaximumFrameBytesForReadLimit converts a UTF-8 message limit to a safe AHP
// UTF-16 limit. Unknown or unlimited limits use 1 MiB.
func MaximumFrameBytesForReadLimit(limit int64) int64 {
	if limit <= 0 {
		return 1 << 20
	}
	return 2 * (limit / 3)
}

// NewParsedMessageWithRawText preserves the original text alongside its parse.
func NewParsedMessageWithRawText(m ahptypes.JsonRpcMessage, raw string) TransportMessage {
	return TransportMessage{kind: transportFrameParsed, parsed: &m, raw: &raw}
}

// RawJSONText returns the original received JSON, never a reserialization.
func (m TransportMessage) RawJSONText() (string, bool) {
	switch m.kind {
	case transportFrameText:
		return m.text, true
	case transportFrameBinary:
		return string(m.binary), true
	case transportFrameParsed:
		if m.raw != nil {
			return *m.raw, true
		}
	}
	return "", false
}

// NewParsedMessage wraps an already-decoded JSON-RPC message.
func NewParsedMessage(m ahptypes.JsonRpcMessage) TransportMessage {
	return TransportMessage{kind: transportFrameParsed, parsed: &m}
}

// NewTextMessage wraps a text frame whose payload is a JSON-RPC
// message encoded as UTF-8.
func NewTextMessage(s string) TransportMessage {
	return TransportMessage{kind: transportFrameText, text: s}
}

// NewBinaryMessage wraps a binary frame whose payload is a JSON-RPC
// message encoded as UTF-8.
func NewBinaryMessage(b []byte) TransportMessage {
	return TransportMessage{kind: transportFrameBinary, binary: b}
}

// IntoParsed decodes the message into a typed
// [ahptypes.JsonRpcMessage].
func (m TransportMessage) IntoParsed() (ahptypes.JsonRpcMessage, error) {
	switch m.kind {
	case transportFrameParsed:
		if m.parsed == nil {
			return ahptypes.JsonRpcMessage{}, &TransportError{Kind: "protocol", Err: fmt.Errorf("parsed message was nil")}
		}
		return *m.parsed, nil
	case transportFrameText:
		var out ahptypes.JsonRpcMessage
		if err := json.Unmarshal([]byte(m.text), &out); err != nil {
			return ahptypes.JsonRpcMessage{}, &TransportError{Kind: "protocol", Err: err}
		}
		return out, nil
	case transportFrameBinary:
		var out ahptypes.JsonRpcMessage
		if err := json.Unmarshal(m.binary, &out); err != nil {
			return ahptypes.JsonRpcMessage{}, &TransportError{Kind: "protocol", Err: err}
		}
		return out, nil
	default:
		return ahptypes.JsonRpcMessage{}, &TransportError{Kind: "protocol", Err: fmt.Errorf("empty TransportMessage")}
	}
}

// EncodeMessage builds a TransportMessage carrying a JSON-encoded
// payload, suitable for sending over a text-framed transport.
func EncodeMessage(m ahptypes.JsonRpcMessage) (TransportMessage, error) {
	b, err := json.Marshal(m)
	if err != nil {
		return TransportMessage{}, &TransportError{Kind: "protocol", Err: err}
	}
	return NewTextMessage(string(b)), nil
}

// Bytes returns the wire payload of m as UTF-8 bytes plus a flag
// indicating whether the original frame was binary. Parsed messages
// are re-encoded via [encoding/json].
func (m TransportMessage) Bytes() ([]byte, bool, error) {
	switch m.kind {
	case transportFrameText:
		return []byte(m.text), false, nil
	case transportFrameBinary:
		return m.binary, true, nil
	case transportFrameParsed:
		if m.parsed == nil {
			return nil, false, &TransportError{Kind: "protocol", Err: fmt.Errorf("parsed message was nil")}
		}
		b, err := json.Marshal(m.parsed)
		if err != nil {
			return nil, false, &TransportError{Kind: "protocol", Err: err}
		}
		return b, false, nil
	default:
		return nil, false, &TransportError{Kind: "protocol", Err: fmt.Errorf("empty TransportMessage")}
	}
}

// ─── Transport interface ────────────────────────────────────────────────

// Transport is the pluggable byte-stream abstraction the [Client]
// drives. Implementations deliver inbound messages in order and accept
// outbound sends serially. Concurrent calls to [Transport.Send] are
// the caller's responsibility — the [Client] serializes its own
// outbound traffic through an internal queue.
//
// Returning a non-nil error from [Transport.Recv] indicates an abnormal
// closure; returning ([TransportMessage]{}, nil) with the zero-value
// frame signals clean end-of-stream — but most implementations will
// instead return ([TransportMessage]{}, [ErrClosed]) wrapped in a
// [TransportError] of kind "closed".
type Transport interface {
	// Send writes a single message. Implementations should respect ctx
	// cancellation so the caller can abort a stuck write.
	Send(ctx context.Context, m TransportMessage) error

	// Recv blocks for the next inbound message. Returning a wrapped
	// [ErrClosed] is the canonical end-of-stream signal.
	Recv(ctx context.Context) (TransportMessage, error)

	// Close releases any underlying resources. Calling Close while a
	// Recv is in flight should cause that Recv to return promptly with
	// a closed-transport error.
	Close(ctx context.Context) error
}

// ─── BoxedTransport ─────────────────────────────────────────────────────

// BoxedTransport is a thin reference-counted handle around a
// [Transport]. The multi-host runtime uses BoxedTransport to hold
// heterogeneous transports in a single registry without leaking the
// concrete type into shared code paths.
//
// Concurrent Send calls are serialized via an internal mutex so that
// transport implementations that are not themselves safe for
// concurrent Send (e.g. raw WebSocket writers) work out of the box.
type BoxedTransport struct {
	inner    Transport
	writerMu sync.Mutex
}

// NewBoxedTransport wraps t in a [BoxedTransport].
func NewBoxedTransport(t Transport) *BoxedTransport {
	return &BoxedTransport{inner: t}
}

// Send forwards to the underlying transport, serializing concurrent
// writes through an internal mutex.
func (b *BoxedTransport) Send(ctx context.Context, m TransportMessage) error {
	b.writerMu.Lock()
	defer b.writerMu.Unlock()
	return b.inner.Send(ctx, m)
}

// Recv forwards to the underlying transport.
func (b *BoxedTransport) Recv(ctx context.Context) (TransportMessage, error) {
	return b.inner.Recv(ctx)
}

// Close forwards to the underlying transport.
func (b *BoxedTransport) Close(ctx context.Context) error {
	return b.inner.Close(ctx)
}

// TransportCapabilities preserves the optional capabilities of the inner transport.
func (b *BoxedTransport) TransportCapabilities() TransportCapabilities {
	if p, ok := b.inner.(TransportCapabilitiesProvider); ok {
		return p.TransportCapabilities()
	}
	return TransportCapabilities{}
}
