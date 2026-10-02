// Package ahp is the async SDK for the Agent Host Protocol (AHP).
//
// The [Client] drives a pluggable [Transport] over a JSON-RPC channel
// and fans incoming actions out to per-URI subscriptions and an
// optional top-level event stream. Reducers (see [ApplyActionToRoot],
// [ApplyActionToSession], [ApplyActionToTerminal],
// [ApplyActionToChangeset]) translate every [ahptypes.StateAction]
// into mutations on the matching state tree.
//
// Multi-host consumers should reach for the
// [github.com/microsoft/agent-host-protocol/clients/go/ahp/hosts]
// sub-package, which adds a registry, reconnect supervisor, and
// generation-checked handles on top of the single-host [Client].
//
// # Quickstart
//
//	transport, err := ahpws.Connect(ctx, "ws://localhost:12345")
//	if err != nil { /* ... */ }
//
//	client, err := ahp.Connect(ctx, transport, ahp.DefaultConfig())
//	if err != nil { /* ... */ }
//	defer client.Shutdown(ctx)
//
//	if _, err := client.Initialize(ctx, "my-client",
//	    ahptypes.SupportedProtocolVersions(), nil); err != nil { /* ... */ }
//
//	_, sub, err := client.Subscribe(ctx, "ahp-session:/s1")
//	if err != nil { /* ... */ }
//
//	for evt := range sub.Events() {
//	    // handle evt ...
//	}
package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
)

// ─── Error types ─────────────────────────────────────────────────────────

// ErrClosed is returned by transports when the underlying connection
// has been cleanly closed by the remote peer.
var ErrClosed = errors.New("ahp: transport closed")

// ErrShutdown is returned by [Client] methods when the client (or its
// background driver) has been shut down.
var ErrShutdown = errors.New("ahp: client shut down")

// ErrSequenceGap is returned when an action envelope arrives out of
// sequence and the client cannot reconcile without a new snapshot. The
// caller should resubscribe to recover.
var ErrSequenceGap = errors.New("ahp: sequence gap detected; resubscribe required")

// SubscriptionLagError reports overflow of a strict event receiver.
// That receiver is permanently closed and will never resume past the gap.
type SubscriptionLagError struct {
	Capacity int
}

func (e *SubscriptionLagError) Error() string {
	return fmt.Sprintf("ahp: subscription lag: event buffer capacity %d exceeded; receiver terminated", e.Capacity)
}

// TransportError wraps any error produced by an underlying [Transport]
// implementation so that callers can distinguish transport faults from
// protocol-level RPC errors via [errors.As].
type TransportError struct {
	// Kind classifies the failure: "closed", "io", or "protocol".
	Kind string
	// Err is the underlying error, if any.
	Err error
}

// Error implements the standard error interface.
func (e *TransportError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("ahp: transport %s: %v", e.Kind, e.Err)
	}
	return fmt.Sprintf("ahp: transport %s", e.Kind)
}

// Unwrap exposes the underlying cause for [errors.Is] / [errors.As].
func (e *TransportError) Unwrap() error { return e.Err }

// RPCError wraps a JSON-RPC error response so the caller can branch on
// it via [errors.As].
type RPCError struct {
	Code    int32
	Message string
	Data    json.RawMessage
}

// Error implements the standard error interface.
func (e *RPCError) Error() string {
	return fmt.Sprintf("ahp: rpc error %d: %s", e.Code, e.Message)
}

// UnknownSubscriptionError is returned by [Client.Unsubscribe] when
// the URI is not tracked by this client.
type UnknownSubscriptionError struct {
	URI string
}

// Error implements the standard error interface.
func (e *UnknownSubscriptionError) Error() string {
	return fmt.Sprintf("ahp: no such subscription: %s", e.URI)
}

// ─── Context helpers ────────────────────────────────────────────────────

// ctxErr converts a context cancellation into ErrShutdown when the
// context expired while waiting on the client's background driver.
func ctxErr(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return ErrShutdown
}
