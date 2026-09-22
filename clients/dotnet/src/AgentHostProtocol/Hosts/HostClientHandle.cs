// Generation-checked handle onto the underlying single-host AhpClient.
#nullable enable

using System.Threading;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol.Hosts;

/// <summary>
/// Generation-checked handle onto the underlying single-host <see cref="AhpClient"/>
/// for a host. Issued by <see cref="MultiHostClient.ClientFor"/>. Operations verify
/// the host is still registered and on the same <c>Generation</c> the handle was
/// minted at; if the host was removed/shut down they throw
/// <see cref="HostShutDownException"/>, and if a reconnect replaced the connection
/// they throw <see cref="HostNotConnectedException"/> (acquire a fresh handle).
/// Port of Swift's <c>HostClientHandle</c> (Swift surfaces the reconnect case as
/// <c>hostReconnected</c>; the .NET typed-error set folds that into "not the
/// connection you held — reacquire").
/// </summary>
public sealed class HostClientHandle
{
    private readonly MultiHostClient _owner;

    /// <summary>The host this handle was issued for.</summary>
    public HostId HostId { get; }

    /// <summary>The generation this handle was minted at.</summary>
    public ulong Generation { get; }

    internal HostClientHandle(MultiHostClient owner, HostId hostId, ulong generation)
    {
        _owner = owner; HostId = hostId; Generation = generation;
    }

    /// <summary>
    /// Validates this handle and returns the underlying live client. Throws
    /// <see cref="HostShutDownException"/> if the host is no longer registered
    /// (removed or the multi-host client shut down), or
    /// <see cref="HostNotConnectedException"/> if the host has reconnected (the
    /// generation moved) or currently has no live connection.
    /// </summary>
    private AhpClient CheckAlive()
    {
        var entry = _owner.TryGetEntry(HostId);
        if (entry is null) throw new HostShutDownException(HostId);
        var snap = entry.Snapshot();
        if (snap.Generation != Generation) throw new HostNotConnectedException(HostId);
        var client = entry.CurrentClient;
        if (client is null) throw new HostNotConnectedException(HostId);
        return client;
    }

    /// <summary>
    /// Throws if this handle is no longer valid (host removed →
    /// <see cref="HostShutDownException"/>; reconnected/disconnected →
    /// <see cref="HostNotConnectedException"/>). Mirrors Swift's <c>checkAlive()</c>.
    /// </summary>
    public void CheckAliveOrThrow() => CheckAlive();

    /// <summary>
    /// Dispatches an action through this connection on <paramref name="channel"/>,
    /// refusing (throwing) if the host was removed or the connection has been
    /// replaced. Mirrors Swift's <c>HostClientHandle.dispatch</c>.
    /// </summary>
    /// <param name="action">The action to dispatch.</param>
    /// <param name="channel">Channel URI the action targets.</param>
    /// <param name="clientSeq">
    /// Optional caller-owned sequence number. When supplied, that exact value is
    /// sent on the wire and recorded on the returned handle; when <c>null</c>, the
    /// connection's next auto-incrementing sequence is used. Mirrors Swift's
    /// <c>HostClientHandle.dispatch(action:channel:clientSeq:)</c>.
    /// </param>
    /// <param name="cancellationToken">Cancels the send.</param>
    public async Task<DispatchHandle> DispatchAsync(
        StateAction action,
        string channel,
        long? clientSeq = null,
        CancellationToken cancellationToken = default)
    {
        var client = CheckAlive();
        return await client.DispatchAsync(channel, action, clientSeq, cancellationToken).ConfigureAwait(false);
    }
}
