/**
 * TCP Channel Types — Private `ahp-tcp:` channels that forward a TCP connection
 * on the host's network.
 *
 * Stability: 1.0 - Early development
 *
 * @module channels-tcp/state
 */

/**
 * Present when the host supports `createTcpConnection`.
 *
 * A client creates a connection with `createTcpConnection`, then subscribes to
 * its channel with windowed delivery. A TCP channel's state is an
 * {@link EmptyState}; its data is sent in `tcp/data` and `tcp/eof`
 * notifications. TCP connections do not survive the loss of the AHP connection.
 *
 * @category TCP Types
 * @stability 1.0
 * @see {@link /specification/tcp-channel | TCP Channel}
 */
export interface TcpConnectionsCapability {}
