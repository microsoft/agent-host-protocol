package demohost

import (
	"context"
	"sync"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
)

// pipe is one half of an in-memory transport pair. Text sent on one half is
// received, unchanged, by the other half. Because the text is never
// reserialized, it reports support for windowed delivery.
type pipe struct {
	mu      sync.Mutex
	inbox   []string
	changed chan struct{} // closed and replaced whenever inbox or closed changes
	closed  bool
	peer    *pipe
}

var _ ahp.TransportCapabilitiesProvider = (*pipe)(nil)

// newPipe returns a connected pair of in-memory transports.
func newPipe() (*pipe, *pipe) {
	a := &pipe{changed: make(chan struct{})}
	b := &pipe{changed: make(chan struct{})}
	a.peer, b.peer = b, a
	return a, b
}

func (p *pipe) Send(ctx context.Context, m ahp.TransportMessage) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	text, _, err := m.Bytes()
	if err != nil {
		return err
	}
	return p.peer.deliver(string(text))
}

func (p *pipe) Recv(ctx context.Context) (ahp.TransportMessage, error) {
	for {
		p.mu.Lock()
		if len(p.inbox) > 0 {
			text := p.inbox[0]
			p.inbox = p.inbox[1:]
			p.mu.Unlock()
			return ahp.NewTextMessage(text), nil
		}
		if p.closed {
			p.mu.Unlock()
			return ahp.TransportMessage{}, closedError()
		}
		changed := p.changed
		p.mu.Unlock()
		select {
		case <-changed:
		case <-ctx.Done():
			return ahp.TransportMessage{}, ctx.Err()
		}
	}
}

// Close closes both halves. Messages that are already queued can still be read.
func (p *pipe) Close(context.Context) error {
	p.markClosed()
	p.peer.markClosed()
	return nil
}

// TransportCapabilities reports that text is kept exactly as sent. The pipe
// has no frame size limit, so the client uses its default maximum.
func (p *pipe) TransportCapabilities() ahp.TransportCapabilities {
	return ahp.TransportCapabilities{SupportsWindowedDelivery: true}
}

// deliver queues text for this half to receive. Both halves close together,
// so a closed receiver also means a closed sender.
func (p *pipe) deliver(text string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return closedError()
	}
	p.inbox = append(p.inbox, text)
	p.signalLocked()
	return nil
}

func (p *pipe) markClosed() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.closed {
		p.closed = true
		p.signalLocked()
	}
}

func (p *pipe) signalLocked() {
	close(p.changed)
	p.changed = make(chan struct{})
}

func closedError() error {
	return &ahp.TransportError{Kind: "closed", Err: ahp.ErrClosed}
}
