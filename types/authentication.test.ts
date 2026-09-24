import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  AhpClientNotification,
  AuthenticateParams,
  AuthenticateResult,
  AuthenticationAccount,
  AuthRevokedParams,
  CommandMap,
  InitializeResult,
} from './index.js';

describe('client-brokered account revocation', () => {
  const account: AuthenticationAccount = { authority: 'https://login.example.test', id: 'account-a' };
  const resource = 'https://api.example.test';

  it('adds identity without changing the authenticate result or baseline shape', () => {
    const baseline: AuthenticateParams = { channel: 'ahp-root://', resource, token: 'test-credential' };
    const identified: AuthenticateParams = { ...baseline, account };
    const result: AuthenticateResult = {};
    assert.equal(baseline.account, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(identified)).account, account);
    assert.deepEqual(result, {});
  });

  it('uses the same identity on rotation and revocation without token-dependent fields', () => {
    const token: AuthenticateParams = { channel: 'ahp-root://', resource, token: 'first', account };
    const rotated: AuthenticateParams = { ...token, token: 'rotated' };
    const revoked: AuthRevokedParams = { channel: 'ahp-root://', resource, account };
    assert.deepEqual(rotated.account, token.account);
    assert.deepEqual(Object.keys(revoked).sort(), ['account', 'channel', 'resource']);
  });

  it('registers a client notification, not another request/response operation', () => {
    const notification: AhpClientNotification<'auth/revoked'> = {
      jsonrpc: '2.0',
      method: 'auth/revoked',
      params: { channel: 'ahp-root://', resource, account },
    };
    const notificationOnly: 'auth/revoked' extends keyof CommandMap ? false : true = true;
    assert.equal(notificationOnly, true);
    assert.equal('id' in notification, false);
    assert.equal(notification.method, 'auth/revoked');
  });

  it('preserves the capability presence marker and permits its absence', () => {
    const baseline: InitializeResult = { protocolVersion: '0.9.0', serverSeq: 1, snapshots: [] };
    const supported: InitializeResult = { ...baseline, accountRevocation: {} };
    assert.equal(baseline.accountRevocation, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(supported)).accountRevocation, {});
  });
});
