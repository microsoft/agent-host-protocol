#nullable enable

using System.Collections.Concurrent;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol;

public sealed partial class AhpClient
{
    private sealed class WindowResponse
    {
        internal readonly IReadOnlyList<WindowedSubscription> Owners;
        internal Action<JsonElement?, Exception?> Apply = null!;
        internal readonly Action<Exception> Cleanup;
        private int _phase;
        internal bool Abandoned;
        internal Exception? Failure;

        internal WindowResponse(IReadOnlyList<WindowedSubscription> owners, Action<Exception> cleanup)
        {
            Owners = owners;
            Cleanup = cleanup;
        }

        internal bool TryStart() => Interlocked.CompareExchange(ref _phase, 1, 0) == 0;
        internal bool Abandon(Exception error)
        {
            Failure = error;
            Abandoned = true;
            var unsent = Interlocked.CompareExchange(ref _phase, 2, 0) == 0;
            Cleanup(error);
            return unsent;
        }
    }

    private readonly object _windowGate = new();
    private readonly Dictionary<string, WindowedSubscription> _windows = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<ulong, WindowResponse> _windowResponses = new();
    private readonly LinkedList<string> _closedWindowOrder = new();
    private readonly Dictionary<string, LinkedListNode<string>> _closedWindows = new(StringComparer.Ordinal);
    private readonly System.Runtime.CompilerServices.ConditionalWeakTable<SubscribeParams, WindowOptions> _windowRequestOptions = new();
    private readonly List<Channel<FlowControlEvent>> _flowEventReaders = new();
    private readonly WindowWakeSignal _writerWake = new();
    private int _windowTurn;
    private WindowSend? _windowInFlight;
    private bool RequiresWindowSizes
    {
        get { lock (_windowGate) return _windows.Values.Any(owner => owner.Limits is not null); }
    }
    internal WindowingConfig WindowConfig => _cfg.Windowing;
    internal JsonElement WindowParameters<T>(T parameters) => _serializer.SerializeToElement(parameters);
    internal Action<WindowedSubscription, JsonRpcNotification, SubscriptionEvent>? ManagedWindowEvent { get; set; }
    internal bool RetainManagedWindows { get; set; }
    internal Hosts.HostId? WindowHostId { get; set; }
    internal Action<FlowControlEvent>? ManagedFlowEvent { get; set; }

    public WindowedSubscription? GetWindowedSubscription(string uri)
    {
        lock (_windowGate) return _windows.TryGetValue(uri, out var owner) ? owner : null;
    }

