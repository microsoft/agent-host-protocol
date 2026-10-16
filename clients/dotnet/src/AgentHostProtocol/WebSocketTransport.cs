// WebSocket-backed ITransport implementation.
// Port of clients/go/ahpws/transport.go, adapted to BCL ClientWebSocket.
// No external NuGet dependencies — uses System.Net.WebSockets only.
#nullable enable

using System;
using System.Buffers;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
namespace Microsoft.AgentHostProtocol;

/// <summary>
/// Options for <see cref="WebSocketTransport.ConnectAsync"/> and
/// <see cref="WebSocketTransport.FromClientWebSocket"/>.
/// </summary>
public sealed class WebSocketTransportOptions
{
    /// <summary>
    /// Optional callback invoked on the new <see cref="ClientWebSocket"/> before
    /// it connects. Use it to set request headers, sub-protocols, keep-alive,
    /// proxy settings, etc.
    /// </summary>
    public Action<ClientWebSocket>? ConfigureSocket { get; set; }

    /// <summary>
    /// Maximum number of bytes allowed in a single inbound message.
    /// A value ≤ 0 means unlimited. Defaults to 32 MiB.
    /// </summary>
    public long MaxMessageBytes { get; set; } = 32L * 1024 * 1024;
}

/// <summary>
/// A <see cref="ITransport"/> implementation backed by <see cref="ClientWebSocket"/>.
/// Use <see cref="ConnectAsync(Uri, WebSocketTransportOptions?, CancellationToken)"/> to dial,
/// or <see cref="FromClientWebSocket(ClientWebSocket, WebSocketTransportOptions?)"/> to wrap
/// an existing connection.
/// </summary>
public sealed class WebSocketTransport : ITransport, ITransportMessageLimits
{
    private readonly WebSocket _ws;
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly long _maxMessageBytes;
    private int _disposed;

    internal long MaxMessageBytes => _maxMessageBytes;
    /// <summary>Complete inbound WebSocket message cap, not the receive-buffer size.</summary>
    public long? MaximumInboundMessageBytes => _maxMessageBytes > 0 ? _maxMessageBytes : null;

    // Receive buffer: 64 KiB initial, grows as needed.
    private byte[] _receiveBuffer = new byte[64 * 1024];

    internal WebSocketTransport(WebSocket ws, long maxMessageBytes)
    {
        _ws = ws;
        _maxMessageBytes = maxMessageBytes;
    }

    // ── Factory methods ───────────────────────────────────────────────────

    /// <summary>
    /// Dials <paramref name="uri"/> (must use <c>ws://</c> or <c>wss://</c>) and
    /// returns a ready-to-use <see cref="WebSocketTransport"/>.
    /// </summary>
    /// <param name="uri">The WebSocket server URI.</param>
    /// <param name="options">Optional configuration; see <see cref="WebSocketTransportOptions"/>.</param>
    /// <param name="cancellationToken">Cancellation token for the connect operation.</param>
    public static async Task<WebSocketTransport> ConnectAsync(
        Uri uri,
        WebSocketTransportOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        return await ConnectCoreAsync(
            uri,
            options,
            static (ws, target, ct) => ws.ConnectAsync(target, ct),
            cancellationToken).ConfigureAwait(false);
    }

    internal static async Task<WebSocketTransport> ConnectCoreAsync(
        Uri uri,
        WebSocketTransportOptions? options,
        Func<ClientWebSocket, Uri, CancellationToken, Task> connectAsync,
        CancellationToken cancellationToken)
    {
        var configureSocket = options?.ConfigureSocket;
        var maxBytes = options?.MaxMessageBytes ?? (32L * 1024 * 1024);
        var ws = new ClientWebSocket();
        try
        {
            configureSocket?.Invoke(ws);
            await connectAsync(ws, uri, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            ws.Dispose();
            throw;
        }
        return new WebSocketTransport(ws, maxBytes);
    }

    /// <summary>
    /// Wraps an already-connected <see cref="ClientWebSocket"/> in a
    /// <see cref="WebSocketTransport"/>.
    /// The transport takes ownership of <paramref name="ws"/> and disposes it on
    /// <see cref="DisposeAsync"/>.
    /// </summary>
    /// <param name="ws">A connected <see cref="ClientWebSocket"/>.</param>
    /// <param name="options">Optional configuration; see <see cref="WebSocketTransportOptions"/>.</param>
    public static WebSocketTransport FromClientWebSocket(ClientWebSocket ws, WebSocketTransportOptions? options = null)
    {
        Guard.ThrowIfNull(ws, nameof(ws));
        var maxBytes = options?.MaxMessageBytes ?? (32L * 1024 * 1024);
        return new WebSocketTransport(ws, maxBytes);
    }

    // ── ITransport ────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default)
    {
        Guard.ThrowIfNull(message, nameof(message));
        Guard.ThrowIfDisposed(Volatile.Read(ref _disposed) == 1, this);
        await _sendLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (message.Frame == TransportFrame.Text)
            {
                // Encode into a pooled buffer rather than allocating a fresh
                // byte[] per send — SendAsync is the per-message hot path.
                var text = message.Text ?? "";
                var rented = ArrayPool<byte>.Shared.Rent(Encoding.UTF8.GetMaxByteCount(text.Length));
                try
                {
                    int written = Encoding.UTF8.GetBytes(
                        text,
                        0,
                        text.Length,
                        rented,
                        0);
                    await _ws.SendAsync(
                        new ArraySegment<byte>(rented, 0, written),
                        WebSocketMessageType.Text,
                        endOfMessage: true,
                        cancellationToken)
                        .ConfigureAwait(false);
                }
                finally
                {
                    ArrayPool<byte>.Shared.Return(rented);
                }
            }
            else
            {
                byte[] bytes = message.Binary.ToArray();
                await _ws.SendAsync(
                    new ArraySegment<byte>(bytes),
                    WebSocketMessageType.Binary,
                    endOfMessage: true,
                    cancellationToken)
                    .ConfigureAwait(false);
            }
        }
        finally
        {
            _sendLock.Release();
        }
    }

