/**
 * TCP Channel State — Private, session-scoped `ahp-tcp:` connections in the host's network.
 *
 * Stability: 1 - Experimental
 *
 * @module channels-tcp/state
 */

import type { FlowControlledByteDirectionState, URI } from '../common/state.js';

/**
 * Payload encodings advertised by the host.
 * @category TCP Types
 * @nonexhaustive
 */
export const enum TcpDataEncoding {
  Base64 = 'base64',
}

/**
 * Endpoint that closes or resets a connection.
 * @category TCP Types
 * @exhaustive
 */
export const enum TcpEndpoint {
  Client = 'client',
  Host = 'host',
}

/**
 * Why a connection was aborted.
 * @category TCP Types
 * @nonexhaustive
 */
export const enum TcpResetReason {
  ConnectionReset = 'connectionReset',
  ConnectionAborted = 'connectionAborted',
  ProtocolError = 'protocolError',
  ReplayUnavailable = 'replayUnavailable',
  PolicyRevoked = 'policyRevoked',
  SessionDisposed = 'sessionDisposed',
  InternalError = 'internalError',
}

/**
 * Host support for private, session-scoped TCP channels.
 * Presence on initialize is required before using subscribe.create.
 * @category TCP Types
 */
export interface TcpConnectionsCapability {
  /** Supported encodings. The base64 profile MUST be supported. */
  encodings: TcpDataEncoding[];
  /**
   * Informational limit; runtime policy may impose a lower limit.
   * @integer
   * @minimum 1
   * @maximum 9007199254740991
   */
  maximumConnectionsPerClient?: number;
}

/** @category TCP Types */
export interface TcpTarget {
  /** DNS name or IP literal, resolved and connected in the host endpoint's network. */
  host: string;
  /**
   * Destination port.
   * @integer
   * @minimum 1
   * @maximum 65535
   */
  port: number;
}

/** @category TCP Types */
export interface TcpResetState {
  source: TcpEndpoint;
  reason: TcpResetReason;
}

/**
 * Expected connection establishment failures.
 * @category TCP Types
 * @nonexhaustive
 */
export const enum TcpConnectionOpenFailureReason {
  ConnectionFailed = 'connectionFailed',
  NameResolutionFailed = 'nameResolutionFailed',
  ResourceShortage = 'resourceShortage',
  SessionNotReady = 'sessionNotReady',
}

/**
 * Required detail for TcpConnectionOpenFailed (-32012).
 * Policy denial and malformed requests use PermissionDenied and InvalidParams.
 * @category TCP Types
 */
export interface TcpConnectionOpenErrorData {
  reason: TcpConnectionOpenFailureReason;
  retryable?: boolean;
}

/**
 * State of one host-assigned `ahp-tcp:` channel.
 *
 * Payload is never stored in this state. Only the creating authenticated
 * logical client may observe or dispatch to the channel. Reconnect requires
 * the original sockets, local stream state, and complete action replay;
 * a snapshot cannot restore this channel.
 *
 * Close flags record the two-sided handshake. Either flag means closing;
 * both mean closed. A present reset terminates the connection immediately,
 * independently of the close history.
 *
 * @category TCP Types
 */
export interface TcpConnectionState {
  session: URI;
  target: TcpTarget;
  encoding: TcpDataEncoding;
  /** Client to destination socket. */
  input: FlowControlledByteDirectionState;
  /** Destination socket to client. */
  output: FlowControlledByteDirectionState;
  clientClosed: boolean;
  hostClosed: boolean;
  reset?: TcpResetState;
}