    public ChannelReader<FlowControlEvent> FlowControlEvents()
    {
        var channel = Channel.CreateBounded<FlowControlEvent>(
            new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.DropOldest });
        lock (_windowGate) _flowEventReaders.Add(channel);
        return channel.Reader;
    }

    internal void WindowEvent(WindowedSubscription owner, string kind, long bytes = 0)
    {
        var value = new FlowControlEvent(owner.Uri, kind, owner.FlowControl, bytes) { HostId = owner.HostId };
        lock (_windowGate)
            foreach (var reader in _flowEventReaders) reader.Writer.TryWrite(value);
        AhpTelemetry.FlowEvent(value);
        ManagedFlowEvent?.Invoke(value);
    }

    private ChannelReceiveLimits WindowOffer(WindowOptions options)
    {
        if (options.Receive is not ReceiveMode.Auto and not ReceiveMode.Manual)
            throw new ArgumentOutOfRangeException(nameof(options));
        var transportDefault = _transport is ITransportMessageLimits { MaximumInboundMessageBytes: > 0 } limited
            ? 2 * (limited.MaximumInboundMessageBytes!.Value / 3)
            : 1048576;
        var result = new ChannelReceiveLimits
        {
            WindowBytes = options.WindowBytes ?? WindowConfig.WindowBytes,
            MaximumFrameBytes = options.MaximumFrameBytes ?? WindowConfig.MaximumFrameBytes ?? transportDefault,
        };
        WindowingConfig.Validate(result.WindowBytes, 1, nameof(options.WindowBytes));
        WindowingConfig.Validate(result.MaximumFrameBytes, 1024, nameof(options.MaximumFrameBytes));
        return result;
    }

    public async Task<(SubscribeResult Result, WindowedSubscription Sub)> SubscribeWindowedAsync(
        string uri, WindowOptions? options = null, CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(uri, nameof(uri));
        cancellationToken.ThrowIfCancellationRequested();
        var copy = (options ?? new WindowOptions()).Snapshot();
        var offer = WindowOffer(copy);
        WindowedSubscription owner;
        lock (_windowGate)
        {
            if (_windows.TryGetValue(uri, out var closing) && closing.Closed)
                throw new InvalidOperationException("The subscription is closing.");
            if (!_windows.TryGetValue(uri, out owner!))
            {
                owner = new WindowedSubscription(this, uri, copy, offer);
                _windows.Add(uri, owner);
            }
        }
        var request = new SubscribeParams
        {
            Channel = uri,
            FlowControl = new SubscriptionFlowControlOptions { Receive = offer },
        };
        _windowRequestOptions.Add(request, copy);
        SubscribeResult result;
        try
        {
            result = await RequestAsync<SubscribeParams, SubscribeResult>("subscribe", request, cancellationToken).ConfigureAwait(false)
                ?? throw Protocol("subscribe returned no result");
        }
        catch (Exception error)
        {
            CleanupUnacceptedWindow(owner, error);
            throw;
        }
        finally { _windowRequestOptions.Remove(request); }
        return (result, owner);
    }

    public async Task<ReconnectResult> ResumeAsync(ReconnectParams parameters, CancellationToken cancellationToken = default)
    {
        try
        {
            var result = await RequestAsync<ReconnectParams, ReconnectResult>("reconnect", parameters, cancellationToken).ConfigureAwait(false)
                ?? throw Protocol("reconnect returned no result");
            AhpTelemetry.Reconnects.Add(1, new KeyValuePair<string, object?>(AhpTelemetryNames.AttrOutcome, AhpTelemetryNames.OutcomeOk));
            return result;
        }
        catch
        {
            AhpTelemetry.Reconnects.Add(1, new KeyValuePair<string, object?>(AhpTelemetryNames.AttrOutcome, AhpTelemetryNames.OutcomeError));
            throw;
        }
    }

    internal bool BindManagedWindow(WindowedSubscription owner)
    {
        lock (owner.Gate)
        {
            if (owner.Closed) return false;
            owner.Client = this;
            owner.HostId = WindowHostId;
            owner.Epoch++;
            owner.Closed = false;
            owner.CloseError = null;
            owner.Negotiating = true;
            owner.Limits = null;
            owner.Received = owner.Released = owner.CreditSent = owner.Sent = owner.PeerConsumed = 0;
            owner.CreditTimer = false;
            owner.BufferedReceive -= owner.FragmentBytes;
            owner.Fragments = null;
            owner.FragmentBytes = 0;
            owner.Offer = WindowOffer(owner.Options);
        }
        lock (_windowGate) _windows[owner.Uri] = owner;
        return true;
    }

    private void PrepareWindowResponse(ulong id, string method, JsonElement? parameters, WindowOptions? requestedOptions,
        CancellationToken cancellationToken)
    {
        if (parameters is not { } p) return;
        if (method == "subscribe" && p.TryGetProperty("channel", out var channelEl) && channelEl.GetString() is { } uri)
        {
            var owner = GetWindowedSubscription(uri);
            ChannelReceiveLimits? offer = null;
            if (p.TryGetProperty("flowControl", out var flow))
            {
                offer = _serializer.Deserialize<SubscriptionFlowControlOptions>(flow).Receive;
                WindowingConfig.Validate(offer.WindowBytes, 1, "windowBytes");
                WindowingConfig.Validate(offer.MaximumFrameBytes, 1024, "maximumFrameBytes");
                if (owner is null)
                {
                    owner = new WindowedSubscription(this, uri, new WindowOptions(), offer);
                    lock (_windowGate) _windows[uri] = owner;
                }
            }
            if (owner is null) return;
            var target = owner;
            var pendingOptions = requestedOptions;
            var initial = owner.Negotiating;
            var response = new WindowResponse(new[] { target }, error => CleanupUnacceptedWindow(target, error));
            response.Apply = (result, error) =>
            {
                if (result is null)
                {
                    response.Cleanup(error ?? new AhpClientClosedException("Subscribe failed."));
                    return;
                }
                if (target.Closed || !ReferenceEquals(GetWindowedSubscription(uri), target))
                {
                    if (GetWindowedSubscription(uri) is null) _ = UnsubscribeOwnerAsync(target);
                    return;
                }
                var decoded = _serializer.Deserialize<SubscribeResult>(result.Value);
                if (decoded.FlowControl is not null && decoded.Snapshot is not null)
                    throw Protocol("windowed subscribe returned a snapshot");
                InstallWindow(target, decoded.FlowControl, offer, true);
                lock (target.Gate)
                {
                    if (pendingOptions is not null) target.Options = pendingOptions;
                }
                if (decoded.Snapshot is { } snapshot)
                    ReceiveWindowMessage(target, SnapshotNotification(snapshot), 0, 0);
                if (initial && (!_pending.ContainsKey(id) || cancellationToken.IsCancellationRequested))
                    CloseWindowOwner(target);
            };
            _windowResponses[id] = response;
        }
        else if (method == "reconnect")
        {
            var windows = p.TryGetProperty("windows", out var windowsEl)
                ? _serializer.Deserialize<ChannelDeliveryResumeOptions>(windowsEl) : null;
            var requested = new Dictionary<string, (WindowedSubscription Owner, ChannelReceiveLimits Offer)>(StringComparer.Ordinal);
            foreach (var item in windows?.Items ?? new List<ChannelDeliveryResumeParams>())
            {
                if (item.Channel.StartsWith("ahp-tcp:", StringComparison.Ordinal))
                    throw Protocol("TCP subscriptions cannot reconnect");
                if (!p.GetProperty("subscriptions").EnumerateArray().Any(x => x.GetString() == item.Channel)
                    || requested.ContainsKey(item.Channel))
                    throw Protocol("invalid reconnect window subscriptions");
                var owner = GetWindowedSubscription(item.Channel);
                if (owner is null)
                {
                    owner = new WindowedSubscription(this, item.Channel, new WindowOptions(), item.FlowControl.Receive);
                    lock (_windowGate) _windows[item.Channel] = owner;
                }
                requested.Add(item.Channel, (owner, item.FlowControl.Receive));
            }
            List<WindowedSubscription> ordinary;
            lock (_windowGate) ordinary = _windows.Values.Where(x => !x.ResumeWindowed && x.EverAccepted && !x.Closed).ToList();
            if (requested.Count == 0 && ordinary.Count == 0) return;
            var targets = requested.Values.Select(x => x.Owner).Concat(ordinary).ToList();
            var response = new WindowResponse(targets, error =>
            {
                foreach (var target in targets) CleanupUnacceptedWindow(target, error);
            });
            response.Apply = (result, error) =>
            {
                if (result is null)
                {
                    response.Cleanup(error ?? new AhpClientClosedException("Reconnect failed."));
                    return;
                }
                var retained = new HashSet<string>(StringComparer.Ordinal);
                if (result.Value.TryGetProperty("windows", out var returned))
                {
                    foreach (var item in _serializer.Deserialize<ChannelDeliveryResumeResult>(returned).Items)
                    {
                        if (!requested.TryGetValue(item.Channel, out var state) || !retained.Add(item.Channel))
                            throw Protocol("unsolicited reconnect window");
                        if (state.Owner.Closed || !ReferenceEquals(GetWindowedSubscription(item.Channel), state.Owner))
                        {
                            if (GetWindowedSubscription(item.Channel) is null) _ = UnsubscribeOwnerAsync(state.Owner);
                            continue;
                        }
                        InstallWindow(state.Owner, item.FlowControl, state.Offer, item.Recovery == ChannelRecoveryKind.Snapshot);
                        WindowEvent(state.Owner, "resumed");
                    }
                }
                foreach (var item in requested)
                    if (!retained.Contains(item.Key))
                    {
                        item.Value.Owner.End(Protocol("subscription was not retained"), true);
                        WindowEvent(item.Value.Owner, "dropped");
                        RemoveWindow(item.Value.Owner);
                    }
                RecoverOrdinaryWindows(_serializer.Deserialize<ReconnectResult>(result.Value));
            };
            _windowResponses[id] = response;
        }
    }

    private void InstallWindow(WindowedSubscription owner, ChannelFlowControl? limits, ChannelReceiveLimits? offer, bool snapshot)
    {
        if (limits is not null)
        {
            if (offer is null) throw Protocol("unsolicited window acceptance");
            ValidateLimits(limits.ClientReceive);
            ValidateLimits(limits.HostReceive);
            if (limits.ClientReceive.WindowBytes > offer.WindowBytes || limits.ClientReceive.MaximumFrameBytes > offer.MaximumFrameBytes)
                throw Protocol("accepted limits exceed the offer");
        }
        else if (owner.Uri.StartsWith("ahp-tcp:", StringComparison.Ordinal))
            throw Protocol("TCP requires windowed delivery");
        lock (owner.Gate)
        {
            if (owner.Limits is null || limits is null)
            {
                owner.Epoch++;
                owner.Sent = owner.PeerConsumed = owner.Received = owner.Released = owner.CreditSent = 0;
                owner.Fragments = null;
                owner.FragmentBytes = 0;
            }
            ForgetClosedWindow(owner.Uri);
            owner.Offer = offer ?? owner.Offer;
            owner.Limits = limits;
            owner.ResumeWindowed = limits is not null;
            owner.Fallback = limits is null && offer is not null ? "declined" : null;
            owner.Negotiating = false;
            owner.EverAccepted = true;
            owner.AwaitingSnapshot = limits is not null && snapshot;
        }
        owner.Publish();
        WindowEvent(owner, limits is null && offer is not null ? "declined" : "negotiated");
        _writerWake.Release();
    }

    private static void ValidateLimits(ChannelReceiveLimits limits)
    {
        if (limits.WindowBytes < 1 || limits.MaximumFrameBytes < 1024
            || limits.WindowBytes > 9007199254740991 || limits.MaximumFrameBytes > 9007199254740991)
            throw Protocol("invalid window limits");
    }

    internal static long RawWindowBytes(TransportMessage message) =>
        checked((long)(message.Text ?? new UTF8Encoding(false, true).GetString(message.Binary.ToArray())).Length * 2);
    private static AhpTransportException Protocol(string message) => new("protocol", "ahp: " + message);

    private JsonRpcNotification SnapshotNotification(Snapshot snapshot) => new()
    {
        Method = "channel/snapshot",
        Params = _serializer.SerializeToElement(new ChannelSnapshotParams { Channel = snapshot.Resource, Snapshot = snapshot }),
    };

    private bool HandleWindowNotification(JsonRpcNotification notification, long bytes)
    {
        if (notification.Params is not { } parameters
            || !parameters.TryGetProperty("channel", out var channel)
            || channel.GetString() is not { } uri) return false;
        var owner = GetWindowedSubscription(uri);
        if (owner is null)
        {
            if (IsClosedWindow(uri)) return true;
            if (notification.Method is "channel/frame" or "channel/snapshot" or "channel/credit")
                throw Protocol("window message without a subscription");
            return false;
        }
        if (owner.Closed) return true;
        if (owner.Negotiating && notification.Method is not "channel/credit")
        {
            if (IsClosedWindow(uri)) return true;
            if (notification.Method is "channel/frame" or "channel/snapshot" || owner.ResumeWindowed)
                throw Protocol("data before negotiation completed");
            return false;
        }
        if (notification.Method == "channel/credit")
        {
            var consumed = _serializer.Deserialize<ChannelCreditParams>(parameters).ConsumedBytes;
            lock (owner.Gate)
            {
                if (owner.Limits is null) throw Protocol("credit on an ordinary subscription");
                if (consumed < 0 || consumed > owner.Sent) throw Protocol("credit exceeds sent bytes");
                if (consumed > owner.PeerConsumed) owner.PeerConsumed = consumed;
            }
            AhpTelemetry.WindowCreditBytesReceived.Add(bytes);
            WindowEvent(owner, "creditReceived", bytes);
            owner.Publish();
            _writerWake.Release();
            return true;
        }
        var counted = owner.Limits is not null && WindowedDelivery.CountsAgainstWindow(notification.Method);
        if (counted)
        {
            if (bytes > owner.Limits!.ClientReceive.MaximumFrameBytes) throw Protocol("data exceeds maximumFrameBytes");
            lock (owner.Gate)
            {
                owner.Received = checked(owner.Received + bytes);
                owner.BufferedReceive = checked(owner.BufferedReceive + bytes);
            }
            AhpTelemetry.WindowDataBytesReceived.Add(bytes);
        }
        if (notification.Method == "channel/frame")
        {
            if (!counted) throw Protocol("fragment on an ordinary subscription");
            var fragment = _serializer.Deserialize<ChannelFrameParams>(parameters);
            if (fragment.Data.Length == 0 || char.IsLowSurrogate(fragment.Data[0]) || char.IsHighSurrogate(fragment.Data[fragment.Data.Length - 1]))
                throw Protocol("invalid fragment boundary");
            string? joined = null;
            long total;
            lock (owner.Gate)
            {
                owner.Fragments ??= new StringBuilder();
                owner.Fragments.Append(fragment.Data);
                owner.FragmentBytes = checked(owner.FragmentBytes + bytes);
                total = owner.FragmentBytes;
                if (fragment.Final == true)
                {
                    joined = owner.Fragments.ToString();
                    owner.Fragments = null;
                    owner.FragmentBytes = 0;
                }
            }
            if (joined is null)
                ReleaseWindowBytes(owner, bytes, owner.Epoch, true);
            else
            {
                WindowEvent(owner, "fragmentedMessageReceived", total);
                var message = _serializer.DecodeMessage(TransportMessage.FromText(joined));
                var inner = message.Notification ?? throw Protocol("fragment did not contain a notification");
                if (inner.Method == "channel/frame" || !WindowedDelivery.CountsAgainstWindow(inner.Method)
                    || inner.Params?.GetProperty("channel").GetString() != uri)
                    throw Protocol("invalid joined fragment channel or method");
                ReceiveWindowMessage(owner, inner, total, bytes);
            }
            return true;
        }
        if (counted && owner.Fragments is not null) throw Protocol("data interleaved with fragments");
        if (notification.Method == "tcp/reset")
        {
            lock (owner.Gate)
            {
                owner.Fragments = null;
                foreach (var send in owner.Sends) send.Fail(Protocol("TCP reset"));
                owner.Sends.Clear();
                owner.BufferedSend = 0;
                foreach (var delivery in owner.Queue) owner.BufferedReceive -= delivery.WireBytes;
                owner.Queue.Clear();
                owner.BufferedReceive -= owner.FragmentBytes;
                owner.FragmentBytes = 0;
            }
        }
        if (notification.Method == "tcp/data")
        {
            if (owner.ReceiveEof) throw Protocol("TCP data after EOF");
            ValidateTcpData(parameters.GetProperty("data").GetString()!);
        }
        if (notification.Method == "tcp/eof") owner.ReceiveEof = true;
        ReceiveWindowMessage(owner, notification, counted ? bytes : 0, counted ? bytes : 0);
        if (notification.Method == "tcp/reset")
        {
            owner.End();
            _ = UnsubscribeOwnerAsync(owner);
        }
        return true;
    }

    internal void RecoverOrdinaryWindows(ReconnectResult result)
    {
        List<WindowedSubscription> owners;
        lock (_windowGate) owners = _windows.Values.Where(x => !x.ResumeWindowed && !x.Closed).ToList();
        foreach (var owner in owners)
        {
            owner.Negotiating = false;
            owner.Publish();
            if (result.Value is ReconnectReplayResult replay)
                foreach (var action in replay.Actions.Where(x => x.Channel == owner.Uri))
                    ReceiveWindowMessage(owner, new JsonRpcNotification
                    {
                        Method = "action",
                        Params = _serializer.SerializeToElement(action),
                    }, 0, 0);
            if (result.Value is ReconnectSnapshotResult snapshot)
                foreach (var state in snapshot.Snapshots.Where(x => x.Resource == owner.Uri))
                    ReceiveWindowMessage(owner, SnapshotNotification(state), 0, 0);
        }
    }

    private SubscriptionEvent WindowEventValue(JsonRpcNotification notification)
    {
        var p = notification.Params ?? throw Protocol("notification has no params");
        return notification.Method switch
        {
            "action" => new SubscriptionEventAction(_serializer.Deserialize<ActionEnvelope>(p)),
            "channel/snapshot" => new SubscriptionEventSnapshot(_serializer.Deserialize<ChannelSnapshotParams>(p).Snapshot),
            "tcp/data" => new SubscriptionEventTcpData(_serializer.Deserialize<TcpDataParams>(p)),
            "tcp/eof" => new SubscriptionEventTcpEof(_serializer.Deserialize<TcpEofParams>(p)),
            "tcp/reset" => new SubscriptionEventTcpReset(_serializer.Deserialize<TcpResetParams>(p)),
            "root/sessionAdded" => new SubscriptionEventSessionAdded(_serializer.Deserialize<SessionAddedParams>(p)),
            "root/sessionRemoved" => new SubscriptionEventSessionRemoved(_serializer.Deserialize<SessionRemovedParams>(p)),
            "root/sessionSummaryChanged" => new SubscriptionEventSessionSummaryChanged(_serializer.Deserialize<SessionSummaryChangedParams>(p)),
            "root/progress" => new SubscriptionEventProgress(_serializer.Deserialize<ProgressParams>(p)),
            "auth/required" => new SubscriptionEventAuthRequired(_serializer.Deserialize<AuthRequiredParams>(p)),
            _ => new SubscriptionEventNotification(notification),
        };
    }

    [System.Diagnostics.CodeAnalysis.SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
        Justification = "The reliable queue transfers delivery ownership to its consumer; coalescing replaces leases without releasing their credit.")]
    private void ReceiveWindowMessage(WindowedSubscription owner, JsonRpcNotification notification, long bytes, long credit, bool observe = true)
    {
        if (owner.AwaitingSnapshot && WindowedDelivery.CountsAgainstWindow(notification.Method))
        {
            if (notification.Method != "channel/snapshot") throw Protocol("first data is not a snapshot");
            owner.AwaitingSnapshot = false;
        }

        if (notification.Method == "channel/snapshot"
            && notification.Params!.Value.GetProperty("snapshot").GetProperty("resource").GetString() != owner.Uri)
            throw Protocol("snapshot resource mismatch");
        var value = WindowEventValue(notification);
        var epoch = owner.Epoch;
        var delivery = new ReceivedDelivery(value, notification, bytes, credit, epoch,
            () => owner.Client.ReleaseDelivery(owner, bytes, credit, epoch));
        lock (owner.Gate)
        {
            if (value is SubscriptionEventAction action) owner.LastSeq = Math.Max(owner.LastSeq, action.Envelope.ServerSeq);
            if (value is SubscriptionEventSnapshot snapshot) owner.LastSeq = Math.Max(owner.LastSeq, snapshot.Snapshot.FromSeq);
            if (owner.Limits is not null && owner.Options.Coalescing && owner.Queue.Last is { } tail && tail.Value.Epoch == epoch)
            {
                var merged = Coalesce(tail.Value.Notification, notification, owner, CoalescingDirection.Incoming);
                if (merged is not null)
                {
                    var total = checked(bytes + tail.Value.WireBytes);
                    var owed = checked(credit + tail.Value.CreditBytes);
                    delivery = new ReceivedDelivery(WindowEventValue(merged), merged, total, owed, epoch,
                        () => owner.Client.ReleaseDelivery(owner, total, owed, epoch));
                    owner.Queue.RemoveLast();
                    WindowEvent(owner, "coalesced", total);
                }
            }
            if (owner.Limits is null && owner.Queue.Count >= _cfg.SubscriptionBufferCapacity)
                owner.Queue.RemoveFirst();
            owner.Queue.AddLast(delivery);
            owner.Available.TrySetResult(true);
            owner.Available = WindowedSubscription.Signal();
        }
        if (observe)
        {
            FanOut(owner.Uri, value);
            ManagedWindowEvent?.Invoke(owner, notification, value);
        }
        owner.Publish();
    }

    private void ReleaseWindowBytes(WindowedSubscription owner, long bytes, long epoch, bool immediate = false)
    {
        if (bytes == 0) return;
        bool flush;
        lock (owner.Gate)
        {
            if (owner.Closed || owner.Epoch != epoch || owner.Limits is null || owner.Negotiating) return;
            owner.Released = checked(owner.Released + bytes);
            var threshold = Math.Max(1, Math.Min(16384, owner.Limits.ClientReceive.WindowBytes / 4));
            flush = immediate || owner.Released - owner.CreditSent >= threshold
                || owner.Received - owner.CreditSent >= owner.Limits.ClientReceive.WindowBytes;
            if (!flush && !owner.CreditTimer)
            {
                owner.CreditTimer = true;
                _ = FlushCreditLaterAsync(owner, epoch);
            }

        }
        if (flush) _writerWake.Release();
        owner.Publish();
    }

    private void ReleaseDelivery(WindowedSubscription owner, long bytes, long credit, long epoch)
    {
        lock (owner.Gate) owner.BufferedReceive -= bytes;
        ReleaseWindowBytes(owner, credit, epoch);
        owner.Publish();
    }

    private async Task FlushCreditLaterAsync(WindowedSubscription owner, long epoch)
    {
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(_lifetimeCts.Token);
        lock (owner.Gate)
        {
            if (owner.Closed || owner.Epoch != epoch) return;
            owner.CreditCancellation = cancellation;
        }
        try
        {
            await TimeProviderCompatibility.DelayAsync(_cfg.TimeProvider, TimeSpan.FromMilliseconds(5), cancellation.Token).ConfigureAwait(false);
            _writerWake.Release();
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        finally
        {
            lock (owner.Gate)
                if (ReferenceEquals(owner.CreditCancellation, cancellation))
                {
                    owner.CreditCancellation = null;
                    owner.CreditTimer = false;
                }
        }
    }

    private string EncodeWindow(JsonRpcNotification notification) =>
        _serializer.EncodeMessage(new JsonRpcMessage { Notification = notification }).Text
        ?? throw Protocol("serializer must encode text");

    private JsonRpcNotification? Coalesce(JsonRpcNotification older, JsonRpcNotification newer,
        WindowedSubscription owner, CoalescingDirection direction)
    {
        if (older.Method != newer.Method || !WindowedDelivery.CountsAgainstWindow(older.Method)
            || older.Method is "channel/snapshot" or "dispatchAction" or "tcp/eof"
            || older.Params?.TryGetProperty("origin", out _) == true || newer.Params?.TryGetProperty("origin", out _) == true)
            return null;
        foreach (var coalescer in WindowConfig.Coalescers)
        {
            var combined = coalescer.Coalesce(older, newer, new CoalescingContext(owner.Uri, direction));
            if (combined is null) continue;
            if (combined.Method != older.Method || combined.Params?.GetProperty("channel").GetString() != owner.Uri)
                throw Protocol("custom coalescer changed method or channel");
            return combined;
        }
        if (direction == CoalescingDirection.Incoming && older.Method == "action")
        {
            var first = _serializer.Deserialize<ActionEnvelope>(older.Params!.Value);
            var last = _serializer.Deserialize<ActionEnvelope>(newer.Params!.Value);
            if (first.RejectionReason is not null || last.RejectionReason is not null) return null;
            StateAction? action = null;
            if (first.Action.Value is TerminalDataAction a && last.Action.Value is TerminalDataAction b)
                action = new StateAction(b with { Data = a.Data + b.Data });
            if (first.Action.Value is ChatDeltaAction c && last.Action.Value is ChatDeltaAction d
                && c.TurnId == d.TurnId && c.PartId == d.PartId
                && MetadataEqual(older.Params.Value.GetProperty("action"), newer.Params.Value.GetProperty("action")))
                action = new StateAction(d with { Content = c.Content + d.Content });
            return action is null ? null : new JsonRpcNotification
            {
                Method = "action",
                Params = _serializer.SerializeToElement(last with { Action = action }),
            };
        }
        if (direction == CoalescingDirection.Outgoing && older.Method == "tcp/data")
        {
            var first = Convert.FromBase64String(older.Params!.Value.GetProperty("data").GetString()!);
            var last = Convert.FromBase64String(newer.Params!.Value.GetProperty("data").GetString()!);
            var combined = new byte[first.Length + last.Length];
            first.CopyTo(combined, 0);
            last.CopyTo(combined, first.Length);
            return new JsonRpcNotification
            {
                Method = "tcp/data",
                Params = _serializer.SerializeToElement(new TcpDataParams
                {
                    Channel = owner.Uri,
                    Data = Convert.ToBase64String(combined),
                }),
            };
        }
        return null;
    }

    private static bool MetadataEqual(JsonElement first, JsonElement last)
    {
        var hasFirst = first.TryGetProperty("_meta", out var a);
        var hasLast = last.TryGetProperty("_meta", out var b);
        return hasFirst == hasLast && (!hasFirst || JsonEqual(a, b));
    }

    internal static bool JsonEqual(JsonElement a, JsonElement b)
    {
        if (a.ValueKind != b.ValueKind) return false;
        if (a.ValueKind == JsonValueKind.Object)
            return a.EnumerateObject().Count() == b.EnumerateObject().Count()
                && a.EnumerateObject().All(p => b.TryGetProperty(p.Name, out var value) && JsonEqual(p.Value, value));
        if (a.ValueKind == JsonValueKind.Array)
            return a.GetArrayLength() == b.GetArrayLength() && a.EnumerateArray().Zip(b.EnumerateArray(), JsonEqual).All(x => x);
        return a.ToString() == b.ToString();
    }

    private async Task SendWindowAsync(WindowedSubscription owner, JsonRpcNotification notification, CancellationToken token)
    {
        var text = EncodeWindow(notification);
        var completion = WindowedSubscription.Signal();
        var item = new WindowSend(notification, text, completion, token);
        while (true)
        {
            Task wait;
            token.ThrowIfCancellationRequested();
            if (_lifetimeCts.IsCancellationRequested) throw new AhpClientClosedException();
            lock (owner.Gate)
            {
                if (owner.Closed) throw owner.CloseError ?? new AhpClientClosedException();
                if (owner.BufferedSend == 0 || owner.BufferedSend + item.Bytes <= WindowConfig.MaxBufferedSendBytes)
                {
                    if (notification.Method == "tcp/data")
                    {
                        if (owner.SendEof) throw new InvalidOperationException("TCP data cannot follow EOF.");
                        ValidateTcpData(notification.Params!.Value.GetProperty("data").GetString()!);
                    }
                    if (notification.Method == "tcp/eof") owner.SendEof = true;
                    if (owner.Options.Coalescing && owner.Sends.Last is { } tail && !tail.Value.Started
                        && tail.Value.Waiters.All(x => x.Token == token))
                    {
                        var combined = Coalesce(tail.Value.Notification, notification, owner, CoalescingDirection.Outgoing);
                        if (combined is not null)
                        {
                            var encoded = EncodeWindow(combined);
                            var size = (long)encoded.Length * 2;
                            if (owner.BufferedSend - tail.Value.Bytes + size <= WindowConfig.MaxBufferedSendBytes)
                            {
                                owner.BufferedSend += size - tail.Value.Bytes;
                                tail.Value.Notification = combined;
                                tail.Value.Text = encoded;
                                tail.Value.Bytes = size;
                                tail.Value.Waiters.Add((completion, token));
                                WindowEvent(owner, "coalesced", size);
                                break;
                            }
                        }
                    }
                    owner.Sends.AddLast(item);
                    owner.BufferedSend += item.Bytes;
                    break;
                }
                wait = owner.Writable.Task;
            }
            await Task.WhenAny(wait, Completion).WaitAsync(token).ConfigureAwait(false);
        }
        owner.Publish();
        _writerWake.Release();
        using (token.Register(() => _writerWake.Release()))
            await completion.Task.WaitAsync(token).ConfigureAwait(false);
    }

    private bool TryWindowFrame(out TransportMessage frame, out Action sent)
    {
        List<WindowedSubscription> owners;
        lock (_windowGate) owners = new List<WindowedSubscription>(_windows.Values);
        foreach (var owner in owners)
        {
            lock (owner.Gate)
            {
                if (owner.Closed || owner.Negotiating || owner.Released <= owner.CreditSent) continue;
                var total = owner.Released;
                var notification = new JsonRpcNotification
                {
                    Method = "channel/credit",
                    Params = _serializer.SerializeToElement(new ChannelCreditParams { Channel = owner.Uri, ConsumedBytes = total }),
                };
                frame = TransportMessage.FromText(EncodeWindow(notification));
                owner.CreditSent = total;
                var creditBytes = RawWindowBytes(frame);
                sent = () =>
                {
                    AhpTelemetry.WindowCreditBytesSent.Add(creditBytes);
                    WindowEvent(owner, "creditSent", creditBytes);
                };
                return true;
            }
        }
        for (var i = 0; i < owners.Count; i++)
        {
            var index = (_windowTurn + i) % owners.Count;
            var owner = owners[index];
            lock (owner.Gate)
            {
                if (owner.Closed || owner.Negotiating) continue;
                while (owner.Sends.First is { } canceled && !canceled.Value.Started
                    && canceled.Value.Waiters.All(x => x.Token.IsCancellationRequested))
                {
                    owner.BufferedSend -= canceled.Value.Bytes;
                    foreach (var waiter in canceled.Value.Waiters) waiter.Completion.TrySetCanceled(waiter.Token);
                    owner.Sends.RemoveFirst();
                    if (canceled.Value.Notification.Method == "tcp/eof") owner.SendEof = false;
                    owner.Publish();
                }
                if (owner.Sends.First is not { } node
                    || (owner.Limits is not null && owner.Sent - owner.PeerConsumed >= owner.Limits.HostReceive.WindowBytes)) continue;
                var item = node.Value;
                string output;
                bool final;
                if (owner.Limits is null || (!item.Started && item.Bytes <= owner.Limits.HostReceive.MaximumFrameBytes))
                {
                    output = item.Text;
                    final = true;
                }
                else
                {
                    var remaining = owner.Limits.HostReceive.WindowBytes - (owner.Sent - owner.PeerConsumed);
                    output = EncodeFragment(owner, item, remaining, out var count);
                    item.Offset += count;
                    final = item.Offset == item.Text.Length;
                    item.FragmentWireBytes += (long)output.Length * 2;
                }
                item.Started = true;
                _windowInFlight = item;
                var charge = checked((long)output.Length * 2);
                if (owner.Limits is not null) owner.Sent = checked(owner.Sent + charge);
                if (owner.Sent > 9007199254740991) throw Protocol("window counter overflow");
                if (final)
                {
                    owner.Sends.RemoveFirst();
                    owner.BufferedSend -= item.Bytes;
                }
                _windowTurn = (index + 1) % owners.Count;
                frame = TransportMessage.FromText(output);
                sent = () =>
                {
                    AhpTelemetry.WindowDataBytesSent.Add(charge);
                    _windowInFlight = null;
                    if (final)
                    {
                        foreach (var waiter in item.Waiters) waiter.Completion.TrySetResult(true);
                        if (item.FragmentWireBytes > 0) WindowEvent(owner, "fragmentedMessageSent", item.FragmentWireBytes);
                    }
                    owner.Publish();
                };
                return true;
            }
        }
        frame = null!;
        sent = null!;
        return false;
    }

    private string EncodeFragment(WindowedSubscription owner, WindowSend item, long remaining, out int count)
    {
        string Encode(int length) => EncodeWindow(new JsonRpcNotification
        {
            Method = "channel/frame",
            Params = _serializer.SerializeToElement(new ChannelFrameParams
            {
                Channel = owner.Uri,
                Data = item.Text.Substring(item.Offset, length),
                Final = item.Offset + length == item.Text.Length ? true : null,
            }),
        });
        int Boundary(int length) => length > 0 && item.Offset + length < item.Text.Length
            && char.IsHighSurrogate(item.Text[item.Offset + length - 1])
            && char.IsLowSurrogate(item.Text[item.Offset + length]) ? length - 1 : length;
        var smallest = char.IsHighSurrogate(item.Text[item.Offset]) ? 2 : 1;
        var minimum = Encode(smallest);
        var limit = Math.Min(owner.Limits!.HostReceive.MaximumFrameBytes, Math.Max(remaining, (long)minimum.Length * 2));
        if ((long)minimum.Length * 2 > limit) throw Protocol("maximumFrameBytes cannot carry a character");
        var low = smallest;
        var high = item.Text.Length - item.Offset;
        count = smallest;
        var output = minimum;
        while (low <= high)
        {
            var midpoint = low + (high - low) / 2;
            var candidateCount = Boundary(midpoint);
            if (candidateCount == 0) { low = midpoint + 1; continue; }
            var candidate = Encode(candidateCount);
            if ((long)candidate.Length * 2 <= limit)
            {
                count = candidateCount;
                output = candidate;
                low = midpoint + 1;
            }
            else high = midpoint - 1;
        }
        return output;
    }

    internal void CloseWindowOwner(WindowedSubscription owner)
    {
        owner.End();
        _ = UnsubscribeOwnerAsync(owner);
    }

    internal void DropManagedWindow(WindowedSubscription owner) => RemoveWindow(owner);

    private static void ValidateTcpData(string data)
    {
        if (data.Length == 0 || Convert.ToBase64String(Convert.FromBase64String(data)) != data)
            throw Protocol("invalid TCP base64");
    }

    private void RemoveWindow(WindowedSubscription owner)
    {
        lock (_windowGate)
            if (_windows.TryGetValue(owner.Uri, out var current) && ReferenceEquals(current, owner))
                _windows.Remove(owner.Uri);
        RememberClosedWindow(owner.Uri);
    }

    private void CleanupUnacceptedWindow(WindowedSubscription owner, Exception error)
    {
        if (owner.EverAccepted) return;
        if (_windowResponses.Values.Any(x => !x.Abandoned && x.Owners.Contains(owner))) return;
        owner.End(error, true);
        RemoveWindow(owner);
    }

    private void AbandonWindowRequest(ulong id, Exception error)
    {
        if (_windowResponses.TryGetValue(id, out var response) && response.Abandon(error))
            _windowResponses.TryRemove(id, out _);
    }

    private void StopWindow(string uri)
    {
        var owner = GetWindowedSubscription(uri);
        if (owner is not null)
        {
            owner.End();
            RemoveWindow(owner);
        }
        else if (_windowResponses.Values.Any(x => x.Owners.Any(owner => owner.Uri == uri)))
            RememberClosedWindow(uri);
        foreach (var pending in _windowResponses)
            if (pending.Value.Owners.Any(x => x.Uri == uri))
            {
                var error = new AhpClientClosedException("The subscription was unsubscribed.");
                AbandonWindowRequest(pending.Key, error);
                if (_pending.TryRemove(pending.Key, out var completion)) completion.TrySetException(error);
            }
    }

    internal int PendingWindowResponseCount => _windowResponses.Count;
    internal int ClosedWindowCount { get { lock (_windowGate) return _closedWindows.Count; } }

    private void RememberClosedWindow(string uri)
    {
        lock (_windowGate)
        {
            if (_closedWindows.TryGetValue(uri, out var previous)) _closedWindowOrder.Remove(previous);
            _closedWindows[uri] = _closedWindowOrder.AddLast(uri);
            if (_closedWindows.Count > 1024 && _closedWindowOrder.First is { } oldest)
            {
                _closedWindows.Remove(oldest.Value);
                _closedWindowOrder.RemoveFirst();
            }
        }
    }

    private bool IsClosedWindow(string uri) { lock (_windowGate) return _closedWindows.ContainsKey(uri); }

    private void ForgetClosedWindow(string uri)
    {
        lock (_windowGate)
            if (_closedWindows.TryGetValue(uri, out var node))
            {
                _closedWindowOrder.Remove(node);
                _closedWindows.Remove(uri);
            }
    }

    private async Task UnsubscribeOwnerAsync(WindowedSubscription owner)
    {
        try { await UnsubscribeAsync(owner.Uri).ConfigureAwait(false); }
        catch (AhpException) { }
    }

    private void EndWindows(Exception? cause)
    {
        _windowInFlight?.Fail(cause ?? new AhpClientClosedException());
        List<WindowedSubscription> owners;
        lock (_windowGate)
        {
            owners = new List<WindowedSubscription>(_windows.Values);
            foreach (var reader in _flowEventReaders) reader.Writer.TryComplete();
        }
        foreach (var owner in owners)
        {
            if (RetainManagedWindows && !owner.Closed && !owner.Uri.StartsWith("ahp-tcp:", StringComparison.Ordinal))
            {
                lock (owner.Gate)
                {
                    owner.Epoch++;
                    owner.Negotiating = true;
                    owner.BufferedReceive -= owner.FragmentBytes;
                    owner.FragmentBytes = 0;
                    owner.Fragments = null;
                    foreach (var item in owner.Sends) item.Fail(cause ?? new AhpClientClosedException());
                    owner.Sends.Clear();
                    owner.BufferedSend = 0;
                }
            }
            else owner.End(cause, owner.Uri.StartsWith("ahp-tcp:", StringComparison.Ordinal));
            owner.Publish();
        }
        _windowResponses.Clear();
        _writerWake.Release();
    }
}
