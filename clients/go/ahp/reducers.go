package ahp

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/microsoft/agent-host-protocol/clients/go/ahptypes"
)

// ─── ReduceOutcome ─────────────────────────────────────────────────────

// ReduceOutcome reports what happened when a reducer was asked to
// apply an action.
type ReduceOutcome int

const (
	// ReduceOutcomeApplied indicates the action was applied and the
	// state was mutated.
	ReduceOutcomeApplied ReduceOutcome = iota
	// ReduceOutcomeNoOp indicates the action was recognized but had no
	// effect against this state (e.g. an unknown turn id).
	ReduceOutcomeNoOp
	// ReduceOutcomeOutOfScope indicates the action targets a different
	// scope (e.g. a session action passed to the root reducer).
	ReduceOutcomeOutOfScope
)

// ─── Injectable timestamp ──────────────────────────────────────────────

var (
	nowMu       sync.RWMutex
	nowProvider func() int64 = func() int64 { return time.Now().UnixMilli() }
)

// SetNowProvider overrides the clock reducers use to stamp modifiedAt fields.
// Chat modifiedAt values are formatted as ISO 8601 strings from this clock;
// session summary modifiedAt keeps the numeric millisecond timestamp. Pass nil
// to restore the default ([time.Now].UnixMilli).
func SetNowProvider(fn func() int64) {
	nowMu.Lock()
	defer nowMu.Unlock()
	if fn == nil {
		nowProvider = func() int64 { return time.Now().UnixMilli() }
	} else {
		nowProvider = fn
	}
}

func nowMs() int64 {
	nowMu.RLock()
	defer nowMu.RUnlock()
	return nowProvider()
}

func nowISOString() string {
	return time.UnixMilli(nowMs()).UTC().Format("2006-01-02T15:04:05.000Z")
}

// ─── Status helpers ────────────────────────────────────────────────────

// statusActivityMask covers the mutually-exclusive activity bits
// (bits 0–4) of [ahptypes.SessionStatus].
const statusActivityMask ahptypes.SessionStatus = (1 << 5) - 1

func withStatusFlag(status, flag ahptypes.SessionStatus, set bool) ahptypes.SessionStatus {
	if set {
		return status | flag
	}
	return status &^ flag
}

// withInputNeededStatus reflects the session-level input queue into the activity
// bits of status. A non-empty queue promotes the activity to InputNeeded;
// emptying it clears the input-needed-specific bit. Because InputNeeded implies
// InProgress, an unblocked turn falls back to InProgress while an already-idle
// session stays idle. Orthogonal flags (IsRead / IsArchived) are preserved.
func withInputNeededStatus(status ahptypes.SessionStatus, inputNeeded []ahptypes.SessionInputRequest) ahptypes.SessionStatus {
	if len(inputNeeded) == 0 {
		return status &^ (ahptypes.SessionStatusInputNeeded &^ ahptypes.SessionStatusInProgress)
	}
	return (status &^ statusActivityMask) | ahptypes.SessionStatusInputNeeded
}

// ─── Tool-call helpers ─────────────────────────────────────────────────

// toolCallCommon carries the fields shared by every concrete
// [ahptypes.ToolCallState] variant.
type toolCallCommon struct {
	id          string
	name        string
	displayName string
	intention   *string
	contributor *ahptypes.ToolCallContributor
	meta        ahptypes.JSONObject
}

func toolCallMeta(tc ahptypes.ToolCallState) toolCallCommon {
	switch v := tc.Value.(type) {
	case *ahptypes.ToolCallStreamingState:
		return toolCallCommon{v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta}
	case *ahptypes.ToolCallPendingConfirmationState:
		return toolCallCommon{v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta}
	case *ahptypes.ToolCallRunningState:
		return toolCallCommon{v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta}
	case *ahptypes.ToolCallAuthRequiredState:
		return toolCallCommon{v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta}
	case *ahptypes.ToolCallPendingResultConfirmationState:
		return toolCallCommon{v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta}
	case *ahptypes.ToolCallCompletedState:
		return toolCallCommon{v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta}
	case *ahptypes.ToolCallCancelledState:
		return toolCallCommon{v.ToolCallId, v.ToolName, v.DisplayName, v.Intention, v.Contributor, v.Meta}
	}
	return toolCallCommon{}
}

// toolCallInvocationAndInput pulls the optional invocationMessage and
// toolInput fields out of whichever non-terminal variant tc points to.
// Returns (StringOrMarkdown{}, nil) for variants that don't carry them.
func toolCallInvocationAndInput(tc ahptypes.ToolCallState) (ahptypes.StringOrMarkdown, *string) {
	switch v := tc.Value.(type) {
	case *ahptypes.ToolCallStreamingState:
		var im ahptypes.StringOrMarkdown
		if v.InvocationMessage != nil {
			im = *v.InvocationMessage
		}
		return im, nil
	case *ahptypes.ToolCallPendingConfirmationState:
		return v.InvocationMessage, v.ToolInput
	case *ahptypes.ToolCallRunningState:
		return v.InvocationMessage, v.ToolInput
	case *ahptypes.ToolCallAuthRequiredState:
		return v.InvocationMessage, v.ToolInput
	case *ahptypes.ToolCallPendingResultConfirmationState:
		return v.InvocationMessage, v.ToolInput
	}
	return ahptypes.StringOrMarkdown{}, nil
}

func toolCallID(tc ahptypes.ToolCallState) string {
	return toolCallMeta(tc).id
}

// hasBlockingToolCall reports whether the active turn has any tool call blocked
// on confirmation or MCP authentication.
func hasBlockingToolCall(state *ahptypes.ChatState) bool {
	if state.ActiveTurn == nil {
		return false
	}
	for _, part := range state.ActiveTurn.ResponseParts {
		tc, ok := part.Value.(*ahptypes.ToolCallResponsePart)
		if !ok {
			continue
		}
		switch tc.ToolCall.Value.(type) {
		case *ahptypes.ToolCallPendingConfirmationState,
			*ahptypes.ToolCallAuthRequiredState,
			*ahptypes.ToolCallPendingResultConfirmationState:
			return true
		}
	}
	return false
}

func hasOpenInputRequest(state *ahptypes.ChatState) bool {
	if state.ActiveTurn == nil {
		return false
	}
	for _, part := range state.ActiveTurn.ResponseParts {
		input, ok := part.Value.(*ahptypes.InputRequestResponsePart)
		if ok && input.Response == nil {
			return true
		}
	}
	return false
}

func summaryStatus(state *ahptypes.ChatState, terminal *ahptypes.SessionStatus) ahptypes.SessionStatus {
	var activity ahptypes.SessionStatus
	switch {
	case terminal != nil:
		activity = *terminal
	case hasOpenInputRequest(state) || hasBlockingToolCall(state):
		activity = ahptypes.SessionStatusInputNeeded
	case state.ActiveTurn != nil:
		activity = ahptypes.SessionStatusInProgress
	default:
		activity = ahptypes.SessionStatusIdle
	}
	return (state.Status &^ statusActivityMask) | activity
}

func refreshSummaryStatus(state *ahptypes.ChatState) {
	state.Status = summaryStatus(state, nil)
}

func touchChatModified(state *ahptypes.ChatState) {
	state.ModifiedAt = nowISOString()
}

// ─── Active-turn helpers ───────────────────────────────────────────────

