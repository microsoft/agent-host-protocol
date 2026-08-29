#nullable enable

using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

/// <summary>
/// Runs the real .NET WebSocket transport and client against a repository-local
/// TypeScript host that owns the authoritative state through <c>sessionReducer</c>.
/// This keeps negotiation, initialize snapshot seeding, streaming, and reducer
/// convergence inside one hermetic CI lane.
/// </summary>
public sealed class RealSocketTypeScriptConformanceTests
{
    private const string SessionUri = "ahp-session:/dotnet-typescript-conformance";

    [Fact]
    public async Task CurrentProtocol_InitializeSnapshotAndStreamConvergeWithTypeScriptReducer()
    {
        using var testTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        await using var host = await TypeScriptHost.StartAsync(testTimeout.Token);
        var transport = await WebSocketTransport.ConnectAsync(host.Uri, cancellationToken: testTimeout.Token);
        await using var client = AhpClient.Connect(
            transport,
            new ClientConfig { DefaultRequestTimeout = TimeSpan.FromSeconds(5) });

        var initialized = await client.InitializeAsync(
            "dotnet-typescript-conformance",
            new[] { ProtocolVersion.Current },
            new[] { SessionUri },
            testTimeout.Token);

        Assert.Equal(ProtocolVersion.Current, initialized.ProtocolVersion);
        Assert.Equal(0, initialized.ServerSeq);
        var snapshot = Assert.Single(initialized.Snapshots);
        Assert.Equal(SessionUri, snapshot.Resource);
        Assert.Equal(0, snapshot.FromSeq);
        var state = Assert.IsType<SessionState>(snapshot.State.Session);
        Assert.Equal("Seeded by initialize", state.Title);
        Assert.Equal(SessionLifecycle.Creating, state.Lifecycle);

        using var subscription = client.AttachSubscription(SessionUri);
        var run = await client.RequestAsync<Dictionary<string, string>, JsonElement>(
            "interop/run",
            new Dictionary<string, string> { ["channel"] = SessionUri },
            testTimeout.Token);

        var actionCount = run.GetProperty("actionCount").GetInt32();
        Assert.Equal(4, actionCount);
        for (var expectedSeq = 1; expectedSeq <= actionCount; expectedSeq += 1)
        {
            var received = await subscription.Events.ReadAsync(testTimeout.Token);
            var actionEvent = Assert.IsType<SubscriptionEventAction>(received);
            Assert.Equal(SessionUri, actionEvent.Envelope.Channel);
            Assert.Equal(expectedSeq, actionEvent.Envelope.ServerSeq);
            Assert.Equal(ReduceOutcome.Applied, Reducers.ApplyToSession(state, actionEvent.Envelope.Action));
        }

        Assert.Equal(actionCount, run.GetProperty("serverSeq").GetInt32());
        var actual = JsonSerializer.SerializeToElement(state, AhpJson.Options);
        Assert.Equal(JsonCanon.Of(run.GetProperty("finalState")), JsonCanon.Of(actual));
    }

    private sealed class TypeScriptHost : IAsyncDisposable
    {
        private readonly Process _process;
        private readonly Task<string> _stderr;

        private TypeScriptHost(Process process, Task<string> stderr, int port)
        {
            _process = process;
            _stderr = stderr;
            Uri = new Uri($"ws://127.0.0.1:{port}");
        }

        public Uri Uri { get; }

        public static async Task<TypeScriptHost> StartAsync(CancellationToken cancellationToken)
        {
            var repoRoot = FindRepoRoot();
            var script = Path.Combine(
                repoRoot,
                "clients",
                "dotnet",
                "tests",
                "AgentHostProtocol.Tests",
                "interop",
                "session-host.ts");
            var start = new ProcessStartInfo
            {
                FileName = Environment.GetEnvironmentVariable("NODE") ?? "node",
                WorkingDirectory = repoRoot,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            start.ArgumentList.Add("--import");
            start.ArgumentList.Add("tsx");
            start.ArgumentList.Add(script);

            var process = Process.Start(start)
                ?? throw new InvalidOperationException("Failed to start the repository-local TypeScript host.");
            var stderr = process.StandardError.ReadToEndAsync(cancellationToken);
            try
            {
                using var readinessTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                readinessTimeout.CancelAfter(TimeSpan.FromSeconds(3));
                var readyLine = await process.StandardOutput.ReadLineAsync(readinessTimeout.Token);
                if (readyLine is null)
                {
                    await process.WaitForExitAsync(readinessTimeout.Token);
                    throw new InvalidOperationException(
                        $"TypeScript host exited before readiness: {await stderr}");
                }
                using var ready = JsonDocument.Parse(readyLine);
                Assert.Equal("ready", ready.RootElement.GetProperty("type").GetString());
                return new TypeScriptHost(process, stderr, ready.RootElement.GetProperty("port").GetInt32());
            }
            catch
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
                process.Dispose();
                throw;
            }
        }

        public async ValueTask DisposeAsync()
        {
            try
            {
                var stoppedByTest = !_process.HasExited;
                if (stoppedByTest)
                {
                    _process.Kill(entireProcessTree: true);
                    using var shutdownTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                    await _process.WaitForExitAsync(shutdownTimeout.Token);
                }
                if (!stoppedByTest && _process.ExitCode != 0)
                {
                    throw new InvalidOperationException(
                        $"TypeScript host exited with code {_process.ExitCode}: {await _stderr}");
                }
            }
            finally
            {
                _process.Dispose();
            }
        }

        private static string FindRepoRoot()
        {
            var starts = new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory };
            foreach (var start in starts)
            {
                for (var directory = new DirectoryInfo(start); directory is not null; directory = directory.Parent)
                {
                    if (File.Exists(Path.Combine(directory.FullName, "package.json"))
                        && File.Exists(Path.Combine(directory.FullName, "types", "reducers.ts")))
                    {
                        return directory.FullName;
                    }
                }
            }
            throw new DirectoryNotFoundException("Could not locate the Agent Host Protocol repository root.");
        }
    }
}
