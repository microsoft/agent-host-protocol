// DiscriminantDefaultTests — every generated action record must carry its own
// discriminant, without the caller setting it.
//
// The generator used to emit `public ActionType Type { get; init; }` with no
// initializer. `ActionType` is an ordinary (non-[Flags]) enum, so `default` is its
// FIRST member, `RootAgentsChanged` — a valid value. UnionConverter.Write serializes
// by the runtime type so "every property (including the variant's own discriminator
// field) is written", which means an action built without explicitly setting Type
// went onto the wire tagged `root/agentsChanged`. Silently, and for 95 record types.
//
// Nothing caught it: the suite was green before the fix, and the shared round-trip
// corpus has no fixture for any affected variant. This file is that missing test.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Microsoft.AgentHostProtocol;
using Xunit;

namespace AgentHostProtocol.Tests;

public class DiscriminantDefaultTests
{
    /// <summary>
    /// Action records whose wire value has NO member in <see cref="ActionType"/> at all,
    /// so they cannot express their own discriminant and are excluded below.
    ///
    /// These are the hand-written session actions in the generator's
    /// SESSION_ACTION_TYPES_CS block. They DESERIALIZE correctly — StateActionConverter's
    /// variant map keys on the wire string — but there is no enum member to serialize
    /// back out, so reading one and writing it returns `root/agentsChanged`. That is a
    /// round-trip break, and a worse defect than the missing initializer this file guards.
    ///
    /// It is deliberately NOT fixed here: the repair is either adding these 19 members to
    /// ActionType or moving these records to a plain string discriminant, and that is a
    /// protocol-level call. Tracked upstream; when it is ruled on, delete the entry and
    /// this test starts covering it.
    /// </summary>
    private static readonly HashSet<string> KnownMissingFromActionType = new(StringComparer.Ordinal)
    {
        "SessionTurnStartedAction",
        "SessionDeltaAction",
        "SessionResponsePartAction",
        "SessionToolCallStartAction",
        "SessionToolCallDeltaAction",
        "SessionToolCallReadyAction",
        "SessionToolCallCompleteAction",
        "SessionToolCallResultConfirmedAction",
        "SessionToolCallConfirmedAction",
        "SessionToolCallContentChangedAction",
        "SessionTurnCompleteAction",
        "SessionTurnCancelledAction",
        "SessionErrorAction",
        "SessionUsageAction",
        "SessionReasoningAction",
        "SessionPendingMessageSetAction",
        "SessionPendingMessageRemovedAction",
        "SessionQueuedMessagesReorderedAction",
        "SessionTruncatedAction",
    };

    private static IEnumerable<Type> ActionRecords() =>
        typeof(ActionType).Assembly
            .GetExportedTypes()
            .Where(t => t.IsClass
                        && !t.IsAbstract
                        && t.Name.EndsWith("Action", StringComparison.Ordinal)
                        && t.GetProperty("Type")?.PropertyType == typeof(ActionType))
            .OrderBy(t => t.Name, StringComparer.Ordinal);

    [Fact]
    public void EveryActionRecordDefaultsToItsOwnDiscriminant()
    {
        var wrong = new List<string>();
        var checkedCount = 0;

        foreach (var recordType in ActionRecords())
        {
            if (KnownMissingFromActionType.Contains(recordType.Name)) continue;

            // `RootAgentsChangedAction` -> the `RootAgentsChanged` member of ActionType.
            var memberName = recordType.Name[..^"Action".Length];
            if (!Enum.TryParse(typeof(ActionType), memberName, ignoreCase: false, out var expected))
            {
                wrong.Add($"{recordType.Name}: no ActionType member named '{memberName}' — " +
                          "either the record is misnamed or it belongs in KnownMissingFromActionType");
                continue;
            }

            // `required` is a compile-time constraint, so reflection can build these
            // without supplying the payload we do not care about here.
            var instance = Activator.CreateInstance(recordType)!;
            var actual = recordType.GetProperty("Type")!.GetValue(instance);
            checkedCount++;

            if (!Equals(actual, expected))
            {
                wrong.Add($"{recordType.Name}.Type defaulted to {actual} (wire " +
                          $"'{WireValueOf((ActionType)actual!)}') but should be {expected} " +
                          $"(wire '{WireValueOf((ActionType)expected!)}')");
            }
        }

        Assert.True(checkedCount > 50, $"expected to cover most action records, only saw {checkedCount}");
        Assert.True(
            wrong.Count == 0,
            $"{wrong.Count} action record(s) serialize with the wrong discriminant:\n  " +
            string.Join("\n  ", wrong));
    }

    /// <summary>
    /// Guards the exclusion list itself. If someone adds the missing members to
    /// ActionType, the entry must be removed rather than left to rot — otherwise the
    /// list silently keeps a now-testable record out of coverage.
    /// </summary>
    [Fact]
    public void KnownMissingListDoesNotOutliveTheGapItDocuments()
    {
        var nowResolvable = KnownMissingFromActionType
            .Where(name => Enum.TryParse(typeof(ActionType), name[..^"Action".Length], false, out _))
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();

        Assert.True(
            nowResolvable.Count == 0,
            "ActionType now has members for these, so they are no longer 'known missing' — " +
            "remove them from KnownMissingFromActionType so the test above covers them:\n  " +
            string.Join("\n  ", nowResolvable));
    }

    private static string WireValueOf(ActionType value) =>
        typeof(ActionType).GetField(value.ToString())
            ?.GetCustomAttribute<WireValueAttribute>()?.Value ?? value.ToString();
}