func endTurn(state *ahptypes.ChatState, turnID string, duration int64, turnState ahptypes.TurnState, terminalStatus *ahptypes.SessionStatus, errInfo *ahptypes.ErrorInfo) ReduceOutcome {
	if state.ActiveTurn == nil || state.ActiveTurn.Id != turnID {
		return ReduceOutcomeNoOp
	}
	active := state.ActiveTurn
	state.ActiveTurn = nil

	parts := make([]ahptypes.ResponsePart, 0, len(active.ResponseParts))
	for _, part := range active.ResponseParts {
		tc, ok := part.Value.(*ahptypes.ToolCallResponsePart)
		if !ok {
			parts = append(parts, part)
			continue
		}
		switch tc.ToolCall.Value.(type) {
		case *ahptypes.ToolCallCompletedState, *ahptypes.ToolCallCancelledState:
			parts = append(parts, part)
			continue
		}
		common := toolCallMeta(tc.ToolCall)
		invocation, toolInput := toolCallInvocationAndInput(tc.ToolCall)
		cancelled := &ahptypes.ToolCallCancelledState{
			Status:            ahptypes.ToolCallStatusCancelled,
			ToolCallId:        common.id,
			ToolName:          common.name,
			DisplayName:       common.displayName,
			Intention:         common.intention,
			Contributor:       common.contributor,
			Meta:              common.meta,
			InvocationMessage: invocation,
			ToolInput:         toolInput,
			Reason:            ahptypes.ToolCallCancellationReasonSkipped,
		}
		parts = append(parts, ahptypes.ResponsePart{Value: &ahptypes.ToolCallResponsePart{
			Kind:     ahptypes.ResponsePartKindToolCall,
			ToolCall: ahptypes.ToolCallState{Value: cancelled},
		}})
	}

	// Defensive clamp: duration is producer-supplied and opaque to this
	// reducer, but a negative value would be nonsensical to display.
	if duration < 0 {
		duration = 0
	}
	startedAt := active.StartedAt
	turn := ahptypes.Turn{
		Id:            active.Id,
		StartedAt:     &startedAt,
		Duration:      &duration,
		Message:       active.Message,
		ResponseParts: parts,
		Usage:         active.Usage,
		State:         turnState,
		Error:         errInfo,
	}

	state.Turns = append(state.Turns, turn)
	state.ModifiedAt = nowISOString()
	state.Status = summaryStatus(state, terminalStatus)
	return ReduceOutcomeApplied
}

func upsertInputRequest(state *ahptypes.ChatState, req ahptypes.ChatInputRequest) ReduceOutcome {
	if state.ActiveTurn == nil {
		return ReduceOutcomeNoOp
	}
	parts := state.ActiveTurn.ResponseParts
	for i := range parts {
		input, ok := parts[i].Value.(*ahptypes.InputRequestResponsePart)
		if ok && input.Response == nil && input.Request.Id == req.Id {
			if req.Answers == nil {
				req.Answers = input.Request.Answers
			}
			parts[i].Value = &ahptypes.InputRequestResponsePart{
				Kind:    ahptypes.ResponsePartKindInputRequest,
				Request: req,
			}
			state.ActiveTurn.ResponseParts = parts
			state.Status = summaryStatus(state, nil)
			touchChatModified(state)
			state.Status = withStatusFlag(state.Status, ahptypes.SessionStatusIsRead, false)
			return ReduceOutcomeApplied
		}
	}
	state.ActiveTurn.ResponseParts = append(parts, ahptypes.ResponsePart{
		Value: &ahptypes.InputRequestResponsePart{
			Kind:    ahptypes.ResponsePartKindInputRequest,
			Request: req,
		},
	})
	state.Status = summaryStatus(state, nil)
	touchChatModified(state)
	state.Status = withStatusFlag(state.Status, ahptypes.SessionStatusIsRead, false)
	return ReduceOutcomeApplied
}

// ─── Customization helpers ─────────────────────────────────────────────

func customizationID(c ahptypes.Customization) (string, bool) {
	switch v := c.Value.(type) {
	case *ahptypes.PluginCustomization:
		return v.Id, true
	case *ahptypes.DirectoryCustomization:
		return v.Id, true
	case *ahptypes.McpServerCustomization:
		return v.Id, true
	}
	return "", false
}

func sessionInputRequestID(r ahptypes.SessionInputRequest) (string, bool) {
	switch v := r.Value.(type) {
	case *ahptypes.SessionChatInputRequest:
		return v.Id, true
	case *ahptypes.SessionToolConfirmationRequest:
		return v.Id, true
	case *ahptypes.SessionToolClientExecutionRequest:
		return v.Id, true
	case *ahptypes.SessionToolAuthenticationRequest:
		return v.Id, true
	}
	return "", false
}

func childCustomizationID(c ahptypes.ChildCustomization) (string, bool) {
	switch v := c.Value.(type) {
	case *ahptypes.AgentCustomization:
		return v.Id, true
	case *ahptypes.SkillCustomization:
		return v.Id, true
	case *ahptypes.PromptCustomization:
		return v.Id, true
	case *ahptypes.RuleCustomization:
		return v.Id, true
	case *ahptypes.HookCustomization:
		return v.Id, true
	case *ahptypes.McpServerCustomization:
		return v.Id, true
	}
	return "", false
}

func containerChildren(c *ahptypes.Customization) *[]ahptypes.ChildCustomization {
	switch v := c.Value.(type) {
	case *ahptypes.PluginCustomization:
		return &v.Children
	case *ahptypes.DirectoryCustomization:
		return &v.Children
	}
	return nil
}

func setContainerEnabled(c *ahptypes.Customization, enabled bool) {
	switch v := c.Value.(type) {
	case *ahptypes.PluginCustomization:
		v.Enabled = enabled
	case *ahptypes.DirectoryCustomization:
		v.Enabled = enabled
	case *ahptypes.McpServerCustomization:
		v.Enabled = enabled
	}
}

func setChildEnabled(c *ahptypes.ChildCustomization, enabled bool) {
	switch v := c.Value.(type) {
	case *ahptypes.AgentCustomization:
		v.Enabled = &enabled
	case *ahptypes.SkillCustomization:
		v.Enabled = &enabled
	case *ahptypes.PromptCustomization:
		v.Enabled = &enabled
	case *ahptypes.RuleCustomization:
		v.Enabled = &enabled
	case *ahptypes.HookCustomization:
		v.Enabled = &enabled
	case *ahptypes.McpServerCustomization:
		v.Enabled = enabled
	}
}

func applyToggle(list []ahptypes.Customization, id string, enabled bool) bool {
	for i := range list {
		got, ok := customizationID(list[i])
		if ok && got == id {
			setContainerEnabled(&list[i], enabled)
			return true
		}
	}
	for i := range list {
		children := containerChildren(&list[i])
		if children == nil {
			continue
		}
		for j := range *children {
			got, ok := childCustomizationID((*children)[j])
			if ok && got == id {
				setChildEnabled(&(*children)[j], enabled)
				return true
			}
		}
	}
	return false
}

// ─── Active-turn mutation helpers ──────────────────────────────────────

func updateToolCall(state *ahptypes.ChatState, turnID, targetToolCallID string, updater func(ahptypes.ToolCallState) ahptypes.ToolCallState) ReduceOutcome {
	if state.ActiveTurn == nil || state.ActiveTurn.Id != turnID {
		return ReduceOutcomeNoOp
	}
	for i := range state.ActiveTurn.ResponseParts {
		tc, ok := state.ActiveTurn.ResponseParts[i].Value.(*ahptypes.ToolCallResponsePart)
		if !ok {
			continue
		}
		if toolCallID(tc.ToolCall) == targetToolCallID {
			tc.ToolCall = updater(tc.ToolCall)
			return ReduceOutcomeApplied
		}
	}
	return ReduceOutcomeNoOp
}

func updateResponsePart(state *ahptypes.ChatState, turnID, partID string, updater func(*ahptypes.ResponsePart)) ReduceOutcome {
	if state.ActiveTurn == nil || state.ActiveTurn.Id != turnID {
		return ReduceOutcomeNoOp
	}
	for i := range state.ActiveTurn.ResponseParts {
		part := &state.ActiveTurn.ResponseParts[i]
		var id string
		switch v := part.Value.(type) {
		case *ahptypes.ToolCallResponsePart:
			id = toolCallID(v.ToolCall)
		case *ahptypes.MarkdownResponsePart:
			id = v.Id
		case *ahptypes.ReasoningResponsePart:
			id = v.Id
		}
		if id != "" && id == partID {
			updater(part)
			return ReduceOutcomeApplied
		}
	}
	return ReduceOutcomeNoOp
}

