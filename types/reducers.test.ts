/**
 * Reducer unit tests.
 *
 * Run: npx tsx --test types/reducers.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  rootReducer,
  sessionReducer,
  isClientDispatchable,
} from './reducers.js';
import { IS_CLIENT_DISPATCHABLE } from './action-origin.generated.js';
import { ActionType } from './actions.js';
import type { IRootState, ISessionState, IToolCallResponsePart } from './state.js';
import {
  SessionLifecycle,
  SessionStatus,
  TurnState,
  ToolCallStatus,
  ToolCallConfirmationReason,
  ToolCallCancellationReason,
  ResponsePartKind,
  PendingMessageKind,
} from './state.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

function readSource(file: string): string {
  return readFileSync(resolve(root, file), 'utf-8');
}

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const S = 'copilot:/test-session';
const T = 'turn-1';
const TC = 'tc-1';

function makeRootState(overrides?: Partial<IRootState>): IRootState {
  return {
    agents: [],
    ...overrides,
  };
}

function makeSessionState(overrides?: Partial<ISessionState>): ISessionState {
  return {
    summary: {
      resource: S,
      provider: 'copilot',
      title: 'Test Session',
      status: SessionStatus.Idle,
      createdAt: 1000,
      modifiedAt: 1000,
    },
    lifecycle: SessionLifecycle.Creating,
    turns: [],
    ...overrides,
  };
}

function makeSessionStateWithActiveTurn(overrides?: Partial<ISessionState>): ISessionState {
  return makeSessionState({
    lifecycle: SessionLifecycle.Ready,
    summary: {
      resource: S,
      provider: 'copilot',
      title: 'Test Session',
      status: SessionStatus.InProgress,
      createdAt: 1000,
      modifiedAt: 2000,
    },
    activeTurn: {
      id: T,
      userMessage: { text: 'Hello' },
      responseParts: [],
      usage: undefined,
    },
    ...overrides,
  });
}

/** Starts a tool call in streaming state. */
function startToolCall(state: ISessionState, toolCallId = TC): ISessionState {
  return sessionReducer(state, {
    type: ActionType.SessionToolCallStart,
    session: S, turnId: T, toolCallId,
    toolName: 'bash', displayName: 'Run Command',
  });
}

/** Gets tool call response parts from responseParts. */
function getToolCallParts(state: ISessionState): IToolCallResponsePart[] {
  const parts = state.activeTurn?.responseParts ?? [];
  return parts.filter((p): p is IToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
}

/** Gets a tool call part by toolCallId. */
function getToolCallPart(state: ISessionState, toolCallId = TC): IToolCallResponsePart | undefined {
  return getToolCallParts(state).find(p => p.toolCall.toolCallId === toolCallId);
}

/** Gets markdown text from responseParts by concatenating all markdown parts. */
function getMarkdownText(state: ISessionState): string {
  const parts = state.activeTurn?.responseParts ?? [];
  return parts
    .filter(p => p.kind === ResponsePartKind.Markdown)
    .map(p => (p as { content: string }).content)
    .join('');
}

/** Creates a markdown response part and returns updated state. */
function createMarkdownPart(state: ISessionState, partId: string, turnId = T): ISessionState {
  return sessionReducer(state, {
    type: ActionType.SessionResponsePart,
    session: S,
    turnId,
    part: { kind: ResponsePartKind.Markdown, id: partId, content: '' },
  });
}

/** Creates a reasoning response part and returns updated state. */
function createReasoningPart(state: ISessionState, partId: string, turnId = T): ISessionState {
  return sessionReducer(state, {
    type: ActionType.SessionResponsePart,
    session: S,
    turnId,
    part: { kind: ResponsePartKind.Reasoning, id: partId, content: '' },
  });
}

/** Advances a streaming tool call to running (auto-confirmed). */
function readyToolCallAutoConfirm(state: ISessionState, toolCallId = TC): ISessionState {
  return sessionReducer(state, {
    type: ActionType.SessionToolCallReady,
    session: S, turnId: T, toolCallId,
    invocationMessage: 'Run',
    confirmed: ToolCallConfirmationReason.NotNeeded,
  });
}

// ─── IS_CLIENT_DISPATCHABLE validation ───────────────────────────────────────

describe('IS_CLIENT_DISPATCHABLE', () => {
  it('matches @clientDispatchable annotations in actions.ts', () => {
    const source = readSource('actions.ts');

    // Parse JSDoc blocks for @clientDispatchable and extract ActionType references
    const jsdocInterfaceRe = /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:interface|type)\s+(\w+)/g;
    const clientDispatchableTypes = new Set<string>();

    for (const match of source.matchAll(jsdocInterfaceRe)) {
      const [, jsdoc, name] = match;
      if (!name.endsWith('Action')) continue;

      const afterDecl = source.slice(match.index! + match[0].length);
      const typeMatch = afterDecl.match(/type:\s*ActionType\.(\w+)/);
      if (!typeMatch) continue;

      if (jsdoc.includes('@clientDispatchable')) {
        clientDispatchableTypes.add(typeMatch[1]);
      }
    }

    // Map ActionType enum members to their string values
    const enumValueRe = /(\w+)\s*=\s*'([^']+)'/g;
    const enumMap = new Map<string, string>();
    for (const match of source.matchAll(enumValueRe)) {
      enumMap.set(match[1], match[2]);
    }

    for (const [memberName, stringValue] of enumMap) {
      if (!(stringValue in IS_CLIENT_DISPATCHABLE)) continue;
      const expected = clientDispatchableTypes.has(memberName);
      const actual = IS_CLIENT_DISPATCHABLE[stringValue as keyof typeof IS_CLIENT_DISPATCHABLE];
      assert.equal(
        actual,
        expected,
        `IS_CLIENT_DISPATCHABLE['${stringValue}'] should be ${expected} (ActionType.${memberName})`,
      );
    }
  });

  it('covers every ActionType enum member', () => {
    const enumValueRe = /(\w+)\s*=\s*'([^']+)'/g;
    const allValues: string[] = [];
    for (const match of readSource('actions.ts').matchAll(enumValueRe)) {
      allValues.push(match[2]);
    }

    const mapKeys = Object.keys(IS_CLIENT_DISPATCHABLE);
    const missing = allValues.filter(v => !mapKeys.includes(v));
    assert.deepStrictEqual(missing, [], `Missing from IS_CLIENT_DISPATCHABLE: ${missing.join(', ')}`);

    const extra = mapKeys.filter(v => !allValues.includes(v));
    assert.deepStrictEqual(extra, [], `Extra in IS_CLIENT_DISPATCHABLE: ${extra.join(', ')}`);
  });
});

