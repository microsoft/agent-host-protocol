/**
 * Search Channel State Types — Per-search state exposed on `ahp-search:`
 * channels.
 *
 * Stability: 1.0 - Early development
 *
 * @module channels-search/state
 */

import type { ErrorInfo, TextRange, URI } from '../common/state.js';

// ─── Capability ──────────────────────────────────────────────────────────────

/**
 * Present when the host supports `createSearch`.
 *
 * @category Search Types
 * @stability 1.0
 * @see {@link /specification/search-channel | Search Channel}
 */
export interface SearchCapability {
  /**
   * The target kinds the host can search. A client MUST NOT send a
   * {@link SearchTarget} whose kind is not listed here.
   */
  targets: SearchTargetKind[];
}

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * What a search looks for and where.
 *
 * The client sends a query in `createSearch` and replaces it with
 * {@link SearchQueryChangedAction | `search/queryChanged`}.
 *
 * @category Search Types
 * @stability 1.0
 * @preserveUnknownMembers
 */
export interface SearchQuery {
  /**
   * The text to search for. Its meaning depends on the target: see
   * {@link SearchTarget}. An empty `text` matches nothing; the host completes
   * the search with no results.
   */
  text: string;
  /** Match case. Defaults to `false`. */
  matchCase?: boolean;
  /** Match only whole words. Defaults to `false`. */
  wholeWord?: boolean;
  /** Treat `text` as a regular expression. Defaults to `false`. */
  isRegex?: boolean;
  /** Where to search. MUST contain at least one target. */
  targets: SearchTarget[];
  /**
   * The maximum number of results. The host MAY apply a lower limit, and
   * completes the search with {@link SearchCompletionReason.LimitReached}
   * when it reaches the limit that applies.
   * @integer
   * @minimum 1
   */
  maxResults?: number;
}

/**
 * Discriminant for {@link SearchTarget}.
 *
 * @category Search Types
 * @stability 1.0
 * @nonexhaustive
 */
export const enum SearchTargetKind {
  /** File paths. */
  FileNames = 'fileNames',
  /** The text content of files. */
  FileText = 'fileText',
  /** Session titles. */
  Sessions = 'sessions',
  /** The text of chat requests and responses. */
  ChatMessages = 'chatMessages',
}

/**
 * Shared fields for file search targets.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface FileSearchTargetBase {
  /** The folders to search. MUST contain at least one URI. */
  roots: URI[];
  /** Glob patterns relative to a root. When present, only matching files are searched. */
  includes?: string[];
  /** Glob patterns relative to a root. Matching files are not searched. */
  excludes?: string[];
  /**
   * Also search files that the host's ignore rules, such as `.gitignore`
   * files, would otherwise skip. Defaults to `false`. `excludes` still apply.
   */
  includeIgnored?: boolean;
}

/**
 * Searches file paths under {@link FileSearchTargetBase.roots}.
 *
 * The host decides how to match {@link SearchQuery.text} against file paths,
 * for example with fuzzy matching, and which query options apply. Results
 * are {@link FileNameSearchResult}s.
 *
 * @category Search Types
 * @stability 1.0
 * @preserveUnknownMembers
 */
export interface FileNamesSearchTarget extends FileSearchTargetBase {
  kind: SearchTargetKind.FileNames;
}

/**
 * Searches the text content of files under {@link FileSearchTargetBase.roots}.
 * Results are {@link FileTextSearchResult}s.
 *
 * @category Search Types
 * @stability 1.0
 * @preserveUnknownMembers
 */
export interface FileTextSearchTarget extends FileSearchTargetBase {
  kind: SearchTargetKind.FileText;
}

/**
 * Searches the titles of the host's sessions, the same sessions that
 * `listSessions` returns. Results are {@link SessionSearchResult}s.
 *
 * @category Search Types
 * @stability 1.0
 * @preserveUnknownMembers
 */
export interface SessionsSearchTarget {
  kind: SearchTargetKind.Sessions;
}

/**
 * Searches the visible text of chat requests and responses, including turns
 * that are not loaded in the chat's state. Results are
 * {@link ChatMessageSearchResult}s.
 *
 * @category Search Types
 * @stability 1.0
 * @preserveUnknownMembers
 */
export interface ChatMessagesSearchTarget {
  kind: SearchTargetKind.ChatMessages;
  /** The chats to search. MUST contain at least one chat URI. */
  chats: URI[];
}

/**
 * One place to search.
 *
 * @category Search Types
 * @stability 1.0
 */
export type SearchTarget =
  | FileNamesSearchTarget
  | FileTextSearchTarget
  | SessionsSearchTarget
  | ChatMessagesSearchTarget;

// ─── Results ─────────────────────────────────────────────────────────────────

/**
 * A matched span within {@link SearchMatch.text}: the half-open interval
 * `[rangeStart, rangeEnd)` of character offsets, measured in UTF-16 code
 * units, as in {@link CompletionItem.rangeStart}.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchHighlight {
  /**
   * The start of the span.
   * @integer
   * @minimum 0
   */
  rangeStart: number;
  /**
   * The end of the span, exclusive. MUST be greater than {@link rangeStart}
   * and at most the length of {@link SearchMatch.text}.
   * @integer
   * @minimum 1
   */
  rangeEnd: number;
}