// ─── Root Reducer ──────────────────────────────────────────────────────

// ApplyActionToRoot applies action to the [ahptypes.RootState] in
// place. Returns [ReduceOutcomeOutOfScope] for actions that target a
// different state tree.
func ApplyActionToRoot(state *ahptypes.RootState, action ahptypes.StateAction) ReduceOutcome {
	switch a := action.Value.(type) {
	case *ahptypes.RootAgentsChangedAction:
		state.Agents = append([]ahptypes.AgentInfo(nil), a.Agents...)
		return ReduceOutcomeApplied
	case *ahptypes.RootActiveSessionsChangedAction:
		v := a.ActiveSessions
		state.ActiveSessions = &v
		return ReduceOutcomeApplied
	case *ahptypes.RootTerminalsChangedAction:
		state.Terminals = append([]ahptypes.TerminalInfo(nil), a.Terminals...)
		return ReduceOutcomeApplied
	case *ahptypes.RootConfigChangedAction:
		if state.Config == nil {
			return ReduceOutcomeNoOp
		}
		replace := a.Replace != nil && *a.Replace
		if replace {
			state.Config.Values = make(map[string]json.RawMessage, len(a.Config))
		} else if state.Config.Values == nil {
			state.Config.Values = make(map[string]json.RawMessage, len(a.Config))
		}
		for k, v := range a.Config {
			state.Config.Values[k] = v
		}
		return ReduceOutcomeApplied
	}
	return ReduceOutcomeOutOfScope
}

// ─── Chat Reducer ──────────────────────────────────────────────────────

// ApplyActionToChat applies action to the [ahptypes.ChatState] in
// place. Returns [ReduceOutcomeOutOfScope] for actions that target a
// different state tree.
func ApplyActionToChat(state *ahptypes.ChatState, action ahptypes.StateAction) ReduceOutcome {
	switch a := action.Value.(type) {
	case *ahptypes.ChatTurnStartedAction:
		return applyTurnStarted(state, a)
	case *ahptypes.ChatDeltaAction:
		return updateResponsePart(state, a.TurnId, a.PartId, func(p *ahptypes.ResponsePart) {
			if m, ok := p.Value.(*ahptypes.MarkdownResponsePart); ok {
				m.Content += a.Content
			}
		})
	case *ahptypes.ChatResponsePartAction:
		if state.ActiveTurn == nil || state.ActiveTurn.Id != a.TurnId {
			return ReduceOutcomeNoOp
		}
		state.ActiveTurn.ResponseParts = append(state.ActiveTurn.ResponseParts, a.Part)
		return ReduceOutcomeApplied
	case *ahptypes.ChatTurnCompleteAction:
		return endTurn(state, a.TurnId, a.Duration, ahptypes.TurnStateComplete, nil, nil)
	case *ahptypes.ChatTurnCancelledAction:
		return endTurn(state, a.TurnId, a.Duration, ahptypes.TurnStateCancelled, nil, nil)
	case *ahptypes.ChatErrorAction:
		errCopy := a.Error
		errStatus := ahptypes.SessionStatusError
		return endTurn(state, a.TurnId, a.Duration, ahptypes.TurnStateError, &errStatus, &errCopy)
	case *ahptypes.ChatActivityChangedAction:
		state.Activity = a.Activity
		return ReduceOutcomeApplied
	case *ahptypes.ChatToolCallStartAction:
		if state.ActiveTurn == nil || state.ActiveTurn.Id != a.TurnId {
			return ReduceOutcomeNoOp
		}
		state.ActiveTurn.ResponseParts = append(state.ActiveTurn.ResponseParts, ahptypes.ResponsePart{Value: &ahptypes.ToolCallResponsePart{
			Kind: ahptypes.ResponsePartKindToolCall,
			ToolCall: ahptypes.ToolCallState{Value: &ahptypes.ToolCallStreamingState{
				Status:      ahptypes.ToolCallStatusStreaming,
				ToolCallId:  a.ToolCallId,
				ToolName:    a.ToolName,
				DisplayName: a.DisplayName,
				Intention:   a.Intention,
				Contributor: a.Contributor,
				Meta:        a.Meta,
			}},
		}})
		return ReduceOutcomeApplied
	case *ahptypes.ChatToolCallDeltaAction:
		return applyToolCallDelta(state, a)
	case *ahptypes.ChatToolCallReadyAction:
		res := applyToolCallReady(state, a)
		if res == ReduceOutcomeApplied {
			refreshSummaryStatus(state)
		}
		return res
	case *ahptypes.ChatToolCallConfirmedAction:
		res := applyToolCallConfirmed(state, a)
		if res == ReduceOutcomeApplied {
			refreshSummaryStatus(state)
		}
		return res
	case *ahptypes.ChatToolCallCompleteAction:
		res := applyToolCallComplete(state, a)
		if res == ReduceOutcomeApplied {
			refreshSummaryStatus(state)
		}
		return res
	case *ahptypes.ChatToolCallResultConfirmedAction:
		res := applyToolCallResultConfirmed(state, a)
		if res == ReduceOutcomeApplied {
			refreshSummaryStatus(state)
		}
		return res
	case *ahptypes.ChatToolCallContentChangedAction:
		return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
			if r, ok := tc.Value.(*ahptypes.ToolCallRunningState); ok {
				if a.Meta != nil {
					r.Meta = a.Meta
				}
				r.Content = append([]ahptypes.ToolResultContent(nil), a.Content...)
			}
			return tc
		})
	case *ahptypes.ChatToolCallAuthRequiredAction:
		res := applyToolCallAuthRequired(state, a)
		if res == ReduceOutcomeApplied {
			refreshSummaryStatus(state)
		}
		return res
	case *ahptypes.ChatToolCallAuthResolvedAction:
		res := applyToolCallAuthResolved(state, a)
		if res == ReduceOutcomeApplied {
			refreshSummaryStatus(state)
		}
		return res
	case *ahptypes.ChatUsageAction:
		if state.ActiveTurn == nil || state.ActiveTurn.Id != a.TurnId {
			return ReduceOutcomeNoOp
		}
		usage := a.Usage
		state.ActiveTurn.Usage = &usage
		return ReduceOutcomeApplied
	case *ahptypes.ChatReasoningAction:
		return updateResponsePart(state, a.TurnId, a.PartId, func(p *ahptypes.ResponsePart) {
			if r, ok := p.Value.(*ahptypes.ReasoningResponsePart); ok {
				r.Content += a.Content
			}
		})
	case *ahptypes.ChatTruncatedAction:
		return applyTruncated(state, a.TurnId)
	case *ahptypes.ChatTurnsLoadedAction:
		existingIds := make(map[string]struct{}, len(state.Turns))
		for _, turn := range state.Turns {
			existingIds[turn.Id] = struct{}{}
		}
		olderTurns := make([]ahptypes.Turn, 0, len(a.Turns)+len(state.Turns))
		for _, turn := range a.Turns {
			if _, ok := existingIds[turn.Id]; !ok {
				olderTurns = append(olderTurns, turn)
			}
		}
		state.Turns = append(olderTurns, state.Turns...)
		state.TurnsNextCursor = a.TurnsNextCursor
		return ReduceOutcomeApplied
	case *ahptypes.ChatInputRequestedAction:
		return upsertInputRequest(state, a.Request)
	case *ahptypes.ChatInputAnswerChangedAction:
		return applyInputAnswerChanged(state, a)
	case *ahptypes.ChatInputCompletedAction:
		if state.ActiveTurn == nil {
			return ReduceOutcomeNoOp
		}
		for i := range state.ActiveTurn.ResponseParts {
			input, ok := state.ActiveTurn.ResponseParts[i].Value.(*ahptypes.InputRequestResponsePart)
			if !ok || input.Response != nil || input.Request.Id != a.RequestId {
				continue
			}
			finalAnswers := map[string]ahptypes.ChatInputAnswer{}
			for k, v := range input.Request.Answers {
				finalAnswers[k] = v
			}
			for k, v := range a.Answers {
				finalAnswers[k] = v
			}
			request := input.Request
			if len(finalAnswers) == 0 {
				request.Answers = nil
			} else {
				request.Answers = finalAnswers
			}
			response := a.Response
			state.ActiveTurn.ResponseParts[i].Value = &ahptypes.InputRequestResponsePart{
				Kind:     ahptypes.ResponsePartKindInputRequest,
				Request:  request,
				Response: &response,
			}
			refreshSummaryStatus(state)
			touchChatModified(state)
			return ReduceOutcomeApplied
		}
		return ReduceOutcomeNoOp
	case *ahptypes.ChatPendingMessageSetAction:
		entry := ahptypes.PendingMessage{Id: a.Id, Message: a.Message}
		switch a.Kind {
		case ahptypes.PendingMessageKindSteering:
			state.SteeringMessage = &entry
		case ahptypes.PendingMessageKindQueued:
			list := state.QueuedMessages
			idx := -1
			for i := range list {
				if list[i].Id == entry.Id {
					idx = i
					break
				}
			}
			if idx >= 0 {
				list[idx] = entry
			} else {
				list = append(list, entry)
			}
			state.QueuedMessages = list
		}
		return ReduceOutcomeApplied
	case *ahptypes.ChatPendingMessageRemovedAction:
		switch a.Kind {
		case ahptypes.PendingMessageKindSteering:
			if state.SteeringMessage != nil && state.SteeringMessage.Id == a.Id {
				state.SteeringMessage = nil
				return ReduceOutcomeApplied
			}
			return ReduceOutcomeNoOp
		case ahptypes.PendingMessageKindQueued:
			list := state.QueuedMessages
			if list == nil {
				return ReduceOutcomeNoOp
			}
			next := list[:0]
			removed := false
			for _, m := range list {
				if m.Id == a.Id {
					removed = true
					continue
				}
				next = append(next, m)
			}
			if !removed {
				return ReduceOutcomeNoOp
			}
			if len(next) == 0 {
				state.QueuedMessages = nil
			} else {
				state.QueuedMessages = next
			}
			return ReduceOutcomeApplied
		}
		return ReduceOutcomeNoOp
	case *ahptypes.ChatQueuedMessagesReorderedAction:
		if state.QueuedMessages == nil {
			return ReduceOutcomeNoOp
		}
		byID := make(map[string]ahptypes.PendingMessage, len(state.QueuedMessages))
		for _, m := range state.QueuedMessages {
			byID[m.Id] = m
		}
		reordered := make([]ahptypes.PendingMessage, 0, len(byID))
		seen := make(map[string]struct{}, len(byID))
		for _, id := range a.Order {
			if msg, ok := byID[id]; ok {
				if _, dup := seen[id]; !dup {
					seen[id] = struct{}{}
					reordered = append(reordered, msg)
				}
			}
		}
		// Append messages absent from `order`, preserving their original
		// relative order in state.QueuedMessages (mirrors the canonical
		// TypeScript reducer in types/channels-session/reducer.ts).
		for _, m := range state.QueuedMessages {
			if _, in := seen[m.Id]; !in {
				reordered = append(reordered, m)
			}
		}
		state.QueuedMessages = reordered
		return ReduceOutcomeApplied
	case *ahptypes.ChatDraftChangedAction:
		state.Draft = a.Draft
		return ReduceOutcomeApplied
	}
	return ReduceOutcomeOutOfScope
}

