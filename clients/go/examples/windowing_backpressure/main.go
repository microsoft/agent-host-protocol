// Command windowing_backpressure demonstrates windowed delivery with
// backpressure and a custom coalescer.
//
// Part 1, receiving: the client renders slowly. While it is busy, the host
// fills the window and the client queues what arrives. Adjacent queued
// messages are combined before the renderer sees them:
//
//   - The built-in coalescer joins adjacent `terminal/data` output.
//   - A custom coalescer keeps only the last of adjacent `terminal/resized`
//     actions, because only the final size matters.
//
// Part 2, sending: the client pastes a large block of text into the terminal.
// The host processes input slowly, so the client's send window fills. The
// client waits until the subscription is writable before it sends each chunk,
// instead of queueing the whole paste in memory.
//
// Run: go run ./examples/windowing_backpressure
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
	"github.com/microsoft/agent-host-protocol/clients/go/examples/internal/demohost"
)

const terminal = "ahp-terminal:/demo"

func logf(format string, args ...any) {
	fmt.Printf("  client | "+format+"\n", args...)
}

// latestResize runs on two adjacent messages that are still queued. It
// returns the combined message and true, or false to leave them separate. The
// client never passes it messages that the protocol requires to stay separate,
// such as actions with an origin.
var latestResize = ahp.Coalescer{
	Method: "action",
	Merge: func(earlier, later ahptypes.JsonRpcNotification, c ahp.CoalescingContext) (ahptypes.JsonRpcNotification, bool) {
		if c.Direction != ahp.CoalesceReceive {
			return earlier, false
		}
		var first, second ahptypes.ActionEnvelope
		if json.Unmarshal(earlier.Params, &first) != nil || json.Unmarshal(later.Params, &second) != nil {
			return earlier, false
		}
		_, firstIsResize := first.Action.Value.(*ahptypes.TerminalResizedAction)
		_, secondIsResize := second.Action.Value.(*ahptypes.TerminalResizedAction)
		if firstIsResize && secondIsResize {
			return later, true
		}
		return earlier, false
	},
}

func terminalData(data string) ahptypes.StateAction {
	return ahptypes.StateAction{Value: &ahptypes.TerminalDataAction{Type: ahptypes.ActionTypeTerminalData, Data: data}}
}

