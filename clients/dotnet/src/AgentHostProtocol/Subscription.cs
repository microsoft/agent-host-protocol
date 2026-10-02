// Per-URI subscription handle and top-level event stream — port of the Go
// client's Subscription, SubscriptionEvent, EventStream, ClientEvent types.
// Mirrors: ahp/client.go (SubscriptionEvent variants, Subscription, EventStream).
#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;

namespace Microsoft.AgentHostProtocol;

// ─── Subscription events ─────────────────────────────────────────────────────

/// <summary>Marker base class for all subscription event variants.</summary>
public abstract class SubscriptionEvent
{
    private protected SubscriptionEvent() { }
}

/// <summary>A write-ahead action envelope delivered to a subscription.</summary>
public sealed class SubscriptionEventAction : SubscriptionEvent
{
    /// <summary>The action envelope from the server.</summary>
    public ActionEnvelope Envelope { get; }

    /// <summary>Creates a new action event.</summary>
    public SubscriptionEventAction(ActionEnvelope envelope) => Envelope = envelope;
}

/// <summary>A point-in-time snapshot delivered when reconnect replaces replay with fresh state.</summary>
public sealed class SubscriptionEventSnapshot : SubscriptionEvent
{
    /// <summary>The resource snapshot from the server.</summary>
    public Snapshot Snapshot { get; }

    /// <summary>Creates a new snapshot event.</summary>
    public SubscriptionEventSnapshot(Snapshot snapshot) =>
        Snapshot = snapshot ?? throw new ArgumentNullException(nameof(snapshot));
}

/// <summary>Mirrors the <c>root/sessionAdded</c> notification.</summary>
public sealed class SubscriptionEventSessionAdded : SubscriptionEvent
{
    /// <summary>The notification parameters.</summary>
    public SessionAddedParams Params { get; }

    /// <summary>Creates a new session-added event.</summary>
    public SubscriptionEventSessionAdded(SessionAddedParams @params) => Params = @params;
}

/// <summary>Mirrors the <c>root/sessionRemoved</c> notification.</summary>
public sealed class SubscriptionEventSessionRemoved : SubscriptionEvent
{
    /// <summary>The notification parameters.</summary>
    public SessionRemovedParams Params { get; }

    /// <summary>Creates a new session-removed event.</summary>
    public SubscriptionEventSessionRemoved(SessionRemovedParams @params) => Params = @params;
}

/// <summary>Mirrors the <c>root/sessionSummaryChanged</c> notification.</summary>
public sealed class SubscriptionEventSessionSummaryChanged : SubscriptionEvent
{
    /// <summary>The notification parameters.</summary>
    public SessionSummaryChangedParams Params { get; }

    /// <summary>Creates a new session-summary-changed event.</summary>
    public SubscriptionEventSessionSummaryChanged(SessionSummaryChangedParams @params) => Params = @params;
}

/// <summary>Mirrors the <c>root/progress</c> notification.</summary>
public sealed class SubscriptionEventProgress : SubscriptionEvent
{
    /// <summary>The notification parameters.</summary>
    public ProgressParams Params { get; }

    /// <summary>Creates a new progress event.</summary>
    public SubscriptionEventProgress(ProgressParams @params) => Params = @params;
}

/// <summary>Mirrors the <c>auth/required</c> notification.</summary>
public sealed class SubscriptionEventAuthRequired : SubscriptionEvent
{
    /// <summary>The notification parameters.</summary>
    public AuthRequiredParams Params { get; }

    /// <summary>Creates a new auth-required event.</summary>
    public SubscriptionEventAuthRequired(AuthRequiredParams @params) => Params = @params;
}

/// <summary>
/// A <see cref="SubscriptionEvent"/> tagged with the channel URI it was
/// scoped to. Returned by <see cref="AhpClient.CreateEventStream()"/>.
/// </summary>
public sealed class ClientEvent
{
    /// <summary>The channel URI the event belongs to.</summary>
    public string Channel { get; }

    /// <summary>The underlying subscription event.</summary>
    public SubscriptionEvent Event { get; }

    /// <summary>Creates a client event.</summary>
    public ClientEvent(string channel, SubscriptionEvent @event)
    {
        Channel = channel;
        Event = @event;
    }
}

// ─── Shared channel wrapper ──────────────────────────────────────────────────

