// Data-driven loader for the shared wire round-trip corpus under
// types/test-cases/round-trips/*.json. Each fixture's `input` is decoded with the
// REAL System.Text.Json serializer (SystemTextJsonAhpSerializer.Default) and the
// REAL generated wire types, then re-encoded with the same serializer; the result
// must structurally equal the single canonical form in acceptableOutputs[0].
//
// The comparison is key-order-independent but value- and KEY-PRESENCE-sensitive:
// `null` is NOT normalized to absent (so an absent `origin` re-encoding as
// "origin": null is a failure, not a pass).
//
// The corpus is language-agnostic (see types/test-cases/round-trips/README.md);
// the same fixtures drive the Go / Swift / Rust / Kotlin / TypeScript clients.
// .NET is a runtime decoder (like Go/Swift/Rust/Kotlin): System.Text.Json drops
// unknown wire keys on decode, so .NET asserts acceptableOutputs[0] for BOTH
// group A and group B. The `group` field + `preservedOutput` only affect the
// TypeScript harness (TS has no runtime decoder and preserves unknown keys
// verbatim, so its expected output differs only for group B).
//
// The [Theory] CorpusFixture iterates EVERY fixture file, so adding a fixture is
// automatically exercised and a stray/garbled fixture fails loudly.
#nullable enable

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace Microsoft.AgentHostProtocol.Tests;

public sealed class TypesRoundTripFixtures
{
    private static readonly SystemTextJsonAhpSerializer Ser = SystemTextJsonAhpSerializer.Default;

    // ── Public entry points ───────────────────────────────────────────────

    public static IEnumerable<object[]> AllFixtures() =>
        EnumerateFixtureFiles().Select(path => new object[] { Path.GetFileName(path), path });

    /// <summary>
    /// Decodes each corpus fixture's <c>input</c> into the real generated type,
    /// re-encodes it, and asserts structural equality with the single canonical
    /// <c>acceptableOutputs[0]</c>. The loud guard that every fixture file on disk
    /// is real, parseable, and asserts something.
    /// </summary>
    [Theory]
    [MemberData(nameof(AllFixtures))]
    public void CorpusFixture(string name, string path)
    {
        _ = name;
        VerifyFixture(path);
    }

    /// <summary>
    /// Protocol-version constants, previously exercised via corpus fixtures
    /// 021–023 (removed because constant checks are not wire round-trips). Mirrors
    /// the Go client's TestProtocolVersionConstants so coverage is not lost.
    /// </summary>
    [Fact]
    public void ProtocolVersionConstants()
    {
        Assert.False(
            string.IsNullOrWhiteSpace(ProtocolVersion.Current),
            "ProtocolVersion.Current must be non-empty");
        Assert.NotEmpty(ProtocolVersion.Supported);
        Assert.Equal(ProtocolVersion.Current, ProtocolVersion.Supported[0]);
    }

    [Fact]
    public void CanvasIconChangedRequiresRevision()
    {
        Assert.Throws<JsonException>(() =>
            Ser.Deserialize<StateAction>("""{"type":"canvas/iconChanged","icon":null}"""));
        Assert.Throws<JsonException>(() =>
            Ser.Deserialize<StateAction>("""{"type":"canvas/iconChanged","icon":null,"revision":null}"""));
    }

    // ── Verifier ──────────────────────────────────────────────────────────