// ─── Root Reducer ────────────────────────────────────────────────────────────

describe('rootReducer', () => {
  it('handles root/agentsChanged', () => {
    const state = makeRootState();
    const agents = [{ provider: 'copilot', displayName: 'Copilot', description: 'AI', models: [] }];
    const next = rootReducer(state, { type: ActionType.RootAgentsChanged, agents });
    assert.deepStrictEqual(next.agents, agents);
  });

  it('handles root/activeSessionsChanged', () => {
    const state = makeRootState();
    const next = rootReducer(state, { type: ActionType.RootActiveSessionsChanged, activeSessions: 5 });
    assert.equal(next.activeSessions, 5);
  });

  it('does not mutate original state', () => {
    const state = makeRootState({ agents: [] });
    const agents = [{ provider: 'x', displayName: 'X', description: 'x', models: [] }];
    rootReducer(state, { type: ActionType.RootAgentsChanged, agents });
    assert.deepStrictEqual(state.agents, []);
  });
});

// ─── Session Reducer: Lifecycle ──────────────────────────────────────────────

describe('sessionReducer — lifecycle', () => {
  it('handles session/ready', () => {
    const state = makeSessionState();
    const next = sessionReducer(state, { type: ActionType.SessionReady, session: S });
    assert.equal(next.lifecycle, SessionLifecycle.Ready);
    assert.equal(next.summary.status, SessionStatus.Idle);
  });

  it('handles session/creationFailed', () => {
    const state = makeSessionState();
    const error = { errorType: 'init', message: 'Failed to start' };
    const next = sessionReducer(state, { type: ActionType.SessionCreationFailed, session: S, error });
    assert.equal(next.lifecycle, SessionLifecycle.CreationFailed);
    assert.deepStrictEqual(next.creationError, error);
  });
});

// ─── Session Reducer: Turn Lifecycle ─────────────────────────────────────────

