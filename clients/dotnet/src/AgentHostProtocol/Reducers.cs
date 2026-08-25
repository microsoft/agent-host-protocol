// Pure state reducers — a faithful port of the Go client's reducers.go,
// which in turn mirrors the canonical TypeScript reducers. Each reducer
// mutates the supplied state in place and reports whether it applied.
#nullable enable

using System;
using System.Collections.Generic;
using System.Text.Json;

namespace Microsoft.AgentHostProtocol;

/// <summary>What happened when a reducer was asked to apply an action.</summary>
public enum ReduceOutcome
{
    /// <summary>The action was applied and the state was mutated.</summary>
    Applied,

    /// <summary>The action was recognized but had no effect against this state.</summary>
    NoOp,

    /// <summary>The action targets a different scope (e.g. a session action passed to the root reducer).</summary>
    OutOfScope,
}

/// <summary>
/// Pure reducers for the Agent Host Protocol. <see cref="ApplyToRoot"/>,
/// <see cref="ApplyToSession"/>, <see cref="ApplyToTerminal"/>, and
/// <see cref="ApplyToChangeset"/> apply a <see cref="StateAction"/> to the
/// matching state tree in place.
/// </summary>
public static class Reducers
{
    // ─── Injectable timestamp ──────────────────────────────────────────────

    private static volatile Func<long> s_now = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>
    /// Overrides the function reducers call to stamp <c>summary.modifiedAt</c>.
    /// Useful for tests that need deterministic output. Pass <see langword="null"/>
    /// to restore the default (current Unix time in milliseconds).
    /// </summary>
    public static void SetNowProvider(Func<long>? provider)
    {
        s_now = provider ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    private static long NowMs() => s_now();

    private static string NowIso() =>
        DateTimeOffset.FromUnixTimeMilliseconds(NowMs()).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture);

    // Mirrors Go's `append([]T(nil), src...)`: a null source yields a null
    // result (which serializes as absent / null and is stripped by the
    // conformance harness), a non-null source yields a shallow copy.
    private static List<T>? CopyList<T>(List<T>? src) => src is null ? null : new List<T>(src);

    // ─── Status helpers ────────────────────────────────────────────────────

    // Covers the mutually-exclusive activity bits (bits 0–4) of SessionStatus.
    private const SessionStatus StatusActivityMask = (SessionStatus)((1u << 5) - 1);

    private static SessionStatus WithStatusFlag(SessionStatus status, SessionStatus flag, bool set) =>
        set ? status | flag : status & ~flag;

    // Whether an entry blocks on the *user*.
    //
    // ToolClientExecution is work delegated to a client, not a prompt: the call has
    // already cleared its confirmation gate and is simply running somewhere else.
    // Counting it would report a session as awaiting the user for the entire
    // duration of every client tool call. Mirrors the TS `awaitsUser`.
    private static bool AwaitsUser(SessionInputRequest request) =>
        request.Value is not SessionToolClientExecutionRequest;

    // Reflects the session-level input queue into the activity bits of status.
    // A queue holding any user-blocking entry promotes activity to InputNeeded
    // (which implies InProgress); draining those entries clears the
    // input-needed-specific bit, falling back to InProgress while an already-idle
    // session stays idle. Orthogonal flags (IsRead / IsArchived) are preserved.
    // Mirrors the TS sessionReducer.
    private static SessionStatus WithInputNeededStatus(SessionStatus status, List<SessionInputRequest> inputNeeded)
    {
        if (inputNeeded.Exists(AwaitsUser))
        {
            return (status & ~StatusActivityMask) | SessionStatus.InputNeeded;
        }

        return status & ~(SessionStatus.InputNeeded & ~SessionStatus.InProgress);
    }

    // The stable per-entry id carried by every SessionInputRequest variant (from
    // the shared base). Unknown future kinds are preserved as a raw JsonElement
    // by the union converter — read the id structurally so forward-compat entries
    // still upsert/remove correctly.
    private static string SessionInputRequestId(SessionInputRequest req) => req.Value switch
    {
        SessionChatInputRequest v => v.Id,
        SessionToolConfirmationRequest v => v.Id,
        SessionToolClientExecutionRequest v => v.Id,
        SessionToolAuthenticationRequest v => v.Id,
        JsonElement e when e.TryGetProperty("id", out JsonElement id) => id.GetString() ?? string.Empty,
        _ => string.Empty,
    };

    // ─── Tool-call helpers ─────────────────────────────────────────────────

    private readonly record struct ToolCallCommon(
        string Id,
        string Name,
        string DisplayName,
        string? Intention,
        ToolCallContributor? Contributor,
        Dictionary<string, JsonElement>? Meta);

    private static ToolCallCommon ToolCallMeta(ToolCallState tc) => tc.Value switch
    {
        ToolCallStreamingState v => new(v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta),
        ToolCallPendingConfirmationState v => new(v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta),
        ToolCallRunningState v => new(v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta),
        // `auth-required` narrows `contributor` to the MCP variant, so re-wrap it in the
        // union to match the shared shape the other tool call states carry.
        ToolCallAuthRequiredState v => new(v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, new ToolCallContributor(v.Contributor), v.Meta),
        ToolCallPendingResultConfirmationState v => new(v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta),
        ToolCallCompletedState v => new(v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta),
        ToolCallCancelledState v => new(v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta),
        _ => default,
    };

    // Merges a contributor refinement arriving at `ready` into the one established at
    // `start`. Client-execution ownership is fixed at start: a client-owned call keeps
    // its owner unless the refinement names the SAME client, and a call that was not
    // client-owned can never become client-owned late. Any other refinement (e.g. an
    // MCP server finally attributed) wins. Mirrors the canonical
    // `refineToolCallContributor` (types/channels-chat/reducer.ts).
    private static ToolCallContributor? RefineToolCallContributor(
        ToolCallContributor? current,
        ToolCallContributor? next)
    {
        if (next is null)
        {
            return current;
        }

        if (current?.Value is ToolCallClientContributor currentClient)
        {
            if (next.Value is ToolCallClientContributor nextClient && nextClient.ClientId == currentClient.ClientId)
            {
                return next;
            }

            return current;
        }

        if (next.Value is ToolCallClientContributor)
        {
            return current;
        }

        return next;
    }

    private static (StringOrMarkdown Invocation, ToolInput? ToolInput) ToolCallInvocationAndInput(ToolCallState tc) =>
        tc.Value switch
        {
            ToolCallStreamingState v => (v.InvocationMessage ?? new StringOrMarkdown(), null),
            ToolCallPendingConfirmationState v => (v.InvocationMessage, v.ToolInput),
            ToolCallRunningState v => (v.InvocationMessage, v.ToolInput),
            ToolCallAuthRequiredState v => (v.InvocationMessage, v.ToolInput),
            ToolCallPendingResultConfirmationState v => (v.InvocationMessage, v.ToolInput),
            _ => (new StringOrMarkdown(), null),
        };

    private static string ToolCallId(ToolCallState tc) => ToolCallMeta(tc).Id;