func mergeChatSummaryPartial(summary *ahptypes.ChatSummary, changes ahptypes.PartialChatSummary) {
	if changes.Title != nil {
		summary.Title = *changes.Title
	}
	if changes.Status != nil {
		summary.Status = *changes.Status
	}
	if changes.Activity != nil {
		summary.Activity = changes.Activity
	}
	if changes.ModifiedAt != nil {
		summary.ModifiedAt = *changes.ModifiedAt
	}
	if changes.Origin != nil {
		summary.Origin = changes.Origin
	}
	if changes.WorkingDirectory != nil {
		summary.WorkingDirectory = changes.WorkingDirectory
	}
}

// ─── Session Reducer ───────────────────────────────────────────────────

// ApplyActionToSession applies action to the [ahptypes.SessionState]
// in place. Returns [ReduceOutcomeOutOfScope] for actions that target
// a different state tree.
func ApplyActionToSession(state *ahptypes.SessionState, action ahptypes.StateAction) ReduceOutcome {
	switch a := action.Value.(type) {
	case *ahptypes.SessionReadyAction:
		state.Lifecycle = ahptypes.SessionLifecycleReady
		return ReduceOutcomeApplied
	case *ahptypes.SessionCreationFailedAction:
		state.Lifecycle = ahptypes.SessionLifecycleCreationFailed
		errCopy := a.Error
		state.CreationError = &errCopy
		return ReduceOutcomeApplied
	case *ahptypes.SessionChatAddedAction:
		for i := range state.Chats {
			if state.Chats[i].Resource == a.Summary.Resource {
				state.Chats[i] = a.Summary
				return ReduceOutcomeApplied
			}
		}
		state.Chats = append(state.Chats, a.Summary)
		return ReduceOutcomeApplied
	case *ahptypes.SessionChatRemovedAction:
		for i := range state.Chats {
			if state.Chats[i].Resource == a.Chat {
				state.Chats = append(state.Chats[:i], state.Chats[i+1:]...)
				if state.DefaultChat != nil && *state.DefaultChat == a.Chat {
					state.DefaultChat = nil
				}
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp
	case *ahptypes.SessionChatUpdatedAction:
		for i := range state.Chats {
			if state.Chats[i].Resource == a.Chat {
				mergeChatSummaryPartial(&state.Chats[i], a.Changes)
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp
	case *ahptypes.SessionDefaultChatChangedAction:
		state.DefaultChat = a.DefaultChat
		return ReduceOutcomeApplied
	case *ahptypes.SessionTitleChangedAction:
		state.Title = a.Title
		return ReduceOutcomeApplied
	case *ahptypes.SessionIsReadChangedAction:
		state.Status = withStatusFlag(state.Status, ahptypes.SessionStatusIsRead, a.IsRead)
		return ReduceOutcomeApplied
	case *ahptypes.SessionIsArchivedChangedAction:
		state.Status = withStatusFlag(state.Status, ahptypes.SessionStatusIsArchived, a.IsArchived)
		return ReduceOutcomeApplied
	case *ahptypes.SessionActivityChangedAction:
		state.Activity = a.Activity
		return ReduceOutcomeApplied
	case *ahptypes.SessionChangesetsChangedAction:
		if a.Changesets == nil {
			state.Changesets = nil
		} else {
			state.Changesets = append([]ahptypes.Changeset(nil), a.Changesets...)
		}
		return ReduceOutcomeApplied
	case *ahptypes.SessionConfigChangedAction:
		if state.Config == nil {
			return ReduceOutcomeNoOp
		}
		replace := a.Replace != nil && *a.Replace
		if replace {
			state.Config.Values = make(map[string]json.RawMessage, len(a.Config))
		} else if state.Config.Values == nil {
			state.Config.Values = make(map[string]json.RawMessage, len(a.Config))
		}
		for k, v := range a.Config {
			state.Config.Values[k] = v
		}
		return ReduceOutcomeApplied
	case *ahptypes.SessionMetaChangedAction:
		state.Meta = a.Meta
		return ReduceOutcomeApplied
	case *ahptypes.SessionServerToolsChangedAction:
		state.ServerTools = append([]ahptypes.ToolDefinition(nil), a.Tools...)
		return ReduceOutcomeApplied
	case *ahptypes.SessionActiveClientSetAction:
		for i := range state.ActiveClients {
			if state.ActiveClients[i].ClientId == a.ActiveClient.ClientId {
				state.ActiveClients[i] = a.ActiveClient
				return ReduceOutcomeApplied
			}
		}
		state.ActiveClients = append(state.ActiveClients, a.ActiveClient)
		return ReduceOutcomeApplied
	case *ahptypes.SessionActiveClientRemovedAction:
		for i := range state.ActiveClients {
			if state.ActiveClients[i].ClientId == a.ClientId {
				state.ActiveClients = append(state.ActiveClients[:i], state.ActiveClients[i+1:]...)
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp
	case *ahptypes.SessionInputNeededSetAction:
		id, ok := sessionInputRequestID(a.Request)
		if !ok {
			return ReduceOutcomeNoOp
		}
		for i := range state.InputNeeded {
			if got, ok := sessionInputRequestID(state.InputNeeded[i]); ok && got == id {
				state.InputNeeded[i] = a.Request
				state.Status = withInputNeededStatus(state.Status, state.InputNeeded)
				return ReduceOutcomeApplied
			}
		}
		state.InputNeeded = append(state.InputNeeded, a.Request)
		state.Status = withInputNeededStatus(state.Status, state.InputNeeded)
		return ReduceOutcomeApplied
	case *ahptypes.SessionInputNeededRemovedAction:
		for i := range state.InputNeeded {
			if got, ok := sessionInputRequestID(state.InputNeeded[i]); ok && got == a.Id {
				state.InputNeeded = append(state.InputNeeded[:i], state.InputNeeded[i+1:]...)
				if len(state.InputNeeded) == 0 {
					state.InputNeeded = nil
				}
				state.Status = withInputNeededStatus(state.Status, state.InputNeeded)
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp
	case *ahptypes.SessionCustomizationsChangedAction:
		state.Customizations = append([]ahptypes.Customization(nil), a.Customizations...)
		return ReduceOutcomeApplied
	case *ahptypes.SessionCustomizationToggledAction:
		if state.Customizations == nil {
			return ReduceOutcomeNoOp
		}
		if applyToggle(state.Customizations, a.Id, a.Enabled) {
			return ReduceOutcomeApplied
		}
		return ReduceOutcomeNoOp
	case *ahptypes.SessionCustomizationUpdatedAction:
		actionID, ok := customizationID(a.Customization)
		if !ok {
			return ReduceOutcomeNoOp
		}
		list := state.Customizations
		idx := -1
		for i := range list {
			if got, ok := customizationID(list[i]); ok && got == actionID {
				idx = i
				break
			}
		}
		if idx >= 0 {
			list[idx] = a.Customization
		} else {
			list = append(list, a.Customization)
		}
		state.Customizations = list
		return ReduceOutcomeApplied
	case *ahptypes.SessionCustomizationRemovedAction:
		if state.Customizations == nil {
			return ReduceOutcomeNoOp
		}
		list := state.Customizations
		for i := range list {
			if got, ok := customizationID(list[i]); ok && got == a.Id {
				state.Customizations = append(list[:i], list[i+1:]...)
				return ReduceOutcomeApplied
			}
		}
		for i := range list {
			children := containerChildren(&list[i])
			if children == nil {
				continue
			}
			for j := range *children {
				if got, ok := childCustomizationID((*children)[j]); ok && got == a.Id {
					*children = append((*children)[:j], (*children)[j+1:]...)
					return ReduceOutcomeApplied
				}
			}
		}
		return ReduceOutcomeNoOp
	case *ahptypes.SessionMcpServerStateChangedAction:
		return updateMcpServerCustomizationState(state, a.Id, a.State, a.Channel)
	case *ahptypes.SessionMcpServerStartRequestedAction:
		return updateMcpServerCustomizationState(state, a.Id, ahptypes.McpServerState{Value: &ahptypes.McpServerStartingState{
			Kind: ahptypes.McpServerStatusStarting,
		}}, nil)
	case *ahptypes.SessionMcpServerStopRequestedAction:
		return updateMcpServerCustomizationState(state, a.Id, ahptypes.McpServerState{Value: &ahptypes.McpServerStoppedState{
			Kind: ahptypes.McpServerStatusStopped,
		}}, nil)
	}
	return ReduceOutcomeOutOfScope
}

func applyTurnStarted(state *ahptypes.ChatState, a *ahptypes.ChatTurnStartedAction) ReduceOutcome {
	state.ActiveTurn = &ahptypes.ActiveTurn{
		Id:            a.TurnId,
		StartedAt:     a.StartedAt,
		Message:       a.Message,
		ResponseParts: []ahptypes.ResponsePart{},
	}
	state.Status = summaryStatus(state, nil)
	state.ModifiedAt = nowISOString()
	state.Status = withStatusFlag(state.Status, ahptypes.SessionStatusIsRead, false)

	if a.QueuedMessageId != nil {
		qmid := *a.QueuedMessageId
		if state.SteeringMessage != nil && state.SteeringMessage.Id == qmid {
			state.SteeringMessage = nil
		}
		if state.QueuedMessages != nil {
			next := state.QueuedMessages[:0]
			for _, m := range state.QueuedMessages {
				if m.Id == qmid {
					continue
				}
				next = append(next, m)
			}
			if len(next) == 0 {
				state.QueuedMessages = nil
			} else {
				state.QueuedMessages = next
			}
		}
	}
	return ReduceOutcomeApplied
}

func applyToolCallDelta(state *ahptypes.ChatState, a *ahptypes.ChatToolCallDeltaAction) ReduceOutcome {
	return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
		s, ok := tc.Value.(*ahptypes.ToolCallStreamingState)
		if !ok {
			return tc
		}
		current := ""
		if s.PartialInput != nil {
			current = *s.PartialInput
		}
		joined := current + a.Content
		s.PartialInput = &joined
		if a.Meta != nil {
			s.Meta = a.Meta
		}
		if a.InvocationMessage != nil {
			im := *a.InvocationMessage
			s.InvocationMessage = &im
		}
		return tc
	})
}

func applyToolCallReady(state *ahptypes.ChatState, a *ahptypes.ChatToolCallReadyAction) ReduceOutcome {
	return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
		common := toolCallMeta(tc)
		if a.Meta != nil {
			common.meta = a.Meta
		}
		var pending *ahptypes.ToolCallPendingConfirmationState
		if value, ok := tc.Value.(*ahptypes.ToolCallPendingConfirmationState); ok {
			pending = value
		}
		switch tc.Value.(type) {
		case *ahptypes.ToolCallStreamingState,
			*ahptypes.ToolCallRunningState,
			*ahptypes.ToolCallPendingConfirmationState:
			if a.Confirmed != nil {
				return ahptypes.ToolCallState{Value: &ahptypes.ToolCallRunningState{
					Status:            ahptypes.ToolCallStatusRunning,
					ToolCallId:        common.id,
					ToolName:          common.name,
					DisplayName:       common.displayName,
					Intention:         common.intention,
					Contributor:       common.contributor,
					Meta:              common.meta,
					InvocationMessage: a.InvocationMessage,
					ToolInput:         a.ToolInput,
					Confirmed:         *a.Confirmed,
				}}
			}
			next := &ahptypes.ToolCallPendingConfirmationState{
				Status:            ahptypes.ToolCallStatusPendingConfirmation,
				ToolCallId:        common.id,
				ToolName:          common.name,
				DisplayName:       common.displayName,
				Intention:         common.intention,
				Contributor:       common.contributor,
				Meta:              common.meta,
				InvocationMessage: a.InvocationMessage,
				ToolInput:         a.ToolInput,
				ConfirmationTitle: a.ConfirmationTitle,
				RiskAssessment:    a.RiskAssessment,
				Edits:             a.Edits,
				Editable:          a.Editable,
				Options:           a.Options,
			}
			if pending != nil {
				if next.ToolInput == nil {
					next.ToolInput = pending.ToolInput
				}
				if next.ConfirmationTitle == nil {
					next.ConfirmationTitle = pending.ConfirmationTitle
				}
				if next.RiskAssessment == nil {
					next.RiskAssessment = pending.RiskAssessment
				}
				if next.Edits == nil {
					next.Edits = pending.Edits
				}
				if next.Editable == nil {
					next.Editable = pending.Editable
				}
				if next.Options == nil {
					next.Options = pending.Options
				}
			}
			return ahptypes.ToolCallState{Value: next}
		}
		return tc
	})
}

func resolveSelectedOption(options []ahptypes.ConfirmationOption, id *string) *ahptypes.ConfirmationOption {
	if id == nil {
		return nil
	}
	for i := range options {
		if options[i].Id == *id {
			opt := options[i]
			return &opt
		}
	}
	return nil
}

func applyToolCallConfirmed(state *ahptypes.ChatState, a *ahptypes.ChatToolCallConfirmedAction) ReduceOutcome {
	return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
		s, ok := tc.Value.(*ahptypes.ToolCallPendingConfirmationState)
		if !ok {
			return tc
		}
		selected := resolveSelectedOption(s.Options, a.SelectedOptionId)
		if a.Approved {
			toolInput := s.ToolInput
			if a.EditedToolInput != nil {
				toolInput = a.EditedToolInput
			}
			meta := s.Meta
			if a.Meta != nil {
				meta = a.Meta
			}
			confirmed := ahptypes.ToolCallConfirmationReasonNotNeeded
			if a.Confirmed != nil {
				confirmed = *a.Confirmed
			}
			return ahptypes.ToolCallState{Value: &ahptypes.ToolCallRunningState{
				Status:            ahptypes.ToolCallStatusRunning,
				ToolCallId:        s.ToolCallId,
				ToolName:          s.ToolName,
				DisplayName:       s.DisplayName,
				Intention:         s.Intention,
				Contributor:       s.Contributor,
				Meta:              meta,
				InvocationMessage: s.InvocationMessage,
				ToolInput:         toolInput,
				Confirmed:         confirmed,
				SelectedOption:    selected,
			}}
		}
		reason := ahptypes.ToolCallCancellationReasonDenied
		if a.Reason != nil {
			reason = *a.Reason
		}
		meta := s.Meta
		if a.Meta != nil {
			meta = a.Meta
		}
		return ahptypes.ToolCallState{Value: &ahptypes.ToolCallCancelledState{
			Status:            ahptypes.ToolCallStatusCancelled,
			ToolCallId:        s.ToolCallId,
			ToolName:          s.ToolName,
			DisplayName:       s.DisplayName,
			Intention:         s.Intention,
			Contributor:       s.Contributor,
			Meta:              meta,
			InvocationMessage: s.InvocationMessage,
			ToolInput:         s.ToolInput,
			Reason:            reason,
			ReasonMessage:     a.ReasonMessage,
			UserSuggestion:    a.UserSuggestion,
			SelectedOption:    selected,
		}}
	})
}

func applyToolCallComplete(state *ahptypes.ChatState, a *ahptypes.ChatToolCallCompleteAction) ReduceOutcome {
	return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
		common := toolCallMeta(tc)
		if a.Meta != nil {
			common.meta = a.Meta
		}
		var (
			invocation       ahptypes.StringOrMarkdown
			toolInput        *string
			confirmed        = ahptypes.ToolCallConfirmationReasonNotNeeded
			selectedOption   *ahptypes.ConfirmationOption
			preAuthContent   []ahptypes.ToolResultContent
			fromAuthRequired bool
		)
		switch v := tc.Value.(type) {
		case *ahptypes.ToolCallRunningState:
			invocation = v.InvocationMessage
			toolInput = v.ToolInput
			confirmed = v.Confirmed
			selectedOption = v.SelectedOption
		case *ahptypes.ToolCallPendingConfirmationState:
			invocation = v.InvocationMessage
			toolInput = v.ToolInput
		case *ahptypes.ToolCallAuthRequiredState:
			// A client MAY cancel an auth-required MCP tool call by dispatching a
			// failed completion instead of authenticating. A successful completion
			// is invalid from auth-required — execution never resumed after the
			// challenge — and is ignored, leaving the call in auth-required. Any
			// partial content produced before the call paused for auth is
			// preserved unless the dispatched result supplies its own content.
			if a.Result.Success {
				return tc
			}
			invocation = v.InvocationMessage
			toolInput = v.ToolInput
			confirmed = v.Confirmed
			selectedOption = v.SelectedOption
			preAuthContent = v.Content
			fromAuthRequired = true
		default:
			return tc
		}
		content := a.Result.Content
		if content == nil {
			content = preAuthContent
		}
		// Cancelling from auth-required always completes terminally: the
		// pending auth challenge isn't a "pending result" the client can
		// review, so requiresResultConfirmation is ignored for this path —
		// it must never enter pending-result-confirmation.
		requiresResultConfirmation := a.RequiresResultConfirmation != nil && *a.RequiresResultConfirmation && !fromAuthRequired
		if requiresResultConfirmation {
			return ahptypes.ToolCallState{Value: &ahptypes.ToolCallPendingResultConfirmationState{
				Status:            ahptypes.ToolCallStatusPendingResultConfirmation,
				ToolCallId:        common.id,
				ToolName:          common.name,
				DisplayName:       common.displayName,
				Intention:         common.intention,
				Contributor:       common.contributor,
				Meta:              common.meta,
				InvocationMessage: invocation,
				ToolInput:         toolInput,
				Success:           a.Result.Success,
				PastTenseMessage:  a.Result.PastTenseMessage,
				Content:           append([]ahptypes.ToolResultContent(nil), content...),
				StructuredContent: a.Result.StructuredContent,
				Error:             a.Result.Error,
				Confirmed:         confirmed,
				SelectedOption:    selectedOption,
			}}
		}
		return ahptypes.ToolCallState{Value: &ahptypes.ToolCallCompletedState{
			Status:            ahptypes.ToolCallStatusCompleted,
			ToolCallId:        common.id,
			ToolName:          common.name,
			DisplayName:       common.displayName,
			Intention:         common.intention,
			Contributor:       common.contributor,
			Meta:              common.meta,
			InvocationMessage: invocation,
			ToolInput:         toolInput,
			Success:           a.Result.Success,
			PastTenseMessage:  a.Result.PastTenseMessage,
			Content:           append([]ahptypes.ToolResultContent(nil), content...),
			StructuredContent: a.Result.StructuredContent,
			Error:             a.Result.Error,
			Confirmed:         confirmed,
			SelectedOption:    selectedOption,
		}}
	})
}

