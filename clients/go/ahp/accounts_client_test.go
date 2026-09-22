package ahp

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

func TestAccountsClientRejectsUnconfirmedAuthenticationResults(t *testing.T) {
	for _, response := range []struct{ method, result string }{
		{"authenticate", `{}`},
		{"authenticate", `{"accountId":""}`},
		{"authenticate", `{"accountId":"different-account"}`},
		{"authBegin", `{"attemptId":"attempt-1"}`},
		{"authBegin", `{"flow":"future","attemptId":"attempt-1"}`},
		{"authBegin", `{"flow":"clientBrokered","attemptId":""}`},
	} {
		t.Run(response.method+"/"+response.result, func(t *testing.T) {
			clientSide, serverSide := newMemTransportPair()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			client, err := Connect(ctx, clientSide, DefaultConfig())
			if err != nil {
				t.Fatal(err)
			}
			defer client.Shutdown(context.Background())
			serverDone := make(chan struct{})
			go func() {
				defer close(serverDone)
				for _, reply := range []struct{ method, result string }{
					{"initialize", `{"protocolVersion":"0.9.0","serverSeq":1,"snapshots":[],"authentication":{"flows":[{"kind":"clientBrokered"}]}}`},
					response,
				} {
					frame, err := serverSide.Recv(ctx)
					if err != nil {
						t.Error(err)
						return
					}
					message, err := frame.IntoParsed()
					if err != nil || message.Request == nil || message.Request.Method != reply.method {
						t.Errorf("expected %s request: %+v, %v", reply.method, message, err)
						return
					}
					out, err := EncodeMessage(ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
						JsonRpc: ahptypes.JsonRpcV2, ID: message.Request.ID, Result: json.RawMessage(reply.result),
					}})
					if err != nil {
						t.Error(err)
						return
					}
					if err := serverSide.Send(ctx, out); err != nil {
						t.Error(err)
						return
					}
				}
			}()
			defer func() {
				cancel()
				<-serverDone
			}()
			if _, err := client.Initialize(ctx, "accounts-client", ahptypes.SupportedProtocolVersions(), nil); err != nil {
				t.Fatal(err)
			}
			if response.method == "authBegin" {
				var params ahptypes.AuthBeginParams
				if err := json.Unmarshal([]byte(`{"channel":"ahp-accounts://","target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"}},"flows":[{"kind":"clientBrokered"}]}`), &params); err != nil {
					t.Fatal(err)
				}
				_, err = client.AuthBegin(ctx, params)
			} else {
				var params ahptypes.AuthenticateParams
				if err := json.Unmarshal([]byte(`{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":{"kind":"account","accountId":"account-1"}}`), &params); err != nil {
					t.Fatal(err)
				}
				_, err = client.Authenticate(ctx, params)
			}
			var protocolError *TransportError
			if !errors.As(err, &protocolError) || protocolError.Kind != "protocol" {
				t.Fatalf("%s result %s was not rejected: %v", response.method, response.result, err)
			}
			<-serverDone
			select {
			case <-serverSide.inbox:
				t.Fatal("unconfirmed authentication triggered another request")
			default:
			}
		})
	}
}

