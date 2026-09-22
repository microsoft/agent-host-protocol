// Multi-host registry + reconnect supervisor.
// Faithful port of clients/go/ahp/hosts/hosts.go + multi_host_state_mirror.go.
#nullable enable

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol.Hosts;

// ─── Internal per-host bookkeeping ───────────────────────────────────────────

internal sealed class HostEntry : IDisposable
{
    public HostId Id { get; }
    public HostConfig Config { get; }
    public string ClientId { get; set; }

    private readonly object _gate = new();
    // Published reference, read lock-free via CurrentClient. A reference read is
    // atomic; `volatile` supplies the visibility a lock would otherwise provide.
    private volatile AhpClient? _client;
    private TaskCompletionSource<AhpClient?> _clientReady =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    private HostState _state = new() { Kind = HostStateKind.Disconnected };
    private string _protoVer = "";
    private DateTimeOffset _updatedAt;

    // ── Swift-parity observable per-host state (guarded by _gate) ──────────
    // Session summaries are keyed by their `Resource` URI so add/remove/change
    // notifications mutate them by id, mirroring Swift's `sessionSummaries` dict
    // in HostRuntime.swift. Snapshot() materializes them sorted by ModifiedAt
    // descending. The rest mirror HostHandle.swift's richer fields.
    private readonly Dictionary<string, SessionSummary> _sessionSummaries = new(StringComparer.Ordinal);
    private List<AgentInfo> _agents = new();
    private long? _activeSessions;
    private readonly List<string> _subscriptions;
    private readonly TimeProvider _timeProvider;
    private long _serverSeq;
    private DateTimeOffset? _lastConnectedAt;
    private ulong _generation;

    public CancellationTokenSource LifetimeCts { get; } = new();
    public Task SupervisorTask { get; set; } = Task.CompletedTask;
    public SemaphoreSlim ConnectionGate { get; } = new(1, 1);

    /// <summary>Task for the fire-and-forget pump loop started in OpenHostAsync.</summary>
    public Task PumpTask { get; set; } = Task.CompletedTask;

    // ── Manual-reconnect signaling (Swift `manualReconnect` parity) ────────
    // `_manualReconnect` is a wake counter: ReconnectAsync releases it; the
    // supervisor waits on it to short-circuit a backoff sleep or to wake from
    // the `.failed` park (where the policy is exhausted/disabled). `_attemptCts`
    // is the cancellation source for the CURRENT connect attempt — ReconnectAsync
    // (and removal) cancels it so a slow `connectOnce`/transport-factory is
    // aborted promptly rather than blocking the next attempt.
    private readonly SemaphoreSlim _manualReconnect = new(0);
    private volatile CancellationTokenSource? _attemptCts;

    /// <summary>
    /// Request a manual reconnect: wake any backoff sleep / failed-park, and
    /// abort a slow in-flight connect attempt so the next attempt starts fresh.
    /// Mirrors Swift <c>HostRuntime.reconnect()</c>.
    /// </summary>
    public void SignalManualReconnect()
    {
        // Abort the in-flight attempt (slow factory / hung handshake) first…
        try { _attemptCts?.Cancel(); } catch (ObjectDisposedException) { }
        // …then wake the supervisor's wait so it loops back to a fresh attempt.
        try { _manualReconnect.Release(); } catch (SemaphoreFullException) { } catch (ObjectDisposedException) { }
    }

    /// <summary>
    /// Awaits a manual-reconnect request or <paramref name="ct"/> cancellation.
    /// Returns true if a manual reconnect was requested, false if cancelled.
    /// </summary>
    public async Task<bool> WaitForManualReconnectAsync(CancellationToken ct)
    {
        try { await _manualReconnect.WaitAsync(ct).ConfigureAwait(false); return true; }
        catch (OperationCanceledException) { return false; }
    }

    /// <summary>
    /// Awaits EITHER the current client's completion (a transport drop) OR a
    /// manual-reconnect request, whichever happens first. Returns true if a
    /// manual reconnect won the race, false if the connection dropped (or ct
    /// cancelled).
    /// </summary>
    public async Task<bool> WaitForDropOrManualReconnectAsync(Task completion, CancellationToken ct)
    {
        // The manual wait must be cancellable independently of ct: if the DROP
        // wins the race, a still-pending _manualReconnect.WaitAsync waiter would
        // linger in the semaphore's FIFO queue and swallow the next
        // ReconnectAsync Release() that is meant to wake the PARKED supervisor —
        // leaving the host asleep forever (the manual reconnect never takes).
        using var manualCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var manual = _manualReconnect.WaitAsync(manualCts.Token);
        var winner = await Task.WhenAny(completion, manual).ConfigureAwait(false);
        if (winner == manual)
        {
            // Observe the result so a faulted/cancelled wait doesn't go unhandled.
            try { await manual.ConfigureAwait(false); } catch { }
            return true;
        }
        // Drop won. Cancel the loser to release its semaphore slot. If it raced to
        // completion and actually took a permit, hand the permit back so the
        // pending manual reconnect is not lost.
        manualCts.Cancel();
        try { await manual.ConfigureAwait(false); _manualReconnect.Release(); }
        catch { /* cancelled before taking a permit — nothing to return */ }
        return false;
    }

    /// <summary>
    /// Establishes a fresh per-attempt CancellationTokenSource linked to the
    /// host lifetime token, returning its token. SignalManualReconnect() cancels
    /// whatever attempt CTS is current, aborting a slow factory.
    /// </summary>
    public CancellationToken BeginAttempt()
    {
        var linked = CancellationTokenSource.CreateLinkedTokenSource(LifetimeCts.Token);
        var prev = Interlocked.Exchange(ref _attemptCts, linked);
        prev?.Dispose();
        return linked.Token;
    }

    /// <summary>Disposes the current per-attempt CTS once an attempt concludes.</summary>
    public void EndAttempt()
    {
        var prev = Interlocked.Exchange(ref _attemptCts, null);
        prev?.Dispose();
    }

    /// <summary>Drain any pending manual-reconnect signals (after a connect lands).</summary>
    public void DrainManualReconnectSignals()
    {
        while (_manualReconnect.CurrentCount > 0)
        {
            try { _manualReconnect.Wait(0); } catch { break; }
        }
    }