    private static void VerifyFixture(string path)
    {
        string fname = Path.GetFileName(path);
        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path));
        JsonElement root = doc.RootElement;

        if (!root.TryGetProperty("type", out JsonElement typeEl) || typeEl.GetString() is not { } type)
        {
            throw new Xunit.Sdk.XunitException($"{fname}: missing `type`");
        }

        if (!root.TryGetProperty("input", out JsonElement input))
        {
            throw new Xunit.Sdk.XunitException($"{fname}: missing `input`");
        }

        if (!root.TryGetProperty("acceptableOutputs", out JsonElement outputs)
            || outputs.ValueKind != JsonValueKind.Array)
        {
            throw new Xunit.Sdk.XunitException($"{fname}: missing `acceptableOutputs` array");
        }

        // Single canonical form: acceptableOutputs MUST have exactly one entry.
        // Multiple "acceptable" forms cement observed-but-wrong divergence between
        // clients instead of pinning the single intended wire shape.
        int outCount = outputs.GetArrayLength();
        if (outCount != 1)
        {
            throw new Xunit.Sdk.XunitException(
                $"{fname}: acceptableOutputs must have exactly 1 entry (the single canonical re-encoded form); got {outCount}.");
        }

        // `notApplicable` is a legacy opt-out (new fixtures use group:"B" +
        // preservedOutput). Honor it so a fixture can still skip .NET if needed.
        if (root.TryGetProperty("notApplicable", out JsonElement na)
            && na.ValueKind == JsonValueKind.Array
            && na.EnumerateArray().Any(c => c.GetString() is "dotnet" or "csharp"))
        {
            return;
        }

        // Decode `input` as the real generated type, re-encode with the real serializer.
        (_, string reencoded) = DecodeAndReencode(type, input.GetRawText());

        using JsonDocument reDoc = JsonDocument.Parse(reencoded);
        if (!JsonDeepEquals(outputs[0], reDoc.RootElement))
        {
            throw new Xunit.Sdk.XunitException(
                $"{fname}: re-encoded output does not match the canonical acceptableOutputs[0].\n"
                + $"  expected: {JsonSerializer.Serialize(outputs[0])}\n"
                + $"  actual:   {reencoded}");
        }
    }

    // ── Real decode dispatch ──────────────────────────────────────────────

    /// <summary>
    /// Decodes <paramref name="inputJson"/> into the real generated type named by
    /// <paramref name="type"/> using the real serializer, then re-encodes it with
    /// the same serializer. Adding a wire type to the corpus is a deliberate edit
    /// here — the corpus never decodes arbitrary types reflectively.
    /// </summary>
    private static (object decoded, string reencoded) DecodeAndReencode(string type, string inputJson)
    {
        switch (type)
        {
            case "ActionEnvelope":
                return Wrap(Ser.Deserialize<ActionEnvelope>(inputJson));
            case "StateAction":
                return Wrap(Ser.Deserialize<StateAction>(inputJson));
            case "Customization":
                return Wrap(Ser.Deserialize<Customization>(inputJson));
            case "SessionStatus":
                return Wrap(Ser.Deserialize<SessionStatus>(inputJson));
            case "StringOrMarkdown":
                return Wrap(Ser.Deserialize<StringOrMarkdown>(inputJson));
            case "JsonRpcMessage":
                return Wrap(Ser.Deserialize<JsonRpcMessage>(inputJson));
            case "ChangesetOperationTarget":
                return Wrap(Ser.Deserialize<ChangesetOperationTarget>(inputJson));
            case "ChatInputQuestion":
                return Wrap(Ser.Deserialize<ChatInputQuestion>(inputJson));
            case "ChatSource":
                return Wrap(Ser.Deserialize<ChatSource>(inputJson));
            case "SessionSummary":
                return Wrap(Ser.Deserialize<SessionSummary>(inputJson));
            case "SessionAddedParams":
                return Wrap(Ser.Deserialize<SessionAddedParams>(inputJson));
            case "PartialSessionSummary":
                return Wrap(Ser.Deserialize<PartialSessionSummary>(inputJson));
            case "Implementation":
                return Wrap(Ser.Deserialize<Implementation>(inputJson));
            case "InitializeResult":
                return Wrap(Ser.Deserialize<InitializeResult>(inputJson));
            case "Snapshot":
                return Wrap(Ser.Deserialize<Snapshot>(inputJson));
            default:
                throw new Xunit.Sdk.XunitException(
                    $"round-trip fixture: unknown wire type \"{type}\". "
                    + "Add a decode entry to TypesRoundTripFixtures.DecodeAndReencode.");
        }

        (object, string) Wrap<T>(T value) => (value!, Ser.Serialize(value));
    }

    // ── Structural JSON equality ──────────────────────────────────────────

    /// <summary>
    /// Deep structural equality. Objects are compared key-order-independent but
    /// key-presence-SENSITIVE (a null-valued member is NOT equal to an absent one,
    /// so the origin omit-vs-null distinction is genuinely tested). Arrays compare
    /// element-wise in order; numbers compare numerically (so 0 == 0.0 and 64-bit
    /// values above Int32 stay exact).
    /// </summary>
    private static bool JsonDeepEquals(JsonElement a, JsonElement b)
    {
        if (a.ValueKind != b.ValueKind)
        {
            return false;
        }

        switch (a.ValueKind)
        {
            case JsonValueKind.Object:
                Dictionary<string, JsonElement> aProps =
                    a.EnumerateObject().ToDictionary(p => p.Name, p => p.Value, StringComparer.Ordinal);
                Dictionary<string, JsonElement> bProps =
                    b.EnumerateObject().ToDictionary(p => p.Name, p => p.Value, StringComparer.Ordinal);
                return aProps.Count == bProps.Count
                    && aProps.All(kv => bProps.TryGetValue(kv.Key, out JsonElement bv) && JsonDeepEquals(kv.Value, bv));

            case JsonValueKind.Array:
                if (a.GetArrayLength() != b.GetArrayLength())
                {
                    return false;
                }

                JsonElement[] aItems = a.EnumerateArray().ToArray();
                JsonElement[] bItems = b.EnumerateArray().ToArray();
                for (int i = 0; i < aItems.Length; i++)
                {
                    if (!JsonDeepEquals(aItems[i], bItems[i]))
                    {
                        return false;
                    }
                }

                return true;

            case JsonValueKind.String:
                return a.GetString() == b.GetString();

            case JsonValueKind.Number:
                return NumbersEqual(a, b);

            default:
                // True / False / Null: ValueKind already matched, so they are equal.
                return true;
        }
    }

    private static bool NumbersEqual(JsonElement a, JsonElement b)
    {
        if (a.TryGetInt64(out long la) && b.TryGetInt64(out long lb))
        {
            return la == lb;
        }

        if (a.TryGetUInt64(out ulong ua) && b.TryGetUInt64(out ulong ub))
        {
            return ua == ub;
        }

        if (a.TryGetDecimal(out decimal da) && b.TryGetDecimal(out decimal db))
        {
            return da == db;
        }

        if (a.TryGetDouble(out double dda) && b.TryGetDouble(out double ddb))
        {
            return dda == ddb;
        }

        return a.GetRawText() == b.GetRawText();
    }

    // ── Fixture file plumbing ─────────────────────────────────────────────

    private static IEnumerable<string> EnumerateFixtureFiles() =>
        Directory
            .EnumerateFiles(FindFixtureDir(), "*.json")
            .OrderBy(p => p, StringComparer.Ordinal);

    private static string FindFixtureDir()
    {
        string? dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            string candidate = Path.Combine(dir, "types", "test-cases", "round-trips");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            dir = Path.GetDirectoryName(dir.TrimEnd(Path.DirectorySeparatorChar));
        }

        throw new DirectoryNotFoundException(
            "could not locate types/test-cases/round-trips walking upward from the test assembly");
    }
}