describe('sessionReducer — turn lifecycle', () => {
  it('handles session/turnStarted', () => {
    const state = makeSessionState({ lifecycle: SessionLifecycle.Ready });
    const next = sessionReducer(state, {
      type: ActionType.SessionTurnStarted, session: S, turnId: T,
      userMessage: { text: 'Hello' },
    });
    assert.equal(next.summary.status, SessionStatus.InProgress);
    assert.ok(next.activeTurn);
    assert.equal(next.activeTurn!.id, T);
    assert.equal(next.activeTurn!.userMessage.text, 'Hello');
    assert.deepStrictEqual(next.activeTurn!.responseParts, []);
  });

  it('handles session/delta', () => {
    let state = createMarkdownPart(makeSessionStateWithActiveTurn(), 'md-1');
    state = sessionReducer(state, { type: ActionType.SessionDelta, session: S, turnId: T, partId: 'md-1', content: 'Hello ' });
    state = sessionReducer(state, { type: ActionType.SessionDelta, session: S, turnId: T, partId: 'md-1', content: 'world' });
    assert.equal(getMarkdownText(state), 'Hello world');
  });

  it('ignores session/delta with wrong turnId', () => {
    let state = createMarkdownPart(makeSessionStateWithActiveTurn(), 'md-1');
    const next = sessionReducer(state, { type: ActionType.SessionDelta, session: S, turnId: 'wrong-turn', partId: 'md-1', content: 'orphan' });
    assert.equal(next, state);
  });

  it('ignores session/delta without activeTurn', () => {
    const state = makeSessionState();
    const next = sessionReducer(state, { type: ActionType.SessionDelta, session: S, turnId: T, partId: 'md-1', content: 'orphan' });
    assert.equal(next, state);
  });

  it('handles session/responsePart', () => {
    const state = makeSessionStateWithActiveTurn();
    const part = { kind: ResponsePartKind.Markdown as const, id: 'md-1', content: '# Title' };
    const next = sessionReducer(state, { type: ActionType.SessionResponsePart, session: S, turnId: T, part });
    assert.equal(next.activeTurn!.responseParts.length, 1);
    assert.deepStrictEqual(next.activeTurn!.responseParts[0], part);
  });

  it('handles session/turnComplete — finalizes turn', () => {
    let s = createMarkdownPart(makeSessionStateWithActiveTurn(), 'md-1');
    s = sessionReducer(s, { type: ActionType.SessionDelta, session: S, turnId: T, partId: 'md-1', content: 'Response text' });
    s = sessionReducer(s, { type: ActionType.SessionTurnComplete, session: S, turnId: T });

    assert.equal(s.activeTurn, undefined);
    assert.equal(s.turns.length, 1);
    assert.equal(s.turns[0].id, T);
    // responseText is derived from markdown parts
    const markdownParts = s.turns[0].responseParts.filter(p => p.kind === ResponsePartKind.Markdown);
    assert.equal(markdownParts.length, 1);
    assert.equal((markdownParts[0] as { content: string }).content, 'Response text');
    assert.equal(s.turns[0].state, TurnState.Complete);
    assert.equal(s.summary.status, SessionStatus.Idle);
  });

  it('handles session/turnCancelled — finalizes turn', () => {
    const state = makeSessionStateWithActiveTurn();
    const next = sessionReducer(state, { type: ActionType.SessionTurnCancelled, session: S, turnId: T });
    assert.equal(next.activeTurn, undefined);
    assert.equal(next.turns.length, 1);
    assert.equal(next.turns[0].state, TurnState.Cancelled);
    assert.equal(next.summary.status, SessionStatus.Idle);
  });

  it('handles session/error — finalizes turn with error', () => {
    const state = makeSessionStateWithActiveTurn();
    const error = { errorType: 'runtime', message: 'Something broke' };
    const next = sessionReducer(state, { type: ActionType.SessionError, session: S, turnId: T, error });
    assert.equal(next.activeTurn, undefined);
    assert.equal(next.turns.length, 1);
    assert.equal(next.turns[0].state, TurnState.Error);
    assert.deepStrictEqual(next.turns[0].error, error);
    assert.equal(next.summary.status, SessionStatus.Error);
  });

  it('force-cancels in-progress tool calls on turn completion with skipped reason', () => {
    let state = startToolCall(makeSessionStateWithActiveTurn());
    const next = sessionReducer(state, { type: ActionType.SessionTurnComplete, session: S, turnId: T });
    const toolCallParts = next.turns[0].responseParts.filter(p => p.kind === ResponsePartKind.ToolCall);
    assert.equal(toolCallParts.length, 1);
    const tc = (toolCallParts[0] as IToolCallResponsePart).toolCall;
    assert.equal(tc.status, ToolCallStatus.Cancelled);
    if (tc.status === ToolCallStatus.Cancelled) {
      assert.equal(tc.reason, ToolCallCancellationReason.Skipped);
    }
  });

  it('ignores turn completion with wrong turnId', () => {
    const state = makeSessionStateWithActiveTurn();
    const next = sessionReducer(state, { type: ActionType.SessionTurnComplete, session: S, turnId: 'wrong-turn' });
    assert.ok(next.activeTurn);
    assert.equal(next, state);
  });
});

// ─── Session Reducer: Tool Call State Machine ────────────────────────────────

