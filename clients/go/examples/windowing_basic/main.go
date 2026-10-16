// Command windowing_basic demonstrates basic windowed delivery.
//
// The client offers windowed delivery on a terminal subscription. The host
// accepts a smaller window, then sends a snapshot and terminal output. When
// the window is full, the host waits; each time the client takes the next
// delivery, it releases the previous one and returns credit, so the host can
// continue.
//
// Run: go run ./examples/windowing_basic
package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"
	"unicode"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
	"github.com/microsoft/agent-host-protocol/clients/go/examples/internal/demohost"
)

const terminal = "ahp-terminal:/demo"

var output = []string{
	"$ npm test",
	"> demo@1.0.0 test",
	"> node --test",
	"ok 1 - parses the configuration file",
	"ok 2 - rejects an unknown option",
	"ok 3 - reads input from stdin",
	"ok 4 - writes the report",
	"# pass 4, fail 0",
}

func logf(format string, args ...any) {
	fmt.Printf("  client | "+format+"\n", args...)
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// The host accepts at most a 1024-byte window, so it fills after a few messages.
	host := demohost.New(demohost.Options{ClientWindowBytes: 1024, HostWindowBytes: 4096})
	client, err := ahp.Connect(ctx, host.ClientTransport(), ahp.DefaultConfig())
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	if _, err := client.Initialize(ctx, "windowing-example", ahptypes.SupportedProtocolVersions(), nil); err != nil {
		log.Fatalf("initialize: %v", err)
	}

	// Windowing is off by default. Opt in for this subscription and offer a
	// 4096-byte window. Coalescing is turned off so that every host message is
	// a separate delivery; see windowing_backpressure for coalescing.
	coalescing := false
	_, sub, err := client.SubscribeWithOptions(ctx, terminal, ahp.SubscribeOptions{
		Window: &ahp.WindowOptions{WindowBytes: 4096, Coalescing: &coalescing},
	})
	if err != nil {
		log.Fatalf("subscribe: %v", err)
	}
	status := sub.FlowControl()
	if status.Limits == nil {
		log.Fatalf("the host did not accept windowed delivery (%s)", status.FallbackReason)
	}
	logf("subscribed: mode=%s, accepted window=%d bytes", status.Mode, status.Limits.ClientReceive.WindowBytes)

	// The host writes terminal output as fast as the window allows.
	go func() {
		<-host.Subscribed()
		for _, line := range output {
			action := ahptypes.StateAction{Value: &ahptypes.TerminalDataAction{Type: ahptypes.ActionTypeTerminalData, Data: line + "\r\n"}}
			if err := host.SendAction(ctx, action); err != nil {
				return
			}
		}
	}()

	// With automatic release (the default), calling Next again releases the
	// delivery that it returned before. The client then returns credit for it.
	lines := 0
	for lines < len(output) {
		delivery, err := sub.Next(ctx)
		if err != nil {
			log.Fatalf("next: %v", err)
		}
		buffered := sub.FlowControl().BufferedReceiveBytes
		switch event := delivery.Event().(type) {
		case ahp.SubscriptionEventSnapshot:
			logf("snapshot (%d bytes; %d bytes not yet released)", delivery.WireBytes(), buffered)
		case ahp.SubscriptionEventAction:
			if data, ok := event.Envelope.Action.Value.(*ahptypes.TerminalDataAction); ok {
				text := strings.TrimRightFunc(data.Data, unicode.IsSpace)
				logf("output %q (%d bytes; %d bytes not yet released)", text, delivery.WireBytes(), buffered)
				lines++
			}
		}
		time.Sleep(20 * time.Millisecond) // Simulate rendering the delivery.
	}
	// Leaving the loop does not unsubscribe; closing the subscription does.
	sub.Close()

	logf("received all %d lines", lines)
	host.Close()
	_ = client.Shutdown(ctx)
}