/// <summary>
/// Internal bounded drop-oldest channel shared by the three public stream
/// wrappers (<see cref="Subscription"/>, <see cref="EventStream"/>, and
/// <c>StateChangeStream</c>). Encapsulates the <see cref="Channel{T}"/> creation,
/// the idempotent close lifecycle, and the default drop-oldest delivery so each public
/// wrapper stays a thin, sealed, domain-named handle.
/// Strict event receivers opt into terminal overflow instead.
/// </summary>
internal sealed class BoundedDropOldestChannel<T>
{
    private readonly Channel<T> _channel;
    private readonly object? _strictWriteLock;
    private readonly int _capacity;
    private readonly Action<T>? _onDropped;
    private int _closed;

    internal BoundedDropOldestChannel(int bufferCapacity, Action<T>? onDropped = null, bool failOnOverflow = false)
    {
        _capacity = bufferCapacity;
        _onDropped = onDropped;
        _strictWriteLock = failOnOverflow ? new object() : null;
        var options = new BoundedChannelOptions(bufferCapacity)
        {
            FullMode = failOnOverflow ? BoundedChannelFullMode.Wait : BoundedChannelFullMode.DropOldest,
            SingleReader = false,
            SingleWriter = false,
        };
        // BoundedChannelOptions' itemDropped callback (net7+) reports each
        // back-pressure eviction EXACTLY — no racy Count-then-write probe — and is
        // invoked inline on the writer with the evicted item.
        _channel = onDropped is null
            ? Channel.CreateBounded<T>(options)
            : Channel.CreateBounded<T>(options, onDropped);
    }

    internal ChannelReader<T> Reader => _channel.Reader;

    /// <summary>Completes the channel. Safe to call multiple times.</summary>
    internal void Close()
    {
        if (_strictWriteLock is not null)
        {
            lock (_strictWriteLock) { Complete(null); }
            return;
        }
        Complete(null);
    }

    private void Complete(Exception? error)
    {
        if (Interlocked.CompareExchange(ref _closed, 1, 0) == 0)
        {
            _channel.Writer.TryComplete(error);
        }
    }

    internal bool FailIfStrict(Exception error)
    {
        if (_strictWriteLock is null) return false;
        lock (_strictWriteLock) { Complete(error); }
        return true;
    }

    /// <summary>
    /// By default delivers the item, evicting the oldest buffered item if the channel is full
    /// (<see cref="BoundedChannelFullMode.DropOldest"/>) — the newest item is always
    /// accepted, so a slow consumer loses the stalest items rather than the latest.
    /// Each eviction is reported via the <c>onDropped</c> callback supplied at
    /// construction. Strict receivers instead preserve the prefix and fault
    /// permanently on the first rejected write.
    /// </summary>
    internal bool TrySend(T item)
    {
        if (_strictWriteLock is not null)
        {
            lock (_strictWriteLock)
            {
                if (Volatile.Read(ref _closed) == 1) return false;
                if (!_channel.Writer.TryWrite(item))
                {
                    Complete(new SubscriptionLagException(_capacity));
                    _onDropped?.Invoke(item);
                    return false;
                }
                return true;
            }
        }
        if (Volatile.Read(ref _closed) == 1) return false;
        return _channel.Writer.TryWrite(item);
    }
}

// ─── Subscription handle ─────────────────────────────────────────────────────

/// <summary>
/// Per-URI fan-out handle returned by <see cref="AhpClient.SubscribeAsync"/> and
/// <see cref="AhpClient.AttachSubscription"/>. Drop the handle by calling
/// <see cref="Close"/> (or <see cref="Dispose"/>) or let
/// <see cref="AhpClient.ShutdownAsync(CancellationToken)"/> tear it down.
/// </summary>
public sealed class Subscription : IDisposable
{
    private static readonly KeyValuePair<string, object?> DropTag = new(AhpTelemetryNames.AttrStream, AhpTelemetryNames.StreamSubscription);
    private readonly BoundedDropOldestChannel<SubscriptionEvent> _channel;
    private Action? _onClose;
    private int _closed;

    /// <summary>The channel URI this subscription is bound to.</summary>
    public string Uri { get; }