    /// <inheritdoc />
    public async ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default)
    {
        // Read the first frame. The overwhelmingly common case is a complete
        // message in one frame (EndOfMessage on the first receive); that path
        // decodes straight from the receive buffer with no MemoryStream and no
        // second copy. Only genuinely fragmented messages fall through to the
        // accumulating path below.
        var result = await ReceiveFrameAsync(cancellationToken).ConfigureAwait(false);
        await ThrowIfCloseAsync(result).ConfigureAwait(false);
        EnforceSizeCap(accumulated: 0, result.Count);

        if (result.EndOfMessage)
        {
            // Decode in a non-async helper: a Span<byte> (ref struct) cannot live
            // across the async method body under C# 12.
            return DecodeSingleFrame(result.Count, result.MessageType);
        }

        // Fragmented: assemble the remaining frames into a MemoryStream. Note the
        // order — copy the just-received bytes out of the buffer FIRST, then grow
        // the buffer for the NEXT receive. (The pre-refactor code grew the buffer
        // before copying, which discarded the frame it had just read; that path
        // only triggered on a fragmented message whose first frame exactly filled
        // the 64 KiB buffer, so it went unnoticed.)
        var builder = new MemoryStream();
        WebSocketMessageType msgType = result.MessageType;
        builder.Write(_receiveBuffer, 0, result.Count);
        GrowReceiveBufferIfFull(result);

        while (true)
        {
            result = await ReceiveFrameAsync(cancellationToken).ConfigureAwait(false);
            await ThrowIfCloseAsync(result).ConfigureAwait(false);
            EnforceSizeCap(builder.Length, result.Count);

            builder.Write(_receiveBuffer, 0, result.Count);
            msgType = result.MessageType;

            if (result.EndOfMessage)
                break;
            GrowReceiveBufferIfFull(result);
        }

        var bytes = builder.ToArray();
        return msgType == WebSocketMessageType.Binary
            ? TransportMessage.FromBinary(bytes)
            : TransportMessage.FromText(Encoding.UTF8.GetString(bytes));
    }

    // Decodes a complete single-frame message straight from the receive buffer —
    // no MemoryStream. Kept non-async so the Span<byte> ref struct never crosses
    // an await (a C# 13 feature this project does not target).
    private TransportMessage DecodeSingleFrame(int count, WebSocketMessageType messageType)
    {
        ReadOnlySpan<byte> span = _receiveBuffer.AsSpan(0, count);
        return messageType == WebSocketMessageType.Binary
            ? TransportMessage.FromBinary(span.ToArray())
            : TransportMessage.FromText(Encoding.UTF8.GetString(_receiveBuffer, 0, count));
    }

    // Doubles the receive buffer when the last frame filled it, so the next
    // ReceiveAsync has more room. Call AFTER copying the frame's bytes out.
    private void GrowReceiveBufferIfFull(WebSocketReceiveResult result)
    {
        if (result.Count == _receiveBuffer.Length)
            _receiveBuffer = new byte[_receiveBuffer.Length * 2];
    }

    private async ValueTask<WebSocketReceiveResult> ReceiveFrameAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await _ws.ReceiveAsync(new ArraySegment<byte>(_receiveBuffer), cancellationToken)
                .ConfigureAwait(false);
        }
        catch (WebSocketException ex)
        {
            // An abnormal drop (no close handshake) is a transport I/O fault, NOT a
            // clean close — deliberately not TransportClosedException so the AhpClient
            // reader loop's generic catch wraps it in the typed AhpTransportException
            // ("io", ...) it surfaces on AhpClient.Error. The richer AhpTransportException
            // lives in the client assembly (Microsoft.AgentHostProtocol), which this
            // transport package does not (and should not) depend on, so the
            // directly-thrown type is IOException (a precise BCL fault type, no longer
            // the reserved base Exception) carrying the WebSocketException as its cause.
            throw new IOException($"ahp: websocket closed: {ex.Message}", ex);
        }
        // OperationCanceledException propagates as-is.
    }

    private async ValueTask ThrowIfCloseAsync(WebSocketReceiveResult result)
    {
        if (result.MessageType != WebSocketMessageType.Close)
            return;

        // Perform the closing handshake (best effort), then surface a clean close.
        try
        {
            await _ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None)
                .ConfigureAwait(false);
        }
        catch { /* best effort */ }
        throw new TransportClosedException();
    }

    private void EnforceSizeCap(long accumulated, int incoming)
    {
        if (_maxMessageBytes > 0 && (accumulated + incoming) > _maxMessageBytes)
            throw new TransportClosedException($"inbound message exceeds {_maxMessageBytes} bytes");
    }

    /// <inheritdoc />
    public async ValueTask CloseAsync(CancellationToken cancellationToken = default)
    {
        if (_ws.State == WebSocketState.Open
            || _ws.State == WebSocketState.CloseReceived
            || _ws.State == WebSocketState.CloseSent)
        {
            try
            {
                await _ws.CloseAsync(
                    WebSocketCloseStatus.NormalClosure,
                    "",
                    cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (WebSocketException) { /* best effort — state race */ }
            catch (InvalidOperationException) { /* best effort — state race */ }
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (Interlocked.CompareExchange(ref _disposed, 1, 0) != 0)
            return;
        await CloseAsync(CancellationToken.None).ConfigureAwait(false);
        _ws.Dispose();
        _sendLock.Dispose();
    }
}
