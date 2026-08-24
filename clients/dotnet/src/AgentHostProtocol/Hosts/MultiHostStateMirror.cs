// Thread-safe (hostId, URI) → state-snapshot mirror.
// Port of multi_host_state_mirror.go.
#nullable enable

using System.Collections.Concurrent;

namespace Microsoft.AgentHostProtocol.Hosts;

/// <summary>
/// Thread-safe map of (hostId, URI) → state snapshot. Port of
/// <c>multi_host_state_mirror.go</c>. Writes snapshots in; reads them back;
/// drops them when the host or resource disappears.
/// </summary>
public sealed class MultiHostStateMirror
{
    // Independent per-key snapshots: ConcurrentDictionary gives lock-free
    // reads and fine-grained writes, which is exactly this access pattern.
    // The per-resource maps key by HostedResourceKey (host + URI value type) so a
    // host id and a URI compose into one collision-free key with value equality —
    // no ad-hoc tuple delimiter to confuse with reserved URI characters.
    private readonly ConcurrentDictionary<string, RootState> _roots = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<HostedResourceKey, SessionState> _sessions = new();
    private readonly ConcurrentDictionary<HostedResourceKey, ChatState> _chats = new();
    private readonly ConcurrentDictionary<HostedResourceKey, TerminalState> _terminals = new();
    private readonly ConcurrentDictionary<HostedResourceKey, ChangesetState> _changesets = new();
    private readonly ConcurrentDictionary<string, TunnelsState> _tunnelCatalogs = new(StringComparer.Ordinal);

    /// <summary>Stores <paramref name="root"/> for <paramref name="hostId"/>.</summary>
    public void PutRoot(string hostId, RootState root)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(root, nameof(root));
        _roots[hostId] = root;
    }

    /// <summary>Returns the root snapshot for <paramref name="hostId"/>, or (default, false) if absent.</summary>
    public (RootState? Value, bool Found) Root(string hostId) =>
        _roots.TryGetValue(hostId, out var v) ? (v, true) : (default, false);

    /// <summary>Stores a session snapshot under (hostId, uri).</summary>
    public void PutSession(string hostId, string uri, SessionState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _sessions[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the session snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (SessionState? Value, bool Found) Session(string hostId, string uri) =>
        _sessions.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Stores a chat snapshot under (hostId, uri).</summary>
    public void PutChat(string hostId, string uri, ChatState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _chats[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the chat snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (ChatState? Value, bool Found) Chat(string hostId, string uri) =>
        _chats.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Stores a terminal snapshot under (hostId, uri).</summary>
    public void PutTerminal(string hostId, string uri, TerminalState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _terminals[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the terminal snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (TerminalState? Value, bool Found) Terminal(string hostId, string uri) =>
        _terminals.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Stores a changeset snapshot under (hostId, uri).</summary>
    public void PutChangeset(string hostId, string uri, ChangesetState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _changesets[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the changeset snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (ChangesetState? Value, bool Found) Changeset(string hostId, string uri) =>
        _changesets.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Stores a tunnels-channel snapshot for <paramref name="hostId"/>.</summary>
    public void PutTunnelCatalog(string hostId, TunnelsState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(state, nameof(state));
        _tunnelCatalogs[hostId] = state;
    }

    /// <summary>Returns the tunnels state for <paramref name="hostId"/>, or (default, false) if absent.</summary>
    public (TunnelsState? Value, bool Found) TunnelCatalog(string hostId) =>
        _tunnelCatalogs.TryGetValue(hostId, out var v) ? (v, true) : (default, false);

    /// <summary>Removes every snapshot belonging to <paramref name="hostId"/>.</summary>
    public void DropHost(string hostId)
    {
        _roots.TryRemove(hostId, out _);
        _tunnelCatalogs.TryRemove(hostId, out _);
        foreach (var k in _sessions.Keys) if (k.HostId.ToString() == hostId) _sessions.TryRemove(k, out _);
        foreach (var k in _chats.Keys) if (k.HostId.ToString() == hostId) _chats.TryRemove(k, out _);
        foreach (var k in _terminals.Keys) if (k.HostId.ToString() == hostId) _terminals.TryRemove(k, out _);
        foreach (var k in _changesets.Keys) if (k.HostId.ToString() == hostId) _changesets.TryRemove(k, out _);
    }

    /// <summary>Removes the snapshot at (hostId, uri) across every resource kind.</summary>
    public void DropResource(string hostId, string uri)
    {
        var key = new HostedResourceKey(hostId, uri);
        if (uri == "ahp-tunnels://") _tunnelCatalogs.TryRemove(hostId, out _);
        _sessions.TryRemove(key, out _);
        _chats.TryRemove(key, out _);
        _terminals.TryRemove(key, out _);
        _changesets.TryRemove(key, out _);
    }
}
