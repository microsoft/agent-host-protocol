import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AccountConsumerKind,
  ActionType,
  AuthAttemptStatus,
  AuthFlowKind,
  BrokeredAuthenticationBindingKind,
  accountsReducer,
  isActionKnownToVersion,
  isClientDispatchable,
} from './index.js';
import type {
  AccountsAction,
  AccountsState,
  AuthAttemptState,
  AuthBeginParams,
  AuthenticateParams,
  CommandMap,
  InitializeResult,
  Snapshot,
} from './index.js';

const consumer = {
  kind: AccountConsumerKind.Agent,
  provider: 'assistant',
  resource: 'https://api.example.test',
} as const;

describe('accounts channel', () => {
  it('preserves identity for missing removals', () => {
    const state: AccountsState = { accounts: [], attempts: [] };
    assert.equal(accountsReducer(state, { type: ActionType.AccountRemoved, id: 'absent' }), state);
    assert.equal(accountsReducer(state, { type: ActionType.AuthAttemptRemoved, id: 'absent' }), state);
  });

  it('does not mutate account or attempt collections', () => {
    const state: AccountsState = { accounts: [], attempts: [] };
    Object.freeze(state.accounts);
    Object.freeze(state.attempts);
    Object.freeze(state);
    const withAccount = accountsReducer(state, {
      type: ActionType.AccountSet,
      account: { id: 'account-a', label: 'A', removable: true, consumers: [consumer] },
    });
    const withAttempt = accountsReducer(withAccount, {
      type: ActionType.AuthAttemptSet,
      attempt: { id: 'attempt-a', consumer, resource: consumer.resource, status: AuthAttemptStatus.Pending },
    });
    assert.deepEqual(state, { accounts: [], attempts: [] });
    assert.equal(withAccount.attempts, state.attempts);
    assert.equal(withAttempt.accounts, withAccount.accounts);
    assert.equal(withAccount.attempts.length, 0);
    assert.equal(withAttempt.attempts.length, 1);
  });

  it('only lets clients originate removal and cancellation', () => {
    const actions: AccountsAction[] = [
      { type: ActionType.AccountSet, account: { id: 'a', label: 'A', removable: true, consumers: [] } },
      { type: ActionType.AccountRemoved, id: 'a' },
      {
        type: ActionType.AuthAttemptSet,
        attempt: { id: 'one', consumer, resource: consumer.resource, status: AuthAttemptStatus.Pending },
      },
      { type: ActionType.AuthAttemptRemoved, id: 'one' },
    ];
    assert.deepEqual(actions.map(isClientDispatchable), [false, true, false, true]);
    for (const action of actions) {
      assert.equal(isActionKnownToVersion(action, '0.8.0'), false);
      assert.equal(isActionKnownToVersion(action, '0.9.0'), true);
    }
  });

  it('exposes the standalone capability, snapshot, command, and bound delivery', () => {
    const begin: CommandMap['authBegin']['params'] = {
      channel: 'ahp-accounts://',
      target: { consumer },
      flows: [{ kind: AuthFlowKind.ClientBrokered }],
    };
    const delivery: AuthenticateParams = {
      channel: 'ahp-root://',
      resource: consumer.resource,
      token: 'test-credential',
      binding: { kind: BrokeredAuthenticationBindingKind.Attempt, attemptId: 'one' },
    };
    const state: AccountsState = { accounts: [], attempts: [] };
    const snapshot: Snapshot = { resource: 'ahp-accounts://', state, fromSeq: 1 };
    const initialized: InitializeResult = {
      protocolVersion: '0.9.0',
      serverSeq: 1,
      snapshots: [snapshot],
      authentication: { flows: begin.flows },
    };
    assert.equal(initialized.authentication?.flows[0].kind, 'clientBrokered');
    assert.deepEqual(delivery.binding, { kind: 'attempt', attemptId: 'one' });
    assert.equal(snapshot.state, state);
  });

  it('makes incomplete admission outcomes and unknown targets unrepresentable', () => {
    const base = { id: 'one', consumer, resource: consumer.resource };
    // @ts-expect-error Completed outcomes require a host account id.
    const completed: AuthAttemptState = { ...base, status: AuthAttemptStatus.Completed };
    // @ts-expect-error Failed outcomes require an error.
    const failed: AuthAttemptState = { ...base, status: AuthAttemptStatus.Failed };
    // @ts-expect-error There is no dependency on a separate challenge catalogue.
    const target: AuthBeginParams['target'] = { challengeId: 'unpublished' };
    // @ts-expect-error Revocation targets only an account key, never a resource.
    const removal: AccountsAction = { type: ActionType.AccountRemoved, id: 'a', resource: consumer.resource };
    void [completed, failed, target, removal];
  });
});
