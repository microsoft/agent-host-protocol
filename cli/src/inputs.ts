import type {
  ChatInputCompletedAction, ChatToolCallConfirmedAction, ChatToolCallResultConfirmedAction,
} from '../../clients/typescript/src/types/channels-chat/actions.js';
import {
  ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind,
  ConfirmationOptionKind, ResponsePartKind, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus,
  type ChatInputAnswer, type ChatInputAnswerValue,
} from '../../clients/typescript/src/types/channels-chat/state.js';
import { ActionType } from '../../clients/typescript/src/types/common/actions.js';
import { CliError, object } from './common.js';

export function protocolId(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new CliError('usage', `${name} must be a string`);
  return value;
}

export function validateInputCommand(command: string, args: Record<string, unknown>): void {
  protocolId(args.turn, '--turn');
  if (args.confirm !== true) throw new CliError('usage', `${command} requires --confirm`);
  if (command === 'answer') {
    protocolId(args.requestId, '--request');
    if (![ChatInputResponseKind.Accept, ChatInputResponseKind.Decline, ChatInputResponseKind.Cancel]
      .some(response => response === args.response)) throw new CliError('usage', '--response must be accept, decline or cancel');
    if (args.answers !== undefined && (!object(args.answers) || args.response !== ChatInputResponseKind.Accept)) {
      throw new CliError('usage', '--answers-file is only valid with --response accept');
    }
  } else {
    protocolId(args.toolCallId, '--tool-call');
    if (args.decision !== 'approve' && args.decision !== 'deny') throw new CliError('usage', '--decision must be approve or deny');
    if (args.phase !== 'execution' && args.phase !== 'result') throw new CliError('usage', '--phase must be execution or result');
    if (args.option !== undefined) {
      protocolId(args.option, '--option');
      if (args.phase === 'result') throw new CliError('usage', '--option is only valid for execution confirmation');
    }
  }
}

export function activeParts(state: Record<string, unknown>, turn?: unknown): Record<string, unknown>[] {
  if (state.activeTurn === undefined) {
    if (turn !== undefined) throw new CliError('precondition', 'Exact requested turn is not active');
    return [];
  }
  const active = state.activeTurn;
  if (!object(active) || typeof active.id !== 'string' || !Array.isArray(active.responseParts)
    || !active.responseParts.every(object)) throw new CliError('protocol', 'Invalid active turn response parts');
  if (turn !== undefined && active.id !== turn) throw new CliError('precondition', 'Exact requested turn is not active');
  return active.responseParts;
}

export function pendingInputs(state: Record<string, unknown>): Record<string, unknown> {
  const parts = activeParts(state);
  const inputs: Record<string, unknown>[] = [];
  const toolCalls: Record<string, unknown>[] = [];
  for (const part of parts) {
    if (part.kind === ResponsePartKind.InputRequest && part.response === undefined) {
      if (!object(part.request) || typeof part.request.id !== 'string') throw new CliError('protocol', 'Invalid input request');
      inputs.push(part.request);
    }
    if (part.kind === ResponsePartKind.ToolCall) {
      if (!object(part.toolCall) || typeof part.toolCall.toolCallId !== 'string') throw new CliError('protocol', 'Invalid tool call');
      const tool = part.toolCall;
      if ([ToolCallStatus.PendingConfirmation, ToolCallStatus.PendingResultConfirmation].some(status => status === tool.status)) {
        toolCalls.push({
          phase: tool.status === ToolCallStatus.PendingConfirmation ? 'execution' : 'result',
          toolCall: tool,
        });
      }
    }
  }
  return { ...(object(state.activeTurn) ? { turnId: state.activeTurn.id } : {}), inputs, toolCalls };
}

