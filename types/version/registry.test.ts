/**
 * Tests for the protocol version registry — guards the invariants other
 * generators and runtime negotiation logic rely on:
 *
 *  - {@link PROTOCOL_VERSION} parses as `MAJOR.MINOR.PATCH`.
 *  - {@link SUPPORTED_PROTOCOL_VERSIONS} is non-empty.
 *  - Every entry parses as `MAJOR.MINOR.PATCH`.
 *  - Released compatibility baselines are independent of the development version.
 *  - The list is strictly descending by SemVer.
 *  - No duplicate entries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACTION_INTRODUCED_IN,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  compareProtocolVersions,
  isActionKnownToVersion,
  negotiateProtocolVersion,
} from './registry.js';
import { ActionType } from '../actions.js';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

test('host negotiation follows the shared compatibility corpus', () => {
  const cases: { offered: string[]; expected?: string | null; invalid?: boolean }[] =
    JSON.parse(readFileSync(new URL('../test-cases/version-negotiation.json', import.meta.url), 'utf8'));
  for (const fixture of cases) {
    if (fixture.invalid) {
      assert.throws(() => negotiateProtocolVersion(fixture.offered), /Invalid protocol version/);
    } else {
      assert.equal(negotiateProtocolVersion(fixture.offered), fixture.expected ?? undefined);
    }
  }
});

test('PROTOCOL_VERSION is MAJOR.MINOR.PATCH', () => {
  assert.match(PROTOCOL_VERSION, SEMVER_RE);
});

test('SUPPORTED_PROTOCOL_VERSIONS is non-empty', () => {
  assert.ok(SUPPORTED_PROTOCOL_VERSIONS.length > 0);
});

test('every SUPPORTED_PROTOCOL_VERSIONS entry is MAJOR.MINOR.PATCH', () => {
  for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
    assert.match(v, SEMVER_RE, `not semver: ${v}`);
  }
});

test('SUPPORTED_PROTOCOL_VERSIONS contains only released compatibility baselines', () => {
  assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, ['1.0.0', '0.9.0']);
});

test('SUPPORTED_PROTOCOL_VERSIONS is strictly descending', () => {
  for (let i = 1; i < SUPPORTED_PROTOCOL_VERSIONS.length; i++) {
    const cmp = compareProtocolVersions(
      SUPPORTED_PROTOCOL_VERSIONS[i - 1],
      SUPPORTED_PROTOCOL_VERSIONS[i],
    );
    assert.ok(
      cmp > 0,
      `expected ${SUPPORTED_PROTOCOL_VERSIONS[i - 1]} > ${SUPPORTED_PROTOCOL_VERSIONS[i]} (got cmp=${cmp})`,
    );
  }
});

test('SUPPORTED_PROTOCOL_VERSIONS has no duplicates', () => {
  const set = new Set(SUPPORTED_PROTOCOL_VERSIONS);
  assert.equal(set.size, SUPPORTED_PROTOCOL_VERSIONS.length);
});

test('chat/turnResume is available starting in protocol 0.9.0', () => {
  const action = {
    type: ActionType.ChatTurnResume,
    turnId: 'turn-1',
  } as const;

  assert.equal(ACTION_INTRODUCED_IN[ActionType.ChatTurnResume], '0.9.0');
  assert.equal(isActionKnownToVersion(action, '0.8.0'), false);
  assert.equal(isActionKnownToVersion(action, '0.9.0'), true);
});

test('chat/isReadChanged is available starting in protocol 0.9.0', () => {
  const action = {
    type: ActionType.ChatIsReadChanged,
    isRead: true,
  } as const;

  assert.equal(ACTION_INTRODUCED_IN[ActionType.ChatIsReadChanged], '0.9.0');
  assert.equal(isActionKnownToVersion(action, '0.8.0'), false);
  assert.equal(isActionKnownToVersion(action, '0.9.0'), true);
});

test('public package entry re-exports both protocol-version constants', async () => {
  const pkg = await import('../index.js');
  assert.equal(pkg.PROTOCOL_VERSION, PROTOCOL_VERSION);
  assert.deepEqual([...pkg.SUPPORTED_PROTOCOL_VERSIONS], [...SUPPORTED_PROTOCOL_VERSIONS]);
});

test('chat/configChanged is available starting in protocol 1.1.0', () => {
  const action = {
    type: ActionType.ChatConfigChanged,
    config: { autoApprove: true },
  } as const;

  assert.equal(ACTION_INTRODUCED_IN[ActionType.ChatConfigChanged], '1.1.0');
  assert.equal(isActionKnownToVersion(action, '1.0.0'), false);
  assert.equal(isActionKnownToVersion(action, '1.1.0'), true);
});