    /// <summary>
    /// Disposes the entry's owned disposables (<see cref="LifetimeCts"/>, the
    /// manual-reconnect semaphore, and the current per-attempt CTS if any). Call
    /// once at teardown after the supervisor / pump tasks that wait on the
    /// semaphore and lifetime token have been awaited — exactly where the
    /// teardown paths previously disposed only <see cref="LifetimeCts"/>.
    /// </summary>
    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        LifetimeCts.Dispose();
        ConnectionGate.Dispose();
        _manualReconnect.Dispose();
        // EndAttempt normally disposes the per-attempt CTS, but a teardown that
        // interrupts an in-flight attempt may leave one set; dispose it too.
        Interlocked.Exchange(ref _attemptCts, null)?.Dispose();
    }

    // Idempotency guard: RemoveHostAsync and ShutdownAsync can both reach a
    // given entry's teardown; a second Dispose must be a clean no-op.
    private int _disposed;

    public HostEntry(HostId id, HostConfig config, string clientId)
    {
        Id = id; Config = config; ClientId = clientId;
        _timeProvider = config.ClientConfig?.TimeProvider ?? TimeProvider.System;
        _updatedAt = _timeProvider.GetUtcNow();
        // Seed the replay subscription set from the normalized config so it
        // survives reconnects (mirrors Swift HostRuntime seeding `subscriptions`
        // from `config.initialSubscriptions`).
        _subscriptions = config.InitialSubscriptions is { Count: > 0 }
            ? new List<string>(config.InitialSubscriptions)
            : new List<string>();
    }

    /// <summary>
    /// The current client, or null if not connected. Lock-free: a reference read
    /// is atomic and <c>_client</c> is <c>volatile</c>, so no lock is needed just
    /// to read one published reference.
    /// </summary>
    public AhpClient? CurrentClient => _client;

    public void SetClient(AhpClient? client, string protoVer)
    {
        // _protoVer is read together with _state/_updatedAt by Snapshot(), so the
        // write stays under the lock; the _client write is a volatile publish.
        lock (_gate)
        {
            _client = client;
            _protoVer = protoVer;
            if (client is null)
            {
                if (_clientReady.Task.IsCompleted)
                    _clientReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
            }
            else
            {
                _clientReady.TrySetResult(client);
            }
        }
    }

    public async Task<AhpClient> WaitForClientAsync(CancellationToken cancellationToken)
    {
        Task<AhpClient?> ready;
        lock (_gate)
        {
            if (_client is { } client) return client;
            if (_state.Kind is not HostStateKind.Connecting and not HostStateKind.Reconnecting)
                throw new HostNotConnectedException(Id);
            ready = _clientReady.Task;
        }

        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken,
            LifetimeCts.Token);
        return await ready.WaitAsync(linkedCts.Token).ConfigureAwait(false)
            ?? throw new HostNotConnectedException(Id);
    }

    public void SetState(HostState state)
    {
        lock (_gate)
        {
            _state = state;
            _updatedAt = _timeProvider.GetUtcNow();
            if (_client is null)
            {
                if (state.Kind is HostStateKind.Connecting or HostStateKind.Reconnecting)
                {
                    if (_clientReady.Task.IsCompleted)
                        _clientReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
                }
                else
                {
                    _clientReady.TrySetResult(null);
                }
            }
        }
    }

    public void BeginReconnect(HostState state)
    {
        lock (_gate)
        {
            _state = state;
            _updatedAt = _timeProvider.GetUtcNow();
            _client = null;
            _protoVer = "";
            if (_clientReady.Task.IsCompleted)
                _clientReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
        }
    }

    /// <summary>An immutable, consistent snapshot of this host's public state.</summary>
    public HostHandle Snapshot()
    {
        lock (_gate)
        {
            // Materialize summaries sorted by ModifiedAt descending (newest
            // first), matching Swift's `sessionSummaries` sort contract.
            var summaries = new List<SessionSummary>(_sessionSummaries.Values);
            summaries.Sort(static (a, b) =>
            {
                var byTime = string.CompareOrdinal(b.ModifiedAt, a.ModifiedAt);
                if (byTime != 0) return byTime;
                // Stable tie-break on resource so equal timestamps are
                // deterministic across calls.
                return string.CompareOrdinal(a.Resource, b.Resource);
            });

            return new HostHandle
            {
                Id = Id,
                Label = Config.Label,
                ClientId = ClientId,
                State = _state,
                ProtocolVersion = _protoVer,
                UpdatedAt = _updatedAt,
                Agents = new List<AgentInfo>(_agents),
                SessionSummaries = summaries,
                ActiveSessions = _activeSessions,
                Subscriptions = new List<string>(_subscriptions),
                ServerSeq = _serverSeq,
                LastConnectedAt = _lastConnectedAt,
                Generation = _generation,
            };
        }
    }

    // ── Swift-parity observable mutators (all take _gate) ──────────────────

    /// <summary>
    /// Records a successful (re)connect: bumps the generation, stamps the
    /// connect time, and applies the root snapshot (agents + activeSessions)
    /// when present. Mirrors the `state.generation &amp;+= 1` / root-snapshot block
    /// in Swift's <c>completeHandshake</c>.
    /// </summary>
    public ulong ApplyConnected(RootState? root, long serverSeq)
    {
        lock (_gate)
        {
            _generation += 1;
            _lastConnectedAt = _timeProvider.GetUtcNow();
            _serverSeq = serverSeq;
            if (root is not null)
            {
                _agents = root.Agents is { } a ? new List<AgentInfo>(a) : new List<AgentInfo>();
                _activeSessions = root.ActiveSessions;
            }
            return _generation;
        }
    }

    /// <summary>
    /// Replaces the cached session summaries with the <c>listSessions</c> seed.
    /// Mirrors the `state.sessionSummaries.removeAll()` + repopulate block in
    /// Swift's <c>completeHandshake</c>.
    /// </summary>
    public void SeedSessionSummaries(IEnumerable<SessionSummary> items)
    {
        lock (_gate)
        {
            _sessionSummaries.Clear();
            foreach (var item in items) _sessionSummaries[item.Resource] = item;
        }
    }

    /// <summary>Adds or replaces a single cached summary (root/sessionAdded).</summary>
    public void PutSessionSummary(SessionSummary summary)
    {
        lock (_gate) { _sessionSummaries[summary.Resource] = summary; }
    }

    /// <summary>Removes a cached summary by URI (root/sessionRemoved).</summary>
    public void RemoveSessionSummary(string uri)
    {
        lock (_gate) { _sessionSummaries.Remove(uri); }
    }

    /// <summary>
    /// Applies a partial summary patch in place (root/sessionSummaryChanged).
    /// Identity fields (resource/provider/createdAt) are ignored per spec —
    /// mirrors Swift's <c>applySummaryChanges</c>.
    /// </summary>
    public void ApplySummaryChange(string uri, PartialSessionSummary changes)
    {
        lock (_gate)
        {
            if (!_sessionSummaries.TryGetValue(uri, out var existing)) return;
            // Copy-on-write: build a NEW SessionSummary instead of mutating the cached
            // one in place, so any HostHandle snapshot already handed to a consumer keeps
            // its immutable view (the prior object is never touched). Identity fields
            // (Resource/Provider/CreatedAt) are preserved per spec; the patch overrides
            // the fields it carries; EVERY other field is carried over verbatim — copy
            // all 14 so none (e.g. Agent / Annotations, absent from the patch) is dropped.
            _sessionSummaries[uri] = new SessionSummary
            {
                Resource = existing.Resource,
                Provider = existing.Provider,
                Title = changes.Title ?? existing.Title,
                Status = changes.Status ?? existing.Status,
                Activity = changes.Activity ?? existing.Activity,
                CreatedAt = existing.CreatedAt,
                ModifiedAt = changes.ModifiedAt ?? existing.ModifiedAt,
                Project = changes.Project ?? existing.Project,
                WorkingDirectories = changes.WorkingDirectories ?? existing.WorkingDirectories,
                Changes = changes.Changes ?? existing.Changes,
                Annotations = existing.Annotations,
                Meta = changes.Meta ?? existing.Meta,
            };
        }
    }

    /// <summary>Tracks a URI in the replay subscription set (idempotent).</summary>
    public void AppendSubscription(string uri)
    {
        lock (_gate) { if (!_subscriptions.Contains(uri)) _subscriptions.Add(uri); }
    }

    /// <summary>Drops a URI from the replay subscription set.</summary>
    public void RemoveSubscription(string uri)
    {
        lock (_gate) { _subscriptions.Remove(uri); }
    }

    /// <summary>Drops URIs that the server could not resume.</summary>
    public void RemoveSubscriptions(IEnumerable<string> uris)
    {
        lock (_gate)
        {
            foreach (var uri in uris) _subscriptions.Remove(uri);
        }
    }

    /// <summary>Advances the last observed server sequence without moving it backward.</summary>
    public void AdvanceServerSeq(long serverSeq)
    {
        lock (_gate)
        {
            if (serverSeq > _serverSeq) _serverSeq = serverSeq;
        }
    }

    /// <summary>Applies root actions represented by the public host snapshot.</summary>
    public bool ApplyRootAction(StateAction action)
    {
        lock (_gate)
        {
            switch (action.Value)
            {
                case RootAgentsChangedAction agents:
                    _agents = new List<AgentInfo>(agents.Agents);
                    return true;
                case RootActiveSessionsChangedAction sessions:
                    _activeSessions = sessions.ActiveSessions;
                    return true;
                default:
                    return false;
            }
        }
    }
}

// ─── MultiHostClient ─────────────────────────────────────────────────────────

/// <summary>
/// Multi-host registry + reconnect supervisor. Manages N independent AHP hosts,
/// fans in their inbound events, and supervises reconnects per-host policy.
/// </summary>
public sealed class MultiHostClient : IMultiHostClient
{
    private readonly ConcurrentDictionary<string, HostEntry> _hosts = new(StringComparer.Ordinal);
    private volatile IClientIdStore _store;

    private readonly List<Channel<HostEvent>> _eventChannels = new();
    private readonly object _eventsLock = new();

    private readonly List<Channel<HostSubscriptionEvent>> _subChannels = new();
    private readonly object _subsLock = new();

    // ── Per-host listener registries (Swift-parity, MultiHostClient-owned) ──
    // These live on the facade (NOT on any single AhpClient), so they survive
    // reconnects: replayed envelopes the supervisor fans out on reconnect reach
    // them too. Mirrors `perResourceListeners` / hostSnapshots / sessionSummaries
    // ownership in Swift's MultiHostClient.swift.
    private readonly object _perHostLock = new();
    // Per-(hostId) bucket of per-(uri) event listeners for EventsForHost.
    private readonly Dictionary<string, List<PerResourceListener>> _perResourceListeners = new(StringComparer.Ordinal);
    // Per-(hostId) bucket of HostHandle-snapshot listeners for HostSnapshots.
    private readonly Dictionary<string, List<Channel<HostHandle>>> _snapshotListeners = new(StringComparer.Ordinal);
    // Per-(hostId) bucket of session-summary-list listeners for SessionSummaries.
    private readonly Dictionary<string, List<Channel<IReadOnlyList<SessionSummary>>>> _summaryListeners = new(StringComparer.Ordinal);

    private readonly CancellationTokenSource _rootCts = new();

