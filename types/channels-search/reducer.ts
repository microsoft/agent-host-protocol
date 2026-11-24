/**
 * Search Channel Reducer — Pure reducer for `SearchState`.
 *
 * @module channels-search/reducer
 */

import { ActionType } from '../common/actions.js';
import { SearchLifecycleStatus, type SearchState } from './state.js';
import type { SearchAction } from '../action-origin.generated.js';
import { softAssertNever } from '../common/reducer-helpers.js';

/**
 * Pure reducer for search state. Handles every {@link SearchAction} variant.
 */
export function searchReducer(state: SearchState, action: SearchAction, log?: (msg: string) => void): SearchState {
  switch (action.type) {
    case ActionType.SearchQueryChanged:
      return { ...state, query: action.query, lifecycle: { status: SearchLifecycleStatus.Pending } };

    case ActionType.SearchResultsChanged:
      if (!action.replace) {
        return { ...state, results: [...state.results, ...action.results] };
      }
      return {
        ...state,
        results: action.results,
        lifecycle: state.lifecycle.status === SearchLifecycleStatus.Pending ? { status: SearchLifecycleStatus.Running } : state.lifecycle,
      };

    case ActionType.SearchLifecycleChanged:
      return { ...state, lifecycle: action.lifecycle };

    default:
      softAssertNever(action, log);
      return state;
  }
}
