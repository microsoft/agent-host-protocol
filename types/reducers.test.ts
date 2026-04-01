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
  isClientDispatchable,
} from './reducers.js';
import { IS_CLIENT_DISPATCHABLE } from './action-origin.generated.js';
import { ActionType } from './actions.js';
import type { IRootState, ISessionState } from './state.js';
import {
  SessionLifecycle,
  SessionStatus,
  TurnState,
} from './state.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

function readSource(file: string): string {
  return readFileSync(resolve(root, file), 'utf-8');
}

// ─── Fixture Loading ─────────────────────────────────────────────────────────

interface Fixture {
  description: string;
  reducer: 'root' | 'session';
  initial: IRootState | ISessionState;
  actions: unknown[];
  expected: IRootState | ISessionState;
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
          state = rootReducer(state as IRootState, action as any);
        } else {
          state = sessionReducer(state as ISessionState, action as any);
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
    const source = readSource('actions.ts');

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

// ─── Dispatch Validation ─────────────────────────────────────────────────────

describe('isClientDispatchable', () => {
  it('returns true for client-dispatchable actions', () => {
    const action = { type: ActionType.SessionTurnStarted, session: 'x', turnId: 't', userMessage: { text: 'Hello' } } as const;
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
    const state: IRootState = { agents: [] };
    const agents = [{ provider: 'x', displayName: 'X', description: 'x', models: [] }];
    rootReducer(state, { type: ActionType.RootAgentsChanged, agents });
    assert.deepStrictEqual(state.agents, []);
  });

  it('sessionReducer does not mutate original turns array', () => {
    const turn1 = { id: 't1', userMessage: { text: 'First' }, responseParts: [], usage: undefined, state: TurnState.Complete };
    const turn2 = { id: 't2', userMessage: { text: 'Second' }, responseParts: [], usage: undefined, state: TurnState.Complete };
    const turn3 = { id: 't3', userMessage: { text: 'Third' }, responseParts: [], usage: undefined, state: TurnState.Complete };
    const state: ISessionState = {
      summary: { resource: 'x', provider: 'copilot', title: 'T', status: SessionStatus.Idle, createdAt: 1000, modifiedAt: 1000 },
      lifecycle: SessionLifecycle.Ready,
      turns: [turn1, turn2, turn3],
    };
    const original = [...state.turns];
    sessionReducer(state, { type: ActionType.SessionTruncated, session: 'x', turnId: 't1' });
    assert.deepStrictEqual(state.turns, original);
  });
});