    // ── Cached drop-tags (one allocation per stream kind, not per drop callback) ──
    // The bounded-channel itemDropped callback fires per evicted event under
    // back-pressure; building the KeyValuePair inline would allocate on every
    // drop. Hoisting each stream's tag to a static mirrors the single-host
    // drop-path (AhpClient.DropTag / Subscription.DropTag) and routes the
    // ahp.stream attribute value through the generated StreamHost* constants
    // rather than a raw literal.
    private static readonly KeyValuePair<string, object?> DropTagHostEvent =
        new(AhpTelemetryNames.AttrStream, AhpTelemetryNames.StreamHostEvent);
    private static readonly KeyValuePair<string, object?> DropTagHostSubscription =
        new(AhpTelemetryNames.AttrStream, AhpTelemetryNames.StreamHostSubscription);
    private static readonly KeyValuePair<string, object?> DropTagHostResource =
        new(AhpTelemetryNames.AttrStream, AhpTelemetryNames.StreamHostResource);
    private static readonly KeyValuePair<string, object?> DropTagHostSnapshot =
        new(AhpTelemetryNames.AttrStream, AhpTelemetryNames.StreamHostSnapshot);
    private static readonly KeyValuePair<string, object?> DropTagHostSummaries =
        new(AhpTelemetryNames.AttrStream, AhpTelemetryNames.StreamHostSummaries);

    // ── Reconnect-outcome tags (cached, one allocation per outcome) ──────────
    private static readonly KeyValuePair<string, object?> ReconnectOk =
        new(AhpTelemetryNames.AttrOutcome, AhpTelemetryNames.OutcomeOk);
    private static readonly KeyValuePair<string, object?> ReconnectError =
        new(AhpTelemetryNames.AttrOutcome, AhpTelemetryNames.OutcomeError);

    // Set once ShutdownAsync has begun. Guards AddHostAsync (which throws
    // HostShutDownException afterward, mirroring Swift's `add` post-shutdown
    // behavior) and makes Shutdown idempotent. Read/written under _perHostLock.
    private bool _didShutDown;

    // ── Construction ──────────────────────────────────────────────────────

    /// <summary>Creates a multi-host registry backed by an <see cref="InMemoryClientIdStore"/>.</summary>
    public MultiHostClient() : this(new InMemoryClientIdStore()) { }

    /// <summary>Creates a multi-host registry backed by the given store.</summary>
    public MultiHostClient(IClientIdStore store) => _store = store;

