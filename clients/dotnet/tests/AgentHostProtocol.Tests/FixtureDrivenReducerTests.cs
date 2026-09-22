#nullable enable

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

/// <summary>
/// Loads every fixture under <c>types/test-cases/reducers/*.json</c>, applies
/// the actions through the matching C# reducer, and compares the resulting
/// state with the fixture's expected output. This is the primary
/// cross-language parity gate for the reducers — the same vectors drive the
/// Rust, Go, Kotlin, Swift, and TypeScript clients.
/// </summary>
public sealed class FixtureDrivenReducerTests
{
    // Deterministic timestamp so `summary.modifiedAt` matches what the
    // TypeScript reference reducer stamps in the fixtures.
    private const long MockNow = 9999;

    private static readonly JsonSerializerOptions Options = AhpJson.Options;

    public static IEnumerable<object[]> Fixtures()
    {
        string dir = FindFixtureDir();
        foreach (string path in Directory.EnumerateFiles(dir, "*.json").OrderBy(p => p, StringComparer.Ordinal))
        {
            yield return new object[] { Path.GetFileName(path), path };
        }
    }

    [Theory]
    [MemberData(nameof(Fixtures))]
    public void ReducerMatchesFixture(string name, string path)
    {
        _ = name;
        Reducers.SetNowProvider(() => MockNow);
        try
        {
            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path));
            JsonElement root = doc.RootElement;
            string reducer = root.GetProperty("reducer").GetString()!;
            JsonElement initial = root.GetProperty("initial");
            JsonElement expected = root.GetProperty("expected");
            var actions = new List<StateAction>();
            foreach (JsonElement actionElement in root.GetProperty("actions").EnumerateArray())
            {
                actions.Add(actionElement.Deserialize<StateAction>(Options)!);
            }

            switch (reducer)
            {
                case "root":
                    RunFixture<RootState>(initial, expected, actions, Reducers.ApplyToRoot);
                    break;
                case "session":
                    RunFixture<SessionState>(initial, expected, actions, Reducers.ApplyToSession);
                    break;
                case "terminal":
                    RunFixture<TerminalState>(initial, expected, actions, Reducers.ApplyToTerminal);
                    break;
                case "changeset":
                    RunFixture<ChangesetState>(initial, expected, actions, Reducers.ApplyToChangeset);
                    break;
                case "resourceWatch":
                    RunFixture<ResourceWatchState>(initial, expected, actions, Reducers.ApplyToResourceWatch);
                    break;
                case "annotations":
                    RunFixture<AnnotationsState>(initial, expected, actions, Reducers.ApplyToAnnotations);
                    break;
                case "chat":
                    RunFixture<ChatState>(initial, expected, actions, Reducers.ApplyToChat);
                    break;
                case "automation":
                    RunFixture<AutomationState>(
                        initial,
                        expected,
                        actions,
                        Reducers.ApplyToAutomation);
                    break;
                case "automationRun":
                    RunFixture<AutomationRunState>(
                        initial,
                        expected,
                        actions,
                        Reducers.ApplyToAutomationRun);
                    break;
                default:
                    throw new Xunit.Sdk.XunitException($"unknown reducer kind '{reducer}'");
            }
        }
        finally
        {
            Reducers.SetNowProvider(null);
        }
    }

    private static void RunFixture<T>(
        JsonElement initial,
        JsonElement expected,
        List<StateAction> actions,
        Func<T, StateAction, ReduceOutcome> apply)
        where T : class
    {
        T state = initial.Deserialize<T>(Options)!;

        // Round-trip the initial state through serialize/deserialize to catch
        // any data loss in the generated types before we mutate.
        string reSerialized = JsonSerializer.Serialize(state, Options);
        using (JsonDocument roundTripped = JsonDocument.Parse(reSerialized))
        {
            string actual = Canon(roundTripped.RootElement);
            string original = Canon(initial);
            Assert.True(
                actual == original,
                $"initial state did not survive round-trip:\nre-serialized: {actual}\noriginal:      {original}");
        }

        foreach (StateAction action in actions)
        {
            apply(state, action);
        }

        string got = Canon(JsonSerializer.SerializeToElement(state, Options));
        string want = Canon(expected);
        Assert.True(got == want, $"state mismatch:\nactual:   {got}\nexpected: {want}");
    }

    /// <summary>
    /// Produces a canonical string for a JSON value: object keys are sorted and
    /// <c>null</c>-valued keys are dropped (matching the Go/TS harnesses' null
    /// stripping, where an omitted optional field equals an explicit null).
    /// </summary>
    private static string Canon(JsonElement element)
    {
        var sb = new StringBuilder();
        CanonInto(element, sb);
        return sb.ToString();
    }

    private static void CanonInto(JsonElement element, StringBuilder sb)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                sb.Append('{');
                bool first = true;
                foreach (JsonProperty prop in element.EnumerateObject()
                             .Where(p => p.Value.ValueKind != JsonValueKind.Null)
                             .OrderBy(p => p.Name, StringComparer.Ordinal))
                {
                    if (!first)
                    {
                        sb.Append(',');
                    }

                    first = false;
                    sb.Append(JsonSerializer.Serialize(prop.Name)).Append(':');
                    CanonInto(prop.Value, sb);
                }

                sb.Append('}');
                break;
            case JsonValueKind.Array:
                sb.Append('[');
                bool firstItem = true;
                foreach (JsonElement item in element.EnumerateArray())
                {
                    if (!firstItem)
                    {
                        sb.Append(',');
                    }

                    firstItem = false;
                    CanonInto(item, sb);
                }

                sb.Append(']');
                break;
            case JsonValueKind.String:
                sb.Append(JsonSerializer.Serialize(element.GetString()));
                break;
            case JsonValueKind.Number:
                // Compare numbers by VALUE, not by the text they were written as. JSON has a
                // single number type, so a fixture authoring an integral value as `0.0` means
                // exactly the number `0` — and every client's serializer emits `0` for it,
                // the TypeScript reference (`JSON.stringify(0.0)` === `"0"`) included.
                // Comparing raw text would fail on a difference no consumer can observe.
                // Integers go through `long` so large ids keep full precision rather than
                // being rounded through `double`.
                if (element.TryGetInt64(out long asLong))
                {
                    sb.Append(asLong.ToString(CultureInfo.InvariantCulture));
                }
                else
                {
                    sb.Append(element.GetDouble().ToString("R", CultureInfo.InvariantCulture));
                }

                break;
            case JsonValueKind.True:
                sb.Append("true");
                break;
            case JsonValueKind.False:
                sb.Append("false");
                break;
            default:
                sb.Append("null");
                break;
        }
    }

    private static string FindFixtureDir()
    {
        string? dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            string candidate = Path.Combine(dir, "types", "test-cases", "reducers");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            dir = Path.GetDirectoryName(dir.TrimEnd(Path.DirectorySeparatorChar));
        }

        throw new DirectoryNotFoundException(
            "could not locate types/test-cases/reducers walking upward from the test assembly");
    }
}
