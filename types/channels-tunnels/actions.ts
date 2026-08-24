/**
 * Tunnels Channel Actions — mutations of the `ahp-tunnels://` state.
 *
 * @module channels-tunnels/actions
 */

import { ActionType } from '../common/actions.js';
import type { URI } from '../common/state.js';
import type {
  TunnelsState,
  TunnelPort,
  TunnelPortClient,
  TunnelPortClientState,
} from './state.js';

/**
 * Add or replace one port-forward entry.
 *
 * Existing entries are matched by {@link TunnelPort.resource} and replaced in
 * place. A previously unseen resource is appended. Clients and the host may
 * both dispatch this action; the host validates client assignments, addresses,
 * attribution, and authorization before broadcasting it in server order.
 *
 * @category Tunnel Actions
 * @version 1
 * @clientDispatchable
 */
export interface TunnelPortSetAction {
  type: ActionType.TunnelPortSet;
  /** Full new or replacement port-forward state. */
  port: TunnelPort;
}

/**
 * Add or replace one participating client on a port forward.
 *
 * For `hostToClient`, clients are matched by `clientId`, appended when absent,
 * and replaced in place when present. For `clientToHost`, this replaces the
 * single responsible client. The target port's requested mapping is unchanged.
 *
 * @category Tunnel Actions
 * @version 1
 * @clientDispatchable
 */
export interface TunnelPortClientSetAction {
  type: ActionType.TunnelPortClientSet;
  /** Target {@link TunnelPort.resource}. */
  resource: URI;
  /** Full new or replacement participant state. */
  client: TunnelPortClient;
}

/**
 * Update the lifecycle of one client-owned forwarding attempt.
 *
 * The reducer locates the client inside the target port and replaces its
 * `state`. The requested addresses remain unchanged. A client dispatching this
 * action may update only its own participant; the host validates
 * `ActionEnvelope.origin.clientId` before broadcasting it in server order.
 *
 * @category Tunnel Actions
 * @version 1
 * @clientDispatchable
 */
export interface TunnelPortClientUpdatedAction {
  type: ActionType.TunnelPortClientUpdated;
  /** Target {@link TunnelPort.resource}. */
  resource: URI;
  /** Client participant being updated. */
  clientId: string;
  /** New client-owned lifecycle, including confirmed addresses when ready. */
  state: TunnelPortClientState;
}

/**
 * Remove one participating client from a `hostToClient` port forward.
 *
 * A `clientToHost` port requires exactly one client, so this action is a no-op
 * for that direction; remove the complete port with
 * {@link TunnelPortRemovedAction | `tunnel/portRemoved`} instead. Removing an
 * unknown port or client is a no-op.
 *
 * @category Tunnel Actions
 * @version 1
 * @clientDispatchable
 */
export interface TunnelPortClientRemovedAction {
  type: ActionType.TunnelPortClientRemoved;
  /** Target {@link TunnelPort.resource}. */
  resource: URI;
  /** Participant to remove. */
  clientId: string;
}

/**
 * Remove one port-forward entry from the tunnels state.
 *
 * Clients and the host may dispatch this action. The host validates
 * authorization and coordinates cleanup with every assigned client. Removing
 * an unknown resource is a no-op.
 *
 * @category Tunnel Actions
 * @version 1
 * @clientDispatchable
 */
export interface TunnelPortRemovedAction {
  type: ActionType.TunnelPortRemoved;
  /** {@link TunnelPort.resource} to remove. */
  resource: URI;
}

/** State owned by this action family. */
export type TunnelActionState = TunnelsState;
