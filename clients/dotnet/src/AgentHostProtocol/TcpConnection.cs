#nullable enable

using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;

namespace Microsoft.AgentHostProtocol;

/// <summary>An owned TCP byte stream. One reader and one writer may run concurrently.</summary>
public sealed class TcpConnection : IAsyncDisposable
{
    private readonly object _gate = new();
    private readonly Queue<byte[]> _received = new();
    private readonly SortedDictionary<long, StateAction> _pending = new();
    private TaskCompletionSource<bool> _changed = Signal();
    private AhpClient _client;
    private EventStream? _events;
    private CancellationTokenSource? _pumpCancellation;
    private TcpConnectionState _state;
    private Exception? _error;
    private long _sentBytes;
    private long _consumedBytes;
    private long _checkpoint;
    private long _lastClientSeq;
    private int _generation;
    private bool _suspended;
    private bool _writing;
    private bool _reading;
    private bool _ending;
    private bool _closing;
    private bool _closed;
    private bool _released;
    private Action? _onRelease;

    internal void OnRelease(Action callback)
    {
        lock (_gate)
        {
            if (!_released) { _onRelease = callback; return; }
        }
        callback();
    }

    internal TcpConnection(AhpClient client, string clientId, Snapshot snapshot)
    {
        _client = client;
        ClientId = clientId;
        Resource = snapshot.Resource;
        _state = snapshot.State.Tcp!;
        _sentBytes = _state.Input.ReceivedBytes;
        _consumedBytes = _state.Output.ConsumedBytes;
        _checkpoint = snapshot.FromSeq;
    }

    /// <summary>The private channel URI, unchanged across replay reconnects.</summary>
    public string Resource { get; }
    /// <summary>The logical client that owns this stream.</summary>
    public string ClientId { get; }
    /// <summary>Last accepted server state; writes are never optimistically reduced.</summary>
    public TcpConnectionState State { get { lock (_gate) return _state; } }
    /// <summary>Last applied checkpoint, including bytes retained in the read buffer.</summary>
    public long AppliedCheckpoint { get { lock (_gate) return _checkpoint; } }
    /// <summary>Whether transport delivery is suspended.</summary>
    public bool IsSuspended { get { lock (_gate) return _suspended; } }
    internal long LastClientSequence { get { lock (_gate) return _lastClientSeq; } }
    internal bool IsClosed { get { lock (_gate) return _closed; } }
    internal AhpClient Owner { get { lock (_gate) return _client; } }
    internal bool CanRebind { get { lock (_gate) return !_closed && (_suspended || _client.ConnectionState == ConnectionState.Disconnected); } }

    private static TaskCompletionSource<bool> Signal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    private void Wake()
    {
        var previous = _changed;
        _changed = Signal();
        previous.TrySetResult(true);
    }

    private void ThrowIfFailed()
    {
        if (_error is not null) throw _error;
    }

    private (AhpClient Client, long Sequence, StateAction Action)? Enqueue(StateAction action)
    {
        long seq = _client.ReserveTcpSequence();
        _lastClientSeq = seq;
        _pending.Add(seq, action);
        return _suspended ? null : (_client, seq, action);
    }

    private async Task SendAsync((AhpClient Client, long Sequence, StateAction Action)? item)
    {
        if (item is not { } send) return;
        try
        {
            await send.Client.DispatchAsync(Resource, send.Action, send.Sequence).ConfigureAwait(false);
        }
        catch (AhpException) when (send.Client.ConnectionState == ConnectionState.Disconnected)
        {
            lock (_gate) { if (ReferenceEquals(send.Client, _client)) Suspend(); }
        }
    }

