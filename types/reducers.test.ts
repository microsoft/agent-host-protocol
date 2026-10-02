/**
 * Reducer unit tests — driven by JSON fixtures for cross-language parity.
 *
 * Fixture format: { description, reducer, initial, actions, expected, expectedError? }
 * When expectedError is present, only the final action must throw that message;
 * expected is the state after the preceding actions (the rejected action must not mutate it).
 * Fixtures live in types/test-cases/reducers/*.json and can be consumed by
 * any language implementation to verify reducer parity.
 *
 * Tests that are inherently JS-specific (source-code parsing, identity checks)
 * remain as manual test cases below the fixture-driven tests.
 *
 * Run: npx tsx --test types/reducers.test.ts
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  rootReducer,
  sessionReducer,
  chatReducer,
  terminalReducer,
  changesetReducer,
  annotationsReducer,
  resourceWatchReducer,
  automationReducer,
  automationRunReducer,
  tcpReducer,
  isClientDispatchable,
} from './reducers.js';
import { IS_CLIENT_DISPATCHABLE } from './action-origin.generated.js';
import type { TcpAction } from './action-origin.generated.js';
import { ActionType } from './actions.js';
import type { RootState, SessionState, ChatState, TerminalState, ChangesetState, AnnotationsState, ResourceWatchState, AutomationState, AutomationRunState, TcpConnectionState } from './state.js';
import {
  SessionStatus,
  SessionLifecycle,
  TurnState,
  MessageKind,
  TcpDataEncoding,
  TcpResetReason,
} from './state.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

/**
 * Reads and concatenates every canonical per-channel source file matching
 * `baseName` (e.g. `actions.ts`) under `types/common/` and
 * `types/channels-*\/`. Used after the channel-organized refactor so the
 * parsing in this test sees the union of declarations split across channels.
 */
