/**
 * TCP Channel Actions — Ordered bytes, cumulative credit, and stream lifetime.
 *
 * @module channels-tcp/actions
 */

import { ActionType } from '../common/actions.js';
import type { TcpResetReason } from './state.js';

/**
 * Client bytes. Never apply optimistically to the authoritative reducer.
 * Write to the destination only when accepted input.receivedBytes advances.
 * @category TCP Actions
 * @clientDispatchable
 */
export interface TcpInputAction {
  type: ActionType.TcpInput;
  /**
   * Absolute decoded-byte offset.
   * @integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  offset: number;
  /** Nonempty canonical padded RFC 4648 base64; no whitespace. */
  data: string;
}

/**
 * Host bytes. Deliver once, only when output.receivedBytes advances.
 * @category TCP Actions
 */
export interface TcpDataAction {
  type: ActionType.TcpData;
  /**
   * Absolute decoded-byte offset.
   * @integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  offset: number;
  /** Nonempty canonical padded RFC 4648 base64; no whitespace. */
  data: string;
}

/**
 * Cumulative input bytes released from the host's bounded write buffer.
 * Not an acknowledgment that the destination application processed the bytes.
 * @category TCP Actions
 */
export interface TcpInputConsumedAction {
  type: ActionType.TcpInputConsumed;
  /**
   * @integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  consumedBytes: number;
}

/**
 * Cumulative output bytes released by the client's bounded stream consumer.
 * @category TCP Actions
 * @clientDispatchable
 */
export interface TcpDataConsumedAction {
  type: ActionType.TcpDataConsumed;
  /**
   * @integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  consumedBytes: number;
}

/**
 * Half-close client input after all preceding input bytes have been written.
 * @category TCP Actions
 * @clientDispatchable
 */
export interface TcpInputEofAction {
  type: ActionType.TcpInputEof;
  /**
   * @integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  finalOffset: number;
}

/**
 * Half-close host output after all preceding output bytes have been delivered.
 * @category TCP Actions
 */
export interface TcpDataEofAction {
  type: ActionType.TcpDataEof;
  /**
   * @integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  finalOffset: number;
}

/**
 * Client's final close. Respond with hostClose if not already sent.
 * @category TCP Actions
 * @clientDispatchable
 */
export interface TcpClientCloseAction {
  type: ActionType.TcpClientClose;
}

/**
 * Host's final close. Respond with clientClose if not already sent.
 * @category TCP Actions
 */
export interface TcpHostCloseAction {
  type: ActionType.TcpHostClose;
}

/**
 * Abort both directions and discard buffered payload.
 * @category TCP Actions
 * @clientDispatchable
 */
export interface TcpClientResetAction {
  type: ActionType.TcpClientReset;
  reason: TcpResetReason;
}

/**
 * Abort both directions and discard buffered payload.
 * @category TCP Actions
 */
export interface TcpHostResetAction {
  type: ActionType.TcpHostReset;
  reason: TcpResetReason;
}
