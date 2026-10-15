// Windowed delivery with backpressure and a custom coalescer.
//
// Part 1, receiving: the client renders slowly. While it is busy, the host
// fills the window and the client queues what arrives. Adjacent queued
// messages are combined before the renderer sees them:
//
// - The built-in coalescer joins adjacent `terminal/data` output.
// - A custom coalescer keeps only the last of adjacent `terminal/resized`
//   actions, because only the final size matters.
//
// Part 2, sending: the client pastes a large block of text into the terminal.
// The host processes input slowly, so the client's send window fills. The
// client waits until the subscription is writable before it sends each chunk,
// instead of queueing the whole paste in memory.
//
// Run: dotnet run --project examples/WindowingBackpressure
#nullable enable

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;
using WindowingExamples;

const string Terminal = "ahp-terminal:/demo";

var host = new WindowingDemoHost(new DemoHostOptions
{
    ClientWindowBytes = 2048,
    HostWindowBytes = 1024,
    InputDelay = TimeSpan.FromMilliseconds(15),
});
var config = new ClientConfig();
config.Windowing.Coalescers.Add(new LatestResizeCoalescer());
// Allow at most 2048 bytes of unsent data to wait behind the message being sent.
config.Windowing.MaxBufferedSendBytes = 2048;
var client = AhpClient.Connect(host.ClientTransport, config);
await client.InitializeAsync("windowing-example", ProtocolVersion.Supported);

// Count what the client did. This stream is for monitoring only and can drop
// events; it never affects credit.
var counts = new SortedDictionary<string, int>(StringComparer.Ordinal);
var counting = CountFlowControlEventsAsync();

// Manual receive mode exposes each delivery's charged size; TakeDeliveriesAsync
// still releases deliveries automatically. Coalescing is on by default.
var (_, subscription) = await client.SubscribeWindowedAsync(Terminal,
    new WindowOptions { WindowBytes = 4096, Receive = ReceiveMode.Manual });
Log($"subscribed: accepted window={subscription.FlowControl.Limits?.ClientReceive.WindowBytes} bytes");

// ─── Part 1: a slow renderer ────────────────────────────────────────────────

Console.WriteLine("\nPart 1: slow renderer");
StateAction[] hostActions =
[
    Data("Building 120 modules\r\n"),
    // The user drags the corner of the terminal window.
    Resize(100, 30),
    Resize(110, 32),
    Resize(120, 36),
    Resize(132, 40),
    .. Enumerable.Range(1, 10)
        .Select(step => step * 10)
        .Select(percent => Data($"[{percent,3}%] compiled {percent * 120 / 100} modules\r\n")),
    Data("Build finished\r\n"),
];
var writer = WriteHostActionsAsync();

var renders = 0;
// Leaving this loop releases the last delivery but keeps the subscription open.
await foreach (var delivery in subscription.TakeDeliveriesAsync())
{
    renders++;
    if (delivery.Event is SubscriptionEventSnapshot)
    {
        Log($"render snapshot ({delivery.WireBytes} bytes)");
    }
    else if (delivery.Event is SubscriptionEventAction { Envelope.Action.Value: TerminalResizedAction resize })
    {
        Log($"render resize to {resize.Cols}x{resize.Rows} ({delivery.WireBytes} bytes)");
    }
    else if (delivery.Event is SubscriptionEventAction { Envelope.Action.Value: TerminalDataAction data })
    {
        var lines = data.Data.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Log($"render {lines.Length} line(s) of output ({delivery.WireBytes} bytes): {DemoSupport.Quote(lines[^1])}");
        if (data.Data.Contains("Build finished", StringComparison.Ordinal)) break;
    }
    await Task.Delay(60); // The renderer is slow; the host fills the window meanwhile.
}
await writer;
Log($"rendered {renders} deliveries for {hostActions.Length + 1} host messages");

// ─── Part 2: pasting into a slow terminal ───────────────────────────────────

Console.WriteLine("\nPart 2: pasting into a slow terminal");
var paste = Enumerable.Range(1, 8).Select(i => $"echo \"line {i} of the pasted script\"\n").ToArray();
var waits = 0;
for (var i = 0; i < paste.Length; i++)
{
    // Wait for room in the host window and the local send queue, rather than
    // queueing the whole paste. With one producer, this keeps sends within the limit.
    var status = subscription.FlowControl;
    if (!status.Writable)
    {
        Log($"not writable ({status.OutstandingSendBytes} bytes awaiting credit, {status.BufferedSendBytes} bytes queued); waiting");
        waits++;
        await subscription.WaitWritableAsync();
    }
    Log($"send chunk {i + 1} of {paste.Length}");
    // Completes when the message is written to the transport. If another
    // producer filled the local send queue first, the .NET client waits for
    // room in the queue rather than failing, so there is nothing to retry.
    await client.DispatchAsync(Terminal, new StateAction(new TerminalInputAction { Data = paste[i] }));
}
// Wait until the host has processed, and credited, every chunk.
await foreach (var current in subscription.FlowControlChanges().ReadAllAsync())
{
    if (current.OutstandingSendBytes == 0 && current.BufferedSendBytes == 0) break;
}
var intact = host.ReceivedInput == string.Concat(paste);
Log($"sent {paste.Length} chunks, waiting {waits} times; host received the paste intact: {(intact ? "true" : "false")}");

await subscription.DisposeAsync();
await client.DisposeAsync();
await host.DisposeAsync();

// Shutting down the client completes the event stream, so every event is counted.
await counting;
Console.WriteLine("\nFlow-control events:");
foreach (var (kind, count) in counts) Console.WriteLine($"  {kind}: {count}");

async Task CountFlowControlEventsAsync()
{
    await foreach (var flowEvent in client.FlowControlEvents().ReadAllAsync())
    {
        counts[flowEvent.Kind] = counts.GetValueOrDefault(flowEvent.Kind) + 1;
    }
}

async Task WriteHostActionsAsync()
{
    await host.WhenSubscribedAsync();
    foreach (var action in hostActions) await host.SendActionAsync(action);
}

static StateAction Data(string data) => new(new TerminalDataAction { Data = data });

static StateAction Resize(long cols, long rows) => new(new TerminalResizedAction { Cols = cols, Rows = rows });

static void Log(string message) => Console.WriteLine($"  client | {message}");

// A custom coalescer runs on two adjacent messages that are still queued. It
// returns the combined message, or null to leave them separate. The client
// never passes it messages that the protocol requires to stay separate, such
// as actions with an origin.
internal sealed class LatestResizeCoalescer : IChannelMessageCoalescer
{
    public JsonRpcNotification? Coalesce(JsonRpcNotification earlier, JsonRpcNotification later, CoalescingContext context)
    {
        if (context.Direction != CoalescingDirection.Incoming || earlier.Method != "action") return null;
        return IsResize(earlier) && IsResize(later) ? later : null;
    }

    private static bool IsResize(JsonRpcNotification notification) =>
        notification.Params is { } parameters
        && parameters.TryGetProperty("action", out var action)
        && action.TryGetProperty("type", out var type)
        && type.GetString() == ActionType.TerminalResized.Value;
}
