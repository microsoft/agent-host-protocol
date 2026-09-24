/**
 * Chat Channel Notifications — lifecycle routing signals for `ahp-chat:`
 * channels.
 *
 * @module channels-chat/notifications
 */

import type { URI } from '../common/state.js';
import type { MovedChatResource } from './commands.js';

/**
 * Sent on each previous moved chat channel after an atomic `moveChat` commit.
 *
 * Every notification for one move carries the same authoritative resources and
 * exhaustive ordered `movedChats` mapping as {@link MoveChatResult}. The host
 * emits them in `movedChats` order on each old channel whose ownership or URI
 * changed. The move is already atomically committed before the first
 * notification; ordering is only a deterministic delivery aid, not the
 * transaction boundary.
 *
 * A client receiving any one notification MUST apply the complete mapping
 * atomically, stop dispatching to replaced old URIs, subscribe to the
 * authoritative session and chat channels as needed, and reconcile from their
 * snapshots. Duplicate notifications for the same mapping are idempotent.
 * Durable hierarchy and catalog truth remain in `ChatState.parentChat` and the
 * affected sessions' catalogs; this routing handoff is not replayed.
 *
 * @category Protocol Notifications
 * @method chat/moved
 * @direction Server → Client
 * @messageType Notification
 * @version 1
 */
export interface ChatMovedParams {
  /** Previous channel receiving this notification; names one `movedChats[].previousChat`. */
  channel: URI;
  /** Owning session URI before the move. */
  previousSession: URI;
  /** Requested root chat URI before the move. */
  previousChat: URI;
  /** Authoritative owning session URI after the move. */
  session: URI;
  /** Authoritative requested root chat URI after the move. */
  chat: URI;
  /**
   * Exhaustive ordered mapping for the complete moved subtree.
   *
   * Identical in every `chat/moved` notification for this move and in the
   * corresponding {@link MoveChatResult}.
   */
  movedChats: MovedChatResource[];
}
