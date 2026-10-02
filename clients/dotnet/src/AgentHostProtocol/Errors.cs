// Client error hierarchy — port of the Go client's error.go.
// Mirrors: ahp/error.go (TransportError, RPCError, UnknownSubscriptionError,
//          ErrClosed, ErrShutdown, ErrSequenceGap).
#nullable enable

using System;
using System.Text.Json;

namespace Microsoft.AgentHostProtocol;

/// <summary>
/// Base exception for all Agent Host Protocol client errors.
/// </summary>
public abstract class AhpException : Exception
{
    /// <inheritdoc />
    protected AhpException(string message) : base(message) { }

    /// <inheritdoc />
    protected AhpException(string message, Exception? inner) : base(message, inner) { }
}

/// <summary>A strict event receiver overflowed and permanently terminated.</summary>
public sealed class SubscriptionLagException : AhpException
{
    /// <summary>The receiver's maximum buffered event count.</summary>
    public int Capacity { get; }

    /// <summary>Creates a terminal receiver-lag exception.</summary>
    public SubscriptionLagException(int capacity)
        : base($"ahp: event receiver exceeded its capacity of {capacity}; the receiver is permanently terminated")
    {
        Capacity = capacity;
    }
}

/// <summary>
/// Thrown by <see cref="ITransport"/> implementations when the underlying
/// connection experiences a transport-level fault.
/// </summary>
public sealed class AhpTransportException : AhpException
{
    /// <summary>
    /// Classifies the failure. Mirrors the Go <c>TransportError.Kind</c> field, whose
    /// vocabulary is <c>"closed"</c>, <c>"io"</c>, and <c>"protocol"</c>.
    /// Malformed frames are skipped and counted by the
    /// <c>ahp.client.frames.malformed</c> metric, while handshake violations such
    /// as selecting an unoffered protocol version raise <c>"protocol"</c>.
    /// </summary>
    public string Kind { get; }

    /// <summary>Creates a transport exception.</summary>
    public AhpTransportException(string kind, string? message = null, Exception? inner = null)
        : base(message ?? $"ahp: transport {kind}", inner)
    {
        Kind = kind;
    }
}

/// <summary>
/// Thrown when a JSON-RPC request completes with an error response from the server.
/// </summary>
public sealed class AhpRpcException : AhpException
{
    /// <summary>The JSON-RPC error code.</summary>
    public int Code { get; }

    /// <summary>The JSON-RPC error data, if present.</summary>
    public JsonElement? ErrorData { get; }

    /// <summary>Creates an RPC exception from the server error response.</summary>
    public AhpRpcException(int code, string message, JsonElement? data = null)
        : base($"ahp: rpc error {code}: {message}")
    {
        Code = code;
        ErrorData = data;
    }
}

/// <summary>
/// Thrown by <see cref="AhpClient"/> methods when the client (or its
/// background driver) has been shut down.
/// </summary>
public sealed class AhpClientClosedException : AhpException
{
    /// <summary>Creates a client-closed exception.</summary>
    public AhpClientClosedException(string? message = null)
        : base(message ?? "ahp: client shut down") { }
}
