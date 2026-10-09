/**
 * TCP Notifications — Bidirectional data and end-of-stream messages.
 *
 * @module channels-tcp/notifications
 */

import type { URI } from '../common/state.js';

/**
 * Bytes in the sender's direction: client to destination, or destination to
 * client.
 * Transport failure terminates the stream; TCP messages are not replayed.
 *
 * @category TCP Notifications
 * @method tcp/data
 * @direction Both
 * @messageType Notification
 * @version 1
 * @stability 1.0
 */
export interface TcpDataParams {
  channel: URI;
  /**
   * Nonempty canonical padded RFC 4648 base64, without whitespace.
   * @minLength 1
   */
  data: string;
}

/**
 * Ends the sender's logical direction after its preceding data. The opposite
 * direction can continue.   Local bridges decide when queued bytes have drained
 * and how to end their sink. Sending more data after EOF is a protocol error
 * and resets the channel.
 *
 * @category TCP Notifications
 * @method tcp/eof
 * @direction Both
 * @messageType Notification
 * @version 1
 * @stability 1.0
 */
export interface TcpEofParams {
  channel: URI;
}
