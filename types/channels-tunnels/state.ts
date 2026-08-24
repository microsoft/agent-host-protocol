/**
 * Tunnels Channel State Types for `ahp-tunnels://`.
 *
 * The channel coordinates port-forwarding requests and their client-owned
 * lifecycle. How a client establishes a forward is outside AHP.
 * Stability: 1 - Experimental
 *
 * @module channels-tunnels/state
 */

import type { ErrorInfo, URI } from '../common/state.js';

/**
 * Capabilities advertised by a host that exposes tunnel coordination.
 *
 * Presence means the host maintains the authoritative state at
 * {@link TunnelingCapabilities.channel}. It does not imply that the host can
 * establish a particular kind of forwarding itself.
 *
 * @category Tunnel State
 */
export interface TunnelingCapabilities {
  /** The host-owned tunnels channel. */
  channel: 'ahp-tunnels://';
}

/**
 * Port-forwarding directions a client can establish.
 *
 * Each field is a presence capability: an empty object means supported and
 * absence means unsupported.
 *
 * @category Tunnel State
 */
export interface ClientTunnelingCapabilities {
  /** Make a host-side service reachable at a client-side listening address. */
  hostToClient?: Record<string, never>;
  /** Make a client-side service reachable at a host-side listening address. */
  clientToHost?: Record<string, never>;
}

/**
 * Direction of one coordinated port forward.
 *
 * `AtoB` means a service reachable from A is exposed through a listening
 * address on B. It does not describe byte flow, which is bidirectional.
 *
 * @category Tunnel State
 * @nonexhaustive
 */
export const enum TunnelPortDirectionKind {
  /** A host-side service is exposed through one or more client-side listeners. */
  HostToClient = 'hostToClient',
  /** A client-side service is exposed through a host-side listener. */
  ClientToHost = 'clientToHost',
}

/**
 * One TCP address used by a port forward.
 *
 * @category Tunnel State
 */
export interface TunnelAddress {
  /** Host name or numeric IP address meaningful from the side that owns it. */
  host: string;
  /**
   * TCP port. A requested local address MAY use `0` to ask the forwarding
   * implementation to allocate an available port; a ready forward MUST report
   * the effective non-zero port.
   */
  port: number;
}

/**
 * Lifecycle status of a client-owned forwarding attempt.
 *
 * @category Tunnel State
 * @nonexhaustive
 */
export const enum TunnelPortClientStatus {
  /** The client has not yet accepted or declined the forwarding request. */
  Pending = 'pending',
  /** The client accepted the request and is establishing the forward. */
  Accepted = 'accepted',
  /** The client reports that the forward is active. */
  Ready = 'ready',
  /** The client explicitly declined the request. */
  Declined = 'declined',
  /** The client accepted the request but failed to establish the forward. */
  Failed = 'failed',
  /** The assigned client is disconnected or no longer capable of forwarding. */
  Unavailable = 'unavailable',
}

/** @category Tunnel State */
export interface TunnelPortPendingState {
  status: TunnelPortClientStatus.Pending;
}

/** @category Tunnel State */
export interface TunnelPortAcceptedState {
  status: TunnelPortClientStatus.Accepted;
}

/** @category Tunnel State */
export interface TunnelPortReadyState {
  status: TunnelPortClientStatus.Ready;
  /** Effective listening endpoint after the forwarding mechanism is active. */
  localAddress: TunnelAddress;
  /** Effective target endpoint after the forwarding mechanism is active. */
  remoteAddress: TunnelAddress;
}

/** @category Tunnel State */
export interface TunnelPortDeclinedState {
  status: TunnelPortClientStatus.Declined;
  /** Optional human-readable explanation. */
  reason?: string;
}

/** @category Tunnel State */
export interface TunnelPortFailedState {
  status: TunnelPortClientStatus.Failed;
  /** Failure reported by the client-owned forwarding implementation. */
  error: ErrorInfo;
}

/** @category Tunnel State */
export interface TunnelPortUnavailableState {
  status: TunnelPortClientStatus.Unavailable;
  /** Optional human-readable explanation. */
  reason?: string;
}

/**
 * Lifecycle of one client-owned forwarding attempt.
 *
 * @category Tunnel State
 */
