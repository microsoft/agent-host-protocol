/**
 * Reducer unit tests — driven by JSON fixtures for cross-language parity.
 *
 * Fixture format: { description, reducer, initial, actions, expected }
 * Fixtures live in types/test-cases/reducers/*.json and can be consumed by
 * any language implementation to verify reducer parity.
 *
 * Tests that are inherently JS-specific (source-code parsing, identity checks)
 * remain as manual test cases below the fixture-driven tests.
 *
 * Run: npx tsx --test types/reducers.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
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
  isClientDispatchable,
} from './reducers.js';
import { IS_CLIENT_DISPATCHABLE } from './action-origin.generated.js';
import { ActionType } from './actions.js';
import type { RootState, SessionState, ChatState, TerminalState, ChangesetState, AnnotationsState, ResourceWatchState } from './state.js';
import {
  SessionStatus,
  TurnState,
  MessageKind,
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

type FixtureState = RootState | SessionState | ChatState | TerminalState | ChangesetState | AnnotationsState | ResourceWatchState;

interface Fixture {
  description: string;
  reducer: 'root' | 'session' | 'chat' | 'terminal' | 'changeset' | 'annotations' | 'resourceWatch';
  initial: FixtureState;
  actions: unknown[];
  expected: FixtureState;
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

/**
 * The reducers call Date.now() for modifiedAt timestamps.
 * We mock it to a fixed value (9999) matching what was used during
 * fixture generation, so expected values match exactly.
 */
const MOCK_NOW = 9999;
let originalDateNow: typeof Date.now;

describe('reducer fixtures', () => {
  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = () => MOCK_NOW;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  for (const fixture of fixtures) {
    it(fixture.description, () => {
      let state = fixture.initial;
      for (const action of fixture.actions) {
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
        } else {
          state = sessionReducer(state as SessionState, action as any);
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
    const action = { type: ActionType.ChatTurnStarted, turnId: 't', message: { text: 'Hello', origin: { kind: MessageKind.User } } } as const;
    assert.equal(isClientDispatchable(action), true);
  });

  it('returns false for server-only actions', () => {
    const action = { type: ActionType.SessionReady, session: 'x' } as const;
    assert.equal(isClientDispatchable(action), false);
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