func applyToolCallResultConfirmed(state *ahptypes.ChatState, a *ahptypes.ChatToolCallResultConfirmedAction) ReduceOutcome {
	return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
		s, ok := tc.Value.(*ahptypes.ToolCallPendingResultConfirmationState)
		if !ok {
			return tc
		}
		if a.Approved {
			meta := s.Meta
			if a.Meta != nil {
				meta = a.Meta
			}
			return ahptypes.ToolCallState{Value: &ahptypes.ToolCallCompletedState{
				Status:            ahptypes.ToolCallStatusCompleted,
				ToolCallId:        s.ToolCallId,
				ToolName:          s.ToolName,
				DisplayName:       s.DisplayName,
				Intention:         s.Intention,
				Contributor:       s.Contributor,
				Meta:              meta,
				InvocationMessage: s.InvocationMessage,
				ToolInput:         s.ToolInput,
				Success:           s.Success,
				PastTenseMessage:  s.PastTenseMessage,
				Content:           s.Content,
				StructuredContent: s.StructuredContent,
				Error:             s.Error,
				Confirmed:         s.Confirmed,
				SelectedOption:    s.SelectedOption,
			}}
		}
		meta := s.Meta
		if a.Meta != nil {
			meta = a.Meta
		}
		return ahptypes.ToolCallState{Value: &ahptypes.ToolCallCancelledState{
			Status:            ahptypes.ToolCallStatusCancelled,
			ToolCallId:        s.ToolCallId,
			ToolName:          s.ToolName,
			DisplayName:       s.DisplayName,
			Intention:         s.Intention,
			Contributor:       s.Contributor,
			Meta:              meta,
			InvocationMessage: s.InvocationMessage,
			ToolInput:         s.ToolInput,
			Reason:            ahptypes.ToolCallCancellationReasonResultDenied,
			SelectedOption:    s.SelectedOption,
		}}
	})
}

