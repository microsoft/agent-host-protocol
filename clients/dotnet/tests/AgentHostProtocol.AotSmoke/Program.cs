using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;

internal static class Program
{
    public static async Task Main()
    {
        if (JsonSerializer.IsReflectionEnabledByDefault)
        {
            throw new InvalidOperationException("Reflection-based JSON serialization must be disabled.");
        }

        var customOptions = new JsonSerializerOptions();
        customOptions.TypeInfoResolverChain.Add(SmokeJsonContext.Default);
        var serializer = new SystemTextJsonAhpSerializer(customOptions);

        var action = new StateAction(new SessionTitleChangedAction
        {
            Type = ActionType.SessionTitleChanged,
            Title = "AOT",
        });
        var envelope = new ActionEnvelope
        {
            Channel = "ahp-session:/native-aot",
            ServerSeq = 1,
            Action = action,
        };

        string json = serializer.Serialize(envelope);
        ActionEnvelope roundTrip = serializer.Deserialize<ActionEnvelope>(json);
        Ensure(
            roundTrip.Action.Value is SessionTitleChangedAction { Title: "AOT" },
            $"StateAction round-trip failed: {json}; actual={roundTrip.Action.Value?.GetType()}.");

        TransportMessage encoded = serializer.EncodeMessage(new JsonRpcMessage
        {
            Request = new JsonRpcRequest
            {
                Id = 1,
                Method = "smoke",
                Params = serializer.SerializeToElement(envelope),
            },
        });
        JsonRpcMessage decoded = serializer.DecodeMessage(encoded);
        Ensure(decoded.Request is { Method: "smoke" }, "JSON-RPC message round-trip failed.");

        var snapshot = new SnapshotState
        {
            Root = new RootState
            {
                Agents = new List<AgentInfo>(),
            },
        };
        string snapshotJson = serializer.Serialize(snapshot);
        SnapshotState snapshotRoundTrip = serializer.Deserialize<SnapshotState>(snapshotJson);
        Ensure(snapshotRoundTrip.Root is not null, "SnapshotState round-trip failed.");

        StringOrMarkdown markdown = StringOrMarkdown.FromMarkdown("**native**");
        string markdownJson = serializer.Serialize(markdown);
        StringOrMarkdown markdownRoundTrip = serializer.Deserialize<StringOrMarkdown>(markdownJson);
        Ensure(markdownRoundTrip.Markdown == "**native**", "StringOrMarkdown round-trip failed.");

        var custom = new SmokePayload { Value = "custom-context" };
        string customJson = serializer.Serialize(custom);
        SmokePayload customRoundTrip = serializer.Deserialize<SmokePayload>(customJson);
        Ensure(customRoundTrip.Value == custom.Value, "Custom resolver composition failed.");

        Ensure(
            AhpJson.Options.GetTypeInfo(typeof(ActionEnvelope)) is not null,
            "Generated AHP metadata resolver did not provide ActionEnvelope metadata.");

        await RunTransportScenarioAsync(serializer);

        Console.WriteLine(
            "Native AOT smoke passed: initialize, reconnect, ping, subscribe/action/reducer/unsubscribe, "
            + "custom request/notification metadata, and typed/raw/null inbound request results.");
    }

