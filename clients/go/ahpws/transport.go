// Package ahpws provides a WebSocket-backed implementation of the
// [github.com/microsoft/agent-host-protocol/clients/go/ahp.Transport]
// interface, built on [github.com/coder/websocket].
//
// Both `ws://` and `wss://` URLs are accepted; TLS is handled by the
// underlying library's default dialer. See [Connect] for the common
// case or [FromConn] when you need custom dialing options.
//
// # Quickstart
//
//	transport, err := ahpws.Connect(ctx, "ws://localhost:12345")
//	if err != nil { /* ... */ }
//
//	client, err := ahp.Connect(ctx, transport, ahp.DefaultConfig())
//	if err != nil { /* ... */ }
//	defer client.Shutdown(ctx)
package ahpws

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/coder/websocket"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
)

// DialOptions configures the WebSocket handshake performed by
// [Connect]. The zero value is fine for the common case.
type DialOptions struct {
	// HTTPClient overrides the HTTP client used to perform the
	// WebSocket handshake. Pass nil for the default.
	HTTPClient *http.Client
	// HTTPHeader carries additional request headers (e.g. auth,
	// `Origin`, custom protocol selectors).
	HTTPHeader http.Header
	// Subprotocols advertises sub-protocols the client is willing to
	// speak. Most AHP deployments leave this empty.
	Subprotocols []string
	// ReadLimit caps the size of an inbound frame in bytes. Zero
	// means use the package default (32 MiB), which is generous
	// enough for snapshot deliveries and large tool-call results.
	ReadLimit int64
}

// defaultReadLimit is generous enough for snapshot deliveries and
// large tool-call results.
const defaultReadLimit int64 = 32 * 1024 * 1024

// Transport implements [ahp.Transport] on top of a
// [github.com/coder/websocket.Conn]. Use [Connect] to dial or
// [FromConn] to wrap an existing connection.
type Transport struct {
	conn      *websocket.Conn
	readLimit int64
}

// Connect dials the given URL and returns a ready-to-use
// [*Transport]. The URL must use the `ws://` or `wss://` scheme.
//
// The returned transport closes the underlying connection when its
// [Transport.Close] method is called, or when the [ahp.Client] that
// owns it is shut down.
func Connect(ctx context.Context, url string, opts ...DialOptions) (*Transport, error) {
	var d DialOptions
	if len(opts) > 0 {
		d = opts[0]
	}
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPClient:   d.HTTPClient,
		HTTPHeader:   d.HTTPHeader,
		Subprotocols: d.Subprotocols,
	})
	if err != nil {
		return nil, fmt.Errorf("ahpws: dial %s: %w", url, err)
	}
	limit := d.ReadLimit
	if limit <= 0 {
		limit = defaultReadLimit
	}
	conn.SetReadLimit(limit)
	return &Transport{conn: conn, readLimit: limit}, nil
}

// FromConn wraps an already-connected
// [github.com/coder/websocket.Conn] in a [*Transport]. Useful when
// you need custom TLS configuration, request headers, or want to
// reuse an existing socket.
func FromConn(conn *websocket.Conn) *Transport {
	return &Transport{conn: conn}
}

// TransportCapabilities reports a safe UTF-16 frame limit derived from the
// configured UTF-8 message read limit. FromConn uses the unknown-limit fallback.
func (t *Transport) TransportCapabilities() ahp.TransportCapabilities {
	return ahp.TransportCapabilities{
		SupportsWindowedDelivery: true,
		MaximumFrameBytes:        ahp.MaximumFrameBytesForReadLimit(t.readLimit),
	}
}

// Send writes a single message. Text frames are produced for
// [ahp.NewTextMessage] / [ahp.NewParsedMessage] payloads, binary
// frames for [ahp.NewBinaryMessage] payloads.
func (t *Transport) Send(ctx context.Context, m ahp.TransportMessage) error {
	data, isBinary, err := m.Bytes()
	if err != nil {
		return err
	}
	frame := websocket.MessageText
	if isBinary {
		frame = websocket.MessageBinary
	}
	if err := t.conn.Write(ctx, frame, data); err != nil {
		return fmt.Errorf("ahpws: write: %w", err)
	}
	return nil
}

// Recv blocks for the next inbound message. Returns a wrapped
// [ahp.ErrClosed] when the remote half cleanly closes the connection.
func (t *Transport) Recv(ctx context.Context) (ahp.TransportMessage, error) {
	for {
		mt, data, err := t.conn.Read(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return ahp.TransportMessage{}, err
			}
			if websocket.CloseStatus(err) != -1 {
				return ahp.TransportMessage{}, fmt.Errorf("ahpws: %w", ahp.ErrClosed)
			}
			return ahp.TransportMessage{}, fmt.Errorf("ahpws: read: %w", err)
		}
		switch mt {
		case websocket.MessageText:
			return ahp.NewTextMessage(string(data)), nil
		case websocket.MessageBinary:
			return ahp.NewBinaryMessage(data), nil
		}
		// Other frame types (ping/pong) are handled internally by the
		// library — keep looping for the next data frame.
	}
}

// Close performs a graceful WebSocket close. Subsequent
// [Transport.Recv] calls return [ahp.ErrClosed].
func (t *Transport) Close(_ context.Context) error {
	return t.conn.Close(websocket.StatusNormalClosure, "")
}