describe('sessionReducer — tool calls', () => {
  it('handles full tool call lifecycle: start → delta → ready → confirmed → complete', () => {
    let state = startToolCall(makeSessionStateWithActiveTurn());
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.Streaming);

    // Delta
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallDelta, session: S, turnId: T, toolCallId: TC,
      content: 'ls -la', invocationMessage: 'Listing files',
    });
    const streaming = getToolCallPart(state)!.toolCall;
    assert.equal(streaming.status, ToolCallStatus.Streaming);
    if (streaming.status === ToolCallStatus.Streaming) {
      assert.equal(streaming.partialInput, 'ls -la');
      assert.equal(streaming.invocationMessage, 'Listing files');
    }

    // Ready (no auto-confirm → pending confirmation)
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Run: ls -la', toolInput: 'ls -la',
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.PendingConfirmation);

    // Confirmed (approved)
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallConfirmed, session: S, turnId: T, toolCallId: TC,
      approved: true, confirmed: ToolCallConfirmationReason.UserAction,
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.Running);

    // Complete
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallComplete, session: S, turnId: T, toolCallId: TC,
      result: { success: true, pastTenseMessage: 'Ran command' },
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.Completed);
  });

  it('handles tool call ready with auto-confirm → running', () => {
    let state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()));
    const tc = getToolCallPart(state)!.toolCall;
    assert.equal(tc.status, ToolCallStatus.Running);
    if (tc.status === ToolCallStatus.Running) {
      assert.equal(tc.confirmed, ToolCallConfirmationReason.NotNeeded);
    }
  });

  it('handles tool call denied → cancelled', () => {
    let state = startToolCall(makeSessionStateWithActiveTurn());
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Run: rm -rf /',
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallConfirmed, session: S, turnId: T, toolCallId: TC,
      approved: false, reason: ToolCallCancellationReason.Denied,
    });
    const tc = getToolCallPart(state)!.toolCall;
    assert.equal(tc.status, ToolCallStatus.Cancelled);
    if (tc.status === ToolCallStatus.Cancelled) {
      assert.equal(tc.reason, ToolCallCancellationReason.Denied);
    }
  });

  it('handles tool call complete with result confirmation → pending → approved', () => {
    let state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()));
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallComplete, session: S, turnId: T, toolCallId: TC,
      result: { success: true, pastTenseMessage: 'Done' }, requiresResultConfirmation: true,
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.PendingResultConfirmation);

    state = sessionReducer(state, {
      type: ActionType.SessionToolCallResultConfirmed, session: S, turnId: T, toolCallId: TC,
      approved: true,
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.Completed);
  });

  it('handles tool call result denied → cancelled with result-denied reason', () => {
    let state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()));
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallComplete, session: S, turnId: T, toolCallId: TC,
      result: { success: true, pastTenseMessage: 'Done' }, requiresResultConfirmation: true,
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallResultConfirmed, session: S, turnId: T, toolCallId: TC,
      approved: false,
    });
    const tc = getToolCallPart(state)!.toolCall;
    assert.equal(tc.status, ToolCallStatus.Cancelled);
    if (tc.status === ToolCallStatus.Cancelled) {
      assert.equal(tc.reason, ToolCallCancellationReason.ResultDenied);
    }
  });

  it('handles tool call complete from pending-confirmation with defaulted confirmed', () => {
    let state = startToolCall(makeSessionStateWithActiveTurn());
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Run',
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.PendingConfirmation);
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallComplete, session: S, turnId: T, toolCallId: TC,
      result: { success: true, pastTenseMessage: 'Done' },
    });
    const tc = getToolCallPart(state)!.toolCall;
    assert.equal(tc.status, ToolCallStatus.Completed);
    if (tc.status === ToolCallStatus.Completed) {
      //@ts-ignore
      assert.equal(tc.confirmed, ToolCallConfirmationReason.NotNeeded);
    }
  });

  it('ignores tool call actions for unknown toolCallId', () => {
    const state = makeSessionStateWithActiveTurn();
    const next = sessionReducer(state, {
      type: ActionType.SessionToolCallDelta, session: S, turnId: T,
      toolCallId: 'nonexistent', content: 'data',
    });
    assert.equal(next, state);
  });
});

// ─── Session Reducer: Running → Re-confirmation ─────────────────────────────