function readChannelSources(baseName: string): string {
  const dirs = [
    'common',
    'channels-root',
    'channels-session',
    'channels-chat',
    'channels-terminal',
    'channels-changeset',
    'channels-annotations',
    'channels-resource-watch',
    'channels-automation',
    'channels-automation-run',
    'channels-tcp',
  ];
  return dirs
    .map(dir => {
      const p = resolve(root, dir, baseName);
      try {
        return readFileSync(p, 'utf-8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

// ─── Fixture Loading ─────────────────────────────────────────────────────────

type FixtureState = RootState | SessionState | ChatState | TerminalState | ChangesetState | AnnotationsState | ResourceWatchState | AutomationState | AutomationRunState | TcpConnectionState;

interface Fixture {
  description: string;
  reducer: 'root' | 'session' | 'chat' | 'terminal' | 'changeset' | 'annotations' | 'resourceWatch' | 'automation' | 'automationRun' | 'tcp';
  initial: FixtureState;
  actions: unknown[];
  expected: FixtureState;
  expectedError?: string;
}

/**
 * Recursively replaces JSON `null` with `undefined` to match TypeScript
 * reducer output, which uses `undefined` for absent optional fields.
 */
function nullToUndefined<T>(value: T): T {
  if (value === null) return undefined as unknown as T;
  if (Array.isArray(value)) return value.map(nullToUndefined) as unknown as T;
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = nullToUndefined(v);
    }
    return result as T;
  }
  return value;
}

const fixtureDir = resolve(root, 'test-cases', 'reducers');
const fixtureFiles = readdirSync(fixtureDir).filter(f => f.endsWith('.json')).sort();

const fixtures: Fixture[] = fixtureFiles.map(f => {
  const raw = JSON.parse(readFileSync(resolve(fixtureDir, f), 'utf-8'));
  return nullToUndefined(raw) as Fixture;
});

// ─── Fixture-Driven Reducer Tests ────────────────────────────────────────────

describe('reducer fixtures', () => {
  for (const fixture of fixtures) {
    it(fixture.description, () => {
      let state = fixture.initial;
      if (fixture.expectedError !== undefined) {
        assert.ok(fixture.actions.length > 0, 'expectedError requires a final action');
      }
      for (const [index, action] of fixture.actions.entries()) {
        const apply = () => {
          if (fixture.reducer === 'root') {
            state = rootReducer(state as RootState, action as any);
          } else if (fixture.reducer === 'chat') {
            state = chatReducer(state as ChatState, action as any);
          } else if (fixture.reducer === 'terminal') {
            state = terminalReducer(state as TerminalState, action as any);
          } else if (fixture.reducer === 'changeset') {
            state = changesetReducer(state as ChangesetState, action as any);
          } else if (fixture.reducer === 'annotations') {
            state = annotationsReducer(state as AnnotationsState, action as any);
          } else if (fixture.reducer === 'resourceWatch') {
            state = resourceWatchReducer(state as ResourceWatchState, action as any);
          } else if (fixture.reducer === 'automation') {
            state = automationReducer(state as AutomationState, action as any);
          } else if (fixture.reducer === 'automationRun') {
            state = automationRunReducer(state as AutomationRunState, action as any);
          } else if (fixture.reducer === 'tcp') {
            state = tcpReducer(state as TcpConnectionState, action as TcpAction);
          } else if (fixture.reducer === 'session') {
            state = sessionReducer(state as SessionState, action as any);
          } else {
            assert.fail(`Unknown reducer: ${fixture.reducer}`);
          }
        };
        if (fixture.expectedError !== undefined && index === fixture.actions.length - 1) {
          assert.throws(apply, { message: fixture.expectedError });
        } else {
          apply();
        }
      }
      assert.deepStrictEqual(state, fixture.expected);
    });
  }
});

// ─── IS_CLIENT_DISPATCHABLE validation ───────────────────────────────────────
//
// These tests parse TypeScript source, so they must remain JS-only.

describe('IS_CLIENT_DISPATCHABLE', () => {
  it('matches @clientDispatchable annotations in actions.ts', () => {
    const source = readChannelSources('actions.ts');

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
    for (const match of readChannelSources('actions.ts').matchAll(enumValueRe)) {
      allValues.push(match[2]);
    }

    const mapKeys = Object.keys(IS_CLIENT_DISPATCHABLE);
    const missing = allValues.filter(v => !mapKeys.includes(v));
    assert.deepStrictEqual(missing, [], `Missing from IS_CLIENT_DISPATCHABLE: ${missing.join(', ')}`);

    const extra = mapKeys.filter(v => !allValues.includes(v));
    assert.deepStrictEqual(extra, [], `Extra in IS_CLIENT_DISPATCHABLE: ${extra.join(', ')}`);
  });
});

// ─── Dispatch Validation ─────────────────────────────────────────────────────

describe('isClientDispatchable', () => {
  it('returns true for client-dispatchable actions', () => {
    const action = { type: ActionType.ChatTurnStarted, turnId: 't', startedAt: '2026-07-10T00:00:00.000Z', message: { text: 'Hello', origin: { kind: MessageKind.User } } } as const;
    assert.equal(isClientDispatchable(action), true);
  });

  it('returns false for server-only actions', () => {
    const action = { type: ActionType.SessionReady, session: 'x' } as const;
    assert.equal(isClientDispatchable(action), false);
  });

  it('classifies TCP actions by endpoint', () => {
    const actions: TcpAction[] = [
      { type: ActionType.TcpInput, offset: 0, data: 'AA==' },
      { type: ActionType.TcpDataConsumed, consumedBytes: 0 },
      { type: ActionType.TcpInputEof, finalOffset: 0 },
      { type: ActionType.TcpClientClose },
      { type: ActionType.TcpClientReset, reason: TcpResetReason.ProtocolError },
      { type: ActionType.TcpData, offset: 0, data: 'AA==' },
      { type: ActionType.TcpInputConsumed, consumedBytes: 0 },
      { type: ActionType.TcpDataEof, finalOffset: 0 },
      { type: ActionType.TcpHostClose },
      { type: ActionType.TcpHostReset, reason: TcpResetReason.ProtocolError },
    ];
    assert.deepStrictEqual(actions.map(isClientDispatchable), [true, true, true, true, true, false, false, false, false, false]);
  });
});

describe('chat read state scoping', () => {
  it('changes the default chat without changing its owning session or sibling chat', () => {
    const defaultChat: ChatState = {
      resource: 'ahp-chat:/default',
      title: 'Default Chat',
      status: SessionStatus.Idle,
      modifiedAt: '2026-10-02T00:00:00.000Z',
      turns: [],
    };
    const siblingChat: ChatState = {
      resource: 'ahp-chat:/sibling',
      title: 'Sibling Chat',
      status: SessionStatus.Idle,
      modifiedAt: '2026-10-02T00:00:00.000Z',
      turns: [],
    };
    const session: SessionState = {
      provider: 'copilot',
      title: 'Session',
      status: SessionStatus.Idle | SessionStatus.IsRead,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [defaultChat, siblingChat],
      defaultChat: defaultChat.resource,
    };

    const updatedDefaultChat = chatReducer(defaultChat, {
      type: ActionType.ChatIsReadChanged,
      isRead: true,
    });

    assert.deepStrictEqual({
      defaultChatStatus: updatedDefaultChat.status,
      owningSessionStatus: session.status,
      siblingChatStatus: siblingChat.status,
    }, {
      defaultChatStatus: SessionStatus.Idle | SessionStatus.IsRead,
      owningSessionStatus: SessionStatus.Idle | SessionStatus.IsRead,
      siblingChatStatus: SessionStatus.Idle,
    });
  });
});

// ─── Immutability Checks ─────────────────────────────────────────────────────
//
// Verifying that the reducer does not mutate the input state requires
// identity checks (===), which can't be expressed in JSON fixtures.

describe('reducer immutability', () => {
  it('rootReducer does not mutate original state', () => {
    const state: RootState = { agents: [] };
    const agents = [{ provider: 'x', displayName: 'X', description: 'x', models: [] }];
    rootReducer(state, { type: ActionType.RootAgentsChanged, agents });
    assert.deepStrictEqual(state.agents, []);
  });

  it('chatReducer does not mutate original turns array', () => {
    const turn1 = { id: 't1', message: { text: 'First', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
    const turn2 = { id: 't2', message: { text: 'Second', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
    const turn3 = { id: 't3', message: { text: 'Third', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
    const state: ChatState = {
      summary: { resource: 'x', title: 'T', status: SessionStatus.Idle, modifiedAt: 1000 },
      turns: [turn1, turn2, turn3],
    };
    const original = [...state.turns];
    chatReducer(state, { type: ActionType.ChatTruncated, turnId: 't1' });
    assert.deepStrictEqual(state.turns, original);
  });
});

// ─── TCP Runtime Checks ──────────────────────────────────────────────────────
//
// Large generated payloads, non-JSON numbers, identity, and byte side effects
// stay here; portable TCP state transitions and validation use shared fixtures.

function initialTcpState(): TcpConnectionState {
  return {
    session: 'ahp-session:/s1',
    target: { host: 'localhost', port: 3000 },
    encoding: TcpDataEncoding.Base64,
    input: { windowBytes: 8, maximumChunkSize: 6, receivedBytes: 0, consumedBytes: 0 },
    output: { windowBytes: 8, maximumChunkSize: 6, receivedBytes: 0, consumedBytes: 0 },
    clientClosed: false,
    hostClosed: false,
  };
}

describe('TCP runtime checks', () => {
  it('accepts large chunks in both directions with exact decoded accounting', () => {
    for (const size of [32768, 1048576, 4194304]) {
      const data = Buffer.alloc(size, 255).toString('base64');
      for (const [type, direction] of [[ActionType.TcpInput, 'input'], [ActionType.TcpData, 'output']] as const) {
        const state = initialTcpState();
        state[direction].windowBytes = size;
        state[direction].maximumChunkSize = size;
        const next = tcpReducer(state, { type, offset: 0, data });
        assert.equal(next[direction].receivedBytes, size);
        assert.throws(() => tcpReducer(next, { type, offset: size, data: 'AA==' }), /window/);
      }
    }
  });

  it('rejects non-JSON numeric offsets', () => {
    for (const offset of [NaN, Infinity, -Infinity]) {
      assert.throws(() => tcpReducer(initialTcpState(), {
        type: ActionType.TcpInput, offset, data: 'AA==',
      }), /safe integer/);
    }
  });

  it('preserves the original state and reuses unchanged directions and no-op states', () => {
    const state = initialTcpState();
    const before = structuredClone(state);
    const action = { type: ActionType.TcpInput, offset: 0, data: 'AP+A' } as const;
    const next = tcpReducer(state, action);
    assert.deepStrictEqual(state, before);
    assert.equal(next.output, state.output);
    assert.equal(tcpReducer(next, action), next);
    const duplex = tcpReducer(next, { ...action, type: ActionType.TcpData });
    for (const type of [ActionType.TcpInputConsumed, ActionType.TcpDataConsumed] as const) {
      const consumed = tcpReducer(duplex, { type, consumedBytes: 3 });
      assert.equal(tcpReducer(consumed, { type, consumedBytes: 2 }), consumed);
      assert.equal(tcpReducer(consumed, { type, consumedBytes: 3 }), consumed);
    }
    for (const type of [ActionType.TcpClientClose, ActionType.TcpHostClose] as const) {
      const closed = tcpReducer(next, { type });
      assert.equal(tcpReducer(closed, { type }), closed);
    }
    const ended = tcpReducer(next, { type: ActionType.TcpInputEof, finalOffset: 3 });
    assert.equal(tcpReducer(ended, { type: ActionType.TcpInputEof, finalOffset: 3 }), ended);
    const reset = tcpReducer(next, { type: ActionType.TcpHostReset, reason: TcpResetReason.ConnectionReset });
    assert.equal(tcpReducer(reset, action), reset);
  });

  it('logs unknown future actions rather than silently discarding them', () => {
    const warnings: string[] = [];
    const action: TcpAction = JSON.parse('{"type":"tcp/future"}');
    const state = initialTcpState();
    assert.equal(tcpReducer(state, action, message => warnings.push(message)), state);
    assert.match(warnings[0], /tcp\/future/);
  });

  it('does not duplicate socket writes when unacknowledged input is resent', () => {
    let state = initialTcpState();
    const writes: Buffer[] = [];
    const accept = (action: Extract<TcpAction, { type: ActionType.TcpInput }>) => {
      const next = tcpReducer(state, action);
      if (next.input.receivedBytes > state.input.receivedBytes) writes.push(Buffer.from(action.data, 'base64'));
      state = next;
    };
    const first = { type: ActionType.TcpInput, offset: 0, data: 'AP+A' } as const;
    accept(first);
    accept(first);
    accept({ type: ActionType.TcpInput, offset: 3, data: 'AQI=' });
    assert.deepStrictEqual(Buffer.concat(writes), Buffer.from([0, 255, 128, 1, 2]));
    assert.equal(writes.length, 2);
  });
});
