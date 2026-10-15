#nullable enable

using System.Threading;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol.Hosts;

public interface IMultiHostWindowedClient : IMultiHostClient
{
    Task<(SubscribeResult Result, WindowedSubscription Sub)> SubscribeWindowedAsync(
        HostId host, string uri, WindowOptions? options = null, CancellationToken cancellationToken = default);
    WindowedSubscription? GetWindowedSubscription(HostId host, string uri);
    System.Threading.Channels.ChannelReader<FlowControlEvent> FlowControlEvents();
}

public static class MultiHostWindowedExtensions
{
    public static Task<(SubscribeResult Result, WindowedSubscription Sub)> SubscribeWindowedAsync(
        this IMultiHostClient client, HostId host, string uri, WindowOptions? options = null,
        CancellationToken cancellationToken = default) =>
        client is IMultiHostWindowedClient windowed
            ? windowed.SubscribeWindowedAsync(host, uri, options, cancellationToken)
            : throw new NotSupportedException("This runtime does not implement windowed delivery.");
}