describe('sessionReducer — running tool re-confirmation', () => {
  it('toolCallReady transitions running tool call back to pending-confirmation', () => {
    let state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()));
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.Running);

    // Server re-sends toolCallReady without confirmed, e.g. for a permission check
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Run: rm -rf /tmp/test',
      _meta: { permissionKind: 'shell', fullCommandText: 'rm -rf /tmp/test' },
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.PendingConfirmation);

    // Verify updated invocation message
    const tc = getToolCallPart(state)!.toolCall;
    if (tc.status === ToolCallStatus.PendingConfirmation) {
      assert.equal(tc.invocationMessage, 'Run: rm -rf /tmp/test');
    }
  });

  it('toolCallReady re-confirmation approved transitions back to running', () => {
    let state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()));
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Permission needed',
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.PendingConfirmation);

    state = sessionReducer(state, {
      type: ActionType.SessionToolCallConfirmed, session: S, turnId: T, toolCallId: TC,
      approved: true, confirmed: ToolCallConfirmationReason.UserAction,
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.Running);
  });

  it('toolCallReady re-confirmation denied transitions to cancelled', () => {
    let state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()));
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Permission needed',
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallConfirmed, session: S, turnId: T, toolCallId: TC,
      approved: false, reason: ToolCallCancellationReason.Denied,
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.Cancelled);
  });

  it('toolCallReady ignores non-streaming/non-running tool calls', () => {
    let state = startToolCall(makeSessionStateWithActiveTurn());
    // Move to pending-confirmation first
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Run',
    });
    assert.equal(getToolCallPart(state)!.toolCall.status, ToolCallStatus.PendingConfirmation);

    // Sending toolCallReady again while already pending-confirmation should be ignored
    const next = sessionReducer(state, {
      type: ActionType.SessionToolCallReady, session: S, turnId: T, toolCallId: TC,
      invocationMessage: 'Run again',
    });
    assert.equal(next, state);
  });
});

// ─── Session Reducer: Metadata ───────────────────────────────────────────────

describe('sessionReducer — metadata', () => {
  it('handles session/titleChanged and bumps modifiedAt', () => {
    const state = makeSessionState();
    const next = sessionReducer(state, { type: ActionType.SessionTitleChanged, session: S, title: 'New Title' });
    assert.equal(next.summary.title, 'New Title');
    assert.ok(next.summary.modifiedAt > state.summary.modifiedAt);
  });

  it('handles session/usage', () => {
    const state = makeSessionStateWithActiveTurn();
    const usage = { inputTokens: 100, outputTokens: 50 };
    const next = sessionReducer(state, { type: ActionType.SessionUsage, session: S, turnId: T, usage });
    assert.deepStrictEqual(next.activeTurn!.usage, usage);
  });

  it('handles session/reasoning', () => {
    let state = createReasoningPart(makeSessionStateWithActiveTurn(), 'r-1');
    state = sessionReducer(state, { type: ActionType.SessionReasoning, session: S, turnId: T, partId: 'r-1', content: 'Thinking about ' });
    state = sessionReducer(state, { type: ActionType.SessionReasoning, session: S, turnId: T, partId: 'r-1', content: 'the answer' });
    const reasoningParts = state.activeTurn!.responseParts.filter(p => p.kind === ResponsePartKind.Reasoning);
    assert.equal(reasoningParts.length, 1);
    assert.equal((reasoningParts[0] as { content: string }).content, 'Thinking about the answer');
  });

  it('handles session/modelChanged and bumps modifiedAt', () => {
    const state = makeSessionState();
    const next = sessionReducer(state, { type: ActionType.SessionModelChanged, session: S, model: 'gpt-4' });
    assert.equal(next.summary.model, 'gpt-4');
    assert.ok(next.summary.modifiedAt > state.summary.modifiedAt);
  });

  it('handles session/serverToolsChanged', () => {
    const state = makeSessionState();
    const tools = [{ name: 'bash', description: 'Run shell commands' }];
    const next = sessionReducer(state, { type: ActionType.SessionServerToolsChanged, session: S, tools });
    assert.deepStrictEqual(next.serverTools, tools);
  });

  it('handles session/activeClientChanged — set client', () => {
    const state = makeSessionState();
    const activeClient = { clientId: 'vscode-1', displayName: 'VS Code', tools: [] };
    const next = sessionReducer(state, { type: ActionType.SessionActiveClientChanged, session: S, activeClient });
    assert.deepStrictEqual(next.activeClient, activeClient);
  });

  it('handles session/activeClientChanged — unset client', () => {
    const state = makeSessionState({ activeClient: { clientId: 'vscode-1', tools: [] } });
    const next = sessionReducer(state, { type: ActionType.SessionActiveClientChanged, session: S, activeClient: null });
    assert.equal(next.activeClient, undefined);
  });

  it('handles session/activeClientToolsChanged', () => {
    const state = makeSessionState({ activeClient: { clientId: 'vscode-1', tools: [] } });
    const tools = [{ name: 'openFile', description: 'Open a file' }];
    const next = sessionReducer(state, { type: ActionType.SessionActiveClientToolsChanged, session: S, tools });
    assert.deepStrictEqual(next.activeClient!.tools, tools);
  });

  it('ignores session/activeClientToolsChanged without activeClient', () => {
    const state = makeSessionState();
    const next = sessionReducer(state, { type: ActionType.SessionActiveClientToolsChanged, session: S, tools: [{ name: 'openFile' }] });
    assert.equal(next, state);
  });
});

// ─── Dispatch Validation ─────────────────────────────────────────────────────