    static async Task RunTransportScenarioAsync(SystemTextJsonAhpSerializer serializer)
    {
        const string envelopeChannel = "ahp-session:/native-aot";
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        CancellationToken cancellationToken = cts.Token;
        var (clientSide, serverSide) = DuplexTransport.CreatePair();
        await using var server = serverSide;
        await using var client = AhpClient.Connect(clientSide, serializer: serializer);

        Task<JsonRpcRequest> initializeResponse = RespondToRequestAsync(
            serverSide,
            serializer,
            "initialize",
            new InitializeResult
            {
                ProtocolVersion = ProtocolVersion.Supported[0],
                ServerSeq = 4,
                Snapshots = new List<Snapshot>(),
            },
            cancellationToken);
        InitializeResult initializeResult = await client.InitializeAsync("native-aot-client", cancellationToken: cancellationToken);
        JsonRpcRequest initializeRequest = await initializeResponse;
        Ensure(initializeResult.ProtocolVersion == ProtocolVersion.Supported[0], "Initialize result failed.");
        Ensure(
            initializeRequest.Params?.GetProperty("clientId").GetString() == "native-aot-client",
            "Initialize params failed.");

        Task<JsonRpcRequest> reconnectResponse = RespondToRequestAsync(
            serverSide,
            serializer,
            "reconnect",
            new ReconnectResult
            {
                Channels = new List<ChannelRecovery>
                {
                    new ChannelRecovery(new ChannelReplayRecovery
                    {
                        Channel = envelopeChannel,
                        Actions = new List<ActionEnvelope>(),
                    }),
                },
            },
            cancellationToken);
        ReconnectResult reconnectResult = await client.ReconnectAsync(
            "native-aot-client",
            subscriptions: new[]
            {
                new ChannelReplayCursor { Channel = envelopeChannel, LastSeenServerSeq = 4 },
            },
            cancellationToken);
        JsonRpcRequest reconnectRequest = await reconnectResponse;
        Ensure(
            reconnectResult.Channels is [{ Value: ChannelReplayRecovery }],
            "Reconnect replay result failed.");
        Ensure(
            reconnectRequest.Params?.GetProperty("subscriptions")[0].GetProperty("lastSeenServerSeq").GetInt64() == 4,
            "Reconnect params failed.");

        Task<JsonRpcRequest> pingResponse = RespondToRequestAsync<object?>(
            serverSide,
            serializer,
            "ping",
            null,
            cancellationToken);
        await client.PingAsync(cancellationToken);
        await pingResponse;

        var initialState = new SessionState
        {
            Provider = "smoke",
            Title = "Before",
            Lifecycle = SessionLifecycle.Ready,
            ActiveClients = new List<SessionActiveClient>(),
            Chats = new List<ChatSummary>(),
        };
        Task<JsonRpcRequest> subscribeResponse = RespondToRequestAsync(
            serverSide,
            serializer,
            "subscribe",
            new SubscribeResult
            {
                Snapshot = new Snapshot
                {
                    Resource = envelopeChannel,
                    FromSeq = 4,
                    State = new SnapshotState { Session = initialState },
                },
            },
            cancellationToken);
        (SubscribeResult subscribeResult, Subscription subscription) = await client.SubscribeAsync(
            envelopeChannel,
            new SubscriptionDeliveryOptions { MaxLatencyMs = 0 },
            cancellationToken);
        await subscribeResponse;

        await serverSide.SendAsync(
            serializer.EncodeMessage(new JsonRpcMessage
            {
                Notification = new JsonRpcNotification
                {
                    Method = "action",
                    Params = serializer.SerializeToElement(new ActionEnvelope
                    {
                        Channel = envelopeChannel,
                        ServerSeq = 5,
                        Action = new StateAction(new SessionTitleChangedAction
                        {
                            Type = ActionType.SessionTitleChanged,
                            Title = "After",
                        }),
                    }),
                },
            }),
            cancellationToken);
        SubscriptionEvent subscriptionEvent = await subscription.Events.ReadAsync(cancellationToken);
        Ensure(subscriptionEvent is SubscriptionEventAction, "Subscription action delivery failed.");
        var actionEvent = (SubscriptionEventAction)subscriptionEvent;
        SessionState reducedState = subscribeResult.Snapshot?.State.Session
            ?? throw new InvalidOperationException("Subscribe snapshot was missing session state.");
        Ensure(
            Reducers.ApplyToSession(reducedState, actionEvent.Envelope.Action) == ReduceOutcome.Applied
                && reducedState.Title == "After",
            "Reducer application failed.");

        Task<JsonRpcRequest> customRequestResponse = RespondToRequestAsync(
            serverSide,
            serializer,
            "smoke/echo",
            new SmokePayload { Value = "custom-response" },
            cancellationToken);
        SmokePayload? customResult = await client.RequestAsync<SmokePayload, SmokePayload>(
            "smoke/echo",
            new SmokePayload { Value = "custom-request" },
            cancellationToken);
        JsonRpcRequest customRequest = await customRequestResponse;
        Ensure(customResult?.Value == "custom-response", "Custom request result failed.");
        Ensure(
            serializer.Deserialize<SmokePayload>(customRequest.Params!.Value).Value == "custom-request",
            "Custom request params failed.");

        Task<JsonRpcMessage> customNotificationReceive = ReceiveMessageAsync(serverSide, serializer, cancellationToken);
        await client.NotifyAsync(
            "smoke/notify",
            new SmokePayload { Value = "custom-notification" },
            cancellationToken);
        JsonRpcMessage customNotification = await customNotificationReceive;
        Ensure(
            customNotification.Notification is { Method: "smoke/notify", Params: { } notificationParams }
                && serializer.Deserialize<SmokePayload>(notificationParams).Value == "custom-notification",
            "Custom notification failed.");

        Task<JsonRpcMessage> unsubscribeReceive = ReceiveMessageAsync(serverSide, serializer, cancellationToken);
        await client.UnsubscribeAsync(envelopeChannel, cancellationToken);
        JsonRpcMessage unsubscribe = await unsubscribeReceive;
        Ensure(unsubscribe.Notification is { Method: "unsubscribe" }, "Unsubscribe notification failed.");

        client.SetResourceRequestHandlers(new ResourceRequestHandlers
        {
            OnResourceRead = parameters => Task.FromResult(new ResourceReadResult
            {
                Data = parameters.Uri,
                Encoding = ContentEncoding.Utf8,
                ContentType = "text/plain",
            }),
        });
        JsonElement resourceResult = await InvokeClientRequestAsync(
            serverSide,
            serializer,
            id: 100,
            method: "resourceRead",
            parameters: new ResourceReadParams
            {
                Channel = ProtocolVersion.RootResourceUri,
                Uri = "virtual://native-aot/resource",
            },
            cancellationToken);
        ResourceReadResult resourceRead = serializer.Deserialize<ResourceReadResult>(resourceResult);
        Ensure(resourceRead.Data == "virtual://native-aot/resource", "Typed inbound resource request failed.");

        client.SetServerRequestHandler((method, _) =>
            Task.FromResult<object?>(
                method == "smoke/server"
                    ? new SmokePayload { Value = "raw-handler-result" }
                    : null));
        JsonElement rawResult = await InvokeClientRequestAsync(
            serverSide,
            serializer,
            id: 101,
            method: "smoke/server",
            parameters: new SmokePayload { Value = "raw-handler-request" },
            cancellationToken);
        Ensure(
            serializer.Deserialize<SmokePayload>(rawResult).Value == "raw-handler-result",
            "Raw inbound request result failed.");

        JsonElement nullResult = await InvokeClientRequestAsync(
            serverSide,
            serializer,
            id: 102,
            method: "smoke/null",
            parameters: new SmokePayload { Value = "raw-handler-null" },
            cancellationToken);
        Ensure(nullResult.ValueKind == JsonValueKind.Null, "Null inbound request result failed.");
    }