function answerValue(question: Record<string, unknown>, value: unknown): ChatInputAnswerValue {
  switch (question.kind) {
    case ChatInputQuestionKind.Text:
      if (typeof value === 'string') return { kind: ChatInputAnswerValueKind.Text, value };
      break;
    case ChatInputQuestionKind.Number:
    case ChatInputQuestionKind.Integer:
      if (typeof value === 'number' && Number.isFinite(value)
        && (question.kind !== ChatInputQuestionKind.Integer || Number.isInteger(value))) {
        return { kind: ChatInputAnswerValueKind.Number, value };
      }
      break;
    case ChatInputQuestionKind.Boolean:
      if (typeof value === 'boolean') return { kind: ChatInputAnswerValueKind.Boolean, value };
      break;
    case ChatInputQuestionKind.SingleSelect:
    case ChatInputQuestionKind.MultiSelect: {
      if (!Array.isArray(question.options) || !question.options.every(option => object(option) && typeof option.id === 'string')) {
        throw new CliError('protocol', 'Invalid question options');
      }
      const ids = question.options.map(option => option.id);
      if (question.kind === ChatInputQuestionKind.SingleSelect && typeof value === 'string' && ids.includes(value)) {
        return { kind: ChatInputAnswerValueKind.Selected, value };
      }
      if (question.kind === ChatInputQuestionKind.MultiSelect && Array.isArray(value)
        && value.every((item): item is string => typeof item === 'string' && ids.includes(item))
        && new Set(value).size === value.length) {
        return { kind: ChatInputAnswerValueKind.SelectedMany, value };
      }
      break;
    }
    default: throw new CliError('precondition', 'Unsupported question kind; inspect the request and use raw dispatch');
  }
  throw new CliError('precondition', `Answer for ${JSON.stringify(question.id)} does not match its question kind or option IDs`);
}

function syncedAnswer(value: unknown): value is ChatInputAnswer {
  if (!object(value)) return false;
  const strings = (items: unknown): items is string[] => Array.isArray(items) && items.every(item => typeof item === 'string');
  if (value.state === ChatInputAnswerState.Skipped) return value.freeformValues === undefined || strings(value.freeformValues);
  if (value.state !== ChatInputAnswerState.Draft && value.state !== ChatInputAnswerState.Submitted) return false;
  const answer = value.value;
  if (!object(answer)) return false;
  switch (answer.kind) {
    case ChatInputAnswerValueKind.Text: return typeof answer.value === 'string';
    case ChatInputAnswerValueKind.Number: return typeof answer.value === 'number' && Number.isFinite(answer.value);
    case ChatInputAnswerValueKind.Boolean: return typeof answer.value === 'boolean';
    case ChatInputAnswerValueKind.Selected:
      return typeof answer.value === 'string' && (answer.freeformValues === undefined || strings(answer.freeformValues));
    case ChatInputAnswerValueKind.SelectedMany:
      return strings(answer.value) && (answer.freeformValues === undefined || strings(answer.freeformValues));
    default: return false;
  }
}