describe('isClientDispatchable', () => {
  it('returns true for client-dispatchable actions', () => {
    const action = { type: ActionType.SessionTurnStarted, session: S, turnId: T, userMessage: { text: 'Hello' } } as const;
    assert.equal(isClientDispatchable(action), true);
  });

  it('returns false for server-only actions', () => {
    const action = { type: ActionType.SessionReady, session: S } as const;
    assert.equal(isClientDispatchable(action), false);
  });
});

// ─── Full Turn Flow Integration Test ─────────────────────────────────────────

describe('sessionReducer — full turn flow', () => {
  it('processes a complete turn with tool calls and re-confirmation', () => {
    let state = makeSessionState({ lifecycle: SessionLifecycle.Ready });

    // Turn started
    state = sessionReducer(state, {
      type: ActionType.SessionTurnStarted,
      session: 's',
      turnId: 't1',
      userMessage: { text: 'Fix the bug' },
    });

    // Create markdown part, then stream delta into it
    state = sessionReducer(state, {
      type: ActionType.SessionResponsePart, session: 's', turnId: 't1',
      part: { kind: ResponsePartKind.Markdown, id: 'md-1', content: '' },
    });
    state = sessionReducer(state, {
      type: ActionType.SessionDelta, session: 's', turnId: 't1', partId: 'md-1', content: 'I will ',
    });
    state = sessionReducer(state, {
      type: ActionType.SessionDelta, session: 's', turnId: 't1', partId: 'md-1', content: 'fix it.',
    });

    // Tool call lifecycle
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallStart,
      session: 's', turnId: 't1', toolCallId: 'tc1',
      toolName: 'edit', displayName: 'Edit File',
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady,
      session: 's', turnId: 't1', toolCallId: 'tc1',
      invocationMessage: 'Edit main.ts', confirmed: ToolCallConfirmationReason.NotNeeded,
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallComplete,
      session: 's', turnId: 't1', toolCallId: 'tc1',
      result: { success: true, pastTenseMessage: 'Edited main.ts' },
    });

    // Tool call with mid-execution re-confirmation (e.g. permission check)
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallStart,
      session: 's', turnId: 't1', toolCallId: 'tc2',
      toolName: 'write', displayName: 'Write File',
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady,
      session: 's', turnId: 't1', toolCallId: 'tc2',
      invocationMessage: 'Write /tmp/out', confirmed: ToolCallConfirmationReason.NotNeeded,
    });
    // Running tool needs re-confirmation (e.g. permission)
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallReady,
      session: 's', turnId: 't1', toolCallId: 'tc2',
      invocationMessage: 'Write to /tmp/out',
      _meta: { permissionKind: 'write', path: '/tmp/out' },
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallConfirmed,
      session: 's', turnId: 't1', toolCallId: 'tc2',
      approved: true, confirmed: ToolCallConfirmationReason.UserAction,
    });
    state = sessionReducer(state, {
      type: ActionType.SessionToolCallComplete,
      session: 's', turnId: 't1', toolCallId: 'tc2',
      result: { success: true, pastTenseMessage: 'Wrote file' },
    });

    // Usage + reasoning
    state = sessionReducer(state, {
      type: ActionType.SessionUsage,
      session: 's', turnId: 't1',
      usage: { inputTokens: 200, outputTokens: 100 },
    });
    state = sessionReducer(state, {
      type: ActionType.SessionResponsePart,
      session: 's', turnId: 't1',
      part: { kind: ResponsePartKind.Reasoning, id: 'r-1', content: '' },
    });
    state = sessionReducer(state, {
      type: ActionType.SessionReasoning,
      session: 's', turnId: 't1', partId: 'r-1', content: 'The bug was in line 42',
    });

    // Another markdown response part
    state = sessionReducer(state, {
      type: ActionType.SessionResponsePart,
      session: 's', turnId: 't1',
      part: { kind: ResponsePartKind.Markdown, id: 'md-2', content: '## Fix applied' },
    });

    // Turn complete
    state = sessionReducer(state, {
      type: ActionType.SessionTurnComplete, session: 's', turnId: 't1',
    });

    // Verify final state
    assert.equal(state.activeTurn, undefined);
    assert.equal(state.turns.length, 1);
    const turn = state.turns[0];
    assert.equal(turn.id, 't1');
    assert.equal(turn.state, TurnState.Complete);

    // Check response parts ordering and content
    const markdownParts = turn.responseParts.filter(p => p.kind === ResponsePartKind.Markdown);
    assert.equal(markdownParts.length, 2);
    assert.equal((markdownParts[0] as { content: string }).content, 'I will fix it.');

    const toolCallParts = turn.responseParts.filter(p => p.kind === ResponsePartKind.ToolCall) as IToolCallResponsePart[];
    assert.equal(toolCallParts.length, 2);
    assert.equal(toolCallParts[0].toolCall.status, ToolCallStatus.Completed);
    assert.equal(toolCallParts[1].toolCall.status, ToolCallStatus.Completed);

    const reasoningParts = turn.responseParts.filter(p => p.kind === ResponsePartKind.Reasoning);
    assert.equal(reasoningParts.length, 1);
    assert.equal((reasoningParts[0] as { content: string }).content, 'The bug was in line 42');

    assert.deepStrictEqual(turn.usage, { inputTokens: 200, outputTokens: 100 });
    assert.equal(state.summary.status, SessionStatus.Idle);
  });
});