    static async Task<JsonRpcRequest> RespondToRequestAsync<TResult>(
        DuplexTransport server,
        SystemTextJsonAhpSerializer serializer,
        string expectedMethod,
        TResult result,
        CancellationToken cancellationToken)
    {
        JsonRpcMessage message = await ReceiveMessageAsync(server, serializer, cancellationToken);
        JsonRpcRequest request = message.Request
            ?? throw new InvalidOperationException($"Expected {expectedMethod} request.");
        Ensure(request.Method == expectedMethod, $"Expected {expectedMethod}, received {request.Method}.");
        await server.SendAsync(
            serializer.EncodeMessage(new JsonRpcMessage
            {
                SuccessResponse = new JsonRpcSuccessResponse
                {
                    Id = request.Id,
                    Result = serializer.SerializeToElement(result),
                },
            }),
            cancellationToken);
        return request;
    }

    static async Task<JsonElement> InvokeClientRequestAsync<TParams>(
        DuplexTransport server,
        SystemTextJsonAhpSerializer serializer,
        ulong id,
        string method,
        TParams parameters,
        CancellationToken cancellationToken)
    {
        await server.SendAsync(
            serializer.EncodeMessage(new JsonRpcMessage
            {
                Request = new JsonRpcRequest
                {
                    Id = id,
                    Method = method,
                    Params = serializer.SerializeToElement(parameters),
                },
            }),
            cancellationToken);
        JsonRpcMessage response = await ReceiveMessageAsync(server, serializer, cancellationToken);
        Ensure(response.SuccessResponse?.Id == id, $"Inbound {method} request did not succeed.");
        return response.SuccessResponse!.Result;
    }

    static async Task<JsonRpcMessage> ReceiveMessageAsync(
        DuplexTransport transport,
        SystemTextJsonAhpSerializer serializer,
        CancellationToken cancellationToken) =>
        serializer.DecodeMessage(await transport.ReceiveAsync(cancellationToken));

    static void Ensure(bool condition, string message)
    {
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }
}

internal sealed class DuplexTransport : ITransport
{
    private readonly ChannelReader<TransportMessage> _incoming;
    private readonly ChannelWriter<TransportMessage> _outgoing;

    private DuplexTransport(
        ChannelReader<TransportMessage> incoming,
        ChannelWriter<TransportMessage> outgoing)
    {
        _incoming = incoming;
        _outgoing = outgoing;
    }

    public static (DuplexTransport First, DuplexTransport Second) CreatePair()
    {
        Channel<TransportMessage> firstToSecond = Channel.CreateUnbounded<TransportMessage>();
        Channel<TransportMessage> secondToFirst = Channel.CreateUnbounded<TransportMessage>();
        return (
            new DuplexTransport(secondToFirst.Reader, firstToSecond.Writer),
            new DuplexTransport(firstToSecond.Reader, secondToFirst.Writer));
    }

    public ValueTask SendAsync(
        TransportMessage message,
        CancellationToken cancellationToken = default) =>
        _outgoing.WriteAsync(message, cancellationToken);

    public ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default) =>
        _incoming.ReadAsync(cancellationToken);

    public ValueTask CloseAsync(CancellationToken cancellationToken = default)
    {
        _outgoing.TryComplete();
        return default;
    }

    public ValueTask DisposeAsync()
    {
        _outgoing.TryComplete();
        return default;
    }
}

internal sealed record SmokePayload
{
    public required string Value { get; init; }
}

[JsonSerializable(typeof(SmokePayload))]
internal sealed partial class SmokeJsonContext : JsonSerializerContext;
