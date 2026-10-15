package ahp

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"strings"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

type CoalescingDirection string

const (
	CoalesceReceive CoalescingDirection = "receive"
	CoalesceSend    CoalescingDirection = "send"
)

type CoalescingContext struct {
	Channel   string
	Direction CoalescingDirection
}

// Coalescer runs before built-ins for Method. Merge must be nonblocking and
// cannot call back into the client. Return false to leave adjacent items intact.
type Coalescer struct {
	Method string
	Merge  func(earlier, later ahptypes.JsonRpcNotification, context CoalescingContext) (ahptypes.JsonRpcNotification, bool)
}

func (e *flowEngine) coalesce(a, b ahptypes.JsonRpcNotification, direction CoalescingDirection, f *channelFlow) (ahptypes.JsonRpcNotification, bool) {
	if a.Method != b.Method || !ahptypes.CountsAgainstWindow(a.Method) || a.Method == "dispatchAction" || a.Method == "channel/snapshot" || a.Method == "tcp/eof" || a.Method == "channel/frame" {
		return a, false
	}
	if a.Method == "action" {
		var p, q ahptypes.ActionEnvelope
		if json.Unmarshal(a.Params, &p) != nil || json.Unmarshal(b.Params, &q) != nil || p.Origin != nil || q.Origin != nil || p.RejectionReason != nil || q.RejectionReason != nil {
			return a, false
		}
	}
	for _, rule := range e.cfg.Coalescers {
		if rule.Method == a.Method && rule.Merge != nil {
			x, y := a, b
			x.Params = append(json.RawMessage(nil), a.Params...)
			y.Params = append(json.RawMessage(nil), b.Params...)
			if n, ok := rule.Merge(x, y, CoalescingContext{Channel: f.channel, Direction: direction}); ok {
				channel, err := notificationChannel(n)
				if err == nil && channel == f.channel && n.Method == a.Method {
					n.JsonRpc = ahptypes.JsonRpcV2
					return n, true
				}
			}
		}
	}
	if direction == CoalesceSend && a.Method == "tcp/data" {
		var p, q ahptypes.TcpDataParams
		if json.Unmarshal(a.Params, &p) != nil || json.Unmarshal(b.Params, &q) != nil {
			return a, false
		}
		x, err := decodeCoalescedTCP(p.Data)
		if err != nil {
			return a, false
		}
		y, err := decodeCoalescedTCP(q.Data)
		if err != nil {
			return a, false
		}

		p.Data = base64.StdEncoding.EncodeToString(append(x, y...))
		a.Params, _ = json.Marshal(p)
		return a, true
	}
	if direction != CoalesceReceive || a.Method != "action" {
		return a, false
	}
	var p, q ahptypes.ActionEnvelope
	if json.Unmarshal(a.Params, &p) != nil || json.Unmarshal(b.Params, &q) != nil {
		return a, false
	}
	switch x := p.Action.Value.(type) {
	case *ahptypes.TerminalDataAction:
		y, ok := q.Action.Value.(*ahptypes.TerminalDataAction)
		if !ok {
			return a, false
		}
		x.Data += y.Data
	case *ahptypes.ChatDeltaAction:
		y, ok := q.Action.Value.(*ahptypes.ChatDeltaAction)
		if !ok || x.TurnId != y.TurnId || x.PartId != y.PartId {
			return a, false
		}
		left, _ := json.Marshal(x.Meta)
		right, _ := json.Marshal(y.Meta)
		if !bytes.Equal(left, right) {
			return a, false
		}
		x.Content += y.Content
	default:
		return a, false
	}
	p.ServerSeq = q.ServerSeq
	a.Params, _ = json.Marshal(p)
	return a, true
}

func decodeCoalescedTCP(text string) ([]byte, error) {
	if text == "" || strings.ContainsAny(text, " \r\n\t") {
		return nil, base64.CorruptInputError(0)
	}
	b, err := base64.StdEncoding.Strict().DecodeString(text)
	if err == nil && base64.StdEncoding.EncodeToString(b) != text {
		err = base64.CorruptInputError(0)
	}
	return b, err
}