    /// <summary>Creates a new subscription.</summary>
    internal Subscription(string uri, int bufferCapacity)
    {
        Uri = uri;
        _channel = new BoundedDropOldestChannel<SubscriptionEvent>(
            bufferCapacity, _ => AhpTelemetry.DroppedEvents.Add(1, DropTag));
    }

    /// <summary>
    /// Sets the client's one-shot detach hook, run on the first <see cref="Close"/>
    /// so the subscription is removed from the client's registry (and its metric
    /// decremented) no matter which API ends it.
    /// </summary>
    internal void OnClose(Action onClose) => _onClose = onClose;

    /// <summary>
    /// The reader side of the subscription's event channel. Read from this
    /// to receive events as they arrive.
    /// </summary>
    public ChannelReader<SubscriptionEvent> Events => _channel.Reader;

    /// <summary>
    /// Stops the subscription locally without notifying the server.
    /// Safe to call multiple times.
    /// </summary>
    public void Close()
    {
        if (Interlocked.CompareExchange(ref _closed, 1, 0) != 0) return;
        _channel.Close();
        _onClose?.Invoke();
    }

    /// <inheritdoc cref="Close"/>
    public void Dispose() => Close();

    internal void TrySend(SubscriptionEvent ev) => _channel.TrySend(ev);
}

// ─── Top-level event stream ───────────────────────────────────────────────────

/// <summary>
/// Top-level fan-in receiver over every inbound event from an <see cref="AhpClient"/>,
/// tagged with the channel URI. Multiple streams may exist concurrently.
/// Returned by <see cref="AhpClient.CreateEventStream()"/>.
/// </summary>
// CA1711: "Stream" here names the AHP event-stream concept (mirroring Go's
// EventStream and Swift's AsyncStream usage), not a System.IO.Stream subclass.
// The name is part of the established cross-SDK API surface.
[SuppressMessage("Naming", "CA1711:Identifiers should not have incorrect suffix",
    Justification = "EventStream names the AHP event-stream abstraction (mirrors Go/Swift API), not a System.IO.Stream subclass.")]
public sealed class EventStream : IDisposable
{
    internal string? Resource { get; set; }
    internal bool IsClosed => Volatile.Read(ref _closed) != 0;
    private readonly BoundedDropOldestChannel<ClientEvent> _channel;
    private Action? _onClose;
    private int _closed;

    private static readonly KeyValuePair<string, object?> DropTag = new(AhpTelemetryNames.AttrStream, AhpTelemetryNames.StreamEvent);

    /// <summary>Creates a new event stream.</summary>
    internal EventStream(int bufferCapacity, bool failOnOverflow = false)
    {
        _channel = new BoundedDropOldestChannel<ClientEvent>(
            bufferCapacity, _ => AhpTelemetry.DroppedEvents.Add(1, DropTag), failOnOverflow);
    }

    /// <summary>
    /// Sets the client's one-shot detach hook, run on the first <see cref="Close"/>
    /// so the stream is removed from the client's fan-out list no matter how it ends.
    /// </summary>
    internal void OnClose(Action onClose) => _onClose = onClose;

    /// <summary>
    /// The reader side of the event stream. Read from this to receive
    /// <see cref="ClientEvent"/>s as they arrive.
    /// </summary>
    public ChannelReader<ClientEvent> Events => _channel.Reader;

    /// <summary>Stops the stream and detaches it from the client. Safe to call multiple times.</summary>
    public void Close()
    {
        if (Interlocked.CompareExchange(ref _closed, 1, 0) != 0) return;
        _channel.Close();
        _onClose?.Invoke();
    }

    /// <inheritdoc cref="Close"/>
    public void Dispose() => Close();

    internal void TrySend(ClientEvent ev)
    {
        if (!_channel.TrySend(ev)) Close();
    }

    internal void FailIfStrict(Exception error)
    {
        if (_channel.FailIfStrict(error)) Close();
    }
}

/// <summary>
/// The receipt returned by <see cref="AhpClient.DispatchAsync"/>, recording
/// the client-assigned sequence number for the dispatched action.
/// </summary>
public sealed class DispatchHandle
{
    /// <summary>The client-assigned sequence number.</summary>
    public long ClientSeq { get; }

    /// <summary>Creates a dispatch handle.</summary>
    public DispatchHandle(long clientSeq) => ClientSeq = clientSeq;
}
