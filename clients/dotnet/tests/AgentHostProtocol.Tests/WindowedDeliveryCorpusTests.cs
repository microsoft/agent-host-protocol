#nullable enable

using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class WindowedDeliveryCorpusTests
{
    private static readonly JsonSerializerOptions StatusJson = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static string Corpus
    {
        get
        {
            var directory = new DirectoryInfo(AppContext.BaseDirectory);
            while (directory is not null)
            {
                var candidate = Path.Combine(directory.FullName, "types", "test-cases", "windowed-delivery");
                if (Directory.Exists(candidate)) return candidate;
                directory = directory.Parent;
            }
            throw new DirectoryNotFoundException("Shared windowed delivery corpus was not found.");
        }
    }

    public static IEnumerable<object[]> Scenarios() =>
        Directory.GetFiles(Path.Combine(Corpus, "scenarios"), "*.json").OrderBy(x => x, StringComparer.Ordinal)
            .Select(path => new object[] { Path.GetFileName(path), path });

    [Fact]
    public void AllRawSizeCases()
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(Corpus, "sizes.json")));
        var cases = document.RootElement.ValueKind == JsonValueKind.Array ? document.RootElement : document.RootElement.GetProperty("cases");
        foreach (var entry in cases.EnumerateArray())
        {
            var text = entry.GetProperty("text").GetString()!;
            var expected = entry.GetProperty("utf16Bytes").GetInt64();
            Assert.Equal(expected, AhpClient.RawWindowBytes(TransportMessage.FromText(text)));
            Assert.Equal(expected, AhpClient.RawWindowBytes(TransportMessage.FromBinary(System.Text.Encoding.UTF8.GetBytes(text))));
        }
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public async Task EveryScenario(string name, string path)
    {
        _ = name;
        await RunScenarioAsync(path);
    }

    private static async Task RunScenarioAsync(string path)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var scenario = document.RootElement;
        var defaults = scenario.GetProperty("windowing");
        var config = new ClientConfig
        {
            Windowing = new WindowingConfig
            {
                WindowBytes = defaults.GetProperty("windowBytes").GetInt64(),
                MaximumFrameBytes = defaults.GetProperty("maximumFrameBytes").GetInt64(),
                MaxBufferedSendBytes = defaults.TryGetProperty("maxBufferedSendBytes", out var sendLimit) ? sendLimit.GetInt64() : 1048576,
            },
        };
        var transport = new CorpusTransport();
        await using var client = AhpClient.Connect(transport, config);
        var handles = new Dictionary<string, WindowedSubscription>(StringComparer.Ordinal);
        var modes = new Dictionary<string, bool>(StringComparer.Ordinal);
        var deliveries = new Dictionary<string, List<ReceivedDelivery>>(StringComparer.Ordinal);
        var ordinary = new Dictionary<string, Task<(SubscribeResult Result, Subscription Sub)>>(StringComparer.Ordinal);
        var requests = new List<Task>();
        var ordinarySnapshotRead = new HashSet<string>(StringComparer.Ordinal);
        var answered = new HashSet<ulong>();
        var readIndex = 0;
        var currentStep = "";
        try
        {
            foreach (var step in scenario.GetProperty("steps").EnumerateArray())
            {
                var op = step.GetProperty("op").GetString();
                currentStep = step.GetRawText();
                var uri = step.TryGetProperty("channel", out var channel) ? channel.GetString()! : "";
                switch (op)
                {
                    case "subscribe":
                        var manual = step.TryGetProperty("receive", out var receive) && receive.GetString() == "manual";
                        modes[uri] = manual;
                        if (!deliveries.ContainsKey(uri)) deliveries[uri] = new List<ReceivedDelivery>();
                        if (step.TryGetProperty("window", out var window))
                        {
                            var task = client.SubscribeWindowedAsync(uri, new WindowOptions
                            {
                                WindowBytes = window.TryGetProperty("windowBytes", out var w) ? w.GetInt64() : null,
                                MaximumFrameBytes = window.TryGetProperty("maximumFrameBytes", out var f) ? f.GetInt64() : null,
                                Receive = manual ? ReceiveMode.Manual : ReceiveMode.Auto,
                                Coalescing = !step.TryGetProperty("coalescing", out var c) || c.GetBoolean(),
                            });
                            requests.Add(task);
                            handles[uri] = client.GetWindowedSubscription(uri)!;
                        }
                        else
                        {
                            ordinary[uri] = client.SubscribeAsync(uri);
                            requests.Add(ordinary[uri]);
                        }
                        break;
                    case "respond":
                        await UntilAsync(() => transport.Snapshot().Any(x =>
                            x.Json.TryGetProperty("id", out var id) && !answered.Contains(id.GetUInt64())
                            && x.Json.GetProperty("method").GetString() == step.GetProperty("to").GetString())).ConfigureAwait(false);
                        var pending = transport.Snapshot().First(x => x.Json.TryGetProperty("id", out var id)
                            && !answered.Contains(id.GetUInt64())
                            && x.Json.GetProperty("method").GetString() == step.GetProperty("to").GetString());
                        var requestId = pending.Json.GetProperty("id").GetUInt64();
                        answered.Add(requestId);
                        transport.Inject("{\"jsonrpc\":\"2.0\",\"id\":" + requestId.ToString(System.Globalization.CultureInfo.InvariantCulture)
                            + ",\"result\":" + step.GetProperty("result").GetRawText() + "}");
                        break;
                    case "hostSends":
                        transport.Inject(step.GetProperty("text").GetString()!);
                        break;
                    case "hostCreditsAll":
                        var total = transport.Snapshot().Where(x =>
                            !x.Json.TryGetProperty("id", out _) && x.Json.GetProperty("method").GetString() is { } method
                            && WindowedDelivery.CountsAgainstWindow(method)
                            && x.Json.GetProperty("params").GetProperty("channel").GetString() == uri)
                            .Sum(x => (long)x.Text.Length * 2);
                        transport.Inject(SystemTextJsonAhpSerializer.Default.Serialize(new JsonRpcNotification
                        {
                            Method = "channel/credit",
                            Params = SystemTextJsonAhpSerializer.Default.SerializeToElement(new ChannelCreditParams
                            {
                                Channel = uri,
                                ConsumedBytes = total,
                            }),
                        }));
                        break;
                    case "expectSent":
                        var match = step.GetProperty("match");
                        var assembly = new System.Text.StringBuilder();
                        while (true)
                        {
                            await UntilAsync(() => transport.Snapshot().Length > readIndex).ConfigureAwait(false);
                            var actual = transport.Snapshot()[readIndex++];
                            var actualJson = actual.Json;
                            if (actualJson.GetProperty("method").GetString() == "channel/frame"
                                && step.TryGetProperty("reassemble", out var reassemble) && reassemble.GetBoolean())
                            {
                                var p = actualJson.GetProperty("params");
                                Assert.True((long)actual.Text.Length * 2 <= handles[p.GetProperty("channel").GetString()!].Limits!.HostReceive.MaximumFrameBytes);
                                assembly.Append(p.GetProperty("data").GetString());
                                if (!p.TryGetProperty("final", out var final) || !final.GetBoolean()) continue;
                                using var joined = JsonDocument.Parse(assembly.ToString());
                                actualJson = joined.RootElement.Clone();
                            }
                            if (Matches(match, actualJson))
                            {
                                if (step.TryGetProperty("absent", out var absent))
                                    foreach (var missing in absent.EnumerateArray())
                                        Assert.False(ContainsPath(actualJson, missing.GetString()!));
                                break;
                            }
                            Assert.Equal("channel/credit", actualJson.GetProperty("method").GetString());
                        }
                        break;
                    case "expectNotSent":
                        await Task.Delay(step.GetProperty("withinMs").GetInt32()).ConfigureAwait(false);
                        Assert.DoesNotContain(transport.Snapshot().Skip(readIndex), x => Matches(step.GetProperty("match"), x.Json));
                        break;
                    case "next":
                        if (!modes[uri] && deliveries[uri].Count > 0) deliveries[uri][deliveries[uri].Count - 1].Release();
                        ReceivedDelivery delivery;
                        if (handles.TryGetValue(uri, out var handle))
                        {
                            await UntilAsync(() =>
                            {
                                lock (handle.Gate)
                                    return handle.Queue.First is { } first
                                        && Matches(step.GetProperty("expect"), SystemTextJsonAhpSerializer.Default.SerializeToElement(first.Value.Notification));
                            }).ConfigureAwait(false);
                            delivery = await handle.InternalDeliveries.ReadAsync().ConfigureAwait(false);
                        }
                        else
                        {
                            var subscribed = await ordinary[uri].WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                            if (ordinarySnapshotRead.Add(uri) && subscribed.Result.Snapshot is { } snapshot)
                            {
                                var notification = new JsonRpcNotification
                                {
                                    Method = "channel/snapshot",
                                    Params = SystemTextJsonAhpSerializer.Default.SerializeToElement(new ChannelSnapshotParams
                                    {
                                        Channel = uri,
                                        Snapshot = snapshot,
                                    }),
                                };
                                delivery = new ReceivedDelivery(new SubscriptionEventSnapshot(snapshot), notification, 0, 0, 0, () => { });
                            }
                            else
                            {
                                var value = await subscribed.Sub.Events.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                                var action = Assert.IsType<SubscriptionEventAction>(value);
                                delivery = new ReceivedDelivery(value, new JsonRpcNotification
                                {
                                    Method = "action",
                                    Params = SystemTextJsonAhpSerializer.Default.SerializeToElement(action.Envelope),
                                }, 0, 0, 0, () => { });
                            }
                        }
                        deliveries[uri].Add(delivery);
                        Assert.True(Matches(step.GetProperty("expect"), SystemTextJsonAhpSerializer.Default.SerializeToElement(delivery.Notification)));
                        if (step.TryGetProperty("expectBytes", out var expectedBytes)) Assert.Equal(expectedBytes.GetInt64(), delivery.WireBytes);
                        break;
                    case "advance":
                        deliveries[uri][deliveries[uri].Count - 1].Release();
                        break;
                    case "release":
                        deliveries[uri][step.GetProperty("index").GetInt32()].Release();
                        break;
                    case "send":
                        requests.Add(client.NotifyAsync(step.GetProperty("method").GetString()!, step.GetProperty("params")));
                        break;
                    case "unsubscribe":
                        await client.UnsubscribeAsync(uri).ConfigureAwait(false);
                        break;
                    case "expectStatus":
                        await UntilAsync(() =>
                        {
                            var status = handles.TryGetValue(uri, out var owner) ? owner.FlowControl
                                : new FlowControlStatus { Mode = "ordinary", Writable = true };
                            var json = JsonSerializer.SerializeToElement(status, StatusJson);
                            return Matches(step.GetProperty("match"), json);
                        }).ConfigureAwait(false);
                        break;
                    case "expectClosed":
                        await client.Completion.WaitAsync(TimeSpan.FromSeconds(1)).ConfigureAwait(false);
                        Assert.IsType<AhpTransportException>(client.Error);
                        Assert.Equal("protocol", ((AhpTransportException)client.Error!).Kind);
                        break;
                    default:
                        throw new InvalidOperationException("Unknown corpus step: " + op);
                }
            }
        }
        catch (Exception error)
        {
            var state = string.Join(";", handles.Select(x =>
            {
                lock (x.Value.Gate)
                    return x.Key + ":status=" + JsonSerializer.Serialize(x.Value.FlowControl, StatusJson)
                        + ":queue=" + string.Join(",", x.Value.Queue.Select(d => SystemTextJsonAhpSerializer.Default.Serialize(d.Notification)));
            }));
            throw new InvalidOperationException($"Corpus {Path.GetFileName(path)}, step {currentStep}; client={client.Error}; {state}", error);
        }
        finally
        {
            await client.ShutdownAsync().ConfigureAwait(false);
            foreach (var request in requests)
                try { await request.ConfigureAwait(false); } catch (AhpException) { }
        }
    }

    internal static async Task UntilAsync(Func<bool> condition)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        while (!condition()) await Task.Delay(1, timeout.Token).ConfigureAwait(false);
    }

    internal static bool Matches(JsonElement expected, JsonElement actual)
    {
        if (expected.ValueKind != actual.ValueKind) return false;
        if (expected.ValueKind == JsonValueKind.Object)
            return expected.EnumerateObject().All(p => actual.TryGetProperty(p.Name, out var value) && Matches(p.Value, value));
        return AhpClient.JsonEqual(expected, actual);
    }

    private static bool ContainsPath(JsonElement value, string path)
    {
        foreach (var part in path.Split('.'))
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(part, out value)) return false;
        return true;
    }
}

