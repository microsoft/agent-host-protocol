/**
 * TCP reference reducer. Socket side effects and origin/ownership checks belong
 * to the adapter, not this pure state machine.
 *
 * @module channels-tcp/reducer
 */

import { ActionType } from '../common/actions.js';
import type { FlowControlledByteDirectionState } from '../common/state.js';
import type { TcpAction } from '../action-origin.generated.js';
import { softAssertNever } from '../common/reducer-helpers.js';
import { TcpEndpoint, type TcpConnectionState } from './state.js';

function requireTcp(condition: boolean, message: string): void {
  if (!condition) {throw new Error(`Invalid TCP action: ${message}`);}
}

function requireOffset(value: number): void {
  requireTcp(Number.isSafeInteger(value) && value >= 0, 'offset must be a nonnegative safe integer');
}

function payloadLength(data: string, maximumChunkSize: number): number {
  requireTcp(data.length > 0 && data.length <= 4 * Math.ceil(maximumChunkSize / 3), 'chunk size');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  requireTcp(data.length % 4 === 0 && !/[^A-Za-z0-9+/]/.test(data.slice(0, data.length - padding)), 'base64 encoding');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (padding > 0) {
    const last = alphabet.indexOf(data[data.length - padding - 1]);
    requireTcp(last % (padding === 2 ? 16 : 4) === 0, 'noncanonical base64 padding bits');
  }
  const length = data.length / 4 * 3 - padding;
  requireTcp(length <= maximumChunkSize, 'chunk size');
  return length;
}

function receive(
  direction: FlowControlledByteDirectionState,
  offset: number,
  data: string,
  senderClosed: boolean,
): FlowControlledByteDirectionState {
  requireOffset(offset);
  const end = offset + payloadLength(data, direction.maximumChunkSize);
  requireOffset(end);
  if (end <= direction.receivedBytes) {return direction;}
  requireTcp(offset === direction.receivedBytes, 'gap or overlapping byte range');
  requireTcp(!senderClosed && direction.eofAtBytes === undefined, 'data after EOF or sender close');
  requireTcp(end - direction.consumedBytes <= direction.windowBytes, 'receive window exceeded');
  return { ...direction, receivedBytes: end };
}

function consume(direction: FlowControlledByteDirectionState, consumedBytes: number): FlowControlledByteDirectionState {
  requireOffset(consumedBytes);
  requireTcp(consumedBytes <= direction.receivedBytes, 'consuming bytes not received');
  if (consumedBytes <= direction.consumedBytes) {return direction;}
  return { ...direction, consumedBytes };
}

function eof(direction: FlowControlledByteDirectionState, finalOffset: number, senderClosed: boolean): FlowControlledByteDirectionState {
  requireOffset(finalOffset);
  requireTcp(finalOffset === direction.receivedBytes, 'EOF offset');
  if (direction.eofAtBytes === finalOffset) {return direction;}
  requireTcp(!senderClosed, 'EOF after sender close');
  return { ...direction, eofAtBytes: finalOffset };
}

/**
 * Apply an accepted TCP action, retaining no payload.
 *
 * Invalid data, offsets, credit, or ordering throw before any state mutation.
 * Adapters MUST catch this at the channel boundary, reset with protocolError,
 * and close the socket; they MUST NOT continue or perform the rejected write.
 * Duplicate ranges and stale cumulative credit are no-ops. Socket adapters
 * must compare the relevant direction's receivedBytes before/after reducing
 * and perform a write only when that counter advances.
 */
export function tcpReducer(state: TcpConnectionState, action: TcpAction, log?: (msg: string) => void): TcpConnectionState {
  if (state.reset) {return state;}
  let input = state.input;
  let output = state.output;
  switch (action.type) {
    case ActionType.TcpInput:
      input = receive(input, action.offset, action.data, state.clientClosed);
      break;
    case ActionType.TcpData:
      output = receive(output, action.offset, action.data, state.hostClosed);
      break;
    case ActionType.TcpInputConsumed:
      input = consume(input, action.consumedBytes);
      break;
    case ActionType.TcpDataConsumed:
      output = consume(output, action.consumedBytes);
      break;
    case ActionType.TcpInputEof:
      input = eof(input, action.finalOffset, state.clientClosed);
      break;
    case ActionType.TcpDataEof:
      output = eof(output, action.finalOffset, state.hostClosed);
      break;
    case ActionType.TcpClientClose:
      return state.clientClosed ? state : { ...state, clientClosed: true };
    case ActionType.TcpHostClose:
      return state.hostClosed ? state : { ...state, hostClosed: true };
    case ActionType.TcpClientReset:
      return { ...state, reset: { source: TcpEndpoint.Client, reason: action.reason } };
    case ActionType.TcpHostReset:
      return { ...state, reset: { source: TcpEndpoint.Host, reason: action.reason } };
    default:
      softAssertNever(action, log);
      return state;
  }
  return input === state.input && output === state.output ? state : { ...state, input, output };
}
