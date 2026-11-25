/**
 * Search Channel Commands — `createSearch`.
 *
 * @module channels-search/commands
 */

import type { URI } from '../common/state.js';
import type { BaseParams } from '../common/commands.js';
import type { SearchQuery } from './state.js';

/**
 * Starts a search on the host.
 *
 * The client chooses the channel URI and then subscribes to it to receive the
 * search's {@link SearchState} and its results. The client replaces the query
 * by dispatching {@link SearchQueryChangedAction | `search/queryChanged`},
 * and cancels the search by unsubscribing.
 *
 * The client MUST NOT send this command unless `InitializeResult.search` is
 * present, and MUST NOT include a target whose kind is not listed in
 * {@link SearchCapability.targets}.
 *
 * @category Search Commands
 * @method createSearch
 * @direction Client → Server
 * @messageType Request
 * @version 1
 * @stability 1.0
 * @throws `InvalidParams` (`-32602`) if the query is not valid, for example because a target kind is not supported or a regular expression is invalid.
 * @throws `PermissionDenied` (`-32009`) if the client is not permitted to search a root or chat.
 * @throws `AlreadyExists` (`-32010`) if the channel URI is already in use.
 * @see {@link /specification/search-channel | Search Channel}
 * @example
 * ```jsonc
 * // Client → Server
 * { "jsonrpc": "2.0", "id": 40, "method": "createSearch",
 *   "params": {
 *     "channel": "ahp-search:/5f0c…",
 *     "query": {
 *       "text": "parseConfig",
 *       "targets": [
 *         { "kind": "fileText", "roots": ["file:///workspace"] },
 *         { "kind": "chatMessages", "chats": ["ahp-chat:/c1"] }
 *       ]
 *     }
 *   } }
 *
 * // Server → Client
 * { "jsonrpc": "2.0", "id": 40, "result": {} }
 * ```
 */
export interface CreateSearchParams extends BaseParams {
  /** The client-chosen URI for the new channel, for example `ahp-search:/<uuid>`. */
  channel: URI;
  /** What to search for and where. */
  query: SearchQuery;
}

/**
 * Result of the `createSearch` command.
 *
 * An empty object on success.
 *
 * @category Search Commands
 * @stability 1.0
 */
export interface CreateSearchResult {}