// ─── Pending Message Tests ───────────────────────────────────────────────────

describe('sessionReducer — pending messages', () => {
  describe('steering message', () => {
    it('sets a steering message', () => {
      const state = makeSessionState();
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageSet,
        session: S, kind: PendingMessageKind.Steering, id: 'sm-1',
        userMessage: { text: 'Focus on tests' },
      });
      assert.deepStrictEqual(result.steeringMessage, {
        id: 'sm-1', userMessage: { text: 'Focus on tests' },
      });
    });

    it('replaces existing steering message', () => {
      const state = makeSessionState({
        steeringMessage: { id: 'sm-1', userMessage: { text: 'Old' } },
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageSet,
        session: S, kind: PendingMessageKind.Steering, id: 'sm-2',
        userMessage: { text: 'New' },
      });
      assert.equal(result.steeringMessage!.id, 'sm-2');
      assert.equal(result.steeringMessage!.userMessage.text, 'New');
    });

    it('updates steering message content via set with same ID', () => {
      const state = makeSessionState({
        steeringMessage: { id: 'sm-1', userMessage: { text: 'Original' } },
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageSet,
        session: S, kind: PendingMessageKind.Steering, id: 'sm-1',
        userMessage: { text: 'Updated' },
      });
      assert.equal(result.steeringMessage!.id, 'sm-1');
      assert.equal(result.steeringMessage!.userMessage.text, 'Updated');
    });

    it('removes steering message', () => {
      const state = makeSessionState({
        steeringMessage: { id: 'sm-1', userMessage: { text: 'Steer' } },
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageRemoved,
        session: S, kind: PendingMessageKind.Steering, id: 'sm-1',
      });
      assert.strictEqual(result.steeringMessage, undefined);
    });

    it('remove is no-op for mismatched ID', () => {
      const state = makeSessionState({
        steeringMessage: { id: 'sm-1', userMessage: { text: 'Hello' } },
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageRemoved,
        session: S, kind: PendingMessageKind.Steering, id: 'sm-unknown',
      });
      assert.strictEqual(result, state);
    });

    it('remove is no-op when no steering message exists', () => {
      const state = makeSessionState();
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageRemoved,
        session: S, kind: PendingMessageKind.Steering, id: 'sm-1',
      });
      assert.strictEqual(result, state);
    });
  });

  describe('queued messages', () => {
    it('sets a new queued message', () => {
      const state = makeSessionState();
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageSet,
        session: S, kind: PendingMessageKind.Queued, id: 'pm-1',
        userMessage: { text: 'Do something' },
      });
      assert.deepStrictEqual(result.queuedMessages, [
        { id: 'pm-1', userMessage: { text: 'Do something' } },
      ]);
    });

    it('appends when ID is new', () => {
      const state = makeSessionState({
        queuedMessages: [{ id: 'pm-1', userMessage: { text: 'First' } }],
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageSet,
        session: S, kind: PendingMessageKind.Queued, id: 'pm-2',
        userMessage: { text: 'Second' },
      });
      assert.equal(result.queuedMessages!.length, 2);
      assert.equal(result.queuedMessages![1].id, 'pm-2');
    });

    it('updates in place when ID already exists', () => {
      const state = makeSessionState({
        queuedMessages: [
          { id: 'pm-1', userMessage: { text: 'First' } },
          { id: 'pm-2', userMessage: { text: 'Second' } },
        ],
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageSet,
        session: S, kind: PendingMessageKind.Queued, id: 'pm-1',
        userMessage: { text: 'Updated first' },
      });
      assert.equal(result.queuedMessages!.length, 2);
      assert.equal(result.queuedMessages![0].userMessage.text, 'Updated first');
      assert.equal(result.queuedMessages![1].id, 'pm-2');
    });

    it('removes a queued message', () => {
      const state = makeSessionState({
        queuedMessages: [
          { id: 'pm-1', userMessage: { text: 'First' } },
          { id: 'pm-2', userMessage: { text: 'Second' } },
        ],
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageRemoved,
        session: S, kind: PendingMessageKind.Queued, id: 'pm-1',
      });
      assert.equal(result.queuedMessages!.length, 1);
      assert.equal(result.queuedMessages![0].id, 'pm-2');
    });

    it('removes last queued message and sets array to undefined', () => {
      const state = makeSessionState({
        queuedMessages: [{ id: 'pm-1', userMessage: { text: 'Only one' } }],
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageRemoved,
        session: S, kind: PendingMessageKind.Queued, id: 'pm-1',
      });
      assert.strictEqual(result.queuedMessages, undefined);
    });

    it('remove is no-op for unknown ID', () => {
      const state = makeSessionState({
        queuedMessages: [{ id: 'pm-1', userMessage: { text: 'Hello' } }],
      });
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageRemoved,
        session: S, kind: PendingMessageKind.Queued, id: 'pm-unknown',
      });
      assert.strictEqual(result, state);
    });

    it('remove is no-op when array is empty', () => {
      const state = makeSessionState();
      const result = sessionReducer(state, {
        type: ActionType.SessionPendingMessageRemoved,
        session: S, kind: PendingMessageKind.Queued, id: 'pm-1',
      });
      assert.strictEqual(result, state);
    });
  });

  it('steering message and queued messages are independent', () => {
    let state = makeSessionState();
    state = sessionReducer(state, {
      type: ActionType.SessionPendingMessageSet,
      session: S, kind: PendingMessageKind.Steering, id: 's-1',
      userMessage: { text: 'Steer' },
    });
    state = sessionReducer(state, {
      type: ActionType.SessionPendingMessageSet,
      session: S, kind: PendingMessageKind.Queued, id: 'q-1',
      userMessage: { text: 'Queue' },
    });
    assert.equal(state.steeringMessage!.userMessage.text, 'Steer');
    assert.equal(state.queuedMessages!.length, 1);
    assert.equal(state.queuedMessages![0].userMessage.text, 'Queue');
  });
});

