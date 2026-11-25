/**
 * Search Channel Actions — Mutations of an `ahp-search:` channel's state.
 *
 * @module channels-search/actions
 */

import { ActionType } from '../common/actions.js';
import type { SearchLifecycleState, SearchQuery, SearchResult } from './state.js';

/**
 * Replaces the search's query and restarts the search.
 *
 * Keeps {@link SearchState.results} and sets {@link SearchState.lifecycle} to
 * {@link SearchLifecycleStatus.Pending | pending}. The old results stay
 * visible until the host replaces them, so the client does not flash an empty
 * list.
 *
 * After the host applies this action, it stops the previous search and drops
 * any of its results that it has not dispatched yet. The host MUST then
 * dispatch {@link SearchResultsChangedAction | `search/resultsChanged`} with
 * `replace: true` before any other search action. The replacement can keep
 * old results that still match the new query, and can be empty. If the new
 * query is not valid,
 * for example because it contains an invalid regular expression, the host
 * replaces the results with an empty list and then changes the lifecycle to
 * {@link SearchLifecycleStatus.Failed | failed}.
 *
 * @category Search Actions
 * @version 1
 * @stability 1.0
 * @clientDispatchable
 */
export interface SearchQueryChangedAction {
  type: ActionType.SearchQueryChanged;
  /** The new query. */
  query: SearchQuery;
}

/**
 * Adds results to {@link SearchState.results}, or replaces them.
 *
 * By default, the reducer appends `results`. Set `replace` to `true` to
 * replace every result instead; if {@link SearchState.lifecycle} is
 * {@link SearchLifecycleStatus.Pending | pending}, a replacement also changes
 * it to {@link SearchLifecycleStatus.Running | running}.
 *
 * The host MUST dispatch a replacement first after a
 * {@link SearchQueryChangedAction | `search/queryChanged`}. It MAY also
 * replace the results at other times, for example to re-rank them, to remove
 * duplicates, or to update a completed search when a watched file changes.
 * The host MUST NOT dispatch an empty `results` list unless `replace` is
 * `true`.
 *
 * @category Search Actions
 * @version 1
 * @stability 1.0
 */
export interface SearchResultsChangedAction {
  type: ActionType.SearchResultsChanged;
  /** The results to append, in the order the host found them, or the replacement results. */
  results: SearchResult[];
  /** When `true`, replaces every result instead of appending. */
  replace?: boolean;
}

/**
 * Replaces {@link SearchState.lifecycle}.
 *
 * The host dispatches this to complete or fail a search, or to move a
 * completed search back to {@link SearchLifecycleStatus.Running | running} when it
 * searches again, for example after a watched file changes. The host MUST NOT
 * change the lifecycle to {@link SearchLifecycleStatus.Pending | pending}; only
 * {@link SearchQueryChangedAction | `search/queryChanged`} does that.
 *
 * @category Search Actions
 * @version 1
 * @stability 1.0
 */
export interface SearchLifecycleChangedAction {
  type: ActionType.SearchLifecycleChanged;
  /** The new lifecycle. */
  lifecycle: SearchLifecycleState;
}