    /// <summary>
    /// Returns <c>true</c> if the active turn has any tool call blocking on something
    /// external to the turn itself — a pending confirmation/result-confirmation, or a
    /// tool call paused on MCP authentication.
    /// </summary>
    private static bool HasBlockingToolCall(ChatState state)
    {
        if (state.ActiveTurn is null)
        {
            return false;
        }

        foreach (ResponsePart part in state.ActiveTurn.ResponseParts)
        {
            if (part.Value is not ToolCallResponsePart tc)
            {
                continue;
            }

            if (tc.ToolCall.Value is ToolCallPendingConfirmationState
                or ToolCallPendingResultConfirmationState
                or ToolCallAuthRequiredState)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Returns whether the active turn contains an input request awaiting submission.
    /// </summary>
    private static bool HasOpenInputRequest(ChatState state)
    {
        if (state.ActiveTurn is null)
        {
            return false;
        }

        foreach (ResponsePart part in state.ActiveTurn.ResponseParts)
        {
            if (part.Value is InputRequestResponsePart ir && ir.Response is null)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Locates the unresolved input-request part carrying <paramref name="requestId"/>,
    /// or -1. Parts that already carry a response are skipped, so a resolved request
    /// can never be re-opened by a later action reusing its id.
    /// </summary>
    private static int FindOpenInputRequestPart(List<ResponsePart> responseParts, string requestId)
    {
        for (int i = 0; i < responseParts.Count; i++)
        {
            if (responseParts[i].Value is InputRequestResponsePart ir
                && ir.Response is null
                && ir.Request.Id == requestId)
            {
                return i;
            }
        }

        return -1;
    }

    private static SessionStatus ChatSummaryStatus(ChatState state, SessionStatus? terminal)
    {
        SessionStatus activity;
        if (terminal is not null)
        {
            activity = terminal.Value;
        }
        else if (HasOpenInputRequest(state) || HasBlockingToolCall(state))
        {
            activity = SessionStatus.InputNeeded;
        }
        else if (state.ActiveTurn is not null)
        {
            activity = SessionStatus.InProgress;
        }
        else
        {
            activity = SessionStatus.Idle;
        }

        return (state.Status & ~StatusActivityMask) | activity;
    }

    private static void RefreshChatStatus(ChatState state) =>
        state.Status = ChatSummaryStatus(state, null);

    private static string AddMillisecondsToTimestamp(string timestamp, long milliseconds) =>
        DateTimeOffset.Parse(
                timestamp,
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal)
            .AddMilliseconds(milliseconds)
            .UtcDateTime
            .ToString(
                "yyyy-MM-ddTHH:mm:ss.fffZ",
                System.Globalization.CultureInfo.InvariantCulture);

    // ─── Active-turn helpers ───────────────────────────────────────────────

    private static ReduceOutcome EndTurn(
        ChatState state,
        string turnId,
        TurnState turnState,
        long duration,
        SessionStatus? terminalStatus,
        ErrorResponsePart? errorPart)
    {
        if (state.ActiveTurn is null || state.ActiveTurn.Id != turnId)
        {
            return ReduceOutcome.NoOp;
        }

        ActiveTurn active = state.ActiveTurn;
        state.ActiveTurn = null;

        var parts = new List<ResponsePart>(active.ResponseParts.Count);
        foreach (ResponsePart part in active.ResponseParts)
        {
            if (part.Value is not ToolCallResponsePart tc)
            {
                parts.Add(part);
                continue;
            }

            if (tc.ToolCall.Value is ToolCallCompletedState or ToolCallCancelledState)
            {
                parts.Add(part);
                continue;
            }

            ToolCallCommon common = ToolCallMeta(tc.ToolCall);
            (StringOrMarkdown invocation, ToolInput? toolInput) = ToolCallInvocationAndInput(tc.ToolCall);
            var cancelled = new ToolCallCancelledState
            {
                Status = ToolCallStatus.Cancelled,
                ToolCallId = common.Id,
                ToolName = common.Name,
                DisplayName = common.DisplayName,
                Intention = common.Intention,
                Contributor = common.Contributor,
                Meta = common.Meta,
                InvocationMessage = invocation,
                ToolInput = toolInput,
                Reason = ToolCallCancellationReason.Skipped,
            };
            parts.Add(new ResponsePart(new ToolCallResponsePart
            {
                Kind = ResponsePartKind.ToolCall,
                ToolCall = new ToolCallState(cancelled),
            }));
        }
        if (errorPart is not null)
        {
            parts.Add(new ResponsePart(errorPart));
        }

        var turn = new Turn
        {
            Id = active.Id,
            StartedAt = active.StartedAt,
            // Defensive clamp: the duration is producer-supplied and opaque to this
            // reducer, but a negative value would be nonsensical to display.
            Duration = Math.Max(0, duration),
            Message = active.Message,
            ResponseParts = parts,
            Usage = active.Usage,
            State = turnState,
        };

        state.Turns.Add(turn);
        state.ModifiedAt = AddMillisecondsToTimestamp(active.StartedAt, turn.Duration ?? 0);
        state.Status = ChatSummaryStatus(state, terminalStatus);
        return ReduceOutcome.Applied;
    }

    /// <summary>
    /// Inserts an unresolved input-request part into the active turn, or replaces the
    /// unresolved part carrying the same request id in place. NoOps without an active
    /// turn: the part is turn-scoped, so there is nowhere to put it.
    /// </summary>
    private static ReduceOutcome UpsertChatInputRequestPart(ChatState state, ChatInputRequest req)
    {
        ActiveTurn? activeTurn = state.ActiveTurn;
        if (activeTurn is null)
        {
            return ReduceOutcome.NoOp;
        }

        int found = FindOpenInputRequestPart(activeTurn.ResponseParts, req.Id);
        if (found >= 0)
        {
            // Replacing in place keeps the request's position in the response
            // stream stable. Answer drafts survive a re-request that omits them.
            var existing = (InputRequestResponsePart)activeTurn.ResponseParts[found].Value!;
            if (req.Answers is null && existing.Request.Answers is not null)
            {
                // Carry the surviving drafts on a COPY. `req` is the caller's
                // action object (ChatInputRequestedAction.Request), and
                // ChatInputRequest is a reference type, so assigning to
                // `req.Answers` here would mutate the action itself and alias
                // one answers dictionary across the action and the stored part.
                // Every sibling client is structurally prevented from doing
                // that -- Rust takes the request by move, Go and Swift are
                // value types, TypeScript and Kotlin copy explicitly -- so C#
                // is the only implementation that has to copy by hand.
                req = new ChatInputRequest
                {
                    Id = req.Id,
                    Message = req.Message,
                    Url = req.Url,
                    Questions = req.Questions,
                    Answers = existing.Request.Answers,
                };
            }

            activeTurn.ResponseParts[found] = new ResponsePart(new InputRequestResponsePart
            {
                Kind = ResponsePartKind.InputRequest,
                Request = req,
            });
        }
        else
        {
            activeTurn.ResponseParts.Add(new ResponsePart(new InputRequestResponsePart
            {
                Kind = ResponsePartKind.InputRequest,
                Request = req,
            }));
        }

        state.Status = ChatSummaryStatus(state, null);
        state.Status = WithStatusFlag(state.Status, SessionStatus.IsRead, false);
        return ReduceOutcome.Applied;
    }

    // ─── Customization helpers ─────────────────────────────────────────────

    private static bool TryCustomizationId(Customization c, out string id)
    {
        switch (c.Value)
        {
            case PluginCustomization v:
                id = v.Id;
                return true;
            case DirectoryCustomization v:
                id = v.Id;
                return true;
            default:
                id = string.Empty;
                return false;
        }
    }

    private static bool TryChildCustomizationId(ChildCustomization c, out string id)
    {
        switch (c.Value)
        {
            case AgentCustomization v: id = v.Id; return true;
            case SkillCustomization v: id = v.Id; return true;
            case PromptCustomization v: id = v.Id; return true;
            case RuleCustomization v: id = v.Id; return true;
            case HookCustomization v: id = v.Id; return true;
            case McpServerCustomization v: id = v.Id; return true;
            default: id = string.Empty; return false;
        }
    }

    private static List<ChildCustomization>? ContainerChildren(Customization c) => c.Value switch
    {
        PluginCustomization v => v.Children,
        DirectoryCustomization v => v.Children,
        _ => null,
    };

    private static bool EffectiveEnabled(List<CustomizationEnablement> enablement)
    {
        if (enablement.Count == 0)
        {
            return true;
        }

        return enablement[0].Value switch
        {
            CustomizationEnablementGlobal value => value.Enabled,
            CustomizationEnablementWorkspace value => value.Enabled,
            CustomizationEnablementSession value => value.Enabled,
            _ => true,
        };
    }

    private static ChildCustomization WithChildEnablement(
        ChildCustomization child,
        List<CustomizationEnablement> enablement)
    {
        bool enabled = EffectiveEnabled(enablement);
        switch (child.Value)
        {
            case AgentCustomization v: return new ChildCustomization(v with { Enabled = enabled });
            case SkillCustomization v: return new ChildCustomization(v with { Enabled = enabled });
            case PromptCustomization v: return new ChildCustomization(v with { Enabled = enabled });
            case RuleCustomization v: return new ChildCustomization(v with { Enabled = enabled });
            case HookCustomization v: return new ChildCustomization(v with { Enabled = enabled });
            case McpServerCustomization v:
                v.Enablement = enablement.Count == 0 ? null : CopyList(enablement);
                return child;
            default: return child;
        }
    }

    private static bool ApplyToggle(
        List<Customization> list,
        string id,
        List<CustomizationEnablement> enablement)
    {
        foreach (Customization c in list)
        {
            if (c.Value is McpServerCustomization top && top.Id == id)
            {
                top.Enablement = enablement.Count == 0 ? null : CopyList(enablement);
                return true;
            }

            if (TryCustomizationId(c, out string got) && got == id)
            {
                switch (c.Value)
                {
                    case PluginCustomization plugin:
                        plugin.Enablement = enablement.Count == 0 ? null : CopyList(enablement);
                        break;
                    case DirectoryCustomization directory:
                        directory.Enabled = EffectiveEnabled(enablement);
                        break;
                }
                return true;
            }
        }

        // Otherwise descend into container children and toggle the matched child.
        foreach (Customization c in list)
        {
            List<ChildCustomization>? children = ContainerChildren(c);
            if (children is null)
            {
                continue;
            }

            for (int i = 0; i < children.Count; i++)
            {
                if (TryChildCustomizationId(children[i], out string childGot) && childGot == id)
                {
                    children[i] = WithChildEnablement(children[i], enablement);
                    return true;
                }
            }
        }

        return false;
    }

    // ─── Active-turn mutation helpers ──────────────────────────────────────

    private static ReduceOutcome UpdateToolCall(
        ChatState state,
        string turnId,
        string targetToolCallId,
        Func<ToolCallState, ToolCallState> updater)
    {
        if (state.ActiveTurn is null || state.ActiveTurn.Id != turnId)
        {
            return ReduceOutcome.NoOp;
        }

        List<ResponsePart> parts = state.ActiveTurn.ResponseParts;
        for (int i = 0; i < parts.Count; i++)
        {
            if (parts[i].Value is not ToolCallResponsePart tc)
            {
                continue;
            }

            if (ToolCallId(tc.ToolCall) == targetToolCallId)
            {
                tc.ToolCall = updater(tc.ToolCall);
                return ReduceOutcome.Applied;
            }
        }

        return ReduceOutcome.NoOp;
    }

    private static ReduceOutcome UpdateResponsePart(
        ChatState state,
        string turnId,
        string partId,
        Action<ResponsePart> updater)
    {
        if (state.ActiveTurn is null || state.ActiveTurn.Id != turnId)
        {
            return ReduceOutcome.NoOp;
        }

        foreach (ResponsePart part in state.ActiveTurn.ResponseParts)
        {
            string id = part.Value switch
            {
                ToolCallResponsePart v => ToolCallId(v.ToolCall),
                MarkdownResponsePart v => v.Id,
                ReasoningResponsePart v => v.Id,
                _ => string.Empty,
            };

            if (id.Length > 0 && id == partId)
            {
                updater(part);
                return ReduceOutcome.Applied;
            }
        }

        return ReduceOutcome.NoOp;
    }

    // ─── Root Reducer ──────────────────────────────────────────────────────

    /// <summary>
    /// Applies <paramref name="action"/> to the <see cref="RootState"/> in place.
    /// Returns <see cref="ReduceOutcome.OutOfScope"/> for actions that target a
    /// different state tree.
    /// </summary>
    public static ReduceOutcome ApplyToRoot(RootState state, StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));
        switch (action.Value)
        {
            case RootAgentsChangedAction a:
                state.Agents = CopyList(a.Agents)!;
                return ReduceOutcome.Applied;
            case RootActiveSessionsChangedAction a:
                state.ActiveSessions = a.ActiveSessions;
                return ReduceOutcome.Applied;
            case RootTerminalsChangedAction a:
                state.Terminals = CopyList(a.Terminals)!;
                return ReduceOutcome.Applied;
            case RootConfigChangedAction a:
                if (state.Config is null)
                {
                    return ReduceOutcome.NoOp;
                }

                state.Config.Values = MergeConfig(state.Config.Values, a.Config, a.Replace);
                return ReduceOutcome.Applied;
        }

        return ReduceOutcome.OutOfScope;
    }

    // Shared config merge for the root and session `configChanged` actions:
    // when `replace` is set (or no values exist yet) start fresh, otherwise
    // mutate the existing map in place; then overlay the incoming entries.
    private static Dictionary<string, JsonElement> MergeConfig(
        Dictionary<string, JsonElement>? current,
        Dictionary<string, JsonElement> incoming,
        bool? replace)
    {
        Dictionary<string, JsonElement> values = replace == true || current is null
            ? new Dictionary<string, JsonElement>(incoming.Count)
            : current;

        foreach (KeyValuePair<string, JsonElement> kv in incoming)
        {
            values[kv.Key] = kv.Value;
        }

        return values;
    }

    // ─── Session Reducer ───────────────────────────────────────────────────

    /// <summary>
    /// Applies <paramref name="action"/> to the <see cref="SessionState"/> in
    /// place. Returns <see cref="ReduceOutcome.OutOfScope"/> for actions that
    /// target a different state tree.
    /// </summary>
    public static ReduceOutcome ApplyToSession(SessionState state, StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));
        switch (action.Value)
        {
            case SessionReadyAction:
                state.Lifecycle = SessionLifecycle.Ready;
                return ReduceOutcome.Applied;
            case SessionCreationFailedAction a:
                state.Lifecycle = SessionLifecycle.Failed;
                state.CreationError = a.Error;
                return ReduceOutcome.Applied;
            case SessionTitleChangedAction a:
                state.Title = a.Title;
                return ReduceOutcome.Applied;
            case SessionIsReadChangedAction a:
                state.Status = WithStatusFlag(state.Status, SessionStatus.IsRead, a.IsRead);
                return ReduceOutcome.Applied;
            case SessionIsArchivedChangedAction a:
                state.Status = WithStatusFlag(state.Status, SessionStatus.IsArchived, a.IsArchived);
                return ReduceOutcome.Applied;
            case SessionActivityChangedAction a:
                state.Activity = a.Activity;
                return ReduceOutcome.Applied;
            case SessionChangesetsChangedAction a:
                state.Changesets = CopyList(a.Changesets);
                return ReduceOutcome.Applied;
            case SessionConfigChangedAction a:
                if (state.Config is null)
                {
                    return ReduceOutcome.NoOp;
                }

                state.Config.Values = MergeConfig(state.Config.Values, a.Config, a.Replace);
                return ReduceOutcome.Applied;
            case SessionMetaChangedAction a:
                state.Meta = a.Meta;
                return ReduceOutcome.Applied;
            case SessionServerToolsChangedAction a:
                state.ServerTools = CopyList(a.Tools)!;
                return ReduceOutcome.Applied;
            case SessionActiveClientSetAction a:
                {
                    // Upsert keyed by clientId: replace the existing entry with the
                    // same clientId, otherwise append. Mirrors the TS reducer.
                    int idx = state.ActiveClients.FindIndex(c => c.ClientId == a.ActiveClient.ClientId);
                    if (idx < 0)
                    {
                        state.ActiveClients.Add(a.ActiveClient);
                    }
                    else
                    {
                        state.ActiveClients[idx] = a.ActiveClient;
                    }

                    return ReduceOutcome.Applied;
                }
            case SessionActiveClientRemovedAction a:
                {
                    // Remove the entry matching clientId; no-op when none matches.
                    int idx = state.ActiveClients.FindIndex(c => c.ClientId == a.ClientId);
                    if (idx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.ActiveClients.RemoveAt(idx);
                    return ReduceOutcome.Applied;
                }
            case SessionWorkingDirectorySetAction a:
                {
                    // Membership keyed by the directory URI: append when the set does
                    // not already contain it (creating the set if absent), no-op when
                    // it is already present. Mirrors the TS reducer.
                    if (state.WorkingDirectories is not null && state.WorkingDirectories.Contains(a.Directory))
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.WorkingDirectories ??= new List<string>();
                    state.WorkingDirectories.Add(a.Directory);
                    return ReduceOutcome.Applied;
                }
            case SessionWorkingDirectoryRemovedAction a:
                {
                    // Removes the directory from the set; no-op when the set is absent
                    // or does not contain it. Idempotent, mirroring the TS reducer —
                    // an emptied set stays present as an empty list.
                    if (state.WorkingDirectories is null)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    int wdIdx = state.WorkingDirectories.IndexOf(a.Directory);
                    if (wdIdx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.WorkingDirectories.RemoveAt(wdIdx);
                    return ReduceOutcome.Applied;
                }
            case SessionWorkingDirectoryReplacedAction a:
                {
                    if (state.WorkingDirectories is null)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    int index = state.WorkingDirectories.IndexOf(a.Directory);
                    if (index < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    int replacementIndex = state.WorkingDirectories.IndexOf(a.Replacement);
                    if (replacementIndex >= 0 && replacementIndex < index)
                    {
                        state.WorkingDirectories.RemoveAt(index);
                        return ReduceOutcome.Applied;
                    }

                    state.WorkingDirectories[index] = a.Replacement;
                    for (int i = state.WorkingDirectories.Count - 1; i >= 0; i--)
                    {
                        if (i != index && state.WorkingDirectories[i] == a.Replacement)
                        {
                            state.WorkingDirectories.RemoveAt(i);
                        }
                    }

                    return ReduceOutcome.Applied;
                }
            case SessionInputNeededSetAction a:
                {
                    // Upsert keyed by request id: replace the entry with the same id,
                    // otherwise append. A non-empty queue promotes the session
                    // activity to InputNeeded. Mirrors the TS reducer.
                    string reqId = SessionInputRequestId(a.Request);
                    state.InputNeeded ??= new List<SessionInputRequest>();
                    int idx = state.InputNeeded.FindIndex(r => SessionInputRequestId(r) == reqId);
                    if (idx < 0)
                    {
                        state.InputNeeded.Add(a.Request);
                    }
                    else
                    {
                        state.InputNeeded[idx] = a.Request;
                    }

                    state.Status = WithInputNeededStatus(state.Status, state.InputNeeded);
                    return ReduceOutcome.Applied;
                }
            case SessionInputNeededRemovedAction a:
                {
                    // Remove the entry matching id; no-op when the queue is absent or
                    // no entry matches. Clears the input-needed activity bit once the
                    // queue empties, and drops the list to absent. Mirrors the TS reducer.
                    if (state.InputNeeded is null)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    int idx = state.InputNeeded.FindIndex(r => SessionInputRequestId(r) == a.Id);
                    if (idx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.InputNeeded.RemoveAt(idx);
                    state.Status = WithInputNeededStatus(state.Status, state.InputNeeded);
                    if (state.InputNeeded.Count == 0)
                    {
                        state.InputNeeded = null;
                    }

                    return ReduceOutcome.Applied;
                }
            case SessionCustomizationsChangedAction a:
                state.Customizations = CopyList(a.Customizations);
                return ReduceOutcome.Applied;
            case SessionCustomizationToggledAction a:
                if (state.Customizations is null)
                {
                    return ReduceOutcome.NoOp;
                }

                return ApplyToggle(state.Customizations, a.Id, a.Enablement)
                    ? ReduceOutcome.Applied
                    : ReduceOutcome.NoOp;
            case SessionCustomizationUpdatedAction a:
                return ApplyCustomizationUpdated(state, a);
            case SessionCustomizationRemovedAction a:
                return ApplyCustomizationRemoved(state, a);
            case SessionMcpServerStateChangedAction a:
                return ApplyMcpServerStateChanged(state, a);
            case SessionMcpServerStartRequestedAction a:
                return UpdateMcpServerCustomization(state, a.Id, mcp =>
                {
                    mcp.State = new McpServerState(new McpServerStartingState { Kind = McpServerStatus.Starting });
                    mcp.Channel = null;
                });
            case SessionMcpServerStopRequestedAction a:
                return UpdateMcpServerCustomization(state, a.Id, mcp =>
                {
                    mcp.State = new McpServerState(new McpServerStoppedState { Kind = McpServerStatus.Stopped });
                    mcp.Channel = null;
                });
            case SessionChatAddedAction a:
                return ApplySessionChatAdded(state, a);
            case SessionChatRemovedAction a:
                return ApplySessionChatRemoved(state, a);
            case SessionChatUpdatedAction a:
                return ApplySessionChatUpdated(state, a);
            case SessionDefaultChatChangedAction a:
                state.DefaultChat = a.DefaultChat;
                return ReduceOutcome.Applied;
        }

        return ReduceOutcome.OutOfScope;
    }

    // ─── Chat-channel reducer ──────────────────────────────────────────────

    /// <summary>
    /// Applies <paramref name="action"/> to the <see cref="ChatState"/> in
    /// place. Returns <see cref="ReduceOutcome.OutOfScope"/> for actions that
    /// target a different state tree.
    /// </summary>
    public static ReduceOutcome ApplyToChat(ChatState state, StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));
        switch (action.Value)
        {
            case ChatTurnStartedAction a:
                return ApplyChatTurnStarted(state, a);
            case ChatDeltaAction a:
                return UpdateResponsePart(state, a.TurnId, a.PartId, p =>
                {
                    if (p.Value is MarkdownResponsePart m)
                    {
                        m.Content += a.Content;
                    }
                });
            case ChatResponsePartAction a:
                if (state.ActiveTurn is null || state.ActiveTurn.Id != a.TurnId)
                {
                    return ReduceOutcome.NoOp;
                }
                if (a.Part.Value is ErrorResponsePart)
                {
                    return ReduceOutcome.NoOp;
                }

                state.ActiveTurn.ResponseParts.Add(a.Part);
                return ReduceOutcome.Applied;
            case ChatTurnCompleteAction a:
                return EndTurn(state, a.TurnId, TurnState.Complete, a.Duration, null, null);
            case ChatTurnCancelledAction a:
                return EndTurn(state, a.TurnId, TurnState.Cancelled, a.Duration, null, null);
            case ChatErrorAction a:
                return EndTurn(state, a.TurnId, TurnState.Error, a.Duration, SessionStatus.Error, a.Part);
            case ChatTurnResumeAction a:
                if (state.ActiveTurn is not null || state.Turns.Count == 0)
                {
                    return ReduceOutcome.NoOp;
                }

                Turn resumableTurn = state.Turns[state.Turns.Count - 1];
                if (resumableTurn.Id != a.TurnId
                    || resumableTurn.State != TurnState.Error
                    || resumableTurn.ResponseParts.Count == 0
                    || resumableTurn.ResponseParts[resumableTurn.ResponseParts.Count - 1].Value is not ErrorResponsePart { Resumable: true })
                {
                    return ReduceOutcome.NoOp;
                }

                state.Turns.RemoveAt(state.Turns.Count - 1);
                state.ActiveTurn = new ActiveTurn
                {
                    Id = resumableTurn.Id,
                    StartedAt = resumableTurn.StartedAt ?? state.ModifiedAt,
                    Message = resumableTurn.Message,
                    ResponseParts = resumableTurn.ResponseParts,
                    Usage = resumableTurn.Usage,
                };
                state.Status = WithStatusFlag(ChatSummaryStatus(state, null), SessionStatus.IsRead, false);
                return ReduceOutcome.Applied;
            case ChatActivityChangedAction a:
                state.Activity = a.Activity;
                return ReduceOutcome.Applied;
            case ChatWorkingDirectorySetAction a:
                {
                    // Membership keyed by the directory URI, over this chat's subset of
                    // the session's set: append when absent (creating the subset if
                    // needed), no-op when already present. Mirrors the TS reducer.
                    if (state.WorkingDirectories is not null && state.WorkingDirectories.Contains(a.Directory))
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.WorkingDirectories ??= new List<string>();
                    state.WorkingDirectories.Add(a.Directory);
                    return ReduceOutcome.Applied;
                }
            case ChatWorkingDirectoryRemovedAction a:
                {
                    // Removes the directory from this chat's subset only — the session's
                    // set is unaffected. No-op when the subset is absent or does not
                    // contain it. Idempotent, mirroring the TS reducer.
                    if (state.WorkingDirectories is null)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    int wdIdx = state.WorkingDirectories.IndexOf(a.Directory);
                    if (wdIdx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.WorkingDirectories.RemoveAt(wdIdx);
                    return ReduceOutcome.Applied;
                }
            case ChatToolCallStartAction a:
                if (state.ActiveTurn is null || state.ActiveTurn.Id != a.TurnId)
                {
                    return ReduceOutcome.NoOp;
                }

                state.ActiveTurn.ResponseParts.Add(new ResponsePart(new ToolCallResponsePart
                {
                    Kind = ResponsePartKind.ToolCall,
                    ToolCall = new ToolCallState(new ToolCallStreamingState
                    {
                        Status = ToolCallStatus.Streaming,
                        ToolCallId = a.ToolCallId,
                        ToolName = a.ToolName,
                        DisplayName = a.DisplayName,
                        Intention = a.Intention,
                        Contributor = a.Contributor,
                        Meta = a.Meta,
                    }),
                }));
                return ReduceOutcome.Applied;
            case ChatToolCallDeltaAction a:
                return ApplyChatToolCallDelta(state, a);
            case ChatToolCallReadyAction a:
                return WithChatRefresh(state, ApplyChatToolCallReady(state, a));
            case ChatToolCallConfirmedAction a:
                return WithChatRefresh(state, ApplyChatToolCallConfirmed(state, a));
            case ChatToolCallCompleteAction a:
                return WithChatRefresh(state, ApplyChatToolCallComplete(state, a));
            case ChatToolCallResultConfirmedAction a:
                return WithChatRefresh(state, ApplyChatToolCallResultConfirmed(state, a));
            case ChatToolCallAuthRequiredAction a:
                return WithChatRefresh(state, ApplyChatToolCallAuthRequired(state, a));
            case ChatToolCallAuthResolvedAction a:
                return WithChatRefresh(state, ApplyChatToolCallAuthResolved(state, a));
            case ChatToolCallContentChangedAction a:
                return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
                {
                    if (tc.Value is ToolCallRunningState r)
                    {
                        if (a.Meta is not null)
                        {
                            r.Meta = a.Meta;
                        }

                        r.Content = CopyList(a.Content)!;
                    }

                    return tc;
                });
            case ChatUsageAction a:
                if (state.ActiveTurn is null || state.ActiveTurn.Id != a.TurnId)
                {
                    return ReduceOutcome.NoOp;
                }

                state.ActiveTurn.Usage = a.Usage;
                return ReduceOutcome.Applied;
            case ChatReasoningAction a:
                return UpdateResponsePart(state, a.TurnId, a.PartId, p =>
                {
                    if (p.Value is ReasoningResponsePart r)
                    {
                        r.Content += a.Content;
                    }
                });
            case ChatTruncatedAction a:
                return ApplyChatTruncated(state, a.TurnId);
            case ChatTurnsLoadedAction a:
                return ApplyChatTurnsLoaded(state, a);
            case ChatInputRequestedAction a:
                return UpsertChatInputRequestPart(state, a.Request);
            case ChatInputAnswerChangedAction a:
                return ApplyChatInputAnswerChanged(state, a);
            case ChatInputCompletedAction a:
                return ApplyChatInputCompleted(state, a);
            case ChatPendingMessageSetAction a:
                return ApplyChatPendingMessageSet(state, a);
            case ChatPendingMessageRemovedAction a:
                return ApplyChatPendingMessageRemoved(state, a);
            case ChatQueuedMessagesReorderedAction a:
                return ApplyChatQueuedMessagesReordered(state, a);
            case ChatDraftChangedAction a:
                state.Draft = a.Draft;
                return ReduceOutcome.Applied;
        }

        return ReduceOutcome.OutOfScope;
    }

    private static ReduceOutcome WithChatRefresh(ChatState state, ReduceOutcome outcome)
    {
        if (outcome == ReduceOutcome.Applied)
        {
            RefreshChatStatus(state);
        }

        return outcome;
    }

    private static ReduceOutcome ApplyChatTurnStarted(ChatState state, ChatTurnStartedAction a)
    {
        state.ActiveTurn = new ActiveTurn
        {
            Id = a.TurnId,
            StartedAt = a.StartedAt,
            Message = a.Message,
            ResponseParts = new List<ResponsePart>(),
        };
        state.Status = ChatSummaryStatus(state, null);
        state.ModifiedAt = a.StartedAt;
        state.Status = WithStatusFlag(state.Status, SessionStatus.IsRead, false);

        if (a.QueuedMessageId is { } qmid)
        {
            if (state.SteeringMessage is not null && state.SteeringMessage.Id == qmid)
            {
                state.SteeringMessage = null;
            }

            if (state.QueuedMessages is not null)
            {
                state.QueuedMessages.RemoveAll(m => m.Id == qmid);
                if (state.QueuedMessages.Count == 0)
                {
                    state.QueuedMessages = null;
                }
            }
        }

        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyChatToolCallDelta(ChatState state, ChatToolCallDeltaAction a)
    {
        return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
        {
            if (tc.Value is not ToolCallStreamingState s)
            {
                return tc;
            }

            // `content` is optional: a delta may carry only an invocation-message or
            // `_meta` refresh. Appending unconditionally would materialize an empty
            // `partialInput` on a call that never streamed any input.
            if (a.Content is not null)
            {
                s.PartialInput = (s.PartialInput ?? string.Empty) + a.Content;
            }
            if (a.Meta is not null)
            {
                s.Meta = a.Meta;
            }

            if (a.InvocationMessage is not null)
            {
                s.InvocationMessage = a.InvocationMessage;
            }

            return tc;
        });
    }

    private static ReduceOutcome ApplyChatToolCallReady(ChatState state, ChatToolCallReadyAction a)
    {
        return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
        {
            ToolCallCommon common = ToolCallMeta(tc);
            if (a.Meta is not null)
            {
                common = common with { Meta = a.Meta };
            }

            if (tc.Value is ToolCallStreamingState or ToolCallRunningState or ToolCallPendingConfirmationState)
            {
                // A host may finalize the intention and the MCP/server attribution at
                // `ready`, but client-execution ownership is established at `start` and
                // survives. Mirrors the canonical `refineToolCallContributor`.
                common = common with
                {
                    Contributor = RefineToolCallContributor(common.Contributor, a.Contributor),
                    Intention = a.Intention ?? common.Intention,
                };

                // The final tool input may arrive at `ready` (possibly as a content
                // reference to be fetched lazily). When the action omits it, keep what
                // the call already carries — except from `streaming`, where the only
                // input so far was the partial stream, not a settled value.
                ToolInput? readyToolInput = a.ToolInput
                    ?? (tc.Value is ToolCallStreamingState ? null : ToolCallInvocationAndInput(tc).ToolInput);

                if (a.Confirmed is not null)
                {
                    return new ToolCallState(new ToolCallRunningState
                    {
                        Status = ToolCallStatus.Running,
                        ToolCallId = common.Id,
                        ToolName = common.Name,
                        DisplayName = common.DisplayName,
                        Intention = common.Intention,
                        Contributor = common.Contributor,
                        Meta = common.Meta,
                        InvocationMessage = a.InvocationMessage,
                        ToolInput = readyToolInput,
                        Confirmed = a.Confirmed.Value,
                    });
                }

                // A re-`ready` of an already-pending tool call carries the model
                // judge's asynchronous risk assessment once it resolves. Such a
                // follow-up only restates the fields it means to change, so an
                // omitted field falls back to the pending state's current value
                // rather than being cleared.
                ToolCallPendingConfirmationState? pending = tc.Value as ToolCallPendingConfirmationState;

                return new ToolCallState(new ToolCallPendingConfirmationState
                {
                    Status = ToolCallStatus.PendingConfirmation,
                    ToolCallId = common.Id,
                    ToolName = common.Name,
                    DisplayName = common.DisplayName,
                    Intention = common.Intention,
                    Contributor = common.Contributor,
                    Meta = common.Meta,
                    InvocationMessage = a.InvocationMessage,
                    ToolInput = readyToolInput,
                    ConfirmationTitle = a.ConfirmationTitle ?? pending?.ConfirmationTitle,
                    RiskAssessment = a.RiskAssessment ?? pending?.RiskAssessment,
                    Edits = a.Edits ?? pending?.Edits,
                    Editable = a.Editable ?? pending?.Editable,
                    Options = a.Options ?? pending?.Options,
                });
            }

            return tc;
        });
    }

    private static ConfirmationOption? ResolveSelectedOption(List<ConfirmationOption>? options, string? id)
    {
        if (id is null || options is null)
        {
            return null;
        }

        foreach (ConfirmationOption opt in options)
        {
            if (opt.Id == id)
            {
                return opt;
            }
        }

        return null;
    }

    private static ReduceOutcome ApplyChatToolCallConfirmed(ChatState state, ChatToolCallConfirmedAction a)
    {
        return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
        {
            if (tc.Value is not ToolCallPendingConfirmationState s)
            {
                return tc;
            }

            ConfirmationOption? selected = ResolveSelectedOption(s.Options, a.SelectedOptionId);
            if (a.Meta is not null)
            {
                s = s with { Meta = a.Meta };
            }

            if (a.Approved)
            {
                // An edited tool input only overrides an INLINE input. When the original
                // was sent by content reference (or was absent), the edit is ignored here
                // and the reference is preserved — the host replaces the resource contents
                // before echoing the accepted action. Mirrors the canonical reducer's
                // `action.editedToolInput !== undefined && typeof tc.toolInput === 'string'`
                // (types/channels-chat/reducer.ts).
                ToolInput? toolInput = a.EditedToolInput is not null && s.ToolInput?.Inline is not null
                    ? new ToolInput { Inline = a.EditedToolInput }
                    : s.ToolInput;
                ToolCallConfirmationReason confirmed = a.Confirmed ?? ToolCallConfirmationReason.NotNeeded;
                return new ToolCallState(new ToolCallRunningState
                {
                    Status = ToolCallStatus.Running,
                    ToolCallId = s.ToolCallId,
                    ToolName = s.ToolName,
                    DisplayName = s.DisplayName,
                    Intention = s.Intention,
                    Contributor = s.Contributor,
                    Meta = s.Meta,
                    InvocationMessage = s.InvocationMessage,
                    ToolInput = toolInput,
                    Confirmed = confirmed,
                    SelectedOption = selected,
                });
            }

            ToolCallCancellationReason reason = a.Reason ?? ToolCallCancellationReason.Denied;
            return new ToolCallState(new ToolCallCancelledState
            {
                Status = ToolCallStatus.Cancelled,
                ToolCallId = s.ToolCallId,
                ToolName = s.ToolName,
                DisplayName = s.DisplayName,
                Intention = s.Intention,
                Contributor = s.Contributor,
                Meta = s.Meta,
                InvocationMessage = s.InvocationMessage,
                ToolInput = s.ToolInput,
                Reason = reason,
                ReasonMessage = a.ReasonMessage,
                UserSuggestion = a.UserSuggestion,
                SelectedOption = selected,
            });
        });
    }

