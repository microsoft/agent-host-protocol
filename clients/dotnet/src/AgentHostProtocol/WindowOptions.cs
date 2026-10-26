#nullable enable

using System.Threading;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol;

/// <summary>Connection defaults; configuring them does not enable windowing.</summary>
public sealed class WindowingConfig
{
    public long WindowBytes { get; set; } = 262144;
    /// <summary>UTF-16 bytes; null derives a safe limit from the transport.</summary>
    public long? MaximumFrameBytes { get; set; }
    public long MaxBufferedSendBytes { get; set; } = 1048576;
    public IList<IChannelMessageCoalescer> Coalescers { get; } = new List<IChannelMessageCoalescer>();

    internal WindowingConfig Snapshot()
    {
        Validate(WindowBytes, 1, nameof(WindowBytes));
        if (MaximumFrameBytes is { } maximum) Validate(maximum, 1024, nameof(MaximumFrameBytes));
        Validate(MaxBufferedSendBytes, 1, nameof(MaxBufferedSendBytes));
        var copy = new WindowingConfig
        {
            WindowBytes = WindowBytes,
            MaximumFrameBytes = MaximumFrameBytes,
            MaxBufferedSendBytes = MaxBufferedSendBytes,
        };
        foreach (var coalescer in Coalescers)
            copy.Coalescers.Add(coalescer ?? throw new ArgumentException("A coalescer cannot be null."));
        return copy;
    }

    internal static void Validate(long value, long minimum, string name)
    {
        if (value < minimum || value > 9007199254740991)
            throw new ArgumentOutOfRangeException(name);
    }
}

public enum ReceiveMode { Auto, Manual }

/// <summary>Per-subscription opt-in; unspecified limits inherit connection defaults.</summary>
public sealed class WindowOptions
{
    public long? WindowBytes { get; set; }
    public long? MaximumFrameBytes { get; set; }
    public ReceiveMode Receive { get; set; } = ReceiveMode.Auto;
    public bool Coalescing { get; set; } = true;

    internal WindowOptions Snapshot() => new()
    {
        WindowBytes = WindowBytes,
        MaximumFrameBytes = MaximumFrameBytes,
        Receive = Receive,
        Coalescing = Coalescing,
    };
}

/// <summary>Additive client capability; existing IAhpClient implementations need not implement it.</summary>
public interface IWindowedAhpClient : IAhpClient
{
    Task<(SubscribeResult Result, WindowedSubscription Sub)> SubscribeWindowedAsync(
        string uri, WindowOptions? options = null, CancellationToken cancellationToken = default);
    WindowedSubscription? GetWindowedSubscription(string uri);
    Task<ReconnectResult> ResumeAsync(ReconnectParams parameters, CancellationToken cancellationToken = default);
    System.Threading.Channels.ChannelReader<FlowControlEvent> FlowControlEvents();
}

public static class WindowedClientExtensions
{
    private static IWindowedAhpClient Capability(IAhpClient client) => client as IWindowedAhpClient
        ?? throw new NotSupportedException("This client does not implement windowed delivery.");

    public static Task<(SubscribeResult Result, WindowedSubscription Sub)> SubscribeWindowedAsync(
        this IAhpClient client, string uri, WindowOptions? options = null,
        CancellationToken cancellationToken = default) =>
        client is IWindowedAhpClient windowed
            ? windowed.SubscribeWindowedAsync(uri, options, cancellationToken)
            : throw new NotSupportedException("This client does not implement windowed delivery.");

    public static WindowedSubscription? GetWindowedSubscription(this IAhpClient client, string uri) =>
        Capability(client).GetWindowedSubscription(uri);

    public static Task<ReconnectResult> ResumeAsync(this IAhpClient client, ReconnectParams parameters,
        CancellationToken cancellationToken = default) => Capability(client).ResumeAsync(parameters, cancellationToken);

    public static System.Threading.Channels.ChannelReader<FlowControlEvent> FlowControlEvents(this IAhpClient client) =>
        Capability(client).FlowControlEvents();
}

public enum CoalescingDirection { Incoming, Outgoing }

public sealed class CoalescingContext
{
    public string Channel { get; }
    public CoalescingDirection Direction { get; }
    internal CoalescingContext(string channel, CoalescingDirection direction)
    {
        Channel = channel;
        Direction = direction;
    }
}

/// <summary>Combines adjacent queued notifications; null means they cannot be combined.</summary>
public interface IChannelMessageCoalescer
{
    JsonRpcNotification? Coalesce(JsonRpcNotification earlier, JsonRpcNotification later, CoalescingContext context);
}

public sealed class FlowControlStatus
{
    public string Mode { get; internal init; } = "ordinary";
    public string? FallbackReason { get; internal init; }
    public ChannelFlowControl? Limits { get; internal init; }
    public long OutstandingSendBytes { get; internal init; }
    public long BufferedSendBytes { get; internal init; }
    public long BufferedReceiveBytes { get; internal init; }
    public bool Writable { get; internal init; }
}

public sealed class FlowControlEvent
{
    public string Channel { get; }
    public string Kind { get; }
    public long Bytes { get; }
    public FlowControlStatus Status { get; }
    public Hosts.HostId? HostId { get; internal init; }
    internal FlowControlEvent(string channel, string kind, FlowControlStatus status, long bytes = 0)
    {
        Channel = channel;
        Kind = kind;
        Status = status;
        Bytes = bytes;
    }
}