export type TunnelPortClientState =
  | TunnelPortPendingState
  | TunnelPortAcceptedState
  | TunnelPortReadyState
  | TunnelPortDeclinedState
  | TunnelPortFailedState
  | TunnelPortUnavailableState;

/**
 * One client responsible for establishing a port forward.
 *
 * The requested mapping lives on the parent {@link TunnelPort}; every client
 * assigned to a `hostToClient` entry attempts the same mapping. Once active,
 * {@link TunnelPortReadyState} carries this client's confirmed effective
 * addresses, including any port allocated from a request for port `0`.
 *
 * @category Tunnel State
 */
export interface TunnelPortClient {
  /** Matches the `clientId` supplied during `initialize`. */
  clientId: string;
  /** Current client-owned lifecycle. */
  state: TunnelPortClientState;
}

/**
 * Actor that originally requested a port forward.
 *
 * @category Tunnel State
 * @nonexhaustive
 */
export const enum TunnelPortRequesterKind {
  Host = 'host',
  Client = 'client',
}

/** @category Tunnel State */
export interface TunnelPortHostRequester {
  kind: TunnelPortRequesterKind.Host;
}

/** @category Tunnel State */
export interface TunnelPortClientRequester {
  kind: TunnelPortRequesterKind.Client;
  /** Client that requested the forward. */
  clientId: string;
}

/**
 * Durable attribution for a port-forwarding request.
 *
 * @category Tunnel State
 */
export type TunnelPortRequester =
  | TunnelPortHostRequester
  | TunnelPortClientRequester;

/**
 * Common authoritative fields for every port-forward entry.
 *
 * @category Tunnel State
 */
export interface TunnelPortBase {
  /**
   * Stable `ahp-tunnel:/<id>` resource identifier.
   *
   * Entries are not independently subscribable in this version, but the
   * `ahp-tunnel:` scheme is reserved for future protocol use. Consumers MUST
   * treat the URI as opaque.
   */
  resource: URI;
  /**
   * Desired listening endpoint of the forward.
   *
   * This request is shared by every assigned client. It is not proof that the
   * address was established; each client's ready state reports its effective
   * listener independently.
   */
  requestedLocalAddress: TunnelAddress;
  /**
   * Desired target service endpoint of the forward.
   *
   * This request is shared by every assigned client. The effective target is
   * reported by each client's ready state.
   */
  requestedRemoteAddress: TunnelAddress;
  /** Optional human-readable name, such as `"Development server"`. */
  title?: string;
  /**
   * Optional application protocol hint, such as `"http"`, `"https"`, or
   * `"postgresql"`. Forwarding remains byte-transparent.
   */
  protocol?: string;
  /** Actor that originally requested this forward. */
  requestedBy: TunnelPortRequester;
  /** Creation timestamp in ISO 8601 format. */
  createdAt: string;
  /** Opaque implementation-defined metadata. */
  _meta?: Record<string, unknown>;
}

/**
 * A host-side service exposed through one or more client-side listeners.
 *
 * Every client independently accepts and establishes its own mapping, so each
 * has separate addresses and lifecycle state.
 *
 * @category Tunnel State
 */
export interface HostToClientTunnelPort extends TunnelPortBase {
  direction: TunnelPortDirectionKind.HostToClient;
  /** Clients invited to establish this forward. */
  clients: TunnelPortClient[];
}

/**
 * A client-side service exposed through a host-side listener.
 *
 * Exactly one client owns the forwarding operation.
 *
 * @category Tunnel State
 */
export interface ClientToHostTunnelPort extends TunnelPortBase {
  direction: TunnelPortDirectionKind.ClientToHost;
  /** Client responsible for establishing this forward. */
  client: TunnelPortClient;
}

/**
 * One authoritative port-forward entry in the tunnels state.
 *
 * @category Tunnel State
 */
export type TunnelPort =
  | HostToClientTunnelPort
  | ClientToHostTunnelPort;

/**
 * Authoritative state exposed on the `ahp-tunnels://` channel.
 *
 * Clients establish the actual forwards through implementation-defined
 * facilities. The host only sequences, validates, snapshots, and replays this
 * coordination state.
 *
 * @category Tunnel State
 */
export interface TunnelsState {
  /** Full port-forward entries keyed by `resource`. */
  ports: TunnelPort[];
  /** Opaque host-defined state metadata. */
  _meta?: Record<string, unknown>;
}