func applyToolCallAuthRequired(state *ahptypes.ChatState, a *ahptypes.ChatToolCallAuthRequiredAction) ReduceOutcome {
	return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
		s, ok := tc.Value.(*ahptypes.ToolCallRunningState)
		if !ok {
			return tc
		}
		if s.Contributor == nil {
			return tc
		}
		if _, ok := s.Contributor.Value.(*ahptypes.ToolCallMcpContributor); !ok {
			return tc
		}
		meta := s.Meta
		if a.Meta != nil {
			meta = a.Meta
		}
		return ahptypes.ToolCallState{Value: &ahptypes.ToolCallAuthRequiredState{
			Status:            ahptypes.ToolCallStatusAuthRequired,
			ToolCallId:        s.ToolCallId,
			ToolName:          s.ToolName,
			DisplayName:       s.DisplayName,
			Intention:         s.Intention,
			Contributor:       s.Contributor,
			Meta:              meta,
			InvocationMessage: s.InvocationMessage,
			ToolInput:         s.ToolInput,
			Confirmed:         s.Confirmed,
			SelectedOption:    s.SelectedOption,
			Auth:              a.Auth,
			Content:           append([]ahptypes.ToolResultContent(nil), s.Content...),
		}}
	})
}

func applyToolCallAuthResolved(state *ahptypes.ChatState, a *ahptypes.ChatToolCallAuthResolvedAction) ReduceOutcome {
	return updateToolCall(state, a.TurnId, a.ToolCallId, func(tc ahptypes.ToolCallState) ahptypes.ToolCallState {
		s, ok := tc.Value.(*ahptypes.ToolCallAuthRequiredState)
		if !ok {
			return tc
		}
		meta := s.Meta
		if a.Meta != nil {
			meta = a.Meta
		}
		return ahptypes.ToolCallState{Value: &ahptypes.ToolCallRunningState{
			Status:            ahptypes.ToolCallStatusRunning,
			ToolCallId:        s.ToolCallId,
			ToolName:          s.ToolName,
			DisplayName:       s.DisplayName,
			Intention:         s.Intention,
			Contributor:       s.Contributor,
			Meta:              meta,
			InvocationMessage: s.InvocationMessage,
			ToolInput:         s.ToolInput,
			Confirmed:         s.Confirmed,
			SelectedOption:    s.SelectedOption,
			Content:           append([]ahptypes.ToolResultContent(nil), s.Content...),
		}}
	})
}

