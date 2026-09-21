/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sessionReducer } from '../src/types/reducers.js';
import { ActionType } from '../src/types/common/actions.js';
import type { SessionAction } from '../src/types/action-origin.generated.js';
import type { SessionState } from '../src/types/channels-session/state.js';

interface Fixture {
  reducer: string;
  initial: SessionState;
  actions: SessionAction[];
  expected: SessionState;
}

const directoryActions = new Set<ActionType>([
  ActionType.SessionWorkingDirectorySet,
  ActionType.SessionWorkingDirectoryRemoved,
  ActionType.SessionWorkingDirectoryReplaced,
]);
const fixtureDirectory = new URL('../../../types/test-cases/reducers/', import.meta.url);

for (const file of readdirSync(fixtureDirectory).filter(file => file.endsWith('.json')).sort()) {
  const fixture = JSON.parse(readFileSync(new URL(file, fixtureDirectory), 'utf8')) as Fixture;
  if (fixture.reducer !== 'session' || !fixture.actions.some(action => directoryActions.has(action.type))) {
    continue;
  }
  test(`SDK working-directory fixture: ${file}`, () => {
    const actual = fixture.actions.reduce(sessionReducer, fixture.initial);
    assert.deepEqual(actual, fixture.expected, file);
  });
}
