package ahpws

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/microsoft/agent-host-protocol/clients/go/ahp"
)

func TestWindowingReadLimitDefaults(t *testing.T) {
	if got := (&Transport{readLimit: defaultReadLimit}).TransportCapabilities(); !got.SupportsWindowedDelivery || got.MaximumFrameBytes != 22369620 {
		t.Fatal(got)
	}
	if got := FromConn(nil).TransportCapabilities().MaximumFrameBytes; got != 1048576 {
		t.Fatal(got)
	}
	if got := (&Transport{readLimit: 1536}).TransportCapabilities().MaximumFrameBytes; got != 1024 {
		t.Fatal(got)
	}
	for _, limit := range []int64{-1, 0} {
		if ahp.MaximumFrameBytesForReadLimit(limit) != 1048576 {
			t.Fatal("unknown limit default")
		}
	}
	boxed := ahp.NewBoxedTransport(&Transport{readLimit: defaultReadLimit})
	if boxed.TransportCapabilities().MaximumFrameBytes != 22369620 {
		t.Fatal("boxing hid capabilities")
	}
}

func TestConnectOverridesCoderNativeReadLimitAndPreservesText(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	text := `{"jsonrpc":"2.0","method":"app/data","params":{"channel":"ahp-terminal:/t","text":"` + strings.Repeat("漢", 12000) + `"}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()
		_ = conn.Write(ctx, websocket.MessageText, []byte(text))
		_, _, _ = conn.Read(ctx)
	}))
	defer server.Close()
	transport, err := Connect(ctx, "ws"+strings.TrimPrefix(server.URL, "http"))
	if err != nil {
		t.Fatal(err)
	}
	defer transport.Close(ctx)
	if transport.TransportCapabilities().MaximumFrameBytes != 22369620 {
		t.Fatal("effective default not reported")
	}
	msg, err := transport.Recv(ctx)
	if err != nil {
		t.Fatal(err)
	}
	raw, ok := msg.RawJSONText()
	if !ok || raw != text {
		t.Fatal("received text changed")
	}
}
