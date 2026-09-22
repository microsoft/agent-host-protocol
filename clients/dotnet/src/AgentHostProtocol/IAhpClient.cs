// The public protocol surface of AhpClient, extracted so consumers can depend on
// an interface — mock it in tests, substitute it behind their own abstractions —
// rather than the concrete sealed client.
#nullable enable

using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Threading;
using System.Threading.Tasks;

namespace Microsoft.AgentHostProtocol;

/// <summary>
/// The Agent Host Protocol client surface. Implemented by <see cref="AhpClient"/>;
/// a live <see cref="ITransport"/> is required, so construction stays a factory
/// (<see cref="AhpClient.Connect"/>), not a
/// parameterless DI singleton. Depend on this interface to keep call sites
/// mockable and substitutable.
/// </summary>
public interface IAhpClient : IAsyncDisposable
{
    /// <summary>The current connection state, readable synchronously.</summary>
    ConnectionState ConnectionState { get; }

    /// <summary>Completes once the client begins teardown (via shutdown or a transport failure).</summary>
    Task Completion { get; }

    /// <summary>The error that caused teardown, or <see langword="null"/> after a clean shutdown.</summary>
    [SuppressMessage("Naming", "CA1716:Identifiers should not match keywords",
        Justification = "Error matches the established AhpClient.Error public property; renaming would diverge the interface from its implementation.")]
    Exception? Error { get; }

    /// <summary>Gracefully tears down the client. Safe to call multiple times.</summary>
    Task ShutdownAsync(CancellationToken cancellationToken = default);

    /// <summary>Registers a handler for server-initiated JSON-RPC requests (replaces any prior handler).</summary>
    void SetServerRequestHandler(ServerRequestHandler? handler);

    /// <summary>Returns a fresh multicast stream of future connection-state transitions.</summary>
    StateChangeStream CreateStateChangeStream();

    /// <summary>Returns a fresh top-level event stream over every inbound event.</summary>
    EventStream CreateEventStream();

    /// <summary>Issues a JSON-RPC request and awaits the typed result.</summary>
    Task<TResult?> RequestAsync<TParams, TResult>(string method, TParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Sends a JSON-RPC notification (fire-and-forget).</summary>
    Task NotifyAsync<TParams>(string method, TParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Issues the <c>initialize</c> handshake.</summary>
    Task<InitializeResult> InitializeAsync(
        string clientId,
        IReadOnlyList<string>? protocolVersions = null,
        IReadOnlyList<string>? initialSubscriptions = null,
        CancellationToken cancellationToken = default);

    /// <summary>Re-establishes a dropped connection via the <c>reconnect</c> flow.</summary>
    Task<ReconnectResult> ReconnectAsync(
        string clientId,
        long lastSeenServerSeq,
        IReadOnlyList<string>? subscriptions = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends a protocol-level <c>ping</c> and completes when the server responds.
    /// Verifies the connection is alive and keeps idle-timeout intermediaries from
    /// closing it. Distinct from transport-level keep-alive frames.
    /// </summary>
    Task PingAsync(CancellationToken cancellationToken = default);

    /// <summary>Sends a <c>subscribe</c> request and returns the snapshot plus a per-URI handle.</summary>
    Task<(SubscribeResult Result, Subscription Sub)> SubscribeAsync(string uri, SubscriptionDeliveryOptions? delivery = null, CancellationToken cancellationToken = default);

    /// <summary>Returns a local subscription for <paramref name="uri"/> without sending a request.</summary>
    Subscription AttachSubscription(string uri);

    /// <summary>Sends an <c>unsubscribe</c> notification and drops local subscriptions for <paramref name="uri"/>.</summary>
    Task UnsubscribeAsync(string uri, CancellationToken cancellationToken = default);

    /// <summary>Fires a write-ahead <c>dispatchAction</c> notification.</summary>
    Task<DispatchHandle> DispatchAsync(
        string channel,
        StateAction action,
        long? clientSeq = null,
        CancellationToken cancellationToken = default);

    /// <summary>Installs typed per-method handlers for inbound server-initiated <c>resource*</c> requests.</summary>
    void SetResourceRequestHandlers(ResourceRequestHandlers? handlers);

    /// <summary>Reads the content of a resource by URI (<c>resourceRead</c>).</summary>
    Task<ResourceReadResult> ResourceReadAsync(ResourceReadParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Writes content to a file on the receiver's filesystem (<c>resourceWrite</c>).</summary>
    Task<ResourceWriteResult> ResourceWriteAsync(ResourceWriteParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Lists directory entries at a file URI (<c>resourceList</c>).</summary>
    Task<ResourceListResult> ResourceListAsync(ResourceListParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Copies a resource from one URI to another (<c>resourceCopy</c>).</summary>
    Task<ResourceCopyResult> ResourceCopyAsync(ResourceCopyParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Deletes a resource at a URI (<c>resourceDelete</c>).</summary>
    Task<ResourceDeleteResult> ResourceDeleteAsync(ResourceDeleteParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Moves (renames) a resource from one URI to another (<c>resourceMove</c>).</summary>
    Task<ResourceMoveResult> ResourceMoveAsync(ResourceMoveParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Resolves a resource — <c>stat</c> + <c>realpath</c> (<c>resourceResolve</c>).</summary>
    Task<ResourceResolveResult> ResourceResolveAsync(ResourceResolveParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Creates a directory with <c>mkdir -p</c> semantics (<c>resourceMkdir</c>).</summary>
    Task<ResourceMkdirResult> ResourceMkdirAsync(ResourceMkdirParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Requests permission to access a resource (<c>resourceRequest</c>).</summary>
    Task<ResourceRequestResult> ResourceRequestAsync(ResourceRequestParams parameters, CancellationToken cancellationToken = default);

    /// <summary>Creates a resource watcher (<c>createResourceWatch</c>) and returns its watch-channel URI.</summary>
    Task<CreateResourceWatchResult> CreateResourceWatchAsync(CreateResourceWatchParams parameters, CancellationToken cancellationToken = default);
}