// ─── Queued Messages Reorder Tests ───────────────────────────────────────────

describe('sessionReducer — queuedMessagesReordered', () => {
  it('reorders queued messages', () => {
    const state = makeSessionState({
      queuedMessages: [
        { id: 'a', userMessage: { text: 'A' } },
        { id: 'b', userMessage: { text: 'B' } },
        { id: 'c', userMessage: { text: 'C' } },
      ],
    });
    const result = sessionReducer(state, {
      type: ActionType.SessionQueuedMessagesReordered,
      session: S, order: ['c', 'a', 'b'],
    });
    assert.equal(result.queuedMessages!.length, 3);
    assert.equal(result.queuedMessages![0].id, 'c');
    assert.equal(result.queuedMessages![1].id, 'a');
    assert.equal(result.queuedMessages![2].id, 'b');
  });

  it('keeps messages not in order at the end in original order', () => {
    const state = makeSessionState({
      queuedMessages: [
        { id: 'a', userMessage: { text: 'A' } },
        { id: 'b', userMessage: { text: 'B' } },
        { id: 'c', userMessage: { text: 'C' } },
      ],
    });
    const result = sessionReducer(state, {
      type: ActionType.SessionQueuedMessagesReordered,
      session: S, order: ['c'],
    });
    assert.equal(result.queuedMessages!.length, 3);
    assert.equal(result.queuedMessages![0].id, 'c');
    assert.equal(result.queuedMessages![1].id, 'a');
    assert.equal(result.queuedMessages![2].id, 'b');
  });

  it('ignores unknown IDs in order array', () => {
    const state = makeSessionState({
      queuedMessages: [
        { id: 'a', userMessage: { text: 'A' } },
        { id: 'b', userMessage: { text: 'B' } },
      ],
    });
    const result = sessionReducer(state, {
      type: ActionType.SessionQueuedMessagesReordered,
      session: S, order: ['unknown', 'b', 'a', 'also-unknown'],
    });
    assert.equal(result.queuedMessages!.length, 2);
    assert.equal(result.queuedMessages![0].id, 'b');
    assert.equal(result.queuedMessages![1].id, 'a');
  });

  it('empty order preserves all messages in original order', () => {
    const state = makeSessionState({
      queuedMessages: [{ id: 'a', userMessage: { text: 'A' } }],
    });
    const result = sessionReducer(state, {
      type: ActionType.SessionQueuedMessagesReordered,
      session: S, order: [],
    });
    assert.equal(result.queuedMessages!.length, 1);
    assert.equal(result.queuedMessages![0].id, 'a');
  });

  it('is no-op when no queued messages exist', () => {
    const state = makeSessionState();
    const result = sessionReducer(state, {
      type: ActionType.SessionQueuedMessagesReordered,
      session: S, order: ['a', 'b'],
    });
    assert.strictEqual(result, state);
  });
});
