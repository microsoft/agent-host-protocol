/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AutomationAction } from './action-origin.generated.js';
import { ActionType } from './common/actions.js';
import type { AutomationCapabilities, ClientCapabilities } from './common/commands.js';
import { MessageKind } from './channels-chat/state.js';
import { automationActionForClient, automationCapabilitiesForClient, automationStateForClient, canResumeAutomationCatalogue } from './channels-automation/compatibility.js';
import { automationReducer } from './channels-automation/reducer.js';
import { AutomationTriggerKind, type AutomationEntry, type AutomationState } from './channels-automation/state.js';

const optedIn: ClientCapabilities = { automations: { oneTime: {} } };
const recurring: AutomationEntry = {
  resource: 'ahp-automation:/daily',
  definition: {
    title: 'Daily',
    message: { text: 'Review changes', origin: { kind: MessageKind.Automation } },
    session: {},
    enabled: true,
    triggers: [{ id: 'daily', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 9 * * *', timeZone: 'UTC' } }],
  },
  runs: [],
  operations: [],
  createdAt: '2026-11-13T00:00:00Z',
  modifiedAt: '2026-11-13T00:00:00Z',
};
const oneTime: AutomationEntry = {
  ...recurring,
  resource: 'ahp-automation:/once',
  definition: {
    ...recurring.definition,
    triggers: [{ id: 'once', kind: AutomationTriggerKind.OneTime, runAt: '2026-11-14T09:00:00Z' }],
  },
};

test('one connection opting in does not expose one-time entries or capabilities to legacy connections', () => {
  const capabilities: AutomationCapabilities = { create: {}, schedules: {}, oneTime: {}, existingConversation: {} };
  const state: AutomationState = { entries: [recurring, oneTime], _meta: { revision: 'r1' } };
  const legacyClients: (ClientCapabilities | undefined)[] = [undefined, {}, { automations: {} }];
  for (const client of legacyClients) {
    assert.deepEqual({
      capabilities: automationCapabilitiesForClient(capabilities, client),
      state: automationStateForClient(state, client),
      optedInCapabilities: automationCapabilitiesForClient(capabilities, optedIn),
      optedInState: automationStateForClient(state, optedIn),
      authoritative: state,
    }, {
      capabilities: { create: {}, schedules: {} },
      state: { entries: [recurring], _meta: { revision: 'r1' } },
      optedInCapabilities: capabilities,
      optedInState: state,
      authoritative: { entries: [recurring, oneTime], _meta: { revision: 'r1' } },
    });
  }
});

test('live and replayed actions converge with projected snapshots when entries change trigger kind', () => {
  const state: AutomationState = { entries: [recurring] };
  const changed: AutomationEntry = { ...oneTime, resource: recurring.resource };
  const actions: AutomationAction[] = [
    { type: ActionType.AutomationSet, automation: changed },
    { type: ActionType.AutomationSet, automation: oneTime },
    { type: ActionType.AutomationSet, automation: recurring },
    { type: ActionType.AutomationRemoved, resource: oneTime.resource },
  ];
  let authoritative = state;
  let legacy = automationStateForClient(state);
  let modern = automationStateForClient(state, optedIn);
  const observations: { legacy: AutomationState; modern: AutomationState }[] = [];
  for (const action of actions) {
    authoritative = automationReducer(authoritative, action);
    const projected = automationActionForClient(action);
    if (projected) legacy = automationReducer(legacy, projected);
    const accepted = automationActionForClient(action, optedIn);
    if (accepted) modern = automationReducer(modern, accepted);
    assert.deepEqual({ legacy, modern }, { legacy: automationStateForClient(authoritative), modern: authoritative });
    observations.push({ legacy, modern });
  }
  assert.deepEqual(observations, [
    { legacy: { entries: [] }, modern: { entries: [changed] } },
    { legacy: { entries: [] }, modern: { entries: [changed, oneTime] } },
    { legacy: { entries: [recurring] }, modern: { entries: [recurring, oneTime] } },
    { legacy: { entries: [recurring] }, modern: { entries: [recurring] } },
  ]);
});

test('one-time create and trigger-patch echoes are suppressed for legacy clients, not other requests', () => {
  const create: AutomationAction = { type: ActionType.AutomationCreateRequested, resource: oneTime.resource, definition: oneTime.definition };
  const update: AutomationAction = { type: ActionType.AutomationUpdateRequested, resource: recurring.resource, changes: { triggers: oneTime.definition.triggers } };
  const ordinary: AutomationAction = { type: ActionType.AutomationUpdateRequested, resource: recurring.resource, changes: { title: 'Renamed' } };
  assert.deepEqual({
    legacy: [create, update, ordinary].map(action => automationActionForClient(action)),
    modern: [create, update, ordinary].map(action => automationActionForClient(action, optedIn)),
  }, {
    legacy: [undefined, undefined, ordinary],
    modern: [create, update, ordinary],
  });
});

test('upgrading or downgrading the same client identity cannot resume the previous catalogue view', () => {
  assert.deepEqual({
    legacyReconnect: canResumeAutomationCatalogue(undefined, undefined),
    optedInReconnect: canResumeAutomationCatalogue(optedIn, optedIn),
    upgrade: canResumeAutomationCatalogue(undefined, optedIn),
    downgrade: canResumeAutomationCatalogue(optedIn, undefined),
    omittedOptIn: canResumeAutomationCatalogue(optedIn, { automations: {} }),
  }, {
    legacyReconnect: true,
    optedInReconnect: true,
    upgrade: false,
    downgrade: false,
    omittedOptIn: false,
  });
});
