// An in-memory ITransport pair for the windowing examples.
//
// Every message is a text frame built with TransportMessage.FromText, so the
// client sees the exact JSON text the host wrote and can charge each windowed
// message its UTF-16 size. Closing either half closes both.
#nullable enable

using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;

namespace WindowingExamples;

internal sealed class InMemoryTransport : ITransport
{
    private readonly Channel<TransportMessage> _inbox;
    private readonly Channel<TransportMessage> _outbox;

    private InMemoryTransport(Channel<TransportMessage> inbox, Channel<TransportMessage> outbox)
    {
        _inbox = inbox;
        _outbox = outbox;
    }

    /// <summary>Creates a linked pair: what one half sends, the other half receives.</summary>
    public static (InMemoryTransport Client, InMemoryTransport Host) CreatePair()
    {
        var toHost = Channel.CreateUnbounded<TransportMessage>(new UnboundedChannelOptions { SingleReader = true });
        var toClient = Channel.CreateUnbounded<TransportMessage>(new UnboundedChannelOptions { SingleReader = true });
        return (new InMemoryTransport(toClient, toHost), new InMemoryTransport(toHost, toClient));
    }

    public ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _outbox.Writer.TryWrite(message)
            ? default
            : throw new AhpTransportException("closed");
    }

    public async ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            return await _inbox.Reader.ReadAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (ChannelClosedException error)
        {
            throw new AhpTransportException("closed", inner: error);
        }
    }

    public ValueTask CloseAsync(CancellationToken cancellationToken = default)
    {
        _outbox.Writer.TryComplete();
        _inbox.Writer.TryComplete();
        return default;
    }

    public ValueTask DisposeAsync() => CloseAsync();
}
