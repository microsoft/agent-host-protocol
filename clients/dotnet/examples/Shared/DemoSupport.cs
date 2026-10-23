// Helpers shared by the windowing examples.
#nullable enable

using System.Collections.Generic;
using System.Runtime.CompilerServices;
using System.Text.Encodings.Web;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;

namespace WindowingExamples;

internal static class DemoSupport
{
    private static readonly JsonSerializerOptions QuoteOptions =
        new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>Quotes text the way JavaScript's JSON.stringify does.</summary>
    public static string Quote(string text) => JsonSerializer.Serialize(text, QuoteOptions);

    /// <summary>
    /// Takes deliveries in order and releases each one when the next one is
    /// taken, or when the loop ends. This is the automatic release that
    /// <see cref="WindowedSubscription.ReadEventsAsync"/> performs, but it also
    /// exposes each delivery's charged size (<see cref="ReceivedDelivery.WireBytes"/>),
    /// which the examples print. Subscribe with <see cref="ReceiveMode.Manual"/>.
    /// </summary>
    public static async IAsyncEnumerable<ReceivedDelivery> TakeDeliveriesAsync(
        this WindowedSubscription subscription,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await foreach (var delivery in subscription.Deliveries.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            using (delivery) yield return delivery;
        }
    }
}
