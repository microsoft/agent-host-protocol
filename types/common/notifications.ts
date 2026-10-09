/**
 * Common Notification Types — Authentication and subscription delivery controls.
 *
 * @module common/notifications
 */

import type {
  ProtectedResourceMetadata,
  URI,
  Snapshot,
} from './state.js';

/**
 * Reason why authentication is required.
 *
 * @category Protocol Notifications
 * @nonexhaustive
 */
export const enum AuthRequiredReason {
  /** The client has not yet authenticated for the resource */
  Required = 'required',
  /**
   * A previously valid token has expired or been revoked. The client must
   * acquire or renew the credential rather than replaying the challenged token.
   */
  Expired = 'expired',
}

// ─── auth/required ───────────────────────────────────────────────────────────

/**
 * Sent by the server when a protected resource requires (re-)authentication.
 *
 * This notification MAY be associated with any channel — for example, an
 * agent advertised on the root channel, or a per-session resource. The
 * `channel` field identifies the subscription the auth requirement belongs
 * to; the `resource` field carries the complete OAuth protected resource
 * metadata (per RFC 9728).
 *
 * Clients should obtain or renew the credential and push the resulting token
 * via the `authenticate` command. When `reason` is `expired`, clients MUST NOT
 * blindly replay the challenged token.
 *
 * @category Protocol Notifications
 * @method auth/required
 * @direction Server → Client
 * @messageType Notification
 * @version 1
 * @see {@link /specification/authentication | Authentication}
 * @example
 * ```json
 * {
 *   "jsonrpc": "2.0",
 *   "method": "auth/required",
 *   "params": {
 *     "channel": "ahp-root://",
 *     "resource": {
 *       "resource": "https://api.github.com",
 *       "resource_name": "GitHub API",
 *       "authorization_servers": ["https://github.com/login/oauth"]
 *     },
 *     "reason": "expired"
 *   }
 * }
 * ```
 */
export interface AuthRequiredParams {
  /** Channel URI this notification belongs to */
  channel: URI;
  /** Complete RFC 9728 metadata for the protected resource that requires authentication */
  resource: ProtectedResourceMetadata;
  /** Why authentication is required */
  reason?: AuthRequiredReason;
}

/**
 * Fragment of a serialized typed channel notification. Reassemble before typed
 * decoding or reducer application; data is a string, not another base64 layer.
 * Do not split surrogate pairs. One active data message per direction/subscription;
 * fairly interleave bounded frames across subscriptions and reserve UTF-16 bytes
 * before enqueueing. The ordered transport supplies fragment ordering.
 *
 * Discard incomplete messages on disconnect. Reconcile acceptedBytes, then retry
 * whole unaccepted messages from the retained queue without charging twice.
 * Inner and outer channel URIs MUST match. Delivery controls MUST NOT be framed
 * recursively; payload-bearing action echoes MUST use the bounded data path.
 *
 * @category Protocol Notifications
 * @method channel/frame
 * @stability 1.0
 * @direction Both
 * @messageType Notification
 * @version 1
 */
export interface ChannelFrameParams {
  channel: URI;
  /**
   * Nonempty serialized-JSON fragment.
   * @minLength 1
   */
  data: string;
  /** True completes this logical message; absence/false means more fragments follow. */
  final?: boolean;
}

/**
 * Receiver's cumulative UTF-16 release boundary for the outgoing direction.
 * Duplicate/older positions are harmless. A boundary beyond sent data, within
 * a message, or inconsistent with the journal MUST fail explicitly.
 *
 * Return credit after bounded consumption, not JSON parsing or action echo.
 * TCP returns it after downstream buffer release. Shared release receipts can
 * implement drain() without TCP-specific consumed-credit actions.
 *
 * @category Protocol Notifications
 * @method channel/credit
 * @stability 1.0
 * @direction Both
 * @messageType Notification
 * @version 1
 */
export interface ChannelCreditParams {
  channel: URI;
  /**
   * @integer
   * @minimum 0
   * @maximum 9007199254740991
   */
  consumedBytes: number;
}

/**
 * Bootstrap boundary after snapshot/replay frames and before live delivery.
 * Consumers MUST run during bootstrap, not wait for this signal before reading.
 * Process this signal in subscription order, after preceding complete messages.
 *
 * @category Protocol Notifications
 * @method channel/ready
 * @stability 1.0
 * @direction Server → Client
 * @messageType Notification
 * @version 1
 */
export interface ChannelReadyParams {
  channel: URI;
}

/**
 * Abort incomplete delivery and terminate this subscription. Never skip a fragment
 * and continue. Credit, ready, reset, and liveness bypass data credit with
 * separate size/rate bounds. Stream channels MUST abort their retained stream
 * when delivery cannot continue safely.
 *
 * @category Protocol Notifications
 * @method channel/reset
 * @stability 1.0
 * @direction Both
 * @messageType Notification
 * @version 1
 */
export interface ChannelResetParams {
  channel: URI;
}

/**
 * Typed snapshot payload carried inside windowed channel/frame delivery, never
 * as an unbounded bootstrap result. snapshot.resource MUST equal channel.
 * Not sent on ordinary subscriptions.
 *
 * @category Protocol Notifications
 * @method channel/snapshot
 * @stability 1.0
 * @direction Server → Client
 * @messageType Notification
 * @version 1
 */
export interface ChannelSnapshotParams {
  channel: URI;
  snapshot: Snapshot;
}