func TestAccountsClientAuthenticationAndSubscription(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Shutdown(context.Background())

	type exchange struct {
		method string
		params string
		result string
	}
	exchanges := []exchange{
		{"initialize", "", `{"protocolVersion":"0.9.0","serverSeq":1,"snapshots":[],"authentication":{"flows":[{"kind":"clientBrokered"}]}}`},
		{"subscribe", `{"channel":"ahp-accounts://"}`, `{"snapshot":{"resource":"ahp-accounts://","fromSeq":1,"state":{"accounts":[],"attempts":[]}}}`},
		{"authBegin", `{"channel":"ahp-accounts://","target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"}},"flows":[{"kind":"clientBrokered"}],"accountId":"account-1"}`, `{"flow":"clientBrokered","attemptId":"attempt-1"}`},
		{"authenticate", `{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":{"kind":"attempt","attemptId":"attempt-1"}}`, `{"accountId":"account-1"}`},
		{"authenticate", `{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":{"kind":"account","accountId":"account-1"}}`, `{"accountId":"account-1"}`},
	}
	serverDone := make(chan struct{})
	go func() {
		defer close(serverDone)
		for _, ex := range exchanges {
			frame, err := serverSide.Recv(ctx)
			if err != nil {
				t.Errorf("server receive: %v", err)
				return
			}
			message, err := frame.IntoParsed()
			if err != nil || message.Request == nil {
				t.Errorf("expected request: %v, %+v", err, message)
				return
			}
			req := message.Request
			if req.Method != ex.method {
				t.Errorf("method = %s, want %s", req.Method, ex.method)
			}
			if ex.params != "" {
				var actual, expected any
				if err := json.Unmarshal(req.Params, &actual); err != nil {
					t.Error(err)
					return
				}
				if err := json.Unmarshal([]byte(ex.params), &expected); err != nil {
					t.Error(err)
					return
				}
				if !reflect.DeepEqual(actual, expected) {
					t.Errorf("%s params = %s, want %s", ex.method, req.Params, ex.params)
				}
			}
			out, err := EncodeMessage(ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
				JsonRpc: ahptypes.JsonRpcV2, ID: req.ID, Result: json.RawMessage(ex.result),
			}})
			if err != nil {
				t.Error(err)
				return
			}
			if err := serverSide.Send(ctx, out); err != nil {
				t.Error(err)
				return
			}
		}
	}()

	initialized, err := client.Initialize(ctx, "accounts-client", ahptypes.SupportedProtocolVersions(), nil)
	if err != nil {
		t.Fatal(err)
	}
	// Callers can change their returned metadata without altering negotiation.
	initialized.Authentication.Flows = nil
	result, subscription, err := client.SubscribeAccounts(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer subscription.Close()
	if subscription.URI() != ahptypes.AccountsResourceURI || result.Snapshot.State.Accounts == nil {
		t.Fatalf("accounts subscription = %+v", result)
	}
	var begin ahptypes.AuthBeginParams
	if err := json.Unmarshal([]byte(exchanges[2].params), &begin); err != nil {
		t.Fatal(err)
	}
	begin.Channel = "ahp-session:/ignored"
	attempt, err := client.AuthBegin(ctx, begin)
	if err != nil || attempt.AttemptId != "attempt-1" {
		t.Fatalf("authBegin = %+v, %v", attempt, err)
	}
	for _, ex := range exchanges[3:] {
		var params ahptypes.AuthenticateParams
		if err := json.Unmarshal([]byte(ex.params), &params); err != nil {
			t.Fatal(err)
		}
		params.Channel = "ahp-session:/ignored"
		result, err := client.Authenticate(ctx, params)
		if err != nil || result.AccountId == nil || *result.AccountId != "account-1" {
			t.Fatalf("authenticate = %+v, %v", result, err)
		}
	}
	<-serverDone
}

func TestAccountsClientRejectsUnadvertisedBoundAuthentication(t *testing.T) {
	for _, tc := range []struct {
		name           string
		initialize     bool
		authentication *ahptypes.AuthenticationCapability
	}{
		{name: "before initialize"},
		{name: "legacy", initialize: true},
		{name: "empty flows", initialize: true, authentication: &ahptypes.AuthenticationCapability{Flows: []ahptypes.AuthFlowSupport{}}},
		{name: "future flow", initialize: true, authentication: &ahptypes.AuthenticationCapability{Flows: []ahptypes.AuthFlowSupport{{Kind: "futureHostFlow"}}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			clientSide, serverSide := newMemTransportPair()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			client, err := Connect(ctx, clientSide, DefaultConfig())
			if err != nil {
				t.Fatal(err)
			}
			defer client.Shutdown(context.Background())
			if tc.initialize {
				serverDone := make(chan struct{})
				go func() {
					defer close(serverDone)
					frame, err := serverSide.Recv(ctx)
					if err != nil {
						t.Error(err)
						return
					}
					message, err := frame.IntoParsed()
					if err != nil || message.Request == nil || message.Request.Method != "initialize" {
						t.Errorf("initialize request = %+v, %v", message, err)
						return
					}
					result, err := json.Marshal(ahptypes.InitializeResult{
						ProtocolVersion: ahptypes.ProtocolVersion,
						Snapshots:       []ahptypes.Snapshot{}, Authentication: tc.authentication,
					})
					if err != nil {
						t.Error(err)
						return
					}
					out, err := EncodeMessage(ahptypes.JsonRpcMessage{SuccessResponse: &ahptypes.JsonRpcSuccessResponse{
						JsonRpc: ahptypes.JsonRpcV2, ID: message.Request.ID, Result: result,
					}})
					if err != nil {
						t.Error(err)
						return
					}
					if err := serverSide.Send(ctx, out); err != nil {
						t.Error(err)
					}
				}()
				defer func() {
					cancel()
					<-serverDone
				}()
				if _, err := client.Initialize(ctx, "accounts-client", ahptypes.SupportedProtocolVersions(), nil); err != nil {
					t.Fatal(err)
				}
				<-serverDone
			}

			var bound ahptypes.AuthenticateParams
			if err := json.Unmarshal([]byte(`{"channel":"ahp-root://","resource":"https://api.example.test","token":"test-token","binding":{"kind":"account","accountId":"a"}}`), &bound); err != nil {
				t.Fatal(err)
			}
			var begin ahptypes.AuthBeginParams
			if err := json.Unmarshal([]byte(`{"channel":"ahp-accounts://","target":{"consumer":{"kind":"agent","provider":"copilot","resource":"https://api.example.test"}},"flows":[{"kind":"clientBrokered"}]}`), &begin); err != nil {
				t.Fatal(err)
			}
			if _, err := client.Authenticate(ctx, bound); err == nil {
				t.Fatal("bound authentication was accepted without advertised support")
			}
			if _, err := client.AuthBegin(ctx, begin); err == nil {
				t.Fatal("authBegin was accepted without advertised support")
			}
			if _, _, err := client.SubscribeAccounts(ctx, nil); err == nil {
				t.Fatal("accounts subscription was accepted without advertised support")
			}
			select {
			case message := <-serverSide.inbox:
				t.Fatalf("unsupported authentication emitted a request: %+v", message)
			default:
			}
		})
	}
}