func terminalResized(cols, rows int64) ahptypes.StateAction {
	return ahptypes.StateAction{Value: &ahptypes.TerminalResizedAction{Type: ahptypes.ActionTypeTerminalResized, Cols: cols, Rows: rows}}
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	host := demohost.New(demohost.Options{ClientWindowBytes: 2048, HostWindowBytes: 1024, InputDelay: 15 * time.Millisecond})
	cfg := ahp.DefaultConfig()
	cfg.Windowing.Coalescers = []ahp.Coalescer{latestResize}
	// Allow at most 2048 bytes of unsent data to wait behind the message being sent.
	cfg.Windowing.MaxBufferedSendBytes = 2048
	client, err := ahp.Connect(ctx, host.ClientTransport(), cfg)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	if _, err := client.Initialize(ctx, "windowing-example", ahptypes.SupportedProtocolVersions(), nil); err != nil {
		log.Fatalf("initialize: %v", err)
	}

	// Count what the client did. This stream is for monitoring only and can
	// drop events; it never affects credit.
	var countsMu sync.Mutex
	counts := map[string]int{}
	go func() {
		for event := range client.FlowControlEvents() {
			countsMu.Lock()
			counts[event.Kind]++
			countsMu.Unlock()
		}
	}()

	_, sub, err := client.SubscribeWithOptions(ctx, terminal, ahp.SubscribeOptions{
		Window: &ahp.WindowOptions{WindowBytes: 4096},
	})
	if err != nil {
		log.Fatalf("subscribe: %v", err)
	}
	status := sub.FlowControl()
	if status.Limits == nil {
		log.Fatalf("the host did not accept windowed delivery (%s)", status.FallbackReason)
	}
	logf("subscribed: accepted window=%d bytes", status.Limits.ClientReceive.WindowBytes)

	// ─── Part 1: a slow renderer ────────────────────────────────────────────

	fmt.Println("\nPart 1: slow renderer")
	hostActions := []ahptypes.StateAction{
		terminalData("Building 120 modules\r\n"),
		// The user drags the corner of the terminal window.
		terminalResized(100, 30),
		terminalResized(110, 32),
		terminalResized(120, 36),
		terminalResized(132, 40),
	}
	for percent := 10; percent <= 100; percent += 10 {
		hostActions = append(hostActions, terminalData(fmt.Sprintf("[%3d%%] compiled %d modules\r\n", percent, percent*120/100)))
	}
	hostActions = append(hostActions, terminalData("Build finished\r\n"))
	go func() {
		<-host.Subscribed()
		for _, action := range hostActions {
			if err := host.SendAction(ctx, action); err != nil {
				return
			}
		}
	}()

	renders := 0
render:
	for {
		delivery, err := sub.Next(ctx)
		if err != nil {
			log.Fatalf("next: %v", err)
		}
		renders++
		switch event := delivery.Event().(type) {
		case ahp.SubscriptionEventSnapshot:
			logf("render snapshot (%d bytes)", delivery.WireBytes())
		case ahp.SubscriptionEventAction:
			switch action := event.Envelope.Action.Value.(type) {
			case *ahptypes.TerminalResizedAction:
				logf("render resize to %dx%d (%d bytes)", action.Cols, action.Rows, delivery.WireBytes())
			case *ahptypes.TerminalDataAction:
				var lines []string
				for _, line := range strings.Split(action.Data, "\r\n") {
					if line != "" {
						lines = append(lines, line)
					}
				}
				logf("render %d line(s) of output (%d bytes): %q", len(lines), delivery.WireBytes(), lines[len(lines)-1])
				if strings.Contains(action.Data, "Build finished") {
					break render
				}
			}
		}
		time.Sleep(60 * time.Millisecond) // The renderer is slow; the host fills the window meanwhile.
	}
	logf("rendered %d deliveries for %d host messages", renders, len(hostActions)+1)

	// ─── Part 2: pasting into a slow terminal ───────────────────────────────

	fmt.Println("\nPart 2: pasting into a slow terminal")
	paste := make([]string, 8)
	for i := range paste {
		paste[i] = fmt.Sprintf("echo \"line %d of the pasted script\"\n", i+1)
	}
	waits := 0
	for i, chunk := range paste {
		// Wait for room in the host window and the local send queue, rather
		// than queueing the whole paste. With one producer, this keeps sends
		// within the limit.
		if status := sub.FlowControl(); !status.Writable {
			logf("not writable (%d bytes awaiting credit, %d bytes queued); waiting", status.OutstandingSendBytes, status.BufferedSendBytes)
			waits++
			if err := sub.WaitWritable(ctx); err != nil {
				log.Fatalf("wait writable: %v", err)
			}
		}
		logf("send chunk %d of %d", i+1, len(paste))
		input := ahptypes.StateAction{Value: &ahptypes.TerminalInputAction{Type: ahptypes.ActionTypeTerminalInput, Data: chunk}}
		// Dispatch returns when the message is written to the transport.
		if _, err := client.Dispatch(ctx, terminal, input); err != nil {
			// If another producer filled the queue first, the send fails
			// instead of growing the queue. Wait, then send the chunk again.
			if !errors.Is(err, ahp.ErrBackpressure) {
				log.Fatalf("dispatch: %v", err)
			}
			if err := sub.WaitWritable(ctx); err != nil {
				log.Fatalf("wait writable: %v", err)
			}
			if _, err := client.Dispatch(ctx, terminal, input); err != nil {
				log.Fatalf("dispatch: %v", err)
			}
		}
	}
	// Wait until the host has processed, and credited, every chunk.
	for status := range sub.FlowControlChanges() {
		if status.OutstandingSendBytes == 0 && status.BufferedSendBytes == 0 {
			break
		}
	}
	intact := host.ReceivedInput() == strings.Join(paste, "")
	logf("sent %d chunks, waiting %d times; host received the paste intact: %t", len(paste), waits, intact)

	fmt.Println("\nFlow-control events:")
	countsMu.Lock()
	kinds := make([]string, 0, len(counts))
	for kind := range counts {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	for _, kind := range kinds {
		fmt.Printf("  %s: %d\n", kind, counts[kind])
	}
	countsMu.Unlock()

	sub.Close()
	host.Close()
	_ = client.Shutdown(ctx)
}
