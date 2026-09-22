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
    private readonly ConcurrentDictionary<HostId, RootState> _roots = new();
    private readonly ConcurrentDictionary<HostedResourceKey, SessionState> _sessions = new();
    private readonly ConcurrentDictionary<HostedResourceKey, ChatState> _chats = new();
    private readonly ConcurrentDictionary<HostedResourceKey, TerminalState> _terminals = new();
    private readonly ConcurrentDictionary<HostedResourceKey, ChangesetState> _changesets = new();

    /// <summary>Stores <paramref name="root"/> for <paramref name="hostId"/>.</summary>
    public void PutRoot(HostId hostId, RootState root)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(root, nameof(root));
        _roots[hostId] = root;
    }

    /// <summary>Returns the root snapshot for <paramref name="hostId"/>, or (default, false) if absent.</summary>
    public (RootState? Value, bool Found) Root(HostId hostId) =>
        _roots.TryGetValue(hostId, out var v) ? (v, true) : (default, false);

    /// <summary>Stores a session snapshot under (hostId, uri).</summary>
    public void PutSession(HostId hostId, string uri, SessionState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _sessions[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the session snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (SessionState? Value, bool Found) Session(HostId hostId, string uri) =>
        _sessions.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Stores a chat snapshot under (hostId, uri).</summary>
    public void PutChat(HostId hostId, string uri, ChatState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _chats[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the chat snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (ChatState? Value, bool Found) Chat(HostId hostId, string uri) =>
        _chats.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Stores a terminal snapshot under (hostId, uri).</summary>
    public void PutTerminal(HostId hostId, string uri, TerminalState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _terminals[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the terminal snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (TerminalState? Value, bool Found) Terminal(HostId hostId, string uri) =>
        _terminals.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Stores a changeset snapshot under (hostId, uri).</summary>
    public void PutChangeset(HostId hostId, string uri, ChangesetState state)
    {
        Guard.ThrowIfNull(hostId, nameof(hostId));
        Guard.ThrowIfNull(uri, nameof(uri));
        Guard.ThrowIfNull(state, nameof(state));
        _changesets[new HostedResourceKey(hostId, uri)] = state;
    }

    /// <summary>Returns the changeset snapshot at (hostId, uri), or (default, false) if absent.</summary>
    public (ChangesetState? Value, bool Found) Changeset(HostId hostId, string uri) =>
        _changesets.TryGetValue(new HostedResourceKey(hostId, uri), out var v) ? (v, true) : (default, false);

    /// <summary>Removes every snapshot belonging to <paramref name="hostId"/>.</summary>
    public void DropHost(HostId hostId)
    {
        _roots.TryRemove(hostId, out _);
        foreach (var k in _sessions.Keys) if (k.HostId.Equals(hostId)) _sessions.TryRemove(k, out _);
        foreach (var k in _chats.Keys) if (k.HostId.Equals(hostId)) _chats.TryRemove(k, out _);
        foreach (var k in _terminals.Keys) if (k.HostId.Equals(hostId)) _terminals.TryRemove(k, out _);
        foreach (var k in _changesets.Keys) if (k.HostId.Equals(hostId)) _changesets.TryRemove(k, out _);
    }

    /// <summary>Removes the snapshot at (hostId, uri) across every resource kind.</summary>
    public void DropResource(HostId hostId, string uri)
    {
        var key = new HostedResourceKey(hostId, uri);
        _sessions.TryRemove(key, out _);
        _chats.TryRemove(key, out _);
        _terminals.TryRemove(key, out _);
        _changesets.TryRemove(key, out _);
    }
}
