// A small in-memory AHP host for the windowing examples.
//
// It implements only what the examples need: `initialize`, a windowed
// `subscribe` to one terminal, and the host side of the window rules:
//
// - It counts every data message it sends, in UTF-16 bytes, and stops while
//   `sent - consumed` is at or above the client's window.
// - It counts every data message the client sends, and returns
//   `channel/credit` after it has processed each one.
//
// A real host applies the same rules to every windowed subscription.
#nullable enable

using System.Text;
using System.Text.Encodings.Web;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;

namespace WindowingExamples;

internal sealed class DemoHostOptions
{
    /// <summary>The largest window the host accepts for data that it sends.</summary>
    public required long ClientWindowBytes { get; init; }

    /// <summary>The window the host offers for data that the client sends.</summary>
    public required long HostWindowBytes { get; init; }

    /// <summary>How long the host takes to process one message from the client.</summary>
    public TimeSpan InputDelay { get; init; }
}

internal sealed class WindowingDemoHost : IAsyncDisposable
{
    private const long MaximumFrameBytes = 16_384;

    // Escape JSON the way JavaScript's JSON.stringify does, so the sizes match
    // the TypeScript version of this example.
    private static readonly SystemTextJsonAhpSerializer Json = new(
        new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });

    private readonly DemoHostOptions _options;
    private readonly InMemoryTransport _transport;
    private readonly TaskCompletionSource _subscribed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly SemaphoreSlim _dataLock = new(1, 1);
    private readonly object _gate = new();
    private readonly Channel<(long Bytes, StateAction Action)> _input =
        Channel.CreateUnbounded<(long Bytes, StateAction Action)>(new UnboundedChannelOptions { SingleReader = true });
    private readonly StringBuilder _receivedInput = new();
    private readonly Task _run;
    private readonly Task _processInput;
    private ChannelFlowControl? _limits;
    private string _channel = "";
    private long _serverSeq;

    // Data that the host sends to the client.
    private long _sentBytes;
    private long _consumedBytes;
    private TaskCompletionSource _credit = new(TaskCreationOptions.RunContinuationsAsynchronously);

    // Data that the client sends to the host.
    private long _receivedBytes;
    private long _processedBytes;

    public WindowingDemoHost(DemoHostOptions options)
    {
        _options = options;
        (var client, _transport) = InMemoryTransport.CreatePair();
        ClientTransport = client;
        _run = RunAsync();
        _processInput = ProcessInputAsync();
    }

    /// <summary>The half of the transport to give to <see cref="AhpClient"/>.</summary>
    public ITransport ClientTransport { get; }

    /// <summary>Terminal input that the host has processed, in order.</summary>
    public string ReceivedInput
    {
        get { lock (_gate) return _receivedInput.ToString(); }
    }

    /// <summary>Completes after the host has accepted the subscription and sent the snapshot.</summary>
    public Task WhenSubscribedAsync() => _subscribed.Task;

    /// <summary>Sends one terminal action, first waiting for credit if the client's window is full.</summary>
    public async Task SendActionAsync(StateAction action, CancellationToken cancellationToken = default)
    {
        await _dataLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            long window;
            lock (_gate)
                window = (_limits ?? throw new InvalidOperationException("no windowed subscription")).ClientReceive.WindowBytes;
            if (Outstanding() >= window)
            {
                Log($"window full ({Outstanding()} of {window} bytes outstanding); pausing output");
                while (true)
                {
                    Task credit;
                    lock (_gate)
                    {
                        if (_sentBytes - _consumedBytes < window) break;
                        credit = _credit.Task;
                    }
                    await credit.WaitAsync(cancellationToken).ConfigureAwait(false);
                }
                long consumed;
                lock (_gate) consumed = _consumedBytes;
                Log($"credit received (consumedBytes={consumed}); resuming output");
            }
            await SendDataAsync(new JsonRpcNotification
            {
                Method = "action",
                Params = Json.SerializeToElement(new ActionEnvelope
                {
                    Channel = _channel,
                    Action = action,
                    ServerSeq = ++_serverSeq,
                }),
            }).ConfigureAwait(false);
        }
        finally
        {
            _dataLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _transport.CloseAsync().ConfigureAwait(false);
        await Task.WhenAll(_run, _processInput).ConfigureAwait(false);
        _dataLock.Dispose();
    }

    private static void Log(string message) => Console.WriteLine($"  host   | {message}");

    private static long Utf16Bytes(string text) => (long)text.Length * 2;

    private long Outstanding()
    {
        lock (_gate) return _sentBytes - _consumedBytes;
    }

    // Callers hold _dataLock, so data messages keep their serverSeq order.
    private async Task SendDataAsync(JsonRpcNotification notification)
    {
        var text = Json.EncodeMessage(new JsonRpcMessage { Notification = notification }).Text!;
        lock (_gate) _sentBytes += Utf16Bytes(text);
        await _transport.SendAsync(TransportMessage.FromText(text)).ConfigureAwait(false);
    }

    private ValueTask SendControlAsync(JsonRpcMessage message) =>
        _transport.SendAsync(Json.EncodeMessage(message));

    private static JsonRpcMessage Response<T>(ulong id, T result) => new()
    {
        SuccessResponse = new JsonRpcSuccessResponse { Id = id, Result = Json.SerializeToElement(result) },
    };

    private async Task RunAsync()
    {
        try
        {
            while (true)
            {
                TransportMessage frame;
                try
                {
                    frame = await _transport.ReceiveAsync().ConfigureAwait(false);
                }
                catch (AhpTransportException)
                {
                    return;
                }
                if (frame.Frame != TransportFrame.Text) continue;
                var message = Json.DecodeMessage(frame);
                switch (message.Request?.Method ?? message.Notification?.Method)
                {
                    case "initialize":
                        await SendControlAsync(Response(message.Request!.Id, new InitializeResult
                        {
                            ProtocolVersion = ProtocolVersion.Supported[0],
                            ServerSeq = 0,
                            Snapshots = new List<Snapshot>(),
                        })).ConfigureAwait(false);
                        break;
                    case "subscribe":
                        await AcceptSubscriptionAsync(message.Request!).ConfigureAwait(false);
                        break;
                    case "channel/credit":
                        ReceiveCredit(Json.Deserialize<ChannelCreditParams>(message.Notification!.Params!.Value));
                        break;
                    case "dispatchAction":
                        ReceiveInput(frame.Text!, Json.Deserialize<DispatchActionParams>(message.Notification!.Params!.Value).Action);
                        break;
                }
            }
        }
        finally
        {
            _input.Writer.TryComplete();
        }
    }

    private void ReceiveCredit(ChannelCreditParams credit)
    {
        lock (_gate)
        {
            // Credit is a running total, so ignore values that are not larger.
            if (credit.ConsumedBytes <= _consumedBytes) return;
            _consumedBytes = credit.ConsumedBytes;
            _credit.TrySetResult();
            _credit = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        }
    }

    private async Task AcceptSubscriptionAsync(JsonRpcRequest request)
    {
        var parameters = Json.Deserialize<SubscribeParams>(request.Params!.Value);
        var offered = parameters.FlowControl?.Receive
            ?? throw new InvalidOperationException("the examples expect a windowed subscribe");
        await _dataLock.WaitAsync().ConfigureAwait(false);
        try
        {
            _channel = parameters.Channel;
            // A host can lower the limits that the client offered, but never raise them.
            var limits = new ChannelFlowControl
            {
                ClientReceive = new ChannelReceiveLimits
                {
                    WindowBytes = Math.Min(offered.WindowBytes, _options.ClientWindowBytes),
                    MaximumFrameBytes = Math.Min(offered.MaximumFrameBytes, MaximumFrameBytes),
                },
                HostReceive = new ChannelReceiveLimits
                {
                    WindowBytes = _options.HostWindowBytes,
                    MaximumFrameBytes = MaximumFrameBytes,
                },
            };
            lock (_gate) _limits = limits;
            Log($"accepted windowed delivery: client window {limits.ClientReceive.WindowBytes} bytes "
                + $"(offered {offered.WindowBytes}), host window {limits.HostReceive.WindowBytes} bytes");
            await SendControlAsync(Response(request.Id, new SubscribeResult { FlowControl = limits })).ConfigureAwait(false);

            // The first data message on a windowed subscription is always the snapshot.
            await SendDataAsync(new JsonRpcNotification
            {
                Method = "channel/snapshot",
                Params = Json.SerializeToElement(new ChannelSnapshotParams
                {
                    Channel = _channel,
                    Snapshot = new Snapshot
                    {
                        Resource = _channel,
                        State = new SnapshotState
                        {
                            Terminal = new TerminalState
                            {
                                Title = "demo shell",
                                Content = new List<TerminalContentPart>(),
                                Lifecycle = new TerminalLifecycleState(new TerminalRunningLifecycleState()),
                                Claim = new TerminalClaim(new TerminalClientClaim { ClientId = "windowing-example" }),
                            },
                        },
                        FromSeq = _serverSeq,
                    },
                }),
            }).ConfigureAwait(false);
        }
        finally
        {
            _dataLock.Release();
        }
        _subscribed.TrySetResult();
    }

    private void ReceiveInput(string text, StateAction action)
    {
        var bytes = Utf16Bytes(text);
        lock (_gate)
        {
            _receivedBytes += bytes;
            var limits = _limits!.HostReceive;
            // The client can go past the window only with the message that fills it.
            if (_receivedBytes - _processedBytes > limits.WindowBytes + limits.MaximumFrameBytes)
                Log("client went past the host window");
        }
        _input.Writer.TryWrite((bytes, action));
    }

    // Process input one message at a time, then return credit for it.
    private async Task ProcessInputAsync()
    {
        await foreach (var (bytes, action) in _input.Reader.ReadAllAsync().ConfigureAwait(false))
        {
            await Task.Delay(_options.InputDelay).ConfigureAwait(false);
            long processed;
            lock (_gate)
            {
                if (action.Value is TerminalInputAction input) _receivedInput.Append(input.Data);
                _processedBytes += bytes;
                processed = _processedBytes;
            }
            try
            {
                await SendControlAsync(new JsonRpcMessage
                {
                    Notification = new JsonRpcNotification
                    {
                        Method = "channel/credit",
                        Params = Json.SerializeToElement(new ChannelCreditParams { Channel = _channel, ConsumedBytes = processed }),
                    },
                }).ConfigureAwait(false);
            }
            catch (AhpTransportException)
            {
                return;
            }
        }
    }
}