    /// <summary>Reads one chunk, releasing its receive credit. Null means drained EOF.</summary>
    public async Task<byte[]?> ReadAsync(CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            ThrowIfFailed();
            if (_reading) throw new InvalidOperationException("TCP permits one reader at a time");
            _reading = true;
        }
        try
        {
            while (true)
            {
                Task wait;
                byte[]? data = null;
                (AhpClient, long, StateAction)? send = null;
                lock (_gate)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    ThrowIfFailed();
                    if (!_suspended || _closed)
                    {
                        if (_received.Count > 0)
                        {
                            data = _received.Peek();
                            if (!_closed)
                                send = Enqueue(new StateAction(new TcpDataConsumedAction { Type = ActionType.TcpDataConsumed, ConsumedBytes = _consumedBytes + data.Length }));
                            _received.Dequeue();
                            _consumedBytes += data.Length;
                        }
                        else if (_closed || _state.HostClosed || _state.Output.EofAtBytes is not null) return null;
                    }
                    wait = _changed.Task;
                }
                if (data is not null)
                {
                    await SendAsync(send).ConfigureAwait(false);
                    return data;
                }
                await wait.WaitAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        finally { lock (_gate) _reading = false; }
    }

    /// <summary>Writes bounded chunks, waiting for destination credit. Concurrent writes are rejected.</summary>
    public async Task WriteAsync(byte[] data, CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(data, nameof(data));
        lock (_gate)
        {
            ThrowIfFailed();
            if (_writing || _ending || _closing || _closed) throw new InvalidOperationException("TCP write requires an open, idle writer");
            _writing = true;
        }
        try
        {
            int offset = 0;
            while (offset < data.Length)
            {
                Task wait;
                (AhpClient, long, StateAction)? send = null;
                lock (_gate)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    ThrowIfFailed();
                    if (_closing || _closed) throw new InvalidOperationException("TCP closed during write");
                    long credit = _state.Input.WindowBytes - (_sentBytes - _state.Input.ConsumedBytes);
                    if (!_suspended && credit > 0)
                    {
                        int length = (int)Math.Min(data.Length - offset, Math.Min(credit, _state.Input.MaximumChunkSize));
                        TcpProtocol.Safe(_sentBytes + length);
                        var action = new StateAction(new TcpInputAction
                        {
                            Type = ActionType.TcpInput,
                            Offset = _sentBytes,
                            Data = Convert.ToBase64String(data, offset, length),
                        });
                        send = Enqueue(action);
                        _sentBytes += length;
                        offset += length;
                    }
                    wait = _changed.Task;
                }
                if (send is not null) await SendAsync(send).ConfigureAwait(false);
                else await wait.WaitAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        finally { lock (_gate) { _writing = false; Wake(); } }
    }

    /// <summary>Waits for all reserved input bytes to be consumed by the destination.</summary>
    public async Task DrainAsync(CancellationToken cancellationToken = default)
    {
        while (true)
        {
            Task wait;
            lock (_gate)
            {
                ThrowIfFailed();
                if (_state.Input.ConsumedBytes >= _sentBytes) return;
                if (_closed) throw new InvalidOperationException("TCP closed before drain completed");
                wait = _changed.Task;
            }
            await wait.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    /// <summary>Half-closes input after all writes have finished; output remains readable.</summary>
    public async Task EndAsync(CancellationToken cancellationToken = default)
    {
        lock (_gate)
        {
            ThrowIfFailed();
            if (_writing || _closing || _closed) throw new InvalidOperationException("TCP end requires an open, idle writer");
            if (_ending) return;
            _ending = true;
        }
        bool queued = false;
        try
        {
            while (true)
            {
                Task wait;
                (AhpClient, long, StateAction)? send;
                lock (_gate)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    ThrowIfFailed();
                    if (_closing || _closed) throw new InvalidOperationException("TCP closed before EOF");
                    send = _suspended ? null : Enqueue(new StateAction(new TcpInputEofAction { Type = ActionType.TcpInputEof, FinalOffset = _sentBytes }));
                    queued = send is not null;
                    wait = _changed.Task;
                }
                if (send is not null) { await SendAsync(send).ConfigureAwait(false); return; }
                await wait.WaitAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch
        {
            if (!queued) lock (_gate) { _ending = false; Wake(); }
            throw;
        }
    }

    /// <summary>Stops input; retains crossing output and ownership until both sides close and drain.</summary>
    public async Task CloseAsync()
    {
        (AhpClient, long, StateAction)? send;
        lock (_gate)
        {
            if (_closing || _closed) return;
            _closing = true;
            send = Enqueue(new StateAction(new TcpClientCloseAction { Type = ActionType.TcpClientClose }));
            Wake();
        }
        try
        {
            await SendAsync(send).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            await FailAsync(error).ConfigureAwait(false);
            throw;
        }
    }

    private async Task FinishCloseAsync()
    {
        lock (_gate)
        {
            if (_closed || !_closing || !_state.ClientClosed || !_state.HostClosed
                || _state.Input.ConsumedBytes < _sentBytes
                || _state.Output.ConsumedBytes < _state.Output.ReceivedBytes
                || _received.Count != 0 || _pending.Count != 0) return;
            _closed = true;
            Wake();
        }
        await ReleaseAsync().ConfigureAwait(false);
    }

    internal void Suspend()
    {
        lock (_gate)
        {
            if (_closed) return;
            _suspended = true;
            _generation++;
            _pumpCancellation?.Cancel();
            _pumpCancellation?.Dispose();
            _pumpCancellation = null;
            _events?.Dispose();
            _events = null;
            Wake();
        }
    }

    internal void Bind(AhpClient client)
    {
        lock (_gate)
        {
            if (_closed) return;
            if (!_suspended && _client.ConnectionState != ConnectionState.Disconnected)
                throw new InvalidOperationException("Suspend the previous transport before reconnecting TCP");
            Suspend();
            _lastClientSeq = Math.Max(_lastClientSeq, _client.LastAssignedClientSequence);
            if (!ReferenceEquals(client, _client))
            {
                client.TrackTcpConnection(this);
                _client.ForgetTcpConnection(this);
            }
            _client = client;
        }
    }

    internal async Task AcceptAsync(ActionEnvelope envelope, int? generation = null)
    {
        Exception? failure = null;
        bool close = false;
        lock (_gate)
        {
            if (_closed || envelope.Channel != Resource || (generation is not null && generation != _generation)) return;
            try
            {
                TcpProtocol.Safe(envelope.ServerSeq);
                bool clientEcho = envelope.Action.Value is TcpInputAction or TcpDataConsumedAction or TcpInputEofAction
                    or TcpClientCloseAction or TcpClientResetAction;
                if (clientEcho)
                {
                    if (envelope.Origin is not { } origin || origin.ClientId != ClientId)
                        throw new InvalidOperationException("TCP client echo requires the owning client origin");
                    TcpProtocol.Safe(origin.ClientSeq);
                    if (origin.ClientSeq > _lastClientSeq)
                        throw new InvalidOperationException("TCP client echo has an unassigned sequence");
                }
                if (envelope.ServerSeq <= _checkpoint) return;
                if (envelope.RejectionReason is not null) throw new InvalidOperationException(envelope.RejectionReason);
                var previous = _state;
                var next = Reducers.TcpReducer(previous, envelope.Action);
                if (clientEcho)
                {
                    if (_pending.TryGetValue(envelope.Origin!.ClientSeq, out var expected))
                    {
                        if (!Equals(expected.Value, envelope.Action.Value))
                            throw new InvalidOperationException("TCP client echo does not match its pending action");
                    }
                    else if (next != previous)
                        throw new InvalidOperationException("TCP advancing client echo has no pending action");
                }
                if (next.Output.ReceivedBytes - _consumedBytes > next.Output.WindowBytes)
                    throw new InvalidOperationException("TCP output exceeds locally released credit");
                if (envelope.Action.Value is TcpDataAction data && next.Output.ReceivedBytes > previous.Output.ReceivedBytes)
                    _received.Enqueue(Convert.FromBase64String(data.Data));
                _state = next;
                _checkpoint = envelope.ServerSeq;
                if (clientEcho) _pending.Remove(envelope.Origin!.ClientSeq);
                if (next.Reset is not null) failure = new InvalidOperationException($"TCP reset: {next.Reset.Reason}");
                else close = next.HostClosed;
                Wake();
            }
            catch (Exception ex) when (ex is InvalidOperationException or FormatException)
            {
                failure = ex;
            }
        }
        if (failure is not null) await FailAsync(failure, reset: State.Reset is null).ConfigureAwait(false);
        else
        {
            if (close) await CloseAsync().ConfigureAwait(false);
            await FinishCloseAsync().ConfigureAwait(false);
        }
    }

    internal async Task ResumeAsync(EventStream events)
    {
        KeyValuePair<long, StateAction>[] pending;
        lock (_gate)
        {
            if (_closed) { events.Dispose(); return; }
            pending = _pending.ToArray();
        }
        foreach (var item in pending)
            await _client.DispatchAsync(Resource, item.Value, item.Key).ConfigureAwait(false);
        Start(events);
    }

    internal void Start(EventStream events)
    {
        int generation;
        CancellationToken cancellation;
        lock (_gate)
        {
            if (_closed) { events.Dispose(); return; }
            _events = events;
            _suspended = false;
            _pumpCancellation?.Dispose();
            _pumpCancellation = new CancellationTokenSource();
            cancellation = _pumpCancellation.Token;
            generation = ++_generation;
            Wake();
        }
        _ = PumpAsync(events, generation, cancellation);
    }

    private async Task PumpAsync(EventStream events, int generation, CancellationToken cancellation)
    {
        try
        {
            await foreach (var item in events.Events.ReadAllAsync(cancellation).ConfigureAwait(false))
                if (item.Event is SubscriptionEventAction action)
                    await AcceptAsync(action.Envelope, generation).ConfigureAwait(false);
            lock (_gate) { if (generation == _generation) Suspend(); }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception ex)
        {
            lock (_gate) { if (generation != _generation) return; }
            try { await FailAsync(ex, reset: true).ConfigureAwait(false); }
            catch (Exception cleanupError)
            {
                lock (_gate) { _error = new AggregateException(ex, cleanupError); Wake(); }
            }
        }
        finally { events.Dispose(); }
    }

    internal async Task FailAsync(Exception error, bool reset = false)
    {
        (AhpClient, long, StateAction)? send = null;
        lock (_gate)
        {
            if (_closed) return;
            _error = error;
            _closed = true;
            if (reset && !_suspended)
            {
                try { send = Enqueue(new StateAction(new TcpClientResetAction { Type = ActionType.TcpClientReset, Reason = TcpResetReason.ProtocolError })); }
                catch (InvalidOperationException sequenceError) { _error = new AggregateException(error, sequenceError); }
            }
            _received.Clear();
            _pending.Clear();
            Wake();
        }
        try { await SendAsync(send).ConfigureAwait(false); }
        finally { await ReleaseAsync().ConfigureAwait(false); }
    }

    private async Task ReleaseAsync()
    {
        AhpClient client;
        Action? onRelease;
        lock (_gate)
        {
            if (_released) return;
            _released = true;
            _pending.Clear();
            _generation++;
            _pumpCancellation?.Cancel();
            _pumpCancellation?.Dispose();
            _pumpCancellation = null;
            _events?.Dispose();
            _events = null;
            client = _client;
            onRelease = _onRelease;
            _onRelease = null;
        }
        client.ForgetTcpConnection(this);
        onRelease?.Invoke();
        if (client.ConnectionState != ConnectionState.Disconnected)
        {
            try { await client.UnsubscribeAsync(Resource).ConfigureAwait(false); }
            catch (Exception cleanupError)
            {
                lock (_gate) { _error = _error is null ? cleanupError : new AggregateException(_error, cleanupError); Wake(); }
                throw;
            }
        }
    }

    /// <summary>Terminates pending operations and releases this subscription once.</summary>
    public ValueTask DisposeAsync() => new(FailAsync(new ObjectDisposedException(nameof(TcpConnection))));

}

public sealed partial class AhpClient
{
    private string? _tcpClientId;
    private TcpConnectionsCapability? _tcpCapability;
    private readonly object _tcpOwnershipGate = new();
    private readonly HashSet<TcpConnection> _ownedTcpConnections = new();
    private bool _tcpDisposed;

    internal void TrackTcpConnection(TcpConnection connection)
    {
        lock (_tcpOwnershipGate)
        {
            if (_tcpDisposed) throw new AhpClientClosedException();
            _ownedTcpConnections.Add(connection);
        }
    }

    internal void ForgetTcpConnection(TcpConnection connection)
    {
        lock (_tcpOwnershipGate) _ownedTcpConnections.Remove(connection);
    }

    private Task DisposeTcpConnectionsAsync()
    {
        TcpConnection[] connections;
        lock (_tcpOwnershipGate)
        {
            _tcpDisposed = true;
            connections = _ownedTcpConnections.ToArray();
        }
        return Task.WhenAll(connections.Select(c => c.DisposeAsync().AsTask()));
    }
    internal void InheritTcpClient(AhpClient previous)
    {
        _tcpClientId = previous._tcpClientId;
        _tcpCapability = previous._tcpCapability;
        if (previous.LastAssignedClientSequence >= 0) AdvanceTcpSequence(previous.LastAssignedClientSequence);
    }
    internal long LastAssignedClientSequence => Interlocked.Read(ref _nextClientSeq) - 1;
    private readonly ConcurrentDictionary<ulong, TaskCompletionSource<JsonElement>> _tcpCreationResponses = new();

    private async Task ReleaseAbandonedTcpCreationAsync(ulong id, Task<JsonElement> response)
    {
        try
        {
            JsonElement result;
            try { result = await response.ConfigureAwait(false); }
            catch (AhpRpcException) { return; }
            catch (AhpClientClosedException) { return; }
            if (result.ValueKind == JsonValueKind.Object
                && result.TryGetProperty("snapshot", out var snapshot) && snapshot.ValueKind == JsonValueKind.Object
                && snapshot.TryGetProperty("resource", out var resource) && resource.ValueKind == JsonValueKind.String
                && resource.GetString() is { } uri && uri.StartsWith("ahp-tcp:", StringComparison.Ordinal)
                && ConnectionState != ConnectionState.Disconnected)
                await UnsubscribeAsync(uri).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            await ShutdownWithErrorAsync(new AhpTransportException("io", "ahp: failed to release abandoned TCP creation", error)).ConfigureAwait(false);
        }
        finally { _tcpCreationResponses.TryRemove(id, out _); }
    }

    internal long ReserveTcpSequence()
    {
        while (true)
        {
            long current = Interlocked.Read(ref _nextClientSeq);
            TcpProtocol.Safe(current);
            if (Interlocked.CompareExchange(ref _nextClientSeq, current + 1, current) == current) return current;
        }
    }

    private void AdvanceTcpSequence(long sequence)
    {
        TcpProtocol.Safe(sequence);
        while (true)
        {
            long current = Interlocked.Read(ref _nextClientSeq);
            if (current > sequence) return;
            if (Interlocked.CompareExchange(ref _nextClientSeq, sequence + 1, current) == current) return;
        }
    }

    /// <summary>Creates an owned TCP stream, registering its strict child route during reply processing.</summary>
    public async Task<TcpConnection> OpenTcpConnectionAsync(
        string session, TcpConnectionSubscription create, CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(session, nameof(session));
        Guard.ThrowIfNull(create, nameof(create));
        cancellationToken.ThrowIfCancellationRequested();
        var clientId = _tcpClientId ?? throw new InvalidOperationException("Initialize before opening TCP");
        TcpProtocol.ValidateRequest(session, create, _tcpCapability);
        var events = CreateResourceEventStream("");
        Snapshot? snapshot = null;
        TcpConnection? connection = null;
        try
        {
            var result = await RequestCoreAsync<SubscribeParams, SubscribeResult>("subscribe",
                new SubscribeParams { Channel = session, Create = create }, cancellationToken, ownsTcpCreation: true,
                onResult: raw =>
                {
                    if (raw.ValueKind == JsonValueKind.Object && raw.TryGetProperty("snapshot", out var child)
                        && child.ValueKind == JsonValueKind.Object && child.TryGetProperty("resource", out var resource)
                        && resource.ValueKind == JsonValueKind.String)
                        BindEventStream(events, resource.GetString()!);
                }).ConfigureAwait(false);
            snapshot = result?.Snapshot;
            TcpProtocol.ValidateSnapshot(session, create, snapshot);
            cancellationToken.ThrowIfCancellationRequested();
            connection = new TcpConnection(this, clientId, snapshot!);
            TrackTcpConnection(connection);
            connection.Start(events);
            lock (_tcpOwnershipGate) { if (_tcpDisposed) throw new AhpClientClosedException(); }
            return connection;
        }
        catch
        {
            events.Dispose();
            if (connection is not null) await connection.DisposeAsync().ConfigureAwait(false);
            else if (snapshot?.Resource.StartsWith("ahp-tcp:", StringComparison.Ordinal) == true
                && ConnectionState != ConnectionState.Disconnected)
                await UnsubscribeAsync(snapshot.Resource, CancellationToken.None).ConfigureAwait(false);
            throw;
        }
    }

    /// <summary>
    /// Rebinds suspended TCP handles to this fresh transport. Reconciles replay before live
    /// delivery and resends only unacknowledged actions with their original identities.
    /// Returned replay excludes actions at or below the caller's original checkpoint.
    /// Snapshot fallback and missing resources close handles; sockets are never recreated.
    /// </summary>
    public async Task<ReconnectResult> ReconnectTcpConnectionsAsync(
        ReconnectParams parameters, IReadOnlyList<TcpConnection> connections,
        CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(parameters, nameof(parameters));
        Guard.ThrowIfNull(connections, nameof(connections));
        TcpProtocol.Safe(parameters.LastSeenServerSeq);
        if (parameters.Channel != ProtocolVersion.RootResourceUri
            || (_tcpClientId is not null && _tcpClientId != parameters.ClientId)
            || connections.Any(c => c.ClientId != parameters.ClientId || !c.CanRebind)
            || connections.Select(c => c.Resource).Distinct(StringComparer.Ordinal).Count() != connections.Count)
            throw new InvalidOperationException("TCP reconnect requires the same logical client and distinct live handles");
        long checkpoint = parameters.LastSeenServerSeq;
        var resources = new HashSet<string>(parameters.Subscriptions, StringComparer.Ordinal);
        foreach (var connection in connections)
        {
            checkpoint = Math.Min(checkpoint, connection.AppliedCheckpoint);
            resources.Add(connection.Resource);
        }
        var receivers = connections.Select(c => CreateResourceEventStream(c.Resource)).ToArray();
        try
        {
            if (connections.Count > 0) InheritTcpClient(connections[0].Owner);
            foreach (var connection in connections) connection.Bind(this);
            foreach (var connection in connections) AdvanceTcpSequence(connection.LastClientSequence);
            var result = await ReconnectAsync(parameters.ClientId, checkpoint, resources.ToArray(), cancellationToken).ConfigureAwait(false);
            _tcpClientId = parameters.ClientId;
            if (result.Value is ReconnectReplayResult replay)
            {
                long previous = checkpoint;
                foreach (var envelope in replay.Actions)
                {
                    TcpProtocol.Safe(envelope.ServerSeq);
                    if (envelope.ServerSeq <= previous) throw new InvalidOperationException("TCP replay is not ordered");
                    previous = envelope.ServerSeq;
                }
                foreach (var connection in connections)
                {
                    if (replay.Missing.Contains(connection.Resource))
                        await connection.FailAsync(new InvalidOperationException("TCP resource is missing on reconnect")).ConfigureAwait(false);
                    else
                        foreach (var envelope in replay.Actions)
                            await connection.AcceptAsync(envelope).ConfigureAwait(false);
                }
                for (int i = 0; i < connections.Count; i++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await connections[i].ResumeAsync(receivers[i]).ConfigureAwait(false);
                }
                return new ReconnectResult(replay with
                {
                    Actions = replay.Actions.Where(action => action.ServerSeq > parameters.LastSeenServerSeq).ToList(),
                });
            }
            else
            {
                foreach (var connection in connections)
                    await connection.FailAsync(new InvalidOperationException("TCP cannot be restored from a reconnect snapshot")).ConfigureAwait(false);
                foreach (var receiver in receivers) receiver.Dispose();
            }
            return result;
        }
        catch
        {
            foreach (var connection in connections) connection.Suspend();
            foreach (var receiver in receivers) receiver.Dispose();
            throw;
        }
    }
}

internal static class TcpProtocol
{
    internal static void Safe(long value)
    {
        if (value < 0 || value > 9007199254740991L) throw new InvalidOperationException("TCP counter must be a nonnegative safe integer");
    }

    private static void ValidateLimits(long windowBytes, long maximumChunkSize)
    {
        if (windowBytes < 1 || windowBytes > uint.MaxValue || maximumChunkSize < 1 || maximumChunkSize > windowBytes)
            throw new InvalidOperationException("TCP window and chunk limits must be positive UInt32 values, with chunk no larger than window");
    }

    internal static void ValidateRequest(string session, TcpConnectionSubscription create, TcpConnectionsCapability? capability)
    {
        if (!session.StartsWith("ahp-session:", StringComparison.Ordinal) || create.Type != "tcpConnection"
            || string.IsNullOrWhiteSpace(create.Host) || create.Port < 1 || create.Port > 65535
            || create.Encoding != TcpDataEncoding.Base64 || capability?.Encodings.Contains(create.Encoding) != true)
            throw new InvalidOperationException("Invalid or unsupported TCP creation request");
        ValidateLimits(create.ReceiveWindowBytes, create.MaximumChunkSize);
    }

    internal static void ValidateSnapshot(string session, TcpConnectionSubscription create, Snapshot? snapshot)
    {
        if (snapshot?.State?.Tcp is not { } state || !snapshot.Resource.StartsWith("ahp-tcp:", StringComparison.Ordinal)
            || state.Session != session || state.Target.Host != create.Host || state.Target.Port != create.Port
            || state.Encoding != create.Encoding || state.ClientClosed || state.HostClosed || state.Reset is not null)
            throw new InvalidOperationException("Invalid TCP creation snapshot");
        Safe(snapshot.FromSeq);
        foreach (var direction in new[] { state.Input, state.Output })
        {
            ValidateLimits(direction.WindowBytes, direction.MaximumChunkSize);
            if (direction.ReceivedBytes != 0 || direction.ConsumedBytes != 0 || direction.EofAtBytes is not null)
                throw new InvalidOperationException("TCP creation requires fresh byte directions");
        }
        if (state.Output.WindowBytes > create.ReceiveWindowBytes || state.Output.MaximumChunkSize > create.MaximumChunkSize)
            throw new InvalidOperationException("TCP creation exceeded requested receive limits");
    }
}