internal sealed class CorpusTransport : ITransport, ITransportMessageLimits
{
    private readonly Channel<TransportMessage> _inbox = Channel.CreateUnbounded<TransportMessage>();
    private readonly List<(string Text, JsonElement Json)> _sent = new();
    public long? MaximumInboundMessageBytes { get; set; }
    internal Action<JsonElement>? OnSent { get; set; }
    internal void Inject(string text) => _inbox.Writer.TryWrite(TransportMessage.FromText(text));
    internal (string Text, JsonElement Json)[] Snapshot() { lock (_sent) return _sent.ToArray(); }
    public ValueTask SendAsync(TransportMessage message, CancellationToken cancellationToken = default)
    {
        using var document = JsonDocument.Parse(message.Text!);
        var json = document.RootElement.Clone();
        lock (_sent) _sent.Add((message.Text!, json));
        OnSent?.Invoke(json);
        return default;
    }
    public async ValueTask<TransportMessage> ReceiveAsync(CancellationToken cancellationToken = default) =>
        await _inbox.Reader.ReadAsync(cancellationToken).ConfigureAwait(false);
    public ValueTask CloseAsync(CancellationToken cancellationToken = default)
    {
        _inbox.Writer.TryComplete();
        return default;
    }
    public ValueTask DisposeAsync() => CloseAsync();
}