export function inputAction(parts: Record<string, unknown>[], args: Record<string, unknown>): ChatInputCompletedAction {
  const matches = parts.filter(part => part.kind === ResponsePartKind.InputRequest && object(part.request)
    && part.request.id === args.requestId && part.response === undefined);
  if (matches.length !== 1 || !object(matches[0].request)) throw new CliError('precondition', 'Exact input request is not uniquely pending');
  const request = matches[0].request;
  const response = args.response === ChatInputResponseKind.Accept ? ChatInputResponseKind.Accept
    : args.response === ChatInputResponseKind.Decline ? ChatInputResponseKind.Decline : ChatInputResponseKind.Cancel;
  const action: ChatInputCompletedAction = {
    type: ActionType.ChatInputCompleted, requestId: protocolId(args.requestId, '--request'), response,
  };
  if (response !== ChatInputResponseKind.Accept) return action;
  const questions = request.questions ?? [];
  if (!Array.isArray(questions) || !questions.every(q => object(q) && typeof q.id === 'string')
    || new Set(questions.map(q => q.id)).size !== questions.length
    || (request.answers !== undefined && !object(request.answers))) throw new CliError('protocol', 'Invalid input questions or synced answers');
  const supplied = object(args.answers) ? args.answers : {};
  const synced: Record<string, ChatInputAnswer> = {};
  if (object(request.answers)) {
    for (const [id, answer] of Object.entries(request.answers)) {
      if (!syncedAnswer(answer)) throw new CliError('protocol', 'Invalid synced input answer');
      Object.defineProperty(synced, id, { value: answer, enumerable: true });
    }
  }
  for (const id of Object.keys(supplied)) {
    if (!questions.some(q => q.id === id)) throw new CliError('precondition', `Unknown question ID ${JSON.stringify(id)}`);
  }
  const replacements: Record<string, ChatInputAnswer> = {};
  for (const question of questions) {
    if (Object.hasOwn(supplied, question.id)) {
      Object.defineProperty(replacements, question.id, {
        value: { state: ChatInputAnswerState.Submitted, value: answerValue(question, supplied[question.id]) },
        enumerable: true,
      });
    }
    const answer = Object.hasOwn(replacements, question.id) ? replacements[question.id]
      : Object.hasOwn(synced, question.id) ? synced[question.id] : undefined;
    if (question.required === true && (!object(answer) || answer.state !== ChatInputAnswerState.Submitted)) {
      throw new CliError('precondition', `Required question ${JSON.stringify(question.id)} has no submitted answer`);
    }
  }
  // The wire field replaces the synced map; retain answers not explicitly changed.
  if (args.answers !== undefined) action.answers = { ...synced, ...replacements };
  return action;
}

export function toolAction(
  parts: Record<string, unknown>[], args: Record<string, unknown>,
): ChatToolCallConfirmedAction | ChatToolCallResultConfirmedAction {
  const matches = parts.filter(part => part.kind === ResponsePartKind.ToolCall && object(part.toolCall)
    && part.toolCall.toolCallId === args.toolCallId);
  if (matches.length !== 1 || !object(matches[0].toolCall)) throw new CliError('precondition', 'Exact tool call is not uniquely present');
  const tool = matches[0].toolCall;
  const result = args.phase === 'result';
  if (tool.status !== (result ? ToolCallStatus.PendingResultConfirmation : ToolCallStatus.PendingConfirmation)) {
    throw new CliError('precondition', 'Tool call is not awaiting the requested confirmation phase');
  }
  const approved = args.decision === 'approve';
  const base = { turnId: protocolId(args.turn, '--turn'), toolCallId: protocolId(args.toolCallId, '--tool-call') };
  if (result) return { ...base, type: ActionType.ChatToolCallResultConfirmed, approved };
  if (tool.options !== undefined) {
    if (!Array.isArray(tool.options) || !tool.options.every(option => object(option) && typeof option.id === 'string')) {
      throw new CliError('protocol', 'Invalid confirmation options');
    }
    if (tool.options.length && args.option === undefined) throw new CliError('precondition', 'Select an explicit --option from the offered options');
    if (args.option !== undefined) {
      const options = tool.options.filter(option => option.id === args.option);
      if (options.length !== 1 || options[0].kind !== (approved ? ConfirmationOptionKind.Approve : ConfirmationOptionKind.Deny)) {
        throw new CliError('precondition', 'Selected option does not match the decision');
      }
    }
  } else if (args.option !== undefined) throw new CliError('precondition', 'Tool call offers no confirmation options');
  const option = typeof args.option === 'string' ? { selectedOptionId: args.option } : {};
  return approved
    ? { ...base, ...option, type: ActionType.ChatToolCallConfirmed, approved: true, confirmed: ToolCallConfirmationReason.UserAction }
    : { ...base, ...option, type: ActionType.ChatToolCallConfirmed, approved: false, reason: ToolCallCancellationReason.Denied };
}
