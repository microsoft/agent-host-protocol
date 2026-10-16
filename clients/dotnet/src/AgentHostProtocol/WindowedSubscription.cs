#nullable enable

using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol;

/// <summary>An owned delivery. Release after processing; release and disposal are idempotent.</summary>
public sealed class ReceivedDelivery : IDisposable
{
    private Action? _release;
    public SubscriptionEvent Event { get; }
    public JsonRpcNotification Notification { get; }
    public long WireBytes { get; }
    internal long CreditBytes { get; }
    internal long Epoch { get; }

    internal ReceivedDelivery(SubscriptionEvent value, JsonRpcNotification notification,
        long bytes, long creditBytes, long epoch, Action release)
    {
        Event = value;
        Notification = notification;
        WireBytes = bytes;
        CreditBytes = creditBytes;
        Epoch = epoch;
        _release = release;
    }

    public void Release() => Interlocked.Exchange(ref _release, null)?.Invoke();
    public void Dispose() => Release();
}

/// <summary>The sole credit-owning reader for a channel. Observational streams do not release credit.</summary>
public sealed class WindowedSubscription : IDisposable, IAsyncDisposable
{
    internal readonly object Gate = new();
    internal readonly LinkedList<ReceivedDelivery> Queue = new();
    internal TaskCompletionSource<bool> Available = Signal();
    internal TaskCompletionSource<bool> Writable = Signal();
    internal readonly TaskCompletionSource<bool> Finished = Signal();
    internal readonly List<Channel<FlowControlStatus>> StatusReaders = new();
    internal AhpClient Client;
    internal WindowOptions Options;
    internal Hosts.HostId? HostId;
    internal ChannelReceiveLimits Offer;
    internal ChannelFlowControl? Limits;
    internal string? Fallback;
    internal long Epoch;
    internal long Received;
    internal long Released;
    internal long CreditSent;
    internal long Sent;
    internal long PeerConsumed;
    internal long BufferedSend;
    internal long BufferedReceive;
    internal long LastSeq;
    internal bool AwaitingSnapshot;
    internal bool Negotiating = true;
    internal bool EverAccepted;
    internal bool ResumeWindowed;
    internal bool Closed;
    internal bool SendEof;
    internal bool ReceiveEof;
    internal Exception? CloseError;
    internal bool CreditTimer;
    internal CancellationTokenSource? CreditCancellation;
    internal Action<WindowedSubscription>? OnClosed;
    internal readonly long TelemetryKey;
    internal System.Text.StringBuilder? Fragments;
    internal long FragmentBytes;
    internal readonly LinkedList<WindowSend> Sends = new();
    internal long? BlockedAt;
    private readonly DeliveryReader _reader;

    public string Uri { get; }
    public FlowControlStatus FlowControl
    {
        get
        {
            lock (Gate)
                return new FlowControlStatus
                {
                    Mode = Limits is null ? "ordinary" : "windowed",
                    FallbackReason = Fallback,
                    Limits = Limits,
                    OutstandingSendBytes = Sent - PeerConsumed,
                    BufferedSendBytes = BufferedSend,
                    BufferedReceiveBytes = BufferedReceive,
                    Writable = !Closed && !Negotiating && (Limits is null || Sent - PeerConsumed < Limits.HostReceive.WindowBytes)
                        && BufferedSend < Client.WindowConfig.MaxBufferedSendBytes,
                };
        }
    }
    public long LastAppliedServerSeq { get { lock (Gate) return LastSeq; } }
    public event EventHandler<FlowControlStatus>? FlowControlChanged;
    /// <summary>Manual-mode reader. Use ReadEventsAsync for automatic release on advance.</summary>
    public ChannelReader<ReceivedDelivery> Deliveries =>
        Options.Receive == ReceiveMode.Manual ? _reader
        : throw new InvalidOperationException("Use ReadEventsAsync for an automatic subscription.");

