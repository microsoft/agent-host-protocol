/**
 * Generation-checked handle to the underlying single-host {@link AhpClient}.
 *
 * Issued by {@link MultiHostClient.client}. Every dispatch through this
 * handle verifies that the host is still on the generation the handle
 * was minted at; if a reconnect has occurred, dispatching throws
 * {@link HostReconnectedError} instead of silently writing to the new
 * connection. Removing the host marks the handle as shut down and
 * subsequent calls throw {@link HostShutDownError}.
 *
 * @module client/hosts/host-client-handle
 */

import type { CommandMap } from '../../types/common/messages.js';
import type { StateAction } from '../../types/common/actions.js';
import type { URI } from '../../types/common/state.js';
import type { AhpClient, DispatchHandle } from '../client.js';
import type { TcpConnection } from '../tcp-connection.js';
import type { TcpConnectionSubscription } from '../../types/channels-tcp/commands.js';
import {
  HostReconnectedError,
  HostShutDownError,
  type HostId,
} from './types.js';

/**
 * Internal handle reference used by the runtime to mint
 * {@link HostClientHandle}s. The runtime updates `generation`,
 * `currentClient`, and `shutdownReason` as connections come and go;
 * minted handles read them through this shared reference.
 *
 * @internal
 */
export interface HostClientHandleSource {
  readonly hostId: HostId;
  generation: number;
  currentClient: AhpClient | null;
  shutdownReason: null | 'removed' | 'shutdown';
}

/**
 * Generation-checked wrapper around the per-host {@link AhpClient}.
 *
 * Acquired via {@link MultiHostClient.client}. Cheap to clone — the
 * underlying client and shared state are reference-shared.
 */
export class HostClientHandle {
  /** Host this handle was issued for. */
  readonly hostId: HostId;
  /** Generation this handle was minted at. */
  readonly generation: number;

  private readonly source: HostClientHandleSource;
  private readonly client: AhpClient;

  /** @internal */
  constructor(source: HostClientHandleSource, generation: number, client: AhpClient) {
    this.source = source;
    this.hostId = source.hostId;
    this.generation = generation;
    this.client = client;
  }

  /**
   * Validate this handle against the host's current generation and
   * shutdown state. Throws {@link HostShutDownError} or
   * {@link HostReconnectedError} on failure.
   */
  checkAlive(): void {
    if (this.source.shutdownReason !== null) {
      throw new HostShutDownError(this.hostId);
    }
    if (this.source.generation !== this.generation) {
      throw new HostReconnectedError(this.hostId, this.generation, this.source.generation);
    }
  }

  /**
   * Dispatch an action through this connection, refusing if the
   * connection has been replaced by a reconnect or the host has been
   * removed.
   */
  dispatch(channel: URI, action: StateAction, clientSeq?: number): DispatchHandle {
    this.checkAlive();
    return this.client.dispatch(channel, action, clientSeq);
  }

  /** Open an owned byte stream; the host runtime preserves it across replay-capable reconnects. */
  openTcpConnection(session: URI, create: TcpConnectionSubscription): Promise<TcpConnection> {
    this.checkAlive();
    return this.client.openTcpConnection(session, create);
  }

  /**
   * Issue an arbitrary typed JSON-RPC request through this connection,
   * refusing if the connection has been replaced by a reconnect or the
   * host has been removed.
   */
  async request<M extends keyof CommandMap>(
    method: M,
    params: CommandMap[M]['params'],
  ): Promise<CommandMap[M]['result']> {
    this.checkAlive();
    return this.client.request(method, params);
  }

  /**
   * Borrow the underlying {@link AhpClient} for advanced use. The
   * caller is responsible for not holding it past the next reconnect —
   * the returned reference can become stale at any await point.
   */
  rawClient(): AhpClient {
    this.checkAlive();
    return this.client;
  }
}