func updateMcpServerCustomizationState(state *ahptypes.SessionState, id string, nextState ahptypes.McpServerState, channel *ahptypes.URI) ReduceOutcome {
	list := state.Customizations
	if list == nil {
		return ReduceOutcomeNoOp
	}
	for i := range list {
		got, ok := customizationID(list[i])
		if !ok || got != id {
			continue
		}
		mcp, ok := list[i].Value.(*ahptypes.McpServerCustomization)
		if !ok {
			return ReduceOutcomeNoOp
		}
		mcp.State = nextState
		mcp.Channel = channel
		return ReduceOutcomeApplied
	}
	for i := range list {
		children := containerChildren(&list[i])
		if children == nil {
			continue
		}
		for j := range *children {
			got, ok := childCustomizationID((*children)[j])
			if !ok || got != id {
				continue
			}
			mcp, ok := (*children)[j].Value.(*ahptypes.McpServerCustomization)
			if !ok {
				return ReduceOutcomeNoOp
			}
			mcp.State = nextState
			mcp.Channel = channel
			return ReduceOutcomeApplied
		}
	}
	return ReduceOutcomeNoOp
}

func applyTruncated(state *ahptypes.ChatState, turnID *string) ReduceOutcome {
	if turnID == nil {
		state.Turns = []ahptypes.Turn{}
		state.TurnsNextCursor = nil
	} else {
		idx := -1
		for i := range state.Turns {
			if state.Turns[i].Id == *turnID {
				idx = i
				break
			}
		}
		if idx < 0 {
			return ReduceOutcomeNoOp
		}
		state.Turns = state.Turns[:idx+1]
	}
	state.ActiveTurn = nil
	touchChatModified(state)
	state.Status = summaryStatus(state, nil)
	return ReduceOutcomeApplied
}

func applyInputAnswerChanged(state *ahptypes.ChatState, a *ahptypes.ChatInputAnswerChangedAction) ReduceOutcome {
	if state.ActiveTurn == nil {
		return ReduceOutcomeNoOp
	}
	for i := range state.ActiveTurn.ResponseParts {
		input, ok := state.ActiveTurn.ResponseParts[i].Value.(*ahptypes.InputRequestResponsePart)
		if !ok || input.Response != nil || input.Request.Id != a.RequestId {
			continue
		}
		req := &input.Request
		if req.Answers == nil {
			req.Answers = make(map[string]ahptypes.ChatInputAnswer)
		}
		if a.Answer == nil {
			delete(req.Answers, a.QuestionId)
		} else {
			req.Answers[a.QuestionId] = *a.Answer
		}
		if len(req.Answers) == 0 {
			req.Answers = nil
		}
		touchChatModified(state)
		return ReduceOutcomeApplied
	}
	return ReduceOutcomeNoOp
}

// ─── Terminal Reducer ──────────────────────────────────────────────────