    internal WindowedSubscription(AhpClient client, string uri, WindowOptions options, ChannelReceiveLimits offer)
    {
        Client = client;
        HostId = client.WindowHostId;
        Uri = uri;
        Options = options;
        Offer = offer;
        _reader = new DeliveryReader(this);
        TelemetryKey = AhpTelemetry.TrackWindow(this);
    }

    internal static TaskCompletionSource<bool> Signal() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    public ChannelReader<FlowControlStatus> FlowControlChanges()
    {
        var channel = Channel.CreateBounded<FlowControlStatus>(new BoundedChannelOptions(1)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
        });
        lock (Gate) StatusReaders.Add(channel);
        channel.Writer.TryWrite(FlowControl);
        return channel.Reader;
    }

    public async IAsyncEnumerable<SubscriptionEvent> ReadEventsAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        if (Options.Receive != ReceiveMode.Auto)
            throw new InvalidOperationException("Use Deliveries for a manual subscription.");
        await foreach (var delivery in _reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            using (delivery) yield return delivery.Event;
        }
    }

    public async ValueTask WaitWritableAsync(CancellationToken cancellationToken = default)
    {
        while (true)
        {
            Task wait;
            lock (Gate)
            {
                if (Closed) throw CloseError ?? new AhpClientClosedException();
                if (Client.Completion.IsCompleted) throw new AhpClientClosedException();
                if (FlowControl.Writable) return;
                wait = Writable.Task;
            }
            await wait.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    public Task NotifyAsync<T>(string method, T parameters, CancellationToken cancellationToken = default)
    {
        if (Closed) throw CloseError ?? new AhpClientClosedException();
        var encoded = Client.WindowParameters(parameters);
        if (!encoded.TryGetProperty("channel", out var channel) || channel.GetString() != Uri)
            throw new ArgumentException("The notification must target this subscription.", nameof(parameters));
        return Client.NotifyAsync(method, encoded, cancellationToken);
    }
    public Task<DispatchHandle> DispatchAsync(StateAction action, long? clientSeq = null,
        CancellationToken cancellationToken = default)
    {
        if (Closed) throw CloseError ?? new AhpClientClosedException();
        return Client.DispatchAsync(Uri, action, clientSeq, cancellationToken);
    }
    public Task UnsubscribeAsync(CancellationToken cancellationToken = default)
    {
        if (ReferenceEquals(Client.GetWindowedSubscription(Uri), this) && !Client.Completion.IsCompleted)
            return Client.UnsubscribeAsync(Uri, cancellationToken);
        End();
        return Task.CompletedTask;
    }
    public async ValueTask DisposeAsync() => await UnsubscribeAsync().ConfigureAwait(false);
    public void Dispose()
    {
        if (!Closed && ReferenceEquals(Client.GetWindowedSubscription(Uri), this)) Client.CloseWindowOwner(this);
    }

    internal void Publish()
    {
        var status = FlowControl;
        List<Channel<FlowControlStatus>> readers;
        lock (Gate)
        {
            Writable.TrySetResult(true);
            Writable = Signal();
            readers = new List<Channel<FlowControlStatus>>(StatusReaders);
            if (!status.Writable && !Closed && !Negotiating && BlockedAt is null)
            {
                BlockedAt = System.Diagnostics.Stopwatch.GetTimestamp();
                Client.WindowEvent(this, "blocked");
            }
            else if ((status.Writable || Closed) && BlockedAt is { } start)
            {
                BlockedAt = null;
                AhpTelemetry.WindowBlockedDuration.Record(Compatibility.GetElapsedTime(start).TotalMilliseconds);
                Client.WindowEvent(this, "unblocked");
            }
        }
        foreach (var reader in readers) reader.Writer.TryWrite(status);
        if (FlowControlChanged is { } changed)
            foreach (EventHandler<FlowControlStatus> observer in changed.GetInvocationList())
            {
                try { observer(this, status); }
                catch (Exception) { /* Observational callbacks must not interrupt the protocol driver. */ }
            }
    }

    internal void End(Exception? error = null, bool discard = false)
    {
        lock (Gate)
        {
            if (Closed) return;
            Closed = true;
            Epoch++;
            CreditTimer = false;
            CreditCancellation?.Cancel();
            CloseError = error;
            if (discard)
            {
                foreach (var delivery in Queue) BufferedReceive -= delivery.WireBytes;
                Queue.Clear();
                BufferedReceive -= FragmentBytes;
                FragmentBytes = 0;
                Fragments = null;
            }
            Available.TrySetResult(true);
            Writable.TrySetResult(true);
            foreach (var reader in StatusReaders) reader.Writer.TryComplete(error);
            foreach (var send in Sends) send.Fail(error ?? new AhpClientClosedException());
            Sends.Clear();
            BufferedSend = 0;
            if (Queue.Count == 0) CompleteReader();
        }
        AhpTelemetry.UntrackWindow(TelemetryKey);
        OnClosed?.Invoke(this);
        Publish();
    }

    internal ChannelReader<ReceivedDelivery> InternalDeliveries => _reader;

    private void CompleteReader()
    {
        if (CloseError is { } error) Finished.TrySetException(error);
        else Finished.TrySetResult(true);
    }

    private sealed class DeliveryReader(WindowedSubscription owner) : ChannelReader<ReceivedDelivery>
    {
        public override Task Completion => owner.Finished.Task;
        public override bool TryRead(out ReceivedDelivery item)
        {
            lock (owner.Gate)
            {
                if (owner.Queue.First is { } first)
                {
                    item = first.Value;
                    owner.Queue.RemoveFirst();
                    if (owner.Closed && owner.Queue.Count == 0) owner.CompleteReader();
                    return true;
                }
                item = null!;
                return false;
            }
        }
        public override async ValueTask<bool> WaitToReadAsync(CancellationToken cancellationToken = default)
        {
            while (true)
            {
                Task wait;
                lock (owner.Gate)
                {
                    if (owner.Queue.Count > 0) return true;
                    if (owner.Closed)
                    {
                        if (owner.CloseError is { } error) throw error;
                        return false;
                    }
                    wait = owner.Available.Task;
                }
                await wait.WaitAsync(cancellationToken).ConfigureAwait(false);
            }
        }
    }
}

/// <summary>A notification without a dedicated event variant, including future methods.</summary>
public sealed class SubscriptionEventNotification(JsonRpcNotification notification) : SubscriptionEvent
{
    public JsonRpcNotification Notification { get; } = notification;
}
public sealed class SubscriptionEventTcpData(TcpDataParams parameters) : SubscriptionEvent
{
    public TcpDataParams Params { get; } = parameters;
}
public sealed class SubscriptionEventTcpEof(TcpEofParams parameters) : SubscriptionEvent
{
    public TcpEofParams Params { get; } = parameters;
}
public sealed class SubscriptionEventTcpReset(TcpResetParams parameters) : SubscriptionEvent
{
    public TcpResetParams Params { get; } = parameters;
}

internal sealed class WindowSend
{
    internal JsonRpcNotification Notification;
    internal string Text;
    internal int Offset;
    internal bool Started;
    internal long Bytes;
    internal long FragmentWireBytes;
    internal readonly List<(TaskCompletionSource<bool> Completion, CancellationToken Token)> Waiters = new();
    internal WindowSend(JsonRpcNotification notification, string text, TaskCompletionSource<bool> completion, CancellationToken token)
    {
        Notification = notification;
        Text = text;
        Bytes = (long)text.Length * 2;
        Waiters.Add((completion, token));
    }

    internal void Fail(Exception error) { foreach (var waiter in Waiters) waiter.Completion.TrySetException(error); }
}

internal sealed class WindowWakeSignal
{
    private readonly Channel<bool> _channel = Channel.CreateBounded<bool>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
    internal void Release() => _channel.Writer.TryWrite(true);
    internal async Task WaitAsync(CancellationToken cancellationToken) =>
        _ = await _channel.Reader.ReadAsync(cancellationToken).ConfigureAwait(false);
}
