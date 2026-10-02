/**
 * TCP Channel Creation — Atomic creation via `subscribe`.
 *
 * @module channels-tcp/commands
 */

import type { TcpDataEncoding } from './state.js';

/**
 * Creates and exclusively subscribes to one TCP connection.
 *
 * SubscribeParams.channel MUST identify the parent `ahp-session:` channel.
 * The host returns the new `ahp-tcp:` URI in snapshot.resource, not the parent.
 * It installs the subscription and sends the response before any TCP actions.
 * Unknown creation kinds MUST be rejected, never treated as normal subscribe.
 *
 * @category TCP Commands
 */
export interface TcpConnectionSubscription {
  type: 'tcpConnection';
  /** DNS name or IP literal, not a URL. */
  host: string;
  /**
   * Destination port.
   * @integer
   * @minimum 1
   * @maximum 65535
   */
  port: number;
  /** Selected from InitializeResult.tcpConnections.encodings. */
  encoding: TcpDataEncoding;
  /**
   * Client receive window in decoded bytes.
   * @integer
   * @minimum 1
   * @maximum 4294967295
   */
  receiveWindowBytes: number;
  /**
   * Maximum decoded bytes per output action; MUST NOT exceed receiveWindowBytes.
   * @integer
   * @minimum 1
   * @maximum 4294967295
   */
  maximumChunkSize: number;
}
