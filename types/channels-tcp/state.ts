/**
 * TCP Channel Types — Private `ahp-tcp:/<id>` forwarding on the host's network.
 *
 * Stability: 1.0 - Early development
 *
 * @module channels-tcp/state
 */

/**
 * Presence enables createTcpConnection followed by ordinary windowed subscribe.
 * TCP channels use shared subscription flow control, not reduced resource state.
 * Base64 is the fixed payload encoding; socket buffering and destination policy
 * are local implementation concerns.
 * Connections end when their creating AHP transport disconnects; this revision
 * does not support resuming TCP channels through reconnect.
 *
 * @category TCP Types
 * @stability 1.0
 */
export interface TcpConnectionsCapability {}