    /// <summary>Swaps the <see cref="IClientIdStore"/>. Call before any <see cref="AddHostAsync"/>.</summary>
    public MultiHostClient WithClientIdStore(IClientIdStore store)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        return this;
    }

    // ── Single-host convenience ───────────────────────────────────────────

    /// <summary>
    /// One-line constructor for the common "I just want one host" case.
    /// Returns the client and the initial host handle.
    /// </summary>
    public static async Task<(MultiHostClient Client, HostHandle Handle)> SingleAsync(
        HostConfig config,
        CancellationToken cancellationToken = default)
    {
        var m = new MultiHostClient();
        try
        {
            var handle = await m.AddHostAsync(config, cancellationToken).ConfigureAwait(false);
            return (m, handle);
        }
        catch
        {
            await m.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }

    // ── Host management ───────────────────────────────────────────────────

    /// <summary>
    /// Registers <paramref name="config"/>, opens its initial transport, runs the
    /// <c>initialize</c> handshake, and starts the reconnect supervisor. Returns a
    /// fresh <see cref="HostHandle"/> snapshot. The configuration is snapshotted;
    /// subsequent changes to its nested client configuration or collection values
    /// do not affect reconnects.
    /// </summary>
    public async Task<HostHandle> AddHostAsync(
        HostConfig config,
        CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(config, nameof(config));
        if (config.Id is null) throw new ArgumentException("HostConfig.Id is required.", nameof(config));
        if (config.TransportFactory is null)
            throw new ArgumentException($"HostConfig.TransportFactory is required for {config.Id}.", nameof(config));

        // Take ownership of all caller-mutable state before the first await.
        var ownedConfig = config.Snapshot(config.ClientId ?? "");

        // After shutdown, adding a host is rejected with HostShutDownException
        // carrying the would-be host id (mirrors Swift `add` throwing
        // `.hostShutDown(id)` once `didShutDown`).
        lock (_perHostLock)
        {
            if (_didShutDown) throw new HostShutDownException(config.Id);
        }

        // Resolve or mint a clientId.
        var clientId = ownedConfig.ClientId;
        if (string.IsNullOrEmpty(clientId))
        {
            clientId = await _store.LoadAsync(ownedConfig.Id, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrEmpty(clientId))
                clientId = GenerateClientId();
        }
        await _store.StoreAsync(ownedConfig.Id, clientId!, cancellationToken).ConfigureAwait(false);

        var normalizedConfig = ownedConfig.Snapshot(clientId!);

        var entry = new HostEntry(ownedConfig.Id, normalizedConfig, clientId!);

        // Atomic add-if-absent: TryAdd is the check-then-act done correctly,
        // with no separate lock and no race window. Duplicate ids surface the
        // typed DuplicateHostException carrying the offending id (mirrors Swift
        // `add` throwing `.duplicateHost(id)`).
        if (!_hosts.TryAdd(ownedConfig.Id.ToString(), entry))
        {
            entry.Dispose();
            throw new DuplicateHostException(ownedConfig.Id);
        }

        // Initial connect; on failure remove the host and propagate.
        try
        {
            await OpenHostAsync(entry, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            SetHostState(entry, new HostState { Kind = HostStateKind.Failed, Error = ex });
            if (_hosts.TryRemove(entry.Id.ToString(), out _))
            {
                entry.LifetimeCts.Cancel();
                entry.Dispose();
            }
            throw;
        }

        // Start supervisor. CancellationToken.None is intentional: the supervisor
        // manages its own lifetime via entry.LifetimeCts.Token; the AddHostAsync
        // cancellationToken is only for the initial connection setup and must not
        // propagate to the long-lived background task (CA2016 false-positive here).
        entry.SupervisorTask = Task.Run(() => SuperviseAsync(entry), CancellationToken.None);

        return entry.Snapshot();
    }

    /// <summary>Returns a fresh snapshot of the host with <paramref name="id"/>, or null if not registered.</summary>
    public HostHandle? Host(HostId id) =>
        _hosts.TryGetValue(id.ToString(), out var entry) ? entry.Snapshot() : null;

    /// <summary>Returns a fresh snapshot of every registered host.</summary>
    public List<HostHandle> Hosts()
    {
        // ConcurrentDictionary.Values is a moment-in-time snapshot — safe to
        // enumerate without external locking.
        var result = new List<HostHandle>();
        foreach (var e in _hosts.Values) result.Add(e.Snapshot());
        return result;
    }

    /// <summary>
    /// Acquires a generation-checked client handle for <paramref name="id"/>, or
    /// null if the host is not registered or has no live connection. The handle
    /// refuses to operate once the host has been removed (throwing
    /// <see cref="HostShutDownException"/>) or once a reconnect has replaced the
    /// connection it was minted against. Mirrors Swift's <c>client(for:)</c>.
    /// </summary>
    public HostClientHandle? ClientFor(HostId id)
    {
        if (!_hosts.TryGetValue(id.ToString(), out var entry)) return null;
        var snap = entry.Snapshot();
        if (entry.CurrentClient is null) return null;
        return new HostClientHandle(this, id, snap.Generation);
    }

    // Internal accessor used by HostClientHandle to validate liveness against
    // the live registry (returns null once the host is removed/shut down).
    internal HostEntry? TryGetEntry(HostId id) =>
        _hosts.TryGetValue(id.ToString(), out var entry) ? entry : null;

    /// <summary>
    /// Unregisters a host and tears down its supervisor and client. Throws
    /// <see cref="UnknownHostException"/> if no host with <paramref name="id"/>
    /// is registered. Per-host streams (<see cref="EventsForHost"/>,
    /// <see cref="HostSnapshots"/>, <see cref="SessionSummariesForHost"/>) for
    /// this host are finished so their <c>await foreach</c> loops exit cleanly.
    /// </summary>
    public async Task RemoveHostAsync(HostId id, CancellationToken cancellationToken = default)
    {
        if (!_hosts.TryRemove(id.ToString(), out var entry))
            throw new UnknownHostException(id);

        // Finish per-host listener streams first so consumers observing them
        // exit their loops as soon as the host is gone (mirrors Swift's
        // `finishPerResourceListeners(for:)` on `remove(_:)`).
        FinishPerHostListeners(id.ToString());

        entry!.LifetimeCts.Cancel();
        await entry.ConnectionGate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        try
        {
            var client = entry.CurrentClient;
            if (client is not null)
            {
                try { await client.ShutdownAsync(CancellationToken.None).ConfigureAwait(false); } catch { }
            }
        }
        finally
        {
            entry.ConnectionGate.Release();
        }
        try { await entry.SupervisorTask.ConfigureAwait(false); } catch { }
        try { await entry.PumpTask.ConfigureAwait(false); } catch (OperationCanceledException) { } catch { }
        entry.Dispose();

        // Announce the removal on the connection-event stream, mirroring Swift's
        // `broadcastHostEvent(.removed(id))` at the end of `remove(_:)`. Fired
        // after teardown so a consumer that reacts to the removed event observes
        // a host that is already gone (Host(id) == null).
        BroadcastHostEvent(HostEvent.Removed(id));
    }

    // ── Event channels ────────────────────────────────────────────────────

    /// <summary>
    /// Returns a channel that receives <see cref="HostEvent"/> state transitions.
    /// Each call returns an independent channel; slow consumers drop events.
    /// </summary>
    public ChannelReader<HostEvent> Events()
    {
        var ch = Channel.CreateBounded<HostEvent>(
            new BoundedChannelOptions(64) { FullMode = BoundedChannelFullMode.DropOldest },
            _ => AhpTelemetry.DroppedEvents.Add(1, DropTagHostEvent));
        lock (_eventsLock) { _eventChannels.Add(ch); }
        return ch.Reader;
    }

    /// <summary>
    /// Returns a channel that receives every <see cref="HostSubscriptionEvent"/> from
    /// every registered host.
    /// </summary>
    public ChannelReader<HostSubscriptionEvent> Subscriptions()
    {
        var ch = Channel.CreateBounded<HostSubscriptionEvent>(
            new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.DropOldest },
            _ => AhpTelemetry.DroppedEvents.Add(1, DropTagHostSubscription));
        lock (_subsLock) { _subChannels.Add(ch); }
        return ch.Reader;
    }

    // ── Shutdown ──────────────────────────────────────────────────────────

    /// <summary>Tears down every host and releases registered event channels. Idempotent.</summary>
    public async Task ShutdownAsync(CancellationToken cancellationToken = default)
    {
        lock (_perHostLock)
        {
            if (_didShutDown) return;
            _didShutDown = true;
        }

        _rootCts.Cancel();

        var entries = new List<HostEntry>(_hosts.Values);
        _hosts.Clear();

        // Finish per-host listener streams for every host so their consumers'
        // `await foreach` loops exit (mirrors the perResourceListeners finish in
        // Swift's shutdown()).
        foreach (var entry in entries) FinishPerHostListeners(entry.Id.ToString());

        foreach (var entry in entries)
        {
            entry.LifetimeCts.Cancel();
            // Wake a parked (failed/disabled) supervisor so it observes the
            // cancellation and exits rather than blocking on its manual-reconnect
            // wait forever.
            entry.SignalManualReconnect();
            await entry.ConnectionGate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
            try
            {
                var client = entry.CurrentClient;
                if (client is not null)
                {
                    try { await client.ShutdownAsync(CancellationToken.None).ConfigureAwait(false); } catch { }
                }
            }
            finally
            {
                entry.ConnectionGate.Release();
            }
        }

        // Wait for all supervisors and pump tasks.
        foreach (var entry in entries)
        {
            try { await entry.SupervisorTask.ConfigureAwait(false); } catch { }
            try { await entry.PumpTask.ConfigureAwait(false); } catch (OperationCanceledException) { } catch { }
            entry.Dispose();
        }

        // Complete all event/subscription channel writers so consumers' await foreach terminates.
        lock (_eventsLock)
        {
            foreach (var ch in _eventChannels) ch.Writer.TryComplete();
        }
        lock (_subsLock)
        {
            foreach (var ch in _subChannels) ch.Writer.TryComplete();
        }

        _rootCts.Dispose();
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await ShutdownAsync().ConfigureAwait(false);
    }

    // ── Internal: openHost, supervisor, pumpEvents ────────────────────────

    private async Task OpenHostAsync(HostEntry entry, CancellationToken cancellationToken, bool isReconnect = false)
    {
        CancellationTokenSource? linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken,
            entry.LifetimeCts.Token);
        var attempt = new OpenHostAttempt();
        var openTask = OpenHostCoreAsync(entry, isReconnect, attempt, linkedCts.Token);
        try
        {
            await openTask.WaitAsync(linkedCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (linkedCts.IsCancellationRequested)
        {
            if (!attempt.TryAbandon())
            {
                // Installation has committed under ConnectionGate. Let its
                // synchronous replay/snapshot publication finish before the
                // supervisor can launch a replacement attempt.
                await openTask.ConfigureAwait(false);
                return;
            }
            if (openTask.IsCompleted)
            {
                await openTask.ConfigureAwait(false);
                return;
            }
            _ = ObserveAbandonedOpenHostAsync(openTask, linkedCts);
            linkedCts = null;
            throw;
        }
        finally
        {
            linkedCts?.Dispose();
        }
    }

    private async Task OpenHostCoreAsync(
        HostEntry entry,
        bool isReconnect,
        OpenHostAttempt attempt,
        CancellationToken cancellationToken)
    {
        SetHostState(entry, new HostState { Kind = HostStateKind.Connecting });

        var transport = await entry.Config.TransportFactory(entry.Id, cancellationToken).ConfigureAwait(false);
        AhpClient? client = null;
        var installed = false;
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            client = AhpClient.Connect(
                transport,
                entry.Config.ClientConfig,
                null);
            transport = null;
            // Register before the first handshake request so notifications that
            // race initialize/reconnect are buffered rather than discarded.
            var stream = client.CreateEventStream();

            // On a reconnect with a known serverSeq, issue the AHP `reconnect` command
            // (clientId + lastSeenServerSeq) so the host REPLAYS the actions missed
            // while disconnected, instead of re-initializing from scratch. Mirrors
            // Swift's HostRuntime reconnect path. Falls back to a fresh `initialize`
            // on the still-live client if the host rejects reconnect.
            var subscriptions = entry.Config.InitialSubscriptions;
            if (isReconnect)
            {
                var snap = entry.Snapshot();
                subscriptions = snap.Subscriptions;
                ReconnectResult? reconnectResult = null;
                try
                {
                    reconnectResult = await client.ReconnectAsync(
                        snap.ClientId, snap.ServerSeq, subscriptions, cancellationToken)
                        .ConfigureAwait(false);
                }
                catch (Exception) when (!cancellationToken.IsCancellationRequested)
                {
                    // Host does not support `reconnect` (or it errored) — fall through
                    // to a fresh `initialize` on the still-live client below. A
                    // cancellation (shutdown/dispose) is NOT swallowed: it propagates
                    // so the supervisor tears down promptly instead of blocking on a
                    // fallback initialize.
                }

                if (reconnectResult?.Value is ReconnectReplayResult replay)
                {
                    var summaries = await FetchSessionSummariesAsync(entry, client, cancellationToken).ConfigureAwait(false);
                    cancellationToken.ThrowIfCancellationRequested();
                    await entry.ConnectionGate.WaitAsync(cancellationToken).ConfigureAwait(false);
                    try
                    {
                        attempt.BeginCommit(cancellationToken);
                        InstallOpenHost(entry, client, snap.ProtocolVersion, stream,
                            () =>
                            {
                                if (summaries is not null) entry.SeedSessionSummaries(summaries);
                                ApplyReconnectReplay(entry, replay);
                            });
                        installed = true;
                    }
                    finally
                    {
                        entry.ConnectionGate.Release();
                    }
                    return;
                }

                if (reconnectResult?.Value is ReconnectSnapshotResult snapshot)
                {
                    var summaries = await FetchSessionSummariesAsync(entry, client, cancellationToken).ConfigureAwait(false);
                    cancellationToken.ThrowIfCancellationRequested();
                    await entry.ConnectionGate.WaitAsync(cancellationToken).ConfigureAwait(false);
                    try
                    {
                        attempt.BeginCommit(cancellationToken);
                        InstallOpenHost(entry, client, snap.ProtocolVersion, stream,
                            () =>
                            {
                                if (summaries is not null) entry.SeedSessionSummaries(summaries);
                                ApplyReconnectSnapshot(entry, snapshot);
                            });
                        installed = true;
                    }
                    finally
                    {
                        entry.ConnectionGate.Release();
                    }
                    return;
                }
            }

            var result = await client.InitializeAsync(
                entry.ClientId,
                entry.Config.ProtocolVersions,
                subscriptions,
                cancellationToken)
                .ConfigureAwait(false);

            // Extract the root-state snapshot (agents + activeSessions) that the
            // server returned for the root channel, mirroring the
            // `init1.snapshots.first(where: resource == RootResourceURI)` block in
            // Swift's completeHandshake.
            var root = ExtractRootSnapshot(result.Snapshots);
            var initialSummaries = await FetchSessionSummariesAsync(entry, client, cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            await entry.ConnectionGate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                attempt.BeginCommit(cancellationToken);
                InstallOpenHost(entry, client, result.ProtocolVersion, stream,
                    () =>
                    {
                        if (initialSummaries is not null) entry.SeedSessionSummaries(initialSummaries);
                        entry.ApplyConnected(root, result.ServerSeq);
                    });
                installed = true;
            }
            finally
            {
                entry.ConnectionGate.Release();
            }
        }
        finally
        {
            if (!installed)
            {
                if (client is not null)
                {
                    try { await client.ShutdownAsync(CancellationToken.None).ConfigureAwait(false); } catch { }
                }
                else if (transport is not null)
                {
                    try { await transport.CloseAsync(CancellationToken.None).ConfigureAwait(false); } catch { }
                    try { await transport.DisposeAsync().ConfigureAwait(false); } catch { }
                }
            }
        }
    }

    private static async Task ObserveAbandonedOpenHostAsync(
        Task openTask,
        CancellationTokenSource linkedCts)
    {
        try { await openTask.ConfigureAwait(false); }
        catch { }
        finally { linkedCts.Dispose(); }
    }

    private void InstallOpenHost(
        HostEntry entry,
        AhpClient client,
        string protocolVersion,
        EventStream stream,
        Action applyHandshake)
    {
        entry.SetClient(client, protocolVersion);
        try
        {
            applyHandshake();
            CompleteOpenHost(entry, stream);
        }
        catch
        {
            entry.SetClient(null, "");
            throw;
        }
    }

    private void CompleteOpenHost(HostEntry entry, EventStream stream)
    {
        SetHostState(entry, new HostState { Kind = HostStateKind.Connected });

        // Emit a post-connect snapshot + summary list to per-host stream
        // listeners (the connect transition is the first "observable change"
        // after listSessions lands), mirroring the `.connected` re-yields in
        // Swift's hostSnapshots / sessionSummaries watchers.
        NotifyPerHostSnapshot(entry);
        NotifyPerHostSummaries(entry);

        // Fan events out to subscribers.
        entry.PumpTask = Task.Run(() => PumpEventsAsync(entry, stream));
    }

    /// <summary>
    /// Applies a reconnect-replay result: bumps the host generation (a reconnect
    /// happened) + advances the serverSeq to the last replayed envelope, and fans
    /// every replayed action out exactly like the live pump (host-state mirror +
    /// global subscription fan-in + per-(host,uri) listeners) so consumers that
    /// subscribed before the drop observe the actions missed while disconnected.
    /// URIs in <c>Missing</c> are pruned from the reconnect subscription set.
    /// </summary>
    private ulong ApplyReconnectReplay(HostEntry entry, ReconnectReplayResult replay)
    {
        var initialSeq = entry.Snapshot().ServerSeq;
        var previousSeq = initialSeq;
        if (replay.Actions is { } seqScan)
        {
            foreach (var env in seqScan)
            {
                if (env.ServerSeq <= previousSeq)
                    throw new AhpTransportException(
                        "protocol",
                        $"ahp: reconnect replay sequence {env.ServerSeq} did not advance past {previousSeq}");
                previousSeq = env.ServerSeq;
            }
        }

        var generation = entry.ApplyConnected(null, initialSeq);

        if (replay.Actions is { } actions)
        {
            foreach (var env in actions)
            {
                var evt = new SubscriptionEventAction(env);
                ApplyEventToHostState(entry, evt);
                if (env.Channel == ProtocolVersion.RootResourceUri)
                    entry.ApplyRootAction(env.Action);
                entry.AdvanceServerSeq(env.ServerSeq);
                var hostEv = new HostSubscriptionEvent(entry.Id, env.Channel, evt);
                List<Channel<HostSubscriptionEvent>>? channels;
                lock (_subsLock)
                {
                    channels = _subChannels.Count == 0
                        ? null
                        : new List<Channel<HostSubscriptionEvent>>(_subChannels);
                }
                if (channels is not null)
                    foreach (var ch in channels) ch.Writer.TryWrite(hostEv);
                BroadcastPerResourceEvent(entry.Id, env.Channel, evt);
            }
        }
        entry.RemoveSubscriptions(replay.Missing);
        return generation;
    }

    /// <summary>
    /// Applies a reconnect snapshot without issuing a second initialize. The
    /// every returned resource snapshot is published before the host transitions
    /// to connected. The subscription set is retained because stateless
    /// subscriptions intentionally have no snapshot.
    /// </summary>
    private ulong ApplyReconnectSnapshot(HostEntry entry, ReconnectSnapshotResult result)
    {
        var lastSeq = entry.Snapshot().ServerSeq;
        foreach (var snapshot in result.Snapshots)
        {
            if (snapshot.FromSeq > lastSeq) lastSeq = snapshot.FromSeq;
        }
        var generation = entry.ApplyConnected(ExtractRootSnapshot(result.Snapshots), lastSeq);
        foreach (var snapshot in result.Snapshots)
        {
            var evt = new SubscriptionEventSnapshot(snapshot);
            var hostEv = new HostSubscriptionEvent(entry.Id, snapshot.Resource, evt);
            List<Channel<HostSubscriptionEvent>>? channels;
            lock (_subsLock)
            {
                channels = _subChannels.Count == 0
                    ? null
                    : new List<Channel<HostSubscriptionEvent>>(_subChannels);
            }
            if (channels is not null)
                foreach (var ch in channels) ch.Writer.TryWrite(hostEv);
            BroadcastPerResourceEvent(entry.Id, snapshot.Resource, evt);
        }
        return generation;
    }

    /// <summary>Pulls root state out of a snapshot collection, if present.</summary>
    private static RootState? ExtractRootSnapshot(IReadOnlyList<Snapshot>? snapshots)
    {
        if (snapshots is null) return null;
        foreach (var snapshot in snapshots)
        {
            if (snapshot.Resource == ProtocolVersion.RootResourceUri && snapshot.State?.Root is { } root)
                return root;
        }
        return null;
    }

    /// <summary>
    /// Issues a best-effort <c>listSessions</c> on the root channel. The caller
    /// applies the returned summaries only after the connection attempt commits.
    /// Bounded by a short timeout and fully non-fatal.
    /// </summary>
    private static async Task<IReadOnlyList<SessionSummary>?> FetchSessionSummariesAsync(
        HostEntry entry,
        AhpClient client,
        CancellationToken cancellationToken)
    {
        try
        {
            using var timeout = TimeProviderCompatibility.CreateCancellationTokenSource(
                entry.Config.ClientConfig!.TimeProvider,
                TimeSpan.FromMilliseconds(750));
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(
                cancellationToken,
                timeout.Token);
            var listed = await client.RequestAsync<ListSessionsParams, ListSessionsResult>(
                "listSessions",
                new ListSessionsParams { Channel = ProtocolVersion.RootResourceUri },
                timeoutCts.Token)
                .ConfigureAwait(false);
            return listed?.Items is { } items
                ? new List<SessionSummary>(items)
                : null;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            // Non-fatal: host did not answer listSessions in time, or returned
            // an error. Cache stays as-is (matches Swift `try?`).
            return null;
        }
    }

    private async Task PumpEventsAsync(HostEntry entry, EventStream stream)
    {
        try
        {
            // Pass the lifetime token so a shutdown/removal (LifetimeCts.Cancel)
            // reliably unblocks this read instead of relying solely on the event
            // channel completing — a race that could hang teardown's `await
            // PumpTask`. The OperationCanceledException is caught below as the
            // normal-shutdown path.
            await foreach (var ev in stream.Events.ReadAllAsync(entry.LifetimeCts.Token).ConfigureAwait(false))
            {
                // Update per-host observable state BEFORE broadcasting so any
                // observer reading the next snapshot sees the post-event state
                // (mirrors the ordering in Swift HostRuntime.handleEvent).
                var summaryTouched = ApplyEventToHostState(entry, ev.Event);
                var rootTouched = ev.Event is SubscriptionEventAction rootAction
                    && rootAction.Envelope.Channel == ProtocolVersion.RootResourceUri
                    && entry.ApplyRootAction(rootAction.Envelope.Action);
                if (ev.Event is SubscriptionEventAction action)
                    entry.AdvanceServerSeq(action.Envelope.ServerSeq);

                var hostEv = new HostSubscriptionEvent(entry.Id, ev.Channel, ev.Event);
                List<Channel<HostSubscriptionEvent>>? channels;
                lock (_subsLock)
                {
                    channels = _subChannels.Count == 0
                        ? null
                        : new List<Channel<HostSubscriptionEvent>>(_subChannels);
                }
                if (channels is not null)
                    foreach (var ch in channels) ch.Writer.TryWrite(hostEv);

                // Fan to per-(host,uri) listeners scoped to this channel
                // (reducer-critical reliable path, runtime-owned so it survives
                // reconnect — Swift's perResourceListeners).
                BroadcastPerResourceEvent(entry.Id, ev.Channel, ev.Event);

                // A session-summary-shaped notification advanced the cache:
                // re-yield the snapshot + summary list to per-host listeners.
                if (summaryTouched || rootTouched)
                {
                    NotifyPerHostSnapshot(entry);
                }
                if (summaryTouched)
                {
                    NotifyPerHostSummaries(entry);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown via LifetimeCts.
        }
        catch (Exception ex)
        {
            // Unexpected pump failure — mark the host as failed.
            SetHostState(entry, new HostState
            {
                Kind = HostStateKind.Failed,
                Error = ex,
            });
        }
        finally
        {
            stream.Close();
        }
    }

    private async Task SuperviseAsync(HostEntry entry)
    {
        var policy = entry.Config.ReconnectPolicy ?? ReconnectPolicy.Default;
        var ct = entry.LifetimeCts.Token;

        while (true)
        {
            if (ct.IsCancellationRequested) return;
            var client = entry.CurrentClient;
            if (client is null) return;

            // Wait for either a transport drop (client.Completion) OR a manual
            // reconnect request. A manual reconnect on a connected host wins the
            // race and forces a fresh connect cycle below (mirrors Swift's
            // `manualReconnect` case interrupting `runConnection`).
            bool manualWhileConnected;
            try
            {
                manualWhileConnected = await entry.WaitForDropOrManualReconnectAsync(client.Completion, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }

            if (ct.IsCancellationRequested) return;

            // Tear the old client down before reconnecting (whether it dropped
            // or we're forcing a manual reconnect). Serialize replacement with
            // subscribe/unsubscribe, then drain the old event pump so reconnect
            // snapshots the final sequence observed on that connection.
            try
            {
                await entry.ConnectionGate.WaitAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            try
            {
                var oldPump = entry.PumpTask;
                BeginReconnect(entry, new HostState
                {
                    Kind = HostStateKind.Reconnecting,
                    Attempt = 1,
                });
                try { await client.ShutdownAsync(CancellationToken.None).ConfigureAwait(false); } catch { }
                try { await oldPump.ConfigureAwait(false); } catch (OperationCanceledException) { } catch { }
            }
            finally
            {
                entry.ConnectionGate.Release();
            }

            // A manual reconnect bypasses the reconnect policy entirely — even a
            // `.disabled` policy reconnects on explicit request. A spontaneous
            // drop on a disabled policy parks in `.failed` (then waits for a
            // manual reconnect to wake).
            if (!manualWhileConnected && policy.IsDisabled)
            {
                SetHostState(entry, new HostState
                {
                    Kind = HostStateKind.Failed,
                    Error = new HostReconnectFailedException(entry.Id, "hosts: transport closed and reconnect disabled"),
                });
                if (!await ParkUntilManualReconnectAsync(entry, ct).ConfigureAwait(false)) return;
                manualWhileConnected = true; // woken explicitly; bypass backoff
            }

            // Reconnect attempt loop. A manual reconnect skips the backoff sleep
            // for the first attempt (immediate). Per-attempt cancellation lets a
            // later manual reconnect / removal abort a slow transport factory.
            uint attempt = 1;
            bool immediate = manualWhileConnected;
            while (true)
            {
                if (ct.IsCancellationRequested) return;

                Task? backoffTask = null;
                if (!immediate)
                {
                    var delay = policy.BackoffFor(attempt);
                    backoffTask = TimeProviderCompatibility.DelayAsync(
                        entry.Config.ClientConfig!.TimeProvider,
                        delay,
                        ct);
                }

                // Publish Reconnecting only after the backoff timer is armed. Tests
                // and observers can then advance a fake TimeProvider without racing
                // timer registration.
                SetHostState(entry, new HostState { Kind = HostStateKind.Reconnecting, Attempt = attempt });

                if (backoffTask is not null)
                {
                    try { await backoffTask.ConfigureAwait(false); }
                    catch (OperationCanceledException) { return; }
                }
                immediate = false;

                var attemptCt = entry.BeginAttempt();
                try
                {
                    await OpenHostAsync(entry, attemptCt, isReconnect: true).ConfigureAwait(false);
                    entry.EndAttempt();
                    entry.DrainManualReconnectSignals();
                    // Reconnect succeeded: count one ok outcome.
                    AhpTelemetry.Reconnects.Add(1, ReconnectOk);
                    break; // reconnected successfully
                }
                catch (OperationCanceledException)
                {
                    entry.EndAttempt();
                    // Distinguish a lifetime cancel (shut down → exit) from an
                    // attempt-scoped cancel triggered by a manual reconnect /
                    // removal aborting a slow factory.
                    if (ct.IsCancellationRequested) return;
                    // Manual reconnect aborted this attempt: retry immediately.
                    entry.DrainManualReconnectSignals();
                    immediate = true;
                    continue;
                }
                catch
                {
                    entry.EndAttempt();
                    // Reconnect attempt failed: count one error outcome (per attempt).
                    AhpTelemetry.Reconnects.Add(1, ReconnectError);
                    /* retry after backoff */
                }

                attempt++;
                if (policy.MaxAttempts > 0 && attempt > policy.MaxAttempts)
                {
                    // Policy exhausted: count one terminal error outcome on top of
                    // the per-attempt errors above, so a consumer can alert on
                    // "gave up reconnecting" distinctly from "an attempt failed".
                    AhpTelemetry.Reconnects.Add(1, ReconnectError);
                    SetHostState(entry, new HostState
                    {
                        Kind = HostStateKind.Failed,
                        Error = new HostReconnectFailedException(entry.Id, $"hosts: exceeded {policy.MaxAttempts} reconnect attempts"),
                    });
                    // Park in `.failed` until a manual reconnect wakes us (a
                    // manual reconnect bypasses the exhausted policy), mirroring
                    // Swift's `waitForManualReconnectOrShutdown`.
                    if (!await ParkUntilManualReconnectAsync(entry, ct).ConfigureAwait(false)) return;
                    attempt = 1;
                    immediate = true;
                }
            }
        }
    }

    /// <summary>
    /// Parks a host in its terminal (<c>.failed</c>) state until a manual
    /// reconnect is requested or the host lifetime is cancelled. Returns true if
    /// a manual reconnect woke it (caller should re-attempt), false on
    /// cancellation (caller should exit). Mirrors Swift's
    /// <c>waitForManualReconnectOrShutdown</c>.
    /// </summary>
    private static async Task<bool> ParkUntilManualReconnectAsync(HostEntry entry, CancellationToken ct)
    {
        entry.DrainManualReconnectSignals();
        return await entry.WaitForManualReconnectAsync(ct).ConfigureAwait(false);
    }

    private void SetHostState(HostEntry entry, HostState state)
    {
        entry.SetState(state);
        PublishHostState(entry, state);
    }

    private void BeginReconnect(HostEntry entry, HostState state)
    {
        entry.BeginReconnect(state);
        PublishHostState(entry, state);
    }

    private void PublishHostState(HostEntry entry, HostState state)
    {
        BroadcastHostEvent(new HostEvent(entry.Id, state));

        // A state transition is an observable change for hostSnapshots
        // consumers (Swift re-yields a fresh snapshot on `.stateChanged`).
        NotifyPerHostSnapshot(entry);
    }

    /// <summary>
    /// Fans <paramref name="ev"/> out to every registered <see cref="Events"/>
    /// reader. Mirrors Swift's <c>broadcastHostEvent</c>. Slow consumers drop
    /// oldest (the channels are <c>DropOldest</c>-bounded).
    /// </summary>
    private void BroadcastHostEvent(HostEvent ev)
    {
        List<Channel<HostEvent>> channels;
        lock (_eventsLock)
        {
            if (_eventChannels.Count == 0) return;
            channels = new List<Channel<HostEvent>>(_eventChannels);
        }
        foreach (var ch in channels) ch.Writer.TryWrite(ev);
    }

    private static string GenerateClientId()
    {
        var bytes = new byte[16];
        using (RandomNumberGenerator random = RandomNumberGenerator.Create())
        {
            random.GetBytes(bytes);
        }

#if NETSTANDARD2_0
        return BitConverter.ToString(bytes).Replace("-", string.Empty).ToLowerInvariant();
#else
        return Convert.ToHexString(bytes).ToLowerInvariant();
#endif
    }

    // ── Per-host observable plumbing ──────────────────────────────────────

    /// <summary>
    /// Applies a subscription event to a host's cached observable state. Returns
    /// true if the event mutated the session-summary cache (so per-host snapshot
    /// / summary listeners should be re-yielded). Mirrors the cache mutations in
    /// Swift's <c>HostRuntime.handleEvent</c> + <c>applyAction</c>.
    /// </summary>
    private static bool ApplyEventToHostState(HostEntry entry, SubscriptionEvent ev)
    {
        switch (ev)
        {
            case SubscriptionEventSessionAdded added:
                entry.PutSessionSummary(added.Params.Summary);
                return true;
            case SubscriptionEventSessionRemoved removed:
                entry.RemoveSessionSummary(removed.Params.Session);
                return true;
            case SubscriptionEventSessionSummaryChanged changed:
                entry.ApplySummaryChange(changed.Params.Session, changed.Params.Changes);
                return true;
            default:
                return false;
        }
    }

    /// <summary>
    /// Fans an event scoped to <paramref name="channel"/> to every per-(host,uri)
    /// listener whose URI matches. Listeners are runtime-owned so they survive
    /// reconnect. Mirrors the per-channel fan-out in Swift's
    /// <c>broadcastSubscriptionEvent</c>.
    /// </summary>
    private void BroadcastPerResourceEvent(HostId hostId, string channel, SubscriptionEvent ev)
    {
        List<PerResourceListener>? listeners;
        lock (_perHostLock)
        {
            if (!_perResourceListeners.TryGetValue(hostId.ToString(), out var bucket)) return;
            listeners = new List<PerResourceListener>(bucket);
        }
        foreach (var l in listeners)
        {
            if (l.Uri == channel) l.Channel.Writer.TryWrite(ev);
        }
    }

    /// <summary>Re-yields a fresh <see cref="HostHandle"/> snapshot to per-host snapshot listeners.</summary>
    private void NotifyPerHostSnapshot(HostEntry entry)
    {
        List<Channel<HostHandle>>? listeners;
        lock (_perHostLock)
        {
            if (!_snapshotListeners.TryGetValue(entry.Id.ToString(), out var bucket) || bucket.Count == 0) return;
            listeners = new List<Channel<HostHandle>>(bucket);
        }
        var snap = entry.Snapshot();
        foreach (var ch in listeners) ch.Writer.TryWrite(snap);
    }

    /// <summary>Re-yields the current sorted summary list to per-host summary listeners.</summary>
    private void NotifyPerHostSummaries(HostEntry entry)
    {
        List<Channel<IReadOnlyList<SessionSummary>>>? listeners;
        lock (_perHostLock)
        {
            if (!_summaryListeners.TryGetValue(entry.Id.ToString(), out var bucket) || bucket.Count == 0) return;
            listeners = new List<Channel<IReadOnlyList<SessionSummary>>>(bucket);
        }
        var summaries = entry.Snapshot().SessionSummaries;
        foreach (var ch in listeners) ch.Writer.TryWrite(summaries);
    }

    /// <summary>
    /// Finishes (completes) every per-host listener stream for <paramref name="hostId"/>
    /// and drops the buckets, so consumers' <c>await foreach</c> loops exit. Called
    /// on host removal and shutdown. Mirrors Swift's <c>finishPerResourceListeners</c>.
    /// </summary>
    private void FinishPerHostListeners(string hostId)
    {
        List<PerResourceListener>? perResource = null;
        List<Channel<HostHandle>>? snapshots = null;
        List<Channel<IReadOnlyList<SessionSummary>>>? summaries = null;
        lock (_perHostLock)
        {
            if (_perResourceListeners.TryGetValue(hostId, out var b1))
            {
                _perResourceListeners.Remove(hostId);
                perResource = b1;
            }
            if (_snapshotListeners.TryGetValue(hostId, out var b2))
            {
                _snapshotListeners.Remove(hostId);
                snapshots = b2;
            }
            if (_summaryListeners.TryGetValue(hostId, out var b3))
            {
                _summaryListeners.Remove(hostId);
                summaries = b3;
            }
        }
        if (perResource is not null) foreach (var l in perResource) l.Channel.Writer.TryComplete();
        if (snapshots is not null) foreach (var ch in snapshots) ch.Writer.TryComplete();
        if (summaries is not null) foreach (var ch in summaries) ch.Writer.TryComplete();
    }

    // ── Per-host streams (Swift-parity public API) ────────────────────────

    /// <summary>
    /// Per-<c>(host, uri)</c> event stream — the reliable channel for
    /// reducer-critical action envelopes. Delivers every event scoped to
    /// <paramref name="uri"/> on <paramref name="host"/>, both live and replayed
    /// across reconnects (the listener is owned by this facade, not by any single
    /// <see cref="AhpClient"/>). The stream finishes when the host is removed or
    /// the client shuts down. Mirrors Swift's <c>events(host:uri:)</c>.
    ///
    /// <para>Throws <see cref="UnknownHostException"/> if no host with
    /// <paramref name="host"/> is registered. (Swift returns nil here; the .NET
    /// surface throws a typed error, per the parity test contract.)</para>
    /// </summary>
    public ChannelReader<SubscriptionEvent> EventsForHost(HostId host, string uri)
    {
        lock (_perHostLock)
        {
            if (!_hosts.ContainsKey(host.ToString())) throw new UnknownHostException(host);
            // Bounded drop-oldest (like the other per-host streams) so a stalled or
            // abandoned reader can't grow the buffer without bound; a slow consumer
            // loses the stalest events rather than leaking memory.
            var ch = Channel.CreateBounded<SubscriptionEvent>(
                new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.DropOldest },
                _ => AhpTelemetry.DroppedEvents.Add(1, DropTagHostResource));
            var listener = new PerResourceListener(uri, ch);
            if (!_perResourceListeners.TryGetValue(host.ToString(), out var bucket))
            {
                bucket = new List<PerResourceListener>();
                _perResourceListeners[host.ToString()] = bucket;
            }
            bucket.Add(listener);
            return ch.Reader;
        }
    }

    /// <summary>
    /// Observable stream of <see cref="HostHandle"/> snapshots for
    /// <paramref name="host"/>. Yields the current snapshot immediately, then a
    /// fresh snapshot whenever the host's observable state changes (connection
    /// state transitions, reconnect completion, session-summary updates). The
    /// stream finishes when the host is removed. Mirrors Swift's
    /// <c>hostSnapshots(host:)</c>.
    ///
    /// <para>Throws <see cref="UnknownHostException"/> if no host with
    /// <paramref name="host"/> is registered.</para>
    /// </summary>
    public ChannelReader<HostHandle> HostSnapshots(HostId host)
    {
        lock (_perHostLock)
        {
            if (!_hosts.TryGetValue(host.ToString(), out var entry)) throw new UnknownHostException(host);
            // bufferingNewest(1)-equivalent: only the latest snapshot matters to
            // a UI consumer, so slow consumers drop intermediate snapshots.
            var ch = Channel.CreateBounded<HostHandle>(
                new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropOldest },
                _ => AhpTelemetry.DroppedEvents.Add(1, DropTagHostSnapshot));
            if (!_snapshotListeners.TryGetValue(host.ToString(), out var bucket))
            {
                bucket = new List<Channel<HostHandle>>();
                _snapshotListeners[host.ToString()] = bucket;
            }
            bucket.Add(ch);
            // Dispatch the initial snapshot as the first stream element.
            ch.Writer.TryWrite(entry.Snapshot());
            return ch.Reader;
        }
    }

    /// <summary>
    /// Observable stream of cached session summaries for <paramref name="host"/>,
    /// sorted by <c>ModifiedAt</c> descending. Yields the current cache
    /// immediately, then a fresh sorted list whenever the cache changes
    /// (<c>listSessions</c> refresh on connect, or session add/remove/summary-change
    /// notifications). The stream finishes when the host is removed. Mirrors
    /// Swift's <c>sessionSummaries(host:)</c>.
    ///
    /// <para>Throws <see cref="UnknownHostException"/> if no host with
    /// <paramref name="host"/> is registered.</para>
    /// </summary>
    public ChannelReader<IReadOnlyList<SessionSummary>> SessionSummariesForHost(HostId host)
    {
        lock (_perHostLock)
        {
            if (!_hosts.TryGetValue(host.ToString(), out var entry)) throw new UnknownHostException(host);
            var ch = Channel.CreateBounded<IReadOnlyList<SessionSummary>>(
                new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropOldest },
                _ => AhpTelemetry.DroppedEvents.Add(1, DropTagHostSummaries));
            if (!_summaryListeners.TryGetValue(host.ToString(), out var bucket))
            {
                bucket = new List<Channel<IReadOnlyList<SessionSummary>>>();
                _summaryListeners[host.ToString()] = bucket;
            }
            bucket.Add(ch);
            ch.Writer.TryWrite(entry.Snapshot().SessionSummaries);
            return ch.Reader;
        }
    }

    // ── Aggregated views (Swift-parity public API) ────────────────────────

    /// <summary>
    /// Aggregated session summaries across every registered host, sorted by
    /// <c>Summary.ModifiedAt</c> descending. Each row carries the originating
    /// host id + label so consumers render a unified inbox without losing host
    /// attribution. Tie-break for equal timestamps: host registration order,
    /// then <c>Summary.Resource</c>. Mirrors Swift's <c>aggregatedSessions()</c>.
    /// </summary>
    public List<HostedSessionSummary> AggregatedSessions()
    {
        // Registration order for the secondary tie-break, captured once.
        var order = new List<HostEntry>(_hosts.Values);
        var orderIndex = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < order.Count; i++) orderIndex[order[i].Id.ToString()] = i;

        var rows = new List<HostedSessionSummary>();
        foreach (var entry in order)
        {
            var snap = entry.Snapshot();
            foreach (var summary in snap.SessionSummaries)
                rows.Add(new HostedSessionSummary(snap.Id, snap.Label, summary));
        }

        rows.Sort((a, b) =>
        {
            if (a.Summary.ModifiedAt != b.Summary.ModifiedAt)
                return string.CompareOrdinal(b.Summary.ModifiedAt, a.Summary.ModifiedAt); // newest first
            var ai = orderIndex.TryGetValue(a.HostId.ToString(), out var x) ? x : int.MaxValue;
            var bi = orderIndex.TryGetValue(b.HostId.ToString(), out var y) ? y : int.MaxValue;
            if (ai != bi) return ai.CompareTo(bi);
            return string.CompareOrdinal(a.Summary.Resource, b.Summary.Resource);
        });
        return rows;
    }

    /// <summary>
    /// Aggregated agents across every registered host, in registration order per
    /// host. Each row carries the originating host id + label. Mirrors Swift's
    /// <c>aggregatedAgents()</c>.
    /// </summary>
    public List<HostedAgent> AggregatedAgents()
    {
        var rows = new List<HostedAgent>();
        foreach (var entry in _hosts.Values)
        {
            var snap = entry.Snapshot();
            foreach (var agent in snap.Agents)
                rows.Add(new HostedAgent(snap.Id, snap.Label, agent));
        }
        return rows;
    }

    // ── Manual reconnect (Swift-parity public API) ────────────────────────

    /// <summary>
    /// Triggers a manual reconnect on <paramref name="id"/>. Cancels any in-flight
    /// backoff sleep (or slow transport factory) and forces a fresh connect
    /// attempt — even when the host is in <c>Failed</c> with an exhausted/disabled
    /// reconnect policy. Mirrors Swift's <c>reconnect(_:)</c>.
    ///
    /// <para>Throws <see cref="UnknownHostException"/> if no host with
    /// <paramref name="id"/> is registered.</para>
    /// </summary>
    public Task ReconnectAsync(HostId id, CancellationToken cancellationToken = default)
    {
        if (!_hosts.TryGetValue(id.ToString(), out var entry))
            throw new UnknownHostException(id);
        entry.SignalManualReconnect();
        return Task.CompletedTask;
    }

    /// <summary>
    /// Triggers a manual reconnect on every registered host that is NOT currently
    /// <c>Connected</c> or <c>Connecting</c> (i.e. <c>Disconnected</c>,
    /// <c>Reconnecting</c>, or <c>Failed</c>). Connected / actively-connecting
    /// hosts are skipped. Returns a map of host id → error for hosts whose
    /// reconnect request could not be dispatched; the call itself does not throw.
    /// Mirrors Swift's <c>reconnectAllUnavailable()</c>.
    /// </summary>
    public Dictionary<HostId, Exception> ReconnectAllUnavailable()
    {
        var errors = new Dictionary<HostId, Exception>();
        foreach (var entry in _hosts.Values)
        {
            var snap = entry.Snapshot();
            switch (snap.State.Kind)
            {
                case HostStateKind.Connected:
                case HostStateKind.Connecting:
                    continue; // skip — already connected or actively connecting
                default:
                    try { entry.SignalManualReconnect(); }
                    catch (Exception ex) { errors[entry.Id] = ex; }
                    break;
            }
        }
        return errors;
    }

    // ── Per-host dispatch / subscribe (typed-error surface) ───────────────

    /// <summary>
    /// Dispatches <paramref name="action"/> on <paramref name="host"/> for
    /// <paramref name="channel"/>. Throws <see cref="UnknownHostException"/> if no
    /// such host is registered, or <see cref="HostNotConnectedException"/> if the
    /// host has no live connection. Mirrors Swift's <c>dispatch(host:…)</c>.
    /// </summary>
    /// <param name="host">Target host.</param>
    /// <param name="action">The action to dispatch.</param>
    /// <param name="channel">Channel URI the action targets.</param>
    /// <param name="clientSeq">
    /// Optional caller-owned sequence number. When supplied, that exact value is
    /// sent on the wire and recorded on the returned handle — for an app-level
    /// outbox that needs stable sequence numbers across reconnect/replay; when
    /// <c>null</c>, the connection's next auto-incrementing sequence is used.
    /// Mirrors Swift's <c>dispatch(host:action:channel:clientSeq:)</c>.
    /// </param>
    /// <param name="cancellationToken">Cancels the send.</param>
    public async Task<DispatchHandle> DispatchAsync(
        HostId host,
        StateAction action,
        string channel,
        long? clientSeq = null,
        CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(host, nameof(host));
        Guard.ThrowIfNull(action, nameof(action));
        Guard.ThrowIfNull(channel, nameof(channel));
        if (!_hosts.TryGetValue(host.ToString(), out var entry))
            throw new UnknownHostException(host);
        var client = entry.CurrentClient;
        if (client is null)
            throw new HostNotConnectedException(host);
        return await client.DispatchAsync(channel, action, clientSeq, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Subscribes to <paramref name="uri"/> on <paramref name="host"/>, tracking
    /// the URI for replay across reconnects. Throws <see cref="UnknownHostException"/>
    /// if no such host is registered, or <see cref="HostNotConnectedException"/> if
    /// the host has no live connection. Mirrors Swift's <c>subscribe(host:uri:)</c>.
    /// </summary>
    public async Task<SubscribeResult> SubscribeAsync(
        HostId host,
        string uri,
        CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(host, nameof(host));
        Guard.ThrowIfNull(uri, nameof(uri));
        if (!_hosts.TryGetValue(host.ToString(), out var entry))
            throw new UnknownHostException(host);

        while (true)
        {
            var client = await entry.WaitForClientAsync(cancellationToken).ConfigureAwait(false);

            // Issue the subscribe RPC; track the URI for replay on success. The
            // protocol mandates a result; a null result is a protocol violation
            // surfaced loudly rather than returned as null.
            var result = await client.RequestAsync<SubscribeParams, SubscribeResult>(
                "subscribe",
                new SubscribeParams { Channel = uri },
                cancellationToken).ConfigureAwait(false)
                ?? throw new AhpRpcException(JsonRpcErrorCodes.InternalError, "ahp: subscribe returned no result");

            await entry.ConnectionGate.WaitAsync(entry.LifetimeCts.Token).ConfigureAwait(false);
            try
            {
                if (ReferenceEquals(client, entry.CurrentClient))
                {
                    entry.AppendSubscription(uri);
                    return result;
                }
            }
            finally
            {
                entry.ConnectionGate.Release();
            }
            // The connection changed after the old host acknowledged. Repeat the
            // RPC on the replacement before reporting success.
        }
    }

    /// <summary>
    /// Unsubscribes from <paramref name="uri"/> on <paramref name="host"/>, sending
    /// the <c>unsubscribe</c> notification and dropping the URI from the replay set
    /// so it is no longer re-subscribed across reconnects. Throws
    /// <see cref="UnknownHostException"/> if no such host is registered, or
    /// <see cref="HostNotConnectedException"/> if the host has no live connection.
    /// Mirrors Swift's <c>unsubscribe(host:uri:)</c>.
    ///
    /// <para><b>Divergence note.</b> Swift's runtime drops the URI from the replay
    /// set even when the host is disconnected (unsubscribe-while-disconnected is a
    /// no-op send that still mutates the replay set). The .NET surface instead
    /// surfaces the no-live-connection case as a typed
    /// <see cref="HostNotConnectedException"/> — symmetric with
    /// <see cref="SubscribeAsync"/>, which makes the same choice. The replay-set
    /// drop therefore happens only on the connected path here. Callers that want to
    /// forget a URI on a disconnected host can remove + re-add the host, or
    /// unsubscribe once it reconnects.</para>
    /// </summary>
    public async Task UnsubscribeAsync(
        HostId host,
        string uri,
        CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(host, nameof(host));
        Guard.ThrowIfNull(uri, nameof(uri));
        if (!_hosts.TryGetValue(host.ToString(), out var entry))
            throw new UnknownHostException(host);

        while (true)
        {
            var client = await entry.WaitForClientAsync(cancellationToken).ConfigureAwait(false);

            // Send the unsubscribe RPC, then forget the URI for replay. Order
            // matches Swift's handleUnsubscribe (RPC first, then removeSubscription).
            await client.UnsubscribeAsync(uri, cancellationToken).ConfigureAwait(false);

            await entry.ConnectionGate.WaitAsync(entry.LifetimeCts.Token).ConfigureAwait(false);
            try
            {
                if (ReferenceEquals(client, entry.CurrentClient))
                {
                    entry.RemoveSubscription(uri);
                    return;
                }
            }
            finally
            {
                entry.ConnectionGate.Release();
            }
            // The connection changed after the old host acknowledged. Repeat the
            // notification on the replacement before reporting success.
        }
    }

    /// <summary>
    /// One per-<c>(host, uri)</c> listener registered via
    /// <see cref="EventsForHost"/>. Held in the facade's
    /// <c>_perResourceListeners</c> registry so it outlives any single
    /// <see cref="AhpClient"/> and survives reconnects. Mirrors Swift's
    /// <c>PerResourceListener</c>.
    /// </summary>
    private sealed class PerResourceListener
    {
        public string Uri { get; }
        public Channel<SubscriptionEvent> Channel { get; }

        public PerResourceListener(string uri, Channel<SubscriptionEvent> channel)
        {
            Uri = uri; Channel = channel;
        }
    }

    internal sealed class OpenHostAttempt
    {
        private const int Active = 0;
        private const int Committing = 1;
        private const int Abandoned = 2;
        private int _state;

        public bool TryAbandon() =>
            Interlocked.CompareExchange(ref _state, Abandoned, Active) == Active;

        public void BeginCommit(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (Interlocked.CompareExchange(ref _state, Committing, Active) != Active)
                throw new OperationCanceledException(cancellationToken);
        }
    }
}
