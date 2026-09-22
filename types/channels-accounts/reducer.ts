/**
 * Accounts Channel Reducer.
 *
 * @module channels-accounts/reducer
 */

import type { AccountsAction } from '../action-origin.generated.js';
import { ActionType } from '../common/actions.js';
import { softAssertNever } from '../common/reducer-helpers.js';
import type { AccountsState } from './state.js';

/** Pure account-state projection; credential authorization stays host-side. */
export function accountsReducer(state: AccountsState, action: AccountsAction): AccountsState {
  switch (action.type) {
    case ActionType.AccountSet: {
      const idx = state.accounts.findIndex(account => account.id === action.account.id);
      if (idx < 0) {
        return { ...state, accounts: [...state.accounts, action.account] };
      }
      const accounts = state.accounts.slice();
      accounts[idx] = action.account;
      return { ...state, accounts };
    }

    case ActionType.AccountRemoved: {
      const idx = state.accounts.findIndex(account => account.id === action.id);
      if (idx < 0) {
        return state;
      }
      const accounts = state.accounts.slice();
      accounts.splice(idx, 1);
      return { ...state, accounts };
    }

    case ActionType.AuthAttemptSet: {
      const idx = state.attempts.findIndex(attempt => attempt.id === action.attempt.id);
      if (idx < 0) {
        return { ...state, attempts: [...state.attempts, action.attempt] };
      }
      const attempts = state.attempts.slice();
      attempts[idx] = action.attempt;
      return { ...state, attempts };
    }

    case ActionType.AuthAttemptRemoved: {
      const idx = state.attempts.findIndex(attempt => attempt.id === action.id);
      if (idx < 0) {
        return state;
      }
      const attempts = state.attempts.slice();
      attempts.splice(idx, 1);
      return { ...state, attempts };
    }

    default:
      softAssertNever(action);
      return state;
  }
}
