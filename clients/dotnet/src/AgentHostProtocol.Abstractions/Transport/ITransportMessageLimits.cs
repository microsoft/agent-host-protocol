#nullable enable

namespace Microsoft.AgentHostProtocol;

/// <summary>Optional transport capability describing its complete inbound wire-message limit.</summary>
public interface ITransportMessageLimits
{
    /// <summary>Maximum wire bytes per message, or null when unknown or unlimited.</summary>
    long? MaximumInboundMessageBytes { get; }
}