func TestAccountsClientPreservesRejectionEnvelope(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Shutdown(context.Background())
	subscription := client.AttachSubscription(ahptypes.AccountsResourceURI)
	defer subscription.Close()

	handle, err := client.Dispatch(ctx, ahptypes.AccountsResourceURI, ahptypes.StateAction{
		Value: &ahptypes.AccountRemovedAction{Type: ahptypes.ActionTypeAccountRemoved, Id: "managed"},
	})
	if err != nil {
		t.Fatal(err)
	}
	frame, err := serverSide.Recv(ctx)
	if err != nil {
		t.Fatal(err)
	}
	message, err := frame.IntoParsed()
	if err != nil || message.Notification == nil || message.Notification.Method != "dispatchAction" {
		t.Fatalf("dispatch message = %+v, %v", message, err)
	}
	var dispatched ahptypes.DispatchActionParams
	if err := json.Unmarshal(message.Notification.Params, &dispatched); err != nil {
		t.Fatal(err)
	}
	if dispatched.ClientSeq != handle.ClientSeq {
		t.Fatal("dispatch sequence was lost")
	}
	var envelope ahptypes.ActionEnvelope
	if err := json.Unmarshal([]byte(`{"channel":"ahp-accounts://","serverSeq":2,"action":{"type":"accounts/removed","id":"managed"},"origin":{"clientId":"accounts-client","clientSeq":1},"rejectionReason":"Account is not removable"}`), &envelope); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	out, err := EncodeMessage(ahptypes.JsonRpcMessage{Notification: &ahptypes.JsonRpcNotification{
		JsonRpc: ahptypes.JsonRpcV2, Method: "action", Params: raw,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := serverSide.Send(ctx, out); err != nil {
		t.Fatal(err)
	}
	select {
	case ev := <-subscription.Events():
		action, ok := ev.(SubscriptionEventAction)
		if !ok || action.Envelope.RejectionReason == nil || *action.Envelope.RejectionReason != "Account is not removable" {
			t.Fatalf("rejection was lost: %+v", ev)
		}
		if action.Envelope.Origin == nil || action.Envelope.Origin.ClientSeq != handle.ClientSeq {
			t.Fatalf("rejection correlation was lost: %+v", ev)
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
}

func TestAccountsClientLegacyAuthenticateSurfacesRejectionWithoutRetry(t *testing.T) {
	clientSide, serverSide := newMemTransportPair()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	client, err := Connect(ctx, clientSide, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Shutdown(context.Background())
	serverDone := make(chan struct{})
	go func() {
		defer close(serverDone)
		frame, err := serverSide.Recv(ctx)
		if err != nil {
			t.Error(err)
			return
		}
		message, err := frame.IntoParsed()
		if err != nil || message.Request == nil {
			t.Errorf("request = %+v, %v", message, err)
			return
		}
		var params ahptypes.AuthenticateParams
		if err := json.Unmarshal(message.Request.Params, &params); err != nil {
			t.Error(err)
			return
		}
		if params.Binding != nil || params.Channel != ahptypes.RootResourceURI {
			t.Errorf("legacy params = %+v", params)
		}
		out, err := EncodeMessage(ahptypes.JsonRpcMessage{ErrorResponse: &ahptypes.JsonRpcErrorResponse{
			JsonRpc: ahptypes.JsonRpcV2, ID: message.Request.ID,
			Error: ahptypes.JsonRpcError{Code: ahptypes.ErrorCodeInvalidParams, Message: "Token rejected"},
		}})
		if err != nil {
			t.Error(err)
			return
		}
		if err := serverSide.Send(ctx, out); err != nil {
			t.Error(err)
		}
	}()
	_, err = client.Authenticate(ctx, ahptypes.AuthenticateParams{Resource: "https://api.example.test", Token: "test-token"})
	var rpc *RPCError
	if !errors.As(err, &rpc) || rpc.Code != ahptypes.ErrorCodeInvalidParams {
		t.Fatalf("authentication rejection = %v", err)
	}
	<-serverDone
	select {
	case <-serverSide.inbox:
		t.Fatal("authentication failure triggered a fallback request")
	default:
	}
}
