#nullable enable

using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol.Hosts;

public sealed partial class MultiHostClient
{
    private readonly object _flowGate = new();
    private readonly List<Channel<FlowControlEvent>> _flowReaders = new();

    public ChannelReader<FlowControlEvent> FlowControlEvents()
    {
        var channel = Channel.CreateBounded<FlowControlEvent>(
            new BoundedChannelOptions(256) { FullMode = BoundedChannelFullMode.DropOldest });
        lock (_flowGate) _flowReaders.Add(channel);
        return channel.Reader;
    }

    private void BroadcastFlowEvent(FlowControlEvent value)
    {
        lock (_flowGate)
            foreach (var reader in _flowReaders) reader.Writer.TryWrite(value);
    }

    private void FinishFlowEvents()
    {
        lock (_flowGate)
            foreach (var reader in _flowReaders) reader.Writer.TryComplete();
    }

    public WindowedSubscription? GetWindowedSubscription(HostId host, string uri)
    {
        if (!_hosts.TryGetValue(host.ToString(), out var entry)) throw new UnknownHostException(host);
        return entry.WindowOwners.TryGetValue(uri, out var owner) ? owner : null;
    }

    public async Task<(SubscribeResult Result, WindowedSubscription Sub)> SubscribeWindowedAsync(
        HostId host, string uri, WindowOptions? options = null, CancellationToken cancellationToken = default)
    {
        if (!_hosts.TryGetValue(host.ToString(), out var entry)) throw new UnknownHostException(host);
        while (true)
        {
            var client = await entry.WaitForClientAsync(cancellationToken).ConfigureAwait(false);
            var result = await client.SubscribeWindowedAsync(uri, options, cancellationToken).ConfigureAwait(false);
            await entry.ConnectionGate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                if (entry.LifetimeCts.IsCancellationRequested)
                {
                    result.Sub.End(new HostShutDownException(host), true);
                    throw new HostShutDownException(host);
                }
                if (ReferenceEquals(client, entry.CurrentClient))
                {
                    lock (result.Sub.Gate)
                        if (!result.Sub.Closed)
                        {
                            result.Sub.OnClosed = entry.ForgetWindowOwner;
                            entry.RegisterWindowOwner(result.Sub);
                        }
                    return result;
                }
            }
            finally { entry.ConnectionGate.Release(); }
        }
    }

    private void ApplyManagedWindowEvent(HostEntry entry, WindowedSubscription owner,
        JsonRpcNotification notification, SubscriptionEvent value)
    {
        var summaryTouched = ApplyEventToHostState(entry, value);
        var rootTouched = value is SubscriptionEventAction rootAction
            && owner.Uri == ProtocolVersion.RootResourceUri && entry.ApplyRootAction(rootAction.Envelope.Action);
        if (value is SubscriptionEventAction action) entry.AdvanceServerSeq(action.Envelope.ServerSeq);
        if (value is SubscriptionEventSnapshot snapshot)
        {
            entry.AdvanceServerSeq(snapshot.Snapshot.FromSeq);
            if (owner.Uri == ProtocolVersion.RootResourceUri && snapshot.Snapshot.State.Root is { } root)
            {
                entry.ApplyWindowRoot(root);
                rootTouched = true;
            }
        }
        var ev = new HostSubscriptionEvent(entry.Id, owner.Uri, value);
        List<Channel<HostSubscriptionEvent>> readers;
        lock (_subsLock) readers = new List<Channel<HostSubscriptionEvent>>(_subChannels);
        foreach (var reader in readers) reader.Writer.TryWrite(ev);
        BroadcastPerResourceEvent(entry.Id, owner.Uri, value);
        if (summaryTouched || rootTouched) NotifyPerHostSnapshot(entry);
        if (summaryTouched) NotifyPerHostSummaries(entry);
    }

    private static void DropWindowOwners(HostEntry entry)
    {
        foreach (var pair in entry.WindowOwners) pair.Value.End(new HostShutDownException(entry.Id));
        entry.WindowOwners.Clear();
    }
}