/**
 * The matched text of a result, with the matched spans highlighted. The host
 * chooses how much text around the match to include.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchMatch {
  /** The text to display. */
  text: string;
  /** The matched spans, in order. Spans MUST NOT overlap. */
  highlights: SearchHighlight[];
}

/**
 * Discriminant for {@link SearchResult}.
 *
 * @category Search Types
 * @stability 1.0
 * @nonexhaustive
 */
export const enum SearchResultKind {
  FileName = 'fileName',
  FileText = 'fileText',
  Session = 'session',
  ChatMessage = 'chatMessage',
}

/**
 * Shared fields for search results. Each result is one match.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchResultBase {
  /** The resource that contains the match. */
  resource: URI;
  /** The text to display, with the matched spans highlighted. */
  match: SearchMatch;
  /**
   * How well the result matches; higher is better. Scores have no fixed
   * range, and are comparable across all results of one search. Clients
   * SHOULD show results in descending score order. A host that does not rank
   * results omits the score.
   * @format float
   */
  score?: number;
}

/**
 * A file whose path matches. {@link SearchResultBase.resource} is the file;
 * the match text is its path, usually relative to the root that contains it.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface FileNameSearchResult extends SearchResultBase {
  kind: SearchResultKind.FileName;
}

/**
 * A match in the text of a file. {@link SearchResultBase.resource} is the
 * file; the match text is the text around the match, usually its line.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface FileTextSearchResult extends SearchResultBase {
  kind: SearchResultKind.FileText;
  /** The location of the match in the file. */
  range: TextRange;
}

/**
 * A session whose title matches. {@link SearchResultBase.resource} is the
 * session URI.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SessionSearchResult extends SearchResultBase {
  kind: SearchResultKind.Session;
  /** The session's title. */
  title: string;
}

/**
 * A match in a chat request or response. {@link SearchResultBase.resource}
 * is the chat URI.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface ChatMessageSearchResult extends SearchResultBase {
  kind: SearchResultKind.ChatMessage;
  /** The chat's title. */
  title: string;
  /** The ID of the turn that contains the match. */
  turnId: string;
}

/**
 * One search match.
 *
 * @category Search Types
 * @stability 1.0
 */
export type SearchResult =
  | FileNameSearchResult
  | FileTextSearchResult
  | SessionSearchResult
  | ChatMessageSearchResult;

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a search.
 *
 * @category Search Types
 * @stability 1.0
 * @nonexhaustive
 */
export const enum SearchLifecycleStatus {
  /**
   * The query changed and the host has not replaced the results yet.
   * {@link SearchState.results} belong to the previous query.
   */
  Pending = 'pending',
  /** The host is searching. */
  Running = 'running',
  /** The host found every result for the query. */
  Completed = 'completed',
  /** The search failed. */
  Failed = 'failed',
}

/**
 * Why a search completed.
 *
 * @category Search Types
 * @stability 1.0
 * @nonexhaustive
 */
export const enum SearchCompletionReason {
  /** The host searched every target. */
  Exhausted = 'exhausted',
  /** The host stopped at the result limit. More results may exist. */
  LimitReached = 'limitReached',
}

/**
 * The query changed and the host has not replaced the results yet. Clients
 * MAY show the previous query's results differently, for example dimmed.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchPendingLifecycleState {
  status: SearchLifecycleStatus.Pending;
}

/**
 * The host is searching and may add more results.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchRunningLifecycleState {
  status: SearchLifecycleStatus.Running;
}

/**
 * The host found every result for the query. A host that watches the
 * searched files, sessions, or chats MAY still change the results later.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchCompletedLifecycleState {
  status: SearchLifecycleStatus.Completed;
  /** Why the search completed. */
  reason: SearchCompletionReason;
}

/**
 * The search failed. Results found before the failure remain in
 * {@link SearchState.results}.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchFailedLifecycleState {
  status: SearchLifecycleStatus.Failed;
  /** Why the search failed, for example an invalid regular expression. */
  error: ErrorInfo;
}

/**
 * Discriminated lifecycle of a search.
 *
 * @category Search Types
 * @stability 1.0
 */
export type SearchLifecycleState =
  | SearchPendingLifecycleState
  | SearchRunningLifecycleState
  | SearchCompletedLifecycleState
  | SearchFailedLifecycleState;

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * Full state for one search, returned when a client subscribes to its
 * `ahp-search:` URI.
 *
 * @category Search Types
 * @stability 1.0
 */
export interface SearchState {
  /** The current query. */
  query: SearchQuery;
  /**
   * Results in the order the host found them. Sort by
   * {@link SearchResultBase.score} to rank them. While {@link lifecycle} is
   * {@link SearchLifecycleStatus.Pending | pending}, these are results for the
   * previous query.
   */
  results: SearchResult[];
  /** Where the search is in its lifecycle. */
  lifecycle: SearchLifecycleState;
}