    private static ReduceOutcome ApplyChatToolCallComplete(ChatState state, ChatToolCallCompleteAction a)
    {
        return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
        {
            ToolCallCommon common = ToolCallMeta(tc);
            if (a.Meta is not null)
            {
                common = common with { Meta = a.Meta };
            }

            StringOrMarkdown invocation;
            ToolInput? toolInput;
            ToolCallConfirmationReason confirmed = ToolCallConfirmationReason.NotNeeded;
            ConfirmationOption? selectedOption = null;
            List<ToolResultContent>? preAuthContent = null;
            bool fromAuthRequired = false;

            switch (tc.Value)
            {
                case ToolCallRunningState v:
                    invocation = v.InvocationMessage;
                    toolInput = v.ToolInput;
                    confirmed = v.Confirmed;
                    selectedOption = v.SelectedOption;
                    break;
                case ToolCallPendingConfirmationState v:
                    invocation = v.InvocationMessage;
                    toolInput = v.ToolInput;
                    break;
                case ToolCallAuthRequiredState v:
                    // A tool call in `auth-required` can only be completed with a failed
                    // result — that's the client cancelling the invocation instead of
                    // resolving the pending MCP authentication challenge. A *successful*
                    // completion from `auth-required` is invalid: execution never resumed
                    // after the challenge, so there's nothing that could have produced a
                    // real result. Ignore it, leaving the tool call in `auth-required`; the
                    // client must resolve the auth challenge (`chat/toolCallAuthResolved`)
                    // before completing successfully.
                    if (a.Result.Success)
                    {
                        return tc;
                    }

                    invocation = v.InvocationMessage;
                    toolInput = v.ToolInput;
                    confirmed = v.Confirmed;
                    selectedOption = v.SelectedOption;
                    // Preserve any partial content produced before the call paused for
                    // auth — a client cancelling from `auth-required` without
                    // authenticating never resumes execution, so this is the only content
                    // the tool ever produced unless `a.Result` overrides it.
                    preAuthContent = v.Content;
                    fromAuthRequired = true;
                    break;
                default:
                    return tc;
            }

            // Cancelling from `auth-required` always completes terminally: the pending auth
            // challenge isn't a "pending result" the client can review, so
            // `requiresResultConfirmation` is ignored for this path — it must never enter
            // `pending-result-confirmation`.
            bool requiresResultConfirmation = a.RequiresResultConfirmation == true && !fromAuthRequired;
            if (requiresResultConfirmation)
            {
                return new ToolCallState(new ToolCallPendingResultConfirmationState
                {
                    Status = ToolCallStatus.PendingResultConfirmation,
                    ToolCallId = common.Id,
                    ToolName = common.Name,
                    DisplayName = common.DisplayName,
                    Intention = common.Intention,
                    Contributor = common.Contributor,
                    Meta = common.Meta,
                    InvocationMessage = invocation,
                    ToolInput = toolInput,
                    Success = a.Result.Success,
                    PastTenseMessage = a.Result.PastTenseMessage,
                    Content = CopyList(a.Result.Content)!,
                    StructuredContent = a.Result.StructuredContent,
                    Error = a.Result.Error,
                    Confirmed = confirmed,
                    SelectedOption = selectedOption,
                });
            }

            return new ToolCallState(new ToolCallCompletedState
            {
                Status = ToolCallStatus.Completed,
                ToolCallId = common.Id,
                ToolName = common.Name,
                DisplayName = common.DisplayName,
                Intention = common.Intention,
                Contributor = common.Contributor,
                Meta = common.Meta,
                InvocationMessage = invocation,
                ToolInput = toolInput,
                Success = a.Result.Success,
                PastTenseMessage = a.Result.PastTenseMessage,
                Content = CopyList(a.Result.Content) ?? CopyList(preAuthContent),
                StructuredContent = a.Result.StructuredContent,
                Error = a.Result.Error,
                Confirmed = confirmed,
                SelectedOption = selectedOption,
            });
        });
    }

    private static ReduceOutcome ApplyChatToolCallAuthRequired(ChatState state, ChatToolCallAuthRequiredAction a)
    {
        return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
        {
            if (tc.Value is not ToolCallRunningState running)
            {
                return tc;
            }

            // Invariant: auth-required only applies to MCP-contributed tool calls.
            if (running.Contributor?.Value is not ToolCallMcpContributor mcp)
            {
                return tc;
            }

            ToolCallCommon common = ToolCallMeta(tc);
            if (a.Meta is not null)
            {
                common = common with { Meta = a.Meta };
            }

            return new ToolCallState(new ToolCallAuthRequiredState
            {
                Status = ToolCallStatus.AuthRequired,
                ToolCallId = common.Id,
                ToolName = common.Name,
                DisplayName = common.DisplayName,
                Intention = common.Intention,
                Contributor = mcp,
                Meta = common.Meta,
                InvocationMessage = running.InvocationMessage,
                ToolInput = running.ToolInput,
                Confirmed = running.Confirmed,
                SelectedOption = running.SelectedOption,
                Content = CopyList(running.Content),
                Auth = a.Auth,
            });
        });
    }

    private static ReduceOutcome ApplyChatToolCallAuthResolved(ChatState state, ChatToolCallAuthResolvedAction a)
    {
        return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
        {
            if (tc.Value is not ToolCallAuthRequiredState authRequired)
            {
                return tc;
            }

            ToolCallCommon common = ToolCallMeta(tc);
            if (a.Meta is not null)
            {
                common = common with { Meta = a.Meta };
            }

            return new ToolCallState(new ToolCallRunningState
            {
                Status = ToolCallStatus.Running,
                ToolCallId = common.Id,
                ToolName = common.Name,
                DisplayName = common.DisplayName,
                Intention = common.Intention,
                Contributor = common.Contributor,
                Meta = common.Meta,
                InvocationMessage = authRequired.InvocationMessage,
                ToolInput = authRequired.ToolInput,
                Confirmed = authRequired.Confirmed,
                SelectedOption = authRequired.SelectedOption,
                Content = CopyList(authRequired.Content),
            });
        });
    }

    private static ReduceOutcome ApplyChatToolCallResultConfirmed(ChatState state, ChatToolCallResultConfirmedAction a)
    {
        return UpdateToolCall(state, a.TurnId, a.ToolCallId, tc =>
        {
            if (tc.Value is not ToolCallPendingResultConfirmationState s)
            {
                return tc;
            }

            if (a.Meta is not null)
            {
                s = s with { Meta = a.Meta };
            }

            if (a.Approved)
            {
                return new ToolCallState(new ToolCallCompletedState
                {
                    Status = ToolCallStatus.Completed,
                    ToolCallId = s.ToolCallId,
                    ToolName = s.ToolName,
                    DisplayName = s.DisplayName,
                    Intention = s.Intention,
                    Contributor = s.Contributor,
                    Meta = s.Meta,
                    InvocationMessage = s.InvocationMessage,
                    ToolInput = s.ToolInput,
                    Success = s.Success,
                    PastTenseMessage = s.PastTenseMessage,
                    Content = s.Content,
                    StructuredContent = s.StructuredContent,
                    Error = s.Error,
                    Confirmed = s.Confirmed,
                    SelectedOption = s.SelectedOption,
                });
            }

            return new ToolCallState(new ToolCallCancelledState
            {
                Status = ToolCallStatus.Cancelled,
                ToolCallId = s.ToolCallId,
                ToolName = s.ToolName,
                DisplayName = s.DisplayName,
                Intention = s.Intention,
                Contributor = s.Contributor,
                Meta = s.Meta,
                InvocationMessage = s.InvocationMessage,
                ToolInput = s.ToolInput,
                Reason = ToolCallCancellationReason.ResultDenied,
                SelectedOption = s.SelectedOption,
            });
        });
    }

    private static ReduceOutcome ApplyChatTruncated(ChatState state, string? turnId)
    {
        if (turnId is null)
        {
            state.Turns = new List<Turn>();
            // Truncating all turns discards any tail-window cursor: the state
            // now holds every retained turn, so there is nothing older to page.
            state.TurnsNextCursor = null;
        }
        else
        {
            int idx = state.Turns.FindIndex(t => t.Id == turnId);
            if (idx < 0)
            {
                return ReduceOutcome.NoOp;
            }

            state.Turns = state.Turns.GetRange(0, idx + 1);
        }

        state.ActiveTurn = null;
        state.Status = ChatSummaryStatus(state, null);
        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyChatTurnsLoaded(ChatState state, ChatTurnsLoadedAction a)
    {
        // Loads older completed turns into the tail window. Incoming turns are
        // ordered oldest-first and prepended ahead of the currently loaded
        // turns; any that duplicate an already-loaded turn id are dropped.
        // `turnsNextCursor` replaces the state's cursor (absent when all
        // retained turns are now loaded).
        var existingIds = new HashSet<string>();
        foreach (Turn turn in state.Turns)
        {
            existingIds.Add(turn.Id);
        }

        var merged = new List<Turn>(a.Turns.Count + state.Turns.Count);
        foreach (Turn turn in a.Turns)
        {
            if (!existingIds.Contains(turn.Id))
            {
                merged.Add(turn);
            }
        }

        merged.AddRange(state.Turns);
        state.Turns = merged;
        state.TurnsNextCursor = a.TurnsNextCursor;
        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyChatInputAnswerChanged(ChatState state, ChatInputAnswerChangedAction a)
    {
        ActiveTurn? activeTurn = state.ActiveTurn;
        if (activeTurn is null)
        {
            return ReduceOutcome.NoOp;
        }

        int idx = FindOpenInputRequestPart(activeTurn.ResponseParts, a.RequestId);
        if (idx < 0)
        {
            return ReduceOutcome.NoOp;
        }

        // The part is a write-once record, but the request it carries is mutable
        // state: editing the draft answers in place leaves the part — and its
        // stream position — untouched.
        ChatInputRequest req = ((InputRequestResponsePart)activeTurn.ResponseParts[idx].Value!).Request;
        req.Answers ??= new Dictionary<string, ChatInputAnswer>();
        if (a.Answer is null)
        {
            req.Answers.Remove(a.QuestionId);
        }
        else
        {
            req.Answers[a.QuestionId] = a.Answer;
        }

        if (req.Answers.Count == 0)
        {
            req.Answers = null;
        }

        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyChatInputCompleted(ChatState state, ChatInputCompletedAction a)
    {
        ActiveTurn? activeTurn = state.ActiveTurn;
        if (activeTurn is null)
        {
            return ReduceOutcome.NoOp;
        }

        int idx = FindOpenInputRequestPart(activeTurn.ResponseParts, a.RequestId);
        if (idx < 0)
        {
            return ReduceOutcome.NoOp;
        }

        var part = (InputRequestResponsePart)activeTurn.ResponseParts[idx].Value!;

        // The action's answers override the synced drafts question-by-question;
        // drafts with no override survive.
        var finalAnswers = new Dictionary<string, ChatInputAnswer>(
            part.Request.Answers ?? new Dictionary<string, ChatInputAnswer>());
        if (a.Answers is not null)
        {
            foreach (KeyValuePair<string, ChatInputAnswer> entry in a.Answers)
            {
                finalAnswers[entry.Key] = entry.Value;
            }
        }

        part.Request.Answers = finalAnswers.Count > 0 ? finalAnswers : null;

        // Resolve the part in place rather than appending a new one: its position
        // in the response stream is the position the request was asked at, and
        // stays stable across completion.
        activeTurn.ResponseParts[idx] = new ResponsePart(part with { Response = a.Response });

        RefreshChatStatus(state);
        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyChatPendingMessageSet(ChatState state, ChatPendingMessageSetAction a)
    {
        var entry = new PendingMessage { Id = a.Id, Message = a.Message };
        switch (a.Kind)
        {
            case PendingMessageKind.Steering:
                state.SteeringMessage = entry;
                break;
            case PendingMessageKind.Queued:
                List<PendingMessage> list = state.QueuedMessages ?? new List<PendingMessage>();
                int idx = list.FindIndex(m => m.Id == entry.Id);
                if (idx >= 0)
                {
                    list[idx] = entry;
                }
                else
                {
                    list.Add(entry);
                }

                state.QueuedMessages = list;
                break;
        }

        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyChatPendingMessageRemoved(ChatState state, ChatPendingMessageRemovedAction a)
    {
        switch (a.Kind)
        {
            case PendingMessageKind.Steering:
                if (state.SteeringMessage is not null && state.SteeringMessage.Id == a.Id)
                {
                    state.SteeringMessage = null;
                    return ReduceOutcome.Applied;
                }

                return ReduceOutcome.NoOp;
            case PendingMessageKind.Queued:
                List<PendingMessage>? list = state.QueuedMessages;
                if (list is null)
                {
                    return ReduceOutcome.NoOp;
                }

                int removed = list.RemoveAll(m => m.Id == a.Id);
                if (removed == 0)
                {
                    return ReduceOutcome.NoOp;
                }

                state.QueuedMessages = list.Count == 0 ? null : list;
                return ReduceOutcome.Applied;
        }

        return ReduceOutcome.NoOp;
    }

    private static ReduceOutcome ApplyChatQueuedMessagesReordered(ChatState state, ChatQueuedMessagesReorderedAction a)
    {
        if (state.QueuedMessages is null)
        {
            return ReduceOutcome.NoOp;
        }

        var byId = new Dictionary<string, PendingMessage>(state.QueuedMessages.Count);
        foreach (PendingMessage m in state.QueuedMessages)
        {
            byId[m.Id] = m;
        }

        var reordered = new List<PendingMessage>(byId.Count);
        var seen = new HashSet<string>();
        foreach (string id in a.Order)
        {
            if (byId.TryGetValue(id, out PendingMessage? msg) && seen.Add(id))
            {
                reordered.Add(msg);
            }
        }

        // Append messages absent from `order`, preserving their original order.
        foreach (PendingMessage m in state.QueuedMessages)
        {
            if (!seen.Contains(m.Id))
            {
                reordered.Add(m);
            }
        }

        state.QueuedMessages = reordered;
        return ReduceOutcome.Applied;
    }

    // ─── Session chat catalog helpers ──────────────────────────────────────

    private static ReduceOutcome ApplySessionChatAdded(SessionState state, SessionChatAddedAction a)
    {
        List<ChatSummary> chats = state.Chats;
        int idx = chats.FindIndex(c => c.Resource == a.Summary.Resource);
        if (idx >= 0)
        {
            chats[idx] = a.Summary;
        }
        else
        {
            chats.Add(a.Summary);
        }

        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplySessionChatRemoved(SessionState state, SessionChatRemovedAction a)
    {
        int idx = state.Chats.FindIndex(c => c.Resource == a.Chat);
        if (idx < 0)
        {
            return ReduceOutcome.NoOp;
        }

        state.Chats.RemoveAt(idx);
        if (state.DefaultChat == a.Chat)
        {
            state.DefaultChat = null;
        }

        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplySessionChatUpdated(SessionState state, SessionChatUpdatedAction a)
    {
        int idx = state.Chats.FindIndex(c => c.Resource == a.Chat);
        if (idx < 0)
        {
            return ReduceOutcome.NoOp;
        }

        ChatSummary s = state.Chats[idx];
        PartialChatSummary ch = a.Changes;
        if (ch.Title is not null) { s.Title = ch.Title; }
        if (ch.Status is not null) { s.Status = ch.Status.Value; }
        if (ch.Activity is not null) { s.Activity = ch.Activity; }
        if (ch.ModifiedAt is not null) { s.ModifiedAt = ch.ModifiedAt; }
        if (ch.Origin is not null) { s.Origin = ch.Origin; }
        if (ch.Interactivity is not null) { s.Interactivity = ch.Interactivity; }
        if (ch.WorkingDirectories is not null) { s.WorkingDirectories = ch.WorkingDirectories; }

        // There is no separate primary-directory field to merge: upstream #359
        // removed it, re-expressing the primary as `WorkingDirectories[0]` under
        // `MultipleWorkingDirectoriesCapability.ImmutablePrimary`. The set itself is
        // merged above, as the rust, go, kotlin, and swift clients also do.
        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyCustomizationUpdated(SessionState state, SessionCustomizationUpdatedAction a)
    {
        if (!TryCustomizationId(a.Customization, out string actionId))
        {
            return ReduceOutcome.NoOp;
        }

        List<Customization> list = state.Customizations ?? new List<Customization>();
        int idx = -1;
        for (int i = 0; i < list.Count; i++)
        {
            if (TryCustomizationId(list[i], out string got) && got == actionId)
            {
                idx = i;
                break;
            }
        }

        if (idx >= 0)
        {
            list[idx] = a.Customization;
        }
        else
        {
            list.Add(a.Customization);
        }

        state.Customizations = list;
        return ReduceOutcome.Applied;
    }

    private static ReduceOutcome ApplyCustomizationRemoved(SessionState state, SessionCustomizationRemovedAction a)
    {
        List<Customization>? list = state.Customizations;
        if (list is null)
        {
            return ReduceOutcome.NoOp;
        }

        for (int i = 0; i < list.Count; i++)
        {
            if (TryCustomizationId(list[i], out string got) && got == a.Id)
            {
                list.RemoveAt(i);
                return ReduceOutcome.Applied;
            }
        }

        foreach (Customization c in list)
        {
            List<ChildCustomization>? children = ContainerChildren(c);
            if (children is null)
            {
                continue;
            }

            for (int j = 0; j < children.Count; j++)
            {
                if (TryChildCustomizationId(children[j], out string childGot) && childGot == a.Id)
                {
                    children.RemoveAt(j);
                    return ReduceOutcome.Applied;
                }
            }
        }

        return ReduceOutcome.NoOp;
    }

    /// <summary>
    /// Applies a <c>session/mcpServerStateChanged</c> action: a
    /// full-replacement of an MCP server customization's
    /// <see cref="McpServerCustomization.State"/> and
    /// <see cref="McpServerCustomization.Channel"/>, located by id.
    ///
    /// Mirrors the canonical TypeScript reducer (and the Go/Rust ports):
    /// a top-level <see cref="McpServerCustomization"/> entry is matched first
    /// (the host MAY surface MCP servers directly at the top level); otherwise
    /// the search descends into container children. The action is a no-op when
    /// no customization carries the id, or when the matched id belongs to a
    /// non-MCP customization type.
    /// </summary>
    private static ReduceOutcome ApplyMcpServerStateChanged(SessionState state, SessionMcpServerStateChangedAction a) =>
        UpdateMcpServerCustomization(state, a.Id, mcp =>
        {
            mcp.State = a.State;
            mcp.Channel = a.Channel;
        });

    /// <summary>
    /// Locates the <see cref="McpServerCustomization"/> identified by
    /// <paramref name="id"/> — searching the top-level customization list first,
    /// then the children of every container — and applies <paramref name="update"/>
    /// to it in place. Mirrors the canonical TypeScript
    /// <c>updateMcpServerCustomization</c> helper shared by
    /// <c>session/mcpServerStateChanged</c>, <c>session/mcpServerStartRequested</c>,
    /// and <c>session/mcpServerStopRequested</c>. Returns
    /// <see cref="ReduceOutcome.NoOp"/> when no matching MCP server is found (or the
    /// id targets a non-MCP customization).
    /// </summary>
    private static ReduceOutcome UpdateMcpServerCustomization(
        SessionState state,
        string id,
        Action<McpServerCustomization> update)
    {
        List<Customization>? list = state.Customizations;
        if (list is null)
        {
            return ReduceOutcome.NoOp;
        }

        // Top-level entries. McpServerCustomization is a valid top-level
        // Customization variant, but it is intentionally absent from the
        // container-id helper (TryCustomizationId only knows the Plugin /
        // Directory containers), so match it directly here.
        foreach (Customization c in list)
        {
            if (c.Value is McpServerCustomization top && top.Id == id)
            {
                update(top);
                return ReduceOutcome.Applied;
            }

            // A non-MCP top-level customization that carries the id is a no-op
            // (the id targets a customization that is not an MCP server).
            if (TryCustomizationId(c, out string topGot) && topGot == id)
            {
                return ReduceOutcome.NoOp;
            }
        }

        // Container children.
        foreach (Customization c in list)
        {
            List<ChildCustomization>? children = ContainerChildren(c);
            if (children is null)
            {
                continue;
            }

            foreach (ChildCustomization child in children)
            {
                if (child.Value is McpServerCustomization mcp && mcp.Id == id)
                {
                    update(mcp);
                    return ReduceOutcome.Applied;
                }

                if (TryChildCustomizationId(child, out string childGot) && childGot == id)
                {
                    // id belongs to a non-MCP child customization → no-op.
                    return ReduceOutcome.NoOp;
                }
            }
        }

        return ReduceOutcome.NoOp;
    }

    // ─── Terminal Reducer ──────────────────────────────────────────────────

    /// <summary>
    /// Applies <paramref name="action"/> to the <see cref="TerminalState"/> in
    /// place. Returns <see cref="ReduceOutcome.OutOfScope"/> for actions that
    /// target a different state tree.
    /// </summary>
    public static ReduceOutcome ApplyToTerminal(TerminalState state, StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));
        switch (action.Value)
        {
            case TerminalDataAction a:
                AppendTerminalData(state, a.Data);
                return ReduceOutcome.Applied;
            case TerminalInputAction:
                return ReduceOutcome.NoOp;
            case TerminalResizedAction a:
                state.Cols = a.Cols;
                state.Rows = a.Rows;
                return ReduceOutcome.Applied;
            case TerminalClaimedAction a:
                state.Claim = a.Claim;
                return ReduceOutcome.Applied;
            case TerminalTitleChangedAction a:
                state.Title = a.Title;
                return ReduceOutcome.Applied;
            case TerminalCwdChangedAction a:
                state.Cwd = a.Cwd;
                return ReduceOutcome.Applied;
            case TerminalExitedAction a:
                state.Lifecycle = new TerminalLifecycleState(new TerminalExitedLifecycleState
                {
                    Status = TerminalLifecycleStatus.Exited,
                    ExitCode = a.ExitCode,
                });
                return ReduceOutcome.Applied;
            case TerminalClearedAction:
                state.Content = new List<TerminalContentPart>();
                return ReduceOutcome.Applied;
            case TerminalCommandDetectionAvailableAction:
                state.SupportsCommandDetection = true;
                return ReduceOutcome.Applied;
            case TerminalCommandExecutedAction a:
                state.Content.Add(new TerminalContentPart(new TerminalCommandPart
                {
                    Type = "command",
                    CommandId = a.CommandId,
                    CommandLine = a.CommandLine,
                    // `output` is schema-required; it starts empty and accrues
                    // via terminal/data appends (see AppendTerminalData).
                    Output = "",
                    Timestamp = a.Timestamp,
                    IsComplete = false,
                }));
                state.SupportsCommandDetection = true;
                return ReduceOutcome.Applied;
            case TerminalCommandFinishedAction a:
                foreach (TerminalContentPart part in state.Content)
                {
                    if (part.Value is TerminalCommandPart c && c.CommandId == a.CommandId)
                    {
                        c.IsComplete = true;
                        c.ExitCode = a.ExitCode;
                        c.DurationMs = a.DurationMs;
                        return ReduceOutcome.Applied;
                    }
                }

                return ReduceOutcome.NoOp;
        }

        return ReduceOutcome.OutOfScope;
    }

    private static void AppendTerminalData(TerminalState state, string data)
    {
        int n = state.Content.Count;
        if (n > 0)
        {
            switch (state.Content[n - 1].Value)
            {
                case TerminalCommandPart tail when tail.IsComplete == false:
                    tail.Output = (tail.Output ?? string.Empty) + data;
                    return;
                case TerminalUnclassifiedPart tail:
                    tail.Value += data;
                    return;
            }
        }

        state.Content.Add(new TerminalContentPart(new TerminalUnclassifiedPart
        {
            Type = "unclassified",
            Value = data,
        }));
    }

    // ─── Changeset Reducer ─────────────────────────────────────────────────

    /// <summary>
    /// Applies <paramref name="action"/> to the <see cref="ChangesetState"/> in
    /// place. Faithful port of the canonical TypeScript <c>changesetReducer</c>:
    /// a stable file order is preserved by appending unknown ids and replacing
    /// matching ids in place, and the <c>error</c> payload is carried only while
    /// the relevant status is <c>Error</c> so a recovered changeset or operation
    /// never keeps a stale error. Returns <see cref="ReduceOutcome.OutOfScope"/>
    /// for actions that target a different state tree.
    /// </summary>
    public static ReduceOutcome ApplyToChangeset(ChangesetState state, StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));
        switch (action.Value)
        {
            case ChangesetStatusChangedAction a:
                // Carry `error` only when the new status is Error so we don't
                // leave a stale error sitting on a recovered changeset.
                state.Status = a.Status;
                state.Error = a.Status == ChangesetStatus.Error ? a.Error : null;
                return ReduceOutcome.Applied;

            case ChangesetFileSetAction a:
                {
                    int idx = state.Files.FindIndex(f => f.Id == a.File.Id);
                    if (idx < 0)
                    {
                        state.Files.Add(a.File);
                    }
                    else
                    {
                        state.Files[idx] = a.File;
                    }

                    return ReduceOutcome.Applied;
                }

            case ChangesetFileRemovedAction a:
                {
                    int idx = state.Files.FindIndex(f => f.Id == a.FileId);
                    if (idx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.Files.RemoveAt(idx);
                    return ReduceOutcome.Applied;
                }

            case ChangesetFilesReviewChangedAction a:
                {
                    // Set `Reviewed` on every file whose id is listed; ignore ids
                    // that match no current file, and treat a file already in the
                    // target state as a no-op. Mirrors the canonical TypeScript
                    // reducer: emit Applied only when at least one file changed.
                    var ids = new HashSet<string>(a.Files);
                    bool changed = false;
                    for (int i = 0; i < state.Files.Count; i++)
                    {
                        ChangesetFile file = state.Files[i];
                        if (!ids.Contains(file.Id) || file.Reviewed == a.Reviewed)
                        {
                            continue;
                        }

                        state.Files[i] = file with { Reviewed = a.Reviewed };
                        changed = true;
                    }

                    return changed ? ReduceOutcome.Applied : ReduceOutcome.NoOp;
                }

            case ChangesetContentChangedAction a:
                // Full content replacement (snapshots / bulk refreshes): `files`
                // always replaces the previous file list. `operations` replaces
                // the previous list only when present; when omitted (wire
                // `operations` absent) the operation list is left unchanged.
                state.Files = CopyList(a.Files)!;
                if (a.Operations is not null)
                {
                    state.Operations = CopyList(a.Operations);
                }

                return ReduceOutcome.Applied;

            case ChangesetOperationsChangedAction a:
                // Full replacement: a list replaces the previous operations; a
                // null list (wire `operations: null`) clears them entirely.
                state.Operations = a.Operations;
                return ReduceOutcome.Applied;

            case ChangesetOperationStatusChangedAction a:
                {
                    if (state.Operations is null)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    int idx = state.Operations.FindIndex(o => o.Id == a.OperationId);
                    if (idx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    ChangesetOperation op = state.Operations[idx];
                    // Carry `error` only when the new status is Error so we don't
                    // leave a stale error on an operation that recovered or started
                    // running.
                    op.Status = a.Status;
                    op.Error = a.Status == ChangesetOperationStatus.Error ? a.Error : null;
                    return ReduceOutcome.Applied;
                }

            case ChangesetClearedAction:
                if (state.Files.Count == 0)
                {
                    return ReduceOutcome.NoOp;
                }

                state.Files.Clear();
                return ReduceOutcome.Applied;
        }

        return ReduceOutcome.OutOfScope;
    }

    // ─── Resource-Watch Reducer ────────────────────────────────────────────

    /// <summary>
    /// Applies <paramref name="action"/> to the <see cref="ResourceWatchState"/>
    /// in place. Faithful port of the canonical TypeScript
    /// <c>resourceWatchReducer</c> (and the Kotlin/Rust/Go ports): watches are
    /// intentionally event-pass-through, so <c>resourceWatch/changed</c> leaves
    /// the watch descriptor unchanged (a recognized-but-no-effect
    /// <see cref="ReduceOutcome.NoOp"/>) and the reducer keeps no history of the
    /// delivered changes. Every other action targets a different state tree and
    /// returns <see cref="ReduceOutcome.OutOfScope"/>; both paths leave
    /// <paramref name="state"/> untouched, matching the canonical reducer's
    /// "return state unchanged" for known and unknown actions alike.
    /// </summary>
    public static ReduceOutcome ApplyToResourceWatch(ResourceWatchState state, StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));
        return action.Value is ResourceWatchChangedAction
            ? ReduceOutcome.NoOp
            : ReduceOutcome.OutOfScope;
    }

    // ─── Annotations Reducer ───────────────────────────────────────────────

    /// <summary>
    /// Applies <paramref name="action"/> to the <see cref="AnnotationsState"/> in
    /// place. Faithful port of the canonical TypeScript <c>annotationsReducer</c>
    /// (and the Kotlin/Rust/Go/Swift ports): the dispatch order of annotations
    /// (and of entries within an annotation) is preserved — new annotations and
    /// entries are appended, a <c>*Set</c> action whose id matches replaces in
    /// place, and an action whose target id is unknown is a no-op (mirroring
    /// <c>changeset/fileRemoved</c> semantics). The single-entry-minimum
    /// invariant is enforced by producers, not the reducer. Returns
    /// <see cref="ReduceOutcome.OutOfScope"/> for actions that target a different
    /// state tree.
    /// </summary>
    public static ReduceOutcome ApplyToAnnotations(AnnotationsState state, StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));
        switch (action.Value)
        {
            case AnnotationsSetAction a:
                {
                    int idx = state.Annotations.FindIndex(t => t.Id == a.Annotation.Id);
                    if (idx < 0)
                    {
                        state.Annotations.Add(a.Annotation);
                    }
                    else
                    {
                        state.Annotations[idx] = a.Annotation;
                    }

                    return ReduceOutcome.Applied;
                }

            case AnnotationsRemovedAction a:
                {
                    int idx = state.Annotations.FindIndex(t => t.Id == a.AnnotationId);
                    if (idx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.Annotations.RemoveAt(idx);
                    return ReduceOutcome.Applied;
                }

            case AnnotationsEntrySetAction a:
                {
                    int tIdx = state.Annotations.FindIndex(t => t.Id == a.AnnotationId);
                    if (tIdx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    Annotation annotation = state.Annotations[tIdx];
                    int cIdx = annotation.Entries.FindIndex(c => c.Id == a.Entry.Id);
                    if (cIdx < 0)
                    {
                        annotation.Entries.Add(a.Entry);
                    }
                    else
                    {
                        annotation.Entries[cIdx] = a.Entry;
                    }

                    return ReduceOutcome.Applied;
                }

            case AnnotationsEntryRemovedAction a:
                {
                    int tIdx = state.Annotations.FindIndex(t => t.Id == a.AnnotationId);
                    if (tIdx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    Annotation annotation = state.Annotations[tIdx];
                    int cIdx = annotation.Entries.FindIndex(c => c.Id == a.EntryId);
                    if (cIdx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    annotation.Entries.RemoveAt(cIdx);
                    return ReduceOutcome.Applied;
                }

            case AnnotationsUpdatedAction a:
                {
                    int idx = state.Annotations.FindIndex(t => t.Id == a.AnnotationId);
                    if (idx < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    Annotation ann = state.Annotations[idx];
                    state.Annotations[idx] = ann with
                    {
                        Origin = a.Origin ?? ann.Origin,
                        Resource = a.Resource ?? ann.Resource,
                        Range = a.Range ?? ann.Range,
                        Resolved = a.Resolved ?? ann.Resolved,
                    };
                    return ReduceOutcome.Applied;
                }
        }

        return ReduceOutcome.OutOfScope;
    }

    /// <summary>Applies an action to the automation catalogue in place.</summary>
    public static ReduceOutcome ApplyToAutomation(
        AutomationCatalogState state,
        StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));

        switch (action.Value)
        {
            case AutomationCreateRequestedAction:
            case AutomationUpdateRequestedAction:
                return ReduceOutcome.NoOp;
            case AutomationSetAction set:
                {
                    int index = state.Automations.FindIndex(
                        automation => automation.Resource == set.Automation.Resource);
                    if (index < 0)
                    {
                        state.Automations.Add(set.Automation);
                    }
                    else
                    {
                        state.Automations[index] = set.Automation;
                    }

                    return ReduceOutcome.Applied;
                }
            case AutomationRemovedAction removed:
                {
                    int index = state.Automations.FindIndex(
                        automation => automation.Resource == removed.Resource);
                    if (index < 0)
                    {
                        return ReduceOutcome.NoOp;
                    }

                    state.Automations.RemoveAt(index);
                    return ReduceOutcome.Applied;
                }
            default:
                return ReduceOutcome.OutOfScope;
        }
    }

    /// <summary>Applies an action to an automation run in place.</summary>
    public static ReduceOutcome ApplyToAutomationRun(
        AutomationRunState state,
        StateAction action)
    {
        Guard.ThrowIfNull(state, nameof(state));
        Guard.ThrowIfNull(action, nameof(action));

        switch (action.Value)
        {
            case AutomationRunLifecycleChangedAction changed:
                state.Lifecycle = changed.Lifecycle;
                return ReduceOutcome.Applied;
            case AutomationRunSessionSetAction set:
                if (state.Sessions.Contains(set.Session))
                {
                    return ReduceOutcome.NoOp;
                }

                state.Sessions.Add(set.Session);
                return ReduceOutcome.Applied;
            case AutomationRunSessionRemovedAction removed:
                if (!state.Sessions.Remove(removed.Session))
                {
                    return ReduceOutcome.NoOp;
                }

                if (state.PrimarySession == removed.Session)
                {
                    state.PrimarySession = null;
                }

                return ReduceOutcome.Applied;
            case AutomationRunPrimarySessionChangedAction changed:
                state.PrimarySession = changed.PrimarySession;
                return ReduceOutcome.Applied;
            case AutomationRunCancelRequestedAction:
                return ReduceOutcome.NoOp;
            default:
                return ReduceOutcome.OutOfScope;
        }
    }

    // ─── Client Dispatchable ───────────────────────────────────────────────

    private static readonly string[] s_clientDispatchableActionNames =
    {
        "root/configChanged",
        // Chat-channel actions (post-#213)
        "chat/turnStarted",
        "chat/toolCallConfirmed",
        "chat/toolCallComplete",
        "chat/toolCallResultConfirmed",
        "chat/toolCallContentChanged",
        "chat/turnCancelled",
        "chat/turnResume",
        "chat/pendingMessageSet",
        "chat/pendingMessageRemoved",
        "chat/queuedMessagesReordered",
        "chat/draftChanged",
        "chat/inputAnswerChanged",
        "chat/inputCompleted",
        "chat/truncated",
        // Session-level actions that remain on the session channel
        "session/activeClientSet",
        "session/activeClientRemoved",
        "session/titleChanged",
        "session/customizationToggled",
        "session/mcpServerStartRequested",
        "session/mcpServerStopRequested",
        "session/isReadChanged",
        "session/isArchivedChanged",
        "session/configChanged",
        // Working-directory actions (post-#337), all four @clientDispatchable
        "session/workingDirectorySet",
        "session/workingDirectoryRemoved",
        "session/workingDirectoryReplaced",
        "chat/workingDirectorySet",
        "chat/workingDirectoryRemoved",
        // Changeset-channel actions a reviewer dispatches directly (post-#328)
        "changeset/filesReviewChanged",
        "annotations/set",
        "annotations/updated",
        "annotations/removed",
        "annotations/entrySet",
        "annotations/entryRemoved",
        "terminal/input",
        "terminal/resized",
        "terminal/claimed",
        "terminal/titleChanged",
        "terminal/cleared",
        "automation/createRequested",
        "automation/updateRequested",
        "automation/removed",
        "automationRun/cancelRequested",
    };

    private static readonly HashSet<string> s_clientDispatchableActions =
        new(s_clientDispatchableActionNames, StringComparer.Ordinal);

    /// <summary>
    /// The read-only set of action wire-<c>type</c> strings a client is allowed
    /// to dispatch.
    /// </summary>
    public static IReadOnlyCollection<string> ClientDispatchableActions { get; } =
        Array.AsReadOnly(s_clientDispatchableActionNames);

    /// <summary>
    /// Checks whether <paramref name="action"/> may be dispatched by a client.
    /// The action's wire <c>type</c> is read directly from the variant's
    /// <c>Type</c> discriminator (mapped to its wire string via the generated
    /// <c>[WireValue]</c> attributes) and tested for membership in
    /// <see cref="ClientDispatchableActions"/> — without serializing the whole
    /// action graph. An unknown variant carried as a raw <see cref="JsonElement"/>
    /// reads its <c>type</c> field directly. Mirrors the Swift client's
    /// <c>isClientDispatchable</c>.
    /// </summary>
    public static bool IsClientDispatchable(StateAction action)
    {
        Guard.ThrowIfNull(action, nameof(action));

        var inner = action.Value;
        switch (inner)
        {
            case null:
                return false;
            // Unknown variant preserved as raw JSON: read its `type` field directly.
            case JsonElement el:
                return el.ValueKind == JsonValueKind.Object
                    && el.TryGetProperty("type", out var t)
                    && t.ValueKind == JsonValueKind.String
                    && t.GetString() is { } raw
                    && s_clientDispatchableActions.Contains(raw);
            default:
                // Known variant record: read its ActionType discriminator and map it
                // to the wire string the serializer would have emitted.
                return GeneratedActionMetadata.TryGetActionType(inner, out var actionType)
                    && s_clientDispatchableActions.Contains(GeneratedActionMetadata.GetWireName(actionType));
        }
    }
}
