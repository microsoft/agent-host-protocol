import test from 'node:test';
import assert from 'node:assert/strict';
import { activeParts, inputAction, pendingInputs, toolAction, validateInputCommand } from '../src/inputs.js';

const args = { turn: 'turn', requestId: 'request', response: 'accept', confirm: true };
const question = { id: 'choice', kind: 'single-select', options: [{ id: 'id', label: 'Label' }] };
const parts = (questions: unknown = [question], extra: Record<string, unknown> = {}) =>
  [{ kind: 'inputRequest', request: { id: 'request', questions, ...extra } }];

test('flat selection answers use exact option IDs and refuse ambiguous or malformed input', () => {
  assert.throws(() => inputAction(parts(), { ...args, answers: { choice: 'Label' } }), /option IDs/);
  const many = { ...question, kind: 'multi-select' };
  assert.throws(() => inputAction(parts([many]), { ...args, answers: { choice: ['id', 'id'] } }), /option IDs/);
  assert.throws(() => inputAction(parts([{ ...question, options: {} }]), { ...args, answers: { choice: 'id' } }), /Invalid question options/);
  assert.throws(() => inputAction(parts([question, question]), args), /Invalid input questions/);
  assert.throws(() => inputAction([...parts(), ...parts()], args), /uniquely pending/);
  assert.throws(() => inputAction(parts([], { answers: { x: { state: 'submitted', value: { kind: 'future' } } } }), args), /Invalid synced/);
  assert.deepEqual(inputAction(parts([], { url: 'https://example.com' }), args),
    { type: 'chat/inputCompleted', requestId: 'request', response: 'accept' });
});

test('answer construction preserves optional drafts and skips without promoting or guessing', () => {
  const synced = {
    draft: { state: 'draft', value: { kind: 'boolean', value: false } },
    skip: { state: 'skipped', freeformValues: ['not applicable'] },
  };
  const action = inputAction(parts([question], { answers: synced }), { ...args, answers: { choice: 'id' } });
  assert.deepEqual(action.answers, {
    ...synced, choice: { state: 'submitted', value: { kind: 'selected', value: 'id' } },
  });
  assert.throws(() => inputAction(parts([{ ...question, required: true, defaultValue: 'id' }]), args), /no submitted answer/);
  assert.equal(inputAction(parts([question]), { ...args, response: 'decline' }).answers, undefined);
});

test('pending inspection refuses malformed state rather than returning an empty success', () => {
  assert.deepEqual(pendingInputs({}), { inputs: [], toolCalls: [] });
  assert.throws(() => activeParts({}, 'turn'), /not active/);
  assert.throws(() => pendingInputs({ activeTurn: { id: 'turn' } }), /Invalid active/);
  assert.throws(() => pendingInputs({ activeTurn: { id: 'turn', responseParts: [
    { kind: 'inputRequest', request: null },
  ] } }), /Invalid input/);
});

test('decision validation is strict, including local IPC shapes and confirmation phase', () => {
  assert.throws(() => validateInputCommand('answer', { ...args, confirm: false }), /requires --confirm/);
  assert.throws(() => validateInputCommand('answer', { ...args, response: 'other' }), /--response/);
  assert.throws(() => validateInputCommand('answer', { ...args, turn: undefined }), /--turn/);
  const tool = { turn: 'turn', toolCallId: 'tool', confirm: true, decision: 'approve', phase: 'execution' };
  assert.throws(() => validateInputCommand('confirm-tool', { ...tool, decision: ['approve'] }), /--decision/);
  assert.throws(() => validateInputCommand('confirm-tool', { ...tool, phase: ['result'] }), /--phase/);
  assert.throws(() => validateInputCommand('confirm-tool', { ...tool, phase: 'result', option: 'id' }), /execution/);
  const toolParts = [{ kind: 'toolCall', toolCall: { toolCallId: 'tool', status: 'pending-confirmation' } }];
  assert.throws(() => toolAction(toolParts, { ...tool, option: 'id' }), /no confirmation options/);
  assert.throws(() => toolAction([...toolParts, ...toolParts], tool), /uniquely present/);
  assert.deepEqual(toolAction(toolParts, { ...tool, decision: 'deny' }), {
    type: 'chat/toolCallConfirmed', turnId: 'turn', toolCallId: 'tool', approved: false, reason: 'denied',
  });
  assert.deepEqual(toolAction([{ kind: 'toolCall', toolCall: { toolCallId: 'tool', status: 'pending-result-confirmation' } }],
    { ...tool, phase: 'result', decision: 'deny' }), {
    type: 'chat/toolCallResultConfirmed', turnId: 'turn', toolCallId: 'tool', approved: false,
  });
});
