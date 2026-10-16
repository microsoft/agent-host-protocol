// Basic windowed delivery.
//
// The client offers windowed delivery on a terminal subscription. The host
// accepts a smaller window, then sends a snapshot and terminal output. When
// the window is full, the host waits; each time the client takes the next
// delivery, it releases the previous one and returns credit, so the host can
// continue.
//
// Run: dotnet run --project examples/WindowingBasic
#nullable enable

using System;
using System.Threading.Tasks;
using Microsoft.AgentHostProtocol;
using WindowingExamples;

const string Terminal = "ahp-terminal:/demo";
string[] output =
[
    "$ npm test",
    "> demo@1.0.0 test",
    "> node --test",
    "ok 1 - parses the configuration file",
    "ok 2 - rejects an unknown option",
    "ok 3 - reads input from stdin",
    "ok 4 - writes the report",
    "# pass 4, fail 0",
];

// The host accepts at most a 1024-byte window, so it fills after a few messages.
await using var host = new WindowingDemoHost(new DemoHostOptions { ClientWindowBytes = 1024, HostWindowBytes = 4096 });
await using var client = AhpClient.Connect(host.ClientTransport);
await client.InitializeAsync("windowing-example", ProtocolVersion.Supported);

// Windowing is off by default. Opt in for this subscription and offer a
// 4096-byte window. Coalescing is turned off so that every host message is a
// separate delivery; see WindowingBackpressure for coalescing. Manual receive
// mode exposes each delivery's charged size; TakeDeliveriesAsync still
// releases deliveries automatically.
var (_, subscription) = await client.SubscribeWindowedAsync(Terminal, new WindowOptions
{
    WindowBytes = 4096,
    Coalescing = false,
    Receive = ReceiveMode.Manual,
});
var flowControl = subscription.FlowControl;
Log($"subscribed: mode={flowControl.Mode}, accepted window={flowControl.Limits?.ClientReceive.WindowBytes} bytes");

// The host writes terminal output as fast as the window allows.
var writer = WriteOutputAsync();

// With automatic release, taking the next delivery releases the previous one.
// The client then returns credit for it.
var lines = 0;
await foreach (var delivery in subscription.TakeDeliveriesAsync())
{
    var buffered = subscription.FlowControl.BufferedReceiveBytes;
    switch (delivery.Event)
    {
        case SubscriptionEventSnapshot:
            Log($"snapshot ({delivery.WireBytes} bytes; {buffered} bytes not yet released)");
            break;
        case SubscriptionEventAction { Envelope.Action.Value: TerminalDataAction data }:
            Log($"output {DemoSupport.Quote(data.Data.TrimEnd())} ({delivery.WireBytes} bytes; {buffered} bytes not yet released)");
            lines++;
            break;
    }
    await Task.Delay(20); // Simulate rendering the delivery.
    if (lines == output.Length) break; // Leaving the loop releases the last delivery.
}
await subscription.DisposeAsync(); // Unsubscribe.

Log($"received all {lines} lines");
await writer;
// Leaving the program disposes the client, which shuts it down, and then the host.

async Task WriteOutputAsync()
{
    await host.WhenSubscribedAsync();
    foreach (var line in output)
    {
        await host.SendActionAsync(new StateAction(new TerminalDataAction { Data = line + "\r\n" }));
    }
}

static void Log(string message) => Console.WriteLine($"  client | {message}");