// ApplyActionToTerminal applies action to the [ahptypes.TerminalState]
// in place. Returns [ReduceOutcomeOutOfScope] for actions that target a
// different state tree.
func ApplyActionToTerminal(state *ahptypes.TerminalState, action ahptypes.StateAction) ReduceOutcome {
	switch a := action.Value.(type) {
	case *ahptypes.TerminalDataAction:
		appendTerminalData(state, a.Data)
		return ReduceOutcomeApplied
	case *ahptypes.TerminalInputAction:
		return ReduceOutcomeNoOp
	case *ahptypes.TerminalResizedAction:
		cols := a.Cols
		rows := a.Rows
		state.Cols = &cols
		state.Rows = &rows
		return ReduceOutcomeApplied
	case *ahptypes.TerminalClaimedAction:
		state.Claim = a.Claim
		return ReduceOutcomeApplied
	case *ahptypes.TerminalTitleChangedAction:
		state.Title = a.Title
		return ReduceOutcomeApplied
	case *ahptypes.TerminalCwdChangedAction:
		cwd := a.Cwd
		state.Cwd = &cwd
		return ReduceOutcomeApplied
	case *ahptypes.TerminalExitedAction:
		state.ExitCode = a.ExitCode
		return ReduceOutcomeApplied
	case *ahptypes.TerminalClearedAction:
		state.Content = []ahptypes.TerminalContentPart{}
		return ReduceOutcomeApplied
	case *ahptypes.TerminalCommandDetectionAvailableAction:
		t := true
		state.SupportsCommandDetection = &t
		return ReduceOutcomeApplied
	case *ahptypes.TerminalCommandExecutedAction:
		state.Content = append(state.Content, ahptypes.TerminalContentPart{Value: &ahptypes.TerminalCommandPart{
			Type:        "command",
			CommandId:   a.CommandId,
			CommandLine: a.CommandLine,
			Timestamp:   a.Timestamp,
			IsComplete:  false,
		}})
		t := true
		state.SupportsCommandDetection = &t
		return ReduceOutcomeApplied
	case *ahptypes.TerminalCommandFinishedAction:
		for i := range state.Content {
			c, ok := state.Content[i].Value.(*ahptypes.TerminalCommandPart)
			if !ok {
				continue
			}
			if c.CommandId == a.CommandId {
				c.IsComplete = true
				c.ExitCode = a.ExitCode
				c.DurationMs = a.DurationMs
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp
	}
	return ReduceOutcomeOutOfScope
}

func appendTerminalData(state *ahptypes.TerminalState, data string) {
	n := len(state.Content)
	if n > 0 {
		switch tail := state.Content[n-1].Value.(type) {
		case *ahptypes.TerminalCommandPart:
			if !tail.IsComplete {
				tail.Output += data
				return
			}
		case *ahptypes.TerminalUnclassifiedPart:
			tail.Value += data
			return
		}
	}
	state.Content = append(state.Content, ahptypes.TerminalContentPart{Value: &ahptypes.TerminalUnclassifiedPart{
		Type:  "unclassified",
		Value: data,
	}})
}

// ─── Changeset Reducer ─────────────────────────────────────────────────

// ApplyActionToChangeset applies action to the [ahptypes.ChangesetState]
// in place. Returns [ReduceOutcomeOutOfScope] for actions that target a
// different state tree.
func ApplyActionToChangeset(state *ahptypes.ChangesetState, action ahptypes.StateAction) ReduceOutcome {
	switch a := action.Value.(type) {
	case *ahptypes.ChangesetStatusChangedAction:
		state.Status = a.Status
		if a.Status == ahptypes.ChangesetStatusError {
			state.Error = a.Error
		} else {
			state.Error = nil
		}
		return ReduceOutcomeApplied

	case *ahptypes.ChangesetFileSetAction:
		for i := range state.Files {
			if state.Files[i].Id == a.File.Id {
				state.Files[i] = a.File
				return ReduceOutcomeApplied
			}
		}
		state.Files = append(state.Files, a.File)
		return ReduceOutcomeApplied

	case *ahptypes.ChangesetFileRemovedAction:
		for i := range state.Files {
			if state.Files[i].Id == a.FileId {
				state.Files = append(state.Files[:i], state.Files[i+1:]...)
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp

	case *ahptypes.ChangesetFilesReviewChangedAction:
		ids := make(map[string]struct{}, len(a.Files))
		for _, id := range a.Files {
			ids[id] = struct{}{}
		}
		changed := false
		for i := range state.Files {
			if _, ok := ids[state.Files[i].Id]; !ok {
				continue
			}
			if state.Files[i].Reviewed != nil && *state.Files[i].Reviewed == a.Reviewed {
				continue
			}
			reviewed := a.Reviewed
			state.Files[i].Reviewed = &reviewed
			changed = true
		}
		if !changed {
			return ReduceOutcomeNoOp
		}
		return ReduceOutcomeApplied

	case *ahptypes.ChangesetContentChangedAction:
		state.Files = a.Files
		if a.Operations != nil {
			state.Operations = a.Operations
		}
		state.Error = a.Error
		return ReduceOutcomeApplied

	case *ahptypes.ChangesetOperationsChangedAction:
		state.Operations = a.Operations
		return ReduceOutcomeApplied

	case *ahptypes.ChangesetOperationStatusChangedAction:
		for i := range state.Operations {
			if state.Operations[i].Id == a.OperationId {
				state.Operations[i].Status = a.Status
				if a.Status == ahptypes.ChangesetOperationStatusError {
					state.Operations[i].Error = a.Error
				} else {
					state.Operations[i].Error = nil
				}
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp

	case *ahptypes.ChangesetClearedAction:
		if len(state.Files) == 0 {
			return ReduceOutcomeNoOp
		}
		state.Files = []ahptypes.ChangesetFile{}
		return ReduceOutcomeApplied
	}
	return ReduceOutcomeOutOfScope
}

// ─── Annotations Reducer ──────────────────────────────────────────────

// ApplyActionToAnnotations applies action to the [ahptypes.AnnotationsState]
// in place. Returns [ReduceOutcomeOutOfScope] for actions that target a
// different state tree.
func ApplyActionToAnnotations(state *ahptypes.AnnotationsState, action ahptypes.StateAction) ReduceOutcome {
	switch a := action.Value.(type) {
	case *ahptypes.AnnotationsSetAction:
		for i := range state.Annotations {
			if state.Annotations[i].Id == a.Annotation.Id {
				state.Annotations[i] = a.Annotation
				return ReduceOutcomeApplied
			}
		}
		state.Annotations = append(state.Annotations, a.Annotation)
		return ReduceOutcomeApplied

	case *ahptypes.AnnotationsUpdatedAction:
		for i := range state.Annotations {
			if state.Annotations[i].Id == a.AnnotationId {
				if a.TurnId != nil {
					state.Annotations[i].TurnId = *a.TurnId
				}
				if a.Resource != nil {
					state.Annotations[i].Resource = *a.Resource
				}
				if a.Range != nil {
					state.Annotations[i].Range = a.Range
				}
				if a.Resolved != nil {
					state.Annotations[i].Resolved = *a.Resolved
				}
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp

	case *ahptypes.AnnotationsRemovedAction:
		for i := range state.Annotations {
			if state.Annotations[i].Id == a.AnnotationId {
				state.Annotations = append(state.Annotations[:i], state.Annotations[i+1:]...)
				return ReduceOutcomeApplied
			}
		}
		return ReduceOutcomeNoOp

	case *ahptypes.AnnotationsEntrySetAction:
		for i := range state.Annotations {
			if state.Annotations[i].Id != a.AnnotationId {
				continue
			}
			entries := state.Annotations[i].Entries
			for j := range entries {
				if entries[j].Id == a.Entry.Id {
					state.Annotations[i].Entries[j] = a.Entry
					return ReduceOutcomeApplied
				}
			}
			state.Annotations[i].Entries = append(state.Annotations[i].Entries, a.Entry)
			return ReduceOutcomeApplied
		}
		return ReduceOutcomeNoOp

	case *ahptypes.AnnotationsEntryRemovedAction:
		for i := range state.Annotations {
			if state.Annotations[i].Id != a.AnnotationId {
				continue
			}
			entries := state.Annotations[i].Entries
			for j := range entries {
				if entries[j].Id == a.EntryId {
					state.Annotations[i].Entries = append(entries[:j], entries[j+1:]...)
					return ReduceOutcomeApplied
				}
			}
			return ReduceOutcomeNoOp
		}
		return ReduceOutcomeNoOp
	}
	return ReduceOutcomeOutOfScope
}

// ─── Resource-Watch Reducer ────────────────────────────────────────────

// ApplyActionToResourceWatch applies action to the
// [ahptypes.ResourceWatchState] in place. The state captures only the
// watch descriptor set at subscription time; change events delivered
// via [ahptypes.ResourceWatchChangedAction] are pass-through and leave
// the state unchanged. Returns [ReduceOutcomeOutOfScope] for actions
// that target a different state tree.
func ApplyActionToResourceWatch(state *ahptypes.ResourceWatchState, action ahptypes.StateAction) ReduceOutcome {
	switch action.Value.(type) {
	case *ahptypes.ResourceWatchChangedAction:
		return ReduceOutcomeNoOp
	}
	return ReduceOutcomeOutOfScope
}
