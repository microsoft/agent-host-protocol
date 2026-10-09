/**
 * TCP Creation — Client-owned creation of a private forwarding stream.
 *
 * @module channels-tcp/commands
 */

import type { URI } from '../common/state.js';
import type { BaseParams } from '../common/commands.js';

/**
 * Creates one outbound connection on the host's network, without subscribing.
 * The channel is the client-chosen TCP URI. The client then uses ordinary
 * subscribe to negotiate shared flow control. The host MUST NOT deliver AHP
 * data before that subscription and MUST bound pre-subscription buffering and
 * the lifetime of abandoned connections. Transport loss closes the connection;
 * resuming it through reconnect is not supported.
 *
 * Requires InitializeResult.tcpConnections. Hosts advertising support MUST reject
 * malformed targets and return AlreadyExists when the connection URI is already
 * allocated. Repeating creation MUST NOT replace an existing socket.
 *
 * @category TCP Commands
 * @method createTcpConnection
 * @direction Client → Server
 * @messageType Request
 * @version 1
 * @stability 1.0
 */
export interface CreateTcpConnectionParams extends BaseParams {
  /** Client-chosen private connection URI, e.g. ahp-tcp:/<uuid>. */
  channel: URI;
  /** DNS name or IP literal, resolved on the host's network. Not a URL. */
  host: string;
  /**
   * Destination port.
   * @integer
   * @minimum 1
   * @maximum 65535
   */
  port: number;
}
